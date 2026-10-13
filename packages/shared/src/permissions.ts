import type { Role } from './enums';

/**
 * Role → permission matrix. The API enforces it with @RequirePermission(),
 * the web app uses it only to hide controls the user cannot use.
 */
export const PERMISSIONS = {
  'workspace.read': ['ADMIN', 'MANAGER', 'MEMBER'],
  'workspace.manage': ['ADMIN'],
  'members.read': ['ADMIN', 'MANAGER', 'MEMBER'],
  'members.manage': ['ADMIN'],
  'integrations.read': ['ADMIN', 'MANAGER'],
  'integrations.manage': ['ADMIN'],
  'project.read': ['ADMIN', 'MANAGER', 'MEMBER'],
  'project.write': ['ADMIN', 'MANAGER'],
  'project.delete': ['ADMIN'],
  'import.create': ['ADMIN', 'MANAGER', 'MEMBER'],
  'import.read': ['ADMIN', 'MANAGER', 'MEMBER'],
  'job.read': ['ADMIN', 'MANAGER', 'MEMBER'],
  'job.control': ['ADMIN', 'MANAGER'],
  'export.create': ['ADMIN', 'MANAGER', 'MEMBER'],
  'activity.read': ['ADMIN', 'MANAGER'],
  'activity.delete': ['ADMIN'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
