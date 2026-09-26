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
  }));

export type ApiEnv = z.output<typeof apiEnvSchema>;

export function loadApiEnv(source: EnvSource = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}
