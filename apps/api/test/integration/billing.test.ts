import { plans } from '@nivomi/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BillingService } from '../../src/billing/billing.service.js';
import { QuotaService } from '../../src/billing/quota.service.js';
import { UsageMeter } from '../../src/billing/usage-meter.service.js';
import { callingOrg, superAdmin } from '../support/calling.js';
import { createTestApp, type Browser, type TestApp } from '../support/harness.js';

describe('billing — metering, quota, plan assignment, invoice rollup (ADR-027)', () => {
  let t: TestApp;
  let admin: Browser;

  beforeAll(async () => {
    t = await createTestApp({ VOICE_SIMULATED_CALL_MS: '0' });
    admin = (await superAdmin(t)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  const seedPlan = async () => {
    const [plan] = await t.db
      .insert(plans)
      .values({
        code: `starter-${crypto.randomUUID().slice(0, 6)}`,
        name: 'Starter',
        monthlyPaiseInr: 500_000, // ₹5,000
        limits: { CALL_MINUTES_OUTBOUND: 100, LLM_INPUT_TOKENS: 10_000 },
        overageRates: { CALL_MINUTES_OUTBOUND: 500 }, // 5 rupees/minute
      })
      .returning({ id: plans.id });
    if (!plan) throw new Error('seed plan failed');
    return plan.id;
  };

  it('records usage events idempotently per (org, kind, source_id) and returns a current-period total', async () => {
    const org = await callingOrg(t, admin, 'Billing Meter Co');
    const meter = t.app.get(UsageMeter);
    const first = await meter.record({
      organizationId: org.organizationId,
      kind: 'CALL_MINUTES_OUTBOUND',
      quantity: 5,
      unit: 'seconds',
      sourceId: `call-${crypto.randomUUID()}`,
    });
    const replay = await meter.record({
      organizationId: org.organizationId,
      kind: 'CALL_MINUTES_OUTBOUND',
      quantity: 5,
      unit: 'seconds',
      sourceId: 'repeat',
    });
    const replay2 = await meter.record({
      organizationId: org.organizationId,
      kind: 'CALL_MINUTES_OUTBOUND',
      quantity: 99,
      unit: 'seconds',
      sourceId: 'repeat',
    });
    expect(first.recorded).toBe(true);
    expect(replay.recorded).toBe(true);
    expect(replay2.recorded).toBe(false); // duplicate source_id
    const totals = await meter.currentPeriodTotals(org.organizationId);
    expect(totals.CALL_MINUTES_OUTBOUND).toBe(10);
  });

  it('assignPlan then quota.check: ALLOWED / WARN / OVER_QUOTA', async () => {
    const org = await callingOrg(t, admin, 'Billing Quota Co');
    const billing = t.app.get(BillingService);
    const quota = t.app.get(QuotaService);
    const meter = t.app.get(UsageMeter);
    const planId = await seedPlan();
    await billing.assignPlan('super-admin-id', org.organizationId, planId);

    const allowed = await quota.check(org.organizationId, 'CALL_MINUTES_OUTBOUND');
    expect(allowed.kind).toBe('ALLOWED');
    expect(allowed.limit).toBe(100);

    await meter.record({
      organizationId: org.organizationId,
      kind: 'CALL_MINUTES_OUTBOUND',
      quantity: 90,
      unit: 'seconds',
    });
    const warn = await quota.check(org.organizationId, 'CALL_MINUTES_OUTBOUND');
    expect(warn.kind).toBe('WARN');

    await meter.record({
      organizationId: org.organizationId,
      kind: 'CALL_MINUTES_OUTBOUND',
      quantity: 15,
      unit: 'seconds',
    });
    const over = await quota.check(org.organizationId, 'CALL_MINUTES_OUTBOUND');
    expect(over.kind).toBe('OVER_QUOTA');
  });

  it('rollupInvoice is idempotent per (org, period)', async () => {
    const org = await callingOrg(t, admin, 'Billing Invoice Co');
    const billing = t.app.get(BillingService);
    const planId = await seedPlan();
    await billing.assignPlan('super-admin-id', org.organizationId, planId);
    const period = '2026-10';
    const first = await billing.rollupInvoice(org.organizationId, period);
    const replay = await billing.rollupInvoice(org.organizationId, period);
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(first.id).toBe(replay.id);
  });
});
