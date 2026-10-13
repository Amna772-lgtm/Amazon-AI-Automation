import { UnrecoverableError, Worker, type Job as BullJob } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '@app/db';
import { QUEUES } from '@app/shared';
import { markImportJobFailed, NonRetryableJobError, runImportJob } from './import-processor';
import type { QueueJobData } from './queue';
import type { StorageDriver } from './storage';

export interface WorkerDeps {
  prisma: PrismaClient;
  storage: StorageDriver;
  connection: Redis;
  concurrency?: number;
  /** Max jobs started per minute on this queue (BullMQ limiter). */
  ratePerMinute?: number;
  chunkSize?: number;
  logger?: Pick<Console, 'info' | 'error'>;
}

/**
 * Worker for the imports queue. Retries transient failures with the queue's backoff policy;
 * bad-file errors fail immediately. The DB Job row is marked FAILED only when no retry remains.
 */
export function createImportWorker(deps: WorkerDeps): Worker<QueueJobData> {
  const log = deps.logger ?? console;

  const worker = new Worker<QueueJobData>(
    QUEUES.IMPORTS,
    async (job: BullJob<QueueJobData>) => {
      try {
        const outcome = await runImportJob(
          {
            prisma: deps.prisma,
            storage: deps.storage,
            chunkSize: deps.chunkSize,
            onProgress: (processed, total) => job.updateProgress({ processed, total }),
          },
          job.data.jobId,
        );
        log.info(`[imports] job ${job.data.jobId} → ${outcome}`);
        return { outcome };
      } catch (e) {
        if (e instanceof NonRetryableJobError) throw new UnrecoverableError(e.message);
        throw e;
      }
    },
    {
      connection: deps.connection,
      concurrency: deps.concurrency ?? 4,
      limiter: deps.ratePerMinute ? { max: deps.ratePerMinute, duration: 60_000 } : undefined,
    },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    const exhausted = err instanceof UnrecoverableError || err.name === 'UnrecoverableError' || job.attemptsMade >= attempts;
    log.error(`[imports] job ${job.data.jobId} attempt ${job.attemptsMade}/${attempts} failed: ${err.message}`);
    if (exhausted) {
      await markImportJobFailed(deps.prisma, job.data.jobId, err.message).catch((e) =>
        log.error(`[imports] could not mark job failed: ${(e as Error).message}`),
      );
    }
  });

  return worker;
}
