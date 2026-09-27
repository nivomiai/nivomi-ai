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

    EMAIL_PROVIDER: z.enum(['dev-mailbox', 'ses']).default('dev-mailbox'),
    EMAIL_FROM: z.string().default('Nivomi AI <no-reply@nivomi.ai>'),
    /** Where the development mailbox writes emails (git-ignored; never used in production). */
    EMAIL_DEV_MAILBOX_DIR: z.string().default('.data/mailbox'),

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
     * Outbound dialer (VoiceProvider, ADR-021). Only the simulated dialer exists until the Exotel
     * adapter (Phase 4); it is refused in production.
     */
    VOICE_PROVIDER: z.enum(['simulated']).default('simulated'),
    /** How long a simulated call lasts before its outcome arrives. */
    VOICE_SIMULATED_CALL_MS: z.coerce.number().int().min(0).max(600_000).default(2_000),
    /** Preference registry (NCPR/DND) lookups. Simulated only; refused in production. */
    PREFERENCE_REGISTRY: z.enum(['simulated']).default('simulated'),

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
    if (env.NODE_ENV === 'production' && env.EMAIL_PROVIDER === 'dev-mailbox') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'dev-mailbox is not allowed in production',
      });
    }
    if (env.STORAGE_PROVIDER === 'local' && env.NODE_ENV === 'production') {
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
    for (const key of ['VOICE_PROVIDER', 'PREFERENCE_REGISTRY'] as const) {
      if (env.NODE_ENV === 'production' && env[key] === 'simulated') {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'simulated is not allowed in production (real adapters arrive in phase 4)',
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
    DATABASE_AUTO_MIGRATE: env.DATABASE_AUTO_MIGRATE ?? env.NODE_ENV !== 'production',
    COOKIE_SECURE: env.NODE_ENV === 'production',
    HUBSPOT_CONFIGURED: Boolean(env.HUBSPOT_CLIENT_ID && env.HUBSPOT_CLIENT_SECRET),
  }));

export type ApiEnv = z.output<typeof apiEnvSchema>;

export function loadApiEnv(source: EnvSource = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}
