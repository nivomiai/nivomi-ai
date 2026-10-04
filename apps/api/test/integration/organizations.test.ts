import { auditLogs, organizationMembers } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  browser,
  createTestApp,
  owner,
  signedInUser,
  tokenFromEmail,
  uniqueEmail,
  type Browser,
  type TestApp,
  body,
} from '../support/harness.js';

describe('organizations, account roles and tenant isolation', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  /** Invites someone into the owner's tenant; the new member inherits the tenant's role. */
  async function join(ownerClient: Browser, label = 'teammate') {
    const member = await signedInUser(t, label, `${label} Person`);
    await ownerClient
      .post('/api/v1/organizations/current/invitations')
      .send({ email: member.email })
      .expect(201);
    const token = await tokenFromEmail(t, member.email, 'invitation');
    await member.client
      .post('/api/v1/organizations/invitations/accept')
      .send({ token })
      .expect(201);
    return member;
  }

  async function members(client: Browser) {
    const res = await client.get('/api/v1/organizations/current/members').expect(200);
    return body(res).items;
  }

  describe('onboarding', () => {
    it('public /signup creates a solo INDV_USER workspace with full tenant data access', async () => {
      const { client, organizationId } = await owner(t, 'Solo Workspace', 'INDV_USER');
      const me = await client.get('/api/v1/me').expect(200);
      expect(me.body).toMatchObject({
        activeOrganization: { id: organizationId, role: 'INDV_USER' },
        organizations: [{ id: organizationId, name: 'Solo Workspace', role: 'INDV_USER' }],
      });
      const permissions = body(me).activeOrganization?.permissions ?? [];
      expect(permissions).toContain('leads.write');
      expect(permissions).toContain('campaigns.manage');
      // INDV_USER is solo: no invite/remove permissions.
      expect(permissions).not.toContain('members.invite');
      expect(permissions).not.toContain('members.remove');

      const current = await client.get('/api/v1/organizations/current').expect(200);
      expect(current.body).toMatchObject({ slug: 'solo-workspace', status: 'PENDING_APPROVAL' });
    });

    it('an ORGANIZATION tenant can invite more members', async () => {
      const o = await owner(t, 'Team Co', 'ORGANIZATION');
      const me = await o.client.get('/api/v1/me').expect(200);
      expect(body(me).activeOrganization?.permissions).toContain('members.invite');
    });

    it('gives colliding names unique slugs', async () => {
      const a = await owner(t, 'Same Name');
      const b = await owner(t, 'Same Name');
      const slugA = body(await a.client.get('/api/v1/organizations/current')).slug;
      const slugB = body(await b.client.get('/api/v1/organizations/current')).slug;
      expect(slugA).not.toBe(slugB);
    });

    it('asks for an organization before tenant endpoints', async () => {
      const { client } = await signedInUser(t);
      const res = await client.get('/api/v1/organizations/current').expect(403);
      expect(res.body).toMatchObject({ error: { code: 'ORGANIZATION_REQUIRED' } });
    });
  });

  describe('invitations', () => {
    it('solo INDV_USER accounts cannot invite anyone', async () => {
      const o = await owner(t, 'Solo', 'INDV_USER');
      const res = await o.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email: uniqueEmail() })
        .expect(403);
      expect(res.body).toMatchObject({ error: { code: 'AUTHORIZATION_ERROR' } });
    });

    it('a new member of an ORGANIZATION inherits the ORGANIZATION role', async () => {
      const o = await owner(t, 'Org Co', 'ORGANIZATION');
      const member = await join(o.client, 'member');
      const me = await member.client.get('/api/v1/me').expect(200);
      expect(body(me).activeOrganization).toMatchObject({
        id: o.organizationId,
        role: 'ORGANIZATION',
      });
      const list = await members(o.client);
      expect(list.map((m) => m.role).sort()).toEqual(['ORGANIZATION', 'ORGANIZATION']);
    });

    it('a new member of a CUSTOM_PLAN inherits the CUSTOM_PLAN role', async () => {
      const o = await owner(t, 'Enterprise Co', 'CUSTOM_PLAN');
      const member = await join(o.client, 'enterpriseMember');
      const me = await member.client.get('/api/v1/me').expect(200);
      expect(body(me).activeOrganization).toMatchObject({ role: 'CUSTOM_PLAN' });
    });

    it('refuses an invitation redeemed by a different account', async () => {
      const o = await owner(t, 'Invitees', 'ORGANIZATION');
      const invitee = uniqueEmail('invitee');
      await o.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email: invitee })
        .expect(201);
      const token = await tokenFromEmail(t, invitee, 'invitation');
      const stranger = await signedInUser(t, 'stranger');
      const res = await stranger.client
        .post('/api/v1/organizations/invitations/accept')
        .send({ token })
        .expect(403);
      expect(res.body).toMatchObject({ error: { code: 'AUTHORIZATION_ERROR' } });
    });

    it('rejects duplicate open invitations and existing members', async () => {
      const o = await owner(t, 'Dedup', 'ORGANIZATION');
      const email = uniqueEmail('dup');
      await o.client.post('/api/v1/organizations/current/invitations').send({ email }).expect(201);
      await o.client.post('/api/v1/organizations/current/invitations').send({ email }).expect(409);
      await o.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email: o.email })
        .expect(409);
    });

    it('stops a revoked invitation from being accepted', async () => {
      const o = await owner(t, 'Revoke Co', 'ORGANIZATION');
      const invitee = await signedInUser(t, 'revoked');
      const created = await o.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email: invitee.email })
        .expect(201);
      const token = await tokenFromEmail(t, invitee.email, 'invitation');
      await o.client
        .delete(`/api/v1/organizations/current/invitations/${body(created).id}`)
        .expect(204);
      await invitee.client
        .post('/api/v1/organizations/invitations/accept')
        .send({ token })
        .expect(400);
    });
  });

  describe('role matrix endpoint', () => {
    it('lists the three account roles with their permission sets', async () => {
      const o = await owner(t, 'Matrix Co', 'ORGANIZATION');
      const member = await join(o.client, 'viewer');

      const res = await member.client.get('/api/v1/organizations/current/roles').expect(200);
      const { items } = res.body as { items: { role: string; permissions: string[] }[] };
      expect(items.map((item) => item.role)).toEqual(['INDV_USER', 'ORGANIZATION', 'CUSTOM_PLAN']);
      const me = body(await member.client.get('/api/v1/me').expect(200));
      expect(items.find((item) => item.role === 'ORGANIZATION')?.permissions).toEqual(
        me.activeOrganization?.permissions,
      );

      const { client: noOrganization } = await signedInUser(t);
      await noOrganization.get('/api/v1/organizations/current/roles').expect(403);
      await browser(t).get('/api/v1/organizations/current/roles').expect(401);
    });
  });

  describe('member management', () => {
    it('keeps at least one member and removes the rest', async () => {
      const o = await owner(t, 'Keep One', 'ORGANIZATION');
      // Removing yourself when you are the only member fails.
      await o.client.post('/api/v1/organizations/current/leave').expect(409);

      const teammate = await join(o.client, 'teammate');
      const list = await members(o.client);
      const target = list.find((m) => m.email === teammate.email);
      await o.client
        .delete(`/api/v1/organizations/current/members/${target?.id ?? ''}`)
        .expect(204);
      const res = await teammate.client.get('/api/v1/organizations/current').expect(403);
      expect(res.body).toMatchObject({ error: { code: 'ORGANIZATION_REQUIRED' } });
    });
  });

  describe('tenant isolation', () => {
    it('never lets a user act on another organization', async () => {
      const a = await owner(t, 'Tenant A', 'ORGANIZATION');
      const b = await owner(t, 'Tenant B', 'ORGANIZATION');
      const aMembers = await members(a.client);
      const aOwner = aMembers[0];

      // Switching into a foreign org is indistinguishable from a missing one.
      await b.client
        .put('/api/v1/me/active-organization')
        .send({ organizationId: a.organizationId })
        .expect(404);
      // Member IDs from another tenant resolve to nothing in the caller's tenant.
      await b.client
        .delete(`/api/v1/organizations/current/members/${aOwner?.id ?? ''}`)
        .expect(404);

      const attempts = await t.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, 'security.cross_tenant_access_denied'));
      expect(attempts.map((e) => e.resourceId)).toEqual(
        expect.arrayContaining([a.organizationId, aOwner?.id]),
      );
      expect(attempts.every((e) => e.organizationId === null)).toBe(true);

      const bList = await members(b.client);
      expect(bList.map((m) => m.email)).toEqual([b.email]);
      const bAudit = await b.client.get('/api/v1/organizations/current/audit-logs').expect(200);
      const orgIds = new Set(body(bAudit).items.map((i) => i.resourceId));
      expect(orgIds.has(a.organizationId)).toBe(false);
    });

    it('ignores client-supplied organization IDs on tenant endpoints', async () => {
      const a = await owner(t, 'Tenant A2', 'ORGANIZATION');
      const b = await owner(t, 'Tenant B2', 'ORGANIZATION');
      const res = await b.client
        .get(`/api/v1/organizations/current?organizationId=${a.organizationId}`)
        .set('X-Organization-Id', a.organizationId)
        .expect(200);
      expect(body(res).id).toBe(b.organizationId);
    });

    it('switches between organizations the user belongs to', async () => {
      const a = await owner(t, 'Home Org', 'ORGANIZATION');
      const other = await owner(t, 'Other Org', 'ORGANIZATION');
      const member = await signedInUser(t, 'multi');
      for (const org of [a, other]) {
        await org.client
          .post('/api/v1/organizations/current/invitations')
          .send({ email: member.email })
          .expect(201);
        const token = await tokenFromEmail(t, member.email, 'invitation');
        await member.client
          .post('/api/v1/organizations/invitations/accept')
          .send({ token })
          .expect(201);
      }
      const current = await member.client.get('/api/v1/organizations/current').expect(200);
      expect(body(current).id).toBe(other.organizationId);
      await member.client
        .put('/api/v1/me/active-organization')
        .send({ organizationId: a.organizationId })
        .expect(204);
      const switched = await member.client.get('/api/v1/organizations/current').expect(200);
      expect(body(switched).id).toBe(a.organizationId);
    });
  });

  describe('audit log', () => {
    it('records administrative actions with keyset pagination', async () => {
      const o = await owner(t, 'Audit Co', 'ORGANIZATION');
      await join(o.client, 'auditee');
      const first = await o.client
        .get('/api/v1/organizations/current/audit-logs?limit=2')
        .expect(200);
      expect(body(first).items).toHaveLength(2);
      expect(body(first).nextCursor).toEqual(expect.any(String));
      const second = await o.client
        .get(
          `/api/v1/organizations/current/audit-logs?limit=2&cursor=${body(first).nextCursor ?? ''}`,
        )
        .expect(200);
      const seen = new Set([...body(first).items, ...body(second).items].map((i) => i.id));
      expect(seen.size).toBe(body(first).items.length + body(second).items.length);

      const all = await o.client
        .get('/api/v1/organizations/current/audit-logs?limit=100')
        .expect(200);
      const actions = body(all).items.map((i) => i.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'organization.created',
          'organization.invitation_created',
          'organization.invitation_accepted',
        ]),
      );
      expect(JSON.stringify(all.body)).not.toContain(PASSWORD);
    });

    it('validates pagination input', async () => {
      const o = await owner(t, 'Pagination', 'ORGANIZATION');
      await o.client.get('/api/v1/organizations/current/audit-logs?limit=1000').expect(400);
    });
  });

  it('membership rows carry the tenant role verbatim', async () => {
    const o = await owner(t, 'Role Verify', 'CUSTOM_PLAN');
    const [row] = await t.db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, o.organizationId));
    expect(row?.role).toBe('CUSTOM_PLAN');
  });
});
