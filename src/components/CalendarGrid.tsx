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

  // Find padding for the first day
  const firstDay = monthDates[0];
  const paddingDays = firstDay.dayIndex; // 0 for Mon, 6 for Sun

  // Generate blank cells for padding
  const blanks = Array.from({ length: paddingDays }).map((_, i) => (
    <div key={`blank-${i}`} className="bg-gray-50/50 dark:bg-gray-900/20 rounded-xl border border-transparent"></div>
  ));

  return (
    <div className="w-full">
      {/* Header Mon-Sun */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
        {SHORT_DAY_NAMES.map((shortDay, idx) => (
          <div key={shortDay} className={`text-center py-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider rounded-lg ${idx >= 4 ? 'calendar-day--weekend' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
            <span>{shortDay}</span>
          </div>
        ))}
      </div>

      {/* Grid Days */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 auto-rows-fr">
        {blanks}
        {monthDates.map((mDate) => {
          // Check if it's today
          const isToday = new Date().toDateString() === mDate.date.toDateString();
          const dayMeta = getCalendarDayMeta(mDate.dateKey);
          
          return (
            <div 
              key={mDate.dateKey} 
              title={dayMeta.label || undefined}
              className={`calendar-month-day min-h-[80px] sm:min-h-[100px] flex flex-col p-1 sm:p-2 rounded-xl border transition-all ${dayMeta.className} ${
                isToday 
                  ? 'border-indigo-400 bg-indigo-50/80 dark:bg-indigo-900/30 dark:border-indigo-600 ' 
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 '
              }`}
            >
              <div className="flex justify-between items-start mb-1 sm:mb-2">
                <span className={`text-xs sm:text-sm font-bold w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full ${
                  isToday 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : dayMeta.isWeekend
                      ? 'text-orange-600 dark:text-orange-400' 
                      : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {mDate.date.getDate()}
                </span>
              </div>
              
              <div className="flex-1 flex flex-col items-center justify-center w-full">
                {renderCell(mDate)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
