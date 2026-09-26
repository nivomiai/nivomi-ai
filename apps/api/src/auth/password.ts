import { hash, verify, type Algorithm } from '@node-rs/argon2';

/**
 * `Algorithm` is an ambient const enum, which `verbatimModuleSyntax` cannot read at runtime;
 * 2 is `Algorithm.Argon2id` (the password tests assert the `$argon2id$` prefix).
 */
const ARGON2ID: Algorithm = 2;

/** OWASP Password Storage Cheat Sheet parameters for Argon2id (ADR-018). */
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * NIST SP 800-63B-style policy: length only, no composition rules; reject passwords equal to the
 * email. Returns a user-facing problem, or null when acceptable.
 */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) {
    return 'Your password cannot be your email address.';
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A malformed stored hash must fail closed, never throw into the login flow.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same work as a real verification so login timing does not reveal whether an
 * account exists.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('nivomi-timing-equalizer-password');
  await verifyPassword(await dummyHash, password);
}
