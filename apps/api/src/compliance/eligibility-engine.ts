import type {
  CallCategory,
  EligibilityReasonRecord,
  EligibilityResultValue,
  leadStatuses,
} from '@nivomi/database';
import {
  evaluateCompliance,
  type ComplianceInput,
  type ComplianceObligations,
} from './compliance-engine.js';
import { localClock, nextLocalMidnight } from './local-time.js';
import { combine, reason } from './reasons.js';
import type { LoadedRuleSet } from './rule-set.schema.js';

/**
 * The eligibility gate (FR-44/FR-45): product rules — organization state, calling controls, lead
 * status, suppression, attempts, pacing limits and budget — combined with the ComplianceEngine's
 * regulatory checks. Pure, like the ComplianceEngine; the EligibilityService gathers inputs and
 * records the decision.
 */

type LeadStatus = (typeof leadStatuses)[number];

/** FR-25: statuses a campaign never calls by default. */
const EXCLUDED_STATUSES: ReadonlySet<LeadStatus> = new Set(['CONVERTED', 'CLOSED']);

export interface EligibilityInput extends Omit<
  ComplianceInput,
  'category' | 'campaignWindow' | 'recipientPhoneE164'
> {
  readonly organization: {
    readonly status: 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
    readonly emergencyStopActive: boolean;
    readonly breakerTripped: boolean;
  };
  readonly campaign: {
    readonly callCategory: CallCategory;
    readonly windowStart: string;
    readonly windowEnd: string;
    readonly startsAt: Date | null;
    readonly endsAt: Date | null;
    readonly maxAttempts: number;
    readonly retryIntervalMinutes: number;
    readonly maxAttemptsPerDay: number;
    readonly budgetSeconds: number;
    readonly usedSeconds: number;
  };
  readonly lead: { readonly status: LeadStatus; readonly phoneE164: string | null };
  readonly suppressed: boolean;
  readonly attempts: {
    /** When this lead was dialled in this campaign. */
    readonly dialTimes: readonly Date[];
    /** A call to this lead is live in any campaign (FR-41). */
    readonly liveCall: boolean;
    /** Connected calls to this lead across the organization in the last two days (A-19). */
    readonly connectedTimes: readonly Date[];
  };
}

export interface EligibilityOutcome {
  readonly result: EligibilityResultValue;
  readonly reasons: EligibilityReasonRecord[];
  readonly jurisdiction: string | null;
  readonly ruleSetId: string | null;
  readonly ruleSetVersion: number | null;
  /** For DEFERRED: the earliest time a new evaluation can succeed, when known. */
  readonly nextEligibleAt: Date | null;
  readonly obligations: ComplianceObligations | null;
}

/**
 * `ruleSet` is the active Rule Set for the recipient's jurisdiction, or null when none covers it
 * (the decision is then REQUIRES_REVIEW, never ELIGIBLE).
 */
export function evaluateEligibility(
  input: EligibilityInput,
  ruleSet: LoadedRuleSet | null,
): EligibilityOutcome {
  const reasons: EligibilityReasonRecord[] = [];
  const deferUntil: (Date | null)[] = [];
  const { now, organization, campaign, lead, attempts } = input;

  if (organization.status !== 'ACTIVE') reasons.push(reason('ORGANIZATION_NOT_ACTIVE'));
  if (organization.emergencyStopActive) reasons.push(reason('EMERGENCY_STOP_ACTIVE'));
  if (organization.breakerTripped) reasons.push(reason('COMPLAINT_BREAKER_TRIPPED'));

  if (lead.status === 'DO_NOT_CALL') reasons.push(reason('LEAD_DO_NOT_CALL'));
  if (EXCLUDED_STATUSES.has(lead.status)) reasons.push(reason('LEAD_STATUS_EXCLUDED'));
  if (input.suppressed) reasons.push(reason('SUPPRESSED'));

  if (campaign.endsAt && campaign.endsAt <= now) reasons.push(reason('CAMPAIGN_ENDED'));
  if (campaign.startsAt && campaign.startsAt > now) {
    reasons.push(reason('CAMPAIGN_NOT_STARTED'));
    deferUntil.push(campaign.startsAt);
  }
  if (campaign.usedSeconds >= campaign.budgetSeconds) {
    reasons.push(reason('BUDGET_EXHAUSTED'));
    deferUntil.push(null);
  }

  const timezone = ruleSet?.rules.timezone ?? 'UTC';
  if (attempts.dialTimes.length >= campaign.maxAttempts) {
    reasons.push(reason('MAX_ATTEMPTS_REACHED'));
  } else {
    const last = Math.max(0, ...attempts.dialTimes.map((d) => d.getTime()));
    const cooldownEnds = last + campaign.retryIntervalMinutes * 60_000;
    if (last > 0 && cooldownEnds > now.getTime()) {
      reasons.push(reason('COOLDOWN_ACTIVE'));
      deferUntil.push(new Date(cooldownEnds));
    }
    const today = localClock(now, timezone).day;
    const sameDay = (d: Date) => localClock(d, timezone).day === today;
    if (attempts.dialTimes.filter(sameDay).length >= campaign.maxAttemptsPerDay) {
      reasons.push(reason('DAILY_ATTEMPT_CAP'));
      deferUntil.push(nextLocalMidnight(now, timezone));
    }
    if (attempts.connectedTimes.some(sameDay)) {
      reasons.push(reason('ALREADY_CONNECTED_TODAY'));
      deferUntil.push(nextLocalMidnight(now, timezone));
    }
  }
  if (attempts.liveCall) {
    reasons.push(reason('CALL_IN_PROGRESS'));
    deferUntil.push(null);
  }

  let obligations: ComplianceObligations | null = null;
  if (!lead.phoneE164) {
    reasons.push(reason('NO_PHONE_NUMBER'));
  } else if (!ruleSet) {
    reasons.push(reason('UNKNOWN_JURISDICTION'));
  } else {
    const compliance = evaluateCompliance(ruleSet, {
      now,
      category: campaign.callCategory,
      campaignWindow: { start: campaign.windowStart, end: campaign.windowEnd },
      recipientPhoneE164: lead.phoneE164,
      telecomIdentity: input.telecomIdentity,
      callerNumber: input.callerNumber,
      telecomConsent: input.telecomConsent,
      dpdpConsent: input.dpdpConsent,
      preference: input.preference,
    });
    reasons.push(...compliance.reasons);
    obligations = compliance.obligations;
    if (compliance.windowOpensAt) deferUntil.push(compliance.windowOpensAt);
    if (compliance.reasons.some((r) => r.code === 'PREFERENCE_REGISTRY_UNAVAILABLE')) {
      deferUntil.push(null);
    }
  }

  const result = combine(reasons);
  const known = deferUntil.filter((d): d is Date => d !== null);
  const nextEligibleAt =
    result === 'DEFERRED' && known.length > 0 && known.length === deferUntil.length
      ? new Date(Math.max(...known.map((d) => d.getTime())))
      : null;

  return {
    result,
    reasons,
    jurisdiction: ruleSet?.jurisdiction ?? null,
    ruleSetId: ruleSet?.id ?? null,
    ruleSetVersion: ruleSet?.version ?? null,
    nextEligibleAt,
    obligations,
  };
}
