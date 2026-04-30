import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Award, Star, Gift, Trophy, Crown, CheckCircle2, AlertCircle, History } from 'lucide-react';
import Swal from 'sweetalert2';
import { motion } from 'framer-motion';

export default function Reward() {
  const store = useAppStore();
  const { currentUser } = store;
  const [points, setPoints] = useState(450); // Mock data cho Phase này
  const [activeTab, setActiveTab] = useState<'wallet' | 'leaderboard' | 'shop'>('wallet');

  // Khảo sát & Gamification: Thưởng sao khi xem thành tích
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (activeTab === 'wallet') {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
  }, [activeTab]);

  const handleRedeem = (itemName: string, cost: number) => {
    if (points >= cost) {
      Swal.fire({
        title: 'Xác nhận đổi quà',
        html: `Bạn sẽ dùng <b>${cost} Points</b> để đổi lấy:<br/><br/><span class="text-lg font-bold text-ocean-600">${itemName}</span>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Xác nhận đổi',
        cancelButtonText: 'Hủy'
      }).then((result) => {
        if (result.isConfirmed) {
          setPoints(p => p - cost);
          Swal.fire('Thành công!', 'Yêu cầu đổi quà đã được gửi cho Quản lý.', 'success');
        }
      });
    } else {
      Swal.fire('Không đủ điểm', `Bạn cần thêm ${cost - points} Points nữa để đổi món quà này.`, 'error');
    }
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-20">
      
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex flex-col mb-6">
        <div className="flex items-center justify-between relative z-10 w-full">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
                <Gift size={20} className="text-white" />
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Khen thưởng</h2>
            </div>
            <p className="text-amber-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
              Tuyên dương nhân sự xuất sắc.
            </p>
          </div>
          <div className="hidden md:block opacity-80 pl-4 relative z-10">
            <Trophy size={80} strokeWidth={1} />
          </div>
        </div>

        {/* Points Card */}
        <div className="mt-6 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex items-center justify-between relative z-10 w-full shadow-inner">
          <div>
            <p className="text-xs text-white/90 font-medium mb-1 uppercase tracking-wider">King's Points</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-black leading-none">{points}</span>
              <span className="text-sm font-bold text-yellow-200 mb-1">🌟</span>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('shop')}
            className="bg-white text-orange-600 hover:bg-orange-50 font-bold px-4 py-2 rounded-xl text-sm shadow-md active:scale-95 transition-all"
          >
            Đổi quà
          </button>
        </div>
        
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-yellow-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-2 bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl">
        {[
          { id: 'wallet', label: 'Ví điểm', icon: Award },
          { id: 'leaderboard', label: 'Bảng vàng', icon: Trophy },
          { id: 'shop', label: 'Cửa hàng', icon: Gift },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.id 
                ? 'bg-white dark:bg-gray-700 text-ocean-600 dark:text-ocean-400 shadow-sm' 
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
            }`}
          >
            <tab.icon size={16} />
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
        {/* TAB 1: VÍ ĐIỂM */}
        {activeTab === 'wallet' && (
          <div className="space-y-4">
            <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <History size={18} className="text-ocean-500" /> Lịch sử nhận điểm
            </h3>
            
            <div className="space-y-3">
              {[
                { title: 'Thưởng chuyên cần tháng 3', time: '10/04/2026', pts: '+200', type: 'bonus' },
                { title: 'Hoàn thành Checklist Mở quán 100%', time: '09/04/2026', pts: '+10', type: 'task' },
                { title: 'Khách hàng đánh giá tốt', time: '05/04/2026', pts: '+50', type: 'bonus' },
                { title: 'Đổi Voucher Trà sữa', time: '01/04/2026', pts: '-150', type: 'spend' },
              ].map((item, idx) => (
                <div key={idx} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      item.type === 'bonus' ? 'bg-green-100 text-green-600' : 
                      item.type === 'task' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'
                    }`}>
                      {item.type === 'spend' ? <Gift size={18}/> : <Star size={18}/>}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-800 dark:text-gray-200">{item.title}</p>
                      <p className="text-xs text-gray-500">{item.time}</p>
                    </div>
                  </div>
                  <span className={`font-black ${item.pts.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                    {item.pts}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-yellow-100 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/10 p-5 rounded-3xl border border-yellow-200 dark:border-yellow-800/50 text-center">
              <Trophy size={40} className="text-yellow-500 mx-auto mb-2" />
              <h3 className="font-black text-lg text-yellow-800 dark:text-yellow-500 mb-1">Nhân Viên Xuất Sắc Tuần</h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-600 font-medium">Làm việc chăm chỉ để được vinh danh và nhận thưởng nhé!</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              {[
                { name: 'Nguyễn Văn A', pts: 1250, rank: 1 },
                { name: 'Lê Minh Sang', pts: 980, rank: 2 },
                { name: 'Trần Thị B', pts: 850, rank: 3 },
                { name: currentUser?.fullname || 'Bạn', pts: points, rank: 12 },
              ].map((user, idx) => (
                <div key={idx} className={`flex items-center p-4 border-b border-gray-50 dark:border-gray-700 last:border-0 ${user.rank === 12 ? 'bg-ocean-50 dark:bg-ocean-900/20' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mr-4 ${
                    user.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                    user.rank === 2 ? 'bg-gray-300 text-gray-800' :
                    user.rank === 3 ? 'bg-amber-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                  }`}>
                    {user.rank}
                  </div>
                  <div className="flex-1">
                    <p className={`font-bold text-sm ${user.rank === 12 ? 'text-ocean-700 dark:text-ocean-400' : 'text-gray-800 dark:text-gray-200'}`}>
                      {user.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 font-black text-gray-700 dark:text-gray-300">
                    {user.pts} <Star size={14} className="text-yellow-400" />
                  </div>
                </div>
              ))}
            </div>
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
                <div key={idx} className={`bg-gradient-to-b ${item.color} dark:from-gray-800 dark:to-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 flex flex-col shadow-sm`}>
                  <div className="text-4xl text-center mb-3 mt-2 filter drop-shadow-md">{item.image}</div>
                  <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200 text-center mb-2 line-clamp-2 min-h-[32px]">{item.name}</h4>
                  <div className="mt-auto">
                    <button 
                      onClick={() => handleRedeem(item.name, item.cost)}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition-all ${
                        points >= item.cost 
                          ? 'bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900' 
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700'
                      }`}
                    >
                      {item.cost} 🌟
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
