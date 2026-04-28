import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { speak, computeWeekInfo, getActiveShiftClass, getPreviewShiftClass, SHIFT_OPTIONS, DAY_NAMES, isRegistrationOpen } from '../utils/helpers';
import Swal from 'sweetalert2';
import { CalendarCheck, Eye, AlertTriangle, Send, Lock, ExternalLink, Clock, RefreshCw, Pencil } from 'lucide-react';

export default function Schedule() {
  const store = useAppStore();
  const { currentUser, isScheduleRegistered, shiftData, offReason, approvedShifts, registeredShifts } = store;

  const [weekInfo] = useState(() => computeWeekInfo());
  const [hasWeekendOff, setHasWeekendOff] = useState(false);
  const [hasConsecutiveOffs, setHasConsecutiveOffs] = useState(false);
  const [regWindow, setRegWindow] = useState(() => isRegistrationOpen());
  const [isEditing, setIsEditing] = useState(false);

  // Derive schedule status
  const scheduleStatus: 'none' | 'pending' | 'approved' =
    !isScheduleRegistered ? 'none'
    : (approvedShifts && approvedShifts.length > 0) ? 'approved'
    : 'pending';

  // Show registration form when: not registered, OR explicitly editing
  const showRegistrationForm = regWindow.open && (!isScheduleRegistered || isEditing);

  // Refresh registration window every minute
  useEffect(() => {
    const timer = setInterval(() => setRegWindow(isRegistrationOpen()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Init shift data
  useEffect(() => {
    if (Object.keys(shiftData).length === 0) {
      const initShifts: Record<string, string> = {};
      weekInfo.weekDatesKeys.forEach((k) => (initShifts[k] = 'OFF'));
      store.setShiftData(initShifts);
    }
  }, []);

  // Auto-check approval when pending (every 2 minutes)
  useEffect(() => {
    if (scheduleStatus !== 'pending' || !currentUser) return;
    const timer = setInterval(() => {
      callApi('GET_DATA', {
        username: currentUser.username,
        fullname: currentUser.fullname,
        role: currentUser.role,
        monthSheet: weekInfo.monthSheet,
        weekLabel: weekInfo.weekLabel,
      }, { background: true }).then((res) => {
        if (res?.ok && res.data.approvedShifts) {
          store.setApprovedShifts(res.data.approvedShifts);
          store.setScheduleRegistered(true);
          Swal.fire({ title: '✅ Lịch đã được duyệt!', text: 'Admin đã duyệt lịch làm việc của bạn.', icon: 'success', confirmButtonColor: '#10b981' });
          speak('Lịch làm việc đã được Admin duyệt');
        }
      });
    }, 120000);
    return () => clearInterval(timer);
  }, [scheduleStatus, currentUser]);

  const handleShiftChange = (key: string, value: string) => {
    if (!regWindow.open) return;
    store.updateShiftData(key, value);
    setTimeout(() => {
      const currentData = useAppStore.getState().shiftData;
      let weekendOff = false, consecutiveOffs = false, offCount = 0;
      for (let i = 0; i < 7; i++) {
        const shift = currentData[weekInfo.weekDatesKeys[i]];
        if (shift === 'OFF') {
          offCount++;
          if (offCount >= 2) consecutiveOffs = true;
          if (i >= 4) weekendOff = true;
        } else { offCount = 0; }
      }
      setHasWeekendOff(weekendOff);
      setHasConsecutiveOffs(consecutiveOffs);
    }, 0);
  };

  const startEditing = () => {
    // Pre-fill shift data from registered shifts
    if (registeredShifts) {
      const editShifts: Record<string, string> = {};
      weekInfo.weekDatesKeys.forEach((k, i) => editShifts[k] = registeredShifts[i] || 'OFF');
      store.setShiftData(editShifts);
    }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    // Restore shift data from registered shifts
    if (registeredShifts) {
      const restored: Record<string, string> = {};
      weekInfo.weekDatesKeys.forEach((k, i) => restored[k] = registeredShifts[i] || 'OFF');
      store.setShiftData(restored);
    }
    setIsEditing(false);
  };

  const submitRegistration = async () => {
    if (!regWindow.open) return;
    if (Object.keys(shiftData).length < 7) {
      Swal.fire('Chú ý', 'Vui lòng chọn đầy đủ ca cho 7 ngày.', 'warning');
      return;
    }
    if ((hasWeekendOff || hasConsecutiveOffs) && offReason.trim() === '') {
      Swal.fire('Thiếu thông tin', 'Vui lòng nhập lý do xin nghỉ chi tiết trước khi nộp.', 'warning');
      return;
    }

    const isUpdate = isScheduleRegistered;
    const { isConfirmed } = await Swal.fire({
      title: isUpdate ? 'Xác nhận Cập Nhật' : 'Xác nhận Nộp Lịch',
      html: isUpdate
        ? 'Bạn muốn cập nhật lại lịch đăng ký ca?'
        : 'Bạn đã kiểm tra kỹ lịch của mình chưa?',
      icon: 'question', showCancelButton: true, confirmButtonColor: '#10b981', cancelButtonColor: '#6b7280',
      confirmButtonText: isUpdate ? 'Cập nhật lịch' : 'Gửi lịch',
      cancelButtonText: 'Xem lại',
    });
    if (!isConfirmed) return;

    store.setLoading(true, 'Đang kết nối Server...');
    const shifts = weekInfo.weekDatesKeys.map((key: string) => shiftData[key] || 'OFF');
    const payload = {
      username: currentUser!.username,
      fullname: currentUser!.fullname,
      monthSheet: weekInfo.monthSheet,
      weekLabel: weekInfo.weekLabel,
      shifts,
      offReason,
      isEdit: isUpdate,
    };

    const res = await callApi('REGISTER_SHIFT', payload);
    store.setLoading(false);

    if (res?.ok) {
      store.setScheduleRegistered(true);
      store.setRegisteredShifts(shifts);
      localStorage.setItem('kg_registered_shifts', JSON.stringify(shifts));
      localStorage.setItem('kg_registered_week', weekInfo.monthSheet + '|' + weekInfo.weekLabel);
      setIsEditing(false);
      Swal.fire({ title: 'Thành công!', text: isUpdate ? 'Đã cập nhật lịch đăng ký.' : 'Đã gửi lịch đăng ký ca.', icon: 'success', confirmButtonColor: '#10b981' });
      speak('Đăng ký lịch làm việc thành công');
    } else if (res) {
      Swal.fire('Lỗi', res.message, 'error');
    } else {
      Swal.fire('Lỗi', 'Không thể gửi lịch lúc này.', 'error');
    }
  };

  // Shared preview grid renderer
  const renderShiftGrid = (getShift: (i: number) => string) => (
    <div className="grid grid-cols-7 gap-1">
      {DAY_NAMES.map((dayName, i) => (
        <div key={i} className="flex flex-col items-center">
          <span className="text-[10px] text-gray-400 font-medium mb-1">
            {dayName.replace('Thứ ', 'T').replace('Chủ Nhật', 'CN')}
          </span>
          <div className={`w-full text-center py-1.5 rounded text-xs font-bold text-white shadow-sm ${getPreviewShiftClass(getShift(i))}`}>
            {getShift(i)}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 animate-slide-up">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4"><CalendarCheck size={100} /></div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Lịch Làm Việc</h2>
        <p className="text-indigo-100 font-medium opacity-90 relative z-10">Tuần: {weekInfo.weekDisplay}</p>
        <div className={`mt-3 inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-md relative z-10 ${regWindow.open ? 'bg-green-500/30 text-green-100' : 'bg-red-500/30 text-red-100'}`}>
          {regWindow.open ? <Clock size={12} className="mr-1.5" /> : <Lock size={12} className="mr-1.5" />}
          {regWindow.message}
        </div>
      </div>

      {/* Status Badge - Pending */}
      {scheduleStatus === 'pending' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-center space-x-3 mb-6 animate-fade-in">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-800 text-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <h4 className="font-bold text-amber-700 dark:text-amber-400 text-sm">Chờ duyệt</h4>
            <p className="text-xs text-amber-600 dark:text-amber-500">Lịch đang chờ Admin duyệt. {regWindow.open ? 'Bạn có thể cập nhật lại.' : ''}</p>
          </div>
        </div>
      )}

      {/* Status Badge - Approved */}
      {scheduleStatus === 'approved' && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4 flex items-center space-x-3 mb-6 animate-fade-in">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-800 text-green-500 rounded-full flex items-center justify-center flex-shrink-0">
            <CalendarCheck size={20} />
          </div>
          <div>
            <h4 className="font-bold text-green-700 dark:text-green-400 text-sm">Đã duyệt ✓</h4>
            <p className="text-xs text-green-600 dark:text-green-500">Admin đã duyệt lịch làm việc của bạn.</p>
          </div>
        </div>
      )}

      {/* Approved Shifts Display */}
      {approvedShifts && approvedShifts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border-2 border-green-200 dark:border-green-700 mb-6">
          <h3 className="text-sm font-bold text-green-600 dark:text-green-400 uppercase tracking-wider mb-3 flex items-center">
            <CalendarCheck size={16} className="mr-2" /> Lịch đã duyệt
          </h3>
          <div className="grid grid-cols-7 gap-1">
            {DAY_NAMES.map((dayName, i) => {
              const approved = approvedShifts[i] || 'OFF';
              const registered = registeredShifts?.[i];
              const isChanged = registered && approved !== registered;
              return (
                <div key={i} className="flex flex-col items-center">
                  <span className="text-[10px] text-gray-400 font-medium mb-1">
                    {dayName.replace('Thứ ', 'T').replace('Chủ Nhật', 'CN')}
                  </span>
                  <div className={`w-full text-center py-1.5 rounded text-xs font-bold text-white shadow-sm ${getPreviewShiftClass(approved)} ${isChanged ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}>
                    {approved}
                  </div>
                  {isChanged && (
                    <span className="text-[8px] text-amber-500 font-bold mt-0.5">Đã đổi</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === REGISTERED PREVIEW (not editing) === */}
      {isScheduleRegistered && !isEditing && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
          <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
            <Eye size={16} className="mr-2" /> Lịch đã đăng ký
          </h3>
          {renderShiftGrid((i) => registeredShifts?.[i] || shiftData[weekInfo.weekDatesKeys[i]] || 'OFF')}

          {/* Edit button - only when registration window is open */}
          {regWindow.open && (
            <button onClick={startEditing}
              className="mt-4 w-full bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold py-3 rounded-xl shadow-md hover:shadow-amber-500/40 transition-all transform active:scale-95 flex items-center justify-center touch-manipulation">
              <Pencil size={16} className="mr-2" /> Chỉnh sửa đăng ký ca
            </button>
          )}
        </div>
      )}

      {/* === CLOSED WINDOW (not registered) === */}
      {!regWindow.open && !isScheduleRegistered && (
        <>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-red-100 dark:bg-red-800 text-red-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Lock size={20} />
            </div>
            <div>
              <h4 className="font-bold text-red-700 dark:text-red-400 text-sm">Đã đóng đăng ký</h4>
              <p className="text-xs text-red-600 dark:text-red-500">{regWindow.message}</p>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 text-center mb-6">
            <AlertTriangle size={32} className="mx-auto text-gray-400 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">Bạn chưa đăng ký ca cho tuần tới.</p>
            <p className="text-xs text-gray-400 mt-1">Vui lòng đăng ký khi mở đăng ký vào Thứ Hai.</p>
          </div>
        </>
      )}

      {/* === CLOSED WINDOW (registered - show lock message) === */}
      {!regWindow.open && isScheduleRegistered && !approvedShifts && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-800 text-red-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Lock size={20} />
          </div>
          <div>
            <h4 className="font-bold text-red-700 dark:text-red-400 text-sm">Đã đóng đăng ký</h4>
            <p className="text-xs text-red-600 dark:text-red-500">{regWindow.message}</p>
          </div>
        </div>
      )}

      {/* === NOT REGISTERED + OPEN WINDOW === */}
      {regWindow.open && !isScheduleRegistered && (
        <>
          {/* Preview grid */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
              <Eye size={16} className="mr-2" /> Bản xem trước
            </h3>
            {renderShiftGrid((i) => shiftData[weekInfo.weekDatesKeys[i]] || 'OFF')}
          </div>
        </>
      )}

      {/* === REGISTRATION FORM (new registration or editing) === */}
      {showRegistrationForm && (
        <>
          {/* Editing banner */}
          {isEditing && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-3 mb-4 flex items-center justify-between">
              <div className="flex items-center">
                <Pencil size={14} className="text-amber-600 mr-2" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Đang chỉnh sửa đăng ký</span>
              </div>
              <button onClick={cancelEditing}
                className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition">
                Hủy
              </button>
            </div>
          )}

          {/* Preview grid (editing mode) */}
          {isEditing && (
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
              <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                <Eye size={16} className="mr-2" /> Bản xem trước
              </h3>
              {renderShiftGrid((i) => shiftData[weekInfo.weekDatesKeys[i]] || 'OFF')}
            </div>
          )}

          {/* Day-by-day shift selection */}
          <div className="space-y-4 mb-6">
            {DAY_NAMES.map((dayName, index) => {
              const key = weekInfo.weekDatesKeys[index];
              const currentShift = shiftData[key] || 'OFF';
              return (
                <div key={index} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition hover:shadow-md">
                  <div className="flex justify-between items-center mb-3">
                    <span className={`font-bold ${index >= 4 && currentShift === 'OFF' ? 'text-red-500' : 'text-gray-800 dark:text-white'}`}>
                      {dayName}
                      {index >= 4 && <span className="ml-1 text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">Cuối tuần</span>}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded font-mono">{weekInfo.weekDates[index]}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SHIFT_OPTIONS.map((shift) => (
                      <button key={shift} onClick={() => handleShiftChange(key, shift)}
                        className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all transform active:scale-95 touch-manipulation min-h-[36px] ${currentShift === shift ? getActiveShiftClass(shift) : 'bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}`}>
                        {shift}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Warning + reason input */}
          {(hasWeekendOff || hasConsecutiveOffs) && (
            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-r-2xl mb-6 animate-fade-in">
              <div className="flex items-start">
                <AlertTriangle size={20} className="text-red-500 mt-1 mr-3 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-red-700 dark:text-red-400 text-sm mb-1">Quy định nộp lịch</h4>
                  <ul className="text-xs text-red-600 dark:text-red-300 list-disc list-inside mb-3 space-y-1 ml-2">
                    {hasConsecutiveOffs && <li>Bạn đang chọn OFF từ 2 ngày liên tiếp trở lên.</li>}
                    {hasWeekendOff && <li>Bạn đang chọn OFF vào ngày cuối tuần (T6, T7 hoặc CN).</li>}
                  </ul>
                  <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-3">
                    Vui lòng nhập lý do bên dưới VÀ gửi hình ảnh minh chứng vào nhóm Zalo lịch làm: <br />
                    <a href="https://zalo.me/g/zkowlm391" target="_blank" rel="noreferrer" className="inline-flex items-center text-blue-600 bg-blue-100 px-2 py-1 rounded mt-1 hover:underline">
                      <ExternalLink size={12} className="mr-1" /> Bấm để mở nhóm Zalo
                    </a>
                  </p>
                  <textarea value={offReason} onChange={(e) => store.setOffReason(e.target.value)}
                    className="w-full bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-800 dark:text-gray-200" rows={3} placeholder="Nhập lý do xin nghỉ cụ thể..." />
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <button onClick={submitRegistration} className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-green-500/50 transition-all transform active:scale-95 flex items-center justify-center touch-manipulation border border-green-400">
            {isScheduleRegistered ? (
              <><RefreshCw size={20} className="mr-2" /> CẬP NHẬT LỊCH ĐĂNG KÝ</>
            ) : (
              <><Send size={20} className="mr-2" /> GỬI LỊCH ĐĂNG KÝ</>
            )}
          </button>
          <p className="text-center text-[10px] text-gray-400 mt-3">
            {isScheduleRegistered
              ? 'Bạn có thể cập nhật lịch không giới hạn trong thời gian mở đăng ký.'
              : 'Hạn đăng ký: 17:00 Thứ Bảy hàng tuần.'}
          </p>
        </>
      )}
    </div>
  );
}
