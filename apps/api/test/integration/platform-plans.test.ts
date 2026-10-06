import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { organizationPlans, plans } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import { createTestApp, owner, signedInUser, type TestApp } from '../support/harness.js';
import { superAdmin } from '../support/calling.js';

interface PlanBody {
  id: string;
  code: string;
  name: string;
  monthlyPaiseInr: number;
  limits: Record<string, number>;
  overageRates: Record<string, number>;
  status: 'ACTIVE' | 'ARCHIVED';
  displayOrder: number;
  updatedAt: string;
  orgsActive: number;
}

describe('Super Admin plans CRUD + public pricing', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('refuses anonymous and non-super-admin requests to the platform endpoint', async () => {
    await request(t.server).get('/api/v1/platform/plans').expect(401);
    await request(t.server)
      .post('/api/v1/platform/plans')
      .send({ code: 'free', name: 'Free', monthlyPaiseInr: 0, limits: {}, overageRates: {} })
      .expect(401);
    const tenant = await owner(t, 'Acme Realty');
    await tenant.client.get('/api/v1/platform/plans').expect(403);
    await tenant.client
      .post('/api/v1/platform/plans')
      .send({ code: 'free', name: 'Free', monthlyPaiseInr: 0, limits: {}, overageRates: {} })
      .expect(403);
    const user = await signedInUser(t);
    await user.client.get('/api/v1/platform/plans').expect(403);
  });

  it('allows the super admin to create, update and archive a plan with audit entries', async () => {
    const admin = await superAdmin(t);

    const createdRes = await admin.client
      .post('/api/v1/platform/plans')
      .send({
        code: 'starter',
        name: 'Starter',
        monthlyPaiseInr: 99900,
        limits: { CALL_MINUTES_OUTBOUND: 2000 },
        overageRates: { CALL_MINUTES_OUTBOUND: 300 },
        status: 'ACTIVE',
        displayOrder: 10,
      })
      .expect(201);
    const created = createdRes.body as PlanBody;
    expect(created.code).toBe('starter');
    expect(created.monthlyPaiseInr).toBe(99900);
    expect(created.limits.CALL_MINUTES_OUTBOUND).toBe(2000);
    expect(created.orgsActive).toBe(0);

    const list = (await admin.client.get('/api/v1/platform/plans').expect(200)).body as {
      items: PlanBody[];
    };
    expect(list.items.find((p) => p.code === 'starter')?.id).toBe(created.id);

    const updatedRes = await admin.client
      .put(`/api/v1/platform/plans/${created.id}`)
      .send({
        code: 'starter',
        name: 'Starter (renamed)',
        monthlyPaiseInr: 99900,
        limits: { CALL_MINUTES_OUTBOUND: 2500 },
        overageRates: { CALL_MINUTES_OUTBOUND: 300 },
        status: 'ACTIVE',
        displayOrder: 10,
        expectedVersion: created.updatedAt,
      })
      .expect(200);
    const updated = updatedRes.body as PlanBody;
    expect(updated.name).toBe('Starter (renamed)');
    expect(updated.limits.CALL_MINUTES_OUTBOUND).toBe(2500);

    // Second edit using the stale expectedVersion is rejected.
    await admin.client
      .put(`/api/v1/platform/plans/${created.id}`)
      .send({
        code: 'starter',
        name: 'nope',
        monthlyPaiseInr: 99900,
        limits: {},
        overageRates: {},
        status: 'ACTIVE',
        displayOrder: 10,
        expectedVersion: created.updatedAt, // stale
      })
      .expect(409);

    await admin.client.post(`/api/v1/platform/plans/${created.id}/archive`).expect(204);
    // Archive is idempotent — second call succeeds with 204.
    await admin.client.post(`/api/v1/platform/plans/${created.id}/archive`).expect(204);

    // The audit log contains create + update + archive entries for this plan.
    const audit = (await admin.client.get('/api/v1/platform/audit-logs').expect(200)).body as {
      items: { action: string; resourceId: string | null }[];
    };
    const ours = audit.items.filter((row) => row.resourceId === created.id);
    const actions = ours.map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(['platform.plan_created', 'platform.plan_updated', 'platform.plan_archived']));
  });

  it('rejects duplicate code with 409 CONFLICT', async () => {
    const admin = await superAdmin(t);
    const payload = {
      code: 'growth',
      name: 'Growth',
      monthlyPaiseInr: 299900,
      limits: {},
      overageRates: {},
      status: 'ACTIVE' as const,
      displayOrder: 20,
    };
    await admin.client.post('/api/v1/platform/plans').send(payload).expect(201);
    const dup = await admin.client.post('/api/v1/platform/plans').send(payload).expect(409);
    expect(dup.body).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('refuses archive while an organization is active on the plan', async () => {
    const admin = await superAdmin(t);
    const tenant = await owner(t, 'Lotus Realty');

    const createdRes = await admin.client
      .post('/api/v1/platform/plans')
      .send({
        code: 'business',
        name: 'Business',
        monthlyPaiseInr: 999900,
        limits: {},
        overageRates: {},
        status: 'ACTIVE',
        displayOrder: 30,
      })
      .expect(201);
    const created = createdRes.body as PlanBody;

    // Pin the tenant onto the plan directly (there is no public endpoint yet in the current
    // billing module — plan assignment comes with the per-org editor in a follow-up).
    await t.db.insert(organizationPlans).values({
      organizationId: tenant.organizationId,
      planId: created.id,
      cycle: 'MONTHLY',
      status: 'ACTIVE',
      startsOn: new Date(),
    });

    const res = await admin.client
      .post(`/api/v1/platform/plans/${created.id}/archive`)
      .expect(409);
    expect(res.body).toMatchObject({ error: { code: 'CONFLICT' } });
    const row = await t.db.select({ status: plans.status }).from(plans).where(eq(plans.id, created.id));
    expect(row[0]?.status).toBe('ACTIVE');
  });

  it('serves /plans/public anonymously, ACTIVE-only, without internal fields', async () => {
    const admin = await superAdmin(t);
    // Create one ACTIVE and one ARCHIVED plan.
    const activeRes = await admin.client
      .post('/api/v1/platform/plans')
      .send({
        code: 'public-active',
        name: 'Public Active',
        monthlyPaiseInr: 49900,
        limits: { CALL_MINUTES_OUTBOUND: 500 },
        overageRates: { CALL_MINUTES_OUTBOUND: 200 },
        status: 'ACTIVE',
        displayOrder: 1,
      })
      .expect(201);
    const archivedRes = await admin.client
      .post('/api/v1/platform/plans')
      .send({
        code: 'public-archived',
        name: 'Public Archived',
        monthlyPaiseInr: 50000,
        limits: {},
        overageRates: {},
        status: 'ARCHIVED',
        displayOrder: 2,
      })
      .expect(201);

    const res = await request(t.server).get('/api/v1/plans/public').expect(200);
    expect(res.headers['cache-control']).toContain('max-age=60');
    const body = res.body as {
      items: {
        code: string;
        name: string;
        monthlyPaiseInr: number;
        limits: Record<string, number>;
        displayOrder: number;
        overageRates?: unknown;
        id?: unknown;
      }[];
    };
    const codes = body.items.map((p) => p.code);
    expect(codes).toContain('public-active');
    expect(codes).not.toContain('public-archived');
    const row = body.items.find((p) => p.code === 'public-active')!;
    expect(row.overageRates).toBeUndefined();
    expect(row.id).toBeUndefined();
    expect(row.limits.CALL_MINUTES_OUTBOUND).toBe(500);

    // Suppress unused-var lint; both ids referenced for clarity.
    void activeRes;
    void archivedRes;
  });
});
