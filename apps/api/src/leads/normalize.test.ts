import { describe, expect, it } from 'vitest';
import {
  cleanText,
  nameKey,
  namesCompatible,
  normalizeEmail,
  normalizePhone,
} from './normalize.js';

describe('normalizePhone (FR-15)', () => {
  it('normalizes Indian numbers written in common local formats', () => {
    for (const raw of ['98765 43210', '098765-43210', '+91 98765 43210', '0091 9876543210']) {
      expect(normalizePhone(raw)).toEqual({ ok: true, e164: '+919876543210' });
    }
  });

  it('keeps an explicit country code and uses the default country otherwise', () => {
    expect(normalizePhone('+1 415 555 2671')).toEqual({ ok: true, e164: '+14155552671' });
    expect(normalizePhone('415 555 2671', 'US')).toEqual({ ok: true, e164: '+14155552671' });
  });

  it('rejects invalid and missing numbers with a reason', () => {
    expect(normalizePhone('12345')).toMatchObject({ ok: false });
    expect(normalizePhone('not a phone')).toMatchObject({ ok: false });
    expect(normalizePhone('   ')).toEqual({ ok: false, reason: 'Phone number is missing.' });
  });
});

describe('normalizeEmail', () => {
  it('keeps the address and lower-cases the match key', () => {
    expect(normalizeEmail(' Asha.Nair@Example.COM ')).toEqual({
      ok: true,
      email: 'Asha.Nair@Example.COM',
      normalized: 'asha.nair@example.com',
    });
  });

  it('rejects malformed addresses', () => {
    expect(normalizeEmail('asha@')).toMatchObject({ ok: false });
  });
});

describe('names', () => {
  it('cleans whitespace and matches names loosely but safely', () => {
    expect(cleanText('  Asha   Nair ')).toBe('Asha Nair');
    expect(cleanText('   ')).toBeNull();
    expect(nameKey('Émile  O’Brien')).toBe('emile o brien');
    expect(namesCompatible('Asha', 'asha nair')).toBe(true);
    expect(namesCompatible('ASHA NAIR', 'Asha Nair')).toBe(true);
    expect(namesCompatible('Asha Nair', 'Ravi Kumar')).toBe(false);
  });
});
