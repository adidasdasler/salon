import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { BookingStatus, UserRole } from '@salon/core';
import { Roles, CurrentUser, AuthContext } from '../common/decorators';
import { ok, parsePagination, paginationMeta } from '../common/helpers';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { BookingsService, CreateBookingDto } from './bookings.service';
import { SlotsService } from './slots.service';

/** Allowed status transitions for the calendar transition buttons (spec §6.2).
 * Keys are typed against the Prisma runtime enum ($Enums.BookingStatus string literals),
 * values are validated at read time before being passed to Prisma. */
const TRANSITIONS: Record<string, readonly string[]> = {
  SCHEDULED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'],
  ARRIVED: ['IN_PROGRESS', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly slots: SlotsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Calendar range list: ?from=ISO&to=ISO[&resourceId=][&status=] */
  @Get()
  async list(
    @CurrentUser() auth: AuthContext,
    @Query() q: { page?: number; limit?: number; from?: string; to?: string; resourceId?: string; status?: string },
  ) {
    const p = parsePagination(q);
    // Strict input validation — reject malformed dates/enums instead of NaN crashes.
    const ISO_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (q.from && (!ISO_RE.test(q.from) || Number.isNaN(Date.parse(q.from)))) {
      throw AppError.badRequest('VALIDATION_ERROR', 'Некорректный параметр from');
    }
    if (q.to && (!ISO_RE.test(q.to) || Number.isNaN(Date.parse(q.to)))) {
      throw AppError.badRequest('VALIDATION_ERROR', 'Некорректный параметр to');
    }
    if (q.resourceId && !UUID_RE.test(q.resourceId)) {
      throw AppError.badRequest('VALIDATION_ERROR', 'Некорректный параметр resourceId');
    }
    const VALID_STATUSES: string[] = Object.values(this.prisma.$Enums.BookingStatus);
    if (q.status && !VALID_STATUSES.includes(q.status)) {
      throw AppError.badRequest('VALIDATION_ERROR', 'Некорректный статус');
    }
    return this.prisma.withTenant(auth.tenantId, async (tx) => {
      const where = {
        ...(q.from ? { startsAt: { gte: new Date(q.from) } } : {}),
        ...(q.to ? { endsAt: { lte: new Date(q.to) } } : {}),
        ...(q.resourceId ? { resourceId: q.resourceId } : {}),
        ...(q.status ? { status: q.status as BookingStatus } : {}),
      };
      const [items, total] = await Promise.all([
        tx.booking.findMany({
          where,
          include: { customer: true, service: true, resource: true },
          skip: (p.page - 1) * p.limit,
          take: p.limit,
          orderBy: { startsAt: 'asc' },
        }),
        tx.booking.count({ where }),
      ]);
      return ok(items, paginationMeta(total, p));
    });
  }

  /** Free slots for a service/resource on a date (CRM + widget share logic). */
  @Get('slots')
  getSlots(
    @CurrentUser() auth: AuthContext,
    @Query() q: { serviceId: string; resourceId?: string; date: string }, // date: YYYY-MM-DD
  ) {
    return this.slots.findFreeSlots(auth.tenantId, q.serviceId, q.resourceId, q.date).then(ok);
  }

  @Post()
  create(@CurrentUser() auth: AuthContext, @Body() dto: CreateBookingDto) {
    return this.bookings.create(auth, dto);
  }

  /** Status transition with state machine validation. */
  @HttpCode(200)
  @Patch(':id/status')
  transition(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: { status: string; version: number },
  ) {
    const allowed: string[] = Object.values(this.prisma.$Enums.BookingStatus);
    if (!allowed.includes(dto.status)) {
      throw AppError.badRequest('VALIDATION_ERROR', 'Некорректный статус');
    }
    return this.bookings.transition(auth, id, dto.status as BookingStatus, dto.version);
  }

  @Patch(':id')
  update(
    @CurrentUser() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: Partial<CreateBookingDto> & { version: number },
  ) {
    return this.bookings.update(auth, id, dto);
  }

  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.ADMIN)
  @Delete(':id')
  remove(@CurrentUser() auth: AuthContext, @Param('id') id: string) {
    return this.bookings.remove(auth, id);
  }

  /** Expose allowed transitions map to the frontend calendar UI. */
  @Get('transitions')
  transitionsSchema() {
    return ok(TRANSITIONS);
  }
}
