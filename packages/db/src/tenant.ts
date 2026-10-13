import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Models whose rows belong to exactly one workspace. Queries issued through a
 * tenant-scoped client automatically filter and stamp `workspaceId` on them.
 *
 * Not included: Organization, User, RefreshToken, Workspace and Membership — those are
 * identity tables resolved *before* a tenant context exists (auth, workspace switcher).
 */
export const TENANT_MODELS = new Set<string>([
  'Invitation',
  'Project',
  'UploadedFile',
  'ImportRow',
  'Job',
  'JobLog',
  'ActivityLog',
  'Integration',
  'Export',
]);

const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantViolationError';
  }
}

function stamp(data: Record<string, unknown>, workspaceId: string, model: string) {
  if (data.workspaceId !== undefined && data.workspaceId !== workspaceId) {
    throw new TenantViolationError(`Attempt to write ${model} into another workspace`);
  }
  return { ...data, workspaceId };
}

/**
 * Returns a Prisma client whose queries on tenant models are confined to `workspaceId`.
 * Nested relation writes are not rewritten — use top-level operations for tenant data.
 */
export function forWorkspace(prisma: PrismaClient, workspaceId: string) {
  if (!workspaceId) throw new TenantViolationError('workspaceId is required');

  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as Record<string, any>;

          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), workspaceId };
          } else if (operation === 'create') {
            a.data = stamp(a.data ?? {}, workspaceId, model);
          } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const rows = Array.isArray(a.data) ? a.data : [a.data];
            a.data = rows.map((r: Record<string, unknown>) => stamp(r, workspaceId, model));
          } else if (operation === 'upsert') {
            a.where = { ...(a.where ?? {}), workspaceId };
            a.create = stamp(a.create ?? {}, workspaceId, model);
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantPrismaClient = ReturnType<typeof forWorkspace>;
export type { Prisma };
