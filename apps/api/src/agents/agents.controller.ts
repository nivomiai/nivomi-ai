import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { AGENT_TOOLS } from './agent-definition.js';
import { AgentsService } from './agents.service.js';

const category = z.enum(['PROMOTIONAL', 'SERVICE']);
const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  callCategory: category,
  purpose: z.string().max(300).nullish(),
});
/** The definition's shape is checked by the agent schema in the service (detailed errors). */
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  callCategory: category.optional(),
  definition: z.unknown().optional(),
});
const startTestSchema = z.object({ versionId: z.uuid().nullish() });
const turnSchema = z.object({
  turn: z.number().int().min(1).max(1_000),
  text: z.string().trim().min(1).max(1_000),
});

/** AI Agents (PRD FR-26–FR-32, ADR-022). MANAGER and above build; ANALYST reads. */
@Controller({ path: 'agents' })
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @RequirePermission('agents.read')
  @Get()
  list(@CurrentTenant() tenant: TenantPrincipal) {
    return this.agents.list(tenant);
  }

  /** The platform tool registry an agent's allowlist chooses from. */
  @RequirePermission('agents.read')
  @Get('tools')
  tools() {
    return {
      items: Object.entries(AGENT_TOOLS).map(([name, tool]) => ({ name, ...tool })),
    };
  }

  @RequirePermission('agents.manage')
  @Post()
  create(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.agents.create(tenant, validate(createSchema, body), clientContext(request));
  }

  @RequirePermission('agents.read')
  @Get(':id')
  get(@CurrentTenant() tenant: TenantPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.agents.get(tenant, id);
  }

  @RequirePermission('agents.manage')
  @Put(':id')
  update(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.agents.update(tenant, id, validate(updateSchema, body), clientContext(request));
  }

  @RequirePermission('agents.manage')
  @Post(':id/publish')
  publish(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.agents.publish(tenant, id, clientContext(request));
  }

  @RequirePermission('agents.manage')
  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.agents.archive(tenant, id, clientContext(request));
  }

  @RequirePermission('agents.read')
  @Get(':id/versions/:versionId')
  version(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
  ) {
    return this.agents.version(tenant, id, versionId);
  }

  @RequirePermission('agents.manage')
  @Post(':id/test-sessions')
  startTest(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.agents.startTest(
      tenant,
      id,
      validate(startTestSchema, body ?? {}),
      clientContext(request),
    );
  }

  @RequirePermission('agents.manage')
  @Get(':id/test-sessions/:sessionId')
  getTest(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.agents.getTest(tenant, id, sessionId);
  }

  @RequirePermission('agents.manage')
  @Post(':id/test-sessions/:sessionId/turns')
  @HttpCode(HttpStatus.OK)
  turn(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: unknown,
  ) {
    return this.agents.testTurn(tenant, id, sessionId, validate(turnSchema, body));
  }
}
