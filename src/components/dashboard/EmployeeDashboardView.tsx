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
} from 'lucide-react';
import { useAppStore, type LogEntry, type User } from '../../store/useAppStore';
import {
  ResponsiveShift,
  getPreviewShiftClass,
  getVietnamDateParts,
  isCheckInLabel,
  type MissingCheckInAlert,
} from '../../utils/helpers';
import { hasTabPermission } from '../../utils/permissions';
import {
  KgCard,
  KgStatusBadge,
  KgAlertCard,
  KgFeatureTip,
} from '../KgDesignSystem';
import type { TabId } from '../../types/navigation';

function LiveClockDisplay() {
  const currentTime = useAppStore((s) => s.currentTime);
  const vnNow = getVietnamDateParts();
  const displayTime = currentTime
    ? currentTime.split(' ').pop()
    : `${String(vnNow.hour).padStart(2, '0')}:${String(vnNow.minute).padStart(2, '0')}`;
  const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const displayDate = `${dayNames[vnNow.dayOfWeek]}, ${String(vnNow.day).padStart(2, '0')}/${String(vnNow.month).padStart(2, '0')}`;

  return (
    <div className="flex-shrink-0 bg-black/30 border border-white/15 rounded-xl px-2 py-1.5 sm:px-3 sm:py-2 flex flex-col items-end justify-center">
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        <span className="text-xs sm:text-base font-extrabold font-mono tabular-nums text-white leading-none">
          {displayTime}
        </span>
      </div>
      <span className="text-[10.5px] sm:text-[11px] font-medium font-mono tabular-nums text-white/80 whitespace-nowrap block text-right mt-1 leading-none">
        {displayDate}
      </span>
    </div>
  );
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
  const vnNow = getVietnamDateParts();

  const readOnboardingHidden = () => {
    if (!currentUser?.username) return false;
    try {
      return Boolean(
        localStorage.getItem(`kg_onboarding_completed_${currentUser.username}`) ||
          localStorage.getItem(`kg_onboarding_never_${currentUser.username}`)
      );
    } catch {
      return false;
    }
  };

  const [hideNewbieGuide, setHideNewbieGuide] = useState<boolean>(readOnboardingHidden);

  useEffect(() => {
    setHideNewbieGuide(readOnboardingHidden());
    const syncState = () => setHideNewbieGuide(readOnboardingHidden());
    window.addEventListener('storage', syncState);
    window.addEventListener('focus', syncState);
    window.addEventListener('kg:onboarding-completed', syncState);
    return () => {
      window.removeEventListener('storage', syncState);
      window.removeEventListener('focus', syncState);
      window.removeEventListener('kg:onboarding-completed', syncState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
      {/* Left side: Hero card & Actions */}
      <div className="lg:col-span-7 space-y-4">
        {/* Personal Operational Shift Card */}
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[var(--kg-rail-bg)] p-4 sm:p-5 text-[var(--kg-rail-text)] shadow-hero border border-[var(--kg-rail-border)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 w-48 h-48 rounded-full bg-[var(--kg-accent)]/20"
          />
          <div className="relative z-10 flex flex-col justify-between h-full space-y-3.5">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                <div className="w-11 h-11 rounded-2xl bg-[var(--kg-accent)] border border-white/20 flex items-center justify-center font-extrabold text-base sm:text-lg text-white flex-shrink-0 shadow-xs">
                  {currentUser?.fullname?.charAt(0) || 'K'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white/85 text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wide sm:tracking-wider flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-snug">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                      {vnNow.hour >= 5 && vnNow.hour < 12 ? (
                        <>
                          <Sun size={12} className="text-amber-300" /> Chào buổi sáng
                        </>
                      ) : vnNow.hour >= 12 && vnNow.hour < 18 ? (
                        <>
                          <Sunset size={12} className="text-amber-300" /> Chào buổi chiều
                        </>
                      ) : (
                        <>
                          <MoonStar size={12} className="text-sky-300" /> Chào buổi tối
                        </>
                      )}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-white/50 flex-shrink-0" />
                    <span className="whitespace-nowrap text-amber-300 font-bold">
                      {currentUser?.position || 'Nhân sự'}
                    </span>
                  </p>
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white truncate mt-0.5">
                    {currentUser?.fullname || currentUser?.username}
                  </h2>
                </div>
              </div>

              <LiveClockDisplay />
            </div>

            <div className="grid grid-cols-2 gap-2 bg-black/25 rounded-xl p-3 border border-white/15">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">
                  Ca làm hôm nay
                </p>
                <div className="mt-1">
                  {!todayShift || todayShift === 'OFF' ? (
                    <span className="text-xs sm:text-sm font-bold text-white/95">Nghỉ ca (OFF)</span>
                  ) : (
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs sm:text-sm font-bold shadow-xs ${getPreviewShiftClass(todayShift)}`}
                    >
                      <ResponsiveShift shift={todayShift} />
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">
                  Trạng thái
                </p>
                <div className="mt-1 flex justify-end">
                  <KgStatusBadge variant={statusVariant}>{statusText}</KgStatusBadge>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Check-In CTA: Full-width thumb button on Mobile, balanced proportional action bar on Tablet/Desktop */}
        {isOff && !userHasIn ? (
          <KgAlertCard variant="info" icon={Calendar}>
            Hôm nay bạn không có ca làm việc nào được xếp. Chúc bạn có một ngày nghỉ vui vẻ!
          </KgAlertCard>
        ) : userHasOut ? (
          <KgAlertCard variant="success" icon={CheckCircle2}>
            Bạn đã hoàn thành chấm công ra ca hôm nay. Hẹn gặp lại vào ca làm việc tiếp theo!
          </KgAlertCard>
        ) : (
          <div className="sm:p-3.5 sm:rounded-2xl sm:bg-[var(--kg-surface)] sm:border sm:border-[var(--kg-border)] sm:shadow-xs sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div className="hidden sm:flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  userHasIn
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25'
                    : 'bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)] border border-[var(--kg-accent)]/25'
                }`}
              >
                <Camera size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[var(--kg-text)] truncate">
                  {userHasIn ? 'Đang trong ca làm việc' : 'Sẵn sàng điểm danh vào ca'}
                </p>
                <p className="text-[11px] text-[var(--kg-text-muted)] truncate">
                  {userHasIn
                    ? 'Chạm nút bên phải để chụp ảnh hoặc quét Face ID ra ca'
                    : 'Xác thực GPS nhà hàng và chụp ảnh / Face ID trong 1 chạm'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onTabChange('checkin')}
              className={`w-full sm:w-auto sm:min-w-[228px] py-3.5 sm:py-2.5 px-5 rounded-2xl sm:rounded-xl font-extrabold text-sm tracking-wide uppercase text-white shadow-md sm:shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 min-h-[52px] sm:min-h-[44px] whitespace-nowrap flex-shrink-0 touch-manipulation ${
                userHasIn
                  ? 'bg-rose-700 hover:bg-rose-800'
                  : 'bg-[var(--kg-accent)] hover:brightness-95'
              }`}
            >
              <Camera size={19} className="animate-pulse flex-shrink-0" />
              <span>{userHasIn ? 'Chấm Ra Ca Ngay' : 'Chấm Công Vào Ca'}</span>
            </button>
          </div>
        )}

        {/* Quick Newbie Guide Banner (automatically hidden once completed/dismissed) */}
        {!hideNewbieGuide && (
          <div className="p-3.5 rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)] border border-[var(--kg-accent)]/20 flex items-center justify-center flex-shrink-0">
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
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-bold shadow-xs active:scale-95 transition-colors flex-shrink-0 flex items-center justify-center gap-1 min-h-[44px] sm:min-h-[38px] whitespace-nowrap touch-manipulation"
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
            className="w-full text-left p-3.5 min-h-[44px] rounded-2xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/35 cursor-pointer hover:brightness-[0.98] transition-all flex items-center justify-between gap-3 shadow-xs animate-slide-up"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300 truncate">
                  Bạn có <span className="font-mono tabular-nums">{pendingMissedClaims.length}</span> yêu cầu bổ sung công đang chờ duyệt
                </p>
                <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 font-medium truncate">
                  Gần nhất: <b className="font-mono tabular-nums">{pendingMissedClaims[0].date}</b> ({pendingMissedClaims[0].type} - <span className="font-mono tabular-nums">{pendingMissedClaims[0].time}</span>)
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 whitespace-nowrap bg-amber-500/15 px-3 py-1.5 rounded-xl border border-amber-500/35 flex-shrink-0">
              Chi tiết →
            </span>
          </button>
        )}

        {/* Detected Missing Check-in Shifts Alert */}
        {missingAlerts.length > 0 && (
          <button
            type="button"
            onClick={() => onOpenMissedModal(missingAlerts[0])}
            className="w-full text-left p-3.5 min-h-[44px] rounded-2xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/35 cursor-pointer hover:brightness-[0.98] transition-all flex items-center justify-between gap-3 shadow-xs animate-slide-up"
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300 truncate">
                  Phát hiện <span className="font-mono tabular-nums">{missingAlerts.length}</span> ca làm chưa hoàn tất
                </p>
                <p className="text-[11px] text-[var(--kg-text)] font-medium mt-0.5 line-clamp-1 leading-snug">
                  {missingAlerts[0].message}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 whitespace-nowrap bg-amber-500/15 px-3 py-1.5 rounded-xl border border-amber-500/35 flex-shrink-0">
              Bổ sung →
            </span>
          </button>
        )}

        {/* Today's Tasks */}
        <KgCard className="p-4 sm:p-5">
          <div className="flex items-center justify-between border-b border-[var(--kg-border)] pb-2.5 mb-3.5">
            <h3 className="text-sm font-black text-[var(--kg-text)] uppercase tracking-wider">
              Việc cần làm hôm nay
            </h3>
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
          <div className="space-y-3">
            {hasTabPermission('checklist', currentUser) && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] gap-2.5">
                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      todayChecklistDone
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50'
                        : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50'
                    }`}
                  >
                    <ClipboardCheck size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-[var(--kg-text)] truncate">
                      Checklist Vận Hành Hôm Nay
                    </p>
                    <p className="text-[10.5px] text-[var(--kg-text-muted)] font-medium truncate">
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
                      className="w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center gap-1 whitespace-nowrap flex-shrink-0 min-h-[44px] sm:min-h-[38px] touch-manipulation"
                    >
                      Làm Checklist ngay →
                    </button>
                  )}
                </div>
              </div>
            )}

            {hasTabPermission('handover', currentUser) && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] gap-2.5">
                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      todayHandoverDone
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50'
                        : 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400 border border-rose-200/50'
                    }`}
                  >
                    <Repeat size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-black text-[var(--kg-text)] truncate">
                      Sổ Bàn Giao Ca
                    </p>
                    <p className="text-[10.5px] text-[var(--kg-text-muted)] font-medium truncate">
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
                      className="w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center gap-1 whitespace-nowrap flex-shrink-0 min-h-[44px] sm:min-h-[38px] touch-manipulation"
                    >
                      Ghi sổ ngay →
                    </button>
                  )}
                </div>
              </div>
            )}

            {hasTabPermission('schedule', currentUser) && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] gap-2.5">
                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      nextWeekRegistered
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200/50'
                    }`}
                  >
                    <Calendar size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-[var(--kg-text)] leading-snug">
                      {nextWeekRegistered
                        ? `Đã đăng ký lịch làm tuần ${upcomingWeekDisplay}`
                        : `Đăng Ký Lịch Tuần ${upcomingWeekDisplay}`}
                    </p>
                    <p className="text-[10.5px] text-[var(--kg-text-muted)] font-medium leading-snug mt-0.5">
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
                        className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline whitespace-nowrap min-h-[44px] sm:min-h-[36px] px-2 inline-flex items-center touch-manipulation"
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
                        className="text-xs font-bold text-[var(--kg-warning)] hover:underline whitespace-nowrap min-h-[44px] sm:min-h-[36px] px-2 inline-flex items-center touch-manipulation"
                      >
                        Xem / Sửa →
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onTabChange('schedule')}
                      className="w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center gap-1 whitespace-nowrap flex-shrink-0 min-h-[44px] sm:min-h-[38px] touch-manipulation"
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

      {/* Right side: Quick Launcher & Recent activity */}
      <div className="lg:col-span-5 space-y-4">
        <KgCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-extrabold text-[var(--kg-text)] uppercase tracking-wider">
              Tiện ích nhanh
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Newspaper, label: 'Bảng tin', tab: 'news' as TabId, color: 'text-sky-700 dark:text-sky-300 bg-sky-500/12 border-sky-500/20' },
              { icon: UtensilsCrossed, label: 'Món hết', tab: 'soldout' as TabId, color: 'text-amber-700 dark:text-amber-300 bg-amber-500/12 border-amber-500/20' },
              { icon: Award, label: 'Thi đua', tab: 'reward' as TabId, color: 'text-[var(--kg-accent-ink)] bg-[var(--kg-accent-soft)] border-[var(--kg-accent)]/20' },
              { icon: Banknote, label: 'Phiếu lương', tab: 'payroll' as TabId, color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/12 border-emerald-500/20' },
              { icon: MessageSquareWarning, label: 'Góp ý', tab: 'feedback' as TabId, color: 'text-rose-700 dark:text-rose-300 bg-rose-500/12 border-rose-500/20' },
              { icon: Calendar, label: 'Lịch ca', tab: 'schedule' as TabId, color: 'text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)] border-[var(--kg-primary)]/20' },
            ]
              .filter((act) => hasTabPermission(act.tab, currentUser))
              .map((act) => (
                <button
                  key={act.tab}
                  type="button"
                  onClick={() => onTabChange(act.tab)}
                  className="min-w-0 flex flex-col items-center p-2 sm:p-2.5 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/60 hover:bg-[var(--kg-surface-soft)] active:scale-95 transition-all text-center gap-1.5 min-h-[76px] justify-center touch-manipulation"
                >
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${act.color}`}>
                    <act.icon size={18} />
                  </div>
                  <span className="text-[11px] font-bold text-[var(--kg-text)] whitespace-nowrap truncate max-w-full">
                    {act.label}
                  </span>
                </button>
              ))}
          </div>
        </KgCard>

        {/* Personal Recent Activity Logs */}
        <KgCard className="p-4">
          <div className="flex items-center justify-between mb-3 border-b border-[var(--kg-border)] pb-2">
            <h3 className="text-xs font-extrabold text-[var(--kg-text)] uppercase tracking-wider">
              Lịch sử chấm công
            </h3>
            <button
              type="button"
              onClick={() => onTabChange('history')}
              className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline min-h-[44px] sm:min-h-[40px] px-2 inline-flex items-center"
            >
              Xem tất cả
            </button>
          </div>
          {recentLogs.length > 0 ? (
            <div className="space-y-2">
              {recentLogs.map((log, i) => {
                const isCheckin = isCheckInLabel(log.type);
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)]"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 text-xs ${
                          isCheckin ? 'bg-[var(--kg-success)]' : 'bg-[var(--kg-danger)]'
                        }`}
                      >
                        {isCheckin ? '→' : '←'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--kg-text)] truncate">
                          {log.type}
                        </p>
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
  );
}
