import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, AlertCircle, CheckCircle2, AlertTriangle, Info, RefreshCw, Wifi, WifiOff,
  LayoutDashboard, MapPin, CalendarDays, Users, ArrowLeftRight, Clock, History,
  DollarSign, Trophy, ClipboardCheck, Repeat, Newspaper, UtensilsCrossed,
  ShieldAlert, MessageSquareWarning, GraduationCap, BookOpen, Building2,
  KeyRound, CalendarRange, BarChart3, Sparkles, Network
} from 'lucide-react';
import { KgFeatureTip } from './KgFeatureTip';

export { KgFeatureTip, type KgFeatureTipProps } from './KgFeatureTip';
export { KgFeatureTip as KgTooltip } from './KgFeatureTip';

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
      className={`w-full ${wide ? 'max-w-[1520px]' : 'max-w-[1360px]'} mx-auto px-3 sm:px-4 md:px-5 py-3 md:py-4 space-y-4 ${className}`}
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
      {actions && <div className="flex items-center gap-2 flex-wrap min-w-0">{actions}</div>}
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
  return (
    <div
      onClick={onClick}
      data-selected={selected ? 'true' : undefined}
      className={`kg-card bg-[var(--kg-surface)] border ${
        selected ? 'border-[var(--kg-primary)] ring-1 ring-[var(--kg-primary)]/25' : 'border-[var(--kg-border)]'
      } rounded-[var(--radius-lg)] p-4 md:p-5 transition-colors duration-150 min-w-0 ${
        stacked ? 'shadow-card' : ''
      } ${
        onClick ? 'cursor-pointer select-none active:scale-[0.995] touch-manipulation' : ''
      } ${
        hoverable || onClick ? 'hover:border-[var(--kg-border-strong)]' : ''
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
  title
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
}) {
  const baseStyles =
    'inline-flex items-center justify-center font-semibold transition-colors duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary)] focus-visible:ring-offset-1 disabled:bg-[var(--kg-surface-soft)] disabled:text-[var(--kg-text-soft)] disabled:border-[var(--kg-border)] disabled:shadow-none disabled:pointer-events-none touch-manipulation select-none flex-shrink-0';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5 min-h-[34px]',
    md: 'px-3.5 py-2 text-sm rounded-lg gap-2 min-h-[42px]',
    lg: 'px-5 py-2.5 text-sm sm:text-base rounded-xl gap-2.5 min-h-[46px]'
  };

  const variantStyles = {
    primary:
      'bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white border border-[var(--kg-primary)] shadow-soft',
    secondary: selected
      ? 'bg-[var(--kg-surface-soft)] text-[var(--kg-primary)] border border-[var(--kg-primary)]'
      : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)] hover:border-[var(--kg-border-strong)]',
    danger:
      'bg-[var(--kg-danger)] hover:brightness-95 text-white border border-[var(--kg-danger)] shadow-soft',
    warning:
      'bg-[var(--kg-warning)] hover:brightness-95 text-white border border-[var(--kg-warning)] shadow-soft',
    ghost:
      'bg-transparent border border-transparent text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)]'
  };

  return (
    <button
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
      <span className="truncate">{children}</span>
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
    primary: 'bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white border border-[var(--kg-primary)] shadow-soft',
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
      className={`w-10 h-10 sm:w-10 sm:h-10 min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center active:translate-y-px transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none touch-manipulation flex-shrink-0 ${variantStyles[variant]} ${className}`}
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
  className = '',
  id,
  required,
  ...props
}: {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ComponentType<any>;
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
          className={`w-full min-h-[42px] px-3.5 py-2 ${
            Icon ? 'pl-10' : ''
          } text-sm bg-[var(--kg-surface)] border ${
            error ? 'border-[var(--kg-danger)]' : 'border-[var(--kg-border)] hover:border-[var(--kg-border-strong)]'
          } rounded-lg focus:border-[var(--kg-primary)] focus:outline-none transition-colors placeholder-[var(--kg-text-soft)] text-[var(--kg-text)] disabled:bg-[var(--kg-surface-soft)] disabled:text-[var(--kg-text-muted)]`}
          {...props}
        />
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
  id,
  required,
  ...props
}: {
  label?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
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
        className={`w-full min-h-[42px] px-3.5 py-2 text-sm bg-[var(--kg-surface)] border ${
          error ? 'border-[var(--kg-danger)]' : 'border-[var(--kg-border)] hover:border-[var(--kg-border-strong)]'
        } rounded-lg focus:border-[var(--kg-primary)] focus:outline-none transition-colors text-[var(--kg-text)] disabled:bg-[var(--kg-surface-soft)] disabled:text-[var(--kg-text-muted)]`}
        {...props}
      >
        {children}
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
        className={`w-full px-3.5 py-2.5 text-sm bg-[var(--kg-surface)] border ${
          error ? 'border-[var(--kg-danger)]' : 'border-[var(--kg-border)] hover:border-[var(--kg-border-strong)]'
        } rounded-lg focus:border-[var(--kg-primary)] focus:outline-none transition-colors placeholder-[var(--kg-text-soft)] text-[var(--kg-text)] min-h-[96px] disabled:bg-[var(--kg-surface-soft)]`}
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
    success: 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/20',
    warning: 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-[var(--kg-warning)]/20',
    error: 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border-[var(--kg-danger)]/20',
    info: 'bg-[var(--kg-surface-soft)] text-[var(--kg-primary)] border-[var(--kg-border)]'
  };

  return (
    <KgCard
      onClick={onClick}
      className={`kg-metric-card flex flex-col justify-between gap-2.5 p-3.5 sm:p-4 ${className}`}
      hoverable={Boolean(onClick)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] sm:text-xs text-[var(--kg-text-muted)] font-semibold leading-snug">
          {title}
        </span>
        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${iconStyles[variant]}`}>
          <Icon size={16} strokeWidth={1.8} />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-extrabold text-[var(--kg-text)] tracking-tight tabular-nums font-mono leading-none">
          {value}
        </p>
        {subtext && (
          <p className="text-[11px] text-[var(--kg-text-soft)] font-medium mt-1 leading-snug line-clamp-1">
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

export function KgLoadingOverlay({ text = 'Đang xử lý...' }: { text?: string }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[10200] flex items-center justify-center p-4"
    >
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-xl flex items-center gap-3.5 max-w-xs w-full mx-auto shadow-xl">
        <RefreshCw className="w-5 h-5 text-[var(--kg-primary)] animate-spin flex-shrink-0" />
        <span className="text-sm font-semibold text-[var(--kg-text)] leading-snug">
          {text}
        </span>
      </div>
    </div>,
    document.body
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
    success: 'border-[var(--kg-success)]/25 bg-[var(--kg-surface)] text-[var(--kg-text)]',
    error: 'border-[var(--kg-danger)]/25 bg-[var(--kg-surface)] text-[var(--kg-text)]',
    warning: 'border-[var(--kg-warning)]/25 bg-[var(--kg-surface)] text-[var(--kg-text)]',
    info: 'border-[var(--kg-border)] bg-[var(--kg-surface)] text-[var(--kg-text)]'
  };

  const iconColors = {
    success: 'text-[var(--kg-success)]',
    error: 'text-[var(--kg-danger)]',
    warning: 'text-[var(--kg-warning)]',
    info: 'text-[var(--kg-primary)]'
  };

  const icons = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info
  };

  const Icon = icons[message.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={`flex items-center gap-3 p-3.5 rounded-xl border shadow-lg max-w-sm pointer-events-auto ${typeStyles[message.type]}`}
    >
      <Icon size={18} strokeWidth={1.75} className={`flex-shrink-0 ${iconColors[message.type]}`} />
      <span className="text-xs font-semibold leading-normal flex-1">{message.title}</span>
      <button
        type="button"
        onClick={() => onClose(message.id)}
        aria-label="Đóng thông báo"
        className="text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors p-1 rounded"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

export function KgBottomSheet({
  isOpen,
  onClose,
  title,
  children
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/55 backdrop-blur-sm pointer-events-auto"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-lg max-h-[90dvh] sm:max-h-[85vh] mx-auto bg-[var(--kg-surface)] text-[var(--kg-text)] rounded-t-2xl sm:rounded-2xl border border-[var(--kg-border)] shadow-2xl flex flex-col pointer-events-auto overflow-hidden pb-safe"
          >
            <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/70 flex items-center justify-between gap-3 flex-shrink-0">
              <h3 className="text-sm font-semibold text-[var(--kg-text)] truncate">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng hộp thoại"
                className="w-9 h-9 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] active:scale-95 transition-colors flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 min-h-0">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
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
  variant?: 'primary' | 'danger' | 'warning';
  loading?: boolean;
}) {
  return (
    <KgBottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4 py-1">
        <div className="text-sm text-[var(--kg-text-muted)] leading-relaxed">
          {message}
        </div>
        <div className="flex gap-2.5 pt-1">
          <KgButton variant="secondary" size="md" className="flex-1" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </KgButton>
          <KgButton variant={variant} size="md" className="flex-1" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </KgButton>
        </div>
      </div>
    </KgBottomSheet>
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

  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-medium text-[var(--kg-text-muted)] select-none">
      {isOnline ? (
        <Wifi size={13} className="text-[var(--kg-success)]" />
      ) : (
        <WifiOff size={13} className="text-[var(--kg-danger)] animate-pulse" />
      )}
      <span className="truncate">
        {pendingCount > 0 ? (
          <span className="text-[var(--kg-warning)] font-semibold">Chờ đồng bộ ({pendingCount})</span>
        ) : isSyncing ? (
          'Đang đồng bộ...'
        ) : lastSyncTime ? (
          `Cập nhật ${new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        ) : (
          'Trực tuyến'
        )}
      </span>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isSyncing}
          aria-label="Làm mới dữ liệu"
          className="ml-0.5 text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors"
        >
          <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
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
        {groupedActions.map((group) => (
          <section key={group.label} className="kg-action-group">
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
                  className={`kg-action-tile flex flex-col items-center justify-center p-2.5 rounded-xl active:scale-95 transition-colors gap-2 min-h-[84px] ${
                    act.active
                      ? 'kg-action-tile--active text-white'
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
                  <span className="text-[11px] font-semibold text-center leading-tight break-words w-full">
                    {act.label}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
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
  moduleId,
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
  const normId = moduleId.toLowerCase().replace(/[-_]/g, '');
  const Icon = MODULE_ICON_MAP[normId as keyof typeof MODULE_ICON_MAP] || Sparkles;
  const hasTip = Boolean(tipContent || tips || (description && description.length > 24));

  return (
    <section className="kg-module-hero relative overflow-hidden bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl px-3.5 py-3 sm:px-5 sm:py-4 shadow-card mb-3 sm:mb-4">
      <span
        aria-hidden="true"
        className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-[var(--kg-accent)]"
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 pl-1.5">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--kg-accent-soft)] border border-[var(--kg-accent)]/20 text-[var(--kg-accent-ink)] flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
            <Icon size={19} strokeWidth={1.85} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider text-[var(--kg-accent-ink)]">
                {eyebrow}
              </span>
              {features.slice(0, 2).map((feat, idx) => (
                <span
                  key={idx}
                  className={`${idx > 0 ? 'hidden sm:inline-flex' : 'inline-flex'} items-center px-2 py-0.5 rounded-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[10.5px] sm:text-[11px] font-semibold text-[var(--kg-text-muted)]`}
                >
                  {feat}
                </span>
              ))}
            </div>
            <h1 className="text-[15px] sm:text-lg md:text-xl font-extrabold text-[var(--kg-text)] leading-snug tracking-tight mt-0.5">
              {title}
            </h1>
            {description && (
              <p className="text-xs text-[var(--kg-text-muted)] mt-0.5 line-clamp-2 sm:line-clamp-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>

        {(hasTip || actions) && (
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
            {hasTip && (
              <KgFeatureTip
                title={tipTitle || `Hướng dẫn: ${title}`}
                content={tipContent || description}
                tips={tips}
                variant="badge"
                triggerText="Mẹo & Lưu ý"
              />
            )}
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}
