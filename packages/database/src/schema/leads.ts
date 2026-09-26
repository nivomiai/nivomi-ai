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

/** PRD FR-23: the default Lead lifecycle. */
export const leadStatuses = [
  'NEW',
  'CONTACTED',
  'ATTEMPTED',
  'CONNECTED',
  'INTERESTED',
  'QUALIFIED',
  'CALLBACK_REQUESTED',
  'FOLLOW_UP',
  'APPOINTMENT_BOOKED',
  'CONVERTED',
  'NOT_INTERESTED',
  'UNREACHABLE',
  'DO_NOT_CALL',
  'CLOSED',
] as const;
export const leadStatus = pgEnum('lead_status', leadStatuses);

/** Where a record entered Nivomi (PRD FR-129). */
export const dataSources = ['FILE_IMPORT', 'HUBSPOT', 'MANUAL', 'INBOUND'] as const;
export const dataSource = pgEnum('data_source', dataSources);

/** PRD glossary: the recorded reason an Organization believes it may contact a Lead (FR-16). */
export const consentBases = [
  'INQUIRY',
  'APPLICATION',
  'REGISTERED_CONSENT',
  'EXISTING_CUSTOMER',
] as const;
export const consentBasis = pgEnum('consent_basis', consentBases);

/** Who caused a Lead Status transition (FR-24). */
export const statusChangeSources = ['AI_CALL', 'MEMBER', 'IMPORT', 'HUBSPOT', 'SYSTEM'] as const;
export const statusChangeSource = pgEnum('status_change_source', statusChangeSources);

export const suppressionSources = ['MANUAL', 'IMPORT', 'IN_CALL_OPT_OUT', 'HUBSPOT'] as const;
export const suppressionSource = pgEnum('suppression_source', suppressionSources);

export interface ConsentEvidence {
  /** ISO timestamp of the inquiry or consent. */
  readonly at: string | null;
  /** Form, portal, campaign, CRM… */
  readonly source: string | null;
  readonly reference: string | null;
  /** Required for REGISTERED_CONSENT. */
  readonly operatorConsentReference: string | null;
  /** The Member who attested the basis for an import batch, if any. */
  readonly attestedByUserId: string | null;
}

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Lower-cased, whitespace-collapsed name used for matching within the Organization. */
    nameNormalized: text('name_normalized').notNull(),
    domain: text('domain'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('companies_org_name_uq').on(t.organizationId, t.nameNormalized)],
);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    firstName: text('first_name'),
    lastName: text('last_name'),
    fullName: text('full_name').notNull(),
    email: text('email'),
    emailNormalized: text('email_normalized'),
    /** E.164 (PRD FR-15). */
    phoneE164: text('phone_e164'),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'set null' }),
    jobTitle: text('job_title'),
    city: text('city'),
    state: text('state'),
    country: text('country'),
    preferredLanguage: text('preferred_language'),
    customFields: jsonb('custom_fields').$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Deduplication lookups (FR-17); not unique because uncertain matches go to review.
    index('contacts_org_phone_idx').on(t.organizationId, t.phoneE164),
    index('contacts_org_email_idx').on(t.organizationId, t.emailNormalized),
  ],
);

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    status: leadStatus('status').notNull().default('NEW'),
    source: dataSource('source').notNull(),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    consentBasis: consentBasis('consent_basis'),
    consentEvidence: jsonb('consent_evidence').$type<ConsentEvidence>(),
    /** Stored as data only; predictive scoring is out of scope (FR-125). */
    score: text('score'),
    /** Read-only CRM context (e.g. the HubSpot lead's name, type and label). */
    crmDetails: jsonb('crm_details').$type<Record<string, string>>(),
    /** Last manual change by a Member; AI outcomes older than this never override it (FR-25). */
    memberStatusChangedAt: timestamp('member_status_changed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // One open Lead per Contact (PRD A-79).
    uniqueIndex('leads_open_contact_uq')
      .on(t.contactId)
      .where(sql`${t.status} not in ('CONVERTED', 'CLOSED')`),
    index('leads_org_created_idx').on(t.organizationId, t.createdAt, t.id),
    index('leads_org_status_idx').on(t.organizationId, t.status),
    index('leads_org_owner_idx').on(t.organizationId, t.ownerUserId),
  ],
);

/** Every Lead Status transition, idempotent per triggering event (FR-24). */
export const leadStatusChanges = pgTable(
  'lead_status_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    fromStatus: leadStatus('from_status'),
    toStatus: leadStatus('to_status').notNull(),
    source: statusChangeSource('source').notNull(),
    actorUserId: uuid('actor_user_id'),
    reason: text('reason'),
    /** Identifies the triggering event; processing the same event twice yields one row. */
    eventKey: text('event_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('lead_status_changes_event_uq').on(t.leadId, t.eventKey),
    index('lead_status_changes_lead_idx').on(t.leadId, t.createdAt),
  ],
);

/** Numbers that must never be called (FR-22). Most restrictive source wins. */
export const suppressionEntries = pgTable(
  'suppression_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    phoneE164: text('phone_e164').notNull(),
    source: suppressionSource('source').notNull(),
    reason: text('reason'),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('suppression_org_phone_uq').on(t.organizationId, t.phoneE164)],
);

export const externalEntityTypes = ['contact', 'company', 'lead'] as const;
export type ExternalEntityType = (typeof externalEntityTypes)[number];

/**
 * External Record Links (FR-129, ADR-017): a Nivomi record's identity in another system. An
 * external ID is never a Nivomi primary key; a record found in several sources keeps every link.
 */
export const externalRecordLinks = pgTable(
  'external_record_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    /** e.g. the HubSpot portal (hub) ID, so records from two accounts are never mixed. */
    externalAccountId: text('external_account_id').notNull(),
    externalObjectType: text('external_object_type').notNull(),
    externalId: text('external_id').notNull(),
    entityType: text('entity_type').$type<ExternalEntityType>().notNull(),
    entityId: uuid('entity_id').notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('external_links_identity_uq').on(
      t.organizationId,
      t.provider,
      t.externalAccountId,
      t.externalObjectType,
      t.externalId,
    ),
    index('external_links_entity_idx').on(t.organizationId, t.entityType, t.entityId),
  ],
);

export const reviewItemStatuses = [
  'OPEN',
  'RESOLVED_CREATED',
  'RESOLVED_UPDATED',
  'DISCARDED',
] as const;
export const reviewItemStatus = pgEnum('review_item_status', reviewItemStatuses);

/** Uncertain deduplication matches, never merged automatically (FR-17). */
export const ingestionReviewItems = pgTable(
  'ingestion_review_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    source: dataSource('source').notNull(),
    /** Import job or CRM sync run that produced the item. */
    sourceReference: text('source_reference'),
    record: jsonb('record').$type<Record<string, unknown>>().notNull(),
    candidateContactIds: jsonb('candidate_contact_ids').$type<string[]>().notNull(),
    reason: text('reason').notNull(),
    status: reviewItemStatus('status').notNull().default('OPEN'),
    resolvedByUserId: uuid('resolved_by_user_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('review_items_org_status_idx').on(t.organizationId, t.status, t.createdAt)],
);

/**
 * Field-level history for Contacts and Leads (FR-138): whenever a source overwrites a stored
 * value, the old and new values are kept here. Also feeds the Lead timeline (FR-21).
 */
export const recordHistory = pgTable(
  'record_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').$type<'contact' | 'lead'>().notNull(),
    entityId: uuid('entity_id').notNull(),
    field: text('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    source: dataSource('source').notNull(),
    /** Import job, CRM sync run or Member that made the change. */
    sourceReference: text('source_reference'),
    actorUserId: uuid('actor_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('record_history_entity_idx').on(t.organizationId, t.entityType, t.entityId)],
);
