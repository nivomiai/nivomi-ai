import {
  organizationInvitations,
  organizationMembers,
  organizations,
  users,
  type Database,
} from '@nivomi/database';
import { and, eq, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword } from '../auth/password.js';
import { hashToken } from '../auth/tokens.js';
import { DEV_ORGANIZATIONS, DEV_PASSWORD, DEV_USERS } from './seed-data.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface DevSeedResult {
  /** Seeded user id by email. */
  readonly userIds: ReadonlyMap<string, string>;
  /** Seeded organization id by slug. */
  readonly organizationIds: ReadonlyMap<string, string>;
}

/**
 * Brings the development dataset to its declared state: accounts (password, verification,
 * lockout, Super Admin), organization status, memberships and open invitations. Rows it does not
 * declare are left alone. Safe to run on every start.
 */
export async function seedDevData(db: Database): Promise<DevSeedResult> {
  // One hash for the shared password keeps every start fast (Argon2id is deliberately slow).
  const passwordHash = await hashPassword(DEV_PASSWORD);
  const audit = new AuditService(db);

  return db.transaction(async (tx) => {
    const userIds = new Map<string, string>();
    for (const user of DEV_USERS) {
      const account = {
        name: user.name,
        passwordHash,
        emailVerifiedAt: user.verified ? new Date() : null,
        failedLoginCount: 0,
        lockedUntil: null,
        isSuperAdmin: user.superAdmin,
      };
      const [row] = await tx
        .insert(users)
        .values({ email: user.email, ...account })
        .onConflictDoUpdate({ target: users.email, set: account })
        .returning({ id: users.id });
      if (!row) throw new Error(`user upsert returned no row for ${user.email}`);
      userIds.set(user.email, row.id);
    }
    const userId = (email: string): string => {
      const id = userIds.get(email);
      if (!id) throw new Error(`seed data references unknown user ${email}`);
      return id;
    };
    const superAdminId = userId(DEV_USERS.find((u) => u.superAdmin)?.email ?? '');

    const organizationIds = new Map<string, string>();
    for (const org of DEV_ORGANIZATIONS) {
      const ownerEmail = org.members.find((m) => m.role === 'OWNER')?.email;
      if (!ownerEmail) throw new Error(`seed organization ${org.slug} has no OWNER`);
      const ownerId = userId(ownerEmail);

      const [created] = await tx
        .insert(organizations)
        .values({ name: org.name, slug: org.slug, status: org.status, createdByUserId: ownerId })
        .onConflictDoNothing({ target: organizations.slug })
        .returning({ id: organizations.id });
      const [organization] = created
        ? [created]
        : await tx
            .update(organizations)
            .set({ status: org.status })
            .where(eq(organizations.slug, org.slug))
            .returning({ id: organizations.id });
      if (!organization) throw new Error(`organization upsert returned no row for ${org.slug}`);
      organizationIds.set(org.slug, organization.id);

      if (created) {
        await audit.record(
          {
            action: 'organization.created',
            organizationId: organization.id,
            actorUserId: ownerId,
            resourceType: 'organization',
            resourceId: organization.id,
            metadata: { source: 'dev-seed' },
          },
          undefined,
          tx,
        );
      }

      for (const member of org.members) {
        await tx
          .insert(organizationMembers)
          .values({
            organizationId: organization.id,
            userId: userId(member.email),
            role: member.role,
          })
          .onConflictDoUpdate({
            target: [organizationMembers.organizationId, organizationMembers.userId],
            set: { role: member.role },
          });
      }

      for (const invitation of org.invitations) {
        const tokenHash = hashToken(invitation.token);
        const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
        const [existing] = await tx
          .select({ id: organizationInvitations.id })
          .from(organizationInvitations)
          .where(eq(organizationInvitations.tokenHash, tokenHash))
          .limit(1);
        if (existing) {
          // Keep a still-open seeded invitation usable; accepted or revoked ones stay as they are.
          await tx
            .update(organizationInvitations)
            .set({ expiresAt })
            .where(
              and(
                eq(organizationInvitations.id, existing.id),
                isNull(organizationInvitations.acceptedAt),
                isNull(organizationInvitations.revokedAt),
              ),
            );
          continue;
        }
        const [inserted] = await tx
          .insert(organizationInvitations)
          .values({
            organizationId: organization.id,
            email: invitation.email,
            role: invitation.role,
            tokenHash,
            invitedByUserId: ownerId,
            expiresAt,
          })
          // Someone already has an open invitation for this email from the UI: keep theirs.
          .onConflictDoNothing()
          .returning({ id: organizationInvitations.id });
        if (inserted) {
          await audit.record(
            {
              action: 'organization.invitation_created',
              organizationId: organization.id,
              actorUserId: ownerId,
              resourceType: 'invitation',
              resourceId: inserted.id,
              metadata: { role: invitation.role, source: 'dev-seed' },
            },
            undefined,
            tx,
          );
        }
      }
    }

    // Platform-level record (no organization): the seed (re)grants Super Admin and roles.
    await audit.record(
      {
        action: 'platform.dev_seed_applied',
        actorUserId: superAdminId,
        resourceType: 'dev_seed',
        metadata: { users: DEV_USERS.length, organizations: DEV_ORGANIZATIONS.length },
      },
      undefined,
      tx,
    );

    return { userIds, organizationIds };
  });
}
