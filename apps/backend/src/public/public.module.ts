import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { BookingsModule } from '../bookings/bookings.module';

@Module({ imports: [BookingsModule], controllers: [PublicController] })
export class PublicModule {}
