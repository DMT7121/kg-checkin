import { lazy, Suspense, useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { computeWeekInfo } from '../utils/helpers';
import { refreshAppData } from '../utils/refreshData';
import {
  Camera, Calendar, Clock, ShieldAlert,
  ArrowLeftRight, Newspaper, GraduationCap,
  UtensilsCrossed, MessageSquareWarning,
  ClipboardCheck, Repeat, CalendarDays, History, BellRing,
  CalendarClock, Banknote, BadgeDollarSign, Award,
  Users, KeyRound, CalendarRange, DollarSign, Building2,
  RefreshCw, CheckCircle2, UserCheck, AlertCircle, Info, Briefcase
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import AppErrorBoundary from '../components/AppErrorBoundary';
import KgAppShell from '../components/KgAppShell';
import {
  KgCard,
  KgButton,
  KgStatusBadge,
  KgMetricCard,
  KgAlertCard
} from '../components/KgDesignSystem';

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

const moduleLoaders = {
  checkin: () => import('./CheckIn'),
  schedule: () => import('./Schedule'),
  history: () => import('./ActivityHistory'),
  swap: () => import('./SwapShift'),
  news: () => import('./NewsFeed'),
  training: () => import('./Training'),
  soldout: () => import('./SoldOut'),
  roster: () => import('./Roster'),
  checklist: () => import('./Checklist'),
  handover: () => import('./Handover'),
  feedback: () => import('./Feedback'),
  admin: () => import('./Admin'),
  hr_list: () => import('./admin/HrList'),
  admin_shift: () => import('./admin/AdminShift'),
  admin_org: () => import('./admin/AdminOrg'),
  admin_payroll: () => import('./admin/AdminPayroll'),
  admin_checklist: () => import('./admin/AdminChecklistConfig'),
  admin_analytics: () => import('./admin/AdminAnalytics'),
  advance: () => import('./Advance'),
  discipline: () => import('./Discipline'),
  payroll: () => import('./Payroll'),
  reward: () => import('./Reward'),
  timesheet: () => import('./Timesheet'),
} as const;

const CheckIn = lazyWithRetry(moduleLoaders.checkin);
const Schedule = lazyWithRetry(moduleLoaders.schedule);
const ActivityHistory = lazyWithRetry(moduleLoaders.history);
const SwapShift = lazyWithRetry(moduleLoaders.swap);
const NewsFeed = lazyWithRetry(moduleLoaders.news);
const Training = lazyWithRetry(moduleLoaders.training);
const SoldOut = lazyWithRetry(moduleLoaders.soldout);
const Roster = lazyWithRetry(moduleLoaders.roster);
const Checklist = lazyWithRetry(moduleLoaders.checklist);
const Handover = lazyWithRetry(moduleLoaders.handover);
const Feedback = lazyWithRetry(moduleLoaders.feedback);
const Admin = lazyWithRetry(moduleLoaders.admin);
const HrList = lazyWithRetry(moduleLoaders.hr_list);
const AdminShift = lazyWithRetry(moduleLoaders.admin_shift);
const AdminOrg = lazyWithRetry(moduleLoaders.admin_org);
const AdminPayroll = lazyWithRetry(moduleLoaders.admin_payroll);
const AdminChecklistConfig = lazyWithRetry(moduleLoaders.admin_checklist);
const AdminAnalytics = lazyWithRetry(moduleLoaders.admin_analytics);
const Advance = lazyWithRetry(moduleLoaders.advance);
const Discipline = lazyWithRetry(moduleLoaders.discipline);
const Payroll = lazyWithRetry(moduleLoaders.payroll);
const Reward = lazyWithRetry(moduleLoaders.reward);
const Timesheet = lazyWithRetry(moduleLoaders.timesheet);

const prefetchedModules = new Set<string>();

const prefetchModule = (tab: string) => {
  const loader = moduleLoaders[tab as keyof typeof moduleLoaders];
  if (!loader || prefetchedModules.has(tab)) return;
  prefetchedModules.add(tab);
  loader().catch(() => prefetchedModules.delete(tab));
};

const prefetchModuleScreens = async () => {
  const queue = [
    'checkin', 'schedule', 'checklist', 'handover', 'news', 'soldout',
    'swap', 'roster', 'history', 'timesheet', 'advance', 'payroll',
    'discipline', 'reward', 'training', 'feedback', 'admin', 'hr_list',
    'admin_shift', 'admin_org', 'admin_payroll', 'admin_checklist', 'admin_analytics',
  ];
  for (const tab of queue) {
    prefetchModule(tab);
    await wait(140);
  }
};

export default function Dashboard() {
  const store = useAppStore();
  const { currentUser, currentTab } = store;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';

  useEffect(() => {
    const run = () => prefetchModuleScreens();
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(run, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const handleTabChange = (tab: any) => {
    prefetchModule(tab);
    store.setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (tab === 'history' || tab === 'admin' || tab === 'dashboard') {
      refreshAppData();
    }
  };

  const ComingSoonPage = ({ title }: { title: string }) => (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-100 to-purple-100 dark:from-teal-900/40 dark:to-purple-900/40 flex items-center justify-center mb-5 shadow-lg">
        <Briefcase size={32} className="text-teal-650 dark:text-teal-400" />
      </div>
      <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{title}</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
        Tính năng này đang được phát triển và sẽ sớm ra mắt trong các bản cập nhật tiếp theo.
      </p>
      <div className="soft3d-card mt-6 px-5 py-2.5 rounded-full !bg-gradient-to-r from-teal-500 to-purple-500 text-white text-xs font-bold tracking-wide border-opacity-30">
        COMING SOON
      </div>
    </div>
  );

  const TabFallback = () => (
    <div className="p-4 md:p-6 space-y-4">
      <div className="soft3d-card p-5 md:p-6 overflow-hidden">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center">
              <RefreshCw size={18} className="animate-spin text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">Đang mở module</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Dữ liệu giao diện đang được tải nhanh...</p>
            </div>
          </div>
          <div className="hidden sm:block h-2 w-28 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className="h-full w-1/2 rounded-full bg-teal-500 animate-pulse" />
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3">
              <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700 animate-pulse mb-3" />
              <div className="h-6 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );

  const ModuleRecoverFallback = () => (
    <div className="p-4 md:p-6">
      <div className="soft3d-card p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Module đang được tải lại</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Hệ thống đang giữ nguyên màn hình hiện tại và thử nạp lại giao diện.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="soft3d-btn-primary px-4 py-2.5 text-sm font-bold inline-flex items-center justify-center gap-2"
        >
          <RefreshCw size={16} /> Làm mới
        </button>
      </div>
    </div>
  );

  // Màn hình Hôm nay (TodayHub)
  const DashboardOverview = () => {
    const { stats, logs, approvedShifts } = store;
    const recentLogs = logs.filter(l => l.fullname === currentUser?.fullname).slice(0, 3);

    // Determine today's shift
    const todayDay = new Date().getDay();
    const dayIdx = todayDay === 0 ? 6 : todayDay - 1; // 0=Mon, 6=Sun
    const todayShift = approvedShifts ? approvedShifts[dayIdx] : 'Chưa xếp ca';
    const isOff = !todayShift || todayShift === 'OFF' || todayShift === 'Chưa xếp ca';

    const [dashboardSchedules, setDashboardSchedules] = useState<any[]>([]);

    // Admin shift logic
    useEffect(() => {
      if (isAdmin) {
        const weekInfo = computeWeekInfo();
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
    }, [isAdmin]);

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
        {/* Render USER Today Hub */}
        {!isAdmin ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left side: Hero card & Actions */}
            <div className="lg:col-span-7 space-y-4">
              {/* Personal Hero Card */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-teal-500 to-slate-900 p-6 text-white shadow-lg border border-teal-500/20">
                <div className="relative z-10 flex flex-col justify-between h-full space-y-6">
                  <div>
                    <div className="flex items-center space-x-2.5">
                      <span className="text-2xl">👋</span>
                      <h2 className="text-xl md:text-2xl font-black tracking-tight">
                        Xin chào, {currentUser?.fullname.split(' ').pop()}!
                      </h2>
                    </div>
                    <p className="text-teal-100 text-xs font-semibold mt-1 opacity-90">
                      Hôm nay • {store.currentTime}
                    </p>
                  </div>

                  <div className="flex items-center justify-between bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200">Lịch làm hôm nay</p>
                      <p className="text-sm font-extrabold mt-0.5">{todayShift}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200">Trạng thái</p>
                      <KgStatusBadge variant={statusVariant} className="mt-1">
                        {statusText}
                      </KgStatusBadge>
                    </div>
                  </div>
                </div>
                {/* Background circles */}
                <div className="absolute right-[-10%] top-[-20%] w-60 h-60 bg-teal-400/20 rounded-full blur-3xl mix-blend-screen" />
                <div className="absolute left-[-20%] bottom-[-40%] w-60 h-60 bg-blue-500/10 rounded-full blur-3xl mix-blend-screen" />
              </div>

              {/* Big Action Button */}
              {isOff ? (
                <KgAlertCard variant="info" icon={Calendar}>
                  Hôm nay bạn không có ca làm việc nào được xếp. Chúc bạn có một ngày nghỉ vui vẻ!
                </KgAlertCard>
              ) : userHasOut ? (
                <KgAlertCard variant="success" icon={CheckCircle2}>
                  Bạn đã hoàn thành chấm công ra ca hôm nay. Hẹn gặp lại vào ca làm việc tiếp theo!
                </KgAlertCard>
              ) : (
                <KgButton
                  variant={userHasIn ? 'danger' : 'primary'}
                  size="lg"
                  className="w-full text-base font-extrabold py-4 shadow-xl active:scale-95 transition-all h-[56px] uppercase tracking-wider"
                  icon={Camera}
                  onClick={() => handleTabChange('checkin')}
                >
                  {userHasIn ? 'Bấm để Ra Ca' : 'Chấm Công Vào Ca Ngay'}
                </KgButton>
              )}

              {/* Card việc cần làm (To-Do List) */}
              <KgCard className="p-5">
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                  Việc cần làm hôm nay
                </h3>
                <div className="space-y-3.5">
                  {/* Checklist item */}
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.todayChecklistDone ? 'bg-green-50 text-green-600 dark:bg-green-950/40' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40'}`}>
                        <ClipboardCheck size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Nộp checklist vận hành</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Báo cáo hạng mục đầu/cuối ca</p>
                      </div>
                    </div>
                    {store.todayChecklistDone ? (
                      <KgStatusBadge variant="success">Đã nộp</KgStatusBadge>
                    ) : (
                      <button onClick={() => handleTabChange('checklist')} className="text-xs font-bold text-teal-650 hover:underline">Làm ngay →</button>
                    )}
                  </div>

                  {/* Handover item */}
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.todayHandoverDone ? 'bg-green-50 text-green-600 dark:bg-green-950/40' : 'bg-sky-50 text-sky-600 dark:bg-sky-950/40'}`}>
                        <Repeat size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Ghi sổ bàn giao ca</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Bàn giao doanh thu, sự cố, kho</p>
                      </div>
                    </div>
                    {store.todayHandoverDone ? (
                      <KgStatusBadge variant="success">Đã hoàn thành</KgStatusBadge>
                    ) : (
                      <button onClick={() => handleTabChange('handover')} className="text-xs font-bold text-teal-650 hover:underline">Ghi sổ →</button>
                    )}
                  </div>

                  {/* Register Schedule item */}
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.isScheduleRegistered ? 'bg-green-50 text-green-600 dark:bg-green-950/40' : 'bg-orange-50 text-orange-600 dark:bg-orange-950/40'}`}>
                        <Calendar size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Đăng ký lịch tuần tới</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Hạn đăng ký trước Chủ nhật hàng tuần</p>
                      </div>
                    </div>
                    {store.isScheduleRegistered ? (
                      <KgStatusBadge variant="success">Đã đăng ký</KgStatusBadge>
                    ) : (
                      <button onClick={() => handleTabChange('schedule')} className="text-xs font-bold text-teal-650 hover:underline">Đăng ký →</button>
                    )}
                  </div>
                </div>
              </KgCard>
            </div>

            {/* Right side: Quick actions & Recent activity */}
            <div className="lg:col-span-5 space-y-4">
              {/* Quick Actions Panel */}
              <KgCard className="p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Lối tắt nhanh</h3>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { icon: Newspaper, label: 'Bảng tin', tab: 'news' as any, color: 'text-purple-650 bg-purple-50 dark:bg-purple-950/30' },
                    { icon: UtensilsCrossed, label: 'Món hết', tab: 'soldout' as any, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
                    { icon: MessageSquareWarning, label: 'Góp ý', tab: 'feedback' as any, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30' },
                    { icon: Banknote, label: 'Phiếu lương', tab: 'payroll' as any, color: 'text-green-600 bg-green-50 dark:bg-green-950/30' },
                  ].map((act, i) => (
                    <button
                      key={i}
                      onClick={() => handleTabChange(act.tab)}
                      className="flex flex-col items-center p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900/60 active:scale-95 transition-all text-center gap-1.5"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${act.color}`}>
                        <act.icon size={18} />
                      </div>
                      <span className="text-[10px] font-bold text-slate-605 dark:text-slate-450 truncate w-full">
                        {act.label}
                      </span>
                    </button>
                  ))}
                </div>
              </KgCard>

              {/* Personal Recent Activity Logs */}
              <KgCard className="p-4">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-805 pb-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lịch sử chấm công</h3>
                  <button onClick={() => handleTabChange('history')} className="text-xs font-bold text-teal-650 hover:underline">
                    Xem tất cả
                  </button>
                </div>
                {recentLogs.length > 0 ? (
                  <div className="space-y-2.5">
                    {recentLogs.map((log, i) => {
                      const isCheckin = log.type.includes('Vào ca') || log.type.includes('IN');
                      return (
                        <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800">
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-xs ${isCheckin ? 'bg-green-500' : 'bg-red-500'}`}>
                              {isCheckin ? '→' : '←'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{log.type}</p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">{log.time}</p>
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
                  <div className="text-center py-4 text-xs text-slate-450 dark:text-slate-500">
                    Chưa có hoạt động nào hôm nay
                  </div>
                )}
              </KgCard>
            </div>
          </div>
        ) : (
          /* Render ADMIN Today Hub */
          <div className="space-y-5">
            {/* Top overview row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                className={notArrived.length > 0 ? 'border-red-300 dark:border-red-900/50 bg-red-50/10' : ''}
              />
              <KgMetricCard
                title="Đi trễ"
                value={lateArrived.length}
                icon={ShieldAlert}
                variant="warning"
                className={lateArrived.length > 0 ? 'border-amber-300 dark:border-amber-900/50 bg-amber-50/10' : ''}
              />
            </div>

            {/* Dashboard grid for Admin */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: Alerts, operational checklists, roster */}
              <div className="lg:col-span-8 space-y-4">
                
                {/* Discrepancy details */}
                {(notArrived.length > 0 || lateArrived.length > 0) && (
                  <KgCard className="p-5 border-amber-205 dark:border-amber-900/50">
                    <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center">
                      <ShieldAlert size={16} className="text-amber-500 mr-2 flex-shrink-0" />
                      Cảnh báo vận hành hôm nay
                    </h3>
                    <div className="space-y-3.5">
                      {lateArrived.length > 0 && (
                        <KgAlertCard variant="warning" title="Nhân viên đi trễ" icon={Clock}>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {lateArrived.map((emp, i) => (
                              <span key={i} className="text-[10px] font-bold bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-800 px-2 py-0.5 rounded-lg text-slate-700 dark:text-slate-300">
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
                              <span key={i} className="text-[10px] font-bold bg-white dark:bg-slate-900 border border-red-200 dark:border-slate-800 px-2 py-0.5 rounded-lg text-slate-700 dark:text-slate-300">
                                {emp.fullname} ({emp.shift})
                              </span>
                            ))}
                          </div>
                        </KgAlertCard>
                      )}
                    </div>
                  </KgCard>
                )}

                {/* Checklist & Handover compliance today */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Checklist widget */}
                  <KgCard className="p-4 text-left hover:shadow-md transition-all flex flex-col justify-between min-h-[140px]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.todayChecklistDone ? 'bg-green-50 text-green-600 dark:bg-green-950/40' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40'}`}>
                          <ClipboardCheck size={16} />
                        </div>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Checklist Vận Hành</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-black text-slate-805 dark:text-white leading-tight">
                        {store.todayChecklistDone ? 'Tất cả đã nộp' : 'Đang chờ nộp'}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-505 font-semibold mt-1">
                        Hạng mục việc làm ca sáng & tối
                      </p>
                    </div>
                    <button onClick={() => handleTabChange('checklist')} className="text-xs font-bold text-teal-650 hover:underline mt-3 text-left">
                      Quản lý checklist →
                    </button>
                  </KgCard>

                  {/* Handover widget */}
                  <KgCard className="p-4 text-left hover:shadow-md transition-all flex flex-col justify-between min-h-[140px]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.todayHandoverDone ? 'bg-green-50 text-green-600 dark:bg-green-950/40' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40'}`}>
                          <Repeat size={16} />
                        </div>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Sổ Bàn Giao Ca</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-lg font-black text-slate-805 dark:text-white leading-tight">
                        {store.todayHandoverDone ? 'Đã ghi nhận' : 'Chưa ghi bàn giao'}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-505 font-semibold mt-1">
                        Sổ tay theo dõi sự cố ca làm việc
                      </p>
                    </div>
                    <button onClick={() => handleTabChange('handover')} className="text-xs font-bold text-teal-650 hover:underline mt-3 text-left">
                      Xem sổ bàn giao →
                    </button>
                  </KgCard>
                </div>

                {/* Sold out items report */}
                <KgCard className="p-4">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <div className="flex items-center space-x-2">
                      <UtensilsCrossed size={16} className="text-amber-500" />
                      <h3 className="text-xs font-bold text-slate-450 uppercase tracking-wider">Món hết hôm nay</h3>
                    </div>
                    <button onClick={() => handleTabChange('soldout')} className="text-xs font-bold text-teal-650 hover:underline">
                      Xem thực đơn
                    </button>
                  </div>
                  {store.soldOutItems.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {store.soldOutItems.map((item) => (
                        <div key={item.id} className="bg-amber-50 dark:bg-amber-950/20 border border-amber-205 dark:border-slate-800 rounded-xl px-3 py-1.5 flex items-center space-x-2 text-xs">
                          <span className="font-extrabold text-amber-800 dark:text-amber-400">{item.itemName}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">({item.reportedBy} lúc {item.reportedAt})</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-405 italic py-2">Chưa báo món hết nào hôm nay</p>
                  )}
                </KgCard>

              </div>

              {/* Right Column: Approvals list & Shortcuts */}
              <div className="lg:col-span-4 space-y-4">
                
                {/* Approvals Widget */}
                {hasPendingApprovals ? (
                  <KgCard className="p-4 border-orange-200 dark:border-orange-950 bg-orange-50/5">
                    <div className="flex items-center space-x-2 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">
                      <BellRing size={16} className="text-orange-500 animate-pulse" />
                      <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">Cần duyệt gấp</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {pendingSwaps.length > 0 && (
                        <button onClick={() => handleTabChange('swap')} className="flex items-center justify-between p-3 rounded-xl bg-teal-50/60 dark:bg-teal-900/10 border border-teal-200/30 text-teal-700 dark:text-teal-400 hover:bg-teal-50 transition-all text-xs font-bold">
                          <span>Đổi ca ({pendingSwaps.length})</span>
                          <span>Chi tiết →</span>
                        </button>
                      )}
                      {pendingLeaves.length > 0 && (
                        <button onClick={() => handleTabChange('swap')} className="flex items-center justify-between p-3 rounded-xl bg-blue-50/60 dark:bg-blue-900/10 border border-blue-200/30 text-blue-700 dark:text-blue-400 hover:bg-blue-50 transition-all text-xs font-bold">
                          <span>Yêu cầu xin nghỉ ({pendingLeaves.length})</span>
                          <span>Chi tiết →</span>
                        </button>
                      )}
                      {pendingAdvances.length > 0 && (
                        <button onClick={() => handleTabChange('advance')} className="flex items-center justify-between p-3 rounded-xl bg-orange-50/60 dark:bg-orange-900/10 border border-orange-200/30 text-orange-700 dark:text-orange-400 hover:bg-orange-50 transition-all text-xs font-bold">
                          <span>Ứng lương ({pendingAdvances.length})</span>
                          <span>Chi tiết →</span>
                        </button>
                      )}
                    </div>
                  </KgCard>
                ) : (
                  <KgCard className="p-4 text-center py-6 border-dashed">
                    <CheckCircle2 size={24} className="mx-auto mb-2 text-green-500 opacity-80" />
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Không có yêu cầu chờ duyệt</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Tất cả ca làm, ứng lương đã được giải quyết gọn gàng!</p>
                  </KgCard>
                )}

                {/* Feedback awaiting reply */}
                {store.pendingFeedbackCount > 0 && (
                  <KgCard className="p-4 border-rose-200 dark:border-rose-955 bg-rose-50/5">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-500 font-bold relative">
                          <MessageSquareWarning size={16} />
                          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full text-white text-[8px] font-bold flex items-center justify-center">{store.pendingFeedbackCount}</span>
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 dark:text-slate-200">Góp ý chưa xử lý</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{store.pendingFeedbackCount} phản hồi cần trả lời</p>
                        </div>
                      </div>
                      <button onClick={() => handleTabChange('feedback')} className="text-[11px] font-bold text-rose-500 hover:underline">Trả lời →</button>
                    </div>
                  </KgCard>
                )}

                {/* Admin quick shortcuts */}
                <KgCard className="p-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Phím tắt quản lý</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Phân ca', icon: CalendarRange, tab: 'schedule' as any, color: 'text-teal-650 bg-teal-50 dark:bg-teal-950/20' },
                      { label: 'Bảng công', icon: CalendarClock, tab: 'timesheet' as any, color: 'text-indigo-650 bg-indigo-50 dark:bg-indigo-950/20' },
                      { label: 'Bảng lương', icon: Banknote, tab: 'payroll' as any, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20' },
                      { label: 'Nhân sự', icon: Users, tab: 'hr_list' as any, color: 'text-blue-650 bg-blue-50 dark:bg-blue-950/20' },
                    ].map((item, i) => (
                      <button
                        key={i}
                        onClick={() => handleTabChange(item.tab)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border border-slate-105 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60 active:scale-[0.98] transition-all text-xs font-bold text-slate-700 dark:text-slate-300`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                          <item.icon size={15} />
                        </div>
                        <span className="truncate">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </KgCard>

              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <KgAppShell>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={currentTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="h-full"
        >
          <AppErrorBoundary resetKey={currentTab} fallback={<ModuleRecoverFallback />}>
            <Suspense fallback={<TabFallback />}>
              {currentTab === 'dashboard' && <DashboardOverview />}
              {currentTab === 'checkin' && <CheckIn />}
              {currentTab === 'schedule' && <Schedule />}
              {currentTab === 'swap' && <SwapShift />}
              {currentTab === 'roster' && <Roster />}
              {currentTab === 'profile' && <ComingSoonPage title="Hồ sơ cá nhân" />}
              {currentTab === 'checklist' && <Checklist />}
              {currentTab === 'handover' && <Handover />}
              {currentTab === 'feedback' && <Feedback />}
              {currentTab === 'news' && <NewsFeed />}
              {currentTab === 'soldout' && <SoldOut />}
              {currentTab === 'training' && <Training />}
              {currentTab === 'advance' && <Advance />}
              {currentTab === 'discipline' && <Discipline />}
              {currentTab === 'payroll' && <Payroll />}
              {currentTab === 'reward' && <Reward />}
              {currentTab === 'timesheet' && <Timesheet />}
              {currentTab === 'history' && <ActivityHistory />}
              {currentTab === 'admin' && <Admin />}
              {currentTab === 'admin_shift' && <AdminShift />}
              {currentTab === 'admin_org' && <AdminOrg />}
              {currentTab === 'admin_payroll' && <AdminPayroll />}
              {currentTab === 'admin_checklist' && <AdminChecklistConfig />}
              {currentTab === 'admin_analytics' && <AdminAnalytics />}
              {currentTab === 'hr_list' && <HrList />}
            </Suspense>
          </AppErrorBoundary>
        </motion.div>
      </AnimatePresence>
    </KgAppShell>
  );
}
