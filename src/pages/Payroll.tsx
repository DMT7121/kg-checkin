import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { Banknote, FileSpreadsheet, ChevronRight, Calculator, DollarSign, Receipt, Settings2, Save, Plus, Trash2, Lock, Unlock, Users, Edit3, Check, X } from 'lucide-react';
import Swal from 'sweetalert2';
import { KgModuleHero } from '../components/KgDesignSystem';


interface SalaryItem {
  username: string;
  fullname: string;
  baseSalaryPerHour: number;
}

export default function Payroll() {
  const store = useAppStore();
  const { currentUser, payrollData, users } = store;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';
  
  const [selectedUser, setSelectedUser] = useState<string | null>(isAdmin ? null : currentUser?.username || null);
  const [showConfig, setShowConfig] = useState(false);
  
  // Salary config state
  const [salaryItems, setSalaryItems] = useState<SalaryItem[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editRate, setEditRate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Payroll config (formula, allowances, deductions)
  const serverPayrollConfig = store.serverPayrollConfig as any;

  useEffect(() => { loadPayroll(); }, []);

  useEffect(() => {
    if (isAdmin && !configLoaded) loadSalaryConfig();
  }, [isAdmin]);

  const loadPayroll = async () => {
    store.setLoading(true, 'Đang tính toán bảng lương...');
    const res = await callApi('GET_PAYROLL', { username: currentUser?.username, role: currentUser?.role });
    store.setLoading(false);
    if (res?.ok) {
      store.setPayrollData(res.data.payroll);
      if (!isAdmin && res.data.payroll.length > 0) setSelectedUser(res.data.payroll[0].username);
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể tải bảng lương', 'error');
    }
  };

  const loadSalaryConfig = async () => {
    const res = await callApi('GET_SALARY_CONFIG', { role: currentUser?.role });
    if (res?.ok) {
      setSalaryItems(res.data.salaryConfig || []);
      setConfigLoaded(true);
    }
  };

  const saveSalaryConfig = async () => {
    setIsSaving(true);
    try {
      const res = await callApi('UPDATE_SALARY_CONFIG', { role: currentUser?.role, items: salaryItems });
      if (res?.ok) {
        Swal.fire({ icon: 'success', title: 'Đã lưu!', text: 'Bảng lương cá nhân đã cập nhật.', timer: 1500, showConfirmButton: false });
        loadPayroll();
      } else throw new Error(res?.message);
    } catch (e: any) {
      Swal.fire('Lỗi', e.message || 'Không thể lưu', 'error');
    } finally { setIsSaving(false); }
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditRate(salaryItems[idx].baseSalaryPerHour.toString());
  };

  const confirmEdit = () => {
    if (editingIdx === null) return;
    const updated = [...salaryItems];
    updated[editingIdx] = { ...updated[editingIdx], baseSalaryPerHour: Number(editRate) || 20000 };
    setSalaryItems(updated);
    setEditingIdx(null);
  };

  const addMissingUsers = () => {
    const existing = new Set(salaryItems.map(s => s.username));
    const missing = users.filter(u => !existing.has(u.username));
    if (missing.length === 0) { Swal.fire('Thông báo', 'Tất cả nhân viên đã có trong bảng lương.', 'info'); return; }
    setSalaryItems([...salaryItems, ...missing.map(u => ({ username: u.username, fullname: u.fullname, baseSalaryPerHour: 20000 }))]);
  };

  const removeItem = (idx: number) => {
    setSalaryItems(salaryItems.filter((_, i) => i !== idx));
  };

  const formatMoney = (amount: number) => Math.round(amount).toLocaleString('vi-VN') + ' đ';
  const formatHours = (hours: number) => hours.toFixed(2) + ' giờ';

  // ── ADMIN: Config Panel ──
  const ConfigPanel = () => (
    <div className="space-y-4 animate-slide-up">
      {/* Formula Preview */}
      <div className="soft3d-card p-4 rounded-2xl">
        <h3 className="font-bold flex items-center text-gray-800 dark:text-white text-sm mb-3">
          <Calculator size={16} className="mr-2 text-indigo-500 flex-shrink-0" /> Công thức tính lương
        </h3>
        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
          <code className="text-xs font-mono text-indigo-600 dark:text-indigo-400 break-all">
            {serverPayrollConfig?.baseFormula || '(HOURS * RATE) + BONUS - PENALTY + ALLOWANCE'}
          </code>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Tỷ lệ ứng tối đa: <b>{serverPayrollConfig?.maxAdvancePercent || 50}%</b> • 
          Sửa công thức tại <button onClick={() => store.setCurrentTab('admin_payroll')} className="text-indigo-500 underline">Cài đặt nâng cao</button>
        </p>
      </div>

      {/* Allowances & Deductions Summary */}
      {(serverPayrollConfig?.allowances?.length > 0 || serverPayrollConfig?.deductions?.length > 0) && (
        <div className="soft3d-card p-4 rounded-2xl">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white text-sm mb-3">
            <Settings2 size={16} className="mr-2 text-emerald-500 flex-shrink-0" /> Phụ cấp & Khấu trừ
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {serverPayrollConfig?.allowances?.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between p-2 bg-emerald-50 dark:bg-emerald-900/15 rounded-lg text-xs">
                <span className="text-emerald-700 dark:text-emerald-400 font-medium truncate min-w-0">{a.name}</span>
                <span className="text-emerald-600 font-bold flex-shrink-0 ml-2">+{Number(a.amount).toLocaleString()}đ</span>
              </div>
            ))}
            {serverPayrollConfig?.deductions?.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/15 rounded-lg text-xs">
                <span className="text-red-700 dark:text-red-400 font-medium truncate min-w-0">{d.name}</span>
                <span className="text-red-600 font-bold flex-shrink-0 ml-2">-{Number(d.amount).toLocaleString()}đ</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Salary Matrix */}
      <div className="soft3d-card p-4 rounded-2xl">
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white text-sm">
            <Users size={16} className="mr-2 text-ocean-600 flex-shrink-0" /> Mức lương / giờ theo nhân viên
          </h3>
          <button onClick={addMissingUsers} className="text-xs text-ocean-600 font-bold flex items-center hover:underline flex-shrink-0">
            <Plus size={12} className="mr-1" /> Thêm NV thiếu
          </button>
        </div>

        {salaryItems.length === 0 && (
          <p className="text-center text-gray-400 text-xs py-4">Chưa có dữ liệu. Nhấn "Thêm NV thiếu" để tạo.</p>
        )}

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {salaryItems.map((item, idx) => (
            <div key={item.username} className="flex flex-wrap items-center gap-2 p-2.5 paint-layer/50 rounded-lg border border-gray-100 dark:border-gray-800 group">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate text-gray-800 dark:text-gray-200">{item.fullname}</p>
                <p className="text-[10px] text-gray-400 truncate">@{item.username}</p>
              </div>
              {editingIdx === idx ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <input type="number" value={editRate} onChange={e => setEditRate(e.target.value)}
                    className="w-24 px-2 py-1 text-xs border border-ocean-300 rounded-lg bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white text-right font-bold focus:outline-none focus:ring-1 focus:ring-ocean-500"
                    autoFocus onKeyDown={e => e.key === 'Enter' && confirmEdit()} />
                  <button onClick={confirmEdit} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check size={14} /></button>
                  <button onClick={() => setEditingIdx(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-sm font-bold text-ocean-600 dark:text-ocean-400">{formatMoney(item.baseSalaryPerHour)}</span>
                  <button onClick={() => startEdit(idx)} className="p-1 text-gray-400 hover:text-ocean-600 opacity-0 group-hover:opacity-100 transition-opacity"><Edit3 size={13} /></button>
                  <button onClick={() => removeItem(idx)} className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={13} /></button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button onClick={saveSalaryConfig} disabled={isSaving}
          className={`w-full mt-4 font-bold py-3 rounded-xl shadow-lg transition flex items-center justify-center text-sm ${isSaving ? 'bg-ocean-400 text-white cursor-not-allowed opacity-70' : 'bg-ocean-600 hover:bg-ocean-700 text-white active:scale-[0.98]'}`}>
          {isSaving ? <><span className="animate-spin mr-2">⏳</span> Đang lưu...</> : <><Save size={16} className="mr-2" /> Lưu Bảng Lương Cá Nhân</>}
        </button>
      </div>
    </div>
  );

  // ── ADMIN: List all employees ──
  if (isAdmin && !selectedUser) {
    return (
      <div className="p-4 space-y-5 animate-slide-up pb-10">
        <KgModuleHero
          moduleId="payroll"
          title="Bảng Lương Toàn Quán"
          description="Quản lý lương thưởng của toàn bộ nhân viên."
          eyebrow="Tài chính"
        />


        {/* Toggle Config */}
        <button onClick={() => setShowConfig(!showConfig)}
          className="w-full soft3d-card p-3 rounded-xl flex items-center justify-between hover:shadow-md transition-all group">
          <span className="flex items-center text-sm font-bold text-gray-700 dark:text-gray-200">
            <Settings2 size={16} className="mr-2 text-indigo-500" /> Cấu hình Lương & Mức lương cá nhân
          </span>
          <ChevronRight size={16} className={`text-gray-400 transition-transform ${showConfig ? 'rotate-90' : ''}`} />
        </button>

        {showConfig && <ConfigPanel />}

        {/* Employee Payroll List */}
        <div className="soft3d-card p-5 rounded-2xl">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">
            <FileSpreadsheet size={18} className="mr-2 text-emerald-600" /> Danh sách nhân viên
          </h3>
          
          <div className="space-y-3">
            {payrollData.map(p => (
              <div key={p.username} onClick={() => setSelectedUser(p.username)}
                className="p-4 rounded-xl hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md transition-all cursor-pointer paint-layer/50 flex justify-between items-center group">
                <div className="min-w-0">
                  <p className="font-bold text-gray-800 dark:text-gray-200 text-lg truncate">{p.fullname}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {formatHours(p.totalHours)} • Thực nhận: <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(p.netPay)}</span>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
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

  // ── View Details (Payslip) ──
  const p = payrollData.find(x => x.username === selectedUser);
  if (!p) return null;

  return (
    <div className="p-4 space-y-5 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="payroll"
        title="Phiếu Lương"
        description={`Phiếu lương chi tiết tháng này của ${p.fullname}.`}
        eyebrow="Tài chính"
      />


      <div className="soft3d-card p-6 rounded-2xl">
        <div className="flex flex-wrap justify-between items-center mb-6 pb-4 border-b border-gray-100 dark:border-gray-700 gap-2">
          <h3 className="font-bold text-gray-800 dark:text-white flex items-center text-lg">
            <Calculator size={20} className="mr-2 text-emerald-600" /> Chi tiết thu nhập
          </h3>
          <button onClick={() => isAdmin ? setSelectedUser(null) : store.setCurrentTab('dashboard')}
            className="flex items-center text-sm text-gray-500 hover:text-emerald-600 font-medium flex-shrink-0">
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
