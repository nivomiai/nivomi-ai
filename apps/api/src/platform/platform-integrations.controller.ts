import { Controller, Get, Inject } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { RequireSuperAdmin } from '../auth/principal.js';

type Status = 'ready' | 'simulated' | 'missing';

interface IntegrationCheck {
  readonly key: string;
  readonly label: string;
  readonly status: Status;
  readonly summary: string;
  readonly missing: readonly string[];
  readonly productionBlocker: boolean;
  readonly docs?: string;
}

/**
 * Super-admin "what do I still need to go live?" readout. No secret values are ever returned —
 * only whether each slot is populated and whether the overall provider is in simulated vs real
 * mode. This is what powers /app/launch-checklist.
 */
@RequireSuperAdmin()
@Controller({ path: 'platform/integrations' })
export class PlatformIntegrationsController {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  @Get('health')
  health(): { readonly items: readonly IntegrationCheck[] } {
    const env = this.env;
    const has = (value: string | undefined | null) => Boolean(value && value.trim().length > 0);
    const items: IntegrationCheck[] = [
      {
        key: 'auth',
        label: 'Authentication',
        status: has(env.AUTH_JWT_SECRET) ? 'ready' : 'missing',
        summary: has(env.AUTH_JWT_SECRET)
          ? 'JWT signing secret is set.'
          : 'AUTH_JWT_SECRET not set — sessions cannot be signed.',
        missing: has(env.AUTH_JWT_SECRET) ? [] : ['AUTH_JWT_SECRET'],
        productionBlocker: true,
      },
      {
        key: 'database',
        label: 'Database',
        status: has(env.DATABASE_URL)
          ? 'ready'
          : env.NODE_ENV === 'production'
            ? 'missing'
            : 'simulated',
        summary: has(env.DATABASE_URL)
          ? 'PostgreSQL connection string is set.'
          : 'Running on in-process PGlite — refused in production.',
        missing: has(env.DATABASE_URL) ? [] : ['DATABASE_URL'],
        productionBlocker: true,
      },
      {
        key: 'credentials-encryption',
        label: 'Stored credentials encryption',
        status: has(env.CREDENTIALS_ENCRYPTION_KEY) ? 'ready' : 'missing',
        summary: has(env.CREDENTIALS_ENCRYPTION_KEY)
          ? 'AES-256-GCM key is set.'
          : 'CREDENTIALS_ENCRYPTION_KEY not set — any stored provider token will be rejected.',
        missing: has(env.CREDENTIALS_ENCRYPTION_KEY) ? [] : ['CREDENTIALS_ENCRYPTION_KEY'],
        productionBlocker: true,
      },
      {
        key: 'email',
        label: 'Email (SES / dev mailbox)',
        status: env.EMAIL_PROVIDER === 'dev-mailbox' ? 'simulated' : 'ready',
        summary:
          env.EMAIL_PROVIDER === 'dev-mailbox'
            ? 'Dev mailbox writes emails to disk — refused in production.'
            : `Email provider: ${env.EMAIL_PROVIDER}.`,
        missing: env.EMAIL_PROVIDER === 'dev-mailbox' ? ['EMAIL_PROVIDER=ses'] : [],
        productionBlocker: true,
      },
      {
        key: 'storage',
        label: 'File storage (S3 / local)',
        status: env.STORAGE_PROVIDER === 'local' ? 'simulated' : 'ready',
        summary:
          env.STORAGE_PROVIDER === 'local'
            ? 'Local disk — refused in production.'
            : `Storage: ${env.STORAGE_PROVIDER}.`,
        missing: env.STORAGE_PROVIDER === 'local' ? ['STORAGE_PROVIDER=s3'] : [],
        productionBlocker: true,
      },
      {
        key: 'voice',
        label: 'Outbound dialer (Exotel)',
        status: this.voiceStatus(),
        summary: this.voiceSummary(),
        missing: this.voiceMissing(),
        productionBlocker: true,
        docs: 'https://developer.exotel.com/',
      },
      {
        key: 'stt-tts',
        label: 'STT + TTS (Sarvam)',
        status: has(env.SARVAM_API_KEY) ? 'ready' : 'missing',
        summary: has(env.SARVAM_API_KEY)
          ? 'SARVAM_API_KEY set. Streaming STT/TTS adapters land with the real-call phase.'
          : 'SARVAM_API_KEY not set — demo falls back to canned transcript + browser TTS.',
        missing: has(env.SARVAM_API_KEY) ? [] : ['SARVAM_API_KEY'],
        productionBlocker: true,
        docs: 'https://dashboard.sarvam.ai',
      },
      {
        key: 'llm',
        label: 'LLM (Anthropic / Claude)',
        status: this.llmStatus(),
        summary: this.llmSummary(),
        missing: this.llmMissing(),
        productionBlocker: true,
      },
      {
        key: 'otp',
        label: 'OTP (MSG91) — MFA & SMS',
        status: 'simulated',
        summary: 'MSG91 adapter not wired yet; MFA ships with the adapter PR.',
        missing: ['MSG91_API_KEY'],
        productionBlocker: false,
      },
      {
        key: 'payment',
        label: 'Payments (Razorpay)',
        status: 'simulated',
        summary:
          'SimulatedPaymentProvider is used. Razorpay adapter arrives with the billing phase.',
        missing: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
        productionBlocker: false,
      },
    ];
    return { items };
  }

  // VOICE_PROVIDER is `z.enum(['simulated'])` today — the Exotel value is added when its adapter
  // lands. Until then this method only ever sees 'simulated'; the "any Exotel key set" check still
  // reports progress on the way there.
  private voiceStatus(): Status {
    const anyExotel = this.env.EXOTEL_SID || this.env.EXOTEL_API_TOKEN;
    return anyExotel ? 'missing' : 'simulated';
  }

  private voiceSummary(): string {
    const anyExotel = this.env.EXOTEL_SID || this.env.EXOTEL_API_TOKEN;
    return anyExotel
      ? 'Exotel credentials are partially set — fill the rest and the adapter PR will flip VOICE_PROVIDER=exotel.'
      : 'Simulated dialer: outcomes are canned. Set EXOTEL_* and the adapter will take over.';
  }

  private voiceMissing(): string[] {
    const missing: string[] = [];
    if (!this.env.EXOTEL_SID) missing.push('EXOTEL_SID');
    if (!this.env.EXOTEL_API_KEY) missing.push('EXOTEL_API_KEY');
    if (!this.env.EXOTEL_API_TOKEN) missing.push('EXOTEL_API_TOKEN');
    if (!this.env.EXOTEL_CALLER_ID) missing.push('EXOTEL_CALLER_ID');
    if (!this.env.EXOTEL_WEBHOOK_SECRET) missing.push('EXOTEL_WEBHOOK_SECRET');
    missing.push('VOICE_PROVIDER=exotel (adapter PR)');
    return missing;
  }

  // LLM_PROVIDER is `z.enum(['simulated'])` today; the Anthropic value lands with its adapter PR.
  private llmStatus(): Status {
    return this.env.ANTHROPIC_API_KEY ? 'missing' : 'simulated';
  }

  private llmSummary(): string {
    return this.env.ANTHROPIC_API_KEY
      ? 'ANTHROPIC_API_KEY set — the agent will use Claude once the adapter PR lands.'
      : 'Simulated LLM: agents answer with scripted responses. Set ANTHROPIC_API_KEY to be ready.';
  }

  private llmMissing(): string[] {
    const missing: string[] = [];
    if (!this.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
    missing.push('LLM_PROVIDER=anthropic (adapter PR)');
    return missing;
  }
}
