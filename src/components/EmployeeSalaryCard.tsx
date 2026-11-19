import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  LoaderCircle,
  MessageSquarePlus,
  RefreshCw,
  Send,
} from 'lucide-react';
import { callApi } from '../services/api';
import type { PayrollRecord, User } from '../store/useAppStore';
import { kgToast } from '../store/useFeedbackStore';
import type { SalaryAdjustmentRequest, SalaryPayType } from '../types/salary';
import {
  currentSalaryMonth,
  salaryMonthLabel,
  salaryTypeLabel,
} from '../types/salary';
import { formatVnd } from '../utils/formatCurrency';
import { KgButton, KgStatusBadge } from './KgDesignSystem';

export interface EmployeeSalaryCardProps {
  currentUser: User;
  month?: string;
  onMonthChange?: (month: string) => void;
  embeddedInPayroll?: boolean;
  payrollRecord?: PayrollRecord | null;
}

export default function EmployeeSalaryCard({
  currentUser,
  month: controlledMonth,
  payrollRecord = null,
}: EmployeeSalaryCardProps) {
  const [fallbackMonth] = useState(currentSalaryMonth);
  const month = controlledMonth ?? fallbackMonth;

  const [requests, setRequests] = useState<SalaryAdjustmentRequest[]>([]);
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [proposedType, setProposedType] = useState<SalaryPayType>(
    () => payrollRecord?.payType || 'hourly',
  );
  const [proposedAmount, setProposedAmount] = useState(() => {
    const val = payrollRecord?.salaryAmount ?? payrollRecord?.baseSalaryPerHour ?? 0;
    return val > 0 ? String(val) : '';
  });
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [sending, setSending] = useState(false);
  const prefetchedFromRecordRef = useRef(false);

  useEffect(() => {
    if (!payrollRecord) return;
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
  }, [payrollRecord, showForm]);

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

  const handleToggleForm = () => {
    const next = !showForm;
    setShowForm(next);
    setFormError('');
    if (next && !requestsLoaded && !loadingRequests) {
      loadAdjustments();
    }
  };

  const handleToggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && !requestsLoaded && !loadingRequests) {
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
      await loadAdjustments();
      kgToast('Đã gửi đề nghị điều chỉnh mức lương tới Quản lý', 'success');
    } catch {
      setFormError('Lỗi kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setSending(false);
    }
  };

  const monthRequests = requests.filter((request) => request.month === month);

  return (
    <section className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <MessageSquarePlus size={17} className="text-[var(--kg-accent-ink)] flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-black text-[var(--kg-text)]">
              Điều chỉnh định mức lương ({salaryMonthLabel(month)})
            </h3>
            <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 leading-snug">
              Phản hồi nếu đơn giá giờ hoặc lương tháng chuẩn chưa khớp thỏa thuận
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full">
          <button
            type="button"
            onClick={handleToggleHistory}
            className="flex-1 min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] inline-flex items-center justify-center gap-1.5 transition-colors touch-manipulation"
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
            className="flex-1"
          >
            {showForm ? 'Đóng biểu mẫu' : 'Đề nghị điều chỉnh'}
          </KgButton>
        </div>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-3.5 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
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
      )}

      {showHistory && (
        <div>
          {loadingRequests ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-3.5 text-xs font-semibold text-[var(--kg-text-muted)]">
              <LoaderCircle className="animate-spin text-[var(--kg-primary)]" size={16} />
              Đang tải lịch sử trao đổi lương...
            </div>
          ) : loadError ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--kg-danger)]/25 bg-[var(--kg-danger-soft)] p-3 text-xs text-[var(--kg-danger)] font-semibold">
              <span>{loadError}</span>
              <KgButton size="sm" variant="secondary" icon={RefreshCw} onClick={loadAdjustments}>
                Thử lại
              </KgButton>
            </div>
          ) : requestsLoaded && monthRequests.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-3.5 text-center text-xs font-medium text-[var(--kg-text-muted)]">
              Chưa có đề nghị điều chỉnh mức lương nào trong {salaryMonthLabel(month)}.
            </p>
          ) : (
            <div className="space-y-2.5">
              {monthRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] p-3.5"
                >
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
                          : 'Chờ admin'}
                    </KgStatusBadge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--kg-text-muted)] font-medium">
                    {request.reason}
                  </p>
                  {request.adminReply && (
                    <p className="mt-2 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] px-3 py-2 text-xs font-semibold text-[var(--kg-text)]">
                      <span className="font-black text-[var(--kg-primary-ink)] mr-1">Admin:</span>{' '}
                      {request.adminReply}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
