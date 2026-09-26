import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { AppError } from '../common/errors.js';

const VERSION = 'v1';

interface Key {
  readonly id: string;
  readonly material: Buffer;
}

/**
 * Encrypts provider credentials at rest (CLAUDE.md: "encrypted at rest, masked, never returned or
 * logged"). AES-256-GCM with a random IV per value; the key id is stored with each value so a
 * rotated key keeps decrypting old values until they are re-encrypted. KMS envelope encryption
 * (ADR-010/ADR-012) replaces the static key before production (TECH_DEBT).
 *
 * Format: `v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url parts).
 */
@Injectable()
export class CredentialsCipher {
  private readonly current: Key | null;
  private readonly keys = new Map<string, Buffer>();

  constructor(@Inject(API_ENV) env: ApiEnv) {
    const load = (base64: string | undefined): Key | null => {
      if (!base64) return null;
      const material = Buffer.from(base64, 'base64');
      const id = createHash('sha256').update(material).digest('hex').slice(0, 8);
      this.keys.set(id, material);
      return { id, material };
    };
    this.current = load(env.CREDENTIALS_ENCRYPTION_KEY);
    load(env.CREDENTIALS_ENCRYPTION_PREVIOUS_KEY);
  }

  get configured(): boolean {
    return this.current !== null;
  }

  encrypt(plaintext: string): string {
    if (!this.current) {
      throw new AppError('SERVICE_UNAVAILABLE', 'Credential storage is not configured.');
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.current.material, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      VERSION,
      this.current.id,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(value: string): string {
    const [version, keyId, iv, tag, ciphertext] = value.split('.');
    const key = keyId ? this.keys.get(keyId) : undefined;
    if (version !== VERSION || !key || !iv || !tag || ciphertext === undefined) {
      throw new Error('Stored credential cannot be decrypted with the configured keys');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
