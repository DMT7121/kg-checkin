import { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { computeWeekInfo, DAY_NAMES, SHORT_DAY_NAMES, getAdminShiftClass, generateMonthDates, MonthDateInfo, formatDateShort } from '../utils/helpers';
import { CalendarDays, RefreshCw, Info, Calendar, ChevronLeft, ChevronRight, LayoutGrid, CalendarRange, Filter, ShieldAlert } from 'lucide-react';
import CalendarGrid from '../components/CalendarGrid';
import Swal from 'sweetalert2';
import { KgModuleHero } from '../components/KgDesignSystem';


export default function Roster() {
  const store = useAppStore();
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  
  // Calculate week info and month info based on currentDate
  const weekInfo = useMemo(() => computeWeekInfo(currentDate, false), [currentDate]);
  
  const selectedMonth = currentDate.getMonth() + 1;
  const selectedYear = currentDate.getFullYear();
  const monthDates = useMemo(() => generateMonthDates(selectedMonth, selectedYear), [selectedMonth, selectedYear]);
  
  const [monthData, setMonthData] = useState<any[]>([]); // To hold data from GET_MONTH_SCHEDULES

  const loadSchedules = async () => {
    store.setLoading(true, `Đang tải lịch Tháng ${selectedMonth}...`);
    const requestsMap = new Map<string, string>();
    monthDates.forEach(mDate => {
      const wInfo = computeWeekInfo(mDate.date, false);
      requestsMap.set(wInfo.weekLabel, wInfo.monthSheet);
    });
    
    const requests = Array.from(requestsMap.entries()).map(([weekLabel, monthSheet]) => ({ monthSheet, weekLabel }));
    const monthSheet = `Tháng ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`;
    
    const res = await callApi('GET_MONTH_SCHEDULES', { monthSheet, requests });
    store.setLoading(false);
    
    if (res?.ok && res.data?.weeks) {
      setMonthData(res.data.weeks);
    } else {
      Swal.fire('Lỗi', 'Không thể tải lịch làm việc', 'error');
    }
  };

  useEffect(() => {
    loadSchedules();
  }, [selectedMonth, selectedYear]);

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

  // Build the matrix for the current view
  // Merge store.users with monthData to ensure all active employees are shown
  const activeUsers = store.users && store.users.length > 0 ? store.users : [];
  
  const uniqueRoles = useMemo(() => {
    const roles = new Set<string>();
    activeUsers.forEach(u => {
      if (u.position) roles.add(u.position);
    });
    return Array.from(roles);
  }, [activeUsers]);

  const filteredUsers = useMemo(() => {
    if (selectedRole === 'ALL') return activeUsers;
    return activeUsers.filter(u => u.position === selectedRole);
  }, [activeUsers, selectedRole]);
  
  const renderWeekView = () => {
    // Find the week data in monthData
    const weekData = monthData.find(w => w.weekLabel === weekInfo.weekLabel);
    const schedules = weekData ? weekData.schedules : [];
    
    const dailyWaitstaffCounts = [0, 0, 0, 0, 0, 0, 0];
    schedules.forEach((emp: any) => {
      const user = activeUsers.find(u => u.fullname === emp.fullname);
      const isWaitstaff = user?.position?.toLowerCase().includes('phục vụ') || false;
      (emp.shifts || []).forEach((shift: string, idx: number) => {
        if (shift && shift !== 'OFF') {
          if (isWaitstaff) dailyWaitstaffCounts[idx]++;
        }
      });
    });

    // Map to ensure all filteredUsers exist
    const rosterToRender = filteredUsers.map(u => {
      const found = schedules.find((s: any) => s.fullname === u.fullname);
      return {
        fullname: u.fullname,
        username: u.username,
        shifts: found ? found.shifts : ['', '', '', '', '', '', '']
      };
    });

  
  const showDayDetails = (mDate: MonthDateInfo, empMonthMap: Record<string, Record<string, string>>) => {
    const dayShifts = filteredUsers.map(u => ({
      name: u.fullname,
      shift: empMonthMap[u.fullname]?.[`${mDate.weekLabel}_${mDate.dayIndex}`] || ''
    })).filter(u => u.shift && u.shift !== 'OFF');

    let html = '<div class="text-left mt-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">';
    if (dayShifts.length === 0) {
      html += '<p class="text-gray-500 italic text-center py-4">Không có ai làm việc hôm nay.</p>';
    } else {
      const grouped: Record<string, string[]> = {};
      dayShifts.forEach(item => {
        if (!grouped[item.shift]) grouped[item.shift] = [];
        grouped[item.shift].push(item.name);
      });
      Object.entries(grouped).forEach(([shift, names]) => {
        html += `<div class="mb-4 paint-layer p-3 rounded-xl ">
          <div class="font-bold text-indigo-600 dark:text-indigo-400 border-b border-indigo-100 dark:border-indigo-900/50 mb-2 pb-1 text-sm flex items-center">
            <span class="w-2 h-2 rounded-full bg-indigo-500 mr-2"></span>${shift}
          </div>
          <div class="text-sm text-gray-700 dark:text-gray-300 pl-1 grid grid-cols-2 gap-1">
            ${names.map(n => `<div class="flex items-center"><span class="text-gray-400 mr-1.5">•</span>${n}</div>`).join('')}
          </div>
        </div>`;
      });
    }
    html += '</div>';

    Swal.fire({
      title: `<div class="text-lg font-bold">Lịch Ngày ${mDate.date.getDate()}/${mDate.date.getMonth() + 1}</div>`,
      html,
      confirmButtonText: 'Đóng',
      confirmButtonColor: '#4f46e5',
      customClass: { popup: 'rounded-2xl' }
    });
  };

  const renderUserMonthView = () => {
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
      <div className="mt-4 animate-fade-in">
        <CalendarGrid 
          monthDates={monthDates}
          renderCell={(mDate) => {
            const myShift = empMonthMap[store.currentUser?.fullname || '']?.[`${mDate.weekLabel}_${mDate.dayIndex}`] || '';
            const isOff = myShift === 'OFF' || !myShift;
            return (
              <div 
                className={`w-full h-full flex flex-col justify-center items-center cursor-pointer hover:scale-95 transition-transform rounded-xl p-1  border border-transparent hover:border-indigo-200 ${getAdminShiftClass(myShift)}`}
                onClick={() => showDayDetails(mDate, empMonthMap)}
                title="Nhấn để xem chi tiết toàn quán"
              >
                {!isOff && <span className="text-[10px] sm:text-xs font-bold leading-tight text-center">{myShift}</span>}
                {isOff && <span className="text-[9px] opacity-60">OFF</span>}
              </div>
            );
          }}
        />
        <div className="mt-5 text-xs text-center text-gray-500 dark:text-gray-400 paint-layer/50 py-2 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
          💡 Nhấn vào một ngày bất kỳ để xem lịch làm của toàn quán
        </div>
      </div>
    );
  };

  return (
      <div className="overflow-x-auto w-full soft3d-bg rounded-xl border border-gray-200 dark:border-gray-700 pb-10">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-[10px] text-gray-500 dark:text-gray-400 uppercase paint-layer/80 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-3 py-3 sticky left-0 paint-layer z-20 font-bold border-r border-gray-200 dark:border-gray-700 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">Nhân Viên</th>
              {SHORT_DAY_NAMES.map((d, idx) => {
                const isUnderstaffed = dailyWaitstaffCounts[idx] < 3;
                return (
                <th key={d} className="px-1 py-3 text-center border-r border-gray-200 dark:border-gray-700 last:border-r-0 relative">
                  <div className="font-bold text-[13px]">{weekInfo.weekDates[idx]}</div>
                  <div className="text-[10px] font-normal opacity-70 mt-0.5">{d}</div>
                  {isUnderstaffed && (
                     <div className="absolute top-1 right-1 text-red-500 animate-pulse" title={`Thiếu nhân sự phục vụ (${dailyWaitstaffCounts[idx]} người)`}>
                        <ShieldAlert size={12} />
                     </div>
                  )}
                </th>
              )})}
            </tr>
          </thead>
          <tbody>
            {rosterToRender.map((emp, empIdx) => (
              <tr key={empIdx} className={`soft3d-card border-b dark:border-gray-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors ${emp.username === store.currentUser?.username ? 'bg-indigo-50/30 dark:bg-indigo-900/20' : ''}`}>
                <td className="px-3 py-3 sticky left-0 soft3d-card z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)] border-r border-gray-200 dark:border-gray-700">
                  <div className="font-bold text-gray-800 dark:text-gray-200 truncate max-w-[100px] text-xs">
                    {emp.fullname}
                  </div>
                  {emp.username === store.currentUser?.username && (
                    <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mt-0.5">Bạn</div>
                  )}
                </td>
                {emp.shifts.map((shift: string, dayIdx: number) => {
                  const isOff = shift === 'OFF' || !shift;
                  return (
                    <td key={dayIdx} className="px-1 py-2 border-r border-gray-100 dark:border-gray-700/50 last:border-r-0 text-center">
                      <div className={`inline-flex items-center justify-center text-[10px] font-bold w-full max-w-[60px] py-1.5 rounded-lg ${getAdminShiftClass(shift)}`}>
                        {isOff ? 'OFF' : shift}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderAdminMonthView = () => {
    // Flatten monthData to map [fullname] -> { [dateKey]: shift }
    const empMonthMap: Record<string, Record<string, string>> = {};
    monthData?.forEach(week => {
      // Dựa vào weekLabel để map ra 7 date keys của tuần đó
      // Do we need to parse weekLabel? Or we can just use the dates generated for the month!
      // In generateMonthDates, we already computed which weekLabel each date belongs to!
      week?.schedules?.forEach((emp: any) => {
        if (!empMonthMap[emp.fullname]) empMonthMap[emp.fullname] = {};
        emp?.shifts?.forEach((s: string, i: number) => {
          empMonthMap[emp.fullname][`${week.weekLabel}_${i}`] = s;
        });
      });
    });

    const dailyWaitstaffCounts = monthDates.map(() => 0);
    monthData?.forEach(week => {
      week?.schedules?.forEach((emp: any) => {
        const user = activeUsers.find(u => u.fullname === emp.fullname);
        const isWaitstaff = user?.position?.toLowerCase().includes('phục vụ') || false;
        emp?.shifts?.forEach((s: string, i: number) => {
          if (s && s !== 'OFF' && isWaitstaff) {
            // Find which mDate this corresponds to
            const dateIndex = monthDates.findIndex(md => md.weekLabel === week.weekLabel && md.dayIndex === i);
            if (dateIndex !== -1) dailyWaitstaffCounts[dateIndex]++;
          }
        });
      });
    });

    const rosterToRender = filteredUsers.map(u => {
      const shifts = monthDates.map(mDate => {
        return empMonthMap[u.fullname]?.[`${mDate.weekLabel}_${mDate.dayIndex}`] || '';
      });
      return {
        fullname: u.fullname,
        username: u.username,
        shifts
      };
    });

    return (
      <div className="overflow-x-auto w-full soft3d-bg rounded-xl border border-gray-200 dark:border-gray-700 pb-10 custom-scrollbar">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-[10px] text-gray-500 dark:text-gray-400 uppercase paint-layer/80 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-3 py-3 sticky left-0 paint-layer z-20 font-bold border-r border-gray-200 dark:border-gray-700 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">Nhân Viên</th>
              {monthDates.map((mDate, idx) => {
                const isUnderstaffed = dailyWaitstaffCounts[idx] < 3;
                return (
                <th key={mDate.dateKey} className={`px-1 py-2 text-center border-r border-gray-200 dark:border-gray-700 min-w-[50px] relative ${mDate.isWeekend ? 'bg-gray-200 dark:bg-gray-700/50' : ''}`}>
                  <div className="font-bold text-gray-700 dark:text-gray-300 text-[13px]">{formatDateShort(mDate.date)}</div>
                  <div className="text-[10px] font-normal opacity-70 mt-0.5">{SHORT_DAY_NAMES[mDate.dayIndex]}</div>
                  {isUnderstaffed && (
                     <div className="absolute top-0.5 right-0.5 text-red-500 animate-pulse" title={`Thiếu nhân sự phục vụ (${dailyWaitstaffCounts[idx]} người)`}>
                        <ShieldAlert size={10} />
                     </div>
                  )}
                </th>
              )})}
            </tr>
          </thead>
          <tbody>
            {rosterToRender.map((emp, empIdx) => (
              <tr key={empIdx} className={`soft3d-card border-b dark:border-gray-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors ${emp.username === store.currentUser?.username ? 'bg-indigo-50/30 dark:bg-indigo-900/20' : ''}`}>
                <td className="px-3 py-3 sticky left-0 soft3d-card z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)] border-r border-gray-200 dark:border-gray-700">
                  <div className="font-bold text-gray-800 dark:text-gray-200 truncate max-w-[100px] text-xs">
                    {emp.fullname}
                  </div>
                </td>
                {emp.shifts.map((shift: string, dayIdx: number) => {
                  const mDate = monthDates[dayIdx];
                  const isOff = shift === 'OFF' || !shift;
                  return (
                    <td key={dayIdx} className={`px-1 py-1 border-r border-gray-100 dark:border-gray-700/50 text-center ${mDate.isWeekend ? 'paint-layer/80' : ''}`}>
                      <div className={`inline-flex items-center justify-center text-[9px] font-bold w-full py-1 rounded-md ${getAdminShiftClass(shift)}`}>
                        {isOff ? 'OFF' : shift}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-4 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="roster"
        title="Ma trận Xoay ca"
        description="Lịch làm việc của toàn bộ nhân sự tại nhà hàng."
        eyebrow="Phân ca"
      />

        
      {/* Toggle Mode & Time Navigation */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 relative z-10 gap-3 w-full soft3d-card p-2 rounded-2xl  ">
          <div className="flex items-center space-x-1">
            <button 
              onClick={() => setViewMode('week')} 
              className={`flex items-center px-4 py-2 rounded-xl text-sm font-bold transition-colors ${viewMode === 'week' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
            >
              <CalendarRange size={16} className="mr-1.5" /> Tuần
            </button>
            <button 
              onClick={() => setViewMode('month')} 
              className={`flex items-center px-4 py-2 rounded-xl text-sm font-bold transition-colors ${viewMode === 'month' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
            >
              <LayoutGrid size={16} className="mr-1.5" /> Tháng
            </button>
          </div>
          
          <div className="flex items-center space-x-2 soft3d-bg/50 rounded-xl p-1.5 border border-gray-200 dark:border-gray-700 w-full sm:w-auto justify-center sm:justify-start">
            <button onClick={() => viewMode === 'week' ? changeWeek(-1) : changeMonth(-1)} className="p-1.5 hover:bg-white dark:hover:bg-gray-800 hover: rounded-lg transition-all text-gray-600 dark:text-gray-400"><ChevronLeft size={18} /></button>
            <div className="text-sm font-bold px-2 min-w-[140px] text-center text-gray-800 dark:text-gray-200">
              {viewMode === 'week' ? weekInfo.weekDisplay : `Tháng ${selectedMonth}/${selectedYear}`}
            </div>
            <button onClick={() => viewMode === 'week' ? changeWeek(1) : changeMonth(1)} className="p-1.5 hover:bg-white dark:hover:bg-gray-800 hover: rounded-lg transition-all text-gray-600 dark:text-gray-400"><ChevronRight size={18} /></button>
          </div>
        </div>
        


      <div className="soft3d-card p-5 rounded-2xl  ">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b dark:border-gray-700 pb-3 gap-3">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white text-sm">
            <Calendar size={16} className="mr-2 text-indigo-600" /> Bảng phân ca toàn quán
          </h3>
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-48">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Filter size={14} className="text-gray-400" />
              </div>
              <select 
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full pl-8 pr-4 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 soft3d-bg focus:ring-2 focus:ring-indigo-500 appearance-none text-gray-700 dark:text-gray-300 font-medium"
              >
                <option value="ALL">Tất cả chức vụ</option>
                {uniqueRoles.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <button onClick={loadSchedules} className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition flex items-center font-bold flex-shrink-0">
              <RefreshCw size={12} className="mr-1" /> Làm mới
            </button>
          </div>
        </div>

        <div className="mb-4 text-xs text-gray-500 dark:text-gray-400 soft3d-bg p-3 rounded-xl  flex items-start">
          <Info size={14} className="mr-2 text-indigo-500 mt-0.5 flex-shrink-0" />
          <p>Đây là lịch làm việc chính thức đã được Quản lý phê duyệt. Nếu có nhu cầu thay đổi, vui lòng báo Quản lý (Admin).</p>
        </div>

        {filteredUsers.length > 0 ? (
          viewMode === 'week' ? renderWeekView() : (store.currentUser?.role === 'admin' || store.currentUser?.role === 'tester' ? renderAdminMonthView() : renderUserMonthView())
        ) : (
          <div className="text-center py-10 text-gray-400">Không có dữ liệu nhân viên cho chức vụ này</div>
        )}
      </div>
    </div>
  );
}
