import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EnvValidationError, loadEnvFiles, parseEnv } from './env.js';

describe('parseEnv', () => {
  const schema = z.object({
    PORT: z.coerce.number().int(),
    API_SECRET: z.string().min(32),
  });

  it('returns typed, coerced configuration', () => {
    const env = parseEnv(schema, { PORT: '4000', API_SECRET: 'x'.repeat(32) });
    expect(env).toEqual({ PORT: 4000, API_SECRET: 'x'.repeat(32) });
  });

  it('reports every invalid variable in one error', () => {
    const error = captureError(() => parseEnv(schema, { PORT: 'not-a-number' }));
    expect(error).toBeInstanceOf(EnvValidationError);
    expect(error.issues).toHaveLength(2);
    expect(error.message).toContain('PORT');
    expect(error.message).toContain('API_SECRET');
  });

  it('treats empty values as unset', () => {
    const error = captureError(() => parseEnv(schema, { PORT: '4000', API_SECRET: '  ' }));
    expect(error.issues).toHaveLength(1);
    expect(error.message).toContain('API_SECRET');
  });

  it('never includes variable values in the error message', () => {
    const leakedSecret = 'sk-live-should-never-appear';
    const error = captureError(() => parseEnv(schema, { PORT: '1', API_SECRET: leakedSecret }));
    expect(error.message).toContain('API_SECRET');
    expect(error.message).not.toContain(leakedSecret);
  });
});

describe('loadEnvFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nivomi-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads files in priority order without overriding earlier values', () => {
    writeFileSync(join(dir, '.env.development.local'), 'A=from-env-local\n');
    writeFileSync(join(dir, '.env.local'), 'A=from-local\nB=from-local\n');
    writeFileSync(join(dir, '.env.development'), 'B=from-dev\nC=from-dev\n');
    const target: Record<string, string | undefined> = { NODE_ENV: 'development' };

    const loaded = loadEnvFiles(dir, target);

    expect(loaded).toEqual(['.env.development.local', '.env.local', '.env.development']);
    expect(target).toMatchObject({ A: 'from-env-local', B: 'from-local', C: 'from-dev' });
  });

  it('never overrides variables already present in the environment', () => {
    writeFileSync(join(dir, '.env.local'), 'PORT=1111\n');
    const target: Record<string, string | undefined> = { NODE_ENV: 'development', PORT: '4000' };

    loadEnvFiles(dir, target);

    expect(target.PORT).toBe('4000');
  });

  it('loads nothing in production', () => {
    writeFileSync(join(dir, '.env.local'), 'SECRET=from-disk\n');
    writeFileSync(join(dir, '.env.production'), 'SECRET=from-disk\n');
    const target: Record<string, string | undefined> = { NODE_ENV: 'production' };

    expect(loadEnvFiles(dir, target)).toEqual([]);
    expect(target.SECRET).toBeUndefined();
  });
});

function captureError(fn: () => unknown): EnvValidationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected function to throw');
}
