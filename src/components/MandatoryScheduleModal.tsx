import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, AlertTriangle, Clock, ChevronRight, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { type ScheduleRegistrationWindowStatus } from '../utils/helpers';
import { useDialogA11y, useModalQueue } from '../utils/modalQueue';

interface MandatoryScheduleModalProps {
  isOpen: boolean;
  onGoToSchedule: () => void;
  windowStatus: ScheduleRegistrationWindowStatus;
  employeeName?: string;
  targetWeekDisplay?: string;
}

export default function MandatoryScheduleModal({
  isOpen,
  onGoToSchedule,
  windowStatus,
  employeeName,
  targetWeekDisplay
}: MandatoryScheduleModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const activeInQueue = useModalQueue('mandatory_schedule', isOpen);

  useDialogA11y({
    isOpen: activeInQueue,
    containerRef: dialogRef,
    closeOnEscape: false,
  });

  if (!activeInQueue || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[10080] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="kg-mandatory-schedule-title"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-md max-h-[88dvh] sm:max-h-[90vh] mx-auto bg-[var(--kg-surface)] text-[var(--kg-text)] rounded-2xl sm:rounded-3xl shadow-2xl border-2 border-[var(--kg-warning)]/45 flex flex-col overflow-hidden focus:outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Accent Bar */}
          <div className="h-2 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 flex-shrink-0" />

          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto min-h-0">
            {/* Header with Icon and Badges */}
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] flex items-center justify-center flex-shrink-0 relative">
                <CalendarClock size={26} />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--kg-danger)] opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--kg-danger)]" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/25 mb-1">
                  <AlertTriangle size={11} /> Bắt buộc trước khi chấm công
                </div>
                <h3
                  id="kg-mandatory-schedule-title"
                  className="text-base sm:text-lg font-black text-[var(--kg-text)] leading-tight"
                >
                  Đăng ký lịch làm tuần {targetWeekDisplay || 'tiếp theo'}
                </h3>
                {employeeName && (
                  <p className="text-xs text-[var(--kg-text-muted)] mt-0.5 font-medium">
                    Nhân sự: <span className="font-bold text-[var(--kg-text)]">{employeeName}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Content description */}
            <div className="space-y-2.5 text-xs text-[var(--kg-text-muted)] leading-relaxed">
              <p className="font-medium text-[var(--kg-text)]">
                Từ <b className="text-[var(--kg-warning)]">Thứ 5</b> đến trước <b className="text-[var(--kg-danger)] font-black font-mono tabular-nums">17:00 Thứ Bảy</b> hàng tuần, <b className="text-[var(--kg-text)]">100% nhân sự đi làm</b> bắt buộc hoàn thành đăng ký ca tuần tới trước khi chấm công Vào/Ra ca.
              </p>

              {/* Requirement Box */}
              <div className="p-3.5 rounded-2xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-xs space-y-2">
                <div className="flex items-center gap-2 text-[var(--kg-warning)] font-extrabold text-[11px] uppercase tracking-wider">
                  <Clock size={13} /> {windowStatus.message}
                </div>
                <ul className="space-y-1.5 text-[11px] text-[var(--kg-text)] font-medium pl-1">
                  <li className="flex items-start gap-1.5">
                    <span className="text-[var(--kg-warning)] font-bold">•</span>
                    <span>Chọn đầy đủ ca làm (hoặc <b>OFF</b> kèm lý do nếu xin nghỉ cả tuần/cuối tuần) cho đủ <b>7 ngày</b> tuần tới.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-[var(--kg-warning)] font-bold">•</span>
                    <span>Chức năng Chấm công chỉ mở sau khi lịch tuần <b className="font-mono tabular-nums">{targetWeekDisplay || ''}</b> đã được gửi lên hệ thống.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-[var(--kg-success)] font-bold">•</span>
                    <span className="text-[var(--kg-success)] font-semibold">Chỉ cần gửi 1 lần: Hệ thống tự động ghi nhớ và không hiển thị lại trong suốt tuần này.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Single Mandatory CTA — No Snooze Loophole */}
            <div className="pt-1 space-y-2.5">
              <button
                type="button"
                onClick={onGoToSchedule}
                className="w-full py-3.5 px-5 rounded-2xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-black text-sm tracking-wide shadow-md transition-colors duration-150 active:scale-[0.98] touch-manipulation flex items-center justify-center gap-2 min-h-[48px]"
              >
                <span>ĐĂNG KÝ LỊCH LÀM TUẦN {targetWeekDisplay || 'TỚI'} NGAY</span>
                <ChevronRight size={18} />
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10.5px] text-[var(--kg-text-muted)] font-medium text-center">
                <ShieldCheck size={13} className="text-[var(--kg-success)] flex-shrink-0" />
                <span>Lịch đăng ký được đồng bộ trực tiếp vào Google Sheets &amp; mở khóa chấm công tức thì.</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
