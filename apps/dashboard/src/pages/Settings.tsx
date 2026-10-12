import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TenantDto } from '@salon/core';
import { SLUG_RE } from '@salon/core';
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner, toast } from '@salon/ui';
import { api } from '../api';
import { useSession } from '../store';

const TIMEZONES = [
  'Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Asia/Yekaterinburg',
  'Asia/Omsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk',
  'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka', 'Europe/Kyiv', 'Asia/Almaty',
];

export default function SettingsPage() {
  const { user, tenant, setUser } = useSession();
  const qc = useQueryClient();
  const isOwner = user?.role === 'OWNER';

  const [tenantForm, setTenantForm] = React.useState({ name: '', timezone: 'Europe/Moscow' });
  const [pwdForm, setPwdForm] = React.useState({ currentPassword: '', newPassword: '' });
  const [twoFaSecret, setTwoFaSecret] = React.useState<{ otpauthUrl: string; secret: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = React.useState('');
  const [tgToken, setTgToken] = React.useState('');

  React.useEffect(() => {
    if (tenant) setTenantForm({ name: tenant.name, timezone: tenant.timezone });
  }, [tenant]);

  const reminders = useQuery({ queryKey: ['reminder-settings'], queryFn: () => api.get<{ settings: Record<string, unknown> }>('/reminders/settings') });

  const saveTenant = useMutation({
    mutationFn: () => api.patch<TenantDto>('/tenants/current', tenantForm),
    onSuccess: (t) => { setUser(user, t); toast.success('Салон обновлён'); },
    onError: (e: Error) => toast.error(e.message || 'Ошибка сохранения'),
  });

  const changePwd = useMutation({
    mutationFn: () => api.post('/auth/change-password', pwdForm),
    onSuccess: () => { toast.success('Пароль изменён'); setPwdForm({ currentPassword: '', newPassword: '' }); },
    onError: (e: Error) => toast.error(e.message || 'Не удалось изменить пароль'),
  });

  const setup2fa = useMutation({
    mutationFn: () => api.post<{ otpauthUrl: string; secret: string }>('/auth/2fa/setup', {}),
    onSuccess: (r) => setTwoFaSecret(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const verify2fa = useMutation({
    mutationFn: () => api.post('/auth/2fa/verify', { code: twoFaCode }),
    onSuccess: () => {
      toast.success('2FA включена');
      setTwoFaSecret(null); setTwoFaCode('');
      void qc.invalidateQueries({ queryKey: ['session'] });
      window.location.reload();
    },
    onError: (e: Error) => toast.error(e.message || 'Неверный код'),
  });

  const saveReminders = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/reminders/settings', data),
    onSuccess: () => { toast.success('Настройки напоминаний сохранены'); void qc.invalidateQueries({ queryKey: ['reminder-settings'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = (reminders.data?.settings ?? {}) as Record<string, boolean | string>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Настройки салона</h1>

      {/* Salon */}
      <Card className="p-5">
        <p className="mb-4 text-sm font-semibold">Профиль салона</p>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveTenant.mutate(); }}>
          <Field label="Название" required>
            <Input required value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} />
          </Field>
          <Field label="Часовой пояс">
            <Select value={tenantForm.timezone} onChange={(e) => setTenantForm({ ...tenantForm, timezone: e.target.value })}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </Select>
          </Field>
          <Field label="Публичная ссылка">
            <div className="flex items-center gap-2">
              <Input readOnly value={`${tenant?.subdomain ?? 'salon'}.salon.ru`} className="font-mono text-xs" />
              <Badge tone="brand">{SLUG_RE.test(tenant?.subdomain ?? '') ? 'виджет активен' : '—'}</Badge>
            </div>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={saveTenant.isPending}>Сохранить</Button>
          </div>
        </form>
      </Card>

      {/* Security */}
      <Card className="p-5">
        <p className="mb-4 text-sm font-semibold">Безопасность</p>
        <div className="space-y-5">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); changePwd.mutate(); }}>
            <Field label="Текущий пароль">
              <Input type="password" value={pwdForm.currentPassword} onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })} />
            </Field>
            <Field label="Новый пароль (мин. 8 символов)">
              <Input type="password" minLength={8} value={pwdForm.newPassword} onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })} />
            </Field>
            <Button type="submit" size="sm" variant="secondary" disabled={!pwdForm.currentPassword || pwdForm.newPassword.length < 8} loading={changePwd.isPending}>
              Изменить пароль
            </Button>
          </form>

          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-medium">Двухфакторная аутентификация</p>
            {user?.twoFactorEnabled ? (
              <Badge tone="emerald">2FA включена ✓</Badge>
            ) : (
              <>
                <p className="mb-3 text-xs text-slate-500">Обязательна для владельца и управляющего. Установите Google Authenticator / Yandex Key.</p>
                {!twoFaSecret ? (
                  <Button size="sm" onClick={() => setup2fa.mutate()} loading={setup2fa.isPending}>Включить 2FA</Button>
                ) : (
                  <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                    <p className="break-all font-mono text-[11px] text-slate-500">{twoFaSecret.secret}</p>
                    <p className="text-xs text-slate-500">Отсканируйте QR в приложении-аутентификаторе (otpauth-ссылка выше ведёт на генерацию QR).</p>
                    <div className="flex gap-2">
                      <Input placeholder="6-значный код" inputMode="numeric" maxLength={6} value={twoFaCode} onChange={(e) => setTwoFaCode(e.target.value)} className="w-40" />
                      <Button size="sm" disabled={twoFaCode.length !== 6} loading={verify2fa.isPending} onClick={() => verify2fa.mutate()}>Подтвердить</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Reminders */}
      {isOwner && (
        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold">Напоминания (Telegram)</p>
          {reminders.isLoading ? <Spinner className="mx-auto h-5 w-5" /> : (
            <div className="space-y-3">
              {([
                ['before24h', 'За 24 часа'],
                ['before2h', 'За 2 часа'],
                ['afterVisit', 'После визита (отзыв)'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
                  <span>{label}</span>
                  <input
                    type="checkbox" checked={!!s[key]}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600"
                    onChange={(e) => saveReminders.mutate({ ...s, [key]: e.target.checked })}
                  />
                </label>
              ))}
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-500">Подключить Telegram-бота</summary>
                <div className="mt-3 flex gap-2">
                  <Input placeholder="Токен бота от @BotFather" value={tgToken} onChange={(e) => setTgToken(e.target.value)} />
                  <Button size="sm" variant="secondary" disabled={!tgToken} onClick={() => saveReminders.mutate({ ...s, telegramToken: tgToken })}>Сохранить</Button>
                </div>
              </details>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
