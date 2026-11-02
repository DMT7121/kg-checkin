/**
 * OpsChecklistHandlers.gs
 * Exposes API handler endpoints for the integrated zone checklist module.
 */

function handleGetOpsChecklistInit(payload) {
  try {
    ChecklistService.initDefaultChecklist();
    var dateStr = payload.dateStr || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "yyyy-MM-dd");
    return jsonResponse(true, {
      checklist: ChecklistService.loadChecklistFromSheet(),
      states: ChecklistService.getChecklistStates(dateStr)
    });
  } catch(e) {
    Logger.log("Error in handleGetOpsChecklistInit: " + e.toString());
    return jsonResponse(false, 'Lỗi nạp cấu hình checklist: ' + e.message);
  }
}

function handleSaveOpsChecklistState(payload) {
  try {
    var actorUser = payload.actorUsername || payload.username || '';
    if (actorUser && typeof canEmployeeWork === 'function' && payload.role !== 'admin' && !canEmployeeWork(actorUser)) {
      return jsonResponse(false, 'Trạng thái nhân sự hiện tại không được thực hiện checklist');
    }
    var res = ChecklistService.saveChecklistState(
      payload.dateStr,
      payload.area,
      payload.participants,
      payload.items,
      payload.supply,
      payload.signatures,
      {
        deltaItems: payload.deltaItems || null,
        deltaSignatures: payload.deltaSignatures || null,
        removedParticipantKeys: payload.removedParticipantKeys || [],
        actorUsername: actorUser,
        actorFullname: payload.fullname || ''
      }
    );
    return jsonResponse(true, res);
  } catch(e) {
    Logger.log("Error in handleSaveOpsChecklistState: " + e.toString());
    return jsonResponse(false, 'Lỗi lưu tiến độ checklist: ' + e.message);
  }
}

function handlePatchOpsChecklistItem(payload) {
  try {
    var actorUser = payload.actorUsername || payload.username || '';
    if (actorUser && typeof canEmployeeWork === 'function' && payload.role !== 'admin' && !canEmployeeWork(actorUser)) {
      return jsonResponse(false, 'Trạng thái nhân sự hiện tại không được thực hiện checklist');
    }
    var itemId = String(payload.itemId || '').trim();
    if (!itemId || !payload.itemPatch) {
      return jsonResponse(false, 'Thiếu thông tin hạng mục checklist cần cập nhật');
    }
    var deltaItems = {};
    deltaItems[itemId] = payload.itemPatch;
    var participants = payload.participant ? [payload.participant] : (payload.participants || []);
    var res = ChecklistService.saveChecklistState(
      payload.dateStr,
      payload.area || 'A',
      participants,
      null,
      null,
      null,
      {
        deltaItems: deltaItems,
        actorUsername: actorUser,
        actorFullname: payload.fullname || ''
      }
    );
    return jsonResponse(true, res);
  } catch(e) {
    Logger.log("Error in handlePatchOpsChecklistItem: " + e.toString());
    return jsonResponse(false, 'Lỗi cập nhật hạng mục checklist: ' + e.message);
  }
}

function handleSaveOpsChecklistConfig(payload) {
  var adminErr = requireAdminActor(payload);
  if (adminErr) return jsonResponse(false, adminErr);
  try {
    // payload.items is a flat list of objects matching the template columns:
    // Mã Hạng Mục, STT, Phân Loại, Ca Làm Việc, Phần, Tiêu Đề, Mô Tả, Công Việc Con
    var headers = [
      "Mã Hạng Mục", "STT", "Phân Loại", "Ca Làm Việc", "Phần", 
      "Tiêu Đề", "Mô Tả", "Công Việc Con"
    ];
    
    // Clear and overwrite sheet data
    SheetService.setSheetDataFromObjects("01_DANH_SACH_CHECKLIST", headers, payload.items);
    return jsonResponse(true, "Lưu cấu hình checklist thành công");
  } catch(e) {
    Logger.log("Error in handleSaveOpsChecklistConfig: " + e.toString());
    return jsonResponse(false, 'Lỗi lưu cấu hình checklist: ' + e.message);
  }
}
