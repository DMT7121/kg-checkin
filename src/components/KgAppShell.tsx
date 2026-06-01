import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  Sun, Moon, Power, Camera, Calendar, Clock, Bell, Menu, X,
  LayoutDashboard, Newspaper, UtensilsCrossed, MessageSquareWarning,
  ClipboardCheck, Repeat, ArrowLeftRight, CalendarDays, History,
  CalendarClock, BadgeDollarSign, Banknote, ShieldAlert, Award,
  Users, KeyRound, CalendarRange, DollarSign, Building2, HelpCircle,
  MoreHorizontal
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import { KgActionSheet, KgBottomSheet } from './KgDesignSystem';

type TabId = ReturnType<typeof useAppStore.getState>['currentTab'];

interface KgAppShellProps {
  children: React.ReactNode;
}

export default function KgAppShell({ children }: KgAppShellProps) {
  const store = useAppStore();
  const { currentUser, isDark, currentTab } = store;
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';

  const handleLogout = () => {
    store.logout();
    document.documentElement.classList.remove('dark');
  };

  const handleTabChange = (tab: TabId) => {
    store.setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // Define bottom nav tabs
  const bottomTabs = [
    { id: 'dashboard' as TabId, label: 'Hôm nay', icon: LayoutDashboard },
    { id: 'checkin' as TabId, label: 'Chấm công', icon: Camera },
    { id: 'schedule' as TabId, label: 'Lịch làm', icon: Calendar },
    { id: 'payroll' as TabId, label: 'Công lương', icon: Banknote },
  ];

  // Define actions for the "More" Action Sheet
  const moreActions = [
    { label: 'Bảng tin', icon: Newspaper, onClick: () => handleTabChange('news') },
    { label: 'Món hết', icon: UtensilsCrossed, onClick: () => handleTabChange('soldout') },
    { label: 'Checklist', icon: ClipboardCheck, onClick: () => handleTabChange('checklist') },
    { label: 'Bàn giao ca', icon: Repeat, onClick: () => handleTabChange('handover') },
    { label: 'Đổi ca', icon: ArrowLeftRight, onClick: () => handleTabChange('swap') },
    { label: 'Lịch tổng', icon: CalendarDays, onClick: () => handleTabChange('roster') },
    { label: 'Chấm công gần đây', icon: History, onClick: () => handleTabChange('history') },
    { label: 'Đào tạo', icon: CalendarClock, onClick: () => handleTabChange('training') },
    { label: 'Góp ý', icon: MessageSquareWarning, onClick: () => handleTabChange('feedback') },
    { label: 'Hồ sơ', icon: Users, onClick: () => handleTabChange('profile') },
    ...(isAdmin ? [
      { label: 'Cấu hình AI', icon: ShieldAlert, onClick: () => handleTabChange('admin'), color: 'text-orange-500' },
      { label: 'Nhân sự', icon: Users, onClick: () => handleTabChange('hr_list'), color: 'text-teal-500' },
      { label: 'Tổ chức & Quyền', icon: KeyRound, onClick: () => handleTabChange('admin_org'), color: 'text-teal-500' },
      { label: 'Phân ca', icon: CalendarRange, onClick: () => handleTabChange('admin_shift'), color: 'text-teal-500' },
      { label: 'Cấu hình lương', icon: DollarSign, onClick: () => handleTabChange('admin_payroll'), color: 'text-teal-500' },
      { label: 'Cấu hình checklist', icon: ClipboardCheck, onClick: () => handleTabChange('admin_checklist'), color: 'text-teal-500' },
      { label: 'Báo cáo', icon: Building2, onClick: () => handleTabChange('admin_analytics'), color: 'text-teal-500' },
    ] : [])
  ];

  // Define desktop sidebar menu groups
  const menuGroups = [
    {
      label: 'Cá nhân',
      items: [
        { id: 'dashboard' as TabId, label: 'Hôm nay', icon: LayoutDashboard },
        { id: 'checkin' as TabId, label: 'Chấm công', icon: Camera },
        { id: 'schedule' as TabId, label: 'Lịch đăng ký', icon: Calendar },
        { id: 'payroll' as TabId, label: 'Phiếu lương', icon: Banknote },
        { id: 'history' as TabId, label: 'Lịch sử chấm công', icon: History },
      ]
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
      ]
    },
    ...(isAdmin ? [
      {
        label: 'Quản lý & Cấu hình',
        items: [
          { id: 'admin' as TabId, label: 'Cấu hình AI', icon: ShieldAlert },
          { id: 'hr_list' as TabId, label: 'Danh sách nhân sự', icon: Users },
          { id: 'admin_org' as TabId, label: 'Tổ chức & Quyền', icon: KeyRound },
          { id: 'admin_shift' as TabId, label: 'Cấu hình phân ca', icon: CalendarRange },
          { id: 'admin_payroll' as TabId, label: 'Cấu hình lương thưởng', icon: DollarSign },
          { id: 'admin_checklist' as TabId, label: 'Cấu hình checklist', icon: ClipboardCheck },
          { id: 'admin_analytics' as TabId, label: 'Thống kê & Báo cáo', icon: Building2 },
        ]
      }
    ] : [])
  ];

  return (
    <div className="w-full min-h-screen flex flex-col md:flex-row bg-[#f8fafc] dark:bg-[#090d16] text-slate-800 dark:text-slate-200 transition-colors duration-200">
      
      {/* 1. TOPBAR (Fixed at top, responsive height, styled) */}
      <header className="sticky top-0 z-40 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 py-3 flex justify-between items-center md:hidden">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 flex items-center justify-center flex-shrink-0 shadow-sm">
            <img src="/android-chrome-192x192.png?v=3" alt="Logo" className="w-6 h-6 object-contain" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-tight leading-tight text-slate-905 dark:text-white">
              KG Staff OS
            </h1>
            <p className="text-[10px] font-bold text-slate-450 dark:text-slate-400">
              {currentUser?.fullname.split(' ').pop()} • {currentUser?.role === 'admin' ? 'Quản lý' : 'Nhân sự'}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1.5">
          <NotificationBell />
          <button
            onClick={() => store.toggleDarkMode()}
            className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-500 dark:text-slate-400 active:scale-95 transition-all"
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button
            onClick={handleLogout}
            className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-650 dark:text-red-400 flex items-center justify-center active:scale-95 transition-all"
          >
            <Power size={17} />
          </button>
        </div>
      </header>

      {/* 2. DESKTOP SIDEBAR (Thin, sleek sidebar, fixed position) */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 h-screen sticky top-0 overflow-y-auto hide-scrollbar">
        {/* Sidebar Header */}
        <div className="px-5 py-6 border-b border-slate-100 dark:border-slate-900 flex items-center gap-3.5 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center flex-shrink-0 shadow-sm">
            <img src="/android-chrome-192x192.png?v=3" alt="Logo" className="w-7 h-7 object-contain" />
          </div>
          <div>
            <h2 className="font-black text-sm tracking-wide uppercase text-teal-650 dark:text-teal-400 leading-tight">
              King's Grill
            </h2>
            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
              Operations OS
            </p>
          </div>
        </div>

        {/* User Card */}
        <div className="mx-4 my-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 flex items-center gap-3">
          {currentUser?.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              {currentUser?.fullname.charAt(0) || 'U'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate leading-tight">
              {currentUser?.fullname || 'Staff'}
            </h3>
            <p className="text-[10px] font-bold text-slate-450 dark:text-slate-500 mt-0.5 truncate uppercase tracking-wider">
              {currentUser?.role === 'admin' ? '🛡️ Quản lý' : '👤 Nhân viên'}
            </p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-2 space-y-5">
          {menuGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              <span className="px-3 text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wider block">
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
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all ${
                        isActive
                          ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 font-bold border border-teal-200/40 dark:border-teal-900/40'
                          : 'text-slate-650 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/60 border border-transparent'
                      }`}
                    >
                      <Icon size={16} className={isActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'} />
                      <span className="text-[13px]">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-900/20 flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <NotificationBell />
            <button
              onClick={() => store.toggleDarkMode()}
              className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center text-slate-500 dark:text-slate-400 active:scale-95 transition-all shadow-sm"
              title="Đổi giao diện"
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-950/45 text-red-650 dark:text-red-400 flex items-center justify-center active:scale-95 transition-all"
            title="Đăng xuất"
          >
            <Power size={15} />
          </button>
        </div>
      </aside>

      {/* 3. MAIN CONTENT CONTAINER (Paddings and responsive Layout) */}
      <main className="flex-1 flex flex-col min-w-0 h-screen md:overflow-y-auto overflow-x-hidden pb-[80px] md:pb-0">
        {/* Desktop Breadcrumbs / Status Header */}
        <div className="hidden md:flex justify-between items-center px-6 py-4 bg-white dark:bg-slate-950 border-b border-slate-100 dark:border-slate-900 flex-shrink-0">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-450 uppercase tracking-wide">
            <span>KG Staff OS</span>
            <span>/</span>
            <span className="text-teal-600 dark:text-teal-400">
              {bottomTabs.find(t => t.id === currentTab)?.label || 'Vận hành'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Clock size={13} className="text-teal-600" />
              <span>Ca hiện tại: <b>{store.shiftName}</b></span>
            </div>
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
          </div>
        </div>

        {/* Scrollable page body */}
        <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 md:py-6 min-h-0">
          {children}
        </div>
      </main>

      {/* 4. MOBILE BOTTOM NAVIGATION (Always visible at bottom on mobile, safe-area-aware) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-45 bg-white/95 dark:bg-slate-950/95 border-t border-slate-200/80 dark:border-slate-900 backdrop-blur-lg flex justify-around items-center py-2 px-1 pb-safe-bottom shadow-lg">
        {bottomTabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className="flex flex-col items-center justify-center w-16 py-1.5 transition-all text-slate-450 dark:text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              <div
                className={`w-10 h-7 rounded-xl flex items-center justify-center mb-1 transition-all ${
                  isActive
                    ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-650 dark:text-teal-450 scale-105'
                    : ''
                }`}
              >
                <Icon size={20} className={isActive ? 'text-teal-650 dark:text-teal-400' : ''} />
              </div>
              <span
                className={`text-[9px] font-extrabold tracking-wide uppercase ${
                  isActive ? 'text-teal-700 dark:text-teal-400 font-black' : 'opacity-80'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* Bottom tab "More" button */}
        <button
          onClick={() => setIsMoreOpen(true)}
          className="flex flex-col items-center justify-center w-16 py-1.5 transition-all text-slate-450 dark:text-slate-500"
        >
          <div className="w-10 h-7 rounded-xl flex items-center justify-center mb-1">
            <MoreHorizontal size={20} />
          </div>
          <span className="text-[9px] font-extrabold tracking-wide uppercase opacity-80">
            Thêm
          </span>
        </button>
      </nav>

      {/* More actions sheet */}
      <KgActionSheet
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="Tính năng mở rộng"
        actions={moreActions}
      />
    </div>
  );
}
