import { describe, expect, it } from 'vitest';
import { booleanFlagSchema, originListSchema, portSchema } from './schemas.js';

describe('originListSchema', () => {
  it('splits, trims and drops empty entries', () => {
    expect(originListSchema.parse(' https://app.nivomi.ai , http://localhost:3000,')).toEqual([
      'https://app.nivomi.ai',
      'http://localhost:3000',
    ]);
  });

  it.each([
    ['a path', 'https://app.nivomi.ai/login'],
    ['a trailing slash', 'https://app.nivomi.ai/'],
    ['a non-http scheme', 'ftp://files.nivomi.ai'],
    ['a wildcard', '*'],
  ])('rejects %s', (_label, value) => {
    expect(originListSchema.safeParse(value).success).toBe(false);
  });
});

describe('portSchema', () => {
  it('coerces numeric strings', () => {
    expect(portSchema.parse('4000')).toBe(4000);
  });

  it.each(['0', '65536', '3.5', 'http'])('rejects %s', (value) => {
    expect(portSchema.safeParse(value).success).toBe(false);
  });
});

describe('booleanFlagSchema', () => {
  it('parses common boolean spellings and rejects others', () => {
    expect(booleanFlagSchema.parse('true')).toBe(true);
    expect(booleanFlagSchema.parse(' TRUE ')).toBe(true);
    expect(booleanFlagSchema.parse('1')).toBe(true);
    expect(booleanFlagSchema.parse('false')).toBe(false);
    expect(booleanFlagSchema.parse('0')).toBe(false);
    expect(() => booleanFlagSchema.parse('yes')).toThrow();
  });
});
