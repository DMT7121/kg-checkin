import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createServer, type ViteDevServer } from 'vite';

// ---------------------------------------------------------------------------
// Minimal Browser Storage Shim for Node Test Environment
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

const localStore = new MemoryStorage();
const sessionStore = new MemoryStorage();
(globalThis as any).localStorage = localStore;
(globalThis as any).sessionStorage = sessionStore;
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
// In-Memory Google Apps Script Sandbox (Loads Real gas/*.gs Files)
// ---------------------------------------------------------------------------
function createGasSandbox(
  initialSheets: Record<string, any[][]>,
  fixedNowIso = '2026-11-15T10:00:00+07:00'
) {
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
      getIndex: () => Object.keys(sheetsData).indexOf(name) + 1,
      activate: () => {},
      setFrozenRows: () => {},
      getLastRow: () => sheetsData[name].length,
      getLastColumn: () =>
        sheetsData[name].reduce((max, row) => Math.max(max, row.length), 0),
      appendRow: (row: any[]) => {
        sheetsData[name].push([...row]);
      },
      insertRowBefore: (beforeRow1: number) => {
        const idx = Math.max(0, beforeRow1 - 1);
        sheetsData[name].splice(idx, 0, []);
      },
      deleteRow: (r1: number) => {
        sheetsData[name].splice(r1 - 1, 1);
      },
      deleteRows: (rowIndex1: number, howMany: number) => {
        sheetsData[name].splice(rowIndex1 - 1, howMany);
      },
      getDataRange: () => ({
        getValues: () =>
          sheetsData[name].length === 0 ? [['']] : sheetsData[name].map((r) => [...r]),
        getDisplayValues: () =>
          sheetsData[name].length === 0
            ? [['']]
            : sheetsData[name].map((r) => r.map((cell) => String(cell ?? ''))),
      }),
      getRange: (row1: number | string, col1?: number, numRows = 1, numCols = 1) => {
        let rStart = typeof row1 === 'number' ? row1 : 1;
        let cStart = col1 ?? 1;
        if (typeof row1 === 'string') {
          rStart = 1;
          cStart = 1;
        }
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
          clearContent: () => {
            for (let r = 0; r < numRows; r++) {
              for (let c = 0; c < numCols; c++) {
                if (sheetsData[name]?.[rStart - 1 + r]) {
                  sheetsData[name][rStart - 1 + r][cStart - 1 + c] = '';
                }
              }
            }
            return rangeObj;
          },
          merge: () => rangeObj,
          setBackground: () => rangeObj,
          setFontColor: () => rangeObj,
          setFontWeight: () => rangeObj,
          setFontSize: () => rangeObj,
          setHorizontalAlignment: () => rangeObj,
          setNumberFormat: () => rangeObj,
        };
        return rangeObj;
      },
    };
  }

  const ssObj = {
    getId: () => 'TEST_SPREADSHEET_ID',
    getSpreadsheetLocale: () => 'vi_VN',
    getSpreadsheetTimeZone: () => 'Asia/Ho_Chi_Minh',
    getSheetByName: (n: string) => (sheetsData[n] ? makeSheet(n) : null),
    getSheets: () => Object.keys(sheetsData).map((n) => makeSheet(n)),
    insertSheet: (n: string) => {
      sheetsData[n] = [];
      return makeSheet(n);
    },
    deleteSheet: (s: any) => {
      delete sheetsData[s.getName()];
    },
    moveActiveSheet: () => {},
  };

  const scriptCache = new Map<string, string>();
  const scriptProps = new Map<string, string>();
  const FixedDate = class extends Date {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(fixedNowIso);
      } else {
        // @ts-expect-error spread into Date
        super(...args);
      }
    }
    static now() {
      return new Date(fixedNowIso).getTime();
    }
  };

  const sandbox: Record<string, any> = {
    console,
    Date: FixedDate,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
    Logger: { log: () => {} },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        waitLock: () => {},
        releaseLock: () => {},
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => scriptCache.get(k) ?? null,
        put: (k: string, v: string) => scriptCache.set(k, v),
        remove: (k: string) => scriptCache.delete(k),
        removeAll: (keys: string[]) => keys.forEach((k) => scriptCache.delete(k)),
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => scriptProps.get(k) ?? null,
        setProperty: (k: string, v: string) => scriptProps.set(k, v),
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt: string) => ({
        _text: txt,
        setMimeType() {
          return this;
        },
        getContent() {
          return txt;
        },
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_alg: string, input: string) =>
        Array.from(Buffer.from(String(input), 'utf8')),
      computeHmacSha256Signature: (value: string, key: string) =>
        Array.from(Buffer.from(`${value}:${key}`, 'utf8')),
      base64EncodeWebSafe: (bytes: number[] | string) =>
        Buffer.from(Array.isArray(bytes) ? bytes : String(bytes)).toString('base64url'),
      formatDate: (d: Date, _tz: string, fmt: string) => {
        const utcMs = d.getTime() + 7 * 3600 * 1000;
        const vn = new Date(utcMs);
        const yyyy = String(vn.getUTCFullYear());
        const MM = String(vn.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(vn.getUTCDate()).padStart(2, '0');
        const HH = String(vn.getUTCHours()).padStart(2, '0');
        const H = String(vn.getUTCHours());
        const mm = String(vn.getUTCMinutes()).padStart(2, '0');
        const m = String(vn.getUTCMinutes());
        const ss = String(vn.getUTCSeconds()).padStart(2, '0');
        if (fmt === 'yyyy-MM-dd') return `${yyyy}-${MM}-${dd}`;
        if (fmt === 'yyyy-MM') return `${yyyy}-${MM}`;
        if (fmt === 'dd/MM/yyyy') return `${dd}/${MM}/${yyyy}`;
        if (fmt === 'dd/MM/yyyy HH:mm:ss') return `${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}`;
        if (fmt === 'dd/MM/yyyy HH:mm') return `${dd}/${MM}/${yyyy} ${HH}:${mm}`;
        if (fmt === 'dd/MM HH:mm') return `${dd}/${MM} ${HH}:${mm}`;
        if (fmt === 'HH:mm') return `${HH}:${mm}`;
        if (fmt === 'H') return H;
        if (fmt === 'm') return m;
        return `${dd}/${MM}/${yyyy} ${HH}:${mm}`;
      },
    },
    SpreadsheetApp: {
      openById: () => ssObj,
      getActiveSpreadsheet: () => ssObj,
    },
    Sheets: {
      Spreadsheets: {
        Values: {
          batchGet: (_id: string, opts: { ranges: string[] }) => ({
            valueRanges: opts.ranges.map((r) => {
              const sheetName = r.split('!')[0].replace(/^'|'$/g, '');
              return { values: sheetsData[sheetName] || [] };
            }),
          }),
          get: (_id: string, range: string) => {
            const sheetName = range.split('!')[0].replace(/^'|'$/g, '');
            return { values: sheetsData[sheetName] || [] };
          },
          update: (body: { values: any[][] }, _id: string, range: string) => {
            const [rawSheet, cellRange] = range.split('!');
            const sheetName = rawSheet.replace(/^'|'$/g, '');
            const startMatch = cellRange?.match(/([A-Z]+)(\d+)/);
            const colChar = startMatch?.[1] || 'A';
            const rowNum = parseInt(startMatch?.[2] || '1', 10);
            const colIdx = colChar.charCodeAt(0) - 65 + 1;
            makeSheet(sheetName).getRange(rowNum, colIdx, body.values.length, body.values[0].length).setValues(body.values);
          },
          append: (body: { values: any[][] }, _id: string, range: string) => {
            const sheetName = range.split('!')[0].replace(/^'|'$/g, '');
            for (const r of body.values) {
              makeSheet(sheetName).appendRow(r);
            }
          },
          batchClear: (body: { ranges: string[] }) => {
            for (const range of body.ranges || []) {
              const [rawSheet, cellRange] = range.split('!');
              const sheetName = rawSheet.replace(/^'|'$/g, '');
              const rowMatch = cellRange?.match(/[A-Z]+(\d+)/);
              if (rowMatch) {
                const rNum = parseInt(rowMatch[1], 10);
                if (sheetsData[sheetName]?.[rNum - 1]) {
                  sheetsData[sheetName][rNum - 1] = ['', '', ''];
                }
              }
            }
          },
          clear: (_body: any, _id: string, range: string) => {
            const sheetName = range.split('!')[0].replace(/^'|'$/g, '');
            if (sheetsData[sheetName]?.length > 1) {
              sheetsData[sheetName] = [sheetsData[sheetName][0]];
            }
          },
        },
      },
    },
  };

  vm.createContext(sandbox);
  const gasDir = path.resolve(process.cwd(), 'gas');
  for (const file of [
    'Code.gs',
    'JsonCacheService.gs',
    'Handlers.gs',
    'Engine.gs',
    'ControlCenterService.gs',
    'ChecklistService.gs',
    'OpsChecklistHandlers.gs',
  ]) {
    const code = fs.readFileSync(path.join(gasDir, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }

  return {
    sheetsData,
    callDoPost(payload: Record<string, any>) {
      const out = sandbox.doPost({ postData: { contents: JSON.stringify(payload) } });
      return JSON.parse(out.getContent());
    },
  };
}

// ---------------------------------------------------------------------------
// Helper to build realistic large Google Sheets attendance dataset (>1,500 rows)
// ---------------------------------------------------------------------------
function buildLargeAttendanceWorkbook() {
  const header = ['HỌ VÀ TÊN', 'LOẠI CA', 'THỜI GIAN', 'VỊ TRÍ', 'TRẠNG THÁI', 'KHOẢNG CÁCH', 'HÌNH ẢNH', 'DATA JSON'];

  const mainLogs: any[][] = [header];
  // 1) Top 70 punches for nhanvien_a ('Đặng Thị Hồng Ánh') in November 2026
  for (let i = 0; i < 70; i++) {
    const day = String((i % 15) + 1).padStart(2, '0');
    const hour = i % 2 === 0 ? '08' : '17';
    const min = String(i % 60).padStart(2, '0');
    const type = i % 2 === 0 ? 'Vào ca' : 'Ra ca';
    mainLogs.push([
      'Đặng Thị Hồng Ánh',
      type,
      `'${day}/11/2026 ${hour}:${min}:00`,
      "King's Grill",
      'Hợp lệ',
      '10m',
      `https://drive.google.com/uc?id=nov_${i}`,
      JSON.stringify({ username: 'nhanvien_a' }),
    ]);
  }

  // 2) 1,150 punches for other staff so total rows exceed 1,220
  for (let k = 0; k < 1150; k++) {
    const day = String((k % 28) + 1).padStart(2, '0');
    mainLogs.push([
      'Nguyễn Văn Khác',
      k % 2 === 0 ? 'Vào ca' : 'Ra ca',
      `'${day}/10/2026 09:${String(k % 60).padStart(2, '0')}:15`,
      "King's Grill",
      'Hợp lệ',
      '12m',
      '',
      JSON.stringify({ username: 'nhanvien_b' }),
    ]);
  }

  // 3) 50 MORE punches for nhanvien_a PAST ROW 1,200 (rows ~1,222..1,272), testing:
  //    - NFD decomposed Vietnamese accents (iOS Safari)
  //    - Extra whitespace & casing
  //    - Nickname in col A but exact `username` in col H JSON!
  for (let j = 0; j < 50; j++) {
    const day = String((j % 25) + 1).padStart(2, '0');
    const hour = j % 2 === 0 ? '09' : '22';
    const min = String(j % 60).padStart(2, '0');
    let colAName = 'Đặng Thị Hồng Ánh';
    if (j % 3 === 0) {
      colAName = 'Đặng Thị Hồng Ánh'.normalize('NFD');
    } else if (j % 3 === 1) {
      colAName = '  đặng   thị hồng ánh  ';
    } else {
      colAName = 'Ánh Ca Tối';
    }
    mainLogs.push([
      colAName,
      j % 2 === 0 ? 'Vào ca' : 'Ra ca',
      `'${day}/10/2026 ${hour}:${min}:30`,
      "King's Grill",
      'Hợp lệ',
      '8m',
      '',
      JSON.stringify({ username: 'nhanvien_a' }),
    ]);
  }

  // 4) 45 punches in secondary kitchen/steward sheet '👨‍🍳 CHẤM CÔNG BẾP - TẠP VỤ'
  const kitchenLogs: any[][] = [header];
  for (let m = 0; m < 45; m++) {
    const day = String((m % 22) + 1).padStart(2, '0');
    kitchenLogs.push([
      'Đặng Thị Hồng Ánh',
      m % 2 === 0 ? 'Vào ca' : 'Ra ca',
      `'${day}/09/2026 14:${String(m % 60).padStart(2, '0')}:00`,
      "King's Grill Bếp",
      'Hợp lệ',
      '5m',
      '',
      JSON.stringify({ username: 'nhanvien_a' }),
    ]);
  }

  // 5) 25 punches in archived April 2026 sheet 'CC 04/2026' + 1 duplicate from October in 'T10'
  const aprilLogs: any[][] = [header];
  for (let a = 0; a < 25; a++) {
    const day = String((a % 20) + 1).padStart(2, '0');
    aprilLogs.push([
      'Đặng Thị Hồng Ánh',
      a % 2 === 0 ? 'Vào ca' : 'Ra ca',
      `'${day}/04/2026 10:${String(a % 60).padStart(2, '0')}:00`,
      "King's Grill",
      'Hợp lệ',
      '9m',
      '',
      JSON.stringify({ username: 'nhanvien_a' }),
    ]);
  }

  const octArchiveLogs: any[][] = [
    header,
    // Exact duplicate of j=0 in mainLogs ('01/10/2026 09:00:30') -> MUST be deduplicated!
    [
      'Đặng Thị Hồng Ánh',
      'Vào ca',
      "'01/10/2026 09:00:30",
      "King's Grill",
      'Hợp lệ',
      '8m',
      '',
      JSON.stringify({ username: 'nhanvien_a' }),
    ],
    // 10 unique October punches only in 'T10'
    ...Array.from({ length: 10 }, (_, idx) => [
      'Đặng Thị Hồng Ánh',
      idx % 2 === 0 ? 'Vào ca' : 'Ra ca',
      `'28/10/2026 1${idx % 9}:15:00`,
      "King's Grill",
      'Hợp lệ',
      '11m',
      '',
      JSON.stringify({ username: 'nhanvien_a' }),
    ]),
  ];

  const usersSheet = [
    ['KING GRILL USERS'],
    ['USERNAME', 'PASSWORD', 'FULLNAME', 'DOB', 'EMAIL', 'ROLE', 'POSITION', 'AVATAR', 'STATUS'],
    ['admin', 'hash', 'Quản Trị Viên', '01/01/1990', 'admin@kg.vn', 'admin', 'Quản lý', '', 'active'],
    ['nhanvien_a', 'hash', 'Đặng Thị Hồng Ánh', '15/05/2001', 'anh@kg.vn', 'user', 'Phục vụ', '', 'active'],
    ['nhanvien_b', 'hash', 'Nguyễn Văn Khác', '20/08/2000', 'khac@kg.vn', 'user', 'Bếp', '', 'active'],
  ];

  const missedCheckinsSheet = [
    [
      'ID',
      'CREATED_AT',
      'USERNAME',
      'FULLNAME',
      'DATE',
      'TIME',
      'TYPE',
      'SHIFT',
      'REASON',
      'PROOF_IMAGE',
      'STATUS',
      'REVIEWED_BY',
      'REVIEWED_AT',
      'ADMIN_NOTE',
    ],
    [
      'MC_001',
      '14/11/2026 21:00:00',
      'nhanvien_a',
      'Đặng Thị Hồng Ánh',
      '14/11/2026',
      '22:30',
      'Ra ca',
      'Ca tối',
      'Quên bấm ra ca',
      '',
      'Pending',
      '',
      '',
      '',
    ],
  ];

  return {
    DATA: usersSheet,
    '✔️CHẤM CÔNG': mainLogs,
    '👨‍🍳 CHẤM CÔNG BẾP - TẠP VỤ': kitchenLogs,
    T10: octArchiveLogs,
    'CC 04/2026': aprilLogs,
    MISSED_CHECKINS: missedCheckinsSheet,
  };
}

describe('Check-In History Completeness & Multi-Sheet / Unicode / Edge Overlay Guarantees', () => {
  test('1. Frontend matchesUser handles NFC/NFD, Đ/đ folding, multiple spaces, and username fallback', async () => {
    const helpers = await vite.ssrLoadModule('/src/utils/helpers.ts');
    const target = { fullname: 'Đặng Thị Hồng Ánh', username: 'nhanvien_a' };

    assert.equal(
      helpers.matchesUser({ fullname: 'Đặng Thị Hồng Ánh'.normalize('NFD') }, target),
      true,
      'Must match NFD decomposed Vietnamese name from iOS'
    );
    assert.equal(
      helpers.matchesUser({ fullname: '  đặng   thị   hồng ánh  ' }, target),
      true,
      'Must collapse internal/outer spaces and ignore casing'
    );
    assert.equal(
      helpers.matchesUser({ fullname: 'Dang Thi Hong Anh' }, target),
      true,
      'Must fold Vietnamese Đ/đ -> d when comparing unaccented strings'
    );
    assert.equal(
      helpers.matchesUser({ fullname: 'Ánh Ca Tối', username: 'nhanvien_a' }, target),
      true,
      'Must match by username when display fullname differs'
    );
    assert.equal(
      helpers.matchesUser({ fullname: 'Nguyễn Văn Khác', username: 'nhanvien_b' }, target),
      false,
      'Must never match another employee'
    );
  });

  test('2. GAS GET_DATA scans past row 1,200, matches NFD/space/username variants, and reads secondary kitchen sheet without 60-item cutoff', () => {
    const gas = createGasSandbox(buildLargeAttendanceWorkbook());

    const res = gas.callDoPost({
      action: 'GET_DATA',
      username: 'nhanvien_a',
      fullname: 'Đặng Thị Hồng Ánh',
      role: 'user',
      forceRefresh: true,
    });

    assert.equal(res.ok, true);
    // 70 (Nov) + 50 (Oct past row 1200 with NFD/spaces/username) + 45 (Kitchen sheet) = 165 punches!
    assert.ok(
      res.data.logs.length >= 165,
      `Expected >= 165 punches in GET_DATA for nhanvien_a (got ${res.data.logs.length})`
    );
  });

  test('3. GAS GET_CHECKIN_LOGS returns 100% complete deduplicated punches across active & historical sheets with strict RBAC', () => {
    const gas = createGasSandbox(buildLargeAttendanceWorkbook());

    // 3a. Staff queries ALL recent/active punches (even attempting to snoop another targetUsername -> RBAC blocks snoop)
    const staffAll = gas.callDoPost({
      action: 'GET_CHECKIN_LOGS',
      username: 'nhanvien_a',
      fullname: 'Đặng Thị Hồng Ánh',
      role: 'user',
      targetUsername: 'nhanvien_b', // Attempted snoop must be ignored for non-admin!
      month: 'ALL',
    });

    assert.equal(staffAll.ok, true, `GET_CHECKIN_LOGS failed: ${staffAll.message}`);
    // 70 (Nov) + 50 (Oct main) + 10 (Oct T10 unique, 1 duplicate deduplicated) + 45 (Sep kitchen) = 175 punches (or 200 if CC 04/2026 included in ALL)
    assert.ok(
      staffAll.data.logs.length >= 175,
      `Expected >= 175 unique punches for nhanvien_a, got ${staffAll.data.logs.length}`
    );
    assert.equal(
      staffAll.data.logs.some((l: any) => String(l.fullname).includes('Nguyễn Văn Khác')),
      false,
      'Non-admin must NEVER receive another employee punches'
    );
    assert.ok(
      Array.isArray(staffAll.data.availableMonths) &&
        staffAll.data.availableMonths.includes('2026-11') &&
        staffAll.data.availableMonths.includes('2026-10') &&
        staffAll.data.availableMonths.includes('2026-04'),
      `availableMonths should include 2026-11, 2026-10, 2026-04 (got ${JSON.stringify(staffAll.data.availableMonths)})`
    );

    // 3b. Staff queries archived month 2026-04 -> pulls 'CC 04/2026' automatically
    const staffApril = gas.callDoPost({
      action: 'GET_CHECKIN_LOGS',
      username: 'nhanvien_a',
      fullname: 'Đặng Thị Hồng Ánh',
      role: 'user',
      month: '2026-04',
    });
    assert.equal(staffApril.ok, true);
    assert.equal(
      staffApril.data.logs.length,
      25,
      `Expected all 25 punches from CC 04/2026, got ${staffApril.data.logs.length}`
    );

    // 3c. Admin queries specific employee 'Đặng Thị Hồng Ánh' -> gets full 175+ punches (never truncated to 60 global rows!)
    const adminTarget = gas.callDoPost({
      action: 'GET_CHECKIN_LOGS',
      username: 'admin',
      fullname: 'Quản Trị Viên',
      role: 'admin',
      targetFullname: 'Đặng Thị Hồng Ánh',
      month: 'ALL',
    });
    assert.equal(adminTarget.ok, true);
    assert.ok(
      adminTarget.data.logs.length >= 175,
      `Admin filtering for employee must get all >= 175 punches, got ${adminTarget.data.logs.length}`
    );
  });

  test('4. GAS APPROVE_MISSED_CHECKIN invalidates JSON_CACHE and UPDATE_CHECKIN_TYPE works past row 300', () => {
    const gas = createGasSandbox(buildLargeAttendanceWorkbook());

    // Warm cache
    const warm = gas.callDoPost({
      action: 'GET_DATA',
      username: 'nhanvien_a',
      fullname: 'Đặng Thị Hồng Ánh',
      role: 'user',
      forceRefresh: true,
    });
    const beforeCount = warm.data.logs.length;

    // Approve missed check-in MC_001
    const approveRes = gas.callDoPost({
      action: 'APPROVE_MISSED_CHECKIN',
      username: 'admin',
      adminUsername: 'admin',
      role: 'admin',
      id: 'MC_001',
    });
    assert.equal(approveRes.ok, true);

    // Read WITHOUT forceRefresh -> cache must have been invalidated so new punch is present!
    const afterApprove = gas.callDoPost({
      action: 'GET_DATA',
      username: 'nhanvien_a',
      fullname: 'Đặng Thị Hồng Ánh',
      role: 'user',
      forceRefresh: false,
    });
    assert.equal(
      afterApprove.data.logs.length,
      beforeCount + 1,
      'APPROVE_MISSED_CHECKIN must invalidate user JSON_CACHE so new punch appears immediately'
    );

    // Update a punch located deep at row > 1,220 without passing rowIndex (testing full-sheet fallback)
    const deepUpdate = gas.callDoPost({
      action: 'UPDATE_CHECKIN_TYPE',
      username: 'admin',
      adminUsername: 'admin',
      role: 'admin',
      fullname: 'Đặng Thị Hồng Ánh',
      time: '02/10/2026 22:01:30',
      newType: 'Vào ca 2',
      reason: 'Sửa ca gãy dòng sâu > 1200',
    });
    assert.equal(deepUpdate.ok, true, `Expected deep row UPDATE_CHECKIN_TYPE to succeed: ${deepUpdate.message}`);
  });

  test('5. Edge Gateway overlays D1 check-in logs (>15m window) on GET_DATA & GET_CHECKIN_LOGS with strict non-admin privacy', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    const now = Date.now();
    const fortyFiveMinsAgo = now - 45 * 60 * 1000;

    // Minimal in-memory D1 mock supporting edge_checkin_logs & edge_kv_cache
    const checkinRows = [
      {
        username: 'nhanvien_a',
        fullname: 'Đặng Thị Hồng Ánh',
        check_type: 'Vào ca',
        shift_name: 'Ca sáng',
        time_str: '15/11/2026 09:15:00',
        status: 'Hợp lệ',
        distance: 7,
        lat: 10.976,
        lng: 106.664,
        note: '',
        image_url: '',
        created_at: fortyFiveMinsAgo,
      },
      {
        username: 'nhanvien_b',
        fullname: 'Nguyễn Văn Khác',
        check_type: 'Vào ca',
        shift_name: 'Ca sáng',
        time_str: '15/11/2026 09:20:00',
        status: 'Hợp lệ',
        distance: 9,
        lat: 10.976,
        lng: 106.664,
        note: '',
        image_url: '',
        created_at: now - 2 * 60 * 1000,
      },
    ];

    const mockDb = {
      batch: async () => [],
      prepare: (sql: string) => {
        let boundArgs: any[] = [];
        const stmt = {
          bind: (...args: any[]) => {
            boundArgs = args;
            return stmt;
          },
          run: async () => ({ success: true }),
          first: async () => null,
          all: async () => {
            if (sql.includes('FROM edge_checkin_logs')) {
              const cutoff = typeof boundArgs[0] === 'number' ? boundArgs[0] : 0;
              return {
                results: checkinRows.filter((r) => r.created_at >= cutoff),
              };
            }
            return { results: [] };
          },
        };
        return stmt;
      },
    };

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init?: any) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.action === 'GET_CHECKIN_LOGS') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              logs: [
                {
                  fullname: 'Đặng Thị Hồng Ánh',
                  username: 'nhanvien_a',
                  type: 'Ra ca',
                  time: '14/11/2026 22:05:00',
                  status: 'Hợp lệ',
                  timestamp: now - 12 * 3600 * 1000,
                },
              ],
              totalCount: 1,
              availableMonths: ['2026-11'],
            },
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            logs: [],
            stats: { totalCheckIn: 0, validCount: 0 },
          },
        }),
        { status: 200 }
      );
    }) as any;

    try {
      // 5a. GET_DATA with 45-minute-old D1 punch must still overlay for nhanvien_a and exclude nhanvien_b
      const reqGetData = new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        body: JSON.stringify({
          action: 'GET_DATA',
          username: 'nhanvien_a',
          fullname: 'Đặng Thị Hồng Ánh',
          role: 'user',
          forceRefresh: true,
        }),
      });
      const resGetData = await edgeMod.onRequest({
        request: reqGetData,
        env: { DB: mockDb },
        waitUntil: () => {},
      });
      const jsonGetData = await resGetData.json();
      assert.equal(jsonGetData.ok, true);
      assert.equal(
        jsonGetData.data.logs.length,
        1,
        '45-minute-old D1 check-in log should be overlaid onto GET_DATA and exclude other staff'
      );
      assert.equal(jsonGetData.data.logs[0].time, '15/11/2026 09:15:00');

      // 5b. GET_CHECKIN_LOGS overlays D1 punch onto GAS logs for nhanvien_a (total = 2) and excludes nhanvien_b
      const reqLogs = new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        body: JSON.stringify({
          action: 'GET_CHECKIN_LOGS',
          username: 'nhanvien_a',
          fullname: 'Đặng Thị Hồng Ánh',
          role: 'user',
          month: 'ALL',
          forceRefresh: true,
        }),
      });
      const resLogs = await edgeMod.onRequest({
        request: reqLogs,
        env: { DB: mockDb },
        waitUntil: () => {},
      });
      const jsonLogs = await resLogs.json();
      assert.equal(jsonLogs.ok, true);
      assert.equal(
        jsonLogs.data.logs.length,
        2,
        `Expected 2 merged punches (1 D1 + 1 GAS) in GET_CHECKIN_LOGS, got ${jsonLogs.data.logs.length}`
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
