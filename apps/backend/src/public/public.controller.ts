import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Public } from '../common/decorators';
import { ok, isBot } from '../common/helpers';
import { AppError } from '../common/app-error';
import { PrismaService } from '../database/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
import { SlotsService } from '../bookings/slots.service';

interface PublicBookDto {
  subdomain: string;
  serviceId: string;
  resourceId: string;
  startsAt: string;
  customerName: string;
  customerPhone: string;
  website?: string; // honeypot
  captchaToken?: string;
}

/**
 * Public booking widget endpoints (spec §5.2 Public). Resolved by tenant subdomain.
 * These are the only unauthenticated data endpoints — strictly read-only + book,
 * scoped to tenants with status TRIAL/ACTIVE.
 */
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly slots: SlotsService,
  ) {}

  @Public()
  @Get(':subdomain/salon')
  async salon(@Param('subdomain') subdomain: string) {
    const tenant = await this.resolve(subdomain);
    return ok({ name: tenant.name, timezone: tenant.timezone, plan: tenant.plan });
  }

  @Public()
  @Get(':subdomain/services')
  async services(@Param('subdomain') subdomain: string) {
    const tenant = await this.resolve(subdomain);
    const services = await this.prisma.withTenant(tenant.id, (tx) =>
      tx.service.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true, description: true, price: true, duration: true },
        orderBy: { name: 'asc' },
      }),
    );
    return ok(services);
  }

  @Public()
  @Get(':subdomain/resources')
  async resources(@Param('subdomain') subdomain: string, ) {
    const tenant = await this.resolve(subdomain);
    const items = await this.prisma.withTenant(tenant.id, (tx) =>
      tx.resource.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true, avatarUrl: true, capabilities: true },
        orderBy: { name: 'asc' },
      }),
    );
    return ok(items);
  }

  @Public()
  @Get(':subdomain/slots')
  slotsEp(
    @Param('subdomain') subdomain: string,
    @Query() q: { serviceId: string; resourceId?: string; date: string },
  ) {
    return this.resolve(subdomain)
      .then((tenant) => this.slots.findFreeSlots(tenant.id, q.serviceId, q.resourceId, q.date))
      .then(ok);
  }

  @Public()
  @Post('book')
  async book(@Body() dto: PublicBookDto) {
    if (isBot(dto)) throw AppError.badRequest('VALIDATION_ERROR', 'Форма заполнена неверно');
    const tenant = await this.resolve(dto.subdomain);

    return this.prisma.withTenant(tenant.id, async (tx) => {
      // find-or-create customer by phone (unique [tenantId, phone])
      let customer = await tx.customer.findFirst({ where: { phone: dto.customerPhone, deletedAt: null } });
      if (!customer) {
        customer = await tx.customer.create({
          data: { tenantId: tenant.id, name: dto.customerName, phone: dto.customerPhone, source: 'widget' },
        });
      }
      return customer.id;
    }).then(async (customerId) => {
      const booking = await this.bookings.createPublic(tenant.id, {
        customerId,
        resourceId: dto.resourceId,
        serviceId: dto.serviceId,
        startsAt: dto.startsAt,
        source: undefined, // forced WIDGET inside createPublic
      });
      return ok({ id: booking.id, startsAt: booking.startsAt, status: booking.status });
    });
  }

  private async resolve(subdomain: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { subdomain, deletedAt: null, status: { in: ['TRIAL', 'ACTIVE'] } },
    });
    if (!tenant) throw AppError.notFound('Салон недоступен для записи');
    return tenant;
  }
}
