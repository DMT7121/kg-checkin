import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Check,
  CircleDollarSign,
  Copy,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
  X,
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
import { isWorkEligible } from '../utils/employment';

interface MonthlySalaryManagerProps {
  currentUser: User;
  users: User[];
}

const newSalaryItem = (user: User): MonthlySalaryItem => ({
  username: user.username,
  fullname: user.fullname,
  payType: 'hourly',
  amount: 25000,
  standardDays: 30,
});

export default function MonthlySalaryManager({ currentUser, users }: MonthlySalaryManagerProps) {
  const [month, setMonth] = useState(currentSalaryMonth);
  const [items, setItems] = useState<MonthlySalaryItem[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [copySource, setCopySource] = useState('');
  const [requests, setRequests] = useState<SalaryAdjustmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const employeeUsers = useMemo(
    () => users.filter(user => user.role !== 'admin' && user.username && isWorkEligible(user)),
    [users],
  );

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

    if (configRes?.ok) {
      setItems(configRes.data.config?.items || []);
      const months = configRes.data.availableMonths || [];
      setAvailableMonths(months);
      setCopySource(months.find((value: string) => value !== month) || '');
      setDirty(false);
    }
    if (requestRes?.ok) setRequests(requestRes.data.requests || []);
    setLoading(false);
  }, [currentUser.role, currentUser.username, month]);

  useEffect(() => {
    if (currentUser.role !== 'admin') return;
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [currentUser.role, loadData]);

  const updateItem = (username: string, patch: Partial<MonthlySalaryItem>) => {
    setItems(current => current.map(item => (
      item.username === username ? { ...item, ...patch, standardDays: 30 } : item
    )));
    setDirty(true);
  };

  const addMissingEmployees = () => {
    const existing = new Set(items.map(item => item.username));
    const missing = employeeUsers.filter(user => !existing.has(user.username));
    if (!missing.length) {
      Swal.fire('Đã đầy đủ', 'Tất cả nhân viên đã có trong bảng khai báo tháng này.', 'info');
      return;
    }
    setItems(current => [...current, ...missing.map(newSalaryItem)]);
    setDirty(true);
  };

  const removeItem = (username: string) => {
    setItems(current => current.filter(item => item.username !== username));
    setDirty(true);
  };

  const save = async () => {
    const invalid = items.find(item => !item.amount || item.amount < 0);
    if (invalid) {
      Swal.fire('Mức lương chưa hợp lệ', `Vui lòng kiểm tra ${invalid.fullname}.`, 'warning');
      return;
    }
    setSaving(true);
    const res = await callApi('UPDATE_MONTHLY_SALARY_CONFIG', {
      role: currentUser.role,
      username: currentUser.username,
      month,
      items,
    });
    setSaving(false);
    if (!res?.ok) {
      Swal.fire('Không thể lưu', res?.message || 'Máy chủ chưa phản hồi.', 'error');
      return;
    }
    setItems(res.data.config.items || []);
    setAvailableMonths(current => Array.from(new Set([month, ...current])).sort().reverse());
    setDirty(false);
    Swal.fire({
      icon: 'success',
      title: 'Đã lưu bảng lương',
      text: `${salaryMonthLabel(month)} đã được cập nhật lên Spreadsheet dạng JSON.`,
      timer: 1800,
      showConfirmButton: false,
    });
  };

  const copyMonth = async () => {
    if (!copySource) return;
    const result = await Swal.fire({
      icon: 'question',
      title: `Sao chép sang ${salaryMonthLabel(month)}?`,
      text: `Dữ liệu hiện tại sẽ được thay bằng bảng lương của ${salaryMonthLabel(copySource)}.`,
      showCancelButton: true,
      confirmButtonText: 'Sao chép',
      cancelButtonText: 'Hủy',
      confirmButtonColor: '#0f6680',
    });
    if (!result.isConfirmed) return;
    setSaving(true);
    const res = await callApi('COPY_MONTHLY_SALARY_CONFIG', {
      role: currentUser.role,
      username: currentUser.username,
      sourceMonth: copySource,
      targetMonth: month,
    });
    setSaving(false);
    if (!res?.ok) {
      Swal.fire('Không thể sao chép', res?.message || 'Vui lòng thử lại.', 'error');
      return;
    }
    setItems(res.data.config.items || []);
    setAvailableMonths(current => Array.from(new Set([month, ...current])).sort().reverse());
    setDirty(false);
    Swal.fire('Đã sao chép', res.data.message || 'Bảng lương đã sẵn sàng.', 'success');
  };

  const reviewRequest = async (request: SalaryAdjustmentRequest, status: 'Approved' | 'Rejected') => {
    const { value: reply, isConfirmed } = await Swal.fire({
      title: status === 'Approved' ? 'Duyệt mức lương đề xuất?' : 'Từ chối đề nghị?',
      text: status === 'Approved'
        ? 'Mức đề xuất sẽ tự động cập nhật vào bảng lương đúng tháng.'
        : 'Nhân viên sẽ thấy phản hồi của bạn.',
      input: 'textarea',
      inputLabel: 'Phản hồi cho nhân viên',
      inputPlaceholder: 'Nhập ghi chú hoặc lý do...',
      showCancelButton: true,
      confirmButtonText: status === 'Approved' ? 'Duyệt & cập nhật' : 'Từ chối',
      cancelButtonText: 'Hủy',
      confirmButtonColor: status === 'Approved' ? '#059669' : '#dc2626',
    });
    if (!isConfirmed) return;
    const res = await callApi('REVIEW_SALARY_ADJUSTMENT', {
      role: currentUser.role,
      username: currentUser.username,
      requestId: request.id,
      status,
      adminReply: reply || '',
    });
    if (!res?.ok) {
      Swal.fire('Không thể xử lý', res?.message || 'Vui lòng thử lại.', 'error');
      return;
    }
    await loadData();
    Swal.fire({
      icon: 'success',
      title: status === 'Approved' ? 'Đã duyệt và cập nhật' : 'Đã gửi phản hồi',
      timer: 1500,
      showConfirmButton: false,
    });
  };

  if (currentUser.role !== 'admin') return null;

  const pendingRequests = requests.filter(request => request.status === 'Pending');

  return (
    <section className="space-y-4">
      <div className="soft3d-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200/70 dark:border-slate-700/70 bg-gradient-to-r from-cyan-50 to-emerald-50 dark:from-cyan-950/30 dark:to-emerald-950/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300">
                <CircleDollarSign size={16} />
                Khai báo mức lương hàng tháng
              </div>
              <h2 className="mt-2 text-xl font-black text-slate-900 dark:text-white">
                Bảng lương {salaryMonthLabel(month)}
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Mỗi tháng được lưu thành một JSON riêng trên Spreadsheet. Lương tháng được quy đổi theo chuẩn 30 ngày.
              </p>
            </div>
            {dirty && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                Có thay đổi chưa lưu
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(180px,0.7fr)_minmax(240px,1.3fr)_auto]">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase text-slate-500">Tháng áp dụng</span>
              <input
                type="month"
                value={month}
                onChange={event => setMonth(event.target.value || currentSalaryMonth())}
                className="w-full rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 text-sm font-bold text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase text-slate-500">Sao chép từ tháng cũ</span>
              <select
                value={copySource}
                onChange={event => setCopySource(event.target.value)}
                className="w-full rounded-xl border border-white/80 bg-white/90 px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
              >
                <option value="">Chọn tháng đã khai báo</option>
                {availableMonths.filter(value => value !== month).map(value => (
                  <option key={value} value={value}>{salaryMonthLabel(value)}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={copyMonth}
              disabled={!copySource || saving}
              className="self-end inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-cyan-800 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 dark:bg-slate-800 dark:text-cyan-300"
            >
              <Copy size={16} />
              Sao chép
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-cyan-700 dark:text-cyan-300" />
              <h3 className="font-extrabold text-slate-800 dark:text-white">{items.length} nhân viên</h3>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadData}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Tải lại
              </button>
              <button
                type="button"
                onClick={addMissingEmployees}
                className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-300"
              >
                <Plus size={14} />
                Thêm NV thiếu
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm font-semibold text-slate-500">
              <LoaderCircle className="animate-spin" size={20} /> Đang tải bảng lương...
            </div>
          ) : (
            <div className="space-y-2.5">
              {items.map(item => (
                <div
                  key={item.username}
                  className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-3.5 shadow-sm sm:grid-cols-[minmax(150px,1fr)_minmax(160px,0.8fr)_minmax(150px,0.8fr)_36px] sm:items-center dark:border-slate-700 dark:bg-slate-900/45"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-slate-800 dark:text-white">{item.fullname}</p>
                    <p className="truncate text-[11px] text-slate-400">@{item.username}</p>
                  </div>
                  <select
                    value={item.payType}
                    onChange={event => updateItem(item.username, { payType: event.target.value as SalaryPayType })}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="hourly">Theo giờ</option>
                    <option value="daily">Lương tháng / 30 ngày</option>
                  </select>
                  <label className="relative block">
                    <input
                      type="number"
                      min="0"
                      step={item.payType === 'hourly' ? 1000 : 100000}
                      value={item.amount || ''}
                      onChange={event => updateItem(item.username, { amount: Number(event.target.value) })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-8 text-right text-sm font-black text-cyan-800 outline-none focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-cyan-300"
                      aria-label={`Mức lương của ${item.fullname}`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">đ</span>
                    <span className="mt-1 block text-right text-[10px] text-slate-400">
                      {item.payType === 'hourly'
                        ? `${formatSalaryMoney(item.amount)} / giờ`
                        : `${formatSalaryMoney(item.amount / 30)} / ngày`}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => removeItem(item.username)}
                    className="justify-self-end rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                    aria-label={`Xóa ${item.fullname}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {!items.length && (
                <button
                  type="button"
                  onClick={addMissingEmployees}
                  className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-200 py-10 text-cyan-700 hover:bg-cyan-50/70 dark:border-cyan-900 dark:text-cyan-300 dark:hover:bg-cyan-950/20"
                >
                  <Users size={28} />
                  <span className="mt-2 text-sm font-extrabold">Tạo bảng lương cho nhân viên</span>
                  <span className="mt-1 text-xs text-slate-400">Mức khởi tạo: 25.000 đ/giờ</span>
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={save}
            disabled={saving || loading || !items.length}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-700 to-emerald-600 px-4 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-cyan-900/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Đang cập nhật Spreadsheet...' : `Lưu bảng lương ${salaryMonthLabel(month)}`}
          </button>
        </div>
      </div>

      <div className="soft3d-card rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-extrabold text-slate-800 dark:text-white">
              <MessageSquareText size={18} className="text-violet-500" />
              Đề nghị điều chỉnh lương
            </h3>
            <p className="mt-1 text-xs text-slate-500">{pendingRequests.length} đề nghị đang chờ xử lý</p>
          </div>
          {!!pendingRequests.length && (
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
              {pendingRequests.length} mới
            </span>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {requests.map(request => (
            <article
              key={request.id}
              className="rounded-2xl border border-slate-200/80 bg-white/65 p-4 dark:border-slate-700 dark:bg-slate-900/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-extrabold text-slate-800 dark:text-white">{request.fullname}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    @{request.username} · {salaryMonthLabel(request.month)} · {request.createdAt}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                  request.status === 'Approved'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : request.status === 'Rejected'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                }`}>
                  {request.status === 'Approved' ? 'Đã duyệt' : request.status === 'Rejected' ? 'Từ chối' : 'Chờ duyệt'}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Hiện tại</p>
                  <p className="mt-1 text-sm font-extrabold text-slate-600 dark:text-slate-300">
                    {formatSalaryMoney(request.currentAmount)}
                  </p>
                  <p className="text-[10px] text-slate-400">{salaryTypeLabel(request.currentType)}</p>
                </div>
                <div className="rounded-xl bg-cyan-50 p-3 dark:bg-cyan-950/25">
                  <p className="text-[10px] font-bold uppercase text-cyan-600">Đề xuất</p>
                  <p className="mt-1 text-sm font-extrabold text-cyan-800 dark:text-cyan-300">
                    {formatSalaryMoney(request.proposedAmount)}
                  </p>
                  <p className="text-[10px] text-cyan-600">{salaryTypeLabel(request.proposedType)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">{request.reason}</p>
              {request.adminReply && (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800">
                  Phản hồi: {request.adminReply}
                </p>
              )}
              {request.status === 'Pending' && (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => reviewRequest(request, 'Rejected')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300"
                  >
                    <X size={14} /> Từ chối
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewRequest(request, 'Approved')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    <Check size={14} /> Duyệt & cập nhật
                  </button>
                </div>
              )}
            </article>
          ))}
          {!requests.length && (
            <div className="flex flex-col items-center justify-center py-9 text-center text-slate-400">
              <BadgeCheck size={28} />
              <p className="mt-2 text-sm font-bold">Chưa có đề nghị điều chỉnh</p>
              <p className="mt-1 text-xs">Các đề nghị từ nhân viên sẽ xuất hiện tại đây.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
