/**
 * Browser client for the Nivomi API. The API is served from the same origin under `/api/v1`
 * (an ALB path rule in production, a Next rewrite in development), so auth rides on HttpOnly
 * cookies and no token is ever readable by page scripts.
 */

export const API_BASE = '/api/v1';

/** Error codes from the API envelope (docs/API.md) plus client-side network failure. */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'EMAIL_NOT_VERIFIED'
  | 'ORGANIZATION_REQUIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'REFRESH_CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'ACCOUNT_LOCKED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'
  | 'DATABASE_ERROR'
  | 'QUEUE_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly requestId: string | null,
    readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorEnvelope {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    requestId?: string;
    details?: string[];
  };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = value.error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

type Fetch = typeof fetch;

export interface ApiClientOptions {
  readonly fetch?: Fetch;
  /** Called when the session cannot be renewed (e.g. to route to /login). */
  readonly onSessionExpired?: () => void;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Paths that must never trigger a refresh-and-retry (they are the auth flow itself). */
const NO_REFRESH =
  /^\/auth\/(login|register|refresh|logout|forgot-password|reset-password)$/;

export function createApiClient(options: ApiClientOptions = {}) {
  const doFetch: Fetch = options.fetch ?? ((...args) => fetch(...args));
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let refreshing: Promise<boolean> | null = null;

  async function send(path: string, init: RequestOptions): Promise<Response> {
    try {
      return await doFetch(`${API_BASE}${path}`, {
        method: init.method ?? 'GET',
        credentials: 'same-origin',
        headers: init.body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: init.body === undefined ? null : JSON.stringify(init.body),
        signal: init.signal ?? null,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiError(
        'NETWORK_ERROR',
        'We could not reach Nivomi. Check your connection and try again.',
        0,
        true,
        null,
      );
    }
  }

  async function toError(response: Response): Promise<ApiError> {
    const payload: unknown = await response.json().catch(() => null);
    if (isErrorEnvelope(payload)) {
      const { code, message, retryable, requestId, details } = payload.error;
      return new ApiError(code, message, response.status, retryable, requestId ?? null, details);
    }
    return new ApiError(
      response.status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR',
      'Something went wrong. Please try again.',
      response.status,
      response.status >= 500,
      response.headers.get('x-request-id'),
    );
  }

  /** One refresh at a time, shared by every request that hit an expired access token. */
  function refreshSession(): Promise<boolean> {
    refreshing ??= (async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await send('/auth/refresh', { method: 'POST' });
        if (response.ok) return true;
        // Another tab rotated the token a moment ago; its cookies are already ours.
        if (response.status === 409) {
          await sleep(150 * (attempt + 1));
          continue;
        }
        return false;
      }
      return false;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  /** Sends with a one-time session refresh on 401; throws the envelope error when not ok. */
  async function authorized(path: string, init: RequestOptions): Promise<Response> {
    let response = await send(path, init);
    if (response.status === 401 && !NO_REFRESH.test(path)) {
      const renewed = await refreshSession().catch(() => false);
      if (renewed) {
        response = await send(path, init);
      }
      if (response.status === 401) {
        options.onSessionExpired?.();
      }
    }
    if (!response.ok) throw await toError(response);
    return response;
  }

  async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
    const response = await authorized(path, init);
    if (response.status === 204 || response.status === 202) {
      // 202 bodies are informational only.
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
    return (await response.json()) as T;
  }

  return {
    request,
    get: <T>(path: string, signal?: AbortSignal) => request<T>(path, signal ? { signal } : {}),
    post: <T = void>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
    put: <T = void>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
    patch: <T = void>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
    del: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
    /** A file response (e.g. a CSV report) with the server-suggested file name. */
    download: async (path: string): Promise<{ blob: Blob; fileName: string | null }> => {
      const response = await authorized(path, {});
      const disposition = response.headers.get('content-disposition') ?? '';
      return {
        blob: await response.blob(),
        fileName: /filename="([^"]+)"/.exec(disposition)?.[1] ?? null,
      };
    },
    /** PUTs a file to a signed upload URL; the URL itself authorizes the upload. */
    upload: async (
      target: { url: string; method: string; headers: Record<string, string> },
      file: Blob,
    ): Promise<void> => {
      let response: Response;
      try {
        response = await doFetch(target.url, {
          method: target.method,
          headers: target.headers,
          body: file,
          credentials: 'same-origin',
        });
      } catch {
        throw new ApiError(
          'NETWORK_ERROR',
          'The upload was interrupted. Check your connection and try again.',
          0,
          true,
          null,
        );
      }
      if (!response.ok) throw await toError(response);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** User-facing copy for an error. Server messages are written to be safe to show. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'VALIDATION_ERROR' && error.details.length > 0) {
      return error.details.map((d) => d.replace(/^[\w.]+: /, '')).join(' ');
    }
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
