import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/errors.js';

/** Fixed-window counter storage (ADR-019). Memory now; Redis once there are several instances. */
export interface RateLimitStore {
  /** Increments the counter for `key` and returns the new count and the window's reset time. */
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

/** Per-process store. Correct for one instance; per-instance protection when Redis is down. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 50_000,
  ) {}

  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    const now = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= this.maxKeys) this.sweep(now);
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return Promise.resolve({ count: bucket.count, resetAt: bucket.resetAt });
  }

  private sweep(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    // Still full after expiring old windows: drop the oldest entries rather than grow unbounded.
    const excess = this.buckets.size - Math.floor(this.maxKeys * 0.9);
    if (excess > 0) {
      let removed = 0;
      for (const key of this.buckets.keys()) {
        this.buckets.delete(key);
        if (++removed >= excess) break;
      }
    }
  }
}

export interface RateLimitRule {
  /** Namespace for the counter, e.g. `auth.login.ip`. */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

/** Rules for authentication and abuse-sensitive endpoints (ADR-018). */
export const RATE_LIMITS = {
  apiPerIp: { name: 'api.ip', limit: 600, windowSeconds: 60 },
  loginPerIp: { name: 'auth.login.ip', limit: 20, windowSeconds: 15 * 60 },
  loginPerEmail: { name: 'auth.login.email', limit: 10, windowSeconds: 15 * 60 },
  registerPerIp: { name: 'auth.register.ip', limit: 10, windowSeconds: 60 * 60 },
  passwordResetPerIp: { name: 'auth.reset.ip', limit: 10, windowSeconds: 60 * 60 },
  passwordResetPerEmail: { name: 'auth.reset.email', limit: 3, windowSeconds: 60 * 60 },
  verificationPerUser: { name: 'auth.verify.user', limit: 5, windowSeconds: 60 * 60 },
  tokenRedeemPerIp: { name: 'auth.token.ip', limit: 30, windowSeconds: 60 * 60 },
  refreshPerIp: { name: 'auth.refresh.ip', limit: 120, windowSeconds: 60 },
  invitationsPerOrganization: { name: 'org.invite', limit: 50, windowSeconds: 24 * 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;

@Injectable()
export class RateLimiter {
  constructor(@Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore) {}

  /** Counts one attempt; throws RATE_LIMITED (with Retry-After) once the rule's limit is exceeded. */
  async consume(rule: RateLimitRule, identity: string): Promise<void> {
    const { count, resetAt } = await this.store.increment(
      `${rule.name}:${identity}`,
      rule.windowSeconds * 1000,
    );
    if (count > rule.limit) {
      throw new AppError('RATE_LIMITED', 'Too many attempts. Please wait and try again.', {
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
      });
    }
  }
}
