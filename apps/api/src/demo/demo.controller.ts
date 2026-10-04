import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Public } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { validate } from '../common/validation.js';
import { SarvamProvider, type ChatMessage } from './sarvam.js';
import { stubReply } from './stub-llm.js';

interface DemoConfigResponse {
  readonly sttReady: boolean;
  readonly ttsReady: boolean;
  readonly llmReady: boolean;
  readonly languages: readonly { readonly code: string; readonly label: string }[];
  readonly speakers: readonly string[];
  readonly defaultLanguage: string;
  readonly defaultSpeaker: string;
}

interface SynthesizeBody {
  readonly text?: string;
  readonly languageCode?: string;
  readonly speaker?: string;
}

const replyBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4_000),
      }),
    )
    .max(64)
    .optional(),
  languageCode: z.string().max(16).optional(),
  /** Legacy single-turn callers (still supported). */
  transcript: z.string().max(4_000).optional(),
});

const LANGUAGES: readonly { code: string; label: string }[] = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ml-IN', label: 'Malayalam' },
  { code: 'ta-IN', label: 'Tamil' },
  { code: 'te-IN', label: 'Telugu' },
  { code: 'kn-IN', label: 'Kannada' },
];

const SPEAKERS: readonly string[] = ['anushka', 'manisha', 'vidya', 'arya', 'abhilash', 'karun'];

const MAX_HISTORY_MESSAGES = 16;

/**
 * Browser voice demo (/demo/voice). STT + TTS + LLM proxied through Sarvam when a key is
 * configured; the stub LLM takes over if the key is missing or the chat call fails. Deliberately
 * kept public (no auth, no tenant) — the real tenant-scoped `VoiceProvider` lands in Phase 4.
 */
@Public()
@Controller('demo')
export class DemoController {
  private readonly sarvam: SarvamProvider | null;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.sarvam = env.SARVAM_API_KEY
      ? new SarvamProvider(env.SARVAM_API_KEY, env.SARVAM_CHAT_MODEL)
      : null;
  }

  @Get('config')
  getConfig(): DemoConfigResponse {
    return {
      sttReady: this.sarvam !== null,
      ttsReady: this.sarvam !== null,
      llmReady: this.sarvam !== null,
      languages: LANGUAGES,
      speakers: SPEAKERS,
      defaultLanguage: 'en-IN',
      defaultSpeaker: 'anushka',
    };
  }

  @Post('stt')
  async transcribe(
    @Req() request: Request,
  ): Promise<{ transcript: string; languageCode: string | null; stubbed: boolean }> {
    if (!this.sarvam) {
      return { transcript: '', languageCode: null, stubbed: true };
    }
    const body = request.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'Audio payload is empty.');
    }
    const contentType = request.headers['content-type'] ?? 'audio/webm';
    const language =
      typeof request.query.language === 'string' ? request.query.language : undefined;
    const result = await this.sarvam.transcribe(body, contentType, language);
    return { ...result, stubbed: false };
  }

  @Post('reply')
  async reply(@Body() body: unknown): Promise<{ text: string; source: 'llm' | 'stub' }> {
    const parsed = validate(replyBodySchema, body);
    const history = normaliseHistory(parsed);
    const lastUser = [...history].reverse().find((message) => message.role === 'user');
    const languageCode = parsed.languageCode ?? 'en-IN';

    if (!this.sarvam) {
      return { text: stubReply(lastUser?.content ?? ''), source: 'stub' };
    }

    const prompt: ChatMessage[] = [
      { role: 'system', content: systemPrompt(languageCode) },
      ...history,
    ];
    try {
      const text = await this.sarvam.chat(prompt);
      return { text, source: 'llm' };
    } catch {
      // Never let the demo fall off the call: a canned reply beats dead air.
      return { text: stubReply(lastUser?.content ?? ''), source: 'stub' };
    }
  }

  @Post('tts')
  async synthesize(
    @Body() body: SynthesizeBody,
  ): Promise<{ audio: string; sampleRate: number } | { fallback: 'web-speech' }> {
    const text = body.text?.trim() ?? '';
    if (text.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'text is required.');
    }
    if (!this.sarvam) {
      return { fallback: 'web-speech' };
    }
    const language = body.languageCode ?? 'en-IN';
    const speaker = body.speaker ?? 'anushka';
    return this.sarvam.synthesize(text, language, speaker);
  }
}

function normaliseHistory(body: z.infer<typeof replyBodySchema>): ChatMessage[] {
  const list: ChatMessage[] = [];
  if (body.messages) {
    for (const raw of body.messages) {
      list.push({ role: raw.role, content: raw.content });
    }
  } else if (body.transcript && body.transcript.trim().length > 0) {
    list.push({ role: 'user', content: body.transcript.trim() });
  }
  // Keep the tail: the newest messages carry the most signal for the next turn.
  return list.slice(-MAX_HISTORY_MESSAGES);
}

function systemPrompt(languageCode: string): string {
  const languageName =
    LANGUAGES.find((item) => item.code === languageCode)?.label ?? 'English (India)';
  return [
    'You are Nivomi, a warm and efficient AI voice agent for Indian businesses.',
    `Reply in ${languageName}. Keep every reply under 60 spoken words.`,
    'Speak like a real person on a phone call: contractions, short sentences, no bullet points, no markdown, no emojis.',
    'Nivomi handles outbound and inbound calls with full consent, DND and quiet-hour compliance, syncs with HubSpot, and supports English plus Hindi, Malayalam, Tamil, Telugu and Kannada.',
    'If someone asks pricing, say plans start around two thousand rupees a month and offer to connect them with sales.',
    'If you do not know, say so briefly and ask what they would like to know next. Never invent policies, numbers, or product features.',
  ].join(' ');
}
