import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { Plus, Search, Clock, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';
import { KgModuleHero, KgConfirmSheet } from '../components/KgDesignSystem';

export default function SoldOut() {
  const currentUser = useAppStore((s) => s.currentUser);
  const soldOutItems = useAppStore((s) => s.soldOutItems);
  const isUpdating = useAppStore((s) => s.isUpdating);
  const setSoldOutItems = useAppStore((s) => s.setSoldOutItems);
  const store = { isUpdating, setSoldOutItems };
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<{ id: string; itemName: string } | null>(null);

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
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: res?.message || 'Không thể ghi nhận món hết', showConfirmButton: false, timer: 2500 });
      }
    } catch {
      store.setSoldOutItems(previousItems);
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Lỗi kết nối máy chủ, đã hoàn tác', showConfirmButton: false, timer: 2500 });
    }
  };

  const executeRemove = async (id: string) => {
    const previousItems = [...soldOutItems];
    // Optimistically filter out
    store.setSoldOutItems(soldOutItems.filter(item => item.id !== id));

    try {
      const res = await callApi('REMOVE_SOLDOUT', { id }, { background: true });
      if (res?.ok) {
        fetchSoldOut();
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã mở bán lại món', showConfirmButton: false, timer: 2000 });
      } else {
        store.setSoldOutItems(previousItems);
        Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: res?.message || 'Không thể cập nhật món', showConfirmButton: false, timer: 2500 });
      }
    } catch {
      store.setSoldOutItems(previousItems);
      Swal.fire({ toast: true, position: 'top-end', icon: 'error', title: 'Lỗi kết nối máy chủ, đã hoàn tác', showConfirmButton: false, timer: 2500 });
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
        tipTitle="Quy chuẩn Báo hết món (Item 86)"
        tips={[
          "Bếp hoặc Bar báo hết nguyên liệu / món ăn ngay khi lượng tồn kho dưới ngưỡng an toàn.",
          "Thu ngân và Nhân viên phục vụ lập tức cập nhật để không nhận order món đã hết của khách hàng.",
          "Khi có đợt nhập hàng hoặc sơ chế bổ sung, bấm 'Khôi phục' để mở lại món trên thực đơn."
        ]}
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)]" />
          <input
            type="text"
            aria-label="Tìm kiếm món đang hết"
            placeholder="Tìm kiếm món đang hết..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl py-2.5 pl-10 pr-4 text-xs sm:text-sm text-[var(--kg-text)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 focus:border-[var(--kg-primary)] transition-colors outline-none shadow-xs min-h-[42px]"
          />
        </div>
        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center justify-center gap-1.5 bg-[var(--kg-accent)] hover:bg-[var(--kg-accent-hover)] text-white px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-xs active:scale-95 transition-colors min-h-[42px]"
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
            className="overflow-hidden bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-card p-4 space-y-3"
          >
            <form onSubmit={handleAdd} className="space-y-3">
              <label htmlFor="soldout-item-name" className="block text-xs font-semibold text-[var(--kg-text)]">
                Nhập tên món ăn / thức uống vừa hết nguyên liệu:
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="soldout-item-name"
                  type="text"
                  autoFocus
                  placeholder="VD: Trà đào cam sả, Bò nướng tảng..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="flex-1 bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] min-h-[42px]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={!newItemName.trim() || store.isUpdating}
                    className="flex-1 sm:flex-initial bg-[var(--kg-danger)] hover:brightness-95 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-colors active:scale-95 shadow-xs min-h-[42px]"
                  >
                    Xác nhận báo hết
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-3.5 py-2.5 rounded-xl border border-[var(--kg-border)] text-xs font-semibold text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)] min-h-[42px]"
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
            <div className="w-8 h-8 border-2 border-[var(--kg-border)] border-t-[var(--kg-primary)] rounded-full animate-spin" />
            <p className="text-xs font-medium text-[var(--kg-text-muted)]">Đang tải danh sách món...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center rounded-2xl bg-[var(--kg-surface)] border border-dashed border-[var(--kg-border)]">
            <div className="w-12 h-12 rounded-2xl bg-[var(--kg-success-soft)] text-[var(--kg-success)] flex items-center justify-center mb-3">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-sm font-bold text-[var(--kg-text)]">Hiện tại không có món nào báo hết</h3>
            <p className="text-xs text-[var(--kg-text-muted)] mt-1 font-medium">Tất cả nguyên liệu thực đơn sẵn sàng phục vụ khách hàng</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence>
              {filteredItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-danger)]/40 rounded-2xl p-3.5 flex flex-col justify-between shadow-card transition-colors group"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--kg-danger)] flex-shrink-0 animate-pulse" />
                        <h3 className="font-bold text-[var(--kg-text)] text-sm leading-tight truncate">
                          {item.itemName}
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center text-[11px] text-[var(--kg-text-muted)] mt-2 gap-2 font-medium">
                        <span className="flex items-center gap-1 font-mono tabular-nums">
                          <Clock size={11} /> {item.reportedAt}
                        </span>
                        <span>•</span>
                        <span className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] px-2 py-0.5 rounded-lg text-[10px] font-semibold text-[var(--kg-text)]">
                          {item.reportedBy}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setPendingRestore({ id: item.id, itemName: item.itemName })}
                      aria-label={`Khôi phục món ${item.itemName}`}
                      className="w-10 h-10 rounded-xl bg-[var(--kg-success-soft)] hover:brightness-95 text-[var(--kg-success)] flex items-center justify-center transition-all active:scale-95 flex-shrink-0 border border-[var(--kg-success)]/20"
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

      <KgConfirmSheet
        isOpen={Boolean(pendingRestore)}
        onClose={() => setPendingRestore(null)}
        title="Khôi phục món trên thực đơn?"
        message={pendingRestore ? `Xác nhận món "${pendingRestore.itemName}" đã có nguyên liệu trở lại và sẵn sàng phục vụ khách?` : ''}
        confirmLabel="Xác nhận mở bán lại"
        cancelLabel="Đóng"
        variant="info"
        onConfirm={() => {
          if (pendingRestore) {
            const targetId = pendingRestore.id;
            setPendingRestore(null);
            executeRemove(targetId);
          }
        }}
      />
    </div>
  );
}
