import { Inject, Injectable } from '@nestjs/common';
import {
  callerNumbers,
  telecomIdentities,
  type BusinessSector,
  type Database,
} from '@nivomi/database';
import { and, asc, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { TenantPrincipal } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import { isUniqueViolation } from '../common/database-errors.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { cleanText } from '../leads/normalize.js';
import { callingControls } from './calling-controls.service.js';
import { Clock } from './clock.js';
import { classifyNumberSeries, selfCertificationExpiresAt } from './compliance-engine.js';
import { RuleSetRegistry } from './rule-set-registry.js';

export interface TelecomIdentityInput {
  readonly legalName?: string | null | undefined;
  readonly dltEntityId?: string | null | undefined;
  readonly telemarketerName?: string | null | undefined;
  readonly telemarketerRegistrationId?: string | null | undefined;
  readonly sector?: BusinessSector | null | undefined;
  readonly a2pDeclarationReference?: string | null | undefined;
  readonly a2pDeclaredAt?: string | null | undefined;
  readonly selfCertifiedAt?: string | null | undefined;
}

const DAY_MS = 86_400_000;
/** FR-12 / A-8: warn this long before the self-certification lapses. */
const EXPIRY_WARNING_DAYS = 30;

function parseDate(value: string | null | undefined, label: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new AppError('VALIDATION_ERROR', `${label} is not a valid date.`);
  return date;
}

/**
 * The Organization's Telecom Identity and Caller Numbers (PRD FR-9–FR-13). Only VERIFIED allows
 * calls; any edit to a verified identity or its numbers sends it back to UNVERIFIED. Super Admin
 * verification is a platform action (the Super Admin UI arrives in Phase 9).
 */
@Injectable()
export class TelecomIdentityService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly rules: RuleSetRegistry,
    private readonly clock: Clock,
  ) {}

  private async ruleSet(organizationId: string) {
    const controls = await callingControls(this.db, organizationId);
    return this.rules.active(controls.defaultJurisdiction, this.clock.now());
  }

  async get(organizationId: string) {
    const [identity] = await this.db
      .select()
      .from(telecomIdentities)
      .where(eq(telecomIdentities.organizationId, organizationId))
      .limit(1);
    const numbers = await this.db
      .select()
      .from(callerNumbers)
      .where(eq(callerNumbers.organizationId, organizationId))
      .orderBy(asc(callerNumbers.createdAt));
    const ruleSet = await this.ruleSet(organizationId);
    const now = this.clock.now();
    const expiresAt = ruleSet
      ? selfCertificationExpiresAt(ruleSet.rules, identity?.selfCertifiedAt ?? null)
      : null;
    const status = identity?.status ?? 'UNVERIFIED';
    // Expiry is evaluated, not stored by a job: the effective state is EXPIRED once it lapses.
    const effectiveStatus =
      status === 'VERIFIED' && expiresAt && expiresAt <= now ? 'EXPIRED' : status;
    return {
      status,
      effectiveStatus,
      statusReason: identity?.statusReason ?? null,
      legalName: identity?.legalName ?? null,
      dltEntityId: identity?.dltEntityId ?? null,
      telemarketerName: identity?.telemarketerName ?? null,
      telemarketerRegistrationId: identity?.telemarketerRegistrationId ?? null,
      sector: identity?.sector ?? null,
      a2pDeclarationReference: identity?.a2pDeclarationReference ?? null,
      a2pDeclaredAt: identity?.a2pDeclaredAt ?? null,
      selfCertifiedAt: identity?.selfCertifiedAt ?? null,
      selfCertificationExpiresAt: expiresAt,
      expiringSoon:
        expiresAt !== null &&
        expiresAt > now &&
        expiresAt.getTime() - now.getTime() <= EXPIRY_WARNING_DAYS * DAY_MS,
      submittedAt: identity?.submittedAt ?? null,
      reviewedAt: identity?.reviewedAt ?? null,
      numbers: numbers.map((n) => ({
        id: n.id,
        phone: n.phoneE164,
        series: n.series,
        purpose: n.purpose,
        a2pDeclared: n.a2pDeclared,
        status: n.status,
        statusReason: n.statusReason,
        createdAt: n.createdAt,
      })),
      permittedSeries: ruleSet?.rules.numberSeries ?? [],
    };
  }

  /** Locks (creating if needed) the identity row; an edit un-verifies it. */
  private async lockIdentity(tx: Database, organizationId: string) {
    await tx.insert(telecomIdentities).values({ organizationId }).onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(telecomIdentities)
      .where(eq(telecomIdentities.organizationId, organizationId))
      .for('update');
    if (!row) throw new Error('telecom identity row missing');
    return row;
  }

  private async unverify(tx: Database, organizationId: string, reason: string) {
    await tx
      .update(telecomIdentities)
      .set({ status: 'UNVERIFIED', statusReason: reason })
      .where(eq(telecomIdentities.organizationId, organizationId));
  }

  async update(tenant: TenantPrincipal, input: TelecomIdentityInput, context: ClientContext) {
    const orgId = tenant.membership.organizationId;
    const a2pDeclaredAt = parseDate(input.a2pDeclaredAt, 'A2P declaration date');
    const selfCertifiedAt = parseDate(input.selfCertifiedAt, 'Self-certification date');
    const now = this.clock.now();
    if ((a2pDeclaredAt && a2pDeclaredAt > now) || (selfCertifiedAt && selfCertifiedAt > now)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Declaration and certification dates cannot be in the future.',
      );
    }
    await this.db.transaction(async (tx) => {
      const current = await this.lockIdentity(tx, orgId);
      const text = (value: string | null | undefined) =>
        value === undefined ? undefined : cleanText(value, 200);
      const changes = Object.fromEntries(
        Object.entries({
          legalName: text(input.legalName),
          dltEntityId: text(input.dltEntityId),
          telemarketerName: text(input.telemarketerName),
          telemarketerRegistrationId: text(input.telemarketerRegistrationId),
          sector: input.sector,
          a2pDeclarationReference: text(input.a2pDeclarationReference),
          a2pDeclaredAt,
          selfCertifiedAt,
        }).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(changes).length === 0) return;
      const reset = current.status !== 'UNVERIFIED';
      await tx
        .update(telecomIdentities)
        .set({
          ...changes,
          ...(reset
            ? {
                status: 'UNVERIFIED' as const,
                statusReason: 'Changed after submission; submit again for verification.',
              }
            : {}),
        })
        .where(eq(telecomIdentities.id, current.id));
      await this.audit.record(
        {
          action: 'telecom.identity_updated',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'telecom_identity',
          resourceId: current.id,
          metadata: { fields: Object.keys(changes), previousStatus: current.status },
        },
        context,
        tx,
      );
    });
    return this.get(orgId);
  }

  /** FR-10: UNVERIFIED → PENDING_REVIEW, only when every required detail is present. */
  async submit(tenant: TenantPrincipal, context: ClientContext) {
    const orgId = tenant.membership.organizationId;
    await this.db.transaction(async (tx) => {
      const identity = await this.lockIdentity(tx, orgId);
      if (identity.status === 'PENDING_REVIEW' || identity.status === 'VERIFIED') {
        throw new AppError('CONFLICT', 'The telecom identity is already submitted.');
      }
      const missing = [
        ['legal name', identity.legalName],
        ['DLT entity ID', identity.dltEntityId],
        ['telemarketer', identity.telemarketerName],
        ['sector', identity.sector],
        ['A2P declaration reference', identity.a2pDeclarationReference],
        ['A2P declaration date', identity.a2pDeclaredAt],
        ['self-certification date', identity.selfCertifiedAt],
      ]
        .filter(([, value]) => !value)
        .map(([label]) => label as string);
      const [active] = await tx
        .select({ id: callerNumbers.id })
        .from(callerNumbers)
        .where(and(eq(callerNumbers.organizationId, orgId), eq(callerNumbers.status, 'ACTIVE')))
        .limit(1);
      if (!active) missing.push('an active caller number');
      if (missing.length > 0) {
        throw new AppError('VALIDATION_ERROR', 'Some telecom details are missing.', {
          details: missing.map((m) => `Missing ${m}.`),
        });
      }
      await tx
        .update(telecomIdentities)
        .set({
          status: 'PENDING_REVIEW',
          statusReason: null,
          submittedAt: this.clock.now(),
          submittedByUserId: tenant.userId,
        })
        .where(eq(telecomIdentities.id, identity.id));
      await this.audit.record(
        {
          action: 'telecom.identity_submitted',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'telecom_identity',
          resourceId: identity.id,
        },
        context,
        tx,
      );
    });
    return this.get(orgId);
  }

  /** FR-11: a number belongs to exactly one Organization and must be in a permitted series. */
  async addNumber(
    tenant: TenantPrincipal,
    input: { phone: string; purpose: 'PROMOTIONAL' | 'SERVICE'; a2pDeclared: boolean },
    context: ClientContext,
  ) {
    const orgId = tenant.membership.organizationId;
    const ruleSet = await this.ruleSet(orgId);
    if (!ruleSet)
      throw new AppError('CONFLICT', 'No rule set covers this organization’s jurisdiction.');
    const phone = normalizeCallerNumber(input.phone, ruleSet.rules.phoneCountryCodes[0] ?? '+91');
    const series = phone ? classifyNumberSeries(ruleSet.rules, phone) : null;
    if (!phone || !series) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Caller numbers must be in a registered commercial series (${ruleSet.rules.numberSeries.map((s) => `${s.prefix}xx`).join(', ')}).`,
      );
    }
    try {
      return await this.db.transaction(async (tx) => {
        await this.lockIdentity(tx, orgId);
        const [existing] = await tx
          .select()
          .from(callerNumbers)
          .where(eq(callerNumbers.phoneE164, phone))
          .limit(1);
        let id: string;
        if (existing) {
          if (existing.organizationId !== orgId || existing.status !== 'RETIRED') {
            throw new AppError('CONFLICT', 'This number is already assigned.');
          }
          await tx
            .update(callerNumbers)
            .set({
              status: 'ACTIVE',
              statusReason: null,
              purpose: input.purpose,
              a2pDeclared: input.a2pDeclared,
              series,
            })
            .where(eq(callerNumbers.id, existing.id));
          id = existing.id;
        } else {
          const [row] = await tx
            .insert(callerNumbers)
            .values({
              organizationId: orgId,
              phoneE164: phone,
              series,
              purpose: input.purpose,
              a2pDeclared: input.a2pDeclared,
              createdByUserId: tenant.userId,
            })
            .returning({ id: callerNumbers.id });
          if (!row) throw new Error('caller number insert returned no row');
          id = row.id;
        }
        await this.unverify(tx, orgId, 'Caller numbers changed; submit again for verification.');
        await this.audit.record(
          {
            action: 'telecom.number_added',
            organizationId: orgId,
            actorUserId: tenant.userId,
            resourceType: 'caller_number',
            resourceId: id,
            metadata: { series, purpose: input.purpose, a2pDeclared: input.a2pDeclared },
          },
          context,
          tx,
        );
        return { id, phone, series };
      });
    } catch (error) {
      // Another organization inserted the same number concurrently.
      if (isUniqueViolation(error))
        throw new AppError('CONFLICT', 'This number is already assigned.');
      throw error;
    }
  }

  /** Retires a number (kept for call history); running campaigns using it will be blocked. */
  async removeNumber(tenant: TenantPrincipal, numberId: string, context: ClientContext) {
    const orgId = tenant.membership.organizationId;
    await this.db.transaction(async (tx) => {
      const [number] = await tx
        .update(callerNumbers)
        .set({ status: 'RETIRED', statusReason: 'Removed by a member' })
        .where(and(eq(callerNumbers.id, numberId), eq(callerNumbers.organizationId, orgId)))
        .returning({ id: callerNumbers.id });
      if (!number) throw new AppError('NOT_FOUND', 'Caller number not found.');
      await this.audit.record(
        {
          action: 'telecom.number_removed',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'caller_number',
          resourceId: numberId,
        },
        context,
        tx,
      );
    });
  }

  /** Super Admin review (FR-10): PENDING_REVIEW → VERIFIED, or back to UNVERIFIED with a reason. */
  async review(
    organizationId: string,
    decision: { approve: boolean; reason?: string | null | undefined },
    superAdminId: string,
    context: ClientContext,
  ) {
    await this.db.transaction(async (tx) => {
      const [identity] = await tx
        .select()
        .from(telecomIdentities)
        .where(eq(telecomIdentities.organizationId, organizationId))
        .for('update');
      if (!identity) throw new AppError('NOT_FOUND', 'Telecom identity not found.');
      if (identity.status !== 'PENDING_REVIEW') {
        throw new AppError('CONFLICT', 'Only a submitted telecom identity can be reviewed.');
      }
      await tx
        .update(telecomIdentities)
        .set({
          status: decision.approve ? 'VERIFIED' : 'UNVERIFIED',
          statusReason: decision.approve ? null : (cleanText(decision.reason, 500) ?? 'Rejected'),
          reviewedAt: this.clock.now(),
          reviewedByUserId: superAdminId,
        })
        .where(eq(telecomIdentities.id, identity.id));
      await this.audit.record(
        {
          action: decision.approve ? 'telecom.identity_verified' : 'telecom.identity_rejected',
          organizationId,
          actorUserId: superAdminId,
          resourceType: 'telecom_identity',
          resourceId: identity.id,
          metadata: decision.approve ? {} : { reason: cleanText(decision.reason, 500) },
        },
        context,
        tx,
      );
    });
    return this.get(organizationId);
  }
}

/** "140 123 4567", "+91 1401234567" or "911401234567" → "+911401234567". */
export function normalizeCallerNumber(raw: string, defaultCountryCode: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (trimmed.startsWith('+')) return `+${digits}`;
  const code = defaultCountryCode.slice(1);
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  if (digits.startsWith(code) && digits.length === 10 + code.length) return `+${digits}`;
  return null;
}
