import { Activity, Ban, PauseCircle, UserX } from 'lucide-react';
import { useAppStore, type User } from '../store/useAppStore';
import { getEmploymentStatusMeta } from '../utils/employment';

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
      <div className={`soft3d-card rounded-2xl border p-6 text-center ${status.badgeClass}`}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/60 shadow-sm dark:bg-slate-950/25">
          <Icon size={28} />
        </span>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.15em] opacity-70">Trạng thái nhân sự</p>
        <h2 className="mt-1 text-xl font-black">{status.label}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 opacity-80">
          Bạn chưa thể {actionLabel} trong trạng thái hiện tại. Liên hệ quản lý nếu thông tin cần được điều chỉnh.
        </p>
        {user.statusUntil && <p className="mt-2 text-xs font-extrabold">Thời hạn: {user.statusUntil}</p>}
        {user.statusReason && <p className="mt-2 text-xs italic opacity-75">Ghi chú: {user.statusReason}</p>}
        <button
          type="button"
          onClick={() => setCurrentTab('profile')}
          className="mt-5 rounded-xl bg-white/75 px-4 py-2.5 text-xs font-extrabold shadow-sm hover:bg-white dark:bg-slate-900/60"
        >
          Xem hồ sơ của tôi
        </button>
      </div>
    </div>
  );
}
