import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingDto, CustomerDto } from '@salon/core';
import { formatMoney } from '@salon/core';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Spinner, toast } from '@salon/ui';
import { api } from '../api';

interface FormState { name: string; phone: string; email: string; notes: string; birthDate: string }
const EMPTY: FormState = { name: '', phone: '', email: '', notes: '', birthDate: '' };

export default function CustomersPage() {
  const qc = useQueryClient();
  const [q, setQ] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [editing, setEditing] = React.useState<CustomerDto | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [historyOf, setHistoryOf] = React.useState<CustomerDto | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY);

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.get<{ items: CustomerDto[] }>(`/customers?limit=100${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const history = useQuery({
    queryKey: ['customer-bookings', historyOf?.id],
    enabled: !!historyOf,
    queryFn: () => api.get<{ items: BookingDto[] }>(`/bookings?customerId=${historyOf!.id}&limit=50`),
  });

  const save = useMutation({
    mutationFn: (data: Partial<FormState>) =>
      editing ? api.patch(`/customers/${editing.id}`, data) : api.post('/customers', data),
    onSuccess: () => {
      toast.success(editing ? 'Клиент обновлён' : 'Клиент добавлен');
      void qc.invalidateQueries({ queryKey: ['customers'] });
      closeForm();
    },
    onError: (e: Error) => toast.error(e.message || 'Ошибка сохранения'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/customers/${id}`),
    onSuccess: () => { toast.success('Клиент удалён'); void qc.invalidateQueries({ queryKey: ['customers'] }); },
    onError: (e: Error) => toast.error(e.message || 'Ошибка удаления'),
  });

  function openCreate() { setEditing(null); setForm(EMPTY); setCreating(true); }
  function openEdit(c: CustomerDto) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', notes: c.notes ?? '', birthDate: c.birthDate?.slice(0, 10) ?? '' });
    setCreating(true);
  }
  function closeForm() { setCreating(false); setEditing(null); setForm(EMPTY); }

  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Клиенты</h1>
        <Button onClick={openCreate}>+ Добавить клиента</Button>
      </div>

      <Input placeholder="Поиск по имени или телефону…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      {list.isLoading ? (
        <div className="py-16 text-center"><Spinner className="mx-auto h-6 w-6" /></div>
      ) : items.length === 0 ? (
        <EmptyState title="Клиентов пока нет" description="Добавьте первого клиента — или они появятся после записей через виджет." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Имя</th>
                <th className="px-4 py-3 font-medium">Телефон</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Визиты</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Потрачено</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {c.name}
                    {c.tags?.length ? <Badge tone="brand" className="ml-2">{c.tags[0]}</Badge> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{c.totalVisits ?? 0}</td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">{formatMoney(Number(c.totalSpent ?? 0))}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => setHistoryOf(c)}>История</Button>
                      <Button size="sm" variant="secondary" onClick={() => openEdit(c)}>Изменить</Button>
                      <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => { if (confirm(`Удалить клиента ${c.name}?`)) remove.mutate(c.id); }}>Удалить</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={creating} onClose={closeForm} title={editing ? 'Редактировать клиента' : 'Новый клиент'}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}>
          <Field label="Имя" required><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Телефон" required><Input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7 900 000-00-00" /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="День рождения"><Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></Field>
          <Field label="Заметки"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeForm}>Отмена</Button>
            <Button type="submit" loading={save.isPending}>Сохранить</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!historyOf} onClose={() => setHistoryOf(null)} title={`История — ${historyOf?.name ?? ''}`}>
        {history.isLoading ? <Spinner className="mx-auto h-6 w-6" /> : (
          <div className="space-y-2">
            {(history.data?.items ?? []).map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
                <span>{new Date(b.startsAt).toLocaleDateString('ru-RU')} · {b.service?.name ?? 'Услуга'}</span>
                <span className="text-slate-500">{formatMoney(Number(b.price ?? 0))}</span>
              </div>
            ))}
            {(history.data?.items ?? []).length === 0 && <p className="py-6 text-center text-sm text-slate-400">Записей пока нет</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
