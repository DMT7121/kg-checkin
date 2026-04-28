# KẾ HOẠCH NÂNG CẤP KING'S GRILL WEBAPP (PHASE 4)

Danh sách các tính năng cao cấp đã được duyệt để triển khai trong tương lai, nhằm biến webapp thành một hệ thống hiện đại, tự động và mang lại trải nghiệm WOW cho nhân viên.

## 1. Gamification & Trải Nghiệm UX (WOW Effect)
- **Hiệu Ứng Bắn Pháo Hoa & Âm Thanh (Confetti & SFX):** Khi nhân viên chấm công vào ca đúng giờ, màn hình sẽ nổ pháo hoa ăn mừng và phát âm thanh "Ting! Chúc bạn ca làm việc vui vẻ!". Nếu đi trễ, cảnh báo màu đỏ rung nhẹ (Shake effect).
- **Bảng Xếp Hạng & Kỷ Lục Chăm Chỉ (Leaderboard):** Thêm một tab `Dashboard` hiển thị "Nhân viên của tháng" hoặc "Top người đi làm đúng giờ nhất tuần" để tạo động lực.
- **Chuyển Động Siêu Mượt (Framer Motion):** Áp dụng Framer Motion làm mượt thao tác: Chuyển tab trượt ngang, nút chụp ảnh có độ nảy (spring), modal hiện lên mờ ảo (Glassmorphism).

## 2. Công Nghệ AI & Xác Thực Không Mật Khẩu
- **Nhận Diện Khuôn Mặt (AI Face Detection):** Tích hợp `face-api.js` chạy ngầm. Vẽ khung vuông màu xanh nhận diện khuôn mặt. Nút "Chụp" chỉ kích hoạt khi xác nhận có người thật (chống gian lận).
- **Đăng Nhập Sinh Trắc Học (FaceID/TouchID):** Áp dụng chuẩn WebAuthn. Nhập mật khẩu 1 lần đầu, các lần sau tự động quét FaceID/vân tay để vào app.

## 3. Tính Năng Quản Lý Nâng Cao
- **Chợ Đổi Ca & Xin Nghỉ Phép:** Khu vực riêng để xin nghỉ hoặc tìm người làm thay. Quản lý duyệt 1 chạm là hệ thống tự đổi lịch.
- **Thông Báo Đẩy (Push Notifications):** Gửi thông báo về máy nhân viên: "Sắp đến ca làm lúc 15:00" (gửi trước 30 phút), hoặc "Lịch tuần sau đã được duyệt".

---
*Ghi chú: Tài liệu này lưu trữ định hướng phát triển để tiếp tục công việc bất cứ khi nào khởi động lại dự án.*
