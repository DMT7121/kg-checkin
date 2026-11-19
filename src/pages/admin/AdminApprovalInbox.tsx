import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  HandCoins,
  Inbox,
  RefreshCw,
  Repeat2,
  Search,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import CashAuditPanel from '../../components/admin/CashAuditPanel';
import IncidentCenterPanel from '../../components/admin/IncidentCenterPanel';
import {
  KgBottomSheet,
  KgButton,
  KgEmptyState,
  KgErrorState,
  KgModuleHero,
  KgSkeleton,
  KgStatusBadge,
  KgTextarea,
} from '../../components/KgDesignSystem';
import { callApi } from '../../services/api';
import {
  useAppStore,
  type AdvanceRequest,
  type SwapRequest,
} from '../../store/useAppStore';
import { kgConfirm, kgToast } from '../../store/useFeedbackStore';
import type { SalaryAdjustmentRequest } from '../../types/salary';
import { salaryMonthLabel, salaryTypeLabel } from '../../types/salary';
import { formatUnifiedPunchLabel, type CanonicalPunchType } from '../../utils/attendanceSequence';
import { isWorkEligible } from '../../utils/employment';
import { formatVnd } from '../../utils/formatCurrency';
import { navigateToHubSubTab } from '../../utils/hubNavigation';
import {
  formatSignedVnd,
  formatVndCurrency,
  normalizeIncidentStatus,
  type HandoverLedgerRecord,
  type IncidentRecord,
} from '../../utils/operationsReconciliation';
import { isAdminUser } from '../../utils/permissions';
import { refreshAppData } from '../../utils/refreshData';

type InboxCategory =
  | 'all'
  | 'missed'
  | 'swaps'
  | 'cash'
  | 'incidents'
  | 'advances'
  | 'adjustments';

interface MissedClaimItem {
  id: string;
  createdAt?: string;
  username: string;
  fullname: string;
  date: string;
  effectiveDate?: string;
  time: string;
  type: string;
  canonicalType?: string;
  shift?: string;
  reason?: string;
  proofImage?: string;
  status: 'Pending' | 'Approved' | 'Rejected' | string;
}

function cleanMissedDate(raw: unknown): string {
  const s = String(raw ?? '').replace(/^'/, '').trim();
  if (!s) return '';
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    return `${String(parseInt(dmy[1], 10)).padStart(2, '0')}/${String(parseInt(dmy[2], 10)).padStart(2, '0')}/${dmy[3]}`;
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso && iso[1] !== '1899') {
    return `${String(parseInt(iso[3], 10)).padStart(2, '0')}/${String(parseInt(iso[2], 10)).padStart(2, '0')}/${iso[1]}`;
  }
  return s;
}

function cleanMissedTime(raw: unknown): string {
  const s = String(raw ?? '').replace(/^'/, '').trim();
  if (!s) return '';
  const hhmm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hhmm) return `${String(parseInt(hhmm[1], 10)).padStart(2, '0')}:${hhmm[2]}`;
  const anyTime = s.match(/(\d{1,2}):(\d{2})/);
  if (anyTime) return `${String(parseInt(anyTime[1], 10)).padStart(2, '0')}:${anyTime[2]}`;
  return s;
}

function normalizeClaim(raw: any): MissedClaimItem {
  const unified = formatUnifiedPunchLabel(String(raw?.canonicalType || raw?.type || 'Vào ca'));
  const canonicalType: CanonicalPunchType = unified.toLowerCase().includes('ra') ? 'Ra ca' : 'Vào ca';
  return {
    id: String(raw?.id || ''),
    createdAt: raw?.createdAt ? String(raw.createdAt) : undefined,
    username: String(raw?.username || ''),
    fullname: String(raw?.fullname || raw?.username || ''),
    date: cleanMissedDate(raw?.date),
    effectiveDate: raw?.effectiveDate ? cleanMissedDate(raw.effectiveDate) : undefined,
    time: cleanMissedTime(raw?.time),
    type: canonicalType,
    canonicalType,
    shift: raw?.shift ? String(raw.shift).replace(/^'/, '').trim() : '',
    reason: String(raw?.reason || ''),
    proofImage: raw?.proofImage ? String(raw.proofImage) : undefined,
    status: String(raw?.status || 'Pending'),
  };
}

export default function AdminApprovalInbox() {
  const currentUser = useAppStore((s) => s.currentUser);
  if (!isAdminUser(currentUser)) return null;
  return <AdminApprovalInboxContent />;
}

function AdminApprovalInboxContent() {
  const currentUser = useAppStore((s) => s.currentUser);
  const users = useAppStore((s) => s.users);
  const setLogs = useAppStore((s) => s.setLogs);
  const setSwapRequestsStore = useAppStore((s) => s.setSwapRequests);
  const setAdvancesStore = useAppStore((s) => s.setAdvances);

  const [category, setCategory] = useState<InboxCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [queueErrors, setQueueErrors] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkConfirmingCash, setBulkConfirmingCash] = useState(false);

  const [missedClaims, setMissedClaims] = useState<MissedClaimItem[]>([]);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [handovers, setHandovers] = useState<HandoverLedgerRecord[]>([]);
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [advances, setAdvances] = useState<AdvanceRequest[]>([]);
  const [adjustments, setAdjustments] = useState<SalaryAdjustmentRequest[]>([]);

  // Reject / Note bottom sheet
  const [noteSheet, setNoteSheet] = useState<
    | { kind: 'missed_reject'; claim: MissedClaimItem }
    | { kind: 'adjustment_review'; request: SalaryAdjustmentRequest; status: 'Approved' | 'Rejected' }
    | { kind: 'cash_dispute'; handover: HandoverLedgerRecord }
    | null
  >(null);
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);

  const employees = useMemo(
    () => users.filter((u) => u.username && u.role !== 'admin' && isWorkEligible(u)),
    [users],
  );

  const loadAllQueues = useCallback(
    async (isManualRefresh = false) => {
      if (!currentUser) return;
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setGlobalError('');
      setQueueErrors({});

      const [missedRes, swapRes, handoverRes, incidentRes, advanceRes, adjRes] =
        await Promise.allSettled([
          callApi(
            'GET_MISSED_CHECKINS',
            { username: currentUser.username, role: currentUser.role },
            { background: true, cacheTtlMs: 0 },
          ),
          callApi(
            'GET_SWAP_REQUESTS',
            { username: currentUser.username, role: currentUser.role },
            { background: true, cacheTtlMs: 0 },
          ),
          callApi(
            'GET_HANDOVERS',
            { role: currentUser.role, forceRefresh: true },
            { background: true, cacheTtlMs: 0 },
          ),
          callApi(
            'GET_INCIDENTS',
            { role: currentUser.role, username: currentUser.username, forceRefresh: true },
            { background: true, cacheTtlMs: 0 },
          ),
          callApi(
            'GET_ADVANCES',
            { username: currentUser.username, role: currentUser.role },
            { background: true, cacheTtlMs: 0 },
          ),
          callApi(
            'GET_SALARY_ADJUSTMENTS',
            { role: currentUser.role, username: currentUser.username, forceRefresh: true },
            { background: true, cacheTtlMs: 0 },
          ),
        ]);

      const nextErrors: Record<string, string> = {};
      let okCount = 0;

      if (missedRes.status === 'fulfilled' && missedRes.value?.ok) {
        okCount += 1;
        const list = Array.isArray(missedRes.value.data) ? missedRes.value.data : [];
        setMissedClaims(list.map(normalizeClaim));
      } else {
        nextErrors.missed =
          (missedRes.status === 'fulfilled' && missedRes.value?.message) ||
          'Không thể tải đơn bổ sung công.';
      }

      if (swapRes.status === 'fulfilled' && swapRes.value?.ok) {
        okCount += 1;
        const list = Array.isArray(swapRes.value.data) ? (swapRes.value.data as SwapRequest[]) : [];
        setSwaps(list);
        setSwapRequestsStore(list);
      } else {
        nextErrors.swaps =
          (swapRes.status === 'fulfilled' && swapRes.value?.message) ||
          'Không thể tải yêu cầu đổi ca / nghỉ phép.';
      }

      if (handoverRes.status === 'fulfilled' && handoverRes.value?.ok) {
        okCount += 1;
        const raw = Array.isArray(handoverRes.value.data?.handovers)
          ? handoverRes.value.data.handovers
          : Array.isArray(handoverRes.value.data)
            ? handoverRes.value.data
            : [];
        setHandovers(raw);
      } else {
        nextErrors.cash =
          (handoverRes.status === 'fulfilled' && handoverRes.value?.message) ||
          'Không thể tải sổ đối soát két.';
      }

      if (incidentRes.status === 'fulfilled' && incidentRes.value?.ok) {
        okCount += 1;
        const raw = Array.isArray(incidentRes.value.data?.incidents)
          ? incidentRes.value.data.incidents
          : Array.isArray(incidentRes.value.data)
            ? incidentRes.value.data
            : [];
        setIncidents(
          raw.map((item: IncidentRecord) => ({
            ...item,
            status: normalizeIncidentStatus(item.status),
          })),
        );
      } else {
        nextErrors.incidents =
          (incidentRes.status === 'fulfilled' && incidentRes.value?.message) ||
          'Không thể tải danh sách sự cố.';
      }

      if (advanceRes.status === 'fulfilled' && advanceRes.value?.ok) {
        okCount += 1;
        const list = Array.isArray(advanceRes.value.data)
          ? (advanceRes.value.data as AdvanceRequest[])
          : [];
        setAdvances(list);
        setAdvancesStore(list);
      } else {
        nextErrors.advances =
          (advanceRes.status === 'fulfilled' && advanceRes.value?.message) ||
          'Không thể tải đơn ứng lương.';
      }

      if (adjRes.status === 'fulfilled' && adjRes.value?.ok) {
        okCount += 1;
        const list = Array.isArray(adjRes.value.data?.requests)
          ? (adjRes.value.data.requests as SalaryAdjustmentRequest[])
          : Array.isArray(adjRes.value.data)
            ? (adjRes.value.data as SalaryAdjustmentRequest[])
            : [];
        setAdjustments(list);
      } else {
        nextErrors.adjustments =
          (adjRes.status === 'fulfilled' && adjRes.value?.message) ||
          'Không thể tải đề nghị điều chỉnh lương.';
      }

      setQueueErrors(nextErrors);
      if (okCount === 0) {
        setGlobalError('Không thể tải dữ liệu hàng chờ duyệt. Vui lòng kiểm tra kết nối mạng.');
      }
      setLoading(false);
      setRefreshing(false);
    },
    [currentUser, setAdvancesStore, setSwapRequestsStore],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAllQueues(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAllQueues]);

  // Pending subsets
  const pendingMissed = useMemo(
    () => missedClaims.filter((c) => c.status === 'Pending'),
    [missedClaims],
  );
  const pendingSwaps = useMemo(
    () => swaps.filter((r) => r.status === 'Pending_Admin' || r.status === 'Pending_User'),
    [swaps],
  );
  const pendingCash = useMemo(
    () =>
      handovers.filter(
        (h) =>
          h.reconcileStatus !== 'ManagerConfirmed' &&
          ((h.discrepancy ?? 0) !== 0 ||
            h.ackStatus === 'Disputed' ||
            h.reconcileStatus === 'Disputed'),
      ),
    [handovers],
  );
  const matchedUnconfirmedCash = useMemo(
    () =>
      handovers.filter(
        (h) =>
          h.reconcileStatus !== 'ManagerConfirmed' &&
          (h.discrepancy ?? 0) === 0 &&
          h.ackStatus !== 'Disputed' &&
          h.reconcileStatus !== 'Disputed',
      ),
    [handovers],
  );
  const openIncidents = useMemo(
    () => incidents.filter((i) => i.status === 'Open' || i.status === 'Investigating'),
    [incidents],
  );
  const pendingAdvances = useMemo(
    () => advances.filter((a) => a.status === 'Pending'),
    [advances],
  );
  const pendingAdjustments = useMemo(
    () => adjustments.filter((r) => r.status === 'Pending'),
    [adjustments],
  );

  const counts = {
    missed: pendingMissed.length,
    swaps: pendingSwaps.length,
    cash: pendingCash.length,
    incidents: openIncidents.length,
    advances: pendingAdvances.length,
    adjustments: pendingAdjustments.length,
    total:
      pendingMissed.length +
      pendingSwaps.length +
      pendingCash.length +
      openIncidents.length +
      pendingAdvances.length +
      pendingAdjustments.length,
  };

  // Search filter helper
  const q = searchQuery.trim().toLowerCase();
  const matchesQuery = useCallback(
    (...fields: Array<string | number | undefined>) => {
      if (!q) return true;
      return fields.some((f) => String(f ?? '').toLowerCase().includes(q));
    },
    [q],
  );

  const visibleMissed = useMemo(
    () =>
      pendingMissed.filter((c) =>
        matchesQuery(c.fullname, c.username, c.date, c.time, c.reason, c.type, c.shift),
      ),
    [pendingMissed, matchesQuery],
  );
  const visibleSwaps = useMemo(
    () =>
      pendingSwaps.filter((s) =>
        matchesQuery(s.fullname, s.username, s.targetFullname, s.dayName, s.date, s.shift, s.reason),
      ),
    [pendingSwaps, matchesQuery],
  );
  const visibleCash = useMemo(
    () =>
      pendingCash.filter((h) =>
        matchesQuery(h.fullname, h.username, h.date, h.shift, h.note, h.ackNote, h.ackBy),
      ),
    [pendingCash, matchesQuery],
  );
  const visibleIncidents = useMemo(
    () =>
      openIncidents.filter((i) =>
        matchesQuery(i.area, i.category, i.description, i.fullname, i.username, i.assignedTo),
      ),
    [openIncidents, matchesQuery],
  );
  const visibleAdvances = useMemo(
    () =>
      pendingAdvances.filter((a) =>
        matchesQuery(a.fullname, a.username, a.reason, a.amount),
      ),
    [pendingAdvances, matchesQuery],
  );
  const visibleAdjustments = useMemo(
    () =>
      pendingAdjustments.filter((r) =>
        matchesQuery(r.fullname, r.username, r.month, r.reason),
      ),
    [pendingAdjustments, matchesQuery],
  );

  // === 1-Tap Action Handlers ===

  const handleApproveMissed = async (claim: MissedClaimItem) => {
    if (!currentUser || busyKey) return;
    setBusyKey(`missed-${claim.id}`);
    try {
      const res = await callApi('APPROVE_MISSED_CHECKIN', {
        id: claim.id,
        adminUsername: currentUser.username || 'ADMIN',
      });
      if (res?.ok) {
        const rawApproved =
          res.data?.approvedType ||
          String(claim.canonicalType || claim.type || 'Vào ca').replace(/^chờ\s*duyệt\s*:\s*/i, '');
        const canonicalApproved: CanonicalPunchType = rawApproved.toLowerCase().includes('ra')
          ? 'Ra ca'
          : 'Vào ca';
        const latestLogs = useAppStore.getState().logs;
        setLogs(
          latestLogs.map((l) =>
            String(l.note || '').includes(`#${claim.id}`)
              ? {
                  ...l,
                  type: canonicalApproved,
                  status: 'Hợp lệ',
                  note: `[Bổ sung công #${claim.id} - Đã duyệt bởi ${currentUser.username}] ${claim.reason || ''}`,
                }
              : l,
          ),
        );
        setMissedClaims((prev) =>
          prev.map((c) => (c.id === claim.id ? { ...c, status: 'Approved' } : c)),
        );
        kgToast(`Đã duyệt công ${canonicalApproved} cho ${claim.fullname}`, 'success');
        void refreshAppData(true);
      } else {
        kgToast(res?.message || 'Không thể duyệt đơn bổ sung công.', 'error');
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleSwapDecision = async (req: SwapRequest, decision: 'APPROVE' | 'REJECT') => {
    if (!currentUser || busyKey) return;
    const isApprove = decision === 'APPROVE';
    const confirmed = await kgConfirm({
      title: isApprove ? 'Phê duyệt yêu cầu?' : 'Từ chối yêu cầu?',
      message: isApprove
        ? req.targetUsername === 'ADMIN'
          ? `Phê duyệt đơn xin nghỉ phép của ${req.fullname} (${req.dayName} ${req.date})?`
          : `Phê duyệt đổi ca ${req.shift} (${req.dayName} ${req.date}) giữa ${req.fullname} và ${req.targetFullname || 'đồng nghiệp'}?`
        : `Từ chối yêu cầu của ${req.fullname} (${req.dayName} ${req.date})?`,
      confirmLabel: isApprove ? 'Phê duyệt' : 'Từ chối',
      cancelLabel: 'Hủy',
      tone: isApprove ? 'primary' : 'danger',
    });
    if (!confirmed) return;

    setBusyKey(`swap-${req.id}`);
    try {
      const res = await callApi('APPROVE_SWAP', { swapId: req.id, decision });
      if (res?.ok) {
        const nextStatus = isApprove ? 'Approved' : 'Rejected';
        setSwaps((prev) => {
          const updated = prev.map((item) =>
            item.id === req.id ? { ...item, status: nextStatus } : item,
          );
          setSwapRequestsStore(updated);
          return updated;
        });
        kgToast(isApprove ? 'Đã duyệt đổi ca / nghỉ phép' : 'Đã từ chối yêu cầu', 'success');
      } else {
        kgToast(res?.message || 'Không thể cập nhật yêu cầu đổi ca.', 'error');
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleConfirmCashQuick = async (item: HandoverLedgerRecord) => {
    if (!currentUser || busyKey) return;
    setBusyKey(`cash-${item.id}`);
    try {
      const res = await callApi('REVIEW_HANDOVER', {
        role: currentUser.role,
        actorUsername: currentUser.username,
        actorFullname: currentUser.fullname,
        handoverId: item.id,
        decision: 'CONFIRM',
        managerNote: item.managerNote || 'Đã duyệt từ Hộp duyệt',
      });
      if (res?.ok) {
        setHandovers((prev) =>
          prev.map((h) =>
            h.id === item.id
              ? {
                  ...h,
                  reconcileStatus: 'ManagerConfirmed',
                  managerBy: currentUser.fullname || currentUser.username,
                }
              : h,
          ),
        );
        kgToast(`Đã duyệt chốt két ca ${item.shift || ''} (${item.date})`, 'success');
      } else {
        kgToast(res?.message || 'Không thể duyệt chốt két.', 'error');
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleBulkConfirmMatchedCash = async () => {
    if (!currentUser || matchedUnconfirmedCash.length === 0 || bulkConfirmingCash) return;
    const confirmed = await kgConfirm({
      title: 'Duyệt tất cả ca khớp két?',
      message: `Xác nhận duyệt ${matchedUnconfirmedCash.length} ca bàn giao không có chênh lệch?`,
      confirmLabel: `Duyệt ${matchedUnconfirmedCash.length} ca`,
      cancelLabel: 'Hủy',
      tone: 'primary',
    });
    if (!confirmed) return;

    setBulkConfirmingCash(true);
    try {
      const confirmedIds = new Set<string>();
      for (const item of matchedUnconfirmedCash) {
        const res = await callApi(
          'REVIEW_HANDOVER',
          {
            role: currentUser.role,
            actorUsername: currentUser.username,
            actorFullname: currentUser.fullname,
            handoverId: item.id,
            decision: 'CONFIRM',
            managerNote: item.managerNote || '',
          },
          { background: true },
        );
        if (res?.ok) confirmedIds.add(item.id);
      }
      if (confirmedIds.size > 0) {
        setHandovers((prev) =>
          prev.map((h) =>
            confirmedIds.has(h.id)
              ? {
                  ...h,
                  reconcileStatus: 'ManagerConfirmed',
                  managerBy: currentUser.fullname || currentUser.username,
                }
              : h,
          ),
        );
      }
      kgToast(
        `Đã duyệt ${confirmedIds.size}/${matchedUnconfirmedCash.length} ca khớp két`,
        confirmedIds.size === matchedUnconfirmedCash.length ? 'success' : 'warning',
      );
    } finally {
      setBulkConfirmingCash(false);
    }
  };

  const handleIncidentQuickStatus = async (
    inc: IncidentRecord,
    nextStatus: 'Investigating' | 'Resolved',
  ) => {
    if (!currentUser || busyKey) return;
    setBusyKey(`inc-${inc.id}`);
    try {
      const res = await callApi('UPDATE_INCIDENT', {
        role: currentUser.role,
        actorUsername: currentUser.username,
        actorFullname: currentUser.fullname,
        incidentId: inc.id,
        status: nextStatus,
        assignedTo: inc.assignedTo || currentUser.fullname || currentUser.username,
        resolutionNote: inc.resolutionNote || '',
        repairCost: Math.max(0, inc.repairCost || 0),
      });
      if (res?.ok) {
        setIncidents((prev) =>
          prev.map((item) =>
            item.id === inc.id
              ? {
                  ...item,
                  status: nextStatus,
                  assignedTo: item.assignedTo || currentUser.fullname || currentUser.username,
                }
              : item,
          ),
        );
        kgToast(
          nextStatus === 'Resolved' ? 'Đã đánh dấu sự cố hoàn tất' : 'Đã tiếp nhận xử lý sự cố',
          'success',
        );
      } else {
        kgToast(res?.message || 'Không thể cập nhật sự cố.', 'error');
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleAdvanceDecision = async (adv: AdvanceRequest, decision: 'APPROVE' | 'REJECT') => {
    if (!currentUser || busyKey) return;
    const isApprove = decision === 'APPROVE';
    const confirmed = await kgConfirm({
      title: isApprove ? 'Duyệt ứng lương?' : 'Từ chối ứng lương?',
      message: `${isApprove ? 'Duyệt' : 'Từ chối'} yêu cầu ứng ${formatVnd(adv.amount)} của ${adv.fullname}?`,
      confirmLabel: isApprove ? 'Duyệt chi' : 'Từ chối',
      cancelLabel: 'Hủy',
      tone: isApprove ? 'primary' : 'danger',
    });
    if (!confirmed) return;

    setBusyKey(`adv-${adv.id}`);
    try {
      const res = await callApi('APPROVE_ADVANCE', { advanceId: adv.id, decision });
      if (res?.ok) {
        const nextStatus = isApprove ? 'Approved' : 'Rejected';
        setAdvances((prev) => {
          const updated = prev.map((a) => (a.id === adv.id ? { ...a, status: nextStatus } : a));
          setAdvancesStore(updated);
          return updated;
        });
        kgToast(
          isApprove ? `Đã duyệt ứng ${formatVnd(adv.amount)} cho ${adv.fullname}` : 'Đã từ chối đơn ứng lương',
          'success',
        );
      } else {
        kgToast(res?.message || 'Không thể xử lý đơn ứng lương.', 'error');
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleSubmitNoteSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !noteSheet || noteBusy) return;
    const trimmed = noteText.trim();

    if (noteSheet.kind === 'cash_dispute' && trimmed.length < 4) {
      kgToast('Vui lòng nhập nội dung cần thu ngân giải trình (ít nhất 4 ký tự).', 'warning');
      return;
    }

    setNoteBusy(true);
    try {
      if (noteSheet.kind === 'missed_reject') {
        const finalReason = trimmed || 'Không hợp lệ / Thiếu xác nhận ca';
        const res = await callApi('REJECT_MISSED_CHECKIN', {
          id: noteSheet.claim.id,
          adminUsername: currentUser.username || 'ADMIN',
          reason: finalReason,
        });
        if (res?.ok) {
          const rawClean = String(
            noteSheet.claim.canonicalType || noteSheet.claim.type || 'Vào ca',
          ).replace(/^(chờ\s*duyệt|từ\s*chối)\s*:\s*/i, '');
          const cleanType: CanonicalPunchType = rawClean.toLowerCase().includes('ra')
            ? 'Ra ca'
            : 'Vào ca';
          const latestLogs = useAppStore.getState().logs;
          setLogs(
            latestLogs.map((l) =>
              String(l.note || '').includes(`#${noteSheet.claim.id}`)
                ? {
                    ...l,
                    type: `Từ chối: ${cleanType}`,
                    status: 'Từ chối bổ sung',
                    note: `[Từ chối bổ sung #${noteSheet.claim.id}] ${finalReason}`,
                  }
                : l,
            ),
          );
          setMissedClaims((prev) =>
            prev.map((c) => (c.id === noteSheet.claim.id ? { ...c, status: 'Rejected' } : c)),
          );
          kgToast(`Đã từ chối đơn bổ sung công của ${noteSheet.claim.fullname}`, 'info');
          setNoteSheet(null);
          setNoteText('');
        } else {
          kgToast(res?.message || 'Không thể từ chối đơn.', 'error');
        }
      } else if (noteSheet.kind === 'adjustment_review') {
        const res = await callApi('REVIEW_SALARY_ADJUSTMENT', {
          role: currentUser.role,
          username: currentUser.username,
          requestId: noteSheet.request.id,
          status: noteSheet.status,
          adminReply: trimmed,
        });
        if (res?.ok) {
          setAdjustments((prev) =>
            prev.map((r) =>
              r.id === noteSheet.request.id
                ? { ...r, status: noteSheet.status, adminReply: trimmed }
                : r,
            ),
          );
          kgToast(
            noteSheet.status === 'Approved'
              ? 'Đã duyệt & cập nhật mức lương mới'
              : 'Đã từ chối đề nghị điều chỉnh lương',
            'success',
          );
          setNoteSheet(null);
          setNoteText('');
        } else {
          kgToast(res?.message || 'Không thể xử lý đề nghị điều chỉnh.', 'error');
        }
      } else if (noteSheet.kind === 'cash_dispute') {
        const res = await callApi('REVIEW_HANDOVER', {
          role: currentUser.role,
          actorUsername: currentUser.username,
          actorFullname: currentUser.fullname,
          handoverId: noteSheet.handover.id,
          decision: 'DISPUTE',
          managerNote: trimmed,
        });
        if (res?.ok) {
          setHandovers((prev) =>
            prev.map((h) =>
              h.id === noteSheet.handover.id
                ? {
                    ...h,
                    reconcileStatus: 'Disputed',
                    managerBy: currentUser.fullname || currentUser.username,
                    managerNote: trimmed,
                  }
                : h,
            ),
          );
          kgToast('Đã gửi yêu cầu giải trình két', 'success');
          setNoteSheet(null);
          setNoteText('');
        } else {
          kgToast(res?.message || 'Không thể gửi yêu cầu giải trình.', 'error');
        }
      }
    } finally {
      setNoteBusy(false);
    }
  };

  const filterChips: Array<{
    id: InboxCategory;
    label: string;
    count: number;
    icon: typeof Inbox;
  }> = [
    { id: 'all', label: 'Tất cả chờ duyệt', count: counts.total, icon: Inbox },
    { id: 'missed', label: 'Bổ sung công', count: counts.missed, icon: Clock3 },
    { id: 'swaps', label: 'Đổi ca & Nghỉ', count: counts.swaps, icon: Repeat2 },
    { id: 'cash', label: 'Đối soát két', count: counts.cash, icon: Banknote },
    { id: 'incidents', label: 'Sự cố mở', count: counts.incidents, icon: Wrench },
    { id: 'advances', label: 'Ứng lương', count: counts.advances, icon: HandCoins },
    { id: 'adjustments', label: 'Đ/C lương', count: counts.adjustments, icon: CircleDollarSign },
  ];

  const totalFilteredInAllMode =
    visibleMissed.length +
    visibleSwaps.length +
    visibleCash.length +
    visibleIncidents.length +
    visibleAdvances.length +
    visibleAdjustments.length;

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-24 md:pb-12 max-w-6xl mx-auto">
      <KgModuleHero
        moduleId="admin-ops"
        title="Hộp Duyệt 1 Chạm"
        description="Gom toàn bộ yêu cầu bổ sung công, đổi ca, đối soát két, sự cố, ứng lương và điều chỉnh lương vào một hàng chờ thống nhất."
        eyebrow="Điều hành"
        actions={
          <div className="flex items-center gap-2">
            {matchedUnconfirmedCash.length > 0 && (
              <button
                type="button"
                disabled={bulkConfirmingCash}
                onClick={() => void handleBulkConfirmMatchedCash()}
                className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <CheckCheck size={14} />
                <span>
                  {bulkConfirmingCash
                    ? 'Đang duyệt...'
                    : `Duyệt ${matchedUnconfirmedCash.length} ca khớp`}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => void loadAllQueues(true)}
              disabled={refreshing || loading}
              className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text)] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing || loading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>
        }
      />

      {/* Category Filter Chips + Search */}
      <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-3 space-y-2.5 shadow-xs">
        <div
          className="flex gap-1.5 overflow-x-auto hide-scrollbar no-scrollbar pb-0.5"
          role="tablist"
          aria-label="Lọc danh mục hộp duyệt"
        >
          {filterChips.map((chip) => {
            const Icon = chip.icon;
            const active = category === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(chip.id)}
                className={`min-h-[44px] sm:min-h-[36px] shrink-0 px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[var(--kg-primary)] border-[var(--kg-primary)] text-white shadow-xs'
                    : 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <Icon size={14} className="shrink-0" />
                <span>{chip.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-black ${
                    active
                      ? 'bg-white/20 text-white'
                      : chip.count > 0
                        ? 'bg-[var(--kg-accent-soft)] text-[var(--kg-accent-ink)]'
                        : 'bg-[var(--kg-surface)] text-[var(--kg-text-soft)]'
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>

        {category !== 'cash' && category !== 'incidents' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm nhân viên, ngày, ca, lý do..."
                aria-label="Tìm trong hộp duyệt"
                className="w-full min-h-[44px] sm:min-h-[38px] pl-9 pr-8 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-base sm:text-xs font-medium text-[var(--kg-text)] focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Xóa tìm kiếm"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => navigateToHubSubTab('admin_ops', 'schedule')}
                className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text)] hover:border-[var(--kg-border-strong)] inline-flex items-center gap-1.5"
              >
                <CalendarClock size={14} />
                <span>Xếp lịch</span>
              </button>
              <button
                type="button"
                onClick={() => navigateToHubSubTab('admin_people_pay', 'payroll')}
                className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text)] hover:border-[var(--kg-border-strong)] inline-flex items-center gap-1.5"
              >
                <Banknote size={14} />
                <span>Bảng lương</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Partial Queue Errors */}
      {Object.keys(queueErrors).length > 0 && !globalError && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle size={15} className="shrink-0" />
            <span className="truncate">
              Một số hàng chờ chưa tải được ({Object.keys(queueErrors).length}/6):{' '}
              {Object.values(queueErrors)[0]}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void loadAllQueues(true)}
            className="min-h-[36px] px-3 py-1 rounded-lg bg-[var(--kg-primary)] text-white text-xs font-bold"
          >
            Tải lại
          </button>
        </div>
      )}

      {/* Main Content */}
      {globalError ? (
        <KgErrorState
          title="Không thể tải Hộp duyệt"
          description={globalError}
          onRetry={() => void loadAllQueues(true)}
        />
      ) : loading ? (
        <div className="space-y-3">
          <KgSkeleton className="h-28 w-full" />
          <KgSkeleton className="h-28 w-full" />
          <KgSkeleton className="h-28 w-full" />
        </div>
      ) : category === 'cash' ? (
        <CashAuditPanel
          handovers={handovers}
          loading={refreshing}
          error={queueErrors.cash}
          onRefresh={() => void loadAllQueues(true)}
          onHandoversChange={setHandovers}
          defaultFilter="ATTENTION"
        />
      ) : category === 'incidents' ? (
        <IncidentCenterPanel
          incidents={incidents}
          employees={employees}
          loading={refreshing}
          error={queueErrors.incidents}
          onRefresh={() => void loadAllQueues(true)}
          onIncidentsChange={setIncidents}
          defaultStatusFilter="Open"
        />
      ) : (
        <div className="space-y-4">
          {category === 'all' && totalFilteredInAllMode === 0 && (
            <KgEmptyState
              icon={CheckCircle2}
              title="Hộp duyệt đã sạch!"
              description={
                searchQuery
                  ? 'Không có yêu cầu chờ duyệt nào khớp từ khóa tìm kiếm.'
                  : 'Tất cả đơn bổ sung công, đổi ca, đối soát két, sự cố, ứng lương và điều chỉnh lương đều đã được xử lý.'
              }
              action={
                searchQuery
                  ? { label: 'Xóa tìm kiếm', onClick: () => setSearchQuery('') }
                  : { label: 'Làm mới kiểm tra', onClick: () => void loadAllQueues(true) }
              }
            />
          )}

          {/* 1. Missed Check-ins */}
          {(category === 'all' || category === 'missed') &&
            (visibleMissed.length > 0 || category === 'missed') && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--kg-text-muted)] flex items-center gap-1.5">
                    <Clock3 size={14} className="text-[var(--kg-accent-ink)]" />
                    Bổ sung chấm công ({visibleMissed.length})
                  </h3>
                </div>
                {visibleMissed.length === 0 ? (
                  <KgEmptyState
                    icon={CheckCircle2}
                    title="Không có đơn bổ sung công chờ duyệt"
                    description="Mọi giải trình quên chấm công đã được xử lý."
                  />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {visibleMissed.map((claim) => {
                      const isBusy = busyKey === `missed-${claim.id}`;
                      return (
                        <article
                          key={claim.id}
                          className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-extrabold text-[var(--kg-text)] truncate">
                                  {claim.fullname}
                                </p>
                                <p className="text-[11px] font-mono text-[var(--kg-text-muted)]">
                                  @{claim.username} · #{claim.id}
                                </p>
                              </div>
                              <KgStatusBadge variant="warning">{claim.type}</KgStatusBadge>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums font-bold text-[var(--kg-primary-ink)]">
                              <span className="px-2 py-0.5 rounded-lg bg-[var(--kg-primary-soft)]">
                                {claim.time} · {claim.effectiveDate || claim.date}
                              </span>
                              {claim.shift && (
                                <span className="px-2 py-0.5 rounded-lg bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]">
                                  Ca {claim.shift}
                                </span>
                              )}
                            </div>
                            {claim.reason && (
                              <p className="text-xs text-[var(--kg-text)] bg-[var(--kg-surface-soft)] rounded-xl px-3 py-2">
                                {claim.reason}
                              </p>
                            )}
                            {claim.proofImage && (
                              <a
                                href={claim.proofImage}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block text-xs font-bold text-[var(--kg-primary-ink)] underline"
                              >
                                Xem ảnh minh chứng
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-[var(--kg-border)]">
                            <button
                              type="button"
                              disabled={Boolean(busyKey)}
                              onClick={() => {
                                setNoteText('');
                                setNoteSheet({ kind: 'missed_reject', claim });
                              }}
                              className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              <X size={14} /> Từ chối
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busyKey)}
                              onClick={() => void handleApproveMissed(claim)}
                              className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                            >
                              <Check size={14} /> {isBusy ? 'Đang duyệt...' : 'Duyệt 1 chạm'}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

          {/* 2. Shift Swaps & Leaves */}
          {(category === 'all' || category === 'swaps') &&
            (visibleSwaps.length > 0 || category === 'swaps') && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--kg-text-muted)] flex items-center gap-1.5">
                    <Repeat2 size={14} className="text-[var(--kg-primary-ink)]" />
                    Đổi ca &amp; Xin nghỉ phép ({visibleSwaps.length})
                  </h3>
                </div>
                {visibleSwaps.length === 0 ? (
                  <KgEmptyState
                    icon={CheckCircle2}
                    title="Không có yêu cầu đổi ca / nghỉ phép"
                    description="Mọi đơn đổi ca và xin nghỉ đã được xử lý."
                  />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {visibleSwaps.map((req) => {
                      const isLeave = req.targetUsername === 'ADMIN';
                      const isBusy = busyKey === `swap-${req.id}`;
                      return (
                        <article
                          key={req.id}
                          className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-extrabold text-[var(--kg-text)] truncate">
                                  {req.fullname}
                                  {!isLeave && req.targetFullname ? ` ⇄ ${req.targetFullname}` : ''}
                                </p>
                                <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                                  {req.dayName} · {req.date} · Ca {req.shift}
                                </p>
                              </div>
                              <KgStatusBadge variant={isLeave ? 'warning' : 'info'}>
                                {isLeave ? 'Xin nghỉ' : 'Đổi ca'}
                              </KgStatusBadge>
                            </div>
                            {req.reason && (
                              <p className="text-xs text-[var(--kg-text)] bg-[var(--kg-surface-soft)] rounded-xl px-3 py-2">
                                {req.reason}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-[var(--kg-border)]">
                            <button
                              type="button"
                              disabled={Boolean(busyKey)}
                              onClick={() => void handleSwapDecision(req, 'REJECT')}
                              className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              <X size={14} /> Từ chối
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busyKey)}
                              onClick={() => void handleSwapDecision(req, 'APPROVE')}
                              className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                            >
                              <Check size={14} /> {isBusy ? 'Đang xử lý...' : 'Phê duyệt'}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

          {/* 3. Cash Handover Disputes (Compact cards in ALL mode; full CashAuditPanel on cash tab) */}
          {category === 'all' && visibleCash.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between px-0.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--kg-text-muted)] flex items-center gap-1.5">
                  <Banknote size={14} className="text-amber-600 dark:text-amber-400" />
                  Đối soát két cần kiểm tra ({visibleCash.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setCategory('cash')}
                  className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline"
                >
                  Mở sổ két đầy đủ →
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {visibleCash.map((item) => {
                  const diff = item.discrepancy ?? 0;
                  const isBusy = busyKey === `cash-${item.id}`;
                  return (
                    <article
                      key={item.id}
                      className="bg-[var(--kg-surface)] border border-amber-500/40 rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-extrabold text-[var(--kg-text)] truncate">
                              {item.fullname || item.username}
                            </p>
                            <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                              {item.shift || 'Ca trực'} · {item.date}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-lg text-xs font-mono tabular-nums font-black ${
                              diff < 0
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {formatSignedVnd(diff)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                          <div className="rounded-xl bg-[var(--kg-surface-soft)] px-2.5 py-1.5">
                            <span className="block font-sans text-[10px] text-[var(--kg-text-muted)]">
                              Lý thuyết
                            </span>
                            <span className="font-bold text-[var(--kg-text)]">
                              {formatVndCurrency(item.expectedCash ?? item.cashAmount)}
                            </span>
                          </div>
                          <div className="rounded-xl bg-[var(--kg-surface-soft)] px-2.5 py-1.5">
                            <span className="block font-sans text-[10px] text-[var(--kg-text-muted)]">
                              Thực giao
                            </span>
                            <span className="font-bold text-[var(--kg-text)]">
                              {formatVndCurrency(item.closingCash ?? item.cashAmount)}
                            </span>
                          </div>
                        </div>
                        {(item.ackNote || item.note) && (
                          <p className="text-xs text-[var(--kg-text-muted)] line-clamp-2">
                            {item.ackNote || item.note}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-[var(--kg-border)]">
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => {
                            setNoteText(item.managerNote || '');
                            setNoteSheet({ kind: 'cash_dispute', handover: item });
                          }}
                          className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-bold disabled:opacity-50"
                        >
                          Yêu cầu giải trình
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => void handleConfirmCashQuick(item)}
                          className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold disabled:opacity-50"
                        >
                          {isBusy ? 'Đang lưu...' : 'Duyệt chốt két'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* 4. Open Incidents (Compact cards in ALL mode; full IncidentCenterPanel on incidents tab) */}
          {category === 'all' && visibleIncidents.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between px-0.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--kg-text-muted)] flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-rose-600 dark:text-rose-400" />
                  Sự cố đang mở / xử lý ({visibleIncidents.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setCategory('incidents')}
                  className="text-xs font-bold text-[var(--kg-primary-ink)] hover:underline"
                >
                  Chi tiết sự cố 4 bước →
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {visibleIncidents.map((inc) => {
                  const isBusy = busyKey === `inc-${inc.id}`;
                  return (
                    <article
                      key={inc.id}
                      className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-[var(--kg-surface-soft)] text-xs font-black text-[var(--kg-text)]">
                              {inc.area || 'Toàn quán'}
                            </span>
                            <span className="text-sm font-extrabold text-[var(--kg-text)]">
                              {inc.category}
                            </span>
                          </div>
                          <KgStatusBadge
                            variant={inc.severity === 'urgent' ? 'error' : 'warning'}
                          >
                            {inc.status === 'Investigating' ? 'Đang xử lý' : 'Mới báo'}
                          </KgStatusBadge>
                        </div>
                        <p className="text-[11px] text-[var(--kg-text-muted)]">
                          {inc.fullname || inc.username} · {inc.date}
                        </p>
                        <p className="text-xs text-[var(--kg-text)] bg-[var(--kg-surface-soft)] rounded-xl px-3 py-2 line-clamp-2">
                          {inc.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-[var(--kg-border)]">
                        {inc.status !== 'Investigating' && (
                          <button
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => void handleIncidentQuickStatus(inc, 'Investigating')}
                            className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-bold disabled:opacity-50"
                          >
                            Nhận xử lý
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => void handleIncidentQuickStatus(inc, 'Resolved')}
                          className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold disabled:opacity-50"
                        >
                          {isBusy ? 'Đang lưu...' : 'Đánh dấu đã xử lý'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {/* 5. Salary Advances */}
          {(category === 'all' || category === 'advances') &&
            (visibleAdvances.length > 0 || category === 'advances') && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--kg-text-muted)] flex items-center gap-1.5">
                    <HandCoins size={14} className="text-emerald-600 dark:text-emerald-400" />
                    Yêu cầu ứng lương ({visibleAdvances.length})
                  </h3>
                </div>
                {visibleAdvances.length === 0 ? (
                  <KgEmptyState
                    icon={CheckCircle2}
                    title="Không có đơn ứng lương chờ duyệt"
                    description="Mọi yêu cầu ứng lương đã được phê duyệt hoặc từ chối."
                  />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {visibleAdvances.map((adv) => {
                      const isBusy = busyKey === `adv-${adv.id}`;
                      return (
                        <article
                          key={adv.id}
                          className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-extrabold text-[var(--kg-text)] truncate">
                                  {adv.fullname}
                                </p>
                                <p className="text-[11px] font-mono text-[var(--kg-text-muted)]">
                                  @{adv.username}
                                </p>
                              </div>
                              <span className="text-base font-black font-mono tabular-nums text-[var(--kg-accent-ink)] shrink-0">
                                {formatVnd(adv.amount)}
                              </span>
                            </div>
                            {adv.reason && (
                              <p className="text-xs text-[var(--kg-text)] bg-[var(--kg-surface-soft)] rounded-xl px-3 py-2">
                                {adv.reason}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t border-[var(--kg-border)]">
                            <button
                              type="button"
                              disabled={Boolean(busyKey)}
                              onClick={() => void handleAdvanceDecision(adv, 'REJECT')}
                              className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              <X size={14} /> Từ chối
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(busyKey)}
                              onClick={() => void handleAdvanceDecision(adv, 'APPROVE')}
                              className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                            >
                              <Check size={14} /> {isBusy ? 'Đang xử lý...' : 'Duyệt ứng'}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

          {/* 6. Salary Adjustments */}
          {(category === 'all' || category === 'adjustments') &&
            (visibleAdjustments.length > 0 || category === 'adjustments') && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--kg-text-muted)] flex items-center gap-1.5">
                    <CircleDollarSign size={14} className="text-[var(--kg-accent-ink)]" />
                    Đề nghị điều chỉnh lương ({visibleAdjustments.length})
                  </h3>
                </div>
                {visibleAdjustments.length === 0 ? (
                  <KgEmptyState
                    icon={CheckCircle2}
                    title="Không có đề nghị điều chỉnh lương"
                    description="Mọi đề nghị điều chỉnh đơn giá lương đã được xử lý."
                  />
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {visibleAdjustments.map((req) => (
                      <article
                        key={req.id}
                        className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 shadow-xs flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-extrabold text-[var(--kg-text)] truncate">
                                {req.fullname}
                              </p>
                              <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                                @{req.username} · {salaryMonthLabel(req.month)}
                              </p>
                            </div>
                            <KgStatusBadge variant="warning">Chờ duyệt</KgStatusBadge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl bg-[var(--kg-surface-soft)] p-2.5 border border-[var(--kg-border)]">
                              <span className="block text-[10px] font-bold uppercase text-[var(--kg-text-muted)]">
                                Hiện tại
                              </span>
                              <span className="font-mono tabular-nums font-extrabold text-[var(--kg-text)]">
                                {formatVnd(req.currentAmount)}
                              </span>
                              <span className="block text-[10px] text-[var(--kg-text-muted)]">
                                {salaryTypeLabel(req.currentType)}
                              </span>
                            </div>
                            <div className="rounded-xl bg-[var(--kg-surface-soft)] p-2.5 border border-[var(--kg-accent)]/35">
                              <span className="block text-[10px] font-bold uppercase text-[var(--kg-accent-ink)]">
                                Đề xuất
                              </span>
                              <span className="font-mono tabular-nums font-extrabold text-[var(--kg-accent-ink)]">
                                {formatVnd(req.proposedAmount)}
                              </span>
                              <span className="block text-[10px] text-[var(--kg-accent-ink)]">
                                {salaryTypeLabel(req.proposedType)}
                              </span>
                            </div>
                          </div>
                          {req.reason && (
                            <p className="text-xs text-[var(--kg-text)]">{req.reason}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-[var(--kg-border)]">
                          <button
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => {
                              setNoteText('');
                              setNoteSheet({
                                kind: 'adjustment_review',
                                request: req,
                                status: 'Rejected',
                              });
                            }}
                            className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold inline-flex items-center justify-center gap-1.5"
                          >
                            <X size={14} /> Từ chối
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(busyKey)}
                            onClick={() => {
                              setNoteText('');
                              setNoteSheet({
                                kind: 'adjustment_review',
                                request: req,
                                status: 'Approved',
                              });
                            }}
                            className="flex-1 min-h-[44px] sm:min-h-[38px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 shadow-xs"
                          >
                            <Check size={14} /> Duyệt &amp; cập nhật
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
        </div>
      )}

      {/* Controlled Bottom Sheet for Reject Reason / Dispute Note / Adjustment Reply */}
      <KgBottomSheet
        isOpen={Boolean(noteSheet)}
        onClose={() => {
          if (!noteBusy) setNoteSheet(null);
        }}
        title={
          noteSheet?.kind === 'missed_reject'
            ? `Từ chối bổ sung công — ${noteSheet.claim.fullname}`
            : noteSheet?.kind === 'cash_dispute'
              ? `Yêu cầu giải trình két — ${noteSheet.handover.fullname || noteSheet.handover.username}`
              : noteSheet?.kind === 'adjustment_review'
                ? noteSheet.status === 'Approved'
                  ? `Duyệt điều chỉnh lương — ${noteSheet.request.fullname}`
                  : `Từ chối điều chỉnh lương — ${noteSheet.request.fullname}`
                : 'Phản hồi duyệt'
        }
      >
        <form onSubmit={(e) => void handleSubmitNoteSheet(e)} className="space-y-4">
          <KgTextarea
            label={
              noteSheet?.kind === 'cash_dispute'
                ? 'Nội dung yêu cầu thu ngân giải trình *'
                : noteSheet?.kind === 'missed_reject'
                  ? 'Lý do từ chối'
                  : 'Ghi chú phản hồi (tùy chọn)'
            }
            placeholder={
              noteSheet?.kind === 'cash_dispute'
                ? 'VD: Thiếu 120.000đ so với POS, vui lòng bổ sung ảnh phiếu chi...'
                : 'Nhập lý do hoặc ghi chú cho nhân viên...'
            }
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            required={noteSheet?.kind === 'cash_dispute'}
          />
          <div className="flex gap-2.5 pt-1">
            <KgButton
              type="button"
              variant="secondary"
              className="flex-1"
              disabled={noteBusy}
              onClick={() => setNoteSheet(null)}
            >
              Hủy
            </KgButton>
            <KgButton
              type="submit"
              variant={
                noteSheet?.kind === 'adjustment_review' && noteSheet.status === 'Approved'
                  ? 'primary'
                  : 'danger'
              }
              className="flex-1"
              loading={noteBusy}
            >
              {noteSheet?.kind === 'adjustment_review' && noteSheet.status === 'Approved'
                ? 'Xác nhận duyệt'
                : noteSheet?.kind === 'cash_dispute'
                  ? 'Gửi yêu cầu'
                  : 'Xác nhận từ chối'}
            </KgButton>
          </div>
        </form>
      </KgBottomSheet>
    </div>
  );
}
