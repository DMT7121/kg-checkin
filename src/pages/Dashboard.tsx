import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { computeWeekInfo } from '../utils/helpers';
import {
  Sun, Moon, Power, Camera, Calendar, Clock3, ShieldAlert,
  ArrowLeftRight, Newspaper, GraduationCap, Menu, X,
  LayoutDashboard, UtensilsCrossed, MessageSquareWarning,
  ClipboardCheck, Repeat, CalendarDays, History,
  CalendarClock, Banknote, BadgeDollarSign, Award, ChevronDown,
  Settings, Briefcase, CheckSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CheckIn from './CheckIn';
import Schedule from './Schedule';
import ActivityHistory from './ActivityHistory';
import SwapShift from './SwapShift';
import NewsFeed from './NewsFeed';
import Training from './Training';
import SoldOut from './SoldOut';
import Roster from './Roster';
import Checklist from './Checklist';
import Handover from './Handover';
import Feedback from './Feedback';
import Admin from './Admin';
import Advance from './Advance';
import Discipline from './Discipline';
import Payroll from './Payroll';
import Reward from './Reward';
import Timesheet from './Timesheet';

// ============================================
// Định nghĩa cấu trúc Sidebar theo 5 Nhóm
// ============================================
type TabId = ReturnType<typeof useAppStore.getState>['currentTab'];

interface MenuItem {
  id: TabId;
  label: string;
  icon: any;
  showBadge?: boolean;
  adminOnly?: boolean;
  comingSoon?: boolean;
}

interface MenuGroup {
  id: string;
  label: string;
  icon: any;
  items: MenuItem[];
  adminOnly?: boolean;
}

export default function Dashboard() {
  const store = useAppStore();
  const { currentUser, isDark, currentTab, isScheduleRegistered } = store;
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['info']);
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';

  // ============================================
  // 5 Nhóm Menu theo MASTER BLUEPRINT
  // ============================================
  const menuGroups: MenuGroup[] = [
    {
      id: 'info',
      label: 'Thông tin',
      icon: LayoutDashboard,
      items: [
        { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
        { id: 'news', label: 'Bảng tin', icon: Newspaper },
        { id: 'soldout', label: 'Món hết', icon: UtensilsCrossed },
        { id: 'feedback', label: 'Góp ý', icon: MessageSquareWarning },
        { id: 'training', label: 'Đào tạo', icon: GraduationCap },
      ],
    },
    {
      id: 'ops',
      label: 'Vận hành',
      icon: Camera,
      items: [
        { id: 'checkin', label: 'Chấm công', icon: Camera },
        { id: 'checklist', label: 'Checklist', icon: ClipboardCheck },
        { id: 'handover', label: 'Bàn giao ca', icon: Repeat },
      ],
    },
    {
      id: 'schedule',
      label: 'Lịch làm',
      icon: Calendar,
      items: [
        { id: 'schedule', label: isAdmin ? 'Sắp xếp ca' : 'Đăng ký ca', icon: Calendar },
        { id: 'swap', label: 'Chợ đổi ca', icon: ArrowLeftRight },
        { id: 'roster', label: 'Lịch tổng', icon: CalendarDays },
      ],
    },
    {
      id: 'payroll',
      label: 'Công lương',
      icon: Banknote,
      items: [
        { id: 'history', label: 'Lịch sử chấm công', icon: History },
        { id: 'timesheet', label: 'Tổng hợp công', icon: CalendarClock },
        { id: 'advance', label: 'Ứng lương', icon: BadgeDollarSign },
        { id: 'payroll', label: 'Bảng lương', icon: Banknote },
        { id: 'discipline', label: 'Kỷ luật - Nhắc nhở', icon: ShieldAlert },
        { id: 'reward', label: 'Đãi ngộ & Vinh danh', icon: Award, showBadge: true },
      ],
    },
    {
      id: 'settings',
      label: 'Cấu hình hệ thống',
      icon: Settings,
      adminOnly: true,
      items: [
        { id: 'admin', label: 'Quản trị', icon: ShieldAlert, adminOnly: true },
      ],
    },
  ];

  const handleLogout = () => {
    store.logout();
    document.documentElement.classList.remove('dark');
  };

  const handleTabChange = (tab: TabId) => {
    store.setCurrentTab(tab);
    setSidebarOpen(false);

    // Fetch data when switching to history or admin
    if (tab === 'history' || tab === 'admin' || tab === 'dashboard') {
      const weekInfo = computeWeekInfo();
      callApi('GET_DATA', {
        username: currentUser!.username,
        fullname: currentUser!.fullname,
        role: currentUser!.role,
        monthSheet: weekInfo.monthSheet,
        weekLabel: weekInfo.weekLabel,
      }, { background: true }).then((res) => {
        if (res?.ok) {
          store.setLogs(res.data.logs || []);
          store.setStats(res.data.stats || { totalCheckIn: 0, validCount: 0 });
          store.setUsers(res.data.users || []);
          if (res.data.keys) store.setGroqKeys(res.data.keys);
          store.setScheduleRegistered(res.data.isScheduleRegistered ?? false);
          if (res.data.approvedShifts) store.setApprovedShifts(res.data.approvedShifts);
          localStorage.setItem('kg_logs', JSON.stringify(res.data.logs || []));
          localStorage.setItem('kg_stats', JSON.stringify(res.data.stats));
        }
      });
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((g) => g !== groupId)
        : [...prev, groupId]
    );
  };

  // Tìm nhóm chứa tab hiện tại để tự động mở
  const findGroupForTab = (tabId: TabId): string | null => {
    for (const group of menuGroups) {
      if (group.items.some((item) => item.id === tabId)) return group.id;
    }
    return null;
  };

  // Khi sidebar mở, tự expand nhóm chứa tab hiện tại
  const handleOpenSidebar = () => {
    const activeGroup = findGroupForTab(currentTab);
    if (activeGroup && !expandedGroups.includes(activeGroup)) {
      setExpandedGroups((prev) => [...prev, activeGroup]);
    }
    setSidebarOpen(true);
  };

  // Kiểm tra nhóm có chứa badge không
  const groupHasBadge = (group: MenuGroup): boolean => {
    return group.items.some((item) => item.showBadge && !item.comingSoon);
  };

  // Placeholder cho các trang chưa phát triển
  const ComingSoonPage = ({ title }: { title: string }) => (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-ocean-100 to-purple-100 dark:from-ocean-900/40 dark:to-purple-900/40 flex items-center justify-center mb-5 shadow-lg">
        <Briefcase size={32} className="text-ocean-500" />
      </div>
      <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">{title}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
        Tính năng này đang được phát triển và sẽ sớm ra mắt trong các bản cập nhật tiếp theo.
      </p>
      <div className="mt-6 px-5 py-2.5 rounded-full bg-gradient-to-r from-ocean-500 to-purple-500 text-white text-xs font-bold tracking-wide shadow-md">
        COMING SOON
      </div>
    </div>
  );

  // Trang Tổng Quan (Dashboard Overview)
  const DashboardOverview = () => {
    const { stats, logs } = store;
    const recentLogs = logs.slice(0, 3);
    return (
      <div className="p-4 space-y-4">
        {/* Welcome banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-ocean-600 via-blue-600 to-purple-700 p-5 text-white shadow-xl">
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10 blur-sm" />
          <div className="absolute -left-4 -bottom-4 w-20 h-20 rounded-full bg-white/5" />
          <div className="relative z-10">
            <p className="text-sm text-white/70 font-medium">Xin chào 👋</p>
            <h2 className="text-xl font-bold mt-1 tracking-tight">{currentUser?.fullname || 'Nhân viên'}</h2>
            <p className="text-xs text-white/60 mt-1">{store.shiftName} • {store.currentTime}</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Camera size={16} className="text-green-600" />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Vào ca</span>
            </div>
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.totalCheckIn}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <ClipboardCheck size={16} className="text-blue-600" />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Hợp lệ</span>
            </div>
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{stats.validCount}</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Thao tác nhanh</h3>
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: Camera, label: 'Chấm công', tab: 'checkin' as TabId, color: 'from-green-500 to-emerald-600' },
              { icon: CheckSquare, label: 'Checklist', tab: 'checklist' as TabId, color: 'from-blue-500 to-indigo-600' },
              { icon: Newspaper, label: 'Bảng tin', tab: 'news' as TabId, color: 'from-purple-500 to-pink-600' },
              { icon: UtensilsCrossed, label: 'Món hết', tab: 'soldout' as TabId, color: 'from-amber-500 to-orange-600' },
            ].map((action) => (
              <button key={action.tab} onClick={() => handleTabChange(action.tab)}
                className="flex flex-col items-center space-y-1.5 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all active:scale-95">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center shadow-md`}>
                  <action.icon size={18} className="text-white" />
                </div>
                <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        {recentLogs.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Hoạt động gần đây</h3>
              <button onClick={() => handleTabChange('history')} className="text-xs text-ocean-500 font-medium">Xem tất cả →</button>
            </div>
            <div className="space-y-2.5">
              {recentLogs.map((log, i) => (
                <div key={i} className="flex items-center space-x-3 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/40">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm ${log.type === 'Vào ca' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {log.type === 'Vào ca' ? '→' : '←'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{log.type}</p>
                    <p className="text-[10px] text-gray-400 truncate">{log.time}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${log.status?.includes('Hợp lệ') ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    {log.status?.includes('Hợp lệ') ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Lấy tên trang hiện tại cho Coming Soon
  const getPageTitle = (tabId: TabId): string => {
    for (const group of menuGroups) {
      const item = group.items.find((i) => i.id === tabId);
      if (item) return item.label;
    }
    return '';
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white dark:bg-gray-900 shadow-2xl relative overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-md text-ocean-800 dark:text-white p-4 flex justify-between items-center shadow-sm sticky top-0 z-40 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center space-x-3">
          <button onClick={handleOpenSidebar} className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center justify-center text-gray-700 dark:text-gray-200 touch-manipulation">
            <Menu size={20} />
          </button>
          <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 items-center justify-center shadow-md overflow-hidden border border-gray-200 dark:border-gray-700 min-h-[44px] min-w-[44px] hidden sm:flex">
            <img src="/android-chrome-192x192.png?v=3" alt="Logo" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight">King's Grill</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{currentUser?.fullname || 'Staff'}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => store.toggleDarkMode()} className="w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center justify-center text-gray-600 dark:text-gray-300 touch-manipulation relative">
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button onClick={handleLogout} className="w-11 h-11 rounded-full bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 transition flex items-center justify-center touch-manipulation">
            <Power size={18} />
          </button>
        </div>
      </header>

      {/* ============================================ */}
      {/* Sidebar Drawer - 5 Nhóm Accordion           */}
      {/* ============================================ */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute top-0 left-0 bottom-0 w-[82%] max-w-[300px] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col border-r border-gray-100 dark:border-gray-800"
            >
              {/* Sidebar Header */}
              <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gradient-to-br from-ocean-50 to-white dark:from-gray-800 dark:to-gray-900">
                <div className="flex items-center space-x-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-ocean-500 to-purple-600 text-white flex items-center justify-center font-bold text-lg shadow-lg">
                    {currentUser?.fullname.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white leading-tight text-sm">{currentUser?.fullname.split(' ').pop()}</h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                      {currentUser?.role === 'admin' ? '🛡️ Quản lý' : currentUser?.role === 'tester' ? '🧪 Tester' : '👤 Nhân viên'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* Sidebar Menu Groups */}
              <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1 hide-scrollbar">
                {menuGroups.map((group) => {
                  // Ẩn nhóm admin-only nếu không phải admin
                  if (group.adminOnly && !isAdmin) return null;

                  const isExpanded = expandedGroups.includes(group.id);
                  const GroupIcon = group.icon;
                  const hasBadge = groupHasBadge(group);
                  const hasActiveItem = group.items.some((item) => item.id === currentTab);

                  return (
                    <div key={group.id} className="mb-0.5">
                      {/* Group Header */}
                      <button
                        onClick={() => toggleGroup(group.id)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all ${
                          hasActiveItem
                            ? 'bg-ocean-50/80 dark:bg-ocean-900/20 text-ocean-700 dark:text-ocean-400'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <GroupIcon size={16} className={hasActiveItem ? 'text-ocean-500' : 'text-gray-400 dark:text-gray-500'} />
                          <span className="text-[13px] font-bold">{group.label}</span>
                          {hasBadge && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
                        </div>
                        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                          <ChevronDown size={14} className="text-gray-400" />
                        </motion.div>
                      </button>

                      {/* Group Items (Accordion) */}
                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div className="pl-4 pr-1 py-1 space-y-0.5">
                              {group.items.map((item) => {
                                if (item.adminOnly && !isAdmin) return null;
                                const Icon = item.icon;
                                const isActive = currentTab === item.id;

                                return (
                                  <button
                                    key={item.id}
                                    onClick={() => !item.comingSoon && handleTabChange(item.id)}
                                    className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl transition-all relative ${
                                      item.comingSoon
                                        ? 'text-gray-400 dark:text-gray-600 cursor-default'
                                        : isActive
                                        ? 'bg-ocean-100/80 dark:bg-ocean-900/30 text-ocean-700 dark:text-ocean-400 shadow-sm'
                                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                                    }`}
                                  >
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                      item.comingSoon
                                        ? 'bg-gray-100 dark:bg-gray-800'
                                        : isActive
                                        ? 'bg-ocean-500 shadow-md'
                                        : 'bg-gray-100 dark:bg-gray-800'
                                    }`}>
                                      <Icon size={14} className={
                                        item.comingSoon
                                          ? 'text-gray-400 dark:text-gray-600'
                                          : isActive
                                          ? 'text-white'
                                          : 'text-gray-500 dark:text-gray-400'
                                      } />
                                    </div>
                                    <span className="text-xs font-semibold flex-1 text-left">{item.label}</span>
                                    {item.comingSoon && (
                                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 uppercase tracking-wide">Soon</span>
                                    )}
                                    {item.showBadge && !item.comingSoon && (
                                      <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* Sidebar Footer */}
              <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center font-medium">
                  King's Grill HR • Phase 6
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ============================================ */}
      {/* Content Area                                 */}
      {/* ============================================ */}
      <div className="flex-1 pb-6 overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {currentTab === 'dashboard' && <DashboardOverview />}
            {currentTab === 'checkin' && <CheckIn />}
            {currentTab === 'schedule' && <Schedule />}
            {currentTab === 'swap' && <SwapShift />}
            {currentTab === 'roster' && <Roster />}
            {currentTab === 'profile' && <Profile />}
            {currentTab === 'checklist' && <Checklist />}
            {currentTab === 'handover' && <Handover />}
            {currentTab === 'feedback' && <Feedback />}
            {currentTab === 'news' && <NewsFeed />}
            {currentTab === 'soldout' && <SoldOut />}
            {currentTab === 'training' && <Training />}
            {currentTab === 'advance' && <Advance />}
            {currentTab === 'discipline' && <Discipline />}
            {currentTab === 'payroll' && <Payroll />}
            {currentTab === 'reward' && <Reward />}
            {currentTab === 'timesheet' && <Timesheet />}
            {currentTab === 'history' && <ActivityHistory />}
            {currentTab === 'admin' && <Admin />}
            {/* Coming Soon Pages */}
            {false && (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <ComingSoonPage title={getPageTitle(currentTab)} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
