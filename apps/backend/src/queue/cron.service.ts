import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';

/**
 * Billing/subscription cron jobs (spec §5.3 Billing, §7.2 Cron).
 * - 06:00 daily: TRIAL→PAST_DUE, ACTIVE→PAST_DUE→EXPIRED transitions
 * - trial ending in ≤3 days is surfaced via subscription.trialEndsAt (CRM banner)
 */
@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async checkSubscriptions(): Promise<void> {
    const now = new Date();

    // Trial expired → PAST_DUE (grace), tenant status follows
    const expiredTrials = await this.prisma.subscription.findMany({
      where: { status: 'TRIAL', trialEndsAt: { lt: now } },
      select: { id: true, tenantId: true },
    });
    for (const s of expiredTrials) {
      await this.prisma.subscription.update({ where: { id: s.id }, data: { status: 'PAST_DUE' } });
      await this.prisma.tenant.update({ where: { id: s.tenantId }, data: { status: 'PAST_DUE' } });
    }

    // Paid period ended → PAST_DUE (1st pass), EXPIRED (if already PAST_DUE)
    const overdue = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
      select: { id: true, tenantId: true },
    });
    for (const s of overdue) {
      await this.prisma.subscription.update({ where: { id: s.id }, data: { status: 'PAST_DUE' } });
      await this.prisma.tenant.update({ where: { id: s.tenantId }, data: { status: 'PAST_DUE' } });
    }
    // PAST_DUE older than 3-day grace → EXPIRED (locks the tenant out)
    const pastDue = await this.prisma.subscription.findMany({
      where: { status: 'PAST_DUE', currentPeriodEnd: { lt: new Date(now.getTime() - 3 * 86_400_000) } },
      select: { id: true, tenantId: true },
    });
    for (const s of pastDue) {
      await this.prisma.subscription.update({ where: { id: s.id }, data: { status: 'EXPIRED' } });
      await this.prisma.tenant.update({ where: { id: s.tenantId }, data: { status: 'EXPIRED' } });
    }

    // cancelAtPeriodEnd reached → CANCELLED
    const toCancel = await this.prisma.subscription.findMany({
      where: { cancelAtPeriodEnd: true, currentPeriodEnd: { lt: now }, status: { notIn: ['CANCELLED', 'EXPIRED'] } },
      select: { id: true, tenantId: true },
    });
    for (const s of toCancel) {
      await this.prisma.subscription.update({ where: { id: s.id }, data: { status: 'CANCELLED' } });
      await this.prisma.tenant.update({ where: { id: s.tenantId }, data: { status: 'CANCELLED' } });
    }

    const total = expiredTrials.length + overdue.length + pastDue.length + toCancel.length;
    if (total) this.logger.log(`Subscription cron: transitioned ${total} subscriptions`);
  }

  /** 00:00 daily — mark sleeping customers (no visit > 90 days) with tag (spec §7.2). */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markSleepingCustomers(): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 86_400_000);
    const tenants = await this.prisma.tenant.findMany({ where: { deletedAt: null, status: { in: ['TRIAL', 'ACTIVE'] } }, select: { id: true } });
    for (const t of tenants) {
      await this.prisma
        .withTenant(t.id, (tx) =>
          tx.$executeRaw`
            UPDATE "Customer"
            SET tags = array_append(tags, 'sleeping')
            WHERE "lastVisitAt" IS NOT NULL
              AND "lastVisitAt" < ${cutoff}
              AND NOT 'sleeping' = ANY(tags)`,
        )
        .catch(() => undefined);
    }
  }
}
