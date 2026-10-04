import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import {
  CurrentPrincipal,
  RequireSuperAdmin,
  type AuthenticatedRequest,
  type Principal,
} from '../auth/principal.js';
import { clientContext } from '../common/request-context.js';
import { validate } from '../common/validation.js';
import { PlatformOrganizationsService } from './platform-organizations.service.js';

const statusSchema = z.enum(['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'CLOSED']);
const provisionSchema = z.object({
  name: z.string().trim().min(2).max(100),
  role: z.enum(['ORGANIZATION', 'CUSTOM_PLAN']),
  ownerUserId: z.uuid(),
});
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
  status: statusSchema.optional(),
  q: z.string().max(120).optional(),
});
const suspendSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const closeSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

/**
 * Platform Super Admin control plane (PRD FR-113–FR-120). Every endpoint runs after the global
 * rate-limit and origin guards; `@RequireSuperAdmin` refuses tenant members. Every action is
 * audited by the service in the same transaction as the state change.
 */
@RequireSuperAdmin()
@Controller({ path: 'platform' })
export class PlatformOrganizationsController {
  constructor(
    private readonly platform: PlatformOrganizationsService,
    private readonly audit: AuditService,
  ) {}

  @Get('organizations')
  async list(@Query() query: unknown) {
    const { q, ...rest } = validate(listQuerySchema, query);
    return this.platform.list({ ...rest, query: q });
  }

  /** Super Admin provisions an ORGANIZATION or CUSTOM_PLAN account for an existing user. */
  @Post('organizations')
  async provision(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = validate(provisionSchema, body);
    return this.platform.provision(input, principal.userId, clientContext(request));
  }

  @Post('organizations/:id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.platform.approve(id, principal.userId, clientContext(request));
  }

  @Post('organizations/:id/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  async suspend(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const { reason } = validate(suspendSchema, body);
    await this.platform.suspend(id, principal.userId, { reason }, clientContext(request));
  }

  @Post('organizations/:id/reactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivate(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.platform.reactivate(id, principal.userId, clientContext(request));
  }

  @Post('organizations/:id/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const { reason } = validate(closeSchema, body);
    await this.platform.close(id, principal.userId, { reason }, clientContext(request));
  }

  @Get('audit-logs')
  async auditLogs(@Query() query: unknown) {
    return this.audit.listPlatform(validate(auditQuerySchema, query));
  }
}
