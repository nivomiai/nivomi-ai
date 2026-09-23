import { z } from 'zod';

/** Deployment environment. Required: a process must never guess whether it is in production. */
export const nodeEnvSchema = z.enum(['development', 'test', 'production']);
export type NodeEnv = z.infer<typeof nodeEnvSchema>;

export const logLevelSchema = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const portSchema = z.coerce.number().int().min(1).max(65_535);

/** Comma-separated list of absolute http(s) origins, e.g. `https://app.nivomi.ai,https://admin.nivomi.ai`. */
export const originListSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )
  .pipe(
    z.array(
      z
        .url({ protocol: /^https?$/, message: 'must be an absolute http(s) origin' })
        // Zod runs refinements even after the url check fails, so guard the parse.
        .refine((value) => URL.canParse(value) && new URL(value).origin === value, {
          message: 'must be a bare origin (scheme://host[:port]) with no path or trailing slash',
        }),
    ),
  );
