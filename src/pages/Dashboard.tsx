import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { computeWeekInfo } from '../utils/helpers';
import { Sun, Moon, Power, Camera, Calendar, Clock3, ShieldAlert, ArrowLeftRight, Newspaper, GraduationCap, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CheckIn from './CheckIn';
import Schedule from './Schedule';
import ActivityHistory from './ActivityHistory';
import SwapShift from './SwapShift';
import NewsFeed from './NewsFeed';
import Training from './Training';
import Admin from './Admin';

export default function Dashboard() {
  const store = useAppStore();
  const { currentUser, isDark, currentTab, isScheduleRegistered } = store;
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    // Stop camera stream if any - cleanup is handled in CheckIn unmount
    store.logout();
    document.documentElement.classList.remove('dark');
  };

  const handleTabChange = (tab: typeof currentTab) => {
    store.setCurrentTab(tab);
    setSidebarOpen(false);

    // Fetch data when switching to history or admin (matches original behavior)
    if (tab === 'history' || tab === 'admin') {
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

  const tabs = [
    { id: 'checkin' as const, label: 'Chấm công', icon: Camera },
    { id: 'schedule' as const, label: 'Đăng ký', icon: Calendar, showBadge: !isScheduleRegistered },
    { id: 'swap' as const, label: 'Đổi ca', icon: ArrowLeftRight, showBadge: store.hasNewSwaps },
    { id: 'news' as const, label: 'Bảng tin', icon: Newspaper },
    { id: 'training' as const, label: 'Đào tạo', icon: GraduationCap },
    { id: 'history' as const, label: 'Lịch sử', icon: Clock3 },
    { id: 'admin' as const, label: 'Admin', icon: ShieldAlert },
  ];

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white dark:bg-gray-900 shadow-2xl relative overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-md text-ocean-800 dark:text-white p-4 flex justify-between items-center shadow-sm sticky top-0 z-40 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center space-x-3">
          <button onClick={() => setSidebarOpen(true)} className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center justify-center text-gray-700 dark:text-gray-200 touch-manipulation">
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

      {/* Sidebar Overlay & Panel */}
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
              className="absolute top-0 left-0 bottom-0 w-3/4 max-w-[280px] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col border-r border-gray-100 dark:border-gray-800"
            >
              <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gradient-to-br from-ocean-50 to-white dark:from-gray-800 dark:to-gray-900">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-full bg-ocean-100 dark:bg-ocean-900 text-ocean-600 flex items-center justify-center font-bold text-xl shadow-inner border border-ocean-200 dark:border-ocean-800">
                    {currentUser?.fullname.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 dark:text-white leading-tight">{currentUser?.fullname.split(' ').pop()}</h3>
                    <p className="text-xs text-gray-500">{currentUser?.role === 'admin' ? 'Quản lý' : 'Nhân viên'}</p>
                  </div>
                </div>
                <button onClick={() => setSidebarOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 hide-scrollbar">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = currentTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                      className={`w-full flex items-center space-x-3 px-4 py-3.5 rounded-xl font-bold transition-all relative ${isActive ? 'bg-ocean-50 dark:bg-ocean-900/30 text-ocean-600 dark:text-ocean-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                      <Icon size={18} className={isActive ? 'text-ocean-600 dark:text-ocean-400' : 'text-gray-400 dark:text-gray-500'} />
                      <span className="text-sm">{tab.label}</span>
                      {tab.showBadge && <span className="absolute right-4 w-2 h-2 bg-red-500 rounded-full animate-ping" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 pb-20 overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {currentTab === 'checkin' && <CheckIn />}
            {currentTab === 'schedule' && <Schedule />}
            {currentTab === 'swap' && <SwapShift />}
            {currentTab === 'news' && <NewsFeed />}
            {currentTab === 'training' && <Training />}
            {currentTab === 'history' && <ActivityHistory />}
            {currentTab === 'admin' && <Admin />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
