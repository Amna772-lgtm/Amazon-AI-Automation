import type { FileStatus, ImportRowStatus, JobStatus, Role } from '@app/shared';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  organizationId: string;
  role: Role;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  fileCount?: number;
  validUrlCount?: number;
  stats?: { files: number; valid: number; duplicate: number; invalid: number; activeJobs: number };
}

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  total: number;
  processed: number;
  failed: number;
  pending: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  fileId: string | null;
  projectId: string | null;
  file?: { id: string; originalName: string } | null;
  project?: { id: string; name: string } | null;
}

export interface UploadedFile {
  id: string;
  projectId: string;
  originalName: string;
  sizeBytes: number;
  status: FileStatus;
  urlColumns: string[];
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  invalidCount: number;
  error: string | null;
  createdAt: string;
  project?: { id: string; name: string };
  job: Job | null;
}

export interface ImportRow {
  id: string;
  rowNumber: number;
  sourceColumn: string | null;
  rawValue: string;
  status: ImportRowStatus;
  asin: string | null;
  marketplace: string | null;
  canonicalUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  duplicateOfRow: number | null;
}

export interface Paged<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface JobLog {
  id: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorEmail: string | null;
  ip: string | null;
  createdAt: string;
}

export interface Member {
  id: string;
  role: Role;
  createdAt: string;
  user: { id: string; email: string; name: string; lastLoginAt: string | null };
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export interface ExportRecord {
  id: string;
  type: string;
  format: string;
  fileName: string;
  rowCount: number;
  createdAt: string;
}

export interface IntegrationRecord {
  id: string;
  provider: string;
  label: string | null;
  credentialHints: Record<string, string>;
  enabled: boolean;
  updatedAt: string;
}

