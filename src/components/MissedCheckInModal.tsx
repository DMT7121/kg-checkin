import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Send,
  Camera,
  Image as ImageIcon,
  History,
  ShieldCheck,
  X,
  RefreshCw,
  LogIn,
  LogOut,
  Moon,
} from 'lucide-react';
import { useAppStore, type LogEntry } from '../store/useAppStore';
import { callApi } from '../services/api';
import {
  fileToBase64,
  auditMissingCheckIns,
  resolveSupplementActionForDate,
} from '../utils/helpers';
import {
  formatUnifiedPunchLabel,
  getWorkdayCycleBounds,
  type CanonicalPunchType,
} from '../utils/attendanceSequence';
import { refreshAppData } from '../utils/refreshData';
import { enqueueTask } from '../utils/offlineQueue';
import { useDialogA11y } from '../utils/modalQueue';

export interface MissedClaimItem {
  id: string;
  createdAt: string;
  username: string;
  fullname: string;
  date: string;
  effectiveDate?: string;
  effectiveTime?: string;
  time: string;
  type: string;
  canonicalType?: string;
  shift: string;
  reason: string;
  proofImage?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedBy?: string;
  approvedAt?: string;
  note?: string;
}

interface MissedCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingLogs?: LogEntry[];
  onSubmitted?: () => void;
  onSuccess?: () => void;
  initialTab?: 'create' | 'history' | 'admin';
  defaultType?: 'Vào ca' | 'Ra ca';
  defaultDate?: string;
  defaultTime?: string;
  defaultReason?: string;
  defaultShift?: string;
}

const QUICK_REASONS = [
  'Quên bấm đầu ca',
  'Quên bấm cuối ca',
  'Lỗi mạng / GPS tại quán',
  'Điện thoại hết pin',
];

const QUICK_TIMES = ['14:00', '15:00', '17:00', '22:30', '23:30'];

function isoToDmy(iso: string): string {
  const m = String(iso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function dmyToIso(dmy: string): string {
  const m = String(dmy || '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[1], 10)).padStart(2, '0')}`;
}

function getWorkdayOwnerDmy(dayOffset = 0): string {
  const { workdayDateKey } = getWorkdayCycleBounds(new Date());
  const m = workdayDateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const now = new Date();
    now.setDate(now.getDate() + dayOffset);
    return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  }
  const dt = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10) + dayOffset, 12, 0, 0));
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
}

function addDaysToDmy(dmy: string, offsetDays: number): string {
  const m = String(dmy || '').trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return dmy;
  const dt = new Date(
    Date.UTC(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10) + offsetDays, 12, 0, 0)
  );
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
}

function cleanMissedDateStr(raw: unknown): string {
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
  const dt = new Date(s);
  if (!isNaN(dt.getTime()) && dt.getFullYear() > 1905) {
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  }
  return s;
}

function cleanMissedTimeStr(raw: unknown): string {
  const s = String(raw ?? '').replace(/^'/, '').trim();
  if (!s) return '';
  const hhmm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmm) {
    return `${String(parseInt(hhmm[1], 10)).padStart(2, '0')}:${hhmm[2]}`;
  }
  const gmtMatch = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s+GMT/i);
  if (gmtMatch) {
    return `${String(parseInt(gmtMatch[1], 10)).padStart(2, '0')}:${gmtMatch[2]}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  }
  const anyTime = s.match(/(\d{1,2}):(\d{2})/);
  if (anyTime) {
    return `${String(parseInt(anyTime[1], 10)).padStart(2, '0')}:${anyTime[2]}`;
  }
  return s;
}

function normalizeClaimItem(c: any): MissedClaimItem {
  const unifiedType = formatUnifiedPunchLabel(String(c?.canonicalType || c?.type || 'Vào ca'));
  const cleanType: CanonicalPunchType = unifiedType.toLowerCase().includes('ra') ? 'Ra ca' : 'Vào ca';
  return {
    ...c,
    date: cleanMissedDateStr(c?.date),
    effectiveDate: c?.effectiveDate ? cleanMissedDateStr(c.effectiveDate) : undefined,
    time: cleanMissedTimeStr(c?.time),
    shift: c?.shift ? (cleanMissedTimeStr(c.shift) || String(c.shift).replace(/^'/, '').trim()) : '',
    type: cleanType,
    canonicalType: cleanType,
  };
}

export default function MissedCheckInModal({
  isOpen,
  onClose,
  existingLogs,
  onSubmitted,
  onSuccess,
  initialTab,
  defaultType,
  defaultDate,
  defaultTime,
  defaultReason,
  defaultShift,
}: MissedCheckInModalProps) {
  const currentUser = useAppStore((s) => s.currentUser);
  const storeLogs = useAppStore((s) => s.logs);
  const prependLog = useAppStore((s) => s.prependLog);
  const setLogs = useAppStore((s) => s.setLogs);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.username === 'ADMIN';
  const logsSource = existingLogs && existingLogs.length > 0 ? existingLogs : storeLogs;

  const resolveInitialTab = useCallback(
    (): 'create' | 'history' | 'admin' =>
      initialTab === 'admin' && isAdmin
        ? 'admin'
        : initialTab === 'history'
        ? 'history'
        : 'create',
    [initialTab, isAdmin]
  );

  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'admin'>(resolveInitialTab);

  const todayWorkdayDmy = useMemo(() => getWorkdayOwnerDmy(0), []);
  const yesterdayWorkdayDmy = useMemo(() => getWorkdayOwnerDmy(-1), []);

  const [claimDate, setClaimDate] = useState<string>(() => defaultDate || getWorkdayOwnerDmy(0));
  const [claimTime, setClaimTime] = useState<string>(() => {
    if (defaultTime) return defaultTime;
    return '15:00';
  });
  const [manualEmptyDayAction, setManualEmptyDayAction] = useState<'Vào ca' | 'Ra ca' | null>(null);
  const [claimShift, setClaimShift] = useState<string>(defaultShift || '15:00');
  const [claimReasonPreset, setClaimReasonPreset] = useState<string>(
    defaultReason && QUICK_REASONS.includes(defaultReason) ? defaultReason : QUICK_REASONS[0]
  );
  const [claimReasonDetail, setClaimReasonDetail] = useState<string>('');
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [inlineNotice, setInlineNotice] = useState<{
    tone: 'error' | 'info' | 'success';
    text: string;
  } | null>(null);

  const [submittedClaim, setSubmittedClaim] = useState<MissedClaimItem | null>(null);
  const [copiedZalo, setCopiedZalo] = useState<boolean>(false);

  const [claimsList, setClaimsList] = useState<MissedClaimItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState<boolean>(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useDialogA11y({
    isOpen,
    containerRef: dialogRef,
    onClose,
    closeOnEscape: true,
  });

  // Detect recent missing punch alerts (last 14 days) so staff can pick the exact date in 1 tap
  const missingDateAlerts = useMemo(
    () => auditMissingCheckIns(logsSource, currentUser, 14),
    [logsSource, currentUser]
  );

  // Smart missing-punch resolution for the selected workday (06:00 -> 05:59 next morning)
  const suppResolution = useMemo(
    () =>
      resolveSupplementActionForDate({
        user: currentUser,
        dateStr: claimDate,
        timeStr: claimTime,
        logs: logsSource,
      }),
    [currentUser, claimDate, claimTime, logsSource]
  );

  // Only allow manual override when the selected day has 0 punches; otherwise strictly lock to missing slot
  const effectiveBaseAction: 'Vào ca' | 'Ra ca' =
    suppResolution.cyclePunches.length === 0 && manualEmptyDayAction
      ? manualEmptyDayAction
      : suppResolution.baseAction;

  const effectiveCanonicalType: CanonicalPunchType =
    suppResolution.cyclePunches.length === 0 && manualEmptyDayAction
      ? manualEmptyDayAction === 'Ra ca'
        ? 'Ra ca'
        : 'Vào ca'
      : suppResolution.canonicalType;

  const isOvernightNextDay = useMemo(() => {
    if (effectiveBaseAction !== 'Ra ca') return false;
    const m = String(claimTime || '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return false;
    const hh = parseInt(m[1], 10);
    return hh >= 0 && hh < 6;
  }, [effectiveBaseAction, claimTime]);

  const effectiveCalendarDate = useMemo(
    () => (isOvernightNextDay ? addDaysToDmy(suppResolution.dateStr, 1) : suppResolution.dateStr),
    [isOvernightNextDay, suppResolution.dateStr]
  );

  // Sync defaults when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(resolveInitialTab());
    setSubmittedClaim(null);
    setInlineNotice(null);
    if (defaultDate) {
      setClaimDate(defaultDate);
    } else {
      setClaimDate(getWorkdayOwnerDmy(0));
    }
    if (defaultTime) {
      setClaimTime(defaultTime);
    }
    if (defaultShift) {
      setClaimShift(defaultShift);
    }
    if (defaultReason) {
      if (QUICK_REASONS.includes(defaultReason)) {
        setClaimReasonPreset(defaultReason);
        setClaimReasonDetail('');
      } else {
        setClaimReasonPreset(QUICK_REASONS[0]);
      }
    }
    setManualEmptyDayAction(defaultType === 'Ra ca' ? 'Ra ca' : null);
  }, [isOpen, resolveInitialTab, defaultDate, defaultTime, defaultShift, defaultReason, defaultType]);

  // Keep preset reason aligned with Vào ca vs Ra ca automatically unless user picked technical reason
  useEffect(() => {
    if (effectiveBaseAction === 'Ra ca' && claimReasonPreset === 'Quên bấm đầu ca') {
      setClaimReasonPreset('Quên bấm cuối ca');
    } else if (effectiveBaseAction === 'Vào ca' && claimReasonPreset === 'Quên bấm cuối ca') {
      setClaimReasonPreset('Quên bấm đầu ca');
    }
  }, [effectiveBaseAction, claimReasonPreset]);

  const getLocalClaims = useCallback((): MissedClaimItem[] => {
    try {
      const stored = localStorage.getItem('kg_local_missed_claims');
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeClaimItem) : [];
    } catch {
      return [];
    }
  }, []);

  const saveLocalClaims = useCallback((claims: MissedClaimItem[]) => {
    try {
      localStorage.setItem('kg_local_missed_claims', JSON.stringify(claims));
    } catch {
      // ignore storage quota errors
    }
  }, []);

  const fetchClaims = useCallback(async () => {
    if (!currentUser) return;
    setIsLoadingList(true);
    const local = getLocalClaims();
    try {
      const res = await callApi(
        'GET_MISSED_CHECKINS',
        {
          username: currentUser.username,
          role: currentUser.role,
        },
        { background: true, cacheTtlMs: 0 }
      );
      if (res?.ok && Array.isArray(res.data)) {
        const cleanServer = res.data.map(normalizeClaimItem);
        const serverIds = new Set(cleanServer.map((c: MissedClaimItem) => c.id));
        const combined = [...cleanServer, ...local.filter((c: MissedClaimItem) => !serverIds.has(c.id))];
        setClaimsList(combined);
        saveLocalClaims(combined);
      } else {
        setClaimsList(local);
      }
    } catch {
      setClaimsList(local);
    } finally {
      setIsLoadingList(false);
    }
  }, [currentUser, getLocalClaims, saveLocalClaims]);

  useEffect(() => {
    if (isOpen) {
      void fetchClaims();
    }
  }, [isOpen, activeTab, fetchClaims]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      setProofImage(base64);
    } catch {
      setInlineNotice({ tone: 'error', text: 'Không thể đọc ảnh minh chứng. Vui lòng chọn ảnh khác.' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !suppResolution.canSupplement) return;

    const cleanTime = String(claimTime || '').trim();
    if (!/^\d{1,2}:\d{2}$/.test(cleanTime)) {
      setInlineNotice({ tone: 'error', text: 'Vui lòng nhập giờ hợp lệ theo định dạng HH:mm (ví dụ 15:00).' });
      return;
    }
    const [hhRaw, mmRaw] = cleanTime.split(':');
    const normalizedTime = `${String(parseInt(hhRaw, 10)).padStart(2, '0')}:${mmRaw}`;

    const finalReason = claimReasonDetail.trim()
      ? `${claimReasonPreset}: ${claimReasonDetail.trim()}`
      : claimReasonPreset;

    const generatedId = `MC_${Date.now()}`;
    const optimisticEffectiveTime = `${effectiveCalendarDate} ${normalizedTime}:00`;
    const newClaim: MissedClaimItem = {
      id: generatedId,
      createdAt: new Date().toLocaleTimeString('vi-VN'),
      username: currentUser.username,
      fullname: currentUser.fullname || currentUser.username,
      date: suppResolution.dateStr,
      effectiveDate: effectiveCalendarDate,
      effectiveTime: optimisticEffectiveTime,
      time: normalizedTime,
      type: effectiveCanonicalType,
      canonicalType: effectiveCanonicalType,
      shift: claimShift,
      reason: finalReason,
      proofImage: proofImage || undefined,
      status: 'Pending',
    };

    setIsSubmitting(true);
    setInlineNotice(null);

    const apiPayload = {
      username: currentUser.username,
      fullname: currentUser.fullname || currentUser.username,
      date: suppResolution.dateStr,
      time: normalizedTime,
      type: effectiveCanonicalType,
      shift: claimShift,
      reason: finalReason,
      imageBase64: proofImage,
    };

    try {
      const res = await callApi('SUBMIT_MISSED_CHECKIN', apiPayload);

      if (res && !res.ok) {
        setInlineNotice({
          tone: 'error',
          text: res.message || 'Máy chủ từ chối yêu cầu. Vui lòng kiểm tra lại ngày giờ.',
        });
        return;
      }

      if (res?.data?.id) newClaim.id = res.data.id;
      if (res?.data?.effectiveDate) newClaim.effectiveDate = res.data.effectiveDate;
      if (res?.data?.effectiveTime) newClaim.effectiveTime = res.data.effectiveTime;

      const pendingSheetType =
        res?.data?.pendingSheetType || `Chờ duyệt: ${effectiveCanonicalType}`;
      const recordedTime = newClaim.effectiveTime || optimisticEffectiveTime;

      // Immediately reflect pending row in Zustand store logs so CheckIn & History update in 0ms
      prependLog({
        username: currentUser.username,
        fullname: currentUser.fullname || currentUser.username,
        type: pendingSheetType,
        time: recordedTime,
        status: 'Chờ Admin duyệt',
        note: `[Bổ sung công #${newClaim.id} - Chờ duyệt] Ca ${claimShift}: ${finalReason}`,
      });

      const currentList = getLocalClaims();
      saveLocalClaims([newClaim, ...currentList.filter((c) => c.id !== newClaim.id)]);

      setSubmittedClaim(newClaim);
      onSubmitted?.();
      onSuccess?.();
      void fetchClaims();
    } catch {
      enqueueTask('SUBMIT_MISSED_CHECKIN', apiPayload);

      prependLog({
        username: currentUser.username,
        fullname: currentUser.fullname || currentUser.username,
        type: `Chờ duyệt: ${effectiveCanonicalType}`,
        time: optimisticEffectiveTime,
        status: 'Chờ Admin duyệt',
        note: `[Bổ sung công #${newClaim.id} - Offline chờ đồng bộ] Ca ${claimShift}: ${finalReason}`,
      });

      const currentList = getLocalClaims();
      saveLocalClaims([newClaim, ...currentList.filter((c) => c.id !== newClaim.id)]);
      setSubmittedClaim(newClaim);
      setInlineNotice({
        tone: 'info',
        text: 'Đang ngoại tuyến: Đơn đã lưu tạm và sẽ tự động ghi lên Sheet khi có mạng.',
      });
      onSubmitted?.();
      onSuccess?.();
      void fetchClaims();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (claim: MissedClaimItem) => {
    if (!isAdmin || approvingId) return;
    setApprovingId(claim.id);
    setInlineNotice(null);
    try {
      const res = await callApi('APPROVE_MISSED_CHECKIN', {
        id: claim.id,
        adminUsername: currentUser?.username || 'ADMIN',
      });
      if (res?.ok) {
        const rawApproved =
          res.data?.approvedType ||
          String(claim.canonicalType || claim.type || 'Vào ca').replace(/^chờ\s*duyệt\s*:\s*/i, '');
        const canonicalApproved: CanonicalPunchType = rawApproved.toLowerCase().includes('ra')
          ? 'Ra ca'
          : 'Vào ca';

        // Update local store log in-place so payroll & history immediately reflect approval
        const latestLogs = useAppStore.getState().logs;
        const updatedLogs = latestLogs.map((l) => {
          if (String(l.note || '').includes(`#${claim.id}`)) {
            return {
              ...l,
              type: canonicalApproved,
              status: 'Hợp lệ',
              note: `[Bổ sung công #${claim.id} - Đã duyệt bởi ${currentUser?.username || 'ADMIN'}] ${claim.reason}`,
            };
          }
          return l;
        });
        setLogs(updatedLogs);

        const nextLocal = getLocalClaims().map((c) =>
          c.id === claim.id
            ? {
                ...c,
                status: 'Approved' as const,
                approvedBy: currentUser?.username || 'ADMIN',
              }
            : c
        );
        saveLocalClaims(nextLocal);
        setInlineNotice({
          tone: 'success',
          text: `Đã duyệt công ${canonicalApproved} (${claim.time} • ${claim.date}) cho ${claim.fullname}.`,
        });
        await fetchClaims();
        void refreshAppData(true);
        onSubmitted?.();
        onSuccess?.();
      } else {
        setInlineNotice({
          tone: 'error',
          text: res?.message || 'Không thể duyệt đơn lúc này.',
        });
      }
    } catch (err: any) {
      setInlineNotice({
        tone: 'error',
        text: err?.message || 'Lỗi kết nối máy chủ khi duyệt đơn.',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (claim: MissedClaimItem) => {
    if (!isAdmin || approvingId) return;
    setApprovingId(claim.id);
    setInlineNotice(null);
    try {
      const finalRejectNote = rejectReason.trim() || 'Không hợp lệ / Thiếu xác nhận ca';
      const res = await callApi('REJECT_MISSED_CHECKIN', {
        id: claim.id,
        adminUsername: currentUser?.username || 'ADMIN',
        reason: finalRejectNote,
      });
      if (res?.ok) {
        const rawClean = String(claim.canonicalType || claim.type || 'Vào ca').replace(
          /^(chờ\s*duyệt|từ\s*chối)\s*:\s*/i,
          ''
        );
        const cleanType: CanonicalPunchType = rawClean.toLowerCase().includes('ra') ? 'Ra ca' : 'Vào ca';
        const latestLogs = useAppStore.getState().logs;
        const updatedLogs = latestLogs.map((l) => {
          if (String(l.note || '').includes(`#${claim.id}`)) {
            return {
              ...l,
              type: `Từ chối: ${cleanType}`,
              status: 'Từ chối bổ sung',
              note: `[Từ chối bổ sung #${claim.id}] ${finalRejectNote}`,
            };
          }
          return l;
        });
        setLogs(updatedLogs);

        const nextLocal = getLocalClaims().map((c) =>
          c.id === claim.id ? { ...c, status: 'Rejected' as const, note: finalRejectNote } : c
        );
        saveLocalClaims(nextLocal);

        setRejectingId(null);
        setRejectReason('');
        setInlineNotice({
          tone: 'info',
          text: `Đã từ chối đơn #${claim.id} của ${claim.fullname}.`,
        });
        await fetchClaims();
        void refreshAppData(true);
        onSubmitted?.();
      } else {
        setInlineNotice({
          tone: 'error',
          text: res?.message || 'Không thể từ chối đơn.',
        });
      }
    } catch (err: any) {
      setInlineNotice({
        tone: 'error',
        text: err?.message || 'Lỗi kết nối máy chủ.',
      });
    } finally {
      setApprovingId(null);
    }
  };

  const getZaloText = (claim: MissedClaimItem) => {
    return `[BỔ SUNG CHẤM CÔNG - KING'S GRILL]
• Nhân sự: ${claim.fullname} (@${claim.username})
• Bổ sung: ${claim.type} • ${claim.time} ngày ${claim.effectiveDate || claim.date} (Ca ${claim.shift})
• Lý do: ${claim.reason}
• Mã: #${claim.id} (Đã ghi Chờ duyệt trên Sheet)
-> Nhờ Quản lý duyệt giúp em ạ!`;
  };

  const handleCopyZalo = (claim: MissedClaimItem) => {
    navigator.clipboard.writeText(getZaloText(claim)).then(() => {
      setCopiedZalo(true);
      setTimeout(() => setCopiedZalo(false), 2500);
    });
  };

  const userHistoryClaims = useMemo(
    () => claimsList.filter((c) => !isAdmin || c.username === currentUser?.username),
    [claimsList, isAdmin, currentUser?.username]
  );
  const pendingAdminCount = useMemo(
    () => claimsList.filter((c) => c.status === 'Pending').length,
    [claimsList]
  );

  if (!isOpen) return null;

  const isSmartOut = effectiveBaseAction === 'Ra ca';

  const modalContent = (
    <div
      data-testid="missed-checkin-modal"
      className="fixed inset-0 z-[10075] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
    >
      {/* Solid High-Contrast Backdrop (Zero glassmorphism/blur) */}
      <div
        className="fixed inset-0 bg-black/60 transition-opacity"
        onClick={onClose}
      />

      {/* Compact, Clean Modal Card */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="missed-checkin-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[88dvh] mx-auto bg-[var(--kg-surface)] text-[var(--kg-text)] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-[var(--kg-border)] flex flex-col overflow-hidden z-10 focus:outline-none"
      >
        {/* Compact Header */}
        <div className="px-4 py-3.5 border-b border-[var(--kg-border)] flex items-center justify-between gap-3 bg-[var(--kg-surface)] flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/25 flex items-center justify-center flex-shrink-0">
              <Clock size={18} />
            </div>
            <div className="min-w-0">
              <h3
                id="missed-checkin-modal-title"
                className="text-sm sm:text-base font-extrabold tracking-tight text-[var(--kg-text)] truncate"
              >
                Bổ sung chấm công
              </h3>
              <p className="text-[11px] text-[var(--kg-text-muted)] font-medium truncate">
                Thêm vào Sheet chấm công • Chờ Admin duyệt
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ bổ sung chấm công"
            className="w-11 h-11 min-w-[44px] min-h-[44px] sm:w-10 sm:h-10 sm:min-w-[40px] sm:min-h-[40px] rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center transition-colors active:scale-95 flex-shrink-0 touch-manipulation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Clean Single-Row Toast Touch Segmented Bar */}
        <div className="px-3 py-2 border-b border-[var(--kg-border)] bg-[var(--kg-surface-2)] flex-shrink-0">
          <div className={`grid ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'} p-1 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] gap-1`}>
            <button
              type="button"
              onClick={() => {
                setActiveTab('create');
                setSubmittedClaim(null);
                setInlineNotice(null);
              }}
              className={`px-2 sm:px-3 py-2 min-h-[44px] sm:min-h-[38px] rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 touch-manipulation whitespace-nowrap min-w-0 ${
                activeTab === 'create'
                  ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] font-extrabold shadow-xs'
                  : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              <Send size={13} className="flex-shrink-0" />
              <span className="truncate sm:hidden">Bổ sung</span>
              <span className="truncate hidden sm:inline">Bổ sung công</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('history');
                setInlineNotice(null);
              }}
              className={`px-2 sm:px-3 py-2 min-h-[44px] sm:min-h-[38px] rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 touch-manipulation whitespace-nowrap min-w-0 ${
                activeTab === 'history'
                  ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] font-extrabold shadow-xs'
                  : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              <History size={13} className="flex-shrink-0" />
              <span className="truncate sm:hidden">Đã gửi ({userHistoryClaims.length})</span>
              <span className="truncate hidden sm:inline">Đơn đã gửi ({userHistoryClaims.length})</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                data-testid="missed-admin-tab-btn"
                onClick={() => {
                  setActiveTab('admin');
                  setInlineNotice(null);
                }}
                className={`px-2 sm:px-3 py-2 min-h-[44px] sm:min-h-[38px] rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 touch-manipulation whitespace-nowrap min-w-0 ${
                  activeTab === 'admin'
                    ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] font-extrabold shadow-xs'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <ShieldCheck size={13} className="flex-shrink-0" />
                <span className="truncate">Duyệt</span>
                {pendingAdminCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[var(--kg-danger)] text-white dark:text-[#23170F] text-[10px] font-black font-mono tabular-nums flex-shrink-0">
                    {pendingAdminCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Inline Status Banner */}
        {inlineNotice && (
          <div
            className={`mx-4 mt-3 px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              inlineNotice.tone === 'error'
                ? 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/30 text-[var(--kg-danger)]'
                : inlineNotice.tone === 'success'
                ? 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/30 text-[var(--kg-success)]'
                : 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/30 text-[var(--kg-warning)]'
            }`}
          >
            {inlineNotice.tone === 'success' ? (
              <CheckCircle2 size={15} className="flex-shrink-0" />
            ) : (
              <AlertCircle size={15} className="flex-shrink-0" />
            )}
            <span className="leading-snug">{inlineNotice.text}</span>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 pb-safe sm:pb-4 space-y-3.5 min-h-0">
          {/* TAB 1: CREATE SUPPLEMENT */}
          {activeTab === 'create' && (
            <>
              {submittedClaim ? (
                <div className="space-y-3.5 py-1">
                  <div className="p-4 rounded-2xl bg-[var(--kg-success-soft)] border border-[var(--kg-success)]/30 text-center space-y-1.5">
                    <div className="w-11 h-11 rounded-2xl bg-[var(--kg-success)] text-white dark:text-[#0F2419] flex items-center justify-center mx-auto shadow-xs">
                      <CheckCircle2 size={24} />
                    </div>
                    <h4 className="text-sm sm:text-base font-extrabold text-[var(--kg-success)]">
                      Đã ghi vào Sheet (Chờ Admin duyệt)
                    </h4>
                    <p className="text-xs text-[var(--kg-text-muted)] leading-relaxed">
                      Dòng <b className="text-[var(--kg-text)]">Chờ duyệt: {submittedClaim.type}</b> đã được thêm vào bảng chấm công và sẽ tính công ngay khi Quản lý bấm Duyệt.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-1.5 text-xs">
                    <div className="flex items-center justify-between pb-1.5 border-b border-[var(--kg-border)]">
                      <span className="font-mono font-bold text-[11px] text-[var(--kg-text-muted)]">
                        #{submittedClaim.id}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] font-extrabold text-[10px] uppercase">
                        Chờ Admin duyệt
                      </span>
                    </div>
                    <p>
                      <b>Nhân viên:</b> {submittedClaim.fullname}
                    </p>
                    <p>
                      <b>Lượt bổ sung:</b>{' '}
                      <span className="font-extrabold text-[var(--kg-primary-ink)]">{submittedClaim.type}</span>{' '}
                      • <span className="font-mono tabular-nums font-bold">{submittedClaim.time}</span> ngày{' '}
                      <span className="font-mono tabular-nums font-bold">
                        {submittedClaim.effectiveDate || submittedClaim.date}
                      </span>
                    </p>
                    <p>
                      <b>Lý do:</b> {submittedClaim.reason}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyZalo(submittedClaim)}
                      className="w-full py-3 px-3.5 min-h-[44px] bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)] text-[var(--kg-text)] border border-[var(--kg-border-strong)] rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 touch-manipulation"
                    >
                      {copiedZalo ? <Check size={15} className="text-[var(--kg-success)]" /> : <Copy size={15} />}
                      <span>{copiedZalo ? 'Đã sao chép Zalo' : 'Sao chép báo Zalo'}</span>
                    </button>

                    <button
                      type="button"
                      data-testid="missed-done-close-btn"
                      onClick={onClose}
                      className="w-full py-3 px-3.5 min-h-[44px] bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 touch-manipulation"
                    >
                      <Check size={15} />
                      <span>Hoàn tất &amp; Quay lại</span>
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3.5">
                  {/* Auto-detected Missing Punch Chips (if any in last 14 days) */}
                  {missingDateAlerts.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--kg-warning)] block">
                        Phát hiện ngày thiếu lượt:
                      </span>
                      <div className="flex gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar">
                        {missingDateAlerts.slice(0, 4).map((alert) => {
                          const isSelected = claimDate === alert.dateStr;
                          return (
                            <button
                              key={alert.id}
                              type="button"
                              onClick={() => {
                                setClaimDate(alert.dateStr);
                                setManualEmptyDayAction(null);
                              }}
                              className={`px-2.5 py-1.5 min-h-[44px] sm:min-h-[36px] rounded-xl border text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition touch-manipulation ${
                                isSelected
                                  ? 'bg-[var(--kg-primary)] text-[var(--kg-primary-fg)] border-[var(--kg-primary)] shadow-2xs'
                                  : 'bg-[var(--kg-warning-soft)] text-[var(--kg-text)] border-[var(--kg-warning)]/30 hover:brightness-95'
                              }`}
                            >
                              <span className="font-mono tabular-nums">{alert.dateStr}</span>
                              <span>• Thiếu {alert.missingType}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Step 1: Workday Date Picker + Hôm nay / Hôm qua Pills */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-extrabold text-[var(--kg-text-muted)] uppercase tracking-wider flex items-center gap-1">
                        <Calendar size={12} /> Ngày ca làm việc
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setClaimDate(todayWorkdayDmy);
                            setManualEmptyDayAction(null);
                          }}
                          className={`px-2.5 py-1.5 min-h-[44px] sm:min-h-[36px] sm:py-1 rounded-lg text-[11px] font-bold border transition touch-manipulation whitespace-nowrap ${
                            claimDate === todayWorkdayDmy
                              ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] border-[var(--kg-nav-active)]'
                              : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)]'
                          }`}
                        >
                          Hôm nay
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setClaimDate(yesterdayWorkdayDmy);
                            setManualEmptyDayAction(null);
                          }}
                          className={`px-2.5 py-1.5 min-h-[44px] sm:min-h-[36px] sm:py-1 rounded-lg text-[11px] font-bold border transition touch-manipulation whitespace-nowrap ${
                            claimDate === yesterdayWorkdayDmy
                              ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] border-[var(--kg-nav-active)]'
                              : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)]'
                          }`}
                        >
                          Hôm qua
                        </button>
                      </div>
                    </div>

                    <input
                      type="date"
                      aria-label="Chọn ngày bổ sung công"
                      data-testid="missed-date-input"
                      value={dmyToIso(claimDate)}
                      onChange={(e) => {
                        if (e.target.value) {
                          setClaimDate(isoToDmy(e.target.value));
                          setManualEmptyDayAction(null);
                        }
                      }}
                      required
                      className="w-full px-3 py-2.5 min-h-[46px] rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] text-base sm:text-sm font-bold font-mono tabular-nums text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15"
                    />
                  </div>

                  {/* Step 2: Smart Missing-Punch Status Indicator ("Vào ca" OR "Ra ca") */}
                  <div className="p-3 rounded-2xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--kg-text-muted)]">
                        Lượt cần bổ sung ngày <span className="font-mono tabular-nums text-[var(--kg-text)]">{suppResolution.dateStr}</span>
                      </span>
                      {suppResolution.cyclePunches.length > 0 ? (
                        <div className="flex items-center gap-1 flex-wrap">
                          {suppResolution.cyclePunches.map((p, i) => (
                            <span
                              key={`${p.type}_${p.hhmm}_${i}`}
                              className={`text-[10px] font-mono tabular-nums font-bold px-1.5 py-0.5 rounded border ${
                                p.isPending
                                  ? 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-[var(--kg-warning)]/30'
                                  : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border-[var(--kg-border)]'
                              }`}
                            >
                              {p.type} ({p.hhmm})
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold text-[var(--kg-text-muted)]">
                          Chưa có lượt chấm trong ngày
                        </span>
                      )}
                    </div>

                    {!suppResolution.canSupplement ? (
                      <div className="p-2.5 rounded-xl bg-[var(--kg-success-soft)] border border-[var(--kg-success)]/25 text-xs font-bold text-[var(--kg-success)] flex items-center gap-2">
                        <CheckCircle2 size={16} className="flex-shrink-0" />
                        <span>{suppResolution.reasonHint}</span>
                      </div>
                    ) : (
                      <>
                        {/* Soft-tinted status indicator */}
                        <button
                          type="button"
                          data-testid="missed-smart-type-btn"
                          onClick={() => {
                            const el = document.getElementById('missed-claim-time-input');
                            el?.focus();
                          }}
                          className={`w-full px-3 py-2.5 min-h-[46px] rounded-xl border border-dashed flex items-center justify-between gap-2.5 text-left transition ${
                            isSmartOut
                              ? 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border-[var(--kg-danger)]/40'
                              : 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/40'
                          }`}
                        >
                          <div className="flex items-center gap-2 font-extrabold text-sm">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                isSmartOut
                                  ? 'bg-[var(--kg-danger)] text-white dark:text-[#23170F]'
                                  : 'bg-[var(--kg-success)] text-white dark:text-[#0F2419]'
                              }`}
                            >
                              {isSmartOut ? <LogOut size={15} /> : <LogIn size={15} />}
                            </span>
                            <div className="min-w-0">
                              <span className="block text-[10px] font-bold uppercase tracking-wider opacity-80 leading-none">
                                Hệ thống tự xác định
                              </span>
                              <span className="block text-sm font-extrabold leading-tight mt-0.5">
                                {effectiveBaseAction}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                              isSmartOut
                                ? 'bg-[var(--kg-surface)] border-[var(--kg-danger)]/30 text-[var(--kg-danger)]'
                                : 'bg-[var(--kg-surface)] border-[var(--kg-success)]/30 text-[var(--kg-success)]'
                            }`}
                          >
                            Chờ Admin duyệt
                          </span>
                        </button>

                        <p className="text-[11px] text-[var(--kg-text-muted)] font-medium leading-snug">
                          {suppResolution.reasonHint}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Step 3: Compact Actual Time + Shift */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="min-w-0">
                      <label
                        htmlFor="missed-claim-time-input"
                        className="block text-[11px] font-extrabold text-[var(--kg-text-muted)] mb-1 uppercase tracking-wider truncate"
                      >
                        Giờ {effectiveBaseAction.toLowerCase()} thực tế
                      </label>
                      <input
                        id="missed-claim-time-input"
                        data-testid="missed-time-input"
                        type="time"
                        value={claimTime}
                        onChange={(e) => setClaimTime(e.target.value)}
                        required
                        className="w-full px-3 py-2.5 min-h-[46px] rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] text-base sm:text-sm font-extrabold font-mono tabular-nums text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15"
                      />
                    </div>

                    <div className="min-w-0">
                      <label
                        htmlFor="missed-claim-shift-select"
                        className="block text-[11px] font-extrabold text-[var(--kg-text-muted)] mb-1 uppercase tracking-wider truncate"
                      >
                        Ca đăng ký
                      </label>
                      <select
                        id="missed-claim-shift-select"
                        value={claimShift}
                        onChange={(e) => setClaimShift(e.target.value)}
                        className="w-full px-3 py-2.5 min-h-[46px] rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] text-base sm:text-sm font-bold text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)] focus:ring-2 focus:ring-[var(--kg-primary)]/15"
                      >
                        <option value="15:00">Ca 15:00</option>
                        <option value="16:00">Ca 16:00</option>
                        <option value="17:00">Ca 17:00</option>
                        <option value="18:00">Ca 18:00</option>
                        <option value="19:00">Ca 19:00</option>
                        <option value="Khác">Ca sáng / Ca gãy</option>
                      </select>
                    </div>
                  </div>

                  {/* Quick Time Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
                    <span className="text-[10px] font-bold text-[var(--kg-text-muted)] whitespace-nowrap">
                      Chọn nhanh:
                    </span>
                    {QUICK_TIMES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setClaimTime(t)}
                        className={`px-2.5 py-1.5 sm:py-1 min-h-[44px] sm:min-h-[36px] rounded-lg text-xs sm:text-[11px] font-mono tabular-nums font-bold border transition touch-manipulation shrink-0 ${
                          claimTime === t
                            ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] border-[var(--kg-nav-active)]'
                            : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {/* Overnight <06:00 Automatic +1 Day Notice */}
                  {isOvernightNextDay && (
                    <div className="px-3 py-2 rounded-xl bg-[var(--kg-info-soft)] border border-[var(--kg-info)]/25 text-[11px] font-semibold text-[var(--kg-info)] flex items-center gap-2">
                      <Moon size={14} className="flex-shrink-0" />
                      <span>
                        Ca đêm qua 00:00 → Hệ thống tự ghi ngày <b className="font-mono tabular-nums">{effectiveCalendarDate} {claimTime}</b> (thuộc ca ngày {suppResolution.dateStr}).
                      </span>
                    </div>
                  )}

                  {/* Step 4: Quick Reason Chips + Optional Short Note + Optional Photo */}
                  <div className="space-y-2">
                    <label className="block text-[11px] font-extrabold text-[var(--kg-text-muted)] uppercase tracking-wider">
                      Lý do bổ sung
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {QUICK_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setClaimReasonPreset(r)}
                          className={`py-2 px-2.5 min-h-[44px] sm:min-h-[38px] rounded-xl text-[11px] font-bold text-left transition border leading-tight touch-manipulation ${
                            claimReasonPreset === r
                              ? 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border-[var(--kg-primary)]'
                              : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={claimReasonDetail}
                        onChange={(e) => setClaimReasonDetail(e.target.value)}
                        placeholder="Ghi chú thêm nếu cần (tùy chọn)..."
                        className="flex-1 min-w-0 px-3 py-2 min-h-[44px] sm:min-h-[40px] rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border-strong)] text-base sm:text-xs text-[var(--kg-text)] focus:outline-none focus:border-[var(--kg-primary)]"
                      />
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => (proofImage ? setProofImage(null) : fileInputRef.current?.click())}
                        className={`px-3 py-2 min-h-[44px] sm:min-h-[40px] rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition touch-manipulation ${
                          proofImage
                            ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/35'
                            : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                        }`}
                        title={proofImage ? 'Bấm để xóa ảnh đã chọn' : 'Đính kèm ảnh minh chứng (tùy chọn)'}
                      >
                        <Camera size={14} />
                        <span>{proofImage ? 'Đã kèm ảnh ×' : 'Ảnh'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Sticky Primary Submit CTA */}
                  <div className="sticky -bottom-4 -mx-4 px-4 py-3 bg-[var(--kg-surface)] border-t border-[var(--kg-border)]">
                    <button
                      type="submit"
                      data-testid="missed-submit-btn"
                      disabled={isSubmitting || !suppResolution.canSupplement}
                      className={`w-full py-3.5 px-4 min-h-[48px] rounded-2xl font-extrabold text-sm shadow-sm transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 touch-manipulation ${
                        isSmartOut
                          ? 'bg-[var(--kg-danger)] hover:brightness-95 text-white dark:text-[#23170F]'
                          : 'bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)]'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw size={16} className="animate-spin flex-shrink-0" />
                          <span className="truncate">Đang ghi vào Sheet chấm công...</span>
                        </>
                      ) : (
                        <>
                          <Send size={16} className="flex-shrink-0" />
                          <span className="truncate">Gửi bổ sung {effectiveBaseAction} (Chờ Admin duyệt)</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* TAB 2: EMPLOYEE SUBMITTED CLAIMS */}
          {activeTab === 'history' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-[var(--kg-text-muted)] uppercase tracking-wider">
                  Đơn bổ sung của bạn ({userHistoryClaims.length})
                </span>
                <button
                  type="button"
                  onClick={() => void fetchClaims()}
                  className="text-xs text-[var(--kg-primary-ink)] font-bold flex items-center gap-1 hover:underline min-h-[44px] sm:min-h-[36px] px-2 touch-manipulation"
                >
                  <RefreshCw size={12} className={isLoadingList ? 'animate-spin' : ''} />
                  <span>Làm mới</span>
                </button>
              </div>

              {isLoadingList ? (
                <div className="py-8 text-center text-xs text-[var(--kg-text-muted)]">
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-[var(--kg-primary-ink)]" />
                  Đang tải danh sách đơn...
                </div>
              ) : userHistoryClaims.length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs text-[var(--kg-text-muted)]">
                  Chưa có đơn bổ sung chấm công nào.
                </div>
              ) : (
                userHistoryClaims.map((claim) => (
                  <div
                    key={claim.id}
                    className="p-3 rounded-2xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] space-y-1.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-[10px] text-[var(--kg-text-muted)]">
                          #{claim.id}
                        </span>
                        <h5 className="font-extrabold text-[var(--kg-text)] text-xs sm:text-sm font-mono tabular-nums">
                          {claim.type} • {claim.time} ({claim.effectiveDate || claim.date})
                        </h5>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase whitespace-nowrap ${
                          claim.status === 'Approved'
                            ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                            : claim.status === 'Rejected'
                            ? 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                            : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                        }`}
                      >
                        {claim.status === 'Approved'
                          ? 'Đã duyệt'
                          : claim.status === 'Rejected'
                          ? 'Từ chối'
                          : 'Chờ Admin duyệt'}
                      </span>
                    </div>

                    <p className="text-[11px] text-[var(--kg-text-muted)]">
                      <b>Lý do:</b> {claim.reason}
                    </p>

                    {claim.status === 'Approved' && claim.approvedBy && (
                      <p className="text-[11px] text-[var(--kg-success)] font-semibold">
                        ✓ Đã duyệt tính công bởi <b>{claim.approvedBy}</b>
                      </p>
                    )}

                    {claim.status === 'Rejected' && claim.note && (
                      <p className="text-[11px] text-[var(--kg-danger)] font-semibold">
                        Lý do từ chối: {claim.note}
                      </p>
                    )}

                    {claim.status === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => handleCopyZalo(claim)}
                        className="text-[11px] font-bold text-[var(--kg-primary-ink)] hover:underline inline-flex items-center gap-1 pt-0.5 min-h-[44px] sm:min-h-[36px] touch-manipulation"
                      >
                        <Copy size={12} />
                        <span>Sao chép nhắc Quản lý trên Zalo</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: ADMIN INLINE APPROVAL QUEUE */}
          {activeTab === 'admin' && isAdmin && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-[var(--kg-text-muted)] uppercase tracking-wider">
                  Hàng chờ duyệt ({pendingAdminCount} đơn chờ)
                </span>
                <button
                  type="button"
                  onClick={() => void fetchClaims()}
                  className="text-xs text-[var(--kg-primary-ink)] font-bold flex items-center gap-1 hover:underline min-h-[44px] sm:min-h-[36px] px-2 touch-manipulation"
                >
                  <RefreshCw size={12} className={isLoadingList ? 'animate-spin' : ''} />
                  <span>Làm mới</span>
                </button>
              </div>

              {isLoadingList ? (
                <div className="py-8 text-center text-xs text-[var(--kg-text-muted)]">
                  <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-[var(--kg-primary-ink)]" />
                  Đang tải danh sách...
                </div>
              ) : claimsList.length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs text-[var(--kg-text-muted)]">
                  Không có đơn báo bổ sung nào.
                </div>
              ) : (
                claimsList.map((claim) => {
                  const isBusy = approvingId === claim.id;
                  return (
                    <div
                      key={claim.id}
                      className={`p-3.5 rounded-2xl border space-y-2.5 ${
                        claim.status === 'Pending'
                          ? 'bg-[var(--kg-warning-soft)]/50 border-[var(--kg-warning)]/40'
                          : 'bg-[var(--kg-surface-2)] border-[var(--kg-border)] opacity-85'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] text-[var(--kg-text-muted)]">
                              #{claim.id}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                claim.status === 'Approved'
                                  ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
                                  : claim.status === 'Rejected'
                                  ? 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                                  : 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/30'
                              }`}
                            >
                              {claim.status === 'Approved'
                                ? 'Đã duyệt'
                                : claim.status === 'Rejected'
                                ? 'Từ chối'
                                : 'Chờ duyệt'}
                            </span>
                          </div>
                          <h4 className="text-xs sm:text-sm font-extrabold text-[var(--kg-text)] mt-1 truncate">
                            {claim.fullname}{' '}
                            <span className="text-[11px] font-normal text-[var(--kg-text-muted)]">
                              (@{claim.username})
                            </span>
                          </h4>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-xs font-extrabold text-[var(--kg-primary-ink)] block">
                            {claim.type}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)]">
                            {claim.time} • {claim.effectiveDate || claim.date}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs bg-[var(--kg-surface)] p-2.5 rounded-xl border border-[var(--kg-border)] space-y-1">
                        <p>
                          <b>Ca:</b> {claim.shift || 'Không rõ'} • <b>Lý do:</b> {claim.reason}
                        </p>
                        {claim.proofImage && (
                          <a
                            href={claim.proofImage}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-bold text-[var(--kg-primary-ink)] hover:underline inline-flex items-center gap-1"
                          >
                            <ImageIcon size={12} /> Xem ảnh minh chứng
                          </a>
                        )}
                      </div>

                      {claim.status === 'Pending' && (
                        <div>
                          {rejectingId === claim.id ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                placeholder="Nhập lý do từ chối..."
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="w-full px-3 py-2 min-h-[44px] text-base sm:text-sm rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-danger)] focus:outline-none text-[var(--kg-text)]"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleReject(claim)}
                                  className="flex-1 py-2 min-h-[44px] sm:min-h-[40px] bg-[var(--kg-danger)] hover:brightness-95 text-white dark:text-[#23170F] font-extrabold rounded-xl text-xs disabled:opacity-50 touch-manipulation"
                                >
                                  {isBusy ? 'Đang xử lý...' : 'Xác nhận từ chối'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRejectingId(null)}
                                  className="px-3 py-2 min-h-[44px] sm:min-h-[40px] bg-[var(--kg-surface)] text-xs font-bold rounded-xl border border-[var(--kg-border)] touch-manipulation"
                                >
                                  Hủy
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                data-testid={`approve-claim-${claim.id}`}
                                disabled={isBusy}
                                onClick={() => void handleApprove(claim)}
                                className="flex-1 py-2.5 px-3 min-h-[44px] sm:min-h-[42px] bg-[var(--kg-success)] hover:brightness-95 text-white dark:text-[#0F2419] rounded-xl text-xs font-extrabold transition active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 touch-manipulation"
                              >
                                {isBusy ? (
                                  <RefreshCw size={14} className="animate-spin" />
                                ) : (
                                  <CheckCircle2 size={14} />
                                )}
                                <span>{isBusy ? 'Đang duyệt...' : 'Duyệt & Ghi công'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setRejectingId(claim.id);
                                  setRejectReason('');
                                }}
                                className="py-2.5 px-3 min-h-[44px] sm:min-h-[42px] bg-[var(--kg-danger-soft)] hover:brightness-95 text-[var(--kg-danger)] rounded-xl text-xs font-bold transition active:scale-95 touch-manipulation"
                              >
                                Từ chối
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modalContent;
  return createPortal(modalContent, document.body);
}
