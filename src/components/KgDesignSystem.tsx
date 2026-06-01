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
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 pl-1">
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
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center text-teal-650 dark:text-teal-400 flex-shrink-0">
            <Icon size={20} />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white leading-tight truncate">
            {title}
          </h2>
          {description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[280px] sm:max-w-md">
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
  hoverable = false
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`soft3d-card p-4 md:p-5 ${
        onClick ? 'cursor-pointer select-none active:scale-[0.99] touch-manipulation' : ''
      } ${
        hoverable || onClick ? 'hover:border-teal-500/40 dark:hover:border-teal-500/40 hover:shadow-md' : ''
      } transition-all duration-200 min-w-0 ${className}`}
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
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl gap-2 min-h-[44px]',
    lg: 'px-6 py-3.5 text-base rounded-xl gap-2.5 min-h-[50px]'
  };

  const variantStyles = {
    primary: 'soft3d-btn-primary',
    secondary:
      'soft3d-btn text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80',
    danger:
      'bg-gradient-to-br from-red-500 to-red-650 text-white border border-red-600/20 shadow-md hover:shadow-red-500/20',
    warning:
      'bg-gradient-to-br from-amber-500 to-amber-600 text-white border border-amber-600/20 shadow-md hover:shadow-amber-500/20',
    ghost:
      'bg-transparent border-none text-slate-650 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-none'
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
    primary: 'bg-teal-600 text-white hover:bg-teal-700 shadow-md',
    secondary:
      'bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-105/10 dark:hover:bg-slate-700',
    danger:
      'bg-red-50 dark:bg-red-950/40 text-red-650 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-900/30',
    ghost: 'bg-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
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
        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide pl-1">
          {label}
        </label>
      )}
      <div className="relative w-full">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <Icon size={16} />
          </div>
        )}
        <input
          className={`w-full px-4 py-2.5 ${
            Icon ? 'pl-11' : ''
          } text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 dark:focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 focus:outline-none transition-all placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400 font-semibold pl-1">{error}</p>}
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
        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide pl-1">
          {label}
        </label>
      )}
      <select
        className="w-full px-4 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 dark:focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 focus:outline-none transition-all text-slate-900 dark:text-white"
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-500 dark:text-red-400 font-semibold pl-1">{error}</p>}
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
        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide pl-1">
          {label}
        </label>
      )}
      <textarea
        className="w-full px-4 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 dark:focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 focus:outline-none transition-all placeholder-slate-400 dark:placeholder-slate-500 text-slate-900 dark:text-white min-h-[100px]"
        {...props}
      />
      {error && <p className="text-xs text-red-500 dark:text-red-400 font-semibold pl-1">{error}</p>}
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
      'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30',
    warning:
      'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30',
    error:
      'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30',
    info:
      'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30',
    neutral:
      'bg-slate-50 text-slate-650 border border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-800'
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
    success: 'bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-405',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-405',
    error: 'bg-red-50 text-red-650 dark:bg-red-950/40 dark:text-red-405',
    info: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-405'
  };

  return (
    <KgCard onClick={onClick} className={`flex items-center justify-between p-4 ${className}`}>
      <div className="space-y-1 min-w-0">
        <span className="text-[11px] text-slate-500 dark:text-slate-450 font-bold uppercase tracking-wider block truncate">
          {title}
        </span>
        <p className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
          {value}
        </p>
        {subtext && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold truncate">
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
      'bg-green-50 border border-green-200 dark:bg-green-950/15 dark:border-green-900/40 text-green-800 dark:text-green-300',
    warning:
      'bg-amber-50 border border-amber-200 dark:bg-amber-950/15 dark:border-amber-900/40 text-amber-800 dark:text-amber-300',
    error:
      'bg-red-50 border border-red-200 dark:bg-red-950/15 dark:border-red-900/40 text-red-800 dark:text-red-300',
    info:
      'bg-blue-50 border border-blue-200 dark:bg-blue-950/15 dark:border-blue-900/40 text-blue-800 dark:text-blue-300'
  };

  const icons = {
    success: CheckCircle2,
    warning: AlertTriangle,
    error: AlertCircle,
    info: Info
  };

  const DisplayIcon = Icon || icons[variant];

  return (
    <div className={`p-4 rounded-xl flex gap-3 ${styles[variant]} ${className} min-w-0`}>
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
  return <div className={`animate-pulse bg-slate-200 dark:bg-slate-800 rounded-lg ${className}`} />;
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
    <div className="flex flex-col items-center justify-center text-center p-6 py-10 soft3d-card border-dashed">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800/80 flex items-center justify-center text-slate-400 dark:text-slate-650 mb-4">
          <Icon size={22} />
        </div>
      )}
      <h4 className="text-sm font-bold text-slate-905 dark:text-white">{title}</h4>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[280px] leading-relaxed">
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
      <div className="soft3d-card p-5 flex items-center gap-4 max-w-xs shadow-2xl">
        <RefreshCw className="w-5 h-5 text-teal-650 animate-spin flex-shrink-0" />
        <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
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
    success: 'border-green-500/30 bg-green-50 dark:bg-green-950/90 text-green-800 dark:text-green-300',
    error: 'border-red-500/30 bg-red-50 dark:bg-red-950/90 text-red-850 dark:text-red-300',
    warning: 'border-amber-500/30 bg-amber-50 dark:bg-amber-950/90 text-amber-850 dark:text-amber-300',
    info: 'border-blue-500/30 bg-blue-50 dark:bg-blue-950/90 text-blue-800 dark:text-blue-300'
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
            className="fixed left-0 right-0 bottom-0 max-h-[85vh] bg-white dark:bg-slate-950 z-[999] rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col pointer-events-auto overflow-hidden pb-safe-bottom"
          >
            {/* Handle bar */}
            <div className="w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto my-3 flex-shrink-0" />
            
            {/* Header */}
            <div className="px-5 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-850 dark:text-white">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
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
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
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
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-450 select-none">
      {isOnline ? (
        <Wifi size={13} className="text-green-500" />
      ) : (
        <WifiOff size={13} className="text-red-500 animate-pulse" />
      )}
      <span className="truncate">
        {pendingCount > 0 ? (
          <span className="text-amber-500">Chờ đồng bộ ({pendingCount})</span>
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
          className="ml-1 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
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
    <div className="flex flex-col items-center justify-center text-center p-6 py-12 soft3d-card border-red-200 dark:border-red-950 bg-red-50/10 dark:bg-red-950/5">
      <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center text-red-500 dark:text-red-400 mb-4 shadow-sm">
        <AlertCircle size={22} />
      </div>
      <h4 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h4>
      <p className="text-xs text-slate-550 dark:text-slate-400 mt-1 max-w-[280px] leading-relaxed">
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
            className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900/60 active:scale-95 transition-all text-slate-650 dark:text-slate-300 gap-1.5"
          >
            <div className={`w-11 h-11 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center shadow-sm text-slate-555 dark:text-slate-350 ${act.color || ''}`}>
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
