import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SentenceChunker, parseControl, sseData } from './llm.js';

function streamOf(...parts) {
  return new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(new TextEncoder().encode(p));
      controller.close();
    },
  });
}

test('sseData yields data payloads across chunk boundaries', async () => {
  const out = [];
  for await (const d of sseData(
    streamOf('data: {"a":1}\n\nda', 'ta: {"b":2}\r\n\n: comment\ndata: [DONE]\n'),
  )) {
    out.push(d);
  }
  assert.deepEqual(out, ['{"a":1}', '{"b":2}', '[DONE]']);
});

test('SentenceChunker splits on Latin and Indic sentence ends', () => {
  const c = new SentenceChunker();
  assert.deepEqual(c.push('Namaste! Aap'), ['Namaste!']);
  assert.deepEqual(c.push(' kaise hain? मैं ठीक हूँ। Theek'), ['Aap kaise hain?', 'मैं ठीक हूँ।']);
  assert.equal(c.flush(), 'Theek');
  assert.equal(c.flush(), null);
});

test('parseControl waits while the head could still be a token', () => {
  assert.deepEqual(parseControl('[TRA'), { decided: false, action: null, rest: '' });
  assert.deepEqual(parseControl(' ['), { decided: false, action: null, rest: '' });
});

test('parseControl detects transfer and end tokens', () => {
  assert.deepEqual(parseControl('[TRANSFER] Connecting you'), {
    decided: true,
    action: 'transfer',
    rest: ' Connecting you',
  });
  assert.equal(parseControl('[END] Bye').action, 'end');
});

test('parseControl passes ordinary text through unchanged', () => {
  assert.deepEqual(parseControl('Hello there'), {
    decided: true,
    action: null,
    rest: 'Hello there',
  });
});
