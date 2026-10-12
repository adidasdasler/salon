import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { UserRole } from '@salon/core';
import { Roles, CurrentUser, AuthContext } from '../common/decorators';
import { ok, parsePagination, paginationMeta } from '../common/helpers';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';

const WRITE_ROLES = [UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN];

@Controller('resources')
export class ResourcesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() auth: AuthContext,
    q: { page?: number; limit?: number; active?: string },
  ) {
    const p = parsePagination(q);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const where = { deletedAt: null, ...(q.active === 'true' ? { isActive: true } : {}) };
      const [items, total] = await Promise.all([
        tx.resource.findMany({
          where,
          include: { services: { select: { serviceId: true } } },
          skip: (p.page - 1) * p.limit,
          take: p.limit,
          orderBy: { name: 'asc' },
        }),
        tx.resource.count({ where }),
      ]);
      return ok(items, paginationMeta(total, p));
    });
  }

  @Get(':id')
  get(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.prisma
      .withTenant(auth.tenantId, (tx) =>
        tx.resource.findFirst({ where: { id, deletedAt: null }, include: { services: true } }),
      )
      .then((r) => {
        if (!r) throw AppError.notFound('Мастер не найден');
        return ok(r);
      });
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(
    @CurrentUser() auth: AuthContext,
    @Body()
    dto: {
      name: string; phone?: string; email?: string; avatarUrl?: string;
      capabilities?: string[]; schedule?: object; serviceIds?: string[];
    },
  ) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const resource = await tx.resource.create({
        data: {
          tenantId: auth.tenantId,
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          avatarUrl: dto.avatarUrl,
          capabilities: dto.capabilities ?? [],
          schedule: (dto.schedule as object) ?? null,
        },
      });
      if (dto.serviceIds?.length) {
        await tx.serviceResource.createMany({
          data: dto.serviceIds.map((serviceId) => ({ resourceId: resource.id, serviceId })),
        });
      }
      await tx.auditLog.create({
        data: { tenantId: auth.tenantId, userId: auth.userId, action: 'resource.created', entityType: 'Resource', entityId: resource.id, after: dto as object },
      });
      return ok(resource);
    });
  }

  @Roles(...WRITE_ROLES)
  @Patch(':id')
  update(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown> & { serviceIds?: string[] },
  ) {
    const { serviceIds, ...data } = dto;
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const resource = await tx.resource.update({ where: { id, tenantId: auth.tenantId }, data: data as never });
      if (serviceIds) {
        await tx.serviceResource.deleteMany({ where: { resourceId: id } });
        if (serviceIds.length) {
          await tx.serviceResource.createMany({
            data: serviceIds.map((serviceId) => ({ resourceId: id, serviceId })),
          });
        }
      }
      await tx.auditLog.create({
        data: { tenantId: auth.tenantId, userId: auth.userId, action: 'resource.updated', entityType: 'Resource', entityId: id, after: dto as object },
      });
      return ok(resource);
    });
  }

  /** Soft delete — bookings history preserved (spec §3 conventions). */
  @Roles(...WRITE_ROLES)
  @Delete(':id')
  remove(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      await tx.resource.update({ where: { id, tenantId: auth.tenantId }, data: { deletedAt: new Date(), isActive: false } });
      await tx.auditLog.create({
        data: { tenantId: auth.tenantId, userId: auth.userId, action: 'resource.deleted', entityType: 'Resource', entityId: id },
      });
      return ok({ deleted: true });
    });
  }

  /** Weekly schedule (onboarding step 4 / master page). */
  @Roles(...WRITE_ROLES)
  @Put(':id/schedule')
  setSchedule(@CurrentUser() auth: AuthContext, @Param('id') id: string, @Body() dto: { schedule: object }) {
    return this.prisma
      .withTenant(auth.tenantId, (tx) =>
        tx.resource.update({ where: { id, tenantId: auth.tenantId }, data: { schedule: dto.schedule as object } }),
      )
      .then(ok);
  }

  @Get(':id/services')
  listServices(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.prisma
      .withTenant(auth.tenantId, (tx) =>
        tx.serviceResource.findMany({ where: { resourceId: id }, include: { service: true } }),
      )
      .then((rows) => ok(rows.map((r) => r.service)));
  }
}
