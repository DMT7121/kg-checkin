/**
 * Engine.gs - LOGIC XỬ LÝ CHÍNH & UTILITIES
 * PHIÊN BẢN: 3.0 (MERGED & FIXED)
 *
 * BUG FIXES trong file này:
 * 1. setBackgrounds() không chấp nhận null → đổi default thành '#ffffff'
 * 2. setFontWeights() không chấp nhận null → đổi default thành 'normal'
 * 3. ss.moveSheet() không tồn tại trong GAS API → dùng moveActiveSheet()
 * 4. Array(rows).fill(Array(cols).fill(...)) tạo shared reference → dùng .map()
 * 5. setVerticalAlignments shared ref → fix bằng .map()
 * 6. Thêm try-catch bảo vệ cho các thao tác format để không crash toàn bộ
 */

// =====================================================================================
// 6. LOGIC XỬ LÝ CHÍNH (CORE ENGINE) - OPTIMIZED
// =====================================================================================

function processSelectedSheetEnhanced(selectedSheetName, x2DaysStr, x3DaysStr) {
  if (x2DaysStr === undefined) x2DaysStr = '';
  if (x3DaysStr === undefined) x3DaysStr = '';
  if (!selectedSheetName) throw new Error('Chưa chọn sheet nguồn.');

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(selectedSheetName);
  if (!sheet) throw new Error('Không tìm thấy sheet: \'' + selectedSheetName + '\'');

  // 0. AUTO-NORMALIZE: DD/MM/YYYY HH:MM → DD/MM/YYYY HH:MM:SS
  normalizeTimeColumn(sheet);

  // 1. Batch Read (after normalization)
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  var currentYear = new Date().getFullYear();
  var x2Days = parseSpecialDaysForCurrentYear(x2DaysStr, currentYear);
  var x3Days = parseSpecialDaysForCurrentYear(x3DaysStr, currentYear);

  // 2. Pure JS Processing
  var processedData = processTimesheetDataWithDominantMonth(data);

  // 3. Batch Write & Format
  generateAndWriteSummarySheet(ss, selectedSheetName, processedData, x2Days, x3Days);
}

/**
 * Auto-normalize thời gian cột C (index 2)
 * DD/MM/YYYY HH:MM → DD/MM/YYYY HH:MM:SS (thêm :00)
 * Chỉ sửa những ô cần thiết để giữ tính nhất quán
 */
function normalizeTimeColumn(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var range = sheet.getRange(2, 3, lastRow - 1, 1); // Cột C, từ dòng 2
  var values = range.getValues();
  var updated = false;
  var newValues = [];
  for (var i = 0; i < values.length; i++) {
    var cell = values[i][0];
    if (typeof cell === 'string' && cell.trim()) {
      // Match DD/MM/YYYY HH:MM (thiếu giây)
      var m = cell.trim().match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})$/);
      if (m) {
        newValues.push([m[1] + ' ' + m[2] + ':00']);
        updated = true;
      } else {
        newValues.push([cell]);
      }
    } else {
      newValues.push([cell]);
    }
  }
  if (updated) {
    range.setValues(newValues);
    Logger.log('✅ Đã chuẩn hóa thời gian cột C: DD/MM/YYYY HH:MM → DD/MM/YYYY HH:MM:SS');
  }
}

// -------------------------------------------------------------------------------------
// Logic phân tích dữ liệu
// -------------------------------------------------------------------------------------
function processTimesheetDataWithDominantMonth(data) {
  var timesheet = new Map();
  var monthAttendanceCounts = new Map();
  var monthDateCounts = new Map();

  for (var i = 1; i < data.length; i++) {
    var name = data[i][0];
    var status = data[i][1];
    var timeStr = data[i][2];
    if (!name || !status || !timeStr) continue;

    // Hỗ trợ cả Date object lẫn string DD/MM/YYYY HH:MM:SS hoặc DD/MM/YYYY HH:MM
    var time;
    if (timeStr instanceof Date) {
      time = timeStr;
    } else if (typeof timeStr === 'string') {
      // Luôn ưu tiên parseDDMMYYYY trước để tránh new Date() hiểu sai DD/MM thành MM/DD
      time = parseDDMMYYYY(timeStr);
      // Fallback sang new Date() nếu parseDDMMYYYY không parse được
      if (!time) {
        time = new Date(timeStr);
      }
    } else {
      time = new Date(timeStr);
    }
    if (!time || isNaN(time.getTime())) continue;

    var timeZone = Session.getScriptTimeZone();
    var date = Utilities.formatDate(time, timeZone, 'dd/MM/yyyy');
    var timeFormatted = Utilities.formatDate(time, timeZone, 'HH:mm');
    var monthYear = Utilities.formatDate(time, timeZone, 'yyyy-MM');

    monthAttendanceCounts.set(monthYear, (monthAttendanceCounts.get(monthYear) || 0) + 1);

    if (!monthDateCounts.has(monthYear)) monthDateCounts.set(monthYear, new Set());
    monthDateCounts.get(monthYear).add(date);

    if (!timesheet.has(name)) timesheet.set(name, new Map());

    var datesMap = timesheet.get(name);
    if (!datesMap.has(date)) datesMap.set(date, []);
    datesMap.get(date).push({ status: status, time: timeFormatted, originalTime: time });
  }

  // Xác định tháng chủ đạo
  var dominantMonth = '';
  var maxAttendanceCount = 0;
  for (var entry of monthAttendanceCounts.entries()) {
    var mY = entry[0];
    var cnt = entry[1];
    if (cnt > maxAttendanceCount) {
      maxAttendanceCount = cnt;
      dominantMonth = mY;
    }
  }

  if (!dominantMonth) throw new Error('Không có dữ liệu hợp lệ.');

  var parts = dominantMonth.split('-');
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  var daysInMonth = new Date(year, month, 0).getDate();

  return { timesheet: timesheet, dominantMonth: dominantMonth, year: year, month: month, daysInMonth: daysInMonth };
}

// -------------------------------------------------------------------------------------
// Batch Processing Engine
// -------------------------------------------------------------------------------------

function generateAndWriteSummarySheet(ss, sourceName, processedData, x2Days, x3Days) {
  var timesheet = processedData.timesheet;
  var year = processedData.year;
  var month = processedData.month;
  var daysInMonth = processedData.daysInMonth;
  var targetName = '📊 TỔNG HỢP ' + sourceName;
  var generatedTime = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

  // Xóa/Tạo sheet mới
  var targetSheet = ss.getSheetByName(targetName);
  if (targetSheet) ss.deleteSheet(targetSheet);
  targetSheet = ss.insertSheet(targetName);

  // FIX: ss.moveSheet() không tồn tại → dùng moveActiveSheet()
  try {
    var dataSheet = ss.getSheetByName('DATA');
    if (dataSheet) {
      targetSheet.activate();
      ss.moveActiveSheet(dataSheet.getIndex() + 1);
    }
  } catch (e) {
    Logger.log('Không thể di chuyển sheet: ' + e.message);
  }

  // ---- KHỞI TẠO MẢNG DỮ LIỆU LỚN (BATCH ARRAYS) ----
  var allValues = [];
  var styleMeta = [];
  var currentRow = 0; // 0-indexed cho mảng

  // ═══ PREMIUM REPORT HEADER ═══
  // Row 1: Company branding
  allValues.push([
    "KING'S GRILL — HỆ THỐNG CHẤM CÔNG NHÂN SỰ",
    '', '', '', '', '', '', '', '', '', ''
  ]);
  styleMeta.push({ r: currentRow, c: 0, type: 'brandHeader' });
  currentRow++;

  // Row 2: Report title
  allValues.push([
    '📊 BÁO CÁO TỔNG HỢP CHẤM CÔNG — THÁNG ' + month + '/' + year,
    '', '', '', '', '', '', '', '', '', ''
  ]);
  styleMeta.push({ r: currentRow, c: 0, type: 'reportHeader' });
  currentRow++;

  // Row 3: Report metadata
  allValues.push([
    '📋 Nguồn: ' + sourceName + '  |  📆 Kỳ: Tháng ' + month + '/' + year + '  |  🕐 Tạo lúc: ' + generatedTime + '  |  👥 Nhân viên: ' + timesheet.size,
    '', '', '', '', '', '', '', '', '', ''
  ]);
  styleMeta.push({ r: currentRow, c: 0, type: 'reportMeta' });
  currentRow++;

  allValues.push(createEmptyRow()); // Empty row
  currentRow++;

  // 2. PROCESS EMPLOYEES
  var empIndex = 0;
  var timesheetSize = timesheet.size;

  for (var entry of timesheet.entries()) {
    var empName = entry[0];
    var datesMap = entry[1];
    empIndex++;

    // Header NV - Premium
    allValues.push([
      '👤 NHÂN VIÊN ' + empIndex + '/' + timesheetSize + ': ' + empName.toUpperCase(),
      '', '', '', '', '', '', '', '', '', ''
    ]);
    styleMeta.push({ r: currentRow, c: 0, type: 'empHeader' });
    currentRow++;

    // Column Header
    allValues.push(['Họ và Tên', 'Ngày', 'Vào #', 'Ra #', 'Vào 1', 'Ra 1', 'Vào 2', 'Ra 2', 'Giờ Tăng Ca', 'Giờ Theo Ca', 'Hệ Số']);
    styleMeta.push({ r: currentRow, c: 0, type: 'colHeader' });
    currentRow++;

    var startDataRow = currentRow;

    // --- Generate Rows ---
    var processedDates = new Set();
    var rowsBuffer = [];

    for (var d = 1; d <= daysInMonth; d++) {
      var dateObj = new Date(Date.UTC(year, month - 1, d));
      var dateStr = formatDateUTC(dateObj);
      processedDates.add(dateStr);
      rowsBuffer.push(createRowData(empName, dateStr, dateObj, datesMap, x2Days, x3Days));
    }

    // Additional Days (ngoài tháng chủ đạo)
    for (var dk of datesMap.keys()) {
      if (!processedDates.has(dk)) {
        var dateObj2 = parseDateUTC(dk);
        rowsBuffer.push(createRowData(empName, dk, dateObj2, datesMap, x2Days, x3Days));
      }
    }

    // Sort & Push
    rowsBuffer.sort(function(a, b) { return a.sortTime - b.sortTime; });

    for (var ri = 0; ri < rowsBuffer.length; ri++) {
      var item = rowsBuffer[ri];
      var sheetRow = currentRow + 1; // Sheet is 1-indexed
      var finalRow = item.values.slice(); // Clone array

      // Inject Dynamic Formulas
      // Giờ Tăng Ca (Col I - index 8)
      finalRow[8] = '=IF(AND(C' + sheetRow + '="";D' + sheetRow + '="");"-";IF((OR(C' + sheetRow + '=D' + sheetRow + ';C' + sheetRow + '="";D' + sheetRow + '=""));"KIỂM TRA";IF((D' + sheetRow + '-C' + sheetRow + ')*24*K' + sheetRow + '>0;((D' + sheetRow + '-C' + sheetRow + ')*24*K' + sheetRow + ');(((D' + sheetRow + '-C' + sheetRow + ')*24*K' + sheetRow + ')+24))))';

      // Giờ Theo Ca (Col J - index 9)
      finalRow[9] = '=IF(AND(E' + sheetRow + '="";F' + sheetRow + '="");"OFF";IF((OR(E' + sheetRow + '=F' + sheetRow + ';E' + sheetRow + '="";F' + sheetRow + '=""));"KIỂM TRA";IF(((H' + sheetRow + '-G' + sheetRow + ')+(F' + sheetRow + '-E' + sheetRow + '))*24*K' + sheetRow + '>0;(((H' + sheetRow + '-G' + sheetRow + ')+(F' + sheetRow + '-E' + sheetRow + '))*24*K' + sheetRow + ');(((H' + sheetRow + '-G' + sheetRow + ')+(F' + sheetRow + '-E' + sheetRow + '))*24*K' + sheetRow + ')+24)))';

      allValues.push(finalRow);

      if (item.isWeekend) styleMeta.push({ r: currentRow, c: 1, type: 'weekend' });
      if (item.specialType) styleMeta.push({ r: currentRow, c: 1, type: item.specialType, note: item.note });

      currentRow++;
    }

    var endDataRow = currentRow - 1;
    styleMeta.push({ r: startDataRow, rEnd: endDataRow, type: 'dataTableBody' });

    // Integrated Summary
    var sumStartRow = startDataRow + 1; // 1-based cho formula (dòng data đầu tiên)
    var sumEndRow = endDataRow + 1;     // 1-based cho formula (dòng data cuối cùng)

    allValues.push([
      'THỐNG KÊ CHI TIẾT - ' + empName.toUpperCase(),
      '', '', '', '', '', '', '', '', '', ''
    ]);
    styleMeta.push({ r: currentRow, c: 0, type: 'sumHeader' });
    currentRow++;

    // Summary Content Rows
    var summaryData = [
      ['Số ngày làm trong tháng:', '=COUNTIFS(A' + sumStartRow + ':A' + sumEndRow + ';"' + empName + '";J' + sumStartRow + ':J' + sumEndRow + ';">3")'],
      ['Số ngày vào ca 14:30-15:15:', '=IFERROR(SUMPRODUCT((A' + sumStartRow + ':A' + sumEndRow + '="' + empName + '")*(E' + sumStartRow + ':E' + sumEndRow + '<>"")*(E' + sumStartRow + ':E' + sumEndRow + '>=TIME(14;30;0))*(E' + sumStartRow + ':E' + sumEndRow + '<=TIME(15;15;0)));0)'],
      ['Tổng giờ tăng ca (có hệ số):', '=SUMIFS(I' + sumStartRow + ':I' + sumEndRow + ';A' + sumStartRow + ':A' + sumEndRow + ';"' + empName + '";I' + sumStartRow + ':I' + sumEndRow + ';">0")'],
      ['Tổng giờ theo ca (có hệ số):', '=SUMIFS(J' + sumStartRow + ':J' + sumEndRow + ';A' + sumStartRow + ':A' + sumEndRow + ';"' + empName + '";J' + sumStartRow + ':J' + sumEndRow + ';">0")'],
      ['Đánh giá CCNV1 (≥26 ngày):', '=IF(COUNTIFS(A' + sumStartRow + ':A' + sumEndRow + ';"' + empName + '";J' + sumStartRow + ':J' + sumEndRow + ';">3")>=26;"✅ Đạt CCNV1";"❌ Chưa đạt CCNV1")'],
      ['Đánh giá CCNV2 (≥15 buổi ca 15h):', '=IF(IFERROR(SUMPRODUCT((A' + sumStartRow + ':A' + sumEndRow + '="' + empName + '")*(E' + sumStartRow + ':E' + sumEndRow + '<>"")*(E' + sumStartRow + ':E' + sumEndRow + '>=TIME(14;30;0))*(E' + sumStartRow + ':E' + sumEndRow + '<=TIME(15;15;0)));0)>=15;"✅ Đạt CCNV2";"❌ Chưa đạt CCNV2")']
    ];

    for (var si = 0; si < summaryData.length; si++) {
      var sRow = summaryData[si];
      var fullRow = [sRow[0], sRow[1], '', '', '', '', '', '', '', '', ''];
      allValues.push(fullRow);
      var sType = si < 4 ? 'sumValue' : 'sumEval';
      styleMeta.push({ r: currentRow, c: 0, type: sType });
      currentRow++;
    }

    // Separator
    if (empIndex < timesheetSize) {
      allValues.push(['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '', '', '', '', '', '', '', '', '', '']);
      styleMeta.push({ r: currentRow, c: 0, type: 'sep' });
      allValues.push(createEmptyRow());
      allValues.push(createEmptyRow());
      currentRow += 3;
    }
  }

  // ═══ FOOTER ═══
  allValues.push(createEmptyRow());
  currentRow++;
  allValues.push([
    '━━━━━━━━━━━  KẾT THÚC BÁO CÁO  ━━━━━━━━━━━',
    '', '', '', '', '', '', '', '', '', ''
  ]);
  styleMeta.push({ r: currentRow, c: 0, type: 'footerLine' });
  currentRow++;
  allValues.push([
    "KING'S GRILL © " + year + "  |  Hệ thống chấm công tự động  |  Tạo lúc: " + generatedTime,
    '', '', '', '', '', '', '', '', '', ''
  ]);
  styleMeta.push({ r: currentRow, c: 0, type: 'footer' });
  currentRow++;

  // 3. Lookup Table (Góc phải)
  var lookupData = [['Ngày', 'Loại', 'Hệ Số']];
  x2Days.forEach(function(d) { lookupData.push([d, 'x2', 2]); });
  x3Days.forEach(function(d) { lookupData.push([d, 'x3', 3]); });

  // ---- THỰC HIỆN GHI (EXECUTION PHASE) ----

  if (allValues.length > 0) {
    var rows = allValues.length;
    var cols = MAX_COLS;

    // 1. Ghi dữ liệu chính - ưu tiên Sheets API V4 (nhanh hơn 3-5x)
    var apiSuccess = sheetsApiWrite(
      SPREADSHEET_ID,
      targetName + '!A1:K' + rows,
      allValues,
      'USER_ENTERED'
    );
    if (!apiSuccess) {
      // Fallback sang SpreadsheetApp
      targetSheet.getRange(1, 1, rows, cols).setValues(allValues);
    }

    // 2. Ghi bảng tra cứu
    if (lookupData.length > 1) {
      var lookupApiSuccess = sheetsApiWrite(
        SPREADSHEET_ID,
        targetName + '!M1:O' + lookupData.length,
        lookupData,
        'USER_ENTERED'
      );
      if (!lookupApiSuccess) {
        targetSheet.getRange(1, 13, lookupData.length, 3).setValues(lookupData);
      }
    }

    // 3. Áp dụng định dạng hàng loạt (Batch Styling)
    // FIX: Dùng giá trị mặc định thay vì null (GAS API không chấp nhận null)
    var backgrounds = [];
    var fontWeights = [];
    var fontColors = [];
    var aligns = [];
    var fonts = [];

    for (var r = 0; r < rows; r++) {
      backgrounds[r] = [];
      fontWeights[r] = [];
      fontColors[r] = [];
      aligns[r] = [];
      fonts[r] = [];
      for (var c = 0; c < cols; c++) {
        backgrounds[r][c] = '#ffffff';    // FIX: was null
        fontWeights[r][c] = 'normal';     // FIX: was null
        fontColors[r][c] = '#000000';
        aligns[r][c] = 'center';
        fonts[r][c] = 'Roboto Slab';
      }
    }

    var notesMap = [];

    for (var mi = 0; mi < styleMeta.length; mi++) {
      var meta = styleMeta[mi];
      var mr = meta.r;

      switch (meta.type) {
        case 'brandHeader':
          fillRowStyle(mr, 0, 11, backgrounds, '#0f172a', fontColors, '#fbbf24', fontWeights, 'bold');
          break;
        case 'reportHeader':
          fillRowStyle(mr, 0, 11, backgrounds, '#1e3a5f', fontColors, '#ffffff', fontWeights, 'bold');
          break;
        case 'reportMeta':
          fillRowStyle(mr, 0, 11, backgrounds, '#334155', fontColors, '#e2e8f0', fontWeights, 'normal');
          break;
        case 'empHeader':
          fillRowStyle(mr, 0, 11, backgrounds, '#065f46', fontColors, '#d1fae5', fontWeights, 'bold');
          break;
        case 'colHeader':
          fillRowStyle(mr, 0, 11, backgrounds, '#1e40af', fontColors, '#ffffff', fontWeights, 'bold');
          break;
        case 'dataTableBody':
          for (var di = meta.r; di <= meta.rEnd; di++) {
            var bg = (di % 2 === 0) ? '#f1f5f9' : '#ffffff';
            for (var dj = 0; dj < 11; dj++) backgrounds[di][dj] = bg;
          }
          break;
        case 'weekend':
          fontColors[mr][1] = '#dc2626';
          fontWeights[mr][1] = 'bold';
          break;
        case 'x2':
        case 'x3':
          backgrounds[mr][1] = '#fef08a';
          fontWeights[mr][1] = 'bold';
          if (meta.note) notesMap.push({ r: mr + 1, c: 2, note: meta.note });
          break;
        case 'sumHeader':
          fillRowStyle(mr, 0, 11, backgrounds, '#7f1d1d', fontColors, '#fef2f2', fontWeights, 'bold');
          break;
        case 'sumValue':
          backgrounds[mr][0] = '#eff6ff';
          fontWeights[mr][0] = 'bold';
          aligns[mr][0] = 'left';
          backgrounds[mr][1] = '#f0fdf4';
          fontWeights[mr][1] = 'bold';
          break;
        case 'sumEval':
          backgrounds[mr][0] = '#eff6ff';
          fontWeights[mr][0] = 'bold';
          aligns[mr][0] = 'left';
          backgrounds[mr][1] = '#fffbeb';
          fontWeights[mr][1] = 'bold';
          break;
        case 'sep':
          fillRowStyle(mr, 0, 11, backgrounds, '#f8fafc', fontColors, '#cbd5e1', fontWeights, 'normal');
          break;
        case 'footerLine':
          fillRowStyle(mr, 0, 11, backgrounds, '#1e293b', fontColors, '#94a3b8', fontWeights, 'bold');
          break;
        case 'footer':
          fillRowStyle(mr, 0, 11, backgrounds, '#0f172a', fontColors, '#64748b', fontWeights, 'normal');
          break;
      }
    }

    // 4. Ghi style (Tối ưu API calls)
    var range = targetSheet.getRange(1, 1, rows, cols);

    range.setFontFamilies(fonts);
    range.setBackgrounds(backgrounds);
    range.setFontColors(fontColors);
    range.setFontWeights(fontWeights);
    range.setHorizontalAlignments(aligns);

    // FIX: Tạo mảng verticalAlignments đúng cách (không dùng fill shared ref)
    var vAligns = [];
    for (var vi = 0; vi < rows; vi++) {
      vAligns[vi] = [];
      for (var vj = 0; vj < cols; vj++) {
        vAligns[vi][vj] = 'middle';
      }
    }
    range.setVerticalAlignments(vAligns);
    range.setWrap(true);

    // 5. Borders & Merges
    try {
      // Merge headers
      for (var hm = 0; hm < styleMeta.length; hm++) {
        var hMeta = styleMeta[hm];
        if (hMeta.type === 'brandHeader' || hMeta.type === 'reportHeader' || hMeta.type === 'reportMeta' || hMeta.type === 'empHeader' || hMeta.type === 'sumHeader' || hMeta.type === 'footerLine' || hMeta.type === 'footer') {
          targetSheet.getRange(hMeta.r + 1, 1, 1, 11).merge();
        }
      }

      // Borders cho data blocks
      for (var bm = 0; bm < styleMeta.length; bm++) {
        var bMeta = styleMeta[bm];
        if (bMeta.type === 'dataTableBody') {
          var bStartR = bMeta.r; // col header row (0-indexed) → sheet row = bMeta.r (vì col header row là bMeta.r - 1 + 1)
          var bDataRows = (bMeta.rEnd - bMeta.r) + 1;
          var bTotalRows = bDataRows + 2 + 6; // data + colHeader(đã tính) + sumHeader + 6 sum rows
          targetSheet.getRange(bStartR, 1, bTotalRows + 1, 11)
            .setBorder(true, true, true, true, true, true, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
        }
      }
    } catch (e) {
      Logger.log('Lỗi format borders/merges: ' + e.message);
    }

    // Set notes
    for (var ni = 0; ni < notesMap.length; ni++) {
      try {
        targetSheet.getRange(notesMap[ni].r, notesMap[ni].c).setNote(notesMap[ni].note);
      } catch (e) {
        Logger.log('Lỗi set note: ' + e.message);
      }
    }

    // 6. Column sizing & Number formats
    targetSheet.setColumnWidth(1, 350);
    targetSheet.setColumnWidth(2, 120);
    for (var cw = 3; cw <= 8; cw++) targetSheet.setColumnWidth(cw, 80);
    targetSheet.setColumnWidth(9, 150);
    targetSheet.setColumnWidth(10, 150);
    targetSheet.setColumnWidth(11, 80);

    // Format cột I, J là số
    targetSheet.getRange(1, 9, rows, 2).setNumberFormat('0.00');

    // 7. Conditional Formatting
    var rules = [
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('KIỂM TRA')
        .setFontColor('#e65100')
        .setBackground('#fff3e0')
        .setBold(true)
        .setRanges([targetSheet.getRange(1, 9, rows, 2)])
        .build(),
      SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('OFF')
        .setFontColor('#ffffff')
        .setBackground('#424242')
        .setBold(true)
        .setRanges([targetSheet.getRange(1, 9, rows, 2)])
        .build()
    ];
    targetSheet.setConditionalFormatRules(rules);

    // Hide helper cols
    targetSheet.hideColumns(11, 1);
    if (lookupData.length > 1) {
      targetSheet.hideColumns(13, 3);
    }
  }
}

// =====================================================================================
// HELPER FUNCTIONS
// =====================================================================================

/** Helper tạo empty row 11 cột */
function createEmptyRow() {
  return ['', '', '', '', '', '', '', '', '', '', ''];
}

/** Helper fill style cho 1 row */
function fillRowStyle(r, cStart, len, bgArr, bgVal, fcArr, fcVal, fwArr, fwVal) {
  for (var i = 0; i < len; i++) {
    var c = cStart + i;
    if (bgArr && bgVal) bgArr[r][c] = bgVal;
    if (fcArr && fcVal) fcArr[r][c] = fcVal;
    if (fwArr && fwVal) fwArr[r][c] = fwVal;
  }
}

/** Tạo dữ liệu cho 1 dòng ngày công - NÂNG CẤP CA ĐÊM v2 */
function createRowData(name, dateStr, dateObj, datesMap, x2Days, x3Days) {
  var records = datesMap.get(dateStr) || [];
  var OVERNIGHT_THRESHOLD = '00:15'; // Ngưỡng phân biệt qua đêm

  // Sort & Filter logic (loại bỏ trùng lặp trong 5 phút)
  records.sort(function(a, b) { return a.originalTime - b.originalTime; });
  var filtered = records.filter(function(r, i, arr) {
    return i === 0 || r.status !== arr[i - 1].status || (r.originalTime - arr[i - 1].originalTime) >= 300000;
  });

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Tách Ra ca sáng sớm (00:00-06:00) khỏi record bình thường
  // Ra ca sáng sớm thuộc ca đêm NGÀY HÔM TRƯỚC, không phải ngày hiện tại
  // ═══════════════════════════════════════════════════════════════
  var earlyMorningOuts = [];
  var normalRecords = [];

  filtered.forEach(function(r) {
    if (r.status === 'Ra ca' && r.time < '06:00') {
      earlyMorningOuts.push(r);
    } else {
      normalRecords.push(r);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Xử lý Vào# / Ra# (spillover từ ca đêm HÔM TRƯỚC)
  // Chỉ tạo khi Ra ca thực tế > 00:15
  // ═══════════════════════════════════════════════════════════════
  var vaoHash = '', raHash = '';

  if (earlyMorningOuts.length > 0) {
    var earlyOut = earlyMorningOuts[0];
    if (earlyOut.time > OVERNIGHT_THRESHOLD) {
      // Ra ca > 00:15 → Ngày hôm trước đã ghi Ra = 00:00
      // Ngày hôm nay ghi: Vào# = 00:00, Ra# = thời gian thực tế
      vaoHash = '00:00';
      raHash = earlyOut.time;
    }
    // Nếu ≤ 00:15 → đã ghi trực tiếp ở ngày hôm trước, không tạo Vào#/Ra#
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Xử lý Vào 1/Ra 1/Vào 2/Ra 2 (ca trong ngày, ≥ 06:00)
  // ═══════════════════════════════════════════════════════════════
  var inTimes = normalRecords.filter(function(r) { return r.status === 'Vào ca'; }).map(function(r) { return r.time; });
  var outTimes = normalRecords.filter(function(r) { return r.status === 'Ra ca'; }).map(function(r) { return r.time; });

  var vao1 = inTimes[0] || '';
  var ra1 = outTimes[0] || '';
  var vao2 = inTimes[1] || '';
  var ra2 = outTimes[1] || '';

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Look ahead → Kiểm tra Ra ca sáng sớm NGÀY HÔM SAU
  // Nếu có Ra ca 00:00-06:00 ở ngày hôm sau → thuộc ca đêm ngày hiện tại
  // ═══════════════════════════════════════════════════════════════
  var nextDateStr = formatDateUTC(new Date(dateObj.getTime() + 86400000));
  var nextRecords = (datesMap.get(nextDateStr) || []).slice();
  nextRecords.sort(function(a, b) { return a.originalTime - b.originalTime; });

  var nextEarlyOuts = nextRecords.filter(function(r) {
    return r.status === 'Ra ca' && r.time < '06:00';
  });
  // Loại trùng lặp
  nextEarlyOuts = nextEarlyOuts.filter(function(r, i, arr) {
    return i === 0 || (r.originalTime - arr[i - 1].originalTime) >= 300000;
  });

  if (nextEarlyOuts.length > 0) {
    var nextOut = nextEarlyOuts[0];

    // Áp dụng ngưỡng 00:15
    // > 00:15: Ra = "00:00" (đánh dấu qua đêm), ngày mai sẽ có Vào#/Ra#
    // ≤ 00:15: Ra = thời gian thực tế, ngày mai KHÔNG có Vào#/Ra#
    var raValue = (nextOut.time > OVERNIGHT_THRESHOLD) ? '00:00' : nextOut.time;

    // Gán Ra ca vào slot phù hợp
    if (vao2 && !ra2) {
      // Đã có Vào ca 2 nhưng chưa Ra → gán Ra 2
      ra2 = raValue;
    } else if (vao1 && !ra1) {
      // Đã có Vào ca 1 nhưng chưa Ra → gán Ra 1
      ra1 = raValue;
    } else if (ra1 && vao2 === '' && ra2 === '') {
      // Đã có đầy đủ ca 1, không có ca 2 → tạo Ra 2 (Vào 2 để trống)
      ra2 = raValue;
    } else if (!vao1 && !ra1) {
      // Trường hợp C: Không có Vào ca → chỉ ghi Ra, Vào để trống
      ra1 = raValue;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Hệ số & Weekend (không thay đổi)
  // ═══════════════════════════════════════════════════════════════
  var multiplier = 1;
  var specialType = null;
  var note = '';

  var shortDate = dateStr.substring(0, 5); // dd/MM

  var isX2 = false;
  var isX3 = false;
  x2Days.forEach(function(d) { if (d === dateStr || d.substring(0, 5) === shortDate) isX2 = true; });
  x3Days.forEach(function(d) { if (d === dateStr || d.substring(0, 5) === shortDate) isX3 = true; });

  if (isX2) { multiplier = 2; specialType = 'x2'; note = 'Ngày x2 giờ'; }
  else if (isX3) { multiplier = 3; specialType = 'x3'; note = 'Ngày x3 giờ'; }

  // Weekend check
  var dayOfWeek = dateObj.getUTCDay();
  var isWeekend = (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6);

  return {
    values: [name, dateStr, vaoHash, raHash, vao1, ra1, vao2, ra2, '', '', multiplier],
    sortTime: dateObj.getTime(),
    isWeekend: isWeekend,
    specialType: specialType,
    note: note
  };
}

// =====================================================================================
// 7. TIỆN ÍCH CHUNG (UTILITIES)
// =====================================================================================

function parseSpecialDaysForCurrentYear(str, year) {
  var s = new Set();
  if (!str) return s;
  var lines = str.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (t.match(/^\d{1,2}\/\d{1,2}$/)) {
      var parts = t.split('/');
      var dd = parts[0].padStart(2, '0');
      var mm = parts[1].padStart(2, '0');
      s.add(dd + '/' + mm + '/' + year);
    }
  }
  return s;
}

function formatDateUTC(date) {
  var d = String(date.getUTCDate()).padStart(2, '0');
  var m = String(date.getUTCMonth() + 1).padStart(2, '0');
  var y = date.getUTCFullYear();
  return d + '/' + m + '/' + y;
}

function parseDateUTC(str) {
  var parts = str.split('/');
  var d = Number(parts[0]);
  var m = Number(parts[1]);
  var y = Number(parts[2]);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Parse chuỗi DD/MM/YYYY HH:MM:SS hoặc DD/MM/YYYY HH:MM thành Date object
 * Hỗ trợ format: "02/04/2026 15:02:00" hoặc "02/04/2026 15:02"
 */
function parseDDMMYYYY(str) {
  try {
    if (!str || typeof str !== 'string') return null;
    var parts = str.trim().split(' ');
    var dateParts = parts[0].split('/');
    if (dateParts.length < 3) return null;

    var day = Number(dateParts[0]);
    var month = Number(dateParts[1]) - 1; // JS months are 0-indexed
    var year = Number(dateParts[2]);

    var hours = 0, minutes = 0, seconds = 0;
    if (parts.length >= 2 && parts[1]) {
      var timeParts = parts[1].split(':');
      hours = Number(timeParts[0]) || 0;
      minutes = Number(timeParts[1]) || 0;
      seconds = Number(timeParts[2]) || 0;
    }

    var result = new Date(year, month, day, hours, minutes, seconds);
    return isNaN(result.getTime()) ? null : result;
  } catch (e) {
    return null;
  }
}

// =====================================================================================
// 8. GOOGLE SHEETS API V4 - FAST WRITE UTILITIES
// =====================================================================================

/**
 * Ghi dữ liệu siêu nhanh bằng Sheets API V4
 * Nhanh hơn 3-5x so với SpreadsheetApp.setValues()
 * @param {string} spreadsheetId - ID của spreadsheet
 * @param {string} range - Range notation (ví dụ: 'Sheet1!A1:K100')
 * @param {Array[]} values - Mảng 2D dữ liệu
 * @param {string} inputOption - 'RAW' hoặc 'USER_ENTERED' (mặc định: USER_ENTERED để parse formulas)
 */
function sheetsApiWrite(spreadsheetId, range, values, inputOption) {
  try {
    inputOption = inputOption || 'USER_ENTERED';
    Sheets.Spreadsheets.Values.update(
      { values: values },
      spreadsheetId,
      range,
      { valueInputOption: inputOption }
    );
    return true;
  } catch (e) {
    Logger.log('⚠️ Sheets API V4 write failed, fallback to SpreadsheetApp: ' + e.message);
    return false;
  }
}

/**
 * Append dữ liệu siêu nhanh (thêm dòng mới)
 * Dùng cho check-in/out - phản hồi tức thì
 * @param {string} spreadsheetId - ID của spreadsheet
 * @param {string} sheetName - Tên sheet
 * @param {Array[]} values - Mảng 2D (mỗi phần tử là 1 dòng)
 */
function sheetsApiFastAppend(spreadsheetId, sheetName, values) {
  try {
    var range = sheetName + '!A1';
    Sheets.Spreadsheets.Values.append(
      { values: values },
      spreadsheetId,
      range,
      {
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS'
      }
    );
    return true;
  } catch (e) {
    Logger.log('⚠️ Sheets API V4 append failed: ' + e.message);
    return false;
  }
}

/**
 * Đọc dữ liệu siêu nhanh bằng Sheets API V4
 * Nhanh hơn 2-3x so với SpreadsheetApp.getValues()
 * @param {string} spreadsheetId - ID của spreadsheet
 * @param {string} range - Range notation
 * @return {Array[]} Mảng 2D dữ liệu
 */
function sheetsApiFastRead(spreadsheetId, range) {
  try {
    var response = Sheets.Spreadsheets.Values.get(spreadsheetId, range);
    return response.values || [];
  } catch (e) {
    Logger.log('⚠️ Sheets API V4 read failed, fallback to SpreadsheetApp: ' + e.message);
    return null;
  }
}

/**
 * Batch update nhiều range cùng lúc - siêu nhanh cho tổng hợp
 * @param {string} spreadsheetId - ID của spreadsheet
 * @param {Array} dataArray - Mảng [{range: 'Sheet!A1:K10', values: [[...]]}]
 */
function sheetsApiBatchWrite(spreadsheetId, dataArray) {
  try {
    var batchData = dataArray.map(function(item) {
      return {
        range: item.range,
        values: item.values
      };
    });
    
    Sheets.Spreadsheets.Values.batchUpdate(
      {
        data: batchData,
        valueInputOption: 'USER_ENTERED'
      },
      spreadsheetId
    );
    return true;
  } catch (e) {
    Logger.log('⚠️ Sheets API V4 batch write failed: ' + e.message);
    return false;
  }
}

// ==========================================
// TÍNH NĂNG BẢNG TIN (NEWS FEED)
// ==========================================

function handleGetPosts() {
  var ss = getSS();
  var sheet = ss.getSheetByName("Posts");
  if (!sheet) return jsonResponse(true, []); 

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return jsonResponse(true, []);

  var posts = [];
  // Lấy từ dưới lên trên (bài mới nhất lên đầu)
  for (var i = data.length - 1; i > 0; i--) {
    var row = data[i];
    posts.push({
      id: row[0],
      author: row[1],
      content: row[2],
      likes: row[3] ? JSON.parse(row[3]) : [],
      comments: row[4] ? JSON.parse(row[4]) : [],
      time: "Gần đây"
    });
  }
  return jsonResponse(true, posts);
}

function handleAddPost(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName("Posts");
  if (!sheet) {
    sheet = ss.insertSheet("Posts");
    sheet.appendRow(["ID", "Author", "Content", "Likes", "Comments"]);
  }
  
  var newId = new Date().getTime();
  sheet.appendRow([
    newId,
    payload.author,
    payload.content,
    "[]", // Likes
    "[]"  // Comments
  ]);
  
  return jsonResponse(true, "Đã đăng bài");
}

function handleInteractPost(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName("Posts");
  if (!sheet) return jsonResponse(false, "Không tìm thấy CSDL Bảng tin");

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === payload.postId.toString()) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) return jsonResponse(false, "Không tìm thấy bài viết");

  // Xử lý LIKE
  if (payload.action === 'LIKE') {
    var likes = data[rowIndex-1][3] ? JSON.parse(data[rowIndex-1][3]) : [];
    var userIndex = likes.indexOf(payload.username);
    if (userIndex > -1) {
      likes.splice(userIndex, 1); // Unlike
    } else {
      likes.push(payload.username); // Like
    }
    sheet.getRange(rowIndex, 4).setValue(JSON.stringify(likes));
  }
  
  // Xử lý COMMENT
  if (payload.action === 'COMMENT') {
    var comments = data[rowIndex-1][4] ? JSON.parse(data[rowIndex-1][4]) : [];
    comments.push({
      id: new Date().getTime(),
      author: payload.author,
      content: payload.content,
      time: "Vừa xong"
    });
    sheet.getRange(rowIndex, 5).setValue(JSON.stringify(comments));
  }

  return jsonResponse(true, "Đã tương tác");
}

// ==========================================
// TÍNH NĂNG MÓN HẾT (SOLD OUT / 86)
// ==========================================

function handleGetSoldOut() {
  var ss = getSS();
  var sheet = ss.getSheetByName("SoldOut");
  if (!sheet) return jsonResponse(true, []); 

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return jsonResponse(true, []);

  var items = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    items.push({
      id: row[0],
      itemName: row[1],
      reportedBy: row[2],
      reportedAt: row[3]
    });
  }
  return jsonResponse(true, items);
}

function handleAddSoldOut(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName("SoldOut");
  if (!sheet) {
    sheet = ss.insertSheet("SoldOut");
    sheet.appendRow(["ID", "ItemName", "ReportedBy", "ReportedAt"]);
  }
  
  var newId = new Date().getTime().toString();
  var now = new Date();
  var timeString = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ' ' + now.getDate().toString().padStart(2, '0') + '/' + (now.getMonth() + 1).toString().padStart(2, '0');

  sheet.appendRow([
    newId,
    payload.itemName,
    payload.reportedBy,
    timeString
  ]);
  
  return jsonResponse(true, "Đã báo hết món");
}

function handleRemoveSoldOut(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName("SoldOut");
  if (!sheet) return jsonResponse(false, "Không tìm thấy CSDL Món hết");

  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === payload.id.toString()) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) return jsonResponse(false, "Không tìm thấy món này");

  sheet.deleteRow(rowIndex);
  return jsonResponse(true, "Đã xóa khỏi danh sách hết món");
}

// ==========================================
// TÍNH NĂNG CHECKLIST HẰNG NGÀY
// ==========================================

function handleGetChecklists() {
  var ss = getSS();
  var sheet = ss.getSheetByName("Checklists");
  if (!sheet) return jsonResponse(true, []); 

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return jsonResponse(true, []);

  var items = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    items.push({
      id: row[0],
      shift: row[1],
      department: row[2],
      position: row[3],
      taskName: row[4],
      points: row[5],
      isActive: row[6]
    });
  }
  return jsonResponse(true, items);
}

function handleSubmitChecklist(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName("ChecklistLogs");
  if (!sheet) {
    sheet = ss.insertSheet("ChecklistLogs");
    sheet.appendRow(["LogID", "Date", "Shift", "Username", "Fullname", "CheckedTasks", "Timestamp"]);
  }
  
  var newId = "LOG_" + new Date().getTime().toString();
  var now = new Date();
  var dateStr = now.getDate().toString().padStart(2, '0') + '/' + (now.getMonth() + 1).toString().padStart(2, '0') + '/' + now.getFullYear();
  
  sheet.appendRow([
    newId,
    dateStr,
    payload.shift || '',
    payload.username || '',
    payload.fullname || '',
    JSON.stringify(payload.checkedTasks || []),
    now.toString()
  ]);
  
  return jsonResponse(true, "Đã nộp checklist thành công");
}

// ==========================================
// TÍNH NĂNG BÀN GIAO CA VÀ SỰ CỐ
// ==========================================

function handleSubmitHandover(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName("Handovers");
  if (!sheet) {
    sheet = ss.insertSheet("Handovers");
    sheet.appendRow(["LogID", "Date", "Shift", "Username", "CashAmount", "Note", "Timestamp"]);
  }
  
  var newId = "HO_" + new Date().getTime().toString();
  var now = new Date();
  var dateStr = now.getDate().toString().padStart(2, '0') + '/' + (now.getMonth() + 1).toString().padStart(2, '0') + '/' + now.getFullYear();
  
  sheet.appendRow([
    newId,
    dateStr,
    payload.shift || '',
    payload.username || '',
    payload.cashAmount || '',
    payload.note || '',
    now.toString()
  ]);
  
  return jsonResponse(true, "Đã ghi nhận bàn giao ca");
}

function handleSubmitIncident(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName("Incidents");
  if (!sheet) {
    sheet = ss.insertSheet("Incidents");
    sheet.appendRow(["IncidentID", "Date", "Username", "Category", "Description", "Status", "Timestamp"]);
  }
  
  var newId = "INC_" + new Date().getTime().toString();
  var now = new Date();
  var dateStr = now.getDate().toString().padStart(2, '0') + '/' + (now.getMonth() + 1).toString().padStart(2, '0') + '/' + now.getFullYear();
  
  sheet.appendRow([
    newId,
    dateStr,
    payload.username || '',
    payload.category || '',
    payload.description || '',
    "Pending",
    now.toString()
  ]);
  
  return jsonResponse(true, "Đã gửi báo cáo sự cố");
}

// ==========================================
// TÍNH NĂNG GÓP Ý & KHIẾU NẠI (FEEDBACK)
// ==========================================

function handleGetFeedbacks(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName("Feedbacks");
  if (!sheet) return jsonResponse(true, []); 

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return jsonResponse(true, []);

  var isAdmin = payload.role === 'admin';
  var username = payload.username || '';
  
  var items = [];
  // Loop from bottom to top to get latest first
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    var isAnon = row[5] === true || row[5] === 'TRUE' || row[5] === 'true';
    var ownerUsername = row[2];
    
    // Filter logic:
    // Admin sees all. User sees only their own (even if they sent it as anonymous).
    if (isAdmin || ownerUsername === username) {
      items.push({
        id: row[0],
        date: row[1],
        username: isAnon ? 'Anonymous' : ownerUsername, // Hide real username if anon
        fullname: isAnon ? 'Người dùng ẩn danh' : (row[8] || ownerUsername), // If we stored fullname, we could use it. For now fallback. Wait, we should store fullname.
        category: row[3],
        content: row[4],
        isAnonymous: isAnon,
        status: row[6],
        adminReply: row[7]
      });
    }
  }
  return jsonResponse(true, items);
}

function handleSubmitFeedback(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName("Feedbacks");
  if (!sheet) {
    sheet = ss.insertSheet("Feedbacks");
    sheet.appendRow(["FeedbackID", "Date", "Username", "Category", "Content", "IsAnonymous", "Status", "AdminReply", "Fullname"]);
  }
  
  var newId = "FB_" + new Date().getTime().toString();
  var now = new Date();
  var dateStr = now.getDate().toString().padStart(2, '0') + '/' + (now.getMonth() + 1).toString().padStart(2, '0') + '/' + now.getFullYear() + ' ' + now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
  
  sheet.appendRow([
    newId,
    dateStr,
    payload.username || '',
    payload.category || '',
    payload.content || '',
    payload.isAnonymous ? true : false,
    "Pending",
    "",
    payload.fullname || '' // Store fullname at col 8
  ]);
  
  return jsonResponse(true, "Đã gửi góp ý");
}

function handleReplyFeedback(payload) {
  var ss = getSS();
  var sheet = ss.getSheetByName("Feedbacks");
  if (!sheet) return jsonResponse(false, "Chưa có CSDL Feedbacks");

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString() === payload.feedbackId) {
      // AdminReply is at col 8 (index 7), Status is at col 7 (index 6)
      sheet.getRange(i + 1, 8).setValue(payload.reply);
      sheet.getRange(i + 1, 7).setValue("Reviewed");
      return jsonResponse(true, "Đã phản hồi");
    }
  }
  return jsonResponse(false, "Không tìm thấy phản hồi này");
}
