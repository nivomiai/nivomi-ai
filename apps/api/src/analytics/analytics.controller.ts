import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentTenant,
  RequirePermission,
  type TenantPrincipal,
} from '../auth/principal.js';
import { validate } from '../common/validation.js';
import { AnalyticsService } from './analytics.service.js';

const query = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

@Controller({ path: 'analytics' })
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @RequirePermission('analytics.read')
  @Get()
  get(@CurrentTenant() tenant: TenantPrincipal, @Query() raw: unknown) {
    const parsed = validate(query, raw);
    return this.svc.summary(tenant, parsed.days);
  }
}
