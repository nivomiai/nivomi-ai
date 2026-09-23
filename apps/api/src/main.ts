import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { EnvValidationError, loadEnvFiles } from '@nivomi/config';
import { createApp } from './app.factory.js';
import { loadApiEnv, type ApiEnv } from './config/env.js';

loadEnvFiles(fileURLToPath(new URL('..', import.meta.url)));

let env: ApiEnv;
try {
  env = loadApiEnv();
} catch (error) {
  if (error instanceof EnvValidationError) {
    // The logger is configured from env, so it does not exist yet.
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const app = await createApp(env);
await app.listen(env.PORT, env.HOST);
