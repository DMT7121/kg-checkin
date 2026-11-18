import test, { after, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createServer, type ViteDevServer } from 'vite';

// ---------------------------------------------------------------------------
// Minimal Browser Storage & DOM Shim for Node Test Environment
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
(globalThis as any).document = {
  visibilityState: 'visible',
  addEventListener: () => {},
  removeEventListener: () => {},
  documentElement: { classList: { add: () => {}, remove: () => {} } },
};
if (typeof (globalThis as any).addEventListener !== 'function') {
  (globalThis as any).addEventListener = () => {};
  (globalThis as any).removeEventListener = () => {};
}
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
if (typeof (globalThis as any).dispatchEvent !== 'function') {
  (globalThis as any).dispatchEvent = () => true;
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
// In-Memory Google Apps Script Sandbox (Loads Real gas/*.gs Files)
// ---------------------------------------------------------------------------
function createGasSandbox(
  initialSheets: Record<string, any[][]>,
  initialNowIso = '2026-11-10T09:00:00+07:00'
) {
  let currentNowIso = initialNowIso;
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
              const v = srcRow[col1 - 1 + c];
              rowArr.push(typeof v === 'string' && v.startsWith("'") ? v.slice(1) : (v ?? ''));
            }
            out.push(rowArr);
          }
          return out;
        },
        getDisplayValues: () => {
          const out: string[][] = [];
          for (let r = 0; r < numRows; r++) {
            const srcRow = sheetsData[name][row1 - 1 + r] || [];
            const rowArr: string[] = [];
            for (let c = 0; c < numCols; c++) {
              const v = srcRow[col1 - 1 + c];
              rowArr.push(v === null || v === undefined ? '' : String(v).replace(/^'/, ''));
            }
            out.push(rowArr);
          }
          return out;
        },
        getValue: () => rObj.getValues()[0][0],
        setValues: (vals: any[][]) => {
          for (let r = 0; r < vals.length; r++) {
            for (let c = 0; c < vals[r].length; c++) {
              ensureCell(row1 + r, col1 + c);
              sheetsData[name][row1 - 1 + r][col1 - 1 + c] = vals[r][c];
            }
          }
          return rObj;
        },
        setValue: (val: any) => rObj.setValues([[val]]),
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
        setFontWeight: () => rObj,
        setFontWeights: () => rObj,
        setFontStyle: () => rObj,
        setFontColor: () => rObj,
        setFontColors: () => rObj,
        setFontSize: () => rObj,
        setFontSizes: () => rObj,
        setFontFamily: () => rObj,
        setFontFamilies: () => rObj,
        setBackground: () => rObj,
        setBackgrounds: () => rObj,
        setHorizontalAlignment: () => rObj,
        setHorizontalAlignments: () => rObj,
        setVerticalAlignment: () => rObj,
        setVerticalAlignments: () => rObj,
        setWrap: () => rObj,
        setWraps: () => rObj,
        setBorder: () => rObj,
        setNote: () => rObj,
        clearNote: () => rObj,
        setFormula: (f: string) => rObj.setValue(f),
        setNumberFormat: () => rObj,
        setNumberFormats: () => rObj,
        merge: () => rObj,
      };
      return rObj;
    };

    return {
      getName: () => name,
      getSheetId: () => name.length * 101,
      getIndex: () => Object.keys(sheetsData).indexOf(name) + 1,
      activate: () => {},
      setFrozenRows: () => {},
      setColumnWidth: () => {},
      setRowHeight: () => {},
      setHiddenGridlines: () => {},
      clearConditionalFormatRules: () => {},
      hideColumns: () => {},
      getLastRow: () => sheetsData[name].length,
      getLastColumn: () => sheetsData[name].reduce((m, r) => Math.max(m, r.length), 0),
      appendRow: (row: any[]) => {
        sheetsData[name].push([...row]);
      },
      insertRowBefore: (beforeRow1: number) => {
        const idx = Math.max(0, beforeRow1 - 1);
        sheetsData[name].splice(idx, 0, []);
      },
      insertRowAfter: (afterRow1: number) => {
        sheetsData[name].splice(Math.max(0, afterRow1), 0, []);
      },
      deleteRow: (r1: number) => {
        sheetsData[name].splice(r1 - 1, 1);
      },
      deleteRows: (r1: number, count: number) => {
        sheetsData[name].splice(r1 - 1, count);
      },
      getRange: (r1: number | string, c1 = 1, nr = 1, nc = 1) => makeRange(r1, c1, nr, nc),
      getDataRange: () => {
        const rows = Math.max(1, sheetsData[name].length);
        const cols = Math.max(1, sheetsData[name].reduce((m, r) => Math.max(m, r.length), 1));
        return makeRange(1, 1, rows, cols);
      },
    };
  }

  const ssMock = {
    getId: () => 'MOCK_SS_ID',
    getSheetByName: (n: string) => (sheetsData[n] ? makeSheet(n) : null),
    insertSheet: (n: string) => makeSheet(n),
    getSheets: () => Object.keys(sheetsData).map((n) => makeSheet(n)),
    moveActiveSheet: () => {},
    toast: () => {},
  };

  const scriptCache = new Map<string, string>();
  const RealDate = Date;
  class MockDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(RealDate.parse(currentNowIso));
      } else {
        // @ts-expect-error spread into Date
        super(...args);
      }
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
        if (fmt === 'H') return String(vn.getUTCHours());
        if (fmt === 'm') return String(vn.getUTCMinutes());
        return `${dd}/${MM}/${yyyy} ${HH}:${mm}:${ss}`;
      },
      computeDigest: () => [1, 2, 3, 4],
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      newBlob: (data: any, mime: string, name: string) => ({ data, mime, name }),
      base64Decode: () => [],
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
    DriveApp: {
      getFolderById: () => ({
        createFile: () => ({
          setSharing: () => {},
          getUrl: () => 'https://drive.google.com/file/d/mock/view',
        }),
      }),
      Access: { ANYONE_WITH_LINK: 'ANYONE' },
      Permission: { VIEW: 'VIEW' },
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
    scriptCache,
    setNow: (iso: string) => {
      currentNowIso = iso;
    },
    callDoPost: (payload: Record<string, any>) => {
      const out = sandbox.doPost({ postData: { contents: JSON.stringify(payload) } });
      return JSON.parse(out.getContent());
    },
  };
}

// ---------------------------------------------------------------------------
// Stateful Cloudflare Edge D1 Mock
// ---------------------------------------------------------------------------
function createEdgeD1Mock() {
  const schedules = new Map<string, any>();
  const checkinLogs = new Map<string, any>();
  const syncQueue: Array<any> = [];
  let autoId = 1;

  const db = {
    schedules,
    checkinLogs,
    syncQueue,
    batch: async () => [],
    prepare: (sql: string) => {
      let args: any[] = [];
      const normSql = sql.replace(/\s+/g, ' ').trim();
      const stmt = {
        bind: (...b: any[]) => {
          args = b;
          return stmt;
        },
        run: async () => {
          if (normSql.includes('INSERT OR REPLACE INTO edge_checkin_logs')) {
            const hasExplicitSheetSyncedBind = args.length >= 14;
            const sheetSyncedVal = hasExplicitSheetSyncedBind
              ? Number(args[12])
              : normSql.includes(', 0, ?13)')
                ? 0
                : 1;
            const createdAtVal = hasExplicitSheetSyncedBind ? Number(args[13]) : Number(args[12]);
            checkinLogs.set(String(args[0]), {
              id: String(args[0]),
              username: String(args[1] || '').toLowerCase(),
              fullname: String(args[2] || ''),
              check_type: String(args[3] || ''),
              shift_name: String(args[4] || ''),
              time_str: String(args[5] || ''),
              status: String(args[6] || ''),
              distance: Number(args[7] || 0),
              lat: args[8],
              lng: args[9],
              note: String(args[10] || ''),
              image_url: String(args[11] || ''),
              sheet_synced: sheetSyncedVal,
              created_at: createdAtVal,
            });
          } else if (normSql.includes('UPDATE edge_checkin_logs SET check_type =')) {
            const newType = String(args[0] || '');
            const timeStr = String(args[1] || '');
            const targetUser = args.length >= 3 ? String(args[2] || '').toLowerCase() : '';
            for (const rec of checkinLogs.values()) {
              if (rec.time_str === timeStr && (!targetUser || rec.username === targetUser)) {
                rec.check_type = newType;
              }
            }
          } else if (normSql.includes('INSERT INTO edge_sync_queue')) {
            syncQueue.push({
              id: autoId++,
              dedupe_key: String(args[0]),
              action: 'CHECK_IN_OUT',
              payload_json: String(args[1]),
              attempts: 0,
              status: 'pending',
              created_at: Number(args[args.length - 1]) || Date.now(),
              updated_at: Number(args[args.length - 1]) || Date.now(),
            });
          }
          return { success: true };
        },
        first: async () => null,
        all: async () => {
          if (normSql.includes('FROM edge_checkin_logs')) {
            const rows = Array.from(checkinLogs.values()).sort((a, b) => b.created_at - a.created_at);
            if (normSql.includes('WHERE username =')) {
              const u = String(args[0] || '').toLowerCase();
              const cutoff = typeof args[1] === 'number' ? args[1] : 0;
              return { results: rows.filter((r) => r.username === u && r.created_at >= cutoff) };
            }
            const cutoff = typeof args[0] === 'number' ? args[0] : 0;
            return { results: rows.filter((r) => r.created_at >= cutoff) };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
  };
  return db;
}

describe('Anti-False-Spam & Duplicate Check-In Regression Suite (Frontend + Edge D1 + GAS)', () => {
  test('RC-1: Edge D1 APPROVE_MISSED_CHECKIN & delayed offlineQueue sync NEVER trigger false COOLDOWN_15M or MAX_4_PUNCHES on first live punch', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();

    const RealDate = Date;
    let fakeNowMs = RealDate.parse('2026-11-10T08:58:00+07:00');
    const origNow = Date.now;
    Date.now = () => fakeNowMs;

    try {
      const mockDb = createEdgeD1Mock();
      const origFetch = globalThis.fetch;
      globalThis.fetch = async (_input: any, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (body.action === 'LOGIN') {
          return new Response(
            JSON.stringify({
              ok: true,
              data: { username: 'admin', fullname: 'Quản trị viên', role: 'admin' },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (body.action === 'APPROVE_MISSED_CHECKIN') {
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                id: body.id,
                username: 'nv_hoa',
                fullname: 'Phạm Thị Hoa',
                type: 'Ra ca',
                approvedType: 'Ra ca',
                time: body.approvedTime || '09/11/2026 22:00:00',
                effectiveTime: body.approvedTime || '09/11/2026 22:00:00',
                status: 'Hợp lệ',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ ok: true, msg: 'Synced to GAS' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      try {
        const callEdge = async (payload: Record<string, any>, authHeader = '') => {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (authHeader) headers.Authorization = authHeader;
          const res = await edgeMod.onRequest({
            request: new Request('https://kg-checkin.pages.dev/api', {
              method: 'POST',
              headers,
              body: JSON.stringify(payload),
            }),
            env: {
              DB: mockDb,
              GAS_URL: 'https://script.google.com/macros/s/MOCK_GAS/exec',
              SESSION_SECRET: 'test-secret-rc1',
            },
            waitUntil: () => {},
          });
          return res.json();
        };

        const adminLogin = await callEdge({ action: 'LOGIN', username: 'admin', password: 'pw' });
        const adminAuth = `Bearer ${adminLogin.data.sessionToken}`;

        // 1A. Admin approves 4 historical missed check-ins from earlier days at 08:58:00
        for (let d = 5; d <= 8; d++) {
          const dayStr = String(d).padStart(2, '0');
          const appRes = await callEdge(
            {
              action: 'APPROVE_MISSED_CHECKIN',
              id: `MC_REQ_${d}`,
              approvedTime: `${dayStr}/11/2026 22:00:00`,
            },
            adminAuth
          );
          assert.equal(appRes.ok, true);
        }

        // 2 minutes later (09:00:00 on 10/11/2026): nv_hoa arrives and punches Vào ca for the VERY FIRST TIME today!
        fakeNowMs = RealDate.parse('2026-11-10T09:00:00+07:00');
        const firstPunchRes = await callEdge({
          action: 'CHECK_IN_OUT',
          instantEdge: true,
          checkinId: 'CHK_HOA_FIRST_IN_1011',
          username: 'nv_hoa',
          fullname: 'Phạm Thị Hoa',
          type: 'Vào ca',
          shift: 'Ca Sáng',
          time: '10/11/2026 09:00:00',
          lat: 10.976083,
          lng: 106.664654,
        });

        assert.equal(
          firstPunchRes.ok,
          true,
          `First punch today must NOT be blocked by Admin's recent approval of historical missed check-ins! Got: ${JSON.stringify(firstPunchRes)}`
        );

        // 1B. Delayed offlineQueue sync: nv_binh punched Vào ca offline at 09:00:00, synced at 16:59:30, then punches Ra ca at 17:00:00!
        fakeNowMs = RealDate.parse('2026-11-10T16:59:30+07:00');
        const delayedInSync = await callEdge({
          action: 'CHECK_IN_OUT',
          instantEdge: true,
          isOfflineRetry: true,
          checkinId: 'CHK_BINH_OFFLINE_0900',
          username: 'nv_binh',
          fullname: 'Lê Thị Bình',
          type: 'Vào ca',
          shift: 'Ca Sáng',
          time: '10/11/2026 09:00:00',
          lat: 10.976083,
          lng: 106.664654,
        });
        assert.equal(delayedInSync.ok, true);

        // 30 seconds later (17:00:00): nv_binh taps Ra ca (actual punch interval is 8 hours, NOT 30 seconds!)
        fakeNowMs = RealDate.parse('2026-11-10T17:00:00+07:00');
        const liveOutRes = await callEdge({
          action: 'CHECK_IN_OUT',
          instantEdge: true,
          checkinId: 'CHK_BINH_LIVE_1700',
          username: 'nv_binh',
          fullname: 'Lê Thị Bình',
          type: 'Ra ca',
          shift: 'Ca Sáng',
          time: '10/11/2026 17:00:00',
          lat: 10.976083,
          lng: 106.664654,
        });
        assert.equal(
          liveOutRes.ok,
          true,
          `Live Ra ca at 17:00 must NOT be blocked when 09:00 Vào ca synced offline 30s ago! Got: ${JSON.stringify(liveOutRes)}`
        );
      } finally {
        globalThis.fetch = origFetch;
      }
    } finally {
      Date.now = origNow;
    }
  });

  test('RC-1b: GAS handleCheckInOut ignores isMissedCheckInClaim supplement rows for 15m anti-spam while still blocking real duplicate punches', () => {
    const gas = createGasSandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['nv_hoa', 'hash', 'Phạm Thị Hoa', '', 'hoa@kg.vn', 'user', 'Phục vụ', '', 'active'],
        ],
        '⚙️ CẤU HÌNH': [
          ['Key', 'Value'],
          ['GPS_CONFIG', JSON.stringify({ lat: 10.976083, lng: 106.664654, radius: 25 })],
        ],
        '✔️CHẤM CÔNG': [
          ['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON'],
          [
            'Phạm Thị Hoa',
            'Vào ca',
            "'10/11/2026 08:55:00",
            'Bổ sung công',
            'Bổ sung công (Đã duyệt)',
            0,
            '',
            JSON.stringify({
              id: 'MC_REQ_1',
              username: 'nv_hoa',
              fullname: 'Phạm Thị Hoa',
              type: 'Vào ca',
              time: '10/11/2026 08:55:00',
              isMissedCheckInClaim: true,
            }),
          ],
        ],
      },
      '2026-11-10T09:00:00+07:00' // Tuesday (outside Thu-Sat schedule gate)
    );

    // 5 minutes after an approved missed-checkin claim timestamp, real live punch must NOT be treated as spam!
    const livePunch = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinId: 'CHK_GAS_LIVE_1',
      username: 'nv_hoa',
      fullname: 'Phạm Thị Hoa',
      type: 'Ra ca',
      shift: 'Ca Sáng',
      lat: 10.976083,
      lng: 106.664654,
    });
    assert.equal(livePunch.ok, true, `GAS must not treat isMissedCheckInClaim row as live spam cooldown: ${JSON.stringify(livePunch)}`);

    // Now 3 minutes after a REAL live punch, a second non-idempotent punch MUST still be blocked by 15m anti-spam!
    gas.setNow('2026-11-10T09:03:00+07:00');
    const realSpam = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinId: 'CHK_GAS_SPAM_2',
      username: 'nv_hoa',
      fullname: 'Phạm Thị Hoa',
      type: 'Vào ca',
      shift: 'Ca Sáng',
      lat: 10.976083,
      lng: 106.664654,
    });
    assert.equal(realSpam.ok, false, 'Genuine <15m duplicate live punch must still be blocked');
  });

  test('RC-2: Shared-device session switch / logout isolates lastCheckInTime, kg_last_punch_record & stale logs between Employee A and Employee B', async () => {
    const storeMod = await vite.ssrLoadModule('/src/store/useAppStore.ts');
    const helpers = await vite.ssrLoadModule('/src/utils/helpers.ts');
    const useAppStore = storeMod.useAppStore;

    const empA = { username: 'emp_a', fullname: 'Nguyễn Thị A', role: 'user' as const };
    const empB = { username: 'emp_b', fullname: 'Trần Văn B', role: 'user' as const };

    // Employee A logs in and checks in 2 minutes ago
    const twoMinAgo = Date.now() - 2 * 60 * 1000;
    useAppStore.getState().setCurrentUser(empA as any);
    useAppStore.getState().setLastCheckInTime(twoMinAgo);
    helpers.setLocalLastPunch(empA, 'Vào ca', '10/11/2026 08:58:00');

    // Case 2A: Even BEFORE logout completes (or if setCurrentUser switches directly to empB), empB must NOT inherit empA's lastCheckInTime or local punch!
    useAppStore.getState().setCurrentUser(empB as any);
    assert.equal(
      useAppStore.getState().lastCheckInTime,
      0,
      'Switching currentUser to Employee B must reset Employee A lastCheckInTime to 0'
    );
    const cooldownBeforeLogout = helpers.getCheckInCooldown([], empB);
    assert.equal(
      cooldownBeforeLogout.isBlocked,
      false,
      `Employee B must NOT be blocked by Employee A's lastCheckInTime or kg_last_punch_record! Got: ${JSON.stringify(cooldownBeforeLogout)}`
    );

    // Case 2B: Logout must clear lastCheckInTime and kg_last_punch_record
    useAppStore.getState().setCurrentUser(empA as any);
    useAppStore.getState().setLastCheckInTime(twoMinAgo);
    helpers.setLocalLastPunch(empA, 'Vào ca', '10/11/2026 08:58:00');
    assert.notEqual(localStorage.getItem('kg_last_punch_record'), null);
    useAppStore.getState().logout();

    assert.equal(useAppStore.getState().lastCheckInTime, 0, 'logout() must reset lastCheckInTime to 0');
    assert.equal(localStorage.getItem('kg_last_punch_record'), null, 'logout() must purge kg_last_punch_record');

    // Case 2C: Stale/Admin logs with empty username from another employee must NEVER be hijacked by Fallback 1 in getRecommendedCheckInType!
    const staleOtherUserLogs = [
      { username: '', fullname: 'Nguyễn Thị A', type: 'Vào ca', time: '10/11/2026 08:00:00' },
      { username: '', fullname: 'Nguyễn Thị A', type: 'Ra ca', time: '10/11/2026 12:00:00' },
      { username: '', fullname: 'Nguyễn Thị A', type: 'Vào ca', time: '10/11/2026 13:00:00' },
      { username: '', fullname: 'Nguyễn Thị A', type: 'Ra ca', time: '10/11/2026 17:00:00' },
    ];
    const recB = helpers.getRecommendedCheckInType(
      staleOtherUserLogs,
      empB,
      new Date('2026-11-10T17:30:00+07:00')
    );
    assert.equal(Boolean(recB.isMaxPunchesReached), false, 'Employee B with 0 punches must NOT hit MAX_4_PUNCHES from legacy logs of Nguyễn Thị A');
    assert.equal(recB.recommendedType, 'Vào ca', 'Employee B with 0 punches must default to Vào ca');
    assert.equal(recB.todayLogsCount, 0);
  });

  test('RC-4: Vietnamese diacritic-folded names ("Hùng" vs "Hưng") & identical fullnames with distinct usernames NEVER collide across Frontend, Edge D1 & GAS', async () => {
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');
    const helpers = await vite.ssrLoadModule('/src/utils/helpers.ts');
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();

    const hung2 = { username: 'hung2', fullname: 'Nguyễn Văn Hưng' };
    const tuan2 = { username: 'tuan2', fullname: 'Nguyễn Minh Tuấn' };

    // 4A. Frontend identity matching
    assert.equal(
      seq.matchesAttendanceUser(hung2, { username: 'hung1', fullname: 'Nguyễn Văn Hùng' }),
      false,
      'hung1 (Hùng) must NOT match hung2 (Hưng)'
    );
    assert.equal(
      seq.matchesAttendanceUser(hung2, { username: '', fullname: 'Nguyễn Văn Hùng' }),
      false,
      'Legacy username-less row for Nguyễn Văn Hùng must NOT diacritic-fold match Nguyễn Văn Hưng!'
    );
    assert.equal(
      seq.matchesAttendanceUser(tuan2, { username: 'tuan1', fullname: 'Nguyễn Minh Tuấn' }),
      false,
      'Distinct usernames tuan1 vs tuan2 sharing identical fullname Nguyễn Minh Tuấn must NEVER match!'
    );
    assert.equal(
      helpers.matchesUser({ username: 'tuan1', fullname: 'Nguyễn Minh Tuấn' }, tuan2),
      false,
      'helpers.matchesUser must return false when both usernames exist and differ (tuan1 !== tuan2)'
    );

    // 4B. GAS handleCheckInOut cooldown: tuan1 punches at 09:00, tuan2 (same fullname, different username) punches at 09:01 -> MUST SUCCEED!
    const gas = createGasSandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['tuan1', 'hash1', 'Nguyễn Minh Tuấn', '', 't1@kg.vn', 'user', 'Phục vụ', '', 'active'],
          ['tuan2', 'hash2', 'Nguyễn Minh Tuấn', '', 't2@kg.vn', 'user', 'Bếp', '', 'active'],
        ],
        '⚙️ CẤU HÌNH': [
          ['Key', 'Value'],
          ['GPS_CONFIG', JSON.stringify({ lat: 10.976083, lng: 106.664654, radius: 25 })],
        ],
        '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
      },
      '2026-11-10T09:00:00+07:00'
    );

    const resTuan1 = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinId: 'CHK_TUAN1_0900',
      username: 'tuan1',
      fullname: 'Nguyễn Minh Tuấn',
      type: 'Vào ca',
      shift: 'Ca Sáng',
      lat: 10.976083,
      lng: 106.664654,
    });
    assert.equal(resTuan1.ok, true);

    gas.setNow('2026-11-10T09:01:00+07:00');
    const resTuan2 = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      checkinId: 'CHK_TUAN2_0901',
      username: 'tuan2',
      fullname: 'Nguyễn Minh Tuấn',
      type: 'Vào ca',
      shift: 'Ca Sáng',
      lat: 10.976083,
      lng: 106.664654,
    });
    assert.equal(
      resTuan2.ok,
      true,
      `tuan2 (Nguyễn Minh Tuấn) must NOT be blocked by tuan1's 15m cooldown on GAS! Got: ${JSON.stringify(resTuan2)}`
    );

    // 4C. Edge D1 GET_DATA overlay: tuan1's D1 punch must NOT leak into tuan2's personal GET_DATA logs!
    const mockDb = createEdgeD1Mock();
    mockDb.checkinLogs.set('CHK_TUAN1_0900', {
      id: 'CHK_TUAN1_0900',
      username: 'tuan1',
      fullname: 'Nguyễn Minh Tuấn',
      check_type: 'Vào ca',
      shift_name: 'Ca Sáng',
      time_str: '10/11/2026 09:00:00',
      status: 'Đúng giờ',
      distance: 5,
      lat: 10.976083,
      lng: 106.664654,
      note: '',
      image_url: '',
      sheet_synced: 0,
      created_at: Date.now(),
    });
    mockDb.checkinLogs.set('CHK_HUNG1_0900', {
      id: 'CHK_HUNG1_0900',
      username: 'hung1',
      fullname: 'Nguyễn Văn Hùng',
      check_type: 'Vào ca',
      shift_name: 'Ca Sáng',
      time_str: '10/11/2026 09:00:00',
      status: 'Đúng giờ',
      distance: 5,
      lat: 10.976083,
      lng: 106.664654,
      note: '',
      image_url: '',
      sheet_synced: 0,
      created_at: Date.now(),
    });

    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            logs: [],
            schedules: [],
            users: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    try {
      const getTuan2Data = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'GET_DATA',
            username: 'tuan2',
            fullname: 'Nguyễn Minh Tuấn',
            role: 'user',
          }),
        }),
        env: { DB: mockDb, GAS_URL: 'https://script.google.com/macros/s/MOCK_GAS/exec' },
        waitUntil: () => {},
      });
      const tuan2Json = await getTuan2Data.json();
      assert.equal(
        tuan2Json.data.logs.length,
        0,
        `tuan1's D1 check-in must NOT leak into tuan2's GET_DATA! Got: ${JSON.stringify(tuan2Json.data.logs)}`
      );

      const getHung2Data = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'GET_DATA',
            username: 'hung2',
            fullname: 'Nguyễn Văn Hưng',
            role: 'user',
          }),
        }),
        env: { DB: mockDb, GAS_URL: 'https://script.google.com/macros/s/MOCK_GAS/exec' },
        waitUntil: () => {},
      });
      const hung2Json = await getHung2Data.json();
      assert.equal(
        hung2Json.data.logs.length,
        0,
        `hung1 (Hùng) D1 check-in must NOT leak into hung2 (Hưng) GET_DATA! Got: ${JSON.stringify(hung2Json.data.logs)}`
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('RC-3: Face ID v2 Touchless Safety Gates reject bystanders/multi-face/1-frame hair-triggers while preserving multi-employee sequential scanning in Personal & Kiosk modes', async () => {
    const bio = await vite.ssrLoadModule('/src/services/faceRecognitionV2.ts');
    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');

    // 1. Exported touchless auto-punch safety thresholds & gate evaluator
    assert.equal(typeof bio.evaluateAutoPunchFrameReadiness, 'function', 'Must export evaluateAutoPunchFrameReadiness');
    assert.ok(bio.FACE_AUTO_PUNCH_MIN_SCORE >= 0.42, 'Touchless auto-punch min score must be raised >= 0.42');
    assert.ok(bio.FACE_AUTO_PUNCH_MIN_MARGIN >= 0.08, 'Touchless auto-punch min margin must be raised >= 0.08');
    assert.equal(bio.FACE_AUTO_PUNCH_REQUIRED_STREAK, 3, 'Touchless auto-punch must require 3 consecutive stable frames');

    const baseGoodFrame = {
      hasFace: true,
      multipleFaces: false,
      faceCount: 1,
      bbox: { x: 200, y: 110, width: 200, height: 240 },
      frameWidth: 640,
      frameHeight: 480,
      quality: {
        brightness: 120,
        sharpness: 2.5,
        faceWidthRatio: 0.24,
        noseProtrusionZ: 0.012,
        yawDeg: -4,
        pitchDeg: -12,
        rollDeg: 1,
      },
      liveness: { liveScore: 0.92, printSpoofScore: 0.03, replaySpoofScore: 0.05, isLive: true },
    };

    // Valid single close frontal employee -> READY
    const okGate = bio.evaluateAutoPunchFrameReadiness(baseGoodFrame);
    assert.equal(okGate.ready, true, `Expected close centered single frontal face to be ready, got: ${JSON.stringify(okGate)}`);

    // Two employees standing in frame simultaneously -> BLOCKED (must take separated turns)
    const multiFaceGate = bio.evaluateAutoPunchFrameReadiness({
      ...baseGoodFrame,
      multipleFaces: true,
      faceCount: 2,
    });
    assert.equal(multiFaceGate.ready, false);
    assert.equal(multiFaceGate.reason, 'MULTIPLE_FACES');

    // Distant passerby walking behind (small bbox ratio 0.12) -> BLOCKED
    const distantGate = bio.evaluateAutoPunchFrameReadiness({
      ...baseGoodFrame,
      quality: { ...baseGoodFrame.quality, faceWidthRatio: 0.12 },
    });
    assert.equal(distantGate.ready, false);
    assert.equal(distantGate.reason, 'TOO_FAR');

    // Off-center passerby near edge of camera frame -> BLOCKED
    const edgePasserbyGate = bio.evaluateAutoPunchFrameReadiness({
      ...baseGoodFrame,
      bbox: { x: 10, y: 110, width: 140, height: 180 }, // centerX = 80 / 640 = 0.125 < 0.22
    });
    assert.equal(edgePasserbyGate.ready, false);
    assert.equal(edgePasserbyGate.reason, 'OFF_CENTER');

    // Sideways head turn (walking past at 30° yaw) -> BLOCKED
    const sidewaysGate = bio.evaluateAutoPunchFrameReadiness({
      ...baseGoodFrame,
      quality: { ...baseGoodFrame.quality, yawDeg: 30 },
    });
    assert.equal(sidewaysGate.ready, false);
    assert.equal(sidewaysGate.reason, 'NOT_FRONTAL');

    // 2. FastFaceScannerV2 must NOT fire on 1-frame isInstantHighConfidence and MUST keep multi-employee support in both Personal & Kiosk modes
    assert.equal(
      scannerSrc.includes('isInstantHighConfidence'),
      false,
      'FastFaceScannerV2.tsx must remove 1-frame isInstantHighConfidence hair-trigger auto-punch'
    );
    assert.ok(
      scannerSrc.includes('evaluateAutoPunchFrameReadiness'),
      'FastFaceScannerV2.tsx must enforce evaluateAutoPunchFrameReadiness before voting/auto-punching'
    );
    // Must NOT restrict Personal mode (!isKioskMode) to currentUser-only!
    assert.equal(
      scannerSrc.includes('!isKioskMode && match.profile.username !== currentUser'),
      false,
      'Personal mode Face ID v2 must preserve multi-employee sequential scanning for coworkers sharing a phone'
    );
  });

  test('RC-5 & RC-6: Network timeout (callApi -> null) queues offline idempotently instead of false server rejection, and getCheckInCooldown parses UTC+7 strictly', async () => {
    const checkinSrc = fs.readFileSync(path.resolve('src/pages/CheckIn.tsx'), 'utf8');
    const scannerSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');
    const helpers = await vite.ssrLoadModule('/src/utils/helpers.ts');
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');

    // RC-5: CheckIn.tsx & FastFaceScannerV2.tsx must treat res === null as networkErrorOccurred (offline queue), NOT server business rejection
    assert.ok(
      checkinSrc.includes('if (!res)') || checkinSrc.includes('res === null'),
      'CheckIn.tsx must treat callApi null response (timeout/network drop) as networkErrorOccurred so it queues idempotently instead of showing false server rejection'
    );
    assert.ok(
      scannerSrc.includes('if (!res)') || scannerSrc.includes('res === null'),
      'FastFaceScannerV2.tsx must treat callApi null response (timeout/network drop) as networkErrorOccurred / QUEUED_OFFLINE'
    );

    // RC-6: getCheckInCooldown must compute elapsed from fixed Vietnam UTC+7 timestamp, matching parseVietnamLogTimestampMs
    const RealDate = Date;
    const origNow = Date.now;
    const fixedVnPunchStr = '10/11/2026 09:00:00';
    const vnPunchEpochMs = seq.parseVietnamLogTimestampMs(fixedVnPunchStr);
    assert.equal(vnPunchEpochMs, RealDate.parse('2026-11-10T09:00:00+07:00'));

    // 10 minutes after 09:00:00 UTC+7 -> remainingSeconds must be exactly 300s (5 minutes) regardless of host OS timezone
    Date.now = () => vnPunchEpochMs + 10 * 60 * 1000;
    try {
      const cd = helpers.getCheckInCooldown(
        [{ username: 'nv_tz', fullname: 'Trần Múi Giờ', type: 'Vào ca', time: fixedVnPunchStr }],
        { username: 'nv_tz', fullname: 'Trần Múi Giờ' }
      );
      assert.equal(cd.isBlocked, true);
      assert.equal(cd.remainingSeconds, 300);
    } finally {
      Date.now = origNow;
    }
  });
});
