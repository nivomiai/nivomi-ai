import { Inject, Injectable } from '@nestjs/common';
import { callerNumbers, organizations, type Database } from '@nivomi/database';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors.js';
import { isUniqueViolation } from '../common/database-errors.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

const E164 = /^\+[1-9]\d{7,14}$/;
/** Classification stored in `caller_numbers.series` for numbers whose purpose is receiving calls. */
export const INBOUND_SERIES = 'INBOUND';

export interface PlatformVoiceNumberRow {
  readonly id: string;
  readonly phoneE164: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly status: 'ACTIVE' | 'PAUSED' | 'RETIRED';
  readonly statusReason: string | null;
  readonly series: string;
  readonly createdAt: Date;
}

export interface RegisterInput {
  readonly phoneE164: string;
  readonly organizationId: string;
}

/**
 * Super Admin management of the Nivomi-owned ExoPhone pool. Writes caller_numbers with
 * `series = INBOUND`: these numbers are reachable but will not pass the outbound DLT series
 * check at dial time (that's by design — inbound-only). Every change is audited. See ADR-021
 * (telecom identity) and ADR-024 (inbound).
 */
@Injectable()
export class PlatformVoiceNumbersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<readonly PlatformVoiceNumberRow[]> {
    const rows = await this.db
      .select({
        id: callerNumbers.id,
        phoneE164: callerNumbers.phoneE164,
        organizationId: callerNumbers.organizationId,
        status: callerNumbers.status,
        statusReason: callerNumbers.statusReason,
        series: callerNumbers.series,
        createdAt: callerNumbers.createdAt,
      })
      .from(callerNumbers)
      .where(eq(callerNumbers.series, INBOUND_SERIES))
      .orderBy(desc(callerNumbers.createdAt), asc(callerNumbers.id));
    if (rows.length === 0) return [];
    const orgIds = [...new Set(rows.map((r) => r.organizationId))];
    const orgs = await this.db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(inArray(organizations.id, orgIds));
    const byId = new Map(orgs.map((o) => [o.id, o.name]));
    return rows.map((r) => ({ ...r, organizationName: byId.get(r.organizationId) ?? 'Unknown' }));
  }

  async register(
    input: RegisterInput,
    actorUserId: string,
    context: ClientContext,
  ): Promise<PlatformVoiceNumberRow> {
    const phone = input.phoneE164.trim();
    if (!E164.test(phone)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Phone must be in E.164 format, e.g. +919513886363.',
      );
    }
    return this.db.transaction(async (tx) => {
      const [org] = await tx
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .limit(1);
      if (!org) throw new AppError('NOT_FOUND', 'Organization not found.');

      const [existing] = await tx
        .select()
        .from(callerNumbers)
        .where(eq(callerNumbers.phoneE164, phone))
        .limit(1);

      let id: string;
      if (existing) {
        if (existing.organizationId !== org.id) {
          throw new AppError('CONFLICT', 'This number is already assigned to another organization.');
        }
        if (existing.status !== 'RETIRED' && existing.series === INBOUND_SERIES) {
          throw new AppError('CONFLICT', 'This number is already registered for inbound.');
        }
        await tx
          .update(callerNumbers)
          .set({
            status: 'ACTIVE',
            statusReason: null,
            series: INBOUND_SERIES,
            purpose: 'SERVICE',
          })
          .where(eq(callerNumbers.id, existing.id));
        id = existing.id;
      } else {
        try {
          const [row] = await tx
            .insert(callerNumbers)
            .values({
              organizationId: org.id,
              phoneE164: phone,
              series: INBOUND_SERIES,
              purpose: 'SERVICE',
              a2pDeclared: false,
              createdByUserId: actorUserId,
            })
            .returning({ id: callerNumbers.id });
          if (!row) throw new Error('voice number insert returned no row');
          id = row.id;
        } catch (error) {
          if (isUniqueViolation(error)) {
            throw new AppError(
              'CONFLICT',
              'This number is already assigned to another organization.',
            );
          }
          throw error;
        }
      }

      await this.audit.record(
        {
          action: 'platform.voice_number_registered',
          organizationId: org.id,
          actorUserId,
          resourceType: 'caller_number',
          resourceId: id,
          metadata: { phoneE164: phone, mode: 'inbound' },
        },
        context,
        tx,
      );

      const [row] = await tx
        .select({
          id: callerNumbers.id,
          phoneE164: callerNumbers.phoneE164,
          organizationId: callerNumbers.organizationId,
          status: callerNumbers.status,
          statusReason: callerNumbers.statusReason,
          series: callerNumbers.series,
          createdAt: callerNumbers.createdAt,
        })
        .from(callerNumbers)
        .where(eq(callerNumbers.id, id))
        .limit(1);
      if (!row) throw new Error('voice number vanished after insert');
      return { ...row, organizationName: org.name };
    });
  }

  async release(id: string, actorUserId: string, context: ClientContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(callerNumbers)
        .set({ status: 'RETIRED', statusReason: 'Released by platform admin' })
        .where(and(eq(callerNumbers.id, id), eq(callerNumbers.series, INBOUND_SERIES)))
        .returning({
          id: callerNumbers.id,
          organizationId: callerNumbers.organizationId,
          phoneE164: callerNumbers.phoneE164,
        });
      if (!row) throw new AppError('NOT_FOUND', 'Voice number not found.');
      await this.audit.record(
        {
          action: 'platform.voice_number_released',
          organizationId: row.organizationId,
          actorUserId,
          resourceType: 'caller_number',
          resourceId: row.id,
          metadata: { phoneE164: row.phoneE164 },
        },
        context,
        tx,
      );
    });
  }
}
