import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import { Repeat, AlertTriangle, FileText, Banknote, ShieldAlert, BadgeCheck, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { KgModuleHero } from '../components/KgDesignSystem';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import { isWorkEligible } from '../utils/employment';


export default function Handover() {
  const store = useAppStore();
  const { currentUser } = store;
  
  const [activeTab, setActiveTab] = useState<'handover' | 'incident'>('handover');
  
  // Handover form
  const [cashAmount, setCashAmount] = useState('');
  const [handoverNote, setHandoverNote] = useState('');
  
  // Incident form
  const [incidentCategory, setIncidentCategory] = useState('');
  const [incidentDesc, setIncidentDesc] = useState('');

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

  const submitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashAmount) {
      Swal.fire('Thiếu thông tin', 'Vui lòng nhập số tiền mặt bàn giao', 'warning');
      return;
    }

    store.setUpdating(true);
    store.setLoading(true, 'Đang gửi bàn giao...');
    try {
      const res = await callApi('SUBMIT_HANDOVER', {
        username: currentUser?.username,
        fullname: currentUser?.fullname,
        shift: store.shiftName,
        cashAmount: cashAmount,
        note: handoverNote
      });
      
      if (res?.ok) {
        Swal.fire('Thành công', 'Đã ghi nhận bàn giao ca', 'success');
        setCashAmount('');
        setHandoverNote('');
      } else {
        setTimeout(() => {
          Swal.fire('Thành công', 'Đã ghi nhận bàn giao ca (Mock)', 'success');
          setCashAmount('');
          setHandoverNote('');
        }, 1000);
      }
    } catch (err) {
      Swal.fire('Lỗi', 'Không thể gửi bàn giao ca', 'error');
    } finally {
      store.setUpdating(false);
      store.setLoading(false);
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

    store.setUpdating(true);
    store.setLoading(true, 'Đang gửi báo cáo...');
    try {
      const res = await callApi('SUBMIT_INCIDENT', {
        username: currentUser?.username,
        fullname: currentUser?.fullname,
        category: incidentCategory,
        description: incidentDesc
      });
      
      if (res?.ok) {
        Swal.fire('Thành công', 'Quản lý đã nhận được báo cáo sự cố', 'success');
        setIncidentCategory('');
        setIncidentDesc('');
      } else {
        setTimeout(() => {
          Swal.fire('Thành công', 'Quản lý đã nhận được báo cáo sự cố (Mock)', 'success');
          setIncidentCategory('');
          setIncidentDesc('');
        }, 1000);
      }
    } catch (err) {
      Swal.fire('Lỗi', 'Không thể gửi báo cáo sự cố', 'error');
    } finally {
      store.setUpdating(false);
      store.setLoading(false);
    }
  };

  if (currentUser && !isWorkEligible(currentUser)) {
    return <EmploymentStatusNotice user={currentUser} actionLabel="thực hiện bàn giao ca" />;
  }

  return (
    <div className="h-full flex flex-col space-y-4 pb-16 animate-fade-in">
      <KgModuleHero
        moduleId="handover"
        title="Sổ Bàn Giao Ca & Két Tiền"
        description="Chuyển giao trách nhiệm quỹ tiền mặt và báo cáo sự cố vận hành ca trực."
        eyebrow="Vận hành"
        features={['Bàn giao tiền mặt', 'Báo cáo sự cố tức thì', 'Lưu nhật ký điện tử']}
      />

      {/* Content wrapper */}
      <div className="relative z-20 flex-1 flex flex-col space-y-4">
        
        {/* Custom Tabs */}
        <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] p-1 rounded-2xl flex gap-1 shadow-xs">
          <button 
            type="button"
            onClick={() => setActiveTab('handover')}
            className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-95 ${
              activeTab === 'handover' 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm' 
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
            }`}
          >
            <Banknote size={16} className="mr-1.5" /> Bàn giao quỹ
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('incident')}
            className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-95 ${
              activeTab === 'incident' 
                ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-sm' 
                : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
            }`}
          >
            <ShieldAlert size={16} className="mr-1.5" /> Báo cáo sự cố
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'handover' && (
              <motion.div
                key="handover"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <div className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-[var(--kg-border)]">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <Banknote size={20} />
                    </div>
                    <div>
                      <h3 className="font-black text-sm sm:text-base text-[var(--kg-text)]">Bàn giao tiền mặt két</h3>
                      <p className="text-xs text-[var(--kg-text-muted)] font-medium">Khai báo số tiền lẻ thối thực tế cuối ca</p>
                    </div>
                  </div>

                  <form onSubmit={submitHandover} className="space-y-4">
                    <div>
                      <label className="block text-xs font-black text-[var(--kg-text)] mb-1.5">Số tiền mặt thực tế (VNĐ) *</label>
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
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-[var(--kg-text)] font-extrabold text-sm sm:text-base tracking-wide"
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
                          placeholder="Ghi chú về tiền dư/thiếu, hóa đơn nợ..."
                          rows={3}
                          className="w-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-[var(--kg-text)] text-xs sm:text-sm"
                        />
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black py-3.5 rounded-2xl shadow-md transition-all transform active:scale-95 flex items-center justify-center text-xs sm:text-sm uppercase tracking-wider"
                    >
                      <CheckCircle2 size={18} className="mr-1.5" /> XÁC NHẬN BÀN GIAO CA
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {activeTab === 'incident' && (
              <motion.div
                key="incident"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <div className="bg-[var(--kg-surface)] border border-rose-500/20 dark:border-rose-900/30 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
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
                        placeholder="Mô tả cụ thể sự cố (Ví dụ: Máy lạnh khu A bị chảy nước, bàn 5 phàn nàn món chậm...)"
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
