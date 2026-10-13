import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { encryptJson, maskSecret, type StorageDriver } from '@app/core';
import type { IntegrationProvider, Prisma } from '@app/db';
import { paginationSchema, upsertIntegrationSchema, type UpsertIntegrationInput } from '@app/shared';
import { z } from 'zod';
import { Audit, RequirePermission, Tenant } from '../common/decorators';
import { ENCRYPTION_KEY, STORAGE } from '../common/infra.module';
import type { TenantContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';
import { contentType } from '../imports/imports.controller';

const activityQuery = paginationSchema.extend({
  action: z.string().max(80).optional(),
  entityType: z.string().max(80).optional(),
});

const clearActivityQuery = z.object({ action: z.string().max(80).optional() });

/** Workspace-level read models: overview stats, activity log, exported reports, integrations. */
@Controller()
export class WorkspaceDataController {
  constructor(
    @Inject(STORAGE) private readonly storage: StorageDriver,
    @Inject(ENCRYPTION_KEY) private readonly encryptionKey: Buffer,
  ) {}

  @Get('overview')
  @RequirePermission('workspace.read')
  async overview(@Tenant() t: TenantContext) {
    const [projects, files, rowStats, jobStats, recentJobs] = await Promise.all([
      t.db.project.count({ where: { archived: false } }),
      t.db.uploadedFile.count(),
      t.db.importRow.groupBy({ by: ['status'], _count: { _all: true } }),
      t.db.job.groupBy({ by: ['status'], _count: { _all: true } }),
      t.db.job.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { file: { select: { id: true, originalName: true } }, project: { select: { id: true, name: true } } },
      }),
    ]);
    const rows = Object.fromEntries(rowStats.map((r) => [r.status, r._count._all]));
    const jobs = Object.fromEntries(jobStats.map((r) => [r.status, r._count._all]));
    return {
      projects,
      files,
      urls: { valid: rows.VALID ?? 0, duplicate: rows.DUPLICATE ?? 0, invalid: rows.INVALID ?? 0 },
      jobs: {
        queued: jobs.QUEUED ?? 0,
        running: jobs.RUNNING ?? 0,
        paused: jobs.PAUSED ?? 0,
        completed: jobs.COMPLETED ?? 0,
        failed: jobs.FAILED ?? 0,
      },
      recentJobs: recentJobs.map((j) => ({ ...j, pending: Math.max(0, j.total - j.processed) })),
    };
  }

  @Get('activity')
  @RequirePermission('activity.read')
  async activity(@Tenant() t: TenantContext, @Query(new ZodPipe(activityQuery)) q: z.infer<typeof activityQuery>) {
    const where: Prisma.ActivityLogWhereInput = {
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
    };
    const [total, items] = await Promise.all([
      t.db.activityLog.count({ where }),
      t.db.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items };
  }

  /**
   * Deletes this workspace's activity log entries — all of them, or only those matching the
   * same `action` filter the list uses. The clearing itself is logged, so the log records who did it.
   */
  @Delete('activity')
  @RequirePermission('activity.delete')
  @Audit('activity.cleared', 'Workspace')
  async clearActivity(
    @Tenant() t: TenantContext,
    @Query(new ZodPipe(clearActivityQuery)) q: z.infer<typeof clearActivityQuery>,
    @Req() req: Request & { auditMetadata?: object },
  ) {
    const { count } = await t.db.activityLog.deleteMany({ where: q.action ? { action: { startsWith: q.action } } : {} });
    req.auditMetadata = { count, filter: q.action ?? null };
    return { deleted: count };
  }

  // ---- Exported reports ------------------------------------------------------

  @Get('exports')
  @RequirePermission('import.read')
  exports(@Tenant() t: TenantContext) {
    return t.db.export.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, type: true, format: true, fileName: true, rowCount: true, projectId: true, createdAt: true, filters: true },
    });
  }

  @Get('exports/:id/download')
  @RequirePermission('import.read')
  async download(@Tenant() t: TenantContext, @Param('id') id: string, @Res() res: Response) {
    const exp = await t.db.export.findUniqueOrThrow({ where: { id } });
    res.setHeader('Content-Type', contentType(exp.format as 'csv' | 'xlsx'));
    res.setHeader('Content-Disposition', `attachment; filename="${exp.fileName}"`);
    (await this.storage.stream(exp.storageKey)).pipe(res);
  }

  // ---- Integrations (credentials are write-only) ----------------------------

  @Get('integrations')
  @RequirePermission('integrations.read')
  integrations(@Tenant() t: TenantContext) {
    return t.db.integration.findMany({
      orderBy: { provider: 'asc' },
      select: { id: true, provider: true, label: true, credentialHints: true, config: true, enabled: true, updatedAt: true },
    });
  }

  @Put('integrations')
  @RequirePermission('integrations.manage')
  @Audit('integration.saved', 'Integration')
  async upsertIntegration(@Tenant() t: TenantContext, @Body(new ZodPipe(upsertIntegrationSchema)) body: UpsertIntegrationInput) {
    const provider = body.provider as IntegrationProvider;
    const encryptedCredentials = encryptJson(body.credentials, this.encryptionKey);
    const credentialHints = Object.fromEntries(Object.entries(body.credentials).map(([k, v]) => [k, maskSecret(v)]));
    const data = {
      label: body.label ?? null,
      encryptedCredentials,
      credentialHints,
      config: (body.config ?? {}) as Prisma.InputJsonValue,
      enabled: body.enabled,
    };
    const saved = await t.db.integration.upsert({
      where: { workspaceId_provider: { workspaceId: t.workspaceId, provider } },
      create: { workspaceId: t.workspaceId, provider, ...data },
      update: data,
    });
    const { encryptedCredentials: _omit, ...safe } = saved;
    return safe;
  }

  @Delete('integrations/:id')
  @HttpCode(204)
  @RequirePermission('integrations.manage')
  @Audit('integration.deleted', 'Integration')
  async deleteIntegration(@Tenant() t: TenantContext, @Param('id') id: string) {
    await t.db.integration.delete({ where: { id } });
  }
}
