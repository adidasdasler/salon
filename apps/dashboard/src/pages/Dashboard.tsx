import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { Card, CardHeader, CardBody, StatCard, Badge, EmptyState, Skeleton, Button } from '@salon/ui';
import { formatMoney, WsEvents, tenantCalendarRoom, type BookingStatus } from '@salon/core';
import { api } from '../api';
import { useSession } from '../store';

const STATUS_TONE: Record<string, 'slate' | 'brand' | 'green' | 'amber' | 'rose' | 'sky' | 'violet'> = {
  SCHEDULED: 'sky', CONFIRMED: 'brand', ARRIVED: 'violet', IN_PROGRESS: 'amber',
  COMPLETED: 'green', CANCELLED: 'slate', NO_SHOW: 'rose',
};
export const STATUS_LABEL_RU: Record<BookingStatus, string> = {
  SCHEDULED: 'Записан', CONFIRMED: 'Подтверждён', ARRIVED: 'Пришёл', IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершён', CANCELLED: 'Отменён', NO_SHOW: 'Неявка',
};

interface Summary { revenueKopecks: number; bookings: number; completed: number; noShowRate: number; avgCheckKopecks: number }
interface Upcoming { id: string; startsAt: string; status: BookingStatus; price: unknown; customer: { name: string }; service: { name: string }; resource: { name: string } }

/** Real-time hook — subscribes to tenant calendar room (spec §7.1). */
export function useCalendarRealtime(onEvent: () => void) {
  const tenantId = useSession((s) => s.tenant?.id);
  React.useEffect(() => {
    if (!tenantId) return;
    let socket: Socket | undefined;
    try {
      socket = io('/', { path: '/socket.io', transports: ['websocket', 'polling'], withCredentials: true });
      socket.emit('tenant:subscribe', { roomId: tenantCalendarRoom(tenantId) });
      [WsEvents.BookingCreated, WsEvents.BookingUpdated, WsEvents.BookingDeleted].forEach((ev) =>
        socket!.on(ev, onEvent),
      );
    } catch { /* WS optional — polling fallback via refetchInterval */ }
    return () => socket?.close();
  }, [tenantId, onEvent]);
}

export default function DashboardPage() {
  const qc = useQueryClient();
  const refresh = React.useCallback(() => { void qc.invalidateQueries(); }, [qc]);
  useCalendarRealtime(refresh);

  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 29 * 86_400_000).toISOString().slice(0, 10);

  const summary = useQuery({ queryKey: ['summary', from, to], queryFn: () => api.get<Summary>(`/analytics/summary?from=${from}&to=${to}`) });
  const upcoming = useQuery({
    queryKey: ['upcoming'],
    queryFn: () => api.get<Upcoming[]>('/analytics/upcoming'),
    refetchInterval: 30_000,
  });

  const tenant = useSession((s) => s.tenant);
  const needsOnboarding = !summary.data || summary.data.bookings === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Привет, {useSession.getState().user?.name.split(' ')[0]} 👋</h1>
          <p className="text-xs text-slate-500">{tenant?.name} · последние 30 дней</p>
        </div>
        <Link to="/calendar" className="hidden sm:block"><Badge tone="brand">Календарь →</Badge></Link>
      </div>

      {needsOnboarding && (
        <Card className="border-brand-200 bg-brand-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-brand-900">Похоже, салон ещё не настроен. Пройдите онбординг за 2 минуты.</p>
            <Link to="/onboarding"><Button size="sm">Пройти онбординг →</Button></Link>
          </div>
        </Card>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <StatCard label="Выручка" value={formatMoney(summary.data?.revenueKopecks ?? 0)} tone="green" delta={`${summary.data?.bookings ?? 0} записей`} />
            <StatCard label="Средний чек" value={formatMoney(summary.data?.avgCheckKopecks ?? 0)} tone="brand" />
            <StatCard label="Завершено" value={summary.data?.completed ?? 0} tone="sky" />
            <StatCard label="Неявки" value={`${summary.data?.noShowRate ?? 0}%`} tone={((summary.data?.noShowRate ?? 0) > 15) ? 'rose' : 'green'} delta="цель < 10%" />
          </>
        )}
      </div>

      {/* Upcoming appointments */}
      <Card>
        <CardHeader title="Ближайшие записи" subtitle="Обновляются в реальном времени" action={<Link to="/calendar" className="text-xs font-medium text-brand-600 hover:underline">Все →</Link>} />
        <CardBody className="p-0">
          {upcoming.isLoading ? (
            <div className="space-y-2 p-5">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : !upcoming.data?.length ? (
            <div className="p-5"><EmptyState icon="🗓️" title="Записей пока нет" description="Клиенты увидят ваш салон по ссылке salon.ru-виджета или добавьте запись вручную в календаре." /></div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.data.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-[10px] uppercase text-slate-400">{new Date(b.startsAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}</p>
                    <p className="text-sm font-bold text-slate-800">{new Date(b.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.customer.name} — {b.service.name}</p>
                    <p className="text-xs text-slate-400">{b.resource.name}</p>
                  </div>
                  <span className="hidden text-sm font-semibold sm:block">{formatMoney(Number(b.price))}</span>
                  <Badge tone={STATUS_TONE[b.status] ?? 'slate'}>{STATUS_LABEL_RU[b.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

