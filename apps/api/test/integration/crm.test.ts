import {
  contacts,
  crmConnections,
  crmSyncRuns,
  jobs,
  leads,
  recordHistory,
} from '@nivomi/database';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeHubSpot } from '../support/fake-hubspot.js';
import {
  ALLOWED_ORIGIN,
  browser,
  createTestApp,
  joinAs,
  owner,
  type Browser,
  type TestApp,
} from '../support/harness.js';

interface CrmStatus {
  available: boolean;
  connection: {
    status: string;
    accountId: string;
    leadsEnabled: boolean;
    lastSyncAt: string | null;
  } | null;
  runs: { status: string; trigger: string; mode: string; counts: Record<string, number> }[];
}

describe('HubSpot connection and ingestion (FR-19, FR-84–FR-86, FR-137)', () => {
  let t: TestApp;
  const hubspot = new FakeHubSpot();

  beforeAll(async () => {
    await hubspot.start();
    t = await createTestApp({
      HUBSPOT_CLIENT_ID: 'test-client',
      HUBSPOT_CLIENT_SECRET: 'test-secret',
      HUBSPOT_AUTHORIZE_URL: `${hubspot.url}/oauth/authorize`,
      HUBSPOT_OAUTH_API_URL: hubspot.url,
      HUBSPOT_CRM_API_URL: hubspot.url,
    });
  });

  afterAll(async () => {
    await t.close();
    await hubspot.stop();
  });

  let hub = 1000;
  /** Registers a fake HubSpot account and returns the OAuth code that connects it. */
  function account(
    contactsList: Parameters<FakeHubSpot['addAccount']>[1]['contacts'],
    extra: Partial<Parameters<FakeHubSpot['addAccount']>[1]> = {},
  ) {
    hub += 1;
    const code = `code-${hub}`;
    hubspot.addAccount(code, {
      hubId: hub,
      contacts: contactsList,
      companies: {},
      leads: [],
      ...extra,
    });
    return { code, hubId: hub };
  }

  /** Runs the OAuth dance through the API as the browser would; returns the redirect target. */
  async function connect(client: Browser, code: string, confirmAccountChange = false) {
    const started = await client
      .post('/api/v1/integrations/crm/hubspot/authorize')
      .send({ confirmAccountChange })
      .expect(200);
    const authorizeUrl = new URL((started.body as { authorizeUrl: string }).authorizeUrl);
    const state = authorizeUrl.searchParams.get('state') ?? '';
    const callback = await client
      .get('/api/v1/integrations/crm/hubspot/callback')
      .query({ code, state })
      .expect(303);
    return { location: callback.headers.location ?? '', authorizeUrl, state };
  }

  async function status(client: Browser): Promise<CrmStatus> {
    return (await client.get('/api/v1/integrations/crm').expect(200)).body as CrmStatus;
  }

  async function makeDueAndDrain() {
    await t.db
      .update(jobs)
      .set({ runAt: sql`now() - interval '1 second'` })
      .where(eq(jobs.status, 'RETRYING'));
    await t.worker.drain();
  }

  it('connects through OAuth, encrypts tokens and ingests contacts and HubSpot leads', async () => {
    const o = await owner(t, 'CRM Realty');
    // A lead that already exists in Nivomi is matched, not duplicated.
    await o.client
      .post('/api/v1/leads')
      .send({ fullName: 'Existing Person', phone: '9811100001' })
      .expect(201);

    const { code, hubId } = account(
      [
        {
          id: '101',
          properties: {
            firstname: 'Existing',
            lastname: 'Person',
            phone: '+91 98111 00001',
            email: 'ex@example.com',
          },
        },
        {
          id: '102',
          properties: {
            firstname: 'Nisha',
            lastname: 'Rao',
            mobilephone: '9811100002',
            lifecycle: 'lead',
          },
          companyIds: ['c1'],
        },
        {
          id: '103',
          properties: { firstname: 'No', lastname: 'Phone', email: 'nophone@example.com' },
        },
      ],
      {
        companies: { c1: { name: 'Rao Estates', domain: 'rao.example' } },
        leads: [{ id: 'L1', name: 'Nisha Rao - Villa', label: 'Hot', contactIds: ['102'] }],
      },
    );

    expect((await status(o.client)).available).toBe(true);
    const { location, authorizeUrl } = await connect(o.client, code);
    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(`${hubspot.url}/oauth/authorize`);
    expect(authorizeUrl.searchParams.get('client_id')).toBe('test-client');
    expect(authorizeUrl.searchParams.get('scope')).toBe(
      'crm.objects.contacts.read crm.objects.companies.read',
    );
    expect(authorizeUrl.searchParams.get('optional_scope')).toBe('crm.objects.leads.read');
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      `${ALLOWED_ORIGIN}/api/v1/integrations/crm/hubspot/callback`,
    );
    expect(location).toBe(`${ALLOWED_ORIGIN}/app/data-sources?crm=connected`);

    // Tokens are stored encrypted and never returned.
    const [row] = await t.db
      .select()
      .from(crmConnections)
      .where(eq(crmConnections.organizationId, o.organizationId));
    expect(row?.externalAccountId).toBe(String(hubId));
    expect(row?.refreshTokenEncrypted).toMatch(/^v1\./);
    expect(row?.refreshTokenEncrypted).not.toContain('rt-');
    const view = await o.client.get('/api/v1/integrations/crm').expect(200);
    expect(JSON.stringify(view.body)).not.toMatch(/at-|rt-|Encrypted/);

    await t.worker.drain();
    const after = await status(o.client);
    expect(after.connection).toMatchObject({ status: 'CONNECTED', leadsEnabled: true });
    expect(after.runs[0]).toMatchObject({
      status: 'COMPLETED',
      trigger: 'INITIAL',
      mode: 'FULL',
      counts: { created: 1, updated: 2, skipped: 1 },
    });

    const orgLeads = await t.db
      .select({ lead: leads, contact: contacts })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(eq(leads.organizationId, o.organizationId));
    expect(orgLeads).toHaveLength(2); // matched existing + Nisha; no-phone contact skipped
    const nisha = orgLeads.find((l) => l.contact.phoneE164 === '+919811100002');
    expect(nisha?.lead).toMatchObject({ source: 'HUBSPOT', consentBasis: null });
    expect(nisha?.lead.crmDetails).toMatchObject({
      hubspotLeadName: 'Nisha Rao - Villa',
      hubspotLeadLabel: 'Hot',
    });

    const detail = await o.client.get(`/api/v1/leads/${nisha?.lead.id ?? ''}`).expect(200);
    expect(detail.body).toMatchObject({ contact: { company: 'Rao Estates' } });
    expect(
      (detail.body as { sources: { provider: string; objectType: string }[] }).sources,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: 'HUBSPOT', objectType: 'contact' }),
        expect.objectContaining({ provider: 'HUBSPOT', objectType: 'lead' }),
      ]),
    );

    // A second sync is incremental and applies CRM-owned changes with history (FR-138).
    const account102 = [...hubspot.accounts.values()].find((a) => a.hubId === hubId)?.contacts[1];
    if (account102) {
      account102.properties = {
        ...account102.properties,
        lastname: 'Rao-Kumar',
        hs_lastmodifieddate: new Date(Date.now() + 60_000).toISOString(),
      };
    }
    await o.client.post('/api/v1/integrations/crm/sync').send({}).expect(201);
    await o.client.post('/api/v1/integrations/crm/sync').send({}).expect(409);
    await t.worker.drain();
    const second = await status(o.client);
    expect(second.runs[0]).toMatchObject({
      status: 'COMPLETED',
      trigger: 'MANUAL',
      mode: 'INCREMENTAL',
    });
    const history = await t.db
      .select()
      .from(recordHistory)
      .where(
        and(
          eq(recordHistory.organizationId, o.organizationId),
          eq(recordHistory.field, 'lastName'),
        ),
      );
    expect(history[0]).toMatchObject({ oldValue: 'Rao', newValue: 'Rao-Kumar', source: 'HUBSPOT' });
    expect(hubspot.requests).toContain('POST /crm/objects/2026-09/contacts/search');

    // The next scheduled sync is queued 15 minutes out.
    const scheduled = await t.db.select().from(jobs).where(eq(jobs.type, 'crm.schedule'));
    expect(scheduled.length).toBeGreaterThan(0);
  });

  it('maps a HubSpot property to the Consent Basis only when configured', async () => {
    const o = await owner(t, 'Consent Mapping');
    const { code } = account([
      {
        id: '201',
        properties: { firstname: 'Opted', phone: '9822200001', nivomi_consent: 'Website enquiry' },
      },
      {
        id: '202',
        properties: { firstname: 'Blocked', phone: '9822200002', nivomi_consent: 'Do not call' },
      },
    ]);
    await connect(o.client, code);
    await t.worker.drain();
    await o.client
      .put('/api/v1/integrations/crm/settings')
      .send({
        consentProperty: 'nivomi_consent',
        consentValueMap: { 'Website enquiry': 'INQUIRY', 'Do not call': 'DND' },
      })
      .expect(204);
    await o.client.post('/api/v1/integrations/crm/sync').send({ full: true }).expect(201);
    await t.worker.drain();
    const rows = await t.db
      .select({ basis: leads.consentBasis, phone: contacts.phoneE164 })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(eq(leads.organizationId, o.organizationId));
    expect(rows.find((r) => r.phone === '+919822200001')?.basis).toBe('INQUIRY');
    const list = await o.client.get('/api/v1/suppression').expect(200);
    expect((list.body as { items: { phone: string; source: string }[] }).items).toEqual([
      expect.objectContaining({ phone: '+919822200002', source: 'HUBSPOT' }),
    ]);
  });

  it('rejects forged state, other Members and signed-out callbacks', async () => {
    const o = await owner(t, 'OAuth Checks');
    const { code } = account([]);
    const forged = await o.client
      .get('/api/v1/integrations/crm/hubspot/callback')
      .query({ code, state: 'forged.state' })
      .expect(303);
    expect(forged.headers.location).toContain('crm=invalid_state');

    const started = await o.client
      .post('/api/v1/integrations/crm/hubspot/authorize')
      .send({})
      .expect(200);
    const state =
      new URL((started.body as { authorizeUrl: string }).authorizeUrl).searchParams.get('state') ??
      '';
    const admin = await joinAs(t, o.client, 'admin');
    const stolen = await admin.client
      .get('/api/v1/integrations/crm/hubspot/callback')
      .query({ code, state })
      .expect(303);
    expect(stolen.headers.location).toContain('crm=invalid_state');
    const anonymous = await browser(t)
      .get('/api/v1/integrations/crm/hubspot/callback')
      .query({ code, state })
      .expect(303);
    expect(anonymous.headers.location).toContain('crm=signed_out');
    const denied = await o.client
      .get('/api/v1/integrations/crm/hubspot/callback')
      .query({ error: 'access_denied', state })
      .expect(303);
    expect(denied.headers.location).toContain('crm=denied');
  });

  it('enforces one account per organization and confirmation for account changes (A-39, FR-86)', async () => {
    const a = await owner(t, 'Account Owner A');
    const b = await owner(t, 'Account Owner B');
    const first = account([]);
    await connect(a.client, first.code);

    // The same HubSpot account cannot be live in a second Organization.
    hubspot.addAccount(`${first.code}-again`, {
      hubId: first.hubId,
      contacts: [],
      companies: {},
      leads: [],
    });
    const inUse = await connect(b.client, `${first.code}-again`);
    expect(inUse.location).toContain('crm=account_in_use');
    expect(hubspot.revoked.length).toBeGreaterThan(0);

    // A different account for A needs explicit confirmation.
    const second = account([]);
    const unconfirmed = await connect(a.client, second.code);
    expect(unconfirmed.location).toContain('crm=account_change_requires_confirmation');
    const third = account([]);
    const confirmed = await connect(a.client, third.code, true);
    expect(confirmed.location).toContain('crm=connected');
    expect((await status(a.client)).connection?.accountId).toBe(String(third.hubId));
  });

  it('refreshes expiring tokens and marks revoked grants TOKEN_INVALID', async () => {
    const o = await owner(t, 'Token Lifecycle');
    const { code } = account([{ id: '301', properties: { firstname: 'T', phone: '9833300001' } }]);
    await connect(o.client, code);
    await t.worker.drain();
    const [before] = await t.db
      .select()
      .from(crmConnections)
      .where(eq(crmConnections.organizationId, o.organizationId));

    await t.db
      .update(crmConnections)
      .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(crmConnections.organizationId, o.organizationId));
    await o.client.post('/api/v1/integrations/crm/sync').send({}).expect(201);
    await t.worker.drain();
    const [refreshed] = await t.db
      .select()
      .from(crmConnections)
      .where(eq(crmConnections.organizationId, o.organizationId));
    expect(refreshed?.refreshTokenEncrypted).not.toBe(before?.refreshTokenEncrypted);
    expect(refreshed?.accessTokenExpiresAt?.getTime()).toBeGreaterThan(Date.now());

    hubspot.rejectRefresh = true;
    try {
      await t.db
        .update(crmConnections)
        .set({ accessTokenExpiresAt: new Date(Date.now() - 1000) })
        .where(eq(crmConnections.organizationId, o.organizationId));
      await o.client.post('/api/v1/integrations/crm/sync').send({}).expect(201);
      await t.worker.drain();
    } finally {
      hubspot.rejectRefresh = false;
    }
    const invalid = await status(o.client);
    expect(invalid.connection?.status).toBe('TOKEN_INVALID');
    expect(invalid.runs[0]?.status).toBe('FAILED');
    await o.client.post('/api/v1/integrations/crm/sync').send({}).expect(409);
    // Nivomi data is untouched by the CRM failure (FR-95).
    expect(
      (await t.db.select().from(leads).where(eq(leads.organizationId, o.organizationId))).length,
    ).toBe(1);
  });

  it('rides out rate limits and retries outages without failing business data', async () => {
    const o = await owner(t, 'Flaky CRM');
    const { code } = account([{ id: '401', properties: { firstname: 'R', phone: '9844400001' } }]);
    hubspot.rateLimitNext = 2;
    await connect(o.client, code);
    await t.worker.drain();
    expect((await status(o.client)).runs[0]?.status).toBe('COMPLETED');

    hubspot.failWith500 = true;
    try {
      await o.client.post('/api/v1/integrations/crm/sync').send({ full: true }).expect(201);
      await t.worker.drain();
      const [run] = await t.db
        .select()
        .from(crmSyncRuns)
        .where(eq(crmSyncRuns.organizationId, o.organizationId))
        .orderBy(sql`${crmSyncRuns.createdAt} desc`)
        .limit(1);
      expect(run?.status).toBe('RUNNING'); // waiting for a retry with backoff
      expect((run?.cursor as { failures?: number }).failures).toBe(1);
    } finally {
      hubspot.failWith500 = false;
    }
    await makeDueAndDrain();
    expect((await status(o.client)).runs[0]?.status).toBe('COMPLETED');
  });

  it('disconnects without deleting data and keeps the source visible', async () => {
    const o = await owner(t, 'Disconnect Me');
    const { code } = account([
      { id: '501', properties: { firstname: 'Keep', lastname: 'Me', phone: '9855500001' } },
    ]);
    await connect(o.client, code);
    await t.worker.drain();
    const revokedBefore = hubspot.revoked.length;

    const manager = await joinAs(t, o.client, 'manager');
    await manager.client
      .delete('/api/v1/integrations/crm')
      .set('Origin', ALLOWED_ORIGIN)
      .expect(403);
    await manager.client.post('/api/v1/integrations/crm/sync').send({}).expect(201); // MANAGER may ingest (FR-19)
    await t.worker.drain();

    await o.client.delete('/api/v1/integrations/crm').expect(204);
    expect(hubspot.revoked.length).toBe(revokedBefore + 1);
    const [row] = await t.db
      .select()
      .from(crmConnections)
      .where(eq(crmConnections.organizationId, o.organizationId));
    expect(row).toMatchObject({
      status: 'DISCONNECTED',
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
    });

    const list = await o.client.get('/api/v1/leads').expect(200);
    const lead = (list.body as { items: { id: string }[] }).items[0];
    const detail = await o.client.get(`/api/v1/leads/${lead?.id ?? ''}`).expect(200);
    expect(
      (detail.body as { sources: { connectionStatus: string }[] }).sources[0]?.connectionStatus,
    ).toBe('DISCONNECTED');
  });

  it('keeps connections isolated per tenant and restricted by role', async () => {
    const a = await owner(t, 'CRM Tenant A');
    const b = await owner(t, 'CRM Tenant B');
    const { code } = account([]);
    await connect(a.client, code);
    expect((await status(b.client)).connection).toBeNull();
    await b.client.delete('/api/v1/integrations/crm').expect(404);
    await b.client.post('/api/v1/integrations/crm/sync').send({}).expect(404);
    const agent = await joinAs(t, a.client, 'agent');
    await agent.client.get('/api/v1/integrations/crm').expect(403);
    const manager = await joinAs(t, a.client, 'manager');
    await manager.client.post('/api/v1/integrations/crm/hubspot/authorize').send({}).expect(403);
  });
});
