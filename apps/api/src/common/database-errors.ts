/**
 * PostgreSQL SQLSTATEs and socket errors that mean "the database is unreachable or refusing
 * work right now" — safe to retry, and answered as 503 DATABASE_ERROR instead of a 500.
 */
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  '08000', // connection_exception
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '53300', // too_many_connections
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
]);

const UNAVAILABLE_MESSAGES = [
  'Connection terminated',
  'timeout exceeded when trying to connect',
  'Client has encountered a connection error',
];

/** True when `error` (or any error in its `cause` chain) signals an unavailable database. */
export function isDatabaseUnavailable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && UNAVAILABLE_CODES.has(code)) return true;
    if (UNAVAILABLE_MESSAGES.some((m) => current instanceof Error && current.message.includes(m))) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/** True when `error` (or its `cause` chain) is a unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = current.cause;
  }
  return false;
}
