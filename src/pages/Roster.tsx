import { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { computeWeekInfo, DAY_NAMES, getAdminShiftClass, generateMonthDates, MonthDateInfo } from '../utils/helpers';
import { CalendarDays, RefreshCw, Info, Calendar, ChevronLeft, ChevronRight, LayoutGrid, CalendarRange } from 'lucide-react';
import Swal from 'sweetalert2';

export default function Roster() {
  const store = useAppStore();
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  
  // Calculate week info and month info based on currentDate
  const weekInfo = useMemo(() => computeWeekInfo(currentDate, false), [currentDate]);
  
  const selectedMonth = currentDate.getMonth() + 1;
  const selectedYear = currentDate.getFullYear();
  const monthDates = useMemo(() => generateMonthDates(selectedMonth, selectedYear), [selectedMonth, selectedYear]);
  
  const [monthData, setMonthData] = useState<any[]>([]); // To hold data from GET_MONTH_SCHEDULES

  const loadSchedules = async () => {
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
  const users = store.users && store.users.length > 0 ? store.users : [];
  
  const renderWeekView = () => {
    // Find the week data in monthData
    const weekData = monthData.find(w => w.weekLabel === weekInfo.weekLabel);
    const schedules = weekData ? weekData.schedules : [];
    
    // Map to ensure all users exist
    const rosterToRender = users.map(u => {
      const found = schedules.find((s: any) => s.fullname === u.fullname);
      return {
        fullname: u.fullname,
        username: u.username,
        shifts: found ? found.shifts : ['', '', '', '', '', '', '']
      };
    });

    return (
      <div className="overflow-x-auto bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 pb-10">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-[10px] text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-3 py-3 sticky left-0 bg-gray-100 dark:bg-gray-800 z-20 font-bold border-r border-gray-200 dark:border-gray-700 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">Nhân Viên</th>
              {DAY_NAMES.map((d, idx) => (
                <th key={d} className="px-1 py-3 text-center border-r border-gray-200 dark:border-gray-700 last:border-r-0">
                  <div className="font-bold">{d.replace('Thứ ', 'T').replace('Chủ Nhật', 'CN')}</div>
                  <div className="text-[9px] font-normal opacity-70 mt-0.5">{weekInfo.weekDates[idx]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rosterToRender.map((emp, empIdx) => (
              <tr key={empIdx} className={`bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors ${emp.username === store.currentUser?.username ? 'bg-indigo-50/30 dark:bg-indigo-900/20' : ''}`}>
                <td className="px-3 py-3 sticky left-0 bg-white dark:bg-gray-800 z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)] border-r border-gray-200 dark:border-gray-700">
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

  const renderMonthView = () => {
    // Flatten monthData to map [fullname] -> { [dateKey]: shift }
    const empMonthMap: Record<string, Record<string, string>> = {};
    monthData.forEach(week => {
      // Dựa vào weekLabel để map ra 7 date keys của tuần đó
      // Do we need to parse weekLabel? Or we can just use the dates generated for the month!
      // In generateMonthDates, we already computed which weekLabel each date belongs to!
      week.schedules.forEach((emp: any) => {
        if (!empMonthMap[emp.fullname]) empMonthMap[emp.fullname] = {};
        emp.shifts.forEach((s: string, i: number) => {
          empMonthMap[emp.fullname][`${week.weekLabel}_${i}`] = s;
        });
      });
    });

    const rosterToRender = users.map(u => {
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
      <div className="overflow-x-auto bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 pb-10 custom-scrollbar">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-[10px] text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-3 py-3 sticky left-0 bg-gray-100 dark:bg-gray-800 z-20 font-bold border-r border-gray-200 dark:border-gray-700 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">Nhân Viên</th>
              {monthDates.map((mDate) => (
                <th key={mDate.dateKey} className={`px-1 py-2 text-center border-r border-gray-200 dark:border-gray-700 min-w-[50px] ${mDate.isWeekend ? 'bg-gray-200 dark:bg-gray-700/50' : ''}`}>
                  <div className="font-bold text-gray-700 dark:text-gray-300">{mDate.date.getDate()}</div>
                  <div className="text-[8px] font-normal opacity-70">{DAY_NAMES[mDate.dayIndex].replace('Thứ ', 'T').replace('Chủ Nhật', 'CN')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rosterToRender.map((emp, empIdx) => (
              <tr key={empIdx} className={`bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-colors ${emp.username === store.currentUser?.username ? 'bg-indigo-50/30 dark:bg-indigo-900/20' : ''}`}>
                <td className="px-3 py-3 sticky left-0 bg-white dark:bg-gray-800 z-10 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)] border-r border-gray-200 dark:border-gray-700">
                  <div className="font-bold text-gray-800 dark:text-gray-200 truncate max-w-[100px] text-xs">
                    {emp.fullname}
                  </div>
                </td>
                {emp.shifts.map((shift: string, dayIdx: number) => {
                  const mDate = monthDates[dayIdx];
                  const isOff = shift === 'OFF' || !shift;
                  return (
                    <td key={dayIdx} className={`px-1 py-1 border-r border-gray-100 dark:border-gray-700/50 text-center ${mDate.isWeekend ? 'bg-gray-50 dark:bg-gray-800/80' : ''}`}>
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
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4">
          <CalendarDays size={100} />
        </div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Lịch Làm Chính Thức</h2>
        
        {/* Toggle Mode & Time Navigation */}
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
      </div>

      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4 border-b dark:border-gray-700 pb-2">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white text-sm">
            <Calendar size={16} className="mr-2 text-indigo-600" /> Bảng phân ca toàn quán
          </h3>
          <button onClick={loadSchedules} className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition flex items-center font-bold">
            <RefreshCw size={12} className="mr-1" /> Làm mới
          </button>
        </div>

        <div className="mb-4 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-700 flex items-start">
          <Info size={14} className="mr-2 text-indigo-500 mt-0.5 flex-shrink-0" />
          <p>Đây là lịch làm việc chính thức đã được Quản lý phê duyệt. Nếu có nhu cầu thay đổi, vui lòng báo Quản lý (Admin).</p>
        </div>

        {users.length > 0 ? (
          viewMode === 'week' ? renderWeekView() : renderMonthView()
        ) : (
          <div className="text-center py-10 text-gray-400">Không có dữ liệu nhân viên</div>
        )}
      </div>
    </div>
  );
}
