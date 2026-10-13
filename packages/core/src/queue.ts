import { Queue, type JobsOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import type { Job, PrismaClient } from '@app/db';
import type { QueueName } from '@app/shared';

export interface QueueJobData {
  /** Id of the Job row — the database row is the source of truth, the queue only carries the pointer. */
  jobId: string;
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

export function createRedisConnection(url = process.env.REDIS_URL ?? 'redis://localhost:6379'): Redis {
  // maxRetriesPerRequest must be null for BullMQ blocking connections.
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export class QueueRegistry {
  private readonly queues = new Map<string, Queue<QueueJobData>>();

  constructor(private readonly connection: Redis) {}

  get(name: QueueName | string): Queue<QueueJobData> {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue<QueueJobData>(name, { connection: this.connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
      this.queues.set(name, q);
    }
    return q;
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}

/**
 * Pushes a Job row onto its queue. Each (re-)enqueue gets a distinct BullMQ id
 * (`<jobId>-<runCount>`) so resumed jobs are not rejected as duplicates.
 */
export async function enqueueJob(prisma: PrismaClient, queues: QueueRegistry, job: Job): Promise<void> {
  const updated = await prisma.job.update({
    where: { id: job.id },
    data: { runCount: { increment: 1 }, status: 'QUEUED' },
  });
  const delay = job.scheduledFor ? Math.max(0, job.scheduledFor.getTime() - Date.now()) : 0;
  await queues.get(job.queue).add(job.type, { jobId: job.id }, { jobId: `${job.id}-${updated.runCount}`, delay });
}
