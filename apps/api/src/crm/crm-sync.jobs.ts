import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  crmConnections,
  crmSyncRuns,
  externalRecordLinks,
  leads,
  type CrmSyncCounts,
  type Database,
} from '@nivomi/database';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { DATABASE } from '../database/database.module.js';
import { JobHandlerRegistry, JobQueue } from '../jobs/jobs.js';
import {
  IngestionEngine,
  lockOrganizationIngestion,
  type IngestionContext,
  type IngestionInput,
} from '../leads/ingestion.js';
import {
  CRM_PROVIDER,
  CrmAuthError,
  CrmUnavailableError,
  type CRMProvider,
  type CrmContact,
} from './crm-provider.js';
import { CRM_JOBS, CrmService, SCHEDULED_SYNC_INTERVAL_MS } from './crm.service.js';

/** Pages fetched per job step; each step commits and queues the next (resumable). */
const PAGES_PER_STEP = 5;
/** Overlap for search-index delay: re-read changes from slightly before the watermark. */
const WATERMARK_OVERLAP_MS = 5 * 60_000;
/** HubSpot search returns at most 10,000 results per query; restart the query before that. */
const SEARCH_RESULT_CAP = 9_800;
const MAX_TRANSIENT_FAILURES = 5;

const CONTACT_PROPERTIES = [
  'firstname',
  'lastname',
  'email',
  'phone',
  'mobilephone',
  'company',
  'jobtitle',
  'city',
  'state',
  'country',
  'hs_lastmodifieddate',
];

interface SyncCursor extends Record<string, unknown> {
  phase: 'contacts' | 'leads' | 'done';
  after: string | null;
  step: number;
  /** Incremental: lower bound of the current search query. */
  since?: string | null;
  /** Results already read by the current search query (for the 10,000 cap). */
  seen?: number;
  /** Highest CRM modification time ingested in this run. */
  maxModified?: string | null;
  failures?: number;
}

const runPayload = z.object({ runId: z.uuid() });
const schedulePayload = z.object({ connectionId: z.uuid() });

@Injectable()
export class CrmSyncJobs implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly queue: JobQueue,
    private readonly crmService: CrmService,
    @Inject(CRM_PROVIDER) private readonly crm: CRMProvider,
    @Inject(DATABASE) private readonly db: Database,
    @InjectPinoLogger(CrmSyncJobs.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.registry.register(CRM_JOBS.sync, (p) => this.step(runPayload.parse(p).runId), {
      timeoutMs: 3 * 60_000,
    });
    this.registry.register(CRM_JOBS.schedule, (p) =>
      this.scheduled(schedulePayload.parse(p).connectionId),
    );
  }

  /** FR-137: a scheduled incremental sync, unless one is running or the CRM is not usable. */
  async scheduled(connectionId: string): Promise<void> {
    const [connection] = await this.db
      .select()
      .from(crmConnections)
      .where(eq(crmConnections.id, connectionId))
      .limit(1);
    if (!connection || !['CONNECTED', 'DEGRADED'].includes(connection.status)) return;
    await this.crmService.startRun(this.db, {
      organizationId: connection.organizationId,
      connectionId,
      trigger: 'SCHEDULED',
      mode: connection.syncWatermark ? 'INCREMENTAL' : 'FULL',
      requestedByUserId: null,
    });
  }

  async step(runId: string): Promise<void> {
    const [run] = await this.db
      .select()
      .from(crmSyncRuns)
      .where(eq(crmSyncRuns.id, runId))
      .limit(1);
    if (!run || !['QUEUED', 'RUNNING'].includes(run.status)) return;
    const cursor = { ...(run.cursor as SyncCursor) };

    let token: string;
    let connection;
    try {
      ({ token, connection } = await this.crmService.accessToken(run.connectionId));
    } catch (error) {
      return this.handleError(run, cursor, error);
    }
    if (connection.status === 'DISCONNECTED' || connection.status === 'TOKEN_INVALID') {
      await this.finish(run.id, 'CANCELLED', run.counts, null);
      return;
    }
    if (run.status === 'QUEUED') {
      await this.db
        .update(crmSyncRuns)
        .set({ status: 'RUNNING', startedAt: new Date() })
        .where(eq(crmSyncRuns.id, run.id));
    }

    const counts: CrmSyncCounts = { ...run.counts };
    const ctx: IngestionContext = {
      organizationId: run.organizationId,
      source: 'HUBSPOT',
      sourceReference: run.id,
      actorUserId: null,
      // FR-138: contact details are CRM-owned for records linked to this account.
      ownsContactFields: true,
    };

    try {
      for (let page = 0; page < PAGES_PER_STEP && cursor.phase !== 'done'; page += 1) {
        if (cursor.phase === 'contacts') {
          const since = this.since(run.mode, cursor, connection.syncWatermark);
          const result = since
            ? await this.crm.contactsModifiedSince(token, CONTACT_PROPERTIES, since, cursor.after)
            : await this.crm.listContacts(token, CONTACT_PROPERTIES, cursor.after);
          await this.ingestContacts(token, result.items, ctx, connection, counts, cursor);
          cursor.seen = (cursor.seen ?? 0) + result.items.length;
          if (result.next && since && cursor.seen >= SEARCH_RESULT_CAP) {
            // Start a fresh search from the newest change seen so far.
            cursor.since = cursor.maxModified ?? since.toISOString();
            cursor.after = null;
            cursor.seen = 0;
          } else if (result.next) {
            cursor.after = result.next;
          } else {
            cursor.phase = connection.scopes.includes('crm.objects.leads.read') ? 'leads' : 'done';
            cursor.after = null;
          }
        } else {
          const result = await this.crm.listLeads(token, cursor.after);
          await this.linkLeads(result.items, ctx, connection.externalAccountId, counts);
          cursor.after = result.next;
          if (!result.next) cursor.phase = 'done';
        }
      }
    } catch (error) {
      await this.saveProgress(run.id, cursor, counts);
      return this.handleError(run, cursor, error);
    }

    cursor.failures = 0;
    cursor.step += 1;
    if (cursor.phase === 'done') {
      await this.complete(run, connection, cursor, counts);
      return;
    }
    await this.db.transaction(async (tx) => {
      await tx.update(crmSyncRuns).set({ cursor, counts }).where(eq(crmSyncRuns.id, run.id));
      await this.queue.enqueue(
        {
          type: CRM_JOBS.sync,
          payload: { runId: run.id },
          organizationId: run.organizationId,
          idempotencyKey: `crm-sync:${run.id}:${cursor.step}`,
        },
        tx,
      );
    });
  }

  private since(
    mode: 'FULL' | 'INCREMENTAL',
    cursor: SyncCursor,
    watermark: Date | null,
  ): Date | null {
    if (mode === 'FULL') return null;
    if (cursor.since) return new Date(cursor.since);
    const from = new Date((watermark?.getTime() ?? 0) - WATERMARK_OVERLAP_MS);
    cursor.since = from.toISOString();
    return from;
  }

  /** FR-19: HubSpot contacts pass the same validation, mapping and deduplication as files. */
  private async ingestContacts(
    token: string,
    items: CrmContact[],
    ctx: IngestionContext,
    connection: typeof crmConnections.$inferSelect,
    counts: CrmSyncCounts,
    cursor: SyncCursor,
  ): Promise<void> {
    if (items.length === 0) return;
    const companyIds = [...new Set(items.flatMap((c) => c.companyIds.slice(0, 1)))];
    const companies = companyIds.length ? await this.crm.getCompanies(token, companyIds) : [];
    const companyName = new Map(companies.map((c) => [c.id, c.name]));

    await this.db.transaction(async (tx) => {
      await lockOrganizationIngestion(tx, ctx.organizationId);
      for (const contact of items) {
        counts.fetched += 1;
        const input = this.toInput(contact, connection, companyName);
        try {
          const result = await tx.transaction((sp) => new IngestionEngine(sp).ingest(input, ctx));
          if (result.outcome === 'CREATE') counts.created += 1;
          else if (result.outcome === 'UPDATE') counts.updated += 1;
          else if (result.outcome === 'REVIEW') counts.review += 1;
          // No usable phone number: kept in HubSpot, not imported as a callable Lead.
          else counts.skipped += 1;
        } catch (error) {
          this.logger.error(
            { err: error, organizationId: ctx.organizationId, contactId: contact.id },
            'CRM contact ingestion failed',
          );
          counts.failed += 1;
        }
        if (contact.updatedAt) {
          const current = cursor.maxModified ? new Date(cursor.maxModified) : null;
          if (!current || contact.updatedAt > current) {
            cursor.maxModified = contact.updatedAt.toISOString();
          }
        }
      }
    });
  }

  private toInput(
    contact: CrmContact,
    connection: typeof crmConnections.$inferSelect,
    companyName: Map<string, string | null>,
  ): IngestionInput {
    const p = contact.properties;
    const settings = connection.settings;
    let consentStatus: string | null = null;
    if (settings.consentProperty) {
      const raw = p[settings.consentProperty];
      if (raw) consentStatus = settings.consentValueMap?.[raw] ?? null;
    }
    const firstCompany = contact.companyIds[0];
    return {
      firstName: p.firstname ?? null,
      lastName: p.lastname ?? null,
      email: p.email ?? null,
      phone: p.mobilephone || p.phone || null,
      company: (firstCompany ? companyName.get(firstCompany) : null) ?? p.company ?? null,
      jobTitle: p.jobtitle ?? null,
      city: p.city ?? null,
      state: p.state ?? null,
      country: p.country ?? null,
      sourceLabel: 'HubSpot',
      consentStatus,
      externalRef: {
        provider: 'HUBSPOT',
        accountId: connection.externalAccountId,
        objectType: 'contact',
        externalId: contact.id,
      },
    };
  }

  /**
   * HubSpot Leads (read-only): each is linked to the Nivomi Lead of its associated contact and
   * its name, type and label are shown as CRM context. Nivomi's Lead Status stays Nivomi-owned.
   */
  private async linkLeads(
    items: Awaited<ReturnType<CRMProvider['listLeads']>>['items'],
    ctx: IngestionContext,
    accountId: string,
    counts: CrmSyncCounts,
  ): Promise<void> {
    if (items.length === 0) return;
    const contactIds = [...new Set(items.flatMap((l) => l.contactIds))];
    const links = contactIds.length
      ? await this.db
          .select({
            externalId: externalRecordLinks.externalId,
            contactId: externalRecordLinks.entityId,
          })
          .from(externalRecordLinks)
          .where(
            and(
              eq(externalRecordLinks.organizationId, ctx.organizationId),
              eq(externalRecordLinks.provider, 'HUBSPOT'),
              eq(externalRecordLinks.externalAccountId, accountId),
              eq(externalRecordLinks.externalObjectType, 'contact'),
              inArray(externalRecordLinks.externalId, contactIds),
            ),
          )
      : [];
    const contactByExternal = new Map(links.map((l) => [l.externalId, l.contactId]));

    await this.db.transaction(async (tx) => {
      for (const crmLead of items) {
        counts.fetched += 1;
        const contactId = crmLead.contactIds.map((id) => contactByExternal.get(id)).find(Boolean);
        if (!contactId) {
          counts.skipped += 1; // its contact was not importable (e.g. no phone number)
          continue;
        }
        const [lead] = await tx
          .select({ id: leads.id })
          .from(leads)
          .where(
            and(
              eq(leads.organizationId, ctx.organizationId),
              eq(leads.contactId, contactId),
              notInArray(leads.status, ['CONVERTED', 'CLOSED']),
            ),
          )
          .limit(1);
        if (!lead) {
          counts.skipped += 1;
          continue;
        }
        const details: Record<string, string> = { hubspotLeadId: crmLead.id };
        if (crmLead.name) details.hubspotLeadName = crmLead.name;
        if (crmLead.type) details.hubspotLeadType = crmLead.type;
        if (crmLead.label) details.hubspotLeadLabel = crmLead.label;
        await tx.update(leads).set({ crmDetails: details }).where(eq(leads.id, lead.id));
        await tx
          .insert(externalRecordLinks)
          .values({
            organizationId: ctx.organizationId,
            provider: 'HUBSPOT',
            externalAccountId: accountId,
            externalObjectType: 'lead',
            externalId: crmLead.id,
            entityType: 'lead',
            entityId: lead.id,
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
            set: { entityId: lead.id, lastSyncedAt: new Date() },
          });
        counts.updated += 1;
      }
    });
  }

  private async complete(
    run: typeof crmSyncRuns.$inferSelect,
    connection: typeof crmConnections.$inferSelect,
    cursor: SyncCursor,
    counts: CrmSyncCounts,
  ): Promise<void> {
    // A full sync covered everything modified before it started.
    const watermark =
      run.mode === 'FULL'
        ? (run.startedAt ?? run.createdAt)
        : cursor.maxModified
          ? new Date(cursor.maxModified)
          : connection.syncWatermark;
    await this.db.transaction(async (tx) => {
      await tx
        .update(crmSyncRuns)
        .set({ status: 'COMPLETED', cursor, counts, completedAt: new Date(), error: null })
        .where(eq(crmSyncRuns.id, run.id));
      await tx
        .update(crmConnections)
        .set({
          lastSyncAt: new Date(),
          syncWatermark: watermark,
          lastError: null,
          status: sql`case when ${crmConnections.status} = 'DEGRADED' then 'CONNECTED'::crm_connection_status else ${crmConnections.status} end`,
        })
        .where(eq(crmConnections.id, connection.id));
      await this.scheduleNext(tx, run.organizationId, connection.id);
    });
  }

  private async handleError(
    run: typeof crmSyncRuns.$inferSelect,
    cursor: SyncCursor,
    error: unknown,
  ): Promise<void> {
    const [connection] = await this.db
      .select()
      .from(crmConnections)
      .where(eq(crmConnections.id, run.connectionId))
      .limit(1);
    if (error instanceof CrmAuthError) {
      if (connection) {
        await this.crmService.markTokenInvalid(
          connection,
          'HubSpot no longer accepts Nivomi’s access. Reconnect HubSpot to resume syncing.',
        );
      }
      await this.finish(run.id, 'FAILED', run.counts, 'HubSpot rejected the connection.');
      return;
    }
    const failures = (cursor.failures ?? 0) + 1;
    if (error instanceof CrmUnavailableError && failures < MAX_TRANSIENT_FAILURES) {
      await this.db
        .update(crmSyncRuns)
        .set({ cursor: { ...cursor, failures } })
        .where(eq(crmSyncRuns.id, run.id));
      throw error; // the job retries with backoff (FR-93)
    }
    // FR-95: a CRM outage is only sync state and an alert, never a failed business action.
    this.logger.error({ err: error, runId: run.id }, 'CRM sync failed');
    await this.finish(
      run.id,
      'FAILED',
      run.counts,
      'HubSpot could not be synced. Nivomi will try again.',
    );
    if (connection) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(crmConnections)
          .set({ status: 'DEGRADED', lastError: 'The last sync failed; retrying on schedule.' })
          .where(and(eq(crmConnections.id, connection.id), eq(crmConnections.status, 'CONNECTED')));
        await this.scheduleNext(tx, run.organizationId, connection.id);
      });
    }
  }

  private async saveProgress(runId: string, cursor: SyncCursor, counts: CrmSyncCounts) {
    await this.db.update(crmSyncRuns).set({ cursor, counts }).where(eq(crmSyncRuns.id, runId));
  }

  private async finish(
    runId: string,
    status: 'COMPLETED' | 'FAILED' | 'CANCELLED',
    counts: CrmSyncCounts,
    error: string | null,
  ) {
    await this.db
      .update(crmSyncRuns)
      .set({ status, counts, error, completedAt: new Date() })
      .where(and(eq(crmSyncRuns.id, runId), inArray(crmSyncRuns.status, ['QUEUED', 'RUNNING'])));
  }

  private async scheduleNext(db: Database, organizationId: string, connectionId: string) {
    const runAt = new Date(Date.now() + SCHEDULED_SYNC_INTERVAL_MS);
    const slot = Math.floor(runAt.getTime() / SCHEDULED_SYNC_INTERVAL_MS);
    await this.queue.enqueue(
      {
        type: CRM_JOBS.schedule,
        payload: { connectionId },
        organizationId,
        idempotencyKey: `crm-schedule:${connectionId}:${slot}`,
        runAt,
      },
      db,
    );
  }
}
