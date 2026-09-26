import {
  companies,
  consentBases,
  contacts,
  externalRecordLinks,
  ingestionReviewItems,
  leadStatuses,
  leadStatusChanges,
  leads,
  recordHistory,
  suppressionEntries,
  type ConsentEvidence,
  type Database,
  type dataSources,
  type statusChangeSources,
} from '@nivomi/database';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import {
  DEFAULT_COUNTRY,
  cleanText,
  nameKey,
  namesCompatible,
  normalizeEmail,
  normalizePhone,
} from './normalize.js';

export type DataSource = (typeof dataSources)[number];
export type LeadStatus = (typeof leadStatuses)[number];
export type ConsentBasis = (typeof consentBases)[number];
type StatusChangeSource = (typeof statusChangeSources)[number];

/** A reference to the record in another system (External Record Link, FR-129). */
export interface ExternalRef {
  readonly provider: string;
  readonly accountId: string;
  readonly objectType: string;
  readonly externalId: string;
}

/** One incoming record from any source, before validation. All values are raw text. */
export interface IngestionInput {
  readonly firstName?: string | null | undefined;
  readonly lastName?: string | null | undefined;
  readonly fullName?: string | null | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly company?: string | null | undefined;
  readonly jobTitle?: string | null | undefined;
  readonly city?: string | null | undefined;
  readonly state?: string | null | undefined;
  readonly country?: string | null | undefined;
  readonly preferredLanguage?: string | null | undefined;
  readonly preferredCallTime?: string | null | undefined;
  readonly leadStatus?: string | null | undefined;
  readonly score?: string | null | undefined;
  readonly sourceLabel?: string | null | undefined;
  /** Raw consent value: a Consent Basis, or an opt-out such as "DND". */
  readonly consentStatus?: string | null | undefined;
  readonly consentAt?: string | null | undefined;
  /** Reference for the consent; the operator consent reference for REGISTERED_CONSENT. */
  readonly consentReference?: string | null | undefined;
  readonly customFields?: Readonly<Record<string, string>> | undefined;
  /** Organization-defined unique identifier (FR-17). */
  readonly externalId?: string | null | undefined;
  readonly externalRef?: ExternalRef | null | undefined;
}

/** Applied when a record carries no consent of its own (batch attestation, FR-16). */
export interface ConsentDefault {
  readonly basis: ConsentBasis;
  readonly source: string | null;
  readonly reference: string | null;
  readonly operatorConsentReference: string | null;
  readonly attestedByUserId: string;
}

export interface IngestionContext {
  readonly organizationId: string;
  readonly source: DataSource;
  /** Import job, CRM sync run or request that produced the record. */
  readonly sourceReference: string | null;
  readonly actorUserId: string | null;
  readonly defaultCountry?: string;
  readonly consentDefault?: ConsentDefault | null;
  /**
   * CRM-owned fields (FR-138): the source may overwrite contact details on records linked to it.
   * Other sources only fill empty fields; differing values are reported, never overwritten.
   */
  readonly ownsContactFields?: boolean;
  /** Manual entry must not merge into an existing record silently. */
  readonly onMatch?: 'merge' | 'reject';
  /** Owner Human Agent for Leads this ingestion creates. */
  readonly ownerUserId?: string | null;
}

export interface NormalizedRecord {
  readonly fullName: string;
  readonly hasName: boolean;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly emailNormalized: string | null;
  readonly phoneE164: string;
  readonly company: string | null;
  readonly jobTitle: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;
  readonly preferredLanguage: string | null;
  readonly leadStatus: LeadStatus | null;
  readonly score: string | null;
  readonly customFields: Record<string, string>;
  readonly consent: { basis: ConsentBasis; evidence: ConsentEvidence } | null;
  readonly suppress: boolean;
  readonly externalRefs: ExternalRef[];
}

export type ValidationResult =
  | { readonly ok: true; readonly record: NormalizedRecord }
  | { readonly ok: false; readonly reason: string };

export type MatchDecision =
  | { readonly kind: 'NEW' }
  | { readonly kind: 'EXISTING'; readonly contactId: string; readonly byLink: boolean }
  | { readonly kind: 'REVIEW'; readonly reason: string; readonly candidateContactIds: string[] };

export type IngestionResult =
  | {
      readonly outcome: 'CREATE' | 'UPDATE' | 'SKIP';
      readonly contactId: string;
      readonly leadId: string;
      /** Values that differed but were kept (never overwritten silently). */
      readonly notes: string[];
    }
  | { readonly outcome: 'REVIEW'; readonly reviewItemId: string; readonly reason: string }
  | { readonly outcome: 'DUPLICATE'; readonly contactId: string; readonly leadId: string | null }
  | { readonly outcome: 'INVALID'; readonly reason: string };

const OPT_OUT_VALUES = new Set([
  'dnd',
  'do not call',
  'do_not_call',
  'dnc',
  'opted out',
  'opted_out',
  'opt out',
  'unsubscribed',
  'no',
  'revoked',
]);

const CONTACT_FIELDS = [
  'firstName',
  'lastName',
  'fullName',
  'email',
  'jobTitle',
  'city',
  'state',
  'country',
  'preferredLanguage',
] as const;

function enumValue<T extends string>(
  values: readonly T[],
  raw: string | null | undefined,
): T | null {
  if (!raw) return null;
  const key = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return (values as readonly string[]).includes(key) ? (key as T) : null;
}

/** ISO timestamp, null when empty, or false when the text is not a date. */
function parseTimestamp(raw: string | null | undefined): string | null | false {
  const text = cleanText(raw);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? false : date.toISOString();
}

/** Validation and normalization shared by every source (FR-14, FR-15, FR-16). */
export function validateRecord(input: IngestionInput, ctx: IngestionContext): ValidationResult {
  const phone = normalizePhone(input.phone ?? '', ctx.defaultCountry ?? DEFAULT_COUNTRY);
  if (!phone.ok) return { ok: false, reason: phone.reason };

  let email: string | null = null;
  let emailNormalized: string | null = null;
  if (cleanText(input.email)) {
    const parsed = normalizeEmail(input.email ?? '');
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    email = parsed.email;
    emailNormalized = parsed.normalized;
  }

  let leadStatus: LeadStatus | null = null;
  if (cleanText(input.leadStatus)) {
    leadStatus = enumValue(leadStatuses, input.leadStatus);
    if (!leadStatus) {
      return {
        ok: false,
        reason: `Lead status "${cleanText(input.leadStatus, 40) ?? ''}" is not one of ${leadStatuses.join(', ')}.`,
      };
    }
  }

  const consentAt = parseTimestamp(input.consentAt);
  if (consentAt === false) {
    return { ok: false, reason: `"${cleanText(input.consentAt, 40) ?? ''}" is not a valid date.` };
  }

  let suppress = false;
  let consent: NormalizedRecord['consent'] = null;
  const consentText = cleanText(input.consentStatus);
  if (consentText) {
    if (OPT_OUT_VALUES.has(consentText.toLowerCase())) {
      suppress = true;
    } else {
      const basis = enumValue(consentBases, consentText);
      if (!basis) {
        return {
          ok: false,
          reason: `Consent "${cleanText(consentText, 40) ?? ''}" is not one of ${consentBases.join(', ')}, or an opt-out such as DND.`,
        };
      }
      const reference = cleanText(input.consentReference, 200);
      consent = {
        basis,
        evidence: {
          at: consentAt,
          source: cleanText(input.sourceLabel) ?? ctx.source,
          reference: reference ?? ctx.sourceReference,
          operatorConsentReference: basis === 'REGISTERED_CONSENT' ? reference : null,
          attestedByUserId: null,
        },
      };
    }
  } else if (ctx.consentDefault && !suppress) {
    consent = {
      basis: ctx.consentDefault.basis,
      evidence: {
        at: consentAt,
        source: ctx.consentDefault.source ?? cleanText(input.sourceLabel) ?? ctx.source,
        reference: ctx.consentDefault.reference ?? ctx.sourceReference,
        operatorConsentReference: ctx.consentDefault.operatorConsentReference,
        attestedByUserId: ctx.consentDefault.attestedByUserId,
      },
    };
  }

  if (consent?.basis === 'REGISTERED_CONSENT' && !consent.evidence.operatorConsentReference) {
    return {
      ok: false,
      reason: 'REGISTERED_CONSENT needs the operator consent reference (PRD FR-16).',
    };
  }

  const firstName = cleanText(input.firstName, 100);
  const lastName = cleanText(input.lastName, 100);
  const explicitName =
    cleanText(input.fullName, 200) ??
    cleanText([firstName, lastName].filter(Boolean).join(' '), 200);

  const customFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.customFields ?? {})) {
    const cleanKey = cleanText(key, 60);
    const cleanValue = cleanText(value, 500);
    if (cleanKey && cleanValue) customFields[cleanKey] = cleanValue;
  }
  if (Object.keys(customFields).length > 50) {
    return { ok: false, reason: 'A record can have at most 50 custom fields.' };
  }
  const callTime = cleanText(input.preferredCallTime, 100);
  if (callTime) customFields.preferredCallTime = callTime;

  const externalRefs: ExternalRef[] = [];
  if (input.externalRef) externalRefs.push(input.externalRef);
  const externalId = cleanText(input.externalId, 200);
  if (externalId) {
    externalRefs.push({
      provider: 'EXTERNAL_ID',
      accountId: 'default',
      objectType: 'record',
      externalId,
    });
  }

  return {
    ok: true,
    record: {
      fullName: explicitName ?? email ?? phone.e164,
      hasName: explicitName !== null,
      firstName,
      lastName,
      email,
      emailNormalized,
      phoneE164: phone.e164,
      company: cleanText(input.company, 200),
      jobTitle: cleanText(input.jobTitle, 200),
      city: cleanText(input.city, 100),
      state: cleanText(input.state, 100),
      country: cleanText(input.country, 100),
      preferredLanguage: cleanText(input.preferredLanguage, 50),
      leadStatus,
      score: cleanText(input.score, 50),
      customFields,
      consent,
      suppress,
      externalRefs,
    },
  };
}

const STATUS_CHANGE_SOURCE: Record<DataSource, StatusChangeSource> = {
  FILE_IMPORT: 'IMPORT',
  HUBSPOT: 'HUBSPOT',
  MANUAL: 'MEMBER',
  INBOUND: 'SYSTEM',
};

const CLOSED_STATUSES: LeadStatus[] = ['CONVERTED', 'CLOSED'];

/**
 * The single ingestion path (ADR-017): validation → matching (deduplication, FR-17) →
 * persistence. Callers run it inside a transaction holding {@link lockOrganizationIngestion}.
 */
export class IngestionEngine {
  constructor(private readonly db: Database) {}

  /** Read-only decision, used by previews as well as ingestion. Never looks across tenants. */
  async match(record: NormalizedRecord, ctx: IngestionContext): Promise<MatchDecision> {
    const org = ctx.organizationId;

    for (const ref of record.externalRefs) {
      const [link] = await this.db
        .select({ entityId: externalRecordLinks.entityId })
        .from(externalRecordLinks)
        .where(
          and(
            eq(externalRecordLinks.organizationId, org),
            eq(externalRecordLinks.provider, ref.provider),
            eq(externalRecordLinks.externalAccountId, ref.accountId),
            eq(externalRecordLinks.externalObjectType, ref.objectType),
            eq(externalRecordLinks.externalId, ref.externalId),
            eq(externalRecordLinks.entityType, 'contact'),
          ),
        )
        .limit(1);
      if (link) return { kind: 'EXISTING', contactId: link.entityId, byLink: true };
    }

    const byPhone = await this.db
      .select({ id: contacts.id, fullName: contacts.fullName })
      .from(contacts)
      .where(and(eq(contacts.organizationId, org), eq(contacts.phoneE164, record.phoneE164)))
      .limit(5);
    const byEmail = record.emailNormalized
      ? await this.db
          .select({ id: contacts.id, fullName: contacts.fullName })
          .from(contacts)
          .where(
            and(
              eq(contacts.organizationId, org),
              eq(contacts.emailNormalized, record.emailNormalized),
            ),
          )
          .limit(5)
      : [];

    const candidates = new Map([...byPhone, ...byEmail].map((c) => [c.id, c]));
    if (candidates.size === 0) return { kind: 'NEW' };
    const ids = [...candidates.keys()];
    if (candidates.size > 1) {
      return {
        kind: 'REVIEW',
        reason: 'The phone number and email match different existing contacts.',
        candidateContactIds: ids,
      };
    }
    const [candidate] = [...candidates.values()];
    if (!candidate) return { kind: 'NEW' };
    if (record.hasName && !namesCompatible(record.fullName, candidate.fullName)) {
      return {
        kind: 'REVIEW',
        reason: `Matches "${candidate.fullName}" by phone or email, but the name is different.`,
        candidateContactIds: ids,
      };
    }

    // The match is already linked to a different record in the same external account.
    for (const ref of record.externalRefs) {
      const [otherLink] = await this.db
        .select({ externalId: externalRecordLinks.externalId })
        .from(externalRecordLinks)
        .where(
          and(
            eq(externalRecordLinks.organizationId, org),
            eq(externalRecordLinks.provider, ref.provider),
            eq(externalRecordLinks.externalAccountId, ref.accountId),
            eq(externalRecordLinks.externalObjectType, ref.objectType),
            eq(externalRecordLinks.entityType, 'contact'),
            eq(externalRecordLinks.entityId, candidate.id),
          ),
        )
        .limit(1);
      if (otherLink && otherLink.externalId !== ref.externalId) {
        return {
          kind: 'REVIEW',
          reason: 'Matches a contact that is already linked to a different record in that system.',
          candidateContactIds: ids,
        };
      }
    }
    return { kind: 'EXISTING', contactId: candidate.id, byLink: false };
  }

  async ingest(input: IngestionInput, ctx: IngestionContext): Promise<IngestionResult> {
    const validation = validateRecord(input, ctx);
    if (!validation.ok) return { outcome: 'INVALID', reason: validation.reason };
    const record = validation.record;
    const decision = await this.match(record, ctx);

    if (decision.kind === 'REVIEW') {
      const [item] = await this.db
        .insert(ingestionReviewItems)
        .values({
          organizationId: ctx.organizationId,
          source: ctx.source,
          sourceReference: ctx.sourceReference,
          record: { ...record },
          candidateContactIds: decision.candidateContactIds,
          reason: decision.reason,
        })
        .returning({ id: ingestionReviewItems.id });
      if (!item) throw new Error('review item insert returned no row');
      return { outcome: 'REVIEW', reviewItemId: item.id, reason: decision.reason };
    }

    if (decision.kind === 'EXISTING' && ctx.onMatch === 'reject') {
      const lead = await this.openLead(ctx.organizationId, decision.contactId);
      return { outcome: 'DUPLICATE', contactId: decision.contactId, leadId: lead?.id ?? null };
    }

    return decision.kind === 'NEW'
      ? this.create(record, ctx)
      : this.update(decision.contactId, decision.byLink, record, ctx);
  }

  /** Applies a record as a brand-new contact (also used to resolve a review item). */
  async create(record: NormalizedRecord, ctx: IngestionContext): Promise<IngestionResult> {
    const companyId = await this.companyId(ctx.organizationId, record.company);
    const [contact] = await this.db
      .insert(contacts)
      .values({
        organizationId: ctx.organizationId,
        firstName: record.firstName,
        lastName: record.lastName,
        fullName: record.fullName,
        email: record.email,
        emailNormalized: record.emailNormalized,
        phoneE164: record.phoneE164,
        companyId,
        jobTitle: record.jobTitle,
        city: record.city,
        state: record.state,
        country: record.country,
        preferredLanguage: record.preferredLanguage,
        customFields: record.customFields,
      })
      .returning({ id: contacts.id });
    if (!contact) throw new Error('contact insert returned no row');
    const leadId = await this.createLead(contact.id, record, ctx);
    await this.linkAndSuppress(contact.id, record, ctx);
    return { outcome: 'CREATE', contactId: contact.id, leadId, notes: [] };
  }

  /** Merges a record into an existing contact under the field-ownership rules (FR-138). */
  async update(
    contactId: string,
    byLink: boolean,
    record: NormalizedRecord,
    ctx: IngestionContext,
  ): Promise<IngestionResult> {
    const [existing] = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, ctx.organizationId)))
      .limit(1);
    if (!existing) throw new Error('matched contact disappeared');

    const overwrite = byLink && ctx.ownsContactFields === true;
    const changes: Partial<typeof contacts.$inferInsert> = {};
    const notes: string[] = [];
    const incoming: Record<(typeof CONTACT_FIELDS)[number], string | null> = {
      firstName: record.firstName,
      lastName: record.lastName,
      fullName: record.hasName ? record.fullName : null,
      email: record.email,
      jobTitle: record.jobTitle,
      city: record.city,
      state: record.state,
      country: record.country,
      preferredLanguage: record.preferredLanguage,
    };
    for (const field of CONTACT_FIELDS) {
      const value = incoming[field];
      const current = existing[field];
      if (value === null || value === current) continue;
      if (current === null || overwrite) {
        changes[field] = value;
        if (field === 'email') changes.emailNormalized = record.emailNormalized;
        if (current !== null) await this.history('contact', contactId, field, current, value, ctx);
      } else {
        notes.push(`Kept existing ${field} "${current}" (file had "${value}").`);
      }
    }
    if (overwrite && record.phoneE164 !== existing.phoneE164) {
      await this.history(
        'contact',
        contactId,
        'phoneE164',
        existing.phoneE164,
        record.phoneE164,
        ctx,
      );
      changes.phoneE164 = record.phoneE164;
    }
    if (record.company && (existing.companyId === null || overwrite)) {
      const companyId = await this.companyId(ctx.organizationId, record.company);
      if (companyId !== existing.companyId) changes.companyId = companyId;
    }
    const mergedCustom = { ...existing.customFields };
    let customChanged = false;
    for (const [key, value] of Object.entries(record.customFields)) {
      const current = mergedCustom[key];
      if (current === value) continue;
      if (current === undefined || overwrite) {
        mergedCustom[key] = value;
        customChanged = true;
      } else {
        notes.push(`Kept existing ${key} "${current}".`);
      }
    }
    if (customChanged) changes.customFields = mergedCustom;

    let changed = Object.keys(changes).length > 0;
    if (changed) {
      await this.db.update(contacts).set(changes).where(eq(contacts.id, contactId));
    }

    const lead = await this.openLead(ctx.organizationId, contactId);
    let leadId: string;
    if (!lead) {
      leadId = await this.createLead(contactId, record, ctx);
      changed = true;
    } else {
      leadId = lead.id;
      const leadChanges: Partial<typeof leads.$inferInsert> = {};
      if (record.consent) {
        if (lead.consentBasis === null) {
          leadChanges.consentBasis = record.consent.basis;
          leadChanges.consentEvidence = record.consent.evidence;
          await this.history('lead', lead.id, 'consentBasis', null, record.consent.basis, ctx);
        } else if (lead.consentBasis !== record.consent.basis) {
          notes.push(`Kept existing consent basis ${lead.consentBasis}.`);
        }
      }
      if (record.score && record.score !== lead.score && (lead.score === null || overwrite)) {
        leadChanges.score = record.score;
      }
      if (Object.keys(leadChanges).length > 0) {
        await this.db.update(leads).set(leadChanges).where(eq(leads.id, lead.id));
        changed = true;
      }
    }

    if (await this.linkAndSuppress(contactId, record, ctx)) changed = true;
    return { outcome: changed ? 'UPDATE' : 'SKIP', contactId, leadId, notes };
  }

  async openLead(organizationId: string, contactId: string) {
    const [lead] = await this.db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.organizationId, organizationId),
          eq(leads.contactId, contactId),
          notInArray(leads.status, CLOSED_STATUSES),
        ),
      )
      .limit(1);
    return lead ?? null;
  }

  private async createLead(
    contactId: string,
    record: NormalizedRecord,
    ctx: IngestionContext,
  ): Promise<string> {
    const status = record.leadStatus ?? 'NEW';
    const [lead] = await this.db
      .insert(leads)
      .values({
        organizationId: ctx.organizationId,
        contactId,
        status,
        source: ctx.source,
        consentBasis: record.consent?.basis ?? null,
        consentEvidence: record.consent?.evidence ?? null,
        score: record.score,
        ownerUserId: ctx.ownerUserId ?? null,
      })
      .returning({ id: leads.id });
    if (!lead) throw new Error('lead insert returned no row');
    await this.db.insert(leadStatusChanges).values({
      organizationId: ctx.organizationId,
      leadId: lead.id,
      fromStatus: null,
      toStatus: status,
      source: STATUS_CHANGE_SOURCE[ctx.source],
      actorUserId: ctx.actorUserId,
      reason: 'Lead created',
      eventKey: `created:${ctx.source}:${ctx.sourceReference ?? 'direct'}`,
    });
    return lead.id;
  }

  /** Adds External Record Links and suppression; returns true when anything new was stored. */
  private async linkAndSuppress(
    contactId: string,
    record: NormalizedRecord,
    ctx: IngestionContext,
  ): Promise<boolean> {
    let added = false;
    for (const ref of record.externalRefs) {
      const inserted = await this.db
        .insert(externalRecordLinks)
        .values({
          organizationId: ctx.organizationId,
          provider: ref.provider,
          externalAccountId: ref.accountId,
          externalObjectType: ref.objectType,
          externalId: ref.externalId,
          entityType: 'contact',
          entityId: contactId,
          lastSyncedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            externalRecordLinks.organizationId,
            externalRecordLinks.provider,
            externalRecordLinks.externalAccountId,
            externalRecordLinks.externalObjectType,
            externalRecordLinks.externalId,
          ],
          set: { lastSyncedAt: new Date() },
        })
        .returning({ created: sql<boolean>`(xmax = 0)` });
      if (inserted[0]?.created) added = true;
    }
    if (record.suppress) {
      const suppressed = await this.db
        .insert(suppressionEntries)
        .values({
          organizationId: ctx.organizationId,
          phoneE164: record.phoneE164,
          source:
            ctx.source === 'HUBSPOT' ? 'HUBSPOT' : ctx.source === 'MANUAL' ? 'MANUAL' : 'IMPORT',
          reason: 'Opt-out recorded at the source',
          createdByUserId: ctx.actorUserId,
        })
        .onConflictDoNothing()
        .returning({ id: suppressionEntries.id });
      if (suppressed.length > 0) added = true;
    }
    return added;
  }

  private async companyId(organizationId: string, name: string | null): Promise<string | null> {
    if (!name) return null;
    const key = nameKey(name);
    if (!key) return null;
    const [row] = await this.db
      .insert(companies)
      .values({ organizationId, name, nameNormalized: key })
      .onConflictDoUpdate({
        target: [companies.organizationId, companies.nameNormalized],
        // No-op update so RETURNING yields the existing row.
        set: { nameNormalized: key },
      })
      .returning({ id: companies.id });
    return row?.id ?? null;
  }

  private async history(
    entityType: 'contact' | 'lead',
    entityId: string,
    field: string,
    oldValue: string | null,
    newValue: string | null,
    ctx: IngestionContext,
  ): Promise<void> {
    await this.db.insert(recordHistory).values({
      organizationId: ctx.organizationId,
      entityType,
      entityId,
      field,
      oldValue,
      newValue,
      source: ctx.source,
      sourceReference: ctx.sourceReference,
      actorUserId: ctx.actorUserId,
    });
  }
}

/**
 * Serializes ingestion writes per Organization for the rest of the transaction, so two sources
 * (an import and a CRM sync) cannot both create the same contact.
 */
export async function lockOrganizationIngestion(tx: Database, organizationId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ingest:${organizationId}`}))`);
}

/** True when the phone number is on the Organization's Suppression List. */
export async function suppressedPhones(
  db: Database,
  organizationId: string,
  phones: string[],
): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const rows = await db
    .select({ phone: suppressionEntries.phoneE164 })
    .from(suppressionEntries)
    .where(
      and(
        eq(suppressionEntries.organizationId, organizationId),
        inArray(suppressionEntries.phoneE164, phones),
      ),
    );
  return new Set(rows.map((r) => r.phone));
}
