import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { forWorkspace } from '@app/db';
import { can, WORKSPACE_HEADER, type Permission, type Role } from '@app/shared';
import { REQUIRED_PERMISSION } from './decorators';
import { PrismaService } from './prisma.service';

/**
 * Resolves the tenant for routes decorated with @RequirePermission(): verifies the user is a
 * member of the workspace in `x-workspace-id`, checks the role grants the permission, and
 * attaches a workspace-scoped Prisma client to the request.
 *
 * A workspace the user does not belong to is reported as 403 without revealing whether it exists.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!permission) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.user) return false; // JwtAuthGuard runs first; public routes cannot be tenant-scoped

    const workspaceId = req.headers[WORKSPACE_HEADER];
    if (typeof workspaceId !== 'string' || !workspaceId) {
      throw new BadRequestException(`Missing ${WORKSPACE_HEADER} header`);
    }

    const membership = await this.prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: req.user.id, workspaceId } },
      select: { role: true },
    });
    if (!membership) throw new ForbiddenException('You do not have access to this workspace');

    const role = membership.role as Role;
    if (!can(role, permission)) throw new ForbiddenException(`Your role (${role}) cannot perform this action`);

    req.tenant = { workspaceId, role, db: forWorkspace(this.prisma, workspaceId) };
    return true;
  }
}
