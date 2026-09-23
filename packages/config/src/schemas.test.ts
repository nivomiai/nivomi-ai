import { describe, expect, it } from 'vitest';
import { originListSchema, portSchema } from './schemas.js';

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
