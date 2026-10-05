import { campaigns } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addLead,
  callingOrg,
  controlClock,
  createCampaign,
  DAY,
  prelaunch,
  runJobs,
  superAdmin,
  voiceOf,
} from '../support/calling.js';
import { createTestApp, joinAs, type Browser, type TestApp } from '../support/harness.js';

interface Dashboard {
  timezone: string;
  today: {
    dialled: number;
    completed: number;
    answered: number;
    connected: number;
    answerRate: number | null;
  };
  funnel: { stage: string; count: number }[];
  leads: { total: number; qualified: number; appointments: number };
  attention: { code: string; count: number | null; href: string }[];
  campaigns: { id: string; name: string; calls: number; leads: number; settled: number }[];
}

interface Queue {
  items: { state: string; fullName: string; lastReasons: string[]; campaignName: string }[];
  truncated: boolean;
}

describe('operations dashboard and call queue', () => {
  let t: TestApp;
  let admin: Browser;
  let clock: ReturnType<typeof controlClock>;

  beforeAll(async () => {
    t = await createTestApp({ VOICE_SIMULATED_CALL_MS: '0' });
    clock = controlClock(t);
    admin = (await superAdmin(t)).client;
  });

  afterAll(async () => {
    await t.close();
  });

  const iso = (ms: number) => new Date(clock.now.getTime() - ms).toISOString();

  it('summarises today’s calls, the funnel, attention items and active campaigns', async () => {
    const o = await callingOrg(t, admin, 'Dashboard Co');
    const answered = await addLead(o.client, {
      fullName: 'Answers',
      consentBasis: 'EXISTING_CUSTOMER',
    });
    const missed = await addLead(o.client, {
      fullName: 'Misses',
      consentBasis: 'EXISTING_CUSTOMER',
    });
    await addLead(o.client, { fullName: 'No Basis' });
    await addLead(o.client, { fullName: 'Undated', consentBasis: 'INQUIRY' });
    voiceOf(t).script.set(answered.phone, [{ outcome: 'CONNECTED', durationSeconds: 60 }]);
    voiceOf(t).script.set(missed.phone, [{ outcome: 'NO_ANSWER', durationSeconds: 0 }]);
    const id = await createCampaign(o, { name: 'Dashboard campaign' });
    await prelaunch(t, o.client, id);
    await o.client.post(`/api/v1/campaigns/${id}/launch`).expect(204);
    await runJobs(t, 5);

    const body = (await o.client.get('/api/v1/dashboard').expect(200)).body as Dashboard;
    expect(body.timezone).toBe('Asia/Kolkata');
    expect(body.today).toEqual({
      dialled: 2,
      completed: 2,
      answered: 1,
      connected: 1,
      answerRate: 0.5,
    });
    expect(body.funnel.slice(0, 3)).toEqual([
      { stage: 'Dialled', count: 2 },
      { stage: 'Answered', count: 1 },
      { stage: 'Conversations', count: 1 },
    ]);
    expect(body.leads.total).toBe(4);
    expect(body.attention.map((a) => a.code).sort()).toEqual([
      'COMPLIANCE_BLOCKS',
      'RETRIES',
      'REVIEW_QUEUE',
    ]);
    expect(body.campaigns).toEqual([
      expect.objectContaining({ id, name: 'Dashboard campaign', calls: 2, leads: 4 }),
    ]);

    // A campaign past 70% of its minute budget is flagged.
    await t.db
      .update(campaigns)
      .set({ usedSeconds: 500 * 60 * 0.8 })
      .where(eq(campaigns.id, id));
    const spent = (await o.client.get('/api/v1/dashboard').expect(200)).body as Dashboard;
    expect(spent.attention.map((a) => a.code)).toContain('BUDGET');

    // Tomorrow, today's calls no longer count.
    clock.advance(DAY);
    const tomorrow = (await o.client.get('/api/v1/dashboard').expect(200)).body as Dashboard;
    expect(tomorrow.today.dialled).toBe(0);
    expect(tomorrow.today.answerRate).toBeNull();
    clock.advance(-DAY);

    // The call queue explains each row, filtered by what the operator needs.
    const blocked = (await o.client.get('/api/v1/call-queue?filter=blocked').expect(200))
      .body as Queue;
    expect(blocked.items).toEqual([
      expect.objectContaining({
        state: 'BLOCKED',
        fullName: 'No Basis',
        lastReasons: ['NO_CONSENT_BASIS'],
      }),
    ]);
    const review = (await o.client.get('/api/v1/call-queue?filter=review').expect(200))
      .body as Queue;
    expect(review.items.map((i) => i.fullName)).toEqual(['Undated']);
    const upcoming = (await o.client.get('/api/v1/call-queue').expect(200)).body as Queue;
    expect(upcoming.items.map((i) => [i.fullName, i.state])).toEqual([['Misses', 'WAITING']]);
    const all = (await o.client.get('/api/v1/call-queue?filter=all').expect(200)).body as Queue;
    expect(all.items.map((i) => i.state)).toEqual(['WAITING', 'REVIEW', 'BLOCKED']);
    expect(all.truncated).toBe(false);
  });

  it('flags an unverified telecom identity and an Emergency Stop as critical', async () => {
    const o = await callingOrg(t, null, 'Unverified Dashboard Co');
    await o.client.post('/api/v1/campaigns/emergency-stop').send({}).expect(201);
    const body = (await o.client.get('/api/v1/dashboard').expect(200)).body as Dashboard;
    expect(body.attention.map((a) => a.code)).toEqual(
      expect.arrayContaining(['EMERGENCY_STOP', 'TELECOM_IDENTITY']),
    );
  });

  it('every account member sees the same tenant-wide dashboard aggregates and call queue', async () => {
    const o = await callingOrg(t, admin, 'Scoped Dashboard Co');
    const second = await joinAs(t, o.client, 'second-member');
    await addLead(o.client, { fullName: 'Team lead one', consentBasis: 'EXISTING_CUSTOMER' });
    await addLead(o.client, { fullName: 'Team lead two', consentBasis: 'EXISTING_CUSTOMER' });
    await addLead(second.client, {
      fullName: 'Second member’s lead',
      consentAt: iso(DAY),
      consentBasis: 'INQUIRY',
    });

    // 3-tier RBAC (post-b22063a): every member of the account shares its role; the dashboard
    // and call-queue views are tenant-scoped, not member-scoped. Cross-tenant isolation is
    // tested in `never counts another organization's calls or leads` below.
    const secondView = (await second.client.get('/api/v1/dashboard').expect(200)).body as Dashboard;
    expect(secondView.leads.total).toBe(3);
    await second.client.get('/api/v1/call-queue').expect(200);
  });

  it('never counts another organization’s calls or leads', async () => {
    const other = await callingOrg(t, admin, 'Empty Dashboard Co');
    const body = (await other.client.get('/api/v1/dashboard').expect(200)).body as Dashboard;
    expect(body.today.dialled).toBe(0);
    expect(body.leads.total).toBe(0);
    expect(body.campaigns).toEqual([]);
    const queue = (await other.client.get('/api/v1/call-queue?filter=all').expect(200))
      .body as Queue;
    expect(queue.items).toEqual([]);
  });
});
