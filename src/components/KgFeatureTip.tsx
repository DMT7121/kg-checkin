import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, Lightbulb } from 'lucide-react';

export interface KgFeatureTipProps {
  title?: string;
  content?: React.ReactNode;
  tips?: string[];
  triggerText?: string;
  variant?: 'icon' | 'badge' | 'hero' | 'subtle';
  size?: 'sm' | 'md';
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export function KgFeatureTip({
  title = 'Hướng dẫn & Lưu ý',
  content,
  tips,
  triggerText,
  variant = 'icon',
  size = 'md',
  className = '',
}: KgFeatureTipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const cleanTriggerText = triggerText ? triggerText.replace(/^[^a-zA-Z0-9À-ỹ]+\s*/, '').trim() : '';

  const getTriggerClass = () => {
    if (variant === 'hero' || variant === 'badge') {
      return 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)]/40 text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] border border-[var(--kg-border)] text-xs font-medium transition-colors cursor-pointer select-none min-h-[34px]';
    }
    if (variant === 'subtle') {
      return 'inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--kg-text-muted)] hover:text-[var(--kg-primary)] hover:bg-[var(--kg-surface-soft)] transition-colors cursor-pointer select-none';
    }
    if (cleanTriggerText) {
      return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/25 text-xs font-semibold transition-colors cursor-pointer select-none';
    }
    const sizeClasses = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7';
    return `inline-flex items-center justify-center ${sizeClasses} rounded-full bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/25 transition-colors cursor-pointer select-none`;
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
        title={title}
      >
        <Lightbulb size={14} strokeWidth={1.85} className="text-[var(--kg-warning)] flex-shrink-0" />
        {cleanTriggerText && (
          <span className="leading-none font-medium text-xs whitespace-nowrap">
            {cleanTriggerText}
          </span>
        )}
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setIsOpen(false)}
                  className="fixed inset-0 bg-black/55 backdrop-blur-sm"
                />

                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-label={title}
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 12 }}
                  transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                  className="relative w-full max-w-md bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col z-10 my-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-[var(--kg-warning)] flex items-center justify-center flex-shrink-0">
                        <Lightbulb size={16} strokeWidth={1.85} />
                      </div>
                      <h3 className="text-sm font-semibold text-[var(--kg-text)] truncate">
                        {title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="w-8 h-8 rounded-lg bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors cursor-pointer"
                      aria-label="Đóng"
                    >
                      <X size={15} />
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
                      className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
                    >
                      Đã hiểu
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}

export default KgFeatureTip;
