import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  LoaderCircle,
  MessageSquarePlus,
  Send,
} from 'lucide-react';
import Swal from 'sweetalert2';
import { callApi } from '../services/api';
import type { User } from '../store/useAppStore';
import type { MonthlySalaryItem, SalaryAdjustmentRequest, SalaryPayType } from '../types/salary';
import {
  currentSalaryMonth,
  formatSalaryMoney,
  salaryMonthLabel,
  salaryTypeLabel,
} from '../types/salary';
import { KgFeatureTip } from './KgFeatureTip';

export default function EmployeeSalaryCard({ currentUser }: { currentUser: User }) {
  const [month, setMonth] = useState(currentSalaryMonth);
  const [salary, setSalary] = useState<MonthlySalaryItem | null>(null);
  const [requests, setRequests] = useState<SalaryAdjustmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [proposedType, setProposedType] = useState<SalaryPayType>('hourly');
  const [proposedAmount, setProposedAmount] = useState('');
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [configRes, requestRes] = await Promise.all([
      callApi(
        'GET_MONTHLY_SALARY_CONFIG',
        { role: currentUser.role, username: currentUser.username, month, forceRefresh: true },
        { background: true, cacheTtlMs: 0 },
      ),
      callApi(
        'GET_SALARY_ADJUSTMENTS',
        { role: currentUser.role, username: currentUser.username, forceRefresh: true },
        { background: true, cacheTtlMs: 0 },
      ),
    ]);
    const item = configRes?.ok ? configRes.data.config?.items?.[0] || null : null;
    setSalary(item);
    if (item) {
      setProposedType(item.payType);
      setProposedAmount(String(item.amount || ''));
    }
    if (requestRes?.ok) setRequests(requestRes.data.requests || []);
    setLoading(false);
  }, [currentUser.role, currentUser.username, month]);

  useEffect(() => {
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const submit = async () => {
    if (!Number(proposedAmount) || !reason.trim()) {
      Swal.fire('Thiếu thông tin', 'Vui lòng nhập mức đề xuất và lý do điều chỉnh.', 'warning');
      return;
    }
    setSending(true);
    const res = await callApi('SUBMIT_SALARY_ADJUSTMENT', {
      role: currentUser.role,
      username: currentUser.username,
      fullname: currentUser.fullname,
      month,
      proposedType,
      proposedAmount: Number(proposedAmount),
      reason: reason.trim(),
    });
    setSending(false);
    if (!res?.ok) {
      Swal.fire('Chưa gửi được', res?.message || 'Vui lòng thử lại.', 'error');
      return;
    }
    setReason('');
    setShowForm(false);
    await loadData();
    Swal.fire({
      icon: 'success',
      title: 'Đã gửi tới admin',
      text: 'Bạn có thể theo dõi trạng thái ngay bên dưới.',
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const monthRequests = requests.filter(request => request.month === month);

  return (
    <section className="space-y-4">
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] overflow-hidden rounded-2xl shadow-xs">
        <div className="bg-gradient-hero p-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-[var(--kg-accent)]">
                <CircleDollarSign size={17} />
                Mức lương của bạn
              </p>
              <h2 className="mt-2 text-2xl font-black">{salaryMonthLabel(month)}</h2>
              <div className="mt-1 flex items-center gap-1.5">
                <p className="text-xs opacity-85 font-medium">Thông tin do quản trị viên khai báo</p>
                <KgFeatureTip
                  title="Quy định Mức lương & Điều chỉnh"
                  tips={[
                    "Mức lương được Quản lý thiết lập theo chức danh và hợp đồng làm việc.",
                    "Lương theo giờ: Nhân tổng số giờ công thực tế trong tháng.",
                    "Lương tháng: Tính theo số ngày công chuẩn quy định.",
                    "Nếu mức lương chưa chính xác, bấm nút 'Gửi đề nghị điều chỉnh mức lương' bên dưới để phản hồi."
                  ]}
                  variant="hero"
                  size="sm"
                />
              </div>
            </div>
            <label className="rounded-xl bg-white/10 p-2 backdrop-blur border border-white/10">
              <span className="sr-only">Chọn tháng</span>
              <input
                type="month"
                value={month}
                onChange={event => setMonth(event.target.value || currentSalaryMonth())}
                className="bg-transparent text-sm font-bold text-white outline-none [color-scheme:dark]"
              />
            </label>
          </div>

          {loading ? (
            <div className="mt-5 flex items-center gap-2 rounded-2xl bg-white/10 p-5 text-sm font-semibold">
              <LoaderCircle className="animate-spin" size={20} /> Đang tải mức lương...
            </div>
          ) : salary ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-[11px] font-bold uppercase opacity-80">Hình thức</p>
                <p className="mt-2 flex items-center gap-2 text-base font-black">
                  {salary.payType === 'hourly' ? <Clock3 size={19} /> : <CalendarDays size={19} />}
                  {salaryTypeLabel(salary.payType)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-[11px] font-bold uppercase opacity-80">
                  {salary.payType === 'hourly' ? 'Mức lương / giờ' : 'Lương tháng chuẩn'}
                </p>
                <p className="mt-2 text-2xl font-black font-mono">{formatSalaryMoney(salary.amount)}</p>
                {salary.payType === 'daily' && (
                  <p className="mt-1 text-[11px] opacity-80 font-mono">
                    Tương đương {formatSalaryMoney(salary.amount / 30)} / ngày
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-5">
              <p className="font-bold">Admin chưa khai báo mức lương tháng này.</p>
              <p className="mt-1 text-xs opacity-80">Bạn vẫn có thể gửi đề nghị để admin kiểm tra và cập nhật.</p>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5">
          <button
            type="button"
            onClick={() => setShowForm(value => !value)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] px-4 py-3 text-xs sm:text-sm font-black text-[var(--kg-text)] transition hover:bg-[var(--kg-border)]/40 active:scale-98"
          >
            <MessageSquarePlus size={17} className="text-[var(--kg-accent)]" />
            {showForm ? 'Đóng biểu mẫu' : 'Gửi đề nghị điều chỉnh mức lương'}
          </button>

          {showForm && (
            <div className="mt-4 space-y-3 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-[11px] font-black uppercase text-[var(--kg-text-muted)]">Hình thức đề xuất</span>
                  <select
                    value={proposedType}
                    onChange={event => setProposedType(event.target.value as SalaryPayType)}
                    className="w-full rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2.5 text-sm font-bold text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)] min-h-[44px]"
                  >
                    <option value="hourly">Theo giờ</option>
                    <option value="daily">Lương tháng / 30 ngày</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1.5 block text-[11px] font-black uppercase text-[var(--kg-text-muted)]">Mức lương đề xuất</span>
                  <input
                    type="number"
                    min="0"
                    value={proposedAmount}
                    onChange={event => setProposedAmount(event.target.value)}
                    placeholder={proposedType === 'hourly' ? 'Ví dụ: 26000' : 'Ví dụ: 8000000'}
                    className="w-full rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2.5 text-sm font-mono font-black text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)] min-h-[44px]"
                  />
                </label>
              </div>
              <label>
                <span className="mb-1.5 block text-[11px] font-black uppercase text-[var(--kg-text-muted)]">Nội dung trao đổi</span>
                <textarea
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  rows={3}
                  maxLength={800}
                  placeholder="Nêu lý do, thời điểm mong muốn áp dụng hoặc thông tin cần admin xem xét..."
                  className="w-full resize-none rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2.5 text-sm text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
                />
              </label>
              <button
                type="button"
                onClick={submit}
                disabled={sending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--kg-primary)] px-4 py-3 text-sm font-black text-white hover:brightness-110 disabled:opacity-50 active:scale-98 transition-all shadow-xs"
              >
                {sending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
                {sending ? 'Đang gửi...' : 'Gửi đề nghị tới admin'}
              </button>
            </div>
          )}
        </div>
      </div>

      {!!monthRequests.length && (
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs">
          <h3 className="font-black text-[var(--kg-text)] text-sm sm:text-base">Trao đổi trong {salaryMonthLabel(month)}</h3>
          <div className="mt-3 space-y-3">
            {monthRequests.map(request => (
              <div key={request.id} className="rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-mono font-black text-[var(--kg-text)]">
                      {formatSalaryMoney(request.proposedAmount)} · <span className="font-sans font-bold text-xs text-[var(--kg-text-muted)]">{salaryTypeLabel(request.proposedType)}</span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--kg-text-muted)] font-mono">{request.createdAt}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                    request.status === 'Approved'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : request.status === 'Rejected'
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  }`}>
                    {request.status === 'Approved' ? 'Đã duyệt' : request.status === 'Rejected' ? 'Từ chối' : 'Chờ admin'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--kg-text-muted)] font-medium">{request.reason}</p>
                {request.adminReply && (
                  <p className="mt-2 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] px-3 py-2 text-xs font-semibold text-[var(--kg-text)]">
                    <span className="font-black text-[var(--kg-primary)] dark:text-cyan-300 mr-1">Admin:</span> {request.adminReply}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
