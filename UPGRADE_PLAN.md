# BẢN THIẾT KẾ KIẾN TRÚC ỨNG DỤNG KING'S GRILL (MASTER BLUEPRINT - PHASE 6) 🏗️

Kiến trúc mới được chia thành **5 Nhóm Tính Năng (Modules)** chính. Giao diện (Sidebar) sẽ thay đổi linh hoạt theo phân quyền (Role) của người dùng đăng nhập (Admin hoặc User).

---

## 📑 Nhóm 1: THÔNG TIN (Information)
*Kênh truyền thông, báo cáo tổng quan và kiến thức nội bộ.*

**1. Tổng quan (Dashboard):**
- **Admin:** Bảng điều khiển toàn diện cho nhà hàng. Hiển thị số lượng nhân sự đang trong ca, tỷ lệ hoàn thành checklist công việc, tổng quan tình hình đi trễ/về sớm.
- **User:** Bảng thông tin cá nhân. Hiển thị số giờ làm việc lũy kế, tiến độ hoàn thành checklist cá nhân, số lần đi trễ.

**2. Bảng tin nội bộ (NewsFeed):**
- **Admin:** Có quyền Đăng bài mới, Đính kèm ảnh/thông báo, Thích và Bình luận.
- **User:** Chỉ có quyền Đọc, Thích và Bình luận (Không được phép đăng bài mới).

**3. Món hết (Sold Out / 86):**
- **Admin & User:** Đều có quyền báo cáo các món hết nguyên liệu trong ngày.
- **Hiển thị:** Nhập tên món -> Hệ thống ghi nhận hiển thị realtime cho toàn bộ nhân viên. Thông tin bao gồm: Tên món, Tên người báo, Thời gian báo.

**4. Hòm thư Góp ý / Khiếu nại:**
- **Admin:** Tiếp nhận và phản hồi các ý kiến đóng góp, khiếu nại về lương/ca làm.
- **User:** Gửi phản hồi (có thể chọn ẩn danh) về các vấn đề trong ca làm, thái độ đồng nghiệp, hoặc khiếu nại sai sót chấm công.

**5. Đào tạo / Nội quy / Quy trình:**
- Sẽ phát triển ở các Phase tiếp theo. Nơi lưu trữ tài liệu nghiệp vụ, mô tả công việc, video hướng dẫn pha chế.

---

## ⚙️ Nhóm 2: VẬN HÀNH (Operations)
*Công cụ hỗ trợ trực tiếp cho ca làm việc.*

**1. Chấm công:**
- Giao diện thao tác Check-in / Check-out lấy tọa độ GPS và chụp ảnh xác thực (Tính năng cốt lõi hiện tại).

**2. Checklist hằng ngày (Mở/Đóng quán):**
- Hệ thống tự động đẩy các công việc cần làm dựa trên ca làm việc (Ví dụ: Ca sáng có checklist mở quán, Ca tối có checklist đóng quán). Cấu hình checklist do Admin thiết lập.

**3. Bàn giao ca & Báo cáo Sự cố (Incident Report):**
- **Admin & User:** Ghi nhận tiền mặt đầu/cuối ca (Tiền lẻ thối). Nút bấm "Báo cáo sự cố" nhanh (Ví dụ: Hư quạt, Mất điện, Khách phàn nàn) để Quản lý nhận thông báo đẩy ngay lập tức.

---

## 📅 Nhóm 3: LỊCH LÀM (Schedules)
*Quản lý và sắp xếp thời gian làm việc.*

**1. Đăng ký ca & Lịch rảnh (Availability):**
- **Admin:** Xem toàn bộ bảng đăng ký của nhân viên để điều chỉnh & duyệt. Người nào chưa đăng ký sẽ bị bỏ trống để Admin dễ dàng nhận diện và nhắc nhở. Admin cũng có thể tự đăng ký ca cho mình.
- **User:** Thao tác đăng ký ca cho tuần tiếp theo. **Đặc biệt:** Sinh viên Part-time có thể điền trước "Lịch rảnh" (Những khung giờ chắc chắn đi làm được) để Admin dễ dàng xếp ca mà không bị kẹt lịch học.

**2. Chợ Đổi ca / Nghỉ phép:**
- **Admin:** Duyệt/Từ chối các yêu cầu đổi ca và xin nghỉ phép. Khi duyệt nghỉ phép, hệ thống tự động cập nhật chữ "OFF" vào lịch làm chính thức kèm Tooltip ghi chú (Thời gian duyệt, Người duyệt).
- **User:** Tạo yêu cầu đổi ca (chờ nhân viên khác nhận -> chờ Admin duyệt). Tạo yêu cầu nghỉ phép (báo số ngày, thời gian) -> chờ Admin duyệt.

**3. Lịch làm chính thức:**
- *Tính năng chung:* Đánh dấu highlight các ngày lễ (có hệ số nhân lương) hoặc các ngày lễ F&B đông khách để nhân viên lưu ý.
- **Admin:** Có 2 chế độ xem:
  - *Chế độ xem Tháng:* Bảng ma trận (Cột dọc: Tên nhân viên, Cột ngang: Ngày trong tháng). Admin có thể sửa trực tiếp trên bảng này nếu thực tế có phát sinh (ốm, bỏ ca...).
  - *Chế độ xem Tuần:* Thu gọn hiển thị từ T2 - CN.
- **User:** Xem bảng lịch tháng cá nhân (hoặc toàn quán) thể hiện ca làm đã được duyệt.

---

## 💰 Nhóm 4: CÔNG LƯƠNG (Payroll & Timekeeping)
*Quản lý số liệu làm việc, lương thưởng và kỷ luật.*

**1. Lịch sử chấm công:**
- **Admin:** Hiển thị danh sách chấm công (Giờ vào/ra, vị trí, ảnh) của toàn bộ nhân viên.
- **User:** Chỉ xem được lịch sử của chính mình.

**2. Tổng hợp công:**
- **Admin & User:** Hiển thị tương tự Lịch làm, nhưng thay vì mã ca, hệ thống hiển thị 2 chế độ xem:
  - *Chế độ giờ làm:* Tính chính xác thời lượng (Giờ ra - Giờ vào). Ví dụ: 5.50 giờ.
  - *Chế độ mốc thời gian:* Thể hiện thực tế (Ví dụ: 15:00 - 22:30).

**3. Ứng lương:**
- **Admin:** Nhận thông báo và bấm Duyệt yêu cầu ứng lương. Khoản tiền này sẽ tự động link sang Bảng lương cuối tháng (nằm ở cột Khấu trừ/Ghi chú).
- **User:** Gửi form yêu cầu ứng lương. Theo dõi trạng thái (Chờ duyệt/Đã duyệt).

**4. Bảng lương:**
- **Admin:** Bảng lương tổng quát của tất cả nhân sự. Hệ thống tự động tính toán dựa trên cấu hình (Mức lương, Giờ làm, Thưởng, Phạt, Ứng lương).
- **User:** Chỉ xem được phiếu lương (Payslip) chi tiết của chính mình.

**5. Kỷ luật - Khen thưởng:**
- Ghi nhận các khoản cộng/trừ tiền. Tự động nội suy vào Bảng lương và hiển thị rõ ràng ở cột Ghi chú (Ví dụ: +200k Thưởng chuyên cần, -50k Đi trễ).

**6. Đánh giá Năng lực (KPI Review):**
- **Admin:** Bảng chấm điểm định kỳ (thái độ, chuyên môn, doanh số) để làm cơ sở Xét duyệt tăng bậc lương.
- **User:** Nhận feedback đánh giá để cải thiện kỹ năng.

---

## 🛠 Nhóm 5: CẤU HÌNH HỆ THỐNG (System Settings - Chỉ Admin)
*Khu vực "Bộ não" của hệ thống, nơi Admin thiết lập các quy tắc tự động.*

**1. Tổ chức & Nhân sự:**
- **Doanh nghiệp:** Thông tin cơ bản (Tên, Địa chỉ, MST, STK, Logo).
- **Cơ cấu tổ chức:** Sơ đồ phòng ban.
- **Loại nhân viên:** Cấu hình hệ số lương (Thử việc: 0.8, Chính thức: 1.0).
- **Quy trình Onboarding/Offboarding:** Checklist khi có nhân viên mới (Cấp tài khoản, Đào tạo nội quy) và khi nghỉ việc (Thu hồi tài khoản, Chốt lương cuối).
- **Quản lý Tài sản & Đồng phục:** Ghi nhận cấp phát đồng phục, thẻ tên, chìa khóa tủ. Tự động liên kết với Bảng lương để trừ tiền nếu nhân viên làm mất hoặc nghỉ việc không trả lại.

**2. Ca làm & Chấm công:**
- **Chấm công:** Đặt tọa độ GPS trung tâm, Bán kính hợp lệ (Đồng bộ với code hiện tại và cho phép UI chỉnh sửa).
- **Mã Ca Làm:** Định nghĩa các ca (15:00, 17:00, OFF). Quy định thời lượng tối đa (6-8 tiếng). Bổ sung mã `OFF#` (Admin chủ động xếp nghỉ) và `OFF!` (Nghỉ sai quy định/Không phép).
- **Lịch làm & Ngày lễ:** Load danh sách ngày lễ, cấu hình hệ số nhân lương (x2, x3). Bật cảnh báo đăng ký ca cho những ngày này.
- **Đăng ký ca:** Thiết lập tự động thời gian mở/đóng cổng đăng ký ca hàng tuần.
- **Quy tắc Tính công:** Cách thức làm tròn giờ làm (Giờ ra trừ Giờ vào).

**3. Lương & Phúc lợi:**
- **Ứng lương:** Đặt ngày chốt đăng ký, ngày giải ngân. Cấu hình tỷ lệ tối đa (Ví dụ: Chỉ được ứng 30% lương tạm tính). Hệ thống tự động tính lương tạm tính từ ngày 1 đến ngày 15 để làm cơ sở xét ứng lương.
- **Công thức lương (Dynamic Formula Builder):** 
  - Thay vì công thức cứng, Admin có **Giao diện tự thiết lập công thức (Kéo thả / Click chọn)**.
  - Các biến (Variables) được cung cấp sẵn: `LUONG_CO_BAN`, `THUONG`, `PHU_CAP`, `NGAY_CONG`, `GIO_OT`...
  - Các phép toán: `+`, `-`, `*`, `/`, `(`, `)`.
  - Admin bấm chọn để ghép thành chuỗi công thức (Ví dụ: `(LUONG_CO_BAN * NGAY_CONG) + THUONG + PHU_CAP`). Hệ thống lưu công thức dưới dạng JSON để tính toán tự động. Có nút "Mở khóa" bảo mật để tránh sửa nhầm.
- **Quản lý Mức lương:** Bảng ma trận theo dõi mức lương nhân viên theo từng tháng. Nhân viên có thể có 2 dòng nếu vừa có lương giờ vừa có lương cứng.
- **Phụ cấp, Thưởng & Khấu trừ:** 
  - **Khai báo Phụ cấp:** Tiền ăn, xăng xe. Thiết lập "Số ngày chuẩn" để hệ thống tự chia tỷ lệ nếu nhân viên không làm đủ tháng.
  - **Tăng ca:** Cấu hình hệ số lương cho tăng ca (Ví dụ: x1.5 ngày thường, x2 ngày lễ).
  - **Thưởng chuyên cần:** Đặt Tiêu chuẩn (Ví dụ: Làm đủ 26 ca/tháng, không đi trễ lần nào) và Mức tiền thưởng chuyên cần.
  - **Khai báo Khấu trừ:** Các quy tắc phạt đi trễ, quên chấm công, đền bù tài sản, hoặc quỹ Công đoàn (BHXH nếu có).
