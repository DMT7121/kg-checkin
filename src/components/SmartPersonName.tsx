import { useEffect, useRef, useState } from 'react';
import { abbreviatePersonName } from '../utils/personName';

export default function SmartPersonName({
  fullname,
  className = '',
}: {
  fullname: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const shortName = abbreviatePersonName(fullname);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <button
      ref={buttonRef}
      type="button"
      title={fullname}
      aria-label={`Tên đầy đủ: ${fullname}`}
      aria-expanded={open}
      onClick={() => setOpen(value => !value)}
      className={`group/person relative inline-flex items-center min-h-[44px] sm:min-h-[36px] py-1.5 max-w-full text-left touch-manipulation ${className}`}
    >
      <span className="block truncate">{shortName}</span>
      <span
        role="tooltip"
        className={`pointer-events-none z-[80] absolute left-0 top-full mt-1.5 w-max max-w-[min(260px,calc(100vw-32px))] whitespace-normal rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2 text-xs font-bold leading-5 text-[var(--kg-text)] shadow-xl transition ${
          open
            ? 'visible translate-y-0 opacity-100'
            : 'invisible -translate-y-1 opacity-0 group-hover/person:visible group-hover/person:translate-y-0 group-hover/person:opacity-100 group-focus-visible/person:visible group-focus-visible/person:opacity-100'
        }`}
      >
        {fullname}
      </span>
    </button>
  );
}
