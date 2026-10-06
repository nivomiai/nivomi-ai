import { Inject, Injectable } from '@nestjs/common';
import {
  agentVersions,
  callAttempts,
  callerNumbers,
  campaignLeads,
  campaigns,
  contacts,
  crmConnections,
  eligibilityReviews,
  leadStatusChanges,
  leads,
  telecomIdentities,
  type CampaignLeadState,
  type Database,
} from '@nivomi/database';
import { and, count, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import type { TenantPrincipal } from '../auth/principal.js';
import { roleHasPermission } from '../authorization/permissions.js';
import { callingControls } from '../compliance/calling-controls.service.js';
import { Clock } from '../compliance/clock.js';
import { startOfLocalDay } from '../compliance/local-time.js';
import { RuleSetRegistry } from '../compliance/rule-set-registry.js';
import { DATABASE } from '../database/database.module.js';

const ACTIVE_CAMPAIGN_STATUSES = ['RUNNING', 'SCHEDULED', 'PAUSED'] as const;
/** Outcomes where nobody picked up (addendum §4). */
const UNANSWERED = ['NO_ANSWER', 'BUSY', 'FAILED', 'PROVIDER_ERROR'] as const;
const INTERESTED_STATUSES = ['INTERESTED', 'QUALIFIED', 'APPOINTMENT_BOOKED'] as const;
const BUDGET_WARNING_PERCENT = 70;
const QUEUE_LIMIT = 200;

/** Priority of a lead's run state in the call queue: what happens soonest first. */
const QUEUE_ORDER: Record<CampaignLeadState, number> = {
  IN_CALL: 0,
  QUEUED: 1,
  PENDING: 2,
  WAITING: 3,
  REVIEW: 4,
  BLOCKED: 5,
  EXCLUDED: 6,
  DONE: 7,
};

export type QueueFilter = 'upcoming' | 'review' | 'blocked' | 'all';

/**
 * The operations dashboard and call queue (MVP mock-up; PRD FR-42, FR-106). Aggregates only,
 * always within the tenant; under 3-tier RBAC every member sees all org data.
 */
@Injectable()
export class DashboardService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rules: RuleSetRegistry,
    private readonly clock: Clock,
  ) {}

  async summary(tenant: TenantPrincipal) {
    const orgId = tenant.membership.organizationId;
    const now = this.clock.now();
    const controls = await callingControls(this.db, orgId);
    const ruleSet = await this.rules.active(controls.defaultJurisdiction, now);
    const timezone = ruleSet?.rules.timezone ?? 'Asia/Kolkata';
    const dayStart = startOfLocalDay(now, timezone);
    // 3-tier RBAC: no within-tenant scoping; every member sees all org leads.
    const leadScope: SQL = eq(leads.organizationId, orgId);

    const calls = await this.db
      .select({ status: callAttempts.status, outcome: callAttempts.outcome, n: count() })
      .from(callAttempts)
      .innerJoin(leads, eq(leads.id, callAttempts.leadId))
      .where(
        and(
          leadScope,
          eq(callAttempts.organizationId, orgId),
          gte(callAttempts.createdAt, dayStart),
        ),
      )
      .groupBy(callAttempts.status, callAttempts.outcome);
    const dialled = calls.reduce((n, c) => n + c.n, 0);
    const finished = calls.filter((c) => c.status === 'COMPLETED');
    const completed = finished.reduce((n, c) => n + c.n, 0);
    const answered = finished
      .filter((c) => c.outcome && !(UNANSWERED as readonly string[]).includes(c.outcome))
      .reduce((n, c) => n + c.n, 0);
    const connected = finished
      .filter((c) => c.outcome === 'CONNECTED')
      .reduce((n, c) => n + c.n, 0);

    const changesToday = await this.db
      .select({
        to: leadStatusChanges.toStatus,
        n: sql<number>`count(distinct ${leadStatusChanges.leadId})::int`,
      })
      .from(leadStatusChanges)
      .innerJoin(leads, eq(leads.id, leadStatusChanges.leadId))
      .where(
        and(
          leadScope,
          gte(leadStatusChanges.createdAt, dayStart),
          inArray(leadStatusChanges.toStatus, [...INTERESTED_STATUSES]),
        ),
      )
      .groupBy(leadStatusChanges.toStatus);
    const interestedToday = changesToday.reduce((n, c) => n + Number(c.n), 0);
    const qualifiedToday = changesToday
      .filter((c) => c.to === 'QUALIFIED' || c.to === 'APPOINTMENT_BOOKED')
      .reduce((n, c) => n + Number(c.n), 0);

    const statuses = await this.db
      .select({ status: leads.status, n: count() })
      .from(leads)
      .where(leadScope)
      .groupBy(leads.status);
    const byStatus = Object.fromEntries(statuses.map((s) => [s.status, s.n])) as Record<
      string,
      number
    >;
    const totalLeads = statuses.reduce((n, s) => n + s.n, 0);

    const canCampaigns = roleHasPermission(tenant.membership.role, 'campaigns.read');

    // Setup progress: four signals the Overview turns into a numbered checklist for new tenants.
    // agent_versions rows are only inserted on publish (every version is already published), so
    // "any row" = "the org has published at least one agent".
    const [agentPub] = await this.db
      .select({ n: count() })
      .from(agentVersions)
      .where(eq(agentVersions.organizationId, orgId));
    const [callerVerified] = await this.db
      .select({ n: count() })
      .from(callerNumbers)
      .where(and(eq(callerNumbers.organizationId, orgId), eq(callerNumbers.status, 'ACTIVE')));
    const [campaignAny] = await this.db
      .select({ n: count() })
      .from(campaigns)
      .where(eq(campaigns.organizationId, orgId));

    return {
      timezone,
      since: dayStart,
      today: {
        dialled,
        completed,
        answered,
        connected,
        answerRate: completed > 0 ? answered / completed : null,
      },
      funnel: [
        { stage: 'Dialled', count: dialled },
        { stage: 'Answered', count: answered },
        { stage: 'Conversations', count: connected },
        { stage: 'Interested', count: interestedToday },
        { stage: 'Qualified', count: qualifiedToday },
      ],
      leads: {
        total: totalLeads,
        qualified: byStatus.QUALIFIED ?? 0,
        appointments: byStatus.APPOINTMENT_BOOKED ?? 0,
        doNotCall: byStatus.DO_NOT_CALL ?? 0,
      },
      setup: {
        agentsPublished: Number(agentPub?.n ?? 0),
        callerNumbersVerified: Number(callerVerified?.n ?? 0),
        hasLeads: totalLeads > 0,
        campaignCount: Number(campaignAny?.n ?? 0),
      },
      attention: canCampaigns ? await this.attention(tenant, controls) : [],
      campaigns: canCampaigns ? await this.activeCampaigns(orgId) : [],
    };
  }

  /** Things an operator should look at, each with where to go (MVP "Attention required"). */
  private async attention(
    tenant: TenantPrincipal,
    controls: Awaited<ReturnType<typeof callingControls>>,
  ) {
    const orgId = tenant.membership.organizationId;
    const items: {
      code: string;
      label: string;
      count: number | null;
      href: string;
      severity: 'critical' | 'warning';
    }[] = [];
    if (controls.emergencyStopActive) {
      items.push({
        code: 'EMERGENCY_STOP',
        label: 'Emergency Stop is on',
        count: null,
        href: '/app/campaigns',
        severity: 'critical',
      });
    }
    if (controls.breakerTrippedAt) {
      items.push({
        code: 'COMPLAINT_BREAKER',
        label: 'Complaint breaker has paused calling',
        count: null,
        href: '/app/compliance',
        severity: 'critical',
      });
    }
    const [identity] = await this.db
      .select({ status: telecomIdentities.status })
      .from(telecomIdentities)
      .where(eq(telecomIdentities.organizationId, orgId));
    if (identity?.status !== 'VERIFIED') {
      items.push({
        code: 'TELECOM_IDENTITY',
        label: 'Telecom identity not verified: calling is blocked',
        count: null,
        href: '/app/telecom',
        severity: 'critical',
      });
    }
    const states = await this.db
      .select({ state: campaignLeads.state, n: count() })
      .from(campaignLeads)
      .innerJoin(campaigns, eq(campaigns.id, campaignLeads.campaignId))
      .where(
        and(
          eq(campaignLeads.organizationId, orgId),
          inArray(campaigns.status, [...ACTIVE_CAMPAIGN_STATUSES]),
          inArray(campaignLeads.state, ['BLOCKED', 'WAITING']),
        ),
      )
      .groupBy(campaignLeads.state);
    const [reviews] = await this.db
      .select({ n: count() })
      .from(eligibilityReviews)
      .where(
        and(eq(eligibilityReviews.organizationId, orgId), eq(eligibilityReviews.status, 'OPEN')),
      );
    if ((reviews?.n ?? 0) > 0) {
      items.push({
        code: 'REVIEW_QUEUE',
        label: 'Leads need a compliance review',
        count: reviews?.n ?? 0,
        href: '/app/compliance/reviews',
        severity: 'warning',
      });
    }
    const blocked = states.find((s) => s.state === 'BLOCKED')?.n ?? 0;
    if (blocked > 0) {
      items.push({
        code: 'COMPLIANCE_BLOCKS',
        label: 'Compliance blocks in active campaigns',
        count: blocked,
        href: '/app/call-queue?filter=blocked',
        severity: 'warning',
      });
    }
    const waiting = states.find((s) => s.state === 'WAITING')?.n ?? 0;
    if (waiting > 0) {
      items.push({
        code: 'RETRIES',
        label: 'Leads waiting to retry',
        count: waiting,
        href: '/app/call-queue',
        severity: 'warning',
      });
    }
    const [overBudget] = await this.db
      .select({ n: count() })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.organizationId, orgId),
          inArray(campaigns.status, [...ACTIVE_CAMPAIGN_STATUSES]),
          // Integer arithmetic only: used ≥ 70% of the budget, in seconds.
          sql`${campaigns.usedSeconds} * 100 >= ${campaigns.budgetMinutes} * 60 * ${BUDGET_WARNING_PERCENT}`,
        ),
      );
    if ((overBudget?.n ?? 0) > 0) {
      items.push({
        code: 'BUDGET',
        label: `Campaigns past ${BUDGET_WARNING_PERCENT}% of their minute budget`,
        count: overBudget?.n ?? 0,
        href: '/app/campaigns',
        severity: 'warning',
      });
    }
    const [crm] = await this.db
      .select({ status: crmConnections.status })
      .from(crmConnections)
      .where(eq(crmConnections.organizationId, orgId));
    if (crm && (crm.status === 'TOKEN_INVALID' || crm.status === 'DEGRADED')) {
      items.push({
        code: 'CRM',
        label: 'HubSpot needs attention',
        count: null,
        href: '/app/data-sources',
        severity: 'warning',
      });
    }
    return items;
  }

  private async activeCampaigns(orgId: string) {
    const rows = await this.db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        pauseReason: campaigns.pauseReason,
        budgetMinutes: campaigns.budgetMinutes,
        usedSeconds: campaigns.usedSeconds,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.organizationId, orgId),
          inArray(campaigns.status, [...ACTIVE_CAMPAIGN_STATUSES]),
        ),
      )
      .orderBy(campaigns.createdAt)
      .limit(20);
    if (rows.length === 0) return [];
    const progress = await this.db
      .select({ campaignId: campaignLeads.campaignId, state: campaignLeads.state, n: count() })
      .from(campaignLeads)
      .where(
        inArray(
          campaignLeads.campaignId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(campaignLeads.campaignId, campaignLeads.state);
    const attempts = await this.db
      .select({ campaignId: callAttempts.campaignId, n: count() })
      .from(callAttempts)
      .where(
        inArray(
          callAttempts.campaignId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(callAttempts.campaignId);
    return rows.map((r) => {
      const mine = progress.filter((p) => p.campaignId === r.id);
      const total = mine.reduce((n, p) => n + p.n, 0);
      const settled = mine
        .filter((p) => ['DONE', 'BLOCKED', 'EXCLUDED'].includes(p.state))
        .reduce((n, p) => n + p.n, 0);
      return {
        ...r,
        leads: total,
        settled,
        calls: attempts.find((a) => a.campaignId === r.id)?.n ?? 0,
      };
    });
  }

  /** "Every row explains why a call will or will not happen" (MVP call queue). */
  async queue(tenant: TenantPrincipal, filter: QueueFilter) {
    const orgId = tenant.membership.organizationId;
    const states: CampaignLeadState[] =
      filter === 'upcoming'
        ? ['IN_CALL', 'QUEUED', 'PENDING', 'WAITING']
        : filter === 'review'
          ? ['REVIEW']
          : filter === 'blocked'
            ? ['BLOCKED']
            : ['IN_CALL', 'QUEUED', 'PENDING', 'WAITING', 'REVIEW', 'BLOCKED'];
    const rows = await this.db
      .select({
        id: campaignLeads.id,
        state: campaignLeads.state,
        attemptsMade: campaignLeads.attemptsMade,
        nextAttemptAt: campaignLeads.nextAttemptAt,
        lastResult: campaignLeads.lastResult,
        lastReasons: campaignLeads.lastReasons,
        lastOutcome: campaignLeads.lastOutcome,
        campaignId: campaigns.id,
        campaignName: campaigns.name,
        campaignStatus: campaigns.status,
        leadId: leads.id,
        leadStatus: leads.status,
        fullName: contacts.fullName,
        phone: contacts.phoneE164,
      })
      .from(campaignLeads)
      .innerJoin(campaigns, eq(campaigns.id, campaignLeads.campaignId))
      .innerJoin(leads, eq(leads.id, campaignLeads.leadId))
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(
        and(
          eq(campaignLeads.organizationId, orgId),
          inArray(campaigns.status, [...ACTIVE_CAMPAIGN_STATUSES]),
          inArray(campaignLeads.state, states),
        ),
      )
      .orderBy(
        sql`case ${campaignLeads.state} ${sql.join(
          Object.entries(QUEUE_ORDER).map(([state, rank]) => sql`when ${state} then ${rank}`),
          sql` `,
        )} end`,
        sql`${campaignLeads.nextAttemptAt} asc nulls first`,
        campaignLeads.enrolledAt,
      )
      .limit(QUEUE_LIMIT + 1);
    return {
      items: rows.slice(0, QUEUE_LIMIT),
      /** The queue shows the first N by priority; the campaign pages hold the full lists. */
      truncated: rows.length > QUEUE_LIMIT,
    };
  }
}
