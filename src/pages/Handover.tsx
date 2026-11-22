import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import {
  AlertTriangle,
  FileText,
  Banknote,
  ShieldAlert,
  CheckCircle2,
  History,
  RefreshCw,
  CheckCheck,
  RotateCcw,
  ShieldCheck,
  Calculator,
  ChevronDown,
  Coins,
} from 'lucide-react';
import {
  KgButton,
  KgEmptyState,
  KgErrorState,
  KgModuleHero,
  KgStatusBadge,
} from '../components/KgDesignSystem';
import { kgToast, type FeedbackTone } from '../store/useFeedbackStore';
import { formatVnd as formatVndBase } from '../utils/formatCurrency';
import { navigateToHubSubTab } from '../utils/hubNavigation';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import { isWorkEligible } from '../utils/employment';
import {
  calculateCashReconciliation,
  formatSignedVnd,
  formatVndInput,
  parseVndAmount,
  type HandoverLedgerRecord,
} from '../utils/operationsReconciliation';

const LOCAL_HANDOVER_META_KEY = 'kg_handover_meta_v2';
const LOCAL_ACK_MAP_KEY = 'kg_ack_handovers_v2';

const CASH_DENOMINATIONS = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000] as const;

const formatVnd = (amount: number | undefined | null) =>
  formatVndBase(Number(amount) || 0);

function readLocalHandoverMeta(): Record<string, Partial<HandoverLedgerRecord>> {
  try {
    const raw = localStorage.getItem(LOCAL_HANDOVER_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalHandoverMeta(meta: Record<string, Partial<HandoverLedgerRecord>>) {
  try {
    localStorage.setItem(LOCAL_HANDOVER_META_KEY, JSON.stringify(meta));
  } catch {
    // Ignore storage quota errors
  }
}

function readAckMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LOCAL_ACK_MAP_KEY);
    const map: Record<string, boolean> = raw ? JSON.parse(raw) : {};
    const legacyId = localStorage.getItem('kg_ack_handover_id');
    if (legacyId && !map[legacyId]) {
      map[legacyId] = true;
    }
    return map;
  } catch {
    return {};
  }
}

function writeAckMap(map: Record<string, boolean>) {
  try {
    localStorage.setItem(LOCAL_ACK_MAP_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export default function Handover() {
  const currentUser = useAppStore((state) => state.currentUser);
  const shiftName = useAppStore((state) => state.shiftName);
  const setUpdating = useAppStore((state) => state.setUpdating);
  const setTodayHandoverDone = useAppStore((state) => state.setTodayHandoverDone);

  const [activeTab, setActiveTab] = useState<'handover' | 'history'>('handover');

  // 2-Way Cash Reconciliation Form
  const [openingCashOverride, setOpeningCashOverride] = useState<string | null>(null);
  const [posCashRevenue, setPosCashRevenue] = useState('');
  const [cashExpense, setCashExpense] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [handoverNote, setHandoverNote] = useState('');
  const [handoverFormError, setHandoverFormError] = useState('');
  const [isSubmittingHandover, setIsSubmittingHandover] = useState(false);

  // Optional Cash Denomination Helper
  const [showDenomHelper, setShowDenomHelper] = useState(false);
  const [denomCounts, setDenomCounts] = useState<Record<number, number>>({});

  // Incoming Cashier Dispute Inline Panel
  const [disputeOpenForId, setDisputeOpenForId] = useState<string | null>(null);
  const [disputeCountedCash, setDisputeCountedCash] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeError, setDisputeError] = useState('');
  const [isAckingId, setIsAckingId] = useState<string | null>(null);

  // Recent handovers state
  const [handovers, setHandovers] = useState<HandoverLedgerRecord[]>([]);
  const [loadingHandovers, setLoadingHandovers] = useState(false);
  const [handoversError, setHandoversError] = useState('');
  const [ackMap, setAckMap] = useState<Record<string, boolean>>(() => readAckMap());
  const [localMeta, setLocalMeta] = useState<Record<string, Partial<HandoverLedgerRecord>>>(() =>
    readLocalHandoverMeta(),
  );

  const pushToast = useCallback((message: string, tone: FeedbackTone) => {
    kgToast(message, tone);
  }, []);

  const denomTotal = useMemo(
    () => CASH_DENOMINATIONS.reduce((sum, bill) => sum + bill * (denomCounts[bill] || 0), 0),
    [denomCounts],
  );

  const loadHandovers = useCallback(async () => {
    setLoadingHandovers(true);
    setHandoversError('');
    try {
      const res = await callApi('GET_HANDOVERS', {}, { background: true, cacheTtlMs: 4000 });
      if (res?.ok && Array.isArray(res.data?.handovers)) {
        const meta = readLocalHandoverMeta();
        const merged: HandoverLedgerRecord[] = res.data.handovers.map((h: HandoverLedgerRecord) => {
          const sigKey = `sig:${String(h.username || '').toLowerCase()}|${String(h.shift || '')}|${String(h.cashAmount || '')}`;
          const localPatch = meta[h.id] || meta[sigKey] || {};
          return {
            ...localPatch,
            ...h,
            openingCash: h.openingCash ?? localPatch.openingCash,
            posCashRevenue: h.posCashRevenue ?? localPatch.posCashRevenue,
            cashExpense: h.cashExpense ?? localPatch.cashExpense,
            expectedCash: h.expectedCash ?? localPatch.expectedCash,
            closingCash: h.closingCash ?? localPatch.closingCash,
            discrepancy: h.discrepancy ?? localPatch.discrepancy,
            reconcileStatus: h.reconcileStatus || localPatch.reconcileStatus,
            ackBy: h.ackBy || localPatch.ackBy,
            ackAt: h.ackAt || localPatch.ackAt,
            ackStatus: h.ackStatus || localPatch.ackStatus,
            ackNote: h.ackNote || localPatch.ackNote,
            countedCash: h.countedCash ?? localPatch.countedCash,
          };
        });
        setHandovers(merged);
      } else if (!res?.ok) {
        setHandoversError(res?.message || 'Không thể tải sổ cái bàn giao két.');
      }
    } catch {
      setHandoversError('Lỗi kết nối khi tải dữ liệu bàn giao ca.');
    } finally {
      setLoadingHandovers(false);
    }
  }, []);

  useEffect(() => {
    void loadHandovers();
  }, [loadHandovers]);

  const latestHandover = handovers.length > 0 ? handovers[0] : null;

  const previousClosingCash = useMemo(() => {
    if (!latestHandover) return null;
    if (typeof latestHandover.closingCash === 'number') return latestHandover.closingCash;
    return parseVndAmount(latestHandover.cashAmount);
  }, [latestHandover]);

  const effectiveOpeningCash =
    openingCashOverride !== null
      ? openingCashOverride
      : previousClosingCash !== null && previousClosingCash > 0
        ? formatVndInput(previousClosingCash)
        : '';

  const recon = useMemo(
    () =>
      calculateCashReconciliation({
        openingCash: effectiveOpeningCash,
        posCashRevenue,
        cashExpense,
        closingCash: cashAmount,
        previousClosingCash,
      }),
    [effectiveOpeningCash, posCashRevenue, cashExpense, cashAmount, previousClosingCash],
  );

  const handleAcknowledgeCash = async (
    handover: HandoverLedgerRecord,
    ackMode: 'Accepted' | 'Disputed',
  ) => {
    setDisputeError('');
    const ackBy = currentUser?.fullname || currentUser?.username || 'Thu ngân ca sau';
    const countedNum =
      ackMode === 'Disputed'
        ? parseVndAmount(disputeCountedCash)
        : handover.closingCash ?? parseVndAmount(handover.cashAmount);

    if (ackMode === 'Disputed') {
      if (!disputeCountedCash.trim()) {
        setDisputeError('Vui lòng nhập số tiền mặt bạn đếm thực tế khi nhận két.');
        return;
      }
      if (disputeReason.trim().length < 4) {
        setDisputeError('Vui lòng mô tả ngắn gọn chênh lệch khi nhận bàn giao (tối thiểu 4 ký tự).');
        return;
      }
    }

    const now = new Date();
    const ackAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const nextReconcileStatus =
      ackMode === 'Disputed' ? 'Disputed' : handover.reconcileStatus || 'Matched';

    const prevMeta = localMeta;
    const prevAckMap = ackMap;
    const prevHandovers = handovers;
    const prevOpeningOverride = openingCashOverride;

    const patch: Partial<HandoverLedgerRecord> = {
      ackBy,
      ackAt,
      ackStatus: ackMode,
      ackNote: ackMode === 'Disputed' ? disputeReason.trim() : '',
      countedCash: countedNum,
      reconcileStatus: nextReconcileStatus,
    };

    const nextMeta = { ...localMeta, [handover.id]: { ...(localMeta[handover.id] || {}), ...patch } };
    const nextAckMap = { ...ackMap, [handover.id]: true };
    setLocalMeta(nextMeta);
    setAckMap(nextAckMap);
    writeLocalHandoverMeta(nextMeta);
    writeAckMap(nextAckMap);

    setHandovers((prev) =>
      prev.map((item) => (item.id === handover.id ? { ...item, ...patch } : item)),
    );
    if (ackMode === 'Disputed' && countedNum >= 0) {
      setOpeningCashOverride(formatVndInput(countedNum));
    }

    setIsAckingId(handover.id);
    try {
      const res = await callApi(
        'ACKNOWLEDGE_HANDOVER',
        {
          handoverId: handover.id,
          ackBy,
          username: currentUser?.username,
          fullname: currentUser?.fullname,
          ackStatus: ackMode,
          countedCash: countedNum,
          ackNote: ackMode === 'Disputed' ? disputeReason.trim() : '',
        },
        { background: true },
      );

      if (!res?.ok) {
        throw new Error(res?.message || 'Không thể lưu xác nhận nhận két lên máy chủ.');
      }

      setDisputeOpenForId(null);
      setDisputeCountedCash('');
      setDisputeReason('');
      pushToast(
        ackMode === 'Disputed'
          ? `Đã báo lệch két (${formatVnd(countedNum)}) cho Quản lý`
          : `Đã xác nhận nhận đủ ${formatVnd(countedNum)}`,
        ackMode === 'Disputed' ? 'warning' : 'success',
      );
    } catch (err) {
      // Rollback state on failure
      setLocalMeta(prevMeta);
      setAckMap(prevAckMap);
      writeLocalHandoverMeta(prevMeta);
      writeAckMap(prevAckMap);
      setHandovers(prevHandovers);
      setOpeningCashOverride(prevOpeningOverride);
      pushToast(
        err instanceof Error ? err.message : 'Lỗi kết nối khi xác nhận két. Đã hoàn tác, vui lòng thử lại.',
        'error',
      );
    } finally {
      setIsAckingId(null);
    }
  };

  const submitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    setHandoverFormError('');
    if (!cashAmount.trim()) {
      setHandoverFormError('Vui lòng nhập số tiền mặt kiểm thực tế trong két.');
      return;
    }

    if (recon.requiresExplanation && handoverNote.trim().length < 5) {
      const reasonPrompt =
        recon.discrepancy !== 0
          ? `Két đang lệch ${formatSignedVnd(recon.discrepancy)} so với lý thuyết.`
          : recon.openingMismatch !== 0
            ? `Số dư đầu ca lệch ${formatSignedVnd(recon.openingMismatch)} so với ca trước.`
            : `Trong ca có khoản chi tiền mặt tại quầy (${formatVnd(recon.cashExpense)}).`;
      setHandoverFormError(`${reasonPrompt} Vui lòng ghi rõ lý do vào ô Ghi chú (tối thiểu 5 ký tự).`);
      return;
    }

    setUpdating(true);
    setIsSubmittingHandover(true);
    try {
      const formattedClosing = formatVndInput(recon.closingCash) || '0';
      const res = await callApi('SUBMIT_HANDOVER', {
        username: currentUser?.username,
        fullname: currentUser?.fullname,
        shift: shiftName,
        openingCash: recon.openingCash,
        posCashRevenue: recon.posCashRevenue,
        cashExpense: recon.cashExpense,
        expectedCash: recon.expectedCash,
        closingCash: recon.closingCash,
        discrepancy: recon.discrepancy,
        cashAmount: formattedClosing,
        note: handoverNote.trim(),
      });

      if (res?.ok) {
        setTodayHandoverDone(true);
        const savedId = res.data?.id || `HO_LOCAL_${Date.now()}`;
        const sigKey = `sig:${String(currentUser?.username || '').toLowerCase()}|${String(shiftName || '')}|${formattedClosing}`;
        const metaEntry: Partial<HandoverLedgerRecord> = {
          openingCash: recon.openingCash,
          posCashRevenue: recon.posCashRevenue,
          cashExpense: recon.cashExpense,
          expectedCash: recon.expectedCash,
          closingCash: recon.closingCash,
          discrepancy: recon.discrepancy,
          reconcileStatus: recon.discrepancy === 0 ? 'Matched' : 'Pending',
        };
        const nextMeta = { ...localMeta, [savedId]: metaEntry, [sigKey]: metaEntry };
        setLocalMeta(nextMeta);
        writeLocalHandoverMeta(nextMeta);

        pushToast(
          recon.discrepancy === 0
            ? `Đã chốt bàn giao két khớp chuẩn ${formatVnd(recon.closingCash)}`
            : `Đã ghi nhận bàn giao két (${formatSignedVnd(recon.discrepancy)}) để Quản lý đối soát`,
          'success',
        );

        setOpeningCashOverride(null);
        setPosCashRevenue('');
        setCashExpense('');
        setCashAmount('');
        setHandoverNote('');
        setDenomCounts({});
        setShowDenomHelper(false);
        void loadHandovers();
      } else {
        setHandoverFormError(res?.message || 'Không thể gửi bàn giao ca. Vui lòng thử lại.');
      }
    } catch {
      setHandoverFormError('Không thể kết nối máy chủ. Vui lòng kiểm tra lại mạng.');
    } finally {
      setUpdating(false);
      setIsSubmittingHandover(false);
    }
  };

  if (currentUser && !isWorkEligible(currentUser)) {
    return <EmploymentStatusNotice user={currentUser} actionLabel="thực hiện bàn giao ca" />;
  }

  const latestAckBy = latestHandover ? latestHandover.ackBy || localMeta[latestHandover.id]?.ackBy : '';
  const latestAckAt = latestHandover ? latestHandover.ackAt || localMeta[latestHandover.id]?.ackAt : '';
  const latestAckStatus = latestHandover
    ? latestHandover.ackStatus ||
      localMeta[latestHandover.id]?.ackStatus ||
      (latestAckBy || ackMap[latestHandover.id] ? 'Accepted' : '')
    : '';

  return (
    <div className="flex flex-col space-y-4 pb-24 md:pb-12 animate-fade-in max-w-[1440px] mx-auto w-full">
      <KgModuleHero
        moduleId="handover"
        title="Đối Soát & Bàn Giao Két Thu Ngân"
        description="Xác nhận nhận két 2 chiều, đối soát tiền mặt theo doanh thu POS CukCuk và theo dõi sổ cái két."
        eyebrow="Vận hành F&B"
        features={['Đối soát POS 2 chiều', 'Tự động kết chuyển đầu ca']}
        tipTitle="Quy chuẩn Đối soát Két Thu ngân 2 chiều"
        tips={[
          'Ca nhận két kiểm đếm tiền mặt thực tế: bấm "Nhận đủ két" hoặc "Báo lệch két" ngay đầu ca.',
          'Số dư đầu ca được tự động kết chuyển từ số dư cuối ca trước.',
          'Công thức chuẩn: Đầu ca + Doanh thu tiền mặt POS - Chi tại quầy = Lý thuyết trong két.',
          'Nếu chênh lệch khác 0 VNĐ hoặc có khoản chi tại quầy, bắt buộc ghi rõ lý do để Quản lý duyệt chốt.',
        ]}
        actions={
          <KgButton
            type="button"
            variant="secondary"
            size="sm"
            icon={ShieldAlert}
            onClick={() => navigateToHubSubTab('work', 'incidents')}
          >
            Báo sự cố ca
          </KgButton>
        }
      />

      <div className="relative z-20 flex-1 flex flex-col space-y-4">
        {/* Focused 2-Tab Navigation */}
        <div className="flex items-center justify-between gap-2">
          <div className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('handover')}
              className={`min-h-[44px] sm:min-h-[38px] sm:px-4 flex items-center justify-center py-2 px-2.5 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap select-none touch-manipulation ${
                activeTab === 'handover'
                  ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] font-bold shadow-xs'
                  : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-medium'
              }`}
            >
              <Banknote size={15} className="mr-1.5 shrink-0" /> Bàn giao quỹ
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`min-h-[44px] sm:min-h-[38px] sm:px-4 flex items-center justify-center py-2 px-2.5 rounded-lg text-xs sm:text-sm transition-colors whitespace-nowrap select-none touch-manipulation ${
                activeTab === 'history'
                  ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] font-bold shadow-xs'
                  : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-medium'
              }`}
            >
              <History size={15} className="mr-1.5 shrink-0" /> Sổ cái két ({handovers.length})
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          {/* TAB 1: 2-WAY CASH HANDOVER & RECONCILIATION — Toast Touch 2-column split (Nhận két đầu ca + Công thức đối soát cuối ca) */}
          {activeTab === 'handover' && (
            <div key="handover" className="kg-fade-in space-y-4">
              {handoversError && (
                <KgErrorState
                  title="Không thể tải két ca trước"
                  description={handoversError}
                  onRetry={loadHandovers}
                />
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left Column (5 cols): Nhận két đầu ca (2-Way Verification Card) */}
              <div className="order-first lg:order-1 lg:col-span-5 lg:sticky lg:top-[128px] min-w-0">
              {latestHandover ? (
                <div
                  className={`bg-[var(--kg-surface)] border rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5 ${
                    latestAckStatus === 'Disputed' || latestHandover.reconcileStatus === 'Disputed'
                      ? 'border-[var(--kg-warning)]/50'
                      : !latestAckStatus
                        ? 'border-[var(--kg-primary)]/45'
                        : 'border-[var(--kg-border)]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[var(--kg-border)]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          latestAckStatus === 'Disputed'
                            ? 'bg-[var(--kg-warning)]'
                            : latestAckStatus === 'Accepted'
                              ? 'bg-[var(--kg-success)]'
                              : 'bg-[var(--kg-warning)] animate-pulse'
                        }`}
                      />
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-sm text-[var(--kg-text)] truncate">
                          Nhận két đầu ca
                        </h3>
                        <p className="text-[11px] text-[var(--kg-text-muted)] truncate">
                          Từ {latestHandover.shift || 'Ca trước'} ·{' '}
                          <span className="font-mono tabular-nums">{latestHandover.date}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {latestHandover.reconcileStatus === 'ManagerConfirmed' ? (
                        <KgStatusBadge variant="success">
                          <ShieldCheck size={12} /> Quản lý đã chốt
                        </KgStatusBadge>
                      ) : !latestAckStatus ? (
                        <KgStatusBadge variant="warning">Cần kiểm tra</KgStatusBadge>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] space-y-1">
                      <span className="block text-[11px] font-semibold text-[var(--kg-text-muted)]">
                        Số tiền ca trước bàn giao
                      </span>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-2xl sm:text-[26px] font-black font-mono tabular-nums tracking-tight text-[var(--kg-text)]">
                          {latestHandover.cashAmount} đ
                        </span>
                        {typeof latestHandover.discrepancy === 'number' && latestHandover.discrepancy !== 0 && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums font-bold bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]">
                            Ca trước lệch: {formatSignedVnd(latestHandover.discrepancy)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--kg-text-muted)] font-medium pt-1">
                        Người giao:{' '}
                        <b className="text-[var(--kg-text)]">{latestHandover.fullname || latestHandover.username}</b>
                        {latestHandover.note ? ` • "${latestHandover.note}"` : ''}
                      </p>
                    </div>

                    {latestAckStatus ? (
                      <div
                        className={`w-full flex flex-col gap-0.5 px-3.5 py-2.5 rounded-xl border ${
                          latestAckStatus === 'Disputed'
                            ? 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/30 text-[var(--kg-warning)]'
                            : 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/30 text-[var(--kg-success)]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5 font-extrabold text-xs">
                          {latestAckStatus === 'Disputed' ? (
                            <>
                              <AlertTriangle size={15} /> Đã báo lệch két khi nhận
                            </>
                          ) : (
                            <>
                              <CheckCheck size={16} /> Đã xác nhận kiểm đếm đủ
                            </>
                          )}
                        </span>
                        {latestAckBy && (
                          <span className="text-[11px] font-semibold opacity-90">
                            Ca nhận: {latestAckBy}
                            {latestAckAt ? ` (${latestAckAt})` : ''}
                          </span>
                        )}
                        {latestAckStatus === 'Disputed' &&
                          (latestHandover.countedCash !== undefined ||
                            localMeta[latestHandover.id]?.countedCash !== undefined) && (
                            <span className="text-xs font-mono tabular-nums font-bold">
                              Đếm thực tế:{' '}
                              {formatVnd(
                                latestHandover.countedCash ?? localMeta[latestHandover.id]?.countedCash,
                              )}
                            </span>
                          )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2.5 w-full">
                        <KgButton
                          type="button"
                          variant="primary"
                          size="md"
                          loading={isAckingId === latestHandover.id}
                          disabled={Boolean(isAckingId)}
                          icon={CheckCircle2}
                          onClick={() => handleAcknowledgeCash(latestHandover, 'Accepted')}
                          className="w-full"
                        >
                          Nhận đủ két
                        </KgButton>
                        <KgButton
                          type="button"
                          variant="warning"
                          size="md"
                          disabled={Boolean(isAckingId)}
                          icon={AlertTriangle}
                          onClick={() => {
                            setDisputeOpenForId(disputeOpenForId === latestHandover.id ? null : latestHandover.id);
                            setDisputeCountedCash('');
                            setDisputeReason('');
                            setDisputeError('');
                          }}
                          className="w-full"
                        >
                          Báo lệch két
                        </KgButton>
                      </div>
                    )}
                  </div>

                  {/* Extended Breakdown Strip */}
                  {typeof latestHandover.posCashRevenue === 'number' && (
                    <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-[var(--kg-border)] text-[11px]">
                      <div className="bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl px-2.5 py-2">
                        <span className="text-[var(--kg-text-muted)] block">Đầu ca</span>
                        <span className="font-mono tabular-nums font-bold text-[var(--kg-text)] block text-right whitespace-nowrap mt-0.5">
                          {formatVnd(latestHandover.openingCash)}
                        </span>
                      </div>
                      <div className="bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl px-2.5 py-2">
                        <span className="text-[var(--kg-text-muted)] block">+ POS</span>
                        <span className="font-mono tabular-nums font-bold text-[var(--kg-success)] block text-right whitespace-nowrap mt-0.5">
                          {formatVnd(latestHandover.posCashRevenue)}
                        </span>
                      </div>
                      <div className="bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl px-2.5 py-2">
                        <span className="text-[var(--kg-text-muted)] block">- Chi quầy</span>
                        <span className="font-mono tabular-nums font-bold text-[var(--kg-danger)] block text-right whitespace-nowrap mt-0.5">
                          {formatVnd(latestHandover.cashExpense)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Inline Dispute Form */}
                  {disputeOpenForId === latestHandover.id && !latestAckStatus && (
                    <div className="p-3.5 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/30 space-y-2.5">
                      <div className="text-xs font-extrabold text-[var(--kg-warning)]">
                        Khai báo số tiền mặt đếm thực tế khi nhận két
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <label className="block space-y-1">
                          <span className="block text-[11px] font-bold text-[var(--kg-text-muted)]">
                            Số tiền đếm thực tế (VNĐ)
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={disputeCountedCash}
                            onChange={(e) => {
                              setDisputeCountedCash(formatVndInput(e.target.value));
                              if (disputeError) setDisputeError('');
                            }}
                            placeholder="VD: 1.450.000"
                            className="w-full min-h-[44px] bg-[var(--kg-surface)] border border-[var(--kg-warning)]/40 rounded-lg px-3 py-2 text-right font-mono tabular-nums font-bold text-xs text-[var(--kg-text)]"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="block text-[11px] font-bold text-[var(--kg-text-muted)]">
                            Ghi chú chênh lệch
                          </span>
                          <input
                            type="text"
                            value={disputeReason}
                            onChange={(e) => {
                              setDisputeReason(e.target.value);
                              if (disputeError) setDisputeError('');
                            }}
                            placeholder="VD: Thiếu 1 tờ 50k trong ngăn lẻ"
                            className="w-full min-h-[44px] bg-[var(--kg-surface)] border border-[var(--kg-warning)]/40 rounded-lg px-3 py-2 text-xs text-[var(--kg-text)]"
                          />
                        </label>
                      </div>
                      {disputeError && (
                        <p className="text-xs font-semibold text-[var(--kg-danger)]">{disputeError}</p>
                      )}
                      <div className="flex justify-end gap-2">
                        <KgButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={Boolean(isAckingId)}
                          onClick={() => setDisputeOpenForId(null)}
                        >
                          Hủy
                        </KgButton>
                        <KgButton
                          type="button"
                          variant="warning"
                          size="sm"
                          loading={isAckingId === latestHandover.id}
                          onClick={() => handleAcknowledgeCash(latestHandover, 'Disputed')}
                        >
                          Gửi cảnh báo lệch két
                        </KgButton>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-between gap-2 text-xs text-[var(--kg-text-muted)]">
                  <span>Chưa có dữ liệu bàn giao ca trước trong ngày.</span>
                  <KgButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={loadingHandovers}
                    icon={RefreshCw}
                    onClick={loadHandovers}
                  >
                    Tải lại
                  </KgButton>
                </div>
              )}
              </div>

              {/* Right Column (7 cols): Công thức đối soát cuối ca */}
              <div className="order-2 lg:order-2 lg:col-span-7 min-w-0 bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--kg-border)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] flex items-center justify-center shrink-0">
                      <Calculator size={20} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-sm sm:text-base text-[var(--kg-text)]">
                        Công thức đối soát cuối ca
                      </h3>
                      <p className="text-xs text-[var(--kg-text-muted)] font-medium">
                        Ca hiện tại: <b className="text-[var(--kg-text)]">{shiftName}</b>
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={submitHandover} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1 min-h-[24px]">
                        <label
                          htmlFor="handover-opening-cash"
                          className="text-xs font-semibold text-[var(--kg-text)]"
                        >
                          1. Quỹ đầu ca (VNĐ)
                        </label>
                        {openingCashOverride !== null && previousClosingCash !== null && (
                          <button
                            type="button"
                            onClick={() => setOpeningCashOverride(null)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)] px-2 py-0.5 rounded-lg hover:brightness-95 min-h-[28px] touch-manipulation"
                            title="Khôi phục số dư cuối ca trước"
                          >
                            <RotateCcw size={11} /> Ca trước
                          </button>
                        )}
                      </div>
                      <input
                        id="handover-opening-cash"
                        type="text"
                        inputMode="numeric"
                        value={effectiveOpeningCash}
                        onChange={(e) => setOpeningCashOverride(formatVndInput(e.target.value))}
                        placeholder="0"
                        className="w-full min-h-[44px] bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl px-3 py-2.5 text-right font-mono tabular-nums font-bold text-sm text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)]"
                      />
                      {recon.openingMismatch !== 0 && (
                        <p className="text-[11px] font-mono tabular-nums text-[var(--kg-warning)] mt-1">
                          Lệch so với ca trước: {formatSignedVnd(recon.openingMismatch)}
                        </p>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1 min-h-[24px]">
                        <label
                          htmlFor="handover-pos-revenue"
                          className="text-xs font-semibold text-[var(--kg-text)]"
                        >
                          2. + Thu tiền mặt POS (VNĐ)
                        </label>
                      </div>
                      <input
                        id="handover-pos-revenue"
                        type="text"
                        inputMode="numeric"
                        value={posCashRevenue}
                        onChange={(e) => setPosCashRevenue(formatVndInput(e.target.value))}
                        placeholder="Doanh thu TM CukCuk"
                        className="w-full min-h-[44px] bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl px-3 py-2.5 text-right font-mono tabular-nums font-bold text-sm text-[var(--kg-success)] focus:outline-none focus:border-[var(--kg-primary)]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1 min-h-[24px]">
                        <label
                          htmlFor="handover-cash-expense"
                          className="text-xs font-semibold text-[var(--kg-text)]"
                        >
                          3. - Chi tiền mặt tại quầy (VNĐ)
                        </label>
                      </div>
                      <input
                        id="handover-cash-expense"
                        type="text"
                        inputMode="numeric"
                        value={cashExpense}
                        onChange={(e) => setCashExpense(formatVndInput(e.target.value))}
                        placeholder="Mua đá, hàng gấp..."
                        className="w-full min-h-[44px] bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl px-3 py-2.5 text-right font-mono tabular-nums font-bold text-sm text-[var(--kg-danger)] focus:outline-none focus:border-[var(--kg-primary)]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1 min-h-[24px]">
                        <label
                          htmlFor="handover-cash"
                          className="text-xs font-semibold text-[var(--kg-text)]"
                        >
                          4. Thực bàn giao (VNĐ) <span className="text-[var(--kg-danger)]">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowDenomHelper((v) => !v)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--kg-primary-ink)] hover:underline touch-manipulation"
                        >
                          <Coins size={12} />
                          <span>Đếm tờ</span>
                          <ChevronDown size={12} className={`transition-transform ${showDenomHelper ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                      <input
                        id="handover-cash"
                        type="text"
                        inputMode="numeric"
                        value={cashAmount}
                        onChange={(e) => {
                          setCashAmount(formatVndInput(e.target.value));
                          if (handoverFormError) setHandoverFormError('');
                        }}
                        placeholder="VD: 1.500.000"
                        className="w-full min-h-[44px] bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl px-3 py-2.5 text-right font-mono tabular-nums font-bold text-sm text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)]"
                      />
                    </div>
                  </div>

                  {/* Optional Cash Denomination Counter (min-h-[44px] mobile touch targets) */}
                  {showDenomHelper && (
                    <div className="p-3.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[var(--kg-text)]">
                          Bảng kê mệnh giá tiền mặt (tùy chọn)
                        </span>
                        <button
                          type="button"
                          onClick={() => setDenomCounts({})}
                          className="min-h-[44px] sm:min-h-[32px] px-2 text-[11px] font-semibold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] underline touch-manipulation"
                        >
                          Xóa bảng kê
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {CASH_DENOMINATIONS.map((bill) => (
                          <label
                            key={bill}
                            className="flex items-center justify-between gap-2 rounded-lg border border-[var(--kg-border)] bg-[var(--kg-surface)] px-2.5 py-1.5"
                          >
                            <span className="text-xs font-mono tabular-nums font-bold text-[var(--kg-text)]">
                              {bill.toLocaleString('vi-VN')}
                            </span>
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              aria-label={`Số tờ mệnh giá ${bill.toLocaleString('vi-VN')} đồng`}
                              value={denomCounts[bill] || ''}
                              onChange={(e) => {
                                const qty = Math.max(0, parseInt(e.target.value || '0', 10) || 0);
                                setDenomCounts((prev) => ({ ...prev, [bill]: qty }));
                              }}
                              placeholder="0"
                              className="w-20 min-h-[44px] text-right font-mono tabular-nums text-xs font-bold bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-lg px-2.5 py-1.5 text-[var(--kg-text)] outline-none focus:border-[var(--kg-primary)]"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--kg-border)]">
                        <span className="text-xs font-bold text-[var(--kg-text-muted)]">
                          Tổng tiền đếm:{' '}
                          <span className="font-mono tabular-nums font-black text-[var(--kg-text)]">
                            {formatVnd(denomTotal)}
                          </span>
                        </span>
                        <KgButton
                          type="button"
                          size="sm"
                          variant="primary"
                          disabled={denomTotal <= 0}
                          onClick={() => {
                            setCashAmount(formatVndInput(denomTotal));
                            if (handoverFormError) setHandoverFormError('');
                          }}
                        >
                          Áp dụng tổng này
                        </KgButton>
                      </div>
                    </div>
                  )}

                  {/* Live Reconciliation Summary Box: Số dư lý thuyết & Chênh lệch */}
                  <div className="p-3.5 rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-[var(--kg-text)] block">
                          Số dư lý thuyết
                        </span>
                        <span className="text-[11px] text-[var(--kg-text-muted)]">
                          = Đầu ca + Thu POS - Chi tại quầy
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono tabular-nums font-black text-base text-[var(--kg-text)] text-right">
                          {formatVnd(recon.expectedCash)}
                        </span>
                        {recon.expectedCash > 0 && (
                          <button
                            type="button"
                            onClick={() => setCashAmount(formatVndInput(recon.expectedCash))}
                            className="min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border border-[var(--kg-primary)]/20 text-[11px] font-bold hover:brightness-95 transition-colors touch-manipulation"
                          >
                            Điền khớp
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--kg-border)]">
                      <span className="text-xs font-bold text-[var(--kg-text)]">
                        Chênh lệch
                        {cashAmount.trim() !== '' && (
                          <span className="ml-2 text-[11px] font-medium text-[var(--kg-text-muted)]">
                            {recon.discrepancy === 0
                              ? '(Khớp 100%)'
                              : recon.discrepancy < 0
                                ? '(Thiếu két — cần giải trình)'
                                : '(Dư két — ghi chú nguồn)'}
                          </span>
                        )}
                      </span>
                      <span
                        className={`font-mono tabular-nums font-black text-base text-right shrink-0 ${
                          cashAmount.trim() === ''
                            ? 'text-[var(--kg-text-muted)]'
                            : recon.discrepancy === 0
                              ? 'text-[var(--kg-success)]'
                              : recon.discrepancy < 0
                                ? 'text-[var(--kg-danger)]'
                                : 'text-[var(--kg-warning)]'
                        }`}
                      >
                        {cashAmount.trim() !== '' ? formatSignedVnd(recon.discrepancy) : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Note / Explanation (Preserves id="handover-note") */}
                  <div>
                    <label
                      htmlFor="handover-note"
                      className="block text-xs font-semibold text-[var(--kg-text)] mb-1.5"
                    >
                      Ghi chú &amp; Giải trình thu chi{' '}
                      {recon.requiresExplanation && (
                        <span className="text-[var(--kg-danger)] font-bold">
                          * (Bắt buộc khi có chi quầy hoặc lệch két)
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <div className="absolute top-3 left-3 flex items-start pointer-events-none text-[var(--kg-text-muted)]">
                        <FileText size={16} />
                      </div>
                      <textarea
                        id="handover-note"
                        value={handoverNote}
                        onChange={(e) => {
                          setHandoverNote(e.target.value);
                          if (handoverFormError) setHandoverFormError('');
                        }}
                        placeholder="Ghi rõ hóa đơn chi mua đá/nguyên liệu, bill hủy POS hoặc lý do lệch tiền..."
                        rows={3}
                        className="w-full bg-[var(--kg-surface-2)] border border-[var(--kg-border)] rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] text-xs sm:text-sm"
                      />
                    </div>
                  </div>

                  {handoverFormError && (
                    <p className="text-xs font-semibold text-[var(--kg-danger)] bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/20 rounded-xl px-3 py-2">
                      {handoverFormError}
                    </p>
                  )}

                  <div className="flex justify-end pt-1">
                    <KgButton
                      type="submit"
                      variant="primary"
                      size="lg"
                      loading={isSubmittingHandover}
                      icon={CheckCircle2}
                      className="w-full sm:w-auto sm:min-w-[260px] uppercase tracking-wider text-xs sm:text-sm"
                    >
                      Chốt đối soát &amp; Bàn giao két
                    </KgButton>
                  </div>
                </form>
              </div>
              </div>
            </div>
          )}

          {/* TAB 2: COMPACT HANDOVER HISTORY LEDGER (lg:block Desktop Table + <lg Mobile/iPad Cards) */}
          {activeTab === 'history' && (
            <div
              key="history"
              className="kg-fade-in bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[var(--kg-border)]">
                <div className="flex items-center gap-2">
                  <History size={18} className="text-[var(--kg-info)]" />
                  <h3 className="font-black text-sm sm:text-base text-[var(--kg-text)]">
                    Sổ cái đối soát két 2 chiều
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={loadHandovers}
                  disabled={loadingHandovers}
                  aria-label="Làm mới sổ cái két"
                  className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] rounded-xl border border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center active:scale-95 transition-all touch-manipulation"
                >
                  <RefreshCw size={15} className={loadingHandovers ? 'animate-spin' : ''} />
                </button>
              </div>

              {handoversError ? (
                <KgErrorState title="Không thể tải nhật ký két" description={handoversError} onRetry={loadHandovers} />
              ) : handovers.length === 0 ? (
                <KgEmptyState
                  icon={History}
                  title={loadingHandovers ? 'Đang tải nhật ký két...' : 'Chưa có bản ghi bàn giao ca nào'}
                  description="Các lượt bàn giao két cuối ca sẽ được ghi nhận tại đây."
                />
              ) : (
                <>
                  {/* Desktop Sticky-Header Table (lg:block so 768px iPad portrait uses clean cards) */}
                  <div className="hidden lg:block overflow-auto max-h-[540px] rounded-xl border border-[var(--kg-border)]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 z-10 bg-[var(--kg-surface-soft)] border-b border-[var(--kg-border)] text-[11px] uppercase tracking-wider text-[var(--kg-text-muted)]">
                        <tr>
                          <th className="py-3 px-3.5 font-bold">Ca / Ngày</th>
                          <th className="py-3 px-3 font-bold">Người giao</th>
                          <th className="py-3 px-3 font-bold text-right">Đầu ca / POS / Chi</th>
                          <th className="py-3 px-3 font-bold text-right">Thực bàn giao</th>
                          <th className="py-3 px-3 font-bold text-right">Chênh lệch</th>
                          <th className="py-3 px-3.5 font-bold">Xác nhận ca sau</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--kg-border)] bg-[var(--kg-surface)]">
                        {handovers.map((item, idx) => {
                          const itemAckBy = item.ackBy || localMeta[item.id]?.ackBy;
                          const itemAckAt = item.ackAt || localMeta[item.id]?.ackAt;
                          const itemAckStatus =
                            item.ackStatus ||
                            localMeta[item.id]?.ackStatus ||
                            (itemAckBy || ackMap[item.id] ? 'Accepted' : '');
                          const diff = item.discrepancy ?? 0;

                          return (
                            <tr key={item.id || idx} className="hover:bg-[var(--kg-surface-soft)]/60 transition-colors">
                              <td className="py-3 px-3.5 whitespace-nowrap">
                                <div className="font-bold text-[var(--kg-text)]">{item.shift || 'Ca trực'}</div>
                                <div className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                                  {item.date}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-bold text-[var(--kg-text)]">
                                  {item.fullname || item.username}
                                </div>
                                {item.note && (
                                  <div className="text-[11px] text-[var(--kg-text-muted)] italic line-clamp-1">
                                    &ldquo;{item.note}&rdquo;
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums text-[var(--kg-text-muted)] whitespace-nowrap">
                                {typeof item.posCashRevenue === 'number' ? (
                                  <div className="space-y-0.5 text-[11px]">
                                    <div>Đầu: {formatVnd(item.openingCash)}</div>
                                    <div className="text-[var(--kg-success)]">
                                      +POS: {formatVnd(item.posCashRevenue)}
                                    </div>
                                    <div className="text-[var(--kg-danger)]">
                                      -Chi: {formatVnd(item.cashExpense)}
                                    </div>
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums font-black text-sm text-[var(--kg-text)] whitespace-nowrap">
                                {item.cashAmount} VNĐ
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                {diff === 0 ? (
                                  <KgStatusBadge variant="success">Khớp</KgStatusBadge>
                                ) : (
                                  <KgStatusBadge variant={diff < 0 ? 'error' : 'warning'}>
                                    {formatSignedVnd(diff)}
                                  </KgStatusBadge>
                                )}
                              </td>
                              <td className="py-3 px-3.5 space-y-1">
                                <div className="flex flex-wrap gap-1">
                                  {itemAckStatus === 'Disputed' ? (
                                    <KgStatusBadge variant="warning">
                                      Lệch ({itemAckBy || 'ca sau'})
                                    </KgStatusBadge>
                                  ) : itemAckStatus === 'Accepted' ? (
                                    <KgStatusBadge variant="success">
                                      {itemAckBy ? `Đã nhận: ${itemAckBy}` : 'Đã đối soát'}
                                    </KgStatusBadge>
                                  ) : (
                                    <KgStatusBadge variant="neutral">Chờ ca sau</KgStatusBadge>
                                  )}
                                  {item.reconcileStatus === 'ManagerConfirmed' && (
                                    <KgStatusBadge variant="info">QL chốt</KgStatusBadge>
                                  )}
                                </div>
                                {itemAckAt && (
                                  <div className="text-[10px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                                    {itemAckAt}
                                  </div>
                                )}
                                {item.ackNote && (
                                  <div className="text-[11px] text-[var(--kg-warning)]">
                                    Ca nhận: {item.ackNote}
                                  </div>
                                )}
                                {item.managerNote && (
                                  <div className="text-[11px] text-[var(--kg-info)]">
                                    QL: {item.managerNote}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile & Tablet Portrait Card List (< lg) */}
                  <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
                    {handovers.map((item, idx) => {
                      const itemAckBy = item.ackBy || localMeta[item.id]?.ackBy;
                      const itemAckAt = item.ackAt || localMeta[item.id]?.ackAt;
                      const itemAckStatus =
                        item.ackStatus ||
                        localMeta[item.id]?.ackStatus ||
                        (itemAckBy || ackMap[item.id] ? 'Accepted' : '');
                      const diff = item.discrepancy ?? 0;

                      return (
                        <div
                          key={item.id || idx}
                          className="p-3.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] space-y-2"
                        >
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-[var(--kg-info-soft)] text-[var(--kg-info)]">
                                {item.shift || 'Ca trực'} • {item.date}
                              </span>
                              <span className="font-mono tabular-nums font-black text-sm text-[var(--kg-text)]">
                                Thực bàn giao: {item.cashAmount} VNĐ
                              </span>
                              {diff !== 0 && (
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold ${
                                    diff < 0
                                      ? 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                                      : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                                  }`}
                                >
                                  Lệch {formatSignedVnd(diff)}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {itemAckStatus === 'Disputed' ? (
                                <KgStatusBadge variant="warning">
                                  <AlertTriangle size={11} /> Báo lệch bởi {itemAckBy || 'ca sau'}
                                </KgStatusBadge>
                              ) : itemAckStatus === 'Accepted' ? (
                                <KgStatusBadge variant="success">
                                  <CheckCheck size={11} />
                                  {itemAckBy ? `Đã nhận: ${itemAckBy}` : 'Đã đối soát'}
                                  {itemAckAt ? ` (${itemAckAt})` : ''}
                                </KgStatusBadge>
                              ) : (
                                <KgStatusBadge variant="neutral">Chờ ca sau nhận</KgStatusBadge>
                              )}
                              {item.reconcileStatus === 'ManagerConfirmed' && (
                                <KgStatusBadge variant="info">
                                  <ShieldCheck size={11} /> QL đã chốt
                                </KgStatusBadge>
                              )}
                            </div>
                          </div>

                          {typeof item.posCashRevenue === 'number' && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                              <span>Đầu ca: {formatVnd(item.openingCash)}</span>
                              <span>+POS: {formatVnd(item.posCashRevenue)}</span>
                              <span>-Chi: {formatVnd(item.cashExpense)}</span>
                              <span>= Lý thuyết: {formatVnd(item.expectedCash)}</span>
                            </div>
                          )}

                          <div className="flex flex-col gap-1 text-[11px] text-[var(--kg-text-muted)]">
                            <span>
                              Người giao: <b className="text-[var(--kg-text)]">{item.fullname || item.username}</b>
                            </span>
                            {item.note && <span className="italic">&ldquo;{item.note}&rdquo;</span>}
                          </div>

                          {(item.ackNote || item.managerNote) && (
                            <div className="pt-1.5 border-t border-[var(--kg-border)] space-y-1 text-[11px]">
                              {item.ackNote && (
                                <p className="text-[var(--kg-warning)]">
                                  <b>Ca nhận phản hồi:</b> {item.ackNote}
                                </p>
                              )}
                              {item.managerNote && (
                                <p className="text-[var(--kg-info)]">
                                  <b>Quản lý kết luận:</b> {item.managerNote}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
