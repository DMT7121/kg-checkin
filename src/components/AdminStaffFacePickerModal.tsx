import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Search,
  ScanFace,
  UserPlus,
  RefreshCw,
  ShieldCheck,
  Briefcase,
  AlertTriangle,
  Users,
  RotateCcw,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { normalizeEmploymentStatus } from '../utils/employment';
import type { RawFaceProfileDto } from '../utils/faceProfileCache';

export interface StaffFacePickerCandidate {
  username: string;
  fullname: string;
  role?: string;
  position?: string;
  avatarUrl?: string;
  employmentStatus?: string;
  hasFaceProfile?: boolean;
}

export interface AdminStaffFacePickerModalProps {
  isOpen: boolean;
  adminUsername: string;
  initialProfiles?: RawFaceProfileDto[];
  onClose: () => void;
  onSelectEmployee: (
    employee: StaffFacePickerCandidate,
    latestProfiles: RawFaceProfileDto[]
  ) => void;
}

type EnrollmentFilter = 'ALL' | 'UNENROLLED' | 'ENROLLED';

export default function AdminStaffFacePickerModal({
  isOpen,
  adminUsername,
  initialProfiles,
  onClose,
  onSelectEmployee,
}: AdminStaffFacePickerModalProps) {
  const storeUsers = useAppStore((s) => s.users);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<EnrollmentFilter>('ALL');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [profiles, setProfiles] = useState<RawFaceProfileDto[]>(() =>
    Array.isArray(initialProfiles) && initialProfiles.length > 0 ? initialProfiles : []
  );
  const [serverEmployees, setServerEmployees] = useState<StaffFacePickerCandidate[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (Array.isArray(initialProfiles) && initialProfiles.length > 0) {
      setProfiles(initialProfiles);
    }
  }, [initialProfiles]);

  const fetchRosterAndProfiles = useCallback(
    async (forceGasRefresh = false) => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await callApi(
          'GET_FACE_PROFILES',
          {
            username: adminUsername || 'ADMIN',
            actorUsername: adminUsername || 'ADMIN',
            adminUsername: adminUsername || 'ADMIN',
            role: 'admin',
            actorRole: 'admin',
            fastEdge: !forceGasRefresh,
            forceRefresh: Boolean(forceGasRefresh),
          },
          { background: true, cacheTtlMs: 0, timeoutMs: 20000 }
        );
        if (res?.ok) {
          if (Array.isArray(res.data?.profiles)) {
            const { setCachedFaceProfiles } = await import('../utils/faceProfileCache');
            setCachedFaceProfiles(res.data.profiles);
            setProfiles(res.data.profiles);
          }
          if (Array.isArray(res.data?.activeEmployees)) {
            setServerEmployees(res.data.activeEmployees);
          }
        } else {
          setLoadError(res?.message || 'Không thể tải danh sách nhân sự từ máy chủ.');
        }
      } catch {
        setLoadError('Mất kết nối tạm thời khi đồng bộ danh sách nhân viên.');
      } finally {
        setLoading(false);
      }
    },
    [adminUsername]
  );

  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    window.setTimeout(() => searchInputRef.current?.focus(), 0);
    if (!Array.isArray(initialProfiles) || initialProfiles.length === 0) {
      import('../utils/faceProfileCache')
        .then(({ getCachedFaceProfiles }) => {
          const cached = getCachedFaceProfiles();
          if (cached.length > 0) setProfiles((prev) => (prev.length > 0 ? prev : cached));
        })
        .catch(() => {});
    }
    void fetchRosterAndProfiles(false);
  }, [isOpen, initialProfiles, fetchRosterAndProfiles]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const enrolledSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of profiles) {
      if (p?.username && p?.vectorsB64) {
        s.add(p.username.trim().toLowerCase());
      }
    }
    return s;
  }, [profiles]);

  const mergedEmployees = useMemo(() => {
    const byUser = new Map<string, StaffFacePickerCandidate>();

    for (const u of storeUsers) {
      const key = String(u.username || '').trim().toLowerCase();
      if (!key) continue;
      const st = normalizeEmploymentStatus(u.employmentStatus);
      if (st === 'resigned' || st === 'suspended') continue;
      byUser.set(key, {
        username: u.username.trim(),
        fullname: (u.fullname || u.username).trim(),
        role: u.role || 'user',
        position: u.position || 'Phục vụ',
        avatarUrl: u.avatarUrl || '',
        employmentStatus: st,
        hasFaceProfile: enrolledSet.has(key),
      });
    }

    for (const srv of serverEmployees) {
      const key = String(srv.username || '').trim().toLowerCase();
      if (!key) continue;
      const st = normalizeEmploymentStatus(srv.employmentStatus as any);
      if (st === 'resigned' || st === 'suspended') {
        byUser.delete(key);
        continue;
      }
      const prev = byUser.get(key);
      byUser.set(key, {
        username: (srv.username || prev?.username || key).trim(),
        fullname: (srv.fullname || prev?.fullname || srv.username).trim(),
        role: srv.role || prev?.role || 'user',
        position: srv.position || prev?.position || 'Phục vụ',
        avatarUrl: srv.avatarUrl || prev?.avatarUrl || '',
        employmentStatus: st,
        hasFaceProfile: Boolean(srv.hasFaceProfile || enrolledSet.has(key)),
      });
    }

    return Array.from(byUser.values()).sort((a, b) => {
      // Unenrolled staff first so Manager can quickly spot who still needs Face ID
      if (Boolean(a.hasFaceProfile) !== Boolean(b.hasFaceProfile)) {
        return a.hasFaceProfile ? 1 : -1;
      }
      return a.fullname.localeCompare(b.fullname, 'vi');
    });
  }, [enrolledSet, serverEmployees, storeUsers]);

  const counts = useMemo(() => {
    let enrolled = 0;
    for (const e of mergedEmployees) {
      if (e.hasFaceProfile) enrolled += 1;
    }
    return {
      total: mergedEmployees.length,
      enrolled,
      unenrolled: Math.max(0, mergedEmployees.length - enrolled),
    };
  }, [mergedEmployees]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mergedEmployees.filter((emp) => {
      if (filterMode === 'UNENROLLED' && emp.hasFaceProfile) return false;
      if (filterMode === 'ENROLLED' && !emp.hasFaceProfile) return false;
      if (!q) return true;
      return (
        emp.fullname.toLowerCase().includes(q) ||
        emp.username.toLowerCase().includes(q) ||
        (emp.position || '').toLowerCase().includes(q)
      );
    });
  }, [filterMode, mergedEmployees, searchQuery]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chọn nhân viên để đăng ký khuôn mặt 5 góc"
      data-testid="admin-staff-face-picker-modal"
      className="fixed inset-0 m-0 z-[10075] h-[100dvh] w-screen bg-[var(--kg-bg)] text-[var(--kg-text)] flex flex-col overflow-hidden select-none font-sans"
    >
      {/* Solid Top Header */}
      <header className="w-full max-w-2xl lg:max-w-4xl mx-auto px-4 pt-3 pb-2.5 flex items-center justify-between gap-3 border-b border-[var(--kg-border)] bg-[var(--kg-surface)] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--kg-primary-soft)] border border-[var(--kg-primary)]/20 flex items-center justify-center text-[var(--kg-primary-ink)] shrink-0">
            <Users size={20} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--kg-text-muted)] truncate">
                QUẢN LÝ ĐĂNG KÝ HỘ
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--kg-success-soft)] border border-[var(--kg-success)]/25 text-[10px] font-mono tabular-nums font-bold text-[var(--kg-success)] shrink-0 whitespace-nowrap">
                {counts.enrolled}/{counts.total} đã có
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-extrabold text-[var(--kg-text)] truncate">
              Chọn nhân viên quét 5 góc
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void fetchRosterAndProfiles(true)}
            disabled={loading}
            aria-label="Làm mới danh sách nhân sự"
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary)] border border-[var(--kg-border)] text-[var(--kg-text)] inline-flex items-center justify-center disabled:opacity-50 transition-colors motion-reduce:transition-none touch-manipulation"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng danh sách chọn nhân viên"
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-[var(--kg-danger)] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary)] text-white dark:text-[#23170F] inline-flex items-center justify-center transition-colors motion-reduce:transition-none touch-manipulation"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Search & Filter Controls */}
      <div className="w-full max-w-2xl lg:max-w-4xl mx-auto px-4 py-3 space-y-2.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface)] shrink-0">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] pointer-events-none"
          />
          <input
            ref={searchInputRef}
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên, @username, bộ phận..."
            data-testid="staff-face-picker-search"
            className="w-full min-h-[44px] pl-10 pr-10 py-2.5 rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] text-base sm:text-sm font-semibold text-[var(--kg-text)] placeholder:text-[var(--kg-text-soft)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Xóa từ khóa tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] inline-flex items-center justify-center touch-manipulation"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Lọc trạng thái Face ID">
          {(
            [
              { key: 'ALL' as const, label: 'Tất cả', count: counts.total },
              { key: 'UNENROLLED' as const, label: 'Chưa ĐK', count: counts.unenrolled },
              { key: 'ENROLLED' as const, label: 'Đã có', count: counts.enrolled },
            ] as const
          ).map((tab) => {
            const active = filterMode === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilterMode(tab.key)}
                className={`min-h-[44px] px-2.5 py-1.5 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors motion-reduce:transition-none touch-manipulation ${
                  active
                    ? 'bg-[var(--kg-nav-active)] border-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] shadow-xs'
                    : 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <span className="truncate">{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded font-mono tabular-nums text-[10px] ${
                    active
                      ? 'bg-black/20 text-current'
                      : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border border-[var(--kg-border)]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-[var(--kg-text-muted)] leading-snug">
          Đăng ký đủ 5 góc sẽ đồng bộ ngay lên đám mây — nhân sự{' '}
          <b className="text-[var(--kg-success)]">chấm công được trên mọi điện thoại</b>.
        </p>
      </div>

      {/* Scrollable Staff Roster */}
      <div className="flex-1 w-full max-w-2xl lg:max-w-4xl mx-auto px-4 py-3 overflow-y-auto space-y-2.5">
        {loadError && (
          <div className="bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/35 rounded-xl p-3 flex items-center justify-between gap-2 text-xs text-[var(--kg-danger)]">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle size={15} className="shrink-0" />
              <span className="truncate font-semibold">{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => void fetchRosterAndProfiles()}
              className="px-3 py-1.5 min-h-[36px] rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text)] font-bold shrink-0 touch-manipulation"
            >
              Thử lại
            </button>
          </div>
        )}

        {loading && mergedEmployees.length === 0 ? (
          <div className="py-12 text-center space-y-2 text-[var(--kg-text-muted)]">
            <RefreshCw size={24} className="mx-auto animate-spin motion-reduce:animate-none text-[var(--kg-primary-ink)]" />
            <p className="text-xs font-bold">Đang tải danh sách nhân sự đang làm việc...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="py-12 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-6 text-center space-y-2">
            <ScanFace size={28} className="mx-auto text-[var(--kg-text-muted)]" />
            <p className="text-sm font-bold text-[var(--kg-text)]">Không tìm thấy nhân sự phù hợp</p>
            <p className="text-xs text-[var(--kg-text-muted)]">
              Thử đổi bộ lọc hoặc kiểm tra nhân sự đang ở trạng thái Đang làm việc.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            {filteredEmployees.map((emp) => {
              const initial = (emp.fullname || emp.username || '?').trim().charAt(0).toUpperCase();
              return (
                <div
                  key={emp.username}
                  className="bg-[var(--kg-surface)] hover:border-[var(--kg-border-strong)] border border-[var(--kg-border)] rounded-2xl p-3 flex items-center justify-between gap-3 transition-colors motion-reduce:transition-none shadow-xs"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    {emp.avatarUrl ? (
                      <img
                        src={emp.avatarUrl}
                        alt={emp.fullname}
                        className="w-11 h-11 rounded-xl object-cover border border-[var(--kg-border)] shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-[var(--kg-primary-soft)] border border-[var(--kg-primary)]/20 text-[var(--kg-primary-ink)] font-extrabold text-sm flex items-center justify-center shrink-0">
                        {initial}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-sm font-extrabold text-[var(--kg-text)] truncate">
                          {emp.fullname}
                        </h3>
                        <span className="text-[11px] font-mono text-[var(--kg-text-muted)]">@{emp.username}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[10px] font-bold text-[var(--kg-text)]">
                          <Briefcase size={10} className="text-[var(--kg-text-muted)]" />
                          {emp.position || 'Phục vụ'}
                        </span>
                        {emp.hasFaceProfile ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--kg-success-soft)] border border-[var(--kg-success)]/30 text-[10px] font-bold text-[var(--kg-success)]">
                            <ShieldCheck size={10} />
                            Đã có 5 góc
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/30 text-[10px] font-bold text-[var(--kg-warning)]">
                            <ScanFace size={10} />
                            Chưa đăng ký
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid={`pick-enroll-staff-${emp.username}`}
                    onClick={() => onSelectEmployee(emp, profiles)}
                    className={`min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors motion-reduce:transition-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kg-primary)] ${
                      emp.hasFaceProfile
                        ? 'bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] text-[var(--kg-text)]'
                        : 'bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)]'
                    }`}
                  >
                    {emp.hasFaceProfile ? (
                      <>
                        <RotateCcw size={13} className="text-[var(--kg-warning)]" />
                        <span>Quét lại</span>
                      </>
                    ) : (
                      <>
                        <UserPlus size={14} />
                        <span>Quét đăng ký</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
