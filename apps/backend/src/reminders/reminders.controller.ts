import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { UserRole } from '@salon/core';
import { Roles, CurrentUser, AuthContext } from '../common/decorators';
import { ok, parsePagination, paginationMeta } from '../common/helpers';
import { PrismaService } from '../database/prisma.service';

const MANAGE = [UserRole.OWNER, UserRole.MANAGER];

@Controller('reminders')
@Roles(...MANAGE)
export class RemindersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Per-tenant reminder settings stored in Tenant.settings JSON. */
  @Get('settings')
  async settings(@CurrentUser() auth: AuthContext) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: auth.tenantId } });
    const s = (tenant?.settings ?? {}) as Record<string, unknown>;
    return ok(s.reminders ?? { before24h: true, before2h: true, afterVisit: false, channel: 'TELEGRAM' });
  }

  @Post('settings')
  saveSettings(@CurrentUser() auth: AuthContext, @Body() dto: Record<string, unknown>) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: auth.tenantId } });
      const settings = { ...((tenant?.settings ?? {}) as object), reminders: dto };
      await tx.tenant.update({ where: { id: auth.tenantId }, data: { settings: settings as never } });
      return ok(settings.reminders);
    });
  }

  @Get()
  async list(
    @CurrentUser() auth: AuthContext,
    @Query() q: { page?: number; limit?: number; status?: string },
  ) {
    const p = parsePagination(q);
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const where = q.status ? { status: q.status as never } : {};
      const [items, total] = await Promise.all([
        tx.reminder.findMany({
          where,
          include: { booking: { include: { customer: true, service: true } } },
          skip: (p.page - 1) * p.limit,
          take: p.limit,
          orderBy: { scheduledAt: 'desc' },
        }),
        tx.reminder.count({ where }),
      ]);
      return ok(items, paginationMeta(total, p));
    });
  }

  @Get('stats')
  async stats(@CurrentUser() auth: AuthContext) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const grouped = await tx.reminder.groupBy({ by: ['status'], _count: { _all: true } });
      const map: Record<string, number> = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
      const sent = map.SENT ?? 0;
      const failed = map.FAILED ?? 0;
      const delivered = sent + failed;
      return ok({
        ...map,
        deliveryRate: delivered === 0 ? null : Number(((sent / delivered) * 100).toFixed(1)),
      });
    });
  }

  /** Manual broadcast of a message to all customers with Telegram linked (MVP-simple). */
  @Post('broadcast')
  broadcast(@CurrentUser() auth: AuthContext, @Body() dto: { text: string }) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const channels = await tx.channel.findMany({ where: { type: 'TELEGRAM', isActive: true } });
      // Enqueue via messages queue handled by worker; here just count targets for MVP feedback.
      await tx.message.createMany({
        data: channels
          .filter((c) => c.customerId)
          .map((c) => ({
            tenantId: auth.tenantId,
            channelId: c.id,
            customerId: c.customerId!,
            externalId: `bc-${Date.now()}-${c.id}`,
            direction: 'OUTBOUND',
            text: dto.text,
            status: 'PENDING',
          })),
      });
      return ok({ queued: channels.filter((c) => c.customerId).length });
    });
  }
}
