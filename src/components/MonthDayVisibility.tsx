import { useState } from 'react';
import { CalendarRange, Check, Eye, EyeOff, RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { MonthDateInfo } from '../utils/helpers';
import { SHORT_DAY_NAMES, formatDateShort } from '../utils/helpers';

export default function MonthDayVisibility({
  monthDates,
  visibleKeys,
  onChange,
}: {
  monthDates: MonthDateInfo[];
  visibleKeys: string[];
  onChange: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const visibleSet = new Set(visibleKeys);

  const toggleDate = (dateKey: string) => {
    if (visibleSet.has(dateKey)) {
      if (visibleKeys.length === 1) return;
      onChange(visibleKeys.filter(key => key !== dateKey));
    } else {
      onChange([...visibleKeys, dateKey]);
    }
  };

  const showNextSevenDays = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const future = monthDates.filter(date => date.date >= today).slice(0, 7);
    onChange((future.length ? future : monthDates.slice(0, 7)).map(date => date.dateKey));
  };

  return (
    <div className="soft3d-card relative z-30 rounded-2xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--kg-accent-soft)] text-[var(--kg-primary)] dark:text-[var(--color-cyan)]">
            <CalendarRange size={17} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-extrabold text-[var(--kg-text)]">Cột ngày hiển thị</p>
            <p className="text-[10px] font-semibold text-[var(--kg-text-muted)]">
              Đang hiện {visibleKeys.length}/{monthDates.length} ngày
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-xs font-extrabold text-[var(--kg-text)]"
        >
          <SlidersHorizontal size={15} />
          {open ? 'Đóng lựa chọn' : 'Chọn ngày'}
        </button>
      </div>

      {open && (
        <div className="mt-3 border-t border-[var(--kg-border)] pt-3">
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onChange(monthDates.map(date => date.dateKey))} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--kg-primary)] px-3 py-2 text-[11px] font-bold text-white">
              <Eye size={13} /> Tất cả
            </button>
            <button type="button" onClick={() => onChange(monthDates.filter(date => date.dayIndex < 5).map(date => date.dateKey))} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--kg-surface-soft)] px-3 py-2 text-[11px] font-bold text-[var(--kg-text)]">
              <EyeOff size={13} /> Chỉ T2–T6
            </button>
            <button type="button" onClick={showNextSevenDays} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--kg-surface-soft)] px-3 py-2 text-[11px] font-bold text-[var(--kg-text)]">
              <RotateCcw size={13} /> 7 ngày gần nhất
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {monthDates.map(date => {
              const selected = visibleSet.has(date.dateKey);
              return (
                <button
                  type="button"
                  key={date.dateKey}
                  onClick={() => toggleDate(date.dateKey)}
                  title={`${formatDateShort(date.date)} · ${SHORT_DAY_NAMES[date.dayIndex]}`}
                  className={`relative flex min-h-12 flex-col items-center justify-center rounded-xl border px-1 py-1.5 transition ${
                    selected
                      ? 'border-[var(--kg-primary)] bg-[var(--kg-primary)] text-white shadow-sm'
                      : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                  }`}
                >
                  <span className="text-[11px] font-black">{date.date.getDate()}</span>
                  <span className="text-[9px] font-bold opacity-75">{SHORT_DAY_NAMES[date.dayIndex]}</span>
                  {selected && <Check size={10} className="absolute right-1 top-1" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
