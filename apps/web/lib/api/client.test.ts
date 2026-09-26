import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, errorMessage } from './client';

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const envelope = (code: string, message: string, extra: Record<string, unknown> = {}) => ({
  success: false,
  error: { code, message, retryable: false, requestId: 'req-1', ...extra },
});

describe('createApiClient', () => {
  it('calls the same-origin versioned API with cookies and JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(json(200, { ok: true }));
    const api = createApiClient({ fetch });
    await expect(api.post('/organizations', { name: 'Acme' })).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/organizations',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: '{"name":"Acme"}',
      }),
    );
  });

  it('turns the error envelope into an ApiError', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json(409, envelope('CONFLICT', 'This person is already a member.')));
    const error = await createApiClient({ fetch })
      .post('/organizations/current/invitations', {})
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'CONFLICT', status: 409, requestId: 'req-1' });
  });

  it('refreshes once on 401 and retries the request', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(401, envelope('AUTHENTICATION_ERROR', 'Please sign in.')))
      .mockResolvedValueOnce(json(204))
      .mockResolvedValueOnce(json(200, { user: {} }));
    await expect(createApiClient({ fetch }).get('/me')).resolves.toEqual({ user: {} });
    expect(fetch.mock.calls.map((c: unknown[]) => c[0])).toEqual([
      '/api/v1/me',
      '/api/v1/auth/refresh',
      '/api/v1/me',
    ]);
  });

  it('shares one refresh between concurrent requests', async () => {
    let refreshCalls = 0;
    const seen = new Set<string>();
    const fetch = vi.fn((input: RequestInfo | URL) => {
      const url = input as string;
      if (url === '/api/v1/auth/refresh') {
        refreshCalls += 1;
        return Promise.resolve(json(204));
      }
      if (!seen.has(url)) {
        seen.add(url);
        return Promise.resolve(json(401, envelope('AUTHENTICATION_ERROR', 'Please sign in.')));
      }
      return Promise.resolve(json(200, { url }));
    });
    const api = createApiClient({ fetch });
    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(refreshCalls).toBe(1);
  });

  it('waits out a refresh conflict from another tab', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(401, envelope('AUTHENTICATION_ERROR', 'Please sign in.')))
      .mockResolvedValueOnce(json(409, envelope('REFRESH_CONFLICT', 'Retry.')))
      .mockResolvedValueOnce(json(204))
      .mockResolvedValueOnce(json(200, { ok: 1 }));
    const api = createApiClient({ fetch, sleep: () => Promise.resolve() });
    await expect(api.get('/me')).resolves.toEqual({ ok: 1 });
  });

  it('reports an expired session when refresh fails', async () => {
    const onSessionExpired = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(401, envelope('AUTHENTICATION_ERROR', 'Please sign in.')))
      .mockResolvedValueOnce(json(401, envelope('AUTHENTICATION_ERROR', 'Session ended.')));
    const error = await createApiClient({ fetch, onSessionExpired })
      .get('/me')
      .catch((e: unknown) => e);
    expect(onSessionExpired).toHaveBeenCalledOnce();
    expect(error).toMatchObject({ code: 'AUTHENTICATION_ERROR' });
  });

  it('never refreshes for the sign-in call itself', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json(401, envelope('AUTHENTICATION_ERROR', 'Wrong email or password.')));
    await createApiClient({ fetch })
      .post('/auth/login', {})
      .catch(() => undefined);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('maps network failures to a retryable, friendly error', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await createApiClient({ fetch })
      .get('/me')
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
    expect(errorMessage(error)).not.toContain('Failed to fetch');
  });

  it('never surfaces raw non-envelope bodies', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('<html>stack trace</html>', { status: 502 }));
    const error = await createApiClient({ fetch })
      .get('/me')
      .catch((e: unknown) => e);
    expect(errorMessage(error)).toBe('Something went wrong. Please try again.');
  });
});

describe('errorMessage', () => {
  it('shows validation details without field prefixes', () => {
    const error = new ApiError('VALIDATION_ERROR', 'Invalid input.', 400, false, null, [
      'password: Use at least 10 characters.',
    ]);
    expect(errorMessage(error)).toBe('Use at least 10 characters.');
  });

  it('hides unexpected errors', () => {
    expect(errorMessage(new Error('secret internals'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('downloads and uploads', () => {
  it('downloads a file with the server-suggested name', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('Row,Reason\n', {
        status: 200,
        headers: { 'content-disposition': 'attachment; filename="leads-errors.csv"' },
      }),
    );
    const result = await createApiClient({ fetch }).download('/imports/1/error-report');
    expect(result.fileName).toBe('leads-errors.csv');
    await expect(result.blob.text()).resolves.toBe('Row,Reason\n');
  });

  it('uploads to the signed URL and reports envelope errors', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(204))
      .mockResolvedValueOnce(
        json(403, envelope('AUTHORIZATION_ERROR', 'This upload link is invalid or has expired.')),
      );
    const api = createApiClient({ fetch });
    const target = { url: 'https://app.test/api/v1/uploads/t', method: 'PUT', headers: {} };
    await expect(api.upload(target, new Blob(['a,b']))).resolves.toBeUndefined();
    await expect(api.upload(target, new Blob(['a,b']))).rejects.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });
  });
});
