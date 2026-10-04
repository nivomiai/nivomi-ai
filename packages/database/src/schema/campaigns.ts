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
import { users } from './identity.js';
import { callCategory, callerNumbers, complianceRuleSets } from './compliance.js';
import { leads, type dataSources, type leadStatuses } from './leads.js';
import { organizations } from './organizations.js';

/** PRD FR-37. */
export const campaignStatuses = [
  'DRAFT',
  'SCHEDULED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'STOPPED',
] as const;
export const campaignStatus = pgEnum('campaign_status', campaignStatuses);
export type CampaignStatus = (typeof campaignStatuses)[number];

/** Static: the leads selected at the pre-launch check. Continuous: new matches join (A-17). */
export const campaignTypes = ['STATIC', 'CONTINUOUS'] as const;
export const campaignType = pgEnum('campaign_type', campaignTypes);

export interface CampaignSelection {
  readonly kind: 'FILTER' | 'LIST';
  /** FILTER: lead statuses to include (empty = the default callable statuses). */
  readonly statuses?: readonly (typeof leadStatuses)[number][] | undefined;
  readonly sources?: readonly (typeof dataSources)[number][] | undefined;
  /** LIST: explicit lead ids. */
  readonly leadIds?: readonly string[] | undefined;
}

export const eligibilityResults = ['ELIGIBLE', 'BLOCKED', 'DEFERRED', 'REQUIRES_REVIEW'] as const;
export const eligibilityResult = pgEnum('eligibility_result', eligibilityResults);
export type EligibilityResultValue = (typeof eligibilityResults)[number];

export interface EligibilityReasonRecord {
  readonly code: string;
  readonly result: EligibilityResultValue;
  readonly message: string;
}

/** FR-36: the dry run over the selection, kept on the Campaign. */
export interface PrelaunchSummary {
  /** Identifies one check; a newer check supersedes it. */
  readonly checkId: string;
  readonly status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  readonly requestedAt: string;
  readonly completedAt: string | null;
  readonly total: number;
  readonly eligible: number;
  readonly deferred: number;
  readonly blocked: number;
  readonly review: number;
  /** Reason code → leads it applied to. */
  readonly byReason: Record<string, number>;
  readonly ruleSetVersion: number | null;
  /** Resume point (last lead id) while RUNNING. */
  readonly cursor: string | null;
  readonly error: string | null;
}

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: campaignStatus('status').notNull().default('DRAFT'),
    type: campaignType('type').notNull(),
    callCategory: callCategory('call_category').notNull(),
    callerNumberId: uuid('caller_number_id').references(() => callerNumbers.id, {
      onDelete: 'set null',
    }),
    selection: jsonb('selection').$type<CampaignSelection>().notNull(),
    /** Daily window, HH:MM in the recipient's local time; narrowed further by the Rule Set. */
    windowStart: text('window_start').notNull(),
    windowEnd: text('window_end').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    maxConcurrentCalls: integer('max_concurrent_calls').notNull(),
    maxCallsPerHour: integer('max_calls_per_hour').notNull(),
    maxAttempts: integer('max_attempts').notNull(),
    retryIntervalMinutes: integer('retry_interval_minutes').notNull(),
    maxAttemptsPerDay: integer('max_attempts_per_day').notNull(),
    budgetMinutes: integer('budget_minutes').notNull(),
    usedSeconds: integer('used_seconds').notNull().default(0),
    /** Machine-readable reason for the current PAUSED/STOPPED state (e.g. EMERGENCY_STOP). */
    pauseReason: text('pause_reason'),
    prelaunch: jsonb('prelaunch').$type<PrelaunchSummary>(),
    /**
     * The token the next campaign tick must carry. Each tick issues a new one, and launch or
     * resume replace it, so exactly one tick chain runs per campaign (ADR-021).
     */
    tickToken: uuid('tick_token'),
    launchedAt: timestamp('launched_at', { withTimezone: true }),
    launchedByUserId: uuid('launched_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Last change by a Member to the definition; a pre-launch check must be newer. */
    editedAt: timestamp('edited_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('campaigns_org_created_idx').on(t.organizationId, t.createdAt, t.id),
    index('campaigns_org_status_idx').on(t.organizationId, t.status),
  ],
);

/** A Lead's run state within one Campaign. */
export const campaignLeadStates = [
  'PENDING',
  'QUEUED',
  'IN_CALL',
  'WAITING',
  'BLOCKED',
  'REVIEW',
  'EXCLUDED',
  'DONE',
] as const;
export const campaignLeadState = pgEnum('campaign_lead_state', campaignLeadStates);
export type CampaignLeadState = (typeof campaignLeadStates)[number];

/** Telephony and conversation dispositions that drive retries (FR-40). */
export const callOutcomes = [
  'CONNECTED',
  'NO_ANSWER',
  'BUSY',
  'FAILED',
  'PROVIDER_ERROR',
  'OPTED_OUT',
  'NOT_INTERESTED',
  'WRONG_NUMBER',
] as const;
export const callOutcome = pgEnum('call_outcome', callOutcomes);
export type CallOutcome = (typeof callOutcomes)[number];

export const campaignLeads = pgTable(
  'campaign_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    state: campaignLeadState('state').notNull().default('PENDING'),
    attemptsMade: integer('attempts_made').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    /** Issued when the lead is queued; only the dial job carrying it may act (exactly once). */
    dialToken: uuid('dial_token'),
    lastResult: eligibilityResult('last_result'),
    /** Reason codes of the last decision, for "blocked by reason" (FR-42). */
    lastReasons: jsonb('last_reasons').$type<string[]>().notNull().default([]),
    lastOutcome: callOutcome('last_outcome'),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('campaign_leads_campaign_lead_uq').on(t.campaignId, t.leadId),
    index('campaign_leads_due_idx').on(t.campaignId, t.state, t.nextAttemptAt),
    index('campaign_leads_lead_idx').on(t.organizationId, t.leadId),
  ],
);

export const eligibilityPurposes = ['PRE_LAUNCH', 'DIAL'] as const;
export const eligibilityPurpose = pgEnum('eligibility_purpose', eligibilityPurposes);

/**
 * Every eligibility decision (FR-48, ADR-021): inputs snapshot, rule-set version, result and
 * reasons. Append-only (a trigger rejects UPDATE).
 */
export const eligibilityDecisions = pgTable(
  'eligibility_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }),
    purpose: eligibilityPurpose('purpose').notNull(),
    result: eligibilityResult('result').notNull(),
    reasons: jsonb('reasons').$type<EligibilityReasonRecord[]>().notNull(),
    ruleSetId: uuid('rule_set_id').references(() => complianceRuleSets.id),
    ruleSetVersion: integer('rule_set_version'),
    jurisdiction: text('jurisdiction'),
    inputs: jsonb('inputs').$type<Record<string, unknown>>().notNull(),
    nextEligibleAt: timestamp('next_eligible_at', { withTimezone: true }),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('eligibility_decisions_lead_idx').on(t.organizationId, t.leadId, t.createdAt),
    index('eligibility_decisions_campaign_idx').on(t.campaignId, t.createdAt),
  ],
);

export const eligibilityReviewStatuses = ['OPEN', 'RESOLVED', 'EXCLUDED'] as const;
export const eligibilityReviewStatus = pgEnum(
  'eligibility_review_status',
  eligibilityReviewStatuses,
);

/** The REQUIRES_REVIEW queue (FR-50). One open item per campaign lead. */
export const eligibilityReviews = pgTable(
  'eligibility_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    campaignLeadId: uuid('campaign_lead_id')
      .notNull()
      .references(() => campaignLeads.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    decisionId: uuid('decision_id')
      .notNull()
      .references(() => eligibilityDecisions.id, { onDelete: 'cascade' }),
    reasons: jsonb('reasons').$type<EligibilityReasonRecord[]>().notNull(),
    status: eligibilityReviewStatus('status').notNull().default('OPEN'),
    resolution: text('resolution'),
    resolutionNote: text('resolution_note'),
    resolvedByUserId: uuid('resolved_by_user_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('eligibility_reviews_open_uq')
      .on(t.campaignLeadId)
      .where(sql`${t.status} = 'OPEN'`),
    index('eligibility_reviews_org_status_idx').on(t.organizationId, t.status, t.createdAt),
  ],
);

export const callAttemptStatuses = ['DIALING', 'COMPLETED'] as const;
export const callAttemptStatus = pgEnum('call_attempt_status', callAttemptStatuses);

/** One dial of one Lead in one Campaign; idempotent on (campaign, lead, attempt number). */
export const callAttempts = pgTable(
  'call_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    campaignLeadId: uuid('campaign_lead_id')
      .notNull()
      .references(() => campaignLeads.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull(),
    decisionId: uuid('decision_id')
      .notNull()
      .references(() => eligibilityDecisions.id),
    callerNumberId: uuid('caller_number_id').references(() => callerNumbers.id, {
      onDelete: 'set null',
    }),
    toPhoneE164: text('to_phone_e164').notNull(),
    status: callAttemptStatus('status').notNull().default('DIALING'),
    outcome: callOutcome('outcome'),
    provider: text('provider').notNull(),
    providerCallId: text('provider_call_id'),
    /** Set, and committed, before the provider is asked to dial: a retry never dials again. */
    dialRequestedAt: timestamp('dial_requested_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('call_attempts_attempt_uq').on(t.campaignId, t.leadId, t.attemptNumber),
    uniqueIndex('call_attempts_provider_call_uq').on(t.provider, t.providerCallId),
    index('call_attempts_campaign_idx').on(t.campaignId, t.status, t.createdAt),
    index('call_attempts_lead_idx').on(t.organizationId, t.leadId, t.createdAt),
  ],
);
