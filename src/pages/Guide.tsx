import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { hasTabPermission, getTabLabel, type TabId } from '../utils/permissions';
import {
  BookOpen,
  Search,
  Check,
  ChevronRight,
  HelpCircle,
  LayoutDashboard,
  Camera,
  Calendar,
  DollarSign,
  History,
  ClipboardCheck,
  Repeat,
  ArrowLeftRight,
  CalendarDays,
  Newspaper,
  UtensilsCrossed,
  MessageSquareWarning,
  CalendarClock,
  Award,
  Building2,
  Users,
  KeyRound,
  CalendarRange,
  Banknote,
  ArrowLeft,
  CheckCircle2,
  GraduationCap,
  Sparkles,
  X,
  ExternalLink,
} from 'lucide-react';
import NewbieGuideModal from '../components/NewbieGuideModal';
import {
  KgPage,
  KgPageHeader,
  KgCard,
  KgInput,
  KgButton,
  KgStatusBadge,
  KgAlertCard,
  KgFeatureTip,
} from '../components/KgDesignSystem';

interface GuideItem {
  id: TabId;
  title: string;
  category: 'personal' | 'operation' | 'admin';
  icon: React.ComponentType<any>;
  summary: string;
  description: string;
  steps: string[];
  tips?: string[];
}

const GUIDE_TARGET_MAP: Partial<Record<TabId, { hub: TabId; subTab?: string }>> = {
  dashboard: { hub: 'dashboard' },
  checkin: { hub: 'checkin' },
  schedule: { hub: 'workforce', subTab: 'schedule' },
  roster: { hub: 'workforce', subTab: 'roster' },
  swap: { hub: 'workforce', subTab: 'swap' },
  payroll: { hub: 'attendance', subTab: 'payroll' },
  history: { hub: 'attendance', subTab: 'history' },
  advance: { hub: 'attendance', subTab: 'advance' },
  checklist: { hub: 'work', subTab: 'checklist' },
  handover: { hub: 'work', subTab: 'handover' },
  soldout: { hub: 'work', subTab: 'soldout' },
  news: { hub: 'communications', subTab: 'news' },
  feedback: { hub: 'communications', subTab: 'feedback' },
  training: { hub: 'knowledge', subTab: 'training' },
  reward: { hub: 'income', subTab: 'reward' },
  admin: { hub: 'admin_system', subTab: 'ai' },
  admin_analytics: { hub: 'admin_system', subTab: 'analytics' },
  hr_list: { hub: 'admin_people', subTab: 'employees' },
  admin_org: { hub: 'admin_people', subTab: 'organization' },
  admin_shift: { hub: 'admin_workforce', subTab: 'settings' },
  admin_payroll: { hub: 'admin_income', subTab: 'config' },
  admin_checklist: { hub: 'admin_work', subTab: 'checklist' },
};

// Hoisted static Guide catalog so it is not re-allocated on every render
const ALL_GUIDES: GuideItem[] = [
  {
    id: 'dashboard',
    title: 'Bảng điều khiển Hôm nay',
    category: 'personal',
    icon: LayoutDashboard,
    summary: 'Tổng quan công việc, trạng thái chấm công, lối tắt nhanh và tin tức trong ngày.',
    description:
      'Trang Hôm nay (Dashboard) là cổng thông tin chính giúp bạn nắm bắt nhanh tình hình vận hành của ca làm việc hiện tại, các đầu mục công việc cấp bách cần giải quyết, cùng nhật ký hoạt động gần đây.',
    steps: [
      'Xem ca trực hôm nay của bạn (Sáng, Tối, hoặc OFF) và trạng thái chấm công (Chưa vào ca, Đã vào ca, Đã ra ca).',
      'Theo dõi danh sách "Việc cần làm hôm nay" gồm nộp checklist việc, bàn giao ca, hoặc đăng ký lịch tuần tới.',
      'Sử dụng mục Lối tắt nhanh để truy cập nhanh các chức năng như Bảng tin, Món hết, Phiếu lương, Góp ý...',
      'Xem tóm tắt lịch sử chấm công gần đây ở cột bên phải (trên máy tính) hoặc phía dưới (trên điện thoại).',
    ],
  },
  {
    id: 'checkin',
    title: 'Chấm công bằng Face ID & GPS',
    category: 'personal',
    icon: Camera,
    summary: 'Xác thực chấm công vào ca và ra ca bằng hình ảnh khuôn mặt và vị trí địa lý.',
    description:
      'Nhà hàng áp dụng công nghệ chấm công thông minh ngay trên thiết bị để đối chiếu khuôn mặt (Face ID) của bạn với cơ sở dữ liệu nhân sự, đồng thời kiểm tra tọa độ GPS tại khu vực nhà hàng.',
    steps: [
      'Mở quyền truy cập Vị trí (GPS) và Máy ảnh (Camera) cho trình duyệt khi được yêu cầu.',
      'Chọn Chấm công. Hệ thống sẽ quét vị trí và báo khoảng cách từ bạn đến tâm nhà hàng.',
      'Bấm nút "Chấm công vào ca" (hoặc "Ra ca" tương ứng).',
      'Đưa khuôn mặt vào chính giữa khung camera, bấm chụp và chờ xử lý.',
      'Hệ thống báo "Thành công" và lưu log chấm công hợp lệ lên máy chủ.',
    ],
    tips: [
      'Vui lòng chấm công ở khu vực đủ ánh sáng, tránh đeo kính râm hoặc khẩu trang.',
      'Nếu hệ thống báo sai vị trí GPS, hãy mở Google Maps để cập nhật tọa độ chính xác rồi tải lại trang.',
    ],
  },
  {
    id: 'schedule',
    title: 'Đăng ký lịch làm tuần mới',
    category: 'personal',
    icon: Calendar,
    summary: 'Chủ động đăng ký ca làm việc mong muốn cho tuần tiếp theo.',
    description:
      'Hàng tuần, nhân viên được quyền chủ động đăng ký các ca làm việc (Ca Sáng, Ca Tối) hoặc ca nghỉ (OFF) để quản lý phê duyệt và sắp xếp lịch tổng thể cho nhà hàng.',
    steps: [
      'Truy cập phân hệ Lịch làm việc và mở tab Lịch của tôi.',
      'Nhấn chọn ca làm việc tương ứng cho từng ngày từ Thứ Hai đến Chủ Nhật.',
      'Đối với những ngày đăng ký OFF (nghỉ), bắt buộc phải điền Lý do nghỉ phép ở khung ghi chú.',
      'Kiểm tra kỹ thông tin ca đăng ký và bấm "Đăng ký lịch làm" để gửi lên quản lý duyệt.',
    ],
    tips: [
      'Lịch đăng ký tuần sau cần hoàn tất trước 17:00 Thứ 7 hàng tuần.',
      'Sau khi quản lý phê duyệt, bạn sẽ không tự ý sửa đổi được mà phải dùng tính năng Đổi ca.',
    ],
  },
  {
    id: 'payroll',
    title: 'Xem phiếu lương & Công làm',
    category: 'personal',
    icon: DollarSign,
    summary: 'Tra cứu chi tiết giờ công tích lũy, mức lương cơ bản và thực lĩnh hàng tháng.',
    description:
      'Phân hệ Phiếu lương cung cấp thông tin minh bạch về tổng số giờ làm việc thực tế, lương cơ bản theo giờ/tháng, các khoản cộng (thưởng nóng, chuyên cần) và các khoản trừ (phạt vi phạm, tạm ứng).',
    steps: [
      'Mở phân hệ Công & Lương -> Phiếu lương trên thanh điều hướng.',
      'Chọn tháng và năm mà bạn muốn tra cứu dữ liệu lương.',
      'Xem tổng kết giờ công thực tế đã làm (quy đổi từ các ca chấm công hợp lệ).',
      'Đối chiếu các khoản Thưởng, Phạt, Ứng lương và xác nhận phiếu lương.',
    ],
  },
  {
    id: 'history',
    title: 'Lịch sử chấm công chi tiết',
    category: 'personal',
    icon: History,
    summary: 'Tra cứu nhật ký vào ca/ra ca, ảnh đối chiếu và tọa độ chấm công.',
    description:
      'Giúp bạn tự kiểm tra toàn bộ nhật ký chấm công của bản thân để đối chiếu với quản lý khi có sai lệch công làm.',
    steps: [
      'Chọn Công & Lương -> Lịch sử để xem danh sách log được sắp xếp theo thời gian mới nhất.',
      'Kiểm tra chính xác giờ Vào ca (IN) và Ra ca (OUT) cho từng ngày làm việc.',
      'Nhấn vào ảnh thu nhỏ để xem lại hình ảnh khuôn mặt đã chụp đối chiếu.',
      'Xem ghi chú trạng thái để biết ca làm có được ghi nhận Hợp lệ hay không.',
    ],
  },
  {
    id: 'checklist',
    title: 'Checklist công việc hàng ngày',
    category: 'operation',
    icon: ClipboardCheck,
    summary: 'Thực hiện và tích chọn báo cáo công việc đầu ca/cuối ca theo 4 phân khu.',
    description:
      'Checklist công việc được thiết lập theo 4 phân khu (A, B, C, D&E) để đảm bảo chất lượng vận hành dịch vụ của nhà hàng trong suốt ca trực.',
    steps: [
      'Truy cập Vận hành -> Checklist phân khu để chọn khu vực bạn phụ trách.',
      'Thực hiện các công việc ngoài thực tế tương ứng với từng đầu mục.',
      'Tích chọn hoàn thành công việc trên ứng dụng và ghi chú nếu có phát sinh.',
      'Bấm đồng bộ/nộp checklist để lưu tiến độ gửi tổ trưởng/quản lý kiểm tra.',
    ],
    tips: [
      'Checklist lưu trạng thái nháp tự động trên thiết bị nếu mất mạng giữa chừng.',
      'Việc quên nộp hoặc bỏ sót đầu mục bắt buộc sẽ hiển thị nhắc nhở trên màn hình Hôm nay.',
    ],
  },
  {
    id: 'handover',
    title: 'Sổ bàn giao ca & Két tiền',
    category: 'operation',
    icon: Repeat,
    summary: 'Đối soát két tiền mặt 2 chiều theo POS và theo dõi xử lý sự cố 4 bước.',
    description:
      'Phân hệ dành cho Thu ngân, Tổ trưởng và Quản lý để đối soát két tiền mặt đầu ca - cuối ca, xác nhận nhận đủ két từ ca trước và báo cáo sự cố phát sinh trong ca.',
    steps: [
      'Đầu ca, kiểm đếm tiền mặt ca trước giao lại và bấm "Nhận đủ két" hoặc "Báo lệch két".',
      'Cuối ca, nhập doanh thu tiền mặt POS và chi tiền mặt tại quầy để hệ thống tính số dư lý thuyết.',
      'Nhập số tiền mặt kiểm đếm thực tế (hoặc dùng bảng kê mệnh giá tiền mặt hỗ trợ).',
      'Nếu có chênh lệch hoặc chi quầy, ghi rõ lý do giải trình rồi bấm "Chốt đối soát & Bàn giao két".',
    ],
  },
  {
    id: 'swap',
    title: 'Yêu cầu đổi ca & Đơn xin nghỉ',
    category: 'operation',
    icon: ArrowLeftRight,
    summary: 'Gửi yêu cầu trao đổi ca làm với đồng nghiệp hoặc gửi đơn xin nghỉ phép.',
    description:
      'Khi bạn có việc bận đột xuất và không thể làm việc theo lịch đã xếp, hãy dùng tính năng Đổi ca để hoán đổi ca làm với đồng nghiệp khác hoặc gửi đơn xin nghỉ phép lên Ban quản lý.',
    steps: [
      'Vào phân hệ Lịch làm việc -> Đổi ca và nhấn nút "Tạo yêu cầu mới".',
      'Chọn Ngày làm việc và Ca làm việc mà bạn muốn đổi/xin nghỉ.',
      'Chọn hình thức: "Đổi ca với nhân viên khác" hoặc "Xin nghỉ phép (Gửi Admin)".',
      'Nếu đổi ca: Chọn tên đồng nghiệp muốn hoán đổi. Nếu xin nghỉ: Gửi trực tiếp cho Quản lý.',
      'Nhập lý do rõ ràng và nhấn "Gửi yêu cầu", chờ đồng nghiệp và Quản lý phê duyệt.',
    ],
  },
  {
    id: 'roster',
    title: 'Lịch làm việc tổng nhà hàng',
    category: 'personal',
    icon: CalendarDays,
    summary: 'Xem lịch trực tuần của tất cả nhân sự tại các vị trí trong nhà hàng.',
    description:
      'Lịch tổng (Roster) cung cấp cái nhìn toàn cảnh về phân bổ nhân sự hàng ngày để nhân viên chủ động phối hợp làm việc và hỗ trợ lẫn nhau.',
    steps: [
      'Mở Lịch làm việc -> Lịch tổng để xem bảng phân ca của tuần hiện tại.',
      'Sử dụng ô tìm kiếm để tra cứu nhanh lịch trực của một đồng nghiệp cụ thể.',
      'Lọc lịch làm việc theo vị trí phòng ban (Phục vụ, Thu ngân, Bếp, Bar...) để theo dõi dễ dàng hơn.',
    ],
  },
  {
    id: 'news',
    title: 'Bảng tin & Thông báo nội bộ',
    category: 'personal',
    icon: Newspaper,
    summary: 'Đọc các chính sách mới, thông báo vận hành và hoạt động thi đua.',
    description:
      'Bảng tin là nơi truyền tải mọi thông tin chính thống từ Ban quản lý nhà hàng. Bạn nên cập nhật bảng tin mỗi ngày trước khi vào ca.',
    steps: [
      'Mở Bảng tin để đọc các bài viết, thông báo mới nhất.',
      'Bấm nút Thích để tương tác và xác nhận đã nắm được thông tin bài viết.',
      'Bình luận bên dưới bài viết để hỏi đáp, trao đổi chuyên môn hoặc chúc mừng đồng nghiệp.',
    ],
  },
  {
    id: 'soldout',
    title: 'Báo cáo món hết trong ngày',
    category: 'operation',
    icon: UtensilsCrossed,
    summary: 'Cập nhật danh sách món ăn/nước uống đã hết để phục vụ order chuẩn xác.',
    description:
      'Tránh trường hợp nhân viên order món ăn đã hết cho khách, bộ phận bếp/bar hoặc phục vụ cập nhật nhanh các món tạm hết lên hệ thống để thu ngân và phục vụ nắm thông tin tức thì.',
    steps: [
      'Vào Vận hành -> Món hết để tra cứu các món ăn/thức uống đang tạm hết.',
      'Để báo hết món mới: Nhấn nút "Báo món hết".',
      'Chọn nhanh từ các thẻ gợi ý món hay hết hoặc nhập tên món ăn/thức uống vừa hết nguyên liệu.',
      'Nhấn "Xác nhận báo hết". Món sẽ hiển thị lập tức trên hệ thống cho toàn bộ nhân sự.',
      'Khi nguyên liệu đã nhập về đầy đủ: Bấm nút "Mở lại" (1 chạm) để đưa món về trạng thái phục vụ bình thường.',
    ],
  },
  {
    id: 'training',
    title: 'Đào tạo nghiệp vụ & SOP',
    category: 'operation',
    icon: CalendarClock,
    summary: 'Học tập quy trình chuẩn, hướng dẫn CUKCUK và làm bài kiểm tra năng lực.',
    description:
      'Phân hệ cung cấp kho tài liệu đào tạo nội bộ bao gồm Sổ tay quy trình vận hành tiêu chuẩn (SOP), hướng dẫn phần mềm bán hàng CUKCUK và bài trắc nghiệm nghiệp vụ.',
    steps: [
      'Mở Kiến thức & Đào tạo -> Đào tạo để truy cập thư viện SOP theo vị trí chuyên môn.',
      'Dùng thanh tìm kiếm hoặc các nút tra cứu nhanh tình huống (Khách phàn nàn, PCCC, Đổ vỡ...).',
      'Chuyển sang tab "Kiểm tra năng lực" để làm bài trắc nghiệm đạt từ 70% trở lên.',
      'Xem tab "Hướng dẫn CUKCUK" khi cần thao tác trên máy POS/máy tính bảng.',
    ],
  },
  {
    id: 'feedback',
    title: 'Gửi góp ý & Đóng góp ý kiến',
    category: 'personal',
    icon: MessageSquareWarning,
    summary: 'Gửi ý kiến phản hồi ẩn danh hoặc công khai tới Ban quản lý.',
    description:
      'Giúp bạn tự do đóng góp ý kiến cải tiến quy trình vận hành, nâng cấp cơ sở vật chất hoặc phản ánh các vấn đề phát sinh tại nhà hàng trực tiếp tới quản lý.',
    steps: [
      'Vào Bảng tin & Góp ý -> Góp ý và chọn nhóm nội dung phù hợp.',
      'Nhập nội dung ý kiến đóng góp chi tiết.',
      'Bật chế độ "Ẩn danh" nếu bạn muốn bảo mật hoàn toàn danh tính cá nhân.',
      'Bấm "Gửi phản hồi" để chuyển tiếp thông tin tới Quản lý.',
    ],
  },
  {
    id: 'reward',
    title: 'Điểm thưởng King Coins',
    category: 'personal',
    icon: Award,
    summary: 'Theo dõi điểm tích lũy thi đua King Coins và bảng xếp hạng tích cực.',
    description:
      'King Coins là cơ chế ghi nhận nội bộ nhằm vinh danh các nhân viên hoàn thành tốt đào tạo và tác phong vận hành chuẩn mực.',
    steps: [
      'Vào Thi đua & Kỷ luật -> Ghi nhận để kiểm tra số dư điểm thưởng hiện tại.',
      'Theo dõi lịch sử cộng điểm từ các bài kiểm tra đào tạo và ghi nhận từ quản lý.',
      'Xem bảng xếp hạng ghi nhận nhân sự tích cực trong tháng.',
    ],
  },
  {
    id: 'advance',
    title: 'Đăng ký ứng lương tạm thời',
    category: 'personal',
    icon: Banknote,
    summary: 'Đăng ký nhận trước một khoản lương tương ứng với ngày công đã làm.',
    description:
      'Hỗ trợ nhân viên giải quyết nhu cầu tài chính đột xuất. Bạn có thể ứng trước lương trong hạn mức phần trăm quy định dựa trên lương tích lũy tháng hiện tại.',
    steps: [
      'Mở Công & Lương -> Ứng lương trên giao diện ứng dụng.',
      'Nhập số tiền muốn ứng và điền lý do chi tiết vào đơn yêu cầu.',
      'Bấm "Gửi yêu cầu ứng lương" và theo dõi trạng thái Chờ duyệt / Đã duyệt.',
    ],
  },
  // Admin Guides
  {
    id: 'admin',
    title: 'Cấu hình Chatbot AI Trợ lý',
    category: 'admin',
    icon: Building2,
    summary: 'Thiết lập API key và prompt chỉ dẫn hành vi cho Trợ lý AI.',
    description:
      'Phân hệ quản trị dành riêng cho Admin để cài đặt và tinh chỉnh hành vi phản hồi của Chatbot AI giúp nhân viên tra cứu quy trình vận hành nhà hàng.',
    steps: [
      'Truy cập Hệ thống & Báo cáo -> AI & API.',
      'Cập nhật API Key hoạt động của hệ thống.',
      'Điều chỉnh System Prompt phù hợp với quy trình nhà hàng và nhấn Lưu.',
    ],
  },
  {
    id: 'hr_list',
    title: 'Quản lý danh sách nhân sự',
    category: 'admin',
    icon: Users,
    summary: 'Thêm tài khoản mới, cập nhật thông tin và trạng thái làm việc nhân viên.',
    description:
      'Giúp Admin quản lý toàn bộ hồ sơ nhân sự của nhà hàng, phân quyền vai trò đăng nhập, chức vụ và trạng thái công tác.',
    steps: [
      'Mở Nhân sự & Tổ chức -> Hồ sơ nhân sự.',
      'Nhấn "Thêm nhân viên" để tạo tài khoản mới kèm vị trí làm việc và vai trò.',
      'Chọn tài khoản nhân sự từ danh sách để cập nhật thông tin hoặc đặt lại mật khẩu.',
    ],
  },
  {
    id: 'admin_org',
    title: 'Cấu hình định vị GPS & Tổ chức',
    category: 'admin',
    icon: KeyRound,
    summary: 'Thiết lập vị trí tọa độ GPS của nhà hàng và cơ cấu tổ chức.',
    description:
      'Thiết lập tọa độ địa lý chính xác của nhà hàng nhằm kiểm soát tính hợp lệ của việc chấm công GPS, đồng thời quản lý cơ cấu tổ chức.',
    steps: [
      'Mở Nhân sự & Tổ chức -> Tổ chức & quyền.',
      'Cập nhật Tên nhà hàng, địa chỉ, vĩ độ (Latitude), kinh độ (Longitude) và bán kính cho phép.',
      'Lưu cấu hình để áp dụng cho toàn bộ lượt chấm công GPS.',
    ],
  },
  {
    id: 'admin_shift',
    title: 'Duyệt lịch & Xếp ca tuần',
    category: 'admin',
    icon: CalendarRange,
    summary: 'Tổng hợp đăng ký của nhân viên để xếp lịch làm việc tuần chính thức.',
    description:
      'Giao diện giúp Admin/Quản lý xem nhu cầu đăng ký đi làm/nghỉ phép của toàn bộ nhân viên, thực hiện phân ca trực và công bố lịch tuần.',
    steps: [
      'Mở Ca làm & Chấm công -> Xếp lịch.',
      'Nhấn vào ô lịch của từng nhân viên để thay đổi ca trực hoặc thêm ghi chú.',
      'Bấm "Công bố lịch làm" để phát hành lịch tuần chính thức ra màn hình nhân viên.',
    ],
  },
  {
    id: 'admin_payroll',
    title: 'Cấu hình công thức lương & Định mức',
    category: 'admin',
    icon: DollarSign,
    summary: 'Thiết lập định mức lương tháng, phụ cấp ăn ca và hạn mức ứng lương.',
    description:
      'Admin quản lý các thông số tài chính tiền lương của nhà hàng, khai báo đơn giá theo giờ/tháng cho từng nhân sự và duyệt đề nghị điều chỉnh.',
    steps: [
      'Mở Lương & Ghi nhận -> Cấu hình lương.',
      'Thiết lập định mức lương từng nhân viên theo tháng hoặc sao chép từ tháng trước.',
      'Cập nhật hạn mức ứng lương tối đa và duyệt các đề nghị điều chỉnh từ nhân viên.',
    ],
  },
  {
    id: 'admin_checklist',
    title: 'Cấu hình checklist công việc',
    category: 'admin',
    icon: ClipboardCheck,
    summary: 'Quản lý danh sách việc làm cần kiểm tra cho từng ca và bộ phận.',
    description:
      'Admin thiết lập danh sách các công việc nhân viên phải hoàn thành và nộp báo cáo trong ca trực.',
    steps: [
      'Mở Điều phối & Công việc -> Cấu hình Checklist.',
      'Thêm mới hoặc chỉnh sửa hạng mục theo bộ phận và ca trực áp dụng.',
      'Lưu cấu hình để đồng bộ ngay xuống giao diện Checklist của nhân viên.',
    ],
  },
  {
    id: 'admin_analytics',
    title: 'Báo cáo & Thống kê vận hành',
    category: 'admin',
    icon: Building2,
    summary: 'Thống kê chuyên cần, tổng hợp bàn giao ca và xuất file bảng công lương.',
    description:
      'Trung tâm tổng hợp dữ liệu hoạt động của nhà hàng, hỗ trợ đối soát két tiền mặt, xử lý sự cố và theo dõi chuyên cần.',
    steps: [
      'Mở Hệ thống & Báo cáo -> Báo cáo.',
      'Theo dõi tỷ lệ chuyên cần, trạng thái bàn giao két và sự cố vận hành.',
      'Xuất dữ liệu báo cáo phục vụ đối soát cuối tháng.',
    ],
  },
];

export default function Guide() {
  const currentUser = useAppStore((s) => s.currentUser);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'personal' | 'operation' | 'admin'>('all');
  const [selectedGuideId, setSelectedGuideId] = useState<TabId | null>(null);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [readGuides, setReadGuides] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kg_read_guides');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleReadStatus = (id: string) => {
    const newRead = readGuides.includes(id)
      ? readGuides.filter((g) => g !== id)
      : [...readGuides, id];
    setReadGuides(newRead);
    try {
      localStorage.setItem('kg_read_guides', JSON.stringify(newRead));
    } catch {
      // ignore storage errors
    }
  };

  const jumpToModule = (guideId: TabId) => {
    const target = GUIDE_TARGET_MAP[guideId] || { hub: guideId };
    if (target.subTab) {
      try {
        sessionStorage.setItem(`kg_hub_subtab_${target.hub}`, target.subTab);
      } catch {
        // ignore storage errors
      }
    }
    setCurrentTab(target.hub);
    if (target.subTab) {
      window.dispatchEvent(
        new CustomEvent('kg:subtab-select', { detail: { hub: target.hub, subTab: target.subTab } }),
      );
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('kg:subtab-select', { detail: { hub: target.hub, subTab: target.subTab } }),
        );
      }, 30);
    }
  };

  const allowedGuides = ALL_GUIDES.filter((guide) => hasTabPermission(guide.id, currentUser));

  const filteredGuides = allowedGuides.filter((guide) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      guide.title.toLowerCase().includes(q) ||
      guide.summary.toLowerCase().includes(q) ||
      guide.description.toLowerCase().includes(q);
    const matchesCategory = selectedCategory === 'all' || guide.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const selectedGuide = ALL_GUIDES.find((g) => g.id === selectedGuideId);

  const totalAllowed = allowedGuides.length;
  const totalRead = allowedGuides.filter((g) => readGuides.includes(g.id)).length;
  const displayPercent = totalAllowed > 0 ? Math.min(100, Math.round((totalRead / totalAllowed) * 100)) : 0;

  return (
    <KgPage>
      {selectedGuideId && selectedGuide ? (
        <div className="space-y-5 animate-fade-in pb-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <KgButton
              type="button"
              variant="secondary"
              size="sm"
              icon={ArrowLeft}
              onClick={() => setSelectedGuideId(null)}
            >
              Quay lại danh sách
            </KgButton>
            <KgButton
              type="button"
              variant="primary"
              size="sm"
              icon={ExternalLink}
              onClick={() => jumpToModule(selectedGuide.id)}
            >
              Mở phân hệ
            </KgButton>
          </div>

          <KgCard className="p-5 md:p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--kg-border)] pb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[var(--kg-primary-soft)] flex items-center justify-center text-[var(--kg-primary-ink)] flex-shrink-0">
                  <selectedGuide.icon size={24} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg md:text-xl font-extrabold text-[var(--kg-text)] leading-tight">
                      {selectedGuide.title}
                    </h2>
                    <KgStatusBadge
                      variant={
                        selectedGuide.category === 'admin'
                          ? 'error'
                          : selectedGuide.category === 'operation'
                            ? 'info'
                            : 'success'
                      }
                    >
                      {selectedGuide.category === 'admin'
                        ? 'Quản trị'
                        : selectedGuide.category === 'operation'
                          ? 'Vận hành'
                          : 'Cá nhân'}
                    </KgStatusBadge>
                  </div>
                  <p className="text-xs text-[var(--kg-text-muted)] mt-1">
                    Hướng dẫn chi tiết dành cho vai trò: {currentUser?.position || 'Nhân viên'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {readGuides.includes(selectedGuide.id) ? (
                  <KgStatusBadge variant="success" className="px-3 py-1 text-xs">
                    ✓ Đã đọc xong
                  </KgStatusBadge>
                ) : (
                  <KgStatusBadge variant="neutral" className="px-3 py-1 text-xs">
                    ○ Chưa đánh dấu
                  </KgStatusBadge>
                )}
              </div>
            </div>

            <div className="space-y-5 max-w-[68ch]">
              <div className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-[var(--kg-primary-ink)]">
                  1. Giới thiệu phân hệ
                </h3>
                <p className="text-sm text-[var(--kg-text)] leading-relaxed font-medium">
                  {selectedGuide.description}
                </p>
              </div>

              <div className="space-y-3.5">
                <h3 className="text-sm font-black uppercase tracking-wider text-[var(--kg-primary-ink)]">
                  2. Quy trình &amp; Các bước thực hiện
                </h3>
                <div className="relative border-l border-[var(--kg-border)] ml-3.5 pl-5 space-y-5 py-1">
                  {selectedGuide.steps.map((step, index) => (
                    <div key={index} className="relative">
                      <div className="absolute -left-[31px] top-0.5 w-6 h-6 rounded-full bg-[var(--kg-primary)] text-white flex items-center justify-center text-xs font-bold font-mono tabular-nums shadow-xs">
                        {index + 1}
                      </div>
                      <p className="text-xs md:text-sm text-[var(--kg-text)] font-semibold leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {selectedGuide.tips && selectedGuide.tips.length > 0 && (
                <KgAlertCard variant="warning" title="Mẹo & Lưu ý quan trọng">
                  <ul className="list-disc pl-4 space-y-1 mt-1 text-xs leading-relaxed font-medium">
                    {selectedGuide.tips.map((tip, idx) => (
                      <li key={idx}>{tip}</li>
                    ))}
                  </ul>
                </KgAlertCard>
              )}
            </div>

            <div className="border-t border-[var(--kg-border)] pt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-[var(--kg-text-muted)] font-medium text-center sm:text-left">
                Đánh dấu đã đọc để tự theo dõi danh mục hướng dẫn bạn đã xem trên thiết bị này.
              </p>
              <KgButton
                variant={readGuides.includes(selectedGuide.id) ? 'secondary' : 'primary'}
                size="md"
                className="w-full sm:w-auto"
                icon={readGuides.includes(selectedGuide.id) ? Check : CheckCircle2}
                onClick={() => toggleReadStatus(selectedGuide.id)}
              >
                {readGuides.includes(selectedGuide.id) ? 'Bỏ đánh dấu đã đọc' : 'Đã hiểu & Đánh dấu đã đọc'}
              </KgButton>
            </div>
          </KgCard>
        </div>
      ) : (
        <div className="space-y-5 animate-fade-in pb-10">
          <KgPageHeader
            title="Hướng Dẫn Sử Dụng"
            description="Tài liệu hướng dẫn vận hành hệ thống Staff OS của King's Grill."
            icon={BookOpen}
            actions={
              <KgFeatureTip
                title="Mẹo Tự Học & Tra Cứu Nhanh"
                tips={[
                  'Đọc kỹ cẩm nang từng phân hệ để nắm vững cách chấm công, xem bảng công, làm checklist.',
                  "Sau khi nắm rõ quy trình, bấm 'Đã hiểu & Đánh dấu đã đọc' để ghi nhớ trên thiết bị hiện tại.",
                  'Bạn có thể bấm "Mở phân hệ" ở trang chi tiết để chuyển thẳng tới màn hình thao tác.',
                ]}
                variant="badge"
                triggerText="Mẹo tự học"
              />
            }
          />

          <div className="p-4 rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex flex-col sm:flex-row items-center justify-between gap-3.5 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--kg-primary)] text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-xs">
                <GraduationCap size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-[var(--kg-text)]">
                  Cẩm Nang Nhập Môn &amp; Tiêu Chuẩn Đạt Cho Người Mới
                </h3>
                <p className="text-xs text-[var(--kg-text-muted)] font-medium mt-0.5">
                  Tóm tắt 5 bước thao tác hàng ngày, quy trình chấm công, xếp lịch và tiêu chuẩn vận hành.
                </p>
              </div>
            </div>
            <KgButton
              type="button"
              variant="primary"
              size="md"
              icon={Sparkles}
              onClick={() => setIsGuideModalOpen(true)}
              className="w-full sm:w-auto flex-shrink-0"
            >
              Mở Cẩm Nang Nhanh
            </KgButton>
          </div>

          <KgCard className="p-4 bg-[var(--kg-surface)] border border-[var(--kg-border)] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="space-y-1 text-center sm:text-left">
              <h3 className="text-sm font-extrabold text-[var(--kg-text)]">Tiến độ tự đọc hướng dẫn trên thiết bị</h3>
              <p className="text-xs text-[var(--kg-text-muted)]">
                Đã đánh dấu <b className="font-mono tabular-nums">{totalRead}</b> trên tổng số{' '}
                <b className="font-mono tabular-nums">{totalAllowed}</b> chức năng được cấp quyền.
              </p>
            </div>

            <div className="w-full sm:w-64 space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-[var(--kg-text-muted)]">
                <span>Tiến độ</span>
                <span className="text-[var(--kg-primary-ink)] font-mono tabular-nums font-black">{displayPercent}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-[var(--kg-surface-soft)] overflow-hidden border border-[var(--kg-border)]">
                <div
                  className="h-full rounded-full bg-[var(--kg-primary)] transition-all duration-200 ease-out"
                  style={{ width: `${displayPercent}%` }}
                />
              </div>
            </div>
          </KgCard>

          <div className="flex flex-col md:flex-row gap-3.5 items-stretch md:items-center justify-between">
            <div className="w-full md:w-80">
              <KgInput
                aria-label="Tìm hướng dẫn"
                placeholder="Tìm hướng dẫn..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={Search}
                rightAdornment={
                  searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Xóa từ khóa tìm kiếm"
                      className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)] transition-colors"
                    >
                      <X size={15} />
                    </button>
                  ) : null
                }
              />
            </div>

            <div className="flex flex-wrap sm:flex-nowrap gap-1 bg-[var(--kg-surface)] border border-[var(--kg-border)] p-1 rounded-2xl shadow-xs">
              {(
                [
                  { id: 'all', label: `Tất cả (${allowedGuides.length})` },
                  { id: 'personal', label: `Cá nhân (${allowedGuides.filter((g) => g.category === 'personal').length})` },
                  { id: 'operation', label: `Vận hành (${allowedGuides.filter((g) => g.category === 'operation').length})` },
                  ...(allowedGuides.some((g) => g.category === 'admin')
                    ? [
                        {
                          id: 'admin' as const,
                          label: `Quản lý (${allowedGuides.filter((g) => g.category === 'admin').length})`,
                        },
                      ]
                    : []),
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`flex-1 sm:flex-initial min-h-[44px] sm:min-h-[38px] px-2.5 sm:px-3.5 py-2 inline-flex items-center justify-center rounded-xl text-[11.5px] sm:text-xs font-black transition-all whitespace-nowrap active:scale-95 select-none touch-manipulation ${
                    selectedCategory === tab.id
                      ? 'bg-[var(--kg-primary)] text-white shadow-xs'
                      : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] font-bold'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredGuides.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGuides.map((guide) => {
                const GuideIcon = guide.icon;
                const isRead = readGuides.includes(guide.id);
                return (
                  <KgCard
                    key={guide.id}
                    onClick={() => setSelectedGuideId(guide.id)}
                    className="p-4 flex flex-col justify-between hover:shadow-md transition-all active:scale-[0.99] relative overflow-hidden"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-[var(--kg-primary-soft)] flex items-center justify-center text-[var(--kg-primary-ink)] flex-shrink-0">
                            <GuideIcon size={18} />
                          </div>
                          <div>
                            <h3 className="text-xs font-black text-[var(--kg-text)] leading-tight">{guide.title}</h3>
                            <span className="text-[10px] text-[var(--kg-text-muted)] font-bold">
                              Phân hệ: {getTabLabel(guide.id)}
                            </span>
                          </div>
                        </div>

                        <div>
                          {isRead ? (
                            <KgStatusBadge variant="success" className="text-[10px] px-2 py-0.5">
                              ✓ Đã đọc
                            </KgStatusBadge>
                          ) : (
                            <KgStatusBadge variant="neutral" className="text-[10px] px-2 py-0.5">
                              Chưa đọc
                            </KgStatusBadge>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-[var(--kg-text-muted)] leading-relaxed line-clamp-2">
                        {guide.summary}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-[var(--kg-border)] pt-3 mt-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--kg-text-muted)]">
                        Thể loại:{' '}
                        {guide.category === 'admin'
                          ? 'Quản trị'
                          : guide.category === 'operation'
                            ? 'Vận hành'
                            : 'Cá nhân'}
                      </span>
                      <span className="text-xs font-bold text-[var(--kg-primary-ink)] inline-flex items-center gap-1 hover:underline">
                        Xem chi tiết <ChevronRight size={14} />
                      </span>
                    </div>
                  </KgCard>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-[var(--kg-surface)] border border-dashed border-[var(--kg-border)] rounded-2xl">
              <HelpCircle size={32} className="mx-auto text-[var(--kg-text-soft)] mb-2" />
              <p className="text-sm font-bold text-[var(--kg-text)]">Không tìm thấy hướng dẫn nào</p>
              <p className="text-xs text-[var(--kg-text-muted)] mt-1">Vui lòng thử từ khóa tìm kiếm khác.</p>
            </div>
          )}
        </div>
      )}

      <NewbieGuideModal isOpen={isGuideModalOpen} onClose={() => setIsGuideModalOpen(false)} />
    </KgPage>
  );
}
