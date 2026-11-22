import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  FileCheck2,
  Search,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { kgToast } from '../../store/useFeedbackStore';
import {
  ResponsiveShift,
  getPreviewShiftClass,
  getVietnamDateParts,
  normalizeShiftCode,
} from '../../utils/helpers';
import { getSafeDisplayInitial } from '../../utils/shellLayout';
import type { TabId } from '../../types/navigation';
import { KgBottomSheet, KgCard, KgStatusBadge } from '../KgDesignSystem';

export interface OperationalAlertEmployee {
  fullname: string;
  shift: string;
  username?: string;
  position?: string;
  avatarUrl?: string;
  checkinTime?: string;
}

export interface AdminOperationsAlertCardProps {
  notArrived: OperationalAlertEmployee[];
  lateArrived: OperationalAlertEmployee[];
  todayLabel: string;
  activeTab: 'notArrived' | 'lateArrived';
  onActiveTabChange: (tab: 'notArrived' | 'lateArrived') => void;
  onTabChange: (tab: TabId) => void;
  onNavigateHubSubTab: (hub: TabId, subTab: string) => void;
  onOpenAdminMissedModal: () => void;
}

const MOBILE_COLLAPSED_COUNT = 4;
const DESKTOP_COLLAPSED_COUNT = 6;

function normalizeSearchText(val: string): string {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseShiftStartMinutes(shift: string): number {
  const code = normalizeShiftCode(shift);
  const match = code.match(/^(\d{1,2})(?::(\d{2})|[hH])?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(hours) || hours < 0 || hours > 23) {
    return Number.MAX_SAFE_INTEGER;
  }
  return hours * 60 + minutes;
}

function isShiftOverdue(shift: string, nowHour: number, nowMinute: number): boolean {
  const shiftMinutes = parseShiftStartMinutes(shift);
  if (shiftMinutes === Number.MAX_SAFE_INTEGER) return false;
  const nowMinutes = nowHour * 60 + nowMinute;
  // During 00:00-05:59 overnight operational window, afternoon/evening shifts (>= 12:00) belong to yesterday's workday and are overdue.
  if (nowHour < 6 && shiftMinutes >= 12 * 60) {
    return true;
  }
  return nowMinutes > shiftMinutes;
}

async function copyTextSafely(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fallback below */
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function buildReminderClipboardText(
  tab: 'notArrived' | 'lateArrived',
  items: OperationalAlertEmployee[],
  shiftFilter: string,
  todayLabel: string,
): string {
  const headerPrefix =
    tab === 'notArrived'
      ? 'Nhắc chấm công vào ca'
      : 'Danh sách nhân sự đi trễ';
  const filterNote =
    shiftFilter === 'ALL'
      ? ''
      : shiftFilter === 'OVERDUE'
        ? ' • Đã quá giờ ca'
        : ` • Ca ${shiftFilter}`;

  const groups = new Map<string, OperationalAlertEmployee[]>();
  items.forEach((emp) => {
    const key = normalizeShiftCode(emp.shift) || emp.shift;
    const list = groups.get(key) || [];
    list.push(emp);
    groups.set(key, list);
  });

  const sortedKeys = Array.from(groups.keys()).sort(
    (a, b) => parseShiftStartMinutes(a) - parseShiftStartMinutes(b) || a.localeCompare(b, 'vi'),
  );

  const lines: string[] = [`[King's Grill] ${headerPrefix} (${todayLabel}${filterNote}) — ${items.length} nhân sự:`];
  sortedKeys.forEach((code) => {
    const staff = groups.get(code) || [];
    const names = staff
      .map((s) => (tab === 'lateArrived' && s.checkinTime ? `${s.fullname} (${s.checkinTime})` : s.fullname))
      .join(', ');
    lines.push(`• Ca ${code} (${staff.length}): ${names}`);
  });
  return lines.join('\n');
}

export default function AdminOperationsAlertCard({
  notArrived,
  lateArrived,
  todayLabel,
  activeTab,
  onActiveTabChange,
  onTabChange,
  onNavigateHubSubTab,
  onOpenAdminMissedModal,
}: AdminOperationsAlertCardProps) {
  const [shiftFilterByTab, setShiftFilterByTab] = useState<
    Record<'notArrived' | 'lateArrived', string>
  >({ notArrived: 'ALL', lateArrived: 'ALL' });
  const [expandedByTab, setExpandedByTab] = useState<
    Record<'notArrived' | 'lateArrived', boolean>
  >({ notArrived: false, lateArrived: false });
  const [searchByTab, setSearchByTab] = useState<Record<'notArrived' | 'lateArrived', string>>({
    notArrived: '',
    lateArrived: '',
  });
  const [copiedJustNow, setCopiedJustNow] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<OperationalAlertEmployee | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(max-width: 639px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };
    mql.addEventListener('change', handleChange);
    return () => {
      mql.removeEventListener('change', handleChange);
    };
  }, []);

  const vnNow = getVietnamDateParts();
  const effectiveTab: 'notArrived' | 'lateArrived' =
    activeTab === 'lateArrived' && lateArrived.length > 0
      ? 'lateArrived'
      : notArrived.length > 0
        ? 'notArrived'
        : 'lateArrived';

  const expanded = expandedByTab[effectiveTab];
  const searchQuery = searchByTab[effectiveTab];

  const setShiftFilter = (val: string) =>
    setShiftFilterByTab((prev) => ({ ...prev, [effectiveTab]: val }));
  const setExpanded = (updater: boolean | ((prev: boolean) => boolean)) =>
    setExpandedByTab((prev) => ({
      ...prev,
      [effectiveTab]: typeof updater === 'function' ? updater(prev[effectiveTab]) : updater,
    }));
  const setSearchQuery = (val: string) =>
    setSearchByTab((prev) => ({ ...prev, [effectiveTab]: val }));

  useEffect(() => {
    if (!copiedJustNow) return;
    const id = window.setTimeout(() => setCopiedJustNow(false), 1800);
    return () => window.clearTimeout(id);
  }, [copiedJustNow]);

  const rawActiveList = effectiveTab === 'notArrived' ? notArrived : lateArrived;

  const sortedActiveList = useMemo(() => {
    return [...rawActiveList].sort((a, b) => {
      if (effectiveTab === 'notArrived') {
        const overdueDiff =
          Number(isShiftOverdue(b.shift, vnNow.hour, vnNow.minute)) -
          Number(isShiftOverdue(a.shift, vnNow.hour, vnNow.minute));
        if (overdueDiff !== 0) return overdueDiff;
      }
      const timeDiff = parseShiftStartMinutes(a.shift) - parseShiftStartMinutes(b.shift);
      if (timeDiff !== 0) return timeDiff;
      return a.fullname.localeCompare(b.fullname, 'vi');
    });
  }, [rawActiveList, effectiveTab, vnNow.hour, vnNow.minute]);

  const overdueCount = useMemo(() => {
    if (effectiveTab !== 'notArrived') return 0;
    return sortedActiveList.filter((emp) => isShiftOverdue(emp.shift, vnNow.hour, vnNow.minute)).length;
  }, [sortedActiveList, effectiveTab, vnNow.hour, vnNow.minute]);

  const shiftGroups = useMemo(() => {
    const counts = new Map<string, number>();
    sortedActiveList.forEach((emp) => {
      const code = normalizeShiftCode(emp.shift) || emp.shift;
      counts.set(code, (counts.get(code) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort(
        (a, b) => parseShiftStartMinutes(a.code) - parseShiftStartMinutes(b.code) || a.code.localeCompare(b.code, 'vi'),
      );
  }, [sortedActiveList]);

  const rawShiftFilter = shiftFilterByTab[effectiveTab];
  const shiftFilter = useMemo(() => {
    if (rawShiftFilter === 'ALL') return 'ALL';
    if (rawShiftFilter === 'OVERDUE') return overdueCount > 0 ? 'OVERDUE' : 'ALL';
    return shiftGroups.some((g) => g.code === rawShiftFilter) ? rawShiftFilter : 'ALL';
  }, [rawShiftFilter, overdueCount, shiftGroups]);

  const filteredList = useMemo(() => {
    const q = normalizeSearchText(searchQuery);
    return sortedActiveList.filter((emp) => {
      if (shiftFilter === 'OVERDUE') {
        if (!isShiftOverdue(emp.shift, vnNow.hour, vnNow.minute)) return false;
      } else if (shiftFilter !== 'ALL') {
        const code = normalizeShiftCode(emp.shift) || emp.shift;
        if (code !== shiftFilter) return false;
      }
      if (!q) return true;
      const hay = normalizeSearchText(`${emp.fullname} ${emp.position || ''} ${emp.username || ''}`);
      return hay.includes(q);
    });
  }, [sortedActiveList, shiftFilter, searchQuery, vnNow.hour, vnNow.minute]);

  const collapsedLimit = isMobileViewport ? MOBILE_COLLAPSED_COUNT : DESKTOP_COLLAPSED_COUNT;
  const shouldCapCollapsed = shiftFilter === 'ALL' && !expanded && !searchQuery.trim();
  const visibleList = shouldCapCollapsed
    ? filteredList.slice(0, collapsedLimit)
    : filteredList;
  const hiddenCount = Math.max(0, filteredList.length - visibleList.length);
  const totalAlertCount = notArrived.length + lateArrived.length;

  const showShiftStrip =
    sortedActiveList.length > 0 &&
    (shiftGroups.length >= 2 || (overdueCount > 0 && overdueCount < sortedActiveList.length));
  const showSearchInput = expanded && sortedActiveList.length > 8;

  const handleCopyReminder = async () => {
    const targetList = filteredList.length > 0 ? filteredList : sortedActiveList;
    if (targetList.length === 0) return;
    const message = buildReminderClipboardText(effectiveTab, targetList, shiftFilter, todayLabel);
    const ok = await copyTextSafely(message);
    if (ok) {
      setCopiedJustNow(true);
      kgToast(`Đã sao chép ${targetList.length} nhân sự — sẵn sàng dán vào Zalo`, 'success');
    } else {
      kgToast('Không thể truy cập bộ nhớ tạm trên trình duyệt này.', 'warning');
    }
  };

  const handleCopySingleEmployee = async (emp: OperationalAlertEmployee) => {
    const shiftText = normalizeShiftCode(emp.shift) || emp.shift;
    const msg =
      effectiveTab === 'notArrived'
        ? `Nhắc ${emp.fullname}: bạn có ca ${shiftText} hôm nay (${todayLabel}) nhưng hệ thống chưa ghi nhận chấm công vào ca. Vui lòng kiểm tra và chấm công / bổ sung công nhé.`
        : `Lưu ý ${emp.fullname} (ca ${shiftText}): hệ thống ghi nhận bạn vào ca trễ${emp.checkinTime ? ` lúc ${emp.checkinTime}` : ''} ngày ${todayLabel}.`;
    const ok = await copyTextSafely(msg);
    if (ok) {
      kgToast(`Đã sao chép lời nhắc cho ${emp.fullname}`, 'success');
      setSelectedEmployee(null);
    } else {
      kgToast('Không thể sao chép lời nhắc tự động.', 'warning');
    }
  };

  if (totalAlertCount === 0) return null;

  return (
    <KgCard className="kg-animate-fade-up kg-stagger-2 p-3.5 sm:p-5">
      <div id="admin-ops-alerts" className="scroll-mt-20 space-y-3">
        {/* Card Header: Title + Total Count + 1-Tap Manager Utilities */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[var(--kg-border)] pb-3">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${
                notArrived.length > 0
                  ? 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/25 text-[var(--kg-danger)]'
                  : 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/25 text-[var(--kg-warning)]'
              }`}
            >
              <ShieldAlert size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-[15px] font-extrabold text-[var(--kg-text)] tracking-tight">
                  Cảnh báo vận hành hôm nay
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold font-mono tabular-nums ${
                    notArrived.length > 0
                      ? 'bg-[var(--kg-danger)] text-white dark:text-[#23170F]'
                      : 'bg-[var(--kg-warning)] text-white dark:text-[#23170F]'
                  }`}
                >
                  {totalAlertCount}
                </span>
              </div>
              <p className="text-[11px] text-[var(--kg-text-muted)] font-medium mt-0.5 leading-snug">
                {notArrived.length > 0 ? (
                  <>
                    <span className="font-mono tabular-nums font-bold text-[var(--kg-text)]">
                      {notArrived.length}
                    </span>{' '}
                    chưa vào ca
                    {overdueCount > 0 && (
                      <>
                        {' '}
                        •{' '}
                        <span className="font-bold text-[var(--kg-danger)]">
                          <span className="font-mono tabular-nums">{overdueCount}</span> quá giờ
                        </span>
                      </>
                    )}
                    {lateArrived.length > 0 && (
                      <>
                        {' '}
                        •{' '}
                        <span className="font-bold text-[var(--kg-warning)]">
                          <span className="font-mono tabular-nums">{lateArrived.length}</span> đi trễ
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <span className="font-mono tabular-nums font-bold text-[var(--kg-warning)]">
                      {lateArrived.length}
                    </span>{' '}
                    nhân sự đi trễ hôm nay
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyReminder()}
              className="kg-pressable flex-1 sm:flex-none min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-primary-soft)] border border-[var(--kg-border)] hover:border-[var(--kg-primary)]/40 text-xs font-bold text-[var(--kg-text)] inline-flex items-center justify-center gap-1.5 transition-colors touch-manipulation whitespace-nowrap"
            >
              {copiedJustNow ? (
                <Check size={14} className="text-[var(--kg-success)] shrink-0" />
              ) : (
                <Copy size={14} className="text-[var(--kg-primary-ink)] shrink-0" />
              )}
              <span>{copiedJustNow ? 'Đã sao chép' : 'Sao chép nhắc ca'}</span>
            </button>
            <button
              type="button"
              onClick={() => onTabChange('timesheet')}
              className="kg-pressable min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-primary-ink)] inline-flex items-center justify-center gap-1 transition-colors touch-manipulation whitespace-nowrap"
            >
              <span>Bảng công</span>
              <ChevronRight size={14} className="shrink-0" />
            </button>
          </div>
        </div>

        {/* Category Switcher (Segmented Pill Tray when both categories exist, concise strip otherwise) */}
        {notArrived.length > 0 && lateArrived.length > 0 ? (
          <div
            role="tablist"
            aria-label="Phân loại cảnh báo ca trực"
            className="flex items-center gap-1 p-1 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === 'notArrived'}
              onClick={() => onActiveTabChange('notArrived')}
              className={`kg-pressable flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-lg text-xs transition-all duration-150 inline-flex items-center justify-center gap-2 touch-manipulation whitespace-nowrap ${
                effectiveTab === 'notArrived'
                  ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] font-extrabold shadow-xs'
                  : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
              }`}
            >
              <AlertCircle size={14} className="shrink-0" />
              <span>Chưa vào ca</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-mono tabular-nums font-extrabold leading-none ${
                  effectiveTab === 'notArrived'
                    ? 'bg-white/20 dark:bg-black/20 text-current'
                    : 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                }`}
              >
                {notArrived.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={effectiveTab === 'lateArrived'}
              onClick={() => onActiveTabChange('lateArrived')}
              className={`kg-pressable flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-lg text-xs transition-all duration-150 inline-flex items-center justify-center gap-2 touch-manipulation whitespace-nowrap ${
                effectiveTab === 'lateArrived'
                  ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] font-extrabold shadow-xs'
                  : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
              }`}
            >
              <Clock size={14} className="shrink-0" />
              <span>Đi trễ</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-mono tabular-nums font-extrabold leading-none ${
                  effectiveTab === 'lateArrived'
                    ? 'bg-white/20 dark:bg-black/20 text-current'
                    : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                }`}
              >
                {lateArrived.length}
              </span>
            </button>
          </div>
        ) : (
          <div
            className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold ${
              effectiveTab === 'notArrived'
                ? 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/25 text-[var(--kg-danger)]'
                : 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/25 text-[var(--kg-warning)]'
            }`}
          >
            <span className="inline-flex items-center gap-2 min-w-0">
              {effectiveTab === 'notArrived' ? (
                <AlertCircle size={15} className="shrink-0" />
              ) : (
                <Clock size={15} className="shrink-0" />
              )}
              <span className="truncate">
                {effectiveTab === 'notArrived'
                  ? 'Chưa thấy chấm công vào ca'
                  : 'Nhân viên đi trễ hôm nay'}
              </span>
            </span>
            <span className="font-extrabold shrink-0">
              <span className="font-mono tabular-nums">{sortedActiveList.length}</span> người
            </span>
          </div>
        )}

        {/* Shift Group Filter Strip (.kg-filter-pill) */}
        {showShiftStrip && (
          <div
            role="group"
            aria-label="Lọc theo giờ ca"
            className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5"
          >
            <button
              type="button"
              onClick={() => setShiftFilter('ALL')}
              className={`kg-filter-pill kg-pressable min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 touch-manipulation ${
                shiftFilter === 'ALL'
                  ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                  : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              <span>Tất cả</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums leading-none ${
                  shiftFilter === 'ALL'
                    ? 'bg-white/20 dark:bg-black/20 text-current'
                    : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                }`}
              >
                {sortedActiveList.length}
              </span>
            </button>

            {effectiveTab === 'notArrived' &&
              overdueCount > 0 &&
              overdueCount < sortedActiveList.length && (
                <button
                  type="button"
                  onClick={() => setShiftFilter('OVERDUE')}
                  className={`kg-filter-pill kg-pressable min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 touch-manipulation ${
                    shiftFilter === 'OVERDUE'
                      ? 'bg-[var(--kg-danger)] border-[var(--kg-danger)] text-white dark:text-[#23170F]'
                      : 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/30 text-[var(--kg-danger)] hover:brightness-95'
                  }`}
                >
                  <span>Quá giờ</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums leading-none ${
                      shiftFilter === 'OVERDUE'
                        ? 'bg-black/15 text-current'
                        : 'bg-[var(--kg-surface)]/80 text-[var(--kg-danger)]'
                    }`}
                  >
                    {overdueCount}
                  </span>
                </button>
              )}

            {shiftGroups.map((group) => {
              const isSelected = shiftFilter === group.code;
              return (
                <button
                  key={group.code}
                  type="button"
                  onClick={() => setShiftFilter(group.code)}
                  className={`kg-filter-pill kg-pressable min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 touch-manipulation ${
                    isSelected
                      ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                      : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                  }`}
                >
                  <ResponsiveShift shift={group.code} />
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums leading-none ${
                      isSelected
                        ? 'bg-white/20 dark:bg-black/20 text-current'
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                    }`}
                  >
                    {group.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Quick Search Bar (only shown when list is expanded & sizable) */}
        {showSearchInput && (
          <div className="relative">
            <label htmlFor="admin-alert-staff-search" className="sr-only">
              Tìm nhanh nhân sự trong cảnh báo
            </label>
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--kg-text-soft)] pointer-events-none"
            />
            <input
              id="admin-alert-staff-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm nhanh theo tên hoặc bộ phận..."
              className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-11 py-1.5 rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] focus:border-[var(--kg-primary)] text-base sm:text-sm text-[var(--kg-text)] placeholder-[var(--kg-text-soft)] outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-8 sm:h-8 rounded-lg text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center touch-manipulation"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Staff Alert Touch Rows: 1-col crisp rows on Mobile (390px), 2-col on >= 640px */}
        {visibleList.length > 0 ? (
          <div
            key={`${effectiveTab}-${shiftFilter}`}
            className="kg-animate-fade-up grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            {visibleList.map((emp, idx) => {
              const overdue =
                effectiveTab === 'notArrived' && isShiftOverdue(emp.shift, vnNow.hour, vnNow.minute);
              return (
                <button
                  key={`${emp.username || emp.fullname}-${emp.shift}-${idx}`}
                  type="button"
                  onClick={() => setSelectedEmployee(emp)}
                  className="kg-card-interactive kg-pressable group w-full min-h-[56px] text-left rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] hover:border-[var(--kg-primary)]/60 hover:bg-[var(--kg-primary-soft)]/45 px-3 py-2 flex items-center justify-between gap-2.5 transition-colors touch-manipulation"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {emp.avatarUrl ? (
                      <img
                        src={emp.avatarUrl}
                        alt=""
                        className="w-9 h-9 rounded-xl object-cover flex-shrink-0 border border-[var(--kg-border)]"
                      />
                    ) : (
                      <span
                        className={`w-9 h-9 rounded-xl text-xs font-extrabold flex items-center justify-center flex-shrink-0 border ${
                          effectiveTab === 'notArrived'
                            ? overdue
                              ? 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border-[var(--kg-danger)]/25'
                              : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text)] border-[var(--kg-border)]'
                            : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-[var(--kg-warning)]/25'
                        }`}
                      >
                        {getSafeDisplayInitial(emp.fullname, emp.username)}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-[var(--kg-text)] truncate leading-snug">
                        {emp.fullname}
                      </p>
                      <p className="text-[11px] font-medium text-[var(--kg-text-muted)] truncate flex items-center gap-1.5 mt-0.5 leading-none">
                        {emp.position && <span className="truncate">{emp.position}</span>}
                        {emp.position && <span aria-hidden="true">•</span>}
                        {effectiveTab === 'notArrived' ? (
                          <span
                            className={
                              overdue
                                ? 'font-bold text-[var(--kg-danger)]'
                                : 'text-[var(--kg-text-muted)]'
                            }
                          >
                            {overdue ? 'Quá giờ ca' : 'Chưa tới giờ'}
                          </span>
                        ) : (
                          <span className="font-bold text-[var(--kg-warning)]">
                            {emp.checkinTime ? (
                              <>
                                Vào <span className="font-mono tabular-nums">{emp.checkinTime}</span>
                              </>
                            ) : (
                              'Đi trễ'
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-extrabold font-mono tabular-nums ${getPreviewShiftClass(emp.shift)}`}
                    >
                      <ResponsiveShift shift={emp.shift} />
                    </span>
                    <ChevronRight
                      size={14}
                      className="text-[var(--kg-text-soft)] group-hover:text-[var(--kg-primary-ink)] group-hover:translate-x-0.5 transition-transform shrink-0"
                    />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="kg-animate-fade-up rounded-xl border border-dashed border-[var(--kg-border)] bg-[var(--kg-surface-2)] px-4 py-5 text-center text-xs text-[var(--kg-text-muted)]">
            Không tìm thấy nhân sự phù hợp với bộ lọc hiện tại.
          </div>
        )}

        {/* Progressive Disclosure Footer Toggle */}
        {(hiddenCount > 0 || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="kg-pressable w-full min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-primary-soft)] border border-[var(--kg-border)] hover:border-[var(--kg-primary)]/40 text-xs font-extrabold text-[var(--kg-text)] inline-flex items-center justify-center gap-1.5 transition-colors touch-manipulation"
          >
            {expanded ? (
              <>
                <ChevronUp size={15} />
                <span>Thu gọn danh sách</span>
              </>
            ) : (
              <>
                <ChevronDown size={15} />
                <span>
                  Xem thêm{' '}
                  <span className="font-mono tabular-nums text-[var(--kg-primary-ink)]">
                    {hiddenCount}
                  </span>{' '}
                  nhân sự (tổng{' '}
                  <span className="font-mono tabular-nums">{filteredList.length}</span>)
                </span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Staff Quick Action Bottom Sheet */}
      <KgBottomSheet
        isOpen={Boolean(selectedEmployee)}
        onClose={() => setSelectedEmployee(null)}
        title="Chi tiết cảnh báo ca trực"
        subtitle={todayLabel}
      >
        {selectedEmployee && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {selectedEmployee.avatarUrl ? (
                  <img
                    src={selectedEmployee.avatarUrl}
                    alt=""
                    className="w-11 h-11 rounded-2xl object-cover flex-shrink-0 border border-[var(--kg-border)]"
                  />
                ) : (
                  <span className="w-11 h-11 rounded-2xl bg-[var(--kg-primary)] text-[var(--kg-primary-fg)] text-sm font-extrabold flex items-center justify-center flex-shrink-0">
                    {getSafeDisplayInitial(selectedEmployee.fullname, selectedEmployee.username)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-[var(--kg-text)] truncate">
                    {selectedEmployee.fullname}
                  </p>
                  <p className="text-xs text-[var(--kg-text-muted)] truncate mt-0.5">
                    {[
                      selectedEmployee.position || 'Nhân sự ca trực',
                      selectedEmployee.username ? `@${selectedEmployee.username}` : '',
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold font-mono tabular-nums flex-shrink-0 ${getPreviewShiftClass(selectedEmployee.shift)}`}
              >
                {normalizeShiftCode(selectedEmployee.shift) || selectedEmployee.shift}
              </span>
            </div>

            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-[var(--kg-text-muted)]">Trạng thái ca</span>
              {effectiveTab === 'notArrived' ? (
                <KgStatusBadge variant="error">
                  {isShiftOverdue(selectedEmployee.shift, vnNow.hour, vnNow.minute)
                    ? 'Đã quá giờ • Chưa vào ca'
                    : 'Chưa chấm công vào ca'}
                </KgStatusBadge>
              ) : (
                <KgStatusBadge variant="warning">
                  {selectedEmployee.checkinTime
                    ? `Đi trễ • Vào lúc ${selectedEmployee.checkinTime}`
                    : 'Điểm danh vào ca trễ'}
                </KgStatusBadge>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleCopySingleEmployee(selectedEmployee)}
                className="kg-pressable w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-colors touch-manipulation"
              >
                <Copy size={16} />
                <span>Sao chép tin nhắc cá nhân</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedEmployee(null);
                  onTabChange('timesheet');
                }}
                className="kg-pressable group w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-sm font-bold text-[var(--kg-text)] inline-flex items-center justify-between gap-2 transition-colors touch-manipulation"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Clock size={16} className="text-[var(--kg-primary-ink)]" />
                  <span>Mở Bảng công &amp; Nhật ký</span>
                </span>
                <ChevronRight
                  size={16}
                  className="text-[var(--kg-text-muted)] group-hover:translate-x-0.5 transition-transform"
                />
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedEmployee(null);
                  onNavigateHubSubTab('workforce', 'roster');
                }}
                className="kg-pressable group w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-sm font-bold text-[var(--kg-text)] inline-flex items-center justify-between gap-2 transition-colors touch-manipulation"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Users size={16} className="text-[var(--kg-primary-ink)]" />
                  <span>Xem Lịch tổng đội hình</span>
                </span>
                <ChevronRight
                  size={16}
                  className="text-[var(--kg-text-muted)] group-hover:translate-x-0.5 transition-transform"
                />
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedEmployee(null);
                  onOpenAdminMissedModal();
                }}
                className="kg-pressable group w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-sm font-bold text-[var(--kg-text)] inline-flex items-center justify-between gap-2 transition-colors touch-manipulation"
              >
                <span className="inline-flex items-center gap-2.5">
                  <FileCheck2 size={16} className="text-[var(--kg-warning)]" />
                  <span>Duyệt / Mở Bổ sung công</span>
                </span>
                <ChevronRight
                  size={16}
                  className="text-[var(--kg-text-muted)] group-hover:translate-x-0.5 transition-transform"
                />
              </button>
            </div>
          </div>
        )}
      </KgBottomSheet>
    </KgCard>
  );
}
