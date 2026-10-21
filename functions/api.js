// ============================================================================
// King's Grill Staff OS (kg-checkin) — Hybrid Edge Database & API Gateway
// Architecture:
//   - Cloudflare D1 (SQLite at Edge, binding: DB)
//   - Cloudflare KV (Key-Value at Edge, binding: KG_EDGE_DB)
//   - Cloudflare Cache API (L1 POP Cache)
//   - Google Apps Script & Google Sheets (Master Ledger & Backoffice Sync)
// ============================================================================

const TARGET_GAS_URL =
  'https://script.google.com/macros/s/AKfycbyQ4Y5cQ0BCHBlmzftWq0dPVP2qNgc-PaYMklh44raSX4hDOCIyFi0bV-G6QdUbb-3D/exec';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let d1SchemaInitialized = false;

export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method === 'GET') {
    const statusReport = await getEdgeDbStatus(env);
    return jsonResponse(statusReport, 200, { 'X-Edge-DB': 'STATUS' });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    const bodyText = await request.text();
    const payload = JSON.parse(bodyText);
    const action = String(payload.action || '').trim();

    // Ensure D1 tables exist (runs once per isolate cold start, <2ms)
    if (env?.DB && !d1SchemaInitialized) {
      await ensureD1Schema(env.DB);
      d1SchemaInitialized = true;
    }

    // Opportunistically drain any pending Google Sheets sync tasks in background
    if (env?.DB && action !== 'GET_EDGE_DB_STATUS') {
      context.waitUntil(drainEdgeSyncQueue(env, TARGET_GAS_URL));
    }

    // 1. Edge Database Health & Diagnostics Endpoint
    if (action === 'GET_EDGE_DB_STATUS') {
      const statusReport = await getEdgeDbStatus(env);
      return jsonResponse(statusReport, 200, { 'X-Edge-DB': 'STATUS' });
    }

    // 2. Ultra-Fast Write-Through for REGISTER_SHIFT (Concurrency Shield for 20-30 simultaneous staff)
    if (action === 'REGISTER_SHIFT') {
      return await handleRegisterShiftEdge(context, payload, bodyText);
    }

    // 3. Read Actions (GET_* & GEOCODE) with D1 Real-time Overlay + KV/D1 SWR + Failover
    const isReadAction = action.startsWith('GET_') || action === 'GEOCODE';
    const isCacheable =
      isReadAction && !payload.forceRefresh && !payload.noCache && !payload.cacheBuster;

    const hash = await sha256(bodyText);
    const edgeCacheKey = `cache:${action}:${hash}`;
    const cache = caches.default;
    const url = new URL(request.url);
    url.pathname = `/api/cache/${action}`;
    url.searchParams.set('h', hash);
    const popCacheReq = new Request(url.toString(), { method: 'GET' });

    if (isCacheable) {
      // L1: Check Cloudflare POP Cache (10s TTL)
      const popCached = await cache.match(popCacheReq);
      if (popCached) {
        try {
          const cachedJson = await popCached.clone().json();
          const overlaid = await applyD1Overlays(action, payload, cachedJson, env);
          return jsonResponse(overlaid, 200, {
            'X-Proxy-Cache': 'HIT-L1',
            'X-Edge-DB': env?.DB ? 'D1-OVERLAID' : 'NONE',
            'Cache-Control': 'public, max-age=10, s-maxage=10',
          });
        } catch {
          // Fall through if parse fails
        }
      }

      // L2: Check Cloudflare D1 / KV SWR Cache (30s fresh TTL)
      const l2Entry = await readEdgeCache(env, edgeCacheKey);
      if (l2Entry && l2Entry.expiresAt > Date.now()) {
        const overlaid = await applyD1Overlays(action, payload, l2Entry.data, env);
        // Trigger background revalidation if older than 12 seconds
        if (Date.now() - l2Entry.updatedAt > 12000) {
          context.waitUntil(
            revalidateFromGas(context, action, payload, bodyText, edgeCacheKey, popCacheReq)
          );
        }
        return jsonResponse(overlaid, 200, {
          'X-Proxy-Cache': 'HIT-L2-EDGE-DB',
          'X-Edge-DB': 'D1-KV-HIT',
          'Cache-Control': 'public, max-age=10, s-maxage=10',
        });
      }
    }

    // Fetch from Google Apps Script Master Backend
    let gasResult = null;
    let gasStatus = 200;
    try {
      const gasRes = await fetch(TARGET_GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: bodyText,
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(28000)
            : undefined,
      });
      gasStatus = gasRes.status;
      const responseText = await gasRes.text();
      gasResult = JSON.parse(responseText);
    } catch (fetchErr) {
      // Failover for Read Actions: Serve last known good snapshot from D1/KV if GAS timed out
      if (isReadAction) {
        const fallbackEntry = await readEdgeCache(env, edgeCacheKey, true);
        if (fallbackEntry?.data) {
          const overlaid = await applyD1Overlays(action, payload, fallbackEntry.data, env);
          return jsonResponse(overlaid, 200, {
            'X-Proxy-Cache': 'FAILOVER-EDGE-DB',
            'X-Edge-DB': 'D1-KV-FAILOVER',
            'Cache-Control': 'no-store',
          });
        }
      }
      throw fetchErr;
    }

    const isValidSuccess = Boolean(gasResult && gasResult.ok === true);

    // Handle post-write hooks for mutations (CHECK_IN, SAVE_ALL_SCHEDULES, etc.)
    if (!isReadAction && isValidSuccess) {
      context.waitUntil(handleMutationSideEffects(env, action, payload, gasResult));
    }

    // Apply real-time D1 overlays on read responses & store in L1/L2 caches
    if (isReadAction && isValidSuccess) {
      gasResult = await applyD1Overlays(action, payload, gasResult, env);
      const ttlMs = action === 'GET_DATA' ? 30000 : action === 'GET_ALL_SCHEDULES' ? 20000 : 45000;
      context.waitUntil(writeEdgeCache(env, edgeCacheKey, action, gasResult, ttlMs));

      if (isCacheable) {
        const l1Res = jsonResponse(gasResult, 200, {
          'X-Proxy-Cache': 'MISS',
          'X-Edge-DB': env?.DB ? 'D1-SYNCED' : 'NONE',
          'Cache-Control': 'public, max-age=10, s-maxage=10',
        });
        context.waitUntil(cache.put(popCacheReq, l1Res.clone()));
        return l1Res;
      }
    }

    return jsonResponse(gasResult, isValidSuccess ? 200 : gasStatus >= 400 ? gasStatus : 200, {
      'X-Proxy-Cache': 'MISS',
      'X-Edge-DB': env?.DB ? 'D1-ACTIVE' : 'NONE',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
  } catch (err) {
    return jsonResponse(
      { ok: false, message: err?.message || 'Internal Edge Gateway Error' },
      500,
      { 'X-Edge-DB': 'ERROR' }
    );
  }
}

// ============================================================================
// 1. D1 + KV Ultra-Fast Schedule Registration Handler (`REGISTER_SHIFT`)
// ============================================================================
async function handleRegisterShiftEdge(context, payload, bodyText) {
  const { env } = context;
  const username = String(payload.username || '').trim();
  const cleanUser = username.toLowerCase();
  const fullname = String(payload.fullname || '').trim();
  const monthSheet = String(payload.monthSheet || '').trim();
  const weekLabel = String(payload.weekLabel || '').trim();
  const shifts = Array.isArray(payload.shifts) ? payload.shifts : [];
  const offReason = String(payload.offReason || '').trim();

  if (!fullname || !monthSheet || !weekLabel || shifts.length !== 7) {
    return jsonResponse({ ok: false, message: 'Dữ liệu đăng ký ca không hợp lệ (cần đủ 7 ngày).' }, 400);
  }

  const scheduleId = `${monthSheet}|${weekLabel}|${cleanUser || fullname.toLowerCase()}`;
  const now = Date.now();
  const vnTimestamp = new Date(now + 7 * 3600 * 1000)
    .toISOString()
    .slice(11, 16);

  // Step 1: Write immediately to Cloudflare D1 & KV (<15ms)
  if (env?.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO edge_schedules (id, username, fullname, month_sheet, week_label, shifts_json, off_reason, status, sheet_synced, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'Chờ duyệt', 0, ?8)
         ON CONFLICT(id) DO UPDATE SET
           fullname = excluded.fullname,
           shifts_json = excluded.shifts_json,
           off_reason = excluded.off_reason,
           status = 'Chờ duyệt',
           sheet_synced = 0,
           updated_at = excluded.updated_at`
      )
        .bind(
          scheduleId,
          cleanUser,
          fullname,
          monthSheet,
          weekLabel,
          JSON.stringify(shifts),
          offReason,
          now
        )
        .run();
    } catch (e) {
      console.warn('[D1] edge_schedules upsert error:', e);
    }
  }

  if (env?.KG_EDGE_DB) {
    context.waitUntil(
      env.KG_EDGE_DB.put(
        `sched:${scheduleId}`,
        JSON.stringify({
          id: scheduleId,
          username: cleanUser,
          fullname,
          monthSheet,
          weekLabel,
          shifts,
          offReason,
          status: 'Chờ duyệt',
          updatedAt: now,
        }),
        { expirationTtl: 14 * 86400 }
      ).catch(() => {})
    );
  }

  // Step 2: Invalidate stale read caches in D1/KV
  context.waitUntil(invalidateEdgeReadCaches(env, ['GET_DATA', 'GET_ALL_SCHEDULES']));

  // Step 3: Forward to Google Apps Script with a fast foreground race (9.5s)
  // If GAS finishes within 9.5s, return GAS response directly.
  // If GAS is busy (e.g., 20 staff submitting at once), return instant D1 confirmation
  // and finish the GAS write reliably in context.waitUntil!
  const gasSyncPromise = syncScheduleToGasWithRetry(env, scheduleId, payload, bodyText);
  context.waitUntil(gasSyncPromise);

  const raceTimeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve({ timedOutToBackground: true }), 9500)
  );

  const raceOutcome = await Promise.race([gasSyncPromise, raceTimeoutPromise]);

  if (raceOutcome && !raceOutcome.timedOutToBackground && raceOutcome.gasResult) {
    const res = raceOutcome.gasResult;
    if (res.ok === false) {
      // Business rule rejection (e.g., employee suspended/inactive) -> rollback D1 entry
      if (env?.DB) {
        context.waitUntil(
          env.DB.prepare(`DELETE FROM edge_schedules WHERE id = ?1`).bind(scheduleId).run().catch(() => {})
        );
      }
      return jsonResponse(res, 200, { 'X-Edge-DB': 'D1-REJECTED-ROLLBACK' });
    }
    return jsonResponse(
      {
        ...res,
        ok: true,
        data: {
          ...(res.data || {}),
          sheetSaved: true,
          edgeSaved: true,
          shifts,
          weekLabel,
          monthSheet,
          timestamp: res.data?.timestamp || vnTimestamp,
        },
      },
      200,
      { 'X-Edge-DB': 'D1-WRITE-THROUGH-SYNCED' }
    );
  }

  // Instant response backed by Cloudflare D1 + background Google Sheets queue
  return jsonResponse(
    {
      ok: true,
      message: 'Đã ghi nhận lịch đăng ký ca thành công!',
      data: {
        sheetSaved: true,
        edgeSaved: true,
        queuedForSheet: true,
        shifts,
        weekLabel,
        monthSheet,
        timestamp: vnTimestamp,
      },
    },
    200,
    { 'X-Edge-DB': 'D1-INSTANT-BUFFERED' }
  );
}

async function syncScheduleToGasWithRetry(env, scheduleId, payload, bodyText) {
  const dedupeKey = `REGISTER_SHIFT:${scheduleId}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const gasRes = await fetch(TARGET_GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: bodyText,
        signal:
          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
            ? AbortSignal.timeout(26000)
            : undefined,
      });
      const text = await gasRes.text();
      const parsed = JSON.parse(text);

      if (parsed && parsed.ok === true) {
        if (env?.DB) {
          await env.DB.prepare(
            `UPDATE edge_schedules SET sheet_synced = 1, updated_at = ?1 WHERE id = ?2`
          )
            .bind(Date.now(), scheduleId)
            .run()
            .catch(() => {});
          await env.DB.prepare(`DELETE FROM edge_sync_queue WHERE dedupe_key = ?1`)
            .bind(dedupeKey)
            .run()
            .catch(() => {});
        }
        return { ok: true, gasResult: parsed };
      }

      // If rejected due to employment status, do not retry
      const errMsg = String(parsed?.message || parsed?.data?.message || '');
      if (errMsg.includes('trạng thái') || errMsg.includes('tạm khóa') || errMsg.includes('nghỉ việc')) {
        return { ok: false, gasResult: parsed };
      }
    } catch {
      // Transient timeout or network error -> retry after jitter
    }

    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 700 * attempt + Math.floor(Math.random() * 600)));
    }
  }

  // Enqueue into D1 persistent sync queue so the next request drains it to Google Sheets
  if (env?.DB) {
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO edge_sync_queue (dedupe_key, action, payload_json, attempts, status, created_at, updated_at)
       VALUES (?1, 'REGISTER_SHIFT', ?2, 1, 'pending', ?3, ?3)
       ON CONFLICT(dedupe_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         status = 'pending',
         updated_at = excluded.updated_at`
    )
      .bind(dedupeKey, JSON.stringify(payload), now)
      .run()
      .catch(() => {});
  }

  return { ok: false, queued: true };
}

// ============================================================================
// 2. Real-Time D1 Overlays on Read Responses (`GET_DATA`, `GET_ALL_SCHEDULES`)
// ============================================================================
async function applyD1Overlays(action, payload, resultObj, env) {
  if (!env?.DB || !resultObj || !resultObj.ok || !resultObj.data) {
    return resultObj;
  }

  try {
    if (action === 'GET_DATA') {
      const cloned = JSON.parse(JSON.stringify(resultObj));
      const data = cloned.data;
      const username = String(payload.username || '').trim().toLowerCase();
      const fullname = String(payload.fullname || '').trim();
      const monthSheet = String(payload.monthSheet || '').trim();
      const weekLabel = String(payload.weekLabel || '').trim();

      // 2.1 Overlay employee's registered schedule for target week from D1
      if (monthSheet && weekLabel && (username || fullname)) {
        const schedRow = await env.DB.prepare(
          `SELECT shifts_json, status, updated_at
           FROM edge_schedules
           WHERE month_sheet = ?1 AND week_label = ?2
             AND (username = ?3 OR lower(fullname) = ?4)
           LIMIT 1`
        )
          .bind(monthSheet, weekLabel, username, fullname.toLowerCase())
          .first();

        if (schedRow && schedRow.shifts_json) {
          const d1Shifts = JSON.parse(schedRow.shifts_json);
          if (Array.isArray(d1Shifts) && d1Shifts.length === 7) {
            data.isScheduleRegistered = true;
            // If GAS hasn't reflected the latest shifts yet, inject D1 shifts
            if (!Array.isArray(data.registeredShifts) || data.registeredShifts.length !== 7) {
              data.registeredShifts = d1Shifts;
            }
          }
        }
      }

      // 2.2 Overlay recent check-in logs (last 15 minutes) from D1 so logs are never stale
      const cutoff = Date.now() - 15 * 60 * 1000;
      const recentLogsRes = await env.DB.prepare(
        `SELECT fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url
         FROM edge_checkin_logs
         WHERE created_at >= ?1
         ORDER BY created_at DESC
         LIMIT 25`
      )
        .bind(cutoff)
        .all();

      if (recentLogsRes?.results?.length > 0 && Array.isArray(data.logs)) {
        const existingKeys = new Set(
          data.logs.map(
            (l) =>
              `${String(l.fullname || '').trim().toLowerCase()}|${String(l.time || '').replace(/^'/, '').trim()}`
          )
        );
        const missingLogs = [];
        for (const r of recentLogsRes.results) {
          const cleanTime = String(r.time_str || '').replace(/^'/, '').trim();
          const key = `${String(r.fullname || '').trim().toLowerCase()}|${cleanTime}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            missingLogs.push({
              time: r.time_str,
              fullname: r.fullname,
              type: r.check_type,
              shift: r.shift_name,
              status: r.status,
              distance: r.distance,
              lat: r.lat,
              lng: r.lng,
              note: r.note,
              image: r.image_url,
            });
          }
        }
        if (missingLogs.length > 0) {
          data.logs = [...missingLogs, ...data.logs];
        }
      }

      return cloned;
    }

    if (action === 'GET_ALL_SCHEDULES') {
      const monthSheet = String(payload.monthSheet || '').trim();
      const weekLabel = String(payload.weekLabel || '').trim();
      if (!monthSheet || !weekLabel) return resultObj;

      const d1RowsRes = await env.DB.prepare(
        `SELECT username, fullname, shifts_json, off_reason, status, sheet_synced, updated_at
         FROM edge_schedules
         WHERE month_sheet = ?1 AND week_label = ?2`
      )
        .bind(monthSheet, weekLabel)
        .all();

      if (!d1RowsRes?.results?.length) return resultObj;

      const cloned = JSON.parse(JSON.stringify(resultObj));
      const schedulesList = Array.isArray(cloned.data)
        ? cloned.data
        : Array.isArray(cloned.data?.schedules)
          ? cloned.data.schedules
          : null;

      if (!schedulesList) return resultObj;

      const d1ByNormName = new Map();
      for (const row of d1RowsRes.results) {
        d1ByNormName.set(String(row.fullname || '').trim().toLowerCase(), row);
      }

      for (const emp of schedulesList) {
        const normName = String(emp.fullname || '').trim().toLowerCase();
        const d1Match = d1ByNormName.get(normName);
        if (!d1Match) continue;

        const gasHasRegistration =
          emp.hasApproved ||
          emp.status === 'Chờ duyệt' ||
          (emp.status && String(emp.status).includes('duyệt')) ||
          (Array.isArray(emp.shifts) && emp.shifts.some((s) => s && s !== 'OFF' && s !== ''));

        // Overlay D1 shifts if GAS hasn't finished syncing or has no registration yet
        if (!gasHasRegistration || d1Match.sheet_synced === 0) {
          try {
            const parsedShifts = JSON.parse(d1Match.shifts_json);
            if (Array.isArray(parsedShifts) && parsedShifts.length === 7) {
              emp.shifts = parsedShifts;
              emp.status = emp.hasApproved ? emp.status : 'Chờ duyệt';
              if (d1Match.off_reason && !emp.reason) {
                emp.reason = d1Match.off_reason;
              }
            }
          } catch {}
        }
      }

      return cloned;
    }
  } catch (e) {
    console.warn('[D1 Overlay] non-fatal error:', e);
  }

  return resultObj;
}

// ============================================================================
// 3. Post-Mutation Side Effects & Cache Invalidation
// ============================================================================
async function handleMutationSideEffects(env, action, payload, gasResult) {
  if (!env?.DB) return;
  const now = Date.now();

  try {
    if (action === 'CHECK_IN') {
      const logId = `${payload.username || payload.fullname}_${now}`;
      const timeStr =
        gasResult?.data?.time ||
        payload.clientTime ||
        new Date(now + 7 * 3600 * 1000).toLocaleString('vi-VN');
      await env.DB.prepare(
        `INSERT OR REPLACE INTO edge_checkin_logs
         (id, username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, sheet_synced, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13)`
      )
        .bind(
          logId,
          String(payload.username || '').trim().toLowerCase(),
          String(payload.fullname || '').trim(),
          String(payload.type || 'Vào ca'),
          String(payload.shift || ''),
          String(timeStr),
          String(gasResult?.data?.status || payload.status || 'Hợp lệ'),
          Number(payload.distance || 0),
          payload.lat ?? null,
          payload.lng ?? null,
          String(payload.note || ''),
          String(gasResult?.data?.imageUrl || ''),
          now
        )
        .run();

      // Prune logs older than 7 days in D1 to keep DB ultra-compact
      await env.DB.prepare(`DELETE FROM edge_checkin_logs WHERE created_at < ?1`)
        .bind(now - 7 * 86400 * 1000)
        .run();
    }

    if (action === 'SAVE_ALL_SCHEDULES') {
      const monthSheet = String(payload.monthSheet || '').trim();
      const weekLabel = String(payload.weekLabel || '').trim();
      if (monthSheet && weekLabel) {
        await env.DB.prepare(
          `UPDATE edge_schedules SET status = 'Đã duyệt', sheet_synced = 1, updated_at = ?1
           WHERE month_sheet = ?2 AND week_label = ?3`
        )
          .bind(now, monthSheet, weekLabel)
          .run();
      }
    }

    // Invalidate cached read queries on any mutation
    await invalidateEdgeReadCaches(env);
  } catch (e) {
    console.warn('[D1 Mutation Hook] error:', e);
  }
}

// ============================================================================
// 4. L2 Edge Cache Helpers (Cloudflare D1 + KV)
// ============================================================================
async function readEdgeCache(env, cacheKey, allowExpired = false) {
  const now = Date.now();
  try {
    if (env?.DB) {
      const row = await env.DB.prepare(
        `SELECT payload_json, updated_at, expires_at FROM edge_kv_cache WHERE cache_key = ?1 LIMIT 1`
      )
        .bind(cacheKey)
        .first();
      if (row && (allowExpired || row.expires_at > now)) {
        return {
          data: JSON.parse(row.payload_json),
          updatedAt: row.updated_at,
          expiresAt: row.expires_at,
        };
      }
    }
    if (env?.KG_EDGE_DB) {
      const kvVal = await env.KG_EDGE_DB.get(cacheKey, 'json');
      if (kvVal && (allowExpired || kvVal.expiresAt > now)) {
        return kvVal;
      }
    }
  } catch {}
  return null;
}

async function writeEdgeCache(env, cacheKey, action, dataObj, ttlMs) {
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const payloadJson = JSON.stringify(dataObj);
  if (payloadJson.length > 900000) return; // Skip abnormally large payloads

  try {
    if (env?.DB) {
      await env.DB.prepare(
        `INSERT INTO edge_kv_cache (cache_key, action, payload_json, updated_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(cache_key) DO UPDATE SET
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at,
           expires_at = excluded.expires_at`
      )
        .bind(cacheKey, action, payloadJson, now, expiresAt)
        .run();
    }
    if (env?.KG_EDGE_DB) {
      await env.KG_EDGE_DB.put(
        cacheKey,
        JSON.stringify({ data: dataObj, updatedAt: now, expiresAt }),
        { expirationTtl: 86400 } // Keep 24h in KV for stale-if-error failover
      );
    }
  } catch {}
}

async function invalidateEdgeReadCaches(env, actions = null) {
  try {
    if (env?.DB) {
      if (Array.isArray(actions) && actions.length > 0) {
        for (const act of actions) {
          await env.DB.prepare(`DELETE FROM edge_kv_cache WHERE action = ?1`).bind(act).run();
        }
      } else {
        await env.DB.prepare(`DELETE FROM edge_kv_cache`).run();
      }
    }
  } catch {}
}

async function revalidateFromGas(context, action, payload, bodyText, edgeCacheKey, popCacheReq) {
  const { env } = context;
  try {
    const gasRes = await fetch(TARGET_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: bodyText,
      signal:
        typeof AbortSignal !== 'undefined' && AbortSignal.timeout
          ? AbortSignal.timeout(25000)
          : undefined,
    });
    if (!gasRes.ok) return;
    const parsed = await gasRes.json();
    if (parsed && parsed.ok === true) {
      const overlaid = await applyD1Overlays(action, payload, parsed, env);
      const ttlMs = action === 'GET_DATA' ? 30000 : 25000;
      await writeEdgeCache(env, edgeCacheKey, action, overlaid, ttlMs);
      const l1Res = jsonResponse(overlaid, 200, {
        'X-Proxy-Cache': 'REVALIDATED',
        'Cache-Control': 'public, max-age=10, s-maxage=10',
      });
      await caches.default.put(popCacheReq, l1Res);
    }
  } catch {}
}

// ============================================================================
// 5. Background Sync Queue Drain (`edge_sync_queue` -> Google Sheets)
// ============================================================================
async function drainEdgeSyncQueue(env, targetGasUrl) {
  if (!env?.DB) return;
  try {
    const pending = await env.DB.prepare(
      `SELECT id, dedupe_key, action, payload_json, attempts
       FROM edge_sync_queue
       WHERE status = 'pending' AND attempts < 8
       ORDER BY updated_at ASC
       LIMIT 3`
    ).all();

    if (!pending?.results?.length) return;

    for (const item of pending.results) {
      try {
        const payloadObj = JSON.parse(item.payload_json);
        const bodyStr = JSON.stringify({ action: item.action, ...payloadObj });
        const res = await fetch(targetGasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: bodyStr,
          signal:
            typeof AbortSignal !== 'undefined' && AbortSignal.timeout
              ? AbortSignal.timeout(25000)
              : undefined,
        });
        const parsed = await res.json();
        if (parsed && parsed.ok === true) {
          await env.DB.prepare(`DELETE FROM edge_sync_queue WHERE id = ?1`).bind(item.id).run();
          if (item.action === 'REGISTER_SHIFT' && String(item.dedupe_key || '').startsWith('REGISTER_SHIFT:')) {
            const schedId = item.dedupe_key.replace(/^REGISTER_SHIFT:/, '');
            await env.DB.prepare(
              `UPDATE edge_schedules SET sheet_synced = 1, updated_at = ?1 WHERE id = ?2`
            )
              .bind(Date.now(), schedId)
              .run();
          }
        } else {
          await env.DB.prepare(
            `UPDATE edge_sync_queue SET attempts = attempts + 1, last_error = ?1, updated_at = ?2 WHERE id = ?3`
          )
            .bind(String(parsed?.message || 'GAS returned ok=false'), Date.now(), item.id)
            .run();
        }
      } catch (err) {
        await env.DB.prepare(
          `UPDATE edge_sync_queue SET attempts = attempts + 1, last_error = ?1, updated_at = ?2 WHERE id = ?3`
        )
          .bind(String(err?.message || 'Fetch error'), Date.now(), item.id)
          .run();
      }
    }
  } catch {}
}

// ============================================================================
// 6. Schema Bootstrap & Health Diagnostics
// ============================================================================
async function ensureD1Schema(db) {
  try {
    await db.batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS edge_schedules (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          fullname TEXT NOT NULL,
          month_sheet TEXT NOT NULL,
          week_label TEXT NOT NULL,
          shifts_json TEXT NOT NULL,
          off_reason TEXT DEFAULT '',
          status TEXT DEFAULT 'Chờ duyệt',
          sheet_synced INTEGER DEFAULT 0,
          updated_at INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS edge_checkin_logs (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          fullname TEXT NOT NULL,
          check_type TEXT NOT NULL,
          shift_name TEXT DEFAULT '',
          time_str TEXT NOT NULL,
          status TEXT DEFAULT '',
          distance REAL DEFAULT 0,
          lat REAL,
          lng REAL,
          note TEXT DEFAULT '',
          image_url TEXT DEFAULT '',
          sheet_synced INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS edge_kv_cache (
          cache_key TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS edge_sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dedupe_key TEXT UNIQUE,
          action TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          attempts INTEGER DEFAULT 0,
          last_error TEXT DEFAULT '',
          status TEXT DEFAULT 'pending',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`
      ),
    ]);
  } catch (e) {
    console.warn('[D1 Schema Init] warning:', e);
  }
}

async function getEdgeDbStatus(env) {
  const status = {
    ok: true,
    engine: 'Cloudflare D1 (SQLite Edge) + Cloudflare KV + Google Sheets Master Sync',
    d1Bound: Boolean(env?.DB),
    kvBound: Boolean(env?.KG_EDGE_DB),
    region: 'APAC (Singapore Edge)',
    tables: {},
    timestamp: new Date().toISOString(),
  };

  if (env?.DB) {
    try {
      await ensureD1Schema(env.DB);
      const [schedCount, logCount, cacheCount, queueCount] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_schedules`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_checkin_logs`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_kv_cache`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_sync_queue WHERE status = 'pending'`).first(),
      ]);
      status.tables = {
        edge_schedules: schedCount?.c ?? 0,
        edge_checkin_logs: logCount?.c ?? 0,
        edge_kv_cache: cacheCount?.c ?? 0,
        edge_sync_queue_pending: queueCount?.c ?? 0,
      };
    } catch (e) {
      status.d1Error = e?.message;
    }
  }
  return status;
}

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
