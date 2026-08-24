import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { hasTabPermission, getTabLabel, TabId } from '../utils/permissions';
import {
  BookOpen, Search, Check, ChevronRight, HelpCircle,
  LayoutDashboard, Camera, Calendar, DollarSign, History,
  ClipboardCheck, Repeat, ArrowLeftRight, CalendarDays, Newspaper,
  UtensilsCrossed, MessageSquareWarning, CalendarClock, Award,
  Building2, Users, KeyRound, CalendarRange, Banknote, ShieldAlert,
  ArrowLeft, CheckCircle2, GraduationCap, Sparkles
} from 'lucide-react';
import NewbieGuideModal from '../components/NewbieGuideModal';
import { KgPage, KgPageHeader, KgCard, KgInput, KgButton, KgStatusBadge, KgAlertCard } from '../components/KgDesignSystem';

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

export default function Guide() {
  const store = useAppStore();
  const { currentUser } = store;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'personal' | 'operation' | 'admin'>('all');
  const [selectedGuideId, setSelectedGuideId] = useState<TabId | null>(null);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [readGuides, setReadGuides] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kg_read_guides');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Error loading read guides', e);
      return [];
    }
  });

  // Save read state
  const toggleReadStatus = (id: string) => {
    let newRead: string[];
    if (readGuides.includes(id)) {
      newRead = readGuides.filter(g => g !== id);
    } else {
      newRead = [...readGuides, id];
    }
    setReadGuides(newRead);
    localStorage.setItem('kg_read_guides', JSON.stringify(newRead));
  };

  // Full Guide Data matching existing tabs
  const allGuides: GuideItem[] = [
    {
      id: 'dashboard',
      title: 'Bảng điều khiển Hôm nay',
      category: 'personal',
      icon: LayoutDashboard,
      summary: 'Tổng quan công việc, trạng thái chấm công, lối tắt nhanh và tin tức trong ngày.',
      description: 'Trang Hôm nay (Dashboard) là cổng thông tin chính giúp bạn nắm bắt nhanh tình hình vận hành của ca làm việc hiện tại, các đầu mục công việc cấp bách cần giải quyết, cùng nhật ký hoạt động gần đây.',
      steps: [
        'Xem ca trực hôm nay của bạn (Sáng, Tối, hoặc OFF) và trạng thái chấm công (Chưa vào ca, Đã vào ca, Đã ra ca).',
        'Theo dõi danh sách "Việc cần làm hôm nay" gồm nộp checklist việc, bàn giao ca, hoặc đăng ký lịch tuần tới.',
        'Sử dụng mục Lối tắt nhanh để truy cập nhanh các chức năng như Bảng tin, Món hết, Phiếu lương, Góp ý...',
        'Xem tóm tắt lịch sử chấm công gần đây ở cột bên phải (trên máy tính) hoặc phía dưới (trên điện thoại).'
      ]
    },
    {
      id: 'checkin',
      title: 'Chấm công bằng Face ID & GPS',
      category: 'personal',
      icon: Camera,
      summary: 'Xác thực chấm công vào ca và ra ca bằng hình ảnh khuôn mặt và vị trí địa lý.',
      description: 'Nhà hàng áp dụng công nghệ chấm công thông minh 100% trên client để tự động đối chiếu khuôn mặt (Face ID) của bạn với cơ sở dữ liệu nhân sự, đồng thời kiểm tra toạ độ GPS để đảm bảo bạn chấm công đúng tại khu vực nhà hàng.',
      steps: [
        'Mở quyền truy cập Vị trí (GPS) và Máy ảnh (Camera) cho trình duyệt khi được yêu cầu.',
        'Chọn Chấm công. Hệ thống sẽ quét vị trí và báo khoảng cách từ bạn đến tâm nhà hàng.',
        'Bấm nút "Chấm công vào ca" (hoặc "Ra ca" tương ứng).',
        'Đưa khuôn mặt vào chính giữa khung camera, nhấn nút chụp hình và chờ xử lý.',
        'Hệ thống báo "Thành công" và lưu log chấm công hợp lệ lên máy chủ.'
      ],
      tips: [
        'Vui lòng chấm công ở khu vực đủ ánh sáng, tránh đeo kính râm hoặc khẩu trang.',
        'Nếu hệ thống báo sai vị trí GPS, hãy mở Google Maps để cập nhật toạ độ chính xác rồi tải lại trang.'
      ]
    },
    {
      id: 'schedule',
      title: 'Đăng ký lịch làm tuần mới',
      category: 'personal',
      icon: Calendar,
      summary: 'Chủ động đăng ký ca làm việc mong muốn cho tuần tiếp theo.',
      description: 'Hàng tuần, nhân viên được quyền tự chủ đăng ký các ca làm việc (Ca Sáng, Ca Tối) hoặc ca nghỉ (OFF) để quản lý phê duyệt và sắp xếp lịch tổng thể cho nhà hàng.',
      steps: [
        'Truy cập phân hệ Lịch làm và chọn nút đăng ký hoặc xem biểu mẫu tuần tới.',
        'Nhấn chọn ca làm việc tương ứng cho từng ngày từ Thứ Hai đến Chủ Nhật.',
        'Đối với những ngày đăng ký OFF (nghỉ), bắt buộc phải điền Lý do nghỉ phép ở khung ghi chú.',
        'Kiểm tra kỹ thông tin ca đăng ký và bấm "Đăng ký lịch làm" để gửi lên quản lý duyệt.'
      ],
      tips: [
        'Lịch đăng ký tuần sau cần hoàn tất trước 23:59 Chủ nhật hàng tuần.',
        'Sau khi quản lý phê duyệt, bạn sẽ không tự ý sửa đổi được mà phải dùng tính năng Đổi ca.'
      ]
    },
    {
      id: 'payroll',
      title: 'Xem phiếu lương & Công làm',
      category: 'personal',
      icon: DollarSign,
      summary: 'Tra cứu chi tiết giờ công tích luỹ, mức lương cơ bản và thực lĩnh hàng tháng.',
      description: 'Phân hệ Phiếu lương cung cấp thông tin minh bạch, rõ ràng về tổng số giờ làm việc thực tế, lương cơ bản theo giờ, các khoản cộng (thưởng nóng, chuyên cần) và các khoản trừ (phạt vi phạm, tạm ứng).',
      steps: [
        'Mở phân hệ Phiếu lương trên thanh điều hướng.',
        'Chọn tháng và năm mà bạn muốn tra cứu dữ liệu lương.',
        'Xem tổng kết giờ công thực tế đã làm (quy đổi từ các ca chấm công hợp lệ).',
        'Đối chiếu các khoản Thưởng, Phạt, Ứng lương và số tiền Thực lĩnh cuối cùng.'
      ]
    },
    {
      id: 'history',
      title: 'Lịch sử chấm công chi tiết',
      category: 'personal',
      icon: History,
      summary: 'Tra cứu nhật ký vào ca/ra ca, ảnh đối chiếu và toạ độ chấm công.',
      description: 'Giúp bạn tự kiểm tra toàn bộ nhật ký chấm công của bản thân để đối chiếu với quản lý khi có sai lệch công làm.',
      steps: [
        'Chọn Lịch sử chấm công để xem danh sách log được sắp xếp theo thời gian mới nhất.',
        'Kiểm tra chính xác giờ Vào ca (IN) và Ra ca (OUT) cho từng ngày làm việc.',
        'Nhấn vào ảnh thu nhỏ để xem lại hình ảnh khuôn mặt đã chụp đối chiếu.',
        'Xem ghi chú trạng thái để biết ca làm có được ghi nhận Hợp lệ hay không.'
      ]
    },
    {
      id: 'checklist',
      title: 'Checklist công việc hàng ngày',
      category: 'operation',
      icon: ClipboardCheck,
      summary: 'Thực hiện và tích chọn báo cáo công việc đầu ca/cuối ca theo vị trí.',
      description: 'Checklist công việc được thiết lập để đảm bảo chất lượng vận hành dịch vụ của nhà hàng. Nhân viên ở các vị trí (Phục vụ, Thu ngân, Bếp, Bar) sẽ thực hiện và tích chọn các hạng mục công việc được giao trong ca trực.',
      steps: [
        'Truy cập Checklist việc để xem danh sách công việc được phân theo ca trực của bạn.',
        'Thực hiện các công việc ngoài thực tế tương ứng với từng đầu mục.',
        'Tích chọn hoàn thành công việc trên ứng dụng. Đính kèm ảnh chụp thực tế hoặc ghi chú báo cáo (nếu yêu cầu).',
        'Bấm "Nộp checklist" để báo cáo hoàn thành ca làm việc gửi đến tổ trưởng/quản lý kiểm tra.'
      ],
      tips: [
        'Hoàn thành tốt checklist giúp bạn tích lũy thêm điểm thưởng King Coins.',
        'Việc quên nộp hoặc nộp chậm checklist có thể bị trừ điểm thi đua hoặc phạt lỗi vận hành.'
      ]
    },
    {
      id: 'handover',
      title: 'Sổ bàn giao ca & Két tiền',
      category: 'operation',
      icon: Repeat,
      summary: 'Bàn giao doanh thu két tiền mặt, tài sản và các sự cố trong ca làm.',
      description: 'Phân hệ này đặc biệt quan trọng đối với Thu ngân, Tổ trưởng và Quản lý để chuyển giao trách nhiệm tài chính, kiểm đếm tiền két mặt và các vấn đề phát sinh cần lưu ý cho ca tiếp quản tiếp theo.',
      steps: [
        'Nhập số tiền két ban đầu khi nhận ca và tổng số tiền mặt kiểm đếm thực tế cuối ca.',
        'Ghi chú chênh lệch tiền mặt (nếu có) và lý do giải trình.',
        'Nhập các sự cố phát sinh trong ca làm (hỏng hóc thiết bị, phàn nàn của khách, sai lệch hoá đơn...).',
        'Ghi chú các công việc chưa hoàn thành cần ca sau theo dõi và hỗ trợ.',
        'Bấm "Gửi bàn giao ca" để lưu thông tin vào hệ thống sổ bàn giao điện tử.'
      ]
    },
    {
      id: 'swap',
      title: 'Yêu cầu đổi ca & Đơn xin nghỉ',
      category: 'operation',
      icon: ArrowLeftRight,
      summary: 'Gửi yêu cầu trao đổi ca làm với đồng nghiệp hoặc gửi đơn xin nghỉ phép.',
      description: 'Khi bạn có việc bận đột xuất và không thể làm việc theo lịch đã xếp, hãy dùng tính năng Đổi ca để hoán đổi ca làm với đồng nghiệp khác hoặc gửi đơn xin nghỉ phép trực tiếp lên Ban quản lý.',
      steps: [
        'Vào phân hệ Đổi ca và nhấn nút "Tạo yêu cầu mới".',
        'Chọn Ngày làm việc và Ca làm việc mà bạn muốn đổi/xin nghỉ.',
        'Chọn hình thức: "Đổi ca với nhân viên khác" hoặc "Xin nghỉ phép (Gửi Admin)".',
        'Nếu đổi ca: Chọn tên đồng nghiệp muốn hoán đổi. Nếu xin nghỉ: Gửi trực tiếp cho ADMIN.',
        'Nhập lý do đổi ca/xin nghỉ rõ ràng và nhấn "Gửi yêu cầu".',
        'Chờ đồng nghiệp bấm Đồng ý (nếu đổi ca) và Quản lý phê duyệt để lịch làm việc mới chính thức được cập nhật.'
      ]
    },
    {
      id: 'roster',
      title: 'Lịch làm việc tổng nhà hàng',
      category: 'personal',
      icon: CalendarDays,
      summary: 'Xem lịch trực tuần của tất cả nhân sự tại các vị trí trong nhà hàng.',
      description: 'Lịch tổng (Roster) cung cấp cái nhìn toàn cảnh về phân bổ nhân sự hàng ngày để nhân viên chủ động phối hợp làm việc và hỗ trợ lẫn nhau.',
      steps: [
        'Mở Lịch tổng để xem bảng phân ca của tuần hiện tại.',
        'Sử dụng ô tìm kiếm để tra cứu nhanh lịch trực của một đồng nghiệp cụ thể.',
        'Lọc lịch làm việc theo vị trí phòng ban (Phục vụ, Thu ngân, Bếp, Bar...) để theo dõi dễ dàng hơn.'
      ]
    },
    {
      id: 'news',
      title: 'Bảng tin & Thông báo nội bộ',
      category: 'personal',
      icon: Newspaper,
      summary: 'Đọc các chính sách mới, thông báo vận hành và hoạt động thi đua.',
      description: 'Bảng tin là nơi truyền tải mọi thông tin chính thống từ Ban quản lý nhà hàng. Bạn nên cập nhật bảng tin mỗi ngày trước khi vào ca.',
      steps: [
        'Mở Bảng tin để đọc các bài viết, thông báo mới nhất.',
        'Bấm nút Thích (Like) để tương tác và xác nhận đã nắm được thông tin bài viết.',
        'Bình luận bên dưới bài viết để hỏi đáp, trao đổi chuyên môn hoặc chúc mừng đồng nghiệp.'
      ]
    },
    {
      id: 'soldout',
      title: 'Báo cáo món hết trong ngày',
      category: 'operation',
      icon: UtensilsCrossed,
      summary: 'Cập nhật danh sách món ăn/nước uống đã hết để phục vụ order chuẩn xác.',
      description: 'Tránh trường hợp nhân viên order món ăn đã hết cho khách, bộ phận bếp/bar hoặc phục vụ cần cập nhật nhanh các món đã hết lên hệ thống để thu ngân và phục vụ nắm thông tin.',
      steps: [
        'Vào mục Món hết để tra cứu các món ăn/thức uống đang tạm hết.',
        'Để báo hết món mới: Nhấn nút "Báo món hết".',
        'Chọn tên món cần báo hết từ danh sách thực đơn của nhà hàng.',
        'Nhấn "Xác nhận báo hết". Món sẽ hiển thị lập tức trên trang chủ Hôm nay của toàn bộ nhân sự.',
        'Khi nguyên liệu được nhập về đầy đủ: Quản lý hoặc Thu ngân sẽ bấm nút Xoá khỏi danh sách báo hết để đưa món về trạng thái phục vụ bình thường.'
      ]
    },
    {
      id: 'training',
      title: 'Đào tạo nghiệp vụ & SOP',
      category: 'operation',
      icon: CalendarClock,
      summary: 'Học tập quy trình chuẩn, công thức món và kỹ năng nghiệp vụ.',
      description: 'Phân hệ cung cấp kho tài liệu đào tạo nội bộ bao gồm Quy trình vận hành tiêu chuẩn (SOP), menu mô tả món ăn, quy trình phục vụ khách hàng và công thức pha chế đồ uống.',
      steps: [
        'Mở mục Đào tạo để truy cập thư viện tài liệu của nhà hàng.',
        'Lựa chọn danh mục tài liệu phù hợp với vị trí chuyên môn của bạn.',
        'Đọc kỹ các bước hướng dẫn, hình ảnh minh hoạ và lưu ý kỹ năng nghiệp vụ.',
        'Áp dụng các kiến thức đã học vào ca làm thực tế để nâng cao chất lượng dịch vụ.'
      ]
    },
    {
      id: 'feedback',
      title: 'Gửi góp ý & Đóng góp ý kiến',
      category: 'personal',
      icon: MessageSquareWarning,
      summary: 'Gửi ý kiến phản hồi ẩn danh hoặc công khai tới Ban quản lý.',
      description: 'Giúp bạn tự do đóng góp ý kiến cải tiến quy trình vận hành, nâng cấp cơ sở vật chất hoặc phản ánh các vấn đề phát sinh tại nhà hàng trực tiếp tới quản lý cao nhất.',
      steps: [
        'Vào mục Góp ý và nhập nội dung ý kiến đóng góp.',
        'Chọn danh mục góp ý phù hợp (Môi trường làm việc, Quy trình vận hành, Lương thưởng...).',
        'Bật chế độ "Gửi ẩn danh" nếu bạn muốn bảo mật hoàn toàn danh tính cá nhân.',
        'Bấm "Gửi góp ý" để chuyển tiếp thông tin tới Admin. Quản lý sẽ trả lời ý kiến của bạn công khai ngay trên giao diện.'
      ]
    },
    {
      id: 'reward',
      title: 'Điểm thưởng King Coins',
      category: 'personal',
      icon: Award,
      summary: 'Theo dõi điểm tích luỹ thi đua King Coins và lịch sử thưởng phạt.',
      description: 'King Coins là cơ chế khen thưởng nội bộ nhằm vinh danh các nhân viên xuất sắc. Bạn có thể sử dụng King Coins để quy đổi sang các phần quà giá trị của nhà hàng.',
      steps: [
        'Vào mục King Coins để kiểm tra số dư điểm thưởng hiện tại.',
        'Theo dõi bảng lịch sử cộng điểm thi đua (ví dụ: Checklist hoàn thành xuất sắc, Tăng ca đột xuất...).',
        'Xem chi tiết các quyết định trừ điểm hoặc phạt vi phạm nội quy vận hành nếu có.'
      ]
    },
    {
      id: 'advance',
      title: 'Đăng ký ứng lương tạm thời',
      category: 'personal',
      icon: Banknote,
      summary: 'Đăng ký nhận trước một khoản lương tương ứng với ngày công đã làm.',
      description: 'Hỗ trợ nhân viên giải quyết nhu cầu tài chính đột xuất. Bạn có thể ứng trước lương dựa trên số giờ công thực tế đã làm trong tháng hiện tại.',
      steps: [
        'Mở mục Ứng lương trên giao diện ứng dụng.',
        'Xem số tiền tạm ứng tối đa được phép đăng ký trong tháng.',
        'Nhập số tiền muốn ứng và điền lý do chi tiết vào đơn yêu cầu.',
        'Bấm "Gửi yêu cầu ứng lương" và chờ Quản lý/Admin xét duyệt chi khoản ứng.'
      ]
    },
    // Admin Guides
    {
      id: 'admin',
      title: 'Cấu hình Chatbot AI Trợ lý',
      category: 'admin',
      icon: Building2,
      summary: 'Thiết lập API key và prompt chỉ dẫn hành vi cho Trợ lý AI.',
      description: 'Phân hệ quản trị dành riêng cho Admin để cài đặt và tinh chỉnh hành vi phản hồi của Chatbot AI giúp nhân viên tra cứu quy trình vận hành nhà hàng.',
      steps: [
        'Truy cập mục Cấu hình AI.',
        'Nhập và cập nhật Groq API Key hoạt động của hệ thống.',
        'Điều chỉnh System Prompt (hướng dẫn cụ thể về tính cách, kiến thức và cách trả lời của AI).',
        'Nhấn Lưu cấu hình và tiến hành chat thử nghiệm hiệu quả phản hồi của AI.'
      ]
    },
    {
      id: 'hr_list',
      title: 'Quản lý danh sách nhân sự',
      category: 'admin',
      icon: Users,
      summary: 'Thêm tài khoản mới, cập nhật thông tin và điều chỉnh mức lương nhân viên.',
      description: 'Giúp Admin quản lý toàn bộ hồ sơ nhân sự của nhà hàng, phân quyền vai trò đăng nhập và điều chỉnh mức lương cơ bản theo giờ.',
      steps: [
        'Mở Danh sách nhân sự để xem toàn bộ thông tin nhân viên đang làm việc.',
        'Để tạo tài khoản mới: Nhấn "Thêm nhân viên", nhập Tên đăng nhập, Email, Vị trí làm việc, Vai trò (admin/user) và Lương cơ bản.',
        'Để sửa đổi thông tin hoặc reset mật khẩu: Chọn tài khoản nhân sự từ danh sách, thực hiện cập nhật rồi nhấn Lưu.'
      ]
    },
    {
      id: 'admin_org',
      title: 'Cấu hình định vị GPS & Tổ chức',
      category: 'admin',
      icon: KeyRound,
      summary: 'Thiết lập vị trí toạ độ GPS của nhà hàng và phân quyền chức năng.',
      description: 'Thiết lập toạ độ địa lý chính xác của nhà hàng nhằm kiểm soát tính hợp lệ của việc chấm công GPS, đồng thời quản lý phân quyền chức vụ.',
      steps: [
        'Cập nhật Tên nhà hàng và địa chỉ hiển thị chính thức.',
        'Nhập vĩ độ (Latitude) và kinh độ (Longitude) của toạ độ nhà hàng.',
        'Cài đặt bán kính giới hạn cho phép chấm công hợp lệ (ví dụ: 100 mét từ tâm nhà hàng).',
        'Thiết lập chi tiết quyền hạn hiển thị các phân hệ/tab cho từng chức danh cụ thể.'
      ]
    },
    {
      id: 'admin_shift',
      title: 'Duyệt lịch & Xếp ca tuần',
      category: 'admin',
      icon: CalendarRange,
      summary: 'Tổng hợp đăng ký của nhân viên để xếp lịch làm việc tuần chính thức.',
      description: 'Giao diện giúp Admin/Quản lý xem nhanh nhu cầu đăng ký đi làm/nghỉ phép của toàn bộ nhân viên, thực hiện phân ca trực và công bố lịch làm việc chính thức cho tuần tới.',
      steps: [
        'Xem bảng tổng hợp ca làm việc đã đăng ký của nhân viên theo từng ngày.',
        'Nhấn trực tiếp vào ô lịch của từng nhân viên để thay đổi ca trực (Sáng, Tối, OFF) hoặc thêm ghi chú ca làm.',
        'Xem thống kê tổng số lượng nhân sự trực Ca Sáng / Ca Tối trong ngày để đảm bảo nhân sự.',
        'Bấm "Công bố lịch làm" để phát hành lịch tuần chính thức ra màn hình nhân viên.'
      ]
    },
    {
      id: 'admin_payroll',
      title: 'Cấu hình công thức lương & Duyệt ứng',
      category: 'admin',
      icon: DollarSign,
      summary: 'Thiết lập phụ cấp ăn ca, hạn mức ứng lương và phê duyệt đơn ứng lương.',
      description: 'Admin quản lý các thông số tài chính tiền lương của nhà hàng và tiến hành xét duyệt chi đối với các yêu cầu ứng lương của nhân viên.',
      steps: [
        'Cập nhật công thức tính lương cơ bản và mức tiền phụ cấp ăn ca hàng ngày.',
        'Cài đặt tỷ lệ ứng lương tối đa (ví dụ: 50% tổng số tiền lương thực tế đã tích luỹ trong tháng).',
        'Xem danh sách đơn ứng lương đang chờ duyệt. Nhấp chọn đơn để xem lý do ứng.',
        'Nhấn "Duyệt ứng" hoặc "Từ chối" kèm lý do phản hồi cho nhân viên.'
      ]
    },
    {
      id: 'admin_checklist',
      title: 'Cấu hình checklist công việc',
      category: 'admin',
      icon: ClipboardCheck,
      summary: 'Quản lý danh sách việc làm cần kiểm tra cho từng ca và bộ phận.',
      description: 'Admin thiết lập danh sách các công việc bắt buộc nhân viên phải hoàn thành và nộp báo cáo trong ca trực.',
      steps: [
        'Xem danh sách các đầu mục checklist công việc hiện hành.',
        'Nhấn "Thêm công việc mới", nhập tên việc làm, chọn Bộ phận chịu trách nhiệm và Ca trực áp dụng.',
        'Thiết lập tính chất công việc: Bắt buộc hay Không bắt buộc, đính kèm ảnh minh chứng hay không.',
        'Thiết lập điểm cộng King Coins khi làm tốt hoặc điểm phạt khi vi phạm.',
        'Nhấn Lưu để checklist chính thức có hiệu lực áp dụng.'
      ]
    },
    {
      id: 'admin_analytics',
      title: 'Báo cáo & Thống kê vận hành',
      category: 'admin',
      icon: Building2,
      summary: 'Thống kê chuyên cần, tổng hợp bàn giao ca và xuất file bảng công lương.',
      description: 'Trung tâm tổng hợp dữ liệu toàn bộ hoạt động của nhà hàng. Hỗ trợ xuất dữ liệu báo cáo phục vụ công tác kế toán và đánh giá nhân sự cuối tháng.',
      steps: [
        'Theo dõi biểu đồ tỷ lệ nhân viên đi trễ, nghỉ phép và số ca chấm công.',
        'Tra cứu toàn bộ lịch sử Sổ bàn giao ca, tổng hợp két tiền mặt và sự cố vận hành.',
        'Truy xuất Bảng công làm chi tiết của từng nhân viên theo tháng.',
        'Xuất bảng lương hoàn chỉnh ra file định dạng Excel/CSV để thực hiện thanh toán lương.'
      ]
    }
  ];

  // Filter guides based on user permissions
  const allowedGuides = allGuides.filter(guide => hasTabPermission(guide.id, currentUser));

  // Further filter based on search query & category tab
  const filteredGuides = allowedGuides.filter(guide => {
    const matchesSearch = guide.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          guide.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          guide.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || guide.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const selectedGuide = allGuides.find(g => g.id === selectedGuideId);

  // Stats calculation
  const totalAllowed = allowedGuides.length;
  const totalRead = allowedGuides.filter(g => readGuides.includes(g.id)).length;
  const progressPercent = totalAllowed > 0 ? Math.round((totalRead / totalAllowed) * 105) : 0; // Caps at 100 theoretically, let's keep it safe
  const displayPercent = Math.min(progressPercent, 100);

  return (
    <KgPage>
      {selectedGuideId && selectedGuide ? (
        // Detailed Guide View
        <div className="space-y-5 animate-fade-in pb-10">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedGuideId(null)}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-850 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl transition-all active:scale-95"
            >
              <ArrowLeft size={14} /> Quay lại danh sách
            </button>
          </div>

          <KgCard className="p-5 md:p-6 space-y-6">
            {/* Guide Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-indigo-950/20 flex items-center justify-center text-blue-600 dark:text-indigo-400 flex-shrink-0">
                  <selectedGuide.icon size={24} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg md:text-xl font-extrabold text-slate-850 dark:text-white leading-tight">
                      {selectedGuide.title}
                    </h2>
                    <KgStatusBadge variant={
                      selectedGuide.category === 'admin' ? 'error' : 
                      selectedGuide.category === 'operation' ? 'info' : 'success'
                    }>
                      {
                        selectedGuide.category === 'admin' ? 'Quản trị' : 
                        selectedGuide.category === 'operation' ? 'Vận hành' : 'Cá nhân'
                      }
                    </KgStatusBadge>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Hướng dẫn chi tiết dành cho vai trò: {currentUser?.position || 'Nhân viên'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {readGuides.includes(selectedGuide.id) ? (
                  <KgStatusBadge variant="success" className="px-3 py-1 text-xs">
                    ✓ Đã học xong
                  </KgStatusBadge>
                ) : (
                  <KgStatusBadge variant="neutral" className="px-3 py-1 text-xs">
                    ○ Chưa hoàn thành
                  </KgStatusBadge>
                )}
              </div>
            </div>

            {/* Guide Body */}
            <div className="space-y-5">
              <div className="space-y-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-blue-600 dark:text-indigo-400">
                  1. Giới thiệu phân hệ
                </h3>
                <p className="text-sm text-slate-850 dark:text-slate-200 leading-relaxed font-medium">
                  {selectedGuide.description}
                </p>
              </div>

              <div className="space-y-3.5">
                <h3 className="text-sm font-black uppercase tracking-wider text-blue-600 dark:text-indigo-400">
                  2. Quy trình & Các bước thực hiện
                </h3>
                <div className="relative border-l border-slate-100 dark:border-slate-800 ml-3.5 pl-5 space-y-5 py-1">
                  {selectedGuide.steps.map((step, index) => (
                    <div key={index} className="relative">
                      {/* Step Number Dot */}
                      <div className="absolute -left-[31px] top-0.5 w-6 h-6 rounded-full bg-blue-600 dark:bg-indigo-500 text-white flex items-center justify-center text-xs font-bold shadow-sm">
                        {index + 1}
                      </div>
                      <p className="text-xs md:text-sm text-slate-850 dark:text-slate-250 font-semibold leading-relaxed">
                        {step}
                      </p>
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

            {/* Mark as read footer */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center sm:text-left">
                Đánh dấu hoàn thành giúp bạn kiểm soát nội dung đã học tập trên hệ thống.
              </p>
              <KgButton
                variant={readGuides.includes(selectedGuide.id) ? 'secondary' : 'primary'}
                size="md"
                className="w-full sm:w-auto"
                icon={readGuides.includes(selectedGuide.id) ? Check : CheckCircle2}
                onClick={() => toggleReadStatus(selectedGuide.id)}
              >
                {readGuides.includes(selectedGuide.id) ? 'Bỏ đánh dấu hoàn thành' : 'Đã hiểu & Hoàn thành'}
              </KgButton>
            </div>
          </KgCard>
        </div>
      ) : (
        // List Guide View
        <div className="space-y-5 animate-fade-in pb-10">
          <KgPageHeader
            title="Hướng Dẫn Sử Dụng"
            description="Tài liệu đào tạo và hướng dẫn vận hành hệ thống Staff OS của King's Grill."
            icon={BookOpen}
          />

          {/* Quick Onboarding Launcher Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-600/10 via-indigo-600/10 to-violet-600/10 border border-blue-500/20 dark:border-indigo-900/30 flex flex-col sm:flex-row items-center justify-between gap-3.5 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-md">
                <GraduationCap size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-[var(--kg-text)]">
                  Cẩm Nang Nhập Môn & Tiêu Chuẩn Đạt Cho Người Mới
                </h3>
                <p className="text-xs text-[var(--kg-text-muted)] font-medium mt-0.5">
                  Tóm tắt 5 bước thao tác hàng ngày, quy trình chấm công, xếp lịch và bảng tiêu chuẩn thành công.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 flex-shrink-0"
            >
              <Sparkles size={14} /> Mở Cẩm Nang Nhanh
            </button>
          </div>

          {/* Learning progress bar */}
          <KgCard className="p-4 bg-gradient-to-r from-blue-500/5 to-transparent dark:from-indigo-500/5 dark:to-transparent border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h3 className="text-sm font-extrabold text-slate-850 dark:text-white">
                Tiến trình tự học tập của bạn
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Đã hoàn thành <b>{totalRead}</b> trên tổng số <b>{totalAllowed}</b> chức năng được cấp quyền.
              </p>
            </div>

            <div className="w-full sm:w-64 space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>Tiến độ</span>
                <span className="text-blue-600 dark:text-indigo-400">{displayPercent}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500 ease-out"
                  style={{ width: `${displayPercent}%` }}
                />
              </div>
            </div>
          </KgCard>

          {/* Filters row */}
          <div className="flex flex-col md:flex-row gap-3.5 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="w-full md:w-80">
              <KgInput
                placeholder="Tìm hướng dẫn..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={Search}
              />
            </div>

            {/* Category tabs */}
            <div className="flex overflow-x-auto gap-2 pb-1 md:pb-0 scrollbar-none flex-nowrap shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap active:scale-95 select-none ${
                  selectedCategory === 'all'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400/40 scale-[1.02]'
                    : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] hover:text-[var(--kg-text)] font-bold opacity-80'
                }`}
              >
                Tất cả ({allowedGuides.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('personal')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap active:scale-95 select-none ${
                  selectedCategory === 'personal'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400/40 scale-[1.02]'
                    : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] hover:text-[var(--kg-text)] font-bold opacity-80'
                }`}
              >
                Cá nhân ({allowedGuides.filter(g => g.category === 'personal').length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory('operation')}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap active:scale-95 select-none ${
                  selectedCategory === 'operation'
                    ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400/40 scale-[1.02]'
                    : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] hover:text-[var(--kg-text)] font-bold opacity-80'
                }`}
              >
                Vận hành ({allowedGuides.filter(g => g.category === 'operation').length})
              </button>
              {allowedGuides.some(g => g.category === 'admin') && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('admin')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap active:scale-95 select-none ${
                    selectedCategory === 'admin'
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400/40 scale-[1.02]'
                      : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border border-[var(--kg-border)] hover:text-[var(--kg-text)] font-bold opacity-80'
                  }`}
                >
                  Quản lý ({allowedGuides.filter(g => g.category === 'admin').length})
                </button>
              )}
            </div>
          </div>

          {/* Guide list grid */}
          {filteredGuides.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGuides.map((guide) => {
                const GuideIcon = guide.icon;
                const isRead = readGuides.includes(guide.id);
                return (
                  <KgCard
                    key={guide.id}
                    onClick={() => setSelectedGuideId(guide.id)}
                    className="p-4 flex flex-col justify-between hover:shadow-md transition-all active:scale-[0.99] border-slate-100 dark:border-slate-800 relative overflow-hidden"
                  >
                    <div className="space-y-3">
                      {/* Header in Card */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-slate-800/40 flex items-center justify-center text-blue-600 dark:text-indigo-400 flex-shrink-0">
                            <GuideIcon size={18} />
                          </div>
                          <div>
                            <h3 className="text-xs font-black text-slate-850 dark:text-white leading-tight">
                              {guide.title}
                            </h3>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                              Phân hệ: {getTabLabel(guide.id)}
                            </span>
                          </div>
                        </div>

                        <div>
                          {isRead ? (
                            <KgStatusBadge variant="success" className="text-[9px] px-2 py-0.5">
                              ✓ Đã học
                            </KgStatusBadge>
                          ) : (
                            <KgStatusBadge variant="neutral" className="text-[9px] px-2 py-0.5">
                              Chưa học
                            </KgStatusBadge>
                          )}
                        </div>
                      </div>

                      {/* Summary */}
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                        {guide.summary}
                      </p>
                    </div>

                    {/* Bottom Action Hint */}
                    <div className="flex items-center justify-between border-t border-slate-100/50 dark:border-slate-800/50 pt-3 mt-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Thể loại: {
                          guide.category === 'admin' ? 'Quản trị' : 
                          guide.category === 'operation' ? 'Vận hành' : 'Cá nhân'
                        }
                      </span>
                      <span className="text-xs font-bold text-blue-600 dark:text-indigo-400 inline-flex items-center gap-1 hover:underline">
                        Xem chi tiết <ChevronRight size={14} />
                      </span>
                    </div>
                  </KgCard>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl">
              <HelpCircle size={32} className="mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-bold text-slate-850 dark:text-white">Không tìm thấy hướng dẫn nào</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Vui lòng thử từ khoá tìm kiếm khác.</p>
            </div>
          )}
        </div>
      )}

      {/* Newbie Guide Modal */}
      <NewbieGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />
    </KgPage>
  );
}
