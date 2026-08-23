import { useEffect, useState } from 'react';
import { Calculator, ChevronRight, FileSpreadsheet, Settings2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { KgModuleHero } from '../components/KgDesignSystem';
import EmployeeSalaryCard from '../components/EmployeeSalaryCard';
import { callApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';

const formatMoney = (amount: number) => `${Math.round(amount).toLocaleString('vi-VN')} đ`;
const formatHours = (hours: number) => `${hours.toFixed(2)} giờ`;

export default function Payroll({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const currentUser = useAppStore(state => state.currentUser);
  const payrollData = useAppStore(state => state.payrollData);
  const setLoading = useAppStore(state => state.setLoading);
  const setPayrollData = useAppStore(state => state.setPayrollData);
  const setCurrentTab = useAppStore(state => state.setCurrentTab);
  const isManagerView = mode === 'admin' && (currentUser?.role === 'admin' || currentUser?.role === 'tester');
  const [selectedUser, setSelectedUser] = useState<string | null>(
    isManagerView ? null : currentUser?.username || null,
  );

  useEffect(() => {
    if (!currentUser) return;
    const loadPayroll = async () => {
      setLoading(true, 'Đang tính toán bảng lương...');
      const res = await callApi('GET_PAYROLL', {
        username: currentUser.username,
        role: currentUser.role,
      });
      setLoading(false);
      if (res?.ok) {
        setPayrollData(res.data.payroll || []);
        if (!isManagerView && res.data.payroll?.length) {
          setSelectedUser(res.data.payroll[0].username);
        }
      } else {
        Swal.fire('Lỗi', res?.message || 'Không thể tải bảng lương', 'error');
      }
    };
    loadPayroll();
  }, [currentUser, isManagerView, setLoading, setPayrollData]);

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
            {payrollData.map(record => (
              <button
                type="button"
                key={record.username}
                onClick={() => setSelectedUser(record.username)}
                className="w-full p-3.5 sm:p-4 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] hover:border-emerald-500/40 hover:shadow-xs transition-all text-left flex justify-between items-center group active:scale-98"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <p className="font-black text-[var(--kg-text)] text-sm sm:text-base truncate">
                    {record.fullname}
                  </p>
                  <p className="text-xs text-[var(--kg-text-muted)] mt-1 font-medium">
                    {record.payType === 'daily'
                      ? `${record.workedDays || 0} ngày công`
                      : formatHours(record.totalHours)} · Thực nhận:{' '}
                    <span className="font-black text-emerald-600 dark:text-emerald-400">
                      {formatMoney(record.netPay)}
                    </span>
                  </p>
                </div>
                <span className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform flex-shrink-0">
                  <ChevronRight size={16} />
                </span>
              </button>
            ))}
            {!payrollData.length && (
              <div className="text-center py-8 text-xs font-bold text-[var(--kg-text-muted)]">Chưa có dữ liệu bảng lương</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const payroll = payrollData.find(record => record.username === selectedUser);

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
      />

      {!isManagerView && <EmployeeSalaryCard currentUser={currentUser} />}

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
            <div className="flex justify-between items-center gap-3">
              <span className="text-[var(--kg-text-muted)] font-medium">
                {payroll.payType === 'daily' ? 'Lương tháng chuẩn 30 ngày' : 'Mức lương cơ bản / giờ'}
              </span>
              <span className="font-bold text-[var(--kg-text)]">
                {formatMoney(payroll.salaryAmount ?? payroll.baseSalaryPerHour)}
              </span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-[var(--kg-text-muted)] font-medium">
                {payroll.payType === 'daily' ? 'Tổng số ngày làm thực tế' : 'Tổng số giờ làm thực tế'}
              </span>
              <span className="font-black text-[var(--kg-text)]">
                {payroll.payType === 'daily'
                  ? `${payroll.workedDays || 0} ngày`
                  : formatHours(payroll.totalHours)}
              </span>
            </div>
            <div className="w-full h-px bg-[var(--kg-border)]" />
            <div className="flex justify-between items-center gap-3">
              <span className="text-[var(--kg-text)] font-black">Tổng lương theo công</span>
              <span className="font-black text-blue-600 dark:text-indigo-400">
                {formatMoney(payroll.totalBaseSalary)}
              </span>
            </div>
            <div className="flex justify-between items-center gap-3 text-emerald-600 dark:text-emerald-400 font-bold">
              <span>+ Thưởng hiệu suất / chuyên cần</span>
              <span>+ {formatMoney(payroll.bonus)}</span>
            </div>
            <div className="flex justify-between items-center gap-3 text-rose-500 dark:text-rose-400 font-bold">
              <span>- Khấu trừ phạt vi phạm</span>
              <span>- {formatMoney(payroll.penalty)}</span>
            </div>
            <div className="flex justify-between items-center gap-3 text-amber-500 dark:text-amber-400 font-bold">
              <span>- Đã tạm ứng trong tháng</span>
              <span>- {formatMoney(payroll.advances)}</span>
            </div>
            <div className="w-full h-px bg-[var(--kg-border)] border-dashed border-t" />
            <div className="flex justify-between items-center gap-3 bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20">
              <span className="text-emerald-700 dark:text-emerald-300 font-black text-sm sm:text-base uppercase tracking-wider">
                THỰC LĨNH
              </span>
              <span className="font-black text-xl sm:text-2xl text-emerald-600 dark:text-emerald-400">
                {formatMoney(payroll.netPay)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[var(--kg-surface)] border border-dashed border-[var(--kg-border)] rounded-2xl p-8 text-center text-xs font-bold text-[var(--kg-text-muted)]">
          Chưa có dữ liệu công để lập phiếu lương tháng này.
        </div>
      )}
    </div>
  );
}
