import { contacts, leads, suppressionEntries } from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ALLOWED_ORIGIN,
  createTestApp,
  joinAs,
  owner,
  type Browser,
  type TestApp,
} from '../support/harness.js';
import { xlsx } from '../support/xlsx.js';

interface ImportView {
  id: string;
  status: string;
  headers: string[] | null;
  suggestedMapping: Record<string, string> | null;
  preview: Record<string, number> | null;
  error: string | null;
  counts: {
    total: number;
    processed: number;
    succeeded: number;
    failed: number;
    duplicates: number;
    review: number;
  };
  sampleRows: { rowNumber: number; cells: string[] }[];
}

describe('file import (FR-14, FR-125–FR-128)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  /** Creates the import, uploads through the signed URL and waits for analysis. */
  async function upload(client: Browser, fileName: string, data: Buffer): Promise<ImportView> {
    const created = await client
      .post('/api/v1/imports')
      .send({ fileName, fileSize: data.length })
      .expect(201);
    const { id, upload: target } = created.body as {
      id: string;
      upload: { url: string; method: string };
    };
    expect(target.method).toBe('PUT');
    const path = new URL(target.url).pathname;
    await request(t.server)
      .put(path)
      .set('Content-Type', 'application/octet-stream')
      .send(data)
      .expect(204);
    await client.post(`/api/v1/imports/${id}/uploaded`).expect(200);
    await t.worker.drain();
    return (await client.get(`/api/v1/imports/${id}`).expect(200)).body as ImportView;
  }

  async function mapAndPreview(client: Browser, id: string, body: Record<string, unknown>) {
    await client.put(`/api/v1/imports/${id}/mapping`).send(body).expect(200);
    await t.worker.drain();
    return (await client.get(`/api/v1/imports/${id}`).expect(200)).body as ImportView;
  }

  async function orgLeadCount(organizationId: string): Promise<number> {
    return (
      await t.db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.organizationId, organizationId))
    ).length;
  }

  it('imports a CSV end to end with dedupe, review, suppression and an error report', async () => {
    const o = await owner(t, 'Import Realty');
    // Existing contacts: one that matches cleanly, one that matches with a different name.
    await o.client
      .post('/api/v1/leads')
      .send({ fullName: 'Kiran Menon', phone: '9811111111' })
      .expect(201);
    await o.client
      .post('/api/v1/leads')
      .send({ fullName: 'Deepa Pillai', phone: '9822222222' })
      .expect(201);

    const csv = [
      'Customer Name,Mobile,Email,Enquiry Date,Consent,Car Model',
      'Asha Nair,98765 43210,asha@example.com,2026-09-20,,SUV', // new
      'Kiran Menon,+91 98111 11111,kiran@example.com,,,Sedan', // matches existing → update
      'Someone Else,9822222222,,,,', // same phone, different name → review
      'Bad Number,12345,,,,', // invalid
      'Opted Out,9833333333,,,DND,', // suppressed
      'Asha Duplicate,98765-43210,,,,', // same phone as row 2, compatible? no → review
      '=HYPERLINK("x"),abc,,,,', // invalid + formula injection in report
    ].join('\n');
    const analyzed = await upload(o.client, 'enquiries.csv', Buffer.from(csv));
    expect(analyzed.status).toBe('MAPPING_REQUIRED');
    expect(analyzed.counts.total).toBe(7);
    expect(analyzed.suggestedMapping).toMatchObject({
      'Customer Name': 'fullName',
      Mobile: 'phone',
      Email: 'email',
      'Enquiry Date': 'consentAt',
      Consent: 'consentStatus',
      'Car Model': 'ignore',
    });
    expect(analyzed.sampleRows[0]?.cells[0]).toBe('Asha Nair');

    // Nothing is imported before explicit confirmation.
    const before = await orgLeadCount(o.organizationId);

    const mapping = { ...analyzed.suggestedMapping, 'Car Model': 'custom:Car model' };
    const unattested = await o.client
      .put(`/api/v1/imports/${analyzed.id}/mapping`)
      .send({ mapping, consentDefault: { basis: 'INQUIRY', attested: false } })
      .expect(400);
    expect(JSON.stringify(unattested.body)).toContain('Confirm that you hold');

    const ready = await mapAndPreview(o.client, analyzed.id, {
      mapping,
      consentDefault: { basis: 'INQUIRY', source: 'Website enquiries', attested: true },
    });
    expect(ready.status).toBe('READY');
    expect(ready.preview).toMatchObject({
      total: 7,
      valid: 5,
      invalid: 2,
      matchesExisting: 2,
      duplicatesInFile: 1,
      suppressed: 1,
      noConsentBasis: 0,
    });
    expect(await orgLeadCount(o.organizationId)).toBe(before);

    await o.client.post(`/api/v1/imports/${analyzed.id}/confirm`).expect(200);
    await o.client.post(`/api/v1/imports/${analyzed.id}/confirm`).expect(409);
    await t.worker.drain();
    const done = (await o.client.get(`/api/v1/imports/${analyzed.id}`).expect(200))
      .body as ImportView;
    expect(done.status).toBe('COMPLETED');
    expect(done.counts).toMatchObject({ total: 7, processed: 7, failed: 2, review: 2 });
    expect(done.counts.succeeded).toBe(3);

    // New lead carries the batch consent attestation and the custom field.
    const [asha] = await t.db
      .select({ contact: contacts, lead: leads })
      .from(contacts)
      .innerJoin(leads, eq(leads.contactId, contacts.id))
      .where(
        and(eq(contacts.organizationId, o.organizationId), eq(contacts.phoneE164, '+919876543210')),
      );
    expect(asha?.lead).toMatchObject({ source: 'FILE_IMPORT', consentBasis: 'INQUIRY' });
    expect(asha?.lead.consentEvidence).toMatchObject({ source: 'Website enquiries' });
    expect(asha?.contact.customFields).toEqual({ 'Car model': 'SUV' });

    // The matched contact was filled in, not duplicated.
    const kiran = await t.db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.organizationId, o.organizationId), eq(contacts.phoneE164, '+919811111111')),
      );
    expect(kiran).toHaveLength(1);
    expect(kiran[0]?.email).toBe('kiran@example.com');

    const suppressed = await t.db
      .select()
      .from(suppressionEntries)
      .where(eq(suppressionEntries.organizationId, o.organizationId));
    expect(suppressed.map((s) => s.phoneE164)).toContain('+919833333333');

    // Error report: failed and review rows with reasons; formulas neutralised.
    const report = await o.client.get(`/api/v1/imports/${analyzed.id}/error-report`).expect(200);
    expect(report.headers['content-type']).toContain('text/csv');
    expect(report.text).toContain('is not a valid phone number');
    expect(report.text).toContain('REVIEW');
    expect(report.text).toContain(`"'=HYPERLINK(""x"")"`);

    // Review queue: resolve one by merging, one by creating a new contact.
    const reviews = await o.client.get('/api/v1/ingestion/reviews').expect(200);
    const reviewItems = (reviews.body as { items: { id: string; candidates: { id: string }[] }[] })
      .items;
    expect(reviewItems).toHaveLength(2);
    const [first, second] = reviewItems;
    await o.client
      .post(`/api/v1/ingestion/reviews/${first?.id ?? ''}/resolve`)
      .send({ action: 'MERGE', contactId: first?.candidates[0]?.id })
      .expect(201);
    await o.client
      .post(`/api/v1/ingestion/reviews/${second?.id ?? ''}/resolve`)
      .send({ action: 'DISCARD' })
      .expect(201);
    await o.client
      .post(`/api/v1/ingestion/reviews/${second?.id ?? ''}/resolve`)
      .send({ action: 'DISCARD' })
      .expect(409);
  });

  it('imports .xlsx files, keeping numeric phone cells intact', async () => {
    const o = await owner(t, 'Excel Motors');
    const analyzed = await upload(
      o.client,
      'leads.xlsx',
      xlsx([
        ['Name', 'Phone'],
        ['Excel One', 919844444444],
        ['Excel Two', '9855555555'],
      ]),
    );
    expect(analyzed.status).toBe('MAPPING_REQUIRED');
    await mapAndPreview(o.client, analyzed.id, { mapping: { Name: 'fullName', Phone: 'phone' } });
    await o.client.post(`/api/v1/imports/${analyzed.id}/confirm`).expect(200);
    await t.worker.drain();
    const done = (await o.client.get(`/api/v1/imports/${analyzed.id}`).expect(200))
      .body as ImportView;
    expect(done.counts).toMatchObject({ succeeded: 2, failed: 0 });
    // No consent column and no batch attestation: imported but never callable (FR-16).
    const rows = await t.db.select().from(leads).where(eq(leads.organizationId, o.organizationId));
    expect(rows.every((l) => l.consentBasis === null)).toBe(true);
  });

  it('processes large files in resumable chunks', async () => {
    const o = await owner(t, 'Bulk Leads');
    const lines = ['Name,Phone'];
    for (let i = 0; i < 1_100; i += 1)
      lines.push(`Bulk ${i},97${String(10000000 + i).padStart(8, '0')}`);
    const analyzed = await upload(o.client, 'bulk.csv', Buffer.from(lines.join('\n')));
    await mapAndPreview(o.client, analyzed.id, { mapping: { Name: 'fullName', Phone: 'phone' } });
    await o.client.post(`/api/v1/imports/${analyzed.id}/confirm`).expect(200);
    await t.worker.drain();
    const done = (await o.client.get(`/api/v1/imports/${analyzed.id}`).expect(200))
      .body as ImportView;
    expect(done).toMatchObject({
      status: 'COMPLETED',
      counts: { processed: 1_100, succeeded: 1_100 },
    });
    expect(await orgLeadCount(o.organizationId)).toBe(1_100);
  }, 120_000);

  it('rejects unreadable files with a clear reason and refuses bad upload links', async () => {
    const o = await owner(t, 'Broken Files');
    const broken = await upload(o.client, 'broken.xlsx', Buffer.from('not really excel'));
    expect(broken).toMatchObject({ status: 'FAILED', error: 'This is not a valid .xlsx file.' });

    await o.client
      .post('/api/v1/imports')
      .send({ fileName: 'leads.exe', fileSize: 10 })
      .expect(400);
    await o.client
      .post('/api/v1/imports')
      .send({ fileName: 'big.csv', fileSize: 30_000_000 })
      .expect(400);
    const forged = await request(t.server)
      .put('/api/v1/uploads/eyJrZXkiOiJpbXBvcnRzL3gifQ.forged')
      .set('Origin', ALLOWED_ORIGIN)
      .send(Buffer.from('a,b'))
      .expect(403);
    expect(forged.body).toMatchObject({ error: { code: 'AUTHORIZATION_ERROR' } });
  });

  it('is limited to MANAGER and above and isolated per tenant', async () => {
    const a = await owner(t, 'Import Tenant A');
    const b = await owner(t, 'Import Tenant B');
    const agent = await joinAs(t, a.client, 'AGENT');
    await agent.client.get('/api/v1/imports').expect(403);
    await agent.client.post('/api/v1/imports').send({ fileName: 'x.csv', fileSize: 5 }).expect(403);

    const analyzed = await upload(
      a.client,
      'private.csv',
      Buffer.from('Name,Phone\nA,9866666666\n'),
    );
    await b.client.get(`/api/v1/imports/${analyzed.id}`).expect(404);
    await b.client.get(`/api/v1/imports/${analyzed.id}/error-report`).expect(404);
    await b.client.post(`/api/v1/imports/${analyzed.id}/confirm`).expect(404);
    const listed = await b.client.get('/api/v1/imports').expect(200);
    expect((listed.body as { items: unknown[] }).items).toHaveLength(0);
  });
});
