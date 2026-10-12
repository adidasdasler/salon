/**
 * @salon/ui — shared design system for all three SALON apps
 * (marketing / dashboard / booking). Tailwind-based, CVA-style variants,
 * no heavy deps. RU labels per spec §12 («Код на английском, UI на русском»).
 */
import React from 'react';
import clsx from 'clsx';

// ---------- helpers ----------

type Variant<T extends string> = T;

function cva<Variants extends Record<string, Record<string, string>>>(
  base: string,
  variants: Variants,
): (...args: Array<Partial<Record<keyof Variants, string>> | undefined | null | false>) => string {
  return (...selections) => {
    let out = base;
    for (const sel of selections) {
      if (!sel) continue;
      for (const [key, value] of Object.entries(sel)) {
        const map = variants[key] as Record<string, string> | undefined;
        const v = map?.[value as string];
        if (v) out += ' ' + v;
      }
    }
    return out;
  };
}

// ---------- Button ----------

export type ButtonVariant = Variant<'primary' | 'secondary' | 'ghost' | 'danger'>;
export type ButtonSize = Variant<'sm' | 'md' | 'lg'>;

const buttonCva = cva(
  'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 ' +
    'disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
  {
    variant: {
      primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20',
      secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 hover:border-slate-300',
      ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm shadow-rose-600/20',
    },
    size: {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-6 text-base',
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(buttonCva({ variant, size }), className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

// ---------- Input / Field ----------

const inputCva = cva(
  'w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 ' +
    'transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/60 focus:border-brand-500 ' +
    'disabled:bg-slate-50 disabled:text-slate-400',
  {
    error: {
      true: 'border-rose-400 focus:ring-rose-400/50',
      false: 'border-slate-200',
    },
  },
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={inputCva({ error: !!invalid }) + ' ' + (className ?? '')} {...rest} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx(inputCva({ error: false }), 'min-h-20 resize-y', className)} {...rest} />;
  },
);

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(inputCva({ error: false }), 'appearance-none pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx('block space-y-1.5', className)}>
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="block text-xs text-slate-400">{hint}</span>}
      {error && <span className="block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

// Honeypot field — invisible for humans, filled by bots (spec §9.3)
export function Honeypot({ name = 'website', value, onChange }: { name?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
      <input tabIndex={-1} autoComplete="off" name={name} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// ---------- Card ----------

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-2xl border border-slate-200/80 bg-white shadow-sm', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4', className)}>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx('p-5', className)}>{children}</div>;
}

// ---------- Badge ----------

const badgeCva = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', {
  tone: {
    slate: 'bg-slate-50 text-slate-600 ring-slate-200',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
});

export function Badge({ tone = 'slate', className, children }: { tone?: keyof typeof tones; className?: string; children: React.ReactNode }) {
  return <span className={clsx(badgeCva({ tone }), className)}>{children}</span>;
}

const tones = { slate: 1, brand: 1, green: 1, amber: 1, rose: 1, sky: 1, violet: 1 } as const;

// ---------- Spinner ----------

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className ?? 'h-6 w-6')} viewBox="0 0 24 24" fill="none" aria-label="Загрузка">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-brand-500">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

// ---------- Empty state ----------

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
      {icon && <div className="text-3xl">{icon}</div>}
      <div>
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------- Modal ----------

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          'relative w-full rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl',
          wide ? 'max-w-2xl' : 'max-w-md',
          'max-h-[92vh] overflow-y-auto',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Закрыть">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Toast (lightweight, sonner-compatible API surface) ----------

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string }
let toastSeq = 0;
const listeners = new Set<(t: ToastItem[]) => void>();
let toasts: ToastItem[] = [];

function pushToast(kind: ToastKind, message: string) {
  const t = { id: ++toastSeq, kind, message };
  toasts = [...toasts, t];
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    listeners.forEach((l) => l(toasts));
  }, 4200);
}

export const toast = {
  success: (m: string) => pushToast('success', m),
  error: (m: string) => pushToast('error', m),
  info: (m: string) => pushToast('info', m),
};

const toastTone: Record<ToastKind, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
};

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  React.useEffect(() => {
    listeners.add(setItems);
    return () => { listeners.delete(setItems); };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
      {items.map((t) => (
        <div key={t.id} className={clsx('pointer-events-auto max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg', toastTone[t.kind])}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ---------- Misc ----------

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{children}</kbd>;
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return src ? (
    <img src={src} alt={name} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: Array<{ id: string; label: string }>; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            active === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-slate-200/70', className)} />;
}

export function StatCard({ label, value, delta, tone = 'brand' }: { label: string; value: React.ReactNode; delta?: string; tone?: keyof typeof tones }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-bold text-slate-900">{value}</p>
      {delta && <Badge tone={tone} className="mt-2">{delta}</Badge>}
    </Card>
  );
}
