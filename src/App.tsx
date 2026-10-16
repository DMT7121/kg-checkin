import { lazy, Suspense, useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import {
  isInAppBrowser,
  computeWeekInfo,
  getCurrentTimeString,
  getSavedRegisteredShiftsForWeek,
  isNextWeekScheduleRegistered,
  markScheduleRegisteredLocally,
} from './utils/helpers';
import { setupAudioUnlock, preloadAudioClips } from './utils/soundEffects';
import { refreshAppData, restoreFromCache } from './utils/refreshData';
import { initOfflineQueueSync } from './utils/offlineQueue';
import LoadingScreen from './components/LoadingScreen';
import ZaloWarning from './components/ZaloWarning';
import ImagePreview from './components/ImagePreview';
import AppErrorBoundary from './components/AppErrorBoundary';
import type { TabId } from './types/navigation';

const AIAssistant = lazy(() => import('./components/AIAssistant'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));

export default function App() {
  const currentUser = useAppStore((s) => s.currentUser);

  // Init on mount - matches original initApp()
  useEffect(() => {
    const store = useAppStore.getState();

    // Hybrid Smart Audio: Unlock Web Audio on first gesture and preload core notification audio
    setupAudioUnlock();
    preloadAudioClips([
      'checkin_in',
      'checkin_out',
      'outside_range',
      'gps_valid',
      'gps_invalid',
      'expired_photo',
      'login_success'
    ]);

    // Validate stored GAS URL configuration (preserve valid custom GAS Web App URLs)
    const storedGas = localStorage.getItem('kg_gas_url');
    if (storedGas && !storedGas.trim().startsWith('https://script.google.com/macros/s/')) {
      localStorage.removeItem('kg_gas_url');
    }

    // Respect the user's saved theme. Only use time/system preference on first visit.
    const hour = new Date().getHours();
    const isNight = hour < 6 || hour >= 17;
    const savedTheme = localStorage.getItem('kg_theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    store.setDark(savedTheme ? savedTheme === 'dark' : (isNight || prefersDark));
    store.setShiftName(isNight ? 'Ca Tối' : 'Ca Sáng');

    // Clock - checks every 15 seconds (display shows HH:MM only), only updates store when minute or shift changes
    const initialTime = getCurrentTimeString();
    if (useAppStore.getState().currentTime !== initialTime) {
      store.setCurrentTime(initialTime);
    }
    const timer = setInterval(() => {
      const state = useAppStore.getState();
      const newTime = getCurrentTimeString();
      if (state.currentTime !== newTime) {
        state.setCurrentTime(newTime);
      }
      const currentHour = new Date().getHours();
      const newShift = (currentHour >= 6 && currentHour < 17) ? 'Ca Sáng' : 'Ca Tối';
      if (state.shiftName !== newShift) {
        state.setShiftName(newShift);
      }
    }, 15000);

    // Restore saved user session (with 30-minute expiry)
    const savedUser = localStorage.getItem('kg_user');
    const sessionTime = localStorage.getItem('kg_session_time');
    if (savedUser) {
      try {
        // Check if session has expired (remember by default)
        const isRemembered = localStorage.getItem('kg_remember') !== 'false';
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

          // Phase A+B: Restore ALL cached data instantly (SWR pattern)
          restoreFromCache();

          // Support deep-linking via ?tab=... query param
          const urlParams = new URLSearchParams(window.location.search);
          const tabParam = urlParams.get('tab') as TabId | null;
          if (tabParam) {
            store.setCurrentTab(tabParam);
          }

          // Init week schedule
          const weekInfo = computeWeekInfo();
          const initShifts: Record<string, string> = {};
          weekInfo.weekDatesKeys.forEach((k) => (initShifts[k] = 'OFF'));
          store.setShiftData(initShifts);

          // Restore registered shifts from localStorage (including per-user record)
          const expectedWeekKey = weekInfo.monthSheet + '|' + weekInfo.weekLabel;
          const savedShifts = getSavedRegisteredShiftsForWeek(user?.username, weekInfo);
          const isRegisteredForWeek = isNextWeekScheduleRegistered(
            useAppStore.getState().isScheduleRegistered,
            user?.username,
            weekInfo,
            savedShifts
          );
          if (isRegisteredForWeek) {
            store.setScheduleRegistered(true, expectedWeekKey);
            if (savedShifts && savedShifts.length === 7) {
              store.setRegisteredShifts(savedShifts);
              const regShifts: Record<string, string> = {};
              weekInfo.weekDatesKeys.forEach((k, i) => (regShifts[k] = savedShifts[i]));
              store.setShiftData(regShifts);
            }
            markScheduleRegisteredLocally(user?.username, expectedWeekKey, savedShifts);
          } else {
            const savedWeek = localStorage.getItem('kg_registered_week');
            if (savedWeek && savedWeek !== expectedWeekKey && savedWeek !== weekInfo.sheetName) {
              // Week rollover: clear previous week registration
              localStorage.removeItem('kg_registered_shifts');
              localStorage.removeItem('kg_registered_week');
              localStorage.removeItem('kg_schedule_registered');
              store.setScheduleRegistered(false);
              store.setRegisteredShifts([]);
            }
          }

          // Refresh session timestamp (extend session on reload)
          localStorage.setItem('kg_session_time', Date.now().toString());

          // Fetch fresh data in background (Phase 7: centralized)
          refreshAppData();
        }
      } catch {
        localStorage.removeItem('kg_user');
        localStorage.removeItem('kg_session_time');
      }
    }

    // Offline Queue & Resilient Sync init
    const cleanupQueue = initOfflineQueueSync();

    // Phase 7: Background refresh every 5 minutes (stale check inside)
    const refreshInterval = setInterval(() => refreshAppData(), 5 * 60 * 1000);

    return () => {
      clearInterval(timer);
      clearInterval(refreshInterval);
      cleanupQueue();
    };
  }, []);

  return (
    <div className="soft3d-bg text-gray-800 dark:text-gray-100 transition-colors duration-300 min-h-screen">
      {/* Zalo/Facebook in-app browser warning */}
      {isInAppBrowser() && <ZaloWarning />}

      {/* Global Loading Modal */}
      <LoadingScreen />

      {/* Image Preview Modal */}
      <ImagePreview />

      {/* AI Chatbot Assistant - loaded only after login */}
      {currentUser && (
        <Suspense fallback={null}>
          <AIAssistant />
        </Suspense>
      )}

      {/* Main App */}
      <AppErrorBoundary
        resetKey={currentUser?.username || 'guest'}
        fallback={({ reset }) => (
          <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 text-center max-w-sm w-full">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl font-bold">
                ⚠️
              </div>
              <h3 className="text-base font-bold text-slate-800 dark:text-white mb-2">Đang phục hồi giao diện</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
                Hệ thống đang làm mới kết nối. Nếu màn hình không tự tải lại sau vài giây, bạn vui lòng nhấn nút bên dưới.
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => reset()}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-sm"
                >
                  Thử lại
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700"
                >
                  Tải lại trang
                </button>
              </div>
            </div>
          </div>
        )}
      >
        {currentUser ? (
          <Suspense fallback={
            <div className="min-h-screen bg-[var(--kg-bg)] p-5 md:p-8">
              <div className="mx-auto max-w-7xl space-y-4 animate-pulse">
                <div className="h-16 rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)]" />
                <div className="h-48 rounded-3xl bg-[var(--kg-surface)] border border-[var(--kg-border)]" />
              </div>
            </div>
          }>
            <Dashboard />
          </Suspense>
        ) : (
          <Suspense fallback={<div className="min-h-screen bg-[var(--kg-bg)]" />}>
            <Login />
          </Suspense>
        )}
      </AppErrorBoundary>
    </div>
  );
}
