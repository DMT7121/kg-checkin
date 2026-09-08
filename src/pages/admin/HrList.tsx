import { useState, useMemo, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import Swal from 'sweetalert2';
import { KeyRound, Loader2, Mail, Briefcase, UserCog, Search, Calendar, ChevronDown, ChevronUp, X, Camera, Activity, PauseCircle, Ban, UserX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KgModuleHero } from '../../components/KgDesignSystem';
import { employmentStatuses, getEmploymentStatusMeta, normalizeEmploymentStatus, type EmploymentStatus } from '../../utils/employment';
import { encodeOptimalCanvas } from '../../utils/helpers';


export default function HrList() {
  const store = useAppStore();
  const { users, currentUser } = store;
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPosition, setFilterPosition] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarTarget, setAvatarTarget] = useState<string | null>(null);

  const POSITIONS = ['Phục vụ', 'Tổ trưởng', 'Quản lý', 'Thu ngân', 'Bếp', 'Pha chế', 'Tạp vụ', 'Bảo vệ'];
  const ROLES = [
    { value: 'user', label: 'Nhân viên' },
    { value: 'tester', label: 'Tester' },
    { value: 'admin', label: 'Admin' }
  ];

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return users.filter(u => {
      const matchSearch = !q || u.fullname.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q));
      const matchPos = filterPosition === 'all' || (u.position || 'Phục vụ') === filterPosition;
      const matchRole = filterRole === 'all' || (u.role || 'user') === filterRole;
      const matchStatus = filterStatus === 'all' || normalizeEmploymentStatus(u.employmentStatus) === filterStatus;
      return matchSearch && matchPos && matchRole && matchStatus;
    });
  }, [users, searchQuery, filterPosition, filterRole, filterStatus]);

  const stats = useMemo(() => {
    const adminCount = users.filter(u => u.role === 'admin' || u.role === 'tester').length;
    const positionCounts: Record<string, number> = {};
    users.forEach(u => { const p = u.position || 'Phục vụ'; positionCounts[p] = (positionCounts[p] || 0) + 1; });
    const topPosition = Object.entries(positionCounts).sort((a, b) => b[1] - a[1])[0];
    const noEmail = users.filter(u => !u.email).length;
    const active = users.filter(u => normalizeEmploymentStatus(u.employmentStatus) === 'active').length;
    const leave = users.filter(u => normalizeEmploymentStatus(u.employmentStatus) === 'leave').length;
    const suspended = users.filter(u => normalizeEmploymentStatus(u.employmentStatus) === 'suspended').length;
    const resigned = users.filter(u => normalizeEmploymentStatus(u.employmentStatus) === 'resigned').length;
    return { total: users.length, adminCount, topPosition, noEmail, active, leave, suspended, resigned };
  }, [users]);

  // === Avatar Upload ===
  const handleAvatarClick = (username: string) => {
    setAvatarTarget(username);
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !avatarTarget) return;
    if (file.size > 5 * 1024 * 1024) {
      Swal.fire('Ảnh quá lớn', 'Vui lòng chọn ảnh dưới 5MB', 'warning');
      return;
    }

    setUploadingAvatar(avatarTarget);
    try {
      // Compress to 400px max for avatar
      const base64 = await compressAvatar(file, 400);
      const res = await callApi('UPLOAD_AVATAR', { username: avatarTarget, image: base64 }, { background: true });
      if (res?.ok && res.data?.url) {
        store.setUsers(users.map(u => u.username === avatarTarget ? { ...u, avatarUrl: res.data.url } : u));
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã cập nhật ảnh đại diện', showConfirmButton: false, timer: 2000 });
      } else {
        Swal.fire('Lỗi', res?.message || 'Không thể upload ảnh', 'error');
      }
    } catch {
      Swal.fire('Lỗi', 'Upload ảnh thất bại', 'error');
    }
    setUploadingAvatar(null);
    setAvatarTarget(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
      const confirm = await Swal.fire({ title: 'Cảnh báo', text: 'Bạn đang tự hạ quyền Admin!', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' });
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

  const handleUpdateEmploymentStatus = async (user: typeof users[number]) => {
    if (currentUser?.role !== 'admin') {
      Swal.fire('Không có quyền', 'Chỉ admin được thay đổi trạng thái hoạt động.', 'warning');
      return;
    }
    const currentStatus = normalizeEmploymentStatus(user.employmentStatus);
    const { value, isConfirmed } = await Swal.fire({
      title: `Trạng thái của ${user.fullname}`,
      html: `
        <label style="display:block;text-align:left;font-size:12px;font-weight:700;margin:8px 2px 4px">Trạng thái hoạt động</label>
        <select id="employment-status" class="swal2-select" style="width:100%;margin:0">
          ${employmentStatuses.map(item => `<option value="${item.value}" ${item.value === currentStatus ? 'selected' : ''}>${item.label}</option>`).join('')}
        </select>
        <label style="display:block;text-align:left;font-size:12px;font-weight:700;margin:14px 2px 4px">Ngày kết thúc (bắt buộc khi đình chỉ)</label>
        <input id="status-until" class="swal2-input" type="date" value="${user.statusUntil || ''}" style="width:100%;margin:0">
        <label style="display:block;text-align:left;font-size:12px;font-weight:700;margin:14px 2px 4px">Lý do / ghi chú</label>
        <textarea id="status-reason" class="swal2-textarea" maxlength="500" placeholder="Nêu lý do tạm nghỉ, đình chỉ hoặc nghỉ việc..." style="width:100%;margin:0">${user.statusReason || ''}</textarea>
      `,
      showCancelButton: true,
      confirmButtonText: 'Cập nhật trạng thái',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#0e7490',
      preConfirm: () => {
        const employmentStatus = (document.getElementById('employment-status') as HTMLSelectElement).value as EmploymentStatus;
        const statusUntil = (document.getElementById('status-until') as HTMLInputElement).value;
        const statusReason = (document.getElementById('status-reason') as HTMLTextAreaElement).value.trim();
        if (employmentStatus === 'suspended' && !statusUntil) {
          Swal.showValidationMessage('Đình chỉ cần có ngày kết thúc');
          return false;
        }
        if (employmentStatus !== 'active' && !statusReason) {
          Swal.showValidationMessage('Vui lòng nhập lý do thay đổi trạng thái');
          return false;
        }
        return { employmentStatus, statusUntil, statusReason };
      },
    });
    if (!isConfirmed || !value) return;
    setUpdatingUser(user.username);
    const res = await callApi('UPDATE_EMPLOYMENT_STATUS', {
      role: currentUser.role,
      username: currentUser.username,
      targetUsername: user.username,
      ...value,
    });
    setUpdatingUser(null);
    if (!res?.ok) {
      Swal.fire('Không thể cập nhật', res?.message || 'Vui lòng thử lại.', 'error');
      return;
    }
    store.setUsers(users.map(item => (
      item.username === user.username ? { ...item, ...res.data.profile } : item
    )));
    Swal.fire({
      icon: 'success',
      title: 'Đã cập nhật trạng thái',
      text: `${user.fullname}: ${getEmploymentStatusMeta(value.employmentStatus).label}`,
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return { label: 'Admin', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50' };
      case 'tester': return { label: 'Tester', cls: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/50' };
      default: return { label: 'Nhân viên', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' };
    }
  };

  const getAvatarColor = (name: string) => {
    const colors = ['from-blue-500 to-cyan-500', 'from-purple-500 to-pink-500', 'from-amber-500 to-orange-500', 'from-emerald-500 to-teal-500', 'from-rose-500 to-red-500', 'from-indigo-500 to-violet-500', 'from-sky-500 to-blue-500', 'from-lime-500 to-green-500'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-20 max-w-5xl mx-auto">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

      {/* Back button */}
      <div className="flex -mt-2 mb-1">
        <button onClick={() => store.setCurrentTab('admin_people')} className="flex items-center text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-primary)] transition-colors">
          <span className="mr-1">←</span> Quay lại Cài đặt chung
        </button>
      </div>

      <KgModuleHero
        moduleId="hr-list"
        title="Hồ Sơ Nhân Sự"
        description="Quản lý trạng thái hoạt động, chức vụ, phân quyền và toàn bộ vòng đời hồ sơ nhân sự."
        eyebrow="Nhân sự"
        tipTitle="Hướng dẫn Quản trị Nhân sự"
        tips={[
          "Trạng thái nhân sự: Đang làm việc (đủ điều kiện vào ca), Tạm nghỉ (tạm khóa chấm công), Đình chỉ / Thôi việc.",
          "Cấp tài khoản & Mật khẩu: Có thể đặt lại mật khẩu hoặc đổi mã PIN cho nhân viên quên thông tin.",
          "Chức danh & Vị trí: Gán đúng vai trò Phục vụ, Pha chế, Bếp, Thu ngân để hệ thống phân công checklist chuẩn."
        ]}
      />


      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Đang làm việc', value: stats.active, icon: '●', bg: 'bg-emerald-500/10 border-emerald-500/20', iconCls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Tạm nghỉ', value: stats.leave, icon: '●', bg: 'bg-amber-500/10 border-amber-500/20', iconCls: 'text-amber-600 dark:text-amber-400' },
          { label: 'Đình chỉ', value: stats.suspended, icon: '●', bg: 'bg-rose-500/10 border-rose-500/20', iconCls: 'text-rose-600 dark:text-rose-400' },
          { label: 'Đã nghỉ việc', value: stats.resigned, icon: '●', bg: 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)]', iconCls: 'text-[var(--kg-text-muted)]' },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className={`bg-[var(--kg-surface)] border rounded-2xl p-3.5 shadow-xs ${s.bg}`}>
            <span className={`text-base ${s.iconCls}`}>{s.icon}</span>
            <p className="text-xl sm:text-2xl font-mono font-black text-[var(--kg-text)] mt-1">{s.value}</p>
            <p className="text-[10px] font-black text-[var(--kg-text-muted)] uppercase tracking-wider">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3.5 rounded-2xl shadow-xs">
        <div className="flex flex-col md:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)]" />
            <input type="text" placeholder="Tìm tên, username, email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl text-xs sm:text-sm font-bold text-[var(--kg-text)] focus:ring-2 focus:ring-[var(--kg-primary)] outline-none transition-all min-h-[44px]" />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"><X size={14} /></button>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 md:flex gap-2">
            <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)} className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold outline-none cursor-pointer w-full md:w-auto min-h-[44px]">
              <option value="all">Tất cả bộ phận</option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold outline-none cursor-pointer w-full md:w-auto min-h-[44px]">
              <option value="all">Tất cả quyền</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold outline-none cursor-pointer w-full md:w-auto min-h-[44px]">
              <option value="all">Tất cả trạng thái</option>
              {employmentStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </div>
        </div>
        {(searchQuery || filterPosition !== 'all' || filterRole !== 'all' || filterStatus !== 'all') && (
          <p className="text-[11px] text-[var(--kg-text-muted)] mt-2 ml-1 font-bold">
            Hiển thị {filteredUsers.length} / {users.length} nhân viên
            <button onClick={() => { setSearchQuery(''); setFilterPosition('all'); setFilterRole('all'); setFilterStatus('all'); }} className="ml-2 text-[var(--kg-accent)] hover:underline font-black">Xóa lọc</button>
          </p>
        )}
      </div>

      {/* Employee List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredUsers.map((user, idx) => {
            const isProcessing = updatingUser === user.username;
            const badge = getRoleBadge(user.role || 'user');
            const statusMeta = getEmploymentStatusMeta(user.employmentStatus);
            const avatarColor = getAvatarColor(user.fullname);
            const isExpanded = expandedUser === user.username;
            const isUploading = uploadingAvatar === user.username;

            return (
              <motion.div key={user.username} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                className={`bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl overflow-hidden shadow-xs hover:border-[var(--kg-border-strong)] transition-all duration-200 ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                
                {/* Main Info Row */}
                <div className="p-4 flex items-start gap-3">
                  {/* Avatar with upload overlay */}
                  <div className="relative group flex-shrink-0" onClick={(e) => { e.stopPropagation(); handleAvatarClick(user.username); }}>
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.fullname} className="w-12 h-12 rounded-xl object-cover shadow-xs border border-[var(--kg-border)] cursor-pointer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} />
                    ) : null}
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white font-bold text-lg shadow-xs cursor-pointer ${user.avatarUrl ? 'hidden' : ''}`}>
                      {user.fullname.charAt(0).toUpperCase()}
                    </div>
                    {/* Camera overlay */}
                    <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                      {isUploading ? <Loader2 size={16} className="text-white animate-spin" /> : <Camera size={16} className="text-white" />}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedUser(isExpanded ? null : user.username)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-[var(--kg-text)] text-[15px] leading-tight">{user.fullname}</h4>
                        <p className="text-[11px] text-[var(--kg-text-muted)] font-mono mt-0.5">@{user.username}</p>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${statusMeta.badgeClass}`}>{statusMeta.shortLabel}</span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${badge.cls}`}>{badge.label}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-[var(--kg-text-muted)]">
                      <span className="inline-flex items-center gap-1 bg-[var(--kg-surface-soft)] px-2 py-0.5 rounded-md font-semibold text-[var(--kg-text)]">
                        <Briefcase size={10} /> {user.position || 'Phục vụ'}
                      </span>
                      {user.dob && <span className="inline-flex items-center gap-1"><Calendar size={10} /> {user.dob}</span>}
                      {user.email && <span className="inline-flex items-center gap-1 min-w-0"><Mail size={10} className="flex-shrink-0" /><span className="truncate max-w-[180px]">{user.email}</span></span>}
                    </div>
                  </div>

                  {/* Expand Toggle */}
                  <button onClick={() => setExpandedUser(isExpanded ? null : user.username)} className="p-1.5 rounded-lg hover:bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] flex-shrink-0 mt-1 transition-colors">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Expanded Actions */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className="px-4 pb-4 pt-1 border-t border-[var(--kg-border)]">
                        <div className={`mt-3 rounded-xl border p-3 ${statusMeta.badgeClass}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 gap-2.5">
                              {statusMeta.value === 'active' && <Activity size={18} className="mt-0.5 flex-shrink-0" />}
                              {statusMeta.value === 'leave' && <PauseCircle size={18} className="mt-0.5 flex-shrink-0" />}
                              {statusMeta.value === 'suspended' && <Ban size={18} className="mt-0.5 flex-shrink-0" />}
                              {statusMeta.value === 'resigned' && <UserX size={18} className="mt-0.5 flex-shrink-0" />}
                              <div className="min-w-0">
                                <p className="text-xs font-black uppercase">{statusMeta.label}</p>
                                <p className="mt-1 text-[11px] leading-4 opacity-80">{statusMeta.description}</p>
                                {user.statusUntil && <p className="mt-1 text-[10px] font-bold">Đến ngày: {user.statusUntil}</p>}
                                {user.statusReason && <p className="mt-1 text-[10px] italic">Lý do: {user.statusReason}</p>}
                              </div>
                            </div>
                            {currentUser?.role === 'admin' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateEmploymentStatus(user)}
                                className="rounded-xl bg-[var(--kg-primary)] text-white px-3 py-2 text-[11px] font-extrabold shadow-xs hover:opacity-90 active:scale-95 transition-all"
                              >
                                Đổi trạng thái
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 mt-3">
                          <div className="flex-1">
                            <label className="block text-[10px] uppercase font-bold text-[var(--kg-text-muted)] mb-1 ml-0.5 flex items-center gap-1"><Briefcase size={9} /> Chức vụ</label>
                            <select value={user.position || 'Phục vụ'} onChange={e => handleUpdatePosition(user.username, user.fullname, e.target.value)}
                              className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[var(--kg-primary)] outline-none cursor-pointer">
                              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="block text-[10px] uppercase font-bold text-[var(--kg-text-muted)] mb-1 ml-0.5 flex items-center gap-1"><UserCog size={9} /> Phân quyền</label>
                            <select value={user.role || 'user'} onChange={e => handleUpdateRole(user.username, user.fullname, e.target.value)}
                              className={`w-full bg-[var(--kg-surface-soft)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[var(--kg-primary)] outline-none cursor-pointer border ${badge.cls}`}>
                              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          </div>
                          <div className="sm:self-end">
                            <button onClick={() => handleForceReset(user.username, user.fullname)}
                              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-colors">
                              <KeyRound size={14} /><span>Đặt lại MK</span>
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
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-8 text-center shadow-xs">
            <Search size={32} className="mx-auto mb-3 text-[var(--kg-text-muted)]" />
            <p className="text-sm text-[var(--kg-text-muted)] font-medium">Không tìm thấy nhân viên nào</p>
            <button onClick={() => { setSearchQuery(''); setFilterPosition('all'); setFilterRole('all'); setFilterStatus('all'); }} className="text-xs text-[var(--kg-primary)] font-black mt-2 hover:underline">Xóa bộ lọc</button>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {(updatingUser || uploadingAvatar) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--kg-primary)] text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-bold">
          <Loader2 size={14} className="animate-spin" /> {uploadingAvatar ? 'Đang upload ảnh...' : 'Đang cập nhật...'}
        </div>
      )}
    </div>
  );
}

/** Compress image for avatar use (smaller size, square-ish) */
function compressAvatar(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else if (h > maxDim) { w = Math.round((w * maxDim) / h); h = maxDim; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(event.target?.result as string); return; }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        resolve(encodeOptimalCanvas(canvas, 0.82));
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
  });
}
