import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingDto, CustomerDto, ResourceDto, ServiceDto, BookingStatus } from '@salon/core';
import { formatMoney } from '@salon/core';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, toast } from '@salon/ui';
import { api } from '../api';

const STATUS_TONE: Record<BookingStatus, string> = {
  SCHEDULED: 'amber', CONFIRMED: 'sky', ARRIVED: 'violet', IN_PROGRESS: 'brand',
  COMPLETED: 'emerald', CANCELLED: 'slate', NO_SHOW: 'rose',
};
const STATUS_LABEL: Record<BookingStatus, string> = {
  SCHEDULED: 'Запланирована', CONFIRMED: 'Подтверждена', ARRIVED: 'Пришла',
  IN_PROGRESS: 'В процессе', COMPLETED: 'Завершена', CANCELLED: 'Отменена', NO_SHOW: 'Неявка',
};
/** Разрешённые переходы статусов (§5.3). */
const NEXT: Record<BookingStatus, BookingStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW'],
  ARRIVED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [], CANCELLED: [], NO_SHOW: [],
};

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CalendarPage() {
  const qc = useQueryClient();
  const [date, setDate] = React.useState(isoDay(new Date()));
  const [creating, setCreating] = React.useState(false);

  const bookings = useQuery({
    queryKey: ['bookings', date],
    queryFn: () =>
      api.get<{ items: BookingDto[] }>(
        `/bookings?startsAtFrom=${encodeURIComponent(`${date}T00:00:00`)}&startsAtTo=${encodeURIComponent(`${date}T23:59:59`)}&limit=100`,
      ),
  });

  const transition = useMutation({
    mutationFn: ({ id, status, version }: { id: string; status: BookingStatus; version: number }) =>
      api.patch(`/bookings/${id}`, { status, version }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['bookings'] }); toast.success('Статус обновлён'); },
    onError: (e: Error) => toast.error(e.message || 'Ошибка обновления'),
  });

  const shift = (days: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    setDate(isoDay(d));
  };

  const sorted = (bookings.data?.items ?? []).slice().sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Календарь записей</h1>
        <Button onClick={() => setCreating(true)}>+ Новая запись</Button>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-2 p-3">
          <Button variant="secondary" size="sm" onClick={() => shift(-1)}>←</Button>
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <Button variant="secondary" size="sm" onClick={() => shift(1)}>→</Button>
          <Button variant="ghost" size="sm" onClick={() => setDate(isoDay(new Date()))}>Сегодня</Button>
        </div>
      </Card>

      {bookings.isLoading ? (
        <div className="py-16 text-center"><Spinner className="mx-auto h-6 w-6" /></div>
      ) : sorted.length === 0 ? (
        <EmptyState title="На этот день записей нет" description="Создайте первую запись кнопкой выше." />
      ) : (
        <div className="space-y-2">
          {sorted.map((b) => (
            <Card key={b.id} className="p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="w-24 shrink-0 font-mono text-sm font-semibold text-brand-700">
                  {new Date(b.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{b.customer?.name ?? 'Клиент'} · {b.service?.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {b.resource?.name ?? ''} {b.price != null ? `· ${formatMoney(Number(b.price))}` : ''}
                    {' '}· {STATUS_LABEL[b.source as keyof typeof STATUS_LABEL] ?? (b.source === 'WIDGET' ? 'Виджет' : b.source === 'MANUAL' ? 'Вручную' : '')}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[b.status] as never}>{STATUS_LABEL[b.status]}</Badge>
                <div className="flex flex-wrap gap-1.5">
                  {NEXT[b.status].map((s) => (
                    <Button
                      key={s} size="sm"
                      variant={s === 'CANCELLED' || s === 'NO_SHOW' ? 'ghost' : 'secondary'}
                      loading={transition.isPending && transition.variables?.id === b.id}
                      onClick={() => transition.mutate({ id: b.id, status: s, version: b.version })}
                    >
                      {STATUS_LABEL[s]}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateBookingModal open={creating} onClose={() => setCreating(false)} date={date} onCreated={() => void bookings.refetch()} />
    </div>
  );
}

function CreateBookingModal({ open, onClose, date, onCreated }: { open: boolean; onClose: () => void; date: string; onCreated: () => void }) {
  const [customerId, setCustomerId] = React.useState('');
  const [resourceId, setResourceId] = React.useState('');
  const [serviceId, setServiceId] = React.useState('');
  const [startsAt, setStartsAt] = React.useState(`${date}T10:00`);

  const customers = useQuery({
    queryKey: ['customers-mini'], enabled: open,
    queryFn: () => api.get<{ items: CustomerDto[] }>('/customers?limit=100'),
  });
  const resources = useQuery({
    queryKey: ['resources-mini'], enabled: open,
    queryFn: () => api.get<{ items: ResourceDto[] }>('/resources?limit=100'),
  });
  const services = useQuery({
    queryKey: ['services-mini'], enabled: open,
    queryFn: () => api.get<{ items: ServiceDto[] }>('/services?limit=100'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/bookings', { customerId, resourceId, serviceId, startsAt: new Date(startsAt).toISOString() }),
    onSuccess: () => { toast.success('Запись создана'); onCreated(); onClose(); },
    onError: (e: Error) => toast.error(e.message || 'Ошибка создания записи'),
  });

  const valid = customerId && resourceId && serviceId && startsAt;

  return (
    <Modal open={open} onClose={onClose} title="Новая запись">
      <form
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }}
      >
        <Field label="Клиент" required>
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— выберите —</option>
            {(customers.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
          </Select>
        </Field>
        <Field label="Услуга" required>
          <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">— выберите —</option>
            {(services.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {formatMoney(Number(s.price))}</option>)}
          </Select>
        </Field>
        <Field label="Мастер" required>
          <Select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
            <option value="">— выберите —</option>
            {(resources.data?.items ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Начало" required>
          <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Отмена</Button>
          <Button type="submit" disabled={!valid} loading={create.isPending}>Создать</Button>
        </div>
      </form>
    </Modal>
  );
}
