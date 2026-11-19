import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Check,
  CircleDollarSign,
  Copy,
  HandCoins,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { callApi } from '../services/api';
import { useAppStore, type User } from '../store/useAppStore';
import { kgToast } from '../store/useFeedbackStore';
import type { MonthlySalaryItem, SalaryAdjustmentRequest, SalaryPayType } from '../types/salary';
import {
  currentSalaryMonth,
  salaryMonthLabel,
  salaryTypeLabel,
} from '../types/salary';
import { isWorkEligible } from '../utils/employment';
import { formatVnd } from '../utils/formatCurrency';
import { isAdminUser } from '../utils/permissions';
import {
  KgBottomSheet,
  KgButton,
  KgConfirmSheet,
  KgEmptyState,
  KgErrorState,
  KgInput,
  KgSkeleton,
  KgStatusBadge,
} from './KgDesignSystem';

export interface MonthlySalaryManagerProps {
  currentUser?: User;
  users?: User[];
}

type AdjustmentFilterStatus = 'Pending' | 'All';

const DEFAULT_BASE_FORMULA = '(HOURS * RATE) + BONUS - PENALTY + ALLOWANCE';
const DEFAULT_ALLOWANCES = [
  { id: 'meal', name: 'Tiền ăn ca', description: 'Ca làm > 4 tiếng', amount: 30000 },
  { id: 'parking', name: 'Gửi xe', description: 'Theo ngày làm việc', amount: 10000 },
];
const DEFAULT_DEDUCTIONS = [
  { id: 'late', name: 'Đi trễ', description: 'Trừ 10,000đ / 15 phút', amount: 10000 },
];

const newSalaryItem = (user: User): MonthlySalaryItem => ({
  username: user.username,
  fullname: user.fullname,
  payType: 'hourly',
  amount: 25000,
  standardDays: 30,
});

export default function MonthlySalaryManager({
  currentUser: propCurrentUser,
  users: propUsers,
}: MonthlySalaryManagerProps = {}) {
  const storeCurrentUser = useAppStore((s) => s.currentUser);
  const storeUsers = useAppStore((s) => s.users);
  const serverPayrollConfig = useAppStore((s) => s.serverPayrollConfig);
  const setServerPayrollConfig = useAppStore((s) => s.setServerPayrollConfig);

  const currentUser = propCurrentUser ?? storeCurrentUser;
  const users = propUsers ?? storeUsers;
  const isAdmin = isAdminUser(currentUser);

  const [month, setMonth] = useState(currentSalaryMonth);
  const [items, setItems] = useState<MonthlySalaryItem[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [copySource, setCopySource] = useState('');
  const [requests, setRequests] = useState<SalaryAdjustmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Search & filter state
  const [staffSearch, setStaffSearch] = useState('');
  const [requestSearch, setRequestSearch] = useState('');
  const [requestFilter, setRequestFilter] = useState<AdjustmentFilterStatus>('Pending');

  // Inline Advance Limit (%) config state
  const [advanceLimit, setAdvanceLimit] = useState(() =>
    serverPayrollConfig?.maxAdvancePercent !== undefined
      ? String(serverPayrollConfig.maxAdvancePercent)
      : '50',
  );
  const [savingAdvanceLimit, setSavingAdvanceLimit] = useState(false);

  // Sheet states
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{
    request: SalaryAdjustmentRequest;
    status: 'Approved' | 'Rejected';
  } | null>(null);
  const [reviewReply, setReviewReply] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  useEffect(() => {
    if (serverPayrollConfig?.maxAdvancePercent !== undefined) {
      setAdvanceLimit(String(serverPayrollConfig.maxAdvancePercent));
    }
  }, [serverPayrollConfig?.maxAdvancePercent]);

  const employeeUsers = useMemo(
    () => users.filter((user) => user.role !== 'admin' && user.username && isWorkEligible(user)),
    [users],
  );

  const loadData = useCallback(async () => {
    if (!currentUser || !isAdmin) return;
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
  }, [currentUser, isAdmin, month]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setTimeout(loadData, 0);
    return () => window.clearTimeout(timer);
  }, [isAdmin, loadData]);

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
      kgToast('Tất cả nhân viên đã có trong bảng khai báo tháng này.', 'info');
      return;
    }
    setItems((current) => [...current, ...missing.map(newSalaryItem)]);
    setDirty(true);
    kgToast(`Đã thêm ${missing.length} nhân viên vào bảng khai báo`, 'success');
  };

  const removeItem = (username: string) => {
    setItems((current) => current.filter((item) => item.username !== username));
    setDirty(true);
  };

  const save = async () => {
    if (!currentUser || !isAdmin) return;
    const invalid = items.find((item) => !item.amount || item.amount < 0);
    if (invalid) {
      kgToast(`Mức lương của ${invalid.fullname} chưa hợp lệ.`, 'warning');
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
        kgToast(res?.message || 'Máy chủ chưa phản hồi, không thể lưu.', 'error');
        return;
      }
      setItems(res.data.config.items || []);
      setAvailableMonths((current) => Array.from(new Set([month, ...current])).sort().reverse());
      setDirty(false);
      kgToast(`Đã lưu bảng lương ${salaryMonthLabel(month)}`, 'success');
    } catch {
      kgToast('Lỗi kết nối khi lưu bảng lương.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAdvanceLimit = async () => {
    if (!currentUser || !isAdmin) return;
    const numericLimit = Number(advanceLimit);
    if (!Number.isFinite(numericLimit) || numericLimit < 0 || numericLimit > 100) {
      kgToast('Tỷ lệ ứng lương tối đa phải nằm trong khoảng 0% đến 100%.', 'warning');
      return;
    }

    const baseFormula = serverPayrollConfig?.baseFormula || DEFAULT_BASE_FORMULA;
    const allowances = serverPayrollConfig?.allowances || DEFAULT_ALLOWANCES;
    const deductions = serverPayrollConfig?.deductions || DEFAULT_DEDUCTIONS;
    const preservedMealAllowance =
      serverPayrollConfig?.mealAllowance ??
      allowances.find((a) => a.id === 'meal')?.amount ??
      30000;

    setSavingAdvanceLimit(true);
    try {
      const res = await callApi('UPDATE_PAYROLL_CONFIG', {
        role: currentUser.role,
        baseFormula,
        maxAdvancePercent: numericLimit,
        mealAllowance: String(preservedMealAllowance),
        allowances,
        deductions,
      });
      if (res?.ok) {
        const nextPayrollConfig = {
          baseFormula,
          maxAdvancePercent: numericLimit,
          mealAllowance: Number(preservedMealAllowance),
          allowances,
          deductions,
        };
        setServerPayrollConfig(nextPayrollConfig);
        kgToast(`Đã lưu hạn mức ứng tối đa ${numericLimit}%`, 'success');
      } else {
        kgToast(res?.message || 'Không thể lưu hạn mức ứng lương.', 'error');
      }
    } catch {
      kgToast('Lỗi kết nối khi lưu hạn mức ứng lương.', 'error');
    } finally {
      setSavingAdvanceLimit(false);
    }
  };

  const executeCopyMonth = async () => {
    if (!currentUser || !isAdmin || !copySource) return;
    setSaving(true);
    try {
      const res = await callApi('COPY_MONTHLY_SALARY_CONFIG', {
        role: currentUser.role,
        username: currentUser.username,
        sourceMonth: copySource,
        targetMonth: month,
      });
      if (!res?.ok) {
        kgToast(res?.message || 'Không thể sao chép bảng lương.', 'error');
        return;
      }
      setItems(res.data.config.items || []);
      setAvailableMonths((current) => Array.from(new Set([month, ...current])).sort().reverse());
      setDirty(false);
      setCopyConfirmOpen(false);
      kgToast(res.data.message || 'Bảng lương đã sao chép thành công.', 'success');
    } catch {
      kgToast('Lỗi kết nối khi sao chép bảng lương.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const executeReviewRequest = async () => {
    if (!currentUser || !isAdmin || !reviewTarget) return;
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
        kgToast(res?.message || 'Không thể xử lý đề nghị điều chỉnh.', 'error');
        return;
      }
      setReviewTarget(null);
      setReviewReply('');
      await loadData();
      kgToast(
        reviewTarget.status === 'Approved' ? 'Đã duyệt và cập nhật mức lương' : 'Đã gửi phản hồi từ chối',
        'success',
      );
    } catch {
      kgToast('Lỗi kết nối khi xử lý đề nghị.', 'error');
    } finally {
      setReviewBusy(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.fullname.toLowerCase().includes(q) || item.username.toLowerCase().includes(q),
    );
  }, [items, staffSearch]);

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'Pending'),
    [requests],
  );

  const filteredRequests = useMemo(() => {
    const q = requestSearch.trim().toLowerCase();
    return requests.filter((req) => {
      if (requestFilter === 'Pending' && req.status !== 'Pending') return false;
      if (q) {
        const matchName = (req.fullname || '').toLowerCase().includes(q);
        const matchUser = (req.username || '').toLowerCase().includes(q);
        const matchReason = (req.reason || '').toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchReason) return false;
      }
      return true;
    });
  }, [requests, requestFilter, requestSearch]);

  if (!currentUser || !isAdmin) return null;

  const advanceLimitChanged =
    String(serverPayrollConfig?.maxAdvancePercent ?? 50) !== String(advanceLimit).trim();

  return (
    <section className={`space-y-4 ${dirty ? 'pb-24' : 'pb-8'}`}>
      {/* Compact Inline Advance Limit (%) Config Card */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] flex items-center justify-center flex-shrink-0">
              <HandCoins size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-[var(--kg-text)]">Hạn mức ứng lương (%)</h3>
              <p className="text-xs text-[var(--kg-text-muted)] mt-0.5 leading-snug">
                Giới hạn tối đa nhân viên được tạm ứng theo % lương tích lũy thực tế trong tháng.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative w-28">
              <input
                id="payroll-advance-limit"
                type="number"
                min={0}
                max={100}
                aria-label="Hạn mức ứng lương tối đa (%)"
                value={advanceLimit}
                onChange={(e) => setAdvanceLimit(e.target.value)}
                className="w-full min-h-[44px] sm:min-h-[40px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] pl-3 pr-8 py-1.5 text-right text-sm font-mono tabular-nums font-black text-[var(--kg-text)] outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[var(--kg-text-muted)] pointer-events-none">
                %
              </span>
            </div>
            <KgButton
              type="button"
              variant={advanceLimitChanged ? 'primary' : 'secondary'}
              size="sm"
              loading={savingAdvanceLimit}
              disabled={savingAdvanceLimit}
              icon={Save}
              onClick={handleSaveAdvanceLimit}
            >
              Lưu hạn mức
            </KgButton>
          </div>
        </div>
      </div>

      {/* Monthly Salary Rates Card */}
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
                {filteredItems.length}
                {staffSearch.trim() ? `/${items.length}` : ''}{' '}
                <span className="font-sans">nhân viên</span>
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

          {items.length > 0 && (
            <KgInput
              aria-label="Tìm nhân viên trong bảng đơn giá"
              placeholder="Tìm nhân viên theo tên hoặc @username..."
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              icon={Search}
              rightAdornment={
                staffSearch ? (
                  <button
                    type="button"
                    onClick={() => setStaffSearch('')}
                    aria-label="Xóa từ khóa tìm nhân viên"
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
                  >
                    <X size={15} />
                  </button>
                ) : null
              }
            />
          )}

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
          ) : !filteredItems.length ? (
            <KgEmptyState
              icon={Search}
              title="Không tìm thấy nhân viên phù hợp"
              description="Thử nhập từ khóa khác hoặc xóa bộ lọc tìm kiếm."
              action={{ label: 'Xóa tìm kiếm', onClick: () => setStaffSearch('') }}
            />
          ) : (
            <>
              {/* Desktop Sticky-Header Table (>= lg) */}
              <div className="hidden lg:block overflow-auto max-h-[540px] rounded-xl border border-[var(--kg-border)]">
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
                    {filteredItems.map((item) => (
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

              {/* Mobile & Tablet Portrait Card View (< lg) */}
              <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {filteredItems.map((item) => (
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

      {/* Adjustment Requests Panel with Staff Search & Pending/All Filter */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
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

        {/* Search & Pending/All Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
          <div className="flex-1 min-w-0">
            <KgInput
              aria-label="Tìm đề nghị theo nhân viên hoặc lý do"
              placeholder="Tìm nhân viên, @username hoặc lý do..."
              value={requestSearch}
              onChange={(e) => setRequestSearch(e.target.value)}
              icon={Search}
              rightAdornment={
                requestSearch ? (
                  <button
                    type="button"
                    onClick={() => setRequestSearch('')}
                    aria-label="Xóa từ khóa tìm đề nghị"
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
                  >
                    <X size={15} />
                  </button>
                ) : null
              }
            />
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {(
              [
                { id: 'Pending', label: `Chờ duyệt (${pendingRequests.length})` },
                { id: 'All', label: `Tất cả (${requests.length})` },
              ] as { id: AdjustmentFilterStatus; label: string }[]
            ).map((pill) => {
              const active = requestFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setRequestFilter(pill.id)}
                  className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors touch-manipulation ${
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

        <div className="space-y-3">
          {filteredRequests.map((request) => (
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
          {!filteredRequests.length && (
            <div className="flex flex-col items-center justify-center py-9 text-center text-[var(--kg-text-muted)]">
              <BadgeCheck size={28} />
              <p className="mt-2 text-sm font-bold">
                {requests.length === 0
                  ? 'Chưa có đề nghị điều chỉnh'
                  : requestFilter === 'Pending' && !requestSearch.trim()
                    ? 'Không còn đề nghị nào đang chờ duyệt'
                    : 'Không tìm thấy đề nghị phù hợp'}
              </p>
              <p className="mt-1 text-xs">
                {requests.length === 0
                  ? 'Các đề nghị từ nhân viên sẽ xuất hiện tại đây.'
                  : 'Bạn có thể chuyển sang xem Tất cả hoặc xóa từ khóa tìm kiếm.'}
              </p>
              {requests.length > 0 && (requestFilter !== 'All' || requestSearch.trim()) && (
                <KgButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => {
                    setRequestFilter('All');
                    setRequestSearch('');
                  }}
                >
                  Xem tất cả ({requests.length})
                </KgButton>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Save Bar when dirty === true */}
      {dirty && (
        <div
          role="region"
          aria-label="Thanh lưu thay đổi bảng lương"
          className="sticky bottom-[76px] md:bottom-4 z-30 rounded-2xl border border-[var(--kg-primary)]/35 bg-[var(--kg-surface)] px-4 py-3 shadow-lg flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            <KgStatusBadge variant="warning">Chưa lưu</KgStatusBadge>
            <span className="text-xs sm:text-sm font-bold text-[var(--kg-text)] truncate">
              Bảng đơn giá {salaryMonthLabel(month)} có thay đổi mới
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <KgButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving || loading}
              onClick={loadData}
            >
              Hoàn tác
            </KgButton>
            <KgButton
              type="button"
              variant="primary"
              size="sm"
              loading={saving}
              disabled={saving || loading || !items.length}
              icon={Save}
              onClick={save}
            >
              {saving ? 'Đang lưu...' : 'Lưu bảng lương'}
            </KgButton>
          </div>
        </div>
      )}

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
    </section>
  );
}
