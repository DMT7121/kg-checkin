import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  Edit2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  KgBottomSheet,
  KgButton,
  KgEmptyState,
  KgErrorState,
  KgInput,
  KgModuleHero,
  KgSelect,
  KgSkeleton,
  KgTextarea,
} from '../../components/KgDesignSystem';
import { callApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { kgConfirm, kgToast } from '../../store/useFeedbackStore';
import { isAdminUser } from '../../utils/permissions';

interface ChecklistTemplateItem {
  id: string;
  no: number;
  phase: string;
  shift: string;
  section: string;
  title: string;
  desc: string;
  subtasksText: string;
}

const DEFAULT_PHASES = ['CHECKLIST ĐẦU CA', 'CHECKLIST CUỐI CA'];
const DEFAULT_SHIFTS = [
  'CA 15H: SETUP BÀN',
  'CA 17H: RÀ SOÁT & HOÀN THIỆN',
  'XUỐNG CA LẦN 1',
  'XUỐNG CA SAU CÙNG',
];

function shortPhaseLabel(phase: string): string {
  if (phase.includes('ĐẦU CA')) return 'Đầu ca';
  if (phase.includes('CUỐI CA')) return 'Cuối ca';
  return phase;
}

function shortShiftLabel(shift: string): string {
  if (shift.startsWith('CA 15H')) return 'Ca 15h';
  if (shift.startsWith('CA 17H')) return 'Ca 17h';
  if (shift.includes('LẦN 1')) return 'Xuống ca 1';
  if (shift.includes('SAU CÙNG')) return 'Xuống ca cuối';
  return shift;
}

export default function AdminChecklistConfig() {
  const currentUser = useAppStore((s) => s.currentUser);
  if (!isAdminUser(currentUser)) return null;
  return <AdminChecklistConfigContent />;
}

function AdminChecklistConfigContent() {
  const [items, setItems] = useState<ChecklistTemplateItem[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Filters
  const [filterPhase, setFilterPhase] = useState('ALL');
  const [filterShift, setFilterShift] = useState('ALL');
  const [filterSection, setFilterSection] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Bottom sheet form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ChecklistTemplateItem>>({});
  const [formBaseline, setFormBaseline] = useState('');

  const isDirty = useMemo(() => JSON.stringify(items) !== savedSnapshot, [items, savedSnapshot]);
  const isFormDirty = useMemo(
    () => Boolean(editingId && JSON.stringify(formData) !== formBaseline),
    [editingId, formData, formBaseline],
  );

  useEffect(() => {
    if (!isDirty && !isFormDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, isFormDirty]);

  const fetchConfig = useCallback(
    async (skipDirtyCheck = false) => {
      if (!skipDirtyCheck && (isDirty || isFormDirty)) {
        const confirmed = await kgConfirm({
          title: 'Bỏ thay đổi chưa lưu?',
          message:
            'Bạn có chỉnh sửa checklist chưa lưu lên Google Sheets. Tải lại sẽ làm mất các thay đổi này.',
          confirmLabel: 'Tải lại & Bỏ thay đổi',
          cancelLabel: 'Giữ lại',
          tone: 'danger',
        });
        if (!confirmed) return;
      }

      setLoading(true);
      setLoadError('');
      try {
        const res = await callApi('GET_OPS_CHECKLIST_INIT', {}, { background: true, cacheTtlMs: 0 });
        if (!res) {
          setLoadError('Mất kết nối máy chủ. Không thể tải cấu hình checklist.');
          return;
        }
        if (res.ok && res.data?.checklist) {
          const flatList: ChecklistTemplateItem[] = [];
          res.data.checklist.forEach((group: any) => {
            (group.items || []).forEach((item: any) => {
              flatList.push({
                id: item.id,
                no: item.no,
                phase: group.phase,
                shift: group.shift,
                section: group.section,
                title: item.title,
                desc: item.text,
                subtasksText: (item.subitems || []).map((s: any) => s.text).join('\n'),
              });
            });
          });
          flatList.sort((a, b) => a.no - b.no);
          setItems(flatList);
          setSavedSnapshot(JSON.stringify(flatList));
          setEditingId(null);
          setFormBaseline('');
        } else {
          setLoadError(res.message || 'Không thể lấy dữ liệu cấu hình checklist.');
        }
      } catch (err) {
        console.error(err);
        setLoadError('Không thể lấy dữ liệu cấu hình checklist.');
      } finally {
        setLoading(false);
      }
    },
    [isDirty, isFormDirty],
  );

  useEffect(() => {
    void fetchConfig(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveAll = async () => {
    setIsSaving(true);
    const apiItems = items.map((item) => ({
      'Mã Hạng Mục': item.id,
      STT: item.no,
      'Phân Loại': item.phase,
      'Ca Làm Việc': item.shift,
      Phần: item.section,
      'Tiêu Đề': item.title,
      'Mô Tả': item.desc,
      'Công Việc Con': item.subtasksText,
    }));

    try {
      const res = await callApi('SAVE_OPS_CHECKLIST_CONFIG', { items: apiItems });
      if (!res) return;
      if (res.ok) {
        setSavedSnapshot(JSON.stringify(items));
        kgToast('Lưu cấu hình checklist lên Google Sheets thành công!', 'success');
      } else {
        kgToast(res.message || 'Không thể lưu cấu hình checklist.', 'error', 'Lỗi');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDiscardFormIfNeeded = async (): Promise<boolean> => {
    if (!isFormDirty) return true;
    return kgConfirm({
      title: 'Hủy chỉnh sửa hạng mục?',
      message: 'Nội dung đang nhập trong form sẽ không được lưu.',
      confirmLabel: 'Bỏ thay đổi',
      cancelLabel: 'Tiếp tục sửa',
      tone: 'danger',
    });
  };

  const availablePhases = useMemo(
    () =>
      Array.from(
        new Set([
          ...DEFAULT_PHASES,
          ...items.map((i) => i.phase).filter(Boolean),
          ...(formData.phase ? [formData.phase] : []),
        ]),
      ),
    [items, formData.phase],
  );

  const availableShifts = useMemo(
    () =>
      Array.from(
        new Set([
          ...DEFAULT_SHIFTS,
          ...items.map((i) => i.shift).filter(Boolean),
          ...(formData.shift ? [formData.shift] : []),
        ]),
      ),
    [items, formData.shift],
  );

  const availableSections = useMemo(
    () => Array.from(new Set(items.map((i) => i.section).filter(Boolean))),
    [items],
  );

  const handleAdd = async () => {
    if (!(await confirmDiscardFormIfNeeded())) return;
    const draft: Partial<ChecklistTemplateItem> = {
      id: 'item_' + Date.now().toString().slice(-6),
      no: items.length > 0 ? Math.max(...items.map((i) => i.no)) + 1 : 1,
      phase: filterPhase !== 'ALL' ? filterPhase : availablePhases[0] || DEFAULT_PHASES[0],
      shift: filterShift !== 'ALL' ? filterShift : availableShifts[0] || DEFAULT_SHIFTS[0],
      section: filterSection !== 'ALL' ? filterSection : availableSections[0] || 'I. Vệ sinh & setup khu trực',
      title: '',
      desc: '',
      subtasksText: '',
    };
    setEditingId('NEW');
    setFormData(draft);
    setFormBaseline(JSON.stringify(draft));
  };

  const handleEdit = async (item: ChecklistTemplateItem) => {
    if (editingId !== item.id && !(await confirmDiscardFormIfNeeded())) return;
    setEditingId(item.id);
    setFormData(item);
    setFormBaseline(JSON.stringify(item));
  };

  const handleCancelEdit = async () => {
    if (!(await confirmDiscardFormIfNeeded())) return;
    setEditingId(null);
    setFormBaseline('');
  };

  const handleDelete = async (id: string) => {
    const confirmed = await kgConfirm({
      title: 'Xác nhận xóa?',
      message: 'Bạn có chắc chắn muốn xóa hạng mục checklist này không?',
      confirmLabel: 'Xóa ngay',
      cancelLabel: 'Hủy',
      tone: 'danger',
    });
    if (confirmed) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const handleSaveItem = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!formData.id || !formData.title || !formData.phase || !formData.shift || !formData.section) {
      kgToast('Vui lòng điền đầy đủ các thông tin bắt buộc.', 'error', 'Thiếu thông tin');
      return;
    }

    const updatedItem: ChecklistTemplateItem = {
      id: formData.id.trim(),
      no: Number(formData.no) || 1,
      phase: formData.phase.trim(),
      shift: formData.shift.trim(),
      section: formData.section.trim(),
      title: formData.title.trim(),
      desc: (formData.desc || '').trim(),
      subtasksText: (formData.subtasksText || '').trim(),
    };

    if (editingId === 'NEW') {
      if (items.some((i) => i.id === updatedItem.id)) {
        kgToast('Mã hạng mục này đã tồn tại, vui lòng chọn mã khác.', 'error', 'Trùng mã hạng mục');
        return;
      }
      setItems((prev) => [...prev, updatedItem].sort((a, b) => a.no - b.no));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === editingId ? updatedItem : i)).sort((a, b) => a.no - b.no),
      );
    }
    setEditingId(null);
    setFormBaseline('');
  };

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (filterPhase !== 'ALL' && item.phase !== filterPhase) return false;
      if (filterShift !== 'ALL' && item.shift !== filterShift) return false;
      if (filterSection !== 'ALL' && item.section !== filterSection) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        item.section.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });
  }, [items, filterPhase, filterShift, filterSection, searchQuery]);

  const hasActiveFilter =
    filterPhase !== 'ALL' ||
    filterShift !== 'ALL' ||
    filterSection !== 'ALL' ||
    searchQuery.trim() !== '';

  const resetFilters = () => {
    setFilterPhase('ALL');
    setFilterShift('ALL');
    setFilterSection('ALL');
    setSearchQuery('');
  };

  return (
    <div className="p-4 md:px-0 md:pt-1 space-y-4 animate-fade-in pb-24 md:pb-12 max-w-6xl mx-auto">
      <KgModuleHero
        moduleId="checklist"
        title="Cấu hình Checklist Phân Khu"
        description="Thiết lập danh mục công việc, phân loại theo ca trực và định cấu hình các công việc con."
        eyebrow="Điều hành · Checklist"
        tipTitle="Hướng dẫn Cấu hình Checklist"
        tips={[
          'Phân loại theo khu vực: Khu A (Sảnh/Bàn), B (Bar/Thu ngân), C (Bếp/Kho), D & E (Vệ sinh).',
          'Thời điểm thực hiện: Đầu ca, Trong ca, hoặc Xuống ca sau cùng.',
          'Bấm Sửa trên bất kỳ hạng mục nào để mở hộp thoại chỉnh sửa ngay tại chỗ.',
        ]}
      />

      {isDirty && (
        <div className="rounded-2xl border border-[var(--kg-warning)]/40 bg-[var(--kg-warning-soft)] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-start sm:items-center gap-2 text-[var(--kg-warning)] font-bold">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5 sm:mt-0" />
            <span>Bạn có thay đổi danh mục checklist chưa lưu lên Google Sheets.</span>
          </div>
          <button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={isSaving}
            className="w-full sm:w-auto min-h-[44px] sm:min-h-[36px] px-4 py-1.5 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] font-extrabold inline-flex items-center justify-center gap-1.5 shadow-xs whitespace-nowrap shrink-0"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin shrink-0" /> : <Save size={13} className="shrink-0" />}
            <span>Lưu ngay</span>
          </button>
        </div>
      )}

      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--kg-border)] pb-4">
          <h3 className="font-extrabold text-sm sm:text-base text-[var(--kg-text)] flex items-center gap-2">
            <ClipboardCheck size={20} className="text-[var(--kg-primary-ink)] shrink-0" />
            <span>
              Danh sách Hạng mục (
              <span className="font-mono tabular-nums">
                {filteredItems.length}/{items.length}
              </span>
              )
            </span>
          </h3>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => void fetchConfig(false)}
              className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center bg-[var(--kg-surface-2)] text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] px-3.5 py-2 rounded-xl font-bold text-xs transition-colors whitespace-nowrap"
            >
              <RefreshCw size={14} className="mr-1.5 flex-shrink-0" />
              <span>Tải lại</span>
            </button>

            <button
              type="button"
              onClick={() => void handleAdd()}
              className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]/25 px-3.5 py-2 rounded-xl font-bold text-xs transition-colors whitespace-nowrap"
            >
              <Plus size={14} className="mr-1.5 flex-shrink-0" />
              <span>Thêm Mới</span>
            </button>

            <button
              type="button"
              onClick={() => void handleSaveAll()}
              disabled={isSaving}
              className="col-span-2 sm:col-span-1 min-h-[44px] sm:min-h-[38px] flex items-center justify-center bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] px-4 py-2 rounded-xl font-bold text-xs transition-all disabled:opacity-50 shadow-xs whitespace-nowrap"
            >
              {isSaving ? (
                <Loader2 size={14} className="mr-1.5 animate-spin flex-shrink-0" />
              ) : (
                <Save size={14} className="mr-1.5 flex-shrink-0" />
              )}
              <span>Lưu Cấu Hình{isDirty ? ' *' : ''}</span>
            </button>
          </div>
        </div>

        {/* Toast Touch Phase & Shift Pill Selectors */}
        <div className="space-y-2.5">
          <div
            className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 sm:flex-wrap sm:overflow-visible"
            role="group"
            aria-label="Chọn phân loại ca"
          >
            <button
              type="button"
              onClick={() => setFilterPhase('ALL')}
              className={`kg-filter-pill min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                filterPhase === 'ALL'
                  ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                  : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              <span>Tất cả giai đoạn</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-extrabold ${
                  filterPhase === 'ALL'
                    ? 'bg-[var(--kg-nav-active-fg)]/15 text-[var(--kg-nav-active-fg)]'
                    : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                }`}
              >
                {items.length}
              </span>
            </button>
            {availablePhases.map((p) => {
              const active = filterPhase === p;
              const count = items.filter((i) => i.phase === p).length;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFilterPhase(active ? 'ALL' : p)}
                  className={`kg-filter-pill min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    active
                      ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                      : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                  }`}
                >
                  <span>{shortPhaseLabel(p)}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-extrabold ${
                      active
                        ? 'bg-[var(--kg-nav-active-fg)]/15 text-[var(--kg-nav-active-fg)]'
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 sm:flex-wrap sm:overflow-visible"
            role="group"
            aria-label="Chọn ca trực hoặc khu checklist"
          >
            <button
              type="button"
              onClick={() => setFilterShift('ALL')}
              className={`kg-filter-pill min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                filterShift === 'ALL'
                  ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                  : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              <span>Tất cả ca</span>
            </button>
            {availableShifts.map((s) => {
              const active = filterShift === s;
              const count = items.filter((i) => i.shift === s).length;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilterShift(active ? 'ALL' : s)}
                  className={`kg-filter-pill min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    active
                      ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                      : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                  }`}
                >
                  <span>{shortShiftLabel(s)}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums font-extrabold ${
                      active
                        ? 'bg-[var(--kg-nav-active-fg)]/15 text-[var(--kg-nav-active-fg)]'
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {availableSections.length > 0 && (
            <div
              className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pb-0.5 sm:flex-wrap sm:overflow-visible"
              role="group"
              aria-label="Chọn phần khu trực"
            >
              <button
                type="button"
                onClick={() => setFilterSection('ALL')}
                className={`kg-filter-pill min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  filterSection === 'ALL'
                    ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                    : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <span>Tất cả phần</span>
              </button>
              {availableSections.map((sec) => {
                const active = filterSection === sec;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setFilterSection(active ? 'ALL' : sec)}
                    className={`kg-filter-pill min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      active
                        ? 'kg-filter-pill--active bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)]'
                        : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                    }`}
                  >
                    <span>{sec}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search + Reset Row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tiêu đề, mô tả, mã hạng mục..."
                aria-label="Tìm hạng mục checklist"
                className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-10 py-2 rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] text-base sm:text-xs font-semibold text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Xóa từ khóa tìm kiếm"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-8 sm:h-8 inline-flex items-center justify-center rounded-lg text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface)]"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] text-xs font-bold text-[var(--kg-primary-ink)] shrink-0 whitespace-nowrap"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2.5 py-2">
            <KgSkeleton className="h-16 w-full" />
            <KgSkeleton className="h-16 w-full" />
            <KgSkeleton className="h-16 w-full" />
          </div>
        ) : loadError ? (
          <KgErrorState
            title="Không thể tải cấu hình checklist"
            description={loadError}
            onRetry={() => void fetchConfig(true)}
          />
        ) : filteredItems.length === 0 ? (
          <KgEmptyState
            icon={ClipboardList}
            title={items.length === 0 ? 'Chưa có hạng mục checklist' : 'Không tìm thấy hạng mục'}
            description={
              items.length === 0
                ? 'Hãy thêm hạng mục đầu tiên để bắt đầu xây dựng quy trình ca.'
                : 'Không có hạng mục nào khớp bộ lọc hiện tại.'
            }
            action={
              hasActiveFilter
                ? { label: 'Xóa bộ lọc', onClick: resetFilters }
                : { label: 'Thêm hạng mục mới', onClick: () => void handleAdd() }
            }
          />
        ) : (
          <>
            {/* Mobile & Tablet Card List (< lg) — >= 44px touch targets */}
            <div className="lg:hidden space-y-2.5">
              {filteredItems.map((item) => {
                const subtaskCount = item.subtasksText
                  ? item.subtasksText.split('\n').filter(Boolean).length
                  : 0;
                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] p-3.5 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <span className="px-2 py-0.5 rounded-md bg-[var(--kg-surface)] border border-[var(--kg-border)] font-mono tabular-nums text-[11px] font-black text-[var(--kg-text)]">
                          #{item.no}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[var(--kg-info-soft)] text-[var(--kg-info)] text-[10px] font-black uppercase truncate max-w-[180px]">
                          {item.phase}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] text-[10px] font-black uppercase truncate max-w-[200px]">
                          {item.shift}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[var(--kg-text-muted)] shrink-0">
                        {item.id}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[11px] font-bold text-[var(--kg-text-muted)]">
                        {item.section}
                      </p>
                      <h4 className="text-sm font-extrabold text-[var(--kg-text)] leading-snug">
                        {item.title}
                      </h4>
                      {item.desc && (
                        <p className="text-xs text-[var(--kg-text-muted)] leading-relaxed">
                          {item.desc}
                        </p>
                      )}
                      {subtaskCount > 0 && (
                        <div className="inline-flex items-center gap-1.5 text-[11px] text-[var(--kg-primary-ink)] font-bold bg-[var(--kg-primary-soft)] border border-[var(--kg-primary)]/20 px-2.5 py-0.5 rounded-full font-mono tabular-nums">
                          <ClipboardList size={12} />
                          <span className="font-sans">{subtaskCount} việc con</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center sm:justify-end gap-2 pt-2.5 border-t border-[var(--kg-border)]">
                      <button
                        type="button"
                        onClick={() => void handleEdit(item)}
                        className="flex-1 sm:flex-none min-h-[44px] px-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-primary-ink)] hover:border-[var(--kg-primary)] whitespace-nowrap"
                      >
                        <Edit2 size={14} className="shrink-0" /> Sửa hạng mục
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item.id)}
                        aria-label={`Xóa ${item.title}`}
                        className="min-h-[44px] min-w-[44px] px-3.5 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/25 text-xs font-bold text-[var(--kg-danger)] whitespace-nowrap shrink-0"
                      >
                        <Trash2 size={14} className="shrink-0" /> Xóa
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Desktop Sticky-Header Table (>= lg) */}
            <div className="hidden lg:block overflow-x-auto max-h-[65vh] overflow-y-auto border border-[var(--kg-border)] rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-[var(--kg-surface-soft)]">
                  <tr className="border-b border-[var(--kg-border)] text-[10px] font-black uppercase text-[var(--kg-text-muted)] tracking-wider">
                    <th className="py-3 px-4 w-14 text-center">STT</th>
                    <th className="py-3 px-4 w-52">Phân loại / Ca</th>
                    <th className="py-3 px-4 w-48">Phần</th>
                    <th className="py-3 px-4">Tiêu Đề / Mô tả / Việc con</th>
                    <th className="py-3 px-4 w-28 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-[var(--kg-border)]">
                  {filteredItems.map((item) => {
                    const subtaskCount = item.subtasksText
                      ? item.subtasksText.split('\n').filter(Boolean).length
                      : 0;
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-[var(--kg-surface-2)] transition-colors"
                      >
                        <td className="py-3.5 px-4 text-center font-bold font-mono tabular-nums text-[var(--kg-text-muted)]">
                          {item.no}
                        </td>
                        <td className="py-3.5 px-4 space-y-1">
                          <span className="block text-[9px] bg-[var(--kg-info-soft)] text-[var(--kg-info)] px-1.5 py-0.5 rounded font-black uppercase truncate max-w-[180px]">
                            {item.phase}
                          </span>
                          <span className="block text-[9px] bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] px-1.5 py-0.5 rounded font-black uppercase truncate max-w-[180px]">
                            {item.shift}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-[var(--kg-text-muted)]">
                          {item.section}
                        </td>
                        <td className="py-3.5 px-4 space-y-1.5">
                          <div className="font-extrabold text-[var(--kg-text)]">{item.title}</div>
                          {item.desc && (
                            <div className="text-[var(--kg-text-muted)] font-medium text-[11px] leading-relaxed">
                              {item.desc}
                            </div>
                          )}
                          {subtaskCount > 0 && (
                            <div className="inline-flex items-center gap-1.5 text-[10px] text-[var(--kg-primary-ink)] font-bold bg-[var(--kg-primary-soft)] border border-[var(--kg-border)] px-2 py-0.5 rounded-full w-fit font-mono tabular-nums">
                              <ClipboardList size={12} />
                              <span className="font-sans">Hạng mục có {subtaskCount} việc con</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              title="Sửa hạng mục"
                              aria-label="Sửa hạng mục"
                              onClick={() => void handleEdit(item)}
                              className="w-10 h-10 inline-flex items-center justify-center text-[var(--kg-primary-ink)] hover:bg-[var(--kg-primary-soft)] border border-transparent hover:border-[var(--kg-primary)]/20 rounded-xl transition-colors"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              type="button"
                              title="Xóa hạng mục"
                              aria-label="Xóa hạng mục"
                              onClick={() => void handleDelete(item.id)}
                              className="w-10 h-10 inline-flex items-center justify-center text-[var(--kg-danger)] hover:bg-[var(--kg-danger-soft)] border border-transparent hover:border-[var(--kg-danger)]/20 rounded-xl transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Create / Edit Item Bottom Sheet */}
      <KgBottomSheet
        isOpen={Boolean(editingId)}
        onClose={() => void handleCancelEdit()}
        title={editingId === 'NEW' ? 'Tạo Hạng Mục Checklist Mới' : 'Chỉnh Sửa Hạng Mục'}
        subtitle="Thay đổi sẽ được áp dụng vào danh sách tạm; bấm 'Lưu Cấu Hình' để đồng bộ Google Sheets."
        footer={
          <div className="flex gap-2.5">
            <KgButton
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => void handleCancelEdit()}
            >
              Hủy
            </KgButton>
            <KgButton
              type="submit"
              form="checklist-item-editor-form"
              variant="primary"
              className="flex-1"
            >
              Lưu hạng mục
            </KgButton>
          </div>
        }
      >
        <form
          id="checklist-item-editor-form"
          onSubmit={handleSaveItem}
          className="space-y-3.5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KgInput
              label="Mã Hạng Mục (ID)"
              required
              value={formData.id || ''}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
              placeholder="VD: start_clean_floor"
              disabled={editingId !== 'NEW'}
            />
            <KgInput
              label="Thứ tự hiển thị (STT)"
              type="number"
              required
              value={formData.no ?? ''}
              onChange={(e) => setFormData({ ...formData, no: Number(e.target.value) })}
              inputClassName="font-mono tabular-nums"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KgSelect
              label="Phân loại (Phase)"
              required
              value={formData.phase || availablePhases[0] || DEFAULT_PHASES[0]}
              onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
              options={availablePhases.map((p) => ({ value: p, label: p }))}
            />
            <KgSelect
              label="Ca trực (Shift)"
              required
              value={formData.shift || availableShifts[0] || DEFAULT_SHIFTS[0]}
              onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
              options={availableShifts.map((s) => ({ value: s, label: s }))}
            />
          </div>

          <KgInput
            label="Phần (Section)"
            required
            value={formData.section || ''}
            onChange={(e) => setFormData({ ...formData, section: e.target.value })}
            placeholder="VD: I. Vệ sinh & setup khu trực"
          />

          <KgInput
            label="Tiêu đề công việc"
            required
            value={formData.title || ''}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="VD: Vệ sinh sàn & Khu vực chung"
          />

          <KgTextarea
            label="Mô tả công việc"
            value={formData.desc || ''}
            onChange={(e) => setFormData({ ...formData, desc: e.target.value })}
            placeholder="Mô tả cụ thể hướng dẫn thực hiện công việc..."
          />

          <KgTextarea
            label="Công việc con (Mỗi dòng một việc)"
            value={formData.subtasksText || ''}
            onChange={(e) => setFormData({ ...formData, subtasksText: e.target.value })}
            placeholder={'Quét sạch tổng thể sàn khu trực\nLau sàn, xử lý vết bẩn dễ thấy'}
          />
        </form>
      </KgBottomSheet>
    </div>
  );
}
