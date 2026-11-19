import { useAppStore, type User } from '../store/useAppStore';
import { callApi } from './api';
import {
  speak,
  computeWeekInfo,
  getScheduleRegistrationWindow,
  isNextWeekScheduleRegistered,
  isScheduleRegistrationRequired,
  markScheduleRegisteredLocally,
  getSavedRegisteredShiftsForWeek,
} from '../utils/helpers';

/**
 * Hydrates Zustand session state, clears stale shared-device logs, persists session keys,
 * and kicks off non-blocking background GET_DATA + T5-T7 mandatory schedule check.
 */
export function hydrateSessionAfterLogin(userData: User, rememberMe: boolean): void {
  const store = useAppStore.getState();

  // Clear any stale logs from Kiosk or previous account on shared phones before hydrating new session
  store.setLogs([]);
  store.setLastCheckInTime(0);
  try {
    localStorage.removeItem('kg_logs');
  } catch {
    // Ignore storage access errors in restricted webviews
  }

  store.setCurrentUser(userData);

  // Persist session
  try {
    localStorage.setItem('kg_user', JSON.stringify(userData));
    localStorage.setItem('kg_session_time', Date.now().toString());
    localStorage.setItem('kg_remember', rememberMe ? 'true' : 'false');
  } catch {
    // Ignore storage quota errors
  }

  // Init week schedule data
  const weekInfo = computeWeekInfo();
  const initShifts: Record<string, string> = {};
  weekInfo.weekDatesKeys.forEach((k) => {
    initShifts[k] = 'OFF';
  });
  store.setShiftData(initShifts);

  // Restore registered shifts from localStorage immediately ONLY if matching expectedWeekKey
  const expectedWeekKey = `${weekInfo.monthSheet}|${weekInfo.weekLabel}`;
  const savedShifts = getSavedRegisteredShiftsForWeek(userData.username, weekInfo);
  const hasLocalReg = isNextWeekScheduleRegistered(
    false,
    userData.username,
    weekInfo,
    savedShifts,
    null
  );
  if (hasLocalReg) {
    if (savedShifts && savedShifts.length === 7) {
      store.setRegisteredShifts(savedShifts);
      const regShifts: Record<string, string> = {};
      weekInfo.weekDatesKeys.forEach((k, i) => {
        regShifts[k] = savedShifts[i];
      });
      store.setShiftData(regShifts);
    }
    store.setScheduleRegistered(true, expectedWeekKey);
    markScheduleRegisteredLocally(userData.username, expectedWeekKey, savedShifts);
  } else {
    store.setScheduleRegistered(false);
    store.setRegisteredShifts([]);
  }

  speak('Đăng nhập thành công. Xin chào ' + userData.fullname);

  // Fetch data in background (non-blocking for faster login)
  const currentWeekInfo = computeWeekInfo(undefined, false);
  void callApi(
    'GET_DATA',
    {
      username: userData.username,
      fullname: userData.fullname,
      role: userData.role,
      monthSheet: weekInfo.monthSheet,
      weekLabel: weekInfo.weekLabel,
      currentMonthSheet: currentWeekInfo.monthSheet,
      currentWeekLabel: currentWeekInfo.weekLabel,
    },
    { background: true }
  ).then((dataRes) => {
    if (!dataRes?.ok) return;
    const latestStore = useAppStore.getState();

    latestStore.setLogs(dataRes.data.logs || []);
    latestStore.setStats(dataRes.data.stats || { totalCheckIn: 0, validCount: 0 });
    latestStore.setUsers(dataRes.data.users || []);
    if (dataRes.data.keys) latestStore.setGroqKeys(dataRes.data.keys);

    const serverConfirmed = dataRes.data.isScheduleRegistered === true;
    const isReg =
      serverConfirmed ||
      isNextWeekScheduleRegistered(
        false,
        userData.username,
        weekInfo,
        dataRes.data.registeredShifts,
        serverConfirmed ? expectedWeekKey : null
      );

    if (isReg) {
      const finalShifts =
        Array.isArray(dataRes.data.registeredShifts) && dataRes.data.registeredShifts.length === 7
          ? dataRes.data.registeredShifts
          : savedShifts;
      if (finalShifts && finalShifts.length === 7) {
        latestStore.setRegisteredShifts(finalShifts);
        const regShifts: Record<string, string> = {};
        weekInfo.weekDatesKeys.forEach((k, i) => {
          regShifts[k] = finalShifts[i];
        });
        latestStore.setShiftData(regShifts);
      }
      markScheduleRegisteredLocally(userData.username, expectedWeekKey, finalShifts, {
        updatedAt: dataRes.data.scheduleUpdatedAt,
        sheetSynced: dataRes.data.scheduleSheetSynced !== false,
        offReason: dataRes.data.scheduleOffReason,
        status: dataRes.data.scheduleStatus,
      });
      latestStore.setScheduleRegistered(true, expectedWeekKey, {
        updatedAt: dataRes.data.scheduleUpdatedAt,
        sheetSynced: dataRes.data.scheduleSheetSynced !== false,
        offReason: dataRes.data.scheduleOffReason,
      });
    } else {
      latestStore.setScheduleRegistered(false);
      latestStore.setRegisteredShifts([]);
    }
    latestStore.setScheduleMeta({ isScheduleHydrated: true });

    if (dataRes.data.approvedShifts) latestStore.setApprovedShifts(dataRes.data.approvedShifts);
    if (dataRes.data.currentWeekApprovedShifts !== undefined) {
      latestStore.setCurrentWeekApprovedShifts(dataRes.data.currentWeekApprovedShifts);
    } else if (
      currentWeekInfo.monthSheet !== weekInfo.monthSheet ||
      currentWeekInfo.weekLabel !== weekInfo.weekLabel
    ) {
      void callApi(
        'GET_DATA',
        {
          username: userData.username,
          fullname: userData.fullname,
          role: userData.role,
          monthSheet: currentWeekInfo.monthSheet,
          weekLabel: currentWeekInfo.weekLabel,
        },
        { background: true }
      ).then((cwRes) => {
        if (cwRes?.ok) {
          useAppStore.getState().setCurrentWeekApprovedShifts(cwRes.data?.approvedShifts ?? null);
        }
      });
    } else {
      latestStore.setCurrentWeekApprovedShifts(dataRes.data.approvedShifts ?? null);
    }

    if (dataRes.data.gpsConfig) latestStore.setServerGpsConfig(dataRes.data.gpsConfig);
    if (dataRes.data.orgConfig) latestStore.setServerOrgConfig(dataRes.data.orgConfig);
    if (dataRes.data.payrollConfig) latestStore.setServerPayrollConfig(dataRes.data.payrollConfig);
    try {
      localStorage.setItem(
        'kg_stats',
        JSON.stringify(dataRes.data.stats || { totalCheckIn: 0, validCount: 0 })
      );
    } catch {
      // ignore storage errors
    }
    latestStore.setLastFetchTime(Date.now());

    // Mandatory schedule registration guidance on T5, T6, T7 before 17:00
    const regWindow = getScheduleRegistrationWindow();
    const mustRegister = isScheduleRegistrationRequired(userData);
    if (mustRegister && regWindow.isMandatoryWindow && !isReg) {
      latestStore.setCurrentTab('schedule');
    }
  });
}
