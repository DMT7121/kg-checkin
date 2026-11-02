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
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ADMIN_ONLY_ACTIONS = new Set([
  'UPDATE_USER_ROLE',
  'UPDATE_USER_POSITION',
  'FORCE_RESET_PASSWORD',
  'UPDATE_EMPLOYMENT_STATUS',
  'SET_MASTER_PIN',
  'SYNC_KEYS',
  'UPDATE_AI_PROMPTS',
  'UPDATE_GPS_CONFIG',
  'UPDATE_ORG_CONFIG',
  'UPDATE_PAYROLL_CONFIG',
  'APPROVE_SCHEDULES',
  'SAVE_ALL_SCHEDULES',
  'APPROVE_SWAP',
  'APPROVE_ADVANCE',
  'ADD_BONUS_PENALTY',
  'DELETE_BONUS_PENALTY',
  'SAVE_OPS_CHECKLIST_CONFIG',
  'APPROVE_MISSED_CHECKIN',
  'REJECT_MISSED_CHECKIN',
  'UPDATE_MONTHLY_SALARY_CONFIG',
  'COPY_MONTHLY_SALARY_CONFIG',
  'REVIEW_SALARY_ADJUSTMENT',
  'SET_PAYROLL_WORKFLOW_STATUS',
  'GET_AUDIT_LOGS',
  'REPLY_FEEDBACK',
  'UPDATE_CHECKIN_TYPE',
  'REVIEW_HANDOVER',
  'UPDATE_INCIDENT',
]);

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
    const rawBodyText = await request.text();
    const payload = JSON.parse(rawBodyText);
    const action = String(payload.action || '').trim();

    // Verify optional Edge HMAC session token if present
    const authHeader = request.headers.get('Authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const rawToken = bearerToken || String(payload._authToken || '').trim();
    const verifiedSession = rawToken
      ? await verifyEdgeSessionToken(rawToken, getEdgeSecret(env))
      : null;

    // Enforce strict RBAC at Edge Gateway for privileged admin mutations
    if (ADMIN_ONLY_ACTIONS.has(action)) {
      if (rawToken) {
        if (!verifiedSession || verifiedSession.r !== 'admin') {
          return jsonResponse(
            { ok: false, message: 'Chỉ Quản trị viên (Admin) mới có quyền thực hiện thao tác này.' },
            403,
            { 'X-Edge-RBAC': 'DENIED-TOKEN' }
          );
        }
      } else {
        const declaredRole = String(payload.role || '').trim().toLowerCase();
        if (declaredRole !== 'admin') {
          return jsonResponse(
            { ok: false, message: 'Chỉ Quản trị viên (Admin) mới có quyền thực hiện thao tác này.' },
            403,
            { 'X-Edge-RBAC': 'DENIED-ROLE' }
          );
        }
      }
    }

    // Enforce true anonymity at Edge BEFORE forwarding to Google Apps Script
    let bodyText = rawBodyText;
    if (action === 'SUBMIT_FEEDBACK' && payload.isAnonymous) {
      payload.username = 'Anonymous';
      payload.fullname = 'Ẩn danh';
      delete payload.actorUsername;
      delete payload._authToken;
      bodyText = JSON.stringify(payload);
    }

    // Ensure D1 tables exist (runs once per isolate cold start, <2ms)
    if (env?.DB && !d1SchemaInitialized) {
      await ensureD1Schema(env.DB);
      d1SchemaInitialized = true;
    }

    // Enforce Payroll Lock Guard at Edge for salary config edits when D1 tracks a Locked month
    if (
      env?.DB &&
      (action === 'UPDATE_MONTHLY_SALARY_CONFIG' || action === 'COPY_MONTHLY_SALARY_CONFIG')
    ) {
      const targetMonth = normalizeEdgeMonthYm(
        action === 'COPY_MONTHLY_SALARY_CONFIG' ? payload.targetMonth : payload.month
      );
      const wfRow = await env.DB.prepare(
        `SELECT workflow_json FROM edge_payroll_workflow WHERE month = ?1 LIMIT 1`
      )
        .bind(targetMonth)
        .first()
        .catch(() => null);
      if (wfRow?.workflow_json) {
        try {
          const parsedWf = JSON.parse(wfRow.workflow_json);
          if (parsedWf?.status === 'Locked') {
            return jsonResponse(
              {
                ok: false,
                message: `Bảng lương tháng ${targetMonth} đã khóa sổ. Vui lòng mở khóa trước khi chỉnh sửa.`,
              },
              200
            );
          }
        } catch {}
      }
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

    // 1b. Server-side AI Chat Proxy (keeps Groq/Gemini API keys off client browsers)
    if (action === 'AI_CHAT' && env?.GROQ_API_KEY) {
      const edgeAiRes = await handleEdgeAiChat(payload, env.GROQ_API_KEY);
      if (edgeAiRes) {
        return jsonResponse(edgeAiRes, 200, { 'X-Edge-AI': 'GROQ-DIRECT' });
      }
    }

    // 2. Ultra-Fast Write-Through for REGISTER_SHIFT (Concurrency Shield for 20-30 simultaneous staff)
    if (action === 'REGISTER_SHIFT') {
      return await handleRegisterShiftEdge(context, payload, bodyText);
    }

    // 2b. Pre-merge concurrent checklist items in Edge D1 before forwarding to GAS
    let preMergedChecklistState = null;
    if (
      env?.DB &&
      (action === 'SAVE_OPS_CHECKLIST_STATE' || action === 'PATCH_OPS_CHECKLIST_ITEM')
    ) {
      preMergedChecklistState = await preMergeChecklistInD1(env.DB, action, payload);
      if (preMergedChecklistState) {
        if (action === 'SAVE_OPS_CHECKLIST_STATE') {
          payload.participants = preMergedChecklistState.participants;
          payload.items = preMergedChecklistState.items;
          payload.supply = preMergedChecklistState.supply;
          payload.signatures = preMergedChecklistState.signatures;
          bodyText = JSON.stringify(payload);
        }
      }
    }

    // 3. Read Actions (GET_* & GEOCODE) with D1 Real-time Overlay + KV/D1 SWR + Failover
    const isReadAction = action.startsWith('GET_') || action === 'GEOCODE';
    const isCacheable =
      isReadAction && !payload.forceRefresh && !payload.noCache && !payload.cacheBuster;

    const hash = await sha256(bodyText);
    const edgeCacheKey = `cache:${action}:${hash}`;
    const cache = typeof caches !== 'undefined' && caches?.default ? caches.default : null;
    const url = new URL(request.url);
    url.pathname = `/api/cache/${action}`;
    url.searchParams.set('h', hash);
    const popCacheReq = new Request(url.toString(), { method: 'GET' });

    if (isCacheable) {
      // L1: Check Cloudflare POP Cache (10s TTL)
      const popCached = cache ? await cache.match(popCacheReq) : null;
      if (popCached) {
        try {
          const cachedJson = await popCached.clone().json();
          const overlaid = await applyD1Overlays(action, payload, cachedJson, env, verifiedSession);
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
        const overlaid = await applyD1Overlays(action, payload, l2Entry.data, env, verifiedSession);
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

    // Backward-compatible Edge fulfillment when live GAS hasn't been clasp-pushed yet
    if (isUnknownGasAction(gasResult)) {
      const compatRes = await handleLegacyGasFallback(
        context,
        action,
        payload,
        preMergedChecklistState
      );
      if (compatRes) {
        gasResult = compatRes;
        gasStatus = 200;
      }
    }

    const isValidSuccess = Boolean(gasResult && gasResult.ok === true);

    // Enrich legacy GAS responses for Wave 2 actions so UI always receives structured fields
    if (isValidSuccess) {
      gasResult = enrichWave2MutationResponse(action, payload, gasResult, preMergedChecklistState);
    }

    // Issue Edge HMAC-SHA256 session token on successful LOGIN
    if (action === 'LOGIN' && isValidSuccess && gasResult?.data && typeof gasResult.data === 'object') {
      const loginUser = String(gasResult.data.username || payload.username || '').trim().toLowerCase();
      const loginRole = String(gasResult.data.role || 'user').trim().toLowerCase();
      gasResult.data.sessionToken = await signEdgeSessionToken(
        { u: loginUser, r: loginRole, exp: Date.now() + 7 * 86400 * 1000 },
        getEdgeSecret(env)
      );
    }

    // Handle post-write hooks for mutations (CHECK_IN_OUT, SAVE_ALL_SCHEDULES, Handover, Incidents, Checklist)
    if (!isReadAction && isValidSuccess) {
      context.waitUntil(
        handleMutationSideEffects(env, action, payload, gasResult, preMergedChecklistState)
      );
    }

    // Apply real-time D1 overlays on read responses & store in L1/L2 caches
    if (isReadAction && isValidSuccess) {
      gasResult = await applyD1Overlays(action, payload, gasResult, env, verifiedSession);
      const ttlMs = action === 'GET_DATA' ? 30000 : action === 'GET_ALL_SCHEDULES' ? 20000 : 45000;
      context.waitUntil(writeEdgeCache(env, edgeCacheKey, action, gasResult, ttlMs));

      if (isCacheable) {
        const l1Res = jsonResponse(gasResult, 200, {
          'X-Proxy-Cache': 'MISS',
          'X-Edge-DB': env?.DB ? 'D1-SYNCED' : 'NONE',
          'Cache-Control': 'public, max-age=10, s-maxage=10',
        });
        if (cache) {
          context.waitUntil(cache.put(popCacheReq, l1Res.clone()));
        }
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
function formatVietnamTimestampFromMs(ms) {
  const vn = new Date(Number(ms || Date.now()) + 7 * 3600 * 1000);
  const dd = String(vn.getUTCDate()).padStart(2, '0');
  const MM = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(vn.getUTCFullYear());
  const HH = String(vn.getUTCHours()).padStart(2, '0');
  const mm = String(vn.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${MM}/${yyyy} ${HH}:${mm}`;
}

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
  const vnTimestamp = formatVietnamTimestampFromMs(now);

  // Step 1: Write immediately to Cloudflare D1 & KV (<15ms) when bound
  let d1Persisted = false;
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
      d1Persisted = true;
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

  // Step 3: Forward synchronously to Google Apps Script (up to 24.5s matching GAS LockService 25s)
  // Guarantees direct write-through to Google Sheets whenever GAS is reachable.
  const gasSyncPromise = syncScheduleToGasWithRetry(env, scheduleId, payload, bodyText);
  context.waitUntil(gasSyncPromise);

  let raceTimerId = null;
  const raceTimeoutPromise = new Promise((resolve) => {
    raceTimerId = setTimeout(() => resolve({ timedOutToBackground: true }), 24500);
    if (raceTimerId && typeof raceTimerId.unref === 'function') {
      raceTimerId.unref();
    }
  });

  const raceOutcome = await Promise.race([gasSyncPromise, raceTimeoutPromise]);
  if (raceTimerId) clearTimeout(raceTimerId);

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
          edgeSaved: d1Persisted,
          queuedForSheet: false,
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

  // If D1 is NOT bound/persisted, NEVER claim success when GAS failed — return explicit error so client retries!
  if (!d1Persisted) {
    return jsonResponse(
      {
        ok: false,
        code: 'SHEET_SYNC_FAILED',
        message: 'Máy chủ Google Sheets đang bận hoặc gián đoạn kết nối. Vui lòng nhấn Gửi lại để nạp lịch vào Sheet.',
      },
      503,
      { 'X-Edge-DB': 'NO-D1-GAS-FAILED' }
    );
  }

  // Buffered safely in Cloudflare D1 + edge_sync_queue, honestly reporting sheetSaved: false until drained to Sheet
  return jsonResponse(
    {
      ok: true,
      message: 'Đã lưu lịch vào bộ đệm an toàn và đang đồng bộ lên Google Sheets...',
      data: {
        sheetSaved: false,
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

function foldEdgePersonName(val) {
  if (!val) return '';
  return String(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/^┗\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractYmFromVietnamTime(timeStr) {
  const clean = String(timeStr || '').replace(/^'/, '').trim();
  const dmy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(parseInt(dmy[2], 10)).padStart(2, '0')}`;
  }
  const iso = clean.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (iso) {
    return `${iso[1]}-${iso[2]}`;
  }
  return '';
}

// ============================================================================
// 2. Real-Time D1 Overlays on Read Responses (`GET_DATA`, `GET_CHECKIN_LOGS`, `GET_ALL_SCHEDULES`)
// ============================================================================
async function applyD1Overlays(action, payload, resultObj, env, verifiedSession = null) {
  if (!resultObj || !resultObj.ok || !resultObj.data) {
    return resultObj;
  }

  const effectiveRole = verifiedSession?.r
    ? String(verifiedSession.r).trim().toLowerCase()
    : String(payload.role || '').trim().toLowerCase();
  const isStrictlyAdmin = effectiveRole === 'admin';

  // Always strip sensitive server API keys from non-admin GET_DATA responses, even when D1 is unbound
  if (action === 'GET_DATA' && !isStrictlyAdmin && Array.isArray(resultObj.data.keys) && resultObj.data.keys.length > 0 && !env?.DB) {
    const clonedNoDb = JSON.parse(JSON.stringify(resultObj));
    clonedNoDb.data.keys = [];
    return clonedNoDb;
  }

  if (!env?.DB) {
    return resultObj;
  }

  try {
    if (action === 'GET_DATA') {
      const cloned = JSON.parse(JSON.stringify(resultObj));
      const data = cloned.data;
      if (!isStrictlyAdmin) {
        data.keys = [];
      }
      const username = String(payload.username || '').trim().toLowerCase();
      const fullname = String(payload.fullname || '').trim();
      const monthSheet = String(payload.monthSheet || '').trim();
      const weekLabel = String(payload.weekLabel || '').trim();

      // 2.1 Overlay employee's registered schedule for target week from D1
      if (monthSheet && weekLabel && (username || fullname)) {
        const sheetAlreadyRegistered = Boolean(data.isScheduleRegistered);
        const schedRow = await env.DB.prepare(
          `SELECT shifts_json, off_reason, status, sheet_synced, updated_at
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
            data.scheduleSheetSynced = sheetAlreadyRegistered || Number(schedRow.sheet_synced) === 1;
            if (!data.scheduleUpdatedAt && schedRow.updated_at) {
              data.scheduleUpdatedAt = formatVietnamTimestampFromMs(schedRow.updated_at);
            }
            if (!data.scheduleOffReason && schedRow.off_reason) {
              data.scheduleOffReason = schedRow.off_reason;
            }
            // If GAS hasn't reflected the latest shifts yet, inject D1 shifts
            if (!Array.isArray(data.registeredShifts) || data.registeredShifts.length !== 7) {
              data.registeredShifts = d1Shifts;
            }
          }
        }
      }

      // 2.2 Overlay recent check-in logs (last 24 hours) from D1 so logs are never stale
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const recentLogsRes = await env.DB.prepare(
        `SELECT username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, created_at
         FROM edge_checkin_logs
         WHERE created_at >= ?1
         ORDER BY created_at DESC
         LIMIT 250`
      )
        .bind(cutoff)
        .all();

      if (recentLogsRes?.results?.length > 0 && Array.isArray(data.logs)) {
        const foldedCaller = foldEdgePersonName(fullname);
        const existingKeys = new Set(
          data.logs.map(
            (l) =>
              `${foldEdgePersonName(l.fullname)}|${String(l.time || '').replace(/^'/, '').trim()}|${String(l.type || '').trim().toLowerCase()}`
          )
        );
        const missingLogs = [];
        for (const r of recentLogsRes.results) {
          const rowUser = String(r.username || '').trim().toLowerCase();
          const rowFoldedName = foldEdgePersonName(r.fullname);
          // Non-admin staff must ONLY see their own check-in GPS & selfie logs
          if (!isStrictlyAdmin) {
            const matchesUser = username && rowUser && rowUser === username;
            const matchesName = foldedCaller && rowFoldedName && rowFoldedName === foldedCaller;
            if (!matchesUser && !matchesName) {
              continue;
            }
          }
          const cleanTime = String(r.time_str || '').replace(/^'/, '').trim();
          const cleanType = String(r.check_type || '').trim().toLowerCase();
          const key = `${rowFoldedName}|${cleanTime}|${cleanType}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            missingLogs.push({
              username: r.username,
              time: r.time_str,
              fullname: r.fullname,
              type: r.check_type,
              shift: r.shift_name,
              status: r.status,
              distance: r.distance !== undefined && r.distance !== null ? `${r.distance}m` : '',
              lat: r.lat,
              lng: r.lng,
              note: r.note,
              image: r.image_url,
              timestamp: Number(r.created_at || Date.now()),
            });
          }
        }
        if (missingLogs.length > 0) {
          data.logs = [...missingLogs, ...data.logs];
        }
      }

      return cloned;
    }

    if (action === 'GET_CHECKIN_LOGS') {
      const cloned = JSON.parse(JSON.stringify(resultObj));
      const data = cloned.data || {};
      const baseLogs = Array.isArray(data.logs) ? data.logs : [];
      const callerUser = String(payload.username || '').trim().toLowerCase();
      const foldedCaller = foldEdgePersonName(payload.fullname || '');
      const reqUser = String(payload.targetUsername || '').trim();
      const reqName = String(payload.targetFullname || '').trim();
      const requestedMonth = String(payload.month || 'ALL').trim();

      const filterAllUsers =
        isStrictlyAdmin && (!reqUser || reqUser === 'ALL') && (!reqName || reqName === 'ALL');
      const targetUser = isStrictlyAdmin
        ? reqUser && reqUser !== 'ALL'
          ? reqUser.toLowerCase()
          : ''
        : callerUser;
      const foldedTarget = isStrictlyAdmin
        ? reqName && reqName !== 'ALL'
          ? foldEdgePersonName(reqName)
          : ''
        : foldedCaller;

      const cutoff7d = Date.now() - 7 * 86400 * 1000;
      const d1LogsRes = await env.DB.prepare(
        `SELECT username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, created_at
         FROM edge_checkin_logs
         WHERE created_at >= ?1
         ORDER BY created_at DESC
         LIMIT 500`
      )
        .bind(cutoff7d)
        .all();

      if (d1LogsRes?.results?.length > 0) {
        const existingKeys = new Set(
          baseLogs.map(
            (l) =>
              `${foldEdgePersonName(l.fullname)}|${String(l.time || '').replace(/^'/, '').trim()}|${String(l.type || '').trim().toLowerCase()}`
          )
        );
        const monthsSet = new Set(Array.isArray(data.availableMonths) ? data.availableMonths : []);
        const missingLogs = [];

        for (const r of d1LogsRes.results) {
          const rowUser = String(r.username || '').trim().toLowerCase();
          const rowFolded = foldEdgePersonName(r.fullname);
          if (!filterAllUsers) {
            const mUser = targetUser && rowUser && rowUser === targetUser;
            const mName = foldedTarget && rowFolded && rowFolded === foldedTarget;
            if (!mUser && !mName) continue;
          }

          const cleanTime = String(r.time_str || '').replace(/^'/, '').trim();
          const ym = extractYmFromVietnamTime(cleanTime);
          if (ym) monthsSet.add(ym);
          if (requestedMonth && requestedMonth !== 'ALL' && ym && ym !== requestedMonth) {
            continue;
          }

          const cleanType = String(r.check_type || '').trim().toLowerCase();
          const key = `${rowFolded}|${cleanTime}|${cleanType}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            missingLogs.push({
              username: r.username,
              time: r.time_str,
              fullname: r.fullname,
              type: r.check_type,
              shift: r.shift_name,
              status: r.status,
              distance: r.distance !== undefined && r.distance !== null ? `${r.distance}m` : '',
              lat: r.lat,
              lng: r.lng,
              note: r.note,
              image: r.image_url,
              timestamp: Number(r.created_at || Date.now()),
            });
          }
        }

        if (missingLogs.length > 0) {
          const merged = [...missingLogs, ...baseLogs];
          merged.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
          data.logs = merged;
          data.totalCount = merged.length;
          data.availableMonths = Array.from(monthsSet).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
          let totalCheckIn = 0;
          let totalCheckOut = 0;
          let validCount = 0;
          for (const item of merged) {
            const tLower = String(item.type || '').toLowerCase();
            if (tLower.includes('vào ca') || tLower === 'in') totalCheckIn++;
            else totalCheckOut++;
            const sUpper = String(item.status || '').toUpperCase();
            if (sUpper.includes('HỢP LỆ') && !sUpper.includes('KHÔNG')) validCount++;
          }
          data.stats = {
            totalPunches: merged.length,
            totalCheckIn,
            totalCheckOut,
            validCount,
          };
        }
      }

      cloned.data = data;
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

    if (action === 'GET_HANDOVERS') {
      const hoRowsRes = await env.DB.prepare(
        `SELECT id, record_json, updated_at FROM edge_handovers ORDER BY updated_at DESC LIMIT 60`
      ).all();
      if (!hoRowsRes?.results?.length) return resultObj;

      const cloned = JSON.parse(JSON.stringify(resultObj));
      const gasHandovers = Array.isArray(cloned.data?.handovers) ? cloned.data.handovers : [];
      const d1ById = new Map();
      const d1BySignature = new Map();
      for (const row of hoRowsRes.results) {
        try {
          const rec = JSON.parse(row.record_json);
          if (rec?.id) d1ById.set(String(rec.id), rec);
          const sig = `${String(rec?.username || '').toLowerCase()}|${String(rec?.shift || '')}|${String(rec?.cashAmount || '')}`;
          if (!d1BySignature.has(sig)) d1BySignature.set(sig, rec);
        } catch {}
      }

      const matchedD1Ids = new Set();
      const mergedList = gasHandovers.map((h) => {
        const sig = `${String(h?.username || '').toLowerCase()}|${String(h?.shift || '')}|${String(h?.cashAmount || '')}`;
        const d1Rec = d1ById.get(String(h?.id || '')) || d1BySignature.get(sig);
        if (!d1Rec) return h;
        matchedD1Ids.add(String(d1Rec.id));
        return {
          ...d1Rec,
          ...h,
          openingCash: h.openingCash !== undefined ? h.openingCash : d1Rec.openingCash,
          posCashRevenue: h.posCashRevenue !== undefined ? h.posCashRevenue : d1Rec.posCashRevenue,
          cashExpense: h.cashExpense !== undefined ? h.cashExpense : d1Rec.cashExpense,
          expectedCash: h.expectedCash !== undefined ? h.expectedCash : d1Rec.expectedCash,
          closingCash: h.closingCash !== undefined ? h.closingCash : d1Rec.closingCash,
          discrepancy: h.discrepancy !== undefined ? h.discrepancy : d1Rec.discrepancy,
          reconcileStatus:
            d1Rec.reconcileStatus === 'ManagerConfirmed' || d1Rec.reconcileStatus === 'Disputed'
              ? d1Rec.reconcileStatus
              : h.reconcileStatus || d1Rec.reconcileStatus,
          ackBy: h.ackBy || d1Rec.ackBy || '',
          ackAt: h.ackAt || d1Rec.ackAt || '',
          ackStatus: d1Rec.ackStatus || h.ackStatus || '',
          ackNote: d1Rec.ackNote || h.ackNote || '',
          countedCash: d1Rec.countedCash !== undefined ? d1Rec.countedCash : h.countedCash,
          managerBy: d1Rec.managerBy || h.managerBy || '',
          managerAt: d1Rec.managerAt || h.managerAt || '',
          managerNote: d1Rec.managerNote || h.managerNote || '',
        };
      });

      for (const row of hoRowsRes.results) {
        try {
          const rec = JSON.parse(row.record_json);
          if (rec?.id && !matchedD1Ids.has(String(rec.id)) && String(rec.id).startsWith('HO_EDGE_')) {
            mergedList.unshift(rec);
          }
        } catch {}
      }

      cloned.data.handovers = mergedList.slice(0, 40);
      return cloned;
    }

    if (action === 'GET_INCIDENTS') {
      const incRowsRes = await env.DB.prepare(
        `SELECT id, record_json, updated_at FROM edge_incidents ORDER BY updated_at DESC LIMIT 100`
      ).all();
      if (!incRowsRes?.results?.length) return resultObj;

      const cloned = JSON.parse(JSON.stringify(resultObj));
      const gasIncidents = Array.isArray(cloned.data?.incidents) ? cloned.data.incidents : [];
      const d1ById = new Map();
      const d1BySig = new Map();
      for (const row of incRowsRes.results) {
        try {
          const rec = JSON.parse(row.record_json);
          if (rec?.id) d1ById.set(String(rec.id), rec);
          const sig = `${String(rec?.username || '').toLowerCase()}|${String(rec?.description || '').trim()}`;
          if (!d1BySig.has(sig)) d1BySig.set(sig, rec);
        } catch {}
      }

      const matchedIds = new Set();
      const mergedIncidents = gasIncidents.map((inc) => {
        const sig = `${String(inc?.username || '').toLowerCase()}|${String(inc?.description || '').trim()}`;
        const d1Rec = d1ById.get(String(inc?.id || '')) || d1BySig.get(sig);
        if (!d1Rec) return inc;
        matchedIds.add(String(d1Rec.id));
        return {
          ...inc,
          ...d1Rec,
          id: inc.id || d1Rec.id,
        };
      });

      for (const row of incRowsRes.results) {
        try {
          const rec = JSON.parse(row.record_json);
          if (rec?.id && !matchedIds.has(String(rec.id))) {
            mergedIncidents.unshift(rec);
          }
        } catch {}
      }

      cloned.data.incidents = mergedIncidents.slice(0, 80);
      cloned.data.summary = computeIncidentSummaryEdge(cloned.data.incidents);
      return cloned;
    }

    if (action === 'GET_OPS_CHECKLIST_INIT') {
      const dateStr = String(payload.dateStr || resultObj.data?.date || '').trim();
      if (!dateStr) return resultObj;
      const clRowsRes = await env.DB.prepare(
        `SELECT area, state_json FROM edge_ops_checklist WHERE date_str = ?1`
      )
        .bind(dateStr)
        .all();
      if (!clRowsRes?.results?.length) return resultObj;

      const cloned = JSON.parse(JSON.stringify(resultObj));
      if (!cloned.data.states || typeof cloned.data.states !== 'object') {
        cloned.data.states = {};
      }
      for (const row of clRowsRes.results) {
        try {
          const d1State = JSON.parse(row.state_json);
          const area = String(row.area || 'A');
          cloned.data.states[area] = mergeEdgeChecklistState(cloned.data.states[area], d1State);
        } catch {}
      }
      return cloned;
    }

    if (action === 'GET_PAYROLL') {
      const targetMonth = normalizeEdgeMonthYm(payload.month, payload.year);
      const wfRow = await env.DB.prepare(
        `SELECT workflow_json FROM edge_payroll_workflow WHERE month = ?1 LIMIT 1`
      )
        .bind(targetMonth)
        .first();
      if (!wfRow?.workflow_json && resultObj.data?.workflow) {
        return resultObj;
      }

      const cloned = JSON.parse(JSON.stringify(resultObj));
      const gasWf = cloned.data?.workflow || {
        month: targetMonth,
        status: 'Draft',
        confirmations: {},
      };
      let d1Wf = null;
      if (wfRow?.workflow_json) {
        try {
          d1Wf = JSON.parse(wfRow.workflow_json);
        } catch {}
      }

      const mergedConfirmations = {
        ...(gasWf.confirmations || {}),
        ...(d1Wf?.confirmations || {}),
      };
      const mergedStatus = d1Wf?.status || gasWf.status || 'Draft';
      const callerUser = String(payload.username || '').trim();
      const scopedConfirmations = isStrictlyAdmin
        ? mergedConfirmations
        : callerUser && mergedConfirmations[callerUser]
          ? { [callerUser]: mergedConfirmations[callerUser] }
          : {};

      cloned.data.workflow = {
        month: targetMonth,
        status: mergedStatus,
        updatedBy: d1Wf?.updatedBy || gasWf.updatedBy || '',
        updatedAt: d1Wf?.updatedAt || gasWf.updatedAt || '',
        note: d1Wf?.note ?? gasWf.note ?? '',
        confirmations: scopedConfirmations,
      };
      return cloned;
    }

    if (action === 'GET_AUDIT_LOGS') {
      const auditRes = await env.DB.prepare(
        `SELECT id, actor, action, target, summary, record_json, created_at FROM edge_audit_logs ORDER BY created_at DESC LIMIT 80`
      ).all();
      if (!auditRes?.results?.length) return resultObj;

      const cloned = JSON.parse(JSON.stringify(resultObj));
      const gasLogs = Array.isArray(cloned.data?.logs) ? cloned.data.logs : [];
      const seenSigs = new Set(
        gasLogs.map((l) => `${String(l.action || '')}|${String(l.actor || '')}|${String(l.target || '')}`)
      );
      const actionFilter = payload.actionFilter
        ? String(payload.actionFilter).trim().toUpperCase()
        : '';
      const query = payload.query ? String(payload.query).trim().toLowerCase() : '';
      const extraLogs = [];

      for (const r of auditRes.results) {
        try {
          const rec = JSON.parse(r.record_json);
          const act = String(rec.action || r.action || '');
          if (actionFilter && actionFilter !== 'ALL' && act.toUpperCase() !== actionFilter) continue;
          const hay = `${rec.actor || ''} ${act} ${rec.target || ''} ${rec.summary || ''}`.toLowerCase();
          if (query && !hay.includes(query)) continue;
          const sig = `${act}|${String(rec.actor || '')}|${String(rec.target || '')}`;
          if (!seenSigs.has(sig)) {
            seenSigs.add(sig);
            extraLogs.push(rec);
          }
        } catch {}
      }

      const limit = Math.min(200, Math.max(1, Number(payload.limit) || 50));
      cloned.data.logs = [...extraLogs, ...gasLogs].slice(0, limit);
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
async function handleMutationSideEffects(
  env,
  action,
  payload,
  gasResult,
  preMergedChecklistState = null
) {
  if (!env?.DB) return;
  const now = Date.now();

  try {
    if (action === 'CHECK_IN' || action === 'CHECK_IN_OUT') {
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

    if (action === 'SAVE_ALL_SCHEDULES' || action === 'APPROVE_SCHEDULES') {
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

    if (
      action === 'SUBMIT_HANDOVER' ||
      action === 'ACKNOWLEDGE_HANDOVER' ||
      action === 'REVIEW_HANDOVER'
    ) {
      await persistHandoverMutationInD1(env.DB, action, payload, gasResult, now);
    }

    if (action === 'SUBMIT_INCIDENT' || action === 'UPDATE_INCIDENT') {
      await persistIncidentMutationInD1(env.DB, action, payload, gasResult, now);
    }

    if (action === 'SAVE_OPS_CHECKLIST_STATE' || action === 'PATCH_OPS_CHECKLIST_ITEM') {
      const dateStr = String(payload.dateStr || gasResult?.data?.date || '').trim();
      const area = String(payload.area || gasResult?.data?.area || 'A').trim();
      const finalState = gasResult?.data?.state
        ? mergeEdgeChecklistState(preMergedChecklistState, gasResult.data.state)
        : preMergedChecklistState;
      if (dateStr && area && finalState) {
        await env.DB.prepare(
          `INSERT INTO edge_ops_checklist (id, date_str, area, state_json, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(id) DO UPDATE SET
             state_json = excluded.state_json,
             updated_at = excluded.updated_at`
        )
          .bind(`${dateStr}|${area}`, dateStr, area, JSON.stringify(finalState), now)
          .run();
      }
    }

    if (action === 'SET_PAYROLL_WORKFLOW_STATUS' || action === 'CONFIRM_PAYROLL_SLIP') {
      await persistPayrollWorkflowMutationInD1(env.DB, action, payload, gasResult, now);
    }

    if (ADMIN_ONLY_ACTIONS.has(action) && action !== 'GET_AUDIT_LOGS') {
      await appendEdgeAuditLogInD1(env.DB, action, payload, now);
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
      if (typeof caches !== 'undefined' && caches?.default) {
        await caches.default.put(popCacheReq, l1Res);
      }
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
       WHERE status = 'pending' AND attempts < 30
       ORDER BY updated_at ASC
       LIMIT 5`
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
      db.prepare(
        `CREATE TABLE IF NOT EXISTS edge_ops_checklist (
          id TEXT PRIMARY KEY,
          date_str TEXT NOT NULL,
          area TEXT NOT NULL,
          state_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS edge_handovers (
          id TEXT PRIMARY KEY,
          record_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS edge_incidents (
          id TEXT PRIMARY KEY,
          record_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS edge_payroll_workflow (
          month TEXT PRIMARY KEY,
          workflow_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS edge_audit_logs (
          id TEXT PRIMARY KEY,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          target TEXT DEFAULT '',
          summary TEXT DEFAULT '',
          record_json TEXT NOT NULL,
          created_at INTEGER NOT NULL
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
      const [
        schedCount,
        logCount,
        cacheCount,
        queueCount,
        clCount,
        hoCount,
        incCount,
        wfCount,
        audCount,
      ] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_schedules`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_checkin_logs`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_kv_cache`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_sync_queue WHERE status = 'pending'`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_ops_checklist`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_handovers`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_incidents`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_payroll_workflow`).first(),
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_audit_logs`).first(),
      ]);
      status.tables = {
        edge_schedules: schedCount?.c ?? 0,
        edge_checkin_logs: logCount?.c ?? 0,
        edge_kv_cache: cacheCount?.c ?? 0,
        edge_sync_queue_pending: queueCount?.c ?? 0,
        edge_ops_checklist: clCount?.c ?? 0,
        edge_handovers: hoCount?.c ?? 0,
        edge_incidents: incCount?.c ?? 0,
        edge_payroll_workflow: wfCount?.c ?? 0,
        edge_audit_logs: audCount?.c ?? 0,
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

function getEdgeSecret(env) {
  return String(
    env?.SESSION_SECRET ||
      env?.EDGE_SESSION_SECRET ||
      `kg-edge-hmac-v1:${TARGET_GAS_URL}`
  );
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function signEdgeSessionToken(claims, secret) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(claims));
  const payloadB64 = bytesToBase64Url(payloadBytes);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = bytesToBase64Url(new Uint8Array(sigBuf));
  return `${payloadB64}.${sigB64}`;
}

async function verifyEdgeSessionToken(token, secret) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = base64UrlToBytes(sigB64);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64)));
    if (!decoded || typeof decoded !== 'object') return null;
    if (decoded.exp && Number(decoded.exp) < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function handleEdgeAiChat(payload, groqApiKey) {
  try {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (messages.length === 0) return null;
    const model = String(payload.model || 'llama-3.3-70b-versatile');
    const temperature = typeof payload.temperature === 'number' ? payload.temperature : 0.5;
    const maxTokens = typeof payload.max_tokens === 'number' ? payload.max_tokens : 1024;

    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (payload.response_format) {
      body.response_format = payload.response_format;
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    if (!content) return null;
    return { ok: true, data: { reply: content, provider: 'edge-groq' } };
  } catch {
    return null;
  }
}

// ============================================================================
// 7. Wave 2 F&B Operations Edge Helpers (2-Way Cash, 4-State Incidents, Checklist Merge)
// ============================================================================
function parseEdgeVnd(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : 0;
  if (!raw) return 0;
  const trimmed = String(raw).trim();
  const isNeg = trimmed.startsWith('-');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return 0;
  const parsed = parseInt(digits, 10);
  if (!Number.isFinite(parsed)) return 0;
  return isNeg ? -Math.round(parsed) : Math.round(parsed);
}

function isUnknownGasAction(gasResult) {
  if (!gasResult || gasResult.ok !== false) return false;
  const msg = String(gasResult.message || gasResult.error || '').toLowerCase();
  return (
    msg.includes('unknown action') ||
    msg.includes('không hỗ trợ action') ||
    msg.includes('invalid action')
  );
}

function computeIncidentSummaryEdge(incidents) {
  const list = Array.isArray(incidents) ? incidents : [];
  let open = 0;
  let investigating = 0;
  let resolved = 0;
  let costRecorded = 0;
  let totalRepairCost = 0;

  for (const item of list) {
    const st = String(item?.status || 'Open');
    if (st === 'Investigating') investigating++;
    else if (st === 'Resolved') resolved++;
    else if (st === 'CostRecorded') costRecorded++;
    else open++;
    totalRepairCost += Math.max(0, parseEdgeVnd(item?.repairCost));
  }

  return {
    total: list.length,
    open,
    investigating,
    resolved,
    costRecorded,
    totalRepairCost: Math.round(totalRepairCost),
  };
}

function parseIsoMsEdge(iso) {
  if (!iso) return 0;
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? t : 0;
}

function mergeEdgeChecklistItem(existing, incoming, isExplicitDelta) {
  if (!existing) {
    return {
      checked: Boolean(incoming?.checked),
      note: String(incoming?.note ?? ''),
      subchecks: { ...(incoming?.subchecks || {}) },
      by: incoming?.by || '',
      at: incoming?.at || new Date().toISOString(),
    };
  }
  const exMs = parseIsoMsEdge(existing.at);
  const inMs = parseIsoMsEdge(incoming?.at);
  const incomingNewer = isExplicitDelta || inMs >= exMs;
  const mergedSub = { ...(existing.subchecks || {}) };
  if (incoming?.subchecks && typeof incoming.subchecks === 'object') {
    for (const [k, v] of Object.entries(incoming.subchecks)) {
      if (incomingNewer || mergedSub[k] === undefined) {
        mergedSub[k] = Boolean(v);
      }
    }
  }
  return {
    checked:
      incomingNewer && incoming?.checked !== undefined
        ? Boolean(incoming.checked)
        : Boolean(existing.checked),
    note:
      incomingNewer && incoming?.note !== undefined && (incoming.note !== '' || isExplicitDelta)
        ? String(incoming.note)
        : String(existing.note || ''),
    subchecks: mergedSub,
    by: (incomingNewer && incoming?.by) || existing.by || '',
    at: inMs >= exMs ? incoming?.at || existing.at : existing.at,
  };
}

function mergeEdgeChecklistState(existingRaw, patch) {
  const existing = {
    participants: Array.isArray(existingRaw?.participants) ? [...existingRaw.participants] : [],
    items: existingRaw?.items && typeof existingRaw.items === 'object' ? { ...existingRaw.items } : {},
    supply: existingRaw?.supply && typeof existingRaw.supply === 'object' ? { ...existingRaw.supply } : {},
    signatures:
      existingRaw?.signatures && typeof existingRaw.signatures === 'object'
        ? { ...existingRaw.signatures }
        : {},
  };
  if (!patch || typeof patch !== 'object') return existing;

  const removed = new Set(Array.isArray(patch.removedParticipantKeys) ? patch.removedParticipantKeys : []);
  const pMap = new Map();
  const seenNames = new Set();
  for (const p of existing.participants) {
    if (!p || removed.has(p.key)) continue;
    pMap.set(p.key, p);
    if (p.name) seenNames.add(String(p.name).trim().toLowerCase());
  }
  if (Array.isArray(patch.participants)) {
    for (const p of patch.participants) {
      if (!p || removed.has(p.key)) continue;
      const n = String(p.name || '').trim().toLowerCase();
      if (!pMap.has(p.key) && (!n || !seenNames.has(n))) {
        pMap.set(p.key, p);
        if (n) seenNames.add(n);
      }
    }
  }

  const mergedItems = { ...existing.items };
  if (patch.deltaItems && typeof patch.deltaItems === 'object') {
    for (const [id, upd] of Object.entries(patch.deltaItems)) {
      if (!upd || id.startsWith('_')) continue;
      mergedItems[id] = mergeEdgeChecklistItem(mergedItems[id], upd, true);
    }
  } else if (patch.items && typeof patch.items === 'object') {
    for (const [id, upd] of Object.entries(patch.items)) {
      if (!upd || id.startsWith('_')) continue;
      mergedItems[id] = mergeEdgeChecklistItem(mergedItems[id], upd, false);
    }
  }

  const mergedSupply = { ...existing.supply };
  if (patch.supply && typeof patch.supply === 'object') {
    for (const [k, v] of Object.entries(patch.supply)) {
      if (k === 'note') {
        if (typeof v === 'string' && v.trim() !== '') mergedSupply.note = v;
        else if (!mergedSupply.note && typeof v === 'string') mergedSupply.note = v;
      } else if (v !== undefined) {
        mergedSupply[k] = v;
      }
    }
  }

  const mergedSignatures = { ...existing.signatures };
  if (patch.deltaSignatures && typeof patch.deltaSignatures === 'object') {
    for (const k of ['receive', 'handover', 'manager']) {
      if (patch.deltaSignatures[k] !== undefined) mergedSignatures[k] = patch.deltaSignatures[k];
    }
  } else if (patch.signatures && typeof patch.signatures === 'object') {
    for (const k of ['receive', 'handover', 'manager']) {
      const val = patch.signatures[k];
      if (typeof val === 'string' && val.trim() !== '') mergedSignatures[k] = val;
    }
  }

  return {
    participants: Array.from(pMap.values()),
    items: mergedItems,
    supply: mergedSupply,
    signatures: mergedSignatures,
    savedAt: new Date().toISOString(),
  };
}

async function preMergeChecklistInD1(db, action, payload) {
  try {
    const dateStr = String(payload.dateStr || '').trim();
    const area = String(payload.area || 'A').trim();
    if (!dateStr || !area) return null;

    const id = `${dateStr}|${area}`;
    const existingRow = await db
      .prepare(`SELECT state_json FROM edge_ops_checklist WHERE id = ?1 LIMIT 1`)
      .bind(id)
      .first();
    const existingState = existingRow?.state_json ? JSON.parse(existingRow.state_json) : null;

    let patch = payload;
    if (action === 'PATCH_OPS_CHECKLIST_ITEM' && payload.itemId) {
      patch = {
        participants: payload.participants,
        deltaItems: {
          [String(payload.itemId)]: {
            checked: payload.checked,
            note: payload.note,
            subchecks: payload.subchecks,
            by: payload.by || payload.fullname || payload.username || '',
            at: payload.at || new Date().toISOString(),
          },
        },
      };
    }

    const merged = mergeEdgeChecklistState(existingState, patch);
    await db
      .prepare(
        `INSERT INTO edge_ops_checklist (id, date_str, area, state_json, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = excluded.updated_at`
      )
      .bind(id, dateStr, area, JSON.stringify(merged), Date.now())
      .run();

    return merged;
  } catch (e) {
    console.warn('[D1 Checklist PreMerge] warning:', e);
    return null;
  }
}

function buildHandoverRecordFromPayload(payload, gasData = {}, now = Date.now()) {
  const openingCash = Math.max(0, parseEdgeVnd(gasData.openingCash ?? payload.openingCash));
  const posCashRevenue = Math.max(0, parseEdgeVnd(gasData.posCashRevenue ?? payload.posCashRevenue));
  const cashExpense = Math.max(0, parseEdgeVnd(gasData.cashExpense ?? payload.cashExpense));
  const closingCash = Math.max(
    0,
    parseEdgeVnd(gasData.closingCash ?? payload.closingCash ?? payload.cashAmount)
  );
  const expectedCash =
    gasData.expectedCash !== undefined
      ? parseEdgeVnd(gasData.expectedCash)
      : Math.round(openingCash + posCashRevenue - cashExpense);
  const discrepancy =
    gasData.discrepancy !== undefined
      ? parseEdgeVnd(gasData.discrepancy)
      : Math.round(closingCash - expectedCash);
  const vnTime = formatVietnamTimestampFromMs(now);

  return {
    id: String(gasData.id || payload.id || `HO_EDGE_${now}`),
    date: String(gasData.date || vnTime.slice(0, 10)),
    shift: String(payload.shift || gasData.shift || 'Ca chung'),
    username: String(payload.username || gasData.username || ''),
    fullname: String(payload.fullname || gasData.fullname || payload.username || ''),
    cashAmount: String(payload.cashAmount || closingCash.toLocaleString('vi-VN')),
    openingCash,
    posCashRevenue,
    cashExpense,
    expectedCash,
    closingCash,
    discrepancy,
    reconcileStatus: String(
      gasData.reconcileStatus || (discrepancy === 0 ? 'Matched' : 'Pending')
    ),
    note: String(payload.note || gasData.note || ''),
    timestamp: String(gasData.timestamp || vnTime),
    ackBy: '',
    ackAt: '',
    ackStatus: '',
    ackNote: '',
  };
}

async function persistHandoverMutationInD1(db, action, payload, gasResult, now) {
  if (action === 'SUBMIT_HANDOVER') {
    const rec = buildHandoverRecordFromPayload(payload, gasResult?.data || {}, now);
    await db
      .prepare(
        `INSERT INTO edge_handovers (id, record_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, updated_at = excluded.updated_at`
      )
      .bind(rec.id, JSON.stringify(rec), now)
      .run();
    return;
  }

  const handoverId = String(payload.handoverId || '').trim();
  if (!handoverId) return;
  const existingRow = await db
    .prepare(`SELECT record_json FROM edge_handovers WHERE id = ?1 LIMIT 1`)
    .bind(handoverId)
    .first();
  const base = existingRow?.record_json ? JSON.parse(existingRow.record_json) : { id: handoverId };
  const vnTime = formatVietnamTimestampFromMs(now);

  if (action === 'ACKNOWLEDGE_HANDOVER') {
    const ackStatus = payload.ackStatus === 'Disputed' ? 'Disputed' : 'Accepted';
    const updated = {
      ...base,
      ackBy: String(payload.ackBy || payload.fullname || payload.username || ''),
      ackAt: vnTime,
      ackStatus,
      ackNote: String(payload.ackNote || ''),
      countedCash:
        payload.countedCash !== undefined ? parseEdgeVnd(payload.countedCash) : base.countedCash,
      reconcileStatus: ackStatus === 'Disputed' ? 'Disputed' : base.reconcileStatus || 'Matched',
    };
    await db
      .prepare(
        `INSERT INTO edge_handovers (id, record_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, updated_at = excluded.updated_at`
      )
      .bind(handoverId, JSON.stringify(updated), now)
      .run();
  } else if (action === 'REVIEW_HANDOVER') {
    const decision = String(payload.decision || 'CONFIRM').toUpperCase();
    const updated = {
      ...base,
      reconcileStatus: decision === 'DISPUTE' ? 'Disputed' : 'ManagerConfirmed',
      managerBy: String(payload.actorFullname || payload.actorUsername || 'Quản lý'),
      managerAt: vnTime,
      managerNote: String(payload.managerNote || ''),
    };
    await db
      .prepare(
        `INSERT INTO edge_handovers (id, record_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, updated_at = excluded.updated_at`
      )
      .bind(handoverId, JSON.stringify(updated), now)
      .run();
  }
}

async function persistIncidentMutationInD1(db, action, payload, gasResult, now) {
  const vnTime = formatVietnamTimestampFromMs(now);
  if (action === 'SUBMIT_INCIDENT') {
    const rec = {
      id: String(gasResult?.data?.id || payload.id || `INC_EDGE_${now}`),
      date: String(gasResult?.data?.date || vnTime.slice(0, 10)),
      shift: String(payload.shift || 'Ca chung'),
      area: String(payload.area || 'Toàn quán'),
      severity: String(payload.severity || 'normal'),
      username: String(payload.username || ''),
      fullname: String(payload.fullname || payload.username || ''),
      category: String(payload.category || 'Khác'),
      description: String(payload.description || ''),
      photoUrl: String(payload.photoUrl || ''),
      status: 'Open',
      assignedTo: '',
      resolutionNote: '',
      repairCost: 0,
      updatedBy: '',
      updatedAt: vnTime,
      timestamp: vnTime,
    };
    await db
      .prepare(
        `INSERT INTO edge_incidents (id, record_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, updated_at = excluded.updated_at`
      )
      .bind(rec.id, JSON.stringify(rec), now)
      .run();
    return;
  }

  if (action === 'UPDATE_INCIDENT') {
    const incidentId = String(payload.incidentId || '').trim();
    if (!incidentId) return;
    const existingRow = await db
      .prepare(`SELECT record_json FROM edge_incidents WHERE id = ?1 LIMIT 1`)
      .bind(incidentId)
      .first();
    const base = existingRow?.record_json
      ? JSON.parse(existingRow.record_json)
      : { id: incidentId, category: payload.category || 'Sự cố', description: payload.description || '' };
    const updated = {
      ...base,
      status: String(payload.status || base.status || 'Investigating'),
      assignedTo:
        payload.assignedTo !== undefined ? String(payload.assignedTo) : base.assignedTo || '',
      resolutionNote:
        payload.resolutionNote !== undefined
          ? String(payload.resolutionNote)
          : base.resolutionNote || '',
      repairCost:
        payload.repairCost !== undefined
          ? Math.max(0, parseEdgeVnd(payload.repairCost))
          : Math.max(0, parseEdgeVnd(base.repairCost)),
      updatedBy: String(payload.actorFullname || payload.actorUsername || 'Quản lý'),
      updatedAt: vnTime,
    };
    await db
      .prepare(
        `INSERT INTO edge_incidents (id, record_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json, updated_at = excluded.updated_at`
      )
      .bind(incidentId, JSON.stringify(updated), now)
      .run();
  }
}

function enrichWave2MutationResponse(action, payload, gasResult, preMergedChecklistState) {
  if (!gasResult || gasResult.ok !== true) return gasResult;
  const now = Date.now();

  if (action === 'SUBMIT_HANDOVER') {
    const rich = buildHandoverRecordFromPayload(payload, gasResult.data || {}, now);
    return {
      ...gasResult,
      data: {
        ...rich,
        ...(gasResult.data || {}),
      },
    };
  }

  if (action === 'SUBMIT_INCIDENT' && (!gasResult.data || !gasResult.data.id)) {
    const vnTime = formatVietnamTimestampFromMs(now);
    return {
      ...gasResult,
      data: {
        id: String(payload.id || `INC_EDGE_${now}`),
        date: vnTime.slice(0, 10),
        status: 'Open',
        ...(gasResult.data || {}),
      },
    };
  }

  if (
    (action === 'SAVE_OPS_CHECKLIST_STATE' || action === 'PATCH_OPS_CHECKLIST_ITEM') &&
    preMergedChecklistState &&
    !gasResult.data?.state
  ) {
    return {
      ...gasResult,
      data: {
        ...(gasResult.data || {}),
        state: preMergedChecklistState,
      },
    };
  }

  return gasResult;
}

async function handleLegacyGasFallback(context, action, payload, preMergedChecklistState) {
  const { env } = context;
  const now = Date.now();
  const vnTime = formatVietnamTimestampFromMs(now);

  if (action === 'GET_CHECKIN_LOGS') {
    try {
      const legacyBody = JSON.stringify({
        action: 'GET_DATA',
        username: payload.username,
        fullname: payload.fullname,
        role: payload.role,
        forceRefresh: Boolean(payload.forceRefresh),
      });
      const fallbackGasRes = await fetch(TARGET_GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: legacyBody,
      });
      const fallbackParsed = await fallbackGasRes.json();
      if (fallbackParsed?.ok && Array.isArray(fallbackParsed?.data?.logs)) {
        const isAdmin = String(payload.role || '').trim().toLowerCase() === 'admin';
        const callerFolded = foldEdgePersonName(payload.fullname || '');
        const callerUser = String(payload.username || '').trim().toLowerCase();
        const reqName = String(payload.targetFullname || '').trim();
        const reqUser = String(payload.targetUsername || '').trim().toLowerCase();
        const reqMonth = String(payload.month || 'ALL').trim();

        const monthsSet = new Set();
        const filtered = fallbackParsed.data.logs.filter((l) => {
          const ym = extractYmFromVietnamTime(l.time);
          if (ym) monthsSet.add(ym);
          if (!isAdmin) {
            const lf = foldEdgePersonName(l.fullname);
            const lu = String(l.username || '').trim().toLowerCase();
            if (lf !== callerFolded && (!callerUser || lu !== callerUser)) return false;
          } else if ((reqName && reqName !== 'ALL') || (reqUser && reqUser !== 'all')) {
            const lf = foldEdgePersonName(l.fullname);
            const lu = String(l.username || '').trim().toLowerCase();
            const matchN = reqName && reqName !== 'ALL' && lf === foldEdgePersonName(reqName);
            const matchU = reqUser && reqUser !== 'all' && lu === reqUser;
            if (!matchN && !matchU) return false;
          }
          if (reqMonth && reqMonth !== 'ALL' && ym && ym !== reqMonth) return false;
          return true;
        });

        return {
          ok: true,
          data: {
            logs: filtered,
            totalCount: filtered.length,
            availableMonths: Array.from(monthsSet).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)),
            stats: {
              totalPunches: filtered.length,
              totalCheckIn: filtered.filter((l) => String(l.type || '').toLowerCase().includes('vào ca')).length,
              totalCheckOut: filtered.filter((l) => !String(l.type || '').toLowerCase().includes('vào ca')).length,
              validCount: filtered.filter((l) => String(l.status || '').toUpperCase().includes('HỢP LỆ')).length,
            },
          },
        };
      }
    } catch {}
  }

  if (action === 'GET_INCIDENTS') {
    const incidents = [];
    if (env?.DB) {
      const rows = await env.DB.prepare(
        `SELECT record_json FROM edge_incidents ORDER BY updated_at DESC LIMIT 80`
      ).all();
      for (const r of rows?.results || []) {
        try {
          incidents.push(JSON.parse(r.record_json));
        } catch {}
      }
    }
    return {
      ok: true,
      data: {
        incidents,
        summary: computeIncidentSummaryEdge(incidents),
      },
    };
  }

  if (action === 'UPDATE_INCIDENT') {
    const incidentId = String(payload.incidentId || '').trim();
    if (!incidentId) {
      return { ok: false, message: 'Thiếu mã sự cố (incidentId).' };
    }
    if (env?.DB) {
      await persistIncidentMutationInD1(env.DB, 'UPDATE_INCIDENT', payload, null, now);
    }
    return {
      ok: true,
      message: 'Đã cập nhật tiến độ xử lý sự cố!',
      data: {
        id: incidentId,
        status: String(payload.status || 'Investigating'),
        assignedTo: String(payload.assignedTo || ''),
        resolutionNote: String(payload.resolutionNote || ''),
        repairCost: Math.max(0, parseEdgeVnd(payload.repairCost)),
        updatedAt: vnTime,
      },
    };
  }

  if (action === 'REVIEW_HANDOVER') {
    const handoverId = String(payload.handoverId || '').trim();
    if (!handoverId) {
      return { ok: false, message: 'Thiếu mã bàn giao két (handoverId).' };
    }
    if (env?.DB) {
      await persistHandoverMutationInD1(env.DB, 'REVIEW_HANDOVER', payload, null, now);
    }
    const decision = String(payload.decision || 'CONFIRM').toUpperCase();
    return {
      ok: true,
      message:
        decision === 'DISPUTE'
          ? 'Đã đánh dấu yêu cầu thu ngân giải trình lại két!'
          : 'Đã duyệt chốt đối soát két sắt!',
      data: {
        id: handoverId,
        reconcileStatus: decision === 'DISPUTE' ? 'Disputed' : 'ManagerConfirmed',
        managerNote: String(payload.managerNote || ''),
        managerAt: vnTime,
      },
    };
  }

  if (action === 'PATCH_OPS_CHECKLIST_ITEM') {
    // Forward merged state to legacy GAS using SAVE_OPS_CHECKLIST_STATE so Google Sheets stays in sync
    const mergedState =
      preMergedChecklistState ||
      mergeEdgeChecklistState(null, {
        participants: payload.participants,
        deltaItems: payload.itemId
          ? {
              [String(payload.itemId)]: {
                checked: payload.checked,
                note: payload.note,
                subchecks: payload.subchecks,
                by: payload.by || payload.fullname || payload.username || '',
                at: payload.at || new Date().toISOString(),
              },
            }
          : {},
      });
    try {
      const legacyBody = JSON.stringify({
        action: 'SAVE_OPS_CHECKLIST_STATE',
        dateStr: payload.dateStr,
        area: payload.area || 'A',
        username: payload.username,
        fullname: payload.fullname,
        participants: mergedState.participants,
        items: mergedState.items,
        supply: mergedState.supply,
        signatures: mergedState.signatures,
      });
      const fallbackGasRes = await fetch(TARGET_GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: legacyBody,
      });
      const fallbackParsed = await fallbackGasRes.json();
      if (fallbackParsed && fallbackParsed.ok === true) {
        return {
          ok: true,
          data: {
            ...(fallbackParsed.data || {}),
            state: mergedState,
          },
        };
      }
    } catch {}
    if (env?.DB && preMergedChecklistState) {
      return {
        ok: true,
        data: { state: preMergedChecklistState },
      };
    }
  }

  if (action === 'SET_PAYROLL_WORKFLOW_STATUS') {
    const month = normalizeEdgeMonthYm(payload.month, payload.year);
    const nextStatus = normalizeEdgePayrollStatus(payload.status);
    let savedWf = {
      month,
      status: nextStatus,
      updatedBy: String(payload.actorUsername || payload.username || 'admin'),
      updatedAt: vnTime,
      note: String(payload.note || ''),
      confirmations: {},
    };
    if (env?.DB) {
      savedWf = await persistPayrollWorkflowMutationInD1(env.DB, action, payload, null, now);
    }
    return {
      ok: true,
      message: `Đã cập nhật trạng thái bảng lương ${month} sang ${nextStatus}.`,
      data: { workflow: savedWf },
    };
  }

  if (action === 'CONFIRM_PAYROLL_SLIP') {
    const uname = String(payload.username || '').trim();
    if (!uname) {
      return { ok: false, message: 'Thiếu tài khoản nhân viên.' };
    }
    const decision = String(payload.decision || 'CONFIRMED').toUpperCase() === 'DISPUTED' ? 'DISPUTED' : 'CONFIRMED';
    const note = String(payload.note || '').trim();
    if (decision === 'DISPUTED' && !note) {
      return { ok: false, message: 'Vui lòng ghi rõ nội dung sai lệch công/lương để Quản lý đối soát.' };
    }
    const month = normalizeEdgeMonthYm(payload.month, payload.year);
    if (env?.DB) {
      const existingRow = await env.DB.prepare(
        `SELECT workflow_json FROM edge_payroll_workflow WHERE month = ?1 LIMIT 1`
      )
        .bind(month)
        .first();
      if (existingRow?.workflow_json) {
        try {
          const ex = JSON.parse(existingRow.workflow_json);
          if (ex?.status === 'Locked') {
            return {
              ok: false,
              message: `Bảng lương tháng ${month} đã khóa sổ nên không thể thay đổi xác nhận.`,
            };
          }
        } catch {}
      }
      const savedWf = await persistPayrollWorkflowMutationInD1(env.DB, action, payload, null, now);
      return {
        ok: true,
        message:
          decision === 'DISPUTED'
            ? 'Đã gửi khiếu nại bảng lương tới Quản lý!'
            : 'Đã xác nhận phiếu lương thành công!',
        data: {
          workflow: {
            ...savedWf,
            confirmations: payload.role === 'admin' ? savedWf.confirmations : { [uname]: savedWf.confirmations[uname] },
          },
        },
      };
    }
    return {
      ok: true,
      message: 'Đã ghi nhận xác nhận phiếu lương!',
      data: {
        workflow: {
          month,
          status: decision === 'DISPUTED' ? 'Disputed' : 'Staff_Confirming',
          updatedAt: vnTime,
          confirmations: { [uname]: { status: decision, note, fullname: String(payload.fullname || uname), updatedAt: vnTime } },
        },
      },
    };
  }

  if (action === 'GET_AUDIT_LOGS') {
    const logs = [];
    if (env?.DB) {
      const rows = await env.DB.prepare(
        `SELECT record_json FROM edge_audit_logs ORDER BY created_at DESC LIMIT 80`
      ).all();
      const actionFilter = payload.actionFilter
        ? String(payload.actionFilter).trim().toUpperCase()
        : '';
      const query = payload.query ? String(payload.query).trim().toLowerCase() : '';
      for (const r of rows?.results || []) {
        try {
          const rec = JSON.parse(r.record_json);
          const act = String(rec.action || '');
          if (actionFilter && actionFilter !== 'ALL' && act.toUpperCase() !== actionFilter) continue;
          const hay = `${rec.actor || ''} ${act} ${rec.target || ''} ${rec.summary || ''}`.toLowerCase();
          if (query && !hay.includes(query)) continue;
          logs.push(rec);
        } catch {}
      }
    }
    const limit = Math.min(200, Math.max(1, Number(payload.limit) || 50));
    return { ok: true, data: { logs: logs.slice(0, limit) } };
  }

  return null;
}

// ============================================================================
// 8. Wave 3 Payroll 4-Step Workflow & Security Audit Trail Edge Helpers
// ============================================================================
function normalizeEdgeMonthYm(rawMonth, rawYear) {
  const m = rawMonth !== undefined && rawMonth !== null ? String(rawMonth).trim() : '';
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return m;
  if (/^\d{4}-[1-9]$/.test(m)) {
    const [y, mn] = m.split('-');
    return `${y}-${mn.padStart(2, '0')}`;
  }
  if (rawYear && Number(m) >= 1 && Number(m) <= 12) {
    return `${rawYear}-${String(Number(m)).padStart(2, '0')}`;
  }
  const vn = new Date(Date.now() + 7 * 3600 * 1000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeEdgePayrollStatus(raw) {
  const s = String(raw || '').trim();
  if (s === 'Staff_Confirming' || s === 'Disputed' || s === 'Locked') return s;
  return 'Draft';
}

async function persistPayrollWorkflowMutationInD1(db, action, payload, gasResult, now) {
  const month = normalizeEdgeMonthYm(payload.month, payload.year);
  const vnTime = formatVietnamTimestampFromMs(now);
  const existingRow = await db
    .prepare(`SELECT workflow_json FROM edge_payroll_workflow WHERE month = ?1 LIMIT 1`)
    .bind(month)
    .first();

  let current = {
    month,
    status: 'Draft',
    updatedBy: '',
    updatedAt: vnTime,
    note: '',
    confirmations: {},
  };
  if (existingRow?.workflow_json) {
    try {
      const parsed = JSON.parse(existingRow.workflow_json);
      if (parsed && typeof parsed === 'object') {
        current = { ...current, ...parsed, confirmations: { ...(parsed.confirmations || {}) } };
      }
    } catch {}
  }

  let updated = current;
  if (action === 'SET_PAYROLL_WORKFLOW_STATUS') {
    const nextStatus = normalizeEdgePayrollStatus(
      gasResult?.data?.workflow?.status || payload.status
    );
    const confirmations =
      payload.resetConfirmations === true
        ? {}
        : {
            ...(current.confirmations || {}),
            ...(gasResult?.data?.workflow?.confirmations || {}),
          };
    updated = {
      month,
      status: nextStatus,
      updatedBy: String(payload.actorUsername || payload.adminUsername || payload.username || 'admin'),
      updatedAt: vnTime,
      note: payload.note !== undefined ? String(payload.note) : current.note || '',
      confirmations,
    };
  } else if (action === 'CONFIRM_PAYROLL_SLIP') {
    const uname = String(payload.username || '').trim();
    const decision =
      String(payload.decision || 'CONFIRMED').toUpperCase() === 'DISPUTED'
        ? 'DISPUTED'
        : 'CONFIRMED';
    const confirmations = { ...(current.confirmations || {}) };
    if (uname) {
      confirmations[uname] = {
        status: decision,
        note: String(payload.note || '').trim(),
        fullname: String(payload.fullname || uname),
        updatedAt: vnTime,
      };
    }
    updated = {
      ...current,
      month,
      status:
        decision === 'DISPUTED' && current.status !== 'Locked'
          ? 'Disputed'
          : gasResult?.data?.workflow?.status || current.status || 'Staff_Confirming',
      updatedAt: vnTime,
      confirmations,
    };
  }

  await db
    .prepare(
      `INSERT INTO edge_payroll_workflow (month, workflow_json, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(month) DO UPDATE SET workflow_json = excluded.workflow_json, updated_at = excluded.updated_at`
    )
    .bind(month, JSON.stringify(updated), now)
    .run();

  return updated;
}

function redactEdgeAuditPayload(payload) {
  const safe = {};
  if (!payload || typeof payload !== 'object') return safe;
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'action' || k === '_authToken') continue;
    if (k === 'keys' && Array.isArray(v)) {
      safe.keyCount = v.length;
      continue;
    }
    if (/key|pin|pass|token|secret|auth|otp|image|photo/i.test(k)) {
      safe[k] = '[REDACTED]';
      continue;
    }
    if (typeof v === 'string') {
      safe[k] = v.length > 140 ? `${v.slice(0, 140)}…` : v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      safe[k] = v;
    } else if (Array.isArray(v)) {
      safe[`${k}Count`] = v.length;
    }
  }
  return safe;
}

async function appendEdgeAuditLogInD1(db, action, payload, now) {
  const actor = String(
    payload.actorUsername || payload.adminUsername || payload.username || 'admin'
  ).trim();
  const target = String(
    payload.targetUsername ||
      payload.month ||
      payload.swapId ||
      payload.advanceId ||
      payload.handoverId ||
      payload.incidentId ||
      payload.id ||
      ''
  ).trim();
  const vnTime = formatVietnamTimestampFromMs(now);
  const id = `AUD_EDGE_${now}_${Math.floor(Math.random() * 1000)}`;
  const summary = `${action}${target ? ` (${target})` : ''}`;
  const rec = {
    id,
    timestamp: vnTime,
    actor,
    action,
    target,
    summary,
    metadata: redactEdgeAuditPayload(payload),
  };

  await db
    .prepare(
      `INSERT INTO edge_audit_logs (id, actor, action, target, summary, record_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(id, actor, action, target, summary, JSON.stringify(rec), now)
    .run();
}
