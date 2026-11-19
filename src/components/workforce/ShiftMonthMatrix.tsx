import React, { useMemo } from 'react';
import { ShieldAlert, Search, X } from 'lucide-react';
import {
  ADMIN_SHIFT_OPTIONS,
  SHORT_DAY_NAMES,
  formatDateShort,
  formatMobileShift,
  getAdminShiftClass,
  ResponsiveShift,
  type MonthDateInfo,
} from '../../utils/helpers';
import { getCalendarDayMeta } from '../../utils/calendarHighlights';
import SmartPersonName from '../SmartPersonName';
import MonthDayVisibility from '../MonthDayVisibility';

export interface MatrixUser {
  username: string;
  fullname: string;
  position?: string;
}

export interface MonthWeekSchedule {
  weekLabel: string;
  schedules?: Array<{
    fullname: string;
    username?: string;
    shifts?: string[];
  }>;
}

/**
 * Builds an O(1)-lookup map: empMonthMap[fullname][`${weekLabel}_${dayIndex}`] = shift
 */
// eslint-disable-next-line react-refresh/only-export-components
export function buildEmployeeMonthShiftMap(
  monthData: MonthWeekSchedule[] | null | undefined,
): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  if (!Array.isArray(monthData)) return map;
  for (const week of monthData) {
    if (!week?.schedules) continue;
    for (const emp of week.schedules) {
      if (!emp?.fullname) continue;
      if (!map[emp.fullname]) map[emp.fullname] = {};
      const shifts = emp.shifts;
      if (!Array.isArray(shifts)) continue;
      for (let i = 0; i < shifts.length; i++) {
        map[emp.fullname][`${week.weekLabel}_${i}`] = shifts[i];
      }
    }
  }
  return map;
}

export interface ShiftMonthMatrixProps {
  mode: 'editable' | 'readonly';
  monthDates: MonthDateInfo[];
  visibleDates: MonthDateInfo[];
  visibleKeys: string[];
  onVisibleKeysChange: (keys: string[]) => void;
  users: MatrixUser[];
  allUsersForStaffing?: MatrixUser[];
  monthData: MonthWeekSchedule[];
  empMonthMap?: Record<string, Record<string, string>>;
  currentUserUsername?: string;
  /** Editable mode callback */
  onShiftChange?: (empFullname: string, mDate: MonthDateInfo, value: string) => void;
  /** Readonly mode callback when clicking any cell or day header */
  onDayClick?: (mDate: MonthDateInfo, emp?: MatrixUser) => void;
  /** Show visible mobile-safe understaffed (<3 waitstaff) badges in header */
  showUnderstaffedBadge?: boolean;
  /** Optional built-in search bar (used by Admin Schedule) */
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  totalUserCount?: number;
}

const ShiftMonthMatrix = React.memo(function ShiftMonthMatrix({
  mode,
  monthDates,
  visibleDates,
  visibleKeys,
  onVisibleKeysChange,
  users,
  allUsersForStaffing,
  monthData,
  empMonthMap: externalEmpMonthMap,
  currentUserUsername,
  onShiftChange,
  onDayClick,
  showUnderstaffedBadge = false,
  searchQuery,
  onSearchQueryChange,
  totalUserCount,
}: ShiftMonthMatrixProps) {
  const empMonthMap = useMemo(
    () => externalEmpMonthMap ?? buildEmployeeMonthShiftMap(monthData),
    [externalEmpMonthMap, monthData],
  );

  // Precompute day highlights once per month (eliminates N * 31 calls per render)
  const dayMetaByDateKey = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getCalendarDayMeta>>();
    for (const mDate of monthDates) {
      map.set(mDate.dateKey, getCalendarDayMeta(mDate.dateKey));
    }
    return map;
  }, [monthDates]);

  // Precompute waitstaff headcount per `${weekLabel}_${dayIndex}` slot in O(W * E) — zero findIndex loops
  const waitstaffCountBySlot = useMemo(() => {
    const counts = new Map<string, number>();
    if (!showUnderstaffedBadge) return counts;
    const pool = allUsersForStaffing ?? users;
    const waitstaffNames = new Set<string>();
    for (const u of pool) {
      if (u.position?.toLowerCase().includes('phục vụ')) {
        waitstaffNames.add(u.fullname);
      }
    }
    if (!Array.isArray(monthData)) return counts;
    for (const week of monthData) {
      if (!week?.schedules) continue;
      for (const emp of week.schedules) {
        if (!waitstaffNames.has(emp.fullname)) continue;
        const shifts = emp.shifts;
        if (!Array.isArray(shifts)) continue;
        for (let i = 0; i < shifts.length; i++) {
          const s = shifts[i];
          if (s && s !== 'OFF') {
            const slotKey = `${week.weekLabel}_${i}`;
            counts.set(slotKey, (counts.get(slotKey) ?? 0) + 1);
          }
        }
      }
    }
    return counts;
  }, [showUnderstaffedBadge, allUsersForStaffing, users, monthData]);

  const showSearchBar = typeof onSearchQueryChange === 'function';

  return (
    <div className="space-y-3">
      <MonthDayVisibility
        monthDates={monthDates}
        visibleKeys={visibleKeys}
        onChange={onVisibleKeysChange}
      />

      {showSearchBar && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 bg-[var(--kg-surface-soft)] p-2.5 rounded-xl border border-[var(--kg-border)]">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)]" />
            <input
              type="text"
              value={searchQuery ?? ''}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Tìm tên nhân viên..."
              className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-9 py-2 text-base sm:text-sm font-medium rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] placeholder:text-[var(--kg-text-soft)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchQueryChange('')}
                aria-label="Xóa tìm kiếm nhân viên"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="text-xs font-semibold text-[var(--kg-text-muted)] flex items-center justify-between sm:justify-end gap-3 px-1">
            <span>
              Hiển thị:{' '}
              <b className="font-mono tabular-nums text-[var(--kg-primary-ink)]">{users.length}</b>
              <span className="font-mono tabular-nums">/{totalUserCount ?? users.length}</span> nhân viên
            </span>
            <span className="hidden md:inline text-[var(--kg-text-soft)]">• Cuộn ngang để xem đủ các ngày</span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto max-h-[70vh] w-full bg-[var(--kg-surface)] rounded-2xl border border-[var(--kg-border)] custom-scrollbar shadow-xs">
        <table className="w-full text-sm text-left whitespace-nowrap border-collapse">
          <thead className="sticky top-0 z-20 text-[10px] text-[var(--kg-text-muted)] uppercase bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)]">
            <tr>
              <th className="px-3 py-3 sticky left-0 top-0 bg-[var(--kg-surface-soft)] z-30 font-black border-r border-[var(--kg-border)] shadow-[2px_0_5px_rgba(0,0,0,0.06)] w-[144px] min-w-[144px] max-w-[144px] sm:w-[164px] sm:min-w-[164px] sm:max-w-[164px]">
                Nhân Viên
              </th>
              {visibleDates.map((mDate) => {
                const dayMeta = dayMetaByDateKey.get(mDate.dateKey);
                const slotKey = `${mDate.weekLabel}_${mDate.dayIndex}`;
                const waitstaffCount = waitstaffCountBySlot.get(slotKey) ?? 0;
                const isUnderstaffed = showUnderstaffedBadge && waitstaffCount < 3;

                return (
                  <th
                    key={mDate.dateKey}
                    className={`px-1 py-2 text-center border-r border-[var(--kg-border)] last:border-r-0 ${
                      mode === 'editable' ? 'min-w-[66px] sm:min-w-[74px]' : 'min-w-[60px] sm:min-w-[68px]'
                    } ${dayMeta?.className || (mDate.isWeekend ? 'bg-[var(--kg-surface-soft)]/80' : '')}`}
                    title={dayMeta?.label || undefined}
                  >
                    {mode === 'readonly' && onDayClick ? (
                      <button
                        type="button"
                        onClick={() => onDayClick(mDate)}
                        className="w-full flex flex-col items-center justify-center rounded-lg py-0.5 hover:bg-[var(--kg-primary-soft)]/60 transition-colors touch-manipulation"
                        aria-label={`Xem chi tiết toàn quán ngày ${formatDateShort(mDate.date)}`}
                      >
                        <span className="font-bold text-[var(--kg-text)] text-[12px] sm:text-[13px] font-mono tabular-nums">
                          {formatDateShort(mDate.date)}
                        </span>
                        <span className="text-[10px] font-semibold opacity-75 mt-0.5">
                          {SHORT_DAY_NAMES[mDate.dayIndex]}
                        </span>
                        {isUnderstaffed && (
                          <span className="mt-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/30 text-[9px] font-black font-mono tabular-nums leading-none">
                            <ShieldAlert size={9} />
                            {waitstaffCount}/3
                          </span>
                        )}
                      </button>
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <div className="font-bold text-[var(--kg-text)] text-[12px] sm:text-[13px] font-mono tabular-nums">
                          {formatDateShort(mDate.date)}
                        </div>
                        <div className="text-[10px] font-semibold opacity-75 mt-0.5">
                          {SHORT_DAY_NAMES[mDate.dayIndex]}
                        </div>
                        {isUnderstaffed && (
                          <span className="mt-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/30 text-[9px] font-black font-mono tabular-nums leading-none">
                            <ShieldAlert size={9} />
                            {waitstaffCount}/3
                          </span>
                        )}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleDates.length + 1}
                  className="py-8 text-center text-[var(--kg-text-muted)] text-xs font-medium"
                >
                  {searchQuery
                    ? `Không tìm thấy nhân viên nào khớp với "${searchQuery}"`
                    : 'Không có dữ liệu nhân viên'}
                </td>
              </tr>
            ) : (
              users.map((emp, empIdx) => {
                const isSelf = Boolean(currentUserUsername && emp.username === currentUserUsername);
                const empSlots = empMonthMap[emp.fullname];

                return (
                  <tr
                    key={emp.username || emp.fullname || empIdx}
                    className={`border-b border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]/60 transition-colors ${
                      isSelf ? 'bg-[var(--kg-primary-soft)]/50' : 'bg-[var(--kg-surface)]'
                    }`}
                  >
                    <td
                      className={`px-3 py-2.5 sticky left-0 z-10 border-r border-[var(--kg-border)] shadow-[2px_0_5px_rgba(0,0,0,0.06)] w-[144px] min-w-[144px] max-w-[144px] sm:w-[164px] sm:min-w-[164px] sm:max-w-[164px] ${
                        isSelf ? 'bg-[var(--kg-primary-soft)]' : 'bg-[var(--kg-surface)]'
                      }`}
                    >
                      <SmartPersonName
                        fullname={emp.fullname}
                        className="max-w-[120px] sm:max-w-[140px] text-xs font-bold text-[var(--kg-text)] truncate block"
                      />
                      {isSelf && (
                        <span className="text-[9px] font-black text-[var(--kg-primary-ink)] uppercase tracking-wider block mt-0.5">
                          Bạn
                        </span>
                      )}
                    </td>

                    {visibleDates.map((mDate) => {
                      const shift = empSlots?.[`${mDate.weekLabel}_${mDate.dayIndex}`] || '';
                      const isOff = shift === 'OFF' || !shift;
                      const dayMeta = dayMetaByDateKey.get(mDate.dateKey);

                      return (
                        <td
                          key={mDate.dateKey}
                          className={`px-1 py-1 relative border-r border-[var(--kg-border)]/50 last:border-r-0 text-center ${
                            dayMeta?.className || (mDate.isWeekend ? 'bg-[var(--kg-surface-soft)]/40' : '')
                          }`}
                          title={dayMeta?.label || undefined}
                        >
                          {mode === 'editable' && onShiftChange ? (
                            <select
                              value={shift}
                              onChange={(e) => onShiftChange(emp.fullname, mDate, e.target.value)}
                              aria-label={`${emp.fullname} - ${formatDateShort(mDate.date)}`}
                              className={`text-xs font-black rounded-lg border focus:outline-none py-1.5 px-1 min-h-[40px] sm:min-h-[38px] w-full min-w-[58px] sm:min-w-[64px] cursor-pointer appearance-none text-center transition-all touch-manipulation shadow-2xs border-[var(--kg-border)] focus:ring-2 focus:ring-[var(--kg-primary)] ${getAdminShiftClass(shift)}`}
                            >
                              <option value="" className="bg-[var(--kg-surface)] text-[var(--kg-text)]">
                                OFF
                              </option>
                              {ADMIN_SHIFT_OPTIONS.map((opt) => (
                                <option
                                  key={opt}
                                  value={opt}
                                  className="bg-[var(--kg-surface)] text-[var(--kg-text)]"
                                >
                                  {formatMobileShift(opt)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onDayClick?.(mDate, emp)}
                              aria-label={`Xem chi tiết ca ngày ${formatDateShort(mDate.date)} - ${emp.fullname}`}
                              className={`inline-flex items-center justify-center text-[10px] font-bold w-full min-h-[36px] px-1 py-1 rounded-lg transition-all active:scale-95 hover:ring-1 hover:ring-[var(--kg-primary)]/40 touch-manipulation ${getAdminShiftClass(shift)}`}
                            >
                              {isOff ? 'OFF' : <ResponsiveShift shift={shift} />}
                            </button>
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
});

export default ShiftMonthMatrix;
