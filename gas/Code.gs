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
  EMAILS: ["dmt.7121@gmail.com", "btob.7121@gmail.com", "dmt.kgwork@gmail.com", "leminhsang993@gmail.com", "nguyentien1744293@gmail.com"],
  TIMEZONE: "Asia/Ho_Chi_Minh",
  MAX_COLS: 11,
  SPECIAL_DAYS_KEY: "SPECIAL_DAYS_TAGS",
  // Email Relay: Thêm URL relay từ tài khoản phụ để tăng quota
  // Mỗi URL = 1 tài khoản Google = +100 emails/ngày
  EMAIL_RELAY_URLS: [
    "https://script.google.com/macros/s/AKfycbyvklGluH_7uQ2WN43CiY2k1WOIWtebLC9Q8E3rFNl5tb9xInDQpBcYglTb-X7XlNAxuw/exec"
  ],
  EMAIL_RELAY_SECRET: "kg-relay-2026",
  ROSTER_SPREADSHEET_ID: "1VrmLjfdIjxmA62D5Ei33ppkw9ql1r0fvLrX1FJzGm6M"
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
      case 'UPDATE_CHECKIN_TYPE': return handleUpdateCheckinType(payload);
      case 'SEND_EMAIL_NOTIFICATION': return handleSendEmailNotification(payload);
      case 'UPLOAD_CHECKIN_IMAGE': return handleUploadCheckinImage(payload);
      case 'DIAGNOSE_AND_HEAL_IMAGES': return handleDiagnoseAndHealImages(payload);
      case 'DIAGNOSE_CELLS': return handleDiagnoseCells(payload);
      case 'GET_DATA': return handleGetData(payload);
      case 'GET_CHECKIN_LOGS': return handleGetCheckinLogs(payload);
      case 'SYNC_KEYS': return handleSyncKeys(payload);
      case 'UPDATE_AI_PROMPTS': return handleUpdateAiPrompts(payload);
      case 'GET_KEYS': return handleGetKeys(payload);
      case 'SAVE_CHAT_LOG': return handleSaveChatLog(payload);
      case 'AI_CHAT': return handleAiChat(payload);
      case 'GEOCODE': return handleGeocode(payload);
      case 'UPDATE_GPS_CONFIG': return handleUpdateGpsConfig(payload);
      case 'UPDATE_ORG_CONFIG': return handleUpdateOrgConfig(payload);
      case 'UPDATE_PAYROLL_CONFIG': return handleUpdatePayrollConfig(payload);
      case 'REGISTER_SHIFT': return handleRegisterShift(payload);
      case 'GET_ALL_SCHEDULES': return handleGetAllSchedules(payload);
      case 'GET_MONTH_SCHEDULES': return handleGetMonthSchedules(payload);
      case 'APPROVE_SCHEDULES': return handleApproveSchedules(payload);
      case 'SYNC_ROSTER_SCHEDULES': return handleSyncRosterSchedules(payload);
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
      case 'PATCH_OPS_CHECKLIST_ITEM':
        return handlePatchOpsChecklistItem(payload);
      case 'SAVE_OPS_CHECKLIST_CONFIG':
        return handleSaveOpsChecklistConfig(payload);

      // --- HANDOVER & INCIDENT ---
      case 'GET_HANDOVERS':
        return handleGetHandovers(payload);
      case 'SUBMIT_HANDOVER':
        return handleSubmitHandover(payload);
      case 'ACKNOWLEDGE_HANDOVER':
        return handleAcknowledgeHandover(payload);
      case 'REVIEW_HANDOVER':
        return handleReviewHandover(payload);
      case 'SUBMIT_INCIDENT':
        return handleSubmitIncident(payload);
      case 'GET_INCIDENTS':
        return handleGetIncidents(payload);
      case 'UPDATE_INCIDENT':
        return handleUpdateIncident(payload);

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
      case 'SET_PAYROLL_WORKFLOW_STATUS':
        return handleSetPayrollWorkflowStatus(payload);
      case 'CONFIRM_PAYROLL_SLIP':
        return handleConfirmPayrollSlip(payload);
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

      // --- ANALYTICS & AUDIT LOGS ---
      case 'GET_ANALYTICS':
        return handleGetAnalytics(payload);
      case 'GET_AUDIT_LOGS':
        return handleGetAuditLogs(payload);

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
  if (typeof msgOrData === 'string') {
    obj.message = msgOrData;
  } else if (msgOrData) {
    obj.data = msgOrData;
    if (typeof msgOrData === 'object') {
      if (msgOrData.message && !obj.message) obj.message = msgOrData.message;
      if (msgOrData.code && !obj.code) obj.code = msgOrData.code;
      if (msgOrData.isSpamCooldown !== undefined && obj.isSpamCooldown === undefined) {
        obj.isSpamCooldown = msgOrData.isSpamCooldown;
      }
    }
  }
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

    // Tự động nạp dữ liệu chấm công và cập nhật công thức khi nhập/chọn tên nhân viên trên Sheet Tổng Hợp
    if (sheetName.indexOf('📊 TỔNG HỢP') === 0 && e.range && e.range.getColumn() === 1) {
      var row = e.range.getRow();
      var newVal = String(e.value || e.range.getValue() || '').trim();
      if (row > 2) {
        var sheetObj = e.range.getSheet();
        var prevVal = String(sheetObj.getRange(row - 1, 1).getValue() || '').trim();
        if (prevVal === 'Họ và Tên') {
          // Luôn cập nhật công thức CCNV1 & CCNV2 theo tên nhân viên vừa nhập
          updateEmployeeSummaryFormulas(sheetObj, row, newVal);
          if (newVal && newVal !== '(CHƯA NHẬP TÊN)') {
            populateEmployeeAttendanceInSummaryTable(sheetObj, row, newVal);
          }
        }
      }
    }
  } catch(err) {
    Logger.log("onEdit trigger error: " + err.toString());
  }
}

/**
 * Tạo menu khi mở Google Sheets
 * Chỉ hoạt động khi mở spreadsheet (container-bound context)
 */
function buildAttendanceMenu_(ui) {
  return ui.createMenu("Tiện Ích Chấm Công ⭐️")
    .addItem("🎛️ Bảng Điều Khiển Chấm Công (Trung Tâm)", "showControlCenterModal")
    .addSeparator()
    .addItem("⚡️ Tổng Hợp Công & Lịch Lễ (Nhanh)", "showSheetSelectionDialog")
    .addItem("👥 Nhân Sự & Thêm Bảng Tổng Hợp", "showAddSummaryTablesModal")
    .addItem("📅 Đồng Bộ Lịch Làm & Bảo Trì Sheet", "openRosterSyncModal")
    .addItem("⚙️ Thiết Lập Tự Động Hóa & Email", "setupAutomation")
    .addItem("🗂️ Sắp Xếp, Ẩn & Dọn Xóa Sheet (API v4)", "openSheetManagerModal")
    .addSeparator()
    .addItem("🔄 Nạp Dữ Liệu Chấm Công Cho Nhân Viên Mới Thêm", "menuPopulateAllNewEmployees")
    .addItem("🔧 Sửa Công Thức & Khoảng Cách Sheet Tổng Hợp", "menuRepairSummarySheetFormulas")
    .addItem("✨ Làm đẹp Format Sheet Chấm Công", "formatEntireCheckInSheet")
    .addItem("🔧 Sửa lỗi Link Ảnh & Công thức (#ERROR!)", "repairCheckinFormulasAndImages")
    .addItem("🔄 Cấu hình tiêu đề DATA 2 dòng", "migrateDataHeaders");
}

function onOpen() {
  var ui = getUI();
  if (ui) {
    buildAttendanceMenu_(ui).addToUi();
  }
}

function createMenu() {
  var ui = getUI();
  if (!ui) {
    Logger.log("⚠️ createMenu: Hàm này chỉ hoạt động khi mở từ Google Sheets.");
    return;
  }
  buildAttendanceMenu_(ui).addToUi();
  getSS().toast("✅ Menu đã được tạo thành công!", "Thông Báo", 3);
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
  openAttendanceControlCenter("automation");
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
    var logoUrl = (CONFIG.WEB_APP_URL || 'https://kg-checkin.pages.dev/').replace(/\/+$/, '') + '/logo_badge_squircle.png?v=1';
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
      + '<table border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>'
      + '<td align="center" valign="middle" style="width:62px;height:62px;text-align:center;vertical-align:middle;">'
      + '<img src="' + logoUrl + '" alt="King\'s Grill Logo" width="62" height="62" style="display:block;width:62px;height:62px;border:0;outline:none;text-decoration:none;margin:0 auto;" />'
      + '</td>'
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
      + '<tr><td style="padding:8px 24px 24px;text-align:center;" class="content-padding">'
      + '<table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 auto;max-width:320px;"><tr>'
      + '<td align="center" style="border-radius:12px;background-color:#2563eb;background-image:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);box-shadow:0 4px 14px rgba(37,99,235,0.28);">'
      + '<a href="' + sheetUrl + '" target="_blank" style="display:block;padding:13px 20px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:13.5px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;text-align:center;line-height:1.2;letter-spacing:0.2px;white-space:nowrap;">'
      + 'Xem Bảng Tổng Hợp Chi Tiết &rarr;'
      + '</a>'
      + '</td></tr></table>'
      + '<div style="margin-top:9px;font-size:11px;color:#94a3b8;font-weight:500;">(Bạn cũng có thể xem trực tiếp tệp PDF đính kèm bên dưới email)</div>'
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

function showControlCenterModal() {
  openAttendanceControlCenter();
}

function showSheetSelectionDialog() {
  openAttendanceControlCenter("summary");
}

function openRosterSyncModal() {
  openAttendanceControlCenter("roster");
}

function openMaintenanceModal() {
  openAttendanceControlCenter("roster");
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

// =====================================================================================
// 7. GIAO DIỆN THÊM BẢNG TỔNG HỢP & SỬA CÔNG THỨC NHÂN VIÊN
// =====================================================================================

function menuPopulateAllNewEmployees() {
  var ui = getUI();
  var ss = getSS();
  var sheet = ss.getActiveSheet();
  var sheetName = sheet.getName();

  if (sheetName.indexOf('📊 TỔNG HỢP') < 0) {
    if (ui) ui.alert('Lưu ý', 'Tính năng này chỉ áp dụng cho các sheet Báo cáo Tổng Hợp (bắt đầu bằng "📊 TỔNG HỢP").', ui.ButtonSet.OK);
    return;
  }

  if (ui) {
    var response = ui.alert(
      '🔄 Nạp Dữ Liệu Chấm Công Cho Nhân Viên Mới Thêm',
      'Hệ thống sẽ quét các bảng nhân viên mới trên sheet "' + sheetName + '" đã được nhập tên, và tự động nạp dữ liệu chấm công (giờ vào/ra, ca làm việc) từ sheet nguồn bằng Google Sheets API V4.\n\nBạn có muốn tiếp tục không?',
      ui.ButtonSet.YES_NO
    );
    if (response === ui.Button.YES) {
      try {
        var res = populateAllNewEmployeesInSummarySheet(sheetName);
        ui.alert('✅ Hoàn Tất Nạp Dữ Liệu', res.message, ui.ButtonSet.OK);
      } catch(e) {
        ui.alert('❌ Lỗi', e.message, ui.ButtonSet.OK);
      }
    }
  } else {
    populateAllNewEmployeesInSummarySheet(sheetName);
  }
}

function menuRepairSummarySheetFormulas() {
  var ui = getUI();
  var ss = getSS();
  var sheet = ss.getActiveSheet();
  var sheetName = sheet.getName();

  if (ui) {
    var response = ui.alert(
      '🔧 Sửa Công Thức & Khoảng Cách Sheet Tổng Hợp',
      'Bạn có muốn rà soát và tự động chuẩn hóa khoảng cách giữa các bảng (khắc phục triệt để lỗi dính bảng), đồng thời sửa lại toàn bộ công thức Giờ Tăng Ca & Giờ Theo Ca (khắc phục lỗi âm giờ ngày x2/x3 và ca đêm) cho sheet "' + sheetName + '" không?',
      ui.ButtonSet.YES_NO
    );
    if (response === ui.Button.YES) {
      try {
        var res = repairSummarySheetFormulas(sheetName);
        ui.alert('✅ Hoàn tất chuẩn hóa & sửa công thức', res.message, ui.ButtonSet.OK);
      } catch (e) {
        ui.alert('❌ Lỗi', e.message, ui.ButtonSet.OK);
      }
    }
  } else {
    repairSummarySheetFormulas(sheetName);
  }
}

function openSheetManagerModal() {
  openAttendanceControlCenter("sheets");
}

function showAddSummaryTablesModal() {
  openAttendanceControlCenter("employees");
}
