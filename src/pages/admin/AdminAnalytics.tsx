import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { isAdminUser } from '../../utils/permissions';
import { callApi } from '../../services/api';
import { BarChart3, Users, Clock, CheckCircle2, AlertTriangle, Trophy, GraduationCap, MessageSquare, RefreshCw, Coins, Crown, Medal, Frown, Meh, Smile, Sun, Download, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { KgModuleHero } from '../../components/KgDesignSystem';


interface AnalyticsData {
  checkinStats: { total: number; valid: number; invalid: number; late: number };
  dailyCheckins: { date: string; checkins: number; late: number }[];
  topLateEmployees: { name: string; count: number }[];
  checklistRate: number;
  handoverRate: number;
  moodDistribution: Record<string, number>;
  kingCoinsTop5: { name: string; points: number }[];
  trainingCompletion: { total: number; completed: number };
  feedbackStats: { total: number; pending: number; resolved: number };
}

export default function AdminAnalytics() {
  const currentUser = useAppStore((s) => s.currentUser);
  if (!isAdminUser(currentUser)) return null;
  return <AdminAnalyticsContent />;
}

type RangePreset = '7d' | '14d' | '30d' | 'all';

function parseDdMmYyyy(raw: string): number {
  const parts = String(raw || '').trim().split('/');
  if (parts.length !== 3) return 0;
  const d = Number(parts[0]);
  const m = Number(parts[1]);
  const y = Number(parts[2]);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return 0;
  return new Date(y, m - 1, d).getTime();
}

function escapeCsvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function AdminAnalyticsContent() {
  const currentUser = useAppStore((s) => s.currentUser);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [rangePreset, setRangePreset] = useState<RangePreset>('14d');

  const fetchAnalytics = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError('');
    try {
      const res = await callApi(
        'GET_ANALYTICS',
        { username: currentUser?.username, role: currentUser?.role, forceRefresh },
        { background: true, cacheTtlMs: forceRefresh ? 0 : undefined }
      );
      if (!res) {
        setLoadError('Mất kết nối máy chủ khi tải dữ liệu thống kê.');
        return;
      }
      if (res.ok && res.data) {
        setData(res.data);
      } else {
        setLoadError(res.message || 'Không thể tải dữ liệu thống kê.');
      }
    } catch {
      setLoadError('Đã có lỗi xảy ra khi tải dữ liệu thống kê.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser?.username, currentUser?.role]);

  useEffect(() => {
    void fetchAnalytics(false);
  }, [fetchAnalytics]);

  const filteredDailyCheckins = useMemo(() => {
    if (!data?.dailyCheckins) return [];
    const sorted = [...data.dailyCheckins].sort(
      (a, b) => parseDdMmYyyy(a.date) - parseDdMmYyyy(b.date)
    );
    if (rangePreset === 'all') return sorted;
    const limit = rangePreset === '7d' ? 7 : rangePreset === '14d' ? 14 : 30;
    return sorted.slice(-limit);
  }, [data?.dailyCheckins, rangePreset]);

  const rangeTotals = useMemo(() => {
    return filteredDailyCheckins.reduce(
      (acc, d) => ({
        checkins: acc.checkins + (Number(d.checkins) || 0),
        late: acc.late + (Number(d.late) || 0),
      }),
      { checkins: 0, late: 0 }
    );
  }, [filteredDailyCheckins]);

  const handleExportCsv = () => {
    if (!data) return;
    const rows: unknown[][] = [
      ['Báo cáo Thống kê King\'s Grill', `Khoảng lọc: ${rangePreset === 'all' ? 'Tất cả' : rangePreset}`],
      [],
      ['CHỈ SỐ TỔNG HỢP (30 NGÀY)'],
      ['Tổng lượt chấm công', data.checkinStats.total],
      ['Hợp lệ', data.checkinStats.valid],
      ['Không hợp lệ', data.checkinStats.invalid],
      ['Đi trễ', data.checkinStats.late],
      ['Tỷ lệ Checklist hôm nay (%)', data.checklistRate],
      ['Lượt bàn giao hôm nay', data.handoverRate],
      ['Đào tạo hoàn thành / Tổng bài', `${data.trainingCompletion.completed}/${data.trainingCompletion.total}`],
      ['Góp ý chờ xử lý / Đã trả lời', `${data.feedbackStats.pending}/${data.feedbackStats.resolved}`],
      [],
      ['CHẤM CÔNG THEO NGÀY'],
      ['Ngày', 'Tổng lượt chấm công', 'Số lượt đi trễ'],
      ...filteredDailyCheckins.map((d) => [d.date, d.checkins, d.late]),
      [],
      ['TOP NHÂN SỰ ĐI TRỄ'],
      ['Hạng', 'Nhân viên', 'Số lần'],
      ...data.topLateEmployees.map((emp, i) => [i + 1, emp.name, emp.count]),
      [],
      ['TOP KING COINS'],
      ['Hạng', 'Nhân viên', 'Điểm'],
      ...data.kingCoinsTop5.map((emp, i) => [i + 1, emp.name, emp.points]),
    ];

    const csvContent = '\uFEFF' + rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `kg-analytics-${rangePreset}-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <RefreshCw size={24} className="animate-spin mr-3" /> Đang tải thống kê...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <div className="rounded-2xl border border-rose-500/30 bg-[var(--kg-surface)] p-6 text-center space-y-3 shadow-xs">
          <AlertTriangle size={28} className="mx-auto text-rose-500" />
          <h3 className="text-sm font-extrabold text-[var(--kg-text)]">
            {loadError || 'Không thể tải dữ liệu thống kê.'}
          </h3>
          <p className="text-xs text-[var(--kg-text-muted)]">
            Vui lòng kiểm tra kết nối mạng và thử tải lại báo cáo.
          </p>
          <button
            type="button"
            onClick={() => void fetchAnalytics(true)}
            className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-[var(--kg-primary)] text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs"
          >
            <RefreshCw size={14} /> Thử lại
          </button>
        </div>
      </div>
    );
  }

  const validRate = data.checkinStats.total > 0 ? Math.round((data.checkinStats.valid / data.checkinStats.total) * 100) : 0;
  const maxCheckin = Math.max(...filteredDailyCheckins.map(d => d.checkins), 1);
  const moodMeta: Record<string, { label: string; icon: LucideIcon; cls: string }> = {
    '1': { label: '1/5', icon: Frown, cls: 'text-rose-500' },
    '2': { label: '2/5', icon: Frown, cls: 'text-amber-500' },
    '3': { label: '3/5', icon: Meh, cls: 'text-slate-500' },
    '4': { label: '4/5', icon: Smile, cls: 'text-teal-500' },
    '5': { label: '5/5', icon: Sun, cls: 'text-emerald-500' },
  };
  const totalMoods = Object.values(data.moodDistribution).reduce((a, b) => a + b, 0);

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-20">
      <KgModuleHero
        moduleId="analytics"
        title="Thống kê & Báo cáo"
        description="Tổng hợp dữ liệu hoạt động, chấm công, checklist và lương thưởng 30 ngày gần nhất."
        eyebrow="Quản lý"
      />

      {/* Action Toolbar: Date Range Filter, Refresh, CSV Export */}
      <div className="soft3d-card p-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc khoảng thời gian biểu đồ">
          {(
            [
              { id: '7d', label: '7 ngày' },
              { id: '14d', label: '14 ngày' },
              { id: '30d', label: '30 ngày' },
              { id: 'all', label: 'Tất cả' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setRangePreset(opt.id)}
              className={`min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                rangePreset === opt.id
                  ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                  : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchAnalytics(true)}
            disabled={refreshing}
            className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>{refreshing ? 'Đang tải...' : 'Làm mới'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
          >
            <Download size={14} />
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
          <span className="flex items-center gap-2"><AlertTriangle size={15} /> {loadError}</span>
          <button
            type="button"
            onClick={() => void fetchAnalytics(true)}
            className="min-h-[34px] px-3 py-1 rounded-lg bg-[var(--kg-primary)] text-white font-bold"
          >
            Thử lại
          </button>
        </div>
      )}


      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Tổng chấm công', value: data.checkinStats.total, icon: Users, iconCls: 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary)]' },
          { label: 'Hợp lệ', value: `${validRate}%`, icon: CheckCircle2, iconCls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
          { label: 'Đi trễ', value: `${data.checkinStats.late}`, icon: AlertTriangle, iconCls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' },
          { label: 'Checklist hôm nay', value: `${data.checklistRate}%`, icon: CheckCircle2, iconCls: 'bg-teal-500/15 text-teal-600 dark:text-teal-400' },
        ].map((kpi, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="soft3d-card p-4"
          >
            <div className={`w-8 h-8 rounded-lg ${kpi.iconCls} flex items-center justify-center mb-2`}>
              <kpi.icon size={15} />
            </div>
            <p className="text-2xl font-black font-mono tabular-nums text-[var(--kg-text)]">{kpi.value}</p>
            <p className="text-[10px] text-[var(--kg-text-muted)] font-bold uppercase tracking-wider mt-0.5">{kpi.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Daily Check-in Chart */}
      <div className="soft3d-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="font-bold text-sm text-gray-800 dark:text-white flex items-center gap-2">
            <BarChart3 size={16} className="text-[var(--kg-primary)]" />
            <span>
              Chấm công {rangePreset === 'all' ? 'toàn bộ' : `${filteredDailyCheckins.length} ngày gần nhất`}
            </span>
          </h3>
          <span className="text-[11px] font-mono tabular-nums font-bold text-[var(--kg-text-muted)]">
            {rangeTotals.checkins} lượt · {rangeTotals.late} trễ
          </span>
        </div>
        {filteredDailyCheckins.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Chưa có dữ liệu</p>
        ) : (
          <div className="flex items-end gap-1.5 h-36 overflow-x-auto pt-2">
            {filteredDailyCheckins.map((day, idx) => {
              const height = Math.max(8, (day.checkins / maxCheckin) * 100);
              const lateHeight = day.late > 0 ? Math.max(6, (day.late / maxCheckin) * 100) : 0;
              const shortDate = day.date.split('/').slice(0, 2).join('/');
              return (
                <div key={idx} className="flex flex-col items-center justify-end flex-1 min-w-[32px] h-full">
                  <span className="text-[10px] text-[var(--kg-text-muted)] font-bold font-mono tabular-nums mb-1">{day.checkins}</span>
                  <div className="relative w-full flex-1 flex flex-col items-center justify-end">
                    <div
                      className="w-6 rounded-t-md bg-[var(--kg-primary)] transition-all"
                      style={{ height: `${height}%`, minHeight: '6px' }}
                    />
                    {lateHeight > 0 && (
                      <div
                        className="w-6 bg-[var(--kg-danger)] rounded-b-sm"
                        style={{ height: `${lateHeight}%`, minHeight: '3px' }}
                      />
                    )}
                  </div>
                  <span className="text-[9px] text-[var(--kg-text-soft)] mt-1.5 font-mono tabular-nums font-medium">{shortDate}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--kg-primary)] inline-block"></span> Tổng</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span> Trễ</span>
        </div>
      </div>

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Late Employees */}
        <div className="soft3d-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-bold text-sm text-gray-800 dark:text-white flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" /> Top đi trễ
            </h3>
            <button
              type="button"
              onClick={() => setCurrentTab('timesheet')}
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)]/40 text-[11px] font-bold text-[var(--kg-primary-ink)] inline-flex items-center gap-1"
            >
              <span>Xem Bảng công</span>
              <ArrowUpRight size={13} />
            </button>
          </div>
          {data.topLateEmployees.length === 0 ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold text-center py-4 flex items-center justify-center gap-1.5">
              <CheckCircle2 size={15} /> Không ghi nhận trường hợp đi trễ
            </p>
          ) : (
            <div className="space-y-2">
              {data.topLateEmployees.map((emp, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-red-50/50 dark:bg-red-900/10">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black font-mono tabular-nums flex-shrink-0 ${
                      idx === 0 ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600 dark:bg-red-900/30'
                    }`}>{idx + 1}</span>
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{emp.name}</span>
                  </div>
                  <span className="text-sm font-black font-mono tabular-nums text-red-500 flex-shrink-0">{emp.count} lần</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* King Coins Top 5 */}
        <div className="soft3d-card p-4">
          <h3 className="font-bold text-sm text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            <Trophy size={16} className="text-amber-500" /> Top King Coins
          </h3>
          {data.kingCoinsTop5.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-2">
              {data.kingCoinsTop5.map((emp, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-900/10">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center text-[10px] font-black font-mono tabular-nums flex-shrink-0">
                      {idx === 0 ? <Crown size={13} /> : idx < 3 ? <Medal size={13} /> : `#${idx + 1}`}
                    </span>
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{emp.name}</span>
                  </div>
                  <span className="text-sm font-black font-mono tabular-nums text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 flex-shrink-0">
                    {emp.points} <Coins size={13} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Training + Feedback + Mood */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Training */}
        <div className="soft3d-card p-4">
          <h3 className="font-bold text-sm text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            <GraduationCap size={16} className="text-orange-500" /> Đào tạo
          </h3>
          <div className="text-center py-2">
            <p className="text-3xl font-black font-mono tabular-nums text-gray-800 dark:text-white">{data.trainingCompletion.completed}</p>
            <p className="text-[10px] text-gray-500 font-bold uppercase mt-1 font-mono tabular-nums">Lượt hoàn thành / {data.trainingCompletion.total} bài</p>
          </div>
        </div>

        {/* Feedback */}
        <div className="soft3d-card p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-bold text-sm text-gray-800 dark:text-white flex items-center gap-2">
              <MessageSquare size={16} className="text-[var(--kg-primary)]" /> Góp ý
            </h3>
            <button
              type="button"
              onClick={() => setCurrentTab('feedback')}
              className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)]/40 text-[11px] font-bold text-[var(--kg-primary-ink)] inline-flex items-center gap-1"
            >
              <span>Xử lý góp ý</span>
              <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="flex items-center justify-around py-2">
            <div className="text-center">
              <p className="text-2xl font-black font-mono tabular-nums text-amber-500">{data.feedbackStats.pending}</p>
              <p className="text-[9px] text-gray-500 font-bold uppercase">Chờ xử lý</p>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700"></div>
            <div className="text-center">
              <p className="text-2xl font-black font-mono tabular-nums text-emerald-500">{data.feedbackStats.resolved}</p>
              <p className="text-[9px] text-gray-500 font-bold uppercase">Đã trả lời</p>
            </div>
          </div>
        </div>

        {/* Mood */}
        <div className="soft3d-card p-4">
          <h3 className="font-bold text-sm text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            <Smile size={16} className="text-teal-500" /> Tâm trạng NV
          </h3>
          {totalMoods === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">Chưa có khảo sát</p>
          ) : (
            <div className="flex items-end justify-around h-20 pt-2">
              {Object.entries(data.moodDistribution).map(([key, count]) => {
                const pct = totalMoods > 0 ? Math.max(8, (count / totalMoods) * 100) : 0;
                const meta = moodMeta[key];
                const MoodIcon = meta?.icon || Meh;
                return (
                  <div key={key} className="flex flex-col items-center">
                    <span className="text-[9px] font-bold font-mono tabular-nums text-gray-500 mb-0.5">{count}</span>
                    <div className="w-5 bg-teal-500 rounded-t-md" style={{ height: `${pct}%`, minHeight: '4px' }} />
                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold font-mono tabular-nums mt-1 ${meta?.cls || 'text-slate-500'}`}>
                      <MoodIcon size={12} /> {meta?.label || key}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Extra Info */}
      <div className="soft3d-card p-4 flex items-center gap-3 bg-[var(--kg-surface-soft)]">
        <div className="w-8 h-8 rounded-lg bg-[var(--kg-primary-soft)] flex items-center justify-center flex-shrink-0">
          <Clock size={14} className="text-[var(--kg-primary)]" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Bàn giao ca hôm nay</p>
          <p className="text-[10px] text-gray-500 font-mono tabular-nums">{data.handoverRate} lượt bàn giao đã ghi nhận</p>
        </div>
      </div>
    </div>
  );
}
