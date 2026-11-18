import React from 'react';
import { SHORT_DAY_NAMES } from '../utils/helpers';
import type { MonthDateInfo } from '../utils/helpers';
import { getCalendarDayMeta } from '../utils/calendarHighlights';

interface CalendarGridProps {
  monthDates: MonthDateInfo[];
  renderCell: (mDate: MonthDateInfo) => React.ReactNode;
}

export default function CalendarGrid({ monthDates, renderCell }: CalendarGridProps) {
  if (!monthDates || monthDates.length === 0) return null;

  const firstDay = monthDates[0];
  const paddingDays = firstDay.dayIndex;

  const blanks = Array.from({ length: paddingDays }).map((_, i) => (
    <div key={`blank-${i}`} className="bg-[var(--kg-surface-soft)]/50 rounded-xl border border-transparent" />
  ));

  return (
    <div className="w-full min-w-0">
      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1.5 sm:mb-2">
        {SHORT_DAY_NAMES.map((shortDay, idx) => (
          <div
            key={shortDay}
            className={`min-w-0 text-center py-1.5 sm:py-2 px-0.5 text-[10.5px] sm:text-xs font-semibold uppercase tracking-wider rounded-lg border border-transparent truncate ${
              idx >= 4
                ? 'calendar-day--weekend'
                : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
            }`}
          >
            <span>{shortDay}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2 auto-rows-fr">
        {blanks}
        {monthDates.map((mDate) => {
          const isToday = new Date().toDateString() === mDate.date.toDateString();
          const dayMeta = getCalendarDayMeta(mDate.dateKey);

          return (
            <div
              key={mDate.dateKey}
              title={dayMeta.label || undefined}
              className={`calendar-month-day min-w-0 min-h-[76px] sm:min-h-[100px] flex flex-col p-1 sm:p-2 rounded-lg sm:rounded-xl border transition-colors ${dayMeta.className} ${
                isToday
                  ? 'border-[var(--kg-primary)] bg-[var(--kg-info-soft)]/70 ring-1 ring-[var(--kg-primary)]/20'
                  : 'border-[var(--kg-border)] bg-[var(--kg-surface)]'
              }`}
            >
              <div className="flex justify-between items-start mb-1 sm:mb-2 min-w-0">
                <span
                  className={`text-[11px] sm:text-sm font-mono font-semibold tabular-nums w-5 h-5 sm:w-7 sm:h-7 flex items-center justify-center rounded-full shrink-0 ${
                    isToday
                      ? 'bg-[var(--kg-primary)] text-white'
                      : dayMeta.isWeekend
                        ? 'text-[var(--kg-warning)]'
                        : 'text-[var(--kg-text)]'
                  }`}
                >
                  {mDate.date.getDate()}
                </span>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center w-full min-w-0">
                {renderCell(mDate)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
