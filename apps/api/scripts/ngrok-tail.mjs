#!/usr/bin/env node
// Pulls recent webhook requests from the local ngrok inspector and formats them.
//
//   npm run -w @nivomi/api ngrok:tail           # one-shot: last 10 requests
//   npm run -w @nivomi/api ngrok:tail -- --watch # polls every 2s (Ctrl+C to stop)
//
// Requires `ngrok http 4000` running in another terminal.

import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    watch: { type: 'boolean', default: false },
    limit: { type: 'string', default: '10' },
  },
});

const seen = new Set();

async function fetchRequests() {
  try {
    const res = await fetch(`http://127.0.0.1:4040/api/requests/http?limit=${values.limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).requests;
  } catch (e) {
    console.error(`cannot reach ngrok inspector at http://127.0.0.1:4040 — is \`ngrok http 4000\` running? (${e.message})`);
    process.exit(1);
  }
}

function render(r) {
  const url = new URL('http://x' + r.request.uri);
  const start = new Date(r.start).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
  const dur = (r.duration / 1_000_000).toFixed(0);
  const ua = r.request.headers['User-Agent']?.[0] ?? '?';
  const ip = r.request.headers['X-Forwarded-For']?.[0] ?? '?';
  console.log('─'.repeat(78));
  console.log(`[${start}]  ${r.request.method}  ${r.response.status}  (${dur}ms)  from ${ip}`);
  console.log(`           User-Agent: ${ua}`);
  console.log(`           Path:       ${url.pathname}`);
  if ([...url.searchParams].length) {
    console.log('  Query params:');
    for (const [k, v] of url.searchParams) console.log(`    ${k.padEnd(24)} ${v || '(empty)'}`);
  }
  const rawB64 = r.response.raw ?? '';
  const raw = Buffer.from(rawB64, 'base64').toString('utf8');
  const sep = raw.indexOf('\r\n\r\n');
  if (sep >= 0) {
    const body = raw.slice(sep + 4).trim();
    if (body) {
      console.log('  Nivomi responded:');
      for (const line of body.split('\n')) console.log('    ' + line);
    }
  }
}

async function tick() {
  const requests = (await fetchRequests()).reverse();
  for (const r of requests) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    render(r);
  }
}

if (values.watch) {
  console.log('Watching ngrok inspector… Ctrl+C to stop.');
  await tick();
  setInterval(tick, 2000);
} else {
  const requests = await fetchRequests();
  for (const r of requests.reverse()) render(r);
}
