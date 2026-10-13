import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@app/shared';
import type { AuthUser, TenantContext } from './types';

export const IS_PUBLIC = 'isPublic';
export const REQUIRED_PERMISSION = 'requiredPermission';
export const AUDIT = 'audit';

/** Skips JWT authentication (login, register, refresh, invitation preview). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * Marks a route as tenant-scoped: the request must carry `x-workspace-id` for a workspace
 * the user belongs to, and the user's role there must grant `permission`.
 */
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);

export interface AuditMeta {
  action: string;
  entityType?: string;
}

/** Records a successful call of the handler in the workspace activity log. */
export const Audit = (action: string, entityType?: string) => SetMetadata(AUDIT, { action, entityType } satisfies AuditMeta);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const tenant = ctx.switchToHttp().getRequest().tenant;
  if (!tenant) throw new Error('@Tenant() used on a route without @RequirePermission()');
  return tenant;
});
