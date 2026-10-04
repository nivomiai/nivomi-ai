import { Inject, Injectable } from '@nestjs/common';
import {
  organizationPlans,
  plans,
  type Database,
  type UsageEventKind,
} from '@nivomi/database';
import { and, eq } from 'drizzle-orm';
import { DATABASE } from '../database/database.module.js';
import { UsageMeter } from './usage-meter.service.js';

export type QuotaDecision =
  | { kind: 'ALLOWED'; usage: number; limit: number | null }
  | { kind: 'WARN'; usage: number; limit: number }
  | { kind: 'OVER_QUOTA'; usage: number; limit: number };

/**
 * Fail-closed quota check (ADR-027 §3). Returns ALLOWED when the tenant has no plan or no limit
 * for the kind. Over-quota triggers DEFERRED on eligibility, not BLOCKED, so campaigns resume
 * the following cycle automatically.
 */
@Injectable()
export class QuotaService {
  private static readonly WARN_FRACTION = 0.9;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly meter: UsageMeter,
  ) {}

  async check(
    organizationId: string,
    kind: UsageEventKind,
    projectedAdditional = 0,
  ): Promise<QuotaDecision> {
    const limit = await this.limit(organizationId, kind);
    const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, '0')}`;
    const usage = await this.meter.totalForPeriod(organizationId, kind, period);
    const projected = usage + Math.max(0, projectedAdditional);
    if (limit === null) return { kind: 'ALLOWED', usage, limit: null };
    if (projected >= limit) return { kind: 'OVER_QUOTA', usage, limit };
    if (projected >= limit * QuotaService.WARN_FRACTION)
      return { kind: 'WARN', usage, limit };
    return { kind: 'ALLOWED', usage, limit };
  }

  private async limit(organizationId: string, kind: UsageEventKind): Promise<number | null> {
    const [row] = await this.db
      .select({ limits: plans.limits })
      .from(organizationPlans)
      .innerJoin(plans, eq(plans.id, organizationPlans.planId))
      .where(
        and(
          eq(organizationPlans.organizationId, organizationId),
          eq(organizationPlans.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!row) return null;
    const value = row.limits[kind];
    return typeof value === 'number' ? value : null;
  }
}
