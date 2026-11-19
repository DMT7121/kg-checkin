import { Activity, Ban, PauseCircle, UserX } from 'lucide-react';
import { useAppStore, type User } from '../store/useAppStore';
import { getEmploymentStatusMeta } from '../utils/employment';
import { KgButton, KgCard } from './KgDesignSystem';

export default function EmploymentStatusNotice({
  user,
  actionLabel,
}: {
  user: User;
  actionLabel: string;
}) {
  const setCurrentTab = useAppStore(state => state.setCurrentTab);
  const status = getEmploymentStatusMeta(user.employmentStatus);
  const Icon = status.value === 'leave'
    ? PauseCircle
    : status.value === 'suspended'
      ? Ban
      : status.value === 'resigned' ? UserX : Activity;

  return (
    <div className="p-4 animate-slide-up">
      <KgCard className={`max-w-lg mx-auto rounded-2xl border p-6 text-center ${status.badgeClass}`}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text)] shadow-soft">
          <Icon size={28} />
        </span>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--kg-text-muted)]">
          Trạng thái nhân sự
        </p>
        <h2 className="mt-1 text-xl font-black text-[var(--kg-text)]">{status.label}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--kg-text-muted)]">
          Bạn chưa thể {actionLabel} trong trạng thái hiện tại. Liên hệ quản lý nếu thông tin cần được điều chỉnh.
        </p>
        {user.statusUntil && (
          <p className="mt-2 text-xs font-extrabold font-mono tabular-nums text-[var(--kg-text)]">
            Thời hạn: {user.statusUntil}
          </p>
        )}
        {user.statusReason && (
          <p className="mt-2 text-xs italic text-[var(--kg-text-muted)]">
            Ghi chú: {user.statusReason}
          </p>
        )}
        <div className="mt-5 flex justify-center">
          <KgButton
            variant="secondary"
            size="md"
            onClick={() => setCurrentTab('profile')}
            className="font-bold"
          >
            Xem hồ sơ của tôi
          </KgButton>
        </div>
      </KgCard>
    </div>
  );
}
