import { users } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MfaService } from '../../src/auth/mfa.service.js';
import { NotificationsService } from '../../src/notifications/notifications.service.js';
import { callingOrg, superAdmin } from '../support/calling.js';
import { signedInUser, type Browser, type TestApp } from '../support/harness.js';
import { createTestApp } from '../support/harness.js';

async function userIdOf(t: TestApp, email: string): Promise<string> {
  const [row] = await t.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!row) throw new Error(`user ${email} not found`);
  return row.id;
}

describe('mfa + notifications (ADR-028, Phase 9)', () => {
  let t: TestApp;
  let admin: Browser;

  beforeAll(async () => {
    t = await createTestApp({ VOICE_SIMULATED_CALL_MS: '0' });
    admin = (await superAdmin(t)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  it('MFA: enroll generates a TOTP seed; verify accepts the correct current code, rejects a wrong one', async () => {
    const u = await signedInUser(t, 'mfa', 'MFA Person');
    const userId = await userIdOf(t, u.email);
    const svc = t.app.get(MfaService);
    const enrolled = await svc.enroll(userId);
    expect(enrolled.secretB32).toMatch(/^[A-Z2-7]+$/);
    expect(enrolled.recoveryCodes).toHaveLength(8);
    const current = MfaService.code(enrolled.secretB32);
    expect((await svc.verify(userId, current)).ok).toBe(true);
    expect((await svc.verify(userId, '000000')).ok).toBe(false);
  });

  it('MFA: enrolling twice conflicts', async () => {
    const u = await signedInUser(t, 'mfa-twice', 'MFA Twice');
    const userId = await userIdOf(t, u.email);
    const svc = t.app.get(MfaService);
    await svc.enroll(userId);
    await expect(svc.enroll(userId)).rejects.toThrow(/already enrolled/);
  });

  it('notifications: send renders a template into a QUEUED dispatch, idempotent per source_entity_id', async () => {
    const org = await callingOrg(t, admin, 'Notif Org');
    const user = await signedInUser(t, 'notif', 'Notif Person');
    const svc = t.app.get(NotificationsService);
    await svc.upsertDefinition({
      kind: 'quota.warn.90',
      channel: 'EMAIL',
      audience: 'OWNERS',
      subjectTemplate: 'Heads up: {{usage}} of {{limit}} used',
      bodyTemplate: 'Hi {{name}}, you have used {{usage}} of {{limit}}.',
    });
    const first = await svc.send({
      organizationId: org.organizationId,
      kind: 'quota.warn.90',
      channel: 'EMAIL',
      recipient: user.email,
      variables: { name: 'Alex', usage: 90, limit: 100 },
      sourceEntityId: 'warn-oct-2026',
    });
    const replay = await svc.send({
      organizationId: org.organizationId,
      kind: 'quota.warn.90',
      channel: 'EMAIL',
      recipient: user.email,
      variables: { name: 'Alex', usage: 90, limit: 100 },
      sourceEntityId: 'warn-oct-2026',
    });
    expect(first.dispatched).toBe(true);
    expect(replay.dispatched).toBe(false);
  });
});
