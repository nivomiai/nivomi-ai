import { describe, expect, it } from 'vitest';
import { providerCall, RecordingTelemetry, REDACTED_FIELD_NAMES } from './index.js';

describe('RecordingTelemetry', () => {
  it('records a span with its attributes and duration', async () => {
    const t = new RecordingTelemetry({ serviceName: 'test', environment: 'test' });
    const span = t.startSpan('db.query', { table: 'users' });
    await new Promise((r) => setTimeout(r, 5));
    span.end({ rows: 3 });
    expect(t.spans).toHaveLength(1);
    expect(t.spans[0]?.name).toBe('db.query');
    expect(t.spans[0]?.attributes.table).toBe('users');
    expect(t.spans[0]?.attributes.rows).toBe(3);
    expect(t.spans[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records errors on the span', () => {
    const t = new RecordingTelemetry({ serviceName: 'test', environment: 'test' });
    const span = t.startSpan('provider.hubspot.push');
    span.recordError(new Error('boom'));
    span.end();
    expect(t.spans[0]?.error).toBe('boom');
  });

  it('counters and histograms land on the recorder', () => {
    const t = new RecordingTelemetry({ serviceName: 'test', environment: 'test' });
    t.recordCounter('calls.total', 1, { outcome: 'CONNECTED' });
    t.recordHistogram('turn.latency.ms', 42);
    expect(t.counters).toHaveLength(1);
    expect(t.histograms).toHaveLength(1);
  });
});

describe('providerCall', () => {
  it('wraps work and ends the span on success', async () => {
    const t = new RecordingTelemetry({ serviceName: 'test', environment: 'test' });
    const result = await providerCall(t, 'hubspot', 'push_lead_status', { org: 'o1' }, () =>
      Promise.resolve('ok'),
    );
    expect(result).toBe('ok');
    expect(t.spans[0]?.name).toBe('provider.hubspot.push_lead_status');
    expect(t.spans[0]?.error).toBeUndefined();
  });

  it('records the error and rethrows on failure', async () => {
    const t = new RecordingTelemetry({ serviceName: 'test', environment: 'test' });
    await expect(
      providerCall(t, 'razorpay', 'checkout', {}, () => Promise.reject(new Error('rp down'))),
    ).rejects.toThrow('rp down');
    expect(t.spans[0]?.error).toBe('rp down');
  });
});

describe('REDACTED_FIELD_NAMES', () => {
  it('includes the critical credential names', () => {
    for (const field of ['password', 'token', 'otp', 'aadhaar']) {
      expect(REDACTED_FIELD_NAMES).toContain(field);
    }
  });
});
