import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, Honeypot, toast, Card } from '@salon/ui';
import { ApiError, type UserDto } from '@salon/core';
import { api } from '../api';
import { useSession } from '../store';

export default function LoginPage() {
  const nav = useNavigate();
  const setUser = useSession((s) => s.setUser);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [totp, setTotp] = React.useState('');
  const [need2fa, setNeed2fa] = React.useState(false);
  const [honeypot, setHoneypot] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (honeypot) return; // silently drop bots
    setLoading(true);
    try {
      await api.ensureCsrf();
      const body: Record<string, string> = { email, password };
      if (need2fa && totp) body.totpCode = totp;
      const r = await api.post<{ user: UserDto }>('/auth/login', body);
      setUser(r.user);
      toast.success(`С возвращением, ${r.user.name}!`);
      nav('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TWO_FACTOR_REQUIRED') {
        setNeed2fa(true);
        toast.info('Введите код из приложения-аутентификатора');
      } else if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Не удалось войти. Проверьте соединение.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-950 via-brand-800 to-sky-700 p-4">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-xl font-bold text-white">S</span>
          <h1 className="text-lg font-bold text-slate-900">Вход в Salon CRM</h1>
          <p className="mt-1 text-xs text-slate-500">Управление салоном красоты</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" required>
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@salon.ru" />
          </Field>
          <Field label="Пароль" required>
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </Field>
          {need2fa && (
            <Field label="Код 2FA" hint="6 цифр из Google Authenticator / Яндекс.Key">
              <Input inputMode="numeric" pattern="\d{6}" maxLength={6} autoFocus value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
            </Field>
          )}
          <Honeypot value={honeypot} onChange={setHoneypot} />
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            {need2fa ? 'Подтвердить' : 'Войти'}
          </Button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-400">
          Нет аккаунта?{' '}
          <a href="https://salon.ru/#/register" className="font-medium text-brand-600 hover:underline">Создать салон</a>
        </p>
      </Card>
    </div>
  );
}
