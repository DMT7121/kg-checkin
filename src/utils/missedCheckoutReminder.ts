export interface OverdueOpenShiftResult {
  isOverdue: boolean;
  shiftLabel: string;
  checkInTimeStr: string;
  expectedEndStr: string;
  overdueMinutes: number;
}

function getVietnamClockParts(nowMs: number) {
  const vn = new Date(nowMs + 7 * 3600 * 1000);
  return {
    year: vn.getUTCFullYear(),
    month: vn.getUTCMonth() + 1,
    day: vn.getUTCDate(),
    hour: vn.getUTCHours(),
    minute: vn.getUTCMinutes(),
  };
}

function parseVietnamTimeMs(timeStr: string): number {
  const s = String(timeStr || '').replace(/^'/, '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  const hh = parseInt(m[4], 10);
  const mi = parseInt(m[5], 10);
  const ss = m[6] ? parseInt(m[6], 10) : 0;
  return Date.UTC(yyyy, mm - 1, dd, hh, mi, ss) - 7 * 3600 * 1000;
}

function isPureCheckIn(label: string): boolean {
  return /^\s*(?:vào(?:\s+ca)?(?:\s*[1-9])?|in(?:\s*[1-9])?)\b/i.test(label);
}

function isPureCheckOut(label: string): boolean {
  return /^\s*(?:ra(?:\s+ca)?(?:\s*[1-9])?|out(?:\s*[1-9])?)\b/i.test(label);
}

function isPendingOrRejectedClaim(label: string): boolean {
  return /^\s*(?:chờ\s*duyệt|từ\s*chối)\s*:/i.test(label);
}

/**
 * Estimates scheduled shift end minute-of-day (can exceed 1440 for past-midnight shifts)
 * from King's Grill shift strings such as:
 * - "15:00-22:30", "17:00 - 23:00", "09:00-15:00"
 * - Single start time like "15:00" (default 7h -> 22:00), "16:00" (22:30),
 *   "17:00" (22:30), "18:00" (23:00), "19:00" (23:00), "09:00" (15:00)
 */
export function estimateScheduledShiftEndMinutes(shiftStr: string): number | null {
  const clean = String(shiftStr || '').trim();
  if (!clean || /^off\b/i.test(clean) || /^rảnh\b/i.test(clean)) return null;

  const rangeMatch = clean.match(/(\d{1,2}):(\d{2})\s*[-–~]\s*(\d{1,2}):(\d{2})/);
  if (rangeMatch) {
    const startMin = parseInt(rangeMatch[1], 10) * 60 + parseInt(rangeMatch[2], 10);
    let endMin = parseInt(rangeMatch[3], 10) * 60 + parseInt(rangeMatch[4], 10);
    if (endMin <= startMin) endMin += 24 * 60; // overnight shift
    return endMin;
  }

  const startOnly = clean.match(/(\d{1,2}):(\d{2})/);
  if (!startOnly) return null;
  const startH = parseInt(startOnly[1], 10);
  const startM = parseInt(startOnly[2], 10);
  const startTotal = startH * 60 + startM;

  if (startH < 12) return startTotal + 6 * 60;
  if (startH < 16) return Math.min(23 * 60, startTotal + 7 * 60);
  if (startH === 16 || startH === 17) return 22 * 60 + 30;
  if (startH >= 18) return 23 * 60;
  return startTotal + 6 * 60;
}

/**
 * Pure, deterministic detector for Forgotten Checkout ("Nhắc quên chấm Ra ca"):
 * Triggers when an employee has an open Vào ca today (inCount > outCount)
 * and current Vietnam time is >= 45 minutes past scheduled shift end (or >= 8.5 hours since Vào ca if no shift).
 */
export function detectOverdueOpenShift(params: {
  todayShift?: string | null;
  todayLogs: Array<{ type?: string; time?: string; timestamp?: number }>;
  nowMs?: number;
  graceMinutes?: number;
}): OverdueOpenShiftResult | null {
  const nowMs = params.nowMs ?? Date.now();
  const graceMinutes = params.graceMinutes ?? 45;
  const vnNow = getVietnamClockParts(nowMs);
  const todayKey = `${String(vnNow.day).padStart(2, '0')}/${String(vnNow.month).padStart(2, '0')}/${vnNow.year}`;

  let inCount = 0;
  let outCount = 0;
  let latestInTimeStr = '';
  let latestInMs = 0;

  for (const log of params.todayLogs || []) {
    const rawType = String(log?.type || '').trim();
    if (!rawType || isPendingOrRejectedClaim(rawType)) {
      continue;
    }
    const timeStr = String(log?.time || '').replace(/^'/, '').trim();
    const ts = Number(log?.timestamp || 0) || parseVietnamTimeMs(timeStr);
    const matchesToday = timeStr.startsWith(todayKey) || (ts > 0 && nowMs - ts < 16 * 3600 * 1000);
    if (!matchesToday) continue;

    if (isPureCheckIn(rawType)) {
      inCount += 1;
      if (ts >= latestInMs) {
        latestInMs = ts;
        latestInTimeStr = timeStr.split(' ').pop()?.slice(0, 5) || timeStr;
      }
    } else if (isPureCheckOut(rawType)) {
      outCount += 1;
    }
  }

  if (inCount <= outCount || !latestInTimeStr) {
    return null;
  }

  const nowMinOfDay = vnNow.hour * 60 + vnNow.minute;
  const shiftLabel = String(params.todayShift || '').trim();
  const estEndMin = estimateScheduledShiftEndMinutes(shiftLabel);

  if (estEndMin !== null) {
    const effectiveNowMin =
      vnNow.hour < 6 && estEndMin >= 18 * 60 ? nowMinOfDay + 24 * 60 : nowMinOfDay;
    const overdueMinutes = effectiveNowMin - estEndMin;
    if (overdueMinutes >= graceMinutes) {
      const dispH = String(Math.floor((estEndMin % 1440) / 60)).padStart(2, '0');
      const dispM = String(estEndMin % 60).padStart(2, '0');
      return {
        isOverdue: true,
        shiftLabel: shiftLabel || 'Ca hôm nay',
        checkInTimeStr: latestInTimeStr,
        expectedEndStr: `${dispH}:${dispM}`,
        overdueMinutes,
      };
    }
    return null;
  }

  if (latestInMs > 0) {
    const elapsedMins = Math.floor((nowMs - latestInMs) / 60000);
    if (elapsedMins >= 8 * 60 + 30) {
      return {
        isOverdue: true,
        shiftLabel: 'Ca đang mở',
        checkInTimeStr: latestInTimeStr,
        expectedEndStr: '8.5 giờ làm',
        overdueMinutes: elapsedMins - 8 * 60,
      };
    }
  }

  return null;
}
