#!/usr/bin/env node
// Standalone inbound-call webhook demo for Exotel.
//
// Flow:
//   caller dials ExoPhone -> Exotel Flow (Passthru applet) -> HTTPS webhook here -> ExoML response
//
// Setup:
//   1. Install ngrok (https://ngrok.com/download or `winget install ngrok`)
//   2. Run this script:         npm run -w @nivomi/api exotel:inbound-demo
//   3. In another terminal:     ngrok http 4100
//   4. Copy the https URL ngrok prints (e.g. https://abcd-1234.ngrok-free.app)
//   5. In Exotel dashboard:
//      Call Settings -> App Bazaar -> Create New App -> name it "Nivomi Inbound Demo"
//      Add a Passthru applet with URL:  https://<ngrok-id>.ngrok-free.app/inbound
//      Save, then go to ExoPhones -> edit your ExoPhone -> change "Installed App" to "Nivomi Inbound Demo"
//   6. Dial your ExoPhone from any phone. You should hear the greeting below.
//
// Logs every webhook hit, saves the full payload to .data/exotel-inbound-log.jsonl

import { createServer } from 'node:http';
import { readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env.local');
const logDir = resolve(here, '..', '.data');
const logPath = resolve(logDir, 'exotel-inbound-log.jsonl');

mkdirSync(logDir, { recursive: true });

const envText = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const PORT = Number(process.env.PORT ?? 4100);
const GREETING =
  'Hello from Nivomi A I. Your inbound call pipeline is working. ' +
  'This is a test response from the Nivomi webhook. Thank you for calling. Goodbye.';

const EXOML_INBOUND = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="female">${GREETING}</Say>
  <Hangup/>
</Response>`;

const EXOML_HANGUP = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`;

function logEvent(evt) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...evt });
  console.log(line);
  appendFileSync(logPath, line + '\n');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function parseParams(req, body) {
  const url = new URL(req.url ?? '/', 'http://x');
  const params = Object.fromEntries(url.searchParams);
  if (body && req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
    for (const [k, v] of new URLSearchParams(body)) params[k] = v;
  }
  return params;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const body = await readBody(req);
  const params = parseParams(req, body);

  logEvent({
    event: 'request',
    method: req.method,
    path: url.pathname,
    from: req.headers['x-forwarded-for'] ?? req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    params,
  });

  if (url.pathname === '/inbound' && (req.method === 'GET' || req.method === 'POST')) {
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(EXOML_INBOUND);
    logEvent({ event: 'response', path: '/inbound', status: 200, action: 'play greeting' });
    return;
  }

  if (url.pathname === '/status' && req.method === 'POST') {
    res.writeHead(200);
    res.end('OK');
    logEvent({ event: 'status-callback', status: 'logged', params });
    return;
  }

  if (url.pathname === '/' || url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(
      'Nivomi Exotel inbound demo. Point your Exotel Passthru applet at /inbound on this host.\n' +
        'Log file: ' +
        logPath +
        '\n',
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/xml; charset=utf-8' });
  res.end(EXOML_HANGUP);
  logEvent({ event: 'response', path: url.pathname, status: 404 });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('='.repeat(70));
  console.log(` Nivomi inbound demo — listening on http://0.0.0.0:${PORT}`);
  console.log('='.repeat(70));
  console.log(` Expected ExoPhones on account ${env.EXOTEL_SID}:`);
  console.log(`   +919513886363 (mobile)`);
  console.log(`   +914954269767 (landline)`);
  console.log('');
  console.log(' Routes:');
  console.log(`   GET/POST  /inbound    returns ExoML <Say>${GREETING.slice(0, 40)}…</Say>`);
  console.log(`   POST      /status     call status-callback sink`);
  console.log(`   GET       /health     human-readable status`);
  console.log('');
  console.log(' Next step: in another terminal run:    ngrok http ' + PORT);
  console.log(' Then follow the instructions at the top of this script.');
  console.log('');
  console.log(' Log file: ' + logPath);
  console.log(' Press Ctrl+C to stop.');
  console.log('='.repeat(70));
  console.log('');
});
