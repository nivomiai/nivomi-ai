import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { EnvValidationError, loadEnvFiles } from '@nivomi/config';
import { loadApiEnv, type ApiEnv } from '../config/env.js';
import { openDatabase } from '../database/database.module.js';
import { DEV_LEADS, DEV_ORGANIZATIONS, DEV_PASSWORD, DEV_USERS } from './seed-data.js';
import { seedDevData } from './seed.js';

// `npm run db:seed:dev` (also run by `npm run dev`). PGlite allows one process per data
// directory, so this runs while the API is stopped.
loadEnvFiles(fileURLToPath(new URL('../..', import.meta.url)));

let env: ApiEnv;
try {
  env = loadApiEnv();
} catch (error) {
  if (error instanceof EnvValidationError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

if (env.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed development data when NODE_ENV=production.\n');
  process.exit(1);
}

const handle = await openDatabase(env);
let leadsCreated = 0;
try {
  ({ leadsCreated } = await seedDevData(handle.db));
} finally {
  await handle.close();
}

const memberships = (email: string): string =>
  DEV_ORGANIZATIONS.flatMap((org) =>
    org.members.filter((m) => m.email === email).map((m) => `${org.name} (${m.role})`),
  ).join(', ') || '-';

const width = Math.max(...DEV_USERS.map((u) => u.email.length));
process.stdout.write(
  [
    `Development data ready. Password for every account: ${DEV_PASSWORD}`,
    `Leads: ${Object.values(DEV_LEADS).reduce((n, list) => n + list.length, 0)} demo leads in ${Object.keys(DEV_LEADS).join(', ')} (${leadsCreated} created this run)`,
    ...DEV_USERS.map(
      (u) =>
        `  ${u.email.padEnd(width)}  ${u.superAdmin ? 'SUPER_ADMIN ' : ''}${memberships(u.email)}`,
    ),
    '',
  ].join('\n'),
);
