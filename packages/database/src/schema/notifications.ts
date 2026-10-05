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
import { users } from './identity.js';

/** Notifications pipe + per-user MFA (ADR-028, Phase 9). */

export const notificationChannels = ['EMAIL', 'SMS', 'IN_APP'] as const;
export const notificationChannel = pgEnum('notification_channel', notificationChannels);
export type NotificationChannel = (typeof notificationChannels)[number];

export const notificationAudiences = ['OWNERS', 'ADMINS', 'ALL_MEMBERS', 'SPECIFIC_USER'] as const;
export const notificationAudience = pgEnum('notification_audience', notificationAudiences);

export const notificationDefinitions = pgTable(
  'notification_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    channel: notificationChannel('channel').notNull(),
    subjectTemplate: text('subject_template').notNull(),
    bodyTemplate: text('body_template').notNull(),
    audience: notificationAudience('audience').notNull(),
    localeDefault: text('locale_default').notNull().default('en'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('notification_definitions_kind_channel_uq').on(t.kind, t.channel)],
);

export const notificationDispatchStatuses = ['QUEUED', 'SENT', 'FAILED'] as const;
export const notificationDispatchStatus = pgEnum(
  'notification_dispatch_status',
  notificationDispatchStatuses,
);

export const notificationDispatches = pgTable(
  'notification_dispatches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    kind: text('kind').notNull(),
    channel: notificationChannel('channel').notNull(),
    recipient: text('recipient').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    status: notificationDispatchStatus('status').notNull().default('QUEUED'),
    sourceEntityId: text('source_entity_id'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('notification_dispatches_dedupe_uq').on(
      t.organizationId,
      t.kind,
      t.channel,
      t.recipient,
      t.sourceEntityId,
    ),
    index('notification_dispatches_queue_idx').on(t.status, t.createdAt),
  ],
);

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    channel: notificationChannel('channel').notNull(),
    enabled: text('enabled').notNull().default('true'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('notification_preferences_uq').on(t.userId, t.kind, t.channel)],
);

export const mfaMethods = ['TOTP'] as const;
export const mfaMethod = pgEnum('mfa_method', mfaMethods);

export const userMfa = pgTable(
  'user_mfa',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    method: mfaMethod('method').notNull().default('TOTP'),
    /** Encrypted TOTP seed (envelope-encrypted in prod; static key in dev — TECH_DEBT). */
    secretEncrypted: text('secret_encrypted').notNull(),
    recoveryCodesEncrypted: jsonb('recovery_codes_encrypted')
      .$type<string[]>()
      .notNull()
      .default([]),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('user_mfa_user_uq').on(t.userId)],
);
