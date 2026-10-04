import { Module } from '@nestjs/common';
import { CallSessionsService } from './call-sessions.service.js';
import { CallsController } from './calls.controller.js';

/** Call history + inbound binding (ADR-024, Phase 5). */
@Module({
  controllers: [CallsController],
  providers: [CallSessionsService],
  exports: [CallSessionsService],
})
export class CallsModule {}
