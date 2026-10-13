import type { TenantPrismaClient } from '@app/db';
import type { Role } from '@app/shared';

export interface AuthUser {
  id: string;
  email: string;
}

export interface TenantContext {
  workspaceId: string;
  role: Role;
  /** Prisma client confined to this workspace — use it for all tenant data. */
  db: TenantPrismaClient;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
    tenant?: TenantContext;
  }
}
