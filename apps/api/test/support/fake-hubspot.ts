import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeContact {
  id: string;
  properties: Record<string, string | null>;
  companyIds?: string[];
}

interface Account {
  hubId: number;
  contacts: FakeContact[];
  companies: Record<string, { name: string; domain?: string }>;
  leads: { id: string; name: string; label?: string; contactIds: string[] }[];
}

/**
 * In-process stand-in for HubSpot's documented OAuth v3 and 2026-09 CRM endpoints, so the
 * adapter, connection service and sync worker are exercised over real HTTP. Test-only.
 */
export class FakeHubSpot {
  private server: Server | null = null;
  url = '';
  readonly accounts = new Map<string, Account>(); // keyed by authorization code
  readonly revoked: string[] = [];
  readonly requests: string[] = [];
  /** refresh token → hub, and access token → hub */
  private readonly refreshTokens = new Map<string, number>();
  private readonly accessTokens = new Map<string, number>();
  private counter = 0;
  scopes = ['crm.objects.contacts.read', 'crm.objects.companies.read', 'crm.objects.leads.read'];
  /** Behaviour switches for failure tests. */
  rateLimitNext = 0;
  failWith500 = false;
  rejectRefresh = false;

  private account(hubId: number): Account {
    const found = [...this.accounts.values()].find((a) => a.hubId === hubId);
    if (!found) throw new Error(`no fake account ${hubId}`);
    return found;
  }

  addAccount(code: string, account: Account) {
    this.accounts.set(code, account);
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      void this.handle(req, res).catch(() => {
        res.writeHead(500).end();
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server?.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private issue(hubId: number) {
    this.counter += 1;
    const access = `at-${hubId}-${this.counter}`;
    const refresh = `rt-${hubId}-${this.counter}`;
    this.accessTokens.set(access, hubId);
    this.refreshTokens.set(refresh, hubId);
    return {
      token_type: 'bearer',
      access_token: access,
      refresh_token: refresh,
      expires_in: 1800,
      hub_id: hubId,
      scopes: this.scopes,
    };
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.url);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    this.requests.push(`${req.method ?? ''} ${url.pathname}`);
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'POST' && url.pathname === '/oauth/v3/token') {
      const form = new URLSearchParams(raw);
      if (form.get('client_id') !== 'test-client' || form.get('client_secret') !== 'test-secret') {
        return json(401, { error: 'invalid_client' });
      }
      if (form.get('grant_type') === 'authorization_code') {
        const account = this.accounts.get(form.get('code') ?? '');
        if (!account) return json(400, { error: 'invalid_grant' });
        return json(200, this.issue(account.hubId));
      }
      const hubId = this.refreshTokens.get(form.get('refresh_token') ?? '');
      if (this.rejectRefresh || hubId === undefined) return json(400, { error: 'invalid_grant' });
      return json(200, this.issue(hubId));
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/oauth/v1/refresh-tokens/')) {
      this.revoked.push(decodeURIComponent(url.pathname.split('/').pop() ?? ''));
      res.writeHead(204).end();
      return;
    }

    const hubId = this.accessTokens.get((req.headers.authorization ?? '').replace('Bearer ', ''));
    if (hubId === undefined) return json(401, { status: 'error', message: 'expired' });
    if (this.rateLimitNext > 0) {
      this.rateLimitNext -= 1;
      return json(
        429,
        { status: 'error', errorType: 'RATE_LIMIT' },
        {
          'X-HubSpot-RateLimit-Interval-Milliseconds': '5',
        },
      );
    }
    if (this.failWith500) return json(503, { status: 'error' });
    const account = this.account(hubId);
    const page = <T>(items: T[]) => {
      const limit = Number(url.searchParams.get('limit') ?? 10);
      const start = Number(url.searchParams.get('after') ?? 0);
      const slice = items.slice(start, start + limit);
      const next = start + limit < items.length ? String(start + limit) : null;
      return { results: slice, ...(next ? { paging: { next: { after: next } } } : {}) };
    };
    const contact = (c: FakeContact) => ({
      id: c.id,
      properties: c.properties,
      updatedAt: c.properties.hs_lastmodifieddate ?? '2026-09-01T00:00:00Z',
      associations: c.companyIds?.length
        ? { companies: { results: c.companyIds.map((id) => ({ id, type: 'contact_to_company' })) } }
        : undefined,
    });

    if (req.method === 'GET' && url.pathname === '/crm/objects/2026-09/contacts') {
      return json(200, page(account.contacts.map(contact)));
    }
    if (req.method === 'POST' && url.pathname === '/crm/objects/2026-09/contacts/search') {
      const body = JSON.parse(raw) as {
        filterGroups: { filters: { value: string }[] }[];
        after?: string;
        limit: number;
      };
      const since = Number(body.filterGroups[0]?.filters[0]?.value ?? 0);
      const matching = account.contacts
        .filter((c) => new Date(c.properties.hs_lastmodifieddate ?? 0).getTime() >= since)
        .map(contact);
      const start = Number(body.after ?? 0);
      const slice = matching.slice(start, start + body.limit);
      const next = start + body.limit < matching.length ? String(start + body.limit) : null;
      return json(200, { results: slice, ...(next ? { paging: { next: { after: next } } } : {}) });
    }
    if (req.method === 'POST' && url.pathname === '/crm/objects/2026-09/companies/batch/read') {
      const body = JSON.parse(raw) as { inputs: { id: string }[] };
      return json(200, {
        results: body.inputs.flatMap(({ id }) => {
          const company = account.companies[id];
          return company
            ? [{ id, properties: { name: company.name, domain: company.domain ?? null } }]
            : [];
        }),
      });
    }
    if (req.method === 'GET' && url.pathname === '/crm/objects/2026-09/leads') {
      return json(
        200,
        page(
          account.leads.map((l) => ({
            id: l.id,
            properties: {
              hs_lead_name: l.name,
              hs_lead_label: l.label ?? null,
              hs_lead_type: null,
            },
            associations: {
              contacts: { results: l.contactIds.map((id) => ({ id, type: 'lead_to_contact' })) },
            },
          })),
        ),
      );
    }
    json(404, { status: 'error', message: 'not found' });
  }
}
