import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  Sun, Moon, Power, Camera, Calendar, Clock,
  LayoutDashboard, Newspaper, UtensilsCrossed, MessageSquareWarning,
  ClipboardCheck, Repeat, ArrowLeftRight, CalendarDays, History,
  CalendarClock, Users, KeyRound, CalendarRange, DollarSign, Building2,
  MoreHorizontal, BookOpen
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import { KgActionSheet } from './KgDesignSystem';
import { hasTabPermission } from '../utils/permissions';

type TabId = ReturnType<typeof useAppStore.getState>['currentTab'];

interface KgAppShellProps {
  children: React.ReactNode;
}

export default function KgAppShell({ children }: KgAppShellProps) {
  const store = useAppStore();
  const { currentUser, isDark, currentTab } = store;
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';

  const handleLogout = () => {
    store.logout();
    document.documentElement.classList.remove('dark');
  };

  const handleTabChange = (tab: TabId) => {
    store.setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // Bottom navigation tabs (dynamically filtered by permission)
  const bottomTabs = [
    { id: 'dashboard' as TabId, label: 'Hôm nay', icon: LayoutDashboard },
    { id: 'checkin' as TabId, label: 'Chấm công', icon: Camera },
    { id: 'schedule' as TabId, label: 'Lịch làm', icon: Calendar },
    { id: 'payroll' as TabId, label: 'Công lương', icon: DollarSign },
  ].filter(tab => hasTabPermission(tab.id, currentUser));

  // Actions for bottom tab "More" action sheet (dynamically filtered by permission)
  const moreActions = [
    { id: 'news' as TabId, label: 'Bảng tin', icon: Newspaper, onClick: () => handleTabChange('news') },
    { id: 'soldout' as TabId, label: 'Món hết', icon: UtensilsCrossed, onClick: () => handleTabChange('soldout') },
    { id: 'checklist' as TabId, label: 'Checklist', icon: ClipboardCheck, onClick: () => handleTabChange('checklist') },
    { id: 'handover' as TabId, label: 'Bàn giao ca', icon: Repeat, onClick: () => handleTabChange('handover') },
    { id: 'swap' as TabId, label: 'Đổi ca', icon: ArrowLeftRight, onClick: () => handleTabChange('swap') },
    { id: 'roster' as TabId, label: 'Lịch tổng', icon: CalendarDays, onClick: () => handleTabChange('roster') },
    { id: 'history' as TabId, label: 'Lịch sử', icon: History, onClick: () => handleTabChange('history') },
    { id: 'training' as TabId, label: 'Đào tạo', icon: CalendarClock, onClick: () => handleTabChange('training') },
    { id: 'feedback' as TabId, label: 'Góp ý', icon: MessageSquareWarning, onClick: () => handleTabChange('feedback') },
    { id: 'profile' as TabId, label: 'Hồ sơ', icon: Users, onClick: () => handleTabChange('profile') },
    { id: 'guide' as TabId, label: 'Hướng dẫn', icon: BookOpen, onClick: () => handleTabChange('guide') },
    { id: 'admin' as TabId, label: 'Cấu hình AI', icon: Building2, onClick: () => handleTabChange('admin') },
    { id: 'hr_list' as TabId, label: 'Nhân sự', icon: Users, onClick: () => handleTabChange('hr_list') },
    { id: 'admin_org' as TabId, label: 'Tổ chức & Quyền', icon: KeyRound, onClick: () => handleTabChange('admin_org') },
    { id: 'admin_shift' as TabId, label: 'Phân ca', icon: CalendarRange, onClick: () => handleTabChange('admin_shift') },
    { id: 'admin_payroll' as TabId, label: 'Cấu hình lương', icon: DollarSign, onClick: () => handleTabChange('admin_payroll') },
    { id: 'admin_checklist' as TabId, label: 'Cấu hình checklist', icon: ClipboardCheck, onClick: () => handleTabChange('admin_checklist') },
    { id: 'admin_analytics' as TabId, label: 'Báo cáo', icon: Building2, onClick: () => handleTabChange('admin_analytics') },
  ].filter(action => hasTabPermission(action.id, currentUser));

  // Sidebar navigation menu groups for Desktop (dynamically filtered by permission)
  const menuGroups = [
    {
      label: 'Cá nhân',
      items: [
        { id: 'dashboard' as TabId, label: 'Hôm nay', icon: LayoutDashboard },
        { id: 'checkin' as TabId, label: 'Chấm công', icon: Camera },
        { id: 'schedule' as TabId, label: 'Lịch đăng ký', icon: Calendar },
        { id: 'payroll' as TabId, label: 'Phiếu lương', icon: DollarSign },
        { id: 'history' as TabId, label: 'Lịch sử chấm công', icon: History },
      ].filter(item => hasTabPermission(item.id, currentUser))
    },
    {
      label: 'Vận hành',
      items: [
        { id: 'checklist' as TabId, label: 'Checklist việc', icon: ClipboardCheck },
        { id: 'handover' as TabId, label: 'Bàn giao ca', icon: Repeat },
        { id: 'swap' as TabId, label: 'Đổi ca', icon: ArrowLeftRight },
        { id: 'roster' as TabId, label: 'Lịch tổng', icon: CalendarDays },
        { id: 'news' as TabId, label: 'Bảng tin', icon: Newspaper },
        { id: 'soldout' as TabId, label: 'Món hết', icon: UtensilsCrossed },
        { id: 'feedback' as TabId, label: 'Góp ý', icon: MessageSquareWarning },
        { id: 'training' as TabId, label: 'Đào tạo', icon: CalendarClock },
      ].filter(item => hasTabPermission(item.id, currentUser))
    },
    {
      label: 'Quản lý & Cấu hình',
      items: [
        { id: 'admin' as TabId, label: 'Cấu hình AI', icon: Building2 },
        { id: 'hr_list' as TabId, label: 'Danh sách nhân sự', icon: Users },
        { id: 'admin_org' as TabId, label: 'Tổ chức & Quyền', icon: KeyRound },
        { id: 'admin_shift' as TabId, label: 'Cấu hình phân ca', icon: CalendarRange },
        { id: 'admin_payroll' as TabId, label: 'Cấu hình lương thưởng', icon: DollarSign },
        { id: 'admin_checklist' as TabId, label: 'Cấu hình checklist', icon: ClipboardCheck },
        { id: 'admin_analytics' as TabId, label: 'Thống kê & Báo cáo', icon: Building2 },
      ].filter(item => hasTabPermission(item.id, currentUser))
    },
    {
      label: 'Hỗ trợ',
      items: [
        { id: 'guide' as TabId, label: 'Hướng dẫn sử dụng', icon: BookOpen },
      ].filter(item => hasTabPermission(item.id, currentUser))
    }
  ].filter(group => group.items.length > 0);

  return (
    <div className="w-full min-h-screen flex flex-col md:flex-row bg-[#F8F3EA] dark:bg-[#061B2B] text-[#172033] dark:text-[#F1F5F9] transition-colors duration-200">
      
      {/* 1. MOBILE TOPBAR */}
      <header className="sticky top-0 z-40 w-full bg-white dark:bg-[#0E273C] border-b border-[#E8DED1] dark:border-[#1E3F57] px-4 py-3 flex justify-between items-center md:hidden">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl border border-[#E8DED1] dark:border-[#1E3F57] bg-white dark:bg-[#0E273C] flex items-center justify-center flex-shrink-0 shadow-sm">
            <img src="/android-chrome-192x192.png?v=3" alt="Logo" className="w-6 h-6 object-contain" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-tight leading-tight text-[#172033] dark:text-white">
              KG Staff OS
            </h1>
            <p className="text-[10px] font-bold text-[#6F7785] dark:text-[#A0ABC0]">
              {currentUser?.fullname.split(' ').pop()} • {currentUser?.role === 'admin' ? 'Quản lý' : 'Nhân sự'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1.5">
          <NotificationBell />
          <button
            onClick={() => store.toggleDarkMode()}
            className="w-10 h-10 rounded-xl border border-[#E8DED1] dark:border-[#1E3F57] bg-[#FBF7F0] dark:bg-[#122F48] flex items-center justify-center text-[#6F7785] dark:text-[#A0ABC0] active:scale-95 transition-all"
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            onClick={handleLogout}
            className="w-10 h-10 rounded-xl bg-[#FFF0EE] dark:bg-[#C94335]/15 text-[#C94335] flex items-center justify-center active:scale-95 transition-all"
          >
            <Power size={17} />
          </button>
        </div>
      </header>

      {/* 2. DESKTOP SIDEBAR (Sleek light / dark responsive sidebar) */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white dark:bg-[#0E273C] text-slate-800 dark:text-slate-100 border-r border-[#E8DED1] dark:border-[#1E3F57] h-screen sticky top-0 overflow-y-auto hide-scrollbar shadow-soft">
        {/* Sidebar Header with glass mark */}
        <div className="px-5 py-6 border-b border-[#E8DED1] dark:border-[#1E3F57] flex items-center gap-3.5 flex-shrink-0">
          <div className="w-10 h-10 rounded-2xl bg-[#f3f6ff] dark:bg-[#122F48] flex items-center justify-center flex-shrink-0 shadow-sm border border-transparent dark:border-[#1E3F57]">
            <img src="/android-chrome-192x192.png?v=3" alt="Logo" className="w-7 h-7 object-contain" />
          </div>
          <div>
            <h2 className="font-black text-sm tracking-wide uppercase text-slate-800 dark:text-white leading-tight">
              King's Grill
            </h2>
            <p className="text-[11px] font-bold text-[#64748b] dark:text-slate-500">
              Operations OS
            </p>
          </div>
        </div>

        {/* User profile card */}
        <div className="mx-4 my-4 p-3.5 rounded-2xl bg-[#f3f6ff] dark:bg-[#122F48] border border-[#E8DED1] dark:border-[#1E3F57] flex items-center gap-3 shadow-sm">
          {currentUser?.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-300 dark:border-slate-700" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#2563eb] to-[#7c3aed] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              {currentUser?.fullname.charAt(0) || 'U'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-800 dark:text-white text-xs truncate leading-tight">
              {currentUser?.fullname || 'Staff'}
            </h3>
            <p className="text-[10px] font-bold text-[#64748b] mt-0.5 truncate uppercase tracking-wider">
              {currentUser?.role === 'admin' ? '🛡️ Quản lý' : '👤 Nhân viên'}
            </p>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-2 space-y-5">
          {menuGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              <span className="px-3 text-[10px] font-extrabold text-[#64748b] dark:text-slate-550 uppercase tracking-wider block">
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
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white font-bold shadow-md scale-[1.02]'
                          : 'text-[#64748b] dark:text-[#A0ABC0] hover:bg-[#f3f6ff] dark:hover:bg-[#122F48] border border-transparent'
                      }`}
                    >
                      <Icon size={16} className={isActive ? 'text-white' : 'text-[#64748b] dark:text-slate-500'} />
                      <span className="text-[13px]">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[#E8DED1] dark:border-[#1E3F57] bg-[#f7f9ff] dark:bg-[#122F48]/40 flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <NotificationBell />
            <button
              onClick={() => store.toggleDarkMode()}
              className="w-9 h-9 rounded-lg border border-[#E8DED1] dark:border-slate-800 bg-white dark:bg-[#0E273C] text-[#64748b] dark:text-[#A0ABC0] flex items-center justify-center active:scale-95 transition-all shadow-sm"
              title="Đổi giao diện"
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-lg bg-[#ef4444]/12 hover:bg-[#ef4444]/22 text-[#ef4444] flex items-center justify-center active:scale-95 transition-all"
            title="Đăng xuất"
          >
            <Power size={15} />
          </button>
        </div>
      </aside>

      {/* 3. MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 h-screen md:overflow-y-auto overflow-x-hidden pb-[80px] md:pb-0">
        
        {/* Desktop breadcrumbs & status */}
        <div className="hidden md:flex justify-between items-center px-6 py-4 border-b border-[#E8DED1] dark:border-[#1E3F57] bg-white dark:bg-[#0E273C] flex-shrink-0">
          <div className="flex items-center space-x-2 text-xs font-bold text-[#64748b] dark:text-[#A0ABC0] uppercase tracking-wider">
            <span>KG Staff OS</span>
            <span>/</span>
            <span className="text-[#2563eb] dark:text-[#7c3aed]">
              {bottomTabs.find(t => t.id === currentTab)?.label || 'Vận hành'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-semibold text-[#64748b] dark:text-[#A0ABC0] flex items-center gap-1.5">
              <Clock size={13} className="text-[#2563eb] dark:text-[#7c3aed]" />
              <span>Ca hiện tại: <b>{store.shiftName}</b></span>
            </div>
            <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full animate-ping" />
          </div>
        </div>

        {/* Scrollable page body */}
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 md:py-6 min-h-0">
          {children}
        </div>
      </main>

      {/* 4. MOBILE BOTTOM NAVIGATION */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-45 bg-white/80 dark:bg-[#0E273C]/80 backdrop-blur-md border-t border-[#E8DED1] dark:border-[#1E3F57] flex justify-around items-center py-2 px-1 pb-safe-bottom shadow-lg">
        {bottomTabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className="flex flex-col items-center justify-center w-16 py-1.5 transition-all text-[#64748b] dark:text-[#A0ABC0]"
            >
              <div
                className={`w-10 h-7 rounded-xl flex items-center justify-center mb-1 transition-all ${
                  isActive
                    ? 'bg-[#f3f6ff] dark:bg-[#1E3F57] text-[#2563eb] dark:text-[#7c3aed] scale-105 shadow-inner'
                    : ''
                }`}
              >
                <Icon size={20} className={isActive ? 'text-[#2563eb] dark:text-[#7c3aed]' : ''} />
              </div>
              <span
                className={`text-[9px] font-bold tracking-wide uppercase ${
                  isActive ? 'text-[#2563eb] dark:text-[#7c3aed]' : 'opacity-80'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* "More" button */}
        <button
          onClick={() => setIsMoreOpen(true)}
          className="flex flex-col items-center justify-center w-16 py-1.5 transition-all text-[#64748b] dark:text-[#A0ABC0]"
        >
          <div className="w-10 h-7 rounded-xl flex items-center justify-center mb-1">
            <MoreHorizontal size={20} />
          </div>
          <span className="text-[9px] font-bold tracking-wide uppercase opacity-80">
            Thêm
          </span>
        </button>
      </nav>

      {/* More action sheet */}
      <KgActionSheet
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="Tính năng mở rộng"
        actions={moreActions}
      />
    </div>
  );
}
