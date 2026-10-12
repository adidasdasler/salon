import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { UserRole } from '@salon/core';
import { Roles, CurrentUser, AuthContext } from '../common/decorators';
import { ok, parsePagination, paginationMeta } from '../common/helpers';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { TokenService } from '../auth/token.service';

@Roles(UserRole.OWNER, UserRole.MANAGER)
@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

  @Get()
  async list(@CurrentUser() auth: AuthContext, q: { page?: number; limit?: number }) {
    const p = parsePagination(q);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.user.findMany({
          where: { deletedAt: null },
          select: {
            id: true, email: true, name: true, role: true, phone: true,
            avatarUrl: true, twoFactorEnabled: true, lastLoginAt: true, createdAt: true,
          },
          skip: (p.page - 1) * p.limit,
          take: p.limit,
          orderBy: { createdAt: 'asc' },
        }),
        tx.user.count({ where: { deletedAt: null } }),
      ]);
      return ok(items, paginationMeta(total, p));
    });
  }

  /** Invite team member — creates user with temp password (spec §6.2 «Команда»). */
  @Post('invite')
  async invite(
    @CurrentUser() auth: AuthContext,
    @Body() dto: { email: string; name: string; role: UserRole; phone?: string },
  ) {
    if (![UserRole.MANAGER, UserRole.ADMIN, UserRole.MASTER].includes(dto.role)) {
      throw AppError.badRequest('VALIDATION_ERROR', 'Недопустимая роль для приглашения');
    }
    const tempPassword = randomBytes(12).toString('base64url');
    const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });
    const user = await this.prisma.withTenant(auth.tenantId, async (tx) => {
      const created = await tx.user.create({
        data: { tenantId: auth.tenantId, email: dto.email.toLowerCase(), name: dto.name, role: dto.role, phone: dto.phone, passwordHash },
      });
      await tx.auditLog.create({
        data: { tenantId: auth.tenantId, userId: auth.userId, action: 'user.invite', entityType: 'User', entityId: created.id },
      });
      return created;
    });
    const { passwordHash, ...safe } = user;
    // In production tempPassword is delivered via email; returned for MVP demo.
    return ok({ user: safe, tempPassword });
  }

  @Patch(':id')
  async update(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: { name?: string; role?: UserRole; phone?: string; avatarUrl?: string },
  ) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.user.update({ where: { id, tenantId: auth.tenantId }, data: dto }).then(ok),
    );
  }

  /** Soft delete + kill all sessions. */
  @Roles(UserRole.OWNER)
  @Delete(':id')
  async remove(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    if (id === auth.userId) throw AppError.badRequest('VALIDATION_ERROR', 'Нельзя удалить себя');
    await this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.user.update({ where: { id, tenantId: auth.tenantId }, data: { deletedAt: new Date() } }),
    );
    const revoked = await this.tokens.revokeAllForUser(id);
    return ok({ deleted: true, revokedSessions: revoked });
  }

  @Post(':id/revoke-sessions')
  async revokeSessions(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    const count = await this.prisma.withTenant(auth.tenantId, async (tx) => {
      const r = await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null, user: { tenantId: auth.tenantId } },
        data: { revokedAt: new Date() },
      });
      return r.count;
    });
    return ok({ revoked: count });
  }
}
