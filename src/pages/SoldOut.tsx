import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { UtensilsCrossed, Plus, Search, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SoldOut() {
  const store = useAppStore();
  const { currentUser, soldOutItems } = store;
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchSoldOut = async () => {
    setLoading(true);
    try {
      const res = await callApi('GET_SOLDOUT', {}, { background: true });
      if (res?.ok && res.data) {
        // Reverse to show newest first
        store.setSoldOutItems(res.data.reverse());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSoldOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    store.setUpdating(true);
    store.setLoading(true, 'Đang ghi nhận...');
    try {
      const res = await callApi('ADD_SOLDOUT', {
        itemName: newItemName.trim(),
        reportedBy: currentUser?.fullname || 'Nhân viên'
      });
      if (res?.ok) {
        setNewItemName('');
        setIsAdding(false);
        fetchSoldOut();
      } else {
        alert(res?.message || 'Có lỗi xảy ra');
      }
    } catch (err) {
      alert('Không thể kết nối máy chủ');
    } finally {
      store.setUpdating(false);
      store.setLoading(false);
    }
  };

  const handleRemove = async (id: string, itemName: string) => {
    if (!confirm(`Xác nhận món "${itemName}" ĐÃ CÓ LẠI?`)) return;
    
    store.setUpdating(true);
    store.setLoading(true, 'Đang cập nhật...');
    try {
      const res = await callApi('REMOVE_SOLDOUT', { id });
      if (res?.ok) {
        fetchSoldOut();
      } else {
        alert(res?.message || 'Có lỗi xảy ra');
      }
    } catch (err) {
      alert('Không thể kết nối máy chủ');
    } finally {
      store.setUpdating(false);
      store.setLoading(false);
    }
  };

  const filteredItems = soldOutItems.filter(item => 
    item.itemName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 pb-20">
      <div className="p-4 animate-slide-up">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-red-500 via-rose-500 to-red-700 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between mb-6 shrink-0">
          <div className="relative z-10">
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
                <UtensilsCrossed size={20} className="text-white" />
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Món hết (86)</h2>
            </div>
            <p className="text-red-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
              Cập nhật tình trạng nguyên liệu.
            </p>
          </div>
          <div className="hidden md:block opacity-80 pl-4 relative z-10">
            <UtensilsCrossed size={80} strokeWidth={1} />
          </div>

          {/* Background Decorations */}
          <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
          <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-red-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 w-full mb-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm món đang hết..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-800 dark:text-white focus:ring-2 focus:ring-red-500 transition outline-none shadow-sm"
            />
          </div>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center space-x-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition shadow-sm whitespace-nowrap"
          >
            <Plus size={18} className="mr-1" />
            <span>Báo hết</span>
          </button>
        </div>
      </div>

      {/* Add Form Dropdown */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 shadow-sm"
          >
            <form onSubmit={handleAdd} className="p-4">
              <p className="text-sm text-gray-600 dark:text-gray-300 font-medium mb-2">Nhập tên món vừa hết nguyên liệu:</p>
              <div className="flex space-x-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="VD: Trà đào cam sả..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={!newItemName.trim() || store.isUpdating}
                  className="bg-gray-800 hover:bg-gray-900 disabled:bg-gray-400 dark:bg-white dark:hover:bg-gray-200 dark:disabled:bg-gray-600 dark:text-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow-sm whitespace-nowrap"
                >
                  Xác nhận
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-3">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-red-500 rounded-full animate-spin"></div>
            <p className="text-sm text-gray-500">Đang tải dữ liệu...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center opacity-70">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
              <CheckCircle2 size={32} className="text-green-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 font-medium">Hiện tại không có món nào hết.</p>
            <p className="text-xs text-gray-500 mt-1">Đầy đủ nguyên liệu sẵn sàng phục vụ!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AnimatePresence>
              {filteredItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-red-100 dark:border-red-900/30 flex flex-col relative overflow-hidden"
                >
                  {/* Decorative stripe */}
                  <div className="absolute top-0 left-0 bottom-0 w-1 bg-red-500"></div>
                  
                  <div className="flex justify-between items-start pl-2">
                    <div className="flex-1 pr-2">
                      <h3 className="font-bold text-gray-800 dark:text-white text-base leading-tight mb-1">{item.itemName}</h3>
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-2 space-x-3">
                        <span className="flex items-center"><Clock size={12} className="mr-1" /> {item.reportedAt}</span>
                        <span className="font-medium bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-[10px]">
                          Báo bởi: {item.reportedBy}
                        </span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleRemove(item.id, item.itemName)}
                      className="w-8 h-8 rounded-full bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 flex items-center justify-center transition flex-shrink-0"
                      title="Đã có hàng lại"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
