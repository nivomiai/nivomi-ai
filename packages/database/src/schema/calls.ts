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
import { agentVersions } from './agents.js';
import { callAttempts } from './campaigns.js';
import { callerNumbers } from './compliance.js';
import { organizations } from './organizations.js';

/**
 * Call sessions (ADR-024, Phase 5). One row per completed call (inbound or outbound) holding
 * the transcript, the richer conversation outcome, the final qualification and the usage
 * counters. Outbound rows FK to the dial attempt in `call_attempts`; inbound rows don't.
 */

export const callDirections = ['INBOUND', 'OUTBOUND'] as const;
export const callDirection = pgEnum('call_direction', callDirections);
export type CallDirection = (typeof callDirections)[number];

/**
 * Inbound mode (ADR-024 §1): what happens when a call lands on a caller_number.
 *
 *   AI    — AiConversationService runs a turn-based conversation on `agentVersionId`.
 *   HUMAN — ExoML `<Dial>` connects the caller to `handoffE164` (voicemail / live human).
 *
 * The tenant switches between these per number from /app/telecom.
 */
export const inboundModes = ['AI', 'HUMAN'] as const;
export const inboundMode = pgEnum('inbound_mode', inboundModes);
export type InboundMode = (typeof inboundModes)[number];

export const conversationOutcomes = [
  'INTERESTED',
  'NOT_INTERESTED',
  'CALLBACK_REQUESTED',
  'COMPLETED',
  'OPTED_OUT',
  'TRANSFERRED',
  'INCOMPLETE',
] as const;
export const conversationOutcome = pgEnum('conversation_outcome', conversationOutcomes);
export type ConversationOutcomePersisted = (typeof conversationOutcomes)[number];

export const callSessions = pgTable(
  'call_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    direction: callDirection('direction').notNull(),
    callAttemptId: uuid('call_attempt_id').references(() => callAttempts.id, {
      onDelete: 'set null',
    }),
    callerNumberId: uuid('caller_number_id').references(() => callerNumbers.id, {
      onDelete: 'set null',
    }),
    agentVersionId: uuid('agent_version_id').references(() => agentVersions.id),
    fromE164: text('from_e164').notNull(),
    toE164: text('to_e164').notNull(),
    provider: text('provider').notNull(),
    providerCallId: text('provider_call_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    /** The coarse telephony outcome (`call_outcome` enum) stored as text so the FK isn't needed. */
    telephonyOutcome: text('telephony_outcome'),
    conversationOutcome: conversationOutcome('conversation_outcome'),
    transcript: jsonb('transcript')
      .$type<
        ReadonlyArray<{ role: 'agent' | 'caller'; text: string; nodeId?: string; atMs?: number }>
      >()
      .notNull()
      .default([]),
    qualification: jsonb('qualification').$type<Record<string, unknown>>(),
    usage: jsonb('usage')
      .$type<{ inputTokens: number; outputTokens: number; audioSeconds: number }>()
      .notNull()
      .default({ inputTokens: 0, outputTokens: 0, audioSeconds: 0 }),
  },
  (t) => [
    index('call_sessions_org_started_idx').on(t.organizationId, t.startedAt),
    index('call_sessions_org_direction_idx').on(t.organizationId, t.direction, t.startedAt),
    uniqueIndex('call_sessions_provider_call_uq').on(t.provider, t.providerCallId),
  ],
);

/**
 * Inbound binding (ADR-024 §1): per caller number, which Agent Version answers and where to
 * send handoffs. Kept separate from `caller_numbers` so Phase 3's telecom identity schema is
 * unchanged.
 */
export const inboundBindings = pgTable(
  'inbound_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    callerNumberId: uuid('caller_number_id')
      .notNull()
      .references(() => callerNumbers.id, { onDelete: 'cascade' }),
    mode: inboundMode('mode').notNull().default('AI'),
    /** Required when mode='AI'. Null for mode='HUMAN'. */
    agentVersionId: uuid('agent_version_id').references(() => agentVersions.id),
    /**
     * Required when mode='HUMAN'. E.164 destination the inbound call is <Dial>ed to. In mode='AI'
     * this is still allowed as an escalation target (future AgentHandoffService hop).
     */
    handoffE164: text('handoff_e164'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('inbound_bindings_number_uq').on(t.callerNumberId)],
);
