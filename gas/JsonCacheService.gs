/**
 * JsonCacheService.gs
 * Manages compiled JSON caching on a dedicated sheet to optimize GET_DATA performance.
 * Utilizes Sheets API v4 batchGet for fast cache rebuilding.
 */

var JsonCacheService = (function() {
  var CACHE_SHEET_NAME = "JSON_CACHE";

  /**
   * Gets or creates the JSON_CACHE sheet.
   */
  function getCacheSheet() {
    var ss = getSS();
    var sheet = ss.getSheetByName(CACHE_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(CACHE_SHEET_NAME);
      sheet.appendRow(["Key", "JSON", "LastUpdated"]);
      sheet.getRange("A1:C1").setFontWeight("bold").setBackground("#d9ead3");
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  /**
   * Reads a cached record from the JSON_CACHE sheet.
   * Returns parsed object or null if not found.
   */
  function getCacheRecord(key) {
    try {
      var sheet = getCacheSheet();
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === key) {
          if (data[i][1]) {
            return JSON.parse(data[i][1]);
          }
        }
      }
    } catch (e) {
      Logger.log("getCacheRecord error for key " + key + ": " + e.toString());
    }
    return null;
  }

  /**
   * Writes a cached record to the JSON_CACHE sheet.
   */
  function updateCacheRecord(key, dataObj) {
    try {
      var sheet = getCacheSheet();
      var data = sheet.getDataRange().getValues();
      var jsonStr = JSON.stringify(dataObj);
      var timeStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm:ss");
      
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === key) {
          sheet.getRange(i + 1, 2, 1, 2).setValues([[jsonStr, timeStr]]);
          return;
        }
      }
      sheet.appendRow([key, jsonStr, timeStr]);
    } catch (e) {
      Logger.log("updateCacheRecord error for key " + key + ": " + e.toString());
    }
  }

  /**
   * Invalidates (deletes) all user-specific cache keys or a specific key.
   */
  function invalidateUserCache(username) {
    try {
      var sheet = getCacheSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;
      
      var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var prefix = username ? "USER_" + username + "_" : "USER_";
      
      // Delete from bottom up to avoid index shifting problems
      for (var i = data.length - 1; i >= 0; i--) {
        var key = data[i][0].toString();
        if (key.indexOf(prefix) === 0) {
          sheet.deleteRow(i + 2);
        }
      }
    } catch (e) {
      Logger.log("invalidateUserCache error: " + e.toString());
    }
  }

  /**
   * Invalidates admin extended cache keys.
   */
  function invalidateAdminCache() {
    try {
      var sheet = getCacheSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;
      
      var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = data.length - 1; i >= 0; i--) {
        var key = data[i][0].toString();
        if (key.indexOf("ADMIN_EXT_") === 0) {
          sheet.deleteRow(i + 2);
        }
      }
    } catch (e) {
      Logger.log("invalidateAdminCache error: " + e.toString());
    }
  }

  /**
   * Invalidates global cache.
   */
  function invalidateGlobalCache() {
    try {
      var sheet = getCacheSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;
      var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = data.length - 1; i >= 0; i--) {
        var key = data[i][0].toString();
        if (key === "GLOBAL_DATA") {
          sheet.deleteRow(i + 2);
        }
      }
    } catch (e) {
      Logger.log("invalidateGlobalCache error: " + e.toString());
    }
  }

  /**
   * Clear all cache.
   */
  function invalidateAllCache() {
    try {
      var sheet = getCacheSheet();
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
    } catch (e) {
      Logger.log("invalidateAllCache error: " + e.toString());
    }
  }

  /**
   * Batch fetches all necessary data using Sheets API V4 batchGet.
   */
  function batchFetchRawData(ss, monthSheet) {
    var ssId = ss.getId();
    var sheetNamesInSS = ss.getSheets().map(function(s) { return s.getName(); });
    var ranges = [];
    var rangeMap = {};

    function addRange(sheetName, rangeSpec) {
      if (sheetNamesInSS.indexOf(sheetName) >= 0) {
        ranges.push("'" + sheetName + "'!" + rangeSpec);
        rangeMap[sheetName] = ranges.length - 1;
      }
    }

    addRange(CONFIG.SHEET_USERS, "A1:L");
    addRange(CONFIG.SHEET_LOGS, "A1:H");
    addRange(CONFIG.SHEET_API_KEYS, "A1:C");
    addRange(CONFIG.SHEET_CHAT_LOGS, "A1:E");
    addRange(CONFIG.SHEET_CONFIG, "A1:B");
    addRange("Posts", "A1:G");
    addRange("Feedbacks", "A1:G");
    addRange("ChecklistLogs", "A1:E");
    addRange("Handovers", "A1:E");
    addRange("KING_COINS", "A1:G");
    addRange("NOTIFICATIONS", "A1:G");
    addRange("TRAINING_CONTENT", "A1:D");
    addRange("TRAINING_PROGRESS", "A1:D");
    if (monthSheet) {
      addRange(monthSheet, "A1:K");
    }

    var valueRanges = [];
    try {
      var response = Sheets.Spreadsheets.Values.batchGet(ssId, { ranges: ranges });
      valueRanges = response.valueRanges || [];
    } catch (e) {
      Logger.log("batchGet failed, falling back to sequential reads: " + e.toString());
      // Return a wrapper that performs standard getValues() on demand
      return {
        getValues: function(sheetName) {
          var s = ss.getSheetByName(sheetName);
          return s ? s.getDataRange().getValues() : [];
        },
        getDisplayValues: function(sheetName) {
          var s = ss.getSheetByName(sheetName);
          return s ? s.getDataRange().getDisplayValues() : [];
        }
      };
    }

    return {
      getValues: function(sheetName) {
        var idx = rangeMap[sheetName];
        if (idx !== undefined && valueRanges[idx] && valueRanges[idx].values) {
          return valueRanges[idx].values;
        }
        return [];
      },
      getDisplayValues: function(sheetName) {
        var idx = rangeMap[sheetName];
        if (idx !== undefined && valueRanges[idx] && valueRanges[idx].values) {
          return valueRanges[idx].values;
        }
        return [];
      }
    };
  }

  /**
   * Rebuilds and caches global configs.
   */
  function rebuildGlobalCache(db) {
    var result = {};
    
    // GPS Config
    var configValues = db.getValues(CONFIG.SHEET_CONFIG);
    result.gpsConfig = extractConfigFromValues(configValues, "GPS_CONFIG", { 
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

    // Org Config
    result.orgConfig = extractConfigFromValues(configValues, "ORG_CONFIG", { 
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

    // Payroll Config
    result.payrollConfig = extractConfigFromValues(configValues, "PAYROLL_CONFIG", { 
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

    // AI Prompts
    result.aiPrompts = extractConfigFromValues(configValues, "AI_PROMPTS", []);

    // API Keys
    var keysData = db.getValues(CONFIG.SHEET_API_KEYS);
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

    // Recent Posts
    var postsData = db.getValues("Posts");
    var rp = [];
    if (postsData && postsData.length > 1) {
      for (var pi = postsData.length - 1; pi > 0 && rp.length < 3; pi--) {
        var row = postsData[pi];
        rp.push({ 
          id: row[0], 
          author: row[1], 
          content: row[2] ? row[2].toString().substring(0, 100) : '', 
          likesCount: row[3] ? JSON.parse(row[3]).length : 0, 
          commentsCount: row[4] ? JSON.parse(row[4]).length : 0, 
          image: row[5] || '', 
          time: row[6] || '' 
        });
      }
    }
    result.recentPosts = rp;

    updateCacheRecord("GLOBAL_DATA", result);
    return result;
  }

  /**
   * Extracts JSON config from config sheet data matrix.
   */
  function extractConfigFromValues(values, key, defaultValue) {
    if (!values) return defaultValue;
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === key) {
        if (values[i][1]) return JSON.parse(values[i][1]);
      }
    }
    return defaultValue;
  }

  /**
   * Rebuilds and caches user-specific data.
   */
  function rebuildUserCache(db, username, fullname, monthSheet, weekLabel) {
    var result = { logs: [], stats: { totalCheckIn: 0, validCount: 0 } };
    var todayStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy');

    // Logs & Stats
    var logData = db.getValues(CONFIG.SHEET_LOGS);
    if (logData && logData.length > 1) {
      var logs = [], userCheckins = 0, validCount = 0;
      var startIdx = Math.max(1, logData.length - 200); // Only process last 200
      for (var i = logData.length - 1; i >= startIdx; i--) {
        var row = logData[i];
        if (!row[0]) continue;
        var isCurrentUser = row[0].toString().toLowerCase() === fullname.toLowerCase();
        if (isCurrentUser) {
          var timeVal = row[2];
          var timeStr = timeVal ? timeVal.toString() : '';
          var statusVal = row[4] ? row[4].toString() : '';
          var isHopLe = statusVal.toUpperCase().indexOf('HỢP LỆ') >= 0 && statusVal.toUpperCase().indexOf('KHÔNG') < 0;
          logs.push({ 
            fullname: row[0].toString(), 
            type: row[1] ? row[1].toString() : '', 
            time: timeStr, 
            location: row[3] ? row[3].toString() : '', 
            status: statusVal, 
            distance: row[5] ? row[5].toString() : '', 
            image: row[6] ? row[6].toString() : '' 
          });
          if (row[1] && row[1].toString().toLowerCase() === 'vào ca') userCheckins++;
          if (isHopLe) validCount++;
        }
      }
      result.logs = logs;
      result.stats = { totalCheckIn: userCheckins, validCount: validCount };
    }

    // Employment Profile
    var userData = db.getValues(CONFIG.SHEET_USERS);
    result.employmentProfile = null;
    if (userData) {
      for (var j = 2; j < userData.length; j++) {
        if (userData[j][0] && userData[j][0].toString().toLowerCase() === username.toLowerCase()) {
          result.employmentProfile = {
            username: userData[j][0] ? userData[j][0].toString() : '',
            fullname: userData[j][2] ? userData[j][2].toString() : '',
            dob: userData[j][3] ? userData[j][3].toString() : '',
            email: userData[j][4] ? userData[j][4].toString() : '',
            role: userData[j][5] ? userData[j][5].toString() : 'user',
            position: userData[j][6] ? userData[j][6].toString() : 'Phục vụ',
            avatarUrl: userData[j][7] ? userData[j][7].toString() : '',
            employmentStatus: normalizeEmploymentStatus(userData[j][8]),
            statusUntil: userData[j][9] ? userData[j][9].toString() : '',
            statusReason: userData[j][10] ? userData[j][10].toString() : '',
            statusUpdatedAt: userData[j][11] ? userData[j][11].toString() : ''
          };
          break;
        }
      }
    }

    // Chat History
    var chatData = db.getValues(CONFIG.SHEET_CHAT_LOGS);
    var chatHistory = [];
    if (chatData && chatData.length > 1) {
      var si = Math.max(1, chatData.length - 50);
      for (var c = si; c < chatData.length; c++) {
        if (chatData[c][1] && chatData[c][1].toString().toLowerCase() === fullname.toLowerCase()) {
          chatHistory.push({ role: chatData[c][2].toString(), content: chatData[c][3].toString() });
        }
      }
    }
    result.chatHistory = chatHistory;

    // Schedule / Shifts
    result.isScheduleRegistered = false;
    result.approvedShifts = null;
    if (monthSheet && weekLabel) {
      var schedData = db.getValues(monthSheet);
      if (schedData && schedData.length > 0) {
        var isReg = false, appShifts = null, inWeek = false;
        var cleanWL = weekLabel.replace('📅 TUẦN ', '').replace('TUẦN ', '').trim();
        for (var s = 0; s < schedData.length; s++) {
          var cv = schedData[s][0] ? schedData[s][0].toString() : '';
          if (cv.indexOf('TUẦN ') >= 0) { inWeek = cv.indexOf(cleanWL) >= 0; continue; }
          if (!inWeek) continue;
          if (cv.toLowerCase() === fullname.toLowerCase()) isReg = true;
          if (cv.indexOf('┗') >= 0 && cv.toLowerCase().indexOf(fullname.toLowerCase()) >= 0) {
            appShifts = [];
            for (var d = 1; d <= 7; d++) appShifts.push(schedData[s][d] ? schedData[s][d].toString().trim() : 'OFF');
          }
        }
        result.isScheduleRegistered = isReg;
        if (appShifts) result.approvedShifts = appShifts;
      }
    }

    // Today Checklist Done
    var clData = db.getValues("ChecklistLogs");
    var tDone = false;
    if (clData && clData.length > 1) {
      var clStart = Math.max(1, clData.length - 50);
      for (var ci = clData.length - 1; ci >= clStart; ci--) {
        if (clData[ci][0] && clData[ci][0].toString() === todayStr && 
            clData[ci][2] && clData[ci][2].toString().toLowerCase() === username.toLowerCase()) { 
          tDone = true; 
          break; 
        }
      }
    }
    result.todayChecklistDone = tDone;

    // Today Handover Done
    var hoData = db.getValues("Handovers");
    var hDone = false;
    if (hoData && hoData.length > 1) {
      var hoStart = Math.max(1, hoData.length - 30);
      for (var hi = hoData.length - 1; hi >= hoStart; hi--) {
        if (hoData[hi][0] && hoData[hi][0].toString() === todayStr && 
            hoData[hi][2] && hoData[hi][2].toString().toLowerCase() === username.toLowerCase()) { 
          hDone = true; 
          break; 
        }
      }
    }
    result.todayHandoverDone = hDone;

    // King Coins
    var kcData = db.getValues("KING_COINS");
    var uTotal = 0, recent = [];
    if (kcData && kcData.length > 1) {
      for (var ki = kcData.length - 1; ki > 0; ki--) {
        if (kcData[ki][1] && kcData[ki][1].toString().toLowerCase() === username.toLowerCase()) {
          var pts = Number(kcData[ki][5]) || 0;
          uTotal += pts;
          if (recent.length < 10) {
            recent.push({ 
              date: kcData[ki][0], 
              reason: kcData[ki][4] ? kcData[ki][4].toString() : '', 
              points: pts, 
              source: kcData[ki][6] ? kcData[ki][6].toString() : '' 
            });
          }
        }
      }
    }
    result.kingCoinsSummary = { totalPoints: uTotal, recentActivity: recent };

    // Notifications
    var ntfData = db.getValues("NOTIFICATIONS");
    var unread = 0;
    var tUser = username.toLowerCase();
    if (ntfData && ntfData.length > 1) {
      for (var ni = ntfData.length - 1; ni > 0; ni--) {
        var nt = ntfData[ni][1] ? ntfData[ni][1].toString().toLowerCase() : '';
        if ((nt === tUser || nt === 'all') && !(ntfData[ni][6] === true || ntfData[ni][6] === 'TRUE')) {
          unread++;
        }
      }
    }
    result.notificationsUnread = unread;

    // Training progress
    var tcData = db.getValues("TRAINING_CONTENT");
    var tpData = db.getValues("TRAINING_PROGRESS");
    var tTotal = tcData ? Math.max(0, tcData.length - 1) : 0;
    var tComp = 0;
    if (tpData && tpData.length > 1) {
      for (var ti = 1; ti < tpData.length; ti++) {
        if (tpData[ti][0] && tpData[ti][0].toString().toLowerCase() === username.toLowerCase()) {
          tComp++;
        }
      }
    }
    result.trainingProgress = { total: tTotal, completed: tComp };

    var key = "USER_" + username + "_" + (monthSheet || "") + "_" + (weekLabel || "");
    updateCacheRecord(key, result);
    return result;
  }

  /**
   * Rebuilds and caches admin-specific extended data.
   */
  function rebuildAdminExtCache(db, monthSheet, weekLabel) {
    var result = { users: [], logs: [], stats: { totalCheckIn: 0, validCount: 0 }, pendingFeedbackCount: 0 };

    // All Users
    var userData = db.getValues(CONFIG.SHEET_USERS);
    var users = [];
    if (userData) {
      for (var j = 2; j < userData.length; j++) {
        users.push({
          username: userData[j][0] ? userData[j][0].toString() : '',
          fullname: userData[j][2] ? userData[j][2].toString() : '',
          dob: userData[j][3] ? userData[j][3].toString() : '',
          email: userData[j][4] ? userData[j][4].toString() : '',
          role: userData[j][5] ? userData[j][5].toString() : 'user',
          position: userData[j][6] ? userData[j][6].toString() : 'Phục vụ',
          avatarUrl: userData[j][7] ? userData[j][7].toString() : '',
          employmentStatus: normalizeEmploymentStatus(userData[j][8]),
          statusUntil: userData[j][9] ? userData[j][9].toString() : '',
          statusReason: userData[j][10] ? userData[j][10].toString() : '',
          statusUpdatedAt: userData[j][11] ? userData[j][11].toString() : ''
        });
      }
    }
    result.users = users;

    // All Logs (Admin sees everything)
    var logData = db.getValues(CONFIG.SHEET_LOGS);
    var logs = [], totalCheckins = 0, validCount = 0;
    if (logData && logData.length > 1) {
      var startIdx = Math.max(1, logData.length - 200);
      for (var i = logData.length - 1; i >= startIdx; i--) {
        var row = logData[i];
        if (!row[0]) continue;
        var timeVal = row[2];
        var timeStr = timeVal ? timeVal.toString() : '';
        var statusVal = row[4] ? row[4].toString() : '';
        var isHopLe = statusVal.toUpperCase().indexOf('HỢP LỆ') >= 0 && statusVal.toUpperCase().indexOf('KHÔNG') < 0;
        
        logs.push({ 
          fullname: row[0].toString(), 
          type: row[1] ? row[1].toString() : '', 
          time: timeStr, 
          location: row[3] ? row[3].toString() : '', 
          status: statusVal, 
          distance: row[5] ? row[5].toString() : '', 
          image: row[6] ? row[6].toString() : '' 
        });
        if (row[1] && row[1].toString().toLowerCase() === 'vào ca') totalCheckins++;
        if (isHopLe) validCount++;
      }
    }
    result.logs = logs;
    result.stats = { totalCheckIn: totalCheckins, validCount: validCount };

    // Pending Feedback Count
    var fbData = db.getValues("Feedbacks");
    var pc = 0;
    if (fbData && fbData.length > 1) {
      for (var fi = 1; fi < fbData.length; fi++) {
        if (fbData[fi][6] && fbData[fi][6].toString() === 'Pending') pc++;
      }
    }
    result.pendingFeedbackCount = pc;

    var key = "ADMIN_EXT_" + (monthSheet || "") + "_" + (weekLabel || "");
    updateCacheRecord(key, result);
    return result;
  }

  return {
    getCacheSheet: getCacheSheet,
    getCacheRecord: getCacheRecord,
    updateCacheRecord: updateCacheRecord,
    invalidateUserCache: invalidateUserCache,
    invalidateAdminCache: invalidateAdminCache,
    invalidateGlobalCache: invalidateGlobalCache,
    invalidateAllCache: invalidateAllCache,
    batchFetchRawData: batchFetchRawData,
    rebuildGlobalCache: rebuildGlobalCache,
    rebuildUserCache: rebuildUserCache,
    rebuildAdminExtCache: rebuildAdminExtCache
  };
})();
