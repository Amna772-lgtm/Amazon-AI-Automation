import { createImportWorker, createRedisConnection, createStorageFromEnv, loadRootEnv } from '@app/core';
loadRootEnv();

import { PrismaClient } from '@app/db';

/**
 * Background worker process: the import queue (Phase 1). Seller-contact and email-outreach
 * agent queues are added in Phases 3–4.
 */
async function main() {
  const prisma = new PrismaClient();
  const connection = createRedisConnection();
  const storage = createStorageFromEnv();

  const workers = [
    createImportWorker({
      prisma,
      storage,
      connection,
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
      ratePerMinute: Number(process.env.QUEUE_RATE_LIMIT_PER_MIN ?? 120),
      chunkSize: Number(process.env.IMPORT_CHUNK_SIZE ?? 200),
    }),
  ];
  console.info(`Worker started: ${workers.map((w) => w.name).join(', ')}`);

  const shutdown = async (signal: string) => {
    console.info(`${signal} received — draining workers…`);
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
