import {
  logLevelSchema,
  nodeEnvSchema,
  originListSchema,
  parseEnv,
  portSchema,
  type EnvSource,
} from '@nivomi/config';
import { z } from 'zod';

const DEVELOPMENT_ORIGINS = ['http://localhost:3000'];

export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    HOST: z.string().default('0.0.0.0'),
    PORT: portSchema.default(4000),
    LOG_LEVEL: logLevelSchema.default('info'),
    CORS_ALLOWED_ORIGINS: originListSchema.optional(),
    APP_VERSION: z.string().default('0.0.0-dev'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.CORS_ALLOWED_ORIGINS?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ALLOWED_ORIGINS'],
        message: 'is required in production',
      });
    }
  })
  .transform((env) => ({
    ...env,
    CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS ?? DEVELOPMENT_ORIGINS,
  }));

export type ApiEnv = z.output<typeof apiEnvSchema>;

export function loadApiEnv(source: EnvSource = process.env): ApiEnv {
  return parseEnv(apiEnvSchema, source);
}
