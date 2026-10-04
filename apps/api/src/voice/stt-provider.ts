/**
 * Streaming speech-to-text (ADR-011, Phase 4b). Business logic depends on this interface; the
 * Sarvam adapter replaces the simulated one once credentials are provisioned (Phase 4b exit).
 */

export interface SttChunk {
  /** 16-bit PCM at `sampleRateHz` from telephony; the adapter resamples/reformats for the vendor. */
  readonly audio: Uint8Array;
  readonly sampleRateHz: number;
  readonly languageHint?: string;
}

export interface SttPartial {
  readonly kind: 'partial';
  readonly text: string;
}

export interface SttFinal {
  readonly kind: 'final';
  readonly text: string;
  readonly languageDetected?: string;
  /** For metering (Phase 8). */
  readonly audioSeconds: number;
}

export type SttEvent = SttPartial | SttFinal;

/**
 * One streaming utterance from the caller. The runner opens one per caller turn, writes audio,
 * then calls `end()` and awaits the final transcript. `cancel()` abandons the stream (barge-in
 * from the agent side; rare).
 */
export interface SttStream {
  push(chunk: SttChunk): Promise<void>;
  readonly events: AsyncIterable<SttEvent>;
  end(): Promise<void>;
  cancel(): Promise<void>;
}

export interface STTProvider {
  readonly name: string;
  openStream(options: { readonly languageHint?: string }): SttStream;
}

export const STT_PROVIDER = Symbol('STT_PROVIDER');

export class SttProviderError extends Error {
  override readonly name = 'SttProviderError';
}

/**
 * Development and test stand-in: writes exactly what each pushed chunk says in its `audio` bytes
 * (UTF-8), emits a single `final` event when `end()` is called. Lets a test script a conversation
 * without real audio. Refused in production (env validation).
 */
export class SimulatedSTTProvider implements STTProvider {
  readonly name = 'simulated';
  /** Streams whose `.end()` was called, in order. */
  readonly ended: SimulatedSttStream[] = [];
  /** The next N streams fail on `end()`. */
  failNext = 0;

  openStream(options: { readonly languageHint?: string }): SttStream {
    const stream = new SimulatedSttStream(options.languageHint, () => this.failNext > 0);
    stream.onEnd = () => {
      this.ended.push(stream);
      if (this.failNext > 0) this.failNext -= 1;
    };
    return stream;
  }
}

class SimulatedSttStream implements SttStream {
  private readonly buffer: string[] = [];
  private readonly queue: SttEvent[] = [];
  private resolveNext: ((event: SttEvent) => void) | null = null;
  private closed = false;
  private cancelled = false;
  private seconds = 0;
  onEnd: (() => void) | null = null;

  constructor(
    private readonly languageHint: string | undefined,
    private readonly shouldFail: () => boolean,
  ) {}

  push(chunk: SttChunk): Promise<void> {
    if (this.closed) throw new SttProviderError('push after end');
    this.buffer.push(new TextDecoder().decode(chunk.audio));
    this.seconds += chunk.audio.byteLength / chunk.sampleRateHz; // bytes per second ≈ sampleRateHz
    return Promise.resolve();
  }

  end(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    if (this.shouldFail()) {
      this.push_event({ kind: 'final', text: '', audioSeconds: 0 });
      return Promise.reject(new SttProviderError('Simulated STT failure'));
    }
    const text = this.buffer.join('').trim();
    this.push_event({
      kind: 'final',
      text,
      ...(this.languageHint ? { languageDetected: this.languageHint } : {}),
      audioSeconds: Number(this.seconds.toFixed(2)),
    });
    this.onEnd?.();
    return Promise.resolve();
  }

  cancel(): Promise<void> {
    this.cancelled = true;
    this.closed = true;
    this.push_event({ kind: 'final', text: '', audioSeconds: 0 });
    return Promise.resolve();
  }

  get events(): AsyncIterable<SttEvent> {
    return this.iterate();
  }

  private push_event(event: SttEvent): void {
    if (this.resolveNext) {
      const resolve = this.resolveNext;
      this.resolveNext = null;
      resolve(event);
    } else {
      this.queue.push(event);
    }
  }

  private async *iterate(): AsyncIterable<SttEvent> {
    while (true) {
      const next = this.queue.shift();
      if (next) {
        yield next;
        if (next.kind === 'final') return;
        continue;
      }
      if (this.cancelled) return;
      const event = await new Promise<SttEvent>((resolve) => {
        this.resolveNext = resolve;
      });
      yield event;
      if (event.kind === 'final') return;
    }
  }
}
