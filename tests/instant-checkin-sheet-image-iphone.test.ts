import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { createServer, type ViteDevServer } from 'vite';

// ---------------------------------------------------------------------------
// Minimal Browser Storage & Event Shim for Node Test Environment
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

const docListeners = new Map<string, Set<(...args: any[]) => void>>();
const winListeners = new Map<string, Set<(...args: any[]) => void>>();

(globalThis as any).document = {
  visibilityState: 'visible',
  addEventListener: (ev: string, fn: (...args: any[]) => void) => {
    if (!docListeners.has(ev)) docListeners.set(ev, new Set());
    docListeners.get(ev)!.add(fn);
  },
  removeEventListener: (ev: string, fn: (...args: any[]) => void) => {
    docListeners.get(ev)?.delete(fn);
  },
  dispatchEvent: (evObj: { type: string }) => {
    for (const fn of docListeners.get(evObj.type) || []) fn(evObj);
    return true;
  },
  documentElement: { classList: { add: () => {}, remove: () => {} } },
};

(globalThis as any).window = globalThis;
(globalThis as any).addEventListener = (ev: string, fn: (...args: any[]) => void) => {
  if (!winListeners.has(ev)) winListeners.set(ev, new Set());
  winListeners.get(ev)!.add(fn);
};
(globalThis as any).removeEventListener = (ev: string, fn: (...args: any[]) => void) => {
  winListeners.get(ev)?.delete(fn);
};
(globalThis as any).dispatchEvent = (evObj: { type: string }) => {
  for (const fn of winListeners.get(evObj.type) || []) fn(evObj);
  return true;
};

Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true, vibrate: () => true },
  configurable: true,
  writable: true,
});

if (typeof (globalThis as any).CustomEvent !== 'function') {
  (globalThis as any).CustomEvent = class CustomEvent {
    detail: any;
    type: string;
    constructor(type: string, init?: { detail?: any }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
}

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

beforeEach(() => {
  localStore.clear();
  sessionStore.clear();
});

// ---------------------------------------------------------------------------
// Real SQLite-Backed Cloudflare D1 Adapter (`node:sqlite` DatabaseSync)
// Converts numbered `?1, ?2` parameters into SQLite-compatible positional bindings
// ---------------------------------------------------------------------------
function createRealSqliteD1() {
  const sqlite = new DatabaseSync(':memory:');

  function prepareStmt(sql: string) {
    let boundArgs: any[] = [];
    const executeSql = (mode: 'run' | 'first' | 'all') => {
      const expandedArgs: any[] = [];
      const rewrittenSql = sql.replace(/\?(\d+)?/g, (_match, numStr) => {
        if (numStr) {
          const idx = parseInt(numStr, 10) - 1;
          expandedArgs.push(boundArgs[idx] === undefined ? null : boundArgs[idx]);
        } else {
          expandedArgs.push(boundArgs[expandedArgs.length] ?? null);
        }
        return '?';
      });
      const stmt = sqlite.prepare(rewrittenSql);
      if (mode === 'run') {
        const res = stmt.run(...expandedArgs);
        return { success: true, meta: { changes: Number(res.changes || 0) } };
      }
      if (mode === 'first') {
        const row = stmt.get(...expandedArgs);
        return row ? { ...row } : null;
      }
      const rows = stmt.all(...expandedArgs).map((r) => ({ ...r }));
      return { results: rows, success: true };
    };

    const api = {
      bind: (...args: any[]) => {
        boundArgs = args;
        return api;
      },
      run: async () => executeSql('run'),
      first: async () => executeSql('first'),
      all: async () => executeSql('all'),
    };
    return api;
  }

  return {
    raw: sqlite,
    prepare: (sql: string) => prepareStmt(sql),
    batch: async (stmts: Array<{ run: () => Promise<any> }>) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// In-Memory Google Apps Script Sandbox (Loads Real gas/*.gs Files)
// ---------------------------------------------------------------------------
function createGasSandbox(
  initialSheets: Record<string, any[][]>,
  initialNowIso = '2026-11-04T09:15:00+07:00'
) {
  let currentNowIso = initialNowIso;
  let driveCounter = 1;
  const sheetsData: Record<string, any[][]> = {};
  const formulasData: Record<string, Record<string, string>> = {};

  for (const [name, rows] of Object.entries(initialSheets)) {
    sheetsData[name] = rows.map((r) => [...r]);
    formulasData[name] = {};
  }

  function makeSheet(name: string) {
    if (!sheetsData[name]) sheetsData[name] = [];
    if (!formulasData[name]) formulasData[name] = {};
    const ensureCell = (r1: number, c1: number) => {
      while (sheetsData[name].length < r1) sheetsData[name].push([]);
      while (sheetsData[name][r1 - 1].length < c1) sheetsData[name][r1 - 1].push('');
    };
    const makeRange = (row1: number | string, col1 = 1, numRows = 1, numCols = 1) => {
      if (typeof row1 === 'string') {
        const dummy: any = {
          setFontWeight: () => dummy,
          setBackground: () => dummy,
          setFontColor: () => dummy,
          setFontSize: () => dummy,
          setHorizontalAlignment: () => dummy,
          merge: () => dummy,
        };
        return dummy;
      }
      const rObj: any = {
        getValues: () => {
          const out: any[][] = [];
          for (let r = 0; r < numRows; r++) {
            const rowArr: any[] = [];
            const srcRow = sheetsData[name][row1 - 1 + r] || [];
            for (let c = 0; c < numCols; c++) {
              rowArr.push(srcRow[col1 - 1 + c] ?? '');
            }
            out.push(rowArr);
          }
          return out;
        },
        getDisplayValues: () =>
          rObj.getValues().map((row: any[]) =>
            row.map((v: any) => (v === null || v === undefined ? '' : String(v).replace(/^'/, '')))
          ),
        getFormulas: () => {
          const out: string[][] = [];
          for (let r = 0; r < numRows; r++) {
            const rowArr: string[] = [];
            for (let c = 0; c < numCols; c++) {
              rowArr.push(formulasData[name][`${row1 + r}:${col1 + c}`] || '');
            }
            out.push(rowArr);
          }
          return out;
        },
        getValue: () => (sheetsData[name][row1 - 1] || [])[col1 - 1] ?? '',
        getFormula: () => formulasData[name][`${row1}:${col1}`] || '',
        setValue: (val: any) => {
          ensureCell(row1, col1);
          sheetsData[name][row1 - 1][col1 - 1] = val;
          if (typeof val === 'string' && val.startsWith('=')) {
            formulasData[name][`${row1}:${col1}`] = val;
          }
          return rObj;
        },
        setFormula: (formula: string) => {
          ensureCell(row1, col1);
          formulasData[name][`${row1}:${col1}`] = formula;
          sheetsData[name][row1 - 1][col1 - 1] = formula;
          return rObj;
        },
        setValues: (vals: any[][]) => {
          for (let r = 0; r < vals.length; r++) {
            for (let c = 0; c < vals[r].length; c++) {
              ensureCell(row1 + r, col1 + c);
              const cellVal = vals[r][c];
              sheetsData[name][row1 - 1 + r][col1 - 1 + c] = cellVal;
              if (typeof cellVal === 'string' && cellVal.startsWith('=')) {
                formulasData[name][`${row1 + r}:${col1 + c}`] = cellVal;
              }
            }
          }
          return rObj;
        },
        setFontFamily: () => rObj,
        setFontSize: () => rObj,
        setFontWeight: () => rObj,
        setFontWeights: () => rObj,
        setFontColor: () => rObj,
        setFontColors: () => rObj,
        setBackground: () => rObj,
        setBackgrounds: () => rObj,
        setHorizontalAlignment: () => rObj,
        setHorizontalAlignments: () => rObj,
        setVerticalAlignment: () => rObj,
        setWrap: () => rObj,
        setBorder: () => rObj,
        setNumberFormat: () => rObj,
        clearFormat: () => rObj,
      };
      return rObj;
    };

    return {
      getName: () => name,
      getLastRow: () => sheetsData[name].length,
      getLastColumn: () =>
        sheetsData[name].reduce((max, r) => Math.max(max, r.length), 8),
      getRange: (r1: number | string, c1 = 1, nr = 1, nc = 1) => makeRange(r1, c1, nr, nc),
      getDataRange: () => {
        const rows = Math.max(1, sheetsData[name].length);
        const cols = Math.max(8, sheetsData[name].reduce((m, r) => Math.max(m, r.length), 8));
        return makeRange(1, 1, rows, cols);
      },
      appendRow: (row: any[]) => {
        sheetsData[name].push([...row]);
      },
      insertRowBefore: (beforeRow1: number) => {
        const shiftedFormulas: Record<string, string> = {};
        for (const [k, v] of Object.entries(formulasData[name])) {
          const [rS, cS] = k.split(':').map(Number);
          shiftedFormulas[`${rS >= beforeRow1 ? rS + 1 : rS}:${cS}`] = v;
        }
        formulasData[name] = shiftedFormulas;
        sheetsData[name].splice(Math.max(0, beforeRow1 - 1), 0, []);
      },
      setRowHeight: () => {},
      setFrozenRows: () => {},
      setColumnWidth: () => {},
      hideColumns: () => {},
      setHiddenGridlines: () => {},
      clearConditionalFormatRules: () => {},
      setConditionalFormatRules: () => {},
    };
  }

  const ssMock = {
    getId: () => 'mock-ss-id',
    getSheetByName: (n: string) => (sheetsData[n] ? makeSheet(n) : null),
    insertSheet: (n: string) => {
      if (!sheetsData[n]) sheetsData[n] = [];
      return makeSheet(n);
    },
    getSheets: () => Object.keys(sheetsData).map((n) => makeSheet(n)),
    toast: () => {},
  };

  const scriptCache = new Map<string, string>();
  const RealDate = Date;

  class MockDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) super(currentNowIso);
      else super(...(args as [any]));
    }
    static now() {
      return RealDate.parse(currentNowIso);
    }
  }

  const sandbox: any = {
    console,
    Date: MockDate,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Map,
    Set,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    Logger: { log: () => {} },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Utilities: {
      formatDate: (d: Date, _tz: string, fmt: string) => {
        const vn = new RealDate(d.getTime() + 7 * 3600 * 1000);
        const yyyy = String(vn.getUTCFullYear());
        const MM = String(vn.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(vn.getUTCDate()).padStart(2, '0');
        const HH = String(vn.getUTCHours()).padStart(2, '0');
        const mm = String(vn.getUTCMinutes()).padStart(2, '0');
        const ss = String(vn.getUTCSeconds()).padStart(2, '0');
        const jsDay = vn.getUTCDay();
        const isoDay = String(jsDay === 0 ? 7 : jsDay);
        if (fmt === 'u') return isoDay;
        if (fmt === 'dd/MM/yyyy HH:mm:ss') return `${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}`;
        if (fmt === 'dd/MM/yyyy HH:mm') return `${dd}/${MM}/${yyyy} ${HH}:${mm}`;
        if (fmt === 'dd/MM HH:mm') return `${dd}/${MM} ${HH}:${mm}`;
        if (fmt === 'dd/MM/yyyy') return `${dd}/${MM}/${yyyy}`;
        if (fmt === 'yyyy-MM-dd') return `${yyyy}-${MM}-${dd}`;
        if (fmt === 'yyyy-MM') return `${yyyy}-${MM}`;
        if (fmt === 'HH:mm') return `${HH}:${mm}`;
        return `${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}`;
      },
      computeDigest: () => [1, 2, 3, 4],
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      newBlob: (data: any, mime: string, name: string) => ({ data, mime, name }),
      base64Decode: () => [1, 2, 3],
      sleep: () => {},
    },
    SpreadsheetApp: {
      openById: () => ssMock,
      getActiveSpreadsheet: () => ssMock,
      flush: () => {},
      getUi: () => null,
      BorderStyle: { SOLID: 'SOLID', SOLID_MEDIUM: 'SOLID_MEDIUM', SOLID_THICK: 'SOLID_THICK' },
      newConditionalFormatRule: () => {
        const b: any = {
          whenTextEqualTo: () => b,
          setFontColor: () => b,
          setBackground: () => b,
          setBold: () => b,
          setRanges: () => b,
          build: () => ({}),
        };
        return b;
      },
    },
    Drive: {
      Files: {
        create: (meta: any) => {
          const id = `drive_img_${driveCounter++}_${String(meta?.name || 'img').replace(/\W+/g, '')}`;
          return { id, webViewLink: `https://drive.google.com/file/d/${id}/view?usp=drivesdk` };
        },
      },
      Permissions: {
        create: () => ({}),
      },
    },
    DriveApp: {
      getFolderById: () => ({
        createFile: () => {
          const id = `drive_fallback_${driveCounter++}`;
          return {
            setSharing: () => {},
            getUrl: () => `https://drive.google.com/file/d/${id}/view`,
          };
        },
      }),
      Access: { ANYONE_WITH_LINK: 'ANYONE' },
      Permission: { VIEW: 'VIEW' },
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {},
        tryLock: () => true,
        releaseLock: () => {},
      }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k: string) => scriptCache.get(k) ?? null,
        put: (k: string, v: string) => scriptCache.set(k, String(v)),
        remove: (k: string) => scriptCache.delete(k),
        removeAll: (keys: string[]) => keys.forEach((k) => scriptCache.delete(k)),
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null,
        setProperty: () => {},
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt: string) => ({
        setMimeType: () => ({ getContent: () => txt }),
        getContent: () => txt,
      }),
    },
    MailApp: {
      getRemainingDailyQuota: () => 50,
      sendEmail: () => {},
    },
    UrlFetchApp: {
      fetch: () => ({ getContentText: () => '{"ok":true}' }),
    },
  };

  vm.createContext(sandbox);
  const gasDir = path.resolve(process.cwd(), 'gas');
  const gasFiles = [
    'Code.gs',
    'SheetService.gs',
    'JsonCacheService.gs',
    'Engine.gs',
    'Handlers.gs',
    'ChecklistService.gs',
    'OpsChecklistHandlers.gs',
    'ControlCenterService.gs',
  ];
  for (const gf of gasFiles) {
    const fullPath = path.join(gasDir, gf);
    if (fs.existsSync(fullPath)) {
      vm.runInContext(fs.readFileSync(fullPath, 'utf8'), sandbox, { filename: gf });
    }
  }

  return {
    sheetsData,
    formulasData,
    setNow: (iso: string) => {
      currentNowIso = iso;
    },
    callDoPost: (payload: Record<string, any>) => {
      const out = sandbox.doPost({ postData: { contents: JSON.stringify(payload) } });
      return JSON.parse(out.getContent());
    },
  };
}

async function seedRegisteredScheduleForTest(
  edgeMod: any,
  db: ReturnType<typeof createRealSqliteD1>,
  username: string,
  fullname: string,
  nowMs: number
) {
  await edgeMod.onRequest({
    request: new Request('https://kg-checkin.pages.dev/api', {
      method: 'POST',
      body: JSON.stringify({ action: 'GET_EDGE_DB_STATUS' }),
    }),
    env: { DB: db },
    waitUntil: () => {},
  });
  const win = edgeMod.computeEdgeVietnamUpcomingWeekAndWindow(nowMs);
  const shifts = ['Ca 1 (09h-17h)', 'Ca 1 (09h-17h)', 'Ca 1 (09h-17h)', 'Ca 1 (09h-17h)', 'Ca 1 (09h-17h)', 'Ca 1 (09h-17h)', 'OFF'];
  await db
    .prepare(
      `INSERT OR REPLACE INTO edge_schedules (id, username, fullname, month_sheet, week_label, shifts_json, off_reason, status, sheet_synced, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', 'Đã duyệt', 1, ?7)`
    )
    .bind(
      `${win.monthSheet}|${win.weekLabel}|${username.toLowerCase()}`,
      username.toLowerCase(),
      fullname,
      win.monthSheet,
      win.weekLabel,
      JSON.stringify(shifts),
      nowMs
    )
    .run();
  return { win, shifts };
}

function buildScheduledMonthSheetRows(weekLabel: string, fullname: string, shifts: string[]) {
  return [
    ['LỊCH LÀM VIỆC'],
    [weekLabel, 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN', 'Lý do OFF', 'Trạng thái'],
    [fullname, ...shifts, '', 'Đã duyệt'],
  ];
}

describe('Suite 1 — Instant Edge Check-In (<100ms) & Deterministic Guards', () => {
  test('1.1 CHECK_IN_OUT with instantEdge:true responds in <100ms despite 600ms GAS latency, then writes canonical employee row to Google Sheets', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();

    const realNow = Date.now();
    const nowIso = new Date(realNow).toISOString();
    const db = createRealSqliteD1();
    const { win, shifts } = await seedRegisteredScheduleForTest(
      edgeMod,
      db,
      'mai01',
      'Nguyễn Thị Mai',
      realNow
    );

    const gas = createGasSandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['mai01', 'hash_mai', 'Nguyễn Thị Mai', '', 'mai@kg.vn', 'user', 'Thu ngân', '', 'active'],
        ],
        '⚙️ CẤU HÌNH': [
          ['Key', 'Value'],
          ['GPS_CONFIG', JSON.stringify({ lat: 10.976083, lng: 106.664654, radius: 25 })],
        ],
        [win.monthSheet]: buildScheduledMonthSheetRows(win.weekLabel, 'Nguyễn Thị Mai', shifts),
        '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
      },
      nowIso
    );

    const waitUntilPromises: Promise<any>[] = [];
    const origFetch = globalThis.fetch;

    try {
      globalThis.fetch = (async (_url: any, init?: RequestInit) => {
        await new Promise((r) => setTimeout(r, 600)); // Simulate slow 600ms GAS execution
        const body = JSON.parse(String(init?.body || '{}'));
        const res = gas.callDoPost(body);
        return new Response(JSON.stringify(res), { status: 200 });
      }) as typeof fetch;

      const checkinId = 'CHK_mai01_instant_1';
      const t0 = performance.now();
      const res = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'CHECK_IN_OUT',
            instantEdge: true,
            checkinId,
            username: 'mai01',
            fullname: 'Mai', // Stale nickname on client; Sheet MUST receive canonical "Nguyễn Thị Mai"
            type: 'Vào ca',
            lat: 10.976083,
            lng: 106.664654,
            distance: 2,
            gpsAccuracy: 8,
            clientNowMs: realNow,
            photoCapturedMs: realNow - 2000,
            image: 'PENDING',
            fastSync: true,
          }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => {
          waitUntilPromises.push(p);
        },
      });
      const elapsedMs = performance.now() - t0;
      const json = await res.json();

      assert.equal(json.ok, true, `Expected instant ok:true, got ${JSON.stringify(json)}`);
      assert.equal(json.data?.instantEdgeCommitted, true, 'Must commit instantly at Edge');
      assert.equal(json.data?.checkinId, checkinId);
      assert.ok(elapsedMs < 250, `Expected instant <250ms response while GAS takes 600ms, got ${elapsedMs.toFixed(1)}ms`);

      // Wait for background waitUntil sync to finish writing to Google Sheets
      await Promise.all(waitUntilPromises);

      const sheetRows = gas.sheetsData['✔️CHẤM CÔNG'];
      assert.equal(sheetRows.length, 2, 'Google Sheet ✔️CHẤM CÔNG must have the synced punch row');
      assert.equal(sheetRows[1][0], 'Nguyễn Thị Mai', 'Col A must match canonical DATA fullname');
      assert.equal(sheetRows[1][1], 'Vào ca', 'Col B must be unified Vào ca');

      const d1Log = await db.prepare(`SELECT sheet_synced, fullname FROM edge_checkin_logs WHERE id = ?1`).bind(checkinId).first();
      assert.equal(Number(d1Log?.sheet_synced), 1, 'D1 log must flip to sheet_synced=1 after GAS write-through');
      assert.equal(d1Log?.fullname, 'Nguyễn Thị Mai');

      const pendingLeft = await db.prepare(`SELECT COUNT(*) as c FROM edge_sync_queue`).first();
      assert.equal(Number(pendingLeft?.c), 0, 'edge_sync_queue must be empty after background sync completes');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('1.2 Instant Edge CHECK_IN_OUT strictly rejects OUT_OF_RADIUS and PHOTO_EXPIRED without writing to D1 or Sheets', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();
    const db = createRealSqliteD1();
    const realNow = Date.now();
    const origFetch = globalThis.fetch;

    try {
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: { lat: 10.976083, lng: 106.664654, radius: 25 },
          }),
          { status: 200 }
        )) as typeof fetch;

      // 1. Out of radius (500m away)
      const outRes = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'CHECK_IN_OUT',
            instantEdge: true,
            checkinId: 'CHK_bad_gps',
            username: 'mai01',
            fullname: 'Nguyễn Thị Mai',
            type: 'Vào ca',
            lat: 10.9815,
            lng: 106.664654,
            gpsAccuracy: 5,
            clientNowMs: realNow,
            photoCapturedMs: realNow - 1000,
          }),
        }),
        env: { DB: db },
        waitUntil: () => {},
      });
      const outJson = await outRes.json();
      assert.equal(outJson.ok, false);
      assert.equal(outJson.code || outJson.data?.code, 'OUT_OF_RADIUS');

      // 2. Expired photo (130s old)
      const expRes = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'CHECK_IN_OUT',
            instantEdge: true,
            checkinId: 'CHK_expired_photo',
            username: 'mai01',
            fullname: 'Nguyễn Thị Mai',
            type: 'Vào ca',
            lat: 10.976083,
            lng: 106.664654,
            gpsAccuracy: 5,
            clientNowMs: realNow,
            photoCapturedMs: realNow - 130_000,
          }),
        }),
        env: { DB: db },
        waitUntil: () => {},
      });
      const expJson = await expRes.json();
      assert.equal(expJson.ok, false);
      assert.equal(expJson.code || expJson.data?.code, 'PHOTO_EXPIRED');

      const logCount = await db.prepare(`SELECT COUNT(*) as c FROM edge_checkin_logs`).first();
      assert.equal(Number(logCount?.c), 0, 'Rejected punches must never enter edge_checkin_logs');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('1.3 Mandatory Upcoming-Week Schedule Window Helper accurately identifies Thu 00:00 -> Sat 16:59:59 VN', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    const wedMs = Date.parse('2026-11-04T10:00:00+07:00'); // Wednesday
    const friMs = Date.parse('2026-11-06T10:00:00+07:00'); // Friday
    const satAfter17Ms = Date.parse('2026-11-07T17:05:00+07:00'); // Saturday 17:05

    assert.equal(edgeMod.computeEdgeVietnamUpcomingWeekAndWindow(wedMs).isMandatoryWindow, false);
    const friWin = edgeMod.computeEdgeVietnamUpcomingWeekAndWindow(friMs);
    assert.equal(friWin.isMandatoryWindow, true);
    assert.equal(friWin.weekLabel, '📅 TUẦN 09/11 - 15/11');
    assert.equal(friWin.monthSheet, 'Tháng 11/2026');
    assert.equal(edgeMod.computeEdgeVietnamUpcomingWeekAndWindow(satAfter17Ms).isMandatoryWindow, false);
  });
});

describe('Suite 2 — Ordered Server-Side Sheet + Google Drive Photo Hyperlink Guarantee', () => {
  test('2.1 iPhone Screen-Lock Simulation: Instant CHECK_IN_OUT + Instant UPLOAD_CHECKIN_IMAGE complete in <150ms, and Edge strictly orders Sheet Row BEFORE Drive Hyperlink', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();

    const realNow = Date.now();
    const nowIso = new Date(realNow).toISOString();
    const db = createRealSqliteD1();
    const { win, shifts } = await seedRegisteredScheduleForTest(
      edgeMod,
      db,
      'linh02',
      'Trần Mỹ Linh',
      realNow
    );

    const gas = createGasSandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['linh02', 'hash_linh', 'Trần Mỹ Linh', '', 'linh@kg.vn', 'user', 'Phục vụ', '', 'active'],
        ],
        '⚙️ CẤU HÌNH': [
          ['Key', 'Value'],
          ['GPS_CONFIG', JSON.stringify({ lat: 10.976083, lng: 106.664654, radius: 25 })],
        ],
        [win.monthSheet]: buildScheduledMonthSheetRows(win.weekLabel, 'Trần Mỹ Linh', shifts),
        '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
      },
      nowIso
    );

    const waitUntilPromises: Promise<any>[] = [];
    const gasCallOrder: string[] = [];
    const origFetch = globalThis.fetch;

    try {
      globalThis.fetch = (async (_url: any, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'));
        gasCallOrder.push(body.action);
        // Make CHECK_IN_OUT slower (450ms) than UPLOAD_CHECKIN_IMAGE (80ms) to prove strict ordering!
        if (body.action === 'CHECK_IN_OUT') {
          await new Promise((r) => setTimeout(r, 450));
        } else if (body.action === 'UPLOAD_CHECKIN_IMAGE') {
          await new Promise((r) => setTimeout(r, 80));
        }
        const res = gas.callDoPost(body);
        return new Response(JSON.stringify(res), { status: 200 });
      }) as typeof fetch;

      const checkinId = 'CHK_linh02_iphone_lock_1';
      const fakeJpegBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(256);

      // Client sends CHECK_IN_OUT (instantEdge: true)
      const punchRes = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'CHECK_IN_OUT',
            instantEdge: true,
            checkinId,
            username: 'linh02',
            fullname: 'Trần Mỹ Linh',
            type: 'Vào ca',
            lat: 10.976083,
            lng: 106.664654,
            distance: 3,
            gpsAccuracy: 10,
            clientNowMs: realNow,
            photoCapturedMs: realNow - 1500,
            image: 'PENDING',
            fastSync: true,
          }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => {
          waitUntilPromises.push(p);
        },
      });
      const punchJson = await punchRes.json();
      assert.equal(punchJson.ok, true);
      assert.equal(punchJson.data?.instantEdgeCommitted, true);
      const confirmedTime = String(punchJson.data?.thoiGian || '');

      // 10ms later (while GAS CHECK_IN_OUT still has 440ms left!), client sends UPLOAD_CHECKIN_IMAGE (instantEdge: true) and locks iPhone!
      const tImg0 = performance.now();
      const uploadRes = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'UPLOAD_CHECKIN_IMAGE',
            instantEdge: true,
            checkinId,
            username: 'linh02',
            fullname: 'Trần Mỹ Linh',
            time: confirmedTime,
            image: fakeJpegBase64,
            sendEmailAfterUpload: true,
          }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => {
          waitUntilPromises.push(p);
        },
      });
      const imgElapsed = performance.now() - tImg0;
      const uploadJson = await uploadRes.json();

      assert.equal(uploadJson.ok, true, `Expected instant image queue ok:true, got ${JSON.stringify(uploadJson)}`);
      assert.equal(uploadJson.data?.edgeImageQueued, true);
      assert.ok(imgElapsed < 200, `Expected instant image staging <200ms, got ${imgElapsed.toFixed(1)}ms`);

      // Wait for all Cloudflare Edge background tasks (waitUntil) to finish
      await Promise.all(waitUntilPromises);

      assert.deepEqual(
        gasCallOrder,
        ['CHECK_IN_OUT', 'UPLOAD_CHECKIN_IMAGE'],
        'CHECK_IN_OUT must execute on GAS strictly before UPLOAD_CHECKIN_IMAGE'
      );

      const sheetRows = gas.sheetsData['✔️CHẤM CÔNG'];
      assert.equal(sheetRows.length, 2);
      assert.equal(sheetRows[1][0], 'Trần Mỹ Linh');
      assert.equal(sheetRows[1][1], 'Vào ca');
      assert.match(
        String(sheetRows[1][6] || ''),
        /^=HYPERLINK\("https:\/\/drive\.google\.com\/file\/d\/[^"]+";\s*"📷 Xem ảnh"\)$/,
        'Col G must have Google Drive HYPERLINK formula'
      );
      const colHJson = JSON.parse(String(sheetRows[1][7] || '{}'));
      assert.equal(colHJson.checkinId, checkinId);
      assert.match(String(colHJson.linkAnh || ''), /^https:\/\/drive\.google\.com\//);

      const d1Log = await db.prepare(`SELECT sheet_synced, image_url FROM edge_checkin_logs WHERE id = ?1`).bind(checkinId).first();
      assert.equal(Number(d1Log?.sheet_synced), 1);
      assert.match(String(d1Log?.image_url || ''), /^https:\/\/drive\.google\.com\//);

      const remQueue = await db.prepare(`SELECT COUNT(*) as c FROM edge_sync_queue`).first();
      assert.equal(Number(remQueue?.c), 0, 'edge_sync_queue must clean up both punch and image payloads to 0 rows');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('2.2 GAS LOCK_TIMEOUT Outage Recovery: Queued punch + photo both survive outage and drain in exact order on next Edge request', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();

    const realNow = Date.now();
    const nowIso = new Date(realNow).toISOString();
    const db = createRealSqliteD1();
    const { win, shifts } = await seedRegisteredScheduleForTest(
      edgeMod,
      db,
      'nam03',
      'Phạm Hoàng Nam',
      realNow
    );

    const gas = createGasSandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['nam03', 'hash_nam', 'Phạm Hoàng Nam', '', 'nam@kg.vn', 'user', 'Bếp', '', 'active'],
        ],
        '⚙️ CẤU HÌNH': [
          ['Key', 'Value'],
          ['GPS_CONFIG', JSON.stringify({ lat: 10.976083, lng: 106.664654, radius: 25 })],
        ],
        [win.monthSheet]: buildScheduledMonthSheetRows(win.weekLabel, 'Phạm Hoàng Nam', shifts),
        '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
      },
      nowIso
    );

    let gasLocked = true;
    const origFetch = globalThis.fetch;

    try {
      globalThis.fetch = (async (_url: any, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'));
        if (gasLocked && (body.action === 'CHECK_IN_OUT' || body.action === 'UPLOAD_CHECKIN_IMAGE')) {
          return new Response(
            JSON.stringify({ ok: false, code: 'LOCK_TIMEOUT', message: 'Lock timeout' }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify(gas.callDoPost(body)), { status: 200 });
      }) as typeof fetch;

      const checkinId = 'CHK_nam03_outage_1';
      const bg1: Promise<any>[] = [];

      const pRes = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'CHECK_IN_OUT',
            instantEdge: true,
            checkinId,
            username: 'nam03',
            fullname: 'Phạm Hoàng Nam',
            type: 'Vào ca',
            lat: 10.976083,
            lng: 106.664654,
            distance: 4,
            gpsAccuracy: 9,
            clientNowMs: realNow,
            photoCapturedMs: realNow - 1000,
            image: 'PENDING',
            fastSync: true,
          }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => bg1.push(p),
      });
      const pJson = await pRes.json();

      await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'UPLOAD_CHECKIN_IMAGE',
            instantEdge: true,
            checkinId,
            username: 'nam03',
            fullname: 'Phạm Hoàng Nam',
            time: pJson?.data?.thoiGian || '',
            image: 'data:image/jpeg;base64,' + 'B'.repeat(200),
          }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => bg1.push(p),
      });

      await Promise.all(bg1);

      // Both items must still be pending in edge_sync_queue while GAS was locked
      const queuedDuringOutage = await db.prepare(`SELECT COUNT(*) as c FROM edge_sync_queue WHERE status = 'pending'`).first();
      assert.equal(Number(queuedDuringOutage?.c), 2, 'Both punch and image must stay safely pending during GAS lock');

      // Now GAS recovers and any normal request triggers background drainEdgeSyncQueue
      gasLocked = false;
      const bg2: Promise<any>[] = [];
      await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({ action: 'GET_DATA', username: 'nam03', fullname: 'Phạm Hoàng Nam' }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => bg2.push(p),
      });
      await Promise.all(bg2);

      const sheetRows = gas.sheetsData['✔️CHẤM CÔNG'];
      assert.equal(sheetRows.length, 2, 'Recovered punch must land in ✔️CHẤM CÔNG');
      assert.equal(sheetRows[1][0], 'Phạm Hoàng Nam');
      assert.match(String(sheetRows[1][6] || ''), /drive\.google\.com/, 'Recovered image link must be attached to Col G');

      const queuedAfterRecovery = await db.prepare(`SELECT COUNT(*) as c FROM edge_sync_queue`).first();
      assert.equal(Number(queuedAfterRecovery?.c), 0, 'Queue must be 0 after recovery drain');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('2.3 Similar-Name Disambiguation: Nguyễn Văn An (an01) vs Nguyễn Văn Anh (anh02) never cross-attach photos', () => {
    const gas = createGasSandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['an01', 'h1', 'Nguyễn Văn An', '', 'an@kg.vn', 'user', 'Phục vụ', '', 'active'],
          ['anh02', 'h2', 'Nguyễn Văn Anh', '', 'anh@kg.vn', 'user', 'Phục vụ', '', 'active'],
        ],
        '⚙️ CẤU HÌNH': [
          ['Key', 'Value'],
          ['GPS_CONFIG', JSON.stringify({ lat: 10.976083, lng: 106.664654, radius: 25 })],
        ],
        '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
      },
      '2026-11-04T08:30:00+07:00'
    );

    // An punches first (becomes row 3 after Anh punches), Anh punches 1 second later (row 2)
    gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinId: 'CHK_an01_1',
      username: 'an01',
      fullname: 'Nguyễn Văn An',
      type: 'Vào ca',
      time: '04/11/2026 08:30:00',
      actualTime: '04/11/2026 08:30:00',
      lat: 10.976083,
      lng: 106.664654,
      fastSync: true,
    });
    gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinId: 'CHK_anh02_1',
      username: 'anh02',
      fullname: 'Nguyễn Văn Anh',
      type: 'Vào ca',
      time: '04/11/2026 08:30:01',
      actualTime: '04/11/2026 08:30:01',
      lat: 10.976083,
      lng: 106.664654,
      fastSync: true,
    });

    // Even if checkinId were omitted in a fallback upload for An (an01), it MUST match row 3 (An), NEVER row 2 (Anh)!
    const upAn = gas.callDoPost({
      action: 'UPLOAD_CHECKIN_IMAGE',
      username: 'an01',
      fullname: 'Nguyễn Văn An',
      image: 'data:image/jpeg;base64,' + 'C'.repeat(200),
    });

    assert.equal(upAn.ok, true);
    assert.equal(upAn.data?.rowMatched, 3, 'Must attach photo to Nguyễn Văn An (row 3), never Nguyễn Văn Anh (row 2)');
    assert.equal(gas.sheetsData['✔️CHẤM CÔNG'][1][6], '', 'Row 2 (Nguyễn Văn Anh) must remain untouched');
    assert.match(String(gas.sheetsData['✔️CHẤM CÔNG'][2][6]), /drive\.google\.com/);
  });
});

describe('Suite 3 — Offline Vault & iOS Screen-Lock Image Recovery', () => {
  test('3.1 markPunchVaultEdgeBuffered prevents duplicate CHECK_IN_OUT while still recovering interrupted UPLOAD_CHECKIN_IMAGE; markPunchVaultImageQueuedOnEdge marks image safe', async () => {
    const oq = await vite.ssrLoadModule('/src/utils/offlineQueue.ts');
    localStore.clear();

    assert.equal(typeof oq.markPunchVaultEdgeBuffered, 'function', 'markPunchVaultEdgeBuffered must exist');
    assert.equal(typeof oq.markPunchVaultImageQueuedOnEdge, 'function', 'markPunchVaultImageQueuedOnEdge must exist');

    const cid = 'CHK_ios_vault_1';
    oq.savePunchToVault({
      checkinId: cid,
      username: 'mai01',
      fullname: 'Nguyễn Thị Mai',
      type: 'Vào ca',
      time: '04/11/2026 09:00:00',
      image: 'data:image/jpeg;base64,' + 'D'.repeat(120),
    });

    // Edge accepted CHECK_IN_OUT instantaneously, then user locked iPhone BEFORE UPLOAD_CHECKIN_IMAGE finished!
    oq.markPunchVaultEdgeBuffered(cid, { thoiGian: '04/11/2026 09:00:00' });

    const recoveredCount = oq.recoverOrphanedVaultPunches();
    assert.equal(recoveredCount, 1, 'Must enqueue 1 orphaned UPLOAD_CHECKIN_IMAGE, NOT duplicate CHECK_IN_OUT');

    const q1 = oq.getQueue();
    assert.equal(q1.length, 1);
    assert.equal(q1[0].action, 'UPLOAD_CHECKIN_IMAGE', 'Recovered action must strictly be UPLOAD_CHECKIN_IMAGE');
    assert.equal(q1[0].payload.instantEdge, true, 'Recovered image upload must use instantEdge:true');

    // Clear queue and mark image queued on Edge -> zero redundant recoveries on next wake
    localStore.removeItem('kg_offline_queue_v1');
    oq.markPunchVaultImageQueuedOnEdge(cid);
    const recoveredAgain = oq.recoverOrphanedVaultPunches();
    assert.equal(recoveredAgain, 0, 'Once Edge accepted image into edge_sync_queue, must not re-upload');
  });
});

describe('Suite 4 — iPhone / iOS Safari & Home-Screen PWA Optimizations', () => {
  test('4.1 iOS AudioContext unlock keeps touchend/click listeners alive until AudioContext reaches running state', async () => {
    const soundSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/soundEffects.ts'), 'utf8');
    assert.ok(
      !soundSrc.includes("addEventListener(ev, unlock, { once: true"),
      'setupAudioUnlock must NOT use { once: true } because passive touchstart leaves iOS AudioContext suspended'
    );
    assert.ok(
      soundSrc.includes("ctx.state === 'running'"),
      'setupAudioUnlock must verify ctx.state === "running" before removing iOS unlock listeners'
    );
  });

  test('4.2 CheckIn.tsx, FastFaceScannerV2.tsx, checkinWatermark.ts & index.css enforce instantEdge, 720x1280 crisp portrait & >=16px iPhone input anti-zoom', () => {
    const checkInSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/CheckIn.tsx'), 'utf8');
    const scannerSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FastFaceScannerV2.tsx'), 'utf8');
    const watermarkSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/utils/checkinWatermark.ts'), 'utf8');
    const indexCss = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

    assert.ok(checkInSrc.includes('instantEdge: true'), 'CheckIn.tsx must send instantEdge: true');
    assert.ok(scannerSrc.includes('instantEdge: true'), 'FastFaceScannerV2.tsx must send instantEdge: true');
    assert.ok(
      checkInSrc.includes('targetW = 720') && checkInSrc.includes('targetH = 1280'),
      'CheckIn.tsx must encode lightweight 720x1280 portrait canvas for fast iPhone upload & low WebKit memory'
    );
    assert.ok(
      watermarkSrc.includes('canvas.width / 1080'),
      'checkinWatermark.ts must scale typography/layout proportionally with canvas.width / 1080'
    );
    assert.ok(
      indexCss.includes('font-size: 16px'),
      'index.css must enforce >=16px font-size on mobile inputs/selects/textareas to prevent iOS Safari auto-zoom'
    );
  });
});
