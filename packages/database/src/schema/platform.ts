import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Security and administrative audit trail (PRD FR-122). Append-only; no foreign keys so records
 * outlive the users and organizations they mention. Never holds secrets or tokens.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id'),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    requestId: text('request_id'),
    ipAddress: text('ip_address'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_org_created_idx').on(t.organizationId, t.createdAt),
    index('audit_logs_actor_created_idx').on(t.actorUserId, t.createdAt),
  ],
);

export const jobStatuses = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'RETRYING',
  'CANCELLED',
] as const;
export const jobStatus = pgEnum('job_status', jobStatuses);

/** Durable background jobs claimed with FOR UPDATE SKIP LOCKED (ADR-019). */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: jobStatus('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    idempotencyKey: text('idempotency_key'),
    organizationId: uuid('organization_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('jobs_ready_idx').on(t.status, t.runAt),
    uniqueIndex('jobs_idempotency_uq')
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);
