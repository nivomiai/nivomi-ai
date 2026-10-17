import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { parseInboundContext, parseStatusContext, parseTurnContext } from './exotel-params.js';

function mockRequest(query: Record<string, string>): Request {
  return { query, body: {} } as unknown as Request;
}

function mockBody(body: Record<string, string>): Request {
  return { query: {}, body } as unknown as Request;
}

const NOW = new Date('2026-10-10T18:15:00Z');

describe('Exotel inbound param parser — phone normalization', () => {
  it('upgrades 10-digit Indian mobiles to E.164', () => {
    const ctx = parseInboundContext(
      mockRequest({ From: '8590154802', To: '9513886363', CallSid: 'X' }),
      NOW,
    );
    expect(ctx).toEqual(
      expect.objectContaining({ fromE164: '+918590154802', toE164: '+919513886363' }),
    );
  });

  it('strips the trunk 0 from Indian national-format numbers (Exotel default)', () => {
    const ctx = parseInboundContext(
      mockRequest({ From: '08590154802', To: '09513886363', CallSid: 'X' }),
      NOW,
    );
    expect(ctx).toEqual(
      expect.objectContaining({ fromE164: '+918590154802', toE164: '+919513886363' }),
    );
  });

  it('accepts numbers already in E.164', () => {
    const ctx = parseInboundContext(
      mockRequest({ From: '+918590154802', To: '+919513886363', CallSid: 'X' }),
      NOW,
    );
    expect(ctx?.fromE164).toBe('+918590154802');
    expect(ctx?.toE164).toBe('+919513886363');
  });

  it("prefers canonical `From`/`To` over Exotel's alternative `CallFrom`/`CallTo`", () => {
    const ctx = parseInboundContext(
      mockRequest({
        CallFrom: '08590154802',
        CallTo: '08037091588',
        From: '08590154802',
        To: '09513886363',
        CallSid: 'X',
      }),
      NOW,
    );
    expect(ctx?.toE164).toBe('+919513886363');
  });

  it('returns null when the destination number cannot be parsed', () => {
    expect(parseInboundContext(mockRequest({ From: '08590154802', CallSid: 'X' }), NOW)).toBeNull();
  });

  it('reads form-encoded POST bodies as well as query strings', () => {
    const ctx = parseInboundContext(
      mockBody({ From: '08590154802', To: '09513886363', CallSid: 'X' }),
      NOW,
    );
    expect(ctx?.toE164).toBe('+919513886363');
  });

  it('turn callback: parses CallSid, RecordingUrl, duration and the carried turn index', () => {
    const turn = parseTurnContext(
      mockBody({
        CallSid: 'EX-TURN-1',
        RecordingUrl: 'https://exotel-recordings.s3.amazonaws.com/sid/abc.mp3',
        RecordingDuration: '3.7',
        turn: '2',
      }),
      NOW,
    );
    expect(turn?.providerCallSid).toBe('EX-TURN-1');
    expect(turn?.recordingUrl).toContain('abc.mp3');
    expect(turn?.recordingDurationSeconds).toBeCloseTo(3.7, 1);
    expect(turn?.turnIndex).toBe(2);
    expect(turn?.receivedAt).toEqual(NOW);
  });

  it('turn callback: defaults to turn index 1 when the caller does not send one', () => {
    const turn = parseTurnContext(
      mockBody({ CallSid: 'EX-TURN-2', RecordingUrl: 'https://x/y.mp3' }),
      NOW,
    );
    expect(turn?.turnIndex).toBe(1);
  });

  it('turn callback: null when CallSid is missing (cannot correlate without it)', () => {
    expect(parseTurnContext(mockBody({ RecordingUrl: 'https://x/y.mp3' }), NOW)).toBeNull();
  });

  it("turn callback: tolerates Exotel's alternative lowercase recording_url field", () => {
    const turn = parseTurnContext(
      mockBody({ CallSid: 'S', recording_url: 'https://x/y.mp3' }),
      NOW,
    );
    expect(turn?.recordingUrl).toBe('https://x/y.mp3');
  });

  it('status callback: parses duration and keeps the raw status string', () => {
    const status = parseStatusContext(
      mockBody({
        CallSid: 'S',
        CallStatus: 'completed',
        DialCallDuration: '42',
        From: '08590154802',
        To: '09513886363',
      }),
      NOW,
    );
    expect(status.callStatus).toBe('completed');
    expect(status.durationSeconds).toBe(42);
    expect(status.fromE164).toBe('+918590154802');
    expect(status.toE164).toBe('+919513886363');
  });
});
