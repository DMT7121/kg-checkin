import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { DAY_NAMES, computeWeekInfo } from '../utils/helpers';
import Swal from 'sweetalert2';
import { ArrowLeftRight, Send, BellRing, Copy, User } from 'lucide-react';

export default function SwapShift() {
  const store = useAppStore();
  const { currentUser, users, approvedShifts } = store;
  const [weekInfo] = useState(() => computeWeekInfo());
  
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [targetUsername, setTargetUsername] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  // Request Notification Permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  const handleSwapRequest = () => {
    if (selectedDayIndex === null) {
      Swal.fire('Lỗi', 'Vui lòng chọn ngày muốn đổi ca.', 'warning');
      return;
    }
    if (!targetUsername) {
      Swal.fire('Lỗi', 'Vui lòng chọn người bạn muốn đổi ca.', 'warning');
      return;
    }
    
    const myShift = approvedShifts?.[selectedDayIndex] || 'OFF';
    if (myShift === 'OFF') {
      Swal.fire('Lỗi', 'Bạn đang OFF ngày này, không thể đổi ca.', 'warning');
      return;
    }

    const targetUser = users.find(u => u.username === targetUsername);
    const dayName = DAY_NAMES[selectedDayIndex];

    Swal.fire({
      title: 'Xác nhận đổi ca',
      text: `Xin đổi ca ${myShift} ngày ${dayName} với ${targetUser?.fullname}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Gửi yêu cầu',
      cancelButtonText: 'Hủy'
    }).then((res) => {
      if (res.isConfirmed) {
        // Simulate sending to backend
        store.setLoading(true, 'Đang gửi yêu cầu...');
        setTimeout(() => {
          store.setLoading(false);
          Swal.fire('Thành công!', 'Yêu cầu đổi ca đã được gửi đến Admin và ' + targetUser?.fullname, 'success');
          
          // Fake Push Notification for WOW effect
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification("Hệ thống Đổi Ca", {
              body: `Yêu cầu đổi ca ${myShift} ngày ${dayName} đã được gửi thành công!`,
              icon: '/android-chrome-192x192.png'
            });
          }

          setSelectedDayIndex(null);
          setTargetUsername('');
          setReason('');
        }, 1500);
      }
    });
  };

  const getZaloMessage = () => {
    if (selectedDayIndex === null || !targetUsername) return '';
    const myShift = approvedShifts?.[selectedDayIndex] || 'OFF';
    const dayName = DAY_NAMES[selectedDayIndex];
    const targetUser = users.find(u => u.username === targetUsername);
    return `Chào ${targetUser?.fullname}, mình có lịch làm ca ${myShift} vào ${dayName} tuần này (${weekInfo.weekDates[selectedDayIndex]}). Bạn có thể đổi ca này giúp mình được không? Lý do: ${reason || 'Bận việc đột xuất'}. Cảm ơn bạn nhiều!`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(getZaloMessage());
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã copy tin nhắn!', showConfirmButton: false, timer: 2000 });
  };

  return (
    <div className="p-4 animate-slide-up">
      {/* Header */}
      <div className="bg-gradient-to-br from-teal-500 to-emerald-600 rounded-3xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4">
          <ArrowLeftRight size={100} />
        </div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Chợ Đổi Ca</h2>
        <p className="text-teal-100 font-medium opacity-90 relative z-10">Tìm người làm thay hoặc đổi ca</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 mb-6">
        <h3 className="font-bold text-gray-800 dark:text-white mb-4">1. Chọn ca của bạn muốn đổi</h3>
        <div className="flex overflow-x-auto space-x-2 pb-2 snap-x">
          {DAY_NAMES.map((day, i) => {
            const shift = approvedShifts?.[i] || 'OFF';
            const isSelected = selectedDayIndex === i;
            const isOff = shift === 'OFF';
            return (
              <button key={i} disabled={isOff} onClick={() => setSelectedDayIndex(i)}
                className={`flex-shrink-0 w-20 snap-center rounded-xl p-2 border-2 transition-all ${isOff ? 'opacity-50 grayscale cursor-not-allowed border-gray-100 dark:border-gray-700' : isSelected ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}>
                <div className={`text-[10px] font-medium mb-1 ${isSelected ? 'text-teal-600' : 'text-gray-500'}`}>{day.replace('Thứ ', 'T').replace('Chủ Nhật', 'CN')}</div>
                <div className={`text-xs font-bold py-1 rounded ${isSelected ? 'bg-teal-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>{shift}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 mb-6">
        <h3 className="font-bold text-gray-800 dark:text-white mb-4">2. Chọn người làm thay</h3>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <User size={16} className="text-gray-400" />
          </div>
          <select value={targetUsername} onChange={(e) => setTargetUsername(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-800 dark:text-white appearance-none">
            <option value="" disabled>-- Chọn nhân viên --</option>
            {users.filter(u => u.username !== currentUser?.username).map(u => (
              <option key={u.username} value={u.username}>{u.fullname}</option>
            ))}
          </select>
        </div>

        <h3 className="font-bold text-gray-800 dark:text-white mt-5 mb-3">Lý do đổi ca</h3>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do..." className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-800 dark:text-white" />
      </div>

      {selectedDayIndex !== null && targetUsername && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 mb-6 animate-fade-in">
          <div className="flex items-center mb-2">
            <BellRing size={16} className="text-blue-500 mr-2" />
            <span className="font-bold text-sm text-blue-700 dark:text-blue-400">Tin nhắn tự động Zalo</span>
          </div>
          <p className="text-xs text-blue-600 dark:text-blue-300 italic bg-white dark:bg-gray-800 p-3 rounded-xl border border-blue-100 dark:border-blue-900">"{getZaloMessage()}"</p>
          <div className="flex space-x-2 mt-3">
            <button onClick={copyToClipboard} className="flex-1 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 text-xs font-bold py-2 rounded-lg border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-gray-700 transition flex items-center justify-center">
              <Copy size={14} className="mr-1" /> Copy
            </button>
            <a href={`https://zalo.me`} target="_blank" rel="noreferrer" className="flex-1 bg-[#0068ff] text-white text-xs font-bold py-2 rounded-lg hover:bg-blue-700 transition flex items-center justify-center text-center">
               Mở Zalo
            </a>
          </div>
        </div>
      )}

      <button onClick={handleSwapRequest} className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-teal-500/50 transition-all transform active:scale-95 flex items-center justify-center touch-manipulation">
        <Send size={18} className="mr-2" /> GỬI YÊU CẦU TRÊN HỆ THỐNG
      </button>
    </div>
  );
}
