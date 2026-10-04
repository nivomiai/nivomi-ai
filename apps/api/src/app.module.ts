import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AgentsModule } from './agents/agents.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { AuthController } from './auth/auth.controller.js';
import { BillingModule } from './billing/billing.module.js';
import { CallsModule } from './calls/calls.module.js';
import { CampaignsModule } from './campaigns/campaigns.module.js';
import { ComplianceModule } from './compliance/compliance.module.js';
import { AuthEmailJobs } from './auth/auth.jobs.js';
import { AuthService } from './auth/auth.service.js';
import { ApiRateLimitGuard, AuthGuard, OriginGuard } from './auth/guards.js';
import { TokenService } from './auth/tokens.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { ConfigModule } from './config/config.module.js';
import type { ApiEnv } from './config/env.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DemoModule } from './demo/demo.module.js';
import { CrmModule } from './crm/crm.module.js';
import { HealthModule } from './health/health.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { LeadsModule } from './leads/leads.module.js';
import { buildLoggerOptions } from './observability/logger.js';
import { MeController, OrganizationsController } from './organizations/organizations.controller.js';
import { OrganizationJobs } from './organizations/organizations.jobs.js';
import { OrganizationsService } from './organizations/organizations.service.js';
import { PlatformModule } from './platform/platform.module.js';
import { PlatformOrganizationsController } from './platform/platform-organizations.controller.js';
import { PlatformOrganizationsService } from './platform/platform-organizations.service.js';
import { PlatformUsersController } from './platform/platform-users.controller.js';
import { PlatformUsersService } from './platform/platform-users.service.js';

@Module({})
export class AppModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(buildLoggerOptions(env)),
        DatabaseModule.forRoot(),
        PlatformModule.forRoot(env),
        HealthModule,
        LeadsModule,
        ImportsModule.forRoot(env),
        CrmModule,
        ComplianceModule,
        AgentsModule,
        AppointmentsModule,
        BillingModule,
        CampaignsModule,
        CallsModule,
        DashboardModule,
        DemoModule,
      ],
      controllers: [
        AuthController,
        MeController,
        OrganizationsController,
        PlatformOrganizationsController,
        PlatformUsersController,
      ],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        // Order matters: throttle first, then CSRF, then authentication/authorization.
        { provide: APP_GUARD, useClass: ApiRateLimitGuard },
        { provide: APP_GUARD, useClass: OriginGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        TokenService,
        AuthService,
        AuthEmailJobs,
        OrganizationsService,
        OrganizationJobs,
        PlatformOrganizationsService,
        PlatformUsersService,
      ],
    };
  }
}
