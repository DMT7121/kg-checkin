import type { User } from '../store/useAppStore';

export type EmploymentStatus = 'active' | 'leave' | 'resigned' | 'suspended';

export const employmentStatuses: {
  value: EmploymentStatus;
  label: string;
  shortLabel: string;
  description: string;
  badgeClass: string;
}[] = [
  {
    value: 'active',
    label: 'Đang làm việc',
    shortLabel: 'Đang làm',
    description: 'Được chấm công, đăng ký ca, phân công và cấu hình vận hành.',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  },
  {
    value: 'leave',
    label: 'Tạm nghỉ',
    shortLabel: 'Tạm nghỉ',
    description: 'Còn trong danh sách nhân sự nhưng tạm ẩn khỏi phân ca và phân công.',
    badgeClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  },
  {
    value: 'suspended',
    label: 'Đình chỉ',
    shortLabel: 'Đình chỉ',
    description: 'Không được tham gia làm việc cho tới hết thời hạn đình chỉ.',
    badgeClass: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
  },
  {
    value: 'resigned',
    label: 'Đã nghỉ việc',
    shortLabel: 'Nghỉ việc',
    description: 'Hồ sơ được lưu riêng và không tham gia các hoạt động vận hành hiện tại.',
    badgeClass: 'bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
];

export const normalizeEmploymentStatus = (status?: string): EmploymentStatus =>
  employmentStatuses.some(item => item.value === status)
    ? status as EmploymentStatus
    : 'active';

export const getEmploymentStatusMeta = (status?: string) =>
  employmentStatuses.find(item => item.value === normalizeEmploymentStatus(status))!;

export const isWorkEligible = (user?: Pick<User, 'employmentStatus'> | null) =>
  normalizeEmploymentStatus(user?.employmentStatus) === 'active';
