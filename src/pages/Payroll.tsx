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
      <div className="p-4 space-y-5 animate-slide-up pb-10">
        <KgModuleHero
          moduleId="payroll"
          title="Bảng Lương Toàn Quán"
          description="Theo dõi công, thưởng, phạt và thực nhận của toàn bộ nhân viên."
          eyebrow="Tài chính"
        />

        {currentUser.role === 'admin' && (
          <button
            type="button"
            onClick={() => setCurrentTab('admin_income')}
            className="w-full soft3d-card p-4 rounded-xl flex items-center justify-between hover:shadow-md transition-all group"
          >
            <span className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-200">
              <Settings2 size={17} className="mr-2 text-indigo-500" />
              Cấu hình mức lương theo tháng
            </span>
            <ChevronRight size={17} className="text-gray-400 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        <div className="soft3d-card p-5 rounded-2xl">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-3">
            <FileSpreadsheet size={18} className="mr-2 text-emerald-600" />
            Danh sách nhân viên
          </h3>
          <div className="space-y-3">
            {payrollData.map(record => (
              <button
                type="button"
                key={record.username}
                onClick={() => setSelectedUser(record.username)}
                className="w-full p-4 rounded-xl hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md transition-all text-left paint-layer/50 flex justify-between items-center group"
              >
                <div className="min-w-0">
                  <p className="font-bold text-gray-800 dark:text-gray-200 text-lg truncate">
                    {record.fullname}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {record.payType === 'daily'
                      ? `${record.workedDays || 0} ngày công`
                      : formatHours(record.totalHours)} · Thực nhận:{' '}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(record.netPay)}
                    </span>
                  </p>
                </div>
                <span className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                  <ChevronRight size={20} />
                </span>
              </button>
            ))}
            {!payrollData.length && (
              <div className="text-center py-8 text-sm text-gray-400">Chưa có dữ liệu bảng lương</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const payroll = payrollData.find(record => record.username === selectedUser);

  return (
    <div className="p-4 space-y-5 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="payroll"
        title="Phiếu Lương"
        description={
          payroll
            ? `Thông tin lương và thu nhập tháng này của ${payroll.fullname}.`
            : 'Mức lương và thông tin trao đổi với quản trị viên.'
        }
        eyebrow="Tài chính"
      />

      {!isManagerView && <EmployeeSalaryCard currentUser={currentUser} />}

      {payroll ? (
        <div className="soft3d-card p-6 rounded-2xl">
          <div className="flex flex-wrap justify-between items-center mb-6 pb-4 border-b border-gray-100 dark:border-gray-700 gap-2">
            <h3 className="font-bold text-gray-800 dark:text-white flex items-center text-lg">
              <Calculator size={20} className="mr-2 text-emerald-600" />
              Chi tiết thu nhập
            </h3>
            <button
              type="button"
              onClick={() => (isManagerView ? setSelectedUser(null) : setCurrentTab('dashboard'))}
              className="flex items-center text-sm text-gray-500 hover:text-emerald-600 font-medium"
            >
              <ChevronRight size={16} className="rotate-180 mr-1" />
              Quay lại
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center gap-3">
              <span className="text-gray-500 dark:text-gray-400">
                {payroll.payType === 'daily' ? 'Lương tháng chuẩn 30 ngày' : 'Mức lương / giờ'}
              </span>
              <span className="font-medium text-gray-800 dark:text-gray-200">
                {formatMoney(payroll.salaryAmount ?? payroll.baseSalaryPerHour)}
              </span>
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-gray-500 dark:text-gray-400">
                {payroll.payType === 'daily' ? 'Tổng số ngày làm thực tế' : 'Tổng số giờ làm thực tế'}
              </span>
              <span className="font-bold text-gray-800 dark:text-gray-200">
                {payroll.payType === 'daily'
                  ? `${payroll.workedDays || 0} ngày`
                  : formatHours(payroll.totalHours)}
              </span>
            </div>
            <div className="w-full h-px bg-gray-100 dark:bg-gray-700" />
            <div className="flex justify-between items-center gap-3">
              <span className="text-gray-800 dark:text-gray-200 font-bold">Tổng lương cơ bản</span>
              <span className="font-bold text-ocean-600 dark:text-ocean-400">
                {formatMoney(payroll.totalBaseSalary)}
              </span>
            </div>
            <div className="flex justify-between items-center gap-3 text-green-600 dark:text-green-400">
              <span>Tiền thưởng</span>
              <span>+ {formatMoney(payroll.bonus)}</span>
            </div>
            <div className="flex justify-between items-center gap-3 text-red-500 dark:text-red-400">
              <span>Tiền phạt</span>
              <span>- {formatMoney(payroll.penalty)}</span>
            </div>
            <div className="flex justify-between items-center gap-3 text-orange-500 dark:text-orange-400">
              <span>Đã tạm ứng</span>
              <span>- {formatMoney(payroll.advances)}</span>
            </div>
            <div className="w-full h-px bg-gray-200 dark:bg-gray-700 border-dashed border-t-2" />
            <div className="flex justify-between items-center gap-3 bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
              <span className="text-emerald-800 dark:text-emerald-200 font-extrabold text-lg">
                THỰC NHẬN
              </span>
              <span className="font-black text-2xl text-emerald-600 dark:text-emerald-400">
                {formatMoney(payroll.netPay)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="soft3d-card rounded-2xl p-6 text-center text-sm text-slate-500">
          Chưa có dữ liệu công để lập phiếu lương tháng này.
        </div>
      )}
    </div>
  );
}
