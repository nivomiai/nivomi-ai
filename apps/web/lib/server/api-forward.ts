/** Request headers the API needs; everything else (Host, connection headers…) is dropped. */
const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'cookie',
  'origin',
  'user-agent',
  'x-request-id',
] as const;

/** Response headers passed back to the browser. */
const FORWARDED_RESPONSE_HEADERS = [
  'cache-control',
  'content-type',
  'retry-after',
  'x-request-id',
] as const;

const TIMEOUT_MS = 30_000;

function envelope(status: number, code: string, message: string, retryable: boolean): Response {
  return Response.json(
    { success: false, error: { code, message, retryable, requestId: null } },
    { status },
  );
}

/**
 * Forwards `/api/v1/*` to `NIVOMI_API_ORIGIN` at runtime. Unset (production, where the load
 * balancer routes the path) it answers 404, so it can never become an open proxy.
 */
export async function forwardToApi(request: Request): Promise<Response> {
  const origin = process.env.NIVOMI_API_ORIGIN?.replace(/\/+$/, '');
  if (!origin) return envelope(404, 'NOT_FOUND', 'Not found.', false);

  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/v1/')) return envelope(404, 'NOT_FOUND', 'Not found.', false);
  const target = `${origin}${url.pathname}${url.search}`;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  let upstream: Response;
  try {
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : null,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return envelope(503, 'SERVICE_UNAVAILABLE', 'Nivomi is temporarily unavailable.', true);
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) responseHeaders.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie);
  }
  const body = upstream.status === 204 ? null : await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers: responseHeaders });
}
