import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ServiceDto } from '@salon/core';
import { formatMoney } from '@salon/core';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Spinner, Textarea, toast } from '@salon/ui';
import { api } from '../api';

interface FormState { name: string; description: string; priceRub: string; duration: string; bufferTime: string }
const EMPTY: FormState = { name: '', description: '', priceRub: '', duration: '60', bufferTime: '0' };

export default function ServicesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ServiceDto | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY);

  const list = useQuery({ queryKey: ['services'], queryFn: () => api.get<{ items: ServiceDto[] }>('/services?limit=100') });

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const data = {
        name: f.name,
        description: f.description || undefined,
        price: Math.round(Number(f.priceRub) * 100), // копейки
        duration: Number(f.duration),
        bufferTime: Number(f.bufferTime),
      };
      return editing ? api.patch(`/services/${editing.id}`, data) : api.post('/services', data);
    },
    onSuccess: () => {
      toast.success(editing ? 'Услуга обновлена' : 'Услуга создана');
      void qc.invalidateQueries({ queryKey: ['services'] });
      closeForm();
    },
    onError: (e: Error) => toast.error(e.message || 'Ошибка сохранения'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/services/${id}`),
    onSuccess: () => { toast.success('Услуга удалена'); void qc.invalidateQueries({ queryKey: ['services'] }); },
    onError: (e: Error) => toast.error(e.message || 'Ошибка удаления'),
  });

  function openCreate() { setEditing(null); setForm(EMPTY); setCreating(true); }
  function openEdit(s: ServiceDto) {
    setEditing(s);
    setForm({
      name: s.name, description: s.description ?? '',
      priceRub: String(Number(s.price) / 100), duration: String(s.duration), bufferTime: String(s.bufferTime ?? 0),
    });
    setCreating(true);
  }
  function closeForm() { setCreating(false); setEditing(null); setForm(EMPTY); }

  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Услуги</h1>
        <Button onClick={openCreate}>+ Создать услугу</Button>
      </div>

      {list.isLoading ? (
        <div className="py-16 text-center"><Spinner className="mx-auto h-6 w-6" /></div>
      ) : items.length === 0 ? (
        <EmptyState title="Услуг пока нет" description="Создайте прайс — клиенты увидят его в виджете записи." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <Card key={s.id} className="flex flex-col p-4">
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{s.name}</p>
                <Badge tone={s.isActive ? 'emerald' : 'slate'}>{s.isActive ? 'Активна' : 'Скрыта'}</Badge>
              </div>
              {s.description && <p className="mb-2 line-clamp-2 text-xs text-slate-500">{s.description}</p>}
              <p className="mt-auto text-sm font-semibold text-brand-700">{formatMoney(Number(s.price))}</p>
              <p className="text-xs text-slate-400">
                {s.duration} мин{Number(s.bufferTime) > 0 ? ` + ${s.bufferTime} мин перерыв` : ''}
              </p>
              <div className="mt-3 flex justify-end gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => openEdit(s)}>Изменить</Button>
                <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => { if (confirm(`Удалить услугу «${s.name}»?`)) remove.mutate(s.id); }}>Удалить</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={closeForm} title={editing ? 'Редактировать услугу' : 'Новая услуга'}>
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}
        >
          <Field label="Название" required><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Описание"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Цена, ₽" required><Input required type="number" min="0" step="0.01" value={form.priceRub} onChange={(e) => setForm({ ...form, priceRub: e.target.value })} /></Field>
            <Field label="Длит., мин" required><Input required type="number" min="5" max="600" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></Field>
            <Field label="Перерыв, мин"><Input type="number" min="0" max="120" value={form.bufferTime} onChange={(e) => setForm({ ...form, bufferTime: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeForm}>Отмена</Button>
            <Button type="submit" loading={save.isPending}>Сохранить</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
