import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { createRedisConnection, createStorageFromEnv, enqueueJob, loadEncryptionKey, QueueRegistry, type StorageDriver } from '@app/core';
import type { Job } from '@app/db';
import type { Redis } from 'ioredis';
import { APP_CONFIG, loadConfig } from '../config';
import { PrismaService } from './prisma.service';

export const STORAGE = Symbol('STORAGE');
export const ENCRYPTION_KEY = Symbol('ENCRYPTION_KEY');
const REDIS = Symbol('REDIS');

@Injectable()
export class QueueService implements OnModuleDestroy {
  readonly registry: QueueRegistry;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {
    this.registry = new QueueRegistry(redis);
  }

  enqueue(job: Job): Promise<void> {
    return enqueueJob(this.prisma, this.registry, job);
  }

  async onModuleDestroy() {
    await this.registry.close();
    await this.redis.quit().catch(() => undefined);
  }
}

/** Process-wide infrastructure: DB, Redis queues, file storage, config, encryption key. */
@Global()
@Module({
  providers: [
    PrismaService,
    QueueService,
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    { provide: REDIS, useFactory: () => createRedisConnection() },
    { provide: STORAGE, useFactory: (): StorageDriver => createStorageFromEnv() },
    { provide: ENCRYPTION_KEY, useFactory: () => loadEncryptionKey() },
  ],
  exports: [PrismaService, QueueService, APP_CONFIG, STORAGE, ENCRYPTION_KEY],
})
export class InfraModule {}
