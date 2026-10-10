#!/usr/bin/env node
// Read-only Exotel credential probe. Never prints secret values.
//   npm run -w @nivomi/api exotel:probe
// Exits 0 on HTTP 200, 1 otherwise.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '..', '.env.local');

const text = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  text
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const required = ['EXOTEL_SID', 'EXOTEL_API_KEY', 'EXOTEL_API_TOKEN', 'EXOTEL_API_URL'];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(', ')}`);
  process.exit(1);
}

const auth = 'Basic ' + Buffer.from(`${env.EXOTEL_API_KEY}:${env.EXOTEL_API_TOKEN}`).toString('base64');
const url = `${env.EXOTEL_API_URL}/v1/Accounts/${encodeURIComponent(env.EXOTEL_SID)}`;

console.log(`GET  ${url}`);
const res = await fetch(url, { headers: { Authorization: auth } });
console.log(`HTTP ${res.status} ${res.statusText}`);

const body = await res.text();
if (res.status === 200) {
  const field = (name) => body.match(new RegExp(`<${name}>(.*?)</${name}>`))?.[1] ?? '(none)';
  console.log('Account friendly name: ' + field('FriendlyName'));
  console.log('Account type:          ' + field('Type'));
  console.log('Account status:        ' + field('Status'));
  if (env.EXOTEL_CALLER_ID) {
    console.log('Caller ID configured:  ' + env.EXOTEL_CALLER_ID + ' (verify this is one of your ExoPhones)');
  } else {
    console.log('Caller ID configured:  (empty — set EXOTEL_CALLER_ID to one of your ExoPhones to place calls)');
  }
  process.exit(0);
}
if (res.status === 401 || res.status === 403) {
  console.error('CREDENTIALS REJECTED — regenerate the API key/token in Exotel and retry.');
  process.exit(1);
}
console.error('BODY (first 400 chars):');
console.error(body.slice(0, 400));
process.exit(1);
