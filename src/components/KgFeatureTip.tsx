import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, ChevronRight, HelpCircle } from 'lucide-react';

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
  align = 'center',
  className = '',
}: KgFeatureTipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Clean triggerText to remove duplicate lightbulb emoji if passed
  const cleanTriggerText = triggerText ? triggerText.replace(/^💡\s*/, '').trim() : '';

  // Trigger styles based on variant
  const getTriggerClass = () => {
    if (variant === 'hero') {
      return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white border border-white/30 text-xs font-bold transition-all active:scale-95 shadow-xs backdrop-blur-md cursor-pointer select-none';
    }
    if (variant === 'badge') {
      return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/25 text-xs font-bold transition-all active:scale-95 shadow-xs cursor-pointer select-none';
    }
    if (variant === 'subtle') {
      return 'inline-flex items-center justify-center w-6 h-6 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition-all active:scale-95 cursor-pointer select-none';
    }
    // Default 'icon' with triggerText -> render as pill
    if (cleanTriggerText) {
      return 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-bold transition-all duration-200 active:scale-95 hover:scale-105 shadow-xs cursor-pointer select-none';
    }
    // Default 'icon' without triggerText -> circular
    const sizeClasses = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-7 h-7 text-sm';
    return `inline-flex items-center justify-center ${sizeClasses} rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-all duration-200 active:scale-90 hover:scale-105 shadow-xs cursor-pointer select-none`;
  };

  return (
    <div ref={containerRef} className={`inline-flex items-center align-middle ${className}`}>
      {/* Trigger Button */}
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
        <span className="leading-none text-[13px]" role="img" aria-label="lightbulb">
          💡
        </span>
        {cleanTriggerText && (
          <span className="leading-none font-bold text-[11px] tracking-tight whitespace-nowrap">
            {cleanTriggerText}
          </span>
        )}
      </button>

      {/* Responsive Overlay / Modal Sheet rendered into document.body */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6">
                {/* Backdrop */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsOpen(false)}
                  className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity"
                />

                {/* Modal Card Centered on All Screens */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: 16 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                  className="relative w-full max-w-md bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col z-10 my-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center flex-shrink-0 text-base shadow-xs">
                        💡
                      </div>
                      <h3 className="text-sm md:text-base font-extrabold text-[var(--kg-text)] truncate">
                        {title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="w-8 h-8 rounded-full bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] active:scale-90 transition-all cursor-pointer"
                      aria-label="Đóng"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Scrollable Body */}
                  <div className="p-5 overflow-y-auto space-y-4 text-xs md:text-sm text-[var(--kg-text)] leading-relaxed bg-[var(--kg-surface)]">
                    {content && (
                      <div className="text-[var(--kg-text)] font-medium">
                        {content}
                      </div>
                    )}

                    {tips && tips.length > 0 && (
                      <div className="space-y-2.5 pt-1">
                        {tips.map((tip, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-semibold"
                          >
                            <CheckCircle2
                              size={16}
                              className="text-[var(--kg-accent)] flex-shrink-0 mt-0.5"
                            />
                            <span className="text-[var(--kg-text)] leading-relaxed">{tip}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer with "Đã hiểu" button */}
                  <div className="px-5 py-3 border-t border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--kg-primary)] text-white font-extrabold text-xs md:text-sm active:scale-95 transition-all shadow-md hover:brightness-105 cursor-pointer"
                    >
                      Đã hiểu & Đóng
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
