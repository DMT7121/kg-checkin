import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { auditAllEmployeesAttendance, EmployeeAttendanceStatus, ResponsiveShift, getPreviewShiftClass } from '../utils/helpers';
import {
  Users,
  Search,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Coffee,
  X
} from 'lucide-react';
import { KgBottomSheet } from './KgDesignSystem';

interface EmployeeAttendanceMonitorProps {
  isOpen?: boolean;
  onClose?: () => void;
  isModal?: boolean;
  onRemindUser?: (user: EmployeeAttendanceStatus) => void;
}

export default function EmployeeAttendanceMonitor({
  isOpen = false,
  onClose,
  isModal = false
}: EmployeeAttendanceMonitorProps) {
  const store = useAppStore();
  const { users, logs, approvedShifts } = store;

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'IN_SHIFT' | 'NOT_IN_YET' | 'COMPLETED' | 'OFF'>('ALL');
  const [ticker, setTicker] = useState(0);

  // Auto-tick every 30s to keep elapsed minutes real-time
  useEffect(() => {
    const interval = setInterval(() => {
      setTicker((t) => t + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Map today's approved shifts by username/fullname
  const shiftsMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (!approvedShifts) return map;
    const today = new Date();
    let dayIdx = today.getDay() - 1; // 0=Mon, 6=Sun
    if (dayIdx === -1) dayIdx = 6;

    // Check if store has allSchedules or admin schedules
    if (store.allSchedules) {
      Object.entries(store.allSchedules).forEach(([username, sched]) => {
        if (sched && sched.shifts && sched.shifts[dayIdx]) {
          map[username] = sched.shifts[dayIdx];
        }
      });
    }
    return map;
  }, [approvedShifts, store.allSchedules, ticker]);

  // Compute live attendance status
  const attendanceList = useMemo(() => {
    return auditAllEmployeesAttendance(users, logs, new Date(), shiftsMap);
  }, [users, logs, shiftsMap, ticker]);

  // Counters
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
      off
    };
  }, [attendanceList]);

  // Filtered list
  const filteredList = useMemo(() => {
    return attendanceList.filter((item) => {
      // Tab filter
      if (filterTab !== 'ALL' && item.status !== filterTab) {
        return false;
      }
      // Search query
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

  const content = (
    <div className="space-y-4">
      {/* Header Stat Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Đang trong ca */}
        <button
          type="button"
          onClick={() => setFilterTab(filterTab === 'IN_SHIFT' ? 'ALL' : 'IN_SHIFT')}
          className={`p-3 rounded-2xl border text-left transition-all active:scale-95 ${
            filterTab === 'IN_SHIFT'
              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300 ring-2 ring-emerald-500/30'
              : 'bg-[var(--kg-surface)] border-[var(--kg-border)] hover:bg-emerald-500/10'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">Đang làm việc</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            {counts.inShift} <span className="text-xs font-bold text-[var(--kg-text-muted)]">người</span>
          </div>
        </button>

        {/* Chưa vào ca */}
        <button
          type="button"
          onClick={() => setFilterTab(filterTab === 'NOT_IN_YET' ? 'ALL' : 'NOT_IN_YET')}
          className={`p-3 rounded-2xl border text-left transition-all active:scale-95 ${
            filterTab === 'NOT_IN_YET'
              ? 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300 ring-2 ring-amber-500/30'
              : 'bg-[var(--kg-surface)] border-[var(--kg-border)] hover:bg-amber-500/10'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">Chưa vào ca</span>
            <AlertTriangle size={13} className="text-amber-500" />
          </div>
          <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
            {counts.notInYet} <span className="text-xs font-bold text-[var(--kg-text-muted)]">người</span>
          </div>
        </button>

        {/* Đã hoàn thành */}
        <button
          type="button"
          onClick={() => setFilterTab(filterTab === 'COMPLETED' ? 'ALL' : 'COMPLETED')}
          className={`p-3 rounded-2xl border text-left transition-all active:scale-95 ${
            filterTab === 'COMPLETED'
              ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30'
              : 'bg-[var(--kg-surface)] border-[var(--kg-border)] hover:bg-blue-500/10'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">Đã xong ca</span>
            <CheckCircle2 size={13} className="text-blue-500" />
          </div>
          <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1">
            {counts.completed} <span className="text-xs font-bold text-[var(--kg-text-muted)]">người</span>
          </div>
        </button>

        {/* Nghỉ ca / OFF */}
        <button
          type="button"
          onClick={() => setFilterTab(filterTab === 'OFF' ? 'ALL' : 'OFF')}
          className={`p-3 rounded-2xl border text-left transition-all active:scale-95 ${
            filterTab === 'OFF'
              ? 'bg-slate-500/20 border-slate-500 text-slate-700 dark:text-slate-300 ring-2 ring-slate-500/30'
              : 'bg-[var(--kg-surface)] border-[var(--kg-border)] hover:bg-slate-500/10'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">Nghỉ ca (OFF)</span>
            <Coffee size={13} className="text-slate-400" />
          </div>
          <div className="text-xl font-black text-slate-600 dark:text-slate-400 mt-1">
            {counts.off} <span className="text-xs font-bold text-[var(--kg-text-muted)]">người</span>
          </div>
        </button>
      </div>

      {/* Search & Filter Tabs Bar */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)]" />
          <input
            type="text"
            placeholder="Tìm theo tên nhân viên, vị trí..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs text-[var(--kg-text)] placeholder-[var(--kg-text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] p-1"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Tab selector pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
          <button
            type="button"
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all ${
              filterTab === 'ALL'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
            }`}
          >
            Tất cả ({counts.total})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('IN_SHIFT')}
            className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all ${
              filterTab === 'IN_SHIFT'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
            }`}
          >
            🟢 Đang làm ({counts.inShift})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('NOT_IN_YET')}
            className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all ${
              filterTab === 'NOT_IN_YET'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
            }`}
          >
            🟡 Chưa vào ({counts.notInYet})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('COMPLETED')}
            className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all ${
              filterTab === 'COMPLETED'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
            }`}
          >
            🔵 Đã xong ({counts.completed})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('OFF')}
            className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all ${
              filterTab === 'OFF'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
            }`}
          >
            ⚪ Nghỉ ca ({counts.off})
          </button>
        </div>
      </div>

      {/* Staff List */}
      <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
        {filteredList.length === 0 ? (
          <div className="p-8 text-center bg-[var(--kg-surface-soft)] rounded-2xl border border-[var(--kg-border)] text-[var(--kg-text-muted)] text-xs">
            <Users size={32} className="mx-auto mb-2 opacity-40" />
            <p className="font-bold">Không tìm thấy nhân viên nào phù hợp</p>
            <p className="text-[11px] mt-0.5">Thử chọn bộ lọc khác hoặc xoá ô tìm kiếm</p>
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
                    ? 'bg-emerald-500/5 dark:bg-emerald-950/20 border-emerald-500/30'
                    : isUserNotInYet
                    ? 'bg-amber-500/5 dark:bg-amber-950/20 border-amber-500/30'
                    : isUserCompleted
                    ? 'bg-blue-500/5 dark:bg-blue-950/20 border-blue-500/20'
                    : 'bg-[var(--kg-surface)] border-[var(--kg-border)] opacity-85'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: Avatar & Info */}
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs flex-shrink-0 border ${
                        isUserInShift
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : isUserNotInYet
                          ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          : isUserCompleted
                          ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30'
                          : 'bg-slate-500/15 text-slate-500 border-slate-500/20'
                      }`}
                    >
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt={item.fullname} className="w-full h-full object-cover rounded-xl" />
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

                      {/* Timestamps line */}
                      <div className="text-[11px] text-[var(--kg-text-muted)] mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                        {isUserInShift && (
                          <span className="font-semibold flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Clock size={11} /> Vào ca: <b>{item.inTime}</b>
                            {item.elapsedMins !== undefined && (
                              <span className="text-[10px] text-[var(--kg-text-muted)]">
                                ({Math.floor(item.elapsedMins / 60)}h{item.elapsedMins % 60}p)
                              </span>
                            )}
                          </span>
                        )}

                        {isUserCompleted && (
                          <span className="font-semibold flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <CheckCircle2 size={11} /> Ra ca lúc: <b>{item.outTime}</b>
                            <span className="text-[10px] text-[var(--kg-text-muted)]">
                              (Tổng {(item.totalWorkedMinutes / 60).toFixed(1)}h)
                            </span>
                          </span>
                        )}

                        {isUserNotInYet && item.scheduledShift && item.scheduledShift !== 'OFF' && (
                          <span className="font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                            <Clock size={11} /> Ca quy định: <span className={`inline-flex items-center px-1.5 py-0.2 rounded-md text-[10px] font-black shadow-2xs ${getPreviewShiftClass(item.scheduledShift)}`}><ResponsiveShift shift={item.scheduledShift} /></span>
                          </span>
                        )}

                        {isUserOff && (
                          <span className="font-medium text-slate-500">
                            Nghỉ ca theo lịch
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Status Badge */}
                  <div className="flex-shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black border ${
                        isUserInShift
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : isUserNotInYet
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          : isUserCompleted
                          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                          : 'bg-slate-500/15 text-slate-500 border-slate-500/20'
                      }`}
                    >
                      {isUserInShift && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
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

                {/* Smart Suggestion Bubble */}
                <div className="mt-2.5 pt-2 border-t border-[var(--kg-border)]/60 flex items-start gap-1.5 text-[11px] font-medium leading-tight">
                  <Sparkles size={12} className="text-blue-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[var(--kg-text-muted)]">
                    {item.warning ? (
                      <span className="text-rose-600 dark:text-rose-400 font-bold">{item.warning} — </span>
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
  );

  if (isModal) {
    return (
      <KgBottomSheet
        isOpen={isOpen}
        onClose={onClose || (() => {})}
        title="👥 Theo Dõi Ca Làm Nhân Viên Hôm Nay"
      >
        <div className="py-2">{content}</div>
      </KgBottomSheet>
    );
  }

  return (
    <div className="bg-[var(--kg-surface)] p-4 sm:p-5 rounded-2xl md:rounded-3xl border border-[var(--kg-border)] text-[var(--kg-text)] shadow-xs max-w-md mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <Users size={16} />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--kg-text)]">
              Ca Làm Việc Hôm Nay
            </h3>
            <p className="text-[10px] text-[var(--kg-text-muted)] font-medium">
              Đang làm: {counts.inShift} • Chưa vào: {counts.notInYet}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setTicker((t) => t + 1)}
          className="p-1.5 rounded-lg bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-surface)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition active:scale-95"
          title="Làm mới dữ liệu"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {content}
    </div>
  );
}
