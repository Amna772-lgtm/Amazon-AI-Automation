import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';

/**
 * Object storage abstraction. Phase 1 ships the local-disk driver; an S3-compatible
 * driver implements the same interface for production deployments.
 * Keys always start with the workspace id so tenant data never shares a prefix.
 */
export interface StorageDriver {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<Readable>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function buildStorageKey(workspaceId: string, ...segments: string[]): string {
  const parts = [workspaceId, ...segments];
  for (const p of parts) {
    if (!SAFE_SEGMENT.test(p) || p === '.' || p === '..') throw new Error(`Unsafe storage key segment: ${p}`);
  }
  return parts.join('/');
}

export class LocalDiskStorage implements StorageDriver {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Storage key escapes storage root');
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async stream(key: string): Promise<Readable> {
    const full = this.resolve(key);
    await stat(full);
    return createReadStream(full);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

/** Monorepo root (packages/core/dist → ../../..), so relative paths resolve the same for api and worker. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export function createStorageFromEnv(): StorageDriver {
  const dir = process.env.STORAGE_DIR ?? './storage';
  return new LocalDiskStorage(path.isAbsolute(dir) ? dir : path.resolve(REPO_ROOT, dir));
}
