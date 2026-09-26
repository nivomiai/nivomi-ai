// Spike server: receives Exotel's media WebSocket and serves the dynamic stream URL for flows.
//
//   WSS  /media/<token>/<lang>/<mode>   Exotel bidirectional stream (mode: direct | flow)
//   GET  /stream-url/<token>            {"url": "wss://…/media/…"} for the Voicebot applet in a flow
//   POST /next-lang/<token>?lang=hi-IN  sets the language the next flow call will use
//   POST /status/<token>                Exotel StatusCallback (logged)
//   GET  /health
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { LANGUAGES, loadConfig } from './config.js';
import { createRunLog } from './runlog.js';
import { createClient } from './sarvam.js';
import { CallSession } from './session.js';

const cfg = loadConfig(['sarvam', 'llm', 'runtime']);
const sarvamClient = createClient(cfg.sarvam);
const statusLog = createRunLog('status');
let nextFlowLanguage = 'en-IN';

function tokenOk(candidate) {
  const a = Buffer.from(candidate ?? '');
  const b = Buffer.from(cfg.streamToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

function mediaUrl(language, mode) {
  const wss = cfg.publicBaseUrl.replace(/^https:/, 'wss:');
  return `${wss}/media/${cfg.streamToken}/${language}/${mode}`;
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 64 * 1024) break;
  }
  return body;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const [, route, token] = url.pathname.split('/');
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (route === 'health') return send(200, { ok: true });
  if (!tokenOk(token)) return send(404, { error: 'not found' });

  if (route === 'stream-url') {
    return send(200, { url: mediaUrl(nextFlowLanguage, 'flow') });
  }
  if (route === 'next-lang' && req.method === 'POST') {
    const lang = url.searchParams.get('lang') ?? '';
    if (!LANGUAGES.includes(lang))
      return send(400, { error: `lang must be one of ${LANGUAGES.join(', ')}` });
    nextFlowLanguage = lang;
    return send(200, { lang });
  }
  if (route === 'status' && req.method === 'POST') {
    const body = await readBody(req);
    const fields = Object.fromEntries(new URLSearchParams(body));
    statusLog.write('exotel_status', {
      call_sid: fields.CallSid,
      status: fields.Status ?? fields.CallStatus,
      duration: fields.ConversationDuration ?? fields.Duration,
    });
    return send(200, { ok: true });
  }
  return send(404, { error: 'not found' });
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const [, route, token, language, mode] = new URL(
    req.url ?? '/',
    'http://localhost',
  ).pathname.split('/');
  if (
    route !== 'media' ||
    !tokenOk(token) ||
    !LANGUAGES.includes(language) ||
    !['direct', 'flow'].includes(mode)
  ) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const log = createRunLog(`call-${language}-${mode}`);
    console.log(`call connected (${language}, ${mode}) → ${log.file}`);
    new CallSession(ws, { language, mode, cfg, sarvamClient, log });
  });
});

server.listen(cfg.port, () => {
  console.log(`voice-loop spike listening on :${cfg.port}; public base ${cfg.publicBaseUrl}`);
});
