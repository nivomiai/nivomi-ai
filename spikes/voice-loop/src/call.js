// Places a test call.
//   npm run call -- --to A --lang hi-IN                 direct: Exotel dials, streams to the bot
//   npm run call -- --to A --lang ml-IN --mode flow     flow: Voicebot applet → Connect (phone B)
// Only SPIKE_TEST_PHONE_A / SPIKE_TEST_PHONE_B can be called.
import { parseArgs } from 'node:util';
import { LANGUAGES, loadConfig } from './config.js';
import { connectCall } from './exotel.js';

const { values } = parseArgs({
  options: {
    to: { type: 'string', default: 'A' },
    lang: { type: 'string', default: 'en-IN' },
    mode: { type: 'string', default: 'direct' },
  },
});

const cfg = loadConfig(['exotel', 'runtime']);
const phone = { A: cfg.testPhones[0], B: cfg.testPhones[1] }[values.to.toUpperCase()];
if (!phone) throw new Error('--to must be A or B, and that SPIKE_TEST_PHONE_* must be set');
if (!LANGUAGES.includes(values.lang))
  throw new Error(`--lang must be one of ${LANGUAGES.join(', ')}`);
if (!['direct', 'flow'].includes(values.mode)) throw new Error('--mode must be direct or flow');

const common = {
  From: phone,
  CallerId: cfg.exotel.callerId,
  TimeLimit: String(cfg.maxCallSeconds),
  StatusCallback: `${cfg.publicBaseUrl}/status/${cfg.streamToken}`,
};

let params;
if (values.mode === 'direct') {
  const wss = cfg.publicBaseUrl.replace(/^https:/, 'wss:');
  params = {
    ...common,
    StreamUrl: `${wss}/media/${cfg.streamToken}/${values.lang}/direct`,
    StreamType: 'bidirectional',
  };
} else {
  if (!cfg.exotel.flowAppId) throw new Error('EXOTEL_FLOW_APP_ID is required for --mode flow');
  const res = await fetch(`${cfg.publicBaseUrl}/next-lang/${cfg.streamToken}?lang=${values.lang}`, {
    method: 'POST',
  });
  if (!res.ok)
    throw new Error(
      `spike server did not accept the language (HTTP ${res.status}); is it running?`,
    );
  params = {
    ...common,
    Url: `http://my.exotel.com/${cfg.exotel.accountSid}/exoml/start_voice/${cfg.exotel.flowAppId}`,
  };
}

console.log(`Calling ${values.to} (${values.lang}, ${values.mode})…`);
console.log((await connectCall(cfg.exotel, params)).slice(0, 800));
