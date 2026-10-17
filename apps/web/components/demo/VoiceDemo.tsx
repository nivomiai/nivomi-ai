'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { ThemeToggle } from '@/components/marketing/ThemeToggle';
import { Icon, Logo } from '@/components/marketing/primitives';
import { Select } from '@/components/app/Select';
import { cx } from '@/lib/site/cx';

interface DemoConfig {
  readonly sttReady: boolean;
  readonly ttsReady: boolean;
  readonly llmReady: boolean;
  readonly languages: readonly { readonly code: string; readonly label: string }[];
  readonly speakers: readonly string[];
  readonly defaultLanguage: string;
  readonly defaultSpeaker: string;
}

interface Turn {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type Stage = 'off' | 'listening' | 'capturing' | 'transcribing' | 'thinking' | 'speaking';

const STAGE_LABELS: Record<Stage, string> = {
  off: 'Press start to begin the conversation',
  listening: 'Listening — just start talking',
  capturing: 'I’m hearing you…',
  transcribing: 'Transcribing…',
  thinking: 'Thinking…',
  speaking: 'Agent is speaking',
};

/** Voice-activity thresholds. Tuned for close-mic laptop audio in a quiet room. */
const SPEECH_THRESHOLD = 0.035;
const SILENCE_THRESHOLD = 0.02;
const SILENCE_HOLD_MS = 900;
const SPEECH_START_MS = 150;
const MIN_UTTERANCE_MS = 400;
const MAX_UTTERANCE_MS = 15_000;

export function VoiceDemo() {
  const [config, setConfig] = useState<DemoConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>('en-IN');
  const [speaker, setSpeaker] = useState<string>('anushka');
  const [stage, setStage] = useState<Stage>('off');
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<number>(0);
  const [replySource, setReplySource] = useState<'llm' | 'stub' | null>(null);

  // Mutable refs — persist across renders without re-rendering on every change.
  const stageRef = useRef<Stage>('off');
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const historyRef = useRef<ChatMessage[]>([]);
  const languageRef = useRef<string>(language);
  const speakerRef = useRef<string>(speaker);
  const vadLoudSinceRef = useRef<number | null>(null);
  const vadQuietSinceRef = useRef<number | null>(null);
  const utteranceStartRef = useRef<number>(0);

  const commitStage = useCallback((next: Stage) => {
    stageRef.current = next;
    setStage(next);
  }, []);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  useEffect(() => {
    speakerRef.current = speaker;
  }, [speaker]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/v1/demo/config', { credentials: 'omit' });
        if (!response.ok) throw new Error(`Config request failed (${response.status})`);
        const data = (await response.json()) as DemoConfig;
        if (cancelled) return;
        setConfig(data);
        setLanguage(data.defaultLanguage);
        setSpeaker(data.defaultSpeaker);
      } catch (err) {
        if (!cancelled) {
          setConfigError(err instanceof Error ? err.message : 'Could not reach the API.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stopEverything = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    vadLoudSinceRef.current = null;
    vadQuietSinceRef.current = null;
    utteranceStartRef.current = 0;
    const ctx = audioContextRef.current;
    if (ctx) {
      void ctx.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    const el = audioElRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    setLevel(0);
  }, []);

  // Clean up on unmount.
  useEffect(() => {
    return () => stopEverything();
  }, [stopEverything]);

  const endConversation = useCallback(() => {
    stopEverything();
    commitStage('off');
  }, [commitStage, stopEverything]);

  const beginConversation = useCallback(async () => {
    if (stageRef.current !== 'off') return;
    setError(null);
    setReplySource(null);
    historyRef.current = [];
    setTurns([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      type AudioContextCtor = typeof AudioContext;
      const Ctor: AudioContextCtor | undefined =
        (window as unknown as { AudioContext?: AudioContextCtor }).AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio is not supported in this browser.');
      const ctx = new Ctor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      commitStage('listening');
      startVadLoop({
        analyserRef,
        streamRef,
        stageRef,
        recorderRef,
        chunksRef,
        rafRef,
        vadLoudSinceRef,
        vadQuietSinceRef,
        utteranceStartRef,
        setLevel,
        commitStage,
        onUtterance: (blob, mimeType) => {
          void handleUtterance({
            blob,
            mimeType,
            languageRef,
            speakerRef,
            configRef: { current: config },
            audioElRef,
            historyRef,
            commitStage,
            stageRef,
            setTurns,
            setReplySource,
            setError,
          });
        },
      });
    } catch (err) {
      stopEverything();
      commitStage('off');
      setError(describeMicError(err));
    }
  }, [commitStage, config, stopEverything]);

  const providerLabel = useMemo(() => {
    if (!config) return 'Checking providers…';
    const parts: string[] = [];
    parts.push(config.sttReady ? 'Sarvam STT' : 'Stubbed STT');
    parts.push(config.llmReady ? 'Sarvam LLM' : 'Stub LLM');
    parts.push(config.ttsReady ? 'Sarvam TTS' : 'Browser TTS');
    return parts.join(' · ');
  }, [config]);

  const languages = config?.languages ?? [];
  const speakers = config?.speakers ?? [];
  const sarvamTtsReady = config?.ttsReady ?? false;
  const inCall = stage !== 'off';

  return (
    <div className="min-h-dvh bg-soft">
      <header className="sticky top-0 z-20 border-b border-line bg-[var(--nv-header)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="Nivomi AI home" className="flex items-center">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-muted sm:inline">
              Live browser demo
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:py-14">
        <section className="grid gap-6">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-accent uppercase">
              Live voice demo
            </p>
            <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Talk to Nivomi
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] text-muted">
              Start the call, then just talk. The agent listens for a pause, replies, and keeps the
              conversation going — no buttons to hold. English and five Indian languages.
            </p>
          </div>

          <div className="card-nv relative grid gap-7 rounded-[24px] border border-line bg-card p-8 shadow-md sm:p-10">
            <ConversationIndicator stage={stage} level={level} />
            <div className="grid gap-3">
              <p
                role="status"
                aria-live="polite"
                className="text-center text-sm font-semibold tracking-wide text-ink-2"
              >
                {STAGE_LABELS[stage]}
              </p>
              <div className="mx-auto flex items-center gap-3">
                {inCall ? (
                  <button
                    type="button"
                    onClick={endConversation}
                    className="btn btn-secondary"
                    aria-label="End conversation"
                  >
                    End conversation
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void beginConversation()}
                    className="btn btn-primary"
                  >
                    Start conversation
                  </button>
                )}
              </div>
            </div>
            {error ? (
              <p className="rounded-[12px] bg-warn-soft px-4 py-3 text-sm text-warn" role="alert">
                {error}
              </p>
            ) : null}
            {configError ? (
              <p className="rounded-[12px] bg-warn-soft px-4 py-3 text-sm text-warn" role="alert">
                Could not load demo config: {configError}
              </p>
            ) : null}
          </div>

          <TranscriptView turns={turns} source={replySource} />
        </section>

        <aside className="grid gap-5 self-start">
          <div className="card-nv rounded-[20px] border border-line bg-card p-6">
            <h2 className="font-brand text-lg font-bold text-ink">Agent setup</h2>
            <p className="mt-1 text-sm text-muted">
              Choose the language and voice before you start.
            </p>

            <div className="mt-5 grid gap-4">
              <LabeledSelect
                id="demo-language"
                label="Language"
                value={language}
                onChange={setLanguage}
                options={languages.map((item) => ({ value: item.code, label: item.label }))}
                disabled={languages.length === 0 || inCall}
                {...(inCall ? { hint: 'Finish the current call to change the language.' } : {})}
              />
              <LabeledSelect
                id="demo-speaker"
                label="Voice"
                value={speaker}
                onChange={setSpeaker}
                options={speakers.map((item) => ({ value: item, label: capitalize(item) }))}
                disabled={!sarvamTtsReady || inCall}
                {...(sarvamTtsReady
                  ? {}
                  : { hint: 'Sarvam key not set — using the browser voice.' })}
              />
            </div>
          </div>

          <div className="rounded-[20px] border border-line bg-soft/50 p-5 text-sm">
            <p className="font-semibold text-ink">Provider</p>
            <p className="mt-1 text-muted">{providerLabel}</p>
            <ul className="mt-3 grid gap-1.5 text-[13px] text-muted">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                Audio is captured in the browser, transcribed server-side; API keys stay off the
                client.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                Open mic with voice-activity detection: start talking, pause, the agent replies.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                Headphones recommended so the mic doesn’t pick up the agent’s voice.
              </li>
            </ul>
          </div>
        </aside>
      </main>
      <audio ref={audioElRef} className="hidden" preload="auto" />
    </div>
  );
}

function ConversationIndicator({
  stage,
  level,
}: {
  readonly stage: Stage;
  readonly level: number;
}) {
  const liveStage = stage !== 'off';
  const scale = 1 + Math.min(level, 1) * 0.6;
  const colour = {
    off: 'bg-muted/50',
    listening: 'bg-accent',
    capturing: 'bg-accent',
    transcribing: 'bg-accent/80',
    thinking: 'bg-accent/70',
    speaking: 'bg-live',
  }[stage];
  return (
    <div className="relative mx-auto grid h-36 w-36 place-items-center">
      {stage === 'capturing' ? (
        <span
          aria-hidden="true"
          style={{ transform: `scale(${scale})` }}
          className="absolute size-36 rounded-full bg-accent/15 transition-transform duration-75 ease-out"
        />
      ) : null}
      {stage === 'speaking' ? (
        <span
          aria-hidden="true"
          className="absolute size-36 animate-ping rounded-full bg-live/15"
        />
      ) : null}
      {stage === 'thinking' || stage === 'transcribing' ? (
        <span
          aria-hidden="true"
          className="absolute size-28 animate-pulse rounded-full bg-accent/15"
        />
      ) : null}
      <span
        className={cx(
          'relative grid size-24 place-items-center rounded-full text-white shadow-pink transition-colors',
          colour,
          liveStage ? 'opacity-100' : 'opacity-80',
        )}
      >
        <Icon name={stage === 'speaking' ? 'i-chat' : 'i-mic'} className="size-9" />
      </span>
    </div>
  );
}

function TranscriptView({
  turns,
  source,
}: {
  readonly turns: readonly Turn[];
  readonly source: 'llm' | 'stub' | null;
}) {
  if (turns.length === 0) {
    return (
      <div className="card-nv rounded-[20px] border border-dashed border-line bg-soft/40 p-8 text-center text-sm text-muted">
        Your conversation will appear here. Try “What languages do you support?”
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {turns.map((turn) => (
        <div
          key={turn.id}
          className={cx(
            'rounded-[16px] border px-5 py-4',
            turn.role === 'user'
              ? 'border-line bg-card'
              : 'border-accent/20 bg-accent-soft/70 text-ink',
          )}
        >
          <p className="text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
            {turn.role === 'user' ? 'You' : 'Nivomi agent'}
          </p>
          <p className="mt-1 text-[15px] leading-relaxed text-ink">{turn.text}</p>
        </div>
      ))}
      {source === 'stub' ? (
        <p className="text-center text-[12.5px] text-muted">
          Last reply came from the stub (Sarvam chat was unavailable).
        </p>
      ) : null}
    </div>
  );
}

function LabeledSelect({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
  hint,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly disabled?: boolean;
  readonly hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold tracking-[0.12em] text-muted uppercase">
        {label}
      </label>
      <Select
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled || options.length === 0}
        className="py-2.5 text-[14.5px] font-medium"
      />
      {hint ? <p className="mt-1.5 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

// ─── VAD loop ─────────────────────────────────────────────────────────────

interface VadDeps {
  readonly analyserRef: MutableRefObject<AnalyserNode | null>;
  readonly streamRef: MutableRefObject<MediaStream | null>;
  readonly stageRef: MutableRefObject<Stage>;
  readonly recorderRef: MutableRefObject<MediaRecorder | null>;
  readonly chunksRef: MutableRefObject<Blob[]>;
  readonly rafRef: MutableRefObject<number | null>;
  readonly vadLoudSinceRef: MutableRefObject<number | null>;
  readonly vadQuietSinceRef: MutableRefObject<number | null>;
  readonly utteranceStartRef: MutableRefObject<number>;
  readonly setLevel: (level: number) => void;
  readonly commitStage: (stage: Stage) => void;
  readonly onUtterance: (blob: Blob, mimeType: string) => void;
}

function startVadLoop(deps: VadDeps): void {
  const buffer = new Uint8Array(deps.analyserRef.current?.frequencyBinCount ?? 0);

  const tick = () => {
    const analyser = deps.analyserRef.current;
    const stage = deps.stageRef.current;
    if (!analyser || stage === 'off') {
      deps.rafRef.current = null;
      return;
    }
    analyser.getByteTimeDomainData(buffer);
    const rms = computeRms(buffer);
    deps.setLevel(Math.min(rms * 4, 1));
    const now = performance.now();

    // VAD only runs while we're waiting for or capturing user speech.
    if (stage === 'listening') {
      if (rms > SPEECH_THRESHOLD) {
        if (deps.vadLoudSinceRef.current === null) deps.vadLoudSinceRef.current = now;
        if (now - deps.vadLoudSinceRef.current >= SPEECH_START_MS) {
          beginCapture(deps, now);
        }
      } else {
        deps.vadLoudSinceRef.current = null;
      }
    } else if (stage === 'capturing') {
      if (rms > SPEECH_THRESHOLD) {
        deps.vadQuietSinceRef.current = null;
      } else if (rms < SILENCE_THRESHOLD) {
        if (deps.vadQuietSinceRef.current === null) deps.vadQuietSinceRef.current = now;
        if (now - deps.vadQuietSinceRef.current >= SILENCE_HOLD_MS) {
          endCapture(deps);
        }
      }
      // Hard stop so a hot mic can't record forever.
      if (now - deps.utteranceStartRef.current >= MAX_UTTERANCE_MS) {
        endCapture(deps);
      }
    }

    deps.rafRef.current = requestAnimationFrame(tick);
  };

  deps.rafRef.current = requestAnimationFrame(tick);
}

function beginCapture(deps: VadDeps, now: number): void {
  const stream = deps.streamRef.current;
  if (!stream) return;
  const mimeType = pickRecorderMime();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    return;
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(250);
  deps.recorderRef.current = recorder;
  deps.chunksRef.current = chunks;
  deps.utteranceStartRef.current = now;
  deps.vadQuietSinceRef.current = null;
  deps.vadLoudSinceRef.current = null;
  deps.commitStage('capturing');
}

function endCapture(deps: VadDeps): void {
  const recorder = deps.recorderRef.current;
  if (!recorder) return;
  const chunks = deps.chunksRef.current;
  const mimeType = recorder.mimeType || 'audio/webm';
  const started = deps.utteranceStartRef.current;
  const captured = performance.now() - started;
  const flush = () => {
    deps.recorderRef.current = null;
    deps.chunksRef.current = [];
    deps.vadLoudSinceRef.current = null;
    deps.vadQuietSinceRef.current = null;
    deps.utteranceStartRef.current = 0;
    if (captured < MIN_UTTERANCE_MS) {
      // Too short — drop it, keep listening.
      if (deps.stageRef.current !== 'off') deps.commitStage('listening');
      return;
    }
    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size < 1024) {
      if (deps.stageRef.current !== 'off') deps.commitStage('listening');
      return;
    }
    deps.commitStage('transcribing');
    deps.onUtterance(blob, mimeType);
  };
  recorder.addEventListener('stop', flush, { once: true });
  try {
    recorder.stop();
  } catch {
    flush();
  }
}

// ─── Pipeline per utterance: STT → LLM → TTS → back to listening ──────────

interface PipelineDeps {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly languageRef: MutableRefObject<string>;
  readonly speakerRef: MutableRefObject<string>;
  readonly configRef: { readonly current: DemoConfig | null };
  readonly audioElRef: MutableRefObject<HTMLAudioElement | null>;
  readonly historyRef: MutableRefObject<ChatMessage[]>;
  readonly stageRef: MutableRefObject<Stage>;
  readonly commitStage: (stage: Stage) => void;
  readonly setTurns: (updater: (prev: readonly Turn[]) => readonly Turn[]) => void;
  readonly setReplySource: (source: 'llm' | 'stub' | null) => void;
  readonly setError: (message: string | null) => void;
}

async function handleUtterance(deps: PipelineDeps): Promise<void> {
  try {
    const transcript = await transcribe(deps.blob, deps.mimeType, deps.languageRef.current);
    if (deps.stageRef.current === 'off') return;
    const trimmed = transcript.trim();
    if (!trimmed) {
      deps.commitStage('listening');
      return;
    }
    deps.historyRef.current = [...deps.historyRef.current, { role: 'user', content: trimmed }];
    pushTurn('user', trimmed, deps.setTurns);

    deps.commitStage('thinking');
    const reply = await getReply(deps.historyRef.current, deps.languageRef.current);
    if (readStage(deps.stageRef) === 'off') return;
    deps.historyRef.current = [
      ...deps.historyRef.current,
      { role: 'assistant', content: reply.text },
    ];
    pushTurn('assistant', reply.text, deps.setTurns);
    deps.setReplySource(reply.source);

    deps.commitStage('speaking');
    await speak(
      reply.text,
      deps.languageRef.current,
      deps.speakerRef.current,
      deps.configRef.current,
      deps.audioElRef,
    );
    if (readStage(deps.stageRef) === 'off') return;
    deps.commitStage('listening');
  } catch (err) {
    deps.setError(err instanceof Error ? err.message : 'Something went wrong.');
    if (deps.stageRef.current !== 'off') deps.commitStage('listening');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function pushTurn(
  role: Turn['role'],
  text: string,
  setTurns: (updater: (prev: readonly Turn[]) => readonly Turn[]) => void,
) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  setTurns((prev) => [...prev, { id, role, text }]);
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function computeRms(buffer: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const value = (buffer[i]! - 128) / 128;
    sum += value * value;
  }
  return Math.sqrt(sum / Math.max(buffer.length, 1));
}

async function transcribe(blob: Blob, mimeType: string, language: string): Promise<string> {
  const url = `/api/v1/demo/stt?language=${encodeURIComponent(language)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': mimeType, 'x-nivomi-demo': '1' },
    body: blob,
    credentials: 'omit',
  });
  if (!response.ok)
    throw new Error(await errorMessage(response, 'Could not transcribe your voice.'));
  const data = (await response.json()) as { transcript: string; stubbed: boolean };
  return data.transcript;
}

async function getReply(
  history: readonly ChatMessage[],
  languageCode: string,
): Promise<{ text: string; source: 'llm' | 'stub' }> {
  const response = await fetch('/api/v1/demo/reply', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nivomi-demo': '1' },
    body: JSON.stringify({ messages: history, languageCode }),
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(await errorMessage(response, 'The agent could not reply.'));
  return (await response.json()) as { text: string; source: 'llm' | 'stub' };
}

async function speak(
  text: string,
  languageCode: string,
  speakerName: string,
  config: DemoConfig | null,
  audioElRef: MutableRefObject<HTMLAudioElement | null>,
): Promise<void> {
  if (!config?.ttsReady) {
    await speakBrowser(text, languageCode);
    return;
  }
  const response = await fetch('/api/v1/demo/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nivomi-demo': '1' },
    body: JSON.stringify({ text, languageCode, speaker: speakerName }),
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(await errorMessage(response, 'The agent could not speak.'));
  const data = (await response.json()) as
    { audio: string; sampleRate: number } | { fallback: 'web-speech' };
  if ('fallback' in data) {
    await speakBrowser(text, languageCode);
    return;
  }
  const el = audioElRef.current;
  if (!el) {
    await speakBrowser(text, languageCode);
    return;
  }
  el.src = `data:audio/wav;base64,${data.audio}`;
  await new Promise<void>((resolve) => {
    const done = () => {
      el.removeEventListener('ended', done);
      el.removeEventListener('error', done);
      resolve();
    };
    el.addEventListener('ended', done, { once: true });
    el.addEventListener('error', done, { once: true });
    void el.play().catch(() => resolve());
  });
}

async function speakBrowser(text: string, languageCode: string): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = languageCode;
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find((voice) => voice.lang.toLowerCase() === languageCode.toLowerCase());
    if (match) utterance.voice = match;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    return data.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

function describeMicError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError')
      return 'Microphone access was denied. Allow it in your browser and try again.';
    if (err.name === 'NotFoundError') return 'No microphone was found on this device.';
  }
  if (err instanceof Error) return err.message;
  return 'Could not access your microphone.';
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

/** Reads a stage ref without the surrounding type narrowing — the ref is mutated from outside. */
function readStage(ref: MutableRefObject<Stage>): Stage {
  return ref.current;
}
