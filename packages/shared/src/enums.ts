// String-literal enums shared by API, worker and web. They mirror the Prisma enums
// in packages/db/prisma/schema.prisma — keep both in sync.

export const Role = { ADMIN: 'ADMIN', MANAGER: 'MANAGER', MEMBER: 'MEMBER' } as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ROLES: Role[] = ['ADMIN', 'MANAGER', 'MEMBER'];

export const JobStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
export const TERMINAL_JOB_STATUSES: JobStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

export const JobType = {
  IMPORT_FILE: 'IMPORT_FILE',
  // PRODUCT_RESEARCH is unused (Agent 1 was removed) but stays in the database enum.
  PRODUCT_RESEARCH: 'PRODUCT_RESEARCH',
  // Registered from Phase 3 onwards:
  SELLER_CONTACT_RESEARCH: 'SELLER_CONTACT_RESEARCH',
  EMAIL_OUTREACH: 'EMAIL_OUTREACH',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const FileStatus = {
  UPLOADED: 'UPLOADED',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
} as const;
export type FileStatus = (typeof FileStatus)[keyof typeof FileStatus];

export const ImportRowStatus = { VALID: 'VALID', DUPLICATE: 'DUPLICATE', INVALID: 'INVALID' } as const;
export type ImportRowStatus = (typeof ImportRowStatus)[keyof typeof ImportRowStatus];

export const LogLevel = { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' } as const;
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const IntegrationProvider = {
  KEEPA: 'KEEPA',
  AMAZON_SP_API: 'AMAZON_SP_API',
  ANTHROPIC: 'ANTHROPIC',
  OPENAI: 'OPENAI',
  SMTP: 'SMTP',
  GMAIL: 'GMAIL',
  MICROSOFT: 'MICROSOFT',
  EMAIL_VERIFIER: 'EMAIL_VERIFIER',
} as const;
export type IntegrationProvider = (typeof IntegrationProvider)[keyof typeof IntegrationProvider];
