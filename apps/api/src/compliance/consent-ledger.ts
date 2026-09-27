import {
  contacts,
  dpdpConsentEntries,
  leads,
  telecomConsentEntries,
  type ConsentEvidence,
  type Database,
  type consentBases,
} from '@nivomi/database';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { TelecomConsentState } from './compliance-engine.js';

/**
 * The two consent ledgers (FR-52, ADR-021 §4). Append-only: a revocation is a new entry, and the
 * telecom and DPDP ledgers are revoked independently. Functions take the caller's transaction so
 * an entry commits together with the change that caused it.
 */

type ConsentBasis = (typeof consentBases)[number];

export interface TelecomEntryInput {
  readonly organizationId: string;
  readonly contactId: string;
  readonly leadId: string | null;
  readonly phoneE164: string;
  readonly kind: 'GRANT' | 'REVOCATION';
  readonly basis?: ConsentBasis | null;
  readonly evidence?: ConsentEvidence | null;
  readonly source: string;
  readonly recipientInitiated?: boolean;
  readonly note?: string | null;
  readonly recordedByUserId: string | null;
  /** The triggering event; the same event records one entry. */
  readonly eventKey: string;
}

/** Returns true when a new entry was written (false for a replayed event). */
export async function recordTelecomConsent(
  db: Database,
  entry: TelecomEntryInput,
): Promise<boolean> {
  const at = entry.evidence?.at ? new Date(entry.evidence.at) : null;
  const inserted = await db
    .insert(telecomConsentEntries)
    .values({
      organizationId: entry.organizationId,
      contactId: entry.contactId,
      leadId: entry.leadId,
      phoneE164: entry.phoneE164,
      kind: entry.kind,
      basis: entry.kind === 'GRANT' ? (entry.basis ?? null) : null,
      evidence: entry.evidence ?? null,
      validFrom: at && !Number.isNaN(at.getTime()) ? at : null,
      source: entry.source,
      recipientInitiated: entry.recipientInitiated ?? false,
      note: entry.note ?? null,
      recordedByUserId: entry.recordedByUserId,
      eventKey: entry.eventKey,
    })
    .onConflictDoNothing()
    .returning({ id: telecomConsentEntries.id });
  return inserted.length > 0;
}

export interface DpdpEntryInput {
  readonly organizationId: string;
  readonly contactId: string;
  readonly leadId: string | null;
  readonly kind: 'GRANT' | 'REVOCATION';
  readonly purpose: string;
  readonly noticeVersion?: string | null;
  readonly evidence?: ConsentEvidence | null;
  readonly source: string;
  readonly note?: string | null;
  readonly recordedByUserId: string | null;
  readonly eventKey: string;
}

export async function recordDpdpConsent(db: Database, entry: DpdpEntryInput): Promise<boolean> {
  const at = entry.evidence?.at ? new Date(entry.evidence.at) : null;
  const inserted = await db
    .insert(dpdpConsentEntries)
    .values({
      organizationId: entry.organizationId,
      contactId: entry.contactId,
      leadId: entry.leadId,
      kind: entry.kind,
      purpose: entry.purpose,
      noticeVersion: entry.noticeVersion ?? null,
      evidence: entry.evidence ?? null,
      validFrom: at && !Number.isNaN(at.getTime()) ? at : null,
      source: entry.source,
      note: entry.note ?? null,
      recordedByUserId: entry.recordedByUserId,
      eventKey: entry.eventKey,
    })
    .onConflictDoNothing()
    .returning({ id: dpdpConsentEntries.id });
  return inserted.length > 0;
}

/** Telecom consent state per number, as the ComplianceEngine consumes it. */
export async function telecomConsentStates(
  db: Database,
  organizationId: string,
  phones: readonly string[],
): Promise<Map<string, TelecomConsentState>> {
  const states = new Map<string, TelecomConsentState>();
  if (phones.length === 0) return states;
  const rows = await db
    .select()
    .from(telecomConsentEntries)
    .where(
      and(
        eq(telecomConsentEntries.organizationId, organizationId),
        inArray(telecomConsentEntries.phoneE164, [...new Set(phones)]),
      ),
    )
    .orderBy(asc(telecomConsentEntries.createdAt), asc(telecomConsentEntries.id));
  for (const phone of phones) states.set(phone, { latestGrant: null, revocations: [] });
  for (const row of rows) {
    const state = states.get(row.phoneE164) ?? { latestGrant: null, revocations: [] };
    states.set(
      row.phoneE164,
      row.kind === 'REVOCATION'
        ? { ...state, revocations: [...state.revocations, row.createdAt] }
        : {
            ...state,
            latestGrant: {
              basis: row.basis,
              validFrom: row.validFrom,
              operatorReference: row.evidence?.operatorConsentReference ?? null,
              recordedAt: row.createdAt,
              recipientInitiated: row.recipientInitiated,
            },
          },
    );
  }
  return states;
}

/** DPDP state per contact: granted (a grant not revoked since) and revoked (latest entry). */
export async function dpdpConsentStates(
  db: Database,
  organizationId: string,
  contactIds: readonly string[],
): Promise<Map<string, { granted: boolean; revoked: boolean }>> {
  const states = new Map<string, { granted: boolean; revoked: boolean }>();
  if (contactIds.length === 0) return states;
  const rows = await db
    .select({
      contactId: dpdpConsentEntries.contactId,
      kind: dpdpConsentEntries.kind,
    })
    .from(dpdpConsentEntries)
    .where(
      and(
        eq(dpdpConsentEntries.organizationId, organizationId),
        inArray(dpdpConsentEntries.contactId, [...new Set(contactIds)]),
      ),
    )
    .orderBy(asc(dpdpConsentEntries.createdAt), asc(dpdpConsentEntries.id));
  for (const id of contactIds) states.set(id, { granted: false, revoked: false });
  for (const row of rows) {
    states.set(
      row.contactId,
      row.kind === 'GRANT' ? { granted: true, revoked: false } : { granted: false, revoked: true },
    );
  }
  return states;
}

/**
 * Keeps `leads.consent_basis` (the projection lists and filters read) in step with a telecom
 * ledger entry, in the same transaction.
 */
export async function projectTelecomConsent(
  db: Database,
  leadId: string,
  entry: {
    kind: 'GRANT' | 'REVOCATION';
    basis?: ConsentBasis | null;
    evidence?: ConsentEvidence | null;
  },
): Promise<void> {
  await db
    .update(leads)
    .set(
      entry.kind === 'GRANT'
        ? { consentBasis: entry.basis ?? null, consentEvidence: entry.evidence ?? null }
        : { consentBasis: null, consentEvidence: null },
    )
    .where(eq(leads.id, leadId));
}

/** The contact and phone of a lead, for ledger entries. */
export async function leadContact(db: Database, organizationId: string, leadId: string) {
  const [row] = await db
    .select({ leadId: leads.id, contactId: contacts.id, phoneE164: contacts.phoneE164 })
    .from(leads)
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}
