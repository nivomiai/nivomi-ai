import type { Params } from 'nestjs-pino';
import type { ApiEnv } from '../config/env.js';
import { resolveRequestId } from './request-id.js';

/**
 * Paths removed from every log line. Add to this list whenever a new
 * credential-bearing header or body field is introduced.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["proxy-authorization"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.secret',
];

const HEALTH_PATH = /^\/api\/v\d+\/health(\?|$)/;

export function buildLoggerOptions(env: ApiEnv): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      base: { service: 'nivomi-api', version: env.APP_VERSION },
      genReqId: resolveRequestId,
      redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
      // Load balancer probes would otherwise dominate request logs.
      autoLogging: { ignore: (req) => HEALTH_PATH.test(req.url ?? '') },
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
        : {}),
    },
  };
}
