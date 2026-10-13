import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import type { StorageDriver } from '@app/core';
import { STORAGE } from '../common/infra.module';
import { createProjectSchema, updateProjectSchema } from '@app/shared';
import { z } from 'zod';
import { Audit, CurrentUser, RequirePermission, Tenant } from '../common/decorators';
import type { AuthUser, TenantContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';

const listQuery = z.object({
  archived: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(160).optional(),
});

@Controller('projects')
export class ProjectsController {
  constructor(@Inject(STORAGE) private readonly storage: StorageDriver) {}

  @Get()
  @RequirePermission('project.read')
  async list(@Tenant() t: TenantContext, @Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    const projects = await t.db.project.findMany({
      where: {
        archived: query.archived === 'true',
        ...(query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { files: true } } },
    });
    const validCounts = await t.db.importRow.groupBy({
      by: ['projectId'],
      where: { status: 'VALID', projectId: { in: projects.map((p) => p.id) } },
      _count: { _all: true },
    });
    const byProject = new Map(validCounts.map((c) => [c.projectId, c._count._all]));
    return projects.map(({ _count, ...p }) => ({ ...p, fileCount: _count.files, validUrlCount: byProject.get(p.id) ?? 0 }));
  }

  @Post()
  @RequirePermission('project.write')
  @Audit('project.created', 'Project')
  create(
    @Tenant() t: TenantContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createProjectSchema)) body: z.infer<typeof createProjectSchema>,
  ) {
    return t.db.project.create({
      data: { workspaceId: t.workspaceId, name: body.name, description: body.description ?? null, createdById: user.id },
    });
  }

  @Get(':id')
  @RequirePermission('project.read')
  async get(@Tenant() t: TenantContext, @Param('id') id: string) {
    const project = await t.db.project.findUniqueOrThrow({ where: { id } });
    const [fileCount, rowStats, activeJobs] = await Promise.all([
      t.db.uploadedFile.count({ where: { projectId: id } }),
      t.db.importRow.groupBy({ by: ['status'], where: { projectId: id }, _count: { _all: true } }),
      t.db.job.count({ where: { projectId: id, status: { in: ['QUEUED', 'RUNNING', 'PAUSED'] } } }),
    ]);
    const stats = Object.fromEntries(rowStats.map((r) => [r.status, r._count._all]));
    return {
      ...project,
      stats: { files: fileCount, valid: stats.VALID ?? 0, duplicate: stats.DUPLICATE ?? 0, invalid: stats.INVALID ?? 0, activeJobs },
    };
  }

  @Patch(':id')
  @RequirePermission('project.write')
  @Audit('project.updated', 'Project')
  update(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodPipe(updateProjectSchema)) body: z.infer<typeof updateProjectSchema>,
  ) {
    return t.db.project.update({ where: { id }, data: body });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('project.delete')
  @Audit('project.deleted', 'Project')
  async remove(@Tenant() t: TenantContext, @Param('id') id: string) {
    const [files, exports] = await Promise.all([
      t.db.uploadedFile.findMany({ where: { projectId: id }, select: { storageKey: true } }),
      t.db.export.findMany({ where: { projectId: id }, select: { id: true, storageKey: true } }),
    ]);
    await t.db.project.delete({ where: { id } }); // cascades files, rows, jobs, logs
    await t.db.export.deleteMany({ where: { id: { in: exports.map((e) => e.id) } } });
    // Uploaded and exported files are user data: remove them from storage as well.
    await Promise.all([...files, ...exports].map((f) => this.storage.delete(f.storageKey)));
  }
}
