import { EnvValidationError } from '@nivomi/config';
import { describe, expect, it } from 'vitest';
import { loadApiEnv } from './env.js';

const SECRET = 'x'.repeat(32);

const productionBase = {
  NODE_ENV: 'production',
  PORT: '8080',
  CORS_ALLOWED_ORIGINS: 'https://app.nivomi.ai',
  APP_VERSION: 'abc1234',
  DATABASE_URL: 'postgres://nivomi@db.internal:5432/nivomi',
  APP_WEB_URL: 'https://app.nivomi.ai',
  AUTH_JWT_SECRET: SECRET,
};

describe('loadApiEnv', () => {
  it('applies safe defaults outside production', () => {
    expect(loadApiEnv({ NODE_ENV: 'development', AUTH_JWT_SECRET: SECRET })).toMatchObject({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 4000,
      LOG_LEVEL: 'info',
      CORS_ALLOWED_ORIGINS: ['http://localhost:3000'],
      APP_VERSION: '0.0.0-dev',
      APP_WEB_URL: 'http://localhost:3000',
      DATABASE_PGLITE_DIR: '.data/pglite',
      DATABASE_AUTO_MIGRATE: true,
      EMAIL_PROVIDER: 'dev-mailbox',
      WORKER_ENABLED: true,
      TRUST_PROXY: false,
      COOKIE_SECURE: false,
    });
  });

  it('requires NODE_ENV and a JWT secret of at least 32 characters', () => {
    expect(() => loadApiEnv({})).toThrow(EnvValidationError);
    expect(() => loadApiEnv({ NODE_ENV: 'development' })).toThrow(/AUTH_JWT_SECRET/);
    expect(() => loadApiEnv({ NODE_ENV: 'development', AUTH_JWT_SECRET: 'short' })).toThrow(
      /at least 32/,
    );
  });

  it('never echoes secret values in validation errors', () => {
    try {
      loadApiEnv({ NODE_ENV: 'development', AUTH_JWT_SECRET: 'super-secret-but-short' });
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-but-short');
    }
  });

  it('requires CORS origins, a database URL and the web URL in production', () => {
    expect(() => loadApiEnv({ NODE_ENV: 'production', AUTH_JWT_SECRET: SECRET })).toThrow(
      /CORS_ALLOWED_ORIGINS[\s\S]*DATABASE_URL[\s\S]*APP_WEB_URL/,
    );
  });

  it('refuses the development mailbox in production', () => {
    expect(() => loadApiEnv(productionBase)).toThrow(/dev-mailbox is not allowed in production/);
  });

  it('fails fast on providers that are not implemented yet', () => {
    expect(() => loadApiEnv({ ...productionBase, EMAIL_PROVIDER: 'ses' })).toThrow(
      /ses is not implemented yet/,
    );
  });

  it('allows auto-migration to be disabled and normalizes the web URL', () => {
    const env = loadApiEnv({
      NODE_ENV: 'test',
      AUTH_JWT_SECRET: SECRET,
      DATABASE_AUTO_MIGRATE: 'false',
      APP_WEB_URL: 'https://app.nivomi.ai/',
    });
    expect(env.DATABASE_AUTO_MIGRATE).toBe(false);
    expect(env.APP_WEB_URL).toBe('https://app.nivomi.ai');
  });
});
