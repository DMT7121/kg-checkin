import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import { KgModuleHero } from '../components/KgDesignSystem';

import { BadgeDollarSign, Send, History, CheckCheck, XCircle, Clock, Banknote, Wallet } from 'lucide-react';

export default function Advance({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const store = useAppStore();
  const { currentUser, advances } = store;
  const isManagerView = mode === 'admin' && (currentUser?.role === 'admin' || currentUser?.role === 'tester');
  
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const loadAdvances = async () => {
    const res = await callApi('GET_ADVANCES', {
      username: currentUser?.username,
      role: currentUser?.role
    });
    if (res?.ok) {
      store.setAdvances(res.data);
    }
  };

  useEffect(() => {
    loadAdvances();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseInt(amount.replace(/\D/g, ''));
    if (!numAmount || numAmount <= 0) {
      Swal.fire('Lỗi', 'Vui lòng nhập số tiền hợp lệ.', 'error');
      return;
    }
    if (!reason.trim()) {
      Swal.fire('Lỗi', 'Vui lòng nhập lý do ứng lương.', 'error');
      return;
    }

    Swal.fire({
      title: 'Xác nhận',
      text: `Bạn muốn ứng ${numAmount.toLocaleString()} VNĐ?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Gửi yêu cầu'
    }).then((res) => {
      if (res.isConfirmed) {
        store.setLoading(true, 'Đang gửi...');
        callApi('SUBMIT_ADVANCE', {
          username: currentUser?.username,
          fullname: currentUser?.fullname,
          amount: numAmount,
          reason: reason
        }).then((apiRes) => {
          store.setLoading(false);
          if (apiRes?.ok) {
            Swal.fire('Thành công', 'Đã gửi yêu cầu ứng lương. Vui lòng chờ Quản lý duyệt.', 'success');
            setAmount('');
            setReason('');
            loadAdvances();
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

  const handleApprove = (id: string, action: 'APPROVE' | 'REJECT') => {
    Swal.fire({
      title: action === 'APPROVE' ? 'Duyệt yêu cầu?' : 'Từ chối yêu cầu?',
      text: action === 'APPROVE' ? 'Số tiền này sẽ được ghi nhận vào Bảng lương tháng.' : 'Yêu cầu này sẽ bị hủy.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: action === 'APPROVE' ? '#10b981' : '#ef4444',
      confirmButtonText: action === 'APPROVE' ? 'Duyệt' : 'Từ chối'
    }).then(res => {
      if (res.isConfirmed) {
        store.setLoading(true);
        callApi('APPROVE_ADVANCE', { advanceId: id, action }).then(apiRes => {
          store.setLoading(false);
          if (apiRes?.ok) {
            Swal.fire('Thành công', 'Đã cập nhật trạng thái', 'success');
            loadAdvances();
          } else {
            Swal.fire('Lỗi', apiRes?.message || 'Có lỗi xảy ra', 'error');
          }
        });
      }
    });
  };

  return (
    <div className="p-4 space-y-5 animate-fade-in pb-16">
      <KgModuleHero
        moduleId="advance"
        title="Tạm Ứng Lương"
        description="Quản lý và đăng ký đề xuất tạm ứng lương hàng tháng an toàn, minh bạch."
        eyebrow="Tài chính"
        features={['Hạn mức tự động', 'Duyệt nhanh trực tuyến', 'Khấu trừ tự động']}
      />

      {!isManagerView && (
        <form onSubmit={handleSubmit} className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs space-y-4">
          <h3 className="font-black flex items-center text-[var(--kg-text)] pb-3 border-b border-[var(--kg-border)] text-sm sm:text-base">
            <Send size={16} className="mr-2 text-emerald-600 dark:text-emerald-400" /> Tạo đề xuất ứng lương mới
          </h3>
          
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-black text-[var(--kg-text)] mb-1">Số tiền muốn ứng (VNĐ)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--kg-text-muted)] font-bold text-xs">
                  VNĐ
                </div>
                <input 
                  type="text" 
                  value={amount}
                  onChange={(e) => setAmount(formatMoney(e.target.value))}
                  placeholder="Ví dụ: 500,000"
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] focus:ring-2 focus:ring-emerald-500 font-black text-emerald-600 dark:text-emerald-400 text-base sm:text-lg transition-all outline-none"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-black text-[var(--kg-text)] mb-1">Lý do xin ứng</label>
              <textarea 
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do cụ thể (Chi phí sinh hoạt đột xuất, việc gia đình...)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] focus:ring-2 focus:ring-emerald-500 text-[var(--kg-text)] transition-all outline-none min-h-[90px] text-xs sm:text-sm"
              />
            </div>
            
            <button 
              type="submit" 
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black py-3.5 rounded-2xl transition shadow-md active:scale-95 flex items-center justify-center text-xs sm:text-sm uppercase tracking-wider"
            >
              <Send size={16} className="mr-1.5" /> Gửi yêu cầu ứng lương
            </button>
          </div>
        </form>
      )}

      {/* History */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs">
        <h3 className="font-black flex items-center text-[var(--kg-text)] mb-4 border-b border-[var(--kg-border)] pb-3 text-sm sm:text-base">
          <History size={16} className="mr-2 text-indigo-600 dark:text-indigo-400" /> {isManagerView ? 'Danh sách yêu cầu ứng lương toàn quán' : 'Lịch sử ứng lương của bạn'}
        </h3>
        
        {advances.length === 0 ? (
          <div className="text-center py-8 text-[var(--kg-text-muted)] bg-[var(--kg-surface-soft)] rounded-2xl border border-dashed border-[var(--kg-border)]">
            <BadgeDollarSign size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs font-bold">Chưa có dữ liệu ứng lương</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {advances.map((adv) => {
              const isPending = adv.status === 'Pending';
              const isApproved = adv.status === 'Approved';
              
              return (
                <div key={adv.id} className={`p-3.5 sm:p-4 rounded-2xl border ${isPending ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/30' : isApproved ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/30' : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/30'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      {isManagerView && <p className="font-black text-[var(--kg-text)] text-sm">{adv.fullname}</p>}
                      <p className="font-black text-base sm:text-lg text-[var(--kg-text)]">{adv.amount.toLocaleString('vi-VN')} đ</p>
                      <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5">{new Date(adv.createdAt).toLocaleString('vi-VN')}</p>
                    </div>
                    <div className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center border ${isPending ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200' : isApproved ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200'}`}>
                      {isPending ? <Clock size={12} className="mr-1" /> : isApproved ? <CheckCheck size={12} className="mr-1" /> : <XCircle size={12} className="mr-1" />}
                      {isPending ? 'Chờ duyệt' : isApproved ? 'Đã duyệt' : 'Từ chối'}
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-[var(--kg-text)] bg-[var(--kg-surface)] border border-[var(--kg-border)] p-2.5 rounded-xl mt-2 font-medium">
                    <span className="font-bold text-[var(--kg-text-muted)] mr-1">Lý do:</span> {adv.reason}
                  </p>
                  
                  {isManagerView && isPending && (
                    <div className="flex space-x-2 mt-3 pt-3 border-t border-[var(--kg-border)]">
                      <button 
                        type="button"
                        onClick={() => handleApprove(adv.id, 'APPROVE')} 
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl text-xs transition active:scale-95 shadow-xs"
                      >
                        Chấp thuận
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleApprove(adv.id, 'REJECT')} 
                        className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-black py-2.5 rounded-xl text-xs transition active:scale-95 shadow-xs"
                      >
                        Từ chối
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
