// ============================================
// helpers.ts - Shared utility functions
// ============================================

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

/** Compute week start (next Monday) and sheet name */
export function computeWeekInfo() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;

  const weekStart = new Date(today);
  if (dayOfWeek >= 1) {
    weekStart.setDate(today.getDate() + daysUntilMonday);
  } else {
    weekStart.setDate(today.getDate() + 1);
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
  if (shift.startsWith('OFF')) return 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400';
  return 'bg-gradient-to-r from-ocean-500 to-sky-500 text-white shadow-md shadow-ocean-500/30 transform scale-105 border-transparent';
};

/** Shift color classes - preview (small labels) */
export const getPreviewShiftClass = (shift: string) => {
  if (!shift || shift === 'OFF') return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
  if (shift === 'RẢNH') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400';
  if (shift.startsWith('OFF')) return 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400';
  return 'bg-ocean-100 text-ocean-700 dark:bg-ocean-900/50 dark:text-ocean-300 font-bold border border-ocean-200 dark:border-ocean-800';
};

/** Shift color classes - admin table */
export const getAdminShiftClass = (shift: string) => {
  if (shift === 'OFF') return 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700';
  if (shift === 'RẢNH') return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
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
export const SHIFT_OPTIONS = ['OFF', '15:00', '17:00', 'RẢNH'];
export const ADMIN_SHIFT_OPTIONS = ['OFF', '15:00', '17:00', 'RẢNH', 'OFF#', 'OFF!'];

export const SHIFT_LABELS: Record<string, string> = {
  'OFF': 'Nghỉ',
  '15:00': 'Ca 1',
  '17:00': 'Ca 2',
  'RẢNH': 'Rảnh',
  'OFF#': 'Nghỉ Phép',
  'OFF!': 'Nghỉ Không Phép'
};

export const DAY_NAMES = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'] as const;

// King's Grill coordinates
export const KG_LAT = 10.9760826;
export const KG_LNG = 106.6646541;
export const KG_RADIUS_METERS = 25;
