import { Module } from '@nestjs/common';
import { API_ENV } from '../config/config.module.js';
import type { ApiEnv } from '../config/env.js';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { JobQueue } from '../jobs/jobs.js';
import { CallOutcomeService } from './call-outcomes.js';
import { CampaignRunner } from './campaign-runner.js';
import { CampaignsController, ReviewsController } from './campaigns.controller.js';
import { CampaignsService } from './campaigns.service.js';
import { SimulatedVoiceProvider, VOICE_PROVIDER } from './voice-provider.js';

/** Campaigns and their durable execution against a VoiceProvider (PRD §8.6, ADR-021). */
@Module({
  imports: [ComplianceModule],
  controllers: [CampaignsController, ReviewsController],
  providers: [
    CampaignsService,
    CampaignRunner,
    CallOutcomeService,
    // VOICE_PROVIDER=simulated is the only dialer until the Exotel adapter (Phase 4).
    {
      provide: VOICE_PROVIDER,
      inject: [API_ENV, JobQueue],
      useFactory: (env: ApiEnv, queue: JobQueue) =>
        new SimulatedVoiceProvider(queue, env.VOICE_SIMULATED_CALL_MS),
    },
  ],
})
export class CampaignsModule {}
