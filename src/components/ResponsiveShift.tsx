import React from 'react';

/**
 * Format shift display for compact mobile screens:
 * E.g., "15:00" -> "15H", "16:00" -> "16H", "17:00" -> "17H", "18:00" -> "18H", "19:00" -> "19H"
 * Odd minutes like "15:30" -> "15H30"
 * Non-time values like "OFF", "RẢNH", "OFF#", "OFF!" are preserved.
 */
export function formatMobileShift(shift: string | undefined | null): string {
  if (!shift) return '—';
  const trimmed = shift.trim();
  
  // Exact match e.g. "15:00" -> "15H", "08:30" -> "8H30"
  const exactMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (exactMatch) {
    const [, hour, minute] = exactMatch;
    return minute === '00' ? `${Number(hour)}H` : `${Number(hour)}H${minute}`;
  }
  
  // Embedded match: e.g. "Ca 1 (15:00)" -> "Ca 1 (15H)"
  return trimmed.replace(/(\d{1,2}):(\d{2})/g, (_, hour, minute) => {
    return minute === '00' ? `${Number(hour)}H` : `${Number(hour)}H${minute}`;
  });
}

export interface ResponsiveShiftProps {
  shift?: string | null;
  className?: string;
  mobileClassName?: string;
  desktopClassName?: string;
  fallback?: string;
}

/**
 * Responsive component that renders a compact shift on mobile screens (< 768px / md),
 * and preserves full standard format on tablets and desktop screens (>= 768px).
 */
export function ResponsiveShift({
  shift,
  className = '',
  mobileClassName = '',
  desktopClassName = '',
  fallback = '—'
}: ResponsiveShiftProps) {
  if (!shift) return <span className={className}>{fallback}</span>;

  const mobileText = formatMobileShift(shift);
  if (mobileText === shift) {
    return <span className={className}>{shift}</span>;
  }

  return (
    <span className={className}>
      <span className={`md:hidden inline ${mobileClassName}`}>{mobileText}</span>
      <span className={`hidden md:inline ${desktopClassName}`}>{shift}</span>
    </span>
  );
}

export default ResponsiveShift;
