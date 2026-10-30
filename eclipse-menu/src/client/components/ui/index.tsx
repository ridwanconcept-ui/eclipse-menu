import { useEffect, useState, createContext, useContext, useCallback, type ReactNode } from 'react';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

/* ------------------------------------------------------------------ *
 * Brand mark — an uploadable logo falls back to this monogram.
 * ------------------------------------------------------------------ */
export function BrandMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Eclipse mark"
      className={className}
    >
      <defs>
        <linearGradient id="eclipseGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F3E7CB" />
          <stop offset="55%" stopColor="#D0AC6B" />
          <stop offset="100%" stopColor="#A87F3F" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="none" stroke="url(#eclipseGold)" strokeWidth="1.2" opacity="0.55" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="url(#eclipseGold)" strokeWidth="0.8" opacity="0.35" />
      <path
        d="M32 10a22 22 0 1 0 0 44 22 22 0 0 0 18.5-10.2A24 24 0 0 1 32 10z"
        fill="url(#eclipseGold)"
      />
      <circle cx="43" cy="20" r="3.1" fill="#F6F2E9" opacity="0.9" />
    </svg>
  );
}

export function BrandLogo({
  logoUrl,
  size = 40,
  className = '',
}: {
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={`rounded-full object-cover ring-1 ring-gold-400/30 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <BrandMark size={size} className={className} />;
}

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */
type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}
const ToastCtx = createContext<{ push: (kind: ToastKind, message: string) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    // Keep at most two on screen so toasts never bury the primary action.
    setToasts((t) => [...t.slice(-1), { id, kind, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-16 z-[110] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-auto sm:items-end sm:p-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-card animate-slide-up ${
              t.kind === 'success'
                ? 'border-emerald-400/25 bg-emerald-950/90 text-emerald-100'
                : t.kind === 'error'
                  ? 'border-red-400/30 bg-red-950/90 text-red-100'
                  : 'border-white/10 bg-ink-600/95 text-cream'
            }`}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            ) : t.kind === 'error' ? (
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            ) : (
              <Info size={16} className="mt-0.5 shrink-0" />
            )}
            <span className="leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

/* ------------------------------------------------------------------ *
 * Modal / bottom sheet
 * ------------------------------------------------------------------ */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-fade-in" onClick={onClose} aria-label="Close" />
      <div
        className={`relative w-full ${widths[size]} max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-700
          shadow-2xl animate-slide-up sm:rounded-2xl sm:animate-fade-up`}
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/[0.07] bg-ink-700/95 px-5 py-4 backdrop-blur">
            <div className="min-w-0 font-display text-lg text-cream">{title}</div>
            <button onClick={onClose} className="btn-quiet shrink-0" aria-label="Close dialog">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="sticky bottom-0 border-t border-white/[0.07] bg-ink-700/95 px-5 py-3.5 backdrop-blur">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Form fields
 * ------------------------------------------------------------------ */
export function Field({
  label,
  hint,
  error,
  children,
  className = '',
  htmlFor,
  required,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  required?: boolean;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && <span className="text-gold-400"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] leading-snug text-smoke/70">{hint}</p>}
      {error && <p className="mt-1 text-[11px] font-medium text-red-300">{error}</p>}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${
          checked ? 'border-gold-400/60 bg-gold-400/80' : 'border-white/15 bg-ink-500'
        }`}
      >
        <span
          className={`absolute top-0.5 rounded-full bg-cream transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
          style={{ height: 18, width: 18 }}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm text-cream">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-snug text-smoke/80">{description}</span>}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      {icon && <div className="text-gold-400/70">{icon}</div>}
      <h3 className="font-display text-lg text-cream">{title}</h3>
      {message && <p className="max-w-sm text-sm leading-relaxed text-smoke">{message}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-400/20 bg-red-950/20 px-6 py-10 text-center">
      <AlertTriangle className="text-red-300" size={22} />
      <p className="max-w-md text-sm text-red-100">{message}</p>
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-lg ${className}`} aria-hidden="true" />;
}

export function Badge({
  children,
  tone = 'gold',
}: {
  children: ReactNode;
  tone?: 'gold' | 'green' | 'red' | 'muted' | 'blue';
}) {
  const tones = {
    gold: 'border-gold-400/35 bg-gold-400/10 text-gold-200',
    green: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    red: 'border-red-400/30 bg-red-400/10 text-red-200',
    blue: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
    muted: 'border-white/[0.12] bg-white/[0.04] text-smoke',
  } as const;
  return <span className={`chip ${tones[tone]}`}>{children}</span>;
}

export function Confirm({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <p className="text-sm leading-relaxed text-smoke">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn rounded-full bg-red-500/90 px-5 py-2.5 text-white hover:bg-red-500 disabled:opacity-60"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? <Spinner /> : null}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
