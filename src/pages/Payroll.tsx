import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { Banknote, FileSpreadsheet, ChevronRight, Calculator, Download, DollarSign, Receipt } from 'lucide-react';
import Swal from 'sweetalert2';

export default function Payroll() {
  const store = useAppStore();
  const { currentUser, payrollData } = store;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';
  
  const [selectedUser, setSelectedUser] = useState<string | null>(isAdmin ? null : currentUser?.username || null);

  useEffect(() => {
    loadPayroll();
  }, []);

  const loadPayroll = async () => {
    store.setLoading(true, 'Đang tính toán bảng lương...');
    const res = await callApi('GET_PAYROLL', {
      username: currentUser?.username,
      role: currentUser?.role
    });
    store.setLoading(false);
    if (res?.ok) {
      store.setPayrollData(res.data.payroll);
      if (!isAdmin && res.data.payroll.length > 0) {
        setSelectedUser(res.data.payroll[0].username);
      }
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể tải bảng lương', 'error');
    }
  };

  const formatMoney = (amount: number) => {
    return Math.round(amount).toLocaleString('vi-VN') + ' đ';
  };

  const formatHours = (hours: number) => {
    return hours.toFixed(2) + ' giờ';
  };

  // View as Admin: List all
  if (isAdmin && !selectedUser) {
    return (
      <div className="p-4 space-y-5 animate-slide-up pb-10">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-green-500 via-emerald-600 to-teal-700 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between mb-6">
          <div className="relative z-10">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
                <DollarSign size={20} className="text-white" />
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Bảng Lương Toàn Quán</h2>
            </div>
            <p className="text-green-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
              Quản lý lương thưởng của toàn bộ nhân viên.
            </p>
          </div>
          <div className="hidden md:block relative z-10 opacity-80">
            <Receipt size={80} strokeWidth={1} />
          </div>
          {/* Background Decorations */}
          <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
          <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-green-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">
            <FileSpreadsheet size={18} className="mr-2 text-emerald-600" /> Danh sách nhân viên
          </h3>
          
          <div className="space-y-3">
            {payrollData.map(p => (
              <div 
                key={p.username} 
                onClick={() => setSelectedUser(p.username)}
                className="p-4 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md transition-all cursor-pointer bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center group"
              >
                <div>
                  <p className="font-bold text-gray-800 dark:text-gray-200 text-lg">{p.fullname}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {formatHours(p.totalHours)} • Thực nhận: <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(p.netPay)}</span>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ChevronRight size={20} />
                </div>
              </div>
            ))}
            
            {payrollData.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <p>Chưa có dữ liệu bảng lương</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // View Details (Payslip)
  const p = payrollData.find(x => x.username === selectedUser);
  if (!p) return null;

  return (
    <div className="p-4 space-y-5 animate-slide-up pb-10">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-green-500 via-emerald-600 to-teal-700 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between mb-6">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
              <DollarSign size={20} className="text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Phiếu Lương</h2>
          </div>
          <p className="text-green-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
            Tháng này • {p.fullname}
          </p>
        </div>
        <div className="hidden md:block relative z-10 opacity-80">
          <Receipt size={80} strokeWidth={1} />
        </div>
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-green-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-800 dark:text-white flex items-center text-lg">
            <Calculator size={20} className="mr-2 text-emerald-600" /> Chi tiết thu nhập
          </h3>
          <button 
            onClick={() => isAdmin ? setSelectedUser(null) : store.setCurrentTab('dashboard')}
            className="flex items-center text-sm text-gray-500 hover:text-emerald-600 font-medium"
          >
            <ChevronRight size={16} className="rotate-180 mr-1" /> Quay lại
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 dark:text-gray-400">Lương cơ bản / giờ</span>
            <span className="font-medium text-gray-800 dark:text-gray-200">{formatMoney(p.baseSalaryPerHour)}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-gray-500 dark:text-gray-400">Tổng số giờ làm (thực tế)</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">{formatHours(p.totalHours)}</span>
          </div>

          <div className="w-full h-px bg-gray-100 dark:bg-gray-700 my-2"></div>

          <div className="flex justify-between items-center">
            <span className="text-gray-800 dark:text-gray-200 font-bold">Tổng lương cơ bản</span>
            <span className="font-bold text-ocean-600 dark:text-ocean-400">{formatMoney(p.totalBaseSalary)}</span>
          </div>

          <div className="flex justify-between items-center text-green-600 dark:text-green-400">
            <span>Tiền thưởng (Khen thưởng)</span>
            <span>+ {formatMoney(p.bonus)}</span>
          </div>

          <div className="flex justify-between items-center text-red-500 dark:text-red-400">
            <span>Tiền phạt (Kỷ luật / Đi trễ)</span>
            <span>- {formatMoney(p.penalty)}</span>
          </div>

          <div className="flex justify-between items-center text-orange-500 dark:text-orange-400">
            <span>Đã tạm ứng</span>
            <span>- {formatMoney(p.advances)}</span>
          </div>

          <div className="w-full h-px bg-gray-200 dark:bg-gray-700 my-4 border-dashed border-t-2"></div>

          <div className="flex justify-between items-center bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
            <span className="text-emerald-800 dark:text-emerald-200 font-extrabold text-lg">THỰC NHẬN</span>
            <span className="font-black text-2xl text-emerald-600 dark:text-emerald-400">{formatMoney(p.netPay)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
