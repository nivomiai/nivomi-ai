import { Inject, Injectable } from '@nestjs/common';
import {
  callSessions,
  leads,
  type Database,
} from '@nivomi/database';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { TenantPrincipal } from '../auth/principal.js';
import { DATABASE } from '../database/database.module.js';

/**
 * Tenant analytics (ADR-029 §2). Phase 10 ships live aggregates against the base tables;
 * materialized views + 15-min refresh land in Phase 11 (TECH_DEBT).
 */

export interface AnalyticsSummary {
  readonly leads: { readonly funnel: Array<{ status: string; count: number }>; readonly total: number };
  readonly calls: {
    readonly byOutcome: Array<{ outcome: string; count: number }>;
    readonly byDirection: { inbound: number; outbound: number };
    readonly totalDurationSeconds: number;
  };
  readonly period: { readonly from: Date; readonly to: Date };
}

const periodDays = (days: number) => {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1_000);
  return { from, to };
};

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async summary(principal: TenantPrincipal, days = 30): Promise<AnalyticsSummary> {
    const { from, to } = periodDays(days);
    const funnel = await this.db
      .select({ status: leads.status, count: sql<number>`COUNT(*)::bigint` })
      .from(leads)
      .where(eq(leads.organizationId, principal.membership.organizationId))
      .groupBy(leads.status);

    const callOutcomes = await this.db
      .select({
        outcome: sql<string>`COALESCE(${callSessions.conversationOutcome}::text, ${callSessions.telephonyOutcome}, 'UNKNOWN')`,
        count: sql<number>`COUNT(*)::bigint`,
      })
      .from(callSessions)
      .where(
        and(
          eq(callSessions.organizationId, principal.membership.organizationId),
          gte(callSessions.startedAt, from),
        ),
      )
      .groupBy(
        sql`COALESCE(${callSessions.conversationOutcome}::text, ${callSessions.telephonyOutcome}, 'UNKNOWN')`,
      );

    const [direction] = await this.db
      .select({
        inbound: sql<number>`COUNT(*) FILTER (WHERE direction = 'INBOUND')::bigint`,
        outbound: sql<number>`COUNT(*) FILTER (WHERE direction = 'OUTBOUND')::bigint`,
        totalDuration: sql<number>`COALESCE(SUM(duration_seconds), 0)::bigint`,
      })
      .from(callSessions)
      .where(
        and(
          eq(callSessions.organizationId, principal.membership.organizationId),
          gte(callSessions.startedAt, from),
        ),
      );

    const funnelOut = funnel.map((row) => ({ status: row.status, count: Number(row.count) }));
    return {
      leads: {
        funnel: funnelOut,
        total: funnelOut.reduce((n, r) => n + r.count, 0),
      },
      calls: {
        byOutcome: callOutcomes.map((row) => ({ outcome: row.outcome, count: Number(row.count) })),
        byDirection: {
          inbound: Number(direction?.inbound ?? 0),
          outbound: Number(direction?.outbound ?? 0),
        },
        totalDurationSeconds: Number(direction?.totalDuration ?? 0),
      },
      period: { from, to },
    };
  }
}
