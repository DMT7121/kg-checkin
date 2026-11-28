import { useEffect, useState } from 'react';
import {
  Camera,
  Calendar,
  Newspaper,
  GraduationCap,
  UtensilsCrossed,
  MessageSquareWarning,
  ClipboardCheck,
  Repeat,
  Banknote,
  Award,
  CheckCircle2,
  ArrowRight,
  Sun,
  Sunset,
  MoonStar,
  AlertTriangle,
  Clock,
  History,
} from 'lucide-react';
import { useAppStore, type LogEntry, type User } from '../../store/useAppStore';
import {
  ResponsiveShift,
  getPreviewShiftClass,
  getVietnamDateParts,
  isCheckInLabel,
  type MissingCheckInAlert,
} from '../../utils/helpers';
import { detectOverdueOpenShift } from '../../utils/missedCheckoutReminder';
import { hasTabPermission } from '../../utils/permissions';
import {
  KgCard,
  KgStatusBadge,
  KgFeatureTip,
} from '../KgDesignSystem';
import type { TabId } from '../../types/navigation';

function useLiveVietnamClock() {
  const currentTime = useAppStore((s) => s.currentTime);
  const vnNow = getVietnamDateParts();
  const displayTime = currentTime
    ? currentTime.split(' ').pop()
    : `${String(vnNow.hour).padStart(2, '0')}:${String(vnNow.minute).padStart(2, '0')}`;
  const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const displayDayName = dayNames[vnNow.dayOfWeek];
  const displayDateNumeric = `${String(vnNow.day).padStart(2, '0')}/${String(vnNow.month).padStart(2, '0')}`;
  return { displayTime, displayDayName, displayDateNumeric, vnNow };
}

export interface EmployeeDashboardViewProps {
  currentUser: User | null;
  todayShift: string;
  isOff: boolean;
  userHasIn: boolean;
  userHasOut: boolean;
  statusText: string;
  statusVariant: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  todayChecklistDone: boolean;
  todayHandoverDone: boolean;
  nextWeekRegistered: boolean;
  approvedShifts: string[] | null;
  upcomingWeekDisplay: string;
  effectiveScheduleUpdatedAt: string;
  pendingMissedClaims: any[];
  missingAlerts: MissingCheckInAlert[];
  recentLogs: LogEntry[];
  onTabChange: (tab: TabId) => void;
  onOpenMissedModal: (alert?: MissingCheckInAlert | null) => void;
}

export default function EmployeeDashboardView({
  currentUser,
  todayShift,
  isOff,
  userHasIn,
  userHasOut,
  statusText,
  statusVariant,
  todayChecklistDone,
  todayHandoverDone,
  nextWeekRegistered,
  approvedShifts,
  upcomingWeekDisplay,
  effectiveScheduleUpdatedAt,
  pendingMissedClaims,
  missingAlerts,
  recentLogs,
  onTabChange,
  onOpenMissedModal,
}: EmployeeDashboardViewProps) {
  const { displayTime, displayDayName, displayDateNumeric, vnNow } = useLiveVietnamClock();

  const [, setOnboardingSyncTick] = useState(0);

  useEffect(() => {
    const syncState = () => setOnboardingSyncTick((t) => t + 1);
    window.addEventListener('storage', syncState);
    window.addEventListener('focus', syncState);
    window.addEventListener('kg:onboarding-completed', syncState);
    return () => {
      window.removeEventListener('storage', syncState);
      window.removeEventListener('focus', syncState);
      window.removeEventListener('kg:onboarding-completed', syncState);
    };
  }, []);

  const hideNewbieGuide = (() => {
    if (!currentUser?.username) return false;
    try {
      return Boolean(
        localStorage.getItem(`kg_onboarding_completed_${currentUser.username}`) ||
          localStorage.getItem(`kg_onboarding_never_${currentUser.username}`)
      );
    } catch {
      return false;
    }
  })();

  const isOffToday = isOff && !userHasIn;
  const overdueOpenShift =
    userHasIn && !userHasOut
      ? detectOverdueOpenShift({
          todayShift,
          todayLogs: recentLogs,
        })
      : null;
  const heroGuidance = isOffToday
    ? 'Hôm nay bạn không có ca làm việc nào được xếp. Chúc bạn có một ngày nghỉ vui vẻ!'
    : userHasOut
    ? 'Bạn đã hoàn thành chấm công ra ca hôm nay. Hẹn gặp lại vào ca làm việc tiếp theo!'
    : userHasIn
    ? 'Đang trong ca làm việc. Kiểm tra checklist khu vực và bấm Ra ca khi kết thúc.'
    : 'Sẵn sàng điểm danh vào ca — xác thực GPS nhà hàng ≤25m và chụp ảnh hoặc Face ID trong 1 chạm.';

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Unified Toast Touch Service Board Hero (Clock + Shift + Primary Check-In CTA + Checklist CTA) */}
      <section className="kg-service-board kg-animate-fade-up rounded-[22px] bg-[#24372C] text-[#FCFFF9] p-5 sm:p-6 shadow-hero border border-white/10 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-32 w-80 h-80 rounded-full border border-white/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-20 w-52 h-52 rounded-full border border-white/10"
        />

        <div className="relative z-10 col-span-full grid grid-cols-1 md:grid-cols-[minmax(0,1.25fr)_minmax(240px,0.75fr)] xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] gap-4 sm:gap-5 items-center">
          {/* Left Hero Identity & Integrated Action Buttons */}
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#F29055] text-[#241C17] flex items-center justify-center font-extrabold text-base flex-shrink-0">
                {currentUser?.fullname?.charAt(0) || 'K'}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#CFE3D4] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-snug">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    {vnNow.hour >= 5 && vnNow.hour < 12 ? (
                      <>
                        <Sun size={12} className="text-[#F9A36C]" /> Chào buổi sáng
                      </>
                    ) : vnNow.hour >= 12 && vnNow.hour < 18 ? (
                      <>
                        <Sunset size={12} className="text-[#F9A36C]" /> Chào buổi chiều
                      </>
                    ) : (
                      <>
                        <MoonStar size={12} className="text-sky-300" /> Chào buổi tối
                      </>
                    )}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-white/40 flex-shrink-0" />
                  <span className="text-[#F9A36C] whitespace-nowrap">
                    {currentUser?.position || 'Nhân sự'}
                  </span>
                </p>
                <h2 className="text-xl sm:text-2xl lg:text-[26px] font-extrabold tracking-tight text-white break-words xl:truncate mt-0.5 leading-tight">
                  {currentUser?.fullname || currentUser?.username}
                </h2>
              </div>
            </div>

            <p className="text-xs sm:text-[13px] text-[#C3D1C5] leading-relaxed max-w-xl">
              {heroGuidance}
            </p>

            {/* Integrated Primary & Secondary CTAs directly inside Hero (no duplicate check-in bar below) */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {isOffToday ? (
                <>
                  {hasTabPermission('schedule', currentUser) && (
                    <button
                      type="button"
                      onClick={() => onTabChange('schedule')}
                      className="kg-pressable min-h-[46px] px-4 py-2.5 rounded-xl bg-[#F9A36C] hover:bg-[#FFAE7A] text-[#241C17] font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors touch-manipulation whitespace-nowrap"
                    >
                      <Calendar size={17} />
                      <span>Xem lịch ca tuần</span>
                      <ArrowRight size={15} />
                    </button>
                  )}
                  {hasTabPermission('checklist', currentUser) && (
                    <button
                      type="button"
                      onClick={() => onTabChange('checklist')}
                      className="kg-pressable min-h-[46px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors touch-manipulation whitespace-nowrap"
                    >
                      <ClipboardCheck size={16} />
                      <span>Checklist ca</span>
                    </button>
                  )}
                </>
              ) : userHasOut ? (
                <>
                  <button
                    type="button"
                    onClick={() => onTabChange('history')}
                    className="kg-pressable min-h-[46px] px-4 py-2.5 rounded-xl bg-[#7EDBA8] hover:brightness-95 text-[#0F2419] font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors touch-manipulation whitespace-nowrap"
                  >
                    <CheckCircle2 size={17} />
                    <span>Đã xong ca • Xem lịch sử</span>
                  </button>
                  {hasTabPermission('checklist', currentUser) && (
                    <button
                      type="button"
                      onClick={() => onTabChange('checklist')}
                      className="kg-pressable min-h-[46px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors touch-manipulation whitespace-nowrap"
                    >
                      <ClipboardCheck size={16} />
                      <span>Checklist ca</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onTabChange('checkin')}
                    className={`kg-pressable min-h-[48px] px-5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm inline-flex items-center justify-center gap-2 shadow-xs transition-colors touch-manipulation whitespace-nowrap ${
                      userHasIn
                        ? 'bg-[#B93F36] hover:bg-[#9F342C] text-white border border-rose-400/30'
                        : 'bg-[#F9A36C] hover:bg-[#FFAE7A] text-[#241C17]'
                    }`}
                  >
                    <Camera size={18} className="flex-shrink-0" />
                    <span>{userHasIn ? 'Chấm Ra Ca Ngay' : 'Chấm Công Vào Ca'}</span>
                    <ArrowRight size={15} className="flex-shrink-0" />
                  </button>
                  {hasTabPermission('checklist', currentUser) && (
                    <button
                      type="button"
                      onClick={() => onTabChange('checklist')}
                      className="kg-pressable min-h-[48px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors touch-manipulation whitespace-nowrap"
                    >
                      <ClipboardCheck size={16} className="flex-shrink-0" />
                      <span>Checklist ca</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right Hero Mini Cards (.kg-board-mini) */}
          <div className="grid grid-cols-2 md:grid-cols-1 gap-2.5">
            <div className="kg-board-mini col-span-2 md:col-span-1 rounded-xl bg-white/10 border border-white/15 px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#C9D5C9]">
                  Giờ hệ thống (GMT+7)
                </span>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-lg sm:text-xl font-extrabold font-mono tabular-nums text-white leading-none">
                    {displayTime}
                  </span>
                  <span className="text-[11px] font-medium text-[#C9D5C9]">
                    • {displayDayName},{' '}
                    <span className="font-mono tabular-nums font-semibold">{displayDateNumeric}</span>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold text-[#7EDBA8] shrink-0">
                <span className="w-2 h-2 rounded-full bg-[#7EDBA8] animate-pulse" />
                <span>LIVE</span>
              </div>
            </div>

            <div className="kg-board-mini rounded-xl bg-white/10 border border-white/15 px-3.5 py-2.5 flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#C9D5C9]">
                  Ca hôm nay
                </span>
                <div className="mt-1">
                  {!todayShift || todayShift === 'OFF' ? (
                    <span className="text-xs sm:text-sm font-bold text-white/95">Nghỉ ca (OFF)</span>
                  ) : (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold font-mono tabular-nums shadow-xs ${getPreviewShiftClass(todayShift)}`}
                    >
                      <ResponsiveShift shift={todayShift} />
                    </span>
                  )}
                </div>
              </div>
              <Clock size={18} className="text-[#F5AA7C] hidden sm:block shrink-0" />
            </div>

            <div className="kg-board-mini rounded-xl bg-white/10 border border-white/15 px-3.5 py-2.5 flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#C9D5C9]">
                  Trạng thái
                </span>
                <div className="mt-1">
                  <KgStatusBadge variant={statusVariant}>{statusText}</KgStatusBadge>
                </div>
              </div>
              <History size={18} className="text-[#F5AA7C] hidden sm:block shrink-0" />
            </div>
          </div>
        </div>
      </section>

      {/* Automatic Forgotten Checkout Reminder (#9) */}
      {overdueOpenShift && (
        <div
          role="alert"
          className="kg-animate-fade-up rounded-2xl border border-[var(--kg-warning)]/45 bg-[var(--kg-warning-soft)]/45 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--kg-warning)]/15 text-[var(--kg-warning)] border border-[var(--kg-warning)]/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={19} />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-extrabold text-[var(--kg-text)]">
                Nhắc quên chấm Ra ca ({overdueOpenShift.shiftLabel})
              </p>
              <p className="text-[11px] sm:text-xs text-[var(--kg-text-muted)] mt-0.5 leading-snug">
                Bạn đã <b>Vào ca lúc {overdueOpenShift.checkInTimeStr}</b> và đã qua giờ tan ca dự kiến (
                <span className="font-mono tabular-nums font-bold">{overdueOpenShift.expectedEndStr}</span>) khoảng{' '}
                <span className="font-mono tabular-nums font-bold text-[var(--kg-warning)]">
                  {overdueOpenShift.overdueMinutes} phút
                </span>{' '}
                nhưng chưa có lượt Ra ca.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onTabChange('checkin')}
              className="kg-pressable min-h-[42px] px-3.5 py-2 rounded-xl bg-[#B93F36] hover:bg-[#9F342C] text-white font-extrabold text-xs inline-flex items-center gap-1.5 touch-manipulation whitespace-nowrap"
            >
              <Camera size={14} />
              <span>Chấm Ra ca ngay</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenMissedModal(null)}
              className="kg-pressable min-h-[42px] px-3.5 py-2 rounded-xl bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-2)] border border-[var(--kg-border)] text-[var(--kg-text)] font-bold text-xs inline-flex items-center gap-1.5 touch-manipulation whitespace-nowrap"
            >
              <Clock size={14} />
              <span>Báo quên Ra ca</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 xl:gap-6 items-start">
        {/* Left Column: Alerts & Today's Tasks */}
        <div className="lg:col-span-7 space-y-4 sm:space-y-5">
          {/* Quick Newbie Guide Banner (automatically hidden once completed/dismissed) */}
          {!hideNewbieGuide && (
            <div className="kg-animate-fade-up kg-stagger-1 p-3.5 sm:p-4 rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]/20 flex items-center justify-center flex-shrink-0">
                  <GraduationCap size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-[var(--kg-text)] truncate">
                    Cẩm nang nhân sự mới
                  </p>
                  <p className="text-[11px] text-[var(--kg-text-muted)] font-medium leading-snug line-clamp-2 sm:line-clamp-1">
                    Quy trình chấm công, xếp lịch &amp; tiêu chuẩn ca trực
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('kg:open-newbie-guide'))}
                className="kg-pressable w-full sm:w-auto px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-xs font-bold shadow-xs transition-colors flex-shrink-0 flex items-center justify-center gap-1 min-h-[44px] sm:min-h-[38px] whitespace-nowrap touch-manipulation"
              >
                <span>Xem ngay</span> <ArrowRight size={13} />
              </button>
            </div>
          )}

          {/* Pending Missed Claims Warning Card */}
          {pendingMissedClaims.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenMissedModal(null)}
              className="kg-animate-fade-up kg-stagger-1 kg-card-interactive kg-pressable w-full text-left p-3.5 min-h-[44px] rounded-2xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/35 cursor-pointer hover:brightness-[0.98] transition-all flex items-center justify-between gap-3 shadow-xs touch-manipulation"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-[var(--kg-warning)]/15 text-[var(--kg-warning)] flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--kg-warning)] truncate">
                    Bạn có <span className="font-mono tabular-nums">{pendingMissedClaims.length}</span> yêu cầu bổ sung công đang chờ duyệt
                  </p>
                  <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 font-medium truncate">
                    Gần nhất: <b className="font-mono tabular-nums">{pendingMissedClaims[0].date}</b> ({pendingMissedClaims[0].type} - <span className="font-mono tabular-nums">{pendingMissedClaims[0].time}</span>)
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-[var(--kg-warning)] whitespace-nowrap bg-[var(--kg-surface)] px-3 py-1.5 rounded-xl border border-[var(--kg-warning)]/35 flex-shrink-0">
                Chi tiết →
              </span>
            </button>
          )}

          {/* Detected Missing Check-in Shifts Alert */}
          {missingAlerts.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenMissedModal(missingAlerts[0])}
              className="kg-animate-fade-up kg-stagger-1 kg-card-interactive kg-pressable w-full text-left p-3.5 min-h-[44px] rounded-2xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/35 cursor-pointer hover:brightness-[0.98] transition-all flex items-center justify-between gap-3 shadow-xs touch-manipulation"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-xl bg-[var(--kg-warning)]/15 text-[var(--kg-warning)] flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--kg-warning)] truncate">
                    Phát hiện <span className="font-mono tabular-nums">{missingAlerts.length}</span> ca làm chưa hoàn tất
                  </p>
                  <p className="text-[11px] text-[var(--kg-text)] font-medium mt-0.5 line-clamp-1 leading-snug">
                    {missingAlerts[0].message}
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-[var(--kg-warning)] whitespace-nowrap bg-[var(--kg-surface)] px-3 py-1.5 rounded-xl border border-[var(--kg-warning)]/35 flex-shrink-0">
                Bổ sung →
              </span>
            </button>
          )}

          {/* Today's Tasks */}
          <KgCard className="kg-animate-fade-up kg-stagger-2 p-4 sm:p-5">
            <div className="flex items-center justify-between border-b border-[var(--kg-border)] pb-2.5 mb-3.5">
              <div>
                <h3 className="text-sm font-extrabold text-[var(--kg-text)] tracking-tight">
                  Việc cần làm hôm nay
                </h3>
                <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5">
                  Ưu tiên hoàn thành trong ca trực
                </p>
              </div>
              <KgFeatureTip
                title="Hướng dẫn Việc cần làm hôm nay"
                tips={[
                  'Checklist: Kiểm tra và đánh dấu đầy đủ các khu vực trước khi bắt đầu hoặc kết thúc ca làm.',
                  'Sổ Bàn giao ca: Bắt buộc đếm quỹ tiền mặt, ghi nhận tồn kho và sự cố trước khi giao ca.',
                  'Đăng ký lịch làm: Hạn chót 17:00 Thứ 7 hàng tuần để AI và Quản lý sắp xếp đội hình tối ưu.',
                ]}
                variant="badge"
                triggerText="Lưu ý"
                size="sm"
              />
            </div>

            <div className="space-y-2.5">
              {hasTabPermission('checklist', currentUser) && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] transition-colors gap-2.5">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                        todayChecklistDone
                          ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/25'
                          : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-[var(--kg-warning)]/25'
                      }`}
                    >
                      <ClipboardCheck size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[var(--kg-text)] truncate">
                        Checklist Vận Hành Hôm Nay
                      </p>
                      <p className="text-[11px] text-[var(--kg-text-muted)] font-medium truncate">
                        {todayChecklistDone
                          ? '100% hoàn thành tất cả hạng mục ca'
                          : 'Chưa hoàn thành đầy đủ hạng mục'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    {todayChecklistDone ? (
                      <KgStatusBadge variant="success">✓ Đã nộp</KgStatusBadge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onTabChange('checklist')}
                        className="kg-pressable w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-xs font-bold shadow-xs transition-colors flex items-center gap-1 whitespace-nowrap flex-shrink-0 min-h-[44px] sm:min-h-[38px] touch-manipulation"
                      >
                        Làm Checklist ngay →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {hasTabPermission('handover', currentUser) && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] transition-colors gap-2.5">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                        todayHandoverDone
                          ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/25'
                          : 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border-[var(--kg-danger)]/25'
                      }`}
                    >
                      <Repeat size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[var(--kg-text)] truncate">
                        Sổ Bàn Giao Ca
                      </p>
                      <p className="text-[11px] text-[var(--kg-text-muted)] font-medium truncate">
                        Bàn giao quỹ tiền mặt, tồn kho, sự cố
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    {todayHandoverDone ? (
                      <KgStatusBadge variant="success">✓ Hoàn thành</KgStatusBadge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onTabChange('handover')}
                        className="kg-pressable w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-xs font-bold shadow-xs transition-colors flex items-center gap-1 whitespace-nowrap flex-shrink-0 min-h-[44px] sm:min-h-[38px] touch-manipulation"
                      >
                        Ghi sổ ngay →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {hasTabPermission('schedule', currentUser) && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] transition-colors gap-2.5">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                        nextWeekRegistered
                          ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/25'
                          : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)]'
                      }`}
                    >
                      <Calendar size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold text-[var(--kg-text)] leading-snug">
                        {nextWeekRegistered
                          ? `Đã đăng ký lịch làm tuần ${upcomingWeekDisplay}`
                          : `Đăng Ký Lịch Tuần ${upcomingWeekDisplay}`}
                      </p>
                      <p className="text-[11px] text-[var(--kg-text-muted)] font-medium leading-snug mt-0.5">
                        {nextWeekRegistered ? (
                          effectiveScheduleUpdatedAt ? (
                            <>
                              Ghi nhận gần nhất:{' '}
                              <span className="font-mono tabular-nums font-bold text-[var(--kg-text)]">
                                {effectiveScheduleUpdatedAt}
                              </span>
                            </>
                          ) : approvedShifts && approvedShifts.length > 0 ? (
                            'Lịch làm việc đã được quản lý phê duyệt'
                          ) : (
                            'Đã ghi nhận vào Bảng Chấm Công • Đang chờ quản lý duyệt'
                          )
                        ) : (
                          'Bắt buộc đăng ký trước 17:00 Thứ 7 hàng tuần'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    {nextWeekRegistered && approvedShifts && approvedShifts.length > 0 ? (
                      <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-2">
                        <KgStatusBadge variant="success">✓ Đã duyệt</KgStatusBadge>
                        <button
                          type="button"
                          onClick={() => onTabChange('schedule')}
                          className="kg-pressable text-xs font-bold text-[var(--kg-primary-ink)] hover:underline whitespace-nowrap min-h-[44px] sm:min-h-[36px] px-2 rounded-lg inline-flex items-center touch-manipulation"
                        >
                          Xem lịch →
                        </button>
                      </div>
                    ) : nextWeekRegistered ? (
                      <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-2">
                        <KgStatusBadge variant="warning">Chờ duyệt</KgStatusBadge>
                        <button
                          type="button"
                          onClick={() => onTabChange('schedule')}
                          className="kg-pressable text-xs font-bold text-[var(--kg-warning)] hover:underline whitespace-nowrap min-h-[44px] sm:min-h-[36px] px-2 rounded-lg inline-flex items-center touch-manipulation"
                        >
                          Xem / Sửa →
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onTabChange('schedule')}
                        className="kg-pressable w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-xs font-bold shadow-xs transition-colors flex items-center gap-1 whitespace-nowrap flex-shrink-0 min-h-[44px] sm:min-h-[38px] touch-manipulation"
                      >
                        Đăng ký ngay →
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </KgCard>
        </div>

        {/* Right Column: Quick Touch Tiles (.kg-touch-tile) & Recent Activity */}
        <div className="lg:col-span-5 space-y-4 sm:space-y-5">
          <KgCard className="kg-animate-fade-up kg-stagger-3 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-extrabold text-[var(--kg-text)] tracking-tight">
                  Tiện ích nhanh
                </h3>
                <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5">
                  Chạm để mở phân hệ thường dùng
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {[
                { icon: Newspaper, label: 'Bảng tin', sub: 'Cập nhật mới', tab: 'news' as TabId, color: 'text-[var(--kg-info)] bg-[var(--kg-info-soft)]' },
                { icon: UtensilsCrossed, label: 'Món hết', sub: 'Báo quầy bếp', tab: 'soldout' as TabId, color: 'text-[var(--kg-warning)] bg-[var(--kg-warning-soft)]' },
                { icon: Award, label: 'Thi đua', sub: 'King Coins', tab: 'reward' as TabId, color: 'text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)]' },
                { icon: Banknote, label: 'Phiếu lương', sub: 'Đối chiếu tháng', tab: 'payroll' as TabId, color: 'text-[var(--kg-success)] bg-[var(--kg-success-soft)]' },
                { icon: MessageSquareWarning, label: 'Góp ý', sub: 'Ẩn danh an toàn', tab: 'feedback' as TabId, color: 'text-[var(--kg-danger)] bg-[var(--kg-danger-soft)]' },
                { icon: Calendar, label: 'Lịch ca', sub: 'Đăng ký tuần', tab: 'schedule' as TabId, color: 'text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)]' },
              ]
                .filter((act) => hasTabPermission(act.tab, currentUser))
                .map((act) => (
                  <button
                    key={act.tab}
                    type="button"
                    onClick={() => onTabChange(act.tab)}
                    className="kg-touch-tile kg-card-interactive kg-pressable group min-w-0 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] hover:border-[var(--kg-primary)] hover:bg-[var(--kg-primary-soft)] p-3 text-left flex flex-col justify-between gap-2.5 min-h-[92px] transition-colors touch-manipulation"
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${act.color}`}>
                        <act.icon size={17} />
                      </div>
                      <ArrowRight
                        size={13}
                        className="text-[var(--kg-text-soft)] group-hover:text-[var(--kg-primary-ink)] group-hover:translate-x-0.5 transition-transform shrink-0"
                      />
                    </div>
                    <div className="min-w-0 w-full">
                      <span className="block text-xs font-extrabold text-[var(--kg-text)] truncate">
                        {act.label}
                      </span>
                      <span className="hidden sm:block text-[10px] text-[var(--kg-text-muted)] truncate mt-0.5">
                        {act.sub}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          </KgCard>

          {/* Personal Recent Activity Logs */}
          <KgCard className="kg-animate-fade-up kg-stagger-4 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3 border-b border-[var(--kg-border)] pb-2">
              <h3 className="text-sm font-extrabold text-[var(--kg-text)] tracking-tight">
                Lịch sử chấm công
              </h3>
              <button
                type="button"
                onClick={() => onTabChange('history')}
                className="kg-pressable text-xs font-bold text-[var(--kg-primary-ink)] hover:underline min-h-[44px] sm:min-h-[36px] px-2 rounded-lg inline-flex items-center touch-manipulation"
              >
                Xem tất cả →
              </button>
            </div>
            {recentLogs.length > 0 ? (
              <div className="space-y-2">
                {recentLogs.map((log, i) => {
                  const isCheckin = isCheckInLabel(log.type);
                  const isSyncingToSheet = Boolean(log.edgeBuffered || log.sheetSynced === false || log.localQueued);
                  return (
                    <div
                      key={log.checkinId || i}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] transition-colors"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold flex-shrink-0 text-xs ${
                            isCheckin
                              ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                              : 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                          }`}
                        >
                          {isCheckin ? '→' : '←'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-[var(--kg-text)] truncate">
                              {log.type}
                            </p>
                            <span
                              title={
                                isSyncingToSheet
                                  ? 'Đã lưu an toàn trên đám mây Edge D1, đang tự động ghi vào Google Sheet'
                                  : 'Đã ghi nhận chính thức vào sổ Google Sheet ✔️CHẤM CÔNG'
                              }
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold border whitespace-nowrap ${
                                isSyncingToSheet
                                  ? 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-[var(--kg-warning)]/30'
                                  : 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/25'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isSyncingToSheet
                                    ? 'bg-[var(--kg-warning)] animate-pulse'
                                    : 'bg-[var(--kg-success)]'
                                }`}
                              />
                              {isSyncingToSheet ? 'Đang lên Sheet' : 'Đã lên Sheet'}
                            </span>
                          </div>
                          <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] truncate">
                            {log.time}
                          </p>
                        </div>
                      </div>
                      <KgStatusBadge variant={log.status?.includes('Hợp lệ') ? 'success' : 'error'}>
                        {log.status?.includes('Hợp lệ') ? '✓ Hợp lệ' : '✗ Lỗi'}
                      </KgStatusBadge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-5 text-xs text-[var(--kg-text-muted)]">
                Chưa có hoạt động nào hôm nay
              </div>
            )}
          </KgCard>
        </div>
      </div>
    </div>
  );
}
