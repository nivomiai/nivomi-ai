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
  CurrentPrincipal,
  RequireSuperAdmin,
  type AuthenticatedRequest,
  type Principal,
} from '../auth/principal.js';
import { clientContext } from '../common/request-context.js';
import { validate } from '../common/validation.js';
import { PlatformPlansService } from './platform-plans.service.js';

const planStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
// Keys validated against UsageEventKind in the service; the schema stays permissive so new usage
// kinds don't require a controller change.
const usageKindsSchema = z.record(z.string(), z.number().int().nonnegative()).default({});

const basePlanSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'code must be lower-case letters, digits or dashes'),
  name: z.string().trim().min(2).max(80),
  monthlyPaiseInr: z.number().int().nonnegative(),
  /** 0..10000 basis points (0..100%). Default 2000 = 20% off the annual total. */
  annualDiscountBps: z.number().int().min(0).max(10000).default(2000),
  limits: usageKindsSchema,
  overageRates: usageKindsSchema,
  status: planStatusSchema.default('ACTIVE'),
  displayOrder: z.number().int().min(0).max(1000).default(0),
});

const createSchema = basePlanSchema;
const updateSchema = basePlanSchema.extend({ expectedVersion: z.string().min(10) });

/**
 * Super-admin plans CRUD. Companion to the per-tenant /billing endpoints — this edits the
 * platform-wide `plans` catalogue the marketing site and super admin UI both read from.
 */
@RequireSuperAdmin()
@Controller({ path: 'platform/plans' })
export class PlatformPlansController {
  constructor(private readonly svc: PlatformPlansService) {}

  @Get()
  async list() {
    const items = await this.svc.list();
    return { items };
  }

  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = validate(createSchema, body);
    return this.svc.create(input, principal.userId, clientContext(request));
  }

  @Put(':id')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = validate(updateSchema, body);
    return this.svc.update(id, input, principal.userId, clientContext(request));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.svc.archive(id, principal.userId, clientContext(request));
  }
}
