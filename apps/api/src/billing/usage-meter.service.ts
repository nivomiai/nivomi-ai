import { Inject, Injectable } from '@nestjs/common';
import { usageEvents, type Database, type UsageEventKind } from '@nivomi/database';
import { and, eq, sql } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';

/**
 * Meters billable events (ADR-027 §1). Writes are idempotent per `(organizationId, kind,
 * sourceId)` when a `sourceId` is set: a replayed voice session or CRM API call never counts
 * twice.
 */

export interface UsageEventInput {
  readonly organizationId: string;
  readonly kind: UsageEventKind;
  readonly quantity: number;
  readonly unit: 'seconds' | 'tokens' | 'calls' | 'sms' | 'imports' | 'rows' | 'messages';
  readonly sourceId?: string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly occurredAt?: Date | undefined;
}

function periodOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class UsageMeter {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async record(event: UsageEventInput): Promise<{ recorded: boolean }> {
    const occurredAt = event.occurredAt ?? new Date();
    const rows = await this.db
      .insert(usageEvents)
      .values({
        organizationId: event.organizationId,
        kind: event.kind,
        quantity: event.quantity,
        unit: event.unit,
        sourceId: event.sourceId ?? null,
        metadata: event.metadata ?? null,
        periodYearMonth: periodOf(occurredAt),
        occurredAt,
      })
      .onConflictDoNothing()
      .returning({ id: usageEvents.id });
    return { recorded: rows.length > 0 };
  }

  async totalForPeriod(
    organizationId: string,
    kind: UsageEventKind,
    periodYearMonth: string,
  ): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`COALESCE(SUM(${usageEvents.quantity}), 0)::bigint` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.organizationId, organizationId),
          eq(usageEvents.kind, kind),
          eq(usageEvents.periodYearMonth, periodYearMonth),
        ),
      );
    return Number(row?.total ?? 0);
  }

  async currentPeriodTotals(
    organizationId: string,
  ): Promise<Record<UsageEventKind, number>> {
    const period = periodOf(new Date());
    const rows = await this.db
      .select({
        kind: usageEvents.kind,
        total: sql<number>`COALESCE(SUM(${usageEvents.quantity}), 0)::bigint`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.organizationId, organizationId),
          eq(usageEvents.periodYearMonth, period),
        ),
      )
      .groupBy(usageEvents.kind);
    const totals = {} as Record<UsageEventKind, number>;
    for (const row of rows) totals[row.kind] = Number(row.total);
    return totals;
  }
}
