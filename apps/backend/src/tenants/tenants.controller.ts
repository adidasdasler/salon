import { Controller, Delete, Get, Param, Patch, Post, Put, Body } from '@nestjs/common';
import { UserRole } from '@salon/core';
import { Roles } from '../common/decorators';
import { CurrentUser, AuthContext } from '../common/decorators';
import { ok } from '../common/helpers';
import { PrismaService } from '../database/prisma.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Current tenant — always from JWT, never from URL (spec §5.1). */
  @Get('current')
  async current(@CurrentUser() auth: AuthContext) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: auth.tenantId, deletedAt: null },
    });
    return ok(tenant);
  }

  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @Patch('current')
  async update(
    @CurrentUser() auth: AuthContext,
    @Body() dto: { name?: string; timezone?: string; settings?: Record<string, unknown> },
  ) {
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
