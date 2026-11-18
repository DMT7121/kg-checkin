import { lazy, Suspense, useState, useEffect, type ComponentType, type ReactNode } from 'react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  HandCoins,
  History,
  KeyRound,
  MapPinned,
  MessageSquareText,
  Network,
  Newspaper,
  Repeat2,
  Settings2,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
  UtensilsCrossed,
  RefreshCw,
} from 'lucide-react';
import AppErrorBoundary from '../components/AppErrorBoundary';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { normalizeIncidentStatus } from '../utils/operationsReconciliation';
import { hasTabPermission, isAdminUser } from '../utils/permissions';
import { moduleLoaders } from '../config/moduleRegistry';
import { prefetchHubData } from '../utils/refreshData';
import type { TabId } from '../types/navigation';

const ActivityHistory = lazy(moduleLoaders.history);
const Timesheet = lazy(moduleLoaders.timesheet);
const Schedule = lazy(moduleLoaders.schedule);
const Roster = lazy(moduleLoaders.roster);
const SwapShift = lazy(moduleLoaders.swap);
const Operations = lazy(moduleLoaders.operations);
const Checklist = lazy(moduleLoaders.checklist);
const Handover = lazy(moduleLoaders.handover);
const Payroll = lazy(moduleLoaders.payroll);
const Advance = lazy(moduleLoaders.advance);
const Discipline = lazy(moduleLoaders.discipline);
const Reward = lazy(moduleLoaders.reward);
const NewsFeed = lazy(moduleLoaders.news);
const SoldOut = lazy(moduleLoaders.soldout);
const Feedback = lazy(moduleLoaders.feedback);
const Training = lazy(moduleLoaders.training);
const Guide = lazy(moduleLoaders.guide);
const HrList = lazy(moduleLoaders.hr_list);
const AdminOrg = lazy(moduleLoaders.admin_org);
const AdminShift = lazy(moduleLoaders.admin_shift);
const AdminOperations = lazy(moduleLoaders.admin_operations);
const AdminChecklist = lazy(moduleLoaders.admin_checklist);
const AdminPayroll = lazy(moduleLoaders.admin_payroll);
const Admin = lazy(moduleLoaders.admin);
const AdminAnalytics = lazy(moduleLoaders.admin_analytics);

const UserPayroll = () => <Payroll mode="user" />;
const PayrollAdmin = () => <Payroll mode="admin" />;
const UserAdvance = () => <Advance mode="user" />;
const AdminAdvance = () => <Advance mode="admin" />;
const UserSchedule = () => <Schedule mode="user" />;
const AdminSchedule = () => <Schedule mode="admin" />;
const UserDiscipline = () => <Discipline mode="user" />;
const AdminDiscipline = () => <Discipline mode="admin" />;

interface HubTab {
  id: string;
  label: string;
  shortLabel?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  component: ComponentType;
}

function HubFallback() {
  return (
    <div className="flex items-center justify-center gap-2.5 py-20 text-xs font-bold text-[var(--kg-text-muted)]">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--kg-primary)] border-t-transparent" />
      <span>Đang tải phân hệ...</span>
    </div>
  );
}

function SubmoduleErrorFallback({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="p-4 sm:p-6">
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h4 className="text-sm sm:text-base font-extrabold text-[var(--kg-text)]">
            Không thể tải phân hệ {label}
          </h4>
          <p className="text-xs sm:text-sm text-[var(--kg-text-muted)] mt-1">
            Đã có sự cố khi kết nối dữ liệu phân hệ này. Bạn có thể thử nạp lại.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-xs sm:text-sm font-bold rounded-xl bg-[var(--kg-primary)] text-white hover:brightness-105 active:scale-98 transition inline-flex items-center justify-center gap-2 shadow-xs"
        >
          <RefreshCw size={15} /> Thử lại
        </button>
      </div>
    </div>
  );
}

function ModuleHub({
  hubId,
  tabs,
  initialTab,
  summaryStrip,
}: {
  hubId: string;
  tabs: HubTab[];
  initialTab?: string;
  summaryStrip?: ReactNode;
}) {
  const currentUser = useAppStore(state => state.currentUser);
  const isAdminBlocked = hubId.startsWith('admin_') && !isAdminUser(currentUser);
  const allowedTabs = isAdminBlocked
    ? []
    : tabs.filter(tab => hasTabPermission(tab.id as TabId, currentUser));

  const resolveInitialSubTab = () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlTab = urlParams.get('tab');
      const urlSub = urlParams.get('sub');
      if (urlTab === hubId && urlSub && tabs.some(t => t.id === urlSub)) {
        return urlSub;
      }
      const savedSub = sessionStorage.getItem(`kg_hub_subtab_${hubId}`);
      if (savedSub && tabs.some(t => t.id === savedSub)) {
        return savedSub;
      }
    } catch { /* ignore */ }
    return initialTab || tabs[0]?.id || '';
  };

  const MAX_KEEP_ALIVE_SUBTABS = 2;
  const [activeId, setActiveId] = useState(resolveInitialSubTab);
  const active = allowedTabs.find(tab => tab.id === activeId) || allowedTabs[0];
  const [visitedTabs, setVisitedTabs] = useState<string[]>(() => [resolveInitialSubTab()]);

  const handleSelectTab = (tabId: string, updateUrl = true) => {
    setActiveId(tabId);
    setVisitedTabs(prev => {
      if (prev[prev.length - 1] === tabId) return prev;
      const next = [...prev.filter(id => id !== tabId), tabId];
      return next.length > MAX_KEEP_ALIVE_SUBTABS ? next.slice(next.length - MAX_KEEP_ALIVE_SUBTABS) : next;
    });
    try {
      sessionStorage.setItem(`kg_hub_subtab_${hubId}`, tabId);
      window.dispatchEvent(new CustomEvent('kg:subtab-changed', { detail: { hub: hubId, subTab: tabId } }));
      if (updateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', hubId);
        url.searchParams.set('sub', tabId);
        window.history.replaceState({ tab: hubId, sub: tabId }, '', url.toString());
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const onSubTabSelect = (e: Event) => {
      const detail = (e as CustomEvent<{ hub: string; subTab: string }>).detail;
      if (detail && detail.hub === hubId && detail.subTab) {
        handleSelectTab(detail.subTab, false);
      }
    };
    const onPopState = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const sub = urlParams.get('sub');
        if (urlParams.get('tab') === hubId && sub) {
          handleSelectTab(sub, false);
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('kg:subtab-select', onSubTabSelect);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('kg:subtab-select', onSubTabSelect);
      window.removeEventListener('popstate', onPopState);
    };
  }, [hubId]);

  if (isAdminBlocked || !active) return null;

  const isFourTabHub = allowedTabs.length === 4;
  const mobileTabsLayoutClass =
    allowedTabs.length === 2
      ? 'grid grid-cols-2 sm:flex'
      : allowedTabs.length === 3
        ? 'grid grid-cols-3 sm:flex'
        : allowedTabs.length === 4
          ? 'grid grid-cols-4 sm:flex'
          : 'flex overflow-x-auto hide-scrollbar';

  return (
    <div className="kg-module-hub min-h-full">
      <div className="kg-module-tabs-wrap relative md:sticky md:top-[60px] z-20 bg-[var(--kg-bg)]/95 pb-2.5 pt-0.5 md:backdrop-blur-sm transition-colors">
        <div
          className={`kg-module-tabs mx-auto max-w-[1520px] ${mobileTabsLayoutClass} gap-1 sm:gap-1.5 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] p-1 sm:p-1.5 shadow-xs`}
        >
          {allowedTabs.map(tab => {
            const Icon = tab.icon;
            const selected = tab.id === active.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={(e) => {
                  handleSelectTab(tab.id, true);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }}
                aria-current={selected ? 'page' : undefined}
                className={`kg-module-tab relative inline-flex min-w-0 sm:min-w-max sm:flex-1 items-center justify-center rounded-xl transition-all duration-150 select-none touch-manipulation ${
                  isFourTabHub
                    ? 'flex-col sm:flex-row gap-0.5 sm:gap-2 px-1 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs min-h-[46px] sm:min-h-[40px]'
                    : 'flex-row gap-1 sm:gap-2 px-2 sm:px-3.5 py-2 text-[11.5px] sm:text-xs min-h-[40px]'
                } ${
                  selected
                    ? 'bg-[var(--kg-primary)] text-white font-bold shadow-xs'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)] font-semibold'
                }`}
              >
                <Icon size={isFourTabHub ? 14 : 15} className={`flex-shrink-0 ${selected ? 'text-white' : 'text-[var(--kg-text-muted)]'}`} />
                <span className="hidden sm:inline tracking-tight whitespace-nowrap">{tab.label}</span>
                <span className="inline sm:hidden tracking-tight leading-tight truncate max-w-full">{tab.shortLabel || tab.label}</span>
                {selected && (
                  <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-[#FF8A73] flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
      {summaryStrip}
      <div className="kg-module-content">
        {allowedTabs.map(tab => {
          const isSelected = tab.id === active.id;
          const isVisited = visitedTabs.includes(tab.id) || isSelected;
          if (!isVisited) return null;
          const Component = tab.component;
          return (
            <div
              key={tab.id}
              className={isSelected ? 'kg-hub-panel block' : 'hidden'}
              style={{ display: isSelected ? 'block' : 'none' }}
            >
              <AppErrorBoundary
                resetKey={tab.id}
                fallback={({ reset }) => <SubmoduleErrorFallback label={tab.label} onRetry={reset} />}
              >
                <Suspense fallback={<HubFallback />}>
                  <Component />
                </Suspense>
              </AppErrorBoundary>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AttendanceHub() {
  useEffect(() => {
    prefetchHubData('attendance');
  }, []);

  return <ModuleHub hubId="attendance" tabs={[
    { id: 'payroll', label: 'Phiếu lương', shortLabel: 'Phiếu lương', icon: Banknote, component: UserPayroll },
    { id: 'timesheet', label: 'Bảng công', icon: Clock3, component: Timesheet },
    { id: 'history', label: 'Lịch sử', icon: History, component: ActivityHistory },
    { id: 'advance', label: 'Ứng lương', shortLabel: 'Ứng lương', icon: HandCoins, component: UserAdvance },
  ]} />;
}

export function WorkforceHub() {
  useEffect(() => {
    prefetchHubData('workforce');
  }, []);

  return <ModuleHub hubId="workforce" tabs={[
    { id: 'schedule', label: 'Lịch của tôi', shortLabel: 'Lịch tôi', icon: CalendarDays, component: UserSchedule },
    { id: 'roster', label: 'Lịch tổng', shortLabel: 'Lịch tổng', icon: CalendarRange, component: Roster },
    { id: 'swap', label: 'Đổi ca', shortLabel: 'Đổi ca', icon: Repeat2, component: SwapShift },
  ]} />;
}

export function WorkHub() {
  const currentUser = useAppStore(state => state.currentUser);
  const soldOutItems = useAppStore(state => state.soldOutItems);
  const [openIncidentCount, setOpenIncidentCount] = useState<number>(0);

  const canViewSoldOut = hasTabPermission('soldout', currentUser);
  const canViewHandover = hasTabPermission('handover', currentUser);

  useEffect(() => {
    if (!currentUser?.username || !canViewHandover) return;
    let cancelled = false;
    callApi(
      'GET_INCIDENTS',
      { username: currentUser.username, role: currentUser.role },
      { background: true }
    ).then((res) => {
      if (cancelled || !res?.ok) return;
      const raw = Array.isArray(res.data?.incidents)
        ? res.data.incidents
        : Array.isArray(res.data)
          ? res.data
          : [];
      const openCount = raw.filter((item: any) => {
        const st = normalizeIncidentStatus(item?.status);
        return st === 'Open' || st === 'Investigating';
      }).length;
      setOpenIncidentCount(openCount);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentUser?.username, currentUser?.role, canViewHandover]);

  const jumpToWorkSubTab = (subTab: 'soldout' | 'handover') => {
    try {
      sessionStorage.setItem('kg_hub_subtab_work', subTab);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'work');
      url.searchParams.set('sub', subTab);
      window.history.replaceState({ tab: 'work', sub: subTab }, '', url.toString());
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('kg:subtab-select', { detail: { hub: 'work', subTab } }));
  };

  const summaryStrip =
    canViewSoldOut || canViewHandover ? (
      <div className="mb-3 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2 flex flex-wrap items-center justify-between gap-2 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {canViewSoldOut && (
            <button
              type="button"
              onClick={() => jumpToWorkSubTab('soldout')}
              className={`min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors active:scale-95 ${
                soldOutItems.length > 0
                  ? 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/30 text-amber-800 dark:text-amber-300'
                  : 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              <UtensilsCrossed size={14} className="flex-shrink-0" />
              <span>
                Món hết: <span className="font-mono tabular-nums font-extrabold">{soldOutItems.length}</span>
              </span>
              {soldOutItems.length > 0 && (
                <span className="hidden md:inline text-[11px] font-medium opacity-90 truncate max-w-[200px]">
                  ({soldOutItems.slice(0, 2).map((i) => i.itemName).join(', ')}{soldOutItems.length > 2 ? '…' : ''})
                </span>
              )}
            </button>
          )}
          {canViewHandover && (
            <button
              type="button"
              onClick={() => jumpToWorkSubTab('handover')}
              className={`min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors active:scale-95 ${
                openIncidentCount > 0
                  ? 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/30 text-[var(--kg-danger)]'
                  : 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span>
                Sự cố mở: <span className="font-mono tabular-nums font-extrabold">{openIncidentCount}</span>
              </span>
            </button>
          )}
        </div>
        <span className="hidden sm:inline text-[11px] font-medium text-[var(--kg-text-soft)]">
          Chạm để mở nhanh mục xử lý
        </span>
      </div>
    ) : null;

  return <ModuleHub hubId="work" summaryStrip={summaryStrip} tabs={[
    { id: 'checklist', label: 'Checklist phân khu', shortLabel: 'Checklist', icon: ClipboardCheck, component: Checklist },
    { id: 'operations', label: 'Phân công trực', shortLabel: 'Phân công', icon: Network, component: Operations },
    { id: 'handover', label: 'Bàn giao', shortLabel: 'Bàn giao', icon: Repeat2, component: Handover },
    { id: 'soldout', label: 'Món hết', shortLabel: 'Món hết', icon: UtensilsCrossed, component: SoldOut },
  ]} />;
}

export function IncomeHub() {
  return <ModuleHub hubId="income" tabs={[
    { id: 'reward', label: 'Ghi nhận', shortLabel: 'Ghi nhận', icon: Trophy, component: Reward },
    { id: 'discipline', label: 'Kỷ luật', shortLabel: 'Kỷ luật', icon: ShieldAlert, component: UserDiscipline },
  ]} />;
}

export function CommunicationsHub() {
  return <ModuleHub hubId="communications" tabs={[
    { id: 'news', label: 'Bảng tin', shortLabel: 'Bảng tin', icon: Newspaper, component: NewsFeed },
    { id: 'feedback', label: 'Góp ý', shortLabel: 'Góp ý', icon: MessageSquareText, component: Feedback },
  ]} />;
}

export function KnowledgeHub() {
  return <ModuleHub hubId="knowledge" tabs={[
    { id: 'training', label: 'Đào tạo', shortLabel: 'Đào tạo', icon: GraduationCap, component: Training },
    { id: 'guide', label: 'Hướng dẫn', shortLabel: 'Hướng dẫn', icon: BookOpen, component: Guide },
  ]} />;
}

export function AdminPeopleHub() {
  return <ModuleHub hubId="admin_people" tabs={[
    { id: 'employees', label: 'Hồ sơ nhân sự', shortLabel: 'Hồ sơ', icon: Users, component: HrList },
    { id: 'organization', label: 'Tổ chức & quyền', shortLabel: 'Cơ cấu', icon: KeyRound, component: AdminOrg },
  ]} />;
}

export function AdminWorkforceHub() {
  return <ModuleHub hubId="admin_workforce" tabs={[
    { id: 'schedule', label: 'Xếp lịch', shortLabel: 'Xếp lịch', icon: CalendarRange, component: AdminSchedule },
    { id: 'settings', label: 'Ca & GPS', shortLabel: 'Ca & GPS', icon: MapPinned, component: AdminShift },
  ]} />;
}

export function AdminWorkHub() {
  return <ModuleHub hubId="admin_work" tabs={[
    { id: 'checklist', label: 'Cấu hình Checklist', shortLabel: 'Checklist', icon: ClipboardCheck, component: AdminChecklist },
    { id: 'operations', label: 'Khu trực & Điều phối', shortLabel: 'Khu trực', icon: Network, component: AdminOperations },
  ]} />;
}

export function AdminIncomeHub() {
  return <ModuleHub hubId="admin_income" tabs={[
    { id: 'config', label: 'Cấu hình lương', shortLabel: 'Cấu hình', icon: Settings2, component: AdminPayroll },
    { id: 'payroll', label: 'Bảng lương', shortLabel: 'Bảng lương', icon: Banknote, component: PayrollAdmin },
    { id: 'advance', label: 'Ứng lương', shortLabel: 'Ứng lương', icon: HandCoins, component: AdminAdvance },
    { id: 'discipline', label: 'Kỷ luật', shortLabel: 'Kỷ luật', icon: ShieldAlert, component: AdminDiscipline },
  ]} />;
}

export function AdminSystemHub() {
  return <ModuleHub hubId="admin_system" tabs={[
    { id: 'analytics', label: 'Báo cáo', shortLabel: 'Báo cáo', icon: BarChart3, component: AdminAnalytics },
    { id: 'ai', label: 'AI & API', shortLabel: 'AI & API', icon: Sparkles, component: Admin },
  ]} />;
}
