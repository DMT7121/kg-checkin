import React, { lazy, Suspense, useState, useMemo, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  Sun,
  Moon,
  Power,
  Clock,
  Menu,
  GraduationCap,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  User as UserIcon,
  ChevronRight,
  Sparkles,
  Flame,
  Plus,
  CalendarDays,
  ClipboardCheck,
  Camera,
  Banknote,
  BookOpen,
  Users,
  Briefcase,
  ArrowRight,
  Newspaper,
  UtensilsCrossed,
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import { APP_CODENAME, APP_VERSION_TAG, openReleaseNotesModal } from '../config/appVersion';
import { KgActionSheet, KgBottomSheet, KgSyncStatus } from './KgDesignSystem';
import { getTabLabel, hasTabPermission, isAdminUser } from '../utils/permissions';
import {
  BOTTOM_ADMIN_TABS,
  BOTTOM_STAFF_TABS,
  navigationModules,
  type NavigationGroup,
} from '../config/moduleRegistry';
import {
  getFailedVaultPunches,
  getQueue,
  isQueueSyncing,
  processQueue,
  subscribeQueueSyncing,
} from '../utils/offlineQueue';
import {
  isAppRefreshing,
  refreshAppData,
  subscribeAppRefreshing,
} from '../utils/refreshData';
import { getSafeDisplayInitial, resolveInitialRailExpanded } from '../utils/shellLayout';
import type { TabId } from '../types/navigation';

const SyncVaultDrawer = lazy(() => import('./SyncVaultDrawer'));
const NewbieGuideModal = lazy(() => import('./NewbieGuideModal'));
const KgCommandPalette = lazy(() => import('./KgCommandPalette'));

const WIDE_MODULE_TABS = new Set<TabId>([
  'attendance',
  'workforce',
  'work',
  'admin_ops',
  'admin_people_pay',
  'admin_system',
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
  const lastFetchTime = useAppStore((state) => state.lastFetchTime);
  const adminPendingQueueCount = useAppStore((state) => state.adminPendingQueueCount);
  const setCurrentTab = useAppStore((state) => state.setCurrentTab);
  const logout = useAppStore((state) => state.logout);
  const toggleDarkMode = useAppStore((state) => state.toggleDarkMode);

  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMobileAccountOpen, setIsMobileAccountOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [isSyncVaultOpen, setIsSyncVaultOpen] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(() => getQueue().length);
  const [failedVaultCount, setFailedVaultCount] = useState(() => getFailedVaultPunches().length);
  const [isRefreshing, setIsRefreshing] = useState(() => isAppRefreshing());
  const [isQueueBusy, setIsQueueBusy] = useState(() => isQueueSyncing());
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  );
  const isSyncing = isRefreshing || isQueueBusy;
  const syncAttentionCount = pendingSyncCount + failedVaultCount;

  // Laptop/PC (>= 1280px) defaults to Expanded Rail with labels; Tablet (< 1280px) defaults compact with micro-labels
  const [isRailExpanded, setIsRailExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('kg_rail_expanded_v4');
      return resolveInitialRailExpanded(
        saved,
        typeof window !== 'undefined' ? window.innerWidth : undefined,
      );
    } catch {
      return resolveInitialRailExpanded(null, typeof window !== 'undefined' ? window.innerWidth : undefined);
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
    const handleViewportResize = () => {
      setIsDesktopViewport(window.innerWidth >= 768);
      try {
        const saved = localStorage.getItem('kg_rail_expanded_v4');
        if (saved === 'true' || saved === 'false') return;
        setIsRailExpanded(resolveInitialRailExpanded(null, window.innerWidth));
      } catch {
        /* ignore */
      }
    };
    const mql = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 768px)') : null;
    const handleMediaChange = (e: MediaQueryListEvent) => setIsDesktopViewport(e.matches);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    mql?.addEventListener?.('change', handleMediaChange);
    return () => {
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      mql?.removeEventListener?.('change', handleMediaChange);
    };
  }, []);

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
      setFailedVaultCount(getFailedVaultPunches().length);
    };
    const handleOpenNewbieGuide = () => setIsGuideOpen(true);
    const unsubRefresh = subscribeAppRefreshing(setIsRefreshing);
    const unsubQueueSync = subscribeQueueSyncing(setIsQueueBusy);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('kg:offline-queue-updated', handleQueueUpdate);
    window.addEventListener('kg:open-newbie-guide', handleOpenNewbieGuide);
    return () => {
      unsubRefresh();
      unsubQueueSync();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('kg:offline-queue-updated', handleQueueUpdate);
      window.removeEventListener('kg:open-newbie-guide', handleOpenNewbieGuide);
    };
  }, []);

  const handleManualSync = useCallback(() => {
    void refreshAppData(true);
    void processQueue();
  }, []);

  const renderSyncPill = () => (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        setIsSyncVaultOpen(true);
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsSyncVaultOpen(true);
        }
      }}
      title={
        failedVaultCount > 0
          ? `Có ${failedVaultCount} bản ghi chấm công lỗi trong Vault — nhấn để kiểm tra`
          : 'Nhấn để mở trạng thái đồng bộ & hàng đợi Vault'
      }
      aria-label="Mở trạng thái đồng bộ và Vault ngoại tuyến"
      className={`inline-flex items-center gap-1 rounded-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary-ink)] ${
        failedVaultCount > 0 ? 'ring-1 ring-[var(--kg-danger)]/50' : ''
      }`}
    >
      <KgSyncStatus
        isSyncing={isSyncing}
        lastSyncTime={lastFetchTime || undefined}
        onRefresh={handleManualSync}
        pendingCount={syncAttentionCount}
      />
      {failedVaultCount > 0 && (
        <span className="px-1.5 py-0.5 rounded-full bg-[var(--kg-danger)] text-white dark:text-[#23170F] text-[10px] font-extrabold font-mono tabular-nums">
          !{failedVaultCount}
        </span>
      )}
    </div>
  );

  const handleLogout = () => {
    setIsMobileAccountOpen(false);
    logout();
    document.documentElement.classList.remove('dark');
  };

  const handleTabChange = useCallback((tab: TabId) => {
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [setCurrentTab]);

  const handleQuickJump = useCallback((hub: TabId, subTab?: string) => {
    if (subTab) {
      try {
        sessionStorage.setItem(`kg_hub_subtab_${hub}`, subTab);
      } catch {
        /* ignore */
      }
    }
    handleTabChange(hub);
    if (subTab) {
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('kg:subtab-select', { detail: { hub, subTab } }));
      }, 30);
    }
    setIsQuickActionsOpen(false);
  }, [handleTabChange]);

  const isAdmin = isAdminUser(currentUser);
  const allowedModules = navigationModules.filter((module) => hasTabPermission(module.id, currentUser));
  const isWideModule = WIDE_MODULE_TABS.has(currentTab);

  const activeModuleObj = allowedModules.find((m) => m.id === currentTab);
  const activeTitle = activeModuleObj?.label || getTabLabel(currentTab);

  const quickActionItems = useMemo(() => {
    const canSoldOut = hasTabPermission('soldout', currentUser);
    const canTraining = hasTabPermission('training', currentUser);
    if (isAdmin) {
      return [
        {
          id: 'qa-inbox',
          label: 'Duyệt yêu cầu',
          hint: adminPendingQueueCount > 0 ? `${adminPendingQueueCount} đang chờ` : 'Hộp duyệt tập trung',
          icon: Shield,
          hub: 'admin_ops' as TabId,
          subTab: 'inbox',
        },
        {
          id: 'qa-dispatch',
          label: 'Phân khu trực',
          hint: 'Điều phối đội hình ca',
          icon: Users,
          hub: 'admin_ops' as TabId,
          subTab: 'dispatch',
        },
        {
          id: 'qa-schedule',
          label: 'Xếp lịch tuần',
          hint: 'Phê duyệt & phân ca',
          icon: CalendarDays,
          hub: 'admin_ops' as TabId,
          subTab: 'schedule',
        },
        {
          id: 'qa-checklist',
          label: 'Checklist khu',
          hint: 'Theo dõi đầu việc ca',
          icon: ClipboardCheck,
          hub: 'work' as TabId,
          subTab: 'checklist',
        },
        {
          id: 'qa-checkin',
          label: 'Chấm công',
          hint: 'Mở trạm điểm danh',
          icon: Camera,
          hub: 'checkin' as TabId,
        },
        {
          id: 'qa-employees',
          label: 'Nhân sự & Lương',
          hint: 'Hồ sơ & đơn giá lương',
          icon: Briefcase,
          hub: 'admin_people_pay' as TabId,
          subTab: 'employees',
        },
      ];
    }

    return [
      {
        id: 'qa-checkin',
        label: 'Chấm công',
        hint: 'Face ID / Ảnh ca trực',
        icon: Camera,
        hub: 'checkin' as TabId,
      },
      {
        id: 'qa-checklist',
        label: 'Checklist khu',
        hint: 'Đầu việc trong ca',
        icon: ClipboardCheck,
        hub: 'work' as TabId,
        subTab: 'checklist',
      },
      {
        id: 'qa-schedule',
        label: 'Lịch của tôi',
        hint: 'Đăng ký ca tuần tới',
        icon: CalendarDays,
        hub: 'workforce' as TabId,
        subTab: 'schedule',
      },
      {
        id: 'qa-payroll',
        label: 'Phiếu lương',
        hint: 'Thu nhập & đối soát',
        icon: Banknote,
        hub: 'attendance' as TabId,
        subTab: 'payroll',
      },
      canSoldOut
        ? {
            id: 'qa-soldout',
            label: 'Món hết',
            hint: 'Báo món tạm ngưng',
            icon: UtensilsCrossed,
            hub: 'work' as TabId,
            subTab: 'soldout',
          }
        : {
            id: 'qa-ledger',
            label: 'Bảng công',
            hint: 'Nhật ký giờ làm',
            icon: Clock,
            hub: 'attendance' as TabId,
            subTab: 'ledger',
          },
      canTraining
        ? {
            id: 'qa-knowledge',
            label: 'Sổ tay SOP',
            hint: 'Quy trình & đào tạo',
            icon: BookOpen,
            hub: 'knowledge' as TabId,
          }
        : {
            id: 'qa-news',
            label: 'Bảng tin',
            hint: 'Thông báo nhà hàng',
            icon: Newspaper,
            hub: 'communications' as TabId,
            subTab: 'news',
          },
    ];
  }, [adminPendingQueueCount, currentUser, isAdmin]);

  const bottomTabs = useMemo(() => {
    if (isAdmin) {
      const resolvedAdmin = BOTTOM_ADMIN_TABS
        .map((id) => allowedModules.find((m) => m.id === id))
        .filter((m): m is (typeof navigationModules)[number] => Boolean(m));
      if (resolvedAdmin.length >= 3) {
        return resolvedAdmin;
      }
    }
    return BOTTOM_STAFF_TABS
      .map((id) => allowedModules.find((m) => m.id === id))
      .filter((m): m is (typeof navigationModules)[number] => Boolean(m));
  }, [isAdmin, allowedModules]);

  const moreActions = allowedModules
    .filter((module) => !bottomTabs.some((b) => b.id === module.id))
    .map((module) => ({
      ...module,
      onClick: () => handleTabChange(module.id),
    }));

  const groupOrder: NavigationGroup[] = ['Cá nhân', 'Vận hành', 'Quản lý & Cấu hình'];
  const menuGroups = groupOrder
    .map((label) => ({
      label,
      items: allowedModules.filter((module) => module.group === label),
    }))
    .filter((group) => group.items.length > 0);

  const userSubtitle = (() => {
    if (!currentUser) return 'Nhân sự';
    const roleText = isAdmin ? 'Quản lý' : currentUser.position || 'Nhân sự';
    const nameParts = currentUser.fullname.trim().split(/\s+/);
    const shortName = nameParts.length > 0 ? nameParts[nameParts.length - 1] : '';
    return `${shortName} • ${roleText}`;
  })();

  // Single NotificationBell element mounted only in the active responsive shell slot
  const notificationBell = <NotificationBell />;

  const syncDotClass = !isOnline || failedVaultCount > 0
    ? 'bg-[var(--kg-danger)]'
    : syncAttentionCount > 0
      ? 'bg-[var(--kg-warning)]'
      : isSyncing
        ? 'bg-[var(--kg-info)] animate-pulse'
        : 'bg-[var(--kg-success)]';

  return (
    <div className="w-full min-h-dvh flex flex-col md:flex-row bg-[var(--kg-bg)] text-[var(--kg-text)] transition-colors duration-150">
      {/* 1. MOBILE TOAST TOUCH HEADER (< 768px — Solid 58px Surface, Zero Backdrop Blur) */}
      <header className="sticky top-0 z-40 w-full min-h-[58px] bg-[var(--kg-surface)] border-b border-[var(--kg-border)] px-3 py-1.5 pt-safe-top flex items-center justify-between gap-2 md:hidden">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => handleTabChange('dashboard')}
            className="kg-pressable w-11 h-11 min-w-[44px] min-h-[44px] rounded-[12px] bg-[#F29055] text-[#241C17] flex items-center justify-center flex-shrink-0 shadow-xs"
            aria-label="Về trang Hôm nay"
          >
            <Flame size={20} strokeWidth={2.15} />
          </button>

          <button
            type="button"
            onClick={() => setIsSyncVaultOpen(true)}
            className="min-w-0 flex-1 min-h-[44px] flex flex-col justify-center text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary-ink)] rounded-lg px-0.5"
            aria-label="Mở trạng thái đồng bộ và Vault ngoại tuyến"
            title="Chạm để kiểm tra trạng thái đồng bộ & Vault"
          >
            <h1 className="font-extrabold text-[14px] tracking-tight leading-tight text-[var(--kg-text)] truncate">
              {activeTitle}
            </h1>
            <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full flex-shrink-0 ${syncDotClass}`}
              />
              <p className="text-[10.5px] font-semibold text-[var(--kg-text-muted)] truncate">
                {failedVaultCount > 0
                  ? `Lỗi Vault (${failedVaultCount}) • ${userSubtitle}`
                  : syncAttentionCount > 0
                    ? `Chờ đồng bộ (${syncAttentionCount}) • ${userSubtitle}`
                    : `KING'S GRILL • ${shiftName || 'Ca trực'}`}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="hidden sm:inline-flex">
            {renderSyncPill()}
          </div>

          <button
            type="button"
            onClick={() => setIsCommandOpen(true)}
            className="kg-pressable w-11 h-11 min-w-[44px] min-h-[44px] rounded-[11px] border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:border-[var(--kg-border-strong)] flex items-center justify-center"
            title="Tìm nhanh phân hệ"
            aria-label="Tìm nhanh phân hệ"
          >
            <Search size={17} strokeWidth={1.85} />
          </button>

          {!isDesktopViewport && notificationBell}

          <button
            type="button"
            onClick={() => setIsMobileAccountOpen(true)}
            className="kg-pressable w-11 h-11 min-w-[44px] min-h-[44px] rounded-[11px] border border-[var(--kg-border)] bg-[var(--kg-surface-2)] hover:border-[var(--kg-border-strong)] flex items-center justify-center overflow-hidden"
            title="Tài khoản & Tiện ích"
            aria-label="Tài khoản và cài đặt"
          >
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="w-7 h-7 rounded-[9px] bg-[#F8DFCB] text-[#A44C29] text-xs font-extrabold flex items-center justify-center">
                {getSafeDisplayInitial(currentUser?.fullname, currentUser?.username)}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 2. DESKTOP TOAST TOUCH FOREST RAIL (248px Expanded >= 1280px ↔ 88px Tablet Compact Spine) */}
      <aside
        aria-label="Thanh điều hướng chính"
        className={`hidden md:flex flex-col ${
          isRailExpanded ? 'w-[248px]' : 'w-[88px]'
        } shrink-0 bg-[var(--kg-rail-bg)] text-[var(--kg-rail-text)] border-r border-[var(--kg-rail-border)] h-dvh sticky top-0 overflow-hidden transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] select-none`}
      >
        {/* Brand Crest + Expand Toggle */}
        <div
          className={`h-[64px] border-b border-[var(--kg-rail-border)] flex items-center ${
            isRailExpanded ? 'justify-between px-3.5' : 'justify-center px-1.5'
          } flex-shrink-0`}
        >
          {isRailExpanded ? (
            <>
              <button
                type="button"
                onClick={() => handleTabChange('dashboard')}
                className="kg-pressable flex items-center gap-2.5 min-w-0 text-left min-h-[44px] rounded-xl px-1 -ml-1 hover:bg-white/5"
              >
                <div className="w-10 h-10 rounded-[12px] bg-[#F29055] text-[#241C17] flex items-center justify-center flex-shrink-0">
                  <Flame size={20} strokeWidth={2.15} />
                </div>
                <div className="min-w-0">
                  <span className="font-black text-[13px] tracking-[0.06em] uppercase text-white leading-tight block truncate">
                    KING&apos;S GRILL
                  </span>
                  <p className="text-[9.5px] font-semibold tracking-[0.08em] uppercase text-[var(--kg-rail-muted)] truncate mt-0.5">
                    TOUCH OPS · {APP_VERSION_TAG}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={toggleRailExpanded}
                className="kg-pressable w-11 h-11 lg:w-8 lg:h-8 rounded-lg bg-white/10 hover:bg-white/15 text-[var(--kg-rail-muted)] hover:text-white flex items-center justify-center flex-shrink-0"
                title="Thu gọn thành thanh Icon"
                aria-label="Thu gọn thanh điều hướng"
              >
                <PanelLeftClose size={15} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleRailExpanded}
              className="kg-pressable w-11 h-11 min-w-[44px] min-h-[44px] rounded-[12px] bg-[#F29055] hover:brightness-105 text-[#241C17] flex items-center justify-center relative group"
              title="Mở rộng danh mục điều hướng"
              aria-label="Mở rộng danh mục điều hướng"
            >
              <Flame size={20} strokeWidth={2.15} className="group-hover:opacity-0 transition-opacity duration-150" />
              <PanelLeftOpen size={17} className="text-[#241C17] absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
            </button>
          )}
        </div>

        {/* Navigation Groups — 11 Canonical Modules */}
        <nav className="flex-1 min-h-0 py-2.5 px-2 space-y-2.5 overflow-y-auto hide-scrollbar">
          {menuGroups.map((group, gIdx) => (
            <div key={group.label} className="space-y-0.5">
              {isRailExpanded ? (
                <p className="px-2.5 pt-1 pb-1 text-[9.5px] font-extrabold uppercase tracking-[0.13em] text-[var(--kg-rail-muted)]/75">
                  {group.label}
                </p>
              ) : (
                gIdx > 0 && <div className="mx-2 my-1.5 border-t border-[var(--kg-rail-border)]" />
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                const showAdminQueueBadge = item.id === 'admin_ops' && adminPendingQueueCount > 0;
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
                    className={`kg-pressable relative w-full rounded-[11px] flex items-center ${
                      isRailExpanded
                        ? 'px-3 py-2.5 gap-2.5 justify-start text-left min-h-[44px] lg:min-h-[42px]'
                        : 'flex-col justify-center gap-0.5 px-1 py-1.5 min-h-[44px]'
                    } ${
                      isActive
                        ? 'bg-[#F49A65]/25 text-white shadow-[inset_3px_0_0_#FFA46B] font-bold'
                        : 'text-[#C4D0C8] hover:text-white hover:bg-white/[0.08] font-semibold'
                    }`}
                  >
                    <Icon
                      size={18}
                      strokeWidth={isActive ? 2 : 1.75}
                      className={`flex-shrink-0 transition-transform duration-150 ${isActive ? 'text-[#FFB581] scale-[1.05]' : ''}`}
                    />
                    {isRailExpanded ? (
                      <>
                        <span className="text-[12.5px] leading-tight truncate flex-1">{item.label}</span>
                        {showAdminQueueBadge && (
                          <span className="px-1.5 py-0.5 rounded-[7px] bg-[#F6A071] text-[#302118] text-[10.5px] font-extrabold font-mono tabular-nums flex-shrink-0">
                            {adminPendingQueueCount > 99 ? '99+' : adminPendingQueueCount}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-[9.5px] leading-tight tracking-tight truncate max-w-full font-semibold">
                          {item.shortLabel || item.label}
                        </span>
                        {showAdminQueueBadge && (
                          <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#F6A071] text-[#302118] text-[9px] font-extrabold font-mono tabular-nums flex items-center justify-center">
                            {adminPendingQueueCount > 9 ? '9+' : adminPendingQueueCount}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Compact Bottom User Card + Inline Theme / Guide / Logout */}
        <div className="p-2.5 border-t border-[var(--kg-rail-border)] flex-shrink-0">
          {isRailExpanded ? (
            <div className="rounded-[13px] bg-white/[0.05] border border-white/[0.09] p-2 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTabChange('profile')}
                  className="kg-pressable flex items-center gap-2.5 min-w-0 flex-1 text-left rounded-lg p-1 -m-1 hover:bg-white/[0.06]"
                  title="Mở hồ sơ cá nhân"
                >
                  {currentUser?.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt="" className="w-9 h-9 rounded-[10px] object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-9 h-9 rounded-[10px] bg-[#F4A36C] text-[#291A0E] text-xs font-extrabold flex items-center justify-center flex-shrink-0">
                      {getSafeDisplayInitial(currentUser?.fullname, currentUser?.username)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-white truncate leading-tight">
                      {currentUser?.fullname || 'Nhân sự'}
                    </p>
                    <p className="text-[10.5px] font-medium text-[var(--kg-rail-muted)] truncate mt-0.5">
                      {isAdmin ? 'Quản lý' : currentUser?.position || 'Nhân viên'}
                      {shiftName ? ` • ${shiftName}` : ''}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => toggleDarkMode()}
                  className="kg-pressable w-8 h-8 rounded-[9px] bg-white/[0.09] hover:bg-white/15 text-[var(--kg-rail-text)] flex items-center justify-center flex-shrink-0"
                  title={isDark ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
                  aria-label={isDark ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
                >
                  {isDark ? <Sun size={15} className="text-amber-300" /> : <Moon size={15} />}
                </button>
              </div>

              <div className="flex items-center gap-1.5 pt-1.5 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setIsGuideOpen(true)}
                  className="kg-pressable flex-1 h-8 px-2 rounded-[9px] bg-white/[0.07] hover:bg-white/15 text-amber-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 truncate"
                  title="Cẩm nang hướng dẫn người mới"
                >
                  <GraduationCap size={14} className="flex-shrink-0" />
                  <span className="truncate">Cẩm nang</span>
                </button>
                <button
                  type="button"
                  onClick={() => openReleaseNotesModal('all')}
                  className="kg-pressable h-8 px-2 rounded-[9px] bg-white/[0.07] hover:bg-white/15 text-[var(--kg-rail-muted)] hover:text-white text-[10.5px] font-mono font-bold flex items-center justify-center flex-shrink-0"
                  title={`Xem điểm mới phiên bản ${APP_VERSION_TAG}`}
                >
                  {APP_VERSION_TAG}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="kg-pressable w-8 h-8 rounded-[9px] bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-400/25 flex items-center justify-center flex-shrink-0"
                  title="Đăng xuất tài khoản"
                  aria-label="Đăng xuất tài khoản"
                >
                  <Power size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsGuideOpen(true)}
                className="kg-pressable w-11 h-11 lg:w-9 lg:h-9 rounded-lg bg-[var(--kg-rail-surface)] hover:bg-white/15 text-amber-300 flex items-center justify-center"
                title="Cẩm nang hướng dẫn người mới"
                aria-label="Cẩm nang hướng dẫn người mới"
              >
                <GraduationCap size={16} />
              </button>

              <button
                type="button"
                onClick={() => toggleDarkMode()}
                className="kg-pressable w-11 h-11 lg:w-9 lg:h-9 rounded-lg bg-[var(--kg-rail-surface)] hover:bg-white/15 text-[var(--kg-rail-text)] flex items-center justify-center"
                title={isDark ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
                aria-label={isDark ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
              >
                {isDark ? <Sun size={16} className="text-amber-300" /> : <Moon size={16} />}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="kg-pressable w-11 h-11 lg:w-9 lg:h-9 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-400/25 flex items-center justify-center"
                title="Đăng xuất tài khoản"
                aria-label="Đăng xuất tài khoản"
              >
                <Power size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* 3. MAIN WORKSPACE */}
      <main className="kg-app-main flex-1 flex flex-col min-w-0 min-h-0 md:h-dvh md:overflow-y-auto overflow-x-clip">
        {/* Desktop Toast Touch Topbar (64px) */}
        <div className="hidden md:flex h-[64px] justify-between items-center gap-3 px-4 lg:px-6 border-b border-[var(--kg-border)] bg-[var(--kg-surface)] sticky top-0 z-30 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--kg-text-muted)] whitespace-nowrap flex-shrink-0">
              KING&apos;S GRILL
            </span>
            <ChevronRight size={14} className="text-[var(--kg-text-soft)] flex-shrink-0" />
            <h2
              key={activeTitle}
              className="kg-animate-fade-up text-[15px] lg:text-[16px] font-extrabold tracking-tight text-[var(--kg-text)] truncate min-w-0"
            >
              {activeTitle}
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsCommandOpen(true)}
              className="kg-pressable w-11 h-11 lg:w-auto lg:min-h-[38px] lg:h-[38px] lg:px-3 rounded-[11px] bg-[var(--kg-surface-2)] border border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)] hover:border-[var(--kg-border-strong)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap flex-shrink-0"
              title="Tìm nhanh phân hệ (Ctrl+K)"
              aria-label="Tìm nhanh phân hệ"
            >
              <Search size={15} strokeWidth={1.85} className="text-[var(--kg-text-muted)] flex-shrink-0" />
              <span className="hidden 2xl:inline">Tìm phân hệ, thao tác...</span>
              <span className="hidden lg:inline 2xl:hidden">Tìm nhanh</span>
              <kbd className="hidden xl:inline-block px-1.5 py-0.5 rounded-md bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[10px] font-mono font-bold text-[var(--kg-text-muted)]">
                Ctrl K
              </kbd>
            </button>

            <div className="flex items-center flex-shrink-0">
              {renderSyncPill()}
            </div>

            <button
              type="button"
              onClick={() => setIsQuickActionsOpen(true)}
              className="kg-pressable w-11 h-11 lg:w-10 lg:h-10 rounded-[11px] bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)] hover:border-[var(--kg-border-strong)] text-[var(--kg-text)] flex items-center justify-center flex-shrink-0"
              title="Tác vụ nhanh"
              aria-label="Mở tác vụ nhanh"
            >
              <Plus size={17} strokeWidth={2} />
            </button>

            {isDesktopViewport && notificationBell}

            <button
              type="button"
              onClick={() => handleTabChange('profile')}
              title={`${currentUser?.fullname || 'Nhân sự'} (${isAdmin ? 'Quản lý' : 'Nhân viên'})`}
              aria-label="Hồ sơ cá nhân"
              className="kg-pressable h-11 lg:h-10 px-2 lg:pl-3 lg:pr-1.5 rounded-[12px] bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] flex items-center justify-center gap-2.5 flex-shrink-0"
            >
              <span className="hidden xl:inline text-xs font-bold text-[var(--kg-text)] max-w-[128px] truncate">
                {currentUser?.fullname || 'Nhân sự'}
              </span>
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="" className="w-7 h-7 rounded-[9px] object-cover flex-shrink-0" />
              ) : (
                <span className="w-7 h-7 rounded-[9px] bg-[#F8DFCB] text-[#A44C29] text-[11px] font-extrabold flex items-center justify-center flex-shrink-0">
                  {getSafeDisplayInitial(currentUser?.fullname, currentUser?.username)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Adaptive Workspace Stage (Zero Nested Double-Padding on Mobile < 640px) */}
        <div
          className={`kg-workspace-stage flex-1 w-full ${
            isWideModule ? 'max-w-[1520px]' : 'max-w-[1260px]'
          } mx-auto px-3.5 sm:px-5 md:px-6 lg:px-7 py-3 sm:py-4 md:py-5 pb-[calc(6.75rem+env(safe-area-inset-bottom,0px))] md:pb-12 min-h-0`}
        >
          <div key={currentTab} className="kg-animate-fade-up min-w-0">
            {children}
          </div>
        </div>
      </main>

      {/* 4. MOBILE TOAST TOUCH FLOATING PILL DOCK (Solid #202C27/#101B15, Warm Peach Active Highlight, Zero Backdrop Blur) */}
      <nav
        aria-label="Điều hướng chính di động"
        className="md:hidden fixed left-2.5 right-2.5 z-50 kg-floating-dock rounded-[19px] bg-[var(--kg-rail-bg)] border border-white/15 p-1.5 shadow-[0_12px_28px_rgba(16,27,21,0.45)] grid grid-cols-5 gap-1"
      >
        {bottomTabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          const showDockQueueBadge = tab.id === 'admin_ops' && adminPendingQueueCount > 0;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              onPointerEnter={() => onPrefetch?.(tab.id)}
              onFocus={() => onPrefetch?.(tab.id)}
              onTouchStart={() => onPrefetch?.(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`kg-pressable relative min-w-0 min-h-[52px] px-1 py-1.5 rounded-[13px] flex flex-col items-center justify-center gap-1 select-none ${
                isActive
                  ? 'bg-[#F6A36B] text-[#241C17] font-extrabold shadow-xs'
                  : 'text-[#D1DBD0] hover:text-white font-bold'
              }`}
            >
              <Icon
                size={19}
                strokeWidth={isActive ? 2.15 : 1.85}
                className={`flex-shrink-0 transition-transform duration-150 ${isActive ? 'scale-[1.06]' : ''}`}
              />
              <span className="text-[10px] tracking-tight leading-none whitespace-nowrap truncate w-full text-center px-0.5">
                {tab.shortLabel || tab.label}
              </span>
              {showDockQueueBadge && (
                <span
                  aria-label={`${adminPendingQueueCount} yêu cầu chờ duyệt`}
                  className="absolute top-1 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--kg-danger)] text-white text-[9px] font-black font-mono tabular-nums flex items-center justify-center"
                >
                  {adminPendingQueueCount > 9 ? '9+' : adminPendingQueueCount}
                </span>
              )}
            </button>
          );
        })}

        {(() => {
          const isMoreActionActive = moreActions.some((action) => currentTab === action.id);
          return (
            <button
              type="button"
              onClick={() => setIsMoreOpen(true)}
              className={`kg-pressable relative min-w-0 min-h-[52px] px-1 py-1.5 rounded-[13px] flex flex-col items-center justify-center gap-1 select-none ${
                isMoreActionActive
                  ? 'bg-[#F6A36B] text-[#241C17] font-extrabold shadow-xs'
                  : 'text-[#D1DBD0] hover:text-white font-bold'
              }`}
            >
              <Menu
                size={19}
                strokeWidth={isMoreActionActive ? 2.15 : 1.85}
                className={`flex-shrink-0 transition-transform duration-150 ${isMoreActionActive ? 'scale-[1.06]' : ''}`}
              />
              <span className="text-[10px] tracking-tight leading-none whitespace-nowrap truncate w-full text-center px-0.5">
                Tất cả
              </span>
            </button>
          );
        })()}
      </nav>

      {/* Quick Actions Launcher Sheet */}
      <KgBottomSheet
        isOpen={isQuickActionsOpen}
        onClose={() => setIsQuickActionsOpen(false)}
        title="Tác vụ nhanh · King's Grill"
        subtitle="Chạm để mở nhanh các thao tác thường dùng trong ca"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 py-1">
          {quickActionItems.map((act, idx) => {
            const Icon = act.icon;
            const staggerClass =
              idx === 0
                ? 'kg-stagger-1'
                : idx === 1
                  ? 'kg-stagger-2'
                  : idx === 2
                    ? 'kg-stagger-3'
                    : 'kg-stagger-4';
            return (
              <button
                key={act.id}
                type="button"
                onClick={() => handleQuickJump(act.hub, act.subTab)}
                className={`kg-touch-tile kg-pressable kg-animate-fade-up ${staggerClass} min-h-[96px]`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="w-9 h-9 rounded-[11px] bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] flex items-center justify-center flex-shrink-0">
                    <Icon size={18} strokeWidth={1.85} />
                  </span>
                  <ArrowRight size={14} className="text-[var(--kg-text-muted)]" />
                </div>
                <div className="min-w-0 w-full">
                  <p className="text-xs font-extrabold text-[var(--kg-text)] truncate">{act.label}</p>
                  <p className="text-[10.5px] font-medium text-[var(--kg-text-muted)] truncate mt-0.5">{act.hint}</p>
                </div>
              </button>
            );
          })}
        </div>
      </KgBottomSheet>

      {/* Mobile Account & Quick Preferences Sheet */}
      <KgBottomSheet
        isOpen={isMobileAccountOpen}
        onClose={() => setIsMobileAccountOpen(false)}
        title="Tài khoản & Tiện ích Hệ thống"
      >
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] flex items-center gap-3">
            <div className="w-11 h-11 rounded-[14px] bg-[var(--kg-primary)] text-[var(--kg-primary-fg)] font-extrabold text-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                getSafeDisplayInitial(currentUser?.fullname, currentUser?.username)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-[var(--kg-text)] truncate">
                  {currentUser?.fullname || 'Nhân sự'}
                </p>
                {isAdmin && <Shield size={13} className="text-[var(--kg-primary-ink)] flex-shrink-0" />}
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
                <Sparkles size={17} strokeWidth={1.85} className="text-[var(--kg-primary-ink)] flex-shrink-0" />
                <span className="truncate">Thông tin phiên bản &amp; Điểm mới</span>
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-xs font-mono font-bold flex-shrink-0">
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
                  Hồ sơ cá nhân &amp; Mật khẩu
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
              className="kg-pressable w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/25 font-bold text-sm flex items-center justify-center gap-2 hover:brightness-95"
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

      {/* More Action Sheet (Deduplicated — Release Notes & Newbie Guide live in Account Sheet) */}
      <KgActionSheet
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="Danh mục Phân hệ"
        actions={moreActions.map((action) => ({
          ...action,
          active: currentTab === action.id,
          onPrefetch: () => onPrefetch?.(action.id),
        }))}
      />

      {/* Global Newbie Guide Modal - lazy-loaded on demand */}
      {isGuideOpen && (
        <Suspense fallback={null}>
          <NewbieGuideModal
            isOpen={isGuideOpen}
            onClose={() => setIsGuideOpen(false)}
            onNavigateTab={handleTabChange}
          />
        </Suspense>
      )}

      {/* Global Command Palette (Ctrl+K / Cmd+K) - lazy-loaded on demand */}
      {isCommandOpen && (
        <Suspense fallback={null}>
          <KgCommandPalette
            isOpen={isCommandOpen}
            onClose={() => setIsCommandOpen(false)}
            onNavigateTab={handleTabChange}
            onOpenGuide={() => setIsGuideOpen(true)}
          />
        </Suspense>
      )}

      {/* Offline Vault Inspection & Manual Retry Drawer */}
      {isSyncVaultOpen && (
        <Suspense fallback={null}>
          <SyncVaultDrawer
            isOpen={isSyncVaultOpen}
            onClose={() => setIsSyncVaultOpen(false)}
            isSyncing={isSyncing}
            lastSyncTime={lastFetchTime || undefined}
            onManualSync={handleManualSync}
          />
        </Suspense>
      )}
    </div>
  );
}
