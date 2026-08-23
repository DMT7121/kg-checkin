import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { UtensilsCrossed, Plus, Search, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KgModuleHero } from '../components/KgDesignSystem';


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
    const itemName = newItemName.trim();
    if (!itemName) return;

    // Optimistic item
    const tempId = `temp_${Date.now()}`;
    const optimisticItem = {
      id: tempId,
      itemName,
      reportedBy: currentUser?.fullname || 'Nhân viên',
      reportedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };

    const previousItems = [...soldOutItems];
    store.setSoldOutItems([optimisticItem, ...previousItems]);
    setNewItemName('');
    setIsAdding(false);

    try {
      const res = await callApi('ADD_SOLDOUT', {
        itemName,
        reportedBy: currentUser?.fullname || 'Nhân viên'
      }, { background: true });
      
      if (res?.ok) {
        fetchSoldOut();
      } else {
        // Rollback on failure
        store.setSoldOutItems(previousItems);
        alert(res?.message || 'Không thể ghi nhận món hết');
      }
    } catch {
      store.setSoldOutItems(previousItems);
      alert('Lỗi kết nối máy chủ, đã hoàn tác');
    }
  };

  const handleRemove = async (id: string, itemName: string) => {
    if (!confirm(`Xác nhận món "${itemName}" ĐÃ CÓ LẠI?`)) return;
    
    const previousItems = [...soldOutItems];
    // Optimistically filter out
    store.setSoldOutItems(soldOutItems.filter(item => item.id !== id));

    try {
      const res = await callApi('REMOVE_SOLDOUT', { id }, { background: true });
      if (res?.ok) {
        fetchSoldOut();
      } else {
        store.setSoldOutItems(previousItems);
        alert(res?.message || 'Không thể cập nhật món');
      }
    } catch {
      store.setSoldOutItems(previousItems);
      alert('Lỗi kết nối máy chủ, đã hoàn tác');
    }
  };

  const filteredItems = soldOutItems.filter(item => 
    item.itemName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full space-y-4 pb-16 animate-fade-in">
      <KgModuleHero
        moduleId="soldout"
        title="Món Hết & Nguyên Liệu (86)"
        description="Cập nhật nhanh tình trạng món ăn, thức uống tạm hết để phục vụ order chuẩn xác."
        eyebrow="Vận hành"
        features={['Đồng bộ tức thì', 'Tự động báo Dashboard', 'Dễ dàng khôi phục']}
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-[var(--kg-text-muted)]" />
          <input
            type="text"
            placeholder="Tìm kiếm món đang hết..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl py-2.5 pl-10 pr-4 text-xs sm:text-sm text-[var(--kg-text)] focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition outline-none shadow-xs"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center justify-center gap-1.5 bg-gradient-to-r from-rose-500 to-amber-600 text-white px-4 py-2.5 rounded-2xl font-black text-xs sm:text-sm shadow-md active:scale-95 transition-all"
        >
          <Plus size={16} />
          <span>Báo món hết</span>
        </button>
      </div>

      {/* Add Form Dropdown */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-sm p-4 space-y-3"
          >
            <form onSubmit={handleAdd} className="space-y-3">
              <p className="text-xs font-black text-[var(--kg-text)]">
                Nhập tên món ăn / thức uống vừa hết nguyên liệu:
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  autoFocus
                  placeholder="VD: Trà đào cam sả, Bò nướng tảng..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="flex-1 bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 text-[var(--kg-text)]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={!newItemName.trim() || store.isUpdating}
                    className="flex-1 sm:flex-initial bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-xs font-black transition active:scale-95 shadow-xs"
                  >
                    Xác nhận báo hết
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-3 py-2.5 rounded-xl border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)]"
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 min-h-[250px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-3">
            <div className="w-8 h-8 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
            <p className="text-xs font-bold text-[var(--kg-text-muted)]">Đang tải danh sách món...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-[var(--kg-surface)] border border-dashed border-[var(--kg-border)]">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
              <CheckCircle2 size={28} />
            </div>
            <h3 className="text-sm font-black text-[var(--kg-text)]">Hiện tại không có món nào báo hết</h3>
            <p className="text-xs text-[var(--kg-text-muted)] mt-1 font-medium">Tất cả nguyên liệu thực đơn sẵn sàng phục vụ khách hàng!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence>
              {filteredItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-[var(--kg-surface)] border border-rose-500/20 dark:border-rose-900/30 rounded-2xl p-3.5 flex flex-col justify-between relative overflow-hidden shadow-xs hover:border-rose-500/40 transition-all group"
                >
                  {/* Decorative stripe */}
                  <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-rose-500"></div>
                  
                  <div className="flex justify-between items-start pl-2 gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 animate-ping" />
                        <h3 className="font-black text-[var(--kg-text)] text-sm leading-tight truncate">
                          {item.itemName}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center text-[11px] text-[var(--kg-text-muted)] mt-2 gap-2 font-medium">
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {item.reportedAt}
                        </span>
                        <span>•</span>
                        <span className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] px-2 py-0.5 rounded-lg text-[10px] font-bold">
                          {item.reportedBy}
                        </span>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id, item.itemName)}
                      className="w-9 h-9 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-all active:scale-90 flex-shrink-0 border border-emerald-500/20 shadow-xs"
                      title="Đã có hàng lại"
                    >
                      <CheckCircle2 size={18} />
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
