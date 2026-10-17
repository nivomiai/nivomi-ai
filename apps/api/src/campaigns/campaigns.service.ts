import { Inject, Injectable } from '@nestjs/common';
import {
  agentVersions,
  aiAgents,
  callAttempts,
  callerNumbers,
  campaignLeads,
  campaigns,
  contacts,
  eligibilityReviews,
  leads,
  telecomConsentEntries,
  type CampaignLeadState,
  type CampaignSelection,
  type Database,
  type PrelaunchSummary,
  type callCategories,
} from '@nivomi/database';
import { and, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { TenantPrincipal } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import { decodeCursor, toPage } from '../common/pagination.js';
import type { ClientContext } from '../common/request-context.js';
import { CallingControlsService, callingControls } from '../compliance/calling-controls.service.js';
import { Clock } from '../compliance/clock.js';
import { effectiveCallingWindow } from '../compliance/compliance-engine.js';
import { projectTelecomConsent, recordTelecomConsent } from '../compliance/consent-ledger.js';
import { RuleSetRegistry } from '../compliance/rule-set-registry.js';
import { DATABASE } from '../database/database.module.js';
import { cleanText } from '../leads/normalize.js';
import { CampaignRunner } from './campaign-runner.js';
import { PACING_LIMITS, RETRY_LIMITS } from './campaign-policy.js';
import { VOICE_PROVIDER, type VoiceProvider } from './voice-provider.js';

type Campaign = typeof campaigns.$inferSelect;

export interface CampaignInput {
  readonly name: string;
  readonly type: 'STATIC' | 'CONTINUOUS';
  readonly callCategory: (typeof callCategories)[number];
  readonly callerNumberId: string | null;
  /** The pinned Agent Version (FR-32); required to launch. */
  readonly agentVersionId: string | null;
  readonly selection: CampaignSelection;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly maxConcurrentCalls: number;
  readonly maxCallsPerHour: number;
  readonly maxAttempts: number;
  readonly retryIntervalMinutes: number;
  readonly maxAttemptsPerDay: number;
  readonly budgetMinutes: number;
}

/** Most leads a hand-picked campaign list may hold. */
export const MAX_LIST_LEADS = 5_000;

const notFound = () => new AppError('NOT_FOUND', 'Campaign not found.');

/** Campaign definition, lifecycle, progress, Emergency Stop and the review queue (§8.6–8.7). */
@Injectable()
export class CampaignsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly runner: CampaignRunner,
    private readonly controls: CallingControlsService,
    private readonly rules: RuleSetRegistry,
    private readonly clock: Clock,
    @Inject(VOICE_PROVIDER) private readonly voice: VoiceProvider,
    @InjectPinoLogger(CampaignsService.name) private readonly logger: PinoLogger,
  ) {}

  // ── Definition (FR-35) ─────────────────────────────────────────────────

  /** Validates a definition against product limits and, through the ComplianceEngine, the rules. */
  private async validate(tenant: TenantPrincipal, input: CampaignInput, db: Database) {
    const orgId = tenant.membership.organizationId;
    const details: string[] = [];
    if (input.type === 'CONTINUOUS' && input.selection.kind === 'LIST') {
      details.push('A continuous campaign needs a filter, not a fixed list.');
    }
    if (input.selection.kind === 'LIST' && !input.selection.leadIds?.length) {
      details.push('Choose at least one lead.');
    }
    if (input.maxAttempts > RETRY_LIMITS.maxAttempts) {
      details.push(`At most ${RETRY_LIMITS.maxAttempts} attempts per lead.`);
    }
    if (input.retryIntervalMinutes < RETRY_LIMITS.minRetryIntervalMinutes) {
      details.push(
        `Attempts must be at least ${RETRY_LIMITS.minRetryIntervalMinutes / 60} hours apart.`,
      );
    }
    if (input.maxAttemptsPerDay > RETRY_LIMITS.maxAttemptsPerDay) {
      details.push(`At most ${RETRY_LIMITS.maxAttemptsPerDay} attempts per lead per day.`);
    }
    if (input.maxConcurrentCalls > PACING_LIMITS.maxConcurrentCalls) {
      details.push(`At most ${PACING_LIMITS.maxConcurrentCalls} concurrent calls.`);
    }
    if (input.maxCallsPerHour > PACING_LIMITS.maxCallsPerHour) {
      details.push(`At most ${PACING_LIMITS.maxCallsPerHour} calls per hour.`);
    }
    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (startsAt && Number.isNaN(startsAt.getTime())) details.push('The start date is invalid.');
    if (endsAt && Number.isNaN(endsAt.getTime())) details.push('The end date is invalid.');
    if (endsAt && endsAt <= this.clock.now()) details.push('The end date must be in the future.');
    if (startsAt && endsAt && endsAt <= startsAt)
      details.push('The end date must be after the start.');

    const controls = await callingControls(db, orgId);
    const ruleSet = await this.rules.active(controls.defaultJurisdiction, this.clock.now());
    if (!ruleSet) {
      details.push('No rule set covers this organization’s jurisdiction.');
    } else {
      const window = effectiveCallingWindow(ruleSet.rules, input.callCategory, {
        start: input.windowStart,
        end: input.windowEnd,
      });
      if (!window.ok) details.push(window.message);
    }
    if (input.callerNumberId) {
      const [number] = await db
        .select({ id: callerNumbers.id })
        .from(callerNumbers)
        .where(
          and(eq(callerNumbers.id, input.callerNumberId), eq(callerNumbers.organizationId, orgId)),
        )
        .limit(1);
      if (!number) details.push('The caller number is not one of this organization’s numbers.');
    }
    if (input.agentVersionId) {
      const [version] = await db
        .select({ callCategory: agentVersions.callCategory })
        .from(agentVersions)
        .where(
          and(eq(agentVersions.id, input.agentVersionId), eq(agentVersions.organizationId, orgId)),
        )
        .limit(1);
      if (!version) {
        details.push('The AI agent version is not one of this organization’s agents.');
      } else if (version.callCategory !== input.callCategory) {
        details.push(
          `The AI agent is for ${version.callCategory.toLowerCase()} calls; the campaign's call type must match.`,
        );
      }
    }
    if (input.selection.kind === 'LIST' && input.selection.leadIds?.length) {
      const ids = [...new Set(input.selection.leadIds)];
      const [found] = await db
        .select({ n: count() })
        .from(leads)
        .where(and(eq(leads.organizationId, orgId), inArray(leads.id, ids)));
      if ((found?.n ?? 0) !== ids.length) details.push('Some selected leads were not found.');
    }
    if (details.length > 0)
      throw new AppError('VALIDATION_ERROR', 'Some campaign settings are invalid.', { details });
    return { startsAt, endsAt };
  }

  async create(tenant: TenantPrincipal, input: CampaignInput, context: ClientContext) {
    const orgId = tenant.membership.organizationId;
    return this.db.transaction(async (tx) => {
      const { startsAt, endsAt } = await this.validate(tenant, input, tx);
      const [row] = await tx
        .insert(campaigns)
        .values({
          organizationId: orgId,
          name: cleanText(input.name, 120) ?? 'Untitled campaign',
          type: input.type,
          callCategory: input.callCategory,
          callerNumberId: input.callerNumberId,
          agentVersionId: input.agentVersionId,
          selection: input.selection,
          windowStart: input.windowStart,
          windowEnd: input.windowEnd,
          startsAt,
          endsAt,
          maxConcurrentCalls: input.maxConcurrentCalls,
          maxCallsPerHour: input.maxCallsPerHour,
          maxAttempts: input.maxAttempts,
          retryIntervalMinutes: input.retryIntervalMinutes,
          maxAttemptsPerDay: input.maxAttemptsPerDay,
          budgetMinutes: input.budgetMinutes,
          createdByUserId: tenant.userId,
          editedAt: this.clock.now(),
        })
        .returning({ id: campaigns.id });
      if (!row) throw new Error('campaign insert returned no row');
      await this.audit.record(
        {
          action: 'campaign.created',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'campaign',
          resourceId: row.id,
          metadata: { name: input.name, callCategory: input.callCategory, type: input.type },
        },
        context,
        tx,
      );
      return { id: row.id };
    });
  }

  /** Only a DRAFT can be edited; an edit invalidates the pre-launch check. */
  async update(tenant: TenantPrincipal, id: string, input: CampaignInput, context: ClientContext) {
    await this.db.transaction(async (tx) => {
      const campaign = await this.lock(tx, tenant, id);
      if (campaign.status !== 'DRAFT')
        throw new AppError('CONFLICT', 'Only a draft campaign can be edited.');
      const { startsAt, endsAt } = await this.validate(tenant, input, tx);
      await tx.delete(campaignLeads).where(eq(campaignLeads.campaignId, id));
      await tx
        .update(campaigns)
        .set({
          name: cleanText(input.name, 120) ?? campaign.name,
          type: input.type,
          callCategory: input.callCategory,
          callerNumberId: input.callerNumberId,
          agentVersionId: input.agentVersionId,
          selection: input.selection,
          windowStart: input.windowStart,
          windowEnd: input.windowEnd,
          startsAt,
          endsAt,
          maxConcurrentCalls: input.maxConcurrentCalls,
          maxCallsPerHour: input.maxCallsPerHour,
          maxAttempts: input.maxAttempts,
          retryIntervalMinutes: input.retryIntervalMinutes,
          maxAttemptsPerDay: input.maxAttemptsPerDay,
          budgetMinutes: input.budgetMinutes,
          prelaunch: null,
          editedAt: this.clock.now(),
        })
        .where(eq(campaigns.id, id));
      await this.auditAction(tx, tenant, campaign, 'campaign.updated', context);
    });
  }

  /**
   * "Add to campaign" from the leads table: appends leads to a draft campaign's hand-picked list.
   * Like any edit, it clears the pre-launch check, so every added lead is still screened by the
   * eligibility engine before launch. Leads already on the list are ignored (safe to retry).
   */
  async addLeads(
    tenant: TenantPrincipal,
    id: string,
    leadIds: readonly string[],
    context: ClientContext,
  ): Promise<{ added: number; alreadyIncluded: number }> {
    const orgId = tenant.membership.organizationId;
    return this.db.transaction(async (tx) => {
      const campaign = await this.lock(tx, tenant, id);
      if (campaign.status !== 'DRAFT') {
        throw new AppError('CONFLICT', 'Leads can only be added to a draft campaign.');
      }
      if (campaign.selection.kind !== 'LIST') {
        throw new AppError(
          'CONFLICT',
          'This campaign picks its leads with a filter, so leads cannot be added by hand.',
        );
      }
      const requested = [...new Set(leadIds)];
      const [found] = await tx
        .select({ n: count() })
        .from(leads)
        .where(and(eq(leads.organizationId, orgId), inArray(leads.id, requested)));
      if ((found?.n ?? 0) !== requested.length) {
        throw new AppError('VALIDATION_ERROR', 'Some selected leads were not found.');
      }
      const current = new Set(campaign.selection.leadIds ?? []);
      const fresh = requested.filter((leadId) => !current.has(leadId));
      if (fresh.length === 0) return { added: 0, alreadyIncluded: requested.length };
      if (current.size + fresh.length > MAX_LIST_LEADS) {
        throw new AppError(
          'VALIDATION_ERROR',
          `A campaign list holds at most ${MAX_LIST_LEADS.toLocaleString('en-IN')} leads.`,
        );
      }
      await tx.delete(campaignLeads).where(eq(campaignLeads.campaignId, id));
      await tx
        .update(campaigns)
        .set({
          selection: { ...campaign.selection, leadIds: [...current, ...fresh] },
          prelaunch: null,
          editedAt: this.clock.now(),
        })
        .where(eq(campaigns.id, id));
      await this.auditAction(tx, tenant, campaign, 'campaign.updated', context, {
        leadsAdded: fresh.length,
      });
      return { added: fresh.length, alreadyIncluded: requested.length - fresh.length };
    });
  }

  // ── Lifecycle (FR-36, FR-37) ───────────────────────────────────────────

  private async lock(tx: Database, tenant: TenantPrincipal, id: string): Promise<Campaign> {
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(
        and(eq(campaigns.id, id), eq(campaigns.organizationId, tenant.membership.organizationId)),
      )
      .for('update');
    if (!campaign) throw notFound();
    return campaign;
  }

  private auditAction(
    tx: Database,
    tenant: TenantPrincipal,
    campaign: Campaign,
    action:
      | 'campaign.updated'
      | 'campaign.prelaunch_requested'
      | 'campaign.launched'
      | 'campaign.paused'
      | 'campaign.resumed'
      | 'campaign.stopped'
      | 'campaign.cancelled',
    context: ClientContext,
    metadata: Record<string, unknown> = {},
  ) {
    return this.audit.record(
      {
        action,
        organizationId: campaign.organizationId,
        actorUserId: tenant.userId,
        resourceType: 'campaign',
        resourceId: campaign.id,
        metadata: { from: campaign.status, ...metadata },
      },
      context,
      tx,
    );
  }

  /** FR-36: dry run of eligibility over the selection, in the background. */
  async requestPrelaunch(tenant: TenantPrincipal, id: string, context: ClientContext) {
    await this.db.transaction(async (tx) => {
      const campaign = await this.lock(tx, tenant, id);
      if (campaign.status !== 'DRAFT')
        throw new AppError('CONFLICT', 'Only a draft campaign is checked before launch.');
      const requestedAt = this.clock.now().toISOString();
      const summary: PrelaunchSummary = {
        checkId: randomUUID(),
        status: 'RUNNING',
        requestedAt,
        completedAt: null,
        total: 0,
        eligible: 0,
        deferred: 0,
        blocked: 0,
        review: 0,
        byReason: {},
        ruleSetVersion: null,
        cursor: null,
        error: null,
      };
      // The static snapshot is rebuilt by each check; a draft has no attempts to lose.
      await tx.delete(campaignLeads).where(eq(campaignLeads.campaignId, id));
      await tx.update(campaigns).set({ prelaunch: summary }).where(eq(campaigns.id, id));
      await this.runner.startPrelaunch(tx, campaign, summary.checkId);
      await this.auditAction(tx, tenant, campaign, 'campaign.prelaunch_requested', context);
    });
  }

  async launch(tenant: TenantPrincipal, id: string, context: ClientContext) {
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      const campaign = await this.lock(tx, tenant, id);
      if (campaign.status !== 'DRAFT')
        throw new AppError('CONFLICT', 'This campaign was already launched.');
      const check = campaign.prelaunch;
      if (check?.status !== 'COMPLETED' || new Date(check.requestedAt) < campaign.editedAt) {
        throw new AppError('CONFLICT', 'Run the pre-launch check first.');
      }
      if (check.eligible + check.deferred === 0) {
        throw new AppError(
          'CONFLICT',
          'No lead in this campaign can be called, so it cannot start.',
        );
      }
      if (!campaign.callerNumberId) throw new AppError('CONFLICT', 'Choose a caller number first.');
      if (!campaign.agentVersionId) {
        throw new AppError('CONFLICT', 'Choose a published AI agent version first.');
      }
      await this.assertCallingAllowed(tx, tenant.membership.organizationId);
      const scheduled = campaign.startsAt !== null && campaign.startsAt > now;
      await tx
        .update(campaigns)
        .set({
          status: scheduled ? 'SCHEDULED' : 'RUNNING',
          launchedAt: now,
          launchedByUserId: tenant.userId,
          pauseReason: null,
        })
        .where(eq(campaigns.id, id));
      await this.runner.startChain(
        tx,
        campaign,
        scheduled && campaign.startsAt ? campaign.startsAt : now,
      );
      await this.auditAction(tx, tenant, campaign, 'campaign.launched', context, {
        eligible: check.eligible,
        deferred: check.deferred,
        blocked: check.blocked,
        review: check.review,
        ruleSetVersion: check.ruleSetVersion,
      });
    });
  }

  private async assertCallingAllowed(tx: Database, organizationId: string) {
    const controls = await callingControls(tx, organizationId);
    if (controls.emergencyStopActive) {
      throw new AppError('CONFLICT', 'Emergency Stop is on. Release it before starting campaigns.');
    }
    if (controls.breakerTrippedAt) {
      throw new AppError(
        'CONFLICT',
        'The complaint breaker is tripped. Calling stays paused until it is cleared.',
      );
    }
  }

  async pause(tenant: TenantPrincipal, id: string, context: ClientContext) {
    await this.db.transaction(async (tx) => {
      const campaign = await this.lock(tx, tenant, id);
      if (campaign.status !== 'RUNNING' && campaign.status !== 'SCHEDULED') {
        throw new AppError('CONFLICT', 'Only a running or scheduled campaign can be paused.');
      }
      await tx
        .update(campaigns)
        .set({ status: 'PAUSED', pauseReason: 'MANUAL', tickToken: null })
        .where(eq(campaigns.id, id));
      await this.auditAction(tx, tenant, campaign, 'campaign.paused', context);
    });
  }

  /** Resuming is always explicit (FR-43), and never while Emergency Stop or the breaker is on. */
  async resume(tenant: TenantPrincipal, id: string, context: ClientContext) {
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      const campaign = await this.lock(tx, tenant, id);
      if (campaign.status !== 'PAUSED')
        throw new AppError('CONFLICT', 'Only a paused campaign can be resumed.');
      await this.assertCallingAllowed(tx, tenant.membership.organizationId);
      if (campaign.usedSeconds >= campaign.budgetMinutes * 60) {
        throw new AppError('CONFLICT', 'The minute budget is used up.');
      }
      const scheduled = campaign.startsAt !== null && campaign.startsAt > now;
      await tx
        .update(campaigns)
        .set({ status: scheduled ? 'SCHEDULED' : 'RUNNING', pauseReason: null })
        .where(eq(campaigns.id, id));
      await this.runner.startChain(tx, campaign, now);
      await this.auditAction(tx, tenant, campaign, 'campaign.resumed', context, {
        pauseReason: campaign.pauseReason,
      });
    });
  }

  /** Ends a launched campaign for good; calls in progress finish. */
  async stop(tenant: TenantPrincipal, id: string, context: ClientContext) {
    await this.db.transaction(async (tx) => {
      const campaign = await this.lock(tx, tenant, id);
      if (!['RUNNING', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) {
        throw new AppError('CONFLICT', 'Only a launched campaign can be stopped.');
      }
      await tx
        .update(campaigns)
        .set({
          status: 'STOPPED',
          tickToken: null,
          completedAt: this.clock.now(),
          pauseReason: 'MANUAL',
        })
        .where(eq(campaigns.id, id));
      await this.auditAction(tx, tenant, campaign, 'campaign.stopped', context);
    });
  }

  async cancel(tenant: TenantPrincipal, id: string, context: ClientContext) {
    await this.db.transaction(async (tx) => {
      const campaign = await this.lock(tx, tenant, id);
      if (campaign.status !== 'DRAFT')
        throw new AppError('CONFLICT', 'Only a draft can be cancelled.');
      await tx
        .update(campaigns)
        .set({ status: 'CANCELLED', tickToken: null })
        .where(eq(campaigns.id, id));
      await this.auditAction(tx, tenant, campaign, 'campaign.cancelled', context);
    });
  }

  // ── Emergency Stop (FR-43) ─────────────────────────────────────────────

  /**
   * Stops all dialling for the Organization: sets the flag every eligibility decision reads,
   * pauses running and scheduled campaigns, and asks the provider to end live calls.
   */
  async emergencyStop(tenant: TenantPrincipal, reason: string | null, context: ClientContext) {
    const orgId = tenant.membership.organizationId;
    const paused = await this.db.transaction(async (tx) => {
      const changed = await this.controls.setEmergencyStop(
        tx,
        orgId,
        true,
        tenant.userId,
        cleanText(reason, 500),
      );
      const rows = await tx
        .update(campaigns)
        .set({ status: 'PAUSED', pauseReason: 'EMERGENCY_STOP', tickToken: null })
        .where(
          and(
            eq(campaigns.organizationId, orgId),
            inArray(campaigns.status, ['RUNNING', 'SCHEDULED']),
          ),
        )
        .returning({ id: campaigns.id });
      if (changed || rows.length > 0) {
        await this.audit.record(
          {
            action: 'calling.emergency_stop_activated',
            organizationId: orgId,
            actorUserId: tenant.userId,
            resourceType: 'organization',
            resourceId: orgId,
            metadata: { reason: cleanText(reason, 500), pausedCampaigns: rows.map((r) => r.id) },
          },
          context,
          tx,
        );
      }
      return rows.length;
    });
    const live = await this.db
      .select({ providerCallId: callAttempts.providerCallId })
      .from(callAttempts)
      .where(and(eq(callAttempts.organizationId, orgId), eq(callAttempts.status, 'DIALING')));
    for (const call of live) {
      if (!call.providerCallId) continue;
      try {
        await this.voice.endCall(call.providerCallId);
      } catch (error) {
        this.logger.error(
          { err: error, organizationId: orgId, provider: this.voice.name },
          'endCall failed',
        );
      }
    }
    return { pausedCampaigns: paused, liveCallsEnded: live.length };
  }

  async releaseEmergencyStop(tenant: TenantPrincipal, context: ClientContext) {
    const orgId = tenant.membership.organizationId;
    await this.db.transaction(async (tx) => {
      const changed = await this.controls.setEmergencyStop(tx, orgId, false, tenant.userId, null);
      if (!changed) throw new AppError('CONFLICT', 'Emergency Stop is not on.');
      await this.audit.record(
        {
          action: 'calling.emergency_stop_released',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'organization',
          resourceId: orgId,
        },
        context,
        tx,
      );
    });
  }

  // ── Reading (FR-42) ────────────────────────────────────────────────────

  async list(tenant: TenantPrincipal, query: { limit: number; cursor?: string | undefined }) {
    const after = decodeCursor(query.cursor);
    const rows = await this.db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        type: campaigns.type,
        callCategory: campaigns.callCategory,
        pauseReason: campaigns.pauseReason,
        budgetMinutes: campaigns.budgetMinutes,
        usedSeconds: campaigns.usedSeconds,
        launchedAt: campaigns.launchedAt,
        /** LIST campaigns accept leads added from the leads table while in draft. */
        selectionKind: sql<'FILTER' | 'LIST'>`${campaigns.selection}->>'kind'`,
        createdAt: campaigns.createdAt,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.organizationId, tenant.membership.organizationId),
          after
            ? or(
                lt(campaigns.createdAt, after.createdAt),
                and(eq(campaigns.createdAt, after.createdAt), lt(campaigns.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(campaigns.createdAt), desc(campaigns.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit);
  }

  async get(tenant: TenantPrincipal, id: string) {
    const [row] = await this.db
      .select({
        campaign: campaigns,
        callerNumber: callerNumbers.phoneE164,
        callerSeries: callerNumbers.series,
        agentVersion: agentVersions.version,
        agentId: aiAgents.id,
        agentName: aiAgents.name,
      })
      .from(campaigns)
      .leftJoin(callerNumbers, eq(callerNumbers.id, campaigns.callerNumberId))
      .leftJoin(agentVersions, eq(agentVersions.id, campaigns.agentVersionId))
      .leftJoin(aiAgents, eq(aiAgents.id, agentVersions.agentId))
      .where(
        and(eq(campaigns.id, id), eq(campaigns.organizationId, tenant.membership.organizationId)),
      )
      .limit(1);
    if (!row) throw notFound();
    const c = row.campaign;
    const states = await this.db
      .select({ state: campaignLeads.state, n: count() })
      .from(campaignLeads)
      .where(eq(campaignLeads.campaignId, id))
      .groupBy(campaignLeads.state);
    // Both drivers (pg, PGlite) return `{ rows }` from a raw query.
    const reasonResult = (await this.db.execute(sql`
      select cl.state, r.code, count(*)::int as n
      from ${campaignLeads} cl, jsonb_array_elements_text(cl.last_reasons) as r(code)
      where cl.campaign_id = ${id} and cl.state in ('BLOCKED', 'REVIEW', 'WAITING')
      group by cl.state, r.code
      order by n desc`)) as {
      rows: { state: CampaignLeadState; code: string; n: number }[];
    };
    const outcomes = await this.db
      .select({ outcome: callAttempts.outcome, n: count() })
      .from(callAttempts)
      .where(and(eq(callAttempts.campaignId, id), eq(callAttempts.status, 'COMPLETED')))
      .groupBy(callAttempts.outcome);
    const [live] = await this.db
      .select({ n: count() })
      .from(callAttempts)
      .where(and(eq(callAttempts.campaignId, id), eq(callAttempts.status, 'DIALING')));
    const byState = Object.fromEntries(states.map((s) => [s.state, s.n])) as Partial<
      Record<CampaignLeadState, number>
    >;
    const remaining = (byState.PENDING ?? 0) + (byState.QUEUED ?? 0) + (byState.WAITING ?? 0);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      type: c.type,
      callCategory: c.callCategory,
      agentVersion:
        row.agentId && row.agentVersion !== null
          ? {
              id: c.agentVersionId,
              agentId: row.agentId,
              agentName: row.agentName,
              version: row.agentVersion,
            }
          : null,
      callerNumber: row.callerNumber
        ? { id: c.callerNumberId, phone: row.callerNumber, series: row.callerSeries }
        : null,
      selection: c.selection,
      windowStart: c.windowStart,
      windowEnd: c.windowEnd,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      maxConcurrentCalls: c.maxConcurrentCalls,
      maxCallsPerHour: c.maxCallsPerHour,
      maxAttempts: c.maxAttempts,
      retryIntervalMinutes: c.retryIntervalMinutes,
      maxAttemptsPerDay: c.maxAttemptsPerDay,
      budgetMinutes: c.budgetMinutes,
      usedSeconds: c.usedSeconds,
      pauseReason: c.pauseReason,
      prelaunch: c.prelaunch
        ? { ...c.prelaunch, stale: new Date(c.prelaunch.requestedAt) < c.editedAt }
        : null,
      launchedAt: c.launchedAt,
      completedAt: c.completedAt,
      createdAt: c.createdAt,
      progress: {
        leadsByState: byState,
        liveCalls: live?.n ?? 0,
        remaining,
        outcomes: Object.fromEntries(outcomes.map((o) => [o.outcome ?? 'UNKNOWN', o.n])),
        reasons: reasonResult.rows.map((r) => ({
          state: r.state,
          code: r.code,
          count: Number(r.n),
        })),
      },
    };
  }

  async attempts(
    tenant: TenantPrincipal,
    id: string,
    query: { limit: number; cursor?: string | undefined },
  ) {
    await this.assertCampaign(tenant, id);
    const after = decodeCursor(query.cursor);
    const rows = await this.db
      .select({
        id: callAttempts.id,
        leadId: callAttempts.leadId,
        leadName: contacts.fullName,
        attemptNumber: callAttempts.attemptNumber,
        status: callAttempts.status,
        outcome: callAttempts.outcome,
        durationSeconds: callAttempts.durationSeconds,
        createdAt: callAttempts.createdAt,
        endedAt: callAttempts.endedAt,
      })
      .from(callAttempts)
      .innerJoin(leads, eq(leads.id, callAttempts.leadId))
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(
        and(
          eq(callAttempts.campaignId, id),
          eq(callAttempts.organizationId, tenant.membership.organizationId),
          after
            ? or(
                lt(callAttempts.createdAt, after.createdAt),
                and(eq(callAttempts.createdAt, after.createdAt), lt(callAttempts.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(callAttempts.createdAt), desc(callAttempts.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit);
  }

  async campaignLeadList(
    tenant: TenantPrincipal,
    id: string,
    query: { limit: number; cursor?: string | undefined; state?: CampaignLeadState | undefined },
  ) {
    await this.assertCampaign(tenant, id);
    const after = decodeCursor(query.cursor);
    const rows = await this.db
      .select({
        id: campaignLeads.id,
        leadId: campaignLeads.leadId,
        fullName: contacts.fullName,
        phone: contacts.phoneE164,
        state: campaignLeads.state,
        attemptsMade: campaignLeads.attemptsMade,
        nextAttemptAt: campaignLeads.nextAttemptAt,
        lastResult: campaignLeads.lastResult,
        lastReasons: campaignLeads.lastReasons,
        lastOutcome: campaignLeads.lastOutcome,
        createdAt: campaignLeads.enrolledAt,
      })
      .from(campaignLeads)
      .innerJoin(leads, eq(leads.id, campaignLeads.leadId))
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(
        and(
          eq(campaignLeads.campaignId, id),
          eq(campaignLeads.organizationId, tenant.membership.organizationId),
          query.state ? eq(campaignLeads.state, query.state) : undefined,
          after
            ? or(
                lt(campaignLeads.enrolledAt, after.createdAt),
                and(eq(campaignLeads.enrolledAt, after.createdAt), lt(campaignLeads.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(campaignLeads.enrolledAt), desc(campaignLeads.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit);
  }

  private async assertCampaign(tenant: TenantPrincipal, id: string) {
    const [found] = await this.db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        and(eq(campaigns.id, id), eq(campaigns.organizationId, tenant.membership.organizationId)),
      )
      .limit(1);
    if (!found) throw notFound();
  }

  // ── REQUIRES_REVIEW queue (FR-50) ──────────────────────────────────────

  async listReviews(
    tenant: TenantPrincipal,
    query: { limit: number; cursor?: string | undefined },
  ) {
    const after = decodeCursor(query.cursor);
    const rows = await this.db
      .select({
        id: eligibilityReviews.id,
        campaignId: eligibilityReviews.campaignId,
        campaignName: campaigns.name,
        leadId: eligibilityReviews.leadId,
        leadName: contacts.fullName,
        reasons: eligibilityReviews.reasons,
        decisionId: eligibilityReviews.decisionId,
        createdAt: eligibilityReviews.createdAt,
      })
      .from(eligibilityReviews)
      .innerJoin(campaigns, eq(campaigns.id, eligibilityReviews.campaignId))
      .innerJoin(leads, eq(leads.id, eligibilityReviews.leadId))
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(
        and(
          eq(eligibilityReviews.organizationId, tenant.membership.organizationId),
          eq(eligibilityReviews.status, 'OPEN'),
          after
            ? or(
                lt(eligibilityReviews.createdAt, after.createdAt),
                and(
                  eq(eligibilityReviews.createdAt, after.createdAt),
                  lt(eligibilityReviews.id, after.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(eligibilityReviews.createdAt), desc(eligibilityReviews.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit);
  }

  /**
   * Resolving supplies facts or excludes the lead; the lead is then evaluated again at its next
   * dial, so a review can never override a BLOCKED rule (FR-50).
   */
  async resolveReview(
    tenant: TenantPrincipal,
    reviewId: string,
    input: {
      action: 'RECHECK' | 'EXCLUDE' | 'RECORD_CONSENT_DATE';
      consentAt?: string | null | undefined;
      note?: string | null | undefined;
    },
    context: ClientContext,
  ) {
    const orgId = tenant.membership.organizationId;
    await this.db.transaction(async (tx) => {
      const [review] = await tx
        .select()
        .from(eligibilityReviews)
        .where(
          and(eq(eligibilityReviews.id, reviewId), eq(eligibilityReviews.organizationId, orgId)),
        )
        .for('update');
      if (!review) throw new AppError('NOT_FOUND', 'Review item not found.');
      if (review.status !== 'OPEN')
        throw new AppError('CONFLICT', 'This item was already resolved.');

      if (input.action === 'RECORD_CONSENT_DATE') {
        const at = input.consentAt ? new Date(input.consentAt) : null;
        if (!at || Number.isNaN(at.getTime()) || at > this.clock.now()) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Enter the date the consent or inquiry was given.',
          );
        }
        const [lead] = await tx
          .select({ id: leads.id, contactId: leads.contactId, phone: contacts.phoneE164 })
          .from(leads)
          .innerJoin(contacts, eq(contacts.id, leads.contactId))
          .where(and(eq(leads.id, review.leadId), eq(leads.organizationId, orgId)));
        const [grant] = lead?.phone
          ? await tx
              .select()
              .from(telecomConsentEntries)
              .where(
                and(
                  eq(telecomConsentEntries.organizationId, orgId),
                  eq(telecomConsentEntries.phoneE164, lead.phone),
                  eq(telecomConsentEntries.kind, 'GRANT'),
                ),
              )
              .orderBy(desc(telecomConsentEntries.createdAt))
              .limit(1)
          : [];
        if (!lead?.phone || !grant?.basis) {
          throw new AppError('CONFLICT', 'This lead has no consent basis to date.');
        }
        const evidence = {
          ...(grant.evidence ?? { source: null, reference: null, operatorConsentReference: null }),
          at: at.toISOString(),
          attestedByUserId: tenant.userId,
        };
        await recordTelecomConsent(tx, {
          organizationId: orgId,
          contactId: lead.contactId,
          leadId: lead.id,
          phoneE164: lead.phone,
          kind: 'GRANT',
          basis: grant.basis,
          evidence,
          source: 'REVIEW',
          note: cleanText(input.note, 500),
          recordedByUserId: tenant.userId,
          eventKey: `review:${review.id}`,
        });
        await projectTelecomConsent(tx, lead.id, { kind: 'GRANT', basis: grant.basis, evidence });
      }

      const exclude = input.action === 'EXCLUDE';
      await tx
        .update(eligibilityReviews)
        .set({
          status: exclude ? 'EXCLUDED' : 'RESOLVED',
          resolution: input.action,
          resolutionNote: cleanText(input.note, 500),
          resolvedByUserId: tenant.userId,
          resolvedAt: this.clock.now(),
        })
        .where(eq(eligibilityReviews.id, review.id));
      await tx
        .update(campaignLeads)
        .set(exclude ? { state: 'EXCLUDED' } : { state: 'PENDING', nextAttemptAt: null })
        .where(and(eq(campaignLeads.id, review.campaignLeadId), eq(campaignLeads.state, 'REVIEW')));
      await this.audit.record(
        {
          action: 'compliance.review_resolved',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'eligibility_review',
          resourceId: review.id,
          metadata: { action: input.action, leadId: review.leadId, campaignId: review.campaignId },
        },
        context,
        tx,
      );
    });
  }
}
