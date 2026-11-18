import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  BadgeCheck,
  Check,
  CircleDollarSign,
  Copy,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { callApi } from '../services/api';
import type { User } from '../store/useAppStore';
import type { MonthlySalaryItem, SalaryAdjustmentRequest, SalaryPayType } from '../types/salary';
import {
  currentSalaryMonth,
  salaryMonthLabel,
  salaryTypeLabel,
} from '../types/salary';
import { isWorkEligible } from '../utils/employment';
import {
  KgBottomSheet,
  KgButton,
  KgConfirmSheet,
  KgEmptyState,
  KgErrorState,
  KgSkeleton,
  KgStatusBadge,
  KgToast,
  type ToastMessage,
} from './KgDesignSystem';

interface MonthlySalaryManagerProps {
  currentUser: User;
  users: User[];
}

const formatVnd = (amount: number) =>
  `${Math.round(Number(amount) || 0).toLocaleString('vi-VN')} VNĐ`;

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
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Sheet states (replacing Swal)
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    request: SalaryAdjustmentRequest;
    status: 'Approved' | 'Rejected';
  } | null>(null);
  const [reviewReply, setReviewReply] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((title: string, type: ToastMessage['type']) => {
    setToasts((prev) => [...prev.slice(-2), { id: `${Date.now()}_${Math.random()}`, title, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const employeeUsers = useMemo(
    () => users.filter((user) => user.role !== 'admin' && user.username && isWorkEligible(user)),
    [users],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
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
      } else {
        setLoadError(configRes?.message || 'Không thể tải cấu hình bảng lương.');
      }
      if (requestRes?.ok) setRequests(requestRes.data.requests || []);
    } catch {
      setLoadError('Lỗi kết nối khi tải cấu hình bảng lương.');
    } finally {
      setLoading(false);
    }
  }, [currentUser.role, currentUser.username, month]);

  useEffect(() => {
    if (currentUser.role !== 'admin') return;
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [currentUser.role, loadData]);

  const updateItem = (username: string, patch: Partial<MonthlySalaryItem>) => {
    setItems((current) =>
      current.map((item) => (item.username === username ? { ...item, ...patch, standardDays: 30 } : item)),
    );
    setDirty(true);
  };

  const addMissingEmployees = () => {
    const existing = new Set(items.map((item) => item.username));
    const missing = employeeUsers.filter((user) => !existing.has(user.username));
    if (!missing.length) {
      pushToast('Tất cả nhân viên đã có trong bảng khai báo tháng này.', 'info');
      return;
    }
    setItems((current) => [...current, ...missing.map(newSalaryItem)]);
    setDirty(true);
    pushToast(`Đã thêm ${missing.length} nhân viên vào bảng khai báo`, 'success');
  };

  const removeItem = (username: string) => {
    setItems((current) => current.filter((item) => item.username !== username));
    setDirty(true);
  };

  const save = async () => {
    const invalid = items.find((item) => !item.amount || item.amount < 0);
    if (invalid) {
      pushToast(`Mức lương của ${invalid.fullname} chưa hợp lệ.`, 'warning');
      return;
    }
    setSaving(true);
    try {
      const res = await callApi('UPDATE_MONTHLY_SALARY_CONFIG', {
        role: currentUser.role,
        username: currentUser.username,
        month,
        items,
      });
      if (!res?.ok) {
        pushToast(res?.message || 'Máy chủ chưa phản hồi, không thể lưu.', 'error');
        return;
      }
      setItems(res.data.config.items || []);
      setAvailableMonths((current) => Array.from(new Set([month, ...current])).sort().reverse());
      setDirty(false);
      pushToast(`Đã lưu bảng lương ${salaryMonthLabel(month)}`, 'success');
    } catch {
      pushToast('Lỗi kết nối khi lưu bảng lương.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const executeCopyMonth = async () => {
    if (!copySource) return;
    setSaving(true);
    try {
      const res = await callApi('COPY_MONTHLY_SALARY_CONFIG', {
        role: currentUser.role,
        username: currentUser.username,
        sourceMonth: copySource,
        targetMonth: month,
      });
      if (!res?.ok) {
        pushToast(res?.message || 'Không thể sao chép bảng lương.', 'error');
        return;
      }
      setItems(res.data.config.items || []);
      setAvailableMonths((current) => Array.from(new Set([month, ...current])).sort().reverse());
      setDirty(false);
      setCopyConfirmOpen(false);
      pushToast(res.data.message || 'Bảng lương đã sao chép thành công.', 'success');
    } catch {
      pushToast('Lỗi kết nối khi sao chép bảng lương.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const executeReviewRequest = async () => {
    if (!reviewTarget) return;
    setReviewBusy(true);
    try {
      const res = await callApi('REVIEW_SALARY_ADJUSTMENT', {
        role: currentUser.role,
        username: currentUser.username,
        requestId: reviewTarget.request.id,
        status: reviewTarget.status,
        adminReply: reviewReply.trim(),
      });
      if (!res?.ok) {
        pushToast(res?.message || 'Không thể xử lý đề nghị điều chỉnh.', 'error');
        return;
      }
      setReviewTarget(null);
      setReviewReply('');
      await loadData();
      pushToast(
        reviewTarget.status === 'Approved' ? 'Đã duyệt và cập nhật mức lương' : 'Đã gửi phản hồi từ chối',
        'success',
      );
    } catch {
      pushToast('Lỗi kết nối khi xử lý đề nghị.', 'error');
    } finally {
      setReviewBusy(false);
    }
  };

  if (currentUser.role !== 'admin') return null;

  const pendingRequests = requests.filter((request) => request.status === 'Pending');

  return (
    <section className="space-y-4">
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 sm:p-5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[var(--kg-primary-ink)]">
                <CircleDollarSign size={16} />
                Khai báo mức lương hàng tháng
              </div>
              <h2 className="mt-1.5 text-lg sm:text-xl font-black text-[var(--kg-text)]">
                Bảng lương {salaryMonthLabel(month)}
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--kg-text-muted)]">
                Mỗi tháng được lưu thành một cấu hình riêng. Lương tháng được quy đổi theo chuẩn 30 ngày.
              </p>
            </div>
            {dirty && <KgStatusBadge variant="warning">Có thay đổi chưa lưu</KgStatusBadge>}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1.2fr)_auto]">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase text-[var(--kg-text-muted)]">
                Tháng áp dụng
              </span>
              <input
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value || currentSalaryMonth())}
                className="w-full min-h-[44px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2 text-sm font-bold font-mono tabular-nums text-[var(--kg-text)] shadow-xs outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase text-[var(--kg-text-muted)]">
                Sao chép từ tháng cũ
              </span>
              <select
                value={copySource}
                onChange={(event) => setCopySource(event.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2 text-sm font-semibold text-[var(--kg-text)] shadow-xs outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
              >
                <option value="">Chọn tháng đã khai báo</option>
                {availableMonths
                  .filter((value) => value !== month)
                  .map((value) => (
                    <option key={value} value={value}>
                      {salaryMonthLabel(value)}
                    </option>
                  ))}
              </select>
            </label>
            <KgButton
              type="button"
              variant="secondary"
              size="md"
              icon={Copy}
              onClick={() => setCopyConfirmOpen(true)}
              disabled={!copySource || saving}
              className="lg:self-end"
            >
              Sao chép
            </KgButton>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-[var(--kg-primary)]" />
              <h3 className="font-extrabold text-[var(--kg-text)] font-mono tabular-nums">
                {items.length} <span className="font-sans">nhân viên</span>
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <KgButton
                type="button"
                variant="ghost"
                size="sm"
                icon={RefreshCw}
                onClick={loadData}
                disabled={loading}
              >
                Tải lại
              </KgButton>
              <KgButton
                type="button"
                variant="secondary"
                size="sm"
                icon={Plus}
                onClick={addMissingEmployees}
              >
                Thêm NV thiếu
              </KgButton>
            </div>
          </div>

          {loadError ? (
            <KgErrorState title="Không thể tải cấu hình lương" description={loadError} onRetry={loadData} />
          ) : loading ? (
            <div className="space-y-2.5 py-2">
              <KgSkeleton className="h-14 w-full" />
              <KgSkeleton className="h-14 w-full" />
              <KgSkeleton className="h-14 w-full" />
            </div>
          ) : !items.length ? (
            <KgEmptyState
              icon={Users}
              title="Chưa có cấu hình lương tháng này"
              description="Khởi tạo nhanh danh sách nhân viên với mức đề xuất ban đầu 25.000 VNĐ/giờ."
              action={{ label: 'Tạo bảng lương cho nhân viên', onClick: addMissingEmployees }}
            />
          ) : (
            <>
              {/* Desktop Sticky-Header Table */}
              <div className="hidden md:block overflow-auto max-h-[540px] rounded-xl border border-[var(--kg-border)]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] text-[11px] uppercase tracking-wider text-[var(--kg-text-muted)]">
                    <tr>
                      <th className="py-3 px-3.5 font-bold">Nhân viên</th>
                      <th className="py-3 px-3 font-bold">Hình thức trả lương</th>
                      <th className="py-3 px-3 font-bold text-right">Định mức (VNĐ)</th>
                      <th className="py-3 px-3 font-bold text-right">Quy đổi đơn giá</th>
                      <th className="py-3 px-3.5 font-bold text-right w-16">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--kg-border)] bg-[var(--kg-surface)]">
                    {items.map((item) => (
                      <tr key={item.username} className="hover:bg-[var(--kg-surface-soft)]/60 transition-colors">
                        <td className="py-2.5 px-3.5 min-w-[180px]">
                          <p className="text-sm font-extrabold text-[var(--kg-text)] truncate">{item.fullname}</p>
                          <p className="text-[11px] text-[var(--kg-text-muted)] font-mono">@{item.username}</p>
                        </td>
                        <td className="py-2.5 px-3 min-w-[190px]">
                          <select
                            aria-label={`Hình thức lương của ${item.fullname}`}
                            value={item.payType}
                            onChange={(event) =>
                              updateItem(item.username, { payType: event.target.value as SalaryPayType })
                            }
                            className="w-full min-h-[38px] rounded-lg border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-2.5 py-1.5 text-xs font-bold text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
                          >
                            <option value="hourly">Theo giờ</option>
                            <option value="daily">Lương tháng / 30 ngày</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-3 min-w-[180px]">
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              step={item.payType === 'hourly' ? 1000 : 100000}
                              value={item.amount || ''}
                              onChange={(event) =>
                                updateItem(item.username, { amount: Number(event.target.value) })
                              }
                              className="w-full min-h-[38px] rounded-lg border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] pl-3 pr-11 py-1.5 text-right text-sm font-mono tabular-nums font-black text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
                              aria-label={`Mức lương của ${item.fullname}`}
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--kg-text-muted)] pointer-events-none">
                              VNĐ
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--kg-text-muted)] whitespace-nowrap">
                          {item.payType === 'hourly'
                            ? `${formatVnd(item.amount)} / giờ`
                            : `${formatVnd(item.amount / 30)} / ngày`}
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(item.username)}
                            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-[var(--kg-text-muted)] hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                            aria-label={`Xóa ${item.fullname}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-2.5">
                {items.map((item) => (
                  <div
                    key={item.username}
                    className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-3.5 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-[var(--kg-text)]">{item.fullname}</p>
                        <p className="truncate text-[11px] text-[var(--kg-text-muted)] font-mono">@{item.username}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.username)}
                        className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 rounded-xl flex items-center justify-center text-[var(--kg-text-muted)] hover:bg-rose-500/10 hover:text-rose-600 touch-manipulation"
                        aria-label={`Xóa ${item.fullname}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      <label className="block">
                        <span className="block text-[11px] font-bold text-[var(--kg-text-muted)] mb-1">
                          Hình thức trả lương
                        </span>
                        <select
                          value={item.payType}
                          onChange={(event) =>
                            updateItem(item.username, { payType: event.target.value as SalaryPayType })
                          }
                          className="w-full min-h-[44px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2 text-xs font-bold text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
                        >
                          <option value="hourly">Theo giờ</option>
                          <option value="daily">Lương tháng / 30 ngày</option>
                        </select>
                      </label>

                      <label className="block">
                        <span className="block text-[11px] font-bold text-[var(--kg-text-muted)] mb-1">
                          Mức lương (VNĐ)
                        </span>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step={item.payType === 'hourly' ? 1000 : 100000}
                            value={item.amount || ''}
                            onChange={(event) =>
                              updateItem(item.username, { amount: Number(event.target.value) })
                            }
                            className="w-full min-h-[44px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] pl-3 pr-12 py-2 text-right text-sm font-mono tabular-nums font-black text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
                            aria-label={`Mức lương của ${item.fullname}`}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-[var(--kg-text-muted)] pointer-events-none">
                            VNĐ
                          </span>
                        </div>
                        <span className="mt-1 block text-right text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                          {item.payType === 'hourly'
                            ? `${formatVnd(item.amount)} / giờ`
                            : `${formatVnd(item.amount / 30)} / ngày`}
                        </span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <KgButton
            type="button"
            variant="primary"
            size="lg"
            loading={saving}
            disabled={saving || loading || !items.length}
            icon={Save}
            onClick={save}
            className="w-full"
          >
            {saving ? 'Đang cập nhật bảng lương...' : `Lưu bảng lương ${salaryMonthLabel(month)}`}
          </KgButton>
        </div>
      </div>

      {/* Adjustment Requests Panel */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-extrabold text-[var(--kg-text)]">
              <MessageSquareText size={18} className="text-[var(--kg-accent-ink)]" />
              Đề nghị điều chỉnh lương
            </h3>
            <p className="mt-1 text-xs text-[var(--kg-text-muted)] font-mono tabular-nums">
              {pendingRequests.length} <span className="font-sans">đề nghị đang chờ xử lý</span>
            </p>
          </div>
          {!!pendingRequests.length && <KgStatusBadge variant="warning">{pendingRequests.length} mới</KgStatusBadge>}
        </div>

        <div className="mt-4 space-y-3">
          {requests.map((request) => (
            <article
              key={request.id}
              className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-extrabold text-[var(--kg-text)]">{request.fullname}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--kg-text-muted)] font-mono tabular-nums">
                    @{request.username} · {salaryMonthLabel(request.month)} · {request.createdAt}
                  </p>
                </div>
                <KgStatusBadge
                  variant={
                    request.status === 'Approved'
                      ? 'success'
                      : request.status === 'Rejected'
                        ? 'error'
                        : 'warning'
                  }
                >
                  {request.status === 'Approved'
                    ? 'Đã duyệt'
                    : request.status === 'Rejected'
                      ? 'Từ chối'
                      : 'Chờ duyệt'}
                </KgStatusBadge>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3">
                  <p className="text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">Hiện tại</p>
                  <p className="mt-1 text-sm font-mono tabular-nums font-extrabold text-[var(--kg-text)]">
                    {formatVnd(request.currentAmount)}
                  </p>
                  <p className="text-[10px] text-[var(--kg-text-muted)]">{salaryTypeLabel(request.currentType)}</p>
                </div>
                <div className="rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-accent)]/30 p-3">
                  <p className="text-[10px] font-bold uppercase text-[var(--kg-accent-ink)]">Đề xuất</p>
                  <p className="mt-1 text-sm font-mono tabular-nums font-extrabold text-[var(--kg-accent-ink)]">
                    {formatVnd(request.proposedAmount)}
                  </p>
                  <p className="text-[10px] text-[var(--kg-accent-ink)]">{salaryTypeLabel(request.proposedType)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--kg-text)]">{request.reason}</p>
              {request.adminReply && (
                <p className="mt-2 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] px-3 py-2 text-xs text-[var(--kg-text-muted)]">
                  Phản hồi: {request.adminReply}
                </p>
              )}
              {request.status === 'Pending' && (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <KgButton
                    type="button"
                    variant="danger"
                    size="sm"
                    icon={X}
                    onClick={() => {
                      setReviewReply('');
                      setReviewTarget({ request, status: 'Rejected' });
                    }}
                  >
                    Từ chối
                  </KgButton>
                  <KgButton
                    type="button"
                    variant="primary"
                    size="sm"
                    icon={Check}
                    onClick={() => {
                      setReviewReply('');
                      setReviewTarget({ request, status: 'Approved' });
                    }}
                  >
                    Duyệt &amp; cập nhật
                  </KgButton>
                </div>
              )}
            </article>
          ))}
          {!requests.length && (
            <div className="flex flex-col items-center justify-center py-9 text-center text-[var(--kg-text-muted)]">
              <BadgeCheck size={28} />
              <p className="mt-2 text-sm font-bold">Chưa có đề nghị điều chỉnh</p>
              <p className="mt-1 text-xs">Các đề nghị từ nhân viên sẽ xuất hiện tại đây.</p>
            </div>
          )}
        </div>
      </div>

      {/* Copy Month Confirmation Sheet */}
      <KgConfirmSheet
        isOpen={copyConfirmOpen}
        onClose={() => {
          if (!saving) setCopyConfirmOpen(false);
        }}
        onConfirm={executeCopyMonth}
        loading={saving}
        title={`Sao chép sang ${salaryMonthLabel(month)}?`}
        message={
          copySource
            ? `Dữ liệu hiện tại của ${salaryMonthLabel(month)} sẽ được thay thế bằng bảng lương của ${salaryMonthLabel(copySource)}.`
            : ''
        }
        confirmLabel="Sao chép ngay"
        cancelLabel="Hủy"
        variant="info"
      />

      {/* Review Adjustment Drawer */}
      <KgBottomSheet
        isOpen={Boolean(reviewTarget)}
        onClose={() => {
          if (!reviewBusy) setReviewTarget(null);
        }}
        title={reviewTarget?.status === 'Approved' ? 'Duyệt mức lương đề xuất' : 'Từ chối đề nghị điều chỉnh'}
        subtitle={
          reviewTarget
            ? `${reviewTarget.request.fullname} · ${formatVnd(reviewTarget.request.proposedAmount)}`
            : undefined
        }
        footer={
          <div className="flex gap-2.5">
            <KgButton
              variant="secondary"
              className="flex-1"
              disabled={reviewBusy}
              onClick={() => setReviewTarget(null)}
            >
              Hủy
            </KgButton>
            <KgButton
              variant={reviewTarget?.status === 'Approved' ? 'primary' : 'danger'}
              className="flex-1"
              loading={reviewBusy}
              onClick={executeReviewRequest}
            >
              {reviewTarget?.status === 'Approved' ? 'Duyệt & cập nhật' : 'Xác nhận từ chối'}
            </KgButton>
          </div>
        }
      >
        <div className="space-y-3 py-1">
          <p className="text-xs text-[var(--kg-text-muted)]">
            {reviewTarget?.status === 'Approved'
              ? 'Mức đề xuất sẽ tự động cập nhật vào bảng lương đúng tháng.'
              : 'Nhân viên sẽ thấy phản hồi của bạn trong lịch sử trao đổi.'}
          </p>
          <label className="block space-y-1.5">
            <span className="block text-xs font-semibold text-[var(--kg-text-muted)]">
              Phản hồi cho nhân viên (tùy chọn)
            </span>
            <textarea
              value={reviewReply}
              onChange={(e) => setReviewReply(e.target.value)}
              rows={3}
              placeholder="Nhập ghi chú hoặc lý do..."
              className="w-full rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3.5 py-2.5 text-sm text-[var(--kg-text)] outline-none focus:border-[var(--kg-primary)]"
            />
          </label>
        </div>
      </KgBottomSheet>

      <div className="fixed bottom-20 md:bottom-6 right-4 z-[10100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <KgToast key={t.id} message={t} onClose={dismissToast} />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
