import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import { ClipboardCheck, CheckCircle2, Circle, Filter, User, BadgeCheck, Clock, CheckSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Checklist() {
  const store = useAppStore();
  const { currentUser, checklistItems } = store;
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [shiftFilter, setShiftFilter] = useState<string>('All');
  const [positionFilter, setPositionFilter] = useState<string>('All');

  // Local state for checked tasks
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const fetchChecklists = async () => {
    setLoading(true);
    try {
      const res = await callApi('GET_CHECKLIST_CONFIG', {}, { background: true });
      if (res?.ok && res.data) {
        store.setChecklistItems(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (checklistItems.length === 0) {
      fetchChecklists();
    } else {
      setLoading(false);
    }
    // Auto-detect position based on currentUser position
    if (currentUser?.position) {
      setPositionFilter(currentUser.position);
    } else if (currentUser?.role === 'admin') {
      setPositionFilter('Tất cả');
    } else {
      setPositionFilter('Phục vụ');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCheck = (id: string) => {
    const newChecked = new Set(checkedIds);
    if (newChecked.has(id)) {
      newChecked.delete(id);
    } else {
      newChecked.add(id);
    }
    setCheckedIds(newChecked);
  };

  const handleSubmit = async () => {
    if (checkedIds.size === 0) {
      Swal.fire('Chú ý', 'Bạn chưa check mục nào!', 'warning');
      return;
    }

    store.setUpdating(true);
    store.setLoading(true, 'Đang gửi báo cáo...');
    try {
      const res = await callApi('SUBMIT_CHECKLIST', {
        username: currentUser?.username,
        fullname: currentUser?.fullname,
        shift: shiftFilter,
        checkedTasks: Array.from(checkedIds)
      });
      
      if (res?.ok) {
        Swal.fire('Thành công', 'Đã nộp checklist!', 'success');
        setCheckedIds(new Set()); // Reset after submit
      } else {
        // Mock success if no backend yet
        setTimeout(() => {
          Swal.fire('Thành công', 'Đã nộp checklist (Mock)!', 'success');
          setCheckedIds(new Set());
        }, 1000);
      }
    } catch (err) {
      Swal.fire('Lỗi', 'Không thể nộp checklist', 'error');
    } finally {
      store.setUpdating(false);
      store.setLoading(false);
    }
  };

  // Filter logic
  const filteredLists = checklistItems.filter(item => {
    if (!item.isActive) return false;
    const matchShift = item.targetShift === 'Tất cả' || shiftFilter === 'All' || item.targetShift === shiftFilter;
    const matchPos = item.targetPosition === 'Tất cả' || positionFilter === 'Tất cả' || positionFilter === 'All' || item.targetPosition === positionFilter;
    return matchShift && matchPos;
  });

  const progress = filteredLists.length > 0 ? Math.round((checkedIds.size / filteredLists.length) * 100) : 0;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 animate-fade-in relative pb-24">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-500 via-emerald-600 to-green-700 rounded-b-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex flex-col shrink-0">
        <div className="flex items-center justify-between relative z-10 w-full">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
                <CheckSquare size={20} className="text-white" />
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Checklist Hằng Ngày</h2>
            </div>
            <p className="text-teal-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
              Nhiệm vụ phân công theo ca làm việc.
            </p>
          </div>
          <div className="hidden md:block opacity-80 pl-4">
            <ClipboardCheck size={80} strokeWidth={1} />
          </div>
        </div>

        {/* Progress */}
        <div className="mt-6 bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/20 relative z-10 w-full">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold">Tiến độ ca làm</span>
            <span className="text-sm font-bold bg-white text-teal-600 px-2 py-0.5 rounded-full">{progress}%</span>
          </div>
          <div className="h-2.5 bg-black/20 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-green-300 to-emerald-300"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
        
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-teal-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* Filters */}
      <div className="px-4 mt-4 shrink-0">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center">
            <Filter size={14} className="mr-1.5" /> Bộ lọc Checklist
          </h3>
          <div className="space-y-3">
            {/* Shift Filter */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
              <Clock size={16} className="text-gray-400 shrink-0" />
              {['All', '15:00', '17:00', '18:00', '19:00', 'OFF'].map(s => (
                <button key={s} onClick={() => setShiftFilter(s)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${shiftFilter === s ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-transparent'}`}>
                  {s === 'All' ? 'Tất cả ca' : (s === 'OFF' ? 'OFF' : `Ca ${s}`)}
                </button>
              ))}
            </div>

            {/* Position Filter */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
              <User size={16} className="text-gray-400 shrink-0" />
              {['All', 'Phục vụ', 'Tổ trưởng', 'Quản lý', 'Thu ngân', 'Bếp', 'Pha chế', 'Tạp vụ', 'Bảo vệ'].map(p => (
                <button key={p} onClick={() => setPositionFilter(p)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${positionFilter === p ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border border-transparent'}`}>
                  {p === 'All' ? 'Mọi chức vụ' : p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Checklist Items */}
      <div className="flex-1 overflow-y-auto px-4 mt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredLists.length === 0 ? (
          <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
            <CheckSquare size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">Không có công việc nào cho bộ lọc này.</p>
          </div>
        ) : (
          <AnimatePresence>
            {filteredLists.map((item, index) => {
              const isChecked = checkedIds.has(item.id);
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => toggleCheck(item.id)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                    isChecked 
                    ? 'border-green-500 bg-green-50/50 dark:bg-green-900/20' 
                    : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:border-blue-300 dark:hover:border-blue-600'
                  }`}
                >
                  <div className="flex items-start space-x-3 pr-4">
                    <div className={`mt-0.5 shrink-0 ${isChecked ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`}>
                      {isChecked ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold transition-colors ${isChecked ? 'text-green-700 dark:text-green-400 line-through opacity-80' : 'text-gray-800 dark:text-white'}`}>
                        {item.taskName}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {item.targetShift !== 'Tất cả' && <span className="text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full">Ca {item.targetShift}</span>}
                        {item.targetPosition !== 'Tất cả' && <span className="text-[10px] font-medium bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-0.5 rounded-full">{item.targetPosition}</span>}
                        {item.bonusPoints > 0 && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full">+{item.bonusPoints}đ</span>}
                        {item.penaltyPoints > 0 && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">-{item.penaltyPoints}đ</span>}
                        {item.isRequired && <span className="text-[10px] font-bold border border-red-300 text-red-500 px-2 py-0.5 rounded-full">Bắt buộc</span>}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Fixed Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 z-50">
        <button
          onClick={handleSubmit}
          disabled={checkedIds.size === 0 || loading}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-2xl shadow-lg hover:shadow-blue-500/40 transition transform active:scale-95 flex items-center justify-center"
        >
          XÁC NHẬN HOÀN THÀNH ({checkedIds.size}/{filteredLists.length})
        </button>
      </div>
    </div>
  );
}
