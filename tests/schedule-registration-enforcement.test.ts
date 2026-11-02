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
// Helper: In-Memory Google Apps Script Sandbox (Loads Real gas/*.gs Files)
// ---------------------------------------------------------------------------
function createGasSandbox(
  initialSheets: Record<string, any[][]>,
  initialNowIso = '2026-11-05T14:35:00+07:00',
  options?: { disableAdvancedSheetsGet?: boolean }
) {
  let currentNowIso = initialNowIso;
  const sheetsData: Record<string, any[][]> = {};
  for (const [name, rows] of Object.entries(initialSheets)) {
    sheetsData[name] = rows.map((r) => [...r]);
  }

  function formatDisplayCell(val: any): string {
    if (val === null || val === undefined) return '';
    if (val instanceof Date) {
      const utcMs = val.getTime() + 7 * 3600 * 1000;
      const vn = new Date(utcMs);
      const HH = String(vn.getUTCHours()).padStart(2, '0');
      const mm = String(vn.getUTCMinutes()).padStart(2, '0');
      return `${HH}:${mm}`;
    }
    return String(val);
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
      setColumnWidth: () => {},
      getLastRow: () => sheetsData[name].length,
      getLastColumn: () =>
        sheetsData[name].reduce((max, row) => Math.max(max, row.length), 0),
      appendRow: (row: any[]) => {
        sheetsData[name].push([...row]);
      },
      insertRowBefore: (r1: number) => {
        sheetsData[name].splice(Math.max(0, r1 - 1), 0, []);
      },
      insertRowAfter: (r1: number) => {
        sheetsData[name].splice(Math.max(0, r1), 0, []);
      },
      deleteRow: (r1: number) => {
        sheetsData[name].splice(r1 - 1, 1);
      },
      deleteRows: (r1: number, count: number) => {
        sheetsData[name].splice(r1 - 1, count);
      },
      getDataRange: () => ({
        getValues: () =>
          sheetsData[name].length === 0 ? [['']] : sheetsData[name].map((r) => [...r]),
        getDisplayValues: () =>
          sheetsData[name].length === 0
            ? [['']]
            : sheetsData[name].map((r) => r.map((c) => formatDisplayCell(c))),
      }),
      getRange: (row1: number | string, col1?: number, numRows = 1, numCols = 1) => {
        if (typeof row1 === 'string') {
          const dummyRange: any = {
            setFontWeight: () => dummyRange,
            setBackground: () => dummyRange,
            setFontColor: () => dummyRange,
            setFontSize: () => dummyRange,
            setHorizontalAlignment: () => dummyRange,
            merge: () => dummyRange,
          };
          return dummyRange;
        }
        const cStart = col1 ?? 1;
        const rangeObj: any = {
          getValue: () => sheetsData[name]?.[row1 - 1]?.[cStart - 1] ?? '',
          getValues: () => {
            const out: any[][] = [];
            for (let r = 0; r < numRows; r++) {
              const line: any[] = [];
              for (let c = 0; c < numCols; c++) {
                line.push(sheetsData[name]?.[row1 - 1 + r]?.[cStart - 1 + c] ?? '');
              }
              out.push(line);
            }
            return out;
          },
          getDisplayValues: () => {
            const out: string[][] = [];
            for (let r = 0; r < numRows; r++) {
              const line: string[] = [];
              for (let c = 0; c < numCols; c++) {
                line.push(formatDisplayCell(sheetsData[name]?.[row1 - 1 + r]?.[cStart - 1 + c]));
              }
              out.push(line);
            }
            return out;
          },
          setValue: (val: any) => {
            ensureCell(row1, cStart);
            sheetsData[name][row1 - 1][cStart - 1] = val;
            return rangeObj;
          },
          setValues: (vals: any[][]) => {
            for (let r = 0; r < vals.length; r++) {
              for (let c = 0; c < vals[r].length; c++) {
                ensureCell(row1 + r, cStart + c);
                sheetsData[name][row1 - 1 + r][cStart - 1 + c] = vals[r][c];
              }
            }
            return rangeObj;
          },
          clearContent: () => {
            for (let r = 0; r < numRows; r++) {
              for (let c = 0; c < numCols; c++) {
                if (sheetsData[name]?.[row1 - 1 + r]) {
                  sheetsData[name][row1 - 1 + r][cStart - 1 + c] = '';
                }
              }
            }
            return rangeObj;
          },
          merge: () => rangeObj,
          setBackground: () => rangeObj,
          setBackgrounds: () => rangeObj,
          setFontColor: () => rangeObj,
          setFontWeight: () => rangeObj,
          setFontWeights: () => rangeObj,
          setFontStyle: () => rangeObj,
          setFontSize: () => rangeObj,
          setHorizontalAlignment: () => rangeObj,
          setHorizontalAlignments: () => rangeObj,
          setNumberFormat: () => rangeObj,
          setNumberFormats: () => rangeObj,
          setBorder: () => rangeObj,
          setNote: () => rangeObj,
          clearNote: () => rangeObj,
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
        super(currentNowIso);
      } else {
        // @ts-expect-error spread into Date
        super(...args);
      }
    }
    static now() {
      return new Date(currentNowIso).getTime();
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
    // Intentionally simulate a US-Pacific script timezone to prove our handlers honor CONFIG.TIMEZONE ('Asia/Ho_Chi_Minh')!
    Session: { getScriptTimeZone: () => 'America/Los_Angeles' },
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
      computeDigest: (_alg: string, input: string) => {
        return Array.from(Buffer.from(String(input), 'utf8'));
      },
      computeHmacSha256Signature: (value: string, key: string) => {
        return Array.from(Buffer.from(`${value}:${key}`, 'utf8'));
      },
      base64EncodeWebSafe: (bytes: number[] | string) =>
        Buffer.from(Array.isArray(bytes) ? bytes : String(bytes)).toString('base64url'),
      formatDate: (d: Date, tz: string, fmt: string) => {
        const offsetHours = tz === 'America/Los_Angeles' ? -8 : 7;
        const shiftedMs = d.getTime() + offsetHours * 3600 * 1000;
        const vn = new Date(shiftedMs);
        const yyyy = String(vn.getUTCFullYear());
        const MM = String(vn.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(vn.getUTCDate()).padStart(2, '0');
        const HH = String(vn.getUTCHours()).padStart(2, '0');
        const H = String(vn.getUTCHours());
        const mm = String(vn.getUTCMinutes()).padStart(2, '0');
        const m = String(vn.getUTCMinutes());
        const ss = String(vn.getUTCSeconds()).padStart(2, '0');
        // ISO day of week 1..7 (1=Mon..7=Sun) if 'u' requested
        const jsDay = vn.getUTCDay();
        const isoDay = String(jsDay === 0 ? 7 : jsDay);
        if (fmt === 'u') return isoDay;
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
      flush: () => {},
    },
    Sheets: {
      Spreadsheets: {
        Values: {
          batchGet: (_id: string, opts: { ranges: string[] }) => {
            if (options?.disableAdvancedSheetsGet) {
              throw new Error('Sheets v4 disabled');
            }
            return {
              valueRanges: opts.ranges.map((r) => {
                const sheetName = r.split('!')[0].replace(/^'|'$/g, '');
                const rows = sheetsData[sheetName] || [];
                return {
                  values: rows.map((row) => row.map((cell) => formatDisplayCell(cell))),
                };
              }),
            };
          },
          get: (_id: string, range: string) => {
            if (options?.disableAdvancedSheetsGet) {
              throw new Error('Sheets v4 disabled');
            }
            const sheetName = range.split('!')[0].replace(/^'|'$/g, '');
            const rows = sheetsData[sheetName] || [];
            return {
              values: rows.map((row) => row.map((cell) => formatDisplayCell(cell))),
            };
          },
          batchClear: () => {
            throw new Error('Use fallback clearContent in sandbox');
          },
          clear: () => {
            throw new Error('Use fallback deleteRows in sandbox');
          },
          update: () => {
            throw new Error('Use fallback setValues in sandbox');
          },
          append: () => {
            throw new Error('Use fallback appendRow in sandbox');
          },
        },
      },
    },
  };

  vm.createContext(sandbox);
  const gasDir = path.resolve(process.cwd(), 'gas');
  for (const file of [
    'Code.gs',
    'SheetService.gs',
    'JsonCacheService.gs',
    'Handlers.gs',
    'Engine.gs',
    'ChecklistService.gs',
    'OpsChecklistHandlers.gs',
  ]) {
    const code = fs.readFileSync(path.join(gasDir, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }

  return {
    sheetsData,
    setNow(iso: string) {
      currentNowIso = iso;
    },
    callDoPost(payload: Record<string, any>) {
      const out = sandbox.doPost({
        postData: { contents: JSON.stringify(payload) },
      });
      return JSON.parse(out.getContent());
    },
  };
}

// ===========================================================================
// SUITE 1: Frontend Week-Rollover Cache Poisoning, Timezone Window & Smart Memory
// ===========================================================================
describe('Schedule Enforcement — Frontend Week-Scoped Cache, Vietnam Window & Smart Persistence', () => {
  test('Week rollover NEVER poisons new week registration from stale kg_app_cache_v2 or unscoped store flags', async () => {
    const helpersMod = await vite.ssrLoadModule('/src/utils/helpers.ts');
    const storeMod = await vite.ssrLoadModule('/src/store/useAppStore.ts');
    const refreshMod = await vite.ssrLoadModule('/src/utils/refreshData.ts');
    const { useAppStore } = storeMod;

    const week1Info = helpersMod.computeWeekInfo(new Date('2026-10-30T10:00:00+07:00')); // Next week: 02/11 - 08/11
    const week2Info = helpersMod.computeWeekInfo(new Date('2026-11-06T10:00:00+07:00')); // Next week: 09/11 - 15/11
    const week1Key = `${week1Info.monthSheet}|${week1Info.weekLabel}`;
    const week2Key = `${week2Info.monthSheet}|${week2Info.weekLabel}`;
    assert.notEqual(week1Key, week2Key);

    // Simulate User nv1 having registered in Week 1 and cached in kg_app_cache_v2 (legacy snapshot WITHOUT weekKey or WITH week1Key)
    localStore.setItem('kg_user', JSON.stringify({ username: 'nv1', fullname: 'Nguyễn Văn Một', role: 'user' }));
    localStore.setItem('kg_session_time', String(Date.now()));
    localStore.setItem(`kg_registered_week_nv1`, week1Key);
    localStore.setItem(
      'kg_app_cache_v2',
      JSON.stringify({
        version: 2,
        savedAt: Date.now() - 86400000,
        data: {
          isScheduleRegistered: true,
          registeredShifts: ['15:00', '15:00', 'OFF', '15:00', '16:00', '16:00', '16:00'],
          // Notice: legacy cache didn't even save registeredWeekKey!
        },
      })
    );

    useAppStore.setState({
      currentUser: { username: 'nv1', fullname: 'Nguyễn Văn Một', email: '', role: 'user' },
      isScheduleRegistered: false,
      registeredShifts: [],
    });

    // 1) Unscoped or Week-1-scoped store state MUST return false when queried for Week 2!
    assert.equal(
      helpersMod.isNextWeekScheduleRegistered(
        true,
        'nv1',
        week2Info,
        ['15:00', '15:00', 'OFF', '15:00', '16:00', '16:00', '16:00'],
        week1Key
      ),
      false,
      'Week 1 store registration must NOT count as registered for Week 2'
    );

    // 2) Restoring legacy/stale kg_app_cache_v2 (without matching current weekKey) MUST NOT mark store as registered!
    refreshMod.restoreFromCache();
    const currentWeekKey = (() => {
      const nowInfo = helpersMod.computeWeekInfo();
      return `${nowInfo.monthSheet}|${nowInfo.weekLabel}`;
    })();
    if (currentWeekKey !== week1Key) {
      assert.equal(
        useAppStore.getState().isScheduleRegistered,
        false,
        'restoreFromCache must NOT set isScheduleRegistered=true from an unscoped or older week cache'
      );
    }
  });

  test('getScheduleRegistrationWindow enforces exact Thu 00:00 -> Sat 17:00 boundaries in Asia/Ho_Chi_Minh timezone', async () => {
    const helpersMod = await vite.ssrLoadModule('/src/utils/helpers.ts');

    // Wed 23:59 VN -> open, NOT mandatory
    const wedLate = helpersMod.getScheduleRegistrationWindow(new Date('2026-11-04T23:59:00+07:00'));
    assert.equal(wedLate.isOpen, true);
    assert.equal(wedLate.isMandatoryWindow, false);

    // Thu 00:00 VN -> open AND mandatory
    const thuStart = helpersMod.getScheduleRegistrationWindow(new Date('2026-11-05T00:00:00+07:00'));
    assert.equal(thuStart.isOpen, true);
    assert.equal(thuStart.isMandatoryWindow, true);

    // Sat 16:59:59 VN -> still open AND mandatory! (Note: previously 17:00:00 was open because minute === 0; let's check exact 17:00!)
    const satBefore17 = helpersMod.getScheduleRegistrationWindow(new Date('2026-11-07T16:59:30+07:00'));
    assert.equal(satBefore17.isOpen, true);
    assert.equal(satBefore17.isMandatoryWindow, true);

    // Sat 17:00:00 VN -> CLOSED ("trước 17H" means at 17:00 sharp it closes!)
    const satAt17 = helpersMod.getScheduleRegistrationWindow(new Date('2026-11-07T17:00:00+07:00'));
    assert.equal(satAt17.isOpen, false);
    assert.equal(satAt17.isClosed, true);
    assert.equal(satAt17.isMandatoryWindow, false);

    // Sun 11:00 VN -> CLOSED
    const sun = helpersMod.getScheduleRegistrationWindow(new Date('2026-11-08T11:00:00+07:00'));
    assert.equal(sun.isOpen, false);
    assert.equal(sun.isClosed, true);
    assert.equal(sun.isMandatoryWindow, false);
  });

  test('Smart persistence remembers target week registration + latest timestamp across reloads without leaking across users', async () => {
    const helpersMod = await vite.ssrLoadModule('/src/utils/helpers.ts');
    const weekInfo = helpersMod.computeWeekInfo(new Date('2026-11-05T14:35:00+07:00'));
    const expectedKey = `${weekInfo.monthSheet}|${weekInfo.weekLabel}`;
    const shifts = ['15:00', '16:00', 'OFF', '15:00', '17:00', '17:00', '17:00'];

    helpersMod.markScheduleRegisteredLocally('nv1', expectedKey, shifts, {
      updatedAt: '05/11/2026 14:35',
      sheetSynced: true,
      offReason: 'Bận lịch học chiều T4',
    });

    // nv1 is remembered for this exact week
    assert.equal(helpersMod.isNextWeekScheduleRegistered(false, 'nv1', weekInfo), true);
    const meta1 = helpersMod.getScheduleRegistrationMeta('nv1', weekInfo);
    assert.ok(meta1);
    assert.equal(meta1.updatedAt, '05/11/2026 14:35');
    assert.equal(meta1.sheetSynced, true);
    assert.equal(meta1.offReason, 'Bận lịch học chiều T4');
    assert.deepEqual(meta1.shifts, shifts);

    // nv2 on the same shared device is NOT falsely treated as registered!
    assert.equal(helpersMod.isNextWeekScheduleRegistered(false, 'nv2', weekInfo), false);

    // Editing schedule updates the timestamp cleanly
    const editedShifts = ['16:00', '16:00', 'OFF', '15:00', '18:00', '18:00', '18:00'];
    helpersMod.markScheduleRegisteredLocally('nv1', expectedKey, editedShifts, {
      updatedAt: '06/11/2026 09:20',
      sheetSynced: true,
    });
    const metaEdited = helpersMod.getScheduleRegistrationMeta('nv1', weekInfo);
    assert.equal(metaEdited?.updatedAt, '06/11/2026 09:20');
    assert.deepEqual(metaEdited?.shifts, editedShifts);
  });

  test('Self-healing refreshAppData keeps remembered registration un-annoyed & re-syncs REGISTER_SHIFT if Sheet missed row, and UI has zero snooze loophole', async () => {
    const helpersMod = await vite.ssrLoadModule('/src/utils/helpers.ts');
    const storeMod = await vite.ssrLoadModule('/src/store/useAppStore.ts');
    const refreshMod = await vite.ssrLoadModule('/src/utils/refreshData.ts');
    const { useAppStore } = storeMod;

    // Static invariant: MandatoryScheduleModal & Dashboard must NOT contain the 15-min snooze bypass
    const modalSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/MandatoryScheduleModal.tsx'), 'utf8');
    const dashSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Dashboard.tsx'), 'utf8');
    assert.equal(modalSrc.includes('onEmergencyCheckIn'), false, 'MandatoryScheduleModal must not expose snooze bypass');
    assert.equal(dashSrc.includes('onEmergencyCheckIn'), false, 'Dashboard must not wire snooze bypass');

    const nowInfo = helpersMod.computeWeekInfo();
    const expectedKey = `${nowInfo.monthSheet}|${nowInfo.weekLabel}`;
    const savedShifts = ['15:00', '15:00', 'OFF', '15:00', '17:00', '17:00', '17:00'];

    useAppStore.setState({
      currentUser: { username: 'nv_heal', fullname: 'Trần Thị Hoa', email: '', role: 'user' },
      isScheduleRegistered: false,
      registeredShifts: [],
      registeredWeekKey: '',
    });

    helpersMod.markScheduleRegisteredLocally('nv_heal', expectedKey, savedShifts, {
      updatedAt: '05/11/2026 15:10',
      sheetSynced: false,
      offReason: 'Nghỉ T4',
    });

    const capturedActions: any[] = [];
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (_url: any, init: any) => {
        const body = init?.body ? JSON.parse(init.body) : {};
        capturedActions.push(body);
        if (body.action === 'GET_DATA') {
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                isScheduleRegistered: false,
                registeredShifts: null,
                approvedShifts: null,
                currentWeekApprovedShifts: null,
                logs: [],
                stats: { totalCheckIn: 0, validCount: 0 },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (body.action === 'REGISTER_SHIFT') {
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                sheetSaved: true,
                timestamp: '05/11/2026 15:12',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
      }) as any;

      await refreshMod.refreshAppData(true);
      // Allow background self-healing promise microtask to settle
      await new Promise((r) => setTimeout(r, 40));

      const afterState = useAppStore.getState();
      assert.equal(afterState.isScheduleRegistered, true, 'User who genuinely registered for target week stays remembered');
      assert.equal(afterState.registeredWeekKey, expectedKey);
      assert.equal(afterState.scheduleSheetSynced, true, 'Self-healing sync flips scheduleSheetSynced to true');
      assert.equal(
        capturedActions.some((a) => a.action === 'REGISTER_SHIFT' && a.username === 'nv_heal'),
        true,
        'refreshAppData must auto-push REGISTER_SHIFT in background when server lacked saved current-week shifts'
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ===========================================================================
// SUITE 2: Cloudflare Edge Honest Sheet-Sync Reporting (functions/api.js)
// ===========================================================================
describe('Schedule Enforcement — Cloudflare Edge Honest Sheet-Sync & D1 Metadata', () => {
  test('Edge REGISTER_SHIFT reports sheetSaved=false when GAS times out/fails with D1, and returns ok=false if DB is unbound', async () => {
    const edgeMod = await import('../functions/api.js');

    (globalThis as any).caches = {
      default: {
        match: async () => null,
        put: async () => {},
        delete: async () => false,
      },
    };

    const d1Schedules = new Map<string, any>();
    const mockDb = {
      exec: async () => {},
      batch: async () => [],
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          run: async () => {
            if (sql.includes('INSERT INTO edge_schedules')) {
              d1Schedules.set(args[0], {
                id: args[0],
                username: args[1],
                fullname: args[2],
                month_sheet: args[3],
                week_label: args[4],
                shifts_json: args[5],
                off_reason: args[6],
                status: 'Chờ duyệt',
                sheet_synced: 0,
                updated_at: args[7],
              });
            }
            if (sql.includes('UPDATE edge_schedules SET sheet_synced = 1')) {
              const row = d1Schedules.get(args[1]);
              if (row) row.sheet_synced = 1;
            }
            return { success: true };
          },
          first: async () => {
            if (sql.includes('FROM edge_schedules')) {
              for (const row of d1Schedules.values()) {
                if (row.month_sheet === args[0] && row.week_label === args[1]) {
                  return row;
                }
              }
            }
            return null;
          },
          all: async () => ({ results: [] }),
        }),
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
    };

    const origFetch = globalThis.fetch;
    try {
      // Case 1: GAS returns 503 / fails on all attempts AND D1 is unbound -> MUST return ok: false (never drop silently!)
      globalThis.fetch = (async () => new Response('GAS Busy', { status: 503 })) as any;

      const noDbWait: Promise<any>[] = [];
      const noDbRes = await edgeMod.onRequest({
        request: new Request('https://kg.example/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'REGISTER_SHIFT',
            username: 'nv1',
            fullname: 'Nguyễn Văn Một',
            monthSheet: 'Tháng 11/2026',
            weekLabel: '📅 TUẦN 09/11 - 15/11',
            shifts: ['15:00', '15:00', 'OFF', '15:00', '16:00', '16:00', '16:00'],
          }),
        }),
        env: {},
        waitUntil: (p: Promise<any>) => noDbWait.push(p),
      });
      await Promise.all(noDbWait);
      const noDbJson = await noDbRes.json();
      assert.equal(noDbJson.ok, false, 'Without D1 binding, Edge must NOT claim ok:true when GAS failed');

      // Case 2: GAS fails/times out WITH D1 bound -> buffered in D1, MUST report sheetSaved: false, queuedForSheet: true
      const d1Wait: Promise<any>[] = [];
      const bufferedRes = await edgeMod.onRequest({
        request: new Request('https://kg.example/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'REGISTER_SHIFT',
            username: 'nv1',
            fullname: 'Nguyễn Văn Một',
            monthSheet: 'Tháng 11/2026',
            weekLabel: '📅 TUẦN 09/11 - 15/11',
            shifts: ['15:00', '15:00', 'OFF', '15:00', '16:00', '16:00', '16:00'],
          }),
        }),
        env: { DB: mockDb },
        waitUntil: (p: Promise<any>) => d1Wait.push(p),
      });
      await Promise.all(d1Wait);
      const bufferedJson = await bufferedRes.json();
      assert.equal(bufferedJson.ok, true);
      assert.equal(
        bufferedJson.data.sheetSaved,
        false,
        'Edge must NOT lie sheetSaved:true when GAS did not confirm writing to Google Sheets'
      );
      assert.equal(bufferedJson.data.queuedForSheet, true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ===========================================================================
// SUITE 3: Google Apps Script Hard Check-In Gate, Sheet Persistence & Timestamp
// ===========================================================================
describe('Schedule Enforcement — GAS Server-Side Hard Check-In Gate & Sheet Sync', () => {
  test('GAS handleRegisterShift writes Asia/Ho_Chi_Minh dd/MM/yyyy HH:mm timestamp, deduplicates NFC/whitespace names, handles Date cells, and fixes APPROVE_SCHEDULES header lookup', () => {
    const gas = createGasSandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['admin01', 'hash_admin', 'Quản Lý Chính', '', 'admin@kg.vn', 'admin', 'Quản lý', '', 'active'],
          ['nv1', 'hash_nv1', 'Nguyễn Văn Một', '', 'nv1@kg.vn', 'user', 'Phục vụ', '', 'active'],
        ],
        '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
      },
      '2026-11-05T14:35:00+07:00',
      { disableAdvancedSheetsGet: true } // Also tests fallback getValues() where time cells can be Date objects!
    );

    // 1. Register shifts for upcoming week (09/11 - 15/11)
    const reg1 = gas.callDoPost({
      action: 'REGISTER_SHIFT',
      username: 'nv1',
      fullname: 'Nguyễn  Văn Một', // extra space
      monthSheet: 'Tháng 11/2026',
      weekLabel: '📅 TUẦN 09/11 - 15/11',
      shifts: ['15:00', '16:00', 'OFF', '15:00', '17:00', '17:00', '17:00'],
      offReason: 'Nghỉ T4 đi học',
    });
    assert.equal(reg1.ok, true);
    assert.equal(reg1.data.sheetSaved, true);
    // Must format timestamp in Vietnam timezone (05/11/2026 14:35), NOT America/Los_Angeles!
    assert.equal(reg1.data.timestamp, '05/11/2026 14:35');

    // 2. Edit shifts with NFD decomposed Vietnamese name -> must update existing row in-place (no duplicate row!)
    gas.setNow('2026-11-06T09:20:00+07:00');
    const reg2 = gas.callDoPost({
      action: 'REGISTER_SHIFT',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một'.normalize('NFD'),
      monthSheet: 'Tháng 11/2026',
      weekLabel: '📅 TUẦN 09/11 - 15/11',
      shifts: ['16:00', '16:00', 'OFF', '15:00', '18:00', '18:00', '18:00'],
      offReason: 'Đổi sang ca 18h cuối tuần',
      isEdit: true,
    });
    assert.equal(reg2.ok, true);
    assert.equal(reg2.data.timestamp, '06/11/2026 09:20');

    const monthRows = gas.sheetsData['Tháng 11/2026'].filter(
      (r) => r[0] && String(r[0]).normalize('NFC').replace(/\s+/g, ' ').trim() === 'Nguyễn Văn Một'
    );
    assert.equal(monthRows.length, 1, 'Editing schedule must update in-place without creating duplicate employee rows');

    // Simulate Google Sheets turning '16:00' cell into an 1899 Date object in getValues()
    const rowIndexInSheet = gas.sheetsData['Tháng 11/2026'].findIndex(
      (r) => r[0] && String(r[0]).normalize('NFC').replace(/\s+/g, ' ').trim() === 'Nguyễn Văn Một'
    );
    gas.sheetsData['Tháng 11/2026'][rowIndexInSheet][1] = new Date('1899-12-30T16:00:00+07:00');

    // 3. GET_DATA must return isScheduleRegistered=true, clean '16:00' string, scheduleUpdatedAt, and scheduleOffReason
    const getDataRes = gas.callDoPost({
      action: 'GET_DATA',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      role: 'user',
      monthSheet: 'Tháng 11/2026',
      weekLabel: '📅 TUẦN 09/11 - 15/11',
      forceRefresh: true,
    });
    assert.equal(getDataRes.ok, true);
    assert.equal(getDataRes.data.isScheduleRegistered, true);
    assert.equal(getDataRes.data.registeredShifts[0], '16:00');
    assert.equal(getDataRes.data.scheduleUpdatedAt, '06/11/2026 09:20');
    assert.equal(getDataRes.data.scheduleOffReason, 'Đổi sang ca 18h cuối tuần');

    // 4. Admin APPROVE_SCHEDULES with '📅 TUẦN 09/11 - 15/11' must succeed (previously failed with 'Không tìm thấy tuần 📅 TUẦN ...')
    const approveRes = gas.callDoPost({
      action: 'APPROVE_SCHEDULES',
      role: 'admin',
      adminUsername: 'admin01',
      monthSheet: 'Tháng 11/2026',
      weekLabel: '📅 TUẦN 09/11 - 15/11',
      isFinal: true,
      schedules: [
        {
          username: 'nv1',
          fullname: 'Nguyễn Văn Một',
          shifts: ['16:00', '16:00', 'OFF', '15:00', '18:00', '18:00', '18:00'],
        },
      ],
    });
    assert.equal(approveRes.ok, true, `Expected APPROVE_SCHEDULES to succeed, got: ${JSON.stringify(approveRes)}`);
  });

  test('GAS handleCheckInOut strictly blocks unregistered staff during Thu 00:00 -> Sat 17:00, allows immediately after REGISTER_SHIFT, and preserves Wed offline retry', () => {
    const gas = createGasSandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['nv1', 'hash_nv1', 'Nguyễn Văn Một', '', 'nv1@kg.vn', 'user', 'Phục vụ', '', 'active'],
        ],
        '⚙️ CẤU HÌNH': [
          ['Key', 'Value'],
          ['GPS_CONFIG', JSON.stringify({ lat: 10.976083, lng: 106.664654, radius: 25 })],
        ],
        '✔️CHẤM CÔNG': [['Họ tên', 'Loại', 'Thời gian', 'Vị trí', 'Trạng thái', 'Khoảng cách', 'Ảnh', 'JSON']],
      },
      '2026-11-05T14:50:00+07:00' // Thursday 14:50 VN (inside mandatory T5 -> 17h T7 window)
    );

    // 1. Offline retry of a Wednesday 22:15 punch synced on Thursday -> MUST BE ALLOWED
    const wedOfflineRes = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      type: 'Ra ca',
      lat: 10.976083,
      lng: 106.664654,
      gpsAccuracy: 8,
      time: '04/11/2026 22:15:00',
      isOfflineRetry: true,
    });
    assert.equal(wedOfflineRes.ok, true, 'Offline retry from Wednesday night must not be blocked on Thursday');

    // 2. Live Thursday 14:50 punch WITHOUT next week's schedule (09/11 - 15/11) -> MUST BE HARD-BLOCKED!
    const blockedPunch = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      type: 'Vào ca',
      lat: 10.976083,
      lng: 106.664654,
      gpsAccuracy: 8,
      time: '05/11/2026 14:50:00',
      clientNowMs: Date.parse('2026-11-05T14:50:00+07:00'),
      photoCapturedMs: Date.parse('2026-11-05T14:49:50+07:00'),
    });
    assert.equal(blockedPunch.ok, false, 'Unregistered staff must NOT be able to check in during Thu 00:00 - Sat 17:00');
    assert.equal(blockedPunch.code || blockedPunch.data?.code, 'SCHEDULE_REQUIRED');
    assert.equal(gas.sheetsData['✔️CHẤM CÔNG'].length, 2, 'Blocked punch must NOT append row to ✔️CHẤM CÔNG');

    // 3. Employee registers next week's schedule (even 7 days OFF for exam week with valid reason) -> then checks in -> SUCCEEDS!
    const regRes = gas.callDoPost({
      action: 'REGISTER_SHIFT',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      monthSheet: 'Tháng 11/2026',
      weekLabel: '📅 TUẦN 09/11 - 15/11',
      shifts: ['OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF'],
      offReason: 'Em xin nghỉ tuần tới thi học kỳ tại trường',
    });
    assert.equal(regRes.ok, true);

    const allowedPunch = gas.callDoPost({
      action: 'CHECK_IN_OUT',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      type: 'Vào ca',
      lat: 10.976083,
      lng: 106.664654,
      gpsAccuracy: 8,
      time: '05/11/2026 14:51:00',
      clientNowMs: Date.parse('2026-11-05T14:51:00+07:00'),
      photoCapturedMs: Date.parse('2026-11-05T14:50:55+07:00'),
    });
    assert.equal(allowedPunch.ok, true, 'Check-in must succeed immediately once next week schedule is in Sheet');
    assert.equal(gas.sheetsData['✔️CHẤM CÔNG'].length, 3);
  });

  test('Cross-project GAS modules in kg-checkin-main/gas stay 100% synchronized with GAS BẢNG CHẤM CÔNG', () => {
    const companionDir = 'G:/04_HR_Attendance_And_Payroll/GAS BẢNG CHẤM CÔNG';
    if (!fs.existsSync(companionDir)) return;

    const webGasDir = path.resolve(process.cwd(), 'gas');
    const pairs: Array<[string, string]> = [
      ['appsscript.json', 'appsscript.json'],
      ['AttendanceControlCenter.html', 'AttendanceControlCenter.html'],
      ['ControlCenterService.js', 'ControlCenterService.gs'],
      ['Code.js', 'Code.gs'],
      ['ChecklistService.js', 'ChecklistService.gs'],
      ['Engine.js', 'Engine.gs'],
      ['Handlers.js', 'Handlers.gs'],
      ['JsonCacheService.js', 'JsonCacheService.gs'],
      ['OpsChecklistHandlers.js', 'OpsChecklistHandlers.gs'],
      ['SheetService.js', 'SheetService.gs'],
    ];

    const norm = (s: string) => s.replace(/\r\n/g, '\n');
    for (const [gasFile, webFile] of pairs) {
      const a = norm(fs.readFileSync(path.join(companionDir, gasFile), 'utf8'));
      const b = norm(fs.readFileSync(path.join(webGasDir, webFile), 'utf8'));
      assert.equal(b, a, `Drift detected between GAS BẢNG CHẤM CÔNG/${gasFile} and kg-checkin-main/gas/${webFile}`);
    }
  });
});
