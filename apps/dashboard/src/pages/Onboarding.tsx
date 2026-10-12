import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button, Card, Field, Input, Select, toast, Badge, PageSpinner } from '@salon/ui';
import { api } from '../api';

interface TemplateItem { name: string; priceKopecks: number; duration: number; bufferTime?: number }
interface Template { code: string; name: string; items: TemplateItem[] }
interface ResourceForm { name: string; phone: string }

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Onboarding wizard — 4 steps (spec §6.2): салон → мастера → услуги → расписание. */
export default function OnboardingPage() {
  const nav = useNavigate();
  const [step, setStep] = React.useState(0);
  const done = step === 3;

  return (
    <div className="mx-auto max-w-2xl py-6">
      {/* Stepper */}
      <ol className="mb-8 flex items-center justify-between gap-2 text-xs font-medium">
        {['Салон', 'Мастера', 'Услуги', 'Готово'].map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={
                i < step
                  ? 'grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white'
                  : i === step
                    ? 'grid h-7 w-7 place-items-center rounded-full bg-brand-600 text-white ring-4 ring-brand-100'
                    : 'grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-slate-400'
              }
            >
              {i < step ? '✓' : i + 1}
            </span>
            <span className={i <= step ? 'text-slate-800' : 'text-slate-400'}>{label}</span>
            {i < 3 && <span className="h-px flex-1 bg-slate-200" />}
          </li>
        ))}
      </ol>

      {step === 0 && <StepSalon onNext={() => setStep(1)} />}
      {step === 1 && <StepResources onNext={() => setStep(2)} onBack={() => setStep(0)} />}
      {step === 2 && <StepServices onNext={() => setStep(3)} onBack={() => setStep(1)} />}
      {done && (
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-3xl">🎉</div>
          <h2 className="text-lg font-bold">Салон настроен!</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            Первая запись уже доступна по публичной ссылке. Мы создали демо-запись, чтобы вы увидели календарь в деле.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="secondary" onClick={() => nav('/')}>В дашборд</Button>
            <Button onClick={() => nav('/calendar')}>Открыть календарь</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- Step 1: salon profile ----------
function StepSalon({ onNext }: { onNext: () => void }) {
  const [name, setName] = React.useState('');
  const [timezone, setTimezone] = React.useState('Europe/Moscow');
  const mut = useMutation({
    mutationFn: () => api.patch('/tenants/current', { name, timezone }),
    onSuccess: () => { toast.success('Профиль салона сохранён'); onNext(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-bold">Шаг 1. Название и часовой пояс</h2>
      <p className="mb-5 text-xs text-slate-500">Эти данные видят клиенты в виджете записи.</p>
      <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
        <Field label="Название салона" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Салон красоты «Аврора»" minLength={2} maxLength={120} required />
        </Field>
        <Field label="Часовой пояс">
          <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {['Europe/Moscow', 'Europe/Saint_Petersburg', 'Europe/Kaliningrad', 'Asia/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok'].map((tz) => (
              <option key={tz}>{tz}</option>
            ))}
          </Select>
        </Field>
        <Button type="submit" loading={mut.isPending}>Далее →</Button>
      </form>
    </Card>
  );
}

// ---------- Step 2: resources ----------
function StepResources({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [rows, setRows] = React.useState<ResourceForm[]>([{ name: '', phone: '' }]);
  const valid = rows.filter((r) => r.name.trim().length >= 2);
  const mut = useMutation({
    mutationFn: async () => {
      for (const r of valid) {
        await api.post('/resources', { name: r.name.trim(), phone: r.phone.trim() || undefined });
      }
    },
    onSuccess: () => { toast.success(`Добавлено мастеров: ${valid.length}`); onNext(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-bold">Шаг 2. Мастера</h2>
      <p className="mb-5 text-xs text-slate-500">Добавьте специалистов. Расписание и услуги назначим дальше.</p>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <Input placeholder={`Имя мастера ${i + 1}`} value={r.name}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input placeholder="Телефон (необяз.)" className="max-w-40" value={r.phone}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
            {rows.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</Button>
            )}
          </div>
        ))}
      </div>
      <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setRows([...rows, { name: '', phone: '' }])}>
        + Ещё мастер
      </Button>
      <div className="mt-6 flex gap-2">
        <Button variant="ghost" onClick={onBack}>← Назад</Button>
        <Button disabled={valid.length === 0} loading={mut.isPending} onClick={() => mut.mutate()}>Далее →</Button>
      </div>
    </Card>
  );
}

// ---------- Step 3: services from template ----------
function StepServices({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['service-templates'], queryFn: () => api.get<Template[]>('/services/templates') });
  const [picked, setPicked] = React.useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => api.post('/services/from-template', { template: picked }),
    onSuccess: () => { toast.success('Услуги добавлены'); onNext(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading) return <PageSpinner />;
  return (
    <Card className="p-6">
      <h2 className="mb-1 text-base font-bold">Шаг 3. Услуги</h2>
      <p className="mb-5 text-xs text-slate-500">Выберите стартовый набор — цены и длительность можно изменить позже.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(data ?? []).map((t) => (
          <button
            key={t.code}
            type="button"
            onClick={() => setPicked(picked === t.code ? null : t.code)}
            className={
              'rounded-2xl border p-4 text-left transition-all ' +
              (picked === t.code ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 hover:border-slate-300')
            }
          >
            <p className="text-sm font-semibold">{t.name}</p>
            <p className="mt-1 text-xs text-slate-500">{t.items.length} услуг</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {t.items.slice(0, 3).map((i) => <Badge key={i.name} tone="slate">{i.name}</Badge>)}
              {t.items.length > 3 && <Badge tone="slate">+{t.items.length - 3}</Badge>}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-6 flex gap-2">
        <Button variant="ghost" onClick={onBack}>← Назад</Button>
        <Button disabled={!picked} loading={mut.isPending} onClick={() => mut.mutate()}>Завершить →</Button>
      </div>
    </Card>
  );
}

export { WEEK_DAYS };
