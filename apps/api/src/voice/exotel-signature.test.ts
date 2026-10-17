import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  computeExotelSignature,
  parseExotelSignatureHeader,
  verifyExotelSignature,
} from './exotel-signature.js';

const SECRET = 'O3vcelyVfHYqitf_e5CBHcmWlG50DY3OhHjxNvjlS9Y';
const PAYLOAD = 'CallSid=abc&From=%2B918590154802&To=%2B919513886363';

describe('exotel signature', () => {
  it('parses the canonical sha256=<hex> header', () => {
    const digest = createHmac('sha256', SECRET).update(PAYLOAD).digest('hex');
    const parsed = parseExotelSignatureHeader(`sha256=${digest}`);
    expect(parsed).toEqual({ algorithm: 'sha256', digestHex: digest });
  });

  it('accepts a bare 64-char hex digest for curl-style operator testing', () => {
    const digest = createHmac('sha256', SECRET).update(PAYLOAD).digest('hex');
    const parsed = parseExotelSignatureHeader(digest.toUpperCase());
    expect(parsed?.digestHex).toBe(digest.toLowerCase());
  });

  it('rejects unknown algorithm prefixes', () => {
    expect(parseExotelSignatureHeader('sha1=0000000000000000000000000000000000000000')).toBeNull();
    expect(parseExotelSignatureHeader('')).toBeNull();
    expect(parseExotelSignatureHeader(undefined)).toBeNull();
    expect(parseExotelSignatureHeader('not-a-signature')).toBeNull();
  });

  it('verifies a correctly signed payload with constant-time compare', () => {
    const digest = computeExotelSignature(SECRET, PAYLOAD);
    const header = parseExotelSignatureHeader(`sha256=${digest}`)!;
    expect(verifyExotelSignature(SECRET, PAYLOAD, header)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const digest = computeExotelSignature(SECRET, PAYLOAD);
    const header = parseExotelSignatureHeader(`sha256=${digest}`)!;
    expect(verifyExotelSignature(SECRET, PAYLOAD + '&tamper=1', header)).toBe(false);
  });

  it('rejects a signature from the wrong secret', () => {
    const digest = computeExotelSignature('other-secret', PAYLOAD);
    const header = parseExotelSignatureHeader(`sha256=${digest}`)!;
    expect(verifyExotelSignature(SECRET, PAYLOAD, header)).toBe(false);
  });
});
