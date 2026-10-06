import {
  bigint,
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
import { sql } from 'drizzle-orm';
import { organizations } from './organizations.js';

/** Metering, plans, invoices (ADR-027, Phase 8). */

export const usageEventKinds = [
  'CALL_MINUTES_OUTBOUND',
  'CALL_MINUTES_INBOUND',
  'STT_AUDIO_SECONDS',
  'TTS_AUDIO_SECONDS',
  'LLM_INPUT_TOKENS',
  'LLM_OUTPUT_TOKENS',
  'SMS_SENT',
  'EMAILS_SENT',
  'IMPORT_ROWS',
  'CRM_API_CALLS',
] as const;
export const usageEventKind = pgEnum('usage_event_kind', usageEventKinds);
export type UsageEventKind = (typeof usageEventKinds)[number];

export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: usageEventKind('kind').notNull(),
    quantity: bigint('quantity', { mode: 'number' }).notNull(),
    unit: text('unit').notNull(),
    /** Billing period: YYYY-MM (UTC). Derived from occurredAt by the service. */
    periodYearMonth: text('period_year_month').notNull(),
    sourceId: text('source_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('usage_events_org_period_kind_idx').on(t.organizationId, t.periodYearMonth, t.kind),
    index('usage_events_org_occurred_idx').on(t.organizationId, t.occurredAt),
    // Idempotency per source event: at most one row per (org, kind, source_id) when source_id is set.
    uniqueIndex('usage_events_source_uq')
      .on(t.organizationId, t.kind, t.sourceId)
      .where(sql`${t.sourceId} IS NOT NULL`),
  ],
);

export const planStatuses = ['ACTIVE', 'ARCHIVED'] as const;
export const planStatus = pgEnum('plan_status', planStatuses);

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    monthlyPaiseInr: bigint('monthly_paise_inr', { mode: 'number' }).notNull(),
    limits: jsonb('limits').$type<Partial<Record<UsageEventKind, number>>>().notNull(),
    overageRates: jsonb('overage_rates')
      .$type<Partial<Record<UsageEventKind, number>>>()
      .notNull()
      .default({}),
    status: planStatus('status').notNull().default('ACTIVE'),
    /** Marketing-site order; lower first. The super admin sets this independently of price. */
    displayOrder: integer('display_order').notNull().default(0),
    /** Updated by the service on every edit; used as an optimistic-concurrency token. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('plans_code_uq').on(t.code)],
);

export const orgPlanStatuses = ['ACTIVE', 'CANCELLED', 'PAUSED'] as const;
export const orgPlanStatus = pgEnum('org_plan_status', orgPlanStatuses);

export const billingCycles = ['MONTHLY', 'YEARLY'] as const;
export const billingCycle = pgEnum('billing_cycle', billingCycles);

export const organizationPlans = pgTable(
  'organization_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    cycle: billingCycle('cycle').notNull().default('MONTHLY'),
    status: orgPlanStatus('status').notNull().default('ACTIVE'),
    startsOn: timestamp('starts_on', { withTimezone: true }).notNull(),
    endsOn: timestamp('ends_on', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('organization_plans_active_uq')
      .on(t.organizationId)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);

export const invoiceStatuses = ['DRAFT', 'ISSUED', 'PAID', 'VOID'] as const;
export const invoiceStatus = pgEnum('invoice_status', invoiceStatuses);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    periodYearMonth: text('period_year_month').notNull(),
    lineItems: jsonb('line_items')
      .$type<Array<{ description: string; quantity: number; unit: string; paise: number }>>()
      .notNull(),
    subtotalPaise: bigint('subtotal_paise', { mode: 'number' }).notNull(),
    cgstPaise: bigint('cgst_paise', { mode: 'number' }).notNull().default(0),
    sgstPaise: bigint('sgst_paise', { mode: 'number' }).notNull().default(0),
    igstPaise: bigint('igst_paise', { mode: 'number' }).notNull().default(0),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('INR'),
    status: invoiceStatus('status').notNull().default('DRAFT'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    pdfS3Key: text('pdf_s3_key'),
    providerSessionId: text('provider_session_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invoices_org_period_uq').on(t.organizationId, t.periodYearMonth),
    index('invoices_org_status_idx').on(t.organizationId, t.status),
  ],
);
