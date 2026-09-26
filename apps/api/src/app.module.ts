import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuditService } from './audit/audit.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthEmailJobs } from './auth/auth.jobs.js';
import { AuthService } from './auth/auth.service.js';
import { ApiRateLimitGuard, AuthGuard, OriginGuard } from './auth/guards.js';
import { TokenService } from './auth/tokens.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { ConfigModule } from './config/config.module.js';
import type { ApiEnv } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { DevMailboxEmailProvider, EMAIL_PROVIDER } from './email/email.js';
import { HealthModule } from './health/health.module.js';
import { JobHandlerRegistry, JobQueue, JobWorker } from './jobs/jobs.js';
import { buildLoggerOptions } from './observability/logger.js';
import { MeController, OrganizationsController } from './organizations/organizations.controller.js';
import { OrganizationJobs } from './organizations/organizations.jobs.js';
import { OrganizationsService } from './organizations/organizations.service.js';
import { MemoryRateLimitStore, RATE_LIMIT_STORE, RateLimiter } from './security/rate-limit.js';

@Module({})
export class AppModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(buildLoggerOptions(env)),
        DatabaseModule.forRoot(),
        HealthModule,
      ],
      controllers: [AuthController, MeController, OrganizationsController],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        // Order matters: throttle first, then CSRF, then authentication/authorization.
        { provide: APP_GUARD, useClass: ApiRateLimitGuard },
        { provide: APP_GUARD, useClass: OriginGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        // Single-instance store; swapped for Redis before running more than one task (ADR-019).
        { provide: RATE_LIMIT_STORE, useValue: new MemoryRateLimitStore() },
        {
          provide: EMAIL_PROVIDER,
          useValue: new DevMailboxEmailProvider(env.EMAIL_DEV_MAILBOX_DIR),
        },
        RateLimiter,
        AuditService,
        JobHandlerRegistry,
        JobQueue,
        JobWorker,
        TokenService,
        AuthService,
        AuthEmailJobs,
        OrganizationsService,
        OrganizationJobs,
      ],
    };
  }
}
