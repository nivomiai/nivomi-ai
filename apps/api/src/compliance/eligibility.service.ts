import { Inject, Injectable } from '@nestjs/common';
import {
  callAttempts,
  callerNumbers,
  campaigns,
  contacts,
  eligibilityDecisions,
  leads,
  organizations,
  suppressionEntries,
  telecomIdentities,
  type Database,
} from '@nivomi/database';
import { and, eq, inArray } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DATABASE } from '../database/database.module.js';
import { callingControls } from './calling-controls.service.js';
import type { PreferenceStatus } from './compliance-engine.js';
import { dpdpConsentStates, telecomConsentStates } from './consent-ledger.js';
import {
  evaluateEligibility,
  type EligibilityInput,
  type EligibilityOutcome,
} from './eligibility-engine.js';
import {
  PREFERENCE_REGISTRY,
  PreferenceRegistryUnavailableError,
  type PreferenceRegistry,
} from './preference-registry.js';
import { RuleSetRegistry } from './rule-set-registry.js';

type Campaign = typeof campaigns.$inferSelect;

export interface RecordedDecision {
  readonly leadId: string;
  readonly decisionId: string;
  readonly outcome: EligibilityOutcome;
  readonly phoneE164: string | null;
}

/** Connected calls this recent count toward "one connected call per day" (A-19). */
const CONNECTED_LOOKBACK_MS = 2 * 86_400_000;

/** "+919847000101" → "••••0101": decision snapshots never hold full numbers. */
export function maskPhone(phone: string | null): string | null {
  return phone ? `••••${phone.slice(-4)}` : null;
}

/**
 * Gathers eligibility inputs, evaluates them (ADR-021) and records every decision with its
 * rule-set version and input snapshot (FR-48). Batch-oriented: the pre-launch check evaluates
 * hundreds of leads per step, a dial evaluates one.
 */
@Injectable()
export class EligibilityService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly rules: RuleSetRegistry,
    @Inject(PREFERENCE_REGISTRY) private readonly registry: PreferenceRegistry,
    @InjectPinoLogger(EligibilityService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Evaluates `leadIds` for `campaign` at `now` and records one decision per lead. Pass the
   * caller's transaction so decisions commit with the state change they justify.
   */
  async evaluate(
    campaign: Campaign,
    leadIds: readonly string[],
    purpose: 'PRE_LAUNCH' | 'DIAL',
    now: Date,
    db: Database = this.db,
  ): Promise<RecordedDecision[]> {
    if (leadIds.length === 0) return [];
    const orgId = campaign.organizationId;

    const [organization] = await db
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!organization) throw new Error(`organization ${orgId} not found`);
    const controls = await callingControls(db, orgId);
    const [identity] = await db
      .select()
      .from(telecomIdentities)
      .where(eq(telecomIdentities.organizationId, orgId))
      .limit(1);
    const [caller] = campaign.callerNumberId
      ? await db
          .select()
          .from(callerNumbers)
          .where(
            and(
              eq(callerNumbers.id, campaign.callerNumberId),
              eq(callerNumbers.organizationId, orgId),
            ),
          )
          .limit(1)
      : [];

    // Tenant scope: only this Organization's leads, whatever ids were passed.
    const rows = await db
      .select({
        leadId: leads.id,
        status: leads.status,
        contactId: contacts.id,
        phoneE164: contacts.phoneE164,
      })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(and(eq(leads.organizationId, orgId), inArray(leads.id, [...leadIds])));
    const phones = rows.flatMap((r) => (r.phoneE164 ? [r.phoneE164] : []));

    const suppressed = new Set(
      phones.length
        ? (
            await db
              .select({ phone: suppressionEntries.phoneE164 })
              .from(suppressionEntries)
              .where(
                and(
                  eq(suppressionEntries.organizationId, orgId),
                  inArray(suppressionEntries.phoneE164, phones),
                ),
              )
          ).map((s) => s.phone)
        : [],
    );
    const telecom = await telecomConsentStates(db, orgId, phones);
    const dpdp = await dpdpConsentStates(
      db,
      orgId,
      rows.map((r) => r.contactId),
    );

    let preferences: Map<string, PreferenceStatus> | null = null;
    try {
      const entries = await this.registry.lookup(phones);
      preferences = new Map(
        [...entries].map(([phone, e]) => [
          phone,
          { available: true, registration: e.registration, categories: e.categories },
        ]),
      );
    } catch (error) {
      if (!(error instanceof PreferenceRegistryUnavailableError)) throw error;
      // Fail closed: every lead is DEFERRED with PREFERENCE_REGISTRY_UNAVAILABLE.
      this.logger.warn(
        { organizationId: orgId, provider: this.registry.name },
        'Preference registry unavailable',
      );
    }

    const ids = rows.map((r) => r.leadId);
    const attempts = await db
      .select({
        leadId: callAttempts.leadId,
        campaignId: callAttempts.campaignId,
        status: callAttempts.status,
        outcome: callAttempts.outcome,
        createdAt: callAttempts.createdAt,
        endedAt: callAttempts.endedAt,
      })
      .from(callAttempts)
      .where(and(eq(callAttempts.organizationId, orgId), inArray(callAttempts.leadId, ids)));

    const inputs = rows.map((row) => {
      const leadAttempts = attempts.filter((a) => a.leadId === row.leadId);
      const input: EligibilityInput = {
        now,
        organization: {
          status: organization.status,
          emergencyStopActive: controls.emergencyStopActive,
          breakerTripped: controls.breakerTrippedAt !== null,
        },
        campaign: {
          callCategory: campaign.callCategory,
          windowStart: campaign.windowStart,
          windowEnd: campaign.windowEnd,
          startsAt: campaign.startsAt,
          endsAt: campaign.endsAt,
          maxAttempts: campaign.maxAttempts,
          retryIntervalMinutes: campaign.retryIntervalMinutes,
          maxAttemptsPerDay: campaign.maxAttemptsPerDay,
          budgetSeconds: campaign.budgetMinutes * 60,
          usedSeconds: campaign.usedSeconds,
        },
        lead: { status: row.status, phoneE164: row.phoneE164 },
        suppressed: row.phoneE164 !== null && suppressed.has(row.phoneE164),
        attempts: {
          dialTimes: leadAttempts
            .filter((a) => a.campaignId === campaign.id)
            .map((a) => a.createdAt),
          liveCall: leadAttempts.some((a) => a.status === 'DIALING'),
          connectedTimes: leadAttempts
            .filter(
              (a) =>
                a.outcome === 'CONNECTED' &&
                a.endedAt !== null &&
                a.endedAt.getTime() >= now.getTime() - CONNECTED_LOOKBACK_MS,
            )
            .map((a) => a.endedAt as Date),
        },
        telecomIdentity: identity
          ? {
              status: identity.status,
              sector: identity.sector,
              a2pDeclaredAt: identity.a2pDeclaredAt,
              selfCertifiedAt: identity.selfCertifiedAt,
            }
          : null,
        callerNumber: caller
          ? { phoneE164: caller.phoneE164, a2pDeclared: caller.a2pDeclared, status: caller.status }
          : null,
        telecomConsent: (row.phoneE164 && telecom.get(row.phoneE164)) || {
          latestGrant: null,
          revocations: [],
        },
        dpdpConsent: dpdp.get(row.contactId) ?? { granted: false, revoked: false },
        preference: (preferences && row.phoneE164 && preferences.get(row.phoneE164)) || {
          available: false,
        },
      };
      return { row, input };
    });

    const evaluated = await Promise.all(
      inputs.map(async ({ row, input }) => {
        const ruleSet = row.phoneE164 ? await this.rules.forPhone(row.phoneE164, now) : null;
        return { row, input, outcome: evaluateEligibility(input, ruleSet) };
      }),
    );

    const inserted = await db
      .insert(eligibilityDecisions)
      .values(
        evaluated.map(({ row, input, outcome }) => ({
          organizationId: orgId,
          leadId: row.leadId,
          campaignId: campaign.id,
          purpose,
          result: outcome.result,
          reasons: outcome.reasons,
          ruleSetId: outcome.ruleSetId,
          ruleSetVersion: outcome.ruleSetVersion,
          jurisdiction: outcome.jurisdiction,
          inputs: snapshot(input),
          nextEligibleAt: outcome.nextEligibleAt,
          evaluatedAt: now,
        })),
      )
      .returning({ id: eligibilityDecisions.id, leadId: eligibilityDecisions.leadId });
    const decisionIds = new Map(inserted.map((d) => [d.leadId, d.id]));

    return evaluated.map(({ row, outcome }) => ({
      leadId: row.leadId,
      decisionId: decisionIds.get(row.leadId) ?? '',
      outcome,
      phoneE164: row.phoneE164,
    }));
  }
}

/** The exact engine input, JSON-safe, with the recipient's number masked. */
function snapshot(input: EligibilityInput): Record<string, unknown> {
  const plain = JSON.parse(JSON.stringify(input)) as Record<string, unknown> & {
    lead: { phoneE164: string | null };
  };
  plain.lead.phoneE164 = maskPhone(input.lead.phoneE164);
  return plain;
}
