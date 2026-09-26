import { Inject, Injectable } from '@nestjs/common';
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';

/** What a token authorizes; a token for one purpose never verifies for another. */
export type TokenPurpose = 'upload' | 'crm-oauth-state';

/**
 * Short-lived, tamper-proof tokens for flows that leave the API and come back: signed upload
 * URLs and the OAuth `state` parameter. HMAC-SHA256 with a key derived from AUTH_JWT_SECRET
 * per purpose (HKDF), so no new secret is needed and the JWT key itself is never reused.
 */
@Injectable()
export class SignedTokens {
  private readonly keys = new Map<TokenPurpose, Buffer>();

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  sign(purpose: TokenPurpose, payload: Record<string, unknown>, ttlSeconds: number): string {
    const body = Buffer.from(
      JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
    ).toString('base64url');
    return `${body}.${this.mac(purpose, body)}`;
  }

  /** Returns the payload of a valid, unexpired token for `purpose`; null otherwise. */
  verify<T extends Record<string, unknown>>(purpose: TokenPurpose, token: string): T | null {
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const expected = Buffer.from(this.mac(purpose, body));
    const actual = Buffer.from(mac);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & {
        exp?: unknown;
      };
      if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private mac(purpose: TokenPurpose, body: string): string {
    return createHmac('sha256', this.key(purpose)).update(body).digest('base64url');
  }

  private key(purpose: TokenPurpose): Buffer {
    let key = this.keys.get(purpose);
    if (!key) {
      key = Buffer.from(
        hkdfSync('sha256', this.env.AUTH_JWT_SECRET, 'nivomi', `signed-token:${purpose}`, 32),
      );
      this.keys.set(purpose, key);
    }
    return key;
  }
}
