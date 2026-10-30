import type { ReactNode } from 'react';
import { formatMoney } from '../../../shared/money';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl text-cream sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-smoke">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'gold' | 'warn' | 'good';
}) {
  const tones = {
    default: 'border-white/[0.07] bg-ink-700/50',
    gold: 'border-gold-400/25 bg-gold-400/[0.07]',
    warn: 'border-amber-400/20 bg-amber-400/[0.05]',
    good: 'border-emerald-400/20 bg-emerald-400/[0.05]',
  } as const;
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10.5px] uppercase tracking-[0.14em] text-smoke">{label}</p>
        {icon && <span className="text-gold-400/70">{icon}</span>}
      </div>
      <p className="mt-2 font-display text-2xl text-cream tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-smoke/60">{hint}</p>}
    </div>
  );
}

export function Money({ kobo }: { kobo: number }) {
  return <span className="tabular-nums">{formatMoney(kobo)}</span>;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    unavailable: 'border-white/[0.12] bg-white/[0.04] text-smoke',
    sold_out: 'border-red-400/30 bg-red-400/10 text-red-200',
    pending: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
    preparing: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
    served: 'border-violet-400/30 bg-violet-400/10 text-violet-200',
    completed: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    cancelled: 'border-red-400/30 bg-red-400/10 text-red-200',
    active: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    inactive: 'border-white/[0.12] bg-white/[0.04] text-smoke',
  };
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`chip ${map[status] ?? 'border-white/[0.12] bg-white/[0.04] text-smoke'}`}>{label}</span>
  );
}

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-ink-800/70 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1.5 text-[12px] transition ${
            value === o.value ? 'bg-gold-400/20 text-gold-100' : 'text-smoke hover:text-cream'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-ink-700/40">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
