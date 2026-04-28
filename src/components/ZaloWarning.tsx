import { ExternalLink } from 'lucide-react';

/** Warns users opening in Zalo/Facebook in-app browsers */
export default function ZaloWarning() {
  return (
    <div className="fixed inset-0 z-[99999] bg-ocean-900 text-white flex flex-col items-center justify-center p-6">
      <ExternalLink className="text-ocean-400 animate-bounce mb-8" size={64} />
      <h2 className="text-3xl font-bold mb-4 text-center">Mở Bằng Trình Duyệt</h2>
      <p className="text-center text-[1rem] leading-relaxed text-ocean-100 mb-8 max-w-[85vw]">
        Trình duyệt của Zalo/Messenger đang giới hạn định vị GPS và Camera.
        <br /><br />
        Vui lòng nhấn vào biểu tượng{' '}
        <b className="text-white text-2xl mx-1">...</b> ở góc phải phía trên
        màn hình và chọn:
        <br /><br />
        <span className="bg-white text-ocean-900 px-5 py-3 rounded-xl font-bold shadow-lg inline-block">
          Mở bằng trình duyệt
        </span>
      </p>
    </div>
  );
}
