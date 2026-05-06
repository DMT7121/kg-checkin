const fs = require('fs');
const file = 'gas/Handlers.gs';
let content = fs.readFileSync(file, 'utf8');

const newFunc = `function buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, isAdmin) {
  var typeStr = payload.type ? String(payload.type) : 'Vào ca';
  var fullnameStr = payload.fullname ? String(payload.fullname) : 'Nhân viên';
  
  if (!loc || loc === 'undefined') loc = 'Không lấy được vị trí';

  var statusColor = isValid ? '#10b981' : '#ef4444';
  var statusText = isValid ? 'Hợp lệ' : 'Không hợp lệ';
  var statusIcon = isValid ? '✅' : '❌';
  
  var headerTitle = isAdmin ? 'Thông Báo Quản Trị Hệ Thống' : 'Xác Nhận Chấm Công';
  var badgeText = isAdmin ? 'PHÁT SINH LƯỢT CHẤM CÔNG MỚI' : typeStr.toUpperCase() + ' THÀNH CÔNG';
  
  var bannerBg = isValid ? '#e6f7eb' : '#fee2e2';
  var bannerBorder = isValid ? '#34d399' : '#f87171';
  var bannerTextColor = isValid ? '#065f46' : '#991b1b';

  var greeting = typeStr === 'Vào ca' ? 'Chúc bạn có ca làm việc hiệu quả!' : 'Cảm ơn bạn đã hoàn thành ca làm việc!';
  var subtitleHTML = isAdmin 
    ? 'Hệ thống ghi nhận thao tác từ <b>' + fullnameStr + '</b>'
    : 'Xin chào <b>' + fullnameStr + '</b>,<br/><span style="font-size:15px;color:#6b7280;font-weight:normal;display:block;margin-top:5px;">' + greeting + '</span>';

  return \`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>King's Grill HR Notification</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f3f4f6; -webkit-text-size-adjust: 100%; }
    table { border-spacing: 0; border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    td { padding: 0; }
    .container { width: 100%; max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
    .header { background-color: #1e3a8a; padding: 30px 20px; text-align: center; color: #ffffff; }
    .logo { font-size: 28px; font-weight: bold; letter-spacing: -1px; margin-bottom: 5px; color: #facc15; }
    .title { font-size: 22px; font-weight: 800; margin: 0 0 5px 0; color: #ffffff; letter-spacing: -0.5px; }
    .subtitle { font-size: 14px; color: #bfdbfe; font-weight: 500; }
    .content { padding: 30px 20px; }
    .banner { background-color: \${bannerBg}; border: 1px solid \${bannerBorder}; border-radius: 12px; padding: 15px; text-align: center; margin-bottom: 25px; }
    .banner-text { color: \${bannerTextColor}; font-size: 16px; font-weight: bold; margin: 0; }
    .greeting { text-align: center; font-size: 18px; color: #1f2937; margin-bottom: 25px; line-height: 1.5; }
    .info-table { width: 100%; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
    .info-row td { padding: 16px 15px; border-bottom: 1px solid #e2e8f0; }
    .info-row:last-child td { border-bottom: none; }
    .icon-td { width: 40px; text-align: center; font-size: 20px; }
    .label-td { font-size: 15px; color: #475569; font-weight: 600; width: 40%; }
    .value-td { font-size: 16px; color: #0f172a; font-weight: bold; text-align: right; }
    .value-highlight { color: #2563eb; }
    .value-status { color: \${statusColor}; }
    .btn-container { text-align: center; margin: 30px 0 10px; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; font-size: 16px; font-weight: bold; padding: 14px 30px; border-radius: 8px; }
    .footer { background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; }
    .footer strong { color: #1e3a8a; }
  </style>
</head>
<body>
  <table width="100%" bgcolor="#f3f4f6" cellpadding="0" cellspacing="0" border="0" style="padding: 20px 10px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table class="container" cellpadding="0" cellspacing="0" border="0">
          
          <!-- Header -->
          <tr>
            <td class="header">
              <div class="logo">KG</div>
              <h1 class="title">KING'S GRILL HR</h1>
              <div class="subtitle">\${headerTitle}</div>
            </td>
          </tr>
          
          <!-- Body Content -->
          <tr>
            <td class="content">
              
              <!-- Status Banner -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 25px;">
                <tr>
                  <td class="banner">
                    <p class="banner-text">\${statusIcon} \${badgeText}</p>
                  </td>
                </tr>
              </table>

              <!-- Greeting -->
              <p class="greeting">\${subtitleHTML}</p>

              <!-- Info Card (Table) -->
              <table class="info-table" cellpadding="0" cellspacing="0" border="0">
                <tr class="info-row">
                  <td class="icon-td">⚡</td>
                  <td class="label-td">Hành động</td>
                  <td class="value-td value-highlight">\${typeStr.toUpperCase()}</td>
                </tr>
                <tr class="info-row">
                  <td class="icon-td">🕒</td>
                  <td class="label-td">Thời gian</td>
                  <td class="value-td">\${formattedTimeUI}</td>
                </tr>
                <tr class="info-row">
                  <td class="icon-td">📍</td>
                  <td class="label-td">Vị trí</td>
                  <td class="value-td" style="font-size: 14px; font-weight: 500;">\${loc}</td>
                </tr>
                <tr class="info-row">
                  <td class="icon-td">📏</td>
                  <td class="label-td">Khoảng cách</td>
                  <td class="value-td">\${distMeters}</td>
                </tr>
                <tr class="info-row">
                  <td class="icon-td">\${statusIcon}</td>
                  <td class="label-td">Trạng thái</td>
                  <td class="value-td value-status">\${statusText}</td>
                </tr>
              </table>

              <!-- Action Button -->
              <div class="btn-container">
                <a href="\${CONFIG.WEB_APP_URL || '#'}" class="btn">Truy cập Dashboard</a>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="footer">
              Email tự động từ hệ thống máy chủ<br>
              <strong>KING'S GRILL &copy; \${new Date().getFullYear()}</strong>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>\`;
}
`;

const startIndex = content.indexOf('function buildEmailHtml');
const endIndexStr = '</html>`;\n}';
const endIndex = content.indexOf(endIndexStr, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + newFunc + content.substring(endIndex + endIndexStr.length);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Replaced buildEmailHtml successfully');
} else {
  console.log('Could not find buildEmailHtml boundaries.');
}
