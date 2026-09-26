import { z } from 'zod';
import type { ApiEnv } from '../config/env.js';
import {
  CrmAuthError,
  CrmUnavailableError,
  type CRMProvider,
  type CrmCompany,
  type CrmContact,
  type CrmLead,
  type CrmPage,
  type CrmTokens,
} from './crm-provider.js';

/**
 * HubSpot adapter. Endpoints and limits follow HubSpot's official documentation (checked
 * 2026-09-26):
 * - OAuth: `app.hubspot.com/oauth/authorize` (space-separated `scope`, `optional_scope`, `state`);
 *   `POST /oauth/v3/token` (form body) for code exchange and refresh; tokens expire in
 *   `expires_in` seconds and a refresh may return a new refresh token.
 * - CRM: date-versioned `2026-09` object APIs — `GET /crm/objects/2026-09/{type}` (≤100 per
 *   page, `after` cursor, `associations`), `POST …/{type}/search` (≤200 per page, 10,000 results
 *   per query, 5 requests/second), `POST …/{type}/batch/read` (≤100 ids).
 * - Limits: 110 requests per 10 seconds per installed account; 429 on excess.
 * - Revocation: `DELETE /oauth/v1/refresh-tokens/{token}` (v1, supported until 2027-02-16; its
 *   date-versioned replacement's request body is not yet documented — TECH_DEBT).
 */
const CRM_VERSION = '2026-09';
const REQUEST_TIMEOUT_MS = 15_000;
const WINDOW_MS = 10_000;
/** Stay under HubSpot's 110/10 s per account, leaving headroom for other traffic. */
const REQUESTS_PER_WINDOW = 90;
const SEARCH_MIN_INTERVAL_MS = 250; // 4/s, under the 5/s search limit
const MAX_RATE_LIMIT_RETRIES = 3;

const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  hub_id: z.union([z.number(), z.string()]),
  scopes: z.array(z.string()).optional(),
});

const objectSchema = z.object({
  id: z.string(),
  properties: z.record(z.string(), z.string().nullable()).default({}),
  updatedAt: z.string().optional(),
  associations: z
    .record(z.string(), z.object({ results: z.array(z.object({ id: z.string() })) }))
    .optional(),
});
const pageSchema = z.object({
  results: z.array(objectSchema),
  paging: z.object({ next: z.object({ after: z.string() }).optional() }).optional(),
});
const batchSchema = z.object({ results: z.array(objectSchema) });

type HubSpotObject = z.infer<typeof objectSchema>;

function associatedIds(object: HubSpotObject, type: string): string[] {
  // HubSpot keys associations by the plural object type (e.g. "companies", "contacts").
  return (object.associations?.[type]?.results ?? []).map((r) => r.id);
}

export class HubSpotAdapter implements CRMProvider {
  readonly provider = 'HUBSPOT';
  readonly requiredScopes = ['crm.objects.contacts.read', 'crm.objects.companies.read'] as const;
  readonly optionalScopes = ['crm.objects.leads.read'] as const;
  private readonly sent = new Map<string, number[]>();
  private readonly lastSearch = new Map<string, number>();

  constructor(
    private readonly env: Pick<
      ApiEnv,
      | 'HUBSPOT_CLIENT_ID'
      | 'HUBSPOT_CLIENT_SECRET'
      | 'HUBSPOT_AUTHORIZE_URL'
      | 'HUBSPOT_OAUTH_API_URL'
      | 'HUBSPOT_CRM_API_URL'
    >,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  get configured(): boolean {
    return Boolean(this.env.HUBSPOT_CLIENT_ID && this.env.HUBSPOT_CLIENT_SECRET);
  }

  authorizeUrl(state: string, redirectUri: string): string {
    const url = new URL(this.env.HUBSPOT_AUTHORIZE_URL);
    url.searchParams.set('client_id', this.env.HUBSPOT_CLIENT_ID ?? '');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', this.requiredScopes.join(' '));
    url.searchParams.set('optional_scope', this.optionalScopes.join(' '));
    url.searchParams.set('state', state);
    return url.toString();
  }

  exchangeCode(code: string, redirectUri: string): Promise<CrmTokens> {
    return this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  }

  refresh(refreshToken: string): Promise<CrmTokens> {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  async revoke(refreshToken: string): Promise<void> {
    const url = `${this.env.HUBSPOT_CRM_API_URL}/oauth/v1/refresh-tokens/${encodeURIComponent(refreshToken)}`;
    const response = await this.fetchImpl(url, {
      method: 'DELETE',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok && response.status !== 404) {
      throw new CrmUnavailableError(`HubSpot token revocation failed (${response.status})`);
    }
  }

  async listContacts(
    accessToken: string,
    properties: string[],
    after: string | null,
  ): Promise<CrmPage<CrmContact>> {
    const query = new URLSearchParams({
      limit: '100',
      properties: properties.join(','),
      associations: 'companies',
      archived: 'false',
    });
    if (after) query.set('after', after);
    const body = pageSchema.parse(
      await this.request(
        accessToken,
        'GET',
        `/crm/objects/${CRM_VERSION}/contacts?${query.toString()}`,
      ),
    );
    return {
      items: body.results.map((o) => this.contact(o)),
      next: body.paging?.next?.after ?? null,
    };
  }

  async contactsModifiedSince(
    accessToken: string,
    properties: string[],
    since: Date,
    after: string | null,
  ): Promise<CrmPage<CrmContact>> {
    const body = pageSchema.parse(
      await this.request(accessToken, 'POST', `/crm/objects/${CRM_VERSION}/contacts/search`, {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'hs_lastmodifieddate',
                operator: 'GTE',
                value: String(since.getTime()),
              },
            ],
          },
        ],
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }],
        properties,
        limit: 200,
        ...(after ? { after } : {}),
      }),
    );
    return {
      items: body.results.map((o) => this.contact(o)),
      next: body.paging?.next?.after ?? null,
    };
  }

  async getCompanies(accessToken: string, ids: string[]): Promise<CrmCompany[]> {
    const companies: CrmCompany[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const body = batchSchema.parse(
        await this.request(
          accessToken,
          'POST',
          `/crm/objects/${CRM_VERSION}/companies/batch/read`,
          {
            inputs: ids.slice(i, i + 100).map((id) => ({ id })),
            properties: ['name', 'domain'],
          },
        ),
      );
      companies.push(
        ...body.results.map((o) => ({
          id: o.id,
          name: o.properties.name ?? null,
          domain: o.properties.domain ?? null,
        })),
      );
    }
    return companies;
  }

  async listLeads(accessToken: string, after: string | null): Promise<CrmPage<CrmLead>> {
    const query = new URLSearchParams({
      limit: '100',
      properties: 'hs_lead_name,hs_lead_type,hs_lead_label',
      associations: 'contacts',
      archived: 'false',
    });
    if (after) query.set('after', after);
    const body = pageSchema.parse(
      await this.request(
        accessToken,
        'GET',
        `/crm/objects/${CRM_VERSION}/leads?${query.toString()}`,
      ),
    );
    return {
      items: body.results.map((o) => ({
        id: o.id,
        name: o.properties.hs_lead_name ?? null,
        type: o.properties.hs_lead_type ?? null,
        label: o.properties.hs_lead_label ?? null,
        contactIds: associatedIds(o, 'contacts'),
      })),
      next: body.paging?.next?.after ?? null,
    };
  }

  private contact(object: HubSpotObject): CrmContact {
    const updated = object.properties.hs_lastmodifieddate ?? object.updatedAt ?? null;
    const updatedAt = updated ? new Date(updated) : null;
    return {
      id: object.id,
      properties: object.properties,
      companyIds: associatedIds(object, 'companies'),
      updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : null,
    };
  }

  private async token(params: Record<string, string>): Promise<CrmTokens> {
    const body = new URLSearchParams({
      ...params,
      client_id: this.env.HUBSPOT_CLIENT_ID ?? '',
      client_secret: this.env.HUBSPOT_CLIENT_SECRET ?? '',
    });
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.env.HUBSPOT_OAUTH_API_URL}/oauth/v3/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new CrmUnavailableError('HubSpot could not be reached');
    }
    // RFC 6749: invalid_grant and friends are 400; the grant is dead, not the service.
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new CrmAuthError('HubSpot rejected the authorization');
    }
    if (!response.ok)
      throw new CrmUnavailableError(`HubSpot token endpoint failed (${response.status})`);
    const parsed = tokenResponse.safeParse(await response.json().catch(() => null));
    if (!parsed.success)
      throw new CrmUnavailableError('HubSpot returned an unexpected token response');
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      expiresAt: new Date(Date.now() + parsed.data.expires_in * 1000),
      scopes: parsed.data.scopes ?? [],
      accountId: String(parsed.data.hub_id),
    };
  }

  /** Authenticated CRM call with client-side throttling and bounded 429 retries. */
  private async request(
    accessToken: string,
    method: 'GET' | 'POST',
    path: string,
    json?: unknown,
  ): Promise<unknown> {
    const throttleKey = accessToken.slice(-16);
    for (let attempt = 0; ; attempt += 1) {
      await this.throttle(throttleKey, path.endsWith('/search'));
      let response: Response;
      try {
        response = await this.fetchImpl(`${this.env.HUBSPOT_CRM_API_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: json === undefined ? null : JSON.stringify(json),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new CrmUnavailableError('HubSpot could not be reached');
      }
      if (response.status === 401) throw new CrmAuthError('HubSpot rejected the access token');
      if (response.status === 403) {
        throw new CrmAuthError('HubSpot denied access; a required scope may be missing');
      }
      if (response.status === 429) {
        if (attempt >= MAX_RATE_LIMIT_RETRIES) throw new CrmUnavailableError('HubSpot rate limit');
        const interval = Number(response.headers.get('x-hubspot-ratelimit-interval-milliseconds'));
        await this.sleep(
          Number.isFinite(interval) && interval > 0 ? interval : 2 ** attempt * 1_000,
        );
        continue;
      }
      if (response.status >= 500) {
        throw new CrmUnavailableError(`HubSpot is unavailable (${response.status})`);
      }
      if (!response.ok) {
        throw new CrmUnavailableError(`HubSpot request failed (${response.status})`);
      }
      return response.json();
    }
  }

  private async throttle(key: string, search: boolean): Promise<void> {
    if (search) {
      const wait = (this.lastSearch.get(key) ?? 0) + SEARCH_MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.lastSearch.set(key, Date.now());
    }
    const now = Date.now();
    // Access tokens rotate; drop windows that have gone quiet so the map stays small.
    if (this.sent.size > 500) {
      for (const [k, times] of this.sent) {
        if (times.every((t) => now - t >= WINDOW_MS)) this.sent.delete(k);
      }
      for (const [k, t] of this.lastSearch) if (now - t >= WINDOW_MS) this.lastSearch.delete(k);
    }
    const recent = (this.sent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= REQUESTS_PER_WINDOW) {
      const oldest = recent[0] ?? now;
      await this.sleep(WINDOW_MS - (now - oldest));
    }
    recent.push(Date.now());
    this.sent.set(key, recent);
  }
}
