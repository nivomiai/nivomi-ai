import {
  boolean,
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
import { consentBasis, contacts, leads, type ConsentEvidence } from './leads.js';
import { organizations } from './organizations.js';

/** A Rule Set stays DRAFT until counsel approves it (ADR-014, ADR-021). */
export const ruleSetStatuses = ['DRAFT', 'APPROVED', 'RETIRED'] as const;
export const ruleSetStatus = pgEnum('rule_set_status', ruleSetStatuses);
export type RuleSetStatus = (typeof ruleSetStatuses)[number];

export interface RuleSetSource {
  readonly id: string;
  readonly title: string;
  readonly reference: string;
}

/**
 * Versioned, per-jurisdiction regulatory rules (ADR-021). Platform-owned reference data: no
 * tenant, never edited after insert — a change is a new version with its own effective dates.
 */
export const complianceRuleSets = pgTable(
  'compliance_rule_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jurisdiction: text('jurisdiction').notNull(),
    version: integer('version').notNull(),
    status: ruleSetStatus('status').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    /** Rule data, validated by the API's rule-set schema. */
    rules: jsonb('rules').$type<Record<string, unknown>>().notNull(),
    sources: jsonb('sources').$type<RuleSetSource[]>().notNull(),
    reviewNote: text('review_note'),
    /** SHA-256 of the canonical rules and sources; a stored version must never change. */
    checksum: text('checksum').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('compliance_rule_sets_version_uq').on(t.jurisdiction, t.version)],
);

/** PRD FR-6/CR-9 sectors; also map to the NCPR preference categories through rule data. */
export const businessSectors = [
  'BFSI',
  'REAL_ESTATE',
  'EDUCATION',
  'HEALTH',
  'CONSUMER_GOODS_AUTOMOBILES',
  'COMMUNICATION_IT_ENTERTAINMENT',
  'TOURISM_LEISURE',
  'FOOD_BEVERAGES',
  'OTHER',
] as const;
export const businessSector = pgEnum('business_sector', businessSectors);
export type BusinessSector = (typeof businessSectors)[number];

/**
 * An Organization's calling controls: Emergency Stop (FR-43) and the complaint breaker (FR-49).
 * One row per Organization, created on first use; a missing row means "no stop, no breaker".
 */
export const organizationCallingControls = pgTable('organization_calling_controls', {
  organizationId: uuid('organization_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  /** Jurisdiction whose rules govern organization-level checks (FR-6, default IN). */
  defaultJurisdiction: text('default_jurisdiction').notNull().default('IN'),
  emergencyStopActive: boolean('emergency_stop_active').notNull().default(false),
  emergencyStoppedAt: timestamp('emergency_stopped_at', { withTimezone: true }),
  emergencyStoppedByUserId: uuid('emergency_stopped_by_user_id'),
  emergencyStopReason: text('emergency_stop_reason'),
  breakerTrippedAt: timestamp('breaker_tripped_at', { withTimezone: true }),
  breakerReason: text('breaker_reason'),
  breakerAcknowledgedAt: timestamp('breaker_acknowledged_at', { withTimezone: true }),
  breakerAcknowledgedByUserId: uuid('breaker_acknowledged_by_user_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** PRD FR-10. Only VERIFIED allows calls. */
export const telecomIdentityStatuses = [
  'UNVERIFIED',
  'PENDING_REVIEW',
  'VERIFIED',
  'EXPIRED',
  'REVOKED',
] as const;
export const telecomIdentityStatus = pgEnum('telecom_identity_status', telecomIdentityStatuses);
export type TelecomIdentityStatus = (typeof telecomIdentityStatuses)[number];

/** The Organization's registered-sender details (PRD FR-9). One per Organization. */
export const telecomIdentities = pgTable(
  'telecom_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    status: telecomIdentityStatus('status').notNull().default('UNVERIFIED'),
    legalName: text('legal_name'),
    /** DLT principal-entity registration ID. */
    dltEntityId: text('dlt_entity_id'),
    telemarketerName: text('telemarketer_name'),
    telemarketerRegistrationId: text('telemarketer_registration_id'),
    sector: businessSector('sector'),
    /** The A2P / auto-dialer declaration filed with the originating operator. */
    a2pDeclarationReference: text('a2p_declaration_reference'),
    a2pDeclaredAt: timestamp('a2p_declared_at', { withTimezone: true }),
    /** Annual self-certification; its validity comes from the Rule Set. */
    selfCertifiedAt: timestamp('self_certified_at', { withTimezone: true }),
    statusReason: text('status_reason'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submittedByUserId: uuid('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('telecom_identities_org_uq').on(t.organizationId)],
);

export const callCategories = ['PROMOTIONAL', 'SERVICE', 'TRANSACTIONAL'] as const;
export const callCategory = pgEnum('call_category', callCategories);
export type CallCategory = (typeof callCategories)[number];

export const callerNumberPurposes = ['PROMOTIONAL', 'SERVICE'] as const;
export const callerNumberPurpose = pgEnum('caller_number_purpose', callerNumberPurposes);

export const callerNumberStatuses = ['ACTIVE', 'PAUSED', 'RETIRED'] as const;
export const callerNumberStatus = pgEnum('caller_number_status', callerNumberStatuses);

/** PRD FR-11: each Caller Number belongs to exactly one Organization. */
export const callerNumbers = pgTable(
  'caller_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    phoneE164: text('phone_e164').notNull(),
    /** Series classified by the Rule Set when added (display only; re-checked at every dial). */
    series: text('series').notNull(),
    purpose: callerNumberPurpose('purpose').notNull(),
    a2pDeclared: boolean('a2p_declared').notNull().default(false),
    status: callerNumberStatus('status').notNull().default('ACTIVE'),
    statusReason: text('status_reason'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Global: a number can never be assigned to two Organizations.
    uniqueIndex('caller_numbers_phone_uq').on(t.phoneE164),
    index('caller_numbers_org_idx').on(t.organizationId),
  ],
);

export const consentEntryKinds = ['GRANT', 'REVOCATION'] as const;
export const consentEntryKind = pgEnum('consent_entry_kind', consentEntryKinds);
export type ConsentEntryKind = (typeof consentEntryKinds)[number];

/**
 * Telecom consent ledger (FR-52): consent to be called on a number. Append-only (a trigger
 * rejects UPDATE); revocation is a new entry. Independent of the DPDP ledger.
 */
export const telecomConsentEntries = pgTable(
  'telecom_consent_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    /** Telecom consent attaches to the number, not the person. */
    phoneE164: text('phone_e164').notNull(),
    kind: consentEntryKind('kind').notNull(),
    basis: consentBasis('basis'),
    evidence: jsonb('evidence').$type<ConsentEvidence>(),
    /** When the consent or inquiry was given (evidence timestamp); validity runs from here. */
    validFrom: timestamp('valid_from', { withTimezone: true }),
    /** Where the entry came from: FILE_IMPORT, HUBSPOT, MANUAL, MEMBER, IN_CALL_OPT_OUT, BACKFILL… */
    source: text('source').notNull(),
    /** True when the person themselves opted back in (lifts the re-consent block, FR-51). */
    recipientInitiated: boolean('recipient_initiated').notNull().default(false),
    note: text('note'),
    recordedByUserId: uuid('recorded_by_user_id'),
    /** Idempotency: the same triggering event yields one entry. */
    eventKey: text('event_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('telecom_consent_event_uq').on(t.organizationId, t.eventKey),
    index('telecom_consent_phone_idx').on(t.organizationId, t.phoneE164, t.createdAt),
    index('telecom_consent_contact_idx').on(t.organizationId, t.contactId, t.createdAt),
  ],
);

/**
 * DPDP consent ledger (FR-52, CR-11): consent to process the person's data for a purpose.
 * Append-only and independent of telecom consent.
 */
export const dpdpConsentEntries = pgTable(
  'dpdp_consent_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    kind: consentEntryKind('kind').notNull(),
    purpose: text('purpose').notNull(),
    noticeVersion: text('notice_version'),
    evidence: jsonb('evidence').$type<ConsentEvidence>(),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    source: text('source').notNull(),
    note: text('note'),
    recordedByUserId: uuid('recorded_by_user_id'),
    eventKey: text('event_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('dpdp_consent_event_uq').on(t.organizationId, t.eventKey),
    index('dpdp_consent_contact_idx').on(t.organizationId, t.contactId, t.createdAt),
  ],
);

export const complaintKinds = ['COMPLAINT', 'OPERATOR_FLAG'] as const;
export const complaintKind = pgEnum('complaint_kind', complaintKinds);

/** Complaint Records and operator spam flags that feed the complaint breaker (FR-49, FR-13). */
export const complaintRecords = pgTable(
  'complaint_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: complaintKind('kind').notNull(),
    callerNumberId: uuid('caller_number_id').references(() => callerNumbers.id, {
      onDelete: 'set null',
    }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    reference: text('reference'),
    note: text('note'),
    recordedByUserId: uuid('recorded_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('complaint_records_org_received_idx').on(t.organizationId, t.receivedAt),
    index('complaint_records_org_created_idx').on(t.organizationId, t.createdAt, t.id),
  ],
);
