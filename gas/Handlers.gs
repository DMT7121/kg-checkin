// ============================================
// HANDLERS.GS - CORE BACKEND LOGIC
// ============================================

var PASSWORD_SALT = "kg_salt_2026";

/**
 * Computes salted SHA-256 password hash
 */
function computePasswordHash(password) {
  if (!password) return "";
  try {
    var raw = password.toString() + ":" + PASSWORD_SALT;
    var signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
    var hex = "";
    for (var i = 0; i < signature.length; i++) {
      var byteVal = signature[i];
      if (byteVal < 0) byteVal += 256;
      var byteHex = byteVal.toString(16);
      if (byteHex.length === 1) byteHex = "0" + byteHex;
      hex += byteHex;
    }
    return hex;
  } catch (e) {
    Logger.log("Hash compute error: " + e.toString());
    return password.toString();
  }
}

/**
 * Checks if a username has admin privileges
 */
function isAdminUser(username) {
  if (!username) return false;
  var uname = username.toString().trim().toUpperCase();
  if (uname === "ADMIN") return true;
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(CONFIG.SHEET_USERS);
    if (!sheet) return false;
    var data = sheet.getDataRange().getValues();
    for (var i = 2; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim().toUpperCase() === uname) {
        var role = data[i][5] ? data[i][5].toString().toLowerCase() : "";
        return role === "admin";
      }
    }
  } catch (e) {
    Logger.log("isAdminUser error: " + e.toString());
    return false;
  }
  return false;
}

// =====================================================================================
// 1. User Authentication (Tối ưu hóa siêu nhanh với CacheService in-memory)
// =====================================================================================
var AUTH_CACHE_KEY = 'AUTH_USERS_REGISTRY_V2';

function getCachedAuthUsers() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(AUTH_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch(e) {}
  }
  
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  
  var users = [];
  // Row 0: Title, Row 1: Headers, Row 2+: Users
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var uName = row[0] ? row[0].toString().trim() : '';
    if (!uName) continue;
    
    var status = normalizeEmploymentStatus(row[8]);
    var statusUntil = row[9] ? row[9].toString() : '';
    var statusReason = row[10] ? row[10].toString() : '';
    var statusUpdatedAt = row[11] ? row[11].toString() : '';
    
    // Kiểm tra thời hạn đình chỉ
    if (status === EMPLOYMENT_STATUS.SUSPENDED && statusUntil) {
      var untilDate = new Date(statusUntil + 'T23:59:59');
      if (!isNaN(untilDate.getTime()) && untilDate.getTime() < Date.now()) {
        status = EMPLOYMENT_STATUS.ACTIVE;
        statusUntil = '';
        statusReason = 'Tự động kích hoạt lại sau thời hạn đình chỉ';
      }
    }
    
    users.push({
      rowIndex: i + 1,
      username: uName,
      password: row[1] ? row[1].toString() : '',
      fullname: row[2] ? row[2].toString().trim() : '',
      email: row[4] ? row[4].toString().trim() : '',
      role: row[5] ? row[5].toString().trim() : (uName.toLowerCase() === 'admin' ? 'admin' : 'user'),
      position: row[6] ? row[6].toString().trim() : 'Phục vụ',
      avatarUrl: row[7] ? row[7].toString().trim() : '',
      employmentStatus: status,
      statusUntil: statusUntil,
      statusReason: statusReason,
      statusUpdatedAt: statusUpdatedAt
    });
  }
  
  try {
    // Cache 6 tiếng (21600s)
    cache.put(AUTH_CACHE_KEY, JSON.stringify(users), 21600);
  } catch(eC) {}
  
  return users;
}

function invalidateAuthUsersCache() {
  try {
    CacheService.getScriptCache().remove(AUTH_CACHE_KEY);
  } catch(e) {}
}

function handleLogin(payload) {
  if (!payload || !payload.username || !payload.password) {
    return jsonResponse(false, 'Thiếu thông tin đăng nhập');
  }

  var targetUser = payload.username.toString().trim();
  var inputPassword = payload.password.toString();
  var inputHash = payload.passwordHash || computePasswordHash(inputPassword);

  // === FAST BYPASS CHO TESTER / SUPER ADMIN ===
  if (targetUser.toLowerCase() === 'testapp' && inputPassword === '123456') {
    return jsonResponse(true, {
      username: 'testapp',
      fullname: 'TESTAPP',
      email: 'ngaiviettenem@gmail.com',
      role: 'tester',
      isTester: true,
      position: 'Tester',
      employmentStatus: 'active',
      statusUntil: '',
      statusReason: ''
    });
  }
  if (targetUser.toUpperCase() === 'ADMIN' && inputPassword === 'admin1') {
    return jsonResponse(true, {
      username: 'ADMIN',
      fullname: 'SUPER ADMIN',
      email: 'dmt.7121@gmail.com',
      role: 'admin',
      position: 'Quản lý',
      employmentStatus: 'active',
      statusUntil: '',
      statusReason: ''
    });
  }

  var users = getCachedAuthUsers();
  if (!users) return jsonResponse(false, 'Không tìm thấy dữ liệu người dùng');

  var lowerTarget = targetUser.toLowerCase();
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (u.username.toLowerCase() === lowerTarget) {
      var storedPass = u.password;
      var isMatched = (storedPass === inputPassword) || (storedPass === inputHash) || (computePasswordHash(storedPass) === inputHash);

      if (isMatched) {
        // Tự động nâng cấp hash mật khẩu nếu cần thiết
        if (storedPass === inputPassword && storedPass.length < 50) {
          try {
            var ss = getSS();
            var sheet = ss.getSheetByName(CONFIG.SHEET_USERS);
            if (sheet) {
              sheet.getRange(u.rowIndex, 2).setValue(inputHash);
              invalidateAuthUsersCache();
            }
          } catch (e) {
            Logger.log('Auto password hash upgrade error: ' + e.toString());
          }
        }

        return jsonResponse(true, {
          username: u.username,
          fullname: u.fullname,
          email: u.email || '',
          role: u.role || (lowerTarget === 'admin' ? 'admin' : 'user'),
          position: u.position || 'Phục vụ',
          avatarUrl: u.avatarUrl || '',
          employmentStatus: u.employmentStatus,
          statusUntil: u.statusUntil,
          statusReason: u.statusReason,
          statusUpdatedAt: u.statusUpdatedAt
        });
      }
    }
  }
  return jsonResponse(false, 'Sai username hoặc password');
}

function handleRegister(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) return jsonResponse(false, 'Không tìm thấy sheet người dùng');
  
  var data = sheet.getDataRange().getValues();
  for (var i = 2; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === payload.username.toLowerCase()) {
      return jsonResponse(false, 'Username đã tồn tại');
    }
  }
  
  var hashedPassword = computePasswordHash(payload.password);
  sheet.appendRow([payload.username, hashedPassword, payload.fullname, payload.dob || '', payload.email, 'user', 'Phục vụ']);
  invalidateAuthUsersCache();
  return jsonResponse(true, 'Đăng ký thành công');
}

function handleUpdateSingleShift(payload) {
  var monthSheet = payload.monthSheet;
  var weekLabel = payload.weekLabel; // E.g: "20/04 - 26/04"
  var fullname = payload.fullname;
  var dayIndex = payload.dayIndex; // 0 (T2) -> 6 (CN)
  var shiftValue = payload.shiftValue || '';
  
  if (!monthSheet || !weekLabel || !fullname || dayIndex === undefined) {
    return jsonResponse(false, 'Thiếu thông tin');
  }
  
  var sheet = getMonthlyScheduleSheet(monthSheet);
  var data = sheet.getDataRange().getValues();
  
  // Find week header
  var headerRow = -1;
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().indexOf('TUẦN ' + weekLabel) >= 0) {
      headerRow = i + 1; // 1-indexed
      break;
    }
  }
  
  if (headerRow === -1) {
    return jsonResponse(false, 'Không tìm thấy tuần ' + weekLabel);
  }
  
  var regRow = -1;
  var approvalRow = -1;
  
  for (var r = headerRow; r < data.length; r++) {
    var cellName = data[r][0] ? data[r][0].toString() : '';
    if (cellName.indexOf('TUẦN ') >= 0 && r > headerRow) break;
    
    if (cellName === fullname) regRow = r + 1;
    if (cellName.indexOf('┗') >= 0 && cellName.indexOf(fullname) >= 0) approvalRow = r + 1;
  }
  
  var targetRow = -1;
  
  if (approvalRow > -1) {
    targetRow = approvalRow;
  } else if (regRow > -1) {
    // Need to create approval row
    var now = new Date();
    var timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM HH:mm');
    sheet.insertRowAfter(regRow);
    targetRow = regRow + 1;
    
    // Copy data from reg row
    var originalData = sheet.getRange(regRow, 1, 1, 11).getValues()[0];
    originalData[0] = '┗ ' + fullname;
    originalData[8] = ''; // Ghi chú
    originalData[9] = timestamp;
    originalData[10] = 'Đã điều chỉnh';
    sheet.getRange(targetRow, 1, 1, 11).setValues([originalData]).setNumberFormat('@');
    sheet.getRange(targetRow, 2, 1, 7).setNumberFormat('@');
    
    // Format
    sheet.getRange(targetRow, 1, 1, 11)
      .setBackground('#e0e7ff')
      .setFontWeight('bold');
    sheet.getRange(targetRow, 1)
      .setFontColor('#4338ca')
      .setHorizontalAlignment('right');
    sheet.getRange(targetRow, 11)
      .setBackground('#c7d2fe')
      .setFontColor('#3730a3');
  } else {
    // Employee hasn't registered at all. Need to create reg row and approval row.
    var now = new Date();
    var timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM HH:mm');
    
    // Find where to insert (at the end of the week)
    var endOfWeekRow = headerRow;
    for (var r = headerRow; r < data.length; r++) {
      if (data[r][0] && data[r][0].toString().indexOf('TUẦN ') >= 0 && r > headerRow) {
        break;
      }
      endOfWeekRow = r + 1;
    }
    
    sheet.insertRowsAfter(endOfWeekRow, 2);
    regRow = endOfWeekRow + 1;
    approvalRow = endOfWeekRow + 2;
    
    var emptyShifts = ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'];
    var regData = [fullname].concat(emptyShifts).concat(['', timestamp, 'Chờ duyệt']);
    sheet.getRange(regRow, 1, 1, 11).setValues([regData]).setNumberFormat('@');
    sheet.getRange(regRow, 1, 1, 11).setBackground('#fffbeb').setFontWeight('normal');
    sheet.getRange(regRow, 1).setFontWeight('bold').setHorizontalAlignment('left');
    
    var appData = ['┗ ' + fullname].concat(emptyShifts).concat(['', timestamp, 'Đã điều chỉnh']);
    sheet.getRange(approvalRow, 1, 1, 11).setValues([appData]).setNumberFormat('@');
    sheet.getRange(approvalRow, 1, 1, 11).setBackground('#e0e7ff').setFontWeight('bold');
    sheet.getRange(approvalRow, 1).setFontColor('#4338ca').setHorizontalAlignment('right');
    
    targetRow = approvalRow;
  }
  
  // Update the specific cell
  var colIndex = 2 + dayIndex; // 2=T2, 3=T3,...
  var finalShiftValue = shiftValue === '' ? 'OFF' : shiftValue;
  sheet.getRange(targetRow, colIndex).setValue(finalShiftValue).setNumberFormat('@');
  
  return jsonResponse(true, 'Cập nhật thành công');
}

// 1B. AUTHENTICATION: FORGOT PASSWORD & FORCE RESET
function handleRequestOTP(payload) {
  if (!payload || !payload.email) return jsonResponse(false, 'Thiếu thông tin Email');
  
  var ss = getSS();
  var usersSheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!usersSheet) return jsonResponse(false, 'Không tìm thấy DB Users');
  
  var data = usersSheet.getDataRange().getValues();
  var foundEmail = false;
  
  // Find if email exists in Col 4
  for (var i = 2; i < data.length; i++) {
    if (data[i][4] && data[i][4].toString().toLowerCase() === payload.email.toLowerCase()) {
      foundEmail = true;
      break;
    }
  }
  
  if (!foundEmail) {
    return jsonResponse(false, 'Không tìm thấy tài khoản với Email này');
  }
  
  // Generate 6-digit OTP
  var otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  // Save to OTPs sheet
  var otpSheet = ss.getSheetByName("OTPs");
  if (!otpSheet) {
    otpSheet = ss.insertSheet("OTPs");
    otpSheet.appendRow(["Email", "OTP", "Timestamp"]);
  }
  otpSheet.appendRow([payload.email.toLowerCase(), otp, new Date().getTime()]);
  
  // Send Email using MailApp
  try {
    var logoUrl = (CONFIG.WEB_APP_URL || 'https://kg-checkin.pages.dev/').replace(/\/+$/, '') + '/logo_badge_squircle.png?v=1';
    var otpHtml = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
      + '<html xmlns="http://www.w3.org/1999/xhtml" lang="vi">'
      + '<head>'
      + '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />'
      + '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
      + '<title>Mã Xác Nhận OTP - King\'s Grill</title>'
      + '<style type="text/css">'
      + 'body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }'
      + 'table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }'
      + 'body { margin: 0; padding: 0; width: 100% !important; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }'
      + '</style>'
      + '</head>'
      + '<body style="margin: 0; padding: 0; background-color: #f1f5f9; color: #0f172a;">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; table-layout: fixed;">'
      + '<tr><td align="center" style="padding: 24px 12px;">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">'
      + '<tr><td style="background-color: #0b1329; padding: 24px; text-align: center;">'
      + '<table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;"><tr>'
      + '<td align="center" valign="middle" style="width: 58px; height: 58px; text-align: center; vertical-align: middle;">'
      + '<img src="' + logoUrl + '" alt="King\'s Grill Logo" width="58" height="58" style="display: block; width: 58px; height: 58px; border: 0; outline: none; margin: 0 auto;" />'
      + '</td>'
      + '</tr></table>'
      + '<h1 style="margin: 10px 0 2px; color: #ffffff; font-size: 18px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase;">KING&#39;S GRILL</h1>'
      + '<p style="margin: 0; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;">KHÔI PHỤC MẬT KHẨU TÀI KHOẢN</p>'
      + '</td></tr>'
      + '<tr><td style="padding: 24px;">'
      + '<p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #334155;">Xin chào bạn,<br />Bạn vừa yêu cầu mã xác thực OTP để thiết lập lại mật khẩu tài khoản hệ thống King&#39;s Grill.</p>'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 14px; margin: 16px 0;">'
      + '<tr><td align="center" style="padding: 20px 16px;">'
      + '<div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">MÃ XÁC THỰC CỦA BẠN</div>'
      + '<div style="font-family: monospace, Courier, sans-serif; font-size: 32px; font-weight: 900; color: #2563eb; letter-spacing: 8px;">' + otp + '</div>'
      + '<div style="font-size: 11px; font-weight: 600; color: #e11d48; margin-top: 6px;">⏱️ Có hiệu lực trong vòng 5 phút</div>'
      + '</td></tr></table>'
      + '<p style="margin: 16px 0 0; font-size: 12px; line-height: 1.5; color: #64748b;">Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email hoặc liên hệ quản trị viên.</p>'
      + '</td></tr>'
      + '<tr><td style="padding: 16px 24px; background-color: #f8fafc; text-align: center; border-top: 1px solid #e2e8f0;">'
      + '<p style="margin: 0; font-size: 11px; font-weight: 800; color: #0f172a; letter-spacing: 0.5px;">KING&#39;S GRILL RESTAURANT &copy; ' + new Date().getFullYear() + '</p>'
      + '</td></tr>'
      + '</table>'
      + '</td></tr></table>'
      + '</body></html>';

    MailApp.sendEmail({
      to: payload.email,
      subject: "Mã xác nhận (OTP) Khôi phục mật khẩu - King's Grill",
      htmlBody: otpHtml
    });
    return jsonResponse(true, 'Đã gửi mã OTP qua Email');
  } catch (e) {
    return jsonResponse(false, 'Lỗi gửi Email: ' + e.toString());
  }
}

function handleResetPassword(payload) {
  if (!payload || !payload.email || !payload.otp || !payload.newPassword) {
    return jsonResponse(false, 'Thiếu thông tin');
  }
  
  var ss = getSS();
  var otpSheet = ss.getSheetByName("OTPs");
  if (!otpSheet) return jsonResponse(false, 'Chưa có dữ liệu OTP');
  
  var otpData = otpSheet.getDataRange().getValues();
  var validOTP = false;
  var now = new Date().getTime();
  
  // Find OTP backwards (latest first)
  for (var i = otpData.length - 1; i >= 1; i--) {
    if (otpData[i][0].toString().toLowerCase() === payload.email.toLowerCase() && otpData[i][1].toString() === payload.otp) {
      // Check expiration (5 minutes = 300,000 ms)
      var timestamp = Number(otpData[i][2]);
      if (now - timestamp <= 300000) {
        validOTP = true;
      }
      break; // Only check the latest OTP sent for this email
    }
  }
  
  if (!validOTP) {
    return jsonResponse(false, 'Mã OTP không hợp lệ hoặc đã hết hạn (quá 5 phút)');
  }
  
  // Update Password in Users sheet
  var usersSheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  var usersData = usersSheet.getDataRange().getValues();
  var updated = false;
  var hashedNewPassword = computePasswordHash(payload.newPassword);
  for (var j = 2; j < usersData.length; j++) {
    if (usersData[j][4] && usersData[j][4].toString().toLowerCase() === payload.email.toLowerCase()) {
      usersSheet.getRange(j + 1, 2).setValue(hashedNewPassword); // Col B is password (index 1 + 1)
      updated = true;
      break;
    }
  }
  
  if (updated) {
    invalidateAuthUsersCache();
    return jsonResponse(true, 'Đặt lại mật khẩu thành công');
  } else {
    return jsonResponse(false, 'Lỗi không xác định khi cập nhật mật khẩu');
  }
}

function handleForceResetPassword(payload) {
  if (!payload || !payload.targetUsername) return jsonResponse(false, 'Thiếu targetUsername');
  
  if (payload.adminUsername && !isAdminUser(payload.adminUsername)) {
    return jsonResponse(false, 'Chỉ Quản trị viên mới có quyền thực hiện thao tác này');
  }

  var ss = getSS();
  var usersSheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!usersSheet) return jsonResponse(false, 'Không tìm thấy DB Users');
  
  var usersData = usersSheet.getDataRange().getValues();
  var updated = false;
  var defaultPass = "Kg123456";
  var hashedDefaultPass = computePasswordHash(defaultPass);
  
  for (var j = 2; j < usersData.length; j++) {
    if (usersData[j][0].toString().toLowerCase() === payload.targetUsername.toLowerCase()) {
      usersSheet.getRange(j + 1, 2).setValue(hashedDefaultPass); // Reset col 2
      updated = true;
      break;
    }
  }
  
  if (updated) {
    invalidateAuthUsersCache();
    return jsonResponse(true, 'Đã đặt lại mật khẩu thành công');
  } else {
    return jsonResponse(false, 'Không tìm thấy User này');
  }
}

// 1B. CẬP NHẬT PHÂN QUYỀN (ROLE)
function handleUpdateUserRole(payload) {
  if (!payload || !payload.targetUsername || !payload.newRole) return jsonResponse(false, 'Thiếu thông tin');
  
  var ss = getSS();
  var usersSheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!usersSheet) return jsonResponse(false, 'Không tìm thấy DB Users');
  
  var usersData = usersSheet.getDataRange().getValues();
  var updated = false;
  
  for (var j = 2; j < usersData.length; j++) {
    if (usersData[j][0].toString().toLowerCase() === payload.targetUsername.toLowerCase()) {
      usersSheet.getRange(j + 1, 6).setValue(payload.newRole); // Col 5 (F) is index 5, so column 6
      updated = true;
      break;
    }
  }
  
  if (updated) {
    invalidateAuthUsersCache();
    return jsonResponse(true, 'Cập nhật phân quyền thành công');
  } else {
    return jsonResponse(false, 'Không tìm thấy User này');
  }
}

// 1C. CẬP NHẬT CHỨC VỤ/BỘ PHẬN (POSITION)
function handleUpdateUserPosition(payload) {
  if (!payload || !payload.targetUsername || !payload.newPosition) return jsonResponse(false, 'Thiếu thông tin');
  
  var ss = getSS();
  var usersSheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!usersSheet) return jsonResponse(false, 'Không tìm thấy DB Users');
  
  var usersData = usersSheet.getDataRange().getValues();
  var updated = false;
  
  for (var j = 2; j < usersData.length; j++) {
    if (usersData[j][0].toString().toLowerCase() === payload.targetUsername.toLowerCase()) {
      usersSheet.getRange(j + 1, 7).setValue(payload.newPosition); // Col G is index 6, so column 7
      updated = true;
      break;
    }
  }
  
  if (updated) {
    invalidateAuthUsersCache();
    return jsonResponse(true, 'Cập nhật bộ phận thành công');
  } else {
    return jsonResponse(false, 'Không tìm thấy User này');
  }
}

// 2A. REVERSE GEOCODING via Google Maps (built-in GAS Maps service)
function handleGeocode(payload) {
  try {
    if (!payload.lat || !payload.lng) return jsonResponse(false, 'Thieu toa do');
    var addr = reverseGeocodeGoogle(Number(payload.lat), Number(payload.lng));
    return jsonResponse(true, { address: addr });
  } catch(e) {
    return jsonResponse(false, 'Geocode error: ' + e.message);
  }
}

/**
 * Reverse geocode using Google Maps (built-in GAS service, free, accurate)
 * Returns formatted Vietnamese address from coordinates
 */
function reverseGeocodeGoogle(lat, lng) {
  try {
    var response = Maps.newGeocoder()
      .setLanguage('vi')
      .reverseGeocode(lat, lng);
    if (response.status === 'OK' && response.results && response.results.length > 0) {
      // Try to find a result with a good type (street_address, route, establishment, etc.)
      var bestResult = response.results[0];
      for (var i = 0; i < Math.min(response.results.length, 3); i++) {
        var types = response.results[i].types || [];
        if (types.indexOf('street_address') >= 0 || types.indexOf('route') >= 0 ||
            types.indexOf('establishment') >= 0 || types.indexOf('point_of_interest') >= 0) {
          bestResult = response.results[i];
          break;
        }
      }
      var addr = bestResult.formatted_address || '';
      // Clean up: remove "Việt Nam" suffix for brevity
      addr = addr.replace(/, Vi\u1EC7t Nam$/i, '').replace(/, Vietnam$/i, '').trim();
      return addr;
    }
  } catch (e) {
    Logger.log('Google Maps geocode error: ' + e.message);
  }
  
  // Fallback to OSM (Nominatim)
  try {
    var fallbackUrl = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=1';
    var res = UrlFetchApp.fetch(fallbackUrl, { muteHttpExceptions: true, headers: { 'Accept-Language': 'vi' } });
    if (res.getResponseCode() === 200) {
      var data = JSON.parse(res.getContentText());
      if (data && data.display_name) {
        return data.display_name.replace(/, Vi\u1EC7t Nam$/i, '').replace(/, Vietnam$/i, '').trim();
      }
    }
  } catch (e) {
    Logger.log('OSM geocode error: ' + e.message);
  }
  
  // Final Fallback to coordinates
  return lat.toFixed(6) + ', ' + lng.toFixed(6);
}

/**
 * CRITICAL HELPER: Safely convert shift cell values to display strings.
 * Google Sheets getValues() returns Date objects for HH:mm formatted cells.
 * Date.toString() produces "Sat Dec 30 1899 15:24:26 GMT+0706" which is WRONG.
 * This function ensures we always get "15:00", "OFF", etc.
 */
function safeShiftValue(cellValue) {
  if (!cellValue) return 'OFF';
  // If it's a Date object (from getValues() on time-formatted cells)
  if (cellValue instanceof Date) {
    var h = cellValue.getHours();
    var m = cellValue.getMinutes();
    return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
  }
  var str = cellValue.toString().trim();
  // If it looks like a Date string (e.g. "Sat Dec 30 1899...")
  if (str.match(/^[A-Z][a-z]{2}\s[A-Z]/)) {
    try {
      var d = new Date(str);
      if (!isNaN(d.getTime())) {
        var hh = d.getHours();
        var mm = d.getMinutes();
        return (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
      }
    } catch(e) {}
  }
  return str || 'OFF';
}

function parseDateTimeString(str) {
  if (!str) return new Date();
  if (str instanceof Date) return isNaN(str.getTime()) ? new Date() : str;
  var s = str.toString().trim().replace(/^['"\s]+|['"\s]+$/g, '');
  var parts = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (parts) {
    var day = parseInt(parts[1], 10);
    var month = parseInt(parts[2], 10) - 1; // 0-indexed month
    var year = parseInt(parts[3], 10);
    var hour = parseInt(parts[4], 10);
    var minute = parseInt(parts[5], 10);
    var second = parts[6] ? parseInt(parts[6], 10) : 0;
    var d = new Date(year, month, day, hour, minute, second);
    if (!isNaN(d.getTime())) return d;
  }
  var d2 = new Date(s);
  return !isNaN(d2.getTime()) ? d2 : new Date();
}

/**
 * Robust extraction of timestamp from column C (time string/Date) or column H (Data JSON)
 */
function getLogTimestampSafe(timeVal, jsonVal) {
  if (jsonVal) {
    try {
      var p = typeof jsonVal === 'string' ? JSON.parse(jsonVal) : jsonVal;
      if (p.timestamp) {
        var t = new Date(p.timestamp).getTime();
        if (!isNaN(t)) return t;
      }
    } catch(e) {}
  }
  if (!timeVal) return 0;
  if (timeVal instanceof Date) return isNaN(timeVal.getTime()) ? 0 : timeVal.getTime();
  var s = timeVal.toString().trim().replace(/^['"\s]+|['"\s]+$/g, '');
  var parts = s.split(' ');
  if (parts.length >= 2) {
    var dParts = parts[0].split(/[\/\-]/);
    var tParts = parts[1].split(':');
    if (dParts.length === 3 && tParts.length >= 2) {
      var day = parseInt(dParts[0], 10);
      var mon = parseInt(dParts[1], 10) - 1;
      var year = parseInt(dParts[2], 10);
      var hr = parseInt(tParts[0], 10);
      var min = parseInt(tParts[1], 10);
      var sec = tParts[2] ? parseInt(tParts[2], 10) : 0;
      var d = new Date(year, mon, day, hr, min, sec);
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }
  var d2 = new Date(s);
  return !isNaN(d2.getTime()) ? d2.getTime() : 0;
}

/**
 * Tải ảnh base64 trực tiếp lên Google Drive siêu nhanh với Dịch vụ nâng cao (Drive API v3)
 */
function uploadImageBlobToDrive(base64Image, personName) {
  if (!base64Image || typeof base64Image !== 'string' || base64Image.length < 50) return '';
  try {
    var base64Data = base64Image;
    var mimeType = 'image/jpeg';
    var ext = '.jpg';
    if (base64Data.indexOf('data:image/webp') === 0) { mimeType = 'image/webp'; ext = '.webp'; }
    else if (base64Data.indexOf('data:image/png') === 0) { mimeType = 'image/png'; ext = '.png'; }
    
    if (base64Data.indexOf(',') !== -1) {
      base64Data = base64Data.split(',')[1];
    }
    
    // Xóa ký tự lạ và tự động đệm '='
    base64Data = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');
    while (base64Data.length % 4 !== 0) {
      base64Data += '=';
    }
    
    var safeName = (personName || 'checkin').toString().replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
    var filename = safeName + '_' + new Date().getTime() + ext;
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, filename);
    
    // 1. TĂNG TỐC VỚI DỊCH VỤ NÂNG CAO (Drive API v3) - SIÊU NHANH
    try {
      var fileMetadata = {
        name: filename,
        parents: [CONFIG.FOLDER_ID],
        mimeType: mimeType
      };
      var createdFile = Drive.Files.create(fileMetadata, blob, {
        fields: 'id, webViewLink'
      });
      if (createdFile && createdFile.id) {
        try {
          Drive.Permissions.create({
            role: 'reader',
            type: 'anyone'
          }, createdFile.id);
        } catch(pErr) {}
        return 'https://drive.google.com/file/d/' + createdFile.id + '/view?usp=drivesdk';
      }
    } catch(advErr) {
      Logger.log('Drive API v3 upload fallback to DriveApp: ' + advErr.message);
    }
    
    // 2. Fallback sang DriveApp cổ điển nếu Drive API v3 gặp sự cố
    var folder;
    try {
      folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    } catch (eF) {
      folder = DriveApp.getRootFolder();
    }
    
    var file = folder.createFile(blob);
    var imageUrl = file.getUrl();
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eS) {}
    
    return imageUrl;
  } catch (err) {
    Logger.log('uploadImageBlobToDrive error: ' + err.message);
    return '';
  }
}

/**
 * Tra cứu ảnh minh chứng xác thực gần nhất của nhân viên từ Sheet hoặc Google Drive
 * Bảo đảm hệ thống KHÔNG BAO GIỜ bị rơi vào trạng thái "Đang tải ảnh..."
 */
function findLatestEmployeePhoto(fullname, username) {
  if (!fullname && !username) return '';
  var cleanFullname = (fullname || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  var cleanUsername = (username || '').toString().trim().toLowerCase();

  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
    if (sheet) {
      var lastRow = Math.min(sheet.getLastRow(), 250);
      if (lastRow >= 2) {
        var values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
        var formulas = sheet.getRange(2, 7, lastRow - 1, 1).getFormulas();

        for (var i = 0; i < values.length; i++) {
          var rName = (values[i][0] || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
          var rJsonStr = values[i][7] ? values[i][7].toString() : '';
          var isMatch = false;

          if (cleanFullname && (rName === cleanFullname || rName.indexOf(cleanFullname) >= 0 || cleanFullname.indexOf(rName) >= 0)) {
            isMatch = true;
          } else if (cleanUsername && (rName === cleanUsername || rName.indexOf(cleanUsername) >= 0)) {
            isMatch = true;
          } else if (rJsonStr && cleanUsername && rJsonStr.indexOf(cleanUsername) >= 0) {
            isMatch = true;
          }

          if (isMatch) {
            // 1. Kiểm tra Cột H JSON
            if (rJsonStr && rJsonStr.indexOf('drive.google.com') >= 0) {
              try {
                var parsed = JSON.parse(rJsonStr);
                if (parsed.linkAnh && parsed.linkAnh.indexOf('drive.google.com') >= 0) {
                  return parsed.linkAnh.trim();
                }
              } catch(e) {
                var mH = rJsonStr.match(/https?:\/\/drive\.google\.com\/[^\s"',}]+/);
                if (mH) return mH[0];
              }
            }
            // 2. Kiểm tra Formula Cột G
            var fG = formulas[i][0] ? formulas[i][0].toString() : '';
            if (fG && fG.indexOf('drive.google.com') >= 0) {
              var mF = fG.match(/https?:\/\/drive\.google\.com\/[^\s"';,]+/);
              if (mF) return mF[0];
            }
            // 3. Kiểm tra Value Cột G
            var rColG = values[i][6] ? values[i][6].toString() : '';
            if (rColG && rColG.indexOf('drive.google.com') >= 0) {
              var mG = rColG.match(/https?:\/\/drive\.google\.com\/[^\s"';,]+/);
              if (mG) return mG[0];
            }
          }
        }
      }
    }
  } catch(e) {
    Logger.log('findLatestEmployeePhoto error: ' + e.message);
  }

  // Quét Drive theo tên nếu sheet chưa có
  try {
    var safeName = (fullname || username || '').toString().replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
    if (safeName.length > 2) {
      var files = DriveApp.searchFiles("'" + CONFIG.FOLDER_ID + "' in parents and title contains '" + safeName + "' and trashed = false");
      if (files.hasNext()) {
        return files.next().getUrl();
      }
    }
  } catch(eD) {}

  return '';
}

// 2B. Chấm Công Logic - 8 COLUMNS FORMAT
// Col A: HỌ VÀ TÊN | Col B: LOẠI CHẤM CÔNG | Col C: THỜI GIAN (DD/MM/YYYY HH:MM:SS)
// Col D: VỊ TRÍ | Col E: XÁC MINH | Col F: KHOẢNG CÁCH | Col G: LINK HÌNH ẢNH | Col H: DATA JSON

function handleCheckInOut(payload) {
  if (payload.username && !canEmployeeWork(payload.username)) {
    var blockedProfile = getEmploymentProfileByUsername(payload.username);
    return jsonResponse(false, 'Không thể chấm công khi trạng thái là ' + (blockedProfile ? blockedProfile.employmentStatus : 'không hoạt động'));
  }
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
  if (!sheet) return jsonResponse(false, 'Không tìm thấy sheet chấm công');
  
  // === 1. BẢO MẬT & KIỂM TRA BÁN KÍNH GPS (ANTI-FRAUD RADIUS ENFORCEMENT) ===
  var cleanUser = (payload.username || '').trim().toLowerCase();
  var isAuthorizedTest = (cleanUser === 'admin' || cleanUser === 'testapp' || cleanUser === 'tester');
  
  var gpsConfig = getGpsConfig();
  var targetLat = (gpsConfig && gpsConfig.lat) ? Number(gpsConfig.lat) : 10.976083;
  var targetLng = (gpsConfig && gpsConfig.lng) ? Number(gpsConfig.lng) : 106.664654;
  var allowedRadius = (gpsConfig && gpsConfig.radius > 0) ? Number(gpsConfig.radius) : 20;

  var distMeters = 0;
  var hasCoordinates = (payload.lat !== undefined && payload.lat !== null && payload.lat !== '' &&
                        payload.lng !== undefined && payload.lng !== null && payload.lng !== '');
  
  if (hasCoordinates) {
    var latNum = Number(payload.lat);
    var lngNum = Number(payload.lng);
    var R = 6371000;
    var dLat = (targetLat - latNum) * Math.PI / 180;
    var dLon = (targetLng - lngNum) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(latNum * Math.PI / 180) * Math.cos(targetLat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distMeters = Math.round(R * c);
  } else if (payload.distance !== undefined && payload.distance !== null && payload.distance !== '') {
    distMeters = Math.round(Number(payload.distance));
  } else {
    // Không có tọa độ GPS hợp lệ
    if (!isAuthorizedTest) {
      return jsonResponse(false, {
        message: 'Từ chối chấm công: Không nhận được dữ liệu tọa độ GPS từ thiết bị.',
        code: 'GPS_REQUIRED'
      });
    }
  }

  // Chặn tuyệt đối nếu vượt quá bán kính quy định (ngoại trừ tài khoản test được cấp quyền)
  if (!isAuthorizedTest && distMeters > allowedRadius) {
    try {
      recordFraudAlert(ss, payload, distMeters, allowedRadius);
    } catch(fraudErr) {
      Logger.log('Fraud logging error: ' + fraudErr.message);
    }
    
    return jsonResponse(false, {
      message: 'Từ chối chấm công: Bạn đang cách nhà hàng ' + distMeters + 'm (vượt quá bán kính cho phép ≤ ' + allowedRadius + 'm). Vui lòng có mặt tại nhà hàng để chấm công.',
      code: 'OUT_OF_RADIUS',
      distMeters: distMeters,
      allowedRadius: allowedRadius
    });
  }

  // === 2. BẢO MẬT THỜI GIAN & CHỐNG GIAN LẬN CHỤP ẢNH TRƯỚC (ANTI-PRE-CAPTURE FRAUD) ===
  var serverNowMs = new Date().getTime();
  
  // A. Kiểm tra tuổi ảnh chụp (Photo Expiration 60s + 15s grace cho độ trễ mạng/chuyển dữ liệu)
  if (payload.photoCapturedMs && !isAuthorizedTest) {
    var photoMs = Number(payload.photoCapturedMs);
    if (!isNaN(photoMs) && photoMs > 0) {
      var photoAgeSecs = Math.round((serverNowMs - photoMs) / 1000);
      if (photoAgeSecs > 75) { // Quá 60s (+ 15s buffer mạng)
        try {
          recordFraudAlert(ss, payload, distMeters, allowedRadius, 'Ảnh chụp quá hạn (' + photoAgeSecs + 's trước, quy định ≤ 60s)');
        } catch(e) {}
        return jsonResponse(false, {
          message: 'Từ chối chấm công: Ảnh chụp minh chứng đã hết hạn (' + photoAgeSecs + ' giây trước, quy định tối đa 60 giây). Vui lòng chụp lại ảnh mới tại nhà hàng để gửi chấm công.',
          code: 'PHOTO_EXPIRED',
          photoAgeSecs: photoAgeSecs
        });
      }
    }
  }

  // B. Chống gian lận chỉnh đồng hồ thiết bị (Device Clock Drift > 3 phút)
  if (payload.clientNowMs && !isAuthorizedTest) {
    var clientMs = Number(payload.clientNowMs);
    if (!isNaN(clientMs) && clientMs > 0) {
      var driftMs = Math.abs(serverNowMs - clientMs);
      if (driftMs > 180000) { // Lệch hơn 3 phút
        return jsonResponse(false, {
          message: 'Từ chối chấm công: Đồng hồ thiết bị của bạn bị lệch ' + Math.round(driftMs / 1000) + ' giây so với máy chủ chuẩn. Vui lòng bật chế độ "Tự động đặt giờ theo mạng" trên điện thoại.',
          code: 'CLOCK_DESYNC'
        });
      }
    }
  }

  // payload: username, fullname, email, type, lat, lng, image, timestamp, location, distance
  var time = parseDateTimeString(payload.time);
  // Nếu thời gian client gửi lên bị lệch quá 90s so với giờ máy chủ, ép buộc lấy giờ máy chủ hiện tại
  if (time && Math.abs(serverNowMs - time.getTime()) > 90000 && !isAuthorizedTest) {
    time = new Date();
  }
  
  // === COL A: HỌ VÀ TÊN ===
  var hoVaTen = payload.fullname;
  
  // === COL B: LOẠI CHẤM CÔNG ===
  var loaiChamCong = payload.type; // "Vào ca" / "Ra ca"

  // === ANTI-SPAM: 15 MINUTES COOLDOWN RULE (Enforced for all check-ins) ===
  if (!payload.bypassCooldown) {
    try {
      var numRows = Math.min(Math.max(1, sheet.getLastRow() - 1), 150);
      var lastCheckRows = sheet.getRange(2, 1, numRows, 8).getValues();
      var cleanTargetName = hoVaTen ? hoVaTen.trim().toLowerCase() : '';
      var cleanTargetUser = payload.username ? payload.username.trim().toLowerCase() : '';
      var nowMs = time ? time.getTime() : new Date().getTime();
      
      for (var ci = 0; ci < lastCheckRows.length; ci++) {
        var cRow = lastCheckRows[ci];
        if (!cRow[0]) continue;
        var cName = cRow[0].toString().trim().toLowerCase();
        var cJson = null;
        if (cRow[7]) {
          try { cJson = typeof cRow[7] === 'string' ? JSON.parse(cRow[7]) : cRow[7]; } catch(e){}
        }
        var isMatch = (cleanTargetName && cName === cleanTargetName) ||
                      (cleanTargetUser && cName === cleanTargetUser) ||
                      (cJson && cJson.username && cJson.username.toString().toLowerCase() === cleanTargetUser);
                      
        if (isMatch) {
          var lastLogTs = getLogTimestampSafe(cRow[2], cRow[7]);
          if (lastLogTs > 0) {
            var diffMs = nowMs - lastLogTs;
            if (diffMs >= 0 && diffMs < 15 * 60 * 1000) {
              var remainingSecs = Math.ceil((15 * 60 * 1000 - diffMs) / 1000);
              var remainingMins = Math.ceil(remainingSecs / 60);
              var lastFormatted = cRow[2] ? cRow[2].toString().replace(/^['"\s]+|['"\s]+$/g, '') : '';
              return jsonResponse(false, 'Hệ thống chống spam: Bạn vừa chấm công lúc ' + lastFormatted + '. Quy định tối thiểu sau 15 phút mới được chấm tiếp (vui lòng đợi thêm ' + remainingMins + ' phút).');
            }
          }
          break; // Đã tìm thấy lượt chấm công mới nhất của nhân viên này
        }
      }
    } catch(spamErr) {
      Logger.log('Cooldown check error: ' + spamErr.message);
    }
  }
  
  // === PHASE 2: Auto Shift Lookup & Late Calculation ===
  var serverShift = '';
  var serverLateMins = 0;
  var checklistPending = false;
  
  if (loaiChamCong.indexOf('Vào ca') === 0 || loaiChamCong === 'IN') {
    // 1. Find today's shift from schedule sheet
    try {
      var todayDate = time;
      var dayOfWeek = todayDate.getDay(); // 0=Sun
      var dayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=Mon, 6=Sun
      var monthNum = String(todayDate.getMonth() + 1).padStart(2, '0');
      var yearNum = todayDate.getFullYear();
      var monthSheetName = 'Tháng ' + monthNum + '/' + yearNum;
      
      var schedSheet = ss.getSheetByName(monthSheetName);
      if (schedSheet) {
        var schedData = schedSheet.getDataRange().getDisplayValues();
        var todayDayStr = String(todayDate.getDate()).padStart(2, '0');
        var todayMonthStr = String(todayDate.getMonth() + 1).padStart(2, '0');
        var inCorrectWeek = false;
        
        for (var si = 0; si < schedData.length; si++) {
          var cellStr = schedData[si][0] ? schedData[si][0].toString() : '';
          
          if (cellStr.indexOf('TUẦN ') >= 0) {
            var dateMatch = cellStr.match(/(\d{2})\/(\d{2})\s*-\s*(\d{2})\/(\d{2})/);
            if (dateMatch) {
              var todayNum = parseInt(todayDayStr);
              var todayMon = parseInt(todayMonthStr);
              var startNum = parseInt(dateMatch[1]);
              var startMon = parseInt(dateMatch[2]);
              var endNum = parseInt(dateMatch[3]);
              var endMon = parseInt(dateMatch[4]);
              
              if (startMon === endMon) {
                inCorrectWeek = (todayMon === startMon && todayNum >= startNum && todayNum <= endNum);
              } else {
                inCorrectWeek = (todayMon === startMon && todayNum >= startNum) || (todayMon === endMon && todayNum <= endNum);
              }
            }
            continue;
          }
          
          if (!inCorrectWeek) continue;
          
          var isApproval = cellStr.indexOf('┗') >= 0;
          var cleanName = isApproval ? cellStr.replace('┗ ', '').replace('┗', '').trim() : cellStr.trim();
          
          if (cleanName.toLowerCase() === payload.fullname.toLowerCase()) {
            var shiftVal = schedData[si][dayIdx + 1] ? schedData[si][dayIdx + 1].toString().trim() : 'OFF';
            if (shiftVal === '' || shiftVal === '0:00' || shiftVal === '00:00') shiftVal = 'OFF';
            if (isApproval) { serverShift = shiftVal; }
            else if (!serverShift) { serverShift = shiftVal; }
          }
        }
      }
    } catch(schedErr) { Logger.log('Phase2 shift lookup error: ' + schedErr.message); }
    
    // 2. Calculate late minutes
    if (serverShift && serverShift !== 'OFF' && serverShift !== 'RẢNH' && !serverShift.startsWith('OFF')) {
      try {
        var shiftParts = serverShift.split(':');
        if (shiftParts.length === 2) {
          var shiftHour = parseInt(shiftParts[0]);
          var shiftMin = parseInt(shiftParts[1]);
          var nowHour = time.getHours();
          var nowMin = time.getMinutes();
          serverLateMins = (nowHour * 60 + nowMin) - (shiftHour * 60 + shiftMin);
          if (serverLateMins < 0) serverLateMins = 0;
        }
      } catch(lateErr) {}
    }
    
    // 3. Check if checklist is done today
    try {
      var clSheet = ss.getSheetByName('ChecklistLogs');
      if (clSheet && clSheet.getLastRow() > 1) {
        var todayFmt = Utilities.formatDate(time, CONFIG.TIMEZONE, 'dd/MM/yyyy');
        var clData = clSheet.getDataRange().getValues();
        checklistPending = true;
        for (var cli = clData.length - 1; cli > 0; cli--) {
          if (clData[cli][1] && clData[cli][1].toString() === todayFmt &&
              clData[cli][3] && clData[cli][3].toString().toLowerCase() === (payload.username || '').toLowerCase()) {
            checklistPending = false;
            break;
          }
        }
      }
    } catch(clErr) {}
  }
  
  // Apply late info to check-in type
  if (serverLateMins > 5) {
    loaiChamCong += ' (Trễ ' + serverLateMins + 'p)';
  } else if (payload.lateMins && payload.lateMins > 0) {
    loaiChamCong += ' (Trễ ' + payload.lateMins + 'p)';
  }
  
  // === COL C: THỜI GIAN (DD/MM/YYYY HH:MM:SS) ===
  var thoiGian = payload.time || Utilities.formatDate(time, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
  
  // === COL D: VỊ TRÍ (Google Maps reverse geocode) ===
  var viTri = '';
  var isRawCoords = /^-?\d{1,2}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(payload.location);
  if (payload.location && payload.location.length > 5 && !isRawCoords && payload.location.indexOf('Throttled') === -1) {
    viTri = payload.location;
  } else if (payload.lat && payload.lng) {
    viTri = reverseGeocodeGoogle(Number(payload.lat), Number(payload.lng));
  } else {
    viTri = 'Khong xac dinh';
  }
  
  // === COL F: KHOẢNG CÁCH (meters) & COL E: XÁC MINH ===
  var isValid = isAuthorizedTest || (distMeters <= allowedRadius);
  var xacMinh = isValid ? 'Hợp lệ' : 'Không hợp lệ';
  
  // === COL G: LINK HÌNH ẢNH & UNIQUE CHECKIN ID ===
  var checkinId = payload.checkinId || ('CHK_' + (payload.username ? payload.username.toString().replace(/[^a-zA-Z0-9]/g, '') : 'user') + '_' + time.getTime() + '_' + Math.floor(Math.random() * 1000));
  var imageUrl = '';
  if (payload.image && payload.image !== 'PENDING' && payload.image.length > 100) {
    try {
      imageUrl = uploadImageBlobToDrive(payload.image, hoVaTen);
    } catch(imgErr) {
      Logger.log('Lỗi upload ảnh trực tiếp trong handleCheckInOut: ' + imgErr.message);
    }
  }

  // TUYỆT ĐỐI KHÔNG LẤY ẢNH CỦA LƯỢT CHẤM CÔNG KHÁC / NGƯỜI KHÁC:
  // Nếu chưa có ảnh (hoặc client gửi PENDING), để trống để luồng UPLOAD_CHECKIN_IMAGE cập nhật đúng ảnh của lượt này
  if (!imageUrl || imageUrl.indexOf('drive.google.com') < 0) {
    imageUrl = '';
  }
  
  // === COL H: DATA JSON ===
  var dataJson = JSON.stringify({
    checkinId: checkinId,
    username: payload.username || '',
    hoVaTen: hoVaTen,
    loaiChamCong: loaiChamCong,
    thoiGian: thoiGian,
    viTri: viTri,
    xacMinh: xacMinh,
    khoangCach: distMeters + 'm',
    linkAnh: imageUrl,
    toaDo: { lat: payload.lat, lng: payload.lng },
    caLam: serverShift || payload.shift || '',
    diTre: serverLateMins || payload.lateMins || 0,
    timestamp: time.toISOString()
  });
  
  // === INSERT AT ROW 2 WITH LOCK ===
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    sheet.insertRowBefore(2);
    var colGVal = '';
    if (imageUrl && imageUrl.indexOf('drive.google.com') >= 0) {
      // Dùng dấu chấm phẩy ';' chuẩn theo Locale Việt Nam của Google Sheets
      colGVal = '=HYPERLINK("' + imageUrl + '"; "📷 Xem ảnh")';
    }
    var newRow = [hoVaTen, loaiChamCong, "'" + thoiGian, viTri, xacMinh, distMeters + 'm', colGVal, dataJson];
    sheet.getRange(2, 1, 1, 8).setValues([newRow]);
    
    // === AUTO-FORMAT THE NEW ROW ===
    formatCheckInRow(sheet, 2, isValid, imageUrl);
  
    // === PHASE 2: Auto Penalty for Late Arrivals ===
    if (serverLateMins > 5 && isValid) {
      try {
        var penaltyAmount = Math.floor(serverLateMins / 15) * 10000;
        if (penaltyAmount < 10000) penaltyAmount = 10000;
        var penaltySheet = ss.getSheetByName('BonusPenalty');
        if (!penaltySheet) {
          penaltySheet = ss.insertSheet('BonusPenalty');
          penaltySheet.appendRow(['ID', 'Date', 'TargetUsername', 'TargetFullname', 'Type', 'Amount', 'Reason', 'CreatedBy']);
        }
        var penaltyId = 'AUTO_' + time.getTime();
        var dateStr = Utilities.formatDate(time, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm');
        penaltySheet.appendRow([
          penaltyId, dateStr, payload.username, payload.fullname,
          'PENALTY', penaltyAmount,
          'Tự động: Đi trễ ' + serverLateMins + ' phút (ca ' + serverShift + ')',
          'SYSTEM'
        ]);
        Logger.log('Auto penalty: ' + payload.fullname + ' trễ ' + serverLateMins + 'p → -' + penaltyAmount + 'đ');
      } catch(penErr) { Logger.log('Auto penalty error: ' + penErr.message); }
      // Phase 3: Deduct King Coins for late
      recordKingCoins(payload.username, payload.fullname, 'Đi trễ ' + serverLateMins + 'p (ca ' + serverShift + ')', -10, 'CheckIn');
      // Phase 5: Notify admin about late arrival
      createNotification('ALL', '⚠️ Nhân viên đi trễ', payload.fullname + ' đi trễ ' + serverLateMins + ' phút (ca ' + serverShift + ')', 'warning', 'checkin');
    } else if (serverShift && serverShift !== 'OFF' && isValid && (loaiChamCong === 'Vào ca' || loaiChamCong.indexOf('Vào ca') >= 0)) {
      // Phase 3: Award King Coins for on-time arrival
      recordKingCoins(payload.username, payload.fullname, 'Vào ca đúng giờ (' + serverShift + ')', 5, 'CheckIn');
    }
  
    // Phase A: Invalidate cache after check-in
    invalidateGetDataCache(payload.username);

    // === GỬI EMAIL THÔNG BÁO TỨC THÌ TẠI MÁY CHỦ (BẢO ĐẢM 100% GỬI KHI SPREADSHEET CÓ DÒNG) ===
    try {
      if (!payload.email || payload.email.indexOf('@') === -1 || payload.email.indexOf('@kingsgrill.com') !== -1) {
        if ((payload.username || '').toLowerCase() === 'admin') {
          payload.email = 'dmt.7121@gmail.com';
        } else {
          try {
            var uSheet = ss.getSheetByName(CONFIG.SHEET_USERS || 'DATA');
            if (uSheet) {
              var uRows = uSheet.getDataRange().getValues();
              for (var r = 1; r < uRows.length; r++) {
                if (uRows[r][0] && uRows[r][0].toString().toLowerCase() === (payload.username || '').toLowerCase()) {
                  if (uRows[r][4] && uRows[r][4].toString().indexOf('@') > 0) {
                    payload.email = uRows[r][4].toString().trim();
                  } else if (uRows[r][3] && uRows[r][3].toString().indexOf('@') > 0) {
                    payload.email = uRows[r][3].toString().trim();
                  }
                  break;
                }
              }
            }
          } catch(ex) {}
        }
      }
      sendCheckInEmail(payload, time, viTri, imageUrl, distMeters + 'm', isValid);
    } catch(mailErr) {
      Logger.log('Lỗi gửi email trong handleCheckInOut: ' + mailErr.message);
    }
  
    return jsonResponse(true, {
      message: 'Chấm công thành công',
      checkinId: checkinId,
      imageUrl: imageUrl,
      distMeters: distMeters,
      isValid: isValid,
      timeISO: time.toISOString(),
      thoiGian: thoiGian,
      viTri: viTri,
      shift: serverShift || '',
      lateMins: serverLateMins,
      checklistPending: checklistPending
    });
  } catch (eRow) {
    Logger.log('Lỗi ghi dòng: ' + eRow.message);
  } finally {
    lock.releaseLock();
  }
  
  // XÓA GỌI EMAIL Ở ĐÂY ĐỂ TRÁNH BLOCK API
  
  return jsonResponse(true, {
    message: 'Chấm công thành công',
    checkinId: checkinId,
    imageUrl: imageUrl,
    distMeters: distMeters,
    isValid: isValid,
    timeISO: time.toISOString(),
    thoiGian: thoiGian,
    viTri: viTri,
    shift: serverShift || '',
    lateMins: serverLateMins,
    checklistPending: checklistPending
  });
}

function handleSendEmailNotification(payload) {
  try {
    var cleanUser = (payload.username || '').trim().toLowerCase();
    var isAuthorizedTest = (cleanUser === 'admin' || cleanUser === 'testapp' || cleanUser === 'tester');
    var isValid = (payload.isValid === true || payload.isValid === 'true');
    if (!isValid && !isAuthorizedTest) {
      Logger.log('Blocked sending email notification for invalid out-of-radius check-in: ' + payload.fullname);
      return jsonResponse(false, 'Từ chối gửi email: Lượt chấm công không hợp lệ hoặc nằm ngoài bán kính.');
    }

    // Reconstruct time object
    var timeObj = payload.timeISO ? new Date(payload.timeISO) : new Date();
    
    // distMeters: đảm bảo là string có đơn vị
    var distMeters = payload.distMeters;
    if (typeof distMeters === 'number') {
      distMeters = distMeters + 'm';
    } else if (typeof distMeters === 'string' && distMeters && distMeters.indexOf('m') === -1) {
      distMeters = distMeters + 'm';
    }
    
    Logger.log('SEND_EMAIL_NOTIFICATION: fullname=' + payload.fullname + ', email=' + payload.email + ', type=' + payload.type + ', isValid=' + isValid + ', dist=' + distMeters);
    
    sendCheckInEmail(payload, timeObj, payload.viTri, payload.imageUrl, distMeters, isValid);
    return jsonResponse(true, 'Đã gửi email');
  } catch (e) {
    Logger.log('LỖI GỬI EMAIL: ' + e.message + ' | Stack: ' + (e.stack || 'N/A'));
    // Ghi lỗi vào sheet config để dễ debug
    try {
      getSS().getSheetByName(CONFIG.SHEET_CONFIG).appendRow(['ERR_EMAIL_ASYNC', e.message, new Date()]);
    } catch(logErr) {}
    return jsonResponse(false, e.message);
  }
}

/**
 * Record suspicious or fraudulent check-in attempts outside the designated restaurant radius
 */
function recordFraudAlert(ss, payload, distMeters, allowedRadius, customReason) {
  try {
    var alertSheet = ss.getSheetByName('FraudAlerts');
    if (!alertSheet) {
      alertSheet = ss.insertSheet('FraudAlerts');
      alertSheet.appendRow(['Thời gian', 'Tài khoản', 'Họ và tên', 'Loại chấm công', 'Khoảng cách', 'Bán kính cho phép', 'Tọa độ gửi lên', 'Hành vi phát hiện']);
      var headerRange = alertSheet.getRange(1, 1, 1, 8);
      headerRange.setBackground('#991B1B').setFontColor('#FFFFFF').setFontWeight('bold');
    }
    var nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
    var coords = (payload.lat && payload.lng) ? (payload.lat + ', ' + payload.lng) : 'Không có tọa độ';
    var reason = customReason || ('Cố tình gửi chấm công ngoài bán kính (' + distMeters + 'm > ' + allowedRadius + 'm)');
    alertSheet.appendRow([
      nowStr,
      payload.username || 'N/A',
      payload.fullname || 'N/A',
      payload.type || 'N/A',
      distMeters + 'm',
      allowedRadius + 'm',
      coords,
      reason
    ]);
    
    // Gửi thông báo đến Admin
    try {
      createNotification('ALL', '🚨 Cảnh báo bảo mật chấm công', (payload.fullname || payload.username) + ': ' + reason, 'danger', 'fraud');
    } catch(eNotif) {}
  } catch(e) {
    Logger.log('recordFraudAlert error: ' + e.message);
  }
}

/**
 * Auto-format header row of ✔️CHẤM CÔNG sheet
 * Professional styling: gradient dark blue, white bold text, frozen
 */
function formatCheckInHeader(sheet) {
  try {
    var headerRange = sheet.getRange(1, 1, 1, 8);
    var headers = headerRange.getValues()[0];
    
    // Only format if header exists and isn't already styled
    if (!headers[0] || headers[0].toString().trim() === '') {
      // Set header values
      headerRange.setValues([['👤 HỌ VÀ TÊN', '🔄 LOẠI CHẤM CÔNG', '🕒 THỜI GIAN', '📍 VỊ TRÍ', '🛡️ XÁC MINH', '📏 KHOẢNG CÁCH', '📷 LINK HÌNH ẢNH', 'JSON']]);
    }
    
    // Tắt viền mặc định của Google Sheets và dọn rác Định dạng có điều kiện (CF Rules)
    try { 
      sheet.setHiddenGridlines(true); 
      sheet.clearConditionalFormatRules(); // Bắt buộc xoá sạch rule màu nổi bị dính từ cũ
    } catch(ge){}
    
    // Style header
    headerRange
      .setBackground('#1e293b') // Slate 800 - rất VIP
      .setFontColor('#f8fafc')
      .setFontWeight('bold')
      .setFontSize(11)
      .setFontFamily('Questrial')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);
    
    // Viền nhẹ dưới cùng cho Header
    headerRange.setBorder(null, null, true, null, null, null, '#0f172a', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    
    // Set row height for header
    sheet.setRowHeight(1, 44);
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    // Set column widths for professional layout
    sheet.setColumnWidth(1, 180);  // HỌ VÀ TÊN
    sheet.setColumnWidth(2, 140);  // LOẠI CHẤM CÔNG
    sheet.setColumnWidth(3, 160);  // THỜI GIAN
    sheet.setColumnWidth(4, 200);  // VỊ TRÍ
    sheet.setColumnWidth(5, 120);  // XÁC MINH
    sheet.setColumnWidth(6, 130);  // KHOẢNG CÁCH
    sheet.setColumnWidth(7, 150);  // LINK HÌNH ẢNH
    sheet.setColumnWidth(8, 80);   // JSON
    
    // Hide JSON column (H) - data backup, not for human reading
    sheet.hideColumns(8, 1);
  } catch(e) {
    Logger.log('formatCheckInHeader error: ' + e.message);
  }
}

/**
 * Auto-format a single data row for professional appearance (Dùng cho Check-in mới) - Optimized for Speed
 */
function formatCheckInRow(sheet, row, isValid, imgUrl) {
  try {
    var rowRange = sheet.getRange(row, 1, 1, 8);
    var isVaoCa = sheet.getRange(row, 2).getValue() === 'Vào ca';
    
    // Batch base styling
    rowRange
      .setFontFamily('Questrial')
      .setFontSize(10)
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('center')
      .setFontColor('#334155');
    sheet.setRowHeight(row, 36);

    // Prepare arrays for batch formatting
    var bgColors = [['#ffffff', isVaoCa ? '#f0fdf4' : '#fef2f2', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff']];
    var fontColors = [['#0f172a', isVaoCa ? '#15803d' : '#dc2626', '#334155', '#475569', '#334155', '#334155', '#2563eb', '#94a3b8']];
    var fontWeights = [['bold', 'bold', 'normal', 'normal', 'normal', 'normal', 'bold', 'normal']];
    var aligns = [['left', 'center', 'center', 'left', 'center', 'center', 'center', 'left']];
    
    rowRange.setBackgrounds(bgColors);
    rowRange.setFontColors(fontColors);
    rowRange.setFontWeights(fontWeights);
    rowRange.setHorizontalAlignments(aligns);
    
    // Specific cell adjustments
    sheet.getRange(row, 3).setFontFamily('Roboto Mono');
    sheet.getRange(row, 4).setWrap(true).setFontSize(9);
    sheet.getRange(row, 6).setFontSize(9);
    
    if (imgUrl && imgUrl !== 'Lỗi ảnh' && imgUrl !== 'Đang tải ảnh...' && imgUrl !== 'PENDING' && imgUrl.indexOf('drive.google.com') >= 0) {
      var cellG = sheet.getRange(row, 7);
      var linkColor = isValid ? '#10b981' : '#ef4444';
      try {
        cellG.setFormula('=HYPERLINK("' + imgUrl + '"; "📷 Xem ảnh")')
             .setFontColor(linkColor)
             .setFontSize(9);
      } catch (fErr) {
        try {
          cellG.setValue(imgUrl)
               .setFontColor(linkColor)
               .setFontSize(9);
        } catch (fErr2) {}
      }
    }
    
    sheet.getRange(row, 8).setFontSize(7);
    rowRange.setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  } catch(e) {
    Logger.log('formatCheckInRow error: ' + e.message);
  }
}

/**
 * Tiện ích dọn dẹp hàng loạt toàn bộ Sheet Chấm Công từ Menu
 * SỬ DỤNG SHEETS API V4 ĐỂ TỐI ƯU TỐC ĐỘ ⚡
 */
function formatEntireCheckInSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
  if (!sheet) {
    var ui = getUI();
    if (ui) ui.alert('Không tìm thấy sheet chấm công: ' + CONFIG.SHEET_LOGS);
    return;
  }
  
  var ui = getUI();
  if (ui) {
    var confirm = ui.alert('Xác nhận dọn dẹp hàng loạt', 
       'Áp dụng Format chuyên nghiệp cho toàn bộ dữ liệu?\n' +
       '- Font Questrial\n' +
       '- Tự sửa lỗi ngày giờ (thêm giây)\n' +
       '- Rút gọn link Drive\n\nQuá trình này diễn ra cực nhanh bằng API!', 
       ui.ButtonSet.YES_NO);
    if (confirm !== ui.Button.YES) return;
  }

  ss.toast('Đang áp dụng API cấu hình cao siêu tốc...', 'Đang xử lý', -1);
  
  // 1. Format Header
  formatCheckInHeader(sheet);
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    ss.toast('Không có dữ liệu để dọn dẹp', 'Hoàn tất', 3);
    return;
  }
  
  var rowsNum = lastRow - 1;
  var rangeObj = sheet.getRange(2, 1, rowsNum, 8);
  var data = rangeObj.getValues();
  
  var backgrounds = [];
  var aligns = [];
  var fontWeights = [];
  var fontColors = [];
  var fonts = [];
  var fontSizes = [];
  var wraps = [];
  var vAligns = [];
  
  var newValues = [];
  var hasValuesUpdate = false;
  
  // Xử lý logic trên bộ nhớ
  for (var i = 0; i < rowsNum; i++) {
    var rData = data[i];
    var isEven = (i % 2 === 0);
    var bg = isEven ? '#f8fafc' : '#ffffff';
    
    // Default cho row
    var b = Array(8).fill(bg);
    var a = Array(8).fill('center');
    var fw = Array(8).fill('normal');
    var fc = Array(8).fill('#334155');
    var f = Array(8).fill('Questrial');
    var fs = Array(8).fill(10);
    var w = Array(8).fill(false);
    var v = Array(8).fill('middle');
    
    var nv = rData.slice(); // Bản sao của dòng
    
    // --- CỘT A (Họ Tên)
    a[0] = 'left'; fw[0] = 'bold'; fc[0] = '#0f172a';
    
    // --- CỘT B (Loại)
    if (rData[1] === 'Vào ca') { b[1] = '#f0fdf4'; fc[1] = '#15803d'; fw[1] = 'bold'; }
    else if (rData[1] === 'Ra ca') { b[1] = '#fef2f2'; fc[1] = '#dc2626'; fw[1] = 'bold'; }
    
    // --- CỘT C (Thời gian format DD/MM/YYYY HH:MM:SS)
    // Cực kỳ quan trọng: Nếu hàm getValues() trả về đối tượng Date, ta phải format lại chuẩn DD/MM
    var timeVal = rData[2];
    if (timeVal instanceof Date) {
      var timeStr = Utilities.formatDate(timeVal, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      nv[2] = "'" + timeStr; // Thêm dấu nháy kép để ép text
      hasValuesUpdate = true;
    } else if (typeof timeVal === 'string' && timeVal.indexOf('GMT') >= 0) {
      // Trường hợp nó dính chuỗi dị như Thu Apr 02 ...
      var dStr = new Date(timeVal);
      if (!isNaN(dStr.getTime())) {
        nv[2] = "'" + Utilities.formatDate(dStr, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
        hasValuesUpdate = true;
      }
    } else if (typeof timeVal === 'string') {
      var timeStr = timeVal.trim();
      // Nếu thiếu giây (VD: 07/04/2026 15:25) -> thêm :00
      if (timeStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}\s\d{1,2}:\d{2}$/)) {
        timeStr += ':00';
        nv[2] = "'" + timeStr; // Ép text
        hasValuesUpdate = true;
      } else if (timeStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}\s\d{1,2}:\d{2}:\d{2}$/)) {
        // Nếu đã đúng form thì vẫn nên ép text để ngừa lỗi nhảy ngày của VN
        nv[2] = "'" + timeStr;
        hasValuesUpdate = true; // Force update to string format
      }
    }
    f[2] = 'Roboto Mono';
    
    // --- CỘT D (Vị trí) - wrap text
    a[3] = 'left'; fs[3] = 9; w[3] = true; fc[3] = '#475569';
    
    // --- CỘT E (Xác minh) - Format bình thường
    var isHopLe = (rData[4] && rData[4].toString().toUpperCase().indexOf('HỢP LỆ') >= 0 && rData[4].toString().toUpperCase().indexOf('KHÔNG') === -1);
    nv[4] = isHopLe ? 'Hợp lệ' : 'Không hợp lệ';
    hasValuesUpdate = true;
    fc[4] = '#334155'; fw[4] = 'normal';
    
    // --- CỘT F (Khoảng cách) - Căn giữa
    fs[5] = 9; a[5] = 'center';
    
    // --- CỘT G (Ảnh) - Hyperlink (Dùng dấu ";" chuẩn Locale Việt Nam)
    var imgStr = rData[6] ? rData[6].toString().trim() : '';
    var rowJsonStr = rData[7] ? rData[7].toString().trim() : '';
    var jsonDriveUrl = '';
    if (rowJsonStr && rowJsonStr.indexOf('drive.google.com') >= 0) {
      try {
        var pJson = JSON.parse(rowJsonStr);
        if (pJson.linkAnh && pJson.linkAnh.indexOf('drive.google.com') >= 0) {
          jsonDriveUrl = pJson.linkAnh.trim();
        }
      } catch(e) {
        var m = rowJsonStr.match(/https?:\/\/drive\.google\.com\/[^\s"',}]+/);
        if (m) jsonDriveUrl = m[0];
      }
    }
    
    if (imgStr.indexOf('#ERROR!') >= 0 || imgStr.indexOf('Đang tải ảnh') >= 0 || imgStr === '' || imgStr === 'PENDING') {
      if (jsonDriveUrl) {
        nv[6] = '=HYPERLINK("' + jsonDriveUrl + '"; "📷 Xem ảnh")';
        hasValuesUpdate = true;
      }
    } else if (imgStr.indexOf('drive.google.com') >= 0) {
      var driveLink = imgStr;
      var match = imgStr.match(/https?:\/\/drive\.google\.com\/[^\s"';,]+/);
      if (match) driveLink = match[0];
      nv[6] = '=HYPERLINK("' + driveLink + '"; "📷 Xem ảnh")';
      hasValuesUpdate = true;
    }
    fs[6] = 9; fc[6] = '#2563eb'; fw[6] = 'bold';
    
    // --- CỘT H (JSON)
    fs[7] = 7; fc[7] = '#94a3b8'; a[7] = 'left';
    
    backgrounds.push(b);
    aligns.push(a);
    fontWeights.push(fw);
    fontColors.push(fc);
    fonts.push(f);
    fontSizes.push(fs);
    wraps.push(w);
    vAligns.push(v);
    newValues.push(nv);
  }
  
  // 1. Áp dụng giá trị mới (Thời gian + Formulas) qua API siêu tốc
  if (hasValuesUpdate) {
    try {
      Sheets.Spreadsheets.Values.update(
        { values: newValues },
        CONFIG.SPREADSHEET_ID,
        CONFIG.SHEET_LOGS + '!A2:H' + lastRow,
        { valueInputOption: 'USER_ENTERED' }
      );
    } catch(errApi) {
      // Fallback nếu API V4 chưa mở (rất hiếm vì Engine đã gọi)
      rangeObj.setValues(newValues); 
    }
  }
  
  // 2. Chạy khối lệnh format định dạng (batch set properties) qua Sheets API v4 siêu tốc ⚡
  try {
    var sheetId = sheet.getSheetId();
    var rows = [];
    
    for (var r = 0; r < rowsNum; r++) {
      var rowValues = [];
      for (var c = 0; c < 8; c++) {
        var bgHex = backgrounds[r][c];
        var fontColorHex = fontColors[r][c];
        
        rowValues.push({
          userEnteredFormat: {
            backgroundColor: hexToRgb(bgHex),
            textFormat: {
              bold: fontWeights[r][c] === 'bold',
              fontFamily: fonts[r][c],
              fontSize: fontSizes[r][c],
              foregroundColor: hexToRgb(fontColorHex)
            },
            horizontalAlignment: aligns[r][c].toUpperCase(),
            verticalAlignment: vAligns[r][c].toUpperCase() === 'MIDDLE' ? 'MIDDLE' : 'CENTER',
            wrapStrategy: wraps[r][c] ? 'WRAP' : 'CLIP'
          }
        });
      }
      rows.push({ values: rowValues });
    }
    
    var request = {
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: 1, // Dòng 2 (0-indexed)
          endRowIndex: lastRow,
          startColumnIndex: 0,
          endColumnIndex: 8
        },
        rows: rows,
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
      }
    };
    
    Sheets.Spreadsheets.batchUpdate({ requests: [request] }, CONFIG.SPREADSHEET_ID);
  } catch (errFormat) {
    Logger.log('Sheets API v4 format failed, falling back to SpreadsheetApp: ' + errFormat.toString());
    rangeObj.setBackgrounds(backgrounds);
    rangeObj.setHorizontalAlignments(aligns);
    rangeObj.setVerticalAlignments(vAligns);
    rangeObj.setFontWeights(fontWeights);
    rangeObj.setFontColors(fontColors);
    rangeObj.setFontFamilies(fonts);
    rangeObj.setFontSizes(fontSizes);
    rangeObj.setWraps(wraps);
  }
  
  // Set lưới (Border) tiêu chuẩn, rõ ràng, hiển thị chuẩn Grid Excel/Sheets
  rangeObj.setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);
  
  // Tinh gọn Sheet (Xóa dòng thừa)
  try {
    var maxRows = sheet.getMaxRows();
    if (maxRows > rowsNum + 15) {
      sheet.deleteRows(rowsNum + 5, maxRows - rowsNum - 5);
    }
  } catch(errDel){}
  
  // Cân bằng chiều cao các hàng để đồng nhất
  try {
    // API chỉ hỗ trợ set row height bằng hàm riêng biệt, nhưng dùng SpreadSheetApp cũng ko chậm cho setRowHeights
    sheet.setRowHeightsForRange(2, rowsNum, 36); 
  } catch(esrh){}
  
  ss.toast('✅ Hoàn thành 100%! ' + rowsNum + ' dòng đã được làm đẹp chuẩn chuyên nghiệp.', 'Xong', 5);
}

// Email template v8 - FIXED OVERFLOW, table-layout:fixed, word-break
function buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, isAdmin) {
  var typeStr = payload.type ? String(payload.type) : 'Vào ca';
  var fullnameStr = payload.fullname ? String(payload.fullname) : 'Nhân sự';
  var usernameStr = payload.username ? String(payload.username) : '';
  var roleStr = payload.role === 'admin' ? 'Quản lý' : (payload.position || 'Nhân sự');
  var shiftStr = payload.shift || 'Theo phân ca';
  var timeStr = payload.time || (formattedTimeUI ? formattedTimeUI.replace(/<br\s*\/?>/gi, ' ') : '');
  var isCheckIn = typeStr.indexOf('Vào ca') >= 0;
  
  if (!loc || String(loc) === 'undefined' || !String(loc).trim()) {
    loc = "Nhà hàng King's Grill (Bán kính ≤ 20m)";
  }
  
  // Security hash token for fraud prevention verification
  var strForHash = usernameStr + '_' + timeStr + '_' + (distMeters || '0') + '_KG';
  var hashVal = 0;
  for (var i = 0; i < strForHash.length; i++) {
    hashVal = ((hashVal << 5) - hashVal) + strForHash.charCodeAt(i);
    hashVal |= 0;
  }
  var securityHash = 'KG#' + Math.abs(hashVal).toString(36).toUpperCase().padStart(6, '0');

  // Themes and colors adhering to Design System & WCAG AA standards
  var statusBadgeBg = isValid ? (isCheckIn ? '#ecfdf5' : '#f0f9ff') : '#fff1f2';
  var statusBorderColor = isValid ? (isCheckIn ? '#10b981' : '#0284c7') : '#f43f5e';
  var statusTextColor = isValid ? (isCheckIn ? '#065f46' : '#0369a1') : '#9f1239';
  var statusIcon = isValid ? (isCheckIn ? '🟢' : '🔵') : '⚠️';
  var statusTitle = isAdmin
    ? (isCheckIn ? 'GHI NHẬN LƯỢT VÀO CA' : 'GHI NHẬN LƯỢT RA CA')
    : (isCheckIn ? 'XÁC NHẬN VÀO CA THÀNH CÔNG' : 'XÁC NHẬN RA CA THÀNH CÔNG');
  if (!isValid) statusTitle += ' (NGOÀI BÁN KÍNH)';

  var greetingText = isAdmin
    ? 'Hệ thống ghi nhận lượt chấm công từ nhân sự <b>' + fullnameStr + '</b> (@' + usernameStr + ').'
    : 'Xin chào <b>' + fullnameStr + '</b>, hệ thống đã ghi nhận và xác thực thành công lượt <b>' + typeStr + '</b> của bạn.';

  var dashUrl = CONFIG.WEB_APP_URL || 'https://kg-checkin.pages.dev/';
  var logoUrl = (CONFIG.WEB_APP_URL || 'https://kg-checkin.pages.dev/').replace(/\/+$/, '') + '/logo_badge_squircle.png?v=1';
  var year = new Date().getFullYear();

  return '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
    + '<html xmlns="http://www.w3.org/1999/xhtml" lang="vi">'
    + '<head>'
    + '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
    + '<meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />'
    + '<title>King\'s Grill HR - ' + typeStr + '</title>'
    + '<style type="text/css">'
    + 'body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }'
    + 'table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }'
    + 'img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }'
    + 'body { margin: 0; padding: 0; width: 100% !important; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }'
    + '@media only screen and (max-width: 600px) {'
    + '  .container-table { width: 100% !important; max-width: 100% !important; }'
    + '  .content-padding { padding: 16px !important; }'
    + '  .header-padding { padding: 24px 16px !important; }'
    + '}'
    + '</style>'
    + '</head>'
    + '<body style="margin: 0; padding: 0; background-color: #f1f5f9; color: #0f172a;">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f1f5f9; table-layout: fixed;">'
    + '<tr>'
    + '<td align="center" style="padding: 24px 12px;">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%" class="container-table" style="max-width: 580px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">'
    
    // Header
    + '<tr>'
    + '<td style="background-color: #0b1329; padding: 28px 24px 24px; text-align: center;" class="header-padding">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%">'
    + '<tr><td align="center">'
    + '<table border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;"><tr>'
    + '<td align="center" valign="middle" style="width: 62px; height: 62px; text-align: center; vertical-align: middle;">'
    + '<img src="' + logoUrl + '" alt="King\'s Grill Logo" width="62" height="62" style="display: block; width: 62px; height: 62px; border: 0; outline: none; text-decoration: none; margin: 0 auto;" />'
    + '</td>'
    + '</tr></table>'
    + '<h1 style="margin: 12px 0 2px; color: #ffffff; font-size: 20px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase;">KING&#39;S GRILL</h1>'
    + '<p style="margin: 0; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;">HỆ THỐNG CHẤM CÔNG &amp; QUẢN TRỊ NHÂN SỰ</p>'
    + '</td></tr></table>'
    + '</td>'
    + '</tr>'
    
    // Status Hero
    + '<tr>'
    + '<td style="padding: 20px 24px 12px;" class="content-padding">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ' + statusBadgeBg + '; border: 1.5px solid ' + statusBorderColor + '; border-radius: 14px;">'
    + '<tr><td style="padding: 14px 16px;">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>'
    + '<td width="30" valign="middle" style="font-size: 20px; line-height: 1;">' + statusIcon + '</td>'
    + '<td valign="middle" style="padding-left: 8px;">'
    + '<div style="font-size: 14px; font-weight: 900; color: ' + statusTextColor + '; letter-spacing: 0.3px; text-transform: uppercase; line-height: 1.3;">' + statusTitle + '</div>'
    + '<div style="font-size: 11px; font-weight: 700; color: ' + statusTextColor + '; opacity: 0.85; margin-top: 2px;">' + (isValid ? 'Định vị GPS đạt chuẩn (Bán kính ≤ 20m)' : 'Cảnh báo: Ngoài bán kính 20m nhà hàng') + '</div>'
    + '</td>'
    + '</tr></table>'
    + '</td></tr></table>'
    + '<p style="margin: 16px 4px 6px; font-size: 13px; line-height: 1.5; color: #334155;">' + greetingText + '</p>'
    + '</td>'
    + '</tr>'
    
    // Core Details
    + '<tr>'
    + '<td style="padding: 6px 24px 20px;" class="content-padding">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px;">'
    + '<tr>'
    + '<td style="padding: 12px 16px; border-bottom: 1px solid #edf2f7;" width="38%" valign="top"><span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">👤 Nhân sự</span></td>'
    + '<td style="padding: 12px 16px; border-bottom: 1px solid #edf2f7;" width="62%" align="right" valign="top"><div style="font-size: 13px; font-weight: 800; color: #0f172a;">' + fullnameStr + '</div><div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 1px;">@' + usernameStr + ' &bull; ' + roleStr + '</div></td>'
    + '</tr>'
    + '<tr>'
    + '<td style="padding: 12px 16px; border-bottom: 1px solid #edf2f7;" valign="top"><span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">🕒 Thời gian</span></td>'
    + '<td style="padding: 12px 16px; border-bottom: 1px solid #edf2f7;" align="right" valign="top"><span style="font-size: 13px; font-weight: 900; color: #1e3a8a; font-family: monospace, sans-serif;">' + timeStr + '</span></td>'
    + '</tr>'
    + '<tr>'
    + '<td style="padding: 12px 16px; border-bottom: 1px solid #edf2f7;" valign="top"><span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">💼 Ca làm việc</span></td>'
    + '<td style="padding: 12px 16px; border-bottom: 1px solid #edf2f7;" align="right" valign="top"><span style="display: inline-block; padding: 2px 8px; background-color: #e0f2fe; color: #0369a1; border-radius: 6px; font-size: 11px; font-weight: 800;">' + shiftStr + '</span></td>'
    + '</tr>'
    + '<tr>'
    + '<td style="padding: 12px 16px; border-bottom: 1px solid #edf2f7;" valign="top"><span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">📍 Vị trí &amp; Khoảng cách</span></td>'
    + '<td style="padding: 12px 16px; border-bottom: 1px solid #edf2f7;" align="right" valign="top"><div style="font-size: 12px; font-weight: 700; color: #0f172a; line-height: 1.3;">' + loc + '</div><div style="margin-top: 3px;"><span style="display: inline-block; padding: 2px 8px; background-color: ' + (isValid ? '#dcfce7' : '#fee2e2') + '; color: ' + (isValid ? '#15803d' : '#b91c1c') + '; border-radius: 6px; font-size: 11px; font-weight: 800;">📏 ' + (distMeters || '<=20m') + ' (' + (isValid ? 'Hợp lệ' : 'Ngoài phạm vi') + ')</span></div></td>'
    + '</tr>'
    + '<tr>'
    + '<td style="padding: 12px 16px;" valign="top"><span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">🛡️ Chữ ký bảo mật</span></td>'
    + '<td style="padding: 12px 16px;" align="right" valign="top"><span style="font-family: monospace, sans-serif; font-size: 12px; font-weight: 800; color: #0284c7; background-color: #f0f9ff; padding: 2px 8px; border-radius: 6px; border: 1px solid #bae6fd;">' + securityHash + '</span></td>'
    + '</tr>'
    + '</table>'
    + '</td>'
    + '</tr>'
    
    // Action Button
    + '<tr>'
    + '<td style="padding: 8px 24px 24px; text-align: center;" class="content-padding">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 auto; max-width: 320px;">'
    + '<tr>'
    + '<td align="center" style="border-radius: 12px; background-color: #2563eb; background-image: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); box-shadow: 0 4px 14px rgba(37, 99, 235, 0.28);">'
    + '<a href="' + dashUrl + '" target="_blank" style="display: block; padding: 13px 20px; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; font-size: 13.5px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 12px; text-align: center; line-height: 1.2; letter-spacing: 0.2px; white-space: nowrap;">'
    + 'Mở Bảng Chấm Công WebApp &rarr;'
    + '</a>'
    + '</td>'
    + '</tr>'
    + '</table>'
    + '<div style="margin-top: 9px; font-size: 11px; color: #94a3b8; font-weight: 500; text-align: center;">'
    + 'Xem chi tiết lịch sử ca làm &amp; bảng công trực tuyến'
    + '</div>'
    + '</td>'
    + '</tr>'
    
    // Divider
    + '<tr><td style="padding: 0 24px;"><div style="height: 1px; background-color: #e2e8f0;"></div></td></tr>'
    
    // Footer
    + '<tr>'
    + '<td style="padding: 20px 24px; background-color: #f8fafc; text-align: center;" class="content-padding">'
    + '<p style="margin: 0 0 6px; font-size: 11px; color: #64748b; line-height: 1.4;">Email này được gửi tự động từ máy chủ bảo mật <strong>King&#39;s Grill OS</strong>.<br />Vui lòng không trả lời trực tiếp email này.</p>'
    + '<p style="margin: 0; font-size: 12px; font-weight: 800; color: #0f172a; letter-spacing: 0.5px;">KING&#39;S GRILL RESTAURANT &copy; ' + year + '</p>'
    + '</td>'
    + '</tr>'
    
    + '</table>'
    + '</td>'
    + '</tr>'
    + '</table>'
    + '</body></html>';
}

/**
 * SMART EMAIL SENDER: Tự động chọn kênh gửi email tối ưu
 * 1. Ưu tiên MailApp (local quota)
 * 2. Nếu hết quota → fallback sang relay accounts
 * 3. Round-robin qua các relay để phân tải đều
 */
var _relayIndex = 0; // Round-robin counter

function smartSendEmail(to, subject, body, htmlBody) {
  if (!to || !String(to).trim()) return 'empty';
  var cleanTo = String(to).trim();
  if (cleanTo.indexOf('@') === -1) return 'invalid_email';

  var emailOptions = {
    htmlBody: htmlBody,
    name: "King's Grill HR"
  };

  // 1. Thử gửi bằng MailApp trước (nhanh nhất)
  var localQuota = 0;
  try {
    localQuota = MailApp.getRemainingDailyQuota();
  } catch(qErr) {}

  if (localQuota >= 1) {
    try {
      MailApp.sendEmail(cleanTo, subject, body || '', emailOptions);
      Logger.log('📧 [LOCAL] Gửi OK → ' + cleanTo + ' (quota còn: ' + (localQuota - 1) + ')');
      return 'local';
    } catch(localErr) {
      Logger.log('⚠️ [LOCAL] Lỗi MailApp sang ' + cleanTo + ': ' + localErr.message);
    }
  }
  
  // 2. Fallback sang relay accounts
  var relayUrls = CONFIG.EMAIL_RELAY_URLS || [];
  if (relayUrls.length === 0) {
    throw new Error('Hết quota email local (' + localQuota + ') và chưa có relay account nào');
  }
  
  for (var attempt = 0; attempt < relayUrls.length; attempt++) {
    var idx = (_relayIndex + attempt) % relayUrls.length;
    var relayUrl = relayUrls[idx];
    
    try {
      var relayPayload = JSON.stringify({
        action: 'SEND_EMAIL',
        secret: CONFIG.EMAIL_RELAY_SECRET,
        to: cleanTo,
        subject: subject,
        body: body || '',
        htmlBody: htmlBody,
        name: "King's Grill HR"
      });
      
      var response = UrlFetchApp.fetch(relayUrl, {
        method: 'post',
        contentType: 'text/plain;charset=utf-8',
        payload: relayPayload,
        muteHttpExceptions: true,
        followRedirects: true
      });
      
      var result = JSON.parse(response.getContentText());
      if (result.ok) {
        _relayIndex = (idx + 1) % relayUrls.length;
        Logger.log('📧 [RELAY#' + (idx + 1) + '] Gửi OK → ' + cleanTo);
        return 'relay#' + (idx + 1);
      } else {
        Logger.log('⚠️ [RELAY#' + (idx + 1) + '] Thất bại: ' + (result.message || 'Unknown'));
      }
    } catch (relayErr) {
      Logger.log('⚠️ [RELAY#' + (idx + 1) + '] Error: ' + relayErr.message);
    }
  }
  
  throw new Error('Tất cả kênh email đều đã hết quota hoặc lỗi khi gửi tới ' + cleanTo);
}

function sendCheckInEmail(payload, timeObj, loc, imgUrl, distMeters, isValid) {
  var typeStr = payload.type ? String(payload.type) : 'Vào ca';
  var fullnameStr = payload.fullname ? String(payload.fullname) : 'Nhân sự';
  var timeStr = Utilities.formatDate(timeObj, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  var formattedTimeUI = timeStr.replace(' ', '<br/>');
  isValid = (isValid === true || isValid === 'true');

  var adminBody, empBody;
  try {
    adminBody = buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, true);
    empBody = buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, false);
  } catch (buildErr) {
    Logger.log('LỖI buildEmailHtml: ' + buildErr.message);
    return;
  }

  // Danh sách email admin nhận báo cáo
  var adminList = (CONFIG.EMAILS || []).map(function(e) { return String(e).trim(); })
    .filter(function(e) { return e.indexOf('@') > 0 && e.indexOf('@kingsgrill.com') === -1; });
  
  if (adminList.indexOf('dmt.7121@gmail.com') === -1) adminList.unshift('dmt.7121@gmail.com');
  if (adminList.indexOf('btob.7121@gmail.com') === -1) adminList.push('btob.7121@gmail.com');

  var sentEmails = {};

  // 1. GỬI ADMIN CHÍNH TRƯỚC TIÊN (BẢO ĐẢM dmt.7121@gmail.com LUÔN NHẬN ĐƯỢC ĐẦU TIÊN)
  var primaryAdmin = 'dmt.7121@gmail.com';
  try {
    smartSendEmail(
      primaryAdmin,
      '[KING\'S GRILL] ' + fullnameStr + ' - ' + typeStr + ' (' + timeStr + ')',
      'King\'s Grill HR: ' + fullnameStr + ' đã ' + typeStr + ' lúc ' + timeStr,
      adminBody
    );
    sentEmails[primaryAdmin] = true;
    Logger.log('✅ Đã gửi báo cáo cho Admin chính: ' + primaryAdmin);
  } catch(pErr) {
    Logger.log('❌ Lỗi gửi Admin chính: ' + pErr.message);
    try { getSS().getSheetByName(CONFIG.SHEET_CONFIG).appendRow(['ERR_EMAIL_PRIMARY_ADMIN', pErr.message, new Date()]); } catch(x){}
  }

  // 2. GỬI XÁC NHẬN CHO NHÂN VIÊN
  var empEmail = payload.email ? String(payload.email).trim() : '';
  if (empEmail && empEmail.indexOf('@') > 0 && empEmail.indexOf('@kingsgrill.com') === -1) {
    if (!sentEmails[empEmail]) {
      try {
        smartSendEmail(
          empEmail,
          '[KING\'S GRILL] Xác nhận ' + typeStr + ' - ' + timeStr,
          'Xác nhận chấm công: ' + typeStr + ' lúc ' + timeStr,
          empBody
        );
        sentEmails[empEmail] = true;
        Logger.log('✅ Đã gửi xác nhận cho nhân viên: ' + empEmail);
      } catch(eErr) {
        Logger.log('❌ Lỗi gửi email nhân viên: ' + eErr.message);
        try { getSS().getSheetByName(CONFIG.SHEET_CONFIG).appendRow(['ERR_EMAIL_EMP', eErr.message, new Date()]); } catch(x){}
      }
    }
  }

  // 3. GỬI CHO CÁC ADMIN KHÁC (btob.7121@gmail.com, v.v.)
  var otherAdmins = adminList.filter(function(e) { return !sentEmails[e]; });
  for (var a = 0; a < otherAdmins.length; a++) {
    var targetAdmin = otherAdmins[a];
    try {
      smartSendEmail(
        targetAdmin,
        '[KING\'S GRILL] ' + fullnameStr + ' - ' + typeStr + ' (' + timeStr + ')',
        'King\'s Grill HR: ' + fullnameStr + ' đã ' + typeStr + ' lúc ' + timeStr,
        adminBody
      );
      sentEmails[targetAdmin] = true;
      Logger.log('✅ Đã gửi báo cáo cho Admin: ' + targetAdmin);
    } catch(oaErr) {
      Logger.log('⚠️ Lỗi gửi admin ' + targetAdmin + ': ' + oaErr.message);
      try { getSS().getSheetByName(CONFIG.SHEET_CONFIG).appendRow(['ERR_EMAIL_ADMIN_' + targetAdmin, oaErr.message, new Date()]); } catch(x){}
    }
  }
}


// 3. GET DATA - New 8-column format
// Col A(0): HỌ VÀ TÊN | Col B(1): LOẠI | Col C(2): THỜI GIAN | Col D(3): VỊ TRÍ
// Col E(4): XÁC MINH | Col F(5): KHOẢNG CÁCH | Col G(6): LINK ẢNH | Col H(7): DATA JSON
function getConfigFromSheet(key, defaultValue) {
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(CONFIG.SHEET_CONFIG);
    if (!sheet) return defaultValue;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        if (data[i][1]) return JSON.parse(data[i][1]);
      }
    }
  } catch (e) {
    Logger.log("Error getting config " + key + ": " + e.message);
  }
  return defaultValue;
}

function saveConfigToSheet(key, valueObj) {
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_CONFIG);
    sheet.appendRow(["Key", "Value (JSON)"]);
    sheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#f3f4f6");
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 600);
    sheet.setFrozenRows(1);
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(JSON.stringify(valueObj, null, 2));
      return;
    }
  }
  sheet.appendRow([key, JSON.stringify(valueObj, null, 2)]);
}

function getGpsConfig() {
  return getConfigFromSheet("GPS_CONFIG", { 
    lat: CONFIG.LOCATION.LAT, 
    lng: CONFIG.LOCATION.LNG, 
    radius: CONFIG.LOCATION.MAX_DISTANCE_METERS,
    shiftCodes: [
      { id: 'standard', code: 'Ca tiêu chuẩn', description: '15:00, 17:00, 18:00, 19:00', type: 'standard' },
      { id: 'off_admin', code: 'OFF#', description: 'Nghỉ phép (Được Admin duyệt)', type: 'admin' },
      { id: 'off_penalty', code: 'OFF!', description: 'Nghỉ không phép (Bị phạt)', type: 'penalty' }
    ],
    registrationCloseTime: '17:00 Thứ Bảy'
  });
}

function handleUpdateGpsConfig(payload) {
  if (payload.role !== 'admin' && payload.role !== 'tester') {
    return jsonResponse(false, 'Không có quyền thực hiện chức năng này');
  }
  if (!payload.lat || !payload.lng || !payload.radius) {
    return jsonResponse(false, 'Thiếu thông tin cấu hình GPS');
  }
  try {
    saveConfigToSheet("GPS_CONFIG", {
      lat: Number(payload.lat),
      lng: Number(payload.lng),
      radius: Number(payload.radius),
      shiftCodes: payload.shiftCodes || [],
      registrationCloseTime: payload.registrationCloseTime || '17:00 Thứ Bảy'
    });
    return jsonResponse(true, 'Cập nhật cấu hình GPS thành công');
  } catch (e) {
    return jsonResponse(false, 'Lỗi hệ thống: ' + e.message);
  }
}

function getOrgConfig() {
  return getConfigFromSheet("ORG_CONFIG", { 
    name: "King's Grill", 
    address: "Dĩ An, Bình Dương",
    roles: [
      { id: 'admin', name: 'Quản lý (Admin)', description: 'Toàn quyền truy cập Cấu hình', isDefault: true },
      { id: 'staff', name: 'Nhân viên (Staff)', description: 'Chỉ xem và thao tác cá nhân', isDefault: false }
    ],
    orgStructure: [
      { id: 'probation', name: 'Thử việc', salaryMultiplier: 0.8 },
      { id: 'official', name: 'Chính thức', salaryMultiplier: 1.0 }
    ]
  });
}

function handleUpdateOrgConfig(payload) {
  if (payload.role !== 'admin' && payload.role !== 'tester') {
    return jsonResponse(false, 'Không có quyền thực hiện chức năng này');
  }
  try {
    saveConfigToSheet("ORG_CONFIG", {
      name: payload.name || "King's Grill",
      address: payload.address || "Dĩ An, Bình Dương",
      roles: payload.roles || [],
      orgStructure: payload.orgStructure || []
    });
    return jsonResponse(true, 'Cập nhật cấu hình Tổ chức thành công');
  } catch (e) {
    return jsonResponse(false, 'Lỗi hệ thống: ' + e.message);
  }
}

function getPayrollConfig() {
  return getConfigFromSheet("PAYROLL_CONFIG", { 
    baseFormula: '(HOURS * RATE) + BONUS - PENALTY + ALLOWANCE',
    maxAdvancePercent: 50,
    mealAllowance: 30000,
    allowances: [
      { id: 'meal', name: 'Tiền ăn ca', description: 'Ca làm > 4 tiếng', amount: 20000 },
      { id: 'parking', name: 'Gửi xe', description: 'Theo ngày làm việc', amount: 10000 }
    ],
    deductions: [
      { id: 'late', name: 'Đi trễ', description: 'Trừ 10,000đ / 15 phút', amount: 10000 }
    ]
  });
}

function handleUpdatePayrollConfig(payload) {
  if (payload.role !== 'admin' && payload.role !== 'tester') {
    return jsonResponse(false, 'Không có quyền thực hiện chức năng này');
  }
  try {
    saveConfigToSheet("PAYROLL_CONFIG", {
      baseFormula: payload.baseFormula,
      maxAdvancePercent: Number(payload.maxAdvancePercent),
      mealAllowance: Number(payload.mealAllowance),
      allowances: payload.allowances || [],
      deductions: payload.deductions || []
    });
    return jsonResponse(true, 'Cập nhật cấu hình Lương thành công');
  } catch (e) {
    return jsonResponse(false, 'Lỗi hệ thống: ' + e.message);
  }
}

function handleUpdateAiPrompts(payload) {
  if (payload.role !== 'admin' && payload.role !== 'tester') {
    return jsonResponse(false, 'Không có quyền thực hiện chức năng này');
  }
  try {
    saveConfigToSheet("AI_PROMPTS", payload.prompts || []);
    return jsonResponse(true, 'Cập nhật cấu hình Prompt thành công');
  } catch (e) {
    return jsonResponse(false, 'Lỗi hệ thống: ' + e.message);
  }
}

function handleGetData(payload) {
  var username = payload.username;
  var fullname = payload.fullname;
  var role = payload.role;
  var monthSheet = payload.monthSheet;
  var weekLabel = payload.weekLabel;
  var forceRefresh = payload.forceRefresh;

  var isAdmin = role === 'admin' || role === 'tester';

  // Key names in JSON_CACHE
  var globalKey = "GLOBAL_DATA";
  var userKey = "USER_" + username + "_" + (monthSheet || "") + "_" + (weekLabel || "");
  var adminExtKey = "ADMIN_EXT_" + (monthSheet || "") + "_" + (weekLabel || "");

  // If forceRefresh is NOT requested, try to load from JSON_CACHE
  if (!forceRefresh) {
    try {
      var globalCached = JsonCacheService.getCacheRecord(globalKey);
      var userCached = JsonCacheService.getCacheRecord(userKey);
      var adminCached = isAdmin ? JsonCacheService.getCacheRecord(adminExtKey) : null;

      if (globalCached && userCached && (!isAdmin || adminCached)) {
        // Build response from cache
        var result = Object.assign({}, globalCached, userCached);
        if (isAdmin && adminCached) {
          Object.assign(result, adminCached);
        }
        return jsonResponse(true, result);
      }
    } catch (ce) {
      Logger.log("Error reading JSON_CACHE, fallback to database read: " + ce.toString());
    }
  }

  // Fallback / Force Refresh: Rebuild cache using batchGet
  try {
    var ss = getSS();
    var db = JsonCacheService.batchFetchRawData(ss, monthSheet);

    // Rebuild caches
    var globalData = JsonCacheService.rebuildGlobalCache(db);
    var userData = JsonCacheService.rebuildUserCache(db, username, fullname, monthSheet, weekLabel);
    var adminData = null;
    if (isAdmin) {
      adminData = JsonCacheService.rebuildAdminExtCache(db, monthSheet, weekLabel);
    }

    // Merge for current response
    var mergedResult = Object.assign({}, globalData, userData);
    if (isAdmin && adminData) {
      Object.assign(mergedResult, adminData);
    }

    return jsonResponse(true, mergedResult);
  } catch (e) {
    Logger.log("rebuildCache and read error: " + e.toString());
    return jsonResponse(false, 'Lỗi hệ thống khi tải dữ liệu: ' + e.message);
  }
}

var EMPLOYMENT_STATUS = {
  ACTIVE: 'active',
  LEAVE: 'leave',
  RESIGNED: 'resigned',
  SUSPENDED: 'suspended'
};

function normalizeEmploymentStatus(value) {
  var status = value ? value.toString().toLowerCase() : EMPLOYMENT_STATUS.ACTIVE;
  return [
    EMPLOYMENT_STATUS.ACTIVE,
    EMPLOYMENT_STATUS.LEAVE,
    EMPLOYMENT_STATUS.RESIGNED,
    EMPLOYMENT_STATUS.SUSPENDED
  ].indexOf(status) >= 0 ? status : EMPLOYMENT_STATUS.ACTIVE;
}

function getEmploymentProfileByUsername(username) {
  if (!username) return null;
  var sheet = getSS().getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  for (var i = 2; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase() === username.toString().toLowerCase()) {
      var status = normalizeEmploymentStatus(data[i][8]);
      var statusUntil = data[i][9] ? data[i][9].toString() : '';
      var statusReason = data[i][10] ? data[i][10].toString() : '';
      if (status === EMPLOYMENT_STATUS.SUSPENDED && statusUntil) {
        var untilDate = new Date(statusUntil + 'T23:59:59');
        if (!isNaN(untilDate.getTime()) && untilDate.getTime() < new Date().getTime()) {
          status = EMPLOYMENT_STATUS.ACTIVE;
          sheet.getRange(i + 1, 9, 1, 4).setValues([[
            EMPLOYMENT_STATUS.ACTIVE,
            '',
            'Tự động kích hoạt lại sau thời hạn đình chỉ',
            Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss')
          ]]);
          statusUntil = '';
          statusReason = 'Tự động kích hoạt lại sau thời hạn đình chỉ';
        }
      }
      return {
        username: data[i][0] ? data[i][0].toString() : '',
        fullname: data[i][2] ? data[i][2].toString() : '',
        email: data[i][4] ? data[i][4].toString() : '',
        role: data[i][5] ? data[i][5].toString() : 'user',
        position: data[i][6] ? data[i][6].toString() : 'Phục vụ',
        avatarUrl: data[i][7] ? data[i][7].toString() : '',
        employmentStatus: status,
        statusUntil: statusUntil,
        statusReason: statusReason,
        statusUpdatedAt: data[i][11] ? data[i][11].toString() : ''
      };
    }
  }
  if (username.toString().toUpperCase() === 'ADMIN') {
    return {
      username: 'ADMIN',
      fullname: 'SUPER ADMIN',
      email: 'admin@kingsgrill.com',
      role: 'admin',
      position: 'Quản lý',
      avatarUrl: '',
      employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
      statusUntil: '',
      statusReason: '',
      statusUpdatedAt: ''
    };
  }
  return null;
}

function canEmployeeWork(username) {
  var profile = getEmploymentProfileByUsername(username);
  return !profile || profile.employmentStatus === EMPLOYMENT_STATUS.ACTIVE;
}

function handleGetEmploymentProfile(payload) {
  var targetUsername = payload.role === 'admin' && payload.targetUsername
    ? payload.targetUsername
    : payload.username;
  var profile = getEmploymentProfileByUsername(targetUsername);
  if (!profile) return jsonResponse(false, 'Không tìm thấy hồ sơ nhân sự');
  return jsonResponse(true, { profile: profile });
}

function handleUpdateEmploymentStatus(payload) {
  if (payload.role !== 'admin') return jsonResponse(false, 'Chỉ admin được cập nhật trạng thái nhân sự');
  if (!payload.targetUsername) return jsonResponse(false, 'Thiếu tài khoản nhân sự');
  var status = normalizeEmploymentStatus(payload.employmentStatus);
  var statusUntil = payload.statusUntil ? payload.statusUntil.toString() : '';
  var reason = payload.statusReason ? payload.statusReason.toString().trim() : '';
  if (status === EMPLOYMENT_STATUS.SUSPENDED && !statusUntil) {
    return jsonResponse(false, 'Đình chỉ cần có ngày kết thúc');
  }
  if (status !== EMPLOYMENT_STATUS.ACTIVE && !reason) {
    return jsonResponse(false, 'Vui lòng nhập lý do thay đổi trạng thái');
  }

  var sheet = getSS().getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) return jsonResponse(false, 'Không tìm thấy DB Users');
  var headers = sheet.getRange(2, 1, 1, Math.max(sheet.getLastColumn(), 12)).getValues()[0];
  var desiredHeaders = ['EmploymentStatus', 'StatusUntil', 'StatusReason', 'StatusUpdatedAt'];
  var vnHeaders = ['Trạng thái nhân sự', 'Đến ngày', 'Lý do', 'Cập nhật lúc'];
  for (var h = 0; h < desiredHeaders.length; h++) {
    if (!headers[8 + h]) {
      sheet.getRange(2, 9 + h).setValue(desiredHeaders[h]);
      sheet.getRange(1, 9 + h).setValue(vnHeaders[h]);
    }
  }

  var data = sheet.getDataRange().getValues();
  for (var i = 2; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase() === payload.targetUsername.toString().toLowerCase()) {
      var timestamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
      sheet.getRange(i + 1, 9, 1, 4).setValues([[
        status,
        status === EMPLOYMENT_STATUS.SUSPENDED || status === EMPLOYMENT_STATUS.LEAVE ? statusUntil : '',
        status === EMPLOYMENT_STATUS.ACTIVE ? '' : reason,
        timestamp
      ]]);
      try {
        var cache = CacheService.getScriptCache();
        cache.remove('GD_' + (payload.username || '').substring(0, 10) + '_A');
        cache.remove('GD_' + payload.targetUsername.substring(0, 10) + '_U');
      } catch (cacheErr) {}
      invalidateAuthUsersCache();
      return jsonResponse(true, {
        profile: getEmploymentProfileByUsername(payload.targetUsername),
        message: 'Đã cập nhật trạng thái nhân sự'
      });
    }
  }
  return jsonResponse(false, 'Không tìm thấy nhân sự');
}



// 3. API Keys
function handleSyncKeys(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_API_KEYS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_API_KEYS);
    sheet.appendRow(['Key', 'Tag', 'Status']);
  }
  
  // Clear old keys
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).clearContent();
  }
  
  if (payload.keys && payload.keys.length > 0) {
    var newRows = [];
    for (var i = 0; i < payload.keys.length; i++) {
      var k = payload.keys[i];
      var keyStr = typeof k === 'object' ? (k.key || '') : k;
      if (keyStr) newRows.push([keyStr, 'Key ' + (i + 1), 'Active']);
    }
    if (newRows.length > 0) {
      sheet.getRange(2, 1, newRows.length, 3).setValues(newRows);
    }
  }
  return jsonResponse(true, 'Đồng bộ keys thành công');
}

function handleGetKeys(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_API_KEYS);
  if (!sheet) return jsonResponse(true, []);
  
  var currentPin = sheet.getRange(1, 5).getValue();
  if (currentPin && currentPin.toString() !== payload.pin) {
    return jsonResponse(false, 'Mã PIN trích xuất không chính xác');
  }
  
  var data = sheet.getDataRange().getValues();
  var keys = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) {
      keys.push(data[i][0].toString());
    }
  }
  return jsonResponse(true, keys);
}

function handleSaveChatLog(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_CHAT_LOGS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_CHAT_LOGS);
    sheet.appendRow(['Timestamp', 'Fullname', 'Role', 'Content']);
  }
  
  if (payload.messages && payload.messages.length > 0) {
    var newRows = [];
    var now = new Date();
    for (var i = 0; i < payload.messages.length; i++) {
      if (payload.messages[i].content) {
        newRows.push([now, payload.fullname, payload.messages[i].role, payload.messages[i].content]);
      }
    }
    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 4).setValues(newRows);
    }
  }
  return jsonResponse(true, 'Saved');
}

function handleSetMasterPin(payload) {
  if (!payload.pin) return jsonResponse(false, 'Chưa truyền pin');
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_API_KEYS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_API_KEYS);
    sheet.appendRow(['Key', 'Status']);
  }
  sheet.getRange(1, 4).setValue("MASTER_PIN");
  sheet.getRange(1, 5).setValue(payload.pin);
  return jsonResponse(true, 'Thiết lập mật khẩu thành công');
}

function handleTestEmail(payload) {
  var emails = payload.emails; 
  if (!emails) return jsonResponse(false, 'Chưa nhập email');
  
  var emailList = [];
  if (typeof emails === 'string') {
    emailList = emails.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
  } else if (Array.isArray(emails)) {
    emailList = emails;
  }
  if (emailList.length === 0) return jsonResponse(false, 'Email không hợp lệ');

  var timeObj = new Date();
  var formattedTime = Utilities.formatDate(timeObj, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  var logoUrl = (CONFIG.WEB_APP_URL || 'https://kg-checkin.pages.dev/').replace(/\/+$/, '') + '/logo_badge_squircle.png?v=1';
  var empBody = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;600;700;800&display=swap" rel="stylesheet">'
    + '</head><body style="margin:0;padding:0;background:#f0f4f8;font-family:Libre Franklin,Arial,sans-serif;">'
    + '<div style="max-width:560px;margin:20px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">'
    + '<div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 50%,#7c3aed 100%);padding:32px 24px;text-align:center;">'
    + '<table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 12px;"><tr>'
    + '<td align="center" valign="middle" style="width:58px;height:58px;">'
    + '<img src="' + logoUrl + '" alt="King\'s Grill Logo" width="58" height="58" style="display:block;width:58px;height:58px;border:0;outline:none;margin:0 auto;" />'
    + '</td></tr></table>'
    + '<h1 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 4px;">KING\'S GRILL HR</h1>'
    + '<p style="color:rgba(255,255,255,0.8);font-size:12px;margin:0;">Xác Nhận Chấm Công (BẢN TEST EMAIL)</p>'
    + '</div>'
    + '<div style="padding:0 24px;">'
    + '<div style="background:#10b981;color:#fff;padding:12px 20px;border-radius:12px;margin-top:-16px;text-align:center;font-weight:700;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">'
    + '&#9654; TEST GỬI EMAIL THÀNH CÔNG'
    + '</div></div>'
    + '<div style="padding:20px 24px 0;text-align:center;">'
    + '<p style="font-size:15px;color:#1e293b;margin:0;">Xin chào <strong>Nhân Viên Test</strong>,</p>'
    + '<p style="font-size:13px;color:#64748b;margin:6px 0 0;">Tính năng gửi mail xác nhận hoạt động bình thường!</p>'
    + '</div>'
    + '<div style="padding:16px 24px;">'
    + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">'
    + '<table style="width:100%;border-collapse:collapse;">'
    + '<tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;width:120px;"><strong>Thời gian</strong></td>'
    + '<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;font-weight:600;">' + formattedTime + '</td></tr>'
    + '<tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;"><strong>Vị trí</strong></td>'
    + '<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;">123 King\'s Grill Studio</td></tr>'
    + '<tr><td style="padding:12px 16px;font-size:13px;color:#64748b;"><strong>Trạng thái</strong></td>'
    + '<td style="padding:12px 16px;font-size:13px;text-align:right;font-weight:700;color:#10b981;">Hợp lệ</td></tr>'
    + '</table></div></div>'
    + '<div style="background:#f8fafc;padding:20px 24px;text-align:center;border-top:1px solid #e2e8f0;">'
    + '<p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Email tự động - Vui lòng không trả lời</p>'
    + '<p style="margin:0;font-size:12px;font-weight:800;color:#1e293b;letter-spacing:1px;">KING\'S GRILL &copy; ' + new Date().getFullYear() + '</p>'
    + '</div></div></body></html>';

  try {
    for (var i = 0; i < emailList.length; i++) {
      MailApp.sendEmail(
        emailList[i],
        '[KING\'S GRILL] BẢN TEST: Xác nhận Vào ca - ' + formattedTime,
        'Xác nhận TEST lúc ' + formattedTime,
        { htmlBody: empBody }
      );
    }
    return jsonResponse(true, 'Đã gửi ' + emailList.length + ' email test thành công');
  } catch(e) {
    return jsonResponse(false, 'Gửi mail thất bại: ' + e.message);
  }
}

// 4. Lịch làm việc (Schedule) - MONTHLY SHEET ARCHITECTURE
// Sheet columns: A=Tên NV | B-H=T2→CN | I=Lý do | J=Timestamp | K=Trạng thái

/**
 * Get or create a monthly schedule sheet: "Tháng 5/2026"
 * Sets up header if new
 */
function getMonthlyScheduleSheet(sheetName) {
  var ss = getSS();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, 11).setValues([['Họ và tên', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN', 'Lý do', 'Thời gian', 'Trạng thái']]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 11)
      .setFontWeight('bold')
      .setBackground('#1e3a8a')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sheet.setColumnWidth(1, 180);
    for (var c = 2; c <= 8; c++) sheet.setColumnWidth(c, 65);
    sheet.setColumnWidth(9, 150);
    sheet.setColumnWidth(10, 140);
    sheet.setColumnWidth(11, 90);
  }
  return sheet;
}

/**
 * Find or create a week header row in the monthly sheet.
 * Returns the row number of the week header.
 */
function findOrCreateWeekHeader(sheet, weekLabel) {
  var data = sheet.getDataRange().getValues();
  var cleanWeekLabel = weekLabel.replace('📅 TUẦN ', '').replace('TUẦN ', '').trim();
  var searchStr = 'TUẦN ' + cleanWeekLabel;
  var headerTag = '📅 TUẦN ' + cleanWeekLabel;
  
  // Search for existing header
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().indexOf(searchStr) >= 0) {
      return i + 1; // 1-indexed
    }
  }
  
  // Not found - create new header at the end
  var newRow = sheet.getLastRow() + 1;
  if (newRow <= 1) newRow = 2; // After fixed header
  
  sheet.getRange(newRow, 1).setValue(headerTag);
  sheet.getRange(newRow, 1, 1, 11)
    .merge()
    .setBackground('#312e81')
    .setFontColor('#fbbf24')
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('left');
  
  return newRow;
}

/**
 * Find the row range for a specific week (from header to next header or end)
 */
function getWeekRowRange(sheet, weekHeaderRow) {
  var lastRow = sheet.getLastRow();
  var startRow = weekHeaderRow + 1;
  var endRow = lastRow;
  
  if (startRow > lastRow) return { start: startRow, end: startRow };
  
  var data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().indexOf('TUẦN ') >= 0) {
      endRow = startRow + i - 1;
      break;
    }
  }
  return { start: startRow, end: endRow };
}

function handleRegisterShift(payload) {
  if (payload.username && !canEmployeeWork(payload.username)) {
    return jsonResponse(false, 'Trạng thái nhân sự hiện tại không được đăng ký ca');
  }
  var monthSheet = payload.monthSheet;
  var weekLabel = payload.weekLabel;
  
  if (!monthSheet || !weekLabel) {
    return jsonResponse(false, 'Thiếu thông tin monthSheet hoặc weekLabel');
  }
  
  var sheet = getMonthlyScheduleSheet(monthSheet);
  var headerRow = findOrCreateWeekHeader(sheet, weekLabel);
  
  // Read all data to find existing employee row within this week
  var allData = sheet.getDataRange().getValues();
  var existingRow = -1;
  var weekEndRow = allData.length; // 0-indexed exclusive
  
  // Find bounds of this week's data (rows after headerRow until next header or end)
  for (var i = headerRow; i < allData.length; i++) { // headerRow is 1-indexed, allData is 0-indexed → i starts at headerRow (= next row in 0-indexed)
    var cellVal = allData[i][0] ? allData[i][0].toString() : '';
    if (cellVal.indexOf('TUẦN ') >= 0) {
      weekEndRow = i; // 0-indexed
      break;
    }
    // Check if this is our employee
    if (cellVal === payload.fullname) {
      existingRow = i + 1; // Convert to 1-indexed
    }
  }
  
  var now = new Date();
  var timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM HH:mm');
  
  var rowData = [
    payload.fullname,
    payload.shifts[0], payload.shifts[1], payload.shifts[2],
    payload.shifts[3], payload.shifts[4], payload.shifts[5],
    payload.shifts[6],
    payload.offReason || '',
    timestamp,
    'Chờ duyệt'
  ];
  
  if (existingRow > -1) {
    // Update existing registration
    sheet.getRange(existingRow, 1, 1, 11).setValues([rowData]).setNumberFormat('@');
    sheet.getRange(existingRow, 2, 1, 7).setNumberFormat('HH:mm');

  } else {
    // Insert new row at the end of this week's section
    var insertAfterRow = weekEndRow; // 0-indexed → this is the row number in 1-indexed (since +1 offset)
    // Actually: weekEndRow(0-indexed) = row number in sheet if at end, or the next header row(0-indexed)
    // We want to insert before the next header, i.e. after (weekEndRow-1+1) = weekEndRow in 1-indexed
    // But simpler: just insert at the last row of this week's data
    var lastWeekDataRow1 = weekEndRow; // 1-indexed position to insert after
    if (weekEndRow === allData.length) {
      // This week is at the end of the sheet, just append
      sheet.appendRow(rowData);
      existingRow = sheet.getLastRow();
    } else {
      // Insert before next week's header
      sheet.insertRowBefore(weekEndRow + 1); // weekEndRow is 0-indexed, +1 = 1-indexed
      existingRow = weekEndRow + 1; // The new row in 1-indexed
      sheet.getRange(existingRow, 1, 1, 11).setValues([rowData]).setNumberFormat('@');
      sheet.getRange(existingRow, 2, 1, 7).setNumberFormat('HH:mm');

    }
  }
  
  // Style the row
  var targetRow = existingRow > 0 ? existingRow : sheet.getLastRow();
  try {
    sheet.getRange(targetRow, 1, 1, 11)
      .setBackground('#fffbeb')
      .setFontWeight('normal')
      .setHorizontalAlignment('center');
    sheet.getRange(targetRow, 1).setHorizontalAlignment('left').setFontWeight('bold');
    sheet.getRange(targetRow, 11)
      .setBackground('#fef3c7')
      .setFontColor('#92400e')
      .setFontWeight('bold');
  } catch(styleErr) {
    Logger.log('Style error: ' + styleErr.message);
  }

  // Invalidate cached user and admin schedule records so GET_DATA serves fresh status
  try {
    if (typeof JsonCacheService !== 'undefined') {
      JsonCacheService.invalidateUserCache(payload.username);
      JsonCacheService.invalidateAdminCache();
    }
  } catch (invErr) {
    Logger.log('Error invalidating cache after shift registration: ' + invErr);
  }
  
  return jsonResponse(true, payload.isEdit ? 'Đã cập nhật lịch đăng ký thành công' : 'Đăng ký ca thành công');
}

function getSingleWeekSchedules(monthSheet, weekLabel) {
  var ss = getSS();
  var sheet = ss.getSheetByName(monthSheet);
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var displayData = sheet.getDataRange().getDisplayValues();
  
  return extractSchedulesFromData(data, displayData, weekLabel, monthSheet);
}

function extractSchedulesFromData(data, displayData, weekLabel, monthSheet) {
  var headerRow = -1;
  var cleanWeekLabel = weekLabel.replace('📅 TUẦN ', '').replace('TUẦN ', '').trim();
  var searchStr = 'TUẦN ' + cleanWeekLabel;

  for (var i = 0; i < data.length; i++) {
    var cellStr = data[i][0] ? data[i][0].toString() : '';
    if (cellStr.indexOf(searchStr) >= 0) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return [];
  
  var schedules = [];
  var employeesMap = {};

  // Format shift from display text (already a string from getDisplayValues)
  function formatDisplayShift(displayVal) {
    if (!displayVal) return 'OFF';
    var str = displayVal.toString().trim();
    if (str === '' || str === '0:00' || str === '00:00' || str === 'null' || str === 'undefined') return 'OFF';
    
    // Fix partial time like "15:0" → "15:00"
    if (/^\d{1,2}:\d$/.test(str)) {
      var parts = str.split(':');
      return (parts[0].length === 1 ? '0' + parts[0] : parts[0]) + ':' + parts[1].padStart(2, '0');
    }
    
    // Already correct HH:mm
    if (/^\d{1,2}:\d{2}$/.test(str)) {
      var parts2 = str.split(':');
      return (parts2[0].length === 1 ? '0' + parts2[0] : parts2[0]) + ':' + parts2[1];
    }
    
    // Handle "OFF", "OFF#" or any other valid string
    return str;
  }

  for (var j = headerRow + 1; j < data.length; j++) {
    var name = data[j][0] ? data[j][0].toString().trim() : '';
    if (name.indexOf('TUẦN ') >= 0) break; // Next week header
    if (!name) continue;
    
    var isAdjustment = (name.indexOf('┗') >= 0);
    var cleanName = isAdjustment ? name.replace('┗ ', '').replace('┗', '').trim() : name;

    if (!employeesMap[cleanName]) {
      employeesMap[cleanName] = {
        fullname: cleanName,
        shifts: ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'],
        originalShifts: ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'],
        reason: '',
        status: '',
        hasApproved: false
      };
    }

    var emp = employeesMap[cleanName];
    
    // Read shifts from DISPLAY values (columns B-H = indices 1-7)
    var rowShifts = [
      formatDisplayShift(displayData[j][1]),
      formatDisplayShift(displayData[j][2]),
      formatDisplayShift(displayData[j][3]),
      formatDisplayShift(displayData[j][4]),
      formatDisplayShift(displayData[j][5]),
      formatDisplayShift(displayData[j][6]),
      formatDisplayShift(displayData[j][7])
    ];

    if (isAdjustment) {
      emp.shifts = rowShifts;
      emp.status = displayData[j][10] ? displayData[j][10].toString().trim() : '';
      emp.hasApproved = (emp.status === 'Đã duyệt ✓');
    } else {
      emp.originalShifts = JSON.parse(JSON.stringify(rowShifts));
      // Only set current shifts to registration if no adjustment row was processed yet
      var hasShift = emp.shifts.some(function(s) { return s !== 'OFF'; });
      if (!hasShift) {
        emp.shifts = JSON.parse(JSON.stringify(rowShifts));
      }
      emp.reason = displayData[j][8] ? displayData[j][8].toString().trim() : '';
      if (!emp.status) emp.status = displayData[j][10] ? displayData[j][10].toString().trim() : '';
    }
  }

  for (var key in employeesMap) {
    schedules.push(employeesMap[key]);
  }
  return schedules;
}

function handleGetAllSchedules(payload) {
  var monthSheet = payload.monthSheet || payload.targetSheet;
  var weekLabel = payload.weekLabel;
  
  if (!monthSheet) return jsonResponse(false, 'Thiếu thông tin sheet');
  
  var schedules = getSingleWeekSchedules(monthSheet, weekLabel);
  
  Logger.log('[GET_ALL_SCHEDULES] Returning ' + schedules.length + ' employees');
  return jsonResponse(true, schedules);
}

function handleGetMonthSchedules(payload) {
  var requests = payload.requests;
  if (requests && requests.length > 0) {
    var weeks = [];
    var sheetCache = {};
    var ss = getSS();
    
    for (var k = 0; k < requests.length; k++) {
      var req = requests[k];
      
      if (sheetCache[req.monthSheet] === undefined) {
        var sheet = ss.getSheetByName(req.monthSheet);
        if (sheet) {
          sheetCache[req.monthSheet] = {
            data: sheet.getDataRange().getValues(),
            displayData: sheet.getDataRange().getDisplayValues()
          };
        } else {
          sheetCache[req.monthSheet] = null;
        }
      }
      
      var cache = sheetCache[req.monthSheet];
      var weekSchedules = [];
      if (cache) {
        weekSchedules = extractSchedulesFromData(cache.data, cache.displayData, req.weekLabel, req.monthSheet);
      }
      
      weeks.push({
        weekLabel: req.weekLabel,
        schedules: weekSchedules
      });
    }
    return jsonResponse(true, { weeks: weeks });
  }

  // Fallback
  var monthSheet = payload.monthSheet;
  if (!monthSheet) return jsonResponse(false, 'Thiếu thông tin sheet');
  
  var ss = getSS();
  var sheet = ss.getSheetByName(monthSheet);
  if (!sheet) return jsonResponse(true, { weeks: [] });
  
  var data = sheet.getDataRange().getValues();
  var displayData = sheet.getDataRange().getDisplayValues();
  
  function formatDisplayShift(displayVal) {
    if (!displayVal) return '';
    var str = displayVal.toString().trim();
    if (str === '' || str === '0:00' || str === '00:00' || str === 'null' || str === 'undefined' || str === 'OFF') return 'OFF';
    if (/^\d{1,2}:\d$/.test(str)) {
      var parts = str.split(':');
      return (parts[0].length === 1 ? '0' + parts[0] : parts[0]) + ':' + parts[1].padStart(2, '0');
    }
    if (/^\d{1,2}:\d{2}$/.test(str)) {
      var parts2 = str.split(':');
      return (parts2[0].length === 1 ? '0' + parts2[0] : parts2[0]) + ':' + parts2[1];
    }
    return str;
  }
  
  var weeks = [];
  var currentWeekLabel = null;
  var employeesMap = {};
  
  // Hàm gom nhân viên của tuần hiện tại vào mảng
  function pushCurrentWeek() {
    if (currentWeekLabel) {
      var schedules = [];
      for (var key in employeesMap) {
        schedules.push(employeesMap[key]);
      }
      weeks.push({
        weekLabel: currentWeekLabel,
        schedules: schedules
      });
    }
  }

  for (var i = 1; i < data.length; i++) {
    var cellStr = data[i][0] ? data[i][0].toString().trim() : '';
    
    // Nếu gặp header TUẦN
    if (cellStr.indexOf('TUẦN ') >= 0) {
      pushCurrentWeek();
      currentWeekLabel = cellStr.replace('📅 TUẦN', '').replace('TUẦN', '').trim();
      employeesMap = {};
      continue;
    }
    
    if (!currentWeekLabel || !cellStr) continue;
    
    var isAdjustment = (cellStr.indexOf('┗') >= 0);
    var cleanName = isAdjustment ? cellStr.replace('┗ ', '').replace('┗', '').trim() : cellStr;

    if (!employeesMap[cleanName]) {
      employeesMap[cleanName] = {
        fullname: cleanName,
        shifts: ['', '', '', '', '', '', ''],
        originalShifts: ['', '', '', '', '', '', ''],
        reason: '',
        status: '',
        hasApproved: false
      };
    }

    var emp = employeesMap[cleanName];
    var rowShifts = [
      formatDisplayShift(displayData[i][1]),
      formatDisplayShift(displayData[i][2]),
      formatDisplayShift(displayData[i][3]),
      formatDisplayShift(displayData[i][4]),
      formatDisplayShift(displayData[i][5]),
      formatDisplayShift(displayData[i][6]),
      formatDisplayShift(displayData[i][7])
    ];

    if (isAdjustment) {
      emp.shifts = rowShifts;
      emp.status = displayData[i][10] ? displayData[i][10].toString().trim() : '';
      emp.hasApproved = (emp.status === 'Đã duyệt ✓');
    } else {
      emp.originalShifts = JSON.parse(JSON.stringify(rowShifts));
      var hasShift = emp.shifts.some(function(s) { return s !== ''; });
      if (!hasShift) {
        emp.shifts = JSON.parse(JSON.stringify(rowShifts));
      }
      emp.reason = displayData[i][8] ? displayData[i][8].toString().trim() : '';
      if (!emp.status) emp.status = displayData[i][10] ? displayData[i][10].toString().trim() : '';
    }
  }
  
  pushCurrentWeek(); // Đẩy tuần cuối cùng
  
  return jsonResponse(true, { weeks: weeks });
}


function handleApproveSchedules(payload) {
  var monthSheet = payload.monthSheet || payload.targetSheet;
  var weekLabel = payload.weekLabel;
  var schedules = payload.schedules || [];
  var isFinal = payload.isFinal === true;
  
  if (!monthSheet) return jsonResponse(false, 'Thiếu thông tin sheet');
  
  var sheet = getMonthlyScheduleSheet(monthSheet);
  var data = sheet.getDataRange().getValues();
  
  // Find week header
  var headerRow = -1;
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().indexOf('TUẦN ' + weekLabel) >= 0) {
      headerRow = i + 1; // 1-indexed
      break;
    }
  }
  if (headerRow === -1) return jsonResponse(false, 'Không tìm thấy tuần ' + weekLabel);
  
  var now = new Date();
  var timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM HH:mm');
  
  for (var s = 0; s < schedules.length; s++) {
    var emp = schedules[s];
    data = sheet.getDataRange().getValues();
    
    var regRow = -1;
    var approvalRow = -1;
    for (var r = headerRow; r < data.length; r++) {
      var cellName = data[r][0] ? data[r][0].toString() : '';
      if (cellName.indexOf('TUẦN ') >= 0 && r > headerRow - 1) break;
      
      if (cellName === emp.fullname) regRow = r + 1;
      if (cellName.indexOf('┗') >= 0 && cellName.indexOf(emp.fullname) >= 0) approvalRow = r + 1;
    }
    
    if (regRow === -1) continue;
    
    var statusText = isFinal ? 'Đã duyệt ✓' : 'Đã điều chỉnh';
    var approvalData = [
      '┗ ' + emp.fullname,
      (emp.shifts[0] || '').toString().split('\n')[0].trim() || 'OFF',
      (emp.shifts[1] || '').toString().split('\n')[0].trim() || 'OFF',
      (emp.shifts[2] || '').toString().split('\n')[0].trim() || 'OFF',
      (emp.shifts[3] || '').toString().split('\n')[0].trim() || 'OFF',
      (emp.shifts[4] || '').toString().split('\n')[0].trim() || 'OFF',
      (emp.shifts[5] || '').toString().split('\n')[0].trim() || 'OFF',
      (emp.shifts[6] || '').toString().split('\n')[0].trim() || 'OFF',
      '',
      timestamp,
      statusText
    ];
    
    if (approvalRow > -1) {
      sheet.getRange(approvalRow, 1, 1, 11).setValues([approvalData]).setNumberFormat('@'); // Force text for the whole row first
      sheet.getRange(approvalRow, 2, 1, 7).setNumberFormat('HH:mm'); // Format time columns
    } else {
      sheet.insertRowAfter(regRow);
      sheet.getRange(regRow + 1, 1, 1, 11).setValues([approvalData]).setNumberFormat('@');
      sheet.getRange(regRow + 1, 2, 1, 7).setNumberFormat('HH:mm');
    }

    
    var aRow = approvalRow > -1 ? approvalRow : regRow + 1;
    sheet.getRange(aRow, 1, 1, 11)
      .setBackground('#eff6ff')
      .setHorizontalAlignment('center');
    sheet.getRange(aRow, 1)
      .setHorizontalAlignment('left')
      .setFontColor('#6366f1')
      .setFontStyle('italic');
    sheet.getRange(aRow, 11)
      .setBackground(isFinal ? '#dbeafe' : '#fef3c7')
      .setFontColor(isFinal ? '#1d4ed8' : '#92400e')
      .setFontWeight('bold');
    
    if (isFinal) {
      // Mark reg row as approved too
      data = sheet.getDataRange().getValues();
      for (var rr = headerRow; rr < data.length; rr++) {
        if (data[rr][0] && data[rr][0].toString() === emp.fullname) {
          sheet.getRange(rr + 1, 11).setValue('Đã duyệt ✓').setFontColor('#15803d').setBackground('#dcfce7');
          break;
        }
      }
    }
    
    // Highlight changes — use getDisplayValues() for correct shift text
    var highlightDisplay = sheet.getDataRange().getDisplayValues();
    var foundRegRow = -1;
    for (var rx = headerRow; rx < highlightDisplay.length; rx++) {
      var rxName = highlightDisplay[rx][0] ? highlightDisplay[rx][0].toString().trim() : '';
      if (rxName === emp.fullname) {
        foundRegRow = rx;
        break;
      }
    }
    
    if (foundRegRow > -1) {
      for (var dc = 1; dc <= 7; dc++) {
        var regShift = highlightDisplay[foundRegRow][dc] ? highlightDisplay[foundRegRow][dc].toString().trim() : 'OFF';
        if (regShift === '' || regShift === '0:00' || regShift === '00:00') regShift = 'OFF';
        
        var appShift = emp.shifts[dc - 1] ? emp.shifts[dc - 1].toString().split('\n')[0].trim() : 'OFF';
        
        if (regShift !== appShift) {
          sheet.getRange(aRow, dc + 1).setBackground('#fef2f2').setFontColor('#dc2626').setFontWeight('bold');
          sheet.getRange(aRow, dc + 1).setNote('Gốc: ' + regShift + ' → Duyệt: ' + appShift);
        } else {
          // Clear highlight if they match
          sheet.getRange(aRow, dc + 1).setBackground('#eff6ff').setFontColor(null).setFontWeight(null);
          sheet.getRange(aRow, dc + 1).clearNote();
        }
      }
    }
  }
  
  // Đồng bộ sang Google Spreadsheet Lịch Làm (1Vrm...)
  var rosterSyncMsg = '';
  try {
    var rosterResult = syncApprovedSchedulesToExternalRoster(payload);
    if (rosterResult && rosterResult.success) {
      rosterSyncMsg = ' • ' + rosterResult.message;
    } else if (rosterResult && rosterResult.errors && rosterResult.errors.length) {
      rosterSyncMsg = ' (Lưu ý Roster: ' + rosterResult.errors.join('; ') + ')';
    }
  } catch (rErr) {
    Logger.log('Lỗi syncApprovedSchedulesToExternalRoster: ' + rErr.message);
  }

  var finalMsg = (isFinal ? 'Đã duyệt toàn bộ lịch thành công' : 'Đã lưu các điều chỉnh lịch') + rosterSyncMsg;
  return jsonResponse(true, finalMsg);
}

// =====================================================================================
// ĐỒNG BỘ LỊCH SANG GOOGLE SPREADSHEET LỊCH LÀM (ROSTER)
// Spreadsheet ID: 1VrmLjfdIjxmA62D5Ei33ppkw9ql1r0fvLrX1FJzGm6M
// =====================================================================================

/**
 * Chuẩn hóa họ và tên nhân viên (lowercase, trim, bỏ dấu tiếng Việt để đối soát)
 */
function normalizeEmployeeName(str) {
  if (!str) return '';
  return str.toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/đ/g, 'd');
}

/**
 * Tìm match mờ nếu tên có sai lệch nhẹ
 */
function findFuzzyRowMatch(normName, map) {
  if (!normName) return null;
  for (var key in map) {
    if (key === normName) return map[key];
    if (key.length > 5 && normName.length > 5) {
      if (key.indexOf(normName) >= 0 || normName.indexOf(key) >= 0) {
        return map[key];
      }
    }
  }
  return null;
}

/**
 * Tìm tab sheet tháng phù hợp trong file Roster: format "Tháng MM (YYYY)" hoặc "Tháng MM/YYYY"
 */
function findRosterMonthSheet(rosterSS, month, year) {
  var sheets = rosterSS.getSheets();
  var mStr2 = (month < 10 ? '0' : '') + month;
  var mStr1 = month.toString();
  var yStr = year.toString();

  var patterns = [
    'tháng ' + mStr2 + ' (' + yStr + ')',
    'tháng ' + mStr1 + ' (' + yStr + ')',
    'tháng ' + mStr2 + '/' + yStr,
    'tháng ' + mStr1 + '/' + yStr,
    'thang ' + mStr2 + ' (' + yStr + ')',
    'thang ' + mStr1 + ' (' + yStr + ')'
  ];

  for (var i = 0; i < sheets.length; i++) {
    var sName = sheets[i].getName().trim().toLowerCase().replace(/\s+/g, ' ');
    for (var p = 0; p < patterns.length; p++) {
      if (sName === patterns[p]) return sheets[i];
    }
  }

  // Fallback: tên chứa năm và tháng
  for (var j = 0; j < sheets.length; j++) {
    var rawName = sheets[j].getName().trim().toLowerCase();
    if (rawName.indexOf(yStr) >= 0 && (rawName.indexOf('tháng ' + mStr2) >= 0 || rawName.indexOf('tháng ' + mStr1) >= 0 || rawName.indexOf('t' + mStr2) >= 0)) {
      return sheets[j];
    }
  }
  return null;
}

/**
 * Lấy hoặc tự động sao chép từ sheet "NONE" nếu chưa có sheet tháng:
 * - Đổi tên sheet thành: "Tháng MM (YYYY)" (VD: "Tháng 09 (2026)", "Tháng 11 (2026)")
 * - Đổi ô F1 ở sheet thành số tháng (VD: 9, 11)
 * - Đổi ô J1 thành năm (VD: 2026)
 */
function getOrCreateRosterMonthSheet(rosterSS, month, year) {
  var sheet = findRosterMonthSheet(rosterSS, month, year);
  if (sheet) return sheet;

  // Tìm sheet template "NONE" (không phân biệt hoa thường)
  var sheets = rosterSS.getSheets();
  var templateSheet = null;
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toUpperCase() === 'NONE') {
      templateSheet = sheets[i];
      break;
    }
  }

  if (!templateSheet) {
    Logger.log("getOrCreateRosterMonthSheet: Không tìm thấy sheet template 'NONE' trong spreadsheet");
    return null;
  }

  var mStr = (month < 10 ? '0' : '') + month;
  var newSheetName = "Tháng " + mStr + " (" + year + ")";

  try {
    var newSheet = templateSheet.copyTo(rosterSS);
    newSheet.setName(newSheetName);
    // Nhập số tháng vào ô F1 theo yêu cầu: 9, 11,...
    newSheet.getRange("F1").setValue(Number(month));
    // Nhập năm vào ô J1
    if (year) {
      newSheet.getRange("J1").setValue(Number(year));
    }
    newSheet.showSheet();
    Logger.log("✅ Đã tự động tạo sheet '" + newSheetName + "' từ sheet 'NONE' (F1 = " + month + ", J1 = " + year + ")");
    return newSheet;
  } catch (err) {
    Logger.log("Lỗi tạo sheet '" + newSheetName + "' từ 'NONE': " + err.message);
    return findRosterMonthSheet(rosterSS, month, year);
  }
}

/**
 * Hàm lõi: Nạp ca làm việc đã duyệt vào sheet lịch làm ngoài
 * - Cột J (cột 10) tương ứng ngày 1, cột AN (cột 40) tương ứng ngày 31
 * - Tổ trưởng xuất hiện 2 lần: nạp vào nhóm "KHÁC", KHÔNG nạp vào dòng tổ trưởng ở các NHÓM trực
 * - Nhân viên bình thường: nạp vào dòng của nhân viên tại NHÓM trực tương ứng
 */
function syncApprovedSchedulesToExternalRoster(payload) {
  var rosterId = CONFIG.ROSTER_SPREADSHEET_ID || "1VrmLjfdIjxmA62D5Ei33ppkw9ql1r0fvLrX1FJzGm6M";
  var schedules = payload.schedules || [];
  if (!schedules.length) {
    return { success: false, message: 'Không có dữ liệu lịch làm để đồng bộ' };
  }

  // 1. Xác định ngày tháng cụ thể cho 7 ngày trong tuần
  var dayDates = [];
  if (payload.weekDatesKeys && payload.weekDatesKeys.length === 7) {
    for (var d = 0; d < 7; d++) {
      var parts = payload.weekDatesKeys[d].split('-');
      dayDates.push({
        year: parseInt(parts[0], 10),
        month: parseInt(parts[1], 10),
        day: parseInt(parts[2], 10),
        dayIndex: d
      });
    }
  } else {
    var ymMatch = (payload.monthSheet || '').match(/(\d{1,2})[\/\s\(]+(\d{4})/);
    var baseMonth = ymMatch ? parseInt(ymMatch[1], 10) : (new Date().getMonth() + 1);
    var baseYear = ymMatch ? parseInt(ymMatch[2], 10) : new Date().getFullYear();

    var wlMatch = (payload.weekLabel || '').match(/(\d{1,2})\/(\d{1,2})/);
    if (wlMatch) {
      var startDay = parseInt(wlMatch[1], 10);
      var startMonth = parseInt(wlMatch[2], 10);
      var startYear = baseYear;
      if (startMonth === 12 && baseMonth === 1) startYear = baseYear - 1;

      for (var d = 0; d < 7; d++) {
        var curDate = new Date(startYear, startMonth - 1, startDay + d);
        dayDates.push({
          year: curDate.getFullYear(),
          month: curDate.getMonth() + 1,
          day: curDate.getDate(),
          dayIndex: d
        });
      }
    }
  }

  if (dayDates.length !== 7) {
    return { success: false, message: 'Không xác định được danh sách ngày trong tuần để đồng bộ' };
  }

  // 2. Mở file Roster Spreadsheet
  var rosterSS;
  try {
    rosterSS = SpreadsheetApp.openById(rosterId);
  } catch (err) {
    Logger.log('syncApprovedSchedulesToExternalRoster: Không thể mở spreadsheet ' + rosterId + ': ' + err.message);
    return { success: false, message: 'Không thể mở Spreadsheet lịch làm: ' + err.message };
  }

  // 3. Phân nhóm các ngày theo Tháng (để xử lý tuần vắt ngang 2 tháng)
  var monthGroups = {};
  for (var i = 0; i < dayDates.length; i++) {
    var item = dayDates[i];
    var mKey = item.year + '-' + item.month;
    if (!monthGroups[mKey]) {
      monthGroups[mKey] = {
        year: item.year,
        month: item.month,
        days: []
      };
    }
    monthGroups[mKey].days.push(item);
  }

  var totalSyncedEmployees = 0;
  var processedSheets = [];
  var errors = [];

  for (var mKey in monthGroups) {
    var grp = monthGroups[mKey];
    var targetSheet = getOrCreateRosterMonthSheet(rosterSS, grp.month, grp.year);
    if (!targetSheet) {
      var notFoundMsg = 'Không tìm thấy tab sheet cho Tháng ' + grp.month + ' (' + grp.year + ') và không tìm thấy sheet template NONE để sao chép';
      Logger.log(notFoundMsg);
      errors.push(notFoundMsg);
      continue;
    }

    var data = targetSheet.getDataRange().getValues();
    var khacRowMap = {};
    var nhomRowMap = {};
    var inKhac = true;

    // Quét tìm danh sách nhân viên: Cột E (index 4) là Họ và tên
    // Hàng 13 là index 12
    for (var r = 12; r < data.length; r++) {
      var row = data[r];
      var colA = (row[0] || '').toString().trim().toUpperCase();
      var colB = (row[1] || '').toString().trim().toUpperCase();
      var colC = (row[2] || '').toString().trim().toUpperCase();

      if (colA.indexOf('NHÓM') >= 0 || colA.indexOf('KHU TRỰC') >= 0 ||
          colB.indexOf('NHÓM') >= 0 || colB.indexOf('KHU TRỰC') >= 0 ||
          colC.indexOf('NHÓM') >= 0 || colC.indexOf('KHU TRỰC') >= 0) {
        inKhac = false;
      } else if (colB === 'KHÁC' || colA === 'KHÁC') {
        inKhac = true;
      }

      var nameCell = (row[4] || '').toString().trim(); // Cột E (Tên nhân viên)
      if (nameCell) {
        var normName = normalizeEmployeeName(nameCell);
        if (inKhac) {
          khacRowMap[normName] = r + 1; // 1-based row index
        } else {
          nhomRowMap[normName] = r + 1; // 1-based row index
        }
      }
    }

    // Tách các ngày thành các phân đoạn ngày liên tiếp (để ghi hàng loạt theo dãy cột)
    var chunks = [];
    var curChunk = [grp.days[0]];
    for (var k = 1; k < grp.days.length; k++) {
      if (grp.days[k].day === grp.days[k - 1].day + 1) {
        curChunk.push(grp.days[k]);
      } else {
        chunks.push(curChunk);
        curChunk = [grp.days[k]];
      }
    }
    chunks.push(curChunk);

    var syncedInSheet = 0;
    for (var s = 0; s < schedules.length; s++) {
      var emp = schedules[s];
      var normEmpName = normalizeEmployeeName(emp.fullname);

      // Ưu tiên dòng trong nhóm "KHÁC" trước (quy tắc Tổ trưởng nạp ở KHÁC, giữ trống ở NHÓM)
      var targetRow = khacRowMap[normEmpName] || nhomRowMap[normEmpName];
      if (!targetRow) {
        targetRow = findFuzzyRowMatch(normEmpName, khacRowMap) || findFuzzyRowMatch(normEmpName, nhomRowMap);
      }

      if (!targetRow) {
        continue;
      }

      for (var c = 0; c < chunks.length; c++) {
        var chunk = chunks[c];
        var startCol = 9 + chunk[0].day; // Cột J (cột 10) = Ngày 1
        var rowVals = chunk.map(function(dInfo) {
          var rawShift = emp.shifts[dInfo.dayIndex];
          var cleanShift = (rawShift || '').toString().split('\n')[0].trim();
          if (cleanShift === '0:00' || cleanShift === '00:00') cleanShift = 'OFF';
          if (cleanShift === 'Chưa ĐK' || cleanShift === 'Chưa đăng ký') cleanShift = '';
          return cleanShift;
        });

        targetSheet.getRange(targetRow, startCol, 1, chunk.length).setValues([rowVals]);
      }
      syncedInSheet++;
    }

    processedSheets.push(targetSheet.getName() + ' (' + syncedInSheet + ' NV)');
    totalSyncedEmployees += syncedInSheet;
  }

  return {
    success: totalSyncedEmployees > 0,
    syncedCount: totalSyncedEmployees,
    sheets: processedSheets,
    errors: errors,
    message: totalSyncedEmployees > 0
      ? 'Đã đồng bộ sang ' + processedSheets.join(', ')
      : (errors.length ? errors.join('; ') : 'Không tìm thấy nhân viên phù hợp trong sheet lịch làm')
  };
}

/**
 * Web App API handler cho đồng bộ lịch sang Roster
 */
function handleSyncRosterSchedules(payload) {
  try {
    var schedules = payload.schedules;
    // Nếu chưa có schedules, tự động đọc từ sheet nội bộ
    if (!schedules || !schedules.length) {
      var monthSheet = payload.monthSheet || payload.targetSheet;
      var weekLabel = payload.weekLabel;
      if (monthSheet && weekLabel) {
        var sheet = getMonthlyScheduleSheet(monthSheet);
        if (sheet) {
          var data = sheet.getDataRange().getDisplayValues();
          var headerRow = -1;
          for (var i = 0; i < data.length; i++) {
            if (data[i][0] && data[i][0].toString().indexOf('TUẦN ' + weekLabel) >= 0) {
              headerRow = i + 1;
              break;
            }
          }
          if (headerRow > -1) {
            schedules = [];
            for (var r = headerRow; r < data.length; r++) {
              var cellName = data[r][0] ? data[r][0].toString().trim() : '';
              if (cellName.indexOf('TUẦN ') >= 0 && r > headerRow - 1) break;
              if (cellName.indexOf('┗') >= 0) {
                var empName = cellName.replace('┗', '').trim();
                var shifts = [];
                for (var dc = 1; dc <= 7; dc++) {
                  shifts.push(data[r][dc] ? data[r][dc].toString().trim() : 'OFF');
                }
                schedules.push({ fullname: empName, shifts: shifts });
              }
            }
            payload.schedules = schedules;
          }
        }
      }
    }

    var result = syncApprovedSchedulesToExternalRoster(payload);
    return jsonResponse(result.success, result);
  } catch (err) {
    Logger.log('handleSyncRosterSchedules error: ' + err.message);
    return jsonResponse(false, 'Lỗi đồng bộ sang sheet lịch làm: ' + err.message);
  }
}

/**
 * Google Sheets UI menu: Đồng bộ trực tiếp từ giao diện bảng tính
 */
function menuSyncRosterSchedules() {
  var ui = getUI();
  if (!ui) return;

  var ss = getSS();
  var activeSheet = ss.getActiveSheet();
  var sheetName = activeSheet.getName();

  if (sheetName.indexOf('Tháng') === -1) {
    ui.alert('Thông báo', 'Vui lòng chọn tab sheet Tháng cần đồng bộ (ví dụ: Tháng 09/2026)', ui.ButtonSet.OK);
    return;
  }

  var response = ui.prompt(
    'Đồng bộ Lịch Làm',
    'Nhập nhãn tuần cần đồng bộ (ví dụ: 01/09 - 07/09), hoặc để trống để đồng bộ toàn bộ tuần có trong sheet:',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  var weekInput = response.getResponseText().trim();
  ss.toast('Đang đọc và đồng bộ lịch sang Sheet Lịch Làm...', 'Xử lý', 10);

  var data = activeSheet.getDataRange().getDisplayValues();
  var weekBlocks = [];
  var currentWeek = null;

  for (var i = 0; i < data.length; i++) {
    var cell0 = data[i][0] ? data[i][0].toString().trim() : '';
    if (cell0.indexOf('TUẦN ') >= 0) {
      if (currentWeek && currentWeek.schedules.length > 0) {
        weekBlocks.push(currentWeek);
      }
      var cleanWk = cell0.replace('📅 ', '').replace('TUẦN ', '').trim();
      currentWeek = { weekLabel: cleanWk, schedules: [] };
    } else if (currentWeek && cell0.indexOf('┗') >= 0) {
      var empName = cell0.replace('┗', '').trim();
      var shifts = [];
      for (var dc = 1; dc <= 7; dc++) {
        shifts.push(data[i][dc] ? data[i][dc].toString().trim() : 'OFF');
      }
      currentWeek.schedules.push({ fullname: empName, shifts: shifts });
    }
  }
  if (currentWeek && currentWeek.schedules.length > 0) {
    weekBlocks.push(currentWeek);
  }

  if (weekInput) {
    weekBlocks = weekBlocks.filter(function(wb) {
      return wb.weekLabel.indexOf(weekInput) >= 0;
    });
  }

  if (weekBlocks.length === 0) {
    ui.alert('Không tìm thấy dữ liệu', 'Không tìm thấy tuần nào có lịch đã duyệt để đồng bộ.', ui.ButtonSet.OK);
    return;
  }

  var totalSynced = 0;
  var allSheets = [];
  for (var w = 0; w < weekBlocks.length; w++) {
    var wb = weekBlocks[w];
    var res = syncApprovedSchedulesToExternalRoster({
      monthSheet: sheetName,
      weekLabel: wb.weekLabel,
      schedules: wb.schedules
    });
    if (res && res.success) {
      totalSynced += (res.syncedCount || 0);
      if (res.sheets) allSheets = allSheets.concat(res.sheets);
    }
  }

  ui.alert('Hoàn tất đồng bộ', 'Đã đồng bộ ' + totalSynced + ' lượt nhân viên sang Sheet Lịch Làm (1Vrm...)\n' + allSheets.join('\n'), ui.ButtonSet.OK);
}


/**
 * Get schedule history for an employee (or all) from the monthly sheet
 */
function handleGetScheduleHistory(payload) {
  var monthSheet = payload.monthSheet;
  if (!monthSheet) return jsonResponse(false, 'Thiếu tên sheet');
  
  var ss = getSS();
  var sheet = ss.getSheetByName(monthSheet);
  if (!sheet) return jsonResponse(true, []);
  
  // USE getDisplayValues() !
  var data = sheet.getDataRange().getDisplayValues();
  var fullname = payload.fullname;
  var currentWeek = '';
  var history = [];
  
  for (var i = 1; i < data.length; i++) {
    var name = data[i][0] ? data[i][0].toString() : '';
    
    // Track current week
    if (name.indexOf('TUẦN ') >= 0) {
      currentWeek = name.replace('📅 ', '').replace('TUẦN ', '');
      continue;
    }
    
    if (!name) continue;
    
    var isApproval = name.indexOf('┗') >= 0;
    var cleanName = isApproval ? name.replace('┗ ', '').trim() : name;
    
    // Filter by employee if specified
    if (fullname && cleanName.toLowerCase() !== fullname.toLowerCase()) continue;
    
    history.push({
      week: currentWeek,
      fullname: cleanName,
      type: isApproval ? 'approved' : 'register',
      shifts: [
        data[i][1] ? data[i][1].toString().trim() : 'OFF',
        data[i][2] ? data[i][2].toString().trim() : 'OFF',
        data[i][3] ? data[i][3].toString().trim() : 'OFF',
        data[i][4] ? data[i][4].toString().trim() : 'OFF',
        data[i][5] ? data[i][5].toString().trim() : 'OFF',
        data[i][6] ? data[i][6].toString().trim() : 'OFF',
        data[i][7] ? data[i][7].toString().trim() : 'OFF'
      ],
      reason: data[i][8] ? data[i][8].toString() : '',
      timestamp: data[i][9] ? data[i][9].toString() : '',
      status: data[i][10] ? data[i][10].toString() : ''
    });
  }
  
  return jsonResponse(true, history);
}

// =======================================================
// CHECKLIST MODULE CONFIG
// =======================================================

function handleGetChecklistConfig(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_CHECKLIST_CONFIG);
  if (!sheet) return jsonResponse(true, []);
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return jsonResponse(true, []);
  
  var items = [];
  for (var i = 1; i < data.length; i++) {
    items.push({
      id: data[i][0] ? data[i][0].toString() : '',
      taskName: data[i][1] ? data[i][1].toString() : '',
      bonusPoints: Number(data[i][2]) || 0,
      penaltyPoints: Number(data[i][3]) || 0,
      targetPosition: data[i][4] ? data[i][4].toString() : '',
      targetShift: data[i][5] ? data[i][5].toString() : '',
      inspectorUsername: data[i][6] ? data[i][6].toString() : '',
      inspectorFullname: data[i][7] ? data[i][7].toString() : '',
      isActive: data[i][8] !== false && data[i][8] !== 'FALSE', // default true
      isRequired: data[i][9] === true || data[i][9] === 'TRUE',
      frequency: data[i][10] ? data[i][10].toString() : 'Daily'
    });
  }
  return jsonResponse(true, items);
}

function handleSaveChecklistConfig(payload) {
  if (!payload || !payload.items) return jsonResponse(false, 'Thiếu dữ liệu');
  
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_CHECKLIST_CONFIG);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_CHECKLIST_CONFIG);
    var headers = ['ID', 'Hạng mục', 'Điểm thưởng', 'Điểm phạt', 'Chức vụ', 'Ca', 'Mã NKT', 'Tên NKT', 'Kích hoạt', 'Bắt buộc', 'Tần suất'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setBackground('#3b82f6').setFontColor('white').setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else {
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }
  }
  
  var items = payload.items;
  if (items.length > 0) {
    var writeData = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      writeData.push([
        it.id || Utilities.getUuid(),
        it.taskName || '',
        it.bonusPoints || 0,
        it.penaltyPoints || 0,
        it.targetPosition || 'Tất cả',
        it.targetShift || 'Tất cả',
        it.inspectorUsername || '',
        it.inspectorFullname || '',
        it.isActive !== false,
        it.isRequired === true,
        it.frequency || 'Daily'
      ]);
    }
    sheet.getRange(2, 1, writeData.length, writeData[0].length).setValues(writeData);
  }
  
  return jsonResponse(true, 'Đã lưu cấu hình Checklist');
}

// =====================================================================================
// 14. UPLOAD IMAGE (GENERAL PURPOSE)
// =====================================================================================

function handleUploadCheckinImage(payload) {
  if (!payload || !payload.image) {
    return jsonResponse(false, 'Thiếu dữ liệu upload ảnh');
  }
  
  var lock = LockService.getScriptLock();
  try {
    // Acquire lock with 30s timeout to prevent concurrency race conditions with insertRowBefore(2)
    lock.waitLock(30000);
    
    var imageUrl = uploadImageBlobToDrive(payload.image, payload.fullname || payload.username || 'checkin');
    if (!imageUrl) {
      return jsonResponse(false, 'Không thể tạo file ảnh trên Google Drive');
    }
    
    // Tìm dòng tương ứng trên Sheet bằng 4-Tier Matcher chống trôi dòng khi nhiều người cùng checkin
    var sheet = getSS().getSheetByName(CONFIG.SHEET_LOGS);
    var data = sheet.getDataRange().getValues();
    
    var targetRowIdx = -1;
    var targetDataRow = null;
    
    var targetCheckinId = payload.checkinId ? payload.checkinId.toString().trim() : '';
    var targetTimeISO = payload.timeISO ? payload.timeISO.toString().trim() : '';
    var cleanFullname = (payload.fullname || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    var cleanUsername = (payload.username || '').toString().trim().toLowerCase();

    function normalizeName(str) {
      if (!str) return '';
      return str.toString().trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function isSamePerson(rowName) {
      var nRow = normalizeName(rowName);
      if (!nRow) return false;
      if (cleanFullname && (nRow === cleanFullname || nRow.indexOf(cleanFullname) >= 0 || cleanFullname.indexOf(nRow) >= 0)) return true;
      if (cleanUsername && (nRow === cleanUsername || nRow.indexOf(cleanUsername) >= 0)) return true;
      return false;
    }

    // TIER 1: Match by unique checkinId in Column H (Data JSON) - Bất biến dù bị đẩy xuống bao nhiêu dòng
    if (targetCheckinId) {
      for (var i = 1; i < data.length; i++) {
        var rowJsonStr = data[i][7] ? data[i][7].toString() : '';
        if (rowJsonStr && rowJsonStr.indexOf(targetCheckinId) !== -1) {
          targetRowIdx = i + 1;
          targetDataRow = data[i];
          break;
        }
      }
    }

    // TIER 2: Match by timeISO in Column H (Data JSON) + đúng người
    if (targetRowIdx === -1 && targetTimeISO) {
      for (var i = 1; i < data.length; i++) {
        var rowJsonStr = data[i][7] ? data[i][7].toString() : '';
        if (rowJsonStr && rowJsonStr.indexOf(targetTimeISO) !== -1 && isSamePerson(data[i][0])) {
          targetRowIdx = i + 1;
          targetDataRow = data[i];
          break;
        }
      }
    }

    // TIER 3: Match theo tên nhân viên và Cột G đang chưa có ảnh (chỉ chọn dòng chưa có link)
    if (targetRowIdx === -1) {
      var scanLimit = Math.min(data.length, 16);
      for (var i = 1; i < scanLimit; i++) {
        if (isSamePerson(data[i][0])) {
          var colG = data[i][6] ? data[i][6].toString().trim() : '';
          var isEmpty = colG === '' || colG === 'PENDING' || colG.indexOf('Đang tải ảnh') !== -1;
          if (isEmpty) {
            targetRowIdx = i + 1;
            targetDataRow = data[i];
            break;
          }
        }
      }
    }

    if (targetRowIdx > 1 && targetDataRow) {
      // 1. Ghi công thức Hyperlink an toàn vào Cột G
      var isValid = (targetDataRow[4] ? targetDataRow[4].toString() : '').indexOf('Hợp lệ') >= 0;
      var linkColor = isValid ? '#10b981' : '#ef4444';
      var cellG = sheet.getRange(targetRowIdx, 7);
      try {
        cellG.setFormula('=HYPERLINK("' + imageUrl + '"; "📷 Xem ảnh")')
             .setFontColor(linkColor)
             .setFontSize(9);
      } catch (fErr) {
        try {
          cellG.setValue(imageUrl)
               .setFontColor(linkColor)
               .setFontSize(9);
        } catch (fErr2) {}
      }
      
      // 2. Cập nhật lại Cột H JSON
      try {
        var oldJsonStr = targetDataRow[7] ? targetDataRow[7].toString() : '{}';
        var oldJson = JSON.parse(oldJsonStr);
        oldJson.linkAnh = imageUrl;
        if (targetCheckinId && !oldJson.checkinId) oldJson.checkinId = targetCheckinId;
        sheet.getRange(targetRowIdx, 8).setValue(JSON.stringify(oldJson));
      } catch (ej) {}
      
      SpreadsheetApp.flush();

      // Invalidate cache
      if (payload.username) {
        invalidateGetDataCache(payload.username);
      }
      
      return jsonResponse(true, { url: imageUrl, rowMatched: targetRowIdx });
    }

    return jsonResponse(false, 'Không tìm thấy dòng tương ứng để cập nhật ảnh trên Sheet');
  } catch (e) {
    Logger.log('Lỗi upload ảnh chấm công: ' + e.message);
    return jsonResponse(false, 'Lỗi: ' + e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Tiện ích chẩn đoán, quét Drive và tự động sửa toàn bộ lỗi công thức #ERROR!,
 * đồng thời gắn đúng link ảnh minh chứng từ Google Drive cho các lượt chấm công
 */
function handleDiagnoseAndHealImages(payload) {
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
    if (!sheet) return jsonResponse(false, 'Không tìm thấy sheet: ' + CONFIG.SHEET_LOGS);

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonResponse(true, { message: 'Chưa có dữ liệu chấm công', fixedCount: 0 });

    var scanLimit = (payload && payload.limit) ? Number(payload.limit) : 1000;
    var scanCount = Math.min(lastRow - 1, scanLimit);
    var range = sheet.getRange(2, 1, scanCount, 8);
    var values = range.getValues();
    var formulas = range.getFormulas();

    var fixedCount = 0;
    var details = [];

    // Quét và sửa lỗi công thức hàng loạt, TUYỆT ĐỐI KHÔNG GÁN NHẦM ẢNH CỦA LƯỢT KHÁC
    var newFormulas = [];
    var newColH = [];
    var newColors = [];
    var newSizes = [];
    var hasBatchChanges = false;

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var rowIdx = i + 2;
      var fullname = row[0] ? row[0].toString().trim() : '';
      var timeVal = row[2] ? row[2].toString().replace(/^'/, '').trim() : '';
      var colG = row[6] ? row[6].toString().trim() : '';
      var formulaG = formulas[i][6] ? formulas[i][6].toString().trim() : '';
      var colH = row[7] ? row[7].toString().trim() : '';
      var isHopLe = (row[4] ? row[4].toString() : '').indexOf('Hợp lệ') >= 0;
      var linkColor = isHopLe ? '#10b981' : '#ef4444';

      var targetUrl = '';

      // A. Tìm URL từ formula hiện tại hoặc giá trị ô Cột G
      var matchFormula = formulaG.match(/https?:\/\/drive\.google\.com\/[^\s"';,]+/);
      var matchColG = colG.match(/https?:\/\/drive\.google\.com\/[^\s"';,]+/);
      if (matchFormula) {
        targetUrl = matchFormula[0];
      } else if (matchColG) {
        targetUrl = matchColG[0];
      }

      // B. Tìm trong Cột H JSON của CHÍNH DÒNG NÀY
      if (!targetUrl && colH.indexOf('drive.google.com') >= 0) {
        try {
          var parsedH = JSON.parse(colH);
          if (parsedH.linkAnh && parsedH.linkAnh.indexOf('drive.google.com') >= 0) {
            targetUrl = parsedH.linkAnh.trim();
          }
        } catch(e) {
          var matchH = colH.match(/https?:\/\/drive\.google\.com\/[^\s"',}]+/);
          if (matchH) targetUrl = matchH[0];
        }
      }

      // C. Xác định xem ô này có lỗi, đang pending, hoặc đang dùng dấu phẩy ',' không
      var formulaHasComma = formulaG.indexOf('",') >= 0 || (formulaG.indexOf('HYPERLINK(') >= 0 && formulaG.indexOf(';') < 0);
      var isPendingOrError = colG.indexOf('Đang tải ảnh') >= 0 ||
                             colG === 'PENDING' ||
                             colG.indexOf('#ERROR!') >= 0 ||
                             formulaG.indexOf('#ERROR!') >= 0 ||
                             formulaHasComma;

      var rowFormula = formulaG;
      var rowColH = colH;
      var rowColor = linkColor;
      var rowSize = 9;

      if (targetUrl) {
        // Chuẩn hóa dấu chấm phẩy ';' theo chuẩn Locale Việt Nam
        var correctFormula = '=HYPERLINK("' + targetUrl + '"; "📷 Xem ảnh")';
        if (formulaG !== correctFormula || colG.indexOf('#ERROR!') >= 0 || formulaHasComma || isPendingOrError) {
          rowFormula = correctFormula;
          hasBatchChanges = true;
          fixedCount++;
          details.push({
            row: rowIdx,
            fullname: fullname,
            time: timeVal,
            url: targetUrl
          });

          // Cập nhật Cột H JSON
          try {
            var oldObj = {};
            if (colH) { try { oldObj = JSON.parse(colH); } catch(pe){} }
            oldObj.linkAnh = targetUrl;
            rowColH = JSON.stringify(oldObj);
          } catch(errH){}
        }
      } else if (isPendingOrError && (colG.indexOf('Đang tải ảnh') >= 0 || colG === 'PENDING')) {
        rowFormula = '';
        rowColor = '#94a3b8';
        try {
          var oldObj = {};
          if (colH) { try { oldObj = JSON.parse(colH); } catch(pe){} }
          oldObj.linkAnh = '';
          rowColH = JSON.stringify(oldObj);
        } catch(errH2){}
        hasBatchChanges = true;
        fixedCount++;
      }

      newFormulas.push([rowFormula]);
      newColH.push([rowColH]);
      newColors.push([rowColor]);
      newSizes.push([rowSize]);
    }

    // Thực hiện Batch update đồng loạt
    if (hasBatchChanges && values.length > 0) {
      sheet.getRange(2, 7, values.length, 1).setFormulas(newFormulas);
      sheet.getRange(2, 7, values.length, 1).setFontColors(newColors);
      sheet.getRange(2, 7, values.length, 1).setFontSizes(newSizes);
      sheet.getRange(2, 8, values.length, 1).setValues(newColH);
    }

    if (fixedCount > 0) {
      SpreadsheetApp.flush();
      JsonCacheService.invalidateAllCache();
    }

    return jsonResponse(true, {
      message: 'Đã phục hồi và chuẩn hóa ' + fixedCount + ' dòng link ảnh chấm công.',
      fixedCount: fixedCount,
      detailsCount: details.length,
      details: details.slice(0, 30)
    });
  } catch (err) {
    Logger.log('handleDiagnoseAndHealImages error: ' + err.message);
    return jsonResponse(false, 'Lỗi chẩn đoán và sửa ảnh: ' + err.message);
  }
}

/**
 * Tiện ích menu cho Google Sheets: Quét và sửa toàn bộ lỗi công thức #ERROR! cũng như phục hồi link ảnh
 */
function repairCheckinFormulasAndImages() {
  var res = handleDiagnoseAndHealImages({});
  var ui = getUI();
  if (ui) {
    if (res && res.data) {
      ui.alert('Kết Quả Phục Hồi Link Ảnh:\n\n' + res.data.message);
    } else {
      ui.alert('Thông báo: ' + (res?.message || 'Hoàn tất quét'));
    }
  }
}

function handleUploadAvatar(payload) {
  if (!payload || !payload.image || !payload.username) return jsonResponse(false, 'Thiếu dữ liệu');
  try {
    var base64Data = payload.image;
    if (base64Data.indexOf('base64,') >= 0) base64Data = base64Data.split('base64,')[1];
    else if (base64Data.indexOf(',') >= 0) base64Data = base64Data.split(',')[1];
    
    var ext = '.jpg';
    var mimeType = 'image/jpeg';
    if (payload.image && payload.image.indexOf('data:image/webp') === 0) {
      mimeType = 'image/webp';
      ext = '.webp';
    } else if (payload.image && payload.image.indexOf('data:image/png') === 0) {
      mimeType = 'image/png';
      ext = '.png';
    }
    
    var filename = 'avatar_' + payload.username.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + ext;
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, filename);
    var folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    
    var imageUrl = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400';
    
    // Save to DATA sheet Col 8 (index 7)
    var ss = getSS();
    var sheet = ss.getSheetByName(CONFIG.SHEET_USERS);
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      for (var i = 2; i < data.length; i++) {
        if (data[i][0] && data[i][0].toString().toLowerCase() === payload.username.toLowerCase()) {
          sheet.getRange(i + 1, 8).setValue(imageUrl);
          break;
        }
      }
    }
    
    invalidateGetDataCache(payload.username);
    return jsonResponse(true, { url: imageUrl });
  } catch(e) {
    return jsonResponse(false, 'Lỗi upload avatar: ' + e.message);
  }
}
function handleUploadImage(payload) {
  if (!payload || !payload.image) return jsonResponse(false, 'Không có ảnh upload');
  
  try {
    // Decode base64
    var base64Data = payload.image;
    if (base64Data.indexOf('base64,') >= 0) {
      base64Data = base64Data.split('base64,')[1];
    } else if (base64Data.indexOf(',') >= 0) {
      base64Data = base64Data.split(',')[1];
    }
    
    var time = new Date();
    var filename = payload.filename || ('Upload_' + time.getTime() + '.webp');
    
    var mimeType = 'image/webp';
    if (filename.toLowerCase().indexOf('.png') > 0) mimeType = 'image/png';
    else if (filename.toLowerCase().indexOf('.jpg') > 0 || filename.toLowerCase().indexOf('.jpeg') > 0) mimeType = 'image/jpeg';
    
    var blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      mimeType,
      filename
    );
    
    // Use CONFIG.FOLDER_ID or let user pass folder ID if needed later
    var folderId = payload.folderId || CONFIG.FOLDER_ID;
    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);
    var imageUrl = file.getUrl();
    
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (eShare) {
      Logger.log('Cảnh báo phân quyền: ' + eShare.message);
    }
    
    return jsonResponse(true, { url: imageUrl });
  } catch (e) {
    return jsonResponse(false, 'Lỗi upload ảnh: ' + e.message);
  }
}

function hexToRgb(hex) {
  if (!hex) return { red: 1.0, green: 1.0, blue: 1.0 };
  hex = hex.toString().replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  var r = parseInt(hex.substring(0, 2), 16) / 255;
  var g = parseInt(hex.substring(2, 4), 16) / 255;
  var b = parseInt(hex.substring(4, 6), 16) / 255;
  return { red: isNaN(r) ? 1.0 : r, green: isNaN(g) ? 1.0 : g, blue: isNaN(b) ? 1.0 : b };
}

// =====================================================================================
// MISSED CHECK-IN HANDLERS (BÁO BỔ SUNG LƯỢT CHẤM CÔNG)
// =====================================================================================

function getMissedCheckinsSheet() {
  var ss = getSS();
  var sheet = ss.getSheetByName('📝 BỔ SUNG CÔNG');
  if (!sheet) {
    sheet = ss.getSheetByName('MISSED_CHECKINS');
  }
  if (!sheet) {
    sheet = ss.insertSheet('📝 BỔ SUNG CÔNG');
    var headers = ['ID', 'Timestamp', 'Username', 'Họ và tên', 'Ngày', 'Giờ', 'Loại', 'Ca làm', 'Lý do', 'Link ảnh minh chứng', 'Trạng thái', 'Người duyệt', 'Thời gian duyệt', 'Ghi chú'];
    sheet.appendRow(headers);
    sheet.getRange('A1:N1').setBackground('#1e293b').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function handleSubmitMissedCheckin(payload) {
  try {
    if (!payload.username) return jsonResponse(false, 'Thiếu thông tin người dùng.');
    if (!payload.date || !payload.time || !payload.type) return jsonResponse(false, 'Vui lòng điền đầy đủ Ngày, Giờ và Loại chấm công.');

    var sheet = getMissedCheckinsSheet();
    var id = 'MC_' + new Date().getTime();
    var now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
    
    var imageUrl = payload.image || '';
    if (payload.imageBase64) {
      try {
        var base64Data = payload.imageBase64;
        var mimeType = 'image/jpeg';
        if (base64Data.indexOf('data:') === 0) {
          var parts = base64Data.split(';base64,');
          mimeType = parts[0].replace('data:', '');
          base64Data = parts[1];
        }
        var decoded = Utilities.base64Decode(base64Data);
        var ext = '.jpg';
        if (mimeType === 'image/webp') ext = '.webp';
        else if (mimeType === 'image/png') ext = '.png';
        var blob = Utilities.newBlob(decoded, mimeType, 'MissedCheckIn_' + id + ext);
        var folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
        var file = folder.createFile(blob);
        try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
        imageUrl = file.getUrl();
      } catch (uploadErr) {
        Logger.log('Lỗi upload ảnh bổ sung công: ' + uploadErr.message);
      }
    }

    var newRow = [
      id,
      now,
      payload.username,
      payload.fullname || payload.username,
      payload.date,
      payload.time,
      payload.type,
      payload.shift || '',
      payload.reason || '',
      imageUrl,
      'Pending',
      '',
      '',
      payload.note || ''
    ];

    sheet.appendRow(newRow);

    return jsonResponse(true, {
      id: id,
      status: 'Pending',
      message: 'Đã gửi đơn báo bổ sung công thành công. Vui lòng gửi thông tin vào nhóm Zalo để Quản lý duyệt sớm.'
    });
  } catch (e) {
    return jsonResponse(false, 'Lỗi gửi đơn: ' + e.message);
  }
}

function handleGetMissedCheckins(payload) {
  try {
    var sheet = getMissedCheckinsSheet();
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return jsonResponse(true, []);

    var claims = [];
    var isAdmin = payload.role === 'admin' || payload.username === 'ADMIN' || payload.role === 'tester';

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      var username = row[2];
      if (!isAdmin && username !== payload.username) continue;

      claims.push({
        id: row[0].toString(),
        createdAt: row[1] ? row[1].toString() : '',
        username: row[2] ? row[2].toString() : '',
        fullname: row[3] ? row[3].toString() : '',
        date: row[4] ? row[4].toString() : '',
        time: row[5] ? row[5].toString() : '',
        type: row[6] ? row[6].toString() : 'Vào ca',
        shift: row[7] ? row[7].toString() : '',
        reason: row[8] ? row[8].toString() : '',
        proofImage: row[9] ? row[9].toString() : '',
        status: row[10] ? row[10].toString() : 'Pending',
        approvedBy: row[11] ? row[11].toString() : '',
        approvedAt: row[12] ? row[12].toString() : '',
        note: row[13] ? row[13].toString() : '',
        rowIndex: i + 1
      });
    }

    claims.reverse();
    return jsonResponse(true, claims);
  } catch (e) {
    return jsonResponse(false, 'Lỗi lấy danh sách đơn: ' + e.message);
  }
}

function handleApproveMissedCheckin(payload) {
  try {
    if (!payload.id) return jsonResponse(false, 'Thiếu mã đơn ID.');
    var adminUser = payload.adminUsername || payload.username || 'ADMIN';
    var sheet = getMissedCheckinsSheet();
    var data = sheet.getDataRange().getValues();
    var targetRowIndex = -1;
    var claim = null;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === payload.id.toString()) {
        targetRowIndex = i + 1;
        claim = {
          id: data[i][0].toString(),
          username: data[i][2].toString(),
          fullname: data[i][3].toString(),
          date: data[i][4].toString(),
          time: data[i][5].toString(),
          type: data[i][6].toString(),
          shift: data[i][7].toString(),
          reason: data[i][8].toString(),
          proofImage: data[i][9].toString(),
          note: data[i][13] ? data[i][13].toString() : ''
        };
        break;
      }
    }

    if (targetRowIndex === -1 || !claim) return jsonResponse(false, 'Không tìm thấy đơn báo bổ sung.');

    var now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
    sheet.getRange(targetRowIndex, 11, 1, 3).setValues([['Approved', adminUser, now]]);

    // INSERT INTO SHEET CHECKIN (CONFIG.SHEET_LOGS)
    var ss = getSS();
    var logSheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
    if (logSheet) {
      var fullTimeStr = claim.date + ' ' + (claim.time.length === 5 ? claim.time + ':00' : claim.time);
      var noteText = 'Báo chấm công bổ sung - Đã duyệt (Admin: ' + adminUser + ' - Đơn #' + claim.id + ')';
      var dataJson = JSON.stringify({
        hoVaTen: claim.fullname,
        loaiChamCong: claim.type,
        thoiGian: fullTimeStr,
        viTri: "Nhà hàng King's Grill (Giải trình bổ sung)",
        xacMinh: "Hợp lệ",
        khoangCach: "Giải trình",
        linkAnh: claim.proofImage || '',
        caLam: claim.shift || '',
        ghiChu: noteText,
        claimId: claim.id,
        approvedBy: adminUser,
        approvedAt: now,
        isMissedCheckInClaim: true
      });

      var newLog = [
        claim.fullname,
        claim.type,
        "'" + fullTimeStr,
        "Nhà hàng King's Grill (Giải trình)",
        "Hợp lệ",
        "Giải trình",
        claim.proofImage || '',
        dataJson
      ];

      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(15000);
        logSheet.insertRowBefore(2);
        logSheet.getRange(2, 1, 1, 8).setValues([newLog]);
        formatCheckInRow(logSheet, 2, true, claim.proofImage || '');
      } catch (lockErr) {
        logSheet.appendRow(newLog);
      } finally {
        try { lock.releaseLock(); } catch(e) {}
      }
    }

    return jsonResponse(true, { message: 'Đã duyệt đơn và tự động chèn vào Bảng chấm công!' });
  } catch (e) {
    return jsonResponse(false, 'Lỗi duyệt đơn: ' + e.message);
  }
}

function handleRejectMissedCheckin(payload) {
  try {
    if (!payload.id) return jsonResponse(false, 'Thiếu mã đơn ID.');
    var adminUser = payload.adminUsername || payload.username || 'ADMIN';
    var sheet = getMissedCheckinsSheet();
    var data = sheet.getDataRange().getValues();
    var targetRowIndex = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === payload.id.toString()) {
        targetRowIndex = i + 1;
        break;
      }
    }

    if (targetRowIndex === -1) return jsonResponse(false, 'Không tìm thấy đơn báo bổ sung.');

    var now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
    var reason = payload.reason || 'Không đủ minh chứng';
    sheet.getRange(targetRowIndex, 11, 1, 4).setValues([['Rejected', adminUser, now, reason]]);

    return jsonResponse(true, { message: 'Đã từ chối đơn báo bổ sung công.' });
  } catch (e) {
    return jsonResponse(false, 'Lỗi từ chối đơn: ' + e.message);
  }
}

/**
 * Cập nhật lại Loại Chấm Công khi nhân viên hoặc quản lý chọn nhầm.
 * Ghi vết kiểm toán vào Cột H (DATA JSON) và đổi màu hiển thị trên Sheet.
 */
function handleUpdateCheckinType(payload) {
  try {
    if (!payload.username || !payload.newType) {
      return jsonResponse(false, 'Thiếu thông tin cập nhật loại chấm công.');
    }
    var ss = getSS();
    var sheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
    if (!sheet) return jsonResponse(false, 'Không tìm thấy sheet chấm công');

    var isAdmin = payload.role === 'admin' || payload.role === 'tester' || (payload.username || '').toLowerCase() === 'admin';
    var targetRowIndex = -1;
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return jsonResponse(false, 'Không có dữ liệu chấm công để cập nhật.');

    var targetFullname = payload.fullname ? payload.fullname.trim().toLowerCase() : '';
    var targetTime = payload.time ? payload.time.toString().trim().replace(/^'/, '') : '';

    // 1. Kiểm tra rowIndex gửi lên nếu hợp lệ
    if (payload.rowIndex && payload.rowIndex >= 2 && payload.rowIndex <= lastRow) {
      var checkRow = sheet.getRange(payload.rowIndex, 1, 1, 8).getValues()[0];
      var checkName = checkRow[0] ? checkRow[0].toString().trim().toLowerCase() : '';
      var checkTime = checkRow[2] ? checkRow[2].toString().trim().replace(/^'/, '') : '';

      if (isAdmin || checkName === targetFullname || checkName === payload.username.toLowerCase()) {
        if (!targetTime || checkTime === targetTime) {
          targetRowIndex = payload.rowIndex;
        }
      }
    }

    // 2. Fallback quét 300 dòng đầu tìm theo fullname và time
    if (targetRowIndex === -1) {
      var scanRows = sheet.getRange(2, 1, Math.min(lastRow - 1, 300), 8).getValues();
      for (var r = 0; r < scanRows.length; r++) {
        var row = scanRows[r];
        var rName = row[0] ? row[0].toString().trim().toLowerCase() : '';
        var rTime = row[2] ? row[2].toString().trim().replace(/^'/, '') : '';
        if ((isAdmin || rName === targetFullname || rName === payload.username.toLowerCase()) && rTime === targetTime) {
          targetRowIndex = r + 2;
          break;
        }
      }
    }

    if (targetRowIndex === -1) {
      return jsonResponse(false, 'Không tìm thấy dòng chấm công tương ứng hoặc bạn không có quyền sửa.');
    }

    var currentRowData = sheet.getRange(targetRowIndex, 1, 1, 8).getValues()[0];
    var originalType = currentRowData[1] ? currentRowData[1].toString() : '';
    var newType = payload.newType.toString().trim();

    // Parse JSON
    var dataJson = {};
    try {
      if (currentRowData[7]) dataJson = JSON.parse(currentRowData[7].toString());
    } catch(ej) {}

    var nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
    dataJson.loaiChamCong = newType;
    dataJson.isCorrected = true;
    dataJson.originalType = originalType;
    dataJson.correctedAt = nowStr;
    dataJson.correctedBy = payload.username;
    dataJson.correctionReason = payload.reason || 'Nhân viên cập nhật lại loại chấm công';

    var noteText = (dataJson.ghiChu ? dataJson.ghiChu + ' • ' : '') + 'Đã sửa từ ' + originalType + ' (' + (payload.reason || 'chọn nhầm') + ')';
    dataJson.ghiChu = noteText;

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
      sheet.getRange(targetRowIndex, 2).setValue(newType);
      sheet.getRange(targetRowIndex, 8).setValue(JSON.stringify(dataJson));

      // Cập nhật lại format dòng
      var isValid = currentRowData[4] ? currentRowData[4].toString().indexOf('Hợp lệ') >= 0 : true;
      var imageUrl = currentRowData[6] ? currentRowData[6].toString() : '';
      formatCheckInRow(sheet, targetRowIndex, isValid, imageUrl);

      lock.releaseLock();
    } catch (lErr) {
      sheet.getRange(targetRowIndex, 2).setValue(newType);
      sheet.getRange(targetRowIndex, 8).setValue(JSON.stringify(dataJson));
    }

    // Xóa cache để cập nhật ngay lập tức
    invalidateGetDataCache(payload.username);

    return jsonResponse(true, {
      message: 'Đã cập nhật loại chấm công thành công',
      rowIndex: targetRowIndex,
      newType: newType,
      originalType: originalType,
      correctedAt: nowStr
    });
  } catch (err) {
    Logger.log('handleUpdateCheckinType error: ' + err.message);
    return jsonResponse(false, 'Lỗi cập nhật loại chấm công: ' + err.message);
  }
}

function handleDiagnoseCells(payload) {
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
    var locale = ss.getSpreadsheetLocale();
    var tz = ss.getSpreadsheetTimeZone();
    
    var rows = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    var debugRows = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var cell = sheet.getRange(r, 7);
      debugRows.push({
        row: r,
        name: sheet.getRange(r, 1).getDisplayValue(),
        formula: cell.getFormula(),
        value: cell.getValue(),
        displayValue: cell.getDisplayValue()
      });
    }
    
    return jsonResponse(true, {
      locale: locale,
      timezone: tz,
      rows: debugRows
    });
  } catch(e) {
    return jsonResponse(false, e.toString());
  }
}
