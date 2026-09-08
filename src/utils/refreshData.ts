// ============================================
// Phase A+B: Centralized data refresh utility
// - Stale-While-Revalidate (SWR) pattern
// - Expanded localStorage cache
// - Mega-Fetch hydration (coins, notifications, training)
// ============================================
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { computeWeekInfo } from './helpers';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const APP_CACHE_KEY = 'kg_app_cache_v2';
let refreshInFlight: Promise<void> | null = null;
let cacheWriteHandle: number | ReturnType<typeof setTimeout> | null = null;
let cacheWriteIsIdle = false;

// === Phase B [2.1]: Expanded localStorage keys ===
const CACHE_KEYS = {
  logs: 'kg_logs',
  stats: 'kg_stats',
  users: 'kg_users',
  kingCoins: 'kg_coins_summary',
  notificationsUnread: 'kg_notif_unread',
  trainingProgress: 'kg_training_progress',
  gpsConfig: 'kg_gps_config',
  orgConfig: 'kg_org_config',
  approvedShifts: 'kg_approved_shifts',
  lastFetch: 'kg_last_fetch',
};

/**
 * Check if data is stale (older than 5 minutes)
 */
export function isDataStale(): boolean {
  const lastFetch = useAppStore.getState().lastFetchTime;
  return Date.now() - lastFetch > STALE_THRESHOLD_MS;
}

/**
 * Phase B [2.1]: Restore all cached data from localStorage instantly.
 * Called on app mount for instant UI render before API returns.
 */
export function restoreFromCache(): void {
  try {
    const appCache = localStorage.getItem(APP_CACHE_KEY);
    if (appCache) {
      const snapshot = JSON.parse(appCache);
      const data = snapshot?.data || {};
      useAppStore.setState((state) => ({
        logs: data.logs ?? state.logs,
        stats: data.stats ?? state.stats,
        users: data.users ?? state.users,
        isScheduleRegistered: (() => {
          const direct = localStorage.getItem('kg_schedule_registered');
          if (direct === 'true') return true;
          if (data.isScheduleRegistered !== undefined) return data.isScheduleRegistered;
          return state.isScheduleRegistered;
        })(),
        approvedShifts: data.approvedShifts ?? state.approvedShifts,
        registeredShifts: data.registeredShifts ?? state.registeredShifts,
        payrollData: data.payrollData ?? state.payrollData,
        timesheetData: data.timesheetData ?? state.timesheetData,
        monthSchedules: data.monthSchedules ?? state.monthSchedules,
        swapRequests: data.swapRequests ?? state.swapRequests,
        serverGpsConfig: data.gpsConfig ?? state.serverGpsConfig,
        serverOrgConfig: data.orgConfig ?? state.serverOrgConfig,
        serverPayrollConfig: data.payrollConfig ?? state.serverPayrollConfig,
        recentPosts: data.recentPosts ?? state.recentPosts,
        pendingFeedbackCount: data.pendingFeedbackCount ?? state.pendingFeedbackCount,
        todayChecklistDone: data.todayChecklistDone ?? state.todayChecklistDone,
        todayHandoverDone: data.todayHandoverDone ?? state.todayHandoverDone,
        lastCheckInTime: (() => {
          const direct = localStorage.getItem('kg_last_checkin');
          if (direct) return parseInt(direct, 10) || 0;
          return data.lastCheckInTime ?? state.lastCheckInTime;
        })(),
        lastFetchTime: snapshot.savedAt ?? state.lastFetchTime,
      }));
      return;
    }

    const store = useAppStore.getState();
    const cachedLogs = localStorage.getItem(CACHE_KEYS.logs);
    const cachedStats = localStorage.getItem(CACHE_KEYS.stats);
    const cachedUsers = localStorage.getItem(CACHE_KEYS.users);
    const cachedShifts = localStorage.getItem(CACHE_KEYS.approvedShifts);
    const lastCheckIn = localStorage.getItem('kg_last_checkin');

    if (cachedLogs) store.setLogs(JSON.parse(cachedLogs));
    if (cachedStats) store.setStats(JSON.parse(cachedStats));
    if (cachedUsers) store.setUsers(JSON.parse(cachedUsers));
    if (cachedShifts) store.setApprovedShifts(JSON.parse(cachedShifts));
    if (lastCheckIn) store.setLastCheckInTime(parseInt(lastCheckIn));

    // Restore last fetch time for stale check
    const lastFetch = localStorage.getItem(CACHE_KEYS.lastFetch);
    if (lastFetch) store.setLastFetchTime(parseInt(lastFetch));
  } catch (e) {
    console.warn('[Cache] Restore error:', e);
  }
}

/**
 * Phase B [2.1]: Persist all key data to localStorage.
 */
function persistToCache(data: any): void {
  const writeCache = () => {
    try {
      const currentState = useAppStore.getState();
      localStorage.setItem(APP_CACHE_KEY, JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        data: {
          logs: data.logs ?? currentState.logs,
          stats: data.stats ?? currentState.stats,
          users: data.users ?? currentState.users,
          isScheduleRegistered: data.isScheduleRegistered !== undefined ? data.isScheduleRegistered : currentState.isScheduleRegistered,
          approvedShifts: data.approvedShifts ?? currentState.approvedShifts,
          registeredShifts: data.registeredShifts ?? currentState.registeredShifts,
          payrollData: currentState.payrollData,
          timesheetData: currentState.timesheetData,
          monthSchedules: currentState.monthSchedules,
          swapRequests: currentState.swapRequests,
          gpsConfig: data.gpsConfig ?? currentState.serverGpsConfig,
          orgConfig: data.orgConfig ?? currentState.serverOrgConfig,
          payrollConfig: data.payrollConfig ?? currentState.serverPayrollConfig,
          recentPosts: data.recentPosts ?? currentState.recentPosts,
          pendingFeedbackCount: data.pendingFeedbackCount ?? currentState.pendingFeedbackCount,
          todayChecklistDone: data.todayChecklistDone ?? currentState.todayChecklistDone,
          todayHandoverDone: data.todayHandoverDone ?? currentState.todayHandoverDone,
          lastCheckInTime: currentState.lastCheckInTime,
        },
      }));
    } catch (e) {
      console.warn('[Cache] Persist error:', e);
    }
  };

  if (cacheWriteHandle !== null) {
    if (cacheWriteIsIdle && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(cacheWriteHandle as number);
    } else {
      clearTimeout(cacheWriteHandle);
    }
  }

  cacheWriteIsIdle = typeof window.requestIdleCallback === 'function';
  cacheWriteHandle = cacheWriteIsIdle
    ? window.requestIdleCallback(writeCache, { timeout: 1500 })
    : setTimeout(writeCache, 0);
}

/**
 * Dedicated helper to instantly update individual module cache
 */
export function saveModuleCache(key: 'payroll' | 'timesheet' | 'roster' | 'swap', value: any): void {
  try {
    const appCache = localStorage.getItem(APP_CACHE_KEY);
    const parsed = appCache ? JSON.parse(appCache) : { version: 2, data: {} };
    if (!parsed.data) parsed.data = {};
    if (key === 'payroll') parsed.data.payrollData = value;
    if (key === 'timesheet') parsed.data.timesheetData = value;
    if (key === 'roster') parsed.data.monthSchedules = value;
    if (key === 'swap') parsed.data.swapRequests = value;
    parsed.savedAt = Date.now();
    localStorage.setItem(APP_CACHE_KEY, JSON.stringify(parsed));
  } catch (e) {
    console.warn('[Cache] saveModuleCache error:', e);
  }
}

const prefetchingHubs = new Set<string>();

/**
 * Smart background pre-fetching for hub modules
 */
export function prefetchHubData(hubId: string): void {
  const store = useAppStore.getState();
  const { currentUser } = store;
  if (!currentUser || prefetchingHubs.has(hubId)) return;

  prefetchingHubs.add(hubId);

  const runPrefetch = async () => {
    try {
      if (hubId === 'attendance') {
        // Pre-fetch payroll if empty
        if (!store.payrollData || store.payrollData.length === 0) {
          const res = await callApi('GET_PAYROLL', { username: currentUser.username, role: currentUser.role }, { background: true });
          if (res?.ok && Array.isArray(res.data?.payroll)) {
            store.setPayrollData(res.data.payroll);
            saveModuleCache('payroll', res.data.payroll);
          }
        }
        // Pre-fetch timesheet if empty
        if (!store.timesheetData) {
          const res = await callApi('GET_TIMESHEET', { username: currentUser.username, role: currentUser.role }, { background: true });
          if (res?.ok && res.data) {
            store.setTimesheetData(res.data);
            saveModuleCache('timesheet', res.data);
          }
        }
      } else if (hubId === 'workforce') {
        // Pre-fetch month schedule (Roster) if empty
        if (!store.monthSchedules) {
          const now = new Date();
          const selectedMonth = now.getMonth() + 1;
          const selectedYear = now.getFullYear();
          const monthSheet = `Tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`;
          const weekInfo = computeWeekInfo(now, false);
          const requests = [{ monthSheet: weekInfo.monthSheet, weekLabel: weekInfo.weekLabel }];
          const res = await callApi('GET_MONTH_SCHEDULES', { monthSheet, requests }, { background: true });
          if (res?.ok && res.data?.weeks) {
            store.setMonthSchedules(res.data.weeks);
            saveModuleCache('roster', res.data.weeks);
          }
        }
        // Pre-fetch swap requests
        if (!store.swapRequests || store.swapRequests.length === 0) {
          const res = await callApi('GET_SWAP_REQUESTS', { username: currentUser.username, role: currentUser.role }, { background: true });
          if (res?.ok && Array.isArray(res.data)) {
            store.setSwapRequests(res.data);
            saveModuleCache('swap', res.data);
          }
        }
      }
    } catch (err) {
      console.warn('[Prefetch] hub data error:', err);
    }
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => runPrefetch(), { timeout: 2000 });
  } else {
    setTimeout(runPrefetch, 200);
  }
}

/**
 * Hydrate store from API response.
 * Handles both legacy and mega-fetch fields.
 */
function hydrateStore(data: any): void {
  useAppStore.setState((state) => ({
    logs: data.logs ?? state.logs,
    stats: data.stats ?? state.stats,
    users: data.users ?? state.users,
    groqKeys: data.keys ?? state.groqKeys,
    chatHistory: data.chatHistory ?? state.chatHistory,
    aiPrompts: data.aiPrompts ?? state.aiPrompts,
    isScheduleRegistered: (() => {
      if (data.isScheduleRegistered === true) return true;
      const hasLocalReg = localStorage.getItem('kg_schedule_registered') === 'true' || !!localStorage.getItem('kg_registered_shifts');
      if (hasLocalReg || state.isScheduleRegistered) return true;
      return data.isScheduleRegistered ?? state.isScheduleRegistered;
    })(),
    approvedShifts: data.approvedShifts ?? state.approvedShifts,
    registeredShifts: data.registeredShifts ?? state.registeredShifts,
    serverGpsConfig: data.gpsConfig ?? state.serverGpsConfig,
    serverOrgConfig: data.orgConfig ?? state.serverOrgConfig,
    serverPayrollConfig: data.payrollConfig ?? state.serverPayrollConfig,
    recentPosts: data.recentPosts ?? state.recentPosts,
    pendingFeedbackCount: data.pendingFeedbackCount ?? state.pendingFeedbackCount,
    todayChecklistDone: data.todayChecklistDone ?? state.todayChecklistDone,
    todayHandoverDone: data.todayHandoverDone ?? state.todayHandoverDone,
    lastFetchTime: Date.now(),
  }));
}

/**
 * Centralized data refresh with SWR pattern.
 * - Skips if data fresh (< 5min) unless force=true
 * - Persists to expanded localStorage
 */
async function performRefresh(force: boolean): Promise<void> {
  const store = useAppStore.getState();
  const { currentUser } = store;
  if (!currentUser) return;

  // Skip if data is fresh
  if (!force && !isDataStale()) return;

  const weekInfo = computeWeekInfo();
  const res = await callApi('GET_DATA', {
    username: currentUser.username,
    fullname: currentUser.fullname,
    role: currentUser.role,
    monthSheet: weekInfo.monthSheet,
    weekLabel: weekInfo.weekLabel,
    forceRefresh: force || undefined,
  }, { background: true });

  if (res?.ok) {
    hydrateStore(res.data);
    if (res.data.employmentProfile) {
      const latestUser = useAppStore.getState().currentUser;
      if (latestUser) {
        const refreshedUser = { ...latestUser, ...res.data.employmentProfile };
        useAppStore.getState().setCurrentUser(refreshedUser);
        localStorage.setItem('kg_user', JSON.stringify(refreshedUser));
      }
    }
    persistToCache(res.data);
  }
}

export function refreshAppData(force = false): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = performRefresh(force).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}
