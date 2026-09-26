import { describe, expect, it } from 'vitest';
import { AppError } from '../common/errors.js';
import { MemoryRateLimitStore, RateLimiter } from './rate-limit.js';

const rule = { name: 'test', limit: 3, windowSeconds: 60 };

describe('RateLimiter', () => {
  it('allows up to the limit, then throws RATE_LIMITED with Retry-After', async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore());
    for (let i = 0; i < 3; i += 1) await limiter.consume(rule, 'ip-1');
    const error = await limiter.consume(rule, 'ip-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'RATE_LIMITED' });
    expect((error as AppError).options.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('counts identities and rules separately', async () => {
    const limiter = new RateLimiter(new MemoryRateLimitStore());
    for (let i = 0; i < 3; i += 1) await limiter.consume(rule, 'ip-1');
    await expect(limiter.consume(rule, 'ip-2')).resolves.toBeUndefined();
    await expect(limiter.consume({ ...rule, name: 'other' }, 'ip-1')).resolves.toBeUndefined();
  });

  it('resets after the window', async () => {
    let now = 0;
    const limiter = new RateLimiter(new MemoryRateLimitStore(() => now));
    for (let i = 0; i < 3; i += 1) await limiter.consume(rule, 'ip-1');
    now += 60_001;
    await expect(limiter.consume(rule, 'ip-1')).resolves.toBeUndefined();
  });
});

describe('MemoryRateLimitStore', () => {
  it('stays bounded under key churn', async () => {
    const store = new MemoryRateLimitStore(() => 0, 100);
    for (let i = 0; i < 1_000; i += 1) await store.increment(`k${i}`, 60_000);
    // Oldest keys are evicted; a recent key keeps counting.
    await expect(store.increment('k999', 60_000)).resolves.toMatchObject({ count: 2 });
  });
});
