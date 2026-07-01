import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import { BarChart3, Users, Clock, CheckCircle2, AlertTriangle, Trophy, GraduationCap, MessageSquare, RefreshCw, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
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
  const { currentUser } = useAppStore();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const res = await callApi('GET_ANALYTICS', { username: currentUser?.username, role: currentUser?.role }, { background: true });
      if (res?.ok) setData(res.data);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <RefreshCw size={24} className="animate-spin mr-3" /> Đang tải thống kê...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-gray-500">Không thể tải dữ liệu thống kê.</div>
    );
  }

  const validRate = data.checkinStats.total > 0 ? Math.round((data.checkinStats.valid / data.checkinStats.total) * 100) : 0;
  const lateRate = data.checkinStats.total > 0 ? Math.round((data.checkinStats.late / data.checkinStats.total) * 100) : 0;
  const maxCheckin = Math.max(...data.dailyCheckins.map(d => d.checkins), 1);
  const moodLabels: Record<string, string> = { '1': '😢', '2': '😕', '3': '😐', '4': '🙂', '5': '😄' };
  const totalMoods = Object.values(data.moodDistribution).reduce((a, b) => a + b, 0);

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-20">
      <KgModuleHero
        moduleId="analytics"
        title="Thống kê & Báo cáo"
        description="Tổng hợp dữ liệu hoạt động, chấm công, checklist và lương thưởng 30 ngày gần nhất."
        eyebrow="Quản lý"
      />


      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Tổng chấm công', value: data.checkinStats.total, icon: Users, color: 'from-blue-500 to-cyan-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Hợp lệ', value: `${validRate}%`, icon: CheckCircle2, color: 'from-green-500 to-emerald-500', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Đi trễ', value: `${data.checkinStats.late}`, icon: AlertTriangle, color: 'from-red-500 to-orange-500', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Checklist hôm nay', value: `${data.checklistRate}%`, icon: CheckCircle2, color: 'from-purple-500 to-pink-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
        ].map((kpi, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className={`soft3d-card p-4 ${kpi.bg}`}
          >
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center mb-2`}>
              <kpi.icon size={14} className="text-white" />
            </div>
            <p className="text-2xl font-black text-gray-800 dark:text-white">{kpi.value}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mt-0.5">{kpi.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Daily Check-in Chart */}
      <div className="soft3d-card p-4">
        <h3 className="font-bold text-sm text-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <BarChart3 size={16} className="text-indigo-500" /> Chấm công 14 ngày gần nhất
        </h3>
        {data.dailyCheckins.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Chưa có dữ liệu</p>
        ) : (
          <div className="flex items-end gap-1 h-32 overflow-x-auto">
            {data.dailyCheckins.map((day, idx) => {
              const height = Math.max(8, (day.checkins / maxCheckin) * 100);
              const lateHeight = day.late > 0 ? Math.max(4, (day.late / maxCheckin) * 100) : 0;
              const shortDate = day.date.split('/').slice(0, 2).join('/');
              return (
                <div key={idx} className="flex flex-col items-center flex-1 min-w-[28px]">
                  <span className="text-[9px] text-gray-500 font-bold mb-1">{day.checkins}</span>
                  <div className="relative w-full flex flex-col items-center">
                    <div
                      className="w-5 rounded-t-md bg-gradient-to-t from-indigo-500 to-blue-400 transition-all"
                      style={{ height: `${height}%`, minHeight: '4px' }}
                    />
                    {lateHeight > 0 && (
                      <div
                        className="w-5 bg-red-400 rounded-b-sm"
                        style={{ height: `${lateHeight}%`, minHeight: '2px' }}
                      />
                    )}
                  </div>
                  <span className="text-[8px] text-gray-400 mt-1 font-medium">{shortDate}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block"></span> Tổng</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block"></span> Trễ</span>
        </div>
      </div>

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Late Employees */}
        <div className="soft3d-card p-4">
          <h3 className="font-bold text-sm text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" /> Top đi trễ
          </h3>
          {data.topLateEmployees.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">🎉 Không ai đi trễ!</p>
          ) : (
            <div className="space-y-2">
              {data.topLateEmployees.map((emp, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-red-50/50 dark:bg-red-900/10">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0 ${
                      idx === 0 ? 'bg-red-500 text-white' : 'bg-red-100 text-red-600 dark:bg-red-900/30'
                    }`}>{idx + 1}</span>
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{emp.name}</span>
                  </div>
                  <span className="text-sm font-black text-red-500 flex-shrink-0">{emp.count} lần</span>
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
                    <span className="text-sm flex-shrink-0">{idx < 3 ? ['👑', '🥈', '🥉'][idx] : `#${idx + 1}`}</span>
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200 truncate">{emp.name}</span>
                  </div>
                  <span className="text-sm font-black text-amber-600 flex-shrink-0">{emp.points} 🪙</span>
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
            <p className="text-3xl font-black text-gray-800 dark:text-white">{data.trainingCompletion.completed}</p>
            <p className="text-[10px] text-gray-500 font-bold uppercase mt-1">Lượt hoàn thành / {data.trainingCompletion.total} bài</p>
          </div>
        </div>

        {/* Feedback */}
        <div className="soft3d-card p-4">
          <h3 className="font-bold text-sm text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            <MessageSquare size={16} className="text-purple-500" /> Góp ý
          </h3>
          <div className="flex items-center justify-around py-2">
            <div className="text-center">
              <p className="text-2xl font-black text-amber-500">{data.feedbackStats.pending}</p>
              <p className="text-[9px] text-gray-500 font-bold uppercase">Chờ xử lý</p>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700"></div>
            <div className="text-center">
              <p className="text-2xl font-black text-green-500">{data.feedbackStats.resolved}</p>
              <p className="text-[9px] text-gray-500 font-bold uppercase">Đã trả lời</p>
            </div>
          </div>
        </div>

        {/* Mood */}
        <div className="soft3d-card p-4">
          <h3 className="font-bold text-sm text-gray-800 dark:text-white mb-3 flex items-center gap-2">
            <span>😊</span> Tâm trạng NV
          </h3>
          {totalMoods === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">Chưa có khảo sát</p>
          ) : (
            <div className="flex items-end justify-around h-16">
              {Object.entries(data.moodDistribution).map(([key, count]) => {
                const pct = totalMoods > 0 ? Math.max(8, (count / totalMoods) * 100) : 0;
                return (
                  <div key={key} className="flex flex-col items-center">
                    <span className="text-[9px] font-bold text-gray-500 mb-0.5">{count}</span>
                    <div className="w-5 bg-gradient-to-t from-purple-400 to-pink-400 rounded-t-md" style={{ height: `${pct}%`, minHeight: '4px' }} />
                    <span className="text-sm mt-1">{moodLabels[key] || key}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Extra Info */}
      <div className="soft3d-card p-4 flex items-center gap-3 bg-blue-50/50 dark:bg-blue-900/10">
        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
          <Clock size={14} className="text-blue-500" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-800 dark:text-gray-200">Bàn giao ca hôm nay</p>
          <p className="text-[10px] text-gray-500">{data.handoverRate} lượt bàn giao đã ghi nhận</p>
        </div>
      </div>
    </div>
  );
}
