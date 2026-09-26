import { describe, expect, it } from 'vitest';
import { safeNext } from './api';
import { describeAuditAction, describeDevice, formatDateTime } from './format';

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
