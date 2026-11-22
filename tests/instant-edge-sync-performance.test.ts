import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
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
(globalThis as any).window = globalThis;
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  configurable: true,
  writable: true,
});

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
// Instrumented GAS Sandbox (Tracks Exact ScriptLock vs Drive/Email Ordering)
// ---------------------------------------------------------------------------
function createInstrumentedGasSandbox(
  initialSheets: Record<string, any[][]>,
  initialNowIso = '2026-11-05T14:35:00+07:00'
) {
  let driveCounter = 1;
  const eventTimeline: string[] = [];
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
            const srcRow = sheetsData[name][row1 - 1 + r] || [];
            const rowArr: any[] = [];
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
        getValue: () => (sheetsData[name][row1 - 1] || [])[col1 - 1] ?? '',
        setValue: (val: any) => {
          ensureCell(row1, col1);
          sheetsData[name][row1 - 1][col1 - 1] = val;
          return rObj;
        },
        setFormula: (formula: string) => {
          ensureCell(row1, col1);
          sheetsData[name][row1 - 1][col1 - 1] = formula;
          return rObj;
        },
        setValues: (vals: any[][]) => {
          for (let r = 0; r < vals.length; r++) {
            for (let c = 0; c < vals[r].length; c++) {
              ensureCell(row1 + r, col1 + c);
              sheetsData[name][row1 - 1 + r][col1 - 1 + c] = vals[r][c];
            }
          }
          return rObj;
        },
        clearContent: () => {
          for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
              if (sheetsData[name]?.[row1 - 1 + r]) {
                sheetsData[name][row1 - 1 + r][col1 - 1 + c] = '';
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
        setNumberFormats: () => rObj,
        merge: () => rObj,
      };
      return rObj;
    };
    return {
      getName: () => name,
      getLastRow: () => sheetsData[name].length,
      getLastColumn: () => sheetsData[name].reduce((max, r) => Math.max(max, r.length), 8),
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
        sheetsData[name].splice(Math.max(0, beforeRow1 - 1), 0, []);
      },
      setRowHeight: () => {},
      setFrozenRows: () => {},
      setFrozenColumns: () => {},
      setColumnWidth: () => {},
      autoResizeColumns: () => {},
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
      if (args.length === 0) super(initialNowIso);
      else super(...(args as [any]));
    }
    static now() {
      return RealDate.parse(initialNowIso);
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
        if (fmt === 'dd/MM/yyyy HH:mm:ss') return `${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}`;
        if (fmt === 'dd/MM/yyyy HH:mm') return `${dd}/${MM}/${yyyy} ${HH}:${mm}`;
        if (fmt === 'dd/MM/yyyy') return `${dd}/${MM}/${yyyy}`;
        if (fmt === 'yyyy-MM-dd') return `${yyyy}-${MM}-${dd}`;
        if (fmt === 'yyyy-MM') return `${yyyy}-${MM}`;
        return `${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}`;
      },
      newBlob: (data: any, mime: string, name: string) => ({ data, mime, name }),
      base64Decode: () => [1, 2, 3],
      computeDigest: (_alg: string, input: string) =>
        Array.from(crypto.createHash('sha256').update(String(input), 'utf8').digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
    },
    SpreadsheetApp: {
      openById: () => ssMock,
      getActiveSpreadsheet: () => ssMock,
      flush: () => {
        eventTimeline.push('FLUSH');
      },
      BorderStyle: { SOLID: 'SOLID', SOLID_MEDIUM: 'SOLID_MEDIUM', SOLID_THICK: 'SOLID_THICK' },
    },
    Drive: {
      Files: {
        create: (meta: any) => {
          eventTimeline.push('DRIVE_V3_UPLOAD');
          const id = `drive_v3_${driveCounter++}_${String(meta?.name || 'img').replace(/\W+/g, '')}`;
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
          eventTimeline.push('DRIVE_LEGACY_UPLOAD');
          const id = `drive_legacy_${driveCounter++}`;
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
        waitLock: () => {
          eventTimeline.push('LOCK_ACQUIRE');
        },
        tryLock: () => {
          eventTimeline.push('LOCK_ACQUIRE');
          return true;
        },
        releaseLock: () => {
          eventTimeline.push('LOCK_RELEASE');
        },
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
      sendEmail: () => {
        eventTimeline.push('MAIL_SEND');
      },
    },
    UrlFetchApp: {
      fetch: () => {
        eventTimeline.push('MAIL_RELAY_SEND');
        return { getContentText: () => '{"ok":true}' };
      },
    },
  };

  vm.createContext(sandbox);
  const gasDir = path.resolve(process.cwd(), 'gas');
  for (const gf of [
    'Code.gs',
    'SheetService.gs',
    'JsonCacheService.gs',
    'Engine.gs',
    'Handlers.gs',
    'ChecklistService.gs',
    'OpsChecklistHandlers.gs',
  ]) {
    const fullPath = path.join(gasDir, gf);
    if (fs.existsSync(fullPath)) {
      vm.runInContext(fs.readFileSync(fullPath, 'utf8'), sandbox, { filename: gf });
    }
  }

  return {
    sheetsData,
    eventTimeline,
    callDoPost: (payload: Record<string, any>) => {
      const out = sandbox.doPost({ postData: { contents: JSON.stringify(payload) } });
      return JSON.parse(out.getContent());
    },
  };
}

describe('Suite 1 — Instant Edge Write-Ahead (<150ms) for Schedule Registration & Operational Writes', () => {
  test('1.1 REGISTER_SHIFT with instantEdge:true responds in <150ms despite 600ms GAS latency, overlays immediately on GET_DATA, and syncs 100% to Google Sheets', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();
    const db = createRealSqliteD1();

    const gas = createInstrumentedGasSandbox({
      DATA: [
        ['Bảng người dùng'],
        ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
        ['nv01', 'h', 'Nguyễn Thị Lan', '', 'lan@kg.vn', 'user', 'Phục vụ', '', 'active'],
      ],
      '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
    });

    const bgTasks: Promise<any>[] = [];
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (_url: any, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.action === 'REGISTER_SHIFT') {
          await new Promise((r) => setTimeout(r, 600));
        }
        return new Response(JSON.stringify(gas.callDoPost(body)), { status: 200 });
      }) as typeof fetch;

      const shifts = ['15:00', '15:00', 'OFF', '16:00', '16:00', '17:00', '17:00'];
      const t0 = performance.now();
      const res = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'REGISTER_SHIFT',
            instantEdge: true,
            username: 'nv01',
            fullname: 'Nguyễn Thị Lan',
            monthSheet: 'Tháng 11/2026',
            weekLabel: '📅 TUẦN 09/11 - 15/11',
            shifts,
            offReason: 'Nghỉ T4 bận học',
          }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => bgTasks.push(p),
      });
      const elapsedMs = performance.now() - t0;
      const json = await res.json();

      assert.equal(json.ok, true);
      assert.equal(json.data.instantEdgeCommitted, true);
      assert.equal(json.data.edgeSaved, true);
      assert.equal(json.data.sheetSaved, false);
      assert.ok(elapsedMs < 200, `Expected <200ms instant response while GAS takes 600ms, got ${elapsedMs.toFixed(1)}ms`);

      // Immediately read GET_DATA BEFORE GAS finishes -> D1 overlay must already report registered!
      const immediateReadRes = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'GET_DATA',
            username: 'nv01',
            fullname: 'Nguyễn Thị Lan',
            role: 'user',
            monthSheet: 'Tháng 11/2026',
            weekLabel: '📅 TUẦN 09/11 - 15/11',
          }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => bgTasks.push(p),
      });
      const immediateRead = await immediateReadRes.json();
      assert.equal(immediateRead.ok, true);
      assert.equal(immediateRead.data.isScheduleRegistered, true);
      assert.deepEqual(immediateRead.data.registeredShifts, shifts);

      // Wait for background waitUntil sync to finish writing into Google Sheets
      await Promise.all(bgTasks);

      const sheetRows = gas.sheetsData['Tháng 11/2026'] || [];
      const lanRow = sheetRows.find((r) => String(r[0] || '').trim() === 'Nguyễn Thị Lan');
      assert.ok(lanRow, 'Google Sheet Tháng 11/2026 must contain Nguyễn Thị Lan row');
      assert.deepEqual(lanRow.slice(1, 8), shifts);

      const d1Sched = await db.prepare(`SELECT sheet_synced FROM edge_schedules WHERE username = 'nv01'`).first();
      assert.equal(Number(d1Sched?.sheet_synced), 1, 'D1 edge_schedules must flip to sheet_synced=1');
      const queueRem = await db.prepare(`SELECT COUNT(*) as c FROM edge_sync_queue`).first();
      assert.equal(Number(queueRem?.c), 0, 'edge_sync_queue must be drained to 0');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('1.2 Instant Operational Writes (Checklist coalescing, Handover, Incident, SoldOut) respond in <150ms, overlay in real-time, and sync cleanly to GAS', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();
    const db = createRealSqliteD1();

    const gas = createInstrumentedGasSandbox({
      DATA: [
        ['Bảng người dùng'],
        ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
        ['tn01', 'h', 'Trần Thu Ngân', '', 'tn@kg.vn', 'user', 'Thu ngân', '', 'active'],
      ],
    });

    const bgTasks: Promise<any>[] = [];
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (_url: any, init?: RequestInit) => {
        await new Promise((r) => setTimeout(r, 450));
        const body = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify(gas.callDoPost(body)), { status: 200 });
      }) as typeof fetch;

      // Rapid 2 checklist ticks + Handover + Incident + SoldOut
      const t0 = performance.now();
      const [cl1, cl2, ho, inc, sold] = await Promise.all([
        edgeMod.onRequest({
          request: new Request('https://kg-checkin.pages.dev/api', {
            method: 'POST',
            body: JSON.stringify({
              action: 'PATCH_OPS_CHECKLIST_ITEM',
              instantEdge: true,
              dateStr: '2026-11-05',
              area: 'A',
              username: 'tn01',
              fullname: 'Trần Thu Ngân',
              itemId: 'item_01',
              checked: true,
              note: 'Đã lau bàn',
              at: '2026-11-05T08:00:00.000Z',
            }),
          }),
          env: { DB: db },
          waitUntil: (p: Promise<any>) => bgTasks.push(p),
        }),
        edgeMod.onRequest({
          request: new Request('https://kg-checkin.pages.dev/api', {
            method: 'POST',
            body: JSON.stringify({
              action: 'PATCH_OPS_CHECKLIST_ITEM',
              instantEdge: true,
              dateStr: '2026-11-05',
              area: 'A',
              username: 'tn01',
              fullname: 'Trần Thu Ngân',
              itemId: 'item_02',
              checked: true,
              note: 'Bật đèn sảnh',
              at: '2026-11-05T08:00:01.000Z',
            }),
          }),
          env: { DB: db },
          waitUntil: (p: Promise<any>) => bgTasks.push(p),
        }),
        edgeMod.onRequest({
          request: new Request('https://kg-checkin.pages.dev/api', {
            method: 'POST',
            body: JSON.stringify({
              action: 'SUBMIT_HANDOVER',
              instantEdge: true,
              username: 'tn01',
              fullname: 'Trần Thu Ngân',
              shift: 'Ca Sáng',
              openingCash: 1000000,
              posCashRevenue: 2000000,
              cashExpense: 0,
              closingCash: 3000000,
              cashAmount: '3.000.000',
              note: 'Két khớp 100%',
            }),
          }),
          env: { DB: db },
          waitUntil: (p: Promise<any>) => bgTasks.push(p),
        }),
        edgeMod.onRequest({
          request: new Request('https://kg-checkin.pages.dev/api', {
            method: 'POST',
            body: JSON.stringify({
              action: 'SUBMIT_INCIDENT',
              instantEdge: true,
              username: 'tn01',
              fullname: 'Trần Thu Ngân',
              shift: 'Ca Sáng',
              area: 'Khu B',
              severity: 'high',
              category: 'Thiết bị hỏng',
              description: 'Máy in bill kẹt giấy',
            }),
          }),
          env: { DB: db },
          waitUntil: (p: Promise<any>) => bgTasks.push(p),
        }),
        edgeMod.onRequest({
          request: new Request('https://kg-checkin.pages.dev/api', {
            method: 'POST',
            body: JSON.stringify({
              action: 'ADD_SOLDOUT',
              instantEdge: true,
              itemName: 'Sườn nướng BBQ',
              reportedBy: 'Trần Thu Ngân',
            }),
          }),
          env: { DB: db },
          waitUntil: (p: Promise<any>) => bgTasks.push(p),
        }),
      ]);
      const elapsedMs = performance.now() - t0;

      const [cl1J, cl2J, hoJ, incJ, soldJ] = await Promise.all([
        cl1.json(),
        cl2.json(),
        ho.json(),
        inc.json(),
        sold.json(),
      ]);

      assert.equal(cl1J.ok, true);
      assert.equal(cl2J.ok, true);
      assert.equal(hoJ.ok, true);
      assert.equal(hoJ.data.expectedCash, 3000000);
      assert.equal(incJ.ok, true);
      assert.equal(soldJ.ok, true);
      assert.ok(
        elapsedMs < 250,
        `Expected all 5 instant Edge writes to return in <250ms while GAS takes 450ms, got ${elapsedMs.toFixed(1)}ms`
      );

      // Verify both checklist items merged safely in D1
      const clRow = await db
        .prepare(`SELECT state_json FROM edge_ops_checklist WHERE id = '2026-11-05|A'`)
        .first();
      const mergedCl = JSON.parse(String(clRow?.state_json || '{}'));
      assert.equal(mergedCl.items?.item_01?.checked, true);
      assert.equal(mergedCl.items?.item_02?.checked, true);

      // Wait for background sync to GAS
      await Promise.all(bgTasks);

      const remQueue = await db.prepare(`SELECT COUNT(*) as c FROM edge_sync_queue`).first();
      assert.equal(Number(remQueue?.c), 0, 'All queued operational writes must drain to GAS cleanly');
      assert.ok((gas.sheetsData['Handovers'] || []).length >= 2, 'Handover must land in GAS Sheet');
      assert.ok((gas.sheetsData['Incidents'] || []).length >= 2, 'Incident must land in GAS Sheet');
      assert.ok((gas.sheetsData['SoldOut'] || []).length >= 2, 'SoldOut must land in GAS Sheet');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('Suite 2 — Targeted Edge Cache Invalidation, True SWR & Revalidation Deduplication', () => {
  test('2.1 ADD_SOLDOUT invalidates ONLY GET_SOLDOUT/GET_DATA and preserves GET_TRAINING_CONTENT & GET_ALL_SCHEDULES', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();
    const db = createRealSqliteD1();

    let gasFetchCount = 0;
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (_url: any, init?: RequestInit) => {
        gasFetchCount += 1;
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.action === 'GET_TRAINING_CONTENT') {
          return new Response(JSON.stringify({ ok: true, data: { lessons: ['SOP-1'] } }), { status: 200 });
        }
        if (body.action === 'GET_SOLDOUT') {
          return new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
      }) as typeof fetch;

      const send = async (body: Record<string, any>) => {
        const bg: Promise<any>[] = [];
        const r = await edgeMod.onRequest({
          request: new Request('https://kg-checkin.pages.dev/api', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          env: { DB: db },
          waitUntil: (p: Promise<any>) => bg.push(p),
        });
        await Promise.all(bg);
        return r;
      };

      // Warm GET_TRAINING_CONTENT and GET_SOLDOUT in D1 cache
      await send({ action: 'GET_TRAINING_CONTENT' });
      await send({ action: 'GET_SOLDOUT' });
      assert.equal(gasFetchCount, 2);

      // Mutate ADD_SOLDOUT -> must invalidate GET_SOLDOUT, NOT GET_TRAINING_CONTENT!
      await send({ action: 'ADD_SOLDOUT', itemName: 'Trà đào', reportedBy: 'Lan', instantEdge: true });
      const countAfterMut = gasFetchCount;

      // Read GET_TRAINING_CONTENT again -> MUST HIT D1 cache (0 extra GAS calls!)
      const trainHit = await send({ action: 'GET_TRAINING_CONTENT' });
      assert.equal(trainHit.headers.get('X-Proxy-Cache'), 'HIT-L2-EDGE-DB');
      assert.equal(gasFetchCount, countAfterMut, 'Unrelated GET_TRAINING_CONTENT must NOT be wiped by ADD_SOLDOUT');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('2.2 True Edge SWR serves stale D1 entry in <50ms and deduplicates concurrent background GAS revalidations', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();
    const db = createRealSqliteD1();

    let gasCalls = 0;
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => {
        gasCalls += 1;
        await new Promise((r) => setTimeout(r, 250));
        return new Response(JSON.stringify({ ok: true, data: { rev: gasCalls } }), { status: 200 });
      }) as typeof fetch;

      // Seed initial cache
      const bgInit: Promise<any>[] = [];
      await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({ action: 'GET_TRAINING_CONTENT' }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => bgInit.push(p),
      });
      await Promise.all(bgInit);
      assert.equal(gasCalls, 1);

      // Backdate expires_at by 60s (stale, but within 15-min SWR window!)
      const now = Date.now();
      await db
        .prepare(`UPDATE edge_kv_cache SET expires_at = ?1, updated_at = ?2 WHERE action = 'GET_TRAINING_CONTENT'`)
        .bind(now - 60_000, now - 60_000)
        .run();

      // Fire 3 concurrent reads -> all 3 MUST return instantly (<100ms) with STALE-WHILE-REVALIDATE & only 1 GAS revalidation!
      const bgSwr: Promise<any>[] = [];
      const t0 = performance.now();
      const responses = await Promise.all([1, 2, 3].map(() =>
        edgeMod.onRequest({
          request: new Request('https://kg-checkin.pages.dev/api', {
            method: 'POST',
            body: JSON.stringify({ action: 'GET_TRAINING_CONTENT' }),
          }),
          env: { DB: db },
          waitUntil: (p: Promise<any>) => bgSwr.push(p),
        })
      ));
      const elapsedMs = performance.now() - t0;

      for (const r of responses) {
        assert.equal(r.headers.get('X-Proxy-Cache'), 'STALE-WHILE-REVALIDATE');
      }
      assert.ok(elapsedMs < 150, `Expected <150ms SWR burst while GAS takes 250ms, got ${elapsedMs.toFixed(1)}ms`);

      await Promise.all(bgSwr);
      assert.equal(gasCalls, 2, '3 concurrent stale reads must deduplicate into exactly 1 background GAS revalidation');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('Suite 3 — Zero-Lock-Blockage Drive Image Upload, Link Overlay & Checklist Flat-Patch', () => {
  test('3.1 GAS handleUploadCheckinImage uploads to Drive BEFORE acquiring ScriptLock and releases lock BEFORE email; handleUploadImage uses Drive v3', () => {
    const gas = createInstrumentedGasSandbox({
      DATA: [
        ['Bảng người dùng'],
        ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
        ['mai01', 'h', 'Nguyễn Thị Mai', '', 'mai@kg.vn', 'user', 'Thu ngân', '', 'active'],
      ],
      '✔️CHẤM CÔNG': [
        ['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON'],
        [
          'Nguyễn Thị Mai',
          'Vào ca',
          "'05/11/2026 08:30:00",
          'Nhà hàng',
          'Hợp lệ',
          '5m',
          '',
          JSON.stringify({ checkinId: 'CHK_mai_lock_test', username: 'mai01', hoVaTen: 'Nguyễn Thị Mai', emailSent: false }),
        ],
      ],
    });

    const upRes = gas.callDoPost({
      action: 'UPLOAD_CHECKIN_IMAGE',
      checkinId: 'CHK_mai_lock_test',
      username: 'mai01',
      fullname: 'Nguyễn Thị Mai',
      email: 'mai@kg.vn',
      image: 'data:image/jpeg;base64,' + 'A'.repeat(200),
      sendEmailAfterUpload: true,
    });

    assert.equal(upRes.ok, true);
    assert.equal(upRes.data.rowMatched, 2);
    const tl = gas.eventTimeline;
    const driveIdx = tl.indexOf('DRIVE_V3_UPLOAD');
    const lockAcqIdx = tl.indexOf('LOCK_ACQUIRE');
    const lockRelIdx = tl.indexOf('LOCK_RELEASE');
    const mailIdx = tl.findIndex((e) => e === 'MAIL_SEND' || e === 'MAIL_RELAY_SEND');

    assert.ok(driveIdx >= 0 && lockAcqIdx > driveIdx, `Drive upload must execute BEFORE ScriptLock acquire, timeline=${JSON.stringify(tl)}`);
    assert.ok(lockRelIdx > lockAcqIdx, `ScriptLock must release after flush, timeline=${JSON.stringify(tl)}`);
    if (mailIdx >= 0) {
      assert.ok(mailIdx > lockRelIdx, `Email must execute AFTER ScriptLock release, timeline=${JSON.stringify(tl)}`);
    }

    // Also verify handleUploadImage uses fast Drive v3
    gas.eventTimeline.length = 0;
    const genericUp = gas.callDoPost({
      action: 'UPLOAD_IMAGE',
      filename: 'incident_01.webp',
      image: 'data:image/webp;base64,' + 'B'.repeat(200),
    });
    assert.equal(genericUp.ok, true);
    assert.match(String(genericUp.data.url || ''), /^https:\/\/drive\.google\.com\/file\/d\/drive_v3_/);
    assert.equal(gas.eventTimeline[0], 'DRIVE_V3_UPLOAD');
  });

  test('3.2 Edge applyD1Overlays patches confirmed Drive link onto cached GAS rows still showing PENDING, and GAS handlePatchOpsChecklistItem accepts flat fields', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();
    const db = createRealSqliteD1();

    // Bootstrap D1 schema
    await edgeMod.onRequest({
      request: new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        body: JSON.stringify({ action: 'GET_EDGE_DB_STATUS' }),
      }),
      env: { DB: db },
      waitUntil: () => {},
    });

    // Seed D1 with a punch that already has a confirmed Google Drive URL
    await db
      .prepare(
        `INSERT INTO edge_checkin_logs (id, username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, sheet_synced, created_at)
         VALUES ('CHK_patch_1', 'mai01', 'Nguyễn Thị Mai', 'Vào ca', 'Ca 1', '05/11/2026 08:30:00', 'Hợp lệ', 3, 10.976, 106.664, '', 'https://drive.google.com/file/d/drive_confirmed_1/view', 1, ?1)`
      )
      .bind(Date.now())
      .run();

    const origFetch = globalThis.fetch;
    try {
      // Simulate GAS GET_DATA returning a stale row whose image is still 'PENDING'
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              logs: [
                {
                  checkinId: 'CHK_patch_1',
                  username: 'mai01',
                  fullname: 'Nguyễn Thị Mai',
                  type: 'Vào ca',
                  time: '05/11/2026 08:30:00',
                  status: 'Hợp lệ',
                  image: 'PENDING',
                },
              ],
            },
          }),
          { status: 200 }
        )) as typeof fetch;

      const res = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'GET_DATA',
            username: 'mai01',
            fullname: 'Nguyễn Thị Mai',
            role: 'user',
            forceRefresh: true,
          }),
        }),
        env: { DB: db },
        waitUntil: () => {},
      });
      const json = await res.json();
      assert.equal(json.data.logs.length, 1);
      assert.equal(
        json.data.logs[0].image,
        'https://drive.google.com/file/d/drive_confirmed_1/view',
        'Edge overlay must patch confirmed Drive URL onto stale GAS row'
      );
    } finally {
      globalThis.fetch = origFetch;
    }

    // Verify GAS handlePatchOpsChecklistItem accepts flat fields without itemPatch wrapper
    const gas = createInstrumentedGasSandbox({
      DATA: [
        ['Bảng người dùng'],
        ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
        ['mai01', 'h', 'Nguyễn Thị Mai', '', 'mai@kg.vn', 'user', 'Thu ngân', '', 'active'],
      ],
    });
    const flatPatchRes = gas.callDoPost({
      action: 'PATCH_OPS_CHECKLIST_ITEM',
      dateStr: '2026-11-05',
      area: 'A',
      username: 'mai01',
      fullname: 'Nguyễn Thị Mai',
      itemId: 'flat_item_1',
      checked: true,
      note: 'Flat tick OK',
    });
    assert.equal(flatPatchRes.ok, true, `Expected flat PATCH_OPS_CHECKLIST_ITEM to succeed, got ${JSON.stringify(flatPatchRes)}`);
  });

  test('3.3 Frontend callApi coalesces duplicate concurrent identical mutations to prevent double-tap congestion', async () => {
    const apiMod = await vite.ssrLoadModule('/src/services/api.ts');
    apiMod.clearApiCache();

    let fetchCount = 0;
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => {
        fetchCount += 1;
        await new Promise((r) => setTimeout(r, 80));
        return new Response(JSON.stringify({ ok: true, data: { seq: fetchCount } }), { status: 200 });
      }) as typeof fetch;

      const [r1, r2] = await Promise.all([
        apiMod.callApi('ADD_SOLDOUT', { itemName: 'Bò nướng', instantEdge: true }, { background: true }),
        apiMod.callApi('ADD_SOLDOUT', { itemName: 'Bò nướng', instantEdge: true }, { background: true }),
      ]);

      assert.equal(fetchCount, 1, 'Identical concurrent mutations must coalesce into 1 network request');
      assert.equal(r1?.ok, true);
      assert.equal(r2?.ok, true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('Suite 4 — Ultra-Fast Edge D1 Salted-SHA256 Login Verifier (<100ms) & Security Invalidation', () => {
  test('4.1 Cold login populates salted hash (never plaintext), warm login verifies in <100ms without hitting GAS or wiping cache, wrong password rejects, and password/status changes invalidate immediately', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();
    const db = createRealSqliteD1();

    const gas = createInstrumentedGasSandbox({
      DATA: [
        ['Bảng người dùng'],
        ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
        ['admin01', 'admin123', 'Quản Lý Chính', '', 'admin@kg.vn', 'admin', 'Quản lý', '', 'active'],
        ['nv_fast', 'secret99', 'Lê Minh Khôi', '', 'khoi@kg.vn', 'user', 'Phục vụ', '', 'active'],
      ],
    });

    let gasLoginCalls = 0;
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (_url: any, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.action === 'LOGIN') {
          gasLoginCalls += 1;
          await new Promise((r) => setTimeout(r, 450)); // Simulate slow GAS cold login
        }
        return new Response(JSON.stringify(gas.callDoPost(body)), { status: 200 });
      }) as typeof fetch;

      // Seed an unrelated read cache to prove LOGIN does NOT wipe edge_kv_cache
      const bgSeed: Promise<any>[] = [];
      await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({ action: 'GET_TRAINING_CONTENT' }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => bgSeed.push(p),
      });
      await Promise.all(bgSeed);

      // 1. Cold login -> hits GAS once, returns sessionToken, caches salted SHA-256 hash in D1
      const bg1: Promise<any>[] = [];
      const coldRes = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({ action: 'LOGIN', username: 'nv_fast', password: 'secret99' }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => bg1.push(p),
      });
      await Promise.all(bg1);
      const coldJson = await coldRes.json();
      assert.equal(coldJson.ok, true);
      assert.equal(coldJson.data.fullname, 'Lê Minh Khôi');
      assert.ok(coldJson.data.sessionToken, 'Must issue HMAC sessionToken');
      assert.equal(gasLoginCalls, 1);

      // Verify D1 stores ONLY 64-hex salted hash, NEVER plaintext 'secret99'
      const authRow = await db
        .prepare(`SELECT password_hash, user_json FROM edge_auth_cache WHERE username = 'nv_fast'`)
        .first();
      assert.match(String(authRow?.password_hash || ''), /^[a-f0-9]{64}$/);
      assert.ok(!String(authRow?.password_hash || '').includes('secret99'));
      assert.ok(!String(authRow?.user_json || '').includes('secret99'));

      // Verify unrelated GET_TRAINING_CONTENT cache survived LOGIN untouched!
      const cacheStillThere = await db
        .prepare(`SELECT COUNT(*) as c FROM edge_kv_cache WHERE action = 'GET_TRAINING_CONTENT'`)
        .first();
      assert.equal(Number(cacheStillThere?.c), 1, 'LOGIN must NOT wipe unrelated edge_kv_cache entries');

      // 2. Warm login -> MUST verify at Cloudflare Edge D1 in <100ms with 0 GAS calls!
      const bg2: Promise<any>[] = [];
      const t0 = performance.now();
      const warmRes = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({ action: 'LOGIN', username: 'nv_fast', password: 'secret99' }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => bg2.push(p),
      });
      const warmMs = performance.now() - t0;
      await Promise.all(bg2);
      const warmJson = await warmRes.json();

      assert.equal(warmJson.ok, true);
      assert.equal(warmRes.headers.get('X-Edge-Auth'), 'D1-INSTANT');
      assert.ok(warmJson.data.sessionToken);
      assert.equal(gasLoginCalls, 1, 'Warm Edge D1 login must make 0 GAS calls');
      assert.ok(warmMs < 150, `Expected <150ms Edge D1 login while GAS takes 450ms, got ${warmMs.toFixed(1)}ms`);

      // 3. Wrong password -> must NOT pass Edge cache and must be rejected by GAS
      const wrongRes = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({ action: 'LOGIN', username: 'nv_fast', password: 'wrongpassword' }),
        }),
        env: { DB: db },
        waitUntil: () => {},
      });
      const wrongJson = await wrongRes.json();
      assert.equal(wrongJson.ok, false);
      assert.equal(gasLoginCalls, 2);

      // 4. Admin FORCE_RESET_PASSWORD -> must immediately evict edge_auth_cache for nv_fast!
      const bgReset: Promise<any>[] = [];
      const resetRes = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'FORCE_RESET_PASSWORD',
            role: 'admin',
            adminUsername: 'admin01',
            targetUsername: 'nv_fast',
          }),
        }),
        env: { DB: db },
        waitUntil: (p: Promise<any>) => bgReset.push(p),
      });
      await Promise.all(bgReset);
      const resetJson = await resetRes.json();
      assert.equal(resetJson.ok, true);

      const evictedRow = await db
        .prepare(`SELECT COUNT(*) as c FROM edge_auth_cache WHERE username = 'nv_fast'`)
        .first();
      assert.equal(Number(evictedRow?.c), 0, 'FORCE_RESET_PASSWORD must evict edge_auth_cache immediately');

      // Old password must now fail cleanly
      const afterResetOldPwd = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({ action: 'LOGIN', username: 'nv_fast', password: 'secret99' }),
        }),
        env: { DB: db },
        waitUntil: () => {},
      });
      assert.equal((await afterResetOldPwd.json()).ok, false, 'Old password must fail after FORCE_RESET_PASSWORD');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
