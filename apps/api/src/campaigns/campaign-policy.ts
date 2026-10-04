import {
  leads,
  type CallOutcome,
  type CampaignSelection,
  type leadStatuses,
} from '@nivomi/database';
import { and, eq, inArray, type SQL } from 'drizzle-orm';

/**
 * Product policy for campaigns (PRD FR-35–FR-41). These are product defaults and limits
 * (assumptions A-18, A-19), not regulatory rules — those live in Rule Sets.
 */

type LeadStatus = (typeof leadStatuses)[number];

/** FR-40 defaults (A-18); a campaign may only tighten them. */
export const RETRY_LIMITS = {
  maxAttempts: 3,
  minRetryIntervalMinutes: 240,
  maxAttemptsPerDay: 2,
} as const;

export const PACING_LIMITS = { maxConcurrentCalls: 20, maxCallsPerHour: 1_000 } as const;

/** Leads per pre-launch and enrollment step (bounded work per job, resumable). */
export const LEAD_BATCH_SIZE = 500;

/** FR-40: dispositions retried under the retry policy; everything else ends the lead's run. */
export const RETRYABLE_OUTCOMES: ReadonlySet<CallOutcome> = new Set([
  'NO_ANSWER',
  'BUSY',
  'FAILED',
  'PROVIDER_ERROR',
]);

/** The leads a campaign's selection matches, always within its Organization. */
export function selectionCondition(organizationId: string, selection: CampaignSelection): SQL {
  const conditions: SQL[] = [eq(leads.organizationId, organizationId)];
  if (selection.kind === 'LIST') {
    conditions.push(inArray(leads.id, [...(selection.leadIds ?? [])]));
  } else {
    if (selection.statuses?.length) conditions.push(inArray(leads.status, [...selection.statuses]));
    if (selection.sources?.length) conditions.push(inArray(leads.source, [...selection.sources]));
  }
  return and(...conditions) as SQL;
}

const NOT_YET_CONNECTED: ReadonlySet<LeadStatus> = new Set(['NEW', 'CONTACTED', 'ATTEMPTED']);
const FINAL: ReadonlySet<LeadStatus> = new Set(['DO_NOT_CALL', 'CONVERTED', 'CLOSED']);

/**
 * Lead Status after a call (addendum §4): no connection → ATTEMPTED (UNREACHABLE after the final
 * attempt); connected → CONNECTED; NOT_INTERESTED; OPTED_OUT → DO_NOT_CALL; WRONG_NUMBER →
 * CLOSED. Never moves a lead backwards, and never reopens a final status except for an opt-out.
 * Returns null when the status should not change.
 */
export function leadStatusAfterCall(
  current: LeadStatus,
  outcome: CallOutcome,
  finalAttempt: boolean,
): LeadStatus | null {
  if (outcome === 'OPTED_OUT') return current === 'DO_NOT_CALL' ? null : 'DO_NOT_CALL';
  if (FINAL.has(current)) return null;
  switch (outcome) {
    case 'WRONG_NUMBER':
      return 'CLOSED';
    case 'NOT_INTERESTED':
      return current === 'NOT_INTERESTED' ? null : 'NOT_INTERESTED';
    case 'CONNECTED':
      return NOT_YET_CONNECTED.has(current) || current === 'UNREACHABLE' ? 'CONNECTED' : null;
    case 'PROVIDER_ERROR':
      return null; // Nivomi's or the provider's failure says nothing about the lead.
    default:
      if (!NOT_YET_CONNECTED.has(current)) return null;
      if (finalAttempt) return 'UNREACHABLE';
      return current === 'ATTEMPTED' ? null : 'ATTEMPTED';
  }
}
