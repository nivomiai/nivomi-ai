import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { businessSectors, consentBases } from '@nivomi/database';
import { z } from 'zod';
import {
  CurrentPrincipal,
  CurrentTenant,
  RequirePermission,
  RequireSuperAdmin,
  type AuthenticatedRequest,
  type Principal,
  type TenantPrincipal,
} from '../auth/principal.js';
import { clientContext } from '../common/request-context.js';
import { validate } from '../common/validation.js';
import { CallingControlsService } from './calling-controls.service.js';
import { ConsentService } from './consent.service.js';
import { RuleSetRegistry } from './rule-set-registry.js';
import { TelecomIdentityService } from './telecom-identity.service.js';

const text = (max: number) => z.string().max(max).nullish();
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

const complaintSchema = z.object({
  kind: z.enum(['COMPLAINT', 'OPERATOR_FLAG']),
  callerNumberId: z.uuid().nullish(),
  leadId: z.uuid().nullish(),
  receivedAt: text(40),
  reference: text(200),
  note: text(1000),
});

const identitySchema = z
  .object({
    legalName: text(200),
    dltEntityId: text(100),
    telemarketerName: text(200),
    telemarketerRegistrationId: text(100),
    sector: z.enum(businessSectors).nullish(),
    a2pDeclarationReference: text(200),
    a2pDeclaredAt: text(40),
    selfCertifiedAt: text(40),
  })
  .partial();

const numberSchema = z.object({
  phone: z.string().min(3).max(30),
  purpose: z.enum(['PROMOTIONAL', 'SERVICE']),
  a2pDeclared: z.boolean(),
});

const consentSchema = z.object({
  ledger: z.enum(['TELECOM', 'DPDP']),
  kind: z.enum(['GRANT', 'REVOCATION']),
  basis: z.enum(consentBases).nullish(),
  purpose: text(200),
  noticeVersion: text(100),
  evidenceAt: text(40),
  evidenceSource: text(200),
  reference: text(200),
  operatorConsentReference: text(200),
  recipientInitiated: z.boolean().optional(),
  note: text(500),
});

const reviewSchema = z.object({ approve: z.boolean(), reason: text(500) });
const noteSchema = z.object({ note: text(500) });

/** Rule sets, calling controls, complaint records and the complaint breaker (FR-46, FR-49). */
@Controller({ path: 'compliance' })
export class ComplianceController {
  constructor(
    private readonly rules: RuleSetRegistry,
    private readonly controls: CallingControlsService,
  ) {}

  /** Every Rule Set version, with its status, sources and data (transparency, FR-46). */
  @RequirePermission('compliance.read')
  @Get('rule-sets')
  async ruleSets() {
    return {
      items: (await this.rules.list()).map((r) => ({
        id: r.id,
        jurisdiction: r.jurisdiction,
        version: r.version,
        status: r.status,
        pendingLegalReview: r.status === 'DRAFT',
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        reviewNote: r.reviewNote,
        sources: r.sources,
        rules: r.rules,
      })),
    };
  }

  @RequirePermission('compliance.read')
  @Get('controls')
  getControls(@CurrentTenant() tenant: TenantPrincipal) {
    return this.controls.get(tenant.membership.organizationId);
  }

  @RequirePermission('compliance.review')
  @Get('complaints')
  complaints(@CurrentTenant() tenant: TenantPrincipal, @Query() query: unknown) {
    return this.controls.listComplaints(tenant, validate(pageSchema, query));
  }

  @RequirePermission('compliance.review')
  @Post('complaints')
  recordComplaint(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.controls.recordComplaint(
      tenant,
      validate(complaintSchema, body),
      clientContext(request),
    );
  }

  @RequirePermission('compliance.review')
  @Post('breaker/acknowledge')
  @HttpCode(HttpStatus.NO_CONTENT)
  async acknowledge(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    const { note } = validate(noteSchema, body ?? {});
    await this.controls.acknowledgeBreaker(tenant, note ?? null, clientContext(request));
  }
}

/** Telecom Identity and Caller Numbers (FR-9–FR-13). */
@Controller({ path: 'telecom-identity' })
export class TelecomIdentityController {
  constructor(private readonly identity: TelecomIdentityService) {}

  @RequirePermission('telecom.read')
  @Get()
  get(@CurrentTenant() tenant: TenantPrincipal) {
    return this.identity.get(tenant.membership.organizationId);
  }

  @RequirePermission('telecom.manage')
  @Put()
  update(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.identity.update(tenant, validate(identitySchema, body), clientContext(request));
  }

  @RequirePermission('telecom.manage')
  @Post('submit')
  submit(@CurrentTenant() tenant: TenantPrincipal, @Req() request: AuthenticatedRequest) {
    return this.identity.submit(tenant, clientContext(request));
  }

  @RequirePermission('telecom.manage')
  @Post('numbers')
  addNumber(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.identity.addNumber(tenant, validate(numberSchema, body), clientContext(request));
  }

  @RequirePermission('telecom.manage')
  @Delete('numbers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeNumber(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.identity.removeNumber(tenant, id, clientContext(request));
  }
}

/** A lead's two consent ledgers (FR-52). */
@Controller({ path: 'leads/:leadId/consents' })
export class ConsentController {
  constructor(private readonly consents: ConsentService) {}

  @RequirePermission('leads.read')
  @Get()
  list(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
  ) {
    return this.consents.list(tenant, leadId);
  }

  /** `Idempotency-Key` makes a retried request record one entry. */
  @RequirePermission('consent.manage')
  @Post()
  record(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.consents.record(
      tenant,
      leadId,
      { ...validate(consentSchema, body), idempotencyKey: idempotencyKey ?? null },
      clientContext(request),
    );
  }
}

/**
 * Platform Super Admin actions on an Organization's compliance state. API only until the Super
 * Admin console (Phase 9); every action is audited.
 */
@Controller({ path: 'platform/organizations/:organizationId' })
export class PlatformComplianceController {
  constructor(
    private readonly identity: TelecomIdentityService,
    private readonly controls: CallingControlsService,
  ) {}

  @RequireSuperAdmin()
  @Post('telecom-identity/review')
  review(
    @CurrentPrincipal() principal: Principal,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.identity.review(
      organizationId,
      validate(reviewSchema, body),
      principal.userId,
      clientContext(request),
    );
  }

  @RequireSuperAdmin()
  @Post('complaint-breaker/clear')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearBreaker(
    @CurrentPrincipal() principal: Principal,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.controls.clearBreaker(organizationId, principal.userId, clientContext(request));
  }
}
