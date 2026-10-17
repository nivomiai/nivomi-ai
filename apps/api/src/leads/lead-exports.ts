import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { leadExports, leads, type Database } from '@nivomi/database';
import { and, count, desc, eq, inArray, lt, or, type SQL } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { TenantPrincipal } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { csvLine } from '../imports/imports.service.js';
import { JobHandlerRegistry, JobQueue, PermanentJobError } from '../jobs/jobs.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage.js';
import { LeadsService, type LeadFilters } from './leads.service.js';

export const LEAD_EXPORT_JOBS = {
  build: 'leads.export.build',
  purge: 'leads.export.purge',
} as const;

/** One export never holds more rows than this; narrow the filters for more. */
export const MAX_EXPORT_ROWS = 50_000;
/** Exports waiting or running at once, per organization. */
const MAX_ACTIVE_EXPORTS = 3;
/** The CSV is downloadable for a day, then deleted. */
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH = 1_000;
const UTF8_BOM = '﻿';

const STATUS_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  ATTEMPTED: 'Attempted',
  CONNECTED: 'Connected',
  INTERESTED: 'Interested',
  QUALIFIED: 'Qualified',
  CALLBACK_REQUESTED: 'Callback requested',
  FOLLOW_UP: 'Follow-up',
  APPOINTMENT_BOOKED: 'Appointment booked',
  CONVERTED: 'Converted',
  NOT_INTERESTED: 'Not interested',
  UNREACHABLE: 'Unreachable',
  DO_NOT_CALL: 'Do not call',
  CLOSED: 'Closed',
};

const CONSENT_LABELS: Record<string, string> = {
  INQUIRY: 'Inquiry',
  APPLICATION: 'Application',
  REGISTERED_CONSENT: 'Registered consent',
  EXISTING_CUSTOMER: 'Existing customer',
};

const SOURCE_LABELS: Record<string, string> = {
  FILE_IMPORT: 'File import',
  HUBSPOT: 'External CRM (legacy)',
  MANUAL: 'Manual',
  INBOUND: 'Inbound call',
};

export interface LeadExportRequest {
  readonly leadIds?: readonly string[] | undefined;
  readonly filters?: LeadFilters | undefined;
}

const exportPayload = z.object({ exportId: z.uuid() });

const notFound = () => new AppError('NOT_FOUND', 'Export not found.');

/** CSV exports of leads (personal data): queued, built in the background, audited downloads. */
@Injectable()
export class LeadExportsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly queue: JobQueue,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async request(tenant: TenantPrincipal, input: LeadExportRequest, context: ClientContext) {
    const orgId = tenant.membership.organizationId;
    return this.db.transaction(async (tx) => {
      const [active] = await tx
        .select({ n: count() })
        .from(leadExports)
        .where(
          and(
            eq(leadExports.organizationId, orgId),
            inArray(leadExports.status, ['QUEUED', 'RUNNING']),
          ),
        );
      if ((active?.n ?? 0) >= MAX_ACTIVE_EXPORTS) {
        throw new AppError(
          'CONFLICT',
          'Exports are already being prepared. Try again when they finish.',
        );
      }
      const selection = input.leadIds?.length
        ? { leadIds: [...new Set(input.leadIds)] }
        : { filters: compactFilters(input.filters) };
      const [row] = await tx
        .insert(leadExports)
        .values({
          organizationId: orgId,
          requestedByUserId: tenant.userId,
          selection,
          expiresAt: new Date(Date.now() + EXPORT_TTL_MS),
        })
        .returning();
      if (!row) throw new Error('lead export insert returned no row');
      await this.queue.enqueue(
        {
          type: LEAD_EXPORT_JOBS.build,
          payload: { exportId: row.id },
          organizationId: orgId,
          idempotencyKey: `lead-export:${row.id}`,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'lead.export_requested',
          organizationId: orgId,
          actorUserId: tenant.userId,
          resourceType: 'lead_export',
          resourceId: row.id,
          metadata: selection.leadIds
            ? { leadCount: selection.leadIds.length }
            : { filters: selection.filters },
        },
        context,
        tx,
      );
      return toView(row);
    });
  }

  async get(tenant: TenantPrincipal, id: string) {
    return toView(await this.find(tenant, id));
  }

  /** The CSV itself; every download is audited. */
  async download(tenant: TenantPrincipal, id: string, context: ClientContext) {
    const row = await this.find(tenant, id);
    if (row.status !== 'COMPLETED' || !row.storageKey) {
      throw new AppError('CONFLICT', 'This export is not ready yet.');
    }
    if (row.expiresAt < new Date()) throw new AppError('NOT_FOUND', 'This export has expired.');
    const content = await this.storage.read(row.storageKey);
    await this.audit.record(
      {
        action: 'lead.export_downloaded',
        organizationId: row.organizationId,
        actorUserId: tenant.userId,
        resourceType: 'lead_export',
        resourceId: row.id,
        metadata: { rowCount: row.rowCount },
      },
      context,
    );
    const day = row.createdAt.toISOString().slice(0, 10);
    return { fileName: `nivomi-leads-${day}.csv`, content };
  }

  private async find(tenant: TenantPrincipal, id: string) {
    const [row] = await this.db
      .select()
      .from(leadExports)
      .where(
        and(
          eq(leadExports.id, id),
          eq(leadExports.organizationId, tenant.membership.organizationId),
        ),
      )
      .limit(1);
    if (!row) throw notFound();
    return row;
  }
}

/** Builds the CSV for a queued export and deletes it once it expires. */
@Injectable()
export class LeadExportJobs implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly queue: JobQueue,
    private readonly leadsService: LeadsService,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @InjectPinoLogger(LeadExportJobs.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      LEAD_EXPORT_JOBS.build,
      (p) => this.build(exportPayload.parse(p).exportId),
      { timeoutMs: 4 * 60_000 },
    );
    this.registry.register(LEAD_EXPORT_JOBS.purge, (p) =>
      this.purge(exportPayload.parse(p).exportId),
    );
  }

  async build(exportId: string): Promise<void> {
    const [row] = await this.db.select().from(leadExports).where(eq(leadExports.id, exportId));
    if (!row) throw new PermanentJobError('export no longer exists');
    if (row.status === 'COMPLETED') return; // duplicate delivery
    await this.db
      .update(leadExports)
      .set({ status: 'RUNNING', error: null })
      .where(eq(leadExports.id, row.id));
    try {
      await this.writeCsv(row);
    } catch (error) {
      // Visible to the requester and frees the per-organization slot; a retry sets RUNNING again.
      await this.db
        .update(leadExports)
        .set({ status: 'FAILED', error: 'The export could not be prepared. Try again.' })
        .where(eq(leadExports.id, row.id));
      throw error;
    }
  }

  private async writeCsv(row: typeof leadExports.$inferSelect): Promise<void> {
    // The export runs with the requesting tenant's scope only.
    const conditions: SQL[] = this.leadsService.filterConditions(
      { organizationId: row.organizationId, userId: row.requestedByUserId },
      // Validated by the request schema before they were stored.
      row.selection.filters ?? {},
    );
    if (row.selection.leadIds) conditions.push(inArray(leads.id, row.selection.leadIds));

    const lines = [
      csvLine([
        'Name',
        'Phone',
        'Email',
        'Company',
        'Status',
        'Consent basis',
        'Source',
        'Suppressed',
        'Created',
        'Last activity',
      ]),
    ];
    let total = 0;
    let after: { createdAt: Date; id: string } | null = null;
    for (;;) {
      const keyset: SQL | undefined = after
        ? or(
            lt(leads.createdAt, after.createdAt),
            and(eq(leads.createdAt, after.createdAt), lt(leads.id, after.id)),
          )
        : undefined;
      const batch = await this.leadsService
        .rowQuery(and(...conditions, keyset))
        .orderBy(desc(leads.createdAt), desc(leads.id))
        .limit(BATCH);
      for (const lead of batch) {
        lines.push(
          csvLine([
            lead.fullName ?? '',
            lead.phone ?? '',
            lead.email ?? '',
            lead.company ?? '',
            STATUS_LABELS[lead.status] ?? lead.status,
            lead.consentBasis ? (CONSENT_LABELS[lead.consentBasis] ?? lead.consentBasis) : '',
            SOURCE_LABELS[lead.source] ?? lead.source,
            lead.suppressed ? 'Yes' : 'No',
            lead.createdAt.toISOString(),
            lead.updatedAt.toISOString(),
          ]),
        );
      }
      total += batch.length;
      const last = batch.at(-1);
      if (batch.length < BATCH || !last || total >= MAX_EXPORT_ROWS) break;
      after = { createdAt: last.createdAt, id: last.id };
    }
    if (total > MAX_EXPORT_ROWS) lines.length = MAX_EXPORT_ROWS + 1;

    const storageKey = `exports/${row.organizationId}/${row.id}.csv`;
    await this.storage.write(storageKey, Buffer.from(`${UTF8_BOM}${lines.join('\r\n')}\r\n`));
    await this.db.transaction(async (tx) => {
      await tx
        .update(leadExports)
        .set({
          status: 'COMPLETED',
          rowCount: Math.min(total, MAX_EXPORT_ROWS),
          storageKey,
          completedAt: new Date(),
        })
        .where(eq(leadExports.id, row.id));
      await this.queue.enqueue(
        {
          type: LEAD_EXPORT_JOBS.purge,
          payload: { exportId: row.id },
          organizationId: row.organizationId,
          idempotencyKey: `lead-export-purge:${row.id}`,
          runAt: row.expiresAt,
        },
        tx,
      );
    });
    this.logger.info({ exportId: row.id, rows: total }, 'lead export built');
  }

  async purge(exportId: string): Promise<void> {
    const [row] = await this.db.select().from(leadExports).where(eq(leadExports.id, exportId));
    if (!row?.storageKey) return;
    await this.storage.delete(row.storageKey);
    await this.db.update(leadExports).set({ storageKey: null }).where(eq(leadExports.id, row.id));
  }
}

function compactFilters(filters: LeadFilters | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (typeof value === 'string' && value) out[key] = value;
  }
  return out;
}

function toView(row: typeof leadExports.$inferSelect) {
  return {
    id: row.id,
    status: row.status,
    rowCount: row.rowCount,
    error: row.error,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    expiresAt: row.expiresAt,
    downloadable: row.status === 'COMPLETED' && !!row.storageKey && row.expiresAt > new Date(),
  };
}
