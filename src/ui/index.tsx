/**
 * Shared UI kit. Every interactive thing in the app is one of these, so
 * "looks clickable ⇒ is clickable" and "busy ⇒ shows it" hold everywhere.
 */
import {
  useCallback,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon, type IconName } from './Icon';
import { dismissToast, useToasts } from '../lib/toast';
import { errorMessage, swatchFor } from '../lib/format';

export { Icon } from './Icon';
export type { IconName } from './Icon';

// --- Button -----------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = ['btn', `btn-${variant}`, `btn-${size}`, loading ? 'is-loading' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={iconSize} /> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {children != null && <span className="btn-label">{children}</span>}
      {iconRight && !loading && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn-${size} ${className ?? ''}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 14 : 16} />
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

// --- Form controls ----------------------------------------------------------

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className ?? ''}`} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input textarea ${className ?? ''}`} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`select-wrap ${className ?? ''}`}>
      <select className="input select" {...rest}>
        {children}
      </select>
      <Icon name="chevron-down" size={14} className="select-caret" />
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  inline,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <label className={`field ${inline ? 'field-inline' : ''}`}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number | null }[];
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={`segmented segmented-${size}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`seg ${o.value === value ? 'on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null && <span className="seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// --- Display ----------------------------------------------------------------

export type Tone = 'neutral' | 'ok' | 'warn' | 'err' | 'info' | 'high' | 'medium' | 'low';

export function Badge({ tone = 'neutral', children, dot, title }: { tone?: Tone; children: ReactNode; dot?: boolean; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

export function Swatch({ hue, size = 10 }: { hue: number; size?: number }) {
  return <span className="swatch" style={{ background: swatchFor(hue), width: size, height: size }} aria-hidden="true" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub != null && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`panel ${className ?? ''}`} id={id}>
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && <h2 className="panel-title">{title}</h2>}
            {description && <p className="panel-desc">{description}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function EmptyState({
  icon = 'info',
  title,
  body,
  action,
  compact,
}: {
  icon?: IconName;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? 'empty-compact' : ''}`}>
      <div className="empty-icon">
        <Icon name={icon} size={compact ? 18 : 24} />
      </div>
      <div className="empty-title">{title}</div>
      {body && <div className="empty-body">{body}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ErrorBox({
  title = 'Something went wrong',
  message,
  onRetry,
  retrying,
  compact,
}: {
  title?: ReactNode;
  message: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`callout callout-err ${compact ? 'callout-compact' : ''}`} role="alert">
      <Icon name="alert" size={16} />
      <div className="callout-body">
        <div className="callout-title">{title}</div>
        <div className="callout-text">{message}</div>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry} loading={retrying} icon="refresh">
          Retry
        </Button>
      )}
    </div>
  );
}

export function Callout({ tone = 'info', title, children, icon }: { tone?: 'info' | 'ok' | 'warn' | 'err'; title?: ReactNode; children: ReactNode; icon?: IconName }) {
  const iconName: IconName = icon ?? (tone === 'ok' ? 'check' : tone === 'info' ? 'info' : 'alert');
  return (
    <div className={`callout callout-${tone}`}>
      <Icon name={iconName} size={16} />
      <div className="callout-body">
        {title && <div className="callout-title">{title}</div>}
        <div className="callout-text">{children}</div>
      </div>
    </div>
  );
}

export function LoadingRows({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-list" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}

export function ProgressBar({
  value,
  label,
  sub,
  tone = 'info',
}: {
  /** 0–1, or null for indeterminate. */
  value: number | null;
  label?: ReactNode;
  sub?: ReactNode;
  tone?: 'info' | 'ok' | 'err';
}) {
  const pct = value == null ? null : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`progress progress-${tone}`}>
      {(label || sub) && (
        <div className="progress-head">
          <span className="progress-label">{label}</span>
          <span className="progress-sub">{sub}</span>
        </div>
      )}
      <div className={`progress-track ${pct == null ? 'indeterminate' : ''}`} role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={pct == null ? undefined : { width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: ReactNode; count?: number | null }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          className={`tab ${t.id === value ? 'on' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// --- Dialog + confirm -------------------------------------------------------

export function Dialog({
  open,
  title,
  children,
  footer,
  onClose,
  width = 480,
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number;
}) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={id} style={{ width }}>
        <header className="dialog-head">
          <h2 id={id} className="dialog-title">{title}</h2>
          <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}

interface ConfirmRequest {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let pending: ConfirmRequest | null = null;
const confirmListeners = new Set<() => void>();

export function confirmDialog(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    pending = { ...req, resolve };
    confirmListeners.forEach((l) => l());
  });
}

export function ConfirmHost() {
  const req = useSyncExternalStore(
    (cb) => {
      confirmListeners.add(cb);
      return () => confirmListeners.delete(cb);
    },
    () => pending,
    () => null,
  );
  const settle = useCallback((ok: boolean) => {
    const r = pending;
    pending = null;
    confirmListeners.forEach((l) => l());
    r?.resolve(ok);
  }, []);
  if (!req) return null;
  return (
    <Dialog
      open
      title={req.title}
      onClose={() => settle(false)}
      footer={
        <>
          <Button onClick={() => settle(false)}>Cancel</Button>
          <Button variant={req.danger ? 'danger' : 'primary'} onClick={() => settle(true)} autoFocus>
            {req.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      {req.body}
    </Dialog>
  );
}

// --- Toaster ----------------------------------------------------------------

export function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <Icon name={t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'} size={16} />
          <span className="toast-text">{t.text}</span>
          {t.action && (
            <Button size="sm" variant="ghost" onClick={() => { t.action?.onClick(); dismissToast(t.id); }}>
              {t.action.label}
            </Button>
          )}
          <IconButton icon="x" label="Dismiss" size="sm" onClick={() => dismissToast(t.id)} />
        </div>
      ))}
    </div>
  );
}

// --- Misc hooks -------------------------------------------------------------

/** Track an async action's busy + error state for one control. */
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (...args: A) => {
      setBusy(true);
      setError(null);
      try {
        await fn(...args);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );
  return { run, busy, error, clearError: () => setError(null) };
}
