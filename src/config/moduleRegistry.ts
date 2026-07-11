import type { ComponentType } from 'react';
import {
  Activity,
  Banknote,
  BarChart3,
  BookOpen,
  CalendarDays,
  Camera,
  LayoutDashboard,
  MessagesSquare,
  Network,
  UserRound,
  UsersRound,
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

export const navigationModules: NavigationModule[] = [
  { id: 'dashboard', label: 'Hôm nay', group: 'Cá nhân', icon: LayoutDashboard, bottom: true },
  { id: 'checkin', label: 'Chấm công', group: 'Cá nhân', icon: Camera, bottom: true },
  { id: 'attendance', label: 'Chấm công & Bảng công', shortLabel: 'Công', group: 'Cá nhân', icon: Activity },
  { id: 'workforce', label: 'Lịch & Ca làm', shortLabel: 'Lịch ca', group: 'Cá nhân', icon: CalendarDays, bottom: true },
  { id: 'income', label: 'Thu nhập & Ghi nhận', shortLabel: 'Thu nhập', group: 'Cá nhân', icon: Banknote, bottom: true },
  { id: 'profile', label: 'Hồ sơ của tôi', group: 'Cá nhân', icon: UserRound },
  { id: 'work', label: 'Công việc & Điều phối', shortLabel: 'Công việc', group: 'Vận hành', icon: Network },
  { id: 'communications', label: 'Truyền thông vận hành', shortLabel: 'Bảng tin', group: 'Vận hành', icon: MessagesSquare },
  { id: 'knowledge', label: 'Kiến thức & Đào tạo', shortLabel: 'Kiến thức', group: 'Vận hành', icon: BookOpen },
  { id: 'admin_people', label: 'Nhân sự & Tổ chức', group: 'Quản lý & Cấu hình', icon: UsersRound, adminOnly: true },
  { id: 'admin_workforce', label: 'Ca làm & Chấm công', group: 'Quản lý & Cấu hình', icon: CalendarDays, adminOnly: true },
  { id: 'admin_work', label: 'Điều phối & Công việc', group: 'Quản lý & Cấu hình', icon: Network, adminOnly: true },
  { id: 'admin_income', label: 'Lương & Ghi nhận', group: 'Quản lý & Cấu hình', icon: Banknote, adminOnly: true },
  { id: 'admin_system', label: 'Hệ thống & Báo cáo', group: 'Quản lý & Cấu hình', icon: BarChart3, adminOnly: true },
];

export const moduleLoaders = {
  attendance: () => import('../pages/ModuleHubs').then(module => ({ default: module.AttendanceHub })),
  workforce: () => import('../pages/ModuleHubs').then(module => ({ default: module.WorkforceHub })),
  work: () => import('../pages/ModuleHubs').then(module => ({ default: module.WorkHub })),
  income: () => import('../pages/ModuleHubs').then(module => ({ default: module.IncomeHub })),
  communications: () => import('../pages/ModuleHubs').then(module => ({ default: module.CommunicationsHub })),
  knowledge: () => import('../pages/ModuleHubs').then(module => ({ default: module.KnowledgeHub })),
  admin_people: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminPeopleHub })),
  admin_workforce: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminWorkforceHub })),
  admin_work: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminWorkHub })),
  admin_income: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminIncomeHub })),
  admin_system: () => import('../pages/ModuleHubs').then(module => ({ default: module.AdminSystemHub })),
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
