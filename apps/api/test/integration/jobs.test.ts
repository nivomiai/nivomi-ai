import { jobs } from '@nivomi/database';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobHandlerRegistry, JobQueue } from '../../src/jobs/jobs.js';
import { createTestApp, type TestApp } from '../support/harness.js';

describe('PostgreSQL job queue (ADR-019)', () => {
  let t: TestApp;
  let queue: JobQueue;
  let registry: JobHandlerRegistry;

  beforeAll(async () => {
    t = await createTestApp();
    queue = t.app.get(JobQueue);
    registry = t.app.get(JobHandlerRegistry);
  });

  afterAll(async () => {
    await t.close();
  });

  async function jobOfType(type: string) {
    const [job] = await t.db.select().from(jobs).where(eq(jobs.type, type));
    if (!job) throw new Error(`no ${type} job`);
    return job;
  }

  /** Makes a scheduled retry due now. */
  async function makeDue(type: string) {
    await t.db
      .update(jobs)
      .set({ runAt: sql`now() - interval '1 second'` })
      .where(eq(jobs.type, type));
  }

  it('runs a job once and marks it completed', async () => {
    const seen: unknown[] = [];
    registry.register('test.ok', (payload) => {
      seen.push(payload);
      return Promise.resolve();
    });
    await queue.enqueue({ type: 'test.ok', payload: { n: 1 } });
    await t.worker.drain();
    expect(seen).toEqual([{ n: 1 }]);
    const job = await jobOfType('test.ok');
    expect(job).toMatchObject({ status: 'COMPLETED', attempts: 1, lockedBy: null });
    expect(job.completedAt).toBeInstanceOf(Date);
  });

  it('deduplicates enqueues by idempotency key', async () => {
    let runs = 0;
    registry.register('test.idempotent', () => {
      runs += 1;
      return Promise.resolve();
    });
    await queue.enqueue({ type: 'test.idempotent', payload: {}, idempotencyKey: 'import-42' });
    await queue.enqueue({ type: 'test.idempotent', payload: {}, idempotencyKey: 'import-42' });
    await t.worker.drain();
    expect(runs).toBe(1);
  });

  it('retries with backoff, then dead-letters as FAILED', async () => {
    registry.register('test.flaky', () => Promise.reject(new Error('provider down')));
    await queue.enqueue({ type: 'test.flaky', payload: {}, maxAttempts: 2 });

    await t.worker.drain();
    const retrying = await jobOfType('test.flaky');
    expect(retrying).toMatchObject({ status: 'RETRYING', attempts: 1, lastError: 'provider down' });
    expect(retrying.runAt.getTime()).toBeGreaterThan(Date.now());

    await makeDue('test.flaky');
    await t.worker.drain();
    expect(await jobOfType('test.flaky')).toMatchObject({ status: 'FAILED', attempts: 2 });
  });

  it('recovers when a later attempt succeeds', async () => {
    let calls = 0;
    registry.register('test.recovers', () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('timeout')) : Promise.resolve();
    });
    await queue.enqueue({ type: 'test.recovers', payload: {} });
    await t.worker.drain();
    await makeDue('test.recovers');
    await t.worker.drain();
    expect(await jobOfType('test.recovers')).toMatchObject({ status: 'COMPLETED', attempts: 2 });
  });

  it('fails jobs that have no registered handler instead of looping', async () => {
    await queue.enqueue({ type: 'test.unknown', payload: {}, maxAttempts: 1 });
    await t.worker.drain();
    expect(await jobOfType('test.unknown')).toMatchObject({ status: 'FAILED' });
  });

  it('rolls an enqueue back with its transaction (outbox)', async () => {
    await t.db
      .transaction(async (tx) => {
        await queue.enqueue({ type: 'test.rolled-back', payload: {} }, tx);
        throw new Error('business change failed');
      })
      .catch(() => undefined);
    const rows = await t.db.select().from(jobs).where(eq(jobs.type, 'test.rolled-back'));
    expect(rows).toHaveLength(0);
  });

  it('recovers jobs whose worker died mid-run', async () => {
    let runs = 0;
    registry.register('test.orphaned', () => {
      runs += 1;
      return Promise.resolve();
    });
    await queue.enqueue({ type: 'test.orphaned', payload: {} });
    // Simulate a crashed worker: claimed long ago and never finished.
    await t.db
      .update(jobs)
      .set({
        status: 'PROCESSING',
        lockedBy: 'dead-worker',
        lockedAt: sql`now() - interval '1 hour'`,
        attempts: 1,
      })
      .where(eq(jobs.type, 'test.orphaned'));
    await t.worker.drain();
    await makeDue('test.orphaned');
    await t.worker.drain();
    expect(runs).toBe(1);
    expect(await jobOfType('test.orphaned')).toMatchObject({ status: 'COMPLETED' });
  });

  // PGlite has a single connection, so this proves overlapping drains in one process; the
  // cross-connection SKIP LOCKED guarantee needs the PostgreSQL CI job (TECH_DEBT).
  it('never runs a job twice when drains overlap', async () => {
    let runs = 0;
    registry.register('test.concurrent', async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    for (let i = 0; i < 12; i += 1) {
      await queue.enqueue({ type: 'test.concurrent', payload: { i } });
    }
    await Promise.all([t.worker.drain(), t.worker.drain(), t.worker.drain()]);
    expect(runs).toBe(12);
  });
});
