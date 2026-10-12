import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@salon/core';
import { Roles, CurrentUser, AuthContext } from '../common/decorators';
import { ok } from '../common/helpers';
import { PrismaService } from '../database/prisma.service';

const READ = [UserRole.OWNER, UserRole.MANAGER];

function range(q: { from?: string; to?: string }) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86_400_000);
  return { gte: from, lte: to };
}

/** MVP analytics (spec §5.2 Analytics): revenue, appointments, masters, services, sources. */
@Controller('analytics')
@Roles(...READ)
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  /** KPI cards for dashboard: revenue, bookings count, no-show rate, avg check. */
  @Get('summary')
  async summary(@CurrentUser() auth: AuthContext, @Query() q: { from?: string; to?: string }) {
    const r = range(q);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const where = { startsAt: r, status: { notIn: ['CANCELLED'] as never } };
      const [agg, total, completed, noShow] = await Promise.all([
        tx.booking.aggregate({ where, _sum: { price: true }, _count: { _all: true } }),
        tx.booking.count({ where: { startsAt: r } }),
        tx.booking.count({ where: { startsAt: r, status: 'COMPLETED' as never } }),
        tx.booking.count({ where: { startsAt: r, status: 'NO_SHOW' as never } }),
      ]);
      const revenue = Number(agg._sum.price ?? 0);
      return ok({
        revenueKopecks: revenue,
        bookings: total,
        completed,
        noShowRate: total === 0 ? 0 : Number(((noShow / total) * 100).toFixed(1)),
        avgCheckKopecks: completed === 0 ? 0 : Math.round(revenue / completed),
      });
    });
  }

  /** Daily revenue series for charts. */
  @Get('revenue')
  async revenue(@CurrentUser() auth: AuthContext, @Query() q: { from?: string; to?: string }) {
    const r = range(q);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ day: Date; total: bigint; cnt: bigint }>>`
        SELECT date_trunc('day', "startsAt") AS day,
               COALESCE(SUM("price"), 0)::bigint AS total,
               COUNT(*)::bigint AS cnt
        FROM "Booking"
        WHERE "startsAt" >= ${r.gte} AND "startsAt" <= ${r.lte}
          AND "status" NOT IN ('CANCELLED','NO_SHOW')
        GROUP BY 1 ORDER BY 1`;
      return ok(rows.map((x) => ({ day: x.day, revenueKopecks: Number(x.total), count: Number(x.cnt) })));
    });
  }

  /** Top masters by completed bookings + revenue. */
  @Get('masters')
  async masters(@CurrentUser() auth: AuthContext, @Query() q: { from?: string; to?: string }) {
    const r = range(q);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const rows = await tx.resource.findMany({
        where: { deletedAt: null },
        include: {
          bookings: {
            where: { startsAt: r, status: { notIn: ['CANCELLED'] as never } },
            select: { price: true, status: true },
          },
        },
      });
      return ok(
        rows
          .map((res) => ({
            id: res.id,
            name: res.name,
            bookings: res.bookings.length,
            revenueKopecks: res.bookings.reduce((s, b) => s + Number(b.price), 0),
          }))
          .sort((a, b) => b.revenueKopecks - a.revenueKopecks),
      );
    });
  }

  /** Service popularity breakdown. */
  @Get('services')
  async services(@CurrentUser() auth: AuthContext, @Query() q: { from?: string; to?: string }) {
    const r = range(q);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const grouped = await tx.booking.groupBy({
        by: ['serviceId'],
        where: { startsAt: r, status: { notIn: ['CANCELLED'] as never } },
        _count: { _all: true },
        _sum: { price: true },
      });
      const svc = await tx.service.findMany({ where: { id: { in: grouped.map((g) => g.serviceId) } }, select: { id: true, name: true } });
      const nameById = new Map(svc.map((s) => [s.id, s.name]));
      return ok(
        grouped
          .map((g) => ({
            serviceId: g.serviceId,
            name: nameById.get(g.serviceId) ?? '—',
            count: g._count._all,
            revenueKopecks: Number(g._sum.price ?? 0),
          }))
          .sort((a, b) => b.count - a.count),
      );
    });
  }

  /** Booking source distribution (MANUAL/WIDGET/TELEGRAM_BOT). */
  @Get('sources')
  async sources(@CurrentUser() auth: AuthContext, @Query() q: { from?: string; to?: string }) {
    const r = range(q);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const grouped = await tx.booking.groupBy({
        by: ['source'],
        where: { startsAt: r },
        _count: { _all: true },
      });
      return ok(grouped.map((g) => ({ source: g.source, count: g._count._all })));
    });
  }

  /** Upcoming appointments feed for dashboard widget. */
  @Get('upcoming')
  async upcoming(@CurrentUser() auth: AuthContext) {
    return this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.booking.findMany({
        where: { startsAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] as never } },
        include: { customer: { select: { name: true, phone: true } }, service: { select: { name: true } }, resource: { select: { name: true } } },
        orderBy: { startsAt: 'asc' },
        take: 10,
      }),
    ).then(ok);
  }
}
