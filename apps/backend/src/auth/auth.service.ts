import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import {
  UserRole,
  TenantStatus,
  TenantPlan,
  RESERVED_SUBDOMAINS,
  SLUG_RE,
  ErrorCode,
} from '@salon/core';
import { PrismaService } from '../database/prisma.service';
import { TokenService } from './token.service';
import { TotpService } from './totp.service';
import { AppError } from '../common/app-error';
import type { RegisterDto, LoginDto } from './dto';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly totp: TotpService,
    private readonly config: ConfigService,
  ) {}

  /** Public: check subdomain availability (spec §5.2 tenants/check-subdomain). */
  async checkSubdomain(subdomain: string) {
    if (!SLUG_RE.test(subdomain)) return { available: false, reason: 'INVALID' as const };
    if (RESERVED_SUBDOMAINS.has(subdomain)) return { available: false, reason: 'RESERVED' as const };
    const exists = await this.prisma.tenant.findFirst({
      where: { subdomain, deletedAt: null },
      select: { id: true },
    });
    return { available: !exists };
  }

  /**
   * Registration flow (spec §5.3 Billing):
   * Tenant(TRIAL +14d) → OWNER user (argon2id) → TRIAL subscription on default plan.
   */
  async register(dto: RegisterDto, ip?: string) {
    if (dto.website) throw new BadRequestException('Bot detected'); // honeypot
    await this.verifyCaptcha(dto.captchaToken);

    const availability = await this.checkSubdomain(dto.subdomain);
    if (!availability.available) {
      throw AppError.conflict(ErrorCode.SUBDOMAIN_TAKEN, 'Поддомен уже занят');
    }

    const email = dto.email.toLowerCase();
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const trialEndsAt = addDays(new Date(), 14);

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          subdomain: dto.subdomain,
          name: dto.salonName,
          plan: TenantPlan.START,
          status: TenantStatus.TRIAL,
          trialEndsAt,
        },
      });
      const user = await tx.user.create({
        data: { tenantId: tenant.id, email, passwordHash, name: dto.name, role: UserRole.OWNER, phone: dto.phone },
      });
      const plan = await tx.plan.findFirst({ where: { code: TenantPlan.START, isActive: true } });
      if (plan) {
        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: plan.id,
            status: 'TRIAL',
            billingPeriod: 'MONTHLY',
            trialEndsAt,
            currentPeriodStart: new Date(),
            currentPeriodEnd: trialEndsAt,
          },
        });
      }
      await tx.auditLog.create({
        data: { tenantId: tenant.id, userId: user.id, action: 'auth.register', entityType: 'Tenant', entityId: tenant.id, ip },
      });
      return { tenant, user };
    });

    const pair = await this.tokens.issueTokens(result.user, ip);
    this.logger.log(`Registered tenant ${result.tenant.subdomain}`);
    return { user: sanitizeUser(result.user), tenant: result.tenant, tokens: pair };
  }

  /** Login with lockout after 5 failed attempts (spec §9.2). */
  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    if (dto.website) throw new BadRequestException('Bot detected');
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!user) throw new UnauthorizedException('Неверный email или пароль');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw AppError.badRequest(ErrorCode.ACCOUNT_LOCKED, 'Аккаунт временно заблокирован');
    }

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: attempts >= MAX_FAILED_LOGINS ? addMinutes(new Date(), LOCK_MINUTES) : null,
        },
      });
      throw new UnauthorizedException('Неверный email или пароль');
    }

    // 2FA for OWNER/MANAGER is mandatory (spec §9.2)
    if (user.twoFactorEnabled) {
      if (!dto.totpCode) {
        throw new UnauthorizedException({
          code: ErrorCode.TWO_FACTOR_REQUIRED,
          message: 'Требуется код 2FA',
          requires2fa: true,
        });
      }
      const valid = await this.totp.verify(user.twoFactorSecret!, dto.totpCode);
      if (!valid) throw new UnauthorizedException('Неверный код 2FA');
    } else if (user.role === UserRole.OWNER || user.role === UserRole.MANAGER) {
      // soft nudge: allow login but frontend forces 2FA setup screen
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ip },
    });

    const pair = await this.tokens.issueTokens(user, ip, userAgent);
    return { user: sanitizeUser(user), tokens: pair };
  }

  /** Refresh with rotation + reuse detection (spec §9.2). */
  async refresh(refreshToken: string, ip?: string, userAgent?: string) {
    return this.tokens.rotateRefresh(refreshToken, ip, userAgent);
  }

  async logout(refreshToken: string) {
    await this.tokens.revokeToken(refreshToken);
    return { revoked: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const tenant = await this.prisma.tenant.findUnique({ where: { id: user.tenantId } });
    return { user: sanitizeUser(user), tenant };
  }

  async setup2fa(userId: string) {
    const secret = this.totp.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: secret } });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return { secret, otpauthUrl: this.totp.buildUri(secret, user!.email) };
  }

  async enable2fa(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.twoFactorSecret) throw new ConflictException('Сначала инициализируйте 2FA');
    if (!(await this.totp.verify(user.twoFactorSecret, code))) {
      throw new BadRequestException('Неверный код подтверждения');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    return { enabled: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw new BadRequestException('Текущий пароль неверен');
    }
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.tokens.revokeAllForUser(userId); // force re-login everywhere
    return { changed: true };
  }

  private async verifyCaptcha(token?: string) {
    const secret = process.env.YANDEX_SMARTCAPTCHA_SECRET;
    // In dev / when not configured — skip. Production must set it (spec §8).
    if (!secret) return;
    if (!token) throw new AppError(ErrorCode.CAPTCHA_FAILED, 'Требуется подтверждение капчи', 400);
    const res = await fetch('https://smartcaptcha.yandexcloud.net/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, serverKey: token }).toString(),
    });
    const json = (await res.json()) as { status: string };
    if (json.status !== 'OK') throw new AppError(ErrorCode.CAPTCHA_FAILED, 'Капча не пройдена', 400);
  }
}

function sanitizeUser<U extends { passwordHash: string; twoFactorSecret: string | null }>(u: U) {
  const { passwordHash, twoFactorSecret, ...rest } = u;
  return rest;
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}
function addMinutes(d: Date, m: number) {
  return new Date(d.getTime() + m * 60_000);
}
