# BẢN THIẾT KẾ KIẾN TRÚC ỨNG DỤNG KING'S GRILL (MASTER BLUEPRINT - PHASE 6) 🏗️

Kiến trúc mới được chia thành **Các Nhóm Tính Năng (Modules)** chính và **Luồng Xác Thực (Authentication)**. Giao diện (Sidebar) sẽ thay đổi linh hoạt theo phân quyền (Role) của người dùng đăng nhập (Admin hoặc User).

---

## 🔐 LUỒNG XÁC THỰC (Authentication Flow)
*Quản lý truy cập, bảo mật tài khoản và cấp phép nhân sự.*

**1. Đăng ký tài khoản (Sign Up) ✅:**
- **Sử dụng ngay:** Nhân viên mới đăng ký tài khoản thành công sẽ có thể đăng nhập và sử dụng ứng dụng ngay lập tức mà không cần chờ Admin duyệt.
- **Bảo mật & Thông tin:** Form đăng ký chuyên nghiệp yêu cầu điền: Họ tên, Tài khoản, Mật khẩu, Số điện thoại (Zalo), Email (bắt buộc để lấy lại pass), và Ngày sinh.
- **Admin theo dõi:** Quản lý sẽ nhận được thông báo khi có người đăng ký mới để kiểm soát danh sách nhân sự.

**2. Quên mật khẩu (Forgot Password) ✅:**
- **Giao diện người dùng:** Thêm nút "Quên mật khẩu?" ở màn hình Login. User nhập Email hoặc Số điện thoại đã đăng ký.
- **Cơ chế OTP (Email/Zalo):** Hệ thống tạo mã OTP 6 số ngẫu nhiên có hiệu lực trong 5 phút và gửi về Email. User nhập đúng OTP sẽ được đổi mật khẩu mới.
- **Admin can thiệp (Force Reset):** Nếu nhân viên không rành công nghệ, Admin có thể vào trang Quản trị, chọn tài khoản đó và bấm biểu tượng "Chìa khóa". Mật khẩu sẽ tự động trở về mặc định (`Kg123456`) để nhân viên đăng nhập lại.

---

## 📑 Nhóm 1: THÔNG TIN (Information)
*Kênh truyền thông, báo cáo tổng quan và kiến thức nội bộ.*

**1. Tổng quan (Dashboard) ✅:**
- **Admin:** Bảng điều khiển (Dashboard) cơ bản cho nhà hàng. Hiển thị số lượng nhân sự đang trong ca, tỷ lệ hoàn thành checklist công việc, tổng quan đi trễ/về sớm. *(Lưu ý: Không xây dựng Analytics Hub phức tạp ở giai đoạn này, nếu cần sẽ xây dựng trong tương lai).*
- **User:** Bảng thông tin cá nhân. Hiển thị số giờ làm việc lũy kế, tiến độ hoàn thành checklist cá nhân, số lần đi trễ.

**2. Bảng tin nội bộ (NewsFeed):**
- **Admin:** Có quyền Đăng bài mới, Đính kèm ảnh/thông báo, Thích và Bình luận.
- **User:** Chỉ có quyền Đọc, Thích và Bình luận (Không được phép đăng bài mới).

**3. Món hết (Sold Out / 86) ✅:**
- **Admin & User:** Đều có quyền báo cáo các món hết nguyên liệu trong ngày.
- **Hiển thị:** Nhập tên món -> Hệ thống ghi nhận hiển thị realtime cho toàn bộ nhân viên. Thông tin bao gồm: Tên món, Tên người báo, Thời gian báo.

**4. Hòm thư Góp ý / Khiếu nại ✅:**
- **Admin:** Tiếp nhận và phản hồi các ý kiến đóng góp, khiếu nại về lương/ca làm.
- **User:** Gửi phản hồi (có thể chọn ẩn danh) về các vấn đề trong ca làm, thái độ đồng nghiệp, hoặc khiếu nại sai sót chấm công.

**5. Đào tạo & Hội nhập (Training & Onboarding Workflow) 🆕:**
- **Onboarding Checklist:** Danh sách việc cần làm cho nhân sự mới.
- **E-learning & Test:** Xem video và làm trắc nghiệm trước khi nhận ca đầu tiên.

**6. Khảo sát nội bộ (Pulse Surveys) 🆕:**
- Hiển thị pop-up ngẫu nhiên khi nhân viên Check-in.

---

## 👥 Nhóm 2: QUẢN LÝ NHÂN SỰ (HR Management)
*Quản lý danh sách và hồ sơ nhân sự.*

**1. Danh sách nhân sự & Hồ sơ (Trang riêng) ✅:**
- Một trang quản lý độc lập giúp Admin xem, lọc, tra cứu thông tin của toàn bộ nhân viên.
- Quản lý hồ sơ, hợp đồng, giấy tờ tùy thân, liên hệ khẩn cấp.
- Quản lý Tài sản & Đồng phục: Theo dõi cấp phát thẻ tên, đồng phục trong Hồ sơ nhân viên. Tự động trừ tiền (Deduction) vào Payroll nếu nhân viên nghỉ việc không trả lại tài sản.

---

## ⚙️ Nhóm 3: VẬN HÀNH (Operations)
*Công cụ hỗ trợ trực tiếp cho ca làm việc.*

**1. Chấm công ✅:**
- Giao diện thao tác Check-in / Check-out lấy tọa độ GPS và chụp ảnh xác thực.

**2. Checklist hằng ngày (Mở/Đóng quán) ✅:**
- Hệ thống tự động đẩy các công việc cần làm dựa trên ca làm việc.

**3. Bàn giao ca & Báo cáo Sự cố (Incident Report) ✅:**
- Ghi nhận tiền mặt đầu/cuối ca. Nút bấm "Báo cáo sự cố" nhanh.

---

## 📅 Nhóm 4: LỊCH LÀM (Schedules)
*Quản lý và sắp xếp thời gian làm việc.*

**1. Đăng ký ca & Lịch rảnh (Availability) ✅:**
- **Admin:** Xem toàn bộ bảng đăng ký của nhân viên để điều chỉnh & duyệt.
- **User:** Thao tác đăng ký ca cho tuần tiếp theo. Sinh viên Part-time có thể điền trước "Lịch rảnh".

**2. Chợ Đổi ca / Nghỉ phép (Tích hợp Duyệt yêu cầu) ✅:**
- **Admin:** Duyệt/Từ chối các yêu cầu đổi ca và xin nghỉ phép **trực tiếp tại đây** (Chỉ admin mới có quyền duyệt đổi ca). Hệ thống tự động cập nhật chữ "OFF" vào lịch làm chính thức.
- **User:** Tạo yêu cầu đổi ca / nghỉ phép -> chờ Admin duyệt.

**3. Lịch làm chính thức ✅:**
- **Admin:** Xem dạng Ma trận Tháng hoặc Tuần. Có thể sửa trực tiếp.
- **User:** Xem bảng lịch cá nhân/quán.

---

## 💰 Nhóm 5: CÔNG LƯƠNG (Payroll & Timekeeping)
*Quản lý số liệu làm việc, lương thưởng và kỷ luật.*

**1. Lịch sử chấm công & Tổng hợp công:**
- Xem giờ vào/ra, tổng hợp công theo số giờ hoặc mốc thời gian.

**2. Ứng lương:**
- **Admin:** Duyệt yêu cầu ứng lương, tự động link sang Bảng lương.
- **User:** Gửi form yêu cầu ứng lương.

**3. Bảng lương:**
- Bảng lương tổng quát tự động tính toán, User xem Payslip chi tiết.

**4. Kỷ luật & Đãi ngộ (Discipline, Rewards & Gamification) 🆕:**
- Ghi nhận lỗi, khen thưởng, tích điểm đổi phúc lợi.

**5. Đánh giá Năng lực & Lộ trình thăng tiến 🆕:**
- Đánh giá định kỳ làm cơ sở tăng lương/thăng cấp.

---

## 🛠 Nhóm 6: CẤU HÌNH HỆ THỐNG (System Settings - Chỉ Admin)
*Khu vực "Bộ não" của hệ thống, nơi Admin thiết lập các quy tắc tự động. Việc tập trung các cấu hình tại đây giúp Admin dễ dàng quản lý toàn bộ logic của quán.*

**1. Tổ chức & Quyền hạn:**
- **Doanh nghiệp:** Thông tin cơ bản (Tên, Địa chỉ, MST, STK, Logo).
- **Phân quyền (Roles):** Cấp quyền truy cập cụ thể cho từng tài khoản.
- **Cơ cấu tổ chức:** Sơ đồ phòng ban, loại nhân viên (Hệ số lương: Thử việc 0.8, Chính thức 1.0).
- **Quy trình Onboarding/Offboarding:** Cấu hình các bước tự động.

**2. Cấu hình Ca làm & Chấm công:**
- **Chấm công:** Đặt tọa độ GPS trung tâm, Bán kính hợp lệ.
- **Mã Ca Làm:** Định nghĩa các ca (15:00, 17:00, OFF). Quy định thời lượng tối đa. Bổ sung mã `OFF#` (Admin chủ động xếp nghỉ) và `OFF!` (Nghỉ sai quy định/Không phép).
- **Lịch làm & Ngày lễ:** Load danh sách ngày lễ, cấu hình hệ số nhân lương (x2, x3). Bật cảnh báo đăng ký ca.
- **Đăng ký ca:** Thiết lập tự động thời gian mở/đóng cổng đăng ký ca hàng tuần.
- **Quy tắc Tính công:** Cách thức làm tròn giờ làm (Giờ ra trừ Giờ vào).

**3. Cấu hình Lương & Phúc lợi:**
- **Ứng lương:** Đặt ngày chốt đăng ký, ngày giải ngân. Cấu hình tỷ lệ tối đa (VD: 30% lương tạm tính).
- **Công thức lương (Dynamic Formula Builder):** 
  - Giao diện tự thiết lập công thức bằng Kéo thả / Click chọn.
  - Biến số: `LUONG_CO_BAN`, `THUONG`, `PHU_CAP`, `NGAY_CONG`, `GIO_OT`...
  - Lưu công thức dưới dạng JSON để tính toán tự động. Có nút "Mở khóa" bảo mật để tránh sửa nhầm.
- **Quản lý Mức lương:** Bảng ma trận theo dõi mức lương nhân viên theo từng tháng.
- **Phụ cấp, Thưởng & Khấu trừ:** 
  - Khai báo Phụ cấp (Tiền ăn, xăng xe, quy tắc chia tỷ lệ).
  - Khai báo Khấu trừ (Phạt đi trễ, quên chấm công, đền bù).
  - Cấu hình hệ số tăng ca, Thưởng chuyên cần.
