import { useState } from 'react';
import { abbreviatePersonName } from '../utils/personName';

export default function SmartPersonName({
  fullname,
  className = '',
}: {
  fullname: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const shortName = abbreviatePersonName(fullname);

  return (
    <button
      type="button"
      title={fullname}
      aria-label={`Tên đầy đủ: ${fullname}`}
      aria-expanded={open}
      onClick={() => setOpen(value => !value)}
      onBlur={() => setOpen(false)}
      className={`group/person relative block max-w-full text-left ${className}`}
    >
      <span className="block truncate">{shortName}</span>
      <span
        role="tooltip"
        className={`pointer-events-none z-[80] w-max max-w-[calc(100vw-32px)] whitespace-normal rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2 text-xs font-bold leading-5 text-[var(--kg-text)] shadow-xl transition ${
          open
            ? 'fixed left-1/2 top-20 visible -translate-x-1/2 opacity-100'
            : 'absolute left-0 top-full mt-2 invisible -translate-y-1 opacity-0 group-hover/person:visible group-hover/person:translate-y-0 group-hover/person:opacity-100 group-focus-visible/person:visible group-focus-visible/person:opacity-100'
        }`}
      >
        {fullname}
      </span>
    </button>
  );
}
