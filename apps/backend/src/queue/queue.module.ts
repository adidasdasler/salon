import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CronService } from './cron.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'reminders' },
      { name: 'messages' },
      { name: 'analytics' },
    ),
  ],
  providers: [CronService, TelegramService],
  exports: [TelegramService],
})
export class QueueModule {}
