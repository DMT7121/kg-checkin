import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { kgToast } from '../store/useFeedbackStore';
import { callApi } from '../services/api';
import {
  speak,
  computeWeekInfo,
  getPreviewShiftClass,
  SHIFT_OPTIONS,
  SHORT_DAY_NAMES,
  isRegistrationOpen,
  getAdminShiftClass,
  ADMIN_SHIFT_OPTIONS,
  generateMonthDates,
  formatMobileShift,
  ResponsiveShift,
  isNextWeekScheduleRegistered,
  markScheduleRegisteredLocally,
  getSavedRegisteredShiftsForWeek,
  getScheduleRegistrationMeta,
  getCurrentTimeString,
} from '../utils/helpers';
import type { MonthDateInfo } from '../utils/helpers';
import { CalendarCheck, Eye, AlertTriangle, Send, Lock, ExternalLink, Clock, RefreshCw, Pencil, CheckCheck, Inbox, LayoutGrid, CalendarRange, ChevronLeft, ChevronRight, ChevronDown, Sparkles, X, Bot, Info, FileSpreadsheet, ShieldCheck, CheckCircle2, Copy, ArrowLeftRight, Briefcase, Calendar } from 'lucide-react';
import { KgModuleHero, KgAlertCard, KgButton, KgBottomSheet, KgConfirmSheet } from '../components/KgDesignSystem';
import { getCalendarDayMeta } from '../utils/calendarHighlights';
import { isWorkEligible } from '../utils/employment';
import { buildEmployeeShiftMapFromPrevious, mapPreviousWeekToTargetSchedules } from '../utils/shiftSwapValidator';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import SmartPersonName from '../components/SmartPersonName';
import { useMonthDayVisibility } from '../hooks/useMonthDayVisibility';
import ShiftMonthMatrix, { buildEmployeeMonthShiftMap } from '../components/workforce/ShiftMonthMatrix';

export default function Schedule({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const currentUser = useAppStore(state => state.currentUser);
  const isScheduleRegistered = useAppStore(state => state.isScheduleRegistered);
  const registeredWeekKey = useAppStore(state => state.registeredWeekKey);
  const scheduleUpdatedAt = useAppStore(state => state.scheduleUpdatedAt);
  const scheduleSheetSynced = useAppStore(state => state.scheduleSheetSynced);
  const shiftData = useAppStore(state => state.shiftData);
  const offReason = useAppStore(state => state.offReason);
  const approvedShifts = useAppStore(state => state.approvedShifts);
  const currentWeekApprovedShifts = useAppStore(state => state.currentWeekApprovedShifts);
  const registeredShifts = useAppStore(state => state.registeredShifts);
  const adminSchedules = useAppStore(state => state.adminSchedules);
  const originalAdminSchedules = useAppStore(state => state.originalAdminSchedules);
  const storeUsers = useAppStore(state => state.users);
  const storeMonthSchedules = useAppStore(state => state.monthSchedules);
  const store = useAppStore.getState();
  const isManagerView = mode === 'admin' && currentUser?.role === 'admin';

  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767px)').matches
      : false
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsMobileViewport(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInputText, setAiInputText] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7); // Default to next week
    return d;
  });
  
  const weekInfo = useMemo(
    () => (isManagerView ? computeWeekInfo(currentDate, false) : computeWeekInfo()),
    [isManagerView, currentDate]
  );
  const expectedWeekKey = `${weekInfo.monthSheet}|${weekInfo.weekLabel}`;
  const weekDayMeta = useMemo(
    () => weekInfo.weekDatesKeys.map((dateKey) => getCalendarDayMeta(dateKey)),
    [weekInfo.weekDatesKeys]
  );
  
  // Calculate week info and month info based on currentDate for Admin navigation
  const selectedMonth = currentDate.getMonth() + 1;
  const selectedYear = currentDate.getFullYear();
  const monthDates: MonthDateInfo[] = useMemo(() => generateMonthDates(selectedMonth, selectedYear), [selectedYear, selectedMonth]);
  const {
    visibleKeys: visibleMonthDateKeys,
    visibleDates: visibleMonthDates,
    updateVisibleKeys: setVisibleMonthDateKeys,
  } = useMonthDayVisibility('kg_schedule_visible_days', monthDates);
  
  const [monthData, setMonthData] = useState<any[]>(() => {
    return Array.isArray(storeMonthSchedules) ? storeMonthSchedules : [];
  });
  const [, setIsMonthRefreshing] = useState(false);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<{
    variant: 'error' | 'warning' | 'success' | 'info';
    title: string;
    text: string;
    details?: string[];
  } | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [confirmSyncRosterOpen, setConfirmSyncRosterOpen] = useState(false);
  const [copyPrevWeekModal, setCopyPrevWeekModal] = useState<{ prevWeekDisplay: string; prevWeekInfo: ReturnType<typeof computeWeekInfo> } | null>(null);
  const [submitReceiptModal, setSubmitReceiptModal] = useState<{
    weekDisplay: string;
    monthSheet: string;
    sheetSaved: boolean;
    syncTimestamp: string;
    isUpdate: boolean;
  } | null>(null);
  const [inspectEmpSheet, setInspectEmpSheet] = useState<{
    fullname: string;
    origShifts: string[];
    reason?: string;
    note?: string;
    hasRegistered: boolean;
  } | null>(null);
  const [showRegisteredCompare, setShowRegisteredCompare] = useState(false);
  const [returnTab] = useState<string | null>(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('returnTab');
      if (fromUrl) return fromUrl;
      return sessionStorage.getItem('kg_schedule_return_tab');
    } catch {
      return null;
    }
  });

  const pushToast = useCallback((title: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    kgToast(title, type);
  }, []);

  const handleReturnToCheckIn = useCallback(() => {
    try {
      sessionStorage.removeItem('kg_schedule_return_tab');
    } catch { /* ignore */ }
    setSubmitReceiptModal(null);
    store.setCurrentTab('checkin');
  }, [store]);

  const handleGoToSwap = useCallback(() => {
    try {
      sessionStorage.setItem('kg_hub_subtab_workforce', 'swap');
    } catch { /* ignore */ }
    store.setCurrentTab('swap');
  }, [store]);

  const changeWeek = (offset: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + offset * 7);
    setCurrentDate(d);
  };

  const changeMonth = (offset: number) => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + offset);
    setCurrentDate(d);
  };

  const loadMonthSchedules = async () => {
    const hasData = monthData.length > 0 || (Array.isArray(store.monthSchedules) && store.monthSchedules.length > 0);
    if (!hasData) {
      setIsMonthRefreshing(true);
    }
    
    // Calculate all unique (monthSheet, weekLabel) required for the current month view
    const requestsMap = new Map<string, string>();
    monthDates.forEach(mDate => {
      const wInfo = computeWeekInfo(mDate.date, false);
      requestsMap.set(wInfo.weekLabel, wInfo.monthSheet);
    });
    
    const requests = Array.from(requestsMap.entries()).map(([weekLabel, monthSheet]) => ({ monthSheet, weekLabel }));
    
    try {
      const res = await callApi('GET_MONTH_SCHEDULES', { 
        monthSheet: `Tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`,
        requests 
      }, { background: true });
      setIsMonthRefreshing(false);
      if (res?.ok && res.data?.weeks) {
        setMonthData(res.data.weeks);
        store.setMonthSchedules(res.data.weeks);
        setInlineNotice(null);
      } else if (!hasData) {
        setInlineNotice({
          variant: 'error',
          title: 'Lỗi tải lịch tháng',
          text: 'Không thể tải lịch làm việc tháng này. Vui lòng thử lại.',
        });
      }
    } catch {
      setIsMonthRefreshing(false);
      if (!hasData) {
        setInlineNotice({
          variant: 'error',
          title: 'Lỗi kết nối',
          text: 'Mất kết nối khi tải lịch tháng. Vui lòng thử lại.',
        });
      }
    }
  };

  useEffect(() => {
    if (isManagerView && viewMode === 'month') {
      loadMonthSchedules();
    }
  }, [isManagerView, viewMode, selectedMonth, selectedYear]);

  const updateSingleMonthShift = async (empFullname: string, mDate: MonthDateInfo, value: string) => {
    // Optimistic Update
    const newData = [...monthData];
    const weekIdx = newData.findIndex(w => w.weekLabel === mDate.weekLabel);
    if (weekIdx !== -1) {
      const w = { ...newData[weekIdx], schedules: [...newData[weekIdx].schedules] };
      const empIdx = w.schedules.findIndex((s: any) => s.fullname === empFullname);
      if (empIdx !== -1) {
         const emp = { ...w.schedules[empIdx], shifts: [...w.schedules[empIdx].shifts] };
         emp.shifts[mDate.dayIndex] = value;
         w.schedules[empIdx] = emp;
      } else {
         const newEmp = { fullname: empFullname, shifts: ['', '', '', '', '', '', ''] };
         newEmp.shifts[mDate.dayIndex] = value;
         w.schedules.push(newEmp);
      }
      newData[weekIdx] = w;
    } else {
      // Create new week if not exists
      const newEmp = { fullname: empFullname, shifts: ['', '', '', '', '', '', ''] };
      newEmp.shifts[mDate.dayIndex] = value;
      newData.push({ weekLabel: mDate.weekLabel, schedules: [newEmp] });
    }
    setMonthData(newData);
    
    // API
    const res = await callApi('UPDATE_SINGLE_SHIFT', {
       monthSheet: `Tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`,
       weekLabel: mDate.weekLabel,
       fullname: empFullname,
       dayIndex: mDate.dayIndex,
       shiftValue: value
    }, { background: true });
    
    if (!res?.ok) {
       setInlineNotice({
         variant: 'error',
         title: 'Cập nhật thất bại',
         text: 'Không thể lưu ca vừa chọn. Vui lòng tải lại dữ liệu.',
       });
    }
  };

  // Memoized users, filtered list, and lookup map for Month View matrix (B12)
  const users = useMemo(() => {
    return storeUsers && storeUsers.length > 0 ? storeUsers.filter(isWorkEligible) : [];
  }, [storeUsers]);

  const filteredUsers = useMemo(() => {
    if (!empSearchQuery.trim()) return users;
    const q = empSearchQuery.trim().toLowerCase();
    return users.filter(u => u.fullname?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q));
  }, [users, empSearchQuery]);

  const empMonthMap = useMemo(() => buildEmployeeMonthShiftMap(monthData), [monthData]);

  // Deduplicated OFF-rule computation (single useMemo replacing 3 duplicated loops)
  const { hasWeekendOff, hasConsecutiveOffs, hasHolidayOff } = useMemo(() => {
    let weekendOff = false;
    let consecutiveOffs = false;
    let holidayOff = false;
    let offCount = 0;
    for (let i = 0; i < 7; i++) {
      const shift = shiftData[weekInfo.weekDatesKeys[i]];
      if (shift === 'OFF') {
        offCount++;
        if (offCount >= 2) consecutiveOffs = true;
        if (i >= 4) weekendOff = true;
        if (weekDayMeta[i]?.kind === 'holiday') holidayOff = true;
      } else {
        offCount = 0;
      }
    }
    return {
      hasWeekendOff: weekendOff,
      hasConsecutiveOffs: consecutiveOffs,
      hasHolidayOff: holidayOff,
    };
  }, [shiftData, weekInfo.weekDatesKeys, weekDayMeta]);

  const [regWindow, setRegWindow] = useState(() => isRegistrationOpen());
  const [isEditing, setIsEditing] = useState(false);
  const [isSyncingPendingSheet, setIsSyncingPendingSheet] = useState(false);

  const isRegisteredForTargetWeek = useMemo(
    () =>
      isNextWeekScheduleRegistered(
        isScheduleRegistered,
        currentUser?.username,
        weekInfo,
        registeredShifts,
        registeredWeekKey
      ),
    [isScheduleRegistered, currentUser?.username, weekInfo, registeredShifts, registeredWeekKey]
  );

  const registrationMeta = useMemo(
    () => getScheduleRegistrationMeta(currentUser?.username, weekInfo),
    [
      currentUser?.username,
      weekInfo,
      isScheduleRegistered,
      registeredWeekKey,
      scheduleUpdatedAt,
      scheduleSheetSynced,
      registeredShifts,
    ]
  );

  const effectiveUpdatedAt =
    registeredWeekKey === expectedWeekKey && scheduleUpdatedAt
      ? scheduleUpdatedAt
      : registrationMeta?.updatedAt || '';

  const effectiveSheetSynced =
    registeredWeekKey === expectedWeekKey
      ? scheduleSheetSynced
      : registrationMeta?.sheetSynced !== false;

  const effectiveRegisteredShifts =
    (registeredWeekKey === expectedWeekKey && registeredShifts && registeredShifts.length === 7
      ? registeredShifts
      : null) || registrationMeta?.shifts || null;

  // Derive schedule status
  const scheduleStatus: 'none' | 'pending' | 'approved' =
    !isRegisteredForTargetWeek ? 'none'
    : (approvedShifts && approvedShifts.length > 0) ? 'approved'
    : 'pending';

  const isOpen = regWindow.open;

  // Show registration form when: not registered, OR explicitly editing
  const showRegistrationForm = isOpen && (!isRegisteredForTargetWeek || isEditing);

  // Refresh registration window every minute (skip when document hidden)
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setRegWindow(isRegistrationOpen());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Init shift data and restore saved per-user registration if present (strictly week-scoped)
  useEffect(() => {
    const savedShifts = getSavedRegisteredShiftsForWeek(currentUser?.username, weekInfo);
    const meta = getScheduleRegistrationMeta(currentUser?.username, weekInfo);
    const scopedStoreShifts =
      registeredWeekKey === expectedWeekKey && registeredShifts && registeredShifts.length === 7
        ? registeredShifts
        : null;

    if (isRegisteredForTargetWeek && (!isScheduleRegistered || registeredWeekKey !== expectedWeekKey)) {
      store.setScheduleRegistered(true, expectedWeekKey);
      if (meta?.updatedAt) {
        store.setScheduleMeta({
          registeredWeekKey: expectedWeekKey,
          scheduleUpdatedAt: meta.updatedAt,
          scheduleSheetSynced: meta.sheetSynced !== false,
        });
      }
    }
    if (savedShifts && savedShifts.length === 7 && !scopedStoreShifts) {
      store.setRegisteredShifts(savedShifts);
    }
    if (meta?.offReason && !offReason) {
      store.setOffReason(meta.offReason);
    }

    const hasCurrentWeekKeys = weekInfo.weekDatesKeys.every((k) => k in shiftData);
    if (!hasCurrentWeekKeys || Object.keys(shiftData).length === 0) {
      const initShifts: Record<string, string> = {};
      const baseShifts =
        scopedStoreShifts
          ? scopedStoreShifts
          : savedShifts && savedShifts.length === 7
            ? savedShifts
            : null;
      weekInfo.weekDatesKeys.forEach((k, i) => {
        initShifts[k] = baseShifts ? baseShifts[i] || 'OFF' : 'OFF';
      });
      store.setShiftData(initShifts);
    }
  }, [weekInfo.weekDatesKeys, currentUser?.username, expectedWeekKey]);

  const syncPendingScheduleToSheet = async (silent: boolean = false) => {
    if (!currentUser || isSyncingPendingSheet) return;
    const activeShifts =
      (registeredWeekKey === expectedWeekKey && registeredShifts?.length === 7 ? registeredShifts : null) ||
      getSavedRegisteredShiftsForWeek(currentUser.username, weekInfo);
    if (!activeShifts || activeShifts.length !== 7) return;

    setIsSyncingPendingSheet(true);
    try {
      const res = await callApi(
        'REGISTER_SHIFT',
        {
          username: currentUser.username,
          fullname: currentUser.fullname,
          monthSheet: weekInfo.monthSheet,
          weekLabel: weekInfo.weekLabel,
          shifts: activeShifts,
          offReason: offReason || registrationMeta?.offReason || '',
          isEdit: true,
        },
        { background: silent, timeoutMs: 28000, maxAttempts: 2 }
      );
      if (res?.ok && res?.data?.sheetSaved !== false) {
        const ts = res?.data?.timestamp || effectiveUpdatedAt || getCurrentTimeString();
        markScheduleRegisteredLocally(currentUser.username, expectedWeekKey, activeShifts, {
          updatedAt: ts,
          sheetSynced: true,
          offReason: offReason || registrationMeta?.offReason || '',
        });
        store.setScheduleMeta({
          registeredWeekKey: expectedWeekKey,
          scheduleUpdatedAt: ts,
          scheduleSheetSynced: true,
        });
        if (!silent) {
          pushToast(`Đã đồng bộ 100% lịch tuần ${weekInfo.weekDisplay} vào Google Sheets!`, 'success');
        }
      } else if (!silent) {
        setInlineNotice({
          variant: 'info',
          title: 'Đang xếp hàng đồng bộ',
          text: 'Máy chủ Google Sheets đang xử lý nhiều yêu cầu cùng lúc. Hệ thống sẽ tiếp tục tự động nạp lại.',
        });
      }
    } finally {
      setIsSyncingPendingSheet(false);
    }
  };

  // Auto-heal if schedule was buffered in Edge D1 (sheetSaved === false)
  useEffect(() => {
    if (isManagerView || !isRegisteredForTargetWeek || effectiveSheetSynced || !currentUser) return;
    const t1 = window.setTimeout(() => {
      syncPendingScheduleToSheet(true);
    }, 3500);
    return () => window.clearTimeout(t1);
  }, [isManagerView, isRegisteredForTargetWeek, effectiveSheetSynced, currentUser?.username, expectedWeekKey]);

  useEffect(() => {
    if (isManagerView && viewMode === 'week') {
      loadAdminSchedules();
    }
  }, [isManagerView, viewMode, weekInfo.weekLabel]);

  // Auto-check approval when pending (every 2 minutes, only when visible and on schedule/workforce tab)
  useEffect(() => {
    if (scheduleStatus !== 'pending' || !currentUser || isManagerView) return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const activeTab = useAppStore.getState().currentTab;
      if (activeTab !== 'workforce' && activeTab !== 'schedule') return;
      callApi('GET_DATA', {
        username: currentUser.username,
        fullname: currentUser.fullname,
        role: currentUser.role,
        monthSheet: weekInfo.monthSheet,
        weekLabel: weekInfo.weekLabel,
      }, { background: true }).then((res) => {
        if (res?.ok && res.data.approvedShifts) {
          store.setApprovedShifts(res.data.approvedShifts);
          store.setScheduleRegistered(true, expectedWeekKey);
          if (res.data.scheduleUpdatedAt) {
            store.setScheduleMeta({
              registeredWeekKey: expectedWeekKey,
              scheduleUpdatedAt: res.data.scheduleUpdatedAt,
              scheduleSheetSynced: true,
            });
          }
          pushToast('Lịch làm việc của bạn đã được Admin duyệt!', 'success');
          setInlineNotice({
            variant: 'success',
            title: 'Lịch đã được duyệt!',
            text: 'Admin đã duyệt lịch làm việc của bạn.',
          });
          speak('Lịch làm việc đã được Admin duyệt');
        }
      });
    }, 120000);
    return () => clearInterval(timer);
  }, [scheduleStatus, currentUser, isManagerView]);

  const handleShiftChange = (key: string, value: string) => {
    if (!isOpen) return;
    store.updateShiftData(key, value);
  };

  const handleCopyMondayShift = () => {
    if (!isOpen) return;
    const monKey = weekInfo.weekDatesKeys[0];
    const monShift = shiftData[monKey] || 'OFF';
    const nextShifts = { ...shiftData };
    for (let i = 1; i < 5; i++) {
      nextShifts[weekInfo.weekDatesKeys[i]] = monShift;
    }
    store.setShiftData(nextShifts);
    pushToast(`Đã sao chép ca Thứ 2 (${monShift}) cho T3–T6!`, 'success');
  };

  const startEditing = () => {
    // Pre-fill shift data from registered shifts for this target week
    const activeShifts = effectiveRegisteredShifts || getSavedRegisteredShiftsForWeek(currentUser?.username, weekInfo);
    if (activeShifts) {
      const editShifts: Record<string, string> = {};
      weekInfo.weekDatesKeys.forEach((k, i) => (editShifts[k] = activeShifts[i] || 'OFF'));
      store.setShiftData(editShifts);
    }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    // Restore shift data from registered shifts for this target week
    const activeShifts = effectiveRegisteredShifts || getSavedRegisteredShiftsForWeek(currentUser?.username, weekInfo);
    if (activeShifts) {
      const restored: Record<string, string> = {};
      weekInfo.weekDatesKeys.forEach((k, i) => (restored[k] = activeShifts[i] || 'OFF'));
      store.setShiftData(restored);
    }
    setIsEditing(false);
  };

  const handleCopyEmployeeCurrentWeek = async () => {
    let sourceShifts =
      currentWeekApprovedShifts && currentWeekApprovedShifts.length === 7
        ? currentWeekApprovedShifts
        : null;

    if (!sourceShifts || sourceShifts.every((s) => !s || s === 'OFF')) {
      const curW = computeWeekInfo(undefined, false);
      store.setLoading(true, `Đang tải lịch tuần này (${curW.weekDisplay})...`);
      const res = await callApi('GET_ALL_SCHEDULES', {
        monthSheet: curW.monthSheet,
        weekLabel: curW.weekLabel,
      });
      store.setLoading(false);
      if (res?.ok) {
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.schedules)
            ? res.data.schedules
            : [];
        const match = list.find(
          (emp: any) =>
            (emp.username &&
              currentUser?.username &&
              String(emp.username).toLowerCase() === currentUser.username.toLowerCase()) ||
            (emp.fullname &&
              currentUser?.fullname &&
              String(emp.fullname).trim().toLowerCase() === currentUser.fullname.trim().toLowerCase())
        );
        if (match && Array.isArray(match.shifts) && match.shifts.length === 7) {
          sourceShifts = match.shifts;
        }
      }
    }

    if (!sourceShifts || sourceShifts.every((s) => !s || s === 'OFF')) {
      setInlineNotice({
        variant: 'info',
        title: 'Chưa có lịch tuần này',
        text: 'Không tìm thấy lịch đã duyệt của tuần hiện tại để sao chép nhanh.',
      });
      return;
    }

    const mapped = buildEmployeeShiftMapFromPrevious(sourceShifts, weekInfo.weekDatesKeys);
    store.setShiftData(mapped);
    pushToast('Đã sao chép lịch tuần này sang 7 ngày tuần tới!', 'success');
  };

  const handleAdminCopyPreviousWeek = () => {
    if (!adminSchedules || adminSchedules.length === 0) {
      setInlineNotice({
        variant: 'info',
        title: 'Chưa tải danh sách',
        text: 'Vui lòng bấm "Tải lịch" trước khi sao chép tuần trước.',
      });
      return;
    }
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 7);
    const prevWeekInfo = computeWeekInfo(prevDate, false);
    setCopyPrevWeekModal({ prevWeekDisplay: prevWeekInfo.weekDisplay, prevWeekInfo });
  };

  const executeAdminCopyPreviousWeek = async (overwriteExisting: boolean) => {
    if (!copyPrevWeekModal) return;
    const { prevWeekInfo } = copyPrevWeekModal;
    setCopyPrevWeekModal(null);

    store.setLoading(true, `Đang lấy lịch tuần ${prevWeekInfo.weekDisplay}...`);
    const res = await callApi('GET_ALL_SCHEDULES', {
      monthSheet: prevWeekInfo.monthSheet,
      weekLabel: prevWeekInfo.weekLabel,
    });
    store.setLoading(false);

    if (!res?.ok) {
      setInlineNotice({
        variant: 'error',
        title: 'Lỗi tải tuần trước',
        text: res?.message || 'Không thể tải lịch tuần trước.',
      });
      return;
    }

    const prevList = Array.isArray(res.data)
      ? res.data
      : Array.isArray(res.data?.schedules)
        ? res.data.schedules
        : [];
    if (prevList.length === 0) {
      setInlineNotice({
        variant: 'info',
        title: 'Chưa có dữ liệu',
        text: `Tuần ${prevWeekInfo.weekDisplay} chưa có lịch để sao chép.`,
      });
      return;
    }

    const result = mapPreviousWeekToTargetSchedules({
      currentSchedules: adminSchedules,
      previousSchedules: prevList,
      overwriteExisting,
    });

    if (result.copiedEmployeeCount === 0) {
      setInlineNotice({
        variant: 'info',
        title: 'Không có thay đổi',
        text: overwriteExisting
          ? 'Lịch hiện tại đã trùng khớp với tuần trước.'
          : 'Tất cả nhân sự đều đã có lịch đăng ký. Chọn "Ghi đè toàn bộ" nếu muốn chép đè.',
      });
      return;
    }

    store.setAdminSchedules(result.updatedSchedules as any);
    setInlineNotice({
      variant: 'success',
      title: `Đã sao chép cho ${result.copiedEmployeeCount} nhân sự`,
      text: `Đã điền ${result.copiedCellCount} ô ca từ tuần ${prevWeekInfo.weekDisplay}. Kiểm tra lại và bấm "Duyệt & Đồng bộ lịch làm" để lưu chính thức.`,
    });
  };

  const submitRegistration = () => {
    if (!isOpen) return;
    setInlineNotice(null);

    // Validate all 7 days must have a valid shift selected
    const allDaysFilled = weekInfo.weekDatesKeys.every((k) => {
      const s = shiftData[k];
      return typeof s === 'string' && s.trim().length > 0;
    });

    if (!allDaysFilled || Object.keys(shiftData).length < 7) {
      setInlineNotice({
        variant: 'warning',
        title: 'Chưa chọn đủ 7 ngày',
        text: 'Vui lòng chọn đầy đủ ca cho tất cả 7 ngày trong tuần tiếp theo.',
      });
      return;
    }

    if ((hasWeekendOff || hasConsecutiveOffs || hasHolidayOff) && offReason.trim() === '') {
      const details: string[] = [];
      if (hasWeekendOff) details.push('Xin nghỉ (OFF) vào Thứ 6, Thứ 7 hoặc Chủ Nhật.');
      if (hasHolidayOff) details.push('Xin nghỉ (OFF) vào ngày Lễ/Tết cao điểm.');
      if (hasConsecutiveOffs) details.push('Xin nghỉ (OFF) từ 2 ngày liên tiếp trở lên.');
      setInlineNotice({
        variant: 'warning',
        title: 'Thiếu lý do xin nghỉ',
        text: 'Theo quy định nhà hàng, bạn cần nhập lý do chi tiết khi:',
        details,
      });
      return;
    }

    setConfirmSubmitOpen(true);
  };

  const executeRegistrationSubmit = async () => {
    setConfirmSubmitOpen(false);
    const isUpdate = isRegisteredForTargetWeek;
    setIsSubmitting(true);
    const shifts = weekInfo.weekDatesKeys.map((key: string) => shiftData[key] || 'OFF');
    const payload = {
      username: currentUser!.username,
      fullname: currentUser!.fullname,
      monthSheet: weekInfo.monthSheet,
      weekLabel: weekInfo.weekLabel,
      shifts,
      offReason,
      isEdit: isUpdate,
    };

    try {
      // Concurrent-resilient submission: up to 3 attempts with random jitter so simultaneous staff submissions all succeed
      let res: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        res = await callApi('REGISTER_SHIFT', payload, { timeoutMs: 28000, maxAttempts: 1 });
        if (res?.ok) break;
        const msg = String(res?.message || '');
        // Do not retry if server explicitly rejected due to employment status
        if (msg.includes('trạng thái') || msg.includes('tạm khóa') || msg.includes('nghỉ việc')) {
          break;
        }
        if (attempt < 3) {
          const jitterMs = 550 * attempt + Math.floor(Math.random() * 650);
          await new Promise((r) => setTimeout(r, jitterMs));
        }
      }

      if (res?.ok) {
        const sheetSaved = res?.data?.sheetSaved !== false;
        const syncTimestamp = res?.data?.timestamp || getCurrentTimeString();
        markScheduleRegisteredLocally(currentUser?.username, expectedWeekKey, shifts, {
          updatedAt: syncTimestamp,
          sheetSynced: sheetSaved,
          offReason,
        });
        store.setRegisteredShifts(shifts);
        store.setScheduleRegistered(true, expectedWeekKey);
        store.setScheduleMeta({
          registeredWeekKey: expectedWeekKey,
          scheduleUpdatedAt: syncTimestamp,
          scheduleSheetSynced: sheetSaved,
        });
        setIsEditing(false);

        // Optimistically sync adminSchedules if already loaded in memory
        if (Array.isArray(adminSchedules) && adminSchedules.length > 0 && currentUser?.fullname) {
          const normName = currentUser.fullname.trim().toLowerCase();
          const updatedAdmin = adminSchedules.map((emp: any) =>
            String(emp.fullname || '').trim().toLowerCase() === normName
              ? { ...emp, shifts: [...shifts], status: 'Chờ duyệt' }
              : emp
          );
          store.setAdminSchedules(updatedAdmin);
        }

        // If Edge buffered into D1 because GAS lock was busy, schedule a follow-up push to confirm 100% Sheet write
        if (!sheetSaved) {
          window.setTimeout(() => {
            syncPendingScheduleToSheet(true);
          }, 4000);
        }

        setSubmitReceiptModal({
          weekDisplay: weekInfo.weekDisplay,
          monthSheet: weekInfo.monthSheet,
          sheetSaved,
          syncTimestamp,
          isUpdate,
        });
        speak('Đăng ký lịch làm việc thành công, đã nạp vào Google Sheets');
      } else if (res) {
        setInlineNotice({
          variant: 'error',
          title: 'Lỗi gửi lịch',
          text: res.message || 'Không thể ghi vào sheet lúc này.',
        });
      } else {
        setInlineNotice({
          variant: 'error',
          title: 'Lỗi mạng',
          text: 'Không thể kết nối đến máy chủ Google Sheets. Vui lòng thử lại.',
        });
      }
    } catch (err: any) {
      setInlineNotice({
        variant: 'error',
        title: 'Lỗi',
        text: err?.message || 'Có lỗi xảy ra khi nạp lịch làm việc.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Shared preview grid renderer (360px-safe min-w-0)
  const renderShiftGrid = (getShift: (i: number) => string) => (
    <div className="grid grid-cols-7 gap-1 sm:gap-1.5 min-w-0">
      {SHORT_DAY_NAMES.map((shortDayName, i) => {
        const shiftVal = getShift(i);
        return (
          <div
            key={i}
            className={`calendar-preview-day min-w-0 flex flex-col items-center rounded-xl px-0.5 py-1.5 transition-all ${weekDayMeta[i].className}`}
            title={weekDayMeta[i].label || undefined}
          >
            <span className="text-[10px] sm:text-[11px] font-mono tabular-nums font-extrabold text-[var(--kg-text)] truncate max-w-full">
              {weekInfo.weekDates[i]?.split('/')[0]}/{weekInfo.weekDates[i]?.split('/')[1]}
            </span>
            <span className="text-[9px] text-[var(--kg-text-muted)] font-bold mb-1 uppercase">
              {shortDayName}
            </span>
            <div className={`w-full min-w-0 text-center py-1.5 sm:py-2 px-0.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black tracking-tight transition-all shadow-xs overflow-hidden ${getPreviewShiftClass(shiftVal)}`}>
              <ResponsiveShift shift={shiftVal} />
            </div>
          </div>
        );
      })}
    </div>
  );

  // === ADMIN FUNCTIONS ===
  async function loadAdminSchedules() {
    store.setLoading(true, 'Đang kết nối Server...');
    const res = await callApi('GET_ALL_SCHEDULES', { monthSheet: weekInfo.monthSheet, weekLabel: weekInfo.weekLabel });
    store.setLoading(false);
    if (res?.ok) {
      const parsedSchedules = Array.isArray(res.data) ? res.data : (res.data.schedules || []);
      let cleanSchedules = parsedSchedules.map((emp: any) => {
        const shifts: string[] = [];
        const shiftNotes: string[] = emp.shiftNotes || Array(7).fill('');
        (emp.shifts || []).forEach((s: string, idx: number) => {
          if (s && s.includes('\n')) {
            const parts = s.split('\n');
            shifts[idx] = parts[0].trim();
            if (!shiftNotes[idx]) shiftNotes[idx] = parts.slice(1).join('\n').trim();
          } else {
            shifts[idx] = s;
          }
        });
        
        // Kiểm tra xem nhân viên đã đăng ký hay chưa
        // Cứ có ca nào khác OFF và khác rỗng, hoặc có trạng thái Chờ duyệt / Đã duyệt thì coi như Đã đăng ký
        const isRegistered = emp.hasApproved || emp.status === 'Chờ duyệt' || (emp.status && emp.status.includes('duyệt')) || shifts.some((s: string) => s && s !== 'OFF' && s !== '');
        
        // Nếu chưa đăng ký, để trống tất cả lịch (thay vì mặc định OFF)
        if (!isRegistered) {
          for (let i = 0; i < 7; i++) {
            if (!shifts[i] || shifts[i] === 'OFF') shifts[i] = '';
          }
        }
        
        return { ...emp, shifts, shiftNotes, isRegistered };
      });
      
      // Bổ sung những nhân viên chưa có trong danh sách (do chưa đăng ký và chưa được thêm trên Sheet)
      const users = store.users && store.users.length > 0 ? store.users.filter(isWorkEligible) : [];
      if (users.length > 0) {
        const eligibleUsernames = new Set(users.map(user => user.username.toLowerCase()));
        const eligibleNames = new Set(users.map(user => user.fullname.toLowerCase()));
        cleanSchedules = cleanSchedules.filter((schedule: any) => (
          (schedule.username && eligibleUsernames.has(schedule.username.toString().toLowerCase()))
          || eligibleNames.has(schedule.fullname.toString().toLowerCase())
        ));
      }
      users.forEach(u => {
        if (!cleanSchedules.find((s: any) => s.fullname === u.fullname)) {
          cleanSchedules.push({
            fullname: u.fullname,
            username: u.username,
            shifts: ['', '', '', '', '', '', ''],
            shiftNotes: ['', '', '', '', '', '', ''],
            isRegistered: false,
            hasApproved: false,
            reason: ''
          });
        }
      });
      
      // Sắp xếp: Ai đã đăng ký thì lên đầu
      cleanSchedules.sort((a: any, b: any) => (b.isRegistered ? 1 : 0) - (a.isRegistered ? 1 : 0));
      
      store.setAdminSchedules(cleanSchedules);
      store.setOriginalAdminSchedules(JSON.parse(JSON.stringify(cleanSchedules)));
    } else if (res) {
      setInlineNotice({
        variant: 'info',
        title: 'Thông báo',
        text: res.message || 'Không thể tải danh sách lịch làm.',
      });
    }
  };

  const trackScheduleChange = (empIndex: number, currentSchedules: any[]) => {
    const currentEmp = currentSchedules[empIndex];
    const origEmp = originalAdminSchedules[empIndex];
    const changes: string[] = [];
    for (let i = 0; i < 7; i++) {
      if (currentEmp.shifts[i] !== origEmp.shifts[i]) {
        changes.push(`Ngày ${weekInfo.weekDates[i]} (${origEmp.shifts[i] || 'Chưa ĐK'} ⮕ ${currentEmp.shifts[i]})`);
      }
    }
    const updated = [...currentSchedules];
    updated[empIndex] = { ...currentEmp, note: changes.length > 0 ? 'Điều chỉnh: ' + changes.join('; ') : '' };
    store.setAdminSchedules(updated);
  };

  const updateAdminShift = (empIndex: number, dayIndex: number, value: string) => {
    const updated = [...adminSchedules];
    const emp = { ...updated[empIndex], shifts: [...updated[empIndex].shifts] };
    emp.shifts[dayIndex] = value;
    updated[empIndex] = emp;
    trackScheduleChange(empIndex, updated);
  };

  const [isSyncingRoster, setIsSyncingRoster] = useState(false);

  const approveAllSchedules = () => {
    if (adminSchedules.length === 0) return;
    setConfirmApproveOpen(true);
  };

  const executeApproveAllSchedules = async () => {
    setConfirmApproveOpen(false);
    store.setLoading(true, 'Đang duyệt và nạp lịch sang Sheet Lịch Làm...');
    const finalSchedules = adminSchedules.map((emp, empIdx) => {
      const origEmp = originalAdminSchedules[empIdx];
      const newShifts = [...emp.shifts];
      const newNotes = [...(emp.shiftNotes || [])];
      for (let i = 0; i < 7; i++) {
        if (newShifts[i] && origEmp?.shifts?.[i] !== newShifts[i]) {
          newNotes[i] = `Sửa từ ${origEmp?.shifts?.[i] || 'Chưa ĐK'}`;
        }
      }
      return { ...emp, shifts: newShifts, shiftNotes: newNotes };
    });

    const res = await callApi('APPROVE_SCHEDULES', { 
      monthSheet: weekInfo.monthSheet, 
      weekLabel: weekInfo.weekLabel, 
      schedules: finalSchedules, 
      isFinal: true,
      weekDatesKeys: weekInfo.weekDatesKeys,
      weekDates: weekInfo.weekDates,
      weekStart: weekInfo.weekStart instanceof Date ? weekInfo.weekStart.toISOString() : weekInfo.weekStart,
      weekEnd: weekInfo.weekEnd instanceof Date ? weekInfo.weekEnd.toISOString() : weekInfo.weekEnd,
    });
    store.setLoading(false);
    if (res?.ok) {
      pushToast(res?.message || 'Lịch đã được duyệt và nạp sang Google Sheets thành công!', 'success');
      setInlineNotice({
        variant: 'success',
        title: 'Duyệt & nạp lịch thành công',
        text: res?.message || 'Lịch đã được duyệt và nạp sang Google Sheets thành công!',
      });
      void loadAdminSchedules();
    } else {
      setInlineNotice({
        variant: 'error',
        title: 'Lỗi duyệt lịch',
        text: res?.message || 'Không thể lưu lịch làm.',
      });
    }
  };

  const handleManualSyncRoster = () => {
    setConfirmSyncRosterOpen(true);
  };

  const executeManualSyncRoster = async () => {
    setConfirmSyncRosterOpen(false);
    setIsSyncingRoster(true);
    store.setLoading(true, 'Đang đồng bộ sang Sheet Lịch Làm (1Vrm...)...');

    try {
      const res = await callApi('SYNC_ROSTER_SCHEDULES', {
        monthSheet: weekInfo.monthSheet,
        weekLabel: weekInfo.weekLabel,
        weekDatesKeys: weekInfo.weekDatesKeys,
        weekDates: weekInfo.weekDates,
        schedules: adminSchedules.length > 0 ? adminSchedules : undefined
      });

      store.setLoading(false);
      setIsSyncingRoster(false);

      if (res?.ok) {
        const msg = res?.message || res?.data?.message || 'Đồng bộ thành công sang Sheet Lịch Làm!';
        pushToast(msg, 'success');
        setInlineNotice({ variant: 'success', title: 'Đồng bộ thành công', text: msg });
      } else {
        setInlineNotice({
          variant: 'error',
          title: 'Lỗi đồng bộ',
          text: res?.message || 'Không thể đồng bộ sang Sheet Lịch Làm.',
        });
      }
    } catch (err: any) {
      store.setLoading(false);
      setIsSyncingRoster(false);
      setInlineNotice({
        variant: 'error',
        title: 'Lỗi kết nối',
        text: err?.message || 'Có lỗi xảy ra khi đồng bộ.',
      });
    }
  };

  const handleAiProcess = async () => {
    if (!aiInputText.trim()) return;
    setIsAiProcessing(true);
    
    try {
      const dateContext = [
        `T2 (${weekInfo.weekDates[0]})`, `T3 (${weekInfo.weekDates[1]})`, `T4 (${weekInfo.weekDates[2]})`,
        `T5 (${weekInfo.weekDates[3]})`, `T6 (${weekInfo.weekDates[4]})`, `T7 (${weekInfo.weekDates[5]})`,
        `CN (${weekInfo.weekDates[6]})`
      ].join(', ');

      const prompt = `
Bạn là trợ lý AI tự động sắp xếp lịch làm việc từ văn bản người dùng cung cấp.
Tuần đang xét bao gồm các ngày: ${dateContext}.
Danh sách nhân viên hợp lệ: ${users.map((u: any) => u.fullname).join(', ')}.
Danh sách ca hợp lệ: ${ADMIN_SHIFT_OPTIONS.join(', ')}.
Phân tích văn bản, với mỗi nhân viên xuất hiện, xếp lịch từ Thứ 2 đến Chủ nhật sao cho ĐÚNG VỚI NGÀY mà người dùng yêu cầu.
Quy tắc:
1. Nếu người dùng yêu cầu ca cho ngày cụ thể (ví dụ: ngày 01/05), hãy đối chiếu xem ngày đó là thứ mấy trong tuần (${dateContext}) và điền ca đúng vào vị trí thứ đó trong mảng "shifts".
2. Tuyệt đối không tự ý dồn ca vào các ngày đầu tuần nếu người dùng yêu cầu xếp cho cuối tuần hoặc ngày khác.
3. Nếu không nhắc đến ca của 1 ngày, để chuỗi rỗng "".
4. Nếu nhắc OFF hoặc nghỉ, điền "OFF".
5. Chỉ xuất MỘT chuỗi JSON hợp lệ, KHÔNG có markdown, KHÔNG giải thích.
Định dạng JSON yêu cầu:
{
  "schedules": [
    {
      "fullname": "Tên nhân viên chính xác",
      "shifts": ["ca T2", "ca T3", "ca T4", "ca T5", "ca T6", "ca T7", "ca CN"]
    }
  ]
}
Văn bản:
${aiInputText}
`;

      let content = '';
      const proxyRes = await callApi('AI_CHAT', {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }, { background: true, cacheTtlMs: 0 });

      if (proxyRes?.ok && (proxyRes.data?.reply || proxyRes.data?.content)) {
        content = proxyRes.data.reply || proxyRes.data.content;
      } else {
        const apiKey = store.groqKeys?.length
          ? store.groqKeys[Math.floor(Math.random() * store.groqKeys.length)].key
          : '';
        if (!apiKey) {
          throw new Error(proxyRes?.message || 'Chưa cấu hình Groq API key trên máy chủ');
        }
        const result = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1
          })
        });
        const resData = await result.json();
        content = resData.choices?.[0]?.message?.content || '';
      }
      
      content = content.trim();
      if (content.startsWith('```json')) content = content.substring(7);
      if (content.startsWith('```')) content = content.substring(3);
      if (content.endsWith('```')) content = content.substring(0, content.length - 3);
      content = content.trim();
      
      const parsed = JSON.parse(content);
      if (parsed.schedules && Array.isArray(parsed.schedules)) {
        const updated = [...adminSchedules];
        let matchedCount = 0;
        
        parsed.schedules.forEach((parsedEmp: any) => {
           const idx = updated.findIndex(e => e.fullname === parsedEmp.fullname);
           if (idx >= 0) {
              matchedCount++;
              const emp = { ...updated[idx], shifts: [...updated[idx].shifts] };
              for(let i=0; i<7; i++) {
                 if (parsedEmp.shifts[i]) emp.shifts[i] = parsedEmp.shifts[i];
              }
              
              const origEmp = originalAdminSchedules[idx];
              const changes: string[] = [];
              for (let i = 0; i < 7; i++) {
                if (emp.shifts[i] !== origEmp.shifts[i]) {
                  changes.push(`Ngày ${weekInfo.weekDates[i]} (${origEmp.shifts[i] || 'Chưa ĐK'} ⮕ ${emp.shifts[i]})`);
                }
              }
              emp.note = changes.length > 0 ? 'AI điền: ' + changes.join('; ') : '';
              updated[idx] = emp;
           }
        });
        
        store.setAdminSchedules(updated);
        pushToast(`Đã điền lịch AI cho ${matchedCount} nhân viên!`, 'success');
        setInlineNotice({
          variant: 'success',
          title: `Đã điền lịch cho ${matchedCount} nhân viên`,
          text: 'Vui lòng kiểm tra lại và bấm "Duyệt & Đồng bộ lịch làm" để lưu chính thức.',
        });
        setAiModalOpen(false);
        setAiInputText('');
      } else {
        throw new Error('Dữ liệu JSON không đúng định dạng');
      }
    } catch (err: any) {
      console.error(err);
      setInlineNotice({
        variant: 'error',
        title: 'Lỗi phân tích AI',
        text: 'Không thể phân tích dữ liệu, vui lòng kiểm tra lại văn bản đầu vào. Lỗi: ' + err.message,
      });
    } finally {
      setIsAiProcessing(false);
    }
  };

  if (currentUser && !isWorkEligible(currentUser)) {
    return <EmploymentStatusNotice user={currentUser} actionLabel="đăng ký hoặc cập nhật lịch làm" />;
  }

  return (
    <div className="p-4 animate-slide-up">
      <KgModuleHero
        moduleId="schedule"
        title={isManagerView ? 'Sắp Xếp Ca Làm' : 'Đăng Ký Ca Làm'}
        description={isManagerView ? 'Duyệt và sắp xếp ca làm việc cho toàn bộ nhân sự.' : `Đăng ký lịch làm ca tuần ${weekInfo.weekDisplay}.`}
        eyebrow={isManagerView ? "Quản lý" : "Nhân sự"}
        tipTitle={isManagerView ? "Hướng dẫn Sắp xếp Ca làm" : "Quy định Đăng ký Ca làm"}
        tips={
          isManagerView
            ? [
                "Kiểm tra quân số từng ca (Sáng, Chiều, Tối) so với định biên tối thiểu của nhà hàng.",
                "Sử dụng công cụ 'Xếp ca AI' để tự động lấp đầy các vị trí trống còn thiếu.",
                "Sau khi điều chỉnh xong, bấm 'Xác nhận lịch tuần' để công bố cho toàn bộ nhân viên."
              ]
            : [
                "Hạn chót đăng ký lịch làm: Trước 17:00 Thứ 7 hàng tuần.",
                "Đăng ký tối thiểu theo hợp đồng (thường 4-6 ca/tuần tùy vị trí Part-time hay Full-time).",
                "Nếu cần xin nghỉ hoặc bận đột xuất, hãy chọn 'Off' và ghi chú lý do rõ ràng.",
                "Sau khi Quản lý đã chốt lịch, việc thay đổi phải thực hiện qua mục 'Bảng tin đổi ca'."
              ]
        }
        actions={
          !isManagerView && returnTab === 'checkin' && isRegisteredForTargetWeek ? (
            <KgButton size="sm" variant="primary" icon={ChevronLeft} onClick={handleReturnToCheckIn}>
              Quay lại Chấm công
            </KgButton>
          ) : !isManagerView && (!isOpen || scheduleStatus === 'approved') ? (
            <KgButton size="sm" variant="secondary" icon={ArrowLeftRight} onClick={handleGoToSwap}>
              Đổi ca
            </KgButton>
          ) : undefined
        }
      />

      {inlineNotice && (
        <div className="mb-4">
          <KgAlertCard variant={inlineNotice.variant} title={inlineNotice.title}>
            <p>{inlineNotice.text}</p>
            {inlineNotice.details && inlineNotice.details.length > 0 && (
              <ul className="list-disc list-inside mt-1.5 space-y-0.5 text-xs">
                {inlineNotice.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </KgAlertCard>
        </div>
      )}

      {/* Toggle Mode & Time Navigation for Admin */}
        {isManagerView && (
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center mb-5 relative z-10 gap-2.5 w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] p-2 rounded-2xl shadow-xs">
            <div className="flex items-center gap-1 bg-[var(--kg-surface-soft)] p-1 rounded-xl border border-[var(--kg-border)]/60 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`flex-1 sm:flex-initial min-h-[44px] min-w-[44px] lg:min-h-[38px] flex items-center justify-center px-4 py-2 rounded-lg text-xs sm:text-sm font-black transition-all touch-manipulation ${viewMode === 'week' ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] shadow-xs' : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'}`}
              >
                <CalendarRange size={15} className="mr-1.5 flex-shrink-0" /> Tuần
              </button>
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`flex-1 sm:flex-initial min-h-[44px] min-w-[44px] lg:min-h-[38px] flex items-center justify-center px-4 py-2 rounded-lg text-xs sm:text-sm font-black transition-all touch-manipulation ${viewMode === 'month' ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] shadow-xs' : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'}`}
              >
                <LayoutGrid size={15} className="mr-1.5 flex-shrink-0" /> Tháng
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-[var(--kg-surface-soft)] rounded-xl p-1 border border-[var(--kg-border)] w-full sm:w-auto justify-between sm:justify-start">
              <button
                type="button"
                aria-label="Kỳ trước"
                onClick={() => (viewMode === 'week' ? changeWeek(-1) : changeMonth(-1))}
                className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center hover:bg-[var(--kg-surface)] hover:text-[var(--kg-text)] rounded-lg transition-all text-[var(--kg-text-muted)] touch-manipulation"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-xs sm:text-sm font-black font-mono tabular-nums px-2 min-w-[140px] text-center text-[var(--kg-text)]">
                {viewMode === 'week' ? weekInfo.weekDisplay : `Tháng ${selectedMonth}/${selectedYear}`}
              </div>
              <button
                type="button"
                aria-label="Kỳ tiếp theo"
                onClick={() => (viewMode === 'week' ? changeWeek(1) : changeMonth(1))}
                className="min-w-[44px] min-h-[44px] lg:min-w-[38px] lg:min-h-[38px] flex items-center justify-center hover:bg-[var(--kg-surface)] hover:text-[var(--kg-text)] rounded-lg transition-all text-[var(--kg-text-muted)] touch-manipulation"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        <div className="calendar-highlight-legend mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold text-[var(--kg-text-muted)]">
          <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[var(--kg-danger)]" /> Lễ/Tết Việt Nam</span>
          <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[var(--kg-accent)]" /> Cao điểm F&amp;B</span>
          <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[var(--kg-warning)]" /> T6 · T7 · CN</span>
        </div>

      {isManagerView ? (
        // ================= ADMIN VIEW =================
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] shadow-xs p-4 sm:p-5 rounded-2xl animate-fade-in">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4 border-b border-[var(--kg-border)] pb-3">
            <h3 className="font-bold flex items-center text-[var(--kg-text)]">
              <CalendarCheck size={18} className="mr-2 text-[var(--kg-primary)]" /> Quản Lý Lịch Làm Việc Tuần Tới
            </h3>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {viewMode === 'week' && (
                <button
                  type="button"
                  onClick={handleAdminCopyPreviousWeek}
                  className="flex-1 sm:flex-initial justify-center whitespace-nowrap min-h-[44px] sm:min-h-[38px] text-xs sm:text-sm bg-[var(--kg-accent-soft)] text-[var(--kg-primary)] border border-[var(--kg-primary)]/25 px-3 py-1.5 rounded-xl hover:opacity-90 transition flex items-center font-bold touch-manipulation"
                  title="Sao chép nhanh lịch làm từ tuần liền trước"
                >
                  <Copy size={14} className="mr-1.5 flex-shrink-0" /> Sao chép tuần trước
                </button>
              )}
              <button
                type="button"
                onClick={handleManualSyncRoster}
                disabled={isSyncingRoster}
                className="flex-1 sm:flex-initial justify-center whitespace-nowrap min-h-[44px] sm:min-h-[38px] text-xs sm:text-sm bg-[var(--kg-success-soft)] text-[var(--kg-success)] border border-[var(--kg-success)]/25 px-3 py-1.5 rounded-xl hover:opacity-90 transition flex items-center font-bold disabled:opacity-50 touch-manipulation"
                title="Đồng bộ lịch tuần này sang Google Sheet Lịch Làm (1Vrm...)"
              >
                <FileSpreadsheet size={14} className={`mr-1.5 flex-shrink-0 ${isSyncingRoster ? 'animate-spin' : ''}`} /> Đồng bộ Sheet Lịch
              </button>
              <button
                type="button"
                onClick={() => (viewMode === 'week' ? loadAdminSchedules() : loadMonthSchedules())}
                className="flex-1 sm:flex-initial justify-center whitespace-nowrap min-h-[44px] sm:min-h-[38px] text-xs sm:text-sm bg-[var(--kg-primary-soft)] text-[var(--kg-primary)] border border-[var(--kg-primary)]/20 px-3 py-1.5 rounded-xl hover:opacity-90 transition flex items-center font-bold touch-manipulation"
              >
                <RefreshCw size={14} className="mr-1.5 flex-shrink-0" /> Tải lịch
              </button>
            </div>
          </div>

          <div className="md:hidden mb-3 p-3 bg-[var(--kg-info-soft)] rounded-xl border border-[var(--kg-info)]/25 flex items-start space-x-3 text-[var(--kg-info)]">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div className="text-xs font-semibold text-[var(--kg-text)]">
              Lịch tuần đã được thu gọn đủ 7 ngày. Chạm vào từng ô để điều chỉnh ca làm.
            </div>
          </div>

          {viewMode === 'week' ? (
            adminSchedules.length > 0 ? (
            <>
              <div className="schedule-week-table-wrap overflow-x-auto w-full bg-[var(--kg-surface)] rounded-2xl border border-[var(--kg-border)] mb-4 pb-4 md:pb-16 custom-scrollbar">
                <table className="schedule-week-table w-full text-xs sm:text-sm text-left md:whitespace-nowrap">
                  <thead className="text-[10px] sm:text-xs text-[var(--kg-text-muted)] uppercase bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)]">
                    <tr>
                      <th className="schedule-employee-header px-3.5 py-3 md:sticky md:left-0 md:w-[156px] md:min-w-[156px] bg-[var(--kg-surface-soft)] z-20 font-black border-r border-[var(--kg-border)]">Nhân Viên</th>
                      {SHORT_DAY_NAMES.map((d, idx) => (
                        <th
                          key={d}
                          className={`schedule-day-header px-2 py-3 text-center border-r border-[var(--kg-border)] md:min-w-[96px] ${weekDayMeta[idx].className}`}
                          title={weekDayMeta[idx].label || undefined}
                        >
                          <div className="hidden md:block font-black text-[13px]">{weekInfo.weekDates[idx]}</div>
                          <div className="md:hidden font-black text-[11px]">{weekInfo.weekDates[idx]?.split('/')[0]}</div>
                          <div className="text-[9px] font-bold opacity-75 mt-0.5">{d}</div>
                        </th>
                      ))}
                      <th className="hidden md:table-cell md:min-w-[150px] px-4 py-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminSchedules.map((emp, empIdx) => {
                      const origShifts = originalAdminSchedules[empIdx]?.shifts || [];
                      const hasRegistered = emp.isRegistered;
                      
                      return (
                      <tr key={empIdx} className="border-b border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]/50 transition-colors">
                        <td className="schedule-employee-cell px-3 py-2 md:sticky md:left-0 md:w-[156px] md:min-w-[156px] bg-[var(--kg-surface)] z-10 font-bold text-[var(--kg-text)] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] border-r border-[var(--kg-border)]">
                          <button
                            type="button"
                            onClick={() =>
                              setInspectEmpSheet({
                                fullname: emp.fullname,
                                origShifts,
                                reason: emp.reason,
                                note: emp.note,
                                hasRegistered: Boolean(hasRegistered),
                              })
                            }
                            className="w-full min-h-[36px] flex items-center justify-between gap-1.5 text-left rounded-lg px-1 py-0.5 hover:bg-[var(--kg-surface-soft)] transition-colors touch-manipulation"
                            aria-label={`Xem đăng ký gốc của ${emp.fullname}`}
                          >
                            <div className="flex items-center min-w-0 gap-1.5">
                              <SmartPersonName fullname={emp.fullname} asSpan className="schedule-employee-name max-w-[130px]" />
                              {hasRegistered && (
                                <span
                                  className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"
                                  aria-label="Đã đăng ký ca"
                                />
                              )}
                            </div>
                            {(hasRegistered || emp.reason || emp.note) && (
                              <Info size={13} className="text-[var(--kg-text-muted)] flex-shrink-0" />
                            )}
                          </button>
                        </td>
                        {emp.shifts.map((shift: string, dayIdx: number) => {
                          const isChanged = originalAdminSchedules[empIdx]?.shifts[dayIdx] !== shift;
                          const hasNote = emp.shiftNotes && emp.shiftNotes[dayIdx];
                          const tooltipText = isChanged 
                            ? `Sửa từ ${originalAdminSchedules[empIdx]?.shifts[dayIdx] || 'Chưa ĐK'}` 
                            : (hasNote && emp.shiftNotes ? emp.shiftNotes[dayIdx] : '');
                            
                          return (
                            <td
                              key={dayIdx}
                              className={`schedule-shift-cell px-1 md:px-1.5 py-2 relative border-r dark:border-gray-700 md:min-w-[96px] ${weekDayMeta[dayIdx].className}`}
                              title={weekDayMeta[dayIdx].label || tooltipText || undefined}
                            >
                              {isChanged && <div className="absolute top-0 right-0 w-2 h-2 bg-orange-500 rounded-full animate-pulse" title="Đã thay đổi"></div>}
                              {!isChanged && hasNote && <div className="absolute top-0 right-0 w-2 h-2 bg-[var(--kg-primary)] rounded-full" title={tooltipText}></div>}
                              <div className="relative" title={tooltipText}>
                                <select
                                  value={shift || ''}
                                  onChange={(e) => updateAdminShift(empIdx, dayIdx, e.target.value)}
                                  aria-label={`${emp.fullname} - ${SHORT_DAY_NAMES[dayIdx]}`}
                                  className={`schedule-shift-select schedule-shift-select--mobile text-[10px] md:text-xs font-bold rounded-lg border focus:outline-none md:px-2 md:py-1.5 w-full md:min-w-[84px] cursor-pointer appearance-none text-center transition-all ${
                                    isChanged
                                      ? 'border-orange-500 ring-1 md:ring-2 ring-orange-200 dark:ring-orange-900/50 shadow-sm ' + getAdminShiftClass(shift)
                                      : 'border-[var(--kg-border)] focus:ring-1 md:focus:ring-2 focus:ring-[var(--kg-primary)] ' + getAdminShiftClass(shift)
                                  }`}
                                >
                                  <option value="" className="bg-[var(--kg-surface)] text-[var(--kg-text)]">
                                    {isMobileViewport ? '—' : '(Trống)'}
                                  </option>
                                  {ADMIN_SHIFT_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt} className="bg-[var(--kg-surface)] text-[var(--kg-text)]">
                                      {isMobileViewport ? formatMobileShift(opt) : opt}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                          );
                        })}
                        <td className="hidden md:table-cell px-4 py-3 text-xs text-red-500 max-w-[200px] truncate" title={emp.reason || emp.note || ''}>
                          {!emp.hasApproved ? emp.reason : <span className="text-gray-500 font-medium italic">{emp.note}</span>}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-end gap-2.5 mb-2">
                <button
                  type="button"
                  onClick={() => setAiModalOpen(true)}
                  className="w-full sm:w-auto px-4 lg:px-5 min-h-[46px] sm:min-h-[42px] bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] font-black py-2.5 rounded-xl shadow-sm transition transform active:scale-98 flex items-center justify-center touch-manipulation text-xs sm:text-sm tracking-wider uppercase whitespace-nowrap"
                >
                  <Bot size={17} className="mr-2 flex-shrink-0" /> XẾP CA BẰNG AI
                </button>
                <button
                  type="button"
                  onClick={approveAllSchedules}
                  className="w-full sm:w-auto px-5 lg:px-6 min-h-[46px] sm:min-h-[42px] bg-[var(--kg-success)] hover:brightness-95 text-white dark:text-[#0D1015] font-black py-2.5 rounded-xl shadow-sm transition transform active:scale-98 flex items-center justify-center touch-manipulation text-xs sm:text-sm tracking-wider uppercase whitespace-nowrap"
                >
                  <CheckCheck size={17} className="mr-2 flex-shrink-0" /> DUYỆT &amp; ĐỒNG BỘ LỊCH LÀM
                </button>
              </div>
            </>
            ) : (
              <div className="text-center py-6 text-[var(--kg-text-muted)] bg-[var(--kg-surface-soft)] rounded-xl border border-dashed border-[var(--kg-border)]">
                <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Bấm &quot;Tải lịch&quot; để xem danh sách tuần tới</p>
              </div>
            )
          ) : (
            monthData && monthData.length > 0 ? (
              <ShiftMonthMatrix
                mode="editable"
                monthDates={monthDates}
                visibleDates={visibleMonthDates}
                visibleKeys={visibleMonthDateKeys}
                onVisibleKeysChange={setVisibleMonthDateKeys}
                users={filteredUsers}
                monthData={monthData}
                empMonthMap={empMonthMap}
                onShiftChange={(empFullname, mDate, val) => void updateSingleMonthShift(empFullname, mDate, val)}
                searchQuery={empSearchQuery}
                onSearchQueryChange={setEmpSearchQuery}
                totalUserCount={users.length}
              />
            ) : (
              <div className="text-center py-6 text-[var(--kg-text-muted)] bg-[var(--kg-surface-soft)] rounded-xl border border-dashed border-[var(--kg-border)]">
                <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Bấm &quot;Tải lịch&quot; để xem danh sách tháng {selectedMonth}</p>
              </div>
            )
          )}
        </div>
      ) : (
        // ================= USER VIEW =================
        <>
          {/* Unified My-Week Card (merges status banner, approved shifts, and registered shifts) */}
          {(isRegisteredForTargetWeek || (approvedShifts && approvedShifts.length > 0)) && (
            <div
              data-testid="schedule-registered-banner"
              className={`rounded-2xl p-4 sm:p-5 mb-6 border shadow-xs animate-fade-in bg-[var(--kg-surface)] ${
                scheduleStatus === 'approved'
                  ? 'border-[var(--kg-success)]/45'
                  : 'border-[var(--kg-border)]'
              }`}
            >
              {/* Header: Week Title + Sync & Approval Status */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3.5 border-b border-[var(--kg-border)]">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                      scheduleStatus === 'approved'
                        ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/30'
                        : 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border-[var(--kg-primary)]/25'
                    }`}
                  >
                    {scheduleStatus === 'approved' ? <CalendarCheck size={20} /> : <CheckCircle2 size={20} />}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[var(--kg-success)] text-white dark:text-[#0D1015]">
                        <ShieldCheck size={10} /> {scheduleStatus === 'approved' ? 'Lịch đã duyệt' : 'Đã ghi nhớ tuần tới'}
                      </span>
                      <span className="text-[11px] font-bold text-[var(--kg-text-muted)] font-mono tabular-nums">
                        {weekInfo.monthSheet}
                      </span>
                    </div>
                    <h4 className="font-black text-[var(--kg-text)] text-sm sm:text-base leading-snug">
                      Lịch tuần <span className="font-mono tabular-nums">{weekInfo.weekDisplay}</span>
                    </h4>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--kg-text-muted)] font-medium">
                      <Clock size={12} className="text-[var(--kg-primary-ink)] flex-shrink-0" />
                      <span>Cập nhật:</span>
                      <b
                        data-testid="schedule-updated-at"
                        className="font-mono tabular-nums whitespace-nowrap font-extrabold text-[var(--kg-text)] bg-[var(--kg-surface-soft)] px-2 py-0.5 rounded-md border border-[var(--kg-border)]"
                      >
                        {effectiveUpdatedAt || 'Đã lưu trên Bảng Chấm Công'}
                      </b>
                    </div>
                  </div>
                </div>

                {/* Status & Sync Pills */}
                <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1.5 flex-shrink-0">
                  {effectiveSheetSynced ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-[var(--kg-success-soft)] text-[var(--kg-success)] border border-[var(--kg-success)]/25">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-success)]" />
                      Đã nạp 100% vào Sheet
                    </span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/30">
                        <RefreshCw size={11} className="animate-spin" />
                        Đang đồng bộ...
                      </span>
                      <button
                        type="button"
                        disabled={isSyncingPendingSheet}
                        onClick={() => syncPendingScheduleToSheet(false)}
                        className="min-h-[44px] sm:min-h-[36px] px-3 py-1 rounded-xl text-[11px] font-black bg-[var(--kg-warning)] text-white dark:text-[#1A1613] transition active:scale-95 disabled:opacity-60 touch-manipulation"
                      >
                        Đồng bộ ngay
                      </button>
                    </div>
                  )}

                  {scheduleStatus === 'approved' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-[var(--kg-success-soft)] text-[var(--kg-success)] border border-[var(--kg-success)]/30">
                      <CalendarCheck size={12} /> Đã duyệt ✓
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/30">
                      <Clock size={12} /> Chờ Admin duyệt
                    </span>
                  )}
                </div>
              </div>

              {/* 7-Day Shift Grid (shown when not actively editing) */}
              {!isEditing && (
                <div className="pt-4 space-y-3.5">
                  {approvedShifts && approvedShifts.length > 0 ? (
                    <>
                      <div className="grid grid-cols-7 gap-1 sm:gap-1.5 min-w-0">
                        {SHORT_DAY_NAMES.map((shortDayName, i) => {
                          const approved = approvedShifts[i] || 'OFF';
                          const registered = effectiveRegisteredShifts?.[i];
                          const isChanged = Boolean(registered && approved !== registered);
                          return (
                            <div
                              key={i}
                              className={`calendar-preview-day min-w-0 flex flex-col items-center rounded-xl px-0.5 py-1.5 ${weekDayMeta[i].className}`}
                              title={weekDayMeta[i].label || undefined}
                            >
                              <span className="text-[10px] sm:text-[11px] font-mono tabular-nums font-extrabold text-[var(--kg-text)] truncate max-w-full">
                                {weekInfo.weekDates[i]?.split('/')[0]}/{weekInfo.weekDates[i]?.split('/')[1]}
                              </span>
                              <span className="text-[9px] text-[var(--kg-text-muted)] font-bold mb-1 uppercase">
                                {shortDayName}
                              </span>
                              <div
                                className={`w-full min-w-0 text-center py-1.5 sm:py-2 px-0.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black tracking-tight transition-all shadow-xs overflow-hidden ${getPreviewShiftClass(approved)} ${
                                  isChanged ? 'ring-2 ring-[var(--kg-warning)] ring-offset-1' : ''
                                }`}
                              >
                                <ResponsiveShift shift={approved} />
                              </div>
                              {isChanged && (
                                <span className="text-[8.5px] text-[var(--kg-warning)] font-bold mt-0.5">
                                  Đã đổi
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {effectiveRegisteredShifts && (
                        <div>
                          <button
                            type="button"
                            onClick={() => setShowRegisteredCompare((v) => !v)}
                            className="min-h-[36px] text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] inline-flex items-center gap-1.5 touch-manipulation"
                          >
                            <Eye size={13} />
                            <span>
                              {showRegisteredCompare ? 'Ẩn ca đăng ký ban đầu' : 'So sánh ca đăng ký ban đầu'}
                            </span>
                            <ChevronDown
                              size={13}
                              className={`transition-transform ${showRegisteredCompare ? 'rotate-180' : ''}`}
                            />
                          </button>
                          {showRegisteredCompare && (
                            <div className="mt-2 pt-2 border-t border-dashed border-[var(--kg-border)]">
                              {renderShiftGrid((i) => effectiveRegisteredShifts[i] || 'OFF')}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    renderShiftGrid(
                      (i) => effectiveRegisteredShifts?.[i] || shiftData[weekInfo.weekDatesKeys[i]] || 'OFF',
                    )
                  )}

                  {/* Compact BQL Acknowledgment Note */}
                  <div className="p-3 rounded-xl bg-[var(--kg-info-soft)] border border-[var(--kg-info)]/25 text-xs text-[var(--kg-text)] leading-relaxed flex items-start gap-2.5">
                    <Info size={16} className="text-[var(--kg-info)] mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] sm:text-xs text-[var(--kg-text-muted)] font-medium">
                      {scheduleStatus === 'approved'
                        ? 'Admin đã phê duyệt lịch tuần tới của bạn. Nếu cần điều chỉnh ca, hãy tạo yêu cầu tại mục Đổi ca.'
                        : 'Lịch đăng ký đã được ghi nhận. BQL sẽ sắp xếp phù hợp nhu cầu nhà hàng — nếu trùng lịch học/thi quan trọng hãy gửi lịch báo BQL duyệt nhé!'}
                    </p>
                  </div>

                  {/* Unified Action Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
                    {returnTab === 'checkin' && (
                      <button
                        type="button"
                        onClick={handleReturnToCheckIn}
                        className="w-full sm:w-auto min-h-[44px] sm:min-h-[40px] bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 px-5 rounded-xl shadow-xs transition-all active:scale-98 flex items-center justify-center touch-manipulation text-xs sm:text-sm tracking-wide uppercase whitespace-nowrap"
                      >
                        <ChevronLeft size={16} className="mr-1.5 flex-shrink-0" /> Quay lại Chấm công
                      </button>
                    )}
                    {isOpen && (
                      <button
                        type="button"
                        onClick={startEditing}
                        className="w-full sm:w-auto min-h-[44px] sm:min-h-[40px] bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] font-black py-2.5 px-5 rounded-xl shadow-xs transition-all active:scale-98 flex items-center justify-center touch-manipulation text-xs sm:text-sm tracking-wide uppercase whitespace-nowrap"
                      >
                        <Pencil size={15} className="mr-2 flex-shrink-0" /> Chỉnh sửa đăng ký ca
                      </button>
                    )}
                    {(!isOpen || scheduleStatus === 'approved') && (
                      <button
                        type="button"
                        onClick={handleGoToSwap}
                        className="w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-5 py-2.5 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]/25 text-xs sm:text-sm font-black inline-flex items-center justify-center gap-1.5 hover:bg-[var(--kg-primary)] hover:text-[var(--kg-primary-fg)] transition-colors touch-manipulation whitespace-nowrap"
                      >
                        <ArrowLeftRight size={14} />
                        <span>Đổi ca</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

      {/* === CLOSED WINDOW (not registered) === */}
      {!isOpen && !isRegisteredForTargetWeek && (
        <>
          <div className="bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-[var(--kg-danger)]/15 text-[var(--kg-danger)] rounded-full flex items-center justify-center flex-shrink-0">
                <Lock size={20} />
              </div>
              <div>
                <h4 className="font-bold text-[var(--kg-danger)] text-sm">Đã đóng đăng ký</h4>
                <p className="text-xs text-[var(--kg-text-muted)]">{regWindow.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGoToSwap}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-xs font-black inline-flex items-center justify-center gap-1.5 shrink-0 touch-manipulation"
            >
              <ArrowLeftRight size={14} />
              <span>Đổi ca</span>
            </button>
          </div>
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-6 text-center mb-6">
            <AlertTriangle size={32} className="mx-auto text-[var(--kg-text-soft)] mb-3" />
            <p className="text-sm text-[var(--kg-text-muted)]">Bạn chưa đăng ký ca cho tuần tới.</p>
            <p className="text-xs text-[var(--kg-text-soft)] mt-1">Vui lòng đăng ký khi mở đăng ký vào Thứ Hai.</p>
          </div>
        </>
      )}

      {/* === CLOSED WINDOW (registered - already shown pending status above, no error needed) === */}

      {/* === REGISTRATION FORM (new registration or editing) === */}
      {showRegistrationForm && (() => {
        const workShiftOptions = SHIFT_OPTIONS.filter((s) => s !== 'OFF');
        const selectedWorkCount = weekInfo.weekDatesKeys.filter(
          (k) => (shiftData[k] || 'OFF') !== 'OFF'
        ).length;
        const selectedOffCount = 7 - selectedWorkCount;
        const needsOffReason = hasWeekendOff || hasConsecutiveOffs || hasHolidayOff;

        return (
        <>
          {/* Sticky Collapsible 7-Day Preview Summary */}
          <div className="sticky top-2 z-20 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3 mb-4 shadow-md">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPreviewExpanded((v) => !v)}
                aria-expanded={previewExpanded}
                className="min-h-[44px] sm:min-h-[34px] flex-1 min-w-0 flex items-center gap-2 text-left touch-manipulation"
              >
                <Eye size={15} className="text-[var(--kg-primary-ink)] shrink-0" />
                <span className="text-xs font-black text-[var(--kg-text)] uppercase tracking-wider shrink-0">
                  Xem trước 7 ngày
                </span>
                {!previewExpanded && (
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
                    {SHORT_DAY_NAMES.map((day, idx) => {
                      const s = shiftData[weekInfo.weekDatesKeys[idx]] || 'OFF';
                      return (
                        <span
                          key={day}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold shrink-0 ${
                            s === 'OFF'
                              ? 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-soft)]'
                              : 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)]'
                          }`}
                        >
                          {day}:{s === 'OFF' ? 'OFF' : formatMobileShift(s)}
                        </span>
                      );
                    })}
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => setPreviewExpanded((v) => !v)}
                aria-expanded={previewExpanded}
                aria-label={previewExpanded ? 'Thu gọn bản xem trước' : 'Mở rộng bản xem trước'}
                className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] px-2 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text-muted)] flex items-center justify-center shrink-0 touch-manipulation"
              >
                <ChevronDown size={16} className={`transition-transform duration-150 ${previewExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>
            {previewExpanded && (
              <div className="mt-3 pt-3 border-t border-[var(--kg-border)]">
                {renderShiftGrid((i) => shiftData[weekInfo.weekDatesKeys[i]] || 'OFF')}
              </div>
            )}
          </div>

          {/* Quick Actions Bar + Selected Count */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3.5 sm:px-4 sm:py-3 shadow-xs">
            <div className="flex items-center justify-between sm:justify-start gap-2.5">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-[var(--kg-text)]">
                  Tuần làm việc sắp tới
                </h3>
                <p className="text-[11px] text-[var(--kg-text-muted)]">
                  Chạm vào giờ ca hoặc nút OFF để đổi lựa chọn
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-[var(--kg-success-soft)] text-[var(--kg-success)] text-xs font-extrabold font-mono tabular-nums whitespace-nowrap">
                {selectedWorkCount} ca đã chọn
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyMondayShift}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3 py-2 rounded-xl text-xs font-extrabold bg-[var(--kg-surface-2)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:border-[var(--kg-primary)] hover:text-[var(--kg-primary-ink)] transition-all active:scale-95 touch-manipulation whitespace-nowrap"
              >
                <Copy size={14} /> Sao chép ca T2
              </button>
              <button
                type="button"
                onClick={handleCopyEmployeeCurrentWeek}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[36px] px-3 py-2 rounded-xl text-xs font-extrabold bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]/25 hover:bg-[var(--kg-primary)] hover:text-[var(--kg-primary-fg)] transition-all active:scale-95 touch-manipulation whitespace-nowrap"
              >
                <Copy size={14} /> Sao chép lịch tuần này
              </button>
            </div>
          </div>

          {/* Editing banner */}
          {isEditing && (
            <div className="bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/30 rounded-2xl p-3 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <Pencil size={14} className="text-[var(--kg-warning)] mr-2" />
                <span className="text-sm font-semibold text-[var(--kg-warning)]">Đang chỉnh sửa đăng ký</span>
              </div>
              <button type="button" onClick={cancelEditing}
                className="min-h-[44px] sm:min-h-[34px] text-xs font-bold text-[var(--kg-text)] bg-[var(--kg-surface)] border border-[var(--kg-border)] px-3 py-1.5 rounded-lg hover:bg-[var(--kg-surface-soft)] transition touch-manipulation">
                Hủy
              </button>
            </div>
          )}

          {/* Toast Touch 1-Tap Shift Chip Cards: 1-col Mobile, 2-col Laptop/Desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-3.5 mb-5">
            {SHORT_DAY_NAMES.map((shortDayName, index) => {
              const key = weekInfo.weekDatesKeys[index];
              const currentShift = shiftData[key] || 'OFF';
              const isPeak = index >= 4 || weekDayMeta[index].kind !== 'normal';
              const isOff = currentShift === 'OFF';

              return (
                <section
                  key={index}
                  className={`calendar-registration-day bg-[var(--kg-surface)] border shadow-xs p-3.5 sm:p-4 rounded-2xl transition hover:border-[var(--kg-border-strong)] ${
                    isPeak ? 'border-[var(--kg-accent)]/55' : 'border-[var(--kg-border)]'
                  } ${weekDayMeta[index].className}`}
                  title={weekDayMeta[index].label || undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4
                          className={`text-sm font-extrabold font-mono tabular-nums ${
                            isPeak ? 'text-[var(--kg-primary-ink)]' : 'text-[var(--kg-text)]'
                          }`}
                        >
                          {shortDayName} · {weekInfo.weekDates[index]}
                        </h4>
                        {weekDayMeta[index].kind !== 'normal' && (
                          <span className="calendar-day-label text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {weekDayMeta[index].kind === 'holiday'
                              ? 'Lễ/Tết'
                              : weekDayMeta[index].kind === 'fnb'
                                ? 'Cao điểm F&B'
                                : 'Cuối tuần'}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5">
                        {isPeak ? 'Cao điểm cuối tuần / lễ' : 'Ngày trong tuần'}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold font-mono tabular-nums shrink-0 ${
                        isOff
                          ? 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                          : 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                      }`}
                    >
                      {currentShift}
                    </span>
                  </div>

                  {/* 5 Working Shift Chips + Full-Width OFF Button */}
                  <div className="grid grid-cols-5 gap-1.5 mt-3">
                    {workShiftOptions.map((shift) => {
                      const active = currentShift === shift;
                      return (
                        <button
                          key={shift}
                          type="button"
                          aria-pressed={active}
                          onClick={() => handleShiftChange(key, shift)}
                          className={`kg-shift-chip ${active ? 'kg-shift-chip--active' : ''} !min-w-0 !px-1 min-h-[44px] font-mono tabular-nums text-xs font-extrabold flex items-center justify-center touch-manipulation`}
                        >
                          {shift}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    aria-pressed={isOff}
                    onClick={() => handleShiftChange(key, 'OFF')}
                    className={`kg-shift-chip ${isOff ? 'kg-shift-chip--off' : ''} w-full mt-2 min-h-[44px] text-xs font-extrabold flex items-center justify-center touch-manipulation`}
                  >
                    OFF
                  </button>
                </section>
              );
            })}
          </div>

          {/* 2-Column Split: OFF Justification + Weekly Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5 items-start">
            <div
              className={`bg-[var(--kg-surface)] border rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 ${
                needsOffReason ? 'border-[var(--kg-danger)]/40' : 'border-[var(--kg-border)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-extrabold text-sm text-[var(--kg-text)]">
                  Giải trình ngày OFF
                </h4>
                <span
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold ${
                    needsOffReason
                      ? 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                      : 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                  }`}
                >
                  {needsOffReason ? 'Cần lý do' : 'Không bắt buộc'}
                </span>
              </div>

              {needsOffReason ? (
                <div className="bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/30 p-3 rounded-xl text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-[var(--kg-warning)] mt-0.5 shrink-0" />
                    <ul className="text-[var(--kg-text)] list-disc list-inside space-y-0.5 font-medium">
                      {hasConsecutiveOffs && <li>Bạn đang chọn OFF từ 2 ngày liên tiếp trở lên.</li>}
                      {hasWeekendOff && <li>Bạn đang chọn OFF vào ngày cuối tuần (T6, T7 hoặc CN).</li>}
                      {hasHolidayOff && <li>Bạn đang chọn OFF vào ngày Lễ/Tết cao điểm.</li>}
                    </ul>
                  </div>
                  <p className="text-[11px] text-[var(--kg-text-muted)]">
                    Nhập lý do bên dưới và gửi hình ảnh minh chứng vào nhóm Zalo lịch làm:
                  </p>
                  <a
                    href="https://zalo.me/g/zkowlm391"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-[var(--kg-primary-ink)] bg-[var(--kg-surface)] border border-[var(--kg-border)] px-2.5 py-1.5 rounded-lg hover:underline font-bold"
                  >
                    <ExternalLink size={12} className="mr-1.5" /> Mở nhóm Zalo lịch làm
                  </a>
                </div>
              ) : (
                <p className="text-xs text-[var(--kg-text-muted)] bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl p-3">
                  OFF cuối tuần (T6–CN), ngày Lễ/Tết hoặc OFF từ 2 ngày liên tiếp phải nhập lý do để quản lý duyệt.
                </p>
              )}

              <div>
                <label htmlFor="schedule-off-reason" className="block text-xs font-bold text-[var(--kg-text)] mb-1.5">
                  Lý do xin nghỉ {needsOffReason && <span className="text-[var(--kg-danger)]">*</span>}
                </label>
                <textarea
                  id="schedule-off-reason"
                  value={offReason}
                  onChange={(e) => store.setOffReason(e.target.value)}
                  required={needsOffReason}
                  className="w-full bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] rounded-xl p-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)]"
                  rows={3}
                  placeholder="Ví dụ: Việc gia đình, lịch học/thi, đã bàn giao..."
                />
              </div>
            </div>

            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
              <h4 className="font-extrabold text-sm text-[var(--kg-text)]">Tổng quan tuần</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] p-3.5">
                  <div className="flex items-center justify-between text-xs text-[var(--kg-text-muted)] font-semibold">
                    <span>Ca làm</span>
                    <Briefcase size={15} className="text-[var(--kg-primary-ink)]" />
                  </div>
                  <div className="mt-1.5 text-2xl font-black font-mono tabular-nums text-[var(--kg-text)]">
                    {selectedWorkCount}
                  </div>
                  <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5">Trong 7 ngày</p>
                </div>
                <div className="rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] p-3.5">
                  <div className="flex items-center justify-between text-xs text-[var(--kg-text-muted)] font-semibold">
                    <span>Ngày OFF</span>
                    <Calendar size={15} className="text-[var(--kg-warning)]" />
                  </div>
                  <div className="mt-1.5 text-2xl font-black font-mono tabular-nums text-[var(--kg-text)]">
                    {selectedOffCount}
                  </div>
                  <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5">
                    {needsOffReason ? 'Cần giải trình' : 'Hợp lệ'}
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] p-3 text-xs text-[var(--kg-text-muted)] leading-relaxed">
                Cổng đăng ký chính thức: <b className="text-[var(--kg-text)] font-mono tabular-nums">T2 00:00 – T7 16:59</b>. Từ T5 đến trước 17:00 T7, lịch chưa đăng ký có thể chặn chấm công theo chính sách hiện hữu.
              </div>
            </div>
          </div>

          {/* Submit Action Bar: Full-width on Mobile, balanced right-aligned CTA on Tablet/Desktop */}
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <p className="text-center sm:text-left text-xs font-semibold text-[var(--kg-text-muted)]">
              {isRegisteredForTargetWeek
                ? 'Bạn có thể cập nhật lịch không giới hạn trong thời gian mở đăng ký.'
                : 'Hạn đăng ký: Trước 17:00 Thứ Bảy hàng tuần.'}
            </p>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={submitRegistration}
              className="w-full sm:w-auto sm:min-w-[230px] px-6 min-h-[48px] sm:min-h-[44px] bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] font-black py-3 sm:py-2.5 rounded-xl shadow-sm transition-all active:scale-99 flex items-center justify-center touch-manipulation text-sm tracking-wide uppercase whitespace-nowrap flex-shrink-0 disabled:opacity-75 disabled:pointer-events-none"
            >
              {isSubmitting ? (
                <><RefreshCw size={17} className="animate-spin mr-2 flex-shrink-0" /> ĐANG ĐẨY VÀO SHEETS...</>
              ) : isRegisteredForTargetWeek ? (
                <><RefreshCw size={17} className="mr-2 flex-shrink-0" /> CẬP NHẬT LỊCH ĐĂNG KÝ</>
              ) : (
                <><Send size={17} className="mr-2 flex-shrink-0" /> GỬI LỊCH ĐĂNG KÝ</>
              )}
            </button>
          </div>
        </>
        );
      })()}
      </>
      )}
      {/* AI Schedule Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/55 p-4 animate-fade-in">
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-5 flex-shrink-0 border-b border-[var(--kg-border)] flex justify-between items-center bg-[var(--kg-surface-soft)]">
              <div className="flex items-center text-[var(--kg-primary)]">
                <Bot size={22} className="mr-2.5" />
                <h3 className="text-base sm:text-lg font-extrabold text-[var(--kg-text)]">Xếp ca nhanh bằng AI</h3>
              </div>
              <button
                type="button"
                onClick={() => !isAiProcessing && setAiModalOpen(false)}
                aria-label="Đóng"
                className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-[var(--kg-border)]/40 rounded-xl transition-colors text-[var(--kg-text-muted)] touch-manipulation"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar flex-grow">
              <p className="text-xs sm:text-sm text-[var(--kg-text-muted)] mb-4 leading-relaxed">
                Dán tin nhắn đăng ký ca hoặc đoạn văn bản chứa lịch làm của nhân viên vào đây. AI sẽ tự động phân tích và điền vào bảng cho bạn.
                <br />Ví dụ: <em className="text-[var(--kg-text-soft)]">&quot;Huy đăng ký thứ 2 18h, t3 19h. Trang nghỉ t7 chủ nhật, còn lại 17h.&quot;</em>
              </p>

              <label htmlFor="ai-schedule-input" className="block text-xs font-bold text-[var(--kg-text)] mb-1.5">
                Nội dung tin nhắn đăng ký ca
              </label>
              <textarea
                id="ai-schedule-input"
                value={aiInputText}
                onChange={(e) => setAiInputText(e.target.value)}
                placeholder="Dán nội dung phân ca vào đây..."
                className="w-full h-40 md:h-60 p-3.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text)] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] resize-none transition-all"
                disabled={isAiProcessing}
              />
            </div>

            <div className="p-4 md:p-5 border-t border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex justify-end gap-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setAiModalOpen(false)}
                disabled={isAiProcessing}
                className="min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--kg-text-muted)] bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:text-[var(--kg-text)] transition-colors disabled:opacity-50 touch-manipulation"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleAiProcess}
                disabled={isAiProcessing || !aiInputText.trim()}
                className="min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] shadow-xs transition-all flex items-center disabled:opacity-50 touch-manipulation"
              >
                {isAiProcessing ? (
                  <><RefreshCw size={16} className="animate-spin mr-2" /> Đang xử lý...</>
                ) : (
                  <><Sparkles size={16} className="mr-2" /> Phân Tích &amp; Điền Ca</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Sheets & Receipt Modal (Replaces Swal.fire) */}
      <KgConfirmSheet
        isOpen={confirmSubmitOpen}
        onClose={() => setConfirmSubmitOpen(false)}
        onConfirm={() => void executeRegistrationSubmit()}
        title={isRegisteredForTargetWeek ? 'Xác nhận Cập Nhật' : 'Xác nhận Nộp Lịch'}
        message={
          isRegisteredForTargetWeek
            ? 'Bạn muốn cập nhật lại lịch đăng ký ca tuần tới?'
            : 'Bạn đã kiểm tra kỹ toàn bộ ca làm trong tuần tới chưa?'
        }
        confirmLabel={isRegisteredForTargetWeek ? 'Cập nhật lịch' : 'Gửi lịch'}
        cancelLabel="Xem lại"
        variant="primary"
      />

      <KgConfirmSheet
        isOpen={confirmApproveOpen}
        onClose={() => setConfirmApproveOpen(false)}
        onConfirm={() => void executeApproveAllSchedules()}
        title="Duyệt và nạp lịch?"
        message="Lịch sẽ được duyệt trên hệ thống và tự động nạp sang Sheet Lịch Làm (1Vrm...)."
        confirmLabel="Đồng ý duyệt & Nạp"
        cancelLabel="Hủy"
        variant="warning"
      />

      <KgConfirmSheet
        isOpen={confirmSyncRosterOpen}
        onClose={() => setConfirmSyncRosterOpen(false)}
        onConfirm={() => void executeManualSyncRoster()}
        title="Đồng bộ sang Sheet Lịch Làm?"
        message={`Đồng bộ lịch tuần ${weekInfo.weekDisplay} sang Google Spreadsheet Lịch Làm. Tổ trưởng nạp ở nhóm "KHÁC", nhân viên nạp tại Nhóm trực tương ứng.`}
        confirmLabel="Đồng bộ ngay"
        cancelLabel="Hủy"
        variant="primary"
      />

      <KgBottomSheet
        isOpen={Boolean(copyPrevWeekModal)}
        onClose={() => setCopyPrevWeekModal(null)}
        title={copyPrevWeekModal ? `Sao chép lịch từ tuần ${copyPrevWeekModal.prevWeekDisplay}?` : 'Sao chép lịch tuần trước'}
      >
        {copyPrevWeekModal && (
          <div className="space-y-4 py-1">
            <p className="text-xs sm:text-sm text-[var(--kg-text-muted)] leading-relaxed">
              Hệ thống sẽ lấy lịch tuần trước (<b>{copyPrevWeekModal.prevWeekDisplay}</b>) để điền nhanh cho tuần <b>{weekInfo.weekDisplay}</b>.
            </p>
            <div className="space-y-2">
              <KgButton
                variant="primary"
                size="md"
                className="w-full"
                onClick={() => void executeAdminCopyPreviousWeek(false)}
              >
                Điền NV chưa đăng ký (An toàn)
              </KgButton>
              <KgButton
                variant="warning"
                size="md"
                className="w-full"
                onClick={() => void executeAdminCopyPreviousWeek(true)}
              >
                Ghi đè toàn bộ
              </KgButton>
              <KgButton
                variant="secondary"
                size="md"
                className="w-full"
                onClick={() => setCopyPrevWeekModal(null)}
              >
                Hủy
              </KgButton>
            </div>
          </div>
        )}
      </KgBottomSheet>

      <KgBottomSheet
        isOpen={Boolean(submitReceiptModal)}
        onClose={() => setSubmitReceiptModal(null)}
        title={submitReceiptModal ? `✓ Đã đăng ký lịch làm tuần ${submitReceiptModal.weekDisplay}` : 'Đã đăng ký lịch'}
      >
        {submitReceiptModal && (
          <div className="space-y-3 text-left py-1">
            <div
              className={`p-3 border rounded-2xl flex items-center justify-between gap-2 ${
                submitReceiptModal.sheetSaved
                  ? 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/30 text-[var(--kg-success)]'
                  : 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/30 text-[var(--kg-warning)]'
              }`}
            >
              <div className="flex items-center gap-2 font-black text-xs sm:text-sm">
                <span
                  className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                    submitReceiptModal.sheetSaved ? 'bg-[var(--kg-success)]' : 'bg-[var(--kg-warning)]'
                  }`}
                />
                <span>
                  {submitReceiptModal.sheetSaved
                    ? 'Google Sheets: Đã nạp 100%'
                    : 'Edge D1: Đã ghi nhận & đang nạp vào Sheet...'}
                </span>
              </div>
              <span className="text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] whitespace-nowrap">
                {submitReceiptModal.syncTimestamp}
              </span>
            </div>

            <p className="text-xs sm:text-sm font-semibold text-[var(--kg-text)] leading-snug">
              {submitReceiptModal.isUpdate
                ? `Đã cập nhật lịch làm tuần ${submitReceiptModal.weekDisplay} (${submitReceiptModal.monthSheet}) thành công.`
                : `Đã ghi nhận lịch làm 7 ngày tuần ${submitReceiptModal.weekDisplay} (${submitReceiptModal.monthSheet}) thành công!`}{' '}
              Hệ thống đã ghi nhớ và sẽ không nhắc lại trong tuần này.
            </p>

            <div className="p-3 bg-[var(--kg-info-soft)] border border-[var(--kg-info)]/25 rounded-2xl text-xs text-[var(--kg-text)] leading-relaxed">
              <p className="font-black text-[var(--kg-info)] mb-1">Thông báo từ BQL:</p>
              <p className="font-medium text-[11px] text-[var(--kg-text-muted)] leading-relaxed">
                Lịch đăng ký ca của bạn đã được ghi nhận vào Bảng Chấm Công (Google Sheets). BQL sẽ sắp xếp lại phù hợp theo nhu cầu của nhà hàng. Trường hợp lịch không được duyệt nhưng lịch làm trùng lịch học, thi cử quan trọng hãy gửi lịch học/thi và báo BQL duyệt nhé!
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              {returnTab === 'checkin' && (
                <KgButton variant="primary" size="md" className="flex-1" icon={ChevronLeft} onClick={handleReturnToCheckIn}>
                  Quay lại Chấm công ngay
                </KgButton>
              )}
              <KgButton
                variant={returnTab === 'checkin' ? 'secondary' : 'primary'}
                size="md"
                className="flex-1"
                onClick={() => setSubmitReceiptModal(null)}
              >
                Hoàn tất
              </KgButton>
            </div>
          </div>
        )}
      </KgBottomSheet>

      {/* Admin Touch-Friendly Employee Registration Detail Sheet */}
      <KgBottomSheet
        isOpen={Boolean(inspectEmpSheet)}
        onClose={() => setInspectEmpSheet(null)}
        title={inspectEmpSheet?.fullname || 'Chi tiết đăng ký'}
        subtitle={
          inspectEmpSheet?.hasRegistered
            ? `Lịch gốc nhân viên đăng ký (${weekInfo.weekDisplay})`
            : `Nhân viên chưa đăng ký tuần ${weekInfo.weekDisplay}`
        }
        footer={
          <KgButton
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => setInspectEmpSheet(null)}
          >
            Đóng
          </KgButton>
        }
      >
        {inspectEmpSheet && (
          <div className="space-y-3">
            <div className="grid grid-cols-7 gap-1.5">
              {SHORT_DAY_NAMES.map((d, idx) => {
                const s = inspectEmpSheet.origShifts[idx] || '';
                return (
                  <div
                    key={d}
                    className="rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-1.5 text-center"
                  >
                    <div className="text-[10px] font-bold text-[var(--kg-text-muted)]">{d}</div>
                    <div className="text-[10px] font-mono tabular-nums text-[var(--kg-text-soft)]">
                      {weekInfo.weekDates[idx]?.split('/')[0]}
                    </div>
                    <div
                      className={`mt-1 text-[10px] font-black py-1 rounded-md truncate ${getAdminShiftClass(s)}`}
                    >
                      {s ? <ResponsiveShift shift={s} /> : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
            {inspectEmpSheet.reason && (
              <div className="p-3 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/30 text-xs">
                <span className="font-bold text-[var(--kg-warning)] block mb-0.5">
                  Lý do xin nghỉ:
                </span>
                <span className="text-[var(--kg-text)]">{inspectEmpSheet.reason}</span>
              </div>
            )}
            {inspectEmpSheet.note && (
              <div className="p-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs">
                <span className="font-bold text-[var(--kg-text-muted)] block mb-0.5">
                  Ghi chú điều chỉnh:
                </span>
                <span className="text-[var(--kg-text)]">{inspectEmpSheet.note}</span>
              </div>
            )}
          </div>
        )}
      </KgBottomSheet>

    </div>
  );
}
