import { lazy, Suspense, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
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
import { callApi, PRIMARY_EDGE_API_URL } from './services/api';
import { setCachedFaceProfiles } from './utils/faceProfileCache';
import { isAdminUser } from './utils/permissions';
import LoadingScreen from './components/LoadingScreen';
import AppErrorBoundary from './components/AppErrorBoundary';
import KgFeedbackHost from './components/KgFeedbackHost';
import type { TabId } from './types/navigation';

const AIAssistant = lazy(() => import('./components/AIAssistant'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const ZaloWarning = lazy(() => import('./components/ZaloWarning'));
const ImagePreview = lazy(() => import('./components/ImagePreview'));
const VersionReleaseModal = lazy(() => import('./components/VersionReleaseModal'));

export default function App() {
  const currentUser = useAppStore((s) => s.currentUser);
  const isPreviewOpen = useAppStore((s) => s.isPreviewOpen);

  // Init on mount - matches original initApp()
  useEffect(() => {
    const store = useAppStore.getState();

    // Hybrid Smart Audio: Unlock Web Audio on first gesture; defer MP3 preloading past initial 4G paint
    setupAudioUnlock();
    const navConn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const isConstrainedNetwork = Boolean(navConn?.saveData || /^(slow-)?2g$/i.test(navConn?.effectiveType || ''));
    if (!isConstrainedNetwork) {
      window.setTimeout(() => {
        preloadAudioClips([
          'checkin_in',
          'checkin_out',
          'outside_range',
          'gps_valid',
          'gps_invalid',
          'expired_photo',
          'login_success',
        ]);
      }, 1500);
    }

    // Preload lightweight 5KB D1 face profiles in background without pulling WASM on Login / Desktop Admin boot
    window.setTimeout(() => {
      void callApi(
        'GET_FACE_PROFILES',
        { isKiosk: true, preloadOnly: true, fastEdge: true },
        { background: true, cacheTtlMs: 0, timeoutMs: 8000 }
      ).then((res) => {
        if (res?.ok && Array.isArray(res.data?.profiles)) {
          setCachedFaceProfiles(res.data.profiles);
        }
      }).catch(() => {});
    }, 250);

    // Migrate legacy direct GAS URLs in production so every device routes through Cloudflare Edge D1 (/api)
    const storedGas = localStorage.getItem('kg_gas_url');
    const isProdBuild = Boolean((import.meta as any).env?.PROD);
    if (
      storedGas &&
      ((isProdBuild && storedGas.trim() !== '/api' && storedGas.trim() !== PRIMARY_EDGE_API_URL) ||
        (!isProdBuild &&
          storedGas.trim() !== '/api' &&
          storedGas.trim() !== PRIMARY_EDGE_API_URL &&
          !/^https:\/\/script\.google\.com\/macros\//.test(storedGas.trim())))
    ) {
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

          // Restore registered shifts from localStorage ONLY when explicitly matching expectedWeekKey
          const expectedWeekKey = weekInfo.monthSheet + '|' + weekInfo.weekLabel;
          const savedShifts = getSavedRegisteredShiftsForWeek(user?.username, weekInfo);
          const currentState = useAppStore.getState();
          const isRegisteredForWeek = isNextWeekScheduleRegistered(
            currentState.isScheduleRegistered,
            user?.username,
            weekInfo,
            savedShifts,
            currentState.registeredWeekKey
          );
          if (isRegisteredForWeek) {
            if (savedShifts && savedShifts.length === 7) {
              store.setRegisteredShifts(savedShifts);
              const regShifts: Record<string, string> = {};
              weekInfo.weekDatesKeys.forEach((k, i) => (regShifts[k] = savedShifts[i]));
              store.setShiftData(regShifts);
            }
            store.setScheduleRegistered(true, expectedWeekKey);
            markScheduleRegisteredLocally(user?.username, expectedWeekKey, savedShifts);
          } else {
            // Week rollover or unregistered for target week: ensure stale week keys are cleared
            localStorage.removeItem('kg_registered_shifts');
            localStorage.removeItem('kg_registered_week');
            localStorage.removeItem('kg_schedule_registered');
            localStorage.removeItem('kg_mandatory_sched_snooze');
            store.setScheduleRegistered(false);
            store.setRegisteredShifts([]);
          }

          // Refresh session timestamp (extend session on reload)
          localStorage.setItem('kg_session_time', Date.now().toString());

          // Always force a fresh schedule/log sync on session boot so T5-T7 check-in gate has live server state
          refreshAppData(true);
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

  // Prewarm WASM biometric engine ONLY after login for non-constrained, non-desktop-only-admin sessions
  const currentUsername = currentUser?.username;
  const currentUserRole = currentUser?.role;
  useEffect(() => {
    if (!currentUsername) return;
    const navConn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const isConstrainedNetwork = Boolean(navConn?.saveData || /^(slow-)?2g$/i.test(navConn?.effectiveType || ''));
    const isDesktopAdminSession =
      isAdminUser({ role: currentUserRole } as any) && typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (isConstrainedNetwork || isDesktopAdminSession) return;

    const timerId = window.setTimeout(() => {
      void import('./services/faceRecognitionV2')
        .then(({ prewarmFaceRecognitionSystem }) => prewarmFaceRecognitionSystem(callApi))
        .catch(() => {});
    }, 600);
    return () => window.clearTimeout(timerId);
  }, [currentUsername, currentUserRole]);

  return (
    <div className="bg-[var(--kg-bg)] text-[var(--kg-text)] transition-colors duration-200 min-h-dvh">
      {/* Zalo/Facebook in-app browser warning */}
      {isInAppBrowser() && (
        <Suspense fallback={null}>
          <ZaloWarning />
        </Suspense>
      )}

      {/* Global Loading Modal */}
      <LoadingScreen />

      {/* Global Feedback Host (Toasts, Confirm/Alert Sheets, Loading Overlay) */}
      <KgFeedbackHost />

      {/* Image Preview Modal - lazy-loaded on demand */}
      {isPreviewOpen && (
        <Suspense fallback={null}>
          <ImagePreview />
        </Suspense>
      )}

      {/* v5.0 Release Center & What's New Modal */}
      <Suspense fallback={null}>
        <VersionReleaseModal />
      </Suspense>

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
          <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--kg-bg)] text-[var(--kg-text)]">
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-card p-6 text-center max-w-sm w-full">
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 text-[var(--kg-warning)] flex items-center justify-center font-bold">
                <AlertTriangle size={22} />
              </div>
              <h3 className="text-base font-bold text-[var(--kg-text)] mb-2">Đang phục hồi giao diện</h3>
              <p className="text-xs text-[var(--kg-text-muted)] mb-5 leading-relaxed">
                Hệ thống đang làm mới kết nối. Nếu màn hình không tự tải lại sau vài giây, bạn vui lòng nhấn nút bên dưới.
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => reset()}
                  className="min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white transition-colors duration-150 shadow-soft"
                >
                  Thử lại
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="min-h-[44px] sm:min-h-[38px] px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--kg-surface-soft)] hover:border-[var(--kg-border-strong)] text-[var(--kg-text)] transition-colors duration-150 border border-[var(--kg-border)]"
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
