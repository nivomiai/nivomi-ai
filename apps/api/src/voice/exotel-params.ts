import type { Request } from 'express';
import type {
  InboundCallContext,
  StatusCallbackContext,
  TurnCallbackContext,
} from './inbound-decision.js';

/**
 * Parse what Exotel sends on the Passthru and status-callback URLs. Exotel delivers params as
 * query string (GET) or `application/x-www-form-urlencoded` body (POST), and the field names
 * vary slightly between the two: `From`/`CallFrom`, `To`/`CallTo`. We read both and prefer the
 * canonical names.
 *
 * No value is trusted beyond its shape: the service re-validates each E.164 before any DB write.
 */

function collect(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const q = (request.query ?? {}) as Record<string, unknown>;
  const b = (request.body ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(q)) if (typeof v === 'string') out[k] = v;
  for (const [k, v] of Object.entries(b)) if (typeof v === 'string') out[k] = v;
  return out;
}

/**
 * Normalize a phone number to E.164. Exotel's inbound webhooks send Indian numbers in national
 * format (10 digits with an optional leading 0), not E.164 — we have to upgrade them so the DB
 * lookup against our `+E164` keys works. Specifically:
 *
 *   09513886363   → +919513886363   (11 digits, leading 0, Indian national)
 *   9513886363    → +919513886363   (10-digit Indian mobile/landline)
 *   919513886363  → +919513886363   (12 digits starting with 91 — country code without +)
 *   +919513886363 → unchanged       (already E.164)
 *
 * India has a fixed 10-digit subscriber length, so this is unambiguous. For other country codes
 * we'd need the ExoPhone's country to anchor the rule — out of scope while India is the only
 * jurisdiction (ADR-014).
 */
function normalizePhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) return null;
  // Indian 10-digit subscriber: mobile (6-9 leading) or landline area-code (2-5 leading).
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+91${digits}`;
  // Indian national format with leading trunk 0.
  if (digits.length === 11 && digits.startsWith('0') && /^0[2-9]/.test(digits)) {
    return `+91${digits.slice(1)}`;
  }
  // Country code 91 without the + sign.
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  // Everything else: trust it's already in international form.
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function parseDirection(raw: string | undefined): 'inbound' | 'outbound' | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v === 'incoming' || v === 'inbound') return 'inbound';
  if (v === 'outbound-api' || v === 'outbound' || v === 'outgoing') return 'outbound';
  return null;
}

export function parseInboundContext(request: Request, now: Date): InboundCallContext | null {
  const p = collect(request);
  const from = normalizePhone(p.From ?? p.CallFrom);
  const to = normalizePhone(p.To ?? p.CallTo);
  if (!from || !to) return null;
  return {
    provider: 'exotel',
    providerCallSid: p.CallSid ?? null,
    fromE164: from,
    toE164: to,
    receivedAt: now,
    direction: 'inbound',
  };
}

/**
 * Parse the POST Exotel sends when a `<Record>` finishes. The applet documentation lists
 * `RecordingUrl` (public MP3) and `RecordingDuration` (seconds); older flows use `recording_url`.
 * `CallSid` is required — without it we cannot correlate the turn to the originating call.
 *
 * The `turn` index is NOT sent by Exotel; we carry it ourselves as a query parameter on the
 * `action` URL so each turn's audio file is tagged with its position in the conversation.
 */
export function parseTurnContext(request: Request, now: Date): TurnCallbackContext | null {
  const p = collect(request);
  const callSid = p.CallSid;
  if (!callSid) return null;
  const turnRaw = Number.parseInt(p.turn ?? p.TurnIndex ?? '', 10);
  const turnIndex = Number.isFinite(turnRaw) && turnRaw > 0 ? turnRaw : 1;
  const recordingUrl =
    typeof p.RecordingUrl === 'string' && p.RecordingUrl.length > 0
      ? p.RecordingUrl
      : typeof p.recording_url === 'string' && p.recording_url.length > 0
        ? p.recording_url
        : null;
  const duration = Number.parseFloat(
    p.RecordingDuration ?? p.recording_duration ?? p.Duration ?? '',
  );
  return {
    provider: 'exotel',
    providerCallSid: callSid,
    turnIndex,
    recordingUrl,
    recordingDurationSeconds: Number.isFinite(duration) ? duration : null,
    receivedAt: now,
  };
}

export function parseStatusContext(request: Request, now: Date): StatusCallbackContext {
  const p = collect(request);
  const duration = Number.parseInt(p.DialCallDuration ?? p.Duration ?? '', 10);
  return {
    provider: 'exotel',
    providerCallSid: p.CallSid ?? null,
    fromE164: normalizePhone(p.From ?? p.CallFrom),
    toE164: normalizePhone(p.To ?? p.CallTo),
    callStatus: p.CallStatus ?? p.Status ?? null,
    durationSeconds: Number.isFinite(duration) ? duration : null,
    direction: parseDirection(p.Direction),
    receivedAt: now,
  };
}
