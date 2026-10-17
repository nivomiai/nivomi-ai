import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { callSessions, type Database } from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import { Clock } from '../compliance/clock.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';
import type { AiTurnDecision, AiEndDecision, TurnCallbackContext } from './inbound-decision.js';
import { SARVAM_PROVIDER, SarvamProvider, type ChatMessage } from './sarvam-provider.js';

/** Max agent↔caller exchanges (counting the opening greeting as turn 0). */
const MAX_TURNS = 10;
/** How many silent (STT returned empty text) replies we tolerate before ending the call. */
const MAX_CONSECUTIVE_SILENT_TURNS = 2;
/** Trailing transcript entries we hand to the LLM. Keeps prompt size and latency bounded. */
const CONTEXT_WINDOW_TURNS = 16;
/** Default upper bound per caller utterance (seconds). */
const RECORD_MAX_SECONDS = 20;
/** Silence that ends the caller turn. */
const RECORD_SILENCE_SECONDS = 2;
/** Hard timeout for fetching the recording so a stuck Exotel URL cannot block the webhook. */
const RECORDING_FETCH_TIMEOUT_MS = 10_000;

export interface AiTurnPlan {
  readonly decision: AiTurnDecision | AiEndDecision;
}

export interface AiGreetingInput {
  readonly callSid: string;
  readonly organizationName: string;
}

/**
 * Turn-based conversational AI runner (ADR-024, Exotel free-plan path). On the greeting webhook we
 * speak an opener and record the caller; on each turn webhook we fetch the recording, transcribe
 * it (Sarvam STT), run the LLM (Sarvam chat) with the running transcript, append both roles to
 * `call_sessions.transcript`, and return the next `<Say>` + `<Record>` ExoML.
 *
 * The streaming adapter (ADR-023) replaces this once Exotel's `<Stream>` is available on the
 * tenant plan.
 */
@Injectable()
export class AiConversationService {
  private readonly logger = new Logger(AiConversationService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly clock: Clock,
    @Optional() @Inject(SARVAM_PROVIDER) private readonly sarvam: SarvamProvider | null,
  ) {}

  /** True when a Sarvam key is configured. Callers that need AI should check this first. */
  isAvailable(): boolean {
    return this.sarvam !== null;
  }

  /** First turn (turn 0): speak the opener, record the caller's reply. */
  openingDecision(input: AiGreetingInput): AiTurnDecision {
    const prompt =
      `Hi, this is the ${input.organizationName} AI assistant. ` +
      `How can I help you today? After the tone, speak clearly and I'll reply.`;
    return {
      action: 'ai_turn',
      prompt,
      voice: 'female',
      continueActionUrl: this.continueUrlFor(input.callSid, 1),
      finishOnSilenceSeconds: RECORD_SILENCE_SECONDS,
      maxRecordSeconds: RECORD_MAX_SECONDS,
    };
  }

  /** The link Exotel is told to POST the next recording to. */
  continueUrlFor(callSid: string, turnIndex: number): string {
    const params = new URLSearchParams({ callSid, turn: String(turnIndex) });
    return `${this.env.API_PUBLIC_URL}/api/v1/webhooks/exotel/inbound/turn?${params.toString()}`;
  }

  /**
   * One turn: fetch the recording Exotel just captured, run STT + LLM, persist the transcript,
   * return the next decision. The service is idempotent per `turnIndex`: a replayed webhook with
   * the same index does not append duplicate rows (we check the length of the stored transcript).
   */
  async handleTurn(context: TurnCallbackContext): Promise<AiTurnPlan> {
    if (!this.sarvam) {
      // Should never happen in production (env validation + handleInbound branch), but belt it.
      return { decision: this.endDecision('The AI assistant is unavailable right now.') };
    }

    const session = await this.loadSession(context.providerCallSid);
    if (!session) {
      this.logger.warn(
        {
          event: 'voice.turn.session_not_found',
          callSid: context.providerCallSid,
          turnIndex: context.turnIndex,
        },
        'Turn callback arrived for a call we have no greeting row for.',
      );
      return { decision: this.endDecision('We lost the call context. Please call back.') };
    }

    // Each turn adds [caller, agent] to the transcript. Turn N (1-indexed) therefore sits at
    // indices [(N-1)*2, (N-1)*2 + 1].
    const expectedCallerAt = (context.turnIndex - 1) * 2;
    const expectedAgentAt = expectedCallerAt + 1;

    // Idempotency: a replayed webhook (same `turn`) finds a stored agent reply and surfaces it
    // without re-running STT/LLM.
    if (session.transcript.length > expectedAgentAt) {
      const agentTurn = session.transcript[expectedAgentAt];
      if (agentTurn && agentTurn.role === 'agent') {
        return { decision: this.turnDecision(context, agentTurn.text) };
      }
    }

    const callerText = await this.transcribeTurn(context);
    const callerEntry = {
      role: 'caller' as const,
      text: callerText.transcript,
      atMs: Date.now() - session.startedAt.getTime(),
    };

    const workingTranscript = [...session.transcript];
    if (workingTranscript.length === expectedCallerAt) {
      workingTranscript.push(callerEntry);
    } else {
      // Out-of-order turn: pad with empties so index arithmetic stays stable.
      while (workingTranscript.length < expectedCallerAt) {
        workingTranscript.push({ role: 'agent', text: '', atMs: 0 });
      }
      workingTranscript.push(callerEntry);
    }

    const silentStreak = countTrailingSilence(workingTranscript);
    const atMaxTurns = context.turnIndex >= MAX_TURNS;
    const sayGoodbye = silentStreak >= MAX_CONSECUTIVE_SILENT_TURNS || atMaxTurns;

    let agentReply: string;
    let inputTokens = 0;
    let outputTokens = 0;
    if (sayGoodbye) {
      agentReply = atMaxTurns
        ? 'That was helpful. If you need more, call back any time. Goodbye.'
        : "I couldn't hear you clearly. Please call back when you're ready. Goodbye.";
    } else if (callerText.transcript.length === 0) {
      // One silent turn: canned reprompt, no LLM. Cheaper, snappier, and lets a brief glitch
      // (background noise, caller fumbling) resolve without burning tokens.
      agentReply = "Sorry, I didn't catch that. Could you say it again?";
    } else {
      try {
        const result = await this.sarvam.chat(this.buildMessages(workingTranscript));
        agentReply = result.text;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
      } catch (error) {
        this.logger.warn(
          {
            event: 'voice.turn.llm_failed',
            callSid: context.providerCallSid,
            error: error instanceof Error ? error.message : String(error),
          },
          'LLM reply failed; ending the call with a graceful farewell.',
        );
        agentReply = "Sorry, I'm having trouble answering right now. Please call back later.";
      }
    }

    workingTranscript.push({
      role: 'agent',
      text: agentReply,
      atMs: Date.now() - session.startedAt.getTime(),
    });

    await this.persistTurn({
      callSid: context.providerCallSid,
      transcript: workingTranscript,
      inputTokensDelta: inputTokens,
      outputTokensDelta: outputTokens,
      audioSecondsDelta: context.recordingDurationSeconds ?? 0,
    });

    this.logger.log(
      {
        event: 'voice.turn.handled',
        callSid: context.providerCallSid,
        turnIndex: context.turnIndex,
        callerChars: callerText.transcript.length,
        agentChars: agentReply.length,
        language: callerText.languageCode,
      },
      'Processed one conversational turn.',
    );

    if (sayGoodbye) {
      return { decision: this.endDecision(agentReply) };
    }
    return { decision: this.turnDecision(context, agentReply) };
  }

  private async transcribeTurn(
    context: TurnCallbackContext,
  ): Promise<{ transcript: string; languageCode: string | null }> {
    if (!context.recordingUrl) return { transcript: '', languageCode: null };
    try {
      const audio = await this.fetchRecording(context.recordingUrl);
      const result = await this.sarvam!.transcribe(audio.buffer, audio.mimeType, undefined);
      return { transcript: result.transcript.trim(), languageCode: result.languageCode };
    } catch (error) {
      this.logger.warn(
        {
          event: 'voice.turn.stt_failed',
          callSid: context.providerCallSid,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to transcribe caller turn; treating as silence.',
      );
      return { transcript: '', languageCode: null };
    }
  }

  /**
   * Download the recording Exotel wrote for this turn. Exotel-hosted recordings require HTTP Basic
   * auth with the account's API credentials; some trial accounts return the file without auth.
   * We send credentials when available and fall through if the recording is already public.
   */
  private async fetchRecording(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RECORDING_FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {};
      if (this.env.EXOTEL_API_KEY && this.env.EXOTEL_API_TOKEN) {
        const token = Buffer.from(
          `${this.env.EXOTEL_API_KEY}:${this.env.EXOTEL_API_TOKEN}`,
        ).toString('base64');
        headers.authorization = `Basic ${token}`;
      }
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) {
        throw new Error(`recording fetch returned ${response.status}`);
      }
      const mimeType =
        response.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/mpeg';
      const buffer = Buffer.from(await response.arrayBuffer());
      return { buffer, mimeType };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildMessages(
    transcript: ReadonlyArray<{ role: 'agent' | 'caller'; text: string }>,
  ): ChatMessage[] {
    const trimmed = transcript.slice(-CONTEXT_WINDOW_TURNS);
    const history: ChatMessage[] = trimmed
      .filter((entry) => entry.text.length > 0)
      .map((entry) => ({
        role: entry.role === 'caller' ? 'user' : 'assistant',
        content: entry.text,
      }));
    return [{ role: 'system', content: systemPrompt() }, ...history];
  }

  private turnDecision(context: TurnCallbackContext, reply: string): AiTurnDecision {
    return {
      action: 'ai_turn',
      prompt: reply,
      voice: 'female',
      continueActionUrl: this.continueUrlFor(context.providerCallSid, context.turnIndex + 1),
      finishOnSilenceSeconds: RECORD_SILENCE_SECONDS,
      maxRecordSeconds: RECORD_MAX_SECONDS,
    };
  }

  private endDecision(prompt: string): AiEndDecision {
    return { action: 'ai_end', prompt, voice: 'female' };
  }

  private async loadSession(callSid: string): Promise<{
    startedAt: Date;
    transcript: ReadonlyArray<{ role: 'agent' | 'caller'; text: string; atMs?: number }>;
  } | null> {
    const [row] = await this.db
      .select({ startedAt: callSessions.startedAt, transcript: callSessions.transcript })
      .from(callSessions)
      .where(and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, callSid)));
    return row ?? null;
  }

  private async persistTurn(input: {
    callSid: string;
    transcript: ReadonlyArray<{ role: 'agent' | 'caller'; text: string; atMs?: number }>;
    inputTokensDelta: number;
    outputTokensDelta: number;
    audioSecondsDelta: number;
  }): Promise<void> {
    const [row] = await this.db
      .select({ usage: callSessions.usage })
      .from(callSessions)
      .where(
        and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, input.callSid)),
      );
    const prior = row?.usage ?? { inputTokens: 0, outputTokens: 0, audioSeconds: 0 };
    await this.db
      .update(callSessions)
      .set({
        transcript: input.transcript,
        usage: {
          inputTokens: prior.inputTokens + input.inputTokensDelta,
          outputTokens: prior.outputTokens + input.outputTokensDelta,
          audioSeconds: Number((prior.audioSeconds + input.audioSecondsDelta).toFixed(2)),
        },
      })
      .where(
        and(eq(callSessions.provider, 'exotel'), eq(callSessions.providerCallId, input.callSid)),
      );
  }

  /** Clock surface so tests can set a fixed instant for latency measurements. */
  now(): Date {
    return this.clock.now();
  }
}

function countTrailingSilence(
  transcript: ReadonlyArray<{ role: 'agent' | 'caller'; text: string }>,
): number {
  let streak = 0;
  for (let i = transcript.length - 1; i >= 0; i -= 1) {
    const entry = transcript[i];
    if (!entry || entry.role !== 'caller') continue;
    if (entry.text.length === 0) streak += 1;
    else break;
  }
  return streak;
}

function systemPrompt(): string {
  return [
    'You are the AI phone assistant for an Indian business, helping callers over a live phone call.',
    'The caller may ask about anything — the business, general questions, or small talk.',
    'Speak like a real person on a phone call: contractions, short sentences, no bullet points, no markdown, no emojis.',
    'Keep every reply under 40 spoken words. One idea per reply.',
    'If asked something you clearly cannot know (private company data you have no context on), say so briefly and ask what they would like to know instead.',
    'If the caller says goodbye, bye, thanks that is all, or asks you to end the call, say a short goodbye.',
    "Never invent facts, numbers, prices or policies. If you don't know, say so.",
  ].join(' ');
}
