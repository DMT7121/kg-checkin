# BẢN THIẾT KẾ KIẾN TRÚC ỨNG DỤNG KING'S GRILL (`v4.0.1` — 11-Hub Super-App & Edge D1) 🏗️

Kiến trúc hiện hành (`v4.0.1`) tổ chức ứng dụng theo mô hình **11-Hub Super-App IA** (`Warm Hospitality Edition`) với tuyến **Cloudflare Edge D1 (`/api`)** làm gateway chính, **Google Apps Script + Google Sheets/Drive** đồng bộ nền, và phân quyền chặt chẽ qua `isAdminUser(user)` (`admin` vs `tester`/`user`).

> **Trạng thái đối chiếu thực tế (`v4.0.1`):** Các nhóm chức năng cốt lõi dưới đây đã triển khai và chuẩn hóa theo `DESIGN.md`, `CORE_WEBAPP_ARCHITECTURE.md`, và `UPGRADE_PROGRESS.md`. Các mục đánh dấu `📌 Roadmap` là phần định hướng mở rộng dài hạn chưa bật chính thức.

---

## 🔐 LUỒNG XÁC THỰC & RBAC (Authentication & Access Control)
*Quản lý truy cập, bảo mật tài khoản, Face ID V2 Kiosk và cấp phép nhân sự.*

**1. Đăng ký & Đăng nhập (Sign Up / Login / Kiosk Face ID) ✅:**
- **Sử dụng ngay:** Nhân viên mới đăng ký tài khoản thành công có thể đăng nhập ngay, với `role='user'` mặc định.
- **Kiosk Face ID V2:** Đăng nhập / chấm công không chạm bằng `@mediapipe/tasks-vision` + `onnxruntime-web/wasm` (kèm cache profile zero-WASM tại `src/utils/faceProfileCache.ts`).
- **RBAC chuẩn hóa:** Tập trung tại `src/utils/permissions.ts` (`isAdminUser` chỉ cho phép `role === 'admin'`; `tester` không có quyền Admin).

**2. Quên mật khẩu (Forgot Password) ✅:**
- **Cơ chế OTP:** Gửi mã OTP 6 số có hiệu lực 5 phút qua Email để đặt lại mật khẩu.
- **Admin Reset:** Quản trị viên có thể reset mật khẩu nhân viên về mặc định trong phân hệ Nhân sự (`HrList`).

---

## 📑 Nhóm 1: THÔNG TIN (Information)
*Kênh truyền thông, báo cáo tổng quan và kiến thức nội bộ.*

**1. Tổng quan (Dashboard & Command Center) ✅:**
- **Admin:** Trung tâm điều hành ca trực hợp nhất hiển thị KPI quân số ca, cảnh báo đi trễ/vắng, Checklist/Bàn giao, Món hết, và **Hàng chờ phê duyệt thống nhất** (Bổ sung công, Đối soát lệch quỹ, Sự cố mở, Khiếu nại/ĐC lương, Đổi ca, Xin nghỉ, Ứng lương, Góp ý).
- **User:** Thẻ ca trực cá nhân với `<LiveClockDisplay />` cô lập re-render, CTA chấm công theo chu kỳ `06:00–05:59`, cảnh báo thiếu công & tiện ích nhanh.

**2. Bảng tin nội bộ (NewsFeed) ✅:**
- **Admin:** Đăng bài, đính kèm ảnh, thích và bình luận.
- **User:** Đọc, thích và bình luận (cache invalidation có mục tiêu cho `LIKE_POST`/`COMMENT_POST`).

**3. Món hết (Sold Out / 86) ✅:**
- **Admin & User (theo vị trí):** Báo cáo và theo dõi món hết thời gian thực; hiển thị live strip trực tiếp trong `WorkHub`.

**4. Hòm thư Góp ý / Khiếu nại ✅:**
- **Admin:** Lọc trạng thái/danh mục, tiếp nhận và phản hồi ý kiến.
- **User:** Gửi phản hồi ẩn danh hoặc công khai.

**5. Đào tạo & Hội nhập (Training & Onboarding Workflow) ✅:**
- Tài liệu SOP, hướng dẫn CUKCUK POS, và bài kiểm tra trắc nghiệm (ngưỡng đạt 70%, cộng điểm King Coins).

**6. Khảo sát nội bộ (Pulse Surveys) ✅:**
- Hiển thị sau khi hoàn thành chấm công mà không chồng chéo popup.

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

**4. Kỷ luật & Đãi ngộ (Discipline, Rewards & Gamification) ✅:**
- Ghi nhận thưởng/phạt (`Discipline`), theo dõi điểm King Coins (`Reward`, phần danh mục đổi quà đang ở chế độ xem trước sắp mở), và bảng xếp hạng.

**5. Đánh giá Năng lực & Phân công Khu trực (`AdminOperations` / `Operations`) ✅ / 📌 Roadmap:**
- Đánh giá nhân sự theo khu vực & ca trực đã vận hành trong `AdminOperations`; lộ trình thăng tiến mở rộng thuộc roadmap tương lai.

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
