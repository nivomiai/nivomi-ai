import { AppError } from '../common/errors.js';

/**
 * Direct Sarvam REST wrapper used by the inbound voice path (turn-based conversation; ADR-024)
 * and by the public voice demo. The Phase 4b streaming `STTProvider` / `TTSProvider` adapters
 * (ADR-023) will supersede this for live `<Stream>` once Exotel's streaming applet is on the
 * tenant's plan — until then, `<Record>` → this wrapper → `<Say>` is the honest path.
 */

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';
const SARVAM_CHAT_URL = 'https://api.sarvam.ai/v1/chat/completions';
/** Hard ceiling on tokens-per-reply so a runaway model can't block the call. */
const SARVAM_CHAT_MAX_TOKENS = 240;
/** Timeout for the LLM reply so a slow call fails fast and the next turn can continue. */
const SARVAM_CHAT_TIMEOUT_MS = 20_000;
/** Timeout for STT; recordings arrive as short WAVs so the response is usually sub-second. */
const SARVAM_STT_TIMEOUT_MS = 15_000;

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface TranscribeResult {
  readonly transcript: string;
  readonly languageCode: string | null;
}

export interface SynthesizeResult {
  readonly audio: string;
  readonly sampleRate: number;
}

export interface ChatResult {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export class SarvamProvider {
  constructor(
    private readonly apiKey: string,
    private readonly chatModel: string = 'sarvam-m',
  ) {}

  async transcribe(
    audio: Buffer,
    mimeType: string,
    languageCode: string | undefined,
  ): Promise<TranscribeResult> {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(audio)], { type: mimeType });
    form.append('file', blob, filenameFor(mimeType));
    form.append('model', 'saaras:v4');
    if (languageCode) form.append('language_code', languageCode);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SARVAM_STT_TIMEOUT_MS);
    try {
      const response = await fetch(SARVAM_STT_URL, {
        method: 'POST',
        headers: { 'api-subscription-key': this.apiKey },
        body: form,
        signal: controller.signal,
      });
      const payload = (await safeJson(response)) as {
        readonly transcript?: string;
        readonly language_code?: string | null;
        readonly error?: { readonly message?: string };
      } | null;
      if (!response.ok) {
        throw new AppError(
          'PROVIDER_ERROR',
          payload?.error?.message
            ? `Sarvam STT: ${payload.error.message}`
            : `Sarvam STT returned ${response.status}.`,
        );
      }
      return {
        transcript: payload?.transcript ?? '',
        languageCode: payload?.language_code ?? null,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AppError('TIMEOUT', 'Sarvam STT timed out.');
      }
      throw new AppError('PROVIDER_ERROR', 'Sarvam STT failed.');
    } finally {
      clearTimeout(timer);
    }
  }

  async chat(messages: readonly ChatMessage[]): Promise<ChatResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SARVAM_CHAT_TIMEOUT_MS);
    try {
      const response = await fetch(SARVAM_CHAT_URL, {
        method: 'POST',
        headers: {
          'api-subscription-key': this.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.chatModel,
          messages,
          temperature: 0.6,
          max_tokens: SARVAM_CHAT_MAX_TOKENS,
          stream: false,
        }),
        signal: controller.signal,
      });
      const payload = (await safeJson(response)) as {
        readonly choices?: readonly {
          readonly message?: { readonly content?: string };
        }[];
        readonly usage?: {
          readonly prompt_tokens?: number;
          readonly completion_tokens?: number;
        };
        readonly error?: { readonly message?: string };
      } | null;
      if (!response.ok) {
        throw new AppError(
          'PROVIDER_ERROR',
          payload?.error?.message
            ? `Sarvam chat: ${payload.error.message}`
            : `Sarvam chat returned ${response.status}.`,
        );
      }
      const text = payload?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new AppError('PROVIDER_ERROR', 'Sarvam chat returned no reply.');
      return {
        text,
        inputTokens: payload?.usage?.prompt_tokens ?? 0,
        outputTokens: payload?.usage?.completion_tokens ?? 0,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AppError('TIMEOUT', 'The agent took too long to reply.');
      }
      throw new AppError('PROVIDER_ERROR', 'Sarvam chat failed.');
    } finally {
      clearTimeout(timer);
    }
  }

  async synthesize(text: string, languageCode: string, speaker: string): Promise<SynthesizeResult> {
    const response = await fetch(SARVAM_TTS_URL, {
      method: 'POST',
      headers: {
        'api-subscription-key': this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text,
        language_code: languageCode,
        speaker,
        model: 'bulbul:v2',
        speech_sample_rate: 22050,
        enable_preprocessing: true,
      }),
    });
    const payload = (await safeJson(response)) as {
      readonly audios?: readonly string[];
      readonly error?: { readonly message?: string };
    } | null;
    if (!response.ok) {
      throw new AppError(
        'PROVIDER_ERROR',
        payload?.error?.message
          ? `Sarvam TTS: ${payload.error.message}`
          : `Sarvam TTS returned ${response.status}.`,
      );
    }
    const audio = payload?.audios?.[0];
    if (!audio) {
      throw new AppError('PROVIDER_ERROR', 'Sarvam TTS returned no audio.');
    }
    return { audio, sampleRate: 22050 };
  }
}

export const SARVAM_PROVIDER = Symbol('SARVAM_PROVIDER');

function filenameFor(mimeType: string): string {
  if (mimeType.includes('wav')) return 'audio.wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'audio.mp3';
  if (mimeType.includes('ogg')) return 'audio.ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'audio.m4a';
  return 'audio.webm';
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
