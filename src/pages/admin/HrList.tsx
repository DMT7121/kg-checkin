import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import Swal from 'sweetalert2';
import { Users, KeyRound, Loader2, ShieldCheck, Mail, Briefcase, UserCog } from 'lucide-react';

export default function HrList() {
  const store = useAppStore();
  const { users, isUpdating, currentUser } = store;
  
  // Track loading state for individual row operations
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);

  // === FORCE RESET PASSWORD ===
  const handleForceReset = async (username: string, fullname: string) => {
    const result = await Swal.fire({
      title: 'Khôi phục mật khẩu',
      html: `Bạn có chắc chắn muốn khôi phục mật khẩu của <b>${fullname}</b> về mặc định <b>Kg123456</b> không?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Đồng ý',
      cancelButtonText: 'Hủy'
    });

    if (result.isConfirmed) {
      setUpdatingUser(username);
      const res = await callApi('FORCE_RESET_PASSWORD', { targetUsername: username });
      setUpdatingUser(null);
      
      if (res?.ok) {
        Swal.fire('Thành công', `Đã đặt lại mật khẩu cho ${fullname} thành Kg123456`, 'success');
      } else {
        Swal.fire('Lỗi', res?.message || 'Không thể đổi mật khẩu', 'error');
      }
    }
  };

  // === UPDATE ROLE ===
  const handleUpdateRole = async (username: string, fullname: string, newRole: string) => {
    if (username === currentUser?.username && newRole !== 'admin') {
      const confirm = await Swal.fire({
        title: 'Cảnh báo nguy hiểm',
        text: 'Bạn đang tự hạ quyền của chính mình. Hành động này sẽ khiến bạn mất quyền Admin ngay lập tức. Bạn chắc chắn chứ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
      });
      if (!confirm.isConfirmed) return;
    }

    setUpdatingUser(username);
    const res = await callApi('UPDATE_USER_ROLE', { targetUsername: username, newRole: newRole });
    setUpdatingUser(null);

    if (res?.ok) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Đã cấp quyền ${newRole} cho ${fullname}`, showConfirmButton: false, timer: 2000 });
      const updatedUsers = users.map(u => u.username === username ? { ...u, role: newRole } : u);
      store.setUsers(updatedUsers);
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể cập nhật phân quyền', 'error');
    }
  };

  // === UPDATE POSITION ===
  const handleUpdatePosition = async (username: string, fullname: string, newPosition: string) => {
    setUpdatingUser(username);
    const res = await callApi('UPDATE_USER_POSITION', { targetUsername: username, newPosition: newPosition });
    setUpdatingUser(null);

    if (res?.ok) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Đã đổi ${fullname} sang bộ phận ${newPosition}`, showConfirmButton: false, timer: 2000 });
      const updatedUsers = users.map(u => u.username === username ? { ...u, position: newPosition } : u);
      store.setUsers(updatedUsers);
    } else {
      Swal.fire('Lỗi', res?.message || 'Không thể cập nhật bộ phận', 'error');
    }
  };

  const POSITIONS = ['Phục vụ', 'Tổ trưởng', 'Quản lý', 'Thu ngân', 'Bếp', 'Pha chế', 'Tạp vụ', 'Bảo vệ'];
  const ROLES = [
    { value: 'user', label: 'Nhân viên' },
    { value: 'tester', label: 'Tester' },
    { value: 'admin', label: 'Admin' }
  ];

  return (
    <div className="p-4 space-y-6 animate-slide-up pb-10 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-ocean-600 via-blue-600 to-indigo-700 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner">
              <Users size={20} className="text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Hồ Sơ Nhân Sự</h2>
          </div>
          <p className="text-ocean-100 font-medium opacity-90 text-sm md:text-base max-w-md">
            Quản lý toàn diện danh sách nhân viên, chức vụ bộ phận và phân quyền truy cập hệ thống.
          </p>
        </div>
        <div className="hidden md:block relative z-10 opacity-80">
          <ShieldCheck size={80} strokeWidth={1} />
        </div>
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-ocean-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* Main Content */}
      <div>
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg flex items-center">
            <Briefcase size={20} className="mr-2 text-ocean-600" /> 
            Danh sách nhân viên ({users.length})
          </h3>
          {(isUpdating || updatingUser) && (
            <div className="flex items-center text-xs font-medium text-ocean-600 bg-ocean-50 dark:bg-ocean-900/30 px-3 py-1.5 rounded-full">
              <Loader2 size={14} className="mr-1.5 animate-spin" /> Đang đồng bộ...
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          {users.map((user) => {
            const isProcessing = updatingUser === user.username;
            const roleStyle = user.role === 'admin' 
              ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50' 
              : user.role === 'tester'
              ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800/50'
              : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';

            return (
              <div 
                key={user.username} 
                className={`flex flex-col lg:flex-row items-start lg:items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-300 gap-4 ${isProcessing ? 'opacity-60 pointer-events-none grayscale-[50%]' : ''}`}
              >
                {/* User Info (Left) */}
                <div className="flex items-center w-full lg:w-auto lg:flex-1 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-ocean-100 to-indigo-100 dark:from-ocean-900/40 dark:to-indigo-900/40 text-ocean-600 dark:text-ocean-400 flex items-center justify-center font-bold text-lg shadow-sm border border-ocean-200/50 dark:border-ocean-700/50 mr-4 flex-shrink-0">
                    {user.fullname.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-gray-800 dark:text-gray-100 text-base leading-tight mb-1 truncate">
                      {user.fullname}
                    </h4>
                    <div className="flex flex-wrap items-center text-xs text-gray-500 dark:text-gray-400 gap-2">
                      <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-md font-mono text-[10px] whitespace-nowrap">
                        @{user.username}
                      </span>
                      {user.email && (
                        <span className="flex items-center min-w-0 truncate">
                          <Mail size={12} className="mr-1 flex-shrink-0" /> 
                          <span className="truncate">{user.email}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Controls (Right) */}
                <div className="grid grid-cols-2 lg:flex lg:flex-row items-center gap-3 w-full lg:w-auto bg-gray-50/50 dark:bg-gray-900/20 p-3 lg:p-0 rounded-xl lg:bg-transparent lg:dark:bg-transparent">
                  
                  {/* Position Select */}
                  <div className="col-span-1 lg:flex-none">
                    <label className="block text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 mb-1 ml-1 flex items-center">
                      <Briefcase size={10} className="mr-1" /> Chức vụ
                    </label>
                    <select 
                      value={user.position || 'Phục vụ'} 
                      onChange={(e) => handleUpdatePosition(user.username, user.fullname, e.target.value)}
                      className="w-full lg:w-32 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-ocean-500 focus:border-ocean-500 outline-none transition-shadow shadow-sm cursor-pointer appearance-none"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                    >
                      {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  {/* Role Select */}
                  <div className="col-span-1 lg:flex-none">
                    <label className="block text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 mb-1 ml-1 flex items-center">
                      <UserCog size={10} className="mr-1" /> Quyền hạn
                    </label>
                    <select 
                      value={user.role || 'user'} 
                      onChange={(e) => handleUpdateRole(user.username, user.fullname, e.target.value)}
                      className={`w-full lg:w-32 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-ocean-500 focus:outline-none transition-all shadow-sm cursor-pointer appearance-none ${roleStyle}`}
                      style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                    >
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>

                  {/* Reset Password Action */}
                  <div className="col-span-2 lg:col-span-1 lg:pl-4 lg:ml-1 lg:border-l border-gray-200 dark:border-gray-700 flex justify-end">
                    <button 
                      onClick={() => handleForceReset(user.username, user.fullname)}
                      className="flex items-center justify-center w-full lg:w-10 h-10 text-gray-500 hover:text-red-600 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all border border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800/50 shadow-sm group"
                      title="Khôi phục mật khẩu mặc định (Kg123456)"
                    >
                      <KeyRound size={18} className="group-hover:scale-110 transition-transform" />
                      <span className="lg:hidden ml-2 font-medium text-sm">Khôi phục mật khẩu</span>
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
