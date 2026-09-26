import { HttpStatus } from '@nestjs/common';

/**
 * Error codes returned in the API envelope (docs/API.md). Clients branch on `code`, never on the
 * human-readable message.
 */
export const ERROR_STATUS = {
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  AUTHENTICATION_ERROR: HttpStatus.UNAUTHORIZED,
  AUTHORIZATION_ERROR: HttpStatus.FORBIDDEN,
  EMAIL_NOT_VERIFIED: HttpStatus.FORBIDDEN,
  ORGANIZATION_REQUIRED: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  REFRESH_CONFLICT: HttpStatus.CONFLICT,
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  ACCOUNT_LOCKED: HttpStatus.LOCKED,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  QUOTA_EXCEEDED: HttpStatus.TOO_MANY_REQUESTS,
  PROVIDER_ERROR: HttpStatus.BAD_GATEWAY,
  TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  DATABASE_ERROR: HttpStatus.SERVICE_UNAVAILABLE,
  QUEUE_ERROR: HttpStatus.SERVICE_UNAVAILABLE,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  DEPENDENCY_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

/** Codes a client may safely retry (after `Retry-After` when present). */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'REFRESH_CONFLICT',
  'ACCOUNT_LOCKED',
  'RATE_LIMITED',
  'PROVIDER_ERROR',
  'TIMEOUT',
  'DATABASE_ERROR',
  'QUEUE_ERROR',
  'SERVICE_UNAVAILABLE',
  'DEPENDENCY_UNAVAILABLE',
]);

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE.has(code);
}

/**
 * Expected, client-facing failure. The message must be safe to show to end users: never include
 * SQL, stack traces, provider payloads or credentials.
 */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly options: {
      readonly details?: readonly string[];
      /** Seconds until a retry makes sense; sent as `Retry-After`. */
      readonly retryAfterSeconds?: number;
    } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}

/** Maps a bare HTTP status (framework or middleware errors) onto an error code. */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'AUTHENTICATION_ERROR';
    case 403:
      return 'AUTHORIZATION_ERROR';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 429:
      return 'RATE_LIMITED';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    case 504:
      return 'TIMEOUT';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR';
  }
}
