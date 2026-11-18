import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ViteDevServer } from 'vite';

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

function createQuotaTestHarness() {
  const kvStore = new Map<string, string>();
  let kvPutCalls = 0;
  let kvGetCalls = 0;
  let kvDeleteCalls = 0;

  const kv = {
    store: kvStore,
    get calls() {
      return { put: kvPutCalls, get: kvGetCalls, delete: kvDeleteCalls };
    },
    resetCounters() {
      kvPutCalls = 0;
      kvGetCalls = 0;
      kvDeleteCalls = 0;
    },
    async get(key: string, type?: string) {
      kvGetCalls += 1;
      const raw = kvStore.get(key) ?? null;
      if (raw === null) return null;
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) {
      kvPutCalls += 1;
      kvStore.set(key, String(value));
    },
    async delete(key: string) {
      kvDeleteCalls += 1;
      kvStore.delete(key);
    },
  };

  const d1KvCache = new Map<string, any>();
  const d1Schedules = new Map<string, any>();
  const d1FaceProfiles = new Map<string, any>();
  let d1CacheWrites = 0;
  let d1GpsWrites = 0;

  const prepare = (sql: string) => {
    const norm = sql.replace(/\s+/g, ' ').trim();
    const execRun = async (args: any[]) => {
      if (norm.includes('INSERT INTO edge_kv_cache')) {
        const key = String(args[0]);
        if (key === 'sys:gps_config') d1GpsWrites += 1;
        else d1CacheWrites += 1;
        d1KvCache.set(key, {
          cache_key: key,
          action: args[1],
          payload_json: args[2],
          updated_at: args[3],
          expires_at: args[4],
        });
      } else if (norm.includes('DELETE FROM edge_kv_cache')) {
        if (norm.includes('updated_at <')) {
          const cutoff = Number(args[0] || 0);
          for (const [k, v] of d1KvCache.entries()) {
            if (k.startsWith('cache:') && Number(v.updated_at) < cutoff) {
              d1KvCache.delete(k);
            }
          }
        } else if (args.length > 0) {
          for (const [k, v] of d1KvCache.entries()) {
            if (v.action === args[0]) d1KvCache.delete(k);
          }
        } else {
          for (const k of Array.from(d1KvCache.keys())) {
            if (k.startsWith('cache:')) d1KvCache.delete(k);
          }
        }
      } else if (norm.includes('INSERT INTO edge_schedules')) {
        d1Schedules.set(String(args[0]), {
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
      return { success: true };
    };

    const execFirst = async (args: any[]) => {
      if (norm.includes('FROM edge_kv_cache WHERE cache_key =')) {
        return d1KvCache.get(String(args[0])) ?? null;
      }
      return null;
    };

    const execAll = async (_args: any[]) => {
      if (norm.includes('FROM edge_face_profiles')) {
        return { results: Array.from(d1FaceProfiles.values()) };
      }
      return { results: [] };
    };

    return {
      bind: (...args: any[]) => ({
        run: () => execRun(args),
        first: () => execFirst(args),
        all: () => execAll(args),
        _bound: args,
      }),
      run: () => execRun([]),
      first: () => execFirst([]),
      all: () => execAll([]),
    };
  };

  const db = {
    prepare,
    batch: async (stmts: any[]) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };

  return {
    kv,
    db,
    d1KvCache,
    d1Schedules,
    get d1Stats() {
      return { cacheWrites: d1CacheWrites, gpsWrites: d1GpsWrites };
    },
    resetD1Stats() {
      d1CacheWrites = 0;
      d1GpsWrites = 0;
    },
  };
}

describe('Cloudflare KV & D1 Daily Quota Guard (kg-checkin Edge Gateway)', () => {
  test('1. Zero KV writes/reads when D1 is bound across GET_DATA, GET_FACE_PROFILES, GET_KIOSK_ATTENDANCE_STATE & REGISTER_SHIFT', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    if (typeof edgeMod.resetEdgeMemoryStateForTests === 'function') {
      edgeMod.resetEdgeMemoryStateForTests();
    }
    const h = createQuotaTestHarness();
    const pendingTasks: Promise<any>[] = [];
    const origFetch = globalThis.fetch;

    globalThis.fetch = (async (_url: any, init?: any) => {
      const p = JSON.parse(init.body);
      if (p.action === 'GET_DATA') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              users: [],
              gpsConfig: { lat: 10.9760327, lng: 106.6645922, radius: 25 },
            },
          })
        );
      }
      if (p.action === 'GET_FACE_PROFILES') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              profiles: [],
              gpsConfig: { lat: 10.9760327, lng: 106.6645922, radius: 25 },
            },
          })
        );
      }
      if (p.action === 'GET_KIOSK_ATTENDANCE_STATE') {
        return new Response(JSON.stringify({ ok: true, data: { logs: [] } }));
      }
      return new Response(JSON.stringify({ ok: true, data: { timestamp: '02/11/2026 21:00' } }));
    }) as any;

    try {
      const send = async (body: Record<string, any>) => {
        const res = await edgeMod.onRequest({
          request: new Request('https://kg-checkin.pages.dev/api', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          env: { DB: h.db, KG_EDGE_DB: h.kv },
          waitUntil: (p: Promise<any>) => pendingTasks.push(p),
        });
        await Promise.all(pendingTasks.splice(0));
        return res;
      };

      await send({ action: 'GET_DATA', username: 'nv01', role: 'user', _authToken: 'tok-1' });
      await send({
        action: 'GET_FACE_PROFILES',
        isKiosk: true,
        lat: 10.9760327,
        lng: 106.6645922,
        gpsAccuracy: 8,
        forceRefresh: true,
      });
      await send({
        action: 'GET_KIOSK_ATTENDANCE_STATE',
        isKiosk: true,
        lat: 10.976034,
        lng: 106.664591,
        gpsAccuracy: 10,
        forceRefresh: true,
      });
      await send({
        action: 'REGISTER_SHIFT',
        username: 'nv01',
        fullname: 'Nguyễn Văn A',
        monthSheet: 'Tháng 11/2026',
        weekLabel: '📅 TUẦN 02/11 - 08/11',
        shifts: ['Ca 1', 'Ca 1', 'OFF', 'Ca 2', 'Ca 2', 'Ca 1', 'Ca 1'],
      });

      assert.equal(h.kv.calls.put, 0, 'Must perform ZERO KV writes when D1 is bound');
      assert.equal(h.kv.calls.get, 0, 'Must perform ZERO KV reads when D1 is bound');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('2. Canonical edgeCacheKey ignores volatile _authToken/timestamp/GPS jitter while preserving strict user/role isolation & GAS failover', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    if (typeof edgeMod.resetEdgeMemoryStateForTests === 'function') {
      edgeMod.resetEdgeMemoryStateForTests();
    }
    const h = createQuotaTestHarness();
    const pendingTasks: Promise<any>[] = [];
    const origFetch = globalThis.fetch;
    let gasCalls = 0;
    let shouldFailGas = false;

    globalThis.fetch = (async (_url: any, init?: any) => {
      if (shouldFailGas) {
        throw new Error('GAS upstream timeout');
      }
      gasCalls += 1;
      const p = JSON.parse(init.body);
      if (p.action === 'GET_FACE_PROFILES') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              profiles: [{ username: 'hao', fullname: 'Nông Văn Hào', vectorsB64: 'AAAA', anglesCount: 5 }],
            },
          })
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            viewer: p.username,
            role: p.role,
            gpsConfig: { lat: 10.9760327, lng: 106.6645922, radius: 25 },
          },
        })
      );
    }) as any;

    try {
      const send = async (body: Record<string, any>) => {
        const res = await edgeMod.onRequest({
          request: new Request('https://kg-checkin.pages.dev/api', {
            method: 'POST',
            body: JSON.stringify(body),
          }),
          env: { DB: h.db, KG_EDGE_DB: h.kv },
          waitUntil: (p: Promise<any>) => pendingTasks.push(p),
        });
        await Promise.all(pendingTasks.splice(0));
        return res;
      };

      // First GET_DATA for nv01 -> MISS, populates D1 L2 cache & writes sys:gps_config once
      const r1 = await send({
        action: 'GET_DATA',
        username: 'nv01',
        role: 'user',
        _authToken: 'token-session-A',
        timestamp: 1700000001,
      });
      assert.equal(r1.headers.get('X-Proxy-Cache'), 'MISS');
      assert.equal(gasCalls, 1);
      assert.equal(h.d1Stats.gpsWrites, 1);

      // Second GET_DATA for SAME nv01 but DIFFERENT _authToken & timestamp -> MUST HIT cache!
      const r2 = await send({
        action: 'GET_DATA',
        username: 'nv01',
        role: 'user',
        _authToken: 'token-session-B',
        timestamp: 1700000099,
      });
      assert.equal(gasCalls, 1, 'Volatile _authToken/timestamp must NOT cause cache miss');
      const r2Json = await r2.json();
      assert.equal(r2Json.data.viewer, 'nv01');

      // Third GET_DATA for DIFFERENT user nv02 -> MUST NOT collide with nv01; and unchanged gpsConfig must NOT rewrite sys:gps_config!
      const r3 = await send({
        action: 'GET_DATA',
        username: 'nv02',
        role: 'user',
        _authToken: 'token-session-C',
      });
      assert.equal(gasCalls, 2, 'Different user must fetch isolated data');
      const r3Json = await r3.json();
      assert.equal(r3Json.data.viewer, 'nv02');
      assert.equal(h.d1Stats.gpsWrites, 1, 'Unchanged gpsConfig must NOT trigger redundant D1/KV writes');

      // Live biometric poll #1 with GPS (10.9760327, 106.6645922) -> live MISS + saves 1 canonical failover snapshot in D1
      const beforeBioWrites = h.d1Stats.cacheWrites;
      const fp1 = await send({
        action: 'GET_FACE_PROFILES',
        isKiosk: true,
        lat: 10.9760327,
        lng: 106.6645922,
        gpsAccuracy: 6,
        forceRefresh: true,
      });
      assert.equal(fp1.headers.get('X-Proxy-Cache'), 'MISS');
      assert.equal(h.d1Stats.cacheWrites - beforeBioWrites, 1);

      // Live biometric poll #2 25s later with drifted GPS (10.9760410, 106.6645880) -> still live from GAS, but D1 failover snapshot write is throttled!
      const fp2 = await send({
        action: 'GET_FACE_PROFILES',
        isKiosk: true,
        lat: 10.976041,
        lng: 106.664588,
        gpsAccuracy: 11,
        forceRefresh: true,
      });
      assert.equal(fp2.headers.get('X-Proxy-Cache'), 'MISS');
      assert.equal(h.d1Stats.cacheWrites - beforeBioWrites, 1, 'Repeated 25s biometric poll with unchanged data must throttle D1 snapshot writes');

      // GAS goes down -> Kiosk polls with a THIRD drifted GPS coordinate -> Failover MUST still match canonical snapshot!
      shouldFailGas = true;
      const fpFailover = await send({
        action: 'GET_FACE_PROFILES',
        isKiosk: true,
        lat: 10.976029,
        lng: 106.664599,
        gpsAccuracy: 9,
        forceRefresh: true,
      });
      assert.equal(fpFailover.headers.get('X-Proxy-Cache'), 'FAILOVER-EDGE-DB');
      const fpFailJson = await fpFailover.json();
      assert.equal(fpFailJson.ok, true);
      assert.equal(fpFailJson.data.profiles.length, 1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('3. KV-only fallback mode (when D1 is unbound) never writes non-cacheable live biometric or forceRefresh calls to KV', async () => {
    const edgeMod = await vite.ssrLoadModule('/functions/api.js');
    if (typeof edgeMod.resetEdgeMemoryStateForTests === 'function') {
      edgeMod.resetEdgeMemoryStateForTests();
    }
    const h = createQuotaTestHarness();
    const pendingTasks: Promise<any>[] = [];
    const origFetch = globalThis.fetch;

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, data: { profiles: [] } }))) as any;

    try {
      const res = await edgeMod.onRequest({
        request: new Request('https://kg-checkin.pages.dev/api', {
          method: 'POST',
          body: JSON.stringify({
            action: 'GET_FACE_PROFILES',
            isKiosk: false,
            username: 'nv01',
            forceRefresh: true,
          }),
        }),
        env: { KG_EDGE_DB: h.kv }, // D1 intentionally unbound
        waitUntil: (p: Promise<any>) => pendingTasks.push(p),
      });
      await Promise.all(pendingTasks.splice(0));
      assert.equal(res.status, 200);
      assert.equal(h.kv.calls.put, 0, 'Non-cacheable biometric reads must never burn KV write quota even without D1');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
