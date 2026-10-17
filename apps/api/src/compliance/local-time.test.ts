import { describe, expect, it } from 'vitest';
import { nextLocalMidnight, startOfLocalDay, windowStatus } from './local-time.js';

describe('recipient-local time', () => {
  it('finds the start of the local day in India, not the server day', () => {
    // 01:30 in India is still the previous day in UTC.
    const at = new Date('2026-10-05T01:30:00+05:30');
    expect(startOfLocalDay(at, 'Asia/Kolkata').toISOString()).toBe(
      new Date('2026-10-05T00:00:00+05:30').toISOString(),
    );
    expect(nextLocalMidnight(at, 'Asia/Kolkata').toISOString()).toBe(
      new Date('2026-10-06T00:00:00+05:30').toISOString(),
    );
  });

  it('reports when a window opens', () => {
    const status = windowStatus(new Date('2026-10-05T09:15:00+05:30'), 'Asia/Kolkata', {
      start: 600,
      end: 1260,
    });
    expect(status).toEqual({ open: false, opensAt: new Date('2026-10-05T10:00:00+05:30') });
  });
});
