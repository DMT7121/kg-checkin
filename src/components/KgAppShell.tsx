import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Sun, Moon, Power, Clock, MoreHorizontal, GraduationCap, Sparkles } from 'lucide-react';
import NotificationBell from './NotificationBell';
import NewbieGuideModal from './NewbieGuideModal';
import { KgActionSheet } from './KgDesignSystem';
import { getTabLabel, hasTabPermission } from '../utils/permissions';
import { navigationModules, type NavigationGroup } from '../config/moduleRegistry';
import type { TabId } from '../types/navigation';

interface KgAppShellProps {
  children: React.ReactNode;
  onPrefetch?: (tab: TabId) => void;
}

export default function KgAppShell({ children, onPrefetch }: KgAppShellProps) {
  const store = useAppStore();
  const { currentUser, isDark, currentTab } = store;
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const handleLogout = () => {
    store.logout();
    document.documentElement.classList.remove('dark');
  };

  const handleTabChange = (tab: TabId) => {
    store.setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const allowedModules = navigationModules.filter(module => hasTabPermission(module.id, currentUser));
  const bottomTabs = allowedModules.filter(module => module.bottom);
  const moreActions = allowedModules
    .filter(module => !module.bottom)
    .map(module => ({
      ...module,
      onClick: () => handleTabChange(module.id),
    }));

  const allMoreActions = [
    {
      id: 'guide_modal_action' as any,
      label: 'Hướng dẫn cho người mới',
      icon: GraduationCap,
      group: 'Vận hành' as const,
      onClick: () => {
        setIsMoreOpen(false);
        setIsGuideOpen(true);
      }
    },
    ...moreActions,
  ];

  const groupOrder: NavigationGroup[] = ['Cá nhân', 'Vận hành', 'Quản lý & Cấu hình'];
  const menuGroups = groupOrder
    .map(label => ({
      label,
      items: allowedModules.filter(module => module.group === label),
    }))
    .filter(group => group.items.length > 0);

  return (
    <div className="w-full min-h-screen flex flex-col md:flex-row bg-[var(--kg-bg)] text-[var(--kg-text)] transition-colors duration-200">
      
      {/* 1. MOBILE TOPBAR */}
      <header className="sticky top-0 z-40 w-full bg-[var(--kg-surface)] border-b border-[var(--kg-border)] px-4 py-3 pt-safe-top flex justify-between items-center md:hidden">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex items-center justify-center flex-shrink-0 shadow-sm">
            <img src="/android-chrome-192x192.png?v=3" alt="Logo" className="w-6 h-6 object-contain" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-tight leading-tight text-[var(--kg-text)]">
              KG Staff OS
            </h1>
            <p className="text-[10px] font-bold text-[var(--kg-text-muted)]">
              {currentUser?.fullname.split(' ').pop()} • {currentUser?.role === 'admin' ? 'Quản lý' : 'Nhân sự'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            className="w-10 h-10 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text)] flex items-center justify-center active:scale-95 transition-all shadow-xs hover:border-[var(--kg-primary)] touch-manipulation"
            title="Hướng dẫn cho người mới"
            aria-label="Hướng dẫn cho người mới"
          >
            <GraduationCap size={18} />
          </button>
          <NotificationBell />
          <button
            type="button"
            onClick={() => store.toggleDarkMode()}
            className="w-10 h-10 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] active:scale-95 transition-all touch-manipulation"
            aria-label="Chuyển chế độ sáng/tối"
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-10 h-10 rounded-xl bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/20 flex items-center justify-center active:scale-95 transition-all hover:brightness-95 touch-manipulation"
            aria-label="Đăng xuất"
          >
            <Power size={17} />
          </button>
        </div>
      </header>

      {/* 2. DESKTOP SIDEBAR (Sleek light / dark responsive sidebar) */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-[var(--kg-surface)] text-[var(--kg-text)] border-r border-[var(--kg-border)] h-screen sticky top-0 overflow-y-auto hide-scrollbar shadow-soft">
        {/* Sidebar Header with glass mark */}
        <div className="px-5 py-6 border-b border-[var(--kg-border)] flex items-center gap-3.5 flex-shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-[var(--kg-surface-soft)] flex items-center justify-center flex-shrink-0 shadow-sm border border-[var(--kg-border)]">
            <img src="/android-chrome-192x192.png?v=3" alt="Logo" className="w-7 h-7 object-contain" />
          </div>
          <div>
            <h2 className="font-black text-sm tracking-wide uppercase text-[var(--kg-text)] leading-tight">
              King's Grill
            </h2>
            <p className="text-[11px] font-bold text-[var(--kg-text-muted)]">
              Operations OS
            </p>
          </div>
        </div>

        {/* User profile card */}
        <div className="mx-4 my-3 p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center gap-3 shadow-sm">
          {currentUser?.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-300 dark:border-slate-700" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#2563eb] to-[#7c3aed] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              {currentUser?.fullname.charAt(0) || 'U'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-[var(--kg-text)] text-xs truncate leading-tight">
              {currentUser?.fullname || 'Staff'}
            </h3>
            <p className="text-[10px] font-bold text-[var(--kg-text-muted)] mt-0.5 truncate uppercase tracking-wider">
              {currentUser?.role === 'admin' ? '🛡️ Quản lý' : '👤 Nhân viên'}
            </p>
          </div>
        </div>

        {/* Quick Newbie Banner in Sidebar */}
        <div className="mx-4 mb-2">
          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            className="w-full p-3 rounded-2xl bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-violet-600/10 border border-blue-500/20 dark:border-indigo-900/30 text-left hover:border-blue-500/40 transition-all active:scale-98 group flex items-center gap-2.5"
          >
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs flex-shrink-0 group-hover:scale-105 transition-transform">
              <GraduationCap size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-blue-600 dark:text-indigo-400 truncate">
                Hướng dẫn người mới
              </p>
              <p className="text-[10px] text-[var(--kg-text-muted)] truncate font-semibold">
                Quy trình & Tiêu chuẩn đạt
              </p>
            </div>
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-2 space-y-5">
          {menuGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              <span className="px-3 text-[10px] font-extrabold text-[var(--kg-text-muted)] uppercase tracking-wider block">
                {group.label}
              </span>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = currentTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      onPointerEnter={() => onPrefetch?.(item.id)}
                      onFocus={() => onPrefetch?.(item.id)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`kg-nav-item ${isActive ? 'kg-nav-item--active' : ''} w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                        isActive
                          ? 'text-white font-bold shadow-md scale-[1.02]'
                          : 'text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)] border border-transparent'
                      }`}
                    >
                      <Icon size={16} className={isActive ? 'kg-nav-item__active-icon text-white' : 'text-[var(--kg-text-muted)]'} />
                      <span className="text-[13px]">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="w-9 h-9 rounded-lg border border-[var(--kg-border)] bg-[var(--kg-surface)] text-[var(--kg-text)] flex items-center justify-center active:scale-95 transition-all shadow-xs hover:border-[var(--kg-primary)]"
              title="Hướng dẫn cho người mới"
            >
              <GraduationCap size={16} />
            </button>
            <NotificationBell />
            <button
              type="button"
              onClick={() => store.toggleDarkMode()}
              className="w-9 h-9 rounded-lg border border-[var(--kg-border)] bg-[var(--kg-surface)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center active:scale-95 transition-all shadow-sm"
              title="Đổi giao diện"
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="w-9 h-9 rounded-lg bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/20 hover:brightness-95 flex items-center justify-center active:scale-95 transition-all"
            title="Đăng xuất"
          >
            <Power size={15} />
          </button>
        </div>
      </aside>

      {/* 3. MAIN CONTENT */}
      <main className="kg-app-main flex-1 flex flex-col min-w-0 h-screen md:overflow-y-auto overflow-x-hidden pb-[80px] md:pb-0">
        
        {/* Desktop breadcrumbs & status */}
        <div className="hidden md:flex justify-between items-center px-6 py-4 border-b border-[var(--kg-border)] bg-[var(--kg-surface)] flex-shrink-0">
          <div className="flex items-center space-x-2 text-xs font-bold text-[var(--kg-text-muted)] uppercase tracking-wider">
            <span>KG Staff OS</span>
            <span>/</span>
            <span className="text-[var(--kg-primary)] dark:text-[var(--kg-accent)]">
              {allowedModules.find(module => module.id === currentTab)?.label || getTabLabel(currentTab)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-indigo-400 text-xs font-bold flex items-center gap-1.5 hover:bg-blue-500/20 transition-all active:scale-95"
            >
              <Sparkles size={13} />
              <span>Hướng dẫn người mới</span>
            </button>
            <div className="text-xs font-semibold text-[var(--kg-text-muted)] flex items-center gap-1.5">
              <Clock size={13} className="text-[var(--kg-primary)] dark:text-[var(--kg-accent)]" />
              <span>Ca hiện tại: <b>{store.shiftName}</b></span>
            </div>
            <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-ping" />
          </div>
        </div>

        {/* Scrollable page body */}
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-12 min-h-0">
          {children}
        </div>
      </main>

      {/* 4. MOBILE BOTTOM NAVIGATION */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--kg-surface)]/95 backdrop-blur-xl border-t border-[var(--kg-border)] flex justify-around items-center pt-2 px-1 bottom-safe-nav shadow-2xl">
        {bottomTabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              onPointerEnter={() => onPrefetch?.(tab.id)}
              onFocus={() => onPrefetch?.(tab.id)}
              onTouchStart={() => onPrefetch?.(tab.id)}
              className="relative flex flex-col items-center justify-center w-16 min-h-[44px] py-1 transition-all touch-manipulation active:scale-95"
            >
              {/* Top Active Glow Indicator Bar */}
              {isActive && (
                <span className="absolute -top-2 w-8 h-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_10px_rgba(59,130,246,0.9)] animate-pulse" />
              )}
              
              <div
                className={`w-11 h-7.5 rounded-xl flex items-center justify-center mb-1 transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 scale-105 ring-2 ring-blue-500/20'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <Icon size={19} className={isActive ? 'text-white' : ''} />
              </div>
              <span
                className={`text-[9.5px] tracking-wider uppercase transition-all ${
                  isActive ? 'font-black text-blue-600 dark:text-indigo-400 scale-105' : 'font-bold text-[var(--kg-text-muted)] opacity-70'
                }`}
              >
                {tab.shortLabel || tab.label}
              </span>
            </button>
          );
        })}

        {/* "More" button with smart active detection */}
        {(() => {
          const isMoreActionActive = allMoreActions.some(action => currentTab === action.id);
          return (
            <button
              type="button"
              onClick={() => setIsMoreOpen(true)}
              className="relative flex flex-col items-center justify-center w-16 min-h-[44px] py-1 transition-all touch-manipulation active:scale-95"
            >
              {isMoreActionActive && (
                <span className="absolute -top-2 w-8 h-1 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-[0_0_10px_rgba(59,130,246,0.9)] animate-pulse" />
              )}
              <div
                className={`w-11 h-7.5 rounded-xl flex items-center justify-center mb-1 transition-all ${
                  isMoreActionActive
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 scale-105 ring-2 ring-blue-500/20'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <MoreHorizontal size={19} className={isMoreActionActive ? 'text-white' : ''} />
              </div>
              <span
                className={`text-[9.5px] tracking-wider uppercase transition-all ${
                  isMoreActionActive ? 'font-black text-blue-600 dark:text-indigo-400 scale-105' : 'font-bold text-[var(--kg-text-muted)] opacity-70'
                }`}
              >
                Thêm
              </span>
            </button>
          );
        })()}
      </nav>

      {/* More action sheet */}
      <KgActionSheet
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="Tính năng mở rộng"
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
    </div>
  );
}

