import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  Ban,
  BriefcaseBusiness,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Clock,
  KeyRound,
  LoaderCircle,
  Lock,
  Mail,
  PauseCircle,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Sparkles,
  UserX,
  Wallet,
} from 'lucide-react';
import { KgModuleHero, KgAlertCard, KgButton, KgCard } from '../components/KgDesignSystem';
import {
  APP_RELEASE_DATE,
  APP_VERSION_TAG,
  openReleaseNotesModal,
} from '../config/releaseNotes';
import { callApi } from '../services/api';
import { useAppStore, type User } from '../store/useAppStore';
import { getEmploymentStatusMeta } from '../utils/employment';
import { navigateToHubSubTab } from '../utils/hubNavigation';
import {
  getCachedFaceProfiles,
  subscribeCachedFaceProfiles,
  syncLatestFaceProfilesFromEdge,
  decodeInt8B64ToVectors,
  type RawFaceProfileDto,
} from '../utils/faceProfileCache';

const roleLabel = (role?: string) => {
  if (role === 'admin') return 'Quản trị viên';
  if (role === 'tester') return 'Tài khoản kiểm thử';
  return 'Nhân viên';
};

export default function Profile() {
  const currentUser = useAppStore((state) => state.currentUser);
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const [profile, setProfile] = useState<User | null>(currentUser);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [faceProfiles, setFaceProfiles] = useState<RawFaceProfileDto[]>(() => getCachedFaceProfiles());

  const loadProfile = useCallback(async () => {
    const user = useAppStore.getState().currentUser;
    if (!user) return;
    setSyncing(true);
    setLoadError(null);
    try {
      const res = await callApi(
        'GET_EMPLOYMENT_PROFILE',
        {
          role: user.role,
          username: user.username,
          forceRefresh: true,
        },
        { background: true, cacheTtlMs: 0 },
      );
      if (res?.ok && res.data?.profile) {
        const next = { ...user, ...res.data.profile };
        setProfile(next);
        setCurrentUser(next);
        localStorage.setItem('kg_user', JSON.stringify(next));
      } else {
        setProfile(user);
        setLoadError(res?.message || 'Không thể đồng bộ hồ sơ mới nhất từ máy chủ.');
      }
    } catch {
      setProfile(user);
      setLoadError('Mất kết nối khi đồng bộ hồ sơ. Đang hiển thị dữ liệu đã lưu.');
    } finally {
      setSyncing(false);
    }
  }, [setCurrentUser]);

  useEffect(() => {
    const timer = window.setTimeout(loadProfile, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile]);

  useEffect(() => {
    const unsubscribe = subscribeCachedFaceProfiles((profiles) => {
      setFaceProfiles(profiles);
    });
    if (getCachedFaceProfiles().length === 0) {
      void syncLatestFaceProfilesFromEdge(callApi).then((synced) => {
        if (synced.length > 0) setFaceProfiles(synced);
      });
    }
    return unsubscribe;
  }, []);

  const myFaceProfile = useMemo(() => {
    if (!profile?.username) return null;
    const target = profile.username.trim().toLowerCase();
    return faceProfiles.find((p) => p.username.trim().toLowerCase() === target) || null;
  }, [faceProfiles, profile?.username]);

  const faceAngleCount = useMemo(() => {
    if (!myFaceProfile) return 0;
    if (typeof myFaceProfile.anglesCount === 'number' && myFaceProfile.anglesCount > 0) {
      return myFaceProfile.anglesCount;
    }
    return decodeInt8B64ToVectors(myFaceProfile.vectorsB64).length;
  }, [myFaceProfile]);

  if (!profile) return null;
  const status = getEmploymentStatusMeta(profile.employmentStatus);
  const StatusIcon =
    status.value === 'active'
      ? Activity
      : status.value === 'leave'
        ? PauseCircle
        : status.value === 'suspended'
          ? Ban
          : UserX;

  const permissions =
    profile.role === 'admin'
      ? [
          'Toàn quyền cấu hình và quản lý hệ thống',
          'Quản lý nhân sự, lương, phân ca và phân công',
          'Xem báo cáo và xử lý các yêu cầu nội bộ',
        ]
      : profile.role === 'tester'
        ? [
            'Kiểm thử các module được hệ thống cho phép',
            'Xem dữ liệu phục vụ kiểm tra vận hành',
            'Không được thay đổi trạng thái lao động của nhân sự',
          ]
        : [
            'Xem và thao tác dữ liệu cá nhân',
            'Đăng ký ca, chấm công và nhận phân công khi đang hoạt động',
            'Gửi đề nghị, góp ý và theo dõi thông tin lương cá nhân',
          ];

  const isFaceReady = Boolean(myFaceProfile && faceAngleCount >= 5);
  const isFacePartial = Boolean(myFaceProfile && faceAngleCount > 0 && faceAngleCount < 5);

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="profile"
        title="Hồ Sơ Của Tôi"
        description="Theo dõi trạng thái làm việc, nhận diện khuôn mặt, chức vụ và quyền truy cập của bạn."
        eyebrow="Nhân sự"
        actions={
          syncing ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[11px] font-semibold text-[var(--kg-text-muted)]">
              <LoaderCircle size={13} className="animate-spin text-[var(--kg-primary-ink)]" />
              <span>Đang đồng bộ...</span>
            </span>
          ) : undefined
        }
      />

      {loadError && (
        <KgAlertCard variant="warning" title="Đồng bộ hồ sơ chưa hoàn tất">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1">
            <span>{loadError}</span>
            <KgButton size="sm" variant="secondary" icon={RefreshCw} onClick={() => void loadProfile()}>
              Thử lại
            </KgButton>
          </div>
        </KgAlertCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: Identity + Employment Status + Face ID 5-angle status */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] overflow-hidden rounded-2xl shadow-xs">
            <div className="bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] p-5 sm:p-6 text-[var(--kg-text)]">
              <div className="flex items-center gap-4">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    className="h-16 w-16 rounded-2xl border border-[var(--kg-border)] object-cover shadow-xs flex-shrink-0"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--kg-primary)] text-[var(--kg-primary-fg)] text-2xl font-black shadow-xs flex-shrink-0">
                    {profile.fullname.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-xl font-black text-[var(--kg-text)]">{profile.fullname}</h2>
                  <p className="mt-0.5 text-xs font-mono text-[var(--kg-text-muted)]">@{profile.username}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-[var(--kg-surface)] border border-[var(--kg-border)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--kg-text)]">
                      {profile.position || 'Nhân viên'}
                    </span>
                    <span className="rounded-full bg-[var(--kg-primary-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--kg-primary-ink)]">
                      {roleLabel(profile.role)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Employment Status */}
              <div className={`rounded-2xl border p-4 ${status.badgeClass}`}>
                <div className="flex items-start gap-3">
                  <StatusIcon size={22} className="mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] opacity-70">
                      Trạng thái hoạt động
                    </p>
                    <h3 className="mt-1 text-base sm:text-lg font-black">{status.label}</h3>
                    <p className="mt-1 text-xs leading-5 opacity-80">{status.description}</p>
                    {profile.statusUntil && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-extrabold font-mono tabular-nums">
                        <CalendarClock size={14} /> Thời hạn: {profile.statusUntil}
                      </p>
                    )}
                    {profile.statusReason && (
                      <p className="mt-2 rounded-lg bg-[var(--kg-surface)]/80 border border-[var(--kg-border)] px-3 py-2 text-xs text-[var(--kg-text)]">
                        Ghi chú: {profile.statusReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Face ID 5-angle Status Badge */}
              <div
                className={`rounded-2xl border p-3.5 flex items-center justify-between gap-3 ${
                  isFaceReady
                    ? 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/30'
                    : isFacePartial
                      ? 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/30'
                      : 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isFaceReady
                        ? 'bg-[var(--kg-success)] text-white dark:text-[#101B15]'
                        : isFacePartial
                          ? 'bg-[var(--kg-warning)] text-white dark:text-[#101B15]'
                          : 'bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text-muted)]'
                    }`}
                  >
                    <ScanFace size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-black text-[var(--kg-text)]">
                        Face ID Chấm công
                      </span>
                      {myFaceProfile?.isLocked && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[10px] font-bold text-[var(--kg-text-muted)]">
                          <Lock size={9} /> Đã khóa
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-medium text-[var(--kg-text-muted)] mt-0.5">
                      {isFaceReady
                        ? 'Đã kích hoạt đủ 5 góc nhận diện khuôn mặt'
                        : isFacePartial
                          ? `Mới ghi nhận ${faceAngleCount}/5 góc — cần bổ sung thêm`
                          : 'Chưa đăng ký dữ liệu khuôn mặt 5 góc'}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-black font-mono tabular-nums flex-shrink-0 border ${
                    isFaceReady
                      ? 'bg-[var(--kg-surface)] text-[var(--kg-success)] border-[var(--kg-success)]/30'
                      : isFacePartial
                        ? 'bg-[var(--kg-surface)] text-[var(--kg-warning)] border-[var(--kg-warning)]/30'
                        : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border-[var(--kg-border)]'
                  }`}
                >
                  {Math.min(faceAngleCount, 5)}/5 góc
                </span>
              </div>

              {/* Account Details Grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-3.5">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-[var(--kg-text-soft)]">
                    <BriefcaseBusiness size={14} /> Chức vụ
                  </p>
                  <p className="mt-1.5 font-extrabold text-sm text-[var(--kg-text)]">
                    {profile.position || 'Nhân viên'}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-3.5">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-[var(--kg-text-soft)]">
                    <ShieldCheck size={14} /> Phân quyền
                  </p>
                  <p className="mt-1.5 font-extrabold text-sm text-[var(--kg-text)]">
                    {roleLabel(profile.role)}
                  </p>
                </div>
                <div className="rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-3.5 sm:col-span-2">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-[var(--kg-text-soft)]">
                    <Mail size={14} /> Email
                  </p>
                  <p className="mt-1.5 break-all text-sm font-bold text-[var(--kg-text)]">
                    {profile.email || 'Chưa cập nhật'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Essential Shortcuts + Permissions + Compact 1-row Version Link + Refresh */}
        <div className="lg:col-span-5 space-y-4">
          <KgCard>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="flex items-center gap-2 font-extrabold text-sm sm:text-base text-[var(--kg-text)]">
                <Sparkles size={16} className="text-[var(--kg-primary-ink)]" />
                Lối tắt thiết yếu
              </h3>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--kg-text-soft)]">
                1 chạm
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  {
                    label: 'Chấm công / Face ID',
                    hint: 'Check-in nhanh',
                    icon: ScanFace,
                    onClick: () => navigateToHubSubTab('checkin'),
                  },
                  {
                    label: 'Bảng công',
                    hint: 'Giờ làm thực tế',
                    icon: Clock,
                    onClick: () => navigateToHubSubTab('attendance', 'ledger'),
                  },
                  {
                    label: 'Phiếu lương',
                    hint: 'Đối chiếu thu nhập',
                    icon: Wallet,
                    onClick: () => navigateToHubSubTab('attendance', 'payroll'),
                  },
                  {
                    label: 'Lịch làm việc',
                    hint: 'Đăng ký ca tuần',
                    icon: CalendarDays,
                    onClick: () => navigateToHubSubTab('workforce', 'schedule'),
                  },
                ] as const
              ).map((shortcut) => {
                const ShortcutIcon = shortcut.icon;
                return (
                  <button
                    key={shortcut.label}
                    type="button"
                    onClick={shortcut.onClick}
                    className="kg-touch-tile min-h-[72px] rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] hover:border-[var(--kg-primary)]/45 p-3 flex flex-col items-start justify-between gap-2 text-left transition-colors active:scale-[0.98] touch-manipulation"
                  >
                    <span className="w-8 h-8 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] flex items-center justify-center shrink-0">
                      <ShortcutIcon size={16} />
                    </span>
                    <div className="min-w-0 w-full">
                      <p className="text-xs font-extrabold text-[var(--kg-text)] leading-tight truncate">
                        {shortcut.label}
                      </p>
                      <p className="text-[10.5px] text-[var(--kg-text-muted)] truncate mt-0.5">
                        {shortcut.hint}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </KgCard>

          <KgCard>
            <h3 className="flex items-center gap-2 font-extrabold text-sm sm:text-base text-[var(--kg-text)]">
              <KeyRound size={17} className="text-[var(--kg-primary-ink)]" />
              Quyền của tài khoản
            </h3>
            <div className="mt-3.5 space-y-2">
              {permissions.map((permission) => (
                <div
                  key={permission}
                  className="flex items-start gap-2.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-3"
                >
                  <BadgeCheck size={16} className="mt-0.5 flex-shrink-0 text-[var(--kg-success)]" />
                  <p className="text-xs font-semibold leading-5 text-[var(--kg-text-muted)]">
                    {permission}
                  </p>
                </div>
              ))}
            </div>
          </KgCard>

          {/* Compact 1-row Version & Changelog Link */}
          <button
            type="button"
            onClick={() => openReleaseNotesModal('all')}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] hover:bg-[var(--kg-surface-soft)] transition-colors flex items-center justify-between gap-2 text-left shadow-xs touch-manipulation"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)] flex items-center justify-center flex-shrink-0">
                <Sparkles size={15} />
              </span>
              <div className="min-w-0 flex items-center gap-1.5 flex-wrap text-xs">
                <span className="font-extrabold text-[var(--kg-text)]">
                  Phiên bản <span className="font-mono tabular-nums">{APP_VERSION_TAG}</span>
                </span>
                <span className="text-[var(--kg-text-soft)]">({APP_RELEASE_DATE})</span>
                <span className="text-[var(--kg-text-soft)]">•</span>
                <span className="font-bold text-[var(--kg-primary-ink)]">Xem nhật ký →</span>
              </div>
            </div>
            <ChevronRight size={16} className="text-[var(--kg-text-muted)] flex-shrink-0" />
          </button>

          <KgButton
            variant="secondary"
            size="md"
            icon={RefreshCw}
            loading={syncing}
            onClick={() => void loadProfile()}
            className="w-full sm:w-auto lg:w-full min-h-[44px] sm:min-h-[40px]"
          >
            Cập nhật trạng thái mới nhất
          </KgButton>
        </div>
      </div>
    </div>
  );
}
