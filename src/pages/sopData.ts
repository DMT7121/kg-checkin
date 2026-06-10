export interface SopContentItem {
  subtitle: string;
  icon: string;
  details: string;
}

export interface SopSection {
  id: string;
  title: string;
  icon: string;
  group: 'general' | 'department';
  content: SopContentItem[];
}

export const sopData: SopSection[] = [
  // --- NHÓM CHUNG ---
  { id: 'welcome', title: 'Giới Thiệu Sổ Tay', icon: 'fa-solid fa-book-open', group: 'general', content: [
      { subtitle: '1. Chào mừng đến với King\'s Grill', icon: 'fa-solid fa-handshake',
        details: `<ul>
          <li><i class="fa-solid fa-handshake"></i><span>Chào mừng bạn gia nhập đội ngũ King's Grill. Cuốn sổ tay này là tài liệu đào tạo chính thức, tổng hợp tất cả các quy trình, tiêu chuẩn và nội quy mà bạn cần nắm vững.</span></li>
          <li><i class="fa-solid fa-bullseye"></i><span><strong>Mục đích:</strong> Đảm bảo mọi nhân viên, ở mọi bộ phận, đều mang đến một trải nghiệm đồng nhất, chuyên nghiệp và xuất sắc cho khách hàng.</span></li>
          <li><i class="fa-solid fa-book-medical"></i><span>Hãy đọc kỹ, chủ động học hỏi và sử dụng sổ tay này như một công cụ tra cứu hàng ngày. Sự thành công của bạn cũng chính là sự thành công của nhà hàng.</span></li>
        </ul>` }
  ]},
  { id: 'noi-quy', title: 'Nội Quy Nhà Hàng', icon: 'fa-solid fa-shield-halved', group: 'general', content: [
      { subtitle: '1. Thời Gian Làm Việc & Nghỉ Ngơi (File 1.pdf)', icon: 'fa-solid fa-calendar-clock',
        details: `<ul>
          <li><i class="fa-solid fa-calendar-clock"></i><span><strong>Ca làm việc:</strong> Tuân thủ lịch phân công của Quản lý, đảm bảo đúng giờ. (Cần đăng ký lịch đầy đủ).</span></li>
          <li><i class="fa-solid fa-dollar-sign"></i><span><strong>Lương Lễ/Tết:</strong> Các ngày 01/05, 02/09, 01/01, Tết Nguyên Đán sẽ được tính lương theo thỏa thuận (x2, x3 hoặc khung lương riêng).</span></li>
          <li><i class="fa-solid fa-calendar-xmark"></i><span><strong>Nghỉ phép:</strong> Phải xin phép Quản lý duyệt trước 03 ngày.</span></li>
          <li><i class="fa-solid fa-thermometer-half"></i><span><strong>Nghỉ ốm:</strong> Phải có giấy xác nhận của bác sĩ và thông báo ngay cho Quản lý để sắp xếp ca.</span></li>
        </ul>` },
      { subtitle: '2. Trật Tự & Tác Phong (File 1.pdf)', icon: 'fa-solid fa-user-check',
        details: `<ul>
          <li><i class="fa-solid fa-fingerprint"></i><span><strong>Chấm công:</strong> Chấm vân tay/ứng dụng mỗi ngày. Nghiêm cấm chấm hộ hoặc gian lận.</span></li>
          <li><i class="fa-solid fa-shirt"></i><span><strong>Hình thức:</strong> Đồng phục luôn sạch sẽ, gọn gàng. Nữ trang điểm nhẹ, nam tóc tai gọn gàng.</span></li>
          <li><i class="fa-solid fa-mobile-screen-button"></i><span><strong>Sử dụng điện thoại:</strong> Chỉ sử dụng cho mục đích công việc (order, kiểm tra thông tin...). Hạn chế tối đa việc riêng.</span></li>
          <li><i class="fa-solid fa-lock"></i><span><strong>Khu vực hạn chế:</strong> Chỉ vào khi được phân công (VD: Bếp, Kho, Quầy Thu ngân).</span></li>
          <li><i class="fa-solid fa-trash-can"></i><span><strong>Vệ sinh chung:</strong> Giữ gìn vệ sinh chung, tuyệt đối không xả rác bừa bãi.</span></li>
          <li><i class="fa-solid fa-briefcase"></i><span><strong>Đồ thất lạc:</strong> Giao nộp ngay cho Quản lý, ghi chép chi tiết (mô tả, thời gian, ai nhặt, bàn số mấy).</span></li>
          <li><i class="fa-solid fa-user-secret"></i><span><strong>Bảo mật:</strong> Tuyệt đối không mang tài sản hoặc thông tin bí mật (doanh thu, dữ liệu khách hàng, quy trình) ra ngoài.</span></li>
        </ul>` },
      { subtitle: '3. An Toàn Lao Động & PCCC (File 1.pdf)', icon: 'fa-solid fa-fire',
        details: `<ul>
          <li><i class="fa-solid fa-ban-smoking"></i><span><strong>An toàn PCCC:</strong> Nghiêm cấm hút thuốc trong nhà hàng (trừ khu vực cho phép).</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Khi có sự cố cháy:</strong>
              <ol>
                  <li><i class="fa-solid fa-bell"></i><span>(1) Đập vỡ hộp báo cháy GẤP hoặc báo động.</span></li>
                  <li><i class="fa-solid fa-phone"></i><span>(2) Quay số <strong>114</strong> để gọi cứu hỏa khẩn cấp.</span></li>
                  <li><i class="fa-solid fa-bullhorn"></i><span>(3) Báo ngay cho mọi khách hàng và nhân viên.</span></li>
                  <li><i class="fa-solid fa-fire-extinguisher"></i><span>(4) Chữa cháy bằng bình cứu hỏa (nếu đã được huấn luyện và đám cháy còn nhỏ).</span></li>
                  <li><i class="fa-solid fa-person-running"></i><span>(5) Nếu không thể dập tắt, hãy thoát ra bằng đường thoát hiểm và tập trung tại địa điểm quy định.</span></li>
              </ol>
          </span></li>
          <li><i class="fa-solid fa-hard-hat"></i><span><strong>Vệ sinh lao động:</strong> Tuân thủ quy định vệ sinh, sử dụng thiết bị bảo hộ (găng tay, khẩu trang) khi cần.</span></li>
        </ul>` },
      { subtitle: '4. Xử Lý Kỷ Luật & Trách Nhiệm (File 1.pdf)', icon: 'fa-solid fa-gavel',
        details: `<ul>
          <li class="icon-note"><i class="fa-solid fa-note-sticky"></i><span><strong>Phạt tiền (50.000đ/lần):</strong> Đi muộn, về sớm, không chấm công, vắng mặt không phép, sai đồng phục, ngủ trong giờ, lãng phí tài sản.</span></li>
          <li class="icon-note"><i class="fa-solid fa-note-sticky"></i><span><strong>Phạt tiền (10% lương tháng):</strong> Tự ý sử dụng thiết bị, tự nấu ăn/pha chế, ký thay chấm công, hút thuốc trong ca.</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Kỷ luật hoặc Sa thái:</strong> Uống rượu bia khi làm việc, trộm cắp, phá hoại tài sản, cờ bạc, cư xử không đúng mực với khách.</span></li>
          <li><i class="fa-solid fa-wrench"></i><span><strong>Trách nhiệm vật chất:</strong> Nhân viên phải đền bù ít nhất 50% giá trị (theo khấu hao) nếu làm hỏng hóc tài sản. Quản lý sẽ đánh giá và chốt phương án đền bù.</span></li>
        </ul>` }
  ]},
  { id: 'triet-ly', title: 'Triết Lý & Tác Phong Chung', icon: 'fa-solid fa-heart', group: 'general', content: [
      { subtitle: '1. Triết Lý Phục Vụ (Bản Mô Tả CV)', icon: 'fa-solid fa-hand-holding-heart',
        details: `<ul>
          <li><i class="fa-solid fa-award"></i><span><strong>Ưu tiên #1:</strong> Lấy trải nghiệm khách hàng là trung tâm. Luôn ƯU TIÊN khách hàng trước công việc cá nhân.</span></li>
          <li><i class="fa-solid fa-face-smile"></i><span><strong>Thái độ:</strong> Luôn niềm nở, vui vẻ, tận tâm, ân cần khi giao tiếp và phục vụ.</span></li>
          <li><i class="fa-solid fa-star"></i><span><strong>Ghi nhớ:</strong> Luôn ghi nhớ thói quen, sở thích món ăn của khách hàng, đặc biệt là khách thân thiết.</span></li>
          <li><i class="fa-solid fa-users"></i><span><strong>Đoàn kết:</strong> Luôn đề cao tinh thần đoàn kết, không phân biệt đối xử, chia bè phái.</span></li>
          <li><i class="fa-solid fa-arrow-trend-up"></i><span><strong>Tinh thần chung:</strong> Tạo ảnh hưởng tích cực đến tinh thần chung của ca làm việc.</span></li>
        </ul>` },
      { subtitle: '2. Tác Phong Bắt Buộc (Bản Mô Tả CV & QTPV 3)', icon: 'fa-solid fa-user-check',
        details: `<ul>
          <li><i class="fa-solid fa-eye"></i><span><strong>Chủ động:</strong> "Thấy rác là phải nhặt, thấy sàn dơ là phải lau, thấy chén dĩa, ly dơ hoặc mẻ là phải thay."</span></li>
          <li><i class="fa-solid fa-circle-check"></i><span><strong>Kiểm tra:</strong> "Khi mang bất kỳ đồ vật, món ăn... phải kiểm tra thật kỹ. Cảm thấy không đạt, có vật lạ thì mang trả lại. TUYỆT ĐỐI KHÔNG đem lên phục vụ khách."</span></li>
          <li><i class="fa-solid fa-bolt"></i><span><strong>Tiết kiệm:</strong> "Ý thức việc tiết kiệm điện, nước, đá... Tự động tắt đèn, quạt khi khách về/vào giờ thấp điểm."</span></li>
          <li><i class="fa-solid fa-user"></i><span><strong>Tư thế chào:</strong> "Đứng thẳng lưng, 2 tay chấp thành hình chữ V, khuôn mặt cười mĩm. Cúi đầu càng thấp càng thể hiện sự kính trọng."</span></li>
          <li><i class="fa-solid fa-user-check"></i><span><strong>Tư thế trực:</strong> "Đứng giữ khoảng cách với khách tối thiểu 1 mét, tư thế đứng thẳng lưng 2 tay chấp thành hình chữ V."</span></li>
        </ul>` }
  ]},
  { id: 'tieu-chuan', title: 'Tiêu Chuẩn Năng Lực', icon: 'fa-solid fa-chart-bar', group: 'general', content: [
      { subtitle: '1. Thái Độ & Tinh Thần', icon: 'fa-solid fa-face-smile-plus',
        details: `<ul>
          <li><i class="fa-solid fa-user-group"></i><span><strong>Thái độ với Khách hàng:</strong> Luôn giữ bình tĩnh, lễ phép, chuyên nghiệp ngay cả khi khách hàng khó tính.</span></li>
          <li><i class="fa-solid fa-users"></i><span><strong>Thái độ hợp tác Nội bộ:</strong> Chủ động hỗ trợ đồng nghiệp, giao tiếp tôn trọng, cùng mục tiêu chung.</span></li>
          <li><i class="fa-solid fa-lightbulb"></i><span><strong>Tinh thần Chủ động & Trách nhiệm:</strong> Chủ động nhận diện vấn đề (VD: thấy sàn ướt tự xử lý), nhận trách nhiệm khi có lỗi, không đổ lỗi.</span></li>
          <li><i class="fa-solid fa-brain"></i><span><strong>Tinh thần Học hỏi & Tiếp thu:</strong> Ghi nhận góp ý một cách tích cực, nỗ lực sửa đổi để tốt hơn.</span></li>
          <li><i class="fa-solid fa-arrow-trend-up"></i><span><strong>Ảnh hưởng Tổng thể:</strong> Tạo ảnh hưởng tích cực đến tinh thần chung của ca làm việc.</span></li>
        </ul>` },
      { subtitle: '2. Kỷ Luật & Tuân Thủ', icon: 'fa-solid fa-clipboard-check',
        details: `<ul>
          <li><i class="fa-solid fa-calendar-clock"></i><span><strong>Thời gian & Tác phong:</strong> Tuân thủ tuyệt đối giờ giấc, đảm bảo đồng phục, diện mạo luôn đúng chuẩn.</span></li>
          <li><i class="fa-solid fa-clipboard-check"></i><span><strong>Tuân thủ Quy trình Vận hành:</strong> Thực hiện đầy đủ, chính xác check-list công việc đầu ca và cuối ca.</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Tuân thủ Vệ sinh & ATTP (*):</strong> Luôn tuân thủ 100% quy định VSATTP. Đây là yêu cầu bắt buộc.</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Trung thực & Minh bạch (*):</strong> Rõ ràng, trung thực tuyệt đối trong tiền bạc, hàng hóa, tài sản của khách và công ty.</span></li>
        </ul>` },
      { subtitle: '3. Năng Lực & Kỹ Năng', icon: 'fa-solid fa-star',
        details: `<ul>
          <li><i class="fa-solid fa-circle-check"></i><span><strong>Độ chính xác:</strong> Tỷ lệ sai sót (order, tính tiền, ra món, nhập hàng...) phải ở mức thấp nhất.</span></li>
          <li><i class="fa-solid fa-wind"></i><span><strong>Khả năng xử lý Áp lực:</strong> Giữ vững tốc độ, sự bình tĩnh và chính xác ngay cả khi nhà hàng đông khách (giờ cao điểm).</span></li>
          <li><i class="fa-solid fa-circle-exclamation"></i><span><strong>Xử lý tình huống:</strong> Xử lý nhanh và khéo léo các phàn nàn nhỏ của khách.</span></li>
          <li><i class="fa-solid fa-book-open"></i><span><strong>Am hiểu Sản phẩm & Khuyến mãi:</strong> Nắm rõ menu, CTKM, chính sách (dị ứng, phụ thu) để tư vấn chính xác.</span></li>
          <li><i class="fa-solid fa-bullhorn"></i><span><strong>Chủ động Giao tiếp & Upsell:</strong> Tự tin giao tiếp, chủ động gợi ý món, tư vấn để tăng doanh thu (upsell) một cách khéo léo.</span></li>
        </ul>` },
      { subtitle: '4. Trách Nhiệm & Quản Lý', icon: 'fa-solid fa-briefcase',
        details: `<ul>
          <li><i class="fa-solid fa-box-archive"></i><span><strong>Quản lý khu vực & Bàn giao ca:</strong> Giữ khu vực làm việc (station, quầy, bếp) luôn sạch, gọn. Bàn giao ca sau kỹ lưỡng, đầy đủ.</span></li>
          <li><i class="fa-solid fa-flag"></i><span><strong>Báo cáo & Giao tiếp Vận hành:</strong> Báo cáo kịp thời, rõ ràng các sự cố quan trọng cho Quản lý.</span></li>
          <li><i class="fa-solid fa-hand-holding-dollar"></i><span><strong>Ý thức Kiểm soát Chi phí:</strong> Cẩn thận với dụng cụ (tránh vỡ), tuân thủ định lượng (pha chế, bếp), tiết kiệm (điện, nước, khăn).</span></li>
          <li><i class="fa-solid fa-shield-exclamation"></i><span><strong>Tuân thủ An toàn Vận hành:</strong> Chủ động xử lý hoặc báo cáo ngay các rủi ro an toàn (sàn ướt, hỏng hóc thiết bị, lối đi bừa bộn).</span></li>
        </ul>` }
  ]},
  { id: 'ky-thuat', title: 'Kỹ Thuật & Liên Kết', icon: 'fa-solid fa-link', group: 'general', content: [
      { subtitle: '1. Các Link Công Việc Quan Trọng (File 2)', icon: 'fa-solid fa-link',
        details: `<ul>
          <li><i class="fa-solid fa-calendar-days"></i><span><strong>Xem Lịch Đặt Bàn:</strong> <a href="https://docs.google.com/spreadsheets/d/1R_oCd3xadulFLR74FTKqtRnqcRkkc7pMqw53q8HrjMY" target="_blank" rel="noopener noreferrer">Link Google Sheet</a></span></li>
          <li><i class="fa-solid fa-calendar-plus"></i><span><strong>Đăng Ký Lịch Làm:</strong> <a href="http://bit.ly/KG-DANGKYLICHLAM" target="_blank" rel="noopener noreferrer">bit.ly/KG-DANGKYLICHLAM</a></span></li>
          <li><i class="fa-solid fa-calendar"></i><span><strong>Kiểm Tra Lịch Làm/Phân Công:</strong> <a href="http://bit.ly/KG-LICHLAMNV" target="_blank" rel="noopener noreferrer">bit.ly/KG-LICHLAMNV</a></span></li>
          <li><i class="fa-solid fa-dollar-sign"></i><span><strong>Kiểm Tra Công/Lương:</strong> <a href="http://tinyurl.com/KG-CongluongNV" target="_blank" rel="noopener noreferrer">tinyurl.com/KG-CongluongNV</a></span></li>
          <li><i class="fa-solid fa-list-check"></i><span><strong>Checklist Công Việc Hằng Ngày:</strong> <a href="http://bit.ly/KG-CHECKLIST" target="_blank" rel="noopener noreferrer">bit.ly/KG-CHECKLIST</a></span></li>
        </ul>` },
      { subtitle: '2. Các Nhóm Zalo Tương Tác (File 2)', icon: 'fa-solid fa-message',
        details: `<ul>
          <li><i class="fa-solid fa-bolt"></i><span><strong>KG - CHUYỂN KHOẢN:</strong> <a href="http://zalo.me/g/itpfoj409" target="_blank" rel="noopener noreferrer">Tham gia nhóm</a> (Thông tin chung, bán hàng, thanh toán...).</span></li>
          <li><i class="fa-solid fa-calendar-days"></i><span><strong>KG - LỊCH LÀM, PHÂN CÔNG, LƯƠNG:</strong> <a href="http://zalo.me/g/zkowlm391" target="_blank" rel="noopener noreferrer">Tham gia nhóm</a> (Phản hồi, tương tác về lịch, công, lương).</span></li>
          <li><i class="fa-solid fa-users"></i><span><strong>KG - NHÂN VIÊN:</strong> <a href="http://zalo.me/g/loqrlb472" target="_blank" rel="noopener noreferrer">Tham gia nhóm</a> (Chat chung cho nhân viên phục vụ).</span></li>
          <li><i class="fa-solid fa-newspaper"></i><span><strong>KG - HÓA ĐƠN ĐIỆN TỬ:</strong> <a href="http://zalo.me/g/fczgsa224" target="_blank" rel="noopener noreferrer">Tham gia nhóm</a> (Gửi thông tin xuất hóa đơn VAT).</span></li>
          <li><i class="fa-solid fa-check-double"></i><span><strong>KG - BÀN GIAO CÔNG VIỆC:</strong> <a href="http://zalo.me/g/tjchxd476" target="_blank" rel="noopener noreferrer">Tham gia nhóm</a> (Bàn giao công việc đầu/cuối ca).</span></li>
          <li><i class="fa-solid fa-file-pen"></i><span><strong>KG - XỬ LÝ ORDER:</strong> <a href="http://zalo.me/g/smnhsx086" target="_blank" rel="noopener noreferrer">Tham gia nhóm</a> (Gửi báo order, hỗ trợ vấn đề order).</span></li>
        </ul>` }
  ]},
  
  // --- NHÓM BỘ PHẬN ---
  { id: 'phuc-vu', title: 'Phục Vụ (Tổng Quan)', icon: 'fa-solid fa-users-gear', group: 'department', content: [
      { subtitle: '1. Vai Trò Nữ (Order) vs. Nam (Hậu cần) (Bản Mô Tả CV)', icon: 'fa-solid fa-users',
        details: `<ul>
          <li class="icon-tip"><i class="fa-solid fa-user-check"></i><span><strong>Vai trò Nữ (Order):</strong> Chịu trách nhiệm trải nghiệm trực tiếp của khách tại bàn. Giao tiếp chính, nhận order, tư vấn, chăm sóc và kiểm tra bill.</span></li>
          <li><i class="fa-solid fa-door-open"></i><span>(Nữ) Chào khách & Hướng dẫn vào bàn.</span></li>
          <li><i class="fa-solid fa-book-open"></i><span>(Nữ) Trình menu và Tư vấn món, chốt order.</span></li>
          <li><i class="fa-solid fa-eye"></i><span>(Nữ) Quan sát, chăm sóc (châm đá, rót bia), giao tiếp, hỗ trợ khách.</span></li>
          <li><i class="fa-solid fa-credit-card"></i><span>(Nữ) Tính tiền, kiểm tra bill, tiễn khách.</span></li>
          <li class="icon-tip"><i class="fa-solid fa-user-gear"></i><span><strong>Vai trò Nam (Hậu cần):</strong> Đảm bảo công tác hỗ trợ, setup và giữ khu vực sạch sẽ, sẵn sàng.</span></li>
          <li><i class="fa-solid fa-user-plus"></i><span>(Nam) Hậu cần cho Nữ khi có yêu cầu.</span></li>
          <li><i class="fa-solid fa-beer-mug-empty"></i><span>(Nam) Lấy gia vị, chén chấm, bia, nước ngọt, thùng đá.</span></li>
          <li><i class="fa-solid fa-fire"></i><span>(Nam) Lên món, chuẩn bị bếp cồn/gas.</span></li>
          <li><i class="fa-solid fa-arrows-rotate"></i><span>(Nam) Hỗ trợ dọn bàn, thay vỉ nướng, quét rác, setup lại bàn mới.</span></li>
        </ul>` },
      { subtitle: '2. Tác Phong & Vệ Sinh Cá Nhân (Grooming)', icon: 'fa-solid fa-shirt',
        details: `<ul>
          <li><i class="fa-solid fa-shirt"></i><span><strong>Đồng phục:</strong> Luôn sạch sẽ, ủi phẳng, không có mùi. Đeo bảng tên đúng vị trí.</span></li>
          <li><i class="fa-solid fa-user-check"></i><span><strong>Tóc (Nữ):</strong> Búi tóc gọn gàng bằng lưới búi tóc.</span></li>
          <li><i class="fa-solid fa-user-check"></i><span><strong>Tóc (Nam):</strong> Cắt ngắn, gọn gàng, không che mắt. Râu cạo sạch sẽ.</span></li>
          <li><i class="fa-solid fa-wand-magic-sparkles"></i><span><strong>Móng tay:</strong> Luôn cắt ngắn, giữ sạch. Tuyệt đối không sơn móng tay màu nổi.</span></li>
          <li><i class="fa-solid fa-wind"></i><span><strong>Mùi cơ thể:</strong> Sử dụng lăn khử mùi. Không dùng nước hoa quá nồng gây ảnh hưởng đến món ăn.</span></li>
          <li><i class="fa-solid fa-hand-sparkles"></i><span><strong>Rửa tay:</strong> Là bắt buộc sau khi dọn bàn dơ, trước khi bưng món mới, sau khi đi vệ sinh, sau khi chạm vào tóc/mặt.</span></li>
        </ul>` }
  ]},
  { id: 'qtpv-chi-tiet', title: 'Phục Vụ (Quy Trình 5 Bước)', icon: 'fa-solid fa-list-ol', group: 'department', content: [
      { subtitle: '1. Bước 1: Đón Tiếp & Sắp Xếp (QTPV 3)', icon: 'fa-solid fa-door-open',
        details: `<ul>
          <li><i class="fa-solid fa-users"></i><span>Chào khách (tay V, cúi đầu), hỏi số người, xác nhận đặt bàn.</span></li>
          <li><i class="fa-solid fa-arrow-right"></i><span>Dẫn khách vào bàn phù hợp.</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Lưu ý:</strong> Không dắt khách vào bàn quá lớn so với số người (đặc biệt cuối tuần) để tránh hết bàn.</span></li>
          <li><i class="fa-solid fa-chair"></i><span>Kéo ghế cho khách (ưu tiên phụ nữ, người già, chủ tiệc).</span></li>
        </ul>` },
      { subtitle: '2. Bước 2: Trình Menu & Lấy Order (QTPV 3)', icon: 'fa-solid fa-book-open',
        details: `<ul>
          <li><i class="fa-solid fa-book-open"></i><span>Trình menu (mở sẵn trang đầu). Đưa bằng tay thuận, không chĩa cùi chỏ vào mặt khách.</span></li>
          <li class="icon-note"><i class="fa-solid fa-note-sticky"></i><span><strong>Mẹo:</strong> Bàn từ 4 người trở lên, đưa ít nhất 2 cuốn menu. Ưu tiên đưa cho chủ tiệc.</span></li>
          <li><i class="fa-solid fa-clock"></i><span>Để khách xem menu 2-3 phút, sau đó quay lại.</span></li>
          <li><i class="fa-solid fa-file-pen"></i><span>Chốt order và <strong>luôn lặp lại order</strong> cho khách xác nhận.</span></li>
          <li><i class="fa-solid fa-paper-plane"></i><span>Gửi order vào bếp và theo dõi trên app xem order đã vào bếp chưa (tránh lỗi mạng).</span></li>
        </ul>` },
      { subtitle: '3. Bước 3: Kỹ Năng Tư Vấn & Upsell', icon: 'fa-solid fa-bullhorn',
        details: `<ul>
          <li><i class="fa-solid fa-star"></i><span><strong>Tư vấn món:</strong> Chủ động gợi ý món (best-seller, món mới, món bếp làm nhanh).</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Bắt buộc hỏi:</strong> "Anh/chị có dị ứng hoặc kiêng món nào không ạ?"</span></li>
          <li><i class="fa-solid fa-circle-exclamation"></i><span>Thông báo món chuẩn bị lâu: "Dạ món lẩu/nướng này bên em sẽ chuẩn bị trong ... phút ạ."</span></li>
          <li class="icon-tip"><i class="fa-solid fa-lightbulb"></i><span><strong>Kỹ năng Upsell (Bán thêm):</strong>
              <ol>
                  <li><i class="fa-solid fa-arrow-up"></i><span><strong>Gợi ý khai vị:</strong> "Trong lúc chờ món chính, anh/chị dùng thử gỏi... bên em nhé?"</span></li>
                  <li><i class="fa-solid fa-arrow-up"></i><span><strong>Bán món giá trị cao:</strong> "Hôm nay bên em có Tôm hùm/Cua tươi mới về, anh/chị dùng thử không ạ?" (thay vì món tôm/cua thường).</span></li>
                  <li><i class="fa-solid fa-arrow-up"></i><span><strong>Bán kèm đồ uống:</strong> "Mình dùng món nướng này, kèm thêm một tháp bia... sẽ ngon hơn ạ."</span></li>
                  <li><i class="fa-solid fa-arrow-up"></i><span><strong>Bán thêm (Add-on):</strong> "Lẩu này mình dùng thêm nấm/rau/mì... không ạ?"</span></li>
              </ol>
          </span></li>
        </ul>` },
      { subtitle: '4. Bước 4: Chăm Sóc Bàn (QTPV 3)', icon: 'fa-solid fa-eye',
        details: `<ul>
          <li><i class="fa-solid fa-bell-concierge"></i><span>Lên món (xin phép khách, báo tên món, "chúc quý khách ngon miệng").</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>An toàn (QTPV 3):</strong> Khi lên món nóng (lẩu, bếp cồn), phải nhắc khách cẩn thận, đặc biệt lưu ý trẻ em.</span></li>
          <li><i class="fa-solid fa-scissors"></i><span>Chủ động hỗ trợ: Cắt gà, lóc xương cá, tách xiên thịt (luôn xin phép trước).</span></li>
          <li class="icon-note"><i class="fa-solid fa-note-sticky"></i><span><strong>Mẹo (QTPV 3):</strong> Khách đi đông, chủ động lấy thêm nước chấm (tỷ lệ 2 người / 1 chén chấm).</span></li>
          <li><i class="fa-solid fa-eye"></i><span>Luôn quan sát (Scanning): Chủ động châm đá, thay đá, khui/rót bia, dọn dĩa dơ, vỏ, xương...</span></li>
          <li><i class="fa-solid fa-message"></i><span><strong>Phát hiện vấn đề:</strong> "Quan sát khách... nếu cảm thấy thái độ khó chịu hoặc khách chỉ nếm thử... chủ động hỏi thăm khách về vấn đề món ăn" và báo QL ngay.</span></li>
          <li><i class="fa-solid fa-cake-candles"></i><span>Khi khách dùng xong món chính, chủ động hỏi và dọn bàn, chỉ chừa lại món tráng miệng.</span></li>
        </ul>` },
      { subtitle: '5. Bước 5: Thanh Toán & Tiễn Khách (QTPV 3)', icon: 'fa-solid fa-credit-card',
        details: `<ul>
          <li><i class="fa-solid fa-circle-question"></i><span>Xin phép tính tiền: "Em xin phép được tính tiền cho anh / chị ạ!"</span></li>
          <li><i class="fa-solid fa-magnifying-glass"></i><span><strong>Kiểm tra kỹ:</strong> Số lượng món, khăn, bia, nước ngọt (kiểm tra cả trên bàn và dưới bàn).</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Lưu ý (Bản Mô Tả CV):</strong> "Mọi sai xót (khi kiểm bill) đều phải chịu trách nhiệm 100%."</span></li>
          <li><i class="fa-solid fa-print"></i><span>In bill tạm tính (từ Thu ngân), trình khách: "Anh/chị cho em gửi bill mời anh chị kiểm tra bill ạ!"</span></li>
          <li><i class="fa-solid fa-wallet"></i><span><strong>Tiền mặt:</strong> "Đếm tại chỗ số tiền vừa nhận... thông báo rõ số tiền nhận từ khách." Kiểm tra kỹ tiền thối trước khi gửi lại.</span></li>
          <li><i class="fa-solid fa-qrcode"></i><span><strong>Chuyển khoản/Visa:</strong> Hỗ trợ quẹt thẻ/quét QR. "Khi khách đã thanh toán, nhân viên chụp màn hình giao dịch... gửi hình chuyển khoản lên nhóm."</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Lưu ý (QTPV 3):</strong> "Xem lại giao dịch đã thành công hay chưa? Nếu bất thường... xin thông tin của khách để liên lạc khi giao dịch báo lỗi."</span></li>
          <li><i class="fa-solid fa-face-smile-plus"></i><span>Hỏi xin đánh giá chất lượng dịch vụ.</span></li>
          <li><i class="fa-solid fa-arrow-right"></i><span>Khi khách về, chạy ra chào, báo Bảo vệ/Lễ tân dắt xe.</span></li>
          <li><i class="fa-solid fa-hand-holding-heart"></i><span>"Đối với người già và trẻ em, nhân viên hỗ trợ dìu khách xuống bậc thang."</span></li>
        </ul>` },
      { subtitle: '6. Xử Lý Tình Huống (Nâng Cao)', icon: 'fa-solid fa-circle-exclamation',
        details: `<ul>
          <li><i class="fa-solid fa-ear-listen"></i><span><strong>Khách Phàn Nàn:</strong> (1) Lắng nghe, (2) Xin lỗi chân thành ("Dạ, em rất xin lỗi anh/chị..."), (3) Đề xuất giải pháp ("Bên em xin phép làm lại món..."), (4) Báo Quản lý.</span></li>
          <li><i class="fa-solid fa-cake-candles"></i><span><strong>Khách mang bánh kem:</strong> Vui vẻ nhận, cung cấp dĩa, dao, nĩa. Hỗ trợ bảo quản lạnh.</span></li>
          <li class="icon-script"><i class="fa-solid fa-quote-right"></i><span><strong>Khách mang đồ uống/hải sản:</strong> Báo phí phụ thu rõ ràng, lịch sự TRƯỚC KHI sử dụng. (VD: "Dạ, em xin báo phí phụ thu... là...").</span></li>
        </ul>` }
  ]},
  { id: 'tiep-thuc', title: 'Tiếp Thực', icon: 'fa-solid fa-person-walking-luggage', group: 'department', content: [
      { subtitle: '1. Vai Trò & Chuẩn Bị Đầu Ca (File 18)', icon: 'fa-solid fa-bullseye',
        details: `<ul>
          <li class="icon-tip"><i class="fa-solid fa-lightbulb"></i><span><strong>Vai trò:</strong> Cầu nối VÀNG giữa Bếp và Phục vụ. Đảm bảo món ăn ra: (1) Đúng, (2) Nhanh (nóng/lạnh), (3) Chất lượng.</span></li>
          <li><i class="fa-solid fa-square-check"></i><span>Chuẩn bị dụng cụ: Khay sạch (lau khô), kẹp gắp, khăn lau.</span></li>
          <li><i class="fa-solid fa-square-check"></i><span>Bổ sung đầy đủ các loại gia vị, nước chấm tại trạm (station).</span></li>
          <li><i class="fa-solid fa-circle-info"></i><span>Họp đầu ca: Nắm rõ món hết, món tạm ngưng, món ưu tiên.</span></li>
        </ul>` },
      { subtitle: '2. Nhận & Báo Order (File 18)', icon: 'fa-solid fa-ticket',
        details: `<ul>
          <li><i class="fa-solid fa-ticket"></i><span>Nhận order (app/giấy), kiểm tra kỹ (số bàn, yêu cầu đặc biệt).</span></li>
          <li class="icon-note"><i class="fa-solid fa-note-sticky"></i><span><strong>Lưu ý:</strong> Order bất thường (số lượng lớn, yêu cầu lạ...) phải xác minh lại với Phục vụ trước khi báo Bếp.</span></li>
          <li><i class="fa-solid fa-bullhorn"></i><span><strong>Đọc order:</strong> Đọc rõ tên món, số lượng, yêu cầu cho Bếp.</span></li>
          <li><i class="fa-solid fa-clock"></i><span>Theo dõi tiến độ, chủ động nhắc Bếp nếu món ra quá lâu.</span></li>
        </ul>` },
      { subtitle: '3. Kiểm Tra & Chuyển Món (File 18)', icon: 'fa-solid fa-check-double',
        details: `<ul>
          <li><i class="fa-solid fa-eye"></i><span><strong>Kiểm tra 2 chiều:</strong> (1) Kiểm tra món Bếp ra so với order (đúng món, đủ số lượng, đúng yêu cầu). (2) Kiểm tra chất lượng (trình bày đẹp, đĩa sạch, món đủ nóng/lạnh).</span></li>
          <li><i class="fa-solid fa-bell-concierge"></i><span><strong>Sắp xếp khay:</strong> Món nặng ở giữa, món nhẹ/cao ở ngoài, nước chấm đi kèm.</span></li>
          <li><i class="fa-solid fa-arrow-right"></i><span>Di chuyển an toàn, nhanh nhẹn. "Food first" - luôn ưu tiên món ăn.</span></li>
          <li><i class="fa-solid fa-bell-concierge"></i><span>Đặt món xuống bàn (hoặc giao Phục vụ), báo rõ tên món ăn.</span></li>
        </ul>` },
      { subtitle: '4. Giao Tiếp & Xử Lý Sự Cố (File 18)', icon: 'fa-solid fa-comments',
        details: `<ul>
          <li class="icon-script"><i class="fa-solid fa-quote-right"></i><span><strong>Giao tiếp Bếp:</strong> "Order bàn 12, 1 Gà 2 Lẩu!", "Bếp ơi, gấp món bàn 5 giúp em!", "Xác nhận, 5 phút có!".</span></li>
          <li class="icon-script"><i class="fa-solid fa-quote-right"></i><span><strong>Giao tiếp Phục vụ:</strong> "Món ra bàn 12!", "Khay nóng nhé!", "Thiếu nước chấm bàn 10!".</span></li>
          <li><i class="fa-solid fa-message"></i><span><strong>Phát hiện món sai:</strong> Nhanh chóng mang về Bếp, xin lỗi khách. Báo Quản lý 3 hướng xử lý:
              <ol>
                  <li><i class="fa-solid fa-percent"></i><span>Giảm giá món đó.</span></li>
                  <li><i class="fa-solid fa-trash-can"></i><span>Hủy món (và hướng dẫn khách order món khác).</span></li>
                  <li><i class="fa-solid fa-gift"></i><span>Làm lại phần mới (tặng kèm trái cây/món nhẹ).</span></li>
              </ol>
          </span></li>
        </ul>` }
  ]},
  { id: 'bep', title: 'Bếp', icon: 'fa-solid fa-hat-chef', group: 'department', content: [
      { subtitle: '1. Triết Lý Bếp & Mise en Place', icon: 'fa-solid fa-hat-chef',
        details: `<ul>
          <li><i class="fa-solid fa-heart"></i><span><strong>Triết lý Bếp:</strong> Bếp là trái tim của nhà hàng, quyết định 80% sự hài lòng. 3 Yếu tố vàng: <strong>Tốc độ - Nhất quán - Sạch sẽ</strong>.</span></li>
          <li><i class="fa-solid fa-list-check"></i><span><strong>Mise en Place ("Mọi thứ đúng chỗ"):</strong> Không chỉ là sơ chế. Là chuẩn bị TẤT CẢ mọi thứ (nguyên liệu, dụng cụ, khăn lau, gia vị...) trong tầm tay TRƯỚC KHI mở cửa.</span></li>
        </ul>` },
      { subtitle: '2. Chuẩn Bị Đầu Ca (File 24)', icon: 'fa-solid fa-list-check',
        details: `<ul>
          <li><i class="fa-solid fa-clipboard-check"></i><span>Kiểm tra nguyên liệu, thực phẩm tồn từ ca trước (theo checklist).</span></li>
          <li><i class="fa-solid fa-square-check"></i><span>Kiểm tra trang bị, dụng cụ, gas, nhiệt độ tủ lạnh/tủ đông.</span></li>
          <li><i class="fa-solid fa-carrot"></i><span>Chuẩn bị và sơ chế thực phẩm (sốt, rau, thịt...) cho ca.</span></li>
          <li><i class="fa-solid fa-box-archive"></i><span>Kiểm tra hàng tồn theo FIFO, báo cáo NVL sắp hết hạn.</span></li>
          <li><i class="fa-solid fa-bullhorn"></i><span>Thông báo món hết/món ưu tiên cho Tiếp thực và Quản lý.</span></li>
        </ul>` },
      { subtitle: '3. Tiêu Chuẩn Vàng VSATTP & FIFO', icon: 'fa-solid fa-biohazard',
        details: `<ul>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>FIFO (First-In, First-Out):</strong> Hàng nhập trước, dùng trước. Luôn sắp xếp hàng mới ra sau, hàng cũ lên trước.</span></li>
          <li><i class="fa-solid fa-tags"></i><span><strong>Dán nhãn:</strong> Tất cả thực phẩm đã sơ chế/mở hộp phải được dán nhãn (Tên món, Ngày làm, Hạn sử dụng).</span></li>
          <li><i class="fa-solid fa-thermometer-half"></i><span><strong>Nhiệt độ:</strong> Đảm bảo tủ lạnh (0-4°C), tủ đông (dưới -18°C). Không để thực phẩm ở "Vùng nguy hiểm" (5-60°C) quá 2 giờ.</span></li>
          <li><i class="fa-solid fa-link-slash"></i><span><strong>Chống nhiễm chéo:</strong>
              <ol>
                  <li><i class="fa-solid fa-circle-arrow-right"></i><span>Thớt riêng (Đỏ: thịt sống, Xanh: rau, Vàng: thịt chín...).</span></li>
                  <li><i class="fa-solid fa-circle-arrow-right"></i><span>Rửa tay kỹ sau khi chạm vào đồ sống.</span></li>
                  <li><i class="fa-solid fa-circle-arrow-right"></i><span>Để đồ sống ở ngăn dưới cùng tủ lạnh, đồ chín/ăn liền ở ngăn trên.</span></li>
              </ol>
          </span></li>
        </ul>` },
      { subtitle: '4. Chế Biến & Ra Món (File 24)', icon: 'fa-solid fa-mortar-pestle',
        details: `<ul>
          <li><i class="fa-solid fa-ticket"></i><span>Nhận order từ Tiếp thực, chế biến theo thứ tự. Ưu tiên món khai vị, món trẻ em.</span></li>
          <li><i class="fa-solid fa-shield-check"></i><span><strong>Nhất quán:</strong> Đảm bảo chất lượng (đúng công thức, đúng định lượng, đúng vị) mọi lúc.</span></li>
          <li><i class="fa-solid fa-border-all"></i><span><strong>Tiêu chuẩn Trình Bày (Plating):</strong> Luôn theo ảnh chuẩn (nếu có). Đĩa sạch (lau viền đĩa), logo (nếu có) hướng về khách.</span></li>
          <li><i class="fa-solid fa-stopwatch-20"></i><span><strong>Thời gian ra món:</strong> Đảm bảo thời gian chuẩn (VD: Khai vị <10p, Món chính <15p). Báo Tiếp thực/QL nếu có món bị trễ.</span></li>
          <li><i class="fa-solid fa-circle-exclamation"></i><span>Hỗ trợ xử lý lỗi món ăn khi Tiếp thực/Phục vụ phản hồi.</span></li>
        </ul>` },
      { subtitle: '5. Vệ Sinh & Kết Thúc Ca (File 24)', icon: 'fa-solid fa-sparkles',
        details: `<ul>
          <li><i class="fa-solid fa-recycle"></i><span><strong>Vệ sinh trạm (Clean as you go):</strong> Luôn giữ trạm của mình sạch sẽ NGAY CẢ TRONG LÚC ĐÔNG KHÁCH. Không đợi cuối ca.</span></li>
          <li><i class="fa-solid fa-box-archive"></i><span>Lau chùi, dọn dẹp khu vực Bếp, vệ sinh thiết bị (bếp, lò, dao...).</span></li>
          <li><i class="fa-solid fa-box"></i><span>Bọc, dán nhãn và cất trữ NVL thừa đúng nơi, đúng nhiệt độ.</span></li>
          <li><i class="fa-solid fa-temperature-snow"></i><span>Đảm bảo tất cả tủ lạnh/tủ đông đã đóng kín, đúng nhiệt độ.</span></li>
          <li><i class="fa-solid fa-clipboard-list"></i><span>Ghi chép (sổ giao ca, sổ hủy món), báo cáo Quản lý.</span></li>
        </ul>` }
  ]},
  { id: 'pha-che', title: 'Pha Chế & Kho Nước', icon: 'fa-solid fa-glass-water', group: 'department', content: [
      { subtitle: '1. Chuẩn Bị Đầu Ca (File 19, 20)', icon: 'fa-solid fa-list-check',
        details: `<ul>
          <li><i class="fa-solid fa-square-check"></i><span>Kiểm tra dụng cụ: Shaker, ly, bình đong, máy ép, máy xay (phải sạch).</span></li>
          <li><i class="fa-solid fa-square-check"></i><span>Kiểm tra nguyên liệu: Trái cây tươi, siro, đá, soda...</span></li>
          <li><i class="fa-solid fa-box"></i><span>Kiểm tra kho nước: Vệ sinh xô ướp bia, chuẩn bị dĩa trái cây (nếu có tiệc), kiểm tồn bia/nước ngọt.</span></li>
          <li><i class="fa-solid fa-circle-info"></i><span>Nắm rõ menu, món hết, món tạm ngưng.</span></li>
        </ul>` },
      { subtitle: '2. Nhận Order & Pha Chế (File 19, 20)', icon: 'fa-solid fa-martini-glass-citrus',
        details: `<ul>
          <li><i class="fa-solid fa-ticket"></i><span>Nhận order từ Phục vụ, xác minh lại nếu cần. Ưu tiên đồ uống ra trước món ăn.</span></li>
          <li><i class="fa-solid fa-martini-glass"></i><span>Tuân thủ đúng công thức, đúng định lượng (không đong dư/thiếu).</span></li>
          <li><i class="fa-solid fa-gem"></i><span>Trình bày đẹp mắt (lát chanh, lá bạc hà...), đảm bảo đúng hương vị.</span></li>
          <li><i class="fa-solid fa-circle-check"></i><span>Kiểm tra lại đồ uống, lau miệng ly sạch sẽ trước khi giao.</span></li>
        </ul>` },
      { subtitle: '3. Vệ Sinh & Kiểm Soát Chi Phí', icon: 'fa-solid fa-hand-holding-dollar',
        details: `<ul>
          <li class="icon-tip"><i class="fa-solid fa-lightbulb"></i><span><strong>Kiểm soát chi phí:</strong> Tuân thủ 100% định lượng. Hạn chế hao hụt (trái cây hỏng, siro đổ). Báo cáo bể vỡ ngay lập tức.</span></li>
          <li><i class="fa-solid fa-recycle"></i><span>Luôn giữ quầy bar sạch sẽ (lau khô).</span></li>
          <li><i class="fa-solid fa-box-archive"></i><span>Vệ sinh vòi bia, họng máy xay, thùng đá cuối ca.</span></li>
          <li><i class="fa-solid fa-box-check"></i><span>Thực hiện kiểm kho (inventory) hàng ngày/tuần theo quy định.</span></li>
        </ul>` },
      { subtitle: '4. Kết Thúc Ca (File 19, 20)', icon: 'fa-solid fa-power-off',
        details: `<ul>
          <li><i class="fa-solid fa-clipboard-list"></i><span>Kiểm tra tồn kho, lập danh sách bổ sung nguyên liệu/hàng hóa.</span></li>
          <li><i class="fa-solid fa-sparkles"></i><span>Tổng vệ sinh khu vực, sắp xếp dụng cụ, cất trữ nguyên liệu.</span></li>
          <li><i class="fa-solid fa-box-archive"></i><span>Báo cáo công việc, các vấn đề phát sinh (hư hỏng, bể vỡ).</span></li>
        </ul>` }
  ]},
  { id: 'thu-ngan', title: 'Thu Ngân', icon: 'fa-solid fa-money-bill-wave', group: 'department', content: [
      { subtitle: '1. Chuẩn Bị Đầu Ca (File 21)', icon: 'fa-solid fa-list-check',
        details: `<ul>
          <li><i class="fa-solid fa-cash-register"></i><span>Kiểm tra thiết bị: Máy POS, máy tính tiền, máy quẹt thẻ, giấy in (đảm bảo còn).</span></li>
          <li><i class="fa-solid fa-coins"></i><span>Nhận và kiểm đếm tiền lẻ đầu ca (quỹ).</span></li>
          <li><i class="fa-solid fa-database"></i><span>Kiểm tra hệ thống, phần mềm, giá cả, CTKM đã cập nhật đúng.</span></li>
        </ul>` },
      { subtitle: '2. Thanh Toán (File 21)', icon: 'fa-solid fa-credit-card',
        details: `<ul>
          <li><i class="fa-solid fa-receipt"></i><span>Nhận yêu cầu thanh toán từ Phục vụ (đã kiểm tra bàn).</span></li>
          <li><i class="fa-solid fa-clipboard-check"></i><span>Kiểm tra lại đơn hàng trên hệ thống đảm bảo chính xác.</span></li>
          <li><i class="fa-solid fa-print"></i><span>In hóa đơn (bill tạm tính) và gửi cho Phục vụ.</span></li>
          <li><i class="fa-solid fa-check-double"></i><span>Nhận xác nhận thanh toán (tiền mặt/thẻ/QR) từ Phục vụ.</span></li>
          <li><i class="fa-solid fa-circle-check"></i><span>Xác nhận giao dịch thành công. In bill tất toán (hóa đơn GTGT nếu khách cần).</span></li>
        </ul>` },
      { subtitle: '3. Xử Lý Thông Tin Phát Sinh (File 21)', icon: 'fa-solid fa-circle-exclamation',
        details: `<ul>
          <li><i class="fa-solid fa-circle-exclamation"></i><span>Nếu có sai sót, lịch sự xin lỗi và điều chỉnh ngay (cần Quản lý xác nhận hủy/sửa).</span></li>
          <li><i class="fa-solid fa-newspaper"></i><span><strong>Xuất hóa đơn VAT:</strong> Lấy đủ thông tin (MST, Tên công ty, Địa chỉ, Zalo, Email). Hẹn khách thời gian gửi.</span></li>
        </ul>` },
      { subtitle: '4. Xử Lý Tiền Giả & Sai Sót', icon: 'fa-solid fa-shield-virus',
        details: `<ul>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Xử lý tiền giả:</strong> (1) Giữ bình tĩnh, lịch sự. (2) Báo khách: "Dạ, máy báo tiền này không hợp lệ, anh/chị vui lòng đổi tờ khác giúp em ạ." (3) Tuyệt đối không trả lại tiền giả cho khách. (4) Báo ngay cho Quản lý.</span></li>
          <li><i class="fa-solid fa-calculator"></i><span><strong>Xử lý thối nhầm:</strong> Nếu phát hiện thối nhầm (dư hoặc thiếu), báo Quản lý ngay để kiểm tra camera và xử lý.</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Cảnh báo lừa đảo:</strong> Luôn xác nhận "Đã nhận tiền" trên app ngân hàng trước khi xác nhận. Cảnh giác với ảnh chụp màn hình "đang xử lý".</span></li>
        </ul>` },
      { subtitle: '5. Kết Thúc Ca & Đối Soát (File 21)', icon: 'fa-solid fa-box-archive',
        details: `<ul>
          <li><i class="fa-solid fa-book-bookmark"></i><span>Kiểm tra và nhập các phiếu đặt cọc cho ngày tiếp theo.</span></li>
          <li><i class="fa-solid fa-calculator"></i><span><strong>Đối soát:</strong> In Z-Report (tổng kết) từ máy POS.</span></li>
          <li><i class="fa-solid fa-file-invoice-dollar"></i><span>Đếm tiền mặt + Tổng bill thẻ + Tổng bill QR/Chuyển khoản.</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Nguyên tắc:</strong> Tổng tiền thực tế (mặt + thẻ + QR) phải khớp 100% với Z-Report. Báo cáo ngay nếu có chênh lệch.</span></li>
          <li><i class="fa-solid fa-box-archive"></i><span>Lập báo cáo doanh thu, nộp cho Quản lý/Kế toán.</span></li>
          <li><i class="fa-solid fa-sparkles"></i><span>Vệ sinh khu vực, bảo quản tiền mặt an toàn.</span></li>
        </ul>` }
  ]},
  { id: 'bao-ve', title: 'Bảo Vệ', icon: 'fa-solid fa-shield-virus', group: 'department', content: [
      { subtitle: '1. Vai Trò & Chuẩn Bị Đầu Ca (File 22)', icon: 'fa-solid fa-shield-check',
        details: `<ul>
          <li class="icon-tip"><i class="fa-solid fa-lightbulb"></i><span><strong>Vai trò:</strong> Bạn là "Đại sứ ấn tượng đầu tiên" và "Người bảo vệ an toàn" cho nhà hàng. Thái độ của bạn quyết định khách có muốn quay lại hay không.</span></li>
          <li><i class="fa-solid fa-square-check"></i><span>Nhận bàn giao ca, nắm tình hình (số lượng xe, sự cố ca trước).</span></li>
          <li><i class="fa-solid fa-square-check"></i><span>Kiểm tra dụng cụ: Bộ đàm (sạc pin), đèn pin, còi, sổ, vé giữ xe.</span></li>
          <li><i class="fa-solid fa-door-open"></i><span>Mở cửa, dọn dẹp khu vực đậu xe, đảm bảo lối đi thông thoáng.</span></li>
        </ul>` },
      { subtitle: '2. Tiếp Nhận Xe (File 22)', icon: 'fa-solid fa-car',
        details: `<ul>
          <li><i class="fa-solid fa-face-smile"></i><span>Chào hỏi khách lịch sự, niềm nở, chủ động mở cửa xe (nếu là ô tô).</span></li>
          <li><i class="fa-solid fa-ticket"></i><span>Phát vé xe (Ghi rõ biển số, loại xe). Hướng dẫn khách cất đồ giá trị.</span></li>
          <li><i class="fa-solid fa-magnifying-glass"></i><span>Quan sát nhanh tình trạng xe (hư hỏng, bất thường) để tránh tranh chấp.</span></li>
          <li><i class="fa-solid fa-car"></i><span><strong>Xe Ôtô:</strong> Hướng dẫn vị trí đậu, xin SĐT để liên hệ dời xe. Chủ động che nắng (nếu có).</span></li>
        </ul>` },
      { subtitle: '3. Giám Sát & Trả Xe (File 22)', icon: 'fa-solid fa-video',
        details: `<ul>
          <li><i class="fa-solid fa-arrows-up-down-left-right"></i><span>Sắp xếp xe gọn gàng, an toàn, khoa học (xe dễ ra trước, xe khó ra sau), luôn chừa lối đi.</span></li>
          <li><i class="fa-solid fa-eye"></i><span>Thường xuyên tuần tra, giám sát, đề phòng trộm cắp, phá hoại.</span></li>
          <li><i class="fa-solid fa-circle-check"></i><span>Khi khách lấy xe: Yêu cầu vé, so sánh thông tin vé với xe. Không vé phải báo Quản lý xác minh.</span></li>
          <li><i class="fa-solid fa-hand-holding-heart"></i><span>Hỗ trợ khách dắt xe, dời xe, chào cảm ơn khách.</span></li>
        </ul>` },
      { subtitle: '4. Xử Lý Sự Cố & Cuối Ca (File 22)', icon: 'fa-solid fa-triangle-exclamation',
        details: `<ul>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Khách say xỉn/Gây rối:</strong> (1) Giữ bình tĩnh, không đối đầu. (2) Dùng giọng điệu kiên quyết nhưng lịch sự mời khách ra ngoài. (3) Tuyệt đối không dùng vũ lực. (4) Báo Quản lý/Gọi 113 nếu tình hình nghiêm trọng.</span></li>
          <li><i class="fa-solid fa-triangle-exclamation"></i><span>Xử lý sự cố (mất cắp, va chạm xe): Báo cáo Quản lý ngay, giữ nguyên hiện trường (nếu cần).</span></li>
          <li><i class="fa-solid fa-box-archive"></i><span>Cuối ca: Bàn giao ca sau (các xe còn trong bãi, sự cố trong ca).</span></li>
          <li><i class="fa-solid fa-power-off"></i><span>Đóng cửa nhà hàng (khi hết khách), kiểm tra cửa khóa, tắt điện các khu vực.</span></li>
        </ul>` }
  ]},
  { id: 'tap-vu', title: 'Tạp Vụ', icon: 'fa-solid fa-spray-can-sparkles', group: 'department', content: [
      { subtitle: '1. Vai Trò & Chuẩn Bị Đầu Ca (File 23)', icon: 'fa-solid fa-sparkles',
        details: `<ul>
          <li class="icon-tip"><i class="fa-solid fa-lightbulb"></i><span><strong>Vai trò:</strong> Bạn là "Người hùng thầm lặng" giữ cho nhà hàng luôn sạch sẽ, an toàn và vệ sinh. Sự sạch sẽ là yếu tố cốt lõi giữ chân khách hàng.</span></li>
          <li><i class="fa-solid fa-square-check"></i><span>Mặc đồng phục, đeo găng tay, khẩu trang, giày bảo hộ.</span></li>
          <li><i class="fa-solid fa-square-check"></i><span>Chuẩn bị dụng cụ, hóa chất (khăn lau, chất tẩy rửa, cây lau sàn...).</span></li>
          <li><i class="fa-solid fa-circle-info"></i><span>Nắm lịch làm vệ sinh định kỳ (VD: Hôm nay tổng vệ sinh kho, lau kính...).</span></li>
        </ul>` },
      { subtitle: '2. Vệ Sinh & Dọn Dẹp (File 23)', icon: 'fa-solid fa-trash-can',
        details: `<ul>
          <li><i class="fa-solid fa-hand-sparkles"></i><span>Rửa đồ dùng (chén, ly...) còn lại, đảm bảo sạch, khô và cất đúng nơi.</span></li>
          <li><i class="fa-solid fa-sparkles"></i><span>Lau chùi khu vực công cộng (sảnh, lối vào, tay nắm cửa, menu...).</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>Vệ sinh Toilet:</strong> Là ưu tiên hàng đầu. Kiểm tra thường xuyên (30p-1h/lần), đảm bảo sàn khô, không mùi, đủ giấy, xà phòng.</span></li>
          <li><i class="fa-solid fa-trash-can"></i><span>Thu gom rác tại các khu vực (bếp, bar, sảnh) và tập kết đúng nơi quy định.</span></li>
        </ul>` },
      { subtitle: '3. Hỗ Trợ & Quản Lý Hóa Chất', icon: 'fa-solid fa-flask-vial',
        details: `<ul>
          <li><i class="fa-solid fa-users"></i><span>Hỗ trợ Phục vụ dọn bàn (khi quá đông), Hỗ trợ Bếp dọn dẹp.</span></li>
          <li><i class="fa-solid fa-flask-vial"></i><span><strong>An toàn Hóa chất:</strong> Pha hóa chất đúng tỷ lệ, đúng loại. Đeo găng tay/khẩu trang khi tiếp xúc hóa chất mạnh. Để hóa chất ở khu vực riêng, xa thực phẩm.</span></li>
          <li class="icon-danger"><i class="fa-solid fa-triangle-exclamation"></i><span><strong>An toàn Sàn:</strong> Luôn đặt biển "Sàn ướt" khi đang lau. Xử lý ngay các vết đổ, tràn.</span></li>
        </ul>` },
      { subtitle: '4. Kết Thúc Ca (File 23)', icon: 'fa-solid fa-check-double',
        details: `<ul>
          <li><i class="fa-solid fa-clipboard-list"></i><span>Kiểm tra tồn kho (vật tư, hóa chất) báo cáo Quản lý.</span></li>
          <li><i class="fa-solid fa-box-archive"></i><span>Giặt, phơi khăn lau. Vệ sinh dụng cụ (xe lau, thùng rác...).</span></li>
          <li><i class="fa-solid fa-check-double"></i><span>Kiểm tra lại toàn bộ khu vực, đặc biệt là toilet, trước khi kết thúc ca.</span></li>
        </ul>` }
  ]}
];
