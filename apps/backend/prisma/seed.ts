/**
 * Seed: 3 plans + demo tenant (owner, masters, services, customers, bookings).
 * Run: pnpm --filter @salon/backend prisma:seed
 */
import { PrismaClient, TenantPlan, TenantStatus, UserRole, BookingStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PLANS = [
  { code: 'START', name: 'Старт', priceMonthly: 990_00n, priceYearly: 9_900_00n, sortOrder: 0,
    limits: { maxResources: 3, maxBookingsPerMonth: 500, remindersEnabled: true, analyticsEnabled: false },
    features: ['Онлайн-запись', 'До 3 мастеров', 'Напоминания Telegram'] },
  { code: 'BUSINESS', name: 'Бизнес', priceMonthly: 1990_00n, priceYearly: 19_900_00n, sortOrder: 1,
    limits: { maxResources: 10, maxBookingsPerMonth: 3000, remindersEnabled: true, analyticsEnabled: true },
    features: ['Всё из Старт', 'До 10 мастеров', 'Аналитика', 'Приоритетная поддержка'] },
  { code: 'NETWORK', name: 'Сеть', priceMonthly: 4990_00n, priceYearly: 49_900_00n, sortOrder: 2,
    limits: { maxResources: 100, maxBookingsPerMonth: 50000, remindersEnabled: true, analyticsEnabled: true },
    features: ['Всё из Бизнес', 'Мультифилиальность (V1.2)', 'API-доступ', 'Персональный менеджер'] },
];

async function main() {
  // Plans (upsert by code)
  for (const p of PLANS) {
    await prisma.plan.upsert({ where: { code: p.code }, update: p, create: p });
  }
  console.log('Plans seeded');

  const subdomain = process.env.SEED_SUBDOMAIN ?? 'demo';
  const existing = await prisma.tenant.findFirst({ where: { subdomain } });
  if (existing) {
    console.log(`Tenant "${subdomain}" already exists — skipping demo data`);
    return;
  }

  const passwordHash = await argon2.hash('Demo!passw0rd', { type: argon2.argon2id });
  const trialEndsAt = new Date(Date.now() + 14 * 86_400_000);

  const tenant = await prisma.tenant.create({
    data: { subdomain, name: 'Салон «Красота»', plan: TenantPlan.BUSINESS, status: TenantStatus.TRIAL, trialEndsAt },
  });

  const owner = await prisma.user.create({
    data: { tenantId: tenant.id, email: 'owner@demo.salon.ru', passwordHash, name: 'Анна Владелеева', role: UserRole.OWNER },
  });
  const masterUser = await prisma.user.create({
    data: { tenantId: tenant.id, email: 'master@demo.salon.ru', passwordHash, name: 'Мария Салонная', role: UserRole.MASTER },
  });

  const schedule = { days: { '1': { start: '09:00', end: '18:00' }, '2': { start: '09:00', end: '18:00' }, '3': { start: '09:00', end: '18:00' }, '4': { start: '09:00', end: '18:00' }, '5': { start: '09:00', end: '18:00' }, '6': { start: '10:00', end: '16:00' } } };

  const maria = await prisma.resource.create({
    data: { tenantId: tenant.id, userId: masterUser.id, name: 'Мария', phone: '+79000000001', capabilities: ['hair', 'nails'], schedule },
  });
  const irina = await prisma.resource.create({
    data: { tenantId: tenant.id, name: 'Ирина', phone: '+79000000002', capabilities: ['hair'], schedule },
  });

  const svcCut = await prisma.service.create({ data: { tenantId: tenant.id, name: 'Женская стрижка', price: 250_00n, duration: 60, bufferTime: 15 } });
  const svcMani = await prisma.service.create({ data: { tenantId: tenant.id, name: 'Маникюр с покрытием', price: 180_00n, duration: 90 } });
  const svcColor = await prisma.service.create({ data: { tenantId: tenant.id, name: 'Окрашивание', price: 550_00n, duration: 120, bufferTime: 15 } });
  await prisma.serviceResource.createMany({ data: [
    { resourceId: maria.id, serviceId: svcCut.id },
    { resourceId: maria.id, serviceId: svcMani.id },
    { resourceId: maria.id, serviceId: svcColor.id },
    { resourceId: irina.id, serviceId: svcCut.id },
    { resourceId: irina.id, serviceId: svcColor.id },
  ]});

  const cust1 = await prisma.customer.create({ data: { tenantId: tenant.id, name: 'Елена Клиентова', phone: '+79001112233', source: 'widget' } });
  const cust2 = await prisma.customer.create({ data: { tenantId: tenant.id, name: 'Ольга Петрова', phone: '+79004445566', source: 'manual' } });

  const mk = (dayOffset: number, hour: number, durMin: number) => {
    const startsAt = new Date(Date.UTC(2026, 9, 12 + dayOffset, hour, 0));
    return { startsAt, endsAt: new Date(startsAt.getTime() + durMin * 60_000) };
  };
  await prisma.booking.createMany({ data: [
    { ...mk(0, 10, 75), tenantId: tenant.id, customerId: cust1.id, resourceId: maria.id, serviceId: svcCut.id, price: 250_00n, status: BookingStatus.CONFIRMED, source: 'WIDGET' },
    { ...mk(0, 13, 90), tenantId: tenant.id, customerId: cust2.id, resourceId: maria.id, serviceId: svcMani.id, price: 180_00n, status: BookingStatus.SCHEDULED, source: 'MANUAL' },
    { ...mk(1, 11, 135), tenantId: tenant.id, customerId: cust1.id, resourceId: irina.id, serviceId: svcColor.id, price: 550_00n, status: BookingStatus.SCHEDULED, source: 'WIDGET' },
  ]});

  const plan = await prisma.plan.findUnique({ where: { code: 'BUSINESS' } });
  await prisma.subscription.create({
    data: { tenantId: tenant.id, planId: plan!.id, status: 'TRIAL', billingPeriod: 'MONTHLY', trialEndsAt, currentPeriodStart: new Date(), currentPeriodEnd: trialEndsAt },
  });

  console.log(`Demo tenant "${subdomain}" created. Login: owner@demo.salon.ru / Demo!passw0rd (owner ${owner.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
