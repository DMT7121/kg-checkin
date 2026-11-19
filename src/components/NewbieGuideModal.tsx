import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { TabId } from '../types/navigation';
import { navigateToHubSubTab } from '../utils/hubNavigation';
import { KgButton } from './KgDesignSystem';
import { useDialogA11y, useModalQueue } from '../utils/modalQueue';

interface NewbieGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: TabId) => void;
}

interface OnboardingStep {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  points: string[];
  tip: string;
  targetHub: TabId;
  targetSubTab?: string;
  ctaLabel: string;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'checkin',
    title: '1. Chấm công Face ID & GPS',
    subtitle: 'Vào ca và ra ca nhanh chóng ngay tại nhà hàng.',
    icon: Camera,
    points: [
      'Cấp quyền Camera & Vị trí (GPS) và đứng trong phạm vi nhà hàng (≤25m).',
      'Hệ thống tự gợi ý Vào ca hoặc Ra ca; bỏ kính râm/khẩu trang và nhìn thẳng vào khung.',
      'Chấm công thành công sẽ hiện nhãn xanh "Hợp lệ" trong Lịch sử chấm công.',
    ],
    tip: 'Nếu GPS bị lệch, hãy mở Google Maps bấm định vị rồi quay lại tải lại trang.',
    targetHub: 'checkin',
    ctaLabel: 'Mở Chấm công',
  },
  {
    id: 'schedule',
    title: '2. Đăng ký lịch làm & Đổi ca',
    subtitle: 'Chủ động chọn ca tuần tới trước 17:00 Thứ Bảy.',
    icon: Calendar,
    points: [
      'Vào Lịch làm việc -> Lịch của tôi để chọn Ca Sáng, Ca Tối hoặc OFF cho từng ngày T2–CN.',
      'Ngày đăng ký OFF bắt buộc nhập lý do ngắn gọn trước khi gửi.',
      'Cần đổi ca đột xuất: tạo yêu cầu tại tab Đổi ca để đồng nghiệp và Quản lý duyệt tự động.',
    ],
    tip: 'Kiểm tra tab Lịch tổng để nắm đội hình cùng ca trước khi đi làm.',
    targetHub: 'workforce',
    targetSubTab: 'schedule',
    ctaLabel: 'Mở Lịch làm việc',
  },
  {
    id: 'work',
    title: '3. Checklist phân khu, Két & Sự cố',
    subtitle: 'Đồng bộ công việc trực tuyến theo 4 khu A, B, C, D&E.',
    icon: ClipboardCheck,
    points: [
      'Checklist phân khu tự động hiển thị nhóm trực hôm nay và tự lưu từng đầu mục (không yêu cầu chụp ảnh, có lưu nháp nếu mất mạng).',
      'Thu ngân/Tổ trưởng đối soát két 2 chiều (Nhận đủ két -> Chốt két theo POS) tại tab Bàn giao ca.',
      'Phát hiện thiết bị hỏng hoặc sự cố trong ca: báo ngay tại tab Sự cố ca trong 2 chạm.',
    ],
    tip: 'Bếp/Bar báo món hết tại tab Món hết (86) để phục vụ cập nhật tức thì.',
    targetHub: 'work',
    targetSubTab: 'checklist',
    ctaLabel: 'Mở Vận hành',
  },
  {
    id: 'attendance',
    title: '4. Công, Phiếu lương & Ứng lương',
    subtitle: 'Minh bạch giờ công thực tế, phụ cấp và thu nhập hàng tháng.',
    icon: Banknote,
    points: [
      'Theo dõi giờ công, ca hợp lệ và phiếu lương chi tiết tại Công & Lương -> Phiếu lương.',
      'Cần ứng lương giữa tháng: kiểm tra hạn mức khả dụng và gửi đề nghị tại tab Ứng lương.',
      'Nếu phát hiện sai lệch giờ công hoặc bảng lương, gửi đề nghị điều chỉnh ngay trong Phiếu lương hoặc báo trực tiếp Quản lý.',
    ],
    tip: 'Kiểm tra Bảng công & Nhật ký cuối mỗi tuần để chốt công chính xác.',
    targetHub: 'attendance',
    targetSubTab: 'payroll',
    ctaLabel: 'Mở Công & Lương',
  },
  {
    id: 'knowledge',
    title: '5. Tra cứu SOP, CUKCUK & King Coins',
    subtitle: 'Nắm vững quy trình chuẩn và tích lũy điểm thi đua.',
    icon: GraduationCap,
    points: [
      'Tra cứu nhanh quy trình phục vụ, PCCC, xử lý tình huống khách và hướng dẫn POS CUKCUK tại Kiến thức.',
      'Hoàn thành bài kiểm tra năng lực đạt ≥70% để nhận thưởng King Coins.',
      'Chấm công đúng giờ (+5), Checklist (+10) và Bàn giao ca (+15) cũng cộng King Coins tại Bảng tin & Ghi nhận.',
    ],
    tip: 'Bạn luôn có thể mở lại cẩm nang này từ nút "Hướng dẫn dùng OS" trong mục Kiến thức.',
    targetHub: 'knowledge',
    ctaLabel: 'Mở Kiến thức & SOP',
  },
];

export default function NewbieGuideModal({ isOpen, onClose, onNavigateTab }: NewbieGuideModalProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const [stepIndex, setStepIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const activeInQueue = useModalQueue('newbie_guide', isOpen);

  const handleFinish = () => {
    if (currentUser?.username) {
      localStorage.setItem(`kg_onboarding_completed_${currentUser.username}`, 'true');
      if (dontShowAgain) {
        localStorage.setItem(`kg_onboarding_never_${currentUser.username}`, 'true');
      }
    }
    onClose();
  };

  useDialogA11y({
    isOpen: activeInQueue,
    containerRef: dialogRef,
    onClose: handleFinish,
    closeOnEscape: true,
  });

  if (!activeInQueue || typeof document === 'undefined') return null;

  const step = ONBOARDING_STEPS[stepIndex] || ONBOARDING_STEPS[0];
  const StepIcon = step.icon;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === ONBOARDING_STEPS.length - 1;

  const handleJump = () => {
    handleFinish();
    if (step.targetSubTab) {
      navigateToHubSubTab(step.targetHub, step.targetSubTab);
    } else if (onNavigateTab) {
      onNavigateTab(step.targetHub);
    } else {
      navigateToHubSubTab(step.targetHub);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return createPortal(
    <div className="fixed inset-0 z-[10060] flex items-end sm:items-center justify-center p-2.5 sm:p-4 animate-fade-in">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={handleFinish}
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kg-newbie-guide-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl max-h-[88dvh] bg-[var(--kg-surface)] text-[var(--kg-text)] rounded-2xl sm:rounded-3xl shadow-2xl border border-[var(--kg-border)] flex flex-col overflow-hidden z-10 focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--kg-primary)] text-white flex items-center justify-center shrink-0">
              <BookOpen size={18} />
            </div>
            <div className="min-w-0">
              <h2
                id="kg-newbie-guide-title"
                className="text-sm sm:text-base font-black text-[var(--kg-text)] truncate"
              >
                Hướng dẫn nhanh King&apos;s Grill OS
              </h2>
              <p className="text-[11px] font-mono tabular-nums font-bold text-[var(--kg-text-muted)]">
                Bước {stepIndex + 1}/{ONBOARDING_STEPS.length}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFinish}
            className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-[var(--kg-surface)] hover:bg-[var(--kg-border)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors shrink-0 touch-manipulation"
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        {/* Stepper Pills */}
        <div className="flex items-center gap-1.5 px-4 sm:px-5 pt-3">
          {ONBOARDING_STEPS.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Xem bước ${idx + 1}: ${item.title}`}
              onClick={() => setStepIndex(idx)}
              className={`h-2 flex-1 rounded-full transition-colors ${
                idx === stepIndex
                  ? 'bg-[var(--kg-primary)]'
                  : idx < stepIndex
                    ? 'bg-[var(--kg-success)]'
                    : 'bg-[var(--kg-surface-soft)] border border-[var(--kg-border)]'
              }`}
            />
          ))}
        </div>

        {/* Step Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]/20 flex items-center justify-center shrink-0">
              <StepIcon size={21} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-[var(--kg-text)]">{step.title}</h3>
              <p className="text-xs text-[var(--kg-text-muted)] font-medium mt-0.5">{step.subtitle}</p>
            </div>
          </div>

          <ul className="space-y-2.5">
            {step.points.map((point, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs sm:text-sm text-[var(--kg-text)] leading-relaxed font-medium"
              >
                <CheckCircle2 size={16} className="text-[var(--kg-success)] shrink-0 mt-0.5" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="p-3 rounded-xl bg-[var(--kg-info-soft)] border border-[var(--kg-info)]/25 text-xs text-[var(--kg-text)] leading-relaxed">
            <b className="text-[var(--kg-info)]">Mẹo:</b> {step.tip}
          </div>

          <div className="flex justify-end">
            <KgButton type="button" variant="secondary" size="sm" onClick={handleJump}>
              {step.ctaLabel}
            </KgButton>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-t border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--kg-text-muted)] select-none min-h-[44px] sm:min-h-[32px]">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--kg-border-strong)] text-[var(--kg-primary)] focus:ring-[var(--kg-primary-ink)]"
            />
            <span>Không tự động hiển thị lại</span>
          </label>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!isFirst && (
              <KgButton
                type="button"
                variant="secondary"
                size="sm"
                icon={ArrowLeft}
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                className="flex-1 sm:flex-initial"
              >
                Trước
              </KgButton>
            )}
            {!isLast ? (
              <KgButton
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setStepIndex((i) => Math.min(ONBOARDING_STEPS.length - 1, i + 1))}
                className="flex-1 sm:flex-initial"
              >
                <span className="inline-flex items-center gap-1.5">
                  Tiếp theo <ArrowRight size={14} />
                </span>
              </KgButton>
            ) : (
              <KgButton
                type="button"
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                onClick={handleFinish}
                className="flex-1 sm:flex-initial font-bold"
              >
                Bắt đầu làm việc
              </KgButton>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
