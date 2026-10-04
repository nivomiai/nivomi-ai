import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * CRM write-back outbox (ADR-026, Phase 7). One row per projection push to a tenant's connected
 * CRM. The projection hash makes a replay a no-op (unique on org+kind+entity+hash). Failed
 * pushes are retried with backoff; permanent failures end in `DEAD_LETTER`.
 */

export const crmSyncJobKinds = [
  'PUSH_LEAD_STATUS',
  'PUSH_CALL_OUTCOME',
  'PUSH_OPT_OUT',
  'PUSH_APPOINTMENT',
] as const;
export const crmSyncJobKind = pgEnum('crm_sync_job_kind', crmSyncJobKinds);
export type CrmSyncJobKind = (typeof crmSyncJobKinds)[number];

export const crmSyncJobStatuses = ['PENDING', 'DONE', 'DEAD_LETTER'] as const;
export const crmSyncJobStatus = pgEnum('crm_sync_job_status', crmSyncJobStatuses);
export type CrmSyncJobStatus = (typeof crmSyncJobStatuses)[number];

export const crmSyncJobs = pgTable(
  'crm_sync_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: crmSyncJobKind('kind').notNull(),
    /** The Nivomi entity being projected (lead id, call session id, appointment id, etc.). */
    entityId: uuid('entity_id').notNull(),
    projectionHash: text('projection_hash').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: crmSyncJobStatus('status').notNull().default('PENDING'),
    attempts: text('attempts_count').notNull().default('0'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('crm_sync_jobs_dedupe_uq').on(
      t.organizationId,
      t.kind,
      t.entityId,
      t.projectionHash,
    ),
    index('crm_sync_jobs_pending_idx').on(t.organizationId, t.status, t.createdAt),
  ],
);

/**
 * HubSpot webhook event log (ADR-026 §3). Replay protection: unique on (install_id, event_id).
 * Signature verification is enforced in the webhook controller before an event is written here.
 */
export const crmWebhookEvents = pgTable(
  'crm_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    installId: text('install_id').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    subscriptionType: text('subscription_type').notNull(),
    rawJsonb: jsonb('raw_jsonb').$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('crm_webhook_events_dedupe_uq').on(t.installId, t.providerEventId),
    index('crm_webhook_events_install_idx').on(t.installId, t.receivedAt),
  ],
);
