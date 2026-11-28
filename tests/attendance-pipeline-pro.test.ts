import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { onRequest, resetEdgeMemoryStateForTests } from '../functions/api.js';
import {
  detectOverdueOpenShift,
  estimateScheduledShiftEndMinutes,
} from '../src/utils/missedCheckoutReminder.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function createGasSandbox() {
  const sheetsData: Record<string, any[][]> = {
    DATA: [
      ['DANH SÁCH NHÂN SỰ'],
      ['Username', 'Password', 'Fullname', 'Email', 'Role', 'Position', 'DOB', 'AvatarUrl', 'Status'],
      ['admin', 'hash', 'Quản Lý', 'admin@kg.vn', 'admin', 'Quản lý', '', '', 'active'],
      ['nv_lan', 'hash', 'Nguyễn Thị Lan', 'lan@kg.vn', 'user', 'Phục vụ', '', '', 'active'],
      ['nv_minh', 'hash', 'Trần Văn Minh', 'minh@kg.vn', 'user', 'Bếp', '', '', 'active'],
    ],
    '✔️CHẤM CÔNG': [
      ['👤 HỌ VÀ TÊN', '🔄 LOẠI', '⏰ THỜI GIAN', '📍 ĐỊA ĐIỂM', '✅ XÁC MINH', '📏 KHOẢNG CÁCH', '📸 HÌNH ẢNH', 'DATA_JSON', '📝 GHI CHÚ'],
    ],
    '⚙️ CẤU HÌNH': [['Key', 'Value']],
  };

  function makeSheet(name: string) {
    const getRows = () => {
      if (!sheetsData[name]) sheetsData[name] = [];
      return sheetsData[name];
    };
    return {
      getName: () => name,
      getLastRow: () => getRows().length,
      getLastColumn: () => Math.max(9, ...getRows().map((r) => r.length)),
      getDataRange: () => ({
        getValues: () => getRows().map((r) => [...r]),
        getDisplayValues: () => getRows().map((r) => r.map((v) => String(v ?? ''))),
      }),
      getRange: (row: number, col: number, numRows = 1, numCols = 1) => ({
        getValues: () => {
          const rows = getRows();
          const out: any[][] = [];
          for (let r = 0; r < numRows; r++) {
            const src = rows[row - 1 + r] || [];
            const line: any[] = [];
            for (let c = 0; c < numCols; c++) {
              line.push(src[col - 1 + c] ?? '');
            }
            out.push(line);
          }
          return out;
        },
        getFormulas: () => {
          const rows = getRows();
          const out: any[][] = [];
          for (let r = 0; r < numRows; r++) {
            const src = rows[row - 1 + r] || [];
            const line: any[] = [];
            for (let c = 0; c < numCols; c++) {
              const v = String(src[col - 1 + c] ?? '');
              line.push(v.startsWith('=') ? v : '');
            }
            out.push(line);
          }
          return out;
        },
        getValue: () => (getRows()[row - 1] || [])[col - 1] ?? '',
        setValues: (vals: any[][]) => {
          const rows = getRows();
          for (let r = 0; r < vals.length; r++) {
            while (rows.length < row + r) rows.push([]);
            for (let c = 0; c < vals[r].length; c++) {
              rows[row - 1 + r][col - 1 + c] = vals[r][c];
            }
          }
        },
        setValue: (val: any) => {
          const rows = getRows();
          while (rows.length < row) rows.push([]);
          rows[row - 1][col - 1] = val;
        },
        clearContent: () => {
          const rows = getRows();
          for (let r = 0; r < numRows; r++) {
            if (rows[row - 1 + r]) {
              for (let c = 0; c < numCols; c++) rows[row - 1 + r][col - 1 + c] = '';
            }
          }
        },
        setFontFamily: () => ({}),
        setFontSize: () => ({}),
        setFontWeight: () => ({}),
        setFontColor: () => ({}),
        setFontColors: () => ({}),
        setFontWeights: () => ({}),
        setBackground: () => ({}),
        setBackgrounds: () => ({}),
        setHorizontalAlignment: () => ({}),
        setHorizontalAlignments: () => ({}),
        setVerticalAlignment: () => ({}),
        setWrap: () => ({}),
        setWrapStrategy: () => ({}),
        setBorder: () => ({}),
      }),
      insertRowBefore: (idx: number) => {
        getRows().splice(idx - 1, 0, new Array(9).fill(''));
      },
      insertRowsBefore: (idx: number, count: number) => {
        const empty = Array.from({ length: count }, () => new Array(9).fill(''));
        getRows().splice(idx - 1, 0, ...empty);
      },
      deleteRows: (startRow: number, count: number) => {
        getRows().splice(startRow - 1, count);
      },
      appendRow: (row: any[]) => {
        getRows().push([...row]);
      },
      setRowHeight: () => {},
      setRowHeights: () => {},
      setColumnWidth: () => {},
      hideColumns: () => {},
      setFrozenRows: () => {},
    };
  }

  const ss = {
    getId: () => 'TEST_SS_ID',
    getSheetByName: (name: string) => (sheetsData[name] ? makeSheet(name) : null),
    insertSheet: (name: string) => {
      sheetsData[name] = [];
      return makeSheet(name);
    },
    getSheets: () => Object.keys(sheetsData).map((k) => makeSheet(k)),
    toast: () => {},
  };

  const createdTriggers: string[] = [];
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
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    Logger: { log: () => {} },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => ss,
      WrapStrategy: { CLIP: 'CLIP', WRAP: 'WRAP' },
      BorderStyle: { SOLID: 'SOLID', SOLID_MEDIUM: 'SOLID_MEDIUM' },
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => true,
        releaseLock: () => {},
      }),
    },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: (fnName: string) => ({
        timeBased: () => ({
          everyMinutes: () => ({ create: () => createdTriggers.push(`${fnName}:5m`) }),
          everyDays: () => ({ atHour: (h: number) => ({ create: () => createdTriggers.push(`${fnName}:daily@${h}`) }) }),
          onMonthDay: (d: number) => ({ atHour: (h: number) => ({ create: () => createdTriggers.push(`${fnName}:day${d}@${h}`) }) }),
        }),
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (txt: string) => ({
        _txt: txt,
        setMimeType() {
          return this;
        },
        getContent() {
          return txt;
        },
      }),
    },
    Utilities: {
      formatDate: (d: Date, _tz: string, fmt: string) => {
        const vn = new Date(d.getTime() + 7 * 3600 * 1000);
        const dd = String(vn.getUTCDate()).padStart(2, '0');
        const mm = String(vn.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = String(vn.getUTCFullYear());
        const HH = String(vn.getUTCHours()).padStart(2, '0');
        const MM = String(vn.getUTCMinutes()).padStart(2, '0');
        const SS = String(vn.getUTCSeconds()).padStart(2, '0');
        return fmt
          .replace('dd', dd)
          .replace('MM', mm)
          .replace('yyyy', yyyy)
          .replace('HH', HH)
          .replace('mm', MM)
          .replace('ss', SS);
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
      getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }),
    },
    CacheService: {
      getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }),
    },
    JsonCacheService: {
      invalidateAllCache: () => {},
      invalidateAdminCache: () => {},
      invalidateUserCache: () => {},
      invalidateGlobalCache: () => {},
    },
    uploadImageBlobToDrive: () => 'https://drive.google.com/file/d/FAKE_DRIVE/view',
    reverseGeocodeGoogle: () => "King's Grill - 34 Hoàng Văn Thụ",
    recordKingCoins: () => {},
    createNotification: () => {},
    invalidateGetDataCache: () => {},
  };

  vm.createContext(sandbox);
  for (const rel of ['gas/Code.gs', 'gas/Engine.gs', 'gas/Handlers.gs']) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, sandbox, { filename: rel });
  }

  return {
    sheetsData,
    createdTriggers,
    callDoPost: (payload: any) => {
      const out = sandbox.doPost({ postData: { contents: JSON.stringify(payload) } });
      return JSON.parse(out.getContent());
    },
  };
}

function createProEdgeEnv() {
  const checkinLogs = new Map<string, any>();
  const syncQueue = new Map<string, any>();
  const kvCache = new Map<string, any>();
  const auditLogs: any[] = [];
  const r2Store = new Map<string, { body: Uint8Array; httpMetadata?: any }>();
  let seqId = 1;

  const db = {
    batch: async () => [],
    prepare: (sql: string) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      const execRun = async (args: any[]) => {
        if (s.startsWith('INSERT OR REPLACE INTO edge_checkin_logs')) {
          const id = String(args[0]);
          checkinLogs.set(id, {
            id,
            username: String(args[1] || '').toLowerCase(),
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
            sheet_synced: s.includes(', 0, ?13)') ? 0 : 1,
            created_at: args[12],
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.startsWith('UPDATE edge_checkin_logs SET sheet_synced = 1')) {
          const row = checkinLogs.get(String(args[0]));
          if (row) {
            row.sheet_synced = 1;
            if (args[1]) row.fullname = args[1];
            if (args[2]) row.check_type = args[2];
            if (args[3]) row.note = args[3];
          }
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (s.startsWith('UPDATE edge_checkin_logs SET sheet_synced = 0 WHERE id = ?1')) {
          const row = checkinLogs.get(String(args[0]));
          if (row) row.sheet_synced = 0;
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (s.startsWith('UPDATE edge_checkin_logs SET image_url = ?1')) {
          const url = args[0];
          const id = String(args[1] || '');
          const row = checkinLogs.get(id);
          if (row) row.image_url = url;
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (s.startsWith('INSERT INTO edge_sync_queue') || s.startsWith('INSERT OR IGNORE INTO edge_sync_queue')) {
          const dedupeKey = String(args[0]);
          const isCheckinLiteral = s.includes("'CHECK_IN_OUT'");
          const isImgLiteral = s.includes("'UPLOAD_CHECKIN_IMAGE'");
          const action = isCheckinLiteral ? 'CHECK_IN_OUT' : isImgLiteral ? 'UPLOAD_CHECKIN_IMAGE' : String(args[1]);
          const payloadJson = isCheckinLiteral || isImgLiteral ? args[1] : args[2];
          const ts = isCheckinLiteral || isImgLiteral ? args[2] : args[3];
          if (s.includes('OR IGNORE') && syncQueue.has(dedupeKey)) {
            return { success: true, meta: { changes: 0 } };
          }
          const prev = syncQueue.get(dedupeKey);
          syncQueue.set(dedupeKey, {
            id: prev ? prev.id : seqId++,
            dedupe_key: dedupeKey,
            action,
            payload_json: payloadJson,
            attempts: 0,
            status: 'pending',
            last_error: '',
            created_at: prev ? prev.created_at : ts,
            updated_at: ts,
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.startsWith("UPDATE edge_sync_queue SET payload_json = ?1, updated_at = ?2 WHERE id = ?3 AND status = 'pending'")) {
          for (const q of syncQueue.values()) {
            if (q.id === args[2] && q.status === 'pending') {
              q.payload_json = args[0];
              q.updated_at = args[1];
              return { success: true, meta: { changes: 1 } };
            }
          }
          return { success: true, meta: { changes: 0 } };
        }
        if (s.startsWith("UPDATE edge_sync_queue SET status = 'processing'")) {
          for (const q of syncQueue.values()) {
            if ((q.id === args[1] || q.dedupe_key === args[1]) && q.status === 'pending') {
              q.status = 'processing';
              q.updated_at = args[0];
              return { success: true, meta: { changes: 1 } };
            }
          }
          return { success: true, meta: { changes: 0 } };
        }
        if (s.startsWith("UPDATE edge_sync_queue SET status = 'pending', updated_at = ?1 WHERE status = 'processing'")) {
          let ch = 0;
          for (const q of syncQueue.values()) {
            if (q.status === 'processing' && q.updated_at < args[1]) {
              q.status = 'pending';
              q.updated_at = args[0];
              ch++;
            }
          }
          return { success: true, meta: { changes: ch } };
        }
        if (s.startsWith('DELETE FROM edge_sync_queue WHERE id = ?1')) {
          for (const [k, q] of syncQueue.entries()) {
            if (q.id === args[0]) {
              syncQueue.delete(k);
              return { success: true, meta: { changes: 1 } };
            }
          }
          return { success: true, meta: { changes: 0 } };
        }
        if (s.startsWith('INSERT OR IGNORE INTO edge_kv_cache')) {
          const k = String(args[0]);
          if (!kvCache.has(k)) {
            kvCache.set(k, { cache_key: k, action: 'SYS_LEASE', payload_json: args[1], updated_at: args[2], expires_at: 0 });
          }
          return { success: true, meta: { changes: 1 } };
        }
        if (s.startsWith('INSERT INTO edge_kv_cache') || s.startsWith('INSERT OR REPLACE INTO edge_kv_cache')) {
          kvCache.set(String(args[0]), {
            cache_key: String(args[0]),
            action: args[1],
            payload_json: args[2],
            updated_at: args[3],
            expires_at: args[4],
          });
          return { success: true, meta: { changes: 1 } };
        }
        if (s.startsWith('UPDATE edge_kv_cache SET payload_json = ?1')) {
          const cur = kvCache.get(String(args[3]));
          if (cur && (cur.expires_at <= args[1] || cur.payload_json === args[0])) {
            cur.payload_json = args[0];
            cur.updated_at = args[1];
            cur.expires_at = args[2];
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }
        if (s.startsWith('UPDATE edge_kv_cache SET expires_at = 0')) {
          const cur = kvCache.get(String(args[1]));
          if (cur && cur.payload_json === args[2]) {
            cur.expires_at = 0;
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }
        if (s.startsWith('INSERT INTO edge_audit_logs')) {
          auditLogs.push({ id: args[0], actor: args[1], summary: args[2], created_at: args[4] });
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 1 } };
      };

      const execFirst = async (args: any[]) => {
        if (s.includes('FROM edge_kv_cache WHERE cache_key = ?1')) {
          return kvCache.get(String(args[0])) || null;
        }
        if (s.includes('FROM edge_sync_queue WHERE dedupe_key = ?1')) {
          const q = syncQueue.get(String(args[0]));
          if (s.includes("status = 'pending'")) return q && q.status === 'pending' ? q : null;
          return q || null;
        }
        if (s.includes('COUNT(*) as c FROM edge_sync_queue')) {
          const count = Array.from(syncQueue.values()).filter(
            (q) => q.status === 'pending' && (q.action === 'CHECK_IN_OUT' || q.action === 'CHECK_IN') && q.attempts === args[0]
          ).length;
          return { c: count };
        }
        if (s.includes('FROM edge_checkin_logs WHERE id = ?1')) {
          return checkinLogs.get(String(args[0])) || null;
        }
        return null;
      };

      const execAll = async (args: any[]) => {
        if (s.includes('FROM edge_checkin_logs WHERE sheet_synced = 0')) {
          return {
            results: Array.from(checkinLogs.values()).filter(
              (r) => Number(r.sheet_synced) === 0 && Number(r.created_at) >= Number(args[0] || 0)
            ),
          };
        }
        if (s.includes('FROM edge_checkin_logs WHERE username = ?1')) {
          return {
            results: Array.from(checkinLogs.values()).filter(
              (r) => r.username === String(args[0]).toLowerCase() && Number(r.created_at) >= Number(args[1] || 0)
            ),
          };
        }
        if (s.includes('FROM edge_checkin_logs WHERE created_at >= ?1')) {
          return {
            results: Array.from(checkinLogs.values()).filter(
              (r) => Number(r.created_at) >= Number(args[0] || 0)
            ),
          };
        }
        if (s.includes('FROM edge_sync_queue')) {
          const cutoff = Number(args[0] || 0);
          return {
            results: Array.from(syncQueue.values()).filter((q) => {
              if (s.includes("status IN ('pending', 'processing')")) {
                return (q.status === 'pending' || q.status === 'processing') && q.created_at >= cutoff;
              }
              if (q.status !== 'pending') return false;
              if (q.action === 'CHECK_IN_OUT' || q.action === 'CHECK_IN') {
                return q.attempts < 8 || q.updated_at <= cutoff;
              }
              return q.attempts < 30;
            }),
          };
        }
        return { results: [] };
      };

      return {
        bind: (...args: any[]) => ({
          run: () => execRun(args),
          first: () => execFirst(args),
          all: () => execAll(args),
        }),
        run: () => execRun([]),
        first: () => execFirst([]),
        all: () => execAll([]),
      };
    },
  };

  const r2 = {
    put: async (key: string, value: Uint8Array, opts?: any) => {
      r2Store.set(key, { body: value, httpMetadata: opts?.httpMetadata });
    },
    get: async (key: string) => {
      const hit = r2Store.get(key);
      if (!hit) return null;
      return { body: hit.body, httpMetadata: hit.httpMetadata };
    },
  };

  return {
    env: { DB: db, ATTENDANCE_R2: r2 },
    checkinLogs,
    syncQueue,
    kvCache,
    auditLogs,
    r2Store,
  };
}

test('Attendance Pipeline Pro Suite (Groups 1, 2 & 3)', async (t) => {
  await t.test('Group 1 (#1, #2, #3): R2 proof photo merges into BATCH_CHECK_IN_OUT (0 Drive calls), GET /api?photo serves immutable image, Sweeper & Health Monitor enforce RBAC', async () => {
    resetEdgeMemoryStateForTests();
    const gas = createGasSandbox();
    const { env, checkinLogs, syncQueue, r2Store } = createProEdgeEnv();
    const gasActions: string[] = [];

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init?: any) => {
      const body = JSON.parse(String(init?.body || '{}'));
      gasActions.push(body.action);
      const out = gas.callDoPost(body);
      return new Response(JSON.stringify(out), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      // 1. Unauthorized sweeper rejected with 403
      const badSweep = await onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({ action: 'SWEEP_SYNC_QUEUE', secret: 'wrong-secret' }),
        }),
        env,
        waitUntil: () => {},
      });
      assert.equal(badSweep.status, 403);

      // 2. Non-admin GET_SYNC_HEALTH rejected with 403
      const badHealth = await onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({ action: 'GET_SYNC_HEALTH', role: 'user' }),
        }),
        env,
        waitUntil: () => {},
      });
      assert.equal(badHealth.status, 403);

      // 3. Stage instant check-in WITHOUT letting waitUntil drain yet, then upload R2 photo!
      const waitTasks: Promise<any>[] = [];
      const checkInRes = await onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'CHECK_IN_OUT',
            instantEdge: true,
            checkinId: 'CHK_R2_MERGE_1',
            username: 'nv_lan',
            fullname: 'Nguyễn Thị Lan',
            type: 'Vào ca',
            lat: 10.9760826,
            lng: 106.6646541,
            gpsAccuracy: 5,
            time: '28/11/2026 18:00:00',
            actualTime: '28/11/2026 18:00:00',
            image: 'PENDING',
          }),
        }),
        env,
        waitUntil: (p: Promise<any>) => waitTasks.push(p),
      });
      assert.equal(checkInRes.status, 200);

      // Upload proof photo immediately -> should store in R2 and MERGE into the pending CHECK_IN_OUT queue item!
      const fakeJpeg = 'data:image/jpeg;base64,' + Buffer.from('FAKE_JPEG_BINARY_PAYLOAD_1234567890').toString('base64');
      const imgRes = await onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'UPLOAD_CHECKIN_IMAGE',
            instantEdge: true,
            checkinId: 'CHK_R2_MERGE_1',
            username: 'nv_lan',
            fullname: 'Nguyễn Thị Lan',
            time: '28/11/2026 18:00:00',
            image: fakeJpeg,
          }),
        }),
        env,
        waitUntil: () => {},
      });
      const imgJson: any = await imgRes.json();
      assert.equal(imgJson.ok, true);
      assert.equal(imgJson.data.storage, 'cloudflare_r2');
      assert.equal(imgJson.data.mergedIntoBatch, true);
      assert.ok(String(imgJson.data.url).startsWith('https://kg-checkin.pages.dev/api?photo='));
      assert.equal(r2Store.size, 1);

      // Verify GET /api?photo=... serves the binary image & blocks path traversal
      const r2Key = Array.from(r2Store.keys())[0];
      const photoGet = await onRequest({
        request: new Request(`https://kg-checkin.pages.dev/api?photo=${encodeURIComponent(r2Key)}`, {
          method: 'GET',
        }),
        env,
      });
      assert.equal(photoGet.status, 200);
      assert.equal(photoGet.headers.get('Content-Type'), 'image/jpeg');
      assert.equal(photoGet.headers.get('X-Edge-Storage'), 'R2-ATTENDANCE');

      const badTraversal = await onRequest({
        request: new Request('https://kg-checkin.pages.dev/api?photo=checkin/../../secret.txt', {
          method: 'GET',
        }),
        env,
      });
      assert.equal(badTraversal.status, 400);

      // Trigger SWEEP_SYNC_QUEUE with valid secret -> drains to GAS and writes R2 HYPERLINK directly in Col G with ZERO UPLOAD_CHECKIN_IMAGE GAS calls!
      const sweepRes = await onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'SWEEP_SYNC_QUEUE',
            secret: 'kg-sync-sweeper-2026',
          }),
        }),
        env,
        waitUntil: () => {},
      });
      const sweepJson: any = await sweepRes.json();
      assert.equal(sweepJson.ok, true);
      assert.equal(sweepJson.data.health.unsyncedCheckins, 0);
      assert.equal(sweepJson.data.health.r2Bound, true);
      assert.equal(gasActions.includes('UPLOAD_CHECKIN_IMAGE'), false, 'Zero separate GAS image calls when R2 merged into batch');
      assert.equal(gas.sheetsData['✔️CHẤM CÔNG'].length, 2);
      const colG = String(gas.sheetsData['✔️CHẤM CÔNG'][1][6]);
      assert.ok(colG.includes('=HYPERLINK("https://kg-checkin.pages.dev/api?photo='), 'Col G must contain R2 hyperlink formula');
      assert.equal(checkinLogs.get('CHK_R2_MERGE_1')?.sheet_synced, 1);
      assert.equal(syncQueue.size, 0);

      await Promise.allSettled(waitTasks);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  await t.test('Group 2 (#4, #5, #6): Monthly Rolling Archive (>45d), Bidirectional 48h D1<->Sheet Reconciliation, GAS Triggers & Kiosk Fast Queue', async () => {
    resetEdgeMemoryStateForTests();
    const gas = createGasSandbox();
    const { env, checkinLogs, auditLogs } = createProEdgeEnv();

    // Seed 3 rows in GAS sheet: 1 old row (>60 days ago), 1 recent row, 1 old pending claim (MUST stay in active sheet!)
    const nowMs = Date.now();
    const oldMs = nowMs - 65 * 86400 * 1000;
    const recentMs = nowMs - 2 * 3600 * 1000;
    const fmtVn = (ms: number) => {
      const vn = new Date(ms + 7 * 3600 * 1000);
      return `${String(vn.getUTCDate()).padStart(2, '0')}/${String(vn.getUTCMonth() + 1).padStart(2, '0')}/${vn.getUTCFullYear()} ${String(vn.getUTCHours()).padStart(2, '0')}:00:00`;
    };
    const oldVn = new Date(oldMs + 7 * 3600 * 1000);
    const expectedArchName = `✔️CHẤM CÔNG - THÁNG ${String(oldVn.getUTCMonth() + 1).padStart(2, '0')}/${oldVn.getUTCFullYear()}`;

    gas.sheetsData['✔️CHẤM CÔNG'].push(
      ['Nguyễn Thị Lan', 'Vào ca', `'${fmtVn(recentMs)}`, "King's Grill", 'Hợp lệ', '0m', '', JSON.stringify({ checkinId: 'CHK_RECENT_1', username: 'nv_lan', timestamp: new Date(recentMs).toISOString() }), ''],
      ['Nguyễn Thị Lan', 'Vào ca', `'${fmtVn(oldMs)}`, "King's Grill", 'Hợp lệ', '0m', '', JSON.stringify({ checkinId: 'CHK_OLD_1', username: 'nv_lan', timestamp: new Date(oldMs).toISOString() }), 'Trễ 10p'],
      ['Trần Văn Minh', 'Chờ duyệt: Bổ sung Vào ca', `'${fmtVn(oldMs)}`, 'Bổ sung', 'Chờ Admin duyệt', '0m', '', JSON.stringify({ checkinId: 'CHK_OLD_PENDING', username: 'nv_minh', timestamp: new Date(oldMs).toISOString() }), 'Quên chấm']
    );

    const archRes = gas.callDoPost({
      action: 'ARCHIVE_OLD_CHECKIN_SHEETS',
      role: 'admin',
      username: 'admin',
      keepDays: 45,
    });
    assert.equal(archRes.ok, true);
    assert.equal(archRes.data.archivedCount, 1);
    assert.equal(archRes.data.remainingCount, 2, 'Recent row + old pending claim must stay in active sheet');
    assert.ok(gas.sheetsData[expectedArchName], 'Archive sheet must be created');
    assert.equal(gas.sheetsData[expectedArchName].length, 2, 'Header + 1 archived row');
    assert.equal(gas.sheetsData[expectedArchName][1][8], 'Trễ 10p', 'Col I note must be preserved in archive');

    // Re-running archive is 100% idempotent (0 duplicates)
    const archRes2 = gas.callDoPost({ action: 'ARCHIVE_OLD_CHECKIN_SHEETS', role: 'admin', username: 'admin', keepDays: 45 });
    assert.equal(archRes2.data.archivedCount, 0);

    // GAS Trigger setup creates all 3 triggers
    const trigRes = gas.callDoPost({ action: 'SETUP_ATTENDANCE_TRIGGERS', role: 'admin', username: 'admin' });
    assert.equal(trigRes.ok, true);
    assert.equal(gas.createdTriggers.length, 3);

    // Bidirectional 48h Reconciliation: D1 thinks CHK_MISSING_RECON is sheet_synced=1, but Sheet doesn't have it!
    checkinLogs.set('CHK_RECENT_1', {
      id: 'CHK_RECENT_1',
      username: 'nv_lan',
      fullname: 'Nguyễn Thị Lan',
      check_type: 'Vào ca',
      shift_name: '15:00',
      time_str: fmtVn(recentMs),
      status: 'Hợp lệ',
      distance: 0,
      lat: 10.9760826,
      lng: 106.6646541,
      note: '',
      image_url: 'PENDING',
      sheet_synced: 1,
      created_at: recentMs,
    });
    checkinLogs.set('CHK_MISSING_RECON', {
      id: 'CHK_MISSING_RECON',
      username: 'nv_minh',
      fullname: 'Trần Văn Minh',
      check_type: 'Vào ca',
      shift_name: '15:00',
      time_str: fmtVn(recentMs + 60000),
      status: 'Hợp lệ',
      distance: 0,
      lat: 10.9760826,
      lng: 106.6646541,
      note: '',
      image_url: 'PENDING',
      sheet_synced: 1, // Simulates anomaly where D1 thought synced but row is missing in Sheet!
      created_at: recentMs + 60000,
    });

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init?: any) => {
      const body = JSON.parse(String(init?.body || '{}'));
      const out = gas.callDoPost(body);
      return new Response(JSON.stringify(out), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      const reconRes = await onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'RUN_D1_SHEET_RECONCILIATION',
            secret: 'kg-sync-sweeper-2026',
            hours: 48,
          }),
        }),
        env,
        waitUntil: () => {},
      });
      const reconJson: any = await reconRes.json();
      assert.equal(reconJson.ok, true);
      assert.equal(reconJson.data.checkedCount, 2);
      assert.equal(reconJson.data.missingBefore, 1);
      assert.equal(reconJson.data.healedCount, 1);
      assert.equal(reconJson.data.stillMissingCount, 0);
      assert.equal(auditLogs.length, 1);
      const sheetHasMinh = gas.sheetsData['✔️CHẤM CÔNG'].some((r) => String(r[7] || '').includes('CHK_MISSING_RECON'));
      assert.equal(sheetHasMinh, true, 'Reconciliation must self-heal missing row back into ✔️CHẤM CÔNG');
    } finally {
      globalThis.fetch = origFetch;
    }

    // Kiosk Fast Queue Mode contract check
    const scannerSrc = fs.readFileSync(path.join(ROOT, 'src/components/FastFaceScannerV2.tsx'), 'utf8');
    assert.ok(scannerSrc.includes('fastQueueModeRef.current ? 1800 : 6500'));
    assert.ok(scannerSrc.includes('sessionPunchCount'));
  });

  await t.test('Group 3 (#7, #8, #9): Dual Presence GPS + Restaurant Wi-Fi IP (CF-Connecting-IP) & Forgotten Checkout Reminder', async () => {
    resetEdgeMemoryStateForTests();
    const gas = createGasSandbox();
    const { env, kvCache } = createProEdgeEnv();

    // Configure Restaurant Wi-Fi IP allowlist in D1 sys:gps_config
    kvCache.set('sys:gps_config', {
      cache_key: 'sys:gps_config',
      action: 'GPS_CONFIG',
      payload_json: JSON.stringify({
        lat: 10.9760826,
        lng: 106.6646541,
        radius: 25,
        allowedWifiIps: ['113.161.72.45', '113.161.73.*'],
        wifiFallbackEnabled: true,
      }),
      updated_at: Date.now(),
      expires_at: Date.now() + 86400000,
    });

    // 1. GET_CLIENT_NETWORK_INFO hides allowedWifiIps for regular staff, reveals for admin
    const staffNetRes = await onRequest({
      request: new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '113.161.72.45' },
        body: JSON.stringify({ action: 'GET_CLIENT_NETWORK_INFO', role: 'user' }),
      }),
      env,
    });
    const staffNet: any = await staffNetRes.json();
    assert.equal(staffNet.data.isRestaurantWifi, true);
    assert.equal(staffNet.data.allowedWifiIps, undefined);

    const adminNetRes = await onRequest({
      request: new Request('https://kg-checkin.pages.dev/api', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '113.161.73.88' },
        body: JSON.stringify({ action: 'GET_CLIENT_NETWORK_INFO', role: 'admin' }),
      }),
      env,
    });
    const adminNet: any = await adminNetRes.json();
    assert.equal(adminNet.data.isRestaurantWifi, true);
    assert.equal(adminNet.data.allowedWifiIps.length, 2);

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: any, init?: any) => {
      const body = JSON.parse(String(init?.body || '{}'));
      const out = gas.callDoPost(body);
      return new Response(JSON.stringify(out), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      // 2. Indoor GPS drift (~110m away) ON Restaurant Wi-Fi IP -> PASSES Edge AND GAS!
      const waitTasks: Promise<any>[] = [];
      const wifiOkRes = await onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          headers: { 'CF-Connecting-IP': '113.161.72.45' },
          body: JSON.stringify({
            action: 'CHECK_IN_OUT',
            instantEdge: true,
            checkinId: 'CHK_WIFI_INDOOR_OK',
            username: 'nv_lan',
            fullname: 'Nguyễn Thị Lan',
            type: 'Vào ca',
            lat: 10.9770826, // ~111m north (indoor GPS drift)
            lng: 106.6646541,
            gpsAccuracy: 10,
            time: '28/11/2026 18:05:00',
            actualTime: '28/11/2026 18:05:00',
          }),
        }),
        env,
        waitUntil: (p: Promise<any>) => waitTasks.push(p),
      });
      const wifiOkJson: any = await wifiOkRes.json();
      assert.equal(wifiOkJson.ok, true, 'Restaurant Wi-Fi IP must rescue indoor GPS drift up to 350m');
      await Promise.all(waitTasks);
      assert.equal(gas.sheetsData['✔️CHẤM CÔNG'].length, 2, 'GAS must honor Edge-attested Wi-Fi presence and write row');

      // 3. Same 111m distance on EXTERNAL IP (not restaurant Wi-Fi) -> REJECTED!
      const extFailRes = await onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          headers: { 'CF-Connecting-IP': '8.8.8.8' },
          body: JSON.stringify({
            action: 'CHECK_IN_OUT',
            instantEdge: true,
            checkinId: 'CHK_EXT_FAIL',
            username: 'nv_minh',
            fullname: 'Trần Văn Minh',
            type: 'Vào ca',
            lat: 10.9770826,
            lng: 106.6646541,
            gpsAccuracy: 10,
            time: '28/11/2026 18:06:00',
          }),
        }),
        env,
        waitUntil: () => {},
      });
      const extFailJson: any = await extFailRes.json();
      assert.equal(extFailJson.ok, false);
      assert.equal(extFailJson.code, 'OUT_OF_RADIUS');

      // 4. Faraway spoof (>1km away) even if IP matches -> REJECTED (>350m indoor ceiling)!
      const farFailRes = await onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          headers: { 'CF-Connecting-IP': '113.161.72.45' },
          body: JSON.stringify({
            action: 'CHECK_IN_OUT',
            instantEdge: true,
            checkinId: 'CHK_FAR_FAIL',
            username: 'nv_minh',
            fullname: 'Trần Văn Minh',
            type: 'Vào ca',
            lat: 10.9960826, // ~2.2km away
            lng: 106.6646541,
            gpsAccuracy: 10,
            time: '28/11/2026 18:07:00',
          }),
        }),
        env,
        waitUntil: () => {},
      });
      const farFailJson: any = await farFailRes.json();
      assert.equal(farFailJson.ok, false);
      assert.equal(farFailJson.code, 'OUT_OF_RADIUS');
    } finally {
      globalThis.fetch = origFetch;
    }

    // 5. #9 Forgotten Checkout Reminder (detectOverdueOpenShift)
    assert.equal(estimateScheduledShiftEndMinutes('15:00-22:30'), 22 * 60 + 30);
    assert.equal(estimateScheduledShiftEndMinutes('15:00'), 22 * 60);
    assert.equal(estimateScheduledShiftEndMinutes('OFF'), null);

    // At 22:45 VN (only 15m past 22:30 end) -> NOT overdue yet
    const t2245 = Date.UTC(2026, 10, 28, 15, 45, 0); // 22:45 VN
    const notYet = detectOverdueOpenShift({
      todayShift: '15:00-22:30',
      todayLogs: [{ type: 'Vào ca', time: '28/11/2026 15:02:00' }],
      nowMs: t2245,
    });
    assert.equal(notYet, null);

    // At 23:20 VN (50m past 22:30 end) -> OVERDUE!
    const t2320 = Date.UTC(2026, 10, 28, 16, 20, 0); // 23:20 VN
    const overdue = detectOverdueOpenShift({
      todayShift: '15:00-22:30',
      todayLogs: [{ type: 'Vào ca', time: '28/11/2026 15:02:00' }],
      nowMs: t2320,
    });
    assert.ok(overdue);
    assert.equal(overdue.isOverdue, true);
    assert.equal(overdue.expectedEndStr, '22:30');
    assert.equal(overdue.overdueMinutes, 50);

    // Once Ra ca is recorded -> silent!
    const closed = detectOverdueOpenShift({
      todayShift: '15:00-22:30',
      todayLogs: [
        { type: 'Vào ca', time: '28/11/2026 15:02:00' },
        { type: 'Ra ca', time: '28/11/2026 22:35:00' },
      ],
      nowMs: t2320,
    });
    assert.equal(closed, null);
  });
});
