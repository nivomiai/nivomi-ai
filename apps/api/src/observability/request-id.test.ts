import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function resolve(inbound?: string | string[]): { id: string; echoed: unknown } {
  const req = { headers: inbound === undefined ? {} : { [REQUEST_ID_HEADER]: inbound } };
  const headers: Record<string, unknown> = {};
  const res = {
    setHeader: (name: string, value: unknown) => {
      headers[name] = value;
    },
  };
  const id = resolveRequestId(req as IncomingMessage, res as unknown as ServerResponse);
  return { id, echoed: headers[REQUEST_ID_HEADER] };
}

describe('resolveRequestId', () => {
  it('generates a UUID when the caller sends none', () => {
    const { id, echoed } = resolve();
    expect(id).toMatch(UUID);
    expect(echoed).toBe(id);
  });

  it('keeps a well-formed inbound ID', () => {
    expect(resolve('trace-0f3a9c21').id).toBe('trace-0f3a9c21');
  });

  it.each([
    ['markup', '<script>alert(1)</script>'],
    ['too short', 'abc'],
    ['too long', 'a'.repeat(129)],
    ['repeated headers', ['trace-0f3a9c21', 'trace-11111111']],
  ])('replaces an unsafe inbound ID (%s)', (_label, inbound) => {
    expect(resolve(inbound).id).toMatch(UUID);
  });
});
