import { parse } from 'csv-parse/sync';
import { readSheet } from 'read-excel-file/node';

/** PRD FR-14 / A-9. */
export const IMPORT_MAX_BYTES = 20 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 100_000;
const MAX_COLUMNS = 200;
const MAX_CELL_LENGTH = 2_000;
/** Zip-bomb guard: an .xlsx may not declare more than this much uncompressed content. */
const MAX_XLSX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const MAX_XLSX_ENTRIES = 5_000;

export type ImportFileType = 'csv' | 'xlsx';

export interface ParsedFile {
  readonly headers: string[];
  /** Data rows (without the header), each padded/truncated to the header width. */
  readonly rows: string[][];
}

/** A problem with the file as a whole; the message is shown to the Member. */
export class FileRejectedError extends Error {
  override readonly name = 'FileRejectedError';
}

export function fileTypeFromName(name: string): ImportFileType | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.xlsx')) return 'xlsx';
  return null;
}

/** Validates type, size and structure before parsing (FR-128), then parses to text cells. */
export async function parseImportFile(data: Buffer, type: ImportFileType): Promise<ParsedFile> {
  if (data.length === 0) throw new FileRejectedError('The file is empty.');
  if (data.length > IMPORT_MAX_BYTES) throw new FileRejectedError('The file is larger than 20 MB.');
  const table = type === 'csv' ? parseCsv(data) : await parseXlsx(data);
  return toParsedFile(table);
}

function parseCsv(data: Buffer): string[][] {
  if (isZip(data)) {
    throw new FileRejectedError('This looks like an Excel file. Upload it with an .xlsx name.');
  }
  if (data.includes(0)) throw new FileRejectedError('This is not a text CSV file.');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    // Excel on Windows commonly saves CSV as Windows-1252.
    text = new TextDecoder('windows-1252').decode(data);
  }
  try {
    return parse(text, {
      bom: true,
      delimiter: [',', ';', '\t'],
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      trim: true,
      max_record_size: MAX_CELL_LENGTH * MAX_COLUMNS,
      to_line: IMPORT_MAX_ROWS + 2,
    });
  } catch {
    throw new FileRejectedError('The CSV file could not be read. Check that quotes are balanced.');
  }
}

async function parseXlsx(data: Buffer): Promise<string[][]> {
  if (!isZip(data)) throw new FileRejectedError('This is not a valid .xlsx file.');
  assertZipWithinLimits(data);
  let sheet: unknown[][];
  try {
    sheet = await readSheet(data, 1);
  } catch {
    throw new FileRejectedError('The Excel file could not be read.');
  }
  return sheet.map((row) => row.map(cellText));
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  if (typeof value === 'number') {
    // Phone numbers stored as numbers must not become "9.1987654321e+11".
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  return '';
}

function toParsedFile(table: string[][]): ParsedFile {
  const [headerRow, ...dataRows] = table;
  const headers = (headerRow ?? []).map((h) => h.replace(/\s+/g, ' ').trim());
  while (headers.length > 0 && headers.at(-1) === '') headers.pop();
  if (headers.length === 0) throw new FileRejectedError('The first row must contain column names.');
  if (headers.length > MAX_COLUMNS) {
    throw new FileRejectedError(`The file has more than ${MAX_COLUMNS} columns.`);
  }
  const seen = new Set<string>();
  headers.forEach((header, index) => {
    const name = header || `Column ${index + 1}`;
    if (seen.has(name.toLowerCase())) {
      throw new FileRejectedError(`The column name "${name}" appears more than once.`);
    }
    seen.add(name.toLowerCase());
    headers[index] = name;
  });

  const rows = dataRows
    .map((row) => headers.map((_, i) => (row[i] ?? '').trim().slice(0, MAX_CELL_LENGTH)))
    .filter((row) => row.some((cell) => cell !== ''));
  if (rows.length === 0) throw new FileRejectedError('The file has no data rows.');
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new FileRejectedError(
      `The file has more than ${IMPORT_MAX_ROWS.toLocaleString('en-IN')} rows.`,
    );
  }
  return { headers, rows };
}

function isZip(data: Buffer): boolean {
  return data.length >= 4 && data.readUInt32LE(0) === 0x04034b50;
}

/**
 * Reads the zip central directory and rejects archives that declare too much uncompressed data,
 * too many entries or ZIP64 sizes, before any decompression happens.
 */
export function assertZipWithinLimits(data: Buffer): void {
  const minEocd = 22;
  const searchFrom = Math.max(0, data.length - (minEocd + 0xffff));
  let eocd = -1;
  for (let i = data.length - minEocd; i >= searchFrom; i -= 1) {
    if (data.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new FileRejectedError('This is not a valid .xlsx file.');
  const entries = data.readUInt16LE(eocd + 10);
  const cdSize = data.readUInt32LE(eocd + 12);
  const cdOffset = data.readUInt32LE(eocd + 16);
  if (entries === 0xffff || cdOffset === 0xffffffff || cdOffset + cdSize > data.length) {
    throw new FileRejectedError('This .xlsx file is not supported.');
  }
  if (entries > MAX_XLSX_ENTRIES) throw new FileRejectedError('This .xlsx file is too complex.');

  let offset = cdOffset;
  let total = 0;
  for (let n = 0; n < entries; n += 1) {
    if (offset + 46 > data.length || data.readUInt32LE(offset) !== 0x02014b50) {
      throw new FileRejectedError('This is not a valid .xlsx file.');
    }
    const uncompressed = data.readUInt32LE(offset + 24);
    if (uncompressed === 0xffffffff)
      throw new FileRejectedError('This .xlsx file is not supported.');
    total += uncompressed;
    if (total > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new FileRejectedError('This .xlsx file expands to too much data.');
    }
    offset +=
      46 +
      data.readUInt16LE(offset + 28) +
      data.readUInt16LE(offset + 30) +
      data.readUInt16LE(offset + 32);
  }
}
