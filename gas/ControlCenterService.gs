/**
 * ControlCenterService.js — Backend siêu tốc cho Bảng Điều Khiển Chấm Công Đa Tab King's Grill
 * - Sử dụng Google Sheets API v4 (metadata + batchGet) để đọc 131+ trang tính dưới 250ms.
 * - Mở khung giao diện tức thì (<100ms), nhận diện 2 chiều Nguồn <-> Tổng hợp, không lộ dữ liệu nhạy cảm.
 * - Bảo toàn 100% logic tính công và hợp đồng API WebApp hiện hữu.
 */

var CC_METADATA_CACHE_KEY = 'KG_CC_SHEET_META_V2';
var CC_METADATA_TTL_SECONDS = 45;
var CC_PINNED_LEFT_SHEETS = ['THÔNG TIN', 'DATA', '✔️CHẤM CÔNG'];

/**
 * Chuẩn hóa Unicode NFC để xử lý triệt để tên sheet dùng dấu tổ hợp NFD (ví dụ: "THA\u0301NG 5")
 */
function ccNormalizeTitleNFC(str) {
  if (!str) return '';
  return String(str).normalize('NFC').trim();
}

/**
 * Chuẩn hóa chuỗi tiếng Việt phục vụ tìm kiếm không dấu & so khớp tên
 */
function ccFoldText(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Escape tên trang tính an toàn cho biểu thức A1 của Google Sheets API v4
 */
function ccSafeA1Sheet(sheetTitle) {
  var raw = String(sheetTitle || '').replace(/'/g, "''");
  return "'" + raw + "'";
}

/**
 * Trả về thứ tự ghim cố định ngoài cùng bên trái (0..2) cho 3 sheet: THÔNG TIN, DATA, ✔️CHẤM CÔNG
 */
function ccGetPinnedLeftOrder(title) {
  var raw = ccNormalizeTitleNFC(title);
  for (var i = 0; i < CC_PINNED_LEFT_SHEETS.length; i++) {
    if (raw === CC_PINNED_LEFT_SHEETS[i]) return i;
  }
  return -1;
}

/**
 * Nhận diện các trang tính bản sao, nháp, tuần lẻ lưu trữ hoặc bản copy tổng hợp rác
 */
function ccIsJunkOrArchiveTitle(title) {
  var raw = ccNormalizeTitleNFC(title);
  if (!raw) return true;
  var folded = ccFoldText(raw);
  var cleanFolded = folded.replace(/^[^a-z0-9]+/i, '').trim();

  if (
    cleanFolded.indexOf('ban sao cua') === 0 ||
    cleanFolded.indexOf('ban sao luu') === 0 ||
    cleanFolded.indexOf('copy of ') === 0 ||
    cleanFolded.indexOf('sao luu') === 0 ||
    folded.indexOf('trang tinh') >= 0 ||
    cleanFolded.indexOf('du lieu goc') === 0 ||
    cleanFolded.indexOf('archive_') === 0 ||
    /^w\d{2}\s*-\s*\d{2}/i.test(raw) ||
    /^\d+$/.test(raw) ||
    raw === '3 T' ||
    /^(?:tong hop|t\.hop)(?:\s*\(\d+\))?$/i.test(cleanFolded) ||
    /^(?:t\.hop|tong hop)\s+cham cong\s+\d+$/i.test(cleanFolded) ||
    /^cham cong\s+[a-z0-9]$/i.test(cleanFolded)
  ) {
    return true;
  }
  return false;
}

/**
 * Kiểm tra trang tính thuộc diện Khóa bảo vệ (bảng lõi WebApp, dữ liệu nhân sự, chấm công đang chạy) — cấm xóa
 */
function isProtectedSystemSheet(title) {
  var raw = ccNormalizeTitleNFC(title);
  if (!raw) return false;
  if (ccGetPinnedLeftOrder(raw) >= 0) return true;
  if (ccIsJunkOrArchiveTitle(raw)) return false;

  if (raw === '📊 TỔNG HỢP ✔️CHẤM CÔNG' || raw === '👨‍🍳 CHẤM CÔNG BẾP - TẠP VỤ') {
    return true;
  }

  var upper = raw.toUpperCase();
  var folded = ccFoldText(raw);
  var cleanFoldedUpper = folded.replace(/^[^a-z0-9]+/i, '').toUpperCase();

  var exactProtected = [
    'THONG TIN',
    'DATA',
    'DATA2',
    'DATA_SCHEDULES',
    'DB_USERS',
    'USERS',
    'JSON_CACHE',
    'API_KEYS',
    'CHAT_LOGS',
    'CAU HINH',
    'CHECKLISTS',
    'CHECKLIST_CONFIG',
    '01_DANH_SACH_CHECKLIST',
    '02_LUU_TRU_TIEN_DO',
    'BO SUNG CONG',
    'MISSED_CHECKINS',
    'TONG HOP MAY CHAM CONG',
    'AI_PROMPTS',
    'FEEDBACKS',
    'CHECKLISTLOGS',
    'HANDOVERS',
    'POSTS',
    'SURVEYS',
    'SWAPREQUESTS',
    'PAYROLLDATA',
    'SALARYCONFIG',
    'SALARYMONTHLYCONFIG',
    'SALARYADJUSTMENTREQUESTS',
    'BONUSPENALTY',
    'ADVANCES',
    'OTPS',
    'INCIDENTS',
    'SOLDOUT',
    'FRAUDALERTS',
    'ACTIONLOGS',
    'OPERATIONSCONFIG',
    'OPERATIONTASKLOGS',
    'TRAINING_PROGRESS',
    'TRAINING_CONTENT',
    'NOTIFICATIONS',
    'KING_COINS',
    'ATTENDANCE_QUEUE'
  ];

  for (var i = 0; i < exactProtected.length; i++) {
    if (cleanFoldedUpper === exactProtected[i]) return true;
  }

  var protectedPrefixes = ['TTS_', 'PAYROLL', 'SALARY', 'TRAINING_', 'CONFIG_', 'LOG_', 'JSON_', 'OPERATION', 'CHECKLIST', 'MISSED_'];
  for (var p = 0; p < protectedPrefixes.length; p++) {
    if (cleanFoldedUpper.indexOf(protectedPrefixes[p]) === 0) return true;
  }

  if (upper.indexOf('API_KEYS') >= 0) return true;
  return false;
}

/**
 * Phân tích chính xác kỳ (Tháng/Năm) và khóa ghép cặp (pairStem) xuyên suốt 3 thế hệ đặt tên sheet (2024 / 2025 / 2026)
 */
function ccParseHistoricalPeriod(title, fallbackYear) {
  var defaultYear = fallbackYear || new Date().getFullYear();
  var raw = ccNormalizeTitleNFC(title);
  if (!raw || ccIsJunkOrArchiveTitle(raw)) {
    return { month: null, year: null, pairStem: '' };
  }

  var stemRaw = raw
    .replace(/^📊\s*TỔNG HỢP\s*/i, '')
    .replace(/^T\.HỢP\s*/i, '')
    .replace(/^TỔNG HỢP\s*/i, '')
    .trim();

  var normStem = stemRaw
    .replace(/✔️\s*/g, '✔️')
    .replace(/^CC\s+T?0?(\d{1,2})\s*[\/\-]\s*(20\d{2})$/i, function(_m, m1, y1) {
      return 'CC ' + String(parseInt(m1, 10)).padStart(2, '0') + '/' + y1;
    })
    .replace(/\s+/g, ' ')
    .toUpperCase();

  var hasCheckmark = stemRaw.indexOf('✔️') >= 0;
  var noCheck = stemRaw.replace(/✔️/g, '').trim();

  // 1. Dạng Tết (VD: ✔️TẾT 2026 -> 02/2026)
  var mTet = noCheck.match(/^TẾT\s*(20\d{2})$/i);
  if (mTet) {
    return { month: 2, year: parseInt(mTet[1], 10), pairStem: normStem };
  }

  // 2. Có năm tường minh MM/YYYY, MM-YYYY, MM.YYYY (VD: Tháng 10/2026, ✔️T02/2026, CC 04/2026, THÁNG 1.2025)
  var mExplicit = noCheck.match(/(?:^|\D)(\d{1,2})\s*[\/\-\.]\s*(20\d{2})(?:\D|$)/);
  if (mExplicit) {
    var mmE = parseInt(mExplicit[1], 10);
    var yyE = parseInt(mExplicit[2], 10);
    if (mmE >= 1 && mmE <= 12) return { month: mmE, year: yyE, pairStem: normStem };
  }

  // 3. Có năm trong ngoặc (VD: THÁNG 04 (2025), THÁNG 2 (2025))
  var mParen = noCheck.match(/(?:THÁNG|Tháng|T)\s*0?(\d{1,2})\s*\(\s*(20\d{2})\s*\)/i);
  if (mParen) {
    var mmP = parseInt(mParen[1], 10);
    var yyP = parseInt(mParen[2], 10);
    if (mmP >= 1 && mmP <= 12) return { month: mmP, year: yyP, pairStem: normStem };
  }

  // 4. Dạng viết liền T52026, T102026
  var mCompact = noCheck.match(/^T0?(\d{1,2})(20\d{2})$/i);
  if (mCompact) {
    var mmC = parseInt(mCompact[1], 10);
    var yyC = parseInt(mCompact[2], 10);
    if (mmC >= 1 && mmC <= 12) return { month: mmC, year: yyC, pairStem: normStem };
  }

  // 5. Dạng ngắn hiện hành T1..T12, t3 (không có chữ THÁNG) -> năm hiện hành (2026)
  var mShortT = noCheck.match(/^(?:CC\s+)?T\s*0?(\d{1,2})$/i);
  if (mShortT) {
    var mmT = parseInt(mShortT[1], 10);
    if (mmT >= 1 && mmT <= 12) return { month: mmT, year: defaultYear, pairStem: normStem };
  }

  // 6. Thế hệ dấu tích ✔️THÁNG 6..12 / ✔️ Tháng 6..11 (không ghi năm) -> năm 2025
  if (hasCheckmark) {
    var mCheckMonth = noCheck.match(/^(?:THÁNG|Tháng)\s*0?(\d{1,2})$/i);
    if (mCheckMonth) {
      var mmCk = parseInt(mCheckMonth[1], 10);
      if (mmCk >= 1 && mmCk <= 12) return { month: mmCk, year: 2025, pairStem: normStem };
    }
  }

  // 7. Lịch làm viết hoa chữ cái đầu "Tháng 05" (không dấu ✔️, không in hoa toàn bộ THÁNG) -> năm hiện hành (2026)
  if (!hasCheckmark && /^Tháng\s*0?(\d{1,2})$/.test(noCheck)) {
    var mSched = noCheck.match(/^Tháng\s*0?(\d{1,2})$/);
    var mmSc = parseInt(mSched[1], 10);
    if (mmSc >= 1 && mmSc <= 12) return { month: mmSc, year: defaultYear, pairStem: normStem };
  }

  // 8. Thế hệ chữ in hoa THÁNG 5..12 / T.HỢP THÁNG 7..12 (không dấu ✔️, không ghi năm) -> năm 2024
  if (!hasCheckmark && /^THÁNG\s*0?(\d{1,2})$/.test(noCheck)) {
    var mOld = noCheck.match(/^THÁNG\s*0?(\d{1,2})$/);
    var mmOld = parseInt(mOld[1], 10);
    if (mmOld >= 1 && mmOld <= 12) return { month: mmOld, year: 2024, pairStem: normStem };
  }

  return { month: null, year: null, pairStem: '' };
}

/**
 * Phân loại 146+ trang tính vào 4 nhóm nghiệp vụ cơ bản:
 * - 'summary_report'    : 📊 TỔNG HỢP ..., T.HỢP ..., Tổng hợp ...
 * - 'monthly_schedule'  : Tháng MM/YYYY, Tháng MM-YYYY (sheet đăng ký & duyệt lịch tuần)
 * - 'system_or_archive' : DATA, API_KEYS, JSON_CACHE, TTS_*, Payroll*, Bản sao..., W02-08..., Archive...
 * - 'attendance_source' : ✔️CHẤM CÔNG, T10, T9, 👨‍🍳 CHẤM CÔNG BẾP - TẠP VỤ, CC 04/2026...
 */
function classifySheetTitle(title) {
  var raw = ccNormalizeTitleNFC(title);
  if (!raw) return 'system_or_archive';

  if (ccIsJunkOrArchiveTitle(raw)) {
    return 'system_or_archive';
  }

  if (
    isProtectedSystemSheet(raw) &&
    raw !== '✔️CHẤM CÔNG' &&
    raw !== '📊 TỔNG HỢP ✔️CHẤM CÔNG' &&
    raw !== '👨‍🍳 CHẤM CÔNG BẾP - TẠP VỤ'
  ) {
    return 'system_or_archive';
  }

  var upper = raw.toUpperCase();
  var folded = ccFoldText(raw);

  // Báo cáo tổng hợp công
  if (
    raw.indexOf('📊 TỔNG HỢP') >= 0 ||
    folded.indexOf('tong hop') === 0 ||
    folded.indexOf('t.hop') === 0 ||
    upper.indexOf('TỔNG HỢP') === 0 ||
    upper.indexOf('T.HỢP') === 0
  ) {
    return 'summary_report';
  }

  // Bảng phân ca / đăng ký lịch tháng: chữ hoa đầu "Tháng ..." (không có ✔️ và không phải in hoa toàn bộ "THÁNG 10")
  if (
    raw.indexOf('✔️') < 0 &&
    raw.indexOf('THÁNG') < 0 &&
    /^Tháng\s+\d{1,2}(\s*[\/\-]\s*\d{4})?$/i.test(raw) &&
    raw.indexOf('Tháng') === 0
  ) {
    return 'monthly_schedule';
  }

  // Còn lại là các sheet log chấm công gốc
  return 'attendance_source';
}

/**
 * Phân loại mở rộng phục vụ Tab 5 (Quản Lý Sheet API v4): ghim 3 sheet đầu, tách khối Lịch làm / Chấm công & Tổng hợp / Hệ thống / Bản sao
 */
function classifySheetManagerMeta(title, fallbackYear) {
  var raw = ccNormalizeTitleNFC(title);
  var cat = classifySheetTitle(raw);
  var pinnedOrder = ccGetPinnedLeftOrder(raw);
  var isPinned = pinnedOrder >= 0;
  var isProt = isProtectedSystemSheet(raw);
  var period = ccParseHistoricalPeriod(raw, fallbackYear);
  var periodKey = (period.year && period.month)
    ? (String(period.year) + '-' + String(period.month).padStart(2, '0'))
    : '';

  var managerGroup = 'attendance_pair';
  if (isPinned) {
    managerGroup = 'pinned';
  } else if (ccIsJunkOrArchiveTitle(raw)) {
    managerGroup = 'archive_or_copy';
  } else if (isProt && raw !== '📊 TỔNG HỢP ✔️CHẤM CÔNG' && raw !== '👨‍🍳 CHẤM CÔNG BẾP - TẠP VỤ') {
    managerGroup = 'system_core';
  } else if (cat === 'monthly_schedule') {
    managerGroup = 'schedule';
  } else {
    managerGroup = 'attendance_pair';
  }

  return {
    category: cat,
    managerGroup: managerGroup,
    isPinned: isPinned,
    pinnedOrder: pinnedOrder,
    protected: isProt,
    periodYear: period.year,
    periodMonth: period.month,
    periodKey: periodKey,
    pairStem: period.pairStem || ''
  };
}

/**
 * Suy luận Tháng & Năm từ tên trang tính hoặc chuỗi thời gian mẫu (DD/MM/YYYY ...)
 */
function inferSheetMonthYear(title, sampleDateStr, fallbackYear) {
  var now = new Date();
  var defaultYear = fallbackYear || now.getFullYear();
  var defaultMonth = now.getMonth() + 1;
  var parsed = ccParseHistoricalPeriod(title, defaultYear);
  if (parsed.month && parsed.year) {
    return { month: parsed.month, year: parsed.year };
  }

  // Nếu có chuỗi ngày mẫu từ dòng dữ liệu (VD: "01/11/2026 15:01:00")
  if (sampleDateStr) {
    var sClean = String(sampleDateStr).replace(/^'/, '').trim();
    var mSample = sClean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/);
    if (mSample) {
      var mmD = parseInt(mSample[2], 10);
      var yyD = parseInt(mSample[3], 10);
      if (mmD >= 1 && mmD <= 12) return { month: mmD, year: yyD };
    }
  }

  return { month: defaultMonth, year: defaultYear };
}

/**
 * Quyết định tab mở mặc định thông minh dựa trên trang tính người dùng đang đứng
 */
function resolveInitialTabForSheet(activeSheetName, requestedTab) {
  var validTabs = ['summary', 'employees', 'roster', 'automation', 'sheets'];
  if (requestedTab && validTabs.indexOf(requestedTab) >= 0) {
    return requestedTab;
  }
  var cat = classifySheetTitle(activeSheetName);
  if (cat === 'summary_report') return 'employees';
  if (cat === 'monthly_schedule') return 'roster';
  return 'summary';
}

/**
 * Tìm chính xác tên sheet nguồn chấm công tương ứng với một sheet Báo Cáo Tổng Hợp từ metadata đã cache
 */
function ccFindSourceTitleForSummary_(summaryTitle, allSheetMetas) {
  var raw = ccNormalizeTitleNFC(summaryTitle);
  if (!raw) return '';
  var sources = allSheetMetas.filter(function(s) { return s.category === 'attendance_source'; });
  var sourceTitles = sources.map(function(s) { return s.title; });

  var cleanTarget = raw
    .replace(/^📊\s*TỔNG HỢP\s*/i, '')
    .replace(/^T\.HỢP\s*/i, '')
    .replace(/^TỔNG HỢP\s*(CC\s*)?/i, '')
    .trim();

  if (sourceTitles.indexOf(cleanTarget) >= 0) return cleanTarget;
  for (var j = 0; j < sources.length; j++) {
    if (ccNormalizeTitleNFC(sources[j].title).toLowerCase() === cleanTarget.toLowerCase()) {
      return sources[j].title;
    }
  }

  var sumMeta = classifySheetManagerMeta(raw);
  if (sumMeta.pairStem && sumMeta.periodKey) {
    for (var k = 0; k < sources.length; k++) {
      if (sources[k].pairStem === sumMeta.pairStem && sources[k].periodKey === sumMeta.periodKey) {
        return sources[k].title;
      }
    }
  }
  return '';
}

/**
 * Ghép cặp 2 chiều giữa Sheet Chấm Công Gốc và Sheet 📊 TỔNG HỢP
 */
function ccResolvePairedSheets(activeSheetName, allSheetMetas) {
  var titles = allSheetMetas.map(function(s) { return s.title; });
  var sources = allSheetMetas.filter(function(s) { return s.category === 'attendance_source'; }).map(function(s) { return s.title; });
  var summaries = allSheetMetas.filter(function(s) { return s.category === 'summary_report'; }).map(function(s) { return s.title; });
  var schedules = allSheetMetas
    .filter(function(s) { return s.category === 'monthly_schedule'; })
    .slice()
    .sort(function(a, b) {
      var ya = a.periodYear || 0;
      var yb = b.periodYear || 0;
      if (ya !== yb) return yb - ya;
      var ma = a.periodMonth || 0;
      var mb = b.periodMonth || 0;
      if (ma !== mb) return mb - ma;
      var slashA = String(a.title || '').indexOf('/') >= 0 ? 0 : 1;
      var slashB = String(b.title || '').indexOf('/') >= 0 ? 0 : 1;
      if (slashA !== slashB) return slashA - slashB;
      return (a.index || 0) - (b.index || 0);
    })
    .map(function(s) { return s.title; });

  var activeCat = classifySheetTitle(activeSheetName);
  var pairedSource = '';
  var pairedSummary = '';
  var pairedSchedule = schedules.length > 0 ? schedules[0] : '';

  if (activeCat === 'monthly_schedule') {
    pairedSchedule = activeSheetName;
  }

  if (activeCat === 'attendance_source') {
    pairedSource = activeSheetName;
    var expectedSummary = '📊 TỔNG HỢP ' + activeSheetName;
    if (titles.indexOf(expectedSummary) >= 0) {
      pairedSummary = expectedSummary;
    } else {
      for (var i = 0; i < summaries.length; i++) {
        var strippedSum = summaries[i]
          .replace(/^📊\s*TỔNG HỢP\s*/i, '')
          .replace(/^T\.HỢP\s*/i, '')
          .replace(/^TỔNG HỢP\s*/i, '')
          .trim();
        if (strippedSum.toLowerCase() === activeSheetName.toLowerCase()) {
          pairedSummary = summaries[i];
          break;
        }
      }
      if (!pairedSummary) pairedSummary = expectedSummary;
    }
  } else if (activeCat === 'summary_report') {
    pairedSummary = activeSheetName;
    pairedSource = ccFindSourceTitleForSummary_(activeSheetName, allSheetMetas);
  }

  // Fallback hợp lý nếu đang đứng ở tab hệ thống hoặc tab lịch
  if (!pairedSource) {
    if (sources.indexOf(CONFIG.SHEET_LOGS) >= 0) {
      pairedSource = CONFIG.SHEET_LOGS;
    } else if (sources.length > 0) {
      pairedSource = sources[0];
    }
  }
  if (!pairedSummary && pairedSource) {
    var candidate = '📊 TỔNG HỢP ' + pairedSource;
    pairedSummary = titles.indexOf(candidate) >= 0 ? candidate : (summaries[0] || candidate);
  }

  return {
    pairedSourceSheet: pairedSource,
    pairedSummarySheet: pairedSummary,
    pairedScheduleSheet: pairedSchedule,
    summaryExists: titles.indexOf(pairedSummary) >= 0
  };
}

/**
 * Chuẩn hóa tag ngày lễ sang định dạng DD/MM duy nhất (ví dụ "2/9" -> "02/09")
 */
function ccNormalizeDayTag(rawTag) {
  var s = String(rawTag || '').trim();
  var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-]\d{2,4})?$/);
  if (!m) return '';
  var dd = parseInt(m[1], 10);
  var mm = parseInt(m[2], 10);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return '';
  return String(dd).padStart(2, '0') + '/' + String(mm).padStart(2, '0');
}

/**
 * Khử trùng lặp danh sách ngày x2 và x3 (nếu cùng có mặt, ưu tiên mức mới/cao hơn ở x3)
 */
function ccSanitizeSpecialDays(x2List, x3List) {
  var x3Set = new Set();
  (Array.isArray(x3List) ? x3List : []).forEach(function(d) {
    var norm = ccNormalizeDayTag(d);
    if (norm) x3Set.add(norm);
  });

  var x2Set = new Set();
  (Array.isArray(x2List) ? x2List : []).forEach(function(d) {
    var norm = ccNormalizeDayTag(d);
    if (norm && !x3Set.has(norm)) x2Set.add(norm);
  });

  var sortChronological = function(a, b) {
    var pa = a.split('/');
    var pb = b.split('/');
    var ma = parseInt(pa[1], 10);
    var mb = parseInt(pb[1], 10);
    if (ma !== mb) return ma - mb;
    return parseInt(pa[0], 10) - parseInt(pb[0], 10);
  };

  return {
    x2Days: Array.from(x2Set).sort(sortChronological),
    x3Days: Array.from(x3Set).sort(sortChronological)
  };
}

/**
 * Mở Bảng Điều Khiển Chấm Công tức thì (<100ms):
 * Chỉ đọc duy nhất tên trang tính đang mở (activeSheet.getName()), không quét 131 sheet đồng bộ.
 */
function openAttendanceControlCenter(requestedTab) {
  var ui = getUI();
  if (!ui) {
    Logger.log('openAttendanceControlCenter: Chỉ khả dụng khi mở từ Google Sheets.');
    return;
  }

  var ss = getSS();
  var activeSheet = ss.getActiveSheet();
  var activeName = activeSheet ? activeSheet.getName() : '';
  var initialTab = resolveInitialTabForSheet(activeName, requestedTab);

  var tpl = HtmlService.createTemplateFromFile('AttendanceControlCenter');
  tpl.BOOT_ACTIVE_SHEET = JSON.stringify(activeName).replace(/</g, '\\u003c');
  tpl.BOOT_INITIAL_TAB = JSON.stringify(initialTab).replace(/</g, '\\u003c');

  var htmlOutput = tpl.evaluate()
    .setWidth(880)
    .setHeight(620);

  ui.showModalDialog(htmlOutput, "KING'S GRILL — Bảng Điều Khiển Chấm Công");
}

/**
 * Lưu danh sách metadata trang tính vào ScriptCache (TTL 45s)
 */
function ccSaveSheetMetasCache_(metas) {
  try {
    CacheService.getScriptCache().put(CC_METADATA_CACHE_KEY, JSON.stringify(metas), CC_METADATA_TTL_SECONDS);
  } catch (cacheErr) {}
}

/**
 * Đọc metadata toàn bộ 131+ trang tính qua 1 lệnh Sheets API v4 (kèm cache ngắn hạn 45s)
 */
function ccFetchAllSheetMetas(ss, forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = cache.get(CC_METADATA_CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
  }

  var ssId = ss.getId();
  var fallbackYear = new Date().getFullYear();
  var metas = [];

  var buildMetaObj = function(id, title, index, hidden, rowCount) {
    var enriched = classifySheetManagerMeta(title, fallbackYear);
    return {
      id: id,
      title: title,
      index: index,
      hidden: Boolean(hidden),
      rowCount: rowCount || 0,
      category: enriched.category,
      managerGroup: enriched.managerGroup,
      isPinned: enriched.isPinned,
      pinnedOrder: enriched.pinnedOrder,
      protected: enriched.protected,
      periodYear: enriched.periodYear,
      periodMonth: enriched.periodMonth,
      periodKey: enriched.periodKey,
      pairStem: enriched.pairStem
    };
  };

  try {
    var resp = Sheets.Spreadsheets.get(ssId, {
      fields: 'sheets(properties(sheetId,title,index,hidden,gridProperties(rowCount)))'
    });
    var rawSheets = (resp && resp.sheets) ? resp.sheets : [];
    metas = rawSheets.map(function(item) {
      var p = item.properties || {};
      var title = p.title || '';
      var rc = (p.gridProperties && p.gridProperties.rowCount) ? p.gridProperties.rowCount : 0;
      return buildMetaObj(p.sheetId, title, p.index || 0, Boolean(p.hidden), rc);
    });
  } catch (apiErr) {
    // Fallback an toàn nếu môi trường chưa bật dịch vụ nâng cao
    var fallbackSheets = ss.getSheets();
    metas = fallbackSheets.map(function(s, idx) {
      var t = s.getName();
      var isHid = (typeof s.isSheetHidden === 'function') ? Boolean(s.isSheetHidden()) : false;
      return buildMetaObj(s.getSheetId(), t, idx, isHid, 0);
    });
  }

  ccSaveSheetMetasCache_(metas);
  return metas;
}

/**
 * Đọc trạng thái tự động hóa + kiểm tra Trigger thực tế trên dự án
 */
function ccReadAutomationState() {
  var raw = getAutomationSettings();
  var triggerActive = false;
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === 'autoProcessDaily') {
        triggerActive = true;
        break;
      }
    }
  } catch (e) {}

  var emailStr = (raw && typeof raw.emails === 'string') ? raw.emails : CONFIG.EMAILS.join(', ');
  var emailArr = emailStr
    .split(/[,;\s]+/)
    .map(function(x) { return x.trim(); })
    .filter(function(x) { return x.indexOf('@') > 0; });

  var enabledFlag = (raw && typeof raw.enabled === 'boolean') ? raw.enabled : triggerActive;

  return {
    enabled: enabledFlag,
    triggerActive: triggerActive,
    hour: (raw && !isNaN(Number(raw.hour))) ? Number(raw.hour) : 1,
    emails: emailArr,
    targetSheet: AUTO_PROCESS_SHEET,
    lastRunStatus: (raw && raw.lastRunStatus) ? raw.lastRunStatus : 'Chưa chạy lần nào'
  };
}

/**
 * Bootstrap dữ liệu cho toàn bộ 5 tab chỉ trong 1 vòng gọi bất đồng bộ siêu nhẹ:
 * - Metadata 131+ trang tính + phân loại 5 nhóm (tận dụng ScriptCache 45s -> 0 HTTP call khi cache ấm)
 * - Ghép cặp thông minh Nguồn <-> Tổng hợp & Tháng/Năm (chỉ đọc 4 ô ngày mẫu C2:C5 khi tên sheet không ghi tháng)
 * - TUYỆT ĐỐI KHÔNG đọc bảng DATA ở bước khởi động (Tab 2 chỉ đọc đối chiếu khi mở), loại bỏ hoàn toàn độ trễ & rủi ro lộ dữ liệu
 * - Ngày lễ x2/x3 & Cấu hình tự động hóa
 */
function getControlCenterBootstrap(forceRefresh) {
  var ss = getSS();
  var ssId = ss.getId();
  var activeSheet = ss.getActiveSheet();
  var activeSheetName = activeSheet ? activeSheet.getName() : '';

  var metas = ccFetchAllSheetMetas(ss, Boolean(forceRefresh));
  var pairing = ccResolvePairedSheets(activeSheetName, metas);

  var currentYear = new Date().getFullYear();
  var periodTargetTitle = pairing.pairedSourceSheet || activeSheetName;
  var titleParsed = ccParseHistoricalPeriod(periodTargetTitle, currentYear);
  var sampleDateStr = '';

  // Chỉ gọi Values.batchGet đọc 4 ô ngày mẫu khi tên sheet chưa thể hiện rõ kỳ tháng (VD: ✔️CHẤM CÔNG)
  if ((!titleParsed.month || !titleParsed.year) && pairing.pairedSourceSheet) {
    try {
      var batchResp = Sheets.Spreadsheets.Values.batchGet(ssId, {
        ranges: [ccSafeA1Sheet(pairing.pairedSourceSheet) + '!C2:C5']
      });
      var vRanges = (batchResp && batchResp.valueRanges) ? batchResp.valueRanges : [];
      var sVals = (vRanges[0] && vRanges[0].values) ? vRanges[0].values : [];
      for (var sr = 0; sr < sVals.length; sr++) {
        if (sVals[sr] && sVals[sr][0]) {
          sampleDateStr = String(sVals[sr][0]);
          break;
        }
      }
    } catch (eBatch) {}
  }

  var inferredPeriod = (titleParsed.month && titleParsed.year)
    ? { month: titleParsed.month, year: titleParsed.year }
    : inferSheetMonthYear(periodTargetTitle, sampleDateStr, currentYear);
  var storedTags = getStoredSpecialDaysTags();
  var cleanTags = ccSanitizeSpecialDays(storedTags.x2Days || [], storedTags.x3Days || []);

  return {
    success: true,
    activeSheetName: activeSheetName,
    activeCategory: classifySheetTitle(activeSheetName),
    initialTab: resolveInitialTabForSheet(activeSheetName),
    totalSheetCount: metas.length,
    sheets: metas,
    pairedSourceSheet: pairing.pairedSourceSheet,
    pairedSummarySheet: pairing.pairedSummarySheet,
    pairedScheduleSheet: pairing.pairedScheduleSheet,
    summaryExists: pairing.summaryExists,
    inferredPeriod: inferredPeriod,
    specialDays: cleanTags,
    automation: ccReadAutomationState()
  };
}

/**
 * Tab 1 RPC: Lưu ngày lễ x2/x3 + Tổng hợp chấm công nguyên tử trong 1 lượt gọi duy nhất
 */
function rpcRunAttendanceSummary(payload) {
  if (!payload || !payload.sourceSheet) {
    throw new Error('Vui lòng chọn trang tính chấm công gốc trước khi tổng hợp.');
  }
  var sourceName = String(payload.sourceSheet).trim();
  var cat = classifySheetTitle(sourceName);
  if (cat === 'summary_report') {
    throw new Error('Trang tính "' + sourceName + '" là bản Báo Cáo Tổng Hợp. Vui lòng chọn sheet chấm công gốc (ví dụ T10 hoặc ✔️CHẤM CÔNG).');
  }
  if (cat === 'monthly_schedule') {
    throw new Error('Trang tính "' + sourceName + '" là bảng Lịch Làm Việc tháng, không phải dữ liệu log chấm công gốc.');
  }

  var ss = getSS();
  var sourceSheet = ss.getSheetByName(sourceName);
  if (!sourceSheet) {
    throw new Error('Không tìm thấy trang tính nguồn: "' + sourceName + '".');
  }

  var sanitized = ccSanitizeSpecialDays(payload.x2Days || [], payload.x3Days || []);
  saveSpecialDaysTags(sanitized.x2Days, sanitized.x3Days);

  var x2Str = sanitized.x2Days.join('\n');
  var x3Str = sanitized.x3Days.join('\n');
  processSelectedSheetEnhanced(sourceName, x2Str, x3Str);

  // Làm mới cache danh sách tab vì sheet 📊 TỔNG HỢP mới có thể vừa được tạo
  try {
    CacheService.getScriptCache().remove(CC_METADATA_CACHE_KEY);
  } catch (e) {}

  var targetSummaryName = '📊 TỔNG HỢP ' + sourceName;
  var summarySheet = ss.getSheetByName(targetSummaryName);
  if (payload.activateSummary !== false && summarySheet) {
    try {
      ss.setActiveSheet(summarySheet);
    } catch (eAct) {}
  }

  var summaryInfo = summarySheet ? getSummarySheetInfo(targetSummaryName) : { empCount: 0 };

  return {
    success: true,
    sourceSheet: sourceName,
    summarySheet: targetSummaryName,
    employeeCount: summaryInfo.empCount || 0,
    specialDays: sanitized,
    message: 'Đã tổng hợp hoàn tất từ "' + sourceName + '" sang "' + targetSummaryName + '"' +
      (summaryInfo.empCount ? ' (' + summaryInfo.empCount + ' nhân viên).' : '.')
  };
}

/**
 * Tab 2 RPC: Phân tích đối chiếu nhân sự giữa Sheet Tổng Hợp, Sheet Nguồn và DATA (100% qua metadata cache + 1 batchGet, 0 lần quét getSheets)
 */
function getSummaryTabContext(summarySheetName) {
  var ss = getSS();
  var ssId = ss.getId();
  var metas = ccFetchAllSheetMetas(ss, false);
  var requestedName = String(summarySheetName || '').trim();
  var actualName = requestedName;

  if (!actualName) {
    var activeSh = ss.getActiveSheet();
    actualName = activeSh ? activeSh.getName() : '';
  }

  var existsInMeta = metas.some(function(m) { return m.title === actualName; });
  if (!existsInMeta) {
    var fallbackSh = actualName ? ss.getSheetByName(actualName) : null;
    if (!fallbackSh) {
      return {
        success: false,
        exists: false,
        summarySheetName: requestedName,
        existingCount: 0,
        existingEmployees: [],
        missingWithLogs: [],
        missingFromData: []
      };
    }
    actualName = fallbackSh.getName();
  }

  var sourceName = ccFindSourceTitleForSummary_(actualName, metas);
  if (!sourceName) {
    var fallbackSource = getSourceSheetForSummarySheet(ss, actualName);
    sourceName = fallbackSource ? fallbackSource.getName() : '';
  }

  var ranges = [ccSafeA1Sheet(actualName) + '!A1:A3000'];
  if (sourceName) ranges.push(ccSafeA1Sheet(sourceName) + '!A2:A5000');
  var hasData = metas.some(function(m) { return m.title === CONFIG.SHEET_USERS; });
  if (hasData) ranges.push(ccSafeA1Sheet(CONFIG.SHEET_USERS) + '!C3:I250');

  var sumColA = [];
  var srcColA = [];
  var dataRows = [];

  try {
    var batch = Sheets.Spreadsheets.Values.batchGet(ssId, { ranges: ranges });
    var vr = (batch && batch.valueRanges) ? batch.valueRanges : [];
    sumColA = (vr[0] && vr[0].values) ? vr[0].values : [];
    var idx = 1;
    if (sourceName && vr[idx]) {
      srcColA = vr[idx].values || [];
      idx++;
    }
    if (hasData && vr[idx]) {
      dataRows = vr[idx].values || [];
    }
  } catch (e) {
    var sheet = ss.getSheetByName(actualName);
    var lr = sheet ? sheet.getLastRow() : 0;
    if (lr > 0) sumColA = sheet.getRange(1, 1, lr, 1).getValues();
    var sourceSheet = sourceName ? ss.getSheetByName(sourceName) : null;
    if (sourceSheet && sourceSheet.getLastRow() >= 2) {
      srcColA = sourceSheet.getRange(2, 1, sourceSheet.getLastRow() - 1, 1).getValues();
    }
    var ds = hasData ? ss.getSheetByName(CONFIG.SHEET_USERS) : null;
    if (ds && ds.getLastRow() >= 3) {
      dataRows = ds.getRange(3, 3, Math.min(248, ds.getLastRow() - 2), 7).getValues();
    }
  }

  // 1. Quét danh sách nhân viên đã có bảng trên Sheet Tổng Hợp
  var existingEmployees = [];
  var existingNormSet = new Set();
  var blankTableCount = 0;

  for (var r = 0; r < sumColA.length; r++) {
    var headerVal = String((sumColA[r] && sumColA[r][0]) || '').trim();
    if (headerVal.indexOf('NHÂN VIÊN') >= 0 && (headerVal.indexOf('👤') >= 0 || headerVal.indexOf('NHÂN VIÊN ') >= 0)) {
      var nameRowIdx = r + 2; // 0-based index cho dòng dữ liệu đầu tiên của bảng nhân viên
      var empVal = (sumColA[nameRowIdx] && sumColA[nameRowIdx][0]) ? String(sumColA[nameRowIdx][0]).trim() : '';
      if (!empVal || empVal === '(CHƯA NHẬP TÊN)' || empVal.indexOf('=') === 0) {
        // Thử tách tên từ dòng tiêu đề "👤 NHÂN VIÊN 1/37: TRẦN NGUYỄN ANH DŨNG" nếu ô A7 chưa đọc kịp
        var mTitle = headerVal.match(/NHÂN VIÊN\s+\d+(?:\/\d+)?\s*:\s*(.+)$/i);
        var fromHeader = mTitle ? mTitle[1].trim() : '';
        if (fromHeader && fromHeader.indexOf('CHƯA NHẬP TÊN') < 0) {
          existingEmployees.push(fromHeader);
          existingNormSet.add(normalizeEmployeeName(fromHeader));
        } else {
          blankTableCount++;
        }
      } else {
        existingEmployees.push(empVal);
        existingNormSet.add(normalizeEmployeeName(empVal));
      }
    }
  }

  // 2. Bản đồ chức vụ & nhân sự đang làm việc từ DATA
  var dataByNorm = new Map();
  for (var dr = 0; dr < dataRows.length; dr++) {
    var dRow = dataRows[dr] || [];
    var dName = String(dRow[0] || '').trim();
    if (!dName || dName.toUpperCase() === 'ADMIN') continue;
    var dPos = String(dRow[4] || '').trim() || 'Nhân viên';
    var dStatus = String(dRow[6] || '').trim();
    var fStatus = ccFoldText(dStatus);
    if (fStatus.indexOf('nghi') >= 0 || fStatus.indexOf('inactive') >= 0) continue;
    var nKey = normalizeEmployeeName(dName);
    if (!dataByNorm.has(nKey)) {
      dataByNorm.set(nKey, { fullName: dName, position: dPos });
    }
  }

  // 3. Đếm số lượt chấm công của từng người ở sheet nguồn nhưng CHƯA có mặt trên bảng Tổng Hợp
  var logCounts = new Map();
  var logDisplayNames = new Map();
  for (var sr = 0; sr < srcColA.length; sr++) {
    var rawLogName = String((srcColA[sr] && srcColA[sr][0]) || '').trim();
    if (!rawLogName) continue;
    var normLog = normalizeEmployeeName(rawLogName);
    if (existingNormSet.has(normLog)) continue;
    logCounts.set(normLog, (logCounts.get(normLog) || 0) + 1);
    if (!logDisplayNames.has(normLog)) {
      logDisplayNames.set(normLog, dataByNorm.has(normLog) ? dataByNorm.get(normLog).fullName : rawLogName);
    }
  }

  var missingWithLogs = [];
  logCounts.forEach(function(cnt, normKey) {
    var info = dataByNorm.get(normKey);
    missingWithLogs.push({
      fullName: logDisplayNames.get(normKey),
      position: info ? info.position : 'Chấm công ngoài DS',
      logCount: cnt
    });
  });
  missingWithLogs.sort(function(a, b) { return b.logCount - a.logCount; });

  var missingFromData = [];
  dataByNorm.forEach(function(info, normKey) {
    if (!existingNormSet.has(normKey) && !logCounts.has(normKey)) {
      missingFromData.push({
        fullName: info.fullName,
        position: info.position,
        logCount: 0
      });
    }
  });

  var period = inferSheetMonthYear(sourceName || actualName, '', new Date().getFullYear());

  return {
    success: true,
    exists: true,
    summarySheetName: actualName,
    sourceSheetName: sourceName,
    inferredMonth: period.month,
    inferredYear: period.year,
    existingCount: existingEmployees.length,
    blankTableCount: blankTableCount,
    existingEmployees: existingEmployees,
    missingWithLogs: missingWithLogs,
    missingFromData: missingFromData
  };
}

/**
 * Tab 2 RPC: Thêm bảng nhân viên mới (theo danh sách tên hoặc bảng trống) + tùy chọn tự đổ giờ công ngay
 */
function rpcAddAndPopulateEmployees(payload) {
  if (!payload || !payload.summarySheet) {
    throw new Error('Vui lòng chọn sheet Báo Cáo Tổng Hợp mục tiêu.');
  }
  var sheetName = String(payload.summarySheet).trim();
  var names = Array.isArray(payload.employeeNames)
    ? payload.employeeNames.map(function(n) { return String(n || '').trim(); }).filter(Boolean)
    : [];
  var count = names.length > 0 ? names.length : Math.max(1, parseInt(payload.blankCount || 1, 10));

  var addRes = addNewSummaryTables(
    sheetName,
    count,
    payload.customMonth ? parseInt(payload.customMonth, 10) : undefined,
    payload.customYear ? parseInt(payload.customYear, 10) : undefined,
    names.length > 0 ? names : undefined
  );

  var populatedCount = 0;
  if (names.length > 0 && payload.autoPopulate !== false) {
    var popRes = populateAllNewEmployeesInSummarySheet(sheetName);
    populatedCount = (popRes && popRes.updatedCount) ? popRes.updatedCount : 0;
  }

  return {
    success: true,
    addedCount: addRes && addRes.addedCount ? addRes.addedCount : count,
    populatedCount: populatedCount,
    message: names.length > 0
      ? ('Đã tạo bảng cho ' + names.length + ' nhân viên' +
        (payload.autoPopulate !== false ? ' và tự động nạp dữ liệu chấm công (' + populatedCount + ' bảng có dữ liệu).' : '.'))
      : (addRes && addRes.message ? addRes.message : ('Đã thêm ' + count + ' bảng trống.'))
  };
}

/**
 * Tab 2 RPC: Quét & nạp lại dữ liệu chấm công cho các bảng đã điền tên trên Sheet Tổng Hợp
 */
function rpcPopulateExistingSummaryTables(summarySheetName) {
  if (!summarySheetName) {
    throw new Error('Vui lòng chọn sheet Báo Cáo Tổng Hợp.');
  }
  return populateAllNewEmployeesInSummarySheet(String(summarySheetName).trim());
}

/**
 * Đọc nhanh ma trận hiển thị của trang tính Lịch Tháng bằng Sheets API v4 (fallback sang SpreadsheetApp nếu cần)
 */
function ccReadScheduleSheetDisplayRows_(ss, targetTitle, rangeCols) {
  var metas = ccFetchAllSheetMetas(ss, false);
  var resolvedName = String(targetTitle || '').trim();
  if (!resolvedName) {
    var activeSh = ss.getActiveSheet();
    resolvedName = activeSh ? activeSh.getName() : '';
  }

  var existsInMeta = metas.some(function(m) { return m.title === resolvedName; });
  if (!existsInMeta) {
    var shCheck = resolvedName ? ss.getSheetByName(resolvedName) : null;
    if (!shCheck) return { exists: false, sheetName: resolvedName, rows: [] };
    resolvedName = shCheck.getName();
  }

  try {
    var apiRes = Sheets.Spreadsheets.Values.get(
      ss.getId(),
      ccSafeA1Sheet(resolvedName) + '!' + (rangeCols || 'A1:H800'),
      { valueRenderOption: 'FORMATTED_VALUE' }
    );
    return {
      exists: true,
      sheetName: resolvedName,
      rows: (apiRes && apiRes.values) ? apiRes.values : []
    };
  } catch (eApi) {
    var shFallback = ss.getSheetByName(resolvedName);
    if (!shFallback) return { exists: false, sheetName: resolvedName, rows: [] };
    return {
      exists: true,
      sheetName: shFallback.getName(),
      rows: shFallback.getDataRange().getDisplayValues()
    };
  }
}

/**
 * Tab 3 RPC: Quét trước các khối tuần & đếm số lịch đã duyệt (┗) trong sheet Tháng MM/YYYY
 */
function getRosterSyncPreview(monthSheetName) {
  var ss = getSS();
  var target = String(monthSheetName || '').trim();
  var readRes = ccReadScheduleSheetDisplayRows_(ss, target, 'A1:B800');
  if (!readRes.exists) {
    return { success: false, monthSheet: target, weeks: [], message: 'Không tìm thấy sheet lịch tháng: ' + target };
  }

  var data = readRes.rows;
  var weeks = [];
  var current = null;

  for (var i = 0; i < data.length; i++) {
    var cell0 = data[i] && data[i][0] ? String(data[i][0]).trim() : '';
    if (!cell0) continue;
    if (cell0.indexOf('TUẦN ') >= 0) {
      if (current) weeks.push(current);
      var cleanWk = cell0.replace('📅', '').replace('TUẦN ', '').trim();
      current = {
        weekLabel: cleanWk,
        approvedCount: 0,
        registeredCount: 0
      };
    } else if (current && i > 0) {
      if (cell0.indexOf('┗') >= 0) {
        current.approvedCount++;
      } else if (cell0.toLowerCase() !== 'họ và tên') {
        current.registeredCount++;
      }
    }
  }
  if (current) weeks.push(current);

  return {
    success: true,
    monthSheet: readRes.sheetName,
    weeks: weeks
  };
}

/**
 * Tab 3 RPC: Đồng bộ các tuần đã tích chọn sang Sheet Lịch Làm (1Vrm...)
 */
function rpcSyncRosterWeeks(payload) {
  if (!payload || !payload.monthSheet) {
    throw new Error('Vui lòng chọn sheet lịch Tháng MM/YYYY cần đồng bộ.');
  }
  var ss = getSS();
  var readRes = ccReadScheduleSheetDisplayRows_(ss, String(payload.monthSheet).trim(), 'A1:H800');
  if (!readRes.exists) {
    throw new Error('Không tìm thấy sheet: ' + payload.monthSheet);
  }

  var selectedWeeks = Array.isArray(payload.weekLabels) ? payload.weekLabels : [];
  var data = readRes.rows;
  var weekBlocks = [];
  var currentWeek = null;

  for (var i = 0; i < data.length; i++) {
    var cell0 = data[i] && data[i][0] ? String(data[i][0]).trim() : '';
    if (cell0.indexOf('TUẦN ') >= 0) {
      if (currentWeek && currentWeek.schedules.length > 0) {
        weekBlocks.push(currentWeek);
      }
      var cleanWk = cell0.replace('📅', '').replace('TUẦN ', '').trim();
      currentWeek = { weekLabel: cleanWk, schedules: [] };
    } else if (currentWeek && cell0.indexOf('┗') >= 0) {
      var empName = cell0.replace('┗', '').trim();
      var shifts = [];
      for (var dc = 1; dc <= 7; dc++) {
        shifts.push((data[i] && data[i][dc]) ? String(data[i][dc]).trim() : 'OFF');
      }
      currentWeek.schedules.push({ fullname: empName, shifts: shifts });
    }
  }
  if (currentWeek && currentWeek.schedules.length > 0) {
    weekBlocks.push(currentWeek);
  }

  if (selectedWeeks.length > 0) {
    var allowed = new Set(selectedWeeks.map(function(w) { return String(w).trim(); }));
    weekBlocks = weekBlocks.filter(function(wb) { return allowed.has(wb.weekLabel); });
  }

  if (weekBlocks.length === 0) {
    throw new Error('Không có lịch đã duyệt (dòng ┗) nào trong các tuần đã chọn để đồng bộ.');
  }

  var totalSynced = 0;
  var syncedSheets = [];
  for (var w = 0; w < weekBlocks.length; w++) {
    var wb = weekBlocks[w];
    var res = syncApprovedSchedulesToExternalRoster({
      monthSheet: readRes.sheetName,
      weekLabel: wb.weekLabel,
      schedules: wb.schedules
    });
    if (res && res.success) {
      totalSynced += (res.syncedCount || 0);
      if (res.sheets) syncedSheets = syncedSheets.concat(res.sheets);
    }
  }

  return {
    success: true,
    totalSynced: totalSynced,
    syncedWeeks: weekBlocks.map(function(wb) { return wb.weekLabel; }),
    targetSheets: syncedSheets,
    message: 'Đã đồng bộ ' + totalSynced + ' lượt phân ca (' + weekBlocks.length + ' tuần) sang Sheet Lịch Làm.'
  };
}

/**
 * Phục hồi công thức ảnh #ERROR! và dấu chấm phẩy ';' cho bất kỳ sheet chấm công nào
 */
function ccHealCheckinImagesForSheet(targetSheetName) {
  var ss = getSS();
  var resolvedName = targetSheetName ? String(targetSheetName).trim() : CONFIG.SHEET_LOGS;

  // Nếu là sheet mặc định ✔️CHẤM CÔNG, gọi hàm chuẩn của Handlers.js và giải mã TextOutput JSON
  if (resolvedName === CONFIG.SHEET_LOGS && typeof handleDiagnoseAndHealImages === 'function') {
    var rawOut = handleDiagnoseAndHealImages({});
    if (rawOut && typeof rawOut.getContent === 'function') {
      var parsed = JSON.parse(rawOut.getContent());
      var d = parsed.data || {};
      return {
        success: Boolean(parsed.ok !== false),
        fixedCount: d.fixedCount || 0,
        sheetName: resolvedName,
        message: d.message || parsed.message || ('Đã rà soát link ảnh trên "' + resolvedName + '".')
      };
    }
  }

  var sheet = ss.getSheetByName(resolvedName);
  if (!sheet) throw new Error('Không tìm thấy trang tính chấm công: ' + resolvedName);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { success: true, fixedCount: 0, sheetName: resolvedName, message: 'Sheet "' + resolvedName + '" chưa có dữ liệu chấm công.' };
  }

  var scanCount = Math.min(lastRow - 1, 1500);
  var range = sheet.getRange(2, 1, scanCount, 8);
  var values = range.getValues();
  var formulas = range.getFormulas();
  var fixedCount = 0;
  var newFormulas = [];
  var newColH = [];
  var hasChanges = false;

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var colG = row[6] ? String(row[6]).trim() : '';
    var formulaG = (formulas[i] && formulas[i][6]) ? String(formulas[i][6]).trim() : '';
    var colH = row[7] ? String(row[7]).trim() : '';

    var targetUrl = '';
    var mForm = formulaG.match(/https?:\/\/drive\.google\.com\/[^\s"';,]+/);
    var mVal = colG.match(/https?:\/\/drive\.google\.com\/[^\s"';,]+/);
    if (mForm) targetUrl = mForm[0];
    else if (mVal) targetUrl = mVal[0];

    if (!targetUrl && colH.indexOf('drive.google.com') >= 0) {
      try {
        var pH = JSON.parse(colH);
        if (pH.linkAnh && pH.linkAnh.indexOf('drive.google.com') >= 0) targetUrl = pH.linkAnh.trim();
      } catch (eJson) {
        var mRaw = colH.match(/https?:\/\/drive\.google\.com\/[^\s"',}]+/);
        if (mRaw) targetUrl = mRaw[0];
      }
    }

    var formulaHasComma = formulaG.indexOf('",') >= 0 || (formulaG.indexOf('HYPERLINK(') >= 0 && formulaG.indexOf(';') < 0);
    var isBroken = colG.indexOf('#ERROR!') >= 0 || formulaG.indexOf('#ERROR!') >= 0 || formulaHasComma || colG === 'PENDING' || colG.indexOf('Đang tải ảnh') >= 0;

    var nextFormula = formulaG;
    var nextColH = colH;

    if (targetUrl) {
      var validHyperlink = '=HYPERLINK("' + targetUrl + '"; "📷 Xem ảnh")';
      if (formulaG !== validHyperlink || isBroken || colG === '') {
        nextFormula = validHyperlink;
        hasChanges = true;
        fixedCount++;
        try {
          var objH = colH ? JSON.parse(colH) : {};
          objH.linkAnh = targetUrl;
          nextColH = JSON.stringify(objH);
        } catch (eh) {}
      }
    } else if (isBroken && (colG === 'PENDING' || colG.indexOf('Đang tải ảnh') >= 0)) {
      nextFormula = '';
      hasChanges = true;
      fixedCount++;
    }

    newFormulas.push([nextFormula]);
    newColH.push([nextColH]);
  }

  if (hasChanges && values.length > 0) {
    sheet.getRange(2, 7, values.length, 1).setFormulas(newFormulas);
    sheet.getRange(2, 8, values.length, 1).setValues(newColH);
    SpreadsheetApp.flush();
  }

  return {
    success: true,
    fixedCount: fixedCount,
    sheetName: resolvedName,
    message: 'Đã phục hồi và chuẩn hóa ' + fixedCount + ' dòng link ảnh chấm công trên "' + resolvedName + '".'
  };
}

/**
 * Làm đẹp định dạng sheet chấm công bất kỳ không dùng hộp thoại chặn ui.alert
 */
function ccFormatCheckinSheetQuiet(targetSheetName) {
  var ss = getSS();
  var resolvedName = targetSheetName ? String(targetSheetName).trim() : CONFIG.SHEET_LOGS;
  var sheet = ss.getSheetByName(resolvedName);
  if (!sheet) throw new Error('Không tìm thấy sheet chấm công: ' + resolvedName);

  if (typeof formatCheckInHeader === 'function') {
    formatCheckInHeader(sheet);
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { success: true, rowsFormatted: 0, sheetName: resolvedName, message: 'Sheet "' + resolvedName + '" chưa có dòng dữ liệu nào.' };
  }

  normalizeTimeColumn(sheet);
  ccHealCheckinImagesForSheet(resolvedName);

  var rowsNum = lastRow - 1;
  var rangeObj = sheet.getRange(2, 1, rowsNum, 8);
  rangeObj.setBorder(true, true, true, true, true, true, '#cbd5e1', SpreadsheetApp.BorderStyle.SOLID);

  return {
    success: true,
    rowsFormatted: rowsNum,
    sheetName: resolvedName,
    message: 'Đã chuẩn hóa ngày giờ, link ảnh và kẻ khung chuyên nghiệp cho ' + rowsNum + ' dòng trên "' + resolvedName + '".'
  };
}

/**
 * Tab 3 RPC: Chạy các công cụ bảo trì an toàn với trang tính đích tường minh
 */
function rpcRunMaintenanceTool(payload) {
  if (!payload || !payload.tool) {
    throw new Error('Thiếu mã công cụ bảo trì.');
  }
  var tool = String(payload.tool);
  var target = payload.targetSheet ? String(payload.targetSheet).trim() : '';

  if (tool === 'repair_summary') {
    if (!target) throw new Error('Vui lòng chọn sheet Báo Cáo Tổng Hợp cần sửa công thức.');
    var rep = repairSummarySheetFormulas(target);
    return {
      success: Boolean(rep && rep.success !== false),
      sheetName: target,
      message: (rep && rep.message) ? rep.message : ('Đã chuẩn hóa công thức & khoảng cách bảng cho "' + target + '".')
    };
  }

  if (tool === 'heal_images') {
    return ccHealCheckinImagesForSheet(target || CONFIG.SHEET_LOGS);
  }

  if (tool === 'format_checkin') {
    return ccFormatCheckinSheetQuiet(target || CONFIG.SHEET_LOGS);
  }

  if (tool === 'migrate_data_headers') {
    var ss = getSS();
    var dataSheet = ss.getSheetByName(CONFIG.SHEET_USERS);
    if (!dataSheet) throw new Error('Không tìm thấy trang tính DATA.');
    migrateDataHeadersQuietly(dataSheet);
    return {
      success: true,
      sheetName: CONFIG.SHEET_USERS,
      message: 'Đã chuẩn hóa tiêu đề 2 dòng (Tiếng Việt & Thuật ngữ kỹ thuật) và cố định 2 dòng đầu cho sheet DATA.'
    };
  }

  throw new Error('Công cụ bảo trì không hợp lệ: ' + tool);
}

/**
 * Tab 4 RPC: Lưu cấu hình Tự Động Hóa (hỗ trợ bật/tạm dừng Trigger + khử trùng Email)
 */
function rpcSaveAutomationConfig(payload) {
  var enabled = payload ? Boolean(payload.enabled) : true;
  var hour = (payload && !isNaN(Number(payload.hour))) ? Math.max(0, Math.min(23, parseInt(payload.hour, 10))) : 1;
  var rawEmails = (payload && Array.isArray(payload.emails))
    ? payload.emails
    : String((payload && payload.emails) || '').split(/[,;\s]+/);

  var emailSet = new Set();
  rawEmails.forEach(function(em) {
    var clean = String(em || '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      emailSet.add(clean);
    }
  });
  var cleanEmails = Array.from(emailSet);
  if (enabled && cleanEmails.length === 0) {
    throw new Error('Vui lòng nhập ít nhất 1 địa chỉ email hợp lệ để nhận báo cáo tự động.');
  }

  var prev = getAutomationSettings();
  var record = {
    enabled: enabled,
    hour: hour,
    emails: cleanEmails.join(', '),
    lastRunStatus: (prev && prev.lastRunStatus) ? prev.lastRunStatus : 'Chưa chạy lần nào'
  };

  PropertiesService.getDocumentProperties().setProperty('AUTOMATION_SETTINGS', JSON.stringify(record));

  // Đồng bộ ScriptApp Triggers thực tế
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trg) {
    if (trg.getHandlerFunction && trg.getHandlerFunction() === 'autoProcessDaily') {
      ScriptApp.deleteTrigger(trg);
    }
  });

  if (enabled) {
    ScriptApp.newTrigger('autoProcessDaily')
      .timeBased()
      .everyDays(1)
      .atHour(hour)
      .create();
  }

  var updatedState = ccReadAutomationState();
  updatedState.message = enabled
    ? ('Đã bật tự động tổng hợp hàng ngày vào khung ' + String(hour).padStart(2, '0') + ':00 (' + cleanEmails.length + ' email nhận báo cáo).')
    : 'Đã tạm dừng lịch chạy tự động hàng ngày.';
  return updatedState;
}

/**
 * Tab 4 RPC: Chạy thử tổng hợp & gửi email báo cáo ngay lập tức
 */
function rpcRunAutomationTestNow() {
  autoProcessDaily();
  var state = ccReadAutomationState();
  return {
    success: state.lastRunStatus.indexOf('Thất bại') < 0,
    automation: state,
    message: 'Đã thực thi chạy thử: ' + state.lastRunStatus
  };
}

/**
 * Tính toán thứ tự sắp xếp chuẩn từ trái sang phải (cũ nhất nằm bên phải):
 * - Khối 0 (cố định vị trí 0, 1, 2): THÔNG TIN -> DATA -> ✔️CHẤM CÔNG
 * - Khối Lịch làm riêng (mới -> cũ) & Khối Chấm công + Tổng hợp riêng ghép cặp theo kỳ tháng (mới -> cũ)
 * - Khối Hệ thống & Cấu hình (⚙️ CẤU HÌNH đầu khối, sau đó A-Z)
 * - Khối Bản sao / Tuần lẻ / Nháp cũ nằm ngoài cùng bên phải
 */
function computeSortedSheetsOrder(sheetMetas, options) {
  var primaryBlock = (options && options.primaryBlock === 'attendance_first') ? 'attendance_first' : 'schedule_first';
  var fallbackYear = new Date().getFullYear();

  var items = (Array.isArray(sheetMetas) ? sheetMetas : []).map(function(s, idx) {
    if (s && s.managerGroup) return s;
    var enriched = classifySheetManagerMeta(s ? s.title : '', fallbackYear);
    return {
      id: s.id,
      title: s.title,
      index: s.index !== undefined ? s.index : idx,
      hidden: Boolean(s.hidden),
      rowCount: s.rowCount || 0,
      category: enriched.category,
      managerGroup: enriched.managerGroup,
      isPinned: enriched.isPinned,
      pinnedOrder: enriched.pinnedOrder,
      protected: enriched.protected,
      periodYear: enriched.periodYear,
      periodMonth: enriched.periodMonth,
      periodKey: enriched.periodKey,
      pairStem: enriched.pairStem
    };
  });

  // 0. Khối ghim cố định đầu tiên: THÔNG TIN (0), DATA (1), ✔️CHẤM CÔNG (2)
  var pinned = items
    .filter(function(s) { return s.managerGroup === 'pinned'; })
    .sort(function(a, b) { return a.pinnedOrder - b.pinnedOrder; });

  // 1. Khối Lịch làm riêng biệt (mới nhất bên trái -> cũ nhất bên phải)
  var schedule = items
    .filter(function(s) { return s.managerGroup === 'schedule'; })
    .sort(function(a, b) {
      var ya = a.periodYear || 0;
      var yb = b.periodYear || 0;
      if (ya !== yb) return yb - ya;
      var ma = a.periodMonth || 0;
      var mb = b.periodMonth || 0;
      if (ma !== mb) return mb - ma;
      var slashA = a.title.indexOf('/') >= 0 ? 0 : (a.title.indexOf('-') >= 0 ? 1 : 2);
      var slashB = b.title.indexOf('/') >= 0 ? 0 : (b.title.indexOf('-') >= 0 ? 1 : 2);
      if (slashA !== slashB) return slashA - slashB;
      if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
      return b.title.length - a.title.length || a.title.localeCompare(b.title, 'vi');
    });

  // 2. Khối Chấm công & Tổng hợp chấm công riêng biệt, nằm chung từng kỳ tháng từ mới đến cũ
  var attAll = items.filter(function(s) { return s.managerGroup === 'attendance_pair'; });
  var attLive = attAll
    .filter(function(s) { return !s.periodYear || !s.periodMonth; })
    .sort(function(a, b) {
      var prio = function(x) {
        var n = ccNormalizeTitleNFC(x.title);
        if (n === '📊 TỔNG HỢP ✔️CHẤM CÔNG') return 0;
        if (n === '👨‍🍳 CHẤM CÔNG BẾP - TẠP VỤ') return 1;
        return 2;
      };
      var pa = prio(a);
      var pb = prio(b);
      if (pa !== pb) return pa - pb;
      if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
      return a.title.localeCompare(b.title, 'vi');
    });

  var attDated = attAll.filter(function(s) { return s.periodYear && s.periodMonth; });
  var periodMap = new Map();
  attDated.forEach(function(s) {
    var pk = s.periodKey;
    if (!periodMap.has(pk)) {
      periodMap.set(pk, { year: s.periodYear, month: s.periodMonth, list: [] });
    }
    periodMap.get(pk).list.push(s);
  });

  var sortedPeriods = Array.from(periodMap.values()).sort(function(a, b) {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  var attPairedDated = [];
  sortedPeriods.forEach(function(pGroup) {
    var stemMap = new Map();
    pGroup.list.forEach(function(s) {
      var st = s.pairStem || ccNormalizeTitleNFC(s.title).toUpperCase();
      if (!stemMap.has(st)) {
        stemMap.set(st, []);
      }
      stemMap.get(st).push(s);
    });

    var stemGroups = Array.from(stemMap.entries()).map(function(entry) {
      var stemKey = entry[0];
      var members = entry[1].slice().sort(function(a, b) {
        var ra = a.category === 'summary_report' ? 0 : 1;
        var rb = b.category === 'summary_report' ? 0 : 1;
        if (ra !== rb) return ra - rb;
        if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
        return a.index - b.index;
      });
      var hasVisible = members.some(function(m) { return !m.hidden; });
      var isShortT = /^T\d{1,2}$/.test(stemKey) ? 0 : 1;
      return {
        stemKey: stemKey,
        hasVisible: hasVisible,
        isShortT: isShortT,
        members: members
      };
    });

    stemGroups.sort(function(a, b) {
      if (a.hasVisible !== b.hasVisible) return a.hasVisible ? -1 : 1;
      if (a.isShortT !== b.isShortT) return a.isShortT - b.isShortT;
      return a.stemKey.localeCompare(b.stemKey, 'vi');
    });

    stemGroups.forEach(function(g) {
      g.members.forEach(function(m) { attPairedDated.push(m); });
    });
  });

  var attendancePairBlock = attLive.concat(attPairedDated);

  // 3. Khối Hệ thống & Cấu hình (⚙️ CẤU HÌNH đầu tiên, sau đó A-Z)
  var systemCore = items
    .filter(function(s) { return s.managerGroup === 'system_core'; })
    .sort(function(a, b) {
      var ca = ccFoldText(a.title).replace(/^[^a-z0-9]+/i, '');
      var cb = ccFoldText(b.title).replace(/^[^a-z0-9]+/i, '');
      if (ca === 'cau hinh' && cb !== 'cau hinh') return -1;
      if (cb === 'cau hinh' && ca !== 'cau hinh') return 1;
      return ca.localeCompare(cb, 'vi');
    });

  // 4. Khối Bản sao, Tuần lẻ & Nháp cũ dồn về ngoài cùng bên phải
  var archiveOrCopy = items
    .filter(function(s) { return s.managerGroup === 'archive_or_copy'; })
    .sort(function(a, b) {
      var rankArchive = function(t) {
        var f = ccFoldText(t).replace(/^[^a-z0-9]+/i, '').trim();
        if (/^w\d{2}\s*-\s*\d{2}/i.test(t)) return 0;
        if (f.indexOf('sao luu') === 0 || f.indexOf('ban sao luu') === 0) return 1;
        if (f.indexOf('ban sao cua') === 0 || f.indexOf('copy of ') === 0) return 2;
        if (f.indexOf('du lieu goc') === 0) return 3;
        if (ccFoldText(t).indexOf('trang tinh') >= 0) return 4;
        return 5;
      };
      var ra = rankArchive(a.title);
      var rb = rankArchive(b.title);
      if (ra !== rb) return ra - rb;
      return a.title.localeCompare(b.title, 'vi');
    });

  if (primaryBlock === 'attendance_first') {
    return pinned.concat(attendancePairBlock, schedule, systemCore, archiveOrCopy);
  }
  return pinned.concat(schedule, attendancePairBlock, systemCore, archiveOrCopy);
}

/**
 * Tab 5 RPC: Sắp xếp toàn bộ 146+ trang tính chỉ bằng 1 lệnh Sheets.Spreadsheets.batchUpdate siêu tốc
 * (Cập nhật trực tiếp bộ nhớ đệm sau batchUpdate — tiết kiệm 100% lượt gọi Spreadsheets.get lần 2)
 */
function rpcReorderSheetsV4(payload) {
  var primaryBlock = (payload && payload.primaryBlock === 'attendance_first') ? 'attendance_first' : 'schedule_first';
  var ss = getSS();
  var ssId = ss.getId();
  var currentMetas = ccFetchAllSheetMetas(ss, true);
  var ordered = computeSortedSheetsOrder(currentMetas, { primaryBlock: primaryBlock });

  var movedCount = 0;
  for (var i = 0; i < ordered.length; i++) {
    if (ordered[i].index !== i) movedCount++;
  }

  if (ordered.length > 0 && movedCount > 0) {
    var requests = ordered.map(function(s, targetIdx) {
      return {
        updateSheetProperties: {
          properties: { sheetId: s.id, index: targetIdx },
          fields: 'index'
        }
      };
    });
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, ssId);
  }

  var updatedSheets = ordered.map(function(s, idx) {
    return Object.assign({}, s, { index: idx });
  });
  ccSaveSheetMetasCache_(updatedSheets);

  return {
    success: true,
    primaryBlock: primaryBlock,
    movedCount: movedCount,
    orderedTitles: updatedSheets.map(function(s) { return s.title; }),
    sheets: updatedSheets,
    message: 'Đã sắp xếp toàn bộ ' + updatedSheets.length + ' trang tính chuẩn thứ tự (ghim cố định THÔNG TIN, DATA, ✔️CHẤM CÔNG ở đầu).'
  };
}

/**
 * Tab 5 RPC: Ẩn / Hiện hàng loạt hoặc Dọn gọn thanh tab thông minh (smart_tidy) bằng 1 lệnh batchUpdate
 */
function rpcSetSheetsVisibilityV4(payload) {
  var ss = getSS();
  var ssId = ss.getId();
  var currentMetas = ccFetchAllSheetMetas(ss, true);
  var mode = payload && payload.mode ? String(payload.mode) : '';
  var nextHiddenMap = new Map();
  var keptVisibleTitle = '';

  if (mode === 'smart_tidy') {
    var latestPeriodsForGroup = function(grp) {
      var keys = [];
      currentMetas.forEach(function(s) {
        if (s.managerGroup === grp && s.periodKey && keys.indexOf(s.periodKey) < 0) {
          keys.push(s.periodKey);
        }
      });
      keys.sort().reverse();
      return keys.slice(0, 2);
    };
    var keepSchedPeriods = latestPeriodsForGroup('schedule');
    var keepAttPeriods = latestPeriodsForGroup('attendance_pair');

    currentMetas.forEach(function(s) {
      var normT = ccNormalizeTitleNFC(s.title);
      var shouldShow = false;
      if (s.isPinned) {
        shouldShow = true;
      } else if (normT === '📊 TỔNG HỢP ✔️CHẤM CÔNG' || normT === '👨‍🍳 CHẤM CÔNG BẾP - TẠP VỤ') {
        shouldShow = true;
      } else if (s.managerGroup === 'schedule' && s.periodKey && keepSchedPeriods.indexOf(s.periodKey) >= 0) {
        shouldShow = true;
      } else if (s.managerGroup === 'attendance_pair' && s.periodKey && keepAttPeriods.indexOf(s.periodKey) >= 0) {
        shouldShow = true;
      }
      nextHiddenMap.set(s.id, !shouldShow);
    });
  } else {
    var rawIds = (payload && Array.isArray(payload.sheetIds)) ? payload.sheetIds : [];
    var targetIds = new Set(
      rawIds
        .filter(function(x) { return x !== null && x !== '' && x !== undefined && Number.isFinite(Number(x)); })
        .map(function(x) { return Number(x); })
    );
    var wantHidden = Boolean(payload && payload.hidden);

    currentMetas.forEach(function(s) {
      if (targetIds.has(Number(s.id))) {
        nextHiddenMap.set(s.id, wantHidden);
      } else {
        nextHiddenMap.set(s.id, Boolean(s.hidden));
      }
    });
  }

  // Bảo vệ bất biến Google Sheets: Không bao giờ để toàn bộ bảng tính có 0 sheet hiển thị
  var visibleCountAfter = 0;
  currentMetas.forEach(function(s) {
    if (!nextHiddenMap.get(s.id)) visibleCountAfter++;
  });

  if (visibleCountAfter === 0 && currentMetas.length > 0) {
    var fallbackVisible = currentMetas.find(function(s) { return ccNormalizeTitleNFC(s.title) === 'THÔNG TIN'; }) || currentMetas[0];
    nextHiddenMap.set(fallbackVisible.id, false);
    keptVisibleTitle = fallbackVisible.title;
  }

  var requests = [];
  currentMetas.forEach(function(s) {
    var desiredHidden = Boolean(nextHiddenMap.get(s.id));
    if (Boolean(s.hidden) !== desiredHidden) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: s.id, hidden: desiredHidden },
          fields: 'hidden'
        }
      });
    }
  });

  if (requests.length > 0) {
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, ssId);
  }

  var updatedSheets = currentMetas.map(function(s) {
    return Object.assign({}, s, { hidden: Boolean(nextHiddenMap.get(s.id)) });
  });
  ccSaveSheetMetasCache_(updatedSheets);

  var visibleNow = updatedSheets.filter(function(s) { return !s.hidden; }).length;
  var msg = mode === 'smart_tidy'
    ? ('Đã dọn gọn thanh tab: giữ hiển thị ' + visibleNow + ' trang tính trọng tâm (3 sheet ghim đầu + 2 kỳ gần nhất), ẩn các sheet cũ & hệ thống.')
    : ('Đã cập nhật trạng thái hiển thị cho ' + requests.length + ' trang tính' +
      (keptVisibleTitle ? ' (giữ lại "' + keptVisibleTitle + '" vì bảng tính cần tối thiểu 1 sheet hiển thị).' : '.'));

  return {
    success: true,
    mode: mode || (Boolean(payload && payload.hidden) ? 'hide' : 'show'),
    updatedCount: requests.length,
    hidden: Boolean(payload && payload.hidden),
    keptVisibleTitle: keptVisibleTitle,
    sheets: updatedSheets,
    message: msg
  };
}

/**
 * Tab 5 RPC: Xóa hàng loạt trang tính bằng 1 lệnh batchUpdate kèm Khóa bảo vệ cứng cho toàn bộ bảng lõi WebApp
 */
function rpcDeleteSheetsV4(payload) {
  var rawIds = (payload && Array.isArray(payload.sheetIds)) ? payload.sheetIds : [];
  if (rawIds.length === 0) {
    throw new Error('Vui lòng chọn ít nhất 1 trang tính cần xóa.');
  }

  var ss = getSS();
  var ssId = ss.getId();
  var currentMetas = ccFetchAllSheetMetas(ss, true);
  var targetIdSet = new Set(
    rawIds
      .filter(function(x) { return x !== null && x !== '' && x !== undefined && Number.isFinite(Number(x)); })
      .map(function(x) { return Number(x); })
  );

  var skippedProtected = [];
  var deletable = [];

  currentMetas.forEach(function(s) {
    if (!targetIdSet.has(Number(s.id))) return;
    if (s.protected || isProtectedSystemSheet(s.title)) {
      skippedProtected.push(s.title);
    } else {
      deletable.push(s);
    }
  });

  if (deletable.length === 0) {
    if (skippedProtected.length > 0) {
      throw new Error('Các trang tính đã chọn thuộc diện Khóa bảo vệ hệ thống (' + skippedProtected.join(', ') + '), tuyệt đối không thể xóa.');
    }
    throw new Error('Không tìm thấy trang tính hợp lệ để xóa.');
  }

  var deletableIds = new Set(deletable.map(function(s) { return Number(s.id); }));
  var remaining = currentMetas.filter(function(s) { return !deletableIds.has(Number(s.id)); });
  if (remaining.length === 0) {
    throw new Error('Không thể xóa toàn bộ trang tính trong bảng tính.');
  }

  var requests = [];
  var rescuedSheetId = null;
  // Nếu tất cả trang tính còn lại đều đang ẩn, tự động bật hiển thị 1 trang tính trước khi xóa
  var remainingVisible = remaining.filter(function(s) { return !s.hidden; });
  if (remainingVisible.length === 0) {
    var rescueSheet = remaining.find(function(s) { return ccNormalizeTitleNFC(s.title) === 'THÔNG TIN'; }) || remaining[0];
    rescuedSheetId = rescueSheet.id;
    requests.push({
      updateSheetProperties: {
        properties: { sheetId: rescueSheet.id, hidden: false },
        fields: 'hidden'
      }
    });
  }

  deletable.forEach(function(s) {
    requests.push({
      deleteSheet: { sheetId: s.id }
    });
  });

  Sheets.Spreadsheets.batchUpdate({ requests: requests }, ssId);

  var updatedSheets = remaining.map(function(s, idx) {
    return Object.assign({}, s, {
      index: idx,
      hidden: (rescuedSheetId !== null && s.id === rescuedSheetId) ? false : Boolean(s.hidden)
    });
  });
  ccSaveSheetMetasCache_(updatedSheets);

  var deletedTitles = deletable.map(function(s) { return s.title; });
  return {
    success: true,
    deletedCount: deletedTitles.length,
    deletedTitles: deletedTitles,
    skippedProtected: skippedProtected,
    sheets: updatedSheets,
    message: 'Đã xóa vĩnh viễn ' + deletedTitles.length + ' trang tính' +
      (skippedProtected.length > 0 ? ' (đã tự động bỏ qua ' + skippedProtected.length + ' sheet Khóa bảo vệ).' : '.')
  };
}
