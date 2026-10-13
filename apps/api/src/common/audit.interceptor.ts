import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AUDIT, type AuditMeta } from './decorators';
import { PrismaService } from './prisma.service';

/**
 * Writes an ActivityLog row after a successful call to any handler marked @Audit().
 * The entity id is taken from the response (`id`) or the `:id` route param.
 * Handlers can set `req.auditWorkspaceId` / `req.auditMetadata` for routes outside a tenant context.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT, ctx.getHandler());
    if (!meta) return next.handle();
    const req = ctx.switchToHttp().getRequest<Request & { auditWorkspaceId?: string; auditMetadata?: object }>();

    return next.handle().pipe(
      tap((body) => {
        const workspaceId = req.tenant?.workspaceId ?? req.auditWorkspaceId;
        if (!workspaceId) return;
        const res = body as { id?: unknown } | undefined;
        const param = req.params?.id;
        const entityId = (typeof res?.id === 'string' ? res.id : undefined) ?? (typeof param === 'string' ? param : undefined);
        this.prisma.activityLog
          .create({
            data: {
              workspaceId,
              actorId: req.user?.id,
              actorEmail: req.user?.email,
              action: meta.action,
              entityType: meta.entityType,
              entityId,
              metadata: req.auditMetadata as object | undefined,
              ip: req.ip,
            },
          })
          .catch((e) => this.logger.error(`Failed to write activity log: ${(e as Error).message}`));
      }),
    );
  }
}
