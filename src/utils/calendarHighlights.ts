export type CalendarHighlightKind = 'holiday' | 'fnb' | 'weekend' | 'normal';

export interface CalendarDayMeta {
  kind: CalendarHighlightKind;
  label: string;
  className: string;
  isHoliday: boolean;
  isFnb: boolean;
  isWeekend: boolean;
}

const lunarFormatter = new Intl.DateTimeFormat('en-u-ca-chinese', {
  month: 'numeric',
  day: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const SOLAR_HOLIDAYS: Record<string, string> = {
  '01-01': 'Tết Dương lịch',
  '04-30': 'Ngày Giải phóng miền Nam',
  '05-01': 'Ngày Quốc tế Lao động',
  '09-02': 'Quốc khánh Việt Nam',
};

const FNB_PEAK_DAYS: Record<string, string> = {
  '02-14': 'Valentine · cao điểm F&B',
  '03-08': 'Quốc tế Phụ nữ · cao điểm F&B',
  '06-01': 'Quốc tế Thiếu nhi · cao điểm gia đình',
  '10-20': 'Phụ nữ Việt Nam · cao điểm F&B',
  '11-20': 'Nhà giáo Việt Nam · cao điểm F&B',
  '12-24': 'Đêm Giáng sinh · cao điểm F&B',
  '12-25': 'Giáng sinh · cao điểm F&B',
  '12-31': 'Đêm Giao thừa · cao điểm F&B',
};

function parseDate(input: Date | string): Date {
  if (input instanceof Date) return new Date(input);
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return new Date(input);
}

function getLunarMonthDay(date: Date): { month: number; day: number } | null {
  try {
    const parts = lunarFormatter.formatToParts(date);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    return Number.isFinite(month) && Number.isFinite(day) ? { month, day } : null;
  } catch {
    return null;
  }
}

function getMovableFnbEvent(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = date.getDay();
  const weekOfMonth = Math.ceil(day / 7);
  if (month === 5 && weekday === 0 && weekOfMonth === 2) return 'Ngày của Mẹ · cao điểm F&B';
  if (month === 6 && weekday === 0 && weekOfMonth === 3) return 'Ngày của Cha · cao điểm F&B';
  return '';
}

export function getCalendarDayMeta(input: Date | string): CalendarDayMeta {
  const date = parseDate(input);
  const solarKey = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const lunar = getLunarMonthDay(date);
  const weekday = date.getDay();
  const isWeekend = weekday === 5 || weekday === 6 || weekday === 0;

  let holidayLabel = SOLAR_HOLIDAYS[solarKey] || '';
  if (lunar?.month === 1 && lunar.day >= 1 && lunar.day <= 5) holidayLabel = 'Tết Nguyên đán';
  if (lunar?.month === 3 && lunar.day === 10) holidayLabel = 'Giỗ Tổ Hùng Vương';

  let fnbLabel = FNB_PEAK_DAYS[solarKey] || getMovableFnbEvent(date);
  if (lunar?.month === 8 && lunar.day === 15) fnbLabel = 'Tết Trung thu · cao điểm F&B';

  const isHoliday = !!holidayLabel;
  const isFnb = !!fnbLabel;
  const kind: CalendarHighlightKind = isHoliday ? 'holiday' : isFnb ? 'fnb' : isWeekend ? 'weekend' : 'normal';
  const labels = [holidayLabel, fnbLabel, isWeekend ? 'Cuối tuần' : ''].filter(Boolean);
  const className = [
    isWeekend ? 'calendar-day--weekend' : '',
    isFnb ? 'calendar-day--fnb' : '',
    isHoliday ? 'calendar-day--holiday' : '',
  ].filter(Boolean).join(' ');

  return {
    kind,
    label: labels.join(' · '),
    className,
    isHoliday,
    isFnb,
    isWeekend,
  };
}
