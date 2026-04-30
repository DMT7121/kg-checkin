import { useState, useEffect } from 'react';
import { useAppStore, ChecklistItem } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import Swal from 'sweetalert2';
import { ClipboardCheck, Plus, Save, Trash2, Edit2, ShieldCheck, Loader2 } from 'lucide-react';

export default function AdminChecklistConfig() {
  const store = useAppStore();
  const { users, checklistItems } = store;
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ChecklistItem>>({});

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    const res = await callApi('GET_CHECKLIST_CONFIG');
    if (res?.ok) {
      setItems(res.data || []);
      store.setChecklistItems(res.data || []);
    }
    setLoading(false);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    const res = await callApi('SAVE_CHECKLIST_CONFIG', { items });
    setIsSaving(false);
    if (res?.ok) {
      store.setChecklistItems(items);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Lưu cấu hình thành công', showConfirmButton: false, timer: 2000 });
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể lưu', 'error');
    }
  };

  const handleAdd = () => {
    setEditingId('NEW');
    setFormData({
      id: 'NEW_' + Date.now(),
      taskName: '',
      bonusPoints: 0,
      penaltyPoints: 0,
      targetPosition: 'Phục vụ',
      targetShift: 'Tất cả',
      inspectorUsername: '',
      inspectorFullname: '',
      isActive: true,
      isRequired: true,
      frequency: 'Hàng ngày'
    });
  };

  const handleEdit = (item: ChecklistItem) => {
    setEditingId(item.id);
    setFormData(item);
  };

  const handleDelete = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const handleSaveItem = () => {
    if (!formData.taskName || !formData.inspectorUsername) {
      Swal.fire('Lỗi', 'Vui lòng nhập tên công việc và chọn người kiểm tra', 'error');
      return;
    }

    const inspector = users.find(u => u.username === formData.inspectorUsername);
    const updatedItem = {
      ...formData,
      inspectorFullname: inspector ? inspector.fullname : ''
    } as ChecklistItem;

    if (editingId && editingId.startsWith('NEW')) {
      setItems([...items, { ...updatedItem, id: Date.now().toString() }]);
    } else {
      setItems(items.map(i => i.id === editingId ? updatedItem : i));
    }
    setEditingId(null);
  };

  const POSITIONS = ['Tất cả', 'Phục vụ', 'Tổ trưởng', 'Quản lý', 'Thu ngân', 'Bếp', 'Pha chế', 'Tạp vụ', 'Bảo vệ'];
  const SHIFTS = ['Tất cả', '15:00', '17:00', '18:00', '19:00', 'OFF'];
  const FREQUENCIES = ['Hàng ngày', 'Hàng tuần', 'Hàng tháng'];

  return (
    <div className="p-4 space-y-6 animate-slide-up pb-10 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner">
              <ClipboardCheck size={20} className="text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Cấu hình Checklist</h2>
          </div>
          <p className="text-emerald-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
            Thiết lập danh mục công việc, hệ thống điểm thưởng phạt, và phân công nghiệm thu công việc.
          </p>
        </div>
        <div className="hidden md:block relative z-10 opacity-80">
          <ShieldCheck size={80} strokeWidth={1} />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
          <h3 className="font-bold text-gray-800 dark:text-gray-100 flex items-center min-w-0 pr-2 truncate">
            Danh sách Hạng mục ({items.length})
          </h3>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <button onClick={handleAdd} className="flex-1 sm:flex-none flex items-center justify-center bg-teal-50 text-teal-600 hover:bg-teal-100 px-4 py-2 rounded-xl font-bold text-sm transition-colors whitespace-normal text-center min-w-[120px]">
              <Plus size={16} className="mr-1 flex-shrink-0" /> 
              <span>Thêm Mới</span>
            </button>
            <button 
              onClick={handleSaveAll} 
              disabled={isSaving}
              className="flex-1 sm:flex-none flex items-center justify-center bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 whitespace-normal text-center min-w-[140px]"
            >
              {isSaving ? <Loader2 size={16} className="mr-1 animate-spin flex-shrink-0" /> : <Save size={16} className="mr-1 flex-shrink-0" />} 
              <span>Lưu Cấu Hình</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-10"><Loader2 size={30} className="animate-spin text-teal-500" /></div>
        ) : (
          <div className="space-y-4">
            {/* ADD/EDIT FORM */}
            {editingId && (
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl border border-teal-200 dark:border-teal-800 animate-fade-in shadow-inner">
                <h4 className="font-bold text-teal-700 dark:text-teal-400 mb-4 flex items-center border-b border-teal-100 dark:border-teal-900 pb-2">
                  {editingId.startsWith('NEW') ? 'Tạo Hạng Mục Mới' : 'Sửa Hạng Mục'}
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">Tên Hạng mục công việc *</label>
                    <input 
                      type="text" 
                      value={formData.taskName || ''} 
                      onChange={e => setFormData({...formData, taskName: e.target.value})}
                      placeholder="VD: Vệ sinh khu vực quầy"
                      className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-emerald-600 mb-1">Điểm Thưởng (+)</label>
                    <input 
                      type="number" 
                      value={formData.bonusPoints || 0} 
                      onChange={e => setFormData({...formData, bonusPoints: Number(e.target.value)})}
                      className="w-full bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-emerald-600 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-red-600 mb-1">Điểm Phạt (-)</label>
                    <input 
                      type="number" 
                      value={formData.penaltyPoints || 0} 
                      onChange={e => setFormData({...formData, penaltyPoints: Math.abs(Number(e.target.value))})}
                      className="w-full bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 outline-none text-red-600 font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Bộ phận thực hiện</label>
                    <select 
                      value={formData.targetPosition || 'Tất cả'} 
                      onChange={e => setFormData({...formData, targetPosition: e.target.value})}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    >
                      {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Ca thực hiện</label>
                    <select 
                      value={formData.targetShift || 'Tất cả'} 
                      onChange={e => setFormData({...formData, targetShift: e.target.value})}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    >
                      {SHIFTS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Người nghiệm thu *</label>
                    <select 
                      value={formData.inspectorUsername || ''} 
                      onChange={e => setFormData({...formData, inspectorUsername: e.target.value})}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                    >
                      <option value="">-- Chọn Quản lý --</option>
                      {users.filter(u => u.role === 'admin' || u.position === 'Quản lý' || u.position === 'Tổ trưởng').map(u => (
                        <option key={u.username} value={u.username}>{u.fullname} ({u.position})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Tùy chọn khác</label>
                    <div className="flex items-center gap-4 mt-2">
                      <label className="flex items-center text-sm">
                        <input type="checkbox" checked={formData.isRequired} onChange={e => setFormData({...formData, isRequired: e.target.checked})} className="mr-1.5" />
                        Bắt buộc
                      </label>
                      <label className="flex items-center text-sm">
                        <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="mr-1.5" />
                        Hoạt động
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <button onClick={() => setEditingId(null)} className="px-4 py-2 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">Hủy</button>
                  <button onClick={handleSaveItem} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-bold">Xong</button>
                </div>
              </div>
            )}

            {/* LIST */}
            <div className="overflow-x-auto hide-scrollbar">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700 text-xs uppercase font-bold text-gray-500">
                    <th className="py-3 px-4 rounded-tl-xl w-1/3">Hạng Mục Công Việc</th>
                    <th className="py-3 px-4 text-center">Mục tiêu</th>
                    <th className="py-3 px-4 text-center">Nghiệm thu</th>
                    <th className="py-3 px-4 text-center">Thưởng/Phạt</th>
                    <th className="py-3 px-4 text-center">Bắt buộc</th>
                    <th className="py-3 px-4 rounded-tr-xl text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-400">Chưa có cấu hình Checklist nào.</td>
                    </tr>
                  ) : items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-gray-800 dark:text-gray-200">{item.taskName}</div>
                        {!item.isActive && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded mr-2">Tạm dừng</span>}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="text-xs">Bộ phận: <span className="font-bold">{item.targetPosition}</span></div>
                        <div className="text-xs text-gray-500">Ca: <span className="font-medium">{item.targetShift}</span></div>
                      </td>
                      <td className="py-3 px-4 text-center text-xs font-medium text-ocean-600">
                        {item.inspectorFullname}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          {item.bonusPoints > 0 && <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">+{item.bonusPoints}đ</span>}
                          {item.penaltyPoints > 0 && <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-200">-{item.penaltyPoints}đ</span>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.isRequired ? <span className="text-orange-500 font-bold text-xs">Có</span> : <span className="text-gray-400 text-xs">Không</span>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end space-x-2">
                          <button onClick={() => handleEdit(item)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(item.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}
