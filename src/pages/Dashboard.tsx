import { lazy, Suspense, useState, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import {
  computeWeekInfo,
  auditMissingCheckIns,
  type MissingCheckInAlert,
  getScheduleRegistrationWindow,
  isNextWeekScheduleRegistered,
  isScheduleRegistrationRequired,
  getScheduleRegistrationMeta,
  isCheckInLabel,
  getVietnamDateParts,
  getRecommendedCheckInType,
  parseVietnamLogTimestampMs,
} from '../utils/helpers';
import { getWorkdayCycleBounds } from '../utils/attendanceSequence';
import { normalizeIncidentStatus } from '../utils/operationsReconciliation';
import { refreshAppData } from '../utils/refreshData';
import { hasTabPermission, getTabLabel, isAdminUser } from '../utils/permissions';
import { ShieldAlert, CalendarClock, RefreshCw } from 'lucide-react';
import AppErrorBoundary from '../components/AppErrorBoundary';
import KgAppShell from '../components/KgAppShell';
import EmployeeDashboardView from '../components/dashboard/EmployeeDashboardView';
import AdminDashboardView from '../components/dashboard/AdminDashboardView';
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

// Canonical 11-Hub Workspace Loaders
const AttendanceHub = lazyWithRetry(moduleLoaders.attendance);
const WorkforceHub = lazyWithRetry(moduleLoaders.workforce);
const WorkHub = lazyWithRetry(moduleLoaders.work);
const CommunicationsHub = lazyWithRetry(moduleLoaders.communications);
const KnowledgeHub = lazyWithRetry(moduleLoaders.knowledge);
const AdminOpsHub = lazyWithRetry(moduleLoaders.admin_ops);
const AdminPeoplePayHub = lazyWithRetry(moduleLoaders.admin_people_pay);
const AdminSystemHub = lazyWithRetry(moduleLoaders.admin_system);
const CheckIn = lazyWithRetry(moduleLoaders.checkin);
const Profile = lazyWithRetry(moduleLoaders.profile);
const MissedCheckInModal = lazyWithRetry(() => import('../components/MissedCheckInModal'));
const MandatoryScheduleModal = lazyWithRetry(() => import('../components/MandatoryScheduleModal'));

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
    ? ['admin_ops', 'admin_people_pay', 'admin_system', 'checkin']
    : ['checkin', 'workforce', 'work', 'attendance'];
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
    <h2 className="text-lg sm:text-xl font-bold text-[var(--kg-text)] mb-2">
      Không có quyền truy cập
    </h2>
    <p className="text-sm text-[var(--kg-text-muted)] max-w-sm leading-relaxed">
      Vị trí làm việc hoặc phân quyền tài khoản của bạn hiện tại không được phép truy cập phân hệ{' '}
      <b>{tabTitle}</b>.
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
          <div
            key={i}
            className="h-24 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-3"
          >
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

const ModuleRecoverFallback = ({
  onRetry,
  onGoHome,
}: {
  onRetry?: () => void;
  onGoHome?: () => void;
}) => {
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  return (
    <div className="p-4 md:p-6">
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h3 className="text-base font-extrabold text-[var(--kg-text)]">
            Khôi phục giao diện module
          </h3>
          <p className="text-sm text-[var(--kg-text-muted)] mt-1">
            Đã xảy ra sự cố khi tải dữ liệu module. Bạn có thể thử nạp lại hoặc quay lại trang Hôm
            nay.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-2 min-h-[44px] sm:min-h-[40px] text-xs sm:text-sm font-bold rounded-xl bg-[var(--kg-primary)] text-white hover:brightness-105 active:scale-98 transition inline-flex items-center justify-center gap-2 shadow-xs"
            >
              <RefreshCw size={15} /> Thử nạp lại
            </button>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 min-h-[44px] sm:min-h-[40px] text-xs sm:text-sm font-bold rounded-xl bg-[var(--kg-primary)] text-white hover:brightness-105 active:scale-98 transition inline-flex items-center justify-center gap-2 shadow-xs"
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
            className="px-4 py-2 min-h-[44px] sm:min-h-[40px] text-xs sm:text-sm font-bold rounded-xl bg-[var(--kg-surface-soft)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:bg-[var(--kg-border)]/30 active:scale-98 transition"
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
      logs: s.logs,
      approvedShifts: s.approvedShifts,
      currentWeekApprovedShifts: s.currentWeekApprovedShifts,
      isScheduleRegistered: s.isScheduleRegistered,
      registeredShifts: s.registeredShifts,
      registeredWeekKey: s.registeredWeekKey,
      scheduleUpdatedAt: s.scheduleUpdatedAt,
      swapRequests: s.swapRequests,
      advances: s.advances,
      todayChecklistDone: s.todayChecklistDone,
      todayHandoverDone: s.todayHandoverDone,
      soldOutItems: s.soldOutItems,
      pendingFeedbackCount: s.pendingFeedbackCount,
    }))
  );
  const { currentUser, logs, approvedShifts, currentWeekApprovedShifts } = store;
  const isAdmin = isAdminUser(currentUser);
  const recentLogs = logs.filter((l) => l.fullname === currentUser?.fullname).slice(0, 3);
  const [isMissedModalOpen, setIsMissedModalOpen] = useState(false);
  const [missedModalInitialTab, setMissedModalInitialTab] = useState<'create' | 'history' | 'admin'>('create');
  const [pendingMissedClaims, setPendingMissedClaims] = useState<any[]>([]);

  const navigateToHubSubTab = (hub: TabId, subTab: string) => {
    try {
      sessionStorage.setItem(`kg_hub_subtab_${hub}`, subTab);
    } catch {
      /* ignore */
    }
    onTabChange(hub);
    window.dispatchEvent(new CustomEvent('kg:subtab-select', { detail: { hub, subTab } }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('kg:subtab-select', { detail: { hub, subTab } }));
    }, 30);
  };

  const missingAlerts = auditMissingCheckIns(logs, currentUser);
  const [selectedMissingAlert, setSelectedMissingAlert] = useState<MissingCheckInAlert | null>(null);

  const loadDashboardPendingClaims = () => {
    if (!currentUser?.username) return;
    callApi(
      'GET_MISSED_CHECKINS',
      { username: currentUser.username, role: currentUser.role },
      { background: true }
    ).then((res) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  // Auto show onboarding modal for first-time users (defer while mandatory schedule registration is active)
  useEffect(() => {
    if (currentUser?.username && !shouldPromptSchedule && store.currentTab === 'dashboard') {
      const isCompleted = localStorage.getItem(`kg_onboarding_completed_${currentUser.username}`);
      const isNever = localStorage.getItem(`kg_onboarding_never_${currentUser.username}`);
      if (!isCompleted && !isNever) {
        const timer = setTimeout(() => {
          window.dispatchEvent(new CustomEvent('kg:open-newbie-guide'));
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [currentUser?.username, shouldPromptSchedule, store.currentTab]);

  // Determine today's shift using Vietnam 06:00 -> 05:59 workday cycle
  const vnNow = getVietnamDateParts();
  const { isOvernightBefore06, workdayDateKey, cycleStartMs } = getWorkdayCycleBounds();
  const cycleEndMs = cycleStartMs + 24 * 3600 * 1000;
  const operationalDayOfWeek = isOvernightBefore06 ? (vnNow.dayOfWeek + 6) % 7 : vnNow.dayOfWeek;
  const dayIdx = operationalDayOfWeek === 0 ? 6 : operationalDayOfWeek - 1;
  const effectiveTodayShifts = currentWeekApprovedShifts ?? approvedShifts;
  const todayShift = effectiveTodayShifts ? effectiveTodayShifts[dayIdx] : 'Chưa xếp ca';
  const isOff = !todayShift || todayShift === 'OFF' || todayShift === 'Chưa xếp ca';

  const [dashboardSchedules, setDashboardSchedules] = useState<any[]>([]);
  const [cashAuditDisputesCount, setCashAuditDisputesCount] = useState(0);
  const [openIncidentsCount, setOpenIncidentsCount] = useState(0);
  const [payrollDisputesCount, setPayrollDisputesCount] = useState(0);

  // Admin shift & unified command queue fetch
  useEffect(() => {
    const username = currentUser?.username;
    const role = currentUser?.role;
    if (!isAdmin || !username) return;

    let cancelled = false;
    const weekInfo = computeWeekInfo(undefined, false);
    const vn = getVietnamDateParts();
    const currentMonthStr = `${String(vn.month).padStart(2, '0')}/${vn.year}`;

    void Promise.allSettled([
      callApi(
        'GET_ALL_SCHEDULES',
        { monthSheet: weekInfo.monthSheet, weekLabel: weekInfo.weekLabel },
        { background: true }
      ),
      callApi('GET_SWAP_REQUESTS', { username, role }, { background: true }),
      callApi('GET_ADVANCES', { username, role }, { background: true }),
      callApi('GET_HANDOVERS', { role }, { background: true }),
      callApi('GET_INCIDENTS', { username, role }, { background: true }),
      callApi('GET_SALARY_ADJUSTMENTS', { username, role }, { background: true }),
      callApi('GET_PAYROLL', { username, role, month: currentMonthStr }, { background: true }),
    ]).then(([schedRes, swapRes, advRes, hoRes, incRes, adjRes, payRes]) => {
      if (cancelled) return;
      if (schedRes.status === 'fulfilled' && schedRes.value?.ok) {
        const parsedSchedules = Array.isArray(schedRes.value.data)
          ? schedRes.value.data
          : schedRes.value.data?.schedules || [];
        const cleanSchedules = parsedSchedules.map((emp: any) => {
          const shifts: string[] = [];
          (emp.shifts || []).forEach((s: string, idx: number) => {
            shifts[idx] = s && s.includes('\n') ? s.split('\n')[0].trim() : s;
          });
          return { ...emp, shifts };
        });
        setDashboardSchedules(cleanSchedules);
        useAppStore.getState().setAdminSchedules(cleanSchedules);
      }
      if (swapRes.status === 'fulfilled' && swapRes.value?.ok && Array.isArray(swapRes.value.data)) {
        useAppStore.getState().setSwapRequests(swapRes.value.data);
      }
      if (advRes.status === 'fulfilled' && advRes.value?.ok && Array.isArray(advRes.value.data)) {
        useAppStore.getState().setAdvances(advRes.value.data);
      }
      if (hoRes.status === 'fulfilled' && hoRes.value?.ok) {
        const rawHandovers = Array.isArray(hoRes.value.data?.handovers)
          ? hoRes.value.data.handovers
          : Array.isArray(hoRes.value.data)
          ? hoRes.value.data
          : [];
        const disputes = rawHandovers.filter(
          (h: any) =>
            h?.ackStatus === 'Disputed' ||
            h?.reconcileStatus === 'Disputed' ||
            ((Number(h?.discrepancy) || 0) !== 0 && h?.reconcileStatus !== 'ManagerConfirmed')
        ).length;
        setCashAuditDisputesCount(disputes);
      }
      if (incRes.status === 'fulfilled' && incRes.value?.ok) {
        const rawIncidents = Array.isArray(incRes.value.data?.incidents)
          ? incRes.value.data.incidents
          : Array.isArray(incRes.value.data)
          ? incRes.value.data
          : [];
        const openCount = rawIncidents.filter((inc: any) => {
          const st = normalizeIncidentStatus(inc?.status);
          return st === 'Open' || st === 'Investigating';
        }).length;
        setOpenIncidentsCount(openCount);
      }
      let nextPayrollQueue = 0;
      if (adjRes.status === 'fulfilled' && adjRes.value?.ok) {
        const reqs = Array.isArray(adjRes.value.data?.requests) ? adjRes.value.data.requests : [];
        nextPayrollQueue += reqs.filter((r: any) => r?.status === 'Pending').length;
      }
      if (payRes.status === 'fulfilled' && payRes.value?.ok) {
        const confirmations = payRes.value.data?.workflow?.confirmations;
        if (confirmations && typeof confirmations === 'object') {
          nextPayrollQueue += Object.values(confirmations).filter(
            (c: any) => c?.status === 'DISPUTED'
          ).length;
        }
      }
      setPayrollDisputesCount(nextPayrollQueue);
    });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, currentUser?.username, currentUser?.role]);

  const safeSwapRequests = Array.isArray(store.swapRequests) ? store.swapRequests : [];
  const safeAdvances = Array.isArray(store.advances) ? store.advances : [];
  const pendingLeaves = safeSwapRequests.filter(
    (req) => req.status === 'Pending_Admin' && req.targetUsername === 'ADMIN'
  );
  const pendingSwaps = safeSwapRequests.filter(
    (req) => req.status === 'Pending_Admin' && req.targetUsername !== 'ADMIN'
  );
  const pendingAdvances = safeAdvances.filter((adv) => adv.status === 'Pending');
  const totalAdminQueueCount =
    pendingMissedClaims.length +
    pendingSwaps.length +
    pendingLeaves.length +
    pendingAdvances.length +
    cashAuditDisputesCount +
    openIncidentsCount +
    payrollDisputesCount +
    (store.pendingFeedbackCount || 0);

  // Discrepancy Logic (synced with 06:00-05:59 Vietnam workday cycle)
  const [wdYear, wdMonth, wdDay] = workdayDateKey.split('-');
  const todayPrefix = `${wdDay}/${wdMonth}/${wdYear}`;
  const checkinMap = new Map<string, any[]>();
  store.logs.forEach((l) => {
    const ts =
      typeof l.timestamp === 'number' && l.timestamp > 0
        ? l.timestamp
        : parseVietnamLogTimestampMs(l.time);
    const inCycle =
      ts !== null ? ts >= cycleStartMs && ts < cycleEndMs : l.time.startsWith(todayPrefix);
    if (inCycle) {
      if (!checkinMap.has(l.fullname)) checkinMap.set(l.fullname, []);
      checkinMap.get(l.fullname)!.push(l);
    }
  });

  const scheduledToday = dashboardSchedules
    .map((emp) => {
      const shift = emp.shifts[dayIdx];
      if (shift && shift !== 'OFF' && shift !== 'OFF#') {
        return { fullname: emp.fullname, shift };
      }
      return null;
    })
    .filter(Boolean) as { fullname: string; shift: string }[];

  const notArrived = scheduledToday.filter((emp) => {
    const userLogs = checkinMap.get(emp.fullname) || [];
    return !userLogs.some((l: any) => isCheckInLabel(l.type));
  });

  const lateArrived = scheduledToday.filter((emp) => {
    const userLogs = checkinMap.get(emp.fullname) || [];
    return userLogs.some((l: any) => l.type.includes('Trễ'));
  });

  // Check user's check-in/out status for current 06:00-05:59 workday cycle
  const checkInRec = getRecommendedCheckInType(store.logs, currentUser);
  const userHasIn = checkInRec.isOpenShift || checkInRec.hasInToday;
  const userHasOut = !checkInRec.isOpenShift && checkInRec.hasOutToday;

  let statusText = 'Chưa vào ca';
  let statusVariant: 'success' | 'warning' | 'error' | 'info' | 'neutral' = 'error';
  if (checkInRec.isOpenShift) {
    statusText = 'Đã vào ca';
    statusVariant = 'success';
  } else if (userHasOut) {
    statusText = 'Đã ra ca';
    statusVariant = 'neutral';
  } else if (isOff) {
    statusText = 'Hôm nay OFF';
    statusVariant = 'neutral';
  } else if (userHasIn) {
    statusText = 'Đã vào ca';
    statusVariant = 'success';
  }

  return (
    <div className="space-y-5 animate-fade-in pb-10">
      {/* Mandatory Schedule Alert Banner during T5, T6, T7 before 17:00 */}
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
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors active:scale-95 touch-manipulation whitespace-nowrap flex-shrink-0 min-h-[44px] sm:min-h-[40px]"
          >
            Đăng ký ca ngay →
          </button>
        </div>
      )}

      {!isAdmin ? (
        <EmployeeDashboardView
          currentUser={currentUser}
          todayShift={todayShift}
          isOff={isOff}
          userHasIn={userHasIn}
          userHasOut={userHasOut}
          statusText={statusText}
          statusVariant={statusVariant}
          todayChecklistDone={store.todayChecklistDone}
          todayHandoverDone={store.todayHandoverDone}
          nextWeekRegistered={nextWeekRegistered}
          approvedShifts={store.approvedShifts}
          upcomingWeekDisplay={upcomingWeekInfo.weekDisplay}
          effectiveScheduleUpdatedAt={effectiveScheduleUpdatedAt}
          pendingMissedClaims={pendingMissedClaims}
          missingAlerts={missingAlerts}
          recentLogs={recentLogs}
          onTabChange={onTabChange}
          onOpenMissedModal={(alert) => {
            setSelectedMissingAlert(alert ?? null);
            setMissedModalInitialTab('create');
            setIsMissedModalOpen(true);
          }}
        />
      ) : (
        <AdminDashboardView
          currentUser={currentUser}
          scheduledToday={scheduledToday}
          notArrived={notArrived}
          lateArrived={lateArrived}
          todayChecklistDone={store.todayChecklistDone}
          todayHandoverDone={store.todayHandoverDone}
          soldOutItems={store.soldOutItems}
          pendingMissedClaimsCount={pendingMissedClaims.length}
          cashAuditDisputesCount={cashAuditDisputesCount}
          openIncidentsCount={openIncidentsCount}
          payrollDisputesCount={payrollDisputesCount}
          pendingSwapsCount={pendingSwaps.length}
          pendingLeavesCount={pendingLeaves.length}
          pendingAdvancesCount={pendingAdvances.length}
          pendingFeedbackCount={store.pendingFeedbackCount || 0}
          totalAdminQueueCount={totalAdminQueueCount}
          onTabChange={onTabChange}
          onNavigateHubSubTab={navigateToHubSubTab}
          onOpenAdminMissedModal={() => {
            setSelectedMissingAlert(null);
            setMissedModalInitialTab('admin');
            setIsMissedModalOpen(true);
          }}
        />
      )}

      {/* Missed Check-in Modal */}
      {isMissedModalOpen && (
        <Suspense fallback={null}>
          <MissedCheckInModal
            isOpen={isMissedModalOpen}
            initialTab={missedModalInitialTab}
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
        </Suspense>
      )}
    </div>
  );
};

function WorkspaceRouter({
  tabId,
  onTabChange,
}: {
  tabId: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  switch (tabId) {
    case 'dashboard':
      return <DashboardOverview onTabChange={onTabChange} />;
    case 'attendance':
      return <AttendanceHub />;
    case 'workforce':
      return <WorkforceHub />;
    case 'work':
      return <WorkHub />;
    case 'communications':
    case 'income':
      return <CommunicationsHub />;
    case 'knowledge':
      return <KnowledgeHub />;
    case 'admin_ops':
    case 'admin_workforce':
    case 'admin_work':
      return <AdminOpsHub />;
    case 'admin_people_pay':
    case 'admin_people':
    case 'admin_income':
      return <AdminPeoplePayHub />;
    case 'admin_system':
      return <AdminSystemHub />;
    case 'profile':
      return <Profile />;
    default:
      return <DashboardOverview onTabChange={onTabChange} />;
  }
}

export default function Dashboard() {
  const currentTab = useAppStore((state) => state.currentTab);
  const currentUser = useAppStore((state) => state.currentUser);
  const isScheduleRegistered = useAppStore((state) => state.isScheduleRegistered);
  const registeredShifts = useAppStore((state) => state.registeredShifts);
  const registeredWeekKey = useAppStore((state) => state.registeredWeekKey);
  const setCurrentTab = useAppStore((state) => state.setCurrentTab);

  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const isSlowConnection = !!connection?.saveData || connection?.effectiveType === '2g';
    const isAdmin = isAdminUser(currentUser);
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
    if (
      destination === 'attendance' ||
      destination === 'admin_system' ||
      destination === 'admin_ops' ||
      destination === 'admin_people_pay' ||
      destination === 'dashboard'
    ) {
      refreshAppData();
    }
  };

  const MAX_KEEP_ALIVE_TABS = 3;
  const [visitedTabs, setVisitedTabs] = useState<TabId[]>(() => [currentTab]);
  const [prevTrackedTab, setPrevTrackedTab] = useState<TabId>(currentTab);

  if (prevTrackedTab !== currentTab) {
    setPrevTrackedTab(currentTab);
    setVisitedTabs((prev) => {
      if (prev[prev.length - 1] === currentTab) return prev;
      const withoutCurrent = prev.filter((t) => t !== currentTab);
      const next = [...withoutCurrent, currentTab];
      return next.length > MAX_KEEP_ALIVE_TABS ? next.slice(next.length - MAX_KEEP_ALIVE_TABS) : next;
    });
  }

  useEffect(() => {
    const onPopState = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const tabParam = (urlParams.get('tab') as TabId | null) || 'dashboard';
        if (useAppStore.getState().currentTab !== tabParam) {
          useAppStore.getState().setCurrentTab(tabParam);
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [workforceSubTab, setWorkforceSubTab] = useState<string>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('tab') === 'workforce' && urlParams.get('sub')) {
        return urlParams.get('sub')!;
      }
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
    currentTab === 'schedule' || (currentTab === 'workforce' && workforceSubTab === 'schedule');

  return (
    <KgAppShell onPrefetch={prefetchModule}>
      {/* Uncloseable Mandatory Schedule Modal for Staff during T5, T6, T7 before 17:00 */}
      {shouldPromptSchedule && !isRegisteringSchedule && (
        <Suspense fallback={null}>
          <MandatoryScheduleModal
            isOpen={true}
            onGoToSchedule={() => {
              try {
                sessionStorage.setItem('kg_hub_subtab_workforce', 'schedule');
              } catch {
                /* ignore */
              }
              setWorkforceSubTab('schedule');
              handleTabChange('schedule');
            }}
            windowStatus={regWindow}
            employeeName={currentUser?.fullname}
            targetWeekDisplay={upcomingWeek.weekDisplay}
          />
        </Suspense>
      )}
      <div className="h-full">
        {!hasAccess ? (
          <AccessDeniedPage tabTitle={getTabLabel(currentTab)} />
        ) : (
          <>
            {/* Dedicated non-keep-alive mounting for CheckIn to cleanly release camera stream */}
            {currentTab === 'checkin' && (
              <AppErrorBoundary
                resetKey="checkin"
                fallback={({ reset }) => (
                  <ModuleRecoverFallback
                    onRetry={reset}
                    onGoHome={() => handleTabChange('dashboard')}
                  />
                )}
              >
                <Suspense fallback={<TabFallback />}>
                  <CheckIn />
                </Suspense>
              </AppErrorBoundary>
            )}

            {/* Keep-Alive for Data-driven Hubs & Modules (LRU-capped to prevent DOM bloat) */}
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
                      <ModuleRecoverFallback
                        onRetry={reset}
                        onGoHome={() => handleTabChange('dashboard')}
                      />
                    )}
                  >
                    <Suspense fallback={<TabFallback />}>
                      <WorkspaceRouter tabId={tabId} onTabChange={handleTabChange} />
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
