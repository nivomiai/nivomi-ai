import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentTenant, RequirePermission, type TenantPrincipal } from '../auth/principal.js';
import { validate } from '../common/validation.js';
import { CallSessionsService } from './call-sessions.service.js';

const listQuery = z
  .object({
    direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
    outcome: z
      .enum([
        'INTERESTED',
        'NOT_INTERESTED',
        'CALLBACK_REQUESTED',
        'COMPLETED',
        'OPTED_OUT',
        'TRANSFERRED',
        'INCOMPLETE',
      ])
      .optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

/** Call history (ADR-024, Phase 5). Any account member may read; cross-tenant isolation is enforced in the service. */
@Controller({ path: 'calls' })
export class CallsController {
  constructor(private readonly sessions: CallSessionsService) {}

  @RequirePermission('calls.read')
  @Get()
  list(@CurrentTenant() tenant: TenantPrincipal, @Query() rawQuery: unknown) {
    const parsed = validate(listQuery, rawQuery);
    return this.sessions.list(tenant, {
      ...(parsed.direction ? { direction: parsed.direction } : {}),
      ...(parsed.outcome ? { outcome: parsed.outcome } : {}),
      ...(parsed.cursor ? { cursor: parsed.cursor } : {}),
      ...(parsed.limit ? { limit: parsed.limit } : {}),
    });
  }

  @RequirePermission('calls.read')
  @Get(':id')
  async get(@CurrentTenant() tenant: TenantPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    const row = await this.sessions.get(tenant, id);
    if (!row) throw new NotFoundException();
    return row;
  }
}
