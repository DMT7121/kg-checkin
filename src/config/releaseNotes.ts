export const APP_VERSION = '4.0.0';
export const APP_VERSION_TAG = 'v4.0.0';
export const APP_CODENAME = 'Warm Hospitality Super-App';
export const APP_RELEASE_DATE = '02/11/2026';
export const SEEN_VERSION_STORAGE_KEY = 'kg_seen_release_v4_0_0';

export type ReleaseChangeCategory = 'added' | 'redesigned' | 'updated';

export interface ReleaseChangeItem {
  id: string;
  category: ReleaseChangeCategory;
  badge: string;
  title: string;
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
  { label: 'Kiến trúc UI', value: '100% Mới', note: 'Warm Hospitality' },
  { label: 'Chuẩn Mobile', value: '360px+', note: '0% cắt chữ / rớt dòng' },
  { label: 'Phân hệ đồng bộ', value: '26+ Màn', note: '14 Hub nghiệp vụ' },
  { label: 'Tương phản', value: 'WCAG AA', note: 'Sáng & Tối tự động' },
] as const;

export const CURRENT_RELEASE_CHANGES: ReleaseChangeItem[] = [
  // 1. NÂNG CẤP THÊM MỚI (ADDED)
  {
    id: 'add-release-center',
    category: 'added',
    badge: 'Tính năng mới',
    title: 'Trung tâm Thông tin Phiên bản & Nhật ký Nâng cấp (v4.0.0)',
    description:
      'Tích hợp huy hiệu phiên bản trực tiếp tại Đăng nhập, Thanh đầu trang Mobile/Desktop, Trang chủ và Hồ sơ cá nhân. Cho phép tra cứu rõ từng hạng mục thêm mới, chỉnh sửa và lịch sử cập nhật qua từng đời phiên bản.',
    impact: 'Minh bạch 100% thay đổi hệ thống',
  },
  {
    id: 'add-assistive-ai',
    category: 'added',
    badge: 'Đột phá thao tác',
    title: 'Nút Trợ lý AI kiểu Home ảo thông minh (AssistiveTouch)',
    description:
      'Cho phép nhấn giữ để kéo thả nút AI đến bất kỳ vị trí thuận tay nào trên màn hình, tự động hút nam châm vào mép trái/phải và tự thu gọn ẩn vào cạnh màn hình sau 3 giây không chạm.',
    impact: 'Không bao giờ che khuất bảng lương & nút bấm',
  },
  {
    id: 'add-superapp-dock',
    category: 'added',
    badge: 'Điều hướng mới',
    title: 'Floating Pill Dock trên Di động & Slim Architectural Rail trên Máy tính',
    description:
      'Thay thanh tab phẳng truyền thống bằng thanh Dock nổi bo tròn chuẩn Super-App trên điện thoại, kết hợp cột điều hướng thu gọn 76px tông Midnight Navy sang trọng kèm ngăn kéo mở rộng nhanh trên Desktop.',
    impact: 'Thao tác 1 tay cực nhạy, mở rộng không gian hiển thị',
  },
  {
    id: 'add-quick-launcher',
    category: 'added',
    badge: 'Tăng tốc ca trực',
    title: 'Bảng Khởi chạy Nhanh (Super-App Quick Launcher) tại Trang chủ',
    description:
      'Bổ sung cụm ô truy cập 1 chạm cho các tác vụ tần suất cao nhất trong ca: Chấm công AI, Checklist, Sổ bàn giao, Lịch ca, Phiếu lương, Báo món hết và Sổ tay SOP.',
    impact: 'Giảm từ 3 lần chạm xuống còn 1 lần chạm',
  },

  // 2. ĐỔI MỚI GIAO DIỆN 100% & TỐI ƯU DI ĐỘNG (REDESIGNED)
  {
    id: 'ui-warm-hospitality',
    category: 'redesigned',
    badge: 'Đổi mới 100% UI',
    title: 'Ngôn ngữ thị giác Warm Hospitality (Alabaster × Grill Ember × Midnight Navy)',
    description:
      'Lột xác hoàn toàn khỏi nền trắng xám văn phòng cũ, chuyển sang nền đá ấm Alabaster (#F4F0E8), thẻ sứ Ivory (#FFFDF9), điểm nhấn Đỏ cam Lửa nướng (#C8432B) và Xanh Midnight (#0B253C) đậm bản sắc King’s Grill.',
    impact: 'Nhận diện thương hiệu F&B cao cấp, dịu mắt cả ngày',
  },
  {
    id: 'ui-mobile-fit-engine',
    category: 'redesigned',
    badge: 'Tối ưu Di động',
    title: 'Chuẩn hóa Mobile-First Fit (360px – 430px) & Triệt tiêu Double-Padding',
    description:
      'Gỡ bỏ hoàn toàn lớp đệm lồng kép giữa khung ngoài và 26+ trang con trên điện thoại, thu hồi +32px chiều rộng thực tế; rút gọn nhãn điều hướng đáy 1 dòng và chống cắt chữ (...) trên mọi thẻ KPI.',
    impact: 'Vừa khít mọi dòng iPhone & Android phổ thông',
  },
  {
    id: 'ui-login-atelier',
    category: 'redesigned',
    badge: 'Trải nghiệm đầu',
    title: 'Màn hình Đăng nhập Editorial Split Atelier mới',
    description:
      'Thiết kế lại hoàn toàn giao diện xác thực với thẻ thương hiệu giàu chiều sâu, chuyển đổi nhanh Sáng/Tối ngay góc trên và xem trước bản tin nâng cấp v4.0.0 trước khi vào ca.',
    impact: 'Gọn gàng trên 1 khung hình điện thoại không cần cuộn sâu',
  },
  {
    id: 'ui-capsule-hubs',
    category: 'redesigned',
    badge: 'Đồng bộ 14 Hub',
    title: 'Tiêu đề phân hệ tinh gọn & Thanh chuyển tab con dạng Capsule trượt mượt',
    description:
      'Thu gọn phần đầu trang để nhường chỗ cho dữ liệu chính ngay màn hình đầu tiên, kết hợp thanh chọn tab con cuộn ngang mượt bằng ngón cái trên màn hình hẹp.',
    impact: 'Hiển thị thêm ~160px dữ liệu thực tế ngay khi mở trang',
  },

  // 3. CHỈNH SỬA, CẬP NHẬT & TỐI ƯU KỸ THUẬT (UPDATED)
  {
    id: 'fix-tabular-currency',
    category: 'updated',
    badge: 'Chuẩn hóa số liệu',
    title: 'Đồng bộ font số học JetBrains Mono (tabular-nums) cho Tiền tệ & Giờ công',
    description:
      'Cập nhật định dạng căn phải thẳng hàng chữ số trên toàn bộ Phiếu lương, Bảng công, Tạm ứng, Thưởng/Phạt, Đối soát quỹ bàn giao ca và Thống kê quản trị.',
    impact: 'Đọc và đối soát tiền VNĐ nhanh, chống nhầm hàng số',
  },
  {
    id: 'fix-sop-offline-icons',
    category: 'updated',
    badge: 'Tối ưu tốc độ',
    title: 'Loại bỏ CDN Font Awesome ngoại tuyến trong Sổ tay Đào tạo SOP',
    description:
      'Chuyển đổi toàn bộ biểu tượng quy trình phục vụ/bếp sang bộ icon vector nội bộ thống nhất, kèm kiểm tra an toàn dữ liệu tiến độ bài học.',
    impact: 'Tải tức thì trên 4G yếu, không lỗi hiển thị icon',
  },
  {
    id: 'fix-sheet-drawers',
    category: 'updated',
    badge: 'Sửa luồng nhập',
    title: 'Thay thế hộp thoại nhập HTML thô bằng Ngăn kéo chuẩn (KgBottomSheet)',
    description:
      'Cập nhật các biểu mẫu cấu hình lương, sơ đồ tổ chức và xác nhận bù công sang ngăn kéo trượt thân thiện với bàn phím ảo trên điện thoại, vùng chạm tối thiểu 44×44px.',
    impact: 'Loại bỏ lỗi che bàn phím và bấm nhầm trên di động',
  },
  {
    id: 'fix-tablet-analytics',
    category: 'updated',
    badge: 'Sửa hiển thị',
    title: 'Tinh chỉnh bố cục Tablet (768×1024) & Biểu đồ cột Thống kê 14 ngày',
    description:
      'Cập nhật lưới KPI tự động dàn 2×2 thoáng đãng trên máy tính bảng dọc và sửa tỷ lệ quy đổi chiều cao cột chấm công/đi trễ trong trang Hệ thống & Báo cáo.',
    impact: 'Hiển thị trực quan, chính xác trên cả iPad tại quầy thu ngân',
  },
];

export const VERSION_HISTORY: VersionHistoryEntry[] = [
  {
    version: 'v4.0.0',
    date: '02/11/2026',
    codename: 'Warm Hospitality Super-App',
    isCurrent: true,
    highlights: [
      'Đổi mới 100% kiến trúc giao diện sang phong cách Warm Hospitality (Alabaster, Grill Ember & Midnight Navy).',
      'Tối ưu Mobile-First toàn diện: Floating Pill Dock đáy nổi, 0% rớt chữ/cắt chữ, thu hồi +32px chiều rộng hiển thị trên điện thoại.',
      'Thêm Nút AI AssistiveTouch kéo thả tự do & tự ẩn gọn vào mép màn hình như nút Home ảo.',
      'Ra mắt Trung tâm Thông tin Phiên bản & Nhật ký Nâng cấp trực tiếp trong ứng dụng.',
    ],
  },
  {
    version: 'v3.0.0',
    date: '10/2026',
    codename: 'Modular Hub Console',
    highlights: [
      'Tổ chức lại kiến trúc thành 14 Hub nghiệp vụ cho Nhân viên và Quản lý.',
      'Bổ sung thanh tìm kiếm lệnh nhanh Command Palette (Ctrl+K) và chuẩn hóa hệ thống Design Tokens.',
      'Nâng cấp phân hệ Quản lý lương tháng và đề nghị điều chỉnh mức lương.',
    ],
  },
  {
    version: 'v2.5.0',
    date: '08/2026',
    codename: 'Biometric & Resilient Sync',
    highlights: [
      'Tích hợp chấm công nhận diện khuôn mặt AI (face-api.js) kèm đóng dấu ảnh chụp thực tế.',
      'Bổ sung bộ lọc nhiễu vị trí GPS Kalman và cơ chế hàng đợi Offline tự đồng bộ khi có mạng.',
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

export function openReleaseNotesModal(initialFilter: 'all' | ReleaseChangeCategory | 'history' = 'all'): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('kg:open-release-notes', {
        detail: { filter: initialFilter },
      })
    );
  }
}
