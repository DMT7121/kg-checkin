// ============================================
// permissions.ts - Centralized Role and Position Based Access Control (RBAC)
// ============================================

import { User } from '../store/useAppStore';
import type { TabId } from '../types/navigation';
import { moduleLabel, navigationModules } from '../config/moduleRegistry';
export type { TabId } from '../types/navigation';

/**
 * Check if a user with a given role and position has permission to access a specific tab/module.
 * 
 * Rules:
 * 1. Admin and Tester roles have full access to everything.
 * 2. Management and Configuration tabs are strictly restricted to Admin & Tester roles.
 * 3. Personal/Core tabs (Dashboard, Check-in, Schedule, Payroll, History, Profile, etc.) are available to all staff.
 * 4. Operational tabs are filtered based on the user's specific work position (e.g. Cleaners and Security
 *    do not see Sold-out reports, training materials, or shift handovers).
 */
export function hasTabPermission(tabId: TabId, user: User | null): boolean {
  if (!user) return false;

  const role = user.role || 'user';
  const position = user.position || 'Phục vụ';
  const registryModule = navigationModules.find(module => module.id === tabId);

  // 1. Admin and Tester bypass all restrictions
  if (role === 'admin' || role === 'tester') {
    return true;
  }

  if (registryModule?.adminOnly) return false;

  // 2. Admin/Management tabs (Admin and Tester only)
  const adminTabs: TabId[] = [
    'admin',
    'hr_list',
    'admin_org',
    'admin_shift',
    'admin_operations',
    'admin_payroll',
    'admin_checklist',
    'admin_analytics'
  ];
  if (adminTabs.includes(tabId)) {
    return false;
  }

  // 3. Position-based Operational tab restrictions for normal users
  if (tabId === 'soldout') {
    // Menu soldout is only for service & production departments
    // Allowed: Phục vụ, Tổ trưởng, Quản lý, Thu ngân, Bếp, Pha chế
    // Denied: Tạp vụ, Bảo vệ
    const allowedPositions = ['Phục vụ', 'Tổ trưởng', 'Quản lý', 'Thu ngân', 'Bếp', 'Pha chế'];
    return allowedPositions.includes(position);
  }

  if (tabId === 'handover') {
    // Handover is only for responsible roles (cashiers, kitchen, bar, leaders, managers)
    // Denied: Phục vụ, Tạp vụ, Bảo vệ
    const allowedPositions = ['Quản lý', 'Tổ trưởng', 'Thu ngân', 'Bếp', 'Pha chế'];
    return allowedPositions.includes(position);
  }

  if (tabId === 'training') {
    // SOP training is for core restaurant service and production staff
    // Denied: Tạp vụ, Bảo vệ
    const allowedPositions = ['Phục vụ', 'Tổ trưởng', 'Quản lý', 'Thu ngân', 'Bếp', 'Pha chế'];
    return allowedPositions.includes(position);
  }

  // 4. Default: All other personal/common features are open to everyone
  return true;
}

/**
 * Get display label for a tab/module
 */
export function getTabLabel(tabId: TabId): string {
  const registeredLabel = moduleLabel(tabId);
  if (registeredLabel !== tabId) return registeredLabel;
  const labels: Partial<Record<TabId, string>> = {
    news: 'Bảng tin',
    soldout: 'Món hết',
    feedback: 'Góp ý',
    training: 'Đào tạo',
    checkin: 'Chấm công',
    checklist: 'Checklist việc',
    handover: 'Bàn giao ca',
    operations: 'Phân công trực',
    schedule: 'Lịch đăng ký',
    swap: 'Đổi ca',
    roster: 'Lịch tổng',
    history: 'Lịch sử chấm công',
    timesheet: 'Bảng công',
    advance: 'Ứng lương',
    payroll: 'Phiếu lương',
    discipline: 'Kỷ luật',
    reward: 'King Coins',
    admin: 'Cấu hình AI',
    hr_list: 'Danh sách nhân sự',
    admin_org: 'Tổ chức & Quyền',
    admin_shift: 'Phân ca',
    admin_operations: 'Phân công vận hành',
    admin_payroll: 'Cấu hình lương',
    admin_checklist: 'Cấu hình checklist',
    admin_analytics: 'Thống kê & Báo cáo',
    profile: 'Hồ sơ cá nhân',
    guide: 'Hướng dẫn sử dụng',
  };
  return labels[tabId] || tabId;
}
