import { Inject, Injectable } from '@nestjs/common';
import {
  companies,
  contacts,
  crmConnections,
  externalRecordLinks,
  ingestionReviewItems,
  leadStatusChanges,
  leads,
  organizationMembers,
  recordHistory,
  suppressionEntries,
  users,
  type Database,
} from '@nivomi/database';
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { TenantPrincipal } from '../auth/principal.js';
import { isOwnScoped } from '../authorization/permissions.js';
import { AppError } from '../common/errors.js';
import { decodeCursor, toPage } from '../common/pagination.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import {
  IngestionEngine,
  lockOrganizationIngestion,
  validateRecord,
  type ConsentBasis,
  type IngestionContext,
  type IngestionInput,
  type LeadStatus,
  type NormalizedRecord,
} from './ingestion.js';
import { cleanText, nameKey, normalizeEmail, normalizePhone } from './normalize.js';

export interface LeadListQuery {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly search?: string | undefined;
  readonly status?: LeadStatus | undefined;
  readonly source?: 'FILE_IMPORT' | 'HUBSPOT' | 'MANUAL' | 'INBOUND' | undefined;
  readonly consent?: 'with_basis' | 'missing' | undefined;
  readonly owner?: 'me' | 'unassigned' | undefined;
}

export interface ManualLeadInput extends IngestionInput {
  readonly consentBasis?: ConsentBasis | null | undefined;
  readonly consentSource?: string | null | undefined;
  readonly ownerUserId?: string | null | undefined;
}

export interface LeadUpdateInput {
  readonly fullName?: string | undefined;
  readonly email?: string | null | undefined;
  readonly phone?: string | undefined;
  readonly company?: string | null | undefined;
  readonly jobTitle?: string | null | undefined;
  readonly city?: string | null | undefined;
  readonly state?: string | null | undefined;
  readonly country?: string | null | undefined;
  readonly preferredLanguage?: string | null | undefined;
  readonly ownerUserId?: string | null | undefined;
}

const notFound = () => new AppError('NOT_FOUND', 'Lead not found.');

const asText = (value: unknown): string | null =>
  value === null || value === undefined
    ? null
    : typeof value === 'string'
      ? value
      : JSON.stringify(value);

@Injectable()
export class LeadsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** AGENTs see only Leads assigned to them (PRD §8.1 "own"). */
  private scope(tenant: TenantPrincipal, permission: 'leads.read' | 'leads.write'): SQL {
    const inTenant = eq(leads.organizationId, tenant.membership.organizationId);
    return isOwnScoped(tenant.membership.role, permission)
      ? (and(inTenant, eq(leads.ownerUserId, tenant.userId)) as SQL)
      : inTenant;
  }

  /** PRD FR-20: searchable, filterable, keyset-paginated. */
  async list(tenant: TenantPrincipal, query: LeadListQuery) {
    const conditions: SQL[] = [this.scope(tenant, 'leads.read')];
    const after = decodeCursor(query.cursor);
    if (after) {
      conditions.push(
        or(
          lt(leads.createdAt, after.createdAt),
          and(eq(leads.createdAt, after.createdAt), lt(leads.id, after.id)),
        ) as SQL,
      );
    }
    if (query.status) conditions.push(eq(leads.status, query.status));
    if (query.source) conditions.push(eq(leads.source, query.source));
    if (query.consent === 'with_basis') conditions.push(isNotNull(leads.consentBasis));
    if (query.consent === 'missing') conditions.push(isNull(leads.consentBasis));
    if (query.owner === 'me') conditions.push(eq(leads.ownerUserId, tenant.userId));
    if (query.owner === 'unassigned') conditions.push(isNull(leads.ownerUserId));
    const search = cleanText(query.search, 100);
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const digits = search.replace(/\D/g, '');
      conditions.push(
        or(
          ilike(contacts.fullName, pattern),
          ilike(contacts.email, pattern),
          digits.length >= 4 ? ilike(contacts.phoneE164, `%${digits}%`) : undefined,
        ) as SQL,
      );
    }

    const rows = await this.db
      .select({
        id: leads.id,
        status: leads.status,
        source: leads.source,
        consentBasis: leads.consentBasis,
        ownerUserId: leads.ownerUserId,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
        contactId: contacts.id,
        fullName: contacts.fullName,
        email: contacts.email,
        phone: contacts.phoneE164,
        company: companies.name,
        suppressed: sql<boolean>`${suppressionEntries.id} is not null`,
      })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .leftJoin(companies, eq(companies.id, contacts.companyId))
      .leftJoin(
        suppressionEntries,
        and(
          eq(suppressionEntries.organizationId, leads.organizationId),
          eq(suppressionEntries.phoneE164, contacts.phoneE164),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit);
  }

  /** Lead, contact, sources and timeline (FR-21). */
  async get(tenant: TenantPrincipal, leadId: string) {
    const [row] = await this.db
      .select({ lead: leads, contact: contacts, company: companies.name })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .leftJoin(companies, eq(companies.id, contacts.companyId))
      .where(and(eq(leads.id, leadId), this.scope(tenant, 'leads.read')))
      .limit(1);
    if (!row) throw notFound();
    const orgId = tenant.membership.organizationId;

    const [owner] = row.lead.ownerUserId
      ? await this.db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.id, row.lead.ownerUserId))
      : [];
    const [suppression] = row.contact.phoneE164
      ? await this.db
          .select({ source: suppressionEntries.source, createdAt: suppressionEntries.createdAt })
          .from(suppressionEntries)
          .where(
            and(
              eq(suppressionEntries.organizationId, orgId),
              eq(suppressionEntries.phoneE164, row.contact.phoneE164),
            ),
          )
      : [];

    // External Record Links, with the connection state for "Source: HubSpot · Disconnected".
    const sources = await this.db
      .select({
        provider: externalRecordLinks.provider,
        objectType: externalRecordLinks.externalObjectType,
        externalId: externalRecordLinks.externalId,
        lastSyncedAt: externalRecordLinks.lastSyncedAt,
        connectionStatus: crmConnections.status,
      })
      .from(externalRecordLinks)
      .leftJoin(
        crmConnections,
        and(
          eq(crmConnections.organizationId, externalRecordLinks.organizationId),
          eq(crmConnections.provider, externalRecordLinks.provider),
          eq(crmConnections.externalAccountId, externalRecordLinks.externalAccountId),
        ),
      )
      .where(
        and(
          eq(externalRecordLinks.organizationId, orgId),
          or(
            and(
              eq(externalRecordLinks.entityType, 'contact'),
              eq(externalRecordLinks.entityId, row.contact.id),
            ),
            and(
              eq(externalRecordLinks.entityType, 'lead'),
              eq(externalRecordLinks.entityId, row.lead.id),
            ),
          ),
        ),
      );

    const statusEvents = await this.db
      .select()
      .from(leadStatusChanges)
      .where(and(eq(leadStatusChanges.organizationId, orgId), eq(leadStatusChanges.leadId, leadId)))
      .orderBy(desc(leadStatusChanges.createdAt))
      .limit(200);
    const fieldEvents = await this.db
      .select()
      .from(recordHistory)
      .where(
        and(
          eq(recordHistory.organizationId, orgId),
          or(
            and(eq(recordHistory.entityType, 'lead'), eq(recordHistory.entityId, leadId)),
            and(
              eq(recordHistory.entityType, 'contact'),
              eq(recordHistory.entityId, row.contact.id),
            ),
          ),
        ),
      )
      .orderBy(desc(recordHistory.createdAt))
      .limit(200);

    const timeline = [
      ...statusEvents.map((e) => ({
        type: 'status' as const,
        at: e.createdAt,
        from: e.fromStatus,
        to: e.toStatus,
        source: e.source,
        reason: e.reason,
      })),
      ...fieldEvents.map((e) => ({
        type: 'field' as const,
        at: e.createdAt,
        field: e.field,
        from: e.oldValue,
        to: e.newValue,
        source: e.source,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    return {
      id: row.lead.id,
      status: row.lead.status,
      source: row.lead.source,
      score: row.lead.score,
      consentBasis: row.lead.consentBasis,
      consentEvidence: row.lead.consentEvidence,
      crmDetails: row.lead.crmDetails,
      owner: owner ?? null,
      suppressed: suppression ?? null,
      createdAt: row.lead.createdAt,
      updatedAt: row.lead.updatedAt,
      contact: {
        id: row.contact.id,
        fullName: row.contact.fullName,
        firstName: row.contact.firstName,
        lastName: row.contact.lastName,
        email: row.contact.email,
        phone: row.contact.phoneE164,
        company: row.company,
        jobTitle: row.contact.jobTitle,
        city: row.contact.city,
        state: row.contact.state,
        country: row.contact.country,
        preferredLanguage: row.contact.preferredLanguage,
        customFields: row.contact.customFields,
      },
      sources,
      timeline,
    };
  }

  /** PRD FR-18 / FR-130: the same validation and deduplication as imports; never merges. */
  async create(tenant: TenantPrincipal, input: ManualLeadInput, context: ClientContext) {
    const ownerUserId = await this.resolveOwner(tenant, input.ownerUserId);
    const ctx: IngestionContext = {
      organizationId: tenant.membership.organizationId,
      source: 'MANUAL',
      sourceReference: context.requestId,
      actorUserId: tenant.userId,
      ownerUserId,
      consentDefault: input.consentBasis
        ? {
            basis: input.consentBasis,
            source: cleanText(input.consentSource) ?? 'Manual entry',
            reference: cleanText(input.consentReference),
            operatorConsentReference:
              input.consentBasis === 'REGISTERED_CONSENT'
                ? cleanText(input.consentReference)
                : null,
            attestedByUserId: tenant.userId,
          }
        : null,
    };
    const validation = validateRecord({ ...input, consentStatus: null }, ctx);
    if (!validation.ok) {
      throw new AppError('VALIDATION_ERROR', validation.reason, { details: [validation.reason] });
    }
    return this.db.transaction(async (tx) => {
      await lockOrganizationIngestion(tx, ctx.organizationId);
      const engine = new IngestionEngine(tx);
      const decision = await engine.match(validation.record, ctx);
      if (decision.kind !== 'NEW') {
        throw new AppError(
          'CONFLICT',
          decision.kind === 'REVIEW'
            ? decision.reason
            : 'A contact with this phone number or email already exists.',
        );
      }
      const result = await engine.create(validation.record, ctx);
      if (result.outcome !== 'CREATE') throw new Error('unexpected ingestion outcome');
      await this.audit.record(
        {
          action: 'lead.created',
          organizationId: ctx.organizationId,
          actorUserId: tenant.userId,
          resourceType: 'lead',
          resourceId: result.leadId,
        },
        context,
        tx,
      );
      return { id: result.leadId };
    });
  }

  async update(
    tenant: TenantPrincipal,
    leadId: string,
    input: LeadUpdateInput,
    context: ClientContext,
  ): Promise<void> {
    const orgId = tenant.membership.organizationId;
    await this.db.transaction(async (tx) => {
      await lockOrganizationIngestion(tx, orgId);
      const [row] = await tx
        .select({ lead: leads, contact: contacts })
        .from(leads)
        .innerJoin(contacts, eq(contacts.id, leads.contactId))
        .where(and(eq(leads.id, leadId), this.scope(tenant, 'leads.write')))
        .limit(1)
        .for('update');
      if (!row) throw notFound();

      const changes: Partial<typeof contacts.$inferInsert> = {};
      const setText = (
        field: 'fullName' | 'jobTitle' | 'city' | 'state' | 'country' | 'preferredLanguage',
        value: string | null | undefined,
      ) => {
        if (value === undefined) return;
        const clean = cleanText(value);
        if (field === 'fullName') {
          if (!clean) throw new AppError('VALIDATION_ERROR', 'Name cannot be empty.');
          if (clean !== row.contact.fullName) changes.fullName = clean;
          return;
        }
        if (clean !== row.contact[field]) changes[field] = clean;
      };
      setText('fullName', input.fullName);
      setText('jobTitle', input.jobTitle);
      setText('city', input.city);
      setText('state', input.state);
      setText('country', input.country);
      setText('preferredLanguage', input.preferredLanguage);

      if (input.email !== undefined) {
        if (input.email === null || !cleanText(input.email)) {
          if (row.contact.email !== null) {
            changes.email = null;
            changes.emailNormalized = null;
          }
        } else {
          const email = normalizeEmail(input.email);
          if (!email.ok) throw new AppError('VALIDATION_ERROR', email.reason);
          if (email.email !== row.contact.email) {
            changes.email = email.email;
            changes.emailNormalized = email.normalized;
          }
        }
      }
      if (input.phone !== undefined) {
        const phone = normalizePhone(input.phone);
        if (!phone.ok) throw new AppError('VALIDATION_ERROR', phone.reason);
        if (phone.e164 !== row.contact.phoneE164) {
          const [clash] = await tx
            .select({ id: contacts.id })
            .from(contacts)
            .where(and(eq(contacts.organizationId, orgId), eq(contacts.phoneE164, phone.e164)))
            .limit(1);
          if (clash)
            throw new AppError('CONFLICT', 'Another contact already has this phone number.');
          changes.phoneE164 = phone.e164;
        }
      }
      if (input.company !== undefined) {
        const name = cleanText(input.company);
        if (!name) {
          if (row.contact.companyId !== null) changes.companyId = null;
        } else {
          const key = nameKey(name);
          const [company] = await tx
            .insert(companies)
            .values({ organizationId: orgId, name, nameNormalized: key })
            .onConflictDoUpdate({
              target: [companies.organizationId, companies.nameNormalized],
              set: { nameNormalized: key },
            })
            .returning({ id: companies.id });
          if (company && company.id !== row.contact.companyId) changes.companyId = company.id;
        }
      }

      const history: (typeof recordHistory.$inferInsert)[] = [];
      for (const [field, value] of Object.entries(changes)) {
        if (field === 'emailNormalized') continue;
        const old = row.contact[field as keyof typeof row.contact];
        history.push({
          organizationId: orgId,
          entityType: 'contact',
          entityId: row.contact.id,
          field,
          oldValue: asText(old),
          newValue: asText(value),
          source: 'MANUAL',
          sourceReference: context.requestId,
          actorUserId: tenant.userId,
        });
      }
      if (Object.keys(changes).length > 0) {
        await tx.update(contacts).set(changes).where(eq(contacts.id, row.contact.id));
      }

      if (input.ownerUserId !== undefined && input.ownerUserId !== row.lead.ownerUserId) {
        if (isOwnScoped(tenant.membership.role, 'leads.write')) {
          throw new AppError('AUTHORIZATION_ERROR', 'You cannot reassign leads.');
        }
        const ownerUserId = await this.resolveOwner(tenant, input.ownerUserId, tx);
        await tx.update(leads).set({ ownerUserId }).where(eq(leads.id, leadId));
        history.push({
          organizationId: orgId,
          entityType: 'lead',
          entityId: leadId,
          field: 'owner',
          oldValue: row.lead.ownerUserId,
          newValue: ownerUserId,
          source: 'MANUAL',
          sourceReference: context.requestId,
          actorUserId: tenant.userId,
        });
      }
      if (history.length === 0) return;
      await tx.insert(recordHistory).values(history);
      await this.audit.record(
        {
          action: 'lead.updated',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'lead',
          resourceId: leadId,
          metadata: { fields: history.map((h) => h.field) },
        },
        context,
        tx,
      );
    });
  }

  /** PRD FR-24/FR-25: recorded, idempotent Member transition. */
  async changeStatus(
    tenant: TenantPrincipal,
    leadId: string,
    input: {
      status: LeadStatus;
      reason?: string | null | undefined;
      idempotencyKey?: string | null | undefined;
    },
    context: ClientContext,
  ): Promise<{ changed: boolean }> {
    const orgId = tenant.membership.organizationId;
    return this.db.transaction(async (tx) => {
      const [lead] = await tx
        .select({ id: leads.id, status: leads.status, contactId: leads.contactId })
        .from(leads)
        .where(and(eq(leads.id, leadId), this.scope(tenant, 'leads.write')))
        .limit(1)
        .for('update');
      if (!lead) throw notFound();
      if (lead.status === input.status) return { changed: false };

      const reopening = ['CONVERTED', 'CLOSED'].includes(lead.status);
      if (reopening) {
        const [open] = await tx
          .select({ id: leads.id })
          .from(leads)
          .where(
            and(
              eq(leads.contactId, lead.contactId),
              sql`${leads.status} not in ('CONVERTED', 'CLOSED')`,
            ),
          )
          .limit(1);
        if (open && !['CONVERTED', 'CLOSED'].includes(input.status)) {
          throw new AppError('CONFLICT', 'This contact already has another open lead.');
        }
      }

      const eventKey = `member:${cleanText(input.idempotencyKey, 100) ?? randomUUID()}`;
      const inserted = await tx
        .insert(leadStatusChanges)
        .values({
          organizationId: orgId,
          leadId,
          fromStatus: lead.status,
          toStatus: input.status,
          source: 'MEMBER',
          actorUserId: tenant.userId,
          reason: cleanText(input.reason, 500),
          eventKey,
        })
        .onConflictDoNothing()
        .returning({ id: leadStatusChanges.id });
      if (inserted.length === 0) return { changed: false }; // same event replayed
      await tx
        .update(leads)
        .set({ status: input.status, memberStatusChangedAt: new Date() })
        .where(eq(leads.id, leadId));
      await this.audit.record(
        {
          action: 'lead.status_changed',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'lead',
          resourceId: leadId,
          metadata: { from: lead.status, to: input.status },
        },
        context,
        tx,
      );
      return { changed: true };
    });
  }

  async listSuppression(
    tenant: TenantPrincipal,
    query: { limit: number; cursor?: string | undefined },
  ) {
    const after = decodeCursor(query.cursor);
    const rows = await this.db
      .select({
        id: suppressionEntries.id,
        phone: suppressionEntries.phoneE164,
        source: suppressionEntries.source,
        reason: suppressionEntries.reason,
        createdAt: suppressionEntries.createdAt,
      })
      .from(suppressionEntries)
      .where(
        and(
          eq(suppressionEntries.organizationId, tenant.membership.organizationId),
          after
            ? or(
                lt(suppressionEntries.createdAt, after.createdAt),
                and(
                  eq(suppressionEntries.createdAt, after.createdAt),
                  lt(suppressionEntries.id, after.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(suppressionEntries.createdAt), desc(suppressionEntries.id))
      .limit(query.limit + 1);
    return toPage(rows, query.limit);
  }

  async addSuppression(
    tenant: TenantPrincipal,
    input: { phone: string; reason?: string | null | undefined },
    context: ClientContext,
  ) {
    const phone = normalizePhone(input.phone);
    if (!phone.ok) throw new AppError('VALIDATION_ERROR', phone.reason);
    const orgId = tenant.membership.organizationId;
    const [entry] = await this.db
      .insert(suppressionEntries)
      .values({
        organizationId: orgId,
        phoneE164: phone.e164,
        source: 'MANUAL',
        reason: cleanText(input.reason, 500),
        createdByUserId: tenant.userId,
      })
      .onConflictDoNothing()
      .returning({ id: suppressionEntries.id });
    if (!entry) throw new AppError('CONFLICT', 'This number is already on the suppression list.');
    await this.audit.record(
      {
        action: 'suppression.added',
        organizationId: orgId,
        actorUserId: tenant.userId,
        resourceType: 'suppression_entry',
        resourceId: entry.id,
      },
      context,
    );
    return { id: entry.id, phone: phone.e164 };
  }

  /** Only entries added by a Member or an import can be removed; opt-outs are permanent. */
  async removeSuppression(tenant: TenantPrincipal, entryId: string, context: ClientContext) {
    const orgId = tenant.membership.organizationId;
    const [entry] = await this.db
      .select({ source: suppressionEntries.source })
      .from(suppressionEntries)
      .where(and(eq(suppressionEntries.id, entryId), eq(suppressionEntries.organizationId, orgId)))
      .limit(1);
    if (!entry) throw new AppError('NOT_FOUND', 'Suppression entry not found.');
    if (entry.source !== 'MANUAL' && entry.source !== 'IMPORT') {
      throw new AppError(
        'CONFLICT',
        'Opt-outs received from the person or the CRM cannot be removed here.',
      );
    }
    await this.db.delete(suppressionEntries).where(eq(suppressionEntries.id, entryId));
    await this.audit.record(
      {
        action: 'suppression.removed',
        organizationId: orgId,
        actorUserId: tenant.userId,
        resourceType: 'suppression_entry',
        resourceId: entryId,
      },
      context,
    );
  }

  async listReviewItems(
    tenant: TenantPrincipal,
    query: { limit: number; cursor?: string | undefined },
  ) {
    const orgId = tenant.membership.organizationId;
    const after = decodeCursor(query.cursor);
    const rows = await this.db
      .select()
      .from(ingestionReviewItems)
      .where(
        and(
          eq(ingestionReviewItems.organizationId, orgId),
          eq(ingestionReviewItems.status, 'OPEN'),
          after
            ? or(
                lt(ingestionReviewItems.createdAt, after.createdAt),
                and(
                  eq(ingestionReviewItems.createdAt, after.createdAt),
                  lt(ingestionReviewItems.id, after.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(ingestionReviewItems.createdAt), desc(ingestionReviewItems.id))
      .limit(query.limit + 1);
    const page = toPage(rows, query.limit);
    const candidateIds = [...new Set(page.items.flatMap((i) => i.candidateContactIds))];
    const candidates = candidateIds.length
      ? await this.db
          .select({
            id: contacts.id,
            fullName: contacts.fullName,
            email: contacts.email,
            phone: contacts.phoneE164,
          })
          .from(contacts)
          .where(and(eq(contacts.organizationId, orgId), inArray(contacts.id, candidateIds)))
      : [];
    const byId = new Map(candidates.map((c) => [c.id, c]));
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((item) => ({
        id: item.id,
        source: item.source,
        reason: item.reason,
        createdAt: item.createdAt,
        record: item.record,
        candidates: item.candidateContactIds.flatMap((id) => byId.get(id) ?? []),
      })),
    };
  }

  /** Resolves an uncertain match; merging is always a Member's explicit choice (FR-17). */
  async resolveReviewItem(
    tenant: TenantPrincipal,
    itemId: string,
    input: { action: 'CREATE_NEW' | 'MERGE' | 'DISCARD'; contactId?: string | undefined },
    context: ClientContext,
  ) {
    const orgId = tenant.membership.organizationId;
    return this.db.transaction(async (tx) => {
      await lockOrganizationIngestion(tx, orgId);
      const [item] = await tx
        .select()
        .from(ingestionReviewItems)
        .where(
          and(eq(ingestionReviewItems.id, itemId), eq(ingestionReviewItems.organizationId, orgId)),
        )
        .limit(1)
        .for('update');
      if (!item) throw new AppError('NOT_FOUND', 'Review item not found.');
      if (item.status !== 'OPEN') throw new AppError('CONFLICT', 'This item was already resolved.');

      const record = item.record as unknown as NormalizedRecord;
      const ctx: IngestionContext = {
        organizationId: orgId,
        source: item.source,
        sourceReference: item.sourceReference,
        actorUserId: tenant.userId,
      };
      const engine = new IngestionEngine(tx);
      let status: 'RESOLVED_CREATED' | 'RESOLVED_UPDATED' | 'DISCARDED' = 'DISCARDED';
      let leadId: string | null = null;
      if (input.action === 'CREATE_NEW') {
        const result = await engine.create(record, ctx);
        if (result.outcome === 'CREATE') leadId = result.leadId;
        status = 'RESOLVED_CREATED';
      } else if (input.action === 'MERGE') {
        if (!input.contactId || !item.candidateContactIds.includes(input.contactId)) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Choose one of the matching contacts to merge into.',
          );
        }
        const result = await engine.update(input.contactId, false, record, ctx);
        if (result.outcome === 'UPDATE' || result.outcome === 'SKIP') leadId = result.leadId;
        status = 'RESOLVED_UPDATED';
      }
      await tx
        .update(ingestionReviewItems)
        .set({ status, resolvedByUserId: tenant.userId, resolvedAt: new Date() })
        .where(eq(ingestionReviewItems.id, itemId));
      await this.audit.record(
        {
          action: 'ingestion.review_resolved',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'review_item',
          resourceId: itemId,
          metadata: { action: input.action },
        },
        context,
        tx,
      );
      return { status, leadId };
    });
  }

  /** An owner must be a member of the same Organization; AGENTs always own what they create. */
  private async resolveOwner(
    tenant: TenantPrincipal,
    requested: string | null | undefined,
    db: Database = this.db,
  ): Promise<string | null> {
    if (isOwnScoped(tenant.membership.role, 'leads.write')) return tenant.userId;
    if (!requested) return null;
    const [member] = await db
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, tenant.membership.organizationId),
          eq(organizationMembers.userId, requested),
        ),
      )
      .limit(1);
    if (!member)
      throw new AppError('VALIDATION_ERROR', 'The owner must be a member of this organization.');
    return member.userId;
  }
}
