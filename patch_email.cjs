const fs = require('fs');

const tpl = fs.readFileSync('gas/email_template.html', 'utf8')
  .replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

const newFunc = `// Email template v5 - TABLE-BASED for Gmail/Outlook compatibility
function buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, isAdmin) {
  var typeStr = payload.type ? String(payload.type) : 'Vào ca';
  var fullnameStr = payload.fullname ? String(payload.fullname) : 'Nhân viên';
  if (!loc || String(loc) === 'undefined' || !String(loc).trim()) loc = 'Không xác định';
  var headerTitle = isAdmin ? 'Thông Báo Quản Trị Hệ Thống' : 'Xác Nhận Chấm Công';
  var badgeText = isAdmin ? 'PHÁT SINH LƯỢT CHẤM CÔNG MỚI' : (typeStr.toUpperCase() + (isValid ? ' THÀNH CÔNG' : ' KHÔNG HỢP LỆ'));
  var statusText = isValid ? 'Hợp lệ' : 'Không hợp lệ';
  var greeting = typeStr === 'Vào ca' ? 'Chúc bạn có ca làm việc hiệu quả!' : 'Cảm ơn bạn đã hoàn thành ca làm việc!';
  var noteHTML = isAdmin ? 'Hệ thống ghi nhận thao tác từ <b style="color:#0d55ff">' + fullnameStr + '</b>' : 'Xin chào <b style="color:#0d55ff">' + fullnameStr + '</b>, ' + greeting;
  var bannerBg = isValid ? 'linear-gradient(135deg,#38e98d 0%,#0abc56 54%,#16c971 100%)' : 'linear-gradient(135deg,#ff6b6b 0%,#ee2a2a 54%,#d61818 100%)';
  var bannerShadow = isValid ? 'rgba(22,195,103,.22)' : 'rgba(195,22,22,.22)';
  var checkColor = isValid ? '#0fbd59' : '#dc2626';
  var checkShadow = isValid ? 'rgba(0,77,40,.14)' : 'rgba(77,0,0,.14)';
  var checkChar = isValid ? '&#10003;' : '&#10007;';
  var badgeTextShadow = isValid ? 'rgba(0,83,42,.12)' : 'rgba(83,0,0,.12)';
  var statusColor = isValid ? '#15aa4f' : '#dc2626';
  var statusIconColor = isValid ? '#11b956' : '#dc2626';
  var statusIconBg = isValid ? '#eefff5' : '#fff0f0';
  var dashUrl = CONFIG.WEB_APP_URL || '#';
  var year = new Date().getFullYear();
  var html = \`${tpl}\`;
  html = html.replace(/\\{\\{HEADER_TITLE\\}\\}/g, headerTitle);
  html = html.replace(/\\{\\{BADGE_TEXT\\}\\}/g, badgeText);
  html = html.replace(/\\{\\{NOTE_HTML\\}\\}/g, noteHTML);
  html = html.replace(/\\{\\{ACTION\\}\\}/g, typeStr.toUpperCase());
  html = html.replace(/\\{\\{TIME\\}\\}/g, formattedTimeUI);
  html = html.replace(/\\{\\{LOCATION\\}\\}/g, loc);
  html = html.replace(/\\{\\{DISTANCE\\}\\}/g, distMeters || '');
  html = html.replace(/\\{\\{STATUS\\}\\}/g, statusText);
  html = html.replace(/\\{\\{DASHBOARD_URL\\}\\}/g, dashUrl);
  html = html.replace(/\\{\\{YEAR\\}\\}/g, String(year));
  html = html.replace(/\\{\\{BANNER_BG\\}\\}/g, bannerBg);
  html = html.replace(/\\{\\{BANNER_SHADOW\\}\\}/g, bannerShadow);
  html = html.replace(/\\{\\{CHECK_COLOR\\}\\}/g, checkColor);
  html = html.replace(/\\{\\{CHECK_SHADOW\\}\\}/g, checkShadow);
  html = html.replace(/\\{\\{CHECK_CHAR\\}\\}/g, checkChar);
  html = html.replace(/\\{\\{BADGE_TEXT_SHADOW\\}\\}/g, badgeTextShadow);
  html = html.replace(/\\{\\{STATUS_COLOR\\}\\}/g, statusColor);
  html = html.replace(/\\{\\{STATUS_ICON_COLOR\\}\\}/g, statusIconColor);
  html = html.replace(/\\{\\{STATUS_ICON_BG\\}\\}/g, statusIconBg);
  return html;
}`;

let content = fs.readFileSync('gas/Handlers.gs', 'utf8');

// Find function start
let startIdx = content.indexOf('// Hàm gửi email thông báo checkin/checkout');
if (startIdx === -1) startIdx = content.indexOf('// Email template v');
if (startIdx === -1) startIdx = content.indexOf('function buildEmailHtml(');
if (startIdx === -1) { console.error('START not found'); process.exit(1); }

// Find "return html;" then the closing "}" after it
const retHtml = 'return html;\n}';
const retHtml2 = 'return html;\r\n}';
let endIdx = content.indexOf(retHtml, startIdx);
if (endIdx === -1) endIdx = content.indexOf(retHtml2, startIdx);
if (endIdx === -1) { console.error('END not found'); process.exit(1); }
endIdx += (content[endIdx + 'return html;\n'.length] === '\r' ? retHtml2.length : retHtml.length);

console.log('Range:', startIdx, '-', endIdx, '(' + (endIdx-startIdx) + ' chars)');
content = content.substring(0, startIdx) + newFunc + content.substring(endIdx);
fs.writeFileSync('gas/Handlers.gs', content, 'utf8');
console.log('SUCCESS');
console.log('Verify:', content.includes('TABLE-BASED') && content.includes('smartSendEmail') ? 'PASS' : 'FAIL');
fs.unlinkSync('gas/email_template.html');
