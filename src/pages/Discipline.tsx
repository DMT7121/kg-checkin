import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  KgBottomSheet,
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
import { isWorkEligible } from '../utils/employment';
import { formatMoneyInput, formatVnd } from '../utils/formatCurrency';
import { isAdminUser } from '../utils/permissions';

type DisciplineFilterType = 'ALL' | 'BONUS' | 'PENALTY';

export default function Discipline({ mode = 'user' }: { mode?: 'user' | 'admin' }) {
  const currentUser = useAppStore((s) => s.currentUser);
  const bonusPenalties = useAppStore((s) => s.bonusPenalties);
  const users = useAppStore((s) => s.users);
  const setBonusPenalties = useAppStore((s) => s.setBonusPenalties);
  const isManagerView = mode === 'admin' && isAdminUser(currentUser);

  const [type, setType] = useState<'BONUS' | 'PENALTY'>('BONUS');
  const [targetUsername, setTargetUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const [mobileCreateOpen, setMobileCreateOpen] = useState(false);

  const [initialLoading, setInitialLoading] = useState(() => bonusPenalties.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<DisciplineFilterType>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const [pendingSubmit, setPendingSubmit] = useState<{
    targetUsername: string;
    targetFullname: string;
    amount: number;
  } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Exclude admin and non-active (leave/resigned/suspended) staff from selector
  const eligibleStaff = useMemo(
    () => users.filter((u) => u.role !== 'admin' && Boolean(u.username) && isWorkEligible(u)),
    [users],
  );

  const loadRecords = useCallback(
    async (isInitial = false) => {
      if (isInitial) setInitialLoading(true);
      else setIsRefreshing(true);
      setLoadError('');
      try {
        const res = await callApi('GET_BONUS_PENALTY', {
          username: currentUser?.username,
          role: currentUser?.role,
        });
        if (res?.ok && Array.isArray(res.data)) {
          setBonusPenalties(res.data);
        } else if (!res?.ok) {
          setLoadError(res?.message || 'Không thể tải lịch sử thưởng phạt.');
        }
      } catch {
        setLoadError('Lỗi kết nối máy chủ khi tải lịch sử thưởng phạt.');
      } finally {
        setInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentUser?.role, currentUser?.username, setBonusPenalties],
  );

  useEffect(() => {
    loadRecords(bonusPenalties.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManagerView) return;
    setFormError('');
    if (!targetUsername) {
      setFormError('Vui lòng chọn nhân viên áp dụng.');
      return;
    }
    const numAmount = parseInt(amount.replace(/\D/g, ''), 10);
    if (!numAmount || numAmount <= 0) {
      setFormError('Vui lòng nhập số tiền hợp lệ.');
      return;
    }
    if (!reason.trim()) {
      setFormError('Vui lòng nhập lý do cụ thể.');
      return;
    }
    const targetUser = eligibleStaff.find((u) => u.username === targetUsername);
    setPendingSubmit({
      targetUsername: targetUser?.username || targetUsername,
      targetFullname: targetUser?.fullname || targetUsername,
      amount: numAmount,
    });
  };

  const executeAddRecord = async () => {
    if (!pendingSubmit || !isManagerView) return;
    setIsSubmitting(true);
    try {
      const apiRes = await callApi('ADD_BONUS_PENALTY', {
        targetUsername: pendingSubmit.targetUsername,
        targetFullname: pendingSubmit.targetFullname,
        type,
        amount: pendingSubmit.amount,
        reason: reason.trim(),
      });
      if (apiRes?.ok) {
        setPendingSubmit(null);
        setMobileCreateOpen(false);
        setAmount('');
        setReason('');
        setFormError('');
        kgToast(apiRes.message || 'Đã ghi nhận bản ghi vào hệ thống', 'success');
        await loadRecords(false);
      } else {
        setPendingSubmit(null);
        setFormError(apiRes?.message || 'Có lỗi xảy ra khi ghi nhận.');
      }
    } catch {
      setPendingSubmit(null);
      setFormError('Lỗi kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeDelete = async () => {
    if (!pendingDeleteId || !isManagerView) return;
    const id = pendingDeleteId;
    setDeletingId(id);
    try {
      const apiRes = await callApi('DELETE_BONUS_PENALTY', { recordId: id });
      if (apiRes?.ok) {
        setPendingDeleteId(null);
        kgToast('Đã xóa bản ghi', 'success');
        await loadRecords(false);
      } else {
        kgToast(apiRes?.message || 'Không thể xóa bản ghi', 'error');
      }
    } catch {
      kgToast('Lỗi kết nối khi xóa bản ghi.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const counts = useMemo(
    () => ({
      all: bonusPenalties.length,
      bonus: bonusPenalties.filter((r) => r.type === 'BONUS').length,
      penalty: bonusPenalties.filter((r) => r.type === 'PENALTY').length,
    }),
    [bonusPenalties],
  );

  const periodSummary = useMemo(() => {
    let totalBonus = 0;
    let totalPenalty = 0;
    for (const rec of bonusPenalties) {
      const amt = Math.round(Number(rec.amount) || 0);
      if (rec.type === 'BONUS') totalBonus += amt;
      else totalPenalty += amt;
    }
    return {
      totalBonus,
      totalPenalty,
      netImpact: totalBonus - totalPenalty,
    };
  }, [bonusPenalties]);

  const filteredRecords = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return bonusPenalties.filter((rec) => {
      if (typeFilter !== 'ALL' && rec.type !== typeFilter) return false;
      if (q) {
        const matchName = (rec.targetFullname || '').toLowerCase().includes(q);
        const matchUser = (rec.targetUsername || '').toLowerCase().includes(q);
        const matchReason = (rec.reason || '').toLowerCase().includes(q);
        if (!matchName && !matchUser && !matchReason) return false;
      }
      return true;
    });
  }, [bonusPenalties, typeFilter, searchTerm]);

  const renderCreateFormFields = () => (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setType('BONUS')}
          className={`flex-1 min-h-[44px] py-2.5 rounded-xl text-xs sm:text-sm font-black border-2 transition-all flex justify-center items-center active:scale-95 touch-manipulation ${
            type === 'BONUS'
              ? 'bg-[var(--kg-success-soft)] border-[var(--kg-success)] text-[var(--kg-success)]'
              : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
          }`}
        >
          <ArrowUpRight size={16} className="mr-1" /> THƯỞNG (+)
        </button>
        <button
          type="button"
          onClick={() => setType('PENALTY')}
          className={`flex-1 min-h-[44px] py-2.5 rounded-xl text-xs sm:text-sm font-black border-2 transition-all flex justify-center items-center active:scale-95 touch-manipulation ${
            type === 'PENALTY'
              ? 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)] text-[var(--kg-danger)]'
              : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
          }`}
        >
          <ArrowDownRight size={16} className="mr-1" /> PHẠT (-)
        </button>
      </div>

      <div>
        <label htmlFor="discipline-target-user" className="block text-xs font-black text-[var(--kg-text)] mb-1">
          Nhân viên áp dụng
        </label>
        <select
          id="discipline-target-user"
          value={targetUsername}
          onChange={(e) => {
            setTargetUsername(e.target.value);
            if (formError) setFormError('');
          }}
          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text)] focus:ring-2 focus:ring-[var(--kg-primary)] outline-none text-xs sm:text-sm font-medium"
        >
          <option value="">-- Chọn nhân viên --</option>
          {eligibleStaff.map((u) => (
            <option key={u.username} value={u.username}>
              {u.fullname}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="discipline-amount" className="block text-xs font-black text-[var(--kg-text)] mb-1">
          Số tiền (VNĐ)
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-[var(--kg-text-muted)] pointer-events-none">
            VNĐ
          </span>
          <input
            id="discipline-amount"
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              setAmount(formatMoneyInput(e.target.value));
              if (formError) setFormError('');
            }}
            placeholder="Ví dụ: 100.000"
            className="w-full min-h-[44px] pl-14 pr-3.5 py-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text)] focus:ring-2 focus:ring-[var(--kg-primary)] font-mono tabular-nums text-right font-black text-base sm:text-lg outline-none"
          />
        </div>
      </div>

      <div>
        <label htmlFor="discipline-reason" className="block text-xs font-black text-[var(--kg-text)] mb-1">
          Lý do cụ thể
        </label>
        <input
          id="discipline-reason"
          type="text"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (formError) setFormError('');
          }}
          placeholder="Nhập lý do khen thưởng / vi phạm..."
          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text)] focus:ring-2 focus:ring-[var(--kg-primary)] outline-none text-xs sm:text-sm"
        />
      </div>

      {formError && (
        <p className="text-xs font-semibold text-[var(--kg-danger)] bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 rounded-xl px-3 py-2">
          {formError}
        </p>
      )}

      <KgButton
        type="submit"
        variant={type === 'BONUS' ? 'primary' : 'danger'}
        size="lg"
        loading={isSubmitting}
        icon={Plus}
        className="w-full uppercase tracking-wider text-xs sm:text-sm"
      >
        Ghi nhận vào hệ thống
      </KgButton>
    </form>
  );

  const historyCard = (
    <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-4 sm:p-5 rounded-2xl shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--kg-border)] pb-3">
        <h3 className="font-black flex items-center text-[var(--kg-text)] text-sm sm:text-base">
          <Search size={18} className="mr-2 text-[var(--kg-primary)]" />
          {isManagerView ? 'Lịch sử khen thưởng / kỷ luật toàn quán' : 'Lịch sử khen thưởng & kỷ luật của bạn'}
        </h3>
        <button
          type="button"
          onClick={() => loadRecords(false)}
          disabled={isRefreshing || initialLoading}
          aria-label="Làm mới lịch sử thưởng phạt"
          className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors touch-manipulation"
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search & Category Filters */}
      <div className="space-y-2.5">
        <KgInput
          aria-label="Tìm theo tên hoặc lý do"
          placeholder={isManagerView ? 'Tìm nhân viên hoặc lý do...' : 'Tìm theo lý do thưởng / phạt...'}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          icon={Search}
          rightAdornment={
            searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] touch-manipulation"
                >
                  <X size={15} />
                </button>
              ) : null
            }
          />

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {(
              [
                { id: 'ALL', label: `Tất cả (${counts.all})` },
                { id: 'BONUS', label: `Khen thưởng (${counts.bonus})` },
                { id: 'PENALTY', label: `Kỷ luật / Phạt (${counts.penalty})` },
              ] as { id: DisciplineFilterType; label: string }[]
            ).map((pill) => {
              const active = typeFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setTypeFilter(pill.id)}
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
          title="Không thể tải dữ liệu thưởng phạt"
          description={loadError}
          onRetry={() => loadRecords(false)}
        />
      ) : initialLoading ? (
        <div className="space-y-2.5">
          <KgSkeleton className="h-16 w-full" />
          <KgSkeleton className="h-16 w-full" />
          <KgSkeleton className="h-16 w-full" />
        </div>
      ) : filteredRecords.length === 0 ? (
        <KgEmptyState
          icon={Award}
          title={bonusPenalties.length === 0 ? 'Chưa có bản ghi nào' : 'Không có bản ghi khớp bộ lọc'}
          description={
            bonusPenalties.length === 0
              ? 'Lịch sử khen thưởng và vi phạm sẽ hiển thị tại đây.'
              : 'Thử chọn loại khác hoặc xóa từ khóa tìm kiếm.'
          }
          action={
            bonusPenalties.length > 0 ? (
              <KgButton
                size="sm"
                variant="secondary"
                onClick={() => {
                  setTypeFilter('ALL');
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
                  <th className="py-3 px-3 font-bold">Loại</th>
                  <th className="py-3 px-3 font-bold text-right">Số tiền</th>
                  <th className="py-3 px-3 font-bold">Lý do</th>
                  {isManagerView && <th className="py-3 px-3.5 font-bold text-right w-16">Xóa</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--kg-border)] bg-[var(--kg-surface)]">
                {filteredRecords.map((record) => {
                  const isBonus = record.type === 'BONUS';
                  return (
                    <tr key={record.id} className="hover:bg-[var(--kg-surface-soft)]/60 transition-colors">
                      {isManagerView && (
                        <td className="py-3 px-3.5">
                          <p className="font-bold text-sm text-[var(--kg-text)]">{record.targetFullname}</p>
                          <p className="text-[11px] font-mono text-[var(--kg-text-muted)]">
                            @{record.targetUsername}
                          </p>
                        </td>
                      )}
                      <td className="py-3 px-3.5 font-mono tabular-nums text-[var(--kg-text-muted)] whitespace-nowrap">
                        {new Date(record.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <KgStatusBadge variant={isBonus ? 'success' : 'error'}>
                          {isBonus ? 'Thưởng' : 'Phạt'}
                        </KgStatusBadge>
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono tabular-nums font-black text-sm whitespace-nowrap ${
                          isBonus ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isBonus ? '+' : '-'}
                        {formatVnd(record.amount)}
                      </td>
                      <td className="py-3 px-3 max-w-md text-[var(--kg-text)]">{record.reason}</td>
                      {isManagerView && (
                        <td className="py-3 px-3.5 text-right">
                          <button
                            type="button"
                            aria-label="Xóa bản ghi"
                            onClick={() => setPendingDeleteId(record.id)}
                            disabled={deletingId === record.id}
                            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[var(--kg-text-muted)] hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
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
            {filteredRecords.map((record) => {
              const isBonus = record.type === 'BONUS';
              return (
                <div
                  key={record.id}
                  className={`p-3.5 rounded-2xl border ${
                    isBonus
                      ? 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/25'
                      : 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/25'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <div className="min-w-0 flex-1">
                      {isManagerView && (
                        <p className="font-black text-[var(--kg-text)] text-sm truncate">{record.targetFullname}</p>
                      )}
                      <p
                        className={`font-mono tabular-nums font-black text-base whitespace-nowrap ${
                          isBonus ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isBonus ? '+' : '-'}
                        {formatVnd(record.amount)}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] mt-0.5">
                        {new Date(record.createdAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    {isManagerView && (
                      <button
                        type="button"
                        aria-label="Xóa bản ghi"
                        onClick={() => setPendingDeleteId(record.id)}
                        disabled={deletingId === record.id}
                        className="min-w-[44px] min-h-[44px] -mr-1 -mt-1 flex items-center justify-center text-[var(--kg-text-muted)] hover:text-rose-600 hover:bg-rose-500/10 rounded-xl transition-all shrink-0 touch-manipulation"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[var(--kg-text)] bg-[var(--kg-surface)] border border-[var(--kg-border)] p-2.5 rounded-xl mt-2 font-medium break-words">
                    <span className="font-bold text-[var(--kg-text-muted)] mr-1">Lý do:</span> {record.reason}
                  </p>
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
        moduleId="discipline"
        title="Vi Phạm & Kỷ Luật"
        description="Theo dõi lịch sử khen thưởng và các chế tài kỷ luật của nhân sự."
        eyebrow="Nội quy"
        features={['Minh bạch thưởng phạt', 'Lưu vết lịch sử', 'Tự động tính lương']}
        actions={
          isManagerView ? (
            <div className="lg:hidden">
              <KgButton
                type="button"
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => {
                  setFormError('');
                  setMobileCreateOpen(true);
                }}
              >
                Ghi nhận Thưởng / Phạt
              </KgButton>
            </div>
          ) : undefined
        }
      />

      {/* Period Bonus vs Penalty Summary Strip (stacks cleanly on 375px so full VNĐ figures never clip) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        <div className="rounded-2xl border border-[var(--kg-success)]/25 bg-[var(--kg-success-soft)] px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between sm:block gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--kg-success)]">
            <ArrowUpRight size={14} className="flex-shrink-0" />
            <span>Tổng thưởng</span>
          </div>
          <p className="sm:mt-1 font-mono tabular-nums font-black text-sm sm:text-base text-[var(--kg-success)] text-right sm:text-left whitespace-nowrap">
            +{formatVnd(periodSummary.totalBonus)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--kg-danger)]/25 bg-[var(--kg-danger-soft)] px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between sm:block gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--kg-danger)]">
            <ArrowDownRight size={14} className="flex-shrink-0" />
            <span>Tổng phạt</span>
          </div>
          <p className="sm:mt-1 font-mono tabular-nums font-black text-sm sm:text-base text-[var(--kg-danger)] text-right sm:text-left whitespace-nowrap">
            -{formatVnd(periodSummary.totalPenalty)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between sm:block gap-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--kg-text-muted)]">
            Chênh lệch kỳ
          </div>
          <p
            className={`sm:mt-1 font-mono tabular-nums font-black text-sm sm:text-base text-right sm:text-left whitespace-nowrap ${
              periodSummary.netImpact >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {periodSummary.netImpact >= 0 ? '+' : '-'}
            {formatVnd(Math.abs(periodSummary.netImpact))}
          </p>
        </div>
      </div>

      {isManagerView ? (
        /* Desktop 4/8 2-Col Split; Mobile collapses form into KgBottomSheet so history is above the fold */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="hidden lg:block lg:col-span-4 lg:sticky lg:top-[128px] bg-[var(--kg-surface)] border border-[var(--kg-border)] p-5 rounded-2xl shadow-xs space-y-4">
            <h3 className="font-black flex items-center text-[var(--kg-text)] pb-3 border-b border-[var(--kg-border)] text-base">
              <Plus size={18} className="mr-2 text-[var(--kg-primary)]" /> Thêm bản ghi thưởng / phạt
            </h3>
            {!mobileCreateOpen && renderCreateFormFields()}
          </div>

          <div className="lg:col-span-8 min-w-0">{historyCard}</div>
        </div>
      ) : (
        historyCard
      )}

      {/* Mobile Manager Create Drawer (< lg) */}
      {isManagerView && (
        <KgBottomSheet
          isOpen={mobileCreateOpen}
          onClose={() => {
            if (!isSubmitting) setMobileCreateOpen(false);
          }}
          title="Ghi nhận Thưởng / Phạt"
          subtitle="Bản ghi sẽ được cộng/trừ tự động vào bảng lương tháng"
        >
          {mobileCreateOpen && renderCreateFormFields()}
        </KgBottomSheet>
      )}

      {/* Add Confirmation Sheet */}
      <KgConfirmSheet
        isOpen={Boolean(pendingSubmit)}
        onClose={() => {
          if (!isSubmitting) setPendingSubmit(null);
        }}
        onConfirm={executeAddRecord}
        loading={isSubmitting}
        title="Xác nhận ghi nhận?"
        message={
          pendingSubmit
            ? `Bạn muốn thêm khoản ${type === 'BONUS' ? 'THƯỞNG' : 'PHẠT'} ${formatVnd(pendingSubmit.amount)} cho ${pendingSubmit.targetFullname}?`
            : ''
        }
        confirmLabel="Đồng ý"
        cancelLabel="Hủy"
        variant={type === 'BONUS' ? 'primary' : 'danger'}
      />

      {/* Delete Confirmation Sheet */}
      <KgConfirmSheet
        isOpen={Boolean(pendingDeleteId)}
        onClose={() => {
          if (!deletingId) setPendingDeleteId(null);
        }}
        onConfirm={executeDelete}
        loading={Boolean(deletingId)}
        title="Xóa bản ghi thưởng / phạt?"
        message="Bản ghi này sẽ bị xóa khỏi lịch sử và không còn tính vào bảng lương."
        confirmLabel="Xóa bản ghi"
        cancelLabel="Hủy"
        variant="danger"
      />
    </div>
  );
}
