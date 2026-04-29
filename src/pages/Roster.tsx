import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { computeWeekInfo, DAY_NAMES, getAdminShiftClass } from '../utils/helpers';
import { CalendarDays, RefreshCw, Info, Calendar } from 'lucide-react';
import Swal from 'sweetalert2';

export default function Roster() {
  const store = useAppStore();
  const [weekInfo] = useState(() => computeWeekInfo());
  const [rosterData, setRosterData] = useState<any[]>([]);

  const loadRoster = async () => {
    store.setLoading(true, 'Đang tải Lịch làm...');
    const res = await callApi('GET_ALL_SCHEDULES', { 
      monthSheet: weekInfo.monthSheet, 
      weekLabel: weekInfo.weekLabel 
    });
    store.setLoading(false);
    
    if (res?.ok) {
      setRosterData(res.data);
    } else {
      Swal.fire('Lỗi', 'Không thể tải lịch làm việc', 'error');
    }
  };

  useEffect(() => {
    loadRoster();
  }, []);

  return (
    <div className="p-4 animate-slide-up pb-10">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4">
          <CalendarDays size={100} />
        </div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Lịch Làm Chính Thức</h2>
        <p className="text-indigo-100 font-medium opacity-90 relative z-10">{weekInfo.weekDisplay}</p>
      </div>

      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4 border-b dark:border-gray-700 pb-2">
          <h3 className="font-bold flex items-center text-gray-800 dark:text-white text-sm">
            <Calendar size={16} className="mr-2 text-indigo-600" /> Bảng phân ca toàn quán
          </h3>
          <button onClick={loadRoster} className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition flex items-center font-bold">
            <RefreshCw size={12} className="mr-1" /> Làm mới
          </button>
        </div>

        <div className="mb-4 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-700 flex items-start">
          <Info size={14} className="mr-2 text-indigo-500 mt-0.5 flex-shrink-0" />
          <p>Đây là lịch làm việc chính thức đã được Quản lý phê duyệt. Nếu có nhu cầu thay đổi, vui lòng vào Chợ Đổi Ca.</p>
        </div>

        {rosterData.length > 0 ? (
          <div className="overflow-x-auto bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-[10px] text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-3 py-3 sticky left-0 bg-gray-100 dark:bg-gray-800 z-10 font-bold border-r border-gray-200 dark:border-gray-700">Nhân Viên</th>
                  {DAY_NAMES.map((d, idx) => (
                    <th key={d} className="px-1 py-3 text-center border-r border-gray-200 dark:border-gray-700 last:border-r-0">
                      <div className="font-bold">{d.replace('Thứ ', 'T').replace('Chủ Nhật', 'CN')}</div>
                      <div className="text-[9px] font-normal opacity-70 mt-0.5">{weekInfo.weekDates[idx]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rosterData.map((emp, empIdx) => (
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
                      // Status is Approved if employee has it approved, else it's just raw. Roster usually shows only Approved, but we show whatever Admin sees.
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
        ) : (
          <div className="text-center py-10 text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
            <CalendarDays size={40} className="mx-auto mb-3 opacity-30 text-indigo-500" />
            <p className="text-sm font-medium">Lịch làm tuần tới đang được xếp...</p>
            <p className="text-xs mt-1">Quản lý chưa công bố lịch làm việc chính thức.</p>
          </div>
        )}
      </div>
    </div>
  );
}
