import { Controller, Get, Header, Inject, Logger } from '@nestjs/common';
import type { DatabaseHandle } from '@nivomi/database';
import { Public } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { DATABASE_HANDLE } from '../database/database.module.js';

export interface LivenessResponse {
  status: 'ok';
  version: string;
  uptimeSeconds: number;
}

export interface ReadinessResponse {
  status: 'ready';
  checks: { database: 'ok' };
}

const READINESS_TIMEOUT_MS = 2_000;

/**
 * Liveness answers whether the process can serve HTTP; readiness whether its dependencies
 * (PostgreSQL today; Redis when it is introduced) answer. Load balancers use readiness.
 */
@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(DATABASE_HANDLE) private readonly database: DatabaseHandle,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  liveness(): LivenessResponse {
    return {
      status: 'ok',
      version: this.env.APP_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async readiness(): Promise<ReadinessResponse> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.database.ping(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('database ping timed out')),
            READINESS_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      this.logger.warn({ err: error }, 'readiness check failed');
      throw new AppError('DEPENDENCY_UNAVAILABLE', 'A required dependency is unavailable.');
    } finally {
      clearTimeout(timer);
    }
    return { status: 'ready', checks: { database: 'ok' } };
  }
}
