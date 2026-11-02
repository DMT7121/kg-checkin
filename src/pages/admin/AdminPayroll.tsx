import React, { useState, useEffect } from 'react';
import { Calculator as MathIcon, Lock, Unlock, Settings2, HandCoins, Plus, KeyRound, Save, Loader2, ArrowLeft, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import { KgModuleHero, KgBottomSheet, KgInput, KgButton } from '../../components/KgDesignSystem';
import MonthlySalaryManager from '../../components/MonthlySalaryManager';


export default function AdminPayroll() {
  const serverPayrollConfig = useAppStore((s) => s.serverPayrollConfig);
  const currentUser = useAppStore((s) => s.currentUser);
  const users = useAppStore((s) => s.users);
  const setServerPayrollConfig = useAppStore((s) => s.setServerPayrollConfig);
  const setCurrentTab = useAppStore(s => s.setCurrentTab);
  const [formulaLocked, setFormulaLocked] = useState(true);
  const [advanceLimit, setAdvanceLimit] = useState('50');
  const [baseFormula, setBaseFormula] = useState('(HOURS * RATE) + BONUS - PENALTY + ALLOWANCE');
  const [mealAllowance, setMealAllowance] = useState('30000');
  const [allowances, setAllowances] = useState<any[]>([
    { id: 'meal', name: 'Tiền ăn ca', description: 'Ca làm > 4 tiếng', amount: 30000 },
    { id: 'parking', name: 'Gửi xe', description: 'Theo ngày làm việc', amount: 10000 }
  ]);
  const [deductions, setDeductions] = useState<any[]>([
    { id: 'late', name: 'Đi trễ', description: 'Trừ 10,000đ / 15 phút', amount: 10000 }
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [itemSheetMode, setItemSheetMode] = useState<'allowance' | 'deduction' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');

  useEffect(() => {
    if (serverPayrollConfig) {
      setBaseFormula(serverPayrollConfig.baseFormula || '(HOURS * RATE) + BONUS - PENALTY + ALLOWANCE');
      setAdvanceLimit(serverPayrollConfig.maxAdvancePercent?.toString() || '50');
      setMealAllowance(serverPayrollConfig.mealAllowance?.toString() || '30000');
      if (serverPayrollConfig.allowances) setAllowances(serverPayrollConfig.allowances);
      if (serverPayrollConfig.deductions) setDeductions(serverPayrollConfig.deductions);
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
        mealAllowance,
        allowances,
        deductions
      });
      
      if (data && data.ok) {
        setServerPayrollConfig({ 
          baseFormula, 
          maxAdvancePercent: Number(advanceLimit), 
          mealAllowance: Number(mealAllowance),
          allowances,
          deductions
        } as any);
        
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

  const handleAddAllowance = () => {
    setNewItemName('');
    setNewItemDesc('');
    setNewItemAmount('');
    setItemSheetMode('allowance');
  };

  const handleAddDeduction = () => {
    setNewItemName('');
    setNewItemDesc('');
    setNewItemAmount('');
    setItemSheetMode('deduction');
  };

  const handleConfirmAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItemName.trim();
    if (!name || !itemSheetMode) return;
    const numericAmount = Number(newItemAmount) || 0;
    if (itemSheetMode === 'allowance') {
      setAllowances([...allowances, { id: 'allowance_' + Date.now(), name, description: newItemDesc.trim(), amount: numericAmount }]);
    } else {
      setDeductions([...deductions, { id: 'deduction_' + Date.now(), name, description: newItemDesc.trim(), amount: numericAmount }]);
    }
    setItemSheetMode(null);
  };

  const handleRemoveAllowance = (id: string) => { setAllowances(allowances.filter(a => a.id !== id)); };
  const handleRemoveDeduction = (id: string) => { setDeductions(deductions.filter(d => d.id !== id)); };

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <div className="flex mb-2 -mt-2">
        <button type="button" onClick={() => setCurrentTab('admin_income')} className="flex items-center gap-1 text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-primary)] transition-colors">
          <ArrowLeft size={14} /> Quay lại Cài đặt chung
        </button>
      </div>
      <KgModuleHero
        moduleId="admin-payroll"
        title="Lương & Phúc lợi"
        description="Thiết lập công thức tính lương động, cấu hình ứng lương, phụ cấp và các khoản khấu trừ."
        eyebrow="Cấu hình"
        tipTitle="Hướng dẫn Quản trị Tiền lương"
        tips={[
          "Khai báo bảng lương hàng tháng: Chọn từng nhân viên để thiết lập lương theo giờ hoặc lương khoán tháng.",
          "Cấu hình ứng lương: Quy định hạn mức ứng tối đa (thường 30-50% số tiền công đã tích lũy trong tháng).",
          "Sau khi cập nhật mức lương mới, bấm 'Lưu bảng lương' để đồng bộ sang Google Sheets và hệ thống tính lương tự động."
        ]}
      />

      {currentUser?.role === 'admin' && (
        <MonthlySalaryManager currentUser={currentUser} users={users} />
      )}

      {/* Dynamic Formula Builder */}
      <div className="soft3d-card p-5 rounded-2xl  ">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4 border-b dark:border-gray-700 pb-2">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white min-w-0 pr-2">
            <MathIcon size={18} className="mr-2 text-ocean-600 flex-shrink-0" /> <span className="truncate">Dynamic Formula Builder</span>
          </h3>
          <button 
            onClick={formulaLocked ? handleUnlockFormula : () => setFormulaLocked(true)} 
            className={`p-2 rounded-lg transition-colors flex-shrink-0 ${formulaLocked ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
          >
            {formulaLocked ? <Lock size={16} /> : <Unlock size={16} />}
          </button>
        </div>
        
        <div className={`space-y-4 ${formulaLocked ? 'opacity-70 pointer-events-none' : ''}`}>
          <div className="p-4 soft3d-bg rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
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
                <button key={v} className="px-2 py-1 paint-layer border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-mono text-xs rounded hover:bg-gray-200 transition-colors">
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
      <div className="soft3d-card p-5 rounded-2xl">
        <h3 className="font-bold mb-4 border-b border-[var(--kg-border)] pb-2 flex items-center text-[var(--kg-text)]">
          <HandCoins size={18} className="mr-2 text-[var(--kg-primary)]" /> Cấu hình Ứng lương
        </h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="payroll-cutoff-day" className="block text-xs font-bold text-[var(--kg-text-muted)] mb-1">Ngày chốt sổ (Hàng tháng)</label>
              <select id="payroll-cutoff-day" className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] font-semibold">
                <option>Ngày 15</option>
                <option>Ngày 20</option>
                <option>Ngày 25</option>
              </select>
            </div>
            <div>
              <label htmlFor="payroll-advance-limit" className="block text-xs font-bold text-[var(--kg-text-muted)] mb-1">Tỷ lệ tối đa (%)</label>
              <input id="payroll-advance-limit" type="number" value={advanceLimit} onChange={e => setAdvanceLimit(e.target.value)} className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2.5 text-sm font-mono tabular-nums font-bold focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)]" />
            </div>
          </div>
          <p className="text-[11px] text-[var(--kg-text-muted)] bg-[var(--kg-primary-soft)] p-2.5 rounded-xl border border-[var(--kg-primary)]/20">
            Hệ thống sẽ tự động tính toán mức ứng tối đa dựa trên <strong className="font-mono tabular-nums">{advanceLimit}%</strong> số giờ đã làm thực tế của nhân sự cho đến ngày hiện tại.
          </p>
        </div>
      </div>

      {/* Allowances & Deductions */}
      <div className="soft3d-card p-5 rounded-2xl">
        <h3 className="font-bold mb-4 border-b border-[var(--kg-border)] pb-2 flex items-center text-[var(--kg-text)]">
          <Settings2 size={18} className="mr-2 text-[var(--kg-primary)]" /> Phụ cấp & Khấu trừ
        </h3>
        
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-bold text-[var(--kg-text)] mb-2">Phụ cấp (Allowances)</h4>
            <div className="space-y-2">
              {allowances.map(a => (
                <div key={a.id} className="flex flex-wrap justify-between items-center gap-2 bg-[var(--kg-surface-soft)] p-3 rounded-xl border border-[var(--kg-border)]">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-[var(--kg-text)] truncate">{a.name}</p>
                    <p className="text-[11px] text-[var(--kg-text-muted)] truncate"><span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{Number(a.amount).toLocaleString('vi-VN')} đ</span> • {a.description}</p>
                  </div>
                  {!formulaLocked ? (
                     <button type="button" onClick={() => handleRemoveAllowance(a.id)} className="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 py-1 flex-shrink-0 inline-flex items-center gap-1"><Trash2 size={13} /> Xóa</button>
                  ) : (
                     <span className="text-[var(--kg-text-soft)] flex-shrink-0"><Settings2 size={14} /></span>
                  )}
                </div>
              ))}
            </div>
            {!formulaLocked && (
              <button type="button" onClick={handleAddAllowance} className="mt-2.5 text-xs text-[var(--kg-primary)] font-bold flex items-center hover:underline">
                <Plus size={14} className="mr-1" /> Thêm phụ cấp mới
              </button>
            )}
          </div>
          
          <div className="pt-3 border-t border-[var(--kg-border)]">
            <h4 className="text-sm font-bold text-[var(--kg-text)] mb-2">Khấu trừ (Deductions)</h4>
            <div className="space-y-2">
              {deductions.map(d => (
                <div key={d.id} className="flex flex-wrap justify-between items-center gap-2 bg-rose-500/10 p-3 rounded-xl border border-rose-500/25">
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-400 truncate">{d.name}</p>
                    <p className="text-[11px] text-rose-600 dark:text-rose-300 truncate"><span className="font-mono tabular-nums font-bold">{Number(d.amount).toLocaleString('vi-VN')} đ</span> • {d.description}</p>
                  </div>
                  {!formulaLocked ? (
                     <button type="button" onClick={() => handleRemoveDeduction(d.id)} className="text-rose-500 hover:text-rose-700 text-xs font-bold px-2 py-1 flex-shrink-0 inline-flex items-center gap-1"><Trash2 size={13} /> Xóa</button>
                  ) : (
                     <span className="text-rose-500 flex-shrink-0"><Settings2 size={14} /></span>
                  )}
                </div>
              ))}
            </div>
            {!formulaLocked && (
              <button type="button" onClick={handleAddDeduction} className="mt-2.5 text-xs text-rose-600 font-bold flex items-center hover:underline">
                <Plus size={14} className="mr-1" /> Thêm khấu trừ mới
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Salary Matrix */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-5 rounded-2xl shadow-xs">
        <h3 className="font-bold mb-4 border-b border-[var(--kg-border)] pb-2 flex items-center text-[var(--kg-text)]">
          <KeyRound size={18} className="mr-2 text-[var(--kg-primary)]" /> Ma trận Mức Lương
        </h3>
        <p className="text-xs text-[var(--kg-text-muted)] mb-3">Quản lý mức lương cơ bản theo từng phòng ban/cá nhân.</p>
        <button type="button" className="w-full bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)]/40 border border-[var(--kg-border)] text-[var(--kg-text)] font-bold py-2.5 rounded-xl text-sm transition shadow-2xs">
          Mở Bảng Ma Trận Lương
        </button>
      </div>
      
      {/* Save Global Config */}
      <button 
        type="button"
        onClick={handleSavePayrollConfig} 
        disabled={isSaving || formulaLocked} 
        className={`w-full font-black py-3.5 rounded-xl shadow-xs transition-all active:scale-99 flex items-center justify-center mt-6 text-xs sm:text-sm uppercase tracking-wider ${isSaving || formulaLocked ? 'bg-slate-400 text-white cursor-not-allowed opacity-60' : 'bg-[var(--kg-primary)] text-white hover:bg-[var(--kg-primary-hover)]'}`}
      >
        {isSaving ? (
          <><Loader2 size={18} className="animate-spin mr-2" /> Đang lưu...</>
        ) : (
          <><Save size={18} className="mr-2" /> Lưu Tất Cả Thay Đổi Lương</>
        )}
      </button>

      {/* Controlled Sheet for Adding Allowance / Deduction */}
      <KgBottomSheet
        open={itemSheetMode !== null}
        onClose={() => setItemSheetMode(null)}
        title={itemSheetMode === 'allowance' ? 'Thêm khoản phụ cấp mới' : 'Thêm khoản khấu trừ mới'}
        subtitle={itemSheetMode === 'allowance' ? 'Khai báo phụ cấp cộng thêm vào công thức lương.' : 'Khai báo khoản phạt / khấu trừ áp dụng khi vi phạm.'}
        footer={
          <div className="flex justify-end gap-2">
            <KgButton variant="ghost" onClick={() => setItemSheetMode(null)}>
              Hủy
            </KgButton>
            <KgButton
              variant="primary"
              type="submit"
              form="payroll-item-form"
              disabled={!newItemName.trim()}
            >
              {itemSheetMode === 'allowance' ? 'Thêm phụ cấp' : 'Thêm khấu trừ'}
            </KgButton>
          </div>
        }
      >
        <form id="payroll-item-form" onSubmit={handleConfirmAddItem} className="space-y-4">
          <KgInput
            id="payroll-item-name"
            label={itemSheetMode === 'allowance' ? 'Tên khoản phụ cấp' : 'Tên khoản khấu trừ'}
            placeholder={itemSheetMode === 'allowance' ? 'VD: Phụ cấp xăng xe' : 'VD: Quên Check-in'}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            required
          />
          <KgInput
            id="payroll-item-desc"
            label="Mô tả điều kiện áp dụng"
            placeholder="VD: Áp dụng theo ngày đi làm thực tế"
            value={newItemDesc}
            onChange={(e) => setNewItemDesc(e.target.value)}
          />
          <KgInput
            id="payroll-item-amount"
            type="number"
            min="0"
            label="Số tiền định mức (VNĐ)"
            placeholder="VD: 20000"
            value={newItemAmount}
            onChange={(e) => setNewItemAmount(e.target.value)}
            className="font-mono tabular-nums text-right"
          />
        </form>
      </KgBottomSheet>
    </div>
  );
}
