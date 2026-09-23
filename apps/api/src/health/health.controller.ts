import { Controller, Get, Header, Inject } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';

export interface LivenessResponse {
  status: 'ok';
  version: string;
  uptimeSeconds: number;
}

/**
 * Liveness only: answers whether the process can serve HTTP. A readiness
 * endpoint that checks PostgreSQL and Redis is added together with those
 * dependencies (see docs/ROADMAP.md).
 */
@Controller('health')
export class HealthController {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  liveness(): LivenessResponse {
    return {
      status: 'ok',
      version: this.env.APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
