import { describe, expect, it } from 'vitest';
import { xlsx, zip } from '../../test/support/xlsx.js';
import { FileRejectedError, fileTypeFromName, parseImportFile } from './file-parsing.js';

describe('parseImportFile — CSV', () => {
  it('parses headers and rows, strips a BOM and skips blank lines', async () => {
    const csv = '\uFEFFName,Phone\n"Nair, Asha",98765 43210\n\n  Ravi , 9123456780 \n';
    await expect(parseImportFile(Buffer.from(csv), 'csv')).resolves.toEqual({
      headers: ['Name', 'Phone'],
      rows: [
        ['Nair, Asha', '98765 43210'],
        ['Ravi', '9123456780'],
      ],
    });
  });

  it('accepts semicolon-separated files and Windows-1252 text', async () => {
    const latin = Buffer.from([
      ...Buffer.from('Name;Phone\nJos'),
      0xe9,
      ...Buffer.from(';9876543210\n'),
    ]);
    await expect(parseImportFile(latin, 'csv')).resolves.toMatchObject({
      rows: [['José', '9876543210']],
    });
  });

  it('rejects files without data, duplicate headers and binary content', async () => {
    await expect(parseImportFile(Buffer.from('Name,Phone\n'), 'csv')).rejects.toThrow(
      FileRejectedError,
    );
    await expect(parseImportFile(Buffer.from('Phone,phone\n1,2\n'), 'csv')).rejects.toThrow(
      /more than once/,
    );
    await expect(parseImportFile(Buffer.from([0x50, 0x00, 0x41]), 'csv')).rejects.toThrow(
      FileRejectedError,
    );
    await expect(parseImportFile(xlsx([['a'], ['b']]), 'csv')).rejects.toThrow(/Excel/);
  });
});

describe('parseImportFile — XLSX', () => {
  it('reads the first sheet and keeps phone numbers as digits', async () => {
    const file = xlsx([
      ['Customer Name', 'Mobile'],
      ['Asha Nair', 919876543210],
      ['Ravi', '09123456780'],
    ]);
    await expect(parseImportFile(file, 'xlsx')).resolves.toEqual({
      headers: ['Customer Name', 'Mobile'],
      rows: [
        ['Asha Nair', '919876543210'],
        ['Ravi', '09123456780'],
      ],
    });
  });

  it('rejects non-zip content and archives that expand too much', async () => {
    await expect(parseImportFile(Buffer.from('Name,Phone\n'), 'xlsx')).rejects.toThrow(
      /not a valid/,
    );
    const bomb = zip({ 'xl/worksheets/sheet1.xml': 'x' });
    // Declare a huge uncompressed size in the central directory entry.
    const central = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bomb.writeUInt32LE(0xfffffff0, central + 24);
    await expect(parseImportFile(bomb, 'xlsx')).rejects.toThrow(FileRejectedError);
  });
});

describe('fileTypeFromName', () => {
  it('accepts only .csv and .xlsx', () => {
    expect(fileTypeFromName('Leads.CSV')).toBe('csv');
    expect(fileTypeFromName('leads.xlsx')).toBe('xlsx');
    expect(fileTypeFromName('leads.xls')).toBeNull();
    expect(fileTypeFromName('leads.csv.exe')).toBeNull();
  });
});
