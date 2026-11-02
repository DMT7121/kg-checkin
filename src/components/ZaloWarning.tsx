import { ExternalLink } from 'lucide-react';

/** Warns users opening in Zalo/Facebook in-app browsers */
export default function ZaloWarning() {
  return (
    <div className="fixed inset-0 z-[99999] bg-[#062b49] text-white flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-6">
        <ExternalLink className="text-[#ff6b57]" size={32} strokeWidth={1.75} />
      </div>
      <h2 className="text-2xl font-bold mb-3 text-center tracking-tight">Mở Bằng Trình Duyệt Hệ Thống</h2>
      <p className="text-center text-sm leading-relaxed text-slate-200 mb-6 max-w-sm">
        Trình duyệt nhúng của Zalo/Messenger đang giới hạn định vị GPS và Camera.
        <br /><br />
        Vui lòng nhấn biểu tượng <b className="text-white text-lg mx-1">...</b> ở góc phải phía trên màn hình và chọn:
      </p>
      <span className="bg-white text-[#062b49] px-5 py-3 rounded-xl font-semibold text-sm shadow-lg inline-flex items-center gap-2">
        <ExternalLink size={16} strokeWidth={1.75} />
        Mở bằng trình duyệt
      </span>
    </div>
  );
}
