import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  contacts,
  importJobs,
  importRows,
  suppressionEntries,
  type Database,
  type ImportRowOutcome,
} from '@nivomi/database';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { DATABASE } from '../database/database.module.js';
import { JobHandlerRegistry, JobQueue } from '../jobs/jobs.js';
import {
  IngestionEngine,
  lockOrganizationIngestion,
  validateRecord,
  type IngestionContext,
} from '../leads/ingestion.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage.js';
import { applyMapping, suggestMapping } from './field-mapping.js';
import { FileRejectedError, parseImportFile } from './file-parsing.js';
import { IMPORT_JOBS, type ImportOptions } from './imports.service.js';

/** Rows committed per `imports.run` job; each chunk is one transaction with its checkpoint. */
export const IMPORT_CHUNK_SIZE = 500;
const STAGE_BATCH = 500;
const PREVIEW_PAGE = 1_000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // A-93

const importPayload = z.object({ importId: z.uuid() });
const previewPayload = importPayload.extend({ version: z.uuid() });
const runPayload = importPayload.extend({ fromRow: z.number().int().min(1) });

@Injectable()
export class ImportJobs implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly queue: JobQueue,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @InjectPinoLogger(ImportJobs.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      IMPORT_JOBS.analyze,
      (p) => this.analyze(importPayload.parse(p).importId),
      { timeoutMs: 3 * 60_000 },
    );
    this.registry.register(
      IMPORT_JOBS.preview,
      (p) => {
        const { importId, version } = previewPayload.parse(p);
        return this.preview(importId, version);
      },
      { timeoutMs: 4 * 60_000 },
    );
    this.registry.register(
      IMPORT_JOBS.run,
      (p) => {
        const { importId, fromRow } = runPayload.parse(p);
        return this.run(importId, fromRow);
      },
      { timeoutMs: 4 * 60_000 },
    );
    this.registry.register(IMPORT_JOBS.purge, (p) => this.purge(importPayload.parse(p).importId));
  }

  private async load(importId: string) {
    const [job] = await this.db
      .select()
      .from(importJobs)
      .where(eq(importJobs.id, importId))
      .limit(1);
    return job ?? null;
  }

  private async fail(importId: string, message: string) {
    await this.db
      .update(importJobs)
      .set({ status: 'FAILED', error: message, completedAt: new Date() })
      .where(eq(importJobs.id, importId));
    await this.schedulePurge(importId, new Date());
  }

  /** Parse the uploaded file once and stage its rows (validated for type, size, structure). */
  async analyze(importId: string): Promise<void> {
    const job = await this.load(importId);
    if (job?.status !== 'ANALYZING') return;
    let parsed;
    try {
      parsed = await parseImportFile(await this.storage.read(job.storageKey), job.fileType);
    } catch (error) {
      if (error instanceof FileRejectedError) return this.fail(importId, error.message);
      throw error;
    }
    const { headers, rows } = parsed;
    await this.db.transaction(async (tx) => {
      // A retried job starts from a clean slate.
      await tx.delete(importRows).where(eq(importRows.importJobId, importId));
      for (let i = 0; i < rows.length; i += STAGE_BATCH) {
        await tx.insert(importRows).values(
          rows.slice(i, i + STAGE_BATCH).map((cells, j) => ({
            importJobId: importId,
            organizationId: job.organizationId,
            rowNumber: i + j + 2, // row 1 is the header
            cells,
          })),
        );
      }
      await tx
        .update(importJobs)
        .set({
          status: 'MAPPING_REQUIRED',
          headers,
          suggestedMapping: suggestMapping(headers),
          totalRows: rows.length,
        })
        .where(and(eq(importJobs.id, importId), eq(importJobs.status, 'ANALYZING')));
    });
  }

  /** FR-126: counts only — nothing is written to contacts or leads. */
  async preview(importId: string, version: string): Promise<void> {
    const job = await this.load(importId);
    if (job?.status !== 'PREVIEWING' || job.options?.previewVersion !== version) return;
    const mapping = job.mapping ?? {};
    const headers = job.headers ?? [];
    const ctx = this.context(job);
    const counts = {
      total: job.totalRows,
      valid: 0,
      invalid: 0,
      missingRequired: 0,
      matchesExisting: 0,
      duplicatesInFile: 0,
      noConsentBasis: 0,
      suppressed: 0,
    };
    const sampleErrors: { row: number; reason: string }[] = [];
    const seenPhones = new Set<string>();

    for (let from = 2; from < job.totalRows + 2; from += PREVIEW_PAGE) {
      const page = await this.db
        .select({ rowNumber: importRows.rowNumber, cells: importRows.cells })
        .from(importRows)
        .where(
          and(
            eq(importRows.importJobId, importId),
            gte(importRows.rowNumber, from),
            lte(importRows.rowNumber, from + PREVIEW_PAGE - 1),
          ),
        )
        .orderBy(asc(importRows.rowNumber));
      const valid = [];
      for (const row of page) {
        const input = applyMapping(headers, row.cells, mapping);
        const result = validateRecord(input, ctx);
        if (!result.ok) {
          counts.invalid += 1;
          if (!input.phone) counts.missingRequired += 1;
          if (sampleErrors.length < 20)
            sampleErrors.push({ row: row.rowNumber, reason: result.reason });
          continue;
        }
        counts.valid += 1;
        if (seenPhones.has(result.record.phoneE164)) counts.duplicatesInFile += 1;
        seenPhones.add(result.record.phoneE164);
        if (!result.record.consent && !result.record.suppress) counts.noConsentBasis += 1;
        valid.push(result.record);
      }
      // Batched lookups keep the preview fast on large files.
      const phones = [...new Set(valid.map((r) => r.phoneE164))];
      const emails = [...new Set(valid.flatMap((r) => r.emailNormalized ?? []))];
      const existingPhones = new Set<string>();
      const existingEmails = new Set<string>();
      if (phones.length > 0) {
        const found = await this.db
          .select({ phone: contacts.phoneE164 })
          .from(contacts)
          .where(
            and(
              eq(contacts.organizationId, job.organizationId),
              inArray(contacts.phoneE164, phones),
            ),
          );
        found.forEach((c) => c.phone && existingPhones.add(c.phone));
      }
      if (emails.length > 0) {
        const found = await this.db
          .select({ email: contacts.emailNormalized })
          .from(contacts)
          .where(
            and(
              eq(contacts.organizationId, job.organizationId),
              inArray(contacts.emailNormalized, emails),
            ),
          );
        found.forEach((c) => c.email && existingEmails.add(c.email));
      }
      const suppressed = new Set<string>();
      if (phones.length > 0) {
        const found = await this.db
          .select({ phone: suppressionEntries.phoneE164 })
          .from(suppressionEntries)
          .where(
            and(
              eq(suppressionEntries.organizationId, job.organizationId),
              inArray(suppressionEntries.phoneE164, phones),
            ),
          );
        found.forEach((s) => suppressed.add(s.phone));
      }
      for (const record of valid) {
        if (
          existingPhones.has(record.phoneE164) ||
          (record.emailNormalized !== null && existingEmails.has(record.emailNormalized))
        ) {
          counts.matchesExisting += 1;
        }
        if (record.suppress || suppressed.has(record.phoneE164)) counts.suppressed += 1;
      }
    }

    await this.db
      .update(importJobs)
      .set({ status: 'READY', preview: { ...counts, sampleErrors } })
      .where(
        and(
          eq(importJobs.id, importId),
          eq(importJobs.status, 'PREVIEWING'),
          sql`${importJobs.options}->>'previewVersion' = ${version}`,
        ),
      );
  }

  /**
   * FR-127: imports one chunk of rows in a transaction together with its checkpoint, then queues
   * the next chunk. A crash re-runs only the uncommitted chunk; one bad row never fails the job.
   */
  async run(importId: string, fromRow: number): Promise<void> {
    const job = await this.load(importId);
    if (!job || !['QUEUED', 'PROCESSING'].includes(job.status)) return;
    const firstRow = fromRow;
    const lastRow = fromRow + IMPORT_CHUNK_SIZE - 1;
    const headers = job.headers ?? [];
    const mapping = job.mapping ?? {};
    const ctx = this.context(job);
    const lastDataRow = job.totalRows + 1;

    const done = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: importJobs.status, processedRows: importJobs.processedRows })
        .from(importJobs)
        .where(eq(importJobs.id, importId))
        .for('update');
      if (!current || !['QUEUED', 'PROCESSING'].includes(current.status)) return true;
      // Already committed by an earlier attempt of this chunk.
      if (current.processedRows >= Math.min(lastRow, lastDataRow) - 1) {
        return lastRow >= lastDataRow;
      }
      await lockOrganizationIngestion(tx, job.organizationId);

      const rows = await tx
        .select({ rowNumber: importRows.rowNumber, cells: importRows.cells })
        .from(importRows)
        .where(
          and(
            eq(importRows.importJobId, importId),
            gte(importRows.rowNumber, firstRow),
            lte(importRows.rowNumber, lastRow),
          ),
        )
        .orderBy(asc(importRows.rowNumber));

      const delta = { succeeded: 0, failed: 0, duplicates: 0, review: 0 };
      for (const row of rows) {
        let outcome: ImportRowOutcome;
        let error: string | null = null;
        try {
          // A savepoint per row: an unexpected failure rolls back that row only.
          const result = await tx.transaction((sp) =>
            new IngestionEngine(sp).ingest(applyMapping(headers, row.cells, mapping), ctx),
          );
          switch (result.outcome) {
            case 'CREATE':
            case 'UPDATE':
              outcome = result.outcome;
              error = result.notes.length ? result.notes.join(' ') : null;
              if (result.outcome === 'UPDATE') delta.duplicates += 1;
              delta.succeeded += 1;
              break;
            case 'SKIP':
              outcome = 'SKIP';
              delta.duplicates += 1;
              delta.succeeded += 1;
              break;
            case 'REVIEW':
              outcome = 'REVIEW';
              error = result.reason;
              delta.review += 1;
              break;
            case 'INVALID':
              outcome = 'FAILED';
              error = result.reason;
              delta.failed += 1;
              break;
            case 'DUPLICATE':
              outcome = 'SKIP';
              delta.duplicates += 1;
              break;
          }
        } catch (e) {
          this.logger.error({ err: e, importId, row: row.rowNumber }, 'Import row failed');
          outcome = 'FAILED';
          error = 'This row could not be imported because of an unexpected error.';
          delta.failed += 1;
        }
        await tx
          .update(importRows)
          .set({ outcome, error })
          .where(
            and(eq(importRows.importJobId, importId), eq(importRows.rowNumber, row.rowNumber)),
          );
      }

      const finished = lastRow >= lastDataRow;
      await tx
        .update(importJobs)
        .set({
          status: finished ? 'COMPLETED' : 'PROCESSING',
          startedAt: sql`coalesce(${importJobs.startedAt}, now())`,
          completedAt: finished ? new Date() : null,
          processedRows: sql`${importJobs.processedRows} + ${rows.length}`,
          succeededRows: sql`${importJobs.succeededRows} + ${delta.succeeded}`,
          failedRows: sql`${importJobs.failedRows} + ${delta.failed}`,
          duplicateRows: sql`${importJobs.duplicateRows} + ${delta.duplicates}`,
          reviewRows: sql`${importJobs.reviewRows} + ${delta.review}`,
        })
        .where(eq(importJobs.id, importId));
      if (!finished) {
        await this.queue.enqueue(
          {
            type: IMPORT_JOBS.run,
            payload: { importId, fromRow: lastRow + 1 },
            organizationId: job.organizationId,
            idempotencyKey: `import:${importId}:run:${lastRow + 1}`,
          },
          tx,
        );
      }
      return finished;
    });
    if (done) await this.schedulePurge(importId, new Date(Date.now() + RETENTION_MS));
  }

  /** FR-128 / A-93: the uploaded file and staged rows are deleted after 30 days. */
  async purge(importId: string): Promise<void> {
    const job = await this.load(importId);
    if (!job || job.purgedAt) return;
    await this.storage.delete(job.storageKey);
    await this.db.transaction(async (tx) => {
      await tx.delete(importRows).where(eq(importRows.importJobId, importId));
      await tx.update(importJobs).set({ purgedAt: new Date() }).where(eq(importJobs.id, importId));
    });
  }

  private async schedulePurge(importId: string, runAt: Date) {
    const job = await this.load(importId);
    if (!job) return;
    await this.queue.enqueue({
      type: IMPORT_JOBS.purge,
      payload: { importId },
      organizationId: job.organizationId,
      idempotencyKey: `import:${importId}:purge`,
      runAt,
    });
  }

  private context(job: typeof importJobs.$inferSelect): IngestionContext {
    const options = (job.options ?? {}) as unknown as ImportOptions;
    return {
      organizationId: job.organizationId,
      source: 'FILE_IMPORT',
      sourceReference: job.id,
      actorUserId: job.confirmedByUserId ?? job.createdByUserId,
      defaultCountry: options.defaultCountry,
      consentDefault: options.consentDefault,
      ownsContactFields: false,
    };
  }
}
