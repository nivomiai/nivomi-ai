import { describe, expect, it } from 'vitest';
import { safeNext } from './api';
import { describeAuditAction, describeDevice, formatDateTime, formatRelative } from './format';

describe('safeNext', () => {
  it('allows in-app destinations', () => {
    expect(safeNext('/app/team')).toBe('/app/team');
    expect(safeNext('/invite?token=abc')).toBe('/invite?token=abc');
  });

  it('refuses open redirects and non-app paths', () => {
    for (const bad of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/privacy',
      '',
      null,
    ]) {
      expect(safeNext(bad)).toBe('/app');
    }
  });
});

describe('describeDevice', () => {
  it('summarises common browsers', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      ),
    ).toBe('Chrome on Windows');
    expect(describeDevice(null)).toBe('Unknown device');
  });
});

describe('formatting', () => {
  it('handles bad dates and unknown audit actions', () => {
    expect(formatDateTime('not a date')).toBe('—');
    expect(describeAuditAction('organization.created')).toBe('Created the organization');
    expect(describeAuditAction('something.new')).toBe('something.new');
  });
});

describe('formatRelative', () => {
  const now = new Date(2026, 9, 17, 15, 0);
  const at = (...parts: [number, number, number, number, number]) =>
    new Date(...parts).toISOString();

  it('describes recent times in words', () => {
    expect(formatRelative(new Date(2026, 9, 17, 14, 59, 30).toISOString(), now)).toBe('Just now');
    expect(formatRelative(at(2026, 9, 17, 14, 55), now)).toBe('5 minutes ago');
    expect(formatRelative(at(2026, 9, 17, 14, 0), now)).toBe('1 hour ago');
    expect(formatRelative(at(2026, 9, 17, 1, 0), now)).toBe('14 hours ago');
  });

  it('uses Yesterday, then a short date', () => {
    expect(formatRelative(at(2026, 9, 16, 23, 0), now)).toBe('Yesterday');
    expect(formatRelative(at(2026, 9, 14, 9, 0), now)).toBe('14 Oct');
    expect(formatRelative('not a date', now)).toBe('—');
  });
});
