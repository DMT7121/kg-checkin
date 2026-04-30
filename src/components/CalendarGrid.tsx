import React from 'react';
import { MonthDateInfo, SHORT_DAY_NAMES } from '../utils/helpers';

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
          <div key={shortDay} className={`text-center py-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider rounded-lg ${idx >= 5 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
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
          
          return (
            <div 
              key={mDate.dateKey} 
              className={`min-h-[80px] sm:min-h-[100px] flex flex-col p-1 sm:p-2 rounded-xl border transition-all ${
                isToday 
                  ? 'border-indigo-400 bg-indigo-50/80 dark:bg-indigo-900/30 dark:border-indigo-600 shadow-sm' 
                  : mDate.isWeekend 
                    ? 'border-orange-100 bg-orange-50/30 dark:border-gray-700 dark:bg-gray-800/50' 
                    : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start mb-1 sm:mb-2">
                <span className={`text-xs sm:text-sm font-bold w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full ${
                  isToday 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : mDate.isWeekend 
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
