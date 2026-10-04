import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';

/**
 * Account/tenant role. Platform Super Admin is `users.is_super_admin`, never a tenant role.
 *
 * - INDV_USER: solo workspace from the public /signup flow. One member, no invites.
 * - ORGANIZATION: multi-user team account provisioned by a Super Admin.
 * - CUSTOM_PLAN: enterprise/bespoke account provisioned by a Super Admin.
 *
 * Within a tenant every member shares the tenant's role, so permissions depend on the role
 * alone (no OWNER/ADMIN/MANAGER sub-hierarchy anymore).
 */
export const organizationRoles = ['INDV_USER', 'ORGANIZATION', 'CUSTOM_PLAN'] as const;
export const organizationRole = pgEnum('organization_role', organizationRoles);

/** PRD FR-7: new organizations wait for approval before they can place calls. */
export const organizationStatus = pgEnum('organization_status', [
  'PENDING_APPROVAL',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED',
]);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: organizationStatus('status').notNull().default('PENDING_APPROVAL'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('organizations_slug_uq').on(t.slug)],
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: organizationRole('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('organization_members_org_user_uq').on(t.organizationId, t.userId),
    index('organization_members_user_idx').on(t.userId),
  ],
);

export const organizationInvitations = pgTable(
  'organization_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: organizationRole('role').notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('organization_invitations_hash_uq').on(t.tokenHash),
    index('organization_invitations_org_idx').on(t.organizationId),
    // At most one open invitation per email per organization.
    uniqueIndex('organization_invitations_open_uq')
      .on(t.organizationId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
  ],
);
