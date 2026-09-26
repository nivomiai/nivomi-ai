import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FRAME_BYTES, PcmFramer, stripWavHeader } from './audio.js';

test('frames are 3200 bytes, a multiple of 320 and at least Exotel minimum', () => {
  assert.equal(FRAME_BYTES % 320, 0);
  assert.ok(FRAME_BYTES >= 3200);
});

test('PcmFramer emits whole frames and keeps the remainder', () => {
  const framer = new PcmFramer();
  assert.deepEqual(framer.push(Buffer.alloc(1000, 1)), []);
  const frames = framer.push(Buffer.alloc(5500, 2));
  assert.equal(frames.length, 2);
  assert.ok(frames.every((f) => f.length === FRAME_BYTES));
  assert.equal(frames[0][0], 1);
  assert.equal(frames[0][1000], 2);
});

test('PcmFramer.flush pads the tail with silence to a full frame', () => {
  const framer = new PcmFramer();
  framer.push(Buffer.alloc(100, 7));
  const tail = framer.flush();
  assert.equal(tail?.length, FRAME_BYTES);
  assert.equal(tail?.[99], 7);
  assert.equal(tail?.[100], 0);
  assert.equal(framer.flush(), null);
});

test('PcmFramer.reset discards pending audio', () => {
  const framer = new PcmFramer();
  framer.push(Buffer.alloc(100, 7));
  framer.reset();
  assert.equal(framer.flush(), null);
});

function wav(pcm, extraChunk = false) {
  const chunks = [];
  const fmt = Buffer.alloc(8 + 16);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  chunks.push(fmt);
  if (extraChunk) {
    const list = Buffer.alloc(8 + 3 + 1); // odd size, padded
    list.write('LIST', 0, 'ascii');
    list.writeUInt32LE(3, 4);
    chunks.push(list);
  }
  const data = Buffer.alloc(8);
  data.write('data', 0, 'ascii');
  data.writeUInt32LE(pcm.length, 4);
  chunks.push(data, pcm);
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(body.length + 4, 4);
  head.write('WAVE', 8, 'ascii');
  return Buffer.concat([head, body]);
}

test('stripWavHeader returns the data chunk, skipping other chunks', () => {
  const pcm = Buffer.from([1, 2, 3, 4]);
  assert.deepEqual(stripWavHeader(wav(pcm)), pcm);
  assert.deepEqual(stripWavHeader(wav(pcm, true)), pcm);
});

test('stripWavHeader leaves raw PCM untouched', () => {
  const raw = Buffer.from([9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1, 2]);
  assert.equal(stripWavHeader(raw), raw);
});
