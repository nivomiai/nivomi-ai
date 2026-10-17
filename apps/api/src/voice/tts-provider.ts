/**
 * Streaming text-to-speech (ADR-011, Phase 4b). Business logic depends on this interface; the
 * Sarvam adapter replaces the simulated one once credentials are provisioned (Phase 4b exit).
 */

export interface TtsChunk {
  readonly audio: Uint8Array;
  readonly sampleRateHz: number;
  /** True on the last chunk of a phrase. */
  readonly isFinal: boolean;
}

export interface TtsStream {
  /** Chunks start arriving within the vendor's first-byte latency; cancellation stops them. */
  readonly events: AsyncIterable<TtsChunk>;
  cancel(): Promise<void>;
}

export interface TtsRequest {
  readonly text: string;
  readonly language?: string;
  readonly voice?: string;
  /** For metering (Phase 8). */
  readonly agentVersionId?: string;
}

export interface TTSProvider {
  readonly name: string;
  speak(request: TtsRequest): TtsStream;
}

export const TTS_PROVIDER = Symbol('TTS_PROVIDER');

export class TtsProviderError extends Error {
  override readonly name = 'TtsProviderError';
}

/**
 * Development and test stand-in: emits one chunk per word, final flag on the last word. The
 * audio bytes are UTF-8 of the word so a Simulated STT round-trip loops text verbatim. Refused
 * in production (env validation).
 */
export class SimulatedTTSProvider implements TTSProvider {
  readonly name = 'simulated';
  /** Every request completes with its full text concatenated. */
  readonly spoken: TtsRequest[] = [];
  /** The next N requests fail. */
  failNext = 0;
  /** When set, each chunk waits this many ms (lets a test test barge-in). */
  chunkDelayMs = 0;

  speak(request: TtsRequest): TtsStream {
    this.spoken.push(request);
    const shouldFail = this.failNext > 0;
    if (shouldFail) this.failNext -= 1;
    const words = request.text.split(/\s+/).filter(Boolean);
    const delay = this.chunkDelayMs;
    return new SimulatedTtsStream(words, shouldFail, delay);
  }
}

class SimulatedTtsStream implements TtsStream {
  private cancelled = false;

  constructor(
    private readonly words: string[],
    private readonly shouldFail: boolean,
    private readonly chunkDelayMs: number,
  ) {}

  cancel(): Promise<void> {
    this.cancelled = true;
    return Promise.resolve();
  }

  get events(): AsyncIterable<TtsChunk> {
    return this.iterate();
  }

  private async *iterate(): AsyncIterable<TtsChunk> {
    if (this.shouldFail) throw new TtsProviderError('Simulated TTS failure');
    for (let i = 0; i < this.words.length; i += 1) {
      if (this.cancelled) return;
      if (this.chunkDelayMs > 0) await new Promise((r) => setTimeout(r, this.chunkDelayMs));
      const word = this.words[i] ?? '';
      yield {
        audio: new TextEncoder().encode(word + (i < this.words.length - 1 ? ' ' : '')),
        sampleRateHz: 8_000,
        isFinal: i === this.words.length - 1,
      };
    }
  }
}
