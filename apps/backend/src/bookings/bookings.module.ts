import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { SlotsService } from './slots.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'reminders' })],
  controllers: [BookingsController],
  providers: [BookingsService, SlotsService],
  exports: [BookingsService, SlotsService],
})
export class BookingsModule {}
