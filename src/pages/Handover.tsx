import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import {
  AlertTriangle,
  FileText,
  Banknote,
  ShieldAlert,
  CheckCircle2,
  History,
  RefreshCw,
  CheckCheck,
  Camera,
  X,
  Wrench,
  RotateCcw,
  ShieldCheck,
  Calculator,
  UserCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KgModuleHero } from '../components/KgDesignSystem';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import { isWorkEligible } from '../utils/employment';
import { fileToBase64, uploadImageToDrive } from '../utils/helpers';
import {
  calculateCashReconciliation,
  formatSignedVnd,
  formatVndCurrency,
  formatVndInput,
  INCIDENT_STATUS_STEPS,
  normalizeIncidentStatus,
  parseVndAmount,
  type HandoverLedgerRecord,
  type IncidentRecord,
  type IncidentSeverity,
} from '../utils/operationsReconciliation';

const LOCAL_HANDOVER_META_KEY = 'kg_handover_meta_v2';
const LOCAL_INCIDENTS_CACHE_KEY = 'kg_incidents_cache_v2';

const INCIDENT_AREAS = ['Khu A', 'Khu B', 'Khu C', 'Khu D&E', 'Bếp & Kho', 'Toàn quán'] as const;

const SEVERITY_OPTIONS: { id: IncidentSeverity; label: string; activeClass: string }[] = [
  {
    id: 'normal',
    label: 'Bình thường',
    activeClass: 'border-slate-500 bg-slate-500/10 text-slate-700 dark:text-slate-200',
  },
  {
    id: 'high',
    label: 'Quan trọng',
    activeClass: 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  {
    id: 'urgent',
    label: 'Khẩn cấp',
    activeClass: 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-300',
  },
];

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

function readLocalIncidents(): IncidentRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_INCIDENTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalIncidents(list: IncidentRecord[]) {
  try {
    localStorage.setItem(LOCAL_INCIDENTS_CACHE_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {
    // Ignore storage quota errors
  }
}

export default function Handover() {
  const currentUser = useAppStore((state) => state.currentUser);
  const shiftName = useAppStore((state) => state.shiftName);
  const setUpdating = useAppStore((state) => state.setUpdating);
  const setLoading = useAppStore((state) => state.setLoading);
  const setTodayHandoverDone = useAppStore((state) => state.setTodayHandoverDone);

  const [activeTab, setActiveTab] = useState<'handover' | 'incident' | 'history'>('handover');

  // 2-Way Cash Reconciliation Form (null openingCashOverride = auto carryover from latest shift)
  const [openingCashOverride, setOpeningCashOverride] = useState<string | null>(null);
  const [posCashRevenue, setPosCashRevenue] = useState('');
  const [cashExpense, setCashExpense] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [handoverNote, setHandoverNote] = useState('');

  // Incoming Cashier Dispute Inline Panel
  const [disputeOpenForId, setDisputeOpenForId] = useState<string | null>(null);
  const [disputeCountedCash, setDisputeCountedCash] = useState('');
  const [disputeReason, setDisputeReason] = useState('');

  // 4-State Incident Form & Live Tracker
  const [incidentArea, setIncidentArea] = useState<string>('Khu A');
  const [incidentSeverity, setIncidentSeverity] = useState<IncidentSeverity>('normal');
  const [incidentCategory, setIncidentCategory] = useState('');
  const [incidentDesc, setIncidentDesc] = useState('');
  const [incidentPhotoPreview, setIncidentPhotoPreview] = useState<string>('');
  const [incidentPhotoUrl, setIncidentPhotoUrl] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [incidents, setIncidents] = useState<IncidentRecord[]>(() => readLocalIncidents());
  const [loadingIncidents, setLoadingIncidents] = useState(false);

  // Recent handovers state
  const [handovers, setHandovers] = useState<HandoverLedgerRecord[]>([]);
  const [loadingHandovers, setLoadingHandovers] = useState(false);
  const [ackHandoverId, setAckHandoverId] = useState<string | null>(() =>
    localStorage.getItem('kg_ack_handover_id')
  );
  const [localMeta, setLocalMeta] = useState<Record<string, Partial<HandoverLedgerRecord>>>(() =>
    readLocalHandoverMeta()
  );

  const loadHandovers = useCallback(async () => {
    setLoadingHandovers(true);
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
      }
    } catch {
      // Background fail-safe
    } finally {
      setLoadingHandovers(false);
    }
  }, []);

  const loadIncidents = useCallback(async () => {
    setLoadingIncidents(true);
    try {
      const res = await callApi(
        'GET_INCIDENTS',
        { username: currentUser?.username, role: currentUser?.role },
        { background: true, cacheTtlMs: 4000 }
      );
      if (res?.ok && Array.isArray(res.data?.incidents)) {
        const serverList: IncidentRecord[] = res.data.incidents.map((inc: IncidentRecord) => ({
          ...inc,
          status: normalizeIncidentStatus(inc.status),
        }));
        const cached = readLocalIncidents();
        // Preserve locally submitted incidents if legacy GAS has not been clasp-pushed yet
        const merged =
          serverList.length > 0
            ? serverList
            : cached;
        setIncidents(merged);
        if (serverList.length > 0) {
          writeLocalIncidents(serverList);
        }
      }
    } catch {
      // Keep local incident cache on network error
    } finally {
      setLoadingIncidents(false);
    }
  }, [currentUser?.role, currentUser?.username]);

  useEffect(() => {
    loadHandovers();
    loadIncidents();
  }, [loadHandovers, loadIncidents]);

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
    [effectiveOpeningCash, posCashRevenue, cashExpense, cashAmount, previousClosingCash]
  );

  const handleAcknowledgeCash = async (
    handover: HandoverLedgerRecord,
    mode: 'Accepted' | 'Disputed'
  ) => {
    const ackBy = currentUser?.fullname || currentUser?.username || 'Thu ngân ca sau';
    const countedNum =
      mode === 'Disputed'
        ? parseVndAmount(disputeCountedCash)
        : handover.closingCash ?? parseVndAmount(handover.cashAmount);

    if (mode === 'Disputed') {
      if (!disputeCountedCash.trim()) {
        Swal.fire('Thiếu số tiền kiểm thực tế', 'Vui lòng nhập số tiền mặt bạn đếm thực tế khi nhận két.', 'warning');
        return;
      }
      if (disputeReason.trim().length < 4) {
        Swal.fire('Thiếu ghi chú lệch két', 'Vui lòng mô tả ngắn gọn chênh lệch khi nhận bàn giao.', 'warning');
        return;
      }
    }

    const now = new Date();
    const ackAt = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const nextReconcileStatus =
      mode === 'Disputed' ? 'Disputed' : handover.reconcileStatus || 'Matched';

    localStorage.setItem('kg_ack_handover_id', handover.id);
    setAckHandoverId(handover.id);

    const patch: Partial<HandoverLedgerRecord> = {
      ackBy,
      ackAt,
      ackStatus: mode,
      ackNote: mode === 'Disputed' ? disputeReason.trim() : '',
      countedCash: countedNum,
      reconcileStatus: nextReconcileStatus,
    };

    const nextMeta = { ...localMeta, [handover.id]: { ...(localMeta[handover.id] || {}), ...patch } };
    setLocalMeta(nextMeta);
    writeLocalHandoverMeta(nextMeta);

    setHandovers((prev) =>
      prev.map((item) => (item.id === handover.id ? { ...item, ...patch } : item))
    );
    setDisputeOpenForId(null);
    setDisputeCountedCash('');
    setDisputeReason('');

    // If incoming cashier counted a different actual amount, carry over their actual count to openingCash
    if (mode === 'Disputed' && countedNum >= 0) {
      setOpeningCashOverride(formatVndInput(countedNum));
    }

    callApi(
      'ACKNOWLEDGE_HANDOVER',
      {
        handoverId: handover.id,
        ackBy,
        username: currentUser?.username,
        fullname: currentUser?.fullname,
        ackStatus: mode,
        countedCash: countedNum,
        ackNote: mode === 'Disputed' ? disputeReason.trim() : '',
      },
      { background: true }
    ).catch(() => {});

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: mode === 'Disputed' ? 'warning' : 'success',
      title:
        mode === 'Disputed'
          ? `Đã báo lệch két (${formatVndCurrency(countedNum)}) cho Quản lý`
          : `Đã xác nhận nhận đủ ${handover.cashAmount} đ`,
      showConfirmButton: false,
      timer: 2800,
    });
  };

  const submitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashAmount.trim()) {
      Swal.fire('Thiếu thông tin', 'Vui lòng nhập số tiền mặt kiểm thực tế trong két', 'warning');
      return;
    }

    if (recon.requiresExplanation && handoverNote.trim().length < 5) {
      const reasonPrompt =
        recon.discrepancy !== 0
          ? `Két đang lệch ${formatSignedVnd(recon.discrepancy)} so với lý thuyết.`
          : recon.openingMismatch !== 0
            ? `Số dư đầu ca lệch ${formatSignedVnd(recon.openingMismatch)} so với ca trước.`
            : `Trong ca có khoản chi tiền mặt tại quầy (${formatVndCurrency(recon.cashExpense)}).`;
      Swal.fire(
        'Cần giải trình đối soát két',
        `${reasonPrompt} Vui lòng ghi rõ lý do vào ô Ghi chú (tối thiểu 5 ký tự).`,
        'warning'
      );
      return;
    }

    setUpdating(true);
    setLoading(true, 'Đang gửi đối soát & bàn giao két...');
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

        Swal.fire({
          title: 'Đã chốt bàn giao két!',
          text:
            recon.discrepancy === 0
              ? `Két khớp chuẩn ${formatVndCurrency(recon.closingCash)}.`
              : `Đã ghi nhận bàn giao két (${formatSignedVnd(recon.discrepancy)}) để Quản lý đối soát.`,
          icon: 'success',
          confirmButtonColor: '#10b981',
        });

        setOpeningCashOverride(null);
        setPosCashRevenue('');
        setCashExpense('');
        setCashAmount('');
        setHandoverNote('');
        loadHandovers();
      } else {
        Swal.fire('Lỗi', res?.message || 'Không thể gửi bàn giao ca. Vui lòng thử lại.', 'error');
      }
    } catch {
      Swal.fire('Lỗi kết nối', 'Không thể kết nối máy chủ. Vui lòng kiểm tra lại mạng.', 'error');
    } finally {
      setUpdating(false);
      setLoading(false);
    }
  };

  const handleIncidentPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const base64 = await fileToBase64(file);
      setIncidentPhotoPreview(base64);
      const uploadedUrl = await uploadImageToDrive(
        base64,
        `incident_${currentUser?.username || 'staff'}_${Date.now()}.webp`
      );
      if (uploadedUrl) {
        setIncidentPhotoUrl(uploadedUrl);
      }
    } catch {
      Swal.fire('Lỗi ảnh', 'Không thể xử lý ảnh chụp sự cố. Bạn vẫn có thể gửi báo cáo chữ.', 'warning');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const submitIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentCategory) {
      Swal.fire('Thiếu thông tin', 'Vui lòng chọn phân loại sự cố', 'warning');
      return;
    }
    if (!incidentDesc.trim()) {
      Swal.fire('Thiếu thông tin', 'Vui lòng mô tả chi tiết sự cố', 'warning');
      return;
    }

    setUpdating(true);
    setLoading(true, 'Đang gửi báo cáo sự cố...');
    try {
      const res = await callApi('SUBMIT_INCIDENT', {
        username: currentUser?.username,
        fullname: currentUser?.fullname,
        shift: shiftName,
        area: incidentArea,
        severity: incidentSeverity,
        category: incidentCategory,
        description: incidentDesc.trim(),
        photoUrl: incidentPhotoUrl,
      });

      if (res?.ok) {
        const now = new Date();
        const vnDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        const optimisticIncident: IncidentRecord = {
          id: res.data?.id || `INC_LOCAL_${Date.now()}`,
          date: res.data?.date || vnDate,
          shift: shiftName,
          area: incidentArea,
          severity: incidentSeverity,
          username: currentUser?.username || '',
          fullname: currentUser?.fullname || currentUser?.username || '',
          category: incidentCategory,
          description: incidentDesc.trim(),
          photoUrl: incidentPhotoUrl || undefined,
          status: 'Open',
          timestamp: now.toISOString(),
        };
        const updatedList = [optimisticIncident, ...incidents];
        setIncidents(updatedList);
        writeLocalIncidents(updatedList);

        Swal.fire({
          title: 'Đã gửi báo cáo sự cố!',
          text: 'Sự cố đã vào hàng đợi 4 bước xử lý của Quản lý.',
          icon: 'success',
          confirmButtonColor: '#10b981',
        });
        setIncidentCategory('');
        setIncidentDesc('');
        setIncidentSeverity('normal');
        setIncidentPhotoPreview('');
        setIncidentPhotoUrl('');
        loadIncidents();
      } else {
        Swal.fire('Lỗi', res?.message || 'Không thể gửi báo cáo sự cố.', 'error');
      }
    } catch {
      Swal.fire('Lỗi kết nối', 'Không thể kết nối máy chủ. Vui lòng thử lại.', 'error');
    } finally {
      setUpdating(false);
      setLoading(false);
    }
  };

  if (currentUser && !isWorkEligible(currentUser)) {
    return <EmploymentStatusNotice user={currentUser} actionLabel="thực hiện bàn giao ca" />;
  }

  const latestAckBy = latestHandover
    ? latestHandover.ackBy || localMeta[latestHandover.id]?.ackBy
    : '';
  const latestAckAt = latestHandover
    ? latestHandover.ackAt || localMeta[latestHandover.id]?.ackAt
    : '';
  const latestAckStatus = latestHandover
    ? latestHandover.ackStatus ||
      localMeta[latestHandover.id]?.ackStatus ||
      (latestAckBy || ackHandoverId === latestHandover.id ? 'Accepted' : '')
    : '';
  const openIncidentCount = incidents.filter(
    (inc) => inc.status === 'Open' || inc.status === 'Investigating'
  ).length;

  return (
    <div className="h-full flex flex-col space-y-4 pb-16 animate-fade-in">
      <KgModuleHero
        moduleId="handover"
        title="Đối Soát Két Thu Ngân & Sự Cố Ca"
        description="Đối soát két tiền mặt 2 chiều theo doanh thu POS CukCuk và theo dõi xử lý sự cố 4 bước."
        eyebrow="Vận hành F&B"
        features={['Đối soát POS 2 chiều', 'Tự động kết chuyển đầu ca', 'Sự cố 4 trạng thái']}
        tipTitle="Quy chuẩn Đối soát Két Thu ngân 2 chiều"
        tips={[
          'Ca nhận két kiểm đếm tiền mặt thực tế: bấm "Nhận đủ két" hoặc "Báo lệch két khi nhận" ngay đầu ca.',
          'Số dư đầu ca được tự động kết chuyển từ số dư cuối ca trước.',
          'Công thức chuẩn: Đầu ca + Doanh thu tiền mặt POS - Chi tại quầy = Lý thuyết trong két.',
          'Nếu chênh lệch khác 0 đ hoặc có khoản chi tại quầy, bắt buộc ghi rõ lý do để Quản lý duyệt chốt.',
        ]}
      />

      <div className="relative z-20 flex-1 flex flex-col space-y-4">
        {/* Segmented Navigation Tabs */}
        <div className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-1 rounded-xl flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('handover')}
            className={`flex-1 flex items-center justify-center py-2 rounded-lg text-xs sm:text-sm transition-colors select-none min-h-[38px] ${
              activeTab === 'handover'
                ? 'bg-[var(--kg-surface)] text-[var(--kg-text)] font-bold shadow-soft border border-[var(--kg-border)]'
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-medium'
            }`}
          >
            <Banknote size={15} className="mr-1.5 text-[var(--kg-primary)]" /> Bàn giao quỹ
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center py-2 rounded-lg text-xs sm:text-sm transition-colors select-none min-h-[38px] ${
              activeTab === 'history'
                ? 'bg-[var(--kg-surface)] text-[var(--kg-text)] font-bold shadow-soft border border-[var(--kg-border)]'
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-medium'
            }`}
          >
            <History size={15} className="mr-1.5 text-[var(--kg-info)]" /> Nhật ký két
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('incident')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs sm:text-sm transition-colors select-none min-h-[38px] ${
              activeTab === 'incident'
                ? 'bg-[var(--kg-surface)] text-[var(--kg-text)] font-bold shadow-soft border border-[var(--kg-border)]'
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-medium'
            }`}
          >
            <ShieldAlert size={15} className="text-[var(--kg-danger)]" />
            <span>Báo sự cố</span>
            {openIncidentCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black tabular-nums bg-rose-500/15 text-rose-600 dark:text-rose-300">
                {openIncidentCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
          <AnimatePresence mode="wait">
            {/* TAB 1: 2-WAY CASH HANDOVER & RECONCILIATION */}
            {activeTab === 'handover' && (
              <motion.div
                key="handover"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {/* Incoming Shift 2-Way Verification Card */}
                {latestHandover ? (
                  <div
                    className={`bg-[var(--kg-surface)] border-2 rounded-2xl p-4 shadow-sm space-y-3 ${
                      latestAckStatus === 'Disputed' || latestHandover.reconcileStatus === 'Disputed'
                        ? 'border-amber-500/40'
                        : 'border-emerald-500/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--kg-border)]">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            latestAckStatus === 'Disputed'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500 animate-pulse'
                          }`}
                        />
                        <h4 className="font-black text-xs uppercase tracking-wider text-[var(--kg-text)]">
                          Két bàn giao từ {latestHandover.shift || 'Ca trước'}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        {latestHandover.reconcileStatus === 'ManagerConfirmed' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                            <ShieldCheck size={12} /> Quản lý đã chốt
                          </span>
                        )}
                        <span className="text-[11px] font-mono tabular-nums font-bold text-[var(--kg-text-muted)]">
                          {latestHandover.date}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-black font-mono tabular-nums tracking-tight text-[var(--kg-success)]">
                            {latestHandover.cashAmount} đ
                          </span>
                          {typeof latestHandover.discrepancy === 'number' &&
                            latestHandover.discrepancy !== 0 && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-mono tabular-nums font-bold bg-rose-500/15 text-rose-600 dark:text-rose-300">
                                Ca trước lệch: {formatSignedVnd(latestHandover.discrepancy)}
                              </span>
                            )}
                        </div>
                        <p className="text-xs text-[var(--kg-text-muted)] font-medium">
                          Người giao:{' '}
                          <b className="text-[var(--kg-text)]">
                            {latestHandover.fullname || latestHandover.username}
                          </b>
                          {latestHandover.note ? ` • "${latestHandover.note}"` : ''}
                        </p>
                      </div>

                      {latestAckStatus ? (
                        <div
                          className={`inline-flex flex-col sm:items-end gap-0.5 px-3.5 py-2 rounded-xl border ${
                            latestAckStatus === 'Disputed'
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-800 dark:text-amber-300'
                              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
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
                            <span className="text-[10px] font-semibold opacity-90">
                              Ca nhận: {latestAckBy}
                              {latestAckAt ? ` (${latestAckAt})` : ''}
                            </span>
                          )}
                          {latestAckStatus === 'Disputed' &&
                            (latestHandover.countedCash !== undefined ||
                              localMeta[latestHandover.id]?.countedCash !== undefined) && (
                              <span className="text-[11px] font-mono tabular-nums font-bold">
                                Đếm thực tế:{' '}
                                {formatVndCurrency(
                                  latestHandover.countedCash ??
                                    localMeta[latestHandover.id]?.countedCash
                                )}
                              </span>
                            )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAcknowledgeCash(latestHandover, 'Accepted')}
                            className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 min-h-[40px]"
                          >
                            <CheckCircle2 size={15} />
                            Nhận đủ két
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDisputeOpenForId(
                                disputeOpenForId === latestHandover.id ? null : latestHandover.id
                              );
                              setDisputeCountedCash('');
                              setDisputeReason('');
                            }}
                            className="px-3 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 min-h-[40px]"
                          >
                            <AlertTriangle size={14} />
                            Báo lệch két
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Extended Breakdown Strip */}
                    {typeof latestHandover.posCashRevenue === 'number' && (
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--kg-border)] text-[11px]">
                        <div className="bg-[var(--kg-surface-soft)] rounded-lg px-2.5 py-1.5">
                          <span className="text-[var(--kg-text-muted)] block">Đầu ca trước</span>
                          <span className="font-mono tabular-nums font-bold text-[var(--kg-text)]">
                            {formatVndCurrency(latestHandover.openingCash)}
                          </span>
                        </div>
                        <div className="bg-[var(--kg-surface-soft)] rounded-lg px-2.5 py-1.5">
                          <span className="text-[var(--kg-text-muted)] block">+ Thu POS</span>
                          <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                            {formatVndCurrency(latestHandover.posCashRevenue)}
                          </span>
                        </div>
                        <div className="bg-[var(--kg-surface-soft)] rounded-lg px-2.5 py-1.5">
                          <span className="text-[var(--kg-text-muted)] block">- Chi tại quầy</span>
                          <span className="font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">
                            {formatVndCurrency(latestHandover.cashExpense)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Inline Dispute Form for Incoming Cashier */}
                    {disputeOpenForId === latestHandover.id && !latestAckStatus && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                        <div className="text-xs font-extrabold text-amber-800 dark:text-amber-300">
                          Khai báo số tiền mặt đếm thực tế khi nhận két
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={disputeCountedCash}
                            onChange={(e) => setDisputeCountedCash(formatVndInput(e.target.value))}
                            placeholder="Số tiền đếm thực tế (VNĐ)"
                            className="w-full bg-[var(--kg-surface)] border border-amber-500/40 rounded-lg px-3 py-2 text-right font-mono tabular-nums font-bold text-xs text-[var(--kg-text)] min-h-[40px]"
                          />
                          <input
                            type="text"
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            placeholder="Ghi chú (VD: Thiếu 1 tờ 50k trong ngăn lẻ)"
                            className="w-full bg-[var(--kg-surface)] border border-amber-500/40 rounded-lg px-3 py-2 text-xs text-[var(--kg-text)] min-h-[40px]"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDisputeOpenForId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAcknowledgeCash(latestHandover, 'Disputed')}
                            className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold"
                          >
                            Gửi cảnh báo lệch két
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-between text-xs text-[var(--kg-text-muted)]">
                    <span>Chưa có dữ liệu bàn giao ca trước trong ngày.</span>
                    <button
                      type="button"
                      onClick={loadHandovers}
                      disabled={loadingHandovers}
                      className="text-xs font-bold text-[var(--kg-primary)] flex items-center gap-1 hover:underline"
                    >
                      <RefreshCw size={13} className={loadingHandovers ? 'animate-spin' : ''} /> Tải lại
                    </button>
                  </div>
                )}

                {/* Outgoing Shift Cash Reconciliation Form */}
                <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--kg-border)]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Calculator size={20} />
                      </div>
                      <div>
                        <h3 className="font-black text-sm sm:text-base text-[var(--kg-text)]">
                          Đối soát & Bàn giao két cuối ca
                        </h3>
                        <p className="text-xs text-[var(--kg-text-muted)] font-medium">
                          Ca hiện tại: <b className="text-[var(--kg-text)]">{shiftName}</b>
                        </p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={submitHandover} className="space-y-4">
                    {/* 3-Field POS Cash Formula Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
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
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--kg-primary)] hover:underline"
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
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2.5 text-right font-mono tabular-nums font-bold text-sm text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] min-h-[42px]"
                        />
                        {recon.openingMismatch !== 0 && (
                          <p className="text-[10px] font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1">
                            Lệch so với ca trước: {formatSignedVnd(recon.openingMismatch)}
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          htmlFor="handover-pos-revenue"
                          className="block text-xs font-semibold text-[var(--kg-text)] mb-1"
                        >
                          2. + Thu tiền mặt POS
                        </label>
                        <input
                          id="handover-pos-revenue"
                          type="text"
                          inputMode="numeric"
                          value={posCashRevenue}
                          onChange={(e) => setPosCashRevenue(formatVndInput(e.target.value))}
                          placeholder="Doanh thu TM CukCuk"
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2.5 text-right font-mono tabular-nums font-bold text-sm text-emerald-700 dark:text-emerald-400 focus:outline-none focus:border-[var(--kg-primary)] min-h-[42px]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="handover-cash-expense"
                          className="block text-xs font-semibold text-[var(--kg-text)] mb-1"
                        >
                          3. - Chi tiền mặt tại quầy
                        </label>
                        <input
                          id="handover-cash-expense"
                          type="text"
                          inputMode="numeric"
                          value={cashExpense}
                          onChange={(e) => setCashExpense(formatVndInput(e.target.value))}
                          placeholder="Mua đá, hàng gấp..."
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl px-3 py-2.5 text-right font-mono tabular-nums font-bold text-sm text-rose-600 dark:text-rose-400 focus:outline-none focus:border-[var(--kg-primary)] min-h-[42px]"
                        />
                      </div>
                    </div>

                    {/* Expected Theoretical Cash Strip */}
                    <div className="p-3 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-bold text-[var(--kg-text)] block">
                          Số dư lý thuyết phải có trong két
                        </span>
                        <span className="text-[11px] text-[var(--kg-text-muted)]">
                          = Đầu ca + Thu tiền mặt POS - Chi tại quầy
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums font-black text-base text-[var(--kg-text)]">
                          {formatVndCurrency(recon.expectedCash)}
                        </span>
                        {recon.expectedCash > 0 && (
                          <button
                            type="button"
                            onClick={() => setCashAmount(formatVndInput(recon.expectedCash))}
                            className="px-2.5 py-1 rounded-lg bg-[var(--kg-primary)]/10 text-[var(--kg-primary)] text-[11px] font-bold hover:bg-[var(--kg-primary)]/20 transition-colors"
                          >
                            Điền khớp
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Actual Counted Cash (Preserves id="handover-cash") */}
                    <div>
                      <label
                        htmlFor="handover-cash"
                        className="block text-xs font-semibold text-[var(--kg-text)] mb-1.5"
                      >
                        4. Số tiền mặt kiểm đếm thực tế bàn giao (VNĐ){' '}
                        <span className="text-[var(--kg-danger)]">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--kg-text-muted)] font-mono font-bold text-xs">
                          VNĐ
                        </div>
                        <input
                          id="handover-cash"
                          type="text"
                          inputMode="numeric"
                          value={cashAmount}
                          onChange={(e) => setCashAmount(formatVndInput(e.target.value))}
                          placeholder="VD: 1.500.000"
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl pl-14 pr-4 py-3 focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] font-mono tabular-nums font-bold text-sm sm:text-base text-right tracking-wide min-h-[44px]"
                        />
                      </div>
                    </div>

                    {/* Live Reconciliation Status Banner */}
                    {cashAmount.trim() !== '' && (
                      <div
                        className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold ${
                          recon.discrepancy === 0
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                            : recon.discrepancy < 0
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        <span>
                          {recon.discrepancy === 0
                            ? 'Khớp 100% với số dư két lý thuyết'
                            : recon.discrepancy < 0
                              ? 'Cảnh báo lệch thiếu két — Bắt buộc giải trình bên dưới'
                              : 'Két đang dư tiền mặt — Vui lòng ghi chú nguồn tiền lẻ / tip'}
                        </span>
                        <span className="font-mono tabular-nums font-black text-sm shrink-0">
                          {formatSignedVnd(recon.discrepancy)}
                        </span>
                      </div>
                    )}

                    {/* Note / Explanation (Preserves id="handover-note") */}
                    <div>
                      <label
                        htmlFor="handover-note"
                        className="block text-xs font-semibold text-[var(--kg-text)] mb-1.5"
                      >
                        Ghi chú & Giải trình thu chi{' '}
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
                          onChange={(e) => setHandoverNote(e.target.value)}
                          placeholder="Ghi rõ hóa đơn chi mua đá/nguyên liệu, bill hủy POS hoặc lý do lệch tiền..."
                          rows={3}
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15 text-[var(--kg-text)] text-xs sm:text-sm"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-bold py-3 rounded-xl shadow-xs transition-colors active:scale-[0.99] flex items-center justify-center text-xs sm:text-sm uppercase tracking-wider min-h-[44px]"
                    >
                      <CheckCircle2 size={17} className="mr-1.5 text-emerald-400" /> Chốt đối soát & Bàn giao két
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {/* TAB 2: HANDOVER HISTORY LEDGER */}
            {activeTab === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between pb-3 border-b border-[var(--kg-border)]">
                  <div className="flex items-center gap-2">
                    <History size={18} className="text-blue-600 dark:text-blue-400" />
                    <h3 className="font-black text-sm sm:text-base text-[var(--kg-text)]">
                      Sổ cái đối soát két 2 chiều
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={loadHandovers}
                    disabled={loadingHandovers}
                    className="p-1.5 rounded-lg border border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] active:scale-95 transition-all"
                    title="Làm mới"
                  >
                    <RefreshCw size={14} className={loadingHandovers ? 'animate-spin' : ''} />
                  </button>
                </div>

                {handovers.length === 0 ? (
                  <div className="text-center py-8 text-xs text-[var(--kg-text-muted)]">
                    {loadingHandovers ? 'Đang tải nhật ký két...' : 'Chưa có bản ghi bàn giao ca nào.'}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {handovers.map((item, idx) => {
                      const itemAckBy = item.ackBy || localMeta[item.id]?.ackBy;
                      const itemAckAt = item.ackAt || localMeta[item.id]?.ackAt;
                      const itemAckStatus =
                        item.ackStatus ||
                        localMeta[item.id]?.ackStatus ||
                        (itemAckBy || ackHandoverId === item.id ? 'Accepted' : '');
                      const diff = item.discrepancy ?? 0;

                      return (
                        <div
                          key={item.id || idx}
                          className="p-3.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] space-y-2"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300">
                                {item.shift || 'Ca trực'} • {item.date}
                              </span>
                              <span className="font-mono tabular-nums font-black text-sm text-[var(--kg-text)]">
                                Thực bàn giao: {item.cashAmount} đ
                              </span>
                              {diff !== 0 && (
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold ${
                                    diff < 0
                                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                  }`}
                                >
                                  Lệch {formatSignedVnd(diff)}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {itemAckStatus === 'Disputed' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300">
                                  <AlertTriangle size={11} /> Báo lệch bởi {itemAckBy || 'ca sau'}
                                </span>
                              ) : itemAckStatus === 'Accepted' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                  <CheckCheck size={11} />
                                  {itemAckBy ? `Đã nhận: ${itemAckBy}` : 'Đã đối soát'}
                                  {itemAckAt ? ` (${itemAckAt})` : ''}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-500/10 text-[var(--kg-text-muted)]">
                                  Chờ ca sau nhận
                                </span>
                              )}

                              {item.reconcileStatus === 'ManagerConfirmed' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
                                  <ShieldCheck size={11} /> QL đã chốt
                                </span>
                              )}
                            </div>
                          </div>

                          {typeof item.posCashRevenue === 'number' && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                              <span>Đầu ca: {formatVndCurrency(item.openingCash)}</span>
                              <span>+POS: {formatVndCurrency(item.posCashRevenue)}</span>
                              <span>-Chi: {formatVndCurrency(item.cashExpense)}</span>
                              <span>= Lý thuyết: {formatVndCurrency(item.expectedCash)}</span>
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-[var(--kg-text-muted)]">
                            <span>
                              Người giao:{' '}
                              <b className="text-[var(--kg-text)]">{item.fullname || item.username}</b>
                            </span>
                            {item.note && <span className="italic">"{item.note}"</span>}
                          </div>

                          {(item.ackNote || item.managerNote) && (
                            <div className="pt-1.5 border-t border-[var(--kg-border)] space-y-1 text-[11px]">
                              {item.ackNote && (
                                <p className="text-amber-700 dark:text-amber-300">
                                  <b>Ca nhận phản hồi:</b> {item.ackNote}
                                </p>
                              )}
                              {item.managerNote && (
                                <p className="text-cyan-700 dark:text-cyan-300">
                                  <b>Quản lý kết luận:</b> {item.managerNote}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 3: 4-STATE INCIDENT REPORTING & LIVE TRACKER */}
            {activeTab === 'incident' && (
              <motion.div
                key="incident"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                <div className="bg-[var(--kg-surface)] border border-rose-500/20 dark:border-rose-900/30 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-[var(--kg-border)]">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h3 className="font-black text-sm sm:text-base text-[var(--kg-text)]">
                        Báo cáo sự cố vận hành ca trực
                      </h3>
                      <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                        Ghi nhận vị trí, mức độ khẩn cấp & theo dõi 4 bước khắc phục
                      </p>
                    </div>
                  </div>

                  <form onSubmit={submitIncident} className="space-y-4">
                    {/* Area & Severity Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-black text-[var(--kg-text)] mb-1.5">
                          Khu vực xảy ra sự cố
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {INCIDENT_AREAS.map((area) => (
                            <button
                              type="button"
                              key={area}
                              onClick={() => setIncidentArea(area)}
                              className={`py-2 px-2 rounded-lg border text-[11px] font-bold transition-all ${
                                incidentArea === area
                                  ? 'border-[var(--kg-primary)] bg-[var(--kg-primary)]/10 text-[var(--kg-primary)]'
                                  : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                              }`}
                            >
                              {area}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-black text-[var(--kg-text)] mb-1.5">
                          Mức độ ưu tiên
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {SEVERITY_OPTIONS.map((sev) => (
                            <button
                              type="button"
                              key={sev.id}
                              onClick={() => setIncidentSeverity(sev.id)}
                              className={`py-2 px-2 rounded-lg border text-[11px] font-bold transition-all ${
                                incidentSeverity === sev.id
                                  ? sev.activeClass
                                  : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)]'
                              }`}
                            >
                              {sev.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <label className="block text-xs font-black text-[var(--kg-text)] mb-1.5">
                        Phân loại sự cố *
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          'Thiết bị hỏng',
                          'Khách phàn nàn',
                          'Thiếu nguyên liệu',
                          'An toàn / Vệ sinh',
                          'Khác',
                        ].map((cat) => (
                          <button
                            type="button"
                            key={cat}
                            onClick={() => setIncidentCategory(cat)}
                            className={`p-2.5 rounded-xl border text-center transition-all text-xs font-black active:scale-95 ${
                              incidentCategory === cat
                                ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 shadow-xs'
                                : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:bg-[var(--kg-border)]/40'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Description (Preserves id="incident-desc") */}
                    <div>
                      <label
                        htmlFor="incident-desc"
                        className="block text-xs font-semibold text-[var(--kg-text)] mb-1.5"
                      >
                        Mô tả chi tiết <span className="text-[var(--kg-danger)]">*</span>
                      </label>
                      <textarea
                        id="incident-desc"
                        value={incidentDesc}
                        onChange={(e) => setIncidentDesc(e.target.value)}
                        placeholder="Mô tả cụ thể sự cố (VD: Tủ đông số 2 Khu C báo lỗi E2, máy in bill thu ngân kẹt dao cắt...)"
                        rows={3}
                        className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl p-3 focus:outline-none focus:border-[var(--kg-danger)] focus:ring-2 focus:ring-[var(--kg-danger)]/15 text-[var(--kg-text)] text-xs sm:text-sm"
                      />
                    </div>

                    {/* Optional Photo Evidence */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-xs font-bold text-[var(--kg-text)] cursor-pointer hover:border-[var(--kg-primary)] transition-colors min-h-[40px]">
                        <Camera size={15} className="text-[var(--kg-primary)]" />
                        <span>
                          {uploadingPhoto
                            ? 'Đang nén & tải ảnh...'
                            : incidentPhotoPreview
                              ? 'Đổi ảnh hiện trường'
                              : 'Đính kèm ảnh hiện trường (tùy chọn)'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleIncidentPhotoSelect}
                          disabled={uploadingPhoto}
                          className="hidden"
                        />
                      </label>

                      {incidentPhotoPreview && (
                        <div className="relative inline-flex items-center gap-2 p-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
                          <img
                            src={incidentPhotoPreview}
                            alt="Ảnh sự cố"
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setIncidentPhotoPreview('');
                              setIncidentPhotoUrl('');
                            }}
                            className="p-1 rounded-full bg-rose-500/15 text-rose-600 hover:bg-rose-500/25"
                            title="Xóa ảnh"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={uploadingPhoto}
                      className="w-full bg-[var(--kg-danger)] hover:brightness-95 disabled:opacity-60 text-white font-bold py-3 rounded-xl shadow-xs transition-colors active:scale-[0.99] flex items-center justify-center text-xs sm:text-sm uppercase tracking-wider min-h-[44px]"
                    >
                      <ShieldAlert size={17} className="mr-1.5" /> Gửi báo cáo sự cố ngay
                    </button>
                  </form>
                </div>

                {/* Live 4-Step Incident Status Tracker */}
                <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--kg-border)]">
                    <div className="flex items-center gap-2">
                      <Wrench size={17} className="text-amber-600 dark:text-amber-400" />
                      <h4 className="font-black text-sm text-[var(--kg-text)]">
                        Tiến độ xử lý sự cố (4 bước)
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={loadIncidents}
                      disabled={loadingIncidents}
                      className="p-1.5 rounded-lg border border-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]"
                      title="Làm mới danh sách sự cố"
                    >
                      <RefreshCw size={14} className={loadingIncidents ? 'animate-spin' : ''} />
                    </button>
                  </div>

                  {incidents.length === 0 ? (
                    <div className="text-center py-6 text-xs text-[var(--kg-text-muted)]">
                      {loadingIncidents
                        ? 'Đang tải danh sách sự cố...'
                        : 'Hiện không có sự cố tồn đọng nào.'}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {incidents.slice(0, 15).map((inc) => {
                        const statusObj =
                          INCIDENT_STATUS_STEPS.find((s) => s.id === inc.status) ||
                          INCIDENT_STATUS_STEPS[0];
                        const currentStepIdx = INCIDENT_STATUS_STEPS.findIndex(
                          (s) => s.id === statusObj.id
                        );

                        return (
                          <div
                            key={inc.id}
                            className="p-3.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text)]">
                                  {inc.area || 'Toàn quán'}
                                </span>
                                <span className="text-xs font-black text-[var(--kg-text)]">
                                  {inc.category}
                                </span>
                                {inc.severity === 'urgent' && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-500 text-white">
                                    KHẨN CẤP
                                  </span>
                                )}
                              </div>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${statusObj.badgeClass}`}
                              >
                                {statusObj.shortLabel}
                              </span>
                            </div>

                            <p className="text-xs text-[var(--kg-text)] leading-relaxed">
                              {inc.description}
                            </p>

                            {/* 4-Step Progress Bar */}
                            <div className="grid grid-cols-4 gap-1.5 pt-1">
                              {INCIDENT_STATUS_STEPS.map((step, sIdx) => {
                                const active = sIdx <= currentStepIdx;
                                return (
                                  <div key={step.id} className="space-y-1">
                                    <div
                                      className={`h-1.5 rounded-full ${
                                        active
                                          ? 'bg-emerald-500'
                                          : 'bg-[var(--kg-border)]'
                                      }`}
                                    />
                                    <span
                                      className={`block text-[10px] truncate ${
                                        active
                                          ? 'font-bold text-[var(--kg-text)]'
                                          : 'text-[var(--kg-text-muted)]'
                                      }`}
                                    >
                                      {step.shortLabel}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-[var(--kg-text-muted)]">
                              <span>
                                Báo bởi <b className="text-[var(--kg-text)]">{inc.fullname || inc.username}</b> •{' '}
                                {inc.date}
                              </span>
                              {inc.assignedTo && (
                                <span className="inline-flex items-center gap-1 font-semibold text-[var(--kg-text)]">
                                  <UserCheck size={12} className="text-emerald-500" /> Phụ trách:{' '}
                                  {inc.assignedTo}
                                </span>
                              )}
                            </div>

                            {(inc.resolutionNote || (inc.repairCost && inc.repairCost > 0)) && (
                              <div className="pt-2 border-t border-[var(--kg-border)] flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                {inc.resolutionNote && (
                                  <span className="text-emerald-700 dark:text-emerald-300">
                                    <b>Phản hồi xử lý:</b> {inc.resolutionNote}
                                  </span>
                                )}
                                {typeof inc.repairCost === 'number' && inc.repairCost > 0 && (
                                  <span className="font-mono tabular-nums font-bold text-[var(--kg-text)]">
                                    Chi phí: {formatVndCurrency(inc.repairCost)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
