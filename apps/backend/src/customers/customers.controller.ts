import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, AuthContext } from '../common/decorators';
import { ok, parsePagination, paginationMeta } from '../common/helpers';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @CurrentUser() auth: AuthContext,
    q: { page?: number; limit?: number; search?: string; tag?: string },
  ) {
    const p = parsePagination(q);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const where = {
        deletedAt: null,
        ...(q.tag ? { tags: { has: q.tag } } : {}),
        ...(q.search
          ? {
              OR: [
                { name: { contains: q.search, mode: 'insensitive' as const } },
                { phone: { contains: q.search } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        tx.customer.findMany({ where, skip: (p.page - 1) * p.limit, take: p.limit, orderBy: { updatedAt: 'desc' } }),
        tx.customer.count({ where }),
      ]);
      return ok(items, paginationMeta(total, p));
    });
  }

  /** Booking history for customer drawer. */
  @Get(':id/bookings')
  bookings(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.prisma
      .withTenant(auth.tenantId, (tx) =>
        tx.booking.findMany({
          where: { customerId: id },
          include: { service: true, resource: true },
          orderBy: { startsAt: 'desc' },
          take: 100,
        }),
      )
      .then(ok);
  }

  @Post()
  create(
    @CurrentUser() auth: AuthContext,
    @Body()
    dto: { name: string; phone: string; email?: string; birthDate?: string; tags?: string[]; notes?: string; source?: string },
  ) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const existing = await tx.customer.findFirst({ where: { phone: dto.phone, deletedAt: null } });
      if (existing) throw AppError.conflict('CONFLICT', 'Клиент с таким телефоном уже есть');
      const customer = await tx.customer.create({
        data: {
          tenantId: auth.tenantId,
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          tags: dto.tags ?? [],
          notes: dto.notes,
          source: dto.source ?? 'manual',
        },
      });
      // Audit log records access to personal data (spec §9.3)
      await tx.auditLog.create({
        data: { tenantId: auth.tenantId, userId: auth.userId, action: 'customer.created', entityType: 'Customer', entityId: customer.id },
      });
      return ok(customer);
    });
  }

  @Patch(':id')
  update(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    const { birthDate, ...rest } = dto as { birthDate?: string };
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.customer.update({
        where: { id, tenantId: auth.tenantId },
        data: { ...rest, ...(birthDate ? { birthDate: new Date(birthDate) } : {}) } as never,
      }),
    ).then(ok);
  }

  /** Soft delete — PII removal capability (spec §9.5). */
  @Delete(':id')
  remove(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      await tx.customer.update({ where: { id, tenantId: auth.tenantId }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({
        data: { tenantId: auth.tenantId, userId: auth.userId, action: 'customer.deleted', entityType: 'Customer', entityId: id },
      });
      return ok({ deleted: true });
    });
  }

  /** CSV-ish bulk import: [{name, phone, email?}] */
  @Post('import')
  import(@CurrentUser() auth: AuthContext, @Body() dto: { items: Array<{ name: string; phone: string; email?: string }> }) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      let created = 0;
      let skipped = 0;
      for (const i of dto.items.slice(0, 1000)) {
        const exists = await tx.customer.findFirst({ where: { phone: i.phone } });
        if (exists) skipped++;
        else {
          await tx.customer.create({ data: { tenantId: auth.tenantId, name: i.name, phone: i.phone, email: i.email, source: 'import' } });
          created++;
        }
      }
      return ok({ created, skipped });
    });
  }

  /** Simple segments for MVP (RFM is V1.2). */
  @Get('segments')
  async segments(@CurrentUser() auth: AuthContext) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const all = await tx.customer.findMany({ where: { deletedAt: null }, select: { totalVisits: true, lastVisitAt: true } });
      const now = Date.now();
      const DAY = 86_400_000;
      return ok({
        total: all.length,
        new_0_visits: all.filter((c) => c.totalVisits === 0).length,
        active_30d: all.filter((c) => c.lastVisitAt && now - c.lastVisitAt.getTime() < 30 * DAY).length,
        sleeping_90d: all.filter((c) => !c.lastVisitAt || now - c.lastVisitAt.getTime() > 90 * DAY).length,
      });
    });
  }
}
