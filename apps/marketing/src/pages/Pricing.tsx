import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, Skeleton } from '@salon/ui';
import type { PlanDto } from '@salon/core';
import { api } from '../api';

const FALLBACK: PlanDto[] = [
  { id: '1', code: 'START', name: 'Старт', description: 'Для небольшого салона', priceMonthly: 19900, priceYearly: 199000, limits: { maxResources: 3, maxBookingsPerMonth: 500, remindersEnabled: true, analyticsEnabled: false }, features: ['Онлайн-запись', 'Напоминания Telegram', 'Календарь'] },
  { id: '2', code: 'BUSINESS', name: 'Бизнес', description: 'Оптимально для 4–8 мастеров', priceMonthly: 39900, priceYearly: 399000, limits: { maxResources: 8, maxBookingsPerMonth: 2000, remindersEnabled: true, analyticsEnabled: true }, features: ['Всё из «Старт»', 'Аналитика выручки', 'Шаблоны услуг', 'Приоритетная поддержка'] },
  { id: '3', code: 'NETWORK', name: 'Сеть', description: 'Сети и крупные салоны', priceMonthly: 79900, priceYearly: 799000, limits: { maxResources: 50, maxBookingsPerMonth: -1, remindersEnabled: true, analyticsEnabled: true }, features: ['Всё из «Бизнес»', 'Ролевая модель команды', 'API-доступ (V1.2)'] },
];

function fmtKopecks(k: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(k / 100)) + ' ₽';
}

export default function PricingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<{ items: PlanDto[] }>('/billing/plans'),
  });
  const plans = data?.items && data.items.length > 0 ? data.items : FALLBACK;

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">← На главную</Link>
      <h1 className="mt-4 text-center text-4xl font-extrabold tracking-tight">Тарифы</h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
        14 дней бесплатно на любом тарифе. Карта не нужна. Отмена в один клик.
      </p>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {isLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-96 rounded-2xl" />)
          : plans.map((p, idx) => (
              <Card key={p.code} className={idx === 1 ? 'ring-2 ring-brand-500' : ''}>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">{p.name}</h2>
                    {idx === 1 && <Badge tone="brand">Популярный</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{p.description}</p>
                  <div className="mt-6">
                    <span className="text-4xl font-extrabold">{fmtKopecks(p.priceMonthly)}</span>
                    <span className="text-slate-500"> / мес</span>
                  </div>
                  <div className="mt-1 text-sm text-emerald-600">
                    {fmtKopecks(p.priceYearly)} / год — 2 месяца бесплатно
                  </div>
                  <ul className="mt-6 space-y-2 text-sm">
                    {(p.features ?? []).map((f) => (
                      <li key={f} className="flex gap-2"><span className="text-brand-600">✓</span>{f}</li>
                    ))}
                  </ul>
                  <Link to="/register" className="mt-8 block">
                    <Button variant={idx === 1 ? 'primary' : 'secondary'} className="w-full">Пробовать 14 дней</Button>
                  </Link>
                </div>
              </Card>
            ))}
      </div>

      <p className="mt-10 text-center text-sm text-slate-400">
        Цены указаны за салон. Оплата через ЮKassa · Безналичный расчёт по запросу
      </p>
    </div>
  );
}
