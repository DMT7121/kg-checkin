import type { ComponentType } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  Camera,
  LayoutDashboard,
  MessagesSquare,
  Network,
  UserRound,
  UsersRound,
  ClipboardCheck,
} from 'lucide-react';
import type { TabId } from '../types/navigation';

export type NavigationGroup = 'Cá nhân' | 'Vận hành' | 'Quản lý & Cấu hình';

export interface NavigationModule {
  id: TabId;
  label: string;
  shortLabel?: string;
  group: NavigationGroup;
  icon: ComponentType<{ size?: number; className?: string }>;
  bottom?: boolean;
  adminOnly?: boolean;
}

export const BOTTOM_STAFF_TABS: TabId[] = ['dashboard', 'checkin', 'work', 'workforce'];
export const BOTTOM_ADMIN_TABS: TabId[] = ['dashboard', 'checkin', 'admin_ops', 'admin_people_pay'];

export const navigationModules: NavigationModule[] = [
  // 8 Canonical Staff Modules
  { id: 'dashboard', label: 'Hôm nay', shortLabel: 'Hôm nay', group: 'Cá nhân', icon: LayoutDashboard, bottom: true },
  { id: 'checkin', label: 'Chấm công', shortLabel: 'Chấm công', group: 'Cá nhân', icon: Camera, bottom: true },
  { id: 'attendance', label: 'Công & Thu nhập', shortLabel: 'Công lương', group: 'Cá nhân', icon: Activity },
  { id: 'workforce', label: 'Lịch làm việc', shortLabel: 'Lịch ca', group: 'Cá nhân', icon: CalendarDays, bottom: true },
  { id: 'profile', label: 'Hồ sơ của tôi', shortLabel: 'Hồ sơ', group: 'Cá nhân', icon: UserRound },
  { id: 'work', label: 'Vận hành Ca', shortLabel: 'Vận hành', group: 'Vận hành', icon: ClipboardCheck, bottom: true },
  { id: 'communications', label: 'Cộng đồng', shortLabel: 'Cộng đồng', group: 'Vận hành', icon: MessagesSquare },
  { id: 'knowledge', label: 'Kiến thức & SOP', shortLabel: 'SOP', group: 'Vận hành', icon: BookOpen },
  // 3 Canonical Admin Modules
  { id: 'admin_ops', label: 'Điều hành & Duyệt', shortLabel: 'Điều hành', group: 'Quản lý & Cấu hình', icon: Network, adminOnly: true },
  { id: 'admin_people_pay', label: 'Nhân sự & Lương', shortLabel: 'Nhân sự', group: 'Quản lý & Cấu hình', icon: UsersRound, adminOnly: true },
  { id: 'admin_system', label: 'Báo cáo & Hệ thống', shortLabel: 'Hệ thống', group: 'Quản lý & Cấu hình', icon: BarChart3, adminOnly: true },
];

export const moduleLoaders = {
  // Canonical Hub Loaders
  attendance: () => import('../pages/ModuleHubs').then(module => ({ default: module.AttendanceHub })),
  workforce: () => import('../pages/ModuleHubs').then(module => ({ default: module.WorkforceHub })),
  work: () => import('../pages/ModuleHubs').then(module => ({ default: module.WorkHub })),
  communications: () => import('../pages/ModuleHubs').then(module => ({ default: module.CommunicationsHub })),
  knowledge: () => import('../pages/ModuleHubs').then(module => ({ default: module.KnowledgeHub })),
  admin_ops: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminOpsHub })),
  admin_people_pay: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminPeoplePayHub })),
  admin_system: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminSystemHub })),
  // Backward-compatible Hub Alias Loaders
  income: () => import('../pages/ModuleHubs').then(module => ({ default: module.IncomeHub })),
  admin_people: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminPeopleHub })),
  admin_workforce: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminWorkforceHub })),
  admin_work: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminWorkHub })),
  admin_income: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminIncomeHub })),
  // Wave 4–6 Dedicated Leaf Page Loaders
  ledger: () => import('../pages/AttendanceLedger'),
  incidents: () => import('../pages/IncidentTracker'),
  admin_inbox: () => import('../pages/admin/AdminApprovalInbox'),
  salary_rates: () => import('../components/MonthlySalaryManager'),
  admin_settings: () => import('../pages/admin/AdminSettingsUnified'),
  admin_audit: () => import('../pages/admin/AdminAuditLog'),
  // Leaf Page Loaders (preserved for backward compatibility)
  checkin: () => import('../pages/CheckIn'),
  schedule: () => import('../pages/Schedule'),
  history: () => import('../pages/ActivityHistory'),
  swap: () => import('../pages/SwapShift'),
  news: () => import('../pages/NewsFeed'),
  training: () => import('../pages/Training'),
  soldout: () => import('../pages/SoldOut'),
  roster: () => import('../pages/Roster'),
  checklist: () => import('../pages/Checklist'),
  operations: () => import('../pages/Operations'),
  handover: () => import('../pages/Handover'),
  feedback: () => import('../pages/Feedback'),
  admin: () => import('../pages/Admin'),
  hr_list: () => import('../pages/admin/HrList'),
  admin_shift: () => import('../pages/admin/AdminShift'),
  admin_operations: () => import('../pages/admin/AdminOperations'),
  admin_org: () => import('../pages/admin/AdminOrg'),
  admin_payroll: () => import('../pages/admin/AdminPayroll'),
  admin_checklist: () => import('../pages/admin/AdminChecklistConfig'),
  admin_analytics: () => import('../pages/admin/AdminAnalytics'),
  advance: () => import('../pages/Advance'),
  discipline: () => import('../pages/Discipline'),
  payroll: () => import('../pages/Payroll'),
  reward: () => import('../pages/Reward'),
  timesheet: () => import('../pages/Timesheet'),
  guide: () => import('../pages/Guide'),
  profile: () => import('../pages/Profile'),
} as const;

export const moduleLabel = (id: TabId) =>
  navigationModules.find(module => module.id === id)?.label || id;
