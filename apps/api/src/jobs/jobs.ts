import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { jobs, type Database } from '@nivomi/database';
import { and, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';

export interface EnqueueJob {
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly organizationId?: string | null;
  /** Deduplicates enqueues: a second job with the same key is ignored. */
  readonly idempotencyKey?: string;
  readonly runAt?: Date;
  readonly maxAttempts?: number;
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

export interface JobHandlerOptions {
  /** Per-type time limit; must stay below the stale-lock window so a job never runs twice. */
  readonly timeoutMs?: number;
}

interface RegisteredHandler {
  readonly run: JobHandler;
  readonly timeoutMs: number;
}

/**
 * Thrown by a handler when retrying cannot help (invalid input, a record that no longer exists):
 * the job fails immediately instead of retrying with backoff.
 */
export class PermanentJobError extends Error {
  override readonly name = 'PermanentJobError';
}

/** Handlers by job type. Modules register theirs at startup. */
@Injectable()
export class JobHandlerRegistry {
  private readonly handlers = new Map<string, RegisteredHandler>();

  register(type: string, handler: JobHandler, options: JobHandlerOptions = {}): void {
    if (this.handlers.has(type)) {
      throw new Error(`Job handler already registered for ${type}`);
    }
    const timeoutMs = options.timeoutMs ?? JOB_TIMEOUT_MS;
    if (timeoutMs >= STALE_LOCK_MS) {
      throw new Error(`Job timeout for ${type} must be below the stale-lock window`);
    }
    this.handlers.set(type, { run: handler, timeoutMs });
  }

  get(type: string): RegisteredHandler | undefined {
    return this.handlers.get(type);
  }
}

@Injectable()
export class JobQueue {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Enqueues a job. Pass the caller's transaction so the job commits (or rolls back) together
   * with the business change: a transactional outbox.
   */
  async enqueue(job: EnqueueJob, db: Database = this.db): Promise<void> {
    await db
      .insert(jobs)
      .values({
        type: job.type,
        payload: job.payload,
        organizationId: job.organizationId ?? null,
        idempotencyKey: job.idempotencyKey ?? null,
        runAt: job.runAt ?? new Date(),
        maxAttempts: job.maxAttempts ?? 5,
      })
      .onConflictDoNothing();
  }
}

const BATCH_SIZE = 5;
const IDLE_POLL_MS = 1_000;
const JOB_TIMEOUT_MS = 30_000;
/** A job locked longer than this belongs to a crashed worker and is retried. */
const STALE_LOCK_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;

/** Exponential backoff with full jitter: random in [0, min(cap, 2^attempt * 5s)). */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_BACKOFF_MS, 2 ** attempt * 5_000);
  return Math.floor(random() * ceiling) + 1_000;
}

@Injectable()
export class JobWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly workerId = `worker-${randomUUID().slice(0, 8)}`;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = true;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly registry: JobHandlerRegistry,
    @InjectPinoLogger(JobWorker.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.WORKER_ENABLED) return;
    this.stopped = false;
    this.schedule(0);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  /** Processes every job that is ready now (used by tests and one-off drains). */
  async drain(): Promise<number> {
    let total = 0;
    for (;;) {
      const processed = await this.tick();
      total += processed;
      if (processed === 0) return total;
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.tick()
        .then((processed) => this.schedule(processed === BATCH_SIZE ? 0 : IDLE_POLL_MS))
        .catch((error: unknown) => {
          this.logger.error({ err: error }, 'Job poll failed');
          this.schedule(IDLE_POLL_MS * 5);
        });
    }, delayMs);
  }

  /** Recovers stale locks, claims a batch and runs it. Returns the number of jobs run. */
  async tick(): Promise<number> {
    await this.db
      .update(jobs)
      .set({ status: 'RETRYING', lockedAt: null, lockedBy: null })
      .where(
        and(eq(jobs.status, 'PROCESSING'), lt(jobs.lockedAt, new Date(Date.now() - STALE_LOCK_MS))),
      );

    const claimed = await this.db
      .update(jobs)
      .set({
        status: 'PROCESSING',
        lockedAt: new Date(),
        lockedBy: this.workerId,
        attempts: sql`${jobs.attempts} + 1`,
        startedAt: sql`coalesce(${jobs.startedAt}, now())`,
      })
      .where(
        inArray(
          jobs.id,
          this.db
            .select({ id: jobs.id })
            .from(jobs)
            .where(and(inArray(jobs.status, ['PENDING', 'RETRYING']), lte(jobs.runAt, new Date())))
            .orderBy(jobs.runAt)
            .limit(BATCH_SIZE)
            .for('update', { skipLocked: true }),
        ),
      )
      .returning();

    for (const job of claimed) {
      await this.run(job);
    }
    return claimed.length;
  }

  private async run(job: typeof jobs.$inferSelect): Promise<void> {
    const handler = this.registry.get(job.type);
    try {
      if (!handler) throw new Error(`No handler registered for job type ${job.type}`);
      await withTimeout(handler.run(job.payload), handler.timeoutMs);
      await this.db
        .update(jobs)
        .set({ status: 'COMPLETED', completedAt: new Date(), lockedAt: null, lockedBy: null })
        .where(eq(jobs.id, job.id));
    } catch (error) {
      const exhausted = job.attempts >= job.maxAttempts || error instanceof PermanentJobError;
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .update(jobs)
        .set({
          status: exhausted ? 'FAILED' : 'RETRYING',
          lastError: message.slice(0, 1_000),
          runAt: exhausted ? job.runAt : new Date(Date.now() + backoffMs(job.attempts)),
          lockedAt: null,
          lockedBy: null,
        })
        .where(eq(jobs.id, job.id));
      const log = { jobId: job.id, type: job.type, attempts: job.attempts, err: error };
      if (exhausted) this.logger.error(log, 'Job failed permanently');
      else this.logger.warn(log, 'Job failed; will retry');
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Job timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
