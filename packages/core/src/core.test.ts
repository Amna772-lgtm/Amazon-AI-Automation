import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { decryptJson, encryptJson, maskSecret } from './crypto';
import { buildExport, sanitizeCell } from './exporter';
import { buildAsinEntries, buildImportEntries, classifyEntries, type SeenIndex } from './import-plan';
import { buildStorageKey, LocalDiskStorage } from './storage';
import { detectAsinColumns, detectSpreadsheetKind, detectUrlColumns, parseSpreadsheet, SpreadsheetError } from './spreadsheet';

const KEY = Buffer.alloc(32, 7);

describe('crypto', () => {
  it('round-trips JSON and produces distinct ciphertexts', () => {
    const a = encryptJson({ apiKey: 'secret-123' }, KEY);
    const b = encryptJson({ apiKey: 'secret-123' }, KEY);
    expect(a).not.toBe(b);
    expect(decryptJson(a, KEY)).toEqual({ apiKey: 'secret-123' });
  });

  it('rejects tampered ciphertext and wrong keys', () => {
    const c = encryptJson({ x: 1 }, KEY);
    const parts = c.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptJson(parts.join(':'), KEY)).toThrow();
    expect(() => decryptJson(c, Buffer.alloc(32, 8))).toThrow();
  });

  it('masks secrets', () => {
    expect(maskSecret('sk-abcdef1234')).toBe('••••1234');
  });
});

describe('storage', () => {
  let dir: string;
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('stores under workspace prefix and refuses traversal', async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'store-'));
    const s = new LocalDiskStorage(dir);
    const key = buildStorageKey('ws1', 'uploads', 'f.csv');
    await s.put(key, Buffer.from('hi'));
    expect((await s.get(key)).toString()).toBe('hi');
    expect(() => buildStorageKey('ws1', '..', 'x')).toThrow();
    await expect(s.get('../outside.txt')).rejects.toThrow();
  });
});

const CSV = [
  'Product,Amazon Link,Notes',
  'Mug,https://www.amazon.com/dp/B08N5WRWNW,first',
  'Mug again,https://amazon.com/x/dp/b08n5wrwnw?psc=1,dup',
  'Lamp,https://www.amazon.de/dp/B08N5WRWNW,other marketplace',
  'Broken,https://www.amazon.com/s?k=lamp,no asin',
  ',,',
  'Ebay,https://www.ebay.com/itm/1,not amazon',
].join('\n');

describe('spreadsheet parsing', () => {
  it('parses CSV with header and detects URL column', async () => {
    const sheet = await parseSpreadsheet(Buffer.from(CSV), 'csv');
    expect(sheet.hasHeader).toBe(true);
    expect(sheet.firstDataRowNumber).toBe(2);
    expect(detectUrlColumns(sheet)).toEqual([1]);
  });

  it('handles header-less files', async () => {
    const sheet = await parseSpreadsheet(Buffer.from('https://www.amazon.com/dp/B08N5WRWNW\nhttps://www.amazon.com/dp/B000000001'), 'csv');
    expect(sheet.hasHeader).toBe(false);
    expect(sheet.rows).toHaveLength(2);
    expect(detectUrlColumns(sheet)).toEqual([0]);
  });

  it('parses XLSX including hyperlink cells', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['Name', 'URL']);
    ws.addRow(['A', 'https://www.amazon.com/dp/B08N5WRWNW']);
    ws.addRow(['B', { text: 'click here', hyperlink: 'https://www.amazon.co.uk/dp/B07XJPY6ZQ' }]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    expect(detectSpreadsheetKind('file.xlsx', buf)).toBe('xlsx');
    const sheet = await parseSpreadsheet(buf, 'xlsx');
    expect(sheet.rows.map((r) => r[1])).toEqual([
      'https://www.amazon.com/dp/B08N5WRWNW',
      'https://www.amazon.co.uk/dp/B07XJPY6ZQ',
    ]);
  });

  it('rejects mismatched or unsupported files', () => {
    expect(() => detectSpreadsheetKind('x.xlsx', Buffer.from('a,b'))).toThrow(SpreadsheetError);
    expect(() => detectSpreadsheetKind('x.xls', Buffer.from('a'))).toThrow(/Legacy/);
    expect(() => detectSpreadsheetKind('x.exe', Buffer.from('a'))).toThrow(SpreadsheetError);
    expect(() => detectSpreadsheetKind('x.csv', Buffer.from([0x61, 0x00, 0x62]))).toThrow(/binary/);
  });
});

describe('import classification', () => {
  it('classifies valid, duplicate and invalid rows and skips blanks', async () => {
    const sheet = await parseSpreadsheet(Buffer.from(CSV), 'csv');
    const entries = buildImportEntries(sheet, detectUrlColumns(sheet));
    expect(entries).toHaveLength(5); // blank row skipped
    const out = classifyEntries(entries, new Map());
    expect(out.map((o) => [o.rowNumber, o.status])).toEqual([
      [2, 'VALID'],
      [3, 'DUPLICATE'],
      [4, 'VALID'],
      [5, 'INVALID'],
      [7, 'INVALID'],
    ]);
    expect(out[1].duplicateOfRow).toBe(2);
    expect(out[3].errorCode).toBe('NO_ASIN');
    expect(out[4].errorCode).toBe('NOT_AMAZON');
    expect(out[0].extra).toEqual({ Product: 'Mug', Notes: 'first' });
  });

  it('flags products already imported in another file of the project', () => {
    const seen: SeenIndex = new Map([['US:B08N5WRWNW', { rowNumber: 9, fileName: 'old.csv' }]]);
    const [row] = classifyEntries(
      [{ rowNumber: 2, sourceColumn: 'URL', rawValue: 'https://www.amazon.com/dp/B08N5WRWNW', extra: {} }],
      seen,
    );
    expect(row.status).toBe('DUPLICATE');
    expect(row.errorCode).toBe('DUPLICATE_IN_PROJECT');
  });

  it('reads a Keepa export by its ASIN and Locale columns when the sheet has no URLs', async () => {
    const sheet = await parseSpreadsheet(readFileSync(path.resolve(__dirname, '../../../samples/keepa-export-sample.csv')), 'csv');
    expect(detectUrlColumns(sheet)).toEqual([]);
    const columns = detectAsinColumns(sheet)!;
    expect(columns).toEqual({ asin: sheet.headers.indexOf('ASIN'), locale: sheet.headers.indexOf('Locale') });

    const out = classifyEntries(buildAsinEntries(sheet, columns), new Map());
    expect(out.map((o) => [o.rowNumber, o.status, o.marketplace, o.asin])).toEqual([
      [2, 'VALID', 'US', 'B08N5WRWNW'],
      [3, 'VALID', 'US', 'B07XJPY6ZQ'],
      [4, 'DUPLICATE', 'US', 'B08N5WRWNW'],
      [5, 'VALID', 'GB', 'B0C1234567'],
      [6, 'VALID', 'DE', 'B08N5WRWNW'],
      [7, 'VALID', 'US', 'B09ABCDEFG'],
      [8, 'INVALID', null, null],
      [9, 'VALID', 'US', 'B0AAAAAAAA'],
    ]);
    expect(out[0]).toMatchObject({ sourceColumn: 'ASIN', canonicalUrl: 'https://www.amazon.com/dp/B08N5WRWNW' });
    // The sheet's own Keepa columns are kept with the row.
    expect(out[0].extra).toMatchObject({ Locale: 'com', Brand: 'Mugco', 'Bought in past month': '400' });
    expect(out[0].extra).not.toHaveProperty('ASIN');
  });

  it('assumes amazon.com without a marketplace column and never guesses an unknown one', async () => {
    const bare = await parseSpreadsheet(Buffer.from('Title,ASIN\nMug,b08n5wrwnw\n'), 'csv');
    const columns = detectAsinColumns(bare)!;
    expect(columns.locale).toBeNull();
    expect(classifyEntries(buildAsinEntries(bare, columns), new Map())[0]).toMatchObject({ status: 'VALID', marketplace: 'US', asin: 'B08N5WRWNW' });

    const odd = await parseSpreadsheet(Buffer.from('Locale,ASIN\nxx,B08N5WRWNW\n'), 'csv');
    expect(classifyEntries(buildAsinEntries(odd, detectAsinColumns(odd)!), new Map())[0]).toMatchObject({ status: 'INVALID', errorCode: 'UNSUPPORTED_MARKETPLACE' });

    // A sheet with neither URLs nor an ASIN column is still refused by the importer.
    expect(detectAsinColumns(await parseSpreadsheet(Buffer.from('Name,Notes\nMug,nice\n'), 'csv'))).toBeNull();
  });
});

describe('exporter', () => {
  it('neutralises formula injection', () => {
    expect(sanitizeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(sanitizeCell('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(sanitizeCell('normal')).toBe('normal');
    expect(sanitizeCell(5)).toBe(5);
  });

  it('builds CSV and XLSX', async () => {
    const rows = [{ a: 'x', b: 1 }];
    const cols = [
      { header: 'A', value: (r: (typeof rows)[0]) => r.a },
      { header: 'B', value: (r: (typeof rows)[0]) => r.b },
    ];
    const csv = (await buildExport(rows, cols, 'csv')).toString('utf8');
    expect(csv.replace('﻿', '').split(/\r?\n/)).toEqual(['A,B', 'x,1']);
    const xlsx = await buildExport(rows, cols, 'xlsx');
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');
  });
});
