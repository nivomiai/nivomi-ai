import { Inject, Injectable } from '@nestjs/common';
import { userMfa, type Database } from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { AppError } from '../common/errors.js';
import { DATABASE } from '../database/database.module.js';

/**
 * TOTP MFA (ADR-028 §4). Secrets are AES-256-GCM-encrypted with a static key from env in
 * development; Phase 11 moves to AWS KMS envelope encryption (TECH_DEBT).
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const WINDOW = 1; // accept the previous, current and next period

function toBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 0b11111];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 0b11111];
  return out;
}

function fromBase32(str: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const idx = BASE32.indexOf(ch);
    if (idx === -1) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secretB32: string, atSeconds: number): string {
  const secret = fromBase32(secretB32);
  const counter = Math.floor(atSeconds / PERIOD_SECONDS);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const off = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const code =
    (((hmac[off] ?? 0) & 0x7f) << 24) |
    (((hmac[off + 1] ?? 0) & 0xff) << 16) |
    (((hmac[off + 2] ?? 0) & 0xff) << 8) |
    ((hmac[off + 3] ?? 0) & 0xff);
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

@Injectable()
export class MfaService {
  private readonly key: Buffer;

  constructor(
    @Inject(API_ENV) env: ApiEnv,
    @Inject(DATABASE) private readonly db: Database,
  ) {
    // Static key in dev; Phase 11 moves to KMS envelope encryption (TECH_DEBT).
    this.key = scryptSync(env.CREDENTIALS_ENCRYPTION_KEY ?? 'dev-only-key', 'nivomi-mfa', 32);
  }

  async enroll(userId: string): Promise<{ secretB32: string; recoveryCodes: string[] }> {
    const existing = await this.hasEnrollment(userId);
    if (existing) throw new AppError('CONFLICT', 'MFA already enrolled');
    const secret = randomBytes(20);
    const secretB32 = toBase32(secret);
    const recoveryCodes = Array.from({ length: 8 }, () =>
      randomBytes(5).toString('hex').toUpperCase(),
    );
    await this.db.insert(userMfa).values({
      userId,
      method: 'TOTP',
      secretEncrypted: this.encrypt(secretB32),
      recoveryCodesEncrypted: recoveryCodes.map((c) => this.encrypt(c)),
    });
    return { secretB32, recoveryCodes };
  }

  async verify(userId: string, code: string): Promise<{ ok: boolean }> {
    const [row] = await this.db
      .select({ secretEncrypted: userMfa.secretEncrypted })
      .from(userMfa)
      .where(and(eq(userMfa.userId, userId)));
    if (!row) return { ok: false };
    const secretB32 = this.decrypt(row.secretEncrypted);
    const now = Math.floor(Date.now() / 1_000);
    for (let step = -WINDOW; step <= WINDOW; step += 1) {
      if (totp(secretB32, now + step * PERIOD_SECONDS) === code) {
        await this.db
          .update(userMfa)
          .set({ lastUsedAt: new Date() })
          .where(eq(userMfa.userId, userId));
        return { ok: true };
      }
    }
    return { ok: false };
  }

  async hasEnrollment(userId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: userMfa.id }).from(userMfa).where(eq(userMfa.userId, userId));
    return row !== undefined;
  }

  async disenroll(userId: string): Promise<void> {
    await this.db.delete(userMfa).where(eq(userMfa.userId, userId));
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${ciphertext.toString('base64')}`;
  }

  private decrypt(packed: string): string {
    const [ivB64, tagB64, ctB64] = packed.split('.');
    if (!ivB64 || !tagB64 || !ctB64) throw new Error('mfa: malformed ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString(
      'utf8',
    );
  }

  /** Exposes the TOTP helper for tests. */
  static code(secretB32: string, atSeconds = Math.floor(Date.now() / 1_000)): string {
    return totp(secretB32, atSeconds);
  }
}
