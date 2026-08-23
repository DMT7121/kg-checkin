import React, { useState } from 'react';
import {
  Sparkles,
  Camera,
  Calendar,
  ClipboardCheck,
  Repeat,
  Banknote,
  Award,
  BookOpen,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X,
  MapPin,
  Clock,
  ShieldCheck,
  Check,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import type { TabId } from '../types/navigation';

interface NewbieGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab?: (tab: TabId) => void;
}

type GuideTabKey = 'start' | 'checkin' | 'schedule' | 'checklist' | 'payroll' | 'criteria';

export default function NewbieGuideModal({ isOpen, onClose, onNavigateTab }: NewbieGuideModalProps) {
  const store = useAppStore();
  const { currentUser } = store;
  const [activeTab, setActiveTab] = useState<GuideTabKey>('start');
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!isOpen) return null;

  const handleFinish = () => {
    if (currentUser?.username) {
      localStorage.setItem(`kg_onboarding_completed_${currentUser.username}`, 'true');
    }
    if (dontShowAgain && currentUser?.username) {
      localStorage.setItem(`kg_onboarding_never_${currentUser.username}`, 'true');
    }
    onClose();
  };

  const handleNavigate = (tab: TabId) => {
    handleFinish();
    if (onNavigateTab) {
      onNavigateTab(tab);
    } else {
      store.setCurrentTab(tab);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const tabs: { key: GuideTabKey; label: string; icon: React.ComponentType<any>; badge?: string }[] = [
    { key: 'start', label: 'Khởi đầu nhanh', icon: Sparkles, badge: '5 bước' },
    { key: 'checkin', label: 'Chấm công Face ID', icon: Camera },
    { key: 'schedule', label: 'Đăng ký lịch làm', icon: Calendar },
    { key: 'checklist', label: 'Checklist & Bàn giao', icon: ClipboardCheck },
    { key: 'payroll', label: 'Lương & Điểm thưởng', icon: Banknote },
    { key: 'criteria', label: 'Bảng tiêu chuẩn ĐẠT', icon: CheckCircle2, badge: 'Quan trọng' },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 md:p-6 animate-fade-in">
      {/* Dark Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        onClick={handleFinish} 
      />

      {/* Main Modal Card */}
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-[var(--kg-surface)] text-[var(--kg-text)] rounded-3xl shadow-2xl border border-[var(--kg-border)] flex flex-col overflow-hidden z-10 animate-scale-in">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--kg-border)] bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-violet-600/10 dark:from-blue-900/20 dark:to-indigo-900/20 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md flex-shrink-0">
              <BookOpen size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-[var(--kg-text)]">
                  Cẩm Nang Nhập Môn Nhân Sự Mới
                </h2>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500 text-white shadow-xs">
                  King's Grill OS
                </span>
              </div>
              <p className="text-xs text-[var(--kg-text-muted)] font-semibold mt-0.5">
                Hướng dẫn chuẩn hóa quy trình vận hành & các mốc tiêu chuẩn thành công
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFinish}
            className="w-8 h-8 rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition-colors active:scale-95"
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation Row */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)]/60 overflow-x-auto hide-scrollbar flex-shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                type="button"
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface)] hover:text-[var(--kg-text)] border border-transparent'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-bold uppercase ${
                    isActive ? 'bg-white/25 text-white' : 'bg-blue-500/10 text-blue-600 dark:text-indigo-400'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          
          {/* TAB 1: 5 BƯỚC KHỞI ĐẦU NHANH */}
          {activeTab === 'start' && (
            <div className="space-y-6 animate-fade-in">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-200/50 dark:border-indigo-900/30 flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 font-black shadow-sm">
                  ✨
                </div>
                <div>
                  <h3 className="text-sm font-black text-[var(--kg-text)]">
                    Chào mừng bạn gia nhập đội ngũ King's Grill!
                  </h3>
                  <p className="text-xs text-[var(--kg-text-muted)] mt-1 leading-relaxed font-medium">
                    Hệ thống King's Grill Staff OS được thiết kế để tự động hóa toàn diện quy trình làm việc. Dưới đây là <b>5 đầu việc cốt lõi</b> bạn cần thực hiện mỗi ca trực:
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {[
                  {
                    step: '1',
                    title: 'Đến nhà hàng & Chấm công Vào Ca',
                    desc: 'Đứng trong bán kính nhà hàng (<100m), mở tab Chấm công, quét Face ID & GPS.',
                    target: 'checkin' as TabId,
                    btnText: 'Xem Chấm công',
                    icon: Camera,
                    color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30'
                  },
                  {
                    step: '2',
                    title: 'Xem việc cần làm & Checklist ca',
                    desc: 'Mở trang Hôm nay và Vận hành để nhận các nhiệm vụ phân khu (phục vụ/bar/bếp/thu ngân).',
                    target: 'work' as TabId,
                    btnText: 'Xem Checklist',
                    icon: ClipboardCheck,
                    color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30'
                  },
                  {
                    step: '3',
                    title: 'Bàn giao ca & Ghi nhận sự cố',
                    desc: 'Thu ngân/Tổ trưởng kiểm đếm tiền két mặt và ghi chú tình hình cho ca tiếp quản.',
                    target: 'work' as TabId,
                    btnText: 'Xem Bàn giao',
                    icon: Repeat,
                    color: 'text-violet-600 bg-violet-50 dark:bg-violet-950/30'
                  },
                  {
                    step: '4',
                    title: 'Chấm công Ra Ca khi hết giờ',
                    desc: 'Bấm "Ra Ca" để hệ thống chốt số giờ làm việc thực tế và quy đổi công lương.',
                    target: 'checkin' as TabId,
                    btnText: 'Chấm công',
                    icon: Clock,
                    color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'
                  },
                  {
                    step: '5',
                    title: 'Đăng ký lịch làm việc tuần mới',
                    desc: 'Chủ động chọn ca Sáng/Tối/OFF cho tuần tới trước 23:59 Chủ Nhật hàng tuần.',
                    target: 'workforce' as TabId,
                    btnText: 'Đăng ký Lịch',
                    icon: Calendar,
                    color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30'
                  },
                  {
                    step: '★',
                    title: 'Học SOP & Tích luỹ King Coins',
                    desc: 'Học quy trình món, tiêu chuẩn phục vụ và nhận thưởng King Coins khi hoàn thành tốt.',
                    target: 'knowledge' as TabId,
                    btnText: 'Học SOP',
                    icon: Award,
                    color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30'
                  },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex flex-col justify-between space-y-3 hover:border-blue-500/40 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-xs ${item.color}`}>
                        {item.step}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-[var(--kg-text)] leading-tight">{item.title}</h4>
                        <p className="text-[11px] text-[var(--kg-text-muted)] mt-1 leading-relaxed font-medium">{item.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => handleNavigate(item.target)}
                        className="inline-flex items-center gap-1 text-xs font-black text-blue-600 dark:text-indigo-400 hover:underline active:scale-95"
                      >
                        {item.btnText} <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: CHẤM CÔNG FACE ID & GPS */}
          {activeTab === 'checkin' && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-[var(--kg-border)] pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-blue-600 dark:text-indigo-400 flex items-center gap-2">
                  <Camera size={16} /> Quy trình Chấm công Face ID & Định vị GPS
                </h3>
                <p className="text-xs text-[var(--kg-text-muted)] mt-1 font-medium">
                  Chấm công thông minh sử dụng camera đối chiếu khuôn mặt và toạ độ định vị GPS để xác thực bạn có mặt trực tiếp tại nhà hàng.
                </p>
              </div>

              {/* Steps container */}
              <div className="space-y-3">
                {[
                  {
                    num: '1',
                    title: 'Cấp quyền Trình duyệt (Camera & Vị trí)',
                    desc: 'Khi mở trang, nhấn "Cho phép" (Allow) nếu trình duyệt hỏi quyền truy cập Vị trí (GPS) và Máy ảnh (Camera).'
                  },
                  {
                    num: '2',
                    title: 'Đứng trong phạm vi nhà hàng (< 100m)',
                    desc: 'Hệ thống tự động đo khoảng cách từ toạ độ hiện tại của bạn đến tâm nhà hàng. Khoảng cách phải hiển thị màu xanh lá (Hợp lệ).'
                  },
                  {
                    num: '3',
                    title: 'Bấm "Chấm công Vào ca" hoặc "Ra ca"',
                    desc: 'Chọn thao tác tương ứng với ca trực hiện tại. Camera sẽ tự động kích hoạt.'
                  },
                  {
                    num: '4',
                    title: 'Đưa khuôn mặt vào chính giữa khung hình',
                    desc: 'Bỏ kính râm hoặc khẩu trang, đứng ở nơi đủ ánh sáng và nhấn nút chụp. AI sẽ tự động so khớp khuôn mặt.'
                  }
                ].map((s, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3.5 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)]">
                    <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs flex-shrink-0 shadow-xs">
                      {s.num}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-[var(--kg-text)]">{s.title}</h4>
                      <p className="text-[11px] text-[var(--kg-text-muted)] font-medium mt-0.5 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Goal / Success Box */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-300/40 dark:border-emerald-900/30 space-y-2">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={16} className="flex-shrink-0" />
                  <h4 className="text-xs font-black uppercase tracking-wider">Mục tiêu: Thế nào là Chấm công THÀNH CÔNG?</h4>
                </div>
                <ul className="text-xs text-[var(--kg-text)] font-medium space-y-1.5 pl-6 list-disc">
                  <li>Màn hình hiện thông báo xanh <b>"Chấm công thành công! Hợp lệ"</b> kèm lời chào âm thanh của hệ thống.</li>
                  <li>Trạng thái trên trang Hôm nay chuyển sang huy hiệu xanh <b>"Đã vào ca"</b> (hoặc <b>"Đã ra ca"</b>).</li>
                  <li>Trong mục <b>Lịch sử chấm công</b> xuất hiện bản ghi mới có nhãn <b>✓ Hợp lệ</b> kèm thời gian IN/OUT chuẩn xác.</li>
                </ul>
              </div>

              {/* Troubleshooting Alert */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-300/40 dark:border-amber-900/30 flex items-start gap-2.5">
                <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs font-medium text-[var(--kg-text)] leading-relaxed">
                  <b>Mẹo xử lý khi bị báo Ngoài toạ độ / Sai vị trí GPS:</b> Hãy mở ứng dụng <i>Google Maps</i> trên điện thoại, bấm vào biểu tượng định vị để máy cập nhật GPS chính xác, sau đó quay lại webapp tải lại trang (Reload).
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleNavigate('checkin')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md hover:bg-blue-700 active:scale-95 transition-all"
                >
                  <Camera size={14} /> Thử Chấm Công Ngay
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: ĐĂNG KÝ LỊCH & ĐỔI CA */}
          {activeTab === 'schedule' && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-[var(--kg-border)] pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-blue-600 dark:text-indigo-400 flex items-center gap-2">
                  <Calendar size={16} /> Đăng Ký Lịch Làm Việc & Quy Trình Đổi Ca
                </h3>
                <p className="text-xs text-[var(--kg-text-muted)] mt-1 font-medium">
                  Chủ động lựa chọn ca làm việc mong muốn cho tuần tiếp theo và xử lý đổi ca linh hoạt khi có việc đột xuất.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Schedule Reg */}
                <div className="p-4 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-3">
                  <h4 className="text-xs font-black text-[var(--kg-text)] flex items-center gap-1.5">
                    <Calendar size={15} className="text-blue-500" /> 1. Đăng ký ca tuần mới
                  </h4>
                  <ol className="text-xs text-[var(--kg-text-muted)] space-y-2 pl-4 list-decimal font-medium leading-relaxed">
                    <li>Vào tab <b>Lịch Làm Việc</b> &rarr; Chọn xem biểu mẫu tuần tới.</li>
                    <li>Bấm chọn <b>Ca Sáng</b>, <b>Ca Tối</b> hoặc <b>OFF (Nghỉ)</b> cho từng ngày từ T2 đến CN.</li>
                    <li>Nếu chọn OFF, bắt buộc nhập <b>Lý do nghỉ</b> vào ô ghi chú.</li>
                    <li>Bấm <b>"Đăng ký lịch làm"</b> để gửi lên Quản lý duyệt.</li>
                  </ol>
                  <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    ⏱️ Hạn chót: Trước 23:59 Chủ Nhật hàng tuần.
                  </p>
                </div>

                {/* Swap Shift */}
                <div className="p-4 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-3">
                  <h4 className="text-xs font-black text-[var(--kg-text)] flex items-center gap-1.5">
                    <Repeat size={15} className="text-violet-500" /> 2. Đổi ca hoặc Xin nghỉ đột xuất
                  </h4>
                  <ol className="text-xs text-[var(--kg-text-muted)] space-y-2 pl-4 list-decimal font-medium leading-relaxed">
                    <li>Vào mục <b>Đổi ca</b> &rarr; Bấm <b>"Tạo yêu cầu mới"</b>.</li>
                    <li>Chọn Ngày làm việc và Ca muốn đổi.</li>
                    <li>Chọn hình thức: <i>"Đổi ca với đồng nghiệp"</i> hoặc <i>"Xin nghỉ phép (gửi Quản lý)"</i>.</li>
                    <li>Nhập lý do rõ ràng và bấm <b>"Gửi yêu cầu"</b>.</li>
                  </ol>
                  <p className="text-[11px] font-bold text-blue-600 dark:text-indigo-400">
                    🔄 Quy trình: Đồng nghiệp đồng ý &rarr; Quản lý duyệt &rarr; Lịch tự cập nhật.
                  </p>
                </div>
              </div>

              {/* Goal / Success Box */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-300/40 dark:border-emerald-900/30 space-y-2">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={16} className="flex-shrink-0" />
                  <h4 className="text-xs font-black uppercase tracking-wider">Mục tiêu: Thế nào là ĐÃ GỬI & ĐẠT LỊCH?</h4>
                </div>
                <ul className="text-xs text-[var(--kg-text)] font-medium space-y-1.5 pl-6 list-disc">
                  <li>Sau khi bấm nộp, hệ thống hiện thông báo <b>"Đã đăng ký lịch làm việc thành công"</b>.</li>
                  <li>Thẻ việc cần làm trên Dashboard đổi sang trạng thái huy hiệu xanh <b>"Đã đăng ký"</b>.</li>
                  <li>Khi Quản lý bấm "Công bố lịch", lịch của bạn sẽ hiển thị ca làm việc chính thức tại trang Hôm nay.</li>
                </ul>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleNavigate('workforce')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md hover:bg-blue-700 active:scale-95 transition-all"
                >
                  <Calendar size={14} /> Mở Phân Hệ Lịch Làm
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: CHECKLIST & BÀN GIAO */}
          {activeTab === 'checklist' && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-[var(--kg-border)] pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-blue-600 dark:text-indigo-400 flex items-center gap-2">
                  <ClipboardCheck size={16} /> Checklist Vận Hành & Sổ Bàn Giao Ca
                </h3>
                <p className="text-xs text-[var(--kg-text-muted)] mt-1 font-medium">
                  Đảm bảo chất lượng phục vụ 5 sao và bảo toàn doanh thu, tài sản nhà hàng qua từng ca làm việc.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-3">
                  <h4 className="text-xs font-black text-[var(--kg-text)] flex items-center gap-1.5">
                    <ClipboardCheck size={15} className="text-emerald-500" /> 1. Checklist công việc theo vị trí
                  </h4>
                  <div className="text-xs text-[var(--kg-text-muted)] space-y-2 font-medium leading-relaxed">
                    <p>Mỗi vị trí (Phục vụ, Thu ngân, Bếp, Bar) có danh sách các đầu mục chuẩn bị <b>Đầu ca</b>, kiểm soát <b>Giữa ca</b> và dọn dẹp vệ sinh <b>Cuối ca</b>:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Truy cập mục <b>Checklist việc</b> trong phân hệ Vận hành.</li>
                      <li>Thực hiện công việc ngoài thực tế, sau đó tích chọn hoàn thành trên ứng dụng.</li>
                      <li>Chụp ảnh minh chứng thực tế (nếu đầu mục có biểu tượng máy ảnh yêu cầu).</li>
                      <li>Bấm <b>"Nộp checklist"</b> để hoàn tất báo cáo ca trực.</li>
                    </ul>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-3">
                  <h4 className="text-xs font-black text-[var(--kg-text)] flex items-center gap-1.5">
                    <Repeat size={15} className="text-amber-500" /> 2. Sổ bàn giao ca & Két tiền mặt (Thu ngân / Tổ trưởng)
                  </h4>
                  <div className="text-xs text-[var(--kg-text-muted)] space-y-2 font-medium leading-relaxed">
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Nhập số tiền két ban đầu và tổng số tiền mặt thực tế kiểm đếm cuối ca.</li>
                      <li>Ghi nhận rõ ràng chênh lệch tiền mặt (nếu có) kèm lý do giải trình.</li>
                      <li>Ghi chú các sự cố phát sinh (hỏng hóc, phàn nàn của khách) và các việc cần ca sau lưu ý.</li>
                      <li>Bấm <b>"Gửi bàn giao ca"</b> để lưu sổ điện tử.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Goal / Success Box */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-300/40 dark:border-emerald-900/30 space-y-2">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={16} className="flex-shrink-0" />
                  <h4 className="text-xs font-black uppercase tracking-wider">Mục tiêu: Thế nào là Checklist & Bàn giao ĐẠT?</h4>
                </div>
                <ul className="text-xs text-[var(--kg-text)] font-medium space-y-1.5 pl-6 list-disc">
                  <li>Thanh tiến độ checklist đạt <b>100%</b> các hạng mục bắt buộc.</li>
                  <li>Hệ thống báo <b>"Đã nộp checklist thành công"</b>, thẻ trên Dashboard đổi thành huy hiệu xanh <b>"Đã nộp"</b>.</li>
                  <li>Bạn được cộng điểm thi đua <b>King Coins</b> tự động vào tài khoản cá nhân.</li>
                  <li>Sổ bàn giao hiển thị trạng thái <b>"Đã ghi nhận"</b>.</li>
                </ul>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleNavigate('work')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md hover:bg-blue-700 active:scale-95 transition-all"
                >
                  <ClipboardCheck size={14} /> Mở Phân Hệ Vận Hành
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: LƯƠNG & KING COINS */}
          {activeTab === 'payroll' && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-[var(--kg-border)] pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-blue-600 dark:text-indigo-400 flex items-center gap-2">
                  <Banknote size={16} /> Phiếu Lương, Tạm Ứng & Điểm Thưởng King Coins
                </h3>
                <p className="text-xs text-[var(--kg-text-muted)] mt-1 font-medium">
                  Minh bạch 100% thu nhập, theo dõi giờ công thực tế và tích lũy điểm thi đua để đổi quà.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-3">
                  <h4 className="text-xs font-black text-[var(--kg-text)] flex items-center gap-1.5">
                    <Banknote size={15} className="text-emerald-500" /> Tra cứu Lương & Ứng Lương
                  </h4>
                  <ul className="text-xs text-[var(--kg-text-muted)] space-y-2 font-medium leading-relaxed list-disc pl-4">
                    <li><b>Phiếu lương:</b> Xem tổng số giờ làm việc thực tế quy đổi từ các ca chấm công hợp lệ, lương cơ bản theo giờ, phụ cấp ăn ca và các khoản cộng/trừ.</li>
                    <li><b>Ứng lương tạm thời:</b> Xem hạn mức ứng được phép (tính theo số công đã làm) &rarr; Nhập số tiền muốn ứng &rarr; Gửi Admin duyệt chi.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-3">
                  <h4 className="text-xs font-black text-[var(--kg-text)] flex items-center gap-1.5">
                    <Award size={15} className="text-yellow-500" /> Điểm thưởng King Coins
                  </h4>
                  <ul className="text-xs text-[var(--kg-text-muted)] space-y-2 font-medium leading-relaxed list-disc pl-4">
                    <li><b>King Coins:</b> Đơn vị khen thưởng nội bộ vinh danh sự nỗ lực và trách nhiệm của bạn.</li>
                    <li><b>Cơ chế cộng điểm:</b> Chấm công đúng giờ, hoàn thành xuất sắc checklist, tăng ca đột xuất, nhận khen ngợi từ khách hàng.</li>
                    <li>Điểm King Coins được dùng để đổi các phần thưởng giá trị cuối tháng.</li>
                  </ul>
                </div>
              </div>

              {/* Goal / Success Box */}
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-300/40 dark:border-emerald-900/30 space-y-2">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={16} className="flex-shrink-0" />
                  <h4 className="text-xs font-black uppercase tracking-wider">Mục tiêu: Đảm bảo quyền lợi thu nhập</h4>
                </div>
                <ul className="text-xs text-[var(--kg-text)] font-medium space-y-1.5 pl-6 list-disc">
                  <li>Kiểm tra bảng công sau mỗi ca làm việc để đảm bảo giờ công đã được ghi nhận đầy đủ.</li>
                  <li>Nếu có sai lệch công làm, hãy liên hệ ngay với Quản lý hoặc gửi ý kiến qua mục <b>Góp ý</b> để được điều chỉnh kịp thời.</li>
                </ul>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleNavigate('attendance')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md hover:bg-blue-700 active:scale-95 transition-all"
                >
                  <Banknote size={14} /> Mở Phân Hệ Công & Lương
                </button>
              </div>
            </div>
          )}

          {/* TAB 6: BẢNG TIÊU CHUẨN ĐẠT / THÀNH CÔNG */}
          {activeTab === 'criteria' && (
            <div className="space-y-5 animate-fade-in">
              <div className="border-b border-[var(--kg-border)] pb-3">
                <h3 className="text-sm font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 size={16} /> Bảng Tra Cứu Tiêu Chuẩn "Thành Công / Đạt" Toàn Diện
                </h3>
                <p className="text-xs text-[var(--kg-text-muted)] mt-1 font-medium">
                  Tra cứu nhanh các dấu hiệu nhận biết hệ thống đã ghi nhận thao tác của bạn thành công 100%.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  {
                    action: 'Chấm công Vào ca / Ra ca',
                    success: 'Hiện thông báo xanh "Chấm công thành công! Hợp lệ", AI phát âm thanh chào mừng, Dashboard hiện "Đã vào ca", Lịch sử có log có nhãn ✓ Hợp lệ.',
                    failed: 'Hiện thông báo đỏ "Ngoài toạ độ GPS" hoặc "Không nhận diện được khuôn mặt". Cần mở Google Maps định vị lại hoặc lau camera.'
                  },
                  {
                    action: 'Đăng ký lịch làm tuần mới',
                    success: 'Bấm nộp trước 23:59 CN, hệ thống báo "Đã gửi đăng ký", Dashboard chuyển sang thẻ "Đã đăng ký", lịch hiển thị các ca đã chọn chờ Admin duyệt.',
                    failed: 'Chưa bấm nút "Đăng ký lịch làm" hoặc thiếu lý do cho ngày đăng ký OFF.'
                  },
                  {
                    action: 'Checklist công việc ca trực',
                    success: 'Tích đủ 100% việc bắt buộc, đính kèm ảnh (nếu có yêu cầu), Dashboard chuyển sang "Đã nộp", nhận điểm King Coins.',
                    failed: 'Bỏ sót đầu mục bắt buộc hoặc chưa bấm "Nộp checklist".'
                  },
                  {
                    action: 'Sổ bàn giao ca & Két tiền',
                    success: 'Điền đủ số tiền két thực tế, giải trình chênh lệch, lưu sổ thành công, Dashboard hiện "Đã ghi nhận".',
                    failed: 'Chưa bấm "Gửi bàn giao ca" hoặc bỏ trống số tiền kiểm đếm.'
                  },
                  {
                    action: 'Yêu cầu Đổi ca / Xin nghỉ',
                    success: 'Trạng thái chuyển sang "Đã duyệt" sau khi đồng nghiệp và Admin đồng ý, lịch làm tự động chuyển giao.',
                    failed: 'Đang ở trạng thái "Chờ đồng nghiệp duyệt" hoặc "Bị từ chối" (có ghi chú lý do).'
                  },
                  {
                    action: 'Học tập SOP nghiệp vụ',
                    success: 'Đọc kỹ tài liệu và bấm "Đã hiểu & Hoàn thành", tiến trình tự học tăng % và bài viết có nhãn "✓ Đã học".',
                    failed: 'Chưa bấm nút xác nhận hoàn thành ở cuối tài liệu.'
                  }
                ].map((item, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] space-y-2.5">
                    <h4 className="text-xs font-black text-[var(--kg-text)] flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-lg bg-blue-500/15 text-blue-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-black">{idx + 1}</span>
                      {item.action}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-300/30 dark:border-emerald-900/30">
                        <span className="font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-1">
                          <Check size={13} /> Như thế nào là THÀNH CÔNG / ĐẠT:
                        </span>
                        <p className="text-[11px] text-[var(--kg-text)] font-medium leading-relaxed">{item.success}</p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-300/30 dark:border-rose-900/30">
                        <span className="font-black text-rose-600 dark:text-rose-400 flex items-center gap-1 mb-1">
                          <X size={13} /> Dấu hiệu CHƯA ĐẠT / LỖI:
                        </span>
                        <p className="text-[11px] text-[var(--kg-text)] font-medium leading-relaxed">{item.failed}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex-shrink-0">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[var(--kg-text-muted)] select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-[var(--kg-border)]"
            />
            <span>Đã hiểu, không tự động hiển thị lại lần sau</span>
          </label>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {activeTab !== 'criteria' ? (
              <button
                type="button"
                onClick={() => {
                  const currentIndex = tabs.findIndex(t => t.key === activeTab);
                  if (currentIndex < tabs.length - 1) {
                    setActiveTab(tabs[currentIndex + 1].key);
                  }
                }}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--kg-surface)] hover:bg-[var(--kg-border)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-text)] active:scale-95 transition-all shadow-xs"
              >
                Bước tiếp theo <ArrowRight size={14} />
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleFinish}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-black shadow-md hover:from-blue-700 hover:to-indigo-700 active:scale-95 transition-all"
            >
              <CheckCircle2 size={15} /> Tôi Đã Hiểu & Bắt Đầu Làm Việc
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
