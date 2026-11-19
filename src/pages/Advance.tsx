import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeDollarSign,
  CheckCheck,
  Clock,
  History,
  RefreshCw,
  Search,
  Send,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  KgButton,
  KgConfirmSheet,
  KgEmptyState,
  KgErrorState,
  KgInput,
  KgModuleHero,
  KgSkeleton,
  KgStatusBadge,
} from '../components/KgDesignSystem';
import { callApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { kgToast } from '../store/useFeedbackStore';
import { formatMoneyInput, formatVnd } from '../utils/formatCurrency';
import { isAdminUser } from '../utils/permissions';

type AdvanceFilterStatus = 'ALL' | 'Pending' | 'Approved' | 'Rejected';

export default function Advance({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const currentUser = useAppStore((s) => s.currentUser);
  const advances = useAppStore((s) => s.advances);
  const payrollData = useAppStore((s) => s.payrollData);
  const serverPayrollConfig = useAppStore((s) => s.serverPayrollConfig);
  const setAdvances = useAppStore((s) => s.setAdvances);
  const isManagerView = mode === 'admin' && isAdminUser(currentUser);

  const visibleAdvances = useMemo(
    () =>
      isManagerView
        ? advances
        : advances.filter((a) => !currentUser?.username || a.username === currentUser.username),
    [advances, currentUser?.username, isManagerView],
  );

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [initialLoading, setInitialLoading] = useState(() => advances.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<AdvanceFilterStatus>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Confirm sheets
  const [submitConfirmAmount, setSubmitConfirmAmount] = useState<number | null>(null);
  const [pendingDecision, setPendingDecision] = useState<{
    id: string;
    fullname: string;
    amount: number;
    action: 'APPROVE' | 'REJECT';
  } | null>(null);

  const loadAdvances = useCallback(
    async (isInitial = false) => {
      if (isInitial) setInitialLoading(true);
      else setIsRefreshing(true);
      setLoadError('');
      try {
        const res = await callApi('GET_ADVANCES', {
          username: currentUser?.username,
          role: currentUser?.role,
        });
        if (res?.ok && Array.isArray(res.data)) {
          setAdvances(res.data);
        } else if (!res?.ok) {
          setLoadError(res?.message || 'Không thể tải danh sách ứng lương.');
        }
      } catch {
        setLoadError('Lỗi kết nối máy chủ khi tải dữ liệu ứng lương.');
      } finally {
        setInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentUser?.role, currentUser?.username, setAdvances],
  );

  useEffect(() => {
    loadAdvances(advances.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live monthly advance quota computed purely from existing store data (zero extra API)
  const advanceQuota = useMemo(() => {
    const maxAdvancePct = Number(serverPayrollConfig?.maxAdvancePercent || 0);
    const myPayroll = payrollData.find((p) => p.username === currentUser?.username);
    const now = new Date();
    const usedThisMonth = visibleAdvances
      .filter((a) => {
        if (a.status === 'Rejected') return false;
        const d = new Date(a.createdAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

    const hasComputedLimit = Boolean(
      maxAdvancePct > 0 && myPayroll && myPayroll.totalBaseSalary > 0,
    );
    const maxAllowed = hasComputedLimit
      ? Math.round((myPayroll!.totalBaseSalary * maxAdvancePct) / 100)
      : 0;
    const remaining = hasComputedLimit ? Math.max(0, maxAllowed - usedThisMonth) : null;

    return {
      maxAdvancePct,
      hasComputedLimit,
      maxAllowed,
      usedThisMonth,
      remaining,
    };
  }, [serverPayrollConfig?.maxAdvancePercent, payrollData, currentUser?.username, visibleAdvances]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const numAmount = parseInt(amount.replace(/\D/g, ''), 10);
    if (!numAmount || numAmount <= 0) {
      setFormError('Vui lòng nhập số tiền ứng hợp lệ.');
      return;
    }
    if (!reason.trim()) {
      setFormError('Vui lòng nhập lý do ứng lương.');
      return;
    }

    if (
      advanceQuota.hasComputedLimit &&
      advanceQuota.usedThisMonth + numAmount > advanceQuota.maxAllowed
    ) {
      setFormError(
        `Vượt hạn mức tối đa (${advanceQuota.maxAdvancePct}% lương tích lũy = ${formatVnd(advanceQuota.maxAllowed)}). Bạn đã đăng ký ${formatVnd(advanceQuota.usedThisMonth)} trong tháng này.`,
      );
      return;
    }

    setSubmitConfirmAmount(numAmount);
  };

  const executeSubmitAdvance = async () => {
    if (!submitConfirmAmount) return;
    setIsSubmitting(true);
    try {
      const apiRes = await callApi('SUBMIT_ADVANCE', {
        username: currentUser?.username,
        fullname: currentUser?.fullname,
        amount: submitConfirmAmount,
        reason: reason.trim(),
      });
      if (apiRes?.ok) {
        setSubmitConfirmAmount(null);
        setAmount('');
        setReason('');
        setFormError('');
        kgToast('Đã gửi yêu cầu ứng lương. Vui lòng chờ Quản lý duyệt.', 'success');
        await loadAdvances(false);
      } else {
        setSubmitConfirmAmount(null);
        setFormError(apiRes?.message || 'Có lỗi xảy ra khi gửi yêu cầu.');
      }
    } catch {
      setSubmitConfirmAmount(null);
      setFormError('Lỗi kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeDecision = async () => {
    if (!pendingDecision || !isManagerView) return;
    const { id, action } = pendingDecision;
    setBusyActionId(id);
    try {
      const apiRes = await callApi('APPROVE_ADVANCE', { advanceId: id, decision: action });
      if (apiRes?.ok) {
        setPendingDecision(null);
        kgToast(
          action === 'APPROVE' ? 'Đã duyệt yêu cầu ứng lương' : 'Đã từ chối yêu cầu ứng lương',
          'success',
        );
        await loadAdvances(false);
      } else {
        kgToast(apiRes?.message || 'Không thể cập nhật trạng thái', 'error');
      }
    } catch {
      kgToast('Lỗi kết nối máy chủ. Vui lòng thử lại.', 'error');
    } finally {
      setBusyActionId(null);
    }
  };

  const counts = useMemo(
    () => ({
      all: visibleAdvances.length,
      pending: visibleAdvances.filter((a) => a.status === 'Pending').length,
      approved: visibleAdvances.filter((a) => a.status === 'Approved').length,
      rejected: visibleAdvances.filter((a) => a.status === 'Rejected').length,
    }),
    [visibleAdvances],
  );

  const filteredAdvances = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return visibleAdvances.filter((adv) => {
      if (statusFilter !== 'ALL' && adv.status !== statusFilter) return false;
      if (q) {
        const matchName = (adv.fullname || '').toLowerCase().includes(q);
        const matchUser = (adv.username || '').toLowerCase().includes(q);
        const matchReason = (adv.reason || '').toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchReason) return false;
      }
      return true;
    });
  }, [visibleAdvances, statusFilter, searchTerm]);

  const historyCard = (
    <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--kg-border)] pb-3">
        <h3 className="font-black flex items-center text-[var(--kg-text)] text-sm sm:text-base">
          <History size={16} className="mr-2 text-[var(--kg-primary)]" />
          {isManagerView ? 'Danh sách yêu cầu ứng lương toàn quán' : 'Lịch sử ứng lương của bạn'}
        </h3>
        <button
          type="button"
          onClick={() => loadAdvances(false)}
          disabled={isRefreshing || initialLoading}
          aria-label="Làm mới danh sách ứng lương"
          className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors touch-manipulation"
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search & Status Filters */}
      <div className="space-y-2.5">
        {isManagerView && (
          <KgInput
            aria-label="Tìm theo nhân viên hoặc lý do"
            placeholder="Tìm nhân viên hoặc lý do..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={Search}
            rightAdornment={
              searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
                >
                  <X size={15} />
                </button>
              ) : null
            }
          />
        )}

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {(
            [
              { id: 'ALL', label: `Tất cả (${counts.all})` },
              { id: 'Pending', label: `Chờ duyệt (${counts.pending})` },
              { id: 'Approved', label: `Đã duyệt (${counts.approved})` },
              { id: 'Rejected', label: `Từ chối (${counts.rejected})` },
            ] as { id: AdvanceFilterStatus; label: string }[]
          ).map((pill) => {
            const active = statusFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id)}
                className={`shrink-0 whitespace-nowrap min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-full text-xs font-bold border transition-colors touch-manipulation ${
                  active
                    ? 'bg-[var(--kg-primary)] text-white border-[var(--kg-primary)]'
                    : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {loadError ? (
        <KgErrorState
          title="Không thể tải dữ liệu ứng lương"
          description={loadError}
          onRetry={() => loadAdvances(false)}
        />
      ) : initialLoading ? (
        <div className="space-y-2.5">
          <KgSkeleton className="h-16 w-full" />
          <KgSkeleton className="h-16 w-full" />
          <KgSkeleton className="h-16 w-full" />
        </div>
      ) : filteredAdvances.length === 0 ? (
        <KgEmptyState
          icon={BadgeDollarSign}
          title={visibleAdvances.length === 0 ? 'Chưa có dữ liệu ứng lương' : 'Không có bản ghi khớp bộ lọc'}
          description={
            visibleAdvances.length === 0
              ? 'Các đề xuất tạm ứng lương sẽ hiển thị tại đây.'
              : 'Thử chọn trạng thái khác hoặc xóa từ khóa tìm kiếm.'
          }
          action={
            visibleAdvances.length > 0 ? (
              <KgButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  setStatusFilter('ALL');
                  setSearchTerm('');
                }}
              >
                Xóa bộ lọc
              </KgButton>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop Sticky-Header Table (>= lg so 768px iPad portrait uses clean 2-col cards) */}
          <div className="hidden lg:block overflow-auto max-h-[520px] rounded-xl border border-[var(--kg-border)]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] text-[11px] uppercase tracking-wider text-[var(--kg-text-muted)]">
                <tr>
                  {isManagerView && <th className="py-3 px-3.5 font-bold">Nhân viên</th>}
                  <th className="py-3 px-3.5 font-bold">Thời gian</th>
                  <th className="py-3 px-3 font-bold text-right">Số tiền</th>
                  <th className="py-3 px-3 font-bold">Lý do</th>
                  <th className="py-3 px-3 font-bold">Trạng thái</th>
                  {isManagerView && <th className="py-3 px-3.5 font-bold text-right">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--kg-border)] bg-[var(--kg-surface)]">
                {filteredAdvances.map((adv) => {
                  const isPending = adv.status === 'Pending';
                  const isApproved = adv.status === 'Approved';
                  const isBusy = busyActionId === adv.id;
                  return (
                    <tr key={adv.id} className="hover:bg-[var(--kg-surface-soft)]/60 transition-colors">
                      {isManagerView && (
                        <td className="py-3 px-3.5">
                          <p className="font-bold text-sm text-[var(--kg-text)]">{adv.fullname}</p>
                          <p className="text-[11px] font-mono text-[var(--kg-text-muted)]">@{adv.username}</p>
                        </td>
                      )}
                      <td className="py-3 px-3.5 font-mono tabular-nums text-[var(--kg-text-muted)] whitespace-nowrap">
                        {new Date(adv.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-black text-sm text-[var(--kg-text)] whitespace-nowrap">
                        {formatVnd(adv.amount)}
                      </td>
                      <td className="py-3 px-3 max-w-xs text-[var(--kg-text)]">{adv.reason}</td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <KgStatusBadge variant={isPending ? 'warning' : isApproved ? 'success' : 'error'}>
                          {isPending ? <Clock size={12} /> : isApproved ? <CheckCheck size={12} /> : <XCircle size={12} />}
                          {isPending ? 'Chờ duyệt' : isApproved ? 'Đã duyệt' : 'Từ chối'}
                        </KgStatusBadge>
                      </td>
                      {isManagerView && (
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          {isPending ? (
                            <div className="inline-flex items-center gap-1.5">
                              <KgButton
                                size="sm"
                                variant="primary"
                                loading={isBusy}
                                disabled={Boolean(busyActionId)}
                                onClick={() =>
                                  setPendingDecision({
                                    id: adv.id,
                                    fullname: adv.fullname,
                                    amount: adv.amount,
                                    action: 'APPROVE',
                                  })
                                }
                              >
                                Duyệt
                              </KgButton>
                              <KgButton
                                size="sm"
                                variant="danger"
                                disabled={Boolean(busyActionId)}
                                onClick={() =>
                                  setPendingDecision({
                                    id: adv.id,
                                    fullname: adv.fullname,
                                    amount: adv.amount,
                                    action: 'REJECT',
                                  })
                                }
                              >
                                Từ chối
                              </KgButton>
                            </div>
                          ) : (
                            <span className="text-[var(--kg-text-soft)]">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile & Tablet Card List (< lg) */}
          <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
            {filteredAdvances.map((adv) => {
              const isPending = adv.status === 'Pending';
              const isApproved = adv.status === 'Approved';
              const isBusy = busyActionId === adv.id;
              return (
                <div
                  key={adv.id}
                  className={`p-3.5 rounded-2xl border flex flex-col justify-between ${
                    isPending
                      ? 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/30'
                      : isApproved
                        ? 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/25'
                        : 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/25'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        {isManagerView && (
                          <p className="font-black text-[var(--kg-text)] text-sm truncate">{adv.fullname}</p>
                        )}
                        <p className="font-mono font-black text-base text-[var(--kg-text)] tabular-nums whitespace-nowrap">
                          {formatVnd(adv.amount)}
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] mt-0.5">
                          {new Date(adv.createdAt).toLocaleString('vi-VN')}
                        </p>
                      </div>
                      <KgStatusBadge
                        variant={isPending ? 'warning' : isApproved ? 'success' : 'error'}
                        className="shrink-0"
                      >
                        {isPending ? <Clock size={12} /> : isApproved ? <CheckCheck size={12} /> : <XCircle size={12} />}
                        {isPending ? 'Chờ duyệt' : isApproved ? 'Đã duyệt' : 'Từ chối'}
                      </KgStatusBadge>
                    </div>
                    <p className="text-xs text-[var(--kg-text)] bg-[var(--kg-surface)] border border-[var(--kg-border)] p-2.5 rounded-xl font-medium break-words">
                      <span className="font-bold text-[var(--kg-text-muted)] mr-1">Lý do:</span> {adv.reason}
                    </p>
                  </div>

                  {isManagerView && isPending && (
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[var(--kg-border)]">
                      <KgButton
                        type="button"
                        variant="primary"
                        size="md"
                        loading={isBusy}
                        disabled={Boolean(busyActionId)}
                        onClick={() =>
                          setPendingDecision({
                            id: adv.id,
                            fullname: adv.fullname,
                            amount: adv.amount,
                            action: 'APPROVE',
                          })
                        }
                        className="w-full"
                      >
                        Chấp thuận
                      </KgButton>
                      <KgButton
                        type="button"
                        variant="danger"
                        size="md"
                        disabled={Boolean(busyActionId)}
                        onClick={() =>
                          setPendingDecision({
                            id: adv.id,
                            fullname: adv.fullname,
                            amount: adv.amount,
                            action: 'REJECT',
                          })
                        }
                        className="w-full"
                      >
                        Từ chối
                      </KgButton>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="p-4 space-y-5 animate-fade-in pb-16 max-w-[1440px] mx-auto w-full">
      <KgModuleHero
        moduleId="advance"
        title="Tạm Ứng Lương"
        description="Quản lý và đăng ký đề xuất tạm ứng lương hàng tháng an toàn, minh bạch."
        eyebrow="Tài chính"
        features={['Hạn mức tự động', 'Duyệt nhanh trực tuyến', 'Khấu trừ tự động']}
      />

      {!isManagerView ? (
        /* Desktop 2-Column Layout (4/8 Split: Request Form Left | History Right) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-4 lg:sticky lg:top-[128px] bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs space-y-4"
          >
            <h3 className="font-black flex items-center text-[var(--kg-text)] pb-3 border-b border-[var(--kg-border)] text-sm sm:text-base">
              <Send size={16} className="mr-2 text-emerald-600 dark:text-emerald-400 shrink-0" /> Tạo đề xuất ứng lương mới
            </h3>

            {/* Live Remaining Monthly Quota Pill */}
            <div
              className={`rounded-xl border px-3.5 py-2.5 space-y-1 ${
                advanceQuota.hasComputedLimit && advanceQuota.remaining === 0
                  ? 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/30'
                  : 'bg-[var(--kg-primary-soft)] border-[var(--kg-primary)]/20'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--kg-text-muted)]">
                  <Wallet size={13} className="text-[var(--kg-primary-ink)] flex-shrink-0" />
                  Hạn mức ứng còn lại tháng này
                </span>
                <span
                  className={`font-mono tabular-nums text-xs sm:text-sm font-black text-right ml-auto whitespace-nowrap ${
                    advanceQuota.hasComputedLimit && advanceQuota.remaining === 0
                      ? 'text-[var(--kg-warning)]'
                      : 'text-[var(--kg-primary-ink)]'
                  }`}
                >
                  {advanceQuota.remaining !== null
                    ? formatVnd(advanceQuota.remaining)
                    : advanceQuota.maxAdvancePct > 0
                      ? `Tối đa ${advanceQuota.maxAdvancePct}% lương`
                      : 'Theo duyệt Quản lý'}
                </span>
              </div>
              <p className="text-[11px] text-[var(--kg-text-muted)] font-mono tabular-nums leading-snug">
                {advanceQuota.hasComputedLimit
                  ? `Tối đa ${advanceQuota.maxAdvancePct}% (${formatVnd(advanceQuota.maxAllowed)}) · Đã ứng ${formatVnd(advanceQuota.usedThisMonth)}`
                  : `Đã đăng ký trong tháng: ${formatVnd(advanceQuota.usedThisMonth)}`}
              </p>
            </div>

            <div className="space-y-3.5">
              <div>
                <label htmlFor="advance-amount" className="block text-xs font-black text-[var(--kg-text)] mb-1">
                  Số tiền muốn ứng (VNĐ)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--kg-text-muted)] font-mono font-bold text-xs">
                    VNĐ
                  </div>
                  <input
                    id="advance-amount"
                    type="text"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => {
                      setAmount(formatMoneyInput(e.target.value));
                      if (formError) setFormError('');
                    }}
                    placeholder="Ví dụ: 500.000"
                    className="w-full min-h-[44px] pl-14 pr-4 py-3 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] focus:ring-2 focus:ring-[var(--kg-primary)] font-mono tabular-nums text-right font-black text-emerald-600 dark:text-emerald-400 text-base sm:text-lg transition-all outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="advance-reason" className="block text-xs font-black text-[var(--kg-text)] mb-1">
                  Lý do xin ứng
                </label>
                <textarea
                  id="advance-reason"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (formError) setFormError('');
                  }}
                  placeholder="Nhập lý do cụ thể (Chi phí sinh hoạt đột xuất, việc gia đình...)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] transition-all outline-none min-h-[90px] text-xs sm:text-sm"
                />
              </div>

              {formError && (
                <p className="text-xs font-semibold text-[var(--kg-danger)] bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 rounded-xl px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="flex justify-end lg:block">
                <KgButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={isSubmitting}
                  icon={Send}
                  className="w-full sm:w-auto sm:min-w-[240px] lg:w-full uppercase tracking-wider text-xs sm:text-sm"
                >
                  Gửi yêu cầu ứng lương
                </KgButton>
              </div>
            </div>
          </form>

          <div className="lg:col-span-8 min-w-0">{historyCard}</div>
        </div>
      ) : (
        historyCard
      )}

      {/* Submit Confirmation Sheet */}
      <KgConfirmSheet
        isOpen={Boolean(submitConfirmAmount)}
        onClose={() => {
          if (!isSubmitting) setSubmitConfirmAmount(null);
        }}
        onConfirm={executeSubmitAdvance}
        loading={isSubmitting}
        title="Xác nhận đề xuất ứng lương?"
        message={
          submitConfirmAmount
            ? `Bạn muốn gửi yêu cầu tạm ứng ${formatVnd(submitConfirmAmount)}?`
            : ''
        }
        confirmLabel="Gửi yêu cầu"
        cancelLabel="Hủy"
        variant="primary"
      />

      {/* Manager Approve/Reject Sheet */}
      <KgConfirmSheet
        isOpen={Boolean(pendingDecision)}
        onClose={() => {
          if (!busyActionId) setPendingDecision(null);
        }}
        onConfirm={executeDecision}
        loading={Boolean(busyActionId)}
        title={
          pendingDecision?.action === 'APPROVE'
            ? 'Duyệt yêu cầu ứng lương?'
            : 'Từ chối yêu cầu ứng lương?'
        }
        message={
          pendingDecision
            ? pendingDecision.action === 'APPROVE'
              ? `Duyệt khoản ứng ${formatVnd(pendingDecision.amount)} cho ${pendingDecision.fullname}. Số tiền này sẽ được khấu trừ vào bảng lương tháng.`
              : `Từ chối yêu cầu ứng ${formatVnd(pendingDecision.amount)} của ${pendingDecision.fullname}.`
            : ''
        }
        confirmLabel={pendingDecision?.action === 'APPROVE' ? 'Duyệt yêu cầu' : 'Từ chối'}
        cancelLabel="Hủy"
        variant={pendingDecision?.action === 'APPROVE' ? 'primary' : 'danger'}
      />
    </div>
  );
}
