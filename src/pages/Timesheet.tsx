import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { generateMonthDates, SHORT_DAY_NAMES } from '../utils/helpers';
import CalendarGrid from '../components/CalendarGrid';
import { callApi } from '../services/api';
import { CalendarClock, Clock, ListOrdered, Calendar, FileClock, Search, List, Eye, ArrowLeft, RefreshCw, Zap } from 'lucide-react';
import Swal from 'sweetalert2';
import { KgModuleHero, KgInput, KgCard, KgButton } from '../components/KgDesignSystem';
import { saveModuleCache } from '../utils/refreshData';
import { calculateEmployeeMonthTimesheet, formatDayDateKey, UserMonthSummary } from '../utils/timesheetCalculator';

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
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadTimesheet = async () => {
    const hasCached = timesheetData && timesheetData.year;
    if (!hasCached) {
      setIsRefreshing(true);
    }
    try {
      const res = await callApi('GET_TIMESHEET', {
        username: currentUser?.username,
        role: currentUser?.role
      }, { background: true });

      setIsRefreshing(false);
      if (res?.ok && res.data) {
        store.setTimesheetData(res.data);
        saveModuleCache('timesheet', res.data);
      } else if (!hasCached) {
        Swal.fire('Lỗi', res?.message || 'Không thể tải bảng tổng hợp công', 'error');
      }
    } catch {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadTimesheet();
  }, []);

  // Pre-calculate all employee monthly summaries with overnight overtime awareness (00:15 threshold)
  const employeeSummaries = useMemo<Record<string, UserMonthSummary>>(() => {
    if (!timesheetData || !timesheetData.timesheet || !timesheetData.year) return {};
    const map: Record<string, UserMonthSummary> = {};
    for (const name of Object.keys(timesheetData.timesheet)) {
      map[name] = calculateEmployeeMonthTimesheet(
        name,
        timesheetData.timesheet[name] || {},
        timesheetData.daysInMonth,
        timesheetData.month,
        timesheetData.year
      );
    }
    return map;
  }, [timesheetData]);

  if (!timesheetData || !timesheetData.year) {
    return (
      <div className="p-4 space-y-5 animate-slide-up pb-10">
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-6 rounded-2xl relative overflow-hidden shadow-xs">
          <div className="absolute right-0 top-0 opacity-5 text-[var(--kg-primary)] transform translate-x-4 -translate-y-4">
            <CalendarClock size={120} />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[var(--kg-text)] mb-1 tracking-tight relative z-10">Tổng Hợp Công</h2>
          {isRefreshing ? (
            <div className="flex items-center gap-2 py-4 text-xs font-bold text-[var(--kg-text-muted)]">
              <RefreshCw size={16} className="animate-spin text-[var(--kg-primary)]" />
              <span>Đang tải nhanh bảng công...</span>
            </div>
          ) : (
            <p className="text-[var(--kg-text-muted)] font-bold relative z-10 text-xs sm:text-sm">Chưa có dữ liệu bảng công cho tháng này.</p>
          )}
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

  return (
    <div className="p-4 space-y-5 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="timesheet"
        title="Tổng Hợp Công"
        description={`Bảng công và thời gian làm việc chi tiết tháng ${month}/${year}`}
        eyebrow="Báo cáo"
        tipTitle="Quy chuẩn & Ký hiệu Bảng công"
        tips={[
          "Giờ làm: Tổng số giờ làm việc thực tế được ghi nhận qua chấm công GPS & xác thực ảnh.",
          "Mốc thời gian: Hiển thị chi tiết giờ Vào ca và giờ Ra ca từng ngày của nhân viên.",
          "Nếu có sai sót công hoặc quên chấm, vui lòng tạo 'Đơn Bổ Sung Công' trong vòng 48h để Quản lý duyệt.",
          "Dữ liệu công được chốt vào ngày cuối cùng của tháng để tính bảng lương."
        ]}
      />

      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs">
        {/* Thanh công cụ tìm kiếm và lọc */}
        <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-[var(--kg-surface-soft)] p-1 rounded-xl border border-[var(--kg-border)]/60">
              <button
                type="button"
                onClick={() => setViewMode('HOURS')}
                className={`flex items-center px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-black transition-all ${viewMode === 'HOURS' ? 'bg-[var(--kg-primary)] text-white shadow-xs' : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'}`}
              >
                <Clock size={15} className="mr-1.5" /> Giờ làm
              </button>
              <button
                type="button"
                onClick={() => setViewMode('TIMESTAMPS')}
                className={`flex items-center px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-black transition-all ${viewMode === 'TIMESTAMPS' ? 'bg-[var(--kg-primary)] text-white shadow-xs' : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'}`}
              >
                <ListOrdered size={15} className="mr-1.5" /> Mốc thời gian
              </button>
            </div>

            {/* Bộ chuyển đổi chế độ xem Lịch / Danh sách cho cá nhân */}
            {(selectedUser !== 'ALL' || !isAdmin) && (
              <div className="flex bg-[var(--kg-surface-soft)] p-1 rounded-xl border border-[var(--kg-border)]/60">
                <button
                  type="button"
                  onClick={() => setMobileDetailView('CALENDAR')}
                  className={`flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-black transition-all ${mobileDetailView === 'CALENDAR' ? 'bg-[var(--kg-primary)] text-white shadow-xs' : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'}`}
                >
                  <Calendar size={15} className="mr-1.5" /> Lịch
                </button>
                <button
                  type="button"
                  onClick={() => setMobileDetailView('LIST')}
                  className={`flex items-center px-3 py-1.5 rounded-lg text-xs sm:text-sm font-black transition-all ${mobileDetailView === 'LIST' ? 'bg-[var(--kg-primary)] text-white shadow-xs' : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'}`}
                >
                  <List size={15} className="mr-1.5" /> Danh sách
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
                className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-4 py-2 focus:ring-2 focus:ring-[var(--kg-primary)] outline-none font-bold text-xs sm:text-sm min-h-[44px]"
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
            <div className="hidden md:block overflow-x-auto w-full rounded-2xl border border-[var(--kg-border)] custom-scrollbar">
              <table className="w-full text-xs sm:text-sm text-left">
                <thead className="bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] uppercase text-[10px] sm:text-xs">
                  <tr>
                    <th className="px-4 py-3 font-black sticky left-0 bg-[var(--kg-surface-soft)] z-10 border-b border-r border-[var(--kg-border)] min-w-[150px]">
                      Nhân viên
                    </th>
                    <th className="px-4 py-3 font-black sticky left-[150px] bg-[var(--kg-surface)] text-[var(--kg-primary)] dark:text-cyan-300 z-10 border-b border-r border-[var(--kg-border)] min-w-[100px] text-center font-mono shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                      Tổng giờ
                    </th>
                    {days.map(d => {
                      const dateObj = new Date(year, month - 1, d);
                      const dayOfWeek = dateObj.getDay();
                      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                      const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                      return (
                        <th key={d} className={`px-2 py-2 font-black text-center border-b border-r border-[var(--kg-border)] min-w-[70px] ${isWeekend ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : ''}`}>
                          <div className="flex flex-col items-center font-mono">
                            <span className="text-[12px] font-bold">{`${d.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}`}</span>
                            <span className="text-[9px] font-semibold opacity-70 mt-0.5 uppercase tracking-wider">{SHORT_DAY_NAMES[dayIndex]}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayNames.length === 0 ? (
                    <tr>
                      <td colSpan={days.length + 2} className="text-center py-8 text-[var(--kg-text-muted)] font-bold">
                        Không tìm thấy nhân viên phù hợp
                      </td>
                    </tr>
                  ) : (
                    displayNames.map(name => {
                      const summary = employeeSummaries[name];
                      const totalMonthHours = summary?.totalMonthHours || 0;
                      
                      return (
                        <tr key={name} className="border-b border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]/50 transition-colors">
                          <td className="px-4 py-3 font-bold text-[var(--kg-text)] sticky left-0 bg-[var(--kg-surface)] border-r border-[var(--kg-border)] z-10">
                            {name}
                          </td>
                          <td className="px-4 py-3 font-black text-center font-mono text-[var(--kg-primary)] dark:text-cyan-300 sticky left-[150px] bg-[var(--kg-surface-soft)] border-r border-[var(--kg-border)] z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                            {totalMonthHours.toFixed(2)}h
                            {summary?.totalOvertimeHours > 0 && (
                              <span className="block text-[10px] text-amber-500 font-bold">
                                +{summary.totalOvertimeHours.toFixed(1)}h TC
                              </span>
                            )}
                          </td>
                          {days.map(d => {
                            const dayRes = summary?.days[d];
                            const hours = dayRes?.totalHours || 0;
                            const text = dayRes?.timeText || '';
                            const hasOvertime = dayRes?.hasOvertime || false;

                            return (
                              <td key={d} className="px-2 py-2 border-r border-[var(--kg-border)] text-center relative group">
                                {(hours > 0 || text !== '') ? (
                                  <div className={`py-1 px-1.5 rounded-lg text-xs font-mono font-bold mx-auto w-fit whitespace-pre-line border ${
                                    hasOvertime
                                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                      : 'bg-[var(--kg-primary)]/10 text-[var(--kg-primary)] dark:bg-[var(--kg-primary)]/30 dark:text-cyan-200 border-[var(--kg-primary)]/20'
                                  }`}>
                                    {viewMode === 'HOURS' ? (hours > 0 ? hours.toFixed(2) : '?') : text}
                                  </div>
                                ) : (
                                  <div className="text-[var(--kg-text-muted)] opacity-40 text-xs font-mono">-</div>
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
                  const summary = employeeSummaries[name];
                  const totalMonthHours = summary?.totalMonthHours || 0;
                  const workDaysCount = summary?.workedDaysCount || 0;

                  // Lấy chữ cái đầu làm Avatar
                  const nameParts = name.trim().split(' ');
                  const initials = nameParts.length > 1
                    ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
                    : nameParts[0].substring(0, 2).toUpperCase();

                  return (
                    <KgCard key={name} className="flex items-center justify-between p-4 border border-[var(--kg-border)] bg-[var(--kg-surface)]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--kg-primary)] text-white flex items-center justify-center text-xs font-black shadow-xs flex-shrink-0">
                          {initials}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-[var(--kg-text)] text-sm leading-snug">{name}</h4>
                          <span className="text-[11px] text-[var(--kg-text-muted)] block font-medium mt-0.5">
                            {workDaysCount} ngày công • Tháng {month}/{year}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] text-[var(--kg-text-muted)] font-bold block uppercase tracking-wider">Tổng giờ</span>
                          <span className="text-sm font-mono font-black text-[var(--kg-primary)] dark:text-cyan-300">
                            {totalMonthHours.toFixed(2)}h
                          </span>
                          {summary?.totalOvertimeHours > 0 && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 block font-bold">
                              +{summary.totalOvertimeHours.toFixed(1)}h TC
                            </span>
                          )}
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
              const summary = employeeSummaries[targetUser];
              const totalMonthHours = summary?.totalMonthHours || 0;
              const totalRegularHours = summary?.totalRegularHours || 0;
              const totalOvertimeHours = summary?.totalOvertimeHours || 0;

              // Danh sách công chuẩn bị cho List View
              const workdayList = days.map(d => {
                const dateObj = new Date(year, month - 1, d);
                const dayOfWeek = dateObj.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                const dayRes = summary?.days[d];
                const isToday = new Date().toDateString() === dateObj.toDateString();
                
                return {
                  day: d,
                  dateObj,
                  isWeekend,
                  dayLabel: SHORT_DAY_NAMES[dayIndex],
                  dateStr: dayRes?.dateStr || formatDayDateKey(d, month, year),
                  hours: dayRes?.totalHours || 0,
                  regularHours: dayRes?.regularHours || 0,
                  overtimeHours: dayRes?.overtimeHours || 0,
                  sessions: dayRes?.sessions || [],
                  text: dayRes?.timeText || '',
                  hasOvertime: dayRes?.hasOvertime || false,
                  hasMissingCheckout: dayRes?.hasMissingCheckout || false,
                  isToday,
                  hasData: (dayRes?.totalHours || 0) > 0 || (dayRes?.timeText || '') !== ''
                };
              });

              const filteredWorkdays = workdayList.filter(item => {
                if (onlyShowWorkdays) return item.hasData;
                return true;
              });

              return (
                <div>
                  {/* Banner tổng hợp giờ làm */}
                  <div className="mb-4 bg-[var(--kg-surface-soft)] p-4 sm:p-5 rounded-2xl border border-[var(--kg-border)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-xs">
                    <div>
                      <div className="text-xs text-[var(--kg-accent)] font-black uppercase tracking-wider flex items-center gap-1.5">
                        <Clock size={14} />
                        {targetUser}
                      </div>
                      <div className="text-xl sm:text-2xl font-black text-[var(--kg-text)] mt-1 font-mono flex flex-wrap items-baseline gap-2">
                        <span>{totalMonthHours.toFixed(2)}</span>
                        <span className="text-xs sm:text-sm font-bold font-sans text-[var(--kg-text-muted)]">giờ làm tháng {month}/{year}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-[var(--kg-text-muted)] font-medium">
                        <span>Theo ca: <strong className="text-[var(--kg-text)] font-mono">{totalRegularHours.toFixed(2)}h</strong></span>
                        {totalOvertimeHours > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                            <Zap size={13} className="text-amber-500" />
                            Tăng ca: <strong className="font-mono">+{totalOvertimeHours.toFixed(2)}h</strong>
                          </span>
                        )}
                        <span>Số ngày làm: <strong className="text-[var(--kg-text)] font-mono">{summary?.workedDaysCount || 0} ngày</strong></span>
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
                          const dayRes = summary?.days[d];
                          const hours = dayRes?.totalHours || 0;
                          const text = dayRes?.timeText || '';
                          const hasData = hours > 0 || text !== '';
                          
                          return (
                            <div className="w-full h-full flex flex-col justify-center items-center rounded-lg p-1">
                              {hasData ? (
                                <div className={`py-1 px-2 rounded-md text-[10px] sm:text-xs font-bold whitespace-pre-line text-center w-full border ${
                                  dayRes?.hasOvertime
                                    ? 'bg-amber-500 text-white border-amber-600'
                                    : 'bg-indigo-500 text-white border-indigo-600'
                                }`}>
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
                            // Xác định màu sắc ngày
                            let dayBg = 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)]';
                            if (item.isToday) {
                              dayBg = 'bg-[var(--kg-primary)] text-white shadow-xs';
                            } else if (item.isWeekend) {
                              dayBg = 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20';
                            } else if (item.hasData) {
                              dayBg = 'bg-[var(--kg-surface-soft)] text-[var(--kg-primary)] dark:text-cyan-300 border border-[var(--kg-border)]';
                            }

                            return (
                              <div
                                key={item.day}
                                className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                                  item.isToday
                                    ? 'border-[var(--kg-accent)]/50 bg-[var(--kg-accent-soft)]/20'
                                    : 'border-[var(--kg-border)] bg-[var(--kg-surface)]'
                                }`}
                              >
                                {/* Cột 1: Ngày tháng */}
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black text-center flex-shrink-0 ${dayBg}`}>
                                    <span className="text-sm font-mono leading-none">{item.day.toString().padStart(2, '0')}</span>
                                    <span className="text-[9px] uppercase mt-1 tracking-wider">{item.dayLabel}</span>
                                  </div>

                                  {/* Cột 2: Các lượt Vào ca - Ra ca trong ngày */}
                                  <div className="min-w-0 flex-1">
                                    {item.hasData ? (
                                      <div className="flex flex-col gap-1.5">
                                        {item.sessions.map((session, sIdx) => (
                                          <div key={sIdx} className="flex flex-wrap items-center gap-1.5 text-xs">
                                            <span className="px-2.5 py-1 rounded-xl font-mono font-bold bg-[var(--kg-surface-soft)] text-[var(--kg-text)] border border-[var(--kg-border)] flex items-center gap-1">
                                              <span className="text-[10px] text-[var(--kg-text-muted)] uppercase font-semibold">Vào:</span>
                                              <span>{session.inTime}</span>
                                              <span className="text-[var(--kg-text-muted)] mx-0.5">→</span>
                                              <span className="text-[10px] text-[var(--kg-text-muted)] uppercase font-semibold">Ra:</span>
                                              <span className={session.isMissingOut ? 'text-amber-500 font-black animate-pulse' : ''}>{session.outTime}</span>
                                            </span>
                                            {session.overtimeHours > 0 && (
                                              <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-black bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-0.5">
                                                <Zap size={11} className="text-amber-500" />
                                                +{session.overtimeHours.toFixed(1)}h Tăng ca
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-[var(--kg-text-muted)] font-medium">Nghỉ</span>
                                    )}
                                    
                                    {/* Cảnh báo thiếu ra ca */}
                                    {item.hasMissingCheckout && (
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
                                      <span className="text-sm font-mono font-black text-[var(--kg-primary)] dark:text-cyan-300">
                                        {item.hours > 0 ? item.hours.toFixed(2) : '?'}
                                      </span>
                                      <span className="text-[10px] text-[var(--kg-text-muted)] block font-medium">giờ</span>
                                    </div>
                                  ) : (
                                    <span className="text-[var(--kg-text-muted)] opacity-30 font-medium">-</span>
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