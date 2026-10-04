import { Inject, Injectable } from '@nestjs/common';
import {
  crmSyncJobs,
  type CrmSyncJobKind,
  type Database,
} from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { DATABASE } from '../database/database.module.js';

/**
 * CRM write-back outbox (ADR-026). Enqueues one projection row per business event; the worker
 * drains the queue and calls the CRM adapter. A projection hash makes a replay a no-op.
 */

export interface LeadStatusProjection {
  readonly leadId: string;
  readonly contactCrmId: string;
  readonly status: string;
}

export interface CallOutcomeProjection {
  readonly callSessionId: string;
  readonly contactCrmId: string;
  readonly outcome: string;
  readonly transcriptSummary: string;
  readonly durationSeconds: number;
}

export interface OptOutProjection {
  readonly contactCrmId: string;
  readonly reason: string;
  readonly recordedAt: string;
}

export interface AppointmentProjection {
  readonly appointmentId: string;
  readonly contactCrmId: string;
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly channel: string;
  readonly status: string;
}

export type WritebackProjection =
  | { kind: 'PUSH_LEAD_STATUS'; entityId: string; payload: LeadStatusProjection }
  | { kind: 'PUSH_CALL_OUTCOME'; entityId: string; payload: CallOutcomeProjection }
  | { kind: 'PUSH_OPT_OUT'; entityId: string; payload: OptOutProjection }
  | { kind: 'PUSH_APPOINTMENT'; entityId: string; payload: AppointmentProjection };

const hashOf = (p: Record<string, unknown>) =>
  createHash('sha256').update(JSON.stringify(sortKeys(p))).digest('hex');

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, {});
  }
  return v;
}

@Injectable()
export class CrmWritebackService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async enqueue(
    organizationId: string,
    projection: WritebackProjection,
  ): Promise<{ id: string; created: boolean }> {
    const payloadRecord = { ...projection.payload } as unknown as Record<string, unknown>;
    const projectionHash = hashOf(payloadRecord);
    const kind: CrmSyncJobKind = projection.kind;
    const [inserted] = await this.db
      .insert(crmSyncJobs)
      .values({
        organizationId,
        kind,
        entityId: projection.entityId,
        projectionHash,
        payload: payloadRecord,
        status: 'PENDING',
      })
      .onConflictDoNothing()
      .returning({ id: crmSyncJobs.id });
    if (inserted) return { id: inserted.id, created: true };
    const [existing] = await this.db
      .select({ id: crmSyncJobs.id })
      .from(crmSyncJobs)
      .where(
        and(
          eq(crmSyncJobs.organizationId, organizationId),
          eq(crmSyncJobs.kind, kind),
          eq(crmSyncJobs.entityId, projection.entityId),
          eq(crmSyncJobs.projectionHash, projectionHash),
        ),
      );
    if (!existing) throw new Error('writeback outbox: conflict but matching row not found');
    return { id: existing.id, created: false };
  }

  pending(organizationId: string): Promise<Array<{
    id: string;
    kind: CrmSyncJobKind;
    entityId: string;
    payload: Record<string, unknown>;
  }>> {
    return this.db
      .select({
        id: crmSyncJobs.id,
        kind: crmSyncJobs.kind,
        entityId: crmSyncJobs.entityId,
        payload: crmSyncJobs.payload,
      })
      .from(crmSyncJobs)
      .where(
        and(
          eq(crmSyncJobs.organizationId, organizationId),
          eq(crmSyncJobs.status, 'PENDING'),
        ),
      );
  }
}
