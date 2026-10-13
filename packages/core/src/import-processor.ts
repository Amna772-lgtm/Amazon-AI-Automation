import { forWorkspace, type Prisma, type PrismaClient } from '@app/db';
import { buildAsinEntries, buildImportEntries, classifyEntries, DEFAULT_ASIN_DOMAIN, type SeenIndex } from './import-plan';
import { createJobLogger } from './job-log';
import { detectAsinColumns, detectSpreadsheetKind, detectUrlColumns, parseSpreadsheet, SpreadsheetError } from './spreadsheet';
import type { StorageDriver } from './storage';

export interface ImportProcessorDeps {
  prisma: PrismaClient;
  storage: StorageDriver;
  chunkSize?: number;
  /** Called after each committed chunk (the worker forwards it to BullMQ progress). */
  onProgress?: (processed: number, total: number) => Promise<void> | void;
}

export type ImportRunOutcome = 'completed' | 'paused' | 'cancelled' | 'skipped' | 'failed';

/** Errors that retrying cannot fix (bad file) — the job fails immediately instead of retrying. */
export class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableJobError';
  }
}

/**
 * Parses an uploaded file into ImportRow records.
 *
 * Resumable and retry-safe: rows are written in chunks, each chunk commits together with the
 * job's `processed` cursor, and a re-run continues from the cursor. Pause/cancel requests are
 * observed between chunks.
 */
export async function runImportJob(deps: ImportProcessorDeps, jobId: string): Promise<ImportRunOutcome> {
  const { prisma, storage } = deps;
  const chunkSize = deps.chunkSize ?? Number(process.env.IMPORT_CHUNK_SIZE ?? 200);

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || !job.fileId) return 'skipped';
  if (job.status === 'COMPLETED' || job.status === 'CANCELLED' || job.status === 'FAILED') return 'skipped';
  if (job.status === 'PAUSED') return 'paused';

  const db = forWorkspace(prisma, job.workspaceId);
  const log = createJobLogger(prisma, job);
  const file = await db.uploadedFile.findUniqueOrThrow({ where: { id: job.fileId } });

  // Conditional transition so a pause/cancel issued meanwhile is not overwritten.
  const claimed = await db.job.updateMany({
    where: { id: job.id, status: { in: ['QUEUED', 'RUNNING'] } },
    data: { status: 'RUNNING', startedAt: job.startedAt ?? new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return 'skipped';
  await db.uploadedFile.update({ where: { id: file.id }, data: { status: 'PROCESSING', error: null } });
  await log.info(job.processed > 0 ? `Resuming import at entry ${job.processed}` : `Import started for "${file.originalName}"`);

  let entries;
  try {
    const data = await storage.get(file.storageKey);
    const kind = detectSpreadsheetKind(file.originalName, data);
    const sheet = await parseSpreadsheet(data, kind);
    const urlColumns = detectUrlColumns(sheet);
    // Sheets without URLs (e.g. a Keepa export) are read by their ASIN column instead.
    const asinColumns = urlColumns.length ? null : detectAsinColumns(sheet);
    if (!urlColumns.length && !asinColumns) throw new SpreadsheetError('No column with Amazon product URLs or ASINs was found');
    entries = asinColumns ? buildAsinEntries(sheet, asinColumns) : buildImportEntries(sheet, urlColumns);

    const urlColumnNames = asinColumns ? [sheet.headers[asinColumns.asin]] : urlColumns.map((i) => sheet.headers[i]);
    await db.uploadedFile.update({
      where: { id: file.id },
      data: { urlColumns: urlColumnNames, totalRows: sheet.rows.length },
    });
    await db.job.update({ where: { id: job.id }, data: { total: entries.length } });
    if (job.processed === 0 && asinColumns) {
      const marketplace =
        asinColumns.locale === null
          ? `no marketplace column, so ${DEFAULT_ASIN_DOMAIN} is assumed`
          : `marketplace from column "${sheet.headers[asinColumns.locale]}"`;
      await log.info(`No URL column found — read ${entries.length} ASIN(s) from column "${urlColumnNames[0]}" (${marketplace})`, {
        dataRows: sheet.rows.length,
      });
    } else if (job.processed === 0) {
      await log.info(`Detected ${entries.length} URL value(s) in column(s): ${urlColumnNames.join(', ')}`, {
        dataRows: sheet.rows.length,
        hasHeader: sheet.hasHeader,
      });
    }
  } catch (e) {
    if (e instanceof SpreadsheetError) throw new NonRetryableJobError(e.message);
    throw e;
  }

  const seen = await buildSeenIndex(prisma, job.workspaceId, file.projectId, file.id);
  let processed = Math.min(job.processed, entries.length);
  // Rebuild in-file dedupe state for entries committed before a pause/retry.
  classifyEntries(entries.slice(0, processed), seen);

  while (processed < entries.length) {
    const current = await db.job.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } });
    if (current.status === 'PAUSED') {
      await log.info(`Paused at ${processed}/${entries.length}`);
      return 'paused';
    }
    if (current.status === 'CANCELLED') {
      await finishFile(db, file.id, 'PROCESSED');
      await log.warn(`Cancelled at ${processed}/${entries.length}`);
      return 'cancelled';
    }

    const chunk = classifyEntries(entries.slice(processed, processed + chunkSize), seen);
    const counts = { VALID: 0, DUPLICATE: 0, INVALID: 0 };
    for (const c of chunk) counts[c.status]++;

    await prisma.$transaction([
      prisma.importRow.createMany({
        data: chunk.map((c) => ({
          workspaceId: job.workspaceId,
          projectId: file.projectId,
          fileId: file.id,
          rowNumber: c.rowNumber,
          sourceColumn: c.sourceColumn,
          rawValue: c.rawValue,
          status: c.status,
          asin: c.asin,
          marketplace: c.marketplace,
          canonicalUrl: c.canonicalUrl,
          productKey: c.productKey,
          errorCode: c.errorCode,
          errorMessage: c.errorMessage,
          duplicateOfRow: c.duplicateOfRow,
          extra: Object.keys(c.extra).length ? (c.extra as Prisma.InputJsonValue) : undefined,
        })),
        skipDuplicates: true,
      }),
      prisma.job.update({
        where: { id: job.id },
        data: { processed: { increment: chunk.length }, cursor: { processed: processed + chunk.length } },
      }),
      prisma.uploadedFile.update({
        where: { id: file.id },
        data: {
          validCount: { increment: counts.VALID },
          duplicateCount: { increment: counts.DUPLICATE },
          invalidCount: { increment: counts.INVALID },
        },
      }),
    ]);
    processed += chunk.length;
    await deps.onProgress?.(processed, entries.length);
  }

  const summary = await db.uploadedFile.findUniqueOrThrow({
    where: { id: file.id },
    select: { validCount: true, duplicateCount: true, invalidCount: true },
  });
  await db.job.update({
    where: { id: job.id },
    data: { status: 'COMPLETED', finishedAt: new Date(), result: summary, error: null },
  });
  await finishFile(db, file.id, 'PROCESSED');
  await log.info(
    `Import completed: ${summary.validCount} valid, ${summary.duplicateCount} duplicate, ${summary.invalidCount} invalid`,
    summary,
  );
  return 'completed';
}

/** Marks a job permanently failed (called once retries are exhausted or the error is non-retryable). */
export async function markImportJobFailed(prisma: PrismaClient, jobId: string, error: string): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return;
  const db = forWorkspace(prisma, job.workspaceId);
  await db.job.update({ where: { id: jobId }, data: { status: 'FAILED', error, finishedAt: new Date() } });
  if (job.fileId) await db.uploadedFile.update({ where: { id: job.fileId }, data: { status: 'FAILED', error } });
  await createJobLogger(prisma, job).error(`Job failed: ${error}`);
}

async function finishFile(db: ReturnType<typeof forWorkspace>, fileId: string, status: 'PROCESSED' | 'FAILED') {
  await db.uploadedFile.update({ where: { id: fileId }, data: { status } });
}

/** Product keys already imported as VALID in *other* files of the same project. */
async function buildSeenIndex(
  prisma: PrismaClient,
  workspaceId: string,
  projectId: string,
  fileId: string,
): Promise<SeenIndex> {
  const db = forWorkspace(prisma, workspaceId);
  const prior = await db.importRow.findMany({
    where: { projectId, status: 'VALID', fileId: { not: fileId } },
    select: { productKey: true, rowNumber: true, file: { select: { originalName: true } } },
  });
  const seen: SeenIndex = new Map();
  for (const r of prior) {
    if (r.productKey && !seen.has(r.productKey)) {
      seen.set(r.productKey, { rowNumber: r.rowNumber, fileName: r.file.originalName });
    }
  }
  return seen;
}
