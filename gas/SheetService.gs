/**
 * SheetService.gs
 * Core utility services for Google Sheets database interactions,
 * using Sheets API v4 as the primary read/write mechanism.
 */

var SheetService = (function() {
  /**
   * Gets the active spreadsheet ID.
   */
  function getSpreadsheetId() {
    return getSpreadsheet().getId();
  }

  /**
   * Gets the active spreadsheet.
   */
  function getSpreadsheet() {
    return getSS();
  }

  /**
   * Gets a sheet by name or creates it with headers if it doesn't exist.
   * @param {string} name - The sheet name
   * @param {string[]} headers - The headers for the sheet
   * @return {Sheet} The Google Sheet object
   */
  function getOrCreateSheet(name, headers) {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      if (headers && headers.length > 0) {
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#d0e0f3");
        sheet.setFrozenRows(1);
      }
    }
    return sheet;
  }

  /**
   * Fallback read function using SpreadsheetApp.
   */
  function getSheetDataAsObjectsFallback(name) {
    var sheet = getOrCreateSheet(name);
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow <= 1) return [];

    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    
    return data.map(function(row) {
      var obj = {};
      headers.forEach(function(header, idx) {
        if (header) {
          obj[header] = row[idx];
        }
      });
      return obj;
    });
  }

  /**
   * Reads a sheet and converts its content into an array of objects based on headers,
   * using Sheets API v4.
   * @param {string} name - The sheet name
   * @return {object[]} Array of objects
   */
  function getSheetDataAsObjects(name) {
    var ssId = getSpreadsheetId();
    var response;
    
    try {
      response = Sheets.Spreadsheets.Values.get(ssId, name);
    } catch(e) {
      Logger.log("Sheets API v4 read failed for " + name + ", falling back: " + e.toString());
      return getSheetDataAsObjectsFallback(name);
    }
    
    var values = response.values;
    if (!values || values.length <= 1) return [];

    var headers = values[0];
    var data = values.slice(1);
    
    return data.map(function(row) {
      var obj = {};
      headers.forEach(function(header, idx) {
        if (header) {
          obj[header] = idx < row.length ? row[idx] : "";
        }
      });
      return obj;
    });
  }

  /**
   * Fallback write function using SpreadsheetApp.
   */
  function setSheetDataFromObjectsFallback(name, headers, objects) {
    var sheet = getOrCreateSheet(name, headers);
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
    if (!objects || objects.length === 0) return;
    var values = objects.map(function(obj) {
      return headers.map(function(header) {
        return obj.hasOwnProperty(header) ? obj[header] : "";
      });
    });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }

  /**
   * Overwrites a sheet's data with an array of objects using Sheets API v4.
   * @param {string} name - The sheet name
   * @param {string[]} headers - Header columns in desired order
   * @param {object[]} objects - Data rows as objects
   */
  function setSheetDataFromObjects(name, headers, objects) {
    var sheet = getOrCreateSheet(name, headers);
    var ssId = getSpreadsheetId();
    
    var values = [headers];
    if (objects && objects.length > 0) {
      objects.forEach(function(obj) {
        var row = headers.map(function(header) {
          return obj.hasOwnProperty(header) ? obj[header] : "";
        });
        values.push(row);
      });
    }

    try {
      // Clear current content in columns A to Z using Sheets API v4
      Sheets.Spreadsheets.Values.clear({}, ssId, name + "!A:Z");
      
      // Update new matrix values using Sheets API v4
      var valueRange = Sheets.newValueRange();
      valueRange.values = values;
      
      Sheets.Spreadsheets.Values.update(valueRange, ssId, name + "!A1", {
        valueInputOption: "USER_ENTERED"
      });
    } catch(e) {
      Logger.log("Sheets API v4 update failed for " + name + ", falling back: " + e.toString());
      setSheetDataFromObjectsFallback(name, headers, objects);
    }
  }

  /**
   * Fallback append function using SpreadsheetApp.
   */
  function appendRowFromObjectFallback(name, headers, obj) {
    var sheet = getOrCreateSheet(name, headers);
    var rowValues = headers.map(function(header) {
      return obj.hasOwnProperty(header) ? obj[header] : "";
    });
    sheet.appendRow(rowValues);
  }

  /**
   * Appends a single object as a row using Sheets API v4.
   * @param {string} name - The sheet name
   * @param {string[]} headers - Header columns
   * @param {object} obj - Object data to write
   */
  function appendRowFromObject(name, headers, obj) {
    var ssId = getSpreadsheetId();
    var rowValues = headers.map(function(header) {
      return obj.hasOwnProperty(header) ? obj[header] : "";
    });

    var valueRange = Sheets.newValueRange();
    valueRange.values = [rowValues];

    try {
      // Append row to the sheet using Sheets API v4
      Sheets.Spreadsheets.Values.append(valueRange, ssId, name + "!A:A", {
        valueInputOption: "USER_ENTERED"
      });
    } catch(e) {
      Logger.log("Sheets API v4 append failed for " + name + ", falling back: " + e.toString());
      appendRowFromObjectFallback(name, headers, obj);
    }
  }

  /**
   * Fallback lookup cell update using SpreadsheetApp.
   */
  function updateCellByLookupFallback(name, headers, lookupHeader, lookupValue, targetHeader, newValue) {
    var sheet = getOrCreateSheet(name, headers);
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var sheetHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var lookupColIdx = sheetHeaders.indexOf(lookupHeader);
    var targetColIdx = sheetHeaders.indexOf(targetHeader);
    
    var foundRowIdx = -1;
    if (lastRow > 1) {
      var lookupValues = sheet.getRange(2, lookupColIdx + 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < lookupValues.length; i++) {
        var valStr = lookupValues[i][0] instanceof Date 
          ? Utilities.formatDate(lookupValues[i][0], "GMT+7", "dd/MM/yyyy") 
          : String(lookupValues[i][0]);
        var searchStr = lookupValue instanceof Date 
          ? Utilities.formatDate(lookupValue, "GMT+7", "dd/MM/yyyy") 
          : String(lookupValue);
        if (valStr.trim() === searchStr.trim()) {
          foundRowIdx = i + 2;
          break;
        }
      }
    }
    
    if (foundRowIdx !== -1) {
      var cell = sheet.getRange(foundRowIdx, targetColIdx + 1);
      cell.setValue(newValue);
      cell.setWrap(true);
      cell.setVerticalAlignment("top");
    } else {
      var obj = {};
      obj[lookupHeader] = lookupValue;
      obj[targetHeader] = newValue;
      appendRowFromObjectFallback(name, headers, obj);
      var newRowIdx = sheet.getLastRow();
      sheet.getRange(newRowIdx, targetColIdx + 1).setWrap(true).setVerticalAlignment("top");
      sheet.getRange(newRowIdx, lookupColIdx + 1).setHorizontalAlignment("center").setFontWeight("bold");
    }
  }

  /**
   * Updates a cell in a sheet by looking up a row matching a lookup key/value,
   * using Sheets API v4.
   * If the row does not exist, appends a new row and updates it.
   */
  function updateCellByLookup(name, headers, lookupHeader, lookupValue, targetHeader, newValue) {
    var ssId = getSpreadsheetId();
    var response;
    
    try {
      response = Sheets.Spreadsheets.Values.get(ssId, name);
    } catch(e) {
      Logger.log("Sheets API v4 get failed in lookup, falling back: " + e.toString());
      updateCellByLookupFallback(name, headers, lookupHeader, lookupValue, targetHeader, newValue);
      return;
    }
    
    var values = response.values;
    if (!values || values.length <= 1) {
      var obj = {};
      obj[lookupHeader] = lookupValue;
      obj[targetHeader] = newValue;
      appendRowFromObject(name, headers, obj);
      
      // Apply cell formatters using SpreadsheetApp
      var sheet = getOrCreateSheet(name, headers);
      var newRowIdx = sheet.getLastRow();
      var lookupColIdx = headers.indexOf(lookupHeader);
      var targetColIdx = headers.indexOf(targetHeader);
      sheet.getRange(newRowIdx, targetColIdx + 1).setWrap(true).setVerticalAlignment("top");
      sheet.getRange(newRowIdx, lookupColIdx + 1).setHorizontalAlignment("center").setFontWeight("bold");
      return;
    }
    
    var sheetHeaders = values[0];
    var lookupColIdx = sheetHeaders.indexOf(lookupHeader);
    var targetColIdx = sheetHeaders.indexOf(targetHeader);
    
    if (lookupColIdx === -1 || targetColIdx === -1) {
      throw new Error("Không tìm thấy tiêu đề cột: " + lookupHeader + " hoặc " + targetHeader);
    }
    
    var foundRowIdx = -1;
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var cellVal = lookupColIdx < row.length ? row[lookupColIdx] : "";
      
      var valStr = String(cellVal);
      var searchStr = String(lookupValue);
      
      if (valStr.trim() === searchStr.trim()) {
        foundRowIdx = i + 1; // offset for headers (1-indexed)
        break;
      }
    }
    
    if (foundRowIdx !== -1) {
      var colLetter = String.fromCharCode(65 + targetColIdx); // 65 is 'A'
      var cellRange = name + "!" + colLetter + foundRowIdx;
      
      var valueRange = Sheets.newValueRange();
      valueRange.values = [[newValue]];
      
      try {
        Sheets.Spreadsheets.Values.update(valueRange, ssId, cellRange, {
          valueInputOption: "USER_ENTERED"
        });
        
        // Wrap and align using SpreadsheetApp (simplest)
        var sheet = getOrCreateSheet(name, headers);
        sheet.getRange(foundRowIdx, targetColIdx + 1).setWrap(true).setVerticalAlignment("top");
      } catch(e) {
        Logger.log("Sheets API v4 cell update failed, falling back: " + e.toString());
        updateCellByLookupFallback(name, headers, lookupHeader, lookupValue, targetHeader, newValue);
      }
    } else {
      var obj = {};
      obj[lookupHeader] = lookupValue;
      obj[targetHeader] = newValue;
      appendRowFromObject(name, headers, obj);
      
      var sheet = getOrCreateSheet(name, headers);
      var newRowIdx = sheet.getLastRow();
      sheet.getRange(newRowIdx, targetColIdx + 1).setWrap(true).setVerticalAlignment("top");
      sheet.getRange(newRowIdx, lookupColIdx + 1).setHorizontalAlignment("center").setFontWeight("bold");
    }
  }

  return {
    getSpreadsheetId: getSpreadsheetId,
    getSpreadsheet: getSpreadsheet,
    getOrCreateSheet: getOrCreateSheet,
    getSheetDataAsObjects: getSheetDataAsObjects,
    setSheetDataFromObjects: setSheetDataFromObjects,
    appendRowFromObject: appendRowFromObject,
    updateCellByLookup: updateCellByLookup
  };
})();
