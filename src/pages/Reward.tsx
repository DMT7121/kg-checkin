import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { buildHealthyReliabilityRanking } from '../utils/trainingGamification';
import {
  Award,
  Star,
  Gift,
  Trophy,
  Crown,
  Medal,
  AlertCircle,
  History,
  RefreshCw,
  Sparkles,
  Coins,
  MapPin,
  ClipboardCheck,
  ArrowLeftRight,
  Scale,
  Clock,
  AlertTriangle,
  Coffee,
  CalendarCheck,
  Banknote,
  ShoppingBag,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { motion } from 'framer-motion';
import { KgModuleHero } from '../components/KgDesignSystem';


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
  const [activeTab, setActiveTab] = useState<'wallet' | 'leaderboard' | 'shop'>('wallet');
  const [loading, setLoading] = useState(true);

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [coinsRes, boardRes] = await Promise.all([
          callApi('GET_USER_COINS', { username: currentUser!.username }, { background: true }),
          callApi('GET_LEADERBOARD', {}, { background: true })
        ]);
        if (coinsRes?.ok) {
          setTotalPoints(coinsRes.data.totalPoints || 0);
          setCoinHistory(coinsRes.data.history || []);
        }
        if (boardRes?.ok) {
          setLeaderboard(boardRes.data || []);
        }
      } catch (e) { console.error('Reward fetch error:', e); }
      setLoading(false);
    };
    fetchData();
  }, []);

  const healthyRanking = useMemo(
    () => buildHealthyReliabilityRanking(leaderboard, currentUser?.username),
    [leaderboard, currentUser?.username]
  );

  // Find user positive rank (healthy recognition — never displays shaming bottom/negative rank)
  const myRank = healthyRanking.myPositiveRank ?? '-';

  const handleRedeem = (itemName: string, cost: number) => {
    if (totalPoints >= cost) {
      Swal.fire({
        title: 'Xác nhận đổi quà',
        html: `Bạn sẽ dùng <b class="tabular-nums">${cost} King Coins</b> để đổi lấy:<br/><br/><span class="text-base font-bold text-[#062B49]">${itemName}</span>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Xác nhận đổi',
        cancelButtonText: 'Hủy'
      }).then((result) => {
        if (result.isConfirmed) {
          setTotalPoints(p => p - cost);
          Swal.fire('Thành công!', 'Yêu cầu đổi quà đã được gửi cho Quản lý.', 'success');
        }
      });
    } else {
      Swal.fire('Không đủ điểm', `Bạn cần thêm ${cost - totalPoints} King Coins nữa để đổi món quà này.`, 'error');
    }
  };

  const renderSourceIcon = (source: string) => {
    switch (source) {
      case 'CheckIn': return <MapPin size={17} />;
      case 'Checklist': return <ClipboardCheck size={17} />;
      case 'Handover': return <ArrowLeftRight size={17} />;
      case 'Discipline': return <Scale size={17} />;
      default: return <Coins size={17} />;
    }
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-20">
      
      <KgModuleHero
        moduleId="reward"
        title="King Coins"
        description="Tích điểm từ mọi hoạt động chấm công, checklist công việc, bàn giao ca."
        eyebrow="Phần thưởng"
        tipTitle="Cơ chế Tích lũy King Coins & Đổi thưởng"
        tips={[
          "Chấm công đúng giờ: +10 Coins mỗi ca làm việc hợp lệ.",
          "Hoàn thành Checklist 100%: +20 Coins cho khu vực phụ trách.",
          "Bàn giao ca chuẩn xác không lệch quỹ: +15 Coins.",
          "Coins tích lũy dùng để đổi voucher ăn uống, ngày nghỉ phép ưu tiên hoặc quy đổi quà tặng cuối năm."
        ]}
      />

      {/* Points Card */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 relative z-10 w-full shadow-xs mb-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
            <Coins size={24} />
          </div>
          <div>
            <p className="text-[11px] text-[var(--kg-text-muted)] font-black mb-1 uppercase tracking-wider">King Coins khả dụng</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl sm:text-4xl font-mono tabular-nums font-black leading-none text-[var(--kg-text)]">{loading ? '...' : totalPoints}</span>
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">Coins</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 ml-auto">
          <div className="bg-[var(--kg-surface-soft)] rounded-xl px-3.5 py-2 text-center border border-[var(--kg-border)]">
            <p className="text-[10px] text-[var(--kg-text-muted)] font-black uppercase tracking-wider">Hạng</p>
            <p className="text-lg font-mono tabular-nums font-black leading-tight text-[var(--kg-primary)]">{loading ? '-' : `#${myRank}`}</p>
          </div>
          <button 
            type="button"
            onClick={() => setActiveTab('shop')}
            className="bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-black px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl text-xs sm:text-sm shadow-xs active:scale-95 transition-all"
          >
            Đổi quà
          </button>
        </div>
      </div>

      {/* Points Source Guide */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3.5 shadow-xs">
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles size={14} className="text-amber-500" />
          <span className="text-xs font-black text-[var(--kg-text)]">Cơ chế tích điểm thi đua</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: 'Đúng giờ', pts: '+5', Icon: MapPin },
            { label: 'Checklist', pts: '+10', Icon: ClipboardCheck },
            { label: 'Bàn giao', pts: '+15', Icon: ArrowLeftRight },
            { label: 'Thưởng nóng', pts: '+20', Icon: Star },
            { label: 'Đi trễ', pts: '-10', Icon: Clock },
            { label: 'Phạt lỗi', pts: '-15', Icon: AlertTriangle },
          ].map((item, i) => (
            <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold ${item.pts.startsWith('+') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/40' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200/50 dark:border-rose-900/40'}`}>
              <item.Icon size={12} />
              <span>{item.label}</span>
              <span className="font-mono tabular-nums font-black">{item.pts}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Tabs */}
      {/* Tabs */}
      <div className="flex bg-[var(--kg-surface)] border border-[var(--kg-border)] p-1.5 rounded-2xl shadow-xs gap-1.5">
        {[
          { id: 'wallet', label: 'Lịch sử', icon: History },
          { id: 'leaderboard', label: 'Bảng vàng', icon: Trophy },
          { id: 'shop', label: 'Cửa hàng', icon: Gift },
        ].map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-95 select-none ${
                isSelected 
                  ? 'bg-[var(--kg-primary)] text-white shadow-xs scale-[1.01]' 
                  : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
              }`}
            >
              <tab.icon size={15} className={isSelected ? 'text-white' : 'opacity-80'} />
              <span>{tab.label}</span>
              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)] ml-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16 }}
      >
        {/* TAB 1: LỊCH SỬ */}
        {activeTab === 'wallet' && (
          <div className="space-y-4">
            <h3 className="font-bold text-[var(--kg-text)] flex items-center gap-2">
              <History size={18} className="text-[var(--kg-primary)]" /> Lịch sử nhận điểm
            </h3>
            
            {loading ? (
              <div className="flex items-center justify-center py-12 text-[var(--kg-text-muted)]">
                <RefreshCw size={20} className="animate-spin mr-2" /> Đang tải...
              </div>
            ) : coinHistory.length === 0 ? (
              <div className="soft3d-card p-8 text-center">
                <Award size={40} className="mx-auto mb-3 text-[var(--kg-text-soft)]" />
                <p className="text-sm font-semibold text-[var(--kg-text-muted)]">Chưa có lịch sử điểm nào.</p>
                <p className="text-xs text-[var(--kg-text-soft)] mt-1">Hãy chấm công đúng giờ và hoàn thành checklist để tích điểm!</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {coinHistory.map((item) => (
                  <div key={item.id} className="soft3d-card p-3.5 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        item.points > 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      }`}>
                        {renderSourceIcon(item.source)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-[var(--kg-text)] truncate">{item.action}</p>
                        <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">{item.date} • {item.source}</p>
                      </div>
                    </div>
                    <span className={`font-mono tabular-nums font-black text-sm flex-shrink-0 ml-2 inline-flex items-center gap-1 ${item.points > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {item.points > 0 ? '+' : ''}{item.points} <Coins size={14} className="text-amber-500" />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-4">
            <div className="bg-[var(--kg-surface)] p-5 rounded-2xl border border-[var(--kg-border)] text-center shadow-2xs space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto mb-1">
                <Trophy size={24} />
              </div>
              <h3 className="font-black text-base sm:text-lg text-[var(--kg-text)]">
                Bảng Vàng Chuyên Cần &amp; Đồng Đội Tin Cậy
              </h3>
              <p className="text-xs sm:text-sm text-[var(--kg-text-muted)] font-medium">
                Tôn vinh đóng góp tích cực từ chấm công đúng giờ, checklist chuẩn, bàn giao ca và đào tạo SOP (chỉ ghi nhận thành tích dương).
              </p>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-semibold text-[var(--kg-text)]">
                <Sparkles size={13} className="text-amber-500 shrink-0" />
                <span>{healthyRanking.encouragementMessage}</span>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-[var(--kg-text-muted)]">
                <RefreshCw size={20} className="animate-spin mr-2" /> Đang tải...
              </div>
            ) : healthyRanking.entries.length === 0 ? (
              <div className="soft3d-card p-8 text-center">
                <Trophy size={40} className="mx-auto mb-3 text-[var(--kg-text-soft)]" />
                <p className="text-sm text-[var(--kg-text-muted)]">Chưa có thành viên nào trên Bảng Vàng kỳ này.</p>
              </div>
            ) : (
              <div className="soft3d-card overflow-hidden">
                {healthyRanking.entries.map((user) => {
                  const isMe = user.username === currentUser?.username;
                  return (
                    <div key={user.username} className={`flex items-center p-4 border-b border-[var(--kg-border)] last:border-0 ${isMe ? 'bg-[var(--kg-primary-soft)]' : ''}`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono tabular-nums font-bold text-sm mr-3 flex-shrink-0 ${
                        user.rank === 1 ? 'bg-amber-400 text-amber-950 shadow-2xs' :
                        user.rank === 2 ? 'bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100' :
                        user.rank === 3 ? 'bg-amber-600 text-white' : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)]'
                      }`}>
                        {user.rank === 1 ? <Crown size={16} /> : user.rank <= 3 ? <Medal size={16} /> : user.rank}
                      </div>
                      <div className="flex-1 min-w-0 pr-2">
                        <p className={`font-bold text-sm truncate ${isMe ? 'text-[var(--kg-primary)]' : 'text-[var(--kg-text)]'}`}>
                          {user.fullname} {isMe && '(Bạn)'}
                        </p>
                        <span className={`inline-block mt-0.5 text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                          user.badgeLabel === 'Ngôi Sao Chuẩn Mực'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : user.badgeLabel === 'Đồng Đội Tin Cậy'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                        }`}>
                          {user.badgeLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono tabular-nums font-black text-[var(--kg-text)] flex-shrink-0 text-right">
                        +{user.totalPoints} <Coins size={15} className="text-amber-500" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CỬA HÀNG */}
        {activeTab === 'shop' && (
          <div className="space-y-4">
            <h3 className="font-bold text-[var(--kg-text)] flex items-center gap-2">
              <Gift size={18} className="text-[var(--kg-accent)]" /> Quà tặng hiện có
            </h3>

            <div className="grid grid-cols-2 gap-3.5">
              {[
                { name: 'Voucher Trà Sữa Phúc Long', cost: 150, Icon: Coffee, badgeBg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
                { name: '1 Ngày Nghỉ Phép', cost: 500, Icon: CalendarCheck, badgeBg: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
                { name: 'Voucher 100k Tiền mặt', cost: 1000, Icon: Banknote, badgeBg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
                { name: "Balo King's Grill", cost: 800, Icon: ShoppingBag, badgeBg: 'bg-[var(--kg-accent-soft)] text-[var(--kg-accent)]' },
              ].map((item, idx) => (
                <div key={idx} className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 flex flex-col shadow-2xs">
                  <div className={`w-12 h-12 rounded-2xl ${item.badgeBg} flex items-center justify-center mx-auto mb-3 mt-1`}>
                    <item.Icon size={24} />
                  </div>
                  <h4 className="font-bold text-xs sm:text-sm text-[var(--kg-text)] text-center mb-3 line-clamp-2 min-h-[36px]">{item.name}</h4>
                  <div className="mt-auto">
                    <button 
                      type="button"
                      onClick={() => handleRedeem(item.name, item.cost)}
                      className={`w-full py-2.5 rounded-xl text-xs font-mono tabular-nums font-black transition-all inline-flex items-center justify-center gap-1.5 ${
                        totalPoints >= item.cost 
                          ? 'bg-[var(--kg-primary)] text-white hover:bg-[var(--kg-primary-hover)]' 
                          : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-soft)] border border-[var(--kg-border)] cursor-not-allowed'
                      }`}
                    >
                      <span>{item.cost}</span>
                      <Coins size={13} className={totalPoints >= item.cost ? 'text-amber-300' : 'text-[var(--kg-text-soft)]'} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="bg-[var(--kg-primary-soft)] p-4 rounded-xl border border-[var(--kg-primary)]/20 flex items-start gap-3 mt-4">
              <AlertCircle size={18} className="text-[var(--kg-primary)] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--kg-text)] font-medium leading-relaxed">
                Khi đổi quà thành công, Quản lý sẽ nhận được thông báo và liên hệ để trao phần thưởng cho bạn trực tiếp tại quán.
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
