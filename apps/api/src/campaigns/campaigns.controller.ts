import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { callCategories, campaignLeadStates, dataSources, leadStatuses } from '@nivomi/database';
import { z } from 'zod';
import {
  CurrentTenant,
  RequirePermission,
  type AuthenticatedRequest,
  type TenantPrincipal,
} from '../auth/principal.js';
import { clientContext } from '../common/request-context.js';
import { validate } from '../common/validation.js';
import { PACING_LIMITS, RETRY_LIMITS } from './campaign-policy.js';
import { CampaignsService } from './campaigns.service.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:MM');

const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(['STATIC', 'CONTINUOUS']).default('STATIC'),
  callCategory: z.enum(callCategories),
  callerNumberId: z.uuid().nullable().default(null),
  agentVersionId: z.uuid().nullable().default(null),
  selection: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('FILTER'),
      statuses: z.array(z.enum(leadStatuses)).max(leadStatuses.length).optional(),
      sources: z.array(z.enum(dataSources)).max(dataSources.length).optional(),
    }),
    z.object({ kind: z.literal('LIST'), leadIds: z.array(z.uuid()).min(1).max(5_000) }),
  ]),
  windowStart: hhmm.default('10:00'),
  windowEnd: hhmm.default('19:00'),
  startsAt: z.string().max(40).nullable().default(null),
  endsAt: z.string().max(40).nullable().default(null),
  maxConcurrentCalls: z.number().int().min(1).max(PACING_LIMITS.maxConcurrentCalls).default(2),
  maxCallsPerHour: z.number().int().min(1).max(PACING_LIMITS.maxCallsPerHour).default(60),
  maxAttempts: z.number().int().min(1).max(10).default(RETRY_LIMITS.maxAttempts),
  retryIntervalMinutes: z
    .number()
    .int()
    .min(1)
    .max(7 * 24 * 60)
    .default(RETRY_LIMITS.minRetryIntervalMinutes),
  maxAttemptsPerDay: z.number().int().min(1).max(10).default(RETRY_LIMITS.maxAttemptsPerDay),
  budgetMinutes: z.number().int().min(1).max(1_000_000),
});

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
});
const leadPageSchema = pageSchema.extend({ state: z.enum(campaignLeadStates).optional() });
const stopSchema = z.object({ reason: z.string().max(500).nullish() });
const resolveSchema = z.object({
  action: z.enum(['RECHECK', 'EXCLUDE', 'RECORD_CONSENT_DATE']),
  consentAt: z.string().max(40).nullish(),
  note: z.string().max(500).nullish(),
});

/** Campaigns (PRD FR-35–FR-43). Every state change is audited. */
@Controller({ path: 'campaigns' })
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @RequirePermission('campaigns.read')
  @Get()
  list(@CurrentTenant() tenant: TenantPrincipal, @Query() query: unknown) {
    return this.campaigns.list(tenant, validate(pageSchema, query));
  }

  @RequirePermission('campaigns.manage')
  @Post()
  create(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.campaigns.create(tenant, validate(campaignSchema, body), clientContext(request));
  }

  /** FR-43: stops all dialling for the Organization. */
  @RequirePermission('campaigns.emergency_stop')
  @Post('emergency-stop')
  emergencyStop(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason } = validate(stopSchema, body ?? {});
    return this.campaigns.emergencyStop(tenant, reason ?? null, clientContext(request));
  }

  /** Releases the stop; campaigns stay paused until each is resumed. */
  @RequirePermission('campaigns.emergency_stop')
  @Delete('emergency-stop')
  @HttpCode(HttpStatus.NO_CONTENT)
  async release(
    @CurrentTenant() tenant: TenantPrincipal,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.campaigns.releaseEmergencyStop(tenant, clientContext(request));
  }

  @RequirePermission('campaigns.read')
  @Get(':id')
  get(@CurrentTenant() tenant: TenantPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.campaigns.get(tenant, id);
  }

  @RequirePermission('campaigns.manage')
  @Put(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.campaigns.update(tenant, id, validate(campaignSchema, body), clientContext(request));
  }

  @RequirePermission('campaigns.read')
  @Get(':id/attempts')
  attempts(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    return this.campaigns.attempts(tenant, id, validate(pageSchema, query));
  }

  @RequirePermission('campaigns.read')
  @Get(':id/leads')
  leads(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    return this.campaigns.campaignLeadList(tenant, id, validate(leadPageSchema, query));
  }

  @RequirePermission('campaigns.manage')
  @Post(':id/prelaunch-check')
  @HttpCode(HttpStatus.ACCEPTED)
  async prelaunch(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.campaigns.requestPrelaunch(tenant, id, clientContext(request));
  }

  @RequirePermission('campaigns.manage')
  @Post(':id/:action')
  @HttpCode(HttpStatus.NO_CONTENT)
  async transition(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('action') action: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const context = clientContext(request);
    const run = {
      launch: () => this.campaigns.launch(tenant, id, context),
      pause: () => this.campaigns.pause(tenant, id, context),
      resume: () => this.campaigns.resume(tenant, id, context),
      stop: () => this.campaigns.stop(tenant, id, context),
      cancel: () => this.campaigns.cancel(tenant, id, context),
    }[validate(z.enum(['launch', 'pause', 'resume', 'stop', 'cancel']), action)];
    await run();
  }
}

/** The REQUIRES_REVIEW queue (FR-50): OWNER and ADMIN only. */
@Controller({ path: 'compliance/reviews' })
export class ReviewsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @RequirePermission('compliance.review')
  @Get()
  list(@CurrentTenant() tenant: TenantPrincipal, @Query() query: unknown) {
    return this.campaigns.listReviews(tenant, validate(pageSchema, query));
  }

  @RequirePermission('compliance.review')
  @Post(':id/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resolve(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.campaigns.resolveReview(
      tenant,
      id,
      validate(resolveSchema, body),
      clientContext(request),
    );
  }
}
