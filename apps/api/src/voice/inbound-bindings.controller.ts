import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import {
  CurrentTenant,
  RequirePermission,
  type AuthenticatedRequest,
  type TenantPrincipal,
} from '../auth/principal.js';
import { clientContext } from '../common/request-context.js';
import { validate } from '../common/validation.js';
import { InboundBindingsService } from './inbound-bindings.service.js';

const upsertSchema = z
  .object({
    mode: z.enum(['AI', 'HUMAN']),
    agentVersionId: z.uuid().nullable().optional(),
    handoffE164: z.string().min(6).max(20).nullable().optional(),
  })
  .strict();

/**
 * Per-caller-number inbound config (ADR-024 §1, §6). Reads and writes are tenant-scoped by the
 * service. The write path is PUT (not POST) because it is an upsert on the (caller_number_id)
 * unique index — repeated calls with the same body are idempotent.
 */
@Controller({ path: 'caller-numbers/:id/inbound-config' })
export class InboundBindingsController {
  constructor(private readonly bindings: InboundBindingsService) {}

  @RequirePermission('telecom.read')
  @Get()
  get(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.bindings.get(tenant, id);
  }

  @RequirePermission('telecom.manage')
  @Put()
  async upsert(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsed = validate(upsertSchema, body);
    return this.bindings.upsert(
      tenant,
      id,
      {
        mode: parsed.mode,
        agentVersionId: parsed.agentVersionId ?? null,
        handoffE164: parsed.handoffE164 ?? null,
      },
      clientContext(request),
    );
  }

  @RequirePermission('telecom.manage')
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.bindings.delete(tenant, id, clientContext(request));
  }
}
