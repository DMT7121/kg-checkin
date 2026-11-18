// ============================================================================
// attendanceSequence.ts
// Unified Workday Cycle (06:00 -> 05:59 GMT+7), Unified Punch Labels
// (Vào ca ⇄ Ra ca), Overnight <06:00 Rule & 15-Min Per-User Cooldown
// Shared across Classic Mode (v1) and Fast Face Recognition Mode (v2).
// ============================================================================

export type CanonicalPunchType = 'Vào ca' | 'Ra ca';

export type PunchBlockedReason = 'COOLDOWN_15M' | 'COOLDOWN_30M' | 'MAX_4_PUNCHES';

export interface AttendanceLogEntryLike {
  username?: string;
  fullname?: string;
  type?: string;
  time?: string | number | Date;
  timestamp?: number;
}

export interface AttendanceUserLike {
  username?: string;
  fullname: string;
  role?: string;
}

export interface PerUserCooldownRecord {
  usernameKey: string;
  fullname: string;
  type: string;
  time: string;
  timestamp: number;
}

export interface NextAttendancePunchResolution {
  canPunch: boolean;
  nextType: CanonicalPunchType | null;
  baseAction: 'Vào ca' | 'Ra ca';
  confirmButtonLabel: 'Xác nhận Vào ca' | 'Xác nhận Ra ca';
  shiftIndex: 1 | 2;
  slotIndex: 0 | 1 | 2 | 3 | 4;
  blockedReason?: PunchBlockedReason;
  blockedMessage?: string;
  remainingSeconds: number;
  remainingFormatted: string;
  lastPunchType?: string;
  lastPunchTimeStr?: string;
  lastPunchTimestampMs?: number;
  isOvernightBefore06: boolean;
  workdayDateKey: string; // YYYY-MM-DD in GMT+7 of the shift cycle owner day
  cycleStartMs: number;
  cyclePunchesCount: number;
}

export interface SupplementDateResolution {
  canSupplement: boolean;
  baseAction: 'Vào ca' | 'Ra ca';
  canonicalType: CanonicalPunchType;
  shiftIndex: 1 | 2;
  dateStr: string;
  effectiveDateStr: string;
  isNextCalendarDayOvernight: boolean;
  cyclePunches: Array<{ type: string; timeStr: string; hhmm: string; isPending: boolean }>;
  reasonHint: string;
}

export const EMPLOYEE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes strictly per employee
export const USER_COOLDOWN_STORAGE_KEY = 'kg_user_cooldown_v2';
export const LOCAL_MISSED_CLAIMS_KEY = 'kg_local_missed_claims';
const VN_OFFSET_MS = 7 * 3600 * 1000;

const CHECK_IN_REGEX = /^\s*(vào(\s+ca)?(\s*[1-9])?|in)\b/i;
const CHECK_OUT_REGEX = /^\s*(ra(\s+ca)?(\s*[1-9])?|out)\b/i;
const SHIFT_2_IN_REGEX = /^\s*(vào(\s+ca)?\s*2|in\s*2)\b/i;
const SHIFT_2_OUT_REGEX = /^\s*(ra(\s+ca)?\s*2|out\s*2)\b/i;
const PENDING_SUPPLEMENT_IN_REGEX = /^\s*chờ\s*duyệt\s*:\s*(vào(\s+ca)?(\s*[1-9])?|in)\b/i;
const PENDING_SUPPLEMENT_OUT_REGEX = /^\s*chờ\s*duyệt\s*:\s*(ra(\s+ca)?(\s*[1-9])?|out)\b/i;
const PENDING_SUPPLEMENT_SHIFT_2_IN_REGEX = /^\s*chờ\s*duyệt\s*:\s*(vào(\s+ca)?\s*2|in\s*2)\b/i;
const PENDING_SUPPLEMENT_SHIFT_2_OUT_REGEX = /^\s*chờ\s*duyệt\s*:\s*(ra(\s+ca)?\s*2|out\s*2)\b/i;
const REJECTED_SUPPLEMENT_REGEX = /^\s*từ\s*chối\s*:/i;

/**
 * Classifies whether a punch status string represents an APPROVED Check-In ('Vào 1', 'Vào 2', 'Vào ca', 'Vào ca 2', 'IN', etc.).
 * Explicitly ignores non-attendance rows and unapproved/rejected supplements ('Chờ duyệt: ...', 'Từ chối: ...')
 * so payroll never counts unapproved claims.
 */
export function isCheckInLabel(type: unknown): boolean {
  if (typeof type !== 'string') return false;
  const clean = type.normalize('NFC').trim().toLowerCase();
  if (!clean) return false;
  return CHECK_IN_REGEX.test(clean);
}

/**
 * Classifies whether a punch status string represents an APPROVED Check-Out ('Ra 1', 'Ra 2', 'Ra ca', 'Ra ca 2', 'OUT', etc.).
 */
export function isCheckOutLabel(type: unknown): boolean {
  if (typeof type !== 'string') return false;
  const clean = type.normalize('NFC').trim().toLowerCase();
  if (!clean) return false;
  return CHECK_OUT_REGEX.test(clean);
}

/**
 * Classifies a pending supplement Check-In row ('Chờ duyệt: Vào 1', 'Chờ duyệt: Vào ca', etc.).
 * Used ONLY by smart punch progression & history display — NEVER by payroll hour calculators.
 */
export function isPendingCheckInSupplementLabel(type: unknown): boolean {
  if (typeof type !== 'string') return false;
  const clean = type.normalize('NFC').trim().toLowerCase();
  if (!clean) return false;
  return PENDING_SUPPLEMENT_IN_REGEX.test(clean);
}

/**
 * Classifies a pending supplement Check-Out row ('Chờ duyệt: Ra 1', 'Chờ duyệt: Ra ca', etc.).
 * Used ONLY by smart punch progression & history display — NEVER by payroll hour calculators.
 */
export function isPendingCheckOutSupplementLabel(type: unknown): boolean {
  if (typeof type !== 'string') return false;
  const clean = type.normalize('NFC').trim().toLowerCase();
  if (!clean) return false;
  return PENDING_SUPPLEMENT_OUT_REGEX.test(clean);
}

export function isPendingSupplementLabel(type: unknown): boolean {
  return isPendingCheckInSupplementLabel(type) || isPendingCheckOutSupplementLabel(type);
}

export function isRejectedSupplementLabel(type: unknown): boolean {
  if (typeof type !== 'string') return false;
  return REJECTED_SUPPLEMENT_REGEX.test(type.normalize('NFC').trim().toLowerCase());
}

/**
 * Normalizes any punch label (including historical numbered labels 'Vào 1', 'Ra 1', 'Vào 2', 'Ra 2',
 * 'Vào ca 2', 'Ra ca 2', and prefixed 'Chờ duyệt: ...' / 'Từ chối: ...') into unified 'Vào ca' / 'Ra ca'
 * while preserving suffixes such as '(Trễ 10p)' or '(Lệch ca >2h - Chờ đối soát)'.
 */
export function formatUnifiedPunchLabel(type: unknown): string {
  if (typeof type !== 'string') return '';
  const clean = type.normalize('NFC').trim();
  if (!clean) return '';

  const prefixMatch = clean.match(/^((?:chờ\s*duyệt|từ\s*chối)\s*:\s*)(.+)$/i);
  if (prefixMatch) {
    const normPrefix = /^chờ/i.test(prefixMatch[1]) ? 'Chờ duyệt: ' : 'Từ chối: ';
    return normPrefix + formatUnifiedPunchLabel(prefixMatch[2]);
  }

  const inMatch = clean.match(
    /^(?:vào(?:\s+ca)?(?:\s*[1-9])?|in(?:\s*[1-9])?)(?=\s*$|\s*\(|\s+-)(.*)$/i
  );
  if (inMatch) {
    return `Vào ca${inMatch[1] || ''}`;
  }

  const outMatch = clean.match(
    /^(?:ra(?:\s+ca)?(?:\s*[1-9])?|out(?:\s*[1-9])?)(?=\s*$|\s*\(|\s+-)(.*)$/i
  );
  if (outMatch) {
    return `Ra ca${outMatch[1] || ''}`;
  }

  return clean;
}

/**
 * Checks whether a punch label is specifically a primary check-in (excluding legacy explicit Shift 2 labels).
 */
export function isPrimaryFirstCheckInLabel(type: unknown): boolean {
  if (!isCheckInLabel(type)) return false;
  const clean = String(type).normalize('NFC').trim().toLowerCase();
  if (SHIFT_2_IN_REGEX.test(clean)) return false;
  if (/^\s*(vào(\s+ca)?\s*[2-9]|in\s*[2-9])\b/i.test(clean)) return false;
  return true;
}

function normalizeIdentityKey(val?: string | null): string {
  if (!val) return '';
  return String(val)
    .normalize('NFC')
    .replace(/^┗\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function foldAsciiIdentity(val?: string | null): string {
  if (!val) return '';
  return String(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function getCanonicalUserCooldownKey(user: AttendanceUserLike | null | undefined): string {
  if (!user) return '';
  const u = normalizeIdentityKey(user.username);
  if (u) return `u:${u}`;
  const f = foldAsciiIdentity(user.fullname);
  return f ? `f:${f}` : '';
}

export function matchesAttendanceUser(
  log: AttendanceLogEntryLike | null | undefined,
  user: AttendanceUserLike | null | undefined
): boolean {
  if (!log || !user) return false;
  const uName = normalizeIdentityKey(user.username);
  const uFull = normalizeIdentityKey(user.fullname);
  const lName = normalizeIdentityKey(log.username);
  const lFull = normalizeIdentityKey(log.fullname);

  // Strict username isolation: when both sides carry usernames, never fall back to fullname or diacritic folding!
  if (uName && lName) {
    return uName === lName;
  }

  if (uFull && lFull && uFull === lFull) return true;
  if (uName && lFull && uName === lFull) return true;
  if (uFull && lName && uFull === lName) return true;

  // Legacy username-less fallback: only fold diacritics when one side is unaccented ASCII (never merge "Hùng" with "Hưng")
  if (uFull && lFull) {
    const foldU = foldAsciiIdentity(uFull);
    const foldL = foldAsciiIdentity(lFull);
    if ((uFull === foldU || lFull === foldL) && foldU && foldL && foldU === foldL) {
      return true;
    }
  }

  return false;
}

/**
 * Parses Vietnam attendance log timestamps deterministically into UTC epoch milliseconds,
 * treating 'dd/MM/yyyy HH:mm:ss' as Asia/Ho_Chi_Minh (UTC+7) regardless of host OS timezone.
 */
export function parseVietnamLogTimestampMs(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  const cleanStr = String(raw).trim().replace(/^['"\s]+|['"\s]+$/g, '');
  if (!cleanStr) return null;

  const dmyMatch = cleanStr.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    return Date.UTC(year, month, day, hours, minutes, seconds) - VN_OFFSET_MS;
  }

  const isoNoTzMatch = cleanStr.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (isoNoTzMatch) {
    const year = parseInt(isoNoTzMatch[1], 10);
    const month = parseInt(isoNoTzMatch[2], 10) - 1;
    const day = parseInt(isoNoTzMatch[3], 10);
    const hours = parseInt(isoNoTzMatch[4], 10);
    const minutes = parseInt(isoNoTzMatch[5], 10);
    const seconds = isoNoTzMatch[6] ? parseInt(isoNoTzMatch[6], 10) : 0;
    return Date.UTC(year, month, day, hours, minutes, seconds) - VN_OFFSET_MS;
  }

  const parsed = Date.parse(cleanStr);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatVietnamHHMM(timestampMs: number): string {
  const vn = new Date(timestampMs + VN_OFFSET_MS);
  const hh = String(vn.getUTCHours()).padStart(2, '0');
  const mm = String(vn.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatRemainingMMSS(remainingSeconds: number): string {
  const safe = Math.max(0, Math.ceil(remainingSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Computes the active restaurant workday cycle [06:00 GMT+7 -> 05:59:59 GMT+7 next day].
 * Any timestamp before 06:00 AM belongs to the previous calendar day's shift cycle.
 */
export function getWorkdayCycleBounds(now: Date = new Date()): {
  isOvernightBefore06: boolean;
  workdayDateKey: string;
  cycleStartMs: number;
} {
  const vnShifted = new Date(now.getTime() + VN_OFFSET_MS);
  const vnYear = vnShifted.getUTCFullYear();
  const vnMonth = vnShifted.getUTCMonth();
  const vnDay = vnShifted.getUTCDate();
  const vnHour = vnShifted.getUTCHours();

  const isOvernightBefore06 = vnHour < 6;
  const targetDayOffset = isOvernightBefore06 ? -1 : 0;

  const cycleStartUtcShifted = Date.UTC(vnYear, vnMonth, vnDay + targetDayOffset, 6, 0, 0, 0);
  const cycleStartMs = cycleStartUtcShifted - VN_OFFSET_MS;

  const ownerDate = new Date(Date.UTC(vnYear, vnMonth, vnDay + targetDayOffset, 12, 0, 0, 0));
  const y = ownerDate.getUTCFullYear();
  const m = String(ownerDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ownerDate.getUTCDate()).padStart(2, '0');

  return {
    isOvernightBefore06,
    workdayDateKey: `${y}-${m}-${d}`,
    cycleStartMs,
  };
}

function readCooldownMap(): Record<string, PerUserCooldownRecord> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(USER_COOLDOWN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, PerUserCooldownRecord>;
  } catch {
    return {};
  }
}

function writeCooldownMap(map: Record<string, PerUserCooldownRecord>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    // Prune entries older than 24h to keep localStorage tiny on multi-staff kiosks
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const cleaned: Record<string, PerUserCooldownRecord> = {};
    for (const [k, v] of Object.entries(map)) {
      if (v && typeof v.timestamp === 'number' && v.timestamp >= cutoff) {
        cleaned[k] = v;
      }
    }
    localStorage.setItem(USER_COOLDOWN_STORAGE_KEY, JSON.stringify(cleaned));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Records a successful check-in/out cooldown strictly scoped to one employee (`username`),
 * ensuring shared/kiosk phones never lock out the next employee in line.
 */
export function recordEmployeePunchCooldown(
  user: AttendanceUserLike | null | undefined,
  type: string,
  timeStr: string,
  timestampMs: number = Date.now()
): void {
  const key = getCanonicalUserCooldownKey(user);
  if (!key || !user) return;
  if (!isCheckInLabel(type) && !isCheckOutLabel(type)) return;

  const map = readCooldownMap();
  map[key] = {
    usernameKey: key,
    fullname: user.fullname,
    type,
    time: timeStr,
    timestamp: timestampMs,
  };
  writeCooldownMap(map);
}

export function getEmployeeLocalCooldownRecord(
  user: AttendanceUserLike | null | undefined
): PerUserCooldownRecord | null {
  const key = getCanonicalUserCooldownKey(user);
  if (!key) return null;
  const map = readCooldownMap();
  const entry = map[key];
  if (!entry || typeof entry.timestamp !== 'number') return null;
  return entry;
}

/**
 * Removes a local per-employee cooldown entry (e.g., when a punch is rejected by the server)
 * so the employee is never falsely locked out for 15 minutes.
 */
export function clearEmployeePunchCooldown(
  user: AttendanceUserLike | null | undefined,
  matchTimeStr?: string
): void {
  const key = getCanonicalUserCooldownKey(user);
  if (!key) return;
  const map = readCooldownMap();
  const existing = map[key];
  if (!existing) return;
  if (matchTimeStr) {
    const cleanMatch = String(matchTimeStr).trim();
    const cleanExisting = String(existing.time || '').trim();
    if (
      cleanMatch &&
      cleanExisting &&
      cleanExisting !== cleanMatch &&
      !cleanExisting.includes(cleanMatch) &&
      !cleanMatch.includes(cleanExisting)
    ) {
      return;
    }
  }
  delete map[key];
  writeCooldownMap(map);
}

/**
 * Persists a newly submitted missed-checkin supplement locally (`kg_local_missed_claims`)
 * so Smart Attendance Intent & sequence progression immediately advance in 0ms.
 */
export function recordLocalMissedClaim(claim: {
  id?: string;
  username?: string;
  fullname: string;
  date: string;
  effectiveDate?: string;
  time: string;
  effectiveTime?: string;
  type: CanonicalPunchType;
  canonicalType?: CanonicalPunchType;
  shift?: string;
  reason?: string;
  status?: 'Pending' | 'Approved' | 'Rejected';
}): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(LOCAL_MISSED_CLAIMS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const safeList = Array.isArray(list) ? list : [];
    const effectiveDate = claim.effectiveDate || claim.date;
    const cleanTime = claim.time.length === 5 ? claim.time : claim.time.slice(0, 5);
    const effectiveTime = claim.effectiveTime || `${effectiveDate} ${cleanTime}:00`;
    const newEntry = {
      id: claim.id || `MC_LOCAL_${Date.now()}`,
      username: claim.username || '',
      fullname: claim.fullname,
      date: claim.date,
      effectiveDate,
      time: cleanTime,
      effectiveTime,
      type: claim.type,
      canonicalType: claim.canonicalType || claim.type,
      shift: claim.shift || '',
      reason: claim.reason || 'Bổ sung chấm công',
      status: claim.status || 'Pending',
      createdAt: Date.now(),
    };
    const deduped = safeList.filter(
      (item: any) =>
        !(
          item &&
          matchesAttendanceUser(item, { username: claim.username, fullname: claim.fullname }) &&
          String(item.date || '') === claim.date &&
          String(item.canonicalType || item.type || '') === claim.type
        )
    );
    localStorage.setItem(LOCAL_MISSED_CLAIMS_KEY, JSON.stringify([newEntry, ...deduped].slice(0, 50)));
  } catch {
    // Ignore storage quota errors
  }
}

function readLocalMissedClaimsForUser(
  user: AttendanceUserLike | null | undefined
): Array<{ type: string; timeStr: string; ts: number }> {
  if (!user) return [];
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LOCAL_MISSED_CLAIMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Array<{ type: string; timeStr: string; ts: number }> = [];
    for (const item of parsed) {
      if (!item || item.status === 'Rejected') continue;
      if (!matchesAttendanceUser(item, user)) continue;
      const effectiveDate = String(item.effectiveDate || item.date || '').trim();
      const claimTime = String(item.time || '').trim();
      const fullTimeStr =
        String(item.effectiveTime || '').trim() ||
        (effectiveDate && claimTime ? `${effectiveDate} ${claimTime}:00` : '');
      const ts = parseVietnamLogTimestampMs(fullTimeStr);
      if (ts === null) continue;
      const rawType = String(item.canonicalType || item.type || '').trim();
      const labeledType =
        item.status === 'Approved'
          ? rawType
          : rawType.toLowerCase().startsWith('chờ duyệt')
            ? rawType
            : `Chờ duyệt: ${rawType}`;
      if (
        isCheckInLabel(labeledType) ||
        isCheckOutLabel(labeledType) ||
        isPendingSupplementLabel(labeledType)
      ) {
        out.push({ type: labeledType, timeStr: fullTimeStr, ts });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function isAnySequenceCheckIn(type: string): boolean {
  return isCheckInLabel(type) || isPendingCheckInSupplementLabel(type);
}

function isAnySequenceCheckOut(type: string): boolean {
  return isCheckOutLabel(type) || isPendingCheckOutSupplementLabel(type);
}

function isAnyShift2In(type: string): boolean {
  const clean = type.normalize('NFC').trim();
  return SHIFT_2_IN_REGEX.test(clean) || PENDING_SUPPLEMENT_SHIFT_2_IN_REGEX.test(clean);
}

function isAnyShift2Out(type: string): boolean {
  const clean = type.normalize('NFC').trim();
  return SHIFT_2_OUT_REGEX.test(clean) || PENDING_SUPPLEMENT_SHIFT_2_OUT_REGEX.test(clean);
}

/**
 * Resolves the next sequential punch ('Vào 1' | 'Ra 1' | 'Vào 2' | 'Ra 2') across the unified
 * [06:00 -> 05:59 next morning GMT+7] workday cycle:
 * 1. Per-employee 15-minute cooldown on LIVE punches (pending supplements never trigger spam cooldown)
 * 2. Strict alternating pairs:
 *    - slot 0 (no Vào yet in 06:00-05:59 cycle) -> Vào 1 (Xác nhận Vào ca)
 *    - slot 1 (open Vào 1) -> Ra 1 (Xác nhận Ra ca)
 *    - slot 2 (closed Vào 1 - Ra 1 pair) -> Vào 2 (Xác nhận Vào ca)
 *    - slot 3 (closed pair 1 + open Vào 2, including <06:00 AM) -> Ra 2 (Xác nhận Ra ca)
 *    - slot 4 (2 closed pairs) -> MAX_4_PUNCHES
 * 3. Pending supplements ("Chờ duyệt: Vào 1" etc.) immediately advance cycle slot so staff who submit
 *    a forgotten earlier punch can immediately record their live Check-out!
 */
export function resolveNextAttendancePunch(params: {
  user: AttendanceUserLike | null | undefined;
  logs?: AttendanceLogEntryLike[];
  now?: Date;
  cooldownMs?: number;
  manualOverrideOut?: boolean;
}): NextAttendancePunchResolution {
  const now = params.now || new Date();
  const nowMs = now.getTime();
  const cooldownMs = params.cooldownMs ?? EMPLOYEE_COOLDOWN_MS;
  const { isOvernightBefore06, workdayDateKey, cycleStartMs } = getWorkdayCycleBounds(now);

  if (!params.user) {
    return {
      canPunch: true,
      nextType: 'Vào ca',
      baseAction: 'Vào ca',
      confirmButtonLabel: 'Xác nhận Vào ca',
      shiftIndex: 1,
      slotIndex: 0,
      remainingSeconds: 0,
      remainingFormatted: '00:00',
      isOvernightBefore06,
      workdayDateKey,
      cycleStartMs,
      cyclePunchesCount: 0,
    };
  }

  // Separate live approved punches (used for 15m spam cooldown) from pending supplement claims (used only for slot progression)
  const livePunches: Array<{ type: string; timeStr: string; ts: number }> = [];
  const slotPunches: Array<{ type: string; timeStr: string; ts: number }> = [];

  for (const rawLog of params.logs || []) {
    if (!matchesAttendanceUser(rawLog, params.user)) continue;
    const rawType = String(rawLog.type || '');
    const isLive = isCheckInLabel(rawType) || isCheckOutLabel(rawType);
    const isPendingSupp = isPendingSupplementLabel(rawType);
    if (!isLive && !isPendingSupp) continue;

    const ts =
      typeof rawLog.timestamp === 'number' && rawLog.timestamp > 0
        ? rawLog.timestamp
        : parseVietnamLogTimestampMs(rawLog.time);
    if (ts === null || ts > nowMs + 5 * 60 * 1000) continue;

    const entry = {
      type: rawType,
      timeStr: typeof rawLog.time === 'string' ? rawLog.time : formatVietnamHHMM(ts),
      ts,
    };
    if (isLive) {
      livePunches.push(entry);
    }
    slotPunches.push(entry);
  }

  // Merge local per-user cooldown record if newer than server logs (instant offline/zero-latency awareness)
  const localRec = getEmployeeLocalCooldownRecord(params.user);
  if (localRec && localRec.timestamp <= nowMs + 5 * 60 * 1000) {
    if (isCheckInLabel(localRec.type) || isCheckOutLabel(localRec.type)) {
      const alreadyLive = livePunches.some((p) => Math.abs(p.ts - localRec.timestamp) < 5000);
      if (!alreadyLive) {
        const entry = {
          type: localRec.type,
          timeStr: localRec.time,
          ts: localRec.timestamp,
        };
        livePunches.push(entry);
        slotPunches.push(entry);
      }
    }
  }

  // Merge local pending missed-checkin claims so offline/immediate supplements advance slot in 0ms
  for (const claimEntry of readLocalMissedClaimsForUser(params.user)) {
    if (claimEntry.ts > nowMs + 5 * 60 * 1000) continue;
    const alreadyInSlot = slotPunches.some((p) => Math.abs(p.ts - claimEntry.ts) < 60_000);
    if (!alreadyInSlot) {
      slotPunches.push(claimEntry);
    }
  }

  livePunches.sort((a, b) => a.ts - b.ts);
  slotPunches.sort((a, b) => a.ts - b.ts);

  const lastLiveOverall = livePunches.length > 0 ? livePunches[livePunches.length - 1] : null;
  const lastSlotOverall = slotPunches.length > 0 ? slotPunches[slotPunches.length - 1] : null;
  const lastPunchTimestampMs = (lastLiveOverall || lastSlotOverall)?.ts;
  const rawLastPunchType = (lastLiveOverall || lastSlotOverall)?.type;
  const lastPunchType = rawLastPunchType ? formatUnifiedPunchLabel(rawLastPunchType) : undefined;
  const lastPunchTimeStr = lastPunchTimestampMs ? formatVietnamHHMM(lastPunchTimestampMs) : undefined;

  // Compute current cycle punches [cycleStartMs .. nowMs]
  const cyclePunches = slotPunches.filter((p) => p.ts >= cycleStartMs && p.ts <= nowMs + 60 * 1000);

  // Track slot progression across [06:00 -> 05:59]: 0=empty, 1=open Vào ca (pair 1), 2=closed Ra ca (pair 1), 3=open Vào ca (pair 2), 4=closed Ra ca (pair 2)
  let slot: 0 | 1 | 2 | 3 | 4 = 0;
  let outCountInCycle = 0;

  for (const p of cyclePunches) {
    if (isAnySequenceCheckOut(p.type)) {
      outCountInCycle++;
      if (isAnyShift2Out(p.type) || slot >= 2) {
        slot = 4;
      } else {
        slot = 2;
      }
    } else if (isAnySequenceCheckIn(p.type)) {
      if (isAnyShift2In(p.type) || slot === 2) {
        slot = 3;
      } else if (slot === 0) {
        slot = 1;
      }
    }
  }
  if (cyclePunches.length >= 4) {
    slot = 4;
  }

  // Step 1: Check 15-minute per-employee cooldown strictly against LIVE punches
  if (lastLiveOverall && cooldownMs > 0) {
    const diffMs = nowMs - lastLiveOverall.ts;
    if (diffMs >= 0 && diffMs < cooldownMs) {
      const remainingSeconds = Math.max(1, Math.ceil((cooldownMs - diffMs) / 1000));
      const nextBaseAfterCooldown: 'Vào ca' | 'Ra ca' = isCheckInLabel(lastLiveOverall.type)
        ? 'Ra ca'
        : 'Vào ca';
      const cleanLiveLabel = formatUnifiedPunchLabel(lastLiveOverall.type);
      return {
        canPunch: false,
        nextType: null,
        baseAction: nextBaseAfterCooldown,
        confirmButtonLabel:
          nextBaseAfterCooldown === 'Ra ca' ? 'Xác nhận Ra ca' : 'Xác nhận Vào ca',
        shiftIndex: slot >= 2 ? 2 : 1,
        slotIndex: slot,
        blockedReason: 'COOLDOWN_15M',
        blockedMessage: `Đã ghi nhận "${cleanLiveLabel}" lúc ${formatVietnamHHMM(lastLiveOverall.ts)}. Vui lòng đợi đủ 15 phút (${formatRemainingMMSS(remainingSeconds)}).`,
        remainingSeconds,
        remainingFormatted: formatRemainingMMSS(remainingSeconds),
        lastPunchType: cleanLiveLabel,
        lastPunchTimeStr: formatVietnamHHMM(lastLiveOverall.ts),
        lastPunchTimestampMs: lastLiveOverall.ts,
        isOvernightBefore06,
        workdayDateKey,
        cycleStartMs,
        cyclePunchesCount: cyclePunches.length,
      };
    }
  }

  // Step 2: Optional explicit manual override ("Ra ca")
  if (params.manualOverrideOut) {
    if (outCountInCycle >= 2 || slot >= 4) {
      return {
        canPunch: false,
        nextType: null,
        baseAction: 'Ra ca',
        confirmButtonLabel: 'Xác nhận Ra ca',
        shiftIndex: 2,
        slotIndex: 4,
        blockedReason: 'MAX_4_PUNCHES',
        blockedMessage: 'Đã hoàn thành đủ 4 lượt Vào ca – Ra ca trong ngày công hiện tại.',
        remainingSeconds: 0,
        remainingFormatted: '00:00',
        lastPunchType,
        lastPunchTimeStr,
        lastPunchTimestampMs,
        isOvernightBefore06,
        workdayDateKey,
        cycleStartMs,
        cyclePunchesCount: cyclePunches.length,
      };
    }
    const manualShiftIndex: 1 | 2 = outCountInCycle === 0 && slot < 2 ? 1 : 2;
    return {
      canPunch: true,
      nextType: 'Ra ca',
      baseAction: 'Ra ca',
      confirmButtonLabel: 'Xác nhận Ra ca',
      shiftIndex: manualShiftIndex,
      slotIndex: slot,
      remainingSeconds: 0,
      remainingFormatted: '00:00',
      lastPunchType,
      lastPunchTimeStr,
      lastPunchTimestampMs,
      isOvernightBefore06,
      workdayDateKey,
      cycleStartMs,
      cyclePunchesCount: cyclePunches.length,
    };
  }

  // Step 3: Unified 06:00 -> 05:59 alternating state machine (daytime + overnight < 06:00)
  if (slot >= 4 || outCountInCycle >= 2) {
    return {
      canPunch: false,
      nextType: null,
      baseAction: 'Ra ca',
      confirmButtonLabel: 'Xác nhận Ra ca',
      shiftIndex: 2,
      slotIndex: 4,
      blockedReason: 'MAX_4_PUNCHES',
      blockedMessage: isOvernightBefore06
        ? 'Đã đủ 4 lượt chấm công (2 cặp Vào ca – Ra ca) của chu kỳ ca đêm trước 06:00 sáng.'
        : 'Đã đủ 4 lượt chấm công (2 cặp Vào ca – Ra ca) trong ngày.',
      remainingSeconds: 0,
      remainingFormatted: '00:00',
      lastPunchType,
      lastPunchTimeStr,
      lastPunchTimestampMs,
      isOvernightBefore06,
      workdayDateKey,
      cycleStartMs,
      cyclePunchesCount: cyclePunches.length,
    };
  }

  const isOut = slot === 1 || slot === 3;
  const nextType: CanonicalPunchType = isOut ? 'Ra ca' : 'Vào ca';

  return {
    canPunch: true,
    nextType,
    baseAction: nextType,
    confirmButtonLabel: isOut ? 'Xác nhận Ra ca' : 'Xác nhận Vào ca',
    shiftIndex: slot < 2 ? 1 : 2,
    slotIndex: slot,
    remainingSeconds: 0,
    remainingFormatted: '00:00',
    lastPunchType,
    lastPunchTimeStr,
    lastPunchTimestampMs,
    isOvernightBefore06,
    workdayDateKey,
    cycleStartMs,
    cyclePunchesCount: cyclePunches.length,
  };
}

function parseDmyOrIsoDateParts(dateStr: string): { year: number; monthIdx: number; day: number } | null {
  const clean = String(dateStr || '').trim();
  const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    return {
      day: parseInt(dmy[1], 10),
      monthIdx: parseInt(dmy[2], 10) - 1,
      year: parseInt(dmy[3], 10),
    };
  }
  const iso = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return {
      year: parseInt(iso[1], 10),
      monthIdx: parseInt(iso[2], 10) - 1,
      day: parseInt(iso[3], 10),
    };
  }
  return null;
}

function formatUtcDmy(year: number, monthIdx: number, day: number): string {
  const dt = new Date(Date.UTC(year, monthIdx, day, 12, 0, 0, 0));
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = dt.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Inspects a specific workday (`dd/MM/yyyy` or `yyyy-MM-dd`, cycle `06:00 -> 05:59 next morning`)
 * to determine which exact punch ('Vào ca' / 'Ra ca' -> 'Vào 1' | 'Ra 1' | 'Vào 2' | 'Ra 2') is missing
 * for the streamlined "Bổ sung chấm công" modal, and automatically rolls calendar date +1 day when
 * supplementing an overnight `Ra ca` before `06:00` AM.
 */
export function resolveSupplementActionForDate(params: {
  user: AttendanceUserLike | null | undefined;
  dateStr: string;
  timeStr?: string;
  logs?: AttendanceLogEntryLike[];
}): SupplementDateResolution {
  const parts = parseDmyOrIsoDateParts(params.dateStr);
  const nowVn = new Date(Date.now() + VN_OFFSET_MS);
  const year = parts ? parts.year : nowVn.getUTCFullYear();
  const monthIdx = parts ? parts.monthIdx : nowVn.getUTCMonth();
  const day = parts ? parts.day : nowVn.getUTCDate();
  const normalizedDateStr = formatUtcDmy(year, monthIdx, day);

  const cycleStartMs = Date.UTC(year, monthIdx, day, 6, 0, 0, 0) - VN_OFFSET_MS;
  const cycleEndMs = Date.UTC(year, monthIdx, day + 1, 5, 59, 59, 999) - VN_OFFSET_MS;

  const gathered: Array<{ type: string; timeStr: string; hhmm: string; ts: number; isPending: boolean }> = [];

  if (params.user) {
    for (const rawLog of params.logs || []) {
      if (!matchesAttendanceUser(rawLog, params.user)) continue;
      const rawType = String(rawLog.type || '');
      const isLive = isCheckInLabel(rawType) || isCheckOutLabel(rawType);
      const isPending = isPendingSupplementLabel(rawType);
      if (!isLive && !isPending) continue;
      const ts =
        typeof rawLog.timestamp === 'number' && rawLog.timestamp > 0
          ? rawLog.timestamp
          : parseVietnamLogTimestampMs(rawLog.time);
      if (ts === null || ts < cycleStartMs || ts > cycleEndMs) continue;
      gathered.push({
        type: rawType,
        timeStr: typeof rawLog.time === 'string' ? rawLog.time : formatVietnamHHMM(ts),
        hhmm: formatVietnamHHMM(ts),
        ts,
        isPending,
      });
    }

    for (const claim of readLocalMissedClaimsForUser(params.user)) {
      if (claim.ts < cycleStartMs || claim.ts > cycleEndMs) continue;
      const dup = gathered.some((g) => Math.abs(g.ts - claim.ts) < 60_000);
      if (!dup) {
        gathered.push({
          type: claim.type,
          timeStr: claim.timeStr,
          hhmm: formatVietnamHHMM(claim.ts),
          ts: claim.ts,
          isPending: isPendingSupplementLabel(claim.type),
        });
      }
    }
  }

  gathered.sort((a, b) => a.ts - b.ts);

  let inCount = 0;
  let outCount = 0;
  let unmatchedIn = 0;
  let unmatchedOut = 0;
  let completedPairs = 0;

  for (const item of gathered) {
    if (isAnySequenceCheckIn(item.type)) {
      inCount++;
      unmatchedIn++;
    } else if (isAnySequenceCheckOut(item.type)) {
      outCount++;
      if (unmatchedIn > 0) {
        unmatchedIn--;
        completedPairs++;
      } else {
        unmatchedOut++;
      }
    }
  }

  let canSupplement = true;
  let baseAction: 'Vào ca' | 'Ra ca' = 'Vào ca';
  let canonicalType: CanonicalPunchType = 'Vào ca';
  let shiftIndex: 1 | 2 = 1;
  let reasonHint = 'Ngày này chưa có lượt Vào ca → Hệ thống đề xuất bổ sung Vào ca.';

  if (completedPairs >= 2 || (inCount >= 2 && outCount >= 2)) {
    canSupplement = false;
    baseAction = 'Ra ca';
    canonicalType = 'Ra ca';
    shiftIndex = 2;
    reasonHint = 'Ngày công này đã đủ 4 lượt chấm công (2 cặp Vào ca – Ra ca).';
  } else if (unmatchedOut > 0) {
    baseAction = 'Vào ca';
    canonicalType = 'Vào ca';
    shiftIndex = completedPairs === 0 && inCount === 0 ? 1 : 2;
    reasonHint = 'Phát hiện có lượt Ra ca nhưng thiếu Vào ca trước đó → Bổ sung Vào ca.';
  } else if (unmatchedIn > 0) {
    baseAction = 'Ra ca';
    canonicalType = 'Ra ca';
    shiftIndex = completedPairs === 0 && outCount === 0 ? 1 : 2;
    const lastIn = [...gathered].reverse().find((g) => isAnySequenceCheckIn(g.type));
    reasonHint = `Đã có Vào ca lúc ${lastIn?.hhmm || '--:--'} → Bổ sung Ra ca còn thiếu.`;
  } else if (completedPairs === 1) {
    baseAction = 'Vào ca';
    canonicalType = 'Vào ca';
    shiftIndex = 2;
    reasonHint = 'Đã khép kín cặp Vào ca – Ra ca trước đó → Bổ sung Vào ca cho ca tiếp theo.';
  }

  // Check if selected HH:mm is an overnight < 06:00 Check-out belonging to workday D -> calendar day D + 1
  let isNextCalendarDayOvernight = false;
  let effectiveDateStr = normalizedDateStr;
  const timeMatch = String(params.timeStr || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch && baseAction === 'Ra ca') {
    const hh = parseInt(timeMatch[1], 10);
    if (hh >= 0 && hh < 6) {
      isNextCalendarDayOvernight = true;
      effectiveDateStr = formatUtcDmy(year, monthIdx, day + 1);
    }
  }

  return {
    canSupplement,
    baseAction,
    canonicalType,
    shiftIndex,
    dateStr: normalizedDateStr,
    effectiveDateStr,
    isNextCalendarDayOvernight,
    cyclePunches: gathered.map(({ type, timeStr, hhmm, isPending }) => ({
      type: formatUnifiedPunchLabel(type),
      timeStr,
      hhmm,
      isPending,
    })),
    reasonHint,
  };
}

export type SmartIntentAmbiguityReason =
  | 'NONE'
  | 'LATE_SHIFT_MISSING_IN'
  | 'STALE_OPEN_SHIFT'
  | 'OVERNIGHT_UNCLOSED_PAST_06';

export interface SmartAttendanceIntentResolution {
  sequence: NextAttendancePunchResolution;
  confidence: 'HIGH' | 'AMBIGUOUS';
  requiresDisambiguation: boolean;
  ambiguityReason: SmartIntentAmbiguityReason;
  smartSuggestedAction: CanonicalPunchType;
  parsedShiftStartHHMM?: string;
  suggestedSupplementTime?: string;
  suggestedSupplementDate?: string;
  unclosedYesterdayDateStr?: string;
  openShiftStartTime?: string;
  openShiftDurationMinutes?: number;
  openShiftDurationFormatted?: string;
  guidanceTitle: string;
  guidanceDetail: string;
}

export function formatWorkDurationVi(totalMinutes: number): string {
  const safe = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours > 0 && mins > 0) return `${hours} giờ ${mins} phút`;
  if (hours > 0) return `${hours} giờ`;
  return `${mins} phút`;
}

function parseScheduledShiftStart(rawShift?: string | null): { hhmm: string; minutes: number } | null {
  if (!rawShift) return null;
  const clean = String(rawShift).trim().toUpperCase();
  if (
    !clean ||
    clean.startsWith('OFF') ||
    clean === 'RẢNH' ||
    clean === 'RANH' ||
    clean === 'NGHỈ' ||
    clean === 'NGHI'
  ) {
    return null;
  }
  const m = clean.match(/(\d{1,2})\s*[:H]\s*(\d{0,2})/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return {
    hhmm: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    minutes: hh * 60 + mm,
  };
}

function collectUnifiedUserSlotPunches(
  user: AttendanceUserLike | null | undefined,
  logs: AttendanceLogEntryLike[] | undefined,
  nowMs: number
): Array<{ type: string; timeStr: string; ts: number }> {
  if (!user) return [];
  const slotPunches: Array<{ type: string; timeStr: string; ts: number }> = [];
  const liveTimestamps: number[] = [];

  for (const rawLog of logs || []) {
    if (!matchesAttendanceUser(rawLog, user)) continue;
    const rawType = String(rawLog.type || '');
    const isLive = isCheckInLabel(rawType) || isCheckOutLabel(rawType);
    const isPendingSupp = isPendingSupplementLabel(rawType);
    if (!isLive && !isPendingSupp) continue;

    const ts =
      typeof rawLog.timestamp === 'number' && rawLog.timestamp > 0
        ? rawLog.timestamp
        : parseVietnamLogTimestampMs(rawLog.time);
    if (ts === null || ts > nowMs + 5 * 60 * 1000) continue;

    if (isLive) liveTimestamps.push(ts);
    slotPunches.push({
      type: rawType,
      timeStr: typeof rawLog.time === 'string' ? rawLog.time : formatVietnamHHMM(ts),
      ts,
    });
  }

  const localRec = getEmployeeLocalCooldownRecord(user);
  if (localRec && localRec.timestamp <= nowMs + 5 * 60 * 1000) {
    if (isCheckInLabel(localRec.type) || isCheckOutLabel(localRec.type)) {
      const alreadyLive = liveTimestamps.some((t) => Math.abs(t - localRec.timestamp) < 5000);
      if (!alreadyLive) {
        slotPunches.push({
          type: localRec.type,
          timeStr: localRec.time,
          ts: localRec.timestamp,
        });
      }
    }
  }

  for (const claimEntry of readLocalMissedClaimsForUser(user)) {
    if (claimEntry.ts > nowMs + 5 * 60 * 1000) continue;
    const alreadyInSlot = slotPunches.some((p) => Math.abs(p.ts - claimEntry.ts) < 60_000);
    if (!alreadyInSlot) {
      slotPunches.push(claimEntry);
    }
  }

  slotPunches.sort((a, b) => a.ts - b.ts);
  return slotPunches;
}

/**
 * 4-Signal Context-Aware Smart Attendance Engine (Shared across V1 Photo & V2 Face Kiosk):
 * Combines:
 *   1. Unified [06:00 -> 05:59 GMT+7] punch history & pending supplements
 *   2. Employee's registered/approved shift for today (`todayShift`)
 *   3. Current Vietnam clock (`now`)
 *   4. Elapsed open-shift duration & yesterday's overnight boundary state
 * Never silently guesses when high-risk human mistakes occur (forgotten Vào ca at end of shift,
 * stale >9.5h open shift, or unclosed yesterday overnight shift right after 06:00 AM).
 */
export function resolveSmartAttendanceIntent(params: {
  user: AttendanceUserLike | null | undefined;
  logs?: AttendanceLogEntryLike[];
  todayShift?: string | null;
  now?: Date;
  cooldownMs?: number;
}): SmartAttendanceIntentResolution {
  const now = params.now || new Date();
  const nowMs = now.getTime();
  const sequence = resolveNextAttendancePunch({
    user: params.user,
    logs: params.logs,
    now,
    cooldownMs: params.cooldownMs,
  });
  const rawSeq =
    params.cooldownMs === 0
      ? sequence
      : resolveNextAttendancePunch({
          user: params.user,
          logs: params.logs,
          now,
          cooldownMs: 0,
        });

  const parsedShift = parseScheduledShiftStart(params.todayShift);
  const wdParts = parseDmyOrIsoDateParts(sequence.workdayDateKey);
  const workdayDmy = wdParts ? formatUtcDmy(wdParts.year, wdParts.monthIdx, wdParts.day) : '';
  const prevWorkdayDmy = wdParts
    ? formatUtcDmy(wdParts.year, wdParts.monthIdx, wdParts.day - 1)
    : '';

  if (!params.user) {
    return {
      sequence,
      confidence: 'HIGH',
      requiresDisambiguation: false,
      ambiguityReason: 'NONE',
      smartSuggestedAction: 'Vào ca',
      parsedShiftStartHHMM: parsedShift?.hhmm,
      guidanceTitle: 'Sẵn sàng Vào ca',
      guidanceDetail: 'Hệ thống tự động nhận diện lượt Vào ca.',
    };
  }

  const allSlotPunches = collectUnifiedUserSlotPunches(params.user, params.logs, nowMs);
  const cycleEndMs = sequence.cycleStartMs + 24 * 3600 * 1000;
  const currentCyclePunches = allSlotPunches.filter(
    (p) => p.ts >= sequence.cycleStartMs && p.ts < cycleEndMs
  );

  let activeOpenIn: { type: string; timeStr: string; ts: number } | null = null;
  for (const p of currentCyclePunches) {
    if (isAnySequenceCheckIn(p.type)) {
      activeOpenIn = p;
    } else if (isAnySequenceCheckOut(p.type)) {
      activeOpenIn = null;
    }
  }

  // Case A: Employee currently has an open Vào ca in today's [06:00 -> 05:59] cycle
  if ((rawSeq.slotIndex === 1 || rawSeq.slotIndex === 3) && rawSeq.blockedReason !== 'MAX_4_PUNCHES') {
    const openShiftStartTime = activeOpenIn
      ? formatVietnamHHMM(activeOpenIn.ts)
      : rawSeq.lastPunchTimeStr;
    const openShiftDurationMinutes = activeOpenIn
      ? Math.max(0, Math.floor((nowMs - activeOpenIn.ts) / 60_000))
      : undefined;
    const openShiftDurationFormatted =
      openShiftDurationMinutes !== undefined
        ? formatWorkDurationVi(openShiftDurationMinutes)
        : undefined;

    // Trap 2: Stale open shift >= 9.5 hours (570 mins) -> e.g. forgot noon Ra ca & returning for evening shift
    if (openShiftDurationMinutes !== undefined && openShiftDurationMinutes >= 570) {
      return {
        sequence,
        confidence: 'AMBIGUOUS',
        requiresDisambiguation: true,
        ambiguityReason: 'STALE_OPEN_SHIFT',
        smartSuggestedAction: 'Ra ca',
        parsedShiftStartHHMM: parsedShift?.hhmm,
        suggestedSupplementDate: workdayDmy,
        openShiftStartTime,
        openShiftDurationMinutes,
        openShiftDurationFormatted,
        guidanceTitle: `Ca làm đang mở ${openShiftDurationFormatted} (từ ${openShiftStartTime || '--:--'})`,
        guidanceDetail:
          'Bạn đang kết thúc ca dài để Ra ca, hay quên chấm Ra ca trước đó và hiện đang bắt đầu Vào ca mới?',
      };
    }

    return {
      sequence,
      confidence: 'HIGH',
      requiresDisambiguation: false,
      ambiguityReason: 'NONE',
      smartSuggestedAction: 'Ra ca',
      parsedShiftStartHHMM: parsedShift?.hhmm,
      openShiftStartTime,
      openShiftDurationMinutes,
      openShiftDurationFormatted,
      guidanceTitle: 'Hoàn tất ca làm việc',
      guidanceDetail:
        openShiftStartTime && openShiftDurationFormatted
          ? `Đã làm việc ${openShiftDurationFormatted} (Vào ca lúc ${openShiftStartTime})`
          : 'Hệ thống tự động chọn Ra ca để khép kín ca làm việc.',
    };
  }

  // Case B: Employee has ZERO punches in current [06:00 -> 05:59] cycle -> Check Trap 3 & Trap 1!
  if (rawSeq.slotIndex === 0) {
    const vnShifted = new Date(nowMs + VN_OFFSET_MS);
    const vnHour = vnShifted.getUTCHours();
    const vnMinute = vnShifted.getUTCMinutes();
    const vnMinsOfDay = vnHour * 60 + vnMinute;

    // Trap 3: Unclosed yesterday overnight Vào ca right after 06:00 AM (06:00 - 08:30 AM)
    const isMorningGraceWindow = vnMinsOfDay >= 360 && vnMinsOfDay <= 510;
    const isScheduledMorningShift =
      parsedShift !== null && parsedShift.minutes >= 330 && parsedShift.minutes <= 570;

    if (isMorningGraceWindow && !isScheduledMorningShift) {
      const prevCycleStartMs = sequence.cycleStartMs - 24 * 3600 * 1000;
      const prevCyclePunches = allSlotPunches.filter(
        (p) => p.ts >= prevCycleStartMs && p.ts < sequence.cycleStartMs
      );
      let prevOpenIn: { type: string; timeStr: string; ts: number } | null = null;
      for (const p of prevCyclePunches) {
        if (isAnySequenceCheckIn(p.type)) {
          prevOpenIn = p;
        } else if (isAnySequenceCheckOut(p.type)) {
          prevOpenIn = null;
        }
      }
      if (prevOpenIn) {
        const elapsedMs = nowMs - prevOpenIn.ts;
        if (elapsedMs > 0 && elapsedMs < 14 * 3600 * 1000) {
          const openStart = formatVietnamHHMM(prevOpenIn.ts);
          const durMins = Math.max(0, Math.floor(elapsedMs / 60_000));
          const durFmt = formatWorkDurationVi(durMins);
          return {
            sequence,
            confidence: 'AMBIGUOUS',
            requiresDisambiguation: true,
            ambiguityReason: 'OVERNIGHT_UNCLOSED_PAST_06',
            smartSuggestedAction: 'Ra ca',
            parsedShiftStartHHMM: parsedShift?.hhmm,
            unclosedYesterdayDateStr: prevWorkdayDmy,
            suggestedSupplementDate: prevWorkdayDmy,
            openShiftStartTime: openStart,
            openShiftDurationMinutes: durMins,
            openShiftDurationFormatted: durFmt,
            guidanceTitle: `Ca đêm hôm qua (${prevWorkdayDmy}) lúc ${openStart} chưa đóng`,
            guidanceDetail: `Đã qua 06:00 sáng (${durFmt} từ lúc Vào ca). Bạn đang Ra ca kết thúc ca đêm hôm qua hay Vào ca mới hôm nay?`,
          };
        }
      }
    }

    // Trap 1: Late-shift / Closing-hour punch with ZERO Vào ca today (forgotten Vào ca!)
    const elapsedSinceShiftStart =
      parsedShift !== null
        ? (sequence.isOvernightBefore06 ? 24 * 60 + vnMinsOfDay : vnMinsOfDay) - parsedShift.minutes
        : null;
    const isThreeHoursPastShift =
      elapsedSinceShiftStart !== null && elapsedSinceShiftStart >= 180;
    const isLateNightScheduledShift =
      parsedShift !== null &&
      parsedShift.minutes >= 20 * 60 &&
      elapsedSinceShiftStart !== null &&
      elapsedSinceShiftStart < 180;
    const isInClosingWindow = (vnHour >= 21 || vnHour < 4) && !isLateNightScheduledShift;

    if (isThreeHoursPastShift || isInClosingWindow) {
      const suppTime = parsedShift?.hhmm || '15:00';
      return {
        sequence,
        confidence: 'AMBIGUOUS',
        requiresDisambiguation: true,
        ambiguityReason: 'LATE_SHIFT_MISSING_IN',
        smartSuggestedAction: 'Ra ca',
        parsedShiftStartHHMM: parsedShift?.hhmm,
        suggestedSupplementTime: suppTime,
        suggestedSupplementDate: workdayDmy,
        guidanceTitle: 'Chưa có lượt Vào ca hôm nay!',
        guidanceDetail: parsedShift
          ? `Ca đăng ký hôm nay bắt đầu lúc ${parsedShift.hhmm} nhưng hệ thống chưa thấy lượt Vào ca. Bạn đang kết thúc ca để về (Ra ca) hay mới bắt đầu Vào ca trễ?`
          : `Hiện đang là khung giờ cuối ngày nhưng hệ thống chưa ghi nhận lượt Vào ca của bạn hôm nay. Vui lòng chọn đúng thao tác bên dưới:`,
      };
    }
  }

  return {
    sequence,
    confidence: 'HIGH',
    requiresDisambiguation: false,
    ambiguityReason: 'NONE',
    smartSuggestedAction: rawSeq.baseAction,
    parsedShiftStartHHMM: parsedShift?.hhmm,
    guidanceTitle:
      rawSeq.baseAction === 'Ra ca' ? 'Hoàn tất ca làm việc' : 'Sẵn sàng bắt đầu ca làm',
    guidanceDetail:
      rawSeq.slotIndex === 2
        ? 'Đã hoàn tất ca trước đó → Hệ thống tự động chọn Vào ca tiếp theo.'
        : parsedShift
          ? `Ca làm hôm nay: ${parsedShift.hhmm} • Hệ thống tự động chọn Vào ca.`
          : 'Lượt đầu tiên trong ngày công • Hệ thống tự động chọn Vào ca.',
  };
}
