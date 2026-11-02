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
// In-Memory GAS Sandbox (Loads Real gas/*.gs Files)
// ---------------------------------------------------------------------------
function createGasWave3Sandbox(initialSheets: Record<string, any[][]> = {}) {
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
      insertRowBefore: (beforePos: number) => {
        sheetsData[name].splice(beforePos - 1, 0, []);
      },
      insertRowAfter: (afterPos: number) => {
        sheetsData[name].splice(afterPos, 0, []);
      },
      insertRowsAfter: (afterPos: number, howMany: number) => {
        const empty = Array.from({ length: howMany }, () => []);
        sheetsData[name].splice(afterPos, 0, ...empty);
      },
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
      getRange: (row1: number | string, col1?: number, numRows = 1, numCols = 1) => {
        const rStart = typeof row1 === 'number' ? row1 : 1;
        const cStart = typeof col1 === 'number' ? col1 : 1;
        const rangeObj = {
          getValue: () => sheetsData[name]?.[rStart - 1]?.[cStart - 1] ?? '',
          getDisplayValue: () => String(sheetsData[name]?.[rStart - 1]?.[cStart - 1] ?? ''),
          getFormula: () => '',
          getValues: () => {
            const out: any[][] = [];
            for (let r = 0; r < numRows; r++) {
              const line: any[] = [];
              for (let c = 0; c < numCols; c++) {
                line.push(sheetsData[name]?.[rStart - 1 + r]?.[cStart - 1 + c] ?? '');
              }
              out.push(line);
            }
            return out;
          },
          setValue: (val: any) => {
            ensureCell(rStart, cStart);
            sheetsData[name][rStart - 1][cStart - 1] = val;
            return rangeObj;
          },
          setValues: (vals: any[][]) => {
            for (let r = 0; r < vals.length; r++) {
              for (let c = 0; c < vals[r].length; c++) {
                ensureCell(rStart + r, cStart + c);
                sheetsData[name][rStart - 1 + r][cStart - 1 + c] = vals[r][c];
              }
            }
            return rangeObj;
          },
          setNumberFormat: () => rangeObj,
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
        const H = String(vn.getUTCHours());
        const mm = pad(vn.getUTCMinutes());
        const m = String(vn.getUTCMinutes());
        const ss = pad(vn.getUTCSeconds());
        return fmt
          .replace('yyyy', yyyy)
          .replace('MM', MM)
          .replace('dd', dd)
          .replace('HH', HH)
          .replace(/\bH\b/g, H)
          .replace('mm', mm)
          .replace(/\bm\b/g, m)
          .replace('ss', ss);
      },
      computeDigest: () => [1, 2, 3, 4],
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
    },
    MailApp: { sendEmail: () => {} },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
    DriveApp: { getFolderById: () => ({ createFile: () => ({ setSharing: () => {}, getId: () => '1', getUrl: () => 'https://drive.test/1' }) }) },
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
// 1. Smart Shift Swap & 1-Tap Copy Previous Week Tests
// ---------------------------------------------------------------------------
describe('Wave 3 — Smart Shift Swap Validator & 1-Tap Copy Previous Week', () => {
  test('validateSmartShiftSwap catches shift conflicts, inactive staff, and weekly OT overload', async () => {
    const mod = await vite.ssrLoadModule('/src/utils/shiftSwapValidator.ts');

    // Case 1: Coworker already has an active shift on the same day -> hard conflict
    const conflict = mod.validateSmartShiftSwap({
      dayIndex: 4, // Friday
      requesterShift: '17:00',
      targetEmployee: { username: 'nv_b', fullname: 'Trần Thị B', employmentStatus: 'active' },
      targetWeekShifts: ['17:00', 'OFF', '17:00', 'OFF', '18:00', '17:00', 'OFF'],
    });
    assert.equal(conflict.valid, false);
    assert.equal(conflict.hasConflict, true);
    assert.match(conflict.reason || '', /18:00/);

    // Case 2: Coworker is suspended/resigned -> blocked
    const inactive = mod.validateSmartShiftSwap({
      dayIndex: 1,
      requesterShift: '17:00',
      targetEmployee: { username: 'nv_old', fullname: 'Lê Văn Cũ', employmentStatus: 'resigned' },
      targetWeekShifts: ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'],
    });
    assert.equal(inactive.valid, false);

    // Case 3: Coworker is OFF on Tuesday, already works 6 shifts -> taking 7th triggers OT warning
    const otWarn = mod.validateSmartShiftSwap({
      dayIndex: 1,
      requesterShift: '10:00-22:00',
      targetEmployee: { username: 'nv_cham', fullname: 'Phạm Chăm Chỉ', employmentStatus: 'active' },
      targetWeekShifts: ['10:00-18:00', 'OFF', '10:00-18:00', '10:00-18:00', '10:00-18:00', '10:00-18:00', '10:00-18:00'],
    });
    assert.equal(otWarn.valid, true);
    assert.equal(otWarn.hasConflict, false);
    assert.equal(otWarn.hasOtWarning, true);
    assert.equal(otWarn.canProceedWithWarning, true);
    assert.equal(otWarn.projectedShiftsCount, 7);
    assert.ok(otWarn.projectedHours > 48);

    // Case 4: Clean swap (coworker OFF, only 4 shifts in week)
    const clean = mod.validateSmartShiftSwap({
      dayIndex: 1,
      requesterShift: '17:00',
      targetEmployee: { username: 'nv_ok', fullname: 'Nguyễn An', employmentStatus: 'active' },
      targetWeekShifts: ['17:00', 'OFF', '17:00', 'OFF', '17:00', 'OFF', 'OFF'],
    });
    assert.equal(clean.valid, true);
    assert.equal(clean.hasConflict, false);
    assert.equal(clean.hasOtWarning, false);
    assert.equal(clean.projectedShiftsCount, 4);
  });

  test('mapPreviousWeekToTargetSchedules copies previous week cleanly without wiping already-registered staff unless requested', async () => {
    const mod = await vite.ssrLoadModule('/src/utils/shiftSwapValidator.ts');

    // Employee 1-tap copy
    const empMap = mod.buildEmployeeShiftMapFromPrevious(
      ['17:00', 'OFF', '18:00', '', '17:00', '16:00', 'OFF'],
      ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']
    );
    assert.equal(empMap['2026-11-09'], '17:00');
    assert.equal(empMap['2026-11-12'], 'OFF');
    assert.equal(empMap['2026-11-14'], '16:00');

    // Admin 1-tap copy: Emp 1 already registered for next week, Emp 2 has empty schedule
    const currentAdmin = [
      {
        username: 'emp1',
        fullname: 'Nguyễn Văn Một',
        shifts: ['18:00', '18:00', 'OFF', '18:00', '18:00', '18:00', 'OFF'],
        isRegistered: true,
        hasApproved: false,
      },
      {
        username: 'emp2',
        fullname: 'Trần Thị Hai',
        shifts: ['', '', '', '', '', '', ''],
        isRegistered: false,
        hasApproved: false,
      },
    ];
    const prevWeek = [
      {
        username: 'emp1',
        fullname: 'Nguyễn Văn Một',
        shifts: ['09:00', '09:00', '09:00', '09:00', '09:00', 'OFF', 'OFF'],
      },
      {
        username: 'emp2',
        fullname: 'Trần Thị Hai',
        shifts: ['17:00', 'OFF', '17:00', '17:00', '16:00', '16:00', 'OFF'],
      },
    ];

    const safeCopy = mod.mapPreviousWeekToTargetSchedules({
      currentSchedules: currentAdmin,
      previousSchedules: prevWeek,
      overwriteExisting: false,
    });
    assert.equal(safeCopy.copiedEmployeeCount, 1);
    assert.deepEqual(safeCopy.updatedSchedules[0].shifts, ['18:00', '18:00', 'OFF', '18:00', '18:00', '18:00', 'OFF']);
    assert.deepEqual(safeCopy.updatedSchedules[1].shifts, ['17:00', 'OFF', '17:00', '17:00', '16:00', '16:00', 'OFF']);
  });
});

// ---------------------------------------------------------------------------
// 2. Payroll 4-Step Workflow, Bank CSV & A5 Payslip Tests
// ---------------------------------------------------------------------------
describe('Wave 3 — Payroll 4-Step Workflow, Bank CSV & Printable A5 Payslip', () => {
  test('generatePayrollBankCsv & buildPrintableA5PayslipHtml enforce integer VNĐ, UTF-8 BOM, NAPAS ASCII & XSS safety', async () => {
    const mod = await vite.ssrLoadModule('/src/utils/payrollWorkflow.ts');

    const records = [
      {
        username: 'nv_an',
        fullname: 'Nguyễn Văn An',
        payType: 'hourly',
        baseSalaryPerHour: 28000,
        salaryAmount: 28000,
        totalHours: 100.5,
        regularHours: 95.5,
        overtimeHours: 5,
        workedDays: 24,
        totalBaseSalary: 2814000.4,
        bonus: 200000,
        penalty: 50000,
        advances: 500000,
        netPay: 2464000.4,
        isConfigured: true,
        bankName: 'Vietcombank',
        bankAccount: '0123456789',
      },
    ];

    const csv = mod.generatePayrollBankCsv(records, '2026-11', {
      nv_an: { status: 'CONFIRMED', updatedAt: '02/11/2026 09:00' },
    });
    assert.ok(csv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM for Excel');
    assert.ok(csv.includes('2464000'), 'Net pay must be rounded integer VNĐ');
    assert.ok(!csv.includes('2464000.4'), 'Must never emit fractional VNĐ');
    assert.ok(csv.includes('KING GRILL LUONG T11 2026 NGUYEN VAN AN'));

    const html = mod.buildPrintableA5PayslipHtml({
      record: { ...records[0], fullname: 'Nguyễn <script>alert(1)</script> An' },
      month: '2026-11',
      workflowStatus: 'Locked',
      confirmation: { status: 'CONFIRMED', updatedAt: '02/11/2026 09:00' },
    });
    assert.ok(html.includes('size: A5'));
    assert.ok(!html.includes('<script>alert(1)</script>'), 'Must escape HTML in payslip');
    assert.ok(html.includes('2.464.000'));
  });
});

// ---------------------------------------------------------------------------
// 3. Google Apps Script Backend Tests (Payroll 4-Step Lock, Swap Conflict, Audit_Logs)
// ---------------------------------------------------------------------------
describe('Wave 3 — GAS Backend Payroll Workflow, Smart Swap & Audit_Logs', () => {
  test('GAS enforces 4-step payroll workflow, auto-flips to Disputed on staff dispute, and locks salary edits when Locked', () => {
    const { callDoPost } = createGasWave3Sandbox({
      DATA: [
        ['DANH SÁCH TÀI KHOẢN'],
        ['Username', 'Password', 'Fullname', 'Phone', 'Email', 'Role', 'Position', 'Avatar', 'Status'],
        ['admin_boss', 'hash', 'Quản Lý Tổng', '', '', 'admin', 'Quản lý', '', 'active'],
        ['nv_1', 'hash', 'Nhân Viên Một', '', '', 'user', 'Phục vụ', '', 'active'],
        ['nv_2', 'hash', 'Nhân Viên Hai', '', '', 'user', 'Thu ngân', '', 'active'],
      ],
    });

    // 1. Admin configures November 2026 salary while in Draft
    const saveCfg = callDoPost({
      action: 'UPDATE_MONTHLY_SALARY_CONFIG',
      username: 'admin_boss',
      role: 'admin',
      month: '2026-11',
      items: [
        { username: 'nv_1', fullname: 'Nhân Viên Một', payType: 'hourly', amount: 25000 },
        { username: 'nv_2', fullname: 'Nhân Viên Hai', payType: 'hourly', amount: 28000 },
      ],
    });
    assert.equal(saveCfg.ok, true);

    // 2. Admin transitions 2026-11 -> Staff_Confirming
    const step2 = callDoPost({
      action: 'SET_PAYROLL_WORKFLOW_STATUS',
      actorUsername: 'admin_boss',
      role: 'admin',
      month: '2026-11',
      status: 'Staff_Confirming',
      note: 'Vui lòng kiểm tra công lương trước 17:00 ngày 03/11',
    });
    assert.equal(step2.ok, true);
    assert.equal(step2.data.workflow.status, 'Staff_Confirming');

    // 3. Staff 1 confirms, Staff 2 disputes -> workflow auto-transitions to Disputed!
    const c1 = callDoPost({
      action: 'CONFIRM_PAYROLL_SLIP',
      username: 'nv_1',
      fullname: 'Nhân Viên Một',
      month: '2026-11',
      decision: 'CONFIRMED',
    });
    assert.equal(c1.ok, true);

    const c2 = callDoPost({
      action: 'CONFIRM_PAYROLL_SLIP',
      username: 'nv_2',
      fullname: 'Nhân Viên Hai',
      month: '2026-11',
      decision: 'DISPUTED',
      note: 'Thiếu 4.5h tăng ca ngày 28/11',
    });
    assert.equal(c2.ok, true);
    assert.equal(c2.data.workflow.status, 'Disputed');

    // 4. Staff GET_PAYROLL only sees their own confirmation, Admin sees all confirmations
    const staffPayroll = callDoPost({
      action: 'GET_PAYROLL',
      username: 'nv_1',
      role: 'user',
      month: '2026-11',
    });
    assert.equal(staffPayroll.ok, true);
    assert.equal(staffPayroll.data.workflow.status, 'Disputed');
    assert.ok(staffPayroll.data.workflow.confirmations.nv_1);
    assert.equal(staffPayroll.data.workflow.confirmations.nv_2, undefined);

    // 5. Admin resolves & locks payroll -> Locked blocks accidental salary config overwrites!
    const lockRes = callDoPost({
      action: 'SET_PAYROLL_WORKFLOW_STATUS',
      actorUsername: 'admin_boss',
      role: 'admin',
      month: '2026-11',
      status: 'Locked',
      note: 'Đã cộng đủ 4.5h cho NV Hai và chốt sổ chuyển khoản',
    });
    assert.equal(lockRes.ok, true);
    assert.equal(lockRes.data.workflow.status, 'Locked');

    const blockedEdit = callDoPost({
      action: 'UPDATE_MONTHLY_SALARY_CONFIG',
      username: 'admin_boss',
      role: 'admin',
      month: '2026-11',
      items: [{ username: 'nv_1', fullname: 'Nhân Viên Một', payType: 'hourly', amount: 20000 }],
    });
    assert.equal(blockedEdit.ok, false);
    assert.match(blockedEdit.message || '', /khóa sổ/i);
  });

  test('GAS blocks double-booked ACCEPT_SWAP and records redacted Audit_Logs for sensitive mutations', () => {
    const { callDoPost } = createGasWave3Sandbox({
      DATA: [
        ['DANH SÁCH TÀI KHOẢN'],
        ['Username', 'Password', 'Fullname', 'Phone', 'Email', 'Role', 'Position', 'Avatar', 'Status'],
        ['admin_boss', 'hash', 'Quản Lý Tổng', '', '', 'admin', 'Quản lý', '', 'active'],
        ['nv_xin', 'hash', 'Lê Xin Đổi', '', '', 'user', 'Phục vụ', '', 'active'],
        ['nv_trung', 'hash', 'Phạm Trùng Ca', '', '', 'user', 'Phục vụ', '', 'active'],
        ['nv_ranh', 'hash', 'Hoàng Rảnh Ca', '', '', 'user', 'Phục vụ', '', 'active'],
      ],
      'Tháng 11/2026': [
        ['📅 TUẦN 02/11 - 08/11', '', '', '', '', '', '', ''],
        ['Nhân viên', '02/11', '03/11', '04/11', '05/11', '06/11', '07/11', '08/11'],
        ['┗ Lê Xin Đổi', '17:00', 'OFF', '17:00', 'OFF', '17:00', 'OFF', 'OFF'],
        ['┗ Phạm Trùng Ca', '18:00', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'],
        ['┗ Hoàng Rảnh Ca', 'OFF', '17:00', 'OFF', '17:00', 'OFF', 'OFF', 'OFF'],
      ],
    });

    // 1. Submit swap for 02/11
    const subSwap = callDoPost({
      action: 'SUBMIT_SWAP',
      username: 'nv_xin',
      fullname: 'Lê Xin Đổi',
      dayName: 'Thứ Hai',
      date: '02/11',
      shift: '17:00',
      reason: 'Thi học kỳ',
      targetUsername: 'ALL',
      monthSheet: 'Tháng 11/2026',
    });
    assert.equal(subSwap.ok, true);
    const swaps = callDoPost({ action: 'GET_SWAP_REQUESTS', username: 'nv_ranh', role: 'user' }).data;
    const swapId = swaps[0].id;

    // 2. Coworker who already works 18:00 on 02/11 is blocked from accepting!
    const conflictAccept = callDoPost({
      action: 'ACCEPT_SWAP',
      swapId,
      targetUsername: 'nv_trung',
      targetFullname: 'Phạm Trùng Ca',
    });
    assert.equal(conflictAccept.ok, false);
    assert.match(conflictAccept.message || '', /trùng|đã có ca/i);

    // 3. Free coworker accepts cleanly, then Admin approves
    const okAccept = callDoPost({
      action: 'ACCEPT_SWAP',
      swapId,
      targetUsername: 'nv_ranh',
      targetFullname: 'Hoàng Rảnh Ca',
    });
    assert.equal(okAccept.ok, true);

    const approveSwap = callDoPost({
      action: 'APPROVE_SWAP',
      actorUsername: 'admin_boss',
      role: 'admin',
      swapId,
      decision: 'APPROVE',
    });
    assert.equal(approveSwap.ok, true);

    // 4. Sensitive admin mutations write Audit_Logs and redact secrets
    callDoPost({
      action: 'ADD_BONUS_PENALTY',
      actorUsername: 'admin_boss',
      role: 'admin',
      targetUsername: 'nv_ranh',
      targetFullname: 'Hoàng Rảnh Ca',
      type: 'BONUS',
      amount: 100000,
      reason: 'Hỗ trợ nhận ca gấp',
    });

    callDoPost({
      action: 'SYNC_KEYS',
      actorUsername: 'admin_boss',
      role: 'admin',
      keys: ['gsk_SUPER_SECRET_RAW_KEY_DO_NOT_LOG_12345'],
    });

    // Non-admin cannot read Audit_Logs
    const deniedAudit = callDoPost({
      action: 'GET_AUDIT_LOGS',
      username: 'nv_ranh',
      role: 'user',
    });
    assert.equal(deniedAudit.ok, false);

    const auditRes = callDoPost({
      action: 'GET_AUDIT_LOGS',
      actorUsername: 'admin_boss',
      role: 'admin',
      limit: 20,
    });
    assert.equal(auditRes.ok, true);
    const logs = auditRes.data.logs;
    assert.ok(Array.isArray(logs) && logs.length >= 3);
    const serialized = JSON.stringify(logs);
    assert.ok(serialized.includes('APPROVE_SWAP'));
    assert.ok(serialized.includes('ADD_BONUS_PENALTY'));
    assert.ok(
      !serialized.includes('gsk_SUPER_SECRET_RAW_KEY_DO_NOT_LOG_12345'),
      'Audit logs must NEVER leak raw API keys!'
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Cloudflare Edge Gateway Wave 3 Tests (RBAC + Legacy GAS Fallback + D1 Overlay)
// ---------------------------------------------------------------------------
function createEdgeWave3MockD1() {
  const payrollWorkflow = new Map<string, any>();
  const auditLogs: any[] = [];

  return {
    payrollWorkflow,
    auditLogs,
    prepare(sql: string) {
      const norm = sql.replace(/\s+/g, ' ').trim();
      let bound: any[] = [];
      const stmt = {
        bind(...args: any[]) {
          bound = args;
          return stmt;
        },
        async run() {
          if (norm.startsWith('INSERT INTO edge_payroll_workflow')) {
            payrollWorkflow.set(String(bound[0]), {
              month: String(bound[0]),
              workflow_json: String(bound[1]),
              updated_at: Number(bound[2]),
            });
          } else if (norm.startsWith('INSERT INTO edge_audit_logs')) {
            auditLogs.unshift({
              id: String(bound[0]),
              actor: String(bound[1]),
              action: String(bound[2]),
              target: String(bound[3]),
              summary: String(bound[4]),
              record_json: String(bound[5]),
              created_at: Number(bound[6]),
            });
          }
          return { success: true };
        },
        async first() {
          if (norm.includes('COUNT(*) as c')) return { c: 0 };
          if (norm.includes('FROM edge_payroll_workflow WHERE month = ?1')) {
            return payrollWorkflow.get(String(bound[0])) ?? null;
          }
          return null;
        },
        async all() {
          if (norm.includes('FROM edge_audit_logs')) {
            return { results: auditLogs.slice(0, 50) };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
    async batch(stmts: any[]) {
      for (const s of stmts) await s.run();
      return [];
    },
  };
}

describe('Wave 3 — Cloudflare Edge Gateway RBAC, Payroll Workflow & Audit Logs Fallback', () => {
  test('Edge blocks non-admin SET_PAYROLL_WORKFLOW_STATUS / GET_AUDIT_LOGS (403) and fulfills legacy GAS via D1', async () => {
    const edgeMod = await import('../functions/api.js');
    const mockDb = createEdgeWave3MockD1();
    const origFetch = globalThis.fetch;

    globalThis.fetch = async (_input: any, init?: any) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.action === 'GET_PAYROLL') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              payroll: [{ username: 'nv_1', fullname: 'Nhân Viên Một', netPay: 2500000, isConfigured: true }],
            },
          }),
          { status: 200 }
        );
      }
      // Simulate unpushed live GAS returning Unknown action for Wave 3 endpoints
      return new Response(JSON.stringify({ ok: false, message: 'Unknown action' }), { status: 200 });
    };

    try {
      const invokeEdge = async (payload: Record<string, any>) => {
        const req = new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const pending: Promise<any>[] = [];
        const res = await edgeMod.onRequest({
          request: req,
          env: { DB: mockDb, SESSION_SECRET: 'wave3-secret' },
          waitUntil: (p: Promise<any>) => pending.push(p),
        });
        await Promise.all(pending);
        return { status: res.status, json: await res.json() };
      };

      // 1. Staff blocked from SET_PAYROLL_WORKFLOW_STATUS & GET_AUDIT_LOGS
      const staffDenied1 = await invokeEdge({
        action: 'SET_PAYROLL_WORKFLOW_STATUS',
        role: 'user',
        month: '2026-11',
        status: 'Locked',
      });
      assert.equal(staffDenied1.status, 403);

      const staffDenied2 = await invokeEdge({
        action: 'GET_AUDIT_LOGS',
        role: 'user',
      });
      assert.equal(staffDenied2.status, 403);

      // 2. Admin sets Staff_Confirming on Edge fallback -> Staff disputes -> GET_PAYROLL reflects Disputed!
      const adminStep = await invokeEdge({
        action: 'SET_PAYROLL_WORKFLOW_STATUS',
        role: 'admin',
        actorUsername: 'admin_boss',
        month: '2026-11',
        status: 'Staff_Confirming',
      });
      assert.equal(adminStep.status, 200);
      assert.equal(adminStep.json.ok, true);

      const staffDispute = await invokeEdge({
        action: 'CONFIRM_PAYROLL_SLIP',
        username: 'nv_1',
        fullname: 'Nhân Viên Một',
        month: '2026-11',
        decision: 'DISPUTED',
        note: 'Thiếu phụ cấp ca tối',
      });
      assert.equal(staffDispute.status, 200);
      assert.equal(staffDispute.json.ok, true);

      const getPayroll = await invokeEdge({
        action: 'GET_PAYROLL',
        role: 'admin',
        username: 'admin_boss',
        month: '2026-11',
        forceRefresh: true,
      });
      assert.equal(getPayroll.json.ok, true);
      assert.equal(getPayroll.json.data.workflow.status, 'Disputed');
      assert.equal(getPayroll.json.data.workflow.confirmations.nv_1.status, 'DISPUTED');

      // 3. Admin reads Audit Logs from Edge fallback
      const auditLogs = await invokeEdge({
        action: 'GET_AUDIT_LOGS',
        role: 'admin',
        actorUsername: 'admin_boss',
        forceRefresh: true,
      });
      assert.equal(auditLogs.status, 200);
      assert.equal(auditLogs.json.ok, true);
      assert.ok(auditLogs.json.data.logs.length >= 1);
      assert.equal(auditLogs.json.data.logs[0].action, 'SET_PAYROLL_WORKFLOW_STATUS');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
