import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
  APP_VERSION_TAG,
  RELEASE_SEEN_UPDATED_EVENT,
  getHasUnreadReleaseNotes,
  openReleaseNotesModal,
} from '../config/appVersion';

export function KgVersionBadge({
  variant = 'surface',
  showCodename = false,
  className = '',
}: {
  variant?: 'surface' | 'rail' | 'hero' | 'compact';
  showCodename?: boolean;
  className?: string;
}) {
  const [hasUnseen, setHasUnseen] = useState(false);

  useEffect(() => {
    const syncSeen = () => {
      setHasUnseen(getHasUnreadReleaseNotes());
    };
    syncSeen();
    window.addEventListener(RELEASE_SEEN_UPDATED_EVENT, syncSeen);
    return () => window.removeEventListener(RELEASE_SEEN_UPDATED_EVENT, syncSeen);
  }, []);

  const pillStyles = {
    surface:
      'px-2.5 py-1 rounded-full bg-[var(--kg-accent-soft)] border border-[var(--kg-accent)]/25 text-[var(--kg-accent-ink)] group-hover:brightness-95',
    rail:
      'px-2 py-1 rounded-full bg-white/10 border border-white/15 text-amber-200 group-hover:bg-white/15',
    hero:
      'px-3 py-1.5 rounded-full bg-white/12 border border-white/20 text-white group-hover:bg-white/18',
    compact:
      'px-2 py-0.5 rounded-full bg-[var(--kg-accent-soft)] border border-[var(--kg-accent)]/25 text-[var(--kg-accent-ink)]',
  }[variant];

  return (
    <button
      type="button"
      onClick={() => openReleaseNotesModal('all')}
      title={`Thông tin phiên bản ${APP_VERSION_TAG} — Nhấn để xem chi tiết nâng cấp`}
      className={`group inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-[36px] transition-transform active:scale-95 touch-manipulation select-none flex-shrink-0 ${className}`}
    >
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-bold tracking-tight whitespace-nowrap ${pillStyles}`}
      >
        <Sparkles size={12} className="flex-shrink-0" />
        <span className="font-mono tabular-nums">{APP_VERSION_TAG}</span>
        {showCodename && (
          <span className="hidden 2xl:inline font-semibold opacity-90">• Có gì mới</span>
        )}
        {hasUnseen && (
          <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--kg-accent)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--kg-accent)]" />
          </span>
        )}
      </span>
    </button>
  );
}

export default KgVersionBadge;
