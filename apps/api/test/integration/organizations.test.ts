import { auditLogs } from '@nivomi/database';
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

describe('organizations, RBAC and tenant isolation', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  /** Invites `role` into the owner's org and returns the accepted member's client. */
  async function join(ownerClient: Browser, role: string, label = role.toLowerCase()) {
    const member = await signedInUser(t, label, `${role} Person`);
    await ownerClient
      .post('/api/v1/organizations/current/invitations')
      .send({ email: member.email, role })
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
    it('makes the creator OWNER, activates the org and marks it pending approval', async () => {
      const { client, organizationId } = await owner(t, 'Sunrise Homes');
      const me = await client.get('/api/v1/me').expect(200);
      expect(me.body).toMatchObject({
        activeOrganization: { id: organizationId, role: 'OWNER' },
        organizations: [{ id: organizationId, name: 'Sunrise Homes', role: 'OWNER' }],
      });
      expect(body(me).activeOrganization?.permissions).toContain('members.invite');

      const current = await client.get('/api/v1/organizations/current').expect(200);
      expect(current.body).toMatchObject({ slug: 'sunrise-homes', status: 'PENDING_APPROVAL' });
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
    it('lets an invited user join with the invited role', async () => {
      const o = await owner(t);
      const agent = await join(o.client, 'AGENT');
      const me = await agent.client.get('/api/v1/me').expect(200);
      expect(body(me).activeOrganization).toMatchObject({ id: o.organizationId, role: 'AGENT' });
      const list = await members(o.client);
      expect(list.map((m) => m.role).sort()).toEqual(['AGENT', 'OWNER']);
    });

    it('refuses an invitation redeemed by a different account', async () => {
      const o = await owner(t);
      const invitee = uniqueEmail('invitee');
      await o.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email: invitee, role: 'VIEWER' })
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
      const o = await owner(t);
      const email = uniqueEmail('dup');
      await o.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email, role: 'VIEWER' })
        .expect(201);
      await o.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email, role: 'VIEWER' })
        .expect(409);
      await o.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email: o.email, role: 'VIEWER' })
        .expect(409);
    });

    it('stops a revoked invitation from being accepted', async () => {
      const o = await owner(t);
      const invitee = await signedInUser(t, 'revoked');
      const created = await o.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email: invitee.email, role: 'VIEWER' })
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

    it('only lets an OWNER invite admins', async () => {
      const o = await owner(t);
      const admin = await join(o.client, 'ADMIN');
      const res = await admin.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email: uniqueEmail(), role: 'ADMIN' })
        .expect(403);
      expect(res.body).toMatchObject({ error: { code: 'AUTHORIZATION_ERROR' } });
      await admin.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email: uniqueEmail(), role: 'AGENT' })
        .expect(201);
    });
  });

  describe('role-based access', () => {
    it('enforces the permission matrix per role', async () => {
      const o = await owner(t);
      const manager = await join(o.client, 'MANAGER');
      const agent = await join(o.client, 'AGENT');
      const viewer = await join(o.client, 'VIEWER');

      await manager.client.get('/api/v1/organizations/current/members').expect(200);
      await manager.client.get('/api/v1/organizations/current/audit-logs').expect(403);
      await manager.client
        .post('/api/v1/organizations/current/invitations')
        .send({ email: uniqueEmail(), role: 'VIEWER' })
        .expect(403);

      for (const limited of [agent, viewer]) {
        await limited.client.get('/api/v1/organizations/current').expect(200);
        await limited.client.get('/api/v1/organizations/current/members').expect(403);
      }
    });

    it('protects owners from admins and keeps at least one owner', async () => {
      const o = await owner(t);
      const admin = await join(o.client, 'ADMIN');
      const list = await members(o.client);
      const ownerMember = list.find((m) => m.role === 'OWNER');
      const adminMember = list.find((m) => m.role === 'ADMIN');

      await admin.client
        .put(`/api/v1/organizations/current/members/${ownerMember?.id ?? ''}/role`)
        .send({ role: 'VIEWER' })
        .expect(403);
      await admin.client
        .delete(`/api/v1/organizations/current/members/${ownerMember?.id ?? ''}`)
        .expect(403);

      const lastOwner = await o.client
        .put(`/api/v1/organizations/current/members/${ownerMember?.id ?? ''}/role`)
        .send({ role: 'ADMIN' })
        .expect(409);
      expect(lastOwner.body).toMatchObject({ error: { code: 'CONFLICT' } });
      await o.client.post('/api/v1/organizations/current/leave').expect(409);

      // Promote the admin, then the original owner may step down.
      await o.client
        .put(`/api/v1/organizations/current/members/${adminMember?.id ?? ''}/role`)
        .send({ role: 'OWNER' })
        .expect(204);
      await o.client
        .put(`/api/v1/organizations/current/members/${ownerMember?.id ?? ''}/role`)
        .send({ role: 'VIEWER' })
        .expect(204);
    });

    it('applies removal on the very next request', async () => {
      const o = await owner(t);
      const agent = await join(o.client, 'AGENT');
      await agent.client.get('/api/v1/organizations/current').expect(200);
      const target = (await members(o.client)).find((m) => m.role === 'AGENT');
      await o.client
        .delete(`/api/v1/organizations/current/members/${target?.id ?? ''}`)
        .expect(204);
      const res = await agent.client.get('/api/v1/organizations/current').expect(403);
      expect(res.body).toMatchObject({ error: { code: 'ORGANIZATION_REQUIRED' } });
    });

    it('applies a role change on the very next request', async () => {
      const o = await owner(t);
      const manager = await join(o.client, 'MANAGER');
      await manager.client.get('/api/v1/organizations/current/members').expect(200);
      const target = (await members(o.client)).find((m) => m.role === 'MANAGER');
      await o.client
        .put(`/api/v1/organizations/current/members/${target?.id ?? ''}/role`)
        .send({ role: 'VIEWER' })
        .expect(204);
      await manager.client.get('/api/v1/organizations/current/members').expect(403);
    });
  });

  describe('tenant isolation', () => {
    it('never lets a user act on another organization', async () => {
      const a = await owner(t, 'Tenant A');
      const b = await owner(t, 'Tenant B');
      const aMembers = await members(a.client);
      const aOwner = aMembers[0];

      // Switching into a foreign org is indistinguishable from a missing one.
      await b.client
        .put('/api/v1/me/active-organization')
        .send({ organizationId: a.organizationId })
        .expect(404);
      // Member IDs from another tenant resolve to nothing in the caller's tenant.
      await b.client
        .put(`/api/v1/organizations/current/members/${aOwner?.id ?? ''}/role`)
        .send({ role: 'VIEWER' })
        .expect(404);
      await b.client
        .delete(`/api/v1/organizations/current/members/${aOwner?.id ?? ''}`)
        .expect(404);

      // Each attempt is audited at platform level (PRD FR-1), outside both tenants' logs.
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
      const a = await owner(t, 'Tenant A2');
      const b = await owner(t, 'Tenant B2');
      const res = await b.client
        .get(`/api/v1/organizations/current?organizationId=${a.organizationId}`)
        .set('X-Organization-Id', a.organizationId)
        .expect(200);
      expect(body(res).id).toBe(b.organizationId);
    });

    it('switches between organizations the user belongs to', async () => {
      const a = await owner(t, 'Home Org');
      const other = await owner(t, 'Other Org');
      const member = await signedInUser(t, 'multi');
      for (const org of [a, other]) {
        await org.client
          .post('/api/v1/organizations/current/invitations')
          .send({ email: member.email, role: 'VIEWER' })
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
      const o = await owner(t);
      await join(o.client, 'AGENT');
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
      const o = await owner(t);
      await o.client.get('/api/v1/organizations/current/audit-logs?limit=1000').expect(400);
    });
  });

  it('requires a verified email to accept invitations', async () => {
    const o = await owner(t);
    const email = uniqueEmail('unverified');
    const client = browser(t);
    await client.post('/api/v1/auth/register').send({ name: 'U', email, password: PASSWORD });
    await client.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);
    await o.client
      .post('/api/v1/organizations/current/invitations')
      .send({ email, role: 'VIEWER' })
      .expect(201);
    const token = await tokenFromEmail(t, email, 'invitation');
    const res = await client
      .post('/api/v1/organizations/invitations/accept')
      .send({ token })
      .expect(403);
    expect(res.body).toMatchObject({ error: { code: 'EMAIL_NOT_VERIFIED' } });
  });
});
