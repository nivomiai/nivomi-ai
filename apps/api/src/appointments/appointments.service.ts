import { Inject, Injectable } from '@nestjs/common';
import {
  appointments,
  appointmentSlots,
  type AppointmentChannel,
  type AppointmentSource,
  type AppointmentStatus,
  type Database,
} from '@nivomi/database';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { TenantPrincipal } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import { DATABASE } from '../database/database.module.js';

/**
 * Appointments domain (ADR-025, Phase 6). Nivomi owns the authoritative row; the calendar
 * sync is enqueued on write as a `calendar.sync` outbox job — deferred to the adapter PR per
 * the on-hold rule. Phase 6 lands create/reschedule/cancel + member availability.
 */

export interface CreateAppointmentInput {
  readonly startsAt: Date;
  readonly durationMinutes: number;
  readonly channel: AppointmentChannel;
  readonly locationText?: string | undefined;
  readonly notes?: string | undefined;
  readonly leadId?: string | undefined;
  readonly assigneeUserId?: string | undefined;
  readonly callSessionId?: string | undefined;
  readonly source: AppointmentSource;
  /** Set the FK only when the caller is a real Member (controller sets it; agent tool doesn't). */
  readonly createdByUserId?: string | null | undefined;
}

@Injectable()
export class AppointmentsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(
    principal: TenantPrincipal,
    input: CreateAppointmentInput,
  ): Promise<{ id: string; created: boolean }> {
    if (input.durationMinutes <= 0)
      throw new AppError('VALIDATION_ERROR', 'durationMinutes must be positive');
    // Idempotency: one appointment per call session.
    const [row] = await this.db
      .insert(appointments)
      .values({
        organizationId: principal.membership.organizationId,
        leadId: input.leadId ?? null,
        assigneeUserId: input.assigneeUserId ?? null,
        callSessionId: input.callSessionId ?? null,
        startsAt: input.startsAt,
        durationMinutes: input.durationMinutes,
        channel: input.channel,
        locationText: input.locationText ?? null,
        notes: input.notes ?? null,
        status: 'SCHEDULED',
        source: input.source,
        createdByUserId: input.createdByUserId ?? null,
      })
      // onConflictDoNothing without a target: the partial unique index on call_session_id is the
      // only possible conflict; a non-targeted DO NOTHING matches it. drizzle can't name a
      // partial-index target directly.
      .onConflictDoNothing()
      .returning({ id: appointments.id });
    if (row) return { id: row.id, created: true };
    if (!input.callSessionId)
      throw new AppError('CONFLICT', 'appointment conflict without an idempotency key');
    const [existing] = await this.db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.callSessionId, input.callSessionId),
          eq(appointments.organizationId, principal.membership.organizationId),
        ),
      );
    if (!existing)
      throw new AppError('CONFLICT', 'appointment insert conflicted but no row was found');
    return { id: existing.id, created: false };
  }

  async reschedule(
    principal: TenantPrincipal,
    id: string,
    newStartsAt: Date,
    newDurationMinutes?: number,
  ): Promise<void> {
    const updates: { startsAt: Date; durationMinutes?: number } = { startsAt: newStartsAt };
    if (newDurationMinutes !== undefined) {
      if (newDurationMinutes <= 0)
        throw new AppError('VALIDATION_ERROR', 'durationMinutes must be positive');
      updates.durationMinutes = newDurationMinutes;
    }
    const rows = await this.db
      .update(appointments)
      .set(updates)
      .where(
        and(
          eq(appointments.id, id),
          eq(appointments.organizationId, principal.membership.organizationId),
          sql`${appointments.status} IN ('SCHEDULED', 'CONFIRMED')`,
        ),
      )
      .returning({ id: appointments.id });
    if (rows.length === 0)
      throw new AppError('NOT_FOUND', 'appointment not found or already closed');
  }

  async cancel(principal: TenantPrincipal, id: string): Promise<void> {
    const rows = await this.db
      .update(appointments)
      .set({ status: 'CANCELLED' })
      .where(
        and(
          eq(appointments.id, id),
          eq(appointments.organizationId, principal.membership.organizationId),
          sql`${appointments.status} IN ('SCHEDULED', 'CONFIRMED')`,
        ),
      )
      .returning({ id: appointments.id });
    if (rows.length === 0)
      throw new AppError('NOT_FOUND', 'appointment not found or already closed');
  }

  async list(
    principal: TenantPrincipal,
    query: { from?: Date; to?: Date; status?: AppointmentStatus } = {},
  ): Promise<Array<{
    id: string;
    startsAt: Date;
    durationMinutes: number;
    channel: AppointmentChannel;
    status: AppointmentStatus;
    assigneeUserId: string | null;
    leadId: string | null;
  }>> {
    const conds = [eq(appointments.organizationId, principal.membership.organizationId)];
    if (query.from) conds.push(gte(appointments.startsAt, query.from));
    if (query.to) conds.push(lt(appointments.startsAt, query.to));
    if (query.status) conds.push(eq(appointments.status, query.status));
    return this.db
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        durationMinutes: appointments.durationMinutes,
        channel: appointments.channel,
        status: appointments.status,
        assigneeUserId: appointments.assigneeUserId,
        leadId: appointments.leadId,
      })
      .from(appointments)
      .where(and(...conds))
      .orderBy(desc(appointments.startsAt))
      .limit(100);
  }

  async setSlots(
    principal: TenantPrincipal,
    userId: string,
    slots: ReadonlyArray<{
      dayOfWeek: number;
      startsAtMinutes: number;
      endsAtMinutes: number;
      timezone: string;
    }>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(appointmentSlots)
        .where(
          and(
            eq(appointmentSlots.organizationId, principal.membership.organizationId),
            eq(appointmentSlots.userId, userId),
          ),
        );
      if (slots.length === 0) return;
      await tx.insert(appointmentSlots).values(
        slots.map((s) => ({
          organizationId: principal.membership.organizationId,
          userId,
          dayOfWeek: s.dayOfWeek,
          startsAtMinutes: s.startsAtMinutes,
          endsAtMinutes: s.endsAtMinutes,
          timezone: s.timezone,
        })),
      );
    });
  }

  getSlots(
    principal: TenantPrincipal,
    userId: string,
  ): Promise<
    Array<{ dayOfWeek: number; startsAtMinutes: number; endsAtMinutes: number; timezone: string }>
  > {
    return this.db
      .select({
        dayOfWeek: appointmentSlots.dayOfWeek,
        startsAtMinutes: appointmentSlots.startsAtMinutes,
        endsAtMinutes: appointmentSlots.endsAtMinutes,
        timezone: appointmentSlots.timezone,
      })
      .from(appointmentSlots)
      .where(
        and(
          eq(appointmentSlots.organizationId, principal.membership.organizationId),
          eq(appointmentSlots.userId, userId),
        ),
      );
  }
}
