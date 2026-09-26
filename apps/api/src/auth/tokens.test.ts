import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '../config/env.js';
import { TokenService, generateOpaqueToken, hashToken } from './tokens.js';

const SECRET_A = 'a'.repeat(40);
const SECRET_B = 'b'.repeat(40);

function service(secret: string, previous?: string): TokenService {
  return new TokenService(
    loadApiEnv({
      NODE_ENV: 'test',
      AUTH_JWT_SECRET: secret,
      ...(previous ? { AUTH_JWT_PREVIOUS_SECRET: previous } : {}),
    }),
  );
}

const claims = {
  userId: '6f1d3c3e-2a51-4f4e-9a55-0f0c7bb2e8a1',
  sessionId: 'b1c1d1e1-0000-4000-8000-000000000001',
};

describe('opaque tokens', () => {
  it('are random and stored only as a SHA-256 hash', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.token);
  });
});

describe('TokenService', () => {
  it('round-trips access tokens', async () => {
    const tokens = service(SECRET_A);
    await expect(tokens.verifyAccessToken(await tokens.signAccessToken(claims))).resolves.toEqual(
      claims,
    );
  });

  it('rejects tokens signed with another secret', async () => {
    const token = await service(SECRET_B).signAccessToken(claims);
    await expect(service(SECRET_A).verifyAccessToken(token)).resolves.toBeNull();
  });

  it('accepts tokens from the previous secret during rotation', async () => {
    const token = await service(SECRET_B).signAccessToken(claims);
    await expect(service(SECRET_A, SECRET_B).verifyAccessToken(token)).resolves.toEqual(claims);
  });

  it('rejects expired, wrong-audience and unsigned tokens', async () => {
    const tokens = service(SECRET_A);
    const key = new TextEncoder().encode(SECRET_A);
    const expired = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer('nivomi-api')
      .setAudience('nivomi-app')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    const wrongAudience = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer('nivomi-api')
      .setAudience('someone-else')
      .setExpirationTime('5m')
      .sign(key);
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: claims.userId, sid: claims.sessionId }),
    ).toString('base64url')}.`;

    for (const token of [expired, wrongAudience, unsigned, 'garbage']) {
      await expect(tokens.verifyAccessToken(token)).resolves.toBeNull();
    }
  });
});
