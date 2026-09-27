import {
  auditLogs,
  campaignLeads,
  complianceRuleSets,
  eligibilityDecisions,
  jobs,
  telecomConsentEntries,
} from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RuleSetRegistry } from '../../src/compliance/rule-set-registry.js';
import {
  addLead,
  callingOrg,
  campaign,
  controlClock,
  createCampaign,
  DAY,
  prelaunch,
  registryOf,
  runJobs,
  superAdmin,
} from '../support/calling.js';
import { createTestApp, joinAs, owner, type Browser, type TestApp } from '../support/harness.js';

describe('ComplianceEngine, eligibility, telecom identity and consent (Phase 3)', () => {
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

  describe('rule sets (FR-46, ADR-021)', () => {
    it('installs the India rule set v1 as a draft pending legal review, with its sources', async () => {
      const o = await owner(t);
      const res = await o.client.get('/api/v1/compliance/rule-sets').expect(200);
      const [india] = (res.body as { items: Record<string, unknown>[] }).items;
      expect(india).toMatchObject({
        jurisdiction: 'IN',
        version: 1,
        status: 'DRAFT',
        pendingLegalReview: true,
      });
      expect(JSON.stringify(india)).toContain('Regulation_18092026.pdf');
    });

    it('refuses to start when a stored version no longer matches its definition', async () => {
      const [stored] = await t.db.select().from(complianceRuleSets);
      await t.db
        .update(complianceRuleSets)
        .set({ checksum: 'tampered' })
        .where(eq(complianceRuleSets.id, stored!.id));
      await expect(t.app.get(RuleSetRegistry).syncBuiltIns()).rejects.toThrow(/immutable/);
      await t.db
        .update(complianceRuleSets)
        .set({ checksum: stored!.checksum })
        .where(eq(complianceRuleSets.id, stored!.id));
      await t.app.get(RuleSetRegistry).syncBuiltIns();
    });
  });

  describe('telecom identity (FR-9–FR-13)', () => {
    it('moves UNVERIFIED → PENDING_REVIEW → VERIFIED, and an edit un-verifies it', async () => {
      const o = await callingOrg(t, null, 'Identity Co');
      let identity = await o.client.get('/api/v1/telecom-identity').expect(200);
      expect(identity.body).toMatchObject({ status: 'UNVERIFIED', numbers: [{ series: '140' }] });

      await o.client.post('/api/v1/telecom-identity/submit').expect(201);
      // Only a platform Super Admin verifies.
      await o.client
        .post(`/api/v1/platform/organizations/${o.organizationId}/telecom-identity/review`)
        .send({ approve: true })
        .expect(403);
      await admin
        .post(`/api/v1/platform/organizations/${o.organizationId}/telecom-identity/review`)
        .send({ approve: true })
        .expect(201);
      identity = await o.client.get('/api/v1/telecom-identity').expect(200);
      expect(identity.body).toMatchObject({ status: 'VERIFIED', effectiveStatus: 'VERIFIED' });

      await o.client.put('/api/v1/telecom-identity').send({ legalName: 'Renamed Ltd' }).expect(200);
      identity = await o.client.get('/api/v1/telecom-identity').expect(200);
      expect(identity.body).toMatchObject({ status: 'UNVERIFIED' });

      const actions = await t.db
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.organizationId, o.organizationId));
      expect(actions.map((a) => a.action)).toEqual(
        expect.arrayContaining([
          'telecom.identity_updated',
          'telecom.number_added',
          'telecom.identity_submitted',
          'telecom.identity_verified',
        ]),
      );
    });

    it('rejects ordinary numbers and numbers that belong to another organization (FR-11)', async () => {
      const a = await callingOrg(t, null, 'Number Owner');
      const b = await owner(t, 'Number Thief');
      const ordinary = await a.client
        .post('/api/v1/telecom-identity/numbers')
        .send({ phone: '98470 12345', purpose: 'PROMOTIONAL', a2pDeclared: true })
        .expect(400);
      expect(JSON.stringify(ordinary.body)).toContain('140xx');
      await b.client
        .post('/api/v1/telecom-identity/numbers')
        .send({ phone: a.callerNumber, purpose: 'PROMOTIONAL', a2pDeclared: true })
        .expect(409);
    });

    it('refuses submission while details are missing', async () => {
      const o = await owner(t, 'Incomplete Co');
      const res = await o.client.post('/api/v1/telecom-identity/submit').expect(400);
      expect(JSON.stringify(res.body)).toContain('Missing DLT entity ID');
    });

    it('lets MANAGER read but not change it, and hides it from AGENT', async () => {
      const o = await callingOrg(t, null, 'Roles Co');
      const manager = await joinAs(t, o.client, 'MANAGER');
      const agent = await joinAs(t, o.client, 'AGENT');
      await manager.client.get('/api/v1/telecom-identity').expect(200);
      await manager.client.put('/api/v1/telecom-identity').send({ legalName: 'X' }).expect(403);
      await agent.client.get('/api/v1/telecom-identity').expect(403);
    });
  });

  describe('pre-launch check and decision records (FR-36, FR-44–FR-48)', () => {
    it('evaluates every lead, counts blocks by reason and records each decision', async () => {
      const o = await callingOrg(t, admin, 'Checks Co');
      const eligible = await addLead(o.client, {
        fullName: 'Fresh Inquiry',
        consentBasis: 'INQUIRY',
        consentAt: iso(DAY),
      });
      await addLead(o.client, { fullName: 'No Basis' });
      await addLead(o.client, {
        fullName: 'Old Inquiry',
        consentBasis: 'INQUIRY',
        consentAt: iso(9 * DAY),
      });
      await addLead(o.client, { fullName: 'Undated Inquiry', consentBasis: 'INQUIRY' });
      const dnd = await addLead(o.client, {
        fullName: 'On DND',
        consentBasis: 'INQUIRY',
        consentAt: iso(DAY),
      });
      registryOf(t).register(dnd.phone, { registration: 'FULLY_BLOCK', categories: [] });
      const suppressed = await addLead(o.client, {
        fullName: 'Suppressed',
        consentBasis: 'EXISTING_CUSTOMER',
      });
      await o.client.post('/api/v1/suppression').send({ phone: suppressed.phone }).expect(201);
      await addLead(o.client, {
        fullName: 'Converted',
        consentBasis: 'EXISTING_CUSTOMER',
        leadStatus: 'CONVERTED',
      });
      await addLead(o.client, {
        fullName: 'Foreign',
        phone: '+971501234567',
        consentBasis: 'EXISTING_CUSTOMER',
      });

      const id = await createCampaign(o.client, o.callerNumberId);
      const view = await prelaunch(t, o.client, id);
      expect(view.prelaunch).toMatchObject({
        status: 'COMPLETED',
        total: 8,
        eligible: 1,
        review: 2,
        blocked: 5,
        ruleSetVersion: 1,
        stale: false,
      });
      expect(view.prelaunch?.byReason).toMatchObject({
        NO_CONSENT_BASIS: 1,
        CONSENT_EXPIRED: 1,
        CONSENT_EVIDENCE_INCOMPLETE: 1,
        DND_REGISTERED: 1,
        SUPPRESSED: 1,
        LEAD_STATUS_EXCLUDED: 1,
        UNKNOWN_JURISDICTION: 1,
      });

      const decisions = await t.db
        .select()
        .from(eligibilityDecisions)
        .where(eq(eligibilityDecisions.campaignId, id));
      expect(decisions).toHaveLength(8);
      const fresh = decisions.find((d) => d.leadId === eligible.id);
      expect(fresh).toMatchObject({
        result: 'ELIGIBLE',
        purpose: 'PRE_LAUNCH',
        ruleSetVersion: 1,
        jurisdiction: 'IN',
      });
      // The snapshot never holds the recipient's full number.
      expect(JSON.stringify(fresh?.inputs)).not.toContain(eligible.phone);
      expect(JSON.stringify(fresh?.inputs)).toContain(`••••${eligible.phone.slice(-4)}`);

      // Decisions are on the lead timeline (FR-48).
      const lead = await o.client.get(`/api/v1/leads/${eligible.id}`).expect(200);
      expect(
        (lead.body as { timeline: { type: string; result?: string }[] }).timeline,
      ).toContainEqual(expect.objectContaining({ type: 'eligibility', result: 'ELIGIBLE' }));
    });

    it('blocks every call until the telecom identity is verified, so launch is refused', async () => {
      const o = await callingOrg(t, null, 'Unverified Co');
      await addLead(o.client, { fullName: 'Ready', consentBasis: 'INQUIRY', consentAt: iso(DAY) });
      const id = await createCampaign(o.client, o.callerNumberId);
      const view = await prelaunch(t, o.client, id);
      expect(view.prelaunch).toMatchObject({ eligible: 0, blocked: 1 });
      expect(view.prelaunch?.byReason).toMatchObject({ TELECOM_IDENTITY_NOT_VERIFIED: 1 });
      const refused = await o.client.post(`/api/v1/campaigns/${id}/launch`).expect(409);
      expect(JSON.stringify(refused.body)).toContain('cannot start');
    });

    it('defers every lead while the preference registry is down (fail closed)', async () => {
      const o = await callingOrg(t, admin, 'Registry Down Co');
      await addLead(o.client, { fullName: 'Ready', consentBasis: 'INQUIRY', consentAt: iso(DAY) });
      const id = await createCampaign(o.client, o.callerNumberId);
      registryOf(t).outage = true;
      try {
        const view = await prelaunch(t, o.client, id);
        expect(view.prelaunch).toMatchObject({ eligible: 0, deferred: 1 });
        expect(view.prelaunch?.byReason).toMatchObject({ PREFERENCE_REGISTRY_UNAVAILABLE: 1 });
      } finally {
        registryOf(t).outage = false;
      }
    });

    it('rejects a campaign window wider than the rule allows, and requires a newer check after edits', async () => {
      const o = await callingOrg(t, admin, 'Window Co');
      const wide = await o.client
        .post('/api/v1/campaigns')
        .send({
          name: 'Too early',
          callCategory: 'PROMOTIONAL',
          callerNumberId: o.callerNumberId,
          selection: { kind: 'FILTER' },
          windowStart: '08:00',
          windowEnd: '21:00',
          budgetMinutes: 10,
        })
        .expect(400);
      expect(JSON.stringify(wide.body)).toContain('10:00 and 21:00');

      await addLead(o.client, { fullName: 'Ready', consentBasis: 'INQUIRY', consentAt: iso(DAY) });
      const id = await createCampaign(o.client, o.callerNumberId);
      await prelaunch(t, o.client, id);
      await o.client
        .put(`/api/v1/campaigns/${id}`)
        .send({
          name: 'Edited',
          callCategory: 'PROMOTIONAL',
          callerNumberId: o.callerNumberId,
          selection: { kind: 'FILTER' },
          budgetMinutes: 20,
        })
        .expect(204);
      await o.client.post(`/api/v1/campaigns/${id}/launch`).expect(409);
    });
  });

  describe('consent ledgers (FR-52)', () => {
    it('records ingestion consent in the telecom ledger and revokes each ledger independently', async () => {
      const o = await callingOrg(t, admin, 'Ledger Co');
      const lead = await addLead(o.client, {
        fullName: 'Ledger Lead',
        consentBasis: 'INQUIRY',
        consentAt: iso(DAY),
      });
      let ledgers = await o.client.get(`/api/v1/leads/${lead.id}/consents`).expect(200);
      expect(ledgers.body).toMatchObject({
        telecom: [{ kind: 'GRANT', basis: 'INQUIRY', source: 'MANUAL', currentNumber: true }],
        dpdp: [],
      });

      // DPDP revocation does not touch telecom consent, but blocks the call.
      await o.client
        .post(`/api/v1/leads/${lead.id}/consents`)
        .send({ ledger: 'DPDP', kind: 'REVOCATION', purpose: 'Sales follow-up calls' })
        .expect(201);
      const id = await createCampaign(o.client, o.callerNumberId);
      let view = await prelaunch(t, o.client, id);
      expect(view.prelaunch?.byReason).toEqual({ DPDP_CONSENT_REVOKED: 1 });

      // A telecom revocation clears the lead's consent projection.
      await o.client
        .post(`/api/v1/leads/${lead.id}/consents`)
        .set('Idempotency-Key', 'revoke-1')
        .send({ ledger: 'TELECOM', kind: 'REVOCATION', note: 'Asked by phone' })
        .expect(201);
      const replay = await o.client
        .post(`/api/v1/leads/${lead.id}/consents`)
        .set('Idempotency-Key', 'revoke-1')
        .send({ ledger: 'TELECOM', kind: 'REVOCATION' })
        .expect(201);
      expect(replay.body).toEqual({ created: false });
      const detail = await o.client.get(`/api/v1/leads/${lead.id}`).expect(200);
      expect(detail.body).toMatchObject({ consentBasis: null });

      // A new grant within 90 days is blocked unless the person opted back in (CR-7).
      await o.client
        .post(`/api/v1/leads/${lead.id}/consents`)
        .send({ ledger: 'TELECOM', kind: 'GRANT', basis: 'INQUIRY', evidenceAt: iso(0) })
        .expect(201);
      await o.client
        .post(`/api/v1/leads/${lead.id}/consents`)
        .send({ ledger: 'DPDP', kind: 'GRANT', purpose: 'Sales follow-up calls' })
        .expect(201);
      view = await prelaunch(t, o.client, id);
      expect(view.prelaunch?.byReason).toEqual({ RECONSENT_BLOCK_ACTIVE: 1 });

      ledgers = await o.client.get(`/api/v1/leads/${lead.id}/consents`).expect(200);
      expect((ledgers.body as { telecom: unknown[]; dpdp: unknown[] }).telecom).toHaveLength(3);
    });

    it('keeps ledgers and decisions append-only in the database', async () => {
      const [entry] = await t.db.select().from(telecomConsentEntries).limit(1);
      await expect(
        t.db
          .update(telecomConsentEntries)
          .set({ note: 'edited' })
          .where(eq(telecomConsentEntries.id, entry!.id)),
      ).rejects.toThrow();
      const [decision] = await t.db.select().from(eligibilityDecisions).limit(1);
      await expect(
        t.db
          .update(eligibilityDecisions)
          .set({ result: 'ELIGIBLE' })
          .where(eq(eligibilityDecisions.id, decision!.id)),
      ).rejects.toThrow();
    });
  });

  describe('REQUIRES_REVIEW queue (FR-50)', () => {
    it('queues ambiguous consent at dial time and lets OWNER/ADMIN resolve it', async () => {
      const o = await callingOrg(t, admin, 'Review Co');
      const manager = await joinAs(t, o.client, 'MANAGER');
      const undated = await addLead(o.client, { fullName: 'Undated', consentBasis: 'INQUIRY' });
      const excluded = await addLead(o.client, {
        fullName: 'To Exclude',
        consentBasis: 'APPLICATION',
      });
      await addLead(o.client, { fullName: 'Ready', consentBasis: 'INQUIRY', consentAt: iso(DAY) });
      const id = await createCampaign(o.client, o.callerNumberId);
      await prelaunch(t, o.client, id);
      await o.client.post(`/api/v1/campaigns/${id}/launch`).expect(204);
      await runJobs(t, 4);

      await manager.client.get('/api/v1/compliance/reviews').expect(403);
      const queue = await o.client.get('/api/v1/compliance/reviews').expect(200);
      const items = (
        queue.body as { items: { id: string; leadId: string; reasons: { code: string }[] }[] }
      ).items;
      expect(items).toHaveLength(2);
      expect(items[0]?.reasons.map((r) => r.code)).toEqual(['CONSENT_EVIDENCE_INCOMPLETE']);

      const byLead = (leadId: string) => items.find((i) => i.leadId === leadId)!;
      await manager.client
        .post(`/api/v1/compliance/reviews/${byLead(undated.id).id}/resolve`)
        .send({ action: 'EXCLUDE' })
        .expect(403);
      await o.client
        .post(`/api/v1/compliance/reviews/${byLead(excluded.id).id}/resolve`)
        .send({ action: 'EXCLUDE', note: 'No application on file' })
        .expect(204);
      await o.client
        .post(`/api/v1/compliance/reviews/${byLead(undated.id).id}/resolve`)
        .send({ action: 'RECORD_CONSENT_DATE', consentAt: iso(2 * DAY) })
        .expect(204);
      await o.client
        .post(`/api/v1/compliance/reviews/${byLead(undated.id).id}/resolve`)
        .send({ action: 'EXCLUDE' })
        .expect(409);

      await runJobs(t, 4);
      const states = await t.db
        .select({ leadId: campaignLeads.leadId, state: campaignLeads.state })
        .from(campaignLeads)
        .where(eq(campaignLeads.campaignId, id));
      const stateOf = (leadId: string) => states.find((s) => s.leadId === leadId)?.state;
      expect(stateOf(excluded.id)).toBe('EXCLUDED');
      // The resolved lead was evaluated again and called.
      expect(['IN_CALL', 'DONE', 'WAITING']).toContain(stateOf(undated.id));
    });
  });

  describe('complaint breaker (FR-49, FR-13)', () => {
    it('trips at two complaints, pauses the number and campaigns, and needs ADMIN + Super Admin to clear', async () => {
      const o = await callingOrg(t, admin, 'Breaker Co');
      const manager = await joinAs(t, o.client, 'MANAGER');
      await addLead(o.client, { fullName: 'Ready', consentBasis: 'EXISTING_CUSTOMER' });
      const id = await createCampaign(o.client, o.callerNumberId, { callCategory: 'PROMOTIONAL' });
      await prelaunch(t, o.client, id);
      await o.client.post(`/api/v1/campaigns/${id}/launch`).expect(204);

      await manager.client
        .post('/api/v1/compliance/complaints')
        .send({ kind: 'COMPLAINT' })
        .expect(403);
      const first = await o.client
        .post('/api/v1/compliance/complaints')
        .send({ kind: 'COMPLAINT', reference: 'TRAI-1' })
        .expect(201);
      expect(first.body).toMatchObject({ breakerTripped: false });
      const second = await o.client
        .post('/api/v1/compliance/complaints')
        .send({ kind: 'COMPLAINT', callerNumberId: o.callerNumberId, reference: 'TRAI-2' })
        .expect(201);
      expect(second.body).toMatchObject({ breakerTripped: true });

      await runJobs(t, 2);
      expect(await campaign(o.client, id)).toMatchObject({
        status: 'PAUSED',
        pauseReason: 'COMPLAINT_BREAKER',
      });
      const identity = await o.client.get('/api/v1/telecom-identity').expect(200);
      expect(identity.body).toMatchObject({ numbers: [{ status: 'PAUSED' }] });
      await o.client.post(`/api/v1/campaigns/${id}/resume`).expect(409);

      await admin
        .post(`/api/v1/platform/organizations/${o.organizationId}/complaint-breaker/clear`)
        .expect(409); // not acknowledged yet
      await o.client.post('/api/v1/compliance/breaker/acknowledge').send({}).expect(204);
      await o.client
        .post(`/api/v1/platform/organizations/${o.organizationId}/complaint-breaker/clear`)
        .expect(403);
      await admin
        .post(`/api/v1/platform/organizations/${o.organizationId}/complaint-breaker/clear`)
        .expect(204);
      const controls = await o.client.get('/api/v1/compliance/controls').expect(200);
      expect(controls.body).toMatchObject({ breaker: { tripped: false } });
    });
  });

  describe('tenant isolation', () => {
    it('never exposes or accepts another organization’s campaigns, leads, numbers or reviews', async () => {
      const a = await callingOrg(t, admin, 'Tenant A');
      const b = await callingOrg(t, admin, 'Tenant B');
      const leadA = await addLead(a.client, {
        fullName: 'A Lead',
        consentBasis: 'INQUIRY',
        consentAt: iso(DAY),
      });
      await addLead(b.client, { fullName: 'B Lead', consentBasis: 'INQUIRY', consentAt: iso(DAY) });
      const campaignA = await createCampaign(a.client, a.callerNumberId);

      await b.client.get(`/api/v1/campaigns/${campaignA}`).expect(404);
      await b.client.post(`/api/v1/campaigns/${campaignA}/prelaunch-check`).expect(404);
      await b.client.post(`/api/v1/campaigns/${campaignA}/launch`).expect(404);
      await b.client.get(`/api/v1/campaigns/${campaignA}/attempts`).expect(404);
      await b.client.get(`/api/v1/leads/${leadA.id}/consents`).expect(404);
      // B cannot use A's caller number or A's leads in its own campaign.
      await b.client
        .post('/api/v1/campaigns')
        .send({
          name: 'Stolen',
          callCategory: 'PROMOTIONAL',
          callerNumberId: a.callerNumberId,
          selection: { kind: 'FILTER' },
          budgetMinutes: 10,
        })
        .expect(400);
      await b.client
        .post('/api/v1/campaigns')
        .send({
          name: 'Stolen leads',
          callCategory: 'PROMOTIONAL',
          callerNumberId: b.callerNumberId,
          selection: { kind: 'LIST', leadIds: [leadA.id] },
          budgetMinutes: 10,
        })
        .expect(400);

      // A's check only ever touches A's leads; queue payloads carry ids, never tenant data.
      await prelaunch(t, a.client, campaignA);
      const enrolled = await t.db
        .select({ organizationId: campaignLeads.organizationId })
        .from(campaignLeads)
        .where(eq(campaignLeads.campaignId, campaignA));
      expect(enrolled.length).toBeGreaterThan(0);
      expect(new Set(enrolled.map((e) => e.organizationId))).toEqual(new Set([a.organizationId]));
      const queued = await t.db
        .select({ payload: jobs.payload, organizationId: jobs.organizationId })
        .from(jobs)
        .where(and(eq(jobs.type, 'campaign.prelaunch'), eq(jobs.organizationId, a.organizationId)));
      expect(queued.length).toBeGreaterThan(0);
      for (const job of queued) {
        expect(Object.keys(job.payload).sort()).toEqual(['campaignId', 'checkId']);
      }
      const reviewsB = await b.client.get('/api/v1/compliance/reviews').expect(200);
      expect((reviewsB.body as { items: unknown[] }).items).toEqual([]);
    });

    it('scopes campaign permissions by role (PRD §8.1)', async () => {
      const o = await callingOrg(t, admin, 'Perms Co');
      const analyst = await joinAs(t, o.client, 'ANALYST');
      const agent = await joinAs(t, o.client, 'AGENT');
      const id = await createCampaign(o.client, o.callerNumberId);
      await analyst.client.get(`/api/v1/campaigns/${id}`).expect(200);
      await analyst.client.post(`/api/v1/campaigns/${id}/prelaunch-check`).expect(403);
      await analyst.client.post('/api/v1/campaigns/emergency-stop').send({}).expect(403);
      await agent.client.get('/api/v1/campaigns').expect(403);
      await agent.client.post(`/api/v1/campaigns/${id}/cancel`).expect(403);
    });
  });
});
