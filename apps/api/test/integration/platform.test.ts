import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizations } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import { body, createTestApp, owner, signedInUser, type TestApp } from '../support/harness.js';
import { superAdmin } from '../support/calling.js';

describe('Super Admin control plane (FR-113–FR-120)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  async function forceStatus(
    organizationId: string,
    status: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED',
  ) {
    await t.db.update(organizations).set({ status }).where(eq(organizations.id, organizationId));
  }

  it('/me returns isSuperAdmin so the app can show the platform section', async () => {
    const admin = await superAdmin(t);
    const meAdmin = body(await admin.client.get('/api/v1/me').expect(200));
    expect((meAdmin as unknown as { user: { isSuperAdmin: boolean } }).user.isSuperAdmin).toBe(
      true,
    );

    const regular = await signedInUser(t);
    const meRegular = body(await regular.client.get('/api/v1/me').expect(200));
    expect((meRegular as unknown as { user: { isSuperAdmin: boolean } }).user.isSuperAdmin).toBe(
      false,
    );
  });

  it('lists organizations for a Super Admin, filters by status, and refuses everyone else', async () => {
    const admin = await superAdmin(t);
    const first = await owner(t, 'Acme Realty');
    const second = await owner(t, 'Beach Homes');
    await forceStatus(second.organizationId, 'ACTIVE');

    type OrgRow = { id: string; name: string; status: string };
    const all = (await admin.client.get('/api/v1/platform/organizations').expect(200)).body as {
      items: OrgRow[];
    };
    const names = all.items.map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(['Acme Realty', 'Beach Homes']));

    const pending = (
      await admin.client.get('/api/v1/platform/organizations?status=PENDING_APPROVAL').expect(200)
    ).body as { items: OrgRow[] };
    expect(pending.items.every((row) => row.status === 'PENDING_APPROVAL')).toBe(true);
    expect(pending.items.map((row) => row.id)).toContain(first.organizationId);

    const search = (await admin.client.get('/api/v1/platform/organizations?q=beach').expect(200))
      .body as { items: OrgRow[] };
    const searchIds = search.items.map((row) => row.id);
    expect(searchIds).toContain(second.organizationId);
    expect(searchIds).not.toContain(first.organizationId);

    await signedInUser(t).then(({ client }) =>
      client.get('/api/v1/platform/organizations').expect(403),
    );
    const tenantOwner = await owner(t, 'Tenant Only');
    await tenantOwner.client.get('/api/v1/platform/organizations').expect(403);
  });

  it('approves a pending organization, records the action, and refuses invalid transitions', async () => {
    const admin = await superAdmin(t);
    const target = await owner(t, 'Sunrise Realty');

    await admin.client
      .post(`/api/v1/platform/organizations/${target.organizationId}/approve`)
      .expect(204);

    // Idempotent: approving an already-ACTIVE organization returns 204 without changing state.
    await admin.client
      .post(`/api/v1/platform/organizations/${target.organizationId}/approve`)
      .expect(204);

    type AuditRow = {
      action: string;
      resourceId: string | null;
      metadata: Record<string, unknown> | null;
    };
    const audit = (await admin.client.get('/api/v1/platform/audit-logs').expect(200)).body as {
      items: AuditRow[];
    };
    const approvals = audit.items.filter(
      (row) =>
        row.action === 'platform.organization_approved' && row.resourceId === target.organizationId,
    );
    // Only one entry — the second call was a no-op.
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.metadata).toEqual({ from: 'PENDING_APPROVAL', to: 'ACTIVE' });

    // A CLOSED organization cannot be approved.
    await forceStatus(target.organizationId, 'CLOSED');
    const res = await admin.client
      .post(`/api/v1/platform/organizations/${target.organizationId}/approve`)
      .expect(409);
    expect(res.body).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('suspends and reactivates an organization with a required reason', async () => {
    const admin = await superAdmin(t);
    const target = await owner(t, 'Coastal Homes');
    await forceStatus(target.organizationId, 'ACTIVE');

    // Reason required and validated.
    await admin.client
      .post(`/api/v1/platform/organizations/${target.organizationId}/suspend`)
      .send({})
      .expect(400);
    await admin.client
      .post(`/api/v1/platform/organizations/${target.organizationId}/suspend`)
      .send({ reason: 'ab' })
      .expect(400);

    await admin.client
      .post(`/api/v1/platform/organizations/${target.organizationId}/suspend`)
      .send({ reason: 'Complaint spike above threshold' })
      .expect(204);

    // A tenant member can no longer place calls: campaigns endpoints check status downstream.
    // Reactivation only from SUSPENDED.
    await admin.client
      .post(`/api/v1/platform/organizations/${target.organizationId}/reactivate`)
      .expect(204);

    // Reactivating an already-ACTIVE org is a no-op (idempotent for double clicks / retries).
    await admin.client
      .post(`/api/v1/platform/organizations/${target.organizationId}/reactivate`)
      .expect(204);

    // But reactivate never revives a CLOSED organization.
    await forceStatus(target.organizationId, 'CLOSED');
    const conflict = await admin.client
      .post(`/api/v1/platform/organizations/${target.organizationId}/reactivate`)
      .expect(409);
    expect(conflict.body).toMatchObject({ error: { code: 'CONFLICT' } });

    type AuditRow = {
      action: string;
      resourceId: string | null;
      metadata: Record<string, unknown> | null;
    };
    const audit2 = (await admin.client.get('/api/v1/platform/audit-logs').expect(200)).body as {
      items: AuditRow[];
    };
    const suspend = audit2.items.find(
      (row) =>
        row.action === 'platform.organization_suspended' &&
        row.resourceId === target.organizationId,
    );
    expect(suspend?.metadata).toMatchObject({ reason: 'Complaint spike above threshold' });
  });

  it('rejects a bad UUID and unknown organization', async () => {
    const admin = await superAdmin(t);
    await admin.client.post('/api/v1/platform/organizations/not-a-uuid/approve').expect(400);
    await admin.client
      .post('/api/v1/platform/organizations/00000000-0000-0000-0000-000000000000/approve')
      .expect(404);
  });
});
