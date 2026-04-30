import React, { useState, useEffect } from 'react';
import { BadgeDollarSign, Calculator, Calculator as MathIcon, Lock, Unlock, Settings2, HandCoins, AlertOctagon, Plus, KeyRound, Save } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';

export default function AdminPayroll() {
  const { serverPayrollConfig, currentUser, setServerPayrollConfig } = useAppStore();
  const [formulaLocked, setFormulaLocked] = useState(true);
  const [advanceLimit, setAdvanceLimit] = useState('50');
  const [baseFormula, setBaseFormula] = useState('(HOURS * RATE) + BONUS - PENALTY + ALLOWANCE');
  const [mealAllowance, setMealAllowance] = useState('30000');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (serverPayrollConfig) {
      setBaseFormula(serverPayrollConfig.baseFormula);
      setAdvanceLimit(serverPayrollConfig.maxAdvancePercent.toString());
      setMealAllowance(serverPayrollConfig.mealAllowance.toString());
    }
  }, [serverPayrollConfig]);
  
  const handleUnlockFormula = () => {
    Swal.fire({
      title: 'Mở khóa công thức?',
      text: 'Việc thay đổi công thức sẽ ảnh hưởng tới toàn bộ bảng lương. Vui lòng cẩn trọng!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Đồng ý mở khóa',
      cancelButtonText: 'Hủy'
    }).then((result) => {
      if (result.isConfirmed) {
        setFormulaLocked(false);
      }
    });
  };

  const handleSavePayrollConfig = async () => {
    if (!currentUser) return;
    setIsSaving(true);
    
    try {
      const data = await callApi('UPDATE_PAYROLL_CONFIG', {
        role: currentUser.role,
        baseFormula,
        maxAdvancePercent: advanceLimit,
        mealAllowance
      });
      
      if (data && data.ok) {
        setServerPayrollConfig({ 
          baseFormula, 
          maxAdvancePercent: Number(advanceLimit), 
          mealAllowance: Number(mealAllowance) 
        });
        
        Swal.fire({
          icon: 'success',
          title: 'Đã lưu cấu hình Lương',
          text: 'Cấu hình lương và phụ cấp đã được cập nhật thành công.',
          confirmButtonColor: '#006994'
        });
      } else {
        throw new Error(data.message || 'Lỗi không xác định');
      }
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: 'Lỗi lưu cấu hình',
        text: error.message || 'Không thể kết nối đến máy chủ',
        confirmButtonColor: '#dc2626'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-ocean-100 text-ocean-600 flex items-center justify-center">
          <BadgeDollarSign size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Lương & Phúc lợi</h2>
          <p className="text-xs text-gray-500">Thiết lập công thức, ứng lương và phụ cấp</p>
        </div>
      </div>

      {/* Dynamic Formula Builder */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4 border-b dark:border-gray-700 pb-2">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white">
            <MathIcon size={18} className="mr-2 text-ocean-600" /> Dynamic Formula Builder
          </h3>
          <button 
            onClick={formulaLocked ? handleUnlockFormula : () => setFormulaLocked(true)} 
            className={`p-2 rounded-lg transition-colors ${formulaLocked ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
          >
            {formulaLocked ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        </div>
        
        <div className={`space-y-4 ${formulaLocked ? 'opacity-70 pointer-events-none' : ''}`}>
          <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
            <p className="text-xs text-gray-500 mb-2 font-bold uppercase">Công thức hiện tại:</p>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="font-mono text-sm font-bold text-gray-700 dark:text-gray-300 bg-transparent px-1">{baseFormula}</span>
            </div>
            {!formulaLocked && (
               <input 
                 type="text" 
                 value={baseFormula}
                 onChange={(e) => setBaseFormula(e.target.value)}
                 className="mt-3 w-full bg-white border border-gray-300 rounded px-2 py-1 text-sm font-mono dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                 placeholder="(HOURS * RATE) + BONUS - PENALTY + ALLOWANCE"
               />
            )}
          </div>
          
          <div>
            <p className="text-xs text-gray-500 mb-2 font-bold">Biến số có sẵn (Kéo thả hoặc Click để thêm):</p>
            <div className="flex flex-wrap gap-2">
              {['LUONG_CO_BAN', 'TONG_GIO_LAM', 'PHU_CAP', 'KHAU_TRU', 'THUONG', 'GIO_OT'].map(v => (
                <button key={v} className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-mono text-xs rounded hover:bg-gray-200 transition-colors">
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {formulaLocked && (
          <div className="mt-3 text-[10px] text-gray-400 flex items-center">
            <Lock size={10} className="mr-1" /> Mở khóa để chỉnh sửa công thức
          </div>
        )}
      </div>

      {/* Advance Salary Settings */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <HandCoins size={18} className="mr-2 text-ocean-600" /> Cấu hình Ứng lương
        </h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Ngày chốt sổ (Hàng tháng)</label>
              <select className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white">
                <option>Ngày 15</option>
                <option>Ngày 20</option>
                <option>Ngày 25</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Tỷ lệ tối đa (%)</label>
              <input type="number" value={advanceLimit} onChange={e => setAdvanceLimit(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500 dark:bg-gray-900 dark:border-gray-700 dark:text-white" />
            </div>
          </div>
          <p className="text-[10px] text-gray-500 bg-blue-50 dark:bg-blue-900/10 p-2 rounded-lg border border-blue-100 dark:border-blue-900/30">
            Hệ thống sẽ tự động tính toán mức ứng tối đa dựa trên {advanceLimit}% số giờ đã làm thực tế của nhân sự cho đến ngày hiện tại.
          </p>
        </div>
      </div>

      {/* Allowances & Deductions */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <Settings2 size={18} className="mr-2 text-ocean-600" /> Phụ cấp & Khấu trừ
        </h3>
        
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Phụ cấp (Allowances)</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-xs font-bold">Tiền ăn ca</p>
                  <p className="text-[10px] text-gray-500">{Number(mealAllowance).toLocaleString()}đ / Ca làm {'>'} 4 tiếng</p>
                </div>
                {!formulaLocked ? (
                   <input type="number" value={mealAllowance} onChange={(e) => setMealAllowance(e.target.value)} className="w-20 text-xs px-2 py-1 border rounded dark:bg-gray-800 dark:text-white" />
                ) : (
                   <button className="text-ocean-600 hover:text-ocean-700"><Settings2 size={14} /></button>
                )}
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-xs font-bold">Gửi xe</p>
                  <p className="text-[10px] text-gray-500">10,000đ / Ngày</p>
                </div>
                <button className="text-ocean-600 hover:text-ocean-700"><Settings2 size={14} /></button>
              </div>
            </div>
            <button className="mt-2 text-xs text-ocean-600 font-bold flex items-center hover:underline">
              <Plus size={12} className="mr-1" /> Thêm phụ cấp mới
            </button>
          </div>
          
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Khấu trừ (Deductions)</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center bg-red-50 dark:bg-red-900/10 p-2.5 rounded-lg border border-red-100 dark:border-red-900/30">
                <div>
                  <p className="text-xs font-bold text-red-700 dark:text-red-400">Đi trễ</p>
                  <p className="text-[10px] text-red-600">Trừ 10,000đ / 15 phút</p>
                </div>
                <button className="text-red-600 hover:text-red-700"><Settings2 size={14} /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Salary Matrix */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <KeyRound size={18} className="mr-2 text-ocean-600" /> Ma trận Mức Lương
        </h3>
        <p className="text-xs text-gray-500 mb-3">Quản lý mức lương cơ bản theo từng phòng ban/cá nhân.</p>
        <button className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-bold py-2.5 rounded-lg text-sm transition">
          Mở Bảng Ma Trận Lương
        </button>
      </div>
      
      {/* Save Global Config */}
      <button onClick={handleSavePayrollConfig} disabled={isSaving || formulaLocked} className={`w-full font-bold py-3.5 rounded-xl shadow-lg transition flex items-center justify-center mt-6 ${isSaving || formulaLocked ? 'bg-ocean-400 text-white cursor-not-allowed opacity-70' : 'bg-ocean-600 hover:bg-ocean-700 text-white'}`}>
        {isSaving ? (
          <><span className="animate-spin mr-2">⏳</span> Đang lưu...</>
        ) : (
          <><Save size={18} className="mr-2" /> Lưu Tất Cả Thay Đổi Lương</>
        )}
      </button>
    </div>
  );
}
