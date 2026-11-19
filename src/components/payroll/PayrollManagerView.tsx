import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Lock,
  Printer,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Unlock,
  X,
} from 'lucide-react';
import {
  KgBottomSheet,
  KgButton,
  KgEmptyState,
  KgErrorState,
  KgInput,
  KgModuleHero,
  KgSkeleton,
  KgStatusBadge,
} from '../KgDesignSystem';
import type { PayrollRecord, User } from '../../store/useAppStore';
import { formatVnd } from '../../utils/formatCurrency';
import { navigateToHubSubTab } from '../../utils/hubNavigation';
import { isAdminUser } from '../../utils/permissions';
import { salaryMonthLabel } from '../../types/salary';
import {
  PAYROLL_WORKFLOW_STEPS,
  type PayrollWorkflowState,
  type PayrollWorkflowStatus,
} from '../../utils/payrollWorkflow';

const formatHours = (hours: number) => `${Number(hours || 0).toFixed(2)} giờ`;

export type StaffFilterStatus = 'all' | 'disputed' | 'pending' | 'confirmed' | 'unconfigured';
export type StaffSortKey = 'name_asc' | 'net_desc' | 'net_asc' | 'hours_desc';

interface ConfirmationSummary {
  totalStaff: number;
  confirmedCount: number;
  disputedCount: number;
  pendingCount: number;
}

export interface PayrollManagerViewProps {
  currentUser: User;
  selectedMonth: string;
  onMonthChange: (nextYm: string) => void;
  payrollList: PayrollRecord[];
  workflow: PayrollWorkflowState;
  confirmationSummary: ConfirmationSummary;
  totalNetPayroll: number;
  unconfiguredCount: number;
  isRefreshing: boolean;
  loadError: string;
  isWorkflowBusy: boolean;
  onRefresh: () => void;
  onSelectUser: (username: string) => void;
  onExportBankCsv: () => void;
  onPrintA5Payslip: (record: PayrollRecord) => void;
  onUpdateWorkflowStatus: (targetStatus: PayrollWorkflowStatus, note: string) => Promise<boolean>;
}

export default function PayrollManagerView({
  currentUser,
  selectedMonth,
  onMonthChange,
  payrollList,
  workflow,
  confirmationSummary,
  totalNetPayroll,
  unconfiguredCount,
  isRefreshing,
  loadError,
  isWorkflowBusy,
  onRefresh,
  onSelectUser,
  onExportBankCsv,
  onPrintA5Payslip,
  onUpdateWorkflowStatus,
}: PayrollManagerViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StaffFilterStatus>('all');
  const [sortKey, setSortKey] = useState<StaffSortKey>('name_asc');
  const [workflowSheetTarget, setWorkflowSheetTarget] = useState<PayrollWorkflowStatus | null>(null);
  const [workflowNote, setWorkflowNote] = useState('');

  const getStaffStatusKey = useCallback(
    (record: PayrollRecord): StaffFilterStatus => {
      const configured =
        record.isConfigured !== false && (record.salaryAmount || record.baseSalaryPerHour || 0) > 0;
      const conf =
        workflow.confirmations[record.username] ||
        workflow.confirmations[record.username.toLowerCase()];
      if (conf?.status === 'DISPUTED') return 'disputed';
      if (conf?.status === 'CONFIRMED') return 'confirmed';
      if (!configured) return 'unconfigured';
      return 'pending';
    },
    [workflow.confirmations],
  );

  const filteredSortedList = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const filtered = payrollList.filter((record) => {
      if (q) {
        const matchName = record.fullname.toLowerCase().includes(q);
        const matchUser = record.username.toLowerCase().includes(q);
        if (!matchName && !matchUser) return false;
      }
      if (statusFilter !== 'all' && getStaffStatusKey(record) !== statusFilter) {
        return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === 'net_desc') return (Number(b.netPay) || 0) - (Number(a.netPay) || 0);
      if (sortKey === 'net_asc') return (Number(a.netPay) || 0) - (Number(b.netPay) || 0);
      if (sortKey === 'hours_desc') return (Number(b.totalHours) || 0) - (Number(a.totalHours) || 0);
      return a.fullname.localeCompare(b.fullname, 'vi');
    });
  }, [payrollList, searchTerm, statusFilter, sortKey, getStaffStatusKey]);

  const openWorkflowStatusDrawer = (targetStatus: PayrollWorkflowStatus) => {
    if (!isAdminUser(currentUser)) return;
    setWorkflowNote('');
    setWorkflowSheetTarget(targetStatus);
  };

  const handleConfirmWorkflowStatus = async () => {
    if (!workflowSheetTarget) return;
    const ok = await onUpdateWorkflowStatus(workflowSheetTarget, workflowNote);
    if (ok) {
      setWorkflowSheetTarget(null);
      setWorkflowNote('');
    }
  };

  return (
    <div className="p-4 space-y-5 animate-fade-in pb-16 max-w-[1440px] mx-auto w-full">
      <KgModuleHero
        moduleId="payroll"
        title="Bảng Lương Toàn Quán"
        description="Theo dõi công, thưởng, phạt và thực nhận của toàn bộ nhân viên."
        eyebrow="Tài chính"
        features={['Tổng hợp tự động', 'Chi tiết giờ công', 'Minh bạch thu nhập']}
      />

      {isAdminUser(currentUser) && (
        <button
          type="button"
          onClick={() => navigateToHubSubTab('admin_people_pay', 'salary_rates')}
          className="w-full min-h-[48px] bg-[var(--kg-surface)] border border-[var(--kg-border)] px-4 py-3 rounded-2xl flex items-center justify-between gap-3 hover:border-[var(--kg-border-strong)] transition-all group shadow-xs active:scale-[0.99] text-left touch-manipulation"
        >
          <span className="flex items-center text-xs sm:text-sm font-black text-[var(--kg-text)] min-w-0">
            <Settings2 size={17} className="mr-2 text-[var(--kg-primary)] shrink-0" />
            <span className="truncate">Cấu hình đơn giá lương &amp; hạn mức ứng</span>
          </span>
          <ChevronRight
            size={17}
            className="text-[var(--kg-text-muted)] group-hover:translate-x-0.5 transition-transform shrink-0"
          />
        </button>
      )}

      {/* 4-Step Payroll Approval & Bank CSV Export Card */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-primary-ink)]">
              Quy trình chốt lương 4 bước
            </span>
            <h3 className="text-sm sm:text-base font-black text-[var(--kg-text)] mt-0.5">
              Kỳ lương {salaryMonthLabel(selectedMonth)}
            </h3>
          </div>
          <div className="text-right tabular-nums ml-auto">
            <div className="text-[11px] font-bold text-[var(--kg-text-muted)]">Tổng quỹ thực lĩnh</div>
            <div className="text-base sm:text-lg font-mono tabular-nums font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
              {formatVnd(totalNetPayroll)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PAYROLL_WORKFLOW_STEPS.map((st) => {
            const isActive = workflow.status === st.key;
            const isDanger = st.key === 'Disputed' && isActive;
            const isLocked = st.key === 'Locked' && isActive;
            return (
              <div
                key={st.key}
                className={`rounded-xl p-2.5 border text-left transition-all min-w-0 ${
                  isDanger
                    ? 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300'
                    : isLocked
                      ? 'bg-emerald-500/12 border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                      : isActive
                        ? 'bg-[var(--kg-primary-soft)] border-[var(--kg-primary)]/40 text-[var(--kg-primary-ink)]'
                        : 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)] text-[var(--kg-text-muted)]'
                }`}
              >
                <div className="text-xs font-black truncate">{st.label}</div>
                <div className="text-[10px] mt-0.5 leading-snug opacity-85 line-clamp-2">{st.description}</div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-[var(--kg-border)]">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold font-mono tabular-nums">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-sans whitespace-nowrap">
              Đã xác nhận:{' '}
              <span className="font-mono">
                {confirmationSummary.confirmedCount}/{confirmationSummary.totalStaff}
              </span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-500/12 text-rose-700 dark:text-rose-300 font-sans whitespace-nowrap">
              Khiếu nại: <span className="font-mono">{confirmationSummary.disputedCount}</span>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] font-sans whitespace-nowrap">
              Chờ đối chiếu: <span className="font-mono">{confirmationSummary.pendingCount}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
            {workflow.status !== 'Locked' && (
              <KgButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={isWorkflowBusy}
                icon={Send}
                onClick={() => openWorkflowStatusDrawer('Staff_Confirming')}
                className="w-full sm:w-auto"
              >
                Gửi NV đối chiếu
              </KgButton>
            )}
            {workflow.status !== 'Locked' ? (
              <KgButton
                type="button"
                variant="primary"
                size="sm"
                disabled={isWorkflowBusy}
                icon={Lock}
                onClick={() => openWorkflowStatusDrawer('Locked')}
                className="w-full sm:w-auto"
              >
                Khóa sổ lương
              </KgButton>
            ) : (
              <KgButton
                type="button"
                variant="warning"
                size="sm"
                disabled={isWorkflowBusy}
                icon={Unlock}
                onClick={() => openWorkflowStatusDrawer('Draft')}
                className="w-full sm:w-auto"
              >
                Mở khóa sửa
              </KgButton>
            )}
            <KgButton
              type="button"
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={onExportBankCsv}
              className="w-full sm:w-auto"
            >
              Xuất CSV Ngân hàng
            </KgButton>
          </div>
        </div>
      </div>

      {/* Employee Payroll List (Desktop Table >= lg | Cards < lg for iPad Portrait fit) */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 border-b border-[var(--kg-border)] pb-3">
          <h3 className="font-black flex items-center text-[var(--kg-text)] text-sm sm:text-base min-w-0">
            <FileSpreadsheet size={18} className="mr-2 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">Danh sách nhân viên ({salaryMonthLabel(selectedMonth)})</span>
            <span className="ml-2 text-xs font-mono tabular-nums text-[var(--kg-text-muted)] shrink-0">
              ({filteredSortedList.length}/{payrollList.length})
            </span>
          </h3>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="flex-1 sm:flex-initial inline-flex items-center gap-2 rounded-xl bg-[var(--kg-surface-soft)] px-3 py-1.5 border border-[var(--kg-border)] min-h-[44px] sm:min-h-[38px] min-w-0">
              <Calendar size={14} className="text-[var(--kg-primary)] shrink-0" />
              <input
                type="month"
                aria-label="Chọn tháng bảng lương"
                value={selectedMonth}
                onChange={(e) => onMonthChange(e.target.value)}
                className="!border-0 !bg-transparent !min-h-0 !shadow-none !p-0 flex-1 sm:flex-initial min-w-0 text-xs sm:text-sm font-bold font-mono tabular-nums text-[var(--kg-text)] outline-none"
              />
            </label>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Tải lại bảng lương"
              className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors shrink-0 touch-manipulation"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Search, Status Filter Pills & Sort Controls */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            <div className="flex-1 min-w-0">
              <KgInput
                aria-label="Tìm nhân viên theo tên hoặc mã"
                placeholder="Tìm theo tên hoặc @username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={Search}
                rightAdornment={
                  searchTerm ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      aria-label="Xóa từ khóa tìm kiếm"
                      className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] touch-manipulation"
                    >
                      <X size={15} />
                    </button>
                  ) : null
                }
              />
            </div>
            <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 min-h-[44px] sm:min-h-[42px] text-xs font-bold text-[var(--kg-text)] w-full sm:w-auto sm:min-w-[210px]">
              <ArrowUpDown size={14} className="text-[var(--kg-text-muted)] flex-shrink-0" />
              <span className="sr-only">Sắp xếp theo</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as StaffSortKey)}
                className="!border-0 !bg-transparent !min-h-0 !shadow-none !p-0 flex-1 min-w-0 outline-none text-xs font-bold text-[var(--kg-text)]"
              >
                <option value="name_asc">Tên (A - Z)</option>
                <option value="net_desc">Thực nhận (Cao → Thấp)</option>
                <option value="net_asc">Thực nhận (Thấp → Cao)</option>
                <option value="hours_desc">Giờ công (Nhiều nhất)</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {(
              [
                { id: 'all', label: `Tất cả (${payrollList.length})` },
                { id: 'disputed', label: `Khiếu nại (${confirmationSummary.disputedCount})` },
                { id: 'pending', label: `Chờ đối chiếu (${confirmationSummary.pendingCount})` },
                { id: 'confirmed', label: `Đã xác nhận (${confirmationSummary.confirmedCount})` },
                { id: 'unconfigured', label: `Chưa cấu hình (${unconfiguredCount})` },
              ] as { id: StaffFilterStatus; label: string }[]
            ).map((pill) => {
              const active = statusFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  className={`shrink-0 whitespace-nowrap min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-full text-xs font-bold border transition-colors touch-manipulation ${
                    active
                      ? 'bg-[var(--kg-primary)] text-white border-[var(--kg-primary)]'
                      : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
        </div>

        {loadError ? (
          <KgErrorState title="Không thể tải bảng lương" description={loadError} onRetry={onRefresh} />
        ) : isRefreshing && payrollList.length === 0 ? (
          <div className="space-y-2.5">
            <KgSkeleton className="h-14 w-full" />
            <KgSkeleton className="h-14 w-full" />
            <KgSkeleton className="h-14 w-full" />
          </div>
        ) : filteredSortedList.length === 0 ? (
          <KgEmptyState
            icon={FileSpreadsheet}
            title={
              payrollList.length === 0
                ? 'Chưa có dữ liệu bảng lương tháng này'
                : 'Không tìm thấy nhân viên phù hợp'
            }
            description={
              payrollList.length === 0
                ? 'Hãy kiểm tra lại dữ liệu chấm công hoặc chọn tháng khác.'
                : 'Thử xóa bộ lọc trạng thái hoặc nhập từ khóa tìm kiếm khác.'
            }
            action={
              payrollList.length > 0 ? (
                <KgButton
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                >
                  Xóa bộ lọc
                </KgButton>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop Sticky-Header Table (>= lg 1024px so 768px iPad portrait uses clean cards) */}
            <div className="hidden lg:block overflow-auto max-h-[560px] rounded-xl border border-[var(--kg-border)]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] text-[var(--kg-text-muted)] uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-2.5 xl:px-3.5 font-bold">Nhân viên</th>
                    <th className="py-3 px-2.5 xl:px-3 font-bold">Trạng thái</th>
                    <th className="py-3 px-2.5 xl:px-3 font-bold text-right">Công / Giờ</th>
                    <th className="py-3 px-2.5 xl:px-3 font-bold text-right">Lương công</th>
                    <th className="py-3 px-2.5 xl:px-3 font-bold text-right">Thưởng</th>
                    <th className="py-3 px-2.5 xl:px-3 font-bold text-right">Phạt</th>
                    <th className="py-3 px-2.5 xl:px-3 font-bold text-right">Tạm ứng</th>
                    <th className="py-3 px-2.5 xl:px-3 font-bold text-right">Thực nhận</th>
                    <th className="py-3 px-2.5 xl:px-3.5 font-bold text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--kg-border)] bg-[var(--kg-surface)]">
                  {filteredSortedList.map((record) => {
                    const isConfigured =
                      record.isConfigured !== false &&
                      (record.salaryAmount || record.baseSalaryPerHour || 0) > 0;
                    const staffConf =
                      workflow.confirmations[record.username] ||
                      workflow.confirmations[record.username.toLowerCase()];

                    return (
                      <tr
                        key={record.username}
                        className="hover:bg-[var(--kg-surface-soft)]/70 transition-colors"
                      >
                        <td className="py-3 px-2.5 xl:px-3.5">
                          <button
                            type="button"
                            onClick={() => onSelectUser(record.username)}
                            className="text-left group"
                          >
                            <div className="font-bold text-sm text-[var(--kg-text)] group-hover:text-[var(--kg-primary-ink)] group-hover:underline">
                              {record.fullname}
                            </div>
                            <div className="text-[11px] font-mono text-[var(--kg-text-muted)]">
                              @{record.username} · {record.payType === 'daily' ? 'Tháng/30d' : 'Theo giờ'}
                            </div>
                          </button>
                        </td>
                        <td className="py-3 px-2.5 xl:px-3">
                          {!isConfigured ? (
                            <KgStatusBadge variant="warning">Chưa cấu hình</KgStatusBadge>
                          ) : staffConf?.status === 'CONFIRMED' ? (
                            <KgStatusBadge variant="success">Đã xác nhận</KgStatusBadge>
                          ) : staffConf?.status === 'DISPUTED' ? (
                            <span title={staffConf.note}>
                              <KgStatusBadge variant="error">Khiếu nại</KgStatusBadge>
                            </span>
                          ) : (
                            <KgStatusBadge variant="neutral">Chờ đối chiếu</KgStatusBadge>
                          )}
                        </td>
                        <td className="py-3 px-2.5 xl:px-3 text-right font-mono tabular-nums font-semibold text-[var(--kg-text)] whitespace-nowrap">
                          {record.payType === 'daily'
                            ? `${record.workedDays || 0} ngày`
                            : formatHours(record.totalHours)}
                        </td>
                        <td className="py-3 px-2.5 xl:px-3 text-right font-mono tabular-nums text-[var(--kg-text)] whitespace-nowrap">
                          {isConfigured ? formatVnd(record.totalBaseSalary) : '—'}
                        </td>
                        <td className="py-3 px-2.5 xl:px-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                          +{formatVnd(record.bonus || 0)}
                        </td>
                        <td className="py-3 px-2.5 xl:px-3 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400 font-semibold whitespace-nowrap">
                          -{formatVnd(record.penalty || 0)}
                        </td>
                        <td className="py-3 px-2.5 xl:px-3 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
                          -{formatVnd(record.advances || 0)}
                        </td>
                        <td className="py-3 px-2.5 xl:px-3 text-right font-mono tabular-nums font-black text-sm text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {isConfigured ? formatVnd(record.netPay) : 'Chờ cấu hình'}
                        </td>
                        <td className="py-3 px-2.5 xl:px-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onPrintA5Payslip(record)}
                              title="In phiếu lương A5"
                              aria-label={`In phiếu lương A5 cho ${record.fullname}`}
                              className="min-w-[36px] min-h-[36px] rounded-lg border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] inline-flex items-center justify-center transition-colors"
                            >
                              <Printer size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectUser(record.username)}
                              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] font-bold hover:brightness-95 inline-flex items-center gap-1 transition-colors"
                            >
                              Chi tiết <ChevronRight size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Portrait Card List (< lg) */}
            <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {filteredSortedList.map((record) => {
                const isConfigured =
                  record.isConfigured !== false &&
                  (record.salaryAmount || record.baseSalaryPerHour || 0) > 0;
                const staffConf =
                  workflow.confirmations[record.username] ||
                  workflow.confirmations[record.username.toLowerCase()];
                return (
                  <div
                    key={record.username}
                    className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] hover:border-emerald-500/40 transition-all flex items-center justify-between gap-2.5 min-w-0"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectUser(record.username)}
                      className="min-w-0 flex-1 text-left touch-manipulation"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-black text-[var(--kg-text)] text-sm truncate max-w-full">
                          {record.fullname}
                        </p>
                        {!isConfigured && <KgStatusBadge variant="warning">Chưa cấu hình</KgStatusBadge>}
                        {staffConf?.status === 'CONFIRMED' && (
                          <KgStatusBadge variant="success">Đã xác nhận</KgStatusBadge>
                        )}
                        {staffConf?.status === 'DISPUTED' && (
                          <KgStatusBadge variant="error">Khiếu nại</KgStatusBadge>
                        )}
                      </div>
                      {staffConf?.status === 'DISPUTED' && staffConf.note && (
                        <p className="text-[11px] font-semibold text-[var(--kg-danger)] mt-1 line-clamp-2">
                          Khiếu nại: {staffConf.note}
                        </p>
                      )}
                      <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] mt-0.5 truncate">
                        @{record.username} ·{' '}
                        {record.payType === 'daily'
                          ? `${record.workedDays || 0} ngày công`
                          : formatHours(record.totalHours)}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-[var(--kg-border)]/70">
                        <span className="text-[11px] font-bold text-[var(--kg-text-muted)]">
                          Thực nhận
                        </span>
                        {isConfigured ? (
                          <span className="font-mono tabular-nums font-black text-sm text-emerald-600 dark:text-emerald-400 text-right whitespace-nowrap ml-auto">
                            {formatVnd(record.netPay)}
                          </span>
                        ) : (
                          <span className="font-bold text-xs text-amber-600 dark:text-amber-400 text-right ml-auto">
                            Chờ cấu hình
                          </span>
                        )}
                      </div>
                    </button>
                    <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => onPrintA5Payslip(record)}
                        title="In phiếu lương A5"
                        aria-label={`In phiếu lương A5 cho ${record.fullname}`}
                        className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center touch-manipulation"
                      >
                        <Printer size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectUser(record.username)}
                        aria-label={`Xem chi tiết lương của ${record.fullname}`}
                        className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center touch-manipulation"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Workflow Status Change Sheet */}
      <KgBottomSheet
        isOpen={Boolean(workflowSheetTarget)}
        onClose={() => {
          if (!isWorkflowBusy) setWorkflowSheetTarget(null);
        }}
        title={
          workflowSheetTarget === 'Staff_Confirming'
            ? `Gửi bảng lương ${salaryMonthLabel(selectedMonth)} để NV đối chiếu`
            : workflowSheetTarget === 'Locked'
              ? `Khóa sổ lương ${salaryMonthLabel(selectedMonth)}`
              : `Mở khóa bảng lương ${salaryMonthLabel(selectedMonth)}`
        }
        footer={
          <div className="flex gap-2.5">
            <KgButton
              variant="secondary"
              className="flex-1"
              disabled={isWorkflowBusy}
              onClick={() => setWorkflowSheetTarget(null)}
            >
              Hủy
            </KgButton>
            <KgButton
              variant={
                workflowSheetTarget === 'Locked' && confirmationSummary.disputedCount > 0
                  ? 'warning'
                  : 'primary'
              }
              className="flex-1"
              loading={isWorkflowBusy}
              onClick={handleConfirmWorkflowStatus}
            >
              {workflowSheetTarget === 'Locked' && confirmationSummary.disputedCount > 0
                ? 'Đã xử lý, khóa sổ'
                : 'Xác nhận'}
            </KgButton>
          </div>
        }
      >
        <div className="space-y-3 py-1">
          {workflowSheetTarget === 'Locked' && confirmationSummary.disputedCount > 0 && (
            <div className="p-3 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/30 text-xs font-semibold text-[var(--kg-warning)] flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                Đang có <b className="font-mono tabular-nums">{confirmationSummary.disputedCount}</b>{' '}
                khiếu nại lương! Hãy chắc chắn bạn đã đối soát xong trước khi khóa sổ tháng này.
              </span>
            </div>
          )}
          <label className="block space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--kg-text-muted)]">
              Ghi chú kèm theo (tùy chọn)
            </span>
            <textarea
              value={workflowNote}
              onChange={(e) => setWorkflowNote(e.target.value)}
              rows={3}
              placeholder="Ví dụ: Đã chốt công đến hết ngày 30, vui lòng kiểm tra trước 18h..."
              className="w-full rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3.5 py-2.5 text-sm text-[var(--kg-text)] outline-none focus:border-[var(--kg-primary)]"
            />
          </label>
        </div>
      </KgBottomSheet>
    </div>
  );
}
