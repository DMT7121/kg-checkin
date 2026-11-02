import { lazy, Suspense, useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { computeWeekInfo, auditMissingCheckIns, type MissingCheckInAlert, ResponsiveShift, getPreviewShiftClass, getScheduleRegistrationWindow, isNextWeekScheduleRegistered, isScheduleRegistrationRequired, getScheduleRegistrationMeta } from '../utils/helpers';
import { refreshAppData } from '../utils/refreshData';
import { hasTabPermission, getTabLabel } from '../utils/permissions';
import {
  Camera, Calendar, Clock, ShieldAlert,
  Newspaper, GraduationCap,
  UtensilsCrossed, MessageSquareWarning,
  ClipboardCheck, Repeat, BellRing,
  CalendarClock, Banknote, Award,
  Users, CalendarRange,
  RefreshCw, CheckCircle2, UserCheck, AlertCircle, ArrowRight,
  Sun, Sunset, MoonStar, AlertTriangle, Sparkles, Smartphone, Layers
} from 'lucide-react';
import AppErrorBoundary from '../components/AppErrorBoundary';
import KgAppShell from '../components/KgAppShell';
import NewbieGuideModal from '../components/NewbieGuideModal';
import MissedCheckInModal from '../components/MissedCheckInModal';
import MandatoryScheduleModal from '../components/MandatoryScheduleModal';
import {
  KgCard,
  KgStatusBadge,
  KgMetricCard,
  KgAlertCard,
  KgFeatureTip
} from '../components/KgDesignSystem';
import { APP_CODENAME, APP_RELEASE_DATE, APP_VERSION_TAG, openReleaseNotesModal } from '../config/releaseNotes';
import { moduleLoaders } from '../config/moduleRegistry';
import type { TabId } from '../types/navigation';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function lazyWithRetry<T extends { default: React.ComponentType<any> }>(loader: () => Promise<T>) {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await loader();
      } catch (error) {
        lastError = error;
        await wait(250 * (attempt + 1));
      }
    }
    throw lastError;
  });
}

const AttendanceHub = lazyWithRetry(moduleLoaders.attendance);
const WorkforceHub = lazyWithRetry(moduleLoaders.workforce);
const WorkHub = lazyWithRetry(moduleLoaders.work);
const IncomeHub = lazyWithRetry(moduleLoaders.income);
const CommunicationsHub = lazyWithRetry(moduleLoaders.communications);
const KnowledgeHub = lazyWithRetry(moduleLoaders.knowledge);
const AdminPeopleHub = lazyWithRetry(moduleLoaders.admin_people);
const AdminWorkforceHub = lazyWithRetry(moduleLoaders.admin_workforce);
const AdminWorkHub = lazyWithRetry(moduleLoaders.admin_work);
const AdminIncomeHub = lazyWithRetry(moduleLoaders.admin_income);
const AdminSystemHub = lazyWithRetry(moduleLoaders.admin_system);
const CheckIn = lazyWithRetry(moduleLoaders.checkin);
const Profile = lazyWithRetry(moduleLoaders.profile);

const prefetchedModules = new Set<string>();

const prefetchModule = (tab: string): Promise<unknown> => {
  const loader = moduleLoaders[tab as keyof typeof moduleLoaders];
  if (!loader || prefetchedModules.has(tab)) return Promise.resolve();
  prefetchedModules.add(tab);
  const request = loader();
  request.catch(() => prefetchedModules.delete(tab));
  return request;
};

const prefetchModuleScreens = async (isAdmin: boolean, isSlowConnection: boolean) => {
  const queue = isAdmin
    ? ['admin_people', 'admin_workforce', 'admin_work', 'admin_income', 'admin_system']
    : ['checkin', 'workforce', 'income', 'work', 'attendance'];
  const allowedQueue = isSlowConnection ? queue.slice(0, 2) : queue;

  await Promise.all(allowedQueue.slice(0, 3).map(async (tab) => prefetchModule(tab)));
  if (allowedQueue.length > 3) {
    await wait(700);
    allowedQueue.slice(3).forEach(prefetchModule);
  }
};

const AccessDeniedPage = ({ tabTitle }: { tabTitle: string }) => (
  <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in">
    <div className="w-16 h-16 rounded-2xl bg-[var(--kg-danger-soft)] flex items-center justify-center mb-4 border border-[var(--kg-danger)]/20">
      <ShieldAlert size={30} className="text-[var(--kg-danger)]" />
    </div>
    <h2 className="text-lg sm:text-xl font-bold text-[var(--kg-text)] mb-2">Không có quyền truy cập</h2>
    <p className="text-sm text-[var(--kg-text-muted)] max-w-sm leading-relaxed">
      Vị trí làm việc hoặc phân quyền tài khoản của bạn hiện tại không được phép truy cập phân hệ <b>{tabTitle}</b>.
    </p>
    <p className="text-xs text-[var(--kg-text-soft)] mt-2">
      Vui lòng liên hệ với Ban Quản Lý để điều chỉnh nếu đây là một sự nhầm lẫn.
    </p>
  </div>
);

const TabFallback = () => (
  <div className="p-4 md:p-6 space-y-4">
    <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 md:p-6 overflow-hidden shadow-card">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--kg-primary-soft)] flex items-center justify-center">
            <RefreshCw size={18} className="animate-spin text-[var(--kg-primary)]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--kg-text)]">Đang mở phân hệ</p>
            <p className="text-xs text-[var(--kg-text-muted)]">Dữ liệu giao diện đang được tải...</p>
          </div>
        </div>
        <div className="hidden sm:block h-1.5 w-28 rounded-full bg-[var(--kg-surface-soft)] overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-[var(--kg-primary)] animate-pulse" />
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-3">
            <div className="h-3 w-20 rounded bg-[var(--kg-border)] animate-pulse mb-3" />
            <div className="h-6 w-16 rounded bg-[var(--kg-border)] animate-pulse" />
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-xl bg-[var(--kg-surface-soft)] animate-pulse" />
        ))}
      </div>
    </div>
  </div>
);

const ModuleRecoverFallback = ({ onRetry, onGoHome }: { onRetry?: () => void; onGoHome?: () => void }) => {
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  return (
    <div className="p-4 md:p-6">
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h3 className="text-base font-extrabold text-[var(--kg-text)]">Khôi phục giao diện module</h3>
          <p className="text-sm text-[var(--kg-text-muted)] mt-1">
            Đã xảy ra sự cố khi tải dữ liệu module. Bạn có thể thử nạp lại hoặc quay lại trang Hôm nay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-[var(--kg-primary)] text-white hover:brightness-105 active:scale-98 transition inline-flex items-center justify-center gap-2 shadow-xs"
            >
              <RefreshCw size={15} /> Thử nạp lại
            </button>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-[var(--kg-primary)] text-white hover:brightness-105 active:scale-98 transition inline-flex items-center justify-center gap-2 shadow-xs"
            >
              <RefreshCw size={15} /> Làm mới
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (onGoHome) onGoHome();
              else {
                setCurrentTab('dashboard');
                window.scrollTo({ top: 0, behavior: 'instant' });
              }
            }}
            className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-[var(--kg-surface-soft)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:bg-[var(--kg-border)]/30 active:scale-98 transition"
          >
            Về Hôm nay
          </button>
        </div>
      </div>
    </div>
  );
};

const DashboardOverview = ({ onTabChange }: { onTabChange: (tab: TabId) => void }) => {
  const store = useAppStore(
    useShallow((s) => ({
      currentUser: s.currentUser,
      currentTab: s.currentTab,
      stats: s.stats,
      logs: s.logs,
      approvedShifts: s.approvedShifts,
      currentWeekApprovedShifts: s.currentWeekApprovedShifts,
      isScheduleRegistered: s.isScheduleRegistered,
      registeredShifts: s.registeredShifts,
      registeredWeekKey: s.registeredWeekKey,
      scheduleUpdatedAt: s.scheduleUpdatedAt,
      setSwapRequests: s.setSwapRequests,
      setAdvances: s.setAdvances,
      setAdminSchedules: s.setAdminSchedules,
      users: s.users,
      swapRequests: s.swapRequests,
      advances: s.advances,
      currentTime: s.currentTime,
      todayChecklistDone: s.todayChecklistDone,
      todayHandoverDone: s.todayHandoverDone,
      soldOutItems: s.soldOutItems,
      pendingFeedbackCount: s.pendingFeedbackCount,
    }))
  );
  const { currentUser } = store;
  const isAdmin = currentUser?.role === 'admin';
  const { stats, logs, approvedShifts, currentWeekApprovedShifts } = store;
  const recentLogs = logs.filter(l => l.fullname === currentUser?.fullname).slice(0, 3);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isMissedModalOpen, setIsMissedModalOpen] = useState(false);
  const [pendingMissedClaims, setPendingMissedClaims] = useState<any[]>([]);

  const missingAlerts = auditMissingCheckIns(logs, currentUser);
  const [selectedMissingAlert, setSelectedMissingAlert] = useState<MissingCheckInAlert | null>(null);

  const loadDashboardPendingClaims = () => {
    if (!currentUser?.username) return;
    callApi('GET_MISSED_CHECKINS', { username: currentUser.username, role: currentUser.role }, { background: true }).then((res) => {
      if (res?.ok && Array.isArray(res.data)) {
        setPendingMissedClaims(res.data.filter((c: any) => c.status === 'Pending'));
      }
    });
  };

  const upcomingWeekInfo = computeWeekInfo();
  const regWindow = getScheduleRegistrationWindow();
  const requiresSchedule = isScheduleRegistrationRequired(currentUser);
  const nextWeekRegistered = isNextWeekScheduleRegistered(
    store.isScheduleRegistered,
    currentUser?.username,
    upcomingWeekInfo,
    store.registeredShifts,
    store.registeredWeekKey
  );
  const scheduleMeta = getScheduleRegistrationMeta(currentUser?.username, upcomingWeekInfo);
  const expectedUpcomingKey = `${upcomingWeekInfo.monthSheet}|${upcomingWeekInfo.weekLabel}`;
  const effectiveScheduleUpdatedAt =
    store.registeredWeekKey === expectedUpcomingKey && store.scheduleUpdatedAt
      ? store.scheduleUpdatedAt
      : scheduleMeta?.updatedAt || '';
  const shouldPromptSchedule = requiresSchedule && regWindow.isMandatoryWindow && !nextWeekRegistered;



  useEffect(() => {
    loadDashboardPendingClaims();
  }, [currentUser?.username]);

  // Auto show onboarding modal for first-time users (defer while mandatory schedule registration is active)
  useEffect(() => {
    if (currentUser?.username && !shouldPromptSchedule && store.currentTab === 'dashboard') {
      const isCompleted = localStorage.getItem(`kg_onboarding_completed_${currentUser.username}`);
      const isNever = localStorage.getItem(`kg_onboarding_never_${currentUser.username}`);
      if (!isCompleted && !isNever) {
        const timer = setTimeout(() => {
          setIsGuideOpen(true);
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [currentUser?.username, shouldPromptSchedule, store.currentTab]);

  // Determine today's shift (strictly current week, falling back only if legacy endpoint)
  const todayDay = new Date().getDay();
  const dayIdx = todayDay === 0 ? 6 : todayDay - 1; // 0=Mon, 6=Sun
  const effectiveTodayShifts = currentWeekApprovedShifts ?? approvedShifts;
  const todayShift = effectiveTodayShifts ? effectiveTodayShifts[dayIdx] : 'Chưa xếp ca';
  const isOff = !todayShift || todayShift === 'OFF' || todayShift === 'Chưa xếp ca';

  const [dashboardSchedules, setDashboardSchedules] = useState<any[]>([]);

  // Admin shift logic (current week so today's staffing counts & EmployeeAttendanceMonitor match today)
  useEffect(() => {
    if (isAdmin) {
      const weekInfo = computeWeekInfo(undefined, false);
      callApi('GET_ALL_SCHEDULES', { monthSheet: weekInfo.monthSheet, weekLabel: weekInfo.weekLabel }, { background: true }).then((res) => {
        if (res?.ok) {
          const parsedSchedules = Array.isArray(res.data) ? res.data : (res.data.schedules || []);
          const cleanSchedules = parsedSchedules.map((emp: any) => {
            const shifts: string[] = [];
            (emp.shifts || []).forEach((s: string, idx: number) => {
              if (s && s.includes('\n')) shifts[idx] = s.split('\n')[0].trim();
              else shifts[idx] = s;
            });
            return { ...emp, shifts };
          });
          setDashboardSchedules(cleanSchedules);
          store.setAdminSchedules(cleanSchedules);
        }
      });
      // Fetch approval queue for Admin
      callApi('GET_SWAP_REQUESTS', { username: currentUser!.username, role: currentUser!.role }, { background: true }).then((res) => {
        if (res?.ok) store.setSwapRequests(res.data);
      });
      callApi('GET_ADVANCES', { username: currentUser!.username, role: currentUser!.role }, { background: true }).then((res) => {
        if (res?.ok) store.setAdvances(res.data);
      });
    }
  }, [isAdmin, currentUser]);

  const shiftCounts: Record<string, number> = {};
  let waitstaffCount = 0;
  let otherCount = 0;

  if (isAdmin && dashboardSchedules.length > 0) {
    dashboardSchedules.forEach((emp) => {
      const shift = emp.shifts ? emp.shifts[dayIdx] : 'OFF';
      if (shift && shift !== 'OFF') {
        shiftCounts[shift] = (shiftCounts[shift] || 0) + 1;
        const userObj = store.users.find((u) => u.fullname === emp.fullname);
        const position = userObj?.position?.toLowerCase() || 'phục vụ';
        if (position.includes('phục vụ')) waitstaffCount++;
        else otherCount++;
      }
    });
  }

  const pendingLeaves = store.swapRequests.filter(req => req.status === 'Pending_Admin' && req.targetUsername === 'ADMIN');
  const pendingSwaps = store.swapRequests.filter(req => req.status === 'Pending_Admin' && req.targetUsername !== 'ADMIN');
  const pendingAdvances = store.advances.filter(adv => adv.status === 'Pending');
  const hasPendingApprovals = isAdmin && (pendingLeaves.length > 0 || pendingSwaps.length > 0 || pendingAdvances.length > 0);

  // Discrepancy Logic
  const todayPrefix = String(new Date().getDate()).padStart(2, '0') + '/' + String(new Date().getMonth() + 1).padStart(2, '0') + '/' + new Date().getFullYear();
  const checkinMap = new Map();
  store.logs.forEach(l => {
    if (l.time.startsWith(todayPrefix)) {
      if (!checkinMap.has(l.fullname)) checkinMap.set(l.fullname, []);
      checkinMap.get(l.fullname).push(l);
    }
  });

  const scheduledToday = dashboardSchedules.map(emp => {
    const shift = emp.shifts[dayIdx];
    if (shift && shift !== 'OFF' && shift !== 'OFF#') return { fullname: emp.fullname, shift };
    return null;
  }).filter(Boolean) as { fullname: string; shift: string }[];

  const notArrived = scheduledToday.filter(emp => {
    const userLogs = checkinMap.get(emp.fullname) || [];
    const hasIn = userLogs.some((l: any) => l.type.includes('Vào ca') || l.type.includes('IN'));
    return !hasIn;
  });

  const lateArrived = scheduledToday.filter(emp => {
    const userLogs = checkinMap.get(emp.fullname) || [];
    return userLogs.some((l: any) => l.type.includes('Trễ'));
  });

  // Check user's check-in/out status for today
  const userTodayLogs = store.logs.filter(l => l.fullname === currentUser?.fullname && l.time.startsWith(todayPrefix));
  const userHasIn = userTodayLogs.some(l => l.type.includes('Vào ca') || l.type.includes('IN'));
  const userHasOut = userTodayLogs.some(l => l.type.includes('Ra ca') || l.type.includes('OUT'));

  // Work status text
  let statusText = 'Chưa vào ca';
  let statusVariant: 'success' | 'warning' | 'error' | 'info' | 'neutral' = 'error';
  if (isOff) {
    statusText = 'Hôm nay OFF';
    statusVariant = 'neutral';
  } else if (userHasOut) {
    statusText = 'Đã ra ca';
    statusVariant = 'neutral';
  } else if (userHasIn) {
    statusText = 'Đã vào ca';
    statusVariant = 'success';
  }

  return (
    <div className="space-y-5 animate-fade-in pb-10">


      {/* Mandatory Schedule Alert Banner on Dashboard during T5, T6, T7 before 17:00 */}
      {shouldPromptSchedule && (
        <div className="p-4 rounded-2xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/35 text-[var(--kg-text)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center flex-shrink-0">
              <CalendarClock size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/20">
                  Bắt buộc
                </span>
                <span className="text-xs font-bold text-[var(--kg-text)]">
                  Bạn chưa đăng ký lịch làm tuần tiếp theo!
                </span>
              </div>
              <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 font-medium">
                {regWindow.message}. Vui lòng đăng ký đủ ca các ngày trong tuần trước 17:00 Thứ Bảy để BQL sắp xếp ca.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onTabChange('schedule')}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors active:scale-95 touch-manipulation whitespace-nowrap flex-shrink-0 min-h-[40px]"
          >
            Đăng ký ca ngay →
          </button>
        </div>
      )}

      {/* Render USER Today Hub */}
      {!isAdmin ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* Left side: Hero card & Actions */}
          <div className="lg:col-span-7 space-y-4">
            {/* Personal Operational Shift Card (v4.0 Warm Hospitality Midnight × Grill Ember) */}
            <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#0B253C] dark:bg-[#131926] p-4 sm:p-5 text-white shadow-[0_16px_36px_-14px_rgba(11,37,60,0.45)] border border-white/10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 -top-12 w-48 h-48 rounded-full bg-[#C8432B]/25 blur-3xl"
              />
              <div className="relative z-10 flex flex-col justify-between h-full space-y-3.5">
                <div className="flex items-center justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div className="w-11 h-11 rounded-2xl bg-[#B83821] border border-white/20 flex items-center justify-center font-extrabold text-base sm:text-lg text-white flex-shrink-0 shadow-xs">
                      {currentUser?.fullname.charAt(0) || 'K'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white/85 text-[10.5px] sm:text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 overflow-hidden">
                        <span className="inline-flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                          {(() => {
                            const h = new Date().getHours();
                            if (h >= 5 && h < 12) return <><Sun size={12} className="text-amber-300" /> Chào buổi sáng</>;
                            if (h >= 12 && h < 18) return <><Sunset size={12} className="text-amber-300" /> Chào buổi chiều</>;
                            return <><MoonStar size={12} className="text-sky-300" /> Chào buổi tối</>;
                          })()}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-white/50 flex-shrink-0" />
                        <span className="truncate text-amber-300 font-bold">
                          {currentUser?.position || 'Nhân sự'}
                        </span>
                      </p>
                      <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white truncate mt-0.5">
                        {currentUser?.fullname || currentUser?.username}
                      </h2>
                    </div>
                  </div>

                  {/* Operational Time & Date pill */}
                  <div className="flex-shrink-0 bg-black/30 border border-white/15 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 flex flex-col items-end justify-center">
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2 flex-shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                      </span>
                      <span className="text-xs sm:text-base font-extrabold font-mono tabular-nums text-white leading-none">
                        {store.currentTime ? store.currentTime.split(' ').pop() : `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium font-mono tabular-nums text-white/80 whitespace-nowrap block text-right mt-1 leading-none">
                      {(() => {
                        const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                        const now = new Date();
                        return `${dayNames[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
                      })()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-black/25 rounded-xl p-3 border border-white/15">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">Ca làm hôm nay</p>
                    <div className="mt-1">
                      {!todayShift || todayShift === 'OFF' ? (
                        <span className="text-xs sm:text-sm font-bold text-white/95">Nghỉ ca (OFF)</span>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs sm:text-sm font-bold shadow-xs ${getPreviewShiftClass(todayShift)}`}>
                          <ResponsiveShift shift={todayShift} />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/75">Trạng thái</p>
                    <div className="mt-1 flex justify-end">
                      <KgStatusBadge variant={statusVariant}>
                        {statusText}
                      </KgStatusBadge>
                    </div>
                  </div>
                </div>

                {/* v4.0.0 Release Center Inline Strip */}
                <button
                  type="button"
                  onClick={() => openReleaseNotesModal('all')}
                  className="w-full min-h-[42px] rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3 py-2 flex items-center justify-between gap-2 text-left transition-colors active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-[#B83821] text-white text-[10px] font-extrabold font-mono tabular-nums flex-shrink-0">
                      {APP_VERSION_TAG}
                    </span>
                    <span className="text-xs font-semibold text-white truncate">
                      Giao diện mới 100% • Xem nâng cấp &amp; chỉnh sửa
                    </span>
                  </div>
                  <ArrowRight size={14} className="text-amber-300 flex-shrink-0" />
                </button>
              </div>
            </div>

            {/* Primary Check-In CTA (Terracotta Grill Ember Signature Action) */}
            {isOff ? (
              <KgAlertCard variant="info" icon={Calendar}>
                Hôm nay bạn không có ca làm việc nào được xếp. Chúc bạn có một ngày nghỉ vui vẻ!
              </KgAlertCard>
            ) : userHasOut ? (
              <KgAlertCard variant="success" icon={CheckCircle2}>
                Bạn đã hoàn thành chấm công ra ca hôm nay. Hẹn gặp lại vào ca làm việc tiếp theo!
              </KgAlertCard>
            ) : (
              <button
                type="button"
                onClick={() => onTabChange('checkin')}
                className={`w-full py-4 px-5 rounded-2xl font-extrabold text-sm sm:text-base tracking-wide uppercase text-white shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 min-h-[56px] ${
                  userHasIn
                    ? 'bg-rose-700 hover:bg-rose-800'
                    : 'bg-[#B83821] hover:bg-[#9E2F1B]'
                }`}
              >
                <Camera size={20} className="animate-pulse flex-shrink-0" />
                <span>{userHasIn ? 'Bấm để Chấm Ra Ca' : 'Chấm Công Vào Ca Ngay'}</span>
              </button>
            )}

            {/* Quick Newbie Guide Banner */}
            <div className="p-3.5 rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)] border border-[var(--kg-accent)]/20 flex items-center justify-center flex-shrink-0">
                  <GraduationCap size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-[var(--kg-text)] truncate">
                    Cẩm nang nhân sự mới
                  </p>
                  <p className="text-[11px] text-[var(--kg-text-muted)] font-medium truncate">
                    Quy trình chấm công, xếp lịch &amp; tiêu chuẩn ca trực
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-bold shadow-xs active:scale-95 transition-colors flex-shrink-0 flex items-center gap-1 min-h-[40px]"
              >
                <span>Xem ngay</span> <ArrowRight size={13} />
              </button>
            </div>

            {/* Pending Missed Claims Warning Card on Dashboard */}
            {pendingMissedClaims.length > 0 && (
              <div
                onClick={() => setIsMissedModalOpen(true)}
                className="p-3.5 rounded-2xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/35 cursor-pointer hover:brightness-[0.98] transition-all flex items-center justify-between gap-3 shadow-xs animate-slide-up"
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
              </div>
            )}

            {/* Detected Missing Check-in Shifts Alert on Dashboard */}
            {missingAlerts.length > 0 && (
              <div
                onClick={() => {
                  setSelectedMissingAlert(missingAlerts[0]);
                  setIsMissedModalOpen(true);
                }}
                className="p-3.5 rounded-2xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/35 cursor-pointer hover:brightness-[0.98] transition-all flex items-center justify-between gap-3 shadow-xs animate-slide-up"
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
              </div>
            )}

            <KgCard className="p-4 sm:p-5">
              <div className="flex items-center justify-between border-b border-[var(--kg-border)] pb-2.5 mb-3.5">
                <h3 className="text-sm font-black text-[var(--kg-text)] uppercase tracking-wider">
                  Việc cần làm hôm nay
                </h3>
                <KgFeatureTip
                  title="Hướng dẫn Việc cần làm hôm nay"
                  tips={[
                    "Checklist: Kiểm tra và đánh dấu đầy đủ các khu vực trước khi bắt đầu hoặc kết thúc ca làm.",
                    "Sổ Bàn giao ca: Bắt buộc đếm quỹ tiền mặt, ghi nhận tồn kho và sự cố trước khi giao ca.",
                    "Đăng ký lịch làm: Hạn chót 17:00 Thứ 7 hàng tuần để AI và Quản lý sắp xếp đội hình tối ưu."
                  ]}
                  variant="badge"
                  triggerText="Lưu ý"
                  size="sm"
                />
              </div>
              <div className="space-y-3">
                {/* Checklist item */}
                {hasTabPermission('checklist', currentUser) && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] gap-2.5">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${store.todayChecklistDone ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50'}`}>
                        <ClipboardCheck size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-[var(--kg-text)] truncate">Checklist Vận Hành Hôm Nay</p>
                        <p className="text-[10.5px] text-[var(--kg-text-muted)] font-medium truncate">
                          {store.todayChecklistDone ? '100% hoàn thành tất cả hạng mục ca' : 'Chưa hoàn thành đầy đủ hạng mục'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 pl-12 sm:pl-0">
                      {store.todayChecklistDone ? (
                        <KgStatusBadge variant="success">✓ Đã nộp</KgStatusBadge>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onTabChange('checklist')}
                          className="px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center gap-1 min-h-[40px]"
                        >
                          Làm Checklist ngay →
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Handover item */}
                {hasTabPermission('handover', currentUser) && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] gap-2.5">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${store.todayHandoverDone ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400 border border-rose-200/50'}`}>
                        <Repeat size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-[var(--kg-text)] truncate">Sổ Bàn Giao Ca</p>
                        <p className="text-[10.5px] text-[var(--kg-text-muted)] font-medium truncate">Bàn giao quỹ tiền mặt, tồn kho, sự cố</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 pl-12 sm:pl-0">
                      {store.todayHandoverDone ? (
                        <KgStatusBadge variant="success">✓ Hoàn thành</KgStatusBadge>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onTabChange('handover')}
                          className="px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center gap-1 min-h-[40px]"
                        >
                          Ghi sổ ngay →
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Register Schedule item */}
                {hasTabPermission('schedule', currentUser) && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] gap-2.5">
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        nextWeekRegistered
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200/50'
                      }`}>
                        <Calendar size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-[var(--kg-text)] leading-snug">
                          {nextWeekRegistered
                            ? `Đã đăng ký lịch làm tuần ${upcomingWeekInfo.weekDisplay}`
                            : `Đăng Ký Lịch Tuần ${upcomingWeekInfo.weekDisplay}`}
                        </p>
                        <p className="text-[10.5px] text-[var(--kg-text-muted)] font-medium leading-snug mt-0.5">
                          {nextWeekRegistered ? (
                            effectiveScheduleUpdatedAt ? (
                              <>
                                Ghi nhận gần nhất: <span className="font-mono tabular-nums font-bold text-[var(--kg-text)]">{effectiveScheduleUpdatedAt}</span>
                              </>
                            ) : store.approvedShifts && store.approvedShifts.length > 0 ? (
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
                    <div className="flex items-center justify-between sm:justify-end gap-2 pl-12 sm:pl-0">
                      {nextWeekRegistered && store.approvedShifts && store.approvedShifts.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <KgStatusBadge variant="success">✓ Đã duyệt</KgStatusBadge>
                          <button
                            type="button"
                            onClick={() => onTabChange('schedule')}
                            className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline whitespace-nowrap min-h-[40px] px-2 inline-flex items-center"
                          >
                            Xem lịch →
                          </button>
                        </div>
                      ) : nextWeekRegistered ? (
                        <div className="flex items-center gap-2">
                          <KgStatusBadge variant="warning">Chờ duyệt</KgStatusBadge>
                          <button
                            type="button"
                            onClick={() => onTabChange('schedule')}
                            className="text-xs font-bold text-[var(--kg-warning)] hover:underline whitespace-nowrap min-h-[40px] px-2 inline-flex items-center"
                          >
                            Xem / Sửa →
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onTabChange('schedule')}
                          className="px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center gap-1 whitespace-nowrap min-h-[40px]"
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

          {/* Right side: Super-App Launcher & Recent activity */}
          <div className="lg:col-span-5 space-y-4">
            {/* Super-App 4-Column Quick Launcher */}
            <KgCard className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-extrabold text-[var(--kg-text)] uppercase tracking-wider">
                  Tiện ích nhanh Super-App
                </h3>
                <span className="text-[10.5px] font-bold font-mono tabular-nums text-[var(--kg-accent-ink)]">
                  {APP_VERSION_TAG}
                </span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-3 gap-2">
                {[
                  { icon: Newspaper, label: 'Bảng tin', tab: 'news' as any, color: 'text-sky-700 dark:text-sky-300 bg-sky-500/12 border-sky-500/20' },
                  { icon: UtensilsCrossed, label: 'Món hết', tab: 'soldout' as any, color: 'text-amber-700 dark:text-amber-300 bg-amber-500/12 border-amber-500/20' },
                  { icon: Award, label: 'Thi đua', tab: 'reward' as any, color: 'text-[var(--kg-accent-ink)] bg-[var(--kg-accent-soft)] border-[var(--kg-accent)]/20' },
                  { icon: Banknote, label: 'Phiếu lương', tab: 'payroll' as any, color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/12 border-emerald-500/20' },
                  { icon: MessageSquareWarning, label: 'Góp ý', tab: 'feedback' as any, color: 'text-rose-700 dark:text-rose-300 bg-rose-500/12 border-rose-500/20' },
                  { icon: Calendar, label: 'Lịch ca', tab: 'schedule' as any, color: 'text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)] border-[var(--kg-primary)]/20' },
                ].filter(act => hasTabPermission(act.tab, currentUser)).map((act, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onTabChange(act.tab)}
                    className="flex flex-col items-center p-2 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/60 hover:bg-[var(--kg-surface-soft)] active:scale-95 transition-all text-center gap-1.5 min-h-[76px] justify-center"
                  >
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${act.color}`}>
                      <act.icon size={18} />
                    </div>
                    <span className="text-[11px] font-bold text-[var(--kg-text)] whitespace-nowrap truncate max-w-full">
                      {act.label}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => openReleaseNotesModal('all')}
                  className="flex flex-col items-center p-2 rounded-2xl border border-[var(--kg-accent)]/30 bg-[var(--kg-accent-soft)]/70 hover:bg-[var(--kg-accent-soft)] active:scale-95 transition-all text-center gap-1.5 min-h-[76px] justify-center"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#B83821] text-white flex items-center justify-center shadow-xs">
                    <Sparkles size={18} />
                  </div>
                  <span className="text-[11px] font-extrabold text-[var(--kg-accent-ink)] whitespace-nowrap truncate max-w-full">
                    Bản mới
                  </span>
                </button>
              </div>
            </KgCard>

            {/* Personal Recent Activity Logs */}
            <KgCard className="p-4">
              <div className="flex items-center justify-between mb-3 border-b border-[var(--kg-border)] pb-2">
                <h3 className="text-xs font-extrabold text-[var(--kg-text)] uppercase tracking-wider">Lịch sử chấm công</h3>
                <button
                  type="button"
                  onClick={() => onTabChange('history')}
                  className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline min-h-[40px] px-2 inline-flex items-center"
                >
                  Xem tất cả
                </button>
              </div>
              {recentLogs.length > 0 ? (
                <div className="space-y-2">
                  {recentLogs.map((log, i) => {
                    const isCheckin = log.type.includes('Vào ca') || log.type.includes('IN');
                    return (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)]">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 text-xs ${isCheckin ? 'bg-[var(--kg-success)]' : 'bg-[var(--kg-danger)]'}`}>
                            {isCheckin ? '→' : '←'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[var(--kg-text)] truncate">{log.type}</p>
                            <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] truncate">{log.time}</p>
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
      ) : (
        /* Render ADMIN Today Hub (v4.0 Warm Hospitality Executive Command Center) */
        <div className="space-y-4 sm:space-y-5">
          {/* Executive Shift Command Hero + v4.0.0 Release Spotlight */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#0B253C] dark:bg-[#131926] border border-white/10 p-4 sm:p-6 text-white shadow-[0_18px_42px_-16px_rgba(11,37,60,0.45)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-14 -top-14 w-56 h-56 rounded-full bg-[#C8432B]/25 blur-3xl"
            />
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-[#B83821] border border-white/20 flex items-center justify-center font-extrabold text-lg text-white shadow-xs flex-shrink-0">
                  {currentUser?.fullname?.charAt(0) || 'Q'}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 border border-white/15 text-[11px] font-extrabold uppercase tracking-wider text-amber-200">
                      Trung tâm điều hành ca trực
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-200">
                      {(() => {
                        const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                        const now = new Date();
                        return `${dayNames[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
                      })()}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight text-white truncate mt-1">
                    Xin chào, {currentUser?.fullname || 'Ban Quản Lý'}
                  </h2>
                  <p className="text-xs text-slate-200/90 mt-0.5 truncate">
                    {APP_CODENAME} • Giám sát nhân sự, đối soát công lương &amp; phê duyệt thời gian thực
                  </p>
                </div>
              </div>

              {/* Interactive v4.0.0 Release Notes Card right on Admin Hero */}
              <button
                type="button"
                onClick={() => openReleaseNotesModal('all')}
                className="w-full lg:w-auto min-h-[48px] rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 px-3.5 py-2.5 text-left flex items-center justify-between gap-3 transition-all active:scale-[0.99] flex-shrink-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-[#B83821] text-white text-[10.5px] font-extrabold font-mono tabular-nums inline-flex items-center gap-1">
                      <Sparkles size={11} /> {APP_VERSION_TAG}
                    </span>
                    <span className="text-[11px] font-semibold text-amber-200 font-mono tabular-nums">
                      {APP_RELEASE_DATE}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-white mt-1 truncate">
                    Xem nâng cấp thêm gì &amp; chỉnh sửa bản mới
                  </p>
                </div>
                <ArrowRight size={16} className="text-white flex-shrink-0" />
              </button>
            </div>
          </div>

          {/* Top Bento KPI Row (Zero Mobile Truncation) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KgMetricCard
              title="Nhân viên có ca"
              value={scheduledToday.length}
              icon={Users}
              variant="info"
            />
            <KgMetricCard
              title="Đã vào ca"
              value={scheduledToday.length - notArrived.length}
              icon={UserCheck}
              variant="success"
            />
            <KgMetricCard
              title="Vắng / Chưa đến"
              value={notArrived.length}
              icon={AlertCircle}
              variant="error"
              className={notArrived.length > 0 ? 'border-[var(--kg-danger)]/35 bg-[var(--kg-danger-soft)]/30' : ''}
            />
            <KgMetricCard
              title="Đi trễ"
              value={lateArrived.length}
              icon={ShieldAlert}
              variant="warning"
              className={lateArrived.length > 0 ? 'border-[var(--kg-warning)]/35 bg-[var(--kg-warning-soft)]/30' : ''}
            />
          </div>

          {/* Dashboard Asymmetric Bento Grid for Admin */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
            {/* Left Column: Alerts, operational checklists, sold-out */}
            <div className="lg:col-span-8 space-y-4">
              {/* Discrepancy details */}
              {(notArrived.length > 0 || lateArrived.length > 0) && (
                <KgCard className="p-4 sm:p-5">
                  <h3 className="text-sm font-bold text-[var(--kg-text)] uppercase tracking-wider mb-4 border-b border-[var(--kg-border)] pb-2 flex items-center">
                    <ShieldAlert size={16} className="text-[var(--kg-warning)] mr-2 flex-shrink-0" />
                    Cảnh báo vận hành hôm nay
                  </h3>
                  <div className="space-y-3.5">
                    {lateArrived.length > 0 && (
                      <KgAlertCard variant="warning" title="Nhân viên đi trễ" icon={Clock}>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {lateArrived.map((emp, i) => (
                            <span key={i} className="text-[11px] font-semibold bg-[var(--kg-surface)] border border-[var(--kg-warning)]/30 px-2 py-0.5 rounded-lg text-[var(--kg-text)]">
                              {emp.fullname}
                            </span>
                          ))}
                        </div>
                      </KgAlertCard>
                    )}
                    {notArrived.length > 0 && (
                      <KgAlertCard variant="error" title="Chưa thấy chấm công vào ca" icon={AlertCircle}>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {notArrived.map((emp, i) => (
                            <span key={i} className="text-[11px] font-semibold bg-[var(--kg-surface)] border border-[var(--kg-danger)]/30 px-2 py-0.5 rounded-lg text-[var(--kg-text)] inline-flex items-center gap-1.5">
                              <span>{emp.fullname}</span>
                              <span className={`px-1.5 py-0.2 rounded-md text-[9.5px] font-bold ${getPreviewShiftClass(emp.shift)}`}>
                                <ResponsiveShift shift={emp.shift} />
                              </span>
                            </span>
                          ))}
                        </div>
                      </KgAlertCard>
                    )}
                  </div>
                </KgCard>
              )}

              {/* Checklist & Handover compliance today */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                {/* Checklist widget */}
                <KgCard className="p-4 text-left hover:shadow-card transition-all flex flex-col justify-between min-h-[146px]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.todayChecklistDone ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]' : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'}`}>
                        <ClipboardCheck size={16} />
                      </div>
                      <span className="text-xs font-bold text-[var(--kg-text-muted)]">Checklist Vận Hành</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-lg font-extrabold text-[var(--kg-text)] leading-tight">
                      {store.todayChecklistDone ? 'Tất cả đã nộp' : 'Đang chờ nộp'}
                    </p>
                    <p className="text-[11px] text-[var(--kg-text-muted)] font-medium mt-1">
                      Hạng mục việc làm ca sáng &amp; tối
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTabChange('checklist')}
                    className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline mt-2 text-left min-h-[40px] inline-flex items-center"
                  >
                    Quản lý checklist →
                  </button>
                </KgCard>

                {/* Handover widget */}
                <KgCard className="p-4 text-left hover:shadow-card transition-all flex flex-col justify-between min-h-[146px]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.todayHandoverDone ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]' : 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'}`}>
                        <Repeat size={16} />
                      </div>
                      <span className="text-xs font-bold text-[var(--kg-text-muted)]">Sổ Bàn Giao Ca</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-lg font-extrabold text-[var(--kg-text)] leading-tight">
                      {store.todayHandoverDone ? 'Đã ghi nhận' : 'Chưa ghi bàn giao'}
                    </p>
                    <p className="text-[11px] text-[var(--kg-text-muted)] font-medium mt-1">
                      Sổ tay theo dõi quỹ &amp; sự cố ca làm việc
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTabChange('handover')}
                    className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline mt-2 text-left min-h-[40px] inline-flex items-center"
                  >
                    Xem sổ bàn giao →
                  </button>
                </KgCard>
              </div>

              {/* Sold out items report */}
              <KgCard className="p-4">
                <div className="flex items-center justify-between mb-2.5 border-b border-[var(--kg-border)] pb-2">
                  <div className="flex items-center space-x-2">
                    <UtensilsCrossed size={16} className="text-[var(--kg-warning)]" />
                    <h3 className="text-xs font-extrabold text-[var(--kg-text)] uppercase tracking-wider">Món hết hôm nay</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTabChange('soldout')}
                    className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline min-h-[40px] px-2 inline-flex items-center"
                  >
                    Xem thực đơn
                  </button>
                </div>
                {store.soldOutItems.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {store.soldOutItems.map((item) => (
                      <div key={item.id} className="bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 rounded-xl px-3 py-1.5 flex items-center space-x-2 text-xs">
                        <span className="font-bold text-amber-800 dark:text-amber-300">{item.itemName}</span>
                        <span className="text-[11px] text-[var(--kg-text-muted)] font-medium">({item.reportedBy} lúc <span className="font-mono tabular-nums">{item.reportedAt}</span>)</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--kg-text-muted)] py-2">Chưa báo món hết nào hôm nay</p>
                )}
              </KgCard>
            </div>

            {/* Right Column: Approvals, Quick Shortcuts & v4.0.0 Changelog Summary */}
            <div className="lg:col-span-4 space-y-4">
              {/* Approvals Widget */}
              {hasPendingApprovals ? (
                <KgCard className="p-4 border-[var(--kg-danger)]/25">
                  <div className="flex items-center space-x-2 mb-3 border-b border-[var(--kg-border)] pb-2">
                    <BellRing size={16} className="text-[var(--kg-danger)] animate-pulse" />
                    <h3 className="text-xs font-extrabold text-[var(--kg-text)] uppercase tracking-wider">Cần duyệt gấp</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {pendingSwaps.length > 0 && (
                      <button type="button" onClick={() => onTabChange('swap')} className="flex items-center justify-between p-3 rounded-xl bg-[var(--kg-success-soft)] border border-[var(--kg-success)]/20 text-[var(--kg-success)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px]">
                        <span>Đổi ca (<span className="font-mono tabular-nums">{pendingSwaps.length}</span>)</span>
                        <span>Chi tiết →</span>
                      </button>
                    )}
                    {pendingLeaves.length > 0 && (
                      <button type="button" onClick={() => onTabChange('swap')} className="flex items-center justify-between p-3 rounded-xl bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 text-[var(--kg-danger)] hover:brightness-95 transition-all text-xs font-bold min-h-[44px]">
                        <span>Yêu cầu xin nghỉ (<span className="font-mono tabular-nums">{pendingLeaves.length}</span>)</span>
                        <span>Chi tiết →</span>
                      </button>
                    )}
                    {pendingAdvances.length > 0 && (
                      <button type="button" onClick={() => onTabChange('advance')} className="flex items-center justify-between p-3 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-amber-800 dark:text-amber-300 hover:brightness-95 transition-all text-xs font-bold min-h-[44px]">
                        <span>Ứng lương (<span className="font-mono tabular-nums">{pendingAdvances.length}</span>)</span>
                        <span>Chi tiết →</span>
                      </button>
                    )}
                  </div>
                </KgCard>
              ) : (
                <KgCard className="p-4 text-center py-5 border-dashed">
                  <CheckCircle2 size={24} className="mx-auto mb-2 text-[var(--kg-success)] opacity-85" />
                  <p className="text-xs font-extrabold text-[var(--kg-text)]">Không có yêu cầu chờ duyệt</p>
                  <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5">Tất cả ca làm và ứng lương đã được giải quyết gọn gàng</p>
                </KgCard>
              )}

              {/* Feedback awaiting reply */}
              {store.pendingFeedbackCount > 0 && (
                <KgCard className="p-4 border-[var(--kg-danger)]/25">
                  <div className="flex justify-between items-center text-xs gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[var(--kg-danger-soft)] flex items-center justify-center text-[var(--kg-danger)] font-bold relative flex-shrink-0">
                        <MessageSquareWarning size={16} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--kg-danger)] rounded-full text-white text-[9px] font-mono tabular-nums font-bold flex items-center justify-center">{store.pendingFeedbackCount}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[var(--kg-text)] truncate">Góp ý chưa xử lý</p>
                        <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5"><span className="font-mono tabular-nums">{store.pendingFeedbackCount}</span> phản hồi cần trả lời</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => onTabChange('feedback')} className="text-xs font-bold text-[var(--kg-danger)] hover:underline min-h-[40px] px-2 inline-flex items-center flex-shrink-0">Trả lời →</button>
                  </div>
                </KgCard>
              )}

              {/* Admin Super-App Quick Shortcuts */}
              <KgCard className="p-4">
                <h3 className="text-xs font-extrabold text-[var(--kg-text)] uppercase tracking-wider mb-3">Điều hướng nhanh quản lý</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Phân ca', icon: CalendarRange, tab: 'admin_workforce' as any, color: 'text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)]' },
                    { label: 'Bảng công', icon: CalendarClock, tab: 'timesheet' as any, color: 'text-amber-700 dark:text-amber-300 bg-amber-500/12' },
                    { label: 'Bảng lương', icon: Banknote, tab: 'admin_income' as any, subTab: 'payroll', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/12' },
                    { label: 'Nhân sự', icon: Users, tab: 'hr_list' as any, color: 'text-[var(--kg-accent-ink)] bg-[var(--kg-accent-soft)]' },
                  ].map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        if ((item as any).subTab) {
                          try { sessionStorage.setItem(`kg_hub_subtab_${item.tab}`, (item as any).subTab); } catch { /* ignore */ }
                        }
                        onTabChange(item.tab);
                      }}
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/50 hover:bg-[var(--kg-surface-soft)] active:scale-[0.98] transition-colors text-xs font-bold text-[var(--kg-text)] min-h-[46px]"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                        <item.icon size={15} />
                      </div>
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              </KgCard>

              {/* Version Release Highlights Card right on Dashboard */}
              <KgCard className="p-4 bg-[var(--kg-accent-soft)]/45 border-[var(--kg-accent)]/25">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#B83821] text-white text-[10.5px] font-extrabold font-mono tabular-nums">
                    <Sparkles size={11} /> {APP_VERSION_TAG}
                  </span>
                  <span className="text-[11px] font-semibold font-mono tabular-nums text-[var(--kg-text-muted)]">
                    {APP_RELEASE_DATE}
                  </span>
                </div>
                <p className="text-xs font-extrabold text-[var(--kg-text)]">
                  Điểm khác biệt bản {APP_VERSION_TAG}
                </p>
                <div className="mt-2 space-y-1.5 text-[11.5px] text-[var(--kg-text-muted)]">
                  <p className="flex items-center gap-1.5">
                    <Layers size={13} className="text-[var(--kg-accent-ink)] flex-shrink-0" />
                    <span>Đổi mới 100% kiến trúc Warm Hospitality &amp; Rail 76px</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Smartphone size={13} className="text-[var(--kg-primary-ink)] flex-shrink-0" />
                    <span>Tối ưu khít mọi dòng điện thoại &amp; Nút AI Home ảo</span>
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openReleaseNotesModal('added')}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[11.5px] font-bold text-[var(--kg-text)] hover:border-[var(--kg-border-strong)] transition-colors"
                  >
                    + Nâng cấp thêm
                  </button>
                  <button
                    type="button"
                    onClick={() => openReleaseNotesModal('updated')}
                    className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#B83821] text-white text-[11.5px] font-bold hover:bg-[#9E2F1B] transition-colors"
                  >
                    Chỉnh sửa gì →
                  </button>
                </div>
              </KgCard>
            </div>
          </div>
        </div>
      )}

      {/* Newbie Guide Modal */}
      <NewbieGuideModal
        isOpen={isGuideOpen && !shouldPromptSchedule && store.currentTab === 'dashboard'}
        onClose={() => setIsGuideOpen(false)}
        onNavigateTab={onTabChange}
      />

      {/* Missed Check-in Modal */}
      {isMissedModalOpen && (
        <MissedCheckInModal
          isOpen={isMissedModalOpen}
          onClose={() => {
            setIsMissedModalOpen(false);
            setSelectedMissingAlert(null);
            loadDashboardPendingClaims();
          }}
          defaultType={selectedMissingAlert ? selectedMissingAlert.missingType : 'Vào ca'}
          defaultDate={selectedMissingAlert ? selectedMissingAlert.dateStr : undefined}
          defaultTime={selectedMissingAlert ? selectedMissingAlert.timeStr : undefined}
          defaultReason="Quên bấm máy khi vào việc gấp"
          onSuccess={loadDashboardPendingClaims}
        />
      )}
    </div>
  );
};

export default function Dashboard() {
  const currentTab = useAppStore(state => state.currentTab);
  const currentUser = useAppStore(state => state.currentUser);
  const isScheduleRegistered = useAppStore(state => state.isScheduleRegistered);
  const registeredShifts = useAppStore(state => state.registeredShifts);
  const registeredWeekKey = useAppStore(state => state.registeredWeekKey);
  const setCurrentTab = useAppStore(state => state.setCurrentTab);

  useEffect(() => {
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    const isSlowConnection = !!connection?.saveData || connection?.effectiveType === '2g';
    const isAdmin = currentUser?.role === 'admin';
    const run = () => prefetchModuleScreens(isAdmin, isSlowConnection);
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const timer = setTimeout(run, 1800);
    return () => clearTimeout(timer);
  }, [currentUser?.role]);

  const handleTabChange = (tab: TabId) => {
    prefetchModule(tab);
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
    const destination = useAppStore.getState().currentTab;
    if (destination === 'attendance' || destination === 'admin_system' || destination === 'dashboard') {
      refreshAppData();
    }
  };

  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set([currentTab]));

  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state) => {
      const nextTab = state.currentTab;
      setVisitedTabs(prev => {
        if (prev.has(nextTab)) return prev;
        const next = new Set(prev);
        next.add(nextTab);
        return next;
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const onPopState = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = (urlParams.get('tab') as TabId | null) || 'dashboard';
        if (useAppStore.getState().currentTab !== tabParam) {
          useAppStore.setState({ currentTab: tabParam });
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [workforceSubTab, setWorkforceSubTab] = useState<string>(() => {
    try {
      return sessionStorage.getItem('kg_hub_subtab_workforce') || 'schedule';
    } catch {
      return 'schedule';
    }
  });

  useEffect(() => {
    const syncWorkforceSubTab = (e: Event) => {
      const detail = (e as CustomEvent<{ hub: string; subTab: string }>).detail;
      if (detail?.hub === 'workforce' && detail.subTab) {
        setWorkforceSubTab(detail.subTab);
      }
    };
    window.addEventListener('kg:subtab-select', syncWorkforceSubTab);
    window.addEventListener('kg:subtab-changed', syncWorkforceSubTab);
    return () => {
      window.removeEventListener('kg:subtab-select', syncWorkforceSubTab);
      window.removeEventListener('kg:subtab-changed', syncWorkforceSubTab);
    };
  }, []);

  const hasAccess = hasTabPermission(currentTab, currentUser);

  const upcomingWeek = computeWeekInfo();
  const regWindow = getScheduleRegistrationWindow();
  const requiresSchedule = isScheduleRegistrationRequired(currentUser);
  const nextWeekRegistered = isNextWeekScheduleRegistered(
    isScheduleRegistered,
    currentUser?.username,
    upcomingWeek,
    registeredShifts,
    registeredWeekKey
  );
  const shouldPromptSchedule = requiresSchedule && regWindow.isMandatoryWindow && !nextWeekRegistered;
  const isRegisteringSchedule =
    currentTab === 'schedule' ||
    (currentTab === 'workforce' && workforceSubTab === 'schedule');

  return (
    <KgAppShell onPrefetch={prefetchModule}>
      {/* Uncloseable Mandatory Schedule Modal for Staff during T5, T6, T7 before 17:00 */}
      <MandatoryScheduleModal
        isOpen={shouldPromptSchedule && !isRegisteringSchedule}
        onGoToSchedule={() => {
          try {
            sessionStorage.setItem('kg_hub_subtab_workforce', 'schedule');
          } catch { /* ignore */ }
          setWorkforceSubTab('schedule');
          handleTabChange('schedule');
        }}
        windowStatus={regWindow}
        employeeName={currentUser?.fullname}
        targetWeekDisplay={upcomingWeek.weekDisplay}
      />
      <div className="h-full">
        {!hasAccess ? (
          <AccessDeniedPage tabTitle={getTabLabel(currentTab)} />
        ) : (
          <>
            {/* Dedicated mounting for CheckIn to cleanly manage camera stream */}
            {currentTab === 'checkin' && (
              <AppErrorBoundary
                resetKey="checkin"
                fallback={({ reset }) => (
                  <ModuleRecoverFallback onRetry={reset} onGoHome={() => handleTabChange('dashboard')} />
                )}
              >
                <Suspense fallback={<TabFallback />}>
                  <CheckIn />
                </Suspense>
              </AppErrorBoundary>
            )}

            {/* Keep-Alive for Data-driven Hubs & Modules */}
            {Array.from(new Set([...visitedTabs, currentTab])).map((tabId) => {
              if (tabId === 'checkin') return null;
              const isSelected = tabId === currentTab;
              return (
                <div
                  key={tabId}
                  className={isSelected ? 'block h-full animate-fade-in' : 'hidden'}
                  style={{ display: isSelected ? 'block' : 'none' }}
                >
                  <AppErrorBoundary
                    resetKey={tabId}
                    fallback={({ reset }) => (
                      <ModuleRecoverFallback onRetry={reset} onGoHome={() => handleTabChange('dashboard')} />
                    )}
                  >
                    <Suspense fallback={<TabFallback />}>
                      {tabId === 'dashboard' && <DashboardOverview onTabChange={handleTabChange} />}
                      {tabId === 'attendance' && <AttendanceHub />}
                      {tabId === 'workforce' && <WorkforceHub />}
                      {tabId === 'work' && <WorkHub />}
                      {tabId === 'income' && <IncomeHub />}
                      {tabId === 'communications' && <CommunicationsHub />}
                      {tabId === 'knowledge' && <KnowledgeHub />}
                      {tabId === 'admin_people' && <AdminPeopleHub />}
                      {tabId === 'admin_workforce' && <AdminWorkforceHub />}
                      {tabId === 'admin_work' && <AdminWorkHub />}
                      {tabId === 'admin_income' && <AdminIncomeHub />}
                      {tabId === 'admin_system' && <AdminSystemHub />}
                      {tabId === 'profile' && <Profile />}
                    </Suspense>
                  </AppErrorBoundary>
                </div>
              );
            })}
          </>
        )}
      </div>
    </KgAppShell>
  );
}
