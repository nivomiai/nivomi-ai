import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv as parseDotenv } from 'node:util';
import type { z } from 'zod';

export type EnvSource = Record<string, string | undefined>;

/**
 * Thrown when configuration is invalid. The message names each offending
 * variable and the rule it broke, but never echoes a value, because values
 * may be secrets.
 */
export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/**
 * Validates `source` against `schema` and returns the typed, transformed
 * configuration. Throws {@link EnvValidationError} on any violation so a
 * misconfigured process fails at startup instead of at first use.
 *
 * Empty values (`KEY=`) are treated as unset, so a blank entry copied from
 * `.env.example` fails a required check or falls back to the schema default
 * instead of passing validation as an empty string.
 */
export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  source: EnvSource = process.env,
): z.output<TSchema> {
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const result = schema.safeParse(present);
  if (result.success) {
    return result.data;
  }
  const issues = result.error.issues.map((issue) => {
    const key = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${key}: ${issue.message}`;
  });
  throw new EnvValidationError(issues);
}

/**
 * Loads local development env files from `dir` into `target` without
 * overriding variables that are already set, so real environment variables
 * always win.
 *
 * Files are read in priority order `.env.<NODE_ENV>.local`, `.env.local`,
 * `.env.<NODE_ENV>`. Nothing is loaded when NODE_ENV is `production`:
 * production configuration must come from the platform's secret manager,
 * never from files on disk.
 *
 * @returns the file names that were loaded
 */
export function loadEnvFiles(dir: string, target: EnvSource = process.env): string[] {
  const nodeEnv = target.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') {
    return [];
  }

  const loaded: string[] = [];
  for (const file of [`.env.${nodeEnv}.local`, '.env.local', `.env.${nodeEnv}`]) {
    const path = join(dir, file);
    if (!existsSync(path)) {
      continue;
    }
    const values = parseDotenv(readFileSync(path, 'utf8'));
    for (const [key, value] of Object.entries(values)) {
      if (target[key] === undefined) {
        target[key] = value;
      }
    }
    loaded.push(file);
  }
  return loaded;
}
