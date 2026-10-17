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
import { callCategory } from './compliance.js';
import { users } from './identity.js';
import { organizations } from './organizations.js';

export const agentStatuses = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export const agentStatus = pgEnum('agent_status', agentStatuses);
export type AgentStatus = (typeof agentStatuses)[number];

/**
 * AI Agents (PRD FR-26–FR-31, ADR-022). The row holds the editable draft; published versions are
 * immutable rows in `agent_versions`. `definition` is validated by the API's agent schema.
 */
export const aiAgents = pgTable(
  'ai_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: agentStatus('status').notNull().default('DRAFT'),
    callCategory: callCategory('call_category').notNull(),
    definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
    /** Highest published version number (0 = never published). */
    latestVersion: integer('latest_version').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('ai_agents_org_created_idx').on(t.organizationId, t.createdAt, t.id)],
);

/** Immutable published snapshots (FR-32). A trigger rejects UPDATE. */
export const agentVersions = pgTable(
  'agent_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => aiAgents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    callCategory: callCategory('call_category').notNull(),
    definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
    checksum: text('checksum').notNull(),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('agent_versions_agent_version_uq').on(t.agentId, t.version),
    index('agent_versions_org_idx').on(t.organizationId, t.agentId),
  ],
);

/** Browser test conversations (Dograh-style "Test Chat"); short-lived, marked as tests. */
export const agentTestSessions = pgTable(
  'agent_test_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => aiAgents.id, { onDelete: 'cascade' }),
    /** The version tested, or null when testing the draft (snapshot kept in `definition`). */
    agentVersionId: uuid('agent_version_id').references(() => agentVersions.id, {
      onDelete: 'cascade',
    }),
    definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
    state: jsonb('state').$type<Record<string, unknown>>().notNull(),
    transcript: jsonb('transcript').$type<Record<string, unknown>[]>().notNull(),
    turn: integer('turn').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('agent_test_sessions_agent_idx').on(t.organizationId, t.agentId, t.createdAt)],
);
