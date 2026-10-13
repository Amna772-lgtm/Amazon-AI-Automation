import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { randomToken, sha256Hex } from '@app/core';
import {
  acceptInviteSchema,
  createWorkspaceSchema,
  inviteMemberSchema,
  updateMemberSchema,
  updateWorkspaceSchema,
  type Role,
} from '@app/shared';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../config';
import { Audit, CurrentUser, Public, RequirePermission, Tenant } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import type { AuthUser, TenantContext } from '../common/types';
import { ZodPipe } from '../common/zod.pipe';

type AuditReq = Request & { auditWorkspaceId?: string; auditMetadata?: object };

@Controller()
export class WorkspacesController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Workspaces the current user belongs to (for the workspace switcher). */
  @Get('workspaces')
  async mine(@CurrentUser() user: AuthUser) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id },
      include: { workspace: { select: { id: true, name: true, organizationId: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({ ...m.workspace, role: m.role }));
  }

  /** Creates another workspace in the current workspace's organization; creator becomes ADMIN. */
  @Post('workspaces')
  @RequirePermission('workspace.manage')
  @Audit('workspace.created', 'Workspace')
  async create(
    @Tenant() t: TenantContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(createWorkspaceSchema)) body: z.infer<typeof createWorkspaceSchema>,
  ) {
    const current = await this.prisma.workspace.findUniqueOrThrow({ where: { id: t.workspaceId } });
    return this.prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({ data: { name: body.name, organizationId: current.organizationId } });
      await tx.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: 'ADMIN' } });
      return { ...ws, role: 'ADMIN' as Role };
    });
  }

  @Get('workspace')
  @RequirePermission('workspace.read')
  async current(@Tenant() t: TenantContext) {
    const ws = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: t.workspaceId },
      include: { organization: { select: { id: true, name: true } } },
    });
    return { ...ws, role: t.role };
  }

  @Patch('workspace')
  @RequirePermission('workspace.manage')
  @Audit('workspace.updated', 'Workspace')
  update(@Tenant() t: TenantContext, @Body(new ZodPipe(updateWorkspaceSchema)) body: z.infer<typeof updateWorkspaceSchema>) {
    return this.prisma.workspace.update({ where: { id: t.workspaceId }, data: body });
  }

  // ---- Members -------------------------------------------------------------

  @Get('workspace/members')
  @RequirePermission('members.read')
  async members(@Tenant() t: TenantContext) {
    const rows = await this.prisma.membership.findMany({
      where: { workspaceId: t.workspaceId },
      include: { user: { select: { id: true, email: true, name: true, lastLoginAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({ id: m.id, role: m.role, createdAt: m.createdAt, user: m.user }));
  }

  @Patch('workspace/members/:id')
  @RequirePermission('members.manage')
  @Audit('member.role_changed', 'Membership')
  async updateMember(
    @Tenant() t: TenantContext,
    @Param('id') id: string,
    @Body(new ZodPipe(updateMemberSchema)) body: z.infer<typeof updateMemberSchema>,
  ) {
    const m = await this.findMembership(t.workspaceId, id);
    if (m.role === 'ADMIN' && body.role !== 'ADMIN') await this.assertNotLastAdmin(t.workspaceId);
    return this.prisma.membership.update({ where: { id: m.id }, data: { role: body.role as Role } });
  }

  @Delete('workspace/members/:id')
  @HttpCode(204)
  @RequirePermission('members.manage')
  @Audit('member.removed', 'Membership')
  async removeMember(@Tenant() t: TenantContext, @Param('id') id: string) {
    const m = await this.findMembership(t.workspaceId, id);
    if (m.role === 'ADMIN') await this.assertNotLastAdmin(t.workspaceId);
    await this.prisma.membership.delete({ where: { id: m.id } });
  }

  // ---- Invitations ---------------------------------------------------------

  @Get('workspace/invitations')
  @RequirePermission('members.manage')
  invitations(@Tenant() t: TenantContext) {
    return t.db.invitation.findMany({
      where: { acceptedAt: null },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Creates an invitation and returns the one-time token. Phase 1 has no outbound email:
   * the admin copies the link; Phase 4's email integration will send it.
   */
  @Post('workspace/invitations')
  @RequirePermission('members.manage')
  @Audit('member.invited', 'Invitation')
  async invite(
    @Tenant() t: TenantContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(inviteMemberSchema)) body: z.infer<typeof inviteMemberSchema>,
  ) {
    const existingMember = await this.prisma.membership.findFirst({
      where: { workspaceId: t.workspaceId, user: { email: body.email } },
    });
    if (existingMember) throw new BadRequestException('This person is already a member');

    const token = randomToken(32);
    const invitation = await t.db.invitation.create({
      data: {
        workspaceId: t.workspaceId,
        email: body.email,
        role: body.role as Role,
        tokenHash: sha256Hex(token),
        invitedById: user.id,
        expiresAt: new Date(Date.now() + this.config.INVITE_TTL_DAYS * 86_400_000),
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });
    return { ...invitation, token, inviteUrl: `${this.config.WEB_ORIGIN}/invite/${token}` };
  }

  @Delete('workspace/invitations/:id')
  @HttpCode(204)
  @RequirePermission('members.manage')
  @Audit('member.invite_revoked', 'Invitation')
  async revokeInvite(@Tenant() t: TenantContext, @Param('id') id: string) {
    await t.db.invitation.delete({ where: { id } });
  }

  /** Public preview so the invite page can show which workspace the link is for. */
  @Public()
  @Get('invitations/:token')
  async previewInvite(@Param('token') token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { workspace: { select: { name: true } } },
    });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new NotFoundException('Invitation is invalid or has expired');
    return { email: inv.email, role: inv.role, workspaceName: inv.workspace.name, expiresAt: inv.expiresAt };
  }

  @Post('invitations/accept')
  @Audit('member.joined', 'Membership')
  async accept(
    @CurrentUser() user: AuthUser,
    @Req() req: AuditReq,
    @Body(new ZodPipe(acceptInviteSchema)) body: z.infer<typeof acceptInviteSchema>,
  ) {
    const inv = await this.prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(body.token) } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new BadRequestException('Invitation is invalid or has expired');
    if (inv.email !== user.email) throw new ForbiddenException('This invitation was issued for a different email address');

    const membership = await this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
      return tx.membership.upsert({
        where: { userId_workspaceId: { userId: user.id, workspaceId: inv.workspaceId } },
        create: { userId: user.id, workspaceId: inv.workspaceId, role: inv.role },
        update: {},
      });
    });
    req.auditWorkspaceId = inv.workspaceId;
    return membership;
  }

  private async findMembership(workspaceId: string, id: string) {
    const m = await this.prisma.membership.findFirst({ where: { id, workspaceId } });
    if (!m) throw new NotFoundException('Member not found');
    return m;
  }

  private async assertNotLastAdmin(workspaceId: string) {
    const admins = await this.prisma.membership.count({ where: { workspaceId, role: 'ADMIN' } });
    if (admins <= 1) throw new BadRequestException('A workspace must keep at least one admin');
  }
}
