import { Inject, Injectable } from '@nestjs/common';
import {
  callerNumbers,
  complaintRecords,
  organizationCallingControls,
  type Database,
} from '@nivomi/database';
import { and, desc, eq, gte, lt, or } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { TenantPrincipal } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import { decodeCursor, toPage } from '../common/pagination.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { cleanText } from '../leads/normalize.js';
import { Clock } from './clock.js';
import { complaintBreakerTrips } from './compliance-engine.js';
import { RuleSetRegistry } from './rule-set-registry.js';

export type CallingControls = typeof organizationCallingControls.$inferSelect;

const DAY_MS = 86_400_000;

/** Reads the controls row, or the defaults when the Organization has none yet. */
export async function callingControls(
  db: Database,
  organizationId: string,
): Promise<CallingControls> {
  const [row] = await db
    .select()
    .from(organizationCallingControls)
    .where(eq(organizationCallingControls.organizationId, organizationId))
    .limit(1);
  return (
    row ?? {
      organizationId,
      defaultJurisdiction: 'IN',
      emergencyStopActive: false,
      emergencyStoppedAt: null,
      emergencyStoppedByUserId: null,
      emergencyStopReason: null,
      breakerTrippedAt: null,
      breakerReason: null,
      breakerAcknowledgedAt: null,
      breakerAcknowledgedByUserId: null,
      updatedAt: new Date(0),
    }
  );
}

/** Creates the row if needed and locks it for the rest of the transaction. */
export async function lockCallingControls(db: Database, organizationId: string) {
  await db.insert(organizationCallingControls).values({ organizationId }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(organizationCallingControls)
    .where(eq(organizationCallingControls.organizationId, organizationId))
    .for('update');
  if (!row) throw new Error('calling controls row missing');
  return row;
}

/**
 * Emergency Stop flag (FR-43) and the complaint breaker (FR-49). Pausing campaigns is the
 * campaigns module's job; both flags are also inputs to every eligibility decision, so no dial
 * passes while they are set.
 */
@Injectable()
export class CallingControlsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly rules: RuleSetRegistry,
    private readonly clock: Clock,
  ) {}

  async get(organizationId: string) {
    const controls = await callingControls(this.db, organizationId);
    const ruleSet = await this.rules.active(controls.defaultJurisdiction, this.clock.now());
    return {
      defaultJurisdiction: controls.defaultJurisdiction,
      emergencyStop: {
        active: controls.emergencyStopActive,
        at: controls.emergencyStoppedAt,
        reason: controls.emergencyStopReason,
      },
      breaker: {
        tripped: controls.breakerTrippedAt !== null,
        at: controls.breakerTrippedAt,
        reason: controls.breakerReason,
        acknowledgedAt: controls.breakerAcknowledgedAt,
        threshold: ruleSet?.rules.complaints ?? null,
      },
    };
  }

  /** Sets or clears the Emergency Stop flag inside the caller's transaction. */
  async setEmergencyStop(
    tx: Database,
    organizationId: string,
    active: boolean,
    userId: string,
    reason: string | null,
  ): Promise<boolean> {
    const current = await lockCallingControls(tx, organizationId);
    if (current.emergencyStopActive === active) return false;
    await tx
      .update(organizationCallingControls)
      .set(
        active
          ? {
              emergencyStopActive: true,
              emergencyStoppedAt: this.clock.now(),
              emergencyStoppedByUserId: userId,
              emergencyStopReason: reason,
            }
          : { emergencyStopActive: false },
      )
      .where(eq(organizationCallingControls.organizationId, organizationId));
    return true;
  }

  async listComplaints(
    tenant: TenantPrincipal,
    query: { limit: number; cursor?: string | undefined },
  ) {
    const after = decodeCursor(query.cursor);
    const rows = await this.db
      .select({
        id: complaintRecords.id,
        kind: complaintRecords.kind,
        callerNumberId: complaintRecords.callerNumberId,
        callerNumber: callerNumbers.phoneE164,
        leadId: complaintRecords.leadId,
        receivedAt: complaintRecords.receivedAt,
        reference: complaintRecords.reference,
        note: complaintRecords.note,
        createdAt: complaintRecords.createdAt,
      })
      .from(complaintRecords)
      .leftJoin(callerNumbers, eq(callerNumbers.id, complaintRecords.callerNumberId))
      .where(
        and(
          eq(complaintRecords.organizationId, tenant.membership.organizationId),
          after
            ? or(
                lt(complaintRecords.createdAt, after.createdAt),
                and(
                  eq(complaintRecords.createdAt, after.createdAt),
                  lt(complaintRecords.id, after.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(complaintRecords.createdAt), desc(complaintRecords.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit);
  }

  /** FR-49/FR-13: records a complaint or operator flag, pausing the number and maybe tripping. */
  async recordComplaint(
    tenant: TenantPrincipal,
    input: {
      kind: 'COMPLAINT' | 'OPERATOR_FLAG';
      callerNumberId?: string | null | undefined;
      leadId?: string | null | undefined;
      receivedAt?: string | null | undefined;
      reference?: string | null | undefined;
      note?: string | null | undefined;
    },
    context: ClientContext,
  ) {
    const orgId = tenant.membership.organizationId;
    const now = this.clock.now();
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : now;
    if (Number.isNaN(receivedAt.getTime()) || receivedAt > now) {
      throw new AppError('VALIDATION_ERROR', 'The received date must be a past date.');
    }
    return this.db.transaction(async (tx) => {
      const controls = await lockCallingControls(tx, orgId);
      if (input.callerNumberId) {
        const [number] = await tx
          .select({ id: callerNumbers.id })
          .from(callerNumbers)
          .where(
            and(
              eq(callerNumbers.id, input.callerNumberId),
              eq(callerNumbers.organizationId, orgId),
            ),
          )
          .limit(1);
        if (!number) throw new AppError('NOT_FOUND', 'Caller number not found.');
        await tx
          .update(callerNumbers)
          .set({
            status: 'PAUSED',
            statusReason: `${input.kind === 'OPERATOR_FLAG' ? 'Operator flag' : 'Complaint'} recorded`,
          })
          .where(and(eq(callerNumbers.id, number.id), eq(callerNumbers.status, 'ACTIVE')));
      }
      const [record] = await tx
        .insert(complaintRecords)
        .values({
          organizationId: orgId,
          kind: input.kind,
          callerNumberId: input.callerNumberId ?? null,
          leadId: input.leadId ?? null,
          receivedAt,
          reference: cleanText(input.reference, 200),
          note: cleanText(input.note, 1000),
          recordedByUserId: tenant.userId,
        })
        .returning({ id: complaintRecords.id });
      if (!record) throw new Error('complaint insert returned no row');
      await this.audit.record(
        {
          action: 'compliance.complaint_recorded',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'complaint_record',
          resourceId: record.id,
          metadata: { kind: input.kind, callerNumberId: input.callerNumberId ?? null },
        },
        context,
        tx,
      );

      let tripped = controls.breakerTrippedAt !== null;
      const ruleSet = await this.rules.active(controls.defaultJurisdiction, now);
      if (!tripped) {
        // No rule set for the organization's jurisdiction: trip on any complaint (fail closed).
        const windowDays = ruleSet?.rules.complaints.windowDays ?? 10;
        const recent = await tx
          .select({ kind: complaintRecords.kind, receivedAt: complaintRecords.receivedAt })
          .from(complaintRecords)
          .where(
            and(
              eq(complaintRecords.organizationId, orgId),
              gte(complaintRecords.receivedAt, new Date(now.getTime() - windowDays * DAY_MS)),
            ),
          );
        const verdict = ruleSet
          ? complaintBreakerTrips(ruleSet.rules, recent, now)
          : { trips: true, reason: 'No rule set covers this organization’s jurisdiction.' };
        if (verdict.trips) {
          tripped = true;
          await tx
            .update(organizationCallingControls)
            .set({
              breakerTrippedAt: now,
              breakerReason: verdict.reason,
              breakerAcknowledgedAt: null,
              breakerAcknowledgedByUserId: null,
            })
            .where(eq(organizationCallingControls.organizationId, orgId));
          await this.audit.record(
            {
              action: 'compliance.breaker_tripped',
              organizationId: orgId,
              actorUserId: null,
              resourceType: 'organization',
              resourceId: orgId,
              metadata: { reason: verdict.reason, ruleSetVersion: ruleSet?.version ?? null },
            },
            context,
            tx,
          );
        }
      }
      return { id: record.id, breakerTripped: tripped };
    });
  }

  /** First half of resuming after the breaker: an ADMIN acknowledges (FR-49, A-22). */
  async acknowledgeBreaker(tenant: TenantPrincipal, note: string | null, context: ClientContext) {
    const orgId = tenant.membership.organizationId;
    await this.db.transaction(async (tx) => {
      const controls = await lockCallingControls(tx, orgId);
      if (!controls.breakerTrippedAt)
        throw new AppError('CONFLICT', 'The complaint breaker is not tripped.');
      await tx
        .update(organizationCallingControls)
        .set({
          breakerAcknowledgedAt: this.clock.now(),
          breakerAcknowledgedByUserId: tenant.userId,
        })
        .where(eq(organizationCallingControls.organizationId, orgId));
      await this.audit.record(
        {
          action: 'compliance.breaker_acknowledged',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'organization',
          resourceId: orgId,
          metadata: { note: cleanText(note, 500) },
        },
        context,
        tx,
      );
    });
  }

  /** Second half: a Super Admin clears an acknowledged breaker. Campaigns stay paused. */
  async clearBreaker(organizationId: string, superAdminId: string, context: ClientContext) {
    await this.db.transaction(async (tx) => {
      const controls = await lockCallingControls(tx, organizationId);
      if (!controls.breakerTrippedAt)
        throw new AppError('CONFLICT', 'The complaint breaker is not tripped.');
      if (!controls.breakerAcknowledgedAt) {
        throw new AppError('CONFLICT', 'An organization admin must acknowledge the breaker first.');
      }
      await tx
        .update(organizationCallingControls)
        .set({ breakerTrippedAt: null, breakerReason: null })
        .where(eq(organizationCallingControls.organizationId, organizationId));
      await this.audit.record(
        {
          action: 'compliance.breaker_cleared',
          organizationId,
          actorUserId: superAdminId,
          resourceType: 'organization',
          resourceId: organizationId,
          metadata: { acknowledgedAt: controls.breakerAcknowledgedAt.toISOString() },
        },
        context,
        tx,
      );
    });
  }
}
