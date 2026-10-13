import { BadRequestException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WorkspaceGuard } from './workspace.guard';

function ctx(req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(permission: string | undefined, role: string | null) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(permission) } as unknown as Reflector;
  const prisma = {
    membership: { findUnique: jest.fn().mockResolvedValue(role ? { role } : null) },
    $extends: jest.fn().mockReturnValue({ scoped: true }),
  };
  return { guard: new WorkspaceGuard(reflector, prisma as never), prisma };
}

describe('WorkspaceGuard', () => {
  const user = { id: 'u1', email: 'a@b.c' };

  it('ignores routes without a permission requirement', async () => {
    const { guard, prisma } = makeGuard(undefined, null);
    await expect(guard.canActivate(ctx({ user, headers: {} }))).resolves.toBe(true);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('requires the workspace header', async () => {
    const { guard } = makeGuard('project.read', 'MEMBER');
    await expect(guard.canActivate(ctx({ user, headers: {} }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects users who are not members of the workspace', async () => {
    const { guard } = makeGuard('project.read', null);
    await expect(guard.canActivate(ctx({ user, headers: { 'x-workspace-id': 'w2' } }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('enforces the role permission matrix', async () => {
    const { guard } = makeGuard('project.write', 'MEMBER');
    await expect(guard.canActivate(ctx({ user, headers: { 'x-workspace-id': 'w1' } }))).rejects.toThrow(/MEMBER/);
  });

  it('attaches a tenant context for permitted members', async () => {
    const { guard, prisma } = makeGuard('project.write', 'MANAGER');
    const req: Record<string, any> = { user, headers: { 'x-workspace-id': 'w1' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(prisma.membership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_workspaceId: { userId: 'u1', workspaceId: 'w1' } } }),
    );
    expect(req.tenant).toMatchObject({ workspaceId: 'w1', role: 'MANAGER', db: { scoped: true } });
  });
});
