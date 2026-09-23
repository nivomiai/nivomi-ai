import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

// Inbound IDs are caller-controlled and end up in logs and response headers,
// so only a conservative character set and length are accepted.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Returns the request's correlation ID: the caller's `x-request-id` when it
 * is well formed (so traces join up across services), otherwise a fresh
 * UUID. The ID is echoed back on the response.
 */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const id = typeof inbound === 'string' && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}
