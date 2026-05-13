// ============================================
// Phase 7: Centralized data refresh utility
// ============================================
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { computeWeekInfo } from './helpers';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if data is stale (older than 5 minutes)
 */
export function isDataStale(): boolean {
  const lastFetch = useAppStore.getState().lastFetchTime;
  return Date.now() - lastFetch > STALE_THRESHOLD_MS;
}

/**
 * Centralized data refresh. Hydrates the Zustand store from GET_DATA API.
 * Skips if data is fresh (< 5min old) unless force=true.
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
  }, { background: true });

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
    // Dashboard Hub (Phase 1)
    if (res.data.recentPosts) store.setRecentPosts(res.data.recentPosts);
    if (res.data.pendingFeedbackCount !== undefined) store.setPendingFeedbackCount(res.data.pendingFeedbackCount);
    if (res.data.todayChecklistDone !== undefined) store.setTodayChecklistDone(res.data.todayChecklistDone);
    if (res.data.todayHandoverDone !== undefined) store.setTodayHandoverDone(res.data.todayHandoverDone);
    // Persist to localStorage
    localStorage.setItem('kg_logs', JSON.stringify(res.data.logs || []));
    localStorage.setItem('kg_stats', JSON.stringify(res.data.stats));
    // Mark fresh
    store.setLastFetchTime(Date.now());
  }
}
