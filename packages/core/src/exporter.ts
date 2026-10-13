import ExcelJS from 'exceljs';
import Papa from 'papaparse';

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | Date | null | undefined;
  width?: number;
}

/**
 * Neutralises spreadsheet formula injection (CWE-1236): cells starting with = + - @ or
 * control characters are prefixed with an apostrophe so Excel treats them as text.
 */
export function sanitizeCell(value: unknown): string | number | boolean | Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) return value;
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export async function buildExport<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  format: 'csv' | 'xlsx',
  sheetName = 'Export',
): Promise<Buffer> {
  if (format === 'csv') {
    const data = rows.map((r) =>
      columns.map((c) => {
        const v = sanitizeCell(c.value(r));
        return v instanceof Date ? v.toISOString() : v ?? '';
      }),
    );
    // BOM so Excel opens UTF-8 CSVs correctly.
    return Buffer.from('﻿' + Papa.unparse({ fields: columns.map((c) => c.header), data }), 'utf8');
  }

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width ?? Math.max(12, c.header.length + 2) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of rows) ws.addRow(columns.map((c) => sanitizeCell(c.value(r))));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
