import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { isWithinSchedule } from './bookings.service';

export interface FreeSlot {
  startsAt: string;
  endsAt: string;
  available: true;
}

const STEP_MIN = 15; // slot granularity

/**
 * Slot finder shared by CRM (`GET /bookings/slots`) and public widget.
 * For each candidate resource: walk working hours in 15-min steps,
 * keep starts where [t, t+duration+buffer] fits schedule and clashes with no active booking.
 */
@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findFreeSlots(tenantId: string, serviceId: string, resourceId: string | undefined, date: string): Promise<FreeSlot[]> {
    const day = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(day.getTime())) return [];

    return this.prisma.withTenant(tenantId, async (tx) => {
      const service = await tx.service.findFirst({ where: { id: serviceId, isActive: true, deletedAt: null } });
      if (!service) return [];

      const resources = resourceId
        ? await tx.resource.findMany({ where: { id: resourceId, isActive: true, deletedAt: null } })
        : await tx.resource.findMany({
            where: { isActive: true, deletedAt: null, services: { some: { serviceId } } },
          });

      const durationMs = (service.duration + service.bufferTime) * 60_000;
      const dayEnd = new Date(day.getTime() + 24 * 3_600_000);

      const busy = await tx.booking.findMany({
        where: {
          resourceId: { in: resources.map((r) => r.id) },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startsAt: { lt: dayEnd },
          endsAt: { gt: day },
        },
        select: { resourceId: true, startsAt: true, endsAt: true },
      });

      const slots: FreeSlot[] = [];
      for (const res of resources) {
        if (resourceId && res.id !== resourceId) continue;
        for (let m = 0; m < 24 * 60; m += STEP_MIN) {
          const startsAt = new Date(day.getTime() + m * 60_000);
          const endsAt = new Date(startsAt.getTime() + durationMs);
          if (startsAt.getTime() < Date.now()) continue; // no past slots
          if (!isWithinSchedule(res.schedule as never, startsAt, endsAt)) continue;
          const clash = busy.some(
            (b) => b.resourceId === res.id && b.startsAt < endsAt && b.endsAt > startsAt,
          );
          if (clash) continue;
          slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), available: true });
        }
      }
      return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    });
  }
}
