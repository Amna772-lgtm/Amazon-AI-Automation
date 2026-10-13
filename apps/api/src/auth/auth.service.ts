import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { randomToken, sha256Hex } from '@app/core';
import type { LoginInput, RegisterInput } from '@app/shared';
import { APP_CONFIG, type AppConfig } from '../config';
import { PrismaService } from '../common/prisma.service';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/** Window in which re-presenting a just-rotated refresh token is treated as a benign race. */
const REUSE_GRACE_MS = 30_000;

@Injectable()
export class AuthService {
  /** Verified against for unknown emails so login timing does not reveal which accounts exist. */
  private readonly dummyHash = hash(randomToken(16));

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async register(input: RegisterInput, userAgent?: string) {
    const exists = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (exists) throw new ConflictException('An account with this email already exists');

    const passwordHash = await hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash } });

      if (input.inviteToken) {
        const invite = await tx.invitation.findUnique({ where: { tokenHash: sha256Hex(input.inviteToken) } });
        if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
          throw new BadRequestException('Invitation is invalid or has expired');
        }
        if (invite.email !== input.email) throw new BadRequestException('Invitation was issued for a different email');
        await tx.membership.create({ data: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role } });
        await tx.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      } else {
        const org = await tx.organization.create({ data: { name: input.organizationName ?? `${input.name}'s organization` } });
        const ws = await tx.workspace.create({ data: { name: 'Main workspace', organizationId: org.id } });
        await tx.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: 'ADMIN' } });
      }
      return user;
    });

    return { user: this.publicUser(user), tokens: await this.issueSession(user.id, user.email, userAgent) };
  }

  async login(input: LoginInput, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const ok = await verify(user?.passwordHash ?? (await this.dummyHash), input.password).catch(() => false);
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user: this.publicUser(user), tokens: await this.issueSession(user.id, user.email, userAgent) };
  }

  /**
   * Rotates a refresh token. Presenting an already-rotated token is treated as theft:
   * every session of that user is revoked.
   */
  async refresh(rawToken: string | undefined, userAgent?: string) {
    if (!rawToken) throw new UnauthorizedException('No session');
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(rawToken) },
      include: { user: true },
    });
    if (!record) throw new UnauthorizedException('Invalid session');
    if (record.revokedAt && Date.now() - record.revokedAt.getTime() < REUSE_GRACE_MS && record.replacedBy) {
      // Concurrent refresh (two tabs / strict-mode double effects): the browser already holds
      // the replacement cookie, so reject this call without treating it as token theft.
      throw new UnauthorizedException('Session was just rotated — retry');
    }
    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session reuse detected — please log in again');
    }
    if (record.expiresAt < new Date()) throw new UnauthorizedException('Session expired');

    const tokens = await this.issueSession(record.userId, record.user.email, userAgent);
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedBy: sha256Hex(tokens.refreshToken) },
    });
    return { user: this.publicUser(record.user), tokens };
  }

  async logout(rawToken: string | undefined) {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256Hex(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        memberships: {
          include: { workspace: { select: { id: true, name: true, organizationId: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      user: this.publicUser(user),
      workspaces: user.memberships.map((m) => ({ ...m.workspace, role: m.role })),
    };
  }

  private async issueSession(userId: string, email: string, userAgent?: string): Promise<SessionTokens> {
    const accessToken = await this.jwt.signAsync({ sub: userId, email, typ: 'access' });
    const refreshToken = randomToken(48);
    const refreshExpiresAt = new Date(Date.now() + this.config.REFRESH_TTL_DAYS * 86_400_000);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: sha256Hex(refreshToken), expiresAt: refreshExpiresAt, userAgent: userAgent?.slice(0, 300) },
    });
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  private publicUser(u: { id: string; email: string; name: string }) {
    return { id: u.id, email: u.email, name: u.name };
  }
}
