import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { generateMonthDates, SHORT_DAY_NAMES } from '../utils/helpers';
import CalendarGrid from '../components/CalendarGrid';
import { callApi } from '../services/api';
import { CalendarClock, Clock, ListOrdered, Calendar, FileClock, Search, List, Eye, ArrowLeft } from 'lucide-react';
import Swal from 'sweetalert2';
import { KgModuleHero, KgInput, KgCard, KgButton } from '../components/KgDesignSystem';

type ViewMode = 'HOURS' | 'TIMESTAMPS';
type DetailMobileView = 'CALENDAR' | 'LIST';

export default function Timesheet() {
  const store = useAppStore();
  const { currentUser, timesheetData, users } = store;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'tester';
  
  const [viewMode, setViewMode] = useState<ViewMode>('HOURS');
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mobileDetailView, setMobileDetailView] = useState<DetailMobileView>('LIST');
  const [onlyShowWorkdays, setOnlyShowWorkdays] = useState<boolean>(true);

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
        <div className="soft3d-card !bg-gradient-to-br from-indigo-500 to-blue-600 p-6 text-white relative overflow-hidden border-opacity-30">
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
    
    // Nếu chọn 1 user cụ thể bằng dropdown, chỉ cho hiển thị user đó
    if (selectedUser !== 'ALL' && name !== selectedUser) return false;
    
    // Nếu có tìm kiếm, lọc theo tên
    if (searchQuery.trim() !== '') {
      const cleanName = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const cleanQuery = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return cleanName.includes(cleanQuery);
    }
    
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
      <KgModuleHero
        moduleId="timesheet"
        title="Tổng Hợp Công"
        description={`Bảng công và thời gian làm việc chi tiết tháng ${month}/${year}`}
        eyebrow="Báo cáo"
      />

      <div className="soft3d-card p-5 rounded-2xl">
        {/* Thanh công cụ tìm kiếm và lọc */}
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex soft3d-bg p-1 rounded-xl">
              <button
                onClick={() => setViewMode('HOURS')}
                className={`flex items-center px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'HOURS' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 ' : 'text-gray-500'}`}
              >
                <Clock size={16} className="mr-2" /> Giờ làm
              </button>
              <button
                onClick={() => setViewMode('TIMESTAMPS')}
                className={`flex items-center px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'TIMESTAMPS' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 ' : 'text-gray-500'}`}
              >
                <ListOrdered size={16} className="mr-2" /> Mốc thời gian
              </button>
            </div>

            {/* Bộ chuyển đổi chế độ xem Lịch / Danh sách cho cá nhân */}
            {(selectedUser !== 'ALL' || !isAdmin) && (
              <div className="flex soft3d-bg p-1 rounded-xl">
                <button
                  onClick={() => setMobileDetailView('CALENDAR')}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${mobileDetailView === 'CALENDAR' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 ' : 'text-gray-500'}`}
                >
                  <Calendar size={16} className="mr-1.5" /> Lịch
                </button>
                <button
                  onClick={() => setMobileDetailView('LIST')}
                  className={`flex items-center px-3 py-2 rounded-lg text-sm font-bold transition-all ${mobileDetailView === 'LIST' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 ' : 'text-gray-500'}`}
                >
                  <List size={16} className="mr-1.5" /> Danh sách
                </button>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Ô tìm kiếm nhanh nhân viên */}
              <div className="w-full sm:w-60">
                <KgInput
                  type="text"
                  placeholder="Tìm tên nhân viên..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  icon={Search}
                  className="!py-2"
                />
              </div>

              <select
                value={selectedUser}
                onChange={(e) => {
                  setSelectedUser(e.target.value);
                  setSearchQuery(''); // Xóa tìm kiếm khi chuyển user
                }}
                className="soft3d-bg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-sm min-h-[44px]"
              >
                <option value="ALL">Tất cả nhân viên</option>
                {users.map(u => (
                  <option key={u.username} value={u.fullname}>{u.fullname}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* PHẦN 1: Danh sách tất cả nhân viên (Chỉ Admin) */}
        {selectedUser === 'ALL' && isAdmin ? (
          <>
            {/* Giao diện Desktop: Bảng ngang cuộn */}
            <div className="hidden md:block overflow-x-auto w-full rounded-xl border border-gray-200 dark:border-gray-700 custom-scrollbar">
              <table className="w-full text-sm text-left">
                <thead className="soft3d-bg/50 text-gray-500 dark:text-gray-400 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 font-bold sticky left-0 soft3d-bg z-10 border-b border-r dark:border-gray-700 min-w-[150px]">
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
                  {displayNames.length === 0 ? (
                    <tr>
                      <td colSpan={days.length + 2} className="text-center py-8 text-gray-400">
                        Không tìm thấy nhân viên phù hợp
                      </td>
                    </tr>
                  ) : (
                    displayNames.map(name => {
                      const userDates = timesheetData.timesheet[name] || {};
                      const totalMonthHours = days.reduce((sum, d) => {
                        const dateStr = `${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
                        const records = userDates[dateStr] || [];
                        return sum + calculateCell(records).hours;
                      }, 0);
                      
                      return (
                        <tr key={name} className="border-b dark:border-gray-700 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors">
                          <td className="px-4 py-3 font-bold text-gray-800 dark:text-gray-200 sticky left-0 soft3d-card border-r dark:border-gray-700 z-10">
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
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Giao diện Mobile: Danh sách thẻ (Cards) */}
            <div className="block md:hidden space-y-3">
              {displayNames.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  Không tìm thấy nhân viên phù hợp
                </div>
              ) : (
                displayNames.map(name => {
                  const userDates = timesheetData.timesheet[name] || {};
                  const totalMonthHours = days.reduce((sum, d) => {
                    const dateStr = `${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
                    const records = userDates[dateStr] || [];
                    return sum + calculateCell(records).hours;
                  }, 0);

                  const workDaysCount = days.filter(d => {
                    const dateStr = `${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
                    const records = userDates[dateStr] || [];
                    return calculateCell(records).hours > 0;
                  }).length;

                  // Lấy chữ cái đầu làm Avatar
                  const nameParts = name.trim().split(' ');
                  const initials = nameParts.length > 1
                    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
                    : nameParts[0].substring(0, 2).toUpperCase();

                  return (
                    <KgCard key={name} className="flex items-center justify-between p-4 border border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-xs font-black shadow-sm flex-shrink-0">
                          {initials}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-gray-800 dark:text-gray-100 text-sm leading-snug">{name}</h4>
                          <span className="text-[11px] text-gray-400 block font-medium mt-0.5">
                            {workDaysCount} ngày công • Tháng {month}/{year}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 font-bold block uppercase tracking-wider">Tổng giờ</span>
                          <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{totalMonthHours.toFixed(2)}h</span>
                        </div>
                        <KgButton
                          size="sm"
                          variant="secondary"
                          icon={Eye}
                          onClick={() => setSelectedUser(name)}
                          className="!px-3 !py-1.5 !min-h-[36px]"
                        >
                          Chi tiết
                        </KgButton>
                      </div>
                    </KgCard>
                  );
                })
              )}
            </div>
          </>
        ) : (
          /* PHẦN 2: Chi tiết chấm công cá nhân */
          <div className="mt-4 animate-fade-in">
            {(() => {
              const targetUser = isAdmin && selectedUser !== 'ALL' ? selectedUser : (currentUser?.fullname || '');
              const userDates = timesheetData.timesheet[targetUser] || {};
              const totalMonthHours = days.reduce((sum, d) => {
                const dateStr = `${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
                const records = userDates[dateStr] || [];
                return sum + calculateCell(records).hours;
              }, 0);

              // Danh sách công chuẩn bị cho List View
              const workdayList = days.map(d => {
                const dateObj = new Date(year, month - 1, d);
                const dayOfWeek = dateObj.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                const dateStr = `${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
                const records = userDates[dateStr] || [];
                const { hours, text } = calculateCell(records);
                const isToday = new Date().toDateString() === dateObj.toDateString();
                
                return {
                  day: d,
                  dateObj,
                  isWeekend,
                  dayLabel: SHORT_DAY_NAMES[dayIndex],
                  dateStr,
                  hours,
                  text,
                  isToday,
                  hasData: hours > 0 || text !== ''
                };
              });

              const filteredWorkdays = workdayList.filter(item => {
                if (onlyShowWorkdays) return item.hasData;
                return true;
              });

              return (
                <div>
                  {/* Banner tổng hợp giờ làm */}
                  <div className="mb-4 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <div className="text-xs text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-wider">
                        {targetUser}
                      </div>
                      <div className="text-xl font-black text-indigo-700 dark:text-indigo-300 mt-1">
                        {totalMonthHours.toFixed(2)} <span className="text-sm font-medium">giờ làm tháng {month}</span>
                      </div>
                    </div>
                    
                    {isAdmin && (
                      <KgButton
                        size="sm"
                        variant="secondary"
                        icon={ArrowLeft}
                        onClick={() => setSelectedUser('ALL')}
                        className="!min-h-[36px]"
                      >
                        Quay lại danh sách
                      </KgButton>
                    )}
                  </div>

                  {/* Chế độ xem: Lịch */}
                  {mobileDetailView === 'CALENDAR' ? (
                    <div className="animate-fade-in">
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
                                <div className="bg-indigo-500 text-white py-1 px-2 rounded-md text-[10px] sm:text-xs font-bold whitespace-pre-line text-center w-full ">
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
                  ) : (
                    /* Chế độ xem: Danh sách dọc dòng thời gian */
                    <div className="space-y-4 animate-fade-in">
                      {/* Tiêu đề & Bộ lọc */}
                      <div className="flex justify-between items-center pb-2 border-b border-gray-100 dark:border-gray-800">
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-bold">
                          Đang hiển thị {filteredWorkdays.length} ngày
                        </span>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={onlyShowWorkdays}
                            onChange={(e) => setOnlyShowWorkdays(e.target.checked)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                          />
                          <span className="text-xs text-gray-600 dark:text-gray-300 font-bold">Chỉ hiện ngày đi làm</span>
                        </label>
                      </div>

                      {filteredWorkdays.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 text-sm">
                          Không có dữ liệu làm việc trong tháng.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {filteredWorkdays.map(item => {
                            const shifts = item.text.split('\n').filter(Boolean);
                            const hasMissingCheckout = item.text.includes('?');
                            
                            // Xác định màu sắc ngày
                            let dayBg = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
                            if (item.isToday) {
                              dayBg = 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20';
                            } else if (item.isWeekend) {
                              dayBg = 'bg-orange-100 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400';
                            } else if (item.hasData) {
                              dayBg = 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400';
                            }

                            return (
                              <div
                                key={item.day}
                                className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                                  item.isToday
                                    ? 'border-indigo-400 bg-indigo-50/20 dark:bg-indigo-900/10'
                                    : 'border-gray-100 bg-white/50 dark:border-gray-800 dark:bg-gray-900/40'
                                }`}
                              >
                                {/* Cột 1: Ngày tháng */}
                                <div className="flex items-center gap-3">
                                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-bold text-center flex-shrink-0 ${dayBg}`}>
                                    <span className="text-sm font-black leading-none">{item.day.toString().padStart(2, '0')}</span>
                                    <span className="text-[9px] font-bold uppercase mt-1 tracking-wider">{item.dayLabel}</span>
                                  </div>

                                  {/* Cột 2: Ca làm & Trạng thái */}
                                  <div>
                                    <div className="flex flex-wrap gap-1.5 items-center">
                                      {item.hasData ? (
                                        shifts.map((s, idx) => (
                                          <span
                                            key={idx}
                                            className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                                              s.includes('?')
                                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 animate-pulse'
                                                : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400'
                                            }`}
                                          >
                                            {s}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-xs text-gray-400 font-medium">Nghỉ</span>
                                      )}
                                    </div>
                                    
                                    {/* Cảnh báo thiếu ra ca */}
                                    {hasMissingCheckout && (
                                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-extrabold block mt-1">
                                        ⚠️ Thiếu giờ ra ca
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Cột 3: Giờ công */}
                                <div className="text-right flex-shrink-0 pl-2">
                                  {item.hasData ? (
                                    <div>
                                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                                        {item.hours > 0 ? item.hours.toFixed(2) : '?'}
                                      </span>
                                      <span className="text-[10px] text-gray-400 block font-medium">giờ</span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-300 dark:text-gray-700 font-medium">-</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}