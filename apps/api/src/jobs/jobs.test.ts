import { describe, expect, it } from 'vitest';
import { backoffMs } from './jobs.js';

describe('backoffMs', () => {
  it('grows exponentially with full jitter and a floor', () => {
    expect(backoffMs(1, () => 0)).toBe(1_000);
    expect(backoffMs(1, () => 0.999_999)).toBeLessThanOrEqual(11_000);
    expect(backoffMs(3, () => 0.999_999)).toBeGreaterThan(backoffMs(1, () => 0.999_999));
  });

  it('is capped at 30 minutes plus the floor', () => {
    expect(backoffMs(50, () => 0.999_999)).toBeLessThanOrEqual(30 * 60_000 + 1_000);
    expect(backoffMs(50, () => 0.999_999)).toBe(backoffMs(60, () => 0.999_999));
  });
});
