import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.factory.js';
import { loadApiEnv } from '../../src/config/env.js';

const ALLOWED_ORIGIN = 'https://app.nivomi.test';

describe('HTTP baseline', () => {
  let app: NestExpressApplication;
  let server: App;

  beforeAll(async () => {
    app = await createApp(
      loadApiEnv({
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
        APP_VERSION: 'test-build',
      }),
    );
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/health', () => {
    it('reports liveness without caching', async () => {
      const res = await request(server).get('/api/v1/health').expect(200);

      expect(res.body).toMatchObject({ status: 'ok', version: 'test-build' });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('is only served under the versioned path', async () => {
      await request(server).get('/api/health').expect(404);
    });
  });

  describe('request correlation', () => {
    it('assigns a request ID to every response', async () => {
      const res = await request(server).get('/api/v1/health');
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('propagates a well-formed inbound request ID', async () => {
      const res = await request(server).get('/api/v1/health').set('x-request-id', 'edge-7d1e2f90');
      expect(res.headers['x-request-id']).toBe('edge-7d1e2f90');
    });

    it('replaces a malformed inbound request ID', async () => {
      const res = await request(server).get('/api/v1/health').set('x-request-id', '<bad id>');
      expect(res.headers['x-request-id']).not.toBe('<bad id>');
    });
  });

  describe('error envelope', () => {
    it('returns the standard envelope carrying the request ID', async () => {
      const res = await request(server).get('/api/v1/does-not-exist').expect(404);

      expect(res.body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: expect.any(String) as unknown,
          requestId: res.headers['x-request-id'],
        },
      });
    });
  });

  describe('security headers', () => {
    it('sets hardening headers and hides the framework', async () => {
      const res = await request(server).get('/api/v1/health');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS', () => {
    it('allows configured origins', async () => {
      const res = await request(server).get('/api/v1/health').set('Origin', ALLOWED_ORIGIN);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-expose-headers']).toContain('x-request-id');
    });

    it('does not allow other origins', async () => {
      const res = await request(server).get('/api/v1/health').set('Origin', 'https://evil.example');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('request bodies', () => {
    it('rejects JSON bodies over 1 MB', async () => {
      const oversized = JSON.stringify({ data: 'x'.repeat(1_100_000) });
      const res = await request(server)
        .post('/api/v1/health')
        .set('Content-Type', 'application/json')
        .send(oversized);

      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
    });

    it('rejects malformed JSON as a client error', async () => {
      const res = await request(server)
        .post('/api/v1/health')
        .set('Content-Type', 'application/json')
        .send('{"unterminated": ');

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    });
  });
});
