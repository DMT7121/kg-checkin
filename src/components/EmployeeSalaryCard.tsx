import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  LoaderCircle,
  MessageSquarePlus,
  RefreshCw,
  Send,
} from 'lucide-react';
import { callApi } from '../services/api';
import type { PayrollRecord, User } from '../store/useAppStore';
import type { MonthlySalaryItem, SalaryAdjustmentRequest, SalaryPayType } from '../types/salary';
import {
  currentSalaryMonth,
  salaryMonthLabel,
  salaryTypeLabel,
} from '../types/salary';
import { KgButton, KgToast, type ToastMessage } from './KgDesignSystem';
import { KgFeatureTip } from './KgFeatureTip';

const formatVnd = (amount: number) => `${Math.round(Number(amount) || 0).toLocaleString('vi-VN')} VNĐ`;

export default function EmployeeSalaryCard({
  currentUser,
  month: controlledMonth,
  onMonthChange,
  embeddedInPayroll = false,
  payrollRecord = null,
}: {
  currentUser: User;
  month?: string;
  onMonthChange?: (month: string) => void;
  embeddedInPayroll?: boolean;
  payrollRecord?: PayrollRecord | null;
}) {
  const [internalMonth, setInternalMonth] = useState(currentSalaryMonth);
  const month = controlledMonth ?? internalMonth;
  const setMonth = (nextMonth: string) => {
    setInternalMonth(nextMonth);
    onMonthChange?.(nextMonth);
  };

  const [salary, setSalary] = useState<MonthlySalaryItem | null>(null);
  const [requests, setRequests] = useState<SalaryAdjustmentRequest[]>([]);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [loading, setLoading] = useState(!embeddedInPayroll);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [proposedType, setProposedType] = useState<SalaryPayType>(() => payrollRecord?.payType || 'hourly');
  const [proposedAmount, setProposedAmount] = useState(() => {
    const val = payrollRecord?.salaryAmount ?? payrollRecord?.baseSalaryPerHour ?? 0;
    return val > 0 ? String(val) : '';
  });
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const prefetchedFromRecordRef = useRef(false);

  const pushToast = useCallback((title: string, type: ToastMessage['type']) => {
    setToasts((prev) => [...prev.slice(-2), { id: `${Date.now()}_${Math.random()}`, title, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sync default proposal values from payrollRecord when embedded
  useEffect(() => {
    if (!embeddedInPayroll || !payrollRecord) return;
    if (!prefetchedFromRecordRef.current || !showForm) {
      if (payrollRecord.payType) {
        setProposedType(payrollRecord.payType);
      }
      const amt = payrollRecord.salaryAmount ?? payrollRecord.baseSalaryPerHour ?? 0;
      if (amt > 0) {
        setProposedAmount(String(amt));
      }
      prefetchedFromRecordRef.current = true;
    }
  }, [embeddedInPayroll, payrollRecord, showForm]);

  const loadAdjustments = useCallback(async () => {
    setLoadingRequests(true);
    setLoadError('');
    try {
      const requestRes = await callApi(
        'GET_SALARY_ADJUSTMENTS',
        { role: currentUser.role, username: currentUser.username, forceRefresh: true },
        { background: true, cacheTtlMs: 0 },
      );
      if (requestRes?.ok) {
        setRequests(requestRes.data.requests || []);
        setRequestsLoaded(true);
      } else {
        setLoadError(requestRes?.message || 'Không thể tải danh sách đề nghị điều chỉnh.');
      }
    } catch {
      setLoadError('Lỗi kết nối khi tải đề nghị điều chỉnh.');
    } finally {
      setLoadingRequests(false);
    }
  }, [currentUser.role, currentUser.username]);

  const loadStandaloneData = useCallback(async () => {
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
      const item = configRes?.ok ? configRes.data.config?.items?.[0] || null : null;
      setSalary(item);
      if (item) {
        setProposedType(item.payType);
        setProposedAmount(String(item.amount || ''));
      }
      if (requestRes?.ok) {
        setRequests(requestRes.data.requests || []);
        setRequestsLoaded(true);
      }
    } catch {
      setLoadError('Không thể tải thông tin mức lương.');
    } finally {
      setLoading(false);
    }
  }, [currentUser.role, currentUser.username, month]);

  // Only fetch eagerly on mount when used standalone (not embedded in Payroll.tsx)
  useEffect(() => {
    if (embeddedInPayroll) return;
    const timer = window.setTimeout(loadStandaloneData, 0);
    return () => window.clearTimeout(timer);
  }, [embeddedInPayroll, loadStandaloneData]);

  const handleToggleForm = () => {
    const next = !showForm;
    setShowForm(next);
    setFormError('');
    if (next && embeddedInPayroll && !requestsLoaded && !loadingRequests) {
      loadAdjustments();
    }
  };

  const handleToggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && embeddedInPayroll && !requestsLoaded && !loadingRequests) {
      loadAdjustments();
    }
  };

  const submit = async () => {
    setFormError('');
    if (!Number(proposedAmount) || Number(proposedAmount) <= 0) {
      setFormError('Vui lòng nhập mức lương đề xuất hợp lệ.');
      return;
    }
    if (!reason.trim()) {
      setFormError('Vui lòng nhập lý do đề nghị điều chỉnh.');
      return;
    }
    setSending(true);
    try {
      const res = await callApi('SUBMIT_SALARY_ADJUSTMENT', {
        role: currentUser.role,
        username: currentUser.username,
        fullname: currentUser.fullname,
        month,
        proposedType,
        proposedAmount: Number(proposedAmount),
        reason: reason.trim(),
      });
      if (!res?.ok) {
        setFormError(res?.message || 'Chưa gửi được đề nghị. Vui lòng thử lại.');
        return;
      }
      setReason('');
      setShowForm(false);
      setShowHistory(true);
      if (embeddedInPayroll) {
        await loadAdjustments();
      } else {
        await loadStandaloneData();
      }
      pushToast('Đã gửi đề nghị điều chỉnh mức lương tới Quản lý', 'success');
    } catch {
      setFormError('Lỗi kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setSending(false);
    }
  };

  const monthRequests = requests.filter((request) => request.month === month);

  const renderToastPortal = () => (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-[10100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <KgToast key={t.id} message={t} onClose={dismissToast} />
        ))}
      </AnimatePresence>
    </div>
  );

  const renderAdjustmentForm = () => (
    <div className="mt-3 space-y-3 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-black uppercase text-[var(--kg-text-muted)]">
            Hình thức đề xuất
          </span>
          <select
            value={proposedType}
            onChange={(event) => setProposedType(event.target.value as SalaryPayType)}
            className="w-full rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2.5 text-sm font-bold text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)] min-h-[44px]"
          >
            <option value="hourly">Theo giờ</option>
            <option value="daily">Lương tháng / 30 ngày</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-black uppercase text-[var(--kg-text-muted)]">
            Mức lương đề xuất (VNĐ)
          </span>
          <input
            type="number"
            min="0"
            value={proposedAmount}
            onChange={(event) => setProposedAmount(event.target.value)}
            placeholder={proposedType === 'hourly' ? 'Ví dụ: 26000' : 'Ví dụ: 8000000'}
            className="w-full rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2.5 text-right text-sm font-mono tabular-nums font-black text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)] min-h-[44px]"
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-black uppercase text-[var(--kg-text-muted)]">
          Nội dung trao đổi
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={800}
          placeholder="Nêu lý do, thời điểm mong muốn áp dụng hoặc thông tin cần admin xem xét..."
          className="w-full resize-none rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3 py-2.5 text-sm text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
        />
      </label>
      {formError && (
        <p className="text-xs font-semibold text-[var(--kg-danger)] bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 rounded-xl px-3 py-2">
          {formError}
        </p>
      )}
      <KgButton
        type="button"
        variant="primary"
        size="md"
        loading={sending}
        onClick={submit}
        icon={Send}
        className="w-full"
      >
        {sending ? 'Đang gửi...' : 'Gửi đề nghị tới admin'}
      </KgButton>
    </div>
  );

  const renderRequestsList = () => {
    if (loadingRequests) {
      return (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-3.5 text-xs font-semibold text-[var(--kg-text-muted)]">
          <LoaderCircle className="animate-spin text-[var(--kg-primary)]" size={16} />
          Đang tải lịch sử trao đổi lương...
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--kg-danger)]/25 bg-[var(--kg-danger-soft)] p-3 text-xs text-[var(--kg-danger)] font-semibold">
          <span>{loadError}</span>
          <KgButton size="sm" variant="secondary" icon={RefreshCw} onClick={loadAdjustments}>
            Thử lại
          </KgButton>
        </div>
      );
    }

    if (requestsLoaded && monthRequests.length === 0) {
      return (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-3.5 text-center text-xs font-medium text-[var(--kg-text-muted)]">
          Chưa có đề nghị điều chỉnh mức lương nào trong {salaryMonthLabel(month)}.
        </p>
      );
    }

    if (!monthRequests.length) return null;

    return (
      <div className="mt-3 space-y-2.5">
        {monthRequests.map((request) => (
          <div key={request.id} className="rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-mono tabular-nums font-black text-[var(--kg-text)]">
                  {formatVnd(request.proposedAmount)} ·{' '}
                  <span className="font-sans font-bold text-xs text-[var(--kg-text-muted)]">
                    {salaryTypeLabel(request.proposedType)}
                  </span>
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--kg-text-muted)] font-mono tabular-nums">
                  {request.createdAt}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                  request.status === 'Approved'
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                    : request.status === 'Rejected'
                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                }`}
              >
                {request.status === 'Approved' ? 'Đã duyệt' : request.status === 'Rejected' ? 'Từ chối' : 'Chờ admin'}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--kg-text-muted)] font-medium">{request.reason}</p>
            {request.adminReply && (
              <p className="mt-2 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] px-3 py-2 text-xs font-semibold text-[var(--kg-text)]">
                <span className="font-black text-[var(--kg-primary-ink)] mr-1">Admin:</span> {request.adminReply}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (embeddedInPayroll) {
    return (
      <section className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquarePlus size={17} className="text-[var(--kg-accent-ink)] flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-black text-[var(--kg-text)]">
                Điều chỉnh định mức lương ({salaryMonthLabel(month)})
              </h3>
              <p className="text-[11px] text-[var(--kg-text-muted)]">
                Phản hồi nếu đơn giá giờ hoặc lương tháng chuẩn chưa khớp thỏa thuận
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleToggleHistory}
              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] inline-flex items-center gap-1.5 transition-colors touch-manipulation"
            >
              <span>Lịch sử đề nghị{requestsLoaded ? ` (${monthRequests.length})` : ''}</span>
              <ChevronDown size={14} className={`transition-transform ${showHistory ? 'rotate-180' : ''}`} />
            </button>
            <KgButton
              type="button"
              variant={showForm ? 'secondary' : 'primary'}
              size="sm"
              icon={MessageSquarePlus}
              onClick={handleToggleForm}
            >
              {showForm ? 'Đóng biểu mẫu' : 'Đề nghị điều chỉnh'}
            </KgButton>
          </div>
        </div>

        {showForm && renderAdjustmentForm()}
        {showHistory && renderRequestsList()}
        {renderToastPortal()}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] overflow-hidden rounded-2xl shadow-xs">
        <div className="bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] p-5 text-[var(--kg-text)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--kg-primary-ink)]">
                <CircleDollarSign size={16} />
                Mức lương của bạn
              </p>
              <h2 className="mt-1.5 text-xl sm:text-2xl font-black text-[var(--kg-text)]">{salaryMonthLabel(month)}</h2>
              <div className="mt-1 flex items-center gap-1.5">
                <p className="text-xs text-[var(--kg-text-muted)] font-medium">Thông tin do quản trị viên khai báo</p>
                <KgFeatureTip
                  title="Quy định Mức lương & Điều chỉnh"
                  tips={[
                    'Mức lương được Quản lý thiết lập theo chức danh và hợp đồng làm việc.',
                    'Lương theo giờ: Nhân tổng số giờ công thực tế trong tháng.',
                    'Lương tháng: Tính theo số ngày công chuẩn quy định.',
                    "Nếu mức lương chưa chính xác, bấm nút 'Gửi đề nghị điều chỉnh mức lương' bên dưới để phản hồi.",
                  ]}
                  size="sm"
                />
              </div>
            </div>
            <label htmlFor="emp-salary-month" className="rounded-xl bg-[var(--kg-surface)] px-3 py-2 border border-[var(--kg-border)] shadow-2xs min-h-[44px] flex items-center">
              <span className="sr-only">Chọn tháng</span>
              <input
                id="emp-salary-month"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value || currentSalaryMonth())}
                className="bg-transparent text-xs sm:text-sm font-bold text-[var(--kg-text)] outline-none font-mono tabular-nums"
              />
            </label>
          </div>

          {loading ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 text-sm font-semibold text-[var(--kg-text-muted)]">
              <LoaderCircle className="animate-spin text-[var(--kg-primary)]" size={18} /> Đang tải mức lương...
            </div>
          ) : salary ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] p-4">
                <p className="text-[11px] font-bold uppercase text-[var(--kg-text-muted)]">Hình thức</p>
                <p className="mt-1.5 flex items-center gap-2 text-base font-black text-[var(--kg-text)]">
                  {salary.payType === 'hourly' ? (
                    <Clock3 size={18} className="text-[var(--kg-primary)]" />
                  ) : (
                    <CalendarDays size={18} className="text-[var(--kg-primary)]" />
                  )}
                  {salaryTypeLabel(salary.payType)}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] p-4 text-left sm:text-right">
                <p className="text-[11px] font-bold uppercase text-[var(--kg-text-muted)]">
                  {salary.payType === 'hourly' ? 'Mức lương / giờ' : 'Lương tháng chuẩn'}
                </p>
                <p className="mt-1.5 text-xl sm:text-2xl font-black font-mono tabular-nums text-[var(--kg-primary-ink)]">
                  {formatVnd(salary.amount)}
                </p>
                {salary.payType === 'daily' && (
                  <p className="mt-1 text-[11px] text-[var(--kg-text-muted)] font-mono tabular-nums">
                    Tương đương {formatVnd(salary.amount / 30)} / ngày
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] p-4">
              <p className="font-bold text-sm text-[var(--kg-text)]">Admin chưa khai báo mức lương tháng này.</p>
              <p className="mt-1 text-xs text-[var(--kg-text-muted)]">
                Bạn vẫn có thể gửi đề nghị để admin kiểm tra và cập nhật.
              </p>
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5">
          <KgButton
            type="button"
            variant="secondary"
            size="md"
            icon={MessageSquarePlus}
            onClick={handleToggleForm}
            className="w-full"
          >
            {showForm ? 'Đóng biểu mẫu' : 'Gửi đề nghị điều chỉnh mức lương'}
          </KgButton>
          {showForm && renderAdjustmentForm()}
        </div>
      </div>

      {!!monthRequests.length && (
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs">
          <h3 className="font-black text-[var(--kg-text)] text-sm sm:text-base">
            Trao đổi trong {salaryMonthLabel(month)}
          </h3>
          {renderRequestsList()}
        </div>
      )}

      {renderToastPortal()}
    </section>
  );
}
