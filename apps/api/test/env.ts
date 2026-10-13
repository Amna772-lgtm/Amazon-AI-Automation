import os from 'node:os';
import path from 'node:path';

// Isolated test environment — never touches the development database or queues.
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://app:app@localhost:5432/amz_saas_test?schema=public',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-123',
  JWT_ACCESS_TTL: '15m',
  ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
  STORAGE_DIR: path.join(os.tmpdir(), 'amz-saas-e2e-storage'),
  WEB_ORIGIN: 'http://localhost:3000',
  API_RATE_LIMIT_PER_MIN: '10000',
});
