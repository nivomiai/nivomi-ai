import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ISSUER = 'nivomi-api';
const AUDIENCE = 'nivomi-app';

export interface AccessClaims {
  readonly userId: string;
  readonly sessionId: string;
}

/** Opaque single-use or refresh token plus the SHA-256 hash that is the only thing stored. */
export interface OpaqueToken {
  readonly token: string;
  readonly hash: string;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOpaqueToken(): OpaqueToken {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

function keyId(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 12);
}

/** Signs and verifies access tokens (ADR-018). Supports one previous secret during rotation. */
@Injectable()
export class TokenService {
  private readonly current: { kid: string; key: Uint8Array };
  private readonly keys: Map<string, Uint8Array>;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    const encode = (secret: string) => new TextEncoder().encode(secret);
    this.current = { kid: keyId(env.AUTH_JWT_SECRET), key: encode(env.AUTH_JWT_SECRET) };
    this.keys = new Map([[this.current.kid, this.current.key]]);
    if (env.AUTH_JWT_PREVIOUS_SECRET) {
      this.keys.set(keyId(env.AUTH_JWT_PREVIOUS_SECRET), encode(env.AUTH_JWT_PREVIOUS_SECRET));
    }
  }

  signAccessToken(claims: AccessClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256', kid: this.current.kid, typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.current.key);
  }

  /** Returns the claims of a valid, unexpired token; null for anything else. */
  async verifyAccessToken(token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(
        token,
        (header) => {
          const key = header.kid ? this.keys.get(header.kid) : undefined;
          if (!key) throw new Error('unknown key id');
          return key;
        },
        { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] },
      );
      const sessionId = payload.sid;
      if (typeof payload.sub !== 'string' || typeof sessionId !== 'string') return null;
      return { userId: payload.sub, sessionId };
    } catch {
      return null;
    }
  }
}
