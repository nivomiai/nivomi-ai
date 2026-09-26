// Validates each provider credential with a harmless call. Prints OK / FAIL, never secret values.
//   Exotel: GET account resource (read-only)
//   Sarvam: open realtime STT (waits for session.begin, sends no audio) and TTS (config only)
//   LLM:    GET /models/<LLM_MODEL> (read-only)
import { loadConfig } from './config.js';
import { probeAccount } from './exotel.js';
import { createClient, openStt, openTts } from './sarvam.js';

const cfg = loadConfig(['exotel', 'sarvam', 'llm']);
const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (err) {
    results.push({ name, ok: false, detail: String(err?.message ?? err).slice(0, 200) });
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: no response in ${ms} ms`)), ms),
    ),
  ]);
}

await check('Exotel credentials', async () => {
  const status = await probeAccount(cfg.exotel);
  if (status === 200) return `account reachable on ${cfg.exotel.host}`;
  if (status === 401 || status === 403) throw new Error(`rejected (HTTP ${status})`);
  return `inconclusive (HTTP ${status}); the first test call will confirm`;
});

const client = createClient(cfg.sarvam);

await check(`Sarvam STT (${cfg.sarvam.sttModel})`, async () => {
  let begin;
  const sessionBegun = new Promise((resolve, reject) => {
    begin = { resolve, reject };
  });
  const socket = await withTimeout(
    openStt(client, cfg.sarvam, 'hi-IN', (m) => {
      if (m?.event === 'session.begin') begin.resolve(m);
      if (m?.event === 'error') begin.reject(new Error(`${m.code}: ${m.message}`));
    }),
    10_000,
    'connect',
  );
  const m = await withTimeout(sessionBegun, 10_000, 'session.begin');
  socket.close();
  return `session ${m.request_id} (${m.config?.encoding ?? '?'} @ ${m.config?.sample_rate ?? '?'} Hz)`;
});

await check(`Sarvam TTS (${cfg.sarvam.ttsModel}, ${cfg.sarvam.ttsSpeaker})`, async () => {
  let error = null;
  const socket = await withTimeout(
    openTts(client, cfg.sarvam, 'hi-IN', (m) => {
      if (m?.type === 'error') error = m.data;
    }),
    10_000,
    'connect',
  );
  await new Promise((r) => setTimeout(r, 1500)); // give the server time to reject a bad config
  socket.close();
  if (error) throw new Error(JSON.stringify(error));
  return 'socket accepted the 8 kHz linear16 config';
});

await check(`LLM (${cfg.llm.model})`, async () => {
  const res = await fetch(`${cfg.llm.baseUrl}/models/${encodeURIComponent(cfg.llm.model)}`, {
    headers: { Authorization: `Bearer ${cfg.llm.apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `model available at ${new URL(cfg.llm.baseUrl).host}`;
});

for (const r of results) console.log(`${r.ok ? 'OK  ' : 'FAIL'}  ${r.name} — ${r.detail}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
