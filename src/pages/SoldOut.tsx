import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore, type SoldOutItem } from '../store/useAppStore';
import { callApi } from '../services/api';
import { Plus, Search, Clock, CheckCircle2, RotateCcw, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KgEmptyState,
  KgErrorState,
  KgModuleHero,
  KgSkeleton,
  KgToast,
  type ToastMessage,
} from '../components/KgDesignSystem';

const RECENT_86_STORAGE_KEY = 'kg_recent_soldout_items_v1';

const DEFAULT_MENU_CHIPS = [
  'Bò nướng tảng',
  'Ba chỉ bò Mỹ',
  'Sườn nướng BBQ',
  'Nầm bò nướng',
  'Lẩu Thái hải sản',
  'Trà đào cam sả',
  'Trà vải hạt chia',
  'Kim chi cải thảo',
  'Salad dầu giấm',
  'Khoai tây chiên',
];

function readRecent86(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_86_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string' && v.trim()) : [];
  } catch {
    return [];
  }
}

function saveRecent86(itemName: string) {
  try {
    const clean = itemName.trim();
    if (!clean) return;
    const prev = readRecent86().filter((x) => x.toLowerCase() !== clean.toLowerCase());
    localStorage.setItem(RECENT_86_STORAGE_KEY, JSON.stringify([clean, ...prev].slice(0, 12)));
  } catch {
    // ignore storage errors
  }
}

export default function SoldOut() {
  const currentUser = useAppStore((s) => s.currentUser);
  const soldOutItems = useAppStore((s) => s.soldOutItems);
  const isUpdating = useAppStore((s) => s.isUpdating);
  const setSoldOutItems = useAppStore((s) => s.setSoldOutItems);

  const [loading, setLoading] = useState(() => soldOutItems.length === 0);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [recent86, setRecent86] = useState<string[]>(() => readRecent86());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Undoable 1-tap restore state
  const [undoBanner, setUndoBanner] = useState<{
    item: SoldOutItem;
    previousItems: SoldOutItem[];
  } | null>(null);
  const pendingRestoreTimerRef = useRef<number | null>(null);
  const pendingRestoreTaskRef = useRef<(() => Promise<void>) | null>(null);

  const pushToast = useCallback((title: string, type: ToastMessage['type']) => {
    setToasts((prev) => [...prev.slice(-2), { id: `${Date.now()}_${Math.random()}`, title, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchSoldOut = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError('');
      try {
        const res = await callApi('GET_SOLDOUT', {}, { background: true });
        if (res?.ok && Array.isArray(res.data)) {
          setSoldOutItems([...res.data].reverse());
        } else if (!res?.ok && !silent) {
          setLoadError(res?.message || 'Không thể tải danh sách món hết.');
        }
      } catch {
        if (!silent) {
          setLoadError('Lỗi kết nối máy chủ khi tải danh sách món hết.');
        }
      } finally {
        setLoading(false);
      }
    },
    [setSoldOutItems],
  );

  useEffect(() => {
    fetchSoldOut(soldOutItems.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush any pending restore if component unmounts
  useEffect(() => {
    return () => {
      if (pendingRestoreTimerRef.current) {
        window.clearTimeout(pendingRestoreTimerRef.current);
        pendingRestoreTimerRef.current = null;
      }
      if (pendingRestoreTaskRef.current) {
        void pendingRestoreTaskRef.current();
        pendingRestoreTaskRef.current = null;
      }
    };
  }, []);

  const commitAddItem = async (rawName: string) => {
    const itemName = rawName.trim();
    if (!itemName) return;

    saveRecent86(itemName);
    setRecent86(readRecent86());

    const tempId = `temp_${Date.now()}`;
    const optimisticItem: SoldOutItem = {
      id: tempId,
      itemName,
      reportedBy: currentUser?.fullname || 'Nhân viên',
      reportedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    const previousItems = [...useAppStore.getState().soldOutItems];
    setSoldOutItems([optimisticItem, ...previousItems]);
    setNewItemName('');
    setIsAdding(false);

    try {
      const res = await callApi(
        'ADD_SOLDOUT',
        {
          itemName,
          reportedBy: currentUser?.fullname || 'Nhân viên',
        },
        { background: true },
      );

      if (res?.ok) {
        fetchSoldOut(true);
        pushToast(`Đã báo hết "${itemName}"`, 'success');
      } else {
        setSoldOutItems(previousItems);
        pushToast(res?.message || 'Không thể ghi nhận món hết', 'error');
      }
    } catch {
      setSoldOutItems(previousItems);
      pushToast('Lỗi kết nối máy chủ, đã hoàn tác', 'error');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await commitAddItem(newItemName);
  };

  const commitRestoreOnServer = useCallback(
    async (targetItem: SoldOutItem, fallbackItems: SoldOutItem[]) => {
      try {
        const res = await callApi('REMOVE_SOLDOUT', { id: targetItem.id }, { background: true });
        if (res?.ok) {
          fetchSoldOut(true);
        } else {
          setSoldOutItems(fallbackItems);
          pushToast(res?.message || 'Không thể mở bán lại món', 'error');
        }
      } catch {
        setSoldOutItems(fallbackItems);
        pushToast('Lỗi kết nối máy chủ, đã hoàn tác', 'error');
      }
    },
    [fetchSoldOut, pushToast, setSoldOutItems],
  );

  const handleOneTapRestore = (item: SoldOutItem) => {
    // Flush previous pending restore immediately if user taps another item
    if (pendingRestoreTimerRef.current) {
      window.clearTimeout(pendingRestoreTimerRef.current);
      pendingRestoreTimerRef.current = null;
    }
    if (pendingRestoreTaskRef.current) {
      void pendingRestoreTaskRef.current();
      pendingRestoreTaskRef.current = null;
    }

    const previousItems = [...soldOutItems];
    setSoldOutItems(soldOutItems.filter((entry) => entry.id !== item.id));
    setUndoBanner({ item, previousItems });

    const task = async () => {
      pendingRestoreTaskRef.current = null;
      setUndoBanner(null);
      await commitRestoreOnServer(item, previousItems);
    };
    pendingRestoreTaskRef.current = task;
    pendingRestoreTimerRef.current = window.setTimeout(() => {
      pendingRestoreTimerRef.current = null;
      void task();
    }, 4500);
  };

  const handleUndoRestore = () => {
    if (!undoBanner) return;
    if (pendingRestoreTimerRef.current) {
      window.clearTimeout(pendingRestoreTimerRef.current);
      pendingRestoreTimerRef.current = null;
    }
    pendingRestoreTaskRef.current = null;
    setSoldOutItems(undoBanner.previousItems);
    pushToast(`Đã giữ "${undoBanner.item.itemName}" trong danh sách món hết`, 'info');
    setUndoBanner(null);
  };

  const activeNamesLower = useMemo(
    () => new Set(soldOutItems.map((i) => i.itemName.trim().toLowerCase())),
    [soldOutItems],
  );

  const quickPickSuggestions = useMemo(() => {
    const merged = [...recent86, ...DEFAULT_MENU_CHIPS];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const name of merged) {
      const lower = name.trim().toLowerCase();
      if (!lower || seen.has(lower) || activeNamesLower.has(lower)) continue;
      seen.add(lower);
      unique.push(name.trim());
    }
    const q = newItemName.trim().toLowerCase();
    if (!q) return unique.slice(0, 10);
    return unique.filter((name) => name.toLowerCase().includes(q)).slice(0, 8);
  }, [recent86, activeNamesLower, newItemName]);

  const filteredItems = soldOutItems.filter((item) =>
    item.itemName.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full space-y-4 pb-16 animate-fade-in">
      <KgModuleHero
        moduleId="soldout"
        title="Món Hết & Nguyên Liệu (86)"
        description="Cập nhật nhanh tình trạng món ăn, thức uống tạm hết để phục vụ order chuẩn xác."
        eyebrow="Vận hành"
        features={['Đồng bộ tức thì', 'Chọn nhanh món 86', 'Khôi phục 1 chạm']}
        tipTitle="Quy chuẩn Báo hết món (Item 86)"
        tips={[
          'Bếp hoặc Bar báo hết nguyên liệu / món ăn ngay khi lượng tồn kho dưới ngưỡng an toàn.',
          'Thu ngân và Nhân viên phục vụ lập tức cập nhật để không nhận order món đã hết của khách hàng.',
          "Khi có đợt nhập hàng hoặc sơ chế bổ sung, bấm nút 'Mở bán lại' (1 chạm) — có thể hoàn tác trong 4 giây nếu bấm nhầm.",
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
            className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl py-2.5 pl-10 pr-10 text-xs sm:text-sm text-[var(--kg-text)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 focus:border-[var(--kg-primary)] transition-colors outline-none shadow-xs min-h-[44px]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              aria-label="Xóa từ khóa tìm kiếm"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center justify-center gap-1.5 bg-[var(--kg-accent)] hover:brightness-95 text-white dark:text-[#0D1015] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-xs active:scale-95 transition-colors min-h-[44px] touch-manipulation"
        >
          <Plus size={16} />
          <span>Báo món hết</span>
        </button>
      </div>

      {/* Add Form + Quick-Pick Chips */}
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
                Nhập hoặc chọn nhanh món ăn / thức uống vừa hết nguyên liệu:
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="soldout-item-name"
                  type="text"
                  autoFocus
                  placeholder="VD: Trà đào cam sả, Bò nướng tảng..."
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="flex-1 bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] min-h-[44px]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={!newItemName.trim() || isUpdating}
                    className="flex-1 sm:flex-initial bg-[var(--kg-danger)] hover:brightness-95 disabled:opacity-50 text-white dark:text-[#0D1015] px-4 py-2.5 rounded-xl text-xs font-bold transition-colors active:scale-95 shadow-xs min-h-[44px] touch-manipulation"
                  >
                    Xác nhận báo hết
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-3.5 py-2.5 rounded-xl border border-[var(--kg-border)] text-xs font-semibold text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface-soft)] min-h-[44px] touch-manipulation"
                  >
                    Huỷ
                  </button>
                </div>
              </div>

              {quickPickSuggestions.length > 0 && (
                <div className="pt-1 space-y-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--kg-text-muted)]">
                    <Sparkles size={12} className="text-[var(--kg-accent-ink)]" />
                    {newItemName.trim() ? 'Gợi ý khớp tên món (chạm để điền):' : 'Chọn nhanh món hay hết / thực đơn:'}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPickSuggestions.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setNewItemName(chip)}
                        className="min-h-[36px] px-3 py-1.5 rounded-full border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] hover:border-[var(--kg-primary)] text-xs font-semibold text-[var(--kg-text)] transition-colors touch-manipulation"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 min-h-[250px]">
        {loadError ? (
          <KgErrorState title="Không thể tải danh sách món hết" description={loadError} onRetry={() => fetchSoldOut(false)} />
        ) : loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <KgSkeleton className="h-24 w-full" />
            <KgSkeleton className="h-24 w-full" />
            <KgSkeleton className="h-24 w-full" />
          </div>
        ) : filteredItems.length === 0 ? (
          <KgEmptyState
            icon={CheckCircle2}
            title={soldOutItems.length === 0 ? 'Hiện tại không có món nào báo hết' : 'Không tìm thấy món khớp từ khóa'}
            description={
              soldOutItems.length === 0
                ? 'Tất cả nguyên liệu thực đơn sẵn sàng phục vụ khách hàng.'
                : 'Thử xóa từ khóa tìm kiếm để xem toàn bộ món đang báo hết.'
            }
          />
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
                      onClick={() => handleOneTapRestore(item)}
                      aria-label={`Khôi phục món ${item.itemName}`}
                      className="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-[var(--kg-success-soft)] hover:brightness-95 text-[var(--kg-success)] inline-flex items-center justify-center gap-1 transition-all active:scale-95 flex-shrink-0 border border-[var(--kg-success)]/20 text-xs font-bold touch-manipulation"
                      title="Mở bán lại (1 chạm)"
                    >
                      <CheckCircle2 size={16} />
                      <span className="hidden sm:inline">Mở lại</span>
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Undo Toast + Standard KgToast Stack */}
      <div className="fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto z-[10100] flex flex-col items-end gap-2 pointer-events-none">
        <AnimatePresence>
          {undoBanner && (
            <motion.div
              key={`undo-${undoBanner.item.id}`}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              role="status"
              aria-live="polite"
              className="flex items-center gap-3 p-3.5 rounded-xl border border-[var(--kg-success)]/30 bg-[var(--kg-surface)] text-[var(--kg-text)] shadow-lg max-w-sm w-full sm:w-auto pointer-events-auto"
            >
              <CheckCircle2 size={18} className="text-[var(--kg-success)] flex-shrink-0" />
              <span className="text-xs font-semibold flex-1">
                Đã mở bán lại <b>{undoBanner.item.itemName}</b>
              </span>
              <button
                type="button"
                onClick={handleUndoRestore}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-xs font-extrabold inline-flex items-center gap-1 hover:brightness-95 touch-manipulation"
              >
                <RotateCcw size={13} /> Hoàn tác
              </button>
            </motion.div>
          )}
          {toasts.map((t) => (
            <KgToast key={t.id} message={t} onClose={dismissToast} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
