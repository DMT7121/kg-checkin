import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import Swal from 'sweetalert2';
import { ClipboardCheck, Plus, Save, Trash2, Edit2, Loader2, RefreshCw } from 'lucide-react';
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

export default function AdminChecklistConfig() {
  const store = useAppStore();
  const [items, setItems] = useState<ChecklistTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ChecklistTemplateItem>>({});

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await callApi('GET_OPS_CHECKLIST_INIT');
      if (res?.ok && res.data?.checklist) {
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
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Lỗi', 'Không thể lấy dữ liệu cấu hình checklist.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
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
      if (res?.ok) {
        Swal.fire({ 
          toast: true, 
          position: 'top-end', 
          icon: 'success', 
          title: 'Lưu cấu hình checklist lên Google Sheets thành công!', 
          showConfirmButton: false, 
          timer: 2000 
        });
      } else {
        throw new Error(res?.message || 'API error');
      }
    } catch (err: any) {
      console.error(err);
      Swal.fire('Lỗi', err.message || 'Không thể lưu cấu hình checklist.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = () => {
    setEditingId('NEW');
    setFormData({
      id: 'item_' + Date.now().toString().slice(-6),
      no: items.length > 0 ? Math.max(...items.map(i => i.no)) + 1 : 1,
      phase: 'CHECKLIST ĐẦU CA',
      shift: 'CA 15H: SETUP BÀN',
      section: 'I. Vệ sinh & setup khu trực',
      title: '',
      desc: '',
      subtasksText: ''
    });
  };

  const handleEdit = (item: ChecklistTemplateItem) => {
    setEditingId(item.id);
    setFormData(item);
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
  };

  const PHASES = ['CHECKLIST ĐẦU CA', 'CHECKLIST CUỐI CA'];
  const SHIFTS = [
    'CA 15H: SETUP BÀN', 
    'CA 17H: RÀ SOÁT & HOÀN THIỆN', 
    'XUỐNG CA LẦN 1', 
    'XUỐNG CA SAU CÙNG'
  ];

  return (
    <div className="p-4 space-y-6 animate-slide-up pb-10 max-w-6xl mx-auto">
      <div className="flex mb-2 -mt-2">
        <button onClick={() => store.setCurrentTab('admin_work')} className="flex items-center text-xs font-bold text-gray-500 hover:text-ocean-600 transition-colors">
          <span className="mr-1">←</span> Quay lại Cài đặt chung
        </button>
      </div>
      
      <KgModuleHero
        moduleId="checklist"
        title="Cấu hình Checklist Phân Khu"
        description="Thiết lập danh mục công việc, phân loại theo ca trực và định cấu hình các công việc con."
        eyebrow="Cấu hình hệ thống"
      />

      <div className="soft3d-card p-5">
        <div className="flex flex-wrap items-center justify-between mb-6 gap-4 border-b border-[var(--kg-border)] pb-4">
          <h3 className="font-extrabold text-base text-gray-800 dark:text-white flex items-center gap-2">
            <ClipboardCheck size={20} className="text-teal-600" />
            <span>Danh sách Hạng mục ({items.length})</span>
          </h3>
          
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={fetchConfig}
              className="flex items-center justify-center bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 px-4 py-2 rounded-xl font-bold text-xs transition-colors"
            >
              <RefreshCw size={14} className="mr-1" />
              <span>Tải lại</span>
            </button>
            
            <button 
              onClick={handleAdd} 
              className="flex items-center justify-center bg-teal-50 text-teal-600 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400 dark:hover:bg-teal-900/50 px-4 py-2 rounded-xl font-bold text-xs transition-colors"
            >
              <Plus size={14} className="mr-1" /> 
              <span>Thêm Mới</span>
            </button>
            
            <button 
              onClick={handleSaveAll} 
              disabled={isSaving}
              className="flex items-center justify-center bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-5 py-2 rounded-xl font-bold text-xs transition-colors disabled:opacity-50 shadow-md"
            >
              {isSaving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />} 
              <span>Lưu Cấu Hình</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={32} className="animate-spin text-teal-500" /></div>
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
                    onClick={() => setEditingId(null)} 
                    className="px-4 py-2 text-gray-600 bg-white dark:bg-gray-800 border border-[var(--kg-border)] rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-bold"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleSaveItem} 
                    className="px-5 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 text-xs font-bold"
                  >
                    Lưu hạng mục
                  </button>
                </div>
              </div>
            )}

            {/* LIST TABLE */}
            <div className="overflow-x-auto border border-[var(--kg-border)] rounded-3xl">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/40 border-b border-[var(--kg-border)] text-[10px] font-black uppercase text-gray-500 tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">STT</th>
                    <th className="py-3 px-4 w-44">Phân loại / Ca</th>
                    <th className="py-3 px-4 w-44">Phần</th>
                    <th className="py-3 px-4">Tiêu Đề / Mô tả / Việc con</th>
                    <th className="py-3 px-4 w-32 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-[var(--kg-border)]">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-gray-400 italic">Chưa có hạng mục checklist nào.</td>
                    </tr>
                  ) : items.map((item) => {
                    const subtaskCount = item.subtasksText ? item.subtasksText.split('\n').filter(Boolean).length : 0;
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                        <td className="py-4 px-4 text-center font-bold text-gray-500">{item.no}</td>
                        <td className="py-4 px-4 space-y-1">
                          <span className="block text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-black uppercase truncate max-w-[150px]">
                            {item.phase}
                          </span>
                          <span className="block text-[9px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 rounded font-black uppercase truncate max-w-[150px]">
                            {item.shift}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-bold text-gray-600 dark:text-gray-400">{item.section}</td>
                        <td className="py-4 px-4 space-y-1.5">
                          <div className="font-extrabold text-gray-800 dark:text-white">{item.title}</div>
                          {item.desc && <div className="text-gray-400 font-medium text-[11px] leading-relaxed">{item.desc}</div>}
                          {subtaskCount > 0 && (
                            <div className="flex items-center space-x-1.5 text-[10px] text-blue-600 font-bold bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/50 px-2 py-0.5 rounded-full w-fit">
                              <span>📋 Hạng mục có {subtaskCount} việc con</span>
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="flex justify-end space-x-2">
                            <button 
                              onClick={() => handleEdit(item)} 
                              className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDelete(item.id)} 
                              className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            >
                              <Trash2 size={14} />
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
