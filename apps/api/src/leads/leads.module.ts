import { Module } from '@nestjs/common';
import { LeadsController, ReviewController, SuppressionController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';

/** Contacts, Leads, the Suppression List and the deduplication review queue (PRD §8.3–8.4). */
@Module({
  controllers: [LeadsController, SuppressionController, ReviewController],
  providers: [LeadsService],
})
export class LeadsModule {}
