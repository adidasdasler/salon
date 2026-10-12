import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BookingSource, BookingStatus, ErrorCode } from '@salon/core';
import type { Prisma } from '@prisma/client';
import { AppError } from '../common/app-error';
import { PrismaService, TenantTx } from '../database/prisma.service';
import { AuthContext } from '../common/decorators';

export interface CreateBookingDto {
  customerId: string;
  resourceId: string;
  serviceId: string;
  startsAt: string; // ISO
  notes?: string;
  source?: BookingSource;
}

/**
 * Core booking creation flow (spec §5.3):
 * advisory lock → validate refs → capability → schedule → conflict → insert
 * → audit → reminders jobs. WS events are emitted by the gateway layer.
 */
@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('reminders') private readonly remindersQueue: Queue,
  ) {}

  async create(auth: AuthContext, dto: CreateBookingDto) {
    return this.prisma.withTenant(auth.tenantId, (tx) => this.createInTx(auth.tenantId, auth.userId, dto, tx));
  }

  /** Shared with PublicModule widget bookings (source=WIDGET, no auth user). */
  async createPublic(tenantId: string, dto: CreateBookingDto) {
    return this.prisma.withTenant(tenantId, (tx) => this.createInTx(tenantId, null, { ...dto, source: BookingSource.WIDGET }, tx));
  }

  private async createInTx(
    tenantId: string,
    userId: string | null,
    dto: CreateBookingDto,
    tx: TenantTx,
  ) {
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw AppError.validation({ startsAt: 'invalid ISO date' });

    // 1. Advisory xact lock keyed by (resourceId, hour-of-epoch) — prevents double-book race
    const lockKey = hashToInt(`${dto.resourceId}:${Math.floor(startsAt.getTime() / 3_600_000)}`);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

    // 2. Validate references within tenant scope
    const [customer, resource, service] = await Promise.all([
      tx.customer.findFirst({ where: { id: dto.customerId, deletedAt: null } }),
      tx.resource.findFirst({ where: { id: dto.resourceId, isActive: true, deletedAt: null } }),
      tx.service.findFirst({ where: { id: dto.serviceId, isActive: true, deletedAt: null } }),
    ]);
    if (!customer) throw AppError.notFound('Клиент не найден');
    if (!resource) throw AppError.notFound('Мастер не найден или неактивен');
    if (!service) throw AppError.notFound('Услуга не найдена или неактивна');

    // 3. ServiceResource capability check
    const capable = await tx.serviceResource.findFirst({
      where: { resourceId: resource.id, serviceId: service.id },
    });
    if (!capable) throw AppError.conflict(ErrorCode.RESOURCE_NOT_CAPABLE, 'Мастер не оказывает эту услугу');

    // 4. endsAt = startsAt + duration + bufferTime
    const endsAt = new Date(startsAt.getTime() + (service.duration + service.bufferTime) * 60_000);

    // 5. Resource working-hours check (schedule JSON, spec §4.2)
    if (!isWithinSchedule(resource.schedule as never, startsAt, endsAt)) {
      throw AppError.conflict(ErrorCode.BOOKING_OUT_OF_SCHEDULE, 'Время вне расписания мастера');
    }

    // 6. Conflict: startsAt < endsAt AND endsAt > startsAt (excluding cancelled/no-show)
    const clash = await tx.booking.count({
      where: {
        resourceId: resource.id,
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (clash > 0) {
      throw AppError.conflict(ErrorCode.BOOKING_CONFLICT, 'Это время занято, выберите другой слот', {
        startsAt: startsAt.toISOString(),
      });
    }

    // 7. Insert booking (version = 0)
    const booking = await tx.booking.create({
      data: {
        tenantId,
        customerId: customer.id,
        resourceId: resource.id,
        serviceId: service.id,
        startsAt,
        endsAt,
        price: service.price,
        source: dto.source ?? BookingSource.MANUAL,
        notes: dto.notes,
      },
      include: { customer: true, service: true, resource: true },
    });

    // 8. Audit log
    await tx.auditLog.create({
      data: { tenantId, userId, action: 'booking.created', entityType: 'Booking', entityId: booking.id, after: toPlain(booking) },
    });

    // 9. Schedule reminders via BullMQ (24h & 2h before) — job delay computed at enqueue
    await this.enqueueReminders(tx, tenantId, booking.id, startsAt);

    return booking;
  }

  private async enqueueReminders(tx: TenantTx, tenantId: string, bookingId: string, startsAt: Date) {
    const now = Date.now();
    const specs: Array<{ type: 'BEFORE_24H' | 'BEFORE_2H'; at: Date }> = [
      { type: 'BEFORE_24H', at: new Date(startsAt.getTime() - 24 * 3_600_000) },
      { type: 'BEFORE_2H', at: new Date(startsAt.getTime() - 2 * 3_600_000) },
    ];
    for (const s of specs) {
      const reminder = await tx.reminder.create({
        data: { tenantId, bookingId, type: s.type, channel: 'TELEGRAM', scheduledAt: s.at },
      });
      // Fire-and-forget queue job with exact delay (past times → send ASAP is skipped instead)
      if (s.at.getTime() > now) {
        this.remindersQueue
          .add('send', { reminderId: reminder.id, tenantId }, { delay: s.at.getTime() - now, jobId: reminder.id })
          .catch((e) => this.logger.warn(`reminder enqueue failed: ${String(e)}`));
      }
    }
  }

  /** Optimistic-locking update helper (spec §5.3). */
  async update(auth: AuthContext, id: string, dto: Partial<CreateBookingDto> & { version: number }) {
    const { version, ...rest } = dto;
    const data: Record<string, unknown> = {};
    if (rest.startsAt) data.startsAt = new Date(rest.startsAt);
    if (rest.notes !== undefined) data.notes = rest.notes;
    if (rest.customerId) data.customerId = rest.customerId;
    if (rest.resourceId) data.resourceId = rest.resourceId;
    if (rest.serviceId) data.serviceId = rest.serviceId;

    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const r = await tx.booking.updateMany({
        where: { id, version, tenantId: auth.tenantId },
        data: { ...data, version: { increment: 1 } } as never,
      });
      if (r.count === 0) {
        throw AppError.conflict(ErrorCode.BOOKING_VERSION_MISMATCH, 'Запись уже изменена кем-то другим, обновите страницу');
      }
      const booking = await tx.booking.findUnique({ where: { id }, include: { customer: true, service: true, resource: true } });
      await tx.auditLog.create({
        data: { tenantId: auth.tenantId, userId: auth.userId, action: 'booking.updated', entityType: 'Booking', entityId: id, after: toPlain(booking!) },
      });
      return booking;
    });
  }

  async transition(auth: AuthContext, id: string, status: BookingStatus, version: number) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const current = await tx.booking.findFirst({ where: { id } });
      if (!current) throw AppError.notFound('Запись не найдена');
      const r = await tx.booking.updateMany({
        where: { id, version, tenantId: auth.tenantId },
        data: { status, version: { increment: 1 } },
      });
      if (r.count === 0) {
        throw AppError.conflict(ErrorCode.BOOKING_VERSION_MISMATCH, 'Запись уже изменена, обновите страницу');
      }
      if (status === BookingStatus.COMPLETED && current.status !== BookingStatus.COMPLETED) {
        // denormalized stats update
        await tx.customer.update({
          where: { id: current.customerId },
          data: { totalVisits: { increment: 1 }, lastVisitAt: new Date(), totalSpent: { increment: current.price } },
        });
      }
      if (status === BookingStatus.CANCELLED) {
        await tx.reminder.updateMany({
          where: { bookingId: id, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: auth.tenantId, userId: auth.userId, action: `booking.${status.toLowerCase()}`,
          entityType: 'Booking', entityId: id, before: { status: current.status }, after: { status },
        },
      });
      return tx.booking.findUnique({ where: { id }, include: { customer: true, service: true, resource: true } });
    });
  }

  async remove(auth: AuthContext, id: string) {
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const r = await tx.booking.deleteMany({ where: { id, tenantId: auth.tenantId } });
      if (r.count === 0) throw AppError.notFound('Запись не найдена');
      await tx.auditLog.create({
        data: { tenantId: auth.tenantId, userId: auth.userId, action: 'booking.deleted', entityType: 'Booking', entityId: id },
      });
      return { deleted: true };
    });
  }
}

/** Weekly schedule check. schedule: { days: { [dow]: { start, end } | null }, breaks?: [] } */
export function isWithinSchedule(
  schedule: { days?: Record<string, { start: string; end: string } | null>; breaks?: Array<{ start: string; end: string }> } | null,
  startsAt: Date,
  endsAt: Date,
): boolean {
  if (!schedule?.days) return true; // no schedule configured → allow
  const day = schedule.days[String(startsAt.getUTCDay())];
  if (!day) return false;
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const dayStart = Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate());
  const s = dayStart + mins(day.start) * 60_000;
  const e = dayStart + mins(day.end) * 60_000;
  if (startsAt.getTime() < s || endsAt.getTime() > e) return false;
  for (const b of schedule.breaks ?? []) {
    const bs = dayStart + mins(b.start) * 60_000;
    const be = dayStart + mins(b.end) * 60_000;
    if (startsAt.getTime() < be && endsAt.getTime() > bs) return false;
  }
  return true;
}

function hashToInt(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** Prisma Decimal/BigInt are not JSON-serializable as-is; flatten for audit payloads. */
function toPlain<T extends object>(o: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(o, (_k, v) => (typeof v === 'bigint' || typeof v === 'object' && v !== null && 's' in v && 'e' in v ? String(v) : v))) as Prisma.InputJsonValue;
}
