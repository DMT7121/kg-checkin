import { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { DAY_NAMES, SHORT_DAY_NAMES, computeWeekInfo, ResponsiveShift, getPreviewShiftClass } from '../utils/helpers';
import { isWorkEligible } from '../utils/employment';
import { validateSmartShiftSwap } from '../utils/shiftSwapValidator';
import Swal from 'sweetalert2';
import { Send, BellRing, Copy, User, Megaphone, Inbox, Clock, HandshakeIcon, LogOut, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { KgModuleHero } from '../components/KgDesignSystem';


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
  const { currentUser, users, approvedShifts, currentWeekApprovedShifts, swapRequests } = store;
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

  const eligibleCoworkers = useMemo(
    () =>
      users.filter(
        (u) => u.username !== currentUser?.username && u.role !== 'admin' && isWorkEligible(u)
      ),
    [users, currentUser?.username]
  );

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

  const loadSwapRequests = async () => {
    const res = await callApi('GET_SWAP_REQUESTS', {
      username: currentUser?.username,
      role: currentUser?.role
    });
    if (res?.ok) {
      store.setSwapRequests(res.data);
    }
  };

  useEffect(() => {
    if (viewTab === 'board') {
      void callApi('GET_SWAP_REQUESTS', {
        username: currentUser?.username,
        role: currentUser?.role,
      }).then((res) => {
        store.setHasNewSwaps(false);
        if (res?.ok) store.setSwapRequests(res.data);
      });
    }
  }, [viewTab, currentUser?.username, currentUser?.role]);

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

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
    loadSwapRequests();
  }, []);

  const handleSwapRequest = () => {
    if (selectedDayIndex === null) {
      Swal.fire('Lỗi', 'Vui lòng chọn ngày muốn đổi ca.', 'warning');
      return;
    }
    
    const myShift = activeApprovedShifts?.[selectedDayIndex] || 'OFF';
    if (myShift === 'OFF') {
      Swal.fire('Lỗi', 'Bạn đang OFF ngày này, không thể đổi ca.', 'warning');
      return;
    }

    const dayName = DAY_NAMES[selectedDayIndex];
    const isLeave = viewTab === 'leave';
    const isPublic = !isLeave && targetUsername === 'ALL';
    const targetUser = isPublic || isLeave ? null : users.find(u => u.username === targetUsername);

    if (!isLeave && !isPublic && directSwapValidation && !directSwapValidation.valid) {
      Swal.fire(
        'Trùng lịch ca làm',
        directSwapValidation.reason || 'Đồng nghiệp đã có lịch ca trong ngày này.',
        'error'
      );
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

    Swal.fire({
      title: 'Xác nhận',
      text: confirmTitle,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: confirmBtn,
      cancelButtonText: 'Hủy'
    }).then((res) => {
      if (res.isConfirmed) {
        store.setLoading(true, 'Đang gửi yêu cầu...');
        callApi('SUBMIT_SWAP', {
          username: currentUser!.username,
          fullname: currentUser!.fullname,
          dayName: dayName,
          shift: myShift,
          date: weekInfo.weekDates[selectedDayIndex],
          reason: reason || (isLeave ? 'Xin nghỉ phép đột xuất' : 'Cần hỗ trợ đổi ca đột xuất'),
          targetUsername: isLeave ? 'ADMIN' : (isPublic ? 'ALL' : targetUser?.username),
          targetFullname: isLeave ? 'Quản Lý (Xin Nghỉ Phép)' : (isPublic ? 'ALL' : targetUser?.fullname),
          monthSheet: weekInfo.monthSheet
        }).then((apiRes) => {
          store.setLoading(false);
          if (apiRes?.ok) {
            let successMsg = '';
            if (isLeave) successMsg = 'Đơn xin nghỉ phép đã được gửi đến Quản Lý để chờ duyệt.';
            else if (isPublic) successMsg = 'Yêu cầu của bạn đã được đăng lên Bảng tin.';
            else successMsg = `Yêu cầu đổi ca đã gửi đến ${targetUser?.fullname}. Hãy nhắn Zalo cho họ nhé!`;
            
            Swal.fire('Thành công!', successMsg, 'success');
            if (isPublic || isLeave) setViewTab('board');
            loadSwapRequests();
          } else {
            Swal.fire('Lỗi', apiRes?.message || 'Có lỗi xảy ra', 'error');
          }
        });

        setSelectedDayIndex(null);
        setTargetUsername('ALL');
        setReason('');
      }
    });
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
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Đã copy tin nhắn!', showConfirmButton: false, timer: 2000 });
  };

  const handleAcceptSwap = (req: any) => {
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
        Swal.fire(
          'Không thể nhận ca (Trùng lịch)',
          `Bạn đã có lịch ca ${checkSelf.existingTargetShift} vào ${req.dayName} (${req.date}).`,
          'error'
        );
        return;
      }
      if (checkSelf.hasOtWarning && checkSelf.warning) {
        otNote = `\n\n⚠️ ${checkSelf.warning}`;
      }
    }

    Swal.fire({
      title: 'Nhận làm thay?',
      text: `Bạn muốn nhận ca ${req.shift} vào ${req.dayName} của ${req.fullname}?${otNote}`,
      icon: otNote ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: 'Có, tôi nhận',
      cancelButtonText: 'Đóng'
    }).then((res) => {
      if (res.isConfirmed) {
        store.setLoading(true, 'Đang ghi nhận...');
        callApi('ACCEPT_SWAP', {
          swapId: req.id,
          targetUsername: currentUser?.username,
          targetFullname: currentUser?.fullname
        }).then((apiRes) => {
          store.setLoading(false);
          if (apiRes?.ok) {
            Swal.fire({
              title: 'Ghi nhận thành công',
              text: 'Hãy nhắn Zalo cho người đó để xác nhận nhé! Hệ thống đang chờ Admin duyệt.',
              icon: 'success',
              showCancelButton: true,
              confirmButtonText: 'Copy mẫu tin nhắn Zalo',
              cancelButtonText: 'Đóng'
            }).then((r) => {
              if (r.isConfirmed) copyToClipboard(getPublicZaloMessage(req));
            });
            loadSwapRequests();
          } else {
            Swal.fire('Lỗi', apiRes?.message || 'Có lỗi xảy ra', 'error');
          }
        });
      }
    });
  };

  return (
    <div className="p-4 animate-slide-up">
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
      />

      {/* Tabs Menu */}
      <div className="flex bg-[var(--kg-surface)] border border-[var(--kg-border)] p-1.5 rounded-2xl mb-6 shadow-xs gap-1.5">
        <button 
          type="button"
          onClick={() => setViewTab('board')} 
          className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-95 select-none ${
            viewTab === 'board' 
              ? 'bg-[var(--kg-primary)] text-white shadow-xs scale-[1.01]' 
              : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
          }`}
        >
          <Megaphone size={15} className="mr-1.5" /> Bảng tin
          {viewTab === 'board' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)] ml-1.5" />}
          {store.hasNewSwaps && viewTab !== 'board' && <span className="w-2 h-2 rounded-full bg-red-500 ml-1.5 animate-ping" />}
        </button>
        <button 
          type="button"
          onClick={() => setViewTab('post')} 
          className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-95 select-none ${
            viewTab === 'post' 
              ? 'bg-[var(--kg-primary)] text-white shadow-xs scale-[1.01]' 
              : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
          }`}
        >
          <Send size={15} className="mr-1.5" /> Tìm người thay
          {viewTab === 'post' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)] ml-1.5" />}
        </button>
        <button 
          type="button"
          onClick={() => setViewTab('leave')} 
          className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-95 select-none ${
            viewTab === 'leave' 
              ? 'bg-[var(--kg-primary)] text-white shadow-xs scale-[1.01]' 
              : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
          }`}
        >
          <LogOut size={15} className="mr-1.5" /> Xin nghỉ phép
          {viewTab === 'leave' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)] ml-1.5" />}
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
                    <div className="soft3d-card p-3 rounded-xl mb-3 text-sm border border-[var(--kg-border)]">
                      <p className="mb-1"><span className="text-[var(--kg-text-muted)]">Lý do:</span> {req.reason}</p>
                      {req.targetUsername !== 'ADMIN' && (
                        <p><span className="text-[var(--kg-text-muted)]">Người nhận thay:</span> <span className="font-bold text-[var(--kg-primary)]">{req.targetFullname}</span></p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <button onClick={() => {
                        store.setLoading(true, 'Đang duyệt...');
                        callApi('APPROVE_SWAP', { swapId: req.id, decision: 'APPROVE' }).then(res => {
                          store.setLoading(false);
                          if (res?.ok) {
                            Swal.fire('Đã duyệt', 'Ca làm đã được chuyển cho người nhận thay.', 'success');
                            loadSwapRequests();
                          } else {
                            Swal.fire('Lỗi', res?.message || 'Không thể duyệt yêu cầu đổi ca.', 'error');
                          }
                        });
                      }} className="flex-1 bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white font-bold py-2.5 rounded-xl text-sm transition">
                        Phê duyệt
                      </button>
                      <button onClick={() => {
                        store.setLoading(true, 'Đang từ chối...');
                        callApi('APPROVE_SWAP', { swapId: req.id, decision: 'REJECT' }).then(res => {
                          store.setLoading(false);
                          if (res?.ok) {
                            Swal.fire('Đã từ chối', 'Yêu cầu đổi ca bị hủy.', 'info');
                            loadSwapRequests();
                          } else {
                            Swal.fire('Lỗi', res?.message || 'Không thể từ chối yêu cầu đổi ca.', 'error');
                          }
                        });
                      }} className="flex-1 bg-[var(--kg-danger)] hover:brightness-95 text-white font-bold py-2.5 rounded-xl text-sm transition">
                        Từ chối
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 className="font-bold text-[var(--kg-text)] mb-3">Tất cả bài đăng</h3>
          {swapRequests.filter((req) => currentUser?.role === 'admin' || req.targetUsername !== 'ADMIN' || req.username === currentUser?.username).length === 0 ? (
            <div className="soft3d-card p-8 text-center">
              <Inbox size={48} className="mx-auto text-[var(--kg-text-soft)] mb-4" />
              <h3 className="text-[var(--kg-text-muted)] font-bold mb-1">Chưa có ai cần đổi ca</h3>
              <p className="text-xs text-[var(--kg-text-soft)]">Những yêu cầu đổi ca sẽ xuất hiện ở đây.</p>
            </div>
          ) : (
            swapRequests
              .filter((req) => currentUser?.role === 'admin' || req.targetUsername !== 'ADMIN' || req.username === currentUser?.username)
              .map((req) => (
              <div key={req.id} className="soft3d-card p-5 border border-[var(--kg-border)] relative overflow-hidden animate-fade-in group">
                {req.username === currentUser?.username && (
                  <div className="absolute top-0 right-0 bg-[var(--kg-primary)] text-white text-[10px] font-bold px-2.5 py-1 rounded-bl-lg">Của bạn</div>
                )}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-[var(--kg-accent-soft)] text-[var(--kg-primary)] flex items-center justify-center font-bold text-lg mr-3 border border-[var(--kg-primary)]/20">
                      {req.fullname.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-[var(--kg-text)] text-sm">{req.fullname}</h4>
                      <p className="text-[10px] text-[var(--kg-text-muted)] flex items-center mt-0.5"><Clock size={10} className="mr-1" /> Vừa xong</p>
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
                  <button onClick={() => handleAcceptSwap(req)} className="w-full bg-[var(--kg-accent-soft)] text-[var(--kg-primary)] font-bold py-3 rounded-xl border border-[var(--kg-primary)]/25 hover:bg-[var(--kg-primary)] hover:text-white transition-all flex items-center justify-center text-sm">
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
                  <button onClick={() => {
                    store.setLoading(true);
                    callApi('DELETE_SWAP', { swapId: req.id, username: currentUser?.username }).then(() => {
                      store.setLoading(false);
                      loadSwapRequests();
                    });
                  }} className="w-full bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] font-bold py-2.5 rounded-xl border border-[var(--kg-danger)]/25 hover:brightness-95 transition-all text-xs">
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
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
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
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
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
          <div className="soft3d-card p-5 mb-6">
            <h3 className="font-bold text-[var(--kg-text)] mb-4">
              1. Chọn ca của bạn muốn {viewTab === 'leave' ? 'xin nghỉ' : 'đổi'}
            </h3>
            <div className="flex overflow-x-auto space-x-2 pb-2 snap-x">
              {SHORT_DAY_NAMES.map((shortDay, i) => {
                const shift = activeApprovedShifts?.[i] || 'OFF';
                const isSelected = selectedDayIndex === i;
                const isOff = shift === 'OFF';
                return (
                  <button key={i} disabled={isOff} onClick={() => setSelectedDayIndex(i)}
                    className={`flex-shrink-0 w-20 snap-center rounded-xl p-2 border-2 transition-all ${isOff ? 'opacity-50 grayscale cursor-not-allowed border-[var(--kg-border)]' : isSelected ? 'border-[var(--kg-primary)] bg-[var(--kg-accent-soft)]' : 'border-[var(--kg-border)] paint-layer'}`}>
                    <div className={`text-[12px] font-bold mb-0.5 ${isSelected ? 'text-[var(--kg-primary)]' : 'text-[var(--kg-text)]'}`}>{weekInfo.weekDates[i]}</div>
                    <div className={`text-[10px] font-medium mb-1.5 ${isSelected ? 'text-[var(--kg-primary)]' : 'text-[var(--kg-text-muted)]'}`}>{shortDay}</div>
                    <div className={`text-xs font-black py-1.5 px-1 rounded-lg transition-all ${isSelected ? 'ring-2 ring-[var(--kg-primary)] ring-offset-1 shadow-md scale-105 ' : 'shadow-2xs '}${getPreviewShiftClass(shift)}`}><ResponsiveShift shift={shift} /></div>
                  </button>
                );
              })}
            </div>
          </div>

          {viewTab === 'post' && (
            <div className="soft3d-card p-5 mb-6">
              <label htmlFor="swap-target-user" className="block font-bold text-[var(--kg-text)] mb-3">2. Chọn người làm thay</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User size={16} className="text-[var(--kg-text-soft)]" />
                </div>
                <select id="swap-target-user" value={targetUsername} onChange={(e) => setTargetUsername(e.target.value)} className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] appearance-none">
                  <option value="ALL" className="font-bold text-[var(--kg-primary)]">Tất cả mọi người (Đăng lên Chợ)</option>
                  {eligibleCoworkers.map(u => {
                    const uShifts =
                      coworkerShiftMap[u.username.toLowerCase()] ||
                      coworkerShiftMap[u.fullname.trim().toLowerCase()];
                    const dayShift =
                      selectedDayIndex !== null && uShifts ? uShifts[selectedDayIndex] || 'OFF' : '';
                    const suffix = dayShift ? ` (${dayShift === 'OFF' ? 'Đang OFF' : `Bận ca ${dayShift}`})` : '';
                    return (
                      <option key={u.username} value={u.username}>
                        {u.fullname}{u.position ? ` · ${u.position}` : ''}{suffix}
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
              <input id="swap-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do..." className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)]" />
            </div>
          )}

          {viewTab === 'leave' && (
            <div className="soft3d-card p-5 mb-6">
              <label htmlFor="leave-reason" className="block font-bold text-[var(--kg-text)] mb-2">2. Lý do xin nghỉ phép</label>
              <input id="leave-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nhập lý do xin nghỉ..." className="w-full bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)]" />
              <p className="text-xs text-[var(--kg-text-muted)] mt-2 italic">Lưu ý: Đơn xin nghỉ phép sẽ được gửi trực tiếp cho Quản lý phê duyệt.</p>
            </div>
          )}

          {selectedDayIndex !== null && targetUsername !== 'ALL' && viewTab === 'post' && (
            <div className="bg-[var(--kg-accent-soft)] border border-[var(--kg-primary)]/20 rounded-2xl p-4 mb-6 animate-fade-in">
              <div className="flex items-center mb-2">
                <BellRing size={16} className="text-[var(--kg-primary)] mr-2" />
                <span className="font-bold text-sm text-[var(--kg-primary)]">Tin nhắn tự động Zalo</span>
              </div>
              <p className="text-xs text-[var(--kg-text)] italic soft3d-card p-3 rounded-xl border border-[var(--kg-border)]">"{getZaloMessage()}"</p>
              <div className="flex space-x-2 mt-3">
                <button onClick={() => copyToClipboard(getZaloMessage())} className="flex-1 soft3d-card text-[var(--kg-primary)] text-xs font-bold py-2 rounded-lg border border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)] transition flex items-center justify-center">
                  <Copy size={14} className="mr-1" /> Copy
                </button>
                <a href={`https://zalo.me`} target="_blank" rel="noreferrer" className="flex-1 bg-[#0068ff] text-white text-xs font-bold py-2 rounded-lg hover:bg-blue-700 transition flex items-center justify-center text-center">
                  Mở Zalo
                </a>
              </div>
            </div>
          )}

          <button 
            type="button"
            onClick={handleSwapRequest} 
            className="w-full bg-[var(--kg-primary)] text-white font-black py-4 rounded-2xl shadow-md hover:brightness-110 transition-all transform active:scale-98 flex items-center justify-center touch-manipulation border-none text-xs sm:text-sm tracking-wider uppercase"
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
    </div>
  );
}
