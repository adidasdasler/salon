import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@salon/core';
import { UserRole } from '@salon/core';
import { Avatar, Badge, Button, Card, Field, Input, Modal, Select, Spinner, toast } from '@salon/ui';
import { api } from '../api';
import { useSession } from '../store';

const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: 'Владелец', MANAGER: 'Управляющий', ADMIN: 'Администратор', MASTER: 'Мастер',
};

export default function TeamPage() {
  const qc = useQueryClient();
  const me = useSession((s) => s.user);
  const canManage = me?.role === UserRole.OWNER || me?.role === UserRole.MANAGER;
  const isOwner = me?.role === UserRole.OWNER;

  const [inviting, setInviting] = React.useState(false);
  const [editing, setEditing] = React.useState<UserDto | null>(null);
  const [form, setForm] = React.useState({ name: '', email: '', phone: '', role: UserRole.MASTER as UserRole, password: '' });

  const list = useQuery({ queryKey: ['users'], queryFn: () => api.get<{ items: UserDto[] }>('/users?limit=100') });

  const invite = useMutation({
    mutationFn: () => api.post('/users/invite', {
      name: form.name, email: form.email, phone: form.phone || undefined, role: form.role,
      ...(form.password ? { password: form.password } : {}),
    }),
    onSuccess: () => { toast.success('Приглашение отправлено'); void qc.invalidateQueries({ queryKey: ['users'] }); close(); },
    onError: (e: Error) => toast.error(e.message || 'Ошибка приглашения'),
  });

  const update = useMutation({
    mutationFn: () => api.patch(`/users/${editing!.id}`, { name: form.name, role: form.role, phone: form.phone || undefined }),
    onSuccess: () => { toast.success('Участник обновлён'); void qc.invalidateQueries({ queryKey: ['users'] }); close(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/revoke-sessions`, {}),
    onSuccess: () => toast.success('Сессии завершены'),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/users/${id}`),
    onSuccess: () => { toast.success('Удалён'); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function close() { setInviting(false); setEditing(null); setForm({ name: '', email: '', phone: '', role: UserRole.MASTER, password: '' }); }
  function openInvite() { setEditing(null); setForm({ name: '', email: '', phone: '', role: UserRole.MASTER, password: '' }); setInviting(true); }
  function openEdit(u: UserDto) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, phone: u.phone ?? '', role: u.role, password: '' });
    setInviting(true);
  }

  const items = list.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Команда</h1>
        {canManage && <Button onClick={openInvite}>+ Пригласить</Button>}
      </div>

      {list.isLoading ? <div className="py-16 text-center"><Spinner className="mx-auto h-6 w-6" /></div> : (
        <Card className="divide-y divide-slate-50">
          {items.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={u.name} src={u.avatarUrl} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {u.name} {u.id === me?.id && <span className="text-xs font-normal text-slate-400">(вы)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{u.email}</p>
              </div>
              <Badge tone={u.role === UserRole.OWNER ? 'brand' : 'slate'}>{ROLE_LABEL[u.role]}</Badge>
              {u.twoFactorEnabled && <Badge tone="emerald">2FA ✓</Badge>}
              {canManage && u.role !== UserRole.OWNER && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>Изменить</Button>
                  <Button size="sm" variant="ghost" onClick={() => revoke.mutate(u.id)}>Сброс сессий</Button>
                  {isOwner && (
                    <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => { if (confirm(`Удалить ${u.name}?`)) remove.mutate(u.id); }}>Удалить</Button>
                  )}
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">Команда пуста</p>}
        </Card>
      )}

      <Modal open={inviting} onClose={close} title={editing ? 'Редактировать участника' : 'Пригласить в команду'}>
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); editing ? update.mutate() : invite.mutate(); }}
        >
          <Field label="Имя" required><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          {!editing && (
            <>
              <Field label="Email" required><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Пароль (временный)" required>
                <Input required type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
            </>
          )}
          <Field label="Телефон"><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Роль" required>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              <option value={UserRole.MANAGER}>Управляющий</option>
              <option value={UserRole.ADMIN}>Администратор</option>
              <option value={UserRole.MASTER}>Мастер</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={close}>Отмена</Button>
            <Button type="submit" loading={invite.isPending || update.isPending}>
              {editing ? 'Сохранить' : 'Пригласить'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
