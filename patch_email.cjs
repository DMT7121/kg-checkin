const fs = require('fs');

// Read template
const tpl = fs.readFileSync('gas/email_template.html', 'utf8')
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$/g, '\\$');

// Build the new function
const newFunc = `// Hàm gửi email thông báo checkin/checkout - PREMIUM TEMPLATE v4
function buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, isAdmin) {
  var typeStr = payload.type ? String(payload.type) : 'Vào ca';
  var fullnameStr = payload.fullname ? String(payload.fullname) : 'Nhân viên';
  if (!loc || String(loc) === 'undefined' || !String(loc).trim()) loc = 'Không xác định';

  var headerTitle = isAdmin ? 'Thông Báo Quản Trị Hệ Thống' : 'Xác Nhận Chấm Công';
  var badgeText = isAdmin ? 'PHÁT SINH LƯỢT CHẤM CÔNG MỚI' : (typeStr.toUpperCase() + (isValid ? ' THÀNH CÔNG' : ' KHÔNG HỢP LỆ'));
  var statusText = isValid ? 'Hợp lệ' : 'Không hợp lệ';

  var greeting = typeStr === 'Vào ca' ? 'Chúc bạn có ca làm việc hiệu quả!' : 'Cảm ơn bạn đã hoàn thành ca làm việc!';
  var noteHTML = isAdmin
    ? 'Hệ thống ghi nhận thao tác từ <b>' + fullnameStr + '</b>'
    : 'Xin chào <b>' + fullnameStr + '</b>, ' + greeting;

  // Banner colors: green (valid) vs red (invalid)
  var bannerG1 = isValid ? '#38e98d' : '#ff6b6b';
  var bannerG2 = isValid ? '#0abc56' : '#ee2a2a';
  var bannerG3 = isValid ? '#16c971' : '#d61818';
  var bannerGlow = isValid ? 'rgba(101,255,179,.65)' : 'rgba(255,101,101,.65)';
  var bannerShadow = isValid ? 'rgba(22,195,103,.28)' : 'rgba(195,22,22,.28)';
  var bannerGlow2 = isValid ? 'rgba(18,217,112,.16)' : 'rgba(217,18,18,.16)';
  var bannerInset = isValid ? 'rgba(0,92,46,.20)' : 'rgba(92,0,0,.20)';
  var checkColor = isValid ? '#0fbd59' : '#dc2626';
  var checkShadow = isValid ? 'rgba(0,77,40,.18)' : 'rgba(77,0,0,.18)';
  var badgeTextShadow = isValid ? 'rgba(0,83,42,.14)' : 'rgba(83,0,0,.14)';
  var statusColor = isValid ? '#15aa4f' : '#dc2626';
  var statusIconColor = isValid ? '#11b956' : '#dc2626';
  var statusIconBg = isValid ? 'rgba(220,255,237,.78)' : 'rgba(255,220,220,.78)';
  var bannerIconSvg = isValid ? '<path d="M20 6 9 17l-5-5" />' : '<path d="M18 6 6 18M6 6l12 12" />';
  var dashUrl = CONFIG.WEB_APP_URL || '#';
  var year = new Date().getFullYear();

  var html = \`${tpl}\`;

  // Replace all placeholders
  html = html.replace(/\\{\\{HEADER_TITLE\\}\\}/g, headerTitle);
  html = html.replace(/\\{\\{BADGE_TEXT\\}\\}/g, badgeText);
  html = html.replace(/\\{\\{NOTE_HTML\\}\\}/g, noteHTML);
  html = html.replace(/\\{\\{ACTION\\}\\}/g, typeStr.toUpperCase());
  html = html.replace(/\\{\\{TIME\\}\\}/g, formattedTimeUI);
  html = html.replace(/\\{\\{LOCATION\\}\\}/g, loc);
  html = html.replace(/\\{\\{DISTANCE\\}\\}/g, distMeters);
  html = html.replace(/\\{\\{STATUS\\}\\}/g, statusText);
  html = html.replace(/\\{\\{DASHBOARD_URL\\}\\}/g, dashUrl);
  html = html.replace(/\\{\\{YEAR\\}\\}/g, String(year));
  html = html.replace(/\\{\\{BANNER_G1\\}\\}/g, bannerG1);
  html = html.replace(/\\{\\{BANNER_G2\\}\\}/g, bannerG2);
  html = html.replace(/\\{\\{BANNER_G3\\}\\}/g, bannerG3);
  html = html.replace(/\\{\\{BANNER_GLOW\\}\\}/g, bannerGlow);
  html = html.replace(/\\{\\{BANNER_SHADOW\\}\\}/g, bannerShadow);
  html = html.replace(/\\{\\{BANNER_GLOW2\\}\\}/g, bannerGlow2);
  html = html.replace(/\\{\\{BANNER_INSET\\}\\}/g, bannerInset);
  html = html.replace(/\\{\\{CHECK_COLOR\\}\\}/g, checkColor);
  html = html.replace(/\\{\\{CHECK_SHADOW\\}\\}/g, checkShadow);
  html = html.replace(/\\{\\{BADGE_TEXT_SHADOW\\}\\}/g, badgeTextShadow);
  html = html.replace(/\\{\\{STATUS_COLOR\\}\\}/g, statusColor);
  html = html.replace(/\\{\\{STATUS_ICON_COLOR\\}\\}/g, statusIconColor);
  html = html.replace(/\\{\\{STATUS_ICON_BG\\}\\}/g, statusIconBg);
  html = html.replace(/\\{\\{BANNER_ICON_SVG\\}\\}/g, bannerIconSvg);
  return html;
}`;

// Read Handlers.gs and replace
let content = fs.readFileSync('gas/Handlers.gs', 'utf8');

// Find boundaries
const startMarker = '// Hàm gửi email thông báo checkin/checkout';
const endMarker = '</html>`;\\n}';
const endMarker2 = "</html>`;\\r\\n}";

let startIdx = content.indexOf(startMarker);
if (startIdx === -1) {
  // Try alternate
  startIdx = content.indexOf('function buildEmailHtml(');
  if (startIdx === -1) {
    console.log('ERROR: Could not find buildEmailHtml function');
    process.exit(1);
  }
}

// Find the end: look for </html>`; followed by }
let endIdx = -1;
const searchFrom = startIdx;
// Find </html>` then the closing }
const htmlEndTag = '</html>`';
let pos = content.indexOf(htmlEndTag, searchFrom);
if (pos !== -1) {
  // Find the next } after this
  let bracePos = content.indexOf('}', pos + htmlEndTag.length);
  if (bracePos !== -1) {
    endIdx = bracePos + 1;
  }
}

if (endIdx === -1) {
  console.log('ERROR: Could not find end of buildEmailHtml');
  process.exit(1);
}

console.log('Found buildEmailHtml at chars', startIdx, '-', endIdx);
console.log('Replacing', (endIdx - startIdx), 'chars...');

content = content.substring(0, startIdx) + newFunc + content.substring(endIdx);
fs.writeFileSync('gas/Handlers.gs', content, 'utf8');
console.log('SUCCESS: Replaced buildEmailHtml with new premium template v4');

// Clean up template file (not needed in GAS)
fs.unlinkSync('gas/email_template.html');
console.log('Cleaned up template file');
