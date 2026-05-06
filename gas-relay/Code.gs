/**
 * EMAIL RELAY SERVICE - King's Grill
 * Deploy này trên tài khoản Google THỨ 2 để tăng quota email.
 * 
 * HƯỚNG DẪN SETUP:
 * 1. Đăng nhập tài khoản Google thứ 2 (VD: kgrill.relay@gmail.com)
 * 2. Vào https://script.google.com → Tạo project mới
 * 3. Copy toàn bộ code này vào Code.gs
 * 4. Deploy → New Deployment → Web App:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy Deployment URL → dán vào CONFIG.EMAIL_RELAY_URLS trong script chính
 * 
 * QUOTA: Mỗi tài khoản Google free = 100 emails/ngày
 * → 2 tài khoản = 200 emails/ngày
 * → 3 tài khoản = 300 emails/ngày
 */

// Khóa bảo mật đơn giản - phải khớp với script chính
var RELAY_SECRET = 'kg-relay-2026';

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    
    // Kiểm tra khóa bảo mật
    if (payload.secret !== RELAY_SECRET) {
      return respond(false, 'Unauthorized');
    }
    
    switch (payload.action) {
      case 'SEND_EMAIL':
        return handleSendEmail(payload);
      case 'CHECK_QUOTA':
        return handleCheckQuota();
      default:
        return respond(false, 'Unknown action');
    }
  } catch (err) {
    return respond(false, err.toString());
  }
}

function doGet() {
  var quota = MailApp.getRemainingDailyQuota();
  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    service: "KG Email Relay",
    quota: quota
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleCheckQuota() {
  var quota = MailApp.getRemainingDailyQuota();
  return respond(true, { quota: quota });
}

function handleSendEmail(payload) {
  if (!payload.to || !payload.subject) {
    return respond(false, 'Missing to/subject');
  }
  
  var quota = MailApp.getRemainingDailyQuota();
  if (quota < 1) {
    return respond(false, 'Relay quota exhausted (remaining: ' + quota + ')');
  }
  
  try {
    var options = {};
    if (payload.htmlBody) options.htmlBody = payload.htmlBody;
    if (payload.name) options.name = payload.name;
    
    MailApp.sendEmail(
      payload.to,
      payload.subject,
      payload.body || '',
      options
    );
    
    return respond(true, {
      message: 'Sent via relay',
      remainingQuota: MailApp.getRemainingDailyQuota()
    });
  } catch (err) {
    return respond(false, 'Relay send error: ' + err.message);
  }
}

function respond(ok, data) {
  var obj = { ok: ok };
  if (typeof data === 'string') obj.message = data;
  else if (data) obj.data = data;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
