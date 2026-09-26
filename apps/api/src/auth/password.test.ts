import { describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from './password.js';

describe('password policy', () => {
  it('accepts long passphrases without composition rules', () => {
    expect(passwordProblem('correct horse battery', 'a@example.com')).toBeNull();
  });

  it('rejects short, oversized and email-equal passwords', () => {
    expect(passwordProblem('short', 'a@example.com')).toMatch(/at least 10/);
    expect(passwordProblem('x'.repeat(129), 'a@example.com')).toMatch(/at most 128/);
    expect(passwordProblem(' A@Example.com ', 'a@example.com')).toMatch(/email/);
  });
});

describe('password hashing', () => {
  it('hashes with Argon2id at the ADR-018 parameters and verifies', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    await expect(verifyPassword(hash, 'correct horse battery')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong horse battery')).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same password'),
      hashPassword('same password'),
    ]);
    expect(a).not.toBe(b);
  });

  it('fails closed on a malformed stored hash', async () => {
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });
});
