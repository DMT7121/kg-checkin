import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import Swal from 'sweetalert2';
import { Users, KeyRound, Loader2, ShieldCheck, Check } from 'lucide-react';

export default function HrList() {
  const store = useAppStore();
  const { users, isUpdating, currentUser } = store;
  
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  
  // Local state to track which user's position is being edited
  const [editingPosition, setEditingPosition] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<string>('');

  // === FORCE RESET PASSWORD ===
  const handleForceReset = async (username: string, fullname: string) => {
    const result = await Swal.fire({
      title: 'Xác nhận Đổi mật khẩu',
      html: `Bạn có chắc chắn muốn ép đổi mật khẩu của <b>${fullname}</b> về mặc định <b>Kg123456</b> không?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Đổi mật khẩu',
      cancelButtonText: 'Hủy'
    });

    if (result.isConfirmed) {
      store.setLoading(true, 'Đang đặt lại mật khẩu...');
      const res = await callApi('FORCE_RESET_PASSWORD', { targetUsername: username });
      store.setLoading(false);
      
      if (res?.ok) {
        Swal.fire('Thành công', `Đã đặt lại mật khẩu cho ${fullname} thành Kg123456`, 'success');
      } else {
        Swal.fire('Lỗi', res?.message || 'Không thể đổi mật khẩu', 'error');
      }
    }
  };

  // === UPDATE ROLE ===
  const handleUpdateRole = async (username: string, fullname: string) => {
    if (!selectedRole) return;
    
    // Ngăn admin tự đổi quyền của mình nếu không cẩn thận (có thể làm mất quyền admin)
    if (username === currentUser?.username && selectedRole !== 'admin') {
      const confirm = await Swal.fire({
        title: 'Cảnh báo',
        text: 'Bạn đang tự hạ quyền của chính mình. Bạn sẽ không thể truy cập các chức năng Quản lý sau khi lưu. Bạn có chắc chắn?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
      });
      if (!confirm.isConfirmed) return;
    }

    store.setLoading(true, 'Đang cập nhật phân quyền...');
    const res = await callApi('UPDATE_USER_ROLE', { targetUsername: username, newRole: selectedRole });
    store.setLoading(false);

    if (res?.ok) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Đã cấp quyền ${selectedRole} cho ${fullname}`, showConfirmButton: false, timer: 2000 });
      setEditingRole(null);
      
      // Update local state temporarily so user sees change immediately
      const updatedUsers = users.map(u => u.username === username ? { ...u, role: selectedRole } : u);
      store.setUsers(updatedUsers);
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể cập nhật phân quyền', 'error');
    }
  };
  // === UPDATE POSITION ===
  const handleUpdatePosition = async (username: string, fullname: string) => {
    if (!selectedPosition) return;
    
    store.setLoading(true, 'Đang cập nhật bộ phận...');
    const res = await callApi('UPDATE_USER_POSITION', { targetUsername: username, newPosition: selectedPosition });
    store.setLoading(false);

    if (res?.ok) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Đã đổi ${fullname} sang ${selectedPosition}`, showConfirmButton: false, timer: 2000 });
      setEditingPosition(null);
      
      const updatedUsers = users.map(u => u.username === username ? { ...u, position: selectedPosition } : u);
      store.setUsers(updatedUsers);
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể cập nhật bộ phận', 'error');
    }
  };

  const POSITIONS = ['Phục vụ', 'Tổ trưởng', 'Quản lý', 'Thu ngân', 'Bếp', 'Pha chế', 'Tạp vụ', 'Bảo vệ'];
  const getRoleBadge = (role: string) => {
    switch(role) {
      case 'admin': return <span className="px-2 py-0.5 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded text-[10px] font-bold border border-red-200 dark:border-red-800 uppercase">Admin</span>;
      case 'tester': return <span className="px-2 py-0.5 bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded text-[10px] font-bold border border-purple-200 dark:border-purple-800 uppercase">Tester</span>;
      default: return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded text-[10px] font-bold border border-gray-200 dark:border-gray-700 uppercase">Nhân viên</span>;
    }
  };

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-3xl p-6 text-white shadow-lg mb-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 text-8xl transform translate-x-4 -translate-y-4">
          <Users size={100} />
        </div>
        <h2 className="text-2xl font-extrabold mb-1 tracking-tight relative z-10">Danh Sách Nhân Sự</h2>
        <p className="text-indigo-100 font-medium opacity-90 relative z-10 text-sm">Quản lý tài khoản & phân quyền</p>
      </div>

      {/* User Management & Roles */}
      <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="font-bold mb-4 border-b dark:border-gray-700 pb-2 flex items-center text-gray-800 dark:text-white">
          <ShieldCheck size={18} className="mr-2 text-indigo-600" /> Quản trị Tài khoản & Phân quyền
          {isUpdating && <Loader2 size={14} className="ml-2 text-indigo-500 animate-spin" />}
        </h3>
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.username} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm py-3 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all">
              
              {/* User Info */}
              <div className="flex items-center mb-2 sm:mb-0">
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 flex items-center justify-center font-bold text-sm mr-3 shadow-sm border border-indigo-200 dark:border-indigo-800">
                  {user.fullname.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-800 dark:text-gray-200 block">{user.fullname}</span>
                    {editingRole !== user.username && getRoleBadge(user.role || 'user')}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-500">Tài khoản: <span className="font-medium text-gray-700 dark:text-gray-400">{user.username}</span></span>
                    <span className="text-[10px] text-gray-300 dark:text-gray-600">•</span>
                    {editingPosition === user.username ? (
                      <div className="flex items-center space-x-1 animate-fade-in">
                        <select 
                          value={selectedPosition} 
                          onChange={(e) => setSelectedPosition(e.target.value)}
                          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded px-1 py-0.5 text-[10px] focus:ring-1 focus:ring-indigo-500 outline-none"
                        >
                          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <button onClick={() => handleUpdatePosition(user.username, user.fullname)} className="text-green-600 hover:text-green-700"><Check size={12} /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingPosition(user.username); setSelectedPosition(user.position || 'Phục vụ'); }} className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        Bộ phận: {user.position || 'Phục vụ'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions & Role Edit */}
              <div className="flex items-center justify-end space-x-2 pl-12 sm:pl-0">
                {editingRole === user.username ? (
                  <div className="flex items-center space-x-2 animate-fade-in">
                    <select 
                      value={selectedRole} 
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="user">Nhân viên</option>
                      <option value="tester">Tester</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button 
                      onClick={() => handleUpdateRole(user.username, user.fullname)}
                      className="p-1.5 bg-green-100 text-green-600 hover:bg-green-200 rounded-lg transition-colors"
                      title="Lưu phân quyền"
                    >
                      <Check size={16} />
                    </button>
                    <button 
                      onClick={() => setEditingRole(null)}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium px-2"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => {
                        setEditingRole(user.username);
                        setSelectedRole(user.role || 'user');
                      }}
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 px-2.5 py-1.5 rounded-lg transition-colors border border-indigo-100 dark:border-indigo-800"
                    >
                      Phân quyền
                    </button>
                    <button 
                      onClick={() => handleForceReset(user.username, user.fullname)}
                      className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-800"
                      title="Khôi phục mật khẩu mặc định (Kg123456)"
                    >
                      <KeyRound size={16} />
                    </button>
                  </>
                )}
              </div>

            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
