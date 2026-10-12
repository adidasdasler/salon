import React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button } from '@salon/ui';

const FEATURES = [
  { icon: '📅', title: 'Онлайн-запись 24/7', text: 'Публичная страница салона на своём поддомене. Клиент выбирает услугу, мастера и свободное время за 30 секунд.' },
  { icon: '🔔', title: 'Напоминания в Telegram', text: 'За 24 часа и за 2 часа до визита. Неявки падают в среднем на 40% — вы не теряете деньги на пустых слотах.' },
  { icon: '📊', title: 'CRM с календарём', text: 'Все записи, клиенты, мастера и услуги в одном окне. Работает быстро с телефона — 80% времени вы в движении.' },
  { icon: '💳', title: 'Подписка и оплата', text: 'Оплата картой через ЮKassa, три тарифа, 14 дней бесплатно. Без контрактов и скрытых платежей.' },
  { icon: '🔒', title: 'Данные под защитой', text: 'Изоляция данных салонов на уровне PostgreSQL, аудит действий, хранение в России (152-ФЗ).' },
  { icon: '📱', title: 'PWA без приложения', text: 'Установите Salon на телефон как приложение — из браузера, без App Store и обновлений.' },
];

const STEPS = [
  { n: '1', title: 'Регистрация', text: '1 минута: название салона, поддомен, email. 14 дней бесплатно — карта не нужна.' },
  { n: '2', title: 'Онбординг', text: '4 шага: салон → мастера → услуги → расписание. Есть шаблоны типовых услуг.' },
  { n: '3', title: 'Ссылка на запись', text: 'Ваш салон получает адрес my-salon.salon.ru — добавьте его в Instagram, WhatsApp и визитки.' },
  { n: '4', title: 'Клиенты записываются', text: 'Вы видите календарь, напоминания уходят сами, неявки сокращаются.' },
];

export default function LandingPage() {
  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">💈</span>
            Salon
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">Возможности</a>
            <a href="#how" className="hover:text-slate-900">Как начать</a>
            <Link to="/pricing" className="hover:text-slate-900">Тарифы</Link>
          </nav>
          <div className="flex items-center gap-2">
            <a href="https://app.salon.ru" className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 sm:block">Вход</a>
            <Link to="/register"><Button size="sm">Попробовать бесплатно</Button></Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-50 via-white to-white" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center md:pt-24">
          <Badge tone="brand" className="mb-6">SaaS для салонов красоты и сферы услуг</Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl">
            Запись клиентов <span className="text-brand-600">онлайн</span>.<br className="hidden md:block" /> Неявки — <span className="text-brand-600">минимум</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            Salon даёт салону собственную страницу записи, календарь, CRM и автоматические
            напоминания в Telegram. Разверните за 10 минут — первые 14 дней бесплатно.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/register"><Button size="lg" className="w-full sm:w-auto">Начать бесплатно →</Button></Link>
            <Link to="/pricing"><Button size="lg" variant="secondary" className="w-full sm:w-auto">Смотреть тарифы</Button></Link>
          </div>
          <p className="mt-4 text-sm text-slate-400">Карта не нужна · Отмена в один клик · Данные в России</p>

          {/* Mock calendar strip */}
          <div className="mx-auto mt-14 max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
              {[
                ['10:00', 'Анна ·стрижка', 'bg-brand-100 text-brand-800'],
                ['12:30', 'Мария ·маникюр', 'bg-emerald-100 text-emerald-800'],
                ['14:00', 'Депозит ·нетто', 'bg-amber-100 text-amber-800'],
                ['16:15', 'Игорь ·барбер', 'bg-sky-100 text-sky-800'],
              ].map(([t, l, c]) => (
                <div key={l} className={`rounded-xl px-3 py-3 ${c}`}>
                  <div className="text-xs opacity-70">{t}</div>
                  <div className="truncate text-sm font-semibold">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight">Всё, что нужно салону</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">Без перегруженных YCLIENTS-комбайнов. Только то, чем пользуются каждый день.</p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold tracking-tight">Как начать за 10 минут</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-600 font-bold text-white">{s.n}</div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-8 py-14 text-center text-white">
          <h2 className="text-3xl font-bold">14 дней бесплатно. Без карты.</h2>
          <p className="mx-auto mt-3 max-w-md text-brand-100">Разверните Salon сегодня — первая онлайн-запись появится уже завтра.</p>
          <Link to="/register" className="mt-8 inline-block">
            <Button size="lg" variant="secondary" className="!text-brand-700">Создать салон</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-slate-500 md:flex-row">
          <div>© {new Date().getFullYear()} Salon. Все права защищены.</div>
          <div className="flex gap-6">
            <Link to="/pricing">Тарифы</Link>
            <a href="#" onClick={(e) => e.preventDefault()}>Оферта</a>
            <a href="#" onClick={(e) => e.preventDefault()}>Политика ПДн</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
