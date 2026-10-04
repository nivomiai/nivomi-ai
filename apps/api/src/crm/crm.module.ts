import { Module } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { CRM_PROVIDER } from './crm-provider.js';
import { CrmSyncJobs } from './crm-sync.jobs.js';
import { CrmController } from './crm.controller.js';
import { CrmService } from './crm.service.js';
import { HubSpotAdapter } from './hubspot.adapter.js';
import { HubspotWebhookController } from './webhooks.controller.js';
import { CrmWritebackService } from './writeback.service.js';

/**
 * CRM connection, CRM → Nivomi ingestion (ADR-012, ADR-020) and Nivomi → CRM write-back
 * (ADR-026, Phase 7).
 */
@Module({
  controllers: [CrmController, HubspotWebhookController],
  providers: [
    CrmService,
    CrmSyncJobs,
    CrmWritebackService,
    {
      provide: CRM_PROVIDER,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => new HubSpotAdapter(env),
    },
  ],
  exports: [CrmWritebackService],
})
export class CrmModule {}
