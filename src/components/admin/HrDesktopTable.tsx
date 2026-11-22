import {
  ArrowUpDown,
  Calendar,
  Camera,
  KeyRound,
  Loader2,
  ScanFace,
  Search,
  ShieldCheck,
  Unlock,
  UserPlus,
} from 'lucide-react';
import type { User } from '../../store/useAppStore';
import { getEmploymentStatusMeta } from '../../utils/employment';
import type { RawFaceProfileDto } from '../../utils/faceProfileCache';

export type HrSortField = 'fullname' | 'position' | 'role' | 'employmentStatus' | 'faceId';

export interface HrRoleOption {
  value: string;
  label: string;
}

export interface HrUserActions {
  positions: readonly string[];
  roles: readonly HrRoleOption[];
  getRoleBadge: (role: string) => { label: string; cls: string };
  getAvatarColor: (name: string) => string;
  onToggleSelect: (username: string) => void;
  onAvatarClick: (username: string) => void;
  onUpdatePosition: (username: string, fullname: string, position: string) => void;
  onUpdateRole: (username: string, fullname: string, role: string) => void;
  onUpdateEmploymentStatus: (user: User) => void;
  onEnrollFaceId: (user: User) => void;
  onResetFaceProfile: (username: string, fullname: string) => void;
  onForceResetPassword: (username: string, fullname: string) => void;
}

export interface HrDesktopTableProps {
  users: User[];
  selectedUsernames: Set<string>;
  allFilteredSelected: boolean;
  updatingUser: string | null;
  uploadingAvatar: string | null;
  faceProfilesMap: Record<string, RawFaceProfileDto>;
  onToggleSelectAll: () => void;
  onToggleSort: (field: HrSortField) => void;
  onResetFilters: () => void;
  actions: HrUserActions;
}

export default function HrDesktopTable({
  users,
  selectedUsernames,
  allFilteredSelected,
  updatingUser,
  uploadingAvatar,
  faceProfilesMap,
  onToggleSelectAll,
  onToggleSort,
  onResetFilters,
  actions,
}: HrDesktopTableProps) {
  return (
    <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl shadow-xs overflow-hidden">
      {users.length === 0 ? (
        <div className="p-10 text-center">
          <Search size={32} className="mx-auto mb-3 text-[var(--kg-text-muted)]" />
          <p className="text-sm text-[var(--kg-text-muted)] font-medium">
            Không tìm thấy nhân viên nào
          </p>
          <button
            type="button"
            onClick={onResetFilters}
            className="text-xs text-[var(--kg-primary-ink)] font-black mt-2 hover:underline"
          >
            Xóa bộ lọc
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[68vh] overflow-y-auto">
          <table className="w-full text-left border-collapse min-w-[960px]">
            <thead className="sticky top-0 z-10 bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] text-[11px] font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
              <tr>
                <th className="py-3 px-2 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={onToggleSelectAll}
                    aria-label="Chọn tất cả nhân viên đang hiển thị"
                    className="w-4 h-4 rounded accent-[var(--kg-primary)] cursor-pointer"
                  />
                </th>
                <th className="py-3 px-2 min-w-[185px]">
                  <button
                    type="button"
                    onClick={() => onToggleSort('fullname')}
                    className="inline-flex items-center gap-1 whitespace-nowrap min-h-[32px] hover:text-[var(--kg-text)]"
                  >
                    <span>Nhân sự</span>
                    <ArrowUpDown size={12} className="shrink-0" />
                  </button>
                </th>
                <th className="py-3 px-2 min-w-[140px] w-[140px]">
                  <button
                    type="button"
                    onClick={() => onToggleSort('position')}
                    className="inline-flex items-center gap-1 whitespace-nowrap min-h-[32px] hover:text-[var(--kg-text)]"
                  >
                    <span>Bộ phận</span>
                    <ArrowUpDown size={12} className="shrink-0" />
                  </button>
                </th>
                <th className="py-3 px-2 min-w-[132px] w-[132px]">
                  <button
                    type="button"
                    onClick={() => onToggleSort('role')}
                    className="inline-flex items-center gap-1 whitespace-nowrap min-h-[32px] hover:text-[var(--kg-text)]"
                  >
                    <span>Phân quyền</span>
                    <ArrowUpDown size={12} className="shrink-0" />
                  </button>
                </th>
                <th className="py-3 px-2 min-w-[175px]">
                  <button
                    type="button"
                    onClick={() => onToggleSort('employmentStatus')}
                    className="inline-flex items-center gap-1 whitespace-nowrap min-h-[32px] hover:text-[var(--kg-text)]"
                  >
                    <span>Trạng thái</span>
                    <ArrowUpDown size={12} className="shrink-0" />
                  </button>
                </th>
                <th className="py-3 px-2 w-[202px]">
                  <button
                    type="button"
                    onClick={() => onToggleSort('faceId')}
                    className="inline-flex items-center gap-1 whitespace-nowrap min-h-[32px] hover:text-[var(--kg-text)]"
                  >
                    <span>Face ID</span>
                    <ArrowUpDown size={12} className="shrink-0" />
                  </button>
                </th>
                <th className="py-3 px-2 w-[98px] text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--kg-border)] text-xs">
              {users.map((user) => {
                const isProcessing = updatingUser === user.username;
                const badge = actions.getRoleBadge(user.role || 'user');
                const statusMeta = getEmploymentStatusMeta(user.employmentStatus);
                const avatarColor = actions.getAvatarColor(user.fullname);
                const isUploading = uploadingAvatar === user.username;
                const faceProfile = faceProfilesMap[user.username.trim().toLowerCase()];
                const isSelected = selectedUsernames.has(user.username);

                return (
                  <tr
                    key={user.username}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-[var(--kg-primary-soft)]/50'
                        : 'hover:bg-[var(--kg-surface-2)]'
                    } ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
                  >
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => actions.onToggleSelect(user.username)}
                        aria-label={`Chọn ${user.fullname}`}
                        className="w-4 h-4 rounded accent-[var(--kg-primary)] cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => actions.onAvatarClick(user.username)}
                          title="Đổi ảnh đại diện"
                          aria-label={`Đổi ảnh đại diện ${user.fullname}`}
                          className="relative group flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden"
                        >
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={user.fullname}
                              className="w-10 h-10 rounded-xl object-cover border border-[var(--kg-border)]"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (
                                  e.target as HTMLImageElement
                                ).nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div
                            className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white font-bold text-sm ${user.avatarUrl ? 'hidden' : ''}`}
                          >
                            {user.fullname.charAt(0).toUpperCase()}
                          </div>
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            {isUploading ? (
                              <Loader2 size={14} className="text-white animate-spin" />
                            ) : (
                              <Camera size={14} className="text-white" />
                            )}
                          </div>
                        </button>
                        <div className="min-w-0 max-w-[210px] xl:max-w-[270px]">
                          <p className="font-extrabold text-[var(--kg-text)] text-sm truncate">
                            {user.fullname}
                          </p>
                          <p className="text-[11px] font-mono text-[var(--kg-text-muted)] truncate">
                            @{user.username}
                            {user.email ? ` · ${user.email}` : ''}
                          </p>
                          {user.dob && (
                            <p className="text-[10.5px] font-mono tabular-nums text-[var(--kg-text-soft)] inline-flex items-center gap-1 mt-0.5">
                              <Calendar size={10} className="shrink-0" />
                              <span>SN: {user.dob}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <select
                        value={user.position || 'Phục vụ'}
                        aria-label={`Chức vụ của ${user.fullname}`}
                        onChange={(e) =>
                          actions.onUpdatePosition(user.username, user.fullname, e.target.value)
                        }
                        className="w-full min-w-[126px] !min-h-[36px] h-9 bg-[var(--kg-surface-2)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-lg px-2 py-1 text-xs font-semibold cursor-pointer"
                      >
                        {actions.positions.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-2">
                      <select
                        value={user.role || 'user'}
                        aria-label={`Phân quyền của ${user.fullname}`}
                        onChange={(e) =>
                          actions.onUpdateRole(user.username, user.fullname, e.target.value)
                        }
                        className={`w-full min-w-[118px] !min-h-[36px] h-9 bg-[var(--kg-surface-2)] text-[var(--kg-text)] rounded-lg px-2 py-1 text-xs font-bold cursor-pointer border ${badge.cls}`}
                      >
                        {actions.roles.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-1 rounded-md border whitespace-nowrap ${statusMeta.badgeClass}`}
                          >
                            {statusMeta.shortLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() => actions.onUpdateEmploymentStatus(user)}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[var(--kg-border)] bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface-soft)] text-[11px] font-bold text-[var(--kg-text)] whitespace-nowrap shrink-0 transition-colors"
                          >
                            Đổi
                          </button>
                        </div>
                        {(user.statusUntil || user.statusReason) && (
                          <div className="text-[10.5px] leading-snug text-[var(--kg-text-muted)] max-w-[195px]">
                            {user.statusUntil && (
                              <span className="block font-mono tabular-nums font-bold text-[var(--kg-text)]">
                                Đến: {user.statusUntil}
                              </span>
                            )}
                            {user.statusReason && (
                              <span className="block italic line-clamp-2" title={user.statusReason}>
                                {user.statusReason}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5 flex-nowrap">
                        {statusMeta.value === 'active' ? (
                          <button
                            type="button"
                            onClick={() => actions.onEnrollFaceId(user)}
                            data-testid={`enroll-face-id-${user.username}`}
                            className={`min-h-[36px] px-2 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors ${
                              faceProfile
                                ? 'bg-[var(--kg-success-soft)] hover:brightness-95 text-[var(--kg-success)] border-[var(--kg-success)]/30'
                                : 'bg-[var(--kg-primary-soft)] hover:opacity-90 text-[var(--kg-primary-ink)] border-[var(--kg-primary)]/30'
                            }`}
                          >
                            {faceProfile ? <ShieldCheck size={13} className="shrink-0" /> : <UserPlus size={13} className="shrink-0" />}
                            <span>
                              {faceProfile
                                ? `Đã khóa (${faceProfile.anglesCount || 5})`
                                : 'Đăng ký'}
                            </span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--kg-text-muted)] whitespace-nowrap">
                            <ScanFace size={12} className="shrink-0" /> {faceProfile ? 'Đã có' : 'Chưa ĐK'}
                          </span>
                        )}
                        {faceProfile && (
                          <button
                            type="button"
                            onClick={() => actions.onResetFaceProfile(user.username, user.fullname)}
                            data-testid={`reset-face-id-${user.username}`}
                            title="Mở khóa / Đặt lại Face ID"
                            className="min-h-[36px] px-2 py-1 rounded-lg bg-[var(--kg-warning-soft)] hover:brightness-95 text-[var(--kg-warning)] border border-[var(--kg-warning)]/30 text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                          >
                            <Unlock size={12} className="shrink-0" /> Mở khóa
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <button
                        type="button"
                        onClick={() => actions.onForceResetPassword(user.username, user.fullname)}
                        className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--kg-danger-soft)] hover:brightness-95 text-[var(--kg-danger)] border border-[var(--kg-danger)]/20 text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap transition-colors"
                      >
                        <KeyRound size={12} className="shrink-0" /> Reset MK
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
  );
}
