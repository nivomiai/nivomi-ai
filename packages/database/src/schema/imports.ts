import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { organizations } from './organizations.js';

export const importJobStatuses = [
  'AWAITING_UPLOAD',
  'ANALYZING',
  'MAPPING_REQUIRED',
  'PREVIEWING',
  'READY',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export const importJobStatus = pgEnum('import_job_status', importJobStatuses);
export type ImportJobStatus = (typeof importJobStatuses)[number];

export const importRowOutcomes = ['CREATE', 'UPDATE', 'SKIP', 'REVIEW', 'FAILED'] as const;
export type ImportRowOutcome = (typeof importRowOutcomes)[number];

/** File import (PRD FR-14, FR-125–FR-128). The file itself lives in `StorageProvider`. */
export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').$type<'csv' | 'xlsx'>().notNull(),
    fileSize: integer('file_size').notNull(),
    storageKey: text('storage_key').notNull(),
    status: importJobStatus('status').notNull().default('AWAITING_UPLOAD'),
    headers: jsonb('headers').$type<string[]>(),
    suggestedMapping: jsonb('suggested_mapping').$type<Record<string, string>>(),
    mapping: jsonb('mapping').$type<Record<string, string>>(),
    options: jsonb('options').$type<Record<string, unknown>>(),
    preview: jsonb('preview').$type<Record<string, unknown>>(),
    totalRows: integer('total_rows').notNull().default(0),
    processedRows: integer('processed_rows').notNull().default(0),
    succeededRows: integer('succeeded_rows').notNull().default(0),
    failedRows: integer('failed_rows').notNull().default(0),
    duplicateRows: integer('duplicate_rows').notNull().default(0),
    reviewRows: integer('review_rows').notNull().default(0),
    /** User-safe failure reason for the whole job. */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedByUserId: uuid('confirmed_by_user_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** The file and staged rows are deleted after this time (FR-128, A-93). */
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('import_jobs_org_created_idx').on(t.organizationId, t.createdAt)],
);

/** Parsed rows staged for mapping, preview and the chunked import; purged with the file. */
export const importRows = pgTable(
  'import_rows',
  {
    importJobId: uuid('import_job_id')
      .notNull()
      .references(() => importJobs.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').notNull(),
    /** 1-based data row number as the Member sees it in the file (header is row 1). */
    rowNumber: integer('row_number').notNull(),
    cells: jsonb('cells').$type<string[]>().notNull(),
    outcome: text('outcome').$type<ImportRowOutcome>(),
    error: text('error'),
  },
  (t) => [primaryKey({ columns: [t.importJobId, t.rowNumber] })],
);
