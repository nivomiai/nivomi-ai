import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentTenant, RequirePermission, type TenantPrincipal } from '../auth/principal.js';
import { validate } from '../common/validation.js';
import { AppointmentsService } from './appointments.service.js';

const channel = z.enum(['CALL', 'IN_PERSON', 'VIDEO']);
const source = z.enum(['AI_CALL', 'MANUAL', 'INBOUND', 'IMPORT']);

const createSchema = z.object({
  startsAt: z.coerce.date(),
  durationMinutes: z.number().int().positive().max(480),
  channel,
  locationText: z.string().max(500).optional(),
  notes: z.string().max(2_000).optional(),
  leadId: z.uuid().optional(),
  assigneeUserId: z.uuid().optional(),
  callSessionId: z.uuid().optional(),
  source: source.default('MANUAL'),
});

const rescheduleSchema = z.object({
  startsAt: z.coerce.date(),
  durationMinutes: z.number().int().positive().max(480).optional(),
});

const listQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']).optional(),
});

const slotsSchema = z.object({
  slots: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startsAtMinutes: z.number().int().min(0).max(1440),
        endsAtMinutes: z.number().int().min(0).max(1440),
        timezone: z.string().min(1).max(64),
      }),
    )
    .max(50),
});

@Controller({ path: 'appointments' })
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}

  @RequirePermission('appointments.read')
  @Get()
  list(@CurrentTenant() tenant: TenantPrincipal, @Query() rawQuery: unknown) {
    const parsed = validate(listQuery, rawQuery);
    return this.svc.list(tenant, {
      ...(parsed.from ? { from: parsed.from } : {}),
      ...(parsed.to ? { to: parsed.to } : {}),
      ...(parsed.status ? { status: parsed.status } : {}),
    });
  }

  @RequirePermission('appointments.manage')
  @Post()
  create(@CurrentTenant() tenant: TenantPrincipal, @Body() body: unknown) {
    const parsed = validate(createSchema, body);
    return this.svc.create(tenant, { ...parsed, createdByUserId: tenant.userId });
  }

  @RequirePermission('appointments.manage')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reschedule(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const parsed = validate(rescheduleSchema, body);
    await this.svc.reschedule(tenant, id, parsed.startsAt, parsed.durationMinutes);
  }

  @RequirePermission('appointments.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@CurrentTenant() tenant: TenantPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    await this.svc.cancel(tenant, id);
  }
}

@Controller({ path: 'users' })
export class AvailabilityController {
  constructor(private readonly svc: AppointmentsService) {}

  @RequirePermission('appointments.manage')
  @Put(':userId/slots')
  async setSlots(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ) {
    const parsed = validate(slotsSchema, body);
    await this.svc.setSlots(tenant, userId, parsed.slots);
    return { ok: true };
  }

  @RequirePermission('appointments.read')
  @Get(':userId/slots')
  getSlots(
    @CurrentTenant() tenant: TenantPrincipal,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.svc.getSlots(tenant, userId);
  }
}
