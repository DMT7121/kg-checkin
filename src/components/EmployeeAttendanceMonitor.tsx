import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { refreshAppData } from '../utils/refreshData';
import { kgToast } from '../store/useFeedbackStore';
import {
  auditAllEmployeesAttendance,
  ResponsiveShift,
  getPreviewShiftClass,
} from '../utils/helpers';
import {
  Users,
  Search,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Coffee,
  X,
} from 'lucide-react';
import { KgBottomSheet } from './KgDesignSystem';

interface EmployeeAttendanceMonitorProps {
  isOpen?: boolean;
  onClose?: () => void;
  isModal?: boolean;
}

export default function EmployeeAttendanceMonitor({
  isOpen = false,
  onClose,
}: EmployeeAttendanceMonitorProps) {
  const users = useAppStore((s) => s.users);
  const logs = useAppStore((s) => s.logs);
  const setLogs = useAppStore((s) => s.setLogs);
  const approvedShifts = useAppStore((s) => s.approvedShifts);
  const currentWeekApprovedShifts = useAppStore((s) => s.currentWeekApprovedShifts);
  const currentUser = useAppStore((s) => s.currentUser);
  const adminSchedules = useAppStore((s) => s.adminSchedules);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'IN_SHIFT' | 'NOT_IN_YET' | 'COMPLETED' | 'OFF'>('ALL');
  const [nowDate, setNowDate] = useState(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-tick every 30s to keep elapsed minutes real-time only when sheet is open & visible
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      setNowDate(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Real backend refresh: refreshes store via GET_DATA + admin GET_CHECKIN_LOGS when applicable
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshAppData(true);
      if (currentUser?.role === 'admin') {
        const res = await callApi(
          'GET_CHECKIN_LOGS',
          {
            username: currentUser.username,
            fullname: currentUser.fullname,
            role: currentUser.role,
            targetUsername: 'ALL',
            targetFullname: 'ALL',
            forceRefresh: true,
          },
          { background: true, cacheTtlMs: 0 },
        );
        if (res?.ok && Array.isArray(res.data?.logs)) {
          setLogs(res.data.logs);
        }
      }
      setNowDate(new Date());
    } catch {
      kgToast('Không thể làm mới dữ liệu chấm công lúc này.', 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, currentUser, setLogs]);

  // Map today's approved shifts by username/fullname
  const shiftsMap = useMemo(() => {
    const map: Record<string, string> = {};
    let dayIdx = nowDate.getDay() - 1; // 0=Mon, 6=Sun
    if (dayIdx === -1) dayIdx = 6;

    if (adminSchedules?.length) {
      adminSchedules.forEach((sched) => {
        const shiftVal = sched?.shifts?.[dayIdx];
        if (shiftVal) {
          if (sched.username) map[sched.username] = shiftVal;
          if (sched.fullname) map[sched.fullname] = shiftVal;
        }
      });
    }

    const ownShifts = currentWeekApprovedShifts ?? approvedShifts;
    const ownTodayShift = ownShifts?.[dayIdx];
    if (currentUser && ownTodayShift) {
      if (currentUser.username && !map[currentUser.username]) map[currentUser.username] = ownTodayShift;
      if (currentUser.fullname && !map[currentUser.fullname]) map[currentUser.fullname] = ownTodayShift;
    }

    return map;
  }, [approvedShifts, currentWeekApprovedShifts, currentUser, adminSchedules, nowDate]);

  const attendanceList = useMemo(() => {
    return auditAllEmployeesAttendance(users, logs, nowDate, shiftsMap);
  }, [users, logs, shiftsMap, nowDate]);

  const counts = useMemo(() => {
    const inShift = attendanceList.filter((a) => a.status === 'IN_SHIFT').length;
    const notInYet = attendanceList.filter((a) => a.status === 'NOT_IN_YET').length;
    const completed = attendanceList.filter((a) => a.status === 'COMPLETED').length;
    const off = attendanceList.filter((a) => a.status === 'OFF').length;
    return {
      total: attendanceList.length,
      inShift,
      notInYet,
      completed,
      off,
    };
  }, [attendanceList]);

  const filteredList = useMemo(() => {
    return attendanceList.filter((item) => {
      if (filterTab !== 'ALL' && item.status !== filterTab) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.fullname.toLowerCase().includes(q);
        const matchesUser = item.username.toLowerCase().includes(q);
        const matchesPos = (item.position || '').toLowerCase().includes(q);
        return matchesName || matchesUser || matchesPos;
      }
      return true;
    });
  }, [attendanceList, filterTab, searchQuery]);

  return (
    <KgBottomSheet
      isOpen={isOpen}
      onClose={onClose || (() => {})}
      title="Theo dõi ca làm nhân viên hôm nay"
    >
      <div className="space-y-4 py-2">
        {/* 4 Interactive KPI Filter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            aria-pressed={filterTab === 'IN_SHIFT'}
            onClick={() => setFilterTab(filterTab === 'IN_SHIFT' ? 'ALL' : 'IN_SHIFT')}
            className={`min-h-[44px] p-3 rounded-2xl border text-left transition-all active:scale-95 touch-manipulation ${
              filterTab === 'IN_SHIFT'
                ? 'bg-[var(--kg-success-soft)] border-[var(--kg-success)] text-[var(--kg-success)] ring-2 ring-[var(--kg-success)]/25'
                : 'bg-[var(--kg-surface)] border-[var(--kg-border)] hover:border-[var(--kg-border-strong)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Đang làm việc
              </span>
              <span className="w-2 h-2 rounded-full bg-[var(--kg-success)] animate-pulse" />
            </div>
            <div className="text-xl font-black font-mono tabular-nums text-[var(--kg-success)] mt-1">
              {counts.inShift}{' '}
              <span className="text-xs font-sans font-bold text-[var(--kg-text-muted)]">người</span>
            </div>
          </button>

          <button
            type="button"
            aria-pressed={filterTab === 'NOT_IN_YET'}
            onClick={() => setFilterTab(filterTab === 'NOT_IN_YET' ? 'ALL' : 'NOT_IN_YET')}
            className={`min-h-[44px] p-3 rounded-2xl border text-left transition-all active:scale-95 touch-manipulation ${
              filterTab === 'NOT_IN_YET'
                ? 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)] text-[var(--kg-warning)] ring-2 ring-[var(--kg-warning)]/25'
                : 'bg-[var(--kg-surface)] border-[var(--kg-border)] hover:border-[var(--kg-border-strong)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Chưa vào ca
              </span>
              <AlertTriangle size={13} className="text-[var(--kg-warning)]" />
            </div>
            <div className="text-xl font-black font-mono tabular-nums text-[var(--kg-warning)] mt-1">
              {counts.notInYet}{' '}
              <span className="text-xs font-sans font-bold text-[var(--kg-text-muted)]">người</span>
            </div>
          </button>

          <button
            type="button"
            aria-pressed={filterTab === 'COMPLETED'}
            onClick={() => setFilterTab(filterTab === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
            className={`min-h-[44px] p-3 rounded-2xl border text-left transition-all active:scale-95 touch-manipulation ${
              filterTab === 'COMPLETED'
                ? 'bg-[var(--kg-info-soft)] border-[var(--kg-info)] text-[var(--kg-info)] ring-2 ring-[var(--kg-info)]/25'
                : 'bg-[var(--kg-surface)] border-[var(--kg-border)] hover:border-[var(--kg-border-strong)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Đã xong ca
              </span>
              <CheckCircle2 size={13} className="text-[var(--kg-info)]" />
            </div>
            <div className="text-xl font-black font-mono tabular-nums text-[var(--kg-info)] mt-1">
              {counts.completed}{' '}
              <span className="text-xs font-sans font-bold text-[var(--kg-text-muted)]">người</span>
            </div>
          </button>

          <button
            type="button"
            aria-pressed={filterTab === 'OFF'}
            onClick={() => setFilterTab(filterTab === 'OFF' ? 'ALL' : 'OFF')}
            className={`min-h-[44px] p-3 rounded-2xl border text-left transition-all active:scale-95 touch-manipulation ${
              filterTab === 'OFF'
                ? 'bg-[var(--kg-surface-soft)] border-[var(--kg-text-muted)] text-[var(--kg-text)] ring-2 ring-[var(--kg-border-strong)]'
                : 'bg-[var(--kg-surface)] border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Nghỉ ca (OFF)
              </span>
              <Coffee size={13} className="text-[var(--kg-text-soft)]" />
            </div>
            <div className="text-xl font-black font-mono tabular-nums text-[var(--kg-text-muted)] mt-1">
              {counts.off}{' '}
              <span className="text-xs font-sans font-bold text-[var(--kg-text-muted)]">người</span>
            </div>
          </button>
        </div>

        {/* Search + Single "Tất cả" Reset Pill + Real Backend Refresh */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)]" />
            <input
              type="text"
              aria-label="Tìm theo tên nhân viên hoặc vị trí"
              placeholder="Tìm theo tên nhân viên, vị trí..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[44px] sm:min-h-[40px] pl-9 pr-11 py-2.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs text-[var(--kg-text)] placeholder-[var(--kg-text-muted)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] touch-manipulation"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFilterTab('ALL')}
            className={`min-h-[44px] sm:min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-colors touch-manipulation ${
              filterTab === 'ALL'
                ? 'bg-[var(--kg-primary)] text-white border-[var(--kg-primary)] shadow-xs'
                : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
            }`}
          >
            Tất cả (<span className="font-mono tabular-nums">{counts.total}</span>)
          </button>

          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            aria-label="Làm mới dữ liệu chấm công từ máy chủ"
            title="Làm mới dữ liệu từ máy chủ"
            className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center transition active:scale-95 touch-manipulation"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-[var(--kg-primary)]' : ''} />
          </button>
        </div>

        {/* Staff List */}
        <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
          {filteredList.length === 0 ? (
            <div className="p-8 text-center bg-[var(--kg-surface-soft)] rounded-2xl border border-[var(--kg-border)] text-[var(--kg-text-muted)] text-xs">
              <Users size={32} className="mx-auto mb-2 opacity-40" />
              <p className="font-bold">Không tìm thấy nhân viên nào phù hợp</p>
              <p className="text-[11px] mt-0.5">Thử chọn &ldquo;Tất cả&rdquo; hoặc xoá ô tìm kiếm</p>
            </div>
          ) : (
            filteredList.map((item) => {
              const isUserInShift = item.status === 'IN_SHIFT';
              const isUserNotInYet = item.status === 'NOT_IN_YET';
              const isUserCompleted = item.status === 'COMPLETED';
              const isUserOff = item.status === 'OFF';

              return (
                <div
                  key={item.username}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isUserInShift
                      ? 'bg-[var(--kg-success-soft)]/50 border-[var(--kg-success)]/30'
                      : isUserNotInYet
                        ? 'bg-[var(--kg-warning-soft)]/50 border-[var(--kg-warning)]/30'
                        : isUserCompleted
                          ? 'bg-[var(--kg-info-soft)]/50 border-[var(--kg-info)]/25'
                          : 'bg-[var(--kg-surface)] border-[var(--kg-border)] opacity-85'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 border ${
                          isUserInShift
                            ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/30'
                            : isUserNotInYet
                              ? 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-[var(--kg-warning)]/30'
                              : isUserCompleted
                                ? 'bg-[var(--kg-info-soft)] text-[var(--kg-info)] border-[var(--kg-info)]/30'
                                : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)]'
                        }`}
                      >
                        {item.avatarUrl ? (
                          <img
                            src={item.avatarUrl}
                            alt={item.fullname}
                            className="w-full h-full object-cover rounded-xl"
                          />
                        ) : (
                          item.fullname.slice(0, 2).toUpperCase()
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-black text-[var(--kg-text)] truncate">{item.fullname}</h4>
                          {item.position && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)]">
                              {item.position}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-[var(--kg-text-muted)] mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                          {isUserInShift && (
                            <span className="font-semibold flex items-center gap-1 text-[var(--kg-success)]">
                              <Clock size={11} /> Vào ca:{' '}
                              <b className="font-mono tabular-nums">{item.inTime}</b>
                              {item.elapsedMins !== undefined && (
                                <span className="text-[10px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                                  ({Math.floor(item.elapsedMins / 60)}h
                                  {String(item.elapsedMins % 60).padStart(2, '0')}p)
                                </span>
                              )}
                            </span>
                          )}

                          {isUserCompleted && (
                            <span className="font-semibold flex items-center gap-1 text-[var(--kg-info)]">
                              <CheckCircle2 size={11} /> Ra ca lúc:{' '}
                              <b className="font-mono tabular-nums">{item.outTime}</b>
                              <span className="text-[10px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                                (Tổng {(item.totalWorkedMinutes / 60).toFixed(1)}h)
                              </span>
                            </span>
                          )}

                          {isUserNotInYet && item.scheduledShift && item.scheduledShift !== 'OFF' && (
                            <span className="font-semibold flex items-center gap-1.5 text-[var(--kg-warning)]">
                              <Clock size={11} /> Ca quy định:{' '}
                              <span
                                className={`inline-flex items-center px-1.5 py-0.2 rounded-md text-[10px] font-black shadow-2xs ${getPreviewShiftClass(item.scheduledShift)}`}
                              >
                                <ResponsiveShift shift={item.scheduledShift} />
                              </span>
                            </span>
                          )}

                          {isUserOff && (
                            <span className="font-medium text-[var(--kg-text-muted)]">Nghỉ ca theo lịch</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black border ${
                          isUserInShift
                            ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/30'
                            : isUserNotInYet
                              ? 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-[var(--kg-warning)]/30'
                              : isUserCompleted
                                ? 'bg-[var(--kg-info-soft)] text-[var(--kg-info)] border-[var(--kg-info)]/30'
                                : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)]'
                        }`}
                      >
                        {isUserInShift && <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-success)] animate-pulse" />}
                        <span>
                          {isUserInShift
                            ? `Đang trong Ca ${item.shiftIndex}`
                            : isUserNotInYet
                              ? 'Chưa vào ca'
                              : isUserCompleted
                                ? `Đã xong Ca ${item.shiftIndex}`
                                : 'Nghỉ ca (OFF)'}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-[var(--kg-border)]/60 flex items-start gap-1.5 text-[11px] font-medium leading-tight">
                    <Sparkles size={12} className="text-[var(--kg-info)] mt-0.5 flex-shrink-0" />
                    <span className="text-[var(--kg-text-muted)]">
                      {item.warning ? (
                        <span className="text-[var(--kg-danger)] font-bold">{item.warning} — </span>
                      ) : null}
                      {item.smartSuggestion}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </KgBottomSheet>
  );
}
