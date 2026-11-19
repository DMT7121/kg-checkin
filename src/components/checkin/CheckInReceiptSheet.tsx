import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudUpload,
  Info,
  PartyPopper,
  Radio,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { KgBottomSheet, KgButton } from '../KgDesignSystem';
import { formatUnifiedPunchLabel, isCheckInLabel } from '../../utils/attendanceSequence';
import { getPreviewShiftClass } from '../../utils/helpers';

export interface SubmittedPunchReceipt {
  type: 'Vào ca' | 'Ra ca' | string;
  fullname: string;
  time: string;
  location: string;
  distMeters: string;
  isValid: boolean;
  shift: string;
  email: string;
  sheetSaved?: boolean;
  edgeBuffered?: boolean;
  supplementSubmittedText?: string;
  lateMins?: number;
  penaltyAmount?: number;
  checklistPending?: boolean;
}

export interface CheckInReceiptSheetProps {
  isOpen: boolean;
  onClose: () => void;
  feedbackType: 'success' | 'warning' | 'info';
  feedbackTitle: string;
  feedbackMessage: string;
  lastSubmittedPunch: SubmittedPunchReceipt | null;
  isWithinRadius: boolean;
  onCompleteSuccess: () => void;
  onPrecisionRescan: () => void;
  onOpenMissedModal: () => void;
}

export default function CheckInReceiptSheet({
  isOpen,
  onClose,
  feedbackType,
  feedbackTitle,
  feedbackMessage,
  lastSubmittedPunch,
  isWithinRadius,
  onCompleteSuccess,
  onPrecisionRescan,
  onOpenMissedModal,
}: CheckInReceiptSheetProps) {
  return (
    <KgBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={
        feedbackType === 'success'
          ? isCheckInLabel(lastSubmittedPunch?.type || '')
            ? 'Bắt đầu ca làm việc'
            : 'Hoàn thành ca làm việc'
          : 'Thông báo'
      }
    >
      {feedbackType === 'success' && lastSubmittedPunch ? (
        <div className="space-y-4 py-2">
          {/* Operational Receipt Header */}
          <div className="text-center">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xs ${
                isCheckInLabel(lastSubmittedPunch.type)
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[var(--kg-primary)] text-white'
              }`}
            >
              {isCheckInLabel(lastSubmittedPunch.type) ? (
                <Sparkles size={28} />
              ) : (
                <PartyPopper size={28} />
              )}
            </div>

            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                isCheckInLabel(lastSubmittedPunch.type)
                  ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border border-[var(--kg-success)]/25'
                  : 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary)] border border-[var(--kg-primary)]/20'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isCheckInLabel(lastSubmittedPunch.type) ? 'bg-emerald-500' : 'bg-[var(--kg-primary)]'
                }`}
              />
              {`${formatUnifiedPunchLabel(lastSubmittedPunch.type).toUpperCase()} THÀNH CÔNG`}
            </span>

            <h3 className="mt-2 text-lg sm:text-xl font-bold text-[var(--kg-text)] tracking-tight">
              {`Điểm danh ${formatUnifiedPunchLabel(lastSubmittedPunch.type)} thành công`}
            </h3>

            <p className="mt-1 text-xs text-[var(--kg-text-muted)] max-w-xs mx-auto leading-relaxed">
              {isCheckInLabel(lastSubmittedPunch.type)
                ? 'Chúc bạn một ca làm việc tràn đầy năng lượng và phục vụ khách hàng chu đáo!'
                : 'Cảm ơn bạn đã hoàn thành ca trực hôm nay. Hãy nghỉ ngơi thật tốt nhé!'}
            </p>
          </div>

          {/* Synchronized Detail Metrics Card */}
          <div className="bg-[var(--kg-surface-soft)] rounded-2xl p-3.5 border border-[var(--kg-border)] space-y-2 text-xs">
            {/* Honest Google Sheet / Cloud Ledger Confirmation Badge */}
            <div
              className={`flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b -mx-3.5 -mt-3.5 p-3 rounded-t-2xl ${
                lastSubmittedPunch.sheetSaved
                  ? 'border-[var(--kg-success)]/20 bg-[var(--kg-success-soft)]'
                  : 'border-sky-500/25 bg-sky-500/10'
              }`}
            >
              <span
                className={`font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5 shrink-0 ${
                  lastSubmittedPunch.sheetSaved
                    ? 'text-[var(--kg-success)]'
                    : 'text-sky-700 dark:text-sky-300'
                }`}
              >
                {lastSubmittedPunch.sheetSaved ? <CheckCircle2 size={15} /> : <CloudUpload size={15} />}
                Bảng Chấm Công
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  lastSubmittedPunch.sheetSaved ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white'
                }`}
              >
                {lastSubmittedPunch.sheetSaved
                  ? '✓ ĐÃ GHI GOOGLE SHEETS 100%'
                  : '☁️ ĐÃ BẢO LÃNH ĐÁM MÂY • ĐANG GHI SHEET'}
              </span>
            </div>

            {!lastSubmittedPunch.sheetSaved && lastSubmittedPunch.edgeBuffered && (
              <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/25 text-[11px] text-sky-800 dark:text-sky-300 font-semibold leading-snug">
                Lượt chấm đã được khóa an toàn trên Đám mây Cloudflare D1 và tự động ghi vào Google Sheets kể cả khi bạn đóng ứng dụng.
              </div>
            )}

            {Boolean(lastSubmittedPunch.supplementSubmittedText) && (
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-[11px] text-emerald-800 dark:text-emerald-300 font-bold flex items-center gap-1.5 leading-snug">
                <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{lastSubmittedPunch.supplementSubmittedText}</span>
              </div>
            )}

            <div className="flex items-center justify-between pb-2 border-b border-[var(--kg-border)]">
              <span className="text-[var(--kg-text-muted)] font-semibold uppercase tracking-wider text-[10px]">
                Nhân sự
              </span>
              <span className="font-bold text-[var(--kg-text)] text-sm">
                {lastSubmittedPunch.fullname}
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--kg-border)]">
              <span className="text-[var(--kg-text-muted)] font-semibold uppercase tracking-wider text-[10px]">
                Thời gian
              </span>
              <span className="font-mono tabular-nums font-bold text-[var(--kg-primary)]">
                {lastSubmittedPunch.time}
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--kg-border)]">
              <span className="text-[var(--kg-text-muted)] font-semibold uppercase tracking-wider text-[10px]">
                Ca làm việc
              </span>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-lg font-bold text-xs ${getPreviewShiftClass(lastSubmittedPunch.shift)}`}
              >
                {lastSubmittedPunch.shift}
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--kg-border)]">
              <span className="text-[var(--kg-text-muted)] font-semibold uppercase tracking-wider text-[10px]">
                Định vị GPS
              </span>
              <span className="font-mono tabular-nums font-bold text-[var(--kg-success)] flex items-center gap-1">
                <CheckCircle2 size={13} /> {lastSubmittedPunch.distMeters} • Hợp lệ
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[var(--kg-text-muted)] font-semibold uppercase tracking-wider text-[10px] shrink-0">
                Email thông báo
              </span>
              <span
                className="font-medium text-[var(--kg-text-muted)] truncate min-w-0 max-w-[175px] sm:max-w-[240px]"
                title={lastSubmittedPunch.email}
              >
                {lastSubmittedPunch.email}
              </span>
            </div>

            {Boolean(lastSubmittedPunch.lateMins && lastSubmittedPunch.lateMins > 0) && (
              <div className="mt-2 p-2.5 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                <span className="text-[11px] font-bold">
                  Đi trễ <span className="font-mono tabular-nums">{lastSubmittedPunch.lateMins}</span> phút • Khấu trừ tạm tính:{' '}
                  <span className="font-mono tabular-nums">
                    -{(lastSubmittedPunch.penaltyAmount || 0).toLocaleString()}đ
                  </span>
                </span>
              </div>
            )}

            {Boolean(lastSubmittedPunch.checklistPending) && (
              <div className="mt-2 p-2.5 rounded-xl bg-[var(--kg-info-soft)] border border-[var(--kg-info)]/25 text-[var(--kg-info)] flex items-center gap-2">
                <Info size={15} className="shrink-0" />
                <span className="text-[11px] font-semibold">
                  Nhắc nhở: Bạn có checklist vận hành ca trực cần hoàn thành.
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onCompleteSuccess}
            className={`w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-xs active:scale-[0.98] transition-colors flex items-center justify-center gap-2 min-h-[44px] ${
              isCheckInLabel(lastSubmittedPunch.type)
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)]'
            }`}
          >
            <CheckCircle2 size={18} />
            Hoàn tất
          </button>
        </div>
      ) : (
        <div className="space-y-4 text-center py-2">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${
              feedbackType === 'warning'
                ? 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                : 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary)]'
            }`}
          >
            {feedbackType === 'warning' ? <AlertTriangle size={24} /> : <UserCheck size={24} />}
          </div>
          <h4 className="text-base font-bold text-[var(--kg-text)]">{feedbackTitle}</h4>
          <p className="text-xs text-[var(--kg-text-muted)] whitespace-pre-line leading-relaxed">
            {feedbackMessage}
          </p>
          {feedbackType === 'warning' && !isWithinRadius && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPrecisionRescan();
                }}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-[var(--kg-primary)] hover:opacity-90 text-white text-xs font-black inline-flex items-center justify-center gap-1.5 active:scale-95 transition touch-manipulation"
              >
                <Radio size={14} />
                <span>Quét lại GPS</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMissedModal();
                }}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black inline-flex items-center justify-center gap-1.5 active:scale-95 transition touch-manipulation"
              >
                <Clock size={14} />
                <span>Bổ sung công</span>
              </button>
            </div>
          )}
          <KgButton variant="secondary" size="md" className="w-full" onClick={onClose}>
            Đóng
          </KgButton>
        </div>
      )}
    </KgBottomSheet>
  );
}
