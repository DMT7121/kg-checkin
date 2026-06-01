import { lazy, Suspense, useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { computeWeekInfo } from '../utils/helpers';
import { refreshAppData } from '../utils/refreshData';
import { hasTabPermission, getTabLabel } from '../utils/permissions';
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

const ComingSoonPage = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
    <div className="w-20 h-20 rounded-2xl bg-[#FFF0ED] dark:bg-[#E85D4A]/10 flex items-center justify-center mb-5 shadow-sm">
      <Briefcase size={32} className="text-[#E85D4A]" />
    </div>
    <h2 className="text-xl font-bold text-[#172033] dark:text-white mb-2">{title}</h2>
    <p className="text-sm text-[#6F7785] dark:text-[#A0ABC0] max-w-xs">
      Tính năng này đang được phát triển và sẽ sớm ra mắt trong các bản cập nhật tiếp theo.
    </p>
    <div className="soft3d-card mt-6 px-5 py-2.5 rounded-full !bg-[#E85D4A] text-white text-xs font-bold tracking-wide border-none">
      COMING SOON
    </div>
  </div>
);

const AccessDeniedPage = ({ tabTitle }: { tabTitle: string }) => (
  <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in">
    <div className="w-20 h-20 rounded-2xl bg-[#FFF0ED] dark:bg-[#E85D4A]/10 flex items-center justify-center mb-5 shadow-sm border border-[#E85D4A]/20">
      <ShieldAlert size={36} className="text-[#E85D4A]" />
    </div>
    <h2 className="text-xl font-black text-[#062B49] dark:text-white mb-2">Không Có Quyền Truy Cập</h2>
    <p className="text-sm text-[#6F7785] dark:text-[#A0ABC0] max-w-sm leading-relaxed">
      Vị trí làm việc hoặc phân quyền tài khoản của bạn hiện tại không được phép truy cập phân hệ <b>{tabTitle}</b>.
    </p>
    <p className="text-xs text-[#6F7785] dark:text-[#A0ABC0]/80 mt-2">
      Vui lòng liên hệ với Admin để điều chỉnh nếu đây là một sự nhầm lẫn.
    </p>
  </div>
);

const TabFallback = () => (
  <div className="p-4 md:p-6 space-y-4">
    <div className="bg-white dark:bg-[#0E273C] border border-[#E8DED1] dark:border-[#1E3F57] rounded-3xl p-5 md:p-6 overflow-hidden">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#062B49]/5 dark:bg-[#122F48] flex items-center justify-center">
            <RefreshCw size={18} className="animate-spin text-[#062B49] dark:text-[#E85D4A]" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-[#172033] dark:text-white">Đang mở module</p>
            <p className="text-xs text-[#6F7785] dark:text-[#A0ABC0]">Dữ liệu giao diện đang được tải nhanh...</p>
          </div>
        </div>
        <div className="hidden sm:block h-2 w-28 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div className="h-full w-1/2 rounded-full bg-[#062B49] dark:bg-[#E85D4A] animate-pulse" />
        </div>
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-lg border border-[#E8DED1] dark:border-[#1E3F57] bg-[#FBF7F0] dark:bg-[#122F48] p-3">
            <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700 animate-pulse mb-3" />
            <div className="h-6 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-[#FBF7F0] dark:bg-[#122F48] animate-pulse" />
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

const DashboardOverview = ({ onTabChange }: { onTabChange: (tab: any) => void }) => {
  const store = useAppStore();
  const { currentUser } = store;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';
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
      {/* Render USER Today Hub */}
      {!isAdmin ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left side: Hero card & Actions */}
          <div className="lg:col-span-7 space-y-4">
            {/* Personal Hero Card */}
            <div className="relative overflow-hidden rounded-3xl bg-[#062B49] p-6 text-white shadow-sm border border-[#0B3A5F]">
              <div className="relative z-10 flex flex-col justify-between h-full space-y-6">
                <div>
                  <div className="flex items-center space-x-2.5">
                    <span className="text-2xl">👋</span>
                    <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">
                      Xin chào, {currentUser?.fullname.split(' ').pop()}!
                    </h2>
                  </div>
                  <p className="text-[#A0ABC0] text-xs font-semibold mt-1">
                    Hôm nay • {store.currentTime}
                  </p>
                </div>

                <div className="flex items-center justify-between bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#A0ABC0]">Lịch làm hôm nay</p>
                    <p className="text-sm font-extrabold mt-0.5">{todayShift}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#A0ABC0]">Trạng thái</p>
                    <KgStatusBadge variant={statusVariant} className="mt-1">
                      {statusText}
                    </KgStatusBadge>
                  </div>
                </div>
              </div>
              {/* Background circles */}
              <div className="absolute right-[-10%] top-[-20%] w-60 h-60 bg-[#E85D4A]/10 rounded-full blur-3xl mix-blend-screen" />
              <div className="absolute left-[-20%] bottom-[-40%] w-60 h-60 bg-white/5 rounded-full blur-3xl mix-blend-screen" />
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
                className="w-full text-base font-extrabold py-4 shadow-sm active:scale-95 transition-all h-[56px] uppercase tracking-wider"
                icon={Camera}
                onClick={() => onTabChange('checkin')}
              >
                {userHasIn ? 'Bấm để Ra Ca' : 'Chấm Công Vào Ca Ngay'}
              </KgButton>
            )}

            {/* Card việc cần làm (To-Do List) */}
            <KgCard className="p-5">
              <h3 className="text-sm font-black text-[#172033] dark:text-white uppercase tracking-wider mb-4 border-b border-[#E8DED1] dark:border-[#1E3F57] pb-2">
                Việc cần làm hôm nay
              </h3>
              <div className="space-y-3.5">
                {/* Checklist item */}
                {hasTabPermission('checklist', currentUser) && (
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FBF7F0] dark:bg-[#122F48]/50 border border-[#E8DED1] dark:border-[#1E3F57]">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.todayChecklistDone ? 'bg-[#EEF7F0] text-[#4F8A5B]' : 'bg-[#FFF7E4] text-[#D8A23A]'}`}>
                        <ClipboardCheck size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#172033] dark:text-slate-200">Nộp checklist vận hành</p>
                        <p className="text-[10px] text-[#6F7785] dark:text-[#A0ABC0] font-medium">Báo cáo hạng mục đầu/cuối ca</p>
                      </div>
                    </div>
                    {store.todayChecklistDone ? (
                      <KgStatusBadge variant="success">Đã nộp</KgStatusBadge>
                    ) : (
                      <button onClick={() => onTabChange('checklist')} className="text-xs font-bold text-[#062B49] dark:text-[#E85D4A] hover:underline">Làm ngay →</button>
                    )}
                  </div>
                )}

                {/* Handover item */}
                {hasTabPermission('handover', currentUser) && (
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FBF7F0] dark:bg-[#122F48]/50 border border-[#E8DED1] dark:border-[#1E3F57]">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.todayHandoverDone ? 'bg-[#EEF7F0] text-[#4F8A5B]' : 'bg-[#FFF0ED] text-[#E85D4A]'}`}>
                        <Repeat size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#172033] dark:text-slate-200">Ghi sổ bàn giao ca</p>
                        <p className="text-[10px] text-[#6F7785] dark:text-[#A0ABC0] font-medium">Bàn giao doanh thu, sự cố, kho</p>
                      </div>
                    </div>
                    {store.todayHandoverDone ? (
                      <KgStatusBadge variant="success">Đã hoàn thành</KgStatusBadge>
                    ) : (
                      <button onClick={() => onTabChange('handover')} className="text-xs font-bold text-[#062B49] dark:text-[#E85D4A] hover:underline">Ghi sổ →</button>
                    )}
                  </div>
                )}

                {/* Register Schedule item */}
                {hasTabPermission('schedule', currentUser) && (
                  <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FBF7F0] dark:bg-[#122F48]/50 border border-[#E8DED1] dark:border-[#1E3F57]">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.isScheduleRegistered ? 'bg-[#EEF7F0] text-[#4F8A5B]' : 'bg-[#FFF7E4] text-[#D8A23A]'}`}>
                        <Calendar size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[#172033] dark:text-slate-200">Đăng ký lịch tuần tới</p>
                        <p className="text-[10px] text-[#6F7785] dark:text-[#A0ABC0] font-medium">Hạn đăng ký trước Chủ nhật hàng tuần</p>
                      </div>
                    </div>
                    {store.isScheduleRegistered ? (
                      <KgStatusBadge variant="success">Đã đăng ký</KgStatusBadge>
                    ) : (
                      <button onClick={() => onTabChange('schedule')} className="text-xs font-bold text-[#062B49] dark:text-[#E85D4A] hover:underline">Đăng ký →</button>
                    )}
                  </div>
                )}
              </div>
            </KgCard>
          </div>

          {/* Right side: Quick actions & Recent activity */}
          <div className="lg:col-span-5 space-y-4">
            {/* Quick Actions Panel */}
            <KgCard className="p-4">
              <h3 className="text-xs font-bold text-[#6F7785] uppercase tracking-wider mb-3">Lối tắt nhanh</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {[
                  { icon: Newspaper, label: 'Bảng tin', tab: 'news' as any, color: 'text-[#062B49] bg-[#FFF0ED] dark:bg-[#1E3F57]/30' },
                  { icon: UtensilsCrossed, label: 'Món hết', tab: 'soldout' as any, color: 'text-[#D8A23A] bg-[#FFF7E4] dark:bg-[#E2B24C]/10' },
                  { icon: Award, label: 'King Coins', tab: 'reward' as any, color: 'text-[#E2B24C] bg-[#FFF8E7] dark:bg-[#E2B24C]/10' },
                  { icon: Banknote, label: 'Phiếu lương', tab: 'payroll' as any, color: 'text-[#4F8A5B] bg-[#EEF7F0] dark:bg-[#5F9D6B]/10' },
                  { icon: MessageSquareWarning, label: 'Góp ý', tab: 'feedback' as any, color: 'text-[#C94335] bg-[#FFF0EE] dark:bg-[#D8584B]/10' },
                  { icon: Calendar, label: 'Lịch làm', tab: 'schedule' as any, color: 'text-[#3B82F6] bg-[#EFF6FF] dark:bg-[#3B82F6]/10' },
                ].filter(act => hasTabPermission(act.tab, currentUser)).map((act, i) => (
                  <button
                    key={i}
                    onClick={() => onTabChange(act.tab)}
                    className="flex flex-col items-center p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900/60 active:scale-95 transition-all text-center gap-1.5"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${act.color}`}>
                      <act.icon size={18} />
                    </div>
                    <span className="text-[10px] font-bold text-[#6F7785] dark:text-[#A0ABC0] truncate w-full">
                      {act.label}
                    </span>
                  </button>
                ))}
              </div>
            </KgCard>

            {/* Personal Recent Activity Logs */}
            <KgCard className="p-4">
              <div className="flex items-center justify-between mb-3 border-b border-[#E8DED1] dark:border-[#1E3F57] pb-2">
                <h3 className="text-xs font-bold text-[#6F7785] uppercase tracking-wider">Lịch sử chấm công</h3>
                <button onClick={() => onTabChange('history')} className="text-xs font-bold text-[#062B49] dark:text-[#E85D4A] hover:underline">
                  Xem tất cả
                </button>
              </div>
              {recentLogs.length > 0 ? (
                <div className="space-y-2.5">
                  {recentLogs.map((log, i) => {
                    const isCheckin = log.type.includes('Vào ca') || log.type.includes('IN');
                    return (
                      <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-[#122F48]/50 border border-[#E8DED1] dark:border-[#1E3F57]">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-xs ${isCheckin ? 'bg-[#4F8A5B]' : 'bg-[#C94335]'}`}>
                            {isCheckin ? '→' : '←'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#172033] dark:text-slate-200 truncate">{log.type}</p>
                            <p className="text-[10px] text-[#6F7785] dark:text-[#A0ABC0] font-medium truncate">{log.time}</p>
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
                <div className="text-center py-4 text-xs text-[#6F7785] dark:text-slate-500">
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
              className={notArrived.length > 0 ? 'border-[#C94335]/30 dark:border-[#C94335]/50 bg-[#FFF0EE]/10' : ''}
            />
            <KgMetricCard
              title="Đi trễ"
              value={lateArrived.length}
              icon={ShieldAlert}
              variant="warning"
              className={lateArrived.length > 0 ? 'border-[#D8A23A]/30 dark:border-[#D8A23A]/50 bg-[#FFF7E4]/10' : ''}
            />
          </div>

          {/* Dashboard grid for Admin */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Alerts, operational checklists, roster */}
            <div className="lg:col-span-8 space-y-4">
              
              {/* Discrepancy details */}
              {(notArrived.length > 0 || lateArrived.length > 0) && (
                <KgCard className="p-5 border-[#D8A23A]/30 dark:border-[#1E3F57]">
                  <h3 className="text-sm font-black text-[#172033] dark:text-white uppercase tracking-wider mb-4 border-b border-[#E8DED1] dark:border-[#1E3F57] pb-2 flex items-center">
                    <ShieldAlert size={16} className="text-[#D8A23A] mr-2 flex-shrink-0" />
                    Cảnh báo vận hành hôm nay
                  </h3>
                  <div className="space-y-3.5">
                    {lateArrived.length > 0 && (
                      <KgAlertCard variant="warning" title="Nhân viên đi trễ" icon={Clock}>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {lateArrived.map((emp, i) => (
                            <span key={i} className="text-[10px] font-bold bg-white dark:bg-slate-900 border border-[#D8A23A]/30 dark:border-[#1E3F57] px-2 py-0.5 rounded-lg text-slate-700 dark:text-slate-300">
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
                            <span key={i} className="text-[10px] font-bold bg-white dark:bg-slate-900 border border-[#C94335]/30 dark:border-[#1E3F57] px-2 py-0.5 rounded-lg text-slate-700 dark:text-slate-300">
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
                <KgCard className="p-4 text-left hover:shadow-sm transition-all flex flex-col justify-between min-h-[140px]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.todayChecklistDone ? 'bg-[#EEF7F0] text-[#4F8A5B]' : 'bg-[#FFF7E4] text-[#D8A23A]'}`}>
                        <ClipboardCheck size={16} />
                      </div>
                      <span className="text-xs font-bold text-[#6F7785] dark:text-[#A0ABC0]">Checklist Vận Hành</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-lg font-black text-[#172033] dark:text-white leading-tight">
                      {store.todayChecklistDone ? 'Tất cả đã nộp' : 'Đang chờ nộp'}
                    </p>
                    <p className="text-[10px] text-[#6F7785] dark:text-[#A0ABC0] font-semibold mt-1">
                      Hạng mục việc làm ca sáng & tối
                    </p>
                  </div>
                  <button onClick={() => onTabChange('checklist')} className="text-xs font-bold text-[#062B49] dark:text-[#E85D4A] hover:underline mt-3 text-left">
                    Quản lý checklist →
                  </button>
                </KgCard>

                {/* Handover widget */}
                <KgCard className="p-4 text-left hover:shadow-sm transition-all flex flex-col justify-between min-h-[140px]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${store.todayHandoverDone ? 'bg-[#EEF7F0] text-[#4F8A5B]' : 'bg-[#FFF0ED] text-[#E85D4A]'}`}>
                        <Repeat size={16} />
                      </div>
                      <span className="text-xs font-bold text-[#6F7785] dark:text-[#A0ABC0]">Sổ Bàn Giao Ca</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-lg font-black text-[#172033] dark:text-white leading-tight">
                      {store.todayHandoverDone ? 'Đã ghi nhận' : 'Chưa ghi bàn giao'}
                    </p>
                    <p className="text-[10px] text-[#6F7785] dark:text-[#A0ABC0] font-semibold mt-1">
                      Sổ tay theo dõi sự cố ca làm việc
                    </p>
                  </div>
                  <button onClick={() => onTabChange('handover')} className="text-xs font-bold text-[#062B49] dark:text-[#E85D4A] hover:underline mt-3 text-left">
                    Xem sổ bàn giao →
                  </button>
                </KgCard>
              </div>

              {/* Sold out items report */}
              <KgCard className="p-4">
                <div className="flex items-center justify-between mb-3 border-b border-[#E8DED1] dark:border-[#1E3F57] pb-2">
                  <div className="flex items-center space-x-2">
                    <UtensilsCrossed size={16} className="text-[#D8A23A]" />
                    <h3 className="text-xs font-bold text-[#6F7785] uppercase tracking-wider">Món hết hôm nay</h3>
                  </div>
                  <button onClick={() => onTabChange('soldout')} className="text-xs font-bold text-[#062B49] dark:text-[#E85D4A] hover:underline">
                    Xem thực đơn
                  </button>
                </div>
                {store.soldOutItems.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {store.soldOutItems.map((item) => (
                      <div key={item.id} className="bg-[#FFF7E4] dark:bg-[#E2B24C]/10 border border-[#E8DED1] dark:border-[#1E3F57] rounded-xl px-3 py-1.5 flex items-center space-x-2 text-xs">
                        <span className="font-extrabold text-[#D8A23A]">{item.itemName}</span>
                        <span className="text-[10px] text-[#6F7785] dark:text-[#A0ABC0] font-medium">({item.reportedBy} lúc {item.reportedAt})</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#6F7785] italic py-2">Chưa báo món hết nào hôm nay</p>
                )}
              </KgCard>

            </div>

            {/* Right Column: Approvals list & Shortcuts */}
            <div className="lg:col-span-4 space-y-4">
              
              {/* Approvals Widget */}
              {hasPendingApprovals ? (
                <KgCard className="p-4 border-[#FFF0ED] dark:border-[#E85D4A]/30 bg-[#FFF0ED]/20">
                  <div className="flex items-center space-x-2 mb-3 border-b border-[#E8DED1] dark:border-[#1E3F57] pb-2">
                    <BellRing size={16} className="text-[#E85D4A] animate-pulse" />
                    <h3 className="text-xs font-bold text-[#172033] dark:text-white uppercase tracking-wider">Cần duyệt gấp</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {pendingSwaps.length > 0 && (
                      <button onClick={() => onTabChange('swap')} className="flex items-center justify-between p-3 rounded-xl bg-[#EEF7F0]/60 dark:bg-[#5F9D6B]/15 border border-[#EEF7F0]/80 text-[#4F8A5B] hover:bg-[#EEF7F0] transition-all text-xs font-bold">
                        <span>Đổi ca ({pendingSwaps.length})</span>
                        <span>Chi tiết →</span>
                      </button>
                    )}
                    {pendingLeaves.length > 0 && (
                      <button onClick={() => onTabChange('swap')} className="flex items-center justify-between p-3 rounded-xl bg-[#FFF0ED]/60 dark:bg-[#E85D4A]/15 border border-[#FFF0ED]/80 text-[#E85D4A] hover:bg-[#FFF0ED] transition-all text-xs font-bold">
                        <span>Yêu cầu xin nghỉ ({pendingLeaves.length})</span>
                        <span>Chi tiết →</span>
                      </button>
                    )}
                    {pendingAdvances.length > 0 && (
                      <button onClick={() => onTabChange('advance')} className="flex items-center justify-between p-3 rounded-xl bg-[#FFF7E4]/60 dark:bg-[#E2B24C]/15 border border-[#FFF7E4]/80 text-[#D8A23A] hover:bg-[#FFF7E4] transition-all text-xs font-bold">
                        <span>Ứng lương ({pendingAdvances.length})</span>
                        <span>Chi tiết →</span>
                      </button>
                    )}
                  </div>
                </KgCard>
              ) : (
                <KgCard className="p-4 text-center py-6 border-dashed border-[#E8DED1] dark:border-[#1E3F57]">
                  <CheckCircle2 size={24} className="mx-auto mb-2 text-[#4F8A5B] opacity-80" />
                  <p className="text-xs font-bold text-[#172033] dark:text-slate-200">Không có yêu cầu chờ duyệt</p>
                  <p className="text-[10px] text-[#6F7785] mt-0.5">Tất cả ca làm, ứng lương đã được giải quyết gọn gàng!</p>
                </KgCard>
              )}

              {/* Feedback awaiting reply */}
              {store.pendingFeedbackCount > 0 && (
                <KgCard className="p-4 border-[#FFF0ED] dark:border-[#1E3F57] bg-[#FFF0ED]/20">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 rounded-lg bg-[#FFF0ED] dark:bg-[#E85D4A]/25 flex items-center justify-center text-[#E85D4A] font-bold relative">
                        <MessageSquareWarning size={16} />
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#E85D4A] rounded-full text-white text-[8px] font-bold flex items-center justify-center">{store.pendingFeedbackCount}</span>
                      </div>
                      <div>
                        <p className="font-bold text-[#172033] dark:text-slate-200">Góp ý chưa xử lý</p>
                        <p className="text-[10px] text-[#6F7785] mt-0.5">{store.pendingFeedbackCount} phản hồi cần trả lời</p>
                      </div>
                    </div>
                    <button onClick={() => onTabChange('feedback')} className="text-[11px] font-bold text-[#E85D4A] hover:underline">Trả lời →</button>
                  </div>
                </KgCard>
              )}

              {/* Admin quick shortcuts */}
              <KgCard className="p-4">
                <h3 className="text-xs font-bold text-[#6F7785] uppercase tracking-wider mb-3">Phím tắt quản lý</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Phân ca', icon: CalendarRange, tab: 'schedule' as any, color: 'text-[#062B49] bg-[#062B49]/5' },
                    { label: 'Bảng công', icon: CalendarClock, tab: 'timesheet' as any, color: 'text-[#D8A23A] bg-[#FFF7E4]' },
                    { label: 'Bảng lương', icon: Banknote, tab: 'payroll' as any, color: 'text-[#4F8A5B] bg-[#EEF7F0]' },
                    { label: 'Nhân sự', icon: Users, tab: 'hr_list' as any, color: 'text-[#E85D4A] bg-[#FFF0ED]' },
                  ].map((item, i) => (
                    <button
                      key={i}
                      onClick={() => onTabChange(item.tab)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border border-[#E8DED1] dark:border-[#1E3F57] hover:bg-[#FBF7F0] dark:hover:bg-[#122F48] active:scale-[0.98] transition-all text-xs font-bold text-[#172033] dark:text-slate-350`}
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

export default function Dashboard() {
  const store = useAppStore();
  const { currentTab, currentUser } = store;

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

  const hasAccess = hasTabPermission(currentTab, currentUser);

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
              {!hasAccess ? (
                <AccessDeniedPage tabTitle={getTabLabel(currentTab)} />
              ) : (
                <>
                  {currentTab === 'dashboard' && <DashboardOverview onTabChange={handleTabChange} />}
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
                </>
              )}
            </Suspense>
          </AppErrorBoundary>
        </motion.div>
      </AnimatePresence>
    </KgAppShell>
  );
}
