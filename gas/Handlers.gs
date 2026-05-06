// ============================================
// HANDLERS.GS - CORE BACKEND LOGIC
// ============================================

// 1. User Authentication
function handleLogin(payload) {
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
      isTester: true
    });
  }
  
  // === SUPER ADMIN ACCOUNT ===
  if (payload.username.toUpperCase() === 'ADMIN' && payload.password === 'admin1') {
    return jsonResponse(true, {
      username: 'ADMIN',
      fullname: 'SUPER ADMIN',
      email: 'admin@kingsgrill.com',
      role: 'admin'
    });
  }
  
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) return jsonResponse(false, 'Không tìm thấy sheet người dùng');
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    // Col 0: Username, Col 1: Password, Col 2: FullName, Col 3: DOB, Col 4: Email, Col 5: Role
    if (row[0].toString().toLowerCase() === payload.username.toLowerCase() && row[1].toString() === payload.password) {
      return jsonResponse(true, {
        username: row[0],
        fullname: row[2],
        email: row[4] || '',
        role: row[5] ? row[5].toString() : (row[0].toString().toLowerCase() === 'admin' ? 'admin' : 'user'),
        position: row[6] ? row[6].toString() : 'Phục vụ'
      });
    }
  }
  return jsonResponse(false, 'Sai username hoặc password');
}

function handleRegister(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) return jsonResponse(false, 'Không tìm thấy sheet người dùng');
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().toLowerCase() === payload.username.toLowerCase()) {
      return jsonResponse(false, 'Username đã tồn tại');
    }
  }
  
  sheet.appendRow([payload.username, payload.password, payload.fullname, payload.dob || '', payload.email, 'user', 'Phục vụ']);
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
  for (var i = 1; i < data.length; i++) {
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
    MailApp.sendEmail({
      to: payload.email,
      subject: "Mã xác nhận (OTP) Khôi phục mật khẩu - King's Grill",
      htmlBody: "<h2>Xin chào,</h2><p>Mã xác nhận OTP để khôi phục mật khẩu của bạn là: <b><span style='font-size:24px;color:blue;'>" + otp + "</span></b></p><p>Mã này có hiệu lực trong vòng 5 phút.</p><br><p>Cảm ơn bạn đã sử dụng hệ thống King's Grill.</p>"
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
  for (var j = 1; j < usersData.length; j++) {
    if (usersData[j][4] && usersData[j][4].toString().toLowerCase() === payload.email.toLowerCase()) {
      usersSheet.getRange(j + 1, 2).setValue(payload.newPassword); // Col B is password (index 1 + 1)
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
  
  var ss = getSS();
  var usersSheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!usersSheet) return jsonResponse(false, 'Không tìm thấy DB Users');
  
  var usersData = usersSheet.getDataRange().getValues();
  var updated = false;
  var defaultPass = "Kg123456";
  
  for (var j = 1; j < usersData.length; j++) {
    if (usersData[j][0].toString().toLowerCase() === payload.targetUsername.toLowerCase()) {
      usersSheet.getRange(j + 1, 2).setValue(defaultPass); // Reset col 2
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
  
  for (var j = 1; j < usersData.length; j++) {
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
  
  for (var j = 1; j < usersData.length; j++) {
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

// 2B. Chấm Công Logic - 8 COLUMNS FORMAT
// Col A: HỌ VÀ TÊN | Col B: LOẠI CHẤM CÔNG | Col C: THỜI GIAN (DD/MM/YYYY HH:MM:SS)
// Col D: VỊ TRÍ | Col E: XÁC MINH | Col F: KHOẢNG CÁCH | Col G: LINK HÌNH ẢNH | Col H: DATA JSON

function handleCheckInOut(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
  if (!sheet) return jsonResponse(false, 'Không tìm thấy sheet chấm công');
  
  // payload: username, fullname, email, type, lat, lng, image, timestamp, location, distance
  var time = new Date();
  
  // === COL A: HỌ VÀ TÊN ===
  var hoVaTen = payload.fullname;
  
  // === COL B: LOẠI CHẤM CÔNG ===
  var loaiChamCong = payload.type; // "Vào ca" / "Ra ca"
  if (payload.lateMins && payload.lateMins > 0) {
    loaiChamCong += ' (Trễ ' + payload.lateMins + 'p)';
  }
  
  // === COL C: THỜI GIAN (DD/MM/YYYY HH:MM:SS) ===
  var thoiGian = payload.time || Utilities.formatDate(time, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
  
  // === COL D: VỊ TRÍ (Google Maps reverse geocode) ===
  var viTri = '';
  // Kiểm tra xem vị trí gửi lên có phải là toạ độ dạng "10.123, 106.123" hay không
  var isRawCoords = /^-?\d{1,2}\.\d+\s*,\s*-?\d{1,3}\.\d+$/.test(payload.location);
  if (payload.location && payload.location.length > 5 && !isRawCoords && payload.location.indexOf('Throttled') === -1) {
    // Client đã get được địa chỉ văn bản (Tên vị trí/Địa chỉ) -> Dùng luôn để khớp 100% với ảnh chụp
    viTri = payload.location;
  } else if (payload.lat && payload.lng) {
    // Server-side reverse geocoding via Google Maps
    viTri = reverseGeocodeGoogle(Number(payload.lat), Number(payload.lng));
  } else {
    viTri = 'Khong xac dinh';
  }
  
  // === COL F: KHOẢNG CÁCH (meters) ===
  var distMeters = 0;
  if (payload.distance !== undefined && payload.distance !== null) {
    distMeters = Math.round(Number(payload.distance));
  } else if (payload.lat && payload.lng) {
    // Calculate distance server-side using Haversine
    var gpsConfig = getGpsConfig();
    var R = 6371000; // Earth radius in meters
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
    imageUrl = 'Đang tải ảnh...'; // Hệ thống sẽ đẩy ảnh lên ngầm ở luồng UPLOAD_CHECKIN_IMAGE

  
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
    caLam: payload.shift || '',
    diTre: payload.lateMins || 0,
    timestamp: time.toISOString()
  });
  
  // === INSERT AT ROW 2 WITH LOCK ===
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    sheet.insertRowBefore(2);
    // Thêm nháy đơn "'" trước thời gian để ép text tương tự API V4 batch
    var newRow = [hoVaTen, loaiChamCong, "'" + thoiGian, viTri, xacMinh, distMeters + 'm', imageUrl, dataJson];
    sheet.getRange(2, 1, 1, 8).setValues([newRow]);
    
    // === AUTO-FORMAT THE NEW ROW ===
    formatCheckInRow(sheet, 2, isValid, imageUrl);
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
    viTri: viTri
  });
}

function handleSendEmailNotification(payload) {
  try {
    // Reconstruct time object
    var timeObj = payload.timeISO ? new Date(payload.timeISO) : new Date();
    sendCheckInEmail(payload, timeObj, payload.viTri, payload.imageUrl, payload.distMeters, payload.isValid);
    return jsonResponse(true, 'Đã gửi email');
  } catch (e) {
    Logger.log('Lỗi gửi email bất đồng bộ: ' + e.message);
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
  
  // 2. Chạy khối lệnh format định dạng (batch set properties)
  rangeObj.setBackgrounds(backgrounds);
  rangeObj.setHorizontalAlignments(aligns);
  rangeObj.setVerticalAlignments(vAligns);
  rangeObj.setFontWeights(fontWeights);
  rangeObj.setFontColors(fontColors);
  rangeObj.setFontFamilies(fonts);
  rangeObj.setFontSizes(fontSizes);
  rangeObj.setWraps(wraps);
  
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

// Hàm gửi email thông báo checkin/checkout ngay lập tức
function buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, isAdmin) {
  var typeStr = payload.type ? String(payload.type) : 'Vào ca';
  var fullnameStr = payload.fullname ? String(payload.fullname) : 'Nhân viên';

  var statusColor = isValid ? '#10b981' : '#ef4444';
  var statusText = isValid ? 'Hợp lệ' : 'Không hợp lệ';
  
  var headerTitle = isAdmin ? 'Thông Báo Quản Trị Hệ Thống' : 'Xác Nhận Chấm Công';
  var badgeText = isAdmin ? 'PHÁT SINH LƯỢT CHẤM CÔNG MỚI' : typeStr.toUpperCase() + ' THÀNH CÔNG';
  var badgeBg = isValid ? 'linear-gradient(90deg, #22c55e, #16a34a)' : 'linear-gradient(90deg, #ef4444, #dc2626)';
  var badgeIcon = isValid ? 'https://img.icons8.com/ios-filled/50/ffffff/checkmark--v1.png' : 'https://img.icons8.com/ios-filled/50/ffffff/multiply.png';

  var greeting = typeStr === 'Vào ca' ? 'Chúc bạn có ca làm việc hiệu quả!' : 'Cảm ơn bạn đã hoàn thành ca làm việc!';
  var subtitleHTML = isAdmin 
    ? 'Hệ thống ghi nhận thao tác từ <strong style="color:#2563eb;">' + fullnameStr + '</strong>'
    : 'Xin chào <strong style="color:#2563eb;">' + fullnameStr + '</strong>,<br/><span style="font-size:13px;color:#64748b;font-weight:normal;">' + greeting + '</span>';

  var body = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">'
    + '</head><body style="margin:0;padding:0;background:#f0f4f8;font-family:Inter,Arial,sans-serif;">'
    + '<div style="max-width:500px;margin:20px auto;background:linear-gradient(180deg, #f8fafc 0%, #eff6ff 100%);border-radius:24px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.06);padding:30px 20px;">'
    
    // Logo & Header
    + '<div style="text-align:center;margin-bottom:20px;">'
    + '<div style="width:56px;height:56px;background:linear-gradient(135deg, #1e3a8a, #2563eb);border-radius:14px;margin:0 auto;text-align:center;line-height:56px;color:#fbbf24;font-weight:900;font-size:24px;box-shadow:0 6px 16px rgba(37,99,235,0.25);">KG</div>'
    + '<h1 style="color:#1e293b;font-size:22px;font-weight:800;margin:15px 0 5px;letter-spacing:-0.5px;">KING\'S GRILL HR</h1>'
    + '<p style="color:#64748b;font-size:11px;margin:0;text-transform:uppercase;letter-spacing:1px;font-weight:600;">&bull; ' + headerTitle + ' &bull;</p>'
    + '</div>'

    // Badge
    + '<div style="background:' + badgeBg + ';padding:14px;border-radius:14px;text-align:center;color:#fff;font-weight:700;font-size:14px;box-shadow:0 8px 20px rgba(34,197,94,0.25);margin-bottom:20px;">'
    + '<img src="' + badgeIcon + '" width="18" style="vertical-align:middle;margin-right:8px;"/> ' + badgeText
    + '</div>'

    // Subtitle
    + '<p style="text-align:center;color:#334155;font-size:15px;margin:0 0 20px;font-weight:600;">' + subtitleHTML + '</p>'

    // Info Card
    + '<div style="background:#ffffff;border-radius:18px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,0.04);margin-bottom:24px;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="font-family:Inter,Arial,sans-serif;">'
    
    // Row 1: Hành động
    + '<tr><td width="44" style="padding:12px 0;"><div style="width:36px;height:36px;border-radius:18px;background:#eff6ff;text-align:center;line-height:40px;"><img src="https://img.icons8.com/ios-filled/50/2563eb/user.png" width="18"/></div></td>'
    + '<td style="padding:12px 0;color:#64748b;font-size:13px;font-weight:600;">Hành động</td>'
    + '<td align="right" style="padding:12px 0;color:#1e3a8a;font-weight:800;font-size:14px;">' + typeStr.toUpperCase() + '</td></tr>'
    + '<tr><td colspan="3" style="border-bottom:1px dashed #e2e8f0;height:1px;"></td></tr>'

    // Row 2: Thời gian
    + '<tr><td width="44" style="padding:12px 0;"><div style="width:36px;height:36px;border-radius:18px;background:#eff6ff;text-align:center;line-height:40px;"><img src="https://img.icons8.com/ios-filled/50/2563eb/clock--v1.png" width="18"/></div></td>'
    + '<td style="padding:12px 0;color:#64748b;font-size:13px;font-weight:600;">Thời gian</td>'
    + '<td align="right" style="padding:12px 0;color:#1e293b;font-weight:700;font-size:13px;line-height:1.4;">' + formattedTimeUI + '</td></tr>'
    + '<tr><td colspan="3" style="border-bottom:1px dashed #e2e8f0;height:1px;"></td></tr>'

    // Row 3: Vị trí
    + '<tr><td width="44" style="padding:12px 0;"><div style="width:36px;height:36px;border-radius:18px;background:#eff6ff;text-align:center;line-height:40px;"><img src="https://img.icons8.com/ios-filled/50/2563eb/marker.png" width="18"/></div></td>'
    + '<td style="padding:12px 0;color:#64748b;font-size:13px;font-weight:600;">Vị trí</td>'
    + '<td align="right" style="padding:12px 0 12px 15px;color:#475569;font-weight:600;font-size:12px;line-height:1.4;">' + loc + '</td></tr>'
    + '<tr><td colspan="3" style="border-bottom:1px dashed #e2e8f0;height:1px;"></td></tr>'

    // Row 4: Khoảng cách
    + '<tr><td width="44" style="padding:12px 0;"><div style="width:36px;height:36px;border-radius:18px;background:#eff6ff;text-align:center;line-height:40px;"><img src="https://img.icons8.com/ios-filled/50/2563eb/radar.png" width="18"/></div></td>'
    + '<td style="padding:12px 0;color:#64748b;font-size:13px;font-weight:600;">Khoảng cách</td>'
    + '<td align="right" style="padding:12px 0;color:#1e293b;font-weight:700;font-size:13px;">' + distMeters + '</td></tr>'
    + '<tr><td colspan="3" style="border-bottom:1px dashed #e2e8f0;height:1px;"></td></tr>'

    // Row 5: Trạng thái
    + '<tr><td width="44" style="padding:12px 0;"><div style="width:36px;height:36px;border-radius:18px;background:' + (isValid ? '#f0fdf4' : '#fef2f2') + ';text-align:center;line-height:40px;"><img src="' + (isValid ? 'https://img.icons8.com/ios-filled/50/10b981/shield.png' : 'https://img.icons8.com/ios-filled/50/ef4444/shield.png') + '" width="18"/></div></td>'
    + '<td style="padding:12px 0;color:#64748b;font-size:13px;font-weight:600;">Trạng thái</td>'
    + '<td align="right" style="padding:12px 0;color:' + statusColor + ';font-weight:800;font-size:14px;">' + statusText + '</td></tr>'

    + '</table></div>'

    // Action Button
    + '<a href="' + CONFIG.WEB_APP_URL + '" style="display:block;text-align:center;background:linear-gradient(90deg, #1e3a8a, #3b82f6);color:#ffffff;text-decoration:none;padding:16px;border-radius:14px;font-weight:700;font-size:15px;box-shadow:0 8px 20px rgba(37,99,235,0.25);margin-bottom:30px;">'
    + '<img src="https://img.icons8.com/ios-filled/50/ffffff/circled-menu.png" width="20" style="vertical-align:middle;margin-right:8px;margin-top:-2px;"/> Truy cập Dashboard</a>'

    // Footer
    + '<div style="text-align:center;">'
    + '<img src="https://img.icons8.com/ios-filled/50/cbd5e1/shield.png" width="16" style="margin-bottom:8px;"/>'
    + '<p style="color:#94a3b8;font-size:11px;margin:0 0 4px;font-weight:600;">Email tự động từ hệ thống máy chủ</p>'
    + '<p style="color:#1e293b;font-size:11px;font-weight:800;margin:0;letter-spacing:0.5px;">KING\'S GRILL &copy; ' + new Date().getFullYear() + '</p>'
    + '</div>'

    + '</div></body></html>';

  return body;
}

function sendCheckInEmail(payload, timeObj, loc, imgUrl, distMeters, isValid) {
  var typeStr = payload.type ? String(payload.type) : 'Vào ca';
  var fullnameStr = payload.fullname ? String(payload.fullname) : 'Nhân viên';

  var formattedTimeAdmin = Utilities.formatDate(timeObj, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  var formattedTimeUI = formattedTimeAdmin.replace(' ', '<br/>'); // Thay khoảng trắng bằng <br/> an toàn
  
  var adminBody = buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, true);
  var empBody = buildEmailHtml(payload, formattedTimeUI, loc, distMeters, isValid, false);

  // Gửi email cho admin
  CONFIG.EMAILS.forEach(function(email) {
    if(email) {
      try {
        GmailApp.sendEmail(email, '[KING\'S GRILL] ' + fullnameStr + ' - ' + typeStr, '', { htmlBody: adminBody });
      } catch (adminErr) {
        Logger.log('Lỗi gửi email admin (' + email + '): ' + adminErr.message);
      }
    }
  });

  // Gửi email xác nhận cho nhân viên
  if (payload.email && String(payload.email).indexOf('@') > 0) {
    try {
      GmailApp.sendEmail(
        payload.email,
        '[KING\'S GRILL] Xác nhận ' + typeStr + ' - ' + formattedTimeAdmin,
        'Xác nhận chấm công: ' + typeStr + ' lúc ' + formattedTimeAdmin,
        { htmlBody: empBody }
      );
      Logger.log('Đã gửi email xác nhận cho nhân viên: ' + payload.email);
    } catch(empErr) {
      Logger.log('Lỗi gửi email nhân viên: ' + empErr.message);
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
  var ss = getSS();
  var result = { logs: [], stats: { totalCheckIn: 0, validCount: 0 } };
  
  // === LOGS & STATS ===
  var sheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getDataRange().getValues();
    var logs = [];
    var userCheckins = 0;
    var validCount = 0;
    
    // Row 0 is header, data starts from row 1 (newest first since insertRowBefore(2))
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      var isCurrentUser = row[0].toString().toLowerCase() === payload.fullname.toLowerCase();
      var isAdmin = payload.role === 'admin' || payload.role === 'tester';
      
      if (isCurrentUser || isAdmin) {
        // Handle time: could be Date object (auto-detected by Sheets) or string
        var timeVal = row[2];
        if (timeVal instanceof Date) {
          timeVal = Utilities.formatDate(timeVal, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
        } else {
          timeVal = timeVal ? timeVal.toString() : '';
        }
        
        var statusVal = row[4] ? row[4].toString() : '';
        var isHopLe = statusVal.toUpperCase().indexOf('HỢP LỆ') >= 0 && statusVal.toUpperCase().indexOf('KHÔNG') < 0;
        
        logs.push({
          fullname: row[0].toString(),
          type: row[1] ? row[1].toString() : '',
          time: timeVal,
          location: row[3] ? row[3].toString() : '',
          status: statusVal,
          distance: row[5] ? row[5].toString() : '',
          image: row[6] ? row[6].toString() : ''
        });
        
        if (row[1] && row[1].toString().toLowerCase() === 'vào ca') {
          userCheckins++;
        }
        if (isHopLe) {
          validCount++;
        }
      }
    }
    
    result.logs = logs;
    result.stats = { totalCheckIn: userCheckins, validCount: validCount };
  }
  
  // === USERS (for admin) ===
  if (payload.role === 'admin' || payload.role === 'tester') {
    try {
      var usersSheet = ss.getSheetByName(CONFIG.SHEET_USERS);
      if (usersSheet) {
        var usersData = usersSheet.getDataRange().getValues();
        var users = [];
        for (var j = 1; j < usersData.length; j++) {
          users.push({
            username: usersData[j][0] ? usersData[j][0].toString() : '',
            fullname: usersData[j][2] ? usersData[j][2].toString() : '',
            email: usersData[j][4] ? usersData[j][4].toString() : '',
            role: usersData[j][5] ? usersData[j][5].toString() : 'user',
            position: usersData[j][6] ? usersData[j][6].toString() : 'Phục vụ'
          });
        }
        result.users = users;
      }
    } catch(e) { Logger.log('Error loading users: ' + e.message); }
  }
  
  // === API KEYS ===
  try {
    var keysSheet = ss.getSheetByName(CONFIG.SHEET_API_KEYS);
    if (keysSheet && keysSheet.getLastRow() > 1) {
      var keysData = keysSheet.getDataRange().getValues();
      var keys = [];
      for (var k = 1; k < keysData.length; k++) {
        if (keysData[k][0]) {
          keys.push({
            key: keysData[k][0].toString(),
            tag: keysData[k][1] ? keysData[k][1].toString() : 'Key ' + k,
            status: keysData[k][2] ? keysData[k][2].toString() : 'Active'
          });
        }
      }
      result.keys = keys;
    }
  } catch(e) { Logger.log('Error loading keys: ' + e.message); }
  
  // === CHAT LOGS ===
  try {
    var chatSheet = ss.getSheetByName(CONFIG.SHEET_CHAT_LOGS);
    if (chatSheet && chatSheet.getLastRow() > 1) {
      var chatData = chatSheet.getDataRange().getValues();
      var chatHistory = [];
      // Data starts at row 2, limit to last 50 messages to avoid overload
      var startIdx = Math.max(1, chatData.length - 50);
      for (var c = startIdx; c < chatData.length; c++) {
        if (chatData[c][1] && chatData[c][1].toString().toLowerCase() === payload.fullname.toLowerCase()) {
          chatHistory.push({
            role: chatData[c][2].toString(),
            content: chatData[c][3].toString()
          });
        }
      }
      result.chatHistory = chatHistory;
    }
  } catch(e) { Logger.log('Error loading chat logs: ' + e.message); }
  
  // === AI PROMPTS ===
  try {
    result.aiPrompts = getConfigFromSheet("AI_PROMPTS", []);
  } catch(e) { Logger.log('Error loading AI prompts: ' + e.message); }
  
  // === SCHEDULE STATUS (Monthly Sheet Architecture) ===
  if (payload.monthSheet && payload.weekLabel) {
    try {
      var schedSheet = ss.getSheetByName(payload.monthSheet);
      if (schedSheet) {
        // USE getDisplayValues() to NEVER receive Date objects for time cells
        var schedData = schedSheet.getDataRange().getDisplayValues();
        var isRegistered = false;
        var approvedShifts = null;
        var inTargetWeek = false;
        
        for (var s = 0; s < schedData.length; s++) {
          var cellVal = schedData[s][0] ? schedData[s][0].toString() : '';
          
          // Track week headers
          var cleanWeekLabel = payload.weekLabel.replace('📅 TUẦN ', '').replace('TUẦN ', '').trim();
          if (cellVal.indexOf('TUẦN ') >= 0) {
            inTargetWeek = cellVal.indexOf(cleanWeekLabel) >= 0;
            continue;
          }
          
          if (!inTargetWeek) continue;
          
          // Check for registration row
          if (cellVal.toLowerCase() === payload.fullname.toLowerCase()) {
            isRegistered = true;
          }
          
          // Check for approval row
          if (cellVal.indexOf('┗') >= 0 && cellVal.toLowerCase().indexOf(payload.fullname.toLowerCase()) >= 0) {
            approvedShifts = [];
            for (var d = 1; d <= 7; d++) {
              approvedShifts.push(schedData[s][d] ? schedData[s][d].toString().trim() : 'OFF');
            }
          }
        }
        
        result.isScheduleRegistered = isRegistered;
        if (approvedShifts) result.approvedShifts = approvedShifts;
      }
    } catch(e) { Logger.log('Error loading schedule: ' + e.message); }
  }
  // Legacy fallback
  else if (payload.targetSheet) {
    try {
      var legacySheet = ss.getSheetByName(payload.targetSheet);
      if (legacySheet) {
        // USE getDisplayValues() to natively skip Date formatting bugs
        var legacyData = legacySheet.getDataRange().getDisplayValues();
        var isReg = false;
        var appShifts = null;
        for (var sl = 1; sl < legacyData.length; sl++) {
          if (legacyData[sl][0] && legacyData[sl][0].toString().toLowerCase() === payload.fullname.toLowerCase()) {
            isReg = true;
            appShifts = [];
            for (var dl = 1; dl <= 7; dl++) {
              appShifts.push(legacyData[sl][dl] ? legacyData[sl][dl].toString().trim() : 'OFF');
            }
            break;
          }
        }
        result.isScheduleRegistered = isReg;
        if (appShifts) result.approvedShifts = appShifts;
      }
    } catch(e) { Logger.log('Error loading schedule (legacy): ' + e.message); }
  }
  
  result.gpsConfig = getGpsConfig();
  result.orgConfig = getOrgConfig();
  result.payrollConfig = getPayrollConfig();
  
  return jsonResponse(true, result);
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
      GmailApp.sendEmail(
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
          sheet.getRange(rowIdx, 7).setFormula('=HYPERLINK("' + imageUrl + '", "📷 Xem ảnh")')
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
