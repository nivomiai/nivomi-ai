import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadApiEnv } from '../config/env.js';
import { CredentialsCipher } from './credentials-cipher.js';
import { SignedTokens } from './signed-tokens.js';

const KEY_A = randomBytes(32).toString('base64');
const KEY_B = randomBytes(32).toString('base64');

function env(extra: Record<string, string> = {}) {
  return loadApiEnv({ NODE_ENV: 'test', AUTH_JWT_SECRET: 'x'.repeat(40), ...extra });
}

describe('CredentialsCipher', () => {
  it('round-trips and never stores the plaintext', () => {
    const cipher = new CredentialsCipher(env({ CREDENTIALS_ENCRYPTION_KEY: KEY_A }));
    const stored = cipher.encrypt('refresh-token-value');
    expect(stored).not.toContain('refresh-token-value');
    expect(stored.startsWith('v1.')).toBe(true);
    expect(cipher.encrypt('refresh-token-value')).not.toBe(stored); // random IV
    expect(cipher.decrypt(stored)).toBe('refresh-token-value');
  });

  it('keeps decrypting with the previous key after a rotation', () => {
    const old = new CredentialsCipher(env({ CREDENTIALS_ENCRYPTION_KEY: KEY_A }));
    const stored = old.encrypt('secret');
    const rotated = new CredentialsCipher(
      env({ CREDENTIALS_ENCRYPTION_KEY: KEY_B, CREDENTIALS_ENCRYPTION_PREVIOUS_KEY: KEY_A }),
    );
    expect(rotated.decrypt(stored)).toBe('secret');
    expect(() =>
      new CredentialsCipher(env({ CREDENTIALS_ENCRYPTION_KEY: KEY_B })).decrypt(stored),
    ).toThrow();
  });

  it('detects tampering', () => {
    const cipher = new CredentialsCipher(env({ CREDENTIALS_ENCRYPTION_KEY: KEY_A }));
    const parts = cipher.encrypt('secret').split('.');
    parts[4] = Buffer.from('different').toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });

  it('refuses to encrypt without a key', () => {
    expect(() => new CredentialsCipher(env()).encrypt('x')).toThrow();
  });

  it('rejects keys of the wrong length at startup', () => {
    expect(() => env({ CREDENTIALS_ENCRYPTION_KEY: 'c2hvcnQ=' })).toThrow();
  });
});

describe('SignedTokens', () => {
  const tokens = new SignedTokens(env());

  it('verifies its own tokens for the same purpose only', () => {
    const token = tokens.sign('upload', { key: 'imports/a' }, 60);
    expect(tokens.verify('upload', token)).toMatchObject({ key: 'imports/a' });
    expect(tokens.verify('crm-oauth-state', token)).toBeNull();
  });

  it('rejects tampered and expired tokens', () => {
    const token = tokens.sign('upload', { key: 'imports/a' }, 60);
    const [, mac] = token.split('.');
    const forged = `${Buffer.from('{"key":"imports/b","exp":9999999999}').toString('base64url')}.${mac ?? ''}`;
    expect(tokens.verify('upload', forged)).toBeNull();
    expect(tokens.verify('upload', tokens.sign('upload', {}, -1))).toBeNull();
    expect(tokens.verify('upload', 'garbage')).toBeNull();
  });
});
