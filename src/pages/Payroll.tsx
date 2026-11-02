import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  Lock,
  Printer,
  RefreshCw,
  Send,
  Settings2,
  Unlock,
  Zap,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { KgModuleHero } from '../components/KgDesignSystem';
import EmployeeSalaryCard from '../components/EmployeeSalaryCard';
import { callApi } from '../services/api';
import { useAppStore, type PayrollRecord } from '../store/useAppStore';
import { saveModuleCache } from '../utils/refreshData';
import { calculateEmployeeMonthTimesheet } from '../utils/timesheetCalculator';
import { currentSalaryMonth, salaryMonthLabel } from '../types/salary';
import {
  PAYROLL_WORKFLOW_STEPS,
  buildPrintableA5PayslipHtml,
  generatePayrollBankCsv,
  normalizePayrollWorkflowStatus,
  summarizeStaffConfirmations,
  type PayrollWorkflowState,
  type PayrollWorkflowStatus,
} from '../utils/payrollWorkflow';

const formatMoney = (amount: number) => `${Math.round(amount).toLocaleString('vi-VN')} đ`;
const formatHours = (hours: number) => `${hours.toFixed(2)} giờ`;

export default function Payroll({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const currentUser = useAppStore(state => state.currentUser);
  const payrollData = useAppStore(state => state.payrollData);
  const setPayrollData = useAppStore(state => state.setPayrollData);
  const timesheetData = useAppStore(state => state.timesheetData);
  const setCurrentTab = useAppStore(state => state.setCurrentTab);
  const isManagerView = mode === 'admin' && currentUser?.role === 'admin';
  const defaultMonth = useMemo(() => currentSalaryMonth(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [monthPayrollData, setMonthPayrollData] = useState<PayrollRecord[]>(() => payrollData || []);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isWorkflowBusy, setIsWorkflowBusy] = useState(false);
  const [workflow, setWorkflow] = useState<PayrollWorkflowState>(() => ({
    month: defaultMonth,
    status: 'Draft',
    confirmations: {},
  }));
  const [selectedUser, setSelectedUser] = useState<string | null>(
    isManagerView ? null : currentUser?.username || null,
  );

  const isCurrentMonthSelected = selectedMonth === defaultMonth;
  const activePayrollList = isCurrentMonthSelected && monthPayrollData.length === 0 && payrollData.length > 0
    ? payrollData
    : monthPayrollData;

  const effectiveSelectedUser = isManagerView
    ? selectedUser
    : (selectedUser || activePayrollList[0]?.username || currentUser?.username || null);

  const handleMonthChange = (nextYm: string) => {
    const resolvedYm = nextYm || defaultMonth;
    setSelectedMonth(resolvedYm);
    if (resolvedYm !== selectedMonth) {
      setMonthPayrollData([]);
      setWorkflow({
        month: resolvedYm,
        status: 'Draft',
        confirmations: {},
      });
    }
  };

  const confirmationSummary = useMemo(
    () =>
      summarizeStaffConfirmations(
        activePayrollList.map((r) => r.username),
        workflow.confirmations
      ),
    [activePayrollList, workflow.confirmations]
  );

  const totalNetPayroll = useMemo(
    () =>
      activePayrollList.reduce(
        (sum, r) => sum + (r.isConfigured !== false ? Math.round(Number(r.netPay) || 0) : 0),
        0
      ),
    [activePayrollList]
  );

  const handleSetWorkflowStatus = async (targetStatus: PayrollWorkflowStatus) => {
    if (!currentUser || currentUser.role !== 'admin') return;

    if (targetStatus === 'Locked' && confirmationSummary.disputedCount > 0) {
      const warn = await Swal.fire({
        title: `Đang có ${confirmationSummary.disputedCount} khiếu nại lương!`,
        text: 'Bạn có chắc chắn đã xử lý xong sai lệch và muốn khóa sổ lương tháng này?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Đã xử lý, khóa sổ ngay',
        cancelButtonText: 'Để kiểm tra lại',
        confirmButtonColor: '#059669',
      });
      if (!warn.isConfirmed) return;
    }

    const promptRes = await Swal.fire({
      title:
        targetStatus === 'Staff_Confirming'
          ? `Gửi bảng lương ${salaryMonthLabel(selectedMonth)} để NV đối chiếu?`
          : targetStatus === 'Locked'
            ? `Khóa sổ lương ${salaryMonthLabel(selectedMonth)}?`
            : `Mở khóa bảng lương ${salaryMonthLabel(selectedMonth)}?`,
      input: 'text',
      inputPlaceholder: 'Ghi chú kèm theo (tùy chọn)...',
      showCancelButton: true,
      confirmButtonText: 'Xác nhận',
      cancelButtonText: 'Hủy',
    });
    if (!promptRes.isConfirmed) return;

    setIsWorkflowBusy(true);
    const res = await callApi('SET_PAYROLL_WORKFLOW_STATUS', {
      month: selectedMonth,
      status: targetStatus,
      note: String(promptRes.value || '').trim(),
    });
    setIsWorkflowBusy(false);

    if (res?.ok && res.data?.workflow) {
      setWorkflow({
        month: res.data.workflow.month || selectedMonth,
        status: normalizePayrollWorkflowStatus(res.data.workflow.status),
        updatedBy: res.data.workflow.updatedBy,
        updatedAt: res.data.workflow.updatedAt,
        note: res.data.workflow.note,
        confirmations: res.data.workflow.confirmations || workflow.confirmations,
      });
      Swal.fire('Thành công', res.message || 'Đã cập nhật trạng thái bảng lương!', 'success');
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể cập nhật trạng thái bảng lương.', 'error');
    }
  };

  const handleStaffConfirmSlip = async (decision: 'CONFIRMED' | 'DISPUTED') => {
    if (!currentUser) return;
    let note = '';
    if (decision === 'DISPUTED') {
      const ask = await Swal.fire({
        title: 'Báo sai lệch công / lương',
        input: 'textarea',
        inputLabel: 'Ghi rõ ngày/ca hoặc khoản phụ cấp bị lệch để Quản lý đối soát:',
        inputPlaceholder: 'Ví dụ: Thiếu 4.5h tăng ca ngày 24/10...',
        showCancelButton: true,
        confirmButtonText: 'Gửi khiếu nại',
        cancelButtonText: 'Hủy',
        confirmButtonColor: '#e11d48',
        inputValidator: (v) => (!v || !v.trim() ? 'Vui lòng nhập nội dung sai lệch' : null),
      });
      if (!ask.isConfirmed) return;
      note = String(ask.value || '').trim();
    }

    setIsWorkflowBusy(true);
    const res = await callApi('CONFIRM_PAYROLL_SLIP', {
      username: currentUser.username,
      fullname: currentUser.fullname,
      month: selectedMonth,
      decision,
      note,
    });
    setIsWorkflowBusy(false);

    if (res?.ok && res.data?.workflow) {
      setWorkflow((prev) => ({
        month: res.data.workflow.month || selectedMonth,
        status: normalizePayrollWorkflowStatus(res.data.workflow.status),
        updatedBy: res.data.workflow.updatedBy ?? prev.updatedBy,
        updatedAt: res.data.workflow.updatedAt ?? prev.updatedAt,
        note: res.data.workflow.note ?? prev.note,
        confirmations: {
          ...prev.confirmations,
          ...(res.data.workflow.confirmations || {}),
        },
      }));
      Swal.fire(
        decision === 'CONFIRMED' ? 'Đã xác nhận!' : 'Đã gửi khiếu nại',
        res.message || 'Hệ thống đã ghi nhận phản hồi của bạn.',
        decision === 'CONFIRMED' ? 'success' : 'info'
      );
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể gửi phản hồi phiếu lương.', 'error');
    }
  };

  const handleExportBankCsv = () => {
    if (!activePayrollList.length) {
      Swal.fire('Chưa có dữ liệu', 'Chưa có danh sách lương để xuất CSV.', 'info');
      return;
    }
    const csvContent = generatePayrollBankCsv(
      activePayrollList,
      selectedMonth,
      workflow.confirmations
    );
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bang_Luong_KingsGrill_${selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintA5Payslip = (targetRecord: PayrollRecord) => {
    const conf =
      workflow.confirmations[targetRecord.username] ||
      workflow.confirmations[targetRecord.username.toLowerCase()] ||
      null;
    const html = buildPrintableA5PayslipHtml({
      record: targetRecord,
      month: selectedMonth,
      workflowStatus: workflow.status,
      confirmation: conf,
    });
    const printWin = window.open('', '_blank', 'width=680,height=860');
    if (!printWin) {
      Swal.fire('Trình duyệt chặn cửa sổ in', 'Vui lòng cho phép mở cửa sổ bật lên (Pop-up) để in phiếu lương A5.', 'warning');
      return;
    }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  };

  useEffect(() => {
    if (!currentUser) return;
    let isCancelled = false;

    const loadPayroll = async () => {
      const hasCached = isCurrentMonthSelected && payrollData && payrollData.length > 0;
      if (!hasCached) {
        setIsRefreshing(true);
      }
      try {
        const res = await callApi('GET_PAYROLL', {
          username: currentUser.username,
          role: currentUser.role,
          month: selectedMonth,
        }, { background: true, cacheTtlMs: isCurrentMonthSelected ? undefined : 0 });

        if (isCancelled) return;
        setIsRefreshing(false);

        if (res?.ok && Array.isArray(res.data?.payroll)) {
          setMonthPayrollData(res.data.payroll);
          if (res.data?.workflow) {
            setWorkflow({
              month: res.data.workflow.month || selectedMonth,
              status: normalizePayrollWorkflowStatus(res.data.workflow.status),
              updatedBy: res.data.workflow.updatedBy,
              updatedAt: res.data.workflow.updatedAt,
              note: res.data.workflow.note,
              confirmations: res.data.workflow.confirmations || {},
            });
          }
          if (isCurrentMonthSelected) {
            setPayrollData(res.data.payroll);
            saveModuleCache('payroll', res.data.payroll);
          }
          if (!isManagerView && res.data.payroll.length && !selectedUser) {
            setSelectedUser(res.data.payroll[0].username);
          }
        } else if (!hasCached) {
          Swal.fire('Lỗi', res?.message || 'Không thể tải bảng lương', 'error');
        }
      } catch {
        if (!isCancelled) {
          setIsRefreshing(false);
        }
      }
    };

    loadPayroll();
    return () => { isCancelled = true; };
  }, [currentUser?.username, currentUser?.role, isManagerView, selectedMonth, isCurrentMonthSelected, setPayrollData]);

  const rawPayroll = activePayrollList.find(record => record.username === effectiveSelectedUser);

  // Instant calculation fallback from timesheetData for the exact selected month
  const localSummary = useMemo(() => {
    if (!effectiveSelectedUser) return null;
    if (!isCurrentMonthSelected) return null;
    const targetName = rawPayroll?.fullname || currentUser?.fullname || '';
    if (!targetName || !timesheetData) return null;
    const [yStr, mStr] = selectedMonth.split('-');
    const yearNum = Number(yStr) || new Date().getFullYear();
    const monthNum = Number(mStr) || (new Date().getMonth() + 1);
    const daysInTargetMonth = new Date(yearNum, monthNum, 0).getDate();
    return calculateEmployeeMonthTimesheet(targetName, timesheetData, daysInTargetMonth, monthNum, yearNum);
  }, [effectiveSelectedUser, isCurrentMonthSelected, rawPayroll?.fullname, currentUser?.fullname, timesheetData, selectedMonth]);

  if (!currentUser) return null;

  if (isManagerView && !effectiveSelectedUser) {
    return (
      <div className="p-4 space-y-5 animate-fade-in pb-16">
        <KgModuleHero
          moduleId="payroll"
          title="Bảng Lương Toàn Quán"
          description="Theo dõi công, thưởng, phạt và thực nhận của toàn bộ nhân viên."
          eyebrow="Tài chính"
          features={['Tổng hợp tự động', 'Chi tiết giờ công', 'Minh bạch thu nhập']}
        />

        {currentUser.role === 'admin' && (
          <button
            type="button"
            onClick={() => setCurrentTab('admin_payroll')}
            className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 rounded-2xl flex items-center justify-between hover:shadow-md transition-all group shadow-xs active:scale-98"
          >
            <span className="flex items-center text-xs sm:text-sm font-black text-[var(--kg-text)]">
              <Settings2 size={17} className="mr-2 text-[var(--kg-primary)]" />
              Cấu hình công thức &amp; định mức lương
            </span>
            <ChevronRight size={17} className="text-[var(--kg-text-muted)] group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        {/* 4-Step Payroll Approval & Bank CSV Export Card */}
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-primary)]">
                Quy trình chốt lương 4 bước
              </span>
              <h3 className="text-sm sm:text-base font-black text-[var(--kg-text)] mt-0.5">
                Kỳ lương {salaryMonthLabel(selectedMonth)}
              </h3>
            </div>
            <div className="text-right tabular-nums">
              <div className="text-[11px] font-bold text-[var(--kg-text-muted)]">Tổng quỹ thực lĩnh</div>
              <div className="text-base sm:text-lg font-mono font-black text-emerald-600 dark:text-emerald-400">
                {formatMoney(totalNetPayroll)}
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
                  className={`rounded-xl p-2.5 border text-left transition-all ${
                    isDanger
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300'
                      : isLocked
                        ? 'bg-emerald-500/12 border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                        : isActive
                          ? 'bg-[var(--kg-primary-soft)] border-[var(--kg-primary)]/40 text-[var(--kg-primary)]'
                          : 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)] text-[var(--kg-text-muted)]'
                  }`}
                >
                  <div className="text-xs font-black">{st.label}</div>
                  <div className="text-[10px] mt-0.5 leading-snug opacity-85">{st.description}</div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--kg-border)]">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold tabular-nums">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                Đã xác nhận: {confirmationSummary.confirmedCount}/{confirmationSummary.totalStaff}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-rose-500/12 text-rose-700 dark:text-rose-300">
                Khiếu nại: {confirmationSummary.disputedCount}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]">
                Chờ đối chiếu: {confirmationSummary.pendingCount}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {workflow.status !== 'Locked' && (
                <button
                  type="button"
                  disabled={isWorkflowBusy}
                  onClick={() => handleSetWorkflowStatus('Staff_Confirming')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-[var(--kg-primary-soft)] text-[var(--kg-primary)] border border-[var(--kg-primary)]/25 hover:bg-[var(--kg-primary)] hover:text-white transition-all disabled:opacity-50"
                >
                  <Send size={13} /> Gửi NV đối chiếu
                </button>
              )}
              {workflow.status !== 'Locked' ? (
                <button
                  type="button"
                  disabled={isWorkflowBusy}
                  onClick={() => handleSetWorkflowStatus('Locked')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  <Lock size={13} /> Khóa sổ lương
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isWorkflowBusy}
                  onClick={() => handleSetWorkflowStatus('Draft')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-all disabled:opacity-50"
                >
                  <Unlock size={13} /> Mở khóa sửa
                </button>
              )}
              <button
                type="button"
                onClick={handleExportBankCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-[var(--kg-surface-soft)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:border-emerald-500/50 transition-all"
              >
                <Download size={13} /> Xuất CSV Ngân hàng
              </button>
            </div>
          </div>
        </div>

        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-[var(--kg-border)] pb-3">
            <h3 className="font-black flex items-center text-[var(--kg-text)] text-sm sm:text-base">
              <FileSpreadsheet size={18} className="mr-2 text-emerald-600 dark:text-emerald-400" />
              Danh sách nhân viên ({salaryMonthLabel(selectedMonth)})
            </h3>
            <label className="inline-flex items-center gap-2 rounded-xl bg-[var(--kg-surface-soft)] px-3 py-1.5 border border-[var(--kg-border)]">
              <Calendar size={14} className="text-[var(--kg-primary)]" />
              <input
                type="month"
                value={selectedMonth}
                onChange={e => handleMonthChange(e.target.value)}
                className="bg-transparent text-xs sm:text-sm font-bold text-[var(--kg-text)] outline-none"
              />
            </label>
          </div>
          <div className="space-y-2.5">
            {activePayrollList.map(record => {
              const isConfigured = record.isConfigured !== false && ((record.salaryAmount || record.baseSalaryPerHour || 0) > 0);
              const staffConf =
                workflow.confirmations[record.username] ||
                workflow.confirmations[record.username.toLowerCase()];
              return (
                <button
                  type="button"
                  key={record.username}
                  onClick={() => setSelectedUser(record.username)}
                  className="w-full p-3.5 sm:p-4 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] hover:border-emerald-500/40 hover:shadow-xs transition-all text-left flex justify-between items-center group active:scale-98"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-[var(--kg-text)] text-sm sm:text-base truncate">
                        {record.fullname}
                      </p>
                      {!isConfigured && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                          Chưa cấu hình lương
                        </span>
                      )}
                      {staffConf?.status === 'CONFIRMED' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          Đã xác nhận ✓
                        </span>
                      )}
                      {staffConf?.status === 'DISPUTED' && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                          title={staffConf.note}
                        >
                          Khiếu nại: {staffConf.note || 'Cần kiểm tra'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--kg-text-muted)] mt-1 font-medium tabular-nums">
                      {record.payType === 'daily'
                        ? `${record.workedDays || 0} ngày công`
                        : formatHours(record.totalHours)}
                      {' · '}Thực nhận:{' '}
                      {isConfigured ? (
                        <span className="font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {formatMoney(record.netPay)}
                        </span>
                      ) : (
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          Chờ cấu hình
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform flex-shrink-0">
                    <ChevronRight size={16} />
                  </span>
                </button>
              );
            })}
            {!activePayrollList.length && (
              <div className="text-center py-8 text-xs font-bold text-[var(--kg-text-muted)]">
                {isRefreshing ? 'Đang tải bảng lương tháng...' : 'Chưa có dữ liệu bảng lương cho tháng này'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Combine payroll data with localSummary for instant response
  const payroll = rawPayroll || (localSummary ? {
    username: effectiveSelectedUser || currentUser.username,
    fullname: currentUser.fullname,
    baseSalaryPerHour: 0,
    payType: 'hourly' as const,
    salaryAmount: 0,
    standardDays: 30,
    workedDays: localSummary.workedDays,
    totalHours: localSummary.totalHours,
    regularHours: localSummary.regularHours,
    overtimeHours: localSummary.overtimeHours,
    totalBaseSalary: 0,
    advances: 0,
    bonus: 0,
    penalty: 0,
    netPay: 0,
    isConfigured: false,
  } : null);

  const isConfigured = payroll
    ? payroll.isConfigured !== false && ((payroll.salaryAmount || payroll.baseSalaryPerHour || 0) > 0)
    : false;

  const totalHours = payroll?.totalHours ?? localSummary?.totalHours ?? 0;
  const regularHours = payroll?.regularHours ?? localSummary?.regularHours ?? totalHours;
  const overtimeHours = payroll?.overtimeHours ?? localSummary?.overtimeHours ?? 0;
  const workedDays = payroll?.workedDays ?? localSummary?.workedDays ?? 0;

  return (
    <div className="p-4 space-y-5 animate-fade-in pb-16">
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
          "Lương giờ/tháng được tính toán tự động dựa trên bảng công thực tế đã chốt của tháng.",
          "Các lượt chấm công Vào ca - Ra ca trong ngày được tự động ghép đôi và tổng hợp chính xác.",
          "Ca làm qua đêm (00:00 - 06:00 ngày hôm sau) thuộc ca ngày hôm trước; nếu ra ca sau 00:15 sẽ được tính tăng ca đầy đủ.",
          "Nếu quản lý chưa cấu hình mức lương, hệ thống sẽ tổng hợp giờ làm việc thực tế chờ thiết lập.",
          "Các khoản phụ cấp, trách nhiệm, thưởng doanh số hoặc tiền tip được cộng dồn theo ca."
        ]}
      />

      {!isManagerView && (
        <EmployeeSalaryCard
          currentUser={currentUser}
          month={selectedMonth}
          onMonthChange={handleMonthChange}
        />
      )}

      {/* Staff 48h Payslip Verification & Dispute Card */}
      {!isManagerView && payroll && (
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          {(() => {
            const myConf =
              workflow.confirmations[currentUser.username] ||
              workflow.confirmations[currentUser.username.toLowerCase()];
            return (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-primary)]">
                      Đối chiếu công lương tháng {salaryMonthLabel(selectedMonth)}
                    </span>
                    <h4 className="text-sm font-black text-[var(--kg-text)] mt-0.5">
                      {workflow.status === 'Locked'
                        ? 'Bảng lương đã khóa sổ giải ngân'
                        : workflow.status === 'Disputed'
                          ? 'Đang xử lý phản hồi sai lệch công/lương'
                          : workflow.status === 'Staff_Confirming'
                            ? 'Vui lòng kiểm tra giờ công & bấm xác nhận phiếu lương'
                            : 'Bảng lương đang ở chế độ tổng hợp tạm tính'}
                    </h4>
                  </div>
                  {myConf?.status === 'CONFIRMED' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 size={14} /> Đã xác nhận ({myConf.updatedAt})
                    </span>
                  )}
                  {myConf?.status === 'DISPUTED' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                      <AlertTriangle size={14} /> Đã báo sai lệch
                    </span>
                  )}
                </div>

                {workflow.note && (
                  <p className="text-xs text-[var(--kg-text-muted)] bg-[var(--kg-surface-soft)] px-3 py-2 rounded-xl border border-[var(--kg-border)]">
                    <strong>Ghi chú từ Quản lý:</strong> {workflow.note}
                  </p>
                )}

                {myConf?.status === 'DISPUTED' && myConf.note && (
                  <p className="text-xs text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded-xl border border-rose-500/25">
                    <strong>Nội dung bạn đã phản hồi:</strong> {myConf.note}
                  </p>
                )}

                {workflow.status !== 'Locked' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isWorkflowBusy}
                      onClick={() => handleStaffConfirmSlip('CONFIRMED')}
                      className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} /> Xác nhận đúng phiếu lương
                    </button>
                    <button
                      type="button"
                      disabled={isWorkflowBusy}
                      onClick={() => handleStaffConfirmSlip('DISPUTED')}
                      className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-black bg-rose-500/12 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition-all disabled:opacity-50"
                    >
                      <AlertTriangle size={14} /> Báo sai lệch công/lương
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Warning banner when salary is not configured by admin */}
      {payroll && !isConfigured && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 flex items-start gap-3.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
            <AlertCircle size={22} />
          </div>
          <div className="space-y-1 text-xs sm:text-sm flex-1">
            <h4 className="font-black text-amber-900 dark:text-amber-200 text-sm sm:text-base">
              Admin chưa cấu hình lương cho bạn
            </h4>
            <p className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed font-medium">
              Hệ thống hiện đang tổng hợp đầy đủ số giờ làm việc thực tế của bạn ({formatHours(totalHours)} công). Mức lương thực lĩnh sẽ được tính tự động ngay khi Quản lý hoàn tất cấu hình mức lương trong tháng.
            </p>
          </div>
        </div>
      )}

      {payroll ? (
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-6 rounded-2xl shadow-xs space-y-5">
          <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[var(--kg-border)] gap-2">
            <h3 className="font-black text-[var(--kg-text)] flex items-center text-sm sm:text-base">
              <Calculator size={18} className="mr-2 text-emerald-600 dark:text-emerald-400" />
              Chi tiết các khoản thu nhập
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePrintA5Payslip(payroll)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-[var(--kg-surface-soft)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:border-emerald-500/40 active:scale-95 transition-all"
              >
                <Printer size={13} /> In phiếu A5 / PDF
              </button>
              <button
                type="button"
                onClick={() => (isManagerView ? setSelectedUser(null) : setCurrentTab('dashboard'))}
                className="inline-flex items-center text-xs text-[var(--kg-text-muted)] hover:text-emerald-600 font-bold active:scale-95 transition-all"
              >
                <ChevronRight size={14} className="rotate-180 mr-1" />
                Quay lại
              </button>
            </div>
          </div>

          <div className="space-y-3.5 text-xs sm:text-sm tabular-nums">
            {/* Salary rate row */}
            <div className="flex justify-between items-center gap-3">
              <span className="text-[var(--kg-text-muted)] font-medium">
                {payroll.payType === 'daily' ? 'Lương tháng chuẩn 30 ngày' : 'Mức lương cơ bản / giờ'}
              </span>
              {isConfigured ? (
                <span className="font-mono font-bold text-[var(--kg-text)]">
                  {formatMoney(payroll.salaryAmount ?? payroll.baseSalaryPerHour)}
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  Chờ cấu hình lương
                </span>
              )}
            </div>

            {/* Total hours / days row */}
            <div className="flex justify-between items-center gap-3">
              <span className="text-[var(--kg-text-muted)] font-medium">
                {payroll.payType === 'daily' ? 'Tổng số ngày làm thực tế' : 'Tổng số giờ làm thực tế'}
              </span>
              <span className="font-mono font-black text-[var(--kg-text)]">
                {payroll.payType === 'daily'
                  ? `${workedDays} ngày`
                  : formatHours(totalHours)}
              </span>
            </div>

            {/* Breakdown of regular hours and overtime if available */}
            {payroll.payType !== 'daily' && (regularHours > 0 || overtimeHours > 0) && (
              <div className="bg-[var(--kg-surface-soft)] p-3 rounded-xl border border-[var(--kg-border)] space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--kg-text-muted)] font-medium flex items-center gap-1.5">
                    <Clock size={13} className="text-emerald-500" />
                    Giờ làm theo ca chính
                  </span>
                  <span className="font-mono font-bold text-[var(--kg-text)]">
                    {formatHours(regularHours)}
                  </span>
                </div>
                {overtimeHours > 0 && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                      <Zap size={13} className="text-amber-500" />
                      Giờ tăng ca (qua đêm &gt; 00:15)
                    </span>
                    <span className="font-mono font-black text-amber-600 dark:text-amber-400">
                      +{formatHours(overtimeHours)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="w-full h-px bg-[var(--kg-border)]" />

            {/* Base salary from shifts */}
            <div className="flex justify-between items-center gap-3">
              <span className="text-[var(--kg-text)] font-black">Tổng lương theo công</span>
              {isConfigured ? (
                <span className="font-mono font-black text-[var(--kg-primary)] dark:text-cyan-300">
                  {formatMoney(payroll.totalBaseSalary)}
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 italic">
                  Chờ thiết lập mức lương
                </span>
              )}
            </div>

            <div className="flex justify-between items-center gap-3 text-emerald-600 dark:text-emerald-400 font-bold">
              <span>+ Thưởng hiệu suất / chuyên cần</span>
              <span className="font-mono">+ {formatMoney(payroll.bonus || 0)}</span>
            </div>
            <div className="flex justify-between items-center gap-3 text-rose-500 dark:text-rose-400 font-bold">
              <span>- Khấu trừ phạt vi phạm</span>
              <span className="font-mono">- {formatMoney(payroll.penalty || 0)}</span>
            </div>
            <div className="flex justify-between items-center gap-3 text-amber-500 dark:text-amber-400 font-bold">
              <span>- Đã tạm ứng trong tháng</span>
              <span className="font-mono">- {formatMoney(payroll.advances || 0)}</span>
            </div>

            <div className="w-full h-px bg-[var(--kg-border)] border-dashed border-t" />

            {/* Net pay row */}
            <div className={`flex justify-between items-center gap-3 p-4 rounded-2xl border ${
              isConfigured
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-amber-500/10 border-amber-500/20'
            }`}>
              <div>
                <span className={`font-black text-sm sm:text-base uppercase tracking-wider block ${
                  isConfigured ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'
                }`}>
                  THỰC LĨNH
                </span>
                {!isConfigured && (
                  <span className="text-[11px] font-medium text-amber-700/80 dark:text-amber-300/80">
                    Đã tích lũy {totalHours.toFixed(1)}h công thực tế
                  </span>
                )}
              </div>
              <span className={`font-mono font-black text-xl sm:text-2xl ${
                isConfigured
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}>
                {isConfigured ? formatMoney(payroll.netPay) : 'Chờ cấu hình'}
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
  );
}

