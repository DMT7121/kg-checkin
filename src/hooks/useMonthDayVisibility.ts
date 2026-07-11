import { useEffect, useMemo, useState } from 'react';
import type { MonthDateInfo } from '../utils/helpers';

export function useMonthDayVisibility(storageKey: string, monthDates: MonthDateInfo[]) {
  const monthKey = monthDates[0]
    ? `${monthDates[0].date.getFullYear()}-${monthDates[0].date.getMonth() + 1}`
    : '';
  const [visibleKeys, setVisibleKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!monthDates.length) return;
    const timer = window.setTimeout(() => {
      const allKeys = monthDates.map(date => date.dateKey);
      try {
        const saved = JSON.parse(localStorage.getItem(`${storageKey}:${monthKey}`) || '[]') as string[];
        const valid = saved.filter(key => allKeys.includes(key));
        setVisibleKeys(valid.length ? valid : allKeys);
      } catch {
        setVisibleKeys(allKeys);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [monthDates, monthKey, storageKey]);

  const updateVisibleKeys = (keys: string[]) => {
    const valid = monthDates.map(date => date.dateKey).filter(key => keys.includes(key));
    const next = valid.length ? valid : [monthDates[0]?.dateKey].filter(Boolean);
    setVisibleKeys(next);
    localStorage.setItem(`${storageKey}:${monthKey}`, JSON.stringify(next));
  };

  const visibleDates = useMemo(
    () => monthDates.filter(date => visibleKeys.includes(date.dateKey)),
    [monthDates, visibleKeys],
  );

  return { visibleKeys, visibleDates, updateVisibleKeys };
}
