import { describe, expect, it } from 'vitest';
import { leadStatusAfterCall, RETRYABLE_OUTCOMES } from './campaign-policy.js';

describe('lead status after a call (addendum §4)', () => {
  it('marks unanswered leads ATTEMPTED, and UNREACHABLE after the final attempt', () => {
    expect(leadStatusAfterCall('NEW', 'NO_ANSWER', false)).toBe('ATTEMPTED');
    expect(leadStatusAfterCall('ATTEMPTED', 'BUSY', false)).toBeNull();
    expect(leadStatusAfterCall('ATTEMPTED', 'FAILED', true)).toBe('UNREACHABLE');
    // A lead further along is never moved backwards by a missed call.
    expect(leadStatusAfterCall('INTERESTED', 'NO_ANSWER', true)).toBeNull();
  });

  it('maps conversation outcomes', () => {
    expect(leadStatusAfterCall('ATTEMPTED', 'CONNECTED', false)).toBe('CONNECTED');
    expect(leadStatusAfterCall('QUALIFIED', 'CONNECTED', false)).toBeNull();
    expect(leadStatusAfterCall('NEW', 'NOT_INTERESTED', false)).toBe('NOT_INTERESTED');
    expect(leadStatusAfterCall('NEW', 'WRONG_NUMBER', false)).toBe('CLOSED');
  });

  it('always applies an opt-out, even to converted leads', () => {
    expect(leadStatusAfterCall('INTERESTED', 'OPTED_OUT', false)).toBe('DO_NOT_CALL');
    expect(leadStatusAfterCall('CONVERTED', 'OPTED_OUT', false)).toBe('DO_NOT_CALL');
    expect(leadStatusAfterCall('DO_NOT_CALL', 'OPTED_OUT', false)).toBeNull();
    expect(leadStatusAfterCall('CLOSED', 'CONNECTED', false)).toBeNull();
  });

  it('never blames the lead for a provider failure', () => {
    expect(leadStatusAfterCall('NEW', 'PROVIDER_ERROR', true)).toBeNull();
  });

  it('retries only unanswered and failed calls (FR-40)', () => {
    expect([...RETRYABLE_OUTCOMES].sort()).toEqual([
      'BUSY',
      'FAILED',
      'NO_ANSWER',
      'PROVIDER_ERROR',
    ]);
    for (const final of ['OPTED_OUT', 'NOT_INTERESTED', 'WRONG_NUMBER', 'CONNECTED'] as const) {
      expect(RETRYABLE_OUTCOMES.has(final)).toBe(false);
    }
  });
});
