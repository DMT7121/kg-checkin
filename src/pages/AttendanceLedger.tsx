import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type LogEntry } from '../store/useAppStore';
import { kgToast } from '../store/useFeedbackStore';
import { openPreview } from '../components/ImagePreview';
import CalendarGrid from '../components/CalendarGrid';
import MissedCheckInModal from '../components/MissedCheckInModal';
import {
  generateMonthDates,
  SHORT_DAY_NAMES,
  getVietnamDateParts,
  speak,
  fetchWithRetry,
  auditCheckInAnomalies,
  matchesUser,
  parseLogDate,
  isCheckInLabel,
  isCheckOutLabel,
  isPendingSupplementLabel,
  isPendingCheckInSupplementLabel,
  isPendingCheckOutSupplementLabel,
  isRejectedSupplementLabel,
} from '../utils/helpers';
import { formatUnifiedPunchLabel } from '../utils/attendanceSequence';
import { callApi } from '../services/api';
import { refreshAppData, saveModuleCache } from '../utils/refreshData';
import { enqueueTask } from '../utils/offlineQueue';
import {
  calculateEmployeeMonthTimesheet,
  formatDayDateKey,
  type UserMonthSummary,
} from '../utils/timesheetCalculator';
import {
  Clock,
  Calendar,
  Search,
  List,
  ListOrdered,
  Eye,
  ArrowLeft,
  RefreshCw,
  Zap,
  AlertTriangle,
  PlusCircle,
  Sparkles,
  Users,
  Edit3,
  CheckCircle2,
  CircleCheck,
  CircleAlert,
  Loader2,
  PackageOpen,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  X,
  CloudUpload,
  Smartphone,
  ShieldCheck,
  CalendarDays,
} from 'lucide-react';
import {
  KgModuleHero,
  KgBottomSheet,
  KgButton,
  KgTextarea,
  KgAlertCard,
  KgCard,
} from '../components/KgDesignSystem';

export type LedgerView = 'ledger' | 'calendar' | 'log';
type TypeFilter = 'ALL' | 'IN' | 'OUT' | 'ANOMALY';
type MatrixDisplayMode = 'HOURS' | 'TIMESTAMPS';

function getLogTimestampMs(log: LogEntry): number {
  if (typeof log.timestamp === 'number' && log.timestamp > 0) return log.timestamp;
  const parsed = parseLogDate(log.time);
  return parsed ? parsed.getTime() : 0;
}

function extractMonthYmFromLog(log: LogEntry): string {
  const clean = String(log.time || '').replace(/^'/, '').trim();
  const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(parseInt(dmy[2], 10)).padStart(2, '0')}`;
  }
  const parsed = parseLogDate(clean);
  if (parsed) {
    const vn = getVietnamDateParts(parsed);
    return `${vn.year}-${String(vn.month).padStart(2, '0')}`;
  }
  return '';
}

function extractDmyFromLog(log: LogEntry): string {
  const clean = String(log.time || '').replace(/^'/, '').trim();
  const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    return `${String(parseInt(dmy[1], 10)).padStart(2, '0')}/${String(parseInt(dmy[2], 10)).padStart(2, '0')}/${dmy[3]}`;
  }
  const parsed = parseLogDate(clean);
  if (parsed) {
    const vn = getVietnamDateParts(parsed);
    return `${String(vn.day).padStart(2, '0')}/${String(vn.month).padStart(2, '0')}/${vn.year}`;
  }
  return '';
}

function extractDateHeaderFromLog(log: LogEntry): { key: string; label: string } {
  const parsed = parseLogDate(log.time);
  if (parsed) {
    const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const vn = getVietnamDateParts(parsed);
    const dd = String(vn.day).padStart(2, '0');
    const mm = String(vn.month).padStart(2, '0');
    return {
      key: `${vn.year}-${mm}-${dd}`,
      label: `${weekdays[vn.dayOfWeek]}, ${dd}/${mm}/${vn.year}`,
    };
  }
  const clean = String(log.time || '').replace(/^'/, '').trim();
  const datePart = clean.split(' ')[0] || 'Không rõ ngày';
  return { key: datePart, label: datePart };
}

function formatMonthLabel(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  return `Tháng ${m[2]}/${m[1]}`;
}

function makeLogDedupeKey(log: LogEntry): string {
  const normName = String(log.fullname || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const cleanTime = String(log.time || '').replace(/^'/, '').trim();
  const cleanType = String(log.type || '').trim().toLowerCase();
  const rowTag = log.rowIndex ? `r${log.rowIndex}:${log.sourceSheet || ''}` : '';
  return `${normName}|${cleanTime}|${cleanType}|${rowTag}`;
}

function makeLooseDedupeKey(log: LogEntry): string {
  const normName = String(log.fullname || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const cleanTime = String(log.time || '').replace(/^'/, '').trim();
  const cleanType = String(log.type || '').trim().toLowerCase();
  return `${normName}|${cleanTime}|${cleanType}`;
}

function getPunchSyncState(log: LogEntry) {
  const isPendingSupp = isPendingSupplementLabel(log.type);
  const isRejectedSupp = isRejectedSupplementLabel(log.type);
  const isIn = isCheckInLabel(log.type);
  const isLocalQueued = Boolean(
    log.localQueued || log.status?.includes('Lưu tạm') || log.status?.includes('Chờ mạng'),
  );
  const isEdgeBuffered = Boolean(
    !isLocalQueued &&
      (log.edgeBuffered || log.sheetSynced === false || log.status?.includes('Đám mây')),
  );
  const isPendingStatus = Boolean(log.status?.includes('Chờ'));
  const isValid =
    !isLocalQueued &&
    !isEdgeBuffered &&
    (log.status?.includes('Hợp lệ') ||
      log.status?.includes('HỢP LỆ') ||
      log.status === 'Đồng bộ...' ||
      log.status === 'Đang đồng bộ...');
  return {
    isPendingSupp,
    isRejectedSupp,
    isIn,
    isLocalQueued,
    isEdgeBuffered,
    isPendingStatus,
    isValid,
  };
}

export default function AttendanceLedger({
  initialView = 'ledger',
}: {
  initialView?: 'ledger' | 'log';
}) {
  const { logs, currentUser, isUpdating, groqKeys, users, timesheetData, setTimesheetData } =
    useAppStore(
      useShallow((s) => ({
        logs: s.logs,
        currentUser: s.currentUser,
        isUpdating: s.isUpdating,
        groqKeys: s.groqKeys,
        users: s.users,
        timesheetData: s.timesheetData,
        setTimesheetData: s.setTimesheetData,
      })),
    );

  const isAdmin = currentUser?.role === 'admin';
  const defaultMonth = useMemo(() => {
    const vn = getVietnamDateParts();
    return `${vn.year}-${String(vn.month).padStart(2, '0')}`;
  }, []);

  const [activeView, setActiveView] = useState<LedgerView>(initialView);
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [onlyShowWorkdays, setOnlyShowWorkdays] = useState<boolean>(true);
  const [matrixDisplayMode, setMatrixDisplayMode] = useState<MatrixDisplayMode>('HOURS');
  const [visibleLimit, setVisibleLimit] = useState<number>(80);
  const [expandedDayKeys, setExpandedDayKeys] = useState<Record<string, boolean>>({});

  // Timesheet state
  const [viewTimesheetData, setViewTimesheetData] = useState(timesheetData);
  const [isRefreshingTimesheet, setIsRefreshingTimesheet] = useState<boolean>(false);
  const [timesheetLoadError, setTimesheetLoadError] = useState<string | null>(null);

  // Full remote logs state
  const [fullRemoteLogs, setFullRemoteLogs] = useState<LogEntry[] | null>(null);
  const [remoteAvailableMonths, setRemoteAvailableMonths] = useState<string[]>([]);
  const [isLoadingFullLogs, setIsLoadingFullLogs] = useState<boolean>(false);

  // Modals & sheets
  const [missedModalTarget, setMissedModalTarget] = useState<{
    dateStr: string;
    missingType: 'Vào ca' | 'Ra ca';
    timeStr?: string;
  } | null>(null);
  const [calendarDetailDay, setCalendarDetailDay] = useState<number | null>(null);

  // Edit punch type sheet
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [newTypeChoice, setNewTypeChoice] = useState<string>('Vào ca');
  const [editReason, setEditReason] = useState<string>('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // AI review sheet (secondary header icon button)
  const [aiReviewSheet, setAiReviewSheet] = useState<{
    open: boolean;
    loading: boolean;
    text: string;
    error?: string;
  }>({ open: false, loading: false, text: '' });
  const [inlineNotice, setInlineNotice] = useState<{
    variant: 'error' | 'warning' | 'success' | 'info';
    title: string;
    text: string;
  } | null>(null);

  const effectiveTimesheetMonth = selectedMonth === 'ALL' ? defaultMonth : selectedMonth;

  const [year, month, daysInTargetMonth] = useMemo(() => {
    const [yStr, mStr] = effectiveTimesheetMonth.split('-');
    const vn = getVietnamDateParts();
    const y = Number(yStr) || vn.year;
    const m = Number(mStr) || vn.month;
    return [y, m, new Date(y, m, 0).getDate()];
  }, [effectiveTimesheetMonth]);

  const todayDmy = useMemo(() => {
    const vn = getVietnamDateParts();
    return formatDayDateKey(vn.day, vn.month, vn.year);
  }, []);

  const days = useMemo(
    () => Array.from({ length: daysInTargetMonth }, (_, i) => i + 1),
    [daysInTargetMonth],
  );
  const monthDates = useMemo(() => generateMonthDates(month, year), [month, year]);

  const isCurrentMonthSelected = effectiveTimesheetMonth === defaultMonth;
  const activeTimesheet = isCurrentMonthSelected
    ? viewTimesheetData || timesheetData
    : viewTimesheetData;

  const selectedAdminTarget = useMemo(() => {
    if (!isAdmin || selectedUser === 'ALL') return null;
    return (
      users.find((u) => u.fullname === selectedUser || u.username === selectedUser) || {
        fullname: selectedUser,
        username: '',
      }
    );
  }, [isAdmin, selectedUser, users]);

  const currentUsername = currentUser?.username;
  const currentUserRole = currentUser?.role;

  // Fetch Monthly Timesheet
  const fetchMonthTimesheet = useCallback(async () => {
    if (!currentUsername) return;
    const isCurrentMonth = effectiveTimesheetMonth === defaultMonth;
    const cachedTs = useAppStore.getState().timesheetData;
    const hasCached = Boolean(isCurrentMonth && cachedTs && cachedTs.timesheet);
    setTimesheetLoadError(null);
    if (!hasCached) {
      setIsRefreshingTimesheet(true);
    }
    try {
      const res = await callApi(
        'GET_TIMESHEET',
        {
          username: currentUsername,
          role: currentUserRole,
          month: effectiveTimesheetMonth,
        },
        { background: true, cacheTtlMs: isCurrentMonth ? undefined : 0 },
      );

      setIsRefreshingTimesheet(false);
      if (res?.ok && res.data) {
        setViewTimesheetData(res.data);
        if (isCurrentMonth) {
          setTimesheetData(res.data);
          saveModuleCache('timesheet', res.data);
        }
        setTimesheetLoadError(null);
      } else if (!hasCached) {
        setTimesheetLoadError(
          res?.message || 'Không thể tải bảng tổng hợp công. Vui lòng thử lại.',
        );
      }
    } catch {
      setIsRefreshingTimesheet(false);
      if (!hasCached) {
        setTimesheetLoadError('Mất kết nối khi tải bảng công. Vui lòng thử lại.');
      }
    }
  }, [currentUsername, currentUserRole, defaultMonth, effectiveTimesheetMonth, setTimesheetData]);

  // Fetch Complete Check-in Logs
  const fetchCompleteHistory = useCallback(
    async (forceRefresh = false) => {
      if (!currentUser?.username && !currentUser?.fullname) return;
      setIsLoadingFullLogs(true);
      try {
        const payload: Record<string, any> = {
          username: currentUser.username,
          fullname: currentUser.fullname,
          role: currentUser.role || 'user',
          month: selectedMonth,
          includeAllArchiveSheets: selectedMonth !== 'ALL',
          forceRefresh,
        };

        if (isAdmin) {
          if (selectedAdminTarget) {
            payload.targetFullname = selectedAdminTarget.fullname;
            if (selectedAdminTarget.username) {
              payload.targetUsername = selectedAdminTarget.username;
            }
          } else {
            payload.targetFullname = 'ALL';
            payload.targetUsername = 'ALL';
          }
        }

        const res = await callApi('GET_CHECKIN_LOGS', payload, {
          background: true,
          cacheTtlMs: forceRefresh ? 0 : 45_000,
        });

        if (res?.ok && Array.isArray(res.data?.logs)) {
          setFullRemoteLogs(res.data.logs);
          if (Array.isArray(res.data.availableMonths) && res.data.availableMonths.length > 0) {
            setRemoteAvailableMonths((prev) => {
              const mergedSet = new Set([...prev, ...res.data.availableMonths]);
              return Array.from(mergedSet).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
            });
          }
        }
      } catch (err) {
        console.warn('[AttendanceLedger] GET_CHECKIN_LOGS fallback to store logs:', err);
      } finally {
        setIsLoadingFullLogs(false);
      }
    },
    [currentUser, isAdmin, selectedAdminTarget, selectedMonth],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchMonthTimesheet();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchMonthTimesheet]);

  useEffect(() => {
    void fetchCompleteHistory(false);
  }, [fetchCompleteHistory]);

  useEffect(() => {
    setVisibleLimit(80);
  }, [selectedUser, selectedMonth, typeFilter, searchQuery]);

  const handleMonthChange = (nextYm: string) => {
    const resolved = nextYm || defaultMonth;
    setSelectedMonth(resolved);
    if (resolved !== 'ALL' && resolved !== selectedMonth) {
      setViewTimesheetData(null);
    }
  };

  const handleManualRefresh = () => {
    void refreshAppData(true);
    void fetchMonthTimesheet();
    void fetchCompleteHistory(true);
  };

  // Pre-calculate all employee monthly summaries via timesheetCalculator.ts
  const employeeSummaries = useMemo<Record<string, UserMonthSummary>>(() => {
    if (!activeTimesheet || !activeTimesheet.timesheet) return {};
    const map: Record<string, UserMonthSummary> = {};
    for (const name of Object.keys(activeTimesheet.timesheet)) {
      map[name] = calculateEmployeeMonthTimesheet(
        name,
        activeTimesheet.timesheet[name] || {},
        daysInTargetMonth,
        month,
        year,
      );
    }
    return map;
  }, [activeTimesheet, daysInTargetMonth, month, year]);

  // Combine complete remote logs + latest local/optimistic store logs
  const mergedUserScopedLogs = useMemo(() => {
    const storeMatching = logs.filter((l) => {
      if (!isAdmin) return matchesUser(l, currentUser);
      if (selectedAdminTarget) return matchesUser(l, selectedAdminTarget);
      return true;
    });

    const baseList = fullRemoteLogs !== null ? fullRemoteLogs : storeMatching;
    const remoteFiltered = baseList.filter((l) => {
      if (!isAdmin) return matchesUser(l, currentUser);
      if (selectedAdminTarget) return matchesUser(l, selectedAdminTarget);
      return true;
    });

    const combined: LogEntry[] = [...remoteFiltered];
    const looseSeen = new Set(remoteFiltered.map(makeLooseDedupeKey));

    for (const localLog of storeMatching) {
      if (selectedMonth !== 'ALL') {
        const localYm = extractMonthYmFromLog(localLog);
        if (localYm && localYm !== selectedMonth) continue;
      }
      const lk = makeLooseDedupeKey(localLog);
      if (!looseSeen.has(lk)) {
        looseSeen.add(lk);
        combined.push(localLog);
      }
    }

    combined.sort((a, b) => getLogTimestampMs(b) - getLogTimestampMs(a));
    return combined;
  }, [fullRemoteLogs, logs, isAdmin, currentUser, selectedAdminTarget, selectedMonth]);

  // Available months options
  const monthOptions = useMemo(() => {
    const set = new Set<string>(remoteAvailableMonths);
    set.add(defaultMonth);
    const vn = getVietnamDateParts();
    for (let i = 1; i <= 3; i++) {
      const d = new Date(Date.UTC(vn.year, vn.month - 1 - i, 1));
      set.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    for (const l of logs) {
      const ym = extractMonthYmFromLog(l);
      if (ym) set.add(ym);
    }
    for (const l of mergedUserScopedLogs) {
      const ym = extractMonthYmFromLog(l);
      if (ym) set.add(ym);
    }
    return Array.from(set)
      .filter(Boolean)
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [remoteAvailableMonths, defaultMonth, logs, mergedUserScopedLogs]);

  // Audit anomalies
  const anomalyTarget = isAdmin && selectedAdminTarget ? selectedAdminTarget : currentUser;
  const anomalies = useMemo(
    () => auditCheckInAnomalies(mergedUserScopedLogs, anomalyTarget),
    [mergedUserScopedLogs, anomalyTarget],
  );
  const anomalyByTime = useMemo(() => {
    const map = new Map<string, (typeof anomalies)[number]>();
    for (const a of anomalies) {
      if (!map.has(a.logTime)) map.set(a.logTime, a);
    }
    return map;
  }, [anomalies]);

  const monthScopedLogs = useMemo(() => {
    if (selectedMonth === 'ALL') return mergedUserScopedLogs;
    return mergedUserScopedLogs.filter((l) => extractMonthYmFromLog(l) === selectedMonth);
  }, [mergedUserScopedLogs, selectedMonth]);

  // Index logs by DD/MM/YYYY for instant inline expansion in Ledger & Calendar views
  const logsByDmy = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    for (const log of monthScopedLogs) {
      const dmy = extractDmyFromLog(log);
      if (!dmy) continue;
      const list = map.get(dmy);
      if (list) list.push(log);
      else map.set(dmy, [log]);
    }
    return map;
  }, [monthScopedLogs]);

  const countsByType = useMemo(() => {
    let checkIn = 0;
    let checkOut = 0;
    let valid = 0;
    let anomalyCnt = 0;
    for (const l of monthScopedLogs) {
      if (isCheckInLabel(l.type) || isPendingCheckInSupplementLabel(l.type)) checkIn++;
      else if (isCheckOutLabel(l.type) || isPendingCheckOutSupplementLabel(l.type)) checkOut++;
      const state = getPunchSyncState(l);
      if (!state.isLocalQueued && (state.isEdgeBuffered || state.isValid)) valid++;
      if (anomalyByTime.has(l.time)) anomalyCnt++;
    }
    return {
      total: monthScopedLogs.length,
      checkIn,
      checkOut,
      valid,
      anomaly: anomalyCnt,
    };
  }, [monthScopedLogs, anomalyByTime]);

  // Filtered staff names for Admin All-Staff Matrix
  const displayNames = useMemo(() => {
    if (!activeTimesheet?.timesheet) return [];
    const cleanQuery = searchQuery
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return Object.keys(activeTimesheet.timesheet).filter((name) => {
      if (!isAdmin) return name === currentUser?.fullname;
      if (selectedUser !== 'ALL' && name !== selectedUser) return false;
      if (cleanQuery) {
        const cleanName = name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        if (!cleanName.includes(cleanQuery)) return false;
      }
      return true;
    });
  }, [activeTimesheet, isAdmin, currentUser?.fullname, selectedUser, searchQuery]);

  // Target user for personal Ledger & Calendar views
  const targetUser = useMemo(
    () => (isAdmin && selectedUser !== 'ALL' ? selectedUser : currentUser?.fullname || ''),
    [isAdmin, selectedUser, currentUser?.fullname],
  );
  const targetSummary = employeeSummaries[targetUser];

  // Unified 4-stat KPI metrics
  const kpiMetrics = useMemo(() => {
    if (isAdmin && selectedUser === 'ALL') {
      let totalHours = 0;
      let overtimeHours = 0;
      let workedDays = 0;
      for (const name of displayNames) {
        const s = employeeSummaries[name];
        if (!s) continue;
        totalHours += s.totalMonthHours || 0;
        overtimeHours += s.totalOvertimeHours || 0;
        workedDays += s.workedDaysCount || 0;
      }
      return { totalHours, overtimeHours, workedDays };
    }
    return {
      totalHours: targetSummary?.totalMonthHours || 0,
      overtimeHours: targetSummary?.totalOvertimeHours || 0,
      workedDays: targetSummary?.workedDaysCount || 0,
    };
  }, [isAdmin, selectedUser, displayNames, employeeSummaries, targetSummary]);

  // Day-by-day ledger items for target user
  const workdayList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return days.map((d) => {
      const dateObj = new Date(Date.UTC(year, month - 1, d, 5, 0, 0));
      const dayOfWeek = getVietnamDateParts(dateObj).dayOfWeek;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const dayRes = targetSummary?.days[d];
      const dateStr = dayRes?.dateStr || formatDayDateKey(d, month, year);
      const dayLogs = logsByDmy.get(dateStr) || [];
      const hasLocalOrEdge = dayLogs.some((l) => {
        const st = getPunchSyncState(l);
        return st.isLocalQueued || st.isEdgeBuffered;
      });
      const hasAnomaly = dayLogs.some((l) => anomalyByTime.has(l.time));
      const hasData =
        (dayRes?.totalHours || 0) > 0 ||
        (dayRes?.timeText || '') !== '' ||
        dayLogs.length > 0;

      const matchesSearch =
        !q ||
        dateStr.toLowerCase().includes(q) ||
        SHORT_DAY_NAMES[dayIndex].toLowerCase().includes(q) ||
        (dayRes?.timeText || '').toLowerCase().includes(q) ||
        dayLogs.some((l) =>
          `${l.time} ${l.type} ${l.status || ''} ${l.note || ''}`.toLowerCase().includes(q),
        );

      return {
        day: d,
        isWeekend,
        dayLabel: SHORT_DAY_NAMES[dayIndex],
        dateStr,
        hours: dayRes?.totalHours || 0,
        regularHours: dayRes?.regularHours || 0,
        overtimeHours: dayRes?.overtimeHours || 0,
        sessions: dayRes?.sessions || [],
        text: dayRes?.timeText || '',
        hasOvertime: dayRes?.hasOvertime || false,
        hasMissingCheckout: dayRes?.hasMissingCheckout || false,
        isToday: dateStr === todayDmy,
        hasData,
        dayLogs,
        hasLocalOrEdge,
        hasAnomaly,
        matchesSearch,
      };
    });
  }, [days, year, month, targetSummary, logsByDmy, anomalyByTime, todayDmy, searchQuery]);

  const filteredWorkdays = useMemo(
    () =>
      workdayList.filter((item) => {
        if (!item.matchesSearch) return false;
        if (onlyShowWorkdays) return item.hasData;
        return true;
      }),
    [workdayList, onlyShowWorkdays],
  );

  // Filtered raw punch stream for 'log' view
  const displayLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return monthScopedLogs.filter((log) => {
      const isIn = isCheckInLabel(log.type) || isPendingCheckInSupplementLabel(log.type);
      const isOut = isCheckOutLabel(log.type) || isPendingCheckOutSupplementLabel(log.type);
      if (typeFilter === 'IN' && !isIn) return false;
      if (typeFilter === 'OUT' && !isOut) return false;
      if (typeFilter === 'ANOMALY' && !anomalyByTime.has(log.time)) return false;

      if (q) {
        const hay =
          `${log.time} ${log.type} ${log.fullname} ${log.status || ''} ${log.note || ''} ${log.location || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [monthScopedLogs, typeFilter, searchQuery, anomalyByTime]);

  const visibleLogs = useMemo(
    () => displayLogs.slice(0, visibleLimit),
    [displayLogs, visibleLimit],
  );

  const groupedVisibleLogs = useMemo(() => {
    const groups: {
      dateKey: string;
      dateLabel: string;
      inCount: number;
      outCount: number;
      items: LogEntry[];
    }[] = [];
    const map = new Map<string, (typeof groups)[number]>();

    for (const log of visibleLogs) {
      const { key, label } = extractDateHeaderFromLog(log);
      let grp = map.get(key);
      if (!grp) {
        grp = { dateKey: key, dateLabel: label, inCount: 0, outCount: 0, items: [] };
        map.set(key, grp);
        groups.push(grp);
      }
      if (isCheckInLabel(log.type) || isPendingCheckInSupplementLabel(log.type)) grp.inCount++;
      else if (isCheckOutLabel(log.type) || isPendingCheckOutSupplementLabel(log.type))
        grp.outCount++;
      grp.items.push(log);
    }
    return groups;
  }, [visibleLogs]);

  // AI Productivity Review (demoted to secondary header icon button)
  const analyzeMyProductivity = async () => {
    setInlineNotice(null);
    const myLogsList = mergedUserScopedLogs.filter((l) => matchesUser(l, currentUser));
    if (myLogsList.length === 0) {
      kgToast('Bạn chưa có dữ liệu chấm công để AI đánh giá.', 'info');
      return;
    }

    setAiReviewSheet({ open: true, loading: true, text: '' });

    const myLogs = myLogsList
      .slice(0, 12)
      .map((l) => `${l.type} lúc ${l.time} - Trạng thái: ${l.status}`);
    const promptText = `Đây là lịch sử đi làm của tôi (${currentUser?.fullname}, tổng cộng ${myLogsList.length} lượt ghi nhận): \n${myLogs.join('\n')}\nHãy đưa ra một lời nhận xét thật vui vẻ, tự nhiên và động viên tôi (chỉ khoảng 2-3 câu).`;

    const messages = [
      {
        role: 'system',
        content:
          "Bạn là một Quản lý nhân sự người Việt Nam vô cùng thân thiện, tâm lý và gần gũi của nhà hàng King's Grill. Hãy dùng từ ngữ khích lệ chuẩn văn phong người Việt, khen ngợi hoặc động viên nhân viên một cách tự nhiên nhất. Tuyệt đối không dùng từ ngữ dịch máy, cứng nhắc.",
      },
      { role: 'user', content: promptText },
    ];

    try {
      let aiText = '';
      const proxyRes = await callApi(
        'AI_CHAT',
        {
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.6,
          max_tokens: 200,
        },
        { background: true, cacheTtlMs: 0 },
      );

      if (proxyRes?.ok && (proxyRes.data?.reply || proxyRes.data?.content)) {
        aiText = proxyRes.data.reply || proxyRes.data.content;
      } else {
        const selectedKey =
          groqKeys.length > 0 ? groqKeys[Math.floor(Math.random() * groqKeys.length)] : null;
        const apiKey = typeof selectedKey === 'string' ? selectedKey : selectedKey?.key;
        if (!apiKey) {
          setAiReviewSheet({
            open: true,
            loading: false,
            text: '',
            error:
              proxyRes?.message ||
              'Hệ thống AI máy chủ đang bảo trì hoặc chưa đồng bộ khóa API.',
          });
          return;
        }
        const result = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages,
            temperature: 0.6,
            max_tokens: 200,
          }),
        });
        aiText = result.choices?.[0]?.message?.content || 'Không thể phân tích lúc này.';
      }

      setAiReviewSheet({ open: true, loading: false, text: aiText });
      speak(aiText);
    } catch {
      speak('Lỗi kết nối Gờ rốc AI.');
      setAiReviewSheet({
        open: true,
        loading: false,
        text: '',
        error: 'Lỗi kết nối AI. Vui lòng thử lại sau.',
      });
    }
  };

  // Edit Punch Type handlers
  const handleOpenEdit = (log: LogEntry) => {
    setEditingLog(log);
    const isIn = isCheckInLabel(log.type);
    setNewTypeChoice(isIn ? 'Ra ca' : 'Vào ca');
    setEditReason('');
    setEditModalOpen(true);
  };

  const handleConfirmEditType = async () => {
    if (!editingLog || !currentUser) return;
    setIsSubmittingEdit(true);
    setInlineNotice(null);
    try {
      if (!isAdmin) {
        const vn = getVietnamDateParts();
        const fallbackDate = formatDayDateKey(vn.day, vn.month, vn.year);
        const parsedDate = editingLog.time.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] || fallbackDate;
        const parsedTime = editingLog.time.match(/(\d{1,2}:\d{2})/)?.[1] || '00:00';
        const claimPayload = {
          username: currentUser.username,
          fullname: currentUser.fullname || currentUser.username,
          date: parsedDate,
          time: parsedTime,
          type: newTypeChoice,
          shift: 'Đổi loại ca',
          reason: `[Đề nghị sửa từ "${editingLog.type}" → "${newTypeChoice}"] ${editReason || 'Nhân viên báo chọn nhầm loại ca'}`,
        };
        try {
          const claimRes = await callApi('SUBMIT_MISSED_CHECKIN', claimPayload);
          if (claimRes && !claimRes.ok) {
            setInlineNotice({
              variant: 'error',
              title: 'Không thể gửi yêu cầu',
              text: claimRes.message || 'Máy chủ từ chối yêu cầu.',
            });
            return;
          }
          setEditModalOpen(false);
          kgToast(`Đã gửi yêu cầu đổi sang "${newTypeChoice}" tới Quản lý duyệt!`, 'success');
        } catch {
          enqueueTask('SUBMIT_MISSED_CHECKIN', claimPayload);
          setEditModalOpen(false);
          kgToast('Đã lưu yêu cầu vào hàng đợi Offline.', 'info');
        }
        return;
      }

      const res = await callApi('UPDATE_CHECKIN_TYPE', {
        username: currentUser.username,
        fullname: editingLog.fullname,
        targetUsername: editingLog.username,
        sourceSheet: editingLog.sourceSheet,
        role: currentUser.role,
        rowIndex: editingLog.rowIndex,
        time: editingLog.time,
        originalType: editingLog.type,
        newType: newTypeChoice,
        reason: editReason || 'Quản lý cập nhật loại chấm công',
      });

      if (res?.ok) {
        useAppStore.getState().updateLogType(editingLog.time, newTypeChoice, editReason);
        setFullRemoteLogs((prev) =>
          prev
            ? prev.map((item) =>
                item.time === editingLog.time && item.fullname === editingLog.fullname
                  ? {
                      ...item,
                      type: newTypeChoice,
                      isCorrected: true,
                      originalType: editingLog.type,
                      editReason: editReason || 'Quản lý cập nhật loại chấm công',
                    }
                  : item,
              )
            : prev,
        );
        setEditModalOpen(false);
        speak('Đã cập nhật loại chấm công thành công.');
        kgToast(`Đã sửa thành "${newTypeChoice}" trên Bảng Chấm Công gốc!`, 'success');
        void refreshAppData(true);
        void fetchCompleteHistory(true);
        void fetchMonthTimesheet();
      } else {
        setInlineNotice({
          variant: 'error',
          title: 'Lỗi cập nhật',
          text: res?.message || 'Không thể cập nhật loại chấm công.',
        });
      }
    } catch (err: any) {
      setInlineNotice({
        variant: 'error',
        title: 'Lỗi hệ thống',
        text: err.message || 'Lỗi hệ thống khi cập nhật.',
      });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const toggleDayExpand = (dateStr: string) => {
    setExpandedDayKeys((prev) => ({ ...prev, [dateStr]: !prev[dateStr] }));
  };

  const renderSyncBadge = (log: LogEntry) => {
    const st = getPunchSyncState(log);
    if (st.isLocalQueued) {
      return (
        <span
          data-testid="log-sync-badge-local"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 font-bold text-[11px]"
        >
          <Smartphone size={11} className="flex-shrink-0" />
          <span>Lưu tạm trên máy • Chờ mạng</span>
        </span>
      );
    }
    if (st.isEdgeBuffered) {
      return (
        <span
          data-testid="log-sync-badge-edge"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/35 font-bold text-[11px]"
        >
          <CloudUpload size={11} className="flex-shrink-0" />
          <span>Đám mây bảo lãnh • Đang ghi Sheet</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--kg-text-muted)]">
        {st.isValid ? (
          <CircleCheck size={12} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        ) : st.isPendingSupp || st.isPendingStatus ? (
          <Loader2 size={12} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
        ) : (
          <CircleAlert size={12} className="text-rose-600 dark:text-rose-400 flex-shrink-0" />
        )}
        <span>{log.status}</span>
      </span>
    );
  };

  const renderPunchTypePill = (log: LogEntry) => {
    const st = getPunchSyncState(log);
    return (
      <span
        className={`font-black text-[11px] px-2 py-0.5 rounded-lg inline-flex items-center gap-1.5 ${
          st.isPendingSupp
            ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-500/35'
            : st.isRejectedSupp
              ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-400/30 line-through'
              : st.isIn
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-400 border border-emerald-500/25'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/35 dark:text-rose-400 border border-rose-500/25'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            st.isPendingSupp
              ? 'bg-amber-500 animate-pulse'
              : st.isRejectedSupp
                ? 'bg-slate-400'
                : st.isIn
                  ? 'bg-emerald-500'
                  : 'bg-rose-500'
          }`}
        />
        {formatUnifiedPunchLabel(log.type).toUpperCase()}
      </span>
    );
  };

  const renderInlinePunchRow = (log: LogEntry, idx: number, compact = false) => {
    const st = getPunchSyncState(log);
    const logAnomaly = anomalyByTime.get(log.time);
    const canEdit =
      !st.isPendingSupp && !st.isRejectedSupp && (isAdmin || matchesUser(log, currentUser));
    const hasImage = Boolean(
      log.image && log.image !== 'Đang tải ảnh...' && log.image !== 'PENDING',
    );
    const isUploadingImg =
      (log.image === 'Đang tải ảnh...' || log.image === 'PENDING') &&
      (!log.timestamp || Date.now() - log.timestamp < 15 * 60 * 1000);

    return (
      <div
        key={`${makeLogDedupeKey(log)}_${idx}`}
        className={`${
          compact ? 'p-2.5 rounded-xl bg-[var(--kg-surface-soft)]' : 'p-3.5 rounded-2xl bg-[var(--kg-surface)]'
        } border transition-colors ${
          logAnomaly
            ? 'border-rose-500/45 bg-rose-500/5'
            : st.isPendingSupp || st.isLocalQueued
              ? 'border-amber-500/40 bg-amber-500/5'
              : st.isEdgeBuffered
                ? 'border-sky-500/35 bg-sky-500/5'
                : 'border-[var(--kg-border)]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {renderPunchTypePill(log)}
              <span className="text-xs font-mono font-bold tabular-nums text-[var(--kg-text)]">
                {log.time}
              </span>
              {log.isCorrected && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                  Đã sửa
                </span>
              )}
              {logAnomaly && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 inline-flex items-center gap-1">
                  <AlertTriangle size={10} /> Cần kiểm tra
                </span>
              )}
            </div>

            {isAdmin && !compact && (
              <p className="text-xs font-bold text-[var(--kg-text)]">{log.fullname}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--kg-text-muted)]">
              {renderSyncBadge(log)}
              {log.distance && (
                <span className="text-[11px] font-mono tabular-nums opacity-85">
                  • {log.distance}
                </span>
              )}
              {log.location && log.location !== 'Khong xac dinh' && (
                <span className="text-[11px] opacity-80 truncate max-w-[200px]" title={log.location}>
                  • {log.location}
                </span>
              )}
            </div>

            {log.note && (
              <p className="text-xs flex items-center text-amber-700 dark:text-amber-400 font-medium">
                <CircleAlert size={11} className="mr-1 text-amber-500 flex-shrink-0" />
                <span>{log.note}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-center flex-wrap">
            {canEdit && (
              <button
                type="button"
                onClick={() => handleOpenEdit(log)}
                className="min-h-[44px] sm:min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 text-xs font-bold transition active:scale-95 touch-manipulation"
              >
                <Edit3 size={13} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span>{isAdmin ? 'Sửa loại ca' : 'Báo nhầm ca'}</span>
              </button>
            )}
            {hasImage ? (
              <button
                type="button"
                onClick={() => openPreview(log.image!)}
                className="min-h-[44px] sm:min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 text-xs font-bold transition active:scale-95 touch-manipulation"
              >
                <ImageIcon size={13} className="text-sky-600 dark:text-sky-400 flex-shrink-0" />
                <span>Selfie</span>
              </button>
            ) : isUploadingImg ? (
              <span className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[var(--kg-surface)] text-[var(--kg-text-muted)] text-xs font-medium border border-[var(--kg-border)]">
                <Loader2 size={12} className="animate-spin text-sky-500" />
                <span>Đang lưu ảnh</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  // Admin All-Staff Matrix on Desktop with FIXED sticky name column (w-[160px] max-w-[160px] truncate) & left-[160px] Tổng giờ & sticky thead top-0
  const renderAdminDesktopMatrix = () => {
    if (!isAdmin || selectedUser !== 'ALL' || !activeTimesheet?.timesheet) return null;
    const matrixNames = onlyShowWorkdays
      ? displayNames.filter((n) => (employeeSummaries[n]?.workedDaysCount || 0) > 0)
      : displayNames;

    return (
      <div className="hidden lg:block space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="text-xs sm:text-sm font-black text-[var(--kg-text)] uppercase tracking-wider">
              Bảng công toàn nhân sự • Tháng {String(month).padStart(2, '0')}/{year}
            </h3>
            <span className="text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text-muted)]">
              {matrixNames.length} NV
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex bg-[var(--kg-surface-soft)] p-0.5 rounded-xl border border-[var(--kg-border)] gap-0.5">
              <button
                type="button"
                onClick={() => setMatrixDisplayMode('HOURS')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition ${
                  matrixDisplayMode === 'HOURS'
                    ? 'bg-[var(--kg-primary)] text-white shadow-2xs'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <Clock size={13} /> Giờ làm
              </button>
              <button
                type="button"
                onClick={() => setMatrixDisplayMode('TIMESTAMPS')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 transition ${
                  matrixDisplayMode === 'TIMESTAMPS'
                    ? 'bg-[var(--kg-primary)] text-white shadow-2xs'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <ListOrdered size={13} /> Mốc giờ
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-auto max-h-[65vh] w-full rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] custom-scrollbar">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] uppercase text-[10px]">
              <tr>
                <th className="px-3 py-3 font-black sticky left-0 top-0 bg-[var(--kg-surface-soft)] z-30 border-b border-r border-[var(--kg-border)] w-[160px] min-w-[160px] max-w-[160px] truncate">
                  Nhân viên
                </th>
                <th className="px-3 py-3 font-black sticky left-[160px] top-0 bg-[var(--kg-surface)] text-[var(--kg-primary)] dark:text-cyan-300 z-30 border-b border-r border-[var(--kg-border)] w-[96px] min-w-[96px] max-w-[96px] text-center font-mono shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                  Tổng giờ
                </th>
                {days.map((d) => {
                  const dateObj = new Date(Date.UTC(year, month - 1, d, 5, 0, 0));
                  const dayOfWeek = getVietnamDateParts(dateObj).dayOfWeek;
                  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                  return (
                    <th
                      key={d}
                      className={`px-2 py-2 font-black text-center border-b border-r border-[var(--kg-border)] min-w-[68px] ${
                        isWeekend ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : ''
                      }`}
                    >
                      <div className="flex flex-col items-center font-mono tabular-nums">
                        <span className="text-[11px] font-bold">
                          {`${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}`}
                        </span>
                        <span className="text-[9px] font-semibold opacity-70 mt-0.5">
                          {SHORT_DAY_NAMES[dayIndex]}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {matrixNames.length === 0 ? (
                <tr>
                  <td
                    colSpan={days.length + 2}
                    className="text-center py-8 text-[var(--kg-text-muted)] font-bold"
                  >
                    Không tìm thấy nhân viên phù hợp
                  </td>
                </tr>
              ) : (
                matrixNames.map((name) => {
                  const summary = employeeSummaries[name];
                  const totalMonthHours = summary?.totalMonthHours || 0;
                  return (
                    <tr
                      key={name}
                      className="border-b border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]/50 transition-colors"
                    >
                      <td className="px-3 py-2.5 font-bold text-[var(--kg-text)] sticky left-0 bg-[var(--kg-surface)] border-r border-[var(--kg-border)] z-10 w-[160px] min-w-[160px] max-w-[160px]">
                        <button
                          type="button"
                          onClick={() => setSelectedUser(name)}
                          title={name}
                          className="w-full text-left truncate block hover:text-[var(--kg-primary-ink)] hover:underline"
                        >
                          {name}
                        </button>
                      </td>
                      <td className="px-2 py-2.5 font-black text-center font-mono tabular-nums text-[var(--kg-primary)] dark:text-cyan-300 sticky left-[160px] bg-[var(--kg-surface-soft)] border-r border-[var(--kg-border)] z-10 w-[96px] min-w-[96px] max-w-[96px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                        {totalMonthHours.toFixed(2)}h
                        {summary?.totalOvertimeHours > 0 && (
                          <span className="block text-[10px] font-mono tabular-nums text-amber-600 dark:text-amber-400 font-bold">
                            +{summary.totalOvertimeHours.toFixed(1)}h TC
                          </span>
                        )}
                      </td>
                      {days.map((d) => {
                        const dayRes = summary?.days[d];
                        const hours = dayRes?.totalHours || 0;
                        const text = dayRes?.timeText || '';
                        const hasOvertime = dayRes?.hasOvertime || false;

                        return (
                          <td
                            key={d}
                            className="px-1.5 py-2 border-r border-[var(--kg-border)] text-center"
                          >
                            {hours > 0 || text !== '' ? (
                              <div
                                className={`py-1 px-1.5 rounded-lg text-[11px] font-mono tabular-nums font-bold mx-auto w-fit whitespace-pre-line border ${
                                  hasOvertime
                                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                    : 'bg-[var(--kg-primary)]/10 text-[var(--kg-primary)] dark:bg-[var(--kg-primary)]/30 dark:text-cyan-200 border-[var(--kg-primary)]/20'
                                }`}
                              >
                                {matrixDisplayMode === 'HOURS'
                                  ? hours > 0
                                    ? hours.toFixed(2)
                                    : '?'
                                  : text}
                              </div>
                            ) : (
                              <span className="text-[var(--kg-text-muted)] opacity-35 font-mono">
                                -
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const selectedCalendarItem =
    calendarDetailDay !== null ? workdayList[calendarDetailDay - 1] || null : null;

  const isSyncingAny = isUpdating || isLoadingFullLogs || isRefreshingTimesheet;

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <KgModuleHero
        moduleId={activeView === 'log' ? 'history' : 'timesheet'}
        title="Sổ Công & Nhật Ký"
        description={`Tổng hợp giờ làm, tăng ca và đối chiếu 100% lượt chấm công tháng ${String(month).padStart(2, '0')}/${year}.`}
        eyebrow="Chấm công"
        tipTitle="Hướng dẫn Sổ Công & Nhật Ký"
        tips={[
          'Theo ngày: Xem tổng giờ, cặp Vào→Ra và chạm vào từng ngày để kiểm tra Selfie, GPS và sửa loại ca.',
          'Lịch tháng: Chạm vào bất kỳ ngày nào để mở chi tiết chấm công và gửi đơn bổ sung công 1 chạm.',
          'Nhật ký đầy đủ: Lọc toàn bộ lượt vào/ra, phát hiện ca lỗi và đối chiếu trạng thái đồng bộ.',
        ]}
        actions={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void analyzeMyProductivity()}
              aria-label="AI đánh giá năng suất"
              title="AI đánh giá năng suất"
              className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] px-2.5 rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-accent-soft)] border border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-accent-ink)] inline-flex items-center justify-center gap-1.5 text-xs font-bold transition touch-manipulation"
            >
              <Sparkles size={15} className="text-[var(--kg-accent-ink)]" />
              <span className="hidden sm:inline">AI Nhận xét</span>
            </button>
            <button
              type="button"
              onClick={handleManualRefresh}
              aria-label="Làm mới dữ liệu"
              title="Làm mới dữ liệu chấm công"
              className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] px-2.5 rounded-xl bg-[var(--kg-surface-soft)] hover:border-[var(--kg-border-strong)] border border-[var(--kg-border)] text-[var(--kg-text)] inline-flex items-center justify-center gap-1.5 text-xs font-bold transition touch-manipulation"
            >
              <RefreshCw size={14} className={isSyncingAny ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        }
      />

      {inlineNotice && (
        <KgAlertCard variant={inlineNotice.variant} title={inlineNotice.title}>
          {inlineNotice.text}
        </KgAlertCard>
      )}

      {timesheetLoadError && (
        <KgAlertCard variant="error" title="Lỗi đồng bộ bảng công">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1">
            <span>{timesheetLoadError}</span>
            <KgButton
              size="sm"
              variant="secondary"
              icon={RefreshCw}
              onClick={() => void fetchMonthTimesheet()}
            >
              Thử lại
            </KgButton>
          </div>
        </KgAlertCard>
      )}

      {/* 4-Stat KPI Strip (font-mono tabular-nums) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3 sm:p-4 rounded-2xl min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="p-1 bg-[var(--kg-primary-soft)] rounded-lg text-[var(--kg-primary-ink)]">
              <Clock size={13} />
            </span>
            <span className="text-[10.5px] sm:text-xs font-bold uppercase text-[var(--kg-text-muted)] truncate">
              Tổng giờ
            </span>
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono tabular-nums text-[var(--kg-text)]">
            {kpiMetrics.totalHours.toFixed(2)}h
          </div>
          <p className="text-[10.5px] text-[var(--kg-text-muted)] font-mono tabular-nums truncate mt-0.5">
            Tháng {String(month).padStart(2, '0')}/{year}
          </p>
        </div>

        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3 sm:p-4 rounded-2xl min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="p-1 bg-amber-500/15 rounded-lg text-amber-600 dark:text-amber-400">
              <Zap size={13} />
            </span>
            <span className="text-[10.5px] sm:text-xs font-bold uppercase text-[var(--kg-text-muted)] truncate">
              Tăng ca
            </span>
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono tabular-nums text-amber-600 dark:text-amber-400">
            +{kpiMetrics.overtimeHours.toFixed(2)}h
          </div>
          <p className="text-[10.5px] text-[var(--kg-text-muted)] truncate mt-0.5">
            Sau 00:15 qua đêm
          </p>
        </div>

        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3 sm:p-4 rounded-2xl min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="p-1 bg-[var(--kg-accent-soft)] rounded-lg text-[var(--kg-accent-ink)]">
              <CalendarDays size={13} />
            </span>
            <span className="text-[10.5px] sm:text-xs font-bold uppercase text-[var(--kg-text-muted)] truncate">
              Ngày công
            </span>
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono tabular-nums text-[var(--kg-text)]">
            {kpiMetrics.workedDays}
            <span className="text-xs font-sans font-bold text-[var(--kg-text-muted)] ml-1">
              ngày
            </span>
          </div>
          <p className="text-[10.5px] text-[var(--kg-text-muted)] font-mono tabular-nums truncate mt-0.5">
            {countsByType.checkIn} vào • {countsByType.checkOut} ra
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (countsByType.anomaly > 0) {
              setActiveView('log');
              setTypeFilter('ANOMALY');
            }
          }}
          className={`text-left bg-[var(--kg-surface)] border p-3 sm:p-4 rounded-2xl min-w-0 transition ${
            countsByType.anomaly > 0
              ? 'border-[var(--kg-danger)]/40 hover:bg-[var(--kg-danger-soft)]/30 cursor-pointer'
              : 'border-[var(--kg-border)] cursor-default'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={`p-1 rounded-lg ${
                countsByType.anomaly > 0
                  ? 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                  : 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
              }`}
            >
              {countsByType.anomaly > 0 ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
            </span>
            <span className="text-[10.5px] sm:text-xs font-bold uppercase text-[var(--kg-text-muted)] truncate">
              Hợp lệ / Cảnh báo
            </span>
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono tabular-nums flex items-baseline gap-1">
            <span className="text-[var(--kg-success)]">{countsByType.valid}</span>
            <span className="text-[var(--kg-text-soft)] text-sm">/</span>
            <span
              className={
                countsByType.anomaly > 0 ? 'text-[var(--kg-danger)]' : 'text-[var(--kg-text-muted)]'
              }
            >
              {countsByType.anomaly}
            </span>
          </div>
          <p className="text-[10.5px] text-[var(--kg-text-muted)] truncate mt-0.5">
            {countsByType.anomaly > 0 ? 'Chạm để lọc ca lỗi →' : 'Đạt chuẩn GPS'}
          </p>
        </button>
      </div>

      {/* Single Compact Filter Toolbar + Segmented View Switcher */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs">
        {/* Segmented View Switcher: Full-width 3-col on Mobile, crisp proportional segmented control on Tablet/Desktop */}
        <div className="grid grid-cols-3 sm:inline-grid sm:w-auto sm:min-w-[390px] bg-[var(--kg-surface-soft)] p-1 rounded-xl border border-[var(--kg-border)] gap-1">
          {(
            [
              { id: 'ledger', label: 'Theo ngày', mobileLabel: 'Theo ngày', icon: List },
              { id: 'calendar', label: 'Lịch tháng', mobileLabel: 'Lịch tháng', icon: Calendar },
              { id: 'log', label: 'Nhật ký đầy đủ', mobileLabel: 'Nhật ký', icon: ListOrdered },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                className={`min-w-0 min-h-[44px] sm:min-h-[38px] px-1.5 sm:px-3.5 py-2 rounded-lg text-[11.5px] sm:text-xs font-black inline-flex items-center justify-center gap-1 sm:gap-1.5 whitespace-nowrap transition-all touch-manipulation ${
                  active
                    ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <Icon size={14} className="flex-shrink-0" />
                <span className="sm:hidden truncate">{tab.mobileLabel}</span>
                <span className="hidden sm:inline truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Compact Month + (Admin) Employee + Search Row */}
        <div
          className={`grid gap-2 ${
            isAdmin ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          {/* Month Selector */}
          <div className="flex items-center gap-2 px-3 min-h-[44px] sm:min-h-[40px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
            <Calendar size={14} className="text-[var(--kg-primary)] flex-shrink-0" />
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              aria-label="Chọn tháng bảng công và lịch sử"
              style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }}
              className="!bg-transparent !border-0 !shadow-none !p-0 text-base sm:text-sm font-bold font-mono tabular-nums focus:outline-none text-[var(--kg-text)] w-full py-1.5"
            >
              {activeView === 'log' && <option value="ALL">Tất cả các tháng</option>}
              {monthOptions.map((ym) => (
                <option key={ym} value={ym}>
                  {formatMonthLabel(ym)}
                </option>
              ))}
            </select>
          </div>

          {/* Admin Employee Selector */}
          {isAdmin && (
            <div className="flex items-center gap-2 px-3 min-h-[44px] sm:min-h-[40px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
              <Users size={14} className="text-[var(--kg-text-muted)] flex-shrink-0" />
              <select
                value={selectedUser}
                onChange={(e) => {
                  setSelectedUser(e.target.value);
                  setSearchQuery('');
                }}
                aria-label="Chọn nhân sự"
                style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }}
                className="!bg-transparent !border-0 !shadow-none !p-0 text-base sm:text-sm font-bold focus:outline-none text-[var(--kg-text)] w-full py-1.5"
              >
                <option value="ALL">Tất cả nhân sự</option>
                {users.map((u) => (
                  <option key={u.username} value={u.fullname}>
                    {u.fullname}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Input (text-base sm:text-sm for iOS no-zoom) */}
          <div className="flex items-center gap-2 px-3 min-h-[44px] sm:min-h-[40px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
            <Search size={14} className="text-[var(--kg-text-muted)] flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAdmin && selectedUser === 'ALL'
                  ? 'Tìm tên nhân viên, ngày, ghi chú...'
                  : 'Tìm ngày (VD: 15/10), ca, ghi chú...'
              }
              style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }}
              className="!bg-transparent !border-0 !shadow-none !p-0 text-base sm:text-sm text-[var(--kg-text)] placeholder:text-[var(--kg-text-soft)] focus:outline-none w-full py-1.5"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="w-8 h-8 flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Anomaly Alert Strip (shown across views when anomalies exist) */}
        {anomalies.length > 0 && (
          <div className="bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/35 rounded-xl p-3 text-[var(--kg-text)]">
            <div className="flex items-center justify-between gap-2.5 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <AlertTriangle size={16} className="text-[var(--kg-danger)] flex-shrink-0" />
                <div className="min-w-0 text-xs">
                  <span className="font-black text-[var(--kg-danger)]">
                    Cần kiểm tra ({anomalies.length}):
                  </span>{' '}
                  <span className="font-semibold">{anomalies[0].title}</span>{' '}
                  <span className="font-mono tabular-nums font-bold">({anomalies[0].logTime})</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveView('log');
                  setTypeFilter(typeFilter === 'ANOMALY' && activeView === 'log' ? 'ALL' : 'ANOMALY');
                }}
                className="min-h-[44px] sm:min-h-[32px] px-3 py-1 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-danger)]/30 text-xs font-bold text-[var(--kg-danger)] whitespace-nowrap touch-manipulation"
              >
                {activeView === 'log' && typeFilter === 'ANOMALY' ? 'Xem tất cả' : 'Lọc ca lỗi'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================== VIEW 1: THEO NGÀY (LEDGER) ==================== */}
      {activeView === 'ledger' && (
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs space-y-4 animate-fade-in">
          {/* Top Sub-bar with #timesheet-only-workdays preserved */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--kg-border)]">
            <div className="flex items-center gap-2 min-w-0">
              {isAdmin && selectedUser !== 'ALL' && (
                <KgButton
                  size="sm"
                  variant="secondary"
                  icon={ArrowLeft}
                  onClick={() => setSelectedUser('ALL')}
                >
                  Tất cả NV
                </KgButton>
              )}
              <span className="text-xs font-bold text-[var(--kg-text-muted)] font-mono tabular-nums">
                {isAdmin && selectedUser === 'ALL'
                  ? `Danh sách nhân sự • Tháng ${String(month).padStart(2, '0')}/${year}`
                  : `${targetUser} • ${filteredWorkdays.length} ngày`}
              </span>
            </div>

            <label
              htmlFor="timesheet-only-workdays"
              className="flex items-center gap-2 cursor-pointer select-none min-h-[44px] sm:min-h-[32px]"
            >
              <input
                id="timesheet-only-workdays"
                type="checkbox"
                checked={onlyShowWorkdays}
                onChange={(e) => setOnlyShowWorkdays(e.target.checked)}
                className="rounded border-[var(--kg-border-strong)] text-[var(--kg-primary)] focus:ring-[var(--kg-primary)] w-4 h-4"
              />
              <span className="text-xs text-[var(--kg-text)] font-bold">
                {isAdmin && selectedUser === 'ALL'
                  ? 'Chỉ hiện NV có ngày công'
                  : 'Chỉ hiện ngày đi làm'}
              </span>
            </label>
          </div>

          {!activeTimesheet?.timesheet && isRefreshingTimesheet ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs font-bold text-[var(--kg-text-muted)]">
              <RefreshCw size={16} className="animate-spin text-[var(--kg-primary)]" />
              <span>Đang tải bảng công...</span>
            </div>
          ) : isAdmin && selectedUser === 'ALL' ? (
            <>
              {/* Desktop: Fixed Sticky Name + Tổng giờ Matrix */}
              {renderAdminDesktopMatrix()}

              {/* Mobile & Tablet (< lg): Staff Summary Cards (1-col Mobile, 2-col Tablet) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:hidden gap-2.5">
                {displayNames.filter(
                  (n) => !onlyShowWorkdays || (employeeSummaries[n]?.workedDaysCount || 0) > 0,
                ).length === 0 ? (
                  <div className="text-center py-10 text-[var(--kg-text-muted)] text-sm">
                    Không tìm thấy nhân viên phù hợp
                  </div>
                ) : (
                  displayNames
                    .filter(
                      (n) => !onlyShowWorkdays || (employeeSummaries[n]?.workedDaysCount || 0) > 0,
                    )
                    .map((name) => {
                      const summary = employeeSummaries[name];
                      const totalMonthHours = summary?.totalMonthHours || 0;
                      const workDaysCount = summary?.workedDaysCount || 0;
                      const nameParts = name.trim().split(' ');
                      const initials =
                        nameParts.length > 1
                          ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
                          : nameParts[0].substring(0, 2).toUpperCase();

                      return (
                        <KgCard
                          key={name}
                          className="flex items-center justify-between gap-2 p-3.5 border border-[var(--kg-border)] bg-[var(--kg-surface)]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-[var(--kg-primary)] text-white flex items-center justify-center text-xs font-black flex-shrink-0">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-extrabold text-[var(--kg-text)] text-sm leading-snug truncate">
                                {name}
                              </h4>
                              <span className="text-[11px] text-[var(--kg-text-muted)] block font-mono tabular-nums mt-0.5">
                                {workDaysCount} ngày công
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 flex-shrink-0">
                            <div className="text-right">
                              <span className="text-sm font-mono tabular-nums font-black text-[var(--kg-primary)] dark:text-cyan-300 block">
                                {totalMonthHours.toFixed(2)}h
                              </span>
                              {summary?.totalOvertimeHours > 0 && (
                                <span className="text-[10px] font-mono tabular-nums text-amber-600 dark:text-amber-400 block font-bold">
                                  +{summary.totalOvertimeHours.toFixed(1)}h TC
                                </span>
                              )}
                            </div>
                            <KgButton
                              size="sm"
                              variant="secondary"
                              icon={Eye}
                              onClick={() => setSelectedUser(name)}
                              className="min-h-[44px] sm:min-h-[36px]"
                            >
                              Chi tiết
                            </KgButton>
                          </div>
                        </KgCard>
                      );
                    })
                )}
              </div>
            </>
          ) : (
            /* Personal / Single-Staff Day-by-Day Rows with Tap-to-Expand Inline Punches */
            <div className="space-y-2.5">
              {filteredWorkdays.length === 0 ? (
                <div className="text-center py-10 text-[var(--kg-text-muted)] text-sm">
                  Không có dữ liệu làm việc trong tháng {String(month).padStart(2, '0')}/{year}.
                </div>
              ) : (
                filteredWorkdays.map((item) => {
                  const isExpanded = Boolean(expandedDayKeys[item.dateStr] || item.hasLocalOrEdge);
                  let dayBg =
                    'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)]';
                  if (item.isToday) {
                    dayBg = 'bg-[var(--kg-primary)] text-white shadow-xs';
                  } else if (item.isWeekend) {
                    dayBg =
                      'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20';
                  } else if (item.hasData) {
                    dayBg =
                      'bg-[var(--kg-surface-soft)] text-[var(--kg-primary)] dark:text-cyan-300 border border-[var(--kg-border)]';
                  }

                  return (
                    <div
                      key={item.dateStr}
                      className={`rounded-2xl border transition-colors overflow-hidden ${
                        item.isToday
                          ? 'border-[var(--kg-accent)]/50 bg-[var(--kg-accent-soft)]/15'
                          : 'border-[var(--kg-border)] bg-[var(--kg-surface)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 p-3">
                        {/* Tap-to-expand day header */}
                        <button
                          type="button"
                          onClick={() => toggleDayExpand(item.dateStr)}
                          aria-expanded={isExpanded}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left touch-manipulation"
                        >
                          <div
                            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black text-center flex-shrink-0 ${dayBg}`}
                          >
                            <span className="text-sm font-mono tabular-nums leading-none">
                              {String(item.day).padStart(2, '0')}
                            </span>
                            <span className="text-[9px] uppercase mt-1 tracking-wider">
                              {item.dayLabel}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            {item.sessions.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {item.sessions.map((session, sIdx) => (
                                  <div
                                    key={sIdx}
                                    className="flex flex-wrap items-center gap-1.5 text-xs"
                                  >
                                    <span className="px-2 py-0.5 rounded-lg font-mono tabular-nums font-bold bg-[var(--kg-surface-soft)] text-[var(--kg-text)] border border-[var(--kg-border)] inline-flex items-center gap-1">
                                      <span className="text-[10px] text-[var(--kg-text-muted)] uppercase">
                                        Vào:
                                      </span>
                                      <span>{session.inTime}</span>
                                      <span className="text-[var(--kg-text-muted)]">→</span>
                                      <span className="text-[10px] text-[var(--kg-text-muted)] uppercase">
                                        Ra:
                                      </span>
                                      <span
                                        className={
                                          session.isMissingOut
                                            ? 'text-amber-500 font-black animate-pulse'
                                            : ''
                                        }
                                      >
                                        {session.outTime}
                                      </span>
                                    </span>
                                    {session.overtimeHours > 0 && (
                                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono tabular-nums font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 inline-flex items-center gap-0.5">
                                        <Zap size={10} className="text-amber-500" />+
                                        {session.overtimeHours.toFixed(1)}h TC
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : item.dayLogs.length > 0 ? (
                              <span className="text-xs font-bold text-[var(--kg-primary-ink)]">
                                {item.dayLogs.length} lượt ghi nhận (chạm để xem)
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--kg-text-muted)] font-medium">
                                Nghỉ
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Hours + Expand Chevron */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            {item.hasData ? (
                              <>
                                <span className="text-sm font-mono tabular-nums font-black text-[var(--kg-primary)] dark:text-cyan-300 block">
                                  {item.hours > 0 ? item.hours.toFixed(2) : '?'}
                                </span>
                                <span className="text-[10px] text-[var(--kg-text-muted)] block font-medium">
                                  giờ
                                </span>
                              </>
                            ) : (
                              <span className="text-[var(--kg-text-muted)] opacity-35 font-mono">
                                -
                              </span>
                            )}
                          </div>
                          {item.dayLogs.length > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleDayExpand(item.dateStr)}
                              aria-label={isExpanded ? 'Thu gọn lượt chấm công' : 'Xem lượt chấm công'}
                              className="w-11 h-11 sm:w-9 sm:h-9 min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-lg flex items-center justify-center text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)] touch-manipulation"
                            >
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Missing Checkout 1-Tap Bổ Sung Công Bar */}
                      {item.hasMissingCheckout && (
                        <div className="px-3 pb-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-extrabold inline-flex items-center gap-1">
                            <AlertTriangle size={12} /> Thiếu giờ ra ca
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const missingSess = item.sessions.find((s) => s.isMissingOut);
                              setMissedModalTarget({
                                dateStr: item.dateStr,
                                missingType: 'Ra ca',
                                timeStr: missingSess?.inTime,
                              });
                            }}
                            className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs inline-flex items-center gap-1.5 shadow-2xs active:scale-95 transition touch-manipulation"
                          >
                            <PlusCircle size={13} />
                            <span>Bổ sung công</span>
                          </button>
                        </div>
                      )}

                      {/* Expanded Inline Punches (Selfie, GPS, Sync Badges, Sửa loại ca) */}
                      {isExpanded && item.dayLogs.length > 0 && (
                        <div className="px-3 pb-3 pt-2 border-t border-[var(--kg-border)]/70 space-y-2 bg-[var(--kg-surface-soft)]/40">
                          {item.dayLogs.map((log, idx) => renderInlinePunchRow(log, idx, true))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== VIEW 2: LỊCH THÁNG (CALENDAR) ==================== */}
      {activeView === 'calendar' && (
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3.5 sm:p-5 rounded-2xl shadow-xs space-y-3 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-black text-[var(--kg-text)]">
              {targetUser || 'Lịch chấm công'} • Tháng {String(month).padStart(2, '0')}/{year}
            </span>
            <span className="text-[11px] text-[var(--kg-text-muted)] font-medium">
              Chạm vào bất kỳ ngày nào để xem chi tiết &amp; bổ sung công
            </span>
          </div>

          <CalendarGrid
            monthDates={monthDates}
            renderCell={(mDate) => {
              const d = getVietnamDateParts(mDate.date).day;
              const item = workdayList[d - 1];
              const hours = item?.hours || 0;
              const hasData = item?.hasData || false;
              const hasMissing = item?.hasMissingCheckout || false;

              return (
                <button
                  type="button"
                  onClick={() => setCalendarDetailDay(d)}
                  aria-label={`Chi tiết ngày ${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}`}
                  className="w-full h-full min-h-[44px] flex flex-col items-center justify-center rounded-lg p-0.5 hover:bg-[var(--kg-primary-soft)]/50 active:scale-95 transition touch-manipulation"
                >
                  {hasMissing ? (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-black bg-amber-500 text-slate-950 w-full text-center truncate">
                      Thiếu ra
                    </span>
                  ) : hasData ? (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-mono tabular-nums font-black w-full text-center truncate ${
                        item?.hasOvertime
                          ? 'bg-amber-500 text-white'
                          : 'bg-[var(--kg-primary)] text-white'
                      }`}
                    >
                      {hours > 0 ? `${hours.toFixed(1)}h` : `${item?.dayLogs.length || 1} lượt`}
                    </span>
                  ) : (
                    <span className="text-[var(--kg-text-soft)] text-xs opacity-40">-</span>
                  )}
                </button>
              );
            }}
          />
        </div>
      )}

      {/* ==================== VIEW 3: NHẬT KÝ ĐẦY ĐỦ (LOG) ==================== */}
      {activeView === 'log' && (
        <div className="space-y-4 animate-fade-in">
          {/* Type Filter Pills */}
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar min-w-0 max-w-full pb-0.5">
                {(
                  [
                    { id: 'ALL', label: 'Tất cả', count: countsByType.total },
                    { id: 'IN', label: 'Vào ca', count: countsByType.checkIn },
                    { id: 'OUT', label: 'Ra ca', count: countsByType.checkOut },
                    ...(countsByType.anomaly > 0 || typeFilter === 'ANOMALY'
                      ? [{ id: 'ANOMALY' as const, label: 'Cần kiểm tra', count: countsByType.anomaly }]
                      : []),
                  ] as { id: TypeFilter; label: string; count: number }[]
                ).map((pill) => {
                  const active = typeFilter === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setTypeFilter(pill.id)}
                      className={`min-h-[44px] sm:min-h-[36px] px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition-all touch-manipulation ${
                        active
                          ? 'bg-[var(--kg-primary)] text-white shadow-2xs'
                          : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                      }`}
                    >
                      <span>{pill.label}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-mono tabular-nums ${
                          active
                            ? 'bg-white/20 text-white'
                            : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)]'
                        }`}
                      >
                        {pill.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {isSyncingAny ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-[10.5px] font-semibold">
                  <Loader2 size={11} className="animate-spin" /> Đang tải...
                </span>
              ) : fullRemoteLogs !== null ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--kg-success-soft)] text-[var(--kg-success)] text-[10.5px] font-bold">
                  <CheckCircle2 size={11} /> Đủ 100%
                </span>
              ) : null}
            </div>

            {displayLogs.length === 0 ? (
              <div className="text-center py-12 text-[var(--kg-text-muted)] rounded-2xl border border-dashed border-[var(--kg-border-strong)]">
                {isSyncingAny ? (
                  <>
                    <Loader2 size={32} className="mx-auto mb-2.5 animate-spin text-[var(--kg-primary)]" />
                    <p className="font-semibold text-sm text-[var(--kg-text)]">
                      Đang tải toàn bộ lịch sử chấm công...
                    </p>
                  </>
                ) : (
                  <>
                    <PackageOpen size={40} className="mx-auto mb-2 opacity-55" />
                    <p className="font-semibold text-sm text-[var(--kg-text)]">
                      Không có lượt chấm công phù hợp bộ lọc
                    </p>
                    {(selectedMonth !== defaultMonth || typeFilter !== 'ALL' || searchQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMonth(defaultMonth);
                          setTypeFilter('ALL');
                          setSearchQuery('');
                        }}
                        className="mt-3 min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-xs font-bold touch-manipulation"
                      >
                        Đặt lại bộ lọc
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                {/* Desktop Dense Table (lg:) */}
                <div className="hidden lg:block overflow-auto max-h-[65vh] rounded-xl border border-[var(--kg-border)] custom-scrollbar">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] uppercase text-[10px] border-b border-[var(--kg-border)]">
                      <tr>
                        <th className="px-3 py-2.5 font-black">Thời gian</th>
                        {isAdmin && <th className="px-3 py-2.5 font-black">Nhân sự</th>}
                        <th className="px-3 py-2.5 font-black">Loại</th>
                        <th className="px-3 py-2.5 font-black">Trạng thái / Đồng bộ</th>
                        <th className="px-3 py-2.5 font-black">Vị trí / Ghi chú</th>
                        <th className="px-3 py-2.5 font-black text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--kg-border)]">
                      {visibleLogs.map((log, idx) => {
                        const st = getPunchSyncState(log);
                        const logAnomaly = anomalyByTime.get(log.time);
                        const canEdit =
                          !st.isPendingSupp &&
                          !st.isRejectedSupp &&
                          (isAdmin || matchesUser(log, currentUser));
                        const hasImage = Boolean(
                          log.image && log.image !== 'Đang tải ảnh...' && log.image !== 'PENDING',
                        );

                        return (
                          <tr
                            key={`${makeLogDedupeKey(log)}_${idx}`}
                            className={`hover:bg-[var(--kg-surface-soft)]/50 transition-colors ${
                              logAnomaly ? 'bg-rose-500/5' : ''
                            }`}
                          >
                            <td className="px-3 py-2.5 font-mono tabular-nums font-bold text-[var(--kg-text)] whitespace-nowrap">
                              {log.time}
                            </td>
                            {isAdmin && (
                              <td className="px-3 py-2.5 font-bold text-[var(--kg-text)] max-w-[160px] truncate">
                                {log.fullname}
                              </td>
                            )}
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {renderPunchTypePill(log)}
                                {log.isCorrected && (
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                    Đã sửa
                                  </span>
                                )}
                                {logAnomaly && (
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400">
                                    Lỗi
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">{renderSyncBadge(log)}</td>
                            <td className="px-3 py-2.5 max-w-[240px]">
                              <div className="truncate text-[var(--kg-text-muted)]">
                                {log.distance && (
                                  <span className="font-mono tabular-nums mr-1">{log.distance}</span>
                                )}
                                {log.location && log.location !== 'Khong xac dinh'
                                  ? `• ${log.location}`
                                  : ''}
                              </div>
                              {log.note && (
                                <div className="truncate text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                                  {log.note}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(log)}
                                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 text-[11px] font-bold inline-flex items-center gap-1"
                                  >
                                    <Edit3 size={12} />
                                    {isAdmin ? 'Sửa ca' : 'Báo nhầm'}
                                  </button>
                                )}
                                {hasImage && (
                                  <button
                                    type="button"
                                    onClick={() => openPreview(log.image!)}
                                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 text-[11px] font-bold inline-flex items-center gap-1"
                                  >
                                    <ImageIcon size={12} />
                                    Selfie
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile & Tablet Grouped Day Cards */}
                <div className="lg:hidden space-y-4">
                  {groupedVisibleLogs.map((group) => (
                    <div key={group.dateKey} className="space-y-2">
                      <div className="flex items-center justify-between gap-2 px-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-[var(--kg-accent)] flex-shrink-0" />
                          <span className="text-xs font-extrabold text-[var(--kg-text)] truncate">
                            {group.dateLabel}
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold font-mono tabular-nums text-[var(--kg-text-muted)] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] px-2 py-0.5 rounded-full flex-shrink-0">
                          {group.items.length} lượt ({group.inCount} vào • {group.outCount} ra)
                        </span>
                      </div>
                      <div className="space-y-2">
                        {group.items.map((log, idx) => renderInlinePunchRow(log, idx, false))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Progressive Load More */}
                <div className="pt-2 flex flex-col items-center gap-2">
                  <p className="text-xs font-medium font-mono tabular-nums text-[var(--kg-text-muted)]">
                    Đang hiển thị {visibleLogs.length} / {displayLogs.length} lượt chấm công
                  </p>
                  {visibleLogs.length < displayLogs.length && (
                    <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setVisibleLimit((prev) => prev + 100)}
                        className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border-strong)] text-[var(--kg-text)] text-xs font-bold inline-flex items-center gap-1.5 hover:bg-[var(--kg-surface-soft)] transition active:scale-95 touch-manipulation"
                      >
                        <ChevronDown size={15} />
                        <span>
                          Xem thêm {Math.min(100, displayLogs.length - visibleLogs.length)} lượt
                        </span>
                      </button>
                      {displayLogs.length - visibleLogs.length > 100 && (
                        <button
                          type="button"
                          onClick={() => setVisibleLimit(displayLogs.length)}
                          className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-xs font-bold hover:opacity-90 transition active:scale-95 touch-manipulation"
                        >
                          Hiển thị toàn bộ ({displayLogs.length} lượt)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Admin All-Staff Matrix on Desktop in Log view as well */}
          {isAdmin && selectedUser === 'ALL' && activeTimesheet?.timesheet && (
            <div className="hidden lg:block bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs">
              {renderAdminDesktopMatrix()}
            </div>
          )}
        </div>
      )}

      {/* ==================== CALENDAR DAY DETAIL BOTTOM SHEET ==================== */}
      <KgBottomSheet
        isOpen={Boolean(selectedCalendarItem)}
        onClose={() => setCalendarDetailDay(null)}
        title={
          selectedCalendarItem
            ? `Ngày ${selectedCalendarItem.dateStr} (${selectedCalendarItem.dayLabel})`
            : 'Chi tiết ngày công'
        }
        subtitle={
          selectedCalendarItem
            ? `${selectedCalendarItem.hours.toFixed(2)}h làm việc${selectedCalendarItem.overtimeHours > 0 ? ` • +${selectedCalendarItem.overtimeHours.toFixed(1)}h tăng ca` : ''}`
            : undefined
        }
        footer={
          selectedCalendarItem ? (
            <div className="flex gap-2">
              <KgButton
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => setCalendarDetailDay(null)}
              >
                Đóng
              </KgButton>
              <KgButton
                variant="primary"
                size="md"
                icon={PlusCircle}
                className="flex-1"
                onClick={() => {
                  const missingSess = selectedCalendarItem.sessions.find((s) => s.isMissingOut);
                  setMissedModalTarget({
                    dateStr: selectedCalendarItem.dateStr,
                    missingType: selectedCalendarItem.hasMissingCheckout ? 'Ra ca' : 'Vào ca',
                    timeStr: missingSess?.inTime,
                  });
                  setCalendarDetailDay(null);
                }}
              >
                Bổ sung công
              </KgButton>
            </div>
          ) : undefined
        }
      >
        {selectedCalendarItem && (
          <div className="space-y-4">
            {selectedCalendarItem.sessions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                  Tổng hợp ca làm
                </p>
                <div className="space-y-1.5">
                  {selectedCalendarItem.sessions.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs"
                    >
                      <span className="font-mono tabular-nums font-bold text-[var(--kg-text)]">
                        Vào {s.inTime} → Ra{' '}
                        <span className={s.isMissingOut ? 'text-amber-500 font-black' : ''}>
                          {s.outTime}
                        </span>
                      </span>
                      <span className="font-mono tabular-nums font-black text-[var(--kg-primary-ink)]">
                        {s.totalHours > 0 ? `${s.totalHours.toFixed(2)}h` : 'Thiếu ra'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Lượt chấm công ghi nhận ({selectedCalendarItem.dayLogs.length})
              </p>
              {selectedCalendarItem.dayLogs.length === 0 ? (
                <p className="text-xs text-[var(--kg-text-muted)] italic py-4 text-center">
                  Chưa có lượt chấm công nào trong ngày này.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedCalendarItem.dayLogs.map((log, idx) =>
                    renderInlinePunchRow(log, idx, true),
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </KgBottomSheet>

      {/* ==================== EDIT PUNCH TYPE BOTTOM SHEET ==================== */}
      <KgBottomSheet
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Sửa Loại Chấm Công"
      >
        {editingLog && (
          <div className="space-y-4 text-[var(--kg-text)]">
            <div className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--kg-text-muted)] font-medium">Nhân sự:</span>
                <span className="font-black text-[var(--kg-text)]">{editingLog.fullname}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--kg-text-muted)] font-medium">Thời gian:</span>
                <span className="font-mono font-bold tabular-nums text-[var(--kg-text)]">
                  {editingLog.time}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--kg-text-muted)] font-medium">Loại hiện tại:</span>
                <span className="font-black px-2 py-0.5 rounded bg-slate-500/15 text-[var(--kg-text)]">
                  {formatUnifiedPunchLabel(editingLog.type)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Chọn loại chấm công chính xác:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'Vào ca', label: 'Vào ca', desc: 'Bắt đầu ca làm việc' },
                  { id: 'Ra ca', label: 'Ra ca', desc: 'Kết thúc ca làm việc' },
                ].map((item) => {
                  const isSelected = newTypeChoice === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setNewTypeChoice(item.id)}
                      className={`min-h-[56px] p-3 rounded-2xl border text-left transition-all active:scale-95 touch-manipulation ${
                        isSelected
                          ? 'bg-[var(--kg-primary-soft)] border-[var(--kg-primary)] text-[var(--kg-primary-ink)] ring-2 ring-[var(--kg-primary)]/30 font-black'
                          : 'bg-[var(--kg-surface)] border-[var(--kg-border)] text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black">{item.label}</span>
                        {isSelected && <CheckCircle2 size={14} className="text-[var(--kg-primary)]" />}
                      </div>
                      <p className="text-[10px] text-[var(--kg-text-muted)] mt-0.5">{item.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Lý do điều chỉnh nhanh:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Bấm nhầm khi về',
                  'Bấm nhầm khi đến',
                  'Chấm ca gãy nhầm nút',
                  'Bị cấn màn hình',
                ].map((reasonText) => (
                  <button
                    key={reasonText}
                    type="button"
                    onClick={() => setEditReason(reasonText)}
                    className={`min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-bold border transition touch-manipulation ${
                      editReason === reasonText
                        ? 'bg-[var(--kg-primary)] text-white border-[var(--kg-primary)]'
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                    }`}
                  >
                    {reasonText}
                  </button>
                ))}
              </div>
            </div>

            <KgTextarea
              label="Ghi chú chi tiết"
              placeholder="Nhập lý do chọn nhầm loại chấm công..."
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              rows={2}
            />

            <div className="pt-2 flex gap-2.5">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="flex-1 min-h-[44px] py-3 rounded-xl border border-[var(--kg-border)] text-[var(--kg-text-muted)] text-xs font-black hover:bg-[var(--kg-surface-soft)] transition active:scale-95 touch-manipulation"
              >
                Hủy bỏ
              </button>
              <KgButton
                variant="primary"
                size="md"
                loading={isSubmittingEdit}
                onClick={() => void handleConfirmEditType()}
                className="flex-1 py-3 text-xs font-black"
                icon={CheckCircle2}
              >
                {isAdmin ? 'Xác Nhận Sửa' : 'Gửi Quản Lý Duyệt'}
              </KgButton>
            </div>
          </div>
        )}
      </KgBottomSheet>

      {/* ==================== AI PRODUCTIVITY REVIEW SHEET ==================== */}
      <KgBottomSheet
        isOpen={aiReviewSheet.open}
        onClose={() => setAiReviewSheet((prev) => ({ ...prev, open: false }))}
        title="Lời Khuyên Quản Lý AI"
        footer={
          !aiReviewSheet.loading ? (
            <KgButton
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => setAiReviewSheet((prev) => ({ ...prev, open: false }))}
            >
              Cảm ơn AI!
            </KgButton>
          ) : undefined
        }
      >
        {aiReviewSheet.loading ? (
          <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin text-[var(--kg-primary)]" />
            <p className="text-sm font-bold text-[var(--kg-text)]">
              Llama 3.3 đang đánh giá năng suất...
            </p>
          </div>
        ) : aiReviewSheet.error ? (
          <KgAlertCard variant="warning" title="Chưa thể đánh giá AI">
            {aiReviewSheet.error}
          </KgAlertCard>
        ) : (
          <div className="text-sm leading-relaxed text-[var(--kg-text)] whitespace-pre-wrap py-1">
            {aiReviewSheet.text}
          </div>
        )}
      </KgBottomSheet>

      {/* ==================== MISSED CHECK-IN MODAL ==================== */}
      {missedModalTarget && (
        <MissedCheckInModal
          isOpen={Boolean(missedModalTarget)}
          onClose={() => {
            setMissedModalTarget(null);
            void fetchMonthTimesheet();
          }}
          existingLogs={logs}
          onSubmitted={() => {
            void refreshAppData(true);
            void fetchMonthTimesheet();
            void fetchCompleteHistory(true);
          }}
          defaultType={missedModalTarget.missingType}
          defaultDate={missedModalTarget.dateStr}
          defaultTime={missedModalTarget.timeStr}
          defaultReason="Quên bấm cuối ca"
        />
      )}
    </div>
  );
}
