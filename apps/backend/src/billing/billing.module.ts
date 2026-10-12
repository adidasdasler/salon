import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { YookassaService } from './yookassa.service';

@Module({ controllers: [BillingController], providers: [YookassaService], exports: [YookassaService] })
export class BillingModule {}
