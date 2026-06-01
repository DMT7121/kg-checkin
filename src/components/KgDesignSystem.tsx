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
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E8DED1] dark:border-[#1E3F57] pb-4">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-[#062B49]/5 dark:bg-[#1E3F57]/40 flex items-center justify-center text-[#062B49] dark:text-[#E85D4A] flex-shrink-0">
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
      className={`bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-2xl p-4 md:p-5 transition-all duration-200 min-w-0 ${
        onClick ? 'cursor-pointer select-none active:scale-[0.99] touch-manipulation' : ''
      } ${
        hoverable || onClick ? 'hover:border-[#062B49] dark:hover:border-[#E85D4A] hover:shadow-sm' : ''
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
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl gap-2 min-h-[44px]',
    lg: 'px-6 py-3.5 text-base rounded-xl gap-2.5 min-h-[50px]'
  };

  const variantStyles = {
    primary: 'bg-[#062B49] hover:bg-[#0B3A5F] text-white border border-[#062B49] shadow-sm',
    secondary:
      'bg-white dark:bg-[#0E273C] text-[#172033] dark:text-[#F1F5F9] border border-[#E8DED1] dark:border-[#1E3F57] hover:bg-[#FBF7F0] dark:hover:bg-[#122F48]',
    danger:
      'bg-[#C94335] hover:bg-[#B33529] text-white border border-[#C94335] shadow-sm',
    warning:
      'bg-[#D8A23A] hover:bg-[#C28F2D] text-white border border-[#D8A23A] shadow-sm',
    ghost:
      'bg-transparent border-none text-[#6F7785] dark:text-[#A0ABC0] hover:bg-[#FBF7F0] dark:hover:bg-[#122F48] shadow-none'
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
    primary: 'bg-[#062B49] hover:bg-[#0B3A5F] text-white shadow-sm',
    secondary:
      'bg-white dark:bg-[#0E273C] text-[#172033] dark:text-[#F1F5F9] border border-[#E8DED1] dark:border-[#1E3F57] hover:bg-[#FBF7F0] dark:hover:bg-[#122F48]',
    danger:
      'bg-[#FFF0EE] dark:bg-[#C94335]/15 text-[#C94335] hover:bg-[#FFE0DC] border border-[#FFF0EE] dark:border-[#C94335]/30',
    ghost: 'bg-transparent text-[#6F7785] dark:text-[#A0ABC0] hover:bg-[#FBF7F0] dark:hover:bg-[#122F48]'
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
        <label className="block text-xs font-bold text-[#6F7785] dark:text-[#A0ABC0] uppercase tracking-wide pl-1">
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
          } text-sm bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl focus:border-[#062B49] dark:focus:border-[#E85D4A] focus:ring-2 focus:ring-[#062B49]/10 focus:outline-none transition-all placeholder-[#9AA1AA] text-[#172033] dark:text-white`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-[#C94335] dark:text-[#D8584B] font-semibold pl-1">{error}</p>}
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
        <label className="block text-xs font-bold text-[#6F7785] dark:text-[#A0ABC0] uppercase tracking-wide pl-1">
          {label}
        </label>
      )}
      <select
        className="w-full px-4 py-2.5 text-sm bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl focus:border-[#062B49] dark:focus:border-[#E85D4A] focus:ring-2 focus:ring-[#062B49]/10 focus:outline-none transition-all text-[#172033] dark:text-white"
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-[#C94335] dark:text-[#D8584B] font-semibold pl-1">{error}</p>}
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
        <label className="block text-xs font-bold text-[#6F7785] dark:text-[#A0ABC0] uppercase tracking-wide pl-1">
          {label}
        </label>
      )}
      <textarea
        className="w-full px-4 py-2.5 text-sm bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl focus:border-[#062B49] dark:focus:border-[#E85D4A] focus:ring-2 focus:ring-[#062B49]/10 focus:outline-none transition-all placeholder-[#9AA1AA] text-[#172033] dark:text-white min-h-[100px]"
        {...props}
      />
      {error && <p className="text-xs text-[#C94335] dark:text-[#D8584B] font-semibold pl-1">{error}</p>}
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
      'bg-[#EEF7F0] text-[#4F8A5B] border border-[#EEF7F0] dark:bg-[#5F9D6B]/15 dark:text-[#5F9D6B] dark:border-[#5F9D6B]/30',
    warning:
      'bg-[#FFF7E4] text-[#D8A23A] border border-[#FFF7E4] dark:bg-[#E2B24C]/15 dark:text-[#E2B24C] dark:border-[#E2B24C]/30',
    error:
      'bg-[#FFF0EE] text-[#C94335] border border-[#FFF0EE] dark:bg-[#D8584B]/15 dark:text-[#D8584B] dark:border-[#D8584B]/30',
    info:
      'bg-[#FFF0ED] text-[#E85D4A] border border-[#FFF0ED] dark:bg-[#E85D4A]/15 dark:text-[#E85D4A] dark:border-[#E85D4A]/30',
    neutral:
      'bg-[#FBF7F0] text-[#6F7785] border border-[#E8DED1] dark:bg-[#122F48] dark:text-[#A0ABC0] dark:border-[#1E3F57]'
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
    success: 'bg-[#EEF7F0] text-[#4F8A5B]',
    warning: 'bg-[#FFF7E4] text-[#D8A23A]',
    error: 'bg-[#FFF0EE] text-[#C94335]',
    info: 'bg-[#FFF0ED] text-[#E85D4A]'
  };

  return (
    <KgCard onClick={onClick} className={`flex items-center justify-between p-4 ${className}`}>
      <div className="space-y-1 min-w-0">
        <span className="text-[11px] text-[#6F7785] dark:text-[#A0ABC0] font-bold uppercase tracking-wider block truncate">
          {title}
        </span>
        <p className="text-xl md:text-2xl font-black text-[#172033] dark:text-white tracking-tight truncate">
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
      'bg-[#EEF7F0] border border-[#EEF7F0]/30 text-[#4F8A5B] dark:bg-[#5F9D6B]/15 dark:text-[#5F9D6B]',
    warning:
      'bg-[#FFF7E4] border border-[#FFF7E4]/30 text-[#D8A23A] dark:bg-[#E2B24C]/15 dark:text-[#E2B24C]',
    error:
      'bg-[#FFF0EE] border border-[#FFF0EE]/30 text-[#C94335] dark:bg-[#D8584B]/15 dark:text-[#D8584B]',
    info:
      'bg-[#FFF0ED] border border-[#FFF0ED]/30 text-[#E85D4A] dark:bg-[#E85D4A]/15 dark:text-[#E85D4A]'
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
    <div className="flex flex-col items-center justify-center text-center p-6 py-10 bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] border-dashed rounded-2xl">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-[#FBF7F0] dark:bg-[#122F48] flex items-center justify-center text-[#9AA1AA] dark:text-[#718096] mb-4">
          <Icon size={22} />
        </div>
      )}
      <h4 className="text-sm font-bold text-[#172033] dark:text-white">{title}</h4>
      <p className="text-xs text-[#6F7785] dark:text-[#A0ABC0] mt-1 max-w-[280px] leading-relaxed">
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
      <div className="bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] p-5 rounded-2xl flex items-center gap-4 max-w-xs shadow-2xl">
        <RefreshCw className="w-5 h-5 text-[#062B49] dark:text-[#E85D4A] animate-spin flex-shrink-0" />
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
    success: 'border-[#EEF7F0] bg-[#EEF7F0] text-[#4F8A5B] dark:bg-[#5F9D6B]/10 dark:text-[#5F9D6B]',
    error: 'border-[#FFF0EE] bg-[#FFF0EE] text-[#C94335] dark:bg-[#D8584B]/10 dark:text-[#D8584B]',
    warning: 'border-[#FFF7E4] bg-[#FFF7E4] text-[#D8A23A] dark:bg-[#E2B24C]/10 dark:text-[#E2B24C]',
    info: 'border-[#FFF0ED] bg-[#FFF0ED] text-[#E85D4A] dark:bg-[#E85D4A]/10 dark:text-[#E85D4A]'
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
            <div className="w-11 h-11 rounded-xl bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] flex items-center justify-center shadow-sm text-[#062B49] dark:text-[#E85D4A]">
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
