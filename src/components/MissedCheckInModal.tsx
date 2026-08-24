import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Send,
  Camera,
  Image as ImageIcon,
  History,
  ShieldCheck,
  Sparkles,
  X,
  RefreshCw,
  Info,
  HelpCircle
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import { fileToBase64 } from '../utils/helpers';
import confetti from 'canvas-confetti';

export interface MissedClaimItem {
  id: string;
  createdAt: string;
  username: string;
  fullname: string;
  date: string;
  time: string;
  type: string;
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
  defaultType?: 'Vào ca' | 'Ra ca';
  onSuccess?: () => void;
}

const COMMON_REASONS = [
  'Lỗi kết nối mạng tại quán',
  'Camera điện thoại không nhận diện',
  'Hết pin / Điện thoại sập nguồn',
  'Quên bấm máy khi vào việc gấp',
  'GPS báo sai khoảng cách',
  'Lỗi kỹ thuật khác'
];

export default function MissedCheckInModal({
  isOpen,
  onClose,
  defaultType = 'Vào ca',
  onSuccess
}: MissedCheckInModalProps) {
  const store = useAppStore();
  const { currentUser } = store;
  const isAdmin = currentUser?.role === 'admin' || currentUser?.username === 'ADMIN' || currentUser?.role === 'tester';

  const [activeTab, setActiveTab] = useState<'create' | 'guide' | 'history' | 'admin'>('create');
  
  // Form State
  const today = new Date();
  const [claimDate, setClaimDate] = useState(() => {
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}/${m}/${y}`;
  });
  const [claimTime, setClaimTime] = useState(() => {
    const h = String(today.getHours()).padStart(2, '0');
    const min = String(today.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  });
  const [claimType, setClaimType] = useState<'Vào ca' | 'Ra ca'>(defaultType);
  const [claimShift, setClaimShift] = useState('15:00');
  const [claimReasonPreset, setClaimReasonPreset] = useState(COMMON_REASONS[0]);
  const [claimReasonDetail, setClaimReasonDetail] = useState('');
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Success Receipt State
  const [submittedClaim, setSubmittedClaim] = useState<MissedClaimItem | null>(null);
  const [copiedZalo, setCopiedZalo] = useState(false);

  // History & Admin List
  const [claimsList, setClaimsList] = useState<MissedClaimItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchClaims = async () => {
    if (!currentUser) return;
    setIsLoadingList(true);
    try {
      const res = await callApi('GET_MISSED_CHECKINS', {
        username: currentUser.username,
        role: currentUser.role
      }, { background: true });
      if (res?.ok && Array.isArray(res.data)) {
        setClaimsList(res.data);
      }
    } catch (err) {
      console.error('Error fetching missed claims:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchClaims();
    }
  }, [isOpen, activeTab]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await fileToBase64(file);
      setProofImage(base64);
    } catch (err) {
      console.error('Error converting image:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const finalReason = claimReasonDetail.trim()
      ? `${claimReasonPreset}: ${claimReasonDetail.trim()}`
      : claimReasonPreset;

    setIsSubmitting(true);
    try {
      const res = await callApi('SUBMIT_MISSED_CHECKIN', {
        username: currentUser.username,
        fullname: currentUser.fullname || currentUser.username,
        date: claimDate,
        time: claimTime,
        type: claimType,
        shift: claimShift,
        reason: finalReason,
        imageBase64: proofImage
      });

      if (res?.ok) {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
        const newClaim: MissedClaimItem = {
          id: res.data?.id || `MC_${Date.now()}`,
          createdAt: new Date().toLocaleTimeString('vi-VN'),
          username: currentUser.username,
          fullname: currentUser.fullname || currentUser.username,
          date: claimDate,
          time: claimTime,
          type: claimType,
          shift: claimShift,
          reason: finalReason,
          proofImage: proofImage || undefined,
          status: 'Pending'
        };
        setSubmittedClaim(newClaim);
        if (onSuccess) onSuccess();
        fetchClaims();
      } else {
        alert(res?.message || 'Không thể gửi đơn, vui lòng thử lại.');
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi kết nối khi gửi đơn.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (claim: MissedClaimItem) => {
    if (!isAdmin) return;
    if (!confirm(`Xác nhận duyệt đơn bổ sung công cho [${claim.fullname}] - ${claim.type} ${claim.time} ngày ${claim.date}?`)) return;

    store.setLoading(true, 'Đang duyệt & ghi nhận vào Bảng công...');
    try {
      const res = await callApi('APPROVE_MISSED_CHECKIN', {
        id: claim.id,
        adminUsername: currentUser?.username || 'ADMIN'
      });
      store.setLoading(false);
      if (res?.ok) {
        confetti({ particleCount: 60, spread: 70 });
        alert('✓ ' + (res.data?.message || 'Đã duyệt thành công và ghi nhận vào Bảng chấm công!'));
        fetchClaims();
        if (onSuccess) onSuccess();
      } else {
        alert(res?.message || 'Có lỗi xảy ra khi duyệt đơn');
      }
    } catch (err: any) {
      store.setLoading(false);
      alert(err.message || 'Lỗi hệ thống');
    }
  };

  const handleReject = async (claimId: string) => {
    if (!isAdmin) return;
    store.setLoading(true, 'Đang xử lý từ chối...');
    try {
      const res = await callApi('REJECT_MISSED_CHECKIN', {
        id: claimId,
        adminUsername: currentUser?.username || 'ADMIN',
        reason: rejectReason || 'Không hợp lệ / Không đủ minh chứng'
      });
      store.setLoading(false);
      if (res?.ok) {
        setRejectingId(null);
        setRejectReason('');
        alert('Đã từ chối đơn.');
        fetchClaims();
      } else {
        alert(res?.message || 'Có lỗi xảy ra');
      }
    } catch (err: any) {
      store.setLoading(false);
      alert(err.message || 'Lỗi hệ thống');
    }
  };

  const getZaloText = (claim: MissedClaimItem) => {
    return `📢 [BÁO BỔ SUNG CÔNG - KING'S GRILL]
• Nhân viên: ${claim.fullname} (@${claim.username})
• Loại chấm công: ${claim.type} (Ca: ${claim.shift})
• Thời gian thực tế: ${claim.time} ngày ${claim.date}
• Lý do: ${claim.reason}
• Mã đơn: #${claim.id}
➡️ Em nhờ Quản lý duyệt giúp em ạ!`;
  };

  const handleCopyZalo = (claim: MissedClaimItem) => {
    const text = getZaloText(claim);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedZalo(true);
      setTimeout(() => setCopiedZalo(false), 3000);
    });
  };

  const pendingCount = claimsList.filter(c => c.status === 'Pending').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 md:p-6 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-[var(--kg-surface)] text-[var(--kg-text)] rounded-3xl shadow-2xl border border-[var(--kg-border)] flex flex-col overflow-hidden z-10 animate-scale-in">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--kg-border)] flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md font-black flex-shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                Bổ Sung Lượt Chấm Công
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold uppercase">
                  Sự Cố
                </span>
              </h3>
              <p className="text-xs text-[var(--kg-text-muted)] mt-0.5 font-medium">
                Gửi đơn giải trình khi gặp lỗi mạng, hết pin, sự cố máy ảnh / GPS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)] text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center transition-colors active:scale-95 flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)] px-3 pt-2 gap-1 overflow-x-auto flex-shrink-0 hide-scrollbar">
          <button
            type="button"
            onClick={() => { setActiveTab('create'); setSubmittedClaim(null); }}
            className={`px-3 sm:px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
              activeTab === 'create'
                ? 'bg-[var(--kg-surface)] text-amber-600 dark:text-amber-400 border-amber-500 shadow-xs'
                : 'text-[var(--kg-text-muted)] border-transparent hover:text-[var(--kg-text)]'
            }`}
          >
            <Send size={15} />
            <span>Khai Báo Đơn</span>
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`px-3 sm:px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
              activeTab === 'guide'
                ? 'bg-[var(--kg-surface)] text-amber-600 dark:text-amber-400 border-amber-500 shadow-xs'
                : 'text-[var(--kg-text-muted)] border-transparent hover:text-[var(--kg-text)]'
            }`}
          >
            <HelpCircle size={15} />
            <span>Hướng Dẫn 3 Bước</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3 sm:px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
              activeTab === 'history'
                ? 'bg-[var(--kg-surface)] text-amber-600 dark:text-amber-400 border-amber-500 shadow-xs'
                : 'text-[var(--kg-text-muted)] border-transparent hover:text-[var(--kg-text)]'
            }`}
          >
            <History size={15} />
            <span>Lịch Sử Đơn</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`px-3 sm:px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-black transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
                activeTab === 'admin'
                  ? 'bg-[var(--kg-surface)] text-amber-600 dark:text-amber-400 border-amber-500 shadow-xs'
                  : 'text-[var(--kg-text-muted)] border-transparent hover:text-[var(--kg-text)]'
              }`}
            >
              <ShieldCheck size={15} />
              <span>Duyệt Đơn (Quản lý)</span>
              {pendingCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black animate-pulse">
                  {pendingCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {/* TAB 1: CREATE FORM OR SUCCESS RECEIPT */}
          {activeTab === 'create' && (
            <>
              {submittedClaim ? (
                /* SUCCESS RECEIPT VIEW */
                <div className="space-y-5 animate-scale-in">
                  <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                      <CheckCircle2 size={26} />
                    </div>
                    <h4 className="text-base font-black text-emerald-700 dark:text-emerald-300">
                      Gửi Đơn Thành Công!
                    </h4>
                    <p className="text-xs text-[var(--kg-text-muted)] max-w-md mx-auto leading-relaxed">
                      Đơn của bạn đã được lưu vào hệ thống. Hãy sao chép nội dung bên dưới và dán vào nhóm Zalo để Quản lý duyệt sớm nhé.
                    </p>
                  </div>

                  {/* Receipt Card */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-3 font-mono text-xs">
                    <div className="flex items-center justify-between border-b border-[var(--kg-border)] pb-2 font-sans">
                      <span className="font-black text-amber-600 dark:text-amber-400">BIÊN LAI ĐƠN #{submittedClaim.id}</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-600 font-bold text-[10px]">Chờ duyệt</span>
                    </div>
                    <div className="space-y-1 text-[var(--kg-text)] font-sans">
                      <p>👤 <b>Nhân viên:</b> {submittedClaim.fullname} (@{submittedClaim.username})</p>
                      <p>🕒 <b>Thời gian:</b> {submittedClaim.time} ngày {submittedClaim.date}</p>
                      <p>🏷️ <b>Loại:</b> <span className="font-bold text-blue-600 dark:text-blue-400">{submittedClaim.type}</span> (Ca: {submittedClaim.shift})</p>
                      <p>📝 <b>Lý do:</b> {submittedClaim.reason}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={() => handleCopyZalo(submittedClaim)}
                      className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 text-white rounded-2xl font-black text-sm shadow-md transition active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      {copiedZalo ? <Check size={18} className="text-emerald-300" /> : <Copy size={18} />}
                      <span>{copiedZalo ? '✓ ĐÃ SAO CHÉP VÀO BỘ NHỚ TẠM!' : '📋 Sao Chép Nội Dung Gửi Nhóm Zalo'}</span>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => { setSubmittedClaim(null); setActiveTab('history'); }}
                      className="w-full py-2.5 px-4 bg-[var(--kg-surface)] hover:bg-[var(--kg-border)] text-[var(--kg-text)] border border-[var(--kg-border)] rounded-xl font-bold text-xs transition"
                    >
                      Xem danh sách đơn đã gửi →
                    </button>
                  </div>
                </div>
              ) : (
                /* FORM INPUT */
                <form onSubmit={handleSubmit} className="space-y-4">
                  
                  {/* Quick Notice */}
                  <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                    <Info size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="leading-snug">
                      Sau khi bấm <b>Gửi bổ sung</b>, vui lòng chụp màn hình hoặc sao chép biên lai gửi vào <b>Nhóm Zalo King's Grill</b> để Quản lý duyệt và tự động cộng công vào Bảng lương.
                    </p>
                  </div>

                  {/* Date & Time Select */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black text-[var(--kg-text-muted)] mb-1 uppercase tracking-wider flex items-center gap-1">
                        <Calendar size={13} /> Ngày làm việc
                      </label>
                      <input
                        type="text"
                        value={claimDate}
                        onChange={(e) => setClaimDate(e.target.value)}
                        placeholder="dd/MM/yyyy (ví dụ: 24/08/2026)"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-xs sm:text-sm font-bold text-[var(--kg-text)] focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-[var(--kg-text-muted)] mb-1 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={13} /> Giờ thực tế
                      </label>
                      <input
                        type="text"
                        value={claimTime}
                        onChange={(e) => setClaimTime(e.target.value)}
                        placeholder="HH:mm (ví dụ: 15:02)"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-xs sm:text-sm font-bold text-[var(--kg-text)] focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>

                  {/* Type & Shift */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black text-[var(--kg-text-muted)] mb-1 uppercase tracking-wider">
                        Loại chấm công
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setClaimType('Vào ca')}
                          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all border ${
                            claimType === 'Vào ca'
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border-[var(--kg-border)]'
                          }`}
                        >
                          🟢 Vào Ca
                        </button>
                        <button
                          type="button"
                          onClick={() => setClaimType('Ra ca')}
                          className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all border ${
                            claimType === 'Ra ca'
                              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                              : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border-[var(--kg-border)]'
                          }`}
                        >
                          🔴 Ra Ca
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-[var(--kg-text-muted)] mb-1 uppercase tracking-wider">
                        Ca đăng ký
                      </label>
                      <select
                        value={claimShift}
                        onChange={(e) => setClaimShift(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-xs sm:text-sm font-bold text-[var(--kg-text)] focus:outline-none focus:border-amber-500"
                      >
                        <option value="15:00">Ca 15:00</option>
                        <option value="17:00">Ca 17:00</option>
                        <option value="18:00">Ca 18:00</option>
                        <option value="19:00">Ca 19:00</option>
                        <option value="Khác">Ca khác / Ca gãy</option>
                      </select>
                    </div>
                  </div>

                  {/* Preset Reasons */}
                  <div>
                    <label className="block text-xs font-black text-[var(--kg-text-muted)] mb-1.5 uppercase tracking-wider">
                      Lý do sự cố phổ biến
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {COMMON_REASONS.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setClaimReasonPreset(r)}
                          className={`py-2 px-2.5 rounded-xl text-[11px] font-bold text-left transition-all border leading-tight ${
                            claimReasonPreset === r
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/50 shadow-xs'
                              : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Detailed note */}
                  <div>
                    <label className="block text-xs font-black text-[var(--kg-text-muted)] mb-1 uppercase tracking-wider">
                      Mô tả chi tiết sự cố (không bắt buộc)
                    </label>
                    <textarea
                      rows={2}
                      value={claimReasonDetail}
                      onChange={(e) => setClaimReasonDetail(e.target.value)}
                      placeholder="Ví dụ: Đã đến quán lúc 14:58 nhưng điện thoại bị sập nguồn..."
                      className="w-full px-3.5 py-2 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-xs sm:text-sm text-[var(--kg-text)] focus:outline-none focus:border-amber-500 resize-none"
                    />
                  </div>

                  {/* Proof Image Attachment */}
                  <div>
                    <label className="block text-xs font-black text-[var(--kg-text-muted)] mb-1 uppercase tracking-wider flex items-center justify-between">
                      <span>Ảnh minh chứng (tùy chọn)</span>
                      {proofImage && (
                        <button
                          type="button"
                          onClick={() => setProofImage(null)}
                          className="text-[11px] text-rose-500 hover:underline"
                        >
                          Xóa ảnh
                        </button>
                      )}
                    </label>
                    
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />

                    {proofImage ? (
                      <div className="relative rounded-2xl overflow-hidden border border-[var(--kg-border)] max-h-48 bg-black flex items-center justify-center">
                        <img src={proofImage} alt="Proof" className="max-h-48 object-contain" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-3 px-4 rounded-xl border border-dashed border-[var(--kg-border)] hover:border-amber-500 text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] flex items-center justify-center gap-2 text-xs font-bold transition bg-[var(--kg-surface-soft)]"
                      >
                        <Camera size={16} className="text-amber-500" />
                        <span>Chụp / Đính kèm ảnh minh chứng tại quán</span>
                      </button>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white rounded-2xl font-black text-sm shadow-md transition active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" />
                          <span>Đang gửi đơn...</span>
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          <span>GỬI BỔ SUNG CHẤM CÔNG</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* TAB 2: STEP-BY-STEP QUICK GUIDE */}
          {activeTab === 'guide' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                <h4 className="text-sm font-black text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <Sparkles size={16} />
                  Hướng Dẫn 3 Bước Báo Bổ Sung Công
                </h4>
                <p className="text-xs text-[var(--kg-text-muted)] mt-1">
                  Dành cho nhân viên khi gặp sự cố không thể chấm công trực tiếp bằng camera trên ứng dụng.
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl bg-amber-500 text-white font-black text-xs flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                    1
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-[var(--kg-text)]">Khai Báo Thông Tin Đơn</h5>
                    <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 leading-relaxed">
                      Vào tab <b>Khai Báo Đơn</b> $\rightarrow$ Chọn Ngày, Giờ thực tế bạn có mặt $\rightarrow$ Chọn loại <b>Vào ca</b> hoặc <b>Ra ca</b> $\rightarrow$ Chọn lý do sự cố $\rightarrow$ Bấm <b>Gửi bổ sung</b>.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl bg-blue-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                    2
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-[var(--kg-text)]">Gửi Biên Lai Vào Nhóm Zalo</h5>
                    <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 leading-relaxed">
                      Sau khi gửi thành công, bấm nút <b>"📋 Sao Chép Nội Dung Gửi Zalo"</b> $\rightarrow$ Dán vào nhóm Zalo nhà hàng để thông báo và nhờ Quản lý duyệt.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white font-black text-xs flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
                    3
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-[var(--kg-text)]">Quản Lý Duyệt & Tự Động Cộng Công</h5>
                    <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 leading-relaxed">
                      Khi Quản lý bấm Duyệt, hệ thống tự động ghi nhận lượt chấm công này vào Bảng công và Lịch sử chấm công của bạn với ghi chú <i>"Báo chấm công bổ sung - Đã duyệt"</i>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-xs font-black shadow-sm transition active:scale-95 text-center"
                >
                  Bắt đầu tạo đơn ngay →
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: USER CLAIM HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[var(--kg-text-muted)] uppercase tracking-wider">
                  Lịch sử đơn của bạn ({claimsList.filter(c => !isAdmin || c.username === currentUser?.username).length})
                </span>
                <button
                  type="button"
                  onClick={fetchClaims}
                  className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 hover:underline"
                >
                  <RefreshCw size={12} className={isLoadingList ? 'animate-spin' : ''} />
                  Làm mới
                </button>
              </div>

              {isLoadingList ? (
                <div className="py-10 text-center text-xs text-[var(--kg-text-muted)]">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-amber-500" />
                  Đang tải danh sách đơn...
                </div>
              ) : claimsList.filter(c => !isAdmin || c.username === currentUser?.username).length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs text-[var(--kg-text-muted)]">
                  Bạn chưa có đơn báo bổ sung công nào.
                </div>
              ) : (
                claimsList.filter(c => !isAdmin || c.username === currentUser?.username).map((claim) => (
                  <div
                    key={claim.id}
                    className="p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-[10px] text-[var(--kg-text-muted)]">#{claim.id}</span>
                        <h5 className="font-black text-[var(--kg-text)] text-xs sm:text-sm">
                          {claim.type} • {claim.time} ngày {claim.date}
                        </h5>
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        claim.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                        claim.status === 'Rejected' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400' :
                        'bg-amber-500/20 text-amber-600 dark:text-amber-400 animate-pulse'
                      }`}>
                        {claim.status === 'Approved' ? '✓ Đã Duyệt' : claim.status === 'Rejected' ? '✕ Từ Chối' : '⏳ Chờ Duyệt'}
                      </span>
                    </div>

                    <p className="text-[11px] text-[var(--kg-text-muted)]">
                      <b>Lý do:</b> {claim.reason}
                    </p>

                    {claim.status === 'Approved' && claim.approvedBy && (
                      <p className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium">
                        ✓ Duyệt bởi <b>{claim.approvedBy}</b> lúc {claim.approvedAt}
                      </p>
                    )}

                    {claim.status === 'Rejected' && claim.note && (
                      <p className="text-[10.5px] text-rose-600 dark:text-rose-400 font-medium">
                        Lý do từ chối: {claim.note}
                      </p>
                    )}

                    {claim.status === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => handleCopyZalo(claim)}
                        className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 pt-1"
                      >
                        <Copy size={12} /> Sao chép gửi lại nhóm Zalo
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: ADMIN APPROVAL VIEW */}
          {activeTab === 'admin' && isAdmin && (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[var(--kg-text-muted)] uppercase tracking-wider">
                  Hàng chờ duyệt toàn quán ({claimsList.filter(c => c.status === 'Pending').length} đơn chờ)
                </span>
                <button
                  type="button"
                  onClick={fetchClaims}
                  className="text-xs text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 hover:underline"
                >
                  <RefreshCw size={12} className={isLoadingList ? 'animate-spin' : ''} />
                  Làm mới
                </button>
              </div>

              {isLoadingList ? (
                <div className="py-10 text-center text-xs text-[var(--kg-text-muted)]">
                  <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-amber-500" />
                  Đang tải danh sách...
                </div>
              ) : claimsList.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-xs text-[var(--kg-text-muted)]">
                  Hiện không có đơn báo bổ sung nào.
                </div>
              ) : (
                claimsList.map((claim) => (
                  <div
                    key={claim.id}
                    className={`p-4 rounded-2xl border transition-all space-y-3 ${
                      claim.status === 'Pending'
                        ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                        : 'bg-[var(--kg-surface-soft)] border-[var(--kg-border)] opacity-85'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-[var(--kg-text-muted)]">#{claim.id}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            claim.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-600' :
                            claim.status === 'Rejected' ? 'bg-rose-500/20 text-rose-600' :
                            'bg-amber-500 text-white'
                          }`}>
                            {claim.status === 'Approved' ? 'Đã Duyệt' : claim.status === 'Rejected' ? 'Từ Chối' : 'Chờ Duyệt'}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-[var(--kg-text)] mt-1">
                          {claim.fullname} <span className="text-xs font-normal text-[var(--kg-text-muted)]">(@{claim.username})</span>
                        </h4>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-blue-600 dark:text-blue-400 block">{claim.type}</span>
                        <span className="text-[11px] font-mono text-[var(--kg-text-muted)]">{claim.time} • {claim.date}</span>
                      </div>
                    </div>

                    <div className="text-xs bg-[var(--kg-surface)] p-2.5 rounded-xl border border-[var(--kg-border)] space-y-1">
                      <p><b>Ca:</b> {claim.shift || 'Không rõ'}</p>
                      <p><b>Lý do:</b> {claim.reason}</p>
                      {claim.proofImage && (
                        <div className="pt-1">
                          <a
                            href={claim.proofImage}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-bold text-amber-600 hover:underline inline-flex items-center gap-1"
                          >
                            <ImageIcon size={13} /> Xem ảnh minh chứng đính kèm
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Admin Actions */}
                    {claim.status === 'Pending' && (
                      <div>
                        {rejectingId === claim.id ? (
                          <div className="space-y-2 pt-1">
                            <input
                              type="text"
                              placeholder="Nhập lý do từ chối..."
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs rounded-xl bg-[var(--kg-surface)] border border-rose-400 focus:outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleReject(claim.id)}
                                className="flex-1 py-1.5 bg-rose-600 text-white font-bold rounded-xl text-xs"
                              >
                                Xác nhận từ chối
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectingId(null)}
                                className="px-3 py-1.5 bg-[var(--kg-surface)] text-xs rounded-xl border border-[var(--kg-border)]"
                              >
                                Hủy
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleApprove(claim)}
                              className="flex-1 py-2 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 text-white rounded-xl text-xs font-black shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                            >
                              <CheckCircle2 size={14} />
                              <span>DUYỆT & GHI CÔNG</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { setRejectingId(claim.id); setRejectReason(''); }}
                              className="py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 rounded-xl text-xs font-bold transition active:scale-95"
                            >
                              Từ chối
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
