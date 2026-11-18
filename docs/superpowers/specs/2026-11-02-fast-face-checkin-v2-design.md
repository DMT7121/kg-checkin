# Thiết Kế Kỹ Thuật (Spec): Hệ Thống Chấm Công Nhận Diện Khuôn Mặt Siêu Tốc v2 (Chạy Song Song v1)

- **Ngày lập:** 2026-11-02
- **Dự án:** King's Grill Staff OS (`kg-checkin`)
- **Trạng thái:** Đã hoàn thiện rà soát kỹ thuật (Builder Check) — Chờ phê duyệt để lập kế hoạch thi công (`writing-plans`)

---

## 1. Mục Đích & Bối Cảnh Nghiệp Vụ (Intent & Why)

Tại nhà hàng King's Grill, vào giờ giao ca cao điểm hoặc khuya muộn (sau `00:00`), việc từng nhân viên phải tự mở máy, đăng nhập, canh khung chụp ảnh, bấm xác nhận Vào/Ra gây mất thời gian và dễ chọn nhầm `Vào ca` / `Ra ca`.

Phiên bản **Chấm công Face ID Siêu tốc (v2)** được xây dựng chạy **song song hoàn toàn với Bản hiện tại (v1)** để giải quyết 4 bài toán vận hành cốt lõi:
1. **Chấm công 0 chạm (`< 0.4 giây`)**: Đưa mặt vào màn hình full-screen trên điện thoại/máy tính bảng là tự nhận diện danh tính, tự suy luận lượt `Vào 1 / Ra 1 / Vào 2 / Ra 2`, tự ghi nhận công và tự chụp + tải ảnh minh chứng ngầm lên Google Drive (điền link Cột G như cũ).
2. **Một thiết bị chấm liên tục cho nhiều nhân viên**: Hỗ trợ cả khi đang đăng nhập bất kỳ tài khoản nào lẫn nút **"Trạm Face ID Nhanh"** mở tự do ngay ngoài màn hình Đăng nhập cho mọi thiết bị đứng trong bán kính GPS `25m` tại quán (không cần Quản lý kích hoạt máy trạm trước).
3. **Chống gian lận & chống bấm đúp**: Bắt buộc đăng ký đủ **5 góc mặt**, tích hợp AI chống đưa ảnh/điện thoại chụp hộ, đối chiếu lại vector khuôn mặt ngay trên Server, chống 1 người đăng ký khuôn mặt vào 2 tài khoản, và khóa **30 phút theo từng nhân viên** (không khóa chéo người đứng sau).
4. **Đồng nhất 100% sổ cái Google Spreadsheet hiện tại**: Không tạo file mới, không phá vỡ công thức `📊 TỔNG HỢP ✔️CHẤM CÔNG`, quy tắc ca đêm trước `06:00` sáng hay luồng tính lương `Payroll`.

---

## 2. Mục Tiêu, Phi Mục Tiêu & Chống Lỗi (Goals, Non-Goals & Anti-Goals)

### 2.1. Mục tiêu (Goals)
- Công tắc chuyển đổi tức thì `Chấm Thủ Công (v1)` ↔ `Face ID Nhanh (v2)` ngay trên trang Chấm công của mọi tài khoản, cộng thêm nút **"Trạm Face ID Nhanh"** mở tự do theo GPS (`<= 25m`) ở màn hình Đăng nhập.
- Thu thập sinh trắc học **5 góc khuôn mặt** (Thẳng, Trái, Phải, Ngẩng, Cúi) với vòng dẫn hướng 3D trực quan; nhân viên tự đăng ký lần đầu (khi đã đăng nhập tài khoản của mình), muốn đổi/đăng ký lại phải được Quản lý (Admin) mở khóa.
- Đồng bộ nhãn lượt chấm trong ngày công (`06:00` hôm nay → `05:59` sáng mai) cho **cả v1 và v2**: `Vào 1` → `Ra 1` → `Vào 2` → `Ra 2`; chặn từ lượt thứ 5. Ở bản **v1 Thủ công**, vẫn giữ tùy chọn ghi đè *"Ra 1 / Ra 2 (Quên chấm Vào)"* có xác nhận như hiện tại.
- Mọi lượt chấm trước `06:00` sáng tự động quy về `Ra 1` hoặc `Ra 2` của ca ngày hôm trước và tổng hợp chính xác tuyệt đối trên `📊 TỔNG HỢP ✔️CHẤM CÔNG` & `Timesheet`.
- Khóa chống chấm lặp **30 phút theo từng mã nhân viên (`username`)** trên cả Client, Cloudflare Edge D1 và GAS Backend.
- **Bảo vệ tiền lương nhân viên khi quên chấm đầu ca**: Ở chế độ 0 chạm (Lần 1 = `Vào 1`), nếu giờ chấm lệch `> 120 phút` so với giờ bắt đầu ca đã duyệt (nghi vấn quên chấm lúc vào ca rồi quét mặt lúc ra về), hệ thống **KHÔNG tự động ghi phiếu trừ tiền phạt vào `BonusPenalty`**, mà gắn cờ `"Nghi quên chấm đầu ca - Chờ đối soát"` để Quản lý kiểm tra công bằng.
- Trong khung bắt buộc đăng ký lịch (`Thứ 5 00:00 -> Thứ 7 17:00`): bản v1 giữ nguyên chặn cứng `SCHEDULE_REQUIRED`; bản v2 **vẫn ghi nhận chấm công** để không tắc hàng chờ nhưng bật cảnh báo nổi + âm thanh nhắc nhân viên mở máy cá nhân đăng ký lịch tuần sau.
- Tự động cắt khung hình nét nhất lúc khớp khuôn mặt, đóng dấu Watermark chuẩn King's Grill, tải ngầm lên Google Drive, cập nhật công thức `=HYPERLINK("..."; "📷 Xem ảnh")` vào Cột G và gửi Email xác nhận kèm link ảnh sau khi tải Drive xong.

### 2.2. Phi mục tiêu (Non-Goals)
- Không tích hợp đầu đọc phần cứng vật lý ZKTeco/Hikvision (toàn bộ chạy trên trình duyệt di động/tablet).
- Không thay đổi công thức tính lương, thưởng/phạt cơ bản, đăng ký ca hay cấu trúc cột của các trang tính hiện hữu (`DATA`, `✔️CHẤM CÔNG`, `📊 TỔNG HỢP ✔️CHẤM CÔNG`, `Tháng MM/YYYY`).

### 2.3. Điều kiện cấm tuyệt đối (Anti-Goals)
- **Không dùng dịch vụ AI đám mây trả phí** hoặc gửi ảnh khuôn mặt liên tục sang API bên thứ ba.
- **Không nhận diện nhầm người** (False Accept) hoặc cho phép dùng ảnh chụp màn hình điện thoại khác để chấm hộ.
- **Không phạt đi trễ nhầm trên lượt `Vào 2`** theo giờ bắt đầu của ca sáng (`Vào 1`), và **không tự trừ phạt tự động hàng trăm nghìn đồng** khi lệch `> 120 phút` do quên chấm đầu ca.
- **Không làm rơi dữ liệu trên `📊 TỔNG HỢP ✔️CHẤM CÔNG`** do bộ lọc cũ chỉ tìm chuỗi `'Vào ca'` / `'Ra ca'`.

---

## 3. Ràng Buộc Hệ Thống & Thiết Kế (Constraints)

1. **Design DNA (`Warm Hospitality Super-App v4.0.0` — `.design-dna/dna.json`)**:
   - Font: `Be Vietnam Pro` (giao diện tiếng Việt) + `JetBrains Mono` (`font-variant-numeric: tabular-nums` cho đồng hồ, bộ đếm 30 phút, khoảng cách GPS, độ khớp `%`).
   - Bảng màu: Nền tối chuyên dụng cho Camera `#0D1015`, bề mặt thẻ HUD đặc `#0B1F33` / `#161A22` (**không dùng `backdrop-blur` glassmorphism** theo đúng `glassmorphismAllowed: false`), điểm nhấn `#C8432B` / `#E05238`, trạng thái hợp lệ `#10B981`, cảnh báo `#D97706`.
   - Bộ icon duy nhất: `lucide-react`. Vùng chạm tối thiểu trên di động `>= 44x44px`. Hỗ trợ `prefers-reduced-motion`.
2. **Đồng bộ GAS song hành**: Mọi chỉnh sửa trong `gas/*.gs` phải nằm gọn trong các tệp chuẩn đồng bộ sang `G:/04_HR_Attendance_And_Payroll/GAS BẢNG CHẤM CÔNG` thông qua `npm run sync:gas` và vượt qua 100% bộ kiểm thử `npm test`.
3. **Bảo mật Trạm Kiosk Mở Tự Do Ngoài Màn Hình Login**:
   - Vì nút "Trạm Face ID Nhanh" mở tự do không cần Quản lý nhập PIN kích hoạt trước:
     1. Các API phục vụ Trạm (`GET_FACE_PROFILES`, `GET_KIOSK_ATTENDANCE_STATE`) bắt buộc kiểm tra tọa độ GPS hợp lệ gần nhà hàng và **chỉ trả dữ liệu tối thiểu** (không bao giờ lộ mật khẩu, SĐT, email, lương hay lịch sử ngoài 24h; giữ nguyên bảo mật nghiêm ngặt của `GET_DATA` và `GET_CHECKIN_LOGS`).
     2. Khi gửi `CHECK_IN_OUT` với `checkinMode: 'v2_face'`, trình duyệt gửi kèm vector khuôn mặt trực tiếp `liveVectorB64` (`512 bytes` Int8); **cả Cloudflare Edge và GAS Backend đều tính lại Cosine Similarity trên máy chủ (`>= 0.60`)** đối chiếu với hồ sơ gốc của nhân viên đó để chặn đứng hành vi giả mạo gói tin API từ xa.

---

## 4. Các Phương Án Đã Đánh Giá & Lựa Chọn Đã Chốt (Approaches)

| Phương án | Mô tả kỹ thuật | Đánh đổi (Tradeoffs) | Quyết định |
| :--- | :--- | :--- | :--- |
| **Phương án A (Đã chọn)** | **MediaPipe Tasks Vision (`FaceLandmarker` 478 điểm 3D) + `onnxruntime-web` (`MobileFaceNet w600k_mbf` ArcFace 512-D INT8 + `MiniFASNetV2` Anti-Spoofing)** tự lưu tĩnh trong `public/models/face-v2/` + `CacheStorage` trình duyệt | Cần viết bước căn chỉnh Affine 5 điểm (`112x112`) chuẩn ArcFace (~60 dòng toán ma trận thuần TS), đổi lại đạt tốc độ `25–45ms`, dẫn hướng 5 góc cực mượt ở 60 FPS và độ chính xác khuôn mặt người Việt cao nhất (`~99.5%+`), miễn phí 100% | **ĐÃ CHỌN** |
| **Phương án B** | **`@vladmandic/human`** (TensorFlow.js tích hợp sẵn `faceres` + `antispoof`) | Gói gọn 1 thư viện nhưng thời gian biên dịch WebGL shader lần đầu trên điện thoại Android tầm trung lâu hơn và độ phân biệt góc nghiêng châu Á kém hơn ArcFace `w600k_mbf` | Loại |
| **Phương án C** | **`face-api.js` / `@vladmandic/face-api`** (mạng `dlib` 128 chiều cũ) | Dễ gọi API nhưng không có mô hình chống giả mạo, chậm và dễ nhận diện sai khi thiếu sáng/đeo kính | Loại |

### Định hướng bố cục giao diện Camera Full-Screen (Chốt Hướng 1)
- **Hướng 1 — Architectural HUD Viewfinder (Chốt áp dụng)**: Video full-screen `100dvh`, thanh trạng thái đặc gọn sát mép trên (Nút chuyển `v1/Đóng`, Trạng thái GPS + Đồng hồ `JetBrains Mono`), khung định vị sinh trắc học dạng cung tròn kỹ thuật ở tâm màn hình, và khay kết quả nổi đặc màu `#161A22` ở cạnh dưới tự thu gọn sau `2.8s` để không che camera của người tiếp theo.

---

## 5. Thiết Kế Chi Tiết Từng Phân Hệ (Detailed Architecture)

### 5.1. Lõi Sinh Trắc Học Trên Thiết Bị (`src/services/faceRecognitionV2.ts`)

1. **Tài nguyên mô hình miễn phí đặt tại `public/models/face-v2/`** (tự động lưu bền vững vào `CacheStorage` tên `kg-face-models-v2`):
   - `face_landmarker.task` (MediaPipe Face Landmarker, Apache-2.0): phát hiện khuôn mặt + 478 điểm 3D + ma trận xoay đầu `facialTransformationMatrixes` (`yaw`, `pitch`, `roll`).
   - `w600k_mbf_q8.onnx` (InsightFace MobileFaceNet ArcFace 512 chiều lượng tử hóa INT8): trích xuất vector đặc trưng 512 chiều chuẩn hóa L2 (`Float32Array(512)`).
   - `minifasnet_v2.onnx` (Silent-Face-Anti-Spoofing `80x80` scale `2.7`): chấm điểm khuôn mặt thật (`liveScore` từ `0.0 -> 1.0`).
   - Cấu hình `onnxruntime-web`: dùng WASM SIMD (`numThreads = 1` mặc định để tương thích 100% iOS Safari / Android WebView mà không đòi header `Cross-Origin-Isolated` gây chặn ảnh Google Drive).

2. **Căn chỉnh Affine 5 điểm chuẩn ArcFace (`alignFace112`)**:
   - Từ 478 điểm mốc MediaPipe, trích xuất 5 tâm chuẩn: Tâm mắt trái, Tâm mắt phải, Đỉnh mũi (`#1`), Khóe miệng trái (`#61`), Khóe miệng phải (`#291`).
   - Giải phép biến đổi đồng dạng 2D (Umeyama Similarity Transform) ánh xạ 5 điểm này về tọa độ chuẩn `112x112` của ArcFace:
     `[[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]]`.
   - Chuẩn hóa từng kênh `(R, G, B)` theo `(val - 127.5) / 127.5` thành tensor `[1, 3, 112, 112]`.

3. **Kiểm tra Chống giả mạo Kép (Dual Anti-Spoofing)**:
   - **Lớp 1 (Passive Texture ONNX)**: Cắt vùng mặt mở rộng `2.7x` về `80x80` đưa qua `minifasnet_v2.onnx` → yêu cầu `liveScore >= 0.72`.
   - **Lớp 2 (3D Geometry & Micro-Motion)**: Độ sâu tương đối trục `Z` giữa chóp mũi và hai gò má/tai từ lưới 478 điểm nằm trong ngưỡng khuôn mặt 3D thật, cộng biến thiên vi chuyển động tự nhiên giữa các khung hình liên tiếp (loại bỏ ảnh phẳng tĩnh).

4. **Thu thập 5 Góc Khuôn Mặt (`src/components/FaceEnrollmentModal.tsx`)**:
   - 5 bước tuần tự tự động chụp khi giữ ổn định `~350ms` đạt ngưỡng nét & độ sáng `[45..235]`:
     1. **Nhìn thẳng**: `|yaw| <= 9°` và `|pitch| <= 9°`
     2. **Quay nhẹ sang Trái**: `yaw` thuộc `[-30°, -12°]`
     3. **Quay nhẹ sang Phải**: `yaw` thuộc `[+12°, +30°]`
     4. **Ngẩng nhẹ đầu**: `pitch` thuộc `[+9°, +25°]`
     5. **Cúi nhẹ đầu**: `pitch` thuộc `[-25°, -9°]`
   - **Kiểm tra tính nhất quán nội bộ**: Mọi cặp vector trong 5 góc vừa chụp phải có `cosineSimilarity >= 0.52`.
   - **Chống đăng ký trùng người chéo tài khoản (Anti-Duplicate Identity)**: So sánh vector trung bình vừa thu thập với toàn bộ hồ sơ khuôn mặt của các nhân viên khác đang có (kiểm tra cả ở Client lẫn Server trong `ENROLL_FACE_PROFILE`); nếu `maxCosineSim >= 0.68` với một nhân viên khác → **từ chối lưu** ngay lập tức.
   - **Định dạng nén lưu trữ**: 5 vector × 512 số thực được lượng tử hóa sang `Int8Array` (`[-127..127]`) mã hóa Base64 → dung lượng chỉ **`~3.45 KB` / nhân viên**.

5. **Thuật toán So khớp 1:N Siêu tốc & Chống nhận nhầm**:
   - Chỉ xét các hồ sơ nhân sự đang hoạt động (`employmentStatus !== 'resigned' && employmentStatus !== 'suspended'`).
   - Với mỗi nhân viên `E` có 5 vector góc $v_1 \dots v_5$ và vector tâm chuẩn hóa $v_{\text{centroid}}$:
     $$\text{score}(u, E) = 0.65 \cdot \max_{k=1..5} \cos(u, v_k) + 0.35 \cdot \cos(u, v_{\text{centroid}})$$
   - Điều kiện chốt nhận diện thành công:
     1. Khuôn mặt chính rõ nét gần nhất chiếm chiều rộng `>= 22%` khung hình.
     2. `liveScore >= 0.72` (vượt qua kiểm tra chống ảnh giả).
     3. `score(u, E_best) >= 0.62` **VÀ** khoảng cách an toàn với người giống thứ nhì `score(u, E_best) - score(u, E_second) >= 0.08`.
     4. Khớp đồng nhất cùng 1 `username` liên tiếp tối thiểu **3 khung hình kiểm tra (`~150–220ms`)**.

---

### 5.2. Lưu Trữ Kép Trên Spreadsheet Hiện Tại & Cloudflare D1

1. **Trang tính ẩn `CONFIG_FACE_ID` trên cùng Spreadsheet hiện tại**:
   - Tên trang tính: **`CONFIG_FACE_ID`** (khớp tự động tiền tố bảo vệ `CONFIG_` trong [`ControlCenterService.gs`](file:///g:/04_HR_Attendance_And_Payroll/kg-checkin-main/gas/ControlCenterService.gs#L148), tự động `sheet.hideSheet()` khi khởi tạo).
   - Cấu trúc 9 cột (`A1:I1`):
     `Username | Fullname | VectorsInt8B64 | AnglesCount | ModelVersion | SampleImageUrl | EnrolledAt | UpdatedBy | IsLocked`
   - Quy tắc khóa bảo vệ (`IsLocked = TRUE` ngay sau khi đăng ký xong lần đầu):
     - Chỉ tài khoản đã đăng nhập mới gọi được `ENROLL_FACE_PROFILE` cho chính `username` của mình (hoặc Admin đăng ký cho nhân viên).
     - Nếu `IsLocked === TRUE` và người gọi không phải Admin → chặn ghi đè.
     - Admin có quyền gọi `RESET_FACE_PROFILE` (nằm trong `ADMIN_ONLY_ACTIONS` tại Edge & `requireAdminActor` tại GAS) để mở khóa/xóa cho nhân viên đăng ký lại khi thay đổi ngoại hình lớn.

2. **Bảng Cloudflare Edge D1 `edge_face_profiles` (`functions/api.js` + `migrations/0002_face_profiles.sql`)**:
   - Đồng bộ write-through với `CONFIG_FACE_ID` và hỗ trợ fallback đầy đủ trên D1 nếu GAS chưa kịp deploy.
   - Giới hạn tốc độ (Rate Limit nhẹ trên Edge theo IP cho `CHECK_IN_OUT` Kiosk) + kiểm tra khớp vector `liveVectorB64` trên máy chủ (`score >= 0.60`) trước khi ghi nhận lượt chấm `v2_face`.

---

### 5.3. Máy Trạng Thái Chuẩn Hóa `Vào 1 / Ra 1 / Vào 2 / Ra 2`, Ca Đêm `< 06:00` & Khóa 30 Phút

Module dùng chung `src/utils/attendanceSequence.ts` (đồng bộ logic với `functions/api.js` và `gas/Handlers.gs`):

1. **Hàm phân loại nhãn thống nhất (tương thích 100% dữ liệu lịch sử & dữ liệu mới)**:
   - `isCheckInLabel(type)`: khớp `/^\s*(vào(\s+ca)?(\s*[1-9])?|in)\b/i`.
   - `isCheckOutLabel(type)`: khớp `/^\s*(ra(\s+ca)?(\s*[1-9])?|out)\b/i`.

2. **Quy tắc xác định lượt chấm kế tiếp (`resolveNextAttendancePunch`)** theo giờ Việt Nam (`GMT+7`):
   - **Bước A — Kiểm tra Cooldown 30 phút (`30 * 60 * 1000 ms`) theo từng `username`**:
     - Tìm lượt chấm hợp lệ gần nhất của đúng nhân viên đó (từ cả `logs` máy chủ/D1 và bản đồ cục bộ `kg_user_cooldown_v2[username]`).
     - Nếu `0 <= nowMs - lastPunchMs < 30 * 60 * 1000` → trả về `blockedReason: 'COOLDOWN_30M'`, kèm `remainingSeconds` và thông tin lượt vừa chấm.
   - **Bước B — Phân nhánh theo mốc `06:00:00` sáng**:
     - **Trường hợp 1: Giờ hiện tại `< 06:00` (`00:00:00` – `05:59:59` của ngày lịch `D`)**:
       - Thuộc ca làm của **ngày hôm trước (`D - 1`)**, khung truy vấn từ `06:00:00` ngày `D - 1` đến hiện tại.
       - Đếm các lượt **Ra** (`isCheckOutLabel`) trong chu kỳ `D - 1`:
         - `outCount === 0` → **`Ra 1`** (kể cả khi hôm qua quên chấm `Vào 1`).
         - `outCount === 1` → **`Ra 2`**.
         - `outCount >= 2` → Chặn với `blockedReason: 'MAX_4_PUNCHES'`.
     - **Trường hợp 2: Giờ hiện tại `>= 06:00` (`06:00:00` – `23:59:59` của ngày lịch `D`)**:
       - Lọc các lượt chấm của nhân viên từ `06:00:00` ngày `D` đến hiện tại:
         - Chưa có lượt nào → **`Vào 1`**
         - Lượt cuối là `Vào 1` (hoặc 1 lượt đầu tiên) → **`Ra 1`**
         - Lượt cuối là `Ra 1` (hoặc 2 lượt) → **`Vào 2`**
         - Lượt cuối là `Vào 2` (hoặc 3 lượt) → **`Ra 2`**
         - Đã có `Ra 2` (hoặc `>= 4` lượt) → Chặn với `blockedReason: 'MAX_4_PUNCHES'`.
     - **Ngoại lệ thủ công duy nhất ở Bản v1 (`manualForgotInOverride`)**: Ở giao diện v1 (Chụp xác nhận), nhân viên vẫn có nút chọn thủ công *"Chuyển sang Ra 1 (Do quên chấm Vào đầu ca)"* gửi kèm `manualOverrideOut: true` để chấm `Ra 1` ngay cả khi chưa có `Vào 1` trong ngày.

3. **Cập nhật đồng bộ toàn bộ 7 điểm xung đột + Quy tắc Phạt trễ an toàn**:
   - [`gas/Engine.gs`](file:///g:/04_HR_Attendance_And_Payroll/kg-checkin-main/gas/Engine.gs): Cập nhật `createRowData` dùng `isCheckInStatus_(status)` và `isCheckOutStatus_(status)`.
   - [`gas/Handlers.gs`](file:///g:/04_HR_Attendance_And_Payroll/kg-checkin-main/gas/Handlers.gs):
     - Nâng ngưỡng chống chấm lặp lên **`30 * 60 * 1000`** (30 phút) theo từng nhân viên.
     - **Quy tắc Phạt trễ thông minh**:
       1. Chỉ đối chiếu giờ ca gốc trên **`Vào 1`** (hoặc `'Vào ca'` đầu ngày) — **không phạt trễ trên `Vào 2`**.
       2. Nếu `5 < serverLateMins <= 120`: ghi hậu tố `(Trễ Xp)` và tính phạt tự động vào `BonusPenalty` như quy định hiện hành.
       3. Nếu **`serverLateMins > 120`** (lệch trên 2 tiếng — khả năng cao nhân viên quên chấm lúc vào ca rồi quét mặt lúc tan ca): **KHÔNG tự động ghi phiếu trừ tiền vào `BonusPenalty`**, mà gắn hậu tố `(Lệch ca >2h - Chờ đối soát)` + ghi `suspectedMissedCheckIn: true` vào JSON Cột H để Quản lý duyệt thủ công chính xác!
     - **Cổng nhắc lịch Thứ 5 – Thứ 7**: Bản v1 giữ nguyên `SCHEDULE_REQUIRED`; bản v2 (`checkinMode === 'v2_face'`) vẫn lưu chấm công và trả thêm `scheduleWarning: true, scheduleWeekDisplay` để HUD hiện cảnh báo đỏ + giọng nói nhắc đăng ký lịch.
     - Cập nhật tô màu dòng Sheet (`formatCheckInRow`, `formatEntireCheckInSheet`) và `buildEmailHtml` hỗ trợ `Vào 1..2` / `Ra 1..2`.
   - [`gas/JsonCacheService.gs`](file:///g:/04_HR_Attendance_And_Payroll/kg-checkin-main/gas/JsonCacheService.gs), [`functions/api.js`](file:///g:/04_HR_Attendance_And_Payroll/kg-checkin-main/functions/api.js), [`src/utils/helpers.ts`](file:///g:/04_HR_Attendance_And_Payroll/kg-checkin-main/src/utils/helpers.ts), [`src/pages/Dashboard.tsx`](file:///g:/04_HR_Attendance_And_Payroll/kg-checkin-main/src/pages/Dashboard.tsx), [`src/pages/ActivityHistory.tsx`](file:///g:/04_HR_Attendance_And_Payroll/kg-checkin-main/src/pages/ActivityHistory.tsx): Đồng bộ toàn bộ bộ đếm Vào/Ra sang helper mới.

---

### 5.4. Tự Động Chụp Ảnh Minh Chứng, Cập Nhật Cột G & Gửi Email Ngầm (Quyết Định Kỹ Thuật)

1. **Bước 1 — Chốt công tức thì (`< 250ms`, không nghẽn hàng chờ)**:
   - Sinh `checkinId = 'CI_V2_' + Date.now() + '_' + username`.
   - Gửi ngay `CHECK_IN_OUT` với `image: 'PENDING'`, `fastSync: true`, `sendEmailInline: false`, `checkinMode: 'v2_face'`, `liveVectorB64`, `faceConfidence`, `type`, `actualTime`.
   - Hiện ngay thẻ xác nhận xanh lá + đọc tên nhân viên + bật khóa 30 phút cho riêng `username` đó; camera tiếp tục quét ngay người kế tiếp.
2. **Bước 2 — Đóng dấu Watermark, Upload Drive Cột G & Gửi Email xác nhận bất đồng bộ**:
   - Trích xuất khung hình `<video>` sắc nét vừa khớp ra `<canvas>` ẩn (`720px`), đóng dấu Watermark chuẩn King's Grill (`renderCheckInWatermarkCanvas`) kèm độ tin cậy Face ID, nén WebP/JPEG (`~45 KB`) và đưa `UPLOAD_CHECKIN_IMAGE` (`sendEmailAfterUpload: true`) vào hàng đợi bền vững `offlineQueue.ts`.
   - Tại `handleUploadCheckinImage` (`gas/Handlers.gs`): sau khi tạo file Google Drive và ghi `=HYPERLINK("..."; "📷 Xem ảnh")` vào Cột G, nếu `payload.sendEmailAfterUpload === true` và trong JSON Cột H chưa có `emailSent: true`, máy chủ tự tra địa chỉ email của nhân viên từ bảng `DATA`, gửi biên lai email kèm link ảnh Drive thực tế, rồi đánh dấu `emailSent: true` vào JSON Cột H (đảm bảo không bao giờ gửi trùng email khi retry mạng!).

---

### 5.5. Giao Diện & Luồng Trải Nghiệm Người Dùng (UI/UX Flows)

1. **Công tắc chuyển đổi song song trong `CheckIn.tsx`**:
   - Thanh Segmented Control cao `44px` ngay đầu trang Chấm công: `Chụp Xác Nhận (v1)` ↔ `Quét Khuôn Mặt (v2)`.
   - Khi chọn `v2`, bung màn hình **Full-Screen Mobile Scanner (`FastFaceScannerV2.tsx`, `fixed inset-0 z-[70] h-[100dvh]`)** tràn viền di động, kèm nút đăng ký 5 góc mặt cho tài khoản đang đăng nhập nếu chưa có hồ sơ.
2. **Nút "Trạm Face ID Nhanh" mở tự do trên `Login.tsx`**:
   - Nằm ngay dưới biểu mẫu đăng nhập: chạm là mở ngay `FastFaceScannerV2` ở chế độ Trạm Chung (`isKioskMode = true`), tự động kiểm tra GPS `<= 25m` và cho phép cả ca nhân viên lần lượt bước qua quét mặt liên tục trên 1 máy.
3. **Bảng Quản trị Face ID cho Quản lý (Admin)**:
   - Tích hợp ngay khu vực Quản lý Nhân sự / Cài đặt Face ID cho Admin: xem danh sách ai đã đăng ký 5 góc, ai chưa đăng ký, và nút **"Mở khóa / Đặt lại Face ID"** (`RESET_FACE_PROFILE`).

---

## 6. Phần Dành Cho Kỹ Sư Thi Công Tinh Chỉnh (Left to the Builder)

- Chi tiết hàm lượng tử hóa `Float32 <-> Int8 Base64` (sai số Cosine `< 0.001`, có unit test hai chiều).
- Tinh chỉnh chu kỳ lấy mẫu khung hình AI trên di động (`~50–70ms` cho MediaPipe + chạy ONNX khi mặt vào vùng ngắm) để giữ FPS mượt và mát máy khi chạy Kiosk liên tục.
- Tiết lưu âm thanh giọng nói (`speak`) tối đa 1 lần / `15 giây` trên cùng một nhân viên đang trong thời gian chờ 30 phút để tránh lặp tiếng khi đứng gần camera.
