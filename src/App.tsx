import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { callApi } from './services/api';
import { isInAppBrowser, computeWeekInfo, getCurrentTimeString } from './utils/helpers';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LoadingScreen from './components/LoadingScreen';
import ZaloWarning from './components/ZaloWarning';
import ImagePreview from './components/ImagePreview';
import AIAssistant from './components/AIAssistant';

export default function App() {
  const store = useAppStore();
  const { currentUser } = store;

  // Init on mount - matches original initApp()
  useEffect(() => {
    // Auto dark mode based on time of day
    const hour = new Date().getHours();
    const isNight = hour < 6 || hour >= 17;
    store.setDark(isNight);
    store.setShiftName(isNight ? 'Ca Tối' : 'Ca Sáng');

    // Clock - updates every second, also checks for shift change
    const timer = setInterval(() => {
      store.setCurrentTime(getCurrentTimeString());
      const currentHour = new Date().getHours();
      const newShift = (currentHour >= 6 && currentHour < 17) ? 'Ca Sáng' : 'Ca Tối';
      const currentShift = useAppStore.getState().shiftName;
      if (currentShift !== newShift) {
        store.setShiftName(newShift);
        store.setDark(newShift === 'Ca Tối');
      }
    }, 1000);

    // Restore saved user session (with 30-minute expiry)
    const savedUser = localStorage.getItem('kg_user');
    const sessionTime = localStorage.getItem('kg_session_time');
    if (savedUser) {
      try {
        // Check if session has expired
        const isRemembered = localStorage.getItem('kg_remember') === 'true';
        const SESSION_DURATION = isRemembered ? (30 * 24 * 60 * 60 * 1000) : (30 * 60 * 1000); // 30 days or 30 minutes
        if (sessionTime && (Date.now() - parseInt(sessionTime)) > SESSION_DURATION) {
          // Session expired - clear everything
          localStorage.removeItem('kg_user');
          localStorage.removeItem('kg_session_time');
          localStorage.removeItem('kg_logs');
          localStorage.removeItem('kg_stats');
          localStorage.removeItem('kg_last_checkin');
        } else {
          const user = JSON.parse(savedUser);
          store.setCurrentUser(user);

          // Restore cached data instantly
          const cachedLogs = localStorage.getItem('kg_logs');
          const cachedStats = localStorage.getItem('kg_stats');
          const lastCheckIn = localStorage.getItem('kg_last_checkin');
          if (cachedLogs) store.setLogs(JSON.parse(cachedLogs));
          if (cachedStats) store.setStats(JSON.parse(cachedStats));
          if (lastCheckIn) store.setLastCheckInTime(parseInt(lastCheckIn));

          // Init week schedule
          const weekInfo = computeWeekInfo();
          const initShifts: Record<string, string> = {};
          weekInfo.weekDatesKeys.forEach((k) => (initShifts[k] = 'OFF'));
          store.setShiftData(initShifts);

          // Restore registered shifts from localStorage
          const savedWeek = localStorage.getItem('kg_registered_week');
          const savedShiftsStr = localStorage.getItem('kg_registered_shifts');
          const expectedWeekKey = weekInfo.monthSheet + '|' + weekInfo.weekLabel;
          if ((savedWeek === expectedWeekKey || savedWeek === weekInfo.sheetName) && savedShiftsStr) {
            try {
              const shifts = JSON.parse(savedShiftsStr);
              if (Array.isArray(shifts) && shifts.length === 7) {
                store.setRegisteredShifts(shifts);
                const regShifts: Record<string, string> = {};
                weekInfo.weekDatesKeys.forEach((k, i) => regShifts[k] = shifts[i]);
                store.setShiftData(regShifts);
              }
            } catch { /* ignore parse errors */ }
          }

          // Refresh session timestamp (extend session on reload)
          localStorage.setItem('kg_session_time', Date.now().toString());

          // Fetch fresh data in background
          callApi('GET_DATA', {
            username: user.username,
            fullname: user.fullname,
            role: user.role,
            monthSheet: weekInfo.monthSheet,
            weekLabel: weekInfo.weekLabel,
          }, { background: true }).then((res) => {
            if (res?.ok) {
              store.setLogs(res.data.logs || []);
              store.setStats(res.data.stats || { totalCheckIn: 0, validCount: 0 });
              store.setUsers(res.data.users || []);
              if (res.data.keys) store.setGroqKeys(res.data.keys);
              if (res.data.chatHistory) store.setChatHistory(res.data.chatHistory);
              if (res.data.aiPrompts) store.setAiPrompts(res.data.aiPrompts);
              if (res.data.isScheduleRegistered !== undefined)
                store.setScheduleRegistered(res.data.isScheduleRegistered);
              if (res.data.approvedShifts) store.setApprovedShifts(res.data.approvedShifts);
              if (res.data.gpsConfig) store.setServerGpsConfig(res.data.gpsConfig);
              if (res.data.orgConfig) store.setServerOrgConfig(res.data.orgConfig);
              if (res.data.payrollConfig) store.setServerPayrollConfig(res.data.payrollConfig);
              localStorage.setItem('kg_logs', JSON.stringify(res.data.logs || []));
              localStorage.setItem('kg_stats', JSON.stringify(res.data.stats));
            }
          });
        }
      } catch {
        localStorage.removeItem('kg_user');
        localStorage.removeItem('kg_session_time');
      }
    }

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 transition-colors duration-300 min-h-screen">
      {/* Zalo/Facebook in-app browser warning */}
      {isInAppBrowser() && <ZaloWarning />}

      {/* Global Loading Modal */}
      <LoadingScreen />

      {/* Image Preview Modal */}
      <ImagePreview />

      {/* AI Chatbot Assistant */}
      <AIAssistant />

      {/* Main App */}
      {currentUser ? <Dashboard /> : <Login />}
    </div>
  );
}
