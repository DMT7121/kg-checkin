import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createServer, type ViteDevServer } from 'vite';

// ---------------------------------------------------------------------------
// Minimal Browser Storage Shim
// ---------------------------------------------------------------------------
class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

(globalThis as any).localStorage = new MemoryStorage();
(globalThis as any).sessionStorage = new MemoryStorage();
(globalThis as any).window = globalThis;

let vite: ViteDevServer;

before(async () => {
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });
});

after(async () => {
  if (vite) await vite.close();
});

// ---------------------------------------------------------------------------
// In-Memory GAS Sandbox (Loads Real gas/*.gs Files including ChecklistService)
// ---------------------------------------------------------------------------
function createGasWave2Sandbox(initialSheets: Record<string, any[][]> = {}) {
  const sheetsData: Record<string, any[][]> = {};
  for (const [name, rows] of Object.entries(initialSheets)) {
    sheetsData[name] = rows.map((r) => [...r]);
  }

  function makeSheet(name: string) {
    if (!sheetsData[name]) sheetsData[name] = [];
    const ensureCell = (r1: number, c1: number) => {
      while (sheetsData[name].length < r1) sheetsData[name].push([]);
      while (sheetsData[name][r1 - 1].length < c1) sheetsData[name][r1 - 1].push('');
    };
    return {
      getName: () => name,
      getSheetId: () => 1,
      getIndex: () => Object.keys(sheetsData).indexOf(name) + 1,
      activate: () => {},
      setFrozenRows: () => {},
      setFrozenColumns: () => {},
      setColumnWidth: () => {},
      deleteRows: (rowPosition: number, howMany: number) => {
        sheetsData[name].splice(rowPosition - 1, howMany);
      },
      getLastRow: () => sheetsData[name].length,
      getLastColumn: () =>
        sheetsData[name].reduce((max, row) => Math.max(max, row.length), 0),
      appendRow: (row: any[]) => {
        sheetsData[name].push([...row]);
      },
      deleteRow: (r1: number) => {
        sheetsData[name].splice(r1 - 1, 1);
      },
      getDataRange: () => ({
        getValues: () =>
          sheetsData[name].length === 0 ? [['']] : sheetsData[name].map((r) => [...r]),
      }),
      getRange: (row1: number, col1: number, numRows = 1, numCols = 1) => {
        const rangeObj = {
          getValue: () => sheetsData[name]?.[row1 - 1]?.[col1 - 1] ?? '',
          getValues: () => {
            const out: any[][] = [];
            for (let r = 0; r < numRows; r++) {
              const line: any[] = [];
              for (let c = 0; c < numCols; c++) {
                line.push(sheetsData[name]?.[row1 - 1 + r]?.[col1 - 1 + c] ?? '');
              }
              out.push(line);
            }
            return out;
          },
          setValue: (val: any) => {
            ensureCell(row1, col1);
            sheetsData[name][row1 - 1][col1 - 1] = val;
            return rangeObj;
          },
          setValues: (vals: any[][]) => {
            for (let r = 0; r < vals.length; r++) {
              for (let c = 0; c < vals[r].length; c++) {
                ensureCell(row1 + r, col1 + c);
                sheetsData[name][row1 - 1 + r][col1 - 1 + c] = vals[r][c];
              }
            }
            return rangeObj;
          },
          clearContent: () => rangeObj,
          merge: () => rangeObj,
          setWrap: () => rangeObj,
          setBorder: () => rangeObj,
          setBackground: () => rangeObj,
          setFontColor: () => rangeObj,
          setFontWeight: () => rangeObj,
          setFontSize: () => rangeObj,
          setHorizontalAlignment: () => rangeObj,
          setVerticalAlignment: () => rangeObj,
        };
        return rangeObj;
      },
    };
  }

  const ssObj = {
    getId: () => 'TEST_SPREADSHEET_ID',
    getSheetByName: (n: string) => (sheetsData[n] ? makeSheet(n) : null),
    getSheets: () => Object.keys(sheetsData).map((n) => makeSheet(n)),
    insertSheet: (n: string) => {
      sheetsData[n] = [];
      return makeSheet(n);
    },
    toast: () => {},
  };

  const scriptProps: Record<string, string> = {};
  const sandbox: any = {
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Error,
    Map,
    Set,
    parseInt,
    parseFloat,
    isNaN,
    Logger: { log: () => {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ssObj,
      openById: () => ssObj,
      getUi: () => null,
      BorderStyle: { SOLID: 'SOLID' },
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt: string) => ({
        _text: txt,
        setMimeType() {
          return this;
        },
        getContent() {
          return this._text;
        },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => scriptProps[k] ?? null,
        setProperty: (k: string, v: string) => {
          scriptProps[k] = String(v);
        },
      }),
      getDocumentProperties: () => ({
        getProperty: () => null,
        setProperty: () => {},
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: () => null,
        put: () => {},
        remove: () => {},
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {},
        tryLock: () => true,
        releaseLock: () => {},
      }),
    },
    Utilities: {
      formatDate: (d: Date, _tz: string, fmt: string) => {
        const vn = new Date(d.getTime() + 7 * 3600 * 1000);
        const pad = (n: number) => String(n).padStart(2, '0');
        const yyyy = String(vn.getUTCFullYear());
        const MM = pad(vn.getUTCMonth() + 1);
        const dd = pad(vn.getUTCDate());
        const HH = pad(vn.getUTCHours());
        const mm = pad(vn.getUTCMinutes());
        const ss = pad(vn.getUTCSeconds());
        return fmt
          .replace('yyyy', yyyy)
          .replace('MM', MM)
          .replace('dd', dd)
          .replace('HH', HH)
          .replace('mm', mm)
          .replace('ss', ss);
      },
      computeDigest: () => [1, 2, 3, 4],
      DigestAlgorithm: { SHA_256: 'SHA_256' },
    },
    MailApp: { sendEmail: () => {} },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
    DriveApp: { getFolderById: () => ({ createFile: () => ({ setSharing: () => {}, getId: () => '1' }) }) },
  };

  vm.createContext(sandbox);
  const gasDir = path.resolve('gas');
  for (const file of [
    'Code.gs',
    'SheetService.gs',
    'ChecklistService.gs',
    'JsonCacheService.gs',
    'Handlers.gs',
    'Engine.gs',
    'OpsChecklistHandlers.gs',
  ]) {
    const code = fs.readFileSync(path.join(gasDir, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }

  const callDoPost = (payload: Record<string, any>) => {
    const out = sandbox.doPost({ postData: { contents: JSON.stringify(payload) } });
    return JSON.parse(out.getContent());
  };

  return { sandbox, sheetsData, callDoPost };
}

// ---------------------------------------------------------------------------
// 1. Frontend Operations Domain Logic Tests
// ---------------------------------------------------------------------------
describe('Wave 2 — Frontend Operations & Cash Reconciliation Invariants', () => {
  test('calculateCashReconciliation computes exact VNĐ discrepancy, carryover mismatch & explanation rules', async () => {
    const mod = await vite.ssrLoadModule('/src/utils/operationsReconciliation.ts');

    // Exact match case
    const matched = mod.calculateCashReconciliation({
      openingCash: '1.500.000',
      posCashRevenue: '3.250.000',
      cashExpense: '250.000',
      closingCash: '4.500.000',
      previousClosingCash: 1500000,
    });
    assert.equal(matched.openingCash, 1500000);
    assert.equal(matched.posCashRevenue, 3250000);
    assert.equal(matched.cashExpense, 250000);
    assert.equal(matched.expectedCash, 4500000);
    assert.equal(matched.closingCash, 4500000);
    assert.equal(matched.discrepancy, 0);
    assert.equal(matched.openingMismatch, 0);
    assert.equal(matched.status, 'Matched');

    // Shortage case (-120.000 đ) must require explanation
    const shortage = mod.calculateCashReconciliation({
      openingCash: 1500000,
      posCashRevenue: 2000000,
      cashExpense: 0,
      closingCash: 3380000,
      previousClosingCash: 1500000,
    });
    assert.equal(shortage.expectedCash, 3500000);
    assert.equal(shortage.discrepancy, -120000);
    assert.equal(shortage.status, 'Shortage');
    assert.equal(shortage.requiresExplanation, true);

    // Opening cash tampered vs previous shift closing cash
    const mismatchOpening = mod.calculateCashReconciliation({
      openingCash: 1200000,
      posCashRevenue: 500000,
      cashExpense: 0,
      closingCash: 1700000,
      previousClosingCash: 1500000,
    });
    assert.equal(mismatchOpening.openingMismatch, -300000);
    assert.equal(mismatchOpening.requiresExplanation, true);
  });

  test('mergeChecklistAreaState prevents concurrent staff overwrites while honoring explicit unchecks & subtask merges', async () => {
    const mod = await vite.ssrLoadModule('/src/utils/operationsReconciliation.ts');

    // Staff A saved item_1 and subtask s1 of item_shared at 10:01
    const afterStaffA = mod.mergeChecklistAreaState(
      { participants: [], items: {}, supply: {}, signatures: {} },
      {
        participants: [{ key: 'nv_a', name: 'Nguyễn Văn A', joinedAt: '2026-11-02T10:00:00.000Z' }],
        items: {
          item_1: { checked: true, note: 'Đã lau sàn', subchecks: {}, by: 'Nguyễn Văn A', at: '2026-11-02T10:01:00.000Z' },
          item_shared: {
            checked: false,
            note: '',
            subchecks: { s1: true },
            by: 'Nguyễn Văn A',
            at: '2026-11-02T10:01:00.000Z',
          },
        },
        supply: { khan_giay: true, by: 'Nguyễn Văn A', savedAt: '2026-11-02T10:01:00.000Z' },
        signatures: { receive: 'Nguyễn Văn A' },
      }
    );

    // Staff B had stale state (didn't see Staff A's item_1!) and ticks item_2 + subtask s2 of item_shared at 10:02
    const afterStaffB = mod.mergeChecklistAreaState(afterStaffA, {
      participants: [{ key: 'nv_b', name: 'Trần Thị B', joinedAt: '2026-11-02T10:02:00.000Z' }],
      // Legacy-style stale items snapshot missing item_1 + deltaItems for item_2 & item_shared
      items: {
        item_2: { checked: true, note: '', subchecks: {}, by: 'Trần Thị B', at: '2026-11-02T10:02:00.000Z' },
      },
      deltaItems: {
        item_2: { checked: true, note: '', subchecks: {}, by: 'Trần Thị B', at: '2026-11-02T10:02:00.000Z' },
        item_shared: {
          checked: true,
          note: '',
          subchecks: { s2: true },
          by: 'Trần Thị B',
          at: '2026-11-02T10:02:00.000Z',
        },
      },
      supply: { bao_rac: true, by: 'Trần Thị B', savedAt: '2026-11-02T10:02:00.000Z' },
      signatures: { handover: 'Trần Thị B' },
    });

    // Both participants preserved
    assert.equal(afterStaffB.participants.length, 2);
    // Staff A's item_1 was NOT wiped out!
    assert.equal(afterStaffB.items.item_1?.checked, true);
    assert.equal(afterStaffB.items.item_1?.note, 'Đã lau sàn');
    // Staff B's item_2 is saved
    assert.equal(afterStaffB.items.item_2?.checked, true);
    // Subtasks s1 (Staff A) and s2 (Staff B) are BOTH true!
    assert.equal(afterStaffB.items.item_shared?.subchecks?.s1, true);
    assert.equal(afterStaffB.items.item_shared?.subchecks?.s2, true);
    // Supplies & signatures merged without overwriting
    assert.equal(afterStaffB.supply.khan_giay, true);
    assert.equal(afterStaffB.supply.bao_rac, true);
    assert.equal(afterStaffB.signatures.receive, 'Nguyễn Văn A');
    assert.equal(afterStaffB.signatures.handover, 'Trần Thị B');

    // Explicit later uncheck at 10:05 MUST uncheck item_1 cleanly
    const afterExplicitUncheck = mod.mergeChecklistAreaState(afterStaffB, {
      deltaItems: {
        item_1: { checked: false, note: 'Cần lau lại', subchecks: {}, by: 'Nguyễn Văn A', at: '2026-11-02T10:05:00.000Z' },
      },
    });
    assert.equal(afterExplicitUncheck.items.item_1?.checked, false);
    assert.equal(afterExplicitUncheck.items.item_1?.note, 'Cần lau lại');
  });
});

// ---------------------------------------------------------------------------
// 2. Google Apps Script Backend Tests (Handover 2-Way, 4-State Incidents, Atomic Checklist)
// ---------------------------------------------------------------------------
describe('Wave 2 — Google Apps Script Cash Reconciliation, Incidents & Checklist Merge', () => {
  test('GAS supports 2-way cash handover reconciliation, cashier dispute, and admin REVIEW_HANDOVER', () => {
    const { callDoPost } = createGasWave2Sandbox({
      DATA: [
        ['DANH SÁCH TÀI KHOẢN'],
        ['Username', 'Password', 'Fullname', 'Phone', 'Email', 'Role', 'Position', 'Avatar', 'Status'],
        ['admin_boss', 'hash', 'Quản Lý Tổng', '', '', 'admin', 'Quản lý', '', 'active'],
        ['thu_ngan_ca1', 'hash', 'Thu Ngân Ca 1', '', '', 'user', 'Thu ngân', '', 'active'],
        ['thu_ngan_ca2', 'hash', 'Thu Ngân Ca 2', '', '', 'user', 'Thu ngân', '', 'active'],
      ],
    });

    // 1. Cashier 1 submits handover with shortage (-50.000 đ)
    const subRes = callDoPost({
      action: 'SUBMIT_HANDOVER',
      username: 'thu_ngan_ca1',
      fullname: 'Thu Ngân Ca 1',
      shift: 'Ca sáng',
      openingCash: 1000000,
      posCashRevenue: 2500000,
      cashExpense: 150000,
      closingCash: 3300000, // Expected 3.350.000 -> -50.000 shortage
      cashAmount: '3.300.000',
      note: 'Chi 150k mua đá viên, thiếu 50k tiền lẻ đang rà lại bill',
    });
    assert.equal(subRes.ok, true);
    assert.equal(subRes.data.expectedCash, 3350000);
    assert.equal(subRes.data.closingCash, 3300000);
    assert.equal(subRes.data.discrepancy, -50000);
    const handoverId = subRes.data.id;
    assert.ok(handoverId);

    // 2. Cashier 2 disputes incoming cash count
    const ackRes = callDoPost({
      action: 'ACKNOWLEDGE_HANDOVER',
      handoverId,
      username: 'thu_ngan_ca2',
      ackBy: 'Thu Ngân Ca 2',
      ackStatus: 'Disputed',
      countedCash: 3250000,
      ackNote: 'Kiểm thực tế chỉ có 3.250.000đ',
    });
    assert.equal(ackRes.ok, true);
    assert.equal(ackRes.data.reconcileStatus, 'Disputed');

    // 3. Non-admin cannot REVIEW_HANDOVER
    const deniedReview = callDoPost({
      action: 'REVIEW_HANDOVER',
      actorUsername: 'thu_ngan_ca1',
      role: 'user',
      handoverId,
      decision: 'CONFIRM',
    });
    assert.equal(deniedReview.ok, false);

    // 4. Admin reviews and confirms reconciliation resolution
    const adminReview = callDoPost({
      action: 'REVIEW_HANDOVER',
      actorUsername: 'admin_boss',
      role: 'admin',
      handoverId,
      decision: 'CONFIRM',
      managerNote: 'Đã đối chiếu bill hủy CukCuk và bù quỹ đủ',
    });
    assert.equal(adminReview.ok, true);

    const listRes = callDoPost({ action: 'GET_HANDOVERS' });
    assert.equal(listRes.ok, true);
    const latest = listRes.data.handovers[0];
    assert.equal(latest.id, handoverId);
    assert.equal(latest.openingCash, 1000000);
    assert.equal(latest.posCashRevenue, 2500000);
    assert.equal(latest.cashExpense, 150000);
    assert.equal(latest.expectedCash, 3350000);
    assert.equal(latest.closingCash, 3300000);
    assert.equal(latest.discrepancy, -50000);
    assert.equal(latest.ackStatus, 'Disputed');
    assert.equal(latest.reconcileStatus, 'ManagerConfirmed');
    assert.equal(latest.managerNote, 'Đã đối chiếu bill hủy CukCuk và bù quỹ đủ');
  });

  test('GAS supports 4-state Incident Center (Open -> Investigating -> Resolved -> CostRecorded) with RBAC', () => {
    const { callDoPost } = createGasWave2Sandbox({
      DATA: [
        ['DANH SÁCH TÀI KHOẢN'],
        ['Username', 'Password', 'Fullname', 'Phone', 'Email', 'Role', 'Position', 'Avatar', 'Status'],
        ['admin_boss', 'hash', 'Quản Lý Tổng', '', '', 'admin', 'Quản lý', '', 'active'],
        ['bep_01', 'hash', 'Đầu Bếp Hùng', '', '', 'user', 'Bếp', '', 'active'],
      ],
    });

    const createRes = callDoPost({
      action: 'SUBMIT_INCIDENT',
      username: 'bep_01',
      fullname: 'Đầu Bếp Hùng',
      shift: 'Ca tối',
      area: 'Khu C',
      severity: 'urgent',
      category: 'Thiết bị hỏng',
      description: 'Tủ đông số 2 báo lỗi cảm biến nhiệt',
      photoUrl: 'https://img.example.com/freezer.jpg',
    });
    assert.equal(createRes.ok, true);
    const incidentId = createRes.data.id;
    assert.equal(createRes.data.status, 'Open');

    // Non-admin blocked from UPDATE_INCIDENT
    const unauthUpdate = callDoPost({
      action: 'UPDATE_INCIDENT',
      actorUsername: 'bep_01',
      role: 'user',
      incidentId,
      status: 'CostRecorded',
      repairCost: 850000,
    });
    assert.equal(unauthUpdate.ok, false);

    // Admin transitions Open -> Investigating -> CostRecorded
    const step2 = callDoPost({
      action: 'UPDATE_INCIDENT',
      actorUsername: 'admin_boss',
      role: 'admin',
      incidentId,
      status: 'Investigating',
      assignedTo: 'Thợ điện lạnh Minh',
      resolutionNote: 'Đang kiểm tra cảm biến rã đông',
    });
    assert.equal(step2.ok, true);

    const step4 = callDoPost({
      action: 'UPDATE_INCIDENT',
      actorUsername: 'admin_boss',
      role: 'admin',
      incidentId,
      status: 'CostRecorded',
      assignedTo: 'Thợ điện lạnh Minh',
      resolutionNote: 'Đã thay sò lạnh mới, tủ đạt -18 độ C',
      repairCost: 850000.4,
    });
    assert.equal(step4.ok, true);

    const getRes = callDoPost({ action: 'GET_INCIDENTS', username: 'bep_01', role: 'user' });
    assert.equal(getRes.ok, true);
    assert.equal(getRes.data.incidents.length, 1);
    const inc = getRes.data.incidents[0];
    assert.equal(inc.id, incidentId);
    assert.equal(inc.status, 'CostRecorded');
    assert.equal(inc.area, 'Khu C');
    assert.equal(inc.severity, 'urgent');
    assert.equal(inc.assignedTo, 'Thợ điện lạnh Minh');
    assert.equal(inc.repairCost, 850000); // Math.round VNĐ integer
    assert.equal(getRes.data.summary.totalRepairCost, 850000);
  });

  test('GAS SAVE_OPS_CHECKLIST_STATE & PATCH_OPS_CHECKLIST_ITEM merge concurrent teammates without overwriting', () => {
    const { callDoPost } = createGasWave2Sandbox({
      DATA: [
        ['DANH SÁCH TÀI KHOẢN'],
        ['Username', 'Password', 'Fullname', 'Phone', 'Email', 'Role', 'Position', 'Avatar', 'Status'],
        ['nv_1', 'hash', 'Lê An', '', '', 'user', 'Phục vụ', '', 'active'],
        ['nv_2', 'hash', 'Phạm Bình', '', '', 'user', 'Phục vụ', '', 'active'],
      ],
    });

    const dateStr = '2026-11-02';
    // Initialize default checklist
    const initRes = callDoPost({ action: 'GET_OPS_CHECKLIST_INIT', dateStr });
    assert.equal(initRes.ok, true);

    // Teammate 1 saves start_clean_floor
    const saveA = callDoPost({
      action: 'SAVE_OPS_CHECKLIST_STATE',
      dateStr,
      area: 'A',
      participants: [{ key: 'nv_1', name: 'Lê An', joinedAt: '2026-11-02T08:00:00.000Z' }],
      items: {
        start_clean_floor: {
          checked: true,
          note: 'Sàn sạch',
          subchecks: { quet_sach_tong_the_san_khu_truc: true },
          by: 'Lê An',
          at: '2026-11-02T08:01:00.000Z',
        },
      },
      deltaItems: {
        start_clean_floor: {
          checked: true,
          note: 'Sàn sạch',
          subchecks: { quet_sach_tong_the_san_khu_truc: true },
          by: 'Lê An',
          at: '2026-11-02T08:01:00.000Z',
        },
      },
      supply: { khan_giay: true, by: 'Lê An', savedAt: '2026-11-02T08:01:00.000Z' },
      signatures: { receive: 'Lê An' },
    });
    assert.equal(saveA.ok, true);

    // Teammate 2 had stale empty items {} locally and saves start_table_setup
    const saveB = callDoPost({
      action: 'SAVE_OPS_CHECKLIST_STATE',
      dateStr,
      area: 'A',
      participants: [{ key: 'nv_2', name: 'Phạm Bình', joinedAt: '2026-11-02T08:02:00.000Z' }],
      items: {
        start_table_setup: {
          checked: true,
          note: 'Đủ chén đũa',
          subchecks: {},
          by: 'Phạm Bình',
          at: '2026-11-02T08:02:00.000Z',
        },
      },
      deltaItems: {
        start_table_setup: {
          checked: true,
          note: 'Đủ chén đũa',
          subchecks: {},
          by: 'Phạm Bình',
          at: '2026-11-02T08:02:00.000Z',
        },
      },
      supply: { diem: true, by: 'Phạm Bình', savedAt: '2026-11-02T08:02:00.000Z' },
      signatures: { handover: 'Phạm Bình' },
    });
    assert.equal(saveB.ok, true);

    // Reload and verify BOTH items, BOTH participants, BOTH supplies & signatures survived!
    const reloadRes = callDoPost({ action: 'GET_OPS_CHECKLIST_INIT', dateStr });
    const areaA = reloadRes.data.states.A;
    assert.equal(areaA.participants.length, 2);
    assert.equal(areaA.items.start_clean_floor?.checked, true);
    assert.equal(areaA.items.start_table_setup?.checked, true);
    assert.equal(areaA.supply.khan_giay, true);
    assert.equal(areaA.supply.diem, true);
    assert.equal(areaA.signatures.receive, 'Lê An');
    assert.equal(areaA.signatures.handover, 'Phạm Bình');
  });
});

// ---------------------------------------------------------------------------
// 3. Cloudflare Edge Gateway RBAC & Legacy-GAS Fallback Tests
// ---------------------------------------------------------------------------
describe('Wave 2 — Cloudflare Edge RBAC & Legacy-GAS Compatibility', () => {
  test('Edge blocks non-admin REVIEW_HANDOVER & UPDATE_INCIDENT with 403', async () => {
    const edgeMod = await import('../functions/api.js');

    for (const action of ['REVIEW_HANDOVER', 'UPDATE_INCIDENT']) {
      const req = new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, role: 'user', actorUsername: 'staff_01' }),
      });
      const res = await edgeMod.onRequest({
        request: req,
        env: {},
        waitUntil: () => {},
      });
      assert.equal(res.status, 403, `Expected 403 for non-admin ${action}`);
    }
  });

  test('Edge fulfills GET_INCIDENTS, UPDATE_INCIDENT & REVIEW_HANDOVER cleanly when live GAS has not been clasp-pushed yet', async () => {
    const edgeMod = await import('../functions/api.js');
    const origFetch = globalThis.fetch;

    try {
      // Simulate live GAS before clasp push returning Unknown action
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ ok: false, message: 'Unknown action' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const getIncReq = new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GET_INCIDENTS', role: 'user', username: 'staff_01' }),
      });
      const getIncRes = await edgeMod.onRequest({
        request: getIncReq,
        env: {},
        waitUntil: () => {},
      });
      assert.equal(getIncRes.status, 200);
      const getIncBody = await getIncRes.json();
      assert.equal(getIncBody.ok, true);
      assert.ok(Array.isArray(getIncBody.data.incidents));

      const updIncReq = new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_INCIDENT',
          role: 'admin',
          actorUsername: 'admin_boss',
          incidentId: 'INC_101',
          status: 'Resolved',
          repairCost: 250000,
        }),
      });
      const updIncRes = await edgeMod.onRequest({
        request: updIncReq,
        env: {},
        waitUntil: () => {},
      });
      const updIncBody = await updIncRes.json();
      assert.equal(updIncBody.ok, true);
      assert.equal(updIncBody.data.status, 'Resolved');
      assert.equal(updIncBody.data.repairCost, 250000);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
