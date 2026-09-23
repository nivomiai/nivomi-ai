import { EnvValidationError } from '@nivomi/config';
import { describe, expect, it } from 'vitest';
import { loadApiEnv } from './env.js';

describe('loadApiEnv', () => {
  it('applies safe defaults outside production', () => {
    expect(loadApiEnv({ NODE_ENV: 'development' })).toEqual({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 4000,
      LOG_LEVEL: 'info',
      CORS_ALLOWED_ORIGINS: ['http://localhost:3000'],
      APP_VERSION: '0.0.0-dev',
    });
  });

  it('requires NODE_ENV', () => {
    expect(() => loadApiEnv({})).toThrow(EnvValidationError);
  });

  it('requires explicit CORS origins in production', () => {
    expect(() => loadApiEnv({ NODE_ENV: 'production' })).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('accepts a complete production configuration', () => {
    const env = loadApiEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      CORS_ALLOWED_ORIGINS: 'https://app.nivomi.ai',
      APP_VERSION: 'abc1234',
    });
    expect(env).toMatchObject({
      PORT: 8080,
      CORS_ALLOWED_ORIGINS: ['https://app.nivomi.ai'],
      APP_VERSION: 'abc1234',
    });
  });
});
