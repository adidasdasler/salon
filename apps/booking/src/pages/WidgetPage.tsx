import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { formatMoney, qs, type SlotDto } from '@salon/core';
import { api } from '../api';
import {
  Badge, Button, Card, CardBody, EmptyState, Field, Honeypot, Input, PageSpinner, Spinner, toast,
} from '@salon/ui';

interface PubService { id: string; name: string; description: string | null; price: unknown; duration: number }
interface PubResource { id: string; name: string; avatarUrl: string | null; capabilities: string[] }
interface PubSalon { name: string; timezone: string }

type Step = 'service' | 'master' | 'time' | 'confirm' | 'done';

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WidgetPage() {
  const params = useParams<{ salon: string }>();
  const subdomain = (params.salon ?? 'demo').toLowerCase();

  const [step, setStep] = React.useState<Step>('service');
  const [service, setService] = React.useState<PubService | null>(null);
  const [resource, setResource] = React.useState<PubResource | null>(null);
  const [date, setDate] = React.useState<Date>(new Date());
  const [slot, setSlot] = React.useState<SlotDto | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [honeypot, setHoneypot] = React.useState('');

  const salonQ = useQuery({
    queryKey: ['pub', 'salon', subdomain],
    queryFn: () => api.get<PubSalon>(`/public/${subdomain}/salon`),
  });
  const servicesQ = useQuery({
    queryKey: ['pub', 'services', subdomain],
    queryFn: () => api.get<PubService[]>(`/public/${subdomain}/services`),
    enabled: step !== 'done',
  });
  const resourcesQ = useQuery({
    queryKey: ['pub', 'resources', subdomain],
    queryFn: () => api.get<PubResource[]>(`/public/${subdomain}/resources`),
    enabled: !!service,
  });
  const dateStr = isoDay(date);
  const slotsQ = useQuery({
    queryKey: ['pub', 'slots', subdomain, service?.id, resource?.id, dateStr],
    queryFn: () =>
      api.get<SlotDto[]>(
        `/public/${subdomain}/slots${qs({ serviceId: service!.id, resourceId: resource?.id, date: dateStr })}`,
      ),
    enabled: !!service && step === 'time',
  });

  const bookMut = useMutation({
    mutationFn: () =>
      api.post<{ id: string; startsAt: string }>('/public/book', {
        subdomain,
        serviceId: service!.id,
        resourceId: resource!.id,
        startsAt: slot!.startsAt,
        customerName: name.trim(),
        customerPhone: phone.replace(/\D/g, ''),
        website: honeypot, // honeypot field — must be empty (§9.3)
      }),
    onSuccess: () => {
      setStep('done');
      toast.success('Запись подтверждена!');
    },
    onError: (e: Error) => toast.error(e.message || 'Не удалось записаться'),
  });

  if (salonQ.isLoading) return <PageSpinner />;
  if (salonQ.isError) {
    return (
      <div className="min-h-dvh bg-slate-50 grid place-items-center p-6">
        <EmptyState
          icon={<span className="text-4xl">🚪</span>}
          title="Салон недоступен"
          description="Эта страница записи временно закрыта или адрес указан неверно."
        />
      </div>
    );
  }

  const stepsOrder: Step[] = ['service', 'master', 'time', 'confirm'];
  const stepIdx = stepsOrder.indexOf(step);

  const goBack = () => {
    if (step === 'master') { setResource(null); setStep('service'); }
    if (step === 'time') { setSlot(null); setStep('master'); }
    if (step === 'confirm') { setStep('time'); }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-brand-50 via-slate-50 to-slate-50 pb-10">
      <header className="max-w-md mx-auto px-4 pt-8 pb-4 text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-brand-600 text-white grid place-items-center text-xl font-bold shadow-lg shadow-brand-600/30">
          ✂️
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{salonQ.data?.name}</h1>
        <p className="text-sm text-slate-500 mt-1">Онлайн-запись на услуги</p>
      </header>

      {/* progress */}
      {step !== 'done' && (
        <div className="max-w-md mx-auto px-4 mb-4 flex gap-1.5">
          {['Услуга', 'Мастер', 'Время', 'Подтверждение'].map((label, i) => (
            <div key={label} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= stepIdx ? 'bg-brand-600' : 'bg-slate-200'}`} />
              <div className={`mt-1 text-[10px] text-center ${i === stepIdx ? 'text-brand-700 font-medium' : 'text-slate-400'}`}>
                {label}
              </div>
            </div>
          ))}
        </div>
      )}

      <main className="max-w-md mx-auto px-4">
        {step === 'service' && (
          <Card>
            <CardBody className="space-y-2">
              {servicesQ.isLoading && <div className="py-8 grid place-items-center"><Spinner /></div>}
              {servicesQ.data?.length === 0 && (
                <EmptyState title="Нет активных услуг" description="Попробуйте позже." />
              )}
              {servicesQ.data?.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setService(s); setStep('master'); }}
                  className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-brand-400 hover:shadow-sm transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{s.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{s.duration} мин</div>
                    </div>
                    <div className="font-semibold text-brand-700 whitespace-nowrap">
                      {formatMoney(Number(s.price))}
                    </div>
                  </div>
                </button>
              ))}
            </CardBody>
          </Card>
        )}

        {step === 'master' && (
          <Card>
            <CardBody className="space-y-2">
              <div className="text-sm text-slate-500 mb-1">Кто будет выполнять услугу «{service?.name}»?</div>
              {resourcesQ.isLoading && <div className="py-8 grid place-items-center"><Spinner /></div>}
              {resourcesQ.data?.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setResource(r); setStep('time'); }}
                  className="w-full flex items-center gap-3 text-left rounded-xl border border-slate-200 bg-white p-3.5 hover:border-brand-400 hover:shadow-sm transition-all active:scale-[0.99]"
                >
                  <div className="h-10 w-10 rounded-full bg-brand-100 text-brand-700 grid place-items-center font-semibold overflow-hidden">
                    {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" /> : r.name.slice(0, 1)}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{r.name}</div>
                    {r.capabilities?.length > 0 && (
                      <div className="text-xs text-slate-500">{r.capabilities.join(', ')}</div>
                    )}
                  </div>
                  <Badge tone="brand">Выбрать</Badge>
                </button>
              ))}
              <Button variant="ghost" className="w-full mt-2" onClick={goBack}>← Назад</Button>
            </CardBody>
          </Card>
        )}

        {step === 'time' && (
          <Card>
            <CardBody className="space-y-4">
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {Array.from({ length: 7 }, (_, i) => addDays(new Date(), i)).map((d) => {
                  const active = isoDay(d) === dateStr;
                  return (
                    <button
                      key={isoDay(d)}
                      onClick={() => { setDate(d); setSlot(null); }}
                      className={`shrink-0 w-12 rounded-xl py-2 text-center border transition-all ${
                        active
                          ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-brand-300'
                      }`}
                    >
                      <div className="text-[10px] opacity-80">{WEEKDAYS[d.getDay()]}</div>
                      <div className="text-sm font-semibold">{d.getDate()}</div>
                    </button>
                  );
                })}
              </div>

              {slotsQ.isLoading && <div className="py-8 grid place-items-center"><Spinner /></div>}
              {slotsQ.data?.length === 0 && (
                <EmptyState title="Нет свободных окон" description="Выберите другой день или мастера." />
              )}
              <div className="grid grid-cols-4 gap-2">
                {slotsQ.data?.map((sl) => (
                  <button
                    key={sl.startsAt}
                    disabled={!sl.available}
                    onClick={() => { setSlot(sl); setStep('confirm'); }}
                    className="rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-800 hover:border-brand-400 hover:text-brand-700 transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-[0.97]"
                  >
                    {new Date(sl.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </button>
                ))}
              </div>
              <Button variant="ghost" className="w-full" onClick={goBack}>← Назад</Button>
            </CardBody>
          </Card>
        )}

        {step === 'confirm' && service && resource && slot && (
          <Card>
            <CardBody className="space-y-4">
              <div className="rounded-xl bg-brand-50 border border-brand-100 p-4 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Услуга</span><b>{service.name}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Мастер</span><b>{resource.name}</b></div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Время</span>
                  <b>{new Date(slot.startsAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</b>
                </div>
                <div className="flex justify-between"><span className="text-slate-500">Стоимость</span><b>{formatMoney(Number(service.price))}</b></div>
              </div>

              <Field label="Ваше имя" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Мария" maxLength={80} />
              </Field>
              <Field label="Телефон" required hint="На этот номер придёт подтверждение">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 900 000-00-00"
                  inputMode="tel"
                  maxLength={20}
                />
              </Field>
              <Honeypot value={honeypot} onChange={setHoneypot} />

              <Button
                size="lg"
                className="w-full"
                loading={bookMut.isPending}
                disabled={name.trim().length < 2 || phone.replace(/\D/g, '').length < 10}
                onClick={() => bookMut.mutate()}
              >
                Записаться
              </Button>
              <Button variant="ghost" className="w-full" onClick={goBack}>← Назад</Button>
            </CardBody>
          </Card>
        )}

        {step === 'done' && (
          <Card>
            <CardBody className="text-center py-10 space-y-3">
              <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center text-3xl">✓</div>
              <h2 className="text-xl font-bold text-slate-900">Вы записаны!</h2>
              <p className="text-sm text-slate-500">
                {service?.name} · {resource?.name} ·{' '}
                {slot && new Date(slot.startsAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
              </p>
              <p className="text-xs text-slate-400">Мы напомним о визите заранее.</p>
              <Button variant="secondary" onClick={() => { setStep('service'); setService(null); setResource(null); setSlot(null); setName(''); setPhone(''); }}>
                Записаться ещё раз
              </Button>
            </CardBody>
          </Card>
        )}
      </main>

      <footer className="max-w-md mx-auto px-4 mt-8 text-center text-xs text-slate-400">
        Запись через <a href="https://salon.ru" className="hover:text-brand-600">Salon</a>
      </footer>
    </div>
  );
}
