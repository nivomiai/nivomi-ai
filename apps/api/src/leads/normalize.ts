import { isSupportedCountry, parsePhoneNumberFromString } from 'libphonenumber-js';

/** Default when an Organization has not set its own (PRD FR-6: default jurisdiction IN). */
export const DEFAULT_COUNTRY = 'IN';

export type PhoneResult = { ok: true; e164: string } | { ok: false; reason: string };

/**
 * PRD FR-15: normalize to E.164. Numbers without a country code take `defaultCountry`; anything
 * that is not a valid number is rejected with a reason instead of being guessed.
 */
export function normalizePhone(raw: string, defaultCountry: string = DEFAULT_COUNTRY): PhoneResult {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'Phone number is missing.' };
  // Spreadsheets often turn "+91…" into a number and drop the plus; "00" is an international prefix.
  const candidate = text.startsWith('00') ? `+${text.slice(2)}` : text;
  const country = isSupportedCountry(defaultCountry) ? defaultCountry : DEFAULT_COUNTRY;
  const parsed = isSupportedCountry(country)
    ? parsePhoneNumberFromString(candidate, country)
    : undefined;
  if (!parsed?.isValid()) {
    return { ok: false, reason: `"${truncate(text, 40)}" is not a valid phone number.` };
  }
  return { ok: true, e164: parsed.number };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailResult =
  { ok: true; email: string; normalized: string } | { ok: false; reason: string };

export function normalizeEmail(raw: string): EmailResult {
  const email = raw.trim();
  if (!EMAIL.test(email) || email.length > 254) {
    return { ok: false, reason: `"${truncate(email, 40)}" is not a valid email address.` };
  }
  return { ok: true, email, normalized: email.toLowerCase() };
}

/** Collapses whitespace; used for display names and company names. */
export function cleanText(value: string | null | undefined, max = 200): string | null {
  if (value == null) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

/** Case- and spacing-insensitive key for matching names (companies, contact name conflicts). */
export function nameKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * True when two person names plausibly refer to the same person: equal ignoring case and
 * punctuation, or one is a prefix of the other ("Asha" vs "Asha Nair").
 */
export function namesCompatible(a: string, b: string): boolean {
  const x = nameKey(a);
  const y = nameKey(b);
  if (!x || !y || x === y) return true;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return longer.startsWith(`${shorter} `);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
