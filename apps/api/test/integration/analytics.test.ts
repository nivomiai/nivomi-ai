import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnalyticsService } from '../../src/analytics/analytics.service.js';
import type { TenantPrincipal } from '../../src/auth/principal.js';
import { addLead, callingOrg, superAdmin } from '../support/calling.js';
import { createTestApp, type Browser, type TestApp } from '../support/harness.js';

const makePrincipal = (organizationId: string): TenantPrincipal => ({
  userId: crypto.randomUUID(),
  sessionId: 'test-session',
  email: 'test@example.com',
  name: 'Test',
  emailVerified: true,
  isSuperAdmin: false,
  membership: { organizationId, role: 'ORGANIZATION' },
});

describe('analytics summary (ADR-029, Phase 10)', () => {
  let t: TestApp;
  let admin: Browser;

  beforeAll(async () => {
    t = await createTestApp({ VOICE_SIMULATED_CALL_MS: '0' });
    admin = (await superAdmin(t)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  it('returns tenant-scoped lead funnel and empty call aggregates for a fresh tenant', async () => {
    const org = await callingOrg(t, admin, 'Analytics Co');
    await addLead(org.client, { fullName: 'Lead A', consentBasis: 'EXISTING_CUSTOMER' });
    await addLead(org.client, { fullName: 'Lead B', consentBasis: 'EXISTING_CUSTOMER' });
    const svc = t.app.get(AnalyticsService);
    const summary = await svc.summary(makePrincipal(org.organizationId));
    expect(summary.leads.total).toBe(2);
    expect(summary.calls.byDirection).toEqual({ inbound: 0, outbound: 0 });
    expect(summary.calls.totalDurationSeconds).toBe(0);
  });
});
