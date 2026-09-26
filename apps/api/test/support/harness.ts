import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Database } from '@nivomi/database';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createApp } from '../../src/app.factory.js';
import { loadApiEnv } from '../../src/config/env.js';
import { DATABASE } from '../../src/database/database.module.js';
import { JobWorker } from '../../src/jobs/jobs.js';

export const ALLOWED_ORIGIN = 'https://app.nivomi.test';
export const PASSWORD = 'correct horse battery';
/** Test-only credential encryption key (32 zero-padded bytes); never a real secret. */
export const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly server: App;
  readonly db: Database;
  readonly worker: JobWorker;
  readonly mailbox: string;
  close(): Promise<void>;
}

/** Boots the real application on an in-memory PostgreSQL (PGlite) with the worker off. */
export async function createTestApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  const mailbox = mkdtempSync(join(tmpdir(), 'nivomi-mailbox-'));
  const uploads = mkdtempSync(join(tmpdir(), 'nivomi-uploads-'));
  const app = await createApp(
    loadApiEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      CORS_ALLOWED_ORIGINS: ALLOWED_ORIGIN,
      APP_VERSION: 'test-build',
      APP_WEB_URL: ALLOWED_ORIGIN,
      AUTH_JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      DATABASE_PGLITE_DIR: 'memory',
      EMAIL_DEV_MAILBOX_DIR: mailbox,
      WORKER_ENABLED: 'false',
      // Lets each test pose as a distinct client IP via X-Forwarded-For.
      TRUST_PROXY: 'true',
      STORAGE_LOCAL_DIR: uploads,
      CREDENTIALS_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      ...overrides,
    }),
  );
  await app.init();
  return {
    app,
    server: app.getHttpServer(),
    db: app.get<Database>(DATABASE),
    worker: app.get(JobWorker),
    mailbox,
    close: async () => {
      await app.close();
      rmSync(mailbox, { recursive: true, force: true });
      rmSync(uploads, { recursive: true, force: true });
    },
  };
}

interface StoredEmail {
  to: string;
  subject: string;
  text: string;
  category: string;
}

/** Runs pending jobs, then returns the token from the newest email of `category` sent to `to`. */
export async function tokenFromEmail(t: TestApp, to: string, category: string): Promise<string> {
  await t.worker.drain();
  const emails = readdirSync(t.mailbox)
    .sort()
    .map((file) => JSON.parse(readFileSync(join(t.mailbox, file), 'utf8')) as StoredEmail)
    .filter((email) => email.to === to && email.category === category);
  const latest = emails.at(-1);
  const token = latest?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
  if (!token) throw new Error(`no ${category} email for ${to}`);
  return token;
}

let ipCounter = 0;
/** A fresh client IP, so per-IP rate limits never couple unrelated tests. */
export function nextIp(): string {
  ipCounter += 1;
  return `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

/** A cookie-keeping browser-like client with its own IP and an allowed Origin. */
export function browser(t: TestApp) {
  const agent = request.agent(t.server);
  agent.set('Origin', ALLOWED_ORIGIN).set('X-Forwarded-For', nextIp());
  return agent;
}

export type Browser = ReturnType<typeof browser>;

let emailCounter = 0;
export function uniqueEmail(label = 'user'): string {
  emailCounter += 1;
  return `${label}-${emailCounter}-${Date.now()}@example.com`;
}

/** Registers, verifies and signs in a user; returns the signed-in client. */
export async function signedInUser(t: TestApp, label = 'user', name = 'Test User') {
  const email = uniqueEmail(label);
  const client = browser(t);
  await client.post('/api/v1/auth/register').send({ name, email, password: PASSWORD }).expect(202);
  const token = await tokenFromEmail(t, email, 'verify-email');
  await client.post('/api/v1/auth/verify-email').send({ token }).expect(204);
  await client.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);
  return { client, email };
}

/** A signed-in user who owns a new organization. */
export async function owner(t: TestApp, organizationName = 'Acme Realty') {
  const user = await signedInUser(t, 'owner', 'Olivia Owner');
  const res = await user.client
    .post('/api/v1/organizations')
    .send({ name: organizationName })
    .expect(201);
  return { ...user, organizationId: (res.body as { id: string }).id };
}

/** The response shapes the tests read, so assertions stay type-checked. */
export interface ApiBody {
  id: string;
  slug: string;
  nextCursor: string | null;
  items: {
    id: string;
    action: string;
    resourceId: string | null;
    current: boolean;
    role: string;
    email: string;
    userId: string;
  }[];
  activeOrganization: { id: string; role: string; permissions: string[] } | null;
  error: { code: string; message: string; retryable: boolean };
}

export const body = (res: { body: unknown }): ApiBody => res.body as ApiBody;

/** Invites a new verified user into the owner's active organization with `role`. */
export async function joinAs(
  t: TestApp,
  ownerClient: Browser,
  role: string,
  label = role.toLowerCase(),
) {
  const member = await signedInUser(t, label, `${role} Person`);
  await ownerClient
    .post('/api/v1/organizations/current/invitations')
    .send({ email: member.email, role })
    .expect(201);
  const token = await tokenFromEmail(t, member.email, 'invitation');
  await member.client.post('/api/v1/organizations/invitations/accept').send({ token }).expect(201);
  return member;
}
