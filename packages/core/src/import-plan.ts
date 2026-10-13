import { ASIN_RE, MARKETPLACES, parseAmazonUrl, productKey, type ImportRowStatus } from '@app/shared';
import type { AsinColumns, ParsedSheet } from './spreadsheet';

/** One URL cell to import (a sheet row can contribute several if it has several URL columns). */
export interface ImportEntry {
  rowNumber: number;
  sourceColumn: string;
  rawValue: string;
  /** Remaining non-URL cells of the row, keyed by header — preserved for exports. */
  extra: Record<string, string>;
}

export interface ClassifiedEntry extends ImportEntry {
  status: ImportRowStatus;
  asin: string | null;
  marketplace: string | null;
  canonicalUrl: string | null;
  productKey: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  duplicateOfRow: number | null;
}

/** Where a product key was first seen: in this file (row number) or an earlier upload in the project. */
export type SeenIndex = Map<string, { rowNumber: number | null; fileName?: string }>;

export function buildImportEntries(sheet: ParsedSheet, urlColumns: number[]): ImportEntry[] {
  const urlSet = new Set(urlColumns);
  const entries: ImportEntry[] = [];

  sheet.rows.forEach((row, idx) => {
    const rowNumber = sheet.firstDataRowNumber + idx;
    const values = urlColumns.map((c) => ({ c, v: row[c] ?? '' })).filter(({ v }) => v);
    if (!values.length) return; // blank URL cells are not import candidates

    const extra: Record<string, string> = {};
    sheet.headers.forEach((h, i) => {
      if (!urlSet.has(i) && row[i]) extra[h] = row[i];
    });

    for (const { c, v } of values) {
      entries.push({ rowNumber, sourceColumn: sheet.headers[c], rawValue: v.slice(0, 2048), extra });
    }
  });
  return entries;
}

/** amazon.com when the sheet does not say which marketplace its ASINs belong to. */
export const DEFAULT_ASIN_DOMAIN = 'amazon.com';

/** "com", "co.uk", "amazon.de" or a marketplace code such as "GB" → the Amazon domain. */
function domainForLocale(value: string): string {
  const v = value.trim().toLowerCase().replace(/^(www\.)?amazon\./, '');
  if (!v) return DEFAULT_ASIN_DOMAIN;
  // An unrecognised locale is kept, so the row is reported as an unsupported marketplace instead of being assumed.
  return MARKETPLACES.find((m) => m.domain === `amazon.${v}` || m.code.toLowerCase() === v)?.domain ?? `amazon.${v}`;
}

/**
 * Entries for a sheet that lists ASINs instead of URLs. Each ASIN becomes its product URL, so
 * validation and de-duplication are the same as for URL sheets.
 */
export function buildAsinEntries(sheet: ParsedSheet, columns: AsinColumns): ImportEntry[] {
  const entries: ImportEntry[] = [];
  sheet.rows.forEach((row, idx) => {
    const value = (row[columns.asin] ?? '').trim();
    if (!value) return;
    const extra: Record<string, string> = {};
    sheet.headers.forEach((h, i) => {
      if (i !== columns.asin && row[i]) extra[h] = row[i];
    });
    const asin = value.toUpperCase();
    const domain = domainForLocale(columns.locale === null ? '' : (row[columns.locale] ?? ''));
    entries.push({
      rowNumber: sheet.firstDataRowNumber + idx,
      sourceColumn: sheet.headers[columns.asin],
      rawValue: ASIN_RE.test(asin) ? `https://www.${domain}/dp/${asin}` : value.slice(0, 2048),
      extra,
    });
  });
  return entries;
}

/**
 * Validates and de-duplicates entries in order. `seen` is mutated so it can be carried
 * across chunks (and pre-seeded with keys from earlier uploads / earlier chunks on resume).
 */
export function classifyEntries(entries: ImportEntry[], seen: SeenIndex): ClassifiedEntry[] {
  return entries.map((e) => {
    const parsed = parseAmazonUrl(e.rawValue);
    if (!parsed.ok) {
      return {
        ...e,
        status: 'INVALID',
        asin: null,
        marketplace: null,
        canonicalUrl: null,
        productKey: null,
        errorCode: parsed.reason,
        errorMessage: parsed.message,
        duplicateOfRow: null,
      };
    }

    const key = productKey(parsed.marketplace.code, parsed.asin);
    const base = {
      ...e,
      asin: parsed.asin,
      marketplace: parsed.marketplace.code,
      canonicalUrl: parsed.canonicalUrl,
      productKey: key,
    };
    const prior = seen.get(key);
    if (prior) {
      return {
        ...base,
        status: 'DUPLICATE',
        errorCode: prior.fileName ? 'DUPLICATE_IN_PROJECT' : 'DUPLICATE_IN_FILE',
        errorMessage: prior.fileName
          ? `Already imported in this project from "${prior.fileName}"`
          : `Duplicate of row ${prior.rowNumber}`,
        duplicateOfRow: prior.rowNumber,
      };
    }
    seen.set(key, { rowNumber: e.rowNumber });
    return { ...base, status: 'VALID', errorCode: null, errorMessage: null, duplicateOfRow: null };
  });
}
