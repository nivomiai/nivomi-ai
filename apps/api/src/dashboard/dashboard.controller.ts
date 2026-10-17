import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentTenant, RequirePermission, type TenantPrincipal } from '../auth/principal.js';
import { validate } from '../common/validation.js';
import { DashboardService } from './dashboard.service.js';

const queueSchema = z.object({
  filter: z.enum(['upcoming', 'review', 'blocked', 'all']).default('upcoming'),
});

/** The operations dashboard (every role; AGENTs see their own leads) and the call queue. */
@Controller()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @RequirePermission('dashboard.read')
  @Get('dashboard')
  summary(@CurrentTenant() tenant: TenantPrincipal) {
    return this.dashboard.summary(tenant);
  }

  @RequirePermission('campaigns.read')
  @Get('call-queue')
  queue(@CurrentTenant() tenant: TenantPrincipal, @Query() query: unknown) {
    return this.dashboard.queue(tenant, validate(queueSchema, query).filter);
  }
}
