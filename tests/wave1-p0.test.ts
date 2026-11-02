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
// Helper: In-Memory Google Apps Script Sandbox (Loads Real gas/*.gs Files)
// ---------------------------------------------------------------------------
function createGasSandbox(initialSheets: Record<string, any[][]>, fixedNowIso = '2026-11-15T10:00:00+07:00') {
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
          clearContent: () => {
            for (let r = 0; r < numRows; r++) {
              for (let c = 0; c < numCols; c++) {
                if (sheetsData[name]?.[row1 - 1 + r]) {
                  sheetsData[name][row1 - 1 + r][col1 - 1 + c] = '';
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
      computeDigest: (_alg: string, input: string) => {
        return Array.from(Buffer.from(String(input), 'utf8'));
      },
      computeHmacSha256Signature: (value: string, key: string) => {
        return Array.from(Buffer.from(`${value}:${key}`, 'utf8'));
      },
      base64EncodeWebSafe: (bytes: number[] | string) =>
        Buffer.from(Array.isArray(bytes) ? bytes : String(bytes)).toString('base64url'),
      formatDate: (d: Date, _tz: string, fmt: string) => {
        // Compute GMT+7 components deterministically
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
        },
      },
    },
  };

  vm.createContext(sandbox);
  const gasDir = path.resolve(process.cwd(), 'gas');
  for (const file of ['Code.gs', 'JsonCacheService.gs', 'Handlers.gs', 'Engine.gs', 'ChecklistService.gs', 'OpsChecklistHandlers.gs']) {
    const code = fs.readFileSync(path.join(gasDir, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }

  return {
    sheetsData,
    callDoPost(payload: Record<string, any>) {
      const out = sandbox.doPost({
        postData: { contents: JSON.stringify(payload) },
      });
      return JSON.parse(out.getContent());
    },
  };
}

// ===========================================================================
// SUITE 1: Frontend API Collision, Store Logout Purge, RBAC, Geofence & Timesheet
// ===========================================================================
describe('Wave 1 P0 — Frontend Core & Business Invariants', () => {
  test('callApi preserves top-level action when payload also contains action (INTERACT_POST / APPROVE_ADVANCE)', async () => {
    const apiMod = await vite.ssrLoadModule('/src/services/api.ts');
    const capturedBodies: any[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init?: any) => {
      capturedBodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
    }) as any;

    try {
      await apiMod.callApi('INTERACT_POST', { postId: 99, action: 'LIKE', username: 'nv1' }, { background: true });
      await apiMod.callApi('APPROVE_ADVANCE', { advanceId: 'ADV_1', action: 'APPROVE' });

      assert.equal(capturedBodies[0].action, 'INTERACT_POST');
      assert.equal(capturedBodies[0].subAction, 'LIKE');
      assert.equal(capturedBodies[1].action, 'APPROVE_ADVANCE');
      assert.equal(capturedBodies[1].decision, 'APPROVE');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('useAppStore.logout purges cross-user cached slices and sensitive localStorage keys', async () => {
    localStore.setItem('kg_app_cache_v2', '{"secret":"userA"}');
    localStore.setItem('kg_punch_vault_v1', '[{"user":"userA"}]');
    localStore.setItem('kg_offline_queue_v1', '[{"user":"userA"}]');
    localStore.setItem('kg_local_missed_claims', '[{"user":"userA"}]');

    const storeMod = await vite.ssrLoadModule('/src/store/useAppStore.ts');
    const { useAppStore } = storeMod;
    useAppStore.setState({
      payrollData: [{ username: 'userA', netPay: 5000000 }],
      advances: [{ id: 'ADV_1', username: 'userA', fullname: 'User A', amount: 500000, reason: 'x', status: 'Approved', createdAt: 1 }],
      feedbacks: [{ id: 'FB_1' }],
      timesheetData: { timesheet: { 'User A': {} }, dominantMonth: '2026-10', year: 2026, month: 10, daysInMonth: 31 },
    });

    useAppStore.getState().logout();

    const afterState = useAppStore.getState();
    assert.deepEqual(afterState.payrollData, []);
    assert.deepEqual(afterState.advances, []);
    assert.deepEqual(afterState.feedbacks, []);
    assert.equal(afterState.timesheetData, null);
    assert.equal(localStore.getItem('kg_app_cache_v2'), null);
    assert.equal(localStore.getItem('kg_punch_vault_v1'), null);
    assert.equal(localStore.getItem('kg_local_missed_claims'), null);
  });

  test('hasTabPermission denies tester access to admin-only tabs (hr_list, admin)', async () => {
    const permMod = await vite.ssrLoadModule('/src/utils/permissions.ts');
    const testerUser = { username: 'testapp', fullname: 'Tester', email: '', role: 'tester', position: 'Tester' };
    assert.equal(permMod.hasTabPermission('hr_list', testerUser), false);
    assert.equal(permMod.hasTabPermission('admin', testerUser), false);
    assert.equal(permMod.hasTabPermission('admin_payroll', testerUser), false);
  });

  test('evaluateCheckInGeofence rejects out-of-radius capturedGps instead of bypassing when photo exists', async () => {
    const helpersMod = await vite.ssrLoadModule('/src/utils/helpers.ts');
    assert.equal(typeof helpersMod.evaluateCheckInGeofence, 'function');
    // Staff captured a photo while 350m away from restaurant (radius = 25m)
    const allowedFarAway = helpersMod.evaluateCheckInGeofence({
      isAuthorizedTest: false,
      hasCapturedPhoto: true,
      capturedGps: { dist: 350, acc: 10 },
      liveIsValid: false,
      liveEffectiveDist: 350,
      targetRadius: 25,
    });
    assert.equal(allowedFarAway, false);

    // Staff captured a photo inside radius (dist = 18m <= 25m)
    const allowedInside = helpersMod.evaluateCheckInGeofence({
      isAuthorizedTest: false,
      hasCapturedPhoto: true,
      capturedGps: { dist: 18, acc: 10 },
      liveIsValid: false,
      liveEffectiveDist: 45, // indoor GPS drifted after capture
      targetRadius: 25,
    });
    assert.equal(allowedInside, true);
  });

  test('calculateEmployeeMonthTimesheet honors explicit monthParam/yearParam and counts month-end overnight shift', async () => {
    const tsMod = await vite.ssrLoadModule('/src/utils/timesheetCalculator.ts');
    const tsData = {
      dominantMonth: '2026-10',
      month: 10,
      year: 2026,
      daysInMonth: 31,
      timesheet: {
        'Nguyễn Văn A': {
          '30/09/2026': [
            { status: 'Vào ca', validStatus: 'Hợp lệ', time: '18:00', originalTimeMs: Date.parse('2026-09-30T18:00:00+07:00') },
          ],
          '01/10/2026': [
            { status: 'Ra ca', validStatus: 'Hợp lệ', time: '00:12', originalTimeMs: Date.parse('2026-10-01T00:12:00+07:00') },
          ],
        },
      },
    };

    const sepSummary = tsMod.calculateEmployeeMonthTimesheet('Nguyễn Văn A', tsData, 30, 9, 2026);
    assert.equal(sepSummary.days[30].dateStr, '30/09/2026');
    assert.equal(sepSummary.workedDaysCount, 1);
    assert.equal(Number(sepSummary.totalMonthHours.toFixed(2)), 6.2); // 18:00 -> 00:12 = 6h12m = 6.2h
  });
});

// ===========================================================================
// SUITE 2: Cloudflare Edge Gateway (functions/api.js)
// ===========================================================================
describe('Wave 1 P0 — Cloudflare Edge Gateway Security & D1 Hooks', () => {
  test('Edge blocks non-admin UPDATE_USER_ROLE, strips groqKeys & coworker GPS logs for normal staff, and records CHECK_IN_OUT', async () => {
    const edgeMod = await import('../functions/api.js');

    const d1Checkins: any[] = [];
    const mockDb = {
      exec: async () => {},
      batch: async () => [],
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          run: async () => {
            if (sql.includes('INSERT OR REPLACE INTO edge_checkin_logs')) {
              d1Checkins.push({
                id: args[0],
                username: args[1],
                fullname: args[2],
                check_type: args[3],
                shift_name: args[4],
                time_str: args[5],
                status: args[6],
                distance: args[7],
                lat: args[8],
                lng: args[9],
                note: args[10],
                image_url: args[11],
                created_at: args[12],
              });
            }
            return { success: true };
          },
          first: async () => null,
          all: async () => {
            if (sql.includes('FROM edge_checkin_logs')) {
              return { results: d1Checkins };
            }
            return { results: [] };
          },
        }),
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
    };

    (globalThis as any).caches = {
      default: {
        match: async () => null,
        put: async () => {},
        delete: async () => false,
      },
    };

    const forwardedBodies: any[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init?: any) => {
      const parsed = JSON.parse(init.body);
      forwardedBodies.push(parsed);
      if (parsed.action === 'CHECK_IN_OUT') {
        return new Response(JSON.stringify({ ok: true, data: { time: '02/11/2026 15:00', status: 'Hợp lệ' } }));
      }
      if (parsed.action === 'GET_DATA') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              logs: [],
              keys: [{ key: 'gsk_secret_123', tag: 'Key 1', status: 'Active' }],
            },
          })
        );
      }
      return new Response(JSON.stringify({ ok: true, data: {} }));
    }) as any;

    try {
      const waitTasks: Promise<any>[] = [];
      const makeCtx = (body: any) => ({
        request: new Request('https://kg.example/api', { method: 'POST', body: JSON.stringify(body) }),
        env: { DB: mockDb },
        waitUntil: (p: Promise<any>) => waitTasks.push(p),
      });

      // 1) Privilege escalation attempt by staff/tester -> must be rejected 403
      const escRes = await edgeMod.onRequest(
        makeCtx({ action: 'UPDATE_USER_ROLE', role: 'tester', targetUsername: 'nv1', newRole: 'admin' })
      );
      assert.equal(escRes.status, 403);

      // 2) CHECK_IN_OUT by Coworker B -> must write into edge_checkin_logs
      await edgeMod.onRequest(
        makeCtx({
          action: 'CHECK_IN_OUT',
          username: 'coworker_b',
          fullname: 'Đồng Nghiệp B',
          type: 'Vào ca',
          lat: 10.88,
          lng: 106.78,
        })
      );
      await Promise.all(waitTasks);
      assert.equal(d1Checkins.length, 1);

      // 3) GET_DATA by Staff A -> must strip data.keys AND must NOT leak Coworker B's D1 GPS log
      const getDataRes = await edgeMod.onRequest(
        makeCtx({ action: 'GET_DATA', username: 'staff_a', fullname: 'Nhân Viên A', role: 'user', forceRefresh: true })
      );
      const getDataJson = await getDataRes.json();
      assert.deepEqual(getDataJson.data.keys, []);
      assert.equal(
        getDataJson.data.logs.some((l: any) => l.fullname === 'Đồng Nghiệp B'),
        false
      );

      // 4) SUBMIT_FEEDBACK with isAnonymous: true -> Edge must scrub real identity before forwarding to GAS
      await edgeMod.onRequest(
        makeCtx({
          action: 'SUBMIT_FEEDBACK',
          username: 'staff_a',
          fullname: 'Nhân Viên A',
          content: 'Ẩn danh thật',
          isAnonymous: true,
        })
      );
      const fbForwarded = forwardedBodies.find((b) => b.action === 'SUBMIT_FEEDBACK');
      assert.equal(fbForwarded.username, 'Anonymous');
      assert.equal(fbForwarded.fullname, 'Ẩn danh');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ===========================================================================
// SUITE 3: Google Apps Script Backend (gas/*.gs)
// ===========================================================================
describe('Wave 1 P0 — Google Apps Script Handlers, RBAC & Payroll Accounting', () => {
  test('GAS fixes INTERACT_POST, APPROVE_ADVANCE, APPROVE_SWAP, blocks unauth UPDATE_USER_ROLE, removes testapp backdoor, preserves AdminOrg, and enforces anonymous Feedback', () => {
    const gas = createGasSandbox({
      DATA: [
        ['Bảng người dùng'],
        ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
        ['admin01', 'hash_admin', 'Quản Lý Chính', '', 'admin@kg.vn', 'admin', 'Quản lý', '', 'active'],
        ['nv1', 'hash_nv1', 'Nguyễn Văn Một', '', 'nv1@kg.vn', 'user', 'Phục vụ', '', 'active'],
        ['nv2', 'hash_nv2', 'Trần Thị Hai', '', 'nv2@kg.vn', 'user', 'Phục vụ', '', 'active'],
      ],
      Posts: [
        ['ID', 'Author', 'Content', 'Likes', 'Comments', 'Image', 'Time'],
        ['101', 'Quản Lý Chính', 'Thông báo ca', '[]', '[]', '', '01/11 10:00'],
      ],
      Advances: [
        ['ID', 'CreatedAt', 'Username', 'Fullname', 'Amount', 'Reason', 'Status'],
        ['ADV_1', Date.parse('2026-11-05T10:00:00+07:00'), 'nv1', 'Nguyễn Văn Một', 300000, 'Ứng lương', 'Pending'],
      ],
      SwapRequests: [
        ['ID', 'CreatedAt', 'Username', 'Fullname', 'DayName', 'Date', 'Shift', 'Reason', 'TargetUsername', 'TargetFullname', 'Status', 'MonthSheet'],
        ['SW_1', 1, 'nv1', 'Nguyễn Văn Một', 'Thứ Hai', '02/11', '15:00', 'Bận học', 'nv2', 'Trần Thị Hai', 'Pending_Admin', 'Tháng 11/2026'],
      ],
      'Tháng 11/2026': [
        ['📅 TUẦN 02/11 - 08/11', '', '', '', '', '', '', '', '', '', ''],
        ['Nhân viên', '02/11', '03/11', '04/11', '05/11', '06/11', '07/11', '08/11', '', '', 'Trạng thái'],
        ['Nguyễn Văn Một', '15:00', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', '', '', 'Đã duyệt ✓'],
        ['Trần Thị Hai', 'OFF', '15:00', 'OFF', 'OFF', 'OFF', 'OFF', 'OFF', '', '', 'Đã duyệt ✓'],
      ],
      '⚙️ CẤU HÌNH': [
        ['Key', 'Value'],
        [
          'ORG_CONFIG',
          JSON.stringify({
            name: "King's Grill",
            address: 'Dĩ An',
            roles: [{ id: 'admin', name: 'Quản lý', isDefault: true }],
            orgStructure: [{ id: 'probation', name: 'Thử việc', salaryMultiplier: 0.8 }],
          }),
        ],
      ],
    });

    // 1. Hardcoded testapp backdoor must NOT log in
    const testAppLogin = gas.callDoPost({ action: 'LOGIN', username: 'testapp', password: '123' + '456' });
    assert.equal(testAppLogin.ok, false);

    // 2. Unauthenticated / non-admin UPDATE_USER_ROLE must fail
    const unauthRole = gas.callDoPost({ action: 'UPDATE_USER_ROLE', targetUsername: 'nv1', newRole: 'admin' });
    assert.equal(unauthRole.ok, false);
    assert.equal(gas.sheetsData['DATA'][3][5], 'user');

    // 3. INTERACT_POST with subAction: 'LIKE' must persist like in Posts
    const likeRes = gas.callDoPost({ action: 'INTERACT_POST', postId: '101', subAction: 'LIKE', username: 'nv1' });
    assert.equal(likeRes.ok, true);
    assert.deepEqual(JSON.parse(gas.sheetsData['Posts'][1][3]), ['nv1']);

    // 4. APPROVE_ADVANCE with decision: 'APPROVE' by admin must write 'Approved' (NOT 'Rejected')
    const advRes = gas.callDoPost({
      action: 'APPROVE_ADVANCE',
      advanceId: 'ADV_1',
      decision: 'APPROVE',
      role: 'admin',
      adminUsername: 'admin01',
    });
    assert.equal(advRes.ok, true);
    assert.equal(gas.sheetsData['Advances'][1][6], 'Approved');

    // 5. APPROVE_SWAP with decision: 'APPROVE' by admin must write 'Approved' AND swap shifts on Tháng 11/2026
    const swapRes = gas.callDoPost({
      action: 'APPROVE_SWAP',
      swapId: 'SW_1',
      decision: 'APPROVE',
      role: 'admin',
      adminUsername: 'admin01',
    });
    assert.equal(swapRes.ok, true);
    assert.equal(gas.sheetsData['SwapRequests'][1][10], 'Approved');
    assert.equal(gas.sheetsData['Tháng 11/2026'][2][1], 'OFF');
    assert.equal(gas.sheetsData['Tháng 11/2026'][3][1], '15:00');

    // 6. SUBMIT_FEEDBACK with isAnonymous: true must NEVER store real username/fullname in Feedbacks sheet
    const fbRes = gas.callDoPost({
      action: 'SUBMIT_FEEDBACK',
      username: 'nv1',
      fullname: 'Nguyễn Văn Một',
      category: 'Góp ý cải tiến quy trình',
      content: 'Cần sửa quạt khu A',
      isAnonymous: true,
    });
    assert.equal(fbRes.ok, true);
    assert.notEqual(gas.sheetsData['Feedbacks'][1][2], 'nv1');
    assert.notEqual(gas.sheetsData['Feedbacks'][1][8], 'Nguyễn Văn Một');

    // 7. UPDATE_ORG_CONFIG with only name/address must preserve existing roles & orgStructure
    const orgRes = gas.callDoPost({
      action: 'UPDATE_ORG_CONFIG',
      role: 'admin',
      adminUsername: 'admin01',
      name: "King's Grill Premium",
      address: 'Bình Dương',
    });
    assert.equal(orgRes.ok, true);
    const savedOrg = JSON.parse(gas.sheetsData['⚙️ CẤU HÌNH'][1][1]);
    assert.equal(savedOrg.roles.length, 1);
    assert.equal(savedOrg.orgStructure.length, 1);
  });

  test('GAS handleGetPayroll respects requested month, ignores mismatched TỔNG HỢP sheet, filters Advances/BonusPenalty by month, counts month-end overnight shift, and rounds VNĐ', () => {
    const gas = createGasSandbox(
      {
        DATA: [
          ['Bảng người dùng'],
          ['Username', 'Password', 'Fullname', 'DOB', 'Email', 'Role', 'Position', 'Avatar', 'EmploymentStatus'],
          ['nv1', 'hash_nv1', 'Nguyễn Văn Một', '', '', 'user', 'Phục vụ', '', 'active'],
        ],
        SalaryMonthlyConfig: [
          ['Month', 'ConfigJSON'],
          [
            '2026-09',
            JSON.stringify({
              items: [{ username: 'nv1', fullname: 'Nguyễn Văn Một', payType: 'hourly', amount: 23333 }],
            }),
          ],
        ],
        // Mismatched summary sheet from October (THÁNG 10/2026) — must NOT be used when requesting 2026-09!
        '📊 TỔNG HỢP ✔️CHẤM CÔNG': [
          ["KING'S GRILL — HỆ THỐNG CHẤM CÔNG NHÂN SỰ"],
          ['📊 BÁO CÁO TỔNG HỢP CHẤM CÔNG — THÁNG 10/2026'],
          ['Nguyễn Văn Một', '01/10/2026', '', '', '', '', '', '', 0, 99, 1],
        ],
        '✔️CHẤM CÔNG': [
          ['Họ tên', 'Loại', 'Thời gian', 'Khoảng cách', 'Trạng thái'],
          // Valid shift on 30/09 overnight to 01/10 00:10 -> 6h10m (6.166666... hours)
          ['Nguyễn Văn Một', 'Vào ca', '30/09/2026 18:00:00', '5m', 'Hợp lệ'],
          ['Nguyễn Văn Một', 'Ra ca', '01/10/2026 00:10:00', '5m', 'Hợp lệ'],
        ],
        Advances: [
          ['ID', 'CreatedAt', 'Username', 'Fullname', 'Amount', 'Reason', 'Status'],
          // August advance (must NOT be deducted in September!)
          ['ADV_AUG', Date.parse('2026-08-15T10:00:00+07:00'), 'nv1', 'Nguyễn Văn Một', 500000, 'Tháng 8', 'Approved'],
          // September advance (MUST be deducted in September)
          ['ADV_SEP', Date.parse('2026-09-20T10:00:00+07:00'), 'nv1', 'Nguyễn Văn Một', 50000, 'Tháng 9', 'Approved'],
        ],
        BonusPenalty: [
          ['ID', 'CreatedAt', 'TargetUsername', 'TargetFullname', 'Type', 'Amount', 'Reason'],
          // August penalty (must NOT be deducted in September!)
          ['BP_AUG', Date.parse('2026-08-10T10:00:00+07:00'), 'nv1', 'Nguyễn Văn Một', 'PENALTY', 200000, 'Trễ T8'],
          // September bonus (MUST be included in September)
          ['BP_SEP', Date.parse('2026-09-25T10:00:00+07:00'), 'nv1', 'Nguyễn Văn Một', 'BONUS', 20000, 'Chuyên cần T9'],
        ],
      },
      '2026-11-15T10:00:00+07:00' // Current clock is November, requesting September!
    );

    const res = gas.callDoPost({
      action: 'GET_PAYROLL',
      username: 'nv1',
      role: 'user',
      month: '2026-09',
    });

    assert.equal(res.ok, true);
    assert.equal(res.data.payroll.length, 1);
    const rec = res.data.payroll[0];

    // 6h10m = 6.1666... hours (NOT 99h from Oct summary, NOT 0h from dropped 01/10 checkout!)
    assert.equal(rec.workedDays, 1);
    assert.ok(Math.abs(rec.totalHours - 370 / 60) < 0.01, `Expected ~6.17h, got ${rec.totalHours}`);
    // Only September advance (50,000) and September bonus (20,000) included
    assert.equal(rec.advances, 50000);
    assert.equal(rec.bonus, 20000);
    assert.equal(rec.penalty, 0);
    // VNĐ amounts must be integer-rounded (no floating-point decimals!)
    assert.equal(Number.isInteger(rec.totalBaseSalary), true);
    assert.equal(Number.isInteger(rec.netPay), true);
  });
});
