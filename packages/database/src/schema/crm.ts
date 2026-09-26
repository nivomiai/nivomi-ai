import { sql } from 'drizzle-orm';
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
import { users } from './identity.js';
import { organizations } from './organizations.js';

/** PRD FR-85. */
export const crmConnectionStatuses = [
  'CONNECTED',
  'DEGRADED',
  'TOKEN_INVALID',
  'DISCONNECTED',
] as const;
export const crmConnectionStatus = pgEnum('crm_connection_status', crmConnectionStatuses);
export type CrmConnectionStatus = (typeof crmConnectionStatuses)[number];

export interface CrmConnectionSettings {
  /** CRM property whose value supplies the Consent Basis (FR-19); unset = not callable. */
  readonly consentProperty?: string | null;
  /** CRM property value → Consent Basis. */
  readonly consentValueMap?: Record<string, string>;
}

/**
 * One CRM Connection per Organization (A-38), kept across disconnects so a reconnect reuses its
 * External Record Links (FR-86). Tokens are encrypted by the API before they reach this table.
 */
export const crmConnections = pgTable(
  'crm_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    externalAccountDomain: text('external_account_domain'),
    status: crmConnectionStatus('status').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    accessTokenEncrypted: text('access_token_encrypted'),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    settings: jsonb('settings').$type<CrmConnectionSettings>().notNull().default({}),
    /** Highest CRM `lastmodified` time fully ingested; incremental syncs start here (FR-137). */
    syncWatermark: timestamp('sync_watermark', { withTimezone: true }),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    connectedByUserId: uuid('connected_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('crm_connections_org_provider_uq').on(t.organizationId, t.provider),
    // A CRM account can be live in only one Organization (A-39).
    uniqueIndex('crm_connections_active_account_uq')
      .on(t.provider, t.externalAccountId)
      .where(sql`${t.status} <> 'DISCONNECTED'`),
  ],
);

export const crmSyncRunStatuses = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export const crmSyncRunStatus = pgEnum('crm_sync_run_status', crmSyncRunStatuses);

export interface CrmSyncCounts {
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  review: number;
  failed: number;
}

/** One inbound sync (initial, manual or scheduled) with a resumable cursor. */
export const crmSyncRuns = pgTable(
  'crm_sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => crmConnections.id, { onDelete: 'cascade' }),
    trigger: text('trigger').$type<'INITIAL' | 'MANUAL' | 'SCHEDULED'>().notNull(),
    mode: text('mode').$type<'FULL' | 'INCREMENTAL'>().notNull(),
    status: crmSyncRunStatus('status').notNull().default('QUEUED'),
    cursor: jsonb('cursor').$type<Record<string, unknown>>(),
    counts: jsonb('counts')
      .$type<CrmSyncCounts>()
      .notNull()
      .default({ fetched: 0, created: 0, updated: 0, skipped: 0, review: 0, failed: 0 }),
    error: text('error'),
    requestedByUserId: uuid('requested_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('crm_sync_runs_connection_idx').on(t.connectionId, t.createdAt),
    // At most one queued or running sync per connection.
    uniqueIndex('crm_sync_runs_active_uq')
      .on(t.connectionId)
      .where(sql`${t.status} in ('QUEUED', 'RUNNING')`),
  ],
);
