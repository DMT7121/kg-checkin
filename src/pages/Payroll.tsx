import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  Printer,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Unlock,
  X,
  Zap,
} from 'lucide-react';
import {
  KgBottomSheet,
  KgButton,
  KgConfirmSheet,
  KgEmptyState,
  KgErrorState,
  KgInput,
  KgModuleHero,
  KgSkeleton,
  KgStatusBadge,
  KgToast,
  type ToastMessage,
} from '../components/KgDesignSystem';
import EmployeeSalaryCard from '../components/EmployeeSalaryCard';
import { callApi } from '../services/api';
import { useAppStore, type PayrollRecord } from '../store/useAppStore';
import type { TabId } from '../types/navigation';
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

const formatMoney = (amount: number) => `${Math.round(Number(amount) || 0).toLocaleString('vi-VN')} VNĐ`;
const formatHours = (hours: number) => `${Number(hours || 0).toFixed(2)} giờ`;

type StaffFilterStatus = 'all' | 'disputed' | 'pending' | 'confirmed' | 'unconfigured';
type StaffSortKey = 'name_asc' | 'net_desc' | 'net_asc' | 'hours_desc';

export default function Payroll({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const currentUser = useAppStore((state) => state.currentUser);
  const payrollData = useAppStore((state) => state.payrollData);
  const setPayrollData = useAppStore((state) => state.setPayrollData);
  const timesheetData = useAppStore((state) => state.timesheetData);
  const setCurrentTab = useAppStore((state) => state.setCurrentTab);
  const isManagerView = mode === 'admin' && currentUser?.role === 'admin';
  const defaultMonth = useMemo(() => currentSalaryMonth(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [monthPayrollData, setMonthPayrollData] = useState<PayrollRecord[]>(() => payrollData || []);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isWorkflowBusy, setIsWorkflowBusy] = useState(false);
  const [workflow, setWorkflow] = useState<PayrollWorkflowState>(() => ({
    month: defaultMonth,
    status: 'Draft',
    confirmations: {},
  }));
  const [selectedUser, setSelectedUser] = useState<string | null>(
    isManagerView ? null : currentUser?.username || null,
  );

  // Manager table/filter/sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StaffFilterStatus>('all');
  const [sortKey, setSortKey] = useState<StaffSortKey>('name_asc');

  // Drawer / sheet states (replacing Swal modals)
  const [workflowSheetTarget, setWorkflowSheetTarget] = useState<PayrollWorkflowStatus | null>(null);
  const [workflowNote, setWorkflowNote] = useState('');
  const [disputeSheetOpen, setDisputeSheetOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputeError, setDisputeError] = useState('');
  const [confirmSlipSheetOpen, setConfirmSlipSheetOpen] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((title: string, type: ToastMessage['type']) => {
    setToasts((prev) => [...prev.slice(-2), { id: `${Date.now()}_${Math.random()}`, title, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const navigateToHubSubTab = useCallback(
    (hub: TabId, subTab: string) => {
      try {
        sessionStorage.setItem(`kg_hub_subtab_${hub}`, subTab);
      } catch {
        // ignore storage errors
      }
      setCurrentTab(hub);
      window.dispatchEvent(new CustomEvent('kg:subtab-select', { detail: { hub, subTab } }));
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('kg:subtab-select', { detail: { hub, subTab } }));
      }, 30);
    },
    [setCurrentTab],
  );

  const isCurrentMonthSelected = selectedMonth === defaultMonth;
  const activePayrollList =
    isCurrentMonthSelected && monthPayrollData.length === 0 && payrollData.length > 0
      ? payrollData
      : monthPayrollData;

  const effectiveSelectedUser = isManagerView
    ? selectedUser
    : selectedUser || activePayrollList[0]?.username || currentUser?.username || null;

  const handleMonthChange = (nextYm: string) => {
    const resolvedYm = nextYm || defaultMonth;
    setSelectedMonth(resolvedYm);
    if (resolvedYm !== selectedMonth) {
      setMonthPayrollData([]);
      setLoadError('');
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
        workflow.confirmations,
      ),
    [activePayrollList, workflow.confirmations],
  );

  const totalNetPayroll = useMemo(
    () =>
      activePayrollList.reduce(
        (sum, r) => sum + (r.isConfigured !== false ? Math.round(Number(r.netPay) || 0) : 0),
        0,
      ),
    [activePayrollList],
  );

  const unconfiguredCount = useMemo(
    () =>
      activePayrollList.filter(
        (r) => !(r.isConfigured !== false && (r.salaryAmount || r.baseSalaryPerHour || 0) > 0),
      ).length,
    [activePayrollList],
  );

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
    const filtered = activePayrollList.filter((record) => {
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
  }, [activePayrollList, searchTerm, statusFilter, sortKey, getStaffStatusKey]);

  const fetchPayroll = useCallback(
    async (forceSilentCached = false) => {
      if (!currentUser) return;
      const hasCached = isCurrentMonthSelected && payrollData && payrollData.length > 0;
      if (!hasCached || !forceSilentCached) {
        setIsRefreshing(true);
      }
      setLoadError('');
      try {
        const res = await callApi(
          'GET_PAYROLL',
          {
            username: currentUser.username,
            role: currentUser.role,
            month: selectedMonth,
          },
          { background: true, cacheTtlMs: isCurrentMonthSelected ? undefined : 0 },
        );

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
          setLoadError(res?.message || 'Không thể tải dữ liệu bảng lương.');
        }
      } catch {
        if (!hasCached) {
          setLoadError('Mất kết nối máy chủ khi tải bảng lương.');
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [
      currentUser,
      isCurrentMonthSelected,
      payrollData,
      selectedMonth,
      setPayrollData,
      isManagerView,
      selectedUser,
    ],
  );

  useEffect(() => {
    if (!currentUser) return;
    let isCancelled = false;

    const loadPayroll = async () => {
      const hasCached = isCurrentMonthSelected && payrollData && payrollData.length > 0;
      if (!hasCached) {
        setIsRefreshing(true);
      }
      setLoadError('');
      try {
        const res = await callApi(
          'GET_PAYROLL',
          {
            username: currentUser.username,
            role: currentUser.role,
            month: selectedMonth,
          },
          { background: true, cacheTtlMs: isCurrentMonthSelected ? undefined : 0 },
        );

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
          setLoadError(res?.message || 'Không thể tải bảng lương');
        }
      } catch {
        if (!isCancelled) {
          setIsRefreshing(false);
          if (!hasCached) {
            setLoadError('Lỗi kết nối khi tải bảng lương');
          }
        }
      }
    };

    loadPayroll();
    return () => {
      isCancelled = true;
    };
  }, [currentUser?.username, currentUser?.role, isManagerView, selectedMonth, isCurrentMonthSelected, setPayrollData]);

  const openWorkflowStatusDrawer = (targetStatus: PayrollWorkflowStatus) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    setWorkflowNote('');
    setWorkflowSheetTarget(targetStatus);
  };

  const confirmSetWorkflowStatus = async () => {
    if (!currentUser || currentUser.role !== 'admin' || !workflowSheetTarget) return;
    setIsWorkflowBusy(true);
    try {
      const res = await callApi('SET_PAYROLL_WORKFLOW_STATUS', {
        month: selectedMonth,
        status: workflowSheetTarget,
        note: workflowNote.trim(),
      });
      if (res?.ok && res.data?.workflow) {
        setWorkflow({
          month: res.data.workflow.month || selectedMonth,
          status: normalizePayrollWorkflowStatus(res.data.workflow.status),
          updatedBy: res.data.workflow.updatedBy,
          updatedAt: res.data.workflow.updatedAt,
          note: res.data.workflow.note,
          confirmations: res.data.workflow.confirmations || workflow.confirmations,
        });
        setWorkflowSheetTarget(null);
        setWorkflowNote('');
        pushToast(res.message || 'Đã cập nhật trạng thái bảng lương', 'success');
      } else {
        pushToast(res?.message || 'Không thể cập nhật trạng thái bảng lương.', 'error');
      }
    } catch {
      pushToast('Lỗi kết nối khi cập nhật trạng thái bảng lương.', 'error');
    } finally {
      setIsWorkflowBusy(false);
    }
  };

  const submitStaffConfirmation = async (decision: 'CONFIRMED' | 'DISPUTED', note = '') => {
    if (!currentUser) return;
    setIsWorkflowBusy(true);
    try {
      const res = await callApi('CONFIRM_PAYROLL_SLIP', {
        username: currentUser.username,
        fullname: currentUser.fullname,
        month: selectedMonth,
        decision,
        note: note.trim(),
      });
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
        setConfirmSlipSheetOpen(false);
        setDisputeSheetOpen(false);
        setDisputeNote('');
        setDisputeError('');
        pushToast(
          decision === 'CONFIRMED'
            ? 'Đã xác nhận khớp phiếu lương'
            : 'Đã gửi khiếu nại sai lệch cho Quản lý',
          decision === 'CONFIRMED' ? 'success' : 'info',
        );
      } else {
        pushToast(res?.message || 'Không thể gửi phản hồi phiếu lương.', 'error');
      }
    } catch {
      pushToast('Lỗi kết nối khi gửi phản hồi phiếu lương.', 'error');
    } finally {
      setIsWorkflowBusy(false);
    }
  };

  const handleExportBankCsv = () => {
    if (!activePayrollList.length) {
      pushToast('Chưa có danh sách lương để xuất CSV.', 'info');
      return;
    }
    const csvContent = generatePayrollBankCsv(
      activePayrollList,
      selectedMonth,
      workflow.confirmations,
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
    pushToast(`Đã tải xuống CSV ngân hàng kỳ ${salaryMonthLabel(selectedMonth)}`, 'success');
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
      pushToast('Vui lòng cho phép mở cửa sổ bật lên (Pop-up) để in phiếu lương A5.', 'warning');
      return;
    }
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  };

  const rawPayroll = activePayrollList.find((record) => record.username === effectiveSelectedUser);

  const localSummary = useMemo(() => {
    if (!effectiveSelectedUser) return null;
    if (!isCurrentMonthSelected) return null;
    const targetName = rawPayroll?.fullname || currentUser?.fullname || '';
    if (!targetName || !timesheetData) return null;
    const [yStr, mStr] = selectedMonth.split('-');
    const yearNum = Number(yStr) || new Date().getFullYear();
    const monthNum = Number(mStr) || new Date().getMonth() + 1;
    const daysInTargetMonth = new Date(yearNum, monthNum, 0).getDate();
    return calculateEmployeeMonthTimesheet(targetName, timesheetData, daysInTargetMonth, monthNum, yearNum);
  }, [effectiveSelectedUser, isCurrentMonthSelected, rawPayroll?.fullname, currentUser?.fullname, timesheetData, selectedMonth]);

  if (!currentUser) return null;

  const toastContainer = (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-[10100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <KgToast key={t.id} message={t} onClose={dismissToast} />
        ))}
      </AnimatePresence>
    </div>
  );

  // ============================================
  // MANAGER OVERVIEW (List + Sticky Desktop Table)
  // ============================================
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
            onClick={() => navigateToHubSubTab('admin_income', 'config')}
            className="w-full min-h-[48px] bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 rounded-2xl flex items-center justify-between hover:border-[var(--kg-border-strong)] transition-all group shadow-xs active:scale-[0.99] touch-manipulation"
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
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-primary-ink)]">
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
                          ? 'bg-[var(--kg-primary-soft)] border-[var(--kg-primary)]/40 text-[var(--kg-primary-ink)]'
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
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold font-mono tabular-nums">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 font-sans">
                Đã xác nhận: <span className="font-mono">{confirmationSummary.confirmedCount}/{confirmationSummary.totalStaff}</span>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-rose-500/12 text-rose-700 dark:text-rose-300 font-sans">
                Khiếu nại: <span className="font-mono">{confirmationSummary.disputedCount}</span>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] font-sans">
                Chờ đối chiếu: <span className="font-mono">{confirmationSummary.pendingCount}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {workflow.status !== 'Locked' && (
                <KgButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isWorkflowBusy}
                  icon={Send}
                  onClick={() => openWorkflowStatusDrawer('Staff_Confirming')}
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
                >
                  Mở khóa sửa
                </KgButton>
              )}
              <KgButton
                type="button"
                variant="secondary"
                size="sm"
                icon={Download}
                onClick={handleExportBankCsv}
              >
                Xuất CSV Ngân hàng
              </KgButton>
            </div>
          </div>
        </div>

        {/* Employee Payroll List / Desktop Table */}
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--kg-border)] pb-3">
            <h3 className="font-black flex items-center text-[var(--kg-text)] text-sm sm:text-base">
              <FileSpreadsheet size={18} className="mr-2 text-emerald-600 dark:text-emerald-400" />
              Danh sách nhân viên ({salaryMonthLabel(selectedMonth)})
              <span className="ml-2 text-xs font-mono tabular-nums text-[var(--kg-text-muted)]">
                ({filteredSortedList.length}/{activePayrollList.length})
              </span>
            </h3>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-xl bg-[var(--kg-surface-soft)] px-3 py-1.5 border border-[var(--kg-border)] min-h-[44px] sm:min-h-[38px]">
                <Calendar size={14} className="text-[var(--kg-primary)]" />
                <input
                  type="month"
                  aria-label="Chọn tháng bảng lương"
                  value={selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm font-bold font-mono tabular-nums text-[var(--kg-text)] outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => fetchPayroll(false)}
                disabled={isRefreshing}
                aria-label="Tải lại bảng lương"
                className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors touch-manipulation"
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
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
                      >
                        <X size={15} />
                      </button>
                    ) : null
                  }
                />
              </div>
              <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 min-h-[44px] sm:min-h-[42px] text-xs font-bold text-[var(--kg-text)]">
                <ArrowUpDown size={14} className="text-[var(--kg-text-muted)] flex-shrink-0" />
                <span className="sr-only">Sắp xếp theo</span>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as StaffSortKey)}
                  className="bg-transparent outline-none text-xs font-bold text-[var(--kg-text)]"
                >
                  <option value="name_asc">Tên (A - Z)</option>
                  <option value="net_desc">Thực nhận (Cao → Thấp)</option>
                  <option value="net_asc">Thực nhận (Thấp → Cao)</option>
                  <option value="hours_desc">Giờ công (Nhiều nhất)</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `Tất cả (${activePayrollList.length})` },
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
                    className={`min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-full text-xs font-bold border transition-colors touch-manipulation ${
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
            <KgErrorState title="Không thể tải bảng lương" description={loadError} onRetry={() => fetchPayroll(false)} />
          ) : isRefreshing && activePayrollList.length === 0 ? (
            <div className="space-y-2.5">
              <KgSkeleton className="h-14 w-full" />
              <KgSkeleton className="h-14 w-full" />
              <KgSkeleton className="h-14 w-full" />
            </div>
          ) : filteredSortedList.length === 0 ? (
            <KgEmptyState
              icon={FileSpreadsheet}
              title={activePayrollList.length === 0 ? 'Chưa có dữ liệu bảng lương tháng này' : 'Không tìm thấy nhân viên phù hợp'}
              description={
                activePayrollList.length === 0
                  ? 'Hãy kiểm tra lại dữ liệu chấm công hoặc chọn tháng khác.'
                  : 'Thử xóa bộ lọc trạng thái hoặc nhập từ khóa tìm kiếm khác.'
              }
              action={
                activePayrollList.length > 0 ? (
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
              {/* Desktop Sticky-Header Table */}
              <div className="hidden md:block overflow-auto max-h-[560px] rounded-xl border border-[var(--kg-border)]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] text-[var(--kg-text-muted)] uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="py-3 px-3.5 font-bold">Nhân viên</th>
                      <th className="py-3 px-3 font-bold">Trạng thái</th>
                      <th className="py-3 px-3 font-bold text-right">Công / Giờ</th>
                      <th className="py-3 px-3 font-bold text-right">Lương công</th>
                      <th className="py-3 px-3 font-bold text-right">Thưởng</th>
                      <th className="py-3 px-3 font-bold text-right">Phạt</th>
                      <th className="py-3 px-3 font-bold text-right">Tạm ứng</th>
                      <th className="py-3 px-3 font-bold text-right">Thực nhận</th>
                      <th className="py-3 px-3.5 font-bold text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--kg-border)] bg-[var(--kg-surface)]">
                    {filteredSortedList.map((record) => {
                      const isConfigured =
                        record.isConfigured !== false && (record.salaryAmount || record.baseSalaryPerHour || 0) > 0;
                      const staffConf =
                        workflow.confirmations[record.username] ||
                        workflow.confirmations[record.username.toLowerCase()];

                      return (
                        <tr
                          key={record.username}
                          className="hover:bg-[var(--kg-surface-soft)]/70 transition-colors"
                        >
                          <td className="py-3 px-3.5">
                            <button
                              type="button"
                              onClick={() => setSelectedUser(record.username)}
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
                          <td className="py-3 px-3">
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
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-[var(--kg-text)] whitespace-nowrap">
                            {record.payType === 'daily'
                              ? `${record.workedDays || 0} ngày`
                              : formatHours(record.totalHours)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-[var(--kg-text)] whitespace-nowrap">
                            {isConfigured ? formatMoney(record.totalBaseSalary) : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold whitespace-nowrap">
                            +{formatMoney(record.bonus || 0)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-600 dark:text-rose-400 font-semibold whitespace-nowrap">
                            -{formatMoney(record.penalty || 0)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-600 dark:text-amber-400 font-semibold whitespace-nowrap">
                            -{formatMoney(record.advances || 0)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-black text-sm text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {isConfigured ? formatMoney(record.netPay) : 'Chờ cấu hình'}
                          </td>
                          <td className="py-3 px-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handlePrintA5Payslip(record)}
                                title="In phiếu lương A5"
                                aria-label={`In phiếu lương A5 cho ${record.fullname}`}
                                className="min-w-[36px] min-h-[36px] rounded-lg border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] inline-flex items-center justify-center transition-colors"
                              >
                                <Printer size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedUser(record.username)}
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

              {/* Mobile Card List */}
              <div className="md:hidden space-y-2.5">
                {filteredSortedList.map((record) => {
                  const isConfigured =
                    record.isConfigured !== false && (record.salaryAmount || record.baseSalaryPerHour || 0) > 0;
                  const staffConf =
                    workflow.confirmations[record.username] ||
                    workflow.confirmations[record.username.toLowerCase()];
                  return (
                    <button
                      type="button"
                      key={record.username}
                      onClick={() => setSelectedUser(record.username)}
                      className="w-full min-h-[44px] p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] hover:border-emerald-500/40 transition-all text-left flex justify-between items-center group active:scale-[0.99] touch-manipulation"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-[var(--kg-text)] text-sm truncate">{record.fullname}</p>
                          {!isConfigured && <KgStatusBadge variant="warning">Chưa cấu hình</KgStatusBadge>}
                          {staffConf?.status === 'CONFIRMED' && (
                            <KgStatusBadge variant="success">Đã xác nhận</KgStatusBadge>
                          )}
                          {staffConf?.status === 'DISPUTED' && (
                            <KgStatusBadge variant="error">
                              Khiếu nại: {staffConf.note || 'Cần kiểm tra'}
                            </KgStatusBadge>
                          )}
                        </div>
                        <p className="text-xs text-[var(--kg-text-muted)] mt-1 font-medium font-mono tabular-nums">
                          {record.payType === 'daily'
                            ? `${record.workedDays || 0} ngày công`
                            : formatHours(record.totalHours)}
                          {' · '}
                          <span className="font-sans">Thực nhận:</span>{' '}
                          {isConfigured ? (
                            <span className="font-black text-emerald-600 dark:text-emerald-400">
                              {formatMoney(record.netPay)}
                            </span>
                          ) : (
                            <span className="font-bold font-sans text-amber-600 dark:text-amber-400">Chờ cấu hình</span>
                          )}
                        </p>
                      </div>
                      <span className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                        <ChevronRight size={16} />
                      </span>
                    </button>
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
                variant={workflowSheetTarget === 'Locked' && confirmationSummary.disputedCount > 0 ? 'warning' : 'primary'}
                className="flex-1"
                loading={isWorkflowBusy}
                onClick={confirmSetWorkflowStatus}
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
                  Đang có <b className="font-mono tabular-nums">{confirmationSummary.disputedCount}</b> khiếu nại lương! Hãy chắc chắn bạn đã đối soát xong trước khi khóa sổ tháng này.
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

        {toastContainer}
      </div>
    );
  }

  // ============================================
  // PAYSLIP DETAIL VIEW (Staff or Admin Drilldown)
  // ============================================
  const payroll =
    rawPayroll ||
    (localSummary
      ? {
          username: effectiveSelectedUser || currentUser.username,
          fullname: currentUser.fullname,
          baseSalaryPerHour: 0,
          payType: 'hourly' as const,
          salaryAmount: 0,
          standardDays: 30,
          workedDays: localSummary.workedDays ?? 0,
          totalHours: localSummary.totalHours ?? 0,
          regularHours: localSummary.regularHours ?? 0,
          overtimeHours: localSummary.overtimeHours ?? 0,
          totalBaseSalary: 0,
          advances: 0,
          bonus: 0,
          penalty: 0,
          netPay: 0,
          isConfigured: false,
        }
      : null);

  const isConfigured = payroll
    ? payroll.isConfigured !== false && (payroll.salaryAmount || payroll.baseSalaryPerHour || 0) > 0
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
          'Lương giờ/tháng được tính toán tự động dựa trên bảng công thực tế đã chốt của tháng.',
          'Các lượt chấm công Vào ca - Ra ca trong ngày được tự động ghép đôi và tổng hợp chính xác.',
          'Ca làm qua đêm (00:00 - 06:00 ngày hôm sau) thuộc ca ngày hôm trước; nếu ra ca sau 00:15 sẽ được tính tăng ca đầy đủ.',
          'Nếu quản lý chưa cấu hình mức lương, hệ thống sẽ tổng hợp giờ làm việc thực tế chờ thiết lập.',
          'Các khoản phụ cấp, trách nhiệm, thưởng doanh số hoặc tiền tip được cộng dồn theo ca.',
        ]}
        actions={
          <label className="inline-flex items-center gap-2 rounded-xl bg-[var(--kg-surface-soft)] px-3 py-1.5 border border-[var(--kg-border)] min-h-[44px] sm:min-h-[36px]">
            <Calendar size={14} className="text-[var(--kg-primary)]" />
            <span className="sr-only">Chọn tháng xem phiếu lương</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-bold font-mono tabular-nums text-[var(--kg-text)] outline-none"
            />
          </label>
        }
      />

      {loadError && (
        <KgErrorState title="Không thể tải phiếu lương" description={loadError} onRetry={() => fetchPayroll(false)} />
      )}

      {/* Embedded Salary Adjustment Bar (No duplicate base-rate cards & zero eager redundant API calls) */}
      {!isManagerView && (
        <EmployeeSalaryCard
          currentUser={currentUser}
          month={selectedMonth}
          onMonthChange={handleMonthChange}
          embeddedInPayroll
          payrollRecord={payroll}
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
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-primary-ink)]">
                      Đối chiếu công lương {salaryMonthLabel(selectedMonth)}
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
                    <KgStatusBadge variant="success">
                      <CheckCircle2 size={13} /> Đã xác nhận ({myConf.updatedAt})
                    </KgStatusBadge>
                  )}
                  {myConf?.status === 'DISPUTED' && (
                    <KgStatusBadge variant="error">
                      <AlertTriangle size={13} /> Đã báo sai lệch
                    </KgStatusBadge>
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
                    <KgButton
                      type="button"
                      variant="primary"
                      size="md"
                      disabled={isWorkflowBusy}
                      icon={CheckCircle2}
                      onClick={() => setConfirmSlipSheetOpen(true)}
                      className="flex-1 min-w-[160px]"
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
                      className="flex-1 min-w-[160px]"
                    >
                      Báo sai lệch công/lương
                    </KgButton>
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
              Hệ thống hiện đang tổng hợp đầy đủ số giờ làm việc thực tế của bạn (
              <span className="font-mono tabular-nums font-bold">{formatHours(totalHours)}</span> công). Mức lương thực
              lĩnh sẽ được tính tự động ngay khi Quản lý hoàn tất cấu hình mức lương trong tháng.
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
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-black bg-[var(--kg-surface-soft)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:border-emerald-500/40 active:scale-95 transition-all touch-manipulation"
              >
                <Printer size={14} className="flex-shrink-0" /> In phiếu A5 / PDF
              </button>
              <button
                type="button"
                onClick={() => (isManagerView ? setSelectedUser(null) : setCurrentTab('dashboard'))}
                className="inline-flex items-center justify-center min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl text-xs text-[var(--kg-text-muted)] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] hover:text-[var(--kg-text)] font-bold active:scale-95 transition-all touch-manipulation"
              >
                <ChevronRight size={14} className="rotate-180 mr-1 flex-shrink-0" />
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
                <KgStatusBadge variant="warning">Chờ cấu hình lương</KgStatusBadge>
              )}
            </div>

            {/* Total hours / days row with drill-down to Timesheet */}
            <div className="flex justify-between items-center gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[var(--kg-text-muted)] font-medium">
                  {payroll.payType === 'daily' ? 'Tổng số ngày làm thực tế' : 'Tổng số giờ làm thực tế'}
                </span>
                {!isManagerView && (
                  <button
                    type="button"
                    onClick={() => navigateToHubSubTab('attendance', 'timesheet')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--kg-primary-ink)] hover:underline"
                  >
                    Xem bảng công <ExternalLink size={11} />
                  </button>
                )}
              </div>
              <span className="font-mono font-black text-[var(--kg-text)]">
                {payroll.payType === 'daily' ? `${workedDays} ngày` : formatHours(totalHours)}
              </span>
            </div>

            {/* Breakdown of regular hours and overtime */}
            {payroll.payType !== 'daily' && (regularHours > 0 || overtimeHours > 0) && (
              <div className="bg-[var(--kg-surface-soft)] p-3 rounded-xl border border-[var(--kg-border)] space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--kg-text-muted)] font-medium flex items-center gap-1.5">
                    <Clock size={13} className="text-emerald-500" />
                    Giờ làm theo ca chính
                  </span>
                  <span className="font-mono font-bold text-[var(--kg-text)]">{formatHours(regularHours)}</span>
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
                <span className="font-mono font-black text-[var(--kg-primary-ink)]">
                  {formatMoney(payroll.totalBaseSalary)}
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 italic">
                  Chờ thiết lập mức lương
                </span>
              )}
            </div>

            {/* Drill-down Breakdown Rows */}
            <button
              type="button"
              onClick={() => navigateToHubSubTab(isManagerView ? 'admin_income' : 'income', 'discipline')}
              className="w-full flex justify-between items-center gap-3 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-[var(--kg-surface-soft)] px-2 py-1.5 -mx-2 rounded-lg transition-colors text-left"
            >
              <span className="inline-flex items-center gap-1.5">
                + Thưởng hiệu suất / chuyên cần
                <ExternalLink size={12} className="opacity-70" />
              </span>
              <span className="font-mono tabular-nums">+ {formatMoney(payroll.bonus || 0)}</span>
            </button>

            <button
              type="button"
              onClick={() => navigateToHubSubTab(isManagerView ? 'admin_income' : 'income', 'discipline')}
              className="w-full flex justify-between items-center gap-3 text-rose-500 dark:text-rose-400 font-bold hover:bg-[var(--kg-surface-soft)] px-2 py-1.5 -mx-2 rounded-lg transition-colors text-left"
            >
              <span className="inline-flex items-center gap-1.5">
                - Khấu trừ phạt vi phạm
                <ExternalLink size={12} className="opacity-70" />
              </span>
              <span className="font-mono tabular-nums">- {formatMoney(payroll.penalty || 0)}</span>
            </button>

            <button
              type="button"
              onClick={() => navigateToHubSubTab(isManagerView ? 'admin_income' : 'attendance', 'advance')}
              className="w-full flex justify-between items-center gap-3 text-amber-600 dark:text-amber-400 font-bold hover:bg-[var(--kg-surface-soft)] px-2 py-1.5 -mx-2 rounded-lg transition-colors text-left"
            >
              <span className="inline-flex items-center gap-1.5">
                - Đã tạm ứng trong tháng
                <ExternalLink size={12} className="opacity-70" />
              </span>
              <span className="font-mono tabular-nums">- {formatMoney(payroll.advances || 0)}</span>
            </button>

            <div className="w-full h-px bg-[var(--kg-border)] border-dashed border-t" />

            {/* Net pay row */}
            <div
              className={`flex justify-between items-center gap-3 p-4 rounded-2xl border ${
                isConfigured ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'
              }`}
            >
              <div>
                <span
                  className={`font-black text-sm sm:text-base uppercase tracking-wider block ${
                    isConfigured ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'
                  }`}
                >
                  THỰC LĨNH
                </span>
                {!isConfigured && (
                  <span className="text-[11px] font-medium text-amber-700/80 dark:text-amber-300/80 font-mono tabular-nums">
                    Đã tích lũy {totalHours.toFixed(1)}h công thực tế
                  </span>
                )}
              </div>
              <span
                className={`font-mono tabular-nums font-black text-xl sm:text-2xl ${
                  isConfigured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                }`}
              >
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

      {/* Staff Confirmation Sheet */}
      <KgConfirmSheet
        isOpen={confirmSlipSheetOpen}
        onClose={() => {
          if (!isWorkflowBusy) setConfirmSlipSheetOpen(false);
        }}
        onConfirm={() => submitStaffConfirmation('CONFIRMED')}
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
              onClick={() => {
                if (!disputeNote.trim()) {
                  setDisputeError('Vui lòng nhập nội dung sai lệch.');
                  return;
                }
                submitStaffConfirmation('DISPUTED', disputeNote);
              }}
            >
              Gửi khiếu nại
            </KgButton>
          </div>
        }
      >
        <div className="space-y-3 py-1">
          <label className="block space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--kg-text-muted)]">
              Ghi rõ ngày/ca hoặc khoản phụ cấp bị lệch để Quản lý đối soát <span className="text-[var(--kg-danger)]">*</span>
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

      {toastContainer}
    </div>
  );
}
