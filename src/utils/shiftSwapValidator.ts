import { isWorkEligible } from './employment';

export interface SmartSwapEmployeeRef {
  username: string;
  fullname: string;
  position?: string;
  employmentStatus?: string;
}

export interface SmartShiftSwapValidationInput {
  dayIndex: number;
  requesterShift: string;
  targetEmployee?: SmartSwapEmployeeRef | null;
  targetWeekShifts?: string[] | null;
  maxShiftsPerWeek?: number;
  maxHoursPerWeek?: number;
}

export interface SmartShiftSwapValidationResult {
  valid: boolean;
  canProceedWithWarning: boolean;
  hasConflict: boolean;
  hasOtWarning: boolean;
  existingTargetShift: string;
  projectedShiftsCount: number;
  projectedHours: number;
  reason?: string;
  warning?: string;
}

const OFF_TOKENS = new Set(['', 'OFF', 'OFF#', 'OFF!', 'NGHỈ', 'NGHI', '-', '—', 'TRỐNG', '(TRỐNG)']);

export function isActiveShiftCode(raw?: string | null): boolean {
  if (!raw) return false;
  const firstLine = String(raw).split('\n')[0].trim().toUpperCase();
  if (!firstLine) return false;
  if (OFF_TOKENS.has(firstLine) || firstLine.startsWith('OFF')) return false;
  return true;
}

export function parseShiftDurationHours(raw?: string | null): number {
  if (!isActiveShiftCode(raw)) return 0;
  const clean = String(raw).split('\n')[0].trim();

  // Explicit range HH:mm - HH:mm or HHh - HHh
  const rangeMatch = clean.match(
    /(\d{1,2})(?::(\d{2})|h)?\s*[-–]\s*(\d{1,2})(?::(\d{2})|h)?/i
  );
  if (rangeMatch) {
    const startH = Number(rangeMatch[1]) + (Number(rangeMatch[2]) || 0) / 60;
    let endH = Number(rangeMatch[3]) + (Number(rangeMatch[4]) || 0) / 60;
    if (endH <= startH) endH += 24;
    const diff = endH - startH;
    if (diff > 0 && diff <= 16) return Math.round(diff * 10) / 10;
  }

  const upper = clean.toUpperCase();
  if (upper.includes('FULL') || upper.includes('CẢ NGÀY')) return 10;
  if (upper.includes('GÃY') || upper.includes('GAY')) return 9;
  if (upper.includes('SÁNG') || upper.includes('SANG')) return 5;
  if (upper.includes('CHIỀU') || upper.includes('TỐI')) return 6;

  // Start-time shorthand used in King's Grill (e.g. "09:00", "15:00", "17:00", "18:00")
  const startMatch = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (startMatch) {
    const sh = Number(startMatch[1]) + Number(startMatch[2]) / 60;
    // Restaurant typically closes ~22:30 - 23:00
    if (sh >= 14) {
      return Math.max(4, Math.round((22.5 - sh) * 10) / 10);
    }
    return 5.5;
  }

  return 6;
}

export function validateSmartShiftSwap(
  input: SmartShiftSwapValidationInput
): SmartShiftSwapValidationResult {
  const maxShifts = input.maxShiftsPerWeek ?? 6;
  const maxHours = input.maxHoursPerWeek ?? 48;
  const dayIdx = Number(input.dayIndex);

  if (!Number.isInteger(dayIdx) || dayIdx < 0 || dayIdx > 6) {
    return {
      valid: false,
      canProceedWithWarning: false,
      hasConflict: false,
      hasOtWarning: false,
      existingTargetShift: 'OFF',
      projectedShiftsCount: 0,
      projectedHours: 0,
      reason: 'Ngày đổi ca không hợp lệ.',
    };
  }

  if (!isActiveShiftCode(input.requesterShift)) {
    return {
      valid: false,
      canProceedWithWarning: false,
      hasConflict: false,
      hasOtWarning: false,
      existingTargetShift: 'OFF',
      projectedShiftsCount: 0,
      projectedHours: 0,
      reason: 'Ca hiện tại của bạn đang là OFF nên không thể đổi ca.',
    };
  }

  if (input.targetEmployee && !isWorkEligible(input.targetEmployee)) {
    return {
      valid: false,
      canProceedWithWarning: false,
      hasConflict: false,
      hasOtWarning: false,
      existingTargetShift: 'OFF',
      projectedShiftsCount: 0,
      projectedHours: 0,
      reason: `${input.targetEmployee.fullname} hiện đang tạm nghỉ hoặc ngừng làm việc nên không thể nhận ca.`,
    };
  }

  const weekShifts = Array.isArray(input.targetWeekShifts) ? input.targetWeekShifts : [];
  const existingOnDay = weekShifts[dayIdx] ? String(weekShifts[dayIdx]).split('\n')[0].trim() : 'OFF';

  if (isActiveShiftCode(existingOnDay)) {
    return {
      valid: false,
      canProceedWithWarning: false,
      hasConflict: true,
      hasOtWarning: false,
      existingTargetShift: existingOnDay,
      projectedShiftsCount: weekShifts.filter((s) => isActiveShiftCode(s)).length,
      projectedHours: weekShifts.reduce((sum, s) => sum + parseShiftDurationHours(s), 0),
      reason: `${input.targetEmployee?.fullname || 'Đồng nghiệp'} đã có lịch ca ${existingOnDay} trong ngày này (trùng ca).`,
    };
  }

  const simulated = Array.from({ length: 7 }, (_, idx) =>
    idx === dayIdx ? input.requesterShift : weekShifts[idx] || 'OFF'
  );
  const projectedShiftsCount = simulated.filter((s) => isActiveShiftCode(s)).length;
  const projectedHours =
    Math.round(simulated.reduce((sum, s) => sum + parseShiftDurationHours(s), 0) * 10) / 10;

  const hasOtWarning = projectedShiftsCount > maxShifts || projectedHours > maxHours;
  const warning = hasOtWarning
    ? `Lưu ý ngưỡng OT: Sau khi nhận ca, ${input.targetEmployee?.fullname || 'nhân sự'} sẽ làm ${projectedShiftsCount}/7 buổi (~${projectedHours}h/tuần), vượt khuyến nghị ${maxShifts} ca / ${maxHours}h.`
    : undefined;

  return {
    valid: true,
    canProceedWithWarning: true,
    hasConflict: false,
    hasOtWarning,
    existingTargetShift: existingOnDay || 'OFF',
    projectedShiftsCount,
    projectedHours,
    warning,
  };
}

export function buildEmployeeShiftMapFromPrevious(
  previousShifts: string[] | null | undefined,
  targetWeekDatesKeys: string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  const src = Array.isArray(previousShifts) ? previousShifts : [];
  targetWeekDatesKeys.forEach((dateKey, idx) => {
    const raw = src[idx] ? String(src[idx]).split('\n')[0].trim() : '';
    result[dateKey] = isActiveShiftCode(raw) ? raw : 'OFF';
  });
  return result;
}

export interface AdminScheduleEntryLike {
  username?: string;
  fullname: string;
  shifts: string[];
  shiftNotes?: string[];
  isRegistered?: boolean;
  hasApproved?: boolean;
  reason?: string;
  note?: string;
  [key: string]: any;
}

export function mapPreviousWeekToTargetSchedules(params: {
  currentSchedules: AdminScheduleEntryLike[];
  previousSchedules: AdminScheduleEntryLike[];
  overwriteExisting?: boolean;
}): {
  updatedSchedules: AdminScheduleEntryLike[];
  copiedEmployeeCount: number;
  copiedCellCount: number;
} {
  const { currentSchedules, previousSchedules, overwriteExisting = false } = params;
  const prevByUser = new Map<string, AdminScheduleEntryLike>();
  const prevByName = new Map<string, AdminScheduleEntryLike>();

  for (const prev of previousSchedules || []) {
    if (!prev) continue;
    if (prev.username) prevByUser.set(String(prev.username).trim().toLowerCase(), prev);
    if (prev.fullname) prevByName.set(String(prev.fullname).trim().toLowerCase(), prev);
  }

  let copiedEmployeeCount = 0;
  let copiedCellCount = 0;

  const updatedSchedules = (currentSchedules || []).map((emp) => {
    const uKey = emp.username ? String(emp.username).trim().toLowerCase() : '';
    const nKey = emp.fullname ? String(emp.fullname).trim().toLowerCase() : '';
    const prev = (uKey && prevByUser.get(uKey)) || (nKey && prevByName.get(nKey));
    if (!prev || !Array.isArray(prev.shifts)) return emp;

    const hasExistingActive =
      Boolean(emp.isRegistered) ||
      Boolean(emp.hasApproved) ||
      (Array.isArray(emp.shifts) && emp.shifts.some((s) => isActiveShiftCode(s)));

    if (hasExistingActive && !overwriteExisting) {
      return emp;
    }

    const nextShifts = Array.from({ length: 7 }, (_, i) => {
      const prevRaw = prev.shifts[i] ? String(prev.shifts[i]).split('\n')[0].trim() : '';
      if (overwriteExisting) {
        return prevRaw || 'OFF';
      }
      const curRaw = emp.shifts?.[i] ? String(emp.shifts[i]).trim() : '';
      return curRaw || prevRaw || 'OFF';
    });

    const prevHasAny = nextShifts.some((s) => s !== '' && s !== (emp.shifts?.[0] ?? '__none__'));
    let empChangedCells = 0;
    for (let i = 0; i < 7; i++) {
      if ((emp.shifts?.[i] || '') !== nextShifts[i]) {
        empChangedCells++;
      }
    }

    if (!prevHasAny || empChangedCells === 0) {
      return emp;
    }

    copiedEmployeeCount++;
    copiedCellCount += empChangedCells;

    return {
      ...emp,
      shifts: nextShifts,
      isRegistered: true,
      note: emp.note ? `${emp.note} • Sao chép tuần trước` : 'Sao chép từ lịch tuần trước',
    };
  });

  return {
    updatedSchedules,
    copiedEmployeeCount,
    copiedCellCount,
  };
}
