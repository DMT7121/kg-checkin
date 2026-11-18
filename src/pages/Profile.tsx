import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  Ban,
  BriefcaseBusiness,
  CalendarClock,
  History,
  KeyRound,
  Layers,
  LoaderCircle,
  Mail,
  PauseCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserX,
  Wrench,
} from 'lucide-react';
import { KgModuleHero, KgAlertCard, KgButton, KgCard } from '../components/KgDesignSystem';
import {
  APP_CODENAME,
  APP_RELEASE_DATE,
  APP_VERSION_TAG,
  RELEASE_STATS,
  openReleaseNotesModal,
} from '../config/releaseNotes';
import { callApi } from '../services/api';
import { useAppStore, type User } from '../store/useAppStore';
import { getEmploymentStatusMeta } from '../utils/employment';

const roleLabel = (role?: string) => {
  if (role === 'admin') return 'Quản trị viên';
  if (role === 'tester') return 'Tài khoản kiểm thử';
  return 'Nhân viên';
};

export default function Profile() {
  const currentUser = useAppStore(state => state.currentUser);
  const setCurrentUser = useAppStore(state => state.setCurrentUser);
  const [profile, setProfile] = useState<User | null>(currentUser);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  if (!profile) return null;
  const status = getEmploymentStatusMeta(profile.employmentStatus);
  const statusIcon = status.value === 'active'
    ? Activity
    : status.value === 'leave'
      ? PauseCircle
      : status.value === 'suspended' ? Ban : UserX;
  const StatusIcon = statusIcon;

  const permissions = profile.role === 'admin'
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

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="profile"
        title="Hồ Sơ Của Tôi"
        description="Theo dõi trạng thái làm việc, chức vụ và quyền truy cập của bạn trong nhà hàng."
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

      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] overflow-hidden rounded-2xl shadow-xs">
        <div className="bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] p-5 sm:p-6 text-[var(--kg-text)]">
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="h-16 w-16 rounded-2xl border border-[var(--kg-border)] object-cover shadow-xs" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--kg-primary)] text-white text-2xl font-black shadow-xs">
                {profile.fullname.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black text-[var(--kg-text)]">{profile.fullname}</h2>
              <p className="mt-1 text-xs font-mono text-[var(--kg-text-muted)]">@{profile.username}</p>
              <div className="mt-2 flex flex-wrap gap-2">
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

        <div className="p-5">
          <div className={`rounded-2xl border p-4 ${status.badgeClass}`}>
            <div className="flex items-start gap-3">
              <StatusIcon size={23} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] opacity-70">Trạng thái hoạt động</p>
                <h3 className="mt-1 text-lg font-black">{status.label}</h3>
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

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-3.5">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-[var(--kg-text-soft)]">
                <BriefcaseBusiness size={14} /> Chức vụ
              </p>
              <p className="mt-2 font-extrabold text-[var(--kg-text)]">{profile.position || 'Nhân viên'}</p>
            </div>
            <div className="rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-3.5">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-[var(--kg-text-soft)]">
                <ShieldCheck size={14} /> Phân quyền
              </p>
              <p className="mt-2 font-extrabold text-[var(--kg-text)]">{roleLabel(profile.role)}</p>
            </div>
            <div className="rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-3.5 sm:col-span-2">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-[var(--kg-text-soft)]">
                <Mail size={14} /> Email
              </p>
              <p className="mt-2 break-all text-sm font-bold text-[var(--kg-text)]">
                {profile.email || 'Chưa cập nhật'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Thông tin Phiên bản & Nhật ký Nâng cấp Hệ thống */}
      <KgCard className="border-[var(--kg-accent)]/25 bg-[var(--kg-accent-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--kg-border)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--kg-accent)] text-white dark:text-[#0D1015] flex items-center justify-center shadow-xs flex-shrink-0">
              <Sparkles size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-sm sm:text-base text-[var(--kg-text)]">
                  Phiên bản ứng dụng {APP_VERSION_TAG}
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[11px] font-mono tabular-nums font-bold text-[var(--kg-accent-ink)]">
                  {APP_RELEASE_DATE}
                </span>
              </div>
              <p className="text-xs text-[var(--kg-text-muted)] font-medium mt-0.5">
                {APP_CODENAME} • Đổi mới 100% giao diện &amp; tối ưu khít đa thiết bị di động
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openReleaseNotesModal('all')}
            className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--kg-accent)] hover:brightness-95 text-white dark:text-[#0D1015] text-xs font-bold transition-colors shadow-xs touch-manipulation"
          >
            Xem toàn bộ điểm mới →
          </button>
        </div>

        <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {RELEASE_STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] p-2.5"
            >
              <p className="text-sm font-extrabold font-mono tabular-nums text-[var(--kg-accent-ink)]">
                {stat.value}
              </p>
              <p className="text-[11px] font-semibold text-[var(--kg-text-muted)] mt-0.5">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openReleaseNotesModal('added')}
            className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5 touch-manipulation"
          >
            <Sparkles size={13} className="text-[var(--kg-success)]" />
            Nâng cấp thêm gì
          </button>
          <button
            type="button"
            onClick={() => openReleaseNotesModal('redesigned')}
            className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5 touch-manipulation"
          >
            <Layers size={13} className="text-[var(--kg-accent-ink)]" />
            Đổi mới UI &amp; Mobile
          </button>
          <button
            type="button"
            onClick={() => openReleaseNotesModal('updated')}
            className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5 touch-manipulation"
          >
            <Wrench size={13} className="text-[var(--kg-primary-ink)]" />
            Chỉnh sửa / Cập nhật
          </button>
          <button
            type="button"
            onClick={() => openReleaseNotesModal('history')}
            className="min-h-[44px] sm:min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5 touch-manipulation"
          >
            <History size={13} className="text-[var(--kg-text-muted)]" />
            Lịch sử phiên bản
          </button>
        </div>
      </KgCard>

      <KgCard>
        <h3 className="flex items-center gap-2 font-extrabold text-[var(--kg-text)]">
          <KeyRound size={18} className="text-[var(--kg-primary-ink)]" />
          Quyền của tài khoản
        </h3>
        <div className="mt-4 space-y-2.5">
          {permissions.map(permission => (
            <div key={permission} className="flex items-start gap-2.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-3">
              <BadgeCheck size={17} className="mt-0.5 flex-shrink-0 text-[var(--kg-success)]" />
              <p className="text-xs font-semibold leading-5 text-[var(--kg-text-muted)]">{permission}</p>
            </div>
          ))}
        </div>
      </KgCard>

      <KgButton
        variant="secondary"
        size="md"
        icon={RefreshCw}
        loading={syncing}
        onClick={() => void loadProfile()}
        className="w-full"
      >
        Cập nhật trạng thái mới nhất
      </KgButton>
    </div>
  );
}
