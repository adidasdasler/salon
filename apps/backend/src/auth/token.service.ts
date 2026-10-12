import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { User } from '@prisma/client';
import { UserRole, TenantStatus } from '@salon/core';
import { PrismaService } from '../database/prisma.service';
import { sha256 } from '../common/helpers';

const REFRESH_TTL_DAYS = 30;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  async issueTokens(user: User, ip?: string, userAgent?: string): Promise<TokenPair> {
    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = randomBytes(48).toString('base64url');
    const family = randomUUID();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        family,
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
        ip,
        userAgent,
      },
    });
    return { accessToken, refreshToken };
  }

  /**
   * Rotation with reuse detection (spec §9.2):
   * presenting an already-revoked token revokes the whole family.
   */
  async rotateRefresh(token: string, ip?: string, userAgent?: string): Promise<TokenPair> {
    const tokenHash = sha256(token);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Сессия недействительна' });
    }

    if (stored.revokedAt) {
      // REUSE DETECTED → kill entire family
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: 'TOKEN_REUSED',
        message: 'Обнаружено повторное использование токена. Все сессии завершены.',
      });
    }

    const newToken = randomBytes(48).toString('base64url');
    const newHash = sha256(newToken);

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), replacedBy: newHash },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: newHash,
          family: stored.family,
          expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
          ip,
          userAgent,
        },
      }),
    ]);

    const accessToken = await this.jwt.signAsync({
      sub: stored.user.id,
      tenantId: stored.user.tenantId,
      role: stored.user.role,
      email: stored.user.email,
    });
    return { accessToken, refreshToken: newToken };
  }

  async revokeToken(token: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (stored) {
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const r = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return r.count;
  }

  /** Guard used by other modules: tenant must have a usable subscription. */
  assertTenantActive(status: TenantStatus | keyof typeof TenantStatus): void {
    if (status === TenantStatus.EXPIRED || status === TenantStatus.CANCELLED) {
      throw new UnauthorizedException({
        code: 'SUBSCRIPTION_EXPIRED',
        message: 'Подписка салона истекла. Обратитесь в биллинг.',
      });
    }
  }
}

export function roleAtLeast(role: UserRole, min: UserRole): boolean {
  const order: UserRole[] = [UserRole.MASTER, UserRole.ADMIN, UserRole.MANAGER, UserRole.OWNER];
  return order.indexOf(role) >= order.indexOf(min);
}
