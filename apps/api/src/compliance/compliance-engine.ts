import type {
  BusinessSector,
  CallCategory,
  EligibilityReasonRecord,
  TelecomIdentityStatus,
  consentBases,
} from '@nivomi/database';
import { intersectWindows, parseHhmm, windowStatus, type MinuteWindow } from './local-time.js';
import { reason } from './reasons.js';
import type { LoadedRuleSet, PreferenceRegistration, RuleSetRules } from './rule-set.schema.js';

/**
 * The ComplianceEngine (ADR-014, ADR-021): regulatory checks, driven only by Rule Set data.
 * Pure — no I/O, no clock, no hidden state — so every rule is unit-tested and every decision can
 * be replayed from its recorded inputs. Campaign and voice code never test regulatory conditions
 * themselves; they call this.
 */

type ConsentBasis = (typeof consentBases)[number];
const DAY_MS = 86_400_000;

export interface TelecomConsentState {
  /** The most recent GRANT in the telecom ledger for the recipient's number. */
  readonly latestGrant: {
    readonly basis: ConsentBasis | null;
    /** Evidence timestamp (inquiry or consent time). */
    readonly validFrom: Date | null;
    readonly operatorReference: string | null;
    /** When the entry was recorded. */
    readonly recordedAt: Date;
    readonly recipientInitiated: boolean;
  } | null;
  /** Every REVOCATION in the ledger for the number. */
  readonly revocations: readonly Date[];
}

export type PreferenceStatus =
  | {
      readonly available: true;
      readonly registration: PreferenceRegistration;
      /** Blocked content categories (1–8) when `registration` is CATEGORY. */
      readonly categories: readonly number[];
    }
  | { readonly available: false };

export interface ComplianceInput {
  readonly now: Date;
  readonly category: CallCategory;
  /** The campaign's daily window (HH:MM); may only narrow the rule window. */
  readonly campaignWindow: { readonly start: string; readonly end: string } | null;
  readonly recipientPhoneE164: string;
  readonly telecomIdentity: {
    readonly status: TelecomIdentityStatus;
    readonly sector: BusinessSector | null;
    readonly a2pDeclaredAt: Date | null;
    readonly selfCertifiedAt: Date | null;
  } | null;
  readonly callerNumber: {
    readonly phoneE164: string;
    readonly a2pDeclared: boolean;
    readonly status: 'ACTIVE' | 'PAUSED' | 'RETIRED';
  } | null;
  readonly telecomConsent: TelecomConsentState;
  readonly dpdpConsent: { readonly granted: boolean; readonly revoked: boolean };
  readonly preference: PreferenceStatus;
}

export interface ComplianceObligations {
  readonly aiDisclosure: boolean;
  readonly recordingNotice: boolean;
}

export interface ComplianceOutcome {
  readonly reasons: EligibilityReasonRecord[];
  /** When the calling window next opens, if the call is outside it. */
  readonly windowOpensAt: Date | null;
  /** What the voice layer must do on the call (CR-10). */
  readonly obligations: ComplianceObligations;
}

/** Does this Rule Set govern the number (by country calling code)? */
export function coversNumber(rules: RuleSetRules, phoneE164: string): boolean {
  return rules.phoneCountryCodes.some((code) => phoneE164.startsWith(code));
}

function nationalNumber(rules: RuleSetRules, phoneE164: string): string | null {
  const code = rules.phoneCountryCodes.find((c) => phoneE164.startsWith(c));
  return code ? phoneE164.slice(code.length) : null;
}

/** The commercial number series of a Caller Number (CR-2), or null for an ordinary number. */
export function classifyNumberSeries(rules: RuleSetRules, phoneE164: string): string | null {
  const national = nationalNumber(rules, phoneE164);
  if (!national) return null;
  // Longest prefix wins, so 1600 and 1601 are never confused with a shorter prefix.
  const match = [...rules.numberSeries]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((s) => national.startsWith(s.prefix));
  return match?.id ?? null;
}

/** When the self-certification lapses (FR-12), or null when none is recorded. */
export function selfCertificationExpiresAt(
  rules: RuleSetRules,
  selfCertifiedAt: Date | null,
): Date | null {
  return selfCertifiedAt
    ? new Date(
        selfCertifiedAt.getTime() + rules.telecomIdentity.selfCertificationValidityDays * DAY_MS,
      )
    : null;
}

/**
 * The window a campaign may call in: the rule window narrowed by the campaign (FR-35). Rejects a
 * campaign window that is not inside the rule window — organizations may only tighten rules.
 */
export function effectiveCallingWindow(
  rules: RuleSetRules,
  category: CallCategory,
  campaignWindow: { start: string; end: string },
): { ok: true; window: MinuteWindow } | { ok: false; message: string } {
  const categoryRule = rules.callCategories[category];
  if (!categoryRule) return { ok: false, message: `No rule covers ${category} calls.` };
  const requested = { start: parseHhmm(campaignWindow.start), end: parseHhmm(campaignWindow.end) };
  if (requested.start >= requested.end) {
    return { ok: false, message: 'The daily window must start before it ends.' };
  }
  const ruleWindow = categoryRule.callingWindow;
  if (!ruleWindow) return { ok: true, window: requested };
  const bounds = { start: parseHhmm(ruleWindow.start), end: parseHhmm(ruleWindow.end) };
  if (requested.start < bounds.start || requested.end > bounds.end) {
    return {
      ok: false,
      message: `${category.toLowerCase()} calls are allowed only between ${ruleWindow.start} and ${ruleWindow.end} in the recipient's time.`,
    };
  }
  return { ok: true, window: requested };
}

/** FR-49: does the complaint history trip the breaker? */
export function complaintBreakerTrips(
  rules: RuleSetRules,
  complaints: readonly {
    readonly kind: 'COMPLAINT' | 'OPERATOR_FLAG';
    readonly receivedAt: Date;
  }[],
  now: Date,
): { trips: boolean; reason: string | null } {
  const { breakerThreshold, windowDays, tripOnOperatorFlag } = rules.complaints;
  const since = now.getTime() - windowDays * DAY_MS;
  const recent = complaints.filter((c) => c.receivedAt.getTime() >= since);
  if (tripOnOperatorFlag && recent.some((c) => c.kind === 'OPERATOR_FLAG')) {
    return { trips: true, reason: 'An operator flagged one of the organization’s numbers.' };
  }
  const count = recent.filter((c) => c.kind === 'COMPLAINT').length;
  return count >= breakerThreshold
    ? { trips: true, reason: `${count} complaints within ${windowDays} days.` }
    : { trips: false, reason: null };
}

/**
 * CR-3 / FR-10 / FR-12: the sender is registered, verified and self-certified. Also used to
 * auto-pause running campaigns when the identity stops being valid (FR-37).
 */
export function telecomIdentityReasons(
  rules: RuleSetRules,
  identity: ComplianceInput['telecomIdentity'],
  now: Date,
): EligibilityReasonRecord[] {
  if (rules.telecomIdentity.requireVerified && identity?.status !== 'VERIFIED') {
    return [
      reason(
        identity?.status === 'EXPIRED'
          ? 'TELECOM_IDENTITY_EXPIRED'
          : 'TELECOM_IDENTITY_NOT_VERIFIED',
      ),
    ];
  }
  if (identity) {
    const expires = selfCertificationExpiresAt(rules, identity.selfCertifiedAt);
    if (!expires || expires <= now) return [reason('TELECOM_IDENTITY_EXPIRED')];
  }
  return [];
}

/** Evaluates every regulatory check for one call. Never short-circuits (ADR-021). */
export function evaluateCompliance(
  ruleSet: LoadedRuleSet,
  input: ComplianceInput,
): ComplianceOutcome {
  const rules = ruleSet.rules;
  const reasons: EligibilityReasonRecord[] = [];
  let windowOpensAt: Date | null = null;
  const obligations = {
    aiDisclosure: rules.disclosures.aiDisclosureRequired,
    recordingNotice: rules.disclosures.recordingNoticeRequired,
  };

  const categoryRule = rules.callCategories[input.category];
  if (!categoryRule) {
    reasons.push(reason('MISSING_RULE'));
    return { reasons, windowOpensAt, obligations };
  }
  const sector = input.telecomIdentity?.sector ?? null;

  // CR-3: registered, verified sender with a current self-certification.
  const identity = input.telecomIdentity;
  reasons.push(...telecomIdentityReasons(rules, identity, input.now));
  if (sector) {
    const overlay = rules.sectorOverlays[sector];
    if (overlay?.requiresReview) reasons.push(reason('SECTOR_RULES_UNCONFIRMED'));
  }

  // CR-2, CR-4: the caller number's series fits the category and is declared for A2P.
  const caller = input.callerNumber;
  if (!caller) {
    reasons.push(reason('NO_CALLER_NUMBER'));
  } else {
    if (caller.status !== 'ACTIVE') reasons.push(reason('CALLER_NUMBER_NOT_ACTIVE'));
    if (
      rules.telecomIdentity.requireA2PDeclaration &&
      (!caller.a2pDeclared || !identity?.a2pDeclaredAt)
    ) {
      reasons.push(reason('A2P_NOT_DECLARED'));
    }
    const series = classifyNumberSeries(rules, caller.phoneE164);
    if (!series) {
      reasons.push(reason('UNKNOWN_NUMBER_SERIES'));
    } else {
      const allowed = (sector && categoryRule.sectorSeries?.[sector]) || categoryRule.allowedSeries;
      if (!allowed.includes(series)) reasons.push(reason('NUMBER_SERIES_NOT_PERMITTED'));
    }
  }

  // CR-6, CR-7: consent basis, its validity and revocation.
  const consent = input.telecomConsent;
  const grant = consent.latestGrant;
  const basis = grant?.basis ?? null;
  const basisRule = basis ? rules.consentBases[basis] : undefined;
  if (!grant || !basis) {
    reasons.push(reason('NO_CONSENT_BASIS'));
  } else if (consent.revocations.some((r) => r >= grant.recordedAt)) {
    reasons.push(reason('CONSENT_REVOKED'));
  } else if (!basisRule) {
    reasons.push(reason('MISSING_RULE'));
  } else {
    const blockMs = rules.optOut.reConsentBlockDays * DAY_MS;
    const blockedRegrant = consent.revocations.some(
      (r) => grant.recordedAt.getTime() - r.getTime() < blockMs && !grant.recipientInitiated,
    );
    if (blockedRegrant) reasons.push(reason('RECONSENT_BLOCK_ACTIVE'));
    if (!categoryRule.allowedConsentBases.includes(basis)) {
      reasons.push(reason('CONSENT_BASIS_NOT_PERMITTED'));
    }
    if (basisRule.requiresOperatorReference && !grant.operatorReference) {
      reasons.push(reason('CONSENT_OPERATOR_REFERENCE_MISSING'));
    }
    if (basisRule.validityDays !== null || basisRule.requiresEvidenceTimestamp) {
      const from = grant.validFrom;
      if (!from || from > input.now) {
        reasons.push(reason('CONSENT_EVIDENCE_INCOMPLETE'));
      } else if (
        basisRule.validityDays !== null &&
        from.getTime() + basisRule.validityDays * DAY_MS <= input.now.getTime()
      ) {
        reasons.push(reason('CONSENT_EXPIRED'));
      }
    }
  }

  // DPDP (CR-11): a revocation is always honoured; consent is required from the rule's date.
  if (input.dpdpConsent.revoked) {
    reasons.push(reason('DPDP_CONSENT_REVOKED'));
  } else if (input.now >= new Date(rules.dpdp.consentRequiredFrom) && !input.dpdpConsent.granted) {
    reasons.push(reason('NO_DPDP_CONSENT'));
  }

  // CR-5: preference registry (NCPR/DND). Unavailable is never "allowed".
  const preference = input.preference;
  if (!preference.available) {
    reasons.push(
      rules.preferences.unavailableResult === 'DEFERRED'
        ? reason('PREFERENCE_REGISTRY_UNAVAILABLE')
        : { ...reason('PREFERENCE_REGISTRY_UNAVAILABLE'), result: 'REQUIRES_REVIEW' },
    );
  } else if (preference.registration !== 'NONE') {
    const block = rules.preferences.blocks.find((b) => b.registration === preference.registration);
    const overrides = basisRule?.overridesPreferences === true;
    const applies =
      block !== undefined &&
      block.categories.includes(input.category) &&
      !(basis !== null && block.exemptBases.includes(basis)) &&
      !overrides;
    if (applies && preference.registration === 'CATEGORY') {
      const sectorCategory = sector ? rules.preferences.sectorCategories[sector] : undefined;
      if (sectorCategory === undefined) {
        reasons.push(reason('PREFERENCE_CATEGORY_UNKNOWN'));
      } else if (preference.categories.includes(sectorCategory)) {
        reasons.push(reason('DND_REGISTERED'));
      }
    } else if (applies) {
      reasons.push(reason('DND_REGISTERED'));
    }
  }

  // CR-5: calling window in the recipient's local time, narrowed by the campaign.
  const windows: MinuteWindow[] = [];
  if (categoryRule.callingWindow) {
    windows.push({
      start: parseHhmm(categoryRule.callingWindow.start),
      end: parseHhmm(categoryRule.callingWindow.end),
    });
  }
  if (input.campaignWindow) {
    windows.push({
      start: parseHhmm(input.campaignWindow.start),
      end: parseHhmm(input.campaignWindow.end),
    });
  }
  if (windows.length > 0) {
    const window = intersectWindows(windows);
    if (!window) {
      reasons.push(reason('OUTSIDE_CALLING_HOURS'));
    } else {
      const status = windowStatus(input.now, rules.timezone, window);
      if (!status.open) {
        reasons.push(reason('OUTSIDE_CALLING_HOURS'));
        windowOpensAt = status.opensAt;
      }
    }
  }

  return { reasons, windowOpensAt, obligations };
}
