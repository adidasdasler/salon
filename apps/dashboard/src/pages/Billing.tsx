import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentDto, PlanDto, SubscriptionDto } from '@salon/core';
import { formatMoney } from '@salon/core';
import { Badge, Button, Card, Field, Input, Modal, Spinner, toast } from '@salon/ui';
import { api } from '../api';

const STATUS_LABEL: Record<string, string> = {
  TRIAL: 'Пробный период', ACTIVE: 'Активна', PAST_DUE: 'Просрочена',
  CANCELLED: 'Отменена', EXPIRED: 'Истекла',
};
const STATUS_TONE: Record<string, 'emerald' | 'amber' | 'rose' | 'slate'> = {
  TRIAL: 'amber', ACTIVE: 'emerald', PAST_DUE: 'rose', CANCELLED: 'slate', EXPIRED: 'rose',
};

export default function BillingPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = React.useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [payPlan, setPayPlan] = React.useState<PlanDto | null>(null);

  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.get<{ items: PlanDto[] }>('/billing/plans') });
  const sub = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<SubscriptionDto>('/billing/subscription') });
  const payments = useQuery({ queryKey: ['payments'], queryFn: () => api.get<{ items: PaymentDto[] }>('/billing/payments?limit=12') });

  const choose = useMutation({
    mutationFn: (planId: string) => api.post('/billing/subscription/plan', { planId, billingPeriod: period }),
    onSuccess: () => { toast.success('Тариф выбран'); void qc.invalidateQueries({ queryKey: ['subscription'] }); },
    onError: (e: Error) => toast.error(e.message || 'Не удалось сменить тариф'),
  });

  const pay = useMutation({
    mutationFn: () => api.post<{ payment: PaymentDto; confirmationUrl: string }>('/billing/payments', {
      planId: payPlan!.id, billingPeriod: period,
    }),
    onSuccess: (r) => {
      const url = r?.confirmationUrl ?? (r as unknown as PaymentDto)?.confirmationUrl;
      if (url) window.location.href = url; // редирект в ЮKassa
      else toast.info ? toast.success('Перенаправление на оплату…') : undefined;
    },
    onError: (e: Error) => toast.error(e.message || 'Не удалось создать счёт на оплату'),
  });

  const cancel = useMutation({
    mutationFn: (resume: boolean) =>
      api.post(resume ? '/billing/subscription/resume' : '/billing/subscription/cancel', {}),
    onSuccess: () => { toast.success('Готово'); void qc.invalidateQueries({ queryKey: ['subscription'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentPlanId = sub.data?.plan?.id;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Подписка</h1>

      {sub.isLoading ? <Spinner className="mx-auto h-6 w-6" /> : sub.data && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm text-slate-500">Текущий тариф</p>
            <p className="font-semibold text-slate-900">{sub.data.plan?.name} · {sub.data.billingPeriod === 'YEARLY' ? 'годовая' : 'месячная'}</p>
            <p className="text-xs text-slate-400">
              Период до {new Date(sub.data.currentPeriodEnd).toLocaleDateString('ru-RU')}
            </p>
          </div>
          <Badge tone={STATUS_TONE[sub.data.status] ?? 'slate'}>{STATUS_LABEL[sub.data.status] ?? sub.data.status}</Badge>
          {sub.data.status === 'ACTIVE' && !sub.data.cancelAtPeriodEnd && (
            <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => cancel.mutate(false)}>
              Отменить подписку
            </Button>
          )}
          {sub.data.cancelAtPeriodEnd && (
            <Button size="sm" variant="secondary" loading={cancel.isPending} onClick={() => cancel.mutate(true)}>
              Возобновить
            </Button>
          )}
        </Card>
      )}

      {/* Переключатель периода */}
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {(['MONTHLY', 'YEARLY'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ' +
              (period === p ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-800')
            }
          >
            {p === 'MONTHLY' ? 'Помесячно' : 'За год −2 мес.'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {(plans.data?.items ?? []).map((pl) => {
          const price = period === 'MONTHLY' ? pl.priceMonthly : pl.priceYearly;
          const isCurrent = pl.id === currentPlanId;
          return (
            <Card key={pl.id} className={'flex flex-col p-5 ' + (isCurrent ? 'ring-2 ring-brand-500' : '')}>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{pl.name}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {formatMoney(price)}
                <span className="text-sm font-normal text-slate-400"> / {period === 'MONTHLY' ? 'мес' : 'год'}</span>
              </p>
              {pl.description && <p className="mt-1 text-xs text-slate-500">{pl.description}</p>}
              <ul className="mt-3 flex-1 space-y-1.5 text-sm text-slate-600">
                <li>✓ До {pl.limits.maxResources} мастеров</li>
                <li>✓ {pl.limits.maxBookingsPerMonth >= 1e9 ? 'Безлимит' : `До ${pl.limits.maxBookingsPerMonth}`} записей/мес</li>
                {pl.limits.remindersEnabled && <li>✓ Напоминания в Telegram</li>}
                {pl.limits.analyticsEnabled && <li>✓ Аналитика</li>}
                {pl.features.map((f) => <li key={f}>✓ {f}</li>)}
              </ul>
              <div className="mt-4 space-y-2">
                <Button className="w-full" variant={isCurrent ? 'secondary' : 'primary'} disabled={isCurrent} loading={choose.isPending} onClick={() => choose.mutate(pl.id)}>
                  {isCurrent ? 'Текущий тариф' : 'Выбрать'}
                </Button>
                {!isCurrent && (
                  <Button className="w-full" variant="secondary" onClick={() => setPayPlan(pl)}>Оплатить сейчас</Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <div className="border-b border-slate-100 px-4 py-3"><p className="text-sm font-semibold">История платежей</p></div>
        {payments.isLoading ? <div className="p-6 text-center"><Spinner className="mx-auto h-5 w-5" /></div> : (
          <div className="divide-y divide-slate-50">
            {(payments.data?.items ?? []).map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{new Date(p.createdAt).toLocaleDateString('ru-RU')}</span>
                <span className="font-medium">{formatMoney(p.amount)}</span>
                <Badge tone={p.status === 'SUCCEEDED' ? 'emerald' : p.status === 'PENDING' ? 'amber' : 'rose'}>
                  {p.status === 'SUCCEEDED' ? 'Оплачен' : p.status === 'PENDING' ? 'Ожидает' : p.status === 'FAILED' ? 'Ошибка' : 'Возврат'}
                </Badge>
              </div>
            ))}
            {(payments.data?.items ?? []).length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Платежей пока нет</p>}
          </div>
        )}
      </Card>

      <Modal open={!!payPlan} onClose={() => setPayPlan(null)} title={`Оплата — ${payPlan?.name ?? ''}`}>
        <p className="mb-4 text-sm text-slate-600">
          {payPlan ? formatMoney(period === 'MONTHLY' ? payPlan.priceMonthly : payPlan.priceYearly) : ''} ·{' '}
          {period === 'MONTHLY' ? 'помесячно' : 'за год}. Перенаправим на защищённую страницу ЮKassa.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPayPlan(null)}>Отмена</Button>
          <Button loading={pay.isPending} onClick={() => pay.mutate()}>Перейти к оплате</Button>
        </div>
      </Modal>
    </div>
  );
}
