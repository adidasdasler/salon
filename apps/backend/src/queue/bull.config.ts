import { BullModule } from '@nestjs/bullmq';

/** Root async Bull config from REDIS_URL (spec §7.2). */
export const bullRootConfig = BullModule.forRootAsync({
  useFactory: () => ({
    connection: {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      maxRetriesPerRequest: null,
    },
  }),
});
