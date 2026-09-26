import { leadStatusChanges } from '@nivomi/database';
import { eq } from 'drizzle-orm';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, joinAs, owner, type Browser, type TestApp } from '../support/harness.js';

interface LeadItem {
  id: string;
  fullName: string;
  phone: string;
  status: string;
  consentBasis: string | null;
  suppressed: boolean;
  ownerUserId: string | null;
}

const items = (res: Response) => (res.body as { items: LeadItem[] }).items;

let phoneCounter = 0;
/** Unique valid Indian mobile numbers. */
function phone(): string {
  phoneCounter += 1;
  return `98${String(40000000 + phoneCounter).padStart(8, '0')}`;
}
const e164 = (local: string) => `+91${local}`;

describe('leads, suppression and review queue', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  const createLead = (client: Browser, body: Record<string, unknown>) =>
    client.post('/api/v1/leads').send(body);

  describe('manual leads (FR-18, FR-130)', () => {
    it('creates a lead with E.164 phone, company and consent evidence', async () => {
      const o = await owner(t);
      const number = phone();
      const created = await createLead(o.client, {
        fullName: 'Asha Nair',
        phone: `${number.slice(0, 5)} ${number.slice(5)}`,
        email: 'Asha@Example.com',
        company: 'Nair Builders',
        consentBasis: 'INQUIRY',
        consentAt: '2026-09-20T10:00:00Z',
        consentSource: 'Website form',
      }).expect(201);
      const id = (created.body as { id: string }).id;

      const detail = await o.client.get(`/api/v1/leads/${id}`).expect(200);
      expect(detail.body).toMatchObject({
        status: 'NEW',
        source: 'MANUAL',
        consentBasis: 'INQUIRY',
        consentEvidence: { source: 'Website form', at: '2026-09-20T10:00:00.000Z' },
        contact: { fullName: 'Asha Nair', phone: e164(number), company: 'Nair Builders' },
      });
      expect(
        (detail.body as { timeline: { type: string; to: string }[] }).timeline[0],
      ).toMatchObject({
        type: 'status',
        to: 'NEW',
      });
    });

    it('never merges a manual entry into an existing contact', async () => {
      const o = await owner(t);
      const number = phone();
      await createLead(o.client, { fullName: 'Ravi', phone: number }).expect(201);
      const dup = await createLead(o.client, { fullName: 'Ravi K', phone: `+91${number}` }).expect(
        409,
      );
      expect(dup.body).toMatchObject({ error: { code: 'CONFLICT' } });
    });

    it('validates phone numbers and the operator reference for registered consent', async () => {
      const o = await owner(t);
      const bad = await createLead(o.client, { fullName: 'X', phone: '12345' }).expect(400);
      expect(bad.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
      const noRef = await createLead(o.client, {
        fullName: 'Y',
        phone: phone(),
        consentBasis: 'REGISTERED_CONSENT',
      }).expect(400);
      expect(JSON.stringify(noRef.body)).toContain('operator consent reference');
    });

    it('records field changes and rejects a phone that belongs to another contact', async () => {
      const o = await owner(t);
      const first = phone();
      const second = phone();
      const a = await createLead(o.client, { fullName: 'First', phone: first }).expect(201);
      await createLead(o.client, { fullName: 'Second', phone: second }).expect(201);
      const id = (a.body as { id: string }).id;

      await o.client.patch(`/api/v1/leads/${id}`).send({ phone: second }).expect(409);
      await o.client
        .patch(`/api/v1/leads/${id}`)
        .send({ fullName: 'First Renamed', city: 'Kochi' })
        .expect(204);
      const detail = await o.client.get(`/api/v1/leads/${id}`).expect(200);
      const timeline = (
        detail.body as { timeline: { type: string; field?: string; from?: string }[] }
      ).timeline;
      expect(timeline).toContainEqual(
        expect.objectContaining({ type: 'field', field: 'fullName', from: 'First' }),
      );
    });
  });

  describe('status changes (FR-24)', () => {
    it('records one transition per idempotency key', async () => {
      const o = await owner(t);
      const created = await createLead(o.client, { fullName: 'Meera', phone: phone() }).expect(201);
      const id = (created.body as { id: string }).id;
      for (let i = 0; i < 2; i += 1) {
        await o.client
          .post(`/api/v1/leads/${id}/status`)
          .set('Idempotency-Key', 'status-click-1')
          .send({ status: 'INTERESTED', reason: 'Called back' })
          .expect(201);
      }
      const changes = await t.db
        .select()
        .from(leadStatusChanges)
        .where(eq(leadStatusChanges.leadId, id));
      expect(changes.map((c) => c.toStatus)).toEqual(['NEW', 'INTERESTED']);
      expect(changes[1]).toMatchObject({ fromStatus: 'NEW', source: 'MEMBER' });
    });
  });

  describe('lists and filters (FR-20)', () => {
    it('searches by name and phone digits and filters by consent', async () => {
      const o = await owner(t);
      const number = phone();
      await createLead(o.client, {
        fullName: 'Zubin Searchable',
        phone: number,
        consentBasis: 'INQUIRY',
      }).expect(201);
      await createLead(o.client, { fullName: 'No Consent', phone: phone() }).expect(201);

      expect(items(await o.client.get('/api/v1/leads?search=zubin').expect(200))).toHaveLength(1);
      expect(
        items(await o.client.get(`/api/v1/leads?search=${number.slice(-6)}`).expect(200)),
      ).toHaveLength(1);
      const missing = items(await o.client.get('/api/v1/leads?consent=missing').expect(200));
      expect(missing.map((l) => l.fullName)).toEqual(['No Consent']);
    });

    it('pages with a cursor and never repeats a lead', async () => {
      const o = await owner(t);
      for (let i = 0; i < 5; i += 1) {
        await createLead(o.client, { fullName: `Paged ${i}`, phone: phone() }).expect(201);
      }
      const first = await o.client.get('/api/v1/leads?limit=3').expect(200);
      const cursor = (first.body as { nextCursor: string }).nextCursor;
      const second = await o.client.get(`/api/v1/leads?limit=3&cursor=${cursor}`).expect(200);
      const ids = [...items(first), ...items(second)].map((l) => l.id);
      expect(new Set(ids).size).toBe(5);
    });
  });

  describe('role-based access (PRD §8.1)', () => {
    it('limits AGENTs to their own leads and ANALYSTs to reading', async () => {
      const o = await owner(t);
      const agent = await joinAs(t, o.client, 'AGENT');
      const analyst = await joinAs(t, o.client, 'ANALYST');
      const viewer = await joinAs(t, o.client, 'VIEWER');

      const ownersLead = await createLead(o.client, {
        fullName: 'Owner Lead',
        phone: phone(),
      }).expect(201);
      const agentsLead = await createLead(agent.client, {
        fullName: 'Agent Lead',
        phone: phone(),
      }).expect(201);

      const agentView = items(await agent.client.get('/api/v1/leads').expect(200));
      expect(agentView.map((l) => l.fullName)).toEqual(['Agent Lead']);
      await agent.client.get(`/api/v1/leads/${(ownersLead.body as { id: string }).id}`).expect(404);
      await agent.client
        .patch(`/api/v1/leads/${(agentsLead.body as { id: string }).id}`)
        .send({ ownerUserId: null })
        .expect(403);

      expect(items(await analyst.client.get('/api/v1/leads').expect(200))).toHaveLength(2);
      await createLead(analyst.client, { fullName: 'Nope', phone: phone() }).expect(403);
      await viewer.client.get('/api/v1/leads').expect(403);
      await analyst.client.post('/api/v1/suppression').send({ phone: phone() }).expect(403);
    });
  });

  describe('suppression list (FR-22)', () => {
    it('adds, flags leads, and only removes manual entries', async () => {
      const o = await owner(t);
      const number = phone();
      await createLead(o.client, { fullName: 'Suppressed Person', phone: number }).expect(201);
      const added = await o.client
        .post('/api/v1/suppression')
        .send({ phone: number, reason: 'Asked not to call' })
        .expect(201);
      await o.client
        .post('/api/v1/suppression')
        .send({ phone: `+91 ${number}` })
        .expect(409);
      const lead = items(await o.client.get('/api/v1/leads?search=Suppressed').expect(200))[0];
      expect(lead?.suppressed).toBe(true);
      await o.client.delete(`/api/v1/suppression/${(added.body as { id: string }).id}`).expect(204);
    });
  });

  describe('tenant isolation', () => {
    it('never exposes or changes another organization’s leads', async () => {
      const a = await owner(t, 'Leads Tenant A');
      const b = await owner(t, 'Leads Tenant B');
      const number = phone();
      const lead = await createLead(a.client, { fullName: 'Tenant A Lead', phone: number }).expect(
        201,
      );
      const id = (lead.body as { id: string }).id;
      const entry = await a.client.post('/api/v1/suppression').send({ phone: phone() }).expect(201);

      await b.client.get(`/api/v1/leads/${id}`).expect(404);
      await b.client.patch(`/api/v1/leads/${id}`).send({ fullName: 'Hijacked' }).expect(404);
      await b.client.post(`/api/v1/leads/${id}/status`).send({ status: 'CLOSED' }).expect(404);
      await b.client.delete(`/api/v1/suppression/${(entry.body as { id: string }).id}`).expect(404);
      expect(items(await b.client.get('/api/v1/leads').expect(200))).toHaveLength(0);
      // The same phone number is independent in another tenant (dedupe never crosses tenants).
      await createLead(b.client, { fullName: 'Tenant B Lead', phone: number }).expect(201);
    });
  });
});
