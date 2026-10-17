import { describe, expect, it } from 'vitest';
import { compare, detectIntents, parseAnswer, qualify } from './answers.js';

describe('intent detection (platform floor)', () => {
  it('always recognises an opt-out, in English and romanized Hindi', () => {
    for (const text of [
      "Please don't call me again",
      'STOP CALLING!',
      'Remove my number',
      'mujhe call mat karo',
    ]) {
      expect(detectIntents(text).has('opt_out')).toBe(true);
    }
  });

  it('recognises a request for a human', () => {
    for (const text of ['Can I talk to a person?', 'I want a real person', 'transfer me please']) {
      expect(detectIntents(text).has('human')).toBe(true);
    }
  });

  it('never reads a refusal as agreement', () => {
    const intents = detectIntents("No, I'm not interested, okay?");
    expect(intents.has('not_interested')).toBe(true);
    expect(intents.has('deny')).toBe(true);
    expect(intents.has('affirm')).toBe(false);
    expect(detectIntents('not really, ok').has('affirm')).toBe(false);
  });

  it('detects callbacks and plain agreement', () => {
    expect(detectIntents('Can you call me later?').has('callback')).toBe(true);
    expect(detectIntents('Haan ji, sure').has('affirm')).toBe(true);
  });
});

describe('typed answers (FR-27)', () => {
  it('parses yes/no and rejects ambiguity', () => {
    expect(parseAnswer('yes_no', 'Yes please')).toEqual({ ok: true, value: true });
    expect(parseAnswer('yes_no', 'nahi')).toEqual({ ok: true, value: false });
    expect(parseAnswer('yes_no', 'maybe')).toEqual({ ok: false });
  });

  it('parses numbers with Indian units', () => {
    expect(parseAnswer('number', 'around 60 lakh')).toEqual({ ok: true, value: 6_000_000 });
    expect(parseAnswer('number', '1.5 crore')).toEqual({ ok: true, value: 15_000_000 });
    expect(parseAnswer('number', 'in 6 months')).toEqual({ ok: true, value: 6 });
    expect(parseAnswer('number', 'not sure')).toEqual({ ok: false });
  });

  it('parses a single choice by name or number, only when unambiguous', () => {
    const options = ['2 BHK', '3 BHK', 'Villa'];
    expect(parseAnswer('single_choice', 'I want a villa', options)).toEqual({
      ok: true,
      value: 'Villa',
    });
    expect(parseAnswer('single_choice', 'option 2', options)).toEqual({ ok: true, value: '3 BHK' });
    expect(parseAnswer('single_choice', 'something else', options)).toEqual({ ok: false });
  });

  it('parses and validates dates', () => {
    expect(parseAnswer('date', 'on 25/10/2026')).toEqual({ ok: true, value: '2026-10-25' });
    expect(parseAnswer('date', '2026-02-30')).toEqual({ ok: false });
  });

  it('keeps free text, bounded', () => {
    expect(parseAnswer('free_text', '  Near the metro  ')).toEqual({
      ok: true,
      value: 'Near the metro',
    });
    expect(parseAnswer('free_text', '   ')).toEqual({ ok: false });
  });
});

describe('deterministic qualification (FR-28)', () => {
  const rules = {
    mode: 'ALL' as const,
    rules: [
      { key: 'budget', op: 'gte' as const, value: 6_000_000 },
      { key: 'timeline_months', op: 'lte' as const, value: 6 },
    ],
  };

  it('qualifies only when every rule holds', () => {
    expect(qualify(rules, { budget: 7_000_000, timeline_months: 3 })).toBe('QUALIFIED');
    expect(qualify(rules, { budget: 5_000_000, timeline_months: 3 })).toBe('NOT_QUALIFIED');
  });

  it('is INCOMPLETE while answers are missing and nothing has failed yet', () => {
    expect(qualify(rules, { budget: 7_000_000 })).toBe('INCOMPLETE');
    expect(qualify(rules, { budget: 5_000_000 })).toBe('NOT_QUALIFIED');
    expect(qualify({ mode: 'ALL', rules: [] }, {})).toBe('INCOMPLETE');
  });

  it('supports ANY', () => {
    const any = { ...rules, mode: 'ANY' as const };
    expect(qualify(any, { budget: 5_000_000, timeline_months: 3 })).toBe('QUALIFIED');
    expect(qualify(any, { budget: 5_000_000, timeline_months: 12 })).toBe('NOT_QUALIFIED');
  });

  it('compares case-insensitively and never matches a missing answer', () => {
    expect(compare('Villa', 'eq', 'villa')).toBe(true);
    expect(compare('Villa', 'in', ['3 BHK', 'VILLA'])).toBe(true);
    expect(compare(null, 'neq', 'x')).toBe(false);
    expect(compare('10', 'gt', 5)).toBe(false);
  });
});
