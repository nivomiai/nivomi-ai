import {
  booleanFlagSchema,
  logLevelSchema,
  nodeEnvSchema,
  originListSchema,
  parseEnv,
  portSchema,
  type EnvSource,
} from '@nivomi/config';
import { z } from 'zod';

const DEVELOPMENT_ORIGINS = ['http://localhost:3000'];
const DEVELOPMENT_WEB_URL = 'http://localhost:3000';

/** PGlite data directory value that selects an in-memory database (tests, e2e). */
export const PGLITE_IN_MEMORY = 'memory';

export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    HOST: z.string().default('0.0.0.0'),
    PORT: portSchema.default(4000),
    LOG_LEVEL: logLevelSchema.default('info'),
    CORS_ALLOWED_ORIGINS: originListSchema.optional(),
    APP_VERSION: z.string().default('0.0.0-dev'),
    /** Behind a load balancer (ALB): trust X-Forwarded-For for client IPs used by rate limits. */
    TRUST_PROXY: booleanFlagSchema.default(false),

    /** PostgreSQL connection string (RDS). Required in production. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
    /** Without DATABASE_URL: PGlite data directory, or `memory` for an in-memory database. */
    DATABASE_PGLITE_DIR: z.string().default('.data/pglite'),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    /** Apply migrations on startup. Defaults to on outside production; production migrates as a deploy step. */
    DATABASE_AUTO_MIGRATE: booleanFlagSchema.optional(),

    /** HS256 signing secret for access tokens (ADR-018). At least 32 characters. */
    AUTH_JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
    /** Previous secret, still accepted for verification during key rotation. */
    AUTH_JWT_PREVIOUS_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    /** Cookie domain shared by the web app and API, e.g. `.nivomi.ai`. Unset = host-only cookies. */
    AUTH_COOKIE_DOMAIN: z.string().optional(),

    /** Public URL of the web app, used for links in emails. Required in production. */
    APP_WEB_URL: z.url({ protocol: /^https?$/ }).optional(),

    /**
     * Public base URL of this API, used by Exotel for `<Record action>` continuation and status
     * callbacks. Required in production and whenever VOICE_PROVIDER=exotel so the inbound AI loop
     * can post audio back to us; defaults to `http://localhost:4000` otherwise.
     */
    API_PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(),

    EMAIL_PROVIDER: z.enum(['dev-mailbox', 'ses']).default('dev-mailbox'),
    EMAIL_FROM: z.string().default('Nivomi AI <no-reply@nivomi.ai>'),
    /** Where the development mailbox writes emails (git-ignored; never used in production). */
    EMAIL_DEV_MAILBOX_DIR: z.string().default('.data/mailbox'),

    /**
     * Public demo deployment (e.g. a free-tier host before AWS): lets production run the dev-only
     * providers that are all that exist today (dev mailbox, local storage, simulated dialer,
     * preference registry and LLM). Every other production requirement still applies. Never set
     * it on a deployment that handles real customer data or places real calls.
     */
    DEMO_MODE: booleanFlagSchema.default(false),

    /** Run the background-job worker inside this process (ADR-019). */
    WORKER_ENABLED: booleanFlagSchema.default(true),

    /** Uploaded import files (StorageProvider). `local` is for development only. */
    STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('.data/uploads'),

    /**
     * 32-byte key (base64) for encrypting stored provider credentials such as CRM tokens
     * (AES-256-GCM). Required when a CRM app is configured, and in production.
     */
    CREDENTIALS_ENCRYPTION_KEY: z.string().optional(),
    /** The previous key during a rotation; still used to decrypt. */
    CREDENTIALS_ENCRYPTION_PREVIOUS_KEY: z.string().optional(),

    /**
     * Outbound dialer (VoiceProvider, ADR-011/021). `simulated` is for dev/tests. `exotel` is the
     * production India path. `twilio` is for pre-Exotel demos (US/UK number, trial-friendly).
     * `tata-smartflo` is a parallel India path being evaluated alongside Exotel; see
     * docs/planning/tata-smartflo-integration-plan.md.
     */
    VOICE_PROVIDER: z.enum(['simulated', 'exotel', 'twilio', 'tata-smartflo']).default('simulated'),
    /** How long a simulated call lasts before its outcome arrives. */
    VOICE_SIMULATED_CALL_MS: z.coerce.number().int().min(0).max(600_000).default(2_000),
    /** Preference registry (NCPR/DND) lookups. Simulated only; refused in production. */
    PREFERENCE_REGISTRY: z.enum(['simulated']).default('simulated'),
    /** Language model behind `LLMProvider` (ADR-022). `anthropic` needs ANTHROPIC_API_KEY. */
    LLM_PROVIDER: z.enum(['simulated', 'anthropic']).default('simulated'),

    /**
     * Sarvam AI subscription key. Powers the browser voice demo at /demo/voice (STT + TTS + LLM)
     * and the eventual real STT/TTS during a call. Unset = demo falls back to a canned transcript
     * and the browser Web Speech API, and real calls stay simulated.
     */
    SARVAM_API_KEY: z.string().optional(),
    /**
     * Chat model id used by the voice demo. Defaults to `sarvam-m`; swap to `sarvam-2b` or any
     * other id the account can call if `sarvam-m` returns a model-not-found error.
     */
    SARVAM_CHAT_MODEL: z.string().default('sarvam-m'),

    /**
     * Anthropic (Claude) API key. Used by AnthropicLLMProvider for AI Agents during live calls
     * once that adapter lands. Unset = LLMProvider stays simulated (dev/test), refused in prod.
     */
    ANTHROPIC_API_KEY: z.string().optional(),
    /** Model id the agent uses. Default is the latest Claude 5 Sonnet; a Super Admin can override. */
    ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),

    /**
     * Exotel outbound dialer credentials (ADR-021 Phase 4). Required when VOICE_PROVIDER=exotel.
     * Get an SID + API token at https://my.exotel.com/.
     */
    EXOTEL_SID: z.string().optional(),
    EXOTEL_API_KEY: z.string().optional(),
    EXOTEL_API_TOKEN: z.string().optional(),
    /** The 140xx / 1601xx number Exotel dials from; must match a verified caller number. */
    EXOTEL_CALLER_ID: z.string().optional(),
    /**
     * HMAC secret Exotel signs status webhooks with; verified before any state change. Required
     * when VOICE_PROVIDER=exotel.
     */
    EXOTEL_WEBHOOK_SECRET: z.string().optional(),
    /** Exotel region host; override only for sandbox or a non-India tenant. */
    EXOTEL_API_URL: z.url().default('https://api.exotel.com'),

    /**
     * Twilio credentials. Used for pre-Exotel demos: Twilio works out of the box on a free trial
     * (verified-number outbound included) and ships `<Stream>` for low-latency AI. Not for Indian
     * consumer production — Twilio has no 140xx or DLT path (see docs/planning/twilio-demo-plan.md).
     * Both `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are required when VOICE_PROVIDER=twilio.
     */
    TWILIO_ACCOUNT_SID: z.string().startsWith('AC').optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    /** The Twilio-owned E.164 number calls are placed from and inbound webhooks arrive on. */
    TWILIO_PHONE_NUMBER: z.string().optional(),
    /** Override only for Twilio regions or Media Streams staging. */
    TWILIO_API_URL: z.url().default('https://api.twilio.com'),

    /**
     * Tata Smartflo credentials (parallel India path to Exotel). Required when
     * VOICE_PROVIDER=tata-smartflo. Get these from the Smartflo dashboard:
     *   - API_TOKEN               → Settings → API Credentials (Bearer token)
     *   - CLICK_TO_CALL_API_KEY   → Settings → API Connect → Create API Key
     *   - CALLER_ID               → Numbers → the DID bound to the API key
     *   - WEBHOOK_SHARED_SECRET   → any 32+ char random string; mirror it as
     *                               custom_parameter_1 in the IVR Flow builder.
     * See docs/planning/tata-smartflo-integration-plan.md for the end-to-end setup.
     */
    TATA_API_URL: z.url().default('https://api-smartflo.tatateleservices.com'),
    TATA_API_TOKEN: z.string().optional(),
    TATA_CLICK_TO_CALL_API_KEY: z.string().optional(),
    TATA_CALLER_ID: z.string().optional(),
    TATA_WEBHOOK_SHARED_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    /** Click-to-Call ring timeout (10-30s per Smartflo docs). */
    TATA_CUSTOMER_RING_TIMEOUT: z.coerce.number().int().min(10).max(30).default(25),
    /** Upper bound on call duration (30-14400s). */
    TATA_CALL_TIMEOUT: z.coerce.number().int().min(30).max(14400).default(900),

    /** HubSpot app credentials (ADR-012). Both or neither; unset = "Connect HubSpot" unavailable. */
    HUBSPOT_CLIENT_ID: z.string().optional(),
    HUBSPOT_CLIENT_SECRET: z.string().optional(),
    /** Official endpoints; override only to point tests at a local fake. */
    HUBSPOT_AUTHORIZE_URL: z.url().default('https://app.hubspot.com/oauth/authorize'),
    HUBSPOT_OAUTH_API_URL: z.url().default('https://api.hubspot.com'),
    HUBSPOT_CRM_API_URL: z.url().default('https://api.hubapi.com'),
  })
  .superRefine((env, ctx) => {
    const requireInProduction = (key: keyof typeof env, present: boolean) => {
      if (env.NODE_ENV === 'production' && !present) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'is required in production' });
      }
    };
    requireInProduction('CORS_ALLOWED_ORIGINS', Boolean(env.CORS_ALLOWED_ORIGINS?.length));
    requireInProduction('DATABASE_URL', env.DATABASE_URL !== undefined);
    requireInProduction('APP_WEB_URL', env.APP_WEB_URL !== undefined);
    // Dev-only providers are refused in production unless this is an explicit demo deployment.
    const strictProduction = env.NODE_ENV === 'production' && !env.DEMO_MODE;
    // Telephony webhooks need the public URL; a demo deployment takes no real calls.
    if (strictProduction && env.API_PUBLIC_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_PUBLIC_URL'],
        message: 'is required in production',
      });
    }
    if (strictProduction && env.EMAIL_PROVIDER === 'dev-mailbox') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'dev-mailbox is not allowed in production',
      });
    }
    if (strictProduction && env.STORAGE_PROVIDER === 'local') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_PROVIDER'],
        message: 'local storage is not allowed in production',
      });
    }
    if (env.STORAGE_PROVIDER === 's3') {
      ctx.addIssue({
        code: 'custom',
        path: ['STORAGE_PROVIDER'],
        message: 's3 is not implemented yet (see docs/TECH_DEBT.md)',
      });
    }
    for (const key of [
      'CREDENTIALS_ENCRYPTION_KEY',
      'CREDENTIALS_ENCRYPTION_PREVIOUS_KEY',
    ] as const) {
      const value = env[key];
      if (value !== undefined && Buffer.from(value, 'base64').length !== 32) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'must be 32 bytes, base64-encoded' });
      }
    }
    requireInProduction('CREDENTIALS_ENCRYPTION_KEY', env.CREDENTIALS_ENCRYPTION_KEY !== undefined);
    if (Boolean(env.HUBSPOT_CLIENT_ID) !== Boolean(env.HUBSPOT_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['HUBSPOT_CLIENT_SECRET'],
        message: 'HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET must be set together',
      });
    }
    if (env.HUBSPOT_CLIENT_ID && !env.CREDENTIALS_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['CREDENTIALS_ENCRYPTION_KEY'],
        message: 'is required when HubSpot is configured',
      });
    }
    if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'is required when LLM_PROVIDER=anthropic',
      });
    }
    for (const key of ['VOICE_PROVIDER', 'PREFERENCE_REGISTRY', 'LLM_PROVIDER'] as const) {
      if (strictProduction && env[key] === 'simulated') {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'simulated is not allowed in production (real adapters arrive in phase 4)',
        });
      }
    }
    if (env.VOICE_PROVIDER === 'twilio') {
      if (!env.TWILIO_ACCOUNT_SID) {
        ctx.addIssue({
          code: 'custom',
          path: ['TWILIO_ACCOUNT_SID'],
          message: 'is required when VOICE_PROVIDER=twilio',
        });
      }
      if (!env.TWILIO_AUTH_TOKEN) {
        ctx.addIssue({
          code: 'custom',
          path: ['TWILIO_AUTH_TOKEN'],
          message: 'is required when VOICE_PROVIDER=twilio',
        });
      }
      if (!env.TWILIO_PHONE_NUMBER) {
        ctx.addIssue({
          code: 'custom',
          path: ['TWILIO_PHONE_NUMBER'],
          message: 'is required when VOICE_PROVIDER=twilio',
        });
      }
    }
    if (env.VOICE_PROVIDER === 'tata-smartflo') {
      if (!env.TATA_API_TOKEN) {
        ctx.addIssue({
          code: 'custom',
          path: ['TATA_API_TOKEN'],
          message: 'is required when VOICE_PROVIDER=tata-smartflo',
        });
      }
      if (!env.TATA_CLICK_TO_CALL_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['TATA_CLICK_TO_CALL_API_KEY'],
          message: 'is required when VOICE_PROVIDER=tata-smartflo',
        });
      }
      if (!env.TATA_CALLER_ID) {
        ctx.addIssue({
          code: 'custom',
          path: ['TATA_CALLER_ID'],
          message: 'is required when VOICE_PROVIDER=tata-smartflo',
        });
      }
      if (env.NODE_ENV === 'production' && !env.TATA_WEBHOOK_SHARED_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['TATA_WEBHOOK_SHARED_SECRET'],
          message: 'is required in production when VOICE_PROVIDER=tata-smartflo',
        });
      }
    }
    if (env.EMAIL_PROVIDER === 'ses') {
      // Fail fast rather than pretend: the SES adapter lands with the notifications phase.
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'ses is not implemented yet (see docs/planning/implementation-plan.md, phase 9)',
      });
    }
  })
  .transform((env) => ({
    ...env,
    CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS ?? DEVELOPMENT_ORIGINS,
    APP_WEB_URL: (env.APP_WEB_URL ?? DEVELOPMENT_WEB_URL).replace(/\/+$/, ''),
    API_PUBLIC_URL: (env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, ''),
    DATABASE_AUTO_MIGRATE: env.DATABASE_AUTO_MIGRATE ?? env.NODE_ENV !== 'production',
    COOKIE_SECURE: env.NODE_ENV === 'production',
    HUBSPOT_CONFIGURED: Boolean(env.HUBSPOT_CLIENT_ID && env.HUBSPOT_CLIENT_SECRET),
  }));

export type ApiEnv = z.output<typeof apiEnvSchema>;

export function loadApiEnv(source: EnvSource = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}
