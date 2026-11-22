import React from 'react';
import { createPortal } from 'react-dom';
import {
  X, AlertCircle, CheckCircle2, AlertTriangle, Info, RefreshCw, Wifi, WifiOff,
  LayoutDashboard, MapPin, CalendarDays, Users, ArrowLeftRight, Clock, History,
  DollarSign, Trophy, ClipboardCheck, Repeat, Newspaper, UtensilsCrossed,
  ShieldAlert, MessageSquareWarning, GraduationCap, BookOpen, Building2,
  KeyRound, CalendarRange, BarChart3, Sparkles, Network
} from 'lucide-react';
import { KgFeatureTip } from './KgFeatureTip';
import { useDialogA11y } from '../utils/modalQueue';

export { KgFeatureTip, type KgFeatureTipProps } from './KgFeatureTip';
export { KgFeatureTip as KgTooltip } from './KgFeatureTip';
export { KgLoadingOverlay } from './KgLoadingOverlay';

// ============================================
// Layout Components (Cloudflare Kumo × KG Brand)
// ============================================

export function KgPage({
  children,
  wide = false,
  className = ''
}: {
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`w-full ${wide ? 'max-w-[1520px]' : 'max-w-[1360px]'} mx-auto px-0 sm:px-4 md:px-5 py-2.5 sm:py-3 md:py-4 space-y-3.5 sm:space-y-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function KgSection({
  children,
  title,
  actions,
  className = ''
}: {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-2.5 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 px-0.5">
          {title && (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--kg-text-muted)]">
              {title}
            </h3>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function KgPageHeader({
  title,
  description,
  icon: Icon,
  actions
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<any>;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--kg-border)] pb-3.5">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="kg-section-icon w-9 h-9 rounded-lg bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-primary)] flex-shrink-0">
            <Icon size={18} strokeWidth={1.75} />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-base md:text-lg font-semibold text-[var(--kg-text)] leading-snug truncate">
            {title}
          </h2>
          {description && (
            <p className="text-xs text-[var(--kg-text-muted)] mt-0.5 line-clamp-1">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap sm:justify-end sm:flex-shrink-0 min-w-0">
          {actions}
        </div>
      )}
    </div>
  );
}

// ============================================
// Kumo LayerCard & Core Controls (9 States)
// ============================================

export function KgCard({
  children,
  className = '',
  onClick,
  hoverable = false,
  selected = false,
  stacked = false
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  selected?: boolean;
  stacked?: boolean;
}) {
  const handleKeyDown = onClick
    ? (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }
    : undefined;

  const isInteractive = Boolean(onClick || hoverable);

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      data-selected={selected ? 'true' : undefined}
      className={`kg-card bg-[var(--kg-surface)] border ${
        selected ? 'border-[var(--kg-primary)] ring-1 ring-[var(--kg-primary)]/25' : 'border-[var(--kg-border)]'
      } rounded-[var(--radius-lg)] p-4 md:p-5 min-w-0 ${
        isInteractive ? 'kg-card-interactive' : 'transition-colors duration-150'
      } ${
        stacked ? 'shadow-card' : ''
      } ${
        onClick
          ? 'cursor-pointer select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary-ink)] focus-visible:ring-offset-1'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function KgButton({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  selected = false,
  icon: Icon,
  onClick,
  className = '',
  type = 'button',
  title,
  ...rest
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
  icon?: React.ComponentType<any>;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'disabled' | 'onClick' | 'className' | 'title'>) {
  const baseStyles =
    'kg-pressable inline-flex items-center justify-center font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary-ink)] focus-visible:ring-offset-1 disabled:bg-[var(--kg-surface-soft)] disabled:text-[var(--kg-text-soft)] disabled:border-[var(--kg-border)] disabled:shadow-none disabled:pointer-events-none select-none whitespace-nowrap max-w-full';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-[10px] gap-1.5 min-h-[44px] sm:min-h-[36px]',
    md: 'px-4 py-2 text-xs sm:text-sm rounded-[11px] gap-2 min-h-[44px] sm:min-h-[40px]',
    lg: 'px-5 py-2.5 text-sm sm:text-base rounded-xl gap-2.5 min-h-[48px] sm:min-h-[44px]'
  };

  const variantStyles = {
    primary:
      'bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] border border-[var(--kg-primary)] shadow-soft',
    secondary: selected
      ? 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]'
      : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border border-[var(--kg-border-strong)] hover:bg-[var(--kg-surface-soft)] hover:border-[var(--kg-border-strong)]',
    danger:
      'bg-[var(--kg-danger)] hover:brightness-95 text-white dark:text-[#23170F] border border-[var(--kg-danger)] shadow-soft',
    warning:
      'bg-[var(--kg-warning)] hover:brightness-95 text-white dark:text-[#23170F] border border-[var(--kg-warning)] shadow-soft',
    ghost:
      'bg-transparent border border-transparent text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)]'
  };

  return (
    <button
      {...rest}
      type={type}
      title={title}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={onClick}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {loading ? (
        <span
          className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0"
          aria-hidden="true"
        />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} strokeWidth={1.75} className="flex-shrink-0" />
      ) : null}
      <span className="truncate min-w-0">{children}</span>
    </button>
  );
}

export function KgIconButton({
  icon: Icon,
  onClick,
  variant = 'secondary',
  disabled = false,
  className = '',
  title,
  ariaLabel
}: {
  icon: React.ComponentType<any>;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  const variantStyles = {
    primary: 'bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] border border-[var(--kg-primary)] shadow-soft',
    secondary:
      'bg-[var(--kg-surface)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)] hover:border-[var(--kg-border-strong)]',
    danger:
      'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] hover:brightness-95 border border-[var(--kg-danger)]/25',
    ghost: 'bg-transparent border border-transparent text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)]'
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || title || 'Thao tác'}
      className={`kg-pressable w-11 h-11 sm:w-10 sm:h-10 min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] rounded-[11px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary-ink)] focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none flex-shrink-0 ${variantStyles[variant]} ${className}`}
    >
      <Icon size={18} strokeWidth={1.75} />
    </button>
  );
}

export function KgInput({
  label,
  error,
  hint,
  icon: Icon,
  rightAdornment,
  inputClassName = '',
  className = '',
  id,
  required,
  ...props
}: {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ComponentType<any>;
  rightAdornment?: React.ReactNode;
  inputClassName?: string;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = React.useId();
  const inputId = id || generatedId;

  return (
    <div className={`space-y-1.5 w-full ${className}`}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-[var(--kg-text-muted)]">
          {label}
          {required && <span className="text-[var(--kg-danger)] ml-0.5">*</span>}
        </label>
      )}
      <div className="relative w-full">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--kg-text-soft)] pointer-events-none">
            <Icon size={16} strokeWidth={1.75} />
          </div>
        )}
        <input
          id={inputId}
          required={required}
          aria-invalid={Boolean(error) || undefined}
          className={`w-full min-h-[44px] sm:min-h-[42px] px-3.5 py-2 ${
            Icon ? 'pl-10' : ''
          } ${
            rightAdornment ? 'pr-11' : ''
          } text-base sm:text-sm bg-[var(--kg-surface)] border ${
            error ? 'border-[var(--kg-danger)]' : 'border-[var(--kg-border-strong)] hover:border-[var(--kg-primary)]'
          } rounded-xl focus:border-[var(--kg-primary)] focus:outline-none transition-colors placeholder-[var(--kg-text-soft)] text-[var(--kg-text)] disabled:bg-[var(--kg-surface-soft)] disabled:text-[var(--kg-text-muted)] ${inputClassName}`}
          {...props}
        />
        {rightAdornment && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
            {rightAdornment}
          </div>
        )}
      </div>
      {error ? (
        <p className="text-xs text-[var(--kg-danger)] font-medium">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--kg-text-soft)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function KgSelect({
  label,
  error,
  className = '',
  children,
  options,
  id,
  required,
  ...props
}: {
  label?: string;
  error?: string;
  className?: string;
  children?: React.ReactNode;
  options?: Array<{ value: string; label: string }>;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = React.useId();
  const selectId = id || generatedId;

  return (
    <div className={`space-y-1.5 w-full ${className}`}>
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold text-[var(--kg-text-muted)]">
          {label}
          {required && <span className="text-[var(--kg-danger)] ml-0.5">*</span>}
        </label>
      )}
      <select
        id={selectId}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        className={`w-full min-h-[44px] sm:min-h-[42px] px-3.5 py-2 text-base sm:text-sm bg-[var(--kg-surface)] border ${
          error ? 'border-[var(--kg-danger)]' : 'border-[var(--kg-border-strong)] hover:border-[var(--kg-primary)]'
        } rounded-xl focus:border-[var(--kg-primary)] focus:outline-none transition-colors text-[var(--kg-text)] disabled:bg-[var(--kg-surface-soft)] disabled:text-[var(--kg-text-muted)]`}
        {...props}
      >
        {options
          ? options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      {error && <p className="text-xs text-[var(--kg-danger)] font-medium">{error}</p>}
    </div>
  );
}

export function KgTextarea({
  label,
  error,
  className = '',
  id,
  required,
  ...props
}: {
  label?: string;
  error?: string;
  className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generatedId = React.useId();
  const textareaId = id || generatedId;

  return (
    <div className={`space-y-1.5 w-full ${className}`}>
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-semibold text-[var(--kg-text-muted)]">
          {label}
          {required && <span className="text-[var(--kg-danger)] ml-0.5">*</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        className={`w-full px-3.5 py-2.5 text-base sm:text-sm bg-[var(--kg-surface)] border ${
          error ? 'border-[var(--kg-danger)]' : 'border-[var(--kg-border-strong)] hover:border-[var(--kg-primary)]'
        } rounded-xl focus:border-[var(--kg-primary)] focus:outline-none transition-colors placeholder-[var(--kg-text-soft)] text-[var(--kg-text)] min-h-[96px] disabled:bg-[var(--kg-surface-soft)]`}
        {...props}
      />
      {error && <p className="text-xs text-[var(--kg-danger)] font-medium">{error}</p>}
    </div>
  );
}

export function KgStatusBadge({
  children,
  variant = 'neutral',
  className = ''
}: {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  className?: string;
}) {
  const styles = {
    success:
      'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border border-[var(--kg-success)]/25',
    warning:
      'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/25',
    error:
      'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/25',
    info:
      'bg-[var(--kg-info-soft)] text-[var(--kg-info)] border border-[var(--kg-info)]/25',
    neutral:
      'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)]'
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold leading-5 whitespace-nowrap ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function KgMetricCard({
  title,
  value,
  icon: Icon,
  variant = 'info',
  subtext,
  className = '',
  onClick
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<any>;
  variant?: 'success' | 'warning' | 'error' | 'info';
  subtext?: string;
  className?: string;
  onClick?: () => void;
}) {
  const iconStyles = {
    success: 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-transparent',
    warning: 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-transparent',
    error: 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border-transparent',
    info: 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border-transparent'
  };

  return (
    <KgCard
      onClick={onClick}
      className={`kg-metric-card ${onClick ? 'group' : ''} flex flex-col justify-between gap-2.5 p-3.5 sm:p-[18px] min-h-[106px] sm:min-h-[118px] ${className}`}
      hoverable={Boolean(onClick)}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-[11.5px] sm:text-xs text-[var(--kg-text-muted)] font-bold leading-snug line-clamp-2 min-w-0">
          {title}
        </span>
        <div
          className={`w-[34px] h-[34px] rounded-[11px] border flex items-center justify-center flex-shrink-0 transition-transform duration-150 ${
            onClick ? 'group-hover:scale-[1.04]' : ''
          } ${iconStyles[variant]}`}
        >
          <Icon size={16} strokeWidth={1.85} />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[22px] sm:text-[26px] xl:text-[28px] font-black text-[var(--kg-text)] tracking-tight tabular-nums font-mono leading-none truncate">
          {value}
        </p>
        {subtext && (
          <p className="text-[11px] text-[var(--kg-text-muted)] font-medium mt-1.5 leading-snug line-clamp-1">
            {subtext}
          </p>
        )}
      </div>
    </KgCard>
  );
}

export function KgAlertCard({
  children,
  title,
  icon: Icon,
  variant = 'info',
  className = ''
}: {
  children: React.ReactNode;
  title?: string;
  icon?: React.ComponentType<any>;
  variant?: 'success' | 'warning' | 'error' | 'info';
  className?: string;
}) {
  const styles = {
    success:
      'bg-[var(--kg-success-soft)] border border-[var(--kg-success)]/25 text-[var(--kg-success)]',
    warning:
      'bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-[var(--kg-warning)]',
    error:
      'bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/25 text-[var(--kg-danger)]',
    info:
      'bg-[var(--kg-info-soft)] border border-[var(--kg-info)]/25 text-[var(--kg-info)]'
  };

  const icons = {
    success: CheckCircle2,
    warning: AlertTriangle,
    error: AlertCircle,
    info: Info
  };

  const DisplayIcon = Icon || icons[variant];

  return (
    <div className={`p-3.5 sm:p-4 rounded-xl flex gap-3 ${styles[variant]} ${className} min-w-0`}>
      <div className="flex-shrink-0 mt-0.5">
        <DisplayIcon size={17} strokeWidth={1.75} />
      </div>
      <div className="flex-1 space-y-0.5 min-w-0">
        {title && <h4 className="text-xs font-semibold leading-snug">{title}</h4>}
        <div className="text-xs leading-relaxed text-[var(--kg-text)]">{children}</div>
      </div>
    </div>
  );
}

export function KgSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--kg-surface-soft)] rounded-lg ${className}`} aria-hidden="true" />;
}

export function KgEmptyState({
  title,
  description,
  icon: Icon,
  action
}: {
  title: string;
  description: string;
  icon?: React.ComponentType<any>;
  action?: { label: string; onClick: () => void } | React.ReactNode;
}) {
  const actionConfig =
    action && !React.isValidElement(action) && typeof action === 'object' && 'label' in action
      ? action
      : null;

  return (
    <div className="flex flex-col items-center justify-center text-center p-6 py-10 bg-[var(--kg-surface)] border border-dashed border-[var(--kg-border)] rounded-xl">
      {Icon && (
        <div className="w-11 h-11 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] mb-3">
          <Icon size={20} strokeWidth={1.75} />
        </div>
      )}
      <h4 className="text-sm font-semibold text-[var(--kg-text)]">{title}</h4>
      <p className="text-xs text-[var(--kg-text-muted)] mt-1 max-w-[320px] leading-relaxed">
        {description}
      </p>
      {action && (
        <div className="mt-4">
          {React.isValidElement(action) ? (
            action
          ) : actionConfig ? (
            <KgButton size="sm" onClick={actionConfig.onClick}>
              {actionConfig.label}
            </KgButton>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ============================================
// Feedback & Overlay Components
// ============================================

export interface ToastMessage {
  id: string;
  title: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

export function KgToast({
  message,
  onClose
}: {
  message: ToastMessage;
  onClose: (id: string) => void;
}) {
  React.useEffect(() => {
    const delay = message.duration ?? 3000;
    const timer = setTimeout(() => onClose(message.id), delay);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  const typeStyles = {
    success: 'border-[var(--kg-border-strong)] bg-[var(--kg-rail-bg)] text-[var(--kg-rail-text)]',
    error: 'border-[var(--kg-danger)]/50 bg-[var(--kg-rail-bg)] text-[var(--kg-rail-text)]',
    warning: 'border-[var(--kg-warning)]/50 bg-[var(--kg-rail-bg)] text-[var(--kg-rail-text)]',
    info: 'border-[var(--kg-rail-border)] bg-[var(--kg-rail-bg)] text-[var(--kg-rail-text)]'
  };

  const iconColors = {
    success: 'text-[#7EDBA8]',
    error: 'text-[#FF968E]',
    warning: 'text-[#FFD285]',
    info: 'text-[#F59B62]'
  };

  const icons = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info
  };

  const Icon = icons[message.type];

  return (
    <div
      className={`kg-animate-toast-in flex items-center gap-3 p-3.5 rounded-xl border shadow-lg max-w-sm pointer-events-auto ${typeStyles[message.type]}`}
    >
      <Icon size={18} strokeWidth={1.85} className={`flex-shrink-0 ${iconColors[message.type]}`} />
      <span className="text-xs font-semibold leading-normal flex-1">{message.title}</span>
      <button
        type="button"
        onClick={() => onClose(message.id)}
        aria-label="Đóng thông báo"
        className="kg-pressable w-11 h-11 sm:w-8 sm:h-8 -mr-1.5 rounded-lg flex items-center justify-center text-[var(--kg-rail-muted)] hover:text-white hover:bg-white/10 flex-shrink-0"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function KgBottomSheet({
  isOpen,
  open,
  onClose,
  title,
  subtitle,
  footer,
  children
}: {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const resolvedOpen = Boolean(isOpen ?? open);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();

  useDialogA11y({
    isOpen: resolvedOpen,
    containerRef: dialogRef,
    onClose,
    closeOnEscape: true,
  });

  if (!resolvedOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6">
      <div
        onClick={onClose}
        className="kg-fade-in fixed inset-0 bg-black/60 pointer-events-auto"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="kg-animate-sheet-up sm:kg-animate-scale-in relative z-10 w-full max-w-lg max-h-[90dvh] sm:max-h-[86dvh] mx-auto bg-[var(--kg-surface)] text-[var(--kg-text)] rounded-t-[22px] sm:rounded-[20px] border border-[var(--kg-border)] shadow-2xl flex flex-col pointer-events-auto overflow-hidden focus:outline-none"
      >
        <div className="sm:hidden flex justify-center pt-2 pb-0.5 bg-[var(--kg-surface-2)] flex-shrink-0" aria-hidden="true">
          <span className="w-9 h-1 rounded-full bg-[var(--kg-border-strong)]" />
        </div>
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-2)] flex items-center justify-between gap-3 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-sm font-extrabold tracking-tight text-[var(--kg-text)] truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-[var(--kg-text-muted)] mt-0.5 leading-snug line-clamp-2">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="kg-pressable w-11 h-11 sm:w-9 sm:h-9 rounded-[11px] bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:border-[var(--kg-border-strong)] flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto px-4 sm:px-5 py-4 min-h-0 ${!footer ? 'pb-safe sm:pb-4' : ''}`}>
          {children}
        </div>

        {footer && (
          <div className="px-4 sm:px-5 py-3 pb-safe sm:pb-3 border-t border-[var(--kg-border)] bg-[var(--kg-surface-2)] flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export function KgConfirmSheet({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Đồng ý',
  cancelLabel = 'Hủy',
  variant = 'primary',
  loading = false
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'warning' | 'info';
  loading?: boolean;
}) {
  const buttonVariant = variant === 'info' ? 'primary' : variant;
  return (
    <KgBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2.5">
          <KgButton variant="secondary" size="md" className="flex-1" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </KgButton>
          <KgButton variant={buttonVariant} size="md" className="flex-1" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </KgButton>
        </div>
      }
    >
      <div className="py-1">
        <div className="text-sm text-[var(--kg-text-muted)] leading-relaxed break-words">
          {message}
        </div>
      </div>
    </KgBottomSheet>
  );
}

export function KgModal({
  isOpen,
  open,
  onClose,
  title,
  subtitle,
  footer,
  size = 'md',
  closeOnBackdropClick = true,
  className = '',
  children
}: {
  isOpen?: boolean;
  open?: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdropClick?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const resolvedOpen = Boolean(isOpen ?? open);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();

  useDialogA11y({
    isOpen: resolvedOpen,
    containerRef: dialogRef,
    onClose,
    closeOnEscape: true,
  });

  if (!resolvedOpen || typeof document === 'undefined') return null;

  const sizeStyles = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return createPortal(
    <div className="fixed inset-0 z-[10060] flex items-center justify-center p-3 sm:p-5 md:p-6">
      <div
        onClick={closeOnBackdropClick ? onClose : undefined}
        className="kg-fade-in fixed inset-0 bg-black/60 pointer-events-auto"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`kg-animate-scale-in relative z-10 w-full ${sizeStyles[size]} max-h-[88dvh] mx-auto bg-[var(--kg-surface)] text-[var(--kg-text)] rounded-[20px] border border-[var(--kg-border)] shadow-2xl flex flex-col pointer-events-auto overflow-hidden focus:outline-none ${className}`}
      >
        {title && (
          <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-2)] flex items-center justify-between gap-3 flex-shrink-0">
            <div className="min-w-0 flex-1">
              <h3 id={titleId} className="text-sm font-extrabold tracking-tight text-[var(--kg-text)] truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-[var(--kg-text-muted)] mt-0.5 leading-snug line-clamp-2">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng hộp thoại"
              className="kg-pressable w-11 h-11 sm:w-9 sm:h-9 rounded-[11px] bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:border-[var(--kg-border-strong)] flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 min-h-0">
          {children}
        </div>
        {footer && (
          <div className="px-4 sm:px-5 py-3 border-t border-[var(--kg-border)] bg-[var(--kg-surface-2)] flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export interface KgTabItem<T extends string = string> {
  id: T;
  label: string;
  shortLabel?: string;
  icon?: React.ComponentType<any>;
  badge?: number | string;
  disabled?: boolean;
}

export function KgTabs<T extends string = string>({
  items,
  value,
  onChange,
  ariaLabel = 'Chuyển đổi mục',
  variant = 'pill',
  className = '',
}: {
  items: KgTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  variant?: 'pill' | 'segmented';
  className?: string;
}) {
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const enabledIndexes = items
      .map((item, i) => (item.disabled ? -1 : i))
      .filter((i) => i >= 0);
    if (enabledIndexes.length === 0) return;

    const currentPos = enabledIndexes.indexOf(idx);
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') {
      nextIdx = enabledIndexes[(currentPos + 1) % enabledIndexes.length];
    } else if (e.key === 'ArrowLeft') {
      nextIdx = enabledIndexes[(currentPos - 1 + enabledIndexes.length) % enabledIndexes.length];
    } else if (e.key === 'Home') {
      nextIdx = enabledIndexes[0];
    } else if (e.key === 'End') {
      nextIdx = enabledIndexes[enabledIndexes.length - 1];
    }

    if (nextIdx !== null) {
      e.preventDefault();
      const target = items[nextIdx];
      if (target) {
        onChange(target.id);
        tabRefs.current[nextIdx]?.focus();
      }
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={
        variant === 'segmented'
          ? `inline-flex items-center gap-1 p-1 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] max-w-full overflow-x-auto hide-scrollbar ${className}`
          : `flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 ${className}`
      }
    >
      {items.map((item, idx) => {
        const isActive = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={
              variant === 'segmented'
                ? `kg-pressable inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3 sm:px-3.5 py-1.5 rounded-[10px] text-xs font-bold whitespace-nowrap select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary-ink)] disabled:opacity-50 disabled:pointer-events-none ${
                    isActive
                      ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] shadow-xs'
                      : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface)]/70'
                  }`
                : `kg-pressable kg-filter-pill ${isActive ? 'kg-filter-pill--active' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary-ink)] disabled:opacity-50 disabled:pointer-events-none`
            }
          >
            {Icon && <Icon size={15} strokeWidth={isActive ? 2 : 1.75} className="flex-shrink-0" />}
            <span className="truncate">{item.shortLabel ? (
              <>
                <span className="sm:hidden">{item.shortLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </>
            ) : item.label}</span>
            {item.badge !== undefined && item.badge !== null && item.badge !== '' && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold font-mono tabular-nums leading-none ${
                  isActive
                    ? 'bg-white/20 text-current dark:bg-black/15'
                    : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)]'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function KgSyncStatus({
  isSyncing,
  lastSyncTime,
  onRefresh,
  pendingCount = 0
}: {
  isSyncing: boolean;
  lastSyncTime?: number;
  onRefresh?: () => void;
  pendingCount?: number;
}) {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const pillStyle = !isOnline
    ? 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/25 text-[var(--kg-danger)]'
    : pendingCount > 0
      ? 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/25 text-[var(--kg-warning)]'
      : 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/20 text-[var(--kg-success)]';

  return (
    <div className={`inline-flex items-center gap-1.5 min-h-[40px] lg:min-h-[38px] pl-2.5 pr-1 py-0.5 rounded-[11px] border text-xs font-bold select-none whitespace-nowrap transition-colors ${pillStyle}`}>
      {isOnline ? (
        <Wifi size={13} className="flex-shrink-0" />
      ) : (
        <WifiOff size={13} className="animate-pulse flex-shrink-0" />
      )}
      <span className="truncate min-w-0 font-mono tabular-nums">
        {pendingCount > 0 ? (
          <span className="font-bold font-sans">Chờ ({pendingCount})</span>
        ) : isSyncing ? (
          <span className="font-sans">Đang đồng bộ...</span>
        ) : lastSyncTime ? (
          <>
            <span className="hidden 2xl:inline font-sans">Đồng bộ </span>
            {new Date(lastSyncTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </>
        ) : (
          <span className="font-sans">Trực tuyến</span>
        )}
      </span>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isSyncing}
          aria-label="Làm mới dữ liệu"
          className="w-8 h-8 min-w-[32px] min-h-[32px] rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex-shrink-0 touch-manipulation"
        >
          <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
        </button>
      )}
    </div>
  );
}

export function KgErrorState({
  title = 'Đã xảy ra lỗi',
  description = 'Không thể nạp dữ liệu vào lúc này. Vui lòng kiểm tra kết nối mạng và thử lại.',
  onRetry
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-6 py-10 bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 rounded-xl">
      <div className="w-11 h-11 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-danger)] mb-3">
        <AlertCircle size={20} strokeWidth={1.75} />
      </div>
      <h4 className="text-sm font-semibold text-[var(--kg-text)]">{title}</h4>
      <p className="text-xs text-[var(--kg-text-muted)] mt-1 max-w-[300px] leading-relaxed">
        {description}
      </p>
      {onRetry && (
        <div className="mt-4">
          <KgButton size="sm" onClick={onRetry} variant="secondary" icon={RefreshCw}>
            Thử lại
          </KgButton>
        </div>
      )}
    </div>
  );
}

// ============================================
// Action Sheet Component
// ============================================

export function KgActionSheet({
  isOpen,
  onClose,
  title,
  actions
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  actions: {
    label: string;
    icon: React.ComponentType<any>;
    onClick: () => void;
    color?: string;
    adminOnly?: boolean;
    group?: string;
    active?: boolean;
    onPrefetch?: () => void;
  }[];
}) {
  const groupedActions = actions.reduce<Array<{ label: string; items: typeof actions }>>((groups, action) => {
    const groupLabel = action.group || 'Tính năng khác';
    const existingGroup = groups.find((group) => group.label === groupLabel);
    if (existingGroup) existingGroup.items.push(action);
    else groups.push({ label: groupLabel, items: [action] });
    return groups;
  }, []);

  return (
    <KgBottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4 py-1">
        {groupedActions.map((group, gIdx) => {
          const staggerClass =
            gIdx === 0
              ? 'kg-stagger-1'
              : gIdx === 1
                ? 'kg-stagger-2'
                : gIdx === 2
                  ? 'kg-stagger-3'
                  : 'kg-stagger-4';
          return (
          <section key={group.label} className={`kg-action-group kg-animate-fade-up ${staggerClass}`}>
            <div className="flex items-center gap-2 px-1 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)]" />
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--kg-text-muted)]">
                {group.label}
              </h4>
              <span className="h-px flex-1 bg-[var(--kg-border)]" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {group.items.map((act) => (
                <button
                  type="button"
                  key={`${group.label}-${act.label}`}
                  onClick={() => {
                    act.onClick();
                    onClose();
                  }}
                  onPointerEnter={act.onPrefetch}
                  onFocus={act.onPrefetch}
                  onTouchStart={act.onPrefetch}
                  aria-current={act.active ? 'page' : undefined}
                  className={`kg-action-tile kg-pressable flex flex-col items-center justify-center p-2.5 rounded-xl gap-2 min-h-[84px] ${
                    act.active
                      ? 'kg-action-tile--active text-[var(--kg-primary-fg)]'
                      : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg border flex items-center justify-center ${
                      act.active
                        ? 'kg-action-icon--active'
                        : 'kg-section-icon bg-[var(--kg-surface)] border-[var(--kg-border)]'
                    }`}
                  >
                    <act.icon size={18} strokeWidth={1.75} />
                  </div>
                  <span className="text-[11px] font-semibold text-center leading-tight line-clamp-2 break-words w-full">
                    {act.label}
                  </span>
                </button>
              ))}
            </div>
          </section>
          );
        })}
      </div>
    </KgBottomSheet>
  );
}

// ============================================
// Kumo Compact Operational Module Header
// ============================================

const MODULE_ICON_MAP = {
  today: LayoutDashboard,
  dashboard: LayoutDashboard,
  checkin: MapPin,
  attendance: Clock,
  workforce: CalendarDays,
  work: ClipboardCheck,
  communications: Newspaper,
  knowledge: GraduationCap,
  ledger: Clock,
  incidents: AlertTriangle,
  schedule: CalendarDays,
  roster: Users,
  swap: ArrowLeftRight,
  timesheet: Clock,
  history: History,
  payroll: DollarSign,
  adminpayroll: DollarSign,
  advance: DollarSign,
  reward: Trophy,
  checklist: ClipboardCheck,
  handover: Repeat,
  news: Newspaper,
  soldout: UtensilsCrossed,
  discipline: ShieldAlert,
  feedback: MessageSquareWarning,
  training: GraduationCap,
  guide: BookOpen,
  admin: Building2,
  adminops: Network,
  adminpeoplepay: Users,
  adminsystem: BarChart3,
  hrlist: Users,
  adminorg: KeyRound,
  adminshift: CalendarRange,
  operations: Network,
  adminoperations: Network,
  analytics: BarChart3
} as const;

export function Kg3dIllustration({ moduleId }: { moduleId: string }) {
  const normId = moduleId.toLowerCase().replace(/[-_]/g, '');
  const Icon = MODULE_ICON_MAP[normId as keyof typeof MODULE_ICON_MAP] || Sparkles;
  return (
    <div
      className="w-9 h-9 rounded-lg bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-primary)] flex items-center justify-center flex-shrink-0"
      aria-hidden="true"
    >
      <Icon size={18} strokeWidth={1.75} />
    </div>
  );
}

export function KgModuleHero({
  moduleId: _moduleId,
  title,
  description,
  eyebrow = 'Phân hệ',
  features = [],
  tipTitle,
  tipContent,
  tips,
  actions
}: {
  moduleId: string;
  title: string;
  description?: string;
  eyebrow?: string;
  features?: string[];
  tipTitle?: string;
  tipContent?: React.ReactNode;
  tips?: string[];
  actions?: React.ReactNode;
}) {
  void _moduleId;
  const hasTip = Boolean(tipContent || tips || (description && description.length > 24));

  return (
    <section className="kg-module-hero mb-3 sm:mb-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="inline-flex items-center text-[10.5px] sm:text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--kg-primary-ink)]">
                {eyebrow}
              </span>
              {features.slice(0, 2).map((feat, idx) => (
                <span
                  key={idx}
                  className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[10.5px] font-semibold text-[var(--kg-text-muted)]"
                >
                  {feat}
                </span>
              ))}
            </div>
            {hasTip && (
              <div className="sm:hidden flex-shrink-0">
                <KgFeatureTip
                  title={tipTitle || `Hướng dẫn: ${title}`}
                  content={tipContent || description}
                  tips={tips}
                  variant="subtle"
                  iconType="help"
                />
              </div>
            )}
          </div>
          <h1 className="text-xl sm:text-[26px] font-extrabold text-[var(--kg-text)] leading-tight tracking-tight mt-0.5">
            {title}
          </h1>
          {description && (
            <p className="text-xs sm:text-[13px] text-[var(--kg-text-muted)] mt-1 leading-relaxed max-w-2xl line-clamp-2">
              {description}
            </p>
          )}
        </div>

        {(hasTip || actions) && (
          <div className={`flex items-center gap-2 flex-wrap sm:flex-nowrap sm:justify-end flex-shrink-0 min-w-0 ${!actions ? 'hidden sm:flex' : 'w-full sm:w-auto'}`}>
            {hasTip && (
              <div className="hidden sm:inline-flex">
                <KgFeatureTip
                  title={tipTitle || `Hướng dẫn: ${title}`}
                  content={tipContent || description}
                  tips={tips}
                  variant="badge"
                  iconType="help"
                  triggerText="Mẹo & Lưu ý"
                />
              </div>
            )}
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}
