import { afterEach, describe, expect, it, vi } from 'vitest';
import { forwardToApi } from './api-forward';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('forwardToApi', () => {
  it('is disabled (404) unless NIVOMI_API_ORIGIN is set', async () => {
    vi.stubEnv('NIVOMI_API_ORIGIN', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const res = await forwardToApi(new Request('http://web.test/api/v1/me'));
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards only allow-listed headers and passes cookies back', async () => {
    vi.stubEnv('NIVOMI_API_ORIGIN', 'http://api.test/');
    const upstreamHeaders = new Headers({ 'content-type': 'application/json', 'x-internal': 'no' });
    upstreamHeaders.append('set-cookie', 'nv_access=a; Path=/; HttpOnly');
    upstreamHeaders.append('set-cookie', 'nv_auth=1; Path=/');
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('{"ok":true}', { status: 200, headers: upstreamHeaders }));
    vi.stubGlobal('fetch', fetch);

    const res = await forwardToApi(
      new Request('http://web.test/api/v1/auth/login?x=1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'nv_refresh=r',
          origin: 'http://web.test',
          host: 'web.test',
          'x-forwarded-host': 'evil.example',
        },
        body: '{"email":"a@b.co"}',
      }),
    );

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/auth/login?x=1');
    const sent = init.headers as Headers;
    expect(sent.get('cookie')).toBe('nv_refresh=r');
    expect(sent.get('origin')).toBe('http://web.test');
    expect(sent.get('host')).toBeNull();
    expect(sent.get('x-forwarded-host')).toBeNull();
    expect(res.headers.getSetCookie()).toHaveLength(2);
    expect(res.headers.get('x-internal')).toBeNull();
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('answers with the error envelope when the API is unreachable', async () => {
    vi.stubEnv('NIVOMI_API_ORIGIN', 'http://api.test');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connect ECONNREFUSED')));
    const res = await forwardToApi(new Request('http://web.test/api/v1/me'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.message).not.toContain('ECONNREFUSED');
  });
});

describe('forwardToApi redirects', () => {
  it('passes the OAuth callback redirect through', async () => {
    vi.stubEnv('NIVOMI_API_ORIGIN', 'http://api.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 303,
          headers: { location: 'http://web.test/app/data-sources?crm=connected' },
        }),
      ),
    );
    const res = await forwardToApi(
      new Request('http://web.test/api/v1/integrations/crm/hubspot/callback?code=x'),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://web.test/app/data-sources?crm=connected');
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
