import { BadRequestException, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { JobStatus, paginationSchema } from '@app/shared';
import { z } from 'zod';
import { Audit, RequirePermission, Tenant } from '../common/decorators';
import { QueueService } from '../common/infra.module';
import type { TenantContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';

const listQuery = paginationSchema.extend({
  projectId: z.string().optional(),
  status: z.enum(Object.values(JobStatus) as [JobStatus, ...JobStatus[]]).optional(),
});

const logsQuery = z.object({ after: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(500).default(200) });

@Controller('jobs')
export class JobsController {
  constructor(private readonly queues: QueueService) {}

  @Get()
  @RequirePermission('job.read')
  async list(@Tenant() t: TenantContext, @Query(new ZodPipe(listQuery)) q: z.infer<typeof listQuery>) {
    const where = { ...(q.projectId ? { projectId: q.projectId } : {}), ...(q.status ? { status: q.status } : {}) };
    const [total, items] = await Promise.all([
      t.db.job.count({ where }),
      t.db.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { file: { select: { id: true, originalName: true } }, project: { select: { id: true, name: true } } },
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items: items.map(withPending) };
  }

  @Get(':id')
  @RequirePermission('job.read')
  async get(@Tenant() t: TenantContext, @Param('id') id: string) {
    return withPending(await t.db.job.findUniqueOrThrow({ where: { id } }));
  }

  @Get(':id/logs')
  @RequirePermission('job.read')
  async logs(@Tenant() t: TenantContext, @Param('id') id: string, @Query(new ZodPipe(logsQuery)) q: z.infer<typeof logsQuery>) {
    await t.db.job.findUniqueOrThrow({ where: { id }, select: { id: true } });
    return t.db.jobLog.findMany({
      where: { jobId: id, ...(q.after ? { createdAt: { gt: new Date(q.after) } } : {}) },
      orderBy: { createdAt: 'asc' },
      take: q.limit,
    });
  }

  /** Pause takes effect between processing chunks; the job keeps its cursor. */
  @Post(':id/pause')
  @HttpCode(200)
  @RequirePermission('job.control')
  @Audit('job.paused', 'Job')
  async pause(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.transition(t, id, ['QUEUED', 'RUNNING'], { status: 'PAUSED' });
  }

  @Post(':id/resume')
  @HttpCode(200)
  @RequirePermission('job.control')
  @Audit('job.resumed', 'Job')
  async resume(@Tenant() t: TenantContext, @Param('id') id: string) {
    return this.requeue(t, id, 'PAUSED');
  }

  /** Re-runs a failed job from its last committed cursor. */
  @Post(':id/retry')
  @HttpCode(200)
  @RequirePermission('job.control')
  @Audit('job.retried', 'Job')
  async retry(@Tenant() t: TenantContext, @Param('id') id: string) {
    const job = await t.db.job.findUniqueOrThrow({ where: { id } });
    if (job.status !== 'FAILED') throw new BadRequestException(`Only failed jobs can be retried (job is ${job.status})`);
    if (job.fileId) await t.db.uploadedFile.update({ where: { id: job.fileId }, data: { status: 'UPLOADED', error: null } });
    await t.db.job.update({ where: { id }, data: { error: null, finishedAt: null } });
    return this.requeue(t, id, 'FAILED');
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('job.control')
  @Audit('job.cancelled', 'Job')
  async cancel(@Tenant() t: TenantContext, @Param('id') id: string) {
    const job = await this.transition(t, id, ['QUEUED', 'RUNNING', 'PAUSED'], { status: 'CANCELLED', finishedAt: new Date() });
    if (job.fileId) {
      await t.db.uploadedFile.update({ where: { id: job.fileId }, data: { status: 'PROCESSED', error: 'Import cancelled by user' } });
    }
    return job;
  }

  private async transition(t: TenantContext, id: string, from: JobStatus[], data: { status: JobStatus; finishedAt?: Date }) {
    const res = await t.db.job.updateMany({ where: { id, status: { in: from } }, data });
    if (res.count === 0) {
      const job = await t.db.job.findUniqueOrThrow({ where: { id } });
      throw new BadRequestException(`Job cannot move from ${job.status} to ${data.status}`);
    }
    return withPending(await t.db.job.findUniqueOrThrow({ where: { id } }));
  }

  private async requeue(t: TenantContext, id: string, from: JobStatus) {
    const job = await t.db.job.findUniqueOrThrow({ where: { id } });
    if (job.status !== from) throw new BadRequestException(`Job cannot be re-queued from ${job.status}`);
    await this.queues.enqueue(job);
    return withPending(await t.db.job.findUniqueOrThrow({ where: { id } }));
  }
}

function withPending<T extends { total: number; processed: number }>(job: T) {
  return { ...job, pending: Math.max(0, job.total - job.processed) };
}
