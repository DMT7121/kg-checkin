import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import { callApi } from '../../services/api';
import { useAppStore, type User } from '../../store/useAppStore';
import { kgToast } from '../../store/useFeedbackStore';
import {
  formatVndCurrency,
  formatVndInput,
  INCIDENT_STATUS_STEPS,
  parseVndAmount,
  type IncidentRecord,
  type IncidentStatus,
} from '../../utils/operationsReconciliation';
import { KgEmptyState, KgErrorState, KgMetricCard, KgSkeleton } from '../KgDesignSystem';

export interface IncidentCenterPanelProps {
  incidents: IncidentRecord[];
  employees?: User[];
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  onIncidentsChange?: (updater: (prev: IncidentRecord[]) => IncidentRecord[]) => void;
  defaultStatusFilter?: 'ALL' | IncidentStatus;
  compact?: boolean;
}

export default function IncidentCenterPanel({
  incidents,
  employees = [],
  loading = false,
  error = '',
  onRefresh,
  onIncidentsChange,
  defaultStatusFilter = 'ALL',
  compact = false,
}: IncidentCenterPanelProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const [incidentFilter, setIncidentFilter] = useState<'ALL' | IncidentStatus>(defaultStatusFilter);
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'urgent' | 'high' | 'normal'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [incidentDrafts, setIncidentDrafts] = useState<
    Record<string, { assignedTo?: string; resolutionNote?: string; repairCost?: string }>
  >({});
  const [updatingIncidentId, setUpdatingIncidentId] = useState<string | null>(null);

  const openCount = useMemo(
    () => incidents.filter((i) => i.status === 'Open').length,
    [incidents],
  );
  const investigatingCount = useMemo(
    () => incidents.filter((i) => i.status === 'Investigating').length,
    [incidents],
  );
  const resolvedCount = useMemo(
    () => incidents.filter((i) => i.status === 'Resolved' || i.status === 'CostRecorded').length,
    [incidents],
  );

  const totalIncidentCost = useMemo(
    () =>
      incidents.reduce((sum, item) => sum + Math.max(0, Math.round(item.repairCost || 0)), 0),
    [incidents],
  );

  const stepCounts = useMemo(() => {
    const map: Record<IncidentStatus, number> = {
      Open: 0,
      Investigating: 0,
      Resolved: 0,
      CostRecorded: 0,
    };
    incidents.forEach((inc) => {
      map[inc.status] = (map[inc.status] || 0) + 1;
    });
    return map;
  }, [incidents]);

  const filteredIncidents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return incidents.filter((inc) => {
      if (incidentFilter !== 'ALL' && inc.status !== incidentFilter) return false;
      if (severityFilter !== 'ALL') {
        const sev = (inc.severity || 'normal').toLowerCase();
        if (sev !== severityFilter) return false;
      }
      if (q) {
        const hay =
          `${inc.area || ''} ${inc.category || ''} ${inc.description || ''} ${inc.fullname || ''} ${inc.username || ''} ${inc.assignedTo || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [incidents, incidentFilter, severityFilter, searchQuery]);

  const handleUpdateIncidentState = async (
    inc: IncidentRecord,
    targetStatus?: IncidentStatus,
  ) => {
    if (!currentUser) return;
    const draft = incidentDrafts[inc.id] || {};
    const nextStatus = targetStatus || inc.status;
    const assignedTo =
      draft.assignedTo !== undefined ? draft.assignedTo.trim() : inc.assignedTo || '';
    const resolutionNote =
      draft.resolutionNote !== undefined ? draft.resolutionNote.trim() : inc.resolutionNote || '';
    const repairCost =
      draft.repairCost !== undefined
        ? Math.max(0, parseVndAmount(draft.repairCost))
        : Math.max(0, inc.repairCost || 0);

    setUpdatingIncidentId(inc.id);
    try {
      const res = await callApi('UPDATE_INCIDENT', {
        role: currentUser.role,
        actorUsername: currentUser.username,
        actorFullname: currentUser.fullname,
        incidentId: inc.id,
        status: nextStatus,
        assignedTo,
        resolutionNote,
        repairCost,
      });

      if (!res) return;
      if (res.ok) {
        onIncidentsChange?.((prev) =>
          prev.map((item) =>
            item.id === inc.id
              ? {
                  ...item,
                  status: nextStatus,
                  assignedTo,
                  resolutionNote,
                  repairCost,
                }
              : item,
          ),
        );
        kgToast('Đã cập nhật tiến độ xử lý sự cố', 'success');
      } else {
        kgToast(res?.message || 'Vui lòng thử lại.', 'error', 'Không thể cập nhật');
      }
    } finally {
      setUpdatingIncidentId(null);
    }
  };

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KgMetricCard
            title="1. Mới báo"
            value={openCount}
            icon={AlertTriangle}
            variant="error"
            subtext="Chờ tiếp nhận"
            onClick={() => setIncidentFilter('Open')}
            className={incidentFilter === 'Open' ? 'ring-2 ring-[var(--kg-primary)] !border-[var(--kg-primary)]' : ''}
          />
          <KgMetricCard
            title="2. Đang xử lý"
            value={investigatingCount}
            icon={Wrench}
            variant="warning"
            subtext="Đang khắc phục"
            onClick={() => setIncidentFilter('Investigating')}
            className={incidentFilter === 'Investigating' ? 'ring-2 ring-[var(--kg-primary)] !border-[var(--kg-primary)]' : ''}
          />
          <KgMetricCard
            title="3. Đã khắc phục"
            value={resolvedCount}
            icon={CheckCircle2}
            variant="success"
            subtext="Đã xử lý / chốt chi phí"
            onClick={() => setIncidentFilter('Resolved')}
            className={incidentFilter === 'Resolved' ? 'ring-2 ring-[var(--kg-primary)] !border-[var(--kg-primary)]' : ''}
          />
          <KgMetricCard
            title="Tổng chi phí sửa chữa"
            value={formatVndCurrency(totalIncidentCost)}
            icon={Coins}
            variant="info"
            subtext={`${incidents.length} sự cố ghi nhận`}
            onClick={() => setIncidentFilter('ALL')}
            className={incidentFilter === 'ALL' ? 'ring-2 ring-[var(--kg-primary)] !border-[var(--kg-primary)]' : ''}
          />
        </div>
      )}

      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--kg-border)] pb-3">
          <div className="min-w-0">
            <h3 className="font-extrabold text-[var(--kg-text)] text-sm sm:text-base">
              Trung tâm Quản lý Sự cố Nhà hàng (4 bước)
            </h3>
            <p className="text-xs text-[var(--kg-text-muted)]">
              Mới báo ➔ Đang kiểm tra / xử lý ➔ Đã khắc phục ➔ Đã chốt chi phí bảo trì
            </p>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 sm:flex-wrap sm:overflow-visible">
            <button
              type="button"
              onClick={() => setIncidentFilter('ALL')}
              className={`kg-filter-pill min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                incidentFilter === 'ALL'
                  ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                  : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              <span>Tất cả</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-extrabold ${
                  incidentFilter === 'ALL'
                    ? 'bg-[var(--kg-nav-active-fg)]/15 text-[var(--kg-nav-active-fg)]'
                    : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                }`}
              >
                {incidents.length}
              </span>
            </button>
            {INCIDENT_STATUS_STEPS.map((step) => {
              const active = incidentFilter === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setIncidentFilter(step.id)}
                  className={`kg-filter-pill min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    active
                      ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                      : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                  }`}
                >
                  <span>{step.shortLabel}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-extrabold ${
                      active
                        ? 'bg-[var(--kg-nav-active-fg)]/15 text-[var(--kg-nav-active-fg)]'
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                    }`}
                  >
                    {stepCounts[step.id]}
                  </span>
                </button>
              );
            })}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                aria-label="Làm mới danh sách sự cố"
                title="Làm mới danh sách sự cố"
                className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] shrink-0"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        </div>

        {/* Search + Severity Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px] gap-2">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm khu vực, hạng mục, người báo, kỹ thuật viên..."
              aria-label="Tìm sự cố"
              className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-10 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-base sm:text-xs text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm sự cố"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-lg text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface)]"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            value={severityFilter}
            onChange={(e) =>
              setSeverityFilter(e.target.value as 'ALL' | 'urgent' | 'high' | 'normal')
            }
            aria-label="Lọc mức độ nghiêm trọng sự cố"
            className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-base sm:text-xs font-bold text-[var(--kg-text)]"
          >
            <option value="ALL">Tất cả mức độ</option>
            <option value="urgent">Khẩn cấp</option>
            <option value="high">Quan trọng</option>
            <option value="normal">Bình thường</option>
          </select>
        </div>

        {error && (
          <KgErrorState
            title="Không thể tải danh sách sự cố"
            description={error}
            onRetry={onRefresh}
          />
        )}

        {loading && incidents.length === 0 ? (
          <div className="space-y-3">
            <KgSkeleton className="h-32 w-full" />
            <KgSkeleton className="h-32 w-full" />
          </div>
        ) : filteredIncidents.length === 0 ? (
          <KgEmptyState
            icon={ShieldAlert}
            title="Không có sự cố nào"
            description="Không ghi nhận sự cố nào khớp bộ lọc trạng thái và mức độ hiện tại."
          />
        ) : (
          <div className="space-y-3">
            {filteredIncidents.map((inc) => {
              const draft = incidentDrafts[inc.id] || {};
              const assignedVal = draft.assignedTo ?? inc.assignedTo ?? '';
              const resolutionVal = draft.resolutionNote ?? inc.resolutionNote ?? '';
              const costVal =
                draft.repairCost !== undefined
                  ? draft.repairCost
                  : inc.repairCost && inc.repairCost > 0
                    ? formatVndInput(inc.repairCost)
                    : '';
              const isBusy = updatingIncidentId === inc.id;

              return (
                <div
                  key={inc.id}
                  className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] text-xs font-black text-[var(--kg-text)]">
                          {inc.area || 'Toàn quán'}
                        </span>
                        <span className="text-sm font-black text-[var(--kg-text)]">
                          {inc.category}
                        </span>
                        {inc.severity === 'urgent' && (
                          <span className="px-2 py-0.5 rounded-md bg-[var(--kg-danger)] text-white dark:text-[#0D1015] text-[10px] font-black">
                            KHẨN CẤP
                          </span>
                        )}
                        {inc.severity === 'high' && (
                          <span className="px-2 py-0.5 rounded-md bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/25 text-[10px] font-black">
                            QUAN TRỌNG
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--kg-text-muted)]">
                        Báo bởi <b className="text-[var(--kg-text)]">{inc.fullname || inc.username}</b> •{' '}
                        {inc.shift || 'Ca trực'} • <span className="font-mono tabular-nums">{inc.date}</span>
                      </p>
                    </div>

                    {inc.photoUrl && (
                      <a
                        href={inc.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-[var(--kg-primary-ink)] underline"
                      >
                        Xem ảnh hiện trường
                      </a>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-[var(--kg-text)] bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl p-3">
                    {inc.description}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {INCIDENT_STATUS_STEPS.map((step) => {
                      const active = inc.status === step.id;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleUpdateIncidentState(inc, step.id)}
                          className={`min-h-[44px] sm:min-h-[38px] py-2 px-2.5 rounded-xl border text-xs font-extrabold leading-tight text-center transition-colors ${
                            active
                              ? step.badgeClass
                              : 'border-[var(--kg-border)] bg-[var(--kg-surface)] text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)]'
                          }`}
                        >
                          {step.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(240px,1fr)] gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-[var(--kg-text-muted)] mb-1">
                        Người xử lý / Kỹ thuật viên
                      </label>
                      <input
                        type="text"
                        list="ops-staff-suggestions"
                        value={assignedVal}
                        onChange={(e) =>
                          setIncidentDrafts((prev) => ({
                            ...prev,
                            [inc.id]: { ...prev[inc.id], assignedTo: e.target.value },
                          }))
                        }
                        placeholder="Chọn NV hoặc nhập tên thợ..."
                        className="w-full min-h-[44px] sm:min-h-[38px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2 text-base sm:text-xs text-[var(--kg-text)]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-[var(--kg-text-muted)] mb-1">
                        Ghi chú biện pháp khắc phục
                      </label>
                      <input
                        type="text"
                        value={resolutionVal}
                        onChange={(e) =>
                          setIncidentDrafts((prev) => ({
                            ...prev,
                            [inc.id]: { ...prev[inc.id], resolutionNote: e.target.value },
                          }))
                        }
                        placeholder="VD: Đã thay cảm biến nhiệt / Gọi bảo hành..."
                        className="w-full min-h-[44px] sm:min-h-[38px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2 text-base sm:text-xs text-[var(--kg-text)]"
                      />
                    </div>

                    <div className="flex items-end gap-2 md:col-span-2 xl:col-span-1">
                      <div className="flex-1 min-w-0">
                        <label className="block text-[10px] font-bold uppercase text-[var(--kg-text-muted)] mb-1">
                          Chi phí sửa chữa (VNĐ)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={costVal}
                          onChange={(e) =>
                            setIncidentDrafts((prev) => ({
                              ...prev,
                              [inc.id]: {
                                ...prev[inc.id],
                                repairCost: formatVndInput(e.target.value),
                              },
                            }))
                          }
                          placeholder="0"
                          className="w-full min-h-[44px] sm:min-h-[38px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2 text-right font-mono tabular-nums font-bold text-base sm:text-xs text-[var(--kg-text)]"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleUpdateIncidentState(inc)}
                        className="min-h-[44px] sm:min-h-[38px] min-w-[84px] px-4 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-xs font-extrabold shrink-0 whitespace-nowrap disabled:opacity-50"
                      >
                        {isBusy ? 'Lưu...' : 'Lưu'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {employees.length > 0 && (
              <datalist id="ops-staff-suggestions">
                {employees.map((emp) => (
                  <option key={emp.username} value={emp.fullname} />
                ))}
              </datalist>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
