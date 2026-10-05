import { Inject, Injectable } from '@nestjs/common';
import {
  invoices,
  organizationPlans,
  plans,
  type Database,
  type UsageEventKind,
} from '@nivomi/database';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { TenantPrincipal } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import { DATABASE } from '../database/database.module.js';
import { UsageMeter } from './usage-meter.service.js';

/**
 * Billing service (ADR-027): plan assignment, invoice rollup, read API for the customer app.
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly meter: UsageMeter,
  ) {}

  async currentPlan(principal: TenantPrincipal): Promise<null | {
    id: string;
    code: string;
    name: string;
    monthlyPaiseInr: number;
    limits: Partial<Record<UsageEventKind, number>>;
    cycle: 'MONTHLY' | 'YEARLY';
    startsOn: Date;
  }> {
    const [row] = await this.db
      .select({
        id: plans.id,
        code: plans.code,
        name: plans.name,
        monthlyPaiseInr: plans.monthlyPaiseInr,
        limits: plans.limits,
        cycle: organizationPlans.cycle,
        startsOn: organizationPlans.startsOn,
      })
      .from(organizationPlans)
      .innerJoin(plans, eq(plans.id, organizationPlans.planId))
      .where(
        and(
          eq(organizationPlans.organizationId, principal.membership.organizationId),
          eq(organizationPlans.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  usageSummary(principal: TenantPrincipal): Promise<Record<UsageEventKind, number>> {
    return this.meter.currentPeriodTotals(principal.membership.organizationId);
  }

  listInvoices(principal: TenantPrincipal) {
    return this.db
      .select({
        id: invoices.id,
        periodYearMonth: invoices.periodYearMonth,
        totalPaise: invoices.totalPaise,
        status: invoices.status,
        issuedAt: invoices.issuedAt,
      })
      .from(invoices)
      .where(eq(invoices.organizationId, principal.membership.organizationId))
      .orderBy(desc(invoices.createdAt))
      .limit(50);
  }

  async assignPlan(
    superAdminUserId: string,
    organizationId: string,
    planId: string,
    cycle: 'MONTHLY' | 'YEARLY' = 'MONTHLY',
  ): Promise<{ id: string }> {
    void superAdminUserId; // audit happens in the controller
    const [plan] = await this.db.select({ id: plans.id }).from(plans).where(eq(plans.id, planId));
    if (!plan) throw new AppError('NOT_FOUND', 'plan not found');
    const result = await this.db.transaction(async (tx) => {
      await tx
        .update(organizationPlans)
        .set({ status: 'CANCELLED', endsOn: new Date() })
        .where(
          and(
            eq(organizationPlans.organizationId, organizationId),
            eq(organizationPlans.status, 'ACTIVE'),
          ),
        );
      const [inserted] = await tx
        .insert(organizationPlans)
        .values({
          organizationId,
          planId,
          cycle,
          status: 'ACTIVE',
          startsOn: new Date(),
        })
        .returning({ id: organizationPlans.id });
      if (!inserted) throw new AppError('INTERNAL_ERROR', 'assignPlan returned no row');
      return inserted;
    });
    return result;
  }

  /**
   * Rolls the current period into a draft invoice; idempotent on (org, period).
   * Phase 8 ships a plain-text totals rollup; invoice PDF rendering is deferred (TECH_DEBT).
   */
  async rollupInvoice(
    organizationId: string,
    periodYearMonth: string,
  ): Promise<{ id: string; created: boolean }> {
    const plan = await this.db
      .select({
        monthlyPaiseInr: plans.monthlyPaiseInr,
        name: plans.name,
        limits: plans.limits,
        overageRates: plans.overageRates,
      })
      .from(organizationPlans)
      .innerJoin(plans, eq(plans.id, organizationPlans.planId))
      .where(
        and(
          eq(organizationPlans.organizationId, organizationId),
          eq(organizationPlans.status, 'ACTIVE'),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null);

    const totals = await this.db
      .select({
        kind: sql<UsageEventKind>`kind`,
        total: sql<number>`COALESCE(SUM(quantity), 0)::bigint`,
      })
      .from(sql`usage_events`)
      .where(sql`organization_id = ${organizationId} AND period_year_month = ${periodYearMonth}`)
      .groupBy(sql`kind`);

    const lineItems: Array<{ description: string; quantity: number; unit: string; paise: number }> =
      [];
    if (plan) {
      lineItems.push({
        description: `${plan.name} subscription`,
        quantity: 1,
        unit: 'cycle',
        paise: Number(plan.monthlyPaiseInr),
      });
      for (const row of totals) {
        const used = Number(row.total);
        const limit = plan.limits[row.kind] ?? 0;
        const overage = Math.max(0, used - (typeof limit === 'number' ? limit : 0));
        const rate = plan.overageRates[row.kind] ?? 0;
        if (overage > 0 && rate > 0) {
          lineItems.push({
            description: `${row.kind} overage`,
            quantity: overage,
            unit: 'unit',
            paise: overage * rate,
          });
        }
      }
    }
    const subtotalPaise = lineItems.reduce((n, li) => n + li.paise, 0);
    // Phase 8 ships zero GST allocation; split-vs-IGST logic is Phase 11's billing config step.
    const totalPaise = subtotalPaise;

    const [row] = await this.db
      .insert(invoices)
      .values({
        organizationId,
        periodYearMonth,
        lineItems,
        subtotalPaise,
        totalPaise,
        status: 'DRAFT',
      })
      .onConflictDoNothing()
      .returning({ id: invoices.id });
    if (row) return { id: row.id, created: true };
    const [existing] = await this.db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          eq(invoices.periodYearMonth, periodYearMonth),
        ),
      );
    if (!existing) throw new AppError('INTERNAL_ERROR', 'invoice rollup conflict with no row');
    return { id: existing.id, created: false };
  }
}
