import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { consentBases, dataSources, leadStatuses } from '@nivomi/database';
import { z } from 'zod';
import {
  CurrentTenant,
  RequirePermission,
  type AuthenticatedRequest,
  type TenantPrincipal,
} from '../auth/principal.js';
import { clientContext } from '../common/request-context.js';
import { validate } from '../common/validation.js';
import { LeadExportsService, MAX_EXPORT_ROWS } from './lead-exports.js';
import { LEAD_SORTS, LeadsService } from './leads.service.js';

const text = (max: number) => z.string().max(max).nullish();

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
  search: z.string().max(100).optional(),
  status: z.enum(leadStatuses).optional(),
  source: z.enum(dataSources).optional(),
  consent: z.enum(['with_basis', 'missing']).optional(),
  owner: z.enum(['me', 'unassigned']).optional(),
});

const createSchema = z.object({
  fullName: text(200),
  firstName: text(100),
  lastName: text(100),
  phone: z.string().min(1).max(40),
  email: text(254),
  company: text(200),
  jobTitle: text(200),
  city: text(100),
  state: text(100),
  country: text(100),
  preferredLanguage: text(50),
  leadStatus: z.enum(leadStatuses).nullish(),
  consentBasis: z.enum(consentBases).nullish(),
  consentAt: text(40),
  consentSource: text(200),
  consentReference: text(200),
  ownerUserId: z.uuid().nullish(),
  customFields: z.record(z.string().max(60), z.string().max(500)).optional(),
});

const updateSchema = z
  .object({
    fullName: z.string().max(200),
    email: z.string().max(254).nullable(),
    phone: z.string().min(1).max(40),
    company: z.string().max(200).nullable(),
    jobTitle: z.string().max(200).nullable(),
    city: z.string().max(100).nullable(),
    state: z.string().max(100).nullable(),
    country: z.string().max(100).nullable(),
    preferredLanguage: z.string().max(50).nullable(),
    ownerUserId: z.uuid().nullable(),
  })
  .partial();

const pageListSchema = listSchema.omit({ limit: true, cursor: true }).extend({
  page: z.coerce.number().int().min(1).max(10_000),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(LEAD_SORTS).default('created'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/** Bulk actions act on the rows a member ticked: at most one page of the table. */
const leadIdsSchema = z.array(z.uuid()).min(1).max(100);

const bulkStatusSchema = z.object({ leadIds: leadIdsSchema, status: z.enum(leadStatuses) });

const bulkSuppressSchema = z.object({
  leadIds: leadIdsSchema,
  reason: z.string().max(500).nullish(),
});

const exportSchema = z.union([
  z.object({ leadIds: z.array(z.uuid()).min(1).max(MAX_EXPORT_ROWS) }),
  z.object({
    filters: listSchema.pick({
      search: true,
      status: true,
      source: true,
      consent: true,
      owner: true,
    }),
  }),
]);

const statusSchema = z.object({
  status: z.enum(leadStatuses),
  reason: z.string().max(500).nullish(),
});

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

const suppressionSchema = z.object({
  phone: z.string().min(1).max(40),
  reason: z.string().max(500).nullish(),
});

const resolveSchema = z.object({
  action: z.enum(['CREATE_NEW', 'MERGE', 'DISCARD']),
  contactId: z.uuid().optional(),
});

@Controller({ path: 'leads' })
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly exports: LeadExportsService,
  ) {}

  /** `?page=` returns a numbered, sortable page with a total; otherwise keyset pages. */
  @RequirePermission('leads.read')
  @Get()
  list(@CurrentTenant() tenant: TenantPrincipal, @Query() query: unknown) {
    if (query && typeof query === 'object' && 'page' in query) {
      return this.leads.listPage(tenant, validate(pageListSchema, query));
    }
    return this.leads.list(tenant, validate(listSchema, query));
  }

  /** Same `Idempotency-Key` → the same per-lead status events (no double transitions). */
  @RequirePermission('leads.write')
  @Post('bulk/status')
  @HttpCode(HttpStatus.OK)
  bulkStatus(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.leads.bulkChangeStatus(
      tenant,
      { ...validate(bulkStatusSchema, body), idempotencyKey: idempotencyKey ?? null },
      clientContext(request),
    );
  }

  /** Adding a number that is already suppressed is a no-op, so retries are safe. */
  @RequirePermission('suppression.manage')
  @Post('bulk/suppress')
  @HttpCode(HttpStatus.OK)
  bulkSuppress(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.leads.bulkSuppress(
      tenant,
      validate(bulkSuppressSchema, body),
      clientContext(request),
    );
  }

  /** Queues a CSV export of the ticked leads, or of everything matching the filters. */
  @RequirePermission('leads.export')
  @Post('exports')
  requestExport(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.exports.request(tenant, validate(exportSchema, body), clientContext(request));
  }

  @RequirePermission('leads.export')
  @Get('exports/:exportId')
  getExport(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
  ) {
    return this.exports.get(tenant, exportId);
  }

  @RequirePermission('leads.export')
  @Get('exports/:exportId/file')
  @Header('Cache-Control', 'no-store')
  async downloadExport(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.exports.download(tenant, exportId, clientContext(request));
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return new StreamableFile(file.content);
  }

  @RequirePermission('leads.write')
  @Post()
  create(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.leads.create(tenant, validate(createSchema, body), clientContext(request));
  }

  @RequirePermission('leads.read')
  @Get(':id')
  get(@CurrentTenant() tenant: TenantPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.leads.get(tenant, id);
  }

  @RequirePermission('leads.write')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.leads.update(tenant, id, validate(updateSchema, body), clientContext(request));
  }

  /** `Idempotency-Key` makes a retried request produce one transition (FR-24). */
  @RequirePermission('leads.write')
  @Post(':id/status')
  changeStatus(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.leads.changeStatus(
      tenant,
      id,
      { ...validate(statusSchema, body), idempotencyKey: idempotencyKey ?? null },
      clientContext(request),
    );
  }
}

@Controller({ path: 'suppression' })
export class SuppressionController {
  constructor(private readonly leads: LeadsService) {}

  @RequirePermission('leads.read')
  @Get()
  list(@CurrentTenant() tenant: TenantPrincipal, @Query() query: unknown) {
    return this.leads.listSuppression(tenant, validate(pageSchema, query));
  }

  @RequirePermission('suppression.manage')
  @Post()
  add(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.leads.addSuppression(
      tenant,
      validate(suppressionSchema, body),
      clientContext(request),
    );
  }

  @RequirePermission('suppression.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.leads.removeSuppression(tenant, id, clientContext(request));
  }
}

@Controller({ path: 'ingestion/reviews' })
export class ReviewController {
  constructor(private readonly leads: LeadsService) {}

  @RequirePermission('imports.manage')
  @Get()
  list(@CurrentTenant() tenant: TenantPrincipal, @Query() query: unknown) {
    return this.leads.listReviewItems(tenant, validate(pageSchema, query));
  }

  @RequirePermission('imports.manage')
  @Post(':id/resolve')
  resolve(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.leads.resolveReviewItem(
      tenant,
      id,
      validate(resolveSchema, body),
      clientContext(request),
    );
  }
}
