import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Lock,
  Printer,
  RefreshCw,
  Zap,
} from 'lucide-react';
import {
  KgBottomSheet,
  KgButton,
  KgConfirmSheet,
  KgErrorState,
  KgModuleHero,
  KgStatusBadge,
} from '../KgDesignSystem';
import EmployeeSalaryCard from '../EmployeeSalaryCard';
import type { PayrollRecord, User } from '../../store/useAppStore';
import { formatVnd } from '../../utils/formatCurrency';
import { navigateToHubSubTab } from '../../utils/hubNavigation';
import { salaryMonthLabel } from '../../types/salary';
import { PAYROLL_WORKFLOW_STEPS, type PayrollWorkflowState } from '../../utils/payrollWorkflow';

const formatHours = (hours: number) => `${Number(hours || 0).toFixed(2)} giờ`;

export interface PayrollSlipViewProps {
  currentUser: User;
  isManagerView: boolean;
  selectedMonth: string;
  onMonthChange: (nextYm: string) => void;
  payroll: PayrollRecord | null;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  workedDays: number;
  workflow: PayrollWorkflowState;
  isRefreshing: boolean;
  loadError: string;
  isWorkflowBusy: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onPrintA5Payslip: (record: PayrollRecord) => void;
  onSubmitStaffConfirmation: (decision: 'CONFIRMED' | 'DISPUTED', note?: string) => Promise<boolean>;
}

export default function PayrollSlipView({
  currentUser,
  isManagerView,
  selectedMonth,
  onMonthChange,
  payroll,
  totalHours,
  regularHours,
  overtimeHours,
  workedDays,
  workflow,
  isRefreshing,
  loadError,
  isWorkflowBusy,
  onRefresh,
  onBack,
  onPrintA5Payslip,
  onSubmitStaffConfirmation,
}: PayrollSlipViewProps) {
  const [confirmSlipSheetOpen, setConfirmSlipSheetOpen] = useState(false);
  const [disputeSheetOpen, setDisputeSheetOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputeError, setDisputeError] = useState('');

  const isConfigured = payroll
    ? payroll.isConfigured !== false && (payroll.salaryAmount || payroll.baseSalaryPerHour || 0) > 0
    : false;

  const targetUsername = payroll?.username || currentUser.username;
  const slipConfirmation =
    workflow.confirmations[targetUsername] ||
    workflow.confirmations[targetUsername.toLowerCase()];

  const handleConfirmSlip = async () => {
    const ok = await onSubmitStaffConfirmation('CONFIRMED');
    if (ok) setConfirmSlipSheetOpen(false);
  };

  const handleSubmitDispute = async () => {
    if (!disputeNote.trim()) {
      setDisputeError('Vui lòng nhập nội dung sai lệch.');
      return;
    }
    const ok = await onSubmitStaffConfirmation('DISPUTED', disputeNote);
    if (ok) {
      setDisputeSheetOpen(false);
      setDisputeNote('');
      setDisputeError('');
    }
  };

  const hasRightRail = !isManagerView || Boolean(payroll);

  return (
    <div className="p-4 space-y-5 animate-fade-in pb-16 max-w-5xl mx-auto w-full">
      <KgModuleHero
        moduleId="payroll"
        title="Phiếu Lương Cá Nhân"
        description={
          payroll
            ? `Thông tin chi tiết lương và thu nhập của ${payroll.fullname}.`
            : 'Mức lương và thông tin quyền lợi chi tiết.'
        }
        eyebrow="Tài chính"
        features={['Minh bạch 100%', 'Chi tiết thưởng/phạt', 'Theo dõi tạm ứng']}
        tipTitle="Chính sách Tiền lương & Đối soát"
        tips={[
          'Lương giờ/tháng được tính toán tự động dựa trên bảng công thực tế đã chốt của tháng.',
          'Các lượt chấm công Vào ca - Ra ca trong ngày được tự động ghép đôi và tổng hợp chính xác.',
          'Ca làm qua đêm (00:00 - 06:00 ngày hôm sau) thuộc ca ngày hôm trước; nếu ra ca sau 00:15 sẽ được tính tăng ca đầy đủ.',
          'Nếu quản lý chưa cấu hình mức lương, hệ thống sẽ tổng hợp giờ làm việc thực tế chờ thiết lập.',
          'Các khoản phụ cấp, trách nhiệm, thưởng doanh số hoặc tiền tip được cộng dồn theo ca.',
        ]}
        actions={
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="flex-1 sm:flex-initial inline-flex items-center gap-2 rounded-xl bg-[var(--kg-surface-soft)] px-3 py-1.5 border border-[var(--kg-border)] min-h-[44px] sm:min-h-[38px] min-w-0">
              <Calendar size={14} className="text-[var(--kg-primary)] shrink-0" />
              <span className="sr-only">Chọn tháng xem phiếu lương</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => onMonthChange(e.target.value)}
                className="!border-0 !bg-transparent !min-h-0 !shadow-none !p-0 flex-1 sm:flex-initial min-w-0 text-xs sm:text-sm font-bold font-mono tabular-nums text-[var(--kg-text)] outline-none"
              />
            </label>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              aria-label="Tải lại phiếu lương"
              className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors shrink-0 touch-manipulation disabled:opacity-50"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        }
      />

      {loadError && (
        <KgErrorState title="Không thể tải phiếu lương" description={loadError} onRetry={onRefresh} />
      )}

      {/* Warning banner when salary is not configured by admin */}
      {payroll && !isConfigured && (
        <div className="rounded-2xl border border-[var(--kg-warning)]/30 bg-[var(--kg-warning-soft)] p-4 sm:p-5 flex items-start gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-[var(--kg-warning)]/15 text-[var(--kg-warning)] flex items-center justify-center flex-shrink-0">
            <AlertCircle size={22} />
          </div>
          <div className="space-y-1 text-xs sm:text-sm flex-1">
            <h4 className="font-black text-[var(--kg-text)] text-sm sm:text-base">
              Admin chưa cấu hình lương cho {isManagerView ? payroll.fullname : 'bạn'}
            </h4>
            <p className="text-[var(--kg-text-muted)] leading-relaxed font-medium">
              Hệ thống hiện đang tổng hợp đầy đủ số giờ làm việc thực tế (
              <span className="font-mono tabular-nums font-bold text-[var(--kg-text)]">
                {formatHours(totalHours)}
              </span>{' '}
              công). Mức lương thực lĩnh sẽ được tính tự động ngay khi Quản lý hoàn tất cấu hình mức lương trong tháng.
            </p>
          </div>
        </div>
      )}

      {/* Desktop 2-Column Layout: Breakdown Left (7 cols) | Verification & Rate Adjustment Right (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Payslip Breakdown */}
        <div className={hasRightRail ? 'lg:col-span-7 min-w-0' : 'lg:col-span-12 min-w-0'}>
          {payroll ? (
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-6 rounded-2xl shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:flex-wrap justify-between sm:items-center pb-3 border-b border-[var(--kg-border)] gap-2.5">
                <h3 className="font-black text-[var(--kg-text)] flex items-center text-sm sm:text-base min-w-0">
                  <Calculator size={18} className="mr-2 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="truncate">Chi tiết các khoản thu nhập</span>
                </h3>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => onPrintA5Payslip(payroll)}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-black bg-[var(--kg-surface-soft)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:border-emerald-500/40 active:scale-95 transition-all whitespace-nowrap touch-manipulation"
                  >
                    <Printer size={14} className="flex-shrink-0" /> In phiếu A5 / PDF
                  </button>
                  <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center justify-center min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl text-xs text-[var(--kg-text-muted)] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] hover:text-[var(--kg-text)] font-bold active:scale-95 transition-all whitespace-nowrap touch-manipulation"
                  >
                    <ChevronRight size={14} className="rotate-180 mr-1 flex-shrink-0" />
                    Quay lại
                  </button>
                </div>
              </div>

              <div className="space-y-3 text-xs sm:text-sm tabular-nums">
                {/* Salary rate row */}
                <div className="flex justify-between items-center gap-3">
                  <span className="text-[var(--kg-text-muted)] font-medium min-w-0 flex-1">
                    {payroll.payType === 'daily'
                      ? 'Lương tháng chuẩn 30 ngày'
                      : 'Mức lương cơ bản / giờ'}
                  </span>
                  {isConfigured ? (
                    <span className="font-mono tabular-nums font-bold text-[var(--kg-text)] text-right shrink-0 whitespace-nowrap">
                      {formatVnd(payroll.salaryAmount ?? payroll.baseSalaryPerHour)}
                    </span>
                  ) : (
                    <KgStatusBadge variant="warning" className="shrink-0">Chờ cấu hình lương</KgStatusBadge>
                  )}
                </div>

                {/* Total hours / days row with drill-down to Attendance Ledger */}
                <div className="flex justify-between items-center gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                    <span className="text-[var(--kg-text-muted)] font-medium">
                      {payroll.payType === 'daily'
                        ? 'Tổng số ngày làm thực tế'
                        : 'Tổng số giờ làm thực tế'}
                    </span>
                    {!isManagerView && (
                      <button
                        type="button"
                        onClick={() => navigateToHubSubTab('attendance', 'ledger')}
                        className="inline-flex items-center gap-1 min-h-[40px] md:min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[var(--kg-primary-soft)] text-[11px] font-bold text-[var(--kg-primary-ink)] hover:brightness-95 transition-colors whitespace-nowrap touch-manipulation"
                      >
                        Xem bảng công <ExternalLink size={11} />
                      </button>
                    )}
                  </div>
                  <span className="font-mono tabular-nums font-black text-[var(--kg-text)] text-right shrink-0 whitespace-nowrap">
                    {payroll.payType === 'daily' ? `${workedDays} ngày` : formatHours(totalHours)}
                  </span>
                </div>

                {/* Breakdown of regular hours and overtime */}
                {payroll.payType !== 'daily' && (regularHours > 0 || overtimeHours > 0) && (
                  <div className="bg-[var(--kg-surface-soft)] p-3 rounded-xl border border-[var(--kg-border)] space-y-2">
                    <div className="flex justify-between items-center gap-3 text-xs">
                      <span className="text-[var(--kg-text-muted)] font-medium flex items-center gap-1.5 min-w-0">
                        <Clock size={13} className="text-emerald-500 shrink-0" />
                        <span className="truncate">Giờ làm theo ca chính</span>
                      </span>
                      <span className="font-mono tabular-nums font-bold text-[var(--kg-text)] text-right shrink-0 whitespace-nowrap">
                        {formatHours(regularHours)}
                      </span>
                    </div>
                    {overtimeHours > 0 && (
                      <div className="flex justify-between items-center gap-3 text-xs">
                        <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5 min-w-0">
                          <Zap size={13} className="text-amber-500 shrink-0" />
                          <span className="truncate">Giờ tăng ca (qua đêm &gt; 00:15)</span>
                        </span>
                        <span className="font-mono tabular-nums font-black text-amber-600 dark:text-amber-400 text-right shrink-0 whitespace-nowrap">
                          +{formatHours(overtimeHours)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="w-full h-px bg-[var(--kg-border)]" />

                {/* Base salary from shifts */}
                <div className="flex justify-between items-center gap-3">
                  <span className="text-[var(--kg-text)] font-black min-w-0 flex-1">Tổng lương theo công</span>
                  {isConfigured ? (
                    <span className="font-mono tabular-nums font-black text-[var(--kg-primary-ink)] text-right shrink-0 whitespace-nowrap">
                      {formatVnd(payroll.totalBaseSalary)}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600 dark:text-amber-400 italic text-right shrink-0">
                      Chờ thiết lập mức lương
                    </span>
                  )}
                </div>

                {/* Drill-down Breakdown Rows — Unified inside attendance hub for staff */}
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() =>
                      navigateToHubSubTab(isManagerView ? 'admin_people_pay' : 'attendance', 'discipline')
                    }
                    className="w-full min-h-[44px] sm:min-h-[38px] flex justify-between items-center gap-3 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-[var(--kg-surface-soft)] px-2.5 py-2 rounded-xl transition-colors text-left touch-manipulation"
                  >
                    <span className="inline-flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="truncate">+ Thưởng hiệu suất / chuyên cần</span>
                      <ExternalLink size={12} className="opacity-70 shrink-0" />
                    </span>
                    <span className="font-mono tabular-nums text-right shrink-0 whitespace-nowrap">
                      + {formatVnd(payroll.bonus || 0)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      navigateToHubSubTab(isManagerView ? 'admin_people_pay' : 'attendance', 'discipline')
                    }
                    className="w-full min-h-[44px] sm:min-h-[38px] flex justify-between items-center gap-3 text-rose-500 dark:text-rose-400 font-bold hover:bg-[var(--kg-surface-soft)] px-2.5 py-2 rounded-xl transition-colors text-left touch-manipulation"
                  >
                    <span className="inline-flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="truncate">- Khấu trừ phạt vi phạm</span>
                      <ExternalLink size={12} className="opacity-70 shrink-0" />
                    </span>
                    <span className="font-mono tabular-nums text-right shrink-0 whitespace-nowrap">
                      - {formatVnd(payroll.penalty || 0)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      navigateToHubSubTab(
                        isManagerView ? 'admin_ops' : 'attendance',
                        isManagerView ? 'inbox' : 'advance',
                      )
                    }
                    className="w-full min-h-[44px] sm:min-h-[38px] flex justify-between items-center gap-3 text-amber-600 dark:text-amber-400 font-bold hover:bg-[var(--kg-surface-soft)] px-2.5 py-2 rounded-xl transition-colors text-left touch-manipulation"
                  >
                    <span className="inline-flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="truncate">- Đã tạm ứng trong tháng</span>
                      <ExternalLink size={12} className="opacity-70 shrink-0" />
                    </span>
                    <span className="font-mono tabular-nums text-right shrink-0 whitespace-nowrap">
                      - {formatVnd(payroll.advances || 0)}
                    </span>
                  </button>
                </div>

                <div className="w-full h-px bg-[var(--kg-border)] border-dashed border-t" />

                {/* Net pay row — Toast Touch forest charcoal card */}
                <div className="flex flex-wrap justify-between items-center gap-3 p-4 sm:p-5 rounded-2xl bg-[#202C27] dark:bg-[#101B15] text-white border border-white/10 shadow-sm">
                  <div className="min-w-0">
                    <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#B7C8BC] block">
                      THỰC LĨNH
                    </span>
                    {isConfigured ? (
                      <span className="text-[11px] font-medium text-[#D6E2D9] font-mono tabular-nums">
                        Kỳ lương {salaryMonthLabel(selectedMonth)}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-[#FFD285] font-mono tabular-nums">
                        Đã tích lũy {totalHours.toFixed(1)}h công thực tế
                      </span>
                    )}
                  </div>
                  <span
                    className={`font-mono tabular-nums font-black text-xl sm:text-2xl text-right ml-auto whitespace-nowrap ${
                      isConfigured ? 'text-[#7EDBA8]' : 'text-[#FFD285]'
                    }`}
                  >
                    {isConfigured ? formatVnd(payroll.netPay) : 'Chờ cấu hình'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--kg-surface)] border border-dashed border-[var(--kg-border)] rounded-2xl p-8 text-center text-xs font-bold text-[var(--kg-text-muted)]">
              {isRefreshing ? (
                <div className="flex items-center justify-center gap-2">
                  <RefreshCw size={15} className="animate-spin text-[var(--kg-primary)]" />
                  <span>Đang tính toán bảng lương...</span>
                </div>
              ) : (
                'Chưa có dữ liệu công để lập phiếu lương tháng này.'
              )}
            </div>
          )}
        </div>

        {/* Right Column: Verification & Rate Adjustment */}
        {hasRightRail && (
          <div className="lg:col-span-5 space-y-4 min-w-0">
            {/* Staff 48h Payslip Verification & Dispute Card (or Manager Confirmation Inspector) */}
            {payroll && (
              <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-primary-ink)]">
                      Đối chiếu công lương {salaryMonthLabel(selectedMonth)}
                    </span>
                    <h4 className="text-sm font-black text-[var(--kg-text)] mt-0.5">
                      {workflow.status === 'Locked'
                        ? 'Bảng lương đã khóa sổ giải ngân'
                        : workflow.status === 'Disputed'
                          ? 'Đang xử lý phản hồi sai lệch công/lương'
                          : workflow.status === 'Staff_Confirming'
                            ? isManagerView
                              ? 'Đang chờ nhân viên xác nhận phiếu lương'
                              : 'Vui lòng kiểm tra giờ công & bấm xác nhận phiếu lương'
                            : 'Bảng lương đang ở chế độ tổng hợp tạm tính'}
                    </h4>
                  </div>
                  {slipConfirmation?.status === 'CONFIRMED' && (
                    <KgStatusBadge variant="success" className="max-w-full truncate">
                      <CheckCircle2 size={13} className="shrink-0" />
                      <span className="truncate">Đã xác nhận ({slipConfirmation.updatedAt})</span>
                    </KgStatusBadge>
                  )}
                  {slipConfirmation?.status === 'DISPUTED' && (
                    <KgStatusBadge variant="error">
                      <AlertTriangle size={13} /> Đã báo sai lệch
                    </KgStatusBadge>
                  )}
                  {isManagerView && !slipConfirmation && (
                    <KgStatusBadge variant="neutral">Chờ đối chiếu</KgStatusBadge>
                  )}
                </div>

                {/* Compact workflow progress indicator */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {PAYROLL_WORKFLOW_STEPS.map((step, idx) => {
                    const currentIdx = PAYROLL_WORKFLOW_STEPS.findIndex((s) => s.key === workflow.status);
                    const isCurrent = step.key === workflow.status;
                    const isDone = currentIdx > idx;
                    return (
                      <div
                        key={step.key}
                        className={`rounded-xl px-2.5 py-2 border text-[11px] font-bold transition-colors ${
                          isCurrent
                            ? 'bg-[var(--kg-primary-soft)] border-[var(--kg-primary)]/40 text-[var(--kg-primary-ink)]'
                            : isDone
                              ? 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/25 text-[var(--kg-success)]'
                              : 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)] text-[var(--kg-text-muted)]'
                        }`}
                      >
                        <div className="text-[9.5px] font-mono tabular-nums opacity-80">0{idx + 1}</div>
                        <div className="truncate font-extrabold">{step.label}</div>
                      </div>
                    );
                  })}
                </div>

                {workflow.status === 'Draft' && !isManagerView && (
                  <p className="text-xs font-semibold text-[var(--kg-warning)] bg-[var(--kg-warning-soft)] px-3 py-2.5 rounded-xl border border-[var(--kg-warning)]/25 flex items-start gap-2">
                    <Lock size={14} className="shrink-0 mt-0.5" />
                    <span>Phiếu lương đang ở bản nháp — chờ quản lý gửi đối chiếu</span>
                  </p>
                )}

                {workflow.note && (
                  <p className="text-xs text-[var(--kg-text-muted)] bg-[var(--kg-surface-soft)] px-3 py-2 rounded-xl border border-[var(--kg-border)]">
                    <strong>Ghi chú từ Quản lý:</strong> {workflow.note}
                  </p>
                )}

                {slipConfirmation?.status === 'DISPUTED' && slipConfirmation.note && (
                  <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded-xl border border-rose-500/25">
                    <strong>
                      {isManagerView ? `Phản hồi từ ${payroll.fullname}:` : 'Nội dung bạn đã phản hồi:'}
                    </strong>{' '}
                    {slipConfirmation.note}
                  </p>
                )}

                {!isManagerView && workflow.status !== 'Locked' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 pt-1">
                    <KgButton
                      type="button"
                      variant="primary"
                      size="md"
                      disabled={isWorkflowBusy || workflow.status === 'Draft'}
                      icon={CheckCircle2}
                      onClick={() => setConfirmSlipSheetOpen(true)}
                      className="w-full"
                    >
                      Xác nhận đúng phiếu lương
                    </KgButton>
                    <KgButton
                      type="button"
                      variant="danger"
                      size="md"
                      disabled={isWorkflowBusy}
                      icon={AlertTriangle}
                      onClick={() => {
                        setDisputeError('');
                        setDisputeNote('');
                        setDisputeSheetOpen(true);
                      }}
                      className="w-full"
                    >
                      Báo sai lệch công/lương
                    </KgButton>
                  </div>
                )}
              </div>
            )}

            {/* Embedded Salary Rate Adjustment Bar (Staff only) */}
            {!isManagerView && (
              <EmployeeSalaryCard
                currentUser={currentUser}
                month={selectedMonth}
                onMonthChange={onMonthChange}
                embeddedInPayroll
                payrollRecord={payroll}
              />
            )}
          </div>
        )}
      </div>

      {/* Staff Confirmation Sheet */}
      <KgConfirmSheet
        isOpen={confirmSlipSheetOpen}
        onClose={() => {
          if (!isWorkflowBusy) setConfirmSlipSheetOpen(false);
        }}
        onConfirm={handleConfirmSlip}
        loading={isWorkflowBusy}
        title="Xác nhận khớp phiếu lương?"
        message={`Xác nhận giờ công, thưởng/phạt và tạm ứng trong ${salaryMonthLabel(selectedMonth)} của bạn đã chính xác.`}
        confirmLabel="Xác nhận khớp"
        cancelLabel="Kiểm tra lại"
        variant="primary"
      />

      {/* Staff Dispute Sheet */}
      <KgBottomSheet
        isOpen={disputeSheetOpen}
        onClose={() => {
          if (!isWorkflowBusy) setDisputeSheetOpen(false);
        }}
        title="Báo sai lệch công / lương"
        subtitle={`Kỳ lương ${salaryMonthLabel(selectedMonth)}`}
        footer={
          <div className="flex gap-2.5">
            <KgButton
              variant="secondary"
              className="flex-1"
              disabled={isWorkflowBusy}
              onClick={() => setDisputeSheetOpen(false)}
            >
              Hủy
            </KgButton>
            <KgButton
              variant="danger"
              className="flex-1"
              loading={isWorkflowBusy}
              onClick={handleSubmitDispute}
            >
              Gửi khiếu nại
            </KgButton>
          </div>
        }
      >
        <div className="space-y-3 py-1">
          <label className="block space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--kg-text-muted)]">
              Ghi rõ ngày/ca hoặc khoản phụ cấp bị lệch để Quản lý đối soát{' '}
              <span className="text-[var(--kg-danger)]">*</span>
            </span>
            <textarea
              value={disputeNote}
              onChange={(e) => {
                setDisputeNote(e.target.value);
                if (disputeError) setDisputeError('');
              }}
              rows={4}
              placeholder="Ví dụ: Thiếu 4.5h tăng ca ngày 24/10..."
              className="w-full rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3.5 py-2.5 text-sm text-[var(--kg-text)] outline-none focus:border-[var(--kg-primary)]"
            />
          </label>
          {disputeError && <p className="text-xs font-semibold text-[var(--kg-danger)]">{disputeError}</p>}
        </div>
      </KgBottomSheet>
    </div>
  );
}
