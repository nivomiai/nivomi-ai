import type { DatabaseHandle } from '@nivomi/database';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE_HANDLE } from '../../src/database/database.module.js';
import { body, createTestApp, type TestApp } from '../support/harness.js';

describe('graceful degradation when PostgreSQL is down', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    // Simulate an outage: the connection goes away underneath the running app.
    await t.app.get<DatabaseHandle>(DATABASE_HANDLE).close();
  });

  afterAll(async () => {
    await t.close().catch(() => undefined);
  });

  it('keeps liveness up so the task is not killed for a dependency outage', async () => {
    await request(t.server).get('/api/v1/health').expect(200);
  });

  it('reports not-ready with a retryable dependency error', async () => {
    const res = await request(t.server).get('/api/v1/health/ready').expect(503);
    expect(body(res).error).toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE', retryable: true });
    expect(JSON.stringify(res.body)).not.toMatch(/pglite|closed|stack/i);
  });

  it('never leaks internals from failing endpoints', async () => {
    const res = await request(t.server)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '10.9.9.9')
      .send({ email: 'someone@example.com', password: 'whatever password' });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(res.body)).not.toMatch(/pglite|closed|stack|select/i);
  });
});
