import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  ChevronDown,
  History,
  Layers,
  ListFilter,
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
import { KgButton } from './KgDesignSystem';

type MainViewTab = 'overview' | 'details' | 'history';
type DetailCategoryFilter = 'all' | ReleaseChangeCategory;

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
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-bold tracking-tight whitespace-nowrap ${pillStyles}`}
      >
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
    shortLabel: string;
    sectionTitle: string;
    icon: typeof Sparkles;
    pillCls: string;
    iconBoxCls: string;
    dotCls: string;
  }
> = {
  updated: {
    label: 'Cập nhật & Sửa lỗi',
    shortLabel: 'Sửa lỗi',
    sectionTitle: 'Cập nhật & Sửa lỗi',
    icon: Wrench,
    pillCls: 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border-[var(--kg-primary)]/20',
    iconBoxCls: 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)]',
    dotCls: 'bg-[var(--kg-primary)]',
  },
  added: {
    label: 'Tính năng mới',
    shortLabel: 'Thêm mới',
    sectionTitle: 'Tính năng thêm mới',
    icon: Sparkles,
    pillCls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
    iconBoxCls: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    dotCls: 'bg-emerald-500',
  },
  redesigned: {
    label: 'UI & Di động',
    shortLabel: 'UI & Mobile',
    sectionTitle: 'Giao diện & Di động',
    icon: Smartphone,
    pillCls: 'bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)] border-[var(--kg-accent)]/25',
    iconBoxCls: 'bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)]',
    dotCls: 'bg-[var(--kg-accent)]',
  },
};

const OVERVIEW_GROUP_ORDER: ReleaseChangeCategory[] = ['updated', 'added', 'redesigned'];

export default function VersionReleaseModal() {
  const currentUser = useAppStore((s) => s.currentUser);
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<MainViewTab>('overview');
  const [detailFilter, setDetailFilter] = useState<DetailCategoryFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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
      const detail = (ev as CustomEvent<{ filter?: 'all' | ReleaseChangeCategory | 'history' }>)
        .detail;
      const filter = detail?.filter || 'all';
      if (filter === 'history') {
        setActiveView('history');
      } else if (filter === 'added' || filter === 'redesigned' || filter === 'updated') {
        setActiveView('details');
        setDetailFilter(filter);
      } else {
        setActiveView('overview');
        setDetailFilter('all');
      }
      setIsOpen(true);
    };
    window.addEventListener('kg:open-release-notes', handleOpen);
    return () => window.removeEventListener('kg:open-release-notes', handleOpen);
  }, []);

  // Auto-open ONCE when user enters the upgraded workspace for the first time
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
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  if (typeof document === 'undefined') return null;

  const filteredDetailItems =
    detailFilter === 'all'
      ? CURRENT_RELEASE_CHANGES
      : CURRENT_RELEASE_CHANGES.filter((item) => item.category === detailFilter);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10060] flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6">
          {/* Backdrop synchronized with KgBottomSheet */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/55 backdrop-blur-sm pointer-events-auto"
          />

          {/* Dialog Surface synchronized 100% with KgBottomSheet & Warm Hospitality tokens */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kg-release-modal-title"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full sm:max-w-xl max-h-[88dvh] sm:max-h-[84vh] mx-auto bg-[var(--kg-surface)] text-[var(--kg-text)] rounded-t-2xl sm:rounded-2xl border border-[var(--kg-border)] shadow-2xl flex flex-col pointer-events-auto overflow-hidden pb-safe"
          >
            {/* Subtle Brand Top Accent Line */}
            <div className="h-[3px] w-full bg-[var(--kg-accent)] flex-shrink-0" />

            {/* Compact Native Header (matches KgBottomSheet + KgModuleHero) */}
            <div className="px-4 sm:px-5 pt-2.5 sm:pt-3.5 pb-3 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/75 flex-shrink-0">
              {/* Mobile grab handle */}
              <div className="w-9 h-1 rounded-full bg-[var(--kg-border-strong)] mx-auto mb-2.5 sm:hidden" />

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[var(--kg-accent-soft)] border border-[var(--kg-accent)]/25 text-[var(--kg-accent-ink)] flex items-center justify-center flex-shrink-0">
                    <Sparkles size={18} strokeWidth={1.9} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2
                        id="kg-release-modal-title"
                        className="text-sm sm:text-base font-extrabold text-[var(--kg-text)] tracking-tight truncate"
                      >
                        Thông tin Phiên bản
                      </h2>
                      <span className="px-2 py-0.5 rounded-full bg-[var(--kg-accent-soft)] border border-[var(--kg-accent)]/25 text-[var(--kg-accent-ink)] text-[11px] font-bold font-mono tabular-nums">
                        {APP_VERSION_TAG}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[var(--kg-text-muted)] mt-0.5 truncate">
                      Cập nhật <span className="font-mono tabular-nums">{APP_RELEASE_DATE}</span> •{' '}
                      <span className="sm:hidden">King’s Grill</span>
                      <span className="hidden sm:inline">{APP_CODENAME}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Đóng thông tin phiên bản"
                  className="w-9 h-9 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] active:scale-95 transition-colors flex-shrink-0 touch-manipulation"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 3-Tab Segmented Switch (100% fit on 360px mobile — zero clipped labels) */}
              <div
                role="tablist"
                aria-label="Chế độ xem thông tin phiên bản"
                className="grid grid-cols-3 gap-1 p-1 mt-3 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)]"
              >
                {(
                  [
                    { id: 'overview', label: 'Điểm mới', icon: Sparkles },
                    {
                      id: 'details',
                      label: `Chi tiết (${CURRENT_RELEASE_CHANGES.length})`,
                      icon: ListFilter,
                    },
                    { id: 'history', label: 'Các bản', icon: History },
                  ] as const
                ).map((tab) => {
                  const active = activeView === tab.id;
                  const TabIcon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveView(tab.id)}
                      className={`min-h-[34px] px-2 py-1 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all touch-manipulation ${
                        active
                          ? 'bg-[var(--kg-primary)] text-white shadow-2xs'
                          : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                      }`}
                    >
                      <TabIcon size={13} className="flex-shrink-0 hidden xs:inline sm:inline" />
                      <span className="truncate">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3.5 space-y-3.5 min-h-0">
              {/* TAB 1: SCANNABLE GROUPED OVERVIEW */}
              {activeView === 'overview' && (
                <>
                  {/* Compact 4-Metric Strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {RELEASE_STATS.map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] px-2.5 py-2"
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--kg-text-muted)] truncate">
                          {stat.label}
                        </p>
                        <p className="text-xs sm:text-[13px] font-extrabold font-mono tabular-nums text-[var(--kg-text)] mt-0.5 truncate">
                          {stat.value}
                        </p>
                        <p className="text-[10.5px] text-[var(--kg-text-soft)] truncate">
                          {stat.note}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Grouped Scannable Accordion Lists */}
                  {OVERVIEW_GROUP_ORDER.map((categoryKey) => {
                    const meta = CATEGORY_META[categoryKey];
                    const CatIcon = meta.icon;
                    const items = CURRENT_RELEASE_CHANGES.filter(
                      (i) => i.category === categoryKey
                    );
                    if (items.length === 0) return null;

                    return (
                      <div
                        key={categoryKey}
                        className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] overflow-hidden"
                      >
                        <div className="px-3.5 py-2.5 bg-[var(--kg-surface-soft)]/70 border-b border-[var(--kg-border)] flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.iconBoxCls}`}
                            >
                              <CatIcon size={13} strokeWidth={2} />
                            </div>
                            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--kg-text)] truncate">
                              {meta.sectionTitle}
                            </h3>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[10.5px] font-bold font-mono tabular-nums text-[var(--kg-text-muted)] flex-shrink-0">
                            {items.length} mục
                          </span>
                        </div>

                        <div className="divide-y divide-[var(--kg-border)]">
                          {items.map((item) => {
                            const isExpanded = Boolean(expandedIds[item.id]);
                            return (
                              <div key={item.id} className="transition-colors">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(item.id)}
                                  className="w-full text-left px-3.5 py-2.5 hover:bg-[var(--kg-surface-soft)]/50 transition-colors flex items-start justify-between gap-2.5 touch-manipulation"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start gap-2">
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[7px] ${meta.dotCls}`}
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-bold text-[var(--kg-text)] leading-snug">
                                          {item.title}
                                        </p>
                                        <p className="text-xs text-[var(--kg-text-muted)] mt-0.5 leading-relaxed">
                                          {item.summary}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  <ChevronDown
                                    size={15}
                                    className={`text-[var(--kg-text-soft)] flex-shrink-0 mt-1 transition-transform duration-150 ${
                                      isExpanded ? 'rotate-180 text-[var(--kg-text)]' : ''
                                    }`}
                                  />
                                </button>

                                {isExpanded && (
                                  <div className="px-3.5 pb-3 pt-0.5 pl-6 space-y-1.5 bg-[var(--kg-surface-soft)]/35">
                                    <p className="text-xs text-[var(--kg-text-muted)] leading-relaxed">
                                      {item.description}
                                    </p>
                                    <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--kg-primary-ink)]">
                                      <CheckCircle2
                                        size={12}
                                        className="text-[var(--kg-success)] flex-shrink-0"
                                      />
                                      <span>{item.impact}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* TAB 2: FULL CATEGORY DETAILS */}
              {activeView === 'details' && (
                <>
                  {/* Short, Zero-Clip Category Sub-Pills */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'all', label: 'Tất cả' },
                        { id: 'updated', label: 'Sửa lỗi' },
                        { id: 'added', label: 'Thêm mới' },
                        { id: 'redesigned', label: 'UI & Mobile' },
                      ] as const
                    ).map((sub) => {
                      const active = detailFilter === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setDetailFilter(sub.id)}
                          className={`min-h-[34px] px-2 py-1 rounded-xl text-[11.5px] font-bold transition-all truncate touch-manipulation ${
                            active
                              ? 'bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)] border border-[var(--kg-accent)]/35'
                              : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                          }`}
                        >
                          {sub.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-2.5">
                    {filteredDetailItems.map((item) => {
                      const meta = CATEGORY_META[item.category];
                      const Icon = meta.icon;
                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] p-3.5 hover:border-[var(--kg-border-strong)] transition-colors"
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.iconBoxCls}`}
                            >
                              <Icon size={15} strokeWidth={1.9} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                <span
                                  className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${meta.pillCls}`}
                                >
                                  {meta.label}
                                </span>
                                <span className="text-[10.5px] font-semibold text-[var(--kg-text-soft)]">
                                  • {item.badge}
                                </span>
                              </div>
                              <h3 className="text-[13px] sm:text-sm font-bold text-[var(--kg-text)] leading-snug">
                                {item.title}
                              </h3>
                              <p className="text-xs text-[var(--kg-text-muted)] mt-1 leading-relaxed">
                                {item.description}
                              </p>
                              <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--kg-primary-ink)]">
                                <CheckCircle2
                                  size={12}
                                  className="text-[var(--kg-success)] flex-shrink-0"
                                />
                                <span>Hiệu quả: {item.impact}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* TAB 3: VERSION TIMELINE */}
              {activeView === 'history' && (
                <div className="space-y-2.5">
                  {VERSION_HISTORY.map((ver) => (
                    <div
                      key={ver.version}
                      className={`rounded-2xl border p-3.5 ${
                        ver.isCurrent
                          ? 'border-[var(--kg-accent)]/40 bg-[var(--kg-accent-soft)]/30'
                          : 'border-[var(--kg-border)] bg-[var(--kg-surface)]'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2.5 py-0.5 rounded-full bg-[var(--kg-primary)] text-white text-xs font-bold font-mono tabular-nums flex-shrink-0">
                            {ver.version}
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-[var(--kg-text)] truncate">
                            {ver.codename}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {ver.isCurrent && (
                            <span className="px-2 py-0.5 rounded-full bg-[var(--kg-accent)] text-white text-[10px] font-bold uppercase tracking-wider">
                              Hiện hành
                            </span>
                          )}
                          <span className="text-xs font-mono tabular-nums text-[var(--kg-text-muted)]">
                            {ver.date}
                          </span>
                        </div>
                      </div>
                      <ul className="space-y-1.5">
                        {ver.highlights.map((hl) => (
                          <li
                            key={hl}
                            className="flex items-start gap-2 text-xs text-[var(--kg-text-muted)] leading-relaxed"
                          >
                            <Layers
                              size={12}
                              className="text-[var(--kg-accent-ink)] mt-0.5 flex-shrink-0"
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

            {/* Clean Native Footer (Zero Text Truncation on 360px) */}
            <div className="px-4 sm:px-5 py-3 border-t border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/75 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="inline-flex items-center gap-1.5 text-xs text-[var(--kg-text-muted)] min-w-0">
                <CheckCircle2 size={14} className="text-[var(--kg-success)] flex-shrink-0" />
                <span className="truncate">
                  Phiên bản <strong className="font-mono tabular-nums text-[var(--kg-text)]">v{APP_VERSION}</strong> • Không tự hiện lại
                </span>
              </div>

              <KgButton
                variant="primary"
                size="sm"
                onClick={handleClose}
                className="px-4 min-h-[38px] font-bold flex-shrink-0"
              >
                Đã hiểu
              </KgButton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
