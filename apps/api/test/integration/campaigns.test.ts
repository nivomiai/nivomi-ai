import {
  auditLogs,
  callAttempts,
  campaignLeads,
  jobs,
  leadStatusChanges,
  suppressionEntries,
  telecomConsentEntries,
} from '@nivomi/database';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallOutcomeService } from '../../src/campaigns/call-outcomes.js';
import { CampaignRunner } from '../../src/campaigns/campaign-runner.js';
import {
  addLead,
  callingOrg,
  campaign,
  controlClock,
  createCampaign,
  DAY,
  HOUR,
  NOON_IST,
  prelaunch,
  runJobs,
  superAdmin,
  voiceOf,
  type CallingOrg,
} from '../support/calling.js';
import { createTestApp, joinAs, type Browser, type TestApp } from '../support/harness.js';

describe('campaigns against the simulated dialer (FR-35–FR-43)', () => {
  let t: TestApp;
  let admin: Browser;
  let clock: ReturnType<typeof controlClock>;

  beforeAll(async () => {
    t = await createTestApp({ VOICE_SIMULATED_CALL_MS: '0' });
    clock = controlClock(t);
    admin = (await superAdmin(t)).client;
  });

  beforeEach(() => {
    clock.set(NOON_IST);
    voiceOf(t).failNext = 0;
    voiceOf(t).holdCalls = false;
    voiceOf(t).held.splice(0);
  });

  afterAll(async () => {
    await t.close();
  });

  const iso = (ms: number) => new Date(clock.now.getTime() - ms).toISOString();
  const script = (phone: string, ...outcomes: [string, number][]) =>
    voiceOf(t).script.set(
      phone,
      outcomes.map(([outcome, durationSeconds]) => ({
        outcome: outcome as 'CONNECTED',
        durationSeconds,
      })),
    );
  const attemptsFor = (campaignId: string) =>
    t.db
      .select()
      .from(callAttempts)
      .where(eq(callAttempts.campaignId, campaignId))
      .orderBy(asc(callAttempts.attemptNumber), asc(callAttempts.createdAt));
  const leadStatus = async (client: Browser, leadId: string) =>
    ((await client.get(`/api/v1/leads/${leadId}`).expect(200)).body as { status: string }).status;

  async function launched(o: CallingOrg, overrides: Record<string, unknown> = {}) {
    const id = await createCampaign(o.client, o.callerNumberId, overrides);
    const view = await prelaunch(t, o.client, id);
    expect(view.prelaunch?.status).toBe('COMPLETED');
    await o.client.post(`/api/v1/campaigns/${id}/launch`).expect(204);
    return id;
  }

  it('runs a static campaign to completion, recording attempts, outcomes and lead statuses', async () => {
    const o = await callingOrg(t, admin, 'Run Co');
    const asha = await addLead(o.client, {
      fullName: 'Asha',
      consentBasis: 'INQUIRY',
      consentAt: iso(DAY),
    });
    const ben = await addLead(o.client, { fullName: 'Ben', consentBasis: 'EXISTING_CUSTOMER' });
    const blocked = await addLead(o.client, { fullName: 'No Basis' });
    script(asha.phone, ['CONNECTED', 120]);
    script(ben.phone, ['NOT_INTERESTED', 40]);

    const id = await launched(o);
    expect((await campaign(o.client, id)).status).toBe('RUNNING');
    await runJobs(t, 5);

    const view = await campaign(o.client, id);
    expect(view).toMatchObject({ status: 'COMPLETED', usedSeconds: 160 });
    expect(view.progress.leadsByState).toMatchObject({ DONE: 2, BLOCKED: 1 });
    expect(view.progress.outcomes).toEqual({ CONNECTED: 1, NOT_INTERESTED: 1 });
    expect(view.progress.reasons).toContainEqual({
      state: 'BLOCKED',
      code: 'NO_CONSENT_BASIS',
      count: 1,
    });

    const attempts = await attemptsFor(id);
    expect(attempts).toHaveLength(2);
    for (const a of attempts) {
      expect(a).toMatchObject({ status: 'COMPLETED', attemptNumber: 1, provider: 'simulated' });
      expect(a.providerCallId).toMatch(/^sim-/);
    }
    expect(await leadStatus(o.client, asha.id)).toBe('CONNECTED');
    expect(await leadStatus(o.client, ben.id)).toBe('NOT_INTERESTED');
    expect(await leadStatus(o.client, blocked.id)).toBe('NEW');
    // The provider was told to disclose the AI and the recording (CR-10).
    expect(voiceOf(t).placed.find((p) => p.to === asha.phone)?.obligations).toEqual({
      aiDisclosure: true,
      recordingNotice: true,
    });

    const audit = await t.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, o.organizationId));
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'campaign.created',
        'campaign.prelaunch_requested',
        'campaign.launched',
        'campaign.completed',
      ]),
    );
    const detail = await o.client.get(`/api/v1/leads/${asha.id}`).expect(200);
    const timeline = (
      detail.body as { timeline: { type: string; purpose?: string; outcome?: string }[] }
    ).timeline;
    expect(timeline).toContainEqual(
      expect.objectContaining({ type: 'call', outcome: 'CONNECTED' }),
    );
    expect(timeline).toContainEqual(
      expect.objectContaining({ type: 'eligibility', purpose: 'DIAL' }),
    );
  });

  it('retries unanswered calls after the cooldown, and marks the lead UNREACHABLE after the last', async () => {
    const o = await callingOrg(t, admin, 'Retry Co');
    const lead = await addLead(o.client, {
      fullName: 'Hard To Reach',
      consentBasis: 'EXISTING_CUSTOMER',
    });
    script(lead.phone, ['NO_ANSWER', 0], ['BUSY', 0], ['NO_ANSWER', 0]);
    const id = await launched(o);

    await runJobs(t, 3);
    expect(await attemptsFor(id)).toHaveLength(1);
    expect(await leadStatus(o.client, lead.id)).toBe('ATTEMPTED');
    // Within the 4-hour interval nothing is dialled.
    clock.advance(3 * HOUR);
    await runJobs(t, 3);
    expect(await attemptsFor(id)).toHaveLength(1);

    clock.advance(1.5 * HOUR); // 16:30: second attempt of the day
    await runJobs(t, 3);
    expect(await attemptsFor(id)).toHaveLength(2);

    clock.advance(4.5 * HOUR); // 21:00: outside the window and past the daily cap
    await runJobs(t, 3);
    expect(await attemptsFor(id)).toHaveLength(2);
    const [waiting] = await t.db
      .select()
      .from(campaignLeads)
      .where(eq(campaignLeads.campaignId, id));
    expect(waiting?.state).toBe('WAITING');

    clock.set(new Date('2026-10-06T10:30:00+05:30'));
    await runJobs(t, 4);
    const attempts = await attemptsFor(id);
    expect(attempts.map((a) => [a.attemptNumber, a.outcome])).toEqual([
      [1, 'NO_ANSWER'],
      [2, 'BUSY'],
      [3, 'NO_ANSWER'],
    ]);
    expect(await leadStatus(o.client, lead.id)).toBe('UNREACHABLE');
    expect(await campaign(o.client, id)).toMatchObject({ status: 'COMPLETED' });
  });

  it('applies an in-call opt-out at once: suppression, Do not call, telecom revocation (FR-51)', async () => {
    const o = await callingOrg(t, admin, 'Opt Out Co');
    const lead = await addLead(o.client, {
      fullName: 'Stop Calling',
      consentBasis: 'INQUIRY',
      consentAt: iso(DAY),
    });
    script(lead.phone, ['OPTED_OUT', 20]);
    const id = await launched(o);
    await runJobs(t, 4);

    expect(await leadStatus(o.client, lead.id)).toBe('DO_NOT_CALL');
    const [suppression] = await t.db
      .select()
      .from(suppressionEntries)
      .where(
        and(
          eq(suppressionEntries.organizationId, o.organizationId),
          eq(suppressionEntries.phoneE164, lead.phone),
        ),
      );
    expect(suppression?.source).toBe('IN_CALL_OPT_OUT');
    const ledger = await t.db
      .select({ kind: telecomConsentEntries.kind, source: telecomConsentEntries.source })
      .from(telecomConsentEntries)
      .where(eq(telecomConsentEntries.phoneE164, lead.phone));
    expect(ledger).toContainEqual({ kind: 'REVOCATION', source: 'IN_CALL_OPT_OUT' });

    // A later campaign never reaches the number.
    const again = await createCampaign(o.client, o.callerNumberId, { name: 'Again' });
    const view = await prelaunch(t, o.client, again);
    expect(view.prelaunch?.byReason).toMatchObject({
      SUPPRESSED: 1,
      LEAD_DO_NOT_CALL: 1,
      CONSENT_REVOKED: 1,
    });
    expect(await campaign(o.client, id)).toMatchObject({ status: 'COMPLETED' });
  });

  it('re-checks eligibility at dial time: a lead suppressed after launch is never called (FR-39)', async () => {
    const o = await callingOrg(t, admin, 'Recheck Co');
    const lead = await addLead(o.client, {
      fullName: 'Changed Mind',
      consentBasis: 'EXISTING_CUSTOMER',
    });
    const id = await launched(o);
    await o.client
      .post('/api/v1/suppression')
      .send({ phone: lead.phone, reason: 'Emailed us' })
      .expect(201);
    await runJobs(t, 3);

    expect(await attemptsFor(id)).toHaveLength(0);
    const [runState] = await t.db
      .select()
      .from(campaignLeads)
      .where(eq(campaignLeads.campaignId, id));
    expect(runState).toMatchObject({
      state: 'BLOCKED',
      lastResult: 'BLOCKED',
      lastReasons: ['SUPPRESSED'],
    });
    expect(voiceOf(t).placed.some((p) => p.to === lead.phone)).toBe(false);
  });

  it('defers outside calling hours and dials when the window opens', async () => {
    const o = await callingOrg(t, admin, 'Hours Co');
    await addLead(o.client, { fullName: 'Night Owl', consentBasis: 'EXISTING_CUSTOMER' });
    clock.set(new Date('2026-10-05T22:00:00+05:30'));
    const id = await launched(o);
    await runJobs(t, 3);
    expect(await attemptsFor(id)).toHaveLength(0);
    const [runState] = await t.db
      .select()
      .from(campaignLeads)
      .where(eq(campaignLeads.campaignId, id));
    expect(runState?.nextAttemptAt?.toISOString()).toBe(
      new Date('2026-10-06T10:00:00+05:30').toISOString(),
    );
    expect(runState?.lastReasons).toEqual(['OUTSIDE_CALLING_HOURS']);

    clock.set(new Date('2026-10-06T10:00:30+05:30'));
    await runJobs(t, 3);
    expect(await attemptsFor(id)).toHaveLength(1);
  });

  it('applies a replayed call outcome once and never double-dials a re-run dial job', async () => {
    const o = await callingOrg(t, admin, 'Idempotent Co');
    const lead = await addLead(o.client, { fullName: 'Once', consentBasis: 'EXISTING_CUSTOMER' });
    script(lead.phone, ['CONNECTED', 90]);
    const id = await launched(o);
    await runJobs(t, 4);
    const [attempt] = await attemptsFor(id);
    expect(attempt?.outcome).toBe('CONNECTED');

    // The provider delivers the same event again, with a different outcome.
    const outcomes = t.app.get(CallOutcomeService);
    const replay = await outcomes.apply({
      attemptId: attempt!.id,
      providerCallId: attempt!.providerCallId,
      outcome: 'NO_ANSWER',
      durationSeconds: 5,
    });
    expect(replay).toEqual({ applied: false });
    expect((await campaign(o.client, id)).usedSeconds).toBe(90);
    const changes = await t.db
      .select()
      .from(leadStatusChanges)
      .where(eq(leadStatusChanges.leadId, lead.id));
    expect(changes.filter((c) => c.source === 'AI_CALL')).toHaveLength(1);

    // Re-running a finished dial job (duplicate delivery) does nothing.
    const [dialJob] = await t.db
      .select()
      .from(jobs)
      .where(and(eq(jobs.type, 'campaign.dial'), eq(jobs.organizationId, o.organizationId)));
    await t.app
      .get(CampaignRunner)
      .dial(dialJob!.payload as { campaignLeadId: string; dialToken: string });
    expect(await attemptsFor(id)).toHaveLength(1);
    expect(voiceOf(t).placed.filter((p) => p.to === lead.phone)).toHaveLength(1);
  });

  it('recovers from a crash after the attempt is committed without dialling again', async () => {
    const o = await callingOrg(t, admin, 'Crash Co');
    const lead = await addLead(o.client, {
      fullName: 'Crash Test',
      consentBasis: 'EXISTING_CUSTOMER',
    });
    const voice = voiceOf(t);
    const outcomes = t.app.get(CallOutcomeService);
    // The worker dies after committing the attempt, before the provider hears of it.
    const originalPlace = voice.placeCall.bind(voice);
    const originalApply = outcomes.apply.bind(outcomes);
    let crashed = false;
    const place = vi.spyOn(voice, 'placeCall').mockImplementation((request) => {
      if (request.to !== lead.phone || crashed) return originalPlace(request);
      crashed = true;
      return Promise.reject(new Error('worker crashed'));
    });
    let crashedAgain = false;
    const apply = vi.spyOn(outcomes, 'apply').mockImplementation((event) => {
      if (event.outcome !== 'PROVIDER_ERROR' || crashedAgain) return originalApply(event);
      crashedAgain = true;
      return Promise.reject(new Error('worker crashed'));
    });
    const id = await launched(o);
    await runJobs(t, 1);
    const [pending] = await attemptsFor(id);
    expect(pending).toMatchObject({ status: 'DIALING', providerCallId: null });
    expect(pending?.dialRequestedAt).not.toBeNull();
    apply.mockRestore();

    // The retried dial job sees the committed attempt: it reconciles instead of dialling.
    await runJobs(t, 2);
    const attempts = await attemptsFor(id);
    expect(attempts[0]).toMatchObject({
      attemptNumber: 1,
      status: 'COMPLETED',
      outcome: 'PROVIDER_ERROR',
    });
    expect(place.mock.calls.filter(([req]) => req.to === lead.phone)).toHaveLength(1);
    place.mockRestore();

    // The retry policy then makes attempt 2, with a fresh decision.
    clock.advance(4 * HOUR + 60_000);
    script(lead.phone, ['CONNECTED', 30]);
    await runJobs(t, 3);
    const after = await attemptsFor(id);
    expect(after.map((a) => [a.attemptNumber, a.outcome])).toEqual([
      [1, 'PROVIDER_ERROR'],
      [2, 'CONNECTED'],
    ]);
    expect(new Set(after.map((a) => a.decisionId)).size).toBe(2);
  });

  it('reconciles a stale unconfirmed attempt with the provider instead of dialling', async () => {
    const o = await callingOrg(t, admin, 'Reconcile Co');
    const lead = await addLead(o.client, {
      fullName: 'Lost Id',
      consentBasis: 'EXISTING_CUSTOMER',
    });
    script(lead.phone, ['CONNECTED', 45]);
    const id = await launched(o);
    // The call is live (its outcome has not arrived) and its provider id was lost in a crash.
    voiceOf(t).holdCalls = true;
    await runJobs(t, 1);
    const [attempt] = await attemptsFor(id);
    const providerCallId = attempt!.providerCallId;
    await t.db
      .update(callAttempts)
      .set({ providerCallId: null })
      .where(eq(callAttempts.id, attempt!.id));
    const placedBefore = voiceOf(t).placed.length;

    clock.advance(6 * 60_000);
    await runJobs(t, 1);
    const [reconciled] = await attemptsFor(id);
    expect(reconciled).toMatchObject({ status: 'DIALING', providerCallId });
    expect(voiceOf(t).placed.length).toBe(placedBefore);
  });

  it('closes a failed provider request as PROVIDER_ERROR and retries it later (FR-40)', async () => {
    const o = await callingOrg(t, admin, 'Provider Down Co');
    const lead = await addLead(o.client, {
      fullName: 'Retry Me',
      consentBasis: 'EXISTING_CUSTOMER',
    });
    voiceOf(t).failNext = 1;
    const id = await launched(o);
    await runJobs(t, 3);
    const [attempt] = await attemptsFor(id);
    expect(attempt).toMatchObject({ outcome: 'PROVIDER_ERROR', status: 'COMPLETED' });
    const [runState] = await t.db
      .select()
      .from(campaignLeads)
      .where(eq(campaignLeads.campaignId, id));
    expect(runState).toMatchObject({ state: 'WAITING', attemptsMade: 1 });
    // A provider failure says nothing about the lead.
    expect(await leadStatus(o.client, lead.id)).toBe('NEW');
  });

  it('keeps one conversation per lead across campaigns (FR-41)', async () => {
    const o = await callingOrg(t, admin, 'One Call Co');
    const lead = await addLead(o.client, {
      fullName: 'Popular',
      consentBasis: 'EXISTING_CUSTOMER',
    });
    // The first call stays live: its provider event has not arrived.
    voiceOf(t).holdCalls = true;
    const first = await launched(o, { name: 'First' });
    await runJobs(t, 1);
    const [live] = await attemptsFor(first);
    expect(live?.status).toBe('DIALING');

    const second = await launched(o, { name: 'Second' });
    await runJobs(t, 2);
    expect(await attemptsFor(second)).toHaveLength(0);
    const [waiting] = await t.db
      .select()
      .from(campaignLeads)
      .where(eq(campaignLeads.campaignId, second));
    expect(waiting?.lastReasons).toEqual(['CALL_IN_PROGRESS']);

    // Once it connects, the lead is not called again the same day (A-19).
    voiceOf(t).held.splice(0);
    await t.app
      .get(CallOutcomeService)
      .apply({ attemptId: live!.id, outcome: 'CONNECTED', durationSeconds: 60 });
    clock.advance(10 * 60_000);
    await runJobs(t, 2);
    expect(await attemptsFor(second)).toHaveLength(0);
    const [again] = await t.db
      .select()
      .from(campaignLeads)
      .where(eq(campaignLeads.campaignId, second));
    expect(again?.lastReasons).toContain('ALREADY_CONNECTED_TODAY');
    expect(await leadStatus(o.client, lead.id)).toBe('CONNECTED');
    await o.client.post(`/api/v1/campaigns/${second}/stop`).expect(204);
  });

  it('pauses on Emergency Stop, refuses to resume until released, and audits both (FR-43)', async () => {
    const o = await callingOrg(t, admin, 'Stop Co');
    const member = await joinAs(t, o.client, 'member');
    for (let i = 0; i < 3; i += 1) {
      await addLead(o.client, { fullName: `Lead ${i}`, consentBasis: 'EXISTING_CUSTOMER' });
    }
    const id = await launched(o, { maxConcurrentCalls: 1 });

    // Every member of an ORGANIZATION account holds the campaigns.emergency_stop permission
    // in the 3-tier RBAC model; the former ANALYST/MANAGER split no longer exists.
    const stopped = await member.client
      .post('/api/v1/campaigns/emergency-stop')
      .send({ reason: 'Complaint escalation' })
      .expect(201);
    expect(stopped.body).toMatchObject({ pausedCampaigns: 1 });
    await runJobs(t, 3);
    expect(await campaign(o.client, id)).toMatchObject({
      status: 'PAUSED',
      pauseReason: 'EMERGENCY_STOP',
    });
    expect(await attemptsFor(id)).toHaveLength(0);

    await o.client.post(`/api/v1/campaigns/${id}/resume`).expect(409);
    await o.client.delete('/api/v1/campaigns/emergency-stop').expect(204);
    // Releasing does not resume anything by itself.
    expect((await campaign(o.client, id)).status).toBe('PAUSED');
    await o.client.post(`/api/v1/campaigns/${id}/resume`).expect(204);
    await runJobs(t, 2);
    expect((await attemptsFor(id)).length).toBeGreaterThan(0);

    const audit = await t.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, o.organizationId));
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'calling.emergency_stop_activated',
        'calling.emergency_stop_released',
        'campaign.resumed',
      ]),
    );
    await o.client.post(`/api/v1/campaigns/${id}/stop`).expect(204);
  });

  it('auto-pauses when the minute budget is used up', async () => {
    const o = await callingOrg(t, admin, 'Budget Co');
    const a = await addLead(o.client, { fullName: 'Talker', consentBasis: 'EXISTING_CUSTOMER' });
    const b = await addLead(o.client, { fullName: 'Waiting', consentBasis: 'EXISTING_CUSTOMER' });
    script(a.phone, ['CONNECTED', 90]);
    script(b.phone, ['CONNECTED', 90]);
    const id = await launched(o, { budgetMinutes: 1, maxConcurrentCalls: 1 });
    await runJobs(t, 4);
    expect(await campaign(o.client, id)).toMatchObject({
      status: 'PAUSED',
      pauseReason: 'BUDGET_EXHAUSTED',
    });
    expect(await attemptsFor(id)).toHaveLength(1);
    await o.client.post(`/api/v1/campaigns/${id}/resume`).expect(409);
  });

  it('pauses, resumes and schedules through the lifecycle (FR-37)', async () => {
    const o = await callingOrg(t, admin, 'Lifecycle Co');
    await addLead(o.client, { fullName: 'Later', consentBasis: 'EXISTING_CUSTOMER' });
    const startsAt = new Date(clock.now.getTime() + DAY).toISOString();
    const id = await launched(o, { startsAt });
    expect((await campaign(o.client, id)).status).toBe('SCHEDULED');
    await runJobs(t, 2);
    expect(await attemptsFor(id)).toHaveLength(0);
    await o.client.post(`/api/v1/campaigns/${id}/launch`).expect(409);
    await o.client.post(`/api/v1/campaigns/${id}/pause`).expect(204);
    await o.client.post(`/api/v1/campaigns/${id}/resume`).expect(204);
    clock.advance(DAY + 60_000);
    await runJobs(t, 3);
    expect((await campaign(o.client, id)).status).toMatch(/RUNNING|COMPLETED/);
    expect(await attemptsFor(id)).toHaveLength(1);

    const draft = await createCampaign(o.client, o.callerNumberId, { name: 'Never' });
    await o.client.post(`/api/v1/campaigns/${draft}/cancel`).expect(204);
    await o.client.post(`/api/v1/campaigns/${draft}/prelaunch-check`).expect(409);
  });

  it('enrolls new matching leads into a continuous campaign (A-17)', async () => {
    const o = await callingOrg(t, admin, 'Continuous Co');
    await addLead(o.client, { fullName: 'First', consentBasis: 'EXISTING_CUSTOMER' });
    const id = await launched(o, {
      type: 'CONTINUOUS',
      selection: { kind: 'FILTER', statuses: ['NEW'] },
    });
    await runJobs(t, 3);
    expect(await attemptsFor(id)).toHaveLength(1);

    const newcomer = await addLead(o.client, {
      fullName: 'Newcomer',
      consentBasis: 'EXISTING_CUSTOMER',
    });
    await runJobs(t, 3);
    const attempts = await attemptsFor(id);
    expect(attempts.map((a) => a.leadId)).toContain(newcomer.id);
    expect((await campaign(o.client, id)).status).toBe('RUNNING');
    await o.client.post(`/api/v1/campaigns/${id}/stop`).expect(204);
    expect((await campaign(o.client, id)).status).toBe('STOPPED');
  });
});
