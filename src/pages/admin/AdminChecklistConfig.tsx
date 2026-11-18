import { useState, useEffect, useMemo, useCallback } from 'react';
import { callApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { isAdminUser } from '../../utils/permissions';
import Swal from 'sweetalert2';
import { ClipboardCheck, ClipboardList, Plus, Save, Trash2, Edit2, Loader2, RefreshCw, AlertTriangle, Search, X } from 'lucide-react';
import { KgModuleHero } from '../../components/KgDesignSystem';

interface ChecklistTemplateItem {
  id: string;
  no: number;
  phase: string;
  shift: string;
  section: string;
  title: string;
  desc: string;
  subtasksText: string; // joined by newlines
}

const PHASES = ['CHECKLIST ĐẦU CA', 'CHECKLIST CUỐI CA'];
const SHIFTS = [
  'CA 15H: SETUP BÀN',
  'CA 17H: RÀ SOÁT & HOÀN THIỆN',
  'XUỐNG CA LẦN 1',
  'XUỐNG CA SAU CÙNG',
];

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

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ChecklistTemplateItem>>({});
  const [formBaseline, setFormBaseline] = useState('');

  const isDirty = useMemo(() => JSON.stringify(items) !== savedSnapshot, [items, savedSnapshot]);
  const isFormDirty = useMemo(
    () => Boolean(editingId && JSON.stringify(formData) !== formBaseline),
    [editingId, formData, formBaseline]
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

  const fetchConfig = useCallback(async (skipDirtyCheck = false) => {
    if (!skipDirtyCheck && (isDirty || isFormDirty)) {
      const confirmReload = await Swal.fire({
        title: 'Bỏ thay đổi chưa lưu?',
        text: 'Bạn có chỉnh sửa checklist chưa lưu lên Google Sheets. Tải lại sẽ làm mất các thay đổi này.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'Tải lại & Bỏ thay đổi',
        cancelButtonText: 'Giữ lại',
      });
      if (!confirmReload.isConfirmed) return;
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
        // Flatten grouped checklist from API response
        const flatList: ChecklistTemplateItem[] = [];
        res.data.checklist.forEach((group: any) => {
          group.items.forEach((item: any) => {
            flatList.push({
              id: item.id,
              no: item.no,
              phase: group.phase,
              shift: group.shift,
              section: group.section,
              title: item.title,
              desc: item.text,
              subtasksText: (item.subitems || []).map((s: any) => s.text).join('\n')
            });
          });
        });
        // Sort items by STT
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
  }, [isDirty, isFormDirty]);

  useEffect(() => {
    void fetchConfig(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveAll = async () => {
    setIsSaving(true);
    
    // Convert back to raw API format matching spreadsheet columns
    const apiItems = items.map(item => ({
      "Mã Hạng Mục": item.id,
      "STT": item.no,
      "Phân Loại": item.phase,
      "Ca Làm Việc": item.shift,
      "Phần": item.section,
      "Tiêu Đề": item.title,
      "Mô Tả": item.desc,
      "Công Việc Con": item.subtasksText
    }));

    try {
      const res = await callApi('SAVE_OPS_CHECKLIST_CONFIG', { items: apiItems });
      if (!res) return;
      if (res.ok) {
        setSavedSnapshot(JSON.stringify(items));
        Swal.fire({ 
          toast: true, 
          position: 'top-end', 
          icon: 'success', 
          title: 'Lưu cấu hình checklist lên Google Sheets thành công!', 
          showConfirmButton: false, 
          timer: 2000 
        });
      } else {
        Swal.fire('Lỗi', res.message || 'Không thể lưu cấu hình checklist.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDiscardFormIfNeeded = async (): Promise<boolean> => {
    if (!isFormDirty) return true;
    const confirm = await Swal.fire({
      title: 'Hủy chỉnh sửa hạng mục?',
      text: 'Nội dung đang nhập trong form sẽ không được lưu.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Bỏ thay đổi',
      cancelButtonText: 'Tiếp tục sửa',
    });
    return confirm.isConfirmed;
  };

  const handleAdd = async () => {
    if (!(await confirmDiscardFormIfNeeded())) return;
    const draft: Partial<ChecklistTemplateItem> = {
      id: 'item_' + Date.now().toString().slice(-6),
      no: items.length > 0 ? Math.max(...items.map(i => i.no)) + 1 : 1,
      phase: filterPhase !== 'ALL' ? filterPhase : 'CHECKLIST ĐẦU CA',
      shift: filterShift !== 'ALL' ? filterShift : 'CA 15H: SETUP BÀN',
      section: filterSection !== 'ALL' ? filterSection : 'I. Vệ sinh & setup khu trực',
      title: '',
      desc: '',
      subtasksText: ''
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

  const handleDelete = (id: string) => {
    Swal.fire({
      title: 'Xác nhận xóa?',
      text: 'Bạn có chắc chắn muốn xóa hạng mục checklist này không?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'Xóa ngay',
      cancelButtonText: 'Hủy'
    }).then((result) => {
      if (result.isConfirmed) {
        setItems(prev => prev.filter(i => i.id !== id));
      }
    });
  };

  const handleSaveItem = () => {
    if (!formData.id || !formData.title || !formData.phase || !formData.shift || !formData.section) {
      Swal.fire('Lỗi', 'Vui lòng điền đầy đủ các thông tin bắt buộc.', 'error');
      return;
    }

    const updatedItem = {
      id: formData.id.trim(),
      no: Number(formData.no) || 1,
      phase: formData.phase.trim(),
      shift: formData.shift.trim(),
      section: formData.section.trim(),
      title: formData.title.trim(),
      desc: (formData.desc || '').trim(),
      subtasksText: (formData.subtasksText || '').trim()
    } as ChecklistTemplateItem;

    if (editingId === 'NEW') {
      // Check duplicate ID
      if (items.some(i => i.id === updatedItem.id)) {
        Swal.fire('Lỗi', 'Mã hạng mục này đã tồn tại, vui lòng chọn mã khác.', 'error');
        return;
      }
      setItems(prev => [...prev, updatedItem].sort((a, b) => a.no - b.no));
    } else {
      setItems(prev => prev.map(i => i.id === editingId ? updatedItem : i).sort((a, b) => a.no - b.no));
    }
    setEditingId(null);
    setFormBaseline('');
  };

  const availablePhases = useMemo(
    () => Array.from(new Set([...PHASES, ...items.map((i) => i.phase).filter(Boolean)])),
    [items]
  );
  const availableShifts = useMemo(
    () => Array.from(new Set([...SHIFTS, ...items.map((i) => i.shift).filter(Boolean)])),
    [items]
  );
  const availableSections = useMemo(
    () => Array.from(new Set(items.map((i) => i.section).filter(Boolean))),
    [items]
  );

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

  const hasActiveFilter = filterPhase !== 'ALL' || filterShift !== 'ALL' || filterSection !== 'ALL' || searchQuery.trim() !== '';

  return (
    <div className="p-4 space-y-6 animate-slide-up pb-24 md:pb-12 max-w-6xl mx-auto">
      <KgModuleHero
        moduleId="checklist"
        title="Cấu hình Checklist Phân Khu"
        description="Thiết lập danh mục công việc, phân loại theo ca trực và định cấu hình các công việc con."
        eyebrow="Cấu hình hệ thống"
        tipTitle="Hướng dẫn Cấu hình Checklist"
        tips={[
          "Phân loại theo khu vực: Khu A (Sảnh/Bàn), B (Bar/Thu ngân), C (Bếp/Kho), D & E (Vệ sinh).",
          "Thời điểm thực hiện: Đầu ca, Trong ca, hoặc Xuống ca sau cùng.",
          "Việc con & Vật tư: Bật tùy chọn nếu hạng mục yêu cầu chia nhỏ các bước hoặc có đề xuất xin cấp vật tư."
        ]}
      />

      {isDirty && (
        <div className="rounded-2xl border border-amber-400/50 bg-amber-50 dark:bg-amber-950/25 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
            <AlertTriangle size={15} className="flex-shrink-0" />
            <span>Bạn có thay đổi danh mục checklist chưa lưu lên Google Sheets.</span>
          </div>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--kg-primary)] text-white font-extrabold inline-flex items-center gap-1.5 shadow-xs"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>Lưu ngay</span>
          </button>
        </div>
      )}

      <div className="soft3d-card p-5">
        <div className="flex flex-wrap items-center justify-between mb-4 gap-4 border-b border-[var(--kg-border)] pb-4">
          <h3 className="font-extrabold text-base text-gray-800 dark:text-white flex items-center gap-2">
            <ClipboardCheck size={20} className="text-teal-600" />
            <span>Danh sách Hạng mục (<span className="font-mono tabular-nums">{filteredItems.length}/{items.length}</span>)</span>
          </h3>
          
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button 
              type="button"
              onClick={() => void fetchConfig(false)}
              className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 border border-[var(--kg-border)] px-3.5 py-2 rounded-xl font-bold text-xs transition-colors"
            >
              <RefreshCw size={14} className="mr-1.5 flex-shrink-0" />
              <span>Tải lại</span>
            </button>
            
            <button 
              type="button"
              onClick={() => void handleAdd()} 
              className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-900/50 border border-teal-500/25 px-3.5 py-2 rounded-xl font-bold text-xs transition-colors"
            >
              <Plus size={14} className="mr-1.5 flex-shrink-0" /> 
              <span>Thêm Mới</span>
            </button>
            
            <button 
              type="button"
              onClick={handleSaveAll} 
              disabled={isSaving}
              className="min-h-[44px] sm:min-h-[38px] flex items-center justify-center bg-[var(--kg-primary)] hover:opacity-90 text-white px-4 py-2 rounded-xl font-bold text-xs transition-all disabled:opacity-50 shadow-xs active:scale-95"
            >
              {isSaving ? <Loader2 size={14} className="mr-1.5 animate-spin flex-shrink-0" /> : <Save size={14} className="mr-1.5 flex-shrink-0" />} 
              <span>Lưu Cấu Hình{isDirty ? ' *' : ''}</span>
            </button>
          </div>
        </div>

        {/* Phase / Shift / Section Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tiêu đề, mô tả, mã..."
              aria-label="Tìm hạng mục checklist"
              className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-8 py-2 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-semibold text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Xóa từ khóa tìm kiếm"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <select
            value={filterPhase}
            onChange={(e) => setFilterPhase(e.target.value)}
            aria-label="Lọc phân loại checklist"
            className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
          >
            <option value="ALL">Tất cả phân loại (Phase)</option>
            {availablePhases.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            value={filterShift}
            onChange={(e) => setFilterShift(e.target.value)}
            aria-label="Lọc ca làm việc checklist"
            className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
          >
            <option value="ALL">Tất cả ca trực (Shift)</option>
            {availableShifts.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
              aria-label="Lọc phần checklist"
              className="flex-1 min-w-0 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
            >
              <option value="ALL">Tất cả phần (Section)</option>
              {availableSections.map((sec) => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setFilterPhase('ALL');
                  setFilterShift('ALL');
                  setFilterSection('ALL');
                  setSearchQuery('');
                }}
                className="min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] text-xs font-bold text-[var(--kg-accent-ink)] hover:bg-[var(--kg-surface-soft)] shrink-0"
              >
                Xóa lọc
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-teal-500" /></div>
        ) : loadError ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-rose-700 dark:text-rose-300">
              <AlertTriangle size={18} className="flex-shrink-0" />
              <span>{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => void fetchConfig(true)}
              className="min-h-[44px] sm:min-h-[36px] px-4 py-2 rounded-xl bg-[var(--kg-primary)] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0"
            >
              <RefreshCw size={14} /> Thử lại
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* ADD/EDIT FORM */}
            {editingId && (
              <div className="bg-gray-50 dark:bg-gray-800/40 p-5 rounded-3xl border border-teal-200 dark:border-teal-800 animate-fade-in shadow-inner space-y-4">
                <h4 className="font-extrabold text-teal-700 dark:text-teal-400 text-sm flex items-center border-b border-teal-100 dark:border-teal-900 pb-2">
                  {editingId === 'NEW' ? 'Tạo Hạng Mục Mới' : 'Sửa Hạng Mục'}
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Mã Hạng Mục (ID) *</label>
                    <input 
                      type="text" 
                      value={formData.id || ''} 
                      onChange={e => setFormData({...formData, id: e.target.value})}
                      placeholder="VD: start_clean_floor"
                      disabled={editingId !== 'NEW'}
                      className="w-full bg-white dark:bg-gray-900 border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none text-gray-800 dark:text-white disabled:bg-gray-100 disabled:opacity-75"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Thứ tự hiển thị (STT) *</label>
                    <input 
                      type="number" 
                      value={formData.no || ''} 
                      onChange={e => setFormData({...formData, no: Number(e.target.value)})}
                      className="w-full bg-white dark:bg-gray-900 border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none text-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Phân loại (Phase) *</label>
                    <select 
                      value={formData.phase || 'CHECKLIST ĐẦU CA'} 
                      onChange={e => setFormData({...formData, phase: e.target.value})}
                      className="w-full bg-white dark:bg-gray-900 border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none text-gray-800 dark:text-white"
                    >
                      {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Ca trực (Shift) *</label>
                    <select 
                      value={formData.shift || 'CA 15H: SETUP BÀN'} 
                      onChange={e => setFormData({...formData, shift: e.target.value})}
                      className="w-full bg-white dark:bg-gray-900 border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none text-gray-800 dark:text-white"
                    >
                      {SHIFTS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Phần (Section) *</label>
                    <input 
                      type="text" 
                      value={formData.section || ''} 
                      onChange={e => setFormData({...formData, section: e.target.value})}
                      placeholder="VD: I. Vệ sinh & setup khu trực"
                      className="w-full bg-white dark:bg-gray-900 border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none text-gray-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Tiêu đề công việc *</label>
                    <input 
                      type="text" 
                      value={formData.title || ''} 
                      onChange={e => setFormData({...formData, title: e.target.value})}
                      placeholder="VD: Vệ sinh sàn & Khu vực chung"
                      className="w-full bg-white dark:bg-gray-900 border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none text-gray-800 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Mô tả công việc</label>
                  <textarea 
                    value={formData.desc || ''} 
                    onChange={e => setFormData({...formData, desc: e.target.value})}
                    placeholder="Mô tả cụ thể hướng dẫn thực hiện công việc..."
                    className="w-full bg-white dark:bg-gray-900 border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none text-gray-800 dark:text-white min-h-[60px]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Công việc con (Mỗi dòng một việc)</label>
                  <textarea 
                    value={formData.subtasksText || ''} 
                    onChange={e => setFormData({...formData, subtasksText: e.target.value})}
                    placeholder="Quét sạch tổng thể sàn khu trực&#10;Lau sàn, xử lý vết bẩn dễ thấy&#10;Quét dọn sạch khu vực cổng ra vào"
                    className="w-full bg-white dark:bg-gray-900 border border-[var(--kg-border)] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 outline-none text-gray-800 dark:text-white min-h-[100px]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-800">
                  <button 
                    type="button"
                    onClick={() => void handleCancelEdit()} 
                    className="px-4 py-2 text-gray-600 bg-white dark:bg-gray-800 border border-[var(--kg-border)] rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-bold"
                  >
                    Hủy
                  </button>
                  <button 
                    type="button"
                    onClick={handleSaveItem} 
                    className="px-5 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 text-xs font-bold"
                  >
                    Lưu hạng mục
                  </button>
                </div>
              </div>
            )}

            {/* LIST TABLE */}
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto border border-[var(--kg-border)] rounded-2xl">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead className="sticky top-0 z-10 bg-[var(--kg-surface-soft)]">
                  <tr className="border-b border-[var(--kg-border)] text-[10px] font-black uppercase text-[var(--kg-text-muted)] tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">STT</th>
                    <th className="py-3 px-4 w-44">Phân loại / Ca</th>
                    <th className="py-3 px-4 w-44">Phần</th>
                    <th className="py-3 px-4">Tiêu Đề / Mô tả / Việc con</th>
                    <th className="py-3 px-4 w-32 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-[var(--kg-border)]">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-gray-400 italic">
                        {items.length === 0 ? 'Chưa có hạng mục checklist nào.' : 'Không có hạng mục nào khớp bộ lọc hiện tại.'}
                      </td>
                    </tr>
                  ) : filteredItems.map((item) => {
                    const subtaskCount = item.subtasksText ? item.subtasksText.split('\n').filter(Boolean).length : 0;
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                        <td className="py-4 px-4 text-center font-bold font-mono tabular-nums text-gray-500">{item.no}</td>
                        <td className="py-4 px-4 space-y-1">
                          <span className="block text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-black uppercase truncate max-w-[150px]">
                            {item.phase}
                          </span>
                          <span className="block text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-black uppercase truncate max-w-[150px]">
                            {item.shift}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-bold text-gray-600 dark:text-gray-400">{item.section}</td>
                        <td className="py-4 px-4 space-y-1.5">
                          <div className="font-extrabold text-gray-800 dark:text-white">{item.title}</div>
                          {item.desc && <div className="text-gray-400 font-medium text-[11px] leading-relaxed">{item.desc}</div>}
                          {subtaskCount > 0 && (
                            <div className="inline-flex items-center gap-1.5 text-[10px] text-[var(--kg-primary)] font-bold bg-[var(--kg-primary-soft)] border border-[var(--kg-border)] px-2 py-0.5 rounded-full w-fit font-mono tabular-nums">
                              <ClipboardList size={12} />
                              <span className="font-sans">Hạng mục có {subtaskCount} việc con</span>
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button 
                              type="button"
                              aria-label="Sửa hạng mục"
                              onClick={() => void handleEdit(item)} 
                              className="w-9 h-9 min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-colors"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button 
                              type="button"
                              aria-label="Xóa hạng mục"
                              onClick={() => handleDelete(item.id)} 
                              className="w-9 h-9 min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-xl transition-colors"
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

          </div>
        )}
      </div>
    </div>
  );
}
