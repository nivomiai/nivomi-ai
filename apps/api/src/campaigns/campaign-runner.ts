import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  callAttempts,
  callerNumbers,
  campaignLeads,
  campaigns,
  eligibilityReviews,
  leads,
  organizations,
  telecomIdentities,
  type Database,
  type PrelaunchSummary,
} from '@nivomi/database';
import { and, asc, count, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { callingControls } from '../compliance/calling-controls.service.js';
import { Clock } from '../compliance/clock.js';
import {
  telecomIdentityReasons,
  type ComplianceObligations,
} from '../compliance/compliance-engine.js';
import { EligibilityService } from '../compliance/eligibility.service.js';
import { RuleSetRegistry } from '../compliance/rule-set-registry.js';
import { DATABASE } from '../database/database.module.js';
import { JobHandlerRegistry, JobQueue, PermanentJobError } from '../jobs/jobs.js';
import { CallOutcomeService } from './call-outcomes.js';
import { LEAD_BATCH_SIZE, selectionCondition } from './campaign-policy.js';
import { SIMULATED_CALL_EVENT, VOICE_PROVIDER, type VoiceProvider } from './voice-provider.js';

type Campaign = typeof campaigns.$inferSelect;

interface PlaceTarget {
  readonly attemptId: string;
  readonly organizationId: string;
  readonly from: string;
  readonly to: string;
  readonly obligations: ComplianceObligations | null;
  readonly agentVersionId: string | null;
}

export const CAMPAIGN_JOBS = {
  prelaunch: 'campaign.prelaunch',
  tick: 'campaign.tick',
  dial: 'campaign.dial',
} as const;

/** Tick again this soon while calls are queued or live. */
const ACTIVE_TICK_MS = 2_000;
/** Longest idle gap between ticks: bounds how long a new continuous lead waits. */
const IDLE_TICK_MS = 30_000;
/** A DIALING attempt with no provider call this old is reconciled (> the dial job timeout). */
const UNCONFIRMED_DIAL_MS = 5 * 60_000;
/** A deferred lead with no known next time is looked at again after this. */
const DEFAULT_DEFER_MS = 5 * 60_000;

const prelaunchPayload = z.object({ campaignId: z.uuid(), checkId: z.uuid() });
const tickPayload = z.object({ campaignId: z.uuid(), tickToken: z.uuid() });
const dialPayload = z.object({ campaignLeadId: z.uuid(), dialToken: z.uuid() });
const callEventPayload = z.object({
  attemptId: z.uuid(),
  providerCallId: z.string(),
  outcome: z.enum([
    'CONNECTED',
    'NO_ANSWER',
    'BUSY',
    'FAILED',
    'PROVIDER_ERROR',
    'OPTED_OUT',
    'NOT_INTERESTED',
    'WRONG_NUMBER',
  ]),
  durationSeconds: z.number().int().min(0),
});

/** Serializes dial decisions per lead across campaigns (FR-41: one conversation at a time). */
async function lockLeadForDial(tx: Database, leadId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`lead-dial:${leadId}`}))`);
}

/**
 * Durable campaign execution (FR-38, ADR-021). Job payloads carry ids only; the Organization is
 * always re-read from the row, never trusted from the payload.
 */
@Injectable()
export class CampaignRunner implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly registry: JobHandlerRegistry,
    private readonly queue: JobQueue,
    private readonly eligibility: EligibilityService,
    private readonly outcomes: CallOutcomeService,
    private readonly rules: RuleSetRegistry,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    @Inject(VOICE_PROVIDER) private readonly voice: VoiceProvider,
    @InjectPinoLogger(CampaignRunner.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      CAMPAIGN_JOBS.prelaunch,
      (p) => this.prelaunchStep(prelaunchPayload.parse(p)),
      {
        timeoutMs: 2 * 60_000,
      },
    );
    this.registry.register(CAMPAIGN_JOBS.tick, (p) => this.tick(tickPayload.parse(p)), {
      timeoutMs: 60_000,
    });
    this.registry.register(CAMPAIGN_JOBS.dial, (p) => this.dial(dialPayload.parse(p)));
    this.registry.register(SIMULATED_CALL_EVENT, async (p) => {
      await this.outcomes.apply(callEventPayload.parse(p));
    });
  }

  // ── Pre-launch check (FR-36) ──────────────────────────────────────────

  /** Evaluates the next batch of the selection; the last batch completes the check. */
  async prelaunchStep({ campaignId, checkId }: z.infer<typeof prelaunchPayload>): Promise<void> {
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      const [campaign] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .for('update');
      const summary = campaign?.prelaunch;
      if (!campaign || campaign.status !== 'DRAFT' || summary?.status !== 'RUNNING') return;
      if (summary.checkId !== checkId) return; // superseded by a newer check

      const batch = await tx
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(
            selectionCondition(campaign.organizationId, campaign.selection),
            summary.cursor ? gt(leads.id, summary.cursor) : undefined,
          ),
        )
        .orderBy(asc(leads.id))
        .limit(LEAD_BATCH_SIZE);
      const ids = batch.map((b) => b.id);
      if (ids.length > 0) {
        await tx
          .insert(campaignLeads)
          .values(
            ids.map((leadId) => ({ organizationId: campaign.organizationId, campaignId, leadId })),
          )
          .onConflictDoNothing();
      }
      const decisions = await this.eligibility.evaluate(campaign, ids, 'PRE_LAUNCH', now, tx);
      const byReason = { ...summary.byReason };
      const counts = { eligible: 0, deferred: 0, blocked: 0, review: 0 };
      for (const d of decisions) {
        if (d.outcome.result === 'ELIGIBLE') counts.eligible += 1;
        if (d.outcome.result === 'DEFERRED') counts.deferred += 1;
        if (d.outcome.result === 'BLOCKED') counts.blocked += 1;
        if (d.outcome.result === 'REQUIRES_REVIEW') counts.review += 1;
        for (const r of d.outcome.reasons) byReason[r.code] = (byReason[r.code] ?? 0) + 1;
        await tx
          .update(campaignLeads)
          .set({ lastResult: d.outcome.result, lastReasons: d.outcome.reasons.map((r) => r.code) })
          .where(and(eq(campaignLeads.campaignId, campaignId), eq(campaignLeads.leadId, d.leadId)));
      }
      const done = ids.length < LEAD_BATCH_SIZE;
      const next: PrelaunchSummary = {
        ...summary,
        total: summary.total + decisions.length,
        eligible: summary.eligible + counts.eligible,
        deferred: summary.deferred + counts.deferred,
        blocked: summary.blocked + counts.blocked,
        review: summary.review + counts.review,
        byReason,
        ruleSetVersion:
          decisions.find((d) => d.outcome.ruleSetVersion !== null)?.outcome.ruleSetVersion ??
          summary.ruleSetVersion,
        cursor: ids.at(-1) ?? summary.cursor,
        status: done ? 'COMPLETED' : 'RUNNING',
        completedAt: done ? now.toISOString() : null,
      };
      await tx.update(campaigns).set({ prelaunch: next }).where(eq(campaigns.id, campaignId));
      if (!done) {
        await this.queue.enqueue(
          {
            type: CAMPAIGN_JOBS.prelaunch,
            organizationId: campaign.organizationId,
            payload: { campaignId, checkId },
            idempotencyKey: `prelaunch:${checkId}:${next.cursor ?? ''}`,
          },
          tx,
        );
      }
    });
  }

  // ── Tick: pacing, enrollment, completion (FR-37, FR-38, FR-42) ────────

  async tick({ campaignId, tickToken }: z.infer<typeof tickPayload>): Promise<void> {
    const now = this.clock.now();
    const unconfirmed: string[] = [];
    await this.db.transaction(async (tx) => {
      const [campaign] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .for('update');
      if (!campaign || campaign.tickToken !== tickToken) return; // superseded chain
      if (campaign.status !== 'SCHEDULED' && campaign.status !== 'RUNNING') return;
      const nextToken = randomUUID();
      const schedule = async (runAt: Date, status: 'SCHEDULED' | 'RUNNING') => {
        await tx
          .update(campaigns)
          .set({ tickToken: nextToken, status })
          .where(eq(campaigns.id, campaignId));
        await this.queue.enqueue(
          {
            type: CAMPAIGN_JOBS.tick,
            organizationId: campaign.organizationId,
            payload: { campaignId, tickToken: nextToken },
            runAt,
            idempotencyKey: `tick:${campaignId}:${nextToken}`,
          },
          tx,
        );
      };

      if (campaign.endsAt && campaign.endsAt <= now) {
        await this.finish(tx, campaign, 'COMPLETED', 'ENDED');
        return;
      }
      if (campaign.status === 'SCHEDULED' && campaign.startsAt && campaign.startsAt > now) {
        await schedule(campaign.startsAt, 'SCHEDULED');
        return;
      }
      const pause = await this.pauseReason(tx, campaign, now);
      if (pause) {
        await tx
          .update(campaigns)
          .set({ status: 'PAUSED', pauseReason: pause, tickToken: null })
          .where(eq(campaigns.id, campaignId));
        await this.audit.record(
          {
            action: 'campaign.auto_paused',
            organizationId: campaign.organizationId,
            resourceType: 'campaign',
            resourceId: campaignId,
            metadata: { reason: pause },
          },
          undefined,
          tx,
        );
        return;
      }

      if (campaign.type === 'CONTINUOUS') await this.enrollNew(tx, campaign);

      const stale = await tx
        .select({ id: callAttempts.id })
        .from(callAttempts)
        .where(
          and(
            eq(callAttempts.campaignId, campaignId),
            eq(callAttempts.status, 'DIALING'),
            isNull(callAttempts.providerCallId),
            lt(callAttempts.dialRequestedAt, new Date(now.getTime() - UNCONFIRMED_DIAL_MS)),
          ),
        );
      unconfirmed.push(...stale.map((s) => s.id));

      const [live] = await tx
        .select({ n: count() })
        .from(callAttempts)
        .where(and(eq(callAttempts.campaignId, campaignId), eq(callAttempts.status, 'DIALING')));
      const [lastHour] = await tx
        .select({ n: count() })
        .from(callAttempts)
        .where(
          and(
            eq(callAttempts.campaignId, campaignId),
            gte(callAttempts.createdAt, new Date(now.getTime() - 3_600_000)),
          ),
        );
      const [queued] = await tx
        .select({ n: count() })
        .from(campaignLeads)
        .where(and(eq(campaignLeads.campaignId, campaignId), eq(campaignLeads.state, 'QUEUED')));
      const inFlight = (live?.n ?? 0) + (queued?.n ?? 0);
      const slots = Math.max(
        0,
        Math.min(
          campaign.maxConcurrentCalls - inFlight,
          campaign.maxCallsPerHour - (lastHour?.n ?? 0) - (queued?.n ?? 0),
        ),
      );

      const due =
        slots > 0
          ? await tx
              .select({
                id: campaignLeads.id,
                leadId: campaignLeads.leadId,
                attemptsMade: campaignLeads.attemptsMade,
              })
              .from(campaignLeads)
              .where(
                and(
                  eq(campaignLeads.campaignId, campaignId),
                  inArray(campaignLeads.state, ['PENDING', 'WAITING']),
                  or(isNull(campaignLeads.nextAttemptAt), lte(campaignLeads.nextAttemptAt, now)),
                ),
              )
              .orderBy(
                sql`${campaignLeads.nextAttemptAt} asc nulls first`,
                asc(campaignLeads.enrolledAt),
              )
              .limit(slots)
              .for('update', { skipLocked: true })
          : [];
      for (const lead of due) {
        const dialToken = randomUUID();
        await tx
          .update(campaignLeads)
          .set({ state: 'QUEUED', dialToken })
          .where(eq(campaignLeads.id, lead.id));
        await this.queue.enqueue(
          {
            type: CAMPAIGN_JOBS.dial,
            organizationId: campaign.organizationId,
            payload: { campaignLeadId: lead.id, dialToken },
            // Per campaign, lead and attempt number; the token makes each queueing distinct.
            idempotencyKey: `dial:${campaignId}:${lead.leadId}:${lead.attemptsMade + 1}:${dialToken}`,
          },
          tx,
        );
      }

      const [open] = await tx
        .select({ n: count(), next: sql<string | null>`min(${campaignLeads.nextAttemptAt})` })
        .from(campaignLeads)
        .where(
          and(
            eq(campaignLeads.campaignId, campaignId),
            // Open reviews keep a campaign open: a resolved lead is dialled by it (FR-50).
            inArray(campaignLeads.state, ['PENDING', 'QUEUED', 'IN_CALL', 'WAITING', 'REVIEW']),
          ),
        );
      if (campaign.type === 'STATIC' && (open?.n ?? 0) === 0) {
        await this.finish(tx, campaign, 'COMPLETED', null);
        return;
      }
      const busy = due.length > 0 || inFlight > 0 || unconfirmed.length > 0;
      const earliest = open?.next ? new Date(open.next) : null;
      const idle = new Date(now.getTime() + IDLE_TICK_MS);
      const runAt = busy
        ? new Date(now.getTime() + ACTIVE_TICK_MS)
        : earliest && earliest < idle
          ? new Date(Math.max(earliest.getTime(), now.getTime() + 1_000))
          : idle;
      await schedule(runAt, 'RUNNING');
    });
    for (const attemptId of unconfirmed) await this.reconcile(attemptId);
  }

  /**
   * FR-37 automatic pauses. Regulatory validity of the telecom identity comes from the
   * ComplianceEngine; the rest are organization and budget states.
   */
  private async pauseReason(tx: Database, campaign: Campaign, now: Date): Promise<string | null> {
    const [organization] = await tx
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, campaign.organizationId));
    if (organization?.status !== 'ACTIVE') return 'ORGANIZATION_NOT_ACTIVE';
    const controls = await callingControls(tx, campaign.organizationId);
    if (controls.emergencyStopActive) return 'EMERGENCY_STOP';
    if (controls.breakerTrippedAt) return 'COMPLAINT_BREAKER';
    if (campaign.usedSeconds >= campaign.budgetMinutes * 60) return 'BUDGET_EXHAUSTED';
    const [caller] = campaign.callerNumberId
      ? await tx
          .select({ status: callerNumbers.status })
          .from(callerNumbers)
          .where(
            and(
              eq(callerNumbers.id, campaign.callerNumberId),
              eq(callerNumbers.organizationId, campaign.organizationId),
            ),
          )
      : [];
    if (caller?.status !== 'ACTIVE') return 'CALLER_NUMBER_UNAVAILABLE';
    const ruleSet = await this.rules.active(controls.defaultJurisdiction, now);
    if (!ruleSet) return 'NO_RULE_SET';
    const [identity] = await tx
      .select()
      .from(telecomIdentities)
      .where(eq(telecomIdentities.organizationId, campaign.organizationId));
    const invalid = telecomIdentityReasons(
      ruleSet.rules,
      identity
        ? {
            status: identity.status,
            sector: identity.sector,
            a2pDeclaredAt: identity.a2pDeclaredAt,
            selfCertifiedAt: identity.selfCertifiedAt,
          }
        : null,
      now,
    );
    return invalid.length > 0 ? 'TELECOM_IDENTITY_INVALID' : null;
  }

  /** A-17: continuous campaigns take in new matching leads, a bounded batch per tick. */
  private async enrollNew(tx: Database, campaign: Campaign): Promise<void> {
    const fresh = await tx
      .select({ id: leads.id })
      .from(leads)
      .leftJoin(
        campaignLeads,
        and(eq(campaignLeads.campaignId, campaign.id), eq(campaignLeads.leadId, leads.id)),
      )
      .where(
        and(
          selectionCondition(campaign.organizationId, campaign.selection),
          isNull(campaignLeads.id),
        ),
      )
      .limit(LEAD_BATCH_SIZE);
    if (fresh.length === 0) return;
    await tx
      .insert(campaignLeads)
      .values(
        fresh.map((l) => ({
          organizationId: campaign.organizationId,
          campaignId: campaign.id,
          leadId: l.id,
        })),
      )
      .onConflictDoNothing();
  }

  private async finish(
    tx: Database,
    campaign: Campaign,
    status: 'COMPLETED',
    reason: string | null,
  ): Promise<void> {
    await tx
      .update(campaigns)
      .set({ status, tickToken: null, completedAt: this.clock.now(), pauseReason: reason })
      .where(eq(campaigns.id, campaign.id));
    await this.audit.record(
      {
        action: 'campaign.completed',
        organizationId: campaign.organizationId,
        resourceType: 'campaign',
        resourceId: campaign.id,
        metadata: { reason },
      },
      undefined,
      tx,
    );
  }

  // ── Dial: re-check at dial time, then call at most once (FR-38, FR-39) ──

  async dial({ campaignLeadId, dialToken }: z.infer<typeof dialPayload>): Promise<void> {
    const now = this.clock.now();
    // Filled inside the transaction, acted on after it commits.
    const after: { place: PlaceTarget | null; reconcile: string | null } = {
      place: null,
      reconcile: null,
    };

    await this.db.transaction(async (tx) => {
      const [runState] = await tx
        .select()
        .from(campaignLeads)
        .where(eq(campaignLeads.id, campaignLeadId))
        .for('update');
      if (!runState || runState.dialToken !== dialToken) return;
      if (runState.state === 'IN_CALL') {
        // This job ran before and committed an attempt: never dial again, only reconcile.
        const [attempt] = await tx
          .select({ id: callAttempts.id })
          .from(callAttempts)
          .where(
            and(
              eq(callAttempts.campaignLeadId, runState.id),
              eq(callAttempts.status, 'DIALING'),
              isNull(callAttempts.providerCallId),
            ),
          )
          .limit(1);
        after.reconcile = attempt?.id ?? null;
        return;
      }
      if (runState.state !== 'QUEUED') return;

      await lockLeadForDial(tx, runState.leadId);
      const [campaign] = await tx
        .select()
        .from(campaigns)
        .where(
          and(
            eq(campaigns.id, runState.campaignId),
            eq(campaigns.organizationId, runState.organizationId),
          ),
        );
      if (!campaign || campaign.status !== 'RUNNING') {
        await tx
          .update(campaignLeads)
          .set({ state: runState.attemptsMade > 0 ? 'WAITING' : 'PENDING', dialToken: null })
          .where(eq(campaignLeads.id, runState.id));
        return;
      }

      const [decision] = await this.eligibility.evaluate(
        campaign,
        [runState.leadId],
        'DIAL',
        now,
        tx,
      );
      if (!decision) {
        await tx
          .update(campaignLeads)
          .set({ state: 'EXCLUDED', dialToken: null })
          .where(eq(campaignLeads.id, runState.id));
        return;
      }
      const recorded = {
        lastResult: decision.outcome.result,
        lastReasons: decision.outcome.reasons.map((r) => r.code),
      };
      switch (decision.outcome.result) {
        case 'ELIGIBLE': {
          const [caller] = await tx
            .select({ phone: callerNumbers.phoneE164 })
            .from(callerNumbers)
            .where(eq(callerNumbers.id, campaign.callerNumberId ?? ''));
          if (!caller || !decision.phoneE164)
            throw new PermanentJobError('eligible without numbers');
          const [attempt] = await tx
            .insert(callAttempts)
            .values({
              organizationId: campaign.organizationId,
              campaignId: campaign.id,
              campaignLeadId: runState.id,
              leadId: runState.leadId,
              attemptNumber: runState.attemptsMade + 1,
              decisionId: decision.decisionId,
              callerNumberId: campaign.callerNumberId,
              agentVersionId: campaign.agentVersionId,
              toPhoneE164: decision.phoneE164,
              provider: this.voice.name,
              dialRequestedAt: now,
              // Attempt times feed cooldown and pacing; keep them on the evaluation clock.
              createdAt: now,
            })
            .returning({ id: callAttempts.id });
          if (!attempt) throw new Error('attempt insert returned no row');
          await tx
            .update(campaignLeads)
            .set({
              ...recorded,
              state: 'IN_CALL',
              attemptsMade: runState.attemptsMade + 1,
              nextAttemptAt: null,
            })
            .where(eq(campaignLeads.id, runState.id));
          after.place = {
            attemptId: attempt.id,
            organizationId: campaign.organizationId,
            from: caller.phone,
            to: decision.phoneE164,
            obligations: decision.outcome.obligations,
            agentVersionId: campaign.agentVersionId,
          };
          return;
        }
        case 'DEFERRED':
          await tx
            .update(campaignLeads)
            .set({
              ...recorded,
              state: 'WAITING',
              dialToken: null,
              nextAttemptAt:
                decision.outcome.nextEligibleAt ?? new Date(now.getTime() + DEFAULT_DEFER_MS),
            })
            .where(eq(campaignLeads.id, runState.id));
          return;
        case 'BLOCKED':
          await tx
            .update(campaignLeads)
            .set({ ...recorded, state: 'BLOCKED', dialToken: null })
            .where(eq(campaignLeads.id, runState.id));
          return;
        case 'REQUIRES_REVIEW':
          await tx
            .update(campaignLeads)
            .set({ ...recorded, state: 'REVIEW', dialToken: null })
            .where(eq(campaignLeads.id, runState.id));
          await tx
            .insert(eligibilityReviews)
            .values({
              organizationId: campaign.organizationId,
              campaignId: campaign.id,
              campaignLeadId: runState.id,
              leadId: runState.leadId,
              decisionId: decision.decisionId,
              reasons: decision.outcome.reasons,
            })
            .onConflictDoNothing();
          return;
      }
    });

    if (after.reconcile) await this.reconcile(after.reconcile);
    const placing = after.place;
    if (!placing) return;
    try {
      const { providerCallId } = await this.voice.placeCall({
        reference: placing.attemptId,
        organizationId: placing.organizationId,
        from: placing.from,
        to: placing.to,
        obligations: placing.obligations,
        agentVersionId: placing.agentVersionId,
      });
      await this.db
        .update(callAttempts)
        .set({ providerCallId })
        .where(and(eq(callAttempts.id, placing.attemptId), isNull(callAttempts.providerCallId)));
    } catch (error) {
      this.logger.warn(
        {
          err: error,
          attemptId: placing.attemptId,
          organizationId: placing.organizationId,
          provider: this.voice.name,
        },
        'placeCall failed',
      );
      await this.outcomes.apply({
        attemptId: placing.attemptId,
        outcome: 'PROVIDER_ERROR',
        durationSeconds: 0,
      });
    }
  }

  /**
   * An attempt whose dial was requested but never confirmed: ask the provider by reference. If it
   * has no such call, close the attempt as PROVIDER_ERROR (retried under the policy). Never dials.
   */
  async reconcile(attemptId: string): Promise<void> {
    const found = await this.voice.findCall(attemptId);
    if (found) {
      await this.db
        .update(callAttempts)
        .set({ providerCallId: found.providerCallId })
        .where(and(eq(callAttempts.id, attemptId), isNull(callAttempts.providerCallId)));
      return;
    }
    await this.outcomes.apply({ attemptId, outcome: 'PROVIDER_ERROR', durationSeconds: 0 });
  }

  /** Starts a new tick chain (launch, resume). Call inside the transaction that changed status. */
  async startChain(tx: Database, campaign: Campaign, runAt: Date): Promise<string> {
    const tickToken = randomUUID();
    await tx.update(campaigns).set({ tickToken }).where(eq(campaigns.id, campaign.id));
    await this.queue.enqueue(
      {
        type: CAMPAIGN_JOBS.tick,
        organizationId: campaign.organizationId,
        payload: { campaignId: campaign.id, tickToken },
        runAt,
        idempotencyKey: `tick:${campaign.id}:${tickToken}`,
      },
      tx,
    );
    return tickToken;
  }

  /** Starts (or restarts) a pre-launch check. */
  async startPrelaunch(tx: Database, campaign: Campaign, checkId: string): Promise<void> {
    await this.queue.enqueue(
      {
        type: CAMPAIGN_JOBS.prelaunch,
        organizationId: campaign.organizationId,
        payload: { campaignId: campaign.id, checkId },
        idempotencyKey: `prelaunch:${checkId}:`,
      },
      tx,
    );
  }
}
