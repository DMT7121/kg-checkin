import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Calculator, ChevronRight, Clock, FileSpreadsheet, Settings2, RefreshCw, Zap } from 'lucide-react';
import Swal from 'sweetalert2';
import { KgModuleHero } from '../components/KgDesignSystem';
import EmployeeSalaryCard from '../components/EmployeeSalaryCard';
import { callApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { saveModuleCache } from '../utils/refreshData';
import { calculateEmployeeMonthTimesheet } from '../utils/timesheetCalculator';

const formatMoney = (amount: number) => `${Math.round(amount).toLocaleString('vi-VN')} đ`;
const formatHours = (hours: number) => `${hours.toFixed(2)} giờ`;

export default function Payroll({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const currentUser = useAppStore(state => state.currentUser);
  const payrollData = useAppStore(state => state.payrollData);
  const setPayrollData = useAppStore(state => state.setPayrollData);
  const timesheetData = useAppStore(state => state.timesheetData);
  const setCurrentTab = useAppStore(state => state.setCurrentTab);
  const isManagerView = mode === 'admin' && (currentUser?.role === 'admin' || currentUser?.role === 'tester');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(
    isManagerView ? null : currentUser?.username || null,
  );

  // Auto-pick user if payrollData is already in cache
  useEffect(() => {
    if (!isManagerView && !selectedUser && payrollData?.length) {
      setSelectedUser(payrollData[0].username);
    }
  }, [payrollData, isManagerView, selectedUser]);

  useEffect(() => {
    if (!currentUser) return;
    let isCancelled = false;

    const loadPayroll = async () => {
      const hasCached = payrollData && payrollData.length > 0;
      if (!hasCached) {
        setIsRefreshing(true);
      }
      try {
        const res = await callApi('GET_PAYROLL', {
          username: currentUser.username,
          role: currentUser.role,
        }, { background: true });

        if (isCancelled) return;
        setIsRefreshing(false);

        if (res?.ok && Array.isArray(res.data?.payroll)) {
          setPayrollData(res.data.payroll);
          saveModuleCache('payroll', res.data.payroll);
          if (!isManagerView && res.data.payroll.length && !selectedUser) {
            setSelectedUser(res.data.payroll[0].username);
          }
        } else if (!hasCached) {
          Swal.fire('Lỗi', res?.message || 'Không thể tải bảng lương', 'error');
        }
      } catch (err) {
        if (!isCancelled) {
          setIsRefreshing(false);
        }
      }
    };

    loadPayroll();
    return () => { isCancelled = true; };
  }, [currentUser?.username, currentUser?.role, isManagerView, setPayrollData]);

  const rawPayroll = payrollData.find(record => record.username === selectedUser);

  // Instant calculation fallback from timesheetData (0ms display)
  const localSummary = useMemo(() => {
    if (!selectedUser) return null;
    const targetName = rawPayroll?.fullname || currentUser?.fullname || '';
    if (!targetName || !timesheetData) return null;
    return calculateEmployeeMonthTimesheet(targetName, timesheetData);
  }, [selectedUser, rawPayroll?.fullname, currentUser?.fullname, timesheetData]);

  if (!currentUser) return null;

  if (isManagerView && !selectedUser) {
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
            onClick={() => setCurrentTab('admin_income')}
            className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 rounded-2xl flex items-center justify-between hover:shadow-md transition-all group shadow-xs active:scale-98"
          >
            <span className="flex items-center text-xs sm:text-sm font-black text-[var(--kg-text)]">
              <Settings2 size={17} className="mr-2 text-indigo-500" />
              Cấu hình công thức & định mức lương
            </span>
            <ChevronRight size={17} className="text-[var(--kg-text-muted)] group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs">
          <h3 className="font-black flex items-center text-[var(--kg-text)] mb-4 border-b border-[var(--kg-border)] pb-3 text-sm sm:text-base">
            <FileSpreadsheet size={18} className="mr-2 text-emerald-600 dark:text-emerald-400" />
            Danh sách nhân viên
          </h3>
          <div className="space-y-2.5">
            {payrollData.map(record => {
              const isConfigured = record.isConfigured !== false && ((record.salaryAmount || record.baseSalaryPerHour || 0) > 0);
              return (
                <button
                  type="button"
                  key={record.username}
                  onClick={() => setSelectedUser(record.username)}
                  className="w-full p-3.5 sm:p-4 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] hover:border-emerald-500/40 hover:shadow-xs transition-all text-left flex justify-between items-center group active:scale-98"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-[var(--kg-text)] text-sm sm:text-base truncate">
                        {record.fullname}
                      </p>
                      {!isConfigured && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                          Chưa cấu hình lương
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--kg-text-muted)] mt-1 font-medium">
                      {record.payType === 'daily'
                        ? `${record.workedDays || 0} ngày công`
                        : formatHours(record.totalHours)}
                      {' · '}Thực nhận:{' '}
                      {isConfigured ? (
                        <span className="font-black text-emerald-600 dark:text-emerald-400">
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
            {!payrollData.length && (
              <div className="text-center py-8 text-xs font-bold text-[var(--kg-text-muted)]">Chưa có dữ liệu bảng lương</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Combine payroll data with localSummary for instant response
  const payroll = rawPayroll || (localSummary ? {
    username: selectedUser || currentUser.username,
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

      {!isManagerView && <EmployeeSalaryCard currentUser={currentUser} />}

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
            <button
              type="button"
              onClick={() => (isManagerView ? setSelectedUser(null) : setCurrentTab('dashboard'))}
              className="inline-flex items-center text-xs text-[var(--kg-text-muted)] hover:text-emerald-600 font-bold active:scale-95 transition-all"
            >
              <ChevronRight size={14} className="rotate-180 mr-1" />
              Quay lại
            </button>
          </div>

          <div className="space-y-3.5 text-xs sm:text-sm">
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

