import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { BillingModule } from '../billing/billing.module';

@Module({ imports: [BillingModule], controllers: [WebhooksController] })
export class WebhooksModule {}
