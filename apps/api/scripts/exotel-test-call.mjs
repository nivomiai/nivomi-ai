#!/usr/bin/env node
// Places a test outbound call via the Exotel /Calls/connect REST endpoint.
// Costs ~1-2 trial credits per attempt. Only verified numbers can be dialled on a trial account.
//
// Usage:
//   npm run -w @nivomi/api exotel:test-call -- --to +91XXXXXXXXXX
//   npm run -w @nivomi/api exotel:test-call -- --to +91XXXXXXXXXX --bridge +91XXXXXXXXXX --seconds 90
//
// Flow:
//   1. Exotel dials `--to` from `EXOTEL_CALLER_ID`.
//   2. When you answer, Exotel bridges to `--bridge` (defaults to Exotel's demo landline).
//
// Never prints secret values. Prints the Exotel CallSid and HTTP status.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env.local');

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

const { values } = parseArgs({
  options: {
    to: { type: 'string' },
    bridge: { type: 'string', default: '+914954269767' },
    seconds: { type: 'string', default: '90' },
  },
});

const E164 = /^\+[1-9]\d{7,14}$/;

const required = [
  'EXOTEL_SID',
  'EXOTEL_API_KEY',
  'EXOTEL_API_TOKEN',
  'EXOTEL_API_URL',
  'EXOTEL_CALLER_ID',
];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(', ')}`);
  process.exit(1);
}
if (!values.to) {
  console.error('Usage: --to +91XXXXXXXXXX  (destination mobile, must be verified on the trial)');
  process.exit(1);
}
if (!E164.test(values.to)) {
  console.error(`--to must be E.164 format, e.g. +9198XXXXXXXX (got: ${values.to})`);
  process.exit(1);
}
if (!E164.test(values.bridge)) {
  console.error(`--bridge must be E.164 format (got: ${values.bridge})`);
  process.exit(1);
}

const auth =
  'Basic ' + Buffer.from(`${env.EXOTEL_API_KEY}:${env.EXOTEL_API_TOKEN}`).toString('base64');
const url = `${env.EXOTEL_API_URL}/v1/Accounts/${encodeURIComponent(env.EXOTEL_SID)}/Calls/connect`;

const body = new URLSearchParams({
  From: values.to,
  To: values.bridge,
  CallerId: env.EXOTEL_CALLER_ID,
  TimeLimit: values.seconds,
  CallType: 'trans',
});

console.log(`POST ${url}`);
console.log(`  From (your mobile):   ${values.to}`);
console.log(`  To   (bridge target): ${values.bridge}`);
console.log(`  CallerId (ExoPhone):  ${env.EXOTEL_CALLER_ID}`);
console.log(`  TimeLimit:            ${values.seconds} s`);
console.log('');

const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: auth,
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  },
  body,
});

const text = await res.text();
console.log(`HTTP ${res.status} ${res.statusText}`);

if (res.status === 200) {
  const sid =
    text.match(/<Sid>(.*?)<\/Sid>/)?.[1] ?? text.match(/"Sid":\s*"(.*?)"/)?.[1] ?? '(not found)';
  const status =
    text.match(/<Status>(.*?)<\/Status>/)?.[1] ??
    text.match(/"Status":\s*"(.*?)"/)?.[1] ??
    '(not found)';
  console.log(`CALL QUEUED`);
  console.log(`  CallSid: ${sid}`);
  console.log(`  Status:  ${status}`);
  console.log('');
  console.log('Your phone should ring in a few seconds. If it does not:');
  console.log(
    '  - verify the destination number is on your Exotel Allowed Numbers list (trial-only restriction)',
  );
  console.log('  - check the number is in E.164 format with the correct country code');
  console.log('  - look at the call log in Exotel dashboard: Calls -> Inbox');
  process.exit(0);
}

console.error('CALL REFUSED. Response body (first 600 chars):');
console.error(text.slice(0, 600));
console.error('');
console.error('Common causes:');
console.error('  401:       credentials bad; run `npm run exotel:probe` to confirm');
console.error(
  '  403:       KYC not complete (Indian TRAI requirement) OR API key missing "Call Connect" permission OR IP restriction blocks this host.',
);
console.error(
  '             Complete KYC in Exotel dashboard: MY ACCOUNT -> Company Info (or the "Complete KYC" banner).',
);
console.error(
  '  400:       bad params (From/To not verified on trial, bad format, insufficient credits)',
);
console.error('  404:       wrong EXOTEL_API_URL for your account region');
process.exit(1);
