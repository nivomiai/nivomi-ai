import type { InboundDecision } from './inbound-decision.js';

/**
 * ExoML renderer: translates an `InboundDecision` into the XML Exotel's Flow (Passthru applet)
 * expects back. Keep this file side-effect free so the controller can unit-test it directly.
 *
 * Exotel's `<Say>` body is parsed as literal text (not XML), but & < > still need escaping so a
 * stray character in a tenant-supplied prompt cannot break the response. Verbs we emit:
 *
 *   - `<Say>` + `<Hangup/>`  — terminal greeting / reject / AI farewell.
 *   - `<Say>` + `<Record>`   — one AI turn: speak the line, record the reply, POST to the next URL.
 *
 * `<Record>` attributes we rely on:
 *   - `action`              URL Exotel POSTs when the recording finishes.
 *   - `method`              Always POST; keeps the webhook signature flow uniform.
 *   - `finishOnKey`         `#` — caller can end a long reply manually.
 *   - `maxLength`           Hard cap in seconds; prevents infinite records on bad lines.
 *   - `timeout`             Seconds of silence to end the recording — the turn-boundary.
 *   - `playBeep`            Off; a beep in the middle of a conversation is jarring.
 *   - `trimSilence`         On; shorter uploads = faster STT = snappier turns.
 */

export function renderExoML(decision: InboundDecision): string {
  switch (decision.action) {
    case 'say_and_hangup':
    case 'reject':
    case 'ai_end': {
      return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        `  <Say voice="${decision.voice}">${escapeExoMLText(decision.prompt)}</Say>`,
        '  <Hangup/>',
        '</Response>',
        '',
      ].join('\n');
    }
    case 'ai_turn': {
      return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        `  <Say voice="${decision.voice}">${escapeExoMLText(decision.prompt)}</Say>`,
        `  <Record action="${escapeExoMLAttribute(decision.continueActionUrl)}" method="POST" finishOnKey="#" maxLength="${Math.round(decision.maxRecordSeconds)}" timeout="${Math.round(decision.finishOnSilenceSeconds)}" playBeep="false" trimSilence="true"/>`,
        '</Response>',
        '',
      ].join('\n');
    }
    case 'transfer_to_human': {
      return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        `  <Say voice="${decision.voice}">${escapeExoMLText(decision.prompt)}</Say>`,
        `  <Dial callerId="${escapeExoMLAttribute(decision.callerId)}" timeout="${Math.round(decision.ringTimeoutSeconds)}" record="true">${escapeExoMLText(decision.handoffE164)}</Dial>`,
        '  <Hangup/>',
        '</Response>',
        '',
      ].join('\n');
    }
  }
}

function escapeExoMLText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeExoMLAttribute(value: string): string {
  // Attributes have the same escape rules as text in Exotel's parser.
  return escapeExoMLText(value);
}
