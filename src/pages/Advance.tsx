import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import { BadgeDollarSign, Send, History, CheckCheck, XCircle, Clock, Banknote } from 'lucide-react';

export default function Advance() {
  const store = useAppStore();
  const { currentUser, advances } = store;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';
  
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    loadAdvances();
  }, []);

  const loadAdvances = async () => {
    const res = await callApi('GET_ADVANCES', {
      username: currentUser?.username,
      role: currentUser?.role
    });
    if (res?.ok) {
      store.setAdvances(res.data);
    }
  };

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
    <div className="p-4 space-y-5 animate-slide-up pb-10">
      {/* Header */}
      <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4">
          <BadgeDollarSign size={100} />
        </div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Ứng Lương</h2>
        <p className="text-green-100 font-medium opacity-90 relative z-10 text-sm">Gửi yêu cầu tạm ứng lương trong tháng</p>
      </div>

      {!isAdmin && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">
            <Send size={18} className="mr-2 text-green-600" /> Tạo yêu cầu mới
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Số tiền muốn ứng (VNĐ)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Banknote size={16} className="text-gray-400" />
                </div>
                <input 
                  type="text" 
                  value={amount}
                  onChange={(e) => setAmount(formatMoney(e.target.value))}
                  placeholder="Ví dụ: 500,000"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-green-500 font-bold text-green-600 dark:text-green-400 text-lg transition-all outline-none"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Lý do ứng</label>
              <textarea 
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do cụ thể..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-green-500 transition-all outline-none min-h-[100px] text-sm"
              />
            </div>
            
            <button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-green-500/30 flex items-center justify-center">
              <Send size={18} className="mr-2" /> Gửi yêu cầu
            </button>
          </div>
        </form>
      )}

      {/* History */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold flex items-center text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">
          <History size={18} className="mr-2 text-ocean-600" /> {isAdmin ? 'Danh sách yêu cầu ứng lương' : 'Lịch sử ứng lương của bạn'}
        </h3>
        
        {advances.length === 0 ? (
          <div className="text-center py-8 text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
            <BadgeDollarSign size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Chưa có dữ liệu ứng lương</p>
          </div>
        ) : (
          <div className="space-y-3">
            {advances.map((adv) => {
              const isPending = adv.status === 'Pending';
              const isApproved = adv.status === 'Approved';
              
              return (
                <div key={adv.id} className={`p-4 rounded-xl border ${isPending ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-800' : isApproved ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      {isAdmin && <p className="font-bold text-gray-800 dark:text-gray-200">{adv.fullname}</p>}
                      <p className="font-extrabold text-lg text-gray-800 dark:text-gray-200">{adv.amount.toLocaleString('vi-VN')} đ</p>
                      <p className="text-xs text-gray-500 mt-0.5">{new Date(adv.createdAt).toLocaleString('vi-VN')}</p>
                    </div>
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center ${isPending ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : isApproved ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {isPending ? <Clock size={12} className="mr-1" /> : isApproved ? <CheckCheck size={12} className="mr-1" /> : <XCircle size={12} className="mr-1" />}
                      {isPending ? 'Chờ duyệt' : isApproved ? 'Đã duyệt' : 'Từ chối'}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700/50 mt-2">
                    <span className="font-medium text-gray-500">Lý do:</span> {adv.reason}
                  </p>
                  
                  {isAdmin && isPending && (
                    <div className="flex space-x-2 mt-3 pt-3 border-t border-orange-200 dark:border-orange-800/50">
                      <button onClick={() => handleApprove(adv.id, 'APPROVE')} className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 rounded-lg text-sm transition shadow-sm">
                        Chấp thuận
                      </button>
                      <button onClick={() => handleApprove(adv.id, 'REJECT')} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-lg text-sm transition shadow-sm">
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
