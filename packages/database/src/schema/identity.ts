import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** A person who can sign in. Email is stored normalized (trimmed, lower-case). */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** Argon2id PHC string. Never returned by the API or logged. */
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    /** Platform operator role. Granted only in the database, never through a tenant role. */
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

/** A signed-in device/browser. Revocation takes effect on the next request (ADR-018). */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Organization the session is working in; validated against membership on every request. */
    activeOrganizationId: uuid('active_organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/** Rotating refresh tokens; one family per session. Only the SHA-256 hash is stored. */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    replacedById: uuid('replaced_by_id'),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash),
    index('refresh_tokens_session_idx').on(t.sessionId),
  ],
);

const oneTimeTokenColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
};

export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  oneTimeTokenColumns,
  (t) => [
    uniqueIndex('email_verification_tokens_hash_uq').on(t.tokenHash),
    index('email_verification_tokens_user_idx').on(t.userId),
  ],
);

export const passwordResetTokens = pgTable('password_reset_tokens', oneTimeTokenColumns, (t) => [
  uniqueIndex('password_reset_tokens_hash_uq').on(t.tokenHash),
  index('password_reset_tokens_user_idx').on(t.userId),
]);
