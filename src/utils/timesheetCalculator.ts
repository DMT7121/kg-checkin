// ============================================================================
// King's Grill HR - Timesheet & Overtime Calculation Engine
// - Pairs in/out check-in records cleanly in a day ("Vào ca" - "Ra ca")
// - Consolidates overnight check-outs (00:00 - 06:00 next day) to previous day
// - Threshold 00:15:
//   * <= 00:15: Same-shift checkout, no overtime (hours = in to checkout)
//   * > 00:15: Main shift caps at 00:00, remainder is Overtime (hours = 00:00 to checkout)
// - Supports ultra-fast client-side computation for instant UI rendering
// ============================================================================

export interface RawLogItem {
  status: string;
  validStatus?: string;
  time: string;
  originalTimeMs: number;
}

export interface WorkSession {
  inTime: string;
  outTime: string;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  isOvernight: boolean;
  isMissingOut: boolean;
  displayLine: string;
}

export interface DayCalculationResult {
  dateStr: string; // "DD/MM/YYYY"
  dayNumber: number;
  sessions: WorkSession[];
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
  timeText: string;
  hasMissingCheckout: boolean;
  hasOvertime: boolean;
  hasData: boolean;
}

export interface UserMonthSummary {
  fullname: string;
  days: Record<number, DayCalculationResult>;
  totalMonthHours: number;
  totalRegularHours: number;
  totalOvertimeHours: number;
  workedDaysCount: number;
}

/**
 * Parses "HH:mm" or "H:m" into total minutes from midnight (0..1439)
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/**
 * Checks if a log status is considered valid for work hours
 */
export function isLogValid(record: RawLogItem): boolean {
  const validStr = (record.validStatus || '').toUpperCase();
  if (validStr === '') return true; // Default valid if not explicitly marked invalid
  return validStr.includes('HỢP LỆ') && !validStr.includes('KHÔNG');
}

/**
 * Checks if a record status is a Check-in (Vào ca)
 */
export function isCheckIn(status: string): boolean {
  const s = (status || '').toUpperCase();
  return s.includes('VÀO CA') || s.includes('VÀO') || s === 'IN';
}

/**
 * Checks if a record status is a Check-out (Ra ca)
 */
export function isCheckOut(status: string): boolean {
  const s = (status || '').toUpperCase();
  return s.includes('RA CA') || s.includes('RA') || s === 'OUT';
}

/**
 * Formats day, month, year into "DD/MM/YYYY"
 */
export function formatDayDateKey(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

const OVERNIGHT_THRESHOLD_MINUTES = 15; // 00:15 in minutes
const EARLY_MORNING_LIMIT_MINUTES = 6 * 60; // 06:00 in minutes

/**
 * Unified calculation for an employee across an entire month.
 * Correctly accounts for overnight checkouts (00:00 - 06:00 next day) with the 00:15 threshold.
 */
export function calculateEmployeeMonthTimesheet(
  fullname: string,
  userDates: Record<string, RawLogItem[]>,
  daysInMonth: number,
  month: number,
  year: number
): UserMonthSummary {
  const dayResults: Record<number, DayCalculationResult> = {};
  const consumedEarlyOutTimes = new Set<number>();

  let totalMonthHours = 0;
  let totalRegularHours = 0;
  let totalOvertimeHours = 0;
  let workedDaysCount = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDayDateKey(d, month, year);
    const rawRecords = (userDates[dateStr] || []).filter(isLogValid);

    // Filter out early morning checkouts on this day that were claimed by day d - 1
    const records = rawRecords.filter(r => !consumedEarlyOutTimes.has(r.originalTimeMs));
    records.sort((a, b) => a.originalTimeMs - b.originalTimeMs);

    const sessions: WorkSession[] = [];
    let currentIn: RawLogItem | null = null;

    for (const r of records) {
      if (isCheckIn(r.status)) {
        if (currentIn) {
          // Previous checkin had no checkout
          sessions.push({
            inTime: currentIn.time,
            outTime: '?',
            regularHours: 0,
            overtimeHours: 0,
            totalHours: 0,
            isOvernight: false,
            isMissingOut: true,
            displayLine: `Vào ca: ${currentIn.time} - Ra ca: ?`,
          });
        }
        currentIn = r;
      } else if (isCheckOut(r.status)) {
        if (currentIn) {
          // Standard same-day pair
          const inMin = timeStringToMinutes(currentIn.time);
          const outMin = timeStringToMinutes(r.time);
          let diffMin = outMin - inMin;
          if (diffMin < 0) diffMin += 24 * 60; // Cross-midnight within day records
          const hours = Math.max(0, diffMin / 60);

          sessions.push({
            inTime: currentIn.time,
            outTime: r.time,
            regularHours: hours,
            overtimeHours: 0,
            totalHours: hours,
            isOvernight: false,
            isMissingOut: false,
            displayLine: `Vào ca: ${currentIn.time} - Ra ca: ${r.time}`,
          });
          currentIn = null;
        }
      }
    }

    // If there is an unclosed checkin at end of day d, look ahead to day d + 1
    if (currentIn) {
      let nextDateStr = '';
      let nextRawRecords: RawLogItem[] = [];

      if (d < daysInMonth) {
        nextDateStr = formatDayDateKey(d + 1, month, year);
        nextRawRecords = (userDates[nextDateStr] || []).filter(isLogValid);
      } else {
        // Next day might be day 1 of next month
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        nextDateStr = formatDayDateKey(1, nextMonth, nextYear);
        nextRawRecords = (userDates[nextDateStr] || []).filter(isLogValid);
      }

      nextRawRecords.sort((a, b) => a.originalTimeMs - b.originalTimeMs);

      // Find earliest early morning checkout (00:00 - 06:00) on day d + 1
      const earlyOut = nextRawRecords.find(r => {
        if (!isCheckOut(r.status)) return false;
        const min = timeStringToMinutes(r.time);
        return min >= 0 && min <= EARLY_MORNING_LIMIT_MINUTES && !consumedEarlyOutTimes.has(r.originalTimeMs);
      });

      if (earlyOut) {
        consumedEarlyOutTimes.add(earlyOut.originalTimeMs);
        const inMin = timeStringToMinutes(currentIn.time);
        const outMin = timeStringToMinutes(earlyOut.time); // minutes from 00:00 next day

        if (outMin <= OVERNIGHT_THRESHOLD_MINUTES) {
          // Case A: <= 00:15 (e.g. 00:05, 00:10, 00:15)
          // Attributed entirely to previous day, NO overtime
          const totalMin = (24 * 60 - inMin) + outMin;
          const hours = totalMin / 60;
          sessions.push({
            inTime: currentIn.time,
            outTime: earlyOut.time,
            regularHours: hours,
            overtimeHours: 0,
            totalHours: hours,
            isOvernight: true,
            isMissingOut: false,
            displayLine: `Vào ca: ${currentIn.time} - Ra ca: ${earlyOut.time}`,
          });
        } else {
          // Case B: > 00:15 (e.g. 00:30, 01:00, 02:15)
          // Main shift caps at 00:00, remainder is Overtime
          const regularMin = 24 * 60 - inMin;
          const overtimeMin = outMin;
          const regHours = regularMin / 60;
          const otHours = overtimeMin / 60;
          const totalHours = regHours + otHours;

          sessions.push({
            inTime: currentIn.time,
            outTime: earlyOut.time,
            regularHours: regHours,
            overtimeHours: otHours,
            totalHours,
            isOvernight: true,
            isMissingOut: false,
            displayLine: `Vào ca: ${currentIn.time} - Ra ca: 00:00 (Tăng ca: 00:00 - ${earlyOut.time})`,
          });
        }
      } else {
        // Missing checkout
        sessions.push({
          inTime: currentIn.time,
          outTime: '?',
          regularHours: 0,
          overtimeHours: 0,
          totalHours: 0,
          isOvernight: false,
          isMissingOut: true,
          displayLine: `Vào ca: ${currentIn.time} - Ra ca: ?`,
        });
      }
      currentIn = null;
    }

    // Calculate day aggregates
    const dayRegularHours = sessions.reduce((sum, s) => sum + s.regularHours, 0);
    const dayOvertimeHours = sessions.reduce((sum, s) => sum + s.overtimeHours, 0);
    const dayTotalHours = dayRegularHours + dayOvertimeHours;
    const hasMissingCheckout = sessions.some(s => s.isMissingOut);
    const hasOvertime = dayOvertimeHours > 0;
    const hasData = sessions.length > 0;

    // Build timeText lines for display in table and mobile views
    const timeTextLines = sessions.map(s => {
      if (s.isMissingOut) return `${s.inTime} - ?`;
      if (s.isOvernight && s.overtimeHours > 0) {
        return `${s.inTime} - 00:00 (+${s.overtimeHours.toFixed(1)}h TC)`;
      }
      return `${s.inTime} - ${s.outTime}`;
    });

    dayResults[d] = {
      dateStr,
      dayNumber: d,
      sessions,
      regularHours: dayRegularHours,
      overtimeHours: dayOvertimeHours,
      totalHours: dayTotalHours,
      timeText: timeTextLines.join('\n'),
      hasMissingCheckout,
      hasOvertime,
      hasData,
    };

    totalRegularHours += dayRegularHours;
    totalOvertimeHours += dayOvertimeHours;
    totalMonthHours += dayTotalHours;
    if (dayTotalHours > 0) workedDaysCount++;
  }

  return {
    fullname,
    days: dayResults,
    totalMonthHours,
    totalRegularHours,
    totalOvertimeHours,
    workedDaysCount,
  };
}
