import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { callApi } from '../../services/api';
import { isAdminUser } from '../../utils/permissions';
import Swal from 'sweetalert2';
import { KeyRound, Loader2, Mail, Briefcase, UserCog, Search, Calendar, ChevronDown, ChevronUp, X, Camera, Activity, PauseCircle, Ban, UserX, ScanFace, Unlock, ShieldCheck, UserPlus, ArrowUpDown, CheckSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KgBottomSheet, KgButton, KgInput, KgModuleHero, KgSelect, KgTextarea } from '../../components/KgDesignSystem';
import { employmentStatuses, getEmploymentStatusMeta, normalizeEmploymentStatus, type EmploymentStatus } from '../../utils/employment';
import { encodeOptimalCanvas } from '../../utils/helpers';
import type { RawFaceProfileDto } from '../../services/faceRecognitionV2';

const FaceEnrollmentModal = lazy(() => import('../../components/FaceEnrollmentModal'));

type SortField = 'fullname' | 'position' | 'role' | 'employmentStatus' | 'faceId';

function useIsDesktopMd() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export default function HrList() {
  const currentUser = useAppStore((s) => s.currentUser);
  if (!isAdminUser(currentUser)) return null;
  return <HrListContent />;
}

function HrListContent() {
  const users = useAppStore((s) => s.users);
  const currentUser = useAppStore((s) => s.currentUser);
  const setUsers = useAppStore((s) => s.setUsers);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const store = { setUsers, setCurrentTab };
  const isDesktop = useIsDesktopMd();
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPosition, setFilterPosition] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterFaceId, setFilterFaceId] = useState<'all' | 'enrolled' | 'unenrolled'>('all');
  const [sortBy, setSortBy] = useState<SortField>('fullname');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(() => new Set());
  const [bulkPosition, setBulkPosition] = useState('Phục vụ');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarTarget, setAvatarTarget] = useState<string | null>(null);
  const [statusModalUser, setStatusModalUser] = useState<typeof users[number] | null>(null);
  const [statusDraft, setStatusDraft] = useState<{
    employmentStatus: EmploymentStatus;
    statusUntil: string;
    statusReason: string;
  }>({ employmentStatus: 'active', statusUntil: '', statusReason: '' });
  const [statusError, setStatusError] = useState('');
  const [faceProfilesMap, setFaceProfilesMap] = useState<Record<string, RawFaceProfileDto>>({});
  const [selectedStaffForFaceEnroll, setSelectedStaffForFaceEnroll] = useState<typeof users[number] | null>(null);

  useEffect(() => {
    if (!currentUser || !isAdminUser(currentUser)) return;
    let active = true;
    import('../../services/faceRecognitionV2')
      .then(({ getCachedFaceProfiles }) => {
        if (!active) return;
        const initial: Record<string, RawFaceProfileDto> = {};
        for (const p of getCachedFaceProfiles()) {
          if (p?.username && p?.vectorsB64) {
            initial[p.username.trim().toLowerCase()] = p;
          }
        }
        if (Object.keys(initial).length > 0) {
          setFaceProfilesMap((prev) => (Object.keys(prev).length > 0 ? prev : initial));
        }
      })
      .catch(() => {});

    callApi(
      'GET_FACE_PROFILES',
      { role: 'admin', username: currentUser.username, fastEdge: true },
      { background: true, cacheTtlMs: 0 }
    )
      .then(async (res) => {
        if (!active || !res?.ok || !Array.isArray(res.data?.profiles)) return;
        const { setCachedFaceProfiles } = await import('../../services/faceRecognitionV2');
        if (!active) return;
        setCachedFaceProfiles(res.data.profiles);
        const nextMap: Record<string, RawFaceProfileDto> = {};
        for (const p of res.data.profiles) {
          if (p?.username && p?.vectorsB64) {
            nextMap[p.username.trim().toLowerCase()] = p;
          }
        }
        setFaceProfilesMap(nextMap);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [currentUser]);

  const POSITIONS = ['Phục vụ', 'Tổ trưởng', 'Quản lý', 'Thu ngân', 'Bếp', 'Pha chế', 'Tạp vụ', 'Bảo vệ'];
  const ROLES = [
    { value: 'user', label: 'Nhân viên' },
    { value: 'tester', label: 'Tester' },
    { value: 'admin', label: 'Admin' }
  ];

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = users.filter(u => {
      const matchSearch = !q || u.fullname.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q));
      const matchPos = filterPosition === 'all' || (u.position || 'Phục vụ') === filterPosition;
      const matchRole = filterRole === 'all' || (u.role || 'user') === filterRole;
      const matchStatus = filterStatus === 'all' || normalizeEmploymentStatus(u.employmentStatus) === filterStatus;
      const hasFace = Boolean(faceProfilesMap[u.username.trim().toLowerCase()]);
      const matchFace =
        filterFaceId === 'all' ||
        (filterFaceId === 'enrolled' && hasFace) ||
        (filterFaceId === 'unenrolled' && !hasFace);
      return matchSearch && matchPos && matchRole && matchStatus && matchFace;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'fullname') {
        cmp = a.fullname.localeCompare(b.fullname, 'vi');
      } else if (sortBy === 'position') {
        cmp = (a.position || 'Phục vụ').localeCompare(b.position || 'Phục vụ', 'vi');
      } else if (sortBy === 'role') {
        cmp = (a.role || 'user').localeCompare(b.role || 'user', 'vi');
      } else if (sortBy === 'employmentStatus') {
        cmp = normalizeEmploymentStatus(a.employmentStatus).localeCompare(normalizeEmploymentStatus(b.employmentStatus));
      } else if (sortBy === 'faceId') {
        const aEnrolled = faceProfilesMap[a.username.trim().toLowerCase()] ? 1 : 0;
        const bEnrolled = faceProfilesMap[b.username.trim().toLowerCase()] ? 1 : 0;
        cmp = aEnrolled - bEnrolled;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [users, searchQuery, filterPosition, filterRole, filterStatus, filterFaceId, faceProfilesMap, sortBy, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const toggleSelectUser = (username: string) => {
    setSelectedUsernames((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  };

  const allFilteredSelected =
    filteredUsers.length > 0 && filteredUsers.every((u) => selectedUsernames.has(u.username));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedUsernames((prev) => {
        const next = new Set(prev);
        filteredUsers.forEach((u) => next.delete(u.username));
        return next;
      });
    } else {
      setSelectedUsernames((prev) => {
        const next = new Set(prev);
        filteredUsers.forEach((u) => next.add(u.username));
        return next;
      });
    }
  };

  const stats = useMemo(() => {
    const adminCount = users.filter(u => u.role === 'admin').length;
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
      if (!res) return;
      if (res.ok) Swal.fire('Thành công', `Đã đặt lại mật khẩu cho ${fullname} thành Kg123456`, 'success');
      else Swal.fire('Lỗi', res.message || 'Không thể đổi mật khẩu', 'error');
    }
  };

  const handleResetFaceProfile = async (username: string, fullname: string) => {
    const result = await Swal.fire({
      title: 'Mở khóa / Đặt lại Face ID',
      html: `Xóa hồ sơ khuôn mặt hiện tại của <b>${fullname}</b> (@${username}) để nhân sự có thể <b>đăng ký lại 5 góc khuôn mặt mới</b>?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#C8432B',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Mở khóa & Đặt lại',
      cancelButtonText: 'Hủy',
    });
    if (!result.isConfirmed) return;

    setUpdatingUser(username);
    const res = await callApi('RESET_FACE_PROFILE', {
      role: 'admin',
      adminUsername: currentUser?.username,
      targetUsername: username,
    });
    setUpdatingUser(null);

    if (!res) return;

    if (res.ok) {
      const { removeCachedFaceProfile } = await import('../../services/faceRecognitionV2');
      removeCachedFaceProfile(username);
      setFaceProfilesMap((prev) => {
        const copy = { ...prev };
        delete copy[username.trim().toLowerCase()];
        return copy;
      });
      Swal.fire(
        'Đã mở khóa Face ID',
        `Nhân sự ${fullname} đã có thể đăng ký lại 5 góc khuôn mặt mới trên ứng dụng.`,
        'success'
      );
    } else {
      Swal.fire('Lỗi', res.message || 'Không thể đặt lại hồ sơ khuôn mặt.', 'error');
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
    if (!res) return;
    if (res.ok) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Đã cấp quyền ${newRole} cho ${fullname}`, showConfirmButton: false, timer: 2000 });
      store.setUsers(users.map(u => u.username === username ? { ...u, role: newRole } : u));
    } else Swal.fire('Lỗi', res.message || 'Không thể cập nhật', 'error');
  };

  const handleUpdatePosition = async (username: string, fullname: string, newPosition: string) => {
    setUpdatingUser(username);
    const res = await callApi('UPDATE_USER_POSITION', { targetUsername: username, newPosition });
    setUpdatingUser(null);
    if (!res) return;
    if (res.ok) {
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Đã đổi ${fullname} sang ${newPosition}`, showConfirmButton: false, timer: 2000 });
      store.setUsers(users.map(u => u.username === username ? { ...u, position: newPosition } : u));
    } else Swal.fire('Lỗi', res.message || 'Không thể cập nhật', 'error');
  };

  const handleBulkPosition = async () => {
    const targets = Array.from(selectedUsernames);
    if (targets.length === 0) return;
    const confirm = await Swal.fire({
      title: 'Cập nhật bộ phận hàng loạt',
      text: `Chuyển ${targets.length} nhân sự đã chọn sang bộ phận "${bulkPosition}"?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0b253c',
      confirmButtonText: 'Áp dụng',
      cancelButtonText: 'Hủy',
    });
    if (!confirm.isConfirmed) return;

    setBulkBusy(true);
    let successCount = 0;
    const updatedSet = new Set<string>();
    for (const username of targets) {
      const res = await callApi('UPDATE_USER_POSITION', { targetUsername: username, newPosition: bulkPosition }, { background: true });
      if (res?.ok) {
        successCount++;
        updatedSet.add(username);
      }
    }
    if (updatedSet.size > 0) {
      store.setUsers(users.map((u) => (updatedSet.has(u.username) ? { ...u, position: bulkPosition } : u)));
    }
    setBulkBusy(false);
    setSelectedUsernames(new Set());
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: successCount === targets.length ? 'success' : 'warning',
      title: `Đã đổi bộ phận cho ${successCount}/${targets.length} nhân sự`,
      showConfirmButton: false,
      timer: 2500,
    });
  };

  const handleBulkResetFace = async () => {
    const targets = Array.from(selectedUsernames).filter((un) => Boolean(faceProfilesMap[un.trim().toLowerCase()]));
    if (targets.length === 0) {
      Swal.fire('Chú ý', 'Các nhân sự đang chọn chưa có hồ sơ Face ID để mở khóa.', 'info');
      return;
    }
    const confirm = await Swal.fire({
      title: 'Mở khóa Face ID hàng loạt',
      text: `Đặt lại hồ sơ Face ID của ${targets.length} nhân sự đã đăng ký?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#C8432B',
      confirmButtonText: 'Mở khóa',
      cancelButtonText: 'Hủy',
    });
    if (!confirm.isConfirmed) return;

    setBulkBusy(true);
    const { removeCachedFaceProfile } = await import('../../services/faceRecognitionV2');
    let successCount = 0;
    const removedKeys: string[] = [];
    for (const username of targets) {
      const res = await callApi(
        'RESET_FACE_PROFILE',
        { role: 'admin', adminUsername: currentUser?.username, targetUsername: username },
        { background: true }
      );
      if (res?.ok) {
        successCount++;
        removeCachedFaceProfile(username);
        removedKeys.push(username.trim().toLowerCase());
      }
    }
    if (removedKeys.length > 0) {
      setFaceProfilesMap((prev) => {
        const copy = { ...prev };
        removedKeys.forEach((k) => delete copy[k]);
        return copy;
      });
    }
    setBulkBusy(false);
    setSelectedUsernames(new Set());
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: successCount === targets.length ? 'success' : 'warning',
      title: `Đã mở khóa Face ID cho ${successCount}/${targets.length} nhân sự`,
      showConfirmButton: false,
      timer: 2500,
    });
  };

  const handleBulkResetPassword = async () => {
    const targets = Array.from(selectedUsernames);
    if (targets.length === 0) return;
    const confirm = await Swal.fire({
      title: 'Đặt lại mật khẩu hàng loạt',
      text: `Khôi phục mật khẩu về mặc định (Kg123456) cho ${targets.length} nhân sự đã chọn?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Đặt lại',
      cancelButtonText: 'Hủy',
    });
    if (!confirm.isConfirmed) return;

    setBulkBusy(true);
    let successCount = 0;
    for (const username of targets) {
      const res = await callApi('FORCE_RESET_PASSWORD', { targetUsername: username }, { background: true });
      if (res?.ok) successCount++;
    }
    setBulkBusy(false);
    setSelectedUsernames(new Set());
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: successCount === targets.length ? 'success' : 'warning',
      title: `Đã đặt lại mật khẩu ${successCount}/${targets.length} nhân sự`,
      showConfirmButton: false,
      timer: 2500,
    });
  };

  const handleUpdateEmploymentStatus = (user: typeof users[number]) => {
    if (currentUser?.role !== 'admin') {
      Swal.fire('Không có quyền', 'Chỉ admin được thay đổi trạng thái hoạt động.', 'warning');
      return;
    }
    const currentStatus = normalizeEmploymentStatus(user.employmentStatus);
    setStatusDraft({
      employmentStatus: currentStatus,
      statusUntil: user.statusUntil || '',
      statusReason: user.statusReason || '',
    });
    setStatusError('');
    setStatusModalUser(user);
  };

  const submitEmploymentStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalUser || !currentUser) return;
    const { employmentStatus, statusUntil } = statusDraft;
    const statusReason = statusDraft.statusReason.trim();
    if (employmentStatus === 'suspended' && !statusUntil) {
      setStatusError('Đình chỉ cần có ngày kết thúc');
      return;
    }
    if (employmentStatus !== 'active' && !statusReason) {
      setStatusError('Vui lòng nhập lý do thay đổi trạng thái');
      return;
    }
    const targetUser = statusModalUser;
    setStatusModalUser(null);
    setUpdatingUser(targetUser.username);
    const res = await callApi('UPDATE_EMPLOYMENT_STATUS', {
      role: currentUser.role,
      username: currentUser.username,
      targetUsername: targetUser.username,
      employmentStatus,
      statusUntil,
      statusReason,
    });
    setUpdatingUser(null);
    if (!res) return;
    if (!res.ok) {
      Swal.fire('Không thể cập nhật', res.message || 'Vui lòng thử lại.', 'error');
      return;
    }
    store.setUsers(users.map(item => (
      item.username === targetUser.username ? { ...item, ...res.data.profile } : item
    )));
    Swal.fire({
      icon: 'success',
      title: 'Đã cập nhật trạng thái',
      text: `${targetUser.fullname}: ${getEmploymentStatusMeta(employmentStatus).label}`,
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin': return { label: 'Admin', cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50' };
      case 'tester': return { label: 'Tester', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800/50' };
      default: return { label: 'Nhân viên', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' };
    }
  };

  const getAvatarColor = (name: string) => {
    const colors = ['from-blue-600 to-cyan-600', 'from-teal-600 to-cyan-600', 'from-amber-500 to-orange-500', 'from-emerald-600 to-teal-600', 'from-rose-500 to-red-500', 'from-slate-700 to-slate-800', 'from-sky-600 to-blue-600', 'from-emerald-500 to-green-600'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const resetFilters = () => {
    setSearchQuery('');
    setFilterPosition('all');
    setFilterRole('all');
    setFilterStatus('all');
    setFilterFaceId('all');
  };

  const hasActiveFilter =
    Boolean(searchQuery) ||
    filterPosition !== 'all' ||
    filterRole !== 'all' ||
    filterStatus !== 'all' ||
    filterFaceId !== 'all';

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-24 md:pb-12 max-w-7xl mx-auto">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

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
            <p className="text-xl sm:text-2xl font-mono tabular-nums font-black text-[var(--kg-text)] mt-1">{s.value}</p>
            <p className="text-[10px] font-black text-[var(--kg-text-muted)] uppercase tracking-wider">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3.5 rounded-2xl shadow-xs">
        <div className="flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)]" />
            <input type="text" placeholder="Tìm tên, username, email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl text-xs sm:text-sm font-bold text-[var(--kg-text)] focus:ring-2 focus:ring-[var(--kg-primary)] outline-none transition-all min-h-[44px]" />
            {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"><X size={14} /></button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex gap-2">
            <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)} aria-label="Lọc bộ phận" className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold outline-none cursor-pointer w-full lg:w-auto min-h-[44px]">
              <option value="all">Tất cả bộ phận</option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)} aria-label="Lọc phân quyền" className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold outline-none cursor-pointer w-full lg:w-auto min-h-[44px]">
              <option value="all">Tất cả quyền</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} aria-label="Lọc trạng thái" className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold outline-none cursor-pointer w-full lg:w-auto min-h-[44px]">
              <option value="all">Tất cả trạng thái</option>
              {employmentStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
            <select value={filterFaceId} onChange={e => setFilterFaceId(e.target.value as 'all' | 'enrolled' | 'unenrolled')} aria-label="Lọc trạng thái Face ID" className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold outline-none cursor-pointer w-full lg:w-auto min-h-[44px]">
              <option value="all">Tất cả Face ID</option>
              <option value="enrolled">Đã đăng ký</option>
              <option value="unenrolled">Chưa đăng ký</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 ml-1">
          <p className="text-[11px] text-[var(--kg-text-muted)] font-bold font-mono tabular-nums">
            Hiển thị {filteredUsers.length} / {users.length} nhân viên
            {hasActiveFilter && (
              <button type="button" onClick={resetFilters} className="ml-2 font-sans text-[var(--kg-accent-ink)] hover:underline font-black">Xóa lọc</button>
            )}
          </p>
          {!isDesktop && filteredUsers.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              className="text-[11px] font-bold text-[var(--kg-primary-ink)] hover:underline inline-flex items-center gap-1"
            >
              <CheckSquare size={12} />
              <span>{allFilteredSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả đang lọc'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bulk Selection Toolbar */}
      {selectedUsernames.size > 0 && (
        <div className="sticky top-[68px] z-20 bg-[var(--kg-surface)] border border-[var(--kg-primary)]/40 rounded-2xl p-3 shadow-md flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-[var(--kg-primary)] text-white text-xs font-black font-mono tabular-nums">
              Đã chọn {selectedUsernames.size}
            </span>
            <button
              type="button"
              onClick={() => setSelectedUsernames(new Set())}
              className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)]"
            >
              Bỏ chọn
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <select
                value={bulkPosition}
                onChange={(e) => setBulkPosition(e.target.value)}
                aria-label="Chọn bộ phận áp dụng hàng loạt"
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-text)]"
              >
                {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void handleBulkPosition()}
                className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--kg-primary)] text-white text-xs font-bold disabled:opacity-50"
              >
                Đổi bộ phận
              </button>
            </div>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void handleBulkResetFace()}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Unlock size={13} /> Mở khóa Face ID
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void handleBulkResetPassword()}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
            >
              <KeyRound size={13} /> Đặt lại MK
            </button>
          </div>
        </div>
      )}

      {/* Employee List: Desktop Sticky Sortable Table OR Mobile Cards */}
      {isDesktop ? (
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs overflow-hidden">
          {filteredUsers.length === 0 ? (
            <div className="p-10 text-center">
              <Search size={32} className="mx-auto mb-3 text-[var(--kg-text-muted)]" />
              <p className="text-sm text-[var(--kg-text-muted)] font-medium">Không tìm thấy nhân viên nào</p>
              <button type="button" onClick={resetFilters} className="text-xs text-[var(--kg-primary-ink)] font-black mt-2 hover:underline">Xóa bộ lọc</button>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[68vh] overflow-y-auto">
              <table className="w-full text-left border-collapse min-w-[980px]">
                <thead className="sticky top-0 z-10 bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] text-[11px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        aria-label="Chọn tất cả nhân viên đang hiển thị"
                        className="w-4 h-4 rounded accent-[var(--kg-primary)] cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3">
                      <button type="button" onClick={() => toggleSort('fullname')} className="inline-flex items-center gap-1 hover:text-[var(--kg-text)]">
                        <span>Nhân sự</span>
                        <ArrowUpDown size={12} />
                      </button>
                    </th>
                    <th className="py-3 px-3 w-36">
                      <button type="button" onClick={() => toggleSort('position')} className="inline-flex items-center gap-1 hover:text-[var(--kg-text)]">
                        <span>Bộ phận</span>
                        <ArrowUpDown size={12} />
                      </button>
                    </th>
                    <th className="py-3 px-3 w-32">
                      <button type="button" onClick={() => toggleSort('role')} className="inline-flex items-center gap-1 hover:text-[var(--kg-text)]">
                        <span>Phân quyền</span>
                        <ArrowUpDown size={12} />
                      </button>
                    </th>
                    <th className="py-3 px-3 w-40">
                      <button type="button" onClick={() => toggleSort('employmentStatus')} className="inline-flex items-center gap-1 hover:text-[var(--kg-text)]">
                        <span>Trạng thái</span>
                        <ArrowUpDown size={12} />
                      </button>
                    </th>
                    <th className="py-3 px-3 w-64">
                      <button type="button" onClick={() => toggleSort('faceId')} className="inline-flex items-center gap-1 hover:text-[var(--kg-text)]">
                        <span>Face ID</span>
                        <ArrowUpDown size={12} />
                      </button>
                    </th>
                    <th className="py-3 px-3 w-28 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--kg-border)] text-xs">
                  {filteredUsers.map((user) => {
                    const isProcessing = updatingUser === user.username;
                    const badge = getRoleBadge(user.role || 'user');
                    const statusMeta = getEmploymentStatusMeta(user.employmentStatus);
                    const avatarColor = getAvatarColor(user.fullname);
                    const isUploading = uploadingAvatar === user.username;
                    const faceProfile = faceProfilesMap[user.username.trim().toLowerCase()];
                    const isSelected = selectedUsernames.has(user.username);

                    return (
                      <tr
                        key={user.username}
                        className={`transition-colors ${
                          isSelected ? 'bg-[var(--kg-primary-soft)]/50' : 'hover:bg-[var(--kg-surface-soft)]/40'
                        } ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectUser(user.username)}
                            aria-label={`Chọn ${user.fullname}`}
                            className="w-4 h-4 rounded accent-[var(--kg-primary)] cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <button
                              type="button"
                              onClick={() => handleAvatarClick(user.username)}
                              title="Đổi ảnh đại diện"
                              className="relative group flex-shrink-0 rounded-xl overflow-hidden"
                            >
                              {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt={user.fullname} className="w-10 h-10 rounded-xl object-cover border border-[var(--kg-border)]" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} />
                              ) : null}
                              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white font-bold text-sm ${user.avatarUrl ? 'hidden' : ''}`}>
                                {user.fullname.charAt(0).toUpperCase()}
                              </div>
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                {isUploading ? <Loader2 size={14} className="text-white animate-spin" /> : <Camera size={14} className="text-white" />}
                              </div>
                            </button>
                            <div className="min-w-0">
                              <p className="font-extrabold text-[var(--kg-text)] text-sm truncate">{user.fullname}</p>
                              <p className="text-[11px] font-mono text-[var(--kg-text-muted)] truncate">
                                @{user.username}{user.email ? ` · ${user.email}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <select
                            value={user.position || 'Phục vụ'}
                            aria-label={`Chức vụ của ${user.fullname}`}
                            onChange={(e) => handleUpdatePosition(user.username, user.fullname, e.target.value)}
                            className="w-full min-h-[34px] bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer"
                          >
                            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="py-3 px-3">
                          <select
                            value={user.role || 'user'}
                            aria-label={`Phân quyền của ${user.fullname}`}
                            onChange={(e) => handleUpdateRole(user.username, user.fullname, e.target.value)}
                            className={`w-full min-h-[34px] bg-[var(--kg-surface-soft)] text-[var(--kg-text)] rounded-lg px-2 py-1 text-xs font-bold cursor-pointer border ${badge.cls}`}
                          >
                            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${statusMeta.badgeClass}`}>
                              {statusMeta.shortLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateEmploymentStatus(user)}
                              className="min-h-[30px] px-2 py-0.5 rounded-lg border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)]/40 text-[11px] font-bold text-[var(--kg-text)]"
                            >
                              Đổi
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {statusMeta.value === 'active' ? (
                              <button
                                type="button"
                                onClick={() => setSelectedStaffForFaceEnroll(user)}
                                data-testid={`enroll-face-id-${user.username}`}
                                className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 transition-colors ${
                                  faceProfile
                                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                    : 'bg-[var(--kg-primary-soft)] hover:opacity-90 text-[var(--kg-primary-ink)] border-[var(--kg-primary)]/30'
                                }`}
                              >
                                {faceProfile ? <ShieldCheck size={13} /> : <UserPlus size={13} />}
                                <span>{faceProfile ? `Đã khóa (${faceProfile.anglesCount || 5})` : 'Đăng ký'}</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--kg-text-muted)]">
                                <ScanFace size={12} /> {faceProfile ? 'Đã có' : 'Chưa ĐK'}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleResetFaceProfile(user.username, user.fullname)}
                              data-testid={`reset-face-id-${user.username}`}
                              title="Mở khóa / Đặt lại Face ID"
                              className="min-h-[34px] px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                            >
                              <Unlock size={12} /> Mở khóa
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleForceReset(user.username, user.fullname)}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                          >
                            <KeyRound size={12} /> Reset MK
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filteredUsers.map((user, idx) => {
              const isProcessing = updatingUser === user.username;
              const badge = getRoleBadge(user.role || 'user');
              const statusMeta = getEmploymentStatusMeta(user.employmentStatus);
              const avatarColor = getAvatarColor(user.fullname);
              const isExpanded = expandedUser === user.username;
              const isUploading = uploadingAvatar === user.username;
              const faceProfile = faceProfilesMap[user.username.trim().toLowerCase()];
              const isSelected = selectedUsernames.has(user.username);

              return (
                <motion.div key={user.username} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                  className={`bg-[var(--kg-surface)] border rounded-2xl overflow-hidden shadow-xs hover:border-[var(--kg-border-strong)] transition-all duration-200 ${isSelected ? 'border-[var(--kg-primary)] ring-1 ring-[var(--kg-primary)]/25' : 'border-[var(--kg-border)]'} ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                  
                  {/* Main Info Row */}
                  <div className="p-4 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectUser(user.username)}
                      aria-label={`Chọn ${user.fullname}`}
                      className="mt-3 w-4 h-4 rounded accent-[var(--kg-primary)] cursor-pointer flex-shrink-0"
                    />
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
                        {faceProfile ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (statusMeta.value === 'active') setSelectedStaffForFaceEnroll(user);
                            }}
                            title="Nhấn để quét lại 5 góc khuôn mặt cho nhân sự này"
                            className="inline-flex items-center gap-1.5 min-h-[36px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                          >
                            <ShieldCheck size={13} className="flex-shrink-0" /> Face ID: Đã khóa ({faceProfile.anglesCount || 5} góc)
                          </button>
                        ) : statusMeta.value === 'active' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStaffForFaceEnroll(user);
                            }}
                            className="inline-flex items-center gap-1.5 min-h-[36px] bg-[var(--kg-primary)]/10 hover:bg-[var(--kg-primary)]/20 text-[var(--kg-primary)] border border-[var(--kg-primary)]/30 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors"
                          >
                            <UserPlus size={13} className="flex-shrink-0" /> + Đăng ký Face ID
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] px-2.5 py-1 rounded-lg font-semibold">
                            <ScanFace size={12} /> Chưa đăng ký Face ID
                          </span>
                        )}
                        {user.dob && <span className="inline-flex items-center gap-1"><Calendar size={10} /> {user.dob}</span>}
                        {user.email && <span className="inline-flex items-center gap-1 min-w-0"><Mail size={10} className="flex-shrink-0" /><span className="truncate max-w-[180px]">{user.email}</span></span>}
                      </div>
                    </div>

                    {/* Expand Toggle */}
                    <button
                      type="button"
                      aria-label={isExpanded ? 'Thu gọn chi tiết nhân sự' : 'Mở rộng chi tiết nhân sự'}
                      onClick={() => setExpandedUser(isExpanded ? null : user.username)}
                      className="w-11 h-11 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl hover:bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] flex-shrink-0 mt-0.5 transition-colors"
                    >
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
                              {isAdminUser(currentUser) && (
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
                            <div className="sm:self-end flex flex-col sm:flex-row flex-wrap gap-2">
                              {statusMeta.value === 'active' && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedStaffForFaceEnroll(user)}
                                  data-testid={`enroll-face-id-${user.username}`}
                                  className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-colors"
                                >
                                  <UserPlus size={14} />
                                  <span>{faceProfile ? 'Quét lại 5 góc Face ID' : 'Đăng ký khuôn mặt 5 góc'}</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleResetFaceProfile(user.username, user.fullname)}
                                data-testid={`reset-face-id-${user.username}`}
                                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition-colors"
                              >
                                <Unlock size={14} />
                                <span>Mở khóa / Đặt lại Face ID</span>
                              </button>
                              <button onClick={() => handleForceReset(user.username, user.fullname)}
                                className="w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-colors">
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
              <button type="button" onClick={resetFilters} className="text-xs text-[var(--kg-primary-ink)] font-black mt-2 hover:underline">Xóa bộ lọc</button>
            </div>
          )}
        </div>
      )}

      {/* Loading overlay */}
      {(updatingUser || uploadingAvatar) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--kg-primary)] text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-bold">
          <Loader2 size={14} className="animate-spin" /> {uploadingAvatar ? 'Đang upload ảnh...' : 'Đang cập nhật...'}
        </div>
      )}

      {/* Modal: Cập nhật trạng thái hoạt động */}
      <KgBottomSheet
        isOpen={Boolean(statusModalUser)}
        onClose={() => setStatusModalUser(null)}
        title={statusModalUser ? `Trạng thái của ${statusModalUser.fullname}` : 'Trạng thái hoạt động'}
      >
        <form onSubmit={submitEmploymentStatus} className="space-y-4">
          <KgSelect
            label="Trạng thái hoạt động"
            value={statusDraft.employmentStatus}
            onChange={e => {
              setStatusDraft(prev => ({ ...prev, employmentStatus: e.target.value as EmploymentStatus }));
              if (statusError) setStatusError('');
            }}
          >
            {employmentStatuses.map(item => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </KgSelect>

          <KgInput
            label="Ngày kết thúc (bắt buộc khi đình chỉ)"
            type="date"
            value={statusDraft.statusUntil}
            onChange={e => {
              setStatusDraft(prev => ({ ...prev, statusUntil: e.target.value }));
              if (statusError) setStatusError('');
            }}
          />

          <KgTextarea
            label="Lý do / ghi chú"
            maxLength={500}
            placeholder="Nêu lý do tạm nghỉ, đình chỉ hoặc nghỉ việc..."
            value={statusDraft.statusReason}
            onChange={e => {
              setStatusDraft(prev => ({ ...prev, statusReason: e.target.value }));
              if (statusError) setStatusError('');
            }}
            error={statusError}
          />

          <div className="flex gap-3 pt-2">
            <KgButton variant="secondary" className="flex-1" onClick={() => setStatusModalUser(null)}>
              Hủy
            </KgButton>
            <KgButton type="submit" variant="primary" className="flex-1">
              Cập nhật trạng thái
            </KgButton>
          </div>
        </form>
      </KgBottomSheet>

      {/* Admin-Assisted 5-Angle Face Enrollment Modal for Selected Employee */}
      <Suspense fallback={null}>
        {selectedStaffForFaceEnroll && (
          <FaceEnrollmentModal
            isOpen={Boolean(selectedStaffForFaceEnroll)}
            onClose={() => setSelectedStaffForFaceEnroll(null)}
            user={selectedStaffForFaceEnroll}
            existingProfiles={Object.values(faceProfilesMap)}
            enrolledByAdmin={true}
            adminActorUsername={currentUser?.username}
            onEnrolledSuccess={(newDto) => {
              void import('../../services/faceRecognitionV2')
                .then(({ upsertCachedFaceProfile }) => upsertCachedFaceProfile(newDto))
                .catch(() => {});
              setFaceProfilesMap((prev) => ({
                ...prev,
                [newDto.username.trim().toLowerCase()]: newDto,
              }));
            }}
            onStartScanningNow={() => {
              setSelectedStaffForFaceEnroll(null);
              try {
                localStorage.setItem('kg_checkin_mode_v2', 'v2');
              } catch {
                // ignore storage quota errors
              }
              store.setCurrentTab('checkin');
            }}
          />
        )}
      </Suspense>
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
