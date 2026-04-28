import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { computeWeekInfo } from '../utils/helpers';
import { Sun, Moon, Power, Camera, Calendar, Clock3, ShieldAlert } from 'lucide-react';
import CheckIn from './CheckIn';
import Schedule from './Schedule';
import ActivityHistory from './ActivityHistory';
import Admin from './Admin';

export default function Dashboard() {
  const store = useAppStore();
  const { currentUser, isDark, currentTab, isScheduleRegistered } = store;

  const handleLogout = () => {
    // Stop camera stream if any - cleanup is handled in CheckIn unmount
    store.logout();
    document.documentElement.classList.remove('dark');
  };

  const handleTabChange = (tab: typeof currentTab) => {
    store.setCurrentTab(tab);

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
    { id: 'schedule' as const, label: 'Đăng ký ca', icon: Calendar, showBadge: !isScheduleRegistered },
    { id: 'history' as const, label: 'Lịch sử', icon: Clock3 },
    { id: 'admin' as const, label: 'Admin', icon: ShieldAlert },
  ];

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white dark:bg-gray-900 shadow-2xl relative overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-md text-ocean-800 dark:text-white p-4 flex justify-between items-center shadow-sm sticky top-0 z-40 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-md overflow-hidden border border-gray-200 dark:border-gray-700 min-h-[44px] min-w-[44px]">
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

      {/* Tab Menu */}
      <div className="px-3 pt-2 bg-white dark:bg-gray-900 sticky top-[76px] z-30">
        <div className="grid grid-cols-4 gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                className={`py-2.5 rounded-lg text-xs font-bold transition-all text-center touch-manipulation flex flex-col items-center justify-center min-h-[50px] relative ${isActive ? 'bg-white dark:bg-gray-700 text-ocean-600 dark:text-white shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                <Icon size={14} className="mb-1" />
                {tab.label}
                {tab.showBadge && <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full animate-ping" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 pb-20">
        {currentTab === 'checkin' && <CheckIn />}
        {currentTab === 'schedule' && <Schedule />}
        {currentTab === 'history' && <ActivityHistory />}
        {currentTab === 'admin' && <Admin />}
      </div>
    </div>
  );
}
