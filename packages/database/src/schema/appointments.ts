import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { callSessions } from './calls.js';
import { users } from './identity.js';
import { leads } from './leads.js';
import { organizations } from './organizations.js';

/**
 * Appointments (ADR-025, Phase 6). Nivomi owns the authoritative row; calendar sync is an
 * outbound integration (deferred adapter). Status transitions are additive — a cancellation
 * writes a CANCELLED row rather than deleting.
 */

export const appointmentStatuses = [
  'SCHEDULED',
  'CONFIRMED',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
] as const;
export const appointmentStatus = pgEnum('appointment_status', appointmentStatuses);
export type AppointmentStatus = (typeof appointmentStatuses)[number];

export const appointmentChannels = ['CALL', 'IN_PERSON', 'VIDEO'] as const;
export const appointmentChannel = pgEnum('appointment_channel', appointmentChannels);
export type AppointmentChannel = (typeof appointmentChannels)[number];

export const appointmentSources = ['AI_CALL', 'MANUAL', 'INBOUND', 'IMPORT'] as const;
export const appointmentSource = pgEnum('appointment_source', appointmentSources);
export type AppointmentSource = (typeof appointmentSources)[number];

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    assigneeUserId: uuid('assignee_user_id').references(() => users.id, { onDelete: 'set null' }),
    callSessionId: uuid('call_session_id').references(() => callSessions.id, {
      onDelete: 'set null',
    }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    channel: appointmentChannel('channel').notNull(),
    locationText: text('location_text'),
    notes: text('notes'),
    status: appointmentStatus('status').notNull().default('SCHEDULED'),
    source: appointmentSource('source').notNull(),
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
    index('appointments_org_time_idx').on(t.organizationId, t.startsAt),
    index('appointments_assignee_idx').on(t.organizationId, t.assigneeUserId, t.startsAt),
    index('appointments_lead_idx').on(t.organizationId, t.leadId),
    // One appointment per call: a replay of appointment.book tool from the same call is a no-op.
    uniqueIndex('appointments_call_session_uq')
      .on(t.callSessionId)
      .where(sql`${t.callSessionId} IS NOT NULL`),
    check('appointments_duration_check', sql`${t.durationMinutes} > 0`),
  ],
);

/**
 * Member availability (ADR-025 §1). A weekly recurring template: for each day-of-week, zero or
 * more intervals in minutes from local midnight; `timezone` is an IANA zone (per org for now,
 * per user later — TECH_DEBT).
 */
export const appointmentSlots = pgTable(
  'appointment_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 0 = Sunday, 6 = Saturday. */
    dayOfWeek: integer('day_of_week').notNull(),
    startsAtMinutes: integer('starts_at_minutes').notNull(),
    endsAtMinutes: integer('ends_at_minutes').notNull(),
    timezone: text('timezone').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('appointment_slots_user_idx').on(t.organizationId, t.userId, t.dayOfWeek),
    check('appointment_slots_day_check', sql`${t.dayOfWeek} BETWEEN 0 AND 6`),
    check(
      'appointment_slots_range_check',
      sql`${t.startsAtMinutes} >= 0 AND ${t.endsAtMinutes} <= 1440 AND ${t.startsAtMinutes} < ${t.endsAtMinutes}`,
    ),
  ],
);
