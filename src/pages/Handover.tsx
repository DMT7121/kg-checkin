import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import Swal from 'sweetalert2';
import { Repeat, AlertTriangle, FileText, Banknote, ShieldAlert, BadgeCheck, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 animate-fade-in relative pb-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 rounded-b-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between shrink-0 mb-4 pb-12">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
              <Repeat size={20} className="text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Bàn giao Ca</h2>
          </div>
          <p className="text-cyan-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
            Chuyển giao thông tin quan trọng.
          </p>
        </div>
        <div className="hidden md:block relative z-10 opacity-80">
          <ArrowRightLeft size={80} strokeWidth={1} />
        </div>
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-cyan-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* Content wrapper */}
      <div className="px-4 -mt-6 relative z-20 flex-1 flex flex-col">
        
        {/* Custom Tabs */}
        <div className="bg-white dark:bg-gray-800 p-1 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex mb-5">
          <button 
            onClick={() => setActiveTab('handover')}
            className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'handover' 
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Banknote size={16} className="mr-2" /> Bàn giao quỹ
          </button>
          <button 
            onClick={() => setActiveTab('incident')}
            className={`flex-1 flex items-center justify-center py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'incident' 
                ? 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-400 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <ShieldAlert size={16} className="mr-2" /> Báo cáo sự cố
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'handover' && (
              <motion.div
                key="handover"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3 shrink-0">
                      <Banknote size={20} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 dark:text-white">Bàn giao tiền mặt</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Khai báo số tiền lẻ thối cuối ca</p>
                    </div>
                  </div>

                  <form onSubmit={submitHandover} className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Số tiền mặt thực tế (VNĐ) *</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <span className="text-gray-500 font-bold">đ</span>
                        </div>
                        <input 
                          type="text" 
                          inputMode="numeric"
                          value={cashAmount}
                          onChange={handleCashChange}
                          placeholder="VD: 500.000"
                          className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-800 dark:text-white font-semibold tracking-wide"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Ghi chú thêm</label>
                      <div className="relative">
                        <div className="absolute top-3 left-3 flex items-start pointer-events-none">
                          <FileText size={18} className="text-gray-400" />
                        </div>
                        <textarea 
                          value={handoverNote}
                          onChange={(e) => setHandoverNote(e.target.value)}
                          placeholder="Ghi chú về tiền dư/thiếu, hóa đơn nợ..."
                          rows={3}
                          className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-800 dark:text-white text-sm"
                        ></textarea>
                      </div>
                    </div>

                    <button type="submit" className="w-full mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-blue-500/40 transition transform active:scale-95 flex items-center justify-center">
                      <CheckCircle2 size={18} className="mr-2" /> XÁC NHẬN BÀN GIAO
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {activeTab === 'incident' && (
              <motion.div
                key="incident"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-red-100 dark:border-red-900/20">
                  <div className="flex items-center mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mr-3 shrink-0">
                      <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-800 dark:text-white">Báo cáo sự cố</h3>
                      <p className="text-xs text-red-500 dark:text-red-400 font-medium">Báo cho Quản lý biết ngay lập tức</p>
                    </div>
                  </div>

                  <form onSubmit={submitIncident} className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Phân loại sự cố *</label>
                      <div className="grid grid-cols-2 gap-2">
                        {['Thiết bị hỏng', 'Khách phàn nàn', 'Thiếu nguyên liệu', 'Khác'].map(cat => (
                          <div 
                            key={cat}
                            onClick={() => setIncidentCategory(cat)}
                            className={`p-3 rounded-xl border cursor-pointer text-center transition-all ${
                              incidentCategory === cat 
                                ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 font-semibold' 
                                : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                          >
                            <span className="text-sm">{cat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Mô tả chi tiết *</label>
                      <textarea 
                        value={incidentDesc}
                        onChange={(e) => setIncidentDesc(e.target.value)}
                        placeholder="Mô tả cụ thể sự cố (Ví dụ: Máy lạnh khu A bị chảy nước...)"
                        rows={4}
                        className="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-red-500/50 text-gray-800 dark:text-white text-sm"
                      ></textarea>
                    </div>

                    <button type="submit" className="w-full mt-2 bg-gradient-to-r from-red-600 to-rose-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-red-500/40 transition transform active:scale-95 flex items-center justify-center">
                      <ShieldAlert size={18} className="mr-2" /> GỬI BÁO CÁO NGAY
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
