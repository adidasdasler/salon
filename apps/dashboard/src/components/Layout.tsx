import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Badge, Button, Avatar } from '@salon/ui';
import clsx from 'clsx';
import { useSession } from '../store';
import { api } from '../api';

const NAV = [
  { to: '/', label: 'Дашборд', icon: '📊' },
  { to: '/calendar', label: 'Календарь', icon: '🗓️' },
  { to: '/customers', label: 'Клиенты', icon: '👥' },
  { to: '/services', label: 'Услуги', icon: '💅' },
  { to: '/resources', label: 'Мастера', icon: '✂️' },
  { to: '/team', label: 'Команда', icon: '🤝' },
  { to: '/billing', label: 'Подписка', icon: '💳' },
  { to: '/settings', label: 'Настройки', icon: '⚙️' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, tenant } = useSession();
  const nav = useNavigate();
  const [open, setOpen] = React.useState(false);

  async function logout() {
    try { await api.post('/auth/logout', { refreshToken: '' }); } catch { /* ignore */ }
    useSession.getState().clear();
    nav('/login');
  }

  const trialLeft = tenant?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Sidebar — desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">S</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{tenant?.name ?? 'Salon'}</p>
            <p className="text-[11px] text-slate-400">{tenant?.subdomain}.salon.ru</p>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              <span aria-hidden>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-4">
          {tenant?.status === 'TRIAL' && trialLeft !== null && (
            <Badge tone="amber" className="mb-3">Триал: {trialLeft} дн.</Badge>
          )}
          {tenant?.status === 'PAST_DUE' && <Badge tone="rose" className="mb-3">Оплата просрочена</Badge>}
          <div className="flex items-center gap-2">
            <Avatar name={user?.name ?? '?'} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{user?.name}</p>
              <p className="truncate text-[10px] text-slate-400">{user?.role}</p>
            </div>
            <button onClick={logout} className="text-xs text-slate-400 hover:text-rose-600">Выйти</button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">S</span>
            <span className="text-sm font-semibold">{tenant?.name}</span>
          </div>
          <button onClick={() => setOpen(true)} aria-label="Меню" className="rounded-lg p-2 hover:bg-slate-100">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 5h14v2H3V5zm0 4h14v2H3V9zm0 4h14v2H3v-2z" /></svg>
          </button>
        </header>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-0 h-full w-72 bg-white p-4 shadow-xl">
              <nav className="space-y-1">
                {NAV.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setOpen(false)}
                    className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600')}>
                    <span aria-hidden>{n.icon}</span>{n.label}
                  </NavLink>
                ))}
              </nav>
              <Button variant="ghost" className="mt-4 w-full" onClick={logout}>Выйти ({user?.name})</Button>
            </div>
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
