import { Module } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { CRM_PROVIDER } from './crm-provider.js';
import { CrmSyncJobs } from './crm-sync.jobs.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';
import { HubSpotAdapter } from './hubspot.adapter.js';

/** CRM connection and CRM → Nivomi ingestion (PRD FR-19, FR-84–FR-86, FR-137; ADR-012). */
@Module({
  controllers: [CrmController],
  providers: [
    CrmService,
    CrmSyncJobs,
    {
      provide: CRM_PROVIDER,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => new HubSpotAdapter(env),
    },
  ],
})
export class CrmModule {}
