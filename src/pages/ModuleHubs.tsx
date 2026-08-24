import { lazy, Suspense, useState, type ComponentType } from 'react';
import {
  Activity,
  Banknote,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Clock3,
  Coins,
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
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { hasTabPermission } from '../utils/permissions';
import type { TabId } from '../types/navigation';

const CheckIn = lazy(() => import('./CheckIn'));
const ActivityHistory = lazy(() => import('./ActivityHistory'));
const Timesheet = lazy(() => import('./Timesheet'));
const Schedule = lazy(() => import('./Schedule'));
const Roster = lazy(() => import('./Roster'));
const SwapShift = lazy(() => import('./SwapShift'));
const Operations = lazy(() => import('./Operations'));
const Checklist = lazy(() => import('./Checklist'));
const Handover = lazy(() => import('./Handover'));
const Payroll = lazy(() => import('./Payroll'));
const Advance = lazy(() => import('./Advance'));
const Discipline = lazy(() => import('./Discipline'));
const Reward = lazy(() => import('./Reward'));
const NewsFeed = lazy(() => import('./NewsFeed'));
const SoldOut = lazy(() => import('./SoldOut'));
const Feedback = lazy(() => import('./Feedback'));
const Training = lazy(() => import('./Training'));
const Guide = lazy(() => import('./Guide'));
const HrList = lazy(() => import('./admin/HrList'));
const AdminOrg = lazy(() => import('./admin/AdminOrg'));
const AdminShift = lazy(() => import('./admin/AdminShift'));
const AdminOperations = lazy(() => import('./admin/AdminOperations'));
const AdminChecklist = lazy(() => import('./admin/AdminChecklistConfig'));
const AdminPayroll = lazy(() => import('./admin/AdminPayroll'));
const Admin = lazy(() => import('./Admin'));
const AdminAnalytics = lazy(() => import('./admin/AdminAnalytics'));

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
    <div className="flex items-center justify-center gap-2 py-20 text-sm font-bold text-slate-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
      Đang mở chức năng...
    </div>
  );
}

function ModuleHub({ tabs, initialTab }: { tabs: HubTab[]; initialTab?: string }) {
  const currentUser = useAppStore(state => state.currentUser);
  const allowedTabs = tabs.filter(tab => hasTabPermission(tab.id as TabId, currentUser));
  const [activeId, setActiveId] = useState(initialTab || tabs[0].id);
  const active = allowedTabs.find(tab => tab.id === activeId) || allowedTabs[0];
  if (!active) return null;
  const ActiveComponent = active.component;

  return (
    <div className="kg-module-hub min-h-full">
      <div className="kg-module-tabs-wrap sticky top-0 z-30 border-b border-[var(--kg-border)] bg-[var(--kg-bg)]/95 px-2 sm:px-4 py-2.5 backdrop-blur-xl transition-colors">
        <div className="kg-module-tabs mx-auto flex max-w-7xl gap-2 overflow-x-auto rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] p-1.5 shadow-sm hide-scrollbar">
          {allowedTabs.map(tab => {
            const Icon = tab.icon;
            const selected = tab.id === active.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={(e) => {
                  setActiveId(tab.id);
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }}
                className={`kg-module-tab relative inline-flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs transition-all duration-200 active:scale-95 select-none ${
                  selected
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white font-black shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/40 scale-[1.02]'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)] font-bold opacity-75'
                }`}
              >
                <Icon size={16} className={`flex-shrink-0 ${selected ? 'text-white' : 'opacity-80'}`} />
                <span className="hidden sm:inline tracking-wide">{tab.label}</span>
                <span className="inline sm:hidden tracking-wide">{tab.shortLabel || tab.label}</span>
                {selected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_white] animate-pulse flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <Suspense fallback={<HubFallback />}>
        <ActiveComponent />
      </Suspense>
    </div>
  );
}

export function AttendanceHub() {
  return <ModuleHub tabs={[
    { id: 'payroll', label: 'Phiếu lương', shortLabel: 'Phiếu lương', icon: Banknote, component: UserPayroll },
    { id: 'timesheet', label: 'Bảng công', icon: Clock3, component: Timesheet },
    { id: 'history', label: 'Lịch sử', icon: History, component: ActivityHistory },
    { id: 'advance', label: 'Ứng lương', shortLabel: 'Ứng lương', icon: HandCoins, component: UserAdvance },
  ]} />;
}

export function WorkforceHub() {
  return <ModuleHub tabs={[
    { id: 'schedule', label: 'Lịch của tôi', shortLabel: 'Lịch tôi', icon: CalendarDays, component: UserSchedule },
    { id: 'roster', label: 'Lịch tổng', shortLabel: 'Lịch tổng', icon: CalendarRange, component: Roster },
    { id: 'swap', label: 'Đổi ca', shortLabel: 'Đổi ca', icon: Repeat2, component: SwapShift },
  ]} />;
}

export function WorkHub() {
  return <ModuleHub tabs={[
    { id: 'checklist', label: 'Checklist phân khu', shortLabel: 'Checklist', icon: ClipboardCheck, component: Checklist },
    { id: 'operations', label: 'Phân công trực', shortLabel: 'Phân công', icon: Network, component: Operations },
    { id: 'handover', label: 'Bàn giao', shortLabel: 'Bàn giao', icon: Repeat2, component: Handover },
    { id: 'soldout', label: 'Món hết', shortLabel: 'Món hết', icon: UtensilsCrossed, component: SoldOut },
  ]} />;
}

export function IncomeHub() {
  return <ModuleHub tabs={[
    { id: 'reward', label: 'Ghi nhận', shortLabel: 'Ghi nhận', icon: Trophy, component: Reward },
    { id: 'discipline', label: 'Kỷ luật', shortLabel: 'Kỷ luật', icon: ShieldAlert, component: UserDiscipline },
  ]} />;
}

export function CommunicationsHub() {
  return <ModuleHub tabs={[
    { id: 'news', label: 'Bảng tin', shortLabel: 'Bảng tin', icon: Newspaper, component: NewsFeed },
    { id: 'feedback', label: 'Góp ý', shortLabel: 'Góp ý', icon: MessageSquareText, component: Feedback },
  ]} />;
}

export function KnowledgeHub() {
  return <ModuleHub tabs={[
    { id: 'training', label: 'Đào tạo', shortLabel: 'Đào tạo', icon: GraduationCap, component: Training },
    { id: 'guide', label: 'Hướng dẫn', shortLabel: 'Hướng dẫn', icon: BookOpen, component: Guide },
  ]} />;
}

export function AdminPeopleHub() {
  return <ModuleHub tabs={[
    { id: 'employees', label: 'Hồ sơ nhân sự', shortLabel: 'Hồ sơ', icon: Users, component: HrList },
    { id: 'organization', label: 'Tổ chức & quyền', shortLabel: 'Cơ cấu', icon: KeyRound, component: AdminOrg },
  ]} />;
}

export function AdminWorkforceHub() {
  return <ModuleHub tabs={[
    { id: 'schedule', label: 'Xếp lịch', shortLabel: 'Xếp lịch', icon: CalendarRange, component: AdminSchedule },
    { id: 'settings', label: 'Ca & GPS', shortLabel: 'Ca & GPS', icon: MapPinned, component: AdminShift },
  ]} />;
}

export function AdminWorkHub() {
  return <ModuleHub tabs={[
    { id: 'checklist', label: 'Cấu hình Checklist', shortLabel: 'Checklist', icon: ClipboardCheck, component: AdminChecklist },
    { id: 'operations', label: 'Khu trực & Điều phối', shortLabel: 'Khu trực', icon: Network, component: AdminOperations },
  ]} />;
}

export function AdminIncomeHub() {
  return <ModuleHub tabs={[
    { id: 'config', label: 'Cấu hình lương', shortLabel: 'Cấu hình', icon: Settings2, component: AdminPayroll },
    { id: 'payroll', label: 'Bảng lương', shortLabel: 'Bảng lương', icon: Banknote, component: PayrollAdmin },
    { id: 'advance', label: 'Ứng lương', shortLabel: 'Ứng lương', icon: HandCoins, component: AdminAdvance },
    { id: 'discipline', label: 'Kỷ luật', shortLabel: 'Kỷ luật', icon: ShieldAlert, component: AdminDiscipline },
  ]} />;
}

export function AdminSystemHub() {
  return <ModuleHub tabs={[
    { id: 'analytics', label: 'Báo cáo', shortLabel: 'Báo cáo', icon: BarChart3, component: AdminAnalytics },
    { id: 'ai', label: 'AI & API', shortLabel: 'AI & API', icon: Sparkles, component: Admin },
    { id: 'organization', label: 'Doanh nghiệp', shortLabel: 'Doanh nghiệp', icon: Building2, component: AdminOrg },
  ]} />;
}
