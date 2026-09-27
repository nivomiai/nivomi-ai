import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

/** Operations dashboard and call queue (read-only aggregates). */
@Module({
  imports: [ComplianceModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
