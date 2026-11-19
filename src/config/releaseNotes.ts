export {
  APP_VERSION,
  APP_VERSION_TAG,
  APP_CODENAME,
  APP_RELEASE_DATE,
  SEEN_VERSION_STORAGE_KEY,
  openReleaseNotesModal,
  type ReleaseChangeCategory,
} from './appVersion';
import type { ReleaseChangeCategory } from './appVersion';

export interface ReleaseChangeItem {
  id: string;
  category: ReleaseChangeCategory;
  badge: string;
  title: string;
  summary: string;
  description: string;
  impact: string;
}

export interface VersionHistoryEntry {
  version: string;
  date: string;
  codename: string;
  isCurrent?: boolean;
  highlights: string[];
}

export const RELEASE_STATS = [
  { label: 'Kiến trúc IA', value: '14 → 11 Hub', note: '8 Nhân sự • 3 Quản trị' },
  { label: 'Tinh gọn gói', value: '-21.9 MB', note: '0 thư viện thừa • Siêu nhẹ 4G' },
  { label: 'Duyệt Admin', value: '1-Tap Inbox', note: 'Gom 6 hàng chờ quản lý' },
  { label: 'Đa thiết bị', value: 'Mobile–PC', note: 'Tablet Rail • Chuẩn 44px' },
] as const;

export const CURRENT_RELEASE_CHANGES: ReleaseChangeItem[] = [
  // 1. TÍNH NĂNG MỚI ĐỘT PHÁ (ADDED)
  {
    id: 'v5-admin-approval-inbox',
    category: 'added',
    badge: 'Mới ở v5.0',
    title: 'Hộp duyệt 1 chạm (Admin Approval Inbox) gom 6 hàng chờ quản lý',
    summary: 'Gom Bổ sung công, Đổi ca/Nghỉ, Đối soát két, Sự cố mở, Ứng lương và Đề nghị lương vào 1 màn hình.',
    description:
      'Quản lý xử lý mọi yêu cầu phát sinh ngay tại 1 trung tâm duy nhất kèm nút "Duyệt tất cả ca khớp" cho sổ quỹ bàn giao và thanh tiến trình xử lý hàng loạt trực tiếp.',
    impact: 'Giảm 70% số bước chuyển tab duyệt hồ sơ mỗi ngày',
  },
  {
    id: 'v5-unified-attendance-ledger',
    category: 'added',
    badge: 'Hợp nhất công',
    title: 'Sổ Công & Nhật ký hợp nhất (Unified Attendance Ledger)',
    summary: 'Gộp Bảng công (Timesheet) + Lịch sử chấm công (History) với 3 góc nhìn: Theo ngày, Lịch tháng, Nhật ký đủ 100%.',
    description:
      'Nhân viên tra cứu tổng giờ công, ca đêm 06:00–05:59, lịch tháng và chi tiết từng lượt vào/ra đa sheet trong cùng một phân hệ Công & Thu nhập mà không cần nhảy qua lại hai trang.',
    impact: 'Đối soát công tháng & từng lượt quẹt mặt chỉ trong 1 nơi',
  },
  {
    id: 'v5-first-class-incident-tracker',
    category: 'added',
    badge: 'Vận hành ca',
    title: 'Phân hệ Sự cố ca độc lập (Incident Tracker) 4 trạng thái',
    summary: 'Theo dõi sự cố riêng trong Vận hành ca: Mới mở → Đang xử lý → Đã khắc phục → Đã hạch toán chi phí.',
    description:
      'Tách quản lý sự cố ca thành tab chuyên biệt cho nhân viên và trung tâm xử lý riêng cho Quản lý, đồng bộ live strip cảnh báo Món hết & Sự cố mở ngay đầu phân hệ Vận hành.',
    impact: 'Không bỏ sót sự cố hỏng hóc, vỡ đồ hay phát sinh trong ca',
  },
  {
    id: 'v5-unified-settings-audit',
    category: 'added',
    badge: 'Quản trị hệ thống',
    title: 'Hợp nhất Cài đặt hệ thống & Tách Nhật ký Kiểm toán (Audit Log)',
    summary: 'Gom Doanh nghiệp, GPS, Edge D1, AI Keys (Master PIN) vào 1 màn; Nhật ký Audit có lọc ngày & xuất CSV an toàn.',
    description:
      'Chuẩn hóa trung tâm cài đặt gọn gàng theo nhóm chức năng và tách riêng phân hệ Nhật ký Kiểm toán chuyên biệt với ngăn kéo xem chi tiết bản ghi và chống công thức độc hại khi xuất CSV.',
    impact: 'Quản trị cấu hình minh bạch, truy vết thao tác tức thì',
  },

  // 2. ĐỔI MỚI KIẾN TRÚC GIAO DIỆN & ĐA THIẾT BỊ (REDESIGNED)
  {
    id: 'v5-11-hub-ia',
    category: 'redesigned',
    badge: '14 → 11 Hub',
    title: 'Tái cấu trúc 14 → 11 Phân hệ hợp nhất (8 Nhân sự + 3 Quản trị)',
    summary: 'Thu gọn điều hướng thừa, giữ 100% đường dẫn tương thích ngược (?tab=&sub= và TAB_ALIAS_MAP).',
    description:
      'Hợp nhất các màn hình rời rạc thành 11 Hub rõ ràng theo luồng công việc thực tế của nhà hàng, giảm độ sâu menu và giúp nhân viên mới làm quen trong dưới 1 phút.',
    impact: 'Điều hướng trực quan hơn 40%, không gãy bookmark hay thông báo cũ',
  },
  {
    id: 'v5-tablet-rail-mobile-header',
    category: 'redesigned',
    badge: 'Đa thiết bị',
    title: 'Tablet Compact Rail & Thanh đầu trang Di động 1 hàng gọn gàng',
    summary: 'Bổ sung cột điều hướng gọn cho iPad/Tablet, thu gọn Header điện thoại còn đúng 1 hàng với vùng chạm ≥ 44×44px.',
    description:
      'Chuẩn hóa breakpoint lg (1024px) cho bảng/thẻ nhân sự & quản trị, khóa chiều cao an toàn h-dvh, gắn duy nhất 1 Chuông thông báo đồng bộ và làm sạch thứ tự lớp phủ (z-index).',
    impact: 'Hiển thị sắc nét trên mọi màn hình từ điện thoại 360px, iPad đến Desktop',
  },
  {
    id: 'v5-kg-feedback-host',
    category: 'redesigned',
    badge: '0 Swal.fire',
    title: 'Hệ thống Phản hồi toàn cục KgFeedbackHost thay thế 100% SweetAlert2',
    summary: 'Toàn bộ thông báo, xác nhận và trạng thái tải dùng kgToast / kgConfirm / kgLoading chuẩn Design System.',
    description:
      'Loại bỏ hoàn toàn hộp thoại SweetAlert2 rời rạc và hiệu ứng nặng framer-motion, thay bằng lớp chuyển động CSS mượt ≤ 200ms đồng bộ Light/Dark WCAG AA và hỗ trợ đóng bằng phím Escape.',
    impact: 'Phản hồi tức thì, đồng bộ 100% giao diện & không giật trên máy tầm trung',
  },

  // 3. TỐI ƯU HIỆU NĂNG & KỸ THUẬT (UPDATED)
  {
    id: 'v5-deploy-slimming',
    category: 'updated',
    badge: '-21.9 MB Deploy',
    title: 'Tinh gọn -21.9 MB gói triển khai & Gỡ bỏ hoàn toàn thư viện nặng cũ',
    summary: 'Gỡ 0 Swal.fire, 0 framer-motion, 0 face-api.js, 0 canvas-confetti và dọn sạch tệp mô hình cũ dư thừa.',
    description:
      'Chuyển hoàn toàn chấm công sinh trắc học sang Face ID V2 thuần ONNX/MediaPipe nạp lười (lazy-loaded), tách cache vector zero-WASM và dọn sạch tài nguyên ảnh/model cũ trong gói deploy.',
    impact: 'Tải ứng dụng trên mạng 4G nhanh vượt trội, tiết kiệm dung lượng & pin thiết bị',
  },
  {
    id: 'v5-workforce-payroll-polish',
    category: 'updated',
    badge: 'Tối ưu nghiệp vụ',
    title: 'Tối ưu Ma trận lịch tháng, Hạn mức ứng lương & Tách mô-đun Quản trị',
    summary: 'Memo hóa ShiftMonthMatrix chống lag, đưa cài đặt hạn mức ứng lương vào Bảng giá lương tháng.',
    description:
      'Chia nhỏ các màn hình lớn (AdminOperations, HrList, Payroll, Dashboard) thành các mô-đun độc lập dễ bảo trì, đồng nhất hàm định dạng tiền tệ VNĐ và điều hướng sub-tab toàn hệ thống.',
    impact: 'Cuộn lịch tháng & danh sách nhân sự mượt mà, đối soát số liệu chính xác',
  },
  {
    id: 'v5-pwa-cache-refresh',
    category: 'updated',
    badge: 'PWA & An toàn',
    title: 'Làm mới bộ đệm PWA v5.0 & Giữ vững 100% cổng Edge D1 + Offline Vault',
    summary: 'Nâng cấp Service Worker cache v16 để tự nhận bản v5.0 ngay lập tức, bỏ qua hoàn toàn /api.',
    description:
      'Đảm bảo mọi thiết bị đã cài ứng dụng ra màn hình chính tự động dọn cache cũ và nhận mã nguồn v5.0 mới nhất trong khi vẫn bảo toàn tuyệt đối hàng đợi chấm công ngoại tuyến (Offline Vault).',
    impact: 'Cập nhật tức thì trên mọi thiết bị mà không mất dữ liệu chấm công',
  },
];

export const VERSION_HISTORY: VersionHistoryEntry[] = [
  {
    version: '5.0',
    date: '19/11/2026',
    codename: 'Unified Staff OS 5.0',
    isCurrent: true,
    highlights: [
      'Hợp nhất kiến trúc từ 14 → 11 Hub (8 Nhân sự + 3 Quản trị), giữ 100% tương thích đường dẫn cũ qua TAB_ALIAS_MAP và deep-link ?tab=&sub=.',
      'Ra mắt Hộp duyệt 1 chạm (Admin Approval Inbox) gom 6 hàng chờ quản lý, Sổ Công & Nhật ký hợp nhất (Timesheet + History) và phân hệ Sự cố ca độc lập (Incident Tracker).',
      'Nâng cấp đa thiết bị: Tablet Compact Rail, Header di động 1 hàng chuẩn 44×44px, Hệ thống phản hồi KgFeedbackHost (0 Swal.fire / 0 framer-motion / 0 face-api.js) và tinh gọn -21.9 MB gói triển khai.',
    ],
  },
  {
    version: 'v4.0.1',
    date: '02/11/2026',
    codename: 'Full History & Harmonized Release UI',
    isCurrent: false,
    highlights: [
      'Nâng cấp triệt để mục "Lịch sử" chấm công: tải đủ 100% lượt chấm không giới hạn 60 lượt/1.200 dòng, đồng bộ đa sheet (Chính, Bếp - Tạp vụ, Lưu trữ tháng), nhóm theo ngày và lọc nhanh theo tháng.',
      'Thiết kế lại Hộp thoại Thông tin Phiên bản đồng bộ 100% với KgDesignSystem (nền kem ấm Ivory/Alabaster, gọn gàng, dễ đọc nhanh trên di động).',
    ],
  },
  {
    version: 'v4.0.0',
    date: '02/11/2026',
    codename: 'Warm Hospitality Super-App',
    highlights: [
      'Đổi mới 100% kiến trúc giao diện sang phong cách Warm Hospitality (Alabaster, Grill Ember & Midnight Navy).',
      'Tối ưu Mobile-First toàn diện: Floating Pill Dock đáy nổi, Slim Rail 76px Desktop và Nút AI AssistiveTouch kiểu Home ảo.',
      'Chuẩn hóa font số học tabular-nums trên toàn bộ phân hệ Lương, Công & Quỹ bàn giao.',
    ],
  },
  {
    version: 'v3.0.0',
    date: '10/2026',
    codename: 'Modular Hub Console',
    highlights: [
      'Tổ chức kiến trúc 14 Hub nghiệp vụ cho Nhân viên và Quản lý.',
      'Bổ sung thanh tìm kiếm lệnh nhanh Command Palette (Ctrl+K) và hệ thống Design Tokens.',
      'Nâng cấp phân hệ Quản lý lương tháng và đề nghị điều chỉnh mức lương.',
    ],
  },
  {
    version: 'v2.5.0',
    date: '08/2026',
    codename: 'Biometric & Resilient Sync',
    highlights: [
      'Tích hợp chấm công nhận diện khuôn mặt AI kèm đóng dấu ảnh chụp thực tế.',
      'Bổ sung bộ lọc nhiễu vị trí GPS Kalman và hàng đợi Offline tự đồng bộ khi có mạng.',
      'Ra mắt Sổ tay Đào tạo SOP, hướng dẫn CUKCUK và tích điểm thi đua King Coins.',
    ],
  },
  {
    version: 'v1.0.0',
    date: '03/2026',
    codename: 'Foundation Release',
    highlights: [
      'Phiên bản nền tảng đầu tiên: Chấm công vào/ra ca, Đăng ký lịch làm tuần và Bảng tin nội bộ.',
    ],
  },
];
