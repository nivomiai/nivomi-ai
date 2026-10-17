import { describe, expect, it } from 'vitest';
import { renderExoML } from './exoml.js';

describe('ExoML renderer', () => {
  it('renders a say-and-hangup response with the greeting and voice', () => {
    const xml = renderExoML({
      action: 'say_and_hangup',
      prompt: 'Thank you for calling Nivomi.',
      voice: 'female',
    });
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Say voice="female">Thank you for calling Nivomi.</Say>');
    expect(xml).toContain('<Hangup/>');
  });

  it('renders a reject response as a say + hangup', () => {
    const xml = renderExoML({
      action: 'reject',
      reason: 'unknown_number',
      prompt: 'Number not in service.',
      voice: 'male',
    });
    expect(xml).toContain('<Say voice="male">Number not in service.</Say>');
    expect(xml).toContain('<Hangup/>');
  });

  it('escapes XML metacharacters so tenant-supplied prompts cannot break the response', () => {
    const xml = renderExoML({
      action: 'say_and_hangup',
      prompt: `Rock & Roll <script>alert("x")</script> O'Brien`,
      voice: 'female',
    });
    expect(xml).toContain('Rock &amp; Roll');
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).toContain('&quot;x&quot;');
    expect(xml).toContain('O&apos;Brien');
    expect(xml).not.toContain('<script>');
  });

  it('renders an ai_turn as say + record with the continuation URL and timeouts', () => {
    const xml = renderExoML({
      action: 'ai_turn',
      prompt: 'Hi, I am Nivomi. How can I help you today?',
      voice: 'female',
      continueActionUrl: 'https://api.example.com/webhooks/exotel/inbound/turn?callSid=X&turn=1',
      finishOnSilenceSeconds: 2,
      maxRecordSeconds: 20,
    });
    expect(xml).toContain('<Say voice="female">Hi, I am Nivomi. How can I help you today?</Say>');
    expect(xml).toContain(
      '<Record action="https://api.example.com/webhooks/exotel/inbound/turn?callSid=X&amp;turn=1"',
    );
    expect(xml).toContain('method="POST"');
    expect(xml).toContain('timeout="2"');
    expect(xml).toContain('maxLength="20"');
    expect(xml).toContain('playBeep="false"');
    expect(xml).toContain('trimSilence="true"');
    expect(xml).not.toContain('<Hangup');
  });

  it('renders an ai_end as a farewell + hangup, same shape as say_and_hangup', () => {
    const xml = renderExoML({
      action: 'ai_end',
      prompt: 'Thanks for calling. Goodbye.',
      voice: 'female',
    });
    expect(xml).toContain('<Say voice="female">Thanks for calling. Goodbye.</Say>');
    expect(xml).toContain('<Hangup/>');
  });

  it('escapes the ai_turn continuation URL so query delimiters do not break the XML attribute', () => {
    const xml = renderExoML({
      action: 'ai_turn',
      prompt: 'ok',
      voice: 'female',
      continueActionUrl: 'https://x/y?a=1&b=2&c=<3>',
      finishOnSilenceSeconds: 2,
      maxRecordSeconds: 20,
    });
    expect(xml).toContain('a=1&amp;b=2&amp;c=&lt;3&gt;');
    expect(xml).not.toContain('a=1&b=2');
  });

  it('renders transfer_to_human as say + Dial + Hangup with the ExoPhone as callerId', () => {
    const xml = renderExoML({
      action: 'transfer_to_human',
      prompt: 'Connecting you to a member of the Nivomi team.',
      voice: 'female',
      handoffE164: '+919876543210',
      callerId: '+919513886363',
      ringTimeoutSeconds: 30,
    });
    expect(xml).toContain(
      '<Say voice="female">Connecting you to a member of the Nivomi team.</Say>',
    );
    expect(xml).toContain('callerId="+919513886363"');
    expect(xml).toContain('timeout="30"');
    expect(xml).toContain('>+919876543210</Dial>');
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('callerId=""');
  });
});
