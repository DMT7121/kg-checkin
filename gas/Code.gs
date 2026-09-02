/**
 * PHIÊN BẢN: 3.0 (MERGED & FIXED)
 * - Gộp 2 script thành 1 project duy nhất.
 * - File này chứa: Cấu hình, Menu, Trigger, Storage, Giao diện UI.
 * - File Engine.gs chứa: Logic xử lý chính & Utilities.
 *
 * BUG FIXES:
 * - Fix setBackgrounds/setFontWeights không chấp nhận null → dùng giá trị mặc định.
 * - Fix ss.moveSheet() không tồn tại → dùng Sheet API đúng.
 * - Fix Array(rows).fill(Array(cols).fill(...)) tạo shared reference → dùng .map().
 * - Fix lỗi tiềm ẩn khi vùng style lớn hơn vùng dữ liệu.
 */

// =====================================================================================
// 1. CAU HINH & HANG SO
// =====================================================================================

var CONFIG = {
  APP_NAME: "King's Grill Timekeeper",
  WEB_APP_URL: "https://kg-checkin.pages.dev/",
  SPREADSHEET_ID: "1UtDinbNZdOF8LRwxX1SlTKxUBFvr0UG6_iu7NyXDteY",
  FOLDER_ID: "1i1ZQRtprRKVIhO8aF660iR6qd2tMPDTY",
  SHEET_USERS: "DATA",
  SHEET_LOGS: "\u2714\uFE0FCH\u1EA4M C\u00D4NG",
  SHEET_API_KEYS: "\uD83D\uDD12API_KEYS",
  SHEET_CHAT_LOGS: "\uD83D\uDCACCHAT_LOGS",
  SHEET_CONFIG: "\u2699\uFE0F C\u1EA4U H\u00CCNH",
  SHEET_CHECKLIST_CONFIG: "CHECKLIST_CONFIG",
  LOCATION: {
    LAT: 10.9760826,
    LNG: 106.6646541,
    MAX_DISTANCE_METERS: 25
  },
  EMAILS: ["dmt.7121@gmail.com", "dmt.kgwork@gmail.com", "leminhsang993@gmail.com", "nguyentien1744293@gmail.com"],
  TIMEZONE: "Asia/Ho_Chi_Minh",
  MAX_COLS: 11,
  SPECIAL_DAYS_KEY: "SPECIAL_DAYS_TAGS",
  // Email Relay: Thêm URL relay từ tài khoản phụ để tăng quota
  // Mỗi URL = 1 tài khoản Google = +100 emails/ngày
  EMAIL_RELAY_URLS: [
    "https://script.google.com/macros/s/AKfycbyvklGluH_7uQ2WN43CiY2k1WOIWtebLC9Q8E3rFNl5tb9xInDQpBcYglTb-X7XlNAxuw/exec"
  ],
  EMAIL_RELAY_SECRET: "kg-relay-2026"
};

// Backward-compatible aliases (cac ham cu van dung duoc)
var SPREADSHEET_ID = CONFIG.SPREADSHEET_ID;
var MAX_COLS = CONFIG.MAX_COLS;
var SPECIAL_DAYS_KEY = CONFIG.SPECIAL_DAYS_KEY;
var REPORT_EMAILS = CONFIG.EMAILS;
var AUTO_PROCESS_SHEET = CONFIG.SHEET_LOGS;

// =====================================================================================
// 1B. WEB APP HANDLERS (doGet / doPost)
// =====================================================================================

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ok: true, message: 'System Online'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    switch (payload.action) {
      case 'LOGIN': return handleLogin(payload);
      case 'REGISTER': return handleRegister(payload);
      case 'CHECK_IN_OUT': return handleCheckInOut(payload);
      case 'SEND_EMAIL_NOTIFICATION': return handleSendEmailNotification(payload);
      case 'UPLOAD_CHECKIN_IMAGE': return handleUploadCheckinImage(payload);
      case 'GET_DATA': return handleGetData(payload);
      case 'SYNC_KEYS': return handleSyncKeys(payload);
      case 'UPDATE_AI_PROMPTS': return handleUpdateAiPrompts(payload);
      case 'GET_KEYS': return handleGetKeys(payload);
      case 'SAVE_CHAT_LOG': return handleSaveChatLog(payload);
      case 'GEOCODE': return handleGeocode(payload);
      case 'UPDATE_GPS_CONFIG': return handleUpdateGpsConfig(payload);
      case 'UPDATE_ORG_CONFIG': return handleUpdateOrgConfig(payload);
      case 'UPDATE_PAYROLL_CONFIG': return handleUpdatePayrollConfig(payload);
      case 'REGISTER_SHIFT': return handleRegisterShift(payload);
      case 'GET_ALL_SCHEDULES': return handleGetAllSchedules(payload);
      case 'GET_MONTH_SCHEDULES': return handleGetMonthSchedules(payload);
      case 'APPROVE_SCHEDULES': return handleApproveSchedules(payload);
      case 'UPDATE_SINGLE_SHIFT': return handleUpdateSingleShift(payload);
      case 'TEST_EMAIL': return handleTestEmail(payload);
      case 'SET_MASTER_PIN': return handleSetMasterPin(payload);
      case 'GET_SCHEDULE_HISTORY': return handleGetScheduleHistory(payload);
      case 'GET_POSTS': return handleGetPosts();
      case 'ADD_POST': return handleAddPost(payload);
      case 'INTERACT_POST': return handleInteractPost(payload);
      case 'GET_SOLDOUT':
        return handleGetSoldOut(payload);
      case 'ADD_SOLDOUT':
        return handleAddSoldOut(payload);
      case 'REMOVE_SOLDOUT':
        return handleRemoveSoldOut(payload);

      // --- CHECKLIST ---
      case 'GET_CHECKLISTS':
        return handleGetChecklists(payload);
      case 'SUBMIT_CHECKLIST':
        return handleSubmitChecklist(payload);
      case 'GET_OPS_CHECKLIST_INIT':
        return handleGetOpsChecklistInit(payload);
      case 'SAVE_OPS_CHECKLIST_STATE':
        return handleSaveOpsChecklistState(payload);
      case 'SAVE_OPS_CHECKLIST_CONFIG':
        return handleSaveOpsChecklistConfig(payload);

      // --- HANDOVER & INCIDENT ---
      case 'SUBMIT_HANDOVER':
        return handleSubmitHandover(payload);
      case 'SUBMIT_INCIDENT':
        return handleSubmitIncident(payload);

      // --- FEEDBACK & SURVEY ---
      case 'GET_FEEDBACKS':
        return handleGetFeedbacks(payload);
      case 'SUBMIT_FEEDBACK':
        return handleSubmitFeedback(payload);
      case 'REPLY_FEEDBACK':
        return handleReplyFeedback(payload);
      case 'SUBMIT_SURVEY':
        return handleSubmitSurvey(payload);

      // --- AUTH: QUÊN MẬT KHẨU & ĐỔI MẬT KHẨU ---
      case 'REQUEST_OTP':
        return handleRequestOTP(payload);
      case 'RESET_PASSWORD':
        return handleResetPassword(payload);
      case 'FORCE_RESET_PASSWORD':
        return handleForceResetPassword(payload);
      case 'UPDATE_USER_ROLE':
        return handleUpdateUserRole(payload);
      case 'UPDATE_USER_POSITION':
        return handleUpdateUserPosition(payload);
      case 'UPDATE_EMPLOYMENT_STATUS':
        return handleUpdateEmploymentStatus(payload);
      case 'GET_EMPLOYMENT_PROFILE':
        return handleGetEmploymentProfile(payload);

      // --- MISSED CHECK-INS (BÁO BỔ SUNG CÔNG) ---
      case 'SUBMIT_MISSED_CHECKIN':
        return handleSubmitMissedCheckin(payload);
      case 'GET_MISSED_CHECKINS':
        return handleGetMissedCheckins(payload);
      case 'APPROVE_MISSED_CHECKIN':
        return handleApproveMissedCheckin(payload);
      case 'REJECT_MISSED_CHECKIN':
        return handleRejectMissedCheckin(payload);

      // --- SWAP SHIFTS (CHỢ ĐỔI CA) ---
      case 'GET_SWAP_REQUESTS':
        return handleGetSwapRequests(payload);
      case 'SUBMIT_SWAP':
        return handleSubmitSwap(payload);
      case 'ACCEPT_SWAP':
        return handleAcceptSwap(payload);
      case 'DELETE_SWAP':
        return handleDeleteSwap(payload);
      case 'APPROVE_SWAP':
        return handleApproveSwap(payload);

      // --- CÔNG LƯƠNG (PAYROLL) ---
      case 'GET_ADVANCES':
        return handleGetAdvances(payload);
      case 'SUBMIT_ADVANCE':
        return handleSubmitAdvance(payload);
      case 'APPROVE_ADVANCE':
        return handleApproveAdvance(payload);
      case 'GET_BONUS_PENALTY':
        return handleGetBonusPenalty(payload);
      case 'ADD_BONUS_PENALTY':
        return handleAddBonusPenalty(payload);
      case 'DELETE_BONUS_PENALTY':
        return handleDeleteBonusPenalty(payload);
      case 'GET_SALARY_CONFIG':
        return handleGetSalaryConfig(payload);
      case 'UPDATE_SALARY_CONFIG':
        return handleUpdateSalaryConfig(payload);
      case 'GET_MONTHLY_SALARY_CONFIG':
        return handleGetMonthlySalaryConfig(payload);
      case 'UPDATE_MONTHLY_SALARY_CONFIG':
        return handleUpdateMonthlySalaryConfig(payload);
      case 'COPY_MONTHLY_SALARY_CONFIG':
        return handleCopyMonthlySalaryConfig(payload);
      case 'GET_SALARY_ADJUSTMENTS':
        return handleGetSalaryAdjustments(payload);
      case 'SUBMIT_SALARY_ADJUSTMENT':
        return handleSubmitSalaryAdjustment(payload);
      case 'REVIEW_SALARY_ADJUSTMENT':
        return handleReviewSalaryAdjustment(payload);
      case 'GET_PAYROLL':
        return handleGetPayroll(payload);
      case 'GET_OPERATIONS_CONFIG':
        return handleGetOperationsConfig(payload);
      case 'UPDATE_OPERATIONS_CONFIG':
        return handleUpdateOperationsConfig(payload);
      case 'TOGGLE_OPERATION_TASK':
        return handleToggleOperationTask(payload);
      case 'GET_TIMESHEET':
        return handleGetTimesheet(payload);
      case 'UPLOAD_IMAGE':
        return handleUploadImage(payload);
      case 'UPLOAD_AVATAR':
        return handleUploadAvatar(payload);

      // --- KING COINS (GAMIFICATION) ---
      case 'GET_LEADERBOARD':
        return handleGetLeaderboard();
      case 'GET_USER_COINS':
        return handleGetUserCoins(payload);

      // --- TRAINING ---
      case 'GET_TRAINING_CONTENT':
        return handleGetTrainingContent();
      case 'SUBMIT_TRAINING_QUIZ':
        return handleSubmitTrainingQuiz(payload);
      case 'GET_TRAINING_PROGRESS':
        return handleGetTrainingProgress(payload);

      // --- NOTIFICATIONS ---
      case 'GET_NOTIFICATIONS':
        return handleGetNotifications(payload);
      case 'MARK_NOTIFICATION_READ':
        return handleMarkNotificationRead(payload);

      // --- ANALYTICS ---
      case 'GET_ANALYTICS':
        return handleGetAnalytics(payload);

      default:
        return jsonResponse(false, 'Unknown action');
    }
  } catch (error) {
    return jsonResponse(false, error.toString());
  }
}

// =====================================================================================
// 1C. SURVEY HANDLER
// =====================================================================================
function handleSubmitSurvey(payload) {
  try {
    var ss = getSS();
    var sheet = ss.getSheetByName("SURVEYS");
    if (!sheet) {
      sheet = ss.insertSheet("SURVEYS");
      sheet.appendRow(["Timestamp", "Username", "Fullname", "Emotion", "Note"]);
      sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#d9ead3");
    }
    
    var timeStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss");
    sheet.appendRow([
      timeStr,
      payload.username || "Unknown",
      payload.fullname || "Unknown",
      payload.emotion || 0,
      payload.note || ""
    ]);
    
    return jsonResponse(true, "Ghi nhận thành công");
  } catch (e) {
    return jsonResponse(false, e.toString());
  }
}

function jsonResponse(ok, msgOrData, extra) {
  var obj = { ok: ok };
  if (typeof msgOrData === 'string') obj.message = msgOrData;
  else if (msgOrData) obj.data = msgOrData;
  if (extra) {
    for (var k in extra) obj[k] = extra[k];
  }
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================================
// 2. HELPER: LẤY SPREADSHEET AN TOÀN
// =====================================================================================

/**
 * Lấy Spreadsheet an toàn - ưu tiên getActive(), fallback sang openById()
 */
function getSS() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;
  } catch (e) {}
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Lấy UI an toàn - trả về null nếu không có context
 */
function getUI() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    return null;
  }
}

/**
 * Tự động làm sạch cache khi Admin chỉnh sửa trực tiếp trên Google Sheets
 */
function onEdit(e) {
  try {
    var sheetName = e.range.getSheet().getName();
    if (sheetName === "JSON_CACHE") return;

    if (sheetName === CONFIG.SHEET_USERS) {
      JsonCacheService.invalidateAllCache();
    } else if (sheetName === CONFIG.SHEET_LOGS) {
      JsonCacheService.invalidateAdminCache();
      JsonCacheService.invalidateUserCache();
    } else if (sheetName === CONFIG.SHEET_CONFIG || sheetName === "AI_PROMPTS" || sheetName === "Posts") {
      JsonCacheService.invalidateGlobalCache();
    } else if (sheetName.indexOf("Tháng") === 0) {
      JsonCacheService.invalidateUserCache();
      JsonCacheService.invalidateAdminCache();
    }
  } catch(err) {
    Logger.log("onEdit trigger error: " + err.toString());
  }
}

/**
 * Tạo menu khi mở Google Sheets
 * Chỉ hoạt động khi mở spreadsheet (container-bound context)
 */
function onOpen() {
  var ui = getUI();
  if (ui) {
    ui.createMenu('Tiện Ích Chấm Công ⭐️')
      .addItem('⚡️ Bắt Đầu Tổng Hợp (Nhanh)', 'showSheetSelectionDialog')
      .addItem('✨ Làm đẹp Format Sheet Chấm Công', 'formatEntireCheckInSheet')
      .addItem('⚙️ Thiết Lập Tự Động Hóa', 'setupAutomation')
      .addItem('🔄 Cấu hình tiêu đề DATA 2 dòng', 'migrateDataHeaders')
      .addToUi();
  }
  // Nếu không có UI context (chạy từ editor/trigger), bỏ qua im lặng
}

/**
 * Hàm tạo menu thủ công nếu onOpen lỗi
 */
function createMenu() {
  var ui = getUI();
  if (!ui) {
    Logger.log('⚠️ createMenu: Hàm này chỉ hoạt động khi mở từ Google Sheets. Hãy mở spreadsheet và refresh (F5) để menu tự xuất hiện.');
    return;
  }
  ui.createMenu('Tiện Ích Chấm Công ⭐️')
    .addItem('⚡️ Bắt Đầu Tổng Hợp (Nhanh)', 'showSheetSelectionDialog')
    .addItem('✨ Làm đẹp Format Sheet Chấm Công', 'formatEntireCheckInSheet')
    .addItem('⚙️ Thiết Lập Tự Động Hóa', 'setupAutomation')
    .addItem('🔄 Cấu hình tiêu đề DATA 2 dòng', 'migrateDataHeaders')
    .addToUi();
  getSS().toast('✅ Menu đã được tạo thành công!', 'Thông Báo', 3);
}

/**
 * Thiết lập tự động hóa chạy hàng ngày
 */
function getAutomationSettings() {
  try {
    var stored = PropertiesService.getDocumentProperties().getProperty("AUTOMATION_SETTINGS");
    return stored ? JSON.parse(stored) : { hour: 1, emails: CONFIG.EMAILS.join(', '), lastRunStatus: "Chưa chạy lần nào" };
  } catch (e) {
    return { hour: 1, emails: CONFIG.EMAILS.join(', '), lastRunStatus: "Chưa chạy lần nào" };
  }
}

function saveAutomationSettings(settings) {
  try {
    PropertiesService.getDocumentProperties().setProperty("AUTOMATION_SETTINGS", JSON.stringify(settings));
    
    // Cấu hình lại Trigger chạy tự động
    var triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'autoProcessDaily') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    var hour = Number(settings.hour);
    if (isNaN(hour)) hour = 1;
    ScriptApp.newTrigger('autoProcessDaily')
      .timeBased()
      .everyDays(1)
      .atHour(hour)
      .create();
      
    return true;
  } catch (e) {
    throw new Error("Lỗi lưu tự động hóa: " + e.message);
  }
}

function logAutomationStatus(statusText) {
  try {
    var settings = getAutomationSettings();
    settings.lastRunStatus = statusText;
    PropertiesService.getDocumentProperties().setProperty("AUTOMATION_SETTINGS", JSON.stringify(settings));
  } catch (e) {
    Logger.log("Lỗi logAutomationStatus: " + e.toString());
  }
}

function setupAutomation() {
  try {
    var ui = getUI();
    if (!ui) {
      Logger.log('setupAutomation: Hàm này chỉ hoạt động khi mở từ Google Sheets.');
      return;
    }
    
    var settings = getAutomationSettings();
    
    // Tạo option HTML cho Dropdown giờ chạy
    var hourOptionsHtml = '';
    for (var h = 0; h < 24; h++) {
      var isSelected = (settings.hour === h) ? ' selected' : '';
      var displayHour = String(h).padStart(2, '0') + ':00';
      hourOptionsHtml += '<option value="' + h + '"' + isSelected + '>' + displayHour + '</option>';
    }
    
    var htmlContent = '<!DOCTYPE html>'
      + '<html lang="vi">'
      + '<head>'
      + '<base target="_top">'
      + '<meta charset="UTF-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
      + '<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">'
      + '<style>'
      + "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');"
      
      // CSS Variables
      + ':root {'
      + '  --bg-deep: #06080f;'
      + '  --bg-surface: rgba(12,17,29,0.92);'
      + '  --bg-card: rgba(15,23,42,0.75);'
      + '  --glass: rgba(99,102,241,0.06);'
      + '  --glass-border: rgba(99,102,241,0.12);'
      + '  --accent: #818cf8;'
      + '  --accent-bright: #a5b4fc;'
      + '  --accent-rose: #fb7185;'
      + '  --accent-emerald: #34d399;'
      + '  --text-1: #f1f5f9;'
      + '  --text-2: #94a3b8;'
      + '  --text-3: #475569;'
      + '  --radius-md: 14px;'
      + '  --radius-lg: 20px;'
      + '}'
      
      + '*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }'
      + 'body {'
      + "  font-family: 'Inter', sans-serif;"
      + '  background: var(--bg-deep);'
      + '  color: var(--text-1);'
      + '  overflow: hidden;'
      + '  padding: 20px;'
      + '}'
      
      // Cards - Glassmorphism
      + '.card {'
      + '  background: var(--bg-card); border: 1px solid var(--glass-border);'
      + '  border-radius: var(--radius-lg); padding: 22px; margin-bottom: 16px;'
      + '  backdrop-filter: blur(16px);'
      + '}'
      
      + '.card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }'
      + '.card-icon { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: rgba(99,102,241,0.12); color: var(--accent); }'
      + '.card-title { font-size: 12px; font-weight: 700; color: var(--text-2); text-transform: uppercase; letter-spacing: 1px; }'
      
      // Forms
      + '.form-group { margin-bottom: 16px; }'
      + '.form-label { font-size: 12px; font-weight: 600; color: var(--text-2); display: block; margin-bottom: 8px; }'
      + '.custom-select, .input-field {'
      + '  width: 100%; padding: 12px 16px;'
      + '  border-radius: var(--radius-md); border: 1px solid var(--glass-border);'
      + '  background: rgba(15,23,42,0.6); color: var(--text-1);'
      + '  font-size: 14px; font-weight: 500;'
      + '}'
      + '.custom-select:focus, .input-field:focus { outline: none; border-color: var(--accent); }'
      
      + '.btn-save {'
      + '  width: 100%; padding: 14px; border-radius: var(--radius-md); border: none;'
      + '  background: linear-gradient(135deg, #6366f1, #8b5cf6);'
      + '  color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;'
      + '}'
      + '.btn-save:hover { opacity: 0.9; }'
      
      // Status text
      + '.log-box {'
      + '  background: rgba(15,23,42,0.4); border-radius: var(--radius-md); padding: 14px;'
      + '  font-size: 13px; font-family: monospace; border: 1px solid var(--glass-border); color: var(--text-2); word-break: break-all;'
      + '}'
      
      + '</style>'
      + '</head>'
      + '<body>'
      
      + '<div class="card">'
      + '  <div class="card-header"><div class="card-icon"><i class="fas fa-clock"></i></div><div class="card-title">Cấu hình thời gian chạy</div></div>'
      + '  <div class="form-group">'
      + '    <label class="form-label">Chọn giờ chạy hàng ngày (Daily):</label>'
      + '    <select id="hourSelect" class="custom-select">' + hourOptionsHtml + '</select>'
      + '  </div>'
      + '</div>'
      
      + '<div class="card">'
      + '  <div class="card-header"><div class="card-icon"><i class="fas fa-envelope"></i></div><div class="card-title">Danh sách Email nhận báo cáo</div></div>'
      + '  <div class="form-group">'
      + '    <label class="form-label">Các email (phân tách bằng dấu phẩy):</label>'
      + '    <input type="text" id="emailsInput" class="input-field" value="' + settings.emails + '">'
      + '  </div>'
      + '</div>'
      
      + '<div class="card">'
      + '  <div class="card-header"><div class="card-icon"><i class="fas fa-history"></i></div><div class="card-title">Trạng thái chạy tự động gần nhất</div></div>'
      + '  <div class="log-box" id="lastRunStatus">' + settings.lastRunStatus + '</div>'
      + '</div>'
      
      + '<button class="btn-save" id="saveBtn" onclick="saveSettings()"><i class="fas fa-save"></i> LƯU THIẾT LẬP</button>'
      
      + '<script>'
      + 'function saveSettings() {'
      + '  var hour = document.getElementById("hourSelect").value;'
      + '  var emails = document.getElementById("emailsInput").value.trim();'
      + '  var btn = document.getElementById("saveBtn");'
      + '  btn.disabled = true; btn.innerHTML = "<i class=\'fas fa-spinner fa-spin\'></i> Đang lưu...";'
      
      + '  google.script.run'
      + '    .withSuccessHandler(function() {'
      + '      btn.innerHTML = "<i class=\'fas fa-check\'></i> ĐÃ LƯU THÀNH CÔNG!";'
      + '      btn.style.background = "#10b981";'
      + '      setTimeout(function() { google.script.host.close(); }, 1500);'
      + '    })'
      + '    .withFailureHandler(function(err) {'
      + '      alert("Lỗi: " + err.message);'
      + '      btn.disabled = false; btn.innerHTML = "<i class=\'fas fa-save\'></i> LƯU THIẾT LẬP";'
      + '    })'
      + '    .saveAutomationSettings({ hour: parseInt(hour), emails: emails, lastRunStatus: document.getElementById("lastRunStatus").textContent });'
      + '}'
      + '</script>'
      + '</body>'
      + '</html>';
      
    var htmlOutput = HtmlService.createHtmlOutput(htmlContent)
      .setWidth(500)
      .setHeight(650);
      
    ui.showModalDialog(htmlOutput, 'Cấu hình tự động hóa tổng hợp');
  } catch (e) {
    throw new Error('Lỗi hiển thị giao diện tự động hóa: ' + e.message);
  }
}

// =====================================================================================
// 3. XỬ LÝ TỰ ĐỘNG & EMAIL
// =====================================================================================

/**
 * Hàm tự động chạy hàng ngày (Trigger)
 */
function autoProcessDaily() {
  try {
    Logger.log('🔄 Bắt đầu tự động tổng hợp...');
    var ss = getSS();
    var targetSheet = ss.getSheetByName(AUTO_PROCESS_SHEET);

    if (!targetSheet) {
      Logger.log('❌ Không tìm thấy sheet "' + AUTO_PROCESS_SHEET + '"');
      return;
    }

    const storedTags = getStoredSpecialDaysTags();
    const x2DaysStr = storedTags.x2Days.join('\n');
    const x3DaysStr = storedTags.x3Days.join('\n');

    processSelectedSheetEnhanced(AUTO_PROCESS_SHEET, x2DaysStr, x3DaysStr);
    sendReportEmail(ss);

    Logger.log('✅ Hoàn thành tự động tổng hợp.');
    var formattedTime = Utilities.formatDate(new Date(), CONFIG.TIMEZONE || 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
    logAutomationStatus("Thành công lúc " + formattedTime);
  } catch (e) {
    Logger.log('Loi autoProcessDaily: ' + e.message);
    var formattedTime = Utilities.formatDate(new Date(), CONFIG.TIMEZONE || 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm:ss');
    logAutomationStatus("Thất bại lúc " + formattedTime + ": " + e.message);
    try {
      var formattedTime = Utilities.formatDate(
        new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'
      );
      var spreadsheetUrl = '';
      try { spreadsheetUrl = SpreadsheetApp.openById(SPREADSHEET_ID).getUrl(); } catch(u) {}

      function errBadge(letter, bgColor) {
        return '<span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;'
          + 'background:' + bgColor + ';color:#fff;border-radius:6px;font-size:12px;font-weight:700;">'
          + letter + '</span>';
      }

      var errorBody = ''
        + '<!DOCTYPE html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;600;700;800&display=swap" rel="stylesheet"></head>'
        + '<body style="margin:0;padding:0;background:#f0f4f8;font-family:Libre Franklin,Segoe UI,Arial,sans-serif;">'
        + '<div style="max-width:620px;margin:20px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">'

        // Header - Red gradient
        + '<div style="background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 50%,#f97316 100%);padding:36px 32px;text-align:center;">'
        + '<div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:14px;margin:0 auto 14px;line-height:56px;font-size:24px;font-weight:900;color:#fbbf24;">!!</div>'
        + '<h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 6px;">KING\'s GRILL HR</h1>'
        + '<p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0;">Canh Bao Loi He Thong</p>'
        + '</div>'

        // Error badge
        + '<div style="padding:0 32px;">'
        + '<div style="background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;padding:12px 24px;border-radius:12px;margin-top:-18px;text-align:center;font-weight:700;font-size:14px;box-shadow:0 4px 12px rgba(220,38,38,0.3);">'
        + '&#10008; Tong hop cham cong that bai'
        + '</div>'
        + '</div>'

        // Error detail card
        + '<div style="padding:24px 32px;">'
        + '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:20px;">'
        + '<div style="font-size:12px;font-weight:600;color:#991b1b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">CHI TIET LOI</div>'
        + '<div style="background:#ffffff;border-radius:8px;padding:14px;font-family:Courier New,monospace;font-size:13px;color:#7f1d1d;border:1px solid #fecaca;word-break:break-all;">'
        + e.message
        + '</div>'
        + '</div>'
        + '</div>'

        // Info cards
        + '<div style="padding:0 32px 24px;">'
        + '<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
        + '<td width="50%" style="padding:0 6px 0 0;">'
        + '<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:14px;text-align:center;">'
        + errBadge('T', '#0ea5e9')
        + '<div style="color:#0369a1;font-size:10px;font-weight:600;text-transform:uppercase;margin-top:6px;">THOI GIAN LOI</div>'
        + '<div style="color:#1e3a5f;font-size:12px;font-weight:700;margin-top:4px;">' + formattedTime + '</div>'
        + '</div></td>'
        + '<td width="50%" style="padding:0 0 0 6px;">'
        + '<div style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:12px;padding:14px;text-align:center;">'
        + errBadge('N', '#a855f7')
        + '<div style="color:#7e22ce;font-size:10px;font-weight:600;text-transform:uppercase;margin-top:6px;">NGUON</div>'
        + '<div style="color:#4a1d96;font-size:12px;font-weight:700;margin-top:4px;">' + AUTO_PROCESS_SHEET + '</div>'
        + '</div></td>'
        + '</tr></table>'
        + '</div>'

        // Action button
        + (spreadsheetUrl ? '<div style="padding:0 32px 28px;text-align:center;">'
        + '<a href="' + spreadsheetUrl + '" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#ffffff;padding:12px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;box-shadow:0 4px 16px rgba(37,99,235,0.3);">'
        + '&#9654; Mo Spreadsheet Kiem Tra'
        + '</a></div>' : '')

        // Footer
        + '<div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">'
        + '<p style="margin:0 0 6px;font-size:11px;color:#94a3b8;">He thong cham cong tu dong</p>'
        + '<p style="margin:0;font-size:12px;font-weight:800;color:#1e293b;letter-spacing:1px;">KING\'s GRILL &#169; ' + new Date().getFullYear() + '</p>'
        + '</div>'
        + '</div></body></html>';

      REPORT_EMAILS.forEach(function(email) {
        MailApp.sendEmail(
          email,
          '[KING\'s GRILL] Loi tong hop cham cong - ' + formattedTime,
          'Loi tong hop cham cong: ' + e.message + ' - Thoi gian: ' + formattedTime,
          { htmlBody: errorBody }
        );
      });
    } catch (err) {
      Logger.log('Khong the gui email loi: ' + err.message);
    }
  }
}

/**
 * Gửi email báo cáo kết quả - PREMIUM DESIGN v3 (No Emoji - Gmail Safe)
 */
function sendReportEmail(ss) {
  try {
    var summarySheetName = '\u{1F4CA} T\u1ECCNG H\u1EE2P ' + AUTO_PROCESS_SHEET;
    var summarySheet = ss.getSheetByName(summarySheetName);
    if (!summarySheet) {
      // Fallback: thử không có emoji
      var sheets = ss.getSheets();
      for (var si = 0; si < sheets.length; si++) {
        if (sheets[si].getName().indexOf('T\u1ECCNG H\u1EE2P') >= 0) {
          summarySheet = sheets[si];
          summarySheetName = sheets[si].getName();
          break;
        }
      }
    }
    if (!summarySheet) throw new Error('Kh\u00F4ng t\u00ECm th\u1EA5y sheet t\u1ED5ng h\u1EE3p');

    var sheetUrl = ss.getUrl() + '#gid=' + summarySheet.getSheetId();
    var formattedTime = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    var formattedDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
    var totalRows = summarySheet.getLastRow();
    var dataSheet = ss.getSheetByName(AUTO_PROCESS_SHEET);
    var totalCheckins = dataSheet ? Math.max(0, dataSheet.getLastRow() - 1) : 0;

    // Export preview PNG
    var sheetPreviewBlob = null;
    try {
      var exportUrl = 'https://docs.google.com/spreadsheets/d/' + ss.getId()
        + '/export?format=png&gid=' + summarySheet.getSheetId()
        + '&size=A4&portrait=true&fitw=true&top_margin=0.2&bottom_margin=0.2'
        + '&left_margin=0.2&right_margin=0.2&gridlines=false&printtitle=false';
      var response = UrlFetchApp.fetch(exportUrl, {
        headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (response.getResponseCode() === 200) {
        sheetPreviewBlob = response.getBlob().setName('preview.png');
      }
    } catch (imgErr) {
      Logger.log('Khong the tao preview: ' + imgErr.message);
    }

    // Export PDF
    var pdfBlob = null;
    try {
      var pdfUrl = 'https://docs.google.com/spreadsheets/d/' + ss.getId()
        + '/export?format=pdf&gid=' + summarySheet.getSheetId()
        + '&size=A4&portrait=false&fitw=true&gridlines=false&printtitle=false'
        + '&top_margin=0.3&bottom_margin=0.3&left_margin=0.3&right_margin=0.3';
      var pdfResponse = UrlFetchApp.fetch(pdfUrl, {
        headers: { 'Authorization': 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (pdfResponse.getResponseCode() === 200) {
        pdfBlob = pdfResponse.getBlob().setName('BaoCaoTongHop_' + formattedDate.replace(/\//g, '-') + '.pdf');
      }
    } catch (pdfErr) {
      Logger.log('Khong the tao PDF: ' + pdfErr.message);
    }

    // Helper: tao icon badge bang CSS (khong dung emoji)
    function iconBadge(letter, bgColor) {
      return '<span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;'
        + 'background:' + bgColor + ';color:#fff;border-radius:8px;font-size:14px;font-weight:700;">'
        + letter + '</span>';
    }

    var previewImgTag = sheetPreviewBlob
      ? '<img src="cid:sheetPreview" style="width:100%;max-width:680px;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 4px 16px rgba(0,0,0,0.08);" alt="Preview">'
      : '<div style="background:#f1f5f9;border-radius:12px;padding:30px;text-align:center;color:#64748b;font-size:14px;">Preview khong kha dung - vui long mo link ben duoi</div>';

    var body = ''
      + '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
      + '<html xmlns="http://www.w3.org/1999/xhtml" lang="vi">'
      + '<head>'
      + '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />'
      + '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
      + '<title>Báo Cáo Tổng Hợp Chấm Công - King\'s Grill</title>'
      + '<style type="text/css">'
      + 'body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }'
      + 'table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }'
      + 'img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }'
      + 'body { margin: 0; padding: 0; width: 100% !important; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }'
      + '@media only screen and (max-width: 600px) {'
      + '  .container-table { width: 100% !important; max-width: 100% !important; }'
      + '  .content-padding { padding: 16px !important; }'
      + '  .header-padding { padding: 24px 16px !important; }'
      + '  .stat-card-td { display: block !important; width: 100% !important; padding: 4px 0 !important; }'
      + '}'
      + '</style>'
      + '</head>'
      + '<body style="margin:0;padding:0;background-color:#f1f5f9;color:#0f172a;">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f1f5f9;table-layout:fixed;">'
      + '<tr><td align="center" style="padding:24px 12px;">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" class="container-table" style="max-width:620px;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(15,23,42,0.08);border:1px solid #e2e8f0;">'
      
      // Header
      + '<tr><td style="background-color:#0b1329;padding:28px 24px 24px;text-align:center;" class="header-padding">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">'
      + '<table border="0" cellpadding="0" cellspacing="0"><tr>'
      + '<td align="center" style="width:52px;height:52px;background-color:#1e293b;border:2px solid rgba(251,191,36,0.4);border-radius:14px;color:#fbbf24;font-size:22px;font-weight:900;line-height:52px;text-align:center;">KG</td>'
      + '</tr></table>'
      + '<h1 style="margin:12px 0 2px;color:#ffffff;font-size:20px;font-weight:900;letter-spacing:0.5px;text-transform:uppercase;">KING&#39;S GRILL</h1>'
      + '<p style="margin:0;color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">BÁO CÁO TỔNG HỢP CHẤM CÔNG HỆ THỐNG</p>'
      + '</td></tr></table>'
      + '</td></tr>'
      
      // Status Badge
      + '<tr><td style="padding:20px 24px 12px;" class="content-padding">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#ecfdf5;border:1.5px solid #10b981;border-radius:14px;">'
      + '<tr><td style="padding:14px 16px;">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>'
      + '<td width="30" valign="middle" style="font-size:20px;line-height:1;">✅</td>'
      + '<td valign="middle" style="padding-left:8px;">'
      + '<div style="font-size:14px;font-weight:900;color:#065f46;letter-spacing:0.3px;text-transform:uppercase;line-height:1.3;">TỔNG HỢP HOÀN TẤT THÀNH CÔNG</div>'
      + '<div style="font-size:11px;font-weight:700;color:#047857;opacity:0.85;margin-top:2px;">Dữ liệu đã được xử lý và đồng bộ vào bảng tính quản trị</div>'
      + '</td></tr></table>'
      + '</td></tr></table>'
      + '</td></tr>'
      
      // KPI Stat Cards
      + '<tr><td style="padding:6px 24px 16px;" class="content-padding">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr>'
      + '<td width="33%" class="stat-card-td" style="padding:0 6px 0 0;" valign="top">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:14px;">'
      + '<tr><td style="padding:16px 12px;text-align:center;">'
      + '<div style="font-size:11px;font-weight:800;color:#0284c7;text-transform:uppercase;letter-spacing:0.5px;">THỜI GIAN</div>'
      + '<div style="font-size:12px;font-weight:800;color:#0c4a6e;margin-top:6px;line-height:1.3;">' + formattedTime + '</div>'
      + '</td></tr></table>'
      + '</td>'
      + '<td width="33%" class="stat-card-td" style="padding:0 3px;" valign="top">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fdf4ff;border:1px solid #e9d5ff;border-radius:14px;">'
      + '<tr><td style="padding:16px 12px;text-align:center;">'
      + '<div style="font-size:11px;font-weight:800;color:#7e22ce;text-transform:uppercase;letter-spacing:0.5px;">LƯỢT CHẤM</div>'
      + '<div style="font-size:24px;font-weight:900;color:#581c87;margin-top:4px;">' + totalCheckins + '</div>'
      + '</td></tr></table>'
      + '</td>'
      + '<td width="33%" class="stat-card-td" style="padding:0 0 0 6px;" valign="top">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;">'
      + '<tr><td style="padding:16px 12px;text-align:center;">'
      + '<div style="font-size:11px;font-weight:800;color:#15803d;text-transform:uppercase;letter-spacing:0.5px;">DÒNG TỔNG HỢP</div>'
      + '<div style="font-size:24px;font-weight:900;color:#14532d;margin-top:4px;">' + totalRows + '</div>'
      + '</td></tr></table>'
      + '</td>'
      + '</tr></table>'
      + '</td></tr>'
      
      // Preview Section
      + '<tr><td style="padding:4px 24px 16px;" class="content-padding">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">'
      + '<tr><td style="padding:14px 16px;border-bottom:1px solid #edf2f7;"><span style="font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;">📸 Bản Xem Trước Bảng Tổng Hợp</span></td></tr>'
      + '<tr><td style="padding:16px;text-align:center;">' + previewImgTag + '</td></tr>'
      + '</table>'
      + '</td></tr>'
      
      // Metadata Details Table
      + '<tr><td style="padding:0 24px 20px;" class="content-padding">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">'
      + '<tr><td style="padding:10px 16px;border-bottom:1px solid #edf2f7;" width="35%"><span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Nguồn dữ liệu:</span></td><td style="padding:10px 16px;border-bottom:1px solid #edf2f7;" width="65%" align="right"><span style="font-size:12px;font-weight:800;color:#0f172a;">' + AUTO_PROCESS_SHEET + '</span></td></tr>'
      + '<tr><td style="padding:10px 16px;border-bottom:1px solid #edf2f7;"><span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Sheet kết quả:</span></td><td style="padding:10px 16px;border-bottom:1px solid #edf2f7;" align="right"><span style="font-size:12px;font-weight:800;color:#0284c7;">' + summarySheetName + '</span></td></tr>'
      + '<tr><td style="padding:10px 16px;"><span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Lịch trình tự động:</span></td><td style="padding:10px 16px;" align="right"><span style="font-size:12px;font-weight:800;color:#16a34a;">01:00 hàng ngày (Cron)</span></td></tr>'
      + '</table>'
      + '</td></tr>'
      
      // CTA Action Button
      + '<tr><td style="padding:4px 24px 24px;text-align:center;" class="content-padding">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">'
      + '<a href="' + sheetUrl + '" target="_blank" style="display:block;width:100%;max-width:360px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;letter-spacing:0.3px;padding:14px 24px;border-radius:12px;text-align:center;box-shadow:0 4px 14px rgba(37,99,235,0.35);">'
      + '📊 XEM CHI TIẾT BẢNG TỔNG HỢP &rarr;'
      + '</a>'
      + '<p style="margin:10px 0 0;font-size:11px;color:#64748b;">(Bạn cũng có thể xem trực tiếp tệp PDF đính kèm bên dưới email)</p>'
      + '</td></tr></table>'
      + '</td></tr>'
      
      // Divider
      + '<tr><td style="padding:0 24px;"><div style="height:1px;background-color:#e2e8f0;"></div></td></tr>'
      
      // Footer
      + '<tr><td style="padding:20px 24px;background-color:#f8fafc;text-align:center;" class="content-padding">'
      + '<p style="margin:0 0 6px;font-size:11px;color:#64748b;line-height:1.4;">Email này được gửi tự động từ máy chủ <strong>King&#39;s Grill HR</strong>.<br />Vui lòng không trả lời trực tiếp email này.</p>'
      + '<p style="margin:0;font-size:12px;font-weight:800;color:#0f172a;letter-spacing:0.5px;">KING&#39;S GRILL RESTAURANT &copy; ' + new Date().getFullYear() + '</p>'
      + '</td></tr>'
      
      + '</table>'
      + '</td></tr></table>'
      + '</body></html>';

    // Gui email
    var emailOptions = { htmlBody: body };
    if (sheetPreviewBlob) emailOptions.inlineImages = { sheetPreview: sheetPreviewBlob };
    if (pdfBlob) emailOptions.attachments = [pdfBlob];

    var activeEmails = CONFIG.EMAILS;
    try {
      var settings = getAutomationSettings();
      if (settings && settings.emails) {
        var parsedEmails = settings.emails.split(',').map(function(e) { return e.trim(); }).filter(function(e) { return e.indexOf('@') > 0; });
        if (parsedEmails.length > 0) {
          activeEmails = parsedEmails;
        }
      }
    } catch(eSettings) {}

    activeEmails.forEach(function(email) {
      MailApp.sendEmail(
        email,
        '[KING\'s GRILL] Bao cao tong hop cham cong - ' + formattedDate,
        'Bao cao tong hop cham cong KING\'s GRILL - ' + formattedTime,
        emailOptions
      );
    });

    Logger.log('Da gui email bao cao den ' + activeEmails.join(', '));
  } catch (e) {
    Logger.log('Loi gui email: ' + e.message);
  }
}

// =====================================================================================
// 4. QUẢN LÝ DỮ LIỆU (STORAGE)
// =====================================================================================

function getStoredSpecialDaysTags() {
  try {
    const stored = PropertiesService.getDocumentProperties().getProperty(SPECIAL_DAYS_KEY);
    return stored ? JSON.parse(stored) : { x2Days: [], x3Days: [] };
  } catch (e) {
    return { x2Days: [], x3Days: [] };
  }
}

function saveSpecialDaysTags(x2Days, x3Days) {
  try {
    PropertiesService.getDocumentProperties().setProperty(
      SPECIAL_DAYS_KEY,
      JSON.stringify({ x2Days: x2Days, x3Days: x3Days })
    );
    return true;
  } catch (e) {
    return false;
  }
}

function addSpecialDayTag(day, type) {
  try {
    const stored = getStoredSpecialDaysTags();
    if (type === 'x2' && !stored.x2Days.includes(day)) {
      stored.x2Days.push(day);
    } else if (type === 'x3' && !stored.x3Days.includes(day)) {
      stored.x3Days.push(day);
    }
    saveSpecialDaysTags(stored.x2Days, stored.x3Days);
    return stored;
  } catch (e) {
    throw new Error('Lỗi thêm ngày: ' + e.message);
  }
}

function removeSpecialDayTag(day, type) {
  try {
    const stored = getStoredSpecialDaysTags();
    if (type === 'x2') {
      stored.x2Days = stored.x2Days.filter(function(d) { return d !== day; });
    } else if (type === 'x3') {
      stored.x3Days = stored.x3Days.filter(function(d) { return d !== day; });
    }
    saveSpecialDaysTags(stored.x2Days, stored.x3Days);
    return stored;
  } catch (e) {
    throw new Error('Lỗi xóa ngày: ' + e.message);
  }
}

// =====================================================================================
// 5. GIAO DIỆN NGƯỜI DÙNG (HTML/CSS) - ULTRA PREMIUM v4.0
// =====================================================================================

function showSheetSelectionDialog() {
  try {
    var ui = getUI();
    if (!ui) {
      Logger.log('showSheetSelectionDialog: Hàm này chỉ hoạt động khi mở từ Google Sheets.');
      return;
    }
    var ss = getSS();
    var sheets = ss.getSheets();
    
    // Tự động nhận dạng sheet của tháng hiện hành
    var dateObj = new Date();
    var curMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
    var curYear = dateObj.getFullYear();
    var defaultSheetName = "Tháng " + curMonth + "/" + curYear;
    
    var optionsHtml = '<option value="">-- Chọn sheet --</option>';
    sheets.forEach(function(s) {
      var name = s.getName();
      if (name !== 'DATA' && name.indexOf('API_KEYS') < 0 && name.indexOf('JSON_') < 0) {
        var isSelected = (name === defaultSheetName) ? ' selected' : '';
        optionsHtml += '<option value="' + name.replace(/"/g, '&quot;') + '"' + isSelected + '>' + name + '</option>';
      }
    });
    
    var storedTags = getStoredSpecialDaysTags();
    var currentYear = new Date().getFullYear();

    var htmlContent = '<!DOCTYPE html>'
      + '<html lang="vi">'
      + '<head>'
      + '<base target="_top">'
      + '<meta charset="UTF-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
      + '<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">'
      + '<style>'
      + "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');"

      // CSS Variables
      + ':root {'
      + '  --bg-deep: #06080f;'
      + '  --bg-surface: rgba(12,17,29,0.92);'
      + '  --bg-card: rgba(15,23,42,0.75);'
      + '  --bg-card-hover: rgba(22,33,62,0.85);'
      + '  --glass: rgba(99,102,241,0.06);'
      + '  --glass-border: rgba(99,102,241,0.12);'
      + '  --accent: #818cf8;'
      + '  --accent-bright: #a5b4fc;'
      + '  --accent-2: #c084fc;'
      + '  --accent-3: #22d3ee;'
      + '  --accent-amber: #fbbf24;'
      + '  --accent-emerald: #34d399;'
      + '  --accent-rose: #fb7185;'
      + '  --text-1: #f1f5f9;'
      + '  --text-2: #94a3b8;'
      + '  --text-3: #475569;'
      + '  --radius-sm: 10px;'
      + '  --radius-md: 14px;'
      + '  --radius-lg: 20px;'
      + '  --radius-xl: 24px;'
      + '}'

      // Reset & Base
      + '*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }'
      + 'body {'
      + "  font-family: 'Inter', system-ui, -apple-system, sans-serif;"
      + '  background: var(--bg-deep);'
      + '  min-height: 100vh;'
      + '  color: var(--text-1);'
      + '  overflow-x: hidden;'
      + '  -webkit-font-smoothing: antialiased;'
      + '}'

      // Animated Mesh Background
      + '.mesh-bg {'
      + '  position: fixed; inset: 0; z-index: 0; overflow: hidden;'
      + '}'
      + '.mesh-bg::before {'
      + '  content: ""; position: absolute;'
      + '  width: 600px; height: 600px; top: -200px; left: -100px;'
      + '  background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%);'
      + '  animation: meshFloat1 12s ease-in-out infinite alternate;'
      + '}'
      + '.mesh-bg::after {'
      + '  content: ""; position: absolute;'
      + '  width: 500px; height: 500px; bottom: -150px; right: -100px;'
      + '  background: radial-gradient(circle, rgba(192,132,252,0.1) 0%, transparent 70%);'
      + '  animation: meshFloat2 10s ease-in-out infinite alternate;'
      + '}'
      + '@keyframes meshFloat1 { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(60px,40px) scale(1.15)} }'
      + '@keyframes meshFloat2 { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(-50px,-30px) scale(1.1)} }'

      // Particles
      + '.particles { position: fixed; inset: 0; z-index: 0; pointer-events: none; }'
      + '.particle {'
      + '  position: absolute; width: 2px; height: 2px; border-radius: 50%;'
      + '  background: rgba(129,140,248,0.4);'
      + '  animation: particleDrift linear infinite;'
      + '}'
      + '@keyframes particleDrift {'
      + '  0% { transform: translateY(100vh) scale(0); opacity: 0; }'
      + '  10% { opacity: 1; }'
      + '  90% { opacity: 1; }'
      + '  100% { transform: translateY(-10vh) scale(1); opacity: 0; }'
      + '}'

      // App container
      + '.app { position: relative; z-index: 1; padding: 14px; max-width: 660px; margin: 0 auto; }'

      // Header - Ultra Premium
      + '.header {'
      + '  text-align: center; padding: 32px 24px 26px;'
      + '  background: linear-gradient(145deg, rgba(99,102,241,0.08) 0%, rgba(192,132,252,0.05) 50%, rgba(34,211,238,0.04) 100%);'
      + '  border-radius: var(--radius-xl);'
      + '  border: 1px solid var(--glass-border);'
      + '  backdrop-filter: blur(24px) saturate(1.8);'
      + '  margin-bottom: 14px;'
      + '  position: relative; overflow: hidden;'
      + '  animation: headerReveal 0.7s cubic-bezier(0.16,1,0.3,1);'
      + '}'
      + '.header::before {'
      + '  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px;'
      + '  background: linear-gradient(90deg, transparent 0%, rgba(129,140,248,0.4) 50%, transparent 100%);'
      + '}'
      + '@keyframes headerReveal { from { opacity:0; transform:translateY(-30px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }'

      // Logo with animated ring
      + '.logo-wrap {'
      + '  width: 64px; height: 64px; margin: 0 auto 14px; position: relative;'
      + '}'
      + '.logo-ring {'
      + '  position: absolute; inset: -4px; border-radius: 20px;'
      + '  background: conic-gradient(from 0deg, var(--accent), var(--accent-2), var(--accent-3), var(--accent), var(--accent-2));'
      + '  animation: logoSpin 6s linear infinite;'
      + '  opacity: 0.6;'
      + '}'
      + '.logo-ring::after {'
      + '  content: ""; position: absolute; inset: 2px; border-radius: 18px;'
      + '  background: var(--bg-deep);'
      + '}'
      + '@keyframes logoSpin { to { transform: rotate(360deg); } }'
      + '.logo-inner {'
      + '  position: relative; z-index: 1; width: 64px; height: 64px; border-radius: 18px;'
      + '  background: linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4);'
      + '  display: flex; align-items: center; justify-content: center;'
      + '  font-size: 22px; font-weight: 900; color: #fff; letter-spacing: -0.5px;'
      + '  box-shadow: 0 8px 32px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.15);'
      + '}'
      + '.header h1 {'
      + '  font-size: 22px; font-weight: 800; letter-spacing: -0.3px;'
      + '  background: linear-gradient(135deg, #e2e8f0, #f8fafc);'
      + '  -webkit-background-clip: text; -webkit-text-fill-color: transparent;'
      + '  margin-bottom: 6px;'
      + '}'
      + '.header-sub {'
      + '  color: var(--text-2); font-size: 12.5px; font-weight: 500;'
      + '  display: flex; align-items: center; justify-content: center; gap: 6px;'
      + '}'
      + '.header-dot {'
      + '  width: 6px; height: 6px; border-radius: 50%;'
      + '  background: var(--accent-emerald);'
      + '  box-shadow: 0 0 8px rgba(52,211,153,0.5);'
      + '  animation: dotPulse 2s ease-in-out infinite;'
      + '}'
      + '@keyframes dotPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }'

      // Live clock
      + '.live-clock {'
      + '  margin-top: 10px; display: inline-flex; align-items: center; gap: 8px;'
      + '  padding: 6px 14px; border-radius: 99px;'
      + '  background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.15);'
      + '  font-size: 12px; font-weight: 600; color: var(--accent-bright);'
      + '  font-variant-numeric: tabular-nums;'
      + '}'

      // Steps - Morphing indicator
      + '.steps-bar {'
      + '  display: flex; gap: 6px; margin-bottom: 14px;'
      + '  animation: stepsReveal 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s both;'
      + '}'
      + '@keyframes stepsReveal { from{opacity:0;transform:translateY(15px)} to{opacity:1;transform:translateY(0)} }'
      + '.step-item {'
      + '  flex: 1; display: flex; align-items: center; gap: 8px;'
      + '  padding: 10px 12px; border-radius: var(--radius-md);'
      + '  background: var(--bg-card); border: 1px solid var(--glass-border);'
      + '  transition: all 0.4s cubic-bezier(0.16,1,0.3,1);'
      + '  cursor: default;'
      + '}'
      + '.step-item.active {'
      + '  background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.3);'
      + '  box-shadow: 0 0 20px rgba(99,102,241,0.08);'
      + '}'
      + '.step-item.done { background: rgba(52,211,153,0.06); border-color: rgba(52,211,153,0.2); }'
      + '.step-badge {'
      + '  width: 26px; height: 26px; border-radius: 9px; font-size: 11px; font-weight: 700;'
      + '  display: flex; align-items: center; justify-content: center;'
      + '  background: var(--text-3); color: var(--bg-deep); flex-shrink: 0;'
      + '  transition: all 0.4s cubic-bezier(0.16,1,0.3,1);'
      + '}'
      + '.step-item.active .step-badge { background: var(--accent); color: #fff; box-shadow: 0 2px 12px rgba(99,102,241,0.4); }'
      + '.step-item.done .step-badge { background: var(--accent-emerald); color: #fff; }'
      + '.step-label { font-size: 11px; font-weight: 600; color: var(--text-3); transition: color 0.3s; }'
      + '.step-item.active .step-label { color: var(--text-1); }'
      + '.step-item.done .step-label { color: var(--accent-emerald); }'

      // Cards - Ultra Glass
      + '.card {'
      + '  background: var(--bg-card); border: 1px solid var(--glass-border);'
      + '  border-radius: var(--radius-lg); padding: 22px;'
      + '  margin-bottom: 12px; position: relative;'
      + '  backdrop-filter: blur(16px) saturate(1.5);'
      + '  transition: all 0.35s cubic-bezier(0.16,1,0.3,1);'
      + '  animation: cardReveal 0.5s cubic-bezier(0.16,1,0.3,1) backwards;'
      + '}'
      + '.card:nth-child(2) { animation-delay: 0.15s; }'
      + '.card:nth-child(3) { animation-delay: 0.25s; }'
      + '@keyframes cardReveal { from{opacity:0;transform:translateY(20px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }'
      + '.card::before {'
      + '  content:""; position:absolute; top:0; left:20px; right:20px; height:1px;'
      + '  background: linear-gradient(90deg, transparent, rgba(129,140,248,0.2), transparent);'
      + '}'
      + '.card:hover { border-color: rgba(99,102,241,0.25); transform: translateY(-1px); }'

      // Card title
      + '.card-header {'
      + '  display: flex; align-items: center; gap: 10px;'
      + '  margin-bottom: 16px;'
      + '}'
      + '.card-icon {'
      + '  width: 32px; height: 32px; border-radius: var(--radius-sm);'
      + '  display: flex; align-items: center; justify-content: center;'
      + '  font-size: 14px; flex-shrink: 0;'
      + '}'
      + '.card-icon.indigo { background: rgba(99,102,241,0.12); color: var(--accent); }'
      + '.card-icon.cyan { background: rgba(34,211,238,0.12); color: var(--accent-3); }'
      + '.card-title {'
      + '  font-size: 12px; font-weight: 700; color: var(--text-2);'
      + '  text-transform: uppercase; letter-spacing: 1px;'
      + '}'

      // Select - Premium
      + '.select-wrap { position: relative; }'
      + '.custom-select {'
      + '  width: 100%; padding: 13px 44px 13px 16px;'
      + '  border-radius: var(--radius-md); border: 1px solid var(--glass-border);'
      + '  background: rgba(15,23,42,0.6); color: var(--text-1);'
      + '  font-size: 14px; font-weight: 500; transition: all 0.25s;'
      + '  appearance: none; cursor: pointer;'
      + "  font-family: 'Inter', sans-serif;"
      + "  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23818cf8' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\");"
      + '  background-repeat: no-repeat; background-position: right 14px center; background-size: 16px;'
      + '}'
      + '.custom-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99,102,241,0.12), 0 0 20px rgba(99,102,241,0.08); }'
      + '.custom-select:hover { border-color: rgba(99,102,241,0.3); }'
      + '.custom-select option { background: #0f172a; color: #f1f5f9; padding: 8px; }'

      // Calendar style
      + '.cal-day:hover { transform: scale(1.08); border-color: var(--accent) !important; }'

      // Tags - Redesigned
      + '.tags-panel {'
      + '  margin-top: 16px;'
      + '  background: rgba(15,23,42,0.4); border-radius: var(--radius-md);'
      + '  padding: 16px; border: 1px dashed rgba(99,102,241,0.12);'
      + '}'
      + '.tags-row { margin-bottom: 14px; }'
      + '.tags-row:last-child { margin-bottom: 0; }'
      + '.tags-head {'
      + '  font-size: 10px; font-weight: 700; text-transform: uppercase;'
      + '  letter-spacing: 1.2px; margin-bottom: 8px;'
      + '  display: flex; align-items: center; gap: 6px;'
      + '}'
      + '.tags-head.amber { color: var(--accent-amber); }'
      + '.tags-head.purple { color: var(--accent-2); }'
      + '.tags-sep { height: 1px; background: rgba(99,102,241,0.08); margin: 14px 0; }'
      + '.tags-flex { display: flex; flex-wrap: wrap; gap: 6px; min-height: 30px; }'
      + '.tag {'
      + '  padding: 5px 10px 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;'
      + '  color: #fff; display: inline-flex; align-items: center; gap: 7px;'
      + '  animation: tagPop 0.3s cubic-bezier(0.34,1.56,0.64,1);'
      + '  letter-spacing: 0.3px;'
      + '}'
      + '@keyframes tagPop { from{transform:scale(0.5);opacity:0} to{transform:scale(1);opacity:1} }'
      + '.tag.x2 { background: linear-gradient(135deg, #d97706, #f59e0b); box-shadow: 0 2px 8px rgba(217,119,6,0.3); }'
      + '.tag.x3 { background: linear-gradient(135deg, #7c3aed, #a855f7); box-shadow: 0 2px 8px rgba(124,58,237,0.3); }'
      + '.tag-x { '
      + '  background: rgba(0,0,0,0.2); border: none;'
      + '  width: 18px; height: 18px; border-radius: 50%; color: rgba(255,255,255,0.8);'
      + '  cursor: pointer; display: flex; align-items: center; justify-content: center;'
      + '  font-size: 11px; transition: all 0.15s; line-height: 1;'
      + '}'
      + '.tag-x:hover { background: rgba(0,0,0,0.4); color: #fff; transform: scale(1.15); }'
      + '.empty-state { font-size: 11.5px; color: var(--text-3); font-style: italic; padding: 4px 0; }'

      // Submit Button - Showstopper
      + '.btn-go {'
      + '  width: 100%; padding: 16px 24px; border-radius: var(--radius-md); border: none;'
      + '  background: linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4);'
      + '  background-size: 200% 200%; animation: shiftGrad 5s ease infinite;'
      + '  color: #fff; font-size: 15px; font-weight: 700; cursor: pointer;'
      + '  display: flex; align-items: center; justify-content: center; gap: 10px;'
      + "  font-family: 'Inter', sans-serif;"
      + '  transition: all 0.3s; position: relative; overflow: hidden;'
      + '  box-shadow: 0 4px 24px rgba(99,102,241,0.3), 0 1px 0 rgba(255,255,255,0.1) inset;'
      + '  margin-top: 10px; letter-spacing: 0.3px;'
      + '}'
      + '.btn-go::before {'
      + '  content: ""; position: absolute; top: 50%; left: 50%;'
      + '  width: 0; height: 0; border-radius: 50%;'
      + '  background: rgba(255,255,255,0.1);'
      + '  transition: width 0.6s, height 0.6s, top 0.6s, left 0.6s;'
      + '  transform: translate(-50%, -50%);'
      + '}'
      + '.btn-go:hover::before { width: 300px; height: 300px; }'
      + '.btn-go:hover { transform: translateY(-2px); box-shadow: 0 8px 40px rgba(99,102,241,0.45); }'
      + '.btn-go:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; box-shadow: 0 2px 12px rgba(99,102,241,0.15); }'
      + '@keyframes shiftGrad { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }'

      // Progress
      + '.prog-track {'
      + '  margin-top: 14px; height: 5px; border-radius: 99px;'
      + '  background: rgba(99,102,241,0.08); overflow: hidden;'
      + '  opacity: 0; transition: opacity 0.4s;'
      + '}'
      + '.prog-track.on { opacity: 1; }'
      + '.prog-fill {'
      + '  height: 100%; width: 0; border-radius: 99px;'
      + '  background: linear-gradient(90deg, var(--accent), var(--accent-2), var(--accent-3));'
      + '  background-size: 200%; animation: shiftGrad 2s linear infinite;'
      + '  transition: width 0.6s ease;'
      + '}'
      + '.prog-track.on .prog-fill { animation: progRun 14s ease-out forwards, shiftGrad 2s linear infinite; }'
      + '@keyframes progRun { 0%{width:0} 15%{width:20%} 40%{width:50%} 70%{width:75%} 90%{width:88%} 100%{width:93%} }'

      // Status text
      + '.status-line {'
      + '  margin-top: 10px; text-align: center; font-size: 12px; font-weight: 600;'
      + '  color: var(--text-3); transition: all 0.3s; min-height: 18px;'
      + '}'
      + '.status-line.running { color: var(--accent-bright); }'
      + '.status-line.done { color: var(--accent-emerald); }'

      // Spinner
      + '.spin {'
      + '  width: 18px; height: 18px;'
      + '  border: 2.5px solid rgba(255,255,255,0.2);'
      + '  border-top: 2.5px solid #fff;'
      + '  border-radius: 50%; animation: spinAnim 0.6s linear infinite;'
      + '}'
      + '@keyframes spinAnim { to { transform: rotate(360deg); } }'

      // Toast - Floating
      + '.toast {'
      + '  position: fixed; top: 14px; right: 14px; left: 14px;'
      + '  padding: 13px 18px; border-radius: var(--radius-md);'
      + '  color: #fff; font-weight: 600; font-size: 13px;'
      + '  box-shadow: 0 12px 40px rgba(0,0,0,0.4);'
      + '  z-index: 9999; transform: translateY(-120%);'
      + '  transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1);'
      + '  backdrop-filter: blur(16px); text-align: center;'
      + '  max-width: 400px; margin: 0 auto;'
      + '}'
      + '.toast.show { transform: translateY(0); }'
      + '.toast.success { background: rgba(16,185,129,0.92); border: 1px solid rgba(52,211,153,0.3); }'
      + '.toast.error { background: rgba(239,68,68,0.92); border: 1px solid rgba(248,113,113,0.3); }'
      + '.toast.warning { background: rgba(245,158,11,0.92); border: 1px solid rgba(251,191,36,0.3); }'

      // Footer
      + '.footer {'
      + '  text-align: center; padding: 16px 12px 6px;'
      + '  color: var(--text-3); font-size: 11px; font-weight: 500;'
      + '  letter-spacing: 0.3px;'
      + '}'
      + '.footer span { color: var(--accent); font-weight: 700; }'

      // Scrollbar
      + '::-webkit-scrollbar { width: 4px; }'
      + '::-webkit-scrollbar-track { background: transparent; }'
      + '::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.2); border-radius: 99px; }'

      + '</style>'
      + '</head>'
      + '<body>'

      // Background effects
      + '<div class="mesh-bg"></div>'
      + '<div class="particles" id="particles"></div>'

      + '<div class="app">'

      // Header
      + '<div class="header">'
      + '  <div class="logo-wrap">'
      + '    <div class="logo-ring"></div>'
      + '    <div class="logo-inner">KG</div>'
      + '  </div>'
      + '  <h1>KING\'S GRILL MANAGER</h1>'
      + '  <div class="header-sub"><div class="header-dot"></div> Hệ thống tổng hợp chấm công</div>'
      + '  <div class="live-clock" id="liveClock"><i class="far fa-clock"></i> <span id="clockText">--:--:--</span></div>'
      + '</div>'

      // Steps
      + '<div class="steps-bar">'
      + '  <div class="step-item active" id="step1"><div class="step-badge">1</div><div class="step-label">Chọn sheet</div></div>'
      + '  <div class="step-item" id="step2"><div class="step-badge">2</div><div class="step-label">Ngày đặc biệt</div></div>'
      + '  <div class="step-item" id="step3"><div class="step-badge">3</div><div class="step-label">Tổng hợp</div></div>'
      + '</div>'

      // Card 1 - Sheet Selection
      + '<div class="card">'
      + '  <div class="card-header"><div class="card-icon indigo"><i class="fas fa-database"></i></div><div class="card-title">Chọn Sheet Nguồn</div></div>'
      + '  <div class="select-wrap"><select id="sheetSelect" class="custom-select" onchange="activateStep(2)">' + optionsHtml + '</select></div>'
      + '</div>'

      // Card 2 - Special Days
      + '<div class="card">'
      + '  <div class="card-header"><div class="card-icon cyan"><i class="fas fa-calendar-alt"></i></div><div class="card-title">Lịch Ngày Đặc Biệt</div></div>'
      + '  <div class="calendar-nav" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">'
      + '    <button type="button" class="btn-cal" onclick="changeMonth(-1)" style="background:rgba(99,102,241,0.1); border:1px solid var(--glass-border); color:var(--text-1); padding:5px 12px; border-radius:8px; cursor:pointer;"><i class="fas fa-chevron-left"></i></button>'
      + '    <span id="calendarMonthLabel" style="font-weight:700; color:var(--accent-bright); font-size:14px;">Tháng --/----</span>'
      + '    <button type="button" class="btn-cal" onclick="changeMonth(1)" style="background:rgba(99,102,241,0.1); border:1px solid var(--glass-border); color:var(--text-1); padding:5px 12px; border-radius:8px; cursor:pointer;"><i class="fas fa-chevron-right"></i></button>'
      + '  </div>'
      + '  <div class="calendar-grid" id="calendarGrid" style="display:grid; grid-template-columns:repeat(7, 1fr); gap:6px; margin-bottom:16px;"></div>'
      + '  <div class="legend" style="display:flex; gap:12px; font-size:11px; margin-bottom:16px; justify-content:center; color:var(--text-2); font-weight:600;">'
      + '    <div style="display:flex; align-items:center; gap:4px;"><span style="width:12px; height:12px; border-radius:3px; background:rgba(99,102,241,0.03); border:1px solid var(--glass-border); display:inline-block;"></span> Thường</div>'
      + '    <div style="display:flex; align-items:center; gap:4px;"><span style="width:12px; height:12px; border-radius:3px; background:linear-gradient(135deg, #d97706, #f59e0b); display:inline-block;"></span> Ngày x2</div>'
      + '    <div style="display:flex; align-items:center; gap:4px;"><span style="width:12px; height:12px; border-radius:3px; background:linear-gradient(135deg, #7c3aed, #a855f7); display:inline-block;"></span> Ngày x3</div>'
      + '  </div>'
      + '  <div class="tags-panel">'
      + '    <div class="tags-row">'
      + '      <div class="tags-head amber"><i class="fas fa-fire"></i> Danh sách Ngày x2</div>'
      + '      <div class="tags-flex" id="x2Tags"></div>'
      + '    </div>'
      + '    <div class="tags-sep"></div>'
      + '    <div class="tags-row">'
      + '      <div class="tags-head purple"><i class="fas fa-gem"></i> Danh sách Ngày x3</div>'
      + '      <div class="tags-flex" id="x3Tags"></div>'
      + '    </div>'
      + '  </div>'
      + '</div>'

      // Submit
      + '<button id="submitBtn" class="btn-go" onclick="submitForm()">'
      + '  <i class="fas fa-bolt"></i> BẮT ĐẦU TỔNG HỢP'
      + '</button>'
      + '<div class="prog-track" id="progTrack"><div class="prog-fill"></div></div>'
      + '<div class="status-line" id="statusLine"></div>'

      // Footer
      + '<div class="footer">KING\'S GRILL &copy; ' + currentYear + ' &bull; Powered by <span>Google Apps Script</span></div>'

      + '</div>'
      + '<div id="toast" class="toast"></div>'

      + '<script>'

      // Particles generator
      + '(function(){'
      + '  var pc = document.getElementById("particles");'
      + '  for(var i=0;i<20;i++){'
      + '    var p = document.createElement("div");'
      + '    p.className = "particle";'
      + '    p.style.left = Math.random()*100+"%";'
      + '    p.style.width = p.style.height = (1+Math.random()*2)+"px";'
      + '    p.style.animationDuration = (8+Math.random()*12)+"s";'
      + '    p.style.animationDelay = Math.random()*8+"s";'
      + '    p.style.opacity = 0.15+Math.random()*0.35;'
      + '    pc.appendChild(p);'
      + '  }'
      + '})();'

      // Live clock
      + 'function tickClock(){'
      + '  var n=new Date(), h=String(n.getHours()).padStart(2,"0"), m=String(n.getMinutes()).padStart(2,"0"), s=String(n.getSeconds()).padStart(2,"0");'
      + '  document.getElementById("clockText").textContent = h+":"+m+":"+s;'
      + '}'
      + 'tickClock(); setInterval(tickClock, 1000);'

      // Calendar Variables & Render logic
      + 'var calDate = new Date(); calDate.setDate(1);'
      + 'var currentTags = ' + JSON.stringify(storedTags) + ';'

      + 'function renderCalendar(){'
      + '  var grid = document.getElementById("calendarGrid");'
      + '  grid.innerHTML = "";'
      + '  var weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];'
      + '  weekdays.forEach(function(wd) {'
      + '    var h = document.createElement("div");'
      + '    h.textContent = wd;'
      + '    h.style.textAlign = "center";'
      + '    h.style.fontWeight = "700";'
      + '    h.style.fontSize = "10px";'
      + '    h.style.color = "var(--text-3)";'
      + '    h.style.padding = "4px 0";'
      + '    grid.appendChild(h);'
      + '  });'
      + '  var firstDayIndex = calDate.getDay();'
      + '  var startOffset = (firstDayIndex === 0) ? 6 : firstDayIndex - 1;'
      + '  for (var i = 0; i < startOffset; i++) {'
      + '    var blank = document.createElement("div");'
      + '    blank.style.height = "34px";'
      + '    grid.appendChild(blank);'
      + '  }'
      + '  var totalDays = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate();'
      + '  for (var day = 1; day <= totalDays; day++) {'
      + '    var cell = document.createElement("button");'
      + '    cell.type = "button";'
      + '    cell.className = "cal-day";'
      + '    cell.textContent = day;'
      + '    cell.style.height = "34px";'
      + '    cell.style.border = "1px solid var(--glass-border)";'
      + '    cell.style.borderRadius = "8px";'
      + '    cell.style.cursor = "pointer";'
      + '    cell.style.fontWeight = "600";'
      + '    cell.style.fontSize = "12px";'
      + '    cell.style.transition = "all 0.2s";'
      + '    var dayStr = String(day).padStart(2, "0") + "/" + String(calDate.getMonth() + 1).padStart(2, "0");'
      + '    if (currentTags.x2Days.indexOf(dayStr) >= 0) {'
      + '      cell.style.background = "linear-gradient(135deg, #d97706, #f59e0b)";'
      + '      cell.style.color = "#fff";'
      + '      cell.setAttribute("data-state", "x2");'
      + '    } else if (currentTags.x3Days.indexOf(dayStr) >= 0) {'
      + '      cell.style.background = "linear-gradient(135deg, #7c3aed, #a855f7)";'
      + '      cell.style.color = "#fff";'
      + '      cell.setAttribute("data-state", "x3");'
      + '    } else {'
      + '      cell.style.background = "rgba(99,102,241,0.03)";'
      + '      cell.style.color = "var(--text-1)";'
      + '      cell.setAttribute("data-state", "normal");'
      + '    }'
      + '    (function(dStr, cEl) {'
      + '      cEl.addEventListener("click", function() {'
      + '        var state = cEl.getAttribute("data-state");'
      + '        if (state === "normal") {'
      + '          currentTags.x2Days.push(dStr);'
      + '          cEl.setAttribute("data-state", "x2");'
      + '          cEl.style.background = "linear-gradient(135deg, #d97706, #f59e0b)";'
      + '          cEl.style.color = "#fff";'
      + '        } else if (state === "x2") {'
      + '          currentTags.x2Days = currentTags.x2Days.filter(function(d) { return d !== dStr; });'
      + '          currentTags.x3Days.push(dStr);'
      + '          cEl.setAttribute("data-state", "x3");'
      + '          cEl.style.background = "linear-gradient(135deg, #7c3aed, #a855f7)";'
      + '          cEl.style.color = "#fff";'
      + '        } else {'
      + '          currentTags.x3Days = currentTags.x3Days.filter(function(d) { return d !== dStr; });'
      + '          cEl.setAttribute("data-state", "normal");'
      + '          cEl.style.background = "rgba(99,102,241,0.03)";'
      + '          cEl.style.color = "var(--text-1)";'
      + '        }'
      + '        currentTags.x2Days.sort();'
      + '        currentTags.x3Days.sort();'
      + '        updateTagsDisplay(currentTags);'
      + '      });'
      + '    })(dayStr, cell);'
      + '    grid.appendChild(cell);'
      + '  }'
      + '  var monthNames = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];'
      + '  document.getElementById("calendarMonthLabel").textContent = "Tháng " + monthNames[calDate.getMonth()] + "/" + calDate.getFullYear();'
      + '}'

      + 'function changeMonth(dir) {'
      + '  calDate.setMonth(calDate.getMonth() + dir);'
      + '  renderCalendar();'
      + '}'

      + 'function activateStep(n){'
      + '  for(var i=1;i<=3;i++){'
      + '    var el=document.getElementById("step"+i);'
      + '    el.className="step-item"+(i<n?" done":"")+(i===n?" active":"");'
      + '  }'
      + '}'

      + 'function removeDay(day,type){'
      + '  if(type==="x2") currentTags.x2Days = currentTags.x2Days.filter(function(d){ return d !== day; });'
      + '  else if(type==="x3") currentTags.x3Days = currentTags.x3Days.filter(function(d){ return d !== day; });'
      + '  updateTagsDisplay(currentTags);'
      + '}'

      + 'function updateTagsDisplay(tags){'
      + '  currentTags=tags;'
      + '  renderTags(tags.x2Days,"x2Tags","x2");'
      + '  renderTags(tags.x3Days,"x3Tags","x3");'
      + '  renderCalendar();'
      + '}'

      + 'function renderTags(list,elId,type){'
      + '  var c=document.getElementById(elId);'
      + '  if(!list.length){ c.innerHTML=\'<div class="empty-state">Chưa có ngày nào</div>\'; return; }'
      + '  c.innerHTML=list.map(function(d){'
      + '    return \'<div class="tag \'+type+\'">\'+d+\' <button onclick="removeDay(\\x27\'+d+\'\\x27, \\x27\'+type+\'\\x27)" class="tag-x">&times;</button></div>\';'
      + '  }).join("");'
      + '}'

      + 'function submitForm(){'
      + '  var sheet=document.getElementById("sheetSelect").value, btn=document.getElementById("submitBtn");'
      + '  if(!sheet) return showToast("Vui lòng chọn sheet trước","warning");'
      + '  activateStep(3);'
      + '  btn.disabled=true;'
      + '  btn.innerHTML=\'<div class="spin"></div> ĐANG XỬ LÝ...\';'
      + '  document.getElementById("progTrack").classList.add("on");'
      + '  document.getElementById("statusLine").textContent="Đang tổng hợp dữ liệu...";'
      + '  document.getElementById("statusLine").className="status-line running";'
      + '  var x2=currentTags.x2Days.join("\\n"), x3=currentTags.x3Days.join("\\n");'
      + '  google.script.run'
      + '    .withSuccessHandler(function() {'
      + '      google.script.run'
      + '        .withSuccessHandler(function(){'
      + '          document.querySelector(".prog-fill").style.width="100%";'
      + '          btn.innerHTML=\'<i class="fas fa-check-circle"></i> HOÀN TẤT!\';'
      + '          btn.style.background="linear-gradient(135deg,#059669,#10b981)";'
      + '          btn.style.boxShadow="0 4px 24px rgba(16,185,129,0.4)";'
      + '          document.getElementById("statusLine").textContent="Tổng hợp hoàn tất thành công!";'
      + '          document.getElementById("statusLine").className="status-line done";'
      + '          showToast("Tổng hợp hoàn tất thành công!","success");'
      + '          setTimeout(function(){ google.script.host.close(); }, 2500);'
      + '        })'
      + '        .withFailureHandler(function(err){'
      + '          showToast("Lỗi: "+err.message,"error");'
      + '          btn.disabled=false;'
      + '          btn.innerHTML=\'<i class="fas fa-bolt"></i> BẮT ĐẦU TỔNG HỢP\';'
      + '          btn.style.background=""; btn.style.boxShadow="";'
      + '          document.getElementById("progTrack").classList.remove("on");'
      + '          document.querySelector(".prog-fill").style.width="0";'
      + '          document.getElementById("statusLine").textContent="";'
      + '          document.getElementById("statusLine").className="status-line";'
      + '        })'
      + '        .processSelectedSheetEnhanced(sheet,x2,x3);'
      + '    })'
      + '    .withFailureHandler(function(err) {'
      + '      showToast("Lỗi lưu cấu hình: " + err.message, "error");'
      + '      btn.disabled=false;'
      + '      btn.innerHTML=\'<i class="fas fa-bolt"></i> BẮT ĐẦU TỔNG HỢP\';'
      + '    })'
      + '    .saveSpecialDaysTags(currentTags.x2Days, currentTags.x3Days);'
      + '}'

      + 'function showToast(msg,type){'
      + '  var t=document.getElementById("toast");'
      + '  t.textContent=msg; t.className="toast show "+type;'
      + '  setTimeout(function(){ t.className="toast"; }, 3500);'
      + '}'

      + '</script>'
      + '</body>'
      + '</html>';

    var htmlOutput = HtmlService.createHtmlOutput(htmlContent)
      .setWidth(680)
      .setHeight(820);

    ui.showModalDialog(htmlOutput, 'KING\'S GRILL - Bảng Điều Khiển Tổng Hợp');
  } catch (e) {
    throw new Error('Lỗi hiển thị giao diện: ' + e.message);
  }
}

// =====================================================================================
// 6. TIÊU ĐỀ DATA 2 DÒNG (VIETNAMESE & TECHNICAL)
// =====================================================================================

function migrateDataHeadersQuietly(sheet) {
  var values = sheet.getRange(1, 1, 2, 1).getValues();
  var r2c1 = values[1][0] ? values[1][0].toString().trim() : '';
  
  if (r2c1 !== 'Username') {
    sheet.insertRowAfter(1);
  }
  
  var vnHeaders = ["Tên đăng nhập", "Mật khẩu", "Họ và tên", "Ngày sinh", "Email", "Quyền hạn", "Chức vụ", "Ảnh đại diện", "Trạng thái nhân sự", "Đến ngày", "Lý do", "Cập nhật lúc"];
  var enHeaders = ["Username", "Password", "FullName", "DOB", "Email", "Role", "Position", "AvatarUrl", "EmploymentStatus", "StatusUntil", "StatusReason", "StatusUpdatedAt"];
  
  sheet.getRange(1, 1, 1, vnHeaders.length).setValues([vnHeaders]);
  sheet.getRange(2, 1, 1, enHeaders.length).setValues([enHeaders]);
  
  sheet.getRange(1, 1, 1, vnHeaders.length)
    .setBackground('#1e293b')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
    
  sheet.getRange(2, 1, 1, enHeaders.length)
    .setBackground('#f1f5f9')
    .setFontColor('#64748b')
    .setFontWeight('bold')
    .setFontStyle('italic')
    .setFontSize(9)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
    
  sheet.setFrozenRows(2);
}

function migrateDataHeaders() {
  var ss = getSS();
  var sheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) {
    var ui = getUI();
    if (ui) ui.alert('Không tìm thấy sheet DATA');
    return;
  }
  migrateDataHeadersQuietly(sheet);
  var ui = getUI();
  if (ui) {
    ui.alert('Thành công', 'Đã chuyển đổi tiêu đề sheet DATA sang cấu trúc 2 dòng: Tiếng Việt ở trên và Thuật ngữ ở dưới.', ui.ButtonSet.OK);
  }
}
