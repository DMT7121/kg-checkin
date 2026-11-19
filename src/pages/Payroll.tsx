import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PayrollManagerView from '../components/payroll/PayrollManagerView';
import PayrollSlipView from '../components/payroll/PayrollSlipView';
import { callApi } from '../services/api';
import { useAppStore, type PayrollRecord } from '../store/useAppStore';
import { kgToast } from '../store/useFeedbackStore';
import { isAdminUser } from '../utils/permissions';
import { saveModuleCache } from '../utils/refreshData';
import { calculateEmployeeMonthTimesheet } from '../utils/timesheetCalculator';
import { currentSalaryMonth, salaryMonthLabel } from '../types/salary';
import {
  buildPrintableA5PayslipHtml,
  generatePayrollBankCsv,
  normalizePayrollWorkflowStatus,
  summarizeStaffConfirmations,
  type PayrollWorkflowState,
  type PayrollWorkflowStatus,
} from '../utils/payrollWorkflow';

export default function Payroll({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const currentUser = useAppStore((state) => state.currentUser);
  const payrollData = useAppStore((state) => state.payrollData);
  const setPayrollData = useAppStore((state) => state.setPayrollData);
  const timesheetData = useAppStore((state) => state.timesheetData);
  const setCurrentTab = useAppStore((state) => state.setCurrentTab);
  const isManagerView = mode === 'admin' && isAdminUser(currentUser);
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

  const requestSeqRef = useRef(0);
  const isCurrentMonthSelected = selectedMonth === defaultMonth;

  const activePayrollList =
    isCurrentMonthSelected && monthPayrollData.length === 0 && payrollData.length > 0
      ? payrollData
      : monthPayrollData;

  const effectiveSelectedUser = isManagerView
    ? selectedUser
    : selectedUser || activePayrollList[0]?.username || currentUser?.username || null;

  const handleMonthChange = useCallback(
    (nextYm: string) => {
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
    },
    [defaultMonth, selectedMonth],
  );

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

  const fetchPayroll = useCallback(
    async (silentIfCached = false) => {
      if (!currentUser) return;
      const reqId = ++requestSeqRef.current;
      const cachedPayroll = useAppStore.getState().payrollData;
      const hasCached = isCurrentMonthSelected && Array.isArray(cachedPayroll) && cachedPayroll.length > 0;

      if (!hasCached || !silentIfCached) {
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

        if (reqId !== requestSeqRef.current) return;

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
          if (!isManagerView && res.data.payroll.length) {
            setSelectedUser((prev) => prev || res.data.payroll[0].username);
          }
        } else if (!hasCached) {
          setLoadError(res?.message || 'Không thể tải dữ liệu bảng lương.');
        }
      } catch {
        if (reqId === requestSeqRef.current && !hasCached) {
          setLoadError('Mất kết nối máy chủ khi tải bảng lương.');
        }
      } finally {
        if (reqId === requestSeqRef.current) {
          setIsRefreshing(false);
        }
      }
    },
    [currentUser, isCurrentMonthSelected, selectedMonth, setPayrollData, isManagerView],
  );

  useEffect(() => {
    fetchPayroll(true);
    return () => {
      requestSeqRef.current += 1;
    };
  }, [fetchPayroll]);

  const handleUpdateWorkflowStatus = useCallback(
    async (targetStatus: PayrollWorkflowStatus, note: string): Promise<boolean> => {
      if (!currentUser || !isAdminUser(currentUser)) return false;
      setIsWorkflowBusy(true);
      try {
        const res = await callApi('SET_PAYROLL_WORKFLOW_STATUS', {
          month: selectedMonth,
          status: targetStatus,
          note: note.trim(),
        });
        if (res?.ok && res.data?.workflow) {
          setWorkflow((prev) => ({
            month: res.data.workflow.month || selectedMonth,
            status: normalizePayrollWorkflowStatus(res.data.workflow.status),
            updatedBy: res.data.workflow.updatedBy,
            updatedAt: res.data.workflow.updatedAt,
            note: res.data.workflow.note,
            confirmations: res.data.workflow.confirmations || prev.confirmations,
          }));
          kgToast(res.message || 'Đã cập nhật trạng thái bảng lương', 'success');
          return true;
        }
        kgToast(res?.message || 'Không thể cập nhật trạng thái bảng lương.', 'error');
        return false;
      } catch {
        kgToast('Lỗi kết nối khi cập nhật trạng thái bảng lương.', 'error');
        return false;
      } finally {
        setIsWorkflowBusy(false);
      }
    },
    [currentUser, selectedMonth],
  );

  const handleSubmitStaffConfirmation = useCallback(
    async (decision: 'CONFIRMED' | 'DISPUTED', note = ''): Promise<boolean> => {
      if (!currentUser) return false;
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
          kgToast(
            decision === 'CONFIRMED'
              ? 'Đã xác nhận khớp phiếu lương'
              : 'Đã gửi khiếu nại sai lệch cho Quản lý',
            decision === 'CONFIRMED' ? 'success' : 'info',
          );
          return true;
        }
        kgToast(res?.message || 'Không thể gửi phản hồi phiếu lương.', 'error');
        return false;
      } catch {
        kgToast('Lỗi kết nối khi gửi phản hồi phiếu lương.', 'error');
        return false;
      } finally {
        setIsWorkflowBusy(false);
      }
    },
    [currentUser, selectedMonth],
  );

  const handleExportBankCsv = useCallback(() => {
    if (!activePayrollList.length) {
      kgToast('Chưa có danh sách lương để xuất CSV.', 'info');
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
    kgToast(`Đã tải xuống CSV ngân hàng kỳ ${salaryMonthLabel(selectedMonth)}`, 'success');
  }, [activePayrollList, selectedMonth, workflow.confirmations]);

  const handlePrintA5Payslip = useCallback(
    (targetRecord: PayrollRecord) => {
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
        kgToast('Vui lòng cho phép mở cửa sổ bật lên (Pop-up) để in phiếu lương A5.', 'warning');
        return;
      }
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
    },
    [selectedMonth, workflow.confirmations, workflow.status],
  );

  const rawPayroll = activePayrollList.find((record) => record.username === effectiveSelectedUser);

  const localSummary = useMemo(() => {
    if (!effectiveSelectedUser || !isCurrentMonthSelected) return null;
    const targetName = rawPayroll?.fullname || currentUser?.fullname || '';
    if (!targetName || !timesheetData) return null;
    const [yStr, mStr] = selectedMonth.split('-');
    const yearNum = Number(yStr) || new Date().getFullYear();
    const monthNum = Number(mStr) || new Date().getMonth() + 1;
    const daysInTargetMonth = new Date(yearNum, monthNum, 0).getDate();
    return calculateEmployeeMonthTimesheet(
      targetName,
      timesheetData,
      daysInTargetMonth,
      monthNum,
      yearNum,
    );
  }, [
    effectiveSelectedUser,
    isCurrentMonthSelected,
    rawPayroll?.fullname,
    currentUser?.fullname,
    timesheetData,
    selectedMonth,
  ]);

  if (!currentUser) return null;

  if (isManagerView && !effectiveSelectedUser) {
    return (
      <PayrollManagerView
        currentUser={currentUser}
        selectedMonth={selectedMonth}
        onMonthChange={handleMonthChange}
        payrollList={activePayrollList}
        workflow={workflow}
        confirmationSummary={confirmationSummary}
        totalNetPayroll={totalNetPayroll}
        unconfiguredCount={unconfiguredCount}
        isRefreshing={isRefreshing}
        loadError={loadError}
        isWorkflowBusy={isWorkflowBusy}
        onRefresh={() => fetchPayroll(false)}
        onSelectUser={setSelectedUser}
        onExportBankCsv={handleExportBankCsv}
        onPrintA5Payslip={handlePrintA5Payslip}
        onUpdateWorkflowStatus={handleUpdateWorkflowStatus}
      />
    );
  }

  const payroll: PayrollRecord | null =
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

  const totalHours = payroll?.totalHours ?? localSummary?.totalHours ?? 0;
  const regularHours = payroll?.regularHours ?? localSummary?.regularHours ?? totalHours;
  const overtimeHours = payroll?.overtimeHours ?? localSummary?.overtimeHours ?? 0;
  const workedDays = payroll?.workedDays ?? localSummary?.workedDays ?? 0;

  return (
    <PayrollSlipView
      currentUser={currentUser}
      isManagerView={isManagerView}
      selectedMonth={selectedMonth}
      onMonthChange={handleMonthChange}
      payroll={payroll}
      totalHours={totalHours}
      regularHours={regularHours}
      overtimeHours={overtimeHours}
      workedDays={workedDays}
      workflow={workflow}
      isRefreshing={isRefreshing}
      loadError={loadError}
      isWorkflowBusy={isWorkflowBusy}
      onRefresh={() => fetchPayroll(false)}
      onBack={() => (isManagerView ? setSelectedUser(null) : setCurrentTab('dashboard'))}
      onPrintA5Payslip={handlePrintA5Payslip}
      onSubmitStaffConfirmation={handleSubmitStaffConfirmation}
    />
  );
}
