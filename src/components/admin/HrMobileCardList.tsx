import {
  Activity,
  ArrowDown,
  ArrowUp,
  Ban,
  Briefcase,
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Loader2,
  Mail,
  PauseCircle,
  ScanFace,
  Search,
  ShieldCheck,
  Unlock,
  UserCog,
  UserPlus,
  UserX,
} from 'lucide-react';
import type { User } from '../../store/useAppStore';
import { getEmploymentStatusMeta } from '../../utils/employment';
import type { RawFaceProfileDto } from '../../utils/faceProfileCache';
import type { HrSortField, HrUserActions } from './HrDesktopTable';

export interface HrMobileCardListProps {
  users: User[];
  canEditStatus: boolean;
  selectedUsernames: Set<string>;
  expandedUser: string | null;
  updatingUser: string | null;
  uploadingAvatar: string | null;
  faceProfilesMap: Record<string, RawFaceProfileDto>;
  sortBy?: HrSortField;
  sortDir?: 'asc' | 'desc';
  onSortChange?: (field: HrSortField, dir: 'asc' | 'desc') => void;
  onToggleExpand: (username: string) => void;
  onResetFilters: () => void;
  actions: HrUserActions;
}

const SORT_OPTIONS: Array<{ value: HrSortField; label: string }> = [
  { value: 'fullname', label: 'Họ tên' },
  { value: 'position', label: 'Bộ phận' },
  { value: 'role', label: 'Phân quyền' },
  { value: 'employmentStatus', label: 'Trạng thái' },
  { value: 'faceId', label: 'Face ID' },
];

export default function HrMobileCardList({
  users,
  canEditStatus,
  selectedUsernames,
  expandedUser,
  updatingUser,
  uploadingAvatar,
  faceProfilesMap,
  sortBy = 'fullname',
  sortDir = 'asc',
  onSortChange,
  onToggleExpand,
  onResetFilters,
  actions,
}: HrMobileCardListProps) {
  return (
    <div className="space-y-3">
      {onSortChange && (
        <div className="flex items-center gap-2 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-2.5 shadow-xs">
          <label htmlFor="hr-mobile-sort" className="sr-only">
            Sắp xếp danh sách nhân sự
          </label>
          <select
            id="hr-mobile-sort"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as HrSortField, sortDir)}
            aria-label="Sắp xếp danh sách nhân sự"
            className="flex-1 min-w-0 min-h-[44px] bg-[var(--kg-surface-2)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2 text-base font-bold outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sắp xếp: {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onSortChange(sortBy, sortDir === 'asc' ? 'desc' : 'asc')}
            aria-label={sortDir === 'asc' ? 'Đổi thứ tự giảm dần' : 'Đổi thứ tự tăng dần'}
            className="min-h-[44px] min-w-[84px] px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface-soft)] text-xs font-extrabold text-[var(--kg-text)] inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
          >
            {sortDir === 'asc' ? (
              <>
                <ArrowUp size={14} className="text-[var(--kg-primary-ink)]" />
                <span>A → Z</span>
              </>
            ) : (
              <>
                <ArrowDown size={14} className="text-[var(--kg-primary-ink)]" />
                <span>Z → A</span>
              </>
            )}
          </button>
        </div>
      )}

      {users.length === 0 ? (
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-8 text-center shadow-xs">
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
        users.map((user) => {
          const isProcessing = updatingUser === user.username;
          const badge = actions.getRoleBadge(user.role || 'user');
          const statusMeta = getEmploymentStatusMeta(user.employmentStatus);
          const avatarColor = actions.getAvatarColor(user.fullname);
          const isExpanded = expandedUser === user.username;
          const isUploading = uploadingAvatar === user.username;
          const faceProfile = faceProfilesMap[user.username.trim().toLowerCase()];
          const isSelected = selectedUsernames.has(user.username);

          return (
            <div
              key={user.username}
              className={`bg-[var(--kg-surface)] border rounded-2xl overflow-hidden shadow-xs hover:border-[var(--kg-border-strong)] transition-all duration-150 motion-reduce:transition-none ${
                isSelected
                  ? 'border-[var(--kg-primary)] ring-1 ring-[var(--kg-primary)]/25'
                  : 'border-[var(--kg-border)]'
              } ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
            >
              {/* Main Info Row */}
              <div className="p-3.5 sm:p-4 flex items-start gap-2.5 sm:gap-3">
                <label className="w-11 h-11 -ml-2 mt-0.5 flex items-center justify-center flex-shrink-0 cursor-pointer rounded-xl hover:bg-[var(--kg-surface-soft)]">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => actions.onToggleSelect(user.username)}
                    aria-label={`Chọn ${user.fullname}`}
                    className="w-4 h-4 rounded accent-[var(--kg-primary)] cursor-pointer"
                  />
                </label>
                {/* Avatar with upload overlay */}
                <div
                  className="relative group flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.onAvatarClick(user.username);
                  }}
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.fullname}
                      className="w-12 h-12 rounded-xl object-cover shadow-xs border border-[var(--kg-border)] cursor-pointer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white font-bold text-lg shadow-xs cursor-pointer ${user.avatarUrl ? 'hidden' : ''}`}
                  >
                    {user.fullname.charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                    {isUploading ? (
                      <Loader2 size={16} className="text-white animate-spin" />
                    ) : (
                      <Camera size={16} className="text-white" />
                    )}
                  </div>
                </div>

                {/* Info */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onToggleExpand(user.username)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-[var(--kg-text)] text-[15px] leading-tight truncate">
                        {user.fullname}
                      </h4>
                      <p className="text-[11px] text-[var(--kg-text-muted)] font-mono mt-0.5 truncate">
                        @{user.username}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.shortLabel}
                      </span>
                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-[11px] text-[var(--kg-text-muted)]">
                    <span className="inline-flex items-center gap-1 bg-[var(--kg-surface-2)] border border-[var(--kg-border)] px-2 py-0.5 rounded-md font-semibold text-[var(--kg-text)]">
                      <Briefcase size={10} /> {user.position || 'Phục vụ'}
                    </span>
                    {faceProfile ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (statusMeta.value === 'active') actions.onEnrollFaceId(user);
                        }}
                        title="Nhấn để quét lại 5 góc khuôn mặt cho nhân sự này"
                        className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] bg-[var(--kg-success-soft)] hover:brightness-95 text-[var(--kg-success)] border border-[var(--kg-success)]/25 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                      >
                        <ShieldCheck size={13} className="flex-shrink-0" /> Face ID: Đã khóa (
                        {faceProfile.anglesCount || 5} góc)
                      </button>
                    ) : statusMeta.value === 'active' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          actions.onEnrollFaceId(user);
                        }}
                        className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-[36px] bg-[var(--kg-primary-soft)] hover:brightness-95 text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]/30 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors whitespace-nowrap"
                      >
                        <UserPlus size={13} className="flex-shrink-0" /> + Đăng ký Face ID
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-[var(--kg-surface-2)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] px-2.5 py-1 rounded-lg font-semibold">
                        <ScanFace size={12} /> Chưa đăng ký Face ID
                      </span>
                    )}
                    {user.dob && (
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                        <Calendar size={10} /> {user.dob}
                      </span>
                    )}
                    {user.email && (
                      <span className="inline-flex items-center gap-1 min-w-0">
                        <Mail size={10} className="flex-shrink-0" />
                        <span className="truncate max-w-[180px]">{user.email}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Expand Toggle */}
                <button
                  type="button"
                  aria-label={isExpanded ? 'Thu gọn chi tiết nhân sự' : 'Mở rộng chi tiết nhân sự'}
                  onClick={() => onToggleExpand(user.username)}
                  className="w-11 h-11 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl hover:bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] flex-shrink-0 mt-0.5 transition-colors"
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {/* Expanded Actions */}
              {isExpanded && (
                <div className="overflow-hidden transition-all duration-150 motion-reduce:transition-none">
                  <div className="px-4 pb-4 pt-1 border-t border-[var(--kg-border)]">
                    <div className={`mt-3 rounded-xl border p-3 ${statusMeta.badgeClass}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 gap-2.5">
                          {statusMeta.value === 'active' && (
                            <Activity size={18} className="mt-0.5 flex-shrink-0" />
                          )}
                          {statusMeta.value === 'leave' && (
                            <PauseCircle size={18} className="mt-0.5 flex-shrink-0" />
                          )}
                          {statusMeta.value === 'suspended' && (
                            <Ban size={18} className="mt-0.5 flex-shrink-0" />
                          )}
                          {statusMeta.value === 'resigned' && (
                            <UserX size={18} className="mt-0.5 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase">{statusMeta.label}</p>
                            <p className="mt-1 text-[11px] leading-4 opacity-80">
                              {statusMeta.description}
                            </p>
                            {user.statusUntil && (
                              <p className="mt-1 text-[10px] font-mono tabular-nums font-bold">
                                Đến ngày: {user.statusUntil}
                              </p>
                            )}
                            {user.statusReason && (
                              <p className="mt-1 text-[10px] italic">Lý do: {user.statusReason}</p>
                            )}
                          </div>
                        </div>
                        {canEditStatus && (
                          <button
                            type="button"
                            onClick={() => actions.onUpdateEmploymentStatus(user)}
                            className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] rounded-xl bg-[var(--kg-primary)] text-[var(--kg-primary-fg)] px-3.5 py-2 text-xs font-extrabold shadow-xs hover:opacity-90 active:scale-95 transition-all whitespace-nowrap shrink-0"
                          >
                            Đổi trạng thái
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-[var(--kg-text-muted)] mb-1 ml-0.5 flex items-center gap-1">
                          <Briefcase size={9} /> Chức vụ
                        </label>
                        <select
                          value={user.position || 'Phục vụ'}
                          onChange={(e) =>
                            actions.onUpdatePosition(user.username, user.fullname, e.target.value)
                          }
                          className="w-full min-h-[44px] bg-[var(--kg-surface-2)] border border-[var(--kg-border)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-base sm:text-sm font-medium focus:ring-2 focus:ring-[var(--kg-primary)] outline-none cursor-pointer"
                        >
                          {actions.positions.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-[var(--kg-text-muted)] mb-1 ml-0.5 flex items-center gap-1">
                          <UserCog size={9} /> Phân quyền
                        </label>
                        <select
                          value={user.role || 'user'}
                          onChange={(e) =>
                            actions.onUpdateRole(user.username, user.fullname, e.target.value)
                          }
                          className={`w-full min-h-[44px] bg-[var(--kg-surface-2)] text-[var(--kg-text)] rounded-xl px-3 py-2.5 text-base sm:text-sm font-bold focus:ring-2 focus:ring-[var(--kg-primary)] outline-none cursor-pointer border ${badge.cls}`}
                        >
                          {actions.roles.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-end gap-2 mt-3 pt-3 border-t border-[var(--kg-border)]">
                      {statusMeta.value === 'active' && (
                        <button
                          type="button"
                          onClick={() => actions.onEnrollFaceId(user)}
                          data-testid={`enroll-face-id-${user.username}`}
                          className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[var(--kg-success)] bg-[var(--kg-success-soft)] hover:brightness-95 border border-[var(--kg-success)]/30 rounded-xl transition-colors whitespace-nowrap"
                        >
                          <UserPlus size={14} className="shrink-0" />
                          <span>
                            {faceProfile ? 'Quét lại 5 góc Face ID' : 'Đăng ký khuôn mặt 5 góc'}
                          </span>
                        </button>
                      )}
                      {faceProfile && (
                        <button
                          type="button"
                          onClick={() => actions.onResetFaceProfile(user.username, user.fullname)}
                          data-testid={`reset-face-id-${user.username}`}
                          className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[var(--kg-warning)] bg-[var(--kg-warning-soft)] hover:brightness-95 border border-[var(--kg-warning)]/30 rounded-xl transition-colors whitespace-nowrap"
                        >
                          <Unlock size={14} className="shrink-0" />
                          <span>Mở khóa / Đặt lại Face ID</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => actions.onForceResetPassword(user.username, user.fullname)}
                        className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[var(--kg-danger)] bg-[var(--kg-danger-soft)] hover:brightness-95 border border-[var(--kg-danger)]/20 rounded-xl transition-colors whitespace-nowrap"
                      >
                        <KeyRound size={14} className="shrink-0" />
                        <span>Đặt lại MK</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
