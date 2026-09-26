import {
  auditLogs,
  createDatabase,
  organizationInvitations,
  organizationMembers,
  organizations,
  users,
  type DatabaseHandle,
} from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyPassword } from '../auth/password.js';
import { hashToken } from '../auth/tokens.js';
import { DEV_ORGANIZATIONS, DEV_PASSWORD, DEV_USERS } from './seed-data.js';
import { seedDevData } from './seed.js';

describe('seedDevData', () => {
  let handle: DatabaseHandle;

  beforeAll(async () => {
    handle = await createDatabase({ kind: 'pglite' });
    await handle.migrate();
  });

  afterAll(async () => {
    await handle.close();
  });

  it('creates every declared user, organization, membership and invitation', async () => {
    const { userIds, organizationIds } = await seedDevData(handle.db);

    const seededUsers = await handle.db.select().from(users);
    expect(seededUsers).toHaveLength(DEV_USERS.length);
    for (const spec of DEV_USERS) {
      const user = seededUsers.find((u) => u.email === spec.email);
      expect(user?.isSuperAdmin).toBe(spec.superAdmin);
      expect(user?.emailVerifiedAt !== null).toBe(spec.verified);
      expect(await verifyPassword(user?.passwordHash ?? '', DEV_PASSWORD)).toBe(true);
    }

    for (const spec of DEV_ORGANIZATIONS) {
      const organizationId = organizationIds.get(spec.slug) ?? '';
      const [organization] = await handle.db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId));
      expect(organization?.status).toBe(spec.status);

      const members = await handle.db
        .select({ userId: organizationMembers.userId, role: organizationMembers.role })
        .from(organizationMembers)
        .where(eq(organizationMembers.organizationId, organizationId));
      expect(members).toEqual(
        expect.arrayContaining(
          spec.members.map((m) => ({ userId: userIds.get(m.email), role: m.role })),
        ),
      );
      expect(members).toHaveLength(spec.members.length);

      for (const invitation of spec.invitations) {
        const [row] = await handle.db
          .select()
          .from(organizationInvitations)
          .where(eq(organizationInvitations.tokenHash, hashToken(invitation.token)));
        expect(row).toMatchObject({
          organizationId,
          email: invitation.email,
          role: invitation.role,
          acceptedAt: null,
          revokedAt: null,
        });
        expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now());
      }
    }
  });

  it('restores the declared state on re-run without duplicating rows', async () => {
    const first = await seedDevData(handle.db);
    const adminId = first.userIds.get('admin@example.com') ?? '';
    const demoId = first.organizationIds.get('nivomi-demo') ?? '';
    await handle.db
      .update(users)
      .set({ isSuperAdmin: false, failedLoginCount: 5, lockedUntil: new Date(Date.now() + 60_000) })
      .where(eq(users.id, adminId));
    await handle.db
      .update(organizationMembers)
      .set({ role: 'VIEWER' })
      .where(
        and(
          eq(organizationMembers.userId, adminId),
          eq(organizationMembers.organizationId, demoId),
        ),
      );
    await handle.db
      .update(organizations)
      .set({ status: 'SUSPENDED' })
      .where(eq(organizations.id, demoId));
    const createdBefore = await handle.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'organization.created'));

    const second = await seedDevData(handle.db);

    expect(second).toEqual(first);
    const [admin] = await handle.db.select().from(users).where(eq(users.id, adminId));
    expect(admin).toMatchObject({ isSuperAdmin: true, failedLoginCount: 0, lockedUntil: null });
    const [membership] = await handle.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, adminId),
          eq(organizationMembers.organizationId, demoId),
        ),
      );
    expect(membership?.role).toBe('OWNER');
    const [demo] = await handle.db.select().from(organizations).where(eq(organizations.id, demoId));
    expect(demo?.status).toBe('ACTIVE');

    expect(await handle.db.select().from(users)).toHaveLength(DEV_USERS.length);
    expect(await handle.db.select().from(organizations)).toHaveLength(DEV_ORGANIZATIONS.length);
    expect(await handle.db.select().from(organizationInvitations)).toHaveLength(
      DEV_ORGANIZATIONS.flatMap((o) => o.invitations).length,
    );
    // Organization history is written once, not on every start.
    expect(
      await handle.db.select().from(auditLogs).where(eq(auditLogs.action, 'organization.created')),
    ).toHaveLength(createdBefore.length);
    const seedRuns = await handle.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'platform.dev_seed_applied'));
    expect(seedRuns.length).toBeGreaterThanOrEqual(3);
  });

  it('leaves an accepted seeded invitation accepted', async () => {
    const token = DEV_ORGANIZATIONS.flatMap((o) => o.invitations)[0]?.token ?? '';
    const acceptedAt = new Date();
    await handle.db
      .update(organizationInvitations)
      .set({ acceptedAt })
      .where(eq(organizationInvitations.tokenHash, hashToken(token)));

    await seedDevData(handle.db);

    const [row] = await handle.db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.tokenHash, hashToken(token)));
    expect(row?.acceptedAt).toEqual(acceptedAt);
  });
});
