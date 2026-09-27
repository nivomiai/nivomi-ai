import type { AnswerType, CompareOp, EdgeIntent } from './agent-definition.js';

/**
 * Deterministic understanding of what the caller said (ADR-022 §3–4): typed answers, and the
 * intents that drive transitions. Opt-out and "a human, please" are platform intents that every
 * workflow honours. Phrase matching is the floor; model-based understanding in the caller's
 * language arrives with the voice pipeline and never replaces it.
 */

export type AnswerValue = string | number | boolean | null;
export type Intent = EdgeIntent | 'opt_out' | 'human';

const PHRASES: Record<Intent, readonly string[]> = {
  opt_out: [
    "don't call",
    'do not call',
    'dont call',
    'stop calling',
    'never call',
    'remove my number',
    'take me off',
    'unsubscribe',
    'call mat karo',
    'mat call karo',
    'phone mat karo',
  ],
  human: [
    'human',
    'real person',
    'speak to a person',
    'talk to a person',
    'speak to someone',
    'talk to someone',
    'customer care',
    'representative',
    'transfer me',
    'connect me to',
  ],
  not_interested: [
    'not interested',
    'no interest',
    'interest nahi',
    'not looking',
    'no thanks',
    'no thank you',
  ],
  callback: [
    'call me later',
    'call back',
    'callback',
    'call me tomorrow',
    'busy right now',
    'later please',
    'baad mein',
    'baad me',
  ],
  affirm: [
    'yes',
    'yeah',
    'yep',
    'sure',
    'ok',
    'okay',
    'of course',
    'definitely',
    'correct',
    'right',
    'haan',
    'han',
    'ji',
    'please do',
  ],
  deny: ['no', 'nope', 'not really', 'nahi', 'nahin', 'na'],
};

export function normalize(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

function has(normalized: string, phrase: string): boolean {
  return normalized.includes(` ${phrase} `);
}

/** Every intent the text expresses. "Not interested" also counts as a denial, never an affirm. */
export function detectIntents(text: string): Set<Intent> {
  const n = normalize(text);
  const found = new Set<Intent>();
  for (const [intent, phrases] of Object.entries(PHRASES) as [Intent, readonly string[]][]) {
    if (phrases.some((p) => has(n, p))) found.add(intent);
  }
  // "No, I'm not interested" must not read as agreement because of a stray "right"/"ok".
  if (found.has('not_interested') || found.has('opt_out')) {
    found.add('deny');
    found.delete('affirm');
  }
  // "Not really", "no thanks": a denial wins over a filler "ok".
  if (found.has('deny') && found.has('affirm') && /\b(no|not|nahi|nahin|na)\b/.test(n)) {
    found.delete('affirm');
  }
  return found;
}

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  l: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
  cr: 10_000_000,
  million: 1_000_000,
};

export type ParsedAnswer = { ok: true; value: AnswerValue } | { ok: false };

/** Parses the caller's reply for a typed question (FR-27). */
export function parseAnswer(
  type: AnswerType,
  text: string,
  options: readonly string[] = [],
): ParsedAnswer {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false };
  switch (type) {
    case 'yes_no': {
      const intents = detectIntents(trimmed);
      if (intents.has('affirm') && !intents.has('deny')) return { ok: true, value: true };
      if (intents.has('deny') && !intents.has('affirm')) return { ok: true, value: false };
      return { ok: false };
    }
    case 'number': {
      const match = /(-?\d+(?:[.,]\d+)?)\s*(k|thousand|lakhs?|lac|l|crores?|cr|million)?\b/i.exec(
        trimmed.replace(/,(?=\d{2,3}\b)/g, ''),
      );
      if (!match?.[1]) return { ok: false };
      const base = Number(match[1].replace(',', '.'));
      const factor = match[2] ? (MULTIPLIERS[match[2].toLowerCase()] ?? 1) : 1;
      return Number.isFinite(base) ? { ok: true, value: base * factor } : { ok: false };
    }
    case 'single_choice': {
      const n = normalize(trimmed);
      const index = /^\s*(?:option\s*)?(\d{1,2})\s*$/.exec(n);
      if (index?.[1]) {
        const chosen = options[Number(index[1]) - 1];
        return chosen ? { ok: true, value: chosen } : { ok: false };
      }
      const matches = options.filter((o) => has(n, normalize(o).trim()));
      return matches.length === 1 && matches[0] ? { ok: true, value: matches[0] } : { ok: false };
    }
    case 'date': {
      const dmy = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(trimmed);
      const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(trimmed);
      const [y, m, d] = iso
        ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
        : dmy
          ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])]
          : [0, 0, 0];
      if (!y) return { ok: false };
      const date = new Date(Date.UTC(y, m - 1, d));
      if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return { ok: false };
      return { ok: true, value: date.toISOString().slice(0, 10) };
    }
    case 'free_text':
      return { ok: true, value: trimmed.slice(0, 500) };
  }
}

/** Compares a captured answer with a condition value; a missing answer never matches. */
export function compare(
  actual: AnswerValue | undefined,
  op: CompareOp,
  expected: string | number | boolean | readonly string[],
): boolean {
  if (actual === null || actual === undefined) return false;
  const same = (a: AnswerValue, b: unknown) =>
    typeof a === 'string' && typeof b === 'string' ? a.toLowerCase() === b.toLowerCase() : a === b;
  switch (op) {
    case 'eq':
      return same(actual, expected);
    case 'neq':
      return !same(actual, expected);
    case 'in':
      return Array.isArray(expected) && expected.some((e) => same(actual, e));
    default: {
      if (typeof actual !== 'number' || typeof expected !== 'number') return false;
      if (op === 'gt') return actual > expected;
      if (op === 'gte') return actual >= expected;
      if (op === 'lt') return actual < expected;
      return actual <= expected;
    }
  }
}

export type QualificationResult = 'QUALIFIED' | 'NOT_QUALIFIED' | 'INCOMPLETE';

/**
 * FR-28: the Qualification Result is computed by rules over answers, never by the model. With no
 * rules the result is INCOMPLETE (nothing to qualify against).
 */
export function qualify(
  qualification: {
    mode: 'ALL' | 'ANY';
    rules: readonly {
      key: string;
      op: CompareOp;
      value: string | number | boolean | readonly string[];
    }[];
  },
  answers: Readonly<Record<string, AnswerValue>>,
): QualificationResult {
  const { mode, rules } = qualification;
  if (rules.length === 0) return 'INCOMPLETE';
  const results = rules.map((r) => compare(answers[r.key], r.op, r.value));
  const answered = rules.every((r) => answers[r.key] !== undefined && answers[r.key] !== null);
  if (mode === 'ALL') {
    if (results.every(Boolean)) return 'QUALIFIED';
    return answered || results.some((ok, i) => !ok && answers[rules[i]?.key ?? ''] != null)
      ? 'NOT_QUALIFIED'
      : 'INCOMPLETE';
  }
  if (results.some(Boolean)) return 'QUALIFIED';
  return answered ? 'NOT_QUALIFIED' : 'INCOMPLETE';
}
