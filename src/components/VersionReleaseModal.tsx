import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Flame,
  History,
  Layers,
  Smartphone,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import {
  APP_CODENAME,
  APP_RELEASE_DATE,
  APP_VERSION,
  APP_VERSION_TAG,
  CURRENT_RELEASE_CHANGES,
  RELEASE_STATS,
  SEEN_VERSION_STORAGE_KEY,
  VERSION_HISTORY,
  openReleaseNotesModal,
  type ReleaseChangeCategory,
} from '../config/releaseNotes';
import { useAppStore } from '../store/useAppStore';

type FilterTab = 'all' | ReleaseChangeCategory | 'history';

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
      try {
        setHasUnseen(localStorage.getItem(SEEN_VERSION_STORAGE_KEY) !== '1');
      } catch {
        setHasUnseen(false);
      }
    };
    syncSeen();
    window.addEventListener('kg:release-seen-updated', syncSeen);
    return () => window.removeEventListener('kg:release-seen-updated', syncSeen);
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
      className={`group inline-flex items-center justify-center min-h-[40px] min-w-[44px] md:min-h-[36px] transition-transform active:scale-95 touch-manipulation select-none flex-shrink-0 ${className}`}
    >
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold tracking-tight whitespace-nowrap ${pillStyles}`}>
        <Sparkles size={12} className="flex-shrink-0" />
        <span className="font-mono tabular-nums">{APP_VERSION_TAG}</span>
        {showCodename && (
          <span className="hidden sm:inline font-semibold opacity-90">• Có gì mới</span>
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

const CATEGORY_META: Record<
  ReleaseChangeCategory,
  {
    label: string;
    icon: typeof Sparkles;
    pillCls: string;
    iconBoxCls: string;
  }
> = {
  added: {
    label: 'Nâng cấp thêm',
    icon: Sparkles,
    pillCls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    iconBoxCls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  },
  redesigned: {
    label: 'Giao diện & Mobile',
    icon: Smartphone,
    pillCls: 'bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)] border-[var(--kg-accent)]/25',
    iconBoxCls: 'bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)]',
  },
  updated: {
    label: 'Chỉnh sửa & Tối ưu',
    icon: Wrench,
    pillCls: 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border-[var(--kg-primary)]/20',
    iconBoxCls: 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)]',
  },
};

export default function VersionReleaseModal() {
  const currentUser = useAppStore((s) => s.currentUser);
  const [isOpen, setIsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const handleClose = useCallback(() => {
    try {
      localStorage.setItem(SEEN_VERSION_STORAGE_KEY, '1');
      window.dispatchEvent(new CustomEvent('kg:release-seen-updated'));
    } catch {
      /* ignore */
    }
    setIsOpen(false);
  }, []);

  // Listen to global open requests from anywhere in the app (Login, Topbar, Dashboard, Profile, Admin)
  useEffect(() => {
    const handleOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ filter?: FilterTab }>).detail;
      if (detail?.filter) {
        setActiveFilter(detail.filter);
      } else {
        setActiveFilter('all');
      }
      setIsOpen(true);
    };
    window.addEventListener('kg:open-release-notes', handleOpen);
    return () => window.removeEventListener('kg:open-release-notes', handleOpen);
  }, []);

  // Auto-open ONCE when user enters the upgraded v4.0.0 workspace for the first time
  useEffect(() => {
    if (!currentUser?.username) return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('quietRelease') === '1') return;
      const alreadySeen = localStorage.getItem(SEEN_VERSION_STORAGE_KEY) === '1';
      if (!alreadySeen) {
        const timer = window.setTimeout(() => {
          setIsOpen(true);
        }, 550);
        return () => window.clearTimeout(timer);
      }
    } catch {
      /* ignore */
    }
  }, [currentUser?.username]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const filteredItems =
    activeFilter === 'all'
      ? CURRENT_RELEASE_CHANGES
      : activeFilter === 'history'
        ? []
        : CURRENT_RELEASE_CHANGES.filter((item) => item.category === activeFilter);

  const filterTabs: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'all', label: 'Tất cả điểm mới', count: CURRENT_RELEASE_CHANGES.length },
    {
      id: 'added',
      label: 'Thêm mới',
      count: CURRENT_RELEASE_CHANGES.filter((i) => i.category === 'added').length,
    },
    {
      id: 'redesigned',
      label: 'Đổi mới UI & Mobile',
      count: CURRENT_RELEASE_CHANGES.filter((i) => i.category === 'redesigned').length,
    },
    {
      id: 'updated',
      label: 'Chỉnh sửa & Tối ưu',
      count: CURRENT_RELEASE_CHANGES.filter((i) => i.category === 'updated').length,
    },
    { id: 'history', label: 'Lịch sử bản' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kg-release-modal-title"
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-[2px] p-0 sm:p-4 animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[86vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--kg-surface)] border border-[var(--kg-border)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Editorial Hero Header */}
        <div
          className="relative px-4 sm:px-6 pt-4 sm:pt-5 pb-4 text-white flex-shrink-0"
          style={{ background: 'var(--gradient-hero)' }}
        >
          {/* Mobile grab handle */}
          <div className="w-10 h-1 rounded-full bg-white/25 mx-auto mb-3 sm:hidden" />

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#C8432B] text-white text-[11px] font-bold font-mono tabular-nums">
                  <Flame size={12} /> Phiên bản {APP_VERSION}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/12 border border-white/15 text-white/90 text-[11px] font-medium font-mono tabular-nums">
                  <Clock size={11} /> Cập nhật {APP_RELEASE_DATE}
                </span>
              </div>
              <h2
                id="kg-release-modal-title"
                className="text-lg sm:text-xl font-extrabold tracking-tight text-white leading-snug"
              >
                King&apos;s Grill Staff OS — {APP_CODENAME}
              </h2>
              <p className="text-xs sm:text-[13px] text-white/80 mt-1 leading-relaxed">
                Lột xác 100% kiến trúc giao diện, tối ưu hiển thị khít đẹp trên mọi dòng điện thoại và bổ sung điều hướng thông minh.
              </p>
            </div>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Đóng thông tin phiên bản"
              className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center flex-shrink-0 transition-colors touch-manipulation"
            >
              <X size={18} />
            </button>
          </div>

          {/* 4 Summary Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3.5">
            {RELEASE_STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-white/10 border border-white/12 px-2.5 py-2"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70 truncate">
                  {stat.label}
                </p>
                <p className="text-sm font-extrabold font-mono tabular-nums text-amber-200 mt-0.5">
                  {stat.value}
                </p>
                <p className="text-[10.5px] text-white/75 truncate">{stat.note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable Capsule Filter Tabs */}
        <div className="px-3.5 sm:px-6 py-2.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex items-center gap-1.5 overflow-x-auto hide-scrollbar flex-shrink-0">
          {filterTabs.map((tab) => {
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition-all touch-manipulation ${
                  active
                    ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                    : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                }`}
              >
                {tab.id === 'history' && <History size={13} />}
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto px-3.5 sm:px-6 py-4 space-y-3">
          {activeFilter !== 'history' ? (
            filteredItems.map((item) => {
              const meta = CATEGORY_META[item.category];
              const Icon = meta.icon;
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] p-3.5 sm:p-4 shadow-xs hover:border-[var(--kg-border-strong)] transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.iconBoxCls}`}
                    >
                      <Icon size={17} strokeWidth={1.85} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10.5px] font-bold ${meta.pillCls}`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[11px] font-semibold text-[var(--kg-text-soft)]">
                          • {item.badge}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-[var(--kg-text)] leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs sm:text-[13px] text-[var(--kg-text-muted)] mt-1 leading-relaxed">
                        {item.description}
                      </p>
                      <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--kg-primary-ink)]">
                        <CheckCircle2 size={13} className="text-[var(--kg-success)] flex-shrink-0" />
                        <span>Hiệu quả: {item.impact}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="space-y-3">
              {VERSION_HISTORY.map((ver) => (
                <div
                  key={ver.version}
                  className={`rounded-2xl border p-4 ${
                    ver.isCurrent
                      ? 'border-[var(--kg-accent)]/40 bg-[var(--kg-accent-soft)]/35'
                      : 'border-[var(--kg-border)] bg-[var(--kg-surface)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-[var(--kg-primary)] text-white text-xs font-bold font-mono tabular-nums">
                        {ver.version}
                      </span>
                      <span className="text-sm font-bold text-[var(--kg-text)]">
                        {ver.codename}
                      </span>
                      {ver.isCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--kg-accent)] text-white text-[10px] font-bold uppercase tracking-wider">
                          Đang chạy
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono tabular-nums text-[var(--kg-text-muted)]">
                      {ver.date}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {ver.highlights.map((hl, idx) => (
                      <li
                        key={idx}
                        className="text-xs sm:text-[13px] text-[var(--kg-text-muted)] flex items-start gap-2 leading-relaxed"
                      >
                        <Layers
                          size={13}
                          className="text-[var(--kg-accent-ink)] flex-shrink-0 mt-1"
                        />
                        <span>{hl}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky Footer Action */}
        <div className="px-3.5 sm:px-6 py-3 pb-safe-bottom border-t border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex items-center justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[var(--kg-text-muted)] truncate">
              Build <span className="font-mono tabular-nums font-bold text-[var(--kg-text)]">{APP_VERSION_TAG}</span> • Đồng bộ đa thiết bị
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[var(--kg-accent)] hover:brightness-105 text-white text-xs sm:text-sm font-bold shadow-xs transition-all active:scale-95 touch-manipulation whitespace-nowrap"
          >
            Trải nghiệm {APP_VERSION_TAG} ngay
          </button>
        </div>
      </div>
    </div>
  );
}
