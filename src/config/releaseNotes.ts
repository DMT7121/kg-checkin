export const APP_VERSION = '4.0.1';
export const APP_VERSION_TAG = 'v4.0.1';
export const APP_CODENAME = 'Warm Hospitality Super-App';
export const APP_RELEASE_DATE = '02/11/2026';
export const SEEN_VERSION_STORAGE_KEY = 'kg_seen_release_v4_0_1';

export type ReleaseChangeCategory = 'added' | 'redesigned' | 'updated';

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
  { label: 'Giao diện', value: '100% Mới', note: 'Warm Hospitality' },
  { label: 'Lịch sử công', value: '100% Đủ lượt', note: 'Đa sheet • Không sót' },
  { label: 'Chuẩn Mobile', value: '360px+', note: 'Khít mọi điện thoại' },
  { label: 'Phân hệ', value: '26+ Màn', note: 'Đồng bộ Sáng & Tối' },
] as const;

export const CURRENT_RELEASE_CHANGES: ReleaseChangeItem[] = [
  // 1. CẬP NHẬT & SỬA LỖI TRIỆT ĐỂ MỚI NHẤT (v4.0.1)
  {
    id: 'fix-full-checkin-history',
    category: 'updated',
    badge: 'Mới nhất v4.0.1',
    title: 'Tải đầy đủ 100% lượt chấm công trong mục "Lịch sử" (không giới hạn số lượt)',
    summary: 'Gỡ bỏ giới hạn 60 lượt/1.200 dòng cũ, đồng bộ đa sheet & chuẩn hóa dấu tiếng Việt.',
    description:
      'Quét trọn vẹn toàn bộ sổ chấm công chính, sổ Bếp - Tạp vụ và các sheet lưu trữ theo tháng kết hợp bộ đệm Edge D1; nhóm theo từng ngày kèm bộ lọc Tháng, Loại ca và Tìm nhanh ngày chấm.',
    impact: 'Nhân viên & Quản lý kiểm tra không sót bất kỳ lượt vào/ra ca nào',
  },
  {
    id: 'ui-synced-release-modal',
    category: 'redesigned',
    badge: 'Tinh chỉnh v4.0.1',
    title: 'Đồng bộ Hộp thoại Thông tin Phiên bản theo chuẩn KgDesignSystem',
    summary: 'Thu gọn đầu trang, chia 3 tab không tràn chữ, đọc nhanh toàn bộ điểm mới trong 5 giây.',
    description:
      'Loại bỏ mảng màu tối chiếm diện tích trên điện thoại, đồng bộ nền kem ấm Ivory/Alabaster với toàn bộ ngăn kéo hệ thống (KgBottomSheet) và trình bày tóm tắt phân nhóm cực dễ theo dõi.',
    impact: 'Hiển thị thoáng, đồng nhất 100% với ngôn ngữ thiết kế ứng dụng',
  },

  // 2. NÂNG CẤP THÊM MỚI (ADDED)
  {
    id: 'add-assistive-ai',
    category: 'added',
    badge: 'Đột phá thao tác',
    title: 'Nút Trợ lý AI kiểu Home ảo thông minh (AssistiveTouch)',
    summary: 'Nhấn giữ kéo thả tự do, hút nam châm sát mép và tự thu gọn sau 3 giây.',
    description:
      'Cho phép di chuyển nút AI đến vị trí thuận tay nhất trên màn hình và tự ẩn gọn vào cạnh trái/phải khi đang thao tác bảng công, bảng lương.',
    impact: 'Không bao giờ che khuất số liệu & nút bấm',
  },
  {
    id: 'add-superapp-dock',
    category: 'added',
    badge: 'Điều hướng mới',
    title: 'Floating Pill Dock trên Di động & Slim Rail 76px trên Máy tính',
    summary: 'Thanh điều hướng đáy nổi bo tròn cho điện thoại và cột điều hướng gọn cho Desktop.',
    description:
      'Tối ưu vùng chạm ngón cái trên di động và mở rộng tối đa diện tích bảng biểu trên màn hình máy tính kèm ngăn kéo mở rộng nhanh.',
    impact: 'Thao tác 1 tay mượt mà, rộng không gian làm việc',
  },
  {
    id: 'add-quick-launcher',
    category: 'added',
    badge: 'Tăng tốc ca trực',
    title: 'Bảng Khởi chạy Nhanh (Quick Launcher) ngay tại Trang chủ',
    summary: 'Truy cập 1 chạm: Chấm công AI, Checklist, Bàn giao ca, Lịch ca, Phiếu lương, SOP.',
    description:
      'Gom các nghiệp vụ dùng hàng ngày trong ca trực vào lưới phím tắt trực quan ngay đầu Trang chủ.',
    impact: 'Rút gọn từ 3 bước chuyển trang xuống 1 chạm',
  },
  {
    id: 'add-release-center',
    category: 'added',
    badge: 'Minh bạch cập nhật',
    title: 'Huy hiệu Phiên bản & Lịch sử Nâng cấp toàn hệ thống',
    summary: 'Tra cứu nhanh bản cập nhật tại Đăng nhập, Thanh đầu trang, Trang chủ và Hồ sơ.',
    description:
      'Theo dõi rõ ràng từng tính năng thêm mới, cải tiến giao diện và sửa lỗi kỹ thuật qua các đời phiên bản.',
    impact: 'Nắm bắt ngay thay đổi mới khi vào ca',
  },

  // 3. ĐỔI MỚI GIAO DIỆN 100% & TỐI ƯU DI ĐỘNG (REDESIGNED)
  {
    id: 'ui-warm-hospitality',
    category: 'redesigned',
    badge: 'Đổi mới 100% UI',
    title: 'Hệ màu Warm Hospitality (Alabaster × Grill Ember × Midnight Navy)',
    summary: 'Nền đá ấm Alabaster, thẻ sứ Ivory, điểm nhấn Đỏ lửa nướng & Xanh Midnight.',
    description:
      'Thay thế hoàn toàn tông trắng xám cũ bằng bảng màu đặc trưng F&B cao cấp của King’s Grill, tự động thích ứng chế độ Sáng & Tối đạt chuẩn tương phản WCAG AA.',
    impact: 'Sang trọng, dịu mắt khi xem lâu trong ca tối',
  },
  {
    id: 'ui-mobile-fit-engine',
    category: 'redesigned',
    badge: 'Tối ưu Di động',
    title: 'Chuẩn hóa Mobile-First Fit (360px – 430px) trên toàn bộ 26+ màn hình',
    summary: 'Gỡ bỏ đệm lồng kép, thu hồi +32px chiều rộng thực tế, chống rớt chữ/cắt chữ.',
    description:
      'Tinh chỉnh khoảng cách, cỡ chữ tiếng Việt và bố cục lưới tự động co giãn vừa vặn trên mọi dòng iPhone và Android phổ thông.',
    impact: 'Hiển thị gọn đẹp trên mọi kích cỡ màn hình',
  },
  {
    id: 'ui-login-atelier',
    category: 'redesigned',
    badge: 'Trải nghiệm đầu',
    title: 'Màn hình Đăng nhập Editorial Split Atelier mới',
    summary: 'Thiết kế gọn trên 1 khung hình điện thoại, đổi nhanh Sáng/Tối ngay góc trên.',
    description:
      'Kết hợp thẻ nhận diện thương hiệu giàu chiều sâu trên máy tính và biểu mẫu xác thực tinh gọn trên di động.',
    impact: 'Đăng nhập vào ca nhanh, không cần cuộn trang',
  },
  {
    id: 'ui-capsule-hubs',
    category: 'redesigned',
    badge: 'Đồng bộ 14 Hub',
    title: 'Đầu trang tinh gọn & Thanh chuyển tab con dạng Capsule trượt ngang',
    summary: 'Thu gọn phần tiêu đề để ưu tiên hiển thị dữ liệu nghiệp vụ ngay màn hình đầu.',
    description:
      'Đồng bộ cấu trúc điều hướng con mượt mà trên tất cả phân hệ: Lương & Công, Lịch làm, Vận hành ca, Truyền thông và Quản trị.',
    impact: 'Tăng thêm ~160px vùng hiển thị dữ liệu thực tế',
  },

  // 4. CHỈNH SỬA & TỐI ƯU KỸ THUẬT (UPDATED)
  {
    id: 'fix-tabular-currency',
    category: 'updated',
    badge: 'Chuẩn hóa số liệu',
    title: 'Đồng bộ font số học JetBrains Mono (tabular-nums) cho Tiền tệ & Giờ công',
    summary: 'Căn thẳng hàng đơn vị tiền VNĐ và thời gian trên Phiếu lương, Bảng công, Tạm ứng.',
    description:
      'Áp dụng định dạng chữ số độ rộng cố định trên toàn bộ bảng đối soát tài chính, thưởng/phạt và quỹ bàn giao ca.',
    impact: 'Đối soát lương & quỹ két nhanh, không nhầm hàng số',
  },
  {
    id: 'fix-sheet-drawers',
    category: 'updated',
    badge: 'Tối ưu nhập liệu',
    title: 'Đồng bộ biểu mẫu nhập liệu sang Ngăn kéo trượt chuẩn (KgBottomSheet)',
    summary: 'Thân thiện với bàn phím ảo trên điện thoại, vùng chạm đạt chuẩn >= 44×44px.',
    description:
      'Nâng cấp các hộp thoại cấu hình lương, sơ đồ tổ chức và xác nhận bù công giúp thao tác mượt trên di động.',
    impact: 'Không bị bàn phím che khuất ô nhập',
  },
  {
    id: 'fix-sop-offline-icons',
    category: 'updated',
    badge: 'Tối ưu tốc độ',
    title: 'Biểu tượng vector nội bộ & Sửa bố cục Biểu đồ Thống kê Tablet',
    summary: 'Loại bỏ phụ thuộc icon CDN ngoài trong Sổ tay SOP; chuẩn hóa lưới KPI trên iPad.',
    description:
      'Tải tức thì ngay cả khi mạng 4G chập chờn và hiển thị chuẩn xác biểu đồ chuyên cần 14 ngày trên máy tính bảng.',
    impact: 'Tốc độ mở trang tức thì, ổn định đa thiết bị',
  },
];

export const VERSION_HISTORY: VersionHistoryEntry[] = [
  {
    version: 'v4.0.1',
    date: '02/11/2026',
    codename: 'Full History & Harmonized Release UI',
    isCurrent: true,
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
      'Tích hợp chấm công nhận diện khuôn mặt AI (face-api.js) kèm đóng dấu ảnh chụp thực tế.',
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

export function openReleaseNotesModal(
  initialFilter: 'all' | ReleaseChangeCategory | 'history' = 'all'
): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('kg:open-release-notes', {
        detail: { filter: initialFilter },
      })
    );
  }
}
