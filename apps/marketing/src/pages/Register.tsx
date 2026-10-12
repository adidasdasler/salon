import React from 'react';
import { Link } from "react-router-dom";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Field, Honeypot, Input, toast } from '@salon/ui';
import { ApiError } from '@salon/core';
import { api } from '../api';

const schema = z.object({
  salonName: z.string().min(2, 'Минимум 2 символа').max(120),
  subdomain: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Строчные латиница/цифры/дефис, 3–40 символов'),
  name: z.string().min(2, 'Укажите ваше имя').max(80),
  email: z.string().email('Некорректный email'),
  phone: z
    .string()
    .regex(/^\+?[78][\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/, 'Некорректный телефон')
    .optional()
    .or(z.literal('')),
  password: z.string().min(8, 'Минимум 8 символов').max(128),
  privacyConsent: z.literal(true, { errorMap: () => ({ message: 'Нужно согласие на обработку ПДн' }) }),
});

type FormValues = z.input<typeof schema>;

export default function RegisterPage() {
  const [website, setWebsite] = React.useState(''); // honeypot
  const [subCheck, setSubCheck] = React.useState<'idle' | 'checking' | 'free' | 'taken'>('idle');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { subdomain: '' } });

  const subdomain = watch('subdomain', '');

  // Debounced availability check against public endpoint (spec §5.2)
  React.useEffect(() => {
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(subdomain)) {
      setSubCheck('idle');
      return;
    }
    setSubCheck('checking');
    const t = setTimeout(async () => {
      try {
        const r = await api.get<{ available: boolean }>(`/tenants/check-subdomain?subdomain=${encodeURIComponent(subdomain)}`);
        setSubCheck(r.available ? 'free' : 'taken');
      } catch {
        setSubCheck('idle');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [subdomain]);

  const onSubmit = handleSubmit(async (values) => {
    if (website !== '') return; // honeypot — silently drop bots
    try {
      await api.post('/auth/register', {
        ...values,
        phone: values.phone || undefined,
        website,
        captchaToken: (window as { YandexSmartCaptcha?: { getToken?: () => Promise<string> } }).YandexSmartCaptcha?.getToken
          ? await (window as never as { YandexSmartCaptcha: { getToken: () => Promise<string> } }).YandexSmartCaptcha.getToken()
          : undefined,
      });
      toast.success('Создаём ваш салон…');
      // Session cookies are set by the server (domain .salon.ru) — redirect to CRM onboarding.
      window.location.href = import.meta.env.VITE_APP_URL ?? 'https://app.salon.ru';
    } catch (e) {
      const err = e as ApiError;
      toast.error(err?.message ?? 'Не удалось зарегистрироваться. Попробуйте ещё раз.');
    }
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <Link to="/" className="mb-8 flex items-center gap-2 text-lg font-bold">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">💈</span> Salon
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Создать салон</h1>
      <p className="mt-2 text-sm text-slate-600">14 дней бесплатно · карта не нужна · отмена в один клик</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate>
        <Field label="Название салона" error={errors.salonName?.message}>
          <Input placeholder="Ромашка" {...register('salonName')} autoComplete="organization" />
        </Field>

        <Field
          label="Адрес для записей"
          error={errors.subdomain?.message ?? (subCheck === 'taken' ? 'Этот адрес уже занят' : undefined)}
          hint={
            subdomain && subCheck !== 'idle' ? (
              <span className={subCheck === 'free' ? 'text-emerald-600' : 'text-slate-500'}>
                {subCheck === 'checking' && 'Проверяем…'}
                {subCheck === 'free' && `✅ ${subdomain}.salon.ru свободен`}
                {subCheck === 'taken' && `${subdomain}.salon.ru занят`}
              </span>
            ) : (
              `${subdomain || 'ваш-салон'}.salon.ru`
            )
          }
        >
          <Input placeholder="vash-salon" {...register('subdomain')} autoCapitalize="none" spellCheck={false} />
        </Field>

        <Field label="Ваше имя" error={errors.name?.message}>
          <Input placeholder="Иван Петров" {...register('name')} autoComplete="name" />
        </Field>

        <Field label="Email" error={errors.email?.message}>
          <Input type="email" placeholder="you@salon.ru" {...register('email')} autoComplete="email" />
        </Field>

        <Field label="Телефон (необязательно)" error={errors.phone?.message}>
          <Input type="tel" placeholder="+7 900 000-00-00" {...register('phone')} autoComplete="tel" />
        </Field>

        <Field label="Пароль" error={errors.password?.message} hint="Минимум 8 символов">
          <Input type="password" placeholder="••••••••" {...register('password')} autoComplete="new-password" />
        </Field>

        <Honeypot value={website} onChange={setWebsite} />

        <label className="flex items-start gap-3 text-sm text-slate-600">
          <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 accent-brand-600" {...register('privacyConsent')} />
          <span>
            Согласен с <a href="/offer.pdf" target="_blank" rel="noreferrer" className="text-brand-600 underline">офертой</a> и{' '}
            <a href="/privacy.pdf" target="_blank" rel="noreferrer" className="text-brand-600 underline">политикой обработки ПДн</a>{' '}
            (152-ФЗ)
          </span>
        </label>
        {errors.privacyConsent && <p className="text-sm text-red-600">{errors.privacyConsent.message}</p>}

        <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || subCheck === 'taken'}>
          {isSubmitting ? 'Создаём…' : 'Создать салон бесплатно'}
        </Button>

        <p className="text-center text-sm text-slate-500">
          Уже есть аккаунт? <a href="https://app.salon.ru" className="font-medium text-brand-600 hover:underline">Войти в CRM</a>
        </p>
      </form>
    </div>
  );
}
