import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import {
  AlertTriangle,
  FileText,
  Banknote,
  ShieldAlert,
  CheckCircle2,
  Clock,
  History,
  RefreshCw,
  CheckCheck,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KgModuleHero } from '../components/KgDesignSystem';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import { isWorkEligible } from '../utils/employment';

interface HandoverRecord {
  id: string;
  date: string;
  shift: string;
  username: string;
  cashAmount: string;
  note: string;
  timestamp: string;
}

export default function Handover() {
  const currentUser = useAppStore(state => state.currentUser);
  const shiftName = useAppStore(state => state.shiftName);
  const setUpdating = useAppStore(state => state.setUpdating);
  const setLoading = useAppStore(state => state.setLoading);

  const [activeTab, setActiveTab] = useState<'handover' | 'incident' | 'history'>('handover');

  // Handover form
  const [cashAmount, setCashAmount] = useState('');
  const [handoverNote, setHandoverNote] = useState('');

  // Incident form
  const [incidentCategory, setIncidentCategory] = useState('');
  const [incidentDesc, setIncidentDesc] = useState('');

  // Recent handovers state
  const [handovers, setHandovers] = useState<HandoverRecord[]>([]);
  const [loadingHandovers, setLoadingHandovers] = useState(false);
  const [ackHandoverId, setAckHandoverId] = useState<string | null>(() => {
    return localStorage.getItem('kg_ack_handover_id');
  });

  const loadHandovers = useCallback(async () => {
    setLoadingHandovers(true);
    try {
      const res = await callApi('GET_HANDOVERS', {}, { background: true, cacheTtlMs: 5000 });
      if (res?.ok && Array.isArray(res.data?.handovers)) {
        setHandovers(res.data.handovers);
      }
    } catch {
      // Background fail safe
    } finally {
      setLoadingHandovers(false);
    }
  }, []);

  useEffect(() => {
    loadHandovers();
  }, [loadHandovers]);

  // Format currency
  const handleCashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    if (val === '') {
      setCashAmount('');
      return;
    }
    const num = parseInt(val, 10);
    setCashAmount(num.toLocaleString('vi-VN'));
  };

  const handleAcknowledgeCash = (handover: HandoverRecord) => {
    localStorage.setItem('kg_ack_handover_id', handover.id);
    setAckHandoverId(handover.id);
    Swal.fire({
      title: 'Đã xác nhận kiểm đếm!',
      text: `Bạn đã xác nhận nhận đủ ${handover.cashAmount}đ từ ca trước (${handover.username}).`,
      icon: 'success',
      confirmButtonColor: '#10b981'
    });
  };

  const submitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashAmount) {
      Swal.fire('Thiếu thông tin', 'Vui lòng nhập số tiền mặt bàn giao', 'warning');
      return;
    }

    setUpdating(true);
    setLoading(true, 'Đang gửi bàn giao ca...');
    try {
      const res = await callApi('SUBMIT_HANDOVER', {
        username: currentUser?.username,
        fullname: currentUser?.fullname,
        shift: shiftName,
        cashAmount,
        note: handoverNote
      });

      if (res?.ok) {
        Swal.fire({
          title: 'Thành công!',
          text: 'Đã ghi nhận bàn giao két tiền lên hệ thống.',
          icon: 'success',
          confirmButtonColor: '#10b981'
        });
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

  const submitIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentCategory) {
      Swal.fire('Thiếu thông tin', 'Vui lòng chọn loại sự cố', 'warning');
      return;
    }
    if (!incidentDesc) {
      Swal.fire('Thiếu thông tin', 'Vui lòng mô tả chi tiết sự cố', 'warning');
      return;
    }

    setUpdating(true);
    setLoading(true, 'Đang gửi báo cáo sự cố...');
    try {
      const res = await callApi('SUBMIT_INCIDENT', {
        username: currentUser?.username,
        fullname: currentUser?.fullname,
        category: incidentCategory,
        description: incidentDesc
      });

      if (res?.ok) {
        Swal.fire({
          title: 'Đã gửi báo cáo!',
          text: 'Quản lý đã nhận được báo cáo sự cố ca trực.',
          icon: 'success',
          confirmButtonColor: '#10b981'
        });
        setIncidentCategory('');
        setIncidentDesc('');
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

  const latestHandover = handovers.length > 0 ? handovers[0] : null;

  return (
    <div className="h-full flex flex-col space-y-4 pb-16 animate-fade-in">
      <KgModuleHero
        moduleId="handover"
        title="Sổ Bàn Giao Ca & Két Tiền"
        description="Chuyển giao trách nhiệm quỹ tiền mặt và báo cáo sự cố vận hành ca trực."
        eyebrow="Vận hành"
        features={['Bàn giao tiền mặt', 'Đối soát 2 chiều', 'Báo cáo sự cố tức thì']}
        tipTitle="Quy chuẩn Bàn giao Ca & Quỹ tiền mặt"
        tips={[
          "Kiểm đếm tiền mặt thực tế trong két thu ngân trước khi bàn giao cho ca tiếp theo.",
          "Đối chiếu số dư đầu ca + doanh thu tiền mặt phát sinh trong ca = số dư thực tế trong két.",
          "Ca nhận tiền cần bấm 'Xác nhận đã nhận đủ két tiền' để đảm bảo tính minh bạch 2 bên.",
          "Nếu có sự cố thiết bị (máy in, POS, máy lạnh), chuyển sang tab 'Báo cáo sự cố' để ghi nhận ngay."
        ]}
      />

      {/* Content wrapper */}
      <div className="relative z-20 flex-1 flex flex-col space-y-4">
        {/* Custom Navigation Tabs */}
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-1.5 rounded-2xl flex gap-1.5 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('handover')}
            className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-95 select-none ${
              activeTab === 'handover'
                ? 'bg-[var(--kg-primary)] text-white shadow-xs scale-[1.01]'
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
            }`}
          >
            <Banknote size={16} className="mr-1.5" /> Bàn giao quỹ
            {activeTab === 'handover' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-accent)] ml-1.5" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-95 select-none ${
              activeTab === 'history'
                ? 'bg-[var(--kg-primary)] text-white shadow-xs scale-[1.01]'
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
            }`}
          >
            <History size={16} className="mr-1.5" /> Nhật ký két
            {activeTab === 'history' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 ml-1.5" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('incident')}
            className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-95 select-none ${
              activeTab === 'incident'
                ? 'bg-[var(--kg-primary)] text-white shadow-xs scale-[1.01]'
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
            }`}
          >
            <ShieldAlert size={16} className="mr-1.5 text-rose-400" /> Báo sự cố
            {activeTab === 'incident' && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 ml-1.5" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
          <AnimatePresence mode="wait">
            {/* TAB 1: HANDOVER FORM */}
            {activeTab === 'handover' && (
              <motion.div
                key="handover"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                {/* 2-Way Ledger: Latest Incoming Handover Banner */}
                {latestHandover ? (
                  <div className="bg-[var(--kg-surface)] border-2 border-emerald-500/30 rounded-2xl p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--kg-border)]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                        <h4 className="font-black text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          Két tiền bàn giao gần nhất ({latestHandover.shift || 'Ca trước'})
                        </h4>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-[var(--kg-text-muted)]">
                        {latestHandover.date}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-2xl font-black font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                          {latestHandover.cashAmount} <span className="text-xs font-sans text-[var(--kg-text-muted)]">VNĐ</span>
                        </div>
                        <p className="text-xs text-[var(--kg-text-muted)] font-medium mt-0.5">
                          Người giao: <b className="text-[var(--kg-text)]">{latestHandover.username}</b>
                          {latestHandover.note ? ` • "${latestHandover.note}"` : ''}
                        </p>
                      </div>

                      {ackHandoverId === latestHandover.id ? (
                        <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs">
                          <CheckCheck size={16} /> Đã xác nhận kiểm đếm đủ
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAcknowledgeCash(latestHandover)}
                          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 size={15} />
                          Xác nhận nhận đủ két
                        </button>
                      )}
                    </div>
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

                {/* Submit New Handover Form */}
                <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--kg-border)]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <Banknote size={20} />
                      </div>
                      <div>
                        <h3 className="font-black text-sm sm:text-base text-[var(--kg-text)]">Bàn giao két cuối ca</h3>
                        <p className="text-xs text-[var(--kg-text-muted)] font-medium">
                          Ca hiện tại: <b className="text-[var(--kg-text)]">{shiftName}</b>
                        </p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={submitHandover} className="space-y-4">
                    <div>
                      <label className="block text-xs font-black text-[var(--kg-text)] mb-1.5">
                        Số tiền mặt thực tế trong két (VNĐ) *
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--kg-text-muted)] font-bold text-xs">
                          VNĐ
                        </div>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={cashAmount}
                          onChange={handleCashChange}
                          placeholder="VD: 500.000"
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl pl-14 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] font-mono font-black text-sm sm:text-base tracking-wide min-h-[44px]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-[var(--kg-text)] mb-1.5">Ghi chú thêm</label>
                      <div className="relative">
                        <div className="absolute top-3 left-3 flex items-start pointer-events-none text-[var(--kg-text-muted)]">
                          <FileText size={16} />
                        </div>
                        <textarea
                          value={handoverNote}
                          onChange={(e) => setHandoverNote(e.target.value)}
                          placeholder="Ghi chú về tiền dư/thiếu, hóa đơn chi gấp, tạm ứng..."
                          rows={3}
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[var(--kg-primary)] text-[var(--kg-text)] text-xs sm:text-sm"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-[var(--kg-primary)] hover:brightness-110 text-white font-black py-3.5 rounded-2xl shadow-md transition-all transform active:scale-98 flex items-center justify-center text-xs sm:text-sm uppercase tracking-wider"
                    >
                      <CheckCircle2 size={18} className="mr-1.5 text-emerald-400" /> XÁC NHẬN BÀN GIAO KÉT TIỀN
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
                    <h3 className="font-black text-sm sm:text-base text-[var(--kg-text)]">Nhật ký bàn giao ca gần đây</h3>
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
                    {handovers.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="p-3 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 font-bold text-xs">
                            #{idx + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-sm text-[var(--kg-text)]">
                                {item.cashAmount} đ
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-700 dark:text-blue-300">
                                {item.shift || 'Ca trực'}
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 font-medium">
                              Bởi: <b className="text-[var(--kg-text)]">{item.username}</b> • Ngày: {item.date}
                            </p>
                          </div>
                        </div>

                        {item.note && (
                          <div className="text-xs text-[var(--kg-text-muted)] italic sm:text-right max-w-xs truncate">
                            "{item.note}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 3: INCIDENT REPORT */}
            {activeTab === 'incident' && (
              <motion.div
                key="incident"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="bg-[var(--kg-surface)] border border-rose-500/20 dark:border-rose-900/30 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4"
              >
                <div className="flex items-center gap-3 pb-3 border-b border-[var(--kg-border)]">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-sm sm:text-base text-[var(--kg-text)]">Báo cáo sự cố ca trực</h3>
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">Báo cho Quản lý biết ngay lập tức</p>
                  </div>
                </div>

                <form onSubmit={submitIncident} className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-[var(--kg-text)] mb-1.5">Phân loại sự cố *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Thiết bị hỏng', 'Khách phàn nàn', 'Thiếu nguyên liệu', 'Khác'].map(cat => (
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
                          <span>{cat}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-[var(--kg-text)] mb-1.5">Mô tả chi tiết *</label>
                    <textarea
                      value={incidentDesc}
                      onChange={(e) => setIncidentDesc(e.target.value)}
                      placeholder="Mô tả cụ thể sự cố (Ví dụ: Máy in bill hết giấy/kẹt giấy, máy lạnh bàn 5 chảy nước...)"
                      rows={4}
                      className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-rose-500/50 text-[var(--kg-text)] text-xs sm:text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-black py-3.5 rounded-2xl shadow-md transition-all transform active:scale-95 flex items-center justify-center text-xs sm:text-sm uppercase tracking-wider"
                  >
                    <ShieldAlert size={18} className="mr-1.5" /> GỬI BÁO CÁO SỰ CỐ NGAY
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
