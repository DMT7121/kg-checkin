import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { buildHealthyReliabilityRanking } from '../utils/trainingGamification';
import {
  Award,
  Trophy,
  Crown,
  Medal,
  History,
  RefreshCw,
  Sparkles,
  Coins,
  MapPin,
  ClipboardCheck,
  ArrowLeftRight,
  Scale,
  GraduationCap,
} from 'lucide-react';
import {
  KgButton,
  KgErrorState,
  KgFeatureTip,
  KgModuleHero,
  KgSkeleton,
} from '../components/KgDesignSystem';

const REWARD_SOURCE_LABELS: Record<string, string> = {
  checkin: 'Chấm công',
  checklist: 'Checklist ca',
  handover: 'Bàn giao két',
  training: 'Đào tạo SOP',
  discipline: 'Thưởng / Kỷ luật',
  bonus: 'Thưởng nóng',
  penalty: 'Khấu trừ',
  admin: 'Quản lý ghi nhận',
  system: 'Hệ thống',
};

function formatRewardSourceLabel(source?: string): string {
  const clean = String(source || '').trim();
  if (!clean) return 'Hệ thống';
  const normalized = clean.toLowerCase();
  return REWARD_SOURCE_LABELS[normalized] || clean;
}

interface CoinEntry {
  id: string;
  date: string;
  action: string;
  points: number;
  source: string;
}

interface LeaderboardEntry {
  username: string;
  fullname: string;
  totalPoints: number;
  rank: number;
}

export default function Reward() {
  const currentUser = useAppStore((s) => s.currentUser);
  const [totalPoints, setTotalPoints] = useState(0);
  const [coinHistory, setCoinHistory] = useState<CoinEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'wallet' | 'leaderboard'>('wallet');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'earned' | 'deducted'>('all');
  const [loading, setLoading] = useState(Boolean(currentUser?.username));
  const [loadError, setLoadError] = useState('');

  const fetchRewardData = useCallback(async () => {
    const username = currentUser?.username;
    if (!username) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [coinsRes, boardRes] = await Promise.all([
        callApi('GET_USER_COINS', { username }, { background: true }),
        callApi('GET_LEADERBOARD', {}, { background: true }),
      ]);
      if (coinsRes?.ok) {
        setTotalPoints(coinsRes.data?.totalPoints || 0);
        setCoinHistory(Array.isArray(coinsRes.data?.history) ? coinsRes.data.history : []);
      }
      if (boardRes?.ok) {
        setLeaderboard(Array.isArray(boardRes.data) ? boardRes.data : []);
      }
      if (!coinsRes?.ok && !boardRes?.ok) {
        setLoadError(
          coinsRes?.message || boardRes?.message || 'Không thể tải dữ liệu điểm thưởng King Coins.',
        );
      }
    } catch {
      setLoadError('Lỗi kết nối máy chủ khi tải ví King Coins và Bảng vàng.');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.username]);

  useEffect(() => {
    void fetchRewardData();
  }, [fetchRewardData]);

  const healthyRanking = useMemo(
    () => buildHealthyReliabilityRanking(leaderboard, currentUser?.username),
    [leaderboard, currentUser?.username],
  );

  const myRank = healthyRanking.myPositiveRank ?? '-';

  const nextMilestone = totalPoints < 100 ? 100 : 250;
  const nextMilestoneLabel = totalPoints < 100 ? 'Đồng Đội Tin Cậy' : 'Ngôi Sao Chuẩn Mực';
  const clampedPositivePoints = Math.max(0, totalPoints);
  const progressPct =
    totalPoints >= 250
      ? 100
      : Math.max(0, Math.min(100, Math.round((clampedPositivePoints / nextMilestone) * 100)));

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'earned') return coinHistory.filter((item) => item.points > 0);
    if (historyFilter === 'deducted') return coinHistory.filter((item) => item.points < 0);
    return coinHistory;
  }, [coinHistory, historyFilter]);

  const renderSourceIcon = (source: string) => {
    switch (source.trim().toLowerCase()) {
      case 'checkin':
        return <MapPin size={17} />;
      case 'checklist':
        return <ClipboardCheck size={17} />;
      case 'handover':
        return <ArrowLeftRight size={17} />;
      case 'training':
        return <GraduationCap size={17} />;
      case 'discipline':
        return <Scale size={17} />;
      default:
        return <Coins size={17} />;
    }
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-20 max-w-5xl mx-auto w-full">
      <KgModuleHero
        moduleId="reward"
        title="King Coins & Bảng Vàng"
        description="Tích điểm từ chấm công đúng giờ, checklist công việc, bàn giao ca và đào tạo SOP."
        eyebrow="Cộng đồng · Ghi nhận"
        tipTitle="Cơ chế Tích lũy King Coins"
        tips={[
          'Chấm công đúng giờ: +5 Coins mỗi ca hợp lệ (đi trễ: -10 Coins).',
          'Hoàn thành Checklist: +10 Coins khi đồng bộ tiến độ ca.',
          'Bàn giao ca đầy đủ: +15 Coins mỗi lượt bàn giao xác nhận.',
          'Đào tạo SOP & Thưởng/Phạt: Cộng điểm theo từng bài kiểm tra đạt ≥70%; Thưởng nóng +20 Coins, Phạt lỗi -15 Coins.',
        ]}
        actions={
          <KgButton
            type="button"
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={loading}
            onClick={() => void fetchRewardData()}
          >
            Làm mới
          </KgButton>
        }
      />

      {/* Forest Charcoal #202C27 King Coins Hero Wallet + Progress Track */}
      <div className="relative overflow-hidden rounded-[20px] bg-[#202C27] dark:bg-[var(--kg-rail-bg)] text-[#F6F8F4] border border-white/10 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-[#F29055] text-[#241C17] flex items-center justify-center flex-shrink-0">
              <Coins size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#B7C8BC] font-extrabold mb-1 uppercase tracking-widest">
                Ví King Coins khả dụng
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-mono tabular-nums font-black leading-none text-white">
                  {loading ? '...' : totalPoints}
                </span>
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#F29055]">
                  Coins
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-wrap pt-3 border-t border-white/10 sm:pt-0 sm:border-t-0">
            <div className="bg-white/10 border border-white/15 rounded-xl px-3.5 py-2 text-center">
              <p className="text-[10px] text-[#B7C8BC] font-extrabold uppercase tracking-wider">
                Hạng Bảng Vàng
              </p>
              <p className="text-lg font-mono tabular-nums font-black leading-tight text-white">
                {loading ? '-' : myRank === '-' ? '—' : `#${myRank}`}
              </p>
            </div>
            <KgFeatureTip
              title="Bảng quy đổi điểm King Coins"
              tips={[
                'Đúng giờ: +5 Coins · Đi trễ: -10 Coins',
                'Checklist hoàn thành: +10 Coins',
                'Bàn giao ca: +15 Coins',
                'Bài kiểm tra SOP đạt ≥70%: Cộng theo từng bài',
                'Thưởng nóng: +20 Coins · Phạt lỗi: -15 Coins',
              ]}
              variant="badge"
              triggerText="Cách tích điểm"
            />
          </div>
        </div>

        {/* Progress Track inside Hero Wallet */}
        <div className="space-y-1.5 pt-2 border-t border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[#CFE3D4] font-semibold">
              {totalPoints >= 250
                ? 'Đã đạt danh hiệu cao nhất: Ngôi Sao Chuẩn Mực'
                : `Mốc tiếp theo: ${nextMilestoneLabel} (${nextMilestone} Coins)`}
            </span>
            <span className="font-mono tabular-nums font-bold text-[#F29055]">
              {clampedPositivePoints} / {nextMilestone} Coins ({progressPct}%)
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#F29055] transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2 Crisp Navigation Tabs — Toast Touch segmented control */}
      <div className="grid grid-cols-2 sm:inline-flex bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-1 rounded-xl gap-1">
        {(
          [
            { id: 'wallet', label: 'Ví điểm & Lịch sử', icon: History },
            { id: 'leaderboard', label: 'Bảng vàng', icon: Trophy },
          ] as const
        ).map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[44px] sm:min-h-[38px] sm:min-w-[175px] px-3 sm:px-4 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs sm:text-sm font-bold transition-colors whitespace-nowrap select-none touch-manipulation ${
                isSelected
                  ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] shadow-xs'
                  : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              <tab.icon size={15} className="shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loadError ? (
        <KgErrorState
          title="Không thể tải dữ liệu King Coins"
          description={loadError}
          onRetry={() => void fetchRewardData()}
        />
      ) : (
        <div key={activeTab} className="kg-fade-in">
          {/* TAB 1: VÍ ĐIỂM & LỊCH SỬ */}
          {activeTab === 'wallet' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-extrabold text-[var(--kg-text)] flex items-center gap-2 text-sm">
                  <History size={17} className="text-[var(--kg-primary-ink)]" /> Lịch sử nhận điểm
                </h3>
                {coinHistory.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {(
                      [
                        { id: 'all', label: `Tất cả (${coinHistory.length})` },
                        {
                          id: 'earned',
                          label: `Cộng điểm (${coinHistory.filter((c) => c.points > 0).length})`,
                        },
                        {
                          id: 'deducted',
                          label: `Trừ điểm (${coinHistory.filter((c) => c.points < 0).length})`,
                        },
                      ] as const
                    ).map((f) => {
                      const active = historyFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setHistoryFilter(f.id)}
                          className={`kg-filter-pill shrink-0 ${active ? 'kg-filter-pill--active' : ''}`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {loading ? (
                <div className="space-y-2.5">
                  <KgSkeleton className="h-16 w-full" />
                  <KgSkeleton className="h-16 w-full" />
                  <KgSkeleton className="h-16 w-full" />
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs p-8 text-center">
                  <Award size={40} className="mx-auto mb-3 text-[var(--kg-text-soft)]" />
                  <p className="text-sm font-semibold text-[var(--kg-text-muted)]">
                    {coinHistory.length === 0
                      ? 'Chưa có lịch sử điểm nào.'
                      : 'Không có giao dịch điểm nào trong mục lọc này.'}
                  </p>
                  <p className="text-xs text-[var(--kg-text-soft)] mt-1">
                    Hãy chấm công đúng giờ và hoàn thành checklist để tích điểm!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {filteredHistory.map((item) => (
                    <div
                      key={item.id}
                      className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs p-3.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            item.points > 0
                              ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                              : 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                          }`}
                        >
                          {renderSourceIcon(item.source)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-[var(--kg-text)] truncate">{item.action}</p>
                          <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                            {item.date} • {formatRewardSourceLabel(item.source)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`font-mono tabular-nums font-black text-sm flex-shrink-0 ml-2 inline-flex items-center gap-1 ${
                          item.points > 0 ? 'text-[var(--kg-success)]' : 'text-[var(--kg-danger)]'
                        }`}
                      >
                        {item.points > 0 ? '+' : ''}
                        {item.points} <Coins size={14} className="text-[var(--kg-warning)]" />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BẢNG VÀNG (Zero public negative balance shaming) */}
          {activeTab === 'leaderboard' && (
            <div className="space-y-4">
              <div className="bg-[var(--kg-surface)] p-5 rounded-2xl border border-[var(--kg-border)] text-center shadow-xs space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] flex items-center justify-center mx-auto mb-1">
                  <Trophy size={24} />
                </div>
                <h3 className="font-black text-base sm:text-lg text-[var(--kg-text)]">
                  Bảng Vàng Chuyên Cần &amp; Đồng Đội Tin Cậy
                </h3>
                <p className="text-xs sm:text-sm text-[var(--kg-text-muted)] font-medium">
                  Chỉ vinh danh nhân sự có tổng điểm dương tích lũy từ chấm công đúng giờ (+5), checklist (+10), bàn giao ca (+15), đào tạo SOP và thưởng nóng (+20). Các khoản trừ điểm được hiển thị riêng tại Ví điểm.
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] text-xs font-semibold text-[var(--kg-text)]">
                  <Sparkles size={13} className="text-[var(--kg-warning)] shrink-0" />
                  <span>{healthyRanking.encouragementMessage}</span>
                </div>
              </div>

              {loading ? (
                <div className="space-y-2.5">
                  <KgSkeleton className="h-16 w-full" />
                  <KgSkeleton className="h-16 w-full" />
                  <KgSkeleton className="h-16 w-full" />
                </div>
              ) : healthyRanking.entries.length === 0 ? (
                <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs p-8 text-center">
                  <Trophy size={40} className="mx-auto mb-3 text-[var(--kg-text-soft)]" />
                  <p className="text-sm text-[var(--kg-text-muted)]">
                    Chưa có thành viên nào trên Bảng Vàng kỳ này.
                  </p>
                </div>
              ) : (
                <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs overflow-hidden">
                  {healthyRanking.entries.map((user) => {
                    const isMe = user.username === currentUser?.username;
                    return (
                      <div
                        key={user.username}
                        className={`flex items-center p-4 border-b border-[var(--kg-border)] last:border-0 ${
                          isMe ? 'bg-[var(--kg-primary-soft)]' : ''
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono tabular-nums font-bold text-sm mr-3 flex-shrink-0 ${
                            user.rank === 1
                              ? 'bg-amber-400 text-amber-950 shadow-2xs'
                              : user.rank === 2
                                ? 'bg-[var(--kg-surface-2)] text-[var(--kg-text)] border border-[var(--kg-border-strong)]'
                                : user.rank === 3
                                  ? 'bg-[var(--kg-warning)] text-white dark:text-[#1A1613]'
                                  : 'bg-[var(--kg-surface-2)] text-[var(--kg-text-muted)] border border-[var(--kg-border)]'
                          }`}
                        >
                          {user.rank === 1 ? <Crown size={16} /> : user.rank <= 3 ? <Medal size={16} /> : user.rank}
                        </div>
                        <div className="flex-1 min-w-0 pr-2">
                          <p
                            className={`font-bold text-sm truncate ${
                              isMe ? 'text-[var(--kg-primary-ink)]' : 'text-[var(--kg-text)]'
                            }`}
                          >
                            {user.fullname} {isMe && '(Bạn)'}
                          </p>
                          <span
                            className={`inline-block mt-0.5 text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                              user.badgeLabel === 'Ngôi Sao Chuẩn Mực'
                                ? 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                                : user.badgeLabel === 'Đồng Đội Tin Cậy'
                                  ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                                  : 'bg-[var(--kg-info-soft)] text-[var(--kg-info)]'
                            }`}
                          >
                            {user.badgeLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono tabular-nums font-black text-[var(--kg-text)] flex-shrink-0 text-right">
                          +{user.totalPoints} <Coins size={15} className="text-[var(--kg-warning)]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
