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

// 1. User Authentication
function handleLogin(payload) {
  // Auto-migrate headers if not already migrated
  try {
    var ss = getSS();
    var usersSheet = ss.getSheetByName(CONFIG.SHEET_USERS);
    if (usersSheet && usersSheet.getRange(2, 1).getValue().toString().trim() !== 'Username') {
      migrateDataHeadersQuietly(usersSheet);
    }
  } catch (e) {
    Logger.log('Header migration error: ' + e.toString());
  }

  if (!payload || !payload.username || !payload.password) {
    return jsonResponse(false, 'Thiếu thông tin đăng nhập');
  }
  // === TEST ACCOUNT: bypass sheet lookup ===
  if (payload.username.toLowerCase() === 'testapp' && payload.password === '123456') {
    return jsonResponse(true, {
      username: 'testapp',
      fullname: 'TESTAPP',
      email: 'ngaiviettenem@gmail.com', // Cập nhật theo yêu cầu
      role: 'tester',
      isTester: true,
      position: 'Tester',
      employmentStatus: 'active',
      statusUntil: '',
      statusReason: ''
    });
  }
  
  // === SUPER ADMIN ACCOUNT ===
  if (payload.username.toUpperCase() === 'ADMIN' && payload.password === 'admin1') {
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
  
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) return jsonResponse(false, 'Không tìm thấy sheet người dùng');
  
  var inputPassword = payload.password.toString();
  var inputHash = payload.passwordHash || computePasswordHash(inputPassword);

  var data = sheet.getDataRange().getValues();
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    // Col 0: Username, Col 1: Password, Col 2: FullName, Col 3: DOB, Col 4: Email, Col 5: Role
    if (row[0].toString().toLowerCase() === payload.username.toLowerCase()) {
      var storedPass = row[1] ? row[1].toString() : '';
      var isMatched = (storedPass === inputPassword) || (storedPass === inputHash) || (computePasswordHash(storedPass) === inputHash);

      if (isMatched) {
        // Auto-upgrade legacy plaintext password to secure hash in background
        if (storedPass === inputPassword && storedPass.length < 50) {
          try {
            sheet.getRange(i + 1, 2).setValue(inputHash);
          } catch (e) {
            Logger.log('Auto password hash upgrade error: ' + e.toString());
          }
        }

        var employmentProfile = getEmploymentProfileByUsername(row[0].toString());
        return jsonResponse(true, {
          username: row[0],
          fullname: row[2],
          email: row[4] || '',
          role: row[5] ? row[5].toString() : (row[0].toString().toLowerCase() === 'admin' ? 'admin' : 'user'),
          position: row[6] ? row[6].toString() : 'Phục vụ',
          avatarUrl: row[7] ? row[7].toString() : '',
          employmentStatus: employmentProfile ? employmentProfile.employmentStatus : normalizeEmploymentStatus(row[8]),
          statusUntil: employmentProfile ? employmentProfile.statusUntil : (row[9] ? row[9].toString() : ''),
          statusReason: employmentProfile ? employmentProfile.statusReason : (row[10] ? row[10].toString() : ''),
          statusUpdatedAt: employmentProfile ? employmentProfile.statusUpdatedAt : (row[11] ? row[11].toString() : '')
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
      + '<table border="0" cellpadding="0" cellspacing="0" align="center"><tr>'
      + '<td align="center" style="width: 46px; height: 46px; background-color: #1e293b; border: 2px solid rgba(251, 191, 36, 0.4); border-radius: 12px; color: #fbbf24; font-size: 20px; font-weight: 900; line-height: 46px; text-align: center;">KG</td>'
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
  var parts = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (parts) {
    var day = parseInt(parts[1], 10);
    var month = parseInt(parts[2], 10) - 1; // 0-indexed month
    var year = parseInt(parts[3], 10);
    var hour = parseInt(parts[4], 10);
    var minute = parseInt(parts[5], 10);
    var second = parts[6] ? parseInt(parts[6], 10) : 0;
    return new Date(year, month, day, hour, minute, second);
  }
  return new Date();
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
  
  // payload: username, fullname, email, type, lat, lng, image, timestamp, location, distance
  var time = parseDateTimeString(payload.time);
  
  // === COL A: HỌ VÀ TÊN ===
  var hoVaTen = payload.fullname;
  
  // === COL B: LOẠI CHẤM CÔNG ===
  var loaiChamCong = payload.type; // "Vào ca" / "Ra ca"
  
  // === PHASE 2: Auto Shift Lookup & Late Calculation ===
  var serverShift = '';
  var serverLateMins = 0;
  var checklistPending = false;
  
  if (loaiChamCong === 'Vào ca' || loaiChamCong === 'IN') {
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
  
  // === COL F: KHOẢNG CÁCH (meters) ===
  var distMeters = 0;
  if (payload.distance !== undefined && payload.distance !== null) {
    distMeters = Math.round(Number(payload.distance));
  } else if (payload.lat && payload.lng) {
    var gpsConfig = getGpsConfig();
    var R = 6371000;
    var dLat = (gpsConfig.lat - payload.lat) * Math.PI / 180;
    var dLon = (gpsConfig.lng - payload.lng) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(payload.lat * Math.PI / 180) * Math.cos(gpsConfig.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distMeters = Math.round(R * c);
  }
  
  // === COL E: XÁC MINH ===
  var gpsConfig = getGpsConfig();
  var isValid = distMeters <= gpsConfig.radius;
  var xacMinh = isValid ? 'Hợp lệ' : 'Không hợp lệ';
  
  // === COL G: LINK HÌNH ẢNH ===
  var imageUrl = '';
  if (payload.image === 'PENDING') {
    imageUrl = 'Đang tải ảnh...';
  }
  
  // === COL H: DATA JSON ===
  var dataJson = JSON.stringify({
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
    var newRow = [hoVaTen, loaiChamCong, "'" + thoiGian, viTri, xacMinh, distMeters + 'm', imageUrl, dataJson];
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
  
    return jsonResponse(true, {
      message: 'Chấm công thành công',
      imageUrl: imageUrl,
      distMeters: distMeters,
      isValid: isValid,
      timeISO: time.toISOString(),
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
    imageUrl: imageUrl,
    distMeters: distMeters,
    isValid: isValid,
    timeISO: time.toISOString(),
    viTri: viTri,
    shift: serverShift || '',
    lateMins: serverLateMins,
    checklistPending: checklistPending
  });
}

function handleSendEmailNotification(payload) {
  try {
    // Reconstruct time object
    var timeObj = payload.timeISO ? new Date(payload.timeISO) : new Date();
    
    // CRITICAL FIX: isValid truyền qua JSON có thể bị coerce thành string
    // String "false" là truthy trong JS → phải convert rõ ràng về boolean
    var isValid = (payload.isValid === true || payload.isValid === 'true');
    
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
    
    if (imgUrl && imgUrl !== 'Lỗi ảnh' && imgUrl.indexOf('drive.google.com') >= 0) {
      sheet.getRange(row, 7).setFormulaLocal('=HYPERLINK("' + imgUrl + '"; "📷 Xem ảnh")').setFontSize(9);
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
    
    // --- CỘT G (Ảnh) - Hyperlink (Dùng API USER_ENTERED nên bắt buộc dùng dấu ",")
    var imgStr = rData[6] ? rData[6].toString().trim() : '';
    // Xóa bỏ hyperlink cũ sai lầm nếu có (bị mác #ERROR!)
    if (imgStr.indexOf('#ERROR!') >= 0) {
      nv[6] = ''; // Trả về text rỗng để sửa lại
      hasValuesUpdate = true;
    } else if (imgStr.indexOf('drive.google.com') >= 0 && imgStr.indexOf('HYPERLINK') === -1) {
      nv[6] = '=HYPERLINK("' + imgStr + '"; "📷 Xem ảnh")';
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
    + '<table border="0" cellpadding="0" cellspacing="0"><tr>'
    + '<td align="center" style="width: 52px; height: 52px; background-color: #1e293b; border: 2px solid rgba(251, 191, 36, 0.4); border-radius: 14px; color: #fbbf24; font-size: 22px; font-weight: 900; line-height: 52px; text-align: center;">KG</td>'
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
    + '<td style="padding: 4px 24px 24px; text-align: center;" class="content-padding">'
    + '<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">'
    + '<a href="' + dashUrl + '" target="_blank" style="display: block; width: 100%; max-width: 320px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 800; letter-spacing: 0.3px; padding: 14px 24px; border-radius: 12px; text-align: center; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);">'
    + '🚀 MỞ BẢNG CHẤM CÔNG WEBAPP &rarr;'
    + '</a>'
    + '</td></tr></table>'
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
  // Thử gửi bằng MailApp trước (nhanh nhất, không cần HTTP call)
  var localQuota = MailApp.getRemainingDailyQuota();
  if (localQuota >= 1) {
    MailApp.sendEmail(to, subject, body || '', { htmlBody: htmlBody });
    Logger.log('📧 [LOCAL] Gửi OK → ' + to + ' (quota còn: ' + (localQuota - 1) + ')');
    return 'local';
  }
  
  // Hết quota local → thử relay accounts
  var relayUrls = CONFIG.EMAIL_RELAY_URLS || [];
  if (relayUrls.length === 0) {
    throw new Error('Hết quota email local (' + localQuota + ') và chưa có relay account nào');
  }
  
  // Round-robin: thử từng relay
  for (var attempt = 0; attempt < relayUrls.length; attempt++) {
    var idx = (_relayIndex + attempt) % relayUrls.length;
    var relayUrl = relayUrls[idx];
    
    try {
      var relayPayload = JSON.stringify({
        action: 'SEND_EMAIL',
        secret: CONFIG.EMAIL_RELAY_SECRET,
        to: to,
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
        _relayIndex = (idx + 1) % relayUrls.length; // Next relay for next call
        Logger.log('📧 [RELAY#' + (idx + 1) + '] Gửi OK → ' + to);
        return 'relay#' + (idx + 1);
      } else {
        Logger.log('⚠️ [RELAY#' + (idx + 1) + '] Thất bại: ' + (result.message || 'Unknown'));
      }
    } catch (relayErr) {
      Logger.log('⚠️ [RELAY#' + (idx + 1) + '] Error: ' + relayErr.message);
    }
  }
  
  throw new Error('Tất cả kênh email đều đã hết quota (local + ' + relayUrls.length + ' relay)');
}

function sendCheckInEmail(payload, timeObj, loc, imgUrl, distMeters, isValid) {
  var typeStr = payload.type ? String(payload.type) : 'Vào ca';
  var fullnameStr = payload.fullname ? String(payload.fullname) : 'Nhân viên';

  var formattedTimeAdmin = Utilities.formatDate(timeObj, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  var formattedTimeUI = formattedTimeAdmin.replace(' ', '<br/>');
  
  // Đảm bảo isValid là boolean
  isValid = (isValid === true || isValid === 'true');
  
  Logger.log('sendCheckInEmail START: emp=' + (payload.email || 'NONE') + ', isValid=' + isValid);
  
  var adminBody, empBody;
  try {
    adminBody = buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, true);
    empBody = buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, false);
  } catch (buildErr) {
    Logger.log('LỖI buildEmailHtml: ' + buildErr.message);
    throw buildErr;
  }

  // === ƯU TIÊN 1: Gửi email xác nhận cho nhân viên TRƯỚC ===
  if (payload.email && String(payload.email).indexOf('@') > 0) {
    try {
      smartSendEmail(
        payload.email,
        '[KING\'S GRILL] Xác nhận ' + typeStr + ' - ' + formattedTimeAdmin,
        'Xác nhận chấm công: ' + typeStr + ' lúc ' + formattedTimeAdmin,
        empBody
      );
    } catch(empErr) {
      Logger.log('❌ Lỗi email nhân viên: ' + empErr.message);
      try { getSS().getSheetByName(CONFIG.SHEET_CONFIG).appendRow(['ERR_EMAIL_EMP', empErr.message, new Date()]); } catch(x){}
    }
  } else {
    Logger.log('⚠️ NV không có email: "' + (payload.email || '') + '"');
  }

  // === ƯU TIÊN 2: Gửi 1 email GỘP cho Admin ===
  var adminEmails = CONFIG.EMAILS.filter(function(e) { return !!e; });
  if (adminEmails.length > 0) {
    try {
      smartSendEmail(
        adminEmails.join(','),
        '[KING\'S GRILL] ' + fullnameStr + ' - ' + typeStr,
        '',
        adminBody
      );
    } catch (adminErr) {
      Logger.log('❌ Lỗi email admin: ' + adminErr.message);
      try { getSS().getSheetByName(CONFIG.SHEET_CONFIG).appendRow(['ERR_EMAIL_ADMIN', adminErr.message, new Date()]); } catch(x){}
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
  var empBody = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;600;700;800&display=swap" rel="stylesheet">'
    + '</head><body style="margin:0;padding:0;background:#f0f4f8;font-family:Libre Franklin,Arial,sans-serif;">'
    + '<div style="max-width:560px;margin:20px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">'
    + '<div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 50%,#7c3aed 100%);padding:32px 24px;text-align:center;">'
    + '<div style="width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:14px;margin:0 auto 12px;line-height:48px;font-size:20px;font-weight:900;color:#fbbf24;">KG</div>'
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
  
  return jsonResponse(true, isFinal ? 'Đã duyệt toàn bộ lịch thành công' : 'Đã lưu các điều chỉnh lịch');
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
  if (!payload || !payload.image || !payload.fullname || !payload.timeISO) {
    return jsonResponse(false, 'Thiếu dữ liệu upload ảnh ngầm');
  }
  
  try {
    // Decode base64
    var base64Data = payload.image;
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
    
    var safeName = payload.fullname.replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
    var filename = safeName + '_' + new Date().getTime() + ext;
    
    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, filename);
    
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
    
    // Tìm dòng tương ứng trên Sheet bằng fullname và timeISO
    var sheet = getSS().getSheetByName(CONFIG.SHEET_LOGS);
    var data = sheet.getDataRange().getValues(); // Cache data in memory
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      // Cột 0: Tên, Cột 6: Ảnh
      if (row[0].toString() === payload.fullname && row[6].toString().indexOf('Đang tải ảnh') !== -1) {
        // Cột 7: Data Json - Chứa timeISO để verify chính xác ca này
        if (row[7] && row[7].toString().indexOf(payload.timeISO) !== -1) {
          
          var rowIdx = i + 1;
          // Ghi đè Link vào Sheet
          sheet.getRange(rowIdx, 7).setValue(imageUrl);
          
          // Format Link cho đẹp
          var isValid = row[4].toString().indexOf('Hợp lệ') >= 0;
          var linkColor = isValid ? '#10b981' : '#ef4444';
          sheet.getRange(rowIdx, 7).setFormulaLocal('=HYPERLINK("' + imageUrl + '"; "📷 Xem ảnh")')
               .setFontColor(linkColor)
               .setTextDecoration('none');
          
          // Cập nhật lại JSON data
          try {
            var oldJson = JSON.parse(row[7].toString());
            oldJson.linkAnh = imageUrl;
            sheet.getRange(rowIdx, 8).setValue(JSON.stringify(oldJson));
          } catch(ej){}
          
          return jsonResponse(true, { url: imageUrl, rowMatched: rowIdx });
        }
      }
    }
    
    return jsonResponse(false, 'Không tìm thấy dòng tương ứng để cập nhật ảnh trên Sheet');
  } catch (e) {
    Logger.log('Lỗi upload ảnh ngầm: ' + e.message);
    return jsonResponse(false, 'Lỗi: ' + e.message);
  }
}

function handleUploadAvatar(payload) {
  if (!payload || !payload.image || !payload.username) return jsonResponse(false, 'Thiếu dữ liệu');
  try {
    var base64Data = payload.image;
    if (base64Data.indexOf('base64,') >= 0) base64Data = base64Data.split('base64,')[1];
    else if (base64Data.indexOf(',') >= 0) base64Data = base64Data.split(',')[1];
    
    var filename = 'avatar_' + payload.username.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.jpg';
    var mimeType = 'image/jpeg';
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
        var blob = Utilities.newBlob(decoded, mimeType, 'MissedCheckIn_' + id + '.jpg');
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
