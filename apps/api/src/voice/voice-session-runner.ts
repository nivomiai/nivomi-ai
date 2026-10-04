import type { CallOutcome } from '@nivomi/database';
import type { ComplianceObligations } from '../compliance/compliance-engine.js';
import type { AgentDefinition } from '../agents/agent-definition.js';
import {
  ConversationEngine,
  type ConversationOutcome,
  type ConversationState,
  type EngineResult,
  type Utterance,
} from '../agents/conversation-engine.js';
import type { LLMProvider } from '../agents/llm-provider.js';
import type { STTProvider, SttStream } from './stt-provider.js';
import type { TTSProvider, TtsStream } from './tts-provider.js';

/**
 * Live voice session (ADR-023, Phase 4b): bridges a telephony call to the agent's conversation
 * engine. STT delivers caller turns, the engine chooses the reply, TTS streams audio back.
 *
 * CR-10 obligations (AI disclosure, recording notice) are spoken by the engine itself in
 * {@link ConversationEngine.start} via `openingLines()`, so the runner refuses to start when the
 * current compliance decision needs a recording notice the agent isn't configured to speak. That
 * check is already enforced by the eligibility engine's pre-launch pass; it's duplicated here as
 * a last-line defence against a drifted agent version.
 *
 * The runner is transport-agnostic: in production the voice worker (Exotel adapter) pumps RTP
 * frames into {@link pushAudio}. Tests feed text through `SimulatedSTTProvider` to exercise the
 * same code path end to end.
 */

export interface VoiceSessionOptions {
  readonly definition: AgentDefinition;
  readonly obligations: ComplianceObligations | null;
  readonly languageHint?: string;
  /**
   * The persisted Agent Version id, carried through to the TTS request for Phase 8 metering.
   * The campaign runner passes it from `campaigns.pinned_agent_version_id`; absent in isolated
   * unit tests.
   */
  readonly agentVersionId?: string;
  /** How many empty-caller-turn ticks before we treat silence as hang-up. */
  readonly silenceTurnsBeforeHangup?: number;
}

export interface VoiceSessionResult {
  /** Coarse telephony outcome; feeds {@link CallOutcomeService.apply}. */
  readonly outcome: CallOutcome;
  /**
   * Richer conversation disposition for persistence on the planned `call_transcripts` row.
   * Null when the call closed before the engine committed to one (hangup during silence, etc.).
   */
  readonly conversationOutcome: ConversationOutcome | null;
  readonly transcript: readonly Utterance[];
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
}

export interface VoiceSession {
  start(): Promise<void>;
  pushAudio(chunk: Uint8Array, sampleRateHz: number): Promise<void>;
  endCallerTurn(): Promise<void>;
  close(reason: 'hangup' | 'provider_failure' | 'emergency_stop'): Promise<VoiceSessionResult>;
  readonly agentAudio: AsyncIterable<Uint8Array>;
}

const DEFAULT_SILENCE_TURNS = 2;

export class VoiceSessionRunner implements VoiceSession {
  private readonly engine: ConversationEngine;
  private readonly definition: AgentDefinition;
  private readonly obligations: ComplianceObligations | null;
  private readonly languageHint: string | undefined;
  private readonly silenceLimit: number;
  private readonly outAudio: AudioQueue = new AudioQueue();
  private readonly transcript: Utterance[] = [];
  private readonly agentVersionId: string | undefined;
  private state: ConversationState | null = null;
  private usage = { inputTokens: 0, outputTokens: 0 };
  private sttStream: SttStream | null = null;
  private currentTts: TtsStream | null = null;
  private sttLanguage: string | undefined;
  private emptyRunLength = 0;
  private started = false;
  private closed = false;

  constructor(
    options: VoiceSessionOptions,
    llm: LLMProvider,
    private readonly stt: STTProvider,
    private readonly tts: TTSProvider,
  ) {
    this.engine = new ConversationEngine(options.definition, llm);
    this.definition = options.definition;
    this.obligations = options.obligations;
    this.languageHint = options.languageHint;
    this.sttLanguage = options.languageHint;
    this.agentVersionId = options.agentVersionId;
    this.silenceLimit = options.silenceTurnsBeforeHangup ?? DEFAULT_SILENCE_TURNS;
  }

  get agentAudio(): AsyncIterable<Uint8Array> {
    return this.outAudio;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.assertObligationsSatisfied();
    const first = await this.engine.start();
    await this.applyResult(first);
    this.openSttStream();
  }

  private assertObligationsSatisfied(): void {
    if (!this.obligations) return;
    if (this.obligations.recordingNotice && !this.definition.recordingEnabled) {
      throw new Error(
        'voice session refused to start: compliance requires a recording notice but the agent is not configured to speak one',
      );
    }
    // The AI disclosure is baked into every agent's opener (prompt-compiler.openingLines); no
    // agent-definition flag disables it. The platform guardrails prevent the LLM from denying it.
  }

  async pushAudio(chunk: Uint8Array, sampleRateHz: number): Promise<void> {
    if (this.closed || !this.sttStream) return;
    await this.sttStream.push({
      audio: chunk,
      sampleRateHz,
      ...(this.languageHint ? { languageHint: this.languageHint } : {}),
    });
  }

  async endCallerTurn(): Promise<void> {
    if (this.closed || !this.sttStream || !this.state) return;
    const stream = this.sttStream;
    this.sttStream = null;
    await stream.end();
    const final = await readFinal(stream);
    if (final.languageDetected) this.sttLanguage = final.languageDetected;
    const callerText = final.text.trim();
    if (!callerText) {
      this.emptyRunLength += 1;
      if (this.emptyRunLength >= this.silenceLimit) {
        await this.close('hangup');
        return;
      }
      this.openSttStream();
      return;
    }
    this.emptyRunLength = 0;
    this.transcript.push({ role: 'caller', text: callerText });
    const result = await this.engine.reply(this.state, callerText, this.transcript);
    await this.applyResult(result);
    if (!this.closed) this.openSttStream();
  }

  async close(
    reason: 'hangup' | 'provider_failure' | 'emergency_stop',
  ): Promise<VoiceSessionResult> {
    if (this.closed) return this.buildResult(reason);
    this.closed = true;
    if (this.currentTts) {
      await this.currentTts.cancel();
      this.currentTts = null;
    }
    if (this.sttStream) {
      await this.sttStream.cancel();
      this.sttStream = null;
    }
    this.outAudio.close();
    return this.buildResult(reason);
  }

  private buildResult(
    reason: 'hangup' | 'provider_failure' | 'emergency_stop',
  ): VoiceSessionResult {
    return {
      outcome: this.outcomeAtClose(reason),
      conversationOutcome: this.state?.outcome ?? null,
      transcript: this.transcript,
      usage: this.usage,
    };
  }

  private async applyResult(result: EngineResult): Promise<void> {
    this.state = result.state;
    this.usage = {
      inputTokens: this.usage.inputTokens + result.usage.inputTokens,
      outputTokens: this.usage.outputTokens + result.usage.outputTokens,
    };
    for (const utterance of result.utterances) {
      if (utterance.role !== 'agent') continue;
      this.transcript.push(utterance);
      await this.speak(utterance.text);
      if (this.closed) return;
    }
    if (result.state.ended) await this.close('hangup');
  }

  private async speak(text: string): Promise<void> {
    const stream = this.tts.speak({
      text,
      ...(this.sttLanguage ? { language: this.sttLanguage } : {}),
      ...(this.agentVersionId ? { agentVersionId: this.agentVersionId } : {}),
    });
    this.currentTts = stream;
    try {
      for await (const chunk of stream.events) {
        if (this.closed) return;
        this.outAudio.push(chunk.audio);
      }
    } finally {
      if (this.currentTts === stream) this.currentTts = null;
    }
  }

  private openSttStream(): void {
    if (this.closed) return;
    this.sttStream = this.stt.openStream(
      this.sttLanguage ? { languageHint: this.sttLanguage } : {},
    );
  }

  /**
   * Maps the engine's rich {@link ConversationOutcome} to the telephony {@link CallOutcome} enum.
   * CallOutcome currently has fewer buckets; INTERESTED / CALLBACK_REQUESTED / COMPLETED /
   * TRANSFERRED / INCOMPLETE all collapse to CONNECTED (the dial reached a human). The richer
   * per-call outcome lands on the planned `call_transcripts` row (TECH_DEBT: call-outcome
   * granularity, Phase 4b exit → Phase 5 scope).
   */
  private outcomeAtClose(reason: 'hangup' | 'provider_failure' | 'emergency_stop'): CallOutcome {
    if (reason === 'provider_failure') return 'PROVIDER_ERROR';
    const engineOutcome = this.state?.outcome ?? null;
    if (engineOutcome === 'OPTED_OUT') return 'OPTED_OUT';
    if (engineOutcome === 'NOT_INTERESTED') return 'NOT_INTERESTED';
    return 'CONNECTED';
  }
}

async function readFinal(stream: SttStream): Promise<{ text: string; languageDetected?: string }> {
  for await (const event of stream.events) {
    if (event.kind === 'final') {
      return event.languageDetected
        ? { text: event.text, languageDetected: event.languageDetected }
        : { text: event.text };
    }
  }
  return { text: '' };
}

class AudioQueue implements AsyncIterable<Uint8Array> {
  private readonly queue: Uint8Array[] = [];
  private resolveNext: ((v: IteratorResult<Uint8Array>) => void) | null = null;
  private done = false;

  push(chunk: Uint8Array): void {
    if (this.done) return;
    if (this.resolveNext) {
      const r = this.resolveNext;
      this.resolveNext = null;
      r({ value: chunk, done: false });
      return;
    }
    this.queue.push(chunk);
  }

  close(): void {
    this.done = true;
    if (this.resolveNext) {
      this.resolveNext({ value: undefined, done: true });
      this.resolveNext = null;
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: (): Promise<IteratorResult<Uint8Array>> => {
        const chunk = this.queue.shift();
        if (chunk) return Promise.resolve({ value: chunk, done: false });
        if (this.done) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => {
          this.resolveNext = resolve;
        });
      },
    };
  }
}
