import { Body, Controller, Headers, HttpCode, Logger, Post, RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../common/decorators';
import { ok } from '../common/helpers';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { YookassaService } from '../billing/yookassa.service';
import { BillingController } from '../billing/billing.controller';

interface YooKassaEvent {
  event: 'payment.succeeded' | 'payment.canceled' | string;
  object?: {
    id: string;
    status: string;
    metadata?: { tenantId?: string; subscriptionId?: string; billingPeriod?: 'MONTHLY' | 'YEARLY' };
  };
}

interface TgUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    text?: string;
    from?: { is_bot?: boolean };
  };
}

/**
 * Webhooks (spec §5.2, §8): signature-verified public endpoints.
 * - /webhooks/yookassa — HMAC SHA256 + idempotency via Payment.externalId unique
 * - /webhooks/telegram — secret token check (set webhook with secret_token)
 */
@Controller('webhooks')
@Public()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly yk: YookassaService,
  ) {}

  @HttpCode(200)
  @Post('yookassa')
  async yookassa(
    @Body() event: YooKassaEvent,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-yandex-signature') signature?: string,
  ) {
    const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(event);
    if (!this.yk.verifySignature(raw, signature)) {
      throw AppError.forbidden('Неверная подпись вебхука');
    }

    const paymentId = event.object?.id;
    if (!paymentId) return ok({ ignored: true });

    // Idempotency: find our local PENDING payment by externalId
    const local = await this.prisma.payment.findUnique({ where: { externalId: paymentId } });
    if (!local) {
      this.logger.warn(`yookassa webhook for unknown payment ${paymentId}`);
      return ok({ ignored: true });
    }

    if (event.event === 'payment.succeeded' && local.status === 'PENDING') {
      type Period = (typeof this.prisma.$Enums.BillingPeriod)[keyof typeof this.prisma.$Enums.BillingPeriod];
      const rawPeriod = event.object?.metadata?.billingPeriod;
      const validPeriods: string[] = Object.values(this.prisma.$Enums.BillingPeriod);
      const period: Period =
        typeof rawPeriod === 'string' && validPeriods.includes(rawPeriod)
          ? (rawPeriod as Period)
          : this.prisma.$Enums.BillingPeriod.MONTHLY;
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: local.id },
          data: { status: 'SUCCEEDED', paidAt: new Date() },
        });
        const sub = await tx.subscription.findUnique({ where: { id: local.subscriptionId } });
        if (sub) {
          const base = sub.currentPeriodEnd > new Date() ? sub.currentPeriodEnd : new Date();
          await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'ACTIVE',
              currentPeriodStart: sub.currentPeriodEnd < new Date() ? new Date() : sub.currentPeriodStart,
              currentPeriodEnd: BillingController.nextPeriodEnd(base, period),
              cancelAtPeriodEnd: false,
            },
          });
          await tx.tenant.update({ where: { id: local.tenantId }, data: { status: 'ACTIVE' } });
        }
        await tx.auditLog.create({
          data: { tenantId: local.tenantId, action: 'billing.payment_succeeded', entityType: 'Payment', entityId: local.id },
        });
      });
      this.logger.log(`Payment ${paymentId} succeeded → tenant ${local.tenantId} ACTIVE`);
    }

    if (event.event === 'payment.canceled' && local.status === 'PENDING') {
      await this.prisma.payment.update({ where: { id: local.id }, data: { status: 'FAILED' } });
    }

    return ok({ received: true });
  }

  /** Telegram bot updates → link customer chat + store inbound messages (MVP minimal). */
  @HttpCode(200)
  @Post('telegram')
  async telegram(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: TgUpdate) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expected && secret !== expected) throw AppError.forbidden('Неверный secret token');
    if (!update?.message?.chat || update.message.from?.is_bot) return ok({ ignored: true });

    const chatId = String(update.message.chat.id);
    // Find tenants having an active TELEGRAM channel bound to this chat
    const channels = await this.prisma.channel.findMany({
      where: { type: 'TELEGRAM', isActive: true, config: { path: ['telegramChatId'], equals: chatId } },
    });
    for (const ch of channels) {
      await this.prisma.message.create({
        data: {
          tenantId: ch.tenantId,
          channelId: ch.id,
          customerId: ch.customerId,
          externalId: `tg-${update.update_id}-${ch.id}`,
          direction: 'INBOUND',
          text: update.message.text ?? '',
          status: 'DELIVERED',
        },
      });
    }
    return ok({ processed: channels.length });
  }
}
