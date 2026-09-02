// ============================================
// helpers.ts - Shared utility functions
// ============================================
import { callApi } from '../services/api';

/** Haversine distance in km */
export function getDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Text-to-speech Vietnamese */
export function speak(text: string) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  }
}

/** Format date as dd/MM */
export function formatDateShort(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/** Format date as YYYY-MM-DD key */
export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Get current time string dd/MM/yyyy HH:mm */
export function getCurrentTimeString(): string {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Compute week start (next Monday) and sheet name. If 'date' is passed, it computes the week for that date (treating it as if it's the 'today' to calculate next week, or we can just calculate the week that contains the date). Wait, computeWeekInfo currently calculates the NEXT week. If we want the week containing a specific date, we should have a different logic. */
export function computeWeekInfo(targetDate?: Date, getNextWeek: boolean = true) {
  const today = targetDate || new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;

  const weekStart = new Date(today);
  
  if (getNextWeek) {
    if (dayOfWeek >= 1) {
      weekStart.setDate(today.getDate() + daysUntilMonday);
    } else {
      weekStart.setDate(today.getDate() + 1);
    }
  } else {
    // Get the week CONTAINING the target date (Monday to Sunday)
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    weekStart.setDate(today.getDate() - daysSinceMonday);
  }
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekDisplay = `${formatDateShort(weekStart)} - ${formatDateShort(weekEnd)}`;

  const weekDates: string[] = [];
  const weekDatesKeys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDates.push(formatDateShort(d));
    weekDatesKeys.push(formatDateKey(d));
  }

  const startDay = String(weekStart.getDate()).padStart(2, '0');
  const startMonth = String(weekStart.getMonth() + 1).padStart(2, '0');
  const endDay = String(weekEnd.getDate()).padStart(2, '0');
  const endMonth = String(weekEnd.getMonth() + 1).padStart(2, '0');
  const month = String(weekStart.getMonth() + 1).padStart(2, '0');
  const year = weekStart.getFullYear();
  
  const sheetName = `W${startDay}-${endDay} (${month})`;
  const monthSheet = `Tháng ${month}/${year}`;
  const weekLabel = `📅 TUẦN ${startDay}/${startMonth} - ${endDay}/${endMonth}`;

  return { weekStart, weekEnd, weekDisplay, weekDates, weekDatesKeys, sheetName, monthSheet, weekLabel };
}

/** Check if schedule registration window is currently open
 *  Open: Monday 00:00 → Saturday 17:00
 *  Closed: Saturday 17:00 → Sunday 23:59
 */
export function isRegistrationOpen(): { open: boolean; message: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...6=Sat
  const hour = now.getHours();

  // Sunday: closed all day
  if (day === 0) {
    return { open: false, message: 'Đăng ký đã đóng. Mở lại lúc 00:00 Thứ Hai.' };
  }

  // Saturday: open if before 17:00
  if (day === 6) {
    if (hour >= 17) {
      return { open: false, message: 'Đăng ký đã đóng. Mở lại lúc 00:00 Thứ Hai.' };
    }
    const remainHrs = 17 - hour;
    return { open: true, message: `Hạn cuối: Hôm nay lúc 17:00 (còn ~${remainHrs}h)` };
  }

  // Monday - Friday: open
  const daysUntilSat = 6 - day;
  return { open: true, message: `Hạn cuối: 17:00 Thứ Bảy (còn ${daysUntilSat} ngày)` };
}

/** Detect Zalo / Facebook in-app browser */
export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent;
  return /Zalo/i.test(ua) || /FBAN/i.test(ua) || /FBAV/i.test(ua);
}

/** Shift color classes - active state */
export const getActiveShiftClass = (shift: string) => {
  if (shift === 'OFF') return 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 line-through';
  if (shift === 'RẢNH') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
  if (shift === '18:00') return 'bg-gradient-to-r from-orange-400 to-red-500 text-white shadow-md shadow-red-500/30 transform scale-105 border-transparent';
  if (shift === '19:00') return 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/30 transform scale-105 border-transparent';
  if (shift.startsWith('OFF')) return 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400';
  return 'bg-gradient-to-r from-ocean-500 to-sky-500 text-white shadow-md shadow-ocean-500/30 transform scale-105 border-transparent';
};

/** Shift color classes - preview (small labels) */
export const getPreviewShiftClass = (shift: string) => {
  if (!shift || shift === 'OFF') return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
  if (shift === 'RẢNH') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400';
  if (shift === '18:00') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
  if (shift === '19:00') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400';
  if (shift.startsWith('OFF')) return 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400';
  return 'bg-ocean-100 text-ocean-700 dark:bg-ocean-900/50 dark:text-ocean-300 font-bold border border-ocean-200 dark:border-ocean-800';
};

/** Shift color classes - admin table */
export const getAdminShiftClass = (shift: string) => {
  if (shift === 'OFF') return 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700';
  if (shift === 'RẢNH') return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
  if (shift === '18:00') return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800 font-bold';
  if (shift === '19:00') return 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800 font-bold';
  if (shift === 'OFF#') return 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800';
  if (shift === 'OFF!') return 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800';
  return 'bg-ocean-50 text-ocean-700 dark:bg-ocean-900/30 dark:text-ocean-400 border border-ocean-200 dark:border-ocean-800 font-bold';
};

/** Fetch with retry and exponential backoff */
export async function fetchWithRetry(url: string, options: RequestInit, retries = 5, delay = 1000): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

// Shift Options & Labels
export const SHIFT_OPTIONS = ['OFF', '15:00', '17:00', '18:00', '19:00', 'RẢNH'];
export const ADMIN_SHIFT_OPTIONS = ['OFF', '15:00', '17:00', '18:00', '19:00', 'RẢNH', 'OFF#', 'OFF!'];

export const SHIFT_LABELS: Record<string, string> = {
  'OFF': 'Nghỉ',
  '15:00': 'Ca 1 (15:00)',
  '17:00': 'Ca 2 (17:00)',
  '18:00': 'Ca 3 (18:00)',
  '19:00': 'Ca 4 (19:00)',
  'RẢNH': 'Rảnh',
  'OFF#': 'Nghỉ Phép',
  'OFF!': 'Nghỉ Không Phép'
};

export const DAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'] as const;
export const SHORT_DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;

export const KG_LAT = 10.9760826;
export const KG_LNG = 106.6646541;
export const KG_RADIUS_METERS = 20;

export interface CheckInRecommendation {
  recommendedType: 'Vào ca' | 'Ra ca';
  reason: string;
  hasInToday: boolean;
  hasOutToday: boolean;
  firstInTime?: string;
  lastPunch?: { type: string; time: string; date: Date };
  isOpenShift: boolean;
  openShiftTime?: string;
  isOvernightShift: boolean;
  todayLogsCount: number;
}

export interface MissingCheckInAlert {
  id: string;
  dateStr: string;
  timeStr: string;
  missingType: 'Vào ca' | 'Ra ca';
  existingType: 'Vào ca' | 'Ra ca';
  message: string;
}

/**
 * Universal Date Parser for logs
 * Supports:
 * - Date objects & timestamp numbers
 * - dd/MM/yyyy HH:mm:ss, dd/MM/yyyy HH:mm, d/M/yyyy H:m
 * - dd-MM-yyyy HH:mm:ss, yyyy-MM-dd HH:mm:ss
 * - JS Date strings from Google Sheets (e.g. 'Wed Sep 02 2026 20:45:12 GMT+0700')
 * - ISO 8601 strings (e.g. '2026-09-02T13:45:12.000Z')
 */
export function parseLogDate(timeStr: any): Date | null {
  if (!timeStr) return null;
  if (timeStr instanceof Date) return isNaN(timeStr.getTime()) ? null : timeStr;
  if (typeof timeStr === 'number') {
    const d = new Date(timeStr);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof timeStr !== 'string') {
    const d = new Date(timeStr);
    return isNaN(d.getTime()) ? null : d;
  }

  const cleanStr = timeStr.trim();
  if (!cleanStr) return null;

  // Format 1: dd/MM/yyyy or dd-MM-yyyy (e.g., '02/09/2026 20:45:12' or '2/9/2026 20:45')
  const dmyMatch = cleanStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const d = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(d.getTime())) return d;
  }

  // Format 2: ISO or standard JavaScript Date string from Google Sheets ('Wed Sep 02 2026 20:45:12 GMT+0700' or '2026-09-02T13:45:12Z')
  const directDate = new Date(cleanStr);
  if (!isNaN(directDate.getTime())) return directDate;

  return null;
}

/**
 * Check if two dates represent the exact same calendar day (day, month, year)
 */
export function isSameCalendarDay(d1: Date, d2: Date): boolean {
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
}

/**
 * Flexible User Matching: handles exact names, usernames, diacritic differences, and casing
 */
export function matchesUser(
  log: { fullname?: string; username?: string } | undefined | null,
  currentUser: { fullname: string; username?: string } | undefined | null
): boolean {
  if (!log || !currentUser) return false;
  const userFullname = (currentUser.fullname || '').trim().toLowerCase();
  const username = (currentUser.username || '').trim().toLowerCase();
  const logFullname = (log.fullname || '').trim().toLowerCase();
  const logUsername = (log.username || '').trim().toLowerCase();

  if (logFullname && (logFullname === userFullname || logFullname === username)) return true;
  if (logUsername && (logUsername === username || logUsername === userFullname)) return true;

  // Normalized without diacritics (e.g. Nguyễn Văn A vs Nguyen Van A)
  const normUser = userFullname.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normLog = logFullname.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normUser && normLog && normUser === normLog) return true;

  return false;
}

/**
 * Local Punch Storage: Caches last check-in/out on device for 0ms instant UI state
 */
export function setLocalLastPunch(
  currentUser: { fullname: string; username?: string } | null,
  type: string,
  timeStr: string
): void {
  if (!currentUser) return;
  try {
    const item = {
      fullname: currentUser.fullname,
      username: currentUser.username,
      type,
      time: timeStr,
      timestamp: Date.now()
    };
    localStorage.setItem('kg_last_punch_record', JSON.stringify(item));
  } catch (e) {
    console.warn('[Storage] setLocalLastPunch error:', e);
  }
}

export function getLocalLastPunch(
  currentUser: { fullname: string; username?: string } | null
): { fullname: string; username?: string; type: string; time: string; timestamp: number } | null {
  if (!currentUser) return null;
  try {
    const raw = localStorage.getItem('kg_last_punch_record');
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (!item || !item.type || !item.time) return null;
    
    // Validate that it belongs to the current user
    if (!matchesUser(item, currentUser)) return null;

    return item;
  } catch {
    return null;
  }
}

/**
 * Audit recent logs to detect any unclosed shifts or missing check-ins
 */
export function auditMissingCheckIns(
  logs: { fullname: string; type: string; time: string }[] | undefined,
  currentUser: { fullname: string; username?: string } | null,
  daysBack = 7
): MissingCheckInAlert[] {
  if (!currentUser || !logs || logs.length === 0) return [];

  const now = new Date();
  const cutoffTime = now.getTime() - daysBack * 24 * 60 * 60 * 1000;

  // Filter and sort ascending
  const userLogsWithDate = logs
    .filter((l) => matchesUser(l, currentUser) && l.time)
    .map((l) => ({ log: l, date: parseLogDate(l.time) }))
    .filter((item): item is { log: { fullname: string; type: string; time: string }; date: Date } => item.date !== null)
    .filter((item) => item.date.getTime() >= cutoffTime)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const alerts: MissingCheckInAlert[] = [];
  let pendingIn: { log: { fullname: string; type: string; time: string }; date: Date } | null = null;

  for (let i = 0; i < userLogsWithDate.length; i++) {
    const item = userLogsWithDate[i];
    const isCheckIn = item.log.type.includes('Vào ca') || item.log.type.includes('IN') || item.log.type.toLowerCase().includes('vào');
    const isCheckOut = item.log.type.includes('Ra ca') || item.log.type.includes('OUT') || item.log.type.toLowerCase().includes('ra');

    if (isCheckIn) {
      if (pendingIn) {
        // Found a previous IN without OUT
        const elapsedHrs = (item.date.getTime() - pendingIn.date.getTime()) / (1000 * 60 * 60);
        if (elapsedHrs > 3) {
          const dStr = formatDateShort(pendingIn.date);
          const tStr = `${String(pendingIn.date.getHours()).padStart(2, '0')}:${String(pendingIn.date.getMinutes()).padStart(2, '0')}`;
          alerts.push({
            id: `missing_out_${pendingIn.date.getTime()}`,
            dateStr: dStr,
            timeStr: tStr,
            missingType: 'Ra ca',
            existingType: 'Vào ca',
            message: `Thiếu Ra ca cho lượt Vào ngày ${dStr} (${tStr})`
          });
        }
      }
      pendingIn = item;
    } else if (isCheckOut) {
      if (pendingIn) {
        // Paired successfully
        pendingIn = null;
      } else {
        // Found OUT without IN
        const dStr = formatDateShort(item.date);
        const tStr = `${String(item.date.getHours()).padStart(2, '0')}:${String(item.date.getMinutes()).padStart(2, '0')}`;
        alerts.push({
          id: `missing_in_${item.date.getTime()}`,
          dateStr: dStr,
          timeStr: tStr,
          missingType: 'Vào ca',
          existingType: 'Ra ca',
          message: `Thiếu Vào ca cho lượt Ra ngày ${dStr} (${tStr})`
        });
      }
    }
  }

  // If there is still an open pending IN older than 16 hours
  if (pendingIn) {
    const elapsedHrs = (now.getTime() - pendingIn.date.getTime()) / (1000 * 60 * 60);
    if (elapsedHrs > 16) {
      const dStr = formatDateShort(pendingIn.date);
      const tStr = `${String(pendingIn.date.getHours()).padStart(2, '0')}:${String(pendingIn.date.getMinutes()).padStart(2, '0')}`;
      alerts.push({
        id: `missing_out_${pendingIn.date.getTime()}`,
        dateStr: dStr,
        timeStr: tStr,
        missingType: 'Ra ca',
        existingType: 'Vào ca',
        message: `Quên Ra ca ngày ${dStr} (Vào lúc ${tStr})`
      });
    }
  }

  return alerts.reverse(); // Newest first
}

/**
 * Advanced State-Machine Check-in Type Recommendation Engine
 * - Tracks last punch action (Vào ca vs Ra ca)
 * - Supports Overnight Cross-day shifts (00:00 - 06:00 of next day)
 * - Supports Multiple shifts per day (Split-shifts: In 1 -> Out 1 -> In 2 -> Out 2)
 * - Uses Local Last Punch fallback for instantaneous 0ms accurate state
 */
export function getRecommendedCheckInType(
  logs: { fullname: string; type: string; time: string }[] | undefined,
  currentUser: { fullname: string; username?: string; role?: string } | null,
  targetDate: Date = new Date()
): CheckInRecommendation {
  if (!currentUser) {
    return {
      recommendedType: 'Vào ca',
      reason: 'Lần đầu trong ngày: Tự động chọn Vào ca',
      hasInToday: false,
      hasOutToday: false,
      isOpenShift: false,
      isOvernightShift: false,
      todayLogsCount: 0
    };
  }

  // Filter logs for user and parse dates with Universal Parser
  let userLogsWithDates = (logs || [])
    .filter((l) => matchesUser(l, currentUser) && l.time)
    .map((l) => ({ log: l, date: parseLogDate(l.time) }))
    .filter((item): item is { log: { fullname: string; type: string; time: string }; date: Date } => item.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Fallback 1: If store has user-specific logs but name spelling differed, use logs if non-empty
  if (userLogsWithDates.length === 0 && (logs || []).length > 0 && currentUser.role !== 'admin') {
    const candidateLogs = (logs || [])
      .map((l) => ({ log: l, date: parseLogDate(l.time) }))
      .filter((item): item is { log: { fullname: string; type: string; time: string }; date: Date } => item.date !== null)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (candidateLogs.length > 0) {
      userLogsWithDates = candidateLogs;
    }
  }

  // Fallback 2: If no server logs found, check local storage punch cache
  if (userLogsWithDates.length === 0) {
    const localLast = getLocalLastPunch(currentUser);
    if (localLast) {
      const localDate = parseLogDate(localLast.time) || new Date(localLast.timestamp);
      userLogsWithDates = [{ log: { fullname: currentUser.fullname, type: localLast.type, time: localLast.time }, date: localDate }];
    }
  }

  const userTodayLogs = userLogsWithDates.filter((l) => isSameCalendarDay(l.date, targetDate));
  const hasInToday = userTodayLogs.some((l) => l.log.type.includes('Vào ca') || l.log.type.includes('IN') || l.log.type.toLowerCase().includes('vào'));
  const hasOutToday = userTodayLogs.some((l) => l.log.type.includes('Ra ca') || l.log.type.includes('OUT') || l.log.type.toLowerCase().includes('ra'));

  const firstInItem = userTodayLogs.find((l) => l.log.type.includes('Vào ca') || l.log.type.includes('IN') || l.log.type.toLowerCase().includes('vào'));
  const firstInTime = firstInItem ? `${String(firstInItem.date.getHours()).padStart(2, '0')}:${String(firstInItem.date.getMinutes()).padStart(2, '0')}` : undefined;

  const currentMinutes = targetDate.getHours() * 60 + targetDate.getMinutes();
  const isEarlyMorning = currentMinutes < (6 * 60); // 00:00 - 06:00
  const isAfter1930 = currentMinutes >= (19 * 60 + 30); // >= 19:30
  const isEarlyRange = currentMinutes >= (6 * 60) && currentMinutes < (19 * 60 + 30); // 06:00 - 19:30

  // Inspect the very last punch in history
  const lastItem = userLogsWithDates.length > 0 ? userLogsWithDates[userLogsWithDates.length - 1] : null;

  if (lastItem) {
    const isLastIn = lastItem.log.type.includes('Vào ca') || lastItem.log.type.includes('IN') || lastItem.log.type.toLowerCase().includes('vào');
    const elapsedHrs = (targetDate.getTime() - lastItem.date.getTime()) / (1000 * 60 * 60);
    const lastTimeStr = `${String(lastItem.date.getHours()).padStart(2, '0')}:${String(lastItem.date.getMinutes()).padStart(2, '0')}`;
    const lastDateStr = formatDateShort(lastItem.date);

    // STATE: Open Shift (Last punch was Vào ca)
    if (isLastIn) {
      // If elapsed <= 16 hours -> Shift is ACTIVELY OPEN
      if (elapsedHrs <= 16) {
        const isDifferentDay = !isSameCalendarDay(lastItem.date, targetDate);
        const isOvernight = isDifferentDay && isEarlyMorning;

        return {
          recommendedType: 'Ra ca',
          reason: isOvernight
            ? `🌙 Ra ca cho ca đêm bắt đầu từ hôm qua (Vào lúc ${lastTimeStr} ${lastDateStr})`
            : `Đã vào ca lúc ${lastTimeStr} → Đề xuất Ra ca`,
          hasInToday,
          hasOutToday,
          firstInTime,
          lastPunch: { type: lastItem.log.type, time: lastItem.log.time, date: lastItem.date },
          isOpenShift: true,
          openShiftTime: lastTimeStr,
          isOvernightShift: isOvernight,
          todayLogsCount: userTodayLogs.length
        };
      }

      // If elapsed > 16 hours -> Previous shift was abandoned/forgotten checkout
      return {
        recommendedType: 'Vào ca',
        reason: isEarlyRange
          ? 'Bắt đầu ca mới (06:00 - 19:30) → Ưu tiên Vào ca'
          : isAfter1930
          ? 'Bắt đầu ca mới (Ca tối sau 19:30) → Ưu tiên Vào ca'
          : 'Bắt đầu ca làm việc mới → Ưu tiên Vào ca',
        hasInToday,
        hasOutToday,
        firstInTime: undefined,
        lastPunch: { type: lastItem.log.type, time: lastItem.log.time, date: lastItem.date },
        isOpenShift: false,
        openShiftTime: undefined,
        isOvernightShift: false,
        todayLogsCount: userTodayLogs.length
      };
    }

    // STATE: Shift Closed (Last punch was Ra ca)
    // Next action is starting a new shift -> VÀO CA
    if (userTodayLogs.length >= 2 && isSameCalendarDay(lastItem.date, targetDate)) {
      return {
        recommendedType: 'Vào ca',
        reason: `Đã hoàn thành ca trước (Ra ca lúc ${lastTimeStr}) → Đề xuất Vào ca tiếp theo (Ca gãy)`,
        hasInToday,
        hasOutToday,
        firstInTime,
        lastPunch: { type: lastItem.log.type, time: lastItem.log.time, date: lastItem.date },
        isOpenShift: false,
        isOvernightShift: false,
        todayLogsCount: userTodayLogs.length
      };
    }
  }

  // Fallback / First punch of the day
  return {
    recommendedType: 'Vào ca',
    reason: isEarlyRange
      ? 'Lần đầu trong ngày (06:00 - 19:30) → Ưu tiên Vào ca'
      : isAfter1930
      ? 'Lần đầu trong ngày (Ca tối sau 19:30) → Ưu tiên Vào ca'
      : 'Lần đầu trong ngày → Ưu tiên Vào ca',
    hasInToday,
    hasOutToday,
    firstInTime: undefined,
    lastPunch: lastItem ? { type: lastItem.log.type, time: lastItem.log.time, date: lastItem.date } : undefined,
    isOpenShift: false,
    isOvernightShift: false,
    todayLogsCount: userTodayLogs.length
  };
}

export interface MonthDateInfo {
  date: Date;
  dateKey: string;
  dayIndex: number; // 0=Mon, 1=Tue... 6=Sun
  weekLabel: string;
  isWeekend: boolean;
}

export function generateMonthDates(month: number, year: number): MonthDateInfo[] {
  // month is 1-12
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates: MonthDateInfo[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dayOfWeek = date.getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const weekInfo = computeWeekInfo(date, false); // Get week containing this date
    
    dates.push({
      date,
      dateKey: formatDateKey(date),
      dayIndex,
      weekLabel: weekInfo.weekLabel,
      isWeekend: dayIndex >= 5
    });
  }
  
  return dates;
}

/**
 * Upload an image (base64) to Google Drive via GAS endpoint
 * Used for avatars, newsfeed, chat, reports, etc.
 * @param base64Image The image as a base64 DataURL
 * @param filename Optional filename (e.g. avatar_username.jpg)
 * @returns The public URL of the uploaded image or null if failed
 */
export async function uploadImageToDrive(base64Image: string, filename?: string): Promise<string | null> {
  try {
    const payload: any = { image: base64Image };
    if (filename) payload.filename = filename;
    
    // We run it as background so it doesn't block the UI with Swal loaders,
    // The calling component can show its own loading state.
    const res = await callApi('UPLOAD_IMAGE', payload, { background: true });
    if (res?.ok && res.data?.url) {
      return res.data.url;
    }
    console.error('Image upload failed:', res?.message);
    return null;
  } catch (error) {
    console.error('Image upload failed:', error);
    return null;
  }
}

/** 
 * Convert a File object to base64 DataURL with client-side compression 
 * Keeps image sharp but reduces size (Max dimension 1280px, JPEG 0.8)
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Max dimension 1280px to keep it sharp but lightweight
        const MAX_DIMENSION = 1280;
        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string); // fallback
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        // Force JPEG 80% quality for optimal balance of size & sharpness
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        resolve(compressedBase64);
      };
      img.onerror = (error) => reject(error);
      img.src = event.target?.result as string;
    };
    reader.onerror = (error) => reject(error);
  });
}
