import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCheck,
  Clock3,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import { callApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { kgConfirm, kgToast } from '../../store/useFeedbackStore';
import {
  formatSignedVnd,
  formatVndCurrency,
  type HandoverLedgerRecord,
} from '../../utils/operationsReconciliation';
import { KgEmptyState, KgErrorState, KgMetricCard, KgSkeleton } from '../KgDesignSystem';

export interface CashAuditPanelProps {
  handovers: HandoverLedgerRecord[];
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onHandoversChange?: (updater: (prev: HandoverLedgerRecord[]) => HandoverLedgerRecord[]) => void;
  defaultFilter?: 'ALL' | 'ATTENTION' | 'CONFIRMED';
  compact?: boolean;
}

function normalizeHandoverDateToIso(raw: string | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return s;
}

function isDiscrepancyOrDisputed(h: HandoverLedgerRecord): boolean {
  return (
    h.reconcileStatus !== 'ManagerConfirmed' &&
    ((h.discrepancy ?? 0) !== 0 ||
      h.ackStatus === 'Disputed' ||
      h.reconcileStatus === 'Disputed')
  );
}

export default function CashAuditPanel({
  handovers,
  loading = false,
  error = '',
  onRefresh,
  onHandoversChange,
  defaultFilter = 'ALL',
  compact = false,
}: CashAuditPanelProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const [cashFilter, setCashFilter] = useState<'ALL' | 'ATTENTION' | 'CONFIRMED'>(defaultFilter);
  const [cashSearchQuery, setCashSearchQuery] = useState('');
  const [cashDateFilter, setCashDateFilter] = useState('');
  const [cashSort, setCashSort] = useState<'default' | 'discrepancy_desc' | 'severity'>('severity');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [managerNotes, setManagerNotes] = useState<Record<string, string>>({});
  const [unlockedHandoverIds, setUnlockedHandoverIds] = useState<Record<string, boolean>>({});
  const [reviewingHandoverId, setReviewingHandoverId] = useState<string | null>(null);

  const cashAttentionCount = useMemo(
    () => handovers.filter(isDiscrepancyOrDisputed).length,
    [handovers],
  );

  const cashUnconfirmedCount = useMemo(
    () => handovers.filter((h) => h.reconcileStatus !== 'ManagerConfirmed').length,
    [handovers],
  );

  const cashConfirmedCount = useMemo(
    () => handovers.filter((h) => h.reconcileStatus === 'ManagerConfirmed').length,
    [handovers],
  );

  const matchedUnconfirmedHandovers = useMemo(
    () =>
      handovers.filter(
        (h) =>
          h.reconcileStatus !== 'ManagerConfirmed' &&
          (h.discrepancy ?? 0) === 0 &&
          h.ackStatus !== 'Disputed' &&
          h.reconcileStatus !== 'Disputed',
      ),
    [handovers],
  );

  const filteredHandovers = useMemo(() => {
    const q = cashSearchQuery.trim().toLowerCase();
    const list = handovers.filter((h) => {
      if (cashFilter === 'ATTENTION') {
        if (h.reconcileStatus === 'ManagerConfirmed') return false;
      } else if (cashFilter === 'CONFIRMED' && h.reconcileStatus !== 'ManagerConfirmed') {
        return false;
      }

      if (cashDateFilter && normalizeHandoverDateToIso(h.date) !== cashDateFilter) {
        return false;
      }

      if (q) {
        const hay =
          `${h.fullname || ''} ${h.username || ''} ${h.shift || ''} ${h.note || ''} ${h.ackBy || ''} ${h.date || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (cashSort === 'default') return list;

    return [...list].sort((a, b) => {
      if (cashSort === 'discrepancy_desc') {
        return Math.abs(b.discrepancy ?? 0) - Math.abs(a.discrepancy ?? 0);
      }
      const rank = (item: HandoverLedgerRecord) => {
        if (item.reconcileStatus !== 'ManagerConfirmed' && (item.ackStatus === 'Disputed' || item.reconcileStatus === 'Disputed')) return 0;
        if (item.reconcileStatus !== 'ManagerConfirmed' && (item.discrepancy ?? 0) !== 0) return 1;
        if (item.reconcileStatus !== 'ManagerConfirmed') return 2;
        return 3;
      };
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      return Math.abs(b.discrepancy ?? 0) - Math.abs(a.discrepancy ?? 0);
    });
  }, [handovers, cashFilter, cashDateFilter, cashSearchQuery, cashSort]);

  const handleManagerReviewHandover = async (
    item: HandoverLedgerRecord,
    decision: 'CONFIRM' | 'DISPUTE',
  ) => {
    if (!currentUser) return;
    const note = (managerNotes[item.id] ?? item.managerNote ?? '').trim();
    if (decision === 'DISPUTE' && note.length < 4) {
      kgToast('Vui lòng nhập nội dung cần thu ngân giải trình thêm.', 'warning', 'Cần ghi chú yêu cầu');
      return;
    }

    setReviewingHandoverId(item.id);
    try {
      const res = await callApi('REVIEW_HANDOVER', {
        role: currentUser.role,
        actorUsername: currentUser.username,
        actorFullname: currentUser.fullname,
        handoverId: item.id,
        decision,
        managerNote: note,
        instantEdge: true,
      }, { background: true });
      if (!res) return;
      if (res.ok) {
        const nextStatus = decision === 'DISPUTE' ? 'Disputed' : 'ManagerConfirmed';
        onHandoversChange?.((prev) =>
          prev.map((h) =>
            h.id === item.id
              ? {
                  ...h,
                  reconcileStatus: nextStatus,
                  managerBy: currentUser.fullname || currentUser.username,
                  managerAt: new Date().toLocaleString('vi-VN'),
                  managerNote: note,
                }
              : h,
          ),
        );
        setUnlockedHandoverIds((prev) => {
          if (!prev[item.id]) return prev;
          const copy = { ...prev };
          delete copy[item.id];
          return copy;
        });
        kgToast(
          decision === 'DISPUTE' ? 'Đã gửi yêu cầu giải trình két' : 'Đã duyệt chốt đối soát két',
          'success',
        );
      } else {
        kgToast(res?.message || 'Vui lòng thử lại.', 'error', 'Không thể cập nhật');
      }
    } finally {
      setReviewingHandoverId(null);
    }
  };

  const handleBulkConfirmMatchedHandovers = async () => {
    if (!currentUser || matchedUnconfirmedHandovers.length === 0 || bulkProgress) return;
    const confirmed = await kgConfirm({
      title: 'Duyệt tất cả ca khớp két?',
      message: `Xác nhận duyệt ${matchedUnconfirmedHandovers.length} ca bàn giao không có chênh lệch và chưa bị khiếu nại?`,
      confirmLabel: `Duyệt ${matchedUnconfirmedHandovers.length} ca`,
      cancelLabel: 'Hủy',
      tone: 'primary',
    });
    if (!confirmed) return;

    const total = matchedUnconfirmedHandovers.length;
    setBulkProgress({ done: 0, total });
    try {
      const confirmedIds = new Set<string>();
      for (let i = 0; i < matchedUnconfirmedHandovers.length; i += 1) {
        const item = matchedUnconfirmedHandovers[i];
        const note = (managerNotes[item.id] ?? item.managerNote ?? '').trim();
        const res = await callApi(
          'REVIEW_HANDOVER',
          {
            role: currentUser.role,
            actorUsername: currentUser.username,
            actorFullname: currentUser.fullname,
            handoverId: item.id,
            decision: 'CONFIRM',
            managerNote: note,
          },
          { background: true },
        );
        if (res?.ok) {
          confirmedIds.add(item.id);
        }
        setBulkProgress({ done: i + 1, total });
      }
      if (confirmedIds.size > 0) {
        onHandoversChange?.((prev) =>
          prev.map((h) =>
            confirmedIds.has(h.id)
              ? {
                  ...h,
                  reconcileStatus: 'ManagerConfirmed',
                  managerBy: currentUser.fullname || currentUser.username,
                  managerAt: new Date().toLocaleString('vi-VN'),
                }
              : h,
          ),
        );
      }
      kgToast(
        `Đã duyệt ${confirmedIds.size}/${total} ca khớp két`,
        confirmedIds.size === total ? 'success' : 'warning',
      );
    } finally {
      setBulkProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KgMetricCard
            title="Tổng ca ghi nhận"
            value={handovers.length}
            icon={Banknote}
            variant="info"
            subtext="Tất cả ca bàn giao"
            onClick={() => setCashFilter('ALL')}
            className={cashFilter === 'ALL' ? 'ring-2 ring-[var(--kg-primary)] !border-[var(--kg-primary)]' : ''}
          />
          <KgMetricCard
            title="Chờ đối soát / chốt"
            value={cashUnconfirmedCount}
            icon={Clock3}
            variant="warning"
            subtext={`${cashAttentionCount} lệch · ${matchedUnconfirmedHandovers.length} khớp`}
            onClick={() => setCashFilter('ATTENTION')}
            className={cashFilter === 'ATTENTION' ? 'ring-2 ring-[var(--kg-primary)] !border-[var(--kg-primary)]' : ''}
          />
          <KgMetricCard
            title="Lệch / Báo khiếu nại"
            value={cashAttentionCount}
            icon={AlertTriangle}
            variant="error"
            subtext="Cần giải trình ngay"
            onClick={() => setCashFilter('ATTENTION')}
          />
          <KgMetricCard
            title="Quản lý đã chốt"
            value={cashConfirmedCount}
            icon={ShieldCheck}
            variant="success"
            subtext="Đã khóa xác nhận"
            onClick={() => setCashFilter('CONFIRMED')}
            className={cashFilter === 'CONFIRMED' ? 'ring-2 ring-[var(--kg-primary)] !border-[var(--kg-primary)]' : ''}
          />
        </div>
      )}

      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--kg-border)] pb-3">
          <div className="min-w-0">
            <h3 className="font-extrabold text-[var(--kg-text)] text-sm sm:text-base">
              Đối soát Két Thu ngân 2 chiều
            </h3>
            <p className="text-xs text-[var(--kg-text-muted)]">
              Kiểm tra công thức POS CukCuk, xác nhận ca nhận két và chốt giải trình thu chi
            </p>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 sm:flex-wrap sm:overflow-visible">
            {(
              [
                ['ALL', 'Tất cả', handovers.length],
                ['ATTENTION', 'Cần đối soát', cashUnconfirmedCount],
                ['CONFIRMED', 'Đã chốt', cashConfirmedCount],
              ] as const
            ).map(([id, label, count]) => {
              const active = cashFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCashFilter(id)}
                  className={`kg-filter-pill min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    active
                      ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                      : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                  }`}
                >
                  <span>{label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-extrabold ${
                      active
                        ? 'bg-[var(--kg-nav-active-fg)]/15 text-[var(--kg-nav-active-fg)]'
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
            {matchedUnconfirmedHandovers.length > 0 && (
              <button
                type="button"
                disabled={Boolean(bulkProgress)}
                onClick={() => void handleBulkConfirmMatchedHandovers()}
                className="min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl bg-[var(--kg-success)] hover:brightness-95 text-white dark:text-[#0D1F16] text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50 whitespace-nowrap"
              >
                <CheckCheck size={14} className="shrink-0" />
                {bulkProgress
                  ? `Đang duyệt ${bulkProgress.done}/${bulkProgress.total}...`
                  : `Duyệt ca khớp (${matchedUnconfirmedHandovers.length})`}
              </button>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                aria-label="Làm mới sổ két"
                title="Làm mới sổ két"
                className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] shrink-0"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] pointer-events-none"
            />
            <input
              type="text"
              value={cashSearchQuery}
              onChange={(e) => setCashSearchQuery(e.target.value)}
              placeholder="Tìm thu ngân, ca, ghi chú..."
              aria-label="Tìm bản ghi đối soát két"
              className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-10 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-base sm:text-xs font-medium text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
            />
            {cashSearchQuery && (
              <button
                type="button"
                onClick={() => setCashSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm két"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-lg text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface)]"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            <input
              type="date"
              value={cashDateFilter}
              onChange={(e) => setCashDateFilter(e.target.value)}
              aria-label="Lọc theo ngày bàn giao két"
              className="flex-1 min-w-0 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-base sm:text-xs font-mono tabular-nums text-[var(--kg-text)]"
            />
            {cashDateFilter && (
              <button
                type="button"
                onClick={() => setCashDateFilter('')}
                className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] whitespace-nowrap shrink-0"
              >
                Xóa ngày
              </button>
            )}
          </div>

          <select
            value={cashSort}
            onChange={(e) =>
              setCashSort(e.target.value as 'default' | 'discrepancy_desc' | 'severity')
            }
            aria-label="Sắp xếp đối soát két"
            className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-base sm:text-xs font-bold text-[var(--kg-text)]"
          >
            <option value="severity">Ưu tiên: Mức độ nghiêm trọng</option>
            <option value="discrepancy_desc">Ưu tiên: Chênh lệch lớn nhất</option>
            <option value="default">Sắp xếp: Mới nhất</option>
          </select>
        </div>

        {error && (
          <KgErrorState
            title="Không thể tải sổ đối soát két"
            description={error}
            onRetry={onRefresh}
          />
        )}

        {loading && handovers.length === 0 ? (
          <div className="space-y-3">
            <KgSkeleton className="h-32 w-full" />
            <KgSkeleton className="h-32 w-full" />
          </div>
        ) : filteredHandovers.length === 0 ? (
          <KgEmptyState
            icon={ShieldCheck}
            title="Không có bản ghi đối soát két"
            description="Không có ca bàn giao nào khớp bộ lọc hiện tại."
          />
        ) : (
          <div className="space-y-3">
            {filteredHandovers.map((item) => {
              const diff = item.discrepancy ?? 0;
              const isBusy = reviewingHandoverId === item.id;
              const isConfirmed = item.reconcileStatus === 'ManagerConfirmed';
              const isUnlockedForEdit = Boolean(unlockedHandoverIds[item.id]);
              const isLockedReadOnly = isConfirmed && !isUnlockedForEdit;
              const hasAttention = isDiscrepancyOrDisputed(item);
              const noteValue = managerNotes[item.id] ?? item.managerNote ?? '';

              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border p-4 space-y-3 transition-colors ${
                    isConfirmed
                      ? 'border-[var(--kg-success)]/30 bg-[var(--kg-success-soft)]/35'
                      : hasAttention
                        ? 'border-[var(--kg-warning)]/45 bg-[var(--kg-warning-soft)]/45'
                        : 'border-[var(--kg-border)] bg-[var(--kg-surface-2)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] font-mono tabular-nums">
                        {item.shift || 'Ca trực'} • {item.date}
                      </span>
                      <span className="text-xs font-bold text-[var(--kg-text)]">
                        Giao bởi: <b>{item.fullname || item.username}</b>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.ackStatus === 'Disputed' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/25">
                          <AlertTriangle size={12} /> Ca nhận báo lệch ({item.ackBy})
                        </span>
                      ) : item.ackBy ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[var(--kg-success-soft)] text-[var(--kg-success)] border border-[var(--kg-success)]/25">
                          <CheckCheck size={12} /> Đã nhận đủ: {item.ackBy}
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)]">
                          Chưa có ca sau xác nhận
                        </span>
                      )}

                      {isConfirmed && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[var(--kg-success)] text-white dark:text-[#0D1F16]">
                          <Lock size={11} /> Đã duyệt chốt
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 text-right font-mono tabular-nums text-xs">
                    <div className="rounded-xl bg-[var(--kg-surface)] p-2.5 border border-[var(--kg-border)]">
                      <span className="block text-left font-sans text-[10px] text-[var(--kg-text-muted)]">
                        Quỹ đầu ca
                      </span>
                      <span className="font-bold text-[var(--kg-text)]">
                        {formatVndCurrency(item.openingCash ?? item.cashAmount)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[var(--kg-surface)] p-2.5 border border-[var(--kg-border)]">
                      <span className="block text-left font-sans text-[10px] text-[var(--kg-text-muted)]">
                        + Thu POS
                      </span>
                      <span className="font-bold text-[var(--kg-success)]">
                        {formatVndCurrency(item.posCashRevenue ?? 0)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[var(--kg-surface)] p-2.5 border border-[var(--kg-border)]">
                      <span className="block text-left font-sans text-[10px] text-[var(--kg-text-muted)]">
                        - Chi quầy
                      </span>
                      <span className="font-bold text-[var(--kg-danger)]">
                        {formatVndCurrency(item.cashExpense ?? 0)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[var(--kg-surface)] p-2.5 border border-[var(--kg-border)]">
                      <span className="block text-left font-sans text-[10px] text-[var(--kg-text-muted)]">
                        = Lý thuyết
                      </span>
                      <span className="font-bold text-[var(--kg-text)]">
                        {formatVndCurrency(item.expectedCash ?? item.cashAmount)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[var(--kg-surface)] p-2.5 border border-[var(--kg-border)]">
                      <span className="block text-left font-sans text-[10px] text-[var(--kg-text-muted)]">
                        Thực bàn giao
                      </span>
                      <span className="font-black text-[var(--kg-text)]">
                        {formatVndCurrency(item.closingCash ?? item.cashAmount)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[var(--kg-surface)] p-2.5 border border-[var(--kg-border)]">
                      <span className="block text-left font-sans text-[10px] text-[var(--kg-text-muted)]">
                        Chênh lệch
                      </span>
                      <span
                        className={`font-black ${
                          diff === 0
                            ? 'text-[var(--kg-success)]'
                            : diff < 0
                              ? 'text-[var(--kg-danger)]'
                              : 'text-[var(--kg-warning)]'
                        }`}
                      >
                        {formatSignedVnd(diff)}
                      </span>
                    </div>
                  </div>

                  {(item.note || item.ackNote) && (
                    <div className="space-y-1 text-xs">
                      {item.note && (
                        <p className="text-[var(--kg-text-muted)]">
                          <b className="text-[var(--kg-text)]">Ghi chú ca giao:</b> {item.note}
                        </p>
                      )}
                      {item.ackNote && (
                        <p className="text-[var(--kg-danger)]">
                          <b>
                            Phản hồi ca nhận
                            {item.countedCash !== undefined
                              ? ` (đếm thực tế ${formatVndCurrency(item.countedCash)})`
                              : ''}
                            :
                          </b>{' '}
                          {item.ackNote}
                        </p>
                      )}
                    </div>
                  )}

                  {isLockedReadOnly ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t border-[var(--kg-success)]/25">
                      <div className="flex items-start gap-2 min-w-0 text-xs">
                        <ShieldCheck size={16} className="text-[var(--kg-success)] shrink-0 mt-0.5" />
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-extrabold text-[var(--kg-text)]">
                            Đã khóa xác nhận bởi {item.managerBy || 'Quản lý'}
                            {item.managerAt ? (
                              <span className="ml-1.5 font-mono tabular-nums font-semibold text-[11px] text-[var(--kg-text-muted)]">
                                · {item.managerAt}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-[var(--kg-text-muted)] break-words">
                            {item.managerNote?.trim()
                              ? `Kết luận: ${item.managerNote}`
                              : 'Số liệu đã đối soát khớp và được quản lý khóa sổ.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setUnlockedHandoverIds((prev) => ({ ...prev, [item.id]: true }))
                        }
                        className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl border border-[var(--kg-border-strong)] bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] text-xs font-extrabold text-[var(--kg-text)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Unlock size={14} className="shrink-0 text-[var(--kg-primary-ink)]" />
                        <span>Mở khóa điều chỉnh</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2.5 border-t border-[var(--kg-border)]">
                      <input
                        type="text"
                        value={noteValue}
                        onChange={(e) =>
                          setManagerNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder="Kết luận đối soát của Quản lý (VD: Đã khớp phiếu chi mua đá)..."
                        aria-label={`Kết luận đối soát ca ${item.shift} ngày ${item.date}`}
                        className="flex-1 min-w-0 min-h-[44px] sm:min-h-[38px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2 text-base sm:text-xs text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
                      />
                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0">
                        {isConfirmed && isUnlockedForEdit && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              setUnlockedHandoverIds((prev) => {
                                const copy = { ...prev };
                                delete copy[item.id];
                                return copy;
                              })
                            }
                            className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] whitespace-nowrap"
                          >
                            Khóa lại
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleManagerReviewHandover(item, 'DISPUTE')}
                          className="flex-1 sm:flex-none min-w-[136px] min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl border border-[var(--kg-warning)]/35 bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] text-xs font-bold hover:brightness-95 disabled:opacity-50 whitespace-nowrap"
                        >
                          Yêu cầu giải trình
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleManagerReviewHandover(item, 'CONFIRM')}
                          className="flex-1 sm:flex-none min-w-[124px] min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-[var(--kg-success)] hover:brightness-95 text-white dark:text-[#0D1F16] text-xs font-extrabold disabled:opacity-50 whitespace-nowrap"
                        >
                          {isBusy ? 'Đang lưu...' : 'Duyệt chốt két'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
