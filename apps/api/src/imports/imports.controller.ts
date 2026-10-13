import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { buildExport, buildStorageKey, detectSpreadsheetKind, sha256Hex, type ExportColumn, type StorageDriver } from '@app/core';
import type { ImportRow, Prisma } from '@app/db';
import { exportFormatSchema, importRowsQuerySchema, ImportRowStatus, QUEUES, type ImportRowsQuery } from '@app/shared';
import { z } from 'zod';
import { Audit, CurrentUser, RequirePermission, Tenant } from '../common/decorators';
import { QueueService, STORAGE } from '../common/infra.module';
import type { AuthUser, TenantContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;

const exportQuery = z.object({
  format: exportFormatSchema.default('xlsx'),
  status: z.enum([ImportRowStatus.VALID, ImportRowStatus.DUPLICATE, ImportRowStatus.INVALID]).optional(),
});

const filesQuery = z.object({ projectId: z.string().optional() });

@Controller()
export class ImportsController {
  constructor(
    @Inject(STORAGE) private readonly storage: StorageDriver,
    private readonly queues: QueueService,
  ) {}

  /**
   * Accepts a CSV/XLSX upload, stores it under the workspace prefix and queues the parse job.
   * Parsing runs in the worker; the response returns immediately with the file + job ids.
   */
  @Post('projects/:projectId/files')
  @RequirePermission('import.create')
  @Audit('import.uploaded', 'UploadedFile')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(
    @Tenant() t: TenantContext,
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @UploadedFile(new ParseFilePipeBuilder().build({ fileIsRequired: true })) file: Express.Multer.File,
  ) {
    const project = await t.db.project.findUniqueOrThrow({ where: { id: projectId } });
    if (project.archived) throw new BadRequestException('Project is archived');

    const originalName = file.originalname.replace(/[\\/\0]/g, '_').slice(0, 255);
    const kind = detectSpreadsheetKind(originalName, file.buffer); // throws SpreadsheetError → 400
    const storageKey = buildStorageKey(t.workspaceId, 'uploads', `${randomUUID()}.${kind}`);
    await this.storage.put(storageKey, file.buffer);

    const { uploaded, job } = await t.db.$transaction(async (tx) => {
      const uploaded = await tx.uploadedFile.create({
        data: {
          workspaceId: t.workspaceId,
          projectId,
          originalName,
          storageKey,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          sha256: sha256Hex(file.buffer),
          uploadedById: user.id,
        },
      });
      const job = await tx.job.create({
        data: {
          workspaceId: t.workspaceId,
          projectId,
          fileId: uploaded.id,
          type: 'IMPORT_FILE',
          queue: QUEUES.IMPORTS,
          createdById: user.id,
          payload: { fileId: uploaded.id },
        },
      });
      return { uploaded, job };
    });

    await this.queues.enqueue(job);
    return { ...uploaded, jobId: job.id };
  }

  @Get('files')
  @RequirePermission('import.read')
  async list(@Tenant() t: TenantContext, @Query(new ZodPipe(filesQuery)) q: z.infer<typeof filesQuery>) {
    const files = await t.db.uploadedFile.findMany({
      where: q.projectId ? { projectId: q.projectId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        project: { select: { id: true, name: true } },
        jobs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    return files.map(({ jobs, ...f }) => ({ ...f, job: jobs[0] ?? null }));
  }

  @Get('files/:id')
  @RequirePermission('import.read')
  async get(@Tenant() t: TenantContext, @Param('id') id: string) {
    const file = await t.db.uploadedFile.findUniqueOrThrow({
      where: { id },
      include: { project: { select: { id: true, name: true } }, jobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const { jobs, ...rest } = file;
    return { ...rest, job: jobs[0] ?? null };
  }

  @Get('files/:id/rows')
  @RequirePermission('import.read')
  async rows(@Tenant() t: TenantContext, @Param('id') id: string, @Query(new ZodPipe(importRowsQuerySchema)) q: ImportRowsQuery) {
    const where = rowFilter(id, q);
    const [total, items] = await Promise.all([
      t.db.importRow.count({ where }),
      t.db.importRow.findMany({
        where,
        orderBy: [{ [q.sort]: q.dir }, { rowNumber: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items };
  }

  /** Streams an export of the import results and records it under Exported Reports. */
  @Get('files/:id/export')
  @RequirePermission('export.create')
  @Audit('export.created', 'Export')
  async export(
    @Tenant() t: TenantContext,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodPipe(exportQuery)) q: z.infer<typeof exportQuery>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await t.db.uploadedFile.findUniqueOrThrow({ where: { id } });
    const rows = await t.db.importRow.findMany({
      where: { fileId: id, ...(q.status ? { status: q.status } : {}) },
      orderBy: [{ rowNumber: 'asc' }, { sourceColumn: 'asc' }],
    });

    const extraHeaders = [...new Set(rows.flatMap((r) => Object.keys((r.extra as Record<string, string>) ?? {})))];
    const columns: ExportColumn<ImportRow>[] = [
      { header: 'Row', value: (r) => r.rowNumber, width: 8 },
      { header: 'Status', value: (r) => r.status, width: 12 },
      { header: 'Marketplace', value: (r) => r.marketplace },
      { header: 'ASIN', value: (r) => r.asin },
      { header: 'Canonical URL', value: (r) => r.canonicalUrl, width: 45 },
      { header: 'Original value', value: (r) => r.rawValue, width: 60 },
      { header: 'Source column', value: (r) => r.sourceColumn },
      { header: 'Issue', value: (r) => r.errorMessage, width: 40 },
      { header: 'Duplicate of row', value: (r) => r.duplicateOfRow },
      ...extraHeaders.map((h) => ({ header: h, value: (r: ImportRow) => (r.extra as Record<string, string> | null)?.[h] })),
    ];

    const buffer = await buildExport(rows, columns, q.format, 'Import results');
    const base = file.originalName.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'import';
    const fileName = `${base}-${q.status?.toLowerCase() ?? 'all'}-${new Date().toISOString().slice(0, 10)}.${q.format}`;
    const storageKey = buildStorageKey(t.workspaceId, 'exports', `${randomUUID()}.${q.format}`);
    await this.storage.put(storageKey, buffer);
    await t.db.export.create({
      data: {
        workspaceId: t.workspaceId,
        projectId: file.projectId,
        type: 'IMPORT_ROWS',
        format: q.format,
        fileName,
        storageKey,
        rowCount: rows.length,
        filters: { fileId: id, status: q.status ?? null } as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });

    res.setHeader('Content-Type', contentType(q.format));
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }

  @Delete('files/:id')
  @HttpCode(204)
  @RequirePermission('project.write')
  @Audit('import.deleted', 'UploadedFile')
  async remove(@Tenant() t: TenantContext, @Param('id') id: string) {
    const file = await t.db.uploadedFile.findUniqueOrThrow({ where: { id } });
    await t.db.job.updateMany({
      where: { fileId: id, status: { in: ['QUEUED', 'RUNNING', 'PAUSED'] } },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
    await t.db.uploadedFile.delete({ where: { id } });
    await this.storage.delete(file.storageKey);
  }
}

export function contentType(format: 'csv' | 'xlsx'): string {
  return format === 'csv'
    ? 'text/csv; charset=utf-8'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

function rowFilter(fileId: string, q: ImportRowsQuery): Prisma.ImportRowWhereInput {
  return {
    fileId,
    ...(q.status ? { status: q.status } : {}),
    ...(q.q
      ? {
          OR: [
            { rawValue: { contains: q.q, mode: 'insensitive' } },
            { asin: { contains: q.q.toUpperCase() } },
            { errorMessage: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}
