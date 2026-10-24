import { afterEach, describe, expect, it } from 'vitest';
import { auditLogs, users } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import { SuperAdminBootstrap } from '../../src/platform/super-admin-bootstrap.js';
import {
  browser,
  createTestApp,
  PASSWORD,
  signedInUser,
  type TestApp,
} from '../support/harness.js';

describe('Super Admin bootstrap from PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL', () => {
  let t: TestApp | undefined;

  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  async function isSuperAdmin(app: TestApp, email: string): Promise<boolean> {
    const [row] = await app.db
      .select({ flag: users.isSuperAdmin })
      .from(users)
      .where(eq(users.email, email));
    return row?.flag ?? false;
  }

  it('does nothing when the variable is unset', async () => {
    t = await createTestApp();
    const user = await signedInUser(t);
    expect(await t.app.get(SuperAdminBootstrap).run()).toBe('disabled');
    expect(await isSuperAdmin(t, user.email)).toBe(false);
  });

  it('promotes the existing account once, audited, and is idempotent', async () => {
    const email = 'owner@nivomi.test';
    t = await createTestApp({ PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL: ` ${email.toUpperCase()} ` });
    const bootstrap = t.app.get(SuperAdminBootstrap);
    // Registered after startup, so the startup run found no account.
    expect(await bootstrap.run()).toBe('not_found');

    const client = browser(t);
    await client
      .post('/api/v1/auth/register')
      .send({ name: 'Owner', email, password: PASSWORD })
      .expect(202);
    expect(await bootstrap.run()).toBe('promoted');
    expect(await isSuperAdmin(t, email)).toBe(true);
    expect(await bootstrap.run()).toBe('already');

    const entries = await t.db
      .select({ metadata: auditLogs.metadata, actor: auditLogs.actorUserId })
      .from(auditLogs)
      .where(eq(auditLogs.action, 'platform.user_promoted'));
    expect(entries).toEqual([{ metadata: { email, via: 'bootstrap_env' }, actor: null }]);

    await client.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);
    await client.get('/api/v1/platform/users').expect(200);
  });

  it('refuses once any Super Admin exists', async () => {
    const email = 'late@nivomi.test';
    t = await createTestApp({ PLATFORM_BOOTSTRAP_SUPER_ADMIN_EMAIL: email });
    const existing = await signedInUser(t, 'admin');
    await t.db.update(users).set({ isSuperAdmin: true }).where(eq(users.email, existing.email));
    await browser(t)
      .post('/api/v1/auth/register')
      .send({ name: 'Late', email, password: PASSWORD })
      .expect(202);

    expect(await t.app.get(SuperAdminBootstrap).run()).toBe('refused');
    expect(await isSuperAdmin(t, email)).toBe(false);
  });
});
