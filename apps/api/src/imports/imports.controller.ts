import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { consentBases } from '@nivomi/database';
import type { Response } from 'express';
import { isSupportedCountry } from 'libphonenumber-js';
import { z } from 'zod';
import {
  CurrentTenant,
  RequirePermission,
  type AuthenticatedRequest,
  type TenantPrincipal,
} from '../auth/principal.js';
import { clientContext } from '../common/request-context.js';
import { validate } from '../common/validation.js';
import { DEFAULT_COUNTRY } from '../leads/normalize.js';
import { ImportsService } from './imports.service.js';

const createSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  fileSize: z.number().int().positive(),
});

const mappingSchema = z.object({
  mapping: z.record(z.string().max(200), z.string().max(80)),
  defaultCountry: z
    .string()
    .length(2)
    .transform((c) => c.toUpperCase())
    .refine((c) => isSupportedCountry(c), 'is not a supported country code')
    .default(DEFAULT_COUNTRY),
  consentDefault: z
    .object({
      basis: z.enum(consentBases),
      source: z.string().max(200).nullish(),
      reference: z.string().max(200).nullish(),
      attested: z.boolean(),
    })
    .nullable()
    .default(null),
});

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
});

@Controller({ path: 'imports' })
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @RequirePermission('imports.manage')
  @Get()
  list(@CurrentTenant() tenant: TenantPrincipal, @Query() query: unknown) {
    return this.imports.list(tenant, validate(pageSchema, query));
  }

  @RequirePermission('imports.manage')
  @Get('fields')
  fields() {
    return { items: this.imports.fields() };
  }

  @RequirePermission('imports.manage')
  @Post()
  create(
    @CurrentTenant() tenant: TenantPrincipal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.imports.create(tenant, validate(createSchema, body), clientContext(request));
  }

  @RequirePermission('imports.manage')
  @Get(':id')
  get(@CurrentTenant() tenant: TenantPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.imports.get(tenant, id);
  }

  @RequirePermission('imports.manage')
  @Post(':id/uploaded')
  @HttpCode(HttpStatus.OK)
  uploaded(@CurrentTenant() tenant: TenantPrincipal, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.imports.markUploaded(tenant, id);
  }

  @RequirePermission('imports.manage')
  @Put(':id/mapping')
  mapping(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.imports.setMapping(tenant, id, validate(mappingSchema, body));
  }

  @RequirePermission('imports.manage')
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.imports.confirm(tenant, id, clientContext(request));
  }

  @RequirePermission('imports.manage')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.imports.cancel(tenant, id, clientContext(request));
  }

  @RequirePermission('imports.manage')
  @Get(':id/error-report')
  @Header('Cache-Control', 'no-store')
  async errorReport(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const report = await this.imports.errorReport(tenant, id, clientContext(request));
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
    return report.content;
  }
}
