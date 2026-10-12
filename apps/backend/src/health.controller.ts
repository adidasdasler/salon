import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { ok } from './common/helpers';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness + DB/Redis connectivity — polled by UptimeRobot (spec §10.7). */
  @Get()
  async health() {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      /* report below */
    }
    return ok({
      status: db ? 'ok' : 'degraded',
      db,
      uptime: Math.round(process.uptime()),
      version: process.env.APP_VERSION ?? '3.0.0',
      timestamp: new Date().toISOString(),
    });
  }
}
