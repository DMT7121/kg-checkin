import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import {
  computeWeekInfo,
  SHORT_DAY_NAMES,
  getAdminShiftClass,
  generateMonthDates,
  ResponsiveShift,
  getVietnamDateParts,
} from '../utils/helpers';
import type { MonthDateInfo } from '../utils/helpers';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  CalendarRange,
  Filter,
  ShieldAlert,
} from 'lucide-react';
import CalendarGrid from '../components/CalendarGrid';
import { KgModuleHero, KgBottomSheet, KgAlertCard, KgButton } from '../components/KgDesignSystem';
import { getCalendarDayMeta } from '../utils/calendarHighlights';
import { isWorkEligible } from '../utils/employment';
import SmartPersonName from '../components/SmartPersonName';
import { useMonthDayVisibility } from '../hooks/useMonthDayVisibility';
import { saveModuleCache } from '../utils/refreshData';
import ShiftMonthMatrix, {
  buildEmployeeMonthShiftMap,
  type MatrixUser,
} from '../components/workforce/ShiftMonthMatrix';

export default function Roster() {
  const monthSchedules = useAppStore((s) => s.monthSchedules);
  const users = useAppStore((s) => s.users);
  const currentUser = useAppStore((s) => s.currentUser);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedRole, setSelectedRole] = useState<string>('ALL');

  const weekInfo = useMemo(() => computeWeekInfo(currentDate, false), [currentDate]);
  const weekDayMeta = useMemo(
    () => weekInfo.weekDatesKeys.map((dateKey) => getCalendarDayMeta(dateKey)),
    [weekInfo.weekDatesKeys],
  );

  const selectedMonth = currentDate.getMonth() + 1;
  const selectedYear = currentDate.getFullYear();
  const monthDates = useMemo(
    () => generateMonthDates(selectedMonth, selectedYear),
    [selectedMonth, selectedYear],
  );
  const {
    visibleKeys: visibleMonthDateKeys,
    visibleDates: visibleMonthDates,
    updateVisibleKeys: setVisibleMonthDateKeys,
  } = useMonthDayVisibility('kg_roster_visible_days', monthDates);

  const [monthData, setMonthData] = useState<any[]>(() =>
    Array.isArray(monthSchedules) ? monthSchedules : [],
  );
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dayDetailsModal, setDayDetailsModal] = useState<{
    title: string;
    subtitle?: string;
    grouped: Array<[string, string[]]>;
  } | null>(null);

  const loadSchedules = useCallback(async () => {
    const currentStore = useAppStore.getState();
    const hasData =
      Array.isArray(currentStore.monthSchedules) && currentStore.monthSchedules.length > 0;
    setLoadError(null);
    if (!hasData) {
      setIsRefreshing(true);
    }
    const requestsMap = new Map<string, string>();
    monthDates.forEach((mDate) => {
      const wInfo = computeWeekInfo(mDate.date, false);
      requestsMap.set(wInfo.weekLabel, wInfo.monthSheet);
    });

    const requests = Array.from(requestsMap.entries()).map(([weekLabel, monthSheet]) => ({
      monthSheet,
      weekLabel,
    }));
    const monthSheet = `Tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`;

    try {
      const res = await callApi('GET_MONTH_SCHEDULES', { monthSheet, requests }, { background: true });
      setIsRefreshing(false);

      if (res?.ok && res.data?.weeks) {
        setMonthData(res.data.weeks);
        useAppStore.getState().setMonthSchedules(res.data.weeks);
        saveModuleCache('roster', res.data.weeks);
        setLoadError(null);
      } else {
        setLoadError('Không thể tải lịch làm việc. Vui lòng kiểm tra mạng và thử lại.');
      }
    } catch {
      setIsRefreshing(false);
      setLoadError('Mất kết nối khi tải lịch làm việc. Vui lòng thử lại.');
    }
  }, [selectedMonth, selectedYear, monthDates]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSchedules();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadSchedules]);

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

  const activeUsers = useMemo(
    () => (users && users.length > 0 ? users.filter(isWorkEligible) : []),
    [users],
  );

  const uniqueRoles = useMemo(() => {
    const roles = new Set<string>();
    activeUsers.forEach((u) => {
      if (u.position) roles.add(u.position);
    });
    return Array.from(roles);
  }, [activeUsers]);

  const filteredUsers = useMemo(() => {
    if (selectedRole === 'ALL') return activeUsers;
    return activeUsers.filter((u) => u.position === selectedRole);
  }, [activeUsers, selectedRole]);

  // Single memoized O(1) lookup map shared across Month Calendar, Month Matrix, and Day Details modal
  const empMonthMap = useMemo(() => buildEmployeeMonthShiftMap(monthData), [monthData]);

  const openDayDetailsForSlot = useCallback(
    (title: string, weekLabel: string, dayIndex: number, focusedEmp?: MatrixUser) => {
      const grouped: Record<string, string[]> = {};
      for (const u of filteredUsers) {
        const shift = empMonthMap[u.fullname]?.[`${weekLabel}_${dayIndex}`] || '';
        if (shift && shift !== 'OFF') {
          if (!grouped[shift]) grouped[shift] = [];
          grouped[shift].push(u.fullname);
        }
      }
      const focusedShift = focusedEmp
        ? empMonthMap[focusedEmp.fullname]?.[`${weekLabel}_${dayIndex}`] || 'OFF'
        : undefined;

      setDayDetailsModal({
        title,
        subtitle: focusedEmp ? `${focusedEmp.fullname}: ${focusedShift || 'OFF'}` : undefined,
        grouped: Object.entries(grouped),
      });
    },
    [filteredUsers, empMonthMap],
  );

  const handleMonthDayClick = useCallback(
    (mDate: MonthDateInfo, focusedEmp?: MatrixUser) => {
      const vn = getVietnamDateParts(mDate.date);
      openDayDetailsForSlot(
        `Lịch Ngày ${String(vn.day).padStart(2, '0')}/${String(vn.month).padStart(2, '0')} (${SHORT_DAY_NAMES[mDate.dayIndex]})`,
        mDate.weekLabel,
        mDate.dayIndex,
        focusedEmp,
      );
    },
    [openDayDetailsForSlot],
  );

  // Week view derived data (O(N), zero repeated finds)
  const weekViewModel = useMemo(() => {
    const weekData = monthData.find((w) => w.weekLabel === weekInfo.weekLabel);
    const schedules = weekData ? weekData.schedules || [] : [];

    const waitstaffNames = new Set<string>();
    activeUsers.forEach((u) => {
      if (u.position?.toLowerCase().includes('phục vụ')) {
        waitstaffNames.add(u.fullname);
      }
    });

    const scheduleByFullname = new Map<string, string[]>();
    const dailyWaitstaffCounts = [0, 0, 0, 0, 0, 0, 0];

    for (const emp of schedules) {
      if (!emp?.fullname) continue;
      const shifts: string[] = Array.isArray(emp.shifts) ? emp.shifts : [];
      scheduleByFullname.set(emp.fullname, shifts);
      if (waitstaffNames.has(emp.fullname)) {
        for (let idx = 0; idx < 7; idx++) {
          if (shifts[idx] && shifts[idx] !== 'OFF') {
            dailyWaitstaffCounts[idx]++;
          }
        }
      }
    }

    const rosterToRender = filteredUsers.map((u) => ({
      fullname: u.fullname,
      username: u.username,
      position: u.position,
      shifts: scheduleByFullname.get(u.fullname) || ['', '', '', '', '', '', ''],
    }));

    return { dailyWaitstaffCounts, rosterToRender };
  }, [monthData, weekInfo.weekLabel, activeUsers, filteredUsers]);

  const handleWeekDayClick = useCallback(
    (dayIdx: number, focusedEmp?: MatrixUser) => {
      openDayDetailsForSlot(
        `Lịch Ngày ${weekInfo.weekDates[dayIdx]} (${SHORT_DAY_NAMES[dayIdx]})`,
        weekInfo.weekLabel,
        dayIdx,
        focusedEmp,
      );
    },
    [openDayDetailsForSlot, weekInfo.weekDates, weekInfo.weekLabel],
  );

  const renderUserMonthView = () => (
    <div className="animate-fade-in">
      <CalendarGrid
        monthDates={monthDates}
        renderCell={(mDate) => {
          const myShift =
            empMonthMap[currentUser?.fullname || '']?.[`${mDate.weekLabel}_${mDate.dayIndex}`] || '';
          const isOff = myShift === 'OFF' || !myShift;
          const vn = getVietnamDateParts(mDate.date);
          return (
            <button
              type="button"
              className={`w-full h-full min-h-[44px] flex flex-col justify-center items-center cursor-pointer active:scale-95 transition-transform rounded-lg sm:rounded-xl p-1 border border-transparent hover:border-[var(--kg-primary)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary-ink)] touch-manipulation ${getAdminShiftClass(myShift)}`}
              onClick={() => handleMonthDayClick(mDate)}
              title="Nhấn để xem chi tiết toàn quán"
              aria-label={`Xem lịch ngày ${vn.day}/${vn.month}`}
            >
              {!isOff ? (
                <span className="text-[10px] sm:text-xs font-bold leading-tight text-center font-mono tabular-nums break-words max-w-full">
                  <ResponsiveShift shift={myShift} />
                </span>
              ) : (
                <span className="text-[9px] opacity-60">OFF</span>
              )}
            </button>
          );
        }}
      />
    </div>
  );

  const renderWeekView = () => {
    const { dailyWaitstaffCounts, rosterToRender } = weekViewModel;
    return (
      <div className="space-y-3">
        {/* Mobile & Tablet (< 1024px): Toast Touch weekstrip staffing bar + employee cards */}
        <div className="lg:hidden space-y-3">
          {/* Quick 7-day staffing summary chips */}
          <div className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Nhân sự phục vụ theo ngày
              </span>
              <span className="text-[10.5px] font-bold text-[var(--kg-text-soft)]">
                Chạm ngày để xem chi tiết
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
              {SHORT_DAY_NAMES.map((d, idx) => {
                const isUnderstaffed = dailyWaitstaffCounts[idx] < 3;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleWeekDayClick(idx)}
                    className={`min-h-[46px] rounded-xl border px-1.5 py-1.5 flex flex-col items-center justify-center gap-0.5 text-center transition-colors touch-manipulation ${
                      isUnderstaffed
                        ? 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/35 text-[var(--kg-danger)]'
                        : 'bg-[var(--kg-surface)] border-[var(--kg-border)] text-[var(--kg-text)] hover:border-[var(--kg-primary)]/40'
                    }`}
                    aria-label={`Xem lịch ngày ${weekInfo.weekDates[idx]} (${d}) - ${dailyWaitstaffCounts[idx]} phục vụ`}
                  >
                    <span className="text-[10px] font-black leading-none">
                      {d} · <span className="font-mono tabular-nums">{weekInfo.weekDates[idx]}</span>
                    </span>
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] font-black font-mono tabular-nums leading-none ${
                        isUnderstaffed ? 'text-[var(--kg-danger)]' : 'text-[var(--kg-text-muted)]'
                      }`}
                    >
                      {isUnderstaffed && <ShieldAlert size={10} />}
                      {dailyWaitstaffCounts[idx]}/3 PV
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Employee Weekstrip Day-Chip Cards */}
          <div className="space-y-2.5">
            {rosterToRender.map((emp, empIdx) => {
              const isSelf = emp.username === currentUser?.username;
              const workDays = emp.shifts.filter(
                (shift: string) => shift && !shift.toUpperCase().startsWith('OFF')
              ).length;
              return (
                <div
                  key={emp.username || empIdx}
                  className={`rounded-2xl border p-3 space-y-2.5 transition-colors ${
                    isSelf
                      ? 'border-[var(--kg-primary)]/45 bg-[var(--kg-primary-soft)]/35'
                      : 'border-[var(--kg-border)] bg-[var(--kg-surface)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <SmartPersonName
                        fullname={emp.fullname}
                        className="text-sm font-extrabold text-[var(--kg-text)] truncate"
                      />
                      {isSelf && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--kg-primary)] text-[var(--kg-primary-fg)] text-[10px] font-black uppercase tracking-wider shrink-0">
                          Bạn
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-black font-mono tabular-nums px-2 py-0.5 rounded-lg bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text-muted)] shrink-0">
                      {workDays}/7 ca
                    </span>
                  </div>

                  <div className="weekstrip grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                    {emp.shifts.map((shift: string, dayIdx: number) => {
                      const isOff = shift === 'OFF' || !shift;
                      const isHighlightedDay = weekDayMeta[dayIdx].isWeekend || weekDayMeta[dayIdx].isHoliday;
                      return (
                        <button
                          key={dayIdx}
                          type="button"
                          onClick={() => handleWeekDayClick(dayIdx, emp)}
                          title={weekDayMeta[dayIdx].label || undefined}
                          aria-label={`Xem chi tiết ca ${weekInfo.weekDates[dayIdx]} - ${emp.fullname}`}
                          className={`daychip min-h-[54px] rounded-xl border p-1.5 flex flex-col items-center justify-between gap-1 transition-all active:scale-95 touch-manipulation ${
                            isHighlightedDay
                              ? 'border-[var(--kg-warning)]/40 bg-[var(--kg-surface-2)]'
                              : 'border-[var(--kg-border)] bg-[var(--kg-surface-2)]'
                          }`}
                        >
                          <span className="text-[10px] font-extrabold text-[var(--kg-text-muted)] leading-none font-mono tabular-nums">
                            {SHORT_DAY_NAMES[dayIdx]} {weekInfo.weekDates[dayIdx]}
                          </span>
                          <span
                            className={`w-full rounded-md px-1 py-0.5 text-[10px] font-black font-mono tabular-nums text-center leading-tight truncate ${getAdminShiftClass(shift)}`}
                          >
                            {isOff ? 'OFF' : <ResponsiveShift shift={shift} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Desktop (>= 1024px): Full Weekly Matrix Table */}
        <div className="hidden lg:block relative w-full rounded-2xl overflow-hidden border border-[var(--kg-border)] bg-[var(--kg-surface)]">
          <div className="overflow-x-auto max-h-[70vh] w-full custom-scrollbar">
            <table className="w-full text-xs sm:text-sm text-left whitespace-nowrap border-collapse">
              <thead className="sticky top-0 z-20 text-[10px] text-[var(--kg-text-muted)] uppercase bg-[var(--kg-surface-2)] border-b border-[var(--kg-border)]">
                <tr>
                  <th className="px-3 py-3 sticky left-0 top-0 bg-[var(--kg-surface-2)] z-30 font-black border-r border-[var(--kg-border)] shadow-[2px_0_5px_rgba(0,0,0,0.04)] w-[160px] min-w-[160px] max-w-[160px]">
                    Nhân Viên
                  </th>
                  {SHORT_DAY_NAMES.map((d, idx) => {
                    const isUnderstaffed = dailyWaitstaffCounts[idx] < 3;
                    return (
                      <th
                        key={d}
                        className={`px-1 py-2 text-center border-r border-[var(--kg-border)] last:border-r-0 min-w-[78px] ${weekDayMeta[idx].className}`}
                        title={weekDayMeta[idx].label || undefined}
                      >
                        <button
                          type="button"
                          onClick={() => handleWeekDayClick(idx)}
                          className="w-full flex flex-col items-center justify-center rounded-lg py-0.5 hover:bg-[var(--kg-primary-soft)]/60 transition-colors touch-manipulation"
                          aria-label={`Xem lịch ngày ${weekInfo.weekDates[idx]} (${d})`}
                        >
                          <span className="font-black text-[13px] font-mono tabular-nums text-[var(--kg-text)]">
                            {weekInfo.weekDates[idx]}
                          </span>
                          <span className="text-[9px] font-bold opacity-75 mt-0.5">{d}</span>
                          {isUnderstaffed && (
                            <span
                              className="mt-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/30 text-[9px] font-black font-mono tabular-nums leading-none"
                              aria-label={`Thiếu nhân sự phục vụ: ${dailyWaitstaffCounts[idx]}/3`}
                            >
                              <ShieldAlert size={9} />
                              {dailyWaitstaffCounts[idx]}/3
                            </span>
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rosterToRender.map((emp, empIdx) => {
                  const isSelf = emp.username === currentUser?.username;
                  return (
                    <tr
                      key={emp.username || empIdx}
                      className={`border-b border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]/60 transition-colors ${
                        isSelf ? 'bg-[var(--kg-primary-soft)]/50' : ''
                      }`}
                    >
                      <td
                        className={`px-3 py-2 sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.04)] border-r border-[var(--kg-border)] w-[160px] min-w-[160px] max-w-[160px] ${
                          isSelf ? 'bg-[var(--kg-primary-soft)]' : 'bg-[var(--kg-surface)]'
                        }`}
                      >
                        <SmartPersonName
                          fullname={emp.fullname}
                          className="max-w-[136px] text-xs font-black text-[var(--kg-text)] truncate block"
                        />
                        {isSelf && (
                          <div className="text-[9px] font-black text-[var(--kg-primary-ink)] uppercase tracking-wider mt-0.5">
                            Bạn
                          </div>
                        )}
                      </td>
                      {emp.shifts.map((shift: string, dayIdx: number) => {
                        const isOff = shift === 'OFF' || !shift;
                        return (
                          <td
                            key={dayIdx}
                            className={`px-1 py-1 border-r border-[var(--kg-border)]/50 last:border-r-0 text-center ${weekDayMeta[dayIdx].className}`}
                            title={weekDayMeta[dayIdx].label || undefined}
                          >
                            <button
                              type="button"
                              onClick={() => handleWeekDayClick(dayIdx, emp)}
                              aria-label={`Xem chi tiết ca ${weekInfo.weekDates[dayIdx]} - ${emp.fullname}`}
                              className={`inline-flex items-center justify-center text-[10.5px] font-black font-mono tabular-nums w-full max-w-[82px] min-h-[38px] py-1.5 px-1.5 rounded-lg shadow-2xs transition-all active:scale-95 hover:ring-1 hover:ring-[var(--kg-primary)]/40 touch-manipulation ${getAdminShiftClass(shift)}`}
                            >
                              {isOff ? 'OFF' : <ResponsiveShift shift={shift} />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const isPrivilegedMonthMatrix =
    currentUser?.role === 'admin' || currentUser?.role === 'tester';

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="roster"
        title="Ma trận Xoay ca"
        description="Lịch làm việc chính thức toàn nhà hàng. Chạm vào bất kỳ ô ca hoặc ngày nào để xem chi tiết nhân sự."
        eyebrow="Phân ca"
        tipTitle="Hướng dẫn Đọc Ma trận Xoay ca"
        tips={[
          'Màu sắc theo giờ bắt đầu ca: 15:00 (Xanh dương), 16:00 (Xanh ngọc), 17:00 (Xanh đậm), 18:00 (Hổ phách), 19:00 (Xám than), OFF# (Nghỉ phép vàng), OFF! (Nghỉ không phép đỏ).',
          'Chạm hoặc click vào bất kỳ ô ca hoặc tiêu đề ngày nào để xem chi tiết danh sách nhân sự làm cùng ngày.',
          'Nhãn đỏ (<3) báo hiệu số nhân sự Phục vụ thấp hơn định biên tối thiểu 3 người.',
        ]}
      />

      {loadError && (
        <KgAlertCard variant="error" title="Lỗi tải lịch làm việc">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1">
            <span>{loadError}</span>
            <KgButton size="sm" variant="secondary" icon={RefreshCw} onClick={() => void loadSchedules()}>
              Thử lại
            </KgButton>
          </div>
        </KgAlertCard>
      )}

      {/* Single Unified Control Bar: View Toggle + Period Nav + Role Filter + Refresh */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3 sm:p-4 rounded-2xl shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Week / Month Switch */}
            <div className="flex items-center gap-1 bg-[var(--kg-surface-soft)] p-1 rounded-xl border border-[var(--kg-border)]/60">
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`flex-1 sm:flex-initial flex items-center justify-center min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-black transition-all touch-manipulation ${
                  viewMode === 'week'
                    ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] shadow-xs'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <CalendarRange size={15} className="mr-1.5 flex-shrink-0" /> Tuần
              </button>
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`flex-1 sm:flex-initial flex items-center justify-center min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-lg text-xs sm:text-sm font-black transition-all touch-manipulation ${
                  viewMode === 'month'
                    ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] shadow-xs'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <LayoutGrid size={15} className="mr-1.5 flex-shrink-0" /> Tháng
              </button>
            </div>

            {/* Period Navigator */}
            <div className="flex items-center gap-1 bg-[var(--kg-surface-soft)] rounded-xl p-1 border border-[var(--kg-border)] justify-between sm:justify-start">
              <button
                type="button"
                aria-label="Kỳ trước"
                onClick={() => (viewMode === 'week' ? changeWeek(-1) : changeMonth(-1))}
                className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center hover:bg-[var(--kg-surface)] hover:text-[var(--kg-text)] rounded-lg transition-all text-[var(--kg-text-muted)] touch-manipulation"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex-1 sm:flex-initial text-xs sm:text-sm font-black px-2 min-w-[124px] sm:min-w-[136px] text-center text-[var(--kg-text)] font-mono tabular-nums truncate">
                {viewMode === 'week' ? weekInfo.weekDisplay : `Tháng ${selectedMonth}/${selectedYear}`}
              </div>
              <button
                type="button"
                aria-label="Kỳ tiếp theo"
                onClick={() => (viewMode === 'week' ? changeWeek(1) : changeMonth(1))}
                className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center hover:bg-[var(--kg-surface)] hover:text-[var(--kg-text)] rounded-lg transition-all text-[var(--kg-text-muted)] touch-manipulation"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Role Filter + Refresh */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-48 sm:flex-initial">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Filter size={14} className="text-[var(--kg-text-muted)]" />
              </div>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                aria-label="Lọc theo chức vụ"
                className="w-full pl-8 pr-4 py-2 text-base sm:text-xs rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] focus:ring-2 focus:ring-[var(--kg-primary)] appearance-none text-[var(--kg-text)] font-bold min-h-[44px] sm:min-h-[38px]"
              >
                <option value="ALL">Tất cả chức vụ</option>
                {uniqueRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void loadSchedules()}
              disabled={isRefreshing}
              className="text-xs bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] hover:bg-[var(--kg-border)]/40 px-3 py-2 rounded-xl transition inline-flex items-center justify-center gap-1.5 font-bold flex-shrink-0 min-h-[44px] sm:min-h-[38px] touch-manipulation disabled:opacity-60"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
          </div>
        </div>

        {/* Inline Legend */}
        <div className="calendar-highlight-legend flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] font-bold text-[var(--kg-text-muted)] pt-2 border-t border-[var(--kg-border)]/70">
          <span className="inline-flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-full bg-[var(--kg-danger)]" /> Lễ/Tết
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-full bg-[var(--kg-accent)]" /> Cao điểm F&amp;B
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="w-2.5 h-2.5 rounded-full bg-[var(--kg-warning)]" /> T6 · T7 · CN
          </span>
          <span className="inline-flex items-center gap-1 text-[var(--kg-danger)]">
            <ShieldAlert size={11} /> &lt;3 Phục vụ
          </span>
        </div>

        {/* Main Roster Content */}
        {filteredUsers.length > 0 ? (
          viewMode === 'week' ? (
            renderWeekView()
          ) : isPrivilegedMonthMatrix ? (
            <ShiftMonthMatrix
              mode="readonly"
              monthDates={monthDates}
              visibleDates={visibleMonthDates}
              visibleKeys={visibleMonthDateKeys}
              onVisibleKeysChange={setVisibleMonthDateKeys}
              users={filteredUsers}
              allUsersForStaffing={activeUsers}
              monthData={monthData}
              empMonthMap={empMonthMap}
              currentUserUsername={currentUser?.username}
              onDayClick={handleMonthDayClick}
              showUnderstaffedBadge
            />
          ) : (
            renderUserMonthView()
          )
        ) : (
          <div className="text-center py-10 text-sm text-[var(--kg-text-muted)]">
            Không có dữ liệu nhân viên cho chức vụ này.
          </div>
        )}
      </div>

      <KgBottomSheet
        isOpen={Boolean(dayDetailsModal)}
        onClose={() => setDayDetailsModal(null)}
        title={dayDetailsModal?.title || 'Chi tiết ca làm'}
        subtitle={dayDetailsModal?.subtitle}
        footer={
          <KgButton
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => setDayDetailsModal(null)}
          >
            Đóng
          </KgButton>
        }
      >
        {dayDetailsModal && (
          <div className="space-y-3">
            {dayDetailsModal.grouped.length === 0 ? (
              <p className="text-sm text-[var(--kg-text-muted)] italic text-center py-6">
                Không có ai làm việc hôm nay.
              </p>
            ) : (
              dayDetailsModal.grouped.map(([shift, names]) => (
                <div
                  key={shift}
                  className="p-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-2"
                >
                  <div className="font-bold text-[var(--kg-primary-ink)] border-b border-[var(--kg-border)] pb-1.5 text-sm flex items-center gap-2 font-mono tabular-nums">
                    <span className="w-2 h-2 rounded-full bg-[var(--kg-primary)] shrink-0" />
                    <span>{shift}</span>
                    <span className="ml-auto text-xs font-semibold text-[var(--kg-text-muted)]">
                      {names.length} NV
                    </span>
                  </div>
                  <div className="text-xs sm:text-sm text-[var(--kg-text)] grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {names.map((name) => (
                      <div key={name} className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[var(--kg-text-soft)]">•</span>
                        <span className="truncate font-medium">{name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </KgBottomSheet>
    </div>
  );
}
