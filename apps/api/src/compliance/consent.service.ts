import { Inject, Injectable } from '@nestjs/common';
import {
  contacts,
  dpdpConsentEntries,
  leads,
  telecomConsentEntries,
  type Database,
  type consentBases,
} from '@nivomi/database';
import { and, desc, eq, or, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { TenantPrincipal } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { cleanText } from '../leads/normalize.js';
import { Clock } from './clock.js';
import {
  projectTelecomConsent,
  recordDpdpConsent,
  recordTelecomConsent,
} from './consent-ledger.js';

export interface ConsentEntryRequest {
  readonly ledger: 'TELECOM' | 'DPDP';
  readonly kind: 'GRANT' | 'REVOCATION';
  readonly basis?: (typeof consentBases)[number] | null | undefined;
  readonly purpose?: string | null | undefined;
  readonly noticeVersion?: string | null | undefined;
  readonly evidenceAt?: string | null | undefined;
  readonly evidenceSource?: string | null | undefined;
  readonly reference?: string | null | undefined;
  readonly operatorConsentReference?: string | null | undefined;
  readonly recipientInitiated?: boolean | undefined;
  readonly note?: string | null | undefined;
  readonly idempotencyKey?: string | null | undefined;
}

/** Reading and recording entries in a lead's two consent ledgers (FR-52). */
@Injectable()
export class ConsentService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  private async lead(
    tenant: TenantPrincipal,
    leadId: string,
    _permission: 'leads.read' | 'leads.write',
  ) {
    const conditions: SQL[] = [
      eq(leads.id, leadId),
      eq(leads.organizationId, tenant.membership.organizationId),
    ];
    const [row] = await this.db
      .select({ id: leads.id, contactId: contacts.id, phoneE164: contacts.phoneE164 })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(and(...conditions))
      .limit(1);
    if (!row) throw new AppError('NOT_FOUND', 'Lead not found.');
    return row;
  }

  async list(tenant: TenantPrincipal, leadId: string) {
    const lead = await this.lead(tenant, leadId, 'leads.read');
    const orgId = tenant.membership.organizationId;
    const telecom = await this.db
      .select()
      .from(telecomConsentEntries)
      .where(
        and(
          eq(telecomConsentEntries.organizationId, orgId),
          or(
            eq(telecomConsentEntries.contactId, lead.contactId),
            lead.phoneE164 ? eq(telecomConsentEntries.phoneE164, lead.phoneE164) : undefined,
          ),
        ),
      )
      .orderBy(desc(telecomConsentEntries.createdAt))
      .limit(100);
    const dpdp = await this.db
      .select()
      .from(dpdpConsentEntries)
      .where(
        and(
          eq(dpdpConsentEntries.organizationId, orgId),
          eq(dpdpConsentEntries.contactId, lead.contactId),
        ),
      )
      .orderBy(desc(dpdpConsentEntries.createdAt))
      .limit(100);
    const shape = (e: (typeof telecom)[number] | (typeof dpdp)[number]) => ({
      id: e.id,
      kind: e.kind,
      validFrom: e.validFrom,
      source: e.source,
      note: e.note,
      evidence: e.evidence,
      createdAt: e.createdAt,
    });
    return {
      telecom: telecom.map((e) => ({
        ...shape(e),
        basis: e.basis,
        // Consent follows the number: entries for a previous number are shown but marked.
        currentNumber: e.phoneE164 === lead.phoneE164,
        recipientInitiated: e.recipientInitiated,
      })),
      dpdp: dpdp.map((e) => ({ ...shape(e), purpose: e.purpose, noticeVersion: e.noticeVersion })),
    };
  }

  async record(
    tenant: TenantPrincipal,
    leadId: string,
    input: ConsentEntryRequest,
    context: ClientContext,
  ) {
    const lead = await this.lead(tenant, leadId, 'leads.write');
    const orgId = tenant.membership.organizationId;
    const evidenceAt = input.evidenceAt ? new Date(input.evidenceAt) : null;
    if (evidenceAt && (Number.isNaN(evidenceAt.getTime()) || evidenceAt > this.clock.now())) {
      throw new AppError('VALIDATION_ERROR', 'The evidence date must be a valid past date.');
    }
    const evidence = {
      at: evidenceAt?.toISOString() ?? null,
      source: cleanText(input.evidenceSource) ?? 'Recorded by a member',
      reference: cleanText(input.reference),
      operatorConsentReference: cleanText(input.operatorConsentReference),
      attestedByUserId: tenant.userId,
    };
    const eventKey = `member:${cleanText(input.idempotencyKey, 100) ?? randomUUID()}`;

    return this.db.transaction(async (tx) => {
      let created: boolean;
      if (input.ledger === 'TELECOM') {
        if (!lead.phoneE164)
          throw new AppError('VALIDATION_ERROR', 'The lead has no phone number.');
        if (input.kind === 'GRANT' && !input.basis) {
          throw new AppError('VALIDATION_ERROR', 'Choose the consent basis.');
        }
        if (input.basis === 'REGISTERED_CONSENT' && !evidence.operatorConsentReference) {
          throw new AppError(
            'VALIDATION_ERROR',
            'REGISTERED_CONSENT needs the operator consent reference.',
          );
        }
        created = await recordTelecomConsent(tx, {
          organizationId: orgId,
          contactId: lead.contactId,
          leadId: lead.id,
          phoneE164: lead.phoneE164,
          kind: input.kind,
          basis: input.basis ?? null,
          evidence,
          source: 'MEMBER',
          recipientInitiated: input.recipientInitiated ?? false,
          note: cleanText(input.note, 500),
          recordedByUserId: tenant.userId,
          eventKey,
        });
        if (created) {
          await projectTelecomConsent(tx, lead.id, {
            kind: input.kind,
            basis: input.basis ?? null,
            evidence,
          });
        }
      } else {
        const purpose = cleanText(input.purpose, 200);
        if (!purpose) throw new AppError('VALIDATION_ERROR', 'Describe the processing purpose.');
        created = await recordDpdpConsent(tx, {
          organizationId: orgId,
          contactId: lead.contactId,
          leadId: lead.id,
          kind: input.kind,
          purpose,
          noticeVersion: cleanText(input.noticeVersion, 100),
          evidence,
          source: 'MEMBER',
          note: cleanText(input.note, 500),
          recordedByUserId: tenant.userId,
          eventKey,
        });
      }
      if (created) {
        await this.audit.record(
          {
            action: 'consent.recorded',
            organizationId: orgId,
            actorUserId: tenant.userId,
            resourceType: 'lead',
            resourceId: lead.id,
            metadata: { ledger: input.ledger, kind: input.kind, basis: input.basis ?? null },
          },
          context,
          tx,
        );
      }
      return { created };
    });
  }
}
