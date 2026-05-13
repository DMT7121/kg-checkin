import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import Swal from 'sweetalert2';
import { Users, KeyRound, Loader2, ShieldCheck, Mail, Briefcase, UserCog, Search, Filter, Calendar, ChevronDown, ChevronUp, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function HrList() {
  const store = useAppStore();
  const { users, currentUser } = store;
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPosition, setFilterPosition] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const POSITIONS = ['Phục vụ', 'Tổ trưởng', 'Quản lý', 'Thu ngân', 'Bếp', 'Pha chế', 'Tạp vụ', 'Bảo vệ'];
  const ROLES = [
    { value: 'user', label: 'Nhân viên', short: 'NV' },
    { value: 'tester', label: 'Tester', short: 'Test' },
    { value: 'admin', label: 'Admin', short: 'Admin' }
  ];

  // === Filtered users ===
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return users.filter(u => {
      const matchSearch = !q || u.fullname.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q));
      const matchPos = filterPosition === 'all' || (u.position || 'Phục vụ') === filterPosition;
      const matchRole = filterRole === 'all' || (u.role || 'user') === filterRole;
      return matchSearch && matchPos && matchRole;
    });
  }, [users, searchQuery, filterPosition, filterRole]);

  // === Stats ===
  const stats = useMemo(() => {
    const adminCount = users.filter(u => u.role === 'admin' || u.role === 'tester').length;
    const positionCounts: Record<string, number> = {};
    users.forEach(u => {
      const p = u.position || 'Phục vụ';
      positionCounts[p] = (positionCounts[p] || 0) + 1;
    });
    const topPosition = Object.entries(positionCounts).sort((a, b) => b[1] - a[1])[0];
    const noEmail = users.filter(u => !u.email).length;
    return { total: users.length, adminCount, topPosition, noEmail };
  }, [users]);

  // === Handlers ===
  const handleForceReset = async (username: string, fullname: string) => {
    const result = await Swal.fire({
      title: 'Khôi phục mật khẩu',
      html: `Bạn có chắc chắn muốn khôi phục mật khẩu của <b>${fullname}</b> về mặc định <b>Kg123456</b> không?`,
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280', confirmButtonText: 'Đồng ý', cancelButtonText: 'Hủy'
    });
    if (result.isConfirmed) {
      setUpdatingUser(username);
      const res = await callApi('FORCE_RESET_PASSWORD', { targetUsername: username });
      setUpdatingUser(null);
      if (res?.ok) Swal.fire('Thành công', `Đã đặt lại mật khẩu cho ${fullname} thành Kg123456`, 'success');
      else Swal.fire('Lỗi', res?.message || 'Không thể đổi mật khẩu', 'error');
    }
  };

  const handleUpdateRole = async (username: string, fullname: string, newRole: string) => {
    if (username === currentUser?.username && newRole !== 'admin') {
      const confirm = await Swal.fire({ title: 'Cảnh báo', text: 'Bạn đang tự hạ quyền Admin của chính mình!', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' });
      if (!confirm.isConfirmed) return;
    }
    setUpdatingUser(username);
    const res = await callApi('UPDATE_USER_ROLE', { targetUsername: username, newRole });
    setUpdatingUser(null);
    if (res?.ok) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Đã cấp quyền ${newRole} cho ${fullname}`, showConfirmButton: false, timer: 2000 });
      store.setUsers(users.map(u => u.username === username ? { ...u, role: newRole } : u));
    } else Swal.fire('Lỗi', res?.message || 'Không thể cập nhật', 'error');
  };

  const handleUpdatePosition = async (username: string, fullname: string, newPosition: string) => {
    setUpdatingUser(username);
    const res = await callApi('UPDATE_USER_POSITION', { targetUsername: username, newPosition });
    setUpdatingUser(null);
    if (res?.ok) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Đã đổi ${fullname} sang ${newPosition}`, showConfirmButton: false, timer: 2000 });
      store.setUsers(users.map(u => u.username === username ? { ...u, position: newPosition } : u));
    } else Swal.fire('Lỗi', res?.message || 'Không thể cập nhật', 'error');
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return { label: 'Admin', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50' };
      case 'tester': return { label: 'Tester', cls: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/50' };
      default: return { label: 'Nhân viên', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' };
    }
  };

  const getAvatarColor = (name: string) => {
    const colors = [
      'from-blue-500 to-cyan-500', 'from-purple-500 to-pink-500', 'from-amber-500 to-orange-500',
      'from-emerald-500 to-teal-500', 'from-rose-500 to-red-500', 'from-indigo-500 to-violet-500',
      'from-sky-500 to-blue-500', 'from-lime-500 to-green-500'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-20 max-w-5xl mx-auto">
      {/* Back button */}
      <div className="flex -mt-2 mb-1">
        <button onClick={() => store.setCurrentTab('admin')} className="flex items-center text-xs font-bold text-gray-500 hover:text-ocean-600 transition-colors">
          <span className="mr-1">←</span> Quay lại Cài đặt chung
        </button>
      </div>

      {/* Header */}
      <div className="soft3d-card !bg-gradient-to-r from-ocean-600 via-blue-600 to-indigo-700 p-6 md:p-8 text-white relative overflow-hidden flex flex-col border-opacity-30">
        <div className="flex items-center justify-between relative z-10 w-full">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
                <Users size={20} className="text-white" />
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Hồ Sơ Nhân Sự</h2>
            </div>
            <p className="text-ocean-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
              Quản lý {stats.total} nhân viên, {POSITIONS.length} bộ phận.
            </p>
          </div>
          <div className="hidden md:block opacity-80 pl-4 relative z-10">
            <ShieldCheck size={80} strokeWidth={1} />
          </div>
        </div>
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay" />
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-ocean-400/30 rounded-full blur-2xl mix-blend-overlay" />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Tổng nhân viên', value: stats.total, icon: '👥', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Admin / Tester', value: stats.adminCount, icon: '🛡️', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: stats.topPosition ? stats.topPosition[0] : '—', value: stats.topPosition ? stats.topPosition[1] : 0, icon: '🏷️', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Chưa gán email', value: stats.noEmail, icon: '✉️', bg: 'bg-gray-50 dark:bg-gray-900/20' },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className={`soft3d-card p-3 ${s.bg}`}>
            <span className="text-lg">{s.icon}</span>
            <p className="text-xl font-black text-gray-800 dark:text-white mt-1">{s.value}</p>
            <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="soft3d-card p-3">
        <div className="flex flex-col md:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm tên, username, email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-ocean-500 focus:border-ocean-500 outline-none transition-shadow"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
          {/* Filters */}
          <div className="flex gap-2">
            <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm font-medium outline-none cursor-pointer min-w-0 flex-1 md:flex-none">
              <option value="all">Tất cả bộ phận</option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm font-medium outline-none cursor-pointer min-w-0 flex-1 md:flex-none">
              <option value="all">Tất cả quyền</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>
        {(searchQuery || filterPosition !== 'all' || filterRole !== 'all') && (
          <p className="text-[11px] text-gray-500 mt-2 ml-1 font-medium">
            Hiển thị {filteredUsers.length} / {users.length} nhân viên
            <button onClick={() => { setSearchQuery(''); setFilterPosition('all'); setFilterRole('all'); }} className="ml-2 text-ocean-600 hover:underline font-bold">Xóa lọc</button>
          </p>
        )}
      </div>

      {/* Employee List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredUsers.map((user, idx) => {
            const isProcessing = updatingUser === user.username;
            const badge = getRoleBadge(user.role || 'user');
            const avatarColor = getAvatarColor(user.fullname);
            const isExpanded = expandedUser === user.username;

            return (
              <motion.div
                key={user.username}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                className={`soft3d-card overflow-hidden transition-all duration-300 ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
              >
                {/* Main Info Row */}
                <div className="p-4 flex items-start gap-3 cursor-pointer" onClick={() => setExpandedUser(isExpanded ? null : user.username)}>
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white font-bold text-base shadow-md flex-shrink-0`}>
                    {user.fullname.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-bold text-gray-800 dark:text-gray-100 text-[15px] leading-tight">
                          {user.fullname}
                        </h4>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono mt-0.5">@{user.username}</p>
                      </div>
                      {/* Role Badge */}
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border flex-shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>

                    {/* Detail Row */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                      {/* Position chip */}
                      <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md font-semibold">
                        <Briefcase size={10} /> {user.position || 'Phục vụ'}
                      </span>

                      {/* DOB */}
                      {user.dob && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={10} /> {user.dob}
                        </span>
                      )}

                      {/* Email */}
                      {user.email && (
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <Mail size={10} className="flex-shrink-0" />
                          <span className="truncate max-w-[180px]">{user.email}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expand Toggle */}
                  <button className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 flex-shrink-0 mt-1 transition-colors">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Expanded Actions */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-800">
                        <div className="flex flex-col sm:flex-row gap-3 mt-3">
                          {/* Position Select */}
                          <div className="flex-1">
                            <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 ml-0.5 flex items-center gap-1">
                              <Briefcase size={9} /> Chức vụ / Bộ phận
                            </label>
                            <select
                              value={user.position || 'Phục vụ'}
                              onChange={e => handleUpdatePosition(user.username, user.fullname, e.target.value)}
                              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-ocean-500 outline-none cursor-pointer"
                            >
                              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>

                          {/* Role Select */}
                          <div className="flex-1">
                            <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 ml-0.5 flex items-center gap-1">
                              <UserCog size={9} /> Phân quyền
                            </label>
                            <select
                              value={user.role || 'user'}
                              onChange={e => handleUpdateRole(user.username, user.fullname, e.target.value)}
                              className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-ocean-500 outline-none cursor-pointer border ${badge.cls}`}
                            >
                              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          </div>

                          {/* Reset Password */}
                          <div className="sm:self-end">
                            <button
                              onClick={() => handleForceReset(user.username, user.fullname)}
                              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/50 rounded-xl transition-colors"
                            >
                              <KeyRound size={14} />
                              <span>Đặt lại MK</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredUsers.length === 0 && (
          <div className="soft3d-card p-8 text-center">
            <Search size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500 font-medium">Không tìm thấy nhân viên nào</p>
            <button onClick={() => { setSearchQuery(''); setFilterPosition('all'); setFilterRole('all'); }} className="text-xs text-ocean-600 font-bold mt-2 hover:underline">Xóa bộ lọc</button>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {updatingUser && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ocean-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-bold">
          <Loader2 size={14} className="animate-spin" /> Đang cập nhật...
        </div>
      )}
    </div>
  );
}
