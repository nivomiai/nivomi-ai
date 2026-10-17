import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CallSessionsService } from '../../src/calls/call-sessions.service.js';
import type { TenantPrincipal } from '../../src/auth/principal.js';
import { callingOrg, superAdmin } from '../support/calling.js';
import { createTestApp, type Browser, type TestApp } from '../support/harness.js';

const makePrincipal = (organizationId: string): TenantPrincipal => ({
  userId: 'test-user',
  sessionId: 'test-session',
  email: 'test@example.com',
  name: 'Test',
  emailVerified: true,
  isSuperAdmin: false,
  membership: { organizationId, role: 'ORGANIZATION' },
});

describe('calls — call sessions persistence and listing (ADR-024, Phase 5)', () => {
  let t: TestApp;
  let admin: Browser;

  beforeAll(async () => {
    t = await createTestApp({ VOICE_SIMULATED_CALL_MS: '0' });
    admin = (await superAdmin(t)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  const session = (overrides: Partial<Parameters<CallSessionsService['persist']>[0]> = {}) => ({
    organizationId: 'placeholder',
    direction: 'OUTBOUND' as const,
    callAttemptId: null,
    callerNumberId: null,
    agentVersionId: null,
    fromE164: '+911601120000',
    toE164: '+919000000001',
    provider: 'simulated',
    providerCallId: `sim-${crypto.randomUUID()}`,
    startedAt: new Date('2026-10-01T09:00:00Z'),
    endedAt: new Date('2026-10-01T09:00:30Z'),
    durationSeconds: 30,
    telephonyOutcome: 'CONNECTED',
    conversationOutcome: 'INTERESTED' as const,
    transcript: [
      { role: 'agent' as const, text: 'Hello' },
      { role: 'caller' as const, text: 'Yes' },
    ],
    qualification: { qualified: true },
    usage: { inputTokens: 100, outputTokens: 50, audioSeconds: 25 },
    ...overrides,
  });

  it('persists a session, is idempotent on (provider, providerCallId), and lists tenant-scoped', async () => {
    const org = await callingOrg(t, admin, 'Calls Org A');
    const other = await callingOrg(t, admin, 'Calls Org B');
    const svc = t.app.get(CallSessionsService);

    const a1 = await svc.persist(
      session({ organizationId: org.organizationId, providerCallId: 'sim-a1' }),
    );
    const a1Replay = await svc.persist(
      session({ organizationId: org.organizationId, providerCallId: 'sim-a1' }),
    );
    expect(a1.id).toBe(a1Replay.id);
    expect(a1.created).toBe(true);
    expect(a1Replay.created).toBe(false);

    await svc.persist(session({ organizationId: org.organizationId, providerCallId: 'sim-a2' }));
    await svc.persist(session({ organizationId: other.organizationId, providerCallId: 'sim-b1' }));

    const principalA = makePrincipal(org.organizationId);
    const list = await svc.list(principalA, {});
    expect(list.items).toHaveLength(2);
    expect(list.items.every((i) => i.conversationOutcome === 'INTERESTED')).toBe(true);
  });

  it('filters by direction and outcome', async () => {
    const org = await callingOrg(t, admin, 'Calls Filter Org');
    const svc = t.app.get(CallSessionsService);
    await svc.persist(
      session({
        organizationId: org.organizationId,
        providerCallId: 'sim-f-1',
        direction: 'OUTBOUND',
        conversationOutcome: 'INTERESTED',
      }),
    );
    await svc.persist(
      session({
        organizationId: org.organizationId,
        providerCallId: 'sim-f-2',
        direction: 'INBOUND',
        conversationOutcome: 'OPTED_OUT',
      }),
    );
    const principal = makePrincipal(org.organizationId);
    const inbound = await svc.list(principal, { direction: 'INBOUND' });
    expect(inbound.items.map((i) => i.conversationOutcome)).toEqual(['OPTED_OUT']);
    const optedOut = await svc.list(principal, { outcome: 'OPTED_OUT' });
    expect(optedOut.items).toHaveLength(1);
  });
});
