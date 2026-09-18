import React from 'react';
import { CalendarClock, AlertTriangle, Clock, ChevronRight, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScheduleRegistrationWindowStatus } from '../utils/helpers';

interface MandatoryScheduleModalProps {
  isOpen: boolean;
  onGoToSchedule: () => void;
  windowStatus: ScheduleRegistrationWindowStatus;
  employeeName?: string;
}

export default function MandatoryScheduleModal({
  isOpen,
  onGoToSchedule,
  windowStatus,
  employeeName
}: MandatoryScheduleModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-md bg-[var(--kg-surface)] text-[var(--kg-text)] rounded-3xl shadow-2xl border-2 border-amber-500/40 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Banner Gradient */}
          <div className="h-3 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" />

          <div className="p-5 sm:p-6 space-y-4">
            {/* Header with Icon and Badges */}
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 relative shadow-inner">
                <CalendarClock size={26} />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 mb-1">
                  <AlertTriangle size={11} /> Bắt buộc hoàn tất
                </div>
                <h3 className="text-base sm:text-lg font-black text-[var(--kg-text)] leading-tight">
                  Đăng ký ca làm tuần tiếp theo
                </h3>
                {employeeName && (
                  <p className="text-xs text-[var(--kg-text-muted)] mt-0.5 font-medium">
                    Nhân viên: <span className="font-bold text-[var(--kg-text)]">{employeeName}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Content description */}
            <div className="space-y-2.5 text-xs text-[var(--kg-text-muted)] leading-relaxed">
              <p className="font-medium text-[var(--kg-text)]">
                Theo quy định nhà hàng King's Grill, vào mỗi <b className="text-amber-600 dark:text-amber-400">Thứ 5, Thứ 6</b> và trước <b className="text-rose-600 dark:text-rose-400 font-black">17:00 Thứ Bảy</b> hàng tuần, toàn bộ nhân sự bắt buộc phải hoàn thành đăng ký ca làm việc cho tuần sau.
              </p>

              {/* Requirement Box */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-2">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-extrabold text-[11px] uppercase tracking-wider">
                  <Clock size={13} /> {windowStatus.message}
                </div>
                <ul className="space-y-1.5 text-[11px] text-[var(--kg-text)] font-medium pl-1">
                  <li className="flex items-start gap-1.5">
                    <span className="text-amber-500 font-bold">•</span>
                    <span>Bắt buộc đăng ký <b>đầy đủ ca ở tất cả các ngày</b> trong tuần tới.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-amber-500 font-bold">•</span>
                    <span>Nếu xin nghỉ (OFF) vào <b>Thứ 6, Thứ 7, Chủ Nhật</b> hoặc <b>ngày Lễ/Tết</b>, bắt buộc nhập lý do xin phép.</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="text-rose-500 font-bold">•</span>
                    <span className="text-rose-600 dark:text-rose-400 font-bold">Lịch sẽ khóa lúc 17:00 Thứ Bảy. Qua giờ này hệ thống đóng hoàn toàn.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Action Button - Uncloseable Single CTA */}
            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                onClick={onGoToSchedule}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm tracking-wide shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.98] touch-manipulation flex items-center justify-center gap-2 animate-pulse"
              >
                <span>ĐĂNG KÝ CA NGAY</span>
                <ChevronRight size={18} />
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10.5px] text-[var(--kg-text-muted)] font-medium text-center">
                <Lock size={12} className="text-amber-500 flex-shrink-0" />
                <span>Modal sẽ tự động tắt sau khi bạn hoàn tất và lưu ca làm tuần mới.</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
