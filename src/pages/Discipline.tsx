import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import { Award, Plus, Trash2, ArrowUpRight, ArrowDownRight, Search } from 'lucide-react';

export default function Discipline() {
  const store = useAppStore();
  const { currentUser, bonusPenalties, users } = store;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';
  
  const [type, setType] = useState<'BONUS' | 'PENALTY'>('BONUS');
  const [targetUsername, setTargetUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    const res = await callApi('GET_BONUS_PENALTY', {
      username: currentUser?.username,
      role: currentUser?.role
    });
    if (res?.ok) {
      store.setBonusPenalties(res.data);
    }
  };

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
    <div className="p-4 space-y-5 animate-slide-up pb-10">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4">
          <Award size={100} />
        </div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Kỷ luật - Khen thưởng</h2>
        <p className="text-indigo-100 font-medium opacity-90 relative z-10 text-sm">Quản lý các khoản thưởng và phạt vi phạm</p>
      </div>

      {isAdmin && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">
            <Plus size={18} className="mr-2 text-indigo-600" /> Thêm bản ghi mới
          </h3>
          
          <div className="space-y-4">
            <div className="flex space-x-2">
              <button 
                type="button"
                onClick={() => setType('BONUS')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all flex justify-center items-center ${type === 'BONUS' ? 'bg-green-50 border-green-500 text-green-600 dark:bg-green-900/30' : 'border-transparent bg-gray-100 text-gray-500 dark:bg-gray-700'}`}
              >
                <ArrowUpRight size={16} className="mr-1" /> THƯỞNG
              </button>
              <button 
                type="button"
                onClick={() => setType('PENALTY')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all flex justify-center items-center ${type === 'PENALTY' ? 'bg-red-50 border-red-500 text-red-600 dark:bg-red-900/30' : 'border-transparent bg-gray-100 text-gray-500 dark:bg-gray-700'}`}
              >
                <ArrowDownRight size={16} className="mr-1" /> PHẠT
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Nhân viên</label>
              <select 
                value={targetUsername}
                onChange={(e) => setTargetUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
              >
                <option value="">-- Chọn nhân viên --</option>
                {users.map(u => (
                  <option key={u.username} value={u.username}>{u.fullname}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Số tiền (VNĐ)</label>
              <input 
                type="text" 
                value={amount}
                onChange={(e) => setAmount(formatMoney(e.target.value))}
                placeholder="Ví dụ: 100,000"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 font-bold text-lg outline-none"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Lý do</label>
              <input 
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Nhập lý do..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
              />
            </div>
            
            <button type="submit" className={`w-full text-white font-bold py-3.5 rounded-xl transition shadow-lg flex items-center justify-center ${type === 'BONUS' ? 'bg-green-500 hover:bg-green-600 shadow-green-500/30' : 'bg-red-500 hover:bg-red-600 shadow-red-500/30'}`}>
              <Plus size={18} className="mr-2" /> Ghi nhận
            </button>
          </div>
        </form>
      )}

      {/* History */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold flex items-center text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">
          <Search size={18} className="mr-2 text-ocean-600" /> {isAdmin ? 'Lịch sử khen thưởng / kỷ luật' : 'Lịch sử của bạn'}
        </h3>
        
        {bonusPenalties.length === 0 ? (
          <div className="text-center py-8 text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
            <Award size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Chưa có bản ghi nào</p>
          </div>
        ) : (
          <div className="space-y-3">
            {bonusPenalties.map((record) => {
              const isBonus = record.type === 'BONUS';
              
              return (
                <div key={record.id} className={`p-4 rounded-xl border ${isBonus ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      {isAdmin && <p className="font-bold text-gray-800 dark:text-gray-200">{record.targetFullname}</p>}
                      <p className={`font-extrabold text-lg ${isBonus ? 'text-green-600' : 'text-red-600'}`}>
                        {isBonus ? '+' : '-'}{record.amount.toLocaleString('vi-VN')} đ
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{new Date(record.createdAt).toLocaleString('vi-VN')}</p>
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={() => handleDelete(record.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700/50 mt-2">
                    <span className="font-medium text-gray-500">Lý do:</span> {record.reason}
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
