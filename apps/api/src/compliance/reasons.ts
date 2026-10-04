import type { EligibilityReasonRecord, EligibilityResultValue } from '@nivomi/database';

/**
 * Machine-readable eligibility reasons (FR-44). Clients branch on `code`; the message is for
 * people. Each code always carries the same result.
 */
export const REASONS = {
  // ── Organization and calling controls ──
  ORGANIZATION_NOT_ACTIVE: ['BLOCKED', 'The organization is not approved for calling.'],
  EMERGENCY_STOP_ACTIVE: ['BLOCKED', 'Emergency Stop is on for this organization.'],
  COMPLAINT_BREAKER_TRIPPED: ['BLOCKED', 'The complaint breaker has paused all calling.'],
  // ── Telecom identity and caller number (CR-2 to CR-4) ──
  TELECOM_IDENTITY_NOT_VERIFIED: ['BLOCKED', 'The telecom identity is not verified.'],
  TELECOM_IDENTITY_EXPIRED: ['BLOCKED', 'The telecom self-certification has expired.'],
  A2P_NOT_DECLARED: ['BLOCKED', 'Automated calling is not declared for this number.'],
  NO_CALLER_NUMBER: ['BLOCKED', 'The campaign has no caller number.'],
  CALLER_NUMBER_NOT_ACTIVE: ['BLOCKED', 'The caller number is paused or retired.'],
  UNKNOWN_NUMBER_SERIES: ['BLOCKED', 'The caller number is not in a permitted commercial series.'],
  NUMBER_SERIES_NOT_PERMITTED: [
    'BLOCKED',
    'The caller number’s series is not permitted for this call category.',
  ],
  // ── Consent (CR-6, CR-7) ──
  NO_CONSENT_BASIS: ['BLOCKED', 'No consent basis is recorded for this number.'],
  CONSENT_REVOKED: ['BLOCKED', 'Consent to call this number was revoked.'],
  RECONSENT_BLOCK_ACTIVE: [
    'BLOCKED',
    'Consent was sought again within the re-consent block after an opt-out.',
  ],
  CONSENT_BASIS_NOT_PERMITTED: ['BLOCKED', 'This consent basis does not allow this call category.'],
  CONSENT_OPERATOR_REFERENCE_MISSING: [
    'BLOCKED',
    'Registered consent needs the operator consent reference.',
  ],
  CONSENT_EXPIRED: ['BLOCKED', 'The consent basis has expired.'],
  CONSENT_EVIDENCE_INCOMPLETE: [
    'REQUIRES_REVIEW',
    'The consent evidence has no usable date, so its validity cannot be checked.',
  ],
  NO_DPDP_CONSENT: ['BLOCKED', 'No DPDP consent is recorded for this person.'],
  DPDP_CONSENT_REVOKED: ['BLOCKED', 'The person withdrew consent to process their data.'],
  // ── Preferences (CR-5) ──
  DND_REGISTERED: [
    'BLOCKED',
    'The number’s preference registration blocks this call and the consent basis does not override it.',
  ],
  PREFERENCE_CATEGORY_UNKNOWN: [
    'REQUIRES_REVIEW',
    'The number blocks some categories and this organization’s sector has no registry category.',
  ],
  PREFERENCE_REGISTRY_UNAVAILABLE: [
    'DEFERRED',
    'The preference registry (NCPR/DND) could not be checked.',
  ],
  // ── Jurisdiction and rules (fail closed) ──
  NO_PHONE_NUMBER: ['BLOCKED', 'The lead has no phone number.'],
  UNKNOWN_JURISDICTION: ['REQUIRES_REVIEW', 'No rule set covers this phone number’s country.'],
  MISSING_RULE: ['REQUIRES_REVIEW', 'The rule set has no rule for this case.'],
  SECTOR_RULES_UNCONFIRMED: [
    'REQUIRES_REVIEW',
    'Sector-specific rules for this organization are not confirmed.',
  ],
  OUTSIDE_CALLING_HOURS: ['DEFERRED', 'Outside the calling window in the recipient’s time.'],
  // ── Lead and campaign (product rules) ──
  SUPPRESSED: ['BLOCKED', 'The number is on the suppression list.'],
  LEAD_DO_NOT_CALL: ['BLOCKED', 'The lead is marked Do not call.'],
  LEAD_STATUS_EXCLUDED: ['BLOCKED', 'Converted and closed leads are not called.'],
  MAX_ATTEMPTS_REACHED: ['BLOCKED', 'The campaign’s attempt limit for this lead is reached.'],
  CAMPAIGN_ENDED: ['BLOCKED', 'The campaign’s end date has passed.'],
  CAMPAIGN_NOT_STARTED: ['DEFERRED', 'The campaign has not reached its start date.'],
  COOLDOWN_ACTIVE: ['DEFERRED', 'Waiting for the retry interval since the last attempt.'],
  DAILY_ATTEMPT_CAP: ['DEFERRED', 'The daily attempt limit for this lead is reached.'],
  CALL_IN_PROGRESS: ['DEFERRED', 'The lead is already on a call.'],
  ALREADY_CONNECTED_TODAY: ['DEFERRED', 'The lead already had a connected call today.'],
  BUDGET_EXHAUSTED: ['DEFERRED', 'The campaign’s minute budget is used up.'],
} as const satisfies Record<string, readonly [EligibilityResultValue, string]>;

export type ReasonCode = keyof typeof REASONS;

export function reason(code: ReasonCode): EligibilityReasonRecord {
  const [result, message] = REASONS[code];
  return { code, result, message };
}

const SEVERITY: Record<EligibilityResultValue, number> = {
  ELIGIBLE: 0,
  DEFERRED: 1,
  REQUIRES_REVIEW: 2,
  BLOCKED: 3,
};

/** BLOCKED > REQUIRES_REVIEW > DEFERRED > ELIGIBLE (ADR-021). */
export function combine(reasons: readonly EligibilityReasonRecord[]): EligibilityResultValue {
  let result: EligibilityResultValue = 'ELIGIBLE';
  for (const r of reasons) if (SEVERITY[r.result] > SEVERITY[result]) result = r.result;
  return result;
}
