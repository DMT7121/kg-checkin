import { useState, useEffect, useMemo, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { DAY_NAMES, SHORT_DAY_NAMES, computeWeekInfo, ResponsiveShift, getPreviewShiftClass } from '../utils/helpers';
import { isWorkEligible } from '../utils/employment';
import { validateSmartShiftSwap } from '../utils/shiftSwapValidator';
import { Send, BellRing, Copy, User, Megaphone, Inbox, Clock, HandshakeIcon, LogOut, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { KgModuleHero, KgAlertCard, KgButton, KgConfirmSheet, KgToast, type ToastMessage } from '../components/KgDesignSystem';
import { getSafeDisplayInitial } from '../utils/shellLayout';

function formatSwapTimestamp(createdAt: unknown): string {
  if (!createdAt) return 'Chưa rõ thời gian';
  const raw = typeof createdAt === 'number' ? createdAt : Number(createdAt) || Date.parse(String(createdAt));
  if (!Number.isFinite(raw) || raw <= 0) return 'Chưa rõ thời gian';
  const ts = raw < 1e12 ? raw * 1000 : raw;
  const diffMs = Date.now() - ts;
  if (diffMs >= 0 && diffMs < 60_000) return 'Vừa xong';
  if (diffMs >= 0 && diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} phút trước`;
  if (diffMs >= 0 && diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} giờ trước`;
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
}


export default function SwapShift() {
  const store = useAppStore(
    useShallow((s) => ({
      currentUser: s.currentUser,
      users: s.users,
      approvedShifts: s.approvedShifts,
      currentWeekApprovedShifts: s.currentWeekApprovedShifts,
      swapRequests: s.swapRequests,
      hasNewSwaps: s.hasNewSwaps,
      isScheduleRegistered: s.isScheduleRegistered,
      setSwapRequests: s.setSwapRequests,
      setHasNewSwaps: s.setHasNewSwaps,
      setLoading: s.setLoading,
    }))
  );
  const { currentUser, users, approvedShifts, currentWeekApprovedShifts, swapRequests: rawSwapRequests } = store;
  const swapRequests = Array.isArray(rawSwapRequests) ? rawSwapRequests : [];
  const [currentWeekInfo] = useState(() => computeWeekInfo(undefined, false));
  const [nextWeekInfo] = useState(() => computeWeekInfo(undefined, true));
  const [weekScope, setWeekScope] = useState<'current' | 'next'>(() =>
    currentWeekApprovedShifts && currentWeekApprovedShifts.some((s) => s && s !== 'OFF')
      ? 'current'
      : 'next'
  );
  const weekInfo = weekScope === 'current' ? currentWeekInfo : nextWeekInfo;
  const activeApprovedShifts =
    weekScope === 'current'
      ? currentWeekApprovedShifts ?? approvedShifts
      : approvedShifts;
  
  const [viewTab, setViewTab] = useState<'board' | 'post' | 'leave'>('board');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [targetUsername, setTargetUsername] = useState<string>('ALL');
  const [reason, setReason] = useState<string>('');
  const [coworkerShiftMap, setCoworkerShiftMap] = useState<Record<string, string[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<{ variant: 'error' | 'warning' | 'success' | 'info'; title: string; text: string } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [pendingSubmitConfirm, setPendingSubmitConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    isLeave: boolean;
    isPublic: boolean;
    dayIndex: number;
    shift: string;
    targetUsername: string;
    targetFullname: string;
    reasonText: string;
  } | null>(null);
  const [pendingAcceptConfirm, setPendingAcceptConfirm] = useState<{
    req: any;
    otNote: string;
  } | null>(null);
  const [acceptSuccessZaloReq, setAcceptSuccessZaloReq] = useState<any | null>(null);

  const pushToast = useCallback((title: string, type: ToastMessage['type'] = 'info') => {
    setToasts((prev) => [...prev.slice(-2), { id: `${Date.now()}_${Math.random()}`, title, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const eligibleCoworkers = useMemo(() => {
    const myPos = (currentUser?.position || '').trim().toLowerCase();
    return users
      .filter(
        (u) => u.username !== currentUser?.username && u.role !== 'admin' && isWorkEligible(u)
      )
      .sort((a, b) => {
        const aSame = Boolean(myPos && (a.position || '').trim().toLowerCase() === myPos);
        const bSame = Boolean(myPos && (b.position || '').trim().toLowerCase() === myPos);
        if (aSame !== bSame) return aSame ? -1 : 1;
        return (a.fullname || '').localeCompare(b.fullname || '', 'vi');
      });
  }, [users, currentUser?.username, currentUser?.position]);

  const directSwapValidation = useMemo(() => {
    if (viewTab !== 'post' || selectedDayIndex === null || targetUsername === 'ALL') {
      return null;
    }
    const targetEmp = users.find((u) => u.username === targetUsername);
    if (!targetEmp) return null;
    const targetShifts =
      coworkerShiftMap[targetEmp.username.toLowerCase()] ||
      coworkerShiftMap[targetEmp.fullname.trim().toLowerCase()] ||
      null;
    if (!targetShifts) return null;
    return validateSmartShiftSwap({
      dayIndex: selectedDayIndex,
      requesterShift: activeApprovedShifts?.[selectedDayIndex] || 'OFF',
      targetEmployee: targetEmp,
      targetWeekShifts: targetShifts,
    });
  }, [viewTab, selectedDayIndex, targetUsername, users, coworkerShiftMap, activeApprovedShifts]);

  const loadSwapRequests = useCallback(async () => {
    setLoadError(null);
    setIsRefreshing(true);
    try {
      const res = await callApi('GET_SWAP_REQUESTS', {
        username: currentUser?.username,
        role: currentUser?.role
      });
      if (res?.ok) {
        store.setSwapRequests(Array.isArray(res.data) ? res.data : []);
        store.setHasNewSwaps(false);
      } else {
        setLoadError(res?.message || 'Không thể tải danh sách đổi ca. Vui lòng thử lại.');
      }
    } catch {
      setLoadError('Mất kết nối khi tải danh sách đổi ca. Vui lòng thử lại.');
    } finally {
      setIsRefreshing(false);
    }
  }, [currentUser?.username, currentUser?.role]);

  useEffect(() => {
    if (viewTab === 'board') {
      void loadSwapRequests();
    }
  }, [viewTab, loadSwapRequests]);

  useEffect(() => {
    if (viewTab !== 'post') return;
    let cancelled = false;
    void callApi('GET_ALL_SCHEDULES', {
      monthSheet: weekInfo.monthSheet,
      weekLabel: weekInfo.weekLabel,
    }).then((res) => {
      if (cancelled || !res?.ok) return;
      const list = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.schedules)
          ? res.data.schedules
          : [];
      const nextMap: Record<string, string[]> = {};
      for (const entry of list) {
        if (!entry || !Array.isArray(entry.shifts)) continue;
        if (entry.username) nextMap[String(entry.username).trim().toLowerCase()] = entry.shifts;
        if (entry.fullname) nextMap[String(entry.fullname).trim().toLowerCase()] = entry.shifts;
      }
      setCoworkerShiftMap(nextMap);
    });
    return () => {
      cancelled = true;
    };
  }, [viewTab, weekInfo.monthSheet, weekInfo.weekLabel]);

  const handleEnableNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        pushToast('Đã bật thông báo đổi ca!', 'success');
      } else {
        pushToast('Trình duyệt chưa cấp quyền thông báo.', 'warning');
      }
    } catch {
      pushToast('Không thể yêu cầu quyền thông báo trên trình duyệt này.', 'warning');
    }
  };

  const handleSwapRequest = () => {
    setInlineNotice(null);
    if (selectedDayIndex === null) {
      setInlineNotice({ variant: 'warning', title: 'Chưa chọn ngày', text: 'Vui lòng chọn ngày muốn đổi ca.' });
      return;
    }
    
    const myShift = activeApprovedShifts?.[selectedDayIndex] || 'OFF';
    if (myShift === 'OFF') {
      setInlineNotice({ variant: 'warning', title: 'Không thể đổi ca', text: 'Bạn đang OFF ngày này, không thể đổi ca.' });
      return;
    }

    const dayName = DAY_NAMES[selectedDayIndex];
    const isLeave = viewTab === 'leave';
    const isPublic = !isLeave && targetUsername === 'ALL';
    const targetUser = isPublic || isLeave ? null : users.find(u => u.username === targetUsername);

    if (!isLeave && !isPublic && directSwapValidation && !directSwapValidation.valid) {
      setInlineNotice({
        variant: 'error',
        title: 'Trùng lịch ca làm',
        text: directSwapValidation.reason || 'Đồng nghiệp đã có lịch ca trong ngày này.',
      });
      return;
    }

    let confirmTitle = '';
    let confirmBtn = '';
    if (isLeave) {
      confirmTitle = `Gửi yêu cầu xin nghỉ ngày ${dayName}?`;
      confirmBtn = 'Gửi cho Quản Lý';
    } else if (isPublic) {
      confirmTitle = `Đăng yêu cầu đổi ca ${myShift} ngày ${dayName} lên Bảng tin?`;
      confirmBtn = 'Đăng lên Bảng tin';
    } else {
      confirmTitle = `Xin đổi ca ${myShift} ngày ${dayName} với ${targetUser?.fullname}?`;
      confirmBtn = 'Gửi yêu cầu trực tiếp';
    }

    setPendingSubmitConfirm({
      title: 'Xác nhận yêu cầu',
      message: confirmTitle,
      confirmLabel: confirmBtn,
      isLeave,
      isPublic,
      dayIndex: selectedDayIndex,
      shift: myShift,
      targetUsername: isLeave ? 'ADMIN' : (isPublic ? 'ALL' : targetUser?.username || ''),
      targetFullname: isLeave ? 'Quản Lý (Xin Nghỉ Phép)' : (isPublic ? 'ALL' : targetUser?.fullname || ''),
      reasonText: reason || (isLeave ? 'Xin nghỉ phép đột xuất' : 'Cần hỗ trợ đổi ca đột xuất'),
    });
  };

  const executeSwapSubmit = async () => {
    if (!pendingSubmitConfirm || !currentUser) return;
    const item = pendingSubmitConfirm;
    setPendingSubmitConfirm(null);
    store.setLoading(true, 'Đang gửi yêu cầu...');
    try {
      const apiRes = await callApi('SUBMIT_SWAP', {
        username: currentUser.username,
        fullname: currentUser.fullname,
        dayName: DAY_NAMES[item.dayIndex],
        shift: item.shift,
        date: weekInfo.weekDates[item.dayIndex],
        reason: item.reasonText,
        targetUsername: item.targetUsername,
        targetFullname: item.targetFullname,
        monthSheet: weekInfo.monthSheet
      });
      store.setLoading(false);
      if (apiRes?.ok) {
        let successMsg = '';
        if (item.isLeave) successMsg = 'Đơn xin nghỉ phép đã được gửi đến Quản Lý để chờ duyệt.';
        else if (item.isPublic) successMsg = 'Yêu cầu của bạn đã được đăng lên Bảng tin.';
        else successMsg = `Yêu cầu đổi ca đã gửi đến ${item.targetFullname}. Hãy nhắn Zalo cho họ nhé!`;

        setInlineNotice({ variant: 'success', title: 'Đã gửi thành công', text: successMsg });
        pushToast(successMsg, 'success');
        setSelectedDayIndex(null);
        setTargetUsername('ALL');
        setReason('');
        if (item.isPublic || item.isLeave) setViewTab('board');
        void loadSwapRequests();
      } else {
        setInlineNotice({ variant: 'error', title: 'Gửi yêu cầu thất bại', text: apiRes?.message || 'Có lỗi xảy ra.' });
      }
    } catch {
      store.setLoading(false);
      setInlineNotice({ variant: 'error', title: 'Lỗi mạng', text: 'Không thể gửi yêu cầu lúc này. Vui lòng thử lại.' });
    }
  };

  const getZaloMessage = () => {
    if (selectedDayIndex === null || targetUsername === 'ALL') return '';
    const myShift = activeApprovedShifts?.[selectedDayIndex] || 'OFF';
    const dayName = DAY_NAMES[selectedDayIndex];
    const targetUser = users.find(u => u.username === targetUsername);
    const scopeText = weekScope === 'current' ? 'tuần này' : 'tuần tới';
    return `Chào ${targetUser?.fullname}, mình có lịch làm ca ${myShift} vào ${dayName} ${scopeText} (${weekInfo.weekDates[selectedDayIndex]}). Bạn có thể đổi ca này giúp mình được không? Lý do: ${reason || 'Bận việc đột xuất'}. Cảm ơn bạn nhiều!`;
  };

  const getPublicZaloMessage = (req: any) => {
    return `Chào ${req.fullname}, mình thấy bạn đang cần đổi ca ${req.shift} vào ${req.dayName}. Mình có thể làm thay ca này cho bạn nhé!`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    pushToast('Đã copy tin nhắn!', 'success');
  };

  const handleAcceptSwap = (req: any) => {
    setInlineNotice(null);
    const curIdx = currentWeekInfo.weekDates.indexOf(req.date);
    const nxtIdx = nextWeekInfo.weekDates.indexOf(req.date);
    const matchedDayIdx = curIdx >= 0 ? curIdx : nxtIdx;
    const myShiftsForReqWeek =
      curIdx >= 0 ? currentWeekApprovedShifts ?? approvedShifts : nxtIdx >= 0 ? approvedShifts : null;

    let otNote = '';
    if (matchedDayIdx >= 0 && myShiftsForReqWeek && currentUser) {
      const checkSelf = validateSmartShiftSwap({
        dayIndex: matchedDayIdx,
        requesterShift: req.shift,
        targetEmployee: {
          username: currentUser.username,
          fullname: currentUser.fullname,
          employmentStatus: currentUser.employmentStatus,
        },
        targetWeekShifts: myShiftsForReqWeek,
      });
      if (!checkSelf.valid) {
        setInlineNotice({
          variant: 'error',
          title: 'Không thể nhận ca (Trùng lịch)',
          text: `Bạn đã có lịch ca ${checkSelf.existingTargetShift} vào ${req.dayName} (${req.date}).`,
        });
        return;
      }
      if (checkSelf.hasOtWarning && checkSelf.warning) {
        otNote = checkSelf.warning;
      }
    }

    setPendingAcceptConfirm({ req, otNote });
  };

  const executeAcceptSwap = async () => {
    if (!pendingAcceptConfirm) return;
    const { req } = pendingAcceptConfirm;
    setPendingAcceptConfirm(null);
    store.setLoading(true, 'Đang ghi nhận...');
    try {
      const apiRes = await callApi('ACCEPT_SWAP', {
        swapId: req.id,
        targetUsername: currentUser?.username,
        targetFullname: currentUser?.fullname
      });
      store.setLoading(false);
      if (apiRes?.ok) {
        setAcceptSuccessZaloReq(req);
        pushToast('Đã ghi nhận nhận ca thành công!', 'success');
        void loadSwapRequests();
      } else {
        setInlineNotice({ variant: 'error', title: 'Lỗi nhận ca', text: apiRes?.message || 'Có lỗi xảy ra.' });
      }
    } catch {
      store.setLoading(false);
      setInlineNotice({ variant: 'error', title: 'Lỗi mạng', text: 'Không thể kết nối máy chủ.' });
    }
  };

  return (
    <div className="p-4 pb-24 md:pb-10 animate-slide-up">
      <KgModuleHero
        moduleId="swap"
        title="Chợ Đổi Ca"
        description="Tìm người làm thay hoặc đổi ca nhanh chóng."
        eyebrow="Bảng tin"
        tipTitle="Quy chế Đổi Ca & Nghỉ Phép"
        tips={[
          "Đổi ca: Cần thỏa thuận trước với đồng nghiệp cùng vị trí nghiệp vụ (Phục vụ đổi Phục vụ, Pha chế đổi Pha chế).",
          "Thời hạn gửi yêu cầu: Trước giờ bắt đầu ca làm tối thiểu 24 giờ để Quản lý kịp thời phê duyệt.",
          "Tìm người thay: Nếu có việc gấp không thể đổi 2 chiều, hãy đăng tin 'Tìm người thay' lên bảng tin.",
          "Sau khi đồng nghiệp bấm nhận ca, hệ thống sẽ gửi thông báo cho Quản lý xác nhận cuối cùng."
        ]}
        actions={
          notifPermission === 'default' ? (
            <KgButton size="sm" variant="secondary" icon={BellRing} onClick={handleEnableNotifications}>
              Bật thông báo
            </KgButton>
          ) : undefined
        }
      />

      {inlineNotice && (
        <div className="mb-4">
          <KgAlertCard variant={inlineNotice.variant} title={inlineNotice.title}>
            {inlineNotice.text}
          </KgAlertCard>
        </div>
      )}

      {loadError && (
        <div className="mb-4">
          <KgAlertCard variant="error" title="Lỗi tải bảng tin đổi ca">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-1">
              <span>{loadError}</span>
              <KgButton size="sm" variant="secondary" icon={RefreshCw} onClick={() => void loadSwapRequests()}>
                Thử lại
              </KgButton>
            </div>
          </KgAlertCard>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="grid grid-cols-3 sm:flex bg-[var(--kg-surface)] border border-[var(--kg-border)] p-1 sm:p-1.5 rounded-2xl mb-6 shadow-xs gap-1 sm:gap-1.5">
        <button 
          type="button"
          onClick={() => setViewTab('board')} 
          className={`flex-1 min-w-0 min-h-[44px] sm:min-h-[40px] px-1.5 sm:px-3.5 py-2 sm:py-2.5 flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl text-[11.5px] sm:text-sm font-black transition-all active:scale-95 select-none whitespace-nowrap touch-manipulation ${
            viewTab === 'board' 
              ? 'bg-[var(--kg-primary)] text-white shadow-xs' 
              : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
          }`}
        >
          <Megaphone size={14} className="flex-shrink-0" />
          <span className="truncate">Bảng tin</span>
          {viewTab === 'board' && <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)] flex-shrink-0" />}
          {store.hasNewSwaps && viewTab !== 'board' && <span className="w-2 h-2 rounded-full bg-[var(--kg-danger)] flex-shrink-0 animate-ping" />}
        </button>
        <button 
          type="button"
          onClick={() => setViewTab('post')} 
          className={`flex-1 min-w-0 min-h-[44px] sm:min-h-[40px] px-1.5 sm:px-3.5 py-2 sm:py-2.5 flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl text-[11.5px] sm:text-sm font-black transition-all active:scale-95 select-none whitespace-nowrap touch-manipulation ${
            viewTab === 'post' 
              ? 'bg-[var(--kg-primary)] text-white shadow-xs' 
              : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
          }`}
        >
          <Send size={14} className="flex-shrink-0" />
          <span className="truncate">Tìm người thay</span>
          {viewTab === 'post' && <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)] flex-shrink-0" />}
        </button>
        <button 
          type="button"
          onClick={() => setViewTab('leave')} 
          className={`flex-1 min-w-0 min-h-[44px] sm:min-h-[40px] px-1.5 sm:px-3.5 py-2 sm:py-2.5 flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl text-[11.5px] sm:text-sm font-black transition-all active:scale-95 select-none whitespace-nowrap touch-manipulation ${
            viewTab === 'leave' 
              ? 'bg-[var(--kg-primary)] text-white shadow-xs' 
              : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
          }`}
        >
          <LogOut size={14} className="flex-shrink-0" />
          <span className="truncate">Xin nghỉ phép</span>
          {viewTab === 'leave' && <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)] flex-shrink-0" />}
        </button>
      </div>

      {/* BOARD VIEW */}
      {viewTab === 'board' && (
        <div className="space-y-4">
          
          {/* Admin Approval Section */}
          {currentUser?.role === 'admin' && swapRequests.filter(req => req.status === 'Pending_Admin').length > 0 && (
            <div className="mb-8">
              <h3 className="font-bold text-[var(--kg-text)] mb-3 flex items-center">
                <Inbox size={18} className="mr-2 text-[var(--kg-primary)]" /> Cần Admin Duyệt
              </h3>
              <div className="space-y-3">
                {swapRequests.filter(req => req.status === 'Pending_Admin').map((req) => (
                  <div key={req.id} className="bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/30 rounded-2xl p-4 animate-fade-in">
                    <div className="mb-2">
                      <span className="font-bold text-[var(--kg-text)]">{req.fullname}</span>
                      <span className="text-[var(--kg-text-muted)] text-sm mx-1">muốn</span>
                      <span className="font-bold text-[var(--kg-primary)] inline-flex items-center">
                        {req.targetUsername === 'ADMIN' ? 'Xin Nghỉ Phép' : <>Đổi ca <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black mx-1 shadow-2xs ${getPreviewShiftClass(req.shift)}`}><ResponsiveShift shift={req.shift} /></span></>}
                      </span>
                      <span className="text-[var(--kg-text-muted)] text-sm mx-1">vào</span>
                      <span className="font-bold text-[var(--kg-text)]">{req.dayName} ({req.date})</span>
                    </div>
                    <div className="bg-[var(--kg-surface)] p-3 rounded-xl mb-3 text-sm border border-[var(--kg-border)]">
                      <p className="mb-1"><span className="text-[var(--kg-text-muted)]">Lý do:</span> {req.reason}</p>
                      {req.targetUsername !== 'ADMIN' && (
                        <p><span className="text-[var(--kg-text-muted)]">Người nhận thay:</span> <span className="font-bold text-[var(--kg-primary)]">{req.targetFullname}</span></p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button type="button" onClick={() => {
                        store.setLoading(true, 'Đang duyệt...');
                        callApi('APPROVE_SWAP', { swapId: req.id, decision: 'APPROVE' }).then(res => {
                          store.setLoading(false);
                          if (res?.ok) {
                            pushToast('Đã duyệt đổi ca thành công!', 'success');
                            void loadSwapRequests();
                          } else {
                            setInlineNotice({ variant: 'error', title: 'Lỗi duyệt đổi ca', text: res?.message || 'Không thể duyệt yêu cầu đổi ca.' });
                          }
                        });
                      }} className="flex-1 min-h-[44px] bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-bold py-2.5 rounded-xl text-sm transition touch-manipulation">
                        Phê duyệt
                      </button>
                      <button type="button" onClick={() => {
                        store.setLoading(true, 'Đang từ chối...');
                        callApi('APPROVE_SWAP', { swapId: req.id, decision: 'REJECT' }).then(res => {
                          store.setLoading(false);
                          if (res?.ok) {
                            pushToast('Đã từ chối yêu cầu đổi ca.', 'info');
                            void loadSwapRequests();
                          } else {
                            setInlineNotice({ variant: 'error', title: 'Lỗi từ chối đổi ca', text: res?.message || 'Không thể từ chối yêu cầu đổi ca.' });
                          }
                        });
                      }} className="flex-1 min-h-[44px] bg-[var(--kg-danger)] hover:brightness-95 text-white dark:text-[#0D1015] font-bold py-2.5 rounded-xl text-sm transition touch-manipulation">
                        Từ chối
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="font-bold text-[var(--kg-text)]">Tất cả bài đăng</h3>
            <button
              type="button"
              onClick={() => void loadSwapRequests()}
              disabled={isRefreshing}
              className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] inline-flex items-center gap-1.5 touch-manipulation disabled:opacity-60"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>
          {swapRequests.filter((req) => currentUser?.role === 'admin' || req.targetUsername !== 'ADMIN' || req.username === currentUser?.username).length === 0 ? (
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-8 text-center">
              <Inbox size={48} className="mx-auto text-[var(--kg-text-soft)] mb-4" />
              <h3 className="text-[var(--kg-text-muted)] font-bold mb-1">Chưa có ai cần đổi ca</h3>
              <p className="text-xs text-[var(--kg-text-soft)]">Những yêu cầu đổi ca sẽ xuất hiện ở đây.</p>
            </div>
          ) : (
            swapRequests
              .filter((req) => currentUser?.role === 'admin' || req.targetUsername !== 'ADMIN' || req.username === currentUser?.username)
              .map((req) => (
              <div key={req.id} className="bg-[var(--kg-surface)] rounded-2xl p-5 border border-[var(--kg-border)] relative overflow-hidden animate-fade-in group">
                {req.username === currentUser?.username && (
                  <div className="absolute top-0 right-0 bg-[var(--kg-primary)] text-white text-[10px] font-bold px-2.5 py-1 rounded-bl-lg">Của bạn</div>
                )}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-[var(--kg-accent-soft)] text-[var(--kg-primary)] flex items-center justify-center font-bold text-lg mr-3 border border-[var(--kg-primary)]/20">
                      {getSafeDisplayInitial(req.fullname, req.username)}
                    </div>
                    <div>
                      <h4 className="font-bold text-[var(--kg-text)] text-sm">{req.fullname || req.username || 'Nhân sự'}</h4>
                      <p className="text-[10px] text-[var(--kg-text-muted)] flex items-center mt-0.5 font-mono tabular-nums"><Clock size={10} className="mr-1" /> {formatSwapTimestamp(req.createdAt)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl p-3 mb-4">
                  <p className="text-sm text-[var(--kg-text)] font-medium mb-1.5 flex items-center flex-wrap">
                    Cần người làm thay ca <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black mx-1.5 shadow-2xs ${getPreviewShiftClass(req.shift)}`}><ResponsiveShift shift={req.shift} /></span>
                  </p>
                  <p className="text-xs text-[var(--kg-text-muted)] font-bold mb-2">Vào {req.dayName} ({req.date})</p>
                  <p className="text-xs text-[var(--kg-text-muted)] italic flex items-start">
                    <span className="font-semibold not-italic mr-1 text-[var(--kg-text)]">Lý do:</span> {req.reason}
                  </p>
                </div>

                {req.username !== currentUser?.username &&
                req.status === 'Pending_User' &&
                (!req.targetUsername || req.targetUsername === 'ALL' || req.targetUsername === currentUser?.username) ? (
                  <button type="button" onClick={() => handleAcceptSwap(req)} className="w-full min-h-[44px] bg-[var(--kg-accent-soft)] text-[var(--kg-primary)] font-bold py-3 rounded-xl border border-[var(--kg-primary)]/25 hover:bg-[var(--kg-primary)] hover:text-white transition-all flex items-center justify-center text-sm touch-manipulation">
                    <HandshakeIcon size={16} className="mr-2" /> Nhận làm thay ca này
                  </button>
                ) : req.status === 'Pending_User' && req.targetUsername && req.targetUsername !== 'ALL' && req.username !== currentUser?.username ? (
                  <div className="w-full bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] font-bold py-2.5 rounded-xl border border-[var(--kg-border)] text-center text-xs">
                    Đã gửi trực tiếp cho {req.targetFullname || req.targetUsername}
                  </div>
                ) : req.status === 'Pending_Admin' ? (
                  <div className="w-full bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] font-bold py-2.5 rounded-xl border border-[var(--kg-warning)]/25 text-center text-xs flex items-center justify-center gap-1.5">
                    <Clock size={13} /> Đang chờ Admin duyệt (Người nhận: {req.targetFullname})
                  </div>
                ) : req.username === currentUser?.username ? (
                  <button type="button" onClick={() => {
                    store.setLoading(true);
                    callApi('DELETE_SWAP', { swapId: req.id, username: currentUser?.username }).then(() => {
                      store.setLoading(false);
                      void loadSwapRequests();
                    });
                  }} className="w-full min-h-[44px] bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] font-bold py-2.5 rounded-xl border border-[var(--kg-danger)]/25 hover:brightness-95 transition-all text-xs touch-manipulation">
                    Xóa bài đăng
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}

      {/* POST / LEAVE VIEW */}
      {(viewTab === 'post' || viewTab === 'leave') && (
        <div className="animate-fade-in">
          <div className="flex bg-[var(--kg-surface)] border border-[var(--kg-border)] p-1 rounded-xl mb-4 gap-1">
            <button
              type="button"
              onClick={() => {
                setWeekScope('current');
                setSelectedDayIndex(null);
              }}
              className={`flex-1 min-h-[44px] sm:min-h-[38px] py-2 px-3 rounded-lg text-xs font-bold transition-all touch-manipulation ${
                weekScope === 'current'
                  ? 'bg-[var(--kg-primary)] text-white shadow-2xs'
                  : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              Tuần này ({currentWeekInfo.weekLabel})
            </button>
            <button
              type="button"
              onClick={() => {
                setWeekScope('next');
                setSelectedDayIndex(null);
              }}
              className={`flex-1 min-h-[44px] sm:min-h-[38px] py-2 px-3 rounded-lg text-xs font-bold transition-all touch-manipulation ${
                weekScope === 'next'
                  ? 'bg-[var(--kg-primary)] text-white shadow-2xs'
                  : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
              }`}
            >
              Tuần tới ({nextWeekInfo.weekLabel})
            </button>
          </div>
          {weekScope === 'next' && store.isScheduleRegistered && (!activeApprovedShifts || activeApprovedShifts.length === 0) && (
            <div className="bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/30 rounded-2xl p-4 mb-4 flex items-center space-x-3">
              <Clock size={20} className="text-[var(--kg-warning)] flex-shrink-0" />
              <p className="text-xs text-[var(--kg-warning)] font-medium">
                Lịch làm việc tuần tới đang ở trạng thái <strong>Chờ duyệt</strong>. Bạn có thể đổi ca hoặc xin nghỉ sau khi quản lý phê duyệt lịch.
              </p>
            </div>
          )}
          <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 mb-6">
            <h3 className="font-bold text-[var(--kg-text)] mb-4">
              1. Chọn ca của bạn muốn {viewTab === 'leave' ? 'xin nghỉ' : 'đổi'}
            </h3>
            <div className="flex overflow-x-auto space-x-2 pb-2 snap-x">
              {SHORT_DAY_NAMES.map((shortDay, i) => {
                const shift = activeApprovedShifts?.[i] || 'OFF';
                const isSelected = selectedDayIndex === i;
                const isOff = shift === 'OFF';
                return (
                  <button key={i} type="button" disabled={isOff} onClick={() => setSelectedDayIndex(i)}
                    className={`flex-shrink-0 w-20 min-h-[72px] snap-center rounded-xl p-2 border-2 transition-all touch-manipulation ${isOff ? 'opacity-50 grayscale cursor-not-allowed border-[var(--kg-border)]' : isSelected ? 'border-[var(--kg-primary)] bg-[var(--kg-accent-soft)]' : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)]'}`}>
                    <div className={`text-[12px] font-bold font-mono tabular-nums mb-0.5 ${isSelected ? 'text-[var(--kg-primary)]' : 'text-[var(--kg-text)]'}`}>{weekInfo.weekDates[i]}</div>
                    <div className={`text-[10px] font-medium mb-1.5 ${isSelected ? 'text-[var(--kg-primary)]' : 'text-[var(--kg-text-muted)]'}`}>{shortDay}</div>
                    <div className={`text-xs font-black py-1.5 px-1 rounded-lg transition-all ${isSelected ? 'ring-2 ring-[var(--kg-primary)] ring-offset-1 shadow-md scale-105 ' : 'shadow-2xs '}${getPreviewShiftClass(shift)}`}><ResponsiveShift shift={shift} /></div>
                  </button>
                );
              })}
            </div>
          </div>

          {viewTab === 'post' && (
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 mb-6">
              <label htmlFor="swap-target-user" className="block font-bold text-[var(--kg-text)] mb-3">2. Chọn người làm thay</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={16} className="text-[var(--kg-text-soft)]" />
                </div>
                <select id="swap-target-user" value={targetUsername} onChange={(e) => setTargetUsername(e.target.value)} className="w-full min-h-[44px] bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl pl-10 pr-4 py-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] appearance-none">
                  <option value="ALL" className="font-bold text-[var(--kg-primary)]">Tất cả mọi người (Đăng lên Chợ)</option>
                  {eligibleCoworkers.map(u => {
                    const myPos = (currentUser?.position || '').trim().toLowerCase();
                    const isSamePos = Boolean(myPos && (u.position || '').trim().toLowerCase() === myPos);
                    const uShifts =
                      coworkerShiftMap[u.username.toLowerCase()] ||
                      coworkerShiftMap[u.fullname.trim().toLowerCase()];
                    const dayShift =
                      selectedDayIndex !== null && uShifts ? uShifts[selectedDayIndex] || 'OFF' : '';
                    const suffix = dayShift ? ` (${dayShift === 'OFF' ? 'Đang OFF' : `Bận ca ${dayShift}`})` : '';
                    return (
                      <option key={u.username} value={u.username}>
                        {isSamePos ? '★ ' : ''}{u.fullname}{u.position ? ` · ${u.position}` : ''}{suffix}
                      </option>
                    );
                  })}
                </select>
              </div>

              {directSwapValidation && (
                <div
                  className={`mt-3 rounded-xl p-3 border text-xs flex items-start gap-2.5 ${
                    !directSwapValidation.valid
                      ? 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/30 text-[var(--kg-danger)]'
                      : directSwapValidation.hasOtWarning
                        ? 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/30 text-[var(--kg-warning)]'
                        : 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/30 text-[var(--kg-success)]'
                  }`}
                >
                  {!directSwapValidation.valid || directSwapValidation.hasOtWarning ? (
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  )}
                  <div className="font-semibold leading-relaxed">
                    {!directSwapValidation.valid
                      ? directSwapValidation.reason
                      : directSwapValidation.hasOtWarning
                        ? directSwapValidation.warning
                        : `Hợp lệ: Đồng nghiệp đang OFF ngày này (dự kiến ${directSwapValidation.projectedShiftsCount}/7 buổi · ~${directSwapValidation.projectedHours}h/tuần).`}
                  </div>
                </div>
              )}

              <label htmlFor="swap-reason" className="block font-bold text-[var(--kg-text)] mt-5 mb-2">Lý do đổi ca</label>
              <input id="swap-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do..." className="w-full min-h-[44px] bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)]" />
            </div>
          )}

          {viewTab === 'leave' && (
            <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-5 mb-6">
              <label htmlFor="leave-reason" className="block font-bold text-[var(--kg-text)] mb-2">2. Lý do xin nghỉ phép</label>
              <input id="leave-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do xin nghỉ..." className="w-full min-h-[44px] bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-4 py-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)]" />
              <p className="text-xs text-[var(--kg-text-muted)] mt-2 italic">Lưu ý: Đơn xin nghỉ phép sẽ được gửi trực tiếp cho Quản lý phê duyệt.</p>
            </div>
          )}

          {selectedDayIndex !== null && targetUsername !== 'ALL' && viewTab === 'post' && (
            <div className="bg-[var(--kg-accent-soft)] border border-[var(--kg-primary)]/20 rounded-2xl p-4 mb-6 animate-fade-in">
              <div className="flex items-center mb-2">
                <BellRing size={16} className="text-[var(--kg-primary)] mr-2" />
                <span className="font-bold text-sm text-[var(--kg-primary)]">Tin nhắn tự động Zalo</span>
              </div>
              <p className="text-xs text-[var(--kg-text)] italic bg-[var(--kg-surface)] p-3 rounded-xl border border-[var(--kg-border)]">&quot;{getZaloMessage()}&quot;</p>
              <div className="flex space-x-2 mt-3">
                <button type="button" onClick={() => copyToClipboard(getZaloMessage())} className="flex-1 min-h-[44px] bg-[var(--kg-surface)] text-[var(--kg-primary)] text-xs font-bold py-2 rounded-lg border border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)] transition flex items-center justify-center touch-manipulation">
                  <Copy size={14} className="mr-1" /> Copy
                </button>
                <a href={`https://zalo.me`} target="_blank" rel="noreferrer" className="flex-1 min-h-[44px] bg-[#0068ff] text-white text-xs font-bold py-2 rounded-lg hover:bg-blue-700 transition flex items-center justify-center text-center touch-manipulation">
                  Mở Zalo
                </a>
              </div>
            </div>
          )}

          <button 
            type="button"
            onClick={handleSwapRequest} 
            className="w-full min-h-[48px] bg-[var(--kg-primary)] text-white font-black py-4 rounded-2xl shadow-md hover:brightness-110 transition-all transform active:scale-98 flex items-center justify-center touch-manipulation border-none text-xs sm:text-sm tracking-wider uppercase"
          >
            {viewTab === 'leave' ? (
              <><LogOut size={18} className="mr-2 text-[var(--kg-accent)]" /> GỬI YÊU CẦU NGHỈ PHÉP</>
            ) : targetUsername === 'ALL' ? (
              <><Megaphone size={18} className="mr-2 text-[var(--kg-accent)]" /> ĐĂNG LÊN BẢNG TIN</>
            ) : (
              <><Send size={18} className="mr-2 text-[var(--kg-accent)]" /> GỬI YÊU CẦU ĐỔI CA</>
            )}
          </button>
        </div>
      )}

      {/* Confirmation Sheets (Replaces Swal.fire) */}
      <KgConfirmSheet
        isOpen={Boolean(pendingSubmitConfirm)}
        onClose={() => setPendingSubmitConfirm(null)}
        onConfirm={() => void executeSwapSubmit()}
        title={pendingSubmitConfirm?.title || 'Xác nhận'}
        message={pendingSubmitConfirm?.message || ''}
        confirmLabel={pendingSubmitConfirm?.confirmLabel || 'Gửi yêu cầu'}
        cancelLabel="Hủy"
        variant="primary"
      />

      <KgConfirmSheet
        isOpen={Boolean(pendingAcceptConfirm)}
        onClose={() => setPendingAcceptConfirm(null)}
        onConfirm={() => void executeAcceptSwap()}
        title="Nhận làm thay?"
        message={
          pendingAcceptConfirm ? (
            <div className="space-y-2">
              <p>
                Bạn muốn nhận ca <b>{pendingAcceptConfirm.req.shift}</b> vào{' '}
                <b>{pendingAcceptConfirm.req.dayName}</b> của{' '}
                <b>{pendingAcceptConfirm.req.fullname}</b>?
              </p>
              {pendingAcceptConfirm.otNote && (
                <p className="text-xs font-semibold text-[var(--kg-warning)] bg-[var(--kg-warning-soft)] p-2.5 rounded-xl border border-[var(--kg-warning)]/25">
                  ⚠️ {pendingAcceptConfirm.otNote}
                </p>
              )}
            </div>
          ) : (
            ''
          )
        }
        confirmLabel="Có, tôi nhận"
        cancelLabel="Đóng"
        variant={pendingAcceptConfirm?.otNote ? 'warning' : 'primary'}
      />

      <KgConfirmSheet
        isOpen={Boolean(acceptSuccessZaloReq)}
        onClose={() => setAcceptSuccessZaloReq(null)}
        onConfirm={() => {
          if (acceptSuccessZaloReq) {
            copyToClipboard(getPublicZaloMessage(acceptSuccessZaloReq));
          }
          setAcceptSuccessZaloReq(null);
        }}
        title="Ghi nhận thành công"
        message="Hãy nhắn Zalo cho đồng nghiệp để xác nhận nhé! Hệ thống đang chờ Admin duyệt."
        confirmLabel="Copy mẫu tin nhắn Zalo"
        cancelLabel="Đóng"
        variant="primary"
      />

      {/* Local Toast Stack */}
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
