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
  const store = useAppStore.getState();
  try {
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
  try {
    if (data.logs) localStorage.setItem(CACHE_KEYS.logs, JSON.stringify(data.logs));
    if (data.stats) localStorage.setItem(CACHE_KEYS.stats, JSON.stringify(data.stats));
    if (data.users) localStorage.setItem(CACHE_KEYS.users, JSON.stringify(data.users));
    if (data.approvedShifts) localStorage.setItem(CACHE_KEYS.approvedShifts, JSON.stringify(data.approvedShifts));
    if (data.kingCoinsSummary) localStorage.setItem(CACHE_KEYS.kingCoins, JSON.stringify(data.kingCoinsSummary));
    if (data.notificationsUnread !== undefined) localStorage.setItem(CACHE_KEYS.notificationsUnread, String(data.notificationsUnread));
    if (data.trainingProgress) localStorage.setItem(CACHE_KEYS.trainingProgress, JSON.stringify(data.trainingProgress));
    localStorage.setItem(CACHE_KEYS.lastFetch, Date.now().toString());
  } catch (e) {
    console.warn('[Cache] Persist error:', e);
  }
}

/**
 * Hydrate store from API response.
 * Handles both legacy and mega-fetch fields.
 */
function hydrateStore(data: any): void {
  const store = useAppStore.getState();

  store.setLogs(data.logs || []);
  store.setStats(data.stats || { totalCheckIn: 0, validCount: 0 });
  if (data.users) store.setUsers(data.users);
  if (data.keys) store.setGroqKeys(data.keys);
  if (data.chatHistory) store.setChatHistory(data.chatHistory);
  if (data.aiPrompts) store.setAiPrompts(data.aiPrompts);
  if (data.isScheduleRegistered !== undefined) store.setScheduleRegistered(data.isScheduleRegistered);
  if (data.approvedShifts) store.setApprovedShifts(data.approvedShifts);
  if (data.gpsConfig) store.setServerGpsConfig(data.gpsConfig);
  if (data.orgConfig) store.setServerOrgConfig(data.orgConfig);
  if (data.payrollConfig) store.setServerPayrollConfig(data.payrollConfig);

  // Dashboard Hub (Phase 1)
  if (data.recentPosts) store.setRecentPosts(data.recentPosts);
  if (data.pendingFeedbackCount !== undefined) store.setPendingFeedbackCount(data.pendingFeedbackCount);
  if (data.todayChecklistDone !== undefined) store.setTodayChecklistDone(data.todayChecklistDone);
  if (data.todayHandoverDone !== undefined) store.setTodayHandoverDone(data.todayHandoverDone);

  // Mark fresh
  store.setLastFetchTime(Date.now());
}

/**
 * Centralized data refresh with SWR pattern.
 * - Skips if data fresh (< 5min) unless force=true
 * - Persists to expanded localStorage
 */
export async function refreshAppData(force = false): Promise<void> {
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
    persistToCache(res.data);
  }
}
