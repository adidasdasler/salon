import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { UserRole, BillingPeriod } from '@salon/core';
import { Roles, CurrentUser, AuthContext } from '../common/decorators';
import { ok } from '../common/helpers';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { YookassaService } from './yookassa.service';

// Accept both @salon/core string enums and Prisma's runtime $Enums literals (same values).
type PeriodLike = 'MONTHLY' | 'YEARLY';
const PERIOD_DAYS: Record<PeriodLike, number> = { MONTHLY: 30, YEARLY: 365 };

/**
 * Billing module (spec §5.2 Billing, §5.3): plans, subscription, payments, limits.
 * OWNER-only for mutations. Money in kopecks everywhere.
 */
@Controller('billing')
@Roles(UserRole.OWNER)
export class BillingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly yk: YookassaService,
  ) {}

  /** Public-ish plan catalog (still auth — CRM page). */
  @Get('plans')
  async plans() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return ok(
      plans.map((p) => ({
        ...p,
        priceMonthly: Number(p.priceMonthly),
        priceYearly: Number(p.priceYearly),
      })),
    );
  }

  /** Current tenant subscription with plan + days remaining. */
  @Get('subscription')
  async subscription(@CurrentUser() auth: AuthContext) {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId: auth.tenantId },
      include: { plan: true },
    });
    if (!sub) throw AppError.notFound('Подписка не найдена');
    const now = Date.now();
    return ok({
      id: sub.id,
      status: sub.status,
      billingPeriod: sub.billingPeriod,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      currentPeriodStart: sub.currentPeriodStart.toISOString(),
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      daysLeft: Math.max(0, Math.ceil((sub.currentPeriodEnd.getTime() - now) / 86_400_000)),
      plan: {
        id: sub.plan.id,
        code: sub.plan.code,
        name: sub.plan.name,
        priceMonthly: Number(sub.plan.priceMonthly),
        priceYearly: Number(sub.plan.priceYearly),
        limits: sub.plan.limits,
        features: sub.plan.features,
      },
    });
  }

  /** Switch plan (takes effect on next payment cycle; keeps period dates). */
  @Post('subscription/plan')
  async changePlan(@CurrentUser() auth: AuthContext, @Body() dto: { planCode: string; billingPeriod?: BillingPeriod }) {
    const plan = await this.prisma.plan.findFirst({ where: { code: dto.planCode, isActive: true } });
    if (!plan) throw AppError.notFound('Тариф не найден');
    const sub = await this.prisma.subscription.update({
      where: { tenantId: auth.tenantId },
      data: {
        planId: plan.id,
        ...(dto.billingPeriod ? { billingPeriod: dto.billingPeriod } : {}),
      },
    });
    await this.prisma.auditLog.create({
      data: { tenantId: auth.tenantId, userId: auth.userId, action: 'billing.plan_changed', entityType: 'Subscription', entityId: sub.id, after: { planCode: plan.code } },
    });
    return ok(sub);
  }

  /** Create a payment invoice in YooKassa → returns confirmationUrl (spec §5.3). */
  @HttpCode(200)
  @Post('payments')
  async createPayment(
    @CurrentUser() auth: AuthContext,
    @Body() dto: { billingPeriod?: BillingPeriod },
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId: auth.tenantId },
      include: { plan: true },
    });
    if (!sub) throw AppError.notFound('Подписка не найдена');

    // Validate against Prisma's generated enum ($Enums) — the runtime source of truth.
    const validPeriods: string[] = Object.values(this.prisma.$Enums.BillingPeriod);
    if (dto.billingPeriod !== undefined && !validPeriods.includes(dto.billingPeriod)) {
      throw AppError.badRequest('VALIDATION_ERROR', 'Некорректный billingPeriod');
    }
    const period = dto.billingPeriod ?? sub.billingPeriod;
    const amountKopecks = Number(period === 'YEARLY' ? sub.plan.priceYearly : sub.plan.priceMonthly);
    if (amountKopecks <= 0) throw AppError.badRequest('VALIDATION_ERROR', 'Некорректная сумма тарифа');

    const returnUrl = `${process.env.APP_URL ?? 'http://localhost:5174'}/#/billing`;
    const ykPayment = await this.yk.createPayment({
      amountKopecks,
      description: `Salon ${sub.plan.name} (${period}) — ${auth.tenantId}`,
      metadata: { tenantId: auth.tenantId, subscriptionId: sub.id, billingPeriod: period },
      returnUrl,
      idempotencyKey: `${auth.tenantId}:${sub.plan.code}:${period}:${Math.floor(Date.now() / 600_000)}`,
    });

    const payment = await this.prisma.payment.create({
      data: {
        tenantId: auth.tenantId,
        subscriptionId: sub.id,
        amount: amountKopecks,
        status: 'PENDING',
        provider: 'yookassa',
        externalId: ykPayment.id,
        metadata: { billingPeriod: period, planCode: sub.plan.code },
      },
    });

    return ok({ paymentId: payment.id, externalId: ykPayment.id, confirmationUrl: ykPayment.confirmationUrl });
  }

  /** Payment history for the tenant. */
  @Get('payments')
  async payments(@CurrentUser() auth: AuthContext) {
    const items = await this.prisma.withTenant(auth.tenantId, (tx) =>
      tx.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    );
    return ok(items.map((p) => ({ ...p, amount: Number(p.amount) })));
  }

  /** Cancel at period end (recurring stop, access kept until currentPeriodEnd). */
  @HttpCode(200)
  @Post('subscription/cancel')
  async cancel(@CurrentUser() auth: AuthContext) {
    const sub = await this.prisma.subscription.update({
      where: { tenantId: auth.tenantId },
      data: { cancelAtPeriodEnd: true },
    });
    return ok({ cancelAtPeriodEnd: sub.cancelAtPeriodEnd, validUntil: sub.currentPeriodEnd });
  }

  @HttpCode(200)
  @Post('subscription/resume')
  async resume(@CurrentUser() auth: AuthContext) {
    const sub = await this.prisma.subscription.update({
      where: { tenantId: auth.tenantId },
      data: { cancelAtPeriodEnd: false },
    });
    return ok({ cancelAtPeriodEnd: sub.cancelAtPeriodEnd });
  }

  /** Plan limits check helper exposed to CRM (e.g. "maxResources" banner). */
  @Get('limits')
  async limits(@CurrentUser() auth: AuthContext) {
    const [sub, resources, bookingsThisMonth] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { tenantId: auth.tenantId }, include: { plan: true } }),
      this.prisma.withTenant(auth.tenantId, (tx) => tx.resource.count({ where: { deletedAt: null, isActive: true } })),
      this.prisma.withTenant(auth.tenantId, (tx) =>
        tx.booking.count({ where: { startsAt: { gte: startOfMonth() } } }),
      ),
    ]);
    const limits = (sub?.plan.limits ?? {}) as Record<string, number | boolean>;
    return ok({
      maxResources: limits.maxResources ?? Infinity,
      usedResources: resources,
      maxBookingsPerMonth: limits.maxBookingsPerMonth ?? Infinity,
      usedBookingsThisMonth: bookingsThisMonth,
      remindersEnabled: Boolean(limits.remindersEnabled),
      analyticsEnabled: Boolean(limits.analyticsEnabled),
    });
  }

  /** Used by webhooks after payment.succeeded — exported logic lives here for reuse. */
  static nextPeriodEnd(from: Date, period: PeriodLike): Date {
    const days = PERIOD_DAYS[period] ?? 30;
    return new Date(from.getTime() + days * 86_400_000);
  }
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
