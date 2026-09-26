import { Inject, Injectable } from '@nestjs/common';
import { consentBases, importJobs, importRows, type Database } from '@nivomi/database';
import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { TenantPrincipal } from '../auth/principal.js';
import { AppError } from '../common/errors.js';
import { decodeCursor, toPage } from '../common/pagination.js';
import type { ClientContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { JobQueue } from '../jobs/jobs.js';
import { cleanText } from '../leads/normalize.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage.js';
import { FIELD_LABELS, IMPORT_FIELDS, REQUIRED_FIELDS, mappingProblems } from './field-mapping.js';
import { IMPORT_MAX_BYTES, fileTypeFromName } from './file-parsing.js';

export const IMPORT_JOBS = {
  analyze: 'imports.analyze',
  preview: 'imports.preview',
  run: 'imports.run',
  purge: 'imports.purge',
} as const;

/** Signed upload URLs expire after 15 minutes (A-94). */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

export interface ImportOptions {
  readonly defaultCountry: string;
  readonly consentDefault: {
    readonly basis: (typeof consentBases)[number];
    readonly source: string | null;
    readonly reference: string | null;
    readonly operatorConsentReference: string | null;
    readonly attestedByUserId: string;
    readonly attestedAt: string;
  } | null;
}

const notFound = () => new AppError('NOT_FOUND', 'Import not found.');
/** Lets Excel open the report as UTF-8. */
const UTF8_BOM = '\uFEFF';

@Injectable()
export class ImportsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly jobs: JobQueue,
    private readonly audit: AuditService,
  ) {}

  fields() {
    return IMPORT_FIELDS.map((key) => ({
      key,
      label: FIELD_LABELS[key],
      required: REQUIRED_FIELDS.includes(key),
    }));
  }

  /** Step 1: register the file and hand out a short-lived signed upload URL (FR-128). */
  async create(
    tenant: TenantPrincipal,
    input: { fileName: string; fileSize: number },
    context: ClientContext,
  ) {
    const fileType = fileTypeFromName(input.fileName);
    if (!fileType) throw new AppError('VALIDATION_ERROR', 'Upload a .csv or .xlsx file.');
    if (input.fileSize <= 0 || input.fileSize > IMPORT_MAX_BYTES) {
      throw new AppError('VALIDATION_ERROR', 'Files can be at most 20 MB.');
    }
    const orgId = tenant.membership.organizationId;
    const id = randomUUID();
    const storageKey = `imports/${orgId}/${id}/source.${fileType}`;
    const contentType = 'application/octet-stream';
    const upload = await this.storage.createUploadTarget(storageKey, {
      contentType,
      maxBytes: input.fileSize,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
    await this.db.insert(importJobs).values({
      id,
      organizationId: orgId,
      createdByUserId: tenant.userId,
      fileName: cleanText(input.fileName, 200) ?? `import.${fileType}`,
      fileType,
      fileSize: input.fileSize,
      storageKey,
    });
    await this.audit.record(
      {
        action: 'import.created',
        organizationId: orgId,
        actorUserId: tenant.userId,
        resourceType: 'import',
        resourceId: id,
      },
      context,
    );
    return { id, upload };
  }

  /** Step 2: the browser finished uploading; parse in the background. */
  async markUploaded(tenant: TenantPrincipal, id: string) {
    const job = await this.find(tenant, id);
    if (job.status !== 'AWAITING_UPLOAD') {
      throw new AppError('CONFLICT', 'This file was already received.');
    }
    const size = await this.storage.size(job.storageKey);
    if (size === null)
      throw new AppError('VALIDATION_ERROR', 'The file has not been uploaded yet.');
    await this.db.transaction(async (tx) => {
      await tx
        .update(importJobs)
        .set({ status: 'ANALYZING', uploadedAt: new Date(), fileSize: size })
        .where(eq(importJobs.id, id));
      await this.jobs.enqueue(
        {
          type: IMPORT_JOBS.analyze,
          payload: { importId: id },
          organizationId: job.organizationId,
          idempotencyKey: `import:${id}:analyze`,
          maxAttempts: 3,
        },
        tx,
      );
    });
    return this.get(tenant, id);
  }

  async get(tenant: TenantPrincipal, id: string) {
    const job = await this.find(tenant, id);
    const sampleRows =
      job.status === 'MAPPING_REQUIRED' || job.status === 'READY' || job.status === 'PREVIEWING'
        ? await this.db
            .select({ rowNumber: importRows.rowNumber, cells: importRows.cells })
            .from(importRows)
            .where(eq(importRows.importJobId, id))
            .orderBy(asc(importRows.rowNumber))
            .limit(5)
        : [];
    return { ...present(job), sampleRows };
  }

  async list(tenant: TenantPrincipal, query: { limit: number; cursor?: string | undefined }) {
    const after = decodeCursor(query.cursor);
    const rows = await this.db
      .select()
      .from(importJobs)
      .where(
        and(
          eq(importJobs.organizationId, tenant.membership.organizationId),
          after
            ? or(
                lt(importJobs.createdAt, after.createdAt),
                and(eq(importJobs.createdAt, after.createdAt), lt(importJobs.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(importJobs.createdAt), desc(importJobs.id))
      .limit(query.limit + 1);
    const page = toPage(rows, query.limit);
    return { items: page.items.map(present), nextCursor: page.nextCursor };
  }

  /** Step 3: the Member confirms the mapping and consent basis; preview runs in the background. */
  async setMapping(
    tenant: TenantPrincipal,
    id: string,
    input: {
      mapping: Record<string, string>;
      defaultCountry: string;
      consentDefault: {
        basis: (typeof consentBases)[number];
        source?: string | null | undefined;
        reference?: string | null | undefined;
        attested: boolean;
      } | null;
    },
  ) {
    const job = await this.find(tenant, id);
    if (job.status !== 'MAPPING_REQUIRED' && job.status !== 'READY') {
      throw new AppError('CONFLICT', 'The mapping can no longer be changed.');
    }
    const problems = mappingProblems(job.headers ?? [], input.mapping);
    if (problems.length > 0) {
      throw new AppError('VALIDATION_ERROR', problems[0] ?? 'Check the mapping.', {
        details: problems,
      });
    }
    if (input.consentDefault && !input.consentDefault.attested) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Confirm that you hold this consent basis for every row without one.',
      );
    }
    if (
      input.consentDefault?.basis === 'REGISTERED_CONSENT' &&
      !cleanText(input.consentDefault.reference)
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'REGISTERED_CONSENT needs the operator consent reference.',
      );
    }
    const options: ImportOptions = {
      defaultCountry: input.defaultCountry,
      consentDefault: input.consentDefault
        ? {
            basis: input.consentDefault.basis,
            source: cleanText(input.consentDefault.source, 200),
            reference: cleanText(input.consentDefault.reference, 200),
            operatorConsentReference:
              input.consentDefault.basis === 'REGISTERED_CONSENT'
                ? cleanText(input.consentDefault.reference, 200)
                : null,
            attestedByUserId: tenant.userId,
            attestedAt: new Date().toISOString(),
          }
        : null,
    };
    const version = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx
        .update(importJobs)
        .set({
          status: 'PREVIEWING',
          mapping: input.mapping,
          options: { ...options, previewVersion: version },
          preview: null,
        })
        .where(eq(importJobs.id, id));
      await this.jobs.enqueue(
        {
          type: IMPORT_JOBS.preview,
          payload: { importId: id, version },
          organizationId: job.organizationId,
          idempotencyKey: `import:${id}:preview:${version}`,
          maxAttempts: 3,
        },
        tx,
      );
    });
    return this.get(tenant, id);
  }

  /** Step 4: explicit confirmation (FR-14 step 8); nothing is written before this. */
  async confirm(tenant: TenantPrincipal, id: string, context: ClientContext) {
    const job = await this.find(tenant, id);
    if (job.status !== 'READY') {
      throw new AppError('CONFLICT', 'This import is not ready to confirm.');
    }
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(importJobs)
        .set({ status: 'QUEUED', confirmedAt: new Date(), confirmedByUserId: tenant.userId })
        .where(and(eq(importJobs.id, id), eq(importJobs.status, 'READY')))
        .returning({ id: importJobs.id });
      if (updated.length === 0)
        throw new AppError('CONFLICT', 'This import is not ready to confirm.');
      await this.jobs.enqueue(
        {
          type: IMPORT_JOBS.run,
          payload: { importId: id, fromRow: 1 },
          organizationId: job.organizationId,
          idempotencyKey: `import:${id}:run:1`,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'import.confirmed',
          organizationId: job.organizationId,
          actorUserId: tenant.userId,
          resourceType: 'import',
          resourceId: id,
          metadata: { rows: job.totalRows },
        },
        context,
        tx,
      );
    });
    return this.get(tenant, id);
  }

  async cancel(tenant: TenantPrincipal, id: string, context: ClientContext) {
    const job = await this.find(tenant, id);
    const cancellable = ['AWAITING_UPLOAD', 'ANALYZING', 'MAPPING_REQUIRED', 'PREVIEWING', 'READY'];
    if (!cancellable.includes(job.status)) {
      throw new AppError('CONFLICT', 'This import can no longer be cancelled.');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(importJobs)
        .set({ status: 'CANCELLED', completedAt: new Date() })
        .where(and(eq(importJobs.id, id), inArray(importJobs.status, cancellable as never[])));
      await this.jobs.enqueue(
        {
          type: IMPORT_JOBS.purge,
          payload: { importId: id },
          organizationId: job.organizationId,
          idempotencyKey: `import:${id}:purge`,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'import.cancelled',
          organizationId: job.organizationId,
          actorUserId: tenant.userId,
          resourceType: 'import',
          resourceId: id,
        },
        context,
        tx,
      );
    });
  }

  /** Row-level error report as CSV (FR-127). Every download is audited (FR-128). */
  async errorReport(tenant: TenantPrincipal, id: string, context: ClientContext) {
    const job = await this.find(tenant, id);
    if (job.purgedAt)
      throw new AppError('NOT_FOUND', 'This report has been deleted with the file.');
    const rows = await this.db
      .select()
      .from(importRows)
      .where(and(eq(importRows.importJobId, id), inArray(importRows.outcome, ['FAILED', 'REVIEW'])))
      .orderBy(asc(importRows.rowNumber))
      .limit(100_000);
    const header = ['Row', 'Outcome', 'Reason', ...(job.headers ?? [])];
    const lines = [
      header,
      ...rows.map((r) => [String(r.rowNumber), r.outcome ?? '', r.error ?? '', ...r.cells]),
    ];
    await this.audit.record(
      {
        action: 'import.error_report_downloaded',
        organizationId: job.organizationId,
        actorUserId: tenant.userId,
        resourceType: 'import',
        resourceId: id,
      },
      context,
    );
    const base = job.fileName.replace(/\.(csv|xlsx)$/i, '').replace(/[^\w.-]+/g, '_');
    return {
      fileName: `${base || 'import'}-errors.csv`,
      content: `${UTF8_BOM}${lines.map(csvLine).join('\r\n')}\r\n`,
    };
  }

  private async find(tenant: TenantPrincipal, id: string) {
    const [job] = await this.db
      .select()
      .from(importJobs)
      .where(
        and(eq(importJobs.id, id), eq(importJobs.organizationId, tenant.membership.organizationId)),
      )
      .limit(1);
    if (!job) throw notFound();
    return job;
  }
}

function present(job: typeof importJobs.$inferSelect) {
  return {
    id: job.id,
    fileName: job.fileName,
    fileType: job.fileType,
    fileSize: job.fileSize,
    status: job.status,
    headers: job.headers,
    suggestedMapping: job.suggestedMapping,
    mapping: job.mapping,
    preview: job.preview,
    error: job.error,
    counts: {
      total: job.totalRows,
      processed: job.processedRows,
      succeeded: job.succeededRows,
      failed: job.failedRows,
      duplicates: job.duplicateRows,
      review: job.reviewRows,
    },
    createdAt: job.createdAt,
    confirmedAt: job.confirmedAt,
    completedAt: job.completedAt,
    purgedAt: job.purgedAt,
  };
}

/**
 * RFC 4180 line with spreadsheet formula-injection protection: a cell starting with = + - @ tab
 * or CR is prefixed with an apostrophe so Excel shows it as text instead of running it.
 */
export function csvLine(cells: readonly string[]): string {
  return cells
    .map((cell) => {
      const safe = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
      return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    })
    .join(',');
}
