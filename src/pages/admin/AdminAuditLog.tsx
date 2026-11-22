import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  KgBottomSheet,
  KgEmptyState,
  KgErrorState,
  KgModuleHero,
  KgSkeleton,
} from '../../components/KgDesignSystem';
import { callApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { isAdminUser } from '../../utils/permissions';

export interface AuditLogEntry {
  id: string;
  timestamp?: string;
  createdAt?: string;
  actor?: string;
  actorUsername?: string;
  action: string;
  target?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

type AuditGroup = 'ALL' | 'PAYROLL' | 'OPS' | 'HR' | 'SECURITY';

const AUDIT_ACTION_LABELS: Record<string, string> = {
  ALL: 'Tất cả thao tác nhạy cảm',
  SET_PAYROLL_WORKFLOW_STATUS: 'Đổi trạng thái chốt lương',
  UPDATE_MONTHLY_SALARY_CONFIG: 'Cập nhật cấu hình lương tháng',
  COPY_MONTHLY_SALARY_CONFIG: 'Sao chép cấu hình lương tháng',
  REVIEW_SALARY_ADJUSTMENT: 'Duyệt điều chỉnh công/lương',
  ADD_BONUS_PENALTY: 'Thêm thưởng / phạt',
  APPROVE_SWAP: 'Duyệt / từ chối đổi ca',
  APPROVE_ADVANCE: 'Duyệt / từ chối ứng lương',
  APPROVE_MISSED_CHECKIN: 'Duyệt bù công quên chấm',
  REJECT_MISSED_CHECKIN: 'Từ chối bù công',
  UPDATE_CHECKIN_TYPE: 'Sửa loại Vào / Ra ca',
  REVIEW_HANDOVER: 'Duyệt chốt két bàn giao ca',
  UPDATE_INCIDENT: 'Cập nhật sự cố / chi phí sửa chữa',
  UPDATE_USER_ROLE: 'Đổi phân quyền tài khoản',
  UPDATE_EMPLOYMENT_STATUS: 'Đổi trạng thái làm việc',
  FORCE_RESET_PASSWORD: 'Đặt lại mật khẩu nhân viên',
  SYNC_KEYS: 'Đồng bộ khóa API AI (đã ẩn khóa)',
};

const AUDIT_GROUP_ACTIONS: Record<Exclude<AuditGroup, 'ALL'>, Set<string>> = {
  PAYROLL: new Set([
    'SET_PAYROLL_WORKFLOW_STATUS',
    'UPDATE_MONTHLY_SALARY_CONFIG',
    'COPY_MONTHLY_SALARY_CONFIG',
    'REVIEW_SALARY_ADJUSTMENT',
    'ADD_BONUS_PENALTY',
    'APPROVE_ADVANCE',
    'APPROVE_MISSED_CHECKIN',
    'REJECT_MISSED_CHECKIN',
    'UPDATE_CHECKIN_TYPE',
  ]),
  OPS: new Set(['REVIEW_HANDOVER', 'UPDATE_INCIDENT', 'APPROVE_SWAP']),
  HR: new Set(['UPDATE_USER_ROLE', 'UPDATE_EMPLOYMENT_STATUS', 'FORCE_RESET_PASSWORD']),
  SECURITY: new Set(['SYNC_KEYS']),
};

const AUDIT_GROUP_PILLS: Array<{ id: AuditGroup; label: string }> = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'PAYROLL', label: 'Công & Lương' },
  { id: 'OPS', label: 'Vận hành & Két' },
  { id: 'HR', label: 'Nhân sự & Quyền' },
  { id: 'SECURITY', label: 'Bảo mật AI' },
];

const PAGE_SIZE = 25;

function extractIsoDate(raw: string | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }
  return '';
}

function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export default function AdminAuditLog() {
  const currentUser = useAppStore((s) => s.currentUser);
  if (!isAdminUser(currentUser)) return null;
  return <AdminAuditLogContent />;
}

function AdminAuditLogContent() {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [limit, setLimit] = useState<number>(100);
  const [groupFilter, setGroupFilter] = useState<AuditGroup>('ALL');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const fetchLogs = useCallback(
    async (requestedLimit: number, forceRefresh = true) => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await callApi(
          'GET_AUDIT_LOGS',
          { limit: requestedLimit, forceRefresh },
          { background: true, cacheTtlMs: 0 },
        );
        if (res?.ok && Array.isArray(res.data?.logs)) {
          setAuditLogs(res.data.logs as AuditLogEntry[]);
          setPage(1);
        } else {
          setLoadError(res?.message || 'Không thể tải nhật ký kiểm toán từ máy chủ.');
        }
      } catch {
        setLoadError('Mất kết nối khi tải nhật ký kiểm toán.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchLogs(limit, false);
  }, [fetchLogs, limit]);

  const groupCounts = useMemo(() => {
    const counts: Record<AuditGroup, number> = {
      ALL: auditLogs.length,
      PAYROLL: 0,
      OPS: 0,
      HR: 0,
      SECURITY: 0,
    };
    for (const entry of auditLogs) {
      if (AUDIT_GROUP_ACTIONS.PAYROLL.has(entry.action)) counts.PAYROLL += 1;
      else if (AUDIT_GROUP_ACTIONS.OPS.has(entry.action)) counts.OPS += 1;
      else if (AUDIT_GROUP_ACTIONS.HR.has(entry.action)) counts.HR += 1;
      else if (AUDIT_GROUP_ACTIONS.SECURITY.has(entry.action)) counts.SECURITY += 1;
    }
    return counts;
  }, [auditLogs]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return auditLogs.filter((entry) => {
      if (groupFilter !== 'ALL' && !AUDIT_GROUP_ACTIONS[groupFilter].has(entry.action)) {
        return false;
      }
      if (actionFilter !== 'ALL' && entry.action !== actionFilter) return false;
      if (dateFilter) {
        const entryDate = extractIsoDate(entry.timestamp || entry.createdAt);
        if (entryDate !== dateFilter) return false;
      }
      if (!q) return true;
      const actor = String(entry.actor || entry.actorUsername || '').toLowerCase();
      const target = String(entry.target || '').toLowerCase();
      const summary = String(entry.summary || '').toLowerCase();
      const actionText = String(AUDIT_ACTION_LABELS[entry.action] || entry.action || '').toLowerCase();
      return (
        actor.includes(q) || target.includes(q) || summary.includes(q) || actionText.includes(q)
      );
    });
  }, [auditLogs, groupFilter, actionFilter, dateFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedLogs = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredLogs.slice(start, start + PAGE_SIZE);
  }, [filteredLogs, safePage]);

  const hasActiveFilter =
    groupFilter !== 'ALL' || actionFilter !== 'ALL' || Boolean(dateFilter) || Boolean(query.trim());

  const resetFilters = () => {
    setGroupFilter('ALL');
    setActionFilter('ALL');
    setDateFilter('');
    setQuery('');
    setPage(1);
  };

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) return;
    const header = ['Thời gian', 'Mã thao tác', 'Tên thao tác', 'Người thực hiện', 'Đối tượng', 'Tóm tắt', 'Metadata'];
    const rows = filteredLogs.map((entry) => [
      entry.timestamp || entry.createdAt || '',
      entry.action || '',
      AUDIT_ACTION_LABELS[entry.action] || entry.action || '',
      entry.actor || entry.actorUsername || 'admin',
      entry.target || '',
      entry.summary || '',
      entry.metadata ? JSON.stringify(entry.metadata) : '',
    ]);
    const csvContent =
      '\uFEFF' + [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kg-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:px-0 md:pt-1 space-y-4 animate-fade-in pb-24 md:pb-12 max-w-7xl mx-auto">
      <KgModuleHero
        moduleId="admin"
        title="Nhật ký kiểm toán"
        description="Theo dõi dấu vết bất biến mọi thao tác chốt lương, sửa công, duyệt két, thưởng/phạt và phân quyền."
        eyebrow="Hệ thống · Audit"
        actions={
          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => void fetchLogs(limit, true)}
              disabled={loading}
              className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin shrink-0' : 'shrink-0'} />
              <span>Làm mới</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredLogs.length === 0}
              className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-45 whitespace-nowrap"
            >
              <Download size={14} className="shrink-0" />
              <span>Xuất CSV</span>
            </button>
          </div>
        }
      />

      {/* Toast Touch Filter Pills + Granular Controls */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3.5 space-y-3 shadow-xs">
        <div
          className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 sm:flex-wrap sm:overflow-visible"
          role="tablist"
          aria-label="Nhóm thao tác kiểm toán"
        >
          {AUDIT_GROUP_PILLS.map((pill) => {
            const active = groupFilter === pill.id && actionFilter === 'ALL';
            return (
              <button
                key={pill.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setGroupFilter(pill.id);
                  setActionFilter('ALL');
                  setPage(1);
                }}
                className={`kg-filter-pill min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  active
                    ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                    : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <span>{pill.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-extrabold ${
                    active
                      ? 'bg-[var(--kg-nav-active-fg)]/15 text-[var(--kg-nav-active-fg)]'
                      : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                  }`}
                >
                  {groupCounts[pill.id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_170px_140px] gap-2.5">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Tìm người thực hiện, đối tượng, tháng lương..."
              aria-label="Tìm nhật ký kiểm toán"
              className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-10 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-base sm:text-xs font-medium text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setPage(1);
                }}
                aria-label="Xóa từ khóa"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-9 sm:h-9 inline-flex items-center justify-center rounded-lg text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface)]"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setGroupFilter('ALL');
              setPage(1);
            }}
            aria-label="Lọc loại thao tác kiểm toán"
            className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-base sm:text-xs font-bold text-[var(--kg-text)]"
          >
            {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Lọc theo ngày kiểm toán"
            className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-base sm:text-xs font-mono tabular-nums text-[var(--kg-text)]"
          />

          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 100)}
            aria-label="Số bản ghi tối đa tải về"
            className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-base sm:text-xs font-bold font-mono tabular-nums text-[var(--kg-text)]"
          >
            <option value={50}>Tải 50 dòng</option>
            <option value={100}>Tải 100 dòng</option>
            <option value={200}>Tải 200 dòng</option>
            <option value={500}>Tải 500 dòng</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[var(--kg-text-muted)]">
          <span className="font-mono tabular-nums">
            Hiển thị {pagedLogs.length} / {filteredLogs.length} bản ghi khớp (tổng đã tải {auditLogs.length})
          </span>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-[36px] sm:min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] hover:brightness-95 font-bold whitespace-nowrap"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {loadError ? (
        <KgErrorState
          title="Không thể tải nhật ký kiểm toán"
          description={loadError}
          onRetry={() => void fetchLogs(limit, true)}
        />
      ) : loading && auditLogs.length === 0 ? (
        <div className="space-y-2.5">
          <KgSkeleton className="h-14 w-full" />
          <KgSkeleton className="h-14 w-full" />
          <KgSkeleton className="h-14 w-full" />
          <KgSkeleton className="h-14 w-full" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <KgEmptyState
          icon={ShieldCheck}
          title="Không có bản ghi kiểm toán"
          description="Chưa có thao tác nhạy cảm nào khớp bộ lọc thời gian và từ khóa hiện tại."
          action={hasActiveFilter ? { label: 'Xóa bộ lọc', onClick: resetFilters } : undefined}
        />
      ) : (
        <>
          {/* Desktop Full-Height Table (>= lg) */}
          <div className="hidden lg:block bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-auto max-h-[65vh]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] text-[11px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                  <tr>
                    <th className="py-3 px-3.5 w-40 whitespace-nowrap">Thời gian</th>
                    <th className="py-3 px-3.5 w-48 whitespace-nowrap">Thao tác</th>
                    <th className="py-3 px-3.5 w-32 whitespace-nowrap">Người thực hiện</th>
                    <th className="py-3 px-3.5 w-32 whitespace-nowrap">Đối tượng</th>
                    <th className="py-3 px-3.5">Tóm tắt</th>
                    <th className="py-3 px-3.5 w-16 text-right whitespace-nowrap">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--kg-border)]">
                  {pagedLogs.map((entry, idx) => {
                    const actorName = entry.actor || entry.actorUsername || 'admin';
                    const timeStr = entry.timestamp || entry.createdAt || '--';
                    const actionLabel = AUDIT_ACTION_LABELS[entry.action] || entry.action;
                    return (
                      <tr
                        key={entry.id || `${entry.action}-${idx}`}
                        onClick={() => setSelectedEntry(entry)}
                        className="hover:bg-[var(--kg-surface-2)] cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-3.5 font-mono tabular-nums text-[var(--kg-text-muted)] whitespace-nowrap">
                          {timeStr}
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="inline-block px-2 py-0.5 rounded-md bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] font-bold text-[11px]">
                            {actionLabel}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 font-mono font-bold text-[var(--kg-text)] truncate max-w-[140px]">
                          @{actorName}
                        </td>
                        <td className="py-3 px-3.5 font-mono text-[var(--kg-text-muted)] truncate max-w-[140px]">
                          {entry.target || '—'}
                        </td>
                        <td className="py-3 px-3.5 text-[var(--kg-text)] max-w-[360px] truncate">
                          {entry.summary || '—'}
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEntry(entry);
                            }}
                            title="Xem chi tiết"
                            aria-label="Xem chi tiết bản ghi kiểm toán"
                            className="min-h-[36px] min-w-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-surface-2)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-[var(--kg-primary-ink)] font-bold inline-flex items-center justify-center gap-1"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile & Tablet Card List (< 1024px) */}
          <div className="lg:hidden space-y-2.5">
            {pagedLogs.map((entry, idx) => {
              const actorName = entry.actor || entry.actorUsername || 'admin';
              const timeStr = entry.timestamp || entry.createdAt || '--';
              const actionLabel = AUDIT_ACTION_LABELS[entry.action] || entry.action;
              return (
                <button
                  key={entry.id || `${entry.action}-${idx}`}
                  type="button"
                  onClick={() => setSelectedEntry(entry)}
                  className="w-full min-h-[44px] text-left bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] rounded-2xl p-3.5 shadow-xs space-y-2 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] font-bold text-[11px]">
                      {actionLabel}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] shrink-0">
                      {timeStr}
                    </span>
                  </div>
                  {entry.summary && (
                    <p className="text-xs text-[var(--kg-text)] line-clamp-2 leading-relaxed">
                      {entry.summary}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] pt-1.5 border-t border-[var(--kg-border)]">
                    <span className="font-bold text-[var(--kg-text)]">@{actorName}</span>
                    <div className="flex items-center gap-1.5">
                      {entry.target && (
                        <span className="px-2 py-0.5 rounded bg-[var(--kg-surface-2)] border border-[var(--kg-border)] text-[var(--kg-text)] truncate max-w-[160px]">
                          {entry.target}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[var(--kg-primary-ink)] font-sans font-bold">
                        <Eye size={12} /> Chi tiết
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl px-4 py-2.5 shadow-xs">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1 disabled:opacity-45 whitespace-nowrap"
              >
                <ChevronLeft size={14} /> Trước
              </button>
              <span className="text-xs font-mono tabular-nums font-bold text-[var(--kg-text-muted)]">
                Trang {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1 disabled:opacity-45 whitespace-nowrap"
              >
                Sau <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail Drawer */}
      <KgBottomSheet
        isOpen={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title={
          selectedEntry
            ? AUDIT_ACTION_LABELS[selectedEntry.action] || selectedEntry.action
            : 'Chi tiết bản ghi'
        }
        subtitle={selectedEntry?.timestamp || selectedEntry?.createdAt || undefined}
      >
        {selectedEntry && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] p-3">
                <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
                  Thời gian
                </p>
                <p className="mt-1 font-mono tabular-nums font-bold text-[var(--kg-text)]">
                  {selectedEntry.timestamp || selectedEntry.createdAt || '—'}
                </p>
              </div>
              <div className="rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] p-3">
                <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
                  Người thực hiện
                </p>
                <p className="mt-1 font-mono font-bold text-[var(--kg-text)]">
                  @{selectedEntry.actor || selectedEntry.actorUsername || 'admin'}
                </p>
              </div>
              <div className="rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] p-3">
                <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
                  Đối tượng
                </p>
                <p className="mt-1 font-mono font-bold text-[var(--kg-text)] break-all">
                  {selectedEntry.target || '—'}
                </p>
              </div>
              <div className="rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] p-3">
                <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
                  Mã hành động
                </p>
                <p className="mt-1 font-mono font-bold text-[var(--kg-primary-ink)] break-all">
                  {selectedEntry.action}
                </p>
              </div>
            </div>

            {selectedEntry.summary && (
              <div className="rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] p-3">
                <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
                  Nội dung tóm tắt
                </p>
                <p className="mt-1 text-[var(--kg-text)] leading-relaxed whitespace-pre-wrap">
                  {selectedEntry.summary}
                </p>
              </div>
            )}

            {selectedEntry.metadata && Object.keys(selectedEntry.metadata).length > 0 && (
              <div className="rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] p-3">
                <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)] mb-1.5">
                  Dữ liệu chi tiết (Metadata)
                </p>
                <pre className="text-[11px] font-mono tabular-nums text-[var(--kg-text)] overflow-x-auto whitespace-pre-wrap break-words bg-[var(--kg-surface)] p-2.5 rounded-lg border border-[var(--kg-border)]">
                  {JSON.stringify(selectedEntry.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </KgBottomSheet>
    </div>
  );
}
