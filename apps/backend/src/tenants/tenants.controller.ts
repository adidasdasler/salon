import { Controller, Delete, Get, Param, Patch, Post, Put, Body, Query } from '@nestjs/common';
import { UserRole } from '@salon/core';
import { Public, Roles } from '../common/decorators';
import { CurrentUser, AuthContext } from '../common/decorators';
import { ok } from '../common/helpers';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** Current tenant — always from JWT, never from URL (spec §5.1). */
  @Get('current')
  async current(@CurrentUser() auth: AuthContext) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: auth.tenantId, deletedAt: null },
    });
    return ok(tenant);
  }

  /** Public helper for the marketing signup form (spec §5.2 tenants/check-subdomain). */
  @Public()
  @Get('check-subdomain')
  checkSubdomain(@Query('subdomain') subdomain: string) {
    return this.auth.checkSubdomain(subdomain ?? '').then(ok);
  }

  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @Patch('current')
  async update(
    @CurrentUser() auth: AuthContext,
    @Body() dto: { name?: string; timezone?: string; settings?: Record<string, unknown> },
  ) {
    if (dto.name !== undefined && (typeof dto.name !== 'string' || dto.name.trim().length < 2 || dto.name.length > 120)) {
      throw AppError.badRequest('VALIDATION_ERROR', 'Некорректное название салона');
    }
    if (dto.timezone !== undefined && !/^[A-Za-z0-9_+/-]{1,64}$/.test(dto.timezone)) {
      throw AppError.badRequest('VALIDATION_ERROR', 'Некорректный часовой пояс');
    }
    const tenant = await this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.tenant.update({
        where: { id: auth.tenantId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
          ...(dto.settings !== undefined ? { settings: dto.settings as object } : {}),
        },
      }),
    );
    return ok(tenant);
  }
}
