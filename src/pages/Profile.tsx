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
import { KgModuleHero } from '../components/KgDesignSystem';
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
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const user = useAppStore.getState().currentUser;
    if (!user) return;
    setLoading(true);
    const res = await callApi(
      'GET_EMPLOYMENT_PROFILE',
      {
        role: user.role,
        username: user.username,
        forceRefresh: true,
      },
      { background: true, cacheTtlMs: 0 },
    );
    if (res?.ok) {
      const next = { ...user, ...res.data.profile };
      setProfile(next);
      setCurrentUser(next);
      localStorage.setItem('kg_user', JSON.stringify(next));
    } else {
      setProfile(user);
    }
    setLoading(false);
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
      />

      {loading ? (
        <div className="soft3d-card flex items-center justify-center gap-2 rounded-2xl py-14 text-sm font-bold text-slate-500">
          <LoaderCircle className="animate-spin" size={21} />
          Đang cập nhật hồ sơ...
        </div>
      ) : (
        <>
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
                    <span className="rounded-full bg-[var(--kg-primary-soft)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--kg-primary)]">
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
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-extrabold">
                        <CalendarClock size={14} /> Thời hạn: {profile.statusUntil}
                      </p>
                    )}
                    {profile.statusReason && (
                      <p className="mt-2 rounded-lg bg-white/50 px-3 py-2 text-xs dark:bg-slate-950/20">
                        Ghi chú: {profile.statusReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400">
                    <BriefcaseBusiness size={14} /> Chức vụ
                  </p>
                  <p className="mt-2 font-extrabold text-slate-800 dark:text-white">{profile.position || 'Nhân viên'}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400">
                    <ShieldCheck size={14} /> Phân quyền
                  </p>
                  <p className="mt-2 font-extrabold text-slate-800 dark:text-white">{roleLabel(profile.role)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60 sm:col-span-2">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400">
                    <Mail size={14} /> Email
                  </p>
                  <p className="mt-2 break-all text-sm font-bold text-slate-700 dark:text-slate-200">
                    {profile.email || 'Chưa cập nhật'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Thông tin Phiên bản & Nhật ký Nâng cấp Hệ thống */}
          <div className="soft3d-card rounded-2xl p-4 sm:p-5 border border-[var(--kg-accent)]/25 bg-[var(--kg-accent-soft)]">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--kg-border)]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#B83821] text-white flex items-center justify-center shadow-xs flex-shrink-0">
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
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#B83821] hover:bg-[#9E2F1B] text-white text-xs font-bold transition-colors shadow-xs"
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
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5"
              >
                <Sparkles size={13} className="text-emerald-600 dark:text-emerald-400" />
                Nâng cấp thêm gì
              </button>
              <button
                type="button"
                onClick={() => openReleaseNotesModal('redesigned')}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5"
              >
                <Layers size={13} className="text-[var(--kg-accent-ink)]" />
                Đổi mới UI &amp; Mobile
              </button>
              <button
                type="button"
                onClick={() => openReleaseNotesModal('updated')}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5"
              >
                <Wrench size={13} className="text-[var(--kg-primary-ink)]" />
                Chỉnh sửa / Cập nhật
              </button>
              <button
                type="button"
                onClick={() => openReleaseNotesModal('history')}
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] hover:border-[var(--kg-border-strong)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5"
              >
                <History size={13} className="text-[var(--kg-text-muted)]" />
                Lịch sử phiên bản
              </button>
            </div>
          </div>

          <div className="soft3d-card rounded-2xl p-5">
            <h3 className="flex items-center gap-2 font-extrabold text-slate-800 dark:text-white">
              <KeyRound size={18} className="text-[var(--kg-primary)]" />
              Quyền của tài khoản
            </h3>
            <div className="mt-4 space-y-2.5">
              {permissions.map(permission => (
                <div key={permission} className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <BadgeCheck size={17} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                  <p className="text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{permission}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={loadProfile}
            className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] px-4 py-3 text-xs font-bold text-[var(--kg-text)] hover:brightness-95 transition-all"
          >
            <RefreshCw size={15} /> Cập nhật trạng thái mới nhất
          </button>
        </>
      )}
    </div>
  );
}
