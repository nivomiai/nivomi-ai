import { auditLogs, leadExports, leadStatusChanges, suppressionEntries } from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  NOON_IST,
  addLead,
  callingOrg,
  controlClock,
  createCampaign,
  superAdmin,
} from '../support/calling.js';
import { createTestApp, owner, type Browser, type TestApp } from '../support/harness.js';

interface PageBody {
  items: { id: string; fullName: string; status: string }[];
  total: number;
  page: number;
  pageSize: number;
}

interface BulkBody {
  updated: number;
  unchanged: number;
  failed: { leadId: string; reason: string }[];
}

describe('leads table: pages, sorting, bulk actions and export', () => {
  let t: TestApp;
  let admin: Browser;
  let clock: ReturnType<typeof controlClock>;

  beforeAll(async () => {
    t = await createTestApp();
    clock = controlClock(t);
    admin = (await superAdmin(t)).client;
  });

  beforeEach(() => clock.set(NOON_IST));

  afterAll(async () => {
    await t.close();
  });

  const page = async (client: Browser, query: string) =>
    (await client.get(`/api/v1/leads?${query}`).expect(200)).body as PageBody;

  describe('numbered pages', () => {
    it('returns one page, the total, and sorts by the chosen column', async () => {
      const o = await owner(t, 'Pages Co');
      for (const name of ['Chitra', 'Arjun', 'Bina', 'Deepa', 'Esha']) {
        await addLead(o.client, { fullName: name });
      }
      const first = await page(o.client, 'page=1&pageSize=2&sort=name&order=asc');
      expect(first).toMatchObject({ total: 5, page: 1, pageSize: 2 });
      expect(first.items.map((l) => l.fullName)).toEqual(['Arjun', 'Bina']);
      const last = await page(o.client, 'page=3&pageSize=2&sort=name&order=asc');
      expect(last.items.map((l) => l.fullName)).toEqual(['Esha']);
      const desc = await page(o.client, 'page=1&pageSize=1&sort=name&order=desc');
      expect(desc.items[0]?.fullName).toBe('Esha');

      const filtered = await page(o.client, 'page=1&pageSize=10&search=bina');
      expect(filtered.total).toBe(1);
    });

    it('never counts or returns another tenant’s leads', async () => {
      const a = await owner(t, 'Tenant A');
      const b = await owner(t, 'Tenant B');
      await addLead(a.client, { fullName: 'Only In A' });
      const seen = await page(b.client, 'page=1&pageSize=100');
      expect(seen.total).toBe(0);
      expect(seen.items).toEqual([]);
    });

    it('rejects unknown sort columns and oversized pages', async () => {
      const o = await owner(t, 'Bad Query Co');
      await o.client.get('/api/v1/leads?page=1&sort=password').expect(400);
      await o.client.get('/api/v1/leads?page=1&pageSize=500').expect(400);
    });
  });

  describe('bulk status', () => {
    it('changes each lead once, is idempotent per key, and reports per-lead failures', async () => {
      const o = await owner(t, 'Bulk Status Co');
      const other = await owner(t, 'Bulk Other Co');
      const one = await addLead(o.client, { fullName: 'One' });
      const two = await addLead(o.client, { fullName: 'Two' });
      const foreign = await addLead(other.client, { fullName: 'Foreign' });

      const send = () =>
        o.client
          .post('/api/v1/leads/bulk/status')
          .set('Idempotency-Key', 'bulk-key-1')
          .send({ leadIds: [one.id, two.id, foreign.id], status: 'INTERESTED' })
          .expect(200);
      const first = (await send()).body as BulkBody;
      expect(first.updated).toBe(2);
      expect(first.failed).toEqual([{ leadId: foreign.id, reason: 'Lead not found.' }]);

      const replay = (await send()).body as BulkBody;
      expect(replay.updated).toBe(0);
      const changes = await t.db
        .select()
        .from(leadStatusChanges)
        .where(
          and(eq(leadStatusChanges.leadId, one.id), eq(leadStatusChanges.toStatus, 'INTERESTED')),
        );
      expect(changes).toHaveLength(1);

      const foreignLead = await other.client.get(`/api/v1/leads/${foreign.id}`).expect(200);
      expect((foreignLead.body as { status: string }).status).toBe('NEW');
    });
  });

  describe('bulk suppression', () => {
    it('adds each phone once, audits it, and ignores other tenants’ leads', async () => {
      const o = await owner(t, 'Bulk DNC Co');
      const other = await owner(t, 'Bulk DNC Other');
      const lead = await addLead(o.client, { fullName: 'Do Not Call Me' });
      const foreign = await addLead(other.client, { fullName: 'Not Yours' });

      const body = (
        await o.client
          .post('/api/v1/leads/bulk/suppress')
          .send({ leadIds: [lead.id, foreign.id], reason: 'Asked not to be called' })
          .expect(200)
      ).body as BulkBody;
      expect(body.updated).toBe(1);
      expect(body.failed).toEqual([{ leadId: foreign.id, reason: 'Lead not found.' }]);

      const again = (
        await o.client
          .post('/api/v1/leads/bulk/suppress')
          .send({ leadIds: [lead.id] })
          .expect(200)
      ).body as BulkBody;
      expect(again).toMatchObject({ updated: 0, unchanged: 1 });

      const entries = await t.db
        .select()
        .from(suppressionEntries)
        .where(eq(suppressionEntries.phoneE164, foreign.phone));
      expect(entries).toEqual([]);
    });
  });

  describe('add to campaign', () => {
    it('appends leads to a draft list campaign and clears its pre-launch check', async () => {
      const o = await callingOrg(t, admin, 'Add To Campaign Co');
      const first = await addLead(o.client, { fullName: 'First', consentBasis: 'INQUIRY' });
      const second = await addLead(o.client, { fullName: 'Second', consentBasis: 'INQUIRY' });
      const id = await createCampaign(o, { selection: { kind: 'LIST', leadIds: [first.id] } });

      const res = await o.client
        .post(`/api/v1/campaigns/${id}/leads`)
        .send({ leadIds: [first.id, second.id] })
        .expect(200);
      expect(res.body).toEqual({ added: 1, alreadyIncluded: 1 });

      const view = await o.client.get(`/api/v1/campaigns/${id}`).expect(200);
      expect(view.body).toMatchObject({
        selection: { kind: 'LIST', leadIds: [first.id, second.id] },
        prelaunch: null,
      });
    });

    it('refuses filter campaigns and other tenants’ leads', async () => {
      const o = await callingOrg(t, admin, 'Filter Campaign Co');
      const other = await owner(t, 'Campaign Outsider');
      const foreign = await addLead(other.client, { fullName: 'Outsider' });
      const filterId = await createCampaign(o);
      const mine = await addLead(o.client, { fullName: 'Mine' });
      await o.client
        .post(`/api/v1/campaigns/${filterId}/leads`)
        .send({ leadIds: [mine.id] })
        .expect(409);

      const listId = await createCampaign(o, { selection: { kind: 'LIST', leadIds: [mine.id] } });
      await o.client
        .post(`/api/v1/campaigns/${listId}/leads`)
        .send({ leadIds: [foreign.id] })
        .expect(400);
    });
  });

  describe('CSV export', () => {
    it('is built in the background, downloadable by its tenant only, and audited', async () => {
      const o = await owner(t, 'Export Co');
      const other = await owner(t, 'Export Snooper');
      await addLead(o.client, { fullName: '=HYPERLINK("x")' });
      await addLead(o.client, { fullName: 'Plain Name' });

      const requested = await o.client
        .post('/api/v1/leads/exports')
        .send({ filters: {} })
        .expect(201);
      const exportId = (requested.body as { id: string; status: string }).id;
      expect((requested.body as { status: string }).status).toBe('QUEUED');
      await o.client.get(`/api/v1/leads/exports/${exportId}/file`).expect(409);

      await t.worker.drain();
      const ready = await o.client.get(`/api/v1/leads/exports/${exportId}`).expect(200);
      expect(ready.body).toMatchObject({ status: 'COMPLETED', rowCount: 2, downloadable: true });

      await other.client.get(`/api/v1/leads/exports/${exportId}`).expect(404);
      await other.client.get(`/api/v1/leads/exports/${exportId}/file`).expect(404);

      const file = await o.client
        .get(`/api/v1/leads/exports/${exportId}/file`)
        .buffer(true)
        .parse((res, done) => {
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString('utf8')));
          res.on('end', () => done(null, data));
        })
        .expect(200);
      expect(file.headers['content-type']).toContain('text/csv');
      const csv = file.body as string;
      expect(csv).toContain('Name,Phone,Email');
      expect(csv).toContain('Plain Name');
      // Spreadsheet formula injection is neutralised.
      expect(csv).toContain(`"'=HYPERLINK(""x"")"`);

      const [row] = await t.db.select().from(leadExports).where(eq(leadExports.id, exportId));
      const audits = await t.db
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(and(eq(auditLogs.resourceType, 'lead_export'), eq(auditLogs.resourceId, exportId)));
      expect(audits.map((a) => a.action).sort()).toEqual([
        'lead.export_downloaded',
        'lead.export_requested',
      ]);
      expect(row?.organizationId).toBe(o.organizationId);
    });

    it('exports only the ticked leads when ids are given', async () => {
      const o = await owner(t, 'Export Ids Co');
      const keep = await addLead(o.client, { fullName: 'Keep Me' });
      await addLead(o.client, { fullName: 'Leave Me' });
      const requested = await o.client
        .post('/api/v1/leads/exports')
        .send({ leadIds: [keep.id] })
        .expect(201);
      await t.worker.drain();
      const id = (requested.body as { id: string }).id;
      const view = await o.client.get(`/api/v1/leads/exports/${id}`).expect(200);
      expect((view.body as { rowCount: number }).rowCount).toBe(1);
    });
  });
});
