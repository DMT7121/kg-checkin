import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle2, AlertTriangle, Info, RefreshCw, Wifi, WifiOff } from 'lucide-react';

// ============================================
// Layout Components
// ============================================

export function KgPage({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`w-full max-w-7xl mx-auto px-4 py-4 md:py-6 space-y-4 md:space-y-6 ${className}`}>
      {children}
    </div>
  );
}

export function KgSection({ children, title, className = '' }: { children: React.ReactNode; title?: string; className?: string }) {
  return (
    <section className={`space-y-3 ${className}`}>
      {title && (
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#6F7785] dark:text-[#9AA1AA] pl-1">
          {title}
        </h3>
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
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-slate-800/40 flex items-center justify-center text-blue-600 dark:text-indigo-400 flex-shrink-0">
            <Icon size={20} />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg md:text-xl font-extrabold text-[#172033] dark:text-white leading-tight truncate">
            {title}
          </h2>
          {description && (
            <p className="text-xs text-[#6F7785] dark:text-[#A0ABC0] mt-0.5 truncate max-w-[280px] sm:max-w-md">
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
// UI Components
// ============================================

export function KgCard({
  children,
  className = '',
  onClick,
  hoverable = false,
  stacked = false
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  stacked?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-3xl p-4 md:p-5 transition-all duration-200 min-w-0 ${
        stacked ? 'neo-card-stack' : ''
      } ${
        onClick ? 'cursor-pointer select-none active:scale-[0.99] touch-manipulation' : ''
      } ${
        hoverable || onClick ? 'hover:border-[#2563eb] dark:hover:border-[#7c3aed] hover:shadow-card hover:-translate-y-0.5' : ''
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
  icon: Icon,
  onClick,
  className = '',
  type = 'button'
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentType<any>;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}) {
  const baseStyles =
    'inline-flex items-center justify-center font-bold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:grayscale disabled:pointer-events-none touch-manipulation select-none flex-shrink-0';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-xl gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl gap-2 min-h-[44px]',
    lg: 'px-6 py-3.5 text-base rounded-2xl gap-2.5 min-h-[50px]'
  };

  const variantStyles = {
    primary: 'bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white border-none shadow-md hover:shadow-lg hover:-translate-y-0.5',
    secondary:
      'bg-white dark:bg-[#0E273C] text-[#0f172a] dark:text-[#f8fafc] border border-[#E8DED1] dark:border-[#1E3F57] hover:bg-[#f3f6ff] dark:hover:bg-[#182230]',
    danger:
      'bg-gradient-to-r from-[#ef4444] to-[#c22d2d] text-white border-none shadow-md hover:shadow-lg hover:-translate-y-0.5',
    warning:
      'bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white border-none shadow-md hover:shadow-lg hover:-translate-y-0.5',
    ghost:
      'bg-transparent border-none text-[#64748b] dark:text-[#98a2b3] hover:bg-[#f3f6ff] dark:hover:bg-[#182230] shadow-none'
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
      ) : Icon ? (
        <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} className="flex-shrink-0" />
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
  title
}: {
  icon: React.ComponentType<any>;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const variantStyles = {
    primary: 'bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white border-none shadow-md',
    secondary:
      'bg-white dark:bg-[#0E273C] text-[#0f172a] dark:text-[#f8fafc] border border-[#E8DED1] dark:border-[#1E3F57] hover:bg-[#f3f6ff] dark:hover:bg-[#182230]',
    danger:
      'bg-[#FFF0EE] dark:bg-[#ef4444]/15 text-[#ef4444] hover:bg-[#FFE0DC] border border-[#FFF0EE] dark:border-[#ef4444]/30',
    ghost: 'bg-transparent text-[#64748b] dark:text-[#98a2b3] hover:bg-[#f3f6ff] dark:hover:bg-[#182230]'
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`w-11 h-11 rounded-xl flex items-center justify-center active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none touch-manipulation flex-shrink-0 ${variantStyles[variant]} ${className}`}
    >
      <Icon size={18} />
    </button>
  );
}

export function KgInput({
  label,
  error,
  icon: Icon,
  className = '',
  ...props
}: {
  label?: string;
  error?: string;
  icon?: React.ComponentType<any>;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`space-y-1.5 w-full ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-[#64748b] dark:text-[#98a2b3] uppercase tracking-wide pl-1">
          {label}
        </label>
      )}
      <div className="relative w-full">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9AA1AA] pointer-events-none">
            <Icon size={16} />
          </div>
        )}
        <input
          className={`w-full px-4 py-2.5 ${
            Icon ? 'pl-11' : ''
          } text-sm bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl focus:border-[#2563eb] dark:focus:border-[#7c3aed] focus:ring-2 focus:ring-[#2563eb]/10 focus:outline-none transition-all placeholder-[#9AA1AA] text-[#0f172a] dark:text-white`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-[#ef4444] dark:text-[#ef4444] font-semibold pl-1">{error}</p>}
    </div>
  );
}

export function KgSelect({
  label,
  error,
  className = '',
  children,
  ...props
}: {
  label?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`space-y-1.5 w-full ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-[#64748b] dark:text-[#98a2b3] uppercase tracking-wide pl-1">
          {label}
        </label>
      )}
      <select
        className="w-full px-4 py-2.5 text-sm bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl focus:border-[#2563eb] dark:focus:border-[#7c3aed] focus:ring-2 focus:ring-[#2563eb]/10 focus:outline-none transition-all text-[#0f172a] dark:text-white"
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-[#ef4444] dark:text-[#ef4444] font-semibold pl-1">{error}</p>}
    </div>
  );
}

export function KgTextarea({
  label,
  error,
  className = '',
  ...props
}: {
  label?: string;
  error?: string;
  className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={`space-y-1.5 w-full ${className}`}>
      {label && (
        <label className="block text-xs font-bold text-[#64748b] dark:text-[#98a2b3] uppercase tracking-wide pl-1">
          {label}
        </label>
      )}
      <textarea
        className="w-full px-4 py-2.5 text-sm bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl focus:border-[#2563eb] dark:focus:border-[#7c3aed] focus:ring-2 focus:ring-[#2563eb]/10 focus:outline-none transition-all placeholder-[#9AA1AA] text-[#0f172a] dark:text-white min-h-[100px]"
        {...props}
      />
      {error && <p className="text-xs text-[#ef4444] dark:text-[#ef4444] font-semibold pl-1">{error}</p>}
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
      'bg-[#EEF7F0] text-[#10b981] border border-[#EEF7F0] dark:bg-[#10b981]/15 dark:text-[#10b981] dark:border-[#10b981]/30',
    warning:
      'bg-[#FFF7E4] text-[#f59e0b] border border-[#FFF7E4] dark:bg-[#f59e0b]/15 dark:text-[#f59e0b] dark:border-[#f59e0b]/30',
    error:
      'bg-[#FFF0EE] text-[#ef4444] border border-[#FFF0EE] dark:bg-[#ef4444]/15 dark:text-[#ef4444] dark:border-[#ef4444]/30',
    info:
      'bg-[#FFF0ED] text-[#2563eb] border border-[#FFF0ED] dark:bg-[#2563eb]/15 dark:text-[#2563eb] dark:border-[#2563eb]/30',
    neutral:
      'bg-[#FBF7F0] text-[#64748b] border border-[#E8DED1] dark:bg-[#122F48] dark:text-[#98a2b3] dark:border-[#1E3F57]'
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold leading-5 whitespace-nowrap ${styles[variant]} ${className}`}
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
    success: 'bg-[#EEF7F0] text-[#10b981] dark:bg-[#10b981]/15',
    warning: 'bg-[#FFF7E4] text-[#f59e0b] dark:bg-[#f59e0b]/15',
    error: 'bg-[#FFF0EE] text-[#ef4444] dark:bg-[#ef4444]/15',
    info: 'bg-[#FFF0ED] text-[#2563eb] dark:bg-[#2563eb]/15'
  };

  return (
    <KgCard onClick={onClick} className={`flex items-center justify-between p-4 ${className}`} hoverable={!!onClick}>
      <div className="space-y-1 min-w-0">
        <span className="text-[11px] text-[#64748b] dark:text-[#98a2b3] font-bold uppercase tracking-wider block truncate">
          {title}
        </span>
        <p className="text-xl md:text-2xl font-black text-[#0f172a] dark:text-white tracking-tight truncate">
          {value}
        </p>
        {subtext && (
          <p className="text-[10px] text-[#9AA1AA] dark:text-[#718096] font-bold truncate">
            {subtext}
          </p>
        )}
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconStyles[variant]}`}>
        <Icon size={18} />
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
      'bg-[#EEF7F0] border border-[#EEF7F0]/30 text-[#10b981] dark:bg-[#10b981]/15 dark:text-[#10b981]',
    warning:
      'bg-[#FFF7E4] border border-[#FFF7E4]/30 text-[#f59e0b] dark:bg-[#f59e0b]/15 dark:text-[#f59e0b]',
    error:
      'bg-[#FFF0EE] border border-[#FFF0EE]/30 text-[#ef4444] dark:bg-[#ef4444]/15 dark:text-[#ef4444]',
    info:
      'bg-[#FFF0ED] border border-[#FFF0ED]/30 text-[#2563eb] dark:bg-[#2563eb]/15 dark:text-[#2563eb]'
  };

  const icons = {
    success: CheckCircle2,
    warning: AlertTriangle,
    error: AlertCircle,
    info: Info
  };

  const DisplayIcon = Icon || icons[variant];

  return (
    <div className={`p-4 rounded-2xl flex gap-3 ${styles[variant]} ${className} min-w-0`}>
      <div className="flex-shrink-0 mt-0.5">
        <DisplayIcon size={18} />
      </div>
      <div className="flex-1 space-y-1 min-w-0">
        {title && <h4 className="text-xs font-black uppercase tracking-wider leading-none">{title}</h4>}
        <div className="text-xs leading-relaxed opacity-95">{children}</div>
      </div>
    </div>
  );
}

export function KgSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 dark:bg-slate-800 rounded-xl ${className}`} />;
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
  return (
    <div className="flex flex-col items-center justify-center text-center p-6 py-10 bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] border-dashed rounded-3xl">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-[#f3f6ff] dark:bg-[#122F48] flex items-center justify-center text-[#9AA1AA] dark:text-[#718096] mb-4">
          <Icon size={22} />
        </div>
      )}
      <h4 className="text-sm font-bold text-[#0f172a] dark:text-white">{title}</h4>
      <p className="text-xs text-[#64748b] dark:text-[#98a2b3] mt-1 max-w-[280px] leading-relaxed">
        {description}
      </p>
      {action && (
        <div className="mt-4">
          {React.isValidElement(action) ? (
            action
          ) : (
            // @ts-ignore
            <KgButton size="sm" onClick={action.onClick}>
              {action.label}
            </KgButton>
          )}
        </div>
      )}
    </div>
  );
}

export function KgLoadingOverlay({ text = 'Đang xử lý...' }: { text?: string }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-5 rounded-2xl flex items-center gap-4 max-w-xs shadow-2xl">
        <RefreshCw className="w-5 h-5 text-blue-600 dark:text-indigo-400 animate-spin flex-shrink-0" />
        <span className="text-sm font-bold text-[#172033] dark:text-white leading-tight">
          {text}
        </span>
      </div>
    </div>
  );
}

// ============================================
// Feedback Components
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
    success: 'border-emerald-100 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/10',
    error: 'border-rose-100 bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/10',
    warning: 'border-amber-100 bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/10',
    info: 'border-blue-100 bg-blue-50 text-blue-600 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/10'
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
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className={`flex items-center gap-3 p-3.5 rounded-xl border shadow-lg max-w-sm pointer-events-auto ${typeStyles[message.type]}`}
    >
      <Icon size={18} className="flex-shrink-0" />
      <span className="text-xs font-bold leading-normal flex-1">{message.title}</span>
      <button onClick={() => onClose(message.id)} className="opacity-60 hover:opacity-100 transition-opacity p-0.5">
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
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[999] pointer-events-auto"
          />
          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="fixed left-0 right-0 bottom-0 max-h-[85vh] bg-[#F8F3EA] dark:bg-[#061B2B] z-[999] rounded-t-3xl border-t border-[#E8DED1] dark:border-[#1E3F57] shadow-2xl flex flex-col pointer-events-auto overflow-hidden pb-safe-bottom"
          >
            {/* Handle bar */}
            <div className="w-12 h-1 bg-[#E8DED1] dark:bg-[#1E3F57] rounded-full mx-auto my-3 flex-shrink-0" />
            
            {/* Header */}
            <div className="px-5 pb-3 border-b border-[#E8DED1] dark:border-[#1E3F57] flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-black uppercase tracking-wider text-[#172033] dark:text-white">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] flex items-center justify-center text-[#6F7785] hover:text-[#172033] dark:hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 hide-scrollbar">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger' | 'warning';
  loading?: boolean;
}) {
  return (
    <KgBottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-5 py-2">
        <p className="text-sm text-[#6F7785] dark:text-[#A0ABC0] leading-relaxed font-medium">
          {message}
        </p>
        <div className="flex gap-3">
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
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] text-xs font-bold text-[#6F7785] dark:text-[#A0ABC0] select-none">
      {isOnline ? (
        <Wifi size={13} className="text-[#4F8A5B]" />
      ) : (
        <WifiOff size={13} className="text-[#C94335] animate-pulse" />
      )}
      <span className="truncate">
        {pendingCount > 0 ? (
          <span className="text-[#D8A23A]">Chờ đồng bộ ({pendingCount})</span>
        ) : isSyncing ? (
          'Đang cập nhật...'
        ) : lastSyncTime ? (
          `Cập nhật: ${new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        ) : (
          'Trực tuyến'
        )}
      </span>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isSyncing}
          className="ml-1 text-[#6F7785] hover:text-[#172033] dark:hover:text-white transition-colors"
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
    <div className="flex flex-col items-center justify-center text-center p-6 py-12 bg-[#FFF0EE] border border-[#FFF0EE] dark:bg-[#D8584B]/15 rounded-2xl">
      <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#0E273C] flex items-center justify-center text-[#C94335] mb-4 shadow-sm">
        <AlertCircle size={22} />
      </div>
      <h4 className="text-sm font-bold text-[#172033] dark:text-white">{title}</h4>
      <p className="text-xs text-[#6F7785] dark:text-[#A0ABC0] mt-1 max-w-[280px] leading-relaxed">
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
  }[];
}) {
  return (
    <KgBottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <div className="grid grid-cols-3 gap-2.5 py-1">
        {actions.map((act, i) => (
          <button
            key={i}
            onClick={() => {
              act.onClick();
              onClose();
            }}
            className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-white dark:hover:bg-[#0E273C] active:scale-95 transition-all text-[#6F7785] dark:text-white gap-1.5"
          >
            <div className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-center shadow-sm text-blue-600 dark:text-indigo-400">
              <act.icon size={20} />
            </div>
            <span className="text-[10px] font-bold text-center leading-tight tracking-wide uppercase break-words w-full">
              {act.label}
            </span>
          </button>
        ))}
      </div>
    </KgBottomSheet>
  );
}

// ============================================
// 3D Glassmorphism Illustrations
// ============================================

export function Kg3dIllustration({ moduleId }: { moduleId: string }) {
  const normId = moduleId.toLowerCase().replace(/[-_]/g, '');

  const defs = (
    <defs>
      <linearGradient id="illPrimary" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#7c3aed" />
      </linearGradient>
      <linearGradient id="illAccent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
      <linearGradient id="illSuccess" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <linearGradient id="illWarning" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </linearGradient>
      <linearGradient id="illDanger" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="100%" stopColor="#dc2626" />
      </linearGradient>
      <linearGradient id="illGlass" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="rgba(255, 255, 255, 0.45)" />
        <stop offset="100%" stopColor="rgba(255, 255, 255, 0.08)" />
      </linearGradient>
      <filter id="illGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
  );

  const containerClass = "w-20 h-20 md:w-24 md:h-24 drop-shadow-xl select-none pointer-events-none transform hover:scale-105 transition-transform duration-300";

  switch (normId) {
    case 'today':
    case 'dashboard':
    case 'managerdashboard':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <rect x="22" y="24" width="32" height="22" rx="6" fill="url(#illPrimary)" opacity="0.85" />
          <rect x="22" y="52" width="32" height="22" rx="6" fill="url(#illAccent)" opacity="0.85" />
          <rect x="58" y="24" width="20" height="50" rx="6" fill="url(#illGlass)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
          <path d="M18 18 L20 22 L24 20 L20 18 Z" fill="#ffd700" filter="url(#illGlow)" />
          <path d="M78 78 L80 82 L84 80 L80 78 Z" fill="#ffd700" filter="url(#illGlow)" />
          <circle cx="38" cy="35" r="3" fill="#ffffff" />
          <circle cx="38" cy="63" r="3" fill="#ffffff" />
          <line x1="68" y1="35" x2="68" y2="65" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case 'checkin':
    case 'attendancegps':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <line x1="20" y1="50" x2="80" y2="50" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
          <line x1="50" y1="20" x2="50" y2="80" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
          <path d="M50 18 C36 18 32 30 50 68 C68 30 64 18 50 18 Z" fill="url(#illDanger)" filter="url(#illGlow)" />
          <circle cx="50" cy="34" r="7" fill="#ffffff" />
          <circle cx="72" cy="68" r="14" fill="url(#illSuccess)" />
          <path d="M66 68 L70 72 L78 64" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'schedule':
    case 'scheduleregister':
    case 'roster':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <rect x="22" y="24" width="56" height="52" rx="10" fill="url(#illPrimary)" />
          <rect x="22" y="24" width="56" height="14" rx="10" fill="rgba(0,0,0,0.12)" />
          <circle cx="34" cy="48" r="3" fill="#ffffff" />
          <circle cx="50" cy="48" r="3" fill="#ffffff" />
          <circle cx="66" cy="48" r="3" fill="url(#illAccent)" />
          <circle cx="34" cy="62" r="3" fill="#ffffff" />
          <circle cx="50" cy="62" r="3" fill="#ffffff" opacity="0.4" />
          <circle cx="66" cy="62" r="3" fill="#ffffff" />
          <circle cx="75" cy="70" r="16" fill="url(#illGlass)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" filter="url(#illGlow)" />
          <line x1="75" y1="70" x2="75" y2="62" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="75" y1="70" x2="82" y2="70" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case 'payroll':
    case 'adminpayroll':
    case 'reward':
    case 'advance':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <rect x="20" y="32" width="52" height="34" rx="8" fill="url(#illPrimary)" transform="rotate(-6 46 49)" />
          <rect x="26" y="38" width="52" height="34" rx="8" fill="url(#illGlass)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" transform="rotate(4 52 55)" />
          <circle cx="40" cy="68" r="12" fill="url(#illWarning)" filter="url(#illGlow)" />
          <circle cx="40" cy="68" r="8" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="66" cy="64" r="10" fill="url(#illWarning)" />
          <circle cx="66" cy="64" r="6" fill="none" stroke="#ffffff" strokeWidth="2" />
        </svg>
      );

    case 'history':
    case 'attendancehistory':
    case 'timesheet':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <circle cx="44" cy="46" r="24" fill="url(#illPrimary)" />
          <circle cx="44" cy="46" r="20" fill="none" stroke="#ffffff" strokeWidth="2.5" />
          <line x1="44" y1="46" x2="44" y2="34" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          <line x1="44" y1="46" x2="54" y2="46" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          <rect x="36" y="62" width="46" height="18" rx="5" fill="url(#illGlass)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" filter="url(#illGlow)" />
          <line x1="46" y1="71" x2="72" y2="71" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );

    case 'checklist':
    case 'dailychecklist':
    case 'adminchecklist':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <rect x="26" y="20" width="48" height="60" rx="8" fill="url(#illPrimary)" />
          <rect x="38" y="14" width="24" height="10" rx="3" fill="#ffffff" />
          <path d="M34 38 L38 42 L48 32" fill="none" stroke="url(#illSuccess)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="54" y1="36" x2="66" y2="36" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M34 54 L38 58 L48 48" fill="none" stroke="url(#illSuccess)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="54" y1="52" x2="66" y2="52" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M34 70 L38 74 L48 64" fill="none" stroke="url(#illSuccess)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="54" y1="68" x2="66" y2="68" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case 'handover':
    case 'swap':
    case 'shiftswap':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <circle cx="36" cy="42" r="14" fill="url(#illPrimary)" />
          <circle cx="64" cy="54" r="14" fill="url(#illAccent)" />
          <path d="M28 66 C28 72 40 76 50 76 M72 34 C72 28 60 24 50 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          <path d="M46 20 L50 24 L46 28" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M54 72 L50 76 L54 80" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'news':
    case 'newsfeed':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <rect x="22" y="24" width="56" height="52" rx="4" fill="#ffffff" stroke="url(#illPrimary)" strokeWidth="2" />
          <line x1="28" y1="36" x2="48" y2="36" stroke="url(#illPrimary)" strokeWidth="4" strokeLinecap="round" />
          <rect x="52" y="32" width="20" height="20" fill="url(#illAccent)" rx="2" />
          <line x1="28" y1="48" x2="46" y2="48" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="28" y1="56" x2="72" y2="56" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="28" y1="64" x2="72" y2="64" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case 'soldout':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <circle cx="50" cy="52" r="26" fill="#ffffff" stroke="url(#illPrimary)" strokeWidth="3" />
          <path d="M42 36 L42 54 M38 36 C38 42 46 42 46 36" fill="none" stroke="url(#illPrimary)" strokeWidth="3" strokeLinecap="round" />
          <path d="M58 36 L58 54 M54 54 C54 48 62 48 62 54" fill="none" stroke="url(#illPrimary)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="70" cy="30" r="14" fill="url(#illDanger)" filter="url(#illGlow)" />
          <line x1="70" y1="23" x2="70" y2="31" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          <circle cx="70" cy="37" r="2" fill="#ffffff" />
        </svg>
      );

    case 'feedback':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <rect x="20" y="24" width="46" height="32" rx="10" fill="url(#illPrimary)" />
          <path d="M26 56 L20 62 L32 56 Z" fill="url(#illPrimary)" />
          <rect x="36" y="44" width="44" height="30" rx="10" fill="url(#illGlass)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" filter="url(#illGlow)" />
          <path d="M70 74 L76 80 L72 74 Z" fill="#ffffff" />
          <path d="M58 54 C56 52 52 52 51 54 C50 52 46 52 44 54 C42 57 47 62 51 64 C55 62 60 57 58 54 Z" fill="url(#illDanger)" />
        </svg>
      );

    case 'training':
    case 'guide':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <path d="M24 64 L24 28 C24 24 38 24 50 28 C62 24 76 24 76 28 L76 64 C76 60 62 60 50 64 C38 60 24 60 24 64 Z" fill="#ffffff" stroke="url(#illPrimary)" strokeWidth="3" />
          <path d="M50 28 L50 64" stroke="url(#illPrimary)" strokeWidth="3" />
          <path d="M34 32 L50 24 L66 32 L50 40 Z" fill="url(#illAccent)" filter="url(#illGlow)" />
          <rect x="44" y="38" width="12" height="8" fill="url(#illPrimary)" />
        </svg>
      );

    case 'admin':
    case 'adminai':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <rect x="28" y="28" width="44" height="44" rx="8" fill="url(#illPrimary)" />
          <rect x="36" y="36" width="28" height="28" rx="4" fill="url(#illGlass)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" filter="url(#illGlow)" />
          <line x1="38" y1="20" x2="38" y2="28" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="50" y1="20" x2="50" y2="28" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="62" y1="20" x2="62" y2="28" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="38" y1="72" x2="38" y2="80" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="50" y1="72" x2="50" y2="80" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="62" y1="72" x2="62" y2="80" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="20" y1="38" x2="28" y2="38" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="20" y1="50" x2="28" y2="50" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="20" y1="62" x2="28" y2="62" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="72" y1="38" x2="80" y2="38" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="72" y1="50" x2="80" y2="50" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="72" y1="62" x2="80" y2="62" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );

    case 'adminhr':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <circle cx="36" cy="46" r="10" fill="url(#illPrimary)" />
          <path d="M22 72 C22 60 30 58 36 58 C42 58 50 60 50 72" fill="url(#illPrimary)" />
          <circle cx="62" cy="40" r="8" fill="url(#illGlass)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <path d="M50 64 C50 54 58 52 62 52 C66 52 74 54 74 64" fill="url(#illGlass)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" filter="url(#illGlow)" />
        </svg>
      );

    case 'adminorg':
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <rect x="40" y="18" width="20" height="14" rx="4" fill="url(#illPrimary)" />
          <rect x="22" y="48" width="20" height="14" rx="4" fill="url(#illGlass)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" filter="url(#illGlow)" />
          <rect x="58" y="48" width="20" height="14" rx="4" fill="url(#illGlass)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" filter="url(#illGlow)" />
          <line x1="50" y1="32" x2="50" y2="40" stroke="#ffffff" strokeWidth="2.5" />
          <line x1="32" y1="40" x2="68" y2="40" stroke="#ffffff" strokeWidth="2.5" />
          <line x1="32" y1="40" x2="32" y2="48" stroke="#ffffff" strokeWidth="2.5" />
          <line x1="68" y1="40" x2="68" y2="48" stroke="#ffffff" strokeWidth="2.5" />
        </svg>
      );

    case 'modulereload':
    default:
      return (
        <svg viewBox="0 0 100 100" className={containerClass}>
          {defs}
          <circle cx="50" cy="50" r="44" fill="url(#illGlass)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
          <path d="M30 50 A20 20 0 0 1 70 50" fill="none" stroke="url(#illPrimary)" strokeWidth="5" strokeLinecap="round" />
          <path d="M70 50 A20 20 0 0 1 30 50" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="5" strokeLinecap="round" filter="url(#illGlow)" />
          <path d="M64 44 L70 50 L76 44" fill="none" stroke="url(#illPrimary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M24 56 L30 50 L36 56" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function KgModuleHero({
  moduleId,
  title,
  description,
  eyebrow = "Phân hệ",
  features = []
}: {
  moduleId: string;
  title: string;
  description?: string;
  eyebrow?: string;
  features?: string[];
}) {
  return (
    <section className="relative overflow-hidden p-6 md:p-8 text-white rounded-3xl border border-white/10 shadow-hero bg-gradient-hero mb-6">
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3.5 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 bg-white/12 border border-white/20 px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase text-white shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            {eyebrow}
          </span>
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
            {title}
          </h1>
          {description && (
            <p className="text-sm md:text-base text-white/86 leading-relaxed font-medium max-w-lg">
              {description}
            </p>
          )}
          {features.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {features.map((feat, idx) => (
                <div key={idx} className="inline-flex items-center gap-1.5 bg-white/10 border border-white/10 px-3 py-1.5 rounded-xl text-xs font-bold text-white backdrop-blur-sm shadow-sm">
                  <span className="text-cyan-300">✦</span>
                  {feat}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center justify-center bg-white/5 border border-white/10 p-4 rounded-3xl backdrop-blur-md shadow-lg transform hover:rotate-2 transition-transform duration-300">
          <Kg3dIllustration moduleId={moduleId} />
        </div>
      </div>
      {/* Background Orbs */}
      <div className="absolute right-[-10%] top-[-20%] w-72 h-72 bg-white/10 rounded-full blur-3xl mix-blend-overlay pointer-events-none" />
      <div className="absolute left-[-5%] bottom-[-40%] w-60 h-60 bg-blue-500/20 rounded-full blur-2xl mix-blend-overlay pointer-events-none" />
    </section>
  );
}

