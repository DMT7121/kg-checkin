import test, { after, before, beforeEach, describe } from 'node:test';
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
  initialNowIso = '2026-11-05T14:55:00+07:00'
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
// Stateful In-Memory Cloudflare D1 Mock for CHECK_IN_OUT + Schedules + Queue
// ---------------------------------------------------------------------------
function createStatefulEdgeD1Mock() {
  const schedules = new Map<string, any>();
  const checkinLogs = new Map<string, any>();
  const syncQueue: Array<{
    id: number;
    dedupe_key: string;
    action: string;
    payload_json: string;
    attempts: number;
    last_error: string;
    status: string;
    created_at: number;
    updated_at: number;
  }> = [];
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
          if (normSql.includes('INSERT INTO edge_schedules') || normSql.includes('INSERT OR REPLACE INTO edge_schedules')) {
            schedules.set(String(args[0]), {
              id: args[0],
              username: String(args[1] || '').toLowerCase(),
              fullname: args[2],
              month_sheet: args[3],
              week_label: args[4],
              shifts_json: args[5],
              off_reason: args[6] || '',
              status: args[7] || 'Chờ duyệt',
              sheet_synced: normSql.includes('sheet_synced') && typeof args[8] === 'number' && args.length > 9 ? args[8] : 0,
              updated_at: args[args.length - 1],
            });
          } else if (normSql.includes('UPDATE edge_schedules SET sheet_synced = 1')) {
            const rec = schedules.get(String(args[1]));
            if (rec) {
              rec.sheet_synced = 1;
              rec.updated_at = args[0];
            }
          } else if (normSql.includes('INSERT OR REPLACE INTO edge_checkin_logs')) {
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
          } else if (normSql.includes('UPDATE edge_checkin_logs SET sheet_synced = 1')) {
            const rec = checkinLogs.get(String(args[0]));
            if (rec) rec.sheet_synced = 1;
          } else if (normSql.includes('INSERT INTO edge_sync_queue')) {
            const dedupeKey = String(args[0]);
            const action = normSql.includes("'REGISTER_SHIFT'")
              ? 'REGISTER_SHIFT'
              : normSql.includes("'CHECK_IN_OUT'")
                ? 'CHECK_IN_OUT'
                : String(args[1]);
            const payloadJson =
              normSql.includes("'REGISTER_SHIFT'") || normSql.includes("'CHECK_IN_OUT'")
                ? String(args[1])
                : String(args[2]);
            const nowVal = Number(args[args.length - 1]) || Date.now();
            const existing = syncQueue.find((q) => q.dedupe_key === dedupeKey);
            if (existing) {
              existing.payload_json = payloadJson;
              existing.status = 'pending';
              existing.updated_at = nowVal;
            } else {
              syncQueue.push({
                id: autoId++,
                dedupe_key: dedupeKey,
                action,
                payload_json: payloadJson,
                attempts: 0,
                last_error: '',
                status: 'pending',
                created_at: nowVal,
                updated_at: nowVal,
              });
            }
          } else if (normSql.includes('DELETE FROM edge_sync_queue WHERE id =')) {
            const idx = syncQueue.findIndex((q) => q.id === Number(args[0]));
            if (idx >= 0) syncQueue.splice(idx, 1);
          } else if (normSql.includes('DELETE FROM edge_sync_queue WHERE dedupe_key =')) {
            const idx = syncQueue.findIndex((q) => q.dedupe_key === String(args[0]));
            if (idx >= 0) syncQueue.splice(idx, 1);
          } else if (normSql.includes('UPDATE edge_sync_queue SET attempts = attempts + 1')) {
            const q = syncQueue.find((item) => item.id === Number(args[2]));
            if (q) {
              q.attempts += 1;
              q.last_error = String(args[0] || '');
              q.updated_at = Number(args[1]) || Date.now();
            }
          }
          return { success: true };
        },
        first: async () => {
          if (normSql.includes('FROM edge_schedules')) {
            const rows = Array.from(schedules.values());
            if (normSql.includes('WHERE id =')) {
              return schedules.get(String(args[0])) || null;
            }
            const targetUser = String(args[0] || '').toLowerCase();
            return (
              rows.find(
                (r) =>
                  r.username === targetUser &&
                  (!args[1] || r.month_sheet === args[1]) &&
                  (!args[2] || r.week_label === args[2])
              ) ||
              rows.find((r) => r.username === targetUser && r.sheet_synced === 0) ||
              null
            );
          }
          return null;
        },
        all: async () => {
          if (normSql.includes('FROM edge_schedules')) {
            const rows = Array.from(schedules.values());
            if (normSql.includes('WHERE username =')) {
              const u = String(args[0] || '').toLowerCase();
              return { results: rows.filter((r) => r.username === u) };
            }
            return { results: rows };
          }
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
          if (normSql.includes('FROM edge_sync_queue')) {
            return {
              results: syncQueue
                .filter((q) => q.status === 'pending' && q.attempts < 30)
                .sort((a, b) => a.updated_at - b.updated_at)
                .slice(0, 5),
            };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
  };

  return db;
}

describe('Suite A — Zero-Loss Check-In V1 Ledger, D1 Schedule Self-Heal & Offline Queue Hardening', () => {
  test('A.1 Edge CHECK_IN_OUT self-heals unsynced D1 schedule to GAS on SCHEDULE_REQUIRED so V1 never drops punch', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();

    const gas = createGasSandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['nv1', 'hash_nv1', 'Nguyễn Văn Một', '', 'nv1@kg.vn', 'user', 'Phục vụ', '', 'active'],
          ['nv_unreg', 'hash_2', 'Lê Chưa Đăng Ký', '', 'nv2@kg.vn', 'user', 'Phục vụ', '', 'active'],
        ],
        '⚙️ CẤU HÌNH': [
          ['Key', 'Value'],
          ['GPS_CONFIG', JSON.stringify({ lat: 10.976083, lng: 106.664654, radius: 25 })],
        ],
        '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
      },
      '2026-11-05T14:55:00+07:00' // Thursday inside mandatory T5 -> 17h T7 window
    );

    const mockDb = createStatefulEdgeD1Mock();
    // Simulate nv1 registered schedule on D1 earlier when GAS timed out (sheet_synced = 0, NOT in Sheet yet!)
    mockDb.schedules.set('nv1|Tháng 11/2026|📅 TUẦN 09/11 - 15/11', {
      id: 'nv1|Tháng 11/2026|📅 TUẦN 09/11 - 15/11',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      month_sheet: 'Tháng 11/2026',
      week_label: '📅 TUẦN 09/11 - 15/11',
      shifts_json: JSON.stringify(['15:00', '15:00', 'OFF', '15:00', '17:00', '17:00', '17:00']),
      off_reason: 'Đi học T4',
      status: 'Chờ duyệt',
      sheet_synced: 0,
      updated_at: Date.parse('2026-11-05T14:30:00+07:00'),
    });

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init?: any) => {
      const body = JSON.parse(String(init?.body || '{}'));
      const gasRes = gas.callDoPost(body);
      return new Response(JSON.stringify(gasRes), { status: 200 });
    }) as any;

    try {
      const waitTasks: Promise<any>[] = [];
      // 1. nv1 punches V1 CHECK_IN_OUT -> Edge must heal schedule to Sheet & succeed on Sheet!
      const req1 = new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        body: JSON.stringify({
          action: 'CHECK_IN_OUT',
          checkinId: 'CHK_V1_HEAL_01',
          username: 'nv1',
          fullname: 'Nguyễn Văn Một',
          type: 'Vào ca',
          lat: 10.976083,
          lng: 106.664654,
          gpsAccuracy: 8,
          distance: 3,
          time: '05/11/2026 14:55:00',
          actualTime: '05/11/2026 14:55:00',
          clientNowMs: Date.parse('2026-11-05T14:55:00+07:00'),
          photoCapturedMs: Date.parse('2026-11-05T14:54:50+07:00'),
        }),
      });
      const res1 = await edgeMod.onRequest({
        request: req1,
        env: { DB: mockDb },
        waitUntil: (p: Promise<any>) => waitTasks.push(p),
      });
      await Promise.all(waitTasks);
      const json1 = await res1.json();

      assert.equal(json1.ok, true, `Expected V1 CHECK_IN_OUT to self-heal schedule and succeed, got: ${JSON.stringify(json1)}`);
      assert.equal(json1.data?.sheetSaved, true);
      assert.equal(gas.sheetsData['✔️CHẤM CÔNG'].length, 2, 'Punch MUST be written to Google Sheet ✔️CHẤM CÔNG');
      assert.equal(
        mockDb.schedules.get('nv1|Tháng 11/2026|📅 TUẦN 09/11 - 15/11')?.sheet_synced,
        1,
        'D1 schedule row must be marked sheet_synced = 1 after self-heal'
      );

      // 2. Genuinely unregistered nv_unreg MUST still be blocked with SCHEDULE_REQUIRED
      const reqUnreg = new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        body: JSON.stringify({
          action: 'CHECK_IN_OUT',
          checkinId: 'CHK_UNREG_01',
          username: 'nv_unreg',
          fullname: 'Lê Chưa Đăng Ký',
          type: 'Vào ca',
          lat: 10.976083,
          lng: 106.664654,
          gpsAccuracy: 8,
          distance: 4,
          time: '05/11/2026 14:55:10',
          clientNowMs: Date.parse('2026-11-05T14:55:10+07:00'),
          photoCapturedMs: Date.parse('2026-11-05T14:55:05+07:00'),
        }),
      });
      const resUnreg = await edgeMod.onRequest({
        request: reqUnreg,
        env: { DB: mockDb },
        waitUntil: () => {},
      });
      const jsonUnreg = await resUnreg.json();
      assert.equal(jsonUnreg.ok, false);
      assert.equal(jsonUnreg.code || jsonUnreg.data?.code, 'SCHEDULE_REQUIRED');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('A.2 Edge CHECK_IN_OUT buffers punch in D1 Write-Ahead Ledger + edge_sync_queue on GAS timeout/LOCK_TIMEOUT and drains to Sheet when GAS recovers', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    edgeMod.resetEdgeMemoryStateForTests();

    const gas = createGasSandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['nv_peak', 'hash_p', 'Trần Giờ Cao Điểm', '', 'peak@kg.vn', 'user', 'Phục vụ', '', 'active'],
        ],
        '⚙️ CẤU HÌNH': [
          ['Key', 'Value'],
          ['GPS_CONFIG', JSON.stringify({ lat: 10.976083, lng: 106.664654, radius: 25 })],
        ],
        '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
      },
      '2026-11-04T15:00:00+07:00' // Wednesday peak shift-start
    );

    const mockDb = createStatefulEdgeD1Mock();
    let gasDown = true;

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init?: any) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (gasDown && body.action === 'CHECK_IN_OUT') {
        return new Response(
          JSON.stringify({
            ok: false,
            code: 'LOCK_TIMEOUT',
            message: 'Máy chủ đang xử lý nhiều lượt chấm công cùng lúc.',
          }),
          { status: 200 }
        );
      }
      const gasRes = gas.callDoPost(body);
      return new Response(JSON.stringify(gasRes), { status: 200 });
    }) as any;

    try {
      // 1. Peak-hour punch hits GAS LOCK_TIMEOUT -> Edge buffers into D1 + edge_sync_queue!
      const reqPunch = new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        body: JSON.stringify({
          action: 'CHECK_IN_OUT',
          checkinId: 'CHK_PEAK_001',
          username: 'nv_peak',
          fullname: 'Trần Giờ Cao Điểm',
          type: 'Vào ca',
          shift: '15:00',
          lat: 10.976083,
          lng: 106.664654,
          gpsAccuracy: 6,
          distance: 5,
          location: "Nhà hàng King's Grill",
          time: '04/11/2026 15:00:05',
          actualTime: '04/11/2026 15:00:05',
          clientNowMs: Date.parse('2026-11-04T15:00:05+07:00'),
          photoCapturedMs: Date.parse('2026-11-04T15:00:00+07:00'),
        }),
      });
      const resBuffered = await edgeMod.onRequest({
        request: reqPunch,
        env: { DB: mockDb },
        waitUntil: () => {},
      });
      const jsonBuffered = await resBuffered.json();

      assert.equal(jsonBuffered.ok, true, `Expected Edge D1 write-ahead buffer to save punch, got: ${JSON.stringify(jsonBuffered)}`);
      assert.equal(jsonBuffered.data?.sheetSaved, false, 'Must honestly report sheetSaved=false while queued');
      assert.equal(jsonBuffered.data?.edgeBuffered, true, 'Must report edgeBuffered=true');
      assert.equal(mockDb.checkinLogs.get('CHK_PEAK_001')?.sheet_synced, 0);
      assert.equal(mockDb.syncQueue.length, 1);
      assert.equal(mockDb.syncQueue[0].action, 'CHECK_IN_OUT');

      // 2. Employee closes phone immediately; GAS recovers 10s later and any incoming request triggers drainEdgeSyncQueue!
      gasDown = false;
      const drainTasks: Promise<any>[] = [];
      const reqStatus = new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        body: JSON.stringify({
          action: 'GET_KIOSK_ATTENDANCE_STATE',
          username: 'nv_peak',
          isKiosk: false,
        }),
      });
      await edgeMod.onRequest({
        request: reqStatus,
        env: { DB: mockDb },
        waitUntil: (p: Promise<any>) => drainTasks.push(p),
      });
      await Promise.all(drainTasks);

      assert.equal(mockDb.syncQueue.length, 0, 'edge_sync_queue must drain pending CHECK_IN_OUT to Google Sheets');
      assert.equal(mockDb.checkinLogs.get('CHK_PEAK_001')?.sheet_synced, 1, 'D1 log must flip to sheet_synced=1');
      assert.equal(gas.sheetsData['✔️CHẤM CÔNG'].length, 2, 'Google Sheet ✔️CHẤM CÔNG must contain the drained punch');
      assert.equal(String(gas.sheetsData['✔️CHẤM CÔNG'][1][2]).replace(/^'/, ''), '04/11/2026 15:00:05');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('A.3 OfflineQueue vault avoids 12s premature duplicate race, marks failed on permanent rejection, and rolls back local state globally', async () => {
    const offlineMod = await vite.ssrLoadModule('/src/utils/offlineQueue.ts');
    const helpersMod = await vite.ssrLoadModule('/src/utils/helpers.ts');
    const storeMod = await vite.ssrLoadModule('/src/store/useAppStore.ts');

    const user = { username: 'nv_rollback', fullname: 'Phạm Rollback', email: 'rb@kg.vn' };
    storeMod.useAppStore.getState().setCurrentUser(user);

    // 1. Save a pending punch 18s ago (< 45s in-flight threshold) -> recoverOrphanedVaultPunches MUST NOT prematurely duplicate!
    const now = Date.now();
    localStore.setItem(
      'kg_punch_vault_v1',
      JSON.stringify([
        {
          checkinId: 'CHK_INFLIGHT_18S',
          username: 'nv_rollback',
          fullname: 'Phạm Rollback',
          type: 'Vào ca',
          time: '05/11/2026 15:00:00',
          syncStatus: 'pending',
          vaultSavedAt: now - 18_000,
        },
      ])
    );
    offlineMod.recoverOrphanedVaultPunches();
    assert.equal(
      offlineMod.getQueueLength(),
      0,
      'Must NOT prematurely enqueue a 18s-old punch while primary 30s request is still in-flight'
    );

    // 2. Poison local state (simulating offline queued punch) then test global rollback on permanent rejection
    storeMod.useAppStore.getState().prependLog({
      username: 'nv_rollback',
      fullname: 'Phạm Rollback',
      type: 'Vào ca',
      time: '05/11/2026 15:00:00',
      status: 'Chờ mạng • Lưu tạm trên máy',
      checkinId: 'CHK_REJECT_01',
    } as any);
    helpersMod.setLocalLastPunch(user, 'Vào ca', '05/11/2026 15:00:00');
    offlineMod.savePunchToVault({
      checkinId: 'CHK_REJECT_01',
      username: 'nv_rollback',
      fullname: 'Phạm Rollback',
      type: 'Vào ca',
      time: '05/11/2026 15:00:00',
    });

    assert.equal(storeMod.useAppStore.getState().logs.length, 1);
    assert.ok(helpersMod.getLocalLastPunch(user) !== null);

    // Rollback globally (even when CheckIn.tsx is NOT mounted!)
    offlineMod.rollbackRejectedPunchGlobally({
      checkinId: 'CHK_REJECT_01',
      username: 'nv_rollback',
      fullname: 'Phạm Rollback',
      time: '05/11/2026 15:00:00',
      reason: 'Ngoài bán kính 25m',
    });

    assert.equal(storeMod.useAppStore.getState().logs.length, 0, 'Rejected punch must be purged from store.logs');
    assert.equal(helpersMod.getLocalLastPunch(user), null, 'Rejected punch must be purged from kg_last_punch_record');
    assert.equal(
      helpersMod.getCheckInCooldown([], user).isBlocked,
      false,
      'Rejected punch must NOT leave employee locked under 15m spam cooldown'
    );

    const vaultAfter = JSON.parse(localStore.getItem('kg_punch_vault_v1') || '[]');
    const rejectedVaultItem = vaultAfter.find((v: any) => v.checkinId === 'CHK_REJECT_01');
    assert.equal(rejectedVaultItem?.syncStatus, 'failed', 'Vault item must be marked failed so it never resurrects');
  });
});

describe('Suite B — Context-Aware 4-Signal Smart Attendance Engine (Vào ca & Ra ca)', () => {
  test('B.1 Trap 1: Detects forgotten Vào ca when punching at end of shift (>=3h late or 21:00-04:00) and suggests Ra ca + Supplement Vào ca', async () => {
    localStore.clear();
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');
    const user = { username: 'nv_quen_vao', fullname: 'Nguyễn Quên Vào' };

    // 1. Normal check-in at 14:52 for 15:00 shift -> HIGH confidence Vào ca (1-tap fast flow)
    const normalArrival = seq.resolveSmartAttendanceIntent({
      user,
      logs: [],
      todayShift: '15:00',
      now: new Date('2026-11-05T14:52:00+07:00'),
    });
    assert.equal(normalArrival.confidence, 'HIGH');
    assert.equal(normalArrival.requiresDisambiguation, false);
    assert.equal(normalArrival.smartSuggestedAction, 'Vào ca');
    assert.equal(normalArrival.ambiguityReason, 'NONE');

    // 2. Opening app at 22:30 with ZERO punches today and 15:00 shift -> AMBIGUOUS (LATE_SHIFT_MISSING_IN)!
    const endOfShiftNoIn = seq.resolveSmartAttendanceIntent({
      user,
      logs: [],
      todayShift: '15:00',
      now: new Date('2026-11-05T22:30:00+07:00'),
    });
    assert.equal(endOfShiftNoIn.confidence, 'AMBIGUOUS');
    assert.equal(endOfShiftNoIn.requiresDisambiguation, true);
    assert.equal(endOfShiftNoIn.ambiguityReason, 'LATE_SHIFT_MISSING_IN');
    assert.equal(endOfShiftNoIn.smartSuggestedAction, 'Ra ca');
    assert.equal(endOfShiftNoIn.suggestedSupplementTime, '15:00');
    assert.equal(endOfShiftNoIn.suggestedSupplementDate, '05/11/2026');

    // 3. Even if todayShift is unknown/unapproved, opening app at 22:45 (closing window 21:00-04:00) with 0 punches -> AMBIGUOUS!
    const closingHourNoShift = seq.resolveSmartAttendanceIntent({
      user,
      logs: [],
      todayShift: null,
      now: new Date('2026-11-05T22:45:00+07:00'),
    });
    assert.equal(closingHourNoShift.requiresDisambiguation, true);
    assert.equal(closingHourNoShift.ambiguityReason, 'LATE_SHIFT_MISSING_IN');
    assert.equal(closingHourNoShift.smartSuggestedAction, 'Ra ca');
  });

  test('B.2 Trap 2: Computes exact elapsed work duration for normal Ra ca and flags stale open shifts (>=9.5h)', async () => {
    localStore.clear();
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');
    const user = { username: 'nv_ca_dai', fullname: 'Lê Ca Dài' };

    // 1. Normal checkout after 7h 20m (15:00 -> 22:20) -> HIGH confidence Ra ca with formatted duration
    const normalOut = seq.resolveSmartAttendanceIntent({
      user,
      logs: [{ username: 'nv_ca_dai', fullname: 'Lê Ca Dài', type: 'Vào ca', time: '05/11/2026 15:00:00' }],
      todayShift: '15:00',
      now: new Date('2026-11-05T22:20:00+07:00'),
    });
    assert.equal(normalOut.confidence, 'HIGH');
    assert.equal(normalOut.requiresDisambiguation, false);
    assert.equal(normalOut.smartSuggestedAction, 'Ra ca');
    assert.equal(normalOut.openShiftStartTime, '15:00');
    assert.equal(normalOut.openShiftDurationMinutes, 440);
    assert.equal(normalOut.openShiftDurationFormatted, '7 giờ 20 phút');

    // 2. Punched Vào ca at 08:30, forgot noon Ra ca, opens app at 18:30 (10h = 600m elapsed) -> STALE_OPEN_SHIFT!
    const staleOpen = seq.resolveSmartAttendanceIntent({
      user,
      logs: [{ username: 'nv_ca_dai', fullname: 'Lê Ca Dài', type: 'Vào ca', time: '05/11/2026 08:30:00' }],
      todayShift: '18:00',
      now: new Date('2026-11-05T18:30:00+07:00'),
    });
    assert.equal(staleOpen.confidence, 'AMBIGUOUS');
    assert.equal(staleOpen.requiresDisambiguation, true);
    assert.equal(staleOpen.ambiguityReason, 'STALE_OPEN_SHIFT');
    assert.equal(staleOpen.openShiftStartTime, '08:30');
    assert.equal(staleOpen.openShiftDurationMinutes, 600);
  });

  test('B.3 Trap 3: Detects unclosed yesterday overnight Vào ca during 06:00-08:30 AM grace window without breaking normal morning Vào ca', async () => {
    localStore.clear();
    const seq = await vite.ssrLoadModule('/src/utils/attendanceSequence.ts');
    const user = { username: 'nv_dem', fullname: 'Hoàng Ca Đêm' };

    // 1. Unclosed Vào ca yesterday at 21:30, opening app at 06:15 AM (todayShift = 15:00) -> OVERNIGHT_UNCLOSED_PAST_06!
    const unclosedPast06 = seq.resolveSmartAttendanceIntent({
      user,
      logs: [{ username: 'nv_dem', fullname: 'Hoàng Ca Đêm', type: 'Vào ca', time: '04/11/2026 21:30:00' }],
      todayShift: '15:00',
      now: new Date('2026-11-05T06:15:00+07:00'),
    });
    assert.equal(unclosedPast06.confidence, 'AMBIGUOUS');
    assert.equal(unclosedPast06.requiresDisambiguation, true);
    assert.equal(unclosedPast06.ambiguityReason, 'OVERNIGHT_UNCLOSED_PAST_06');
    assert.equal(unclosedPast06.smartSuggestedAction, 'Ra ca');
    assert.equal(unclosedPast06.unclosedYesterdayDateStr, '04/11/2026');
    assert.equal(unclosedPast06.openShiftStartTime, '21:30');

    // 2. Closed overnight shift (21:30 Vào ca + 01:30 Ra ca) -> at 06:15 AM resolves cleanly to HIGH confidence Vào ca!
    const closedPast06 = seq.resolveSmartAttendanceIntent({
      user,
      logs: [
        { username: 'nv_dem', fullname: 'Hoàng Ca Đêm', type: 'Vào ca', time: '04/11/2026 21:30:00' },
        { username: 'nv_dem', fullname: 'Hoàng Ca Đêm', type: 'Ra ca', time: '05/11/2026 01:30:00' },
      ],
      todayShift: '15:00',
      now: new Date('2026-11-05T06:15:00+07:00'),
    });
    assert.equal(closedPast06.confidence, 'HIGH');
    assert.equal(closedPast06.requiresDisambiguation, false);
    assert.equal(closedPast06.smartSuggestedAction, 'Vào ca');
  });
});

describe('Suite C — V1 Verified Commit & Smart Disambiguation UI Contracts', () => {
  test('C.1 CheckIn.tsx enforces verified server/edge commit before store/cooldown mutation, disables inline email blocking, and renders Smart Disambiguation Gate', () => {
    const checkinSrc = fs.readFileSync(path.resolve('src/pages/CheckIn.tsx'), 'utf8');
    const fastFaceSrc = fs.readFileSync(path.resolve('src/components/FastFaceScannerV2.tsx'), 'utf8');

    // 1. Must NOT block primary CHECK_IN_OUT on inline GAS email sending
    assert.equal(
      checkinSrc.includes('sendEmailInline: true'),
      false,
      'CheckIn.tsx must NOT send sendEmailInline: true on critical CHECK_IN_OUT path'
    );

    // 2. In executeCheck, callApi('CHECK_IN_OUT'...) MUST execute BEFORE setLocalLastPunch
    const execIdx = checkinSrc.indexOf('const executeCheck =');
    assert.ok(execIdx > 0, 'executeCheck must exist in CheckIn.tsx');
    const execBody = checkinSrc.slice(execIdx, execIdx + 12000);
    const callApiIdx = execBody.indexOf("callApi('CHECK_IN_OUT'");
    const setLocalPunchIdx = execBody.indexOf('setLocalLastPunch(');
    assert.ok(callApiIdx > 0, "executeCheck must call callApi('CHECK_IN_OUT')");
    assert.ok(
      setLocalPunchIdx === -1 || setLocalPunchIdx > callApiIdx,
      'CheckIn.tsx MUST NOT poison setLocalLastPunch before awaiting CHECK_IN_OUT response!'
    );

    // 3. Smart Disambiguation Gate & 1-tap combo button present in V1 & V2
    assert.ok(
      checkinSrc.includes('data-testid="smart-disambiguation-card"'),
      'CheckIn.tsx must render smart-disambiguation-card when intent is AMBIGUOUS'
    );
    assert.ok(
      checkinSrc.includes('data-testid="smart-combo-out-and-supplement-btn"'),
      'CheckIn.tsx must render 1-tap Ra ca + Supplement Vào ca combo button'
    );
    assert.ok(
      fastFaceSrc.includes('resolveSmartAttendanceIntent'),
      'FastFaceScannerV2.tsx must also integrate resolveSmartAttendanceIntent for V1/V2 parity'
    );
  });
});
