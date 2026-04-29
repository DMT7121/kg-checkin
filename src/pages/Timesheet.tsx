import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
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
      <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4">
          <CalendarClock size={100} />
        </div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Tổng Hợp Công</h2>
        <p className="text-indigo-100 font-medium opacity-90 relative z-10 text-sm">
          Tháng {month}/{year}
        </p>
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

        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 custom-scrollbar">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 font-bold sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 border-b border-r dark:border-gray-700 min-w-[150px]">
                  Nhân viên
                </th>
                {days.map(d => {
                  const dateStr = `${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
                  const isWeekend = new Date(year, month - 1, d).getDay() === 0 || new Date(year, month - 1, d).getDay() === 6;
                  return (
                    <th key={d} className={`px-2 py-3 font-bold text-center border-b border-r dark:border-gray-700 min-w-[70px] ${isWeekend ? 'bg-orange-50/50 dark:bg-orange-900/10 text-orange-600' : ''}`}>
                      <div className="flex flex-col items-center">
                        <span>{d}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayNames.map(name => {
                const userDates = timesheetData.timesheet[name] || {};
                
                return (
                  <tr key={name} className="border-b dark:border-gray-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
                    <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-800 border-r dark:border-gray-700 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      {name}
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
              
              {displayNames.length === 0 && (
                <tr>
                  <td colSpan={days.length + 1} className="text-center py-8 text-gray-400">
                    Không có dữ liệu
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
