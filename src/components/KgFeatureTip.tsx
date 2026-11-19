import React, { useState, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle2, Lightbulb, HelpCircle } from 'lucide-react';
import { useDialogA11y } from '../utils/modalQueue';

export interface KgFeatureTipProps {
  title?: string;
  content?: React.ReactNode;
  tips?: string[];
  triggerText?: string;
  variant?: 'icon' | 'badge' | 'hero' | 'subtle';
  size?: 'sm' | 'md';
  align?: 'left' | 'right' | 'center';
  iconType?: 'lightbulb' | 'help';
  className?: string;
}

export function KgFeatureTip({
  title = 'Hướng dẫn & Lưu ý',
  content,
  tips,
  triggerText,
  variant = 'icon',
  iconType = 'lightbulb',
  className = '',
}: KgFeatureTipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useDialogA11y({
    isOpen,
    containerRef: dialogRef,
    onClose: () => setIsOpen(false),
    closeOnEscape: true,
  });

  const cleanTriggerText = triggerText ? triggerText.replace(/^[^a-zA-Z0-9À-ỹ]+\s*/, '').trim() : '';
  const TriggerIcon = iconType === 'help' ? HelpCircle : Lightbulb;

  const getTriggerClass = () => {
    if (variant === 'hero' || variant === 'badge') {
      return 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)]/40 text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] border border-[var(--kg-border)] text-xs font-medium transition-colors cursor-pointer select-none min-h-[44px] sm:min-h-[36px] touch-manipulation';
    }
    if (variant === 'subtle') {
      return 'inline-flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl text-[var(--kg-text-muted)] hover:text-[var(--kg-primary-ink)] hover:bg-[var(--kg-surface-soft)] border border-transparent hover:border-[var(--kg-border)] transition-colors cursor-pointer select-none touch-manipulation';
    }
    if (cleanTriggerText) {
      return 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/25 text-xs font-semibold transition-colors cursor-pointer select-none min-h-[44px] sm:min-h-[36px] touch-manipulation';
    }
    return 'inline-flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/25 transition-colors cursor-pointer select-none touch-manipulation';
  };

  return (
    <div ref={containerRef} className={`inline-flex items-center align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={getTriggerClass()}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title={title}
      >
        <TriggerIcon
          size={iconType === 'help' ? 16 : 14}
          strokeWidth={1.85}
          className={iconType === 'help' ? 'text-[var(--kg-text-muted)] flex-shrink-0' : 'text-[var(--kg-warning)] flex-shrink-0'}
        />
        {cleanTriggerText && (
          <span className="leading-none font-medium text-xs whitespace-nowrap">
            {cleanTriggerText}
          </span>
        )}
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[10055] flex items-center justify-center p-4 sm:p-6">
            <div
              onClick={() => setIsOpen(false)}
              className="kg-fade-in fixed inset-0 bg-black/55 backdrop-blur-sm"
            />

            <div
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="kg-scale-in relative w-full max-w-md bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-2xl overflow-hidden max-h-[85dvh] flex flex-col z-10 my-auto focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-[var(--kg-warning)] flex items-center justify-center flex-shrink-0">
                    <Lightbulb size={16} strokeWidth={1.85} />
                  </div>
                  <h3 id={titleId} className="text-sm font-semibold text-[var(--kg-text)] truncate">
                    {title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-11 h-11 sm:w-9 sm:h-9 min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors cursor-pointer touch-manipulation"
                  aria-label="Đóng"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 text-xs sm:text-sm text-[var(--kg-text)] leading-relaxed bg-[var(--kg-surface)]">
                {content && (
                  <div className="text-[var(--kg-text-muted)]">
                    {content}
                  </div>
                )}

                {tips && tips.length > 0 && (
                  <div className="space-y-2 pt-0.5">
                    {tips.map((tip, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-medium"
                      >
                        <CheckCircle2
                          size={15}
                          strokeWidth={1.85}
                          className="text-[var(--kg-success)] flex-shrink-0 mt-0.5"
                        />
                        <span className="text-[var(--kg-text)] leading-relaxed">{tip}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 sm:px-5 py-3 border-t border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer touch-manipulation"
                >
                  Đã hiểu
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default KgFeatureTip;
