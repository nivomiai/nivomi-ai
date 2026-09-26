import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from './config.js';

const base = {
  SARVAM_API_KEY: 'sk-test',
  LLM_BASE_URL: 'https://api.example.com/v1/',
  LLM_API_KEY: 'llm-test',
  LLM_MODEL: 'model-x',
  PUBLIC_BASE_URL: 'https://abc.example.com/',
  SPIKE_STREAM_TOKEN: 'x'.repeat(32),
  SPIKE_TEST_PHONE_A: '+919800000000',
};

test('names missing variables without echoing values', () => {
  assert.throws(
    () => loadConfig(['sarvam', 'llm'], { SARVAM_API_KEY: 'secret-value' }),
    (err) => err.message.includes('LLM_API_KEY') && !err.message.includes('secret-value'),
  );
});

test('rejects short stream tokens, non-E.164 phones and non-https bases', () => {
  assert.throws(
    () => loadConfig(['runtime'], { ...base, SPIKE_STREAM_TOKEN: 'short' }),
    /at least 24/,
  );
  assert.throws(
    () => loadConfig(['runtime'], { ...base, SPIKE_TEST_PHONE_B: '9800000000' }),
    /E\.164/,
  );
  assert.throws(() => loadConfig(['runtime'], { ...base, PUBLIC_BASE_URL: 'http://abc' }), /https/);
});

test('normalizes URLs and applies Sarvam defaults', () => {
  const cfg = loadConfig(['sarvam', 'llm', 'runtime'], base);
  assert.equal(cfg.llm.baseUrl, 'https://api.example.com/v1');
  assert.equal(cfg.publicBaseUrl, 'https://abc.example.com');
  assert.equal(cfg.sarvam.sttModel, 'saaras:v3-realtime');
  assert.equal(cfg.sarvam.ttsModel, 'bulbul:v3');
  assert.deepEqual(cfg.testPhones, ['+919800000000']);
});
