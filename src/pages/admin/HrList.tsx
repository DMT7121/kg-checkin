import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  KeyRound,
  Loader2,
  Search,
  Unlock,
  X,
} from 'lucide-react';
import HrDesktopTable, {
  type HrSortField,
  type HrUserActions,
} from '../../components/admin/HrDesktopTable';
import HrMobileCardList from '../../components/admin/HrMobileCardList';
import {
  KgBottomSheet,
  KgButton,
  KgInput,
  KgModuleHero,
  KgSelect,
  KgTextarea,
} from '../../components/KgDesignSystem';
import { callApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { kgConfirm, kgToast } from '../../store/useFeedbackStore';
import {
  employmentStatuses,
  getEmploymentStatusMeta,
  normalizeEmploymentStatus,
  type EmploymentStatus,
} from '../../utils/employment';
import type { RawFaceProfileDto } from '../../utils/faceProfileCache';
import { encodeOptimalCanvas } from '../../utils/helpers';
import { isAdminUser } from '../../utils/permissions';

const FaceEnrollmentModal = lazy(() => import('../../components/FaceEnrollmentModal'));

const HR_POSITIONS = [
  'Phục vụ',
  'Tổ trưởng',
  'Quản lý',
  'Thu ngân',
  'Bếp',
  'Pha chế',
  'Tạp vụ',
  'Bảo vệ',
] as const;

const HR_ROLES = [
  { value: 'user', label: 'Nhân viên' },
  { value: 'tester', label: 'Tester' },
  { value: 'admin', label: 'Admin' },
] as const;

function getHrRoleBadge(role: string) {
  switch (role) {
    case 'admin':
      return {
        label: 'Admin',
        cls: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/50',
      };
    case 'tester':
      return {
        label: 'Tester',
        cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800/50',
      };
    default:
      return {
        label: 'Nhân viên',
        cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50',
      };
  }
}

function getHrAvatarColor(name: string) {
  const colors = [
    'from-blue-600 to-cyan-600',
    'from-teal-600 to-cyan-600',
    'from-amber-500 to-orange-500',
    'from-emerald-600 to-teal-600',
    'from-rose-500 to-red-500',
    'from-slate-700 to-slate-800',
    'from-sky-600 to-blue-600',
    'from-emerald-500 to-green-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function useIsDesktopLg() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
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
  const isDesktop = useIsDesktopLg();

  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPosition, setFilterPosition] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterFaceId, setFilterFaceId] = useState<'all' | 'enrolled' | 'unenrolled'>('all');
  const [sortBy, setSortBy] = useState<HrSortField>('fullname');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedUsernames, setSelectedUsernames] = useState<Set<string>>(() => new Set());
  const [bulkPosition, setBulkPosition] = useState('Phục vụ');
  const [bulkProgress, setBulkProgress] = useState<{
    done: number;
    total: number;
    label: string;
  } | null>(null);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarTarget, setAvatarTarget] = useState<string | null>(null);
  const [statusModalUser, setStatusModalUser] = useState<(typeof users)[number] | null>(null);
  const [statusDraft, setStatusDraft] = useState<{
    employmentStatus: EmploymentStatus;
    statusUntil: string;
    statusReason: string;
  }>({ employmentStatus: 'active', statusUntil: '', statusReason: '' });
  const [statusError, setStatusError] = useState('');
  const [faceProfilesMap, setFaceProfilesMap] = useState<Record<string, RawFaceProfileDto>>({});
  const [selectedStaffForFaceEnroll, setSelectedStaffForFaceEnroll] = useState<
    (typeof users)[number] | null
  >(null);

  useEffect(() => {
    if (!currentUser || !isAdminUser(currentUser)) return;
    let active = true;
    import('../../utils/faceProfileCache')
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
      { background: true, cacheTtlMs: 0 },
    )
      .then(async (res) => {
        if (!active || !res?.ok || !Array.isArray(res.data?.profiles)) return;
        const { setCachedFaceProfiles } = await import('../../utils/faceProfileCache');
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

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = users.filter((u) => {
      const matchSearch =
        !q ||
        u.fullname.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q));
      const matchPos = filterPosition === 'all' || (u.position || 'Phục vụ') === filterPosition;
      const matchRole = filterRole === 'all' || (u.role || 'user') === filterRole;
      const matchStatus =
        filterStatus === 'all' || normalizeEmploymentStatus(u.employmentStatus) === filterStatus;
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
        cmp = normalizeEmploymentStatus(a.employmentStatus).localeCompare(
          normalizeEmploymentStatus(b.employmentStatus),
        );
      } else if (sortBy === 'faceId') {
        const aEnrolled = faceProfilesMap[a.username.trim().toLowerCase()] ? 1 : 0;
        const bEnrolled = faceProfilesMap[b.username.trim().toLowerCase()] ? 1 : 0;
        cmp = aEnrolled - bEnrolled;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [
    users,
    searchQuery,
    filterPosition,
    filterRole,
    filterStatus,
    filterFaceId,
    faceProfilesMap,
    sortBy,
    sortDir,
  ]);

  const toggleSort = (field: HrSortField) => {
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
    const active = users.filter((u) => normalizeEmploymentStatus(u.employmentStatus) === 'active').length;
    const leave = users.filter((u) => normalizeEmploymentStatus(u.employmentStatus) === 'leave').length;
    const suspended = users.filter(
      (u) => normalizeEmploymentStatus(u.employmentStatus) === 'suspended',
    ).length;
    const resigned = users.filter(
      (u) => normalizeEmploymentStatus(u.employmentStatus) === 'resigned',
    ).length;
    return { total: users.length, active, leave, suspended, resigned };
  }, [users]);

  const handleAvatarClick = (username: string) => {
    setAvatarTarget(username);
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !avatarTarget) return;
    if (file.size > 5 * 1024 * 1024) {
      kgToast('Vui lòng chọn ảnh dưới 5MB', 'warning', 'Ảnh quá lớn');
      return;
    }

    setUploadingAvatar(avatarTarget);
    try {
      const base64 = await compressAvatar(file, 400);
      const res = await callApi(
        'UPLOAD_AVATAR',
        { username: avatarTarget, image: base64 },
        { background: true },
      );
      if (res?.ok && res.data?.url) {
        setUsers(
          users.map((u) => (u.username === avatarTarget ? { ...u, avatarUrl: res.data.url } : u)),
        );
        kgToast('Đã cập nhật ảnh đại diện', 'success');
      } else {
        kgToast(res?.message || 'Không thể upload ảnh', 'error', 'Lỗi');
      }
    } catch {
      kgToast('Upload ảnh thất bại', 'error', 'Lỗi');
    }
    setUploadingAvatar(null);
    setAvatarTarget(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleForceReset = async (username: string, fullname: string) => {
    const confirmed = await kgConfirm({
      title: 'Khôi phục mật khẩu',
      message: `Bạn có chắc chắn muốn khôi phục mật khẩu của ${fullname} về mặc định Kg123456 không?`,
      confirmLabel: 'Đồng ý',
      cancelLabel: 'Hủy',
      tone: 'danger',
    });
    if (confirmed) {
      setUpdatingUser(username);
      const res = await callApi('FORCE_RESET_PASSWORD', { targetUsername: username });
      setUpdatingUser(null);
      if (!res) return;
      if (res.ok) {
        kgToast(`Đã đặt lại mật khẩu cho ${fullname} thành Kg123456`, 'success', 'Thành công');
      } else {
        kgToast(res.message || 'Không thể đổi mật khẩu', 'error', 'Lỗi');
      }
    }
  };

  const handleResetFaceProfile = async (username: string, fullname: string) => {
    const confirmed = await kgConfirm({
      title: 'Mở khóa / Đặt lại Face ID',
      message: `Xóa hồ sơ khuôn mặt hiện tại của ${fullname} (@${username}) để nhân sự có thể đăng ký lại 5 góc khuôn mặt mới?`,
      confirmLabel: 'Mở khóa & Đặt lại',
      cancelLabel: 'Hủy',
      tone: 'warning',
    });
    if (!confirmed) return;

    setUpdatingUser(username);
    const res = await callApi('RESET_FACE_PROFILE', {
      role: 'admin',
      adminUsername: currentUser?.username,
      targetUsername: username,
    });
    setUpdatingUser(null);
    if (!res) return;

    if (res.ok) {
      const { removeCachedFaceProfile } = await import('../../utils/faceProfileCache');
      removeCachedFaceProfile(username);
      setFaceProfilesMap((prev) => {
        const copy = { ...prev };
        delete copy[username.trim().toLowerCase()];
        return copy;
      });
      kgToast(
        `Nhân sự ${fullname} đã có thể đăng ký lại 5 góc khuôn mặt mới trên ứng dụng.`,
        'success',
        'Đã mở khóa Face ID',
      );
    } else {
      kgToast(res.message || 'Không thể đặt lại hồ sơ khuôn mặt.', 'error', 'Lỗi');
    }
  };

  const handleUpdateRole = async (username: string, fullname: string, newRole: string) => {
    if (username === currentUser?.username && newRole !== 'admin') {
      const confirmed = await kgConfirm({
        title: 'Cảnh báo',
        message: 'Bạn đang tự hạ quyền Admin!',
        confirmLabel: 'Tiếp tục',
        cancelLabel: 'Hủy',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    setUpdatingUser(username);
    const res = await callApi('UPDATE_USER_ROLE', { targetUsername: username, newRole });
    setUpdatingUser(null);
    if (!res) return;
    if (res.ok) {
      kgToast(`Đã cấp quyền ${newRole} cho ${fullname}`, 'success');
      setUsers(users.map((u) => (u.username === username ? { ...u, role: newRole } : u)));
    } else {
      kgToast(res.message || 'Không thể cập nhật', 'error', 'Lỗi');
    }
  };

  const handleUpdatePosition = async (username: string, fullname: string, newPosition: string) => {
    setUpdatingUser(username);
    const res = await callApi('UPDATE_USER_POSITION', { targetUsername: username, newPosition });
    setUpdatingUser(null);
    if (!res) return;
    if (res.ok) {
      kgToast(`Đã đổi ${fullname} sang ${newPosition}`, 'success');
      setUsers(users.map((u) => (u.username === username ? { ...u, position: newPosition } : u)));
    } else {
      kgToast(res.message || 'Không thể cập nhật', 'error', 'Lỗi');
    }
  };

  const handleBulkPosition = async () => {
    const targets = Array.from(selectedUsernames);
    if (targets.length === 0 || bulkProgress) return;
    const confirmed = await kgConfirm({
      title: 'Cập nhật bộ phận hàng loạt',
      message: `Chuyển ${targets.length} nhân sự đã chọn sang bộ phận "${bulkPosition}"?`,
      confirmLabel: 'Áp dụng',
      cancelLabel: 'Hủy',
      tone: 'primary',
    });
    if (!confirmed) return;

    setBulkProgress({ done: 0, total: targets.length, label: 'Đổi bộ phận' });
    let successCount = 0;
    const updatedSet = new Set<string>();
    for (let i = 0; i < targets.length; i += 1) {
      const username = targets[i];
      const res = await callApi(
        'UPDATE_USER_POSITION',
        { targetUsername: username, newPosition: bulkPosition },
        { background: true },
      );
      if (res?.ok) {
        successCount += 1;
        updatedSet.add(username);
      }
      setBulkProgress({ done: i + 1, total: targets.length, label: 'Đổi bộ phận' });
    }
    if (updatedSet.size > 0) {
      setUsers(
        users.map((u) => (updatedSet.has(u.username) ? { ...u, position: bulkPosition } : u)),
      );
    }
    setBulkProgress(null);
    setSelectedUsernames(new Set());
    kgToast(
      `Đã đổi bộ phận cho ${successCount}/${targets.length} nhân sự`,
      successCount === targets.length ? 'success' : 'warning',
    );
  };

  const handleBulkResetFace = async () => {
    if (bulkProgress) return;
    const targets = Array.from(selectedUsernames).filter((un) =>
      Boolean(faceProfilesMap[un.trim().toLowerCase()]),
    );
    if (targets.length === 0) {
      kgToast('Các nhân sự đang chọn chưa có hồ sơ Face ID để mở khóa.', 'info', 'Chú ý');
      return;
    }
    const confirmed = await kgConfirm({
      title: 'Mở khóa Face ID hàng loạt',
      message: `Đặt lại hồ sơ Face ID của ${targets.length} nhân sự đã đăng ký?`,
      confirmLabel: 'Mở khóa',
      cancelLabel: 'Hủy',
      tone: 'warning',
    });
    if (!confirmed) return;

    setBulkProgress({ done: 0, total: targets.length, label: 'Mở khóa Face ID' });
    const { removeCachedFaceProfile } = await import('../../utils/faceProfileCache');
    let successCount = 0;
    const removedKeys: string[] = [];
    for (let i = 0; i < targets.length; i += 1) {
      const username = targets[i];
      const res = await callApi(
        'RESET_FACE_PROFILE',
        { role: 'admin', adminUsername: currentUser?.username, targetUsername: username },
        { background: true },
      );
      if (res?.ok) {
        successCount += 1;
        removeCachedFaceProfile(username);
        removedKeys.push(username.trim().toLowerCase());
      }
      setBulkProgress({ done: i + 1, total: targets.length, label: 'Mở khóa Face ID' });
    }
    if (removedKeys.length > 0) {
      setFaceProfilesMap((prev) => {
        const copy = { ...prev };
        removedKeys.forEach((k) => delete copy[k]);
        return copy;
      });
    }
    setBulkProgress(null);
    setSelectedUsernames(new Set());
    kgToast(
      `Đã mở khóa Face ID cho ${successCount}/${targets.length} nhân sự`,
      successCount === targets.length ? 'success' : 'warning',
    );
  };

  const handleBulkResetPassword = async () => {
    const targets = Array.from(selectedUsernames);
    if (targets.length === 0 || bulkProgress) return;
    const confirmed = await kgConfirm({
      title: 'Đặt lại mật khẩu hàng loạt',
      message: `Khôi phục mật khẩu về mặc định (Kg123456) cho ${targets.length} nhân sự đã chọn?`,
      confirmLabel: 'Đặt lại',
      cancelLabel: 'Hủy',
      tone: 'danger',
    });
    if (!confirmed) return;

    setBulkProgress({ done: 0, total: targets.length, label: 'Đặt lại MK' });
    let successCount = 0;
    for (let i = 0; i < targets.length; i += 1) {
      const username = targets[i];
      const res = await callApi(
        'FORCE_RESET_PASSWORD',
        { targetUsername: username },
        { background: true },
      );
      if (res?.ok) successCount += 1;
      setBulkProgress({ done: i + 1, total: targets.length, label: 'Đặt lại MK' });
    }
    setBulkProgress(null);
    setSelectedUsernames(new Set());
    kgToast(
      `Đã đặt lại mật khẩu ${successCount}/${targets.length} nhân sự`,
      successCount === targets.length ? 'success' : 'warning',
    );
  };

  const handleUpdateEmploymentStatus = (user: (typeof users)[number]) => {
    if (currentUser?.role !== 'admin') {
      kgToast('Chỉ admin được thay đổi trạng thái hoạt động.', 'warning', 'Không có quyền');
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
      kgToast(res.message || 'Vui lòng thử lại.', 'error', 'Không thể cập nhật');
      return;
    }
    setUsers(
      users.map((item) =>
        item.username === targetUser.username ? { ...item, ...res.data.profile } : item,
      ),
    );
    kgToast(
      `${targetUser.fullname}: ${getEmploymentStatusMeta(employmentStatus).label}`,
      'success',
      'Đã cập nhật trạng thái',
    );
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

  const rowActions: HrUserActions = {
    positions: HR_POSITIONS,
    roles: HR_ROLES,
    getRoleBadge: getHrRoleBadge,
    getAvatarColor: getHrAvatarColor,
    onToggleSelect: toggleSelectUser,
    onAvatarClick: handleAvatarClick,
    onUpdatePosition: (username, fullname, pos) => void handleUpdatePosition(username, fullname, pos),
    onUpdateRole: (username, fullname, role) => void handleUpdateRole(username, fullname, role),
    onUpdateEmploymentStatus: handleUpdateEmploymentStatus,
    onEnrollFaceId: (user) => setSelectedStaffForFaceEnroll(user),
    onResetFaceProfile: (username, fullname) => void handleResetFaceProfile(username, fullname),
    onForceResetPassword: (username, fullname) => void handleForceReset(username, fullname),
  };

  const bulkBusy = Boolean(bulkProgress);

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-24 md:pb-12 max-w-7xl mx-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <KgModuleHero
        moduleId="hr-list"
        title="Hồ Sơ Nhân Sự"
        description="Quản lý trạng thái hoạt động, chức vụ, phân quyền và toàn bộ vòng đời hồ sơ nhân sự."
        eyebrow="Nhân sự"
        tipTitle="Hướng dẫn Quản trị Nhân sự"
        tips={[
          'Trạng thái nhân sự: Đang làm việc (đủ điều kiện vào ca), Tạm nghỉ (tạm khóa chấm công), Đình chỉ / Thôi việc.',
          'Cấp tài khoản & Mật khẩu: Có thể đặt lại mật khẩu hoặc mở khóa Face ID hàng loạt.',
          'Chức danh & Vị trí: Gán đúng vai trò Phục vụ, Pha chế, Bếp, Thu ngân để hệ thống phân công checklist chuẩn.',
        ]}
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Đang làm việc',
            value: stats.active,
            bg: 'bg-emerald-500/10 border-emerald-500/20',
            dotCls: 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: 'Tạm nghỉ',
            value: stats.leave,
            bg: 'bg-amber-500/10 border-amber-500/20',
            dotCls: 'text-amber-600 dark:text-amber-400',
          },
          {
            label: 'Đình chỉ',
            value: stats.suspended,
            bg: 'bg-rose-500/10 border-rose-500/20',
            dotCls: 'text-rose-600 dark:text-rose-400',
          },
          {
            label: 'Đã nghỉ việc',
            value: stats.resigned,
            bg: 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)]',
            dotCls: 'text-[var(--kg-text-muted)]',
          },
        ].map((s, i) => (
          <div
            key={i}
            className={`bg-[var(--kg-surface)] border rounded-2xl p-3.5 shadow-xs ${s.bg}`}
          >
            <span className={`text-base ${s.dotCls}`}>●</span>
            <p className="text-xl sm:text-2xl font-mono tabular-nums font-black text-[var(--kg-text)] mt-1">
              {s.value}
            </p>
            <p className="text-[10px] font-black text-[var(--kg-text-muted)] uppercase tracking-wider">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3.5 rounded-2xl shadow-xs">
        <div className="flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)]"
            />
            <input
              type="text"
              placeholder="Tìm tên, username, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl text-base sm:text-sm font-bold text-[var(--kg-text)] focus:ring-2 focus:ring-[var(--kg-primary)] outline-none min-h-[44px]"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Xóa tìm kiếm nhân sự"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex gap-2">
            <select
              value={filterPosition}
              onChange={(e) => setFilterPosition(e.target.value)}
              aria-label="Lọc bộ phận"
              className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-base sm:text-xs font-bold outline-none cursor-pointer w-full lg:w-auto min-h-[44px]"
            >
              <option value="all">Tất cả bộ phận</option>
              {HR_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              aria-label="Lọc phân quyền"
              className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-base sm:text-xs font-bold outline-none cursor-pointer w-full lg:w-auto min-h-[44px]"
            >
              <option value="all">Tất cả quyền</option>
              {HR_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Lọc trạng thái"
              className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-base sm:text-xs font-bold outline-none cursor-pointer w-full lg:w-auto min-h-[44px]"
            >
              <option value="all">Tất cả trạng thái</option>
              {employmentStatuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <select
              value={filterFaceId}
              onChange={(e) =>
                setFilterFaceId(e.target.value as 'all' | 'enrolled' | 'unenrolled')
              }
              aria-label="Lọc trạng thái Face ID"
              className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-base sm:text-xs font-bold outline-none cursor-pointer w-full lg:w-auto min-h-[44px]"
            >
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
              <button
                type="button"
                onClick={resetFilters}
                className="ml-2 font-sans text-[var(--kg-accent-ink)] hover:underline font-black"
              >
                Xóa lọc
              </button>
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

      {/* Bulk Selection Toolbar — offset below sticky ModuleHub bar on md+ */}
      {selectedUsernames.size > 0 && (
        <div className="sticky top-2 md:top-[124px] z-20 bg-[var(--kg-surface)] border border-[var(--kg-primary)]/40 rounded-2xl p-3 shadow-md flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-[var(--kg-primary)] text-white text-xs font-black font-mono tabular-nums">
              Đã chọn {selectedUsernames.size}
            </span>
            {bulkProgress ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-xs font-extrabold font-mono tabular-nums">
                <Loader2 size={13} className="animate-spin" />
                <span>
                  Đang xử lý {bulkProgress.done}/{bulkProgress.total}...
                </span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setSelectedUsernames(new Set())}
                className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)]"
              >
                Bỏ chọn
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <select
                value={bulkPosition}
                onChange={(e) => setBulkPosition(e.target.value)}
                disabled={bulkBusy}
                aria-label="Chọn bộ phận áp dụng hàng loạt"
                className="min-h-[40px] sm:min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-text)]"
              >
                {HR_POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void handleBulkPosition()}
                className="min-h-[40px] sm:min-h-[36px] px-3 py-1 rounded-lg bg-[var(--kg-primary)] text-white text-xs font-bold disabled:opacity-50"
              >
                Đổi bộ phận
              </button>
            </div>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void handleBulkResetFace()}
              className="min-h-[40px] sm:min-h-[36px] px-3 py-1 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Unlock size={13} /> Mở khóa Face ID
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void handleBulkResetPassword()}
              className="min-h-[40px] sm:min-h-[36px] px-3 py-1 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
            >
              <KeyRound size={13} /> Đặt lại MK
            </button>
          </div>
        </div>
      )}

      {/* Employee List: Desktop Table (>= 1024px) OR Mobile/iPad Cards (< 1024px) */}
      {isDesktop ? (
        <HrDesktopTable
          users={filteredUsers}
          selectedUsernames={selectedUsernames}
          allFilteredSelected={allFilteredSelected}
          updatingUser={updatingUser}
          uploadingAvatar={uploadingAvatar}
          faceProfilesMap={faceProfilesMap}
          onToggleSelectAll={toggleSelectAllFiltered}
          onToggleSort={toggleSort}
          onResetFilters={resetFilters}
          actions={rowActions}
        />
      ) : (
        <HrMobileCardList
          users={filteredUsers}
          canEditStatus={isAdminUser(currentUser)}
          selectedUsernames={selectedUsernames}
          expandedUser={expandedUser}
          updatingUser={updatingUser}
          uploadingAvatar={uploadingAvatar}
          faceProfilesMap={faceProfilesMap}
          onToggleExpand={(username) =>
            setExpandedUser((prev) => (prev === username ? null : username))
          }
          onResetFilters={resetFilters}
          actions={rowActions}
        />
      )}

      {/* Loading overlay */}
      {(updatingUser || uploadingAvatar) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--kg-primary)] text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-bold">
          <Loader2 size={14} className="animate-spin" />{' '}
          {uploadingAvatar ? 'Đang upload ảnh...' : 'Đang cập nhật...'}
        </div>
      )}

      {/* Modal: Cập nhật trạng thái hoạt động */}
      <KgBottomSheet
        isOpen={Boolean(statusModalUser)}
        onClose={() => setStatusModalUser(null)}
        title={
          statusModalUser ? `Trạng thái của ${statusModalUser.fullname}` : 'Trạng thái hoạt động'
        }
      >
        <form onSubmit={(e) => void submitEmploymentStatus(e)} className="space-y-4">
          <KgSelect
            label="Trạng thái hoạt động"
            value={statusDraft.employmentStatus}
            onChange={(e) => {
              setStatusDraft((prev) => ({
                ...prev,
                employmentStatus: e.target.value as EmploymentStatus,
              }));
              if (statusError) setStatusError('');
            }}
          >
            {employmentStatuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </KgSelect>

          <KgInput
            label="Ngày kết thúc (bắt buộc khi đình chỉ)"
            type="date"
            value={statusDraft.statusUntil}
            onChange={(e) => {
              setStatusDraft((prev) => ({ ...prev, statusUntil: e.target.value }));
              if (statusError) setStatusError('');
            }}
          />

          <KgTextarea
            label="Lý do / ghi chú"
            maxLength={500}
            placeholder="Nêu lý do tạm nghỉ, đình chỉ hoặc nghỉ việc..."
            value={statusDraft.statusReason}
            onChange={(e) => {
              setStatusDraft((prev) => ({ ...prev, statusReason: e.target.value }));
              if (statusError) setStatusError('');
            }}
            error={statusError}
          />

          <div className="flex gap-3 pt-2">
            <KgButton
              variant="secondary"
              className="flex-1"
              onClick={() => setStatusModalUser(null)}
            >
              Hủy
            </KgButton>
            <KgButton type="submit" variant="primary" className="flex-1">
              Cập nhật trạng thái
            </KgButton>
          </div>
        </form>
      </KgBottomSheet>

      {/* Admin-Assisted 5-Angle Face Enrollment Modal */}
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
              void import('../../utils/faceProfileCache')
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
                // ignore
              }
              setCurrentTab('checkin');
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

function compressAvatar(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
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
