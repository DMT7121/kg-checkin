import { useMemo, useState } from 'react';
import { RefreshCw, Search, ShieldAlert, X } from 'lucide-react';
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
import { KgEmptyState, KgErrorState, KgSkeleton } from '../KgDesignSystem';

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

  const totalIncidentCost = useMemo(
    () =>
      incidents.reduce((sum, item) => sum + Math.max(0, Math.round(item.repairCost || 0)), 0),
    [incidents],
  );

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
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-bold text-rose-600 dark:text-rose-400">1. Mới báo</p>
            <p className="mt-2 text-2xl font-black font-mono tabular-nums text-rose-600 dark:text-rose-400">
              {incidents.filter((i) => i.status === 'Open').length}
            </p>
          </div>
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400">2. Đang xử lý</p>
            <p className="mt-2 text-2xl font-black font-mono tabular-nums text-amber-600 dark:text-amber-400">
              {incidents.filter((i) => i.status === 'Investigating').length}
            </p>
          </div>
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-bold text-[var(--kg-primary-ink)]">3. Đã khắc phục</p>
            <p className="mt-2 text-2xl font-black font-mono tabular-nums text-[var(--kg-primary-ink)]">
              {incidents.filter((i) => i.status === 'Resolved' || i.status === 'CostRecorded').length}
            </p>
          </div>
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs">
            <p className="text-xs font-bold text-[var(--kg-text-muted)]">Tổng chi phí sửa chữa</p>
            <p className="mt-2 text-xl font-black font-mono tabular-nums text-[var(--kg-text)]">
              {formatVndCurrency(totalIncidentCost)}
            </p>
          </div>
        </div>
      )}

      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kg-border)] pb-3">
          <div>
            <h3 className="font-extrabold text-[var(--kg-text)] text-sm sm:text-base">
              Trung tâm Quản lý Sự cố Nhà hàng (4 bước)
            </h3>
            <p className="text-xs text-[var(--kg-text-muted)]">
              Mới báo ➔ Đang kiểm tra / xử lý ➔ Đã khắc phục ➔ Đã chốt chi phí bảo trì
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIncidentFilter('ALL')}
              className={`min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                incidentFilter === 'ALL'
                  ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                  : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              Tất cả ({incidents.length})
            </button>
            {INCIDENT_STATUS_STEPS.map((step) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setIncidentFilter(step.id)}
                className={`min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  incidentFilter === step.id
                    ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                    : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                {step.shortLabel}
              </button>
            ))}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                aria-label="Làm mới danh sách sự cố"
                title="Làm mới danh sách sự cố"
                className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] inline-flex items-center justify-center rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
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
              className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-8 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-base sm:text-xs text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm sự cố"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
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
            className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-base sm:text-xs font-bold text-[var(--kg-text)]"
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
                  className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-[var(--kg-surface-soft)] text-xs font-black text-[var(--kg-text)]">
                          {inc.area || 'Toàn quán'}
                        </span>
                        <span className="text-sm font-black text-[var(--kg-text)]">
                          {inc.category}
                        </span>
                        {inc.severity === 'urgent' && (
                          <span className="px-2 py-0.5 rounded bg-[var(--kg-danger)] text-white dark:text-[#0D1015] text-[10px] font-black">
                            KHẨN CẤP
                          </span>
                        )}
                        {inc.severity === 'high' && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] font-black">
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

                  <p className="text-xs sm:text-sm text-[var(--kg-text)] bg-[var(--kg-surface-soft)] rounded-xl p-3">
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
                          className={`min-h-[44px] sm:min-h-[36px] py-2 px-2.5 rounded-xl border text-xs font-extrabold transition-colors ${
                            active
                              ? step.badgeClass
                              : 'border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)]'
                          }`}
                        >
                          {step.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
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
                        className="w-full min-h-[44px] sm:min-h-[38px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-base sm:text-xs text-[var(--kg-text)]"
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
                        className="w-full min-h-[44px] sm:min-h-[38px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-base sm:text-xs text-[var(--kg-text)]"
                      />
                    </div>

                    <div className="flex items-end gap-2">
                      <div className="flex-1">
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
                          className="w-full min-h-[44px] sm:min-h-[38px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 py-2 text-right font-mono tabular-nums font-bold text-base sm:text-xs text-[var(--kg-text)]"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleUpdateIncidentState(inc)}
                        className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-extrabold shrink-0 disabled:opacity-50"
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
