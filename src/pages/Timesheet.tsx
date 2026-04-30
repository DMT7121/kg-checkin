import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { generateMonthDates, SHORT_DAY_NAMES } from '../utils/helpers';
import CalendarGrid from '../components/CalendarGrid';
import { callApi } from '../services/api';
import { CalendarClock, Clock, ListOrdered, Calendar } from 'lucide-react';
import Swal from 'sweetalert2';

type ViewMode = 'HOURS' | 'TIMESTAMPS';

export default function Timesheet() {
  const store = useAppStore();
  const { currentUser, timesheetData, users } = store;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';
  
  const [viewMode, setViewMode] = useState<ViewMode>('HOURS');
  const [selectedUser, setSelectedUser] = useState<string>('ALL');

  useEffect(() => {
    loadTimesheet();
  }, []);

  const loadTimesheet = async () => {
    store.setLoading(true, 'Đang tải bảng chấm công...');
    const res = await callApi('GET_TIMESHEET', {
      username: currentUser?.username,
      role: currentUser?.role
    });
    store.setLoading(false);
    if (res?.ok) {
      store.setTimesheetData(res.data);
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể tải bảng tổng hợp công', 'error');
    }
  };

  if (!timesheetData || !timesheetData.year) {
    return (
      <div className="p-4 space-y-5 animate-slide-up pb-10">
        <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4">
            <CalendarClock size={100} />
          </div>
          <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Tổng Hợp Công</h2>
          <p className="text-indigo-100 font-medium opacity-90 relative z-10 text-sm">Chưa có dữ liệu</p>
        </div>
      </div>
    );
  }

  // Lấy danh sách các ngày trong tháng
  const days = Array.from({ length: timesheetData.daysInMonth }, (_, i) => i + 1);
  const { year, month } = timesheetData;
  const monthDates = generateMonthDates(month, year);

  // Lọc user hiển thị
  const displayNames = Object.keys(timesheetData.timesheet).filter(name => {
    if (!isAdmin) return name === currentUser?.fullname;
    if (selectedUser !== 'ALL') return name === selectedUser;
    return true;
  });

  const calculateCell = (records: any[]) => {
    if (!records || records.length === 0) return { hours: 0, text: '' };
    
    // Sort by time
    const sorted = [...records].sort((a, b) => a.originalTimeMs - b.originalTimeMs);
    let totalMs = 0;
    let lastIn = 0;
    let lastInTimeStr = '';
    let timeTextLines: string[] = [];
    
    for (const r of sorted) {
      const validStr = r.validStatus || '';
      // Nếu validStr rỗng (do nhập tay hoặc backend chưa cập nhật), mặc định cho phép
      const isHopLe = validStr === '' || (validStr.includes('HỢP LỆ') && !validStr.includes('KHÔNG'));
      if (!isHopLe) continue;

      const type = r.status.toUpperCase();
      if (type.includes('VÀO CA') || type === 'IN') {
        lastIn = r.originalTimeMs;
        lastInTimeStr = r.time;
      } else if ((type.includes('RA CA') || type === 'OUT') && lastIn > 0) {
        const diff = r.originalTimeMs - lastIn;
        if (diff > 0 && diff < 14 * 60 * 60 * 1000) {
          totalMs += diff;
        }
        timeTextLines.push(`${lastInTimeStr} - ${r.time}`);
        lastIn = 0;
        lastInTimeStr = '';
      }
    }
    
    // Nêu thiếu giờ ra ca
    if (lastIn > 0) {
      timeTextLines.push(`${lastInTimeStr} - ?`);
    }

    return {
      hours: totalMs / (1000 * 60 * 60),
      text: timeTextLines.join('\n')
    };
  };

  return (
    <div className="p-4 space-y-5 animate-slide-up pb-10">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between mb-6">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
              <CalendarClock size={20} className="text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Tổng Hợp Công</h2>
          </div>
          <p className="text-blue-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
            Tháng {month}/{year}
          </p>
        </div>
        <div className="hidden md:block relative z-10 opacity-80">
          <FileClock size={80} strokeWidth={1} />
        </div>
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-blue-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('HOURS')}
              className={`flex items-center px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'HOURS' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-500'}`}
            >
              <Clock size={16} className="mr-2" /> Giờ làm
            </button>
            <button
              onClick={() => setViewMode('TIMESTAMPS')}
              className={`flex items-center px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'TIMESTAMPS' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-500'}`}
            >
              <ListOrdered size={16} className="mr-2" /> Mốc thời gian
            </button>
          </div>

          {isAdmin && (
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-sm"
            >
              <option value="ALL">Tất cả nhân viên</option>
              {users.map(u => (
                <option key={u.username} value={u.fullname}>{u.fullname}</option>
              ))}
            </select>
          )}
        </div>

        
        {selectedUser === 'ALL' && isAdmin ? (
          <div className="overflow-x-auto w-full rounded-xl border border-gray-200 dark:border-gray-700 custom-scrollbar">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 font-bold sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 border-b border-r dark:border-gray-700 min-w-[150px]">
                    Nhân viên
                  </th>
                  <th className="px-4 py-3 font-extrabold sticky left-[150px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 z-10 border-b border-r dark:border-gray-700 min-w-[100px] text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    Tổng giờ
                  </th>
                  {days.map(d => {
                    const dateObj = new Date(year, month - 1, d);
                    const dayOfWeek = dateObj.getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                    return (
                      <th key={d} className={`px-2 py-2 font-bold text-center border-b border-r dark:border-gray-700 min-w-[70px] ${isWeekend ? 'bg-orange-50/50 dark:bg-orange-900/10 text-orange-600' : ''}`}>
                        <div className="flex flex-col items-center">
                          <span className="text-[13px]">{`${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}`}</span>
                          <span className="text-[10px] font-normal opacity-70 mt-0.5 uppercase">{SHORT_DAY_NAMES[dayIndex]}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayNames.map(name => {
                  const userDates = timesheetData.timesheet[name] || {};
                  const totalMonthHours = days.reduce((sum, d) => {
                    const dateStr = `${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
                    const records = userDates[dateStr] || [];
                    return sum + calculateCell(records).hours;
                  }, 0);
                  
                  return (
                    <tr key={name} className="border-b dark:border-gray-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-800 border-r dark:border-gray-700 z-10">
                        {name}
                      </td>
                      <td className="px-4 py-3 font-black text-center text-indigo-600 dark:text-indigo-400 sticky left-[150px] bg-indigo-50/50 dark:bg-indigo-900/20 border-r dark:border-gray-700 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {totalMonthHours.toFixed(2)}
                      </td>
                      {days.map(d => {
                        const dateStr = `${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
                        const records = userDates[dateStr] || [];
                        const { hours, text } = calculateCell(records);
                        return (
                          <td key={d} className="px-2 py-2 border-r dark:border-gray-700 text-center relative group">
                            {(hours > 0 || text !== '') ? (
                              <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 py-1 px-1.5 rounded-lg text-xs font-bold mx-auto w-fit whitespace-pre-line">
                                {viewMode === 'HOURS' ? (hours > 0 ? hours.toFixed(2) : '?') : text}
                              </div>
                            ) : (
                              <div className="text-gray-300 dark:text-gray-600 text-xs">-</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Nếu xem 1 người cụ thể (Nhân viên hoặc Admin đã chọn User) -> Hiển thị CalendarGrid */
          <div className="mt-4 animate-fade-in">
            {(() => {
              const targetUser = isAdmin && selectedUser !== 'ALL' ? selectedUser : (currentUser?.fullname || '');
              const userDates = timesheetData.timesheet[targetUser] || {};
              const totalMonthHours = days.reduce((sum, d) => {
                const dateStr = `${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
                const records = userDates[dateStr] || [];
                return sum + calculateCell(records).hours;
              }, 0);

              return (
                <div>
                  <div className="mb-4 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800 flex justify-between items-center">
                    <div>
                      <div className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">Tổng giờ làm tháng {month}</div>
                      <div className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{totalMonthHours.toFixed(2)} <span className="text-lg">giờ</span></div>
                    </div>
                  </div>

                  <CalendarGrid 
                    monthDates={monthDates}
                    renderCell={(mDate) => {
                      const d = mDate.date.getDate();
                      const dateStr = `${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
                      const records = userDates[dateStr] || [];
                      const { hours, text } = calculateCell(records);
                      
                      const hasData = hours > 0 || text !== '';
                      
                      return (
                        <div className="w-full h-full flex flex-col justify-center items-center rounded-lg p-1">
                          {hasData ? (
                            <div className="bg-indigo-500 text-white py-1 px-2 rounded-md text-[10px] sm:text-xs font-bold whitespace-pre-line text-center w-full shadow-sm">
                              {viewMode === 'HOURS' ? (hours > 0 ? `${hours.toFixed(2)}h` : '?') : text}
                            </div>
                          ) : (
                            <div className="text-gray-300 dark:text-gray-600 text-xs opacity-50">-</div>
                          )}
                        </div>
                      );
                    }}
                  />
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}