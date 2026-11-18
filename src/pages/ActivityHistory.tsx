import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type LogEntry } from '../store/useAppStore';
import { openPreview } from '../components/ImagePreview';
import {
  speak,
  fetchWithRetry,
  auditCheckInAnomalies,
  matchesUser,
  parseLogDate,
  isCheckInLabel,
  isCheckOutLabel,
  isPendingSupplementLabel,
  isPendingCheckInSupplementLabel,
  isPendingCheckOutSupplementLabel,
  isRejectedSupplementLabel,
} from '../utils/helpers';
import { formatUnifiedPunchLabel } from '../utils/attendanceSequence';
import { callApi } from '../services/api';
import { refreshAppData } from '../utils/refreshData';
import { enqueueTask } from '../utils/offlineQueue';
import confetti from 'canvas-confetti';
import {
  CalendarCheck,
  ShieldCheck,
  FileSpreadsheet,
  PackageOpen,
  Image as ImageIcon,
  CircleCheck,
  CircleAlert,
  Loader2,
  Users,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Calendar,
  Search,
  ChevronDown,
  Layers,
  X,
  CloudUpload,
  Smartphone,
} from 'lucide-react';
import { KgModuleHero, KgBottomSheet, KgButton, KgTextarea, KgAlertCard, KgConfirmSheet, KgToast, type ToastMessage } from '../components/KgDesignSystem';

type TypeFilter = 'ALL' | 'IN' | 'OUT' | 'ANOMALY';

function getLogTimestampMs(log: LogEntry): number {
  if (typeof log.timestamp === 'number' && log.timestamp > 0) return log.timestamp;
  const parsed = parseLogDate(log.time);
  return parsed ? parsed.getTime() : 0;
}

function extractMonthYmFromLog(log: LogEntry): string {
  const clean = String(log.time || '').replace(/^'/, '').trim();
  const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(parseInt(dmy[2], 10)).padStart(2, '0')}`;
  }
  const parsed = parseLogDate(clean);
  if (parsed) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
  }
  return '';
}

function extractDateHeaderFromLog(log: LogEntry): { key: string; label: string } {
  const parsed = parseLogDate(log.time);
  if (parsed) {
    const weekdays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return {
      key: `${yyyy}-${mm}-${dd}`,
      label: `${weekdays[parsed.getDay()]}, ${dd}/${mm}/${yyyy}`,
    };
  }
  const clean = String(log.time || '').replace(/^'/, '').trim();
  const datePart = clean.split(' ')[0] || 'Không rõ ngày';
  return { key: datePart, label: datePart };
}

function formatMonthLabel(ym: string): string {
  const m = ym.match(/^(\d{4})-(\d{2})$/);
  if (!m) return ym;
  return `Tháng ${m[2]}/${m[1]}`;
}

function makeLogDedupeKey(log: LogEntry): string {
  const normName = String(log.fullname || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const cleanTime = String(log.time || '').replace(/^'/, '').trim();
  const cleanType = String(log.type || '').trim().toLowerCase();
  const rowTag = log.rowIndex ? `r${log.rowIndex}:${log.sourceSheet || ''}` : '';
  return `${normName}|${cleanTime}|${cleanType}|${rowTag}`;
}

function makeLooseDedupeKey(log: LogEntry): string {
  const normName = String(log.fullname || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const cleanTime = String(log.time || '').replace(/^'/, '').trim();
  const cleanType = String(log.type || '').trim().toLowerCase();
  return `${normName}|${cleanTime}|${cleanType}`;
}

export default function ActivityHistory() {
  const { logs, currentUser, isUpdating, groqKeys, users } = useAppStore(
    useShallow((s) => ({
      logs: s.logs,
      currentUser: s.currentUser,
      isUpdating: s.isUpdating,
      groqKeys: s.groqKeys,
      users: s.users,
    }))
  );

  const isAdmin = currentUser?.role === 'admin';
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [visibleLimit, setVisibleLimit] = useState<number>(80);

  // Full remote history state (untruncated from GET_CHECKIN_LOGS)
  const [fullRemoteLogs, setFullRemoteLogs] = useState<LogEntry[] | null>(null);
  const [remoteAvailableMonths, setRemoteAvailableMonths] = useState<string[]>([]);
  const [isLoadingFullLogs, setIsLoadingFullLogs] = useState<boolean>(false);

  // Edit log modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [newTypeChoice, setNewTypeChoice] = useState<string>('Vào ca');
  const [editReason, setEditReason] = useState<string>('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [sheetConfirmOpen, setSheetConfirmOpen] = useState(false);
  const [aiReviewSheet, setAiReviewSheet] = useState<{
    open: boolean;
    loading: boolean;
    text: string;
    error?: string;
  }>({ open: false, loading: false, text: '' });
  const [inlineNotice, setInlineNotice] = useState<{
    variant: 'error' | 'warning' | 'success' | 'info';
    title: string;
    text: string;
  } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((title: string, type: ToastMessage['type'] = 'info') => {
    setToasts((prev) => [...prev.slice(-2), { id: `${Date.now()}_${Math.random()}`, title, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const selectedAdminTarget = useMemo(() => {
    if (!isAdmin || selectedUser === 'ALL') return null;
    return (
      users.find((u) => u.fullname === selectedUser || u.username === selectedUser) || {
        fullname: selectedUser,
        username: '',
      }
    );
  }, [isAdmin, selectedUser, users]);

  const fetchCompleteHistory = useCallback(
    async (forceRefresh = false) => {
      if (!currentUser?.username && !currentUser?.fullname) return;
      setIsLoadingFullLogs(true);
      try {
        const payload: Record<string, any> = {
          username: currentUser.username,
          fullname: currentUser.fullname,
          role: currentUser.role || 'user',
          month: selectedMonth,
          includeAllArchiveSheets: selectedMonth !== 'ALL',
          forceRefresh,
        };

        if (isAdmin) {
          if (selectedAdminTarget) {
            payload.targetFullname = selectedAdminTarget.fullname;
            if (selectedAdminTarget.username) {
              payload.targetUsername = selectedAdminTarget.username;
            }
          } else {
            payload.targetFullname = 'ALL';
            payload.targetUsername = 'ALL';
          }
        }

        const res = await callApi('GET_CHECKIN_LOGS', payload, {
          background: true,
          cacheTtlMs: forceRefresh ? 0 : 45_000,
        });

        if (res?.ok && Array.isArray(res.data?.logs)) {
          setFullRemoteLogs(res.data.logs);
          if (Array.isArray(res.data.availableMonths) && res.data.availableMonths.length > 0) {
            setRemoteAvailableMonths((prev) => {
              const mergedSet = new Set([...prev, ...res.data.availableMonths]);
              return Array.from(mergedSet).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
            });
          }
        }
      } catch (err) {
        console.warn('[ActivityHistory] GET_CHECKIN_LOGS fallback to store logs:', err);
      } finally {
        setIsLoadingFullLogs(false);
      }
    },
    [currentUser, isAdmin, selectedAdminTarget, selectedMonth]
  );

  useEffect(() => {
    fetchCompleteHistory(false);
  }, [fetchCompleteHistory]);

  // Reset pagination slice when filters change
  useEffect(() => {
    setVisibleLimit(80);
  }, [selectedUser, selectedMonth, typeFilter, searchQuery]);

  // Combine complete remote logs + latest local/optimistic store logs without losing any row
  const mergedUserScopedLogs = useMemo(() => {
    const storeMatching = logs.filter((l) => {
      if (!isAdmin) return matchesUser(l, currentUser);
      if (selectedAdminTarget) return matchesUser(l, selectedAdminTarget);
      return true;
    });

    const baseList = fullRemoteLogs !== null ? fullRemoteLogs : storeMatching;
    const remoteFiltered = baseList.filter((l) => {
      if (!isAdmin) return matchesUser(l, currentUser);
      if (selectedAdminTarget) return matchesUser(l, selectedAdminTarget);
      return true;
    });

    const combined: LogEntry[] = [...remoteFiltered];
    const looseSeen = new Set(remoteFiltered.map(makeLooseDedupeKey));

    // Overlay any brand-new optimistic/offline punches from store that aren't in remote yet
    for (const localLog of storeMatching) {
      if (selectedMonth !== 'ALL') {
        const localYm = extractMonthYmFromLog(localLog);
        if (localYm && localYm !== selectedMonth) continue;
      }
      const lk = makeLooseDedupeKey(localLog);
      if (!looseSeen.has(lk)) {
        looseSeen.add(lk);
        combined.push(localLog);
      }
    }

    combined.sort((a, b) => getLogTimestampMs(b) - getLogTimestampMs(a));
    return combined;
  }, [fullRemoteLogs, logs, isAdmin, currentUser, selectedAdminTarget, selectedMonth]);

  // Available months dropdown options (discovered from server + local logs)
  const monthOptions = useMemo(() => {
    const set = new Set<string>(remoteAvailableMonths);
    const now = new Date();
    set.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    for (const l of logs) {
      const ym = extractMonthYmFromLog(l);
      if (ym) set.add(ym);
    }
    for (const l of mergedUserScopedLogs) {
      const ym = extractMonthYmFromLog(l);
      if (ym) set.add(ym);
    }
    return Array.from(set)
      .filter(Boolean)
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [remoteAvailableMonths, logs, mergedUserScopedLogs]);

  // Audit anomalies for current target user (or current user)
  const anomalyTarget = isAdmin && selectedAdminTarget ? selectedAdminTarget : currentUser;
  const anomalies = useMemo(
    () => auditCheckInAnomalies(mergedUserScopedLogs, anomalyTarget),
    [mergedUserScopedLogs, anomalyTarget]
  );
  const anomalyTimeSet = useMemo(() => new Set(anomalies.map((a) => a.logTime)), [anomalies]);

  // Apply Month + Search + Type filters
  const monthScopedLogs = useMemo(() => {
    if (selectedMonth === 'ALL') return mergedUserScopedLogs;
    return mergedUserScopedLogs.filter((l) => extractMonthYmFromLog(l) === selectedMonth);
  }, [mergedUserScopedLogs, selectedMonth]);

  const countsByType = useMemo(() => {
    let checkIn = 0;
    let checkOut = 0;
    let valid = 0;
    let anomalyCnt = 0;
    for (const l of monthScopedLogs) {
      if (isCheckInLabel(l.type) || isPendingCheckInSupplementLabel(l.type)) checkIn++;
      else if (isCheckOutLabel(l.type) || isPendingCheckOutSupplementLabel(l.type)) checkOut++;
      const isLocalQueued = Boolean(
        l.localQueued || l.status?.includes('Lưu tạm') || l.status?.includes('Chờ mạng')
      );
      const isEdgeBuffered = Boolean(
        !isLocalQueued &&
          (l.edgeBuffered || l.sheetSynced === false || l.status?.includes('Đám mây'))
      );
      const isVal =
        !isLocalQueued &&
        (isEdgeBuffered ||
          l.status?.includes('Hợp lệ') ||
          l.status?.includes('HỢP LỆ') ||
          l.status === 'Đồng bộ...');
      if (isVal) valid++;
      if (anomalyTimeSet.has(l.time)) anomalyCnt++;
    }
    return {
      total: monthScopedLogs.length,
      checkIn,
      checkOut,
      valid,
      anomaly: anomalyCnt,
    };
  }, [monthScopedLogs, anomalyTimeSet]);

  const displayLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return monthScopedLogs.filter((log) => {
      const isIn = isCheckInLabel(log.type) || isPendingCheckInSupplementLabel(log.type);
      const isOut = isCheckOutLabel(log.type) || isPendingCheckOutSupplementLabel(log.type);
      if (typeFilter === 'IN' && !isIn) return false;
      if (typeFilter === 'OUT' && !isOut) return false;
      if (typeFilter === 'ANOMALY' && !anomalyTimeSet.has(log.time)) return false;

      if (q) {
        const hay = `${log.time} ${log.type} ${log.fullname} ${log.status || ''} ${log.note || ''} ${log.location || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [monthScopedLogs, typeFilter, searchQuery, anomalyTimeSet]);

  const visibleLogs = useMemo(
    () => displayLogs.slice(0, visibleLimit),
    [displayLogs, visibleLimit]
  );

  // Group visible logs by calendar day so staff can easily audit missing punches day-by-day
  const groupedVisibleLogs = useMemo(() => {
    const groups: {
      dateKey: string;
      dateLabel: string;
      inCount: number;
      outCount: number;
      items: LogEntry[];
    }[] = [];
    const map = new Map<string, (typeof groups)[number]>();

    for (const log of visibleLogs) {
      const { key, label } = extractDateHeaderFromLog(log);
      let grp = map.get(key);
      if (!grp) {
        grp = { dateKey: key, dateLabel: label, inCount: 0, outCount: 0, items: [] };
        map.set(key, grp);
        groups.push(grp);
      }
      if (isCheckInLabel(log.type) || isPendingCheckInSupplementLabel(log.type)) grp.inCount++;
      else if (isCheckOutLabel(log.type) || isPendingCheckOutSupplementLabel(log.type)) grp.outCount++;
      grp.items.push(log);
    }
    return groups;
  }, [visibleLogs]);

  const handleManualRefresh = () => {
    refreshAppData(true);
    fetchCompleteHistory(true);
  };

  const openTimesheet = () => {
    setSheetConfirmOpen(true);
  };

  const analyzeMyProductivity = async () => {
    setInlineNotice(null);
    const myLogsList = mergedUserScopedLogs.filter((l) => matchesUser(l, currentUser));
    if (myLogsList.length === 0) {
      setInlineNotice({
        variant: 'info',
        title: 'Chưa có dữ liệu',
        text: 'Bạn chưa có dữ liệu chấm công để AI đánh giá.',
      });
      return;
    }

    setAiReviewSheet({ open: true, loading: true, text: '' });

    const myLogs = myLogsList
      .slice(0, 12)
      .map((l) => `${l.type} lúc ${l.time} - Trạng thái: ${l.status}`);
    const promptText = `Đây là lịch sử đi làm của tôi (${currentUser?.fullname}, tổng cộng ${myLogsList.length} lượt ghi nhận): \n${myLogs.join('\n')}\nHãy đưa ra một lời nhận xét thật vui vẻ, tự nhiên và động viên tôi (chỉ khoảng 2-3 câu).`;

    const messages = [
      {
        role: 'system',
        content:
          "Bạn là một Quản lý nhân sự người Việt Nam vô cùng thân thiện, tâm lý và gần gũi của nhà hàng King's Grill. Hãy dùng từ ngữ khích lệ chuẩn văn phong người Việt, khen ngợi hoặc động viên nhân viên một cách tự nhiên nhất. Tuyệt đối không dùng từ ngữ dịch máy, cứng nhắc.",
      },
      { role: 'user', content: promptText },
    ];

    try {
      let aiText = '';
      const proxyRes = await callApi(
        'AI_CHAT',
        {
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.6,
          max_tokens: 200,
        },
        { background: true, cacheTtlMs: 0 }
      );

      if (proxyRes?.ok && (proxyRes.data?.reply || proxyRes.data?.content)) {
        aiText = proxyRes.data.reply || proxyRes.data.content;
      } else {
        const selectedKey =
          groqKeys.length > 0 ? groqKeys[Math.floor(Math.random() * groqKeys.length)] : null;
        const apiKey = typeof selectedKey === 'string' ? selectedKey : selectedKey?.key;
        if (!apiKey) {
          setAiReviewSheet({
            open: true,
            loading: false,
            text: '',
            error: proxyRes?.message || 'Hệ thống AI máy chủ đang bảo trì hoặc chưa đồng bộ khóa API.',
          });
          return;
        }
        const result = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages,
            temperature: 0.6,
            max_tokens: 200,
          }),
        });
        aiText = result.choices?.[0]?.message?.content || 'Không thể phân tích lúc này.';
      }

      setAiReviewSheet({ open: true, loading: false, text: aiText });
      speak(aiText);
    } catch {
      speak('Lỗi kết nối Gờ rốc AI.');
      setAiReviewSheet({
        open: true,
        loading: false,
        text: '',
        error: 'Lỗi kết nối AI. Vui lòng thử lại sau.',
      });
    }
  };

  const handleOpenEdit = (log: LogEntry) => {
    setEditingLog(log);
    const isIn = isCheckInLabel(log.type);
    setNewTypeChoice(isIn ? 'Ra ca' : 'Vào ca');
    setEditReason('');
    setEditModalOpen(true);
  };

  const handleConfirmEditType = async () => {
    if (!editingLog || !currentUser) return;
    setIsSubmittingEdit(true);
    setInlineNotice(null);
    try {
      if (!isAdmin) {
        const now = new Date();
        const fallbackDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        const parsedDate = editingLog.time.match(/(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1] || fallbackDate;
        const parsedTime = editingLog.time.match(/(\d{1,2}:\d{2})/)?.[1] || '00:00';
        const claimPayload = {
          username: currentUser.username,
          fullname: currentUser.fullname || currentUser.username,
          date: parsedDate,
          time: parsedTime,
          type: newTypeChoice,
          shift: 'Đổi loại ca',
          reason: `[Đề nghị sửa từ "${editingLog.type}" → "${newTypeChoice}"] ${editReason || 'Nhân viên báo chọn nhầm loại ca'}`,
        };
        try {
          const claimRes = await callApi('SUBMIT_MISSED_CHECKIN', claimPayload);
          if (claimRes && !claimRes.ok) {
            setInlineNotice({
              variant: 'error',
              title: 'Không thể gửi yêu cầu',
              text: claimRes.message || 'Máy chủ từ chối yêu cầu.',
            });
            return;
          }
          setEditModalOpen(false);
          confetti({ particleCount: 55, spread: 55, origin: { y: 0.6 } });
          pushToast(`Đã gửi yêu cầu đổi sang "${newTypeChoice}" tới Quản lý duyệt!`, 'success');
          setInlineNotice({
            variant: 'success',
            title: 'Đã gửi Quản lý duyệt!',
            text: `Yêu cầu đổi sang "${newTypeChoice}" đã được chuyển tới Ban Quản Lý phê duyệt.`,
          });
        } catch {
          enqueueTask('SUBMIT_MISSED_CHECKIN', claimPayload);
          setEditModalOpen(false);
          setInlineNotice({
            variant: 'info',
            title: 'Đã lưu vào hàng đợi Offline',
            text: 'Yêu cầu điều chỉnh loại ca sẽ tự động gửi tới Quản lý ngay khi có mạng.',
          });
        }
        return;
      }

      const res = await callApi('UPDATE_CHECKIN_TYPE', {
        username: currentUser.username,
        fullname: editingLog.fullname,
        targetUsername: editingLog.username,
        sourceSheet: editingLog.sourceSheet,
        role: currentUser.role,
        rowIndex: editingLog.rowIndex,
        time: editingLog.time,
        originalType: editingLog.type,
        newType: newTypeChoice,
        reason: editReason || 'Quản lý cập nhật loại chấm công',
      });

      if (res?.ok) {
        useAppStore.getState().updateLogType(editingLog.time, newTypeChoice, editReason);
        setFullRemoteLogs((prev) =>
          prev
            ? prev.map((item) =>
                item.time === editingLog.time && item.fullname === editingLog.fullname
                  ? {
                      ...item,
                      type: newTypeChoice,
                      isCorrected: true,
                      originalType: editingLog.type,
                      editReason: editReason || 'Quản lý cập nhật loại chấm công',
                    }
                  : item
              )
            : prev
        );
        setEditModalOpen(false);
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        speak('Đã cập nhật loại chấm công thành công.');
        pushToast(`Đã sửa thành "${newTypeChoice}" trên Bảng Chấm Công gốc!`, 'success');
        refreshAppData(true);
        fetchCompleteHistory(true);
      } else {
        setInlineNotice({
          variant: 'error',
          title: 'Lỗi cập nhật',
          text: res?.message || 'Không thể cập nhật loại chấm công.',
        });
      }
    } catch (err: any) {
      setInlineNotice({
        variant: 'error',
        title: 'Lỗi hệ thống',
        text: err.message || 'Lỗi hệ thống khi cập nhật.',
      });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const isSyncingAny = isUpdating || isLoadingFullLogs;

  return (
    <div className="p-4 space-y-4 animate-slide-up pb-10">
      <KgModuleHero
        moduleId="history"
        title="Lịch sử Hoạt động"
        description="Tải đầy đủ 100% các lượt vào ca, ra ca trên toàn bộ sổ chấm công để đối chiếu minh bạch."
        eyebrow="Nhật ký đầy đủ"
      />

      {inlineNotice && (
        <KgAlertCard variant={inlineNotice.variant} title={inlineNotice.title}>
          {inlineNotice.text}
        </KgAlertCard>
      )}

      {/* Anomaly Detection Banner */}
      {anomalies.length > 0 && (
        <div className="bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/35 rounded-2xl p-3.5 text-[var(--kg-text)] shadow-2xs animate-fade-in">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl bg-[var(--kg-danger)] text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
                <CircleAlert size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-black text-[var(--kg-danger)] uppercase tracking-wider bg-[var(--kg-danger)]/15 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                    <AlertTriangle size={10} /> Cần kiểm tra: {anomalies[0].title}
                  </span>
                  <span className="text-xs font-bold text-[var(--kg-text)] font-mono tabular-nums">
                    {anomalies[0].logTime}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-[var(--kg-text)] flex-wrap">
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/15 px-1.5 py-0.5 rounded-md">
                    <CircleCheck size={11} /> "{formatUnifiedPunchLabel(anomalies[0].suggestedType)}"
                  </span>
                  <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-md text-[11px]">
                    <CircleAlert size={11} /> "{formatUnifiedPunchLabel(anomalies[0].type)}"
                  </span>
                  {anomalies.length > 1 && (
                    <span className="text-[10px] text-[var(--kg-text-muted)] font-medium tabular-nums">
                      (+{anomalies.length - 1} ca khác)
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTypeFilter(typeFilter === 'ANOMALY' ? 'ALL' : 'ANOMALY')}
              className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-danger)]/30 text-[11px] font-bold text-[var(--kg-danger)] whitespace-nowrap hover:opacity-90 transition active:scale-95 touch-manipulation"
            >
              {typeFilter === 'ANOMALY' ? 'Xem tất cả' : 'Lọc ca lỗi'}
            </button>
          </div>
        </div>
      )}

      {/* Accurate Full-Dataset KPI Summary (360px-safe 2-col -> 3-col) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5">
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3 sm:p-4 rounded-2xl min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="p-1 sm:p-1.5 bg-[var(--kg-primary-soft)] rounded-lg text-[var(--kg-primary)] flex-shrink-0">
              <Layers size={13} />
            </div>
            <p className="text-[10.5px] sm:text-xs text-[var(--kg-text-muted)] font-bold uppercase tracking-tight sm:tracking-wider truncate">
              Tổng lượt
            </p>
          </div>
          <h4 className="text-lg sm:text-2xl font-extrabold font-mono tabular-nums text-[var(--kg-text)]">
            {countsByType.total}
          </h4>
          <p className="text-[10px] sm:text-[11px] text-[var(--kg-text-muted)] truncate mt-0.5">
            {selectedMonth === 'ALL' ? 'Toàn bộ' : formatMonthLabel(selectedMonth)}
          </p>
        </div>

        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3 sm:p-4 rounded-2xl min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="p-1 sm:p-1.5 bg-[var(--kg-accent-soft)] rounded-lg text-[var(--kg-accent-ink)] flex-shrink-0">
              <CalendarCheck size={13} />
            </div>
            <p className="text-[10.5px] sm:text-xs text-[var(--kg-text-muted)] font-bold uppercase tracking-tight sm:tracking-wider truncate">
              Vào / Ra
            </p>
          </div>
          <h4 className="text-lg sm:text-2xl font-extrabold font-mono tabular-nums text-[var(--kg-text)]">
            {countsByType.checkIn}
            <span className="text-[var(--kg-text-soft)] font-semibold mx-0.5">/</span>
            {countsByType.checkOut}
          </h4>
          <p className="text-[10px] sm:text-[11px] text-[var(--kg-text-muted)] truncate mt-0.5">
            Lượt vào • ra
          </p>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3 sm:p-4 rounded-2xl min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="p-1 sm:p-1.5 bg-[var(--kg-success-soft)] rounded-lg text-[var(--kg-success)] flex-shrink-0">
              <ShieldCheck size={13} />
            </div>
            <p className="text-[10.5px] sm:text-xs text-[var(--kg-text-muted)] font-bold uppercase tracking-tight sm:tracking-wider truncate">
              Hợp lệ
            </p>
          </div>
          <h4 className="text-lg sm:text-2xl font-extrabold font-mono tabular-nums text-[var(--kg-success)]">
            {countsByType.valid}
          </h4>
          <p className="text-[10px] sm:text-[11px] text-[var(--kg-text-muted)] truncate mt-0.5">
            Đạt chuẩn GPS
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className={`grid gap-2.5 ${isAdmin ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {isAdmin && (
          <button
            type="button"
            onClick={openTimesheet}
            className="w-full min-h-[42px] bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] text-[var(--kg-text)] font-bold py-2.5 px-4 shadow-2xs transition-all active:scale-99 flex items-center justify-center touch-manipulation border border-[var(--kg-border)] rounded-xl text-xs sm:text-sm"
          >
            <FileSpreadsheet size={16} className="mr-2 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span>XEM SHEET CHẤM CÔNG GỐC</span>
          </button>
        )}

        <button
          type="button"
          onClick={analyzeMyProductivity}
          className="w-full min-h-[42px] bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-bold py-2.5 px-4 shadow-2xs transition-all active:scale-99 flex items-center justify-center touch-manipulation rounded-xl text-xs sm:text-sm"
        >
          <Sparkles size={16} className="mr-2 text-[var(--kg-accent)] flex-shrink-0" />
          <span>AI ĐÁNH GIÁ NĂNG SUẤT</span>
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-surface)] p-3 sm:p-3.5 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="font-bold text-sm sm:text-base text-[var(--kg-text)] whitespace-nowrap">
              Nhật ký chi tiết
            </h3>
            {isSyncingAny ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-[10.5px] font-semibold whitespace-nowrap">
                <Loader2 size={11} className="animate-spin" />
                <span>Đang tải...</span>
              </span>
            ) : fullRemoteLogs !== null ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--kg-success-soft)] text-[var(--kg-success)] text-[10.5px] font-bold whitespace-nowrap">
                <CheckCircle2 size={11} />
                <span className="sm:hidden">Đủ 100%</span>
                <span className="hidden sm:inline">Đã tải đầy đủ 100%</span>
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] hover:border-[var(--kg-border-strong)] text-[var(--kg-text)] text-xs font-bold inline-flex items-center gap-1.5 transition active:scale-95 flex-shrink-0 touch-manipulation"
            title="Tải lại toàn bộ dữ liệu chấm công từ Google Sheets"
          >
            <RotateCcw size={13} className={isSyncingAny ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Làm mới</span>
          </button>
        </div>

        {/* Selectors Row: Month + (Admin) Employee + Search */}
        <div className={`grid gap-2 ${isAdmin ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {/* Month Selector */}
          <div className="flex items-center gap-2 px-3 min-h-[40px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
            <Calendar size={14} className="text-[var(--kg-text-muted)] flex-shrink-0" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              aria-label="Chọn tháng xem lịch sử chấm công"
              style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }}
              className="!bg-transparent !border-0 !shadow-none !p-0 text-xs sm:text-sm font-semibold focus:outline-none text-[var(--kg-text)] w-full py-1.5"
            >
              <option value="ALL">Tất cả các tháng</option>
              {monthOptions.map((ym) => (
                <option key={ym} value={ym}>
                  {formatMonthLabel(ym)}
                </option>
              ))}
            </select>
          </div>

          {/* Admin Employee Selector */}
          {isAdmin && (
            <div className="flex items-center gap-2 px-3 min-h-[40px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
              <Users size={14} className="text-[var(--kg-text-muted)] flex-shrink-0" />
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                aria-label="Chọn nhân sự cần kiểm tra"
                style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }}
                className="!bg-transparent !border-0 !shadow-none !p-0 text-xs sm:text-sm font-semibold focus:outline-none text-[var(--kg-text)] w-full py-1.5"
              >
                <option value="ALL">Tất cả nhân sự</option>
                {users.map((u) => (
                  <option key={u.username} value={u.fullname}>
                    {u.fullname}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Search Date / Note */}
          <div className="flex items-center gap-2 px-3 min-h-[40px] rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)]">
            <Search size={14} className="text-[var(--kg-text-muted)] flex-shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm ngày (VD: 15/10), ca, ghi chú..."
              style={{ backgroundColor: 'transparent', border: 'none', boxShadow: 'none' }}
              className="!bg-transparent !border-0 !shadow-none !p-0 text-xs sm:text-sm text-[var(--kg-text)] placeholder:text-[var(--kg-text-soft)] focus:outline-none w-full py-1.5"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] p-1"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Type Filter Capsules */}
        <div className="flex items-center gap-1.5 overflow-x-auto hide-scrollbar pt-0.5">
          {(
            [
              { id: 'ALL', label: 'Tất cả', count: countsByType.total },
              { id: 'IN', label: 'Vào ca', count: countsByType.checkIn },
              { id: 'OUT', label: 'Ra ca', count: countsByType.checkOut },
              ...(countsByType.anomaly > 0
                ? [{ id: 'ANOMALY' as const, label: 'Cần kiểm tra', count: countsByType.anomaly }]
                : []),
            ] as { id: TypeFilter; label: string; count: number }[]
          ).map((pill) => {
            const active = typeFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setTypeFilter(pill.id)}
                className={`min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition-all touch-manipulation ${
                  active
                    ? 'bg-[var(--kg-primary)] text-white shadow-2xs'
                    : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                }`}
              >
                <span>{pill.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10.5px] font-mono tabular-nums ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)]'
                  }`}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grouped Log List */}
      <div className="space-y-4">
        {displayLogs.length === 0 ? (
          <div className="text-center py-12 text-[var(--kg-text-muted)] bg-[var(--kg-surface)] rounded-2xl border border-dashed border-[var(--kg-border-strong)]">
            {isSyncingAny ? (
              <>
                <Loader2 size={36} className="mx-auto mb-3 animate-spin text-[var(--kg-primary)]" />
                <p className="font-semibold text-sm text-[var(--kg-text)]">
                  Đang tải toàn bộ lịch sử chấm công...
                </p>
              </>
            ) : (
              <>
                <PackageOpen size={44} className="mx-auto mb-2.5 opacity-55" />
                <p className="font-semibold text-sm text-[var(--kg-text)]">
                  Không có lượt chấm công phù hợp bộ lọc
                </p>
                {(selectedMonth !== 'ALL' || typeFilter !== 'ALL' || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth('ALL');
                      setTypeFilter('ALL');
                      setSearchQuery('');
                    }}
                    className="mt-3 px-3.5 py-1.5 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-xs font-bold hover:opacity-90 transition"
                  >
                    Đặt lại bộ lọc để xem toàn bộ
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {groupedVisibleLogs.map((group) => (
              <div key={group.dateKey} className="space-y-2">
                {/* Day Header Strip */}
                <div className="flex items-center justify-between gap-2 px-1 pt-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-[var(--kg-accent)] flex-shrink-0" />
                    <span className="text-xs font-extrabold text-[var(--kg-text)] tracking-tight truncate">
                      {group.dateLabel}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold font-mono tabular-nums text-[var(--kg-text-muted)] bg-[var(--kg-surface)] border border-[var(--kg-border)] px-2 py-0.5 rounded-full flex-shrink-0">
                    {group.items.length} lượt ({group.inCount} vào • {group.outCount} ra)
                  </span>
                </div>

                {/* Day Punches */}
                <div className="space-y-2">
                  {group.items.map((log, idx) => {
                    const isPendingSupp = isPendingSupplementLabel(log.type);
                    const isRejectedSupp = isRejectedSupplementLabel(log.type);
                    const isIn = isCheckInLabel(log.type);
                    const isLocalQueued = Boolean(
                      log.localQueued ||
                        log.status?.includes('Lưu tạm') ||
                        log.status?.includes('Chờ mạng')
                    );
                    const isEdgeBuffered = Boolean(
                      !isLocalQueued &&
                        (log.edgeBuffered ||
                          log.sheetSynced === false ||
                          log.status?.includes('Đám mây'))
                    );
                    const isPendingStatus = Boolean(log.status?.includes('Chờ'));
                    const isValid =
                      !isLocalQueued &&
                      !isEdgeBuffered &&
                      (log.status?.includes('Hợp lệ') ||
                        log.status?.includes('HỢP LỆ') ||
                        log.status === 'Đồng bộ...' ||
                        log.status === 'Đang đồng bộ...');
                    const logAnomaly = anomalies.find((a) => a.logTime === log.time);
                    const canEdit =
                      !isPendingSupp && !isRejectedSupp && (isAdmin || matchesUser(log, currentUser));

                    return (
                      <div
                        key={`${makeLogDedupeKey(log)}_${idx}`}
                        className={`group soft3d-card p-3.5 sm:p-4 rounded-2xl hover:shadow-sm transition-all relative overflow-hidden ${
                          logAnomaly
                            ? 'border-2 border-rose-500/40 bg-rose-500/5'
                            : isPendingSupp || isLocalQueued
                            ? 'border border-amber-500/40 bg-amber-500/5'
                            : isEdgeBuffered
                            ? 'border border-sky-500/35 bg-sky-500/5'
                            : ''
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span
                                className={`font-black text-xs px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1.5 ${
                                  isPendingSupp
                                    ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-500/35'
                                    : isRejectedSupp
                                    ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-400/30 line-through'
                                    : isIn
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-400 border border-emerald-500/25'
                                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/35 dark:text-rose-400 border border-rose-500/25'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isPendingSupp
                                      ? 'bg-amber-500 animate-pulse'
                                      : isRejectedSupp
                                      ? 'bg-slate-400'
                                      : isIn
                                      ? 'bg-emerald-500'
                                      : 'bg-rose-500'
                                  }`}
                                />
                                {formatUnifiedPunchLabel(log.type).toUpperCase()}
                              </span>

                              {log.isCorrected && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                                  Đã sửa
                                </span>
                              )}

                              {logAnomaly && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 inline-flex items-center gap-1">
                                  <AlertTriangle size={10} />
                                  <span>Cần kiểm tra</span>
                                </span>
                              )}

                              <span className="text-xs font-mono font-semibold tabular-nums text-[var(--kg-text)]">
                                {log.time}
                              </span>
                            </div>

                            {isAdmin && (
                              <p className="text-xs font-bold text-[var(--kg-text)] mb-0.5">
                                {log.fullname}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--kg-text-muted)]">
                              {isLocalQueued ? (
                                <span
                                  data-testid="log-sync-badge-local"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 font-bold text-[11px]"
                                >
                                  <Smartphone size={11} className="flex-shrink-0" />
                                  <span>Lưu tạm trên máy • Chờ mạng</span>
                                </span>
                              ) : isEdgeBuffered ? (
                                <span
                                  data-testid="log-sync-badge-edge"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-800 dark:text-sky-300 border border-sky-500/35 font-bold text-[11px]"
                                >
                                  <CloudUpload size={11} className="flex-shrink-0" />
                                  <span>Đám mây bảo lãnh • Đang ghi Sheet</span>
                                </span>
                              ) : (
                                <p className="inline-flex items-center">
                                  {isValid ? (
                                    <CircleCheck
                                      size={12}
                                      className="mr-1 text-emerald-600 dark:text-emerald-400 flex-shrink-0"
                                    />
                                  ) : isPendingSupp || isPendingStatus ? (
                                    <Loader2
                                      size={12}
                                      className="mr-1 text-amber-600 dark:text-amber-400 flex-shrink-0"
                                    />
                                  ) : (
                                    <CircleAlert
                                      size={12}
                                      className="mr-1 text-rose-600 dark:text-rose-400 flex-shrink-0"
                                    />
                                  )}
                                  <span>{log.status}</span>
                                </p>
                              )}
                              {log.distance && (
                                <span className="text-[11px] font-mono tabular-nums opacity-85">
                                  • {log.distance}
                                </span>
                              )}
                              {log.location && log.location !== 'Khong xac dinh' && (
                                <span
                                  className="text-[11px] opacity-80 truncate max-w-[220px]"
                                  title={log.location}
                                >
                                  • {log.location}
                                </span>
                              )}
                            </div>

                            {log.note && (
                              <p className="text-xs flex items-center mt-1">
                                <CircleAlert
                                  size={11}
                                  className="mr-1 text-amber-500 flex-shrink-0"
                                />
                                <span className="text-amber-700 dark:text-amber-400 font-medium">
                                  {log.note}
                                </span>
                              </p>
                            )}
                          </div>

                          {/* Actions right on card */}
                          <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(log)}
                                className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 text-xs font-bold transition-all active:scale-95 shadow-xs touch-manipulation"
                                title="Đổi giữa Vào ca và Ra ca nếu ghi nhận nhầm"
                              >
                                <Edit3
                                  size={13}
                                  className="text-amber-600 dark:text-amber-400 flex-shrink-0"
                                />
                                <span>{isAdmin ? 'Sửa loại ca' : 'Báo nhầm ca'}</span>
                              </button>
                            )}

                            {log.image &&
                            log.image !== 'Đang tải ảnh...' &&
                            log.image !== 'PENDING' ? (
                              <button
                                type="button"
                                onClick={() => openPreview(log.image!)}
                                className="min-h-[44px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60 text-xs font-bold transition-all active:scale-95 shadow-xs touch-manipulation"
                                title="Xem ảnh minh chứng sắc nét tức thì"
                              >
                                <ImageIcon
                                  size={14}
                                  className="text-sky-600 dark:text-sky-400 flex-shrink-0"
                                />
                                <span>Hình ảnh</span>
                              </button>
                            ) : (log.image === 'Đang tải ảnh...' || log.image === 'PENDING') &&
                              (!log.timestamp || Date.now() - log.timestamp < 15 * 60 * 1000) ? (
                              <div
                                className="min-h-[36px] inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium border border-slate-200 dark:border-slate-700/60"
                                title="Ảnh đang được đồng bộ lên Google Drive"
                              >
                                <Loader2 size={12} className="animate-spin text-sky-500" />
                                <span>Đang lưu ảnh</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Progressive Load More / Show All Footer */}
            <div className="pt-2 flex flex-col items-center gap-2">
              <p className="text-xs font-medium font-mono tabular-nums text-[var(--kg-text-muted)]">
                Đang hiển thị {visibleLogs.length} / {displayLogs.length} lượt chấm công
              </p>

              {visibleLogs.length < displayLogs.length && (
                <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 100)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border-strong)] text-[var(--kg-text)] text-xs font-bold inline-flex items-center gap-1.5 hover:bg-[var(--kg-surface-soft)] transition active:scale-95 touch-manipulation"
                  >
                    <ChevronDown size={15} />
                    <span>
                      Xem thêm {Math.min(100, displayLogs.length - visibleLogs.length)} lượt
                    </span>
                  </button>

                  {displayLogs.length - visibleLogs.length > 100 && (
                    <button
                      type="button"
                      onClick={() => setVisibleLimit(displayLogs.length)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] text-xs font-bold hover:opacity-90 transition active:scale-95 touch-manipulation"
                    >
                      Hiển thị toàn bộ ({displayLogs.length} lượt)
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Edit Check-in Type Bottom Sheet */}
      <KgBottomSheet
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Sửa Loại Chấm Công"
      >
        {editingLog && (
          <div className="space-y-4 text-[var(--kg-text)]">
            <div className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--kg-text-muted)] font-medium">Nhân sự:</span>
                <span className="font-black text-[var(--kg-text)]">{editingLog.fullname}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--kg-text-muted)] font-medium">Thời gian:</span>
                <span className="font-mono font-bold tabular-nums text-[var(--kg-text)]">
                  {editingLog.time}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-[var(--kg-text-muted)] font-medium">Loại hiện tại:</span>
                <span className="font-black px-2 py-0.5 rounded bg-slate-500/15 text-[var(--kg-text)]">
                  {formatUnifiedPunchLabel(editingLog.type)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Chọn loại chấm công chính xác:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'Vào ca', label: 'Vào ca', desc: 'Bắt đầu ca làm việc' },
                  { id: 'Ra ca', label: 'Ra ca', desc: 'Kết thúc ca làm việc' },
                ].map((item) => {
                  const isSelected = newTypeChoice === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setNewTypeChoice(item.id)}
                      className={`p-3 rounded-2xl border text-left transition-all active:scale-95 ${
                        isSelected
                          ? 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-400 ring-2 ring-blue-500/30 font-black'
                          : 'bg-[var(--kg-surface)] border-[var(--kg-border)] text-[var(--kg-text)] hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black">{item.label}</span>
                        {isSelected && <CheckCircle2 size={14} className="text-blue-500" />}
                      </div>
                      <p className="text-[10px] text-[var(--kg-text-muted)] mt-0.5">{item.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-[var(--kg-text-muted)]">
                Lý do điều chỉnh nhanh:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Bấm nhầm khi về',
                  'Bấm nhầm khi đến',
                  'Chấm ca gãy nhầm nút',
                  'Bị cấn màn hình',
                ].map((reasonText) => (
                  <button
                    key={reasonText}
                    type="button"
                    onClick={() => setEditReason(reasonText)}
                    className={`min-h-[44px] sm:min-h-[34px] px-2.5 py-1 rounded-xl text-xs font-bold border transition touch-manipulation ${
                      editReason === reasonText
                        ? 'bg-[var(--kg-primary)] text-white border-[var(--kg-primary)]'
                        : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                    }`}
                  >
                    {reasonText}
                  </button>
                ))}
              </div>
            </div>

            <KgTextarea
              label="Ghi chú chi tiết (lưu lên Google Sheets)"
              placeholder="Nhập lý do chọn nhầm loại chấm công..."
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              rows={2}
            />

            <div className="pt-2 flex gap-2.5">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="flex-1 min-h-[44px] py-3 rounded-xl border border-[var(--kg-border)] text-[var(--kg-text-muted)] text-xs font-black hover:bg-[var(--kg-surface-soft)] transition active:scale-95 touch-manipulation"
              >
                Hủy bỏ
              </button>

              <KgButton
                variant="primary"
                size="md"
                loading={isSubmittingEdit}
                onClick={handleConfirmEditType}
                className="flex-1 py-3 text-xs font-black"
                icon={CheckCircle2}
              >
                {isAdmin ? 'Xác Nhận Sửa' : 'Gửi Quản Lý Duyệt'}
              </KgButton>
            </div>
          </div>
        )}
      </KgBottomSheet>

      <KgConfirmSheet
        isOpen={sheetConfirmOpen}
        onClose={() => setSheetConfirmOpen(false)}
        onConfirm={() => {
          setSheetConfirmOpen(false);
          window.open(
            'https://docs.google.com/spreadsheets/d/1UtDinbNZdOF8LRwxX1SlTKxUBFvr0UG6_iu7NyXDteY',
            '_blank',
            'noopener,noreferrer'
          );
        }}
        title="Hướng dẫn xem dữ liệu gốc"
        message='Bạn sắp được chuyển đến Bảng dữ liệu gốc. Vui lòng tìm và chọn sheet có tên "CHẤM CÔNG" ở thanh công cụ phía dưới cùng để xem dữ liệu của mình nhé!'
        confirmLabel="Đã hiểu, tới Bảng tính"
        cancelLabel="Đóng"
        variant="info"
      />

      <KgBottomSheet
        isOpen={aiReviewSheet.open}
        onClose={() => setAiReviewSheet((prev) => ({ ...prev, open: false }))}
        title="Lời Khuyên Quản Lý AI"
        footer={
          !aiReviewSheet.loading ? (
            <KgButton
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => setAiReviewSheet((prev) => ({ ...prev, open: false }))}
            >
              Cảm ơn AI!
            </KgButton>
          ) : undefined
        }
      >
        {aiReviewSheet.loading ? (
          <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin text-[var(--kg-primary)]" />
            <p className="text-sm font-bold text-[var(--kg-text)]">Llama 3.3 đang đánh giá năng suất...</p>
          </div>
        ) : aiReviewSheet.error ? (
          <KgAlertCard variant="warning" title="Chưa thể đánh giá AI">
            {aiReviewSheet.error}
          </KgAlertCard>
        ) : (
          <div className="text-sm leading-relaxed text-[var(--kg-text)] whitespace-pre-wrap py-1">
            {aiReviewSheet.text}
          </div>
        )}
      </KgBottomSheet>

      {toasts.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 right-4 z-[10090] flex flex-col gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <KgToast key={toast.id} message={toast} onClose={dismissToast} />
          ))}
        </div>
      )}
    </div>
  );
}
