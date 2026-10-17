import { describe, expect, it } from 'vitest';
import { parseQueueFilter } from './call-queue';

describe('parseQueueFilter', () => {
  it('accepts the known filters and falls back to "upcoming"', () => {
    expect(parseQueueFilter('blocked')).toBe('blocked');
    expect(parseQueueFilter(['review', 'all'])).toBe('review');
    expect(parseQueueFilter(undefined)).toBe('upcoming');
    expect(parseQueueFilter('<script>')).toBe('upcoming');
  });
});
