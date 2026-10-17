import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Exotel signs webhooks with HMAC-SHA256 and sends the result as `X-Exotel-Signature:
 * sha256=<hex>`. The signed payload is the request body for POST, or the query string for GET
 * (Passthru applets support both). Signature verification is fail-closed: an unknown algorithm,
 * missing header, or mismatch all return `false`.
 *
 * Reference: Exotel developer docs (webhook security). If the live applet ever ships with a
 * different format (e.g. `sha1=…`, or signing over URL + sorted params), extend
 * `parseExotelSignatureHeader` here — the guard, service and tests do not need to change.
 */

export interface ExotelSignatureHeader {
  readonly algorithm: 'sha256';
  readonly digestHex: string;
}

export function parseExotelSignatureHeader(raw: string | undefined): ExotelSignatureHeader | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = /^(sha256)=([A-Fa-f0-9]{64})$/.exec(trimmed);
  if (match) return { algorithm: 'sha256', digestHex: match[2]!.toLowerCase() };
  // Lenient: accept a bare 64-char hex digest for operators testing with curl.
  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
    return { algorithm: 'sha256', digestHex: trimmed.toLowerCase() };
  }
  return null;
}

export function computeExotelSignature(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

export function verifyExotelSignature(
  secret: string,
  payload: string,
  header: ExotelSignatureHeader,
): boolean {
  const expected = Buffer.from(computeExotelSignature(secret, payload), 'hex');
  const received = Buffer.from(header.digestHex, 'hex');
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
