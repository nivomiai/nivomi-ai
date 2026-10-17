import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppointmentsService } from '../../src/appointments/appointments.service.js';
import type { TenantPrincipal } from '../../src/auth/principal.js';
import { callingOrg, superAdmin } from '../support/calling.js';
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

describe('appointments — service CRUD + idempotency (ADR-025, Phase 6)', () => {
  let t: TestApp;
  let admin: Browser;

  beforeAll(async () => {
    t = await createTestApp({ VOICE_SIMULATED_CALL_MS: '0' });
    admin = (await superAdmin(t)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  it('creates, reschedules and cancels an appointment; cross-tenant list isolation', async () => {
    const a = await callingOrg(t, admin, 'Appts A');
    const b = await callingOrg(t, admin, 'Appts B');
    const svc = t.app.get(AppointmentsService);
    const principalA = makePrincipal(a.organizationId);
    const principalB = makePrincipal(b.organizationId);

    const created = await svc.create(principalA, {
      startsAt: new Date('2026-11-01T10:00:00Z'),
      durationMinutes: 30,
      channel: 'CALL',
      source: 'MANUAL',
    });
    expect(created.created).toBe(true);

    await svc.reschedule(principalA, created.id, new Date('2026-11-01T11:00:00Z'), 45);
    const listA = await svc.list(principalA, {});
    expect(listA).toHaveLength(1);
    expect(listA[0]?.startsAt.toISOString()).toBe('2026-11-01T11:00:00.000Z');
    expect(listA[0]?.durationMinutes).toBe(45);

    await svc.cancel(principalA, created.id);
    const afterCancel = await svc.list(principalA, { status: 'CANCELLED' });
    expect(afterCancel).toHaveLength(1);

    const listB = await svc.list(principalB, {});
    expect(listB).toHaveLength(0);
  });

  it('appointment.book from the same call session is idempotent', async () => {
    // The agent tool "appointment.book" calls svc.create with a callSessionId; a replay returns
    // the existing row rather than creating a second appointment for that call.
    const org = await callingOrg(t, admin, 'Appts Idempotent');
    const svc = t.app.get(AppointmentsService);
    const principal = makePrincipal(org.organizationId);
    // Insert a call session row (direct DB) that both calls will reference.
    const { callSessions } = await import('@nivomi/database');
    const [session] = await t.db
      .insert(callSessions)
      .values({
        organizationId: org.organizationId,
        direction: 'OUTBOUND',
        fromE164: '+911601120000',
        toE164: '+919000000001',
        provider: 'simulated',
        providerCallId: `sim-idem-${crypto.randomUUID()}`,
        startedAt: new Date(),
        telephonyOutcome: 'CONNECTED',
      })
      .returning({ id: callSessions.id });

    const first = await svc.create(principal, {
      startsAt: new Date('2026-11-02T10:00:00Z'),
      durationMinutes: 30,
      channel: 'VIDEO',
      source: 'AI_CALL',
      callSessionId: session?.id,
    });
    const replay = await svc.create(principal, {
      startsAt: new Date('2026-11-02T11:00:00Z'), // different value, still a replay
      durationMinutes: 60,
      channel: 'VIDEO',
      source: 'AI_CALL',
      callSessionId: session?.id,
    });
    expect(first.id).toBe(replay.id);
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    const list = await svc.list(principal, {});
    expect(list).toHaveLength(1);
    // Replay did not overwrite the original start time.
    expect(list[0]?.startsAt.toISOString()).toBe('2026-11-02T10:00:00.000Z');
  });
});
