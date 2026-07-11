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
      <div className="soft3d-card overflow-hidden rounded-2xl">
        <div className="bg-gradient-to-br from-cyan-800 via-cyan-700 to-emerald-600 p-5 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.15em] text-cyan-100">
                <CircleDollarSign size={17} />
                Mức lương của bạn
              </p>
              <h2 className="mt-3 text-2xl font-black">{salaryMonthLabel(month)}</h2>
              <p className="mt-1 text-xs text-cyan-100/85">Thông tin do quản trị viên khai báo</p>
            </div>
            <label className="rounded-xl bg-white/12 p-2 backdrop-blur">
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
              <div className="rounded-2xl border border-white/15 bg-white/12 p-4 backdrop-blur">
                <p className="text-[11px] font-bold uppercase text-cyan-100">Hình thức</p>
                <p className="mt-2 flex items-center gap-2 text-base font-black">
                  {salary.payType === 'hourly' ? <Clock3 size={19} /> : <CalendarDays size={19} />}
                  {salaryTypeLabel(salary.payType)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/12 p-4 backdrop-blur">
                <p className="text-[11px] font-bold uppercase text-cyan-100">
                  {salary.payType === 'hourly' ? 'Mức lương / giờ' : 'Lương tháng chuẩn'}
                </p>
                <p className="mt-2 text-2xl font-black">{formatSalaryMoney(salary.amount)}</p>
                {salary.payType === 'daily' && (
                  <p className="mt-1 text-[11px] text-cyan-100">
                    Tương đương {formatSalaryMoney(salary.amount / 30)} / ngày
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-white/15 bg-white/10 p-5">
              <p className="font-bold">Admin chưa khai báo mức lương tháng này.</p>
              <p className="mt-1 text-xs text-cyan-100">Bạn vẫn có thể gửi đề nghị để admin kiểm tra và cập nhật.</p>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5">
          <button
            type="button"
            onClick={() => setShowForm(value => !value)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-50 px-4 py-3 text-sm font-extrabold text-violet-700 transition hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300"
          >
            <MessageSquarePlus size={17} />
            {showForm ? 'Đóng biểu mẫu' : 'Gửi đề nghị điều chỉnh mức lương'}
          </button>

          {showForm && (
            <div className="mt-4 space-y-3 rounded-2xl border border-violet-100 bg-violet-50/55 p-4 dark:border-violet-900/50 dark:bg-violet-950/15">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-[11px] font-bold uppercase text-slate-500">Hình thức đề xuất</span>
                  <select
                    value={proposedType}
                    onChange={event => setProposedType(event.target.value as SalaryPayType)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="hourly">Theo giờ</option>
                    <option value="daily">Lương tháng / 30 ngày</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1.5 block text-[11px] font-bold uppercase text-slate-500">Mức lương đề xuất</span>
                  <input
                    type="number"
                    min="0"
                    value={proposedAmount}
                    onChange={event => setProposedAmount(event.target.value)}
                    placeholder={proposedType === 'hourly' ? 'Ví dụ: 26000' : 'Ví dụ: 8000000'}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black text-violet-700 outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-violet-300"
                  />
                </label>
              </div>
              <label>
                <span className="mb-1.5 block text-[11px] font-bold uppercase text-slate-500">Nội dung trao đổi</span>
                <textarea
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  rows={3}
                  maxLength={800}
                  placeholder="Nêu lý do, thời điểm mong muốn áp dụng hoặc thông tin cần admin xem xét..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </label>
              <button
                type="button"
                onClick={submit}
                disabled={sending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {sending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
                {sending ? 'Đang gửi...' : 'Gửi đề nghị tới admin'}
              </button>
            </div>
          )}
        </div>
      </div>

      {!!monthRequests.length && (
        <div className="soft3d-card rounded-2xl p-5">
          <h3 className="font-extrabold text-slate-800 dark:text-white">Trao đổi trong {salaryMonthLabel(month)}</h3>
          <div className="mt-3 space-y-3">
            {monthRequests.map(request => (
              <div key={request.id} className="rounded-xl border border-slate-200/80 p-3.5 dark:border-slate-700">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                      {formatSalaryMoney(request.proposedAmount)} · {salaryTypeLabel(request.proposedType)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{request.createdAt}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                    request.status === 'Approved'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : request.status === 'Rejected'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  }`}>
                    {request.status === 'Approved' ? 'Đã duyệt' : request.status === 'Rejected' ? 'Từ chối' : 'Chờ admin'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{request.reason}</p>
                {request.adminReply && (
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Admin: {request.adminReply}
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
