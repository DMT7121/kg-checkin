import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  useFeedbackStore,
  type FeedbackToastItem,
  type FeedbackTone,
} from '../store/useFeedbackStore';
import { useDialogA11y } from '../utils/modalQueue';
import { KgButton } from './KgDesignSystem';

const TONE_ICON_MAP: Record<FeedbackTone, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_BORDER_MAP: Record<FeedbackTone, string> = {
  success: 'border-[var(--kg-border-strong)]',
  error: 'border-[var(--kg-danger)]/50',
  warning: 'border-[var(--kg-warning)]/50',
  info: 'border-[var(--kg-rail-border)]',
};

const TOAST_ICON_COLOR_MAP: Record<FeedbackTone, string> = {
  success: 'text-[#7EDBA8]',
  error: 'text-[#FF968E]',
  warning: 'text-[#FFD285]',
  info: 'text-[#F59B62]',
};

function FeedbackToastCard({
  toast,
  onClose,
}: {
  toast: FeedbackToastItem;
  onClose: (id: string) => void;
}) {
  useEffect(() => {
    if (toast.durationMs <= 0) return;
    const timer = window.setTimeout(() => onClose(toast.id), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.durationMs, onClose]);

  const Icon = TONE_ICON_MAP[toast.tone] || Info;

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`kg-toast-in flex items-start gap-2.5 p-3.5 rounded-xl border bg-[var(--kg-rail-bg)] text-[var(--kg-rail-text)] shadow-lg max-w-sm w-full pointer-events-auto ${TOAST_BORDER_MAP[toast.tone]}`}
    >
      <Icon
        size={18}
        strokeWidth={1.85}
        className={`flex-shrink-0 mt-0.5 ${TOAST_ICON_COLOR_MAP[toast.tone]}`}
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        {toast.title && (
          <p className="text-xs font-bold leading-snug text-white">
            {toast.title}
          </p>
        )}
        <p className="text-xs font-medium leading-relaxed text-[var(--kg-rail-muted)] break-words">
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        aria-label="Đóng thông báo"
        className="w-10 h-10 sm:w-8 sm:h-8 -mr-1.5 -mt-1 rounded-lg text-[var(--kg-rail-muted)] hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center flex-shrink-0 touch-manipulation"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export default function KgFeedbackHost() {
  const toasts = useFeedbackStore((s) => s.toasts);
  const dismissToast = useFeedbackStore((s) => s.dismissToast);
  const activeDialog = useFeedbackStore((s) => s.activeDialog);
  const resolveActiveDialog = useFeedbackStore((s) => s.resolveActiveDialog);
  const loadingMessage = useFeedbackStore((s) => s.loadingMessage);

  const dialogRef = useRef<HTMLDivElement | null>(null);

  useDialogA11y({
    isOpen: Boolean(activeDialog),
    containerRef: dialogRef,
    onClose: () => resolveActiveDialog(false),
    closeOnEscape: true,
  });

  if (typeof document === 'undefined') return null;

  const dialogToneBadgeStyle = (() => {
    if (!activeDialog) return '';
    switch (activeDialog.tone) {
      case 'danger':
      case 'error':
        return 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border-[var(--kg-danger)]/25';
      case 'warning':
        return 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-[var(--kg-warning)]/25';
      case 'success':
        return 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/25';
      default:
        return 'bg-[var(--kg-info-soft)] text-[var(--kg-info)] border-[var(--kg-info)]/25';
    }
  })();

  const DialogIcon = (() => {
    if (!activeDialog) return Info;
    switch (activeDialog.tone) {
      case 'danger':
      case 'error':
        return AlertCircle;
      case 'warning':
        return AlertTriangle;
      case 'success':
        return CheckCircle2;
      default:
        return Info;
    }
  })();

  const confirmVariant: 'primary' | 'danger' | 'warning' =
    activeDialog?.tone === 'danger' || activeDialog?.tone === 'error'
      ? 'danger'
      : activeDialog?.tone === 'warning'
        ? 'warning'
        : 'primary';

  return createPortal(
    <>
      {/* 1. Global Toast Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-atomic="false"
          className="fixed bottom-24 md:bottom-6 right-3 sm:right-5 z-[10150] flex flex-col gap-2 items-end pointer-events-none max-w-[calc(100vw-1.5rem)]"
        >
          {toasts.map((toast) => (
            <FeedbackToastCard key={toast.id} toast={toast} onClose={dismissToast} />
          ))}
        </div>
      )}

      {/* 2. Global Confirm / Alert Sheet */}
      {activeDialog && (
        <div className="fixed inset-0 z-[10180] flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6">
          <div
            onClick={() => resolveActiveDialog(false)}
            className="kg-fade-in fixed inset-0 bg-black/60 pointer-events-auto"
          />
          <div
            ref={dialogRef}
            tabIndex={-1}
            role={activeDialog.kind === 'alert' ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby="kg-feedback-dialog-title"
            onClick={(e) => e.stopPropagation()}
            className="kg-sheet-up sm:kg-scale-in relative z-10 w-full max-w-md max-h-[90dvh] sm:max-h-[85dvh] mx-auto bg-[var(--kg-surface)] text-[var(--kg-text)] rounded-t-[22px] sm:rounded-[20px] border border-[var(--kg-border)] shadow-2xl flex flex-col pointer-events-auto overflow-hidden focus:outline-none"
          >
            <div className="px-4 sm:px-5 py-3.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-2)] flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div
                  className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 ${dialogToneBadgeStyle}`}
                >
                  <DialogIcon size={16} strokeWidth={1.85} />
                </div>
                <h3
                  id="kg-feedback-dialog-title"
                  className="text-sm font-extrabold tracking-tight text-[var(--kg-text)] leading-snug break-words"
                >
                  {activeDialog.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => resolveActiveDialog(false)}
                aria-label="Đóng hộp thoại"
                className="w-11 h-11 sm:w-9 sm:h-9 rounded-[11px] bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:border-[var(--kg-border-strong)] active:scale-95 transition-colors flex-shrink-0 touch-manipulation"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 min-h-0">
              {activeDialog.message && (
                <p className="text-sm text-[var(--kg-text-muted)] leading-relaxed whitespace-pre-line break-words">
                  {activeDialog.message}
                </p>
              )}
            </div>

            <div className="px-4 sm:px-5 py-3 pb-safe sm:pb-3 border-t border-[var(--kg-border)] bg-[var(--kg-surface-2)] flex gap-2.5 flex-shrink-0">
              {activeDialog.kind === 'confirm' && (
                <KgButton
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => resolveActiveDialog(false)}
                >
                  {activeDialog.cancelLabel || 'Hủy'}
                </KgButton>
              )}
              <KgButton
                variant={confirmVariant}
                size="md"
                className="flex-1"
                onClick={() => resolveActiveDialog(true)}
              >
                {activeDialog.confirmLabel}
              </KgButton>
            </div>
          </div>
        </div>
      )}

      {/* 3. Global Loading Overlay */}
      {loadingMessage && (
        <div
          role="status"
          aria-live="polite"
          className="kg-fade-in fixed inset-0 bg-black/60 z-[10210] flex items-center justify-center p-4"
        >
          <div className="kg-scale-in bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl flex items-center gap-3.5 max-w-xs w-full mx-auto shadow-xl">
            <RefreshCw className="w-5 h-5 text-[var(--kg-primary)] animate-spin flex-shrink-0" />
            <span className="text-sm font-semibold text-[var(--kg-text)] leading-snug">
              {loadingMessage}
            </span>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
