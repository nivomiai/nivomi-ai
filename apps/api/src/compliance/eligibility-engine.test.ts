import { describe, expect, it } from 'vitest';
import { evaluateEligibility, type EligibilityInput } from './eligibility-engine.js';
import { INDIA_RULE_SET_V1 } from './rule-sets/india-v1.js';
import { ruleSetDefinitionSchema, type LoadedRuleSet } from './rule-set.schema.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOON_IST = new Date('2026-09-28T12:00:00+05:30');
const ago = (ms: number) => new Date(NOON_IST.getTime() - ms);

const parsed = ruleSetDefinitionSchema.parse(INDIA_RULE_SET_V1);
const INDIA: LoadedRuleSet = {
  id: '00000000-0000-4000-8000-000000000001',
  jurisdiction: parsed.jurisdiction,
  version: parsed.version,
  status: parsed.status,
  effectiveFrom: new Date(parsed.effectiveFrom),
  effectiveTo: null,
  reviewNote: parsed.reviewNote,
  sources: parsed.sources,
  rules: parsed.rules,
};

function input(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    now: NOON_IST,
    organization: { status: 'ACTIVE', emergencyStopActive: false, breakerTripped: false },
    campaign: {
      callCategory: 'PROMOTIONAL',
      windowStart: '10:00',
      windowEnd: '21:00',
      startsAt: null,
      endsAt: null,
      maxAttempts: 3,
      retryIntervalMinutes: 240,
      maxAttemptsPerDay: 2,
      budgetSeconds: 6_000,
      usedSeconds: 0,
    },
    lead: { status: 'NEW', phoneE164: '+919847000101' },
    suppressed: false,
    attempts: { dialTimes: [], liveCall: false, connectedTimes: [] },
    telecomIdentity: {
      status: 'VERIFIED',
      sector: 'REAL_ESTATE',
      a2pDeclaredAt: ago(30 * DAY),
      selfCertifiedAt: ago(30 * DAY),
    },
    callerNumber: { phoneE164: '+911401234567', a2pDeclared: true, status: 'ACTIVE' },
    telecomConsent: {
      latestGrant: {
        basis: 'INQUIRY',
        validFrom: ago(DAY),
        operatorReference: null,
        recordedAt: ago(DAY),
        recipientInitiated: false,
      },
      revocations: [],
    },
    dpdpConsent: { granted: false, revoked: false },
    preference: { available: true, registration: 'NONE', categories: [] },
    ...overrides,
  };
}

const evaluate = (i: EligibilityInput, ruleSet: LoadedRuleSet | null = INDIA) =>
  evaluateEligibility(i, ruleSet);
const codes = (i: EligibilityInput) => evaluate(i).reasons.map((r) => r.code);

describe('eligibility gate (FR-44, FR-45)', () => {
  it('is ELIGIBLE when every check passes, and names the rule-set version', () => {
    expect(evaluate(input())).toMatchObject({
      result: 'ELIGIBLE',
      reasons: [],
      jurisdiction: 'IN',
      ruleSetVersion: 1,
      nextEligibleAt: null,
      obligations: { aiDisclosure: true, recordingNotice: true },
    });
  });

  it('blocks on organization state and calling controls', () => {
    expect(
      codes(
        input({
          organization: {
            status: 'PENDING_APPROVAL',
            emergencyStopActive: false,
            breakerTripped: false,
          },
        }),
      ),
    ).toEqual(['ORGANIZATION_NOT_ACTIVE']);
    expect(
      codes(
        input({
          organization: { status: 'ACTIVE', emergencyStopActive: true, breakerTripped: false },
        }),
      ),
    ).toEqual(['EMERGENCY_STOP_ACTIVE']);
    expect(
      codes(
        input({
          organization: { status: 'ACTIVE', emergencyStopActive: false, breakerTripped: true },
        }),
      ),
    ).toEqual(['COMPLAINT_BREAKER_TRIPPED']);
  });

  it('blocks Do-not-call, converted, closed and suppressed leads (FR-22, FR-25)', () => {
    expect(codes(input({ lead: { status: 'DO_NOT_CALL', phoneE164: '+919847000101' } }))).toEqual([
      'LEAD_DO_NOT_CALL',
    ]);
    expect(codes(input({ lead: { status: 'CONVERTED', phoneE164: '+919847000101' } }))).toEqual([
      'LEAD_STATUS_EXCLUDED',
    ]);
    expect(codes(input({ lead: { status: 'CLOSED', phoneE164: '+919847000101' } }))).toEqual([
      'LEAD_STATUS_EXCLUDED',
    ]);
    expect(codes(input({ suppressed: true }))).toEqual(['SUPPRESSED']);
    expect(codes(input({ lead: { status: 'NEW', phoneE164: null } }))).toEqual(['NO_PHONE_NUMBER']);
  });

  it('never allows a number no rule set covers (fail closed)', () => {
    const outcome = evaluate(input({ lead: { status: 'NEW', phoneE164: '+14155550100' } }), null);
    expect(outcome).toMatchObject({
      result: 'REQUIRES_REVIEW',
      jurisdiction: null,
      ruleSetVersion: null,
    });
    expect(outcome.reasons.map((r) => r.code)).toEqual(['UNKNOWN_JURISDICTION']);
  });

  it('respects the campaign schedule and budget', () => {
    const start = new Date(NOON_IST.getTime() + 2 * HOUR);
    const notStarted = evaluate(input({ campaign: { ...input().campaign, startsAt: start } }));
    expect(notStarted).toMatchObject({ result: 'DEFERRED', nextEligibleAt: start });
    expect(codes(input({ campaign: { ...input().campaign, endsAt: ago(HOUR) } }))).toEqual([
      'CAMPAIGN_ENDED',
    ]);
    const spent = evaluate(input({ campaign: { ...input().campaign, usedSeconds: 6_000 } }));
    expect(spent).toMatchObject({ result: 'DEFERRED', nextEligibleAt: null });
    expect(spent.reasons.map((r) => r.code)).toEqual(['BUDGET_EXHAUSTED']);
  });
});

describe('attempts, cooldown and one conversation at a time (FR-40, FR-41)', () => {
  const attempts = (dialTimes: Date[], extra: Partial<EligibilityInput['attempts']> = {}) => ({
    attempts: { dialTimes, liveCall: false, connectedTimes: [], ...extra },
  });

  it('stops after the maximum attempts', () => {
    expect(codes(input(attempts([ago(3 * DAY), ago(2 * DAY), ago(DAY)])))).toEqual([
      'MAX_ATTEMPTS_REACHED',
    ]);
  });

  it('defers until the retry interval has passed', () => {
    const last = ago(HOUR);
    const outcome = evaluate(input(attempts([last])));
    expect(outcome.reasons.map((r) => r.code)).toEqual(['COOLDOWN_ACTIVE']);
    expect(outcome.nextEligibleAt?.getTime()).toBe(last.getTime() + 4 * HOUR);
    expect(codes(input(attempts([ago(5 * HOUR)])))).toEqual([]);
  });

  it('caps attempts per recipient-local day and defers to the next local midnight', () => {
    const outcome = evaluate(
      input({
        ...attempts([ago(5 * HOUR), ago(4.5 * HOUR)]),
        campaign: { ...input().campaign, retryIntervalMinutes: 60, maxAttempts: 5 },
      }),
    );
    expect(outcome.reasons.map((r) => r.code)).toEqual(['DAILY_ATTEMPT_CAP']);
    expect(outcome.nextEligibleAt?.toISOString()).toBe(
      new Date('2026-09-29T00:00:00+05:30').toISOString(),
    );
  });

  it('never calls a lead who is on a call, or already connected today', () => {
    expect(evaluate(input(attempts([], { liveCall: true })))).toMatchObject({
      result: 'DEFERRED',
      nextEligibleAt: null,
    });
    expect(codes(input(attempts([], { connectedTimes: [ago(2 * HOUR)] })))).toEqual([
      'ALREADY_CONNECTED_TODAY',
    ]);
    // Yesterday's connection (India time) does not count.
    expect(codes(input(attempts([], { connectedTimes: [ago(13 * HOUR)] })))).toEqual([]);
  });
});

describe('combining results (ADR-021)', () => {
  it('collects every reason and lets BLOCKED win over REQUIRES_REVIEW and DEFERRED', () => {
    const outcome = evaluate(
      input({
        now: new Date('2026-09-28T08:00:00+05:30'),
        suppressed: true,
        telecomConsent: {
          latestGrant: {
            basis: 'INQUIRY',
            validFrom: null,
            operatorReference: null,
            recordedAt: ago(DAY),
            recipientInitiated: false,
          },
          revocations: [],
        },
      }),
    );
    expect(outcome.result).toBe('BLOCKED');
    expect(outcome.reasons.map((r) => r.code).sort()).toEqual(
      ['CONSENT_EVIDENCE_INCOMPLETE', 'OUTSIDE_CALLING_HOURS', 'SUPPRESSED'].sort(),
    );
    expect(outcome.nextEligibleAt).toBeNull();
  });

  it('lets REQUIRES_REVIEW win over DEFERRED', () => {
    const outcome = evaluate(
      input({
        now: new Date('2026-09-28T08:00:00+05:30'),
        telecomIdentity: { ...input().telecomIdentity!, sector: 'OTHER' },
        preference: { available: true, registration: 'CATEGORY', categories: [2] },
      }),
    );
    expect(outcome.result).toBe('REQUIRES_REVIEW');
  });

  it('defers to the latest known time, or has no time when a deferral has none', () => {
    const cooldown = evaluate(
      input({
        now: new Date('2026-09-28T09:00:00+05:30'),
        attempts: {
          dialTimes: [new Date('2026-09-28T08:30:00+05:30')],
          liveCall: false,
          connectedTimes: [],
        },
        campaign: { ...input().campaign, maxAttemptsPerDay: 3 },
      }),
    );
    expect(cooldown.result).toBe('DEFERRED');
    expect(cooldown.nextEligibleAt?.toISOString()).toBe(
      new Date('2026-09-28T12:30:00+05:30').toISOString(),
    );

    const unavailable = evaluate(
      input({ now: new Date('2026-09-28T09:00:00+05:30'), preference: { available: false } }),
    );
    expect(unavailable).toMatchObject({ result: 'DEFERRED', nextEligibleAt: null });
  });
});
