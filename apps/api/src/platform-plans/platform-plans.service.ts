import { Inject, Injectable } from '@nestjs/common';
import {
  organizationPlans,
  plans,
  usageEventKinds,
  type Database,
  type UsageEventKind,
} from '@nivomi/database';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { isUniqueViolation } from '../common/database-errors.js';
import { AppError } from '../common/errors.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

export type PlanStatus = 'ACTIVE' | 'ARCHIVED';

export interface PlanRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly monthlyPaiseInr: number;
  readonly annualDiscountBps: number;
  readonly limits: Partial<Record<UsageEventKind, number>>;
  readonly overageRates: Partial<Record<UsageEventKind, number>>;
  readonly status: PlanStatus;
  readonly displayOrder: number;
  readonly updatedAt: Date;
  readonly createdAt: Date;
  readonly orgsActive: number;
}

export interface PublicPlan {
  readonly code: string;
  readonly name: string;
  readonly monthlyPaiseInr: number;
  /** Effective annual price in paise after `annualDiscountBps`. 0 ⇒ Custom pricing. */
  readonly annualPaiseInr: number;
  readonly annualDiscountBps: number;
  readonly limits: Partial<Record<UsageEventKind, number>>;
  readonly displayOrder: number;
}

export interface CreatePlanInput {
  readonly code: string;
  readonly name: string;
  readonly monthlyPaiseInr: number;
  readonly annualDiscountBps: number;
  readonly limits: Partial<Record<UsageEventKind, number>>;
  readonly overageRates: Partial<Record<UsageEventKind, number>>;
  readonly status: PlanStatus;
  readonly displayOrder: number;
}

export interface UpdatePlanInput extends CreatePlanInput {
  readonly expectedVersion: string; // ISO timestamp of plans.updatedAt the editor last saw
}

function effectiveAnnualPaise(monthlyPaiseInr: number, annualDiscountBps: number): number {
  if (monthlyPaiseInr <= 0) return 0;
  const full = monthlyPaiseInr * 12;
  const discount = Math.round((full * annualDiscountBps) / 10000);
  return Math.max(0, full - discount);
}

/**
 * Super-admin plan catalogue (ADR-027 Phase 8 follow-up). The `plans` table is platform-owned —
 * no `organization_id`, no tenant guard. Every write audits and touches `updated_at` so clients
 * get optimistic concurrency.
 */
@Injectable()
export class PlatformPlansService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<readonly PlanRow[]> {
    const rows = await this.db
      .select({
        id: plans.id,
        code: plans.code,
        name: plans.name,
        monthlyPaiseInr: plans.monthlyPaiseInr,
        annualDiscountBps: plans.annualDiscountBps,
        limits: plans.limits,
        overageRates: plans.overageRates,
        status: plans.status,
        displayOrder: plans.displayOrder,
        updatedAt: plans.updatedAt,
        createdAt: plans.createdAt,
      })
      .from(plans)
      .orderBy(asc(plans.displayOrder), asc(plans.monthlyPaiseInr), desc(plans.createdAt));

    if (rows.length === 0) return [];

    // Count ACTIVE org assignments per plan on the returned page, in one query.
    const counts = await this.db
      .select({
        planId: organizationPlans.planId,
        n: sql<number>`count(*)::int`.as('n'),
      })
      .from(organizationPlans)
      .where(
        and(
          inArray(
            organizationPlans.planId,
            rows.map((r) => r.id),
          ),
          eq(organizationPlans.status, 'ACTIVE'),
        ),
      )
      .groupBy(organizationPlans.planId);
    const activeByPlan = new Map(counts.map((c) => [c.planId, Number(c.n)]));

    return rows.map((r) => ({
      ...r,
      limits: r.limits ?? {},
      overageRates: r.overageRates ?? {},
      orgsActive: activeByPlan.get(r.id) ?? 0,
    }));
  }

  /** Public (unauthenticated) list used by the marketing site. Hides internal fields. */
  async listPublic(): Promise<readonly PublicPlan[]> {
    const rows = await this.db
      .select({
        code: plans.code,
        name: plans.name,
        monthlyPaiseInr: plans.monthlyPaiseInr,
        annualDiscountBps: plans.annualDiscountBps,
        limits: plans.limits,
        displayOrder: plans.displayOrder,
      })
      .from(plans)
      .where(eq(plans.status, 'ACTIVE'))
      .orderBy(asc(plans.displayOrder), asc(plans.monthlyPaiseInr));
    return rows.map((r) => ({
      ...r,
      limits: r.limits ?? {},
      annualPaiseInr: effectiveAnnualPaise(r.monthlyPaiseInr, r.annualDiscountBps),
    }));
  }

  async create(
    input: CreatePlanInput,
    actorUserId: string,
    context?: ClientContext,
  ): Promise<PlanRow> {
    this.validatePayload(input);
    try {
      const inserted = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(plans)
          .values({
            code: input.code,
            name: input.name,
            monthlyPaiseInr: input.monthlyPaiseInr,
            annualDiscountBps: input.annualDiscountBps,
            limits: input.limits,
            overageRates: input.overageRates,
            status: input.status,
            displayOrder: input.displayOrder,
            updatedAt: new Date(),
          })
          .returning();
        if (!row) throw new AppError('INTERNAL_ERROR', 'plan insert returned no row');
        await this.audit.record(
          {
            action: 'platform.plan_created',
            actorUserId,
            resourceType: 'plan',
            resourceId: row.id,
            metadata: {
              code: input.code,
              name: input.name,
              monthlyPaiseInr: input.monthlyPaiseInr,
              status: input.status,
            },
          },
          context,
          tx,
        );
        return row;
      });
      return {
        id: inserted.id,
        code: inserted.code,
        name: inserted.name,
        monthlyPaiseInr: inserted.monthlyPaiseInr,
        annualDiscountBps: inserted.annualDiscountBps,
        limits: inserted.limits ?? {},
        overageRates: inserted.overageRates ?? {},
        status: inserted.status,
        displayOrder: inserted.displayOrder,
        updatedAt: inserted.updatedAt,
        createdAt: inserted.createdAt,
        orgsActive: 0,
      };
    } catch (error) {
      throw this.rewriteDuplicateCode(error, input.code);
    }
  }

  async update(
    id: string,
    input: UpdatePlanInput,
    actorUserId: string,
    context?: ClientContext,
  ): Promise<PlanRow> {
    this.validatePayload(input);
    try {
      const updated = await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(plans)
          .where(eq(plans.id, id))
          .for('update');
        if (!current) throw new AppError('NOT_FOUND', 'Plan not found.');
        if (current.updatedAt.toISOString() !== input.expectedVersion) {
          throw new AppError(
            'CONFLICT',
            'This plan was changed by someone else; reload before saving.',
          );
        }
        const now = new Date();
        const [row] = await tx
          .update(plans)
          .set({
            code: input.code,
            name: input.name,
            monthlyPaiseInr: input.monthlyPaiseInr,
            annualDiscountBps: input.annualDiscountBps,
            limits: input.limits,
            overageRates: input.overageRates,
            status: input.status,
            displayOrder: input.displayOrder,
            updatedAt: now,
          })
          .where(eq(plans.id, id))
          .returning();
        if (!row) throw new AppError('INTERNAL_ERROR', 'plan update returned no row');
        await this.audit.record(
          {
            action: 'platform.plan_updated',
            actorUserId,
            resourceType: 'plan',
            resourceId: id,
            metadata: {
              before: {
                code: current.code,
                name: current.name,
                monthlyPaiseInr: current.monthlyPaiseInr,
                status: current.status,
                displayOrder: current.displayOrder,
              },
              after: {
                code: row.code,
                name: row.name,
                monthlyPaiseInr: row.monthlyPaiseInr,
                status: row.status,
                displayOrder: row.displayOrder,
              },
            },
          },
          context,
          tx,
        );
        return row;
      });
      const active = await this.countActive(updated.id);
      return {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        monthlyPaiseInr: updated.monthlyPaiseInr,
        annualDiscountBps: updated.annualDiscountBps,
        limits: updated.limits ?? {},
        overageRates: updated.overageRates ?? {},
        status: updated.status,
        displayOrder: updated.displayOrder,
        updatedAt: updated.updatedAt,
        createdAt: updated.createdAt,
        orgsActive: active,
      };
    } catch (error) {
      throw this.rewriteDuplicateCode(error, input.code);
    }
  }

  async archive(id: string, actorUserId: string, context?: ClientContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: plans.id, status: plans.status, code: plans.code })
        .from(plans)
        .where(eq(plans.id, id))
        .for('update');
      if (!current) throw new AppError('NOT_FOUND', 'Plan not found.');
      // Idempotent: re-archiving is a no-op, no audit row.
      if (current.status === 'ARCHIVED') return;
      const inUseRows = await tx
        .select({ n: sql<number>`count(*)::int`.as('n') })
        .from(organizationPlans)
        .where(and(eq(organizationPlans.planId, id), eq(organizationPlans.status, 'ACTIVE')));
      const inUse = Number(inUseRows[0]?.n ?? 0);
      if (inUse > 0) {
        throw new AppError(
          'CONFLICT',
          `This plan is active on ${inUse} organization${inUse === 1 ? '' : 's'}; move them to another plan first.`,
          { details: [`PLAN_IN_USE: ${inUse}`] },
        );
      }
      await tx
        .update(plans)
        .set({ status: 'ARCHIVED', updatedAt: new Date() })
        .where(eq(plans.id, id));
      await this.audit.record(
        {
          action: 'platform.plan_archived',
          actorUserId,
          resourceType: 'plan',
          resourceId: id,
          metadata: { code: current.code },
        },
        context,
        tx,
      );
    });
  }

  private validatePayload(input: CreatePlanInput): void {
    if (input.monthlyPaiseInr < 0) {
      throw new AppError('VALIDATION_ERROR', 'monthlyPaiseInr must be >= 0.');
    }
    if (input.annualDiscountBps < 0 || input.annualDiscountBps > 10000) {
      throw new AppError('VALIDATION_ERROR', 'annualDiscountBps must be between 0 and 10000.');
    }
    const kinds = new Set<string>(usageEventKinds);
    for (const key of Object.keys(input.limits ?? {})) {
      if (!kinds.has(key)) {
        throw new AppError('VALIDATION_ERROR', `limits: unknown usage kind "${key}".`);
      }
    }
    for (const key of Object.keys(input.overageRates ?? {})) {
      if (!kinds.has(key)) {
        throw new AppError('VALIDATION_ERROR', `overageRates: unknown usage kind "${key}".`);
      }
    }
  }

  private rewriteDuplicateCode(error: unknown, code: string): unknown {
    if (isUniqueViolation(error)) {
      return new AppError('CONFLICT', `A plan with code "${code}" already exists.`);
    }
    return error;
  }

  private async countActive(planId: string): Promise<number> {
    const rows = await this.db
      .select({ n: sql<number>`count(*)::int`.as('n') })
      .from(organizationPlans)
      .where(and(eq(organizationPlans.planId, planId), eq(organizationPlans.status, 'ACTIVE')));
    return Number(rows[0]?.n ?? 0);
  }
}
