import { auditLogs, refreshTokens, users } from '@nivomi/database';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PASSWORD,
  browser,
  createTestApp,
  signedInUser,
  tokenFromEmail,
  uniqueEmail,
  type Browser,
  type TestApp,
  body,
} from '../support/harness.js';

function cookieNames(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : [];
  return list.map((cookie) => cookie.split('=')[0] ?? '');
}

function refreshCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : [];
  return list
    .find((cookie) => cookie.startsWith('nv_refresh=') && !cookie.startsWith('nv_refresh=;'))
    ?.split(';')[0]
    ?.slice('nv_refresh='.length);
}

describe('authentication', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('registration and verification', () => {
    it('answers identically for new and existing emails', async () => {
      const email = uniqueEmail();
      const first = await browser(t)
        .post('/api/v1/auth/register')
        .send({ name: 'Asha', email, password: PASSWORD })
        .expect(202);
      const second = await browser(t)
        .post('/api/v1/auth/register')
        .send({ name: 'Someone Else', email, password: 'another password 1' })
        .expect(202);
      expect(second.body).toEqual(first.body);
      const rows = await t.db.select().from(users).where(eq(users.email, email));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe('Asha');
    });

    it('stores an Argon2id hash, never the password', async () => {
      const email = uniqueEmail();
      await browser(t)
        .post('/api/v1/auth/register')
        .send({ name: 'Ravi', email, password: PASSWORD })
        .expect(202);
      const [user] = await t.db.select().from(users).where(eq(users.email, email));
      expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user?.passwordHash).not.toContain(PASSWORD);
    });

    it('rejects weak passwords with a field-level error', async () => {
      const res = await browser(t)
        .post('/api/v1/auth/register')
        .send({ name: 'Short', email: uniqueEmail(), password: 'short' })
        .expect(400);
      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'VALIDATION_ERROR', details: [expect.stringContaining('password')] },
      });
      expect(JSON.stringify(res.body)).not.toContain('short"');
    });

    // Email verification is intentionally disabled for the current MVP phase (owner decision,
    // 2026-10-04). Register marks new accounts as verified at creation and does not queue the
    // verify-email job, so the gating / token / resend behaviours below cannot fire. The
    // /auth/verify-email endpoint is still functional for later re-enablement; the tests
    // below return when verification is re-enabled under ADR-024 in Phase 0.

    it.skip('lets an unverified user sign in but gates product endpoints', async () => {
      const email = uniqueEmail();
      const client = browser(t);
      await client.post('/api/v1/auth/register').send({ name: 'Una', email, password: PASSWORD });
      await client.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);

      const me = await client.get('/api/v1/me').expect(200);
      expect(me.body).toMatchObject({ user: { email, emailVerified: false }, organizations: [] });

      const blocked = await client.post('/api/v1/organizations').send({ name: 'Nope' }).expect(403);
      expect(blocked.body).toMatchObject({ error: { code: 'EMAIL_NOT_VERIFIED' } });
    });

    it.skip('verifies with the emailed link, once', async () => {
      const email = uniqueEmail();
      const client = browser(t);
      await client.post('/api/v1/auth/register').send({ name: 'Vee', email, password: PASSWORD });
      const token = await tokenFromEmail(t, email, 'verify-email');

      await client.post('/api/v1/auth/verify-email').send({ token }).expect(204);
      const again = await client.post('/api/v1/auth/verify-email').send({ token }).expect(400);
      expect(again.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

      await client.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);
      const me = await client.get('/api/v1/me').expect(200);
      expect(me.body).toMatchObject({ user: { emailVerified: true } });
    });

    it.skip('invalidates older verification links when a new one is sent', async () => {
      const email = uniqueEmail();
      const client = browser(t);
      await client.post('/api/v1/auth/register').send({ name: 'Old', email, password: PASSWORD });
      const first = await tokenFromEmail(t, email, 'verify-email');
      await client.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);
      await client.post('/api/v1/auth/resend-verification').expect(202);
      const second = await tokenFromEmail(t, email, 'verify-email');
      expect(second).not.toBe(first);

      await client.post('/api/v1/auth/verify-email').send({ token: first }).expect(400);
      await client.post('/api/v1/auth/verify-email').send({ token: second }).expect(204);
    });
  });

  describe('sign-in', () => {
    it('sets HttpOnly cookies and never returns tokens in the body', async () => {
      const { client, email } = await signedInUser(t);
      await client.post('/api/v1/auth/logout').expect(204);
      const res = await client
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(204);
      expect(cookieNames(res)).toEqual(
        expect.arrayContaining(['nv_access', 'nv_refresh', 'nv_auth']),
      );
      const raw = (res.headers['set-cookie'] as unknown as string[]).join('\n');
      expect(raw).toMatch(/nv_access=[^;]+;.*HttpOnly/);
      expect(raw).toMatch(/nv_refresh=[^;]+;.*Path=\/api\/v1\/auth.*HttpOnly.*SameSite=Strict/);
      expect(res.text).toBe('');
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      const { email } = await signedInUser(t);
      const wrong = await browser(t)
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong password 123' })
        .expect(401);
      const unknown = await browser(t)
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail('ghost'), password: 'wrong password 123' })
        .expect(401);
      expect(body(wrong).error.message).toBe(body(unknown).error.message);
    });

    it('locks the account after repeated failures and audits it', async () => {
      const { email } = await signedInUser(t);
      const client = browser(t);
      for (let i = 0; i < 5; i += 1) {
        await client.post('/api/v1/auth/login').send({ email, password: `wrong-${i}-password` });
      }
      const locked = await client
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(423);
      expect(locked.body).toMatchObject({ error: { code: 'ACCOUNT_LOCKED', retryable: true } });

      const [user] = await t.db.select().from(users).where(eq(users.email, email));
      const events = await t.db
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.actorUserId, user?.id ?? ''));
      expect(events.map((e) => e.action)).toContain('auth.account_locked');
    });

    it('rate limits sign-in attempts per email with Retry-After', async () => {
      const email = uniqueEmail('limited');
      let last: request.Response | undefined;
      for (let i = 0; i < 11; i += 1) {
        last = await browser(t)
          .post('/api/v1/auth/login')
          .send({ email, password: 'wrong password 123' });
      }
      expect(last?.status).toBe(429);
      expect(last?.body).toMatchObject({ error: { code: 'RATE_LIMITED', retryable: true } });
      expect(Number(last?.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('requires sign-in for protected endpoints', async () => {
      const res = await request(t.server).get('/api/v1/me').expect(401);
      expect(res.body).toMatchObject({ error: { code: 'AUTHENTICATION_ERROR' } });
    });

    it('rejects a forged access token', async () => {
      await request(t.server)
        .get('/api/v1/me')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.forged')
        .expect(401);
    });
  });

  describe('CSRF', () => {
    it('refuses cookie-authenticated writes from other origins', async () => {
      const { client } = await signedInUser(t);
      const res = await client
        .post('/api/v1/organizations')
        .set('Origin', 'https://evil.example')
        .send({ name: 'Evil Corp' })
        .expect(403);
      expect(res.body).toMatchObject({ error: { code: 'AUTHORIZATION_ERROR' } });
    });
  });

  describe('refresh tokens', () => {
    async function login(): Promise<{ client: Browser; refresh: string }> {
      const { client, email } = await signedInUser(t);
      const res = await client.post('/api/v1/auth/login').send({ email, password: PASSWORD });
      const refresh = refreshCookie(res);
      if (!refresh) throw new Error('no refresh cookie');
      return { client, refresh };
    }

    it('rotates on every refresh', async () => {
      const { client, refresh } = await login();
      const res = await client.post('/api/v1/auth/refresh').expect(204);
      const rotated = refreshCookie(res);
      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(refresh);
      await client.get('/api/v1/me').expect(200);
    });

    it('treats a concurrent reuse inside the grace window as a conflict, not theft', async () => {
      const { client, refresh } = await login();
      await client.post('/api/v1/auth/refresh').expect(204);
      const replay = await browser(t)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `nv_refresh=${refresh}`)
        .expect(409);
      expect(replay.body).toMatchObject({ error: { code: 'REFRESH_CONFLICT' } });
      await client.get('/api/v1/me').expect(200);
    });

    it('revokes the whole session when an old token is replayed later', async () => {
      const { client, refresh } = await login();
      await client.post('/api/v1/auth/refresh').expect(204);
      // Age the used token beyond the grace window.
      await t.db
        .update(refreshTokens)
        .set({ usedAt: sql`now() - interval '5 minutes'` })
        .where(sql`${refreshTokens.usedAt} is not null`);

      await browser(t)
        .post('/api/v1/auth/refresh')
        .set('Cookie', `nv_refresh=${refresh}`)
        .expect(401);
      // The legitimate client is signed out too: the family is revoked.
      await client.get('/api/v1/me').expect(401);
      await client.post('/api/v1/auth/refresh').expect(401);
    });

    it('fails cleanly without a refresh cookie', async () => {
      const res = await browser(t).post('/api/v1/auth/refresh').expect(401);
      expect(res.body).toMatchObject({ error: { code: 'AUTHENTICATION_ERROR' } });
    });
  });

  describe('sessions', () => {
    it('logout revokes the session server-side', async () => {
      const { client } = await signedInUser(t);
      const loggedIn = await client.get('/api/v1/me').expect(200);
      expect(loggedIn.body).toBeDefined();
      await client.post('/api/v1/auth/logout').expect(204);
      await client.get('/api/v1/me').expect(401);
      await client.post('/api/v1/auth/refresh').expect(401);
    });

    it('lists sessions and revokes another device', async () => {
      const { client, email } = await signedInUser(t);
      const other = browser(t);
      await other.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);

      const list = await client.get('/api/v1/auth/sessions').expect(200);
      const items = body(list).items;
      expect(items).toHaveLength(2);
      const otherSession = items.find((s) => !s.current);
      expect(otherSession).toBeDefined();

      await client.delete(`/api/v1/auth/sessions/${otherSession?.id ?? ''}`).expect(204);
      await other.get('/api/v1/me').expect(401);
      await client.get('/api/v1/me').expect(200);
    });

    it('cannot revoke someone else’s session', async () => {
      const alice = await signedInUser(t);
      const bob = await signedInUser(t);
      const bobs = await bob.client.get('/api/v1/auth/sessions').expect(200);
      const bobSession = body(bobs).items[0]?.id ?? '';
      await alice.client.delete(`/api/v1/auth/sessions/${bobSession}`).expect(404);
      await bob.client.get('/api/v1/me').expect(200);
    });
  });

  describe('password reset and change', () => {
    it('resets with the emailed link and signs out every session', async () => {
      const { client, email } = await signedInUser(t);
      const res = await browser(t).post('/api/v1/auth/forgot-password').send({ email }).expect(202);
      const unknown = await browser(t)
        .post('/api/v1/auth/forgot-password')
        .send({ email: uniqueEmail('nobody') })
        .expect(202);
      expect(unknown.body).toEqual(res.body);

      const token = await tokenFromEmail(t, email, 'password-reset');
      const newPassword = 'a brand new passphrase';
      await browser(t)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: newPassword })
        .expect(204);
      await client.get('/api/v1/me').expect(401);
      await browser(t)
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'yet another passphrase' })
        .expect(400);

      await browser(t).post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(401);
      await browser(t)
        .post('/api/v1/auth/login')
        .send({ email, password: newPassword })
        .expect(204);
    });

    it('changes the password, keeping this session and ending the others', async () => {
      const { client, email } = await signedInUser(t);
      const other = browser(t);
      await other.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);

      await client
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'not my password', newPassword: 'changed passphrase 1' })
        .expect(401);
      await client
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: 'changed passphrase 1' })
        .expect(204);

      await client.get('/api/v1/me').expect(200);
      await other.get('/api/v1/me').expect(401);
    });
  });
});
