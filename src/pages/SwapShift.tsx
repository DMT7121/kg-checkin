import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { DAY_NAMES, SHORT_DAY_NAMES, computeWeekInfo } from '../utils/helpers';
import Swal from 'sweetalert2';
import { ArrowLeftRight, Send, BellRing, Copy, User, Megaphone, Inbox, Clock, HandshakeIcon } from 'lucide-react';

export default function SwapShift() {
  const store = useAppStore();
  const { currentUser, users, approvedShifts, swapRequests } = store;
  const [weekInfo] = useState(() => computeWeekInfo());
  
  const [viewTab, setViewTab] = useState<'board' | 'post'>('board');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [targetUsername, setTargetUsername] = useState<string>('ALL');
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    if (viewTab === 'board') {
      store.setHasNewSwaps(false);
      loadSwapRequests();
    }
  }, [viewTab]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
    loadSwapRequests();
  }, []);

  const loadSwapRequests = async () => {
    const res = await callApi('GET_SWAP_REQUESTS', {
      username: currentUser?.username,
      role: currentUser?.role
    });
    if (res?.ok) {
      store.setSwapRequests(res.data);
    }
  };

  const handleSwapRequest = () => {
    if (selectedDayIndex === null) {
      Swal.fire('Lỗi', 'Vui lòng chọn ngày muốn đổi ca.', 'warning');
      return;
    }
    
    const myShift = approvedShifts?.[selectedDayIndex] || 'OFF';
    if (myShift === 'OFF') {
      Swal.fire('Lỗi', 'Bạn đang OFF ngày này, không thể đổi ca.', 'warning');
      return;
    }

    const dayName = DAY_NAMES[selectedDayIndex];
    const isPublic = targetUsername === 'ALL';
    const targetUser = isPublic ? null : users.find(u => u.username === targetUsername);

    Swal.fire({
      title: 'Xác nhận đổi ca',
      text: isPublic 
        ? `Đăng yêu cầu đổi ca ${myShift} ngày ${dayName} lên Bảng tin?`
        : `Xin đổi ca ${myShift} ngày ${dayName} với ${targetUser?.fullname}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: isPublic ? 'Đăng lên Bảng tin' : 'Gửi yêu cầu trực tiếp',
      cancelButtonText: 'Hủy'
    }).then((res) => {
      if (res.isConfirmed) {
        store.setLoading(true, 'Đang gửi yêu cầu...');
        callApi('SUBMIT_SWAP', {
          username: currentUser!.username,
          fullname: currentUser!.fullname,
          dayName: dayName,
          shift: myShift,
          date: weekInfo.weekDates[selectedDayIndex],
          reason: reason || 'Cần hỗ trợ đổi ca đột xuất',
          targetUsername: isPublic ? 'ALL' : targetUser?.username,
          targetFullname: isPublic ? 'ALL' : targetUser?.fullname,
          monthSheet: weekInfo.monthSheet
        }).then((apiRes) => {
          store.setLoading(false);
          if (apiRes?.ok) {
            Swal.fire('Thành công!', isPublic ? 'Yêu cầu của bạn đã được đăng lên Bảng tin.' : `Yêu cầu đổi ca đã gửi đến ${targetUser?.fullname}. Hãy nhắn Zalo cho họ nhé!`, 'success');
            if (isPublic) setViewTab('board');
            loadSwapRequests();
          } else {
            Swal.fire('Lỗi', apiRes?.message || 'Có lỗi xảy ra', 'error');
          }
        });

        setSelectedDayIndex(null);
        setTargetUsername('ALL');
        setReason('');
      }
    });
  };

  const getZaloMessage = () => {
    if (selectedDayIndex === null || targetUsername === 'ALL') return '';
    const myShift = approvedShifts?.[selectedDayIndex] || 'OFF';
    const dayName = DAY_NAMES[selectedDayIndex];
    const targetUser = users.find(u => u.username === targetUsername);
    return `Chào ${targetUser?.fullname}, mình có lịch làm ca ${myShift} vào ${dayName} tuần này (${weekInfo.weekDates[selectedDayIndex]}). Bạn có thể đổi ca này giúp mình được không? Lý do: ${reason || 'Bận việc đột xuất'}. Cảm ơn bạn nhiều!`;
  };

  const getPublicZaloMessage = (req: any) => {
    return `Chào ${req.fullname}, mình thấy bạn đang cần đổi ca ${req.shift} vào ${req.dayName}. Mình có thể làm thay ca này cho bạn nhé!`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã copy tin nhắn!', showConfirmButton: false, timer: 2000 });
  };

  const handleAcceptSwap = (req: any) => {
    Swal.fire({
      title: 'Nhận làm thay?',
      text: `Bạn muốn nhận ca ${req.shift} vào ${req.dayName} của ${req.fullname}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Có, tôi nhận',
      cancelButtonText: 'Đóng'
    }).then((res) => {
      if (res.isConfirmed) {
        store.setLoading(true, 'Đang ghi nhận...');
        callApi('ACCEPT_SWAP', {
          swapId: req.id,
          targetUsername: currentUser?.username,
          targetFullname: currentUser?.fullname
        }).then((apiRes) => {
          store.setLoading(false);
          if (apiRes?.ok) {
            Swal.fire({
              title: 'Ghi nhận thành công',
              text: 'Hãy nhắn Zalo cho người đó để xác nhận nhé! Hệ thống đang chờ Admin duyệt.',
              icon: 'success',
              showCancelButton: true,
              confirmButtonText: 'Copy mẫu tin nhắn Zalo',
              cancelButtonText: 'Đóng'
            }).then((r) => {
              if (r.isConfirmed) copyToClipboard(getPublicZaloMessage(req));
            });
            loadSwapRequests();
          } else {
            Swal.fire('Lỗi', apiRes?.message || 'Có lỗi xảy ra', 'error');
          }
        });
      }
    });
  };

  return (
    <div className="p-4 animate-slide-up">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-500 via-emerald-500 to-green-600 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between mb-6">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
              <ArrowLeftRight size={20} className="text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Chợ Đổi Ca</h2>
          </div>
          <p className="text-teal-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
            Tìm người làm thay hoặc đổi ca nhanh chóng.
          </p>
        </div>
        <div className="hidden md:block relative z-10 opacity-80">
          <ArrowLeftRight size={80} strokeWidth={1} />
        </div>
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-teal-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* Tabs Menu */}
      <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl mb-6">
        <button onClick={() => setViewTab('board')} className={`flex-1 flex items-center justify-center py-3 rounded-xl font-bold text-sm transition-all ${viewTab === 'board' ? 'bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
          <Megaphone size={16} className="mr-2" /> Bảng tin
          {store.hasNewSwaps && viewTab !== 'board' && <span className="w-2 h-2 rounded-full bg-red-500 ml-2 animate-ping" />}
        </button>
        <button onClick={() => setViewTab('post')} className={`flex-1 flex items-center justify-center py-3 rounded-xl font-bold text-sm transition-all ${viewTab === 'post' ? 'bg-white dark:bg-gray-700 text-teal-600 dark:text-teal-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
          <Send size={16} className="mr-2" /> Đăng bài
        </button>
      </div>

      {/* BOARD VIEW */}
      {viewTab === 'board' && (
        <div className="space-y-4">
          
          {/* Admin Approval Section */}
          {currentUser?.role === 'admin' && swapRequests.filter(req => req.status === 'Pending_Admin').length > 0 && (
            <div className="mb-8">
              <h3 className="font-bold text-gray-800 dark:text-white mb-3 flex items-center">
                <Inbox size={18} className="mr-2 text-ocean-600" /> Cần Admin Duyệt
              </h3>
              <div className="space-y-3">
                {swapRequests.filter(req => req.status === 'Pending_Admin').map((req) => (
                  <div key={req.id} className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-2xl p-4 shadow-sm animate-fade-in">
                    <div className="mb-2">
                      <span className="font-bold text-gray-800 dark:text-gray-200">{req.fullname}</span>
                      <span className="text-gray-500 text-sm mx-1">muốn đổi ca</span>
                      <span className="font-bold text-ocean-600 dark:text-ocean-400">{req.shift}</span>
                      <span className="text-gray-500 text-sm mx-1">vào</span>
                      <span className="font-bold text-gray-700 dark:text-gray-300">{req.dayName} ({req.date})</span>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-3 rounded-xl mb-3 text-sm border border-orange-100 dark:border-orange-800/50">
                      <p className="mb-1"><span className="text-gray-500">Lý do:</span> {req.reason}</p>
                      <p><span className="text-gray-500">Người nhận thay:</span> <span className="font-bold text-teal-600 dark:text-teal-400">{req.targetFullname}</span></p>
                    </div>
                    <div className="flex space-x-2">
                      <button onClick={() => {
                        store.setLoading(true, 'Đang duyệt...');
                        callApi('APPROVE_SWAP', { swapId: req.id, action: 'APPROVE' }).then(res => {
                          store.setLoading(false);
                          if (res?.ok) {
                            Swal.fire('Đã duyệt', 'Ca làm đã được chuyển cho người nhận thay.', 'success');
                            loadSwapRequests();
                          }
                        });
                      }} className="flex-1 bg-teal-500 hover:bg-teal-600 text-white font-bold py-2.5 rounded-xl text-sm transition">
                        Phê duyệt
                      </button>
                      <button onClick={() => {
                        store.setLoading(true, 'Đang từ chối...');
                        callApi('APPROVE_SWAP', { swapId: req.id, action: 'REJECT' }).then(res => {
                          store.setLoading(false);
                          if (res?.ok) {
                            Swal.fire('Đã từ chối', 'Yêu cầu đổi ca bị hủy.', 'info');
                            loadSwapRequests();
                          }
                        });
                      }} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm transition">
                        Từ chối
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 className="font-bold text-gray-800 dark:text-white mb-3">Tất cả bài đăng</h3>
          {swapRequests.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-700 shadow-sm">
              <Inbox size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <h3 className="text-gray-500 dark:text-gray-400 font-bold mb-1">Chưa có ai cần đổi ca</h3>
              <p className="text-xs text-gray-400">Những yêu cầu đổi ca sẽ xuất hiện ở đây.</p>
            </div>
          ) : (
            swapRequests.map((req) => (
              <div key={req.id} className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-teal-100 dark:border-teal-900 relative overflow-hidden animate-fade-in group">
                {req.username === currentUser?.username && (
                  <div className="absolute top-0 right-0 bg-teal-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">Của bạn</div>
                )}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-600 flex items-center justify-center font-bold text-lg mr-3 shadow-sm border border-teal-200 dark:border-teal-800">
                      {req.fullname.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 dark:text-white text-sm">{req.fullname}</h4>
                      <p className="text-[10px] text-gray-500 flex items-center mt-0.5"><Clock size={10} className="mr-1" /> Vừa xong</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-3 mb-4 border border-gray-100 dark:border-gray-700">
                  <p className="text-sm text-gray-700 dark:text-gray-300 font-medium mb-1">
                    Cần người làm thay ca <strong className="text-teal-600 dark:text-teal-400">{req.shift}</strong>
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-bold mb-2">Vào {req.dayName} ({req.date})</p>
                  <p className="text-xs text-gray-500 italic flex items-start">
                    <span className="font-semibold not-italic mr-1 text-gray-600 dark:text-gray-400">Lý do:</span> {req.reason}
                  </p>
                </div>

                {req.username !== currentUser?.username && req.status === 'Pending_User' ? (
                  <button onClick={() => handleAcceptSwap(req)} className="w-full bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 font-bold py-3 rounded-xl border border-teal-200 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-800/50 transition-all flex items-center justify-center text-sm">
                    <HandshakeIcon size={16} className="mr-2" /> Nhận làm thay ca này
                  </button>
                ) : req.status === 'Pending_Admin' ? (
                  <div className="w-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-bold py-2.5 rounded-xl border border-orange-200 dark:border-orange-800 text-center text-xs">
                    ⏳ Đang chờ Admin duyệt (Người nhận: {req.targetFullname})
                  </div>
                ) : req.username === currentUser?.username ? (
                  <button onClick={() => {
                    store.setLoading(true);
                    callApi('DELETE_SWAP', { swapId: req.id, username: currentUser?.username }).then(() => {
                      store.setLoading(false);
                      loadSwapRequests();
                    });
                  }} className="w-full bg-red-50 dark:bg-red-900/20 text-red-500 font-bold py-2.5 rounded-xl border border-red-200 dark:border-red-800 hover:bg-red-100 transition-all text-xs">
                    Xóa bài đăng
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      {/* POST VIEW */}
      {viewTab === 'post' && (
        <div className="animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 mb-6">
            <h3 className="font-bold text-gray-800 dark:text-white mb-4">1. Chọn ca của bạn muốn đổi</h3>
            <div className="flex overflow-x-auto space-x-2 pb-2 snap-x">
              {SHORT_DAY_NAMES.map((shortDay, i) => {
                const shift = approvedShifts?.[i] || 'OFF';
                const isSelected = selectedDayIndex === i;
                const isOff = shift === 'OFF';
                return (
                  <button key={i} disabled={isOff} onClick={() => setSelectedDayIndex(i)}
                    className={`flex-shrink-0 w-20 snap-center rounded-xl p-2 border-2 transition-all ${isOff ? 'opacity-50 grayscale cursor-not-allowed border-gray-100 dark:border-gray-700' : isSelected ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}>
                    <div className={`text-[12px] font-bold mb-0.5 ${isSelected ? 'text-teal-600' : 'text-gray-800 dark:text-gray-200'}`}>{weekInfo.weekDates[i]}</div>
                    <div className={`text-[10px] font-medium mb-1 ${isSelected ? 'text-teal-500' : 'text-gray-500'}`}>{shortDay}</div>
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
                <option value="ALL" className="font-bold text-teal-600">🌍 Tất cả mọi người (Đăng lên Chợ)</option>
                {users.filter(u => u.username !== currentUser?.username).map(u => (
                  <option key={u.username} value={u.username}>👤 {u.fullname}</option>
                ))}
              </select>
            </div>

            <h3 className="font-bold text-gray-800 dark:text-white mt-5 mb-3">Lý do đổi ca</h3>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do..." className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-800 dark:text-white" />
          </div>

          {selectedDayIndex !== null && targetUsername !== 'ALL' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 mb-6 animate-fade-in">
              <div className="flex items-center mb-2">
                <BellRing size={16} className="text-blue-500 mr-2" />
                <span className="font-bold text-sm text-blue-700 dark:text-blue-400">Tin nhắn tự động Zalo</span>
              </div>
              <p className="text-xs text-blue-600 dark:text-blue-300 italic bg-white dark:bg-gray-800 p-3 rounded-xl border border-blue-100 dark:border-blue-900">"{getZaloMessage()}"</p>
              <div className="flex space-x-2 mt-3">
                <button onClick={() => copyToClipboard(getZaloMessage())} className="flex-1 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 text-xs font-bold py-2 rounded-lg border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-gray-700 transition flex items-center justify-center">
                  <Copy size={14} className="mr-1" /> Copy
                </button>
                <a href={`https://zalo.me`} target="_blank" rel="noreferrer" className="flex-1 bg-[#0068ff] text-white text-xs font-bold py-2 rounded-lg hover:bg-blue-700 transition flex items-center justify-center text-center">
                  Mở Zalo
                </a>
              </div>
            </div>
          )}

          <button onClick={handleSwapRequest} className="w-full bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-teal-500/50 transition-all transform active:scale-95 flex items-center justify-center touch-manipulation">
            {targetUsername === 'ALL' ? (
              <><Megaphone size={18} className="mr-2" /> ĐĂNG LÊN BẢNG TIN</>
            ) : (
              <><Send size={18} className="mr-2" /> GỬI YÊU CẦU ĐỔI CA</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
