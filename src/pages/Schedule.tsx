import { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import {
  speak,
  computeWeekInfo,
  getActiveShiftClass,
  getPreviewShiftClass,
  SHIFT_OPTIONS,
  SHORT_DAY_NAMES,
  isRegistrationOpen,
  getAdminShiftClass,
  ADMIN_SHIFT_OPTIONS,
  generateMonthDates,
  formatDateShort,
  formatMobileShift,
  ResponsiveShift,
  isNextWeekScheduleRegistered,
  markScheduleRegisteredLocally,
  getSavedRegisteredShiftsForWeek,
  getScheduleRegistrationMeta,
  getCurrentTimeString,
} from '../utils/helpers';
import type { MonthDateInfo } from '../utils/helpers';
import Swal from 'sweetalert2';
import { CalendarCheck, Eye, AlertTriangle, Send, Lock, ExternalLink, Clock, RefreshCw, Pencil, CheckCheck, Inbox, LayoutGrid, CalendarRange, ChevronLeft, ChevronRight, Sparkles, X, Bot, Info, FileSpreadsheet, Search, ShieldCheck, CheckCircle2, Copy } from 'lucide-react';
import { KgModuleHero } from '../components/KgDesignSystem';
import { getCalendarDayMeta } from '../utils/calendarHighlights';
import { isWorkEligible } from '../utils/employment';
import { buildEmployeeShiftMapFromPrevious, mapPreviousWeekToTargetSchedules } from '../utils/shiftSwapValidator';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import SmartPersonName from '../components/SmartPersonName';
import MonthDayVisibility from '../components/MonthDayVisibility';
import { useMonthDayVisibility } from '../hooks/useMonthDayVisibility';

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
  const [isMonthRefreshing, setIsMonthRefreshing] = useState(false);
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      } else if (!hasData) {
        Swal.fire('Lỗi', 'Không thể tải lịch làm việc', 'error');
      }
    } catch {
      setIsMonthRefreshing(false);
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
       Swal.fire('Lỗi', 'Cập nhật thất bại. Vui lòng tải lại trang.', 'error');
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

  const empMonthMap = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    monthData?.forEach(week => {
      week?.schedules?.forEach((emp: any) => {
        if (!map[emp.fullname]) map[emp.fullname] = {};
        emp?.shifts?.forEach((s: string, i: number) => {
          map[emp.fullname][`${week.weekLabel}_${i}`] = s;
        });
      });
    });
    return map;
  }, [monthData]);


  const [hasWeekendOff, setHasWeekendOff] = useState(false);
  const [hasConsecutiveOffs, setHasConsecutiveOffs] = useState(false);
  const [hasHolidayOff, setHasHolidayOff] = useState(false);
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

  // Recompute OFF rule flags whenever shiftData changes
  useEffect(() => {
    let weekendOff = false, consecutiveOffs = false, holidayOff = false, offCount = 0;
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
    setHasWeekendOff(weekendOff);
    setHasConsecutiveOffs(consecutiveOffs);
    setHasHolidayOff(holidayOff);
  }, [shiftData, weekInfo.weekDatesKeys, weekDayMeta]);

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
      store.setRegisteredShifts(savedShifts, expectedWeekKey);
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
          Swal.fire('Đã đồng bộ 100%', `Lịch tuần ${weekInfo.weekDisplay} đã được nạp thành công vào Google Sheets lúc ${ts}.`, 'success');
        }
      } else if (!silent) {
        Swal.fire('Đang xếp hàng đồng bộ', 'Máy chủ Google Sheets đang xử lý nhiều yêu cầu cùng lúc. Hệ thống sẽ tiếp tục tự động nạp lại.', 'info');
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
          Swal.fire({ title: 'Lịch đã được duyệt!', text: 'Admin đã duyệt lịch làm việc của bạn.', icon: 'success', confirmButtonColor: '#10b981' });
          speak('Lịch làm việc đã được Admin duyệt');
        }
      });
    }, 120000);
    return () => clearInterval(timer);
  }, [scheduleStatus, currentUser, isManagerView]);

  const handleShiftChange = (key: string, value: string) => {
    if (!isOpen) return;
    store.updateShiftData(key, value);
    setTimeout(() => {
      const currentData = useAppStore.getState().shiftData;
      let weekendOff = false, consecutiveOffs = false, holidayOff = false, offCount = 0;
      for (let i = 0; i < 7; i++) {
        const shift = currentData[weekInfo.weekDatesKeys[i]];
        if (shift === 'OFF') {
          offCount++;
          if (offCount >= 2) consecutiveOffs = true;
          if (i >= 4) weekendOff = true;
          if (weekDayMeta[i]?.kind === 'holiday') holidayOff = true;
        } else { offCount = 0; }
      }
      setHasWeekendOff(weekendOff);
      setHasConsecutiveOffs(consecutiveOffs);
      setHasHolidayOff(holidayOff);
    }, 0);
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

  const recomputeOffFlagsFromMap = (mapObj: Record<string, string>) => {
    let weekendOff = false;
    let consecutiveOffs = false;
    let holidayOff = false;
    let offCount = 0;
    for (let i = 0; i < 7; i++) {
      const shift = mapObj[weekInfo.weekDatesKeys[i]];
      if (shift === 'OFF') {
        offCount++;
        if (offCount >= 2) consecutiveOffs = true;
        if (i >= 4) weekendOff = true;
        if (weekDayMeta[i]?.kind === 'holiday') holidayOff = true;
      } else {
        offCount = 0;
      }
    }
    setHasWeekendOff(weekendOff);
    setHasConsecutiveOffs(consecutiveOffs);
    setHasHolidayOff(holidayOff);
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
      Swal.fire(
        'Chưa có lịch tuần này',
        'Không tìm thấy lịch đã duyệt của tuần hiện tại để sao chép nhanh.',
        'info'
      );
      return;
    }

    const mapped = buildEmployeeShiftMapFromPrevious(sourceShifts, weekInfo.weekDatesKeys);
    store.setShiftData(mapped);
    recomputeOffFlagsFromMap(mapped);
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Đã sao chép lịch tuần này sang 7 ngày tuần tới!',
      showConfirmButton: false,
      timer: 2500,
    });
  };

  const handleAdminCopyPreviousWeek = async () => {
    if (!adminSchedules || adminSchedules.length === 0) {
      Swal.fire('Chưa tải danh sách', 'Vui lòng bấm "Tải lịch" trước khi sao chép tuần trước.', 'info');
      return;
    }
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 7);
    const prevWeekInfo = computeWeekInfo(prevDate, false);

    const choice = await Swal.fire({
      title: `Sao chép lịch từ tuần ${prevWeekInfo.weekDisplay}?`,
      html: `<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">Hệ thống sẽ lấy lịch tuần trước (<b>${prevWeekInfo.weekDisplay}</b>) để điền nhanh cho tuần <b>${weekInfo.weekDisplay}</b>.</p>`,
      icon: 'question',
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'Điền NV chưa đăng ký (An toàn)',
      denyButtonText: 'Ghi đè toàn bộ',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#10b981',
      denyButtonColor: '#f59e0b',
    });

    if (!choice.isConfirmed && !choice.isDenied) return;
    const overwriteExisting = Boolean(choice.isDenied);

    store.setLoading(true, `Đang lấy lịch tuần ${prevWeekInfo.weekDisplay}...`);
    const res = await callApi('GET_ALL_SCHEDULES', {
      monthSheet: prevWeekInfo.monthSheet,
      weekLabel: prevWeekInfo.weekLabel,
    });
    store.setLoading(false);

    if (!res?.ok) {
      Swal.fire('Lỗi', res?.message || 'Không thể tải lịch tuần trước.', 'error');
      return;
    }

    const prevList = Array.isArray(res.data)
      ? res.data
      : Array.isArray(res.data?.schedules)
        ? res.data.schedules
        : [];
    if (prevList.length === 0) {
      Swal.fire('Chưa có dữ liệu', `Tuần ${prevWeekInfo.weekDisplay} chưa có lịch để sao chép.`, 'info');
      return;
    }

    const result = mapPreviousWeekToTargetSchedules({
      currentSchedules: adminSchedules,
      previousSchedules: prevList,
      overwriteExisting,
    });

    if (result.copiedEmployeeCount === 0) {
      Swal.fire(
        'Không có thay đổi',
        overwriteExisting
          ? 'Lịch hiện tại đã trùng khớp với tuần trước.'
          : 'Tất cả nhân sự đều đã có lịch đăng ký. Chọn "Ghi đè toàn bộ" nếu muốn chép đè.',
        'info'
      );
      return;
    }

    store.setAdminSchedules(result.updatedSchedules as any);
    Swal.fire({
      icon: 'success',
      title: `Đã sao chép cho ${result.copiedEmployeeCount} nhân sự`,
      text: `Đã điền ${result.copiedCellCount} ô ca từ tuần ${prevWeekInfo.weekDisplay}. Kiểm tra lại và bấm "Xác nhận lịch tuần" để lưu chính thức.`,
    });
  };

  const submitRegistration = async () => {
    if (!isOpen) return;

    // Validate all 7 days must have a valid shift selected
    const allDaysFilled = weekInfo.weekDatesKeys.every((k) => {
      const s = shiftData[k];
      return typeof s === 'string' && s.trim().length > 0;
    });

    if (!allDaysFilled || Object.keys(shiftData).length < 7) {
      Swal.fire('Chú ý', 'Vui lòng chọn đầy đủ ca cho tất cả 7 ngày trong tuần tiếp theo.', 'warning');
      return;
    }

    if ((hasWeekendOff || hasConsecutiveOffs || hasHolidayOff) && offReason.trim() === '') {
      Swal.fire({
        title: 'Thiếu lý do xin nghỉ',
        html: `
          <p class="text-sm text-gray-700 dark:text-gray-300">Theo quy định nhà hàng, bạn cần nhập lý do chi tiết khi:</p>
          <ul class="text-xs text-left text-red-600 dark:text-red-400 list-disc list-inside mt-2 space-y-1">
            ${hasWeekendOff ? '<li>Xin nghỉ (OFF) vào Thứ 6, Thứ 7 hoặc Chủ Nhật.</li>' : ''}
            ${hasHolidayOff ? '<li>Xin nghỉ (OFF) vào ngày Lễ/Tết cao điểm.</li>' : ''}
            ${hasConsecutiveOffs ? '<li>Xin nghỉ (OFF) từ 2 ngày liên tiếp trở lên.</li>' : ''}
          </ul>
        `,
        icon: 'warning',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    const isUpdate = isRegisteredForTargetWeek;
    const { isConfirmed } = await Swal.fire({
      title: isUpdate ? 'Xác nhận Cập Nhật' : 'Xác nhận Nộp Lịch',
      html: isUpdate
        ? 'Bạn muốn cập nhật lại lịch đăng ký ca tuần tới?'
        : 'Bạn đã kiểm tra kỹ toàn bộ ca làm trong tuần tới chưa?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#6b7280',
      confirmButtonText: isUpdate ? 'Cập nhật lịch' : 'Gửi lịch',
      cancelButtonText: 'Xem lại',
    });
    if (!isConfirmed) return;

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
        store.setRegisteredShifts(shifts, expectedWeekKey);
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

        const bqlNotice = 'Lịch đăng ký ca của bạn đã được ghi nhận vào Bảng Chấm Công (Google Sheets). BQL sẽ sắp xếp lại phù hợp theo nhu cầu của nhà hàng. Trường hợp lịch không được duyệt nhưng lịch làm trùng lịch học, thi cử quan trọng hãy gửi lịch học/thi và báo BQL duyệt nhé!';

        Swal.fire({
          title: `✓ Đã đăng ký lịch làm tuần ${weekInfo.weekDisplay}`,
          html: `
            <div class="space-y-3 text-left">
              <div class="p-3 ${sheetSaved ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'} border rounded-2xl flex items-center justify-between gap-2 shadow-xs">
                <div class="flex items-center gap-2 ${sheetSaved ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'} font-black text-xs sm:text-sm">
                  <span class="w-2.5 h-2.5 rounded-full ${sheetSaved ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse"></span>
                  <span>${sheetSaved ? 'Google Sheets: <b>Đã nạp 100%</b>' : 'Edge D1: <b>Đã ghi nhận &amp; đang nạp vào Sheet...</b>'}</span>
                </div>
                <span class="text-[11px] font-mono tabular-nums font-bold ${sheetSaved ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/60' : 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60'} px-2 py-0.5 rounded-lg whitespace-nowrap">
                  ${syncTimestamp}
                </span>
              </div>

              <p class="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug">
                ${isUpdate ? `Đã cập nhật lịch làm tuần <b>${weekInfo.weekDisplay}</b> (${weekInfo.monthSheet}) thành công.` : `Đã ghi nhận lịch làm 7 ngày tuần <b>${weekInfo.weekDisplay}</b> (${weekInfo.monthSheet}) thành công!`} Hệ thống đã ghi nhớ và sẽ không nhắc lại trong tuần này.
              </p>

              <div class="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 rounded-2xl text-xs text-blue-900 dark:text-blue-200 leading-relaxed shadow-inner">
                <p class="font-black flex items-center gap-1.5 text-blue-700 dark:text-blue-300 mb-1">
                  Thông báo từ BQL:
                </p>
                <p class="font-medium text-[11px] leading-relaxed">${bqlNotice}</p>
              </div>
            </div>
          `,
          icon: 'success',
          confirmButtonColor: '#10b981',
          confirmButtonText: 'Hoàn tất'
        });
        speak('Đăng ký lịch làm việc thành công, đã nạp vào Google Sheets');
      } else if (res) {
        Swal.fire('Lỗi', res.message || 'Không thể ghi vào sheet lúc này.', 'error');
      } else {
        Swal.fire('Lỗi mạng', 'Không thể kết nối đến máy chủ Google Sheets. Vui lòng thử lại.', 'error');
      }
    } catch (err: any) {
      Swal.fire('Lỗi', err?.message || 'Có lỗi xảy ra khi nạp lịch làm việc.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Shared preview grid renderer
  const renderShiftGrid = (getShift: (i: number) => string) => (
    <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
      {SHORT_DAY_NAMES.map((shortDayName, i) => {
        const shiftVal = getShift(i);
        return (
          <div
            key={i}
            className={`calendar-preview-day flex flex-col items-center rounded-xl px-0.5 py-1.5 transition-all ${weekDayMeta[i].className}`}
            title={weekDayMeta[i].label || undefined}
          >
            <span className="text-[11px] font-extrabold text-gray-800 dark:text-gray-200">
              {weekInfo.weekDates[i]}
            </span>
            <span className="text-[9px] text-gray-500 font-bold mb-1.5 uppercase">
              {shortDayName}
            </span>
            <div className={`w-full text-center py-2 px-0.5 rounded-xl text-xs font-black tracking-tight transition-all shadow-xs ${getPreviewShiftClass(shiftVal)}`}>
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
      Swal.fire('Thông báo', res.message, 'info');
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

  const approveAllSchedules = async () => {
    if (adminSchedules.length === 0) return;
    const { isConfirmed } = await Swal.fire({
      title: 'Duyệt và nạp lịch?',
      html: 'Lịch sẽ được duyệt trên hệ thống và <b>tự động nạp sang Sheet Lịch Làm</b> (1Vrm...).',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Đồng ý duyệt & Nạp',
      cancelButtonText: 'Hủy'
    });
    if (!isConfirmed) return;

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
      Swal.fire({
        title: 'Thành công',
        text: res?.message || 'Lịch đã được duyệt và nạp sang Google Sheets thành công!',
        icon: 'success'
      });
      loadAdminSchedules();
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể lưu lịch làm.', 'error');
    }
  };

  const handleManualSyncRoster = async () => {
    const { isConfirmed } = await Swal.fire({
      title: 'Đồng bộ sang Sheet Lịch Làm?',
      html: `Đồng bộ lịch tuần <b>${weekInfo.weekDisplay}</b> sang Google Spreadsheet Lịch Làm.<br/><span class="text-xs text-gray-500 mt-2 block">Tổ trưởng nạp ở nhóm "KHÁC", nhân viên nạp tại Nhóm trực tương ứng.</span>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Đồng bộ ngay',
      cancelButtonText: 'Hủy'
    });
    if (!isConfirmed) return;

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
        Swal.fire('Thành công', res?.message || res?.data?.message || 'Đồng bộ thành công sang Sheet Lịch Làm!', 'success');
      } else {
        Swal.fire('Lỗi', res?.message || 'Không thể đồng bộ sang Sheet Lịch Làm.', 'error');
      }
    } catch (err: any) {
      store.setLoading(false);
      setIsSyncingRoster(false);
      Swal.fire('Lỗi kết nối', err?.message || 'Có lỗi xảy ra khi đồng bộ.', 'error');
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
        Swal.fire('Thành công', `Đã điền lịch cho ${matchedCount} nhân viên. Vui lòng kiểm tra lại và nhấn Xác Nhận Sắp Xếp Ca!`, 'success');
        setAiModalOpen(false);
        setAiInputText('');
      } else {
        throw new Error('Dữ liệu JSON không đúng định dạng');
      }
    } catch (err: any) {
      console.error(err);
      Swal.fire('Lỗi AI', 'Không thể phân tích dữ liệu, vui lòng kiểm tra lại văn bản đầu vào. Lỗi: ' + err.message, 'error');
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
      />

      {/* Toggle Mode & Time Navigation for Admin */}
        {isManagerView && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 relative z-10 gap-3 w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] p-2 rounded-2xl shadow-xs">
            <div className="flex items-center space-x-1 bg-[var(--kg-surface-soft)] p-1 rounded-xl border border-[var(--kg-border)]/60">
              <button 
                type="button"
                onClick={() => setViewMode('week')} 
                className={`flex items-center px-4 py-2 rounded-lg text-xs sm:text-sm font-black transition-all ${viewMode === 'week' ? 'bg-[var(--kg-primary)] text-white shadow-xs' : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'}`}
              >
                <CalendarRange size={15} className="mr-1.5" /> Tuần
              </button>
              <button 
                type="button"
                onClick={() => setViewMode('month')} 
                className={`flex items-center px-4 py-2 rounded-lg text-xs sm:text-sm font-black transition-all ${viewMode === 'month' ? 'bg-[var(--kg-primary)] text-white shadow-xs' : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'}`}
              >
                <LayoutGrid size={15} className="mr-1.5" /> Tháng
              </button>
            </div>
            
            <div className="flex items-center space-x-2 bg-[var(--kg-surface-soft)] rounded-xl p-1.5 border border-[var(--kg-border)] w-full sm:w-auto justify-between sm:justify-start">
              <button onClick={() => viewMode === 'week' ? changeWeek(-1) : changeMonth(-1)} className="p-1.5 hover:bg-[var(--kg-surface)] hover:text-[var(--kg-text)] rounded-lg transition-all text-[var(--kg-text-muted)]"><ChevronLeft size={18} /></button>
              <div className="text-xs sm:text-sm font-black px-2 min-w-[140px] text-center text-[var(--kg-text)]">
                {viewMode === 'week' ? weekInfo.weekDisplay : `Tháng ${selectedMonth}/${selectedYear}`}
              </div>
              <button onClick={() => viewMode === 'week' ? changeWeek(1) : changeMonth(1)} className="p-1.5 hover:bg-[var(--kg-surface)] hover:text-[var(--kg-text)] rounded-lg transition-all text-[var(--kg-text-muted)]"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}

        <div className="calendar-highlight-legend mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-bold text-[var(--kg-text-muted)]">
          <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-red-500" /> Lễ/Tết Việt Nam</span>
          <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-[#cc6049]" /> Cao điểm F&amp;B</span>
          <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-amber-400" /> T6 · T7 · CN</span>
        </div>
        


      {isManagerView ? (
        // ================= ADMIN VIEW =================
        <div className="soft3d-card p-5 rounded-2xl animate-fade-in">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4 border-b border-[var(--kg-border)] pb-3">
            <h3 className="font-bold flex items-center text-[var(--kg-text)]">
              <CalendarCheck size={18} className="mr-2 text-[var(--kg-primary)]" /> Quản Lý Lịch Làm Việc Tuần Tới
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {viewMode === 'week' && (
                <button
                  type="button"
                  onClick={handleAdminCopyPreviousWeek}
                  className="text-xs sm:text-sm bg-[var(--kg-accent-soft)] text-[var(--kg-primary)] border border-[var(--kg-primary)]/25 px-3 py-1.5 rounded-xl hover:opacity-90 transition flex items-center font-bold"
                  title="Sao chép nhanh lịch làm từ tuần liền trước"
                >
                  <Copy size={14} className="mr-1.5" /> Sao chép tuần trước
                </button>
              )}
              <button 
                type="button"
                onClick={handleManualSyncRoster}
                disabled={isSyncingRoster}
                className="text-xs sm:text-sm bg-[var(--kg-success-soft)] text-[var(--kg-success)] border border-[var(--kg-success)]/25 px-3 py-1.5 rounded-xl hover:opacity-90 transition flex items-center font-bold disabled:opacity-50"
                title="Đồng bộ lịch tuần này sang Google Sheet Lịch Làm (1Vrm...)"
              >
                <FileSpreadsheet size={14} className={`mr-1.5 ${isSyncingRoster ? 'animate-spin' : ''}`} /> Đồng bộ Sheet Lịch
              </button>
              <button onClick={() => viewMode === 'week' ? loadAdminSchedules() : loadMonthSchedules()} className="text-xs sm:text-sm bg-[var(--kg-primary-soft)] text-[var(--kg-primary)] border border-[var(--kg-primary)]/20 px-3 py-1.5 rounded-xl hover:opacity-90 transition flex items-center font-bold">
                <RefreshCw size={14} className="mr-1.5" /> Tải lịch
              </button>
            </div>
          </div>

          <div className="md:hidden mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 flex items-start space-x-3 text-blue-700 dark:text-blue-300">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div className="text-sm font-medium">
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
                      <th className="schedule-employee-header px-3.5 py-3 md:sticky md:left-0 bg-[var(--kg-surface-soft)] z-20 font-black border-r border-[var(--kg-border)]">Nhân Viên</th>
                      {SHORT_DAY_NAMES.map((d, idx) => (
                        <th
                          key={d}
                          className={`schedule-day-header px-2 py-3 text-center border-r border-[var(--kg-border)] ${weekDayMeta[idx].className}`}
                          title={weekDayMeta[idx].label || undefined}
                        >
                          <div className="hidden md:block font-black text-[13px]">{weekInfo.weekDates[idx]}</div>
                          <div className="md:hidden font-black text-[11px]">{weekInfo.weekDates[idx]?.split('/')[0]}</div>
                          <div className="text-[9px] font-bold opacity-75 mt-0.5">{d}</div>
                        </th>
                      ))}
                      <th className="hidden md:table-cell px-4 py-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminSchedules.map((emp, empIdx) => {
                      const origShifts = originalAdminSchedules[empIdx]?.shifts || [];
                      const hasRegistered = emp.isRegistered;
                      
                      return (
                      <tr key={empIdx} className="border-b border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]/50 transition-colors">
                        <td className="schedule-employee-cell px-3.5 py-2.5 md:sticky md:left-0 bg-[var(--kg-surface)] z-10 font-bold text-[var(--kg-text)] shadow-[1px_0_0_0_rgba(0,0,0,0.05)] border-r border-[var(--kg-border)] group cursor-help">
                          <div className="flex items-center min-w-0">
                            <SmartPersonName fullname={emp.fullname} className="schedule-employee-name max-w-[150px]" />
                            {hasRegistered && (
                              <div className="ml-1.5 w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Đã đăng ký ca"></div>
                            )}
                          </div>
                          {/* Tooltip */}
                          {hasRegistered && (
                            <div className="absolute hidden group-hover:block bg-gray-900 text-white p-3 rounded-xl text-xs -top-12 left-28 z-50 shadow-xl border border-gray-700 w-[250px] whitespace-normal">
                              <div className="font-bold mb-1 text-green-400">Đã ĐK:</div>
                              <div className="grid grid-cols-2 gap-1">
                                {origShifts.map((s: string, i: number) => (
                                  <div key={i}><span className="text-gray-400">T{i+2}:</span> <span className="font-bold">{s || '(Trống)'}</span></div>
                                ))}
                              </div>
                            </div>
                          )}
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
                              className={`schedule-shift-cell px-1 py-2 relative border-r dark:border-gray-700 ${weekDayMeta[dayIdx].className}`}
                              title={weekDayMeta[dayIdx].label || tooltipText || undefined}
                            >
                              {isChanged && <div className="absolute top-0 right-0 w-2 h-2 bg-orange-500 rounded-full animate-pulse" title="Đã thay đổi"></div>}
                              {!isChanged && hasNote && <div className="absolute top-0 right-0 w-2 h-2 bg-[var(--kg-primary)] rounded-full" title={tooltipText}></div>}
                              <div className="relative" title={tooltipText}>
                                <select value={shift || ''} onChange={(e) => updateAdminShift(empIdx, dayIdx, e.target.value)}
                                  aria-label={`${emp.fullname} - ${SHORT_DAY_NAMES[dayIdx]}`}
                                  className={`schedule-shift-select schedule-shift-select--mobile md:hidden text-[10px] font-bold rounded-lg border focus:outline-none w-full cursor-pointer appearance-none text-center transition-all ${
                                    isChanged
                                      ? 'border-orange-500 ring-1 ring-orange-200 dark:ring-orange-900/50 shadow-sm ' + getAdminShiftClass(shift)
                                      : 'border-[var(--kg-border)] focus:ring-1 focus:ring-[var(--kg-primary)] ' + getAdminShiftClass(shift)
                                  }`}>
                                  <option value="">—</option>
                                  {ADMIN_SHIFT_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt} className="bg-white text-gray-800">{formatMobileShift(opt)}</option>
                                  ))}
                                </select>
                                <select value={shift || ''} onChange={(e) => updateAdminShift(empIdx, dayIdx, e.target.value)}
                                  aria-label={`${emp.fullname} - ${SHORT_DAY_NAMES[dayIdx]}`}
                                  className={`text-xs font-bold rounded-lg border focus:outline-none p-1.5 w-full cursor-pointer appearance-none text-center transition-all ${
                                    isChanged 
                                      ? 'border-orange-500 ring-2 ring-orange-200 dark:ring-orange-900/50 shadow-sm ' + getAdminShiftClass(shift)
                                      : 'border-[var(--kg-border)] focus:ring-2 focus:ring-[var(--kg-primary)] ' + getAdminShiftClass(shift)
                                  } hidden md:block`}>
                                  <option value="">(Trống)</option>
                                  {ADMIN_SHIFT_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt} className="bg-white text-gray-800">{opt}</option>
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
              <div className="flex flex-col sm:flex-row gap-3 mb-2">
                <button 
                  type="button"
                  onClick={() => setAiModalOpen(true)} 
                  className="flex-1 bg-[var(--kg-primary)] hover:brightness-110 text-white font-black py-3.5 rounded-xl shadow-md transition transform active:scale-98 flex items-center justify-center touch-manipulation text-xs sm:text-sm tracking-wider uppercase"
                >
                  <Bot size={18} className="mr-2 text-[var(--kg-accent)]" /> XẾP CA BẰNG AI
                </button>
                <button 
                  type="button"
                  onClick={approveAllSchedules} 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-xl shadow-md transition transform active:scale-98 flex items-center justify-center touch-manipulation text-xs sm:text-sm tracking-wider uppercase"
                >
                  <CheckCheck size={18} className="mr-2" /> DUYỆT &amp; ĐỒNG BỘ LỊCH LÀM
                </button>
                <button 
                  type="button"
                  onClick={handleManualSyncRoster}
                  disabled={isSyncingRoster}
                  className="sm:w-auto px-5 bg-blue-600 hover:bg-blue-700 text-white font-black py-3.5 rounded-xl shadow-md transition transform active:scale-98 flex items-center justify-center touch-manipulation text-xs sm:text-sm tracking-wider uppercase disabled:opacity-50"
                  title="Đồng bộ lại sang Sheet Lịch Làm (1Vrm...)"
                >
                  <FileSpreadsheet size={18} className={`mr-2 ${isSyncingRoster ? 'animate-spin' : ''}`} /> ĐỒNG BỘ ROSTER
                </button>
              </div>
            </>
            ) : (
              <div className="text-center py-6 text-gray-400 soft3d-bg rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Bấm "Tải lịch" để xem danh sách tuần tới</p>
              </div>
            )
          ) : (
            monthData && monthData.length > 0 ? (
            <div className="space-y-3">
              <MonthDayVisibility
                monthDates={monthDates}
                visibleKeys={visibleMonthDateKeys}
                onChange={setVisibleMonthDateKeys}
              />

              {/* Employee search & summary bar */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="relative flex-1 max-w-sm">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={empSearchQuery}
                    onChange={(e) => setEmpSearchQuery(e.target.value)}
                    placeholder="Tìm tên nhân viên..."
                    className="w-full pl-9 pr-8 py-2 text-xs font-medium rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800 dark:text-gray-100 placeholder-gray-400"
                  />
                  {empSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setEmpSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 flex items-center justify-between sm:justify-end gap-3 px-1">
                  <span>Hiển thị: <b className="text-amber-600 dark:text-amber-400">{filteredUsers.length}</b>/{users.length} nhân viên</span>
                  <span className="hidden md:inline text-gray-400">• Cuộn ngang để xem đủ 30 ngày</span>
                </div>
              </div>

              <div className="overflow-x-auto w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 pb-20 custom-scrollbar shadow-sm">
                <table className="w-full text-sm text-left whitespace-nowrap border-collapse">
                  <thead className="text-[10px] text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
                    <tr>
                      <th className="px-3 py-3 sticky left-0 bg-gray-100 dark:bg-gray-800 z-30 font-bold border-r border-gray-300 dark:border-gray-700 shadow-[2px_0_5px_rgba(0,0,0,0.06)] min-w-[130px] sm:min-w-[160px]">
                        Nhân Viên
                      </th>
                      {visibleMonthDates.map((mDate) => {
                        const dayMeta = getCalendarDayMeta(mDate.dateKey);
                        return (
                          <th
                            key={mDate.dateKey}
                            className={`px-1 py-2 text-center border-r border-gray-200 dark:border-gray-700 min-w-[66px] sm:min-w-[74px] ${dayMeta.className}`}
                            title={dayMeta.label || undefined}
                          >
                            <div className="font-bold text-gray-700 dark:text-gray-300 text-[12px] sm:text-[13px]">{formatDateShort(mDate.date)}</div>
                            <div className="text-[10px] font-normal opacity-70 mt-0.5">{SHORT_DAY_NAMES[mDate.dayIndex]}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={visibleMonthDates.length + 1} className="py-8 text-center text-gray-400 dark:text-gray-500 text-xs">
                          Không tìm thấy nhân viên nào khớp với "{empSearchQuery}"
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((emp, empIdx) => (
                        <tr key={emp.username || empIdx} className="border-b border-gray-200 dark:border-gray-700 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors">
                          <td className="px-3 py-2.5 sticky left-0 bg-white dark:bg-gray-900 z-20 font-bold text-gray-800 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700 shadow-[2px_0_5px_rgba(0,0,0,0.06)] text-xs">
                            <SmartPersonName fullname={emp.fullname} className="max-w-[120px] sm:max-w-[150px] font-bold truncate block" />
                          </td>
                          {visibleMonthDates.map((mDate) => {
                            const shift = empMonthMap[emp.fullname]?.[`${mDate.weekLabel}_${mDate.dayIndex}`] || '';
                            const dayMeta = getCalendarDayMeta(mDate.dateKey);
                            return (
                              <td
                                key={mDate.dateKey}
                                className={`px-1 py-1 relative border-r border-gray-100 dark:border-gray-700/60 ${dayMeta.className}`}
                                title={dayMeta.label || undefined}
                              >
                                <div className="relative">
                                  <select
                                    value={shift}
                                    onChange={(e) => updateSingleMonthShift(emp.fullname, mDate, e.target.value)}
                                    className={`text-xs font-black rounded-lg border focus:outline-none py-1.5 px-1 min-h-[38px] w-full min-w-[58px] sm:min-w-[64px] cursor-pointer appearance-none text-center transition-all touch-manipulation shadow-sm ${
                                      'border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-amber-500 ' + getAdminShiftClass(shift)
                                    }`}
                                  >
                                    <option value="" className="bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200">OFF</option>
                                    {ADMIN_SHIFT_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt} className="bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                                        {formatMobileShift(opt)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            ) : (
              <div className="text-center py-6 text-gray-400 soft3d-bg rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                <Inbox size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Bấm "Tải lịch" để xem danh sách tháng {selectedMonth}</p>
              </div>
            )
          )}
        </div>
      ) : (
        // ================= USER VIEW =================
        <>
          {/* Explicit Weekly Schedule Registration Confirmation & Latest Timestamp Card */}
          {isRegisteredForTargetWeek && (
            <div
              data-testid="schedule-registered-banner"
              className={`rounded-2xl p-4 sm:p-5 mb-6 border shadow-xs animate-fade-in ${
                scheduleStatus === 'approved'
                  ? 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                  : 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200/90 dark:border-emerald-800/80'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-500/25">
                    <CheckCircle2 size={22} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white">
                        <ShieldCheck size={11} /> Đã ghi nhớ cho tuần tới
                      </span>
                      <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 font-mono tabular-nums">
                        {weekInfo.monthSheet}
                      </span>
                    </div>

                    <h4 className="font-black text-emerald-900 dark:text-emerald-200 text-sm sm:text-base leading-snug">
                      Đã đăng ký lịch làm tuần <span className="font-mono tabular-nums">{weekInfo.weekDisplay}</span>
                    </h4>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-emerald-800/90 dark:text-emerald-300/90 font-medium pt-0.5">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={13} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                          <span>Ghi nhận/chỉnh sửa gần nhất:</span>
                        </span>
                        <b
                          data-testid="schedule-updated-at"
                          className="font-mono tabular-nums whitespace-nowrap font-black text-emerald-950 dark:text-white bg-white/80 dark:bg-slate-900/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800"
                        >
                          {effectiveUpdatedAt || 'Đã lưu trên Bảng Chấm Công'}
                        </b>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sheet Sync & Approval Pills */}
                <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1.5 flex-shrink-0 pl-14 sm:pl-0">
                  {effectiveSheetSynced ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Đã nạp 100% vào Sheet
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-black bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                        <RefreshCw size={11} className="animate-spin" />
                        Đang đồng bộ Sheet...
                      </span>
                      <button
                        type="button"
                        disabled={isSyncingPendingSheet}
                        onClick={() => syncPendingScheduleToSheet(false)}
                        className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-amber-600 hover:bg-amber-700 text-white transition active:scale-95 disabled:opacity-60"
                      >
                        Đồng bộ ngay
                      </button>
                    </div>
                  )}

                  {scheduleStatus === 'approved' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                      <CalendarCheck size={12} /> Đã duyệt ✓
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                      <Clock size={12} /> Chờ Admin duyệt
                    </span>
                  )}
                </div>
              </div>

              <p className="mt-3 pt-2.5 border-t border-emerald-200/70 dark:border-emerald-800/60 text-[11px] text-emerald-800/85 dark:text-emerald-300/85 font-medium">
                {scheduleStatus === 'approved'
                  ? 'Admin đã phê duyệt lịch làm việc tuần tới của bạn. Hệ thống sẽ không hiển thị lời nhắc đăng ký lại.'
                  : `Lịch làm của bạn đã được lưu cho tuần ${weekInfo.weekDisplay} và không hiển thị thông báo làm phiền nữa.${isOpen ? ' Bạn vẫn có thể bấm "Chỉnh sửa đăng ký ca" bên dưới trước 17:00 Thứ Bảy nếu cần đổi ca.' : ''}`}
              </p>
            </div>
          )}

      {/* Approved Shifts Display */}
      {approvedShifts && approvedShifts.length > 0 && (
        <div className="soft3d-card p-4 rounded-2xl  border-2 border-green-200 dark:border-green-700 mb-6">
          <h3 className="text-sm font-bold text-green-600 dark:text-green-400 uppercase tracking-wider mb-3 flex items-center">
            <CalendarCheck size={16} className="mr-2" /> Lịch đã duyệt
          </h3>
          <div className="grid grid-cols-7 gap-1">
            {SHORT_DAY_NAMES.map((shortDayName, i) => {
              const approved = approvedShifts[i] || 'OFF';
              const registered = registeredShifts?.[i];
              const isChanged = registered && approved !== registered;
              return (
                <div key={i} className="flex flex-col items-center">
                  <span className="text-[11px] font-extrabold text-gray-800 dark:text-gray-200">
                    {weekInfo.weekDates[i]}
                  </span>
                  <span className="text-[9px] text-gray-500 font-bold mb-1.5 uppercase">
                    {shortDayName}
                  </span>
                  <div className={`w-full text-center py-2 px-0.5 rounded-xl text-xs font-black tracking-tight transition-all shadow-xs ${getPreviewShiftClass(approved)} ${isChanged ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}>
                    <ResponsiveShift shift={approved} />
                  </div>
                  {isChanged && (
                    <span className="text-[8px] text-amber-500 font-bold mt-0.5">Đã đổi</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === REGISTERED PREVIEW (not editing) === */}
      {isRegisteredForTargetWeek && !isEditing && (
        <div className="soft3d-card p-4 sm:p-5 rounded-2xl mb-6 shadow-sm border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3.5">
            <h3 className="text-sm font-black text-[var(--kg-text)] uppercase tracking-wider flex items-center">
              <Eye size={16} className="mr-2 text-[var(--kg-primary)]" /> Lịch đã đăng ký
            </h3>
            {approvedShifts && approvedShifts.length > 0 ? (
              <span className="px-3 py-1 rounded-full text-xs font-black bg-[var(--kg-success-soft)] text-[var(--kg-success)] border border-[var(--kg-success)]/30 shadow-2xs">
                Đã duyệt
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-black bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/30 shadow-2xs">
                Chờ duyệt
              </span>
            )}
          </div>
          {renderShiftGrid((i) => effectiveRegisteredShifts?.[i] || shiftData[weekInfo.weekDatesKeys[i]] || 'OFF')}

          {/* BQL Official Acknowledgment Notice */}
          <div className="mt-4 p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-900 dark:text-blue-200 leading-relaxed shadow-xs">
            <div className="flex items-start gap-2.5">
              <Info size={18} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="font-extrabold text-blue-700 dark:text-blue-300">
                  Lịch đăng ký ca của bạn đã được ghi nhận.
                </p>
                <p className="text-[11px] text-blue-800/90 dark:text-blue-200/90">
                  BQL sẽ sắp xếp lại phù hợp theo nhu cầu của nhà hàng. Trường hợp lịch không được duyệt nhưng lịch làm trùng lịch học, thi cử quan trọng hãy gửi lịch học/thi và báo BQL duyệt nhé!
                </p>
              </div>
            </div>
          </div>

          {/* Edit button - only when registration window is open */}
          {isOpen && (
            <button 
              type="button"
              onClick={startEditing}
              className="mt-4 w-full bg-[var(--kg-primary)] hover:brightness-110 text-white font-black py-3.5 rounded-2xl shadow-md transition-all transform active:scale-98 flex items-center justify-center touch-manipulation text-xs sm:text-sm tracking-wider uppercase"
            >
              <Pencil size={16} className="mr-2 text-[var(--kg-accent)]" /> Chỉnh sửa đăng ký ca
            </button>
          )}
        </div>
      )}

      {/* === CLOSED WINDOW (not registered) === */}
      {!isOpen && !isRegisteredForTargetWeek && (
        <>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-800 text-red-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Lock size={20} />
            </div>
            <div>
              <h4 className="font-bold text-red-700 dark:text-red-400 text-sm">Đã đóng đăng ký</h4>
              <p className="text-xs text-red-600 dark:text-red-500">{regWindow.message}</p>
            </div>
          </div>
          <div className="paint-layer p-6 text-center mb-6">
            <AlertTriangle size={32} className="mx-auto text-gray-400 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Bạn chưa đăng ký ca cho tuần tới.</p>
            <p className="text-xs text-gray-400 mt-1">Vui lòng đăng ký khi mở đăng ký vào Thứ Hai.</p>
          </div>
        </>
      )}

      {/* === CLOSED WINDOW (registered - already shown pending status above, no error needed) === */}

      {/* === NOT REGISTERED + OPEN WINDOW === */}
      {isOpen && !isRegisteredForTargetWeek && (
        <>
          {/* Preview grid */}
          <div className="soft3d-card p-4 rounded-2xl   mb-6">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
              <Eye size={16} className="mr-2" /> Bản xem trước
            </h3>
            {renderShiftGrid((i) => shiftData[weekInfo.weekDatesKeys[i]] || 'OFF')}
          </div>
        </>
      )}

      {/* === REGISTRATION FORM (new registration or editing) === */}
      {showRegistrationForm && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl px-4 py-3 shadow-2xs">
            <div className="text-xs text-[var(--kg-text-muted)] font-medium">
              Muốn giữ nguyên khung giờ làm như tuần này? Điền tự động đủ 7 ngày chỉ với 1 chạm:
            </div>
            <button
              type="button"
              onClick={handleCopyEmployeeCurrentWeek}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-[var(--kg-accent-soft)] text-[var(--kg-primary)] border border-[var(--kg-primary)]/25 hover:bg-[var(--kg-primary)] hover:text-white transition-all active:scale-95"
            >
              <Copy size={14} /> Sao chép lịch tuần này
            </button>
          </div>

          {/* Editing banner */}
          {isEditing && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-3 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <Pencil size={14} className="text-amber-600 mr-2" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Đang chỉnh sửa đăng ký</span>
              </div>
              <button onClick={cancelEditing}
                className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition">
                Hủy
              </button>
            </div>
          )}

          {/* Preview grid (editing mode) */}
          {isEditing && (
            <div className="soft3d-card p-4 rounded-2xl   mb-6">
              <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                <Eye size={16} className="mr-2" /> Bản xem trước
              </h3>
              {renderShiftGrid((i) => shiftData[weekInfo.weekDatesKeys[i]] || 'OFF')}
            </div>
          )}

          {/* Day-by-day shift selection */}
          <div className="space-y-4 mb-6">
            {SHORT_DAY_NAMES.map((shortDayName, index) => {
              const key = weekInfo.weekDatesKeys[index];
              const currentShift = shiftData[key] || 'OFF';
              return (
                <div
                  key={index}
                  className={`calendar-registration-day soft3d-card p-4 rounded-2xl transition hover:shadow-md ${weekDayMeta[index].className}`}
                  title={weekDayMeta[index].label || undefined}
                >
                  <div className="flex justify-between items-center mb-3">
                    <span className={`font-bold ${index >= 4 && currentShift === 'OFF' ? 'text-red-500' : 'text-gray-800 dark:text-white'}`}>
                      {weekInfo.weekDates[index]} <span className="text-sm text-gray-500 dark:text-gray-400 font-medium ml-1">({shortDayName})</span>
                      {weekDayMeta[index].kind !== 'normal' && (
                        <span className="calendar-day-label ml-2 text-xs px-1.5 py-0.5 rounded">
                          {weekDayMeta[index].kind === 'holiday'
                            ? 'Lễ/Tết'
                            : weekDayMeta[index].kind === 'fnb'
                              ? 'Cao điểm F&B'
                              : 'Cuối tuần'}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
                    {SHIFT_OPTIONS.map((shift) => (
                      <button 
                        key={shift} 
                        type="button"
                        onClick={() => handleShiftChange(key, shift)}
                        className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all transform active:scale-95 touch-manipulation min-h-[40px] flex items-center justify-center ${currentShift === shift ? getActiveShiftClass(shift) : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] hover:bg-[var(--kg-border)]/50'}`}
                      >
                        <ResponsiveShift shift={shift} />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Warning + reason input */}
          {(hasWeekendOff || hasConsecutiveOffs || hasHolidayOff) && (
            <div className="bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/35 p-4 rounded-2xl mb-6 animate-fade-in shadow-2xs">
              <div className="flex items-start">
                <AlertTriangle size={20} className="text-[var(--kg-danger)] mt-0.5 mr-3 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-bold text-[var(--kg-danger)] text-sm mb-1">Quy định nộp lịch</h4>
                  <ul className="text-xs text-[var(--kg-text)] list-disc list-inside mb-3 space-y-1 ml-1 font-medium">
                    {hasConsecutiveOffs && <li>Bạn đang chọn OFF từ 2 ngày liên tiếp trở lên.</li>}
                    {hasWeekendOff && <li>Bạn đang chọn OFF vào ngày cuối tuần (T6, T7 hoặc CN).</li>}
                    {hasHolidayOff && <li>Bạn đang chọn OFF vào ngày Lễ/Tết cao điểm.</li>}
                  </ul>
                  <p className="text-xs font-medium text-[var(--kg-text-muted)] mb-3">
                    Vui lòng nhập lý do bên dưới VÀ gửi hình ảnh minh chứng vào nhóm Zalo lịch làm: <br />
                    <a href="https://zalo.me/g/zkowlm391" target="_blank" rel="noreferrer" className="inline-flex items-center text-[var(--kg-primary)] bg-[var(--kg-primary-soft)] border border-[var(--kg-primary)]/20 px-2.5 py-1 rounded-lg mt-1.5 hover:underline font-bold">
                      <ExternalLink size={12} className="mr-1" /> Mở nhóm Zalo lịch làm
                    </a>
                  </p>
                  <label htmlFor="schedule-off-reason" className="block text-xs font-bold text-[var(--kg-text)] mb-1.5">
                    Lý do xin nghỉ cụ thể
                  </label>
                  <textarea 
                    id="schedule-off-reason"
                    value={offReason} 
                    onChange={(e) => store.setOffReason(e.target.value)}
                    className="w-full bg-[var(--kg-surface)] border border-[var(--kg-danger)]/40 rounded-xl p-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-danger)] text-[var(--kg-text)]" 
                    rows={3} 
                    placeholder="Nhập lý do xin nghỉ cụ thể..." 
                  />
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <button 
            type="button"
            disabled={isSubmitting}
            onClick={submitRegistration} 
            className="w-full bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-black py-3.5 rounded-xl shadow-sm transition-all active:scale-99 flex items-center justify-center touch-manipulation text-sm tracking-wide uppercase disabled:opacity-75 disabled:pointer-events-none"
          >
            {isSubmitting ? (
              <><RefreshCw size={18} className="animate-spin mr-2" /> ĐANG ĐẨY VÀO GOOGLE SHEETS...</>
            ) : isRegisteredForTargetWeek ? (
              <><RefreshCw size={18} className="mr-2" /> CẬP NHẬT LỊCH ĐĂNG KÝ</>
            ) : (
              <><Send size={18} className="mr-2" /> GỬI LỊCH ĐĂNG KÝ</>
            )}
          </button>
          
          <p className="text-center text-[11px] font-semibold text-[var(--kg-text-muted)] mt-3">
            {isRegisteredForTargetWeek
              ? 'Bạn có thể cập nhật lịch không giới hạn trong thời gian mở đăng ký.'
              : 'Hạn đăng ký: Trước 17:00 Thứ Bảy hàng tuần.'}
          </p>
        </>
      )}
      </>
      )}
      {/* AI Schedule Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4 animate-fade-in">
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-5 flex-shrink-0 border-b border-[var(--kg-border)] flex justify-between items-center bg-[var(--kg-surface-soft)]">
              <div className="flex items-center text-[var(--kg-primary)]">
                <Bot size={22} className="mr-2.5" />
                <h3 className="text-base sm:text-lg font-extrabold text-[var(--kg-text)]">Xếp ca nhanh bằng AI</h3>
              </div>
              <button type="button" onClick={() => !isAiProcessing && setAiModalOpen(false)} aria-label="Đóng" className="p-2 hover:bg-[var(--kg-border)]/40 rounded-lg transition-colors text-[var(--kg-text-muted)]">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar flex-grow">
              <p className="text-xs sm:text-sm text-[var(--kg-text-muted)] mb-4 leading-relaxed">
                Dán tin nhắn đăng ký ca hoặc đoạn văn bản chứa lịch làm của nhân viên vào đây. AI sẽ tự động phân tích và điền vào bảng cho bạn.
                <br/>Ví dụ: <em className="text-[var(--kg-text-soft)]">"Huy đăng ký thứ 2 18h, t3 19h. Trang nghỉ t7 chủ nhật, còn lại 17h."</em>
              </p>
              
              <label htmlFor="ai-schedule-input" className="block text-xs font-bold text-[var(--kg-text)] mb-1.5">
                Nội dung tin nhắn đăng ký ca
              </label>
              <textarea
                id="ai-schedule-input"
                value={aiInputText}
                onChange={(e) => setAiInputText(e.target.value)}
                placeholder="Dán nội dung phân ca vào đây..."
                className="w-full h-40 md:h-60 p-3.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] resize-none transition-all"
                disabled={isAiProcessing}
              ></textarea>
            </div>
            
            <div className="p-4 md:p-5 border-t border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex justify-end gap-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setAiModalOpen(false)}
                disabled={isAiProcessing}
                className="px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--kg-text-muted)] bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:text-[var(--kg-text)] transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleAiProcess}
                disabled={isAiProcessing || !aiInputText.trim()}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white shadow-xs transition-all flex items-center disabled:opacity-50"
              >
                {isAiProcessing ? (
                  <><RefreshCw size={16} className="animate-spin mr-2" /> Đang xử lý...</>
                ) : (
                  <><Sparkles size={16} className="mr-2" /> Phân Tích & Điền Ca</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
