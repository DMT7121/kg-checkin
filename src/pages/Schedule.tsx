import { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { speak, computeWeekInfo, getActiveShiftClass, getPreviewShiftClass, SHIFT_OPTIONS, DAY_NAMES, SHORT_DAY_NAMES, isRegistrationOpen, getAdminShiftClass, ADMIN_SHIFT_OPTIONS, generateMonthDates, MonthDateInfo, formatDateShort } from '../utils/helpers';
import Swal from 'sweetalert2';
import { CalendarCheck, Eye, AlertTriangle, Send, Lock, ExternalLink, Clock, RefreshCw, Pencil, CheckCheck, Inbox, LayoutGrid, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Schedule() {
  const store = useAppStore();
  const { currentUser, isScheduleRegistered, shiftData, offReason, approvedShifts, registeredShifts, adminSchedules, originalAdminSchedules } = store;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';

  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  
  // Calculate week info and month info based on currentDate for Admin navigation
  const selectedMonth = currentDate.getMonth() + 1;
  const selectedYear = currentDate.getFullYear();
  const monthDates = useMemo(() => generateMonthDates(selectedMonth, selectedYear), [selectedMonth, selectedYear]);
  
  const [monthData, setMonthData] = useState<any[]>([]);

  const changeWeek = (offset: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + offset * 7);
    setCurrentDate(d);
  };

  const changeMonth = (offset: number) => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + offset);
    setCurrentDate(d);
  };

  const loadMonthSchedules = async () => {
    store.setLoading(true, `Đang tải lịch Tháng ${selectedMonth}...`);
    const monthSheet = `Tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`;
    const res = await callApi('GET_MONTH_SCHEDULES', { monthSheet });
    store.setLoading(false);
    if (res?.ok && res.data?.weeks) {
      setMonthData(res.data.weeks);
    } else {
      Swal.fire('Lỗi', 'Không thể tải lịch làm việc', 'error');
    }
  };

  useEffect(() => {
    if (isAdmin && viewMode === 'month') {
      loadMonthSchedules();
    }
  }, [isAdmin, viewMode, selectedMonth, selectedYear]);

  const updateSingleMonthShift = async (empFullname: string, mDate: MonthDateInfo, value: string) => {
    // Optimistic Update
    const newData = [...monthData];
    const weekIdx = newData.findIndex(w => w.weekLabel === mDate.weekLabel);
    if (weekIdx !== -1) {
      const w = newData[weekIdx];
      const empIdx = w.schedules.findIndex((s: any) => s.fullname === empFullname);
      if (empIdx !== -1) {
         w.schedules[empIdx].shifts[mDate.dayIndex] = value;
      } else {
         const newEmp = { fullname: empFullname, shifts: ['', '', '', '', '', '', ''] };
         newEmp.shifts[mDate.dayIndex] = value;
         w.schedules.push(newEmp);
      }
      setMonthData(newData);
    }
    
    // API
    const res = await callApi('UPDATE_SINGLE_SHIFT', {
       monthSheet: `Tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`,
       weekLabel: mDate.weekLabel,
       fullname: empFullname,
       dayIndex: mDate.dayIndex,
       shiftValue: value
    }, { background: true });
    
    if (!res?.ok) {
       Swal.fire('Lỗi', 'Cập nhật thất bại. Vui lòng tải lại trang.', 'error');
    }
  };

  // Add users mapping logic for Month View
  const users = store.users && store.users.length > 0 ? store.users : [];


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

  const isTestApp = currentUser?.username === 'testapp';
  const isOpen = regWindow.open || isTestApp;

  // Show registration form when: not registered, OR explicitly editing
  const showRegistrationForm = isOpen && (!isScheduleRegistered || isEditing);

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
    if (isAdmin && adminSchedules.length === 0) {
      loadAdminSchedules();
    }
  }, [isAdmin]);

  // Auto-check approval when pending (every 2 minutes)
  useEffect(() => {
    if (scheduleStatus !== 'pending' || !currentUser || isAdmin) return;
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
  }, [scheduleStatus, currentUser, isAdmin]);

  const handleShiftChange = (key: string, value: string) => {
    if (!isOpen) return;
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
    if (!isOpen) return;
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
      {SHORT_DAY_NAMES.map((shortDayName, i) => (
        <div key={i} className="flex flex-col items-center">
          <span className="text-[11px] font-bold text-gray-800 dark:text-gray-200">
            {weekInfo.weekDates[i]}
          </span>
          <span className="text-[9px] text-gray-500 font-medium mb-1 uppercase">
            {shortDayName}
          </span>
          <div className={`w-full text-center py-1.5 rounded text-xs font-bold text-white shadow-sm ${getPreviewShiftClass(getShift(i))}`}>
            {getShift(i)}
          </div>
        </div>
      ))}
    </div>
  );

  // === ADMIN FUNCTIONS ===
  const loadAdminSchedules = async () => {
    store.setLoading(true, 'Đang kết nối Server...');
    const res = await callApi('GET_ALL_SCHEDULES', { monthSheet: weekInfo.monthSheet, weekLabel: weekInfo.weekLabel });
    store.setLoading(false);
    if (res?.ok) {
      const parsedSchedules = Array.isArray(res.data) ? res.data : (res.data.schedules || []);
      const cleanSchedules = parsedSchedules.map((emp: any) => {
        const shifts: string[] = [];
        const shiftNotes: string[] = emp.shiftNotes || Array(7).fill('');
        (emp.shifts || []).forEach((s: string, idx: number) => {
          if (s && s.includes('\n')) {
            const parts = s.split('\n');
            shifts[idx] = parts[0].trim();
            if (!shiftNotes[idx]) shiftNotes[idx] = parts.slice(1).join('\n').trim();
          } else {
            shifts[idx] = s;
          }
        });
        
        // Kiểm tra xem nhân viên đã đăng ký hay chưa
        // Cứ có ca nào khác OFF và khác rỗng thì coi như Đã đăng ký
        const isRegistered = emp.hasApproved || shifts.some((s: string) => s && s !== 'OFF' && s !== '');
        
        // Nếu chưa đăng ký, để trống tất cả lịch (thay vì mặc định OFF)
        if (!isRegistered) {
          for (let i = 0; i < 7; i++) {
            if (!shifts[i] || shifts[i] === 'OFF') shifts[i] = '';
          }
        }
        
        return { ...emp, shifts, shiftNotes, isRegistered };
      });
      
      // Bổ sung những nhân viên chưa có trong danh sách (do chưa đăng ký và chưa được thêm trên Sheet)
      const users = store.users && store.users.length > 0 ? store.users : [];
      users.forEach(u => {
        if (!cleanSchedules.find(s => s.fullname === u.fullname)) {
          cleanSchedules.push({
            fullname: u.fullname,
            username: u.username,
            shifts: ['', '', '', '', '', '', ''],
            shiftNotes: ['', '', '', '', '', '', ''],
            isRegistered: false,
            hasApproved: false,
            reason: ''
          });
        }
      });
      
      // Sắp xếp: Ai đã đăng ký thì lên đầu
      cleanSchedules.sort((a: any, b: any) => (b.isRegistered ? 1 : 0) - (a.isRegistered ? 1 : 0));
      
      store.setAdminSchedules(cleanSchedules);
      store.setOriginalAdminSchedules(JSON.parse(JSON.stringify(cleanSchedules)));
    } else if (res) {
      Swal.fire('Thông báo', res.message, 'info');
    }
  };

  const trackScheduleChange = (empIndex: number, currentSchedules: any[]) => {
    const currentEmp = currentSchedules[empIndex];
    const origEmp = originalAdminSchedules[empIndex];
    const changes: string[] = [];
    for (let i = 0; i < 7; i++) {
      if (currentEmp.shifts[i] !== origEmp.shifts[i]) {
        changes.push(`Ngày ${weekInfo.weekDates[i]} (${origEmp.shifts[i] || 'Chưa ĐK'} ⮕ ${currentEmp.shifts[i]})`);
      }
    }
    const updated = [...currentSchedules];
    updated[empIndex] = { ...currentEmp, note: changes.length > 0 ? 'Điều chỉnh: ' + changes.join('; ') : '' };
    store.setAdminSchedules(updated);
  };

  const updateAdminShift = (empIndex: number, dayIndex: number, value: string) => {
    const updated = [...adminSchedules];
    const emp = { ...updated[empIndex], shifts: [...updated[empIndex].shifts] };
    emp.shifts[dayIndex] = value;
    updated[empIndex] = emp;
    trackScheduleChange(empIndex, updated);
  };

  const approveAllSchedules = async () => {
    if (adminSchedules.length === 0) return;
    const { isConfirmed } = await Swal.fire({
      title: 'Duyệt toàn bộ lịch?', text: 'Dữ liệu sẽ được chèn/ghi đè trực tiếp lên Google Sheets.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#16a34a', cancelButtonColor: '#6b7280', confirmButtonText: 'Đồng ý duyệt',
    });
    if (!isConfirmed) return;

    store.setLoading(true, 'Đang duyệt lịch...');
    const finalSchedules = adminSchedules.map((emp, empIdx) => {
      const origEmp = originalAdminSchedules[empIdx];
      const newShifts = [...emp.shifts];
      const newNotes = [...(emp.shiftNotes || [])];
      for (let i = 0; i < 7; i++) {
        if (newShifts[i] && origEmp.shifts[i] !== newShifts[i]) {
          newNotes[i] = `Sửa từ ${origEmp.shifts[i] || 'Chưa ĐK'}`;
        }
      }
      return { ...emp, shifts: newShifts, shiftNotes: newNotes };
    });

    const res = await callApi('APPROVE_SCHEDULES', { monthSheet: weekInfo.monthSheet, weekLabel: weekInfo.weekLabel, schedules: finalSchedules, isFinal: true });
    store.setLoading(false);
    if (res?.ok) {
      Swal.fire('Thành công', 'Lịch đã được duyệt và lưu vào Google Sheets.', 'success');
      loadAdminSchedules();
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể lưu lịch làm.', 'error');
    }
  };

  return (
    <div className="p-4 animate-slide-up">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4"><CalendarCheck size={100} /></div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">{isAdmin ? 'Sắp Xếp Ca Làm Việc' : 'Đăng Ký Ca Làm Việc'}</h2>
        {!isAdmin && <p className="text-indigo-100 font-medium opacity-90 relative z-10">Tuần: {weekInfo.weekDisplay}</p>}
        {!isAdmin && (
          <div className={`mt-3 inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-md relative z-10 ${isOpen ? 'bg-green-500/30 text-green-100' : 'bg-red-500/30 text-red-100'}`}>
            {isOpen ? <Clock size={12} className="mr-1.5" /> : <Lock size={12} className="mr-1.5" />}
            {isTestApp ? 'Đã mở đăng ký (TestApp)' : regWindow.message}
          </div>
        )}

        {/* Toggle Mode & Time Navigation for Admin */}
        {isAdmin && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 relative z-10 gap-3">
            <div className="flex items-center space-x-3 bg-white/10 backdrop-blur-md p-1.5 rounded-xl border border-white/20">
              <button 
                onClick={() => setViewMode('week')} 
                className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${viewMode === 'week' ? 'bg-white text-indigo-600 shadow-sm' : 'text-white hover:bg-white/10'}`}
              >
                <CalendarRange size={16} className="mr-1.5" /> Tuần
              </button>
              <button 
                onClick={() => setViewMode('month')} 
                className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${viewMode === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-white hover:bg-white/10'}`}
              >
                <LayoutGrid size={16} className="mr-1.5" /> Tháng
              </button>
            </div>
            
            <div className="flex items-center space-x-2 bg-indigo-900/30 backdrop-blur-md rounded-xl p-1.5 border border-indigo-500/30">
              <button onClick={() => viewMode === 'week' ? changeWeek(-1) : changeMonth(-1)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><ChevronLeft size={18} /></button>
              <div className="text-sm font-bold px-2 min-w-[120px] text-center">
                {viewMode === 'week' ? weekInfo.weekDisplay : `Tháng ${selectedMonth}/${selectedYear}`}
              </div>
              <button onClick={() => viewMode === 'week' ? changeWeek(1) : changeMonth(1)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </div>

      {isAdmin ? (
        // ================= ADMIN VIEW =================
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 animate-fade-in">
          <div className="flex justify-between items-center mb-4 border-b dark:border-gray-700 pb-2">
            <h3 className="font-bold flex items-center text-gray-800 dark:text-white">
              <CalendarCheck size={18} className="mr-2 text-indigo-600" /> Quản Lý Lịch Làm Việc Tuần Tới
            </h3>
            <button onClick={() => viewMode === 'week' ? loadAdminSchedules() : loadMonthSchedules()} className="text-sm bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition flex items-center">
              <RefreshCw size={14} className="mr-1" /> Tải lịch
            </button>
          </div>

          <div className="md:hidden mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 flex items-start space-x-3 text-amber-700 dark:text-amber-400">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div className="text-sm font-medium">
              📱 Bạn đang dùng điện thoại, hãy <strong>xoay ngang màn hình</strong> để xem bảng phân ca dễ dàng và rõ ràng hơn nhé!
            </div>
          </div>

          {adminSchedules.length > 0 ? (
            <>
              
          {viewMode === 'week' && (
            <>
              <div className="overflow-x-auto w-full bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 pb-20 custom-scrollbar">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
                    <tr>
                      <th className="px-4 py-3 sticky left-0 bg-gray-200 dark:bg-gray-800 z-20 font-bold border-r dark:border-gray-700">Nhân Viên</th>
                      {SHORT_DAY_NAMES.map((d, idx) => (
                        <th key={d} className="px-2 py-3 text-center border-r dark:border-gray-700">
                          <div className="font-bold text-[13px]">{weekInfo.weekDates[idx]}</div>
                          <div className="text-[10px] font-normal opacity-70 mt-0.5">{d}</div>
                        </th>
                      ))}
                      <th className="px-4 py-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminSchedules.map((emp, empIdx) => {
                      const origShifts = originalAdminSchedules[empIdx]?.shifts || [];
                      const hasRegistered = emp.isRegistered;
                      
                      return (
                      <tr key={empIdx} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 sticky left-0 bg-white dark:bg-gray-800 z-10 font-medium text-gray-900 dark:text-white shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)] border-r dark:border-gray-700 group cursor-help">
                          <div className="flex items-center">
                            <span>{emp.fullname}</span>
                            {hasRegistered && (
                              <div className="ml-2 w-2 h-2 rounded-full bg-green-500" title="Đã đăng ký ca"></div>
                            )}
                          </div>
                          {/* Tooltip */}
                          {hasRegistered && (
                            <div className="absolute hidden group-hover:block bg-gray-900 text-white p-3 rounded-xl text-xs -top-12 left-28 z-50 shadow-xl border border-gray-700 w-[250px] whitespace-normal">
                              <div className="font-bold mb-1 text-green-400">Đã ĐK:</div>
                              <div className="grid grid-cols-2 gap-1">
                                {origShifts.map((s: string, i: number) => (
                                  <div key={i}><span className="text-gray-400">T{i+2}:</span> <span className="font-bold">{s || '(Trống)'}</span></div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                        {emp.shifts.map((shift: string, dayIdx: number) => {
                          const isChanged = originalAdminSchedules[empIdx]?.shifts[dayIdx] !== shift;
                          const hasNote = emp.shiftNotes && emp.shiftNotes[dayIdx];
                          const tooltipText = isChanged 
                            ? `Sửa từ ${originalAdminSchedules[empIdx]?.shifts[dayIdx] || 'Chưa ĐK'}` 
                            : (hasNote ? emp.shiftNotes[dayIdx] : '');
                            
                          return (
                            <td key={dayIdx} className="px-1 py-2 relative border-r dark:border-gray-700">
                              {isChanged && <div className="absolute top-0 right-0 w-2 h-2 bg-orange-500 rounded-full animate-pulse" title="Đã thay đổi"></div>}
                              {!isChanged && hasNote && <div className="absolute top-0 right-0 w-2 h-2 bg-indigo-500 rounded-full" title={tooltipText}></div>}
                              <div className="relative" title={tooltipText}>
                                <select value={shift || ''} onChange={(e) => updateAdminShift(empIdx, dayIdx, e.target.value)}
                                  className={`text-xs font-bold rounded-lg border focus:outline-none p-1.5 w-full cursor-pointer appearance-none text-center transition-all ${
                                    isChanged 
                                      ? 'border-orange-500 ring-2 ring-orange-200 dark:ring-orange-900/50 shadow-md ' + getAdminShiftClass(shift)
                                      : 'border-gray-200 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 ' + getAdminShiftClass(shift)
                                  }`}>
                                  <option value="">(Trống)</option>
                                  {ADMIN_SHIFT_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt} className="bg-white text-gray-800">{opt}</option>
                                  ))}
                                </select>
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-xs text-red-500 max-w-[200px] truncate" title={emp.reason || emp.note || ''}>
                          {!emp.hasApproved ? emp.reason : <span className="text-gray-500 font-medium italic">{emp.note}</span>}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
              <button onClick={approveAllSchedules} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center touch-manipulation">
                <CheckCheck size={18} className="mr-2" /> XÁC NHẬN SẮP XẾP CA (GHI ĐÈ LÊN SERVER)
              </button>
            </>
          )}

          {viewMode === 'month' && (
            <div className="overflow-x-auto w-full bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 mb-4 pb-20 custom-scrollbar">
              {(() => {
                const empMonthMap: Record<string, Record<string, string>> = {};
                monthData?.forEach(week => {
                  week?.schedules?.forEach((emp: any) => {
                    if (!empMonthMap[emp.fullname]) empMonthMap[emp.fullname] = {};
                    emp?.shifts?.forEach((s: string, i: number) => {
                      empMonthMap[emp.fullname][`${week.weekLabel}_${i}`] = s;
                    });
                  });
                });

                return (
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-[10px] text-gray-500 dark:text-gray-400 uppercase bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
                      <tr>
                        <th className="px-3 py-3 sticky left-0 bg-gray-200 dark:bg-gray-800 z-20 font-bold border-r dark:border-gray-700">Nhân Viên</th>
                        {monthDates.map((mDate) => (
                          <th key={mDate.dateKey} className={`px-1 py-2 text-center border-r dark:border-gray-700 min-w-[70px] ${mDate.isWeekend ? 'bg-gray-300/50 dark:bg-gray-700/50' : ''}`}>
                            <div className="font-bold text-gray-700 dark:text-gray-300 text-[13px]">{formatDateShort(mDate.date)}</div>
                            <div className="text-[10px] font-normal opacity-70 mt-0.5">{SHORT_DAY_NAMES[mDate.dayIndex]}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((emp, empIdx) => (
                        <tr key={empIdx} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-3 py-3 sticky left-0 bg-white dark:bg-gray-800 z-10 font-bold text-gray-800 dark:text-gray-200 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)] border-r dark:border-gray-700 text-xs">
                            {emp.fullname}
                          </td>
                          {monthDates.map((mDate, dayIdx) => {
                            const shift = empMonthMap[emp.fullname]?.[`${mDate.weekLabel}_${mDate.dayIndex}`] || '';
                            const isOff = shift === 'OFF' || !shift;
                            return (
                              <td key={dayIdx} className={`px-1 py-1 relative border-r dark:border-gray-700 ${mDate.isWeekend ? 'bg-gray-50 dark:bg-gray-800/80' : ''}`}>
                                <div className="relative">
                                  <select value={shift} onChange={(e) => updateSingleMonthShift(emp.fullname, mDate, e.target.value)}
                                    className={`text-[10px] font-bold rounded-lg border focus:outline-none p-1 w-full cursor-pointer appearance-none text-center transition-all ${
                                      'border-gray-200 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500 ' + getAdminShiftClass(shift)
                                    }`}>
                                    <option value="">OFF</option>
                                    {ADMIN_SHIFT_OPTIONS.map((opt) => (
                                      <option key={opt} value={opt} className="bg-white text-gray-800">{opt}</option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          )}

            </>
          ) : (
            <div className="text-center py-6 text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
              <Inbox size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Bấm "Tải lịch" để xem danh sách tuần tới</p>
            </div>
          )}
        </div>
      ) : (
        // ================= USER VIEW =================
        <>
          {/* Status Badge - Pending */}
      {scheduleStatus === 'pending' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-center space-x-3 mb-6 animate-fade-in">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-800 text-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <h4 className="font-bold text-amber-700 dark:text-amber-400 text-sm">Chờ duyệt</h4>
            <p className="text-xs text-amber-600 dark:text-amber-500">Lịch đang chờ Admin duyệt. {isOpen ? 'Bạn có thể cập nhật lại.' : ''}</p>
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
            {SHORT_DAY_NAMES.map((shortDayName, i) => {
              const approved = approvedShifts[i] || 'OFF';
              const registered = registeredShifts?.[i];
              const isChanged = registered && approved !== registered;
              return (
                <div key={i} className="flex flex-col items-center">
                  <span className="text-[11px] font-bold text-gray-800 dark:text-gray-200">
                    {weekInfo.weekDates[i]}
                  </span>
                  <span className="text-[9px] text-gray-500 font-medium mb-1 uppercase">
                    {shortDayName}
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
          {isOpen && (
            <button onClick={startEditing}
              className="mt-4 w-full bg-gradient-to-r from-amber-400 to-orange-500 text-white font-bold py-3 rounded-xl shadow-md hover:shadow-amber-500/40 transition-all transform active:scale-95 flex items-center justify-center touch-manipulation">
              <Pencil size={16} className="mr-2" /> Chỉnh sửa đăng ký ca
            </button>
          )}
        </div>
      )}

      {/* === CLOSED WINDOW (not registered) === */}
      {!isOpen && !isScheduleRegistered && (
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
      {!isOpen && isScheduleRegistered && !approvedShifts && (
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
      {isOpen && !isScheduleRegistered && (
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
            {SHORT_DAY_NAMES.map((shortDayName, index) => {
              const key = weekInfo.weekDatesKeys[index];
              const currentShift = shiftData[key] || 'OFF';
              return (
                <div key={index} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition hover:shadow-md">
                  <div className="flex justify-between items-center mb-3">
                    <span className={`font-bold ${index >= 4 && currentShift === 'OFF' ? 'text-red-500' : 'text-gray-800 dark:text-white'}`}>
                      {weekInfo.weekDates[index]} <span className="text-sm text-gray-500 dark:text-gray-400 font-medium ml-1">({shortDayName})</span>
                      {index >= 4 && <span className="ml-2 text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">Cuối tuần</span>}
                    </span>
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
      </>
      )}
    </div>
  );
}
