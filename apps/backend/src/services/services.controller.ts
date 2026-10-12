import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@salon/core';
import { Roles, CurrentUser, AuthContext } from '../common/decorators';
import { ok, parsePagination, paginationMeta } from '../common/helpers';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';

const WRITE_ROLES = [UserRole.OWNER, UserRole.MANAGER];

@Controller('services')
export class ServicesController {
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
        tx.service.findMany({
          where,
          include: { resources: { select: { resourceId: true } }, category: true },
          skip: (p.page - 1) * p.limit,
          take: p.limit,
          orderBy: { name: 'asc' },
        }),
        tx.service.count({ where }),
      ]);
      return ok(items, paginationMeta(total, p));
    });
  }

  /** Built-in templates for onboarding step 2 (spec §5.2 services/templates). */
  @Get('templates')
  templates() {
    return ok(SERVICE_TEMPLATES);
  }

  /** Create service(s) from a template code — used by onboarding wizard. */
  @Roles(...WRITE_ROLES)
  @Post('from-template')
  fromTemplate(
    @CurrentUser() auth: AuthContext,
    @Body() dto: { template: string },
  ) {
    const tpl = SERVICE_TEMPLATES.find((t) => t.code === dto.template);
    if (!tpl) throw AppError.notFound('Шаблон не найден');
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.service.createMany({
        data: tpl.items.map((i) => ({
          tenantId: auth.tenantId,
          name: i.name,
          price: BigInt(i.priceKopecks),
          duration: i.duration,
          bufferTime: i.bufferTime ?? 0,
        })),
      }),
    ).then(ok);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(
    @CurrentUser() auth: AuthContext,
    @Body()
    dto: {
      name: string; description?: string; priceKopecks: number; duration: number;
      bufferTime?: number; categoryId?: string; resourceIds?: string[];
    },
  ) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const service = await tx.service.create({
        data: {
          tenantId: auth.tenantId,
          name: dto.name,
          description: dto.description,
          price: BigInt(dto.priceKopecks),
          duration: dto.duration,
          bufferTime: dto.bufferTime ?? 0,
          categoryId: dto.categoryId,
        },
      });
      if (dto.resourceIds?.length) {
        await tx.serviceResource.createMany({
          data: dto.resourceIds.map((resourceId) => ({ resourceId, serviceId: service.id })),
        });
      }
      await tx.auditLog.create({
        data: { tenantId: auth.tenantId, userId: auth.userId, action: 'service.created', entityType: 'Service', entityId: service.id, after: dto as object },
      });
      return ok(service);
    });
  }

  @Roles(...WRITE_ROLES)
  @Patch(':id')
  update(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown> & { resourceIds?: string[] },
  ) {
    const { resourceIds, priceKopecks, ...rest } = dto as { resourceIds?: string[]; priceKopecks?: number };
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const service = await tx.service.update({
        where: { id, tenantId: auth.tenantId },
        data: { ...rest, ...(priceKopecks !== undefined ? { price: BigInt(priceKopecks) } : {}) } as never,
      });
      if (resourceIds) {
        await tx.serviceResource.deleteMany({ where: { serviceId: id } });
        if (resourceIds.length) {
          await tx.serviceResource.createMany({
            data: resourceIds.map((resourceId) => ({ resourceId, serviceId: id })),
          });
        }
      }
      await tx.auditLog.create({
        data: { tenantId: auth.tenantId, userId: auth.userId, action: 'service.updated', entityType: 'Service', entityId: id, after: dto as object },
      });
      return ok(service);
    });
  }

  @Roles(...WRITE_ROLES)
  @Delete(':id')
  remove(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      await tx.service.update({ where: { id, tenantId: auth.tenantId }, data: { deletedAt: new Date(), isActive: false } });
      await tx.auditLog.create({
        data: { tenantId: auth.tenantId, userId: auth.userId, action: 'service.deleted', entityType: 'Service', entityId: id },
      });
      return ok({ deleted: true });
    });
  }
}

/** RU beauty-industry starter templates (UI copy is Russian per spec §3). */
export const SERVICE_TEMPLATES = [
  {
    code: 'beauty',
    name: 'Салон красоты',
    items: [
      { name: 'Женская стрижка', priceKopecks: 250_000, duration: 60, bufferTime: 15 },
      { name: 'Мужская стрижка', priceKopecks: 150_000, duration: 45 },
      { name: 'Окрашивание в один тон', priceKopecks: 550_000, duration: 120, bufferTime: 15 },
      { name: 'Укладка', priceKopecks: 200_000, duration: 45 },
      { name: 'Маникюр без покрытия', priceKopecks: 150_000, duration: 60 },
      { name: 'Маникюр + гель-лак', priceKopecks: 250_000, duration: 90, bufferTime: 10 },
      { name: 'Педикюр', priceKopecks: 300_000, duration: 90 },
      { name: 'Брови: коррекция + окрашивание', priceKopecks: 120_000, duration: 40 },
      { name: 'Ресницы: наращивание (классика)', priceKopecks: 250_000, duration: 120 },
    ],
  },
  {
    code: 'barbershop',
    name: 'Барбершоп',
    items: [
      { name: 'Стрижка', priceKopecks: 150_000, duration: 45 },
      { name: 'Стрижка + борода', priceKopecks: 220_000, duration: 75, bufferTime: 10 },
      { name: 'Королевская бритья', priceKopecks: 180_000, duration: 60 },
      { name: 'Окантовка', priceKopecks: 80_000, duration: 20 },
    ],
  },
];
