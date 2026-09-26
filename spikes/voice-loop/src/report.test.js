import assert from 'node:assert/strict';
import { test } from 'node:test';
import { percentile, turnMetrics } from './report.js';

test('percentile uses nearest rank', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5], 90), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
});

test('turnMetrics derives per-stage latencies from one call log', () => {
  const events = [
    { t: 0, type: 'exotel_start', language: 'hi-IN' },
    {
      t: 100,
      type: 'turn_first_media',
      turn: 1,
      speech_end_at: null,
      first_tts_text_at: 40,
      first_tts_audio_at: 90,
      first_media_at: 100,
    },
    { t: 1300, type: 'stt_final', speech_end_at: 1000 },
    { t: 2000, type: 'turn_llm', turn: 2, llm_start_at: 1310, llm_first_token_at: 1600 },
    {
      t: 2100,
      type: 'turn_first_media',
      turn: 2,
      speech_end_at: 1000,
      first_tts_text_at: 1700,
      first_tts_audio_at: 1900,
      first_media_at: 1950,
    },
  ];
  const [opening, turn] = turnMetrics(events);
  assert.equal(opening.opening, true);
  assert.equal(opening.server_turn_ms, null);
  assert.equal(opening.answer_to_speech_ms, 100);
  assert.deepEqual(turn, {
    language: 'hi-IN',
    opening: false,
    stt_final_ms: 300,
    llm_first_ms: 290,
    tts_first_ms: 200,
    server_turn_ms: 950,
    answer_to_speech_ms: null,
  });
});
