import { lazy, Suspense, useState, useEffect, useCallback, type ComponentType, type ReactNode } from 'react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  HandCoins,
  Inbox,
  MessageSquareText,
  Network,
  Newspaper,
  RefreshCw,
  Repeat2,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import AppErrorBoundary from '../components/AppErrorBoundary';
import { KgModuleHero } from '../components/KgDesignSystem';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { normalizeIncidentStatus } from '../utils/operationsReconciliation';
import { hasTabPermission, isAdminUser } from '../utils/permissions';
import { moduleLoaders } from '../config/moduleRegistry';
import { prefetchHubData } from '../utils/refreshData';
import type { TabId } from '../types/navigation';

const AttendanceLedger = lazy(moduleLoaders.ledger);
const Schedule = lazy(moduleLoaders.schedule);
const Roster = lazy(moduleLoaders.roster);
const SwapShift = lazy(moduleLoaders.swap);
const Checklist = lazy(moduleLoaders.checklist);
const Handover = lazy(moduleLoaders.handover);
const IncidentTracker = lazy(moduleLoaders.incidents);
const Payroll = lazy(moduleLoaders.payroll);
const Advance = lazy(moduleLoaders.advance);
const Discipline = lazy(moduleLoaders.discipline);
const Reward = lazy(moduleLoaders.reward);
const NewsFeed = lazy(moduleLoaders.news);
const SoldOut = lazy(moduleLoaders.soldout);
const Feedback = lazy(moduleLoaders.feedback);
const Training = lazy(moduleLoaders.training);
const HrList = lazy(moduleLoaders.hr_list);
const AdminApprovalInbox = lazy(moduleLoaders.admin_inbox);
const AdminOperations = lazy(moduleLoaders.admin_operations);
const AdminChecklist = lazy(moduleLoaders.admin_checklist);
const MonthlySalaryManager = lazy(moduleLoaders.salary_rates);
const AdminAnalytics = lazy(moduleLoaders.admin_analytics);
const AdminSettingsUnified = lazy(moduleLoaders.admin_settings);
const AdminAuditLog = lazy(moduleLoaders.admin_audit);

const UserAttendanceLedger = () => <AttendanceLedger initialView="ledger" />;
const UserPayroll = () => <Payroll mode="user" />;
const PayrollAdmin = () => <Payroll mode="admin" />;
const UserAdvance = () => <Advance mode="user" />;
const UserSchedule = () => <Schedule mode="user" />;
const AdminSchedule = () => <Schedule mode="admin" />;
const UserDiscipline = () => <Discipline mode="user" />;
const AdminDiscipline = () => <Discipline mode="admin" />;

function AdminSalaryRates() {
  const currentUser = useAppStore((s) => s.currentUser);
  const users = useAppStore((s) => s.users);
  if (!isAdminUser(currentUser) || !currentUser) return null;
  return (
    <div className="p-0 sm:p-2 md:p-4 space-y-4 kg-animate-fade-up max-w-6xl mx-auto">
      <KgModuleHero
        moduleId="admin-payroll"
        title="Đơn Giá Lương & Hạn Mức Ứng"
        description="Khai báo mức lương theo giờ hoặc lương tháng chuẩn 30 ngày, duyệt đề nghị điều chỉnh và cấu hình hạn mức ứng lương."
        eyebrow="Nhân sự & Lương"
      />
      <MonthlySalaryManager currentUser={currentUser} users={users} />
    </div>
  );
}

interface HubTab {
  id: string;
  label: string;
  shortLabel?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  component: ComponentType;
  badge?: number;
  badgeTone?: 'danger' | 'warning' | 'neutral';
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
          className="kg-pressable px-4 py-2 min-h-[44px] sm:min-h-[38px] text-xs sm:text-sm font-bold rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] transition inline-flex items-center justify-center gap-2 shadow-xs touch-manipulation"
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
  subTabAliases,
}: {
  hubId: string;
  tabs: HubTab[];
  initialTab?: string;
  summaryStrip?: ReactNode;
  subTabAliases?: Record<string, string>;
}) {
  const currentUser = useAppStore((state) => state.currentUser);
  const isAdminBlocked = hubId.startsWith('admin_') && !isAdminUser(currentUser);
  const allowedTabs = isAdminBlocked
    ? []
    : tabs.filter((tab) => hasTabPermission(tab.id as TabId, currentUser));

  const normalizeSubTab = useCallback(
    (rawSub: string | null | undefined): string => {
      if (!rawSub) return '';
      const mapped = subTabAliases?.[rawSub] || rawSub;
      return tabs.some((t) => t.id === mapped) ? mapped : '';
    },
    [subTabAliases, tabs],
  );

  const resolveInitialSubTab = () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlTab = urlParams.get('tab');
      const urlSub = normalizeSubTab(urlParams.get('sub'));
      if (urlTab === hubId && urlSub) {
        return urlSub;
      }
      const savedSub = normalizeSubTab(sessionStorage.getItem(`kg_hub_subtab_${hubId}`));
      if (savedSub) {
        return savedSub;
      }
    } catch {
      /* ignore */
    }
    return initialTab || tabs[0]?.id || '';
  };

  const MAX_KEEP_ALIVE_SUBTABS = 2;
  const [activeId, setActiveId] = useState(resolveInitialSubTab);
  const active = allowedTabs.find((tab) => tab.id === activeId) || allowedTabs[0];
  const [visitedTabs, setVisitedTabs] = useState<string[]>(() => [resolveInitialSubTab()]);

  const handleSelectTab = useCallback(
    (rawTabId: string, updateUrl = true) => {
      const tabId = normalizeSubTab(rawTabId) || rawTabId;
      setActiveId(tabId);
      setVisitedTabs((prev) => {
        if (prev[prev.length - 1] === tabId) return prev;
        const next = [...prev.filter((id) => id !== tabId), tabId];
        return next.length > MAX_KEEP_ALIVE_SUBTABS
          ? next.slice(next.length - MAX_KEEP_ALIVE_SUBTABS)
          : next;
      });
      try {
        sessionStorage.setItem(`kg_hub_subtab_${hubId}`, tabId);
        window.dispatchEvent(
          new CustomEvent('kg:subtab-changed', { detail: { hub: hubId, subTab: tabId } }),
        );
        if (updateUrl) {
          const url = new URL(window.location.href);
          url.searchParams.set('tab', hubId);
          url.searchParams.set('sub', tabId);
          window.history.replaceState({ tab: hubId, sub: tabId }, '', url.toString());
        }
      } catch {
        /* ignore */
      }
    },
    [hubId, normalizeSubTab],
  );

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
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('kg:subtab-select', onSubTabSelect);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('kg:subtab-select', onSubTabSelect);
      window.removeEventListener('popstate', onPopState);
    };
  }, [hubId, handleSelectTab]);

  if (isAdminBlocked || !active) return null;

  return (
    <div className="kg-module-hub min-h-full">
      <div className="kg-module-tabs-wrap relative md:sticky md:top-[64px] z-20 bg-[var(--kg-bg)] border-b border-[var(--kg-border)]/60 pb-3 pt-1 mb-3 sm:mb-4 transition-colors">
        <div
          role="tablist"
          aria-label="Phân hệ con"
          className="kg-module-tabs mx-auto max-w-[1520px] flex overflow-x-auto md:flex-wrap md:overflow-visible hide-scrollbar no-scrollbar items-center gap-2"
        >
          {allowedTabs.map((tab) => {
            const Icon = tab.icon;
            const selected = tab.id === active.id;
            const hasBadge = typeof tab.badge === 'number' && tab.badge > 0;
            const badgeStyle = selected
              ? 'bg-white/20 dark:bg-black/20 text-current'
              : tab.badgeTone === 'danger'
                ? 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                : tab.badgeTone === 'warning'
                  ? 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                  : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]';
            return (
              <button
                type="button"
                role="tab"
                key={tab.id}
                onClick={(e) => {
                  handleSelectTab(tab.id, true);
                  e.currentTarget.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center',
                  });
                }}
                aria-selected={selected}
                aria-current={selected ? 'page' : undefined}
                className={`kg-module-tab kg-pressable relative inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 text-xs min-h-[44px] sm:min-h-[40px] rounded-[11px] border transition-all duration-150 select-none touch-manipulation whitespace-nowrap flex-shrink-0 ${
                  selected
                    ? 'bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] font-bold shadow-xs'
                    : 'bg-[var(--kg-surface)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:border-[var(--kg-border-strong)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface-2)] font-bold'
                }`}
              >
                <Icon
                  size={15}
                  className={`flex-shrink-0 ${selected ? 'text-current' : 'text-[var(--kg-text-muted)]'}`}
                />
                <span className="hidden lg:inline tracking-tight whitespace-nowrap">{tab.label}</span>
                <span className="inline lg:hidden tracking-tight whitespace-nowrap">
                  {tab.shortLabel || tab.label}
                </span>
                {hasBadge && (
                  <span
                    className={`px-1.5 py-0.5 rounded-[7px] text-[10.5px] font-extrabold font-mono tabular-nums leading-none flex-shrink-0 ${badgeStyle}`}
                  >
                    {tab.badge! > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {summaryStrip}
      <div className="kg-module-content">
        {allowedTabs.map((tab) => {
          const isSelected = tab.id === active.id;
          const isVisited = visitedTabs.includes(tab.id) || isSelected;
          if (!isVisited) return null;
          const Component = tab.component;
          return (
            <div
              key={tab.id}
              data-subtab-panel={tab.id}
              className={isSelected ? 'kg-hub-panel kg-animate-fade-up block' : 'hidden'}
              style={{ display: isSelected ? 'block' : 'none' }}
            >
              <AppErrorBoundary
                resetKey={tab.id}
                fallback={({ reset }) => (
                  <SubmoduleErrorFallback label={tab.label} onRetry={reset} />
                )}
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

  return (
    <ModuleHub
      hubId="attendance"
      subTabAliases={{ timesheet: 'ledger', history: 'ledger' }}
      tabs={[
        { id: 'payroll', label: 'Phiếu lương', shortLabel: 'Phiếu lương', icon: Banknote, component: UserPayroll },
        { id: 'ledger', label: 'Bảng công & Nhật ký', shortLabel: 'Bảng công', icon: Clock3, component: UserAttendanceLedger },
        { id: 'advance', label: 'Ứng lương', shortLabel: 'Ứng lương', icon: HandCoins, component: UserAdvance },
        { id: 'discipline', label: 'Kỷ luật', shortLabel: 'Kỷ luật', icon: ShieldAlert, component: UserDiscipline },
      ]}
    />
  );
}

export function WorkforceHub() {
  useEffect(() => {
    prefetchHubData('workforce');
  }, []);

  return (
    <ModuleHub
      hubId="workforce"
      tabs={[
        { id: 'schedule', label: 'Lịch của tôi', shortLabel: 'Lịch tôi', icon: CalendarDays, component: UserSchedule },
        { id: 'roster', label: 'Lịch tổng', shortLabel: 'Lịch tổng', icon: CalendarRange, component: Roster },
        { id: 'swap', label: 'Đổi ca', shortLabel: 'Đổi ca', icon: Repeat2, component: SwapShift },
      ]}
    />
  );
}

export function WorkHub() {
  const currentUser = useAppStore((state) => state.currentUser);
  const soldOutItems = useAppStore((state) => state.soldOutItems);
  const [openIncidentCount, setOpenIncidentCount] = useState<number>(0);

  const canViewHandover = hasTabPermission('handover', currentUser);

  useEffect(() => {
    if (!currentUser?.username || !canViewHandover) return;
    let cancelled = false;
    callApi(
      'GET_INCIDENTS',
      { username: currentUser.username, role: currentUser.role },
      { background: true },
    )
      .then((res) => {
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
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentUser?.username, currentUser?.role, canViewHandover]);

  return (
    <ModuleHub
      hubId="work"
      subTabAliases={{ operations: 'checklist' }}
      tabs={[
        { id: 'checklist', label: 'Checklist phân khu', shortLabel: 'Checklist', icon: ClipboardCheck, component: Checklist },
        { id: 'handover', label: 'Bàn giao ca', shortLabel: 'Bàn giao', icon: Repeat2, component: Handover },
        {
          id: 'incidents',
          label: 'Sự cố ca',
          shortLabel: 'Sự cố',
          icon: AlertTriangle,
          component: IncidentTracker,
          badge: openIncidentCount,
          badgeTone: 'danger',
        },
        {
          id: 'soldout',
          label: 'Món hết',
          shortLabel: 'Món hết',
          icon: UtensilsCrossed,
          component: SoldOut,
          badge: soldOutItems.length,
          badgeTone: 'warning',
        },
      ]}
    />
  );
}

export function CommunicationsHub() {
  return (
    <ModuleHub
      hubId="communications"
      tabs={[
        { id: 'news', label: 'Bảng tin', shortLabel: 'Bảng tin', icon: Newspaper, component: NewsFeed },
        { id: 'feedback', label: 'Góp ý', shortLabel: 'Góp ý', icon: MessageSquareText, component: Feedback },
        { id: 'reward', label: 'Ghi nhận & Coins', shortLabel: 'Ghi nhận', icon: Trophy, component: Reward },
      ]}
    />
  );
}

export function KnowledgeHub() {
  return (
    <div className="kg-module-hub min-h-full">
      <div className="kg-hub-panel kg-animate-fade-up block">
        <AppErrorBoundary
          resetKey="knowledge-training"
          fallback={({ reset }) => (
            <SubmoduleErrorFallback label="Kiến thức & SOP" onRetry={reset} />
          )}
        >
          <Suspense fallback={<HubFallback />}>
            <Training />
          </Suspense>
        </AppErrorBoundary>
      </div>
    </div>
  );
}

export function AdminOpsHub() {
  const adminPendingQueueCount = useAppStore((state) => state.adminPendingQueueCount);
  return (
    <ModuleHub
      hubId="admin_ops"
      subTabAliases={{ operations: 'dispatch', settings: 'inbox' }}
      tabs={[
        {
          id: 'inbox',
          label: 'Hộp duyệt',
          shortLabel: 'Hộp duyệt',
          icon: Inbox,
          component: AdminApprovalInbox,
          badge: adminPendingQueueCount,
          badgeTone: 'warning',
        },
        { id: 'schedule', label: 'Xếp lịch', shortLabel: 'Xếp lịch', icon: CalendarRange, component: AdminSchedule },
        { id: 'dispatch', label: 'Điều phối', shortLabel: 'Điều phối', icon: Network, component: AdminOperations },
        { id: 'checklist', label: 'Checklist', shortLabel: 'Checklist', icon: ClipboardCheck, component: AdminChecklist },
      ]}
    />
  );
}

export function AdminPeoplePayHub() {
  return (
    <ModuleHub
      hubId="admin_people_pay"
      subTabAliases={{ config: 'salary_rates', organization: 'employees', advance: 'payroll' }}
      tabs={[
        { id: 'employees', label: 'Hồ sơ nhân sự', shortLabel: 'Nhân sự', icon: Users, component: HrList },
        { id: 'payroll', label: 'Bảng lương', shortLabel: 'Bảng lương', icon: Banknote, component: PayrollAdmin },
        { id: 'salary_rates', label: 'Đơn giá lương', shortLabel: 'Đơn giá', icon: Settings2, component: AdminSalaryRates },
        { id: 'discipline', label: 'Kỷ luật', shortLabel: 'Kỷ luật', icon: ShieldAlert, component: AdminDiscipline },
      ]}
    />
  );
}

export function AdminSystemHub() {
  return (
    <ModuleHub
      hubId="admin_system"
      subTabAliases={{ ai: 'settings', organization: 'settings' }}
      tabs={[
        { id: 'analytics', label: 'Báo cáo', shortLabel: 'Báo cáo', icon: BarChart3, component: AdminAnalytics },
        { id: 'settings', label: 'Cấu hình & AI', shortLabel: 'Cấu hình', icon: Settings2, component: AdminSettingsUnified },
        { id: 'audit', label: 'Nhật ký kiểm toán', shortLabel: 'Nhật ký', icon: ShieldCheck, component: AdminAuditLog },
      ]}
    />
  );
}

// Backward-compatible alias exports for legacy routes/imports
export const IncomeHub = CommunicationsHub;
export const AdminPeopleHub = AdminPeoplePayHub;
export const AdminWorkforceHub = AdminOpsHub;
export const AdminWorkHub = AdminOpsHub;
export const AdminIncomeHub = AdminPeoplePayHub;
