export interface CukcukStep {
  step: number;
  title: string;
  image: string;
  description: string;
}

export const cukcukData: CukcukStep[] = [
  {
    step: 1,
    title: "Đăng nhập offline",
    image: "/hdsd-cukcuk/1.jpg",
    description: "Chọn tab \"Kết nối offline\". Nhập địa chỉ máy chủ 192.168.0.191:42016 (hoặc bấm kính lúp để tự động quét tìm kiếm máy chủ trong mạng). Nhập Tên đăng nhập và Mật khẩu cá nhân, sau đó bấm ĐĂNG NHẬP."
  },
  {
    step: 2,
    title: "Tìm kiếm máy chủ",
    image: "/hdsd-cukcuk/2.jpg",
    description: "Khi bấm kính lúp, ứng dụng sẽ quét các máy chủ đang chạy trong cùng mạng Wifi nội bộ (LAN). Chọn máy chủ tên ADMIN-PC (IP 192.168.0.191:42016) và bấm chọn để hoàn tất kết nối máy chủ."
  },
  {
    step: 3,
    title: "Màn hình chính Order",
    image: "/hdsd-cukcuk/3.jpg",
    description: "Giao diện chính của phân hệ Order khi chưa có đơn hàng hoạt động. Nhấn nút dấu \"+\" lớn màu xanh dương ở góc dưới cùng bên phải màn hình để bắt đầu tạo mới một order bàn."
  },
  {
    step: 4,
    title: "Chế độ hiển thị order",
    image: "/hdsd-cukcuk/3.1.jpg",
    description: "Bấm vào biểu tượng tài khoản ở góc trên bên trái thanh tiêu đề để lọc nhanh: \"Order của tôi\" (chỉ hiển thị các bàn/đơn do chính bạn phục vụ) hoặc \"Tất cả order\" (xem toàn bộ đơn hàng đang chạy của quán)."
  },
  {
    step: 5,
    title: "Bộ lọc tìm kiếm thông tin",
    image: "/hdsd-cukcuk/4.jpg",
    description: "Chọn nhanh chế độ tra cứu thông qua dropdown: Tìm bàn, Tìm order, Tìm món ăn, hoặc Tìm khách hàng. Nhập từ khóa tương ứng vào ô bên cạnh để hệ thống lọc kết quả ngay lập tức."
  },
  {
    step: 6,
    title: "Lọc trạng thái bàn phục vụ",
    image: "/hdsd-cukcuk/5.jpg",
    description: "Nhấp chọn thanh tiêu đề ở giữa màn hình để lọc nhanh danh sách bàn theo trạng thái phục vụ cụ thể: Đang phục vụ (tại quán), Yêu cầu thanh toán (YCTT), Mang về, Chờ giao hàng, hoặc Đặt trước."
  },
  {
    step: 7,
    title: "Chọn món ăn vào Order",
    image: "/hdsd-cukcuk/6.jpg",
    description: "Gõ tên hoặc mã món vào ô tìm kiếm ở đầu trang để tìm món ăn. Trong mục danh sách món \"Hay dùng\", chỉ cần nhấn nút \"+\" màu xanh lá bên cạnh món ăn tương ứng để chọn nhanh món vào order."
  },
  {
    step: 8,
    title: "Mẹo gõ viết tắt tìm món",
    image: "/hdsd-cukcuk/7.jpg",
    description: "Gõ viết tắt các chữ cái đầu của tên món ăn để tìm kiếm siêu tốc. Ví dụ: Gõ cụm \"cgct\" để tìm nhanh món \"Con gà cục tác lá chanh\". Điều này giúp tiết kiệm thời gian đáng kể lúc quán đông khách."
  },
  {
    step: 9,
    title: "Tăng giảm số lượng món",
    image: "/hdsd-cukcuk/8.jpg",
    description: "Chạm trực tiếp vào tên món để cộng nhanh thêm 1 phần, hoặc nhấn nút \"+\" / \"-\" để điều chỉnh số lượng. Bạn cũng có thể chạm vào ô số lượng ở giữa để nhập tay trực tiếp con số mong muốn."
  },
  {
    step: 10,
    title: "Giao diện Chi tiết Order",
    image: "/hdsd-cukcuk/9.jpg",
    description: "Kiểm tra số bàn, số lượng khách (nhấp icon người ở góc trên bên phải). Thêm món mới bằng nút \"+ THÊM MÓN\" (trong thực đơn) hoặc \"+ Thêm món khác\" (ngoài thực đơn). Nút mũ đầu bếp dùng để Gửi chế biến, nút đĩa mềm dùng để Lưu nháp order."
  },
  {
    step: 11,
    title: "Lựa chọn hình thức phục vụ",
    image: "/hdsd-cukcuk/10.jpg",
    description: "Nhấp chọn dropdown hình thức phục vụ ở góc trên bên trái màn hình để thiết lập nhanh chế độ phục vụ: Tại bàn (ăn trực tiếp tại quán), Gói mang về (khách mua mang đi), hoặc Nhà hàng tự giao (ship đi)."
  },
  {
    step: 12,
    title: "Menu tùy chọn mở rộng",
    image: "/hdsd-cukcuk/11.jpg",
    description: "Nhấn biểu tượng 3 chấm dọc ở góc trên cùng bên phải màn hình để mở menu phụ xem nhanh thông tin chi tiết: \"Thông tin order\" (các thông số cấu hình) hoặc \"Thông tin đặt chỗ\" liên quan đến bàn."
  },
  {
    step: 13,
    title: "Ghi chú Order mở rộng",
    image: "/hdsd-cukcuk/12.jpg",
    description: "Giao diện cho phép nhập chi tiết thông tin Khách hàng (Tên, SĐT), Ghi chú cho bếp/bar (yêu cầu chế biến riêng như không cay, không hành,...) và Ghi chú cho thu ngân (thỏa thuận thanh toán, tiền cọc trước)."
  },
  {
    step: 14,
    title: "Thao tác trên dòng món ăn",
    image: "/hdsd-cukcuk/13.jpg",
    description: "Nhấn dấu 3 chấm dọc ở cuối dòng món ăn đã chọn để: Nhập Ghi chú nhanh (ít ngọt, không đá,...), Điều chỉnh đơn giá món (chỉ dành cho Quản lý), hoặc Hủy món (cần kiểm tra bếp xem đã làm chưa và báo Quản lý)."
  },
  {
    step: 15,
    title: "Xác nhận gửi chế biến",
    image: "/hdsd-cukcuk/14.jpg",
    description: "Kiểm tra lại toàn bộ danh sách món đã gọi trong bill. Nhấn biểu tượng hình mũ đầu bếp màu xanh dương ở góc dưới cùng để chính thức gửi lệnh in chế biến món xuống quầy Bếp/Bar tương ứng."
  },
  {
    step: 16,
    title: "Món bán theo khối lượng (Cân kg)",
    image: "/hdsd-cukcuk/14.1.jpg",
    description: "Đối với các mặt hàng hải sản bán theo cân (Tôm càng, Cá bống mú, Cua, Ghẹ,...), nhân viên phải nhập chính xác khối lượng thực tế dưới dạng số thập phân (ví dụ: 0,5 kg hoặc 1,4 kg) khi order để hệ thống tự động tính tiền chính xác tuyệt đối lúc ra bill thanh toán."
  },
  {
    step: 17,
    title: "Thêm món ngoài thực đơn",
    image: "/hdsd-cukcuk/15.jpg",
    description: "Dùng khi khách gọi món ngoài menu: Nhập tên món (viết hoa chữ cái đầu), số lượng, đơn giá tự thỏa thuận, và chọn đúng bộ phận chế biến (Bếp/Bar/Pha chế) để máy in lệnh in chính xác. Bấm \"ĐỒNG Ý\" để lưu món."
  },
  {
    step: 18,
    title: "Chọn thuế suất món ngoài",
    image: "/hdsd-cukcuk/16.jpg",
    description: "Chọn mức thuế suất phù hợp cho món ăn ngoài thực đơn: Mức 8% cho các loại món ăn thông thường và đồ uống pha chế; Mức 10% dành cho bia, rượu, các loại nước ngọt đóng chai có ga, hoặc thuốc lá."
  },
  {
    step: 19,
    title: "Chọn bộ phận chế biến món",
    image: "/hdsd-cukcuk/17.jpg",
    description: "Chọn đúng bộ phận để máy in lệnh chế biến in chính xác ở các quầy: BẾP (Lẩu, chiên, xào), NƯỚNG & SASHIMI (đồ nướng, gỏi, salad trộn), PHA CHẾ (nước ép, đồ uống pha chế), RƯỢU VANG."
  },
  {
    step: 20,
    title: "Thẻ điều khiển nhanh bàn",
    image: "/hdsd-cukcuk/18.jpg",
    description: "Trên thẻ của bàn đang phục vụ, sử dụng phím tắt nhanh: nút hình đĩa ăn (nắp đậy) để kiểm/hoàn thành món đã bưng lên, nút checklist (bảng tính) để kiểm đồ dùng trước khi khách thanh toán."
  },
  {
    step: 21,
    title: "Xác nhận phục vụ món ra bàn",
    image: "/hdsd-cukcuk/19.jpg",
    description: "Khi bưng món ăn ra bàn phục vụ khách, nhân viên cần vào giao diện kiểm món và nhấp vào biểu tượng dấu Tick màu xanh lá bên phải món ăn tương ứng để xác nhận trạng thái \"Đã phục vụ món\"."
  },
  {
    step: 22,
    title: "Theo dõi trạng thái ra món",
    image: "/hdsd-cukcuk/20.jpg",
    description: "Các món ăn đã được phục vụ đủ số lượng cho khách sẽ hiển thị dấu check xanh lá ở bên trái tên món. Điều này giúp nhân viên phục vụ kiểm soát không bỏ sót món ăn nào của khách."
  },
  {
    step: 23,
    title: "Xác nhận ra món một phần",
    image: "/hdsd-cukcuk/21.jpg",
    description: "Với những món khách gọi số lượng nhiều nhưng bếp mới làm xong trước một phần (ví dụ khách gọi 2 nhưng bếp mới ra 1), nhân viên có thể chọn số lượng 1 đã phục vụ thực tế rồi nhấn Tick để ghi nhận trước."
  },
  {
    step: 24,
    title: "Kiểm đồ dùng trước khi tính tiền",
    image: "/hdsd-cukcuk/22.jpg",
    description: "Nhập số lượng đồ dùng khách trả lại vào cột \"Trả lại\" (như khăn lạnh, nước ngọt lon chưa uống). Cột \"Thực dùng\" sẽ tự động trừ đi và đây chính là số lượng thực tế in trên hóa đơn thanh toán cuối cùng của khách."
  },
  {
    step: 25,
    title: "Menu tiện ích trên Thẻ Bàn",
    image: "/hdsd-cukcuk/23.jpg",
    description: "Nhấn biểu tượng 3 chấm trên thẻ bàn để truy cập nhanh các tính năng: Gửi yêu cầu thanh toán (tính tiền), Gửi bếp/bar (gửi chế biến), Chuyển bàn (sang bàn trống), Ghép order, Hủy order hoặc Tách order."
  },
  {
    step: 26,
    title: "Xem sơ đồ bàn trực quan",
    image: "/hdsd-cukcuk/24.jpg",
    description: "Theo dõi trực quan sơ đồ bàn theo các KHU A, B, C, D, E. Trạng thái bàn hiển thị qua màu sắc: Màu xanh dương (Bàn trống sẵn sàng đón khách), Màu xám (Bàn đang phục vụ khách ăn uống), Màu cam (Bàn đã đặt trước)."
  },
  {
    step: 27,
    title: "Đồng bộ dữ liệu lên máy chủ",
    image: "/hdsd-cukcuk/25.jpg",
    description: "Tại tab Tiện ích, kiểm tra số badge đỏ bên cạnh mục \"Đồng bộ dữ liệu\". Nếu có số (ví dụ số 10 đỏ), hãy bấm để đồng bộ dữ liệu order về máy chủ ngay lập tức nhằm tránh mất dữ liệu bán hàng."
  },
  {
    step: 28,
    title: "Khắc phục lỗi đồng bộ/mất kết nối",
    image: "/hdsd-cukcuk/26.jpg",
    description: "Nếu xảy ra lỗi kết nối hoặc không đồng bộ được dữ liệu sau nhiều lần thử, hãy kéo xuống cuối tab Tiện ích và chọn \"Đăng xuất\". Sau đó kiểm tra kết nối Wifi nội bộ của quán, chọn đúng máy chủ ADMIN-PC và Đăng nhập lại."
  }
];
