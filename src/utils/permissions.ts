// ============================================
// permissions.ts - Centralized Role and Position Based Access Control (RBAC)
// ============================================

import type { User } from '../store/useAppStore';
import type { TabId } from '../types/navigation';
import { moduleLabel, navigationModules } from '../config/moduleRegistry';
export type { TabId } from '../types/navigation';

/**
 * Check whether a user has strict administrator privileges.
 * Note: 'tester' is intentionally NOT treated as admin.
 */
export function isAdminUser(user: User | null | undefined): boolean {
  return user?.role === 'admin';
}

/**
 * Check if a user with a given role and position has permission to access a specific tab/module.
 * 
 * Rules:
 * 1. Strictly Admin role has full access to everything (tester does NOT get admin access).
 * 2. Management and Configuration tabs are strictly restricted to Admin role.
 * 3. Personal/Core tabs (Dashboard, Check-in, Schedule, Payroll, History, Profile, etc.) are available to all staff.
 * 4. Operational tabs are filtered based on the user's specific work position (e.g. Cleaners and Security
 *    do not see Sold-out reports, training materials, or shift handovers).
 */
export function hasTabPermission(tabId: TabId, user: User | null): boolean {
  if (!user) return false;

  const position = user.position || 'Phục vụ';
  const registryModule = navigationModules.find(module => module.id === tabId);

  // 1. Strictly Admin bypasses all restrictions (tester does NOT get admin access)
  if (isAdminUser(user)) {
    return true;
  }

  if (registryModule?.adminOnly) return false;

  // 2. Admin/Management tabs (Admin only)
  const adminTabs: TabId[] = [
    'admin_ops',
    'admin_people_pay',
    'admin_system',
    // Legacy admin hub & leaf aliases
    'admin_people',
    'admin_workforce',
    'admin_work',
    'admin_income',
    'admin',
    'hr_list',
    'admin_org',
    'admin_shift',
    'admin_operations',
    'admin_payroll',
    'admin_checklist',
    'admin_analytics',
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

  if (tabId === 'handover' || tabId === 'incidents') {
    // Handover & incident ledger are only for responsible roles (cashiers, kitchen, bar, leaders, managers)
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
    incidents: 'Sự cố ca',
    operations: 'Phân công trực',
    schedule: 'Lịch đăng ký',
    swap: 'Đổi ca',
    roster: 'Lịch tổng',
    ledger: 'Bảng công & Nhật ký',
    history: 'Lịch sử chấm công',
    timesheet: 'Bảng công',
    advance: 'Ứng lương',
    payroll: 'Phiếu lương',
    discipline: 'Kỷ luật',
    reward: 'King Coins',
    income: 'Cộng đồng',
    admin_ops: 'Điều hành & Duyệt',
    admin_people_pay: 'Nhân sự & Lương',
    admin_system: 'Báo cáo & Hệ thống',
    admin_people: 'Nhân sự & Lương',
    admin_workforce: 'Điều hành & Duyệt',
    admin_work: 'Điều hành & Duyệt',
    admin_income: 'Nhân sự & Lương',
    admin: 'Cấu hình & AI',
    hr_list: 'Danh sách nhân sự',
    admin_org: 'Tổ chức & Quyền',
    admin_shift: 'Phân ca',
    admin_operations: 'Phân công vận hành',
    admin_payroll: 'Cấu hình lương',
    admin_checklist: 'Cấu hình checklist',
    admin_analytics: 'Thống kê & Báo cáo',
    profile: 'Hồ sơ cá nhân',
    guide: 'Kiến thức & SOP',
  };
  return labels[tabId] || tabId;
}
