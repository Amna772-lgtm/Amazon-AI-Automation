import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export { forWorkspace, TENANT_MODELS, TenantViolationError, type TenantPrismaClient } from './tenant';

let shared: PrismaClient | undefined;

/** Process-wide Prisma client (lazy). Apps may also construct their own. */
export function getPrisma(): PrismaClient {
  if (!shared) shared = new PrismaClient();
  return shared;
}
