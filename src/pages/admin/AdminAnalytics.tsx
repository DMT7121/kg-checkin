import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Coins,
  Crown,
  Download,
  Frown,
  GraduationCap,
  Medal,
  Meh,
  MessageSquare,
  RefreshCw,
  Smile,
  Sun,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { KgErrorState, KgMetricCard, KgModuleHero, KgSkeleton } from '../../components/KgDesignSystem';
import { callApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { navigateToHubSubTab } from '../../utils/hubNavigation';
import { isAdminUser } from '../../utils/permissions';

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
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [rangePreset, setRangePreset] = useState<RangePreset>('14d');
  const [inspectedDate, setInspectedDate] = useState<string | null>(null);
  const [inspectedMoodKey, setInspectedMoodKey] = useState<string | null>(null);

  const fetchAnalytics = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setLoadError('');
      try {
        const res = await callApi(
          'GET_ANALYTICS',
          { username: currentUser?.username, role: currentUser?.role, forceRefresh },
          { background: true, cacheTtlMs: forceRefresh ? 0 : undefined },
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
    },
    [currentUser?.username, currentUser?.role],
  );

  useEffect(() => {
    void fetchAnalytics(false);
  }, [fetchAnalytics]);

  const filteredDailyCheckins = useMemo(() => {
    if (!data?.dailyCheckins) return [];
    const sorted = [...data.dailyCheckins].sort(
      (a, b) => parseDdMmYyyy(a.date) - parseDdMmYyyy(b.date),
    );
    if (rangePreset === 'all') return sorted;
    const limit = rangePreset === '7d' ? 7 : rangePreset === '14d' ? 14 : 30;
    return sorted.slice(-limit);
  }, [data?.dailyCheckins, rangePreset]);

  const rangeTotals = useMemo(
    () =>
      filteredDailyCheckins.reduce(
        (acc, d) => ({
          checkins: acc.checkins + (Number(d.checkins) || 0),
          late: acc.late + (Number(d.late) || 0),
        }),
        { checkins: 0, late: 0 },
      ),
    [filteredDailyCheckins],
  );

  const inspectedDay = useMemo(() => {
    if (filteredDailyCheckins.length === 0) return null;
    if (inspectedDate) {
      const found = filteredDailyCheckins.find((d) => d.date === inspectedDate);
      if (found) return found;
    }
    return filteredDailyCheckins[filteredDailyCheckins.length - 1];
  }, [filteredDailyCheckins, inspectedDate]);

  const handleExportCsv = () => {
    if (!data) return;
    const rows: unknown[][] = [
      ["Báo cáo Thống kê King's Grill", `Khoảng lọc biểu đồ: ${rangePreset === 'all' ? 'Tất cả' : rangePreset}`],
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
      <div className="p-4 space-y-4 max-w-6xl mx-auto">
        <KgSkeleton className="h-20 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KgSkeleton className="h-24 w-full" />
          <KgSkeleton className="h-24 w-full" />
          <KgSkeleton className="h-24 w-full" />
          <KgSkeleton className="h-24 w-full" />
        </div>
        <KgSkeleton className="h-52 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <KgErrorState
          title="Không thể tải dữ liệu thống kê"
          description={loadError || 'Vui lòng kiểm tra kết nối mạng và thử tải lại báo cáo.'}
          onRetry={() => void fetchAnalytics(true)}
        />
      </div>
    );
  }

  const validRate =
    data.checkinStats.total > 0
      ? Math.round((data.checkinStats.valid / data.checkinStats.total) * 100)
      : 0;
  const maxCheckin = Math.max(...filteredDailyCheckins.map((d) => Number(d.checkins) || 0), 1);
  const moodMeta: Record<string, { label: string; desc: string; icon: LucideIcon; cls: string }> = {
    '1': { label: '1/5', desc: 'Rất mệt mỏi', icon: Frown, cls: 'text-[var(--kg-danger)]' },
    '2': { label: '2/5', desc: 'Hơi căng thẳng', icon: Frown, cls: 'text-[var(--kg-warning)]' },
    '3': { label: '3/5', desc: 'Bình thường', icon: Meh, cls: 'text-[var(--kg-text-muted)]' },
    '4': { label: '4/5', desc: 'Tích cực', icon: Smile, cls: 'text-[var(--kg-info)]' },
    '5': { label: '5/5', desc: 'Rất hào hứng', icon: Sun, cls: 'text-[var(--kg-success)]' },
  };
  const totalMoods = Object.values(data.moodDistribution).reduce((a, b) => a + b, 0);
  const activeRangeLabel =
    rangePreset === 'all'
      ? 'Toàn bộ lịch sử'
      : rangePreset === '7d'
        ? '7 ngày gần nhất'
        : rangePreset === '14d'
          ? '14 ngày gần nhất'
          : '30 ngày gần nhất';

  return (
    <div className="p-4 md:px-0 md:pt-1 space-y-4 animate-fade-in pb-24 md:pb-12 max-w-6xl mx-auto">
      <KgModuleHero
        moduleId="analytics"
        title="Báo cáo vận hành"
        description="KPI tổng hợp 30 ngày gần nhất, biểu đồ chấm công tỷ lệ chuẩn và xuất CSV an toàn."
        eyebrow="Hệ thống · Báo cáo"
        actions={
          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => void fetchAnalytics(true)}
              disabled={refreshing}
              className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin shrink-0' : 'shrink-0'} />
              <span>{refreshing ? 'Đang tải...' : 'Làm mới'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="min-h-[44px] sm:min-h-[38px] px-4 py-1.5 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap"
            >
              <Download size={14} className="shrink-0" />
              <span>Xuất CSV</span>
            </button>
          </div>
        }
      />

      {/* Range Filter Pills */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
        <div
          className="grid grid-cols-4 sm:inline-flex items-center gap-1.5 w-full sm:w-auto"
          role="group"
          aria-label="Lọc khoảng thời gian biểu đồ"
        >
          {(
            [
              { id: '7d', label: '7 ngày' },
              { id: '14d', label: '14 ngày' },
              { id: '30d', label: '30 ngày' },
              { id: 'all', label: 'Tất cả' },
            ] as const
          ).map((opt) => {
            const active = rangePreset === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setRangePreset(opt.id);
                  setInspectedDate(null);
                }}
                className={`kg-filter-pill min-h-[44px] sm:min-h-[36px] px-2.5 sm:px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-colors whitespace-nowrap inline-flex items-center justify-center ${
                  active
                    ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                    : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] font-mono tabular-nums font-bold text-[var(--kg-primary-ink)] px-1">
          Phạm vi biểu đồ: {activeRangeLabel}
        </span>
      </div>

      {loadError && (
        <KgErrorState
          title="Không thể làm mới báo cáo"
          description={loadError}
          onRetry={() => void fetchAnalytics(true)}
        />
      )}

      {/* Toast Touch 4 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KgMetricCard
          title="Tổng chấm công"
          value={data.checkinStats.total}
          icon={Users}
          variant="info"
          subtext="30 ngày gần nhất"
        />
        <KgMetricCard
          title="Tỷ lệ hợp lệ"
          value={`${validRate}%`}
          icon={CheckCircle2}
          variant="success"
          subtext={`${data.checkinStats.valid} lượt hợp lệ`}
        />
        <KgMetricCard
          title="Lượt đi trễ"
          value={data.checkinStats.late}
          icon={AlertTriangle}
          variant="error"
          subtext="30 ngày gần nhất"
        />
        <KgMetricCard
          title="Checklist hoàn tất"
          value={`${data.checklistRate}%`}
          icon={CheckCircle2}
          variant="success"
          subtext="Hôm nay"
        />
      </div>

      {/* Interactive Stacked Daily Check-in Chart (onTime green + late terracotta <= 100%) */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-extrabold text-sm text-[var(--kg-text)] flex items-center gap-2">
              <BarChart3 size={16} className="text-[var(--kg-primary-ink)]" />
              <span>Chấm công theo ngày ({activeRangeLabel})</span>
            </h3>
            <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5">
              Chạm hoặc di chuột vào từng cột ngày để xem tỷ lệ đúng giờ / đi trễ.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums font-extrabold text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)] px-2.5 py-1 rounded-lg">
            {rangeTotals.checkins} lượt · {rangeTotals.late} trễ
          </span>
        </div>

        {/* Interactive Inspected Day Tooltip Strip */}
        {inspectedDay && (
          <div
            role="status"
            className="rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] font-mono tabular-nums font-bold text-[11px]">
                {inspectedDay.date}
              </span>
              <span className="font-bold text-[var(--kg-text)]">
                Tổng <span className="font-mono tabular-nums">{inspectedDay.checkins}</span> lượt
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[11px] font-bold">
              <span className="text-[var(--kg-success)]">
                Đúng giờ: {Math.max(0, inspectedDay.checkins - inspectedDay.late)}
              </span>
              <span className="text-[var(--kg-primary-ink)]">
                Đi trễ: {inspectedDay.late} (
                {inspectedDay.checkins > 0
                  ? Math.round((inspectedDay.late / inspectedDay.checkins) * 100)
                  : 0}
                %)
              </span>
            </div>
          </div>
        )}

        {filteredDailyCheckins.length === 0 ? (
          <p className="text-sm text-[var(--kg-text-muted)] text-center py-6">Chưa có dữ liệu</p>
        ) : (
          <div className="flex items-end gap-1.5 h-44 overflow-x-auto pt-3 pb-1">
            {filteredDailyCheckins.map((day) => {
              const totalCheckins = Math.max(0, Number(day.checkins) || 0);
              const lateCount = Math.min(totalCheckins, Math.max(0, Number(day.late) || 0));
              const onTimeCount = Math.max(0, totalCheckins - lateCount);
              // Proportional total height strictly <= 100%
              const totalHeightPct =
                totalCheckins === 0
                  ? 0
                  : Math.min(100, Math.max(8, (totalCheckins / maxCheckin) * 100));
              const lateSharePct =
                totalCheckins > 0 ? Math.min(100, (lateCount / totalCheckins) * 100) : 0;
              const shortDate = day.date.split('/').slice(0, 2).join('/');
              const isSelected = inspectedDay?.date === day.date;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setInspectedDate(day.date)}
                  onMouseEnter={() => setInspectedDate(day.date)}
                  onFocus={() => setInspectedDate(day.date)}
                  aria-pressed={isSelected}
                  aria-label={`Ngày ${day.date}: ${totalCheckins} lượt chấm công (${onTimeCount} đúng giờ, ${lateCount} đi trễ)`}
                  className={`flex flex-col items-center justify-end flex-1 shrink-0 min-w-[38px] h-full rounded-xl px-1 py-1 transition-colors ${
                    isSelected
                      ? 'bg-[var(--kg-primary-soft)] ring-1 ring-[var(--kg-primary)]/40'
                      : 'hover:bg-[var(--kg-surface-2)]'
                  }`}
                >
                  <span className="text-[10px] text-[var(--kg-text-muted)] font-bold font-mono tabular-nums mb-1">
                    {totalCheckins}
                  </span>
                  <div className="relative w-full flex-1 flex flex-col items-center justify-end min-h-0">
                    {totalCheckins === 0 ? (
                      <div className="w-6 h-[3px] rounded-sm bg-[var(--kg-border)]" />
                    ) : (
                      <div
                        className="w-6 rounded-t-md rounded-b-sm overflow-hidden flex flex-col justify-end bg-[var(--kg-surface-soft)] transition-all"
                        style={{ height: `${totalHeightPct}%`, minHeight: '6px' }}
                      >
                        {onTimeCount > 0 && (
                          <div
                            className="w-full flex-1 min-h-0 bg-[var(--kg-success)] transition-all"
                          />
                        )}
                        {lateCount > 0 && (
                          <div
                            className="w-full bg-[var(--kg-primary)] transition-all shrink-0"
                            style={{ height: `${lateSharePct}%`, minHeight: '3px' }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] text-[var(--kg-text-muted)] mt-1.5 font-mono tabular-nums font-bold">
                    {shortDate}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-4 text-[11px] text-[var(--kg-text-muted)] font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--kg-success)] inline-block" /> Đúng giờ
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--kg-primary)] inline-block" /> Đi trễ
          </span>
        </div>
      </div>

      {/* Two Column Ranked Tables (Right-Aligned font-mono tabular-nums) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Late Employees */}
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-extrabold text-sm text-[var(--kg-text)] flex items-center gap-2">
              <AlertTriangle size={16} className="text-[var(--kg-danger)]" /> Top đi trễ (30 ngày)
            </h3>
            <button
              type="button"
              onClick={() => navigateToHubSubTab('attendance', 'ledger')}
              className="min-h-[40px] sm:min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-surface-2)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-[11px] font-bold text-[var(--kg-primary-ink)] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>Xem Bảng công</span>
              <ArrowUpRight size={13} className="shrink-0" />
            </button>
          </div>
          {data.topLateEmployees.length === 0 ? (
            <p className="text-sm text-[var(--kg-success)] font-semibold text-center py-4 flex items-center justify-center gap-1.5">
              <CheckCircle2 size={15} /> Không ghi nhận trường hợp đi trễ
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--kg-border)]">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-[var(--kg-surface-soft)] text-[10px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">#</th>
                    <th className="py-2.5 px-3 text-left">Nhân viên</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">Số lần trễ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--kg-border)]">
                  {data.topLateEmployees.map((emp, idx) => (
                    <tr key={idx} className="hover:bg-[var(--kg-surface-2)]">
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-[10px] font-black font-mono tabular-nums ${
                            idx === 0
                              ? 'bg-[var(--kg-danger)] text-white dark:text-[#0D1015]'
                              : 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                          }`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-[var(--kg-text)] truncate max-w-[180px]">
                        {emp.name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black font-mono tabular-nums text-[var(--kg-danger)] whitespace-nowrap">
                        {emp.count} lần
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* King Coins Top 5 */}
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-extrabold text-sm text-[var(--kg-text)] flex items-center gap-2">
              <Trophy size={16} className="text-[var(--kg-warning)]" /> Top King Coins
            </h3>
            <button
              type="button"
              onClick={() => navigateToHubSubTab('communications', 'reward')}
              className="min-h-[40px] sm:min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-surface-2)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-[11px] font-bold text-[var(--kg-primary-ink)] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>Bảng xếp hạng</span>
              <ArrowUpRight size={13} className="shrink-0" />
            </button>
          </div>
          {data.kingCoinsTop5.length === 0 ? (
            <p className="text-sm text-[var(--kg-text-muted)] text-center py-4">Chưa có dữ liệu</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--kg-border)]">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-[var(--kg-surface-soft)] text-[10px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center">Hạng</th>
                    <th className="py-2.5 px-3 text-left">Nhân viên</th>
                    <th className="py-2.5 px-3 text-right whitespace-nowrap">King Coins</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--kg-border)]">
                  {data.kingCoinsTop5.map((emp, idx) => (
                    <tr key={idx} className="hover:bg-[var(--kg-surface-2)]">
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex w-6 h-6 rounded-full bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] items-center justify-center text-[10px] font-black font-mono tabular-nums">
                          {idx === 0 ? <Crown size={13} /> : idx < 3 ? <Medal size={13} /> : `#${idx + 1}`}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-[var(--kg-text)] truncate max-w-[180px]">
                        {emp.name}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black font-mono tabular-nums text-[var(--kg-warning)] whitespace-nowrap">
                        <span className="inline-flex items-center justify-end gap-1">
                          {emp.points} <Coins size={13} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Training + Feedback + Mood */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Training with Drill-Down Link */}
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-extrabold text-sm text-[var(--kg-text)] flex items-center gap-2 min-w-0">
              <GraduationCap size={16} className="text-[var(--kg-primary-ink)] shrink-0" /> <span className="truncate">Đào tạo SOP</span>
            </h3>
            <button
              type="button"
              onClick={() => navigateToHubSubTab('knowledge')}
              className="min-h-[40px] sm:min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-surface-2)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-[11px] font-bold text-[var(--kg-primary-ink)] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>Mở SOP</span>
              <ArrowUpRight size={13} className="shrink-0" />
            </button>
          </div>
          <div className="text-center py-2">
            <p className="text-3xl font-black font-mono tabular-nums text-[var(--kg-text)]">
              {data.trainingCompletion.completed}
            </p>
            <p className="text-[11px] text-[var(--kg-text-muted)] font-bold uppercase mt-1 font-mono tabular-nums">
              Lượt hoàn thành / {data.trainingCompletion.total} bài
            </p>
          </div>
        </div>

        {/* Feedback */}
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-extrabold text-sm text-[var(--kg-text)] flex items-center gap-2 min-w-0">
              <MessageSquare size={16} className="text-[var(--kg-primary-ink)] shrink-0" /> <span className="truncate">Góp ý</span>
            </h3>
            <button
              type="button"
              onClick={() => navigateToHubSubTab('communications', 'feedback')}
              className="min-h-[40px] sm:min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-surface-2)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-[11px] font-bold text-[var(--kg-primary-ink)] inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>Xử lý góp ý</span>
              <ArrowUpRight size={13} className="shrink-0" />
            </button>
          </div>
          <div className="flex items-center justify-around py-2">
            <div className="text-center">
              <p className="text-2xl font-black font-mono tabular-nums text-[var(--kg-warning)]">
                {data.feedbackStats.pending}
              </p>
              <p className="text-[10px] text-[var(--kg-text-muted)] font-bold uppercase">
                Chờ xử lý
              </p>
            </div>
            <div className="w-px h-8 bg-[var(--kg-border)]" />
            <div className="text-center">
              <p className="text-2xl font-black font-mono tabular-nums text-[var(--kg-success)]">
                {data.feedbackStats.resolved}
              </p>
              <p className="text-[10px] text-[var(--kg-text-muted)] font-bold uppercase">
                Đã trả lời
              </p>
            </div>
          </div>
        </div>

        {/* Mood with Interactive Inspection */}
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-extrabold text-sm text-[var(--kg-text)] flex items-center gap-2">
              <Smile size={16} className="text-[var(--kg-success)] shrink-0" /> Tâm trạng NV
            </h3>
            {inspectedMoodKey && moodMeta[inspectedMoodKey] && (
              <span className="text-[11px] font-bold text-[var(--kg-primary-ink)] font-mono tabular-nums">
                {moodMeta[inspectedMoodKey].desc}: {data.moodDistribution[inspectedMoodKey] || 0} (
                {totalMoods > 0
                  ? Math.round(((data.moodDistribution[inspectedMoodKey] || 0) / totalMoods) * 100)
                  : 0}
                %)
              </span>
            )}
          </div>
          {totalMoods === 0 ? (
            <p className="text-sm text-[var(--kg-text-muted)] text-center py-4">Chưa có khảo sát</p>
          ) : (
            <div className="flex items-end justify-around h-24 pt-2 gap-1">
              {Object.entries(data.moodDistribution).map(([key, count]) => {
                const pct = totalMoods > 0 ? Math.max(10, (count / totalMoods) * 100) : 0;
                const meta = moodMeta[key];
                const MoodIcon = meta?.icon || Meh;
                const active = inspectedMoodKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setInspectedMoodKey(key)}
                    onMouseEnter={() => setInspectedMoodKey(key)}
                    className={`min-w-[44px] min-h-[44px] flex flex-col items-center justify-end px-1.5 py-1 rounded-xl transition-colors ${
                      active ? 'bg-[var(--kg-primary-soft)]' : 'hover:bg-[var(--kg-surface-2)]'
                    }`}
                  >
                    <span className="text-[10px] font-bold font-mono tabular-nums text-[var(--kg-text-muted)] mb-0.5">
                      {count}
                    </span>
                    <div
                      className="w-5 bg-[var(--kg-success)] rounded-t-md"
                      style={{ height: `${pct}%`, minHeight: '6px' }}
                    />
                    <span
                      className={`inline-flex items-center gap-0.5 text-[10px] font-bold font-mono tabular-nums mt-1 ${meta?.cls || 'text-[var(--kg-text-muted)]'}`}
                    >
                      <MoodIcon size={12} /> {meta?.label || key}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Handover Summary Card with Drill-Down Link */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] flex items-center justify-center flex-shrink-0">
            <Clock size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-extrabold text-[var(--kg-text)]">
              Bàn giao ca hôm nay
            </p>
            <p className="text-[11px] text-[var(--kg-text-muted)] font-mono tabular-nums">
              {data.handoverRate} lượt bàn giao đã ghi nhận trong ngày
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigateToHubSubTab('admin_ops', 'inbox')}
          className="w-full sm:w-auto min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-primary-ink)] inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
        >
          <span>Đối soát két tại Hộp duyệt</span>
          <ArrowUpRight size={14} className="shrink-0" />
        </button>
      </div>
    </div>
  );
}
