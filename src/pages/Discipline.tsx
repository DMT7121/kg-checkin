import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import { Award, Plus, Trash2, ArrowUpRight, ArrowDownRight, Search, AlertOctagon, ShieldAlert } from 'lucide-react';
import { KgModuleHero } from '../components/KgDesignSystem';


export default function Discipline({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const store = useAppStore();
  const { currentUser, bonusPenalties, users } = store;
  const isManagerView = mode === 'admin' && (currentUser?.role === 'admin' || currentUser?.role === 'tester');
  
  const [type, setType] = useState<'BONUS' | 'PENALTY'>('BONUS');
  const [targetUsername, setTargetUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const loadRecords = async () => {
    const res = await callApi('GET_BONUS_PENALTY', {
      username: currentUser?.username,
      role: currentUser?.role
    });
    if (res?.ok) {
      store.setBonusPenalties(res.data);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUsername) {
      Swal.fire('Lỗi', 'Vui lòng chọn nhân viên.', 'error');
      return;
    }
    const numAmount = parseInt(amount.replace(/\D/g, ''));
    if (!numAmount || numAmount <= 0) {
      Swal.fire('Lỗi', 'Vui lòng nhập số tiền hợp lệ.', 'error');
      return;
    }
    if (!reason.trim()) {
      Swal.fire('Lỗi', 'Vui lòng nhập lý do.', 'error');
      return;
    }

    const targetUser = users.find(u => u.username === targetUsername);

    Swal.fire({
      title: 'Xác nhận',
      text: `Bạn muốn thêm khoản ${type === 'BONUS' ? 'THƯỞNG' : 'PHẠT'} ${numAmount.toLocaleString()} VNĐ cho ${targetUser?.fullname}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: type === 'BONUS' ? '#10b981' : '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Đồng ý'
    }).then((res) => {
      if (res.isConfirmed) {
        store.setLoading(true, 'Đang ghi nhận...');
        callApi('ADD_BONUS_PENALTY', {
          targetUsername: targetUser?.username,
          targetFullname: targetUser?.fullname,
          type,
          amount: numAmount,
          reason
        }).then((apiRes) => {
          store.setLoading(false);
          if (apiRes?.ok) {
            Swal.fire('Thành công', apiRes.message, 'success');
            setAmount('');
            setReason('');
            loadRecords();
          } else {
            Swal.fire('Lỗi', apiRes?.message || 'Có lỗi xảy ra', 'error');
          }
        });
      }
    });
  };

  const handleDelete = (id: string) => {
    Swal.fire({
      title: 'Xóa bản ghi?',
      text: 'Bạn có chắc chắn muốn xóa bản ghi này?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Xóa'
    }).then(res => {
      if (res.isConfirmed) {
        store.setLoading(true);
        callApi('DELETE_BONUS_PENALTY', { recordId: id }).then(apiRes => {
          store.setLoading(false);
          if (apiRes?.ok) {
            Swal.fire('Thành công', 'Đã xóa bản ghi', 'success');
            loadRecords();
          } else {
            Swal.fire('Lỗi', apiRes?.message || 'Có lỗi xảy ra', 'error');
          }
        });
      }
    });
  };

  const formatMoney = (val: string) => {
    const num = parseInt(val.replace(/\D/g, ''));
    if (isNaN(num)) return '';
    return num.toLocaleString('vi-VN');
  };

  return (
    <div className="p-4 space-y-5 animate-fade-in pb-16">
      <KgModuleHero
        moduleId="discipline"
        title="Vi Phạm & Kỷ Luật"
        description="Theo dõi lịch sử khen thưởng và các chế tài kỷ luật của nhân sự."
        eyebrow="Nội quy"
        features={['Minh bạch thưởng phạt', 'Lưu vết lịch sử', 'Tự động tính lương']}
      />

      {isManagerView && (
        <form onSubmit={handleSubmit} className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs space-y-4">
          <h3 className="font-black flex items-center text-[var(--kg-text)] pb-3 border-b border-[var(--kg-border)] text-sm sm:text-base">
            <Plus size={18} className="mr-2 text-indigo-600 dark:text-indigo-400" /> Thêm bản ghi thưởng / phạt
          </h3>
          
          <div className="space-y-3.5">
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => setType('BONUS')}
                className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-black border-2 transition-all flex justify-center items-center active:scale-95 ${type === 'BONUS' ? 'bg-emerald-50 border-emerald-500 text-emerald-600 dark:bg-emerald-950/30' : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'}`}
              >
                <ArrowUpRight size={16} className="mr-1" /> THƯỞNG (+)
              </button>
              <button 
                type="button"
                onClick={() => setType('PENALTY')}
                className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-black border-2 transition-all flex justify-center items-center active:scale-95 ${type === 'PENALTY' ? 'bg-rose-50 border-rose-500 text-rose-600 dark:bg-rose-950/30' : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'}`}
              >
                <ArrowDownRight size={16} className="mr-1" /> PHẠT (-)
              </button>
            </div>

            <div>
              <label className="block text-xs font-black text-[var(--kg-text)] mb-1">Nhân viên áp dụng</label>
              <select 
                value={targetUsername}
                onChange={(e) => setTargetUsername(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text)] focus:ring-2 focus:ring-indigo-500 outline-none text-xs sm:text-sm font-medium"
              >
                <option value="">-- Chọn nhân viên --</option>
                {users.map(u => (
                  <option key={u.username} value={u.username}>{u.fullname}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-[var(--kg-text)] mb-1">Số tiền (VNĐ)</label>
              <input 
                type="text" 
                value={amount}
                onChange={(e) => setAmount(formatMoney(e.target.value))}
                placeholder="Ví dụ: 100,000"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text)] focus:ring-2 focus:ring-indigo-500 font-black text-base sm:text-lg outline-none"
              />
            </div>
            
            <div>
              <label className="block text-xs font-black text-[var(--kg-text)] mb-1">Lý do cụ thể</label>
              <input 
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do khen thưởng / vi phạm..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text)] focus:ring-2 focus:ring-indigo-500 outline-none text-xs sm:text-sm"
              />
            </div>
            
            <button 
              type="submit" 
              className={`w-full text-white font-black py-3.5 rounded-2xl transition shadow-md active:scale-95 flex items-center justify-center text-xs sm:text-sm uppercase tracking-wider ${type === 'BONUS' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
            >
              <Plus size={18} className="mr-1.5" /> Ghi nhận vào hệ thống
            </button>
          </div>
        </form>
      )}

      {/* History */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs">
        <h3 className="font-black flex items-center text-[var(--kg-text)] mb-4 border-b border-[var(--kg-border)] pb-3 text-sm sm:text-base">
          <Search size={18} className="mr-2 text-indigo-600 dark:text-indigo-400" /> {isManagerView ? 'Lịch sử khen thưởng / kỷ luật toàn quán' : 'Lịch sử khen thưởng & kỷ luật của bạn'}
        </h3>
        
        {bonusPenalties.length === 0 ? (
          <div className="text-center py-8 text-[var(--kg-text-muted)] bg-[var(--kg-surface-soft)] rounded-2xl border border-dashed border-[var(--kg-border)]">
            <Award size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs font-bold">Chưa có bản ghi nào</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {bonusPenalties.map((record) => {
              const isBonus = record.type === 'BONUS';
              
              return (
                <div key={record.id} className={`p-3.5 sm:p-4 rounded-2xl border ${isBonus ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/30' : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/30'}`}>
                  <div className="flex justify-between items-start mb-1.5">
                    <div>
                      {isManagerView && <p className="font-black text-[var(--kg-text)] text-sm">{record.targetFullname}</p>}
                      <p className={`font-black text-base sm:text-lg ${isBonus ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {isBonus ? '+' : '-'}{record.amount.toLocaleString('vi-VN')} đ
                      </p>
                      <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5">{new Date(record.createdAt).toLocaleString('vi-VN')}</p>
                    </div>
                    {isManagerView && (
                      <button 
                        type="button"
                        onClick={() => handleDelete(record.id)}
                        className="p-1.5 text-[var(--kg-text-muted)] hover:text-rose-600 hover:bg-rose-100/50 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--kg-text)] bg-[var(--kg-surface)] border border-[var(--kg-border)] p-2.5 rounded-xl mt-2 font-medium">
                    <span className="font-bold text-[var(--kg-text-muted)] mr-1">Lý do:</span> {record.reason}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
