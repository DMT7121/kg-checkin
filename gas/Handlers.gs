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
  if (payload.image) {
    try {
      // Decode base64
      var base64Data = payload.image.split(',')[1];
      var blob = Utilities.newBlob(
        Utilities.base64Decode(base64Data),
        'image/webp',
        payload.fullname + '_' + time.getTime() + '.webp'
      );
      
      // Upload using DriveApp
      var folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
      var file = folder.createFile(blob);
      imageUrl = file.getUrl();
      
      // Tách riêng setSharing vào try-catch để tránh lỗi nếu Google Workspace chặn chia sẻ ra bên ngoài (Lỗi phổ biến nhất gây 'Lỗi ảnh')
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (eShare) {
        Logger.log('Cảnh báo phân quyền: ' + eShare.message);
        // Vẫn giữ được imageUrl thay vì gán thành 'Lỗi ảnh'
      }
    } catch (e) {
      Logger.log('Lỗi upload ảnh: ' + e.message);
      imageUrl = 'Lỗi ảnh';
    }
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
    timestamp: time.toISOString()
  });
  
  // === INSERT AT ROW 2 (always push new data to top) ===
  sheet.insertRowBefore(2);
  // Thêm nháy đơn "'" trước thời gian để ép text tương tự API V4 batch
  var newRow = [hoVaTen, loaiChamCong, "'" + thoiGian, viTri, xacMinh, distMeters + 'm', imageUrl, dataJson];
  sheet.getRange(2, 1, 1, 8).setValues([newRow]);
  
  // === AUTO-FORMAT THE NEW ROW ===
  formatCheckInRow(sheet, 2, isValid, imageUrl);
  
  // Trigger email thông báo chấm công
  try {
    sendCheckInEmail(payload, time, viTri, imageUrl, distMeters, isValid);
  } catch(e) {
    Logger.log('Lỗi gửi email CC: ' + e.message);
  }
  
  return jsonResponse(true, 'Chấm công thành công');
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
function sendCheckInEmail(payload, timeObj, loc, imgUrl, distMeters, isValid) {
  var formattedTime = Utilities.formatDate(timeObj, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  var statusColor = isValid ? '#10b981' : '#ef4444';
  var statusText = isValid ? 'Hợp lệ' : 'Không hợp lệ';
  
  // === GỬI EMAIL THÔNG BÁO CHO ADMIN === (Premium Template)
  var adminBadgeColor = isValid ? '#10b981' : '#ef4444';
  var adminIcon = isValid ? '&#10004;' : '&#10008;';
  
  var body = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;600;700;800&display=swap" rel="stylesheet">'
    + '</head><body style="margin:0;padding:0;background:#f0f4f8;font-family:Libre Franklin,Arial,sans-serif;">'
    + '<div style="max-width:560px;margin:20px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">'

    // Header gradient (Admin Dark Theme)
    + '<div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 50%,#312e81 100%);padding:32px 24px;text-align:center;">'
    + '<div style="width:48px;height:48px;background:rgba(255,255,255,0.1);border-radius:14px;margin:0 auto 12px;line-height:48px;font-size:20px;font-weight:900;color:#fbbf24;">KG</div>'
    + '<h1 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 4px;">KING\'S GRILL HR</h1>'
    + '<p style="color:rgba(255,255,255,0.7);font-size:12px;margin:0;">Thông Báo Quản Trị Hệ Thống</p>'
    + '</div>'

    // Status badge
    + '<div style="padding:0 24px;">'
    + '<div style="background:' + adminBadgeColor + ';color:#fff;padding:12px 20px;border-radius:12px;margin-top:-16px;text-align:center;font-weight:700;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">'
    + adminIcon + ' PHÁT SINH LƯỢT CHẤM CÔNG MỚI'
    + '</div></div>'

    // Notice text
    + '<div style="padding:20px 24px 0;text-align:center;">'
    + '<p style="font-size:15px;color:#1e293b;margin:0;">Hệ thống ghi nhận thao tác từ <strong>' + payload.fullname + '</strong></p>'
    + '</div>'

    // Detail table
    + '<div style="padding:16px 24px;">'
    + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">'
    + '<table style="width:100%;border-collapse:collapse;">'
    + '<tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;width:120px;"><strong>Hành động</strong></td>'
    + '<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#2563eb;text-align:right;font-weight:700;">' + payload.type.toUpperCase() + '</td></tr>'
    + '<tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;"><strong>Thời gian</strong></td>'
    + '<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;font-weight:600;">' + formattedTime + '</td></tr>'
    + '<tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;"><strong>Vị trí</strong></td>'
    + '<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;">' + loc + '</td></tr>'
    + '<tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;"><strong>Khoảng cách</strong></td>'
    + '<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;">' + distMeters + 'm</td></tr>'
    + '<tr><td style="padding:12px 16px;font-size:13px;color:#64748b;"><strong>Trạng thái</strong></td>'
    + '<td style="padding:12px 16px;font-size:13px;text-align:right;font-weight:700;color:' + statusColor + ';">' + statusText + '</td></tr>'
    + '</table></div></div>';

  if (imgUrl && imgUrl !== 'Lỗi ảnh') {
    body += '<div style="padding:0 24px 16px;text-align:center;">'
         + '<a href="' + imgUrl + '" style="display:inline-block;padding:10px 24px;background:#f0f4ff;border:1px solid #c7d2fe;border-radius:10px;color:#4f46e5;text-decoration:none;font-weight:600;font-size:13px;">'
         + '<span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;background:#6366f1;color:#fff;border-radius:6px;font-size:10px;font-weight:700;vertical-align:middle;margin-right:6px;">A</span>'
         + 'Xem ảnh xác thực</a></div>';
  }
  
  body += '<div style="padding:0 24px 20px;text-align:center;">'
       + '<a href="' + CONFIG.WEB_APP_URL + '" style="background:#2563eb;color:#ffffff;padding:12px 32px;text-decoration:none;border-radius:10px;font-weight:bold;display:inline-block;font-size:13px;box-shadow:0 4px 12px rgba(37,99,235,0.2);">Truy cập Dashboard</a>'
       + '</div>'
       + '<div style="background:#f8fafc;padding:20px 24px;text-align:center;border-top:1px solid #e2e8f0;">'
       + '<p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Email tự động từ hệ thống máy chủ</p>'
       + '<p style="margin:0;font-size:12px;font-weight:800;color:#1e293b;letter-spacing:1px;">KING\'S GRILL &copy; ' + new Date().getFullYear() + '</p>'
       + '</div></div></body></html>';

  // Gửi cho admin hoặc email cấu hình
  CONFIG.EMAILS.forEach(function(email) {
    if(email) {
      GmailApp.sendEmail(email, '[KING\'S GRILL] ' + payload.fullname + ' - ' + payload.type, '', { htmlBody: body });
    }
  });

  // === GỬI EMAIL XÁC NHẬN CHO NHÂN VIÊN ===
  if (payload.email && payload.email.indexOf('@') > 0) {
    try {
      var typeColor = payload.type === 'Vào ca' ? '#10b981' : '#ef4444';
      var typeIcon = payload.type === 'Vào ca' ? '&#9654;' : '&#9632;';
      var greeting = payload.type === 'Vào ca' ? 'Chúc bạn có ca làm việc hiệu quả!' : 'Cảm ơn bạn đã hoàn thành ca làm việc!';

      var empBody = '<!DOCTYPE html><html><head><meta charset="utf-8">'
        + '<link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;600;700;800&display=swap" rel="stylesheet">'
        + '</head><body style="margin:0;padding:0;background:#f0f4f8;font-family:Libre Franklin,Arial,sans-serif;">'
        + '<div style="max-width:560px;margin:20px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">'

        // Header gradient
        + '<div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 50%,#7c3aed 100%);padding:32px 24px;text-align:center;">'
        + '<div style="width:48px;height:48px;background:rgba(255,255,255,0.2);border-radius:14px;margin:0 auto 12px;line-height:48px;font-size:20px;font-weight:900;color:#fbbf24;">KG</div>'
        + '<h1 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 4px;">KING\'S GRILL HR</h1>'
        + '<p style="color:rgba(255,255,255,0.8);font-size:12px;margin:0;">Xác Nhận Chấm Công</p>'
        + '</div>'

        // Status badge
        + '<div style="padding:0 24px;">'
        + '<div style="background:' + typeColor + ';color:#fff;padding:12px 20px;border-radius:12px;margin-top:-16px;text-align:center;font-weight:700;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">'
        + typeIcon + ' ' + payload.type.toUpperCase() + ' THÀNH CÔNG'
        + '</div></div>'

        // Greeting
        + '<div style="padding:20px 24px 0;text-align:center;">'
        + '<p style="font-size:15px;color:#1e293b;margin:0;">Xin chào <strong>' + payload.fullname + '</strong>,</p>'
        + '<p style="font-size:13px;color:#64748b;margin:6px 0 0;">' + greeting + '</p>'
        + '</div>'

        // Detail table
        + '<div style="padding:16px 24px;">'
        + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">'
        + '<table style="width:100%;border-collapse:collapse;">'
        + '<tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;width:120px;"><strong>Thời gian</strong></td>'
        + '<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;font-weight:600;">' + formattedTime + '</td></tr>'
        + '<tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;"><strong>Vị trí</strong></td>'
        + '<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;">' + loc + '</td></tr>'
        + '<tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;"><strong>Khoảng cách</strong></td>'
        + '<td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;">' + distMeters + 'm</td></tr>'
        + '<tr><td style="padding:12px 16px;font-size:13px;color:#64748b;"><strong>Trạng thái</strong></td>'
        + '<td style="padding:12px 16px;font-size:13px;text-align:right;font-weight:700;color:' + statusColor + ';">' + statusText + '</td></tr>'
        + '</table></div></div>';

      // Photo link
      if (imgUrl && imgUrl !== 'Lỗi ảnh') {
        empBody += '<div style="padding:0 24px 16px;text-align:center;">'
          + '<a href="' + imgUrl + '" style="display:inline-block;padding:10px 24px;background:#f0f4ff;border:1px solid #c7d2fe;border-radius:10px;color:#4f46e5;text-decoration:none;font-weight:600;font-size:13px;">'
          + '<span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;background:#6366f1;color:#fff;border-radius:6px;font-size:10px;font-weight:700;vertical-align:middle;margin-right:6px;">A</span>'
          + 'Xem ảnh xác thực</a></div>';
      }

      // Google Maps link
      if (payload.lat && payload.lng) {
        empBody += '<div style="padding:0 24px 16px;text-align:center;">'
          + '<a href="https://www.google.com/maps?q=' + payload.lat + ',' + payload.lng + '" style="display:inline-block;padding:8px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;color:#15803d;text-decoration:none;font-weight:600;font-size:12px;">'
          + '<span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;background:#22c55e;color:#fff;border-radius:6px;font-size:10px;font-weight:700;vertical-align:middle;margin-right:6px;">M</span>'
          + 'Xem vị trí trên Google Maps</a></div>';
      }

      // Footer
      empBody += '<div style="background:#f8fafc;padding:20px 24px;text-align:center;border-top:1px solid #e2e8f0;">'
        + '<p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">Email tự động - Vui lòng không trả lời</p>'
        + '<p style="margin:0;font-size:12px;font-weight:800;color:#1e293b;letter-spacing:1px;">KING\'S GRILL &copy; ' + new Date().getFullYear() + '</p>'
        + '</div></div></body></html>';

      GmailApp.sendEmail(
        payload.email,
        '[KING\'S GRILL] Xác nhận ' + payload.type + ' - ' + formattedTime,
        'Xác nhận chấm công: ' + payload.type + ' lúc ' + formattedTime,
        { htmlBody: empBody }
      );
      Logger.log('Đã gửi email xác nhận cho nhân viên: ' + payload.email);
    } catch(empErr) {
      Logger.log('Loi gui email nhan vien: ' + empErr.message);
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
        if (keysData[k][0]) keys.push(keysData[k][0].toString());
      }
      result.keys = keys;
    }
  } catch(e) { Logger.log('Error loading keys: ' + e.message); }
  
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
          if (cellVal.indexOf('TUẦN ') >= 0) {
            inTargetWeek = cellVal.indexOf(payload.weekLabel) >= 0;
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
    sheet.appendRow(['Key', 'Status']);
  }
  
  // Clear old keys
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).clearContent();
  }
  
  if (payload.keys && payload.keys.length > 0) {
    for (var i = 0; i < payload.keys.length; i++) {
      sheet.appendRow([payload.keys[i].key, payload.keys[i].status]);
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
    keys.push({ key: data[i][0], status: data[i][1] });
  }
  return jsonResponse(true, keys);
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
  var headerTag = '📅 TUẦN ' + weekLabel;
  
  // Search for existing header
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().indexOf('TUẦN ' + weekLabel) >= 0) {
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

function handleGetAllSchedules(payload) {
  var monthSheet = payload.monthSheet || payload.targetSheet;
  var weekLabel = payload.weekLabel;
  
  if (!monthSheet) return jsonResponse(false, 'Thiếu thông tin sheet');
  
  var ss = getSS();
  var sheet = ss.getSheetByName(monthSheet);
  if (!sheet) return jsonResponse(true, []);
  
  // Use getDisplayValues() for shift columns to avoid Date/timezone issues
  // getValues() returns Date objects for HH:mm cells which can lose data due to timezone
  var data = sheet.getDataRange().getValues();           // For names, reasons, status
  var displayData = sheet.getDataRange().getDisplayValues(); // For shift values (text as shown)
  
  var headerRow = -1;
  for (var i = 0; i < data.length; i++) {
    var cellStr = data[i][0] ? data[i][0].toString() : '';
    if (cellStr.indexOf('TUẦN ' + weekLabel) >= 0) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return jsonResponse(true, []);
  
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

  Logger.log('[GET_ALL_SCHEDULES] Sheet: ' + monthSheet + ', Week: ' + weekLabel + ', HeaderRow(0idx): ' + headerRow);

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
    
    Logger.log('[ROW ' + j + '] Name: "' + name + '" | isAdj: ' + isAdjustment + ' | displayShifts: ' + JSON.stringify(rowShifts) + ' | rawCol1: ' + data[j][1] + ' (type: ' + typeof data[j][1] + ')');

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
  
  Logger.log('[GET_ALL_SCHEDULES] Returning ' + schedules.length + ' employees. Sample: ' + (schedules.length > 0 ? JSON.stringify(schedules[0]) : 'none'));
  
  return jsonResponse(true, schedules);
}

function handleGetMonthSchedules(payload) {
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
