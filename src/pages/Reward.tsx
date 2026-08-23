import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { Award, Star, Gift, Trophy, Crown, AlertCircle, History, RefreshCw, Sparkles } from 'lucide-react';
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
  const store = useAppStore();
  const { currentUser } = store;
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

  // Find user rank
  const myRank = leaderboard.find(u => u.username === currentUser?.username)?.rank || '-';

  const handleRedeem = (itemName: string, cost: number) => {
    if (totalPoints >= cost) {
      Swal.fire({
        title: 'Xác nhận đổi quà',
        html: `Bạn sẽ dùng <b>${cost} 🪙</b> để đổi lấy:<br/><br/><span class="text-lg font-bold text-ocean-600">${itemName}</span>`,
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
      Swal.fire('Không đủ điểm', `Bạn cần thêm ${cost - totalPoints} 🪙 nữa để đổi món quà này.`, 'error');
    }
  };

  const sourceIcon = (source: string) => {
    switch (source) {
      case 'CheckIn': return '📍';
      case 'Checklist': return '📋';
      case 'Handover': return '🔄';
      case 'Discipline': return '⚖️';
      default: return '🪙';
    }
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-20">
      
      <KgModuleHero
        moduleId="reward"
        title="King Coins"
        description="Tích điểm từ mọi hoạt động chấm công, checklist công việc, bàn giao ca."
        eyebrow="Phần thưởng"
      />

      {/* Points Card */}
      <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white rounded-2xl md:rounded-3xl p-5 md:p-6 border border-white/15 flex items-center justify-between relative z-10 w-full shadow-lg mb-4">
        <div>
          <p className="text-[10px] sm:text-xs text-white/80 font-black mb-1 uppercase tracking-wider">King Coins khả dụng</p>
          <div className="flex items-end gap-2">
            <span className="text-3xl sm:text-4xl font-black leading-none">{loading ? '...' : totalPoints}</span>
            <span className="text-base sm:text-lg font-bold text-yellow-200 mb-0.5">🪙</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="bg-white/15 rounded-2xl px-3.5 py-1.5 sm:px-4 sm:py-2 text-center border border-white/10 shadow-inner">
            <p className="text-[9px] sm:text-[10px] text-white/75 font-black uppercase tracking-wider">Hạng</p>
            <p className="text-lg sm:text-xl font-black leading-tight">{loading ? '-' : myRank}</p>
          </div>
          <button 
            type="button"
            onClick={() => setActiveTab('shop')}
            className="bg-white text-orange-600 hover:bg-orange-50 font-black px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl text-xs sm:text-sm shadow-md active:scale-95 transition-all"
          >
            Đổi quà
          </button>
        </div>
      </div>

      {/* Points Source Guide */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3.5 shadow-xs">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-amber-500" />
          <span className="text-xs font-black text-[var(--kg-text)]">Cơ chế tích điểm thi đua</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: 'Đúng giờ', pts: '+5', icon: '📍' },
            { label: 'Checklist', pts: '+10', icon: '📋' },
            { label: 'Bàn giao', pts: '+15', icon: '🔄' },
            { label: 'Thưởng nóng', pts: '+20', icon: '⭐' },
            { label: 'Đi trễ', pts: '-10', icon: '⏰' },
            { label: 'Phạt lỗi', pts: '-15', icon: '⚠️' },
          ].map((item, i) => (
            <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black ${item.pts.startsWith('+') ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/40 dark:border-emerald-900/30' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200/40 dark:border-rose-900/30'}`}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
              <span className="font-black">{item.pts}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex bg-[var(--kg-surface)] border border-[var(--kg-border)] p-1 rounded-2xl shadow-xs">
        {[
          { id: 'wallet', label: 'Lịch sử', icon: History },
          { id: 'leaderboard', label: 'Bảng vàng', icon: Trophy },
          { id: 'shop', label: 'Cửa hàng', icon: Gift },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-xs sm:text-sm transition-all active:scale-95 ${
              activeTab === tab.id 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm font-black' 
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
            }`}
          >
            <tab.icon size={15} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* TAB 1: LỊCH SỬ */}
        {activeTab === 'wallet' && (
          <div className="space-y-4">
            <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <History size={18} className="text-ocean-500" /> Lịch sử nhận điểm
            </h3>
            
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw size={20} className="animate-spin mr-2" /> Đang tải...
              </div>
            ) : coinHistory.length === 0 ? (
              <div className="soft3d-card p-8 text-center">
                <Award size={40} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500">Chưa có lịch sử điểm nào.</p>
                <p className="text-xs text-gray-400 mt-1">Hãy chấm công đúng giờ và hoàn thành checklist để tích điểm!</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {coinHistory.map((item) => (
                  <div key={item.id} className="soft3d-card p-3.5 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
                        item.points > 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
                      }`}>
                        {sourceIcon(item.source)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-gray-800 dark:text-gray-200 truncate">{item.action}</p>
                        <p className="text-[10px] text-gray-500">{item.date} • {item.source}</p>
                      </div>
                    </div>
                    <span className={`font-black text-sm flex-shrink-0 ml-2 ${item.points > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {item.points > 0 ? '+' : ''}{item.points} 🪙
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
            <div className="bg-gradient-to-br from-yellow-100 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/10 p-5 rounded-3xl border border-yellow-200 dark:border-yellow-800/50 text-center">
              <Trophy size={40} className="text-yellow-500 mx-auto mb-2" />
              <h3 className="font-black text-lg text-yellow-800 dark:text-yellow-500 mb-1">Bảng Xếp Hạng King Coins</h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-600 font-medium">Tích điểm qua chấm công, checklist, bàn giao ca!</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw size={20} className="animate-spin mr-2" /> Đang tải...
              </div>
            ) : leaderboard.length === 0 ? (
              <div className="soft3d-card p-8 text-center">
                <Trophy size={40} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500">Chưa có dữ liệu xếp hạng.</p>
              </div>
            ) : (
              <div className="soft3d-card overflow-hidden">
                {leaderboard.map((user) => {
                  const isMe = user.username === currentUser?.username;
                  return (
                    <div key={user.username} className={`flex items-center p-4 border-b border-gray-50 dark:border-gray-700 last:border-0 ${isMe ? 'bg-ocean-50 dark:bg-ocean-900/20' : ''}`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm mr-3 flex-shrink-0 ${
                        user.rank === 1 ? 'bg-yellow-400 text-yellow-900 shadow-md' :
                        user.rank === 2 ? 'bg-gray-300 text-gray-800' :
                        user.rank === 3 ? 'bg-amber-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                      }`}>
                        {user.rank <= 3 ? ['👑', '🥈', '🥉'][user.rank - 1] : user.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-sm truncate ${isMe ? 'text-ocean-700 dark:text-ocean-400' : 'text-gray-800 dark:text-gray-200'}`}>
                          {user.fullname} {isMe && '(Bạn)'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 font-black text-gray-700 dark:text-gray-300 flex-shrink-0">
                        {user.totalPoints} <span className="text-sm">🪙</span>
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
            <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <Gift size={18} className="text-purple-500" /> Quà tặng hiện có
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {[
                { name: 'Voucher Trà Sữa Phúc Long', cost: 150, image: '🥤', color: 'from-green-100 to-green-50' },
                { name: '1 Ngày Nghỉ Phép', cost: 500, image: '🏖️', color: 'from-blue-100 to-blue-50' },
                { name: 'Voucher 100k Tiền mặt', cost: 1000, image: '💵', color: 'from-yellow-100 to-yellow-50' },
                { name: "Balo King's Grill", cost: 800, image: '🎒', color: 'from-purple-100 to-purple-50' },
              ].map((item, idx) => (
                <div key={idx} className={`bg-gradient-to-b ${item.color} dark:from-gray-800 dark:to-gray-800 rounded-2xl p-4 flex flex-col`}>
                  <div className="text-4xl text-center mb-3 mt-2 filter drop-shadow-md">{item.image}</div>
                  <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200 text-center mb-2 line-clamp-2 min-h-[32px]">{item.name}</h4>
                  <div className="mt-auto">
                    <button 
                      onClick={() => handleRedeem(item.name, item.cost)}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${
                        totalPoints >= item.cost 
                          ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900' 
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700'
                      }`}
                    >
                      {item.cost} 🪙
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50 flex items-start gap-3 mt-4">
              <AlertCircle size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-400 font-medium leading-relaxed">
                Khi đổi quà thành công, Quản lý sẽ nhận được thông báo và liên hệ để trao phần thưởng cho bạn trực tiếp tại quán.
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
