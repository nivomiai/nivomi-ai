import { describe, expect, it } from 'vitest';
import { isDatabaseUnavailable } from './database-errors.js';

function withCode(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('isDatabaseUnavailable', () => {
  it('recognises connection failures, including wrapped ones', () => {
    expect(isDatabaseUnavailable(withCode('connect ECONNREFUSED', 'ECONNREFUSED'))).toBe(true);
    expect(isDatabaseUnavailable(withCode('shutting down', '57P01'))).toBe(true);
    expect(
      isDatabaseUnavailable(
        new Error('Failed query: select 1', {
          cause: new Error('Connection terminated unexpectedly'),
        }),
      ),
    ).toBe(true);
  });

  it('does not treat query bugs or constraint violations as outages', () => {
    expect(isDatabaseUnavailable(withCode('duplicate key', '23505'))).toBe(false);
    expect(isDatabaseUnavailable(withCode('syntax error', '42601'))).toBe(false);
    expect(isDatabaseUnavailable('ECONNREFUSED')).toBe(false);
  });
});
