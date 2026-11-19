import { createPortal } from 'react-dom';

export function KgLoadingOverlay({ text = 'Đang xử lý...' }: { text?: string }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 bg-black/55 backdrop-blur-sm z-[10200] flex items-center justify-center p-4"
    >
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-xl flex items-center gap-3.5 max-w-xs w-full mx-auto shadow-xl">
        <span
          aria-hidden="true"
          className="w-5 h-5 rounded-full border-2 border-[var(--kg-primary)]/25 border-t-[var(--kg-primary)] animate-spin flex-shrink-0"
        />
        <span className="text-sm font-semibold text-[var(--kg-text)] leading-snug">
          {text}
        </span>
      </div>
    </div>,
    document.body
  );
}

export default KgLoadingOverlay;
