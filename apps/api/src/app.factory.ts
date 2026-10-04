import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { ApiEnv } from './config/env.js';
import { REQUEST_ID_HEADER } from './observability/request-id.js';
import { IMPORT_MAX_BYTES } from './imports/file-parsing.js';

/**
 * Builds the fully configured HTTP application. Shared by `main.ts` and the
 * integration tests so tests exercise the same middleware stack as
 * production.
 */
export async function createApp(env: ApiEnv): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  // Exactly one hop (the load balancer): trusting every hop would let clients spoof
  // X-Forwarded-For and dodge per-IP rate limits.
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
  app.use(helmet());
  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS,
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
  });
  app.useBodyParser('json', { limit: '1mb' });
  // Signed file uploads (local storage adapter) take a raw body up to the import size limit;
  // every other route keeps the 1 MB JSON limit.
  app.use('/api/v1/uploads', express.raw({ type: () => true, limit: IMPORT_MAX_BYTES }));
  // Browser voice demo: short mic clips posted as raw audio bytes.
  app.use('/api/v1/demo/stt', express.raw({ type: 'audio/*', limit: '10mb' }));
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  return app;
}
