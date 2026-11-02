import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  Sun,
  Moon,
  Power,
  Clock,
  MoreHorizontal,
  GraduationCap,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  User as UserIcon,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import NewbieGuideModal from './NewbieGuideModal';
import KgCommandPalette from './KgCommandPalette';
import { KgVersionBadge } from './VersionReleaseModal';
import { APP_CODENAME, APP_VERSION_TAG, openReleaseNotesModal } from '../config/releaseNotes';
import { KgActionSheet, KgBottomSheet, KgSyncStatus } from './KgDesignSystem';
import { getTabLabel, hasTabPermission } from '../utils/permissions';
import { navigationModules, type NavigationGroup } from '../config/moduleRegistry';
import { getQueue } from '../utils/offlineQueue';
import type { TabId } from '../types/navigation';

const WIDE_MODULE_TABS = new Set<TabId>([
  'attendance',
  'workforce',
  'work',
  'income',
  'admin_people',
  'admin_workforce',
  'admin_work',
  'admin_income',
  'admin_system',
  'schedule',
  'roster',
  'timesheet',
  'payroll',
  'admin_shift',
  'admin_payroll',
  'admin_operations',
  'admin_analytics',
  'hr_list',
]);

export default function KgAppShell({
  children,
  onPrefetch,
}: {
  children: React.ReactNode;
  onPrefetch?: (tabId: TabId) => void;
}) {
  const currentTab = useAppStore((state) => state.currentTab);
  const currentUser = useAppStore((state) => state.currentUser);
  const isDark = useAppStore((state) => state.isDark);
  const shiftName = useAppStore((state) => state.shiftName);
  const setCurrentTab = useAppStore((state) => state.setCurrentTab);
  const logout = useAppStore((state) => state.logout);
  const toggleDarkMode = useAppStore((state) => state.toggleDarkMode);

  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMobileAccountOpen, setIsMobileAccountOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(() => getQueue().length);

  // v4.0 Default: Slim 76px Architectural Icon Rail (expandable on demand)
  const [isRailExpanded, setIsRailExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kg_rail_expanded_v4') === 'true';
    } catch {
      return false;
    }
  });

  const toggleRailExpanded = () => {
    setIsRailExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('kg_rail_expanded_v4', String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      }
    };
    const handleQueueUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number }>).detail;
      setPendingSyncCount(typeof detail?.count === 'number' ? detail.count : getQueue().length);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('kg:offline-queue-updated', handleQueueUpdate);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('kg:offline-queue-updated', handleQueueUpdate);
    };
  }, []);

  const handleLogout = () => {
    setIsMobileAccountOpen(false);
    logout();
    document.documentElement.classList.remove('dark');
  };

  const handleTabChange = (tab: TabId) => {
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';
  const allowedModules = navigationModules.filter((module) => hasTabPermission(module.id, currentUser));
  const isWideModule = WIDE_MODULE_TABS.has(currentTab);

  const activeModuleObj = allowedModules.find((m) => m.id === currentTab);
  const activeTitle = activeModuleObj?.label || getTabLabel(currentTab);
  const activeGroup = activeModuleObj?.group || (isAdmin ? 'Điều hành' : 'Không gian ca trực');

  const bottomTabs = useMemo(() => {
    if (isAdmin) {
      const adminBottomIds: TabId[] = ['dashboard', 'admin_workforce', 'admin_work', 'admin_people'];
      return adminBottomIds
        .map((id) => allowedModules.find((m) => m.id === id))
        .filter((m): m is (typeof navigationModules)[number] => Boolean(m));
    }
    const staffBottomIds: TabId[] = ['dashboard', 'checkin', 'work', 'workforce'];
    return staffBottomIds
      .map((id) => allowedModules.find((m) => m.id === id))
      .filter((m): m is (typeof navigationModules)[number] => Boolean(m));
  }, [isAdmin, allowedModules]);

  const moreActions = allowedModules
    .filter((module) => !bottomTabs.some((b) => b.id === module.id))
    .map((module) => ({
      ...module,
      onClick: () => handleTabChange(module.id),
    }));

  const allMoreActions = [
    {
      id: 'release_notes_action' as TabId,
      label: `Điểm mới ${APP_VERSION_TAG}`,
      icon: Sparkles,
      group: 'Cá nhân' as const,
      onClick: () => {
        setIsMoreOpen(false);
        openReleaseNotesModal('all');
      },
    },
    {
      id: 'guide_modal_action' as TabId,
      label: 'Cẩm nang người mới',
      icon: GraduationCap,
      group: 'Vận hành' as const,
      onClick: () => {
        setIsMoreOpen(false);
        setIsGuideOpen(true);
      },
    },
    ...moreActions,
  ];

  const groupOrder: NavigationGroup[] = ['Cá nhân', 'Vận hành', 'Quản lý & Cấu hình'];
  const menuGroups = groupOrder
    .map((label) => ({
      label,
      items: allowedModules.filter((module) => module.group === label),
    }))
    .filter((group) => group.items.length > 0);

  const userSubtitle = (() => {
    if (!currentUser) return 'Nhân sự';
    const roleText = currentUser.role === 'admin' ? 'Quản lý' : currentUser.position || 'Nhân sự';
    const nameParts = currentUser.fullname.trim().split(/\s+/);
    const shortName = nameParts.length > 0 ? nameParts[nameParts.length - 1] : '';
    return `${shortName} • ${roleText}`;
  })();

  return (
    <div className="w-full min-h-screen flex flex-col md:flex-row bg-[var(--kg-bg)] text-[var(--kg-text)] transition-colors duration-150">
      {/* 1. MOBILE SUPER-APP HEADER (< 768px) */}
      <header className="sticky top-0 z-40 w-full bg-[var(--kg-surface)]/95 backdrop-blur-md border-b border-[var(--kg-border)] px-3.5 py-2 pt-safe-top flex justify-between items-center gap-2 md:hidden">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => handleTabChange('dashboard')}
            className="w-10 h-10 rounded-xl bg-[#0B1F33] border border-white/15 flex items-center justify-center flex-shrink-0 shadow-xs active:scale-95 transition-transform touch-manipulation"
            aria-label="Về trang Hôm nay"
          >
            <img src="/android-chrome-192x192.png?v=3" alt="King's Grill" className="w-5 h-5 object-contain" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="font-extrabold text-[14px] tracking-tight leading-tight text-[var(--kg-text)] truncate">
                {activeTitle}
              </h1>
              <KgVersionBadge variant="compact" />
            </div>
            <p className="text-[11px] font-medium text-[var(--kg-text-muted)] truncate">
              {pendingSyncCount > 0 ? `${pendingSyncCount} mục chờ đồng bộ • ${userSubtitle}` : `${shiftName} • ${userSubtitle}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setIsCommandOpen(true)}
            className="w-10 h-10 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center active:scale-95 transition-colors touch-manipulation"
            title="Tìm nhanh phân hệ"
            aria-label="Tìm nhanh phân hệ"
          >
            <Search size={17} strokeWidth={1.85} />
          </button>

          <NotificationBell />

          <button
            type="button"
            onClick={() => setIsMobileAccountOpen(true)}
            className="w-10 h-10 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex items-center justify-center active:scale-95 transition-colors touch-manipulation overflow-hidden"
            title="Tài khoản & Tiện ích"
            aria-label="Tài khoản và cài đặt"
          >
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="w-7 h-7 rounded-full bg-[var(--kg-accent)] text-white text-xs font-extrabold flex items-center justify-center">
                {currentUser?.fullname?.charAt(0) || 'U'}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 2. DESKTOP ARCHITECTURAL MIDNIGHT RAIL (76px Slim Spine ↔ 236px Expanded) */}
      <aside
        aria-label="Thanh điều hướng chính"
        className={`hidden md:flex flex-col ${
          isRailExpanded ? 'w-[236px]' : 'w-[76px]'
        } shrink-0 bg-[var(--kg-rail-bg)] text-[var(--kg-rail-text)] border-r border-[var(--kg-rail-border)] h-screen sticky top-0 overflow-y-auto hide-scrollbar transition-[width] duration-200 ease-out select-none`}
      >
        {/* Brand Crest + Expand Toggle */}
        <div
          className={`h-[60px] border-b border-[var(--kg-rail-border)] flex items-center ${
            isRailExpanded ? 'justify-between px-3.5' : 'justify-center px-2'
          } flex-shrink-0`}
        >
          {isRailExpanded ? (
            <>
              <button
                type="button"
                onClick={() => handleTabChange('dashboard')}
                className="flex items-center gap-2.5 min-w-0 text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0">
                  <img src="/android-chrome-192x192.png?v=3" alt="King's Grill" className="w-5 h-5 object-contain" />
                </div>
                <div className="min-w-0">
                  <span className="font-extrabold text-sm text-white leading-tight block truncate">
                    King&apos;s Grill
                  </span>
                  <p className="text-[11px] font-medium text-[var(--kg-rail-muted)] truncate">
                    Staff OS • {APP_VERSION_TAG}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={toggleRailExpanded}
                className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/15 text-[var(--kg-rail-muted)] hover:text-white flex items-center justify-center transition-colors flex-shrink-0"
                title="Thu gọn thành thanh Icon"
                aria-label="Thu gọn thanh điều hướng"
              >
                <PanelLeftClose size={16} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleRailExpanded}
              className="w-11 h-11 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center transition-colors relative group"
              title="Mở rộng danh mục điều hướng"
              aria-label="Mở rộng danh mục điều hướng"
            >
              <img src="/android-chrome-192x192.png?v=3" alt="King's Grill" className="w-6 h-6 object-contain group-hover:opacity-0 transition-opacity" />
              <PanelLeftOpen size={18} className="text-white absolute opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 py-3 px-2.5 space-y-4 overflow-y-auto hide-scrollbar">
          {menuGroups.map((group, gIdx) => (
            <div key={group.label} className="space-y-1">
              {isRailExpanded ? (
                <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--kg-rail-muted)]/80">
                  {group.label}
                </p>
              ) : (
                gIdx > 0 && <div className="mx-3 my-2 border-t border-[var(--kg-rail-border)]" />
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabChange(item.id)}
                    onPointerEnter={() => onPrefetch?.(item.id)}
                    onFocus={() => onPrefetch?.(item.id)}
                    title={!isRailExpanded ? `${item.label} (${group.label})` : undefined}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative w-full rounded-xl transition-all flex items-center ${
                      isRailExpanded
                        ? 'px-3 py-2.5 gap-3 justify-start text-left min-h-[42px]'
                        : 'p-2.5 justify-center min-h-[46px]'
                    } ${
                      isActive
                        ? 'bg-[#C8432B] text-white shadow-sm font-bold ring-1 ring-white/20'
                        : 'text-[var(--kg-rail-muted)] hover:text-white hover:bg-[var(--kg-rail-surface)] font-medium'
                    }`}
                  >
                    <Icon size={19} className="flex-shrink-0" />
                    {isRailExpanded && (
                      <span className="text-[13px] leading-snug truncate flex-1">{item.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom Utility Dock on Desktop Rail */}
        <div
          className={`p-2.5 border-t border-[var(--kg-rail-border)] flex ${
            isRailExpanded ? 'items-center justify-between gap-2' : 'flex-col items-center gap-2'
          } flex-shrink-0`}
        >
          <div className={`flex ${isRailExpanded ? 'items-center gap-1.5' : 'flex-col items-center gap-2'}`}>
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="w-10 h-10 rounded-xl bg-[var(--kg-rail-surface)] hover:bg-white/15 text-amber-300 flex items-center justify-center transition-colors"
              title="Cẩm nang hướng dẫn người mới"
              aria-label="Cẩm nang hướng dẫn người mới"
            >
              <GraduationCap size={17} />
            </button>

            <button
              type="button"
              onClick={() => toggleDarkMode()}
              className="w-10 h-10 rounded-xl bg-[var(--kg-rail-surface)] hover:bg-white/15 text-[var(--kg-rail-text)] flex items-center justify-center transition-colors"
              title={isDark ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
              aria-label={isDark ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
            >
              {isDark ? <Sun size={17} className="text-amber-300" /> : <Moon size={17} />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-10 h-10 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-400/25 flex items-center justify-center transition-colors"
            title="Đăng xuất tài khoản"
            aria-label="Đăng xuất tài khoản"
          >
            <Power size={16} />
          </button>
        </div>
      </aside>

      {/* 3. MAIN WORKSPACE */}
      <main className="kg-app-main flex-1 flex flex-col min-w-0 min-h-screen md:h-screen md:overflow-y-auto overflow-x-hidden">
        {/* Desktop Editorial Masthead (60px) */}
        <div className="hidden md:flex h-[60px] justify-between items-center gap-3 px-5 lg:px-7 border-b border-[var(--kg-border)] bg-[var(--kg-surface)] sticky top-0 z-30 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="hidden xl:inline-flex px-2 py-0.5 rounded-md bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[10.5px] font-bold uppercase tracking-wider text-[var(--kg-text-muted)] whitespace-nowrap">
              {activeGroup}
            </span>
            <h2 className="text-base lg:text-[17px] font-extrabold tracking-tight text-[var(--kg-text)] truncate">
              {activeTitle}
            </h2>
            <KgVersionBadge showCodename />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsCommandOpen(true)}
              className="h-9 px-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap"
              title="Tìm nhanh phân hệ (Ctrl+K)"
            >
              <Search size={14} strokeWidth={1.85} className="text-[var(--kg-accent-ink)] flex-shrink-0" />
              <span className="hidden xl:inline">Tìm phân hệ, thao tác...</span>
              <span className="xl:hidden">Tìm nhanh</span>
              <kbd className="px-1.5 py-0.5 rounded-md bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[10px] font-mono font-bold text-[var(--kg-text-muted)]">
                Ctrl K
              </kbd>
            </button>

            <div className="hidden lg:block">
              <KgSyncStatus isSyncing={false} pendingCount={pendingSyncCount} />
            </div>

            <div className="h-9 px-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-medium text-[var(--kg-text-muted)] flex items-center gap-1.5 whitespace-nowrap">
              <Clock size={13} strokeWidth={1.85} className="text-[var(--kg-accent-ink)] flex-shrink-0" />
              <span>
                <span className="hidden lg:inline">Ca: </span>
                <strong className="font-bold text-[var(--kg-text)] tabular-nums">{shiftName}</strong>
              </span>
            </div>

            <NotificationBell />

            <button
              type="button"
              onClick={() => handleTabChange('profile')}
              title={`${currentUser?.fullname || 'Nhân sự'} (${isAdmin ? 'Quản lý' : 'Nhân viên'})`}
              className="h-9 pl-1.5 pr-2.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] flex items-center gap-2 transition-colors"
            >
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="" className="w-6 h-6 rounded-lg object-cover" />
              ) : (
                <span className="w-6 h-6 rounded-lg bg-[var(--kg-primary)] text-white text-[11px] font-extrabold flex items-center justify-center">
                  {currentUser?.fullname?.charAt(0) || 'U'}
                </span>
              )}
              <span className="hidden xl:inline text-xs font-bold text-[var(--kg-text)] max-w-[120px] truncate">
                {currentUser?.fullname || 'Nhân sự'}
              </span>
            </button>
          </div>
        </div>

        {/* Adaptive Workspace Stage (Zero Nested Double-Padding on Mobile < 640px) */}
        <div
          className={`kg-workspace-stage flex-1 w-full ${
            isWideModule ? 'max-w-[1520px]' : 'max-w-[1260px]'
          } mx-auto px-3.5 sm:px-5 md:px-7 py-3 sm:py-4 md:py-6 pb-28 md:pb-20 min-h-0`}
        >
          {children}
        </div>
      </main>

      {/* 4. MOBILE SUPER-APP FLOATING PILL DOCK (Zero 2-line wrapping & rich Midnight Navy contrast) */}
      <nav
        aria-label="Điều hướng chính di động"
        className="md:hidden fixed left-2.5 right-2.5 z-50 kg-floating-dock rounded-2xl bg-[#0B1F33]/95 dark:bg-[#131822]/95 backdrop-blur-md border border-white/15 px-1 py-1.5 shadow-xl flex items-center justify-between gap-0.5"
      >
        {bottomTabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              onPointerEnter={() => onPrefetch?.(tab.id)}
              onFocus={() => onPrefetch?.(tab.id)}
              onTouchStart={() => onPrefetch?.(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex-1 min-w-0 min-h-[48px] px-0.5 py-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all touch-manipulation select-none active:scale-95"
            >
              <div
                className={`w-10 h-7 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-[#C8432B] text-white shadow-sm'
                    : 'text-slate-300'
                }`}
              >
                <Icon size={17} />
              </div>
              <span
                className={`text-[11px] tracking-tight leading-tight whitespace-nowrap max-w-full ${
                  isActive ? 'font-extrabold text-white' : 'font-medium text-slate-200'
                }`}
              >
                {tab.shortLabel || tab.label}
              </span>
            </button>
          );
        })}

        {(() => {
          const isMoreActionActive = allMoreActions.some((action) => currentTab === action.id);
          return (
            <button
              type="button"
              onClick={() => setIsMoreOpen(true)}
              className="relative flex-1 min-w-0 min-h-[48px] px-0.5 py-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all touch-manipulation select-none active:scale-95"
            >
              <div
                className={`w-10 h-7 rounded-xl flex items-center justify-center transition-all ${
                  isMoreActionActive
                    ? 'bg-[#C8432B] text-white shadow-sm'
                    : 'text-slate-300'
                }`}
              >
                <MoreHorizontal size={17} />
              </div>
              <span
                className={`text-[11px] tracking-tight leading-tight whitespace-nowrap max-w-full ${
                  isMoreActionActive ? 'font-extrabold text-white' : 'font-medium text-slate-200'
                }`}
              >
                Menu
              </span>
            </button>
          );
        })()}
      </nav>

      {/* Mobile Account & Quick Preferences Sheet */}
      <KgBottomSheet
        isOpen={isMobileAccountOpen}
        onClose={() => setIsMobileAccountOpen(false)}
        title="Tài khoản & Tiện ích Hệ thống"
      >
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[var(--kg-primary)] text-white font-extrabold text-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                currentUser?.fullname?.charAt(0) || 'U'
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-[var(--kg-text)] truncate">
                  {currentUser?.fullname || 'Nhân sự'}
                </p>
                {isAdmin && <Shield size={13} className="text-[var(--kg-accent-ink)] flex-shrink-0" />}
              </div>
              <p className="text-xs text-[var(--kg-text-muted)] truncate">
                @{currentUser?.username} • Ca hiện tại: <strong className="text-[var(--kg-text)]">{shiftName}</strong>
              </p>
            </div>
          </div>

          <div className="divide-y divide-[var(--kg-border)] rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] overflow-hidden">
            {/* Version & Release Notes Row */}
            <button
              type="button"
              onClick={() => {
                setIsMobileAccountOpen(false);
                openReleaseNotesModal('all');
              }}
              className="w-full min-h-[50px] px-4 py-3 flex items-center justify-between text-sm font-semibold text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)] transition-colors"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Sparkles size={17} strokeWidth={1.85} className="text-[var(--kg-accent-ink)] flex-shrink-0" />
                <span className="truncate">Thông tin phiên bản & Điểm mới</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)] text-xs font-mono font-bold flex-shrink-0">
                {APP_VERSION_TAG}
              </span>
            </button>

            {hasTabPermission('profile', currentUser) && (
              <button
                type="button"
                onClick={() => {
                  setIsMobileAccountOpen(false);
                  handleTabChange('profile');
                }}
                className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-sm font-medium text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)] transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <UserIcon size={17} strokeWidth={1.8} className="text-[var(--kg-primary-ink)]" />
                  Hồ sơ cá nhân & Mật khẩu
                </span>
                <ChevronRight size={16} className="text-[var(--kg-text-muted)]" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsMobileAccountOpen(false);
                setIsGuideOpen(true);
              }}
              className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-sm font-medium text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)] transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <GraduationCap size={17} strokeWidth={1.8} className="text-[var(--kg-accent-ink)]" />
                Cẩm nang hướng dẫn người mới
              </span>
              <ChevronRight size={16} className="text-[var(--kg-text-muted)]" />
            </button>

            <button
              type="button"
              onClick={() => toggleDarkMode()}
              className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-sm font-medium text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)] transition-colors"
            >
              <span className="flex items-center gap-2.5">
                {isDark ? (
                  <Sun size={17} strokeWidth={1.8} className="text-[var(--kg-warning)]" />
                ) : (
                  <Moon size={17} strokeWidth={1.8} className="text-[var(--kg-primary-ink)]" />
                )}
                Giao diện hiển thị
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text-muted)]">
                {isDark ? 'Chế độ Tối' : 'Chế độ Sáng'}
              </span>
            </button>
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/25 font-bold text-sm flex items-center justify-center gap-2 hover:brightness-95 transition-colors"
            >
              <Power size={16} strokeWidth={1.85} />
              <span>Đăng xuất tài khoản</span>
            </button>
            <p className="text-center text-[10.5px] text-[var(--kg-text-soft)] mt-2.5 font-mono">
              King&apos;s Grill Staff OS {APP_VERSION_TAG} • {APP_CODENAME}
            </p>
          </div>
        </div>
      </KgBottomSheet>

      {/* More Action Sheet */}
      <KgActionSheet
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="Danh mục Phân hệ & Tiện ích"
        actions={allMoreActions.map((action) => ({
          ...action,
          active: currentTab === action.id,
          onPrefetch: () => onPrefetch?.(action.id),
        }))}
      />

      {/* Global Newbie Guide Modal */}
      <NewbieGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onNavigateTab={handleTabChange}
      />

      {/* Global Command Palette (Ctrl+K / Cmd+K) */}
      <KgCommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onNavigateTab={handleTabChange}
        onOpenGuide={() => setIsGuideOpen(true)}
      />
    </div>
  );
}
