import { jobs, organizations, users } from '@nivomi/database';
import { eq, inArray } from 'drizzle-orm';
import { vi } from 'vitest';
import { SimulatedVoiceProvider, VOICE_PROVIDER } from '../../src/campaigns/voice-provider.js';
import { Clock } from '../../src/compliance/clock.js';
import {
  PREFERENCE_REGISTRY,
  SimulatedPreferenceRegistry,
} from '../../src/compliance/preference-registry.js';
import { owner, signedInUser, type Browser, type TestApp } from './harness.js';

/** Monday 5 Oct 2026, 12:00 in India: inside the promotional window, before DPDP commences. */
export const NOON_IST = new Date('2026-10-05T12:00:00+05:30');
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** A settable clock for the app's eligibility and campaign code. */
export function controlClock(t: TestApp) {
  const state = { now: NOON_IST };
  vi.spyOn(t.app.get(Clock), 'now').mockImplementation(() => state.now);
  return {
    get now() {
      return state.now;
    },
    set(at: Date) {
      state.now = at;
    },
    advance(ms: number) {
      state.now = new Date(state.now.getTime() + ms);
    },
  };
}

export const voiceOf = (t: TestApp) => t.app.get<SimulatedVoiceProvider>(VOICE_PROVIDER);
export const registryOf = (t: TestApp) =>
  t.app.get<SimulatedPreferenceRegistry>(PREFERENCE_REGISTRY);

/**
 * Runs background jobs as if time had passed: every pending job is made due, then drained, for
 * `rounds` rounds (campaign ticks re-schedule themselves on the app's clock).
 */
export async function runJobs(t: TestApp, rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await t.db
      .update(jobs)
      .set({ runAt: new Date(0) })
      .where(inArray(jobs.status, ['PENDING', 'RETRYING']));
    await t.worker.drain();
  }
}

let numberCounter = 0;
/** A unique 140-series caller number (national format). */
export function callerNumber(): string {
  numberCounter += 1;
  return `140${String(3_000_000 + numberCounter).padStart(7, '0')}`;
}

let phoneCounter = 0;
/** A unique fictitious Indian mobile, E.164. */
export function mobile(): string {
  phoneCounter += 1;
  return `+9197${String(10_000_000 + phoneCounter).slice(-8)}`;
}

/** A platform Super Admin (granted directly in the database, as in production). */
export async function superAdmin(t: TestApp) {
  const admin = await signedInUser(t, 'superadmin', 'Sam Super');
  await t.db.update(users).set({ isSuperAdmin: true }).where(eq(users.email, admin.email));
  return admin;
}

export interface CallingOrg {
  client: Browser;
  email: string;
  organizationId: string;
  callerNumberId: string;
  callerNumber: string;
  /** A published promotional agent version, pinned by `createCampaign`. */
  agentVersionId: string;
}

/** Creates and publishes the starter agent; returns the version id. */
export async function publishedAgent(
  client: Browser,
  callCategory: 'PROMOTIONAL' | 'SERVICE' = 'PROMOTIONAL',
): Promise<string> {
  const created = await client
    .post('/api/v1/agents')
    .send({ name: `${callCategory.toLowerCase()} agent`, callCategory })
    .expect(201);
  const published = await client
    .post(`/api/v1/agents/${(created.body as { id: string }).id}/publish`)
    .expect(201);
  return (published.body as { id: string }).id;
}

/**
 * An approved organization with a telecom identity and one promotional 140xx number, verified
 * by `admin` unless `verify` is false.
 */
export async function callingOrg(
  t: TestApp,
  admin: Browser | null,
  name = 'Calling Co',
  sector = 'REAL_ESTATE',
): Promise<CallingOrg> {
  const o = await owner(t, name);
  await t.db
    .update(organizations)
    .set({ status: 'ACTIVE' })
    .where(eq(organizations.id, o.organizationId));
  await o.client
    .put('/api/v1/telecom-identity')
    .send({
      legalName: `${name} Pvt Ltd`,
      dltEntityId: `DLT-${o.organizationId.slice(0, 8)}`,
      telemarketerName: 'Example Telemarketer',
      telemarketerRegistrationId: 'TM-001',
      sector,
      a2pDeclarationReference: 'A2P-2026-001',
      a2pDeclaredAt: '2026-09-01T00:00:00+05:30',
      selfCertifiedAt: '2026-09-01T00:00:00+05:30',
    })
    .expect(200);
  const number = callerNumber();
  const added = await o.client
    .post('/api/v1/telecom-identity/numbers')
    .send({ phone: number, purpose: 'PROMOTIONAL', a2pDeclared: true })
    .expect(201);
  const callerNumberId = (added.body as { id: string }).id;
  if (admin) {
    await o.client.post('/api/v1/telecom-identity/submit').expect(201);
    await admin
      .post(`/api/v1/platform/organizations/${o.organizationId}/telecom-identity/review`)
      .send({ approve: true })
      .expect(201);
  }
  const agentVersionId = await publishedAgent(o.client);
  return { ...o, callerNumberId, callerNumber: `+91${number}`, agentVersionId };
}

export async function addLead(
  client: Browser,
  fields: {
    fullName: string;
    phone?: string;
    consentBasis?: string | null;
    consentAt?: string | null;
    consentReference?: string | null;
    leadStatus?: string;
  },
): Promise<{ id: string; phone: string }> {
  const phone = fields.phone ?? mobile();
  const res = await client
    .post('/api/v1/leads')
    .send({ ...fields, phone, consentSource: 'Test enquiry form' })
    .expect(201);
  return { id: (res.body as { id: string }).id, phone };
}

export async function createCampaign(
  org: Pick<CallingOrg, 'client' | 'callerNumberId' | 'agentVersionId'>,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await org.client
    .post('/api/v1/campaigns')
    .send({
      name: 'October follow-up',
      callCategory: 'PROMOTIONAL',
      callerNumberId: org.callerNumberId,
      agentVersionId: org.agentVersionId,
      selection: { kind: 'FILTER' },
      windowStart: '10:00',
      windowEnd: '21:00',
      budgetMinutes: 500,
      ...overrides,
    })
    .expect(201);
  return (res.body as { id: string }).id;
}

export interface CampaignView {
  id: string;
  status: string;
  pauseReason: string | null;
  usedSeconds: number;
  prelaunch: {
    status: string;
    total: number;
    eligible: number;
    deferred: number;
    blocked: number;
    review: number;
    byReason: Record<string, number>;
    ruleSetVersion: number | null;
    stale: boolean;
  } | null;
  progress: {
    leadsByState: Record<string, number>;
    liveCalls: number;
    remaining: number;
    outcomes: Record<string, number>;
    reasons: { state: string; code: string; count: number }[];
  };
}

export async function campaign(client: Browser, id: string): Promise<CampaignView> {
  const res = await client.get(`/api/v1/campaigns/${id}`).expect(200);
  return res.body as CampaignView;
}

/** Runs the pre-launch check to completion and returns the campaign. */
export async function prelaunch(t: TestApp, client: Browser, id: string): Promise<CampaignView> {
  await client.post(`/api/v1/campaigns/${id}/prelaunch-check`).expect(202);
  await runJobs(t, 2);
  return campaign(client, id);
}
