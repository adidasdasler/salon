import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResourceDto, ServiceDto } from '@salon/core';
import { formatMoney } from '@salon/core';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Tabs, toast } from '@salon/ui';
import { api } from '../api';

const DAYS = [
  ['mon', 'Пн'], ['tue', 'Вт'], ['wed', 'Ср'], ['thu', 'Чт'], ['fri', 'Пт'], ['sat', 'Сб'], ['sun', 'Вс'],
] as const;

interface ScheduleDay { work: boolean; start: string; end: string }
type Schedule = Record<string, ScheduleDay>;

const DEFAULT_SCHEDULE: Schedule = Object.fromEntries(
  DAYS.map(([k]) => [k, { work: k !== 'sun', start: '10:00', end: '19:00' }]),
);

interface FormState { name: string; phone: string; email: string }

export default function ResourcesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ResourceDto | null>(null);
  const [form, setForm] = React.useState<FormState>({ name: '', phone: '', email: '' });

  const list = useQuery({ queryKey: ['resources'], queryFn: () => api.get<{ items: ResourceDto[] }>('/resources?limit=100') });
  const services = useQuery({ queryKey: ['services'], queryFn: () => api.get<{ items: ServiceDto[] }>('/services?limit=100') });

  const save = useMutation({
    mutationFn: (data: Partial<FormState>) =>
      editing ? api.patch(`/resources/${editing.id}`, data) : api.post('/resources', data),
    onSuccess: () => {
      toast.success(editing ? 'Мастер обновлён' : 'Мастер добавлен');
      void qc.invalidateQueries({ queryKey: ['resources'] });
      closeForm();
    },
    onError: (e: Error) => toast.error(e.message || 'Ошибка сохранения'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/resources/${id}`),
    onSuccess: () => { toast.success('Мастер удалён'); void qc.invalidateQueries({ queryKey: ['resources'] }); },
    onError: (e: Error) => toast.error(e.message || 'Ошибка удаления'),
  });

  function openCreate() { setEditing(null); setForm({ name: '', phone: '', email: '' }); setCreating(true); }
  function openEdit(r: ResourceDto) {
    setEditing(r);
    setForm({ name: r.name, phone: r.phone ?? '', email: r.email ?? '' });
    setCreating(true);
  }
  function closeForm() { setCreating(false); setEditing(null); }

  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Мастера</h1>
        <Button onClick={openCreate}>+ Добавить мастера</Button>
      </div>

      {list.isLoading ? (
        <div className="py-16 text-center"><Spinner className="mx-auto h-6 w-6" /></div>
      ) : items.length === 0 ? (
        <EmptyState title="Мастеров пока нет" description="Добавьте мастеров — они понадобятся для записей." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <Card key={r.id} className="flex flex-col p-4">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-500">{r.phone}</p>
                </div>
                <Badge tone={r.isActive ? 'emerald' : 'slate'}>{r.isActive ? 'Активен' : 'Неактивен'}</Badge>
              </div>
              <ResourceServices resourceId={r.id} allServices={services.data?.items ?? []} onSaved={() => void qc.invalidateQueries({ queryKey: ['resources'] })} />
              <div className="mt-auto flex justify-end gap-1.5 pt-3">
                <ScheduleModal resource={r} />
                <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>Изменить</Button>
                <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => { if (confirm(`Удалить ${r.name}?`)) remove.mutate(r.id); }}>Удалить</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={closeForm} title={editing ? 'Редактировать мастера' : 'Новый мастер'}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
          <Field label="Имя" required><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Телефон"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeForm}>Отмена</Button>
            <Button type="submit" loading={save.isPending}>Сохранить</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/** Чек-лист услуг, которые оказывает мастер (ServiceResource m2m). */
function ResourceServices({ resourceId, allServices, onSaved }: { resourceId: string; allServices: ServiceDto[]; onSaved: () => void }) {
  const res = useQuery({ queryKey: ['resource-services', resourceId], queryFn: () => api.get<{ serviceIds: string[] }>(`/resources/${resourceId}/services`) });
  const toggle = useMutation({
    mutationFn: ({ serviceId, on }: { serviceId: string; on: boolean }) =>
      on ? api.post(`/resources/${resourceId}/services`, { serviceId }) : api.del(`/resources/${resourceId}/services/${serviceId}`),
    onSuccess: () => { onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const ids = new Set(res.data?.serviceIds ?? []);
  if (allServices.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {allServices.slice(0, 8).map((s) => (
        <button
          key={s.id}
          onClick={() => toggle.mutate({ serviceId: s.id, on: !ids.has(s.id) })}
          className={
            'rounded-full border px-2.5 py-1 text-[11px] transition-colors ' +
            (ids.has(s.id) ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-400 hover:border-slate-300')
          }
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

/** Редактор расписания мастера (JSON schedule). */
function ScheduleModal({ resource }: { resource: ResourceDto }) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState('mon');
  const [sched, setSched] = React.useState<Schedule>(DEFAULT_SCHEDULE);

  React.useEffect(() => {
    if (open) setSched({ ...DEFAULT_SCHEDULE, ...(resource.schedule as unknown as Schedule) });
  }, [open, resource.schedule]);

  const save = useMutation({
    mutationFn: () => api.patch(`/resources/${resource.id}`, { schedule: sched }),
    onSuccess: () => { toast.success('Расписание сохранено'); setOpen(false); },
    onError: (e: Error) => toast.error(e.message || 'Ошибка сохранения расписания'),
  });

  const day = sched[tab] ?? { work: true, start: '10:00', end: '19:00' };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>🗓 Расписание</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Расписание — ${resource.name}`}>
        <Tabs tabs={DAYS.map(([id, label]) => ({ id, label }))} active={tab} onChange={setTab} />
        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox" checked={day.work}
              onChange={(e) => setSched({ ...sched, [tab]: { ...day, work: e.target.checked } })}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Рабочий день
          </label>
          {day.work && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Начало">
                <Input type="time" value={day.start} onChange={(e) => setSched({ ...sched, [tab]: { ...day, start: e.target.value } })} />
              </Field>
              <Field label="Конец">
                <Input type="time" value={day.end} onChange={(e) => setSched({ ...sched, [tab]: { ...day, end: e.target.value } })} />
              </Field>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Отмена</Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>Сохранить</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
