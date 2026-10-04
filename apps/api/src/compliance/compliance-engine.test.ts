import { describe, expect, it } from 'vitest';
import {
  classifyNumberSeries,
  complaintBreakerTrips,
  effectiveCallingWindow,
  evaluateCompliance,
  selfCertificationExpiresAt,
  type ComplianceInput,
} from './compliance-engine.js';
import { INDIA_RULE_SET_V1 } from './rule-sets/india-v1.js';
import {
  ruleSetChecksum,
  ruleSetDefinitionSchema,
  type LoadedRuleSet,
  type RuleSetDefinition,
} from './rule-set.schema.js';

const DAY = 86_400_000;
/** Monday 28 Sep 2026, 12:00 in India. */
const NOON_IST = new Date('2026-09-28T12:00:00+05:30');
const at = (iso: string) => new Date(iso);
const daysBefore = (days: number, from = NOON_IST) => new Date(from.getTime() - days * DAY);

function load(definition: RuleSetDefinition): LoadedRuleSet {
  const parsed = ruleSetDefinitionSchema.parse(definition);
  return {
    id: '00000000-0000-4000-8000-000000000001',
    jurisdiction: parsed.jurisdiction,
    version: parsed.version,
    status: parsed.status,
    effectiveFrom: new Date(parsed.effectiveFrom),
    effectiveTo: parsed.effectiveTo ? new Date(parsed.effectiveTo) : null,
    reviewNote: parsed.reviewNote,
    sources: parsed.sources,
    rules: parsed.rules,
  };
}

const INDIA = load(INDIA_RULE_SET_V1);

/** A promotional call that passes every regulatory check. */
function input(overrides: Partial<ComplianceInput> = {}): ComplianceInput {
  return {
    now: NOON_IST,
    category: 'PROMOTIONAL',
    campaignWindow: { start: '10:00', end: '21:00' },
    recipientPhoneE164: '+919847000101',
    telecomIdentity: {
      status: 'VERIFIED',
      sector: 'REAL_ESTATE',
      a2pDeclaredAt: daysBefore(30),
      selfCertifiedAt: daysBefore(30),
    },
    callerNumber: { phoneE164: '+911401234567', a2pDeclared: true, status: 'ACTIVE' },
    telecomConsent: {
      latestGrant: {
        basis: 'INQUIRY',
        validFrom: daysBefore(2),
        operatorReference: null,
        recordedAt: daysBefore(2),
        recipientInitiated: false,
      },
      revocations: [],
    },
    dpdpConsent: { granted: false, revoked: false },
    preference: { available: true, registration: 'NONE', categories: [] },
    ...overrides,
  };
}

const codes = (i: ComplianceInput, ruleSet = INDIA) =>
  evaluateCompliance(ruleSet, i).reasons.map((r) => r.code);

const grant = (
  basis: 'INQUIRY' | 'APPLICATION' | 'REGISTERED_CONSENT' | 'EXISTING_CUSTOMER',
  validFrom: Date | null,
  extra: { operatorReference?: string; recordedAt?: Date; recipientInitiated?: boolean } = {},
) => ({
  latestGrant: {
    basis,
    validFrom,
    operatorReference: extra.operatorReference ?? null,
    recordedAt: extra.recordedAt ?? validFrom ?? daysBefore(1),
    recipientInitiated: extra.recipientInitiated ?? false,
  },
  revocations: [] as Date[],
});

describe('India rule set v1 data', () => {
  it('validates against the rule-set schema and is a draft with its sources', () => {
    expect(INDIA.status).toBe('DRAFT');
    expect(INDIA.reviewNote).toMatch(/pending legal review/i);
    expect(INDIA.sources.map((s) => s.id)).toContain('[2]');
    // Every source a rule cites is listed.
    const cited = JSON.stringify(INDIA.rules).match(/\[\d+\]/g) ?? [];
    for (const id of new Set(cited)) expect(INDIA.sources.map((s) => s.id)).toContain(id);
  });

  it('has a checksum independent of key order that changes with any rule', () => {
    const reordered = JSON.parse(JSON.stringify(INDIA_RULE_SET_V1)) as RuleSetDefinition;
    expect(ruleSetChecksum(reordered)).toBe(ruleSetChecksum(INDIA_RULE_SET_V1));
    const edited = structuredClone(INDIA_RULE_SET_V1);
    (edited.rules.optOut as { reConsentBlockDays: number }).reConsentBlockDays = 30;
    expect(ruleSetChecksum(edited)).not.toBe(ruleSetChecksum(INDIA_RULE_SET_V1));
  });

  it('allows a fully compliant promotional call and requires the disclosures', () => {
    const outcome = evaluateCompliance(INDIA, input());
    expect(outcome.reasons).toEqual([]);
    expect(outcome.obligations).toEqual({ aiDisclosure: true, recordingNotice: true });
  });
});

describe('number series (CR-2)', () => {
  it('classifies 140, 1600 and 1601 by the longest prefix and rejects ordinary numbers', () => {
    expect(classifyNumberSeries(INDIA.rules, '+911401234567')).toBe('140');
    expect(classifyNumberSeries(INDIA.rules, '+911600123456')).toBe('1600');
    expect(classifyNumberSeries(INDIA.rules, '+911601123456')).toBe('1601');
    expect(classifyNumberSeries(INDIA.rules, '+919847000101')).toBeNull();
    expect(classifyNumberSeries(INDIA.rules, '+14155550100')).toBeNull();
  });

  it('blocks ordinary numbers and series that do not fit the category', () => {
    const caller = (phoneE164: string) => ({
      phoneE164,
      a2pDeclared: true,
      status: 'ACTIVE' as const,
    });
    expect(codes(input({ callerNumber: caller('+919847000999') }))).toEqual([
      'UNKNOWN_NUMBER_SERIES',
    ]);
    expect(codes(input({ callerNumber: caller('+911601123456') }))).toEqual([
      'NUMBER_SERIES_NOT_PERMITTED',
    ]);
    expect(codes(input({ category: 'SERVICE', callerNumber: caller('+911401234567') }))).toEqual([
      'NUMBER_SERIES_NOT_PERMITTED',
    ]);
    expect(codes(input({ category: 'SERVICE', callerNumber: caller('+911601123456') }))).toEqual(
      [],
    );
  });

  it('applies the BFSI overlay: 1600xx for service calls, and review until OD-5', () => {
    const bfsi = input({
      category: 'SERVICE',
      telecomIdentity: { ...input().telecomIdentity!, sector: 'BFSI' },
      callerNumber: { phoneE164: '+911600123456', a2pDeclared: true, status: 'ACTIVE' },
    });
    expect(codes(bfsi)).toEqual(['SECTOR_RULES_UNCONFIRMED']);
    expect(
      codes({
        ...bfsi,
        callerNumber: { phoneE164: '+911601123456', a2pDeclared: true, status: 'ACTIVE' },
      }),
    ).toContain('NUMBER_SERIES_NOT_PERMITTED');
  });

  it('blocks a missing, paused or undeclared caller number (CR-4)', () => {
    expect(codes(input({ callerNumber: null }))).toEqual(['NO_CALLER_NUMBER']);
    expect(codes(input({ callerNumber: { ...input().callerNumber!, status: 'PAUSED' } }))).toEqual([
      'CALLER_NUMBER_NOT_ACTIVE',
    ]);
    expect(
      codes(input({ callerNumber: { ...input().callerNumber!, a2pDeclared: false } })),
    ).toEqual(['A2P_NOT_DECLARED']);
  });
});

describe('telecom identity (CR-3, FR-10, FR-12)', () => {
  const identity = input().telecomIdentity!;

  it('blocks until the identity is verified', () => {
    expect(codes(input({ telecomIdentity: null }))).toContain('TELECOM_IDENTITY_NOT_VERIFIED');
    for (const status of ['UNVERIFIED', 'PENDING_REVIEW', 'REVOKED'] as const) {
      expect(codes(input({ telecomIdentity: { ...identity, status } }))).toContain(
        'TELECOM_IDENTITY_NOT_VERIFIED',
      );
    }
    expect(codes(input({ telecomIdentity: { ...identity, status: 'EXPIRED' } }))).toEqual([
      'TELECOM_IDENTITY_EXPIRED',
    ]);
  });

  it('expires a self-certification after the rule-set validity (365 days)', () => {
    expect(selfCertificationExpiresAt(INDIA.rules, daysBefore(0))?.getTime()).toBe(
      NOON_IST.getTime() + 365 * DAY,
    );
    expect(
      codes(input({ telecomIdentity: { ...identity, selfCertifiedAt: daysBefore(364) } })),
    ).toEqual([]);
    expect(
      codes(input({ telecomIdentity: { ...identity, selfCertifiedAt: daysBefore(366) } })),
    ).toEqual(['TELECOM_IDENTITY_EXPIRED']);
    expect(codes(input({ telecomIdentity: { ...identity, selfCertifiedAt: null } }))).toEqual([
      'TELECOM_IDENTITY_EXPIRED',
    ]);
  });

  it('requires the A2P declaration on the identity', () => {
    expect(codes(input({ telecomIdentity: { ...identity, a2pDeclaredAt: null } }))).toEqual([
      'A2P_NOT_DECLARED',
    ]);
  });
});

describe('consent basis (CR-6, CR-7)', () => {
  it('blocks without a consent basis', () => {
    expect(codes(input({ telecomConsent: { latestGrant: null, revocations: [] } }))).toEqual([
      'NO_CONSENT_BASIS',
    ]);
  });

  it('expires an inquiry after 7 days and an application after 90', () => {
    expect(codes(input({ telecomConsent: grant('INQUIRY', daysBefore(6)) }))).toEqual([]);
    expect(codes(input({ telecomConsent: grant('INQUIRY', daysBefore(7)) }))).toEqual([
      'CONSENT_EXPIRED',
    ]);
    expect(codes(input({ telecomConsent: grant('APPLICATION', daysBefore(89)) }))).toEqual([]);
    expect(codes(input({ telecomConsent: grant('APPLICATION', daysBefore(91)) }))).toEqual([
      'CONSENT_EXPIRED',
    ]);
    expect(codes(input({ telecomConsent: grant('EXISTING_CUSTOMER', daysBefore(900)) }))).toEqual(
      [],
    );
  });

  it('sends an inquiry without a usable date to review (ambiguous consent)', () => {
    expect(codes(input({ telecomConsent: grant('INQUIRY', null) }))).toEqual([
      'CONSENT_EVIDENCE_INCOMPLETE',
    ]);
    const future = new Date(NOON_IST.getTime() + DAY);
    expect(
      codes(input({ telecomConsent: grant('INQUIRY', future, { recordedAt: NOON_IST }) })),
    ).toEqual(['CONSENT_EVIDENCE_INCOMPLETE']);
  });

  it('needs the operator reference for registered consent', () => {
    expect(codes(input({ telecomConsent: grant('REGISTERED_CONSENT', null) }))).toEqual([
      'CONSENT_OPERATOR_REFERENCE_MISSING',
    ]);
    expect(
      codes(
        input({
          telecomConsent: grant('REGISTERED_CONSENT', null, { operatorReference: 'DCA-123' }),
        }),
      ),
    ).toEqual([]);
  });

  it('limits transactional calls to the bases the rule set allows', () => {
    const transactional = {
      category: 'TRANSACTIONAL' as const,
      callerNumber: { phoneE164: '+911601123456', a2pDeclared: true, status: 'ACTIVE' as const },
    };
    expect(codes(input(transactional))).toEqual(['CONSENT_BASIS_NOT_PERMITTED']);
    expect(
      codes(input({ ...transactional, telecomConsent: grant('EXISTING_CUSTOMER', null) })),
    ).toEqual([]);
  });

  it('honours a revocation and the 90-day re-consent block', () => {
    const revokedAfter = {
      ...grant('INQUIRY', daysBefore(3)),
      revocations: [daysBefore(1)],
    };
    expect(codes(input({ telecomConsent: revokedAfter }))).toEqual(['CONSENT_REVOKED']);

    const regrantedTooSoon = { ...grant('INQUIRY', daysBefore(1)), revocations: [daysBefore(31)] };
    expect(codes(input({ telecomConsent: regrantedTooSoon }))).toEqual(['RECONSENT_BLOCK_ACTIVE']);

    const optedBackIn = {
      ...grant('INQUIRY', daysBefore(1), { recipientInitiated: true }),
      revocations: [daysBefore(31)],
    };
    expect(codes(input({ telecomConsent: optedBackIn }))).toEqual([]);

    const afterBlock = {
      ...grant('REGISTERED_CONSENT', daysBefore(1), { operatorReference: 'DCA-9' }),
      revocations: [daysBefore(100)],
    };
    expect(codes(input({ telecomConsent: afterBlock }))).toEqual([]);
  });
});

describe('DPDP consent (CR-11)', () => {
  it('is not required before the rule set’s commencement date', () => {
    expect(codes(input({ dpdpConsent: { granted: false, revoked: false } }))).toEqual([]);
  });

  it('is required from 13 May 2027', () => {
    const after = at('2027-05-13T12:00:00+05:30');
    const later = input({
      now: after,
      telecomConsent: grant('EXISTING_CUSTOMER', null),
      telecomIdentity: { ...input().telecomIdentity!, selfCertifiedAt: daysBefore(30, after) },
    });
    expect(codes(later)).toEqual(['NO_DPDP_CONSENT']);
    expect(codes({ ...later, dpdpConsent: { granted: true, revoked: false } })).toEqual([]);
  });

  it('always honours a DPDP revocation, independently of telecom consent', () => {
    expect(codes(input({ dpdpConsent: { granted: true, revoked: true } }))).toEqual([
      'DPDP_CONSENT_REVOKED',
    ]);
  });
});

describe('preference registry (CR-5)', () => {
  const pref = (
    registration: 'FULLY_BLOCK' | 'BLOCK_PROMO' | 'CATEGORY',
    categories: number[] = [],
  ) => ({
    preference: { available: true as const, registration, categories },
  });

  it('defers, never allows, when the registry cannot be checked', () => {
    const outcome = evaluateCompliance(INDIA, input({ preference: { available: false } }));
    expect(outcome.reasons).toEqual([
      expect.objectContaining({ code: 'PREFERENCE_REGISTRY_UNAVAILABLE', result: 'DEFERRED' }),
    ]);
  });

  it('blocks promotional calls to DND numbers; an inquiry does not override DND', () => {
    expect(codes(input(pref('FULLY_BLOCK')))).toEqual(['DND_REGISTERED']);
    expect(codes(input(pref('BLOCK_PROMO')))).toEqual(['DND_REGISTERED']);
  });

  it('lets registered explicit consent reach a blocked number', () => {
    expect(
      codes(
        input({
          ...pref('FULLY_BLOCK'),
          telecomConsent: grant('REGISTERED_CONSENT', null, { operatorReference: 'DCA-1' }),
        }),
      ),
    ).toEqual([]);
  });

  it('applies FULLY BLOCK to service calls except for existing customers', () => {
    const service = {
      category: 'SERVICE' as const,
      callerNumber: { phoneE164: '+911601123456', a2pDeclared: true, status: 'ACTIVE' as const },
    };
    expect(codes(input({ ...service, ...pref('FULLY_BLOCK') }))).toEqual(['DND_REGISTERED']);
    expect(codes(input({ ...service, ...pref('BLOCK_PROMO') }))).toEqual([]);
    expect(
      codes(
        input({
          ...service,
          ...pref('FULLY_BLOCK'),
          telecomConsent: grant('EXISTING_CUSTOMER', null),
        }),
      ),
    ).toEqual([]);
  });

  it('matches category blocks against the organization’s sector', () => {
    expect(codes(input(pref('CATEGORY', [2])))).toEqual(['DND_REGISTERED']); // real estate
    expect(codes(input(pref('CATEGORY', [3, 4])))).toEqual([]);
    expect(
      codes(
        input({
          ...pref('CATEGORY', [3]),
          telecomIdentity: { ...input().telecomIdentity!, sector: 'OTHER' },
        }),
      ),
    ).toEqual(['PREFERENCE_CATEGORY_UNKNOWN']);
  });
});

describe('calling window (CR-5)', () => {
  it('defers promotional calls outside 10:00–21:00 recipient-local, to the next opening', () => {
    const early = evaluateCompliance(INDIA, input({ now: at('2026-09-28T09:59:30+05:30') }));
    expect(early.reasons.map((r) => r.code)).toEqual(['OUTSIDE_CALLING_HOURS']);
    expect(early.windowOpensAt?.toISOString()).toBe(at('2026-09-28T10:00:00+05:30').toISOString());

    const late = evaluateCompliance(INDIA, input({ now: at('2026-09-28T21:00:00+05:30') }));
    expect(late.windowOpensAt?.toISOString()).toBe(at('2026-09-29T10:00:00+05:30').toISOString());
  });

  it('uses the recipient’s time zone, not the server’s', () => {
    // 04:00 UTC is 09:30 in India: still closed.
    expect(codes(input({ now: at('2026-09-28T04:00:00Z') }))).toEqual(['OUTSIDE_CALLING_HOURS']);
    expect(codes(input({ now: at('2026-09-28T05:00:00Z') }))).toEqual([]);
  });

  it('narrows the window by the campaign, and service calls have no regulatory window', () => {
    expect(codes(input({ campaignWindow: { start: '13:00', end: '17:00' } }))).toEqual([
      'OUTSIDE_CALLING_HOURS',
    ]);
    const service = input({
      now: at('2026-09-28T08:00:00+05:30'),
      category: 'SERVICE',
      campaignWindow: { start: '08:00', end: '20:00' },
      callerNumber: { phoneE164: '+911601123456', a2pDeclared: true, status: 'ACTIVE' },
    });
    expect(codes(service)).toEqual([]);
  });

  it('only lets campaigns tighten the rule window', () => {
    expect(
      effectiveCallingWindow(INDIA.rules, 'PROMOTIONAL', { start: '09:00', end: '21:00' }),
    ).toMatchObject({
      ok: false,
    });
    expect(
      effectiveCallingWindow(INDIA.rules, 'PROMOTIONAL', { start: '11:00', end: '18:00' }),
    ).toEqual({
      ok: true,
      window: { start: 660, end: 1080 },
    });
    expect(
      effectiveCallingWindow(INDIA.rules, 'SERVICE', { start: '08:00', end: '20:00' }),
    ).toMatchObject({
      ok: true,
    });
    expect(
      effectiveCallingWindow(INDIA.rules, 'PROMOTIONAL', { start: '18:00', end: '11:00' }),
    ).toMatchObject({
      ok: false,
    });
  });
});

describe('fail closed on missing rules', () => {
  it('sends a category with no rule to review', () => {
    const withoutTransactional = structuredClone(INDIA_RULE_SET_V1);
    delete (withoutTransactional.rules.callCategories as Record<string, unknown>).TRANSACTIONAL;
    expect(codes(input({ category: 'TRANSACTIONAL' }), load(withoutTransactional))).toEqual([
      'MISSING_RULE',
    ]);
  });

  it('sends a consent basis with no rule to review', () => {
    const withoutInquiry = structuredClone(INDIA_RULE_SET_V1);
    delete (withoutInquiry.rules.consentBases as Record<string, unknown>).INQUIRY;
    expect(codes(input(), load(withoutInquiry))).toEqual(['MISSING_RULE']);
  });
});

describe('complaint breaker (FR-49)', () => {
  const complaint = (daysAgo: number, kind: 'COMPLAINT' | 'OPERATOR_FLAG' = 'COMPLAINT') => ({
    kind,
    receivedAt: daysBefore(daysAgo),
  });

  it('trips at 2 complaints within 10 days, well before TRAI’s thresholds', () => {
    expect(complaintBreakerTrips(INDIA.rules, [complaint(1)], NOON_IST).trips).toBe(false);
    expect(complaintBreakerTrips(INDIA.rules, [complaint(1), complaint(9)], NOON_IST).trips).toBe(
      true,
    );
    expect(complaintBreakerTrips(INDIA.rules, [complaint(1), complaint(11)], NOON_IST).trips).toBe(
      false,
    );
  });

  it('trips immediately on an operator flag', () => {
    const verdict = complaintBreakerTrips(INDIA.rules, [complaint(0, 'OPERATOR_FLAG')], NOON_IST);
    expect(verdict.trips).toBe(true);
    expect(verdict.reason).toMatch(/operator/i);
  });
});
