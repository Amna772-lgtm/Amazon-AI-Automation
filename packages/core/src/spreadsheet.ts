import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { ASIN_RE, looksLikeAmazonReference, parseAmazonUrl } from '@app/shared';

export type SpreadsheetKind = 'csv' | 'xlsx';

export interface ParsedSheet {
  headers: string[];
  /** Data rows (header excluded), cells normalised to trimmed strings. */
  rows: string[][];
  /** 1-based sheet row number of rows[0] (2 when a header row exists). */
  firstDataRowNumber: number;
  hasHeader: boolean;
}

export const MAX_ROWS = 100_000;
export const MAX_COLUMNS = 200;

export class SpreadsheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpreadsheetError';
  }
}

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04" (zip)

/** Decide the parser from the file name and verify the content matches (no trusting the extension). */
export function detectSpreadsheetKind(fileName: string, data: Buffer): SpreadsheetKind {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'xlsx') {
    if (!data.subarray(0, 4).equals(XLSX_MAGIC)) throw new SpreadsheetError('File is not a valid .xlsx workbook');
    return 'xlsx';
  }
  if (ext === 'csv' || ext === 'txt') {
    if (data.subarray(0, 4096).includes(0)) throw new SpreadsheetError('CSV file contains binary data');
    return 'csv';
  }
  if (ext === 'xls') throw new SpreadsheetError('Legacy .xls files are not supported — save as .xlsx or .csv');
  throw new SpreadsheetError('Unsupported file type — upload a .csv or .xlsx file');
}

export async function parseSpreadsheet(data: Buffer, kind: SpreadsheetKind): Promise<ParsedSheet> {
  const raw = kind === 'csv' ? parseCsv(data) : await parseXlsx(data);
  const matrix = raw
    .slice(0, MAX_ROWS + 1)
    .map((r) => r.slice(0, MAX_COLUMNS).map((c) => (c ?? '').toString().trim()));
  if (raw.length > MAX_ROWS + 1) throw new SpreadsheetError(`File has more than ${MAX_ROWS} rows`);

  // Drop fully-empty trailing rows; keep interior empties so row numbers stay true to the sheet.
  while (matrix.length && matrix[matrix.length - 1].every((c) => !c)) matrix.pop();
  if (!matrix.length) throw new SpreadsheetError('File is empty');

  const width = Math.max(...matrix.map((r) => r.length));
  const first = matrix[0];
  const hasHeader = !first.some((c) => parseAmazonUrl(c).ok || looksLikeAmazonReference(c));
  const headers = hasHeader
    ? Array.from({ length: width }, (_, i) => first[i] || columnLetter(i))
    : Array.from({ length: width }, (_, i) => columnLetter(i));

  return {
    headers: dedupeHeaders(headers),
    rows: hasHeader ? matrix.slice(1) : matrix,
    firstDataRowNumber: hasHeader ? 2 : 1,
    hasHeader,
  };
}

function parseCsv(data: Buffer): string[][] {
  const text = data.toString('utf8').replace(/^﻿/, '');
  const result = Papa.parse<string[]>(text, { skipEmptyLines: false });
  if (result.errors.some((e) => e.type === 'Quotes')) {
    throw new SpreadsheetError(`CSV parse error: ${result.errors[0].message}`);
  }
  return result.data;
}

async function parseXlsx(data: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch (e) {
    throw new SpreadsheetError(`Could not read workbook: ${(e as Error).message}`);
  }
  // First worksheet that has any content.
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellToString(cell.value);
    });
    out[rowNumber - 1] = cells;
  });
  return Array.from(out, (r) => r ?? []);
}

function cellToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    // Hyperlink cells: prefer the link target over the display text.
    if ('hyperlink' in v && v.hyperlink) return String(v.hyperlink);
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('result' in v && v.result !== undefined) return cellToString(v.result as ExcelJS.CellValue);
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('error' in v) return '';
  }
  return '';
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return `Column ${s}`;
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });
}

/**
 * Columns that hold product URLs: any column with at least one Amazon-looking value;
 * falls back to columns whose header mentions url/link.
 */
export function detectUrlColumns(sheet: ParsedSheet): number[] {
  const byContent = sheet.headers
    .map((_, i) => i)
    .filter((i) => sheet.rows.some((r) => r[i] && looksLikeAmazonReference(r[i])));
  if (byContent.length) return byContent;
  if (!sheet.hasHeader) return [];
  return sheet.headers.map((h, i) => ({ h, i })).filter(({ h }) => /\b(url|link)s?\b/i.test(h)).map(({ i }) => i);
}

export interface AsinColumns {
  asin: number;
  /** Column naming the marketplace (Keepa exports call it "Locale"); null when the sheet has none. */
  locale: number | null;
}

/**
 * For sheets that list products by ASIN instead of URL, such as a Keepa export: the column
 * headed "ASIN", and the marketplace column next to it if there is one.
 */
export function detectAsinColumns(sheet: ParsedSheet): AsinColumns | null {
  if (!sheet.hasHeader) return null;
  const find = (re: RegExp) => sheet.headers.findIndex((h) => re.test(h.trim()));
  const asin = find(/^asin$/i);
  if (asin < 0 || !sheet.rows.some((r) => ASIN_RE.test((r[asin] ?? '').toUpperCase()))) return null;
  const locale = find(/^(locale|marketplace|domain)$/i);
  return { asin, locale: locale >= 0 ? locale : null };
}
