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
  'RESET_FACE_PROFILE',
]);

let d1SchemaInitialized = false;

const VOLATILE_CACHE_KEY_FIELDS = new Set([
  '_authToken',
  'forceRefresh',
  'noCache',
  'cacheBuster',
  'timestamp',
  '_t',
  '_ts',
  'gpsAccuracy',
  'accuracy',
  'fastEdge',
  'instantEdge',
]);
const BIO_FAILOVER_SNAPSHOT_THROTTLE_MS = 5 * 60 * 1000;
const FACE_HEAL_COOLDOWN_MS = 10 * 60 * 1000;
const GPS_CONFIG_RESYNC_TTL_MS = 6 * 3600 * 1000;
const EDGE_CACHE_PRUNE_INTERVAL_MS = 15 * 60 * 1000;
const EDGE_CACHE_MAX_RETENTION_MS = 24 * 3600 * 1000;

const EDGE_SWR_WINDOW_MS = {
  GET_DATA: 5 * 60 * 1000,
  GET_ALL_SCHEDULES: 3 * 60 * 1000,
  GET_MONTH_SCHEDULES: 10 * 60 * 1000,
  GET_OPS_CHECKLIST_INIT: 5 * 60 * 1000,
  GET_HANDOVERS: 5 * 60 * 1000,
  GET_INCIDENTS: 5 * 60 * 1000,
  GET_SOLDOUT: 3 * 60 * 1000,
  GET_POSTS: 3 * 60 * 1000,
  GET_FEEDBACK: 3 * 60 * 1000,
  GET_FEEDBACKS: 3 * 60 * 1000,
  GET_NOTIFICATIONS: 90 * 1000,
  GET_TRAINING_CONTENT: 15 * 60 * 1000,
  GET_TRAINING_PROGRESS: 5 * 60 * 1000,
  GET_LEADERBOARD: 5 * 60 * 1000,
  GET_USER_COINS: 5 * 60 * 1000,
  GET_PAYROLL: 5 * 60 * 1000,
  GET_TIMESHEET: 5 * 60 * 1000,
  GET_OPERATIONS_CONFIG: 5 * 60 * 1000,
  GEOCODE: 24 * 3600 * 1000,
};

const EDGE_MUTATION_INVALIDATION_ACTIONS = {
  LOGIN: [],
  REGISTER: ['GET_DATA'],
  REQUEST_OTP: [],
  RESET_PASSWORD: [],
  FORCE_RESET_PASSWORD: [],
  UPDATE_USER_ROLE: ['GET_DATA', 'GET_AUDIT_LOGS'],
  UPDATE_USER_POSITION: ['GET_DATA', 'GET_AUDIT_LOGS'],
  UPDATE_EMPLOYMENT_STATUS: ['GET_DATA', 'GET_FACE_PROFILES', 'GET_AUDIT_LOGS'],
  UPLOAD_AVATAR: ['GET_DATA'],
  CHECK_IN_OUT: ['GET_DATA', 'GET_CHECKIN_LOGS', 'GET_KIOSK_ATTENDANCE_STATE', 'GET_TIMESHEET', 'GET_PAYROLL', 'GET_ANALYTICS'],
  CHECK_IN: ['GET_DATA', 'GET_CHECKIN_LOGS', 'GET_KIOSK_ATTENDANCE_STATE', 'GET_TIMESHEET', 'GET_PAYROLL', 'GET_ANALYTICS'],
  UPLOAD_CHECKIN_IMAGE: ['GET_DATA', 'GET_CHECKIN_LOGS'],
  UPLOAD_IMAGE: [],
  SEND_EMAIL_NOTIFICATION: [],
  SAVE_CHAT_LOG: [],
  AI_CHAT: [],
  SUBMIT_SURVEY: [],
  REGISTER_SHIFT: ['GET_DATA', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES'],
  APPROVE_SCHEDULES: ['GET_DATA', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES'],
  SAVE_ALL_SCHEDULES: ['GET_DATA', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES'],
  UPDATE_SINGLE_SHIFT: ['GET_DATA', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES'],
  SYNC_ROSTER_SCHEDULES: ['GET_DATA', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES'],
  PATCH_OPS_CHECKLIST_ITEM: ['GET_OPS_CHECKLIST_INIT', 'GET_DATA'],
  SAVE_OPS_CHECKLIST_STATE: ['GET_OPS_CHECKLIST_INIT', 'GET_DATA'],
  SUBMIT_CHECKLIST: ['GET_OPS_CHECKLIST_INIT', 'GET_CHECKLISTS', 'GET_DATA'],
  SAVE_OPS_CHECKLIST_CONFIG: ['GET_OPS_CHECKLIST_INIT'],
  TOGGLE_OPERATION_TASK: ['GET_OPERATIONS_CONFIG', 'GET_DATA'],
  UPDATE_OPERATIONS_CONFIG: ['GET_OPERATIONS_CONFIG', 'GET_DATA'],
  SUBMIT_HANDOVER: ['GET_HANDOVERS', 'GET_DATA'],
  ACKNOWLEDGE_HANDOVER: ['GET_HANDOVERS', 'GET_DATA'],
  REVIEW_HANDOVER: ['GET_HANDOVERS', 'GET_DATA', 'GET_AUDIT_LOGS'],
  SUBMIT_INCIDENT: ['GET_INCIDENTS', 'GET_HANDOVERS', 'GET_DATA'],
  UPDATE_INCIDENT: ['GET_INCIDENTS', 'GET_HANDOVERS', 'GET_DATA', 'GET_AUDIT_LOGS'],
  ADD_SOLDOUT: ['GET_SOLDOUT', 'GET_DATA'],
  REMOVE_SOLDOUT: ['GET_SOLDOUT', 'GET_DATA'],
  INTERACT_POST: ['GET_POSTS', 'GET_NOTIFICATIONS'],
  ADD_POST: ['GET_POSTS', 'GET_NOTIFICATIONS', 'GET_DATA'],
  CREATE_POST: ['GET_POSTS', 'GET_NOTIFICATIONS', 'GET_DATA'],
  DELETE_POST: ['GET_POSTS', 'GET_DATA'],
  SUBMIT_FEEDBACK: ['GET_FEEDBACK', 'GET_FEEDBACKS', 'GET_NOTIFICATIONS', 'GET_DATA'],
  REPLY_FEEDBACK: ['GET_FEEDBACK', 'GET_FEEDBACKS', 'GET_NOTIFICATIONS', 'GET_DATA'],
  MARK_NOTIFICATION_READ: ['GET_NOTIFICATIONS'],
  SUBMIT_SWAP: ['GET_SWAP_REQUESTS', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES', 'GET_DATA', 'GET_NOTIFICATIONS'],
  ACCEPT_SWAP: ['GET_SWAP_REQUESTS', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES', 'GET_DATA', 'GET_NOTIFICATIONS'],
  APPROVE_SWAP: ['GET_SWAP_REQUESTS', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES', 'GET_DATA', 'GET_NOTIFICATIONS', 'GET_AUDIT_LOGS'],
  DELETE_SWAP: ['GET_SWAP_REQUESTS', 'GET_DATA'],
  SUBMIT_ADVANCE: ['GET_ADVANCES', 'GET_PAYROLL', 'GET_DATA', 'GET_NOTIFICATIONS'],
  APPROVE_ADVANCE: ['GET_ADVANCES', 'GET_PAYROLL', 'GET_DATA', 'GET_NOTIFICATIONS', 'GET_AUDIT_LOGS'],
  ADD_BONUS_PENALTY: ['GET_BONUS_PENALTY', 'GET_PAYROLL', 'GET_USER_COINS', 'GET_DATA', 'GET_AUDIT_LOGS'],
  DELETE_BONUS_PENALTY: ['GET_BONUS_PENALTY', 'GET_PAYROLL', 'GET_USER_COINS', 'GET_DATA', 'GET_AUDIT_LOGS'],
  SET_PAYROLL_WORKFLOW_STATUS: ['GET_PAYROLL', 'GET_AUDIT_LOGS'],
  CONFIRM_PAYROLL_SLIP: ['GET_PAYROLL'],
  UPDATE_MONTHLY_SALARY_CONFIG: ['GET_MONTHLY_SALARY_CONFIG', 'GET_PAYROLL', 'GET_DATA', 'GET_AUDIT_LOGS'],
  COPY_MONTHLY_SALARY_CONFIG: ['GET_MONTHLY_SALARY_CONFIG', 'GET_PAYROLL', 'GET_AUDIT_LOGS'],
  UPDATE_PAYROLL_CONFIG: ['GET_SALARY_CONFIG', 'GET_PAYROLL', 'GET_DATA', 'GET_AUDIT_LOGS'],
  SUBMIT_SALARY_ADJUSTMENT: ['GET_SALARY_ADJUSTMENTS', 'GET_PAYROLL', 'GET_NOTIFICATIONS'],
  REVIEW_SALARY_ADJUSTMENT: ['GET_SALARY_ADJUSTMENTS', 'GET_MONTHLY_SALARY_CONFIG', 'GET_PAYROLL', 'GET_NOTIFICATIONS', 'GET_AUDIT_LOGS'],
  SUBMIT_MISSED_CHECKIN: ['GET_MISSED_CHECKINS', 'GET_DATA', 'GET_CHECKIN_LOGS', 'GET_TIMESHEET', 'GET_NOTIFICATIONS'],
  APPROVE_MISSED_CHECKIN: ['GET_MISSED_CHECKINS', 'GET_DATA', 'GET_CHECKIN_LOGS', 'GET_TIMESHEET', 'GET_PAYROLL', 'GET_ANALYTICS', 'GET_NOTIFICATIONS', 'GET_AUDIT_LOGS'],
  REJECT_MISSED_CHECKIN: ['GET_MISSED_CHECKINS', 'GET_DATA', 'GET_CHECKIN_LOGS', 'GET_NOTIFICATIONS', 'GET_AUDIT_LOGS'],
  UPDATE_CHECKIN_TYPE: ['GET_DATA', 'GET_CHECKIN_LOGS', 'GET_TIMESHEET', 'GET_PAYROLL', 'GET_AUDIT_LOGS'],
  ENROLL_FACE_PROFILE: ['GET_FACE_PROFILES', 'GET_DATA'],
  RESET_FACE_PROFILE: ['GET_FACE_PROFILES', 'GET_DATA', 'GET_AUDIT_LOGS'],
  SUBMIT_TRAINING_QUIZ: ['GET_TRAINING_PROGRESS', 'GET_LEADERBOARD', 'GET_USER_COINS', 'GET_DATA'],
};

const INSTANT_EDGE_OPERATIONAL_ACTIONS = new Set([
  'PATCH_OPS_CHECKLIST_ITEM',
  'SAVE_OPS_CHECKLIST_STATE',
  'SUBMIT_HANDOVER',
  'ACKNOWLEDGE_HANDOVER',
  'REVIEW_HANDOVER',
  'SUBMIT_INCIDENT',
  'UPDATE_INCIDENT',
  'SET_PAYROLL_WORKFLOW_STATUS',
  'CONFIRM_PAYROLL_SLIP',
  'ADD_SOLDOUT',
  'REMOVE_SOLDOUT',
  'INTERACT_POST',
  'ADD_POST',
  'SUBMIT_FEEDBACK',
  'MARK_NOTIFICATION_READ',
  'SAVE_CHAT_LOG',
  'SUBMIT_SURVEY',
  'TOGGLE_OPERATION_TASK',
  'UPDATE_SINGLE_SHIFT',
]);

const lastBioFailoverSnapshotMap = new Map();
const lastFaceHealMap = new Map();
const inFlightRevalidations = new Set();
const checklistMergeLocks = new Map();
let drainInFlightPromise = null;
let lastSavedGpsConfigJson = '';
let lastSavedGpsConfigAtMs = 0;
let lastCachePruneAtMs = 0;

export function resetEdgeMemoryStateForTests() {
  d1SchemaInitialized = false;
  lastBioFailoverSnapshotMap.clear();
  lastFaceHealMap.clear();
  inFlightRevalidations.clear();
  checklistMergeLocks.clear();
  drainInFlightPromise = null;
  lastSavedGpsConfigJson = '';
  lastSavedGpsConfigAtMs = 0;
  lastCachePruneAtMs = 0;
  inFlightEdgeCheckIns.clear();
}

function getEdgeSwrWindowMs(action) {
  return EDGE_SWR_WINDOW_MS[action] || 3 * 60 * 1000;
}

function getEdgeInvalidationActionsForMutation(action) {
  if (Object.prototype.hasOwnProperty.call(EDGE_MUTATION_INVALIDATION_ACTIONS, action)) {
    return EDGE_MUTATION_INVALIDATION_ACTIONS[action];
  }
  return null;
}

function buildCanonicalEdgeCacheInput(action, payload) {
  if (!payload || typeof payload !== 'object') {
    return JSON.stringify({ action });
  }
  const stripGps = action !== 'GEOCODE';
  const keys = Object.keys(payload).sort();
  const clean = {};
  for (const k of keys) {
    if (VOLATILE_CACHE_KEY_FIELDS.has(k)) continue;
    if (stripGps && (k === 'lat' || k === 'lng')) continue;
    const val = payload[k];
    if (val === undefined) continue;
    if (action === 'GEOCODE' && (k === 'lat' || k === 'lng') && Number.isFinite(Number(val))) {
      clean[k] = Number(Number(val).toFixed(4));
    } else {
      clean[k] = val;
    }
  }
  return JSON.stringify(clean);
}

function normalizeGpsConfigSnapshot(gps) {
  if (!gps || typeof gps !== 'object') return null;
  const latNum = Number(gps.lat);
  const lngNum = Number(gps.lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || (latNum === 0 && lngNum === 0)) {
    return null;
  }
  const radNum = Number(gps.radius) || 25;
  return { lat: latNum, lng: lngNum, radius: radNum };
}

function shouldPersistFailoverSnapshot(edgeCacheKey, dataObj, now = Date.now()) {
  const serialized = JSON.stringify(dataObj);
  if (serialized.length > 900000) return false;
  const prev = lastBioFailoverSnapshotMap.get(edgeCacheKey);
  if (prev && prev.serialized === serialized && now - prev.savedAt < BIO_FAILOVER_SNAPSHOT_THROTTLE_MS) {
    return false;
  }
  if (lastBioFailoverSnapshotMap.size > 64) {
    lastBioFailoverSnapshotMap.clear();
  }
  lastBioFailoverSnapshotMap.set(edgeCacheKey, { serialized, savedAt: now });
  return true;
}

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

    // Opportunistically drain any pending Google Sheets sync tasks & prune >24h cache entries in background.
    // For legacy synchronous UPLOAD_CHECKIN_IMAGE, await drain first so any D1-buffered CHECK_IN_OUT row lands in Google Sheets
    // right before Drive photo attachment & post-upload email notification run!
    if (env?.DB && action !== 'GET_EDGE_DB_STATUS' && action !== 'LOGIN') {
      if (action === 'UPLOAD_CHECKIN_IMAGE' && payload.instantEdge !== true) {
        await drainEdgeSyncQueue(env, TARGET_GAS_URL);
      } else if (
        !(
          payload.instantEdge === true &&
          (action === 'CHECK_IN_OUT' ||
            action === 'CHECK_IN' ||
            action === 'UPLOAD_CHECKIN_IMAGE' ||
            action === 'REGISTER_SHIFT' ||
            INSTANT_EDGE_OPERATIONAL_ACTIONS.has(action))
        )
      ) {
        context.waitUntil(drainEdgeSyncQueue(env, TARGET_GAS_URL));
      }
      if (Date.now() - lastCachePruneAtMs > EDGE_CACHE_PRUNE_INTERVAL_MS) {
        lastCachePruneAtMs = Date.now();
        context.waitUntil(pruneStaleEdgeCacheInD1(env.DB));
      }
    }

    // 1. Edge Database Health & Diagnostics Endpoint
    if (action === 'GET_EDGE_DB_STATUS') {
      const statusReport = await getEdgeDbStatus(env);
      return jsonResponse(statusReport, 200, { 'X-Edge-DB': 'STATUS' });
    }

    // 1a. Ultra-Fast Cloudflare D1 Salted-SHA256 Login Verifier (<35ms vs 1.5-4.5s GAS cold start)
    if (action === 'LOGIN' && env?.DB) {
      const instantLoginRes = await handleInstantEdgeLogin(context, payload, bodyText);
      if (instantLoginRes) {
        return instantLoginRes;
      }
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

    // 2a-v2. Kiosk GPS Gate (< 25m) BEFORE cache lookup on GET_FACE_PROFILES / GET_KIOSK_ATTENDANCE_STATE
    // Public vector prewarming (preloadOnly: true on GET_FACE_PROFILES) returns non-sensitive vectors from D1
    // while GPS satellites warm up; CHECK_IN_OUT & GET_KIOSK_ATTENDANCE_STATE strictly enforce GPS geofence!
    const isPublicProfilePreload =
      action === 'GET_FACE_PROFILES' && payload.preloadOnly === true;
    if (
      (action === 'GET_FACE_PROFILES' || action === 'GET_KIOSK_ATTENDANCE_STATE') &&
      payload.isKiosk === true &&
      !isPublicProfilePreload
    ) {
      const gpsGateErr = await verifyEdgeKioskGpsGate(env, payload);
      if (gpsGateErr) {
        return jsonResponse(gpsGateErr, 200, { 'X-Edge-GPS': 'REJECTED' });
      }
    }

    // 2a-v3. Edge Biometric Lock & Anti-Duplicate Precheck on ENROLL_FACE_PROFILE
    if (action === 'ENROLL_FACE_PROFILE') {
      const enrollPreErr = await preCheckEnrollFaceProfileEdge(env, payload, verifiedSession);
      if (enrollPreErr) {
        return jsonResponse(enrollPreErr, 200, { 'X-Edge-Face': 'REJECTED' });
      }
    }

    // 2a-v4. Edge Biometric Verification (v2_face), Atomic Earliest-Scan Lock & 15-Min Per-Employee Cooldown on CHECK_IN_OUT
    let reservedCheckInLock = false;
    if (action === 'CHECK_IN_OUT' || action === 'CHECK_IN') {
      const checkInPreErr = await preCheckCheckInEdge(env, payload);
      if (checkInPreErr) {
        return jsonResponse(checkInPreErr, 200, { 'X-Edge-CheckIn': 'BLOCKED' });
      }
      reservedCheckInLock = true;
    }

    try {
      // 2a-v5. Instant Edge Check-In & Instant Edge Image Queue (<100ms response, ordered server-side Sheet + Drive sync)
      if ((action === 'CHECK_IN_OUT' || action === 'CHECK_IN') && payload.instantEdge === true && env?.DB) {
        const instantPunchRes = await handleInstantCheckInEdge(
          context,
          payload,
          bodyText,
          verifiedSession
        );
        if (instantPunchRes) {
          return instantPunchRes;
        }
      }

      if (action === 'UPLOAD_CHECKIN_IMAGE' && payload.instantEdge === true && env?.DB) {
        const instantUploadRes = await handleInstantUploadImageEdge(context, payload);
        if (instantUploadRes) {
          return instantUploadRes;
        }
      }

      // 2a-v6. Instant Edge Write-Ahead (<50ms) for Operational & HR Mutations (Checklist, Handover, Incidents, SoldOut, Posts, Payroll Workflow...)
      if (
        payload.instantEdge === true &&
        env?.DB &&
        INSTANT_EDGE_OPERATIONAL_ACTIONS.has(action)
      ) {
        const instantOpRes = await handleInstantOperationalMutationEdge(
          context,
          action,
          payload,
          verifiedSession
        );
        if (instantOpRes) {
          return instantOpRes;
        }
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
          } else if (action === 'PATCH_OPS_CHECKLIST_ITEM' && payload.itemId && !payload.itemPatch) {
            payload.itemPatch = {
              checked: payload.checked,
              note: payload.note,
              subchecks: payload.subchecks,
              by: payload.by || payload.fullname || payload.username || '',
              at: payload.at || new Date().toISOString(),
            };
            bodyText = JSON.stringify(payload);
          }
        }
      }

      // 3. Read Actions (GET_* & GEOCODE) with D1 Real-time Overlay + True SWR + Failover
      // Face ID & Kiosk state reads NEVER serve from L1 POP/L2 cache so cross-phone enrollment & cooldown sync in 0ms!
      const isReadAction = action.startsWith('GET_') || action === 'GEOCODE';
      const isLiveBiometricRead =
        action === 'GET_FACE_PROFILES' || action === 'GET_KIOSK_ATTENDANCE_STATE';
      const isCacheable =
        isReadAction &&
        !isLiveBiometricRead &&
        !payload.forceRefresh &&
        !payload.noCache &&
        !payload.cacheBuster;

      const canonicalCacheInput = buildCanonicalEdgeCacheInput(action, payload);
      const hash = await sha256(canonicalCacheInput);
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

        // L2: Check Cloudflare D1 / KV Cache with True Stale-While-Revalidate (SWR)
        const l2Entry = await readEdgeCache(env, edgeCacheKey, true);
        const nowReadMs = Date.now();
        if (l2Entry && l2Entry.data) {
          const isFresh = l2Entry.expiresAt > nowReadMs;
          const ageMs = nowReadMs - Number(l2Entry.updatedAt || 0);
          const isWithinSwr = !isFresh && ageMs <= getEdgeSwrWindowMs(action);
          if (isFresh || isWithinSwr) {
            const overlaid = await applyD1Overlays(action, payload, l2Entry.data, env, verifiedSession);
            // Trigger deduplicated background revalidation when stale or >12s old
            if ((isWithinSwr || ageMs > 12000) && !inFlightRevalidations.has(edgeCacheKey)) {
              inFlightRevalidations.add(edgeCacheKey);
              context.waitUntil(
                revalidateFromGas(context, action, payload, bodyText, edgeCacheKey, popCacheReq).finally(
                  () => {
                    inFlightRevalidations.delete(edgeCacheKey);
                  }
                )
              );
            }
            return jsonResponse(overlaid, 200, {
              'X-Proxy-Cache': isFresh ? 'HIT-L2-EDGE-DB' : 'STALE-WHILE-REVALIDATE',
              'X-Edge-DB': 'D1-KV-HIT',
              'Cache-Control': 'public, max-age=10, s-maxage=10',
            });
          }
        }
      }

      // Instant D1 Biometric Read (<20ms): serves GET_FACE_PROFILES & GET_KIOSK_ATTENDANCE_STATE
      // directly from Cloudflare D1 when fastEdge=true so phones never stall on GAS lock contention.
      if (isLiveBiometricRead && payload.fastEdge === true && !payload.forceRefresh && env?.DB) {
        const l2Snap = await readEdgeCache(env, edgeCacheKey, true);
        const callerWantsAdminRoster =
          action === 'GET_FACE_PROFILES' &&
          !payload.preloadOnly &&
          (verifiedSession?.r === 'admin' ||
            String(payload.actorRole || payload.role || '').trim().toLowerCase() === 'admin');

        if (action === 'GET_FACE_PROFILES') {
          const profCountRow = await env.DB.prepare(
            `SELECT COUNT(*) as c FROM edge_face_profiles`
          )
            .first()
            .catch(() => ({ c: 0 }));
          const hasD1Profiles = Number(profCountRow?.c || 0) > 0;
          const hasAdminRosterInSnap = Array.isArray(l2Snap?.data?.data?.activeEmployees);

          if ((hasD1Profiles || l2Snap?.data) && (!callerWantsAdminRoster || hasAdminRosterInSnap)) {
            const baseObj = l2Snap?.data || {
              ok: true,
              data: { profiles: [], totalActiveUsers: 0 },
            };
            const overlaid = await applyD1Overlays(action, payload, baseObj, env, verifiedSession);
            if (overlaid?.data && !overlaid.data.gpsConfig) {
              const gpsSnap = await readEdgeCache(env, 'sys:gps_config', true);
              if (gpsSnap?.data) {
                overlaid.data.gpsConfig = gpsSnap.data;
              }
            }
            if (payload.preloadOnly === true && overlaid?.data) {
              delete overlaid.data.activeEmployees;
            }
            if (!payload.preloadOnly && (!l2Snap || Date.now() - Number(l2Snap.updatedAt || 0) > 60000)) {
              context.waitUntil(
                revalidateLiveBiometricFromGas(context, action, payload, bodyText, edgeCacheKey)
              );
            }
            return jsonResponse(overlaid, 200, {
              'X-Proxy-Cache': 'HIT-D1-INSTANT',
              'X-Edge-DB': 'D1-INSTANT',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            });
          }
        } else if (action === 'GET_KIOSK_ATTENDANCE_STATE') {
          const baseObj = l2Snap?.data || { ok: true, data: { logs: [] } };
          const overlaid = await applyD1Overlays(action, payload, baseObj, env, verifiedSession);
          const hasD1OrSnapLogs =
            Boolean(l2Snap?.data) || (Array.isArray(overlaid?.data?.logs) && overlaid.data.logs.length > 0);
          if (hasD1OrSnapLogs) {
            if (!l2Snap || Date.now() - Number(l2Snap.updatedAt || 0) > 60000) {
              context.waitUntil(
                revalidateLiveBiometricFromGas(context, action, payload, bodyText, edgeCacheKey)
              );
            }
            return jsonResponse(overlaid, 200, {
              'X-Proxy-Cache': 'HIT-D1-INSTANT',
              'X-Edge-DB': 'D1-INSTANT',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            });
          }
        }
      }

      // Fetch from Google Apps Script Master Backend
      const gasTimeoutMs =
        isLiveBiometricRead && payload.fastEdge === true && !payload.forceRefresh ? 2500 : 28000;
      let gasResult = null;
      let gasStatus = 200;
      try {
        const gasRes = await fetch(TARGET_GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: bodyText,
          signal:
            typeof AbortSignal !== 'undefined' && AbortSignal.timeout
              ? AbortSignal.timeout(gasTimeoutMs)
              : undefined,
        });
        gasStatus = gasRes.status;
        const responseText = await gasRes.text();
        gasResult = JSON.parse(responseText);
      } catch (fetchErr) {
        // Failover for Read Actions: Serve last known good snapshot or D1 biometric state if GAS timed out
        if (isReadAction) {
          const fallbackEntry = await readEdgeCache(env, edgeCacheKey, true);
          if (fallbackEntry?.data) {
            const overlaid = await applyD1Overlays(action, payload, fallbackEntry.data, env);
            if (payload.preloadOnly === true && overlaid?.data) {
              delete overlaid.data.activeEmployees;
            }
            return jsonResponse(overlaid, 200, {
              'X-Proxy-Cache': 'FAILOVER-EDGE-DB',
              'X-Edge-DB': 'D1-KV-FAILOVER',
              'Cache-Control': 'no-store',
            });
          }
          if (isLiveBiometricRead && env?.DB) {
            const emptyBase =
              action === 'GET_FACE_PROFILES'
                ? { ok: true, data: { profiles: [], totalActiveUsers: 0 } }
                : { ok: true, data: { logs: [] } };
            const overlaid = await applyD1Overlays(action, payload, emptyBase, env, verifiedSession);
            if (payload.preloadOnly === true && overlaid?.data) {
              delete overlaid.data.activeEmployees;
            }
            context.waitUntil(
              revalidateLiveBiometricFromGas(context, action, payload, bodyText, edgeCacheKey)
            );
            return jsonResponse(overlaid, 200, {
              'X-Proxy-Cache': 'FAILOVER-D1-LIVE',
              'X-Edge-DB': 'D1-INSTANT',
              'Cache-Control': 'no-store',
            });
          }
        }
        // Resilient Face Enrollment: If GAS times out (>28s), persist immediately in D1 for all devices & enqueue Sheet sync
        if (action === 'ENROLL_FACE_PROFILE' && env?.DB) {
          const uname = String(payload.username || '').trim();
          const vectors = decodeInt8VectorsEdge(String(payload.vectorsB64 || ''), EDGE_FACE_DIM);
          if (uname && vectors.length > 0) {
            const nowEnroll = Date.now();
            await upsertFaceProfileInD1(env.DB, payload, nowEnroll);
            await enqueueFaceProfileSyncToGas(env, payload);
            await invalidateEdgeReadCaches(env, ['GET_FACE_PROFILES', 'GET_DATA']);
            return jsonResponse(
              {
                ok: true,
                data: {
                  message:
                    'Đã đăng ký và khóa bảo vệ Face ID thành công! (Đang đồng bộ nền lên Google Sheets)',
                  username: uname,
                  fullname: String(payload.fullname || uname),
                  anglesCount: Number(payload.anglesCount) || vectors.length,
                  enrolledAt: formatVietnamTimestampFromMs(nowEnroll),
                  isLocked: true,
                  queuedForSheet: true,
                },
              },
              200,
              {
                'X-Edge-DB': 'D1-QUEUED',
                'Cache-Control': 'no-store, no-cache, must-revalidate',
              }
            );
          }
        }
        // Zero-Loss Check-In Write-Ahead Ledger: If GAS times out (>28s) or returns 5xx HTML,
        // verify geofence at Edge, persist punch immediately in D1 + edge_sync_queue, and report honestly!
        if ((action === 'CHECK_IN_OUT' || action === 'CHECK_IN') && env?.DB) {
          const bufferedRes = await bufferCheckInToD1WriteAhead(env, payload);
          if (bufferedRes) {
            return bufferedRes;
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

      let isValidSuccess = Boolean(gasResult && gasResult.ok === true);

      // Bidirectional Self-Healing on v2_face CHECK_IN_OUT:
      // If Google Sheets row was corrupted (#ERROR!) or out-of-sync while D1 holds the valid enrolled face profile,
      // verify liveVectorB64 against D1, repair CONFIG_FACE_ID on GAS with formula-safe v2: vector, and retry punch once!
      if (
        action === 'CHECK_IN_OUT' &&
        String(payload.checkinMode || '').trim() === 'v2_face' &&
        !isValidSuccess &&
        env?.DB
      ) {
        const errCode = String(gasResult?.code || gasResult?.data?.code || '').trim();
        if (errCode === 'FACE_VERIFICATION_FAILED' || errCode === 'FACE_PROFILE_NOT_FOUND') {
          const targetUser = String(payload.username || '').trim().toLowerCase();
          const liveVecs = decodeInt8VectorsEdge(String(payload.liveVectorB64 || ''), EDGE_FACE_DIM);
          if (targetUser && liveVecs.length > 0) {
            const d1Row = await env.DB.prepare(
              `SELECT username, fullname, role, position, avatar_url, employment_status, model_version, angle_count, vectors_b64, centroid_b64, quality_score, enrolled_by
               FROM edge_face_profiles WHERE username = ?1 LIMIT 1`
            )
              .bind(targetUser)
              .first()
              .catch(() => null);
            if (d1Row && d1Row.vectors_b64) {
              const st = String(d1Row.employment_status || 'active').toLowerCase();
              if (st !== 'resigned' && st !== 'suspended') {
                const storedVecs = decodeInt8VectorsEdge(String(d1Row.vectors_b64), EDGE_FACE_DIM);
                const storedCent = d1Row.centroid_b64
                  ? decodeInt8VectorsEdge(String(d1Row.centroid_b64), EDGE_FACE_DIM)[0] || null
                  : null;
                const d1Score = computeFaceProfileScoreEdge(liveVecs[0], storedVecs, storedCent);
                if (d1Score >= EDGE_FACE_SERVER_VERIFY_MIN) {
                  const healed = await healFaceProfileToGas(env, d1Row);
                  if (healed) {
                    try {
                      const retryRes = await fetch(TARGET_GAS_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: bodyText,
                        signal:
                          typeof AbortSignal !== 'undefined' && AbortSignal.timeout
                            ? AbortSignal.timeout(gasTimeoutMs)
                            : undefined,
                      });
                      gasStatus = retryRes.status;
                      gasResult = JSON.parse(await retryRes.text());
                      isValidSuccess = Boolean(gasResult && gasResult.ok === true);
                    } catch {
                      // Preserve initial response if retry fails
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Bidirectional Schedule Self-Healing & D1 Write-Ahead Ledger on CHECK_IN_OUT / CHECK_IN:
      // 1. If GAS returned SCHEDULE_REQUIRED while D1 holds a valid 7-day registration (sheet_synced = 0),
      //    push REGISTER_SHIFT to GAS immediately and retry CHECK_IN_OUT so staff punches never fail due to sync lag!
      // 2. If GAS returned LOCK_TIMEOUT, SAVE_ERROR, or HTTP 5xx, buffer punch in D1 + edge_sync_queue for zero loss!
      if ((action === 'CHECK_IN_OUT' || action === 'CHECK_IN') && !isValidSuccess && env?.DB) {
        const errCode = String(gasResult?.code || gasResult?.data?.code || '').trim();
        if (errCode === 'SCHEDULE_REQUIRED') {
          const healedSched = await trySelfHealScheduleForCheckIn(env, payload, gasResult);
          if (healedSched) {
            try {
              const retrySchedPunchRes = await fetch(TARGET_GAS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: bodyText,
                signal:
                  typeof AbortSignal !== 'undefined' && AbortSignal.timeout
                    ? AbortSignal.timeout(gasTimeoutMs)
                    : undefined,
              });
              gasStatus = retrySchedPunchRes.status;
              gasResult = JSON.parse(await retrySchedPunchRes.text());
              isValidSuccess = Boolean(gasResult && gasResult.ok === true);
            } catch {
              const bufferedAfterHeal = await bufferCheckInToD1WriteAhead(env, payload);
              if (bufferedAfterHeal) {
                return bufferedAfterHeal;
              }
            }
          }
        } else if (gasStatus >= 500 || errCode === 'LOCK_TIMEOUT' || errCode === 'SAVE_ERROR') {
          const bufferedRes = await bufferCheckInToD1WriteAhead(env, payload);
          if (bufferedRes) {
            return bufferedRes;
          }
        }
      }

      // Enrich legacy GAS responses for Wave 2 actions so UI always receives structured fields
      if (isValidSuccess) {
        gasResult = enrichWave2MutationResponse(action, payload, gasResult, preMergedChecklistState);
      }

      // Issue Edge HMAC-SHA256 session token & warm D1 edge_auth_cache on successful LOGIN
      if (action === 'LOGIN' && isValidSuccess && gasResult?.data && typeof gasResult.data === 'object') {
        const loginUser = String(gasResult.data.username || payload.username || '').trim().toLowerCase();
        const loginRole = String(gasResult.data.role || 'user').trim().toLowerCase();
        gasResult.data.sessionToken = await signEdgeSessionToken(
          { u: loginUser, r: loginRole, exp: Date.now() + 7 * 86400 * 1000 },
          getEdgeSecret(env)
        );
        if (env?.DB && loginUser && (payload.password || payload.passwordHash)) {
          context.waitUntil(cacheAuthProfileInD1(env.DB, payload, gasResult.data));
        }
      }

      // Handle post-write hooks for mutations (synchronous on attendance, auth & Face ID mutations for strict read-after-write D1 consistency)
      if (!isReadAction && isValidSuccess) {
        if (
          action === 'CHECK_IN_OUT' ||
          action === 'CHECK_IN' ||
          action === 'UPLOAD_CHECKIN_IMAGE' ||
          action === 'SUBMIT_MISSED_CHECKIN' ||
          action === 'APPROVE_MISSED_CHECKIN' ||
          action === 'REJECT_MISSED_CHECKIN' ||
          action === 'UPDATE_CHECKIN_TYPE' ||
          action === 'ENROLL_FACE_PROFILE' ||
          action === 'RESET_FACE_PROFILE' ||
          action === 'UPDATE_GPS_CONFIG' ||
          action === 'UPDATE_EMPLOYMENT_STATUS' ||
          action === 'FORCE_RESET_PASSWORD' ||
          action === 'RESET_PASSWORD' ||
          action === 'UPDATE_USER_ROLE' ||
          action === 'UPDATE_USER_POSITION' ||
          action === 'UPLOAD_AVATAR' ||
          action === 'REGISTER'
        ) {
          await handleMutationSideEffects(env, action, payload, gasResult, preMergedChecklistState);
        } else {
          context.waitUntil(
            handleMutationSideEffects(env, action, payload, gasResult, preMergedChecklistState)
          );
        }
      }

      // Apply real-time D1 overlays on read responses & store in L1/L2 caches
      if (isReadAction && isValidSuccess) {
        if (
          action === 'GET_DATA' &&
          env?.DB &&
          gasResult?.data?.isScheduleRegistered === true &&
          Array.isArray(gasResult?.data?.registeredShifts) &&
          gasResult.data.registeredShifts.length === 7 &&
          payload.username &&
          payload.monthSheet &&
          payload.weekLabel
        ) {
          const warmUser = String(payload.username).trim().toLowerCase();
          const warmName = String(payload.fullname || warmUser).trim();
          const warmMonth = String(payload.monthSheet).trim();
          const warmWeek = String(payload.weekLabel).trim();
          const warmShiftsJson = JSON.stringify(gasResult.data.registeredShifts);
          const warmSchedId = `${warmMonth}|${warmWeek}|${warmUser}`;
          context.waitUntil(
            env.DB.prepare(
              `INSERT INTO edge_schedules (id, username, fullname, month_sheet, week_label, shifts_json, off_reason, status, sheet_synced, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', 'Đã đồng bộ', 1, ?7)
               ON CONFLICT(id) DO UPDATE SET
                 shifts_json = CASE WHEN edge_schedules.sheet_synced = 1 THEN excluded.shifts_json ELSE edge_schedules.shifts_json END,
                 updated_at = CASE WHEN edge_schedules.sheet_synced = 1 THEN excluded.updated_at ELSE edge_schedules.updated_at END`
            )
              .bind(warmSchedId, warmUser, warmName, warmMonth, warmWeek, warmShiftsJson, Date.now())
              .run()
              .catch(() => {})
          );
        }
        gasResult = await applyD1Overlays(action, payload, gasResult, env, verifiedSession);
        if (payload.preloadOnly === true && gasResult?.data) {
          delete gasResult.data.activeEmployees;
        }
        if (gasResult?.data?.gpsConfig && env?.DB) {
          const normGps = normalizeGpsConfigSnapshot(gasResult.data.gpsConfig);
          if (normGps) {
            const gpsJson = JSON.stringify(normGps);
            const nowMs = Date.now();
            if (gpsJson !== lastSavedGpsConfigJson || nowMs - lastSavedGpsConfigAtMs > GPS_CONFIG_RESYNC_TTL_MS) {
              lastSavedGpsConfigJson = gpsJson;
              lastSavedGpsConfigAtMs = nowMs;
              context.waitUntil(
                writeEdgeCache(env, 'sys:gps_config', 'GPS_CONFIG', normGps, 7 * 86400 * 1000)
              );
            }
          }
        }
        const ttlMs = action === 'GET_DATA' ? 30000 : action === 'GET_ALL_SCHEDULES' ? 20000 : 45000;
        if (isCacheable) {
          context.waitUntil(writeEdgeCache(env, edgeCacheKey, action, gasResult, ttlMs));
        } else if (
          env?.DB &&
          !payload.preloadOnly &&
          shouldPersistFailoverSnapshot(edgeCacheKey, gasResult)
        ) {
          context.waitUntil(
            writeEdgeCache(env, edgeCacheKey, action, gasResult, ttlMs, { allowKvFallback: false })
          );
        }

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
    } finally {
      if (reservedCheckInLock) {
        releaseInFlightEdgeCheckIn(payload);
      }
    }
  } catch (err) {
    return jsonResponse(
      { ok: false, message: err?.message || 'Internal Edge Gateway Error' },
      500,
      { 'X-Edge-DB': 'ERROR' }
    );
  }
}

// ============================================================================
// 0. Ultra-Fast Edge D1 Salted-SHA256 Auth Verifier (<35ms Login)
// ============================================================================
const EDGE_PASSWORD_SALT = 'kg_salt_2026';
const EDGE_AUTH_CACHE_TTL_MS = 24 * 3600 * 1000; // 24h max credential TTL
const EDGE_AUTH_REVALIDATE_AFTER_MS = 2 * 60 * 1000; // Silent background profile revalidation after 2m

async function computeEdgeSaltedPasswordHash(password, fallbackHash = '') {
  if (password !== undefined && password !== null && String(password) !== '') {
    return sha256(`${String(password)}:${EDGE_PASSWORD_SALT}`);
  }
  const cleanHash = String(fallbackHash || '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(cleanHash) ? cleanHash : '';
}

function timingSafeEqualStr(a, b) {
  const s1 = String(a || '');
  const s2 = String(b || '');
  if (!s1 || s1.length !== s2.length) return false;
  let diff = 0;
  for (let i = 0; i < s1.length; i++) {
    diff |= s1.charCodeAt(i) ^ s2.charCodeAt(i);
  }
  return diff === 0;
}

async function cacheAuthProfileInD1(db, payload, userData) {
  if (!db || !userData || typeof userData !== 'object') return;
  const cleanUser = String(userData.username || payload?.username || '').trim().toLowerCase();
  if (!cleanUser) return;
  const pwdHash = await computeEdgeSaltedPasswordHash(payload?.password, payload?.passwordHash);
  if (!pwdHash) return;

  // Never persist sessionToken or plaintext password into edge_auth_cache
  const safeUser = {
    username: String(userData.username || cleanUser).trim(),
    fullname: String(userData.fullname || cleanUser).trim(),
    email: String(userData.email || '').trim(),
    role: String(userData.role || (cleanUser === 'admin' ? 'admin' : 'user')).trim(),
    position: String(userData.position || 'Phục vụ').trim(),
    avatarUrl: String(userData.avatarUrl || '').trim(),
    employmentStatus: String(userData.employmentStatus || 'active').trim(),
    statusUntil: String(userData.statusUntil || '').trim(),
    statusReason: String(userData.statusReason || '').trim(),
    statusUpdatedAt: String(userData.statusUpdatedAt || '').trim(),
  };

  await db
    .prepare(
      `INSERT INTO edge_auth_cache (username, password_hash, email, user_json, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(username) DO UPDATE SET
         password_hash = excluded.password_hash,
         email = excluded.email,
         user_json = excluded.user_json,
         updated_at = excluded.updated_at`
    )
    .bind(cleanUser, pwdHash, safeUser.email.toLowerCase(), JSON.stringify(safeUser), Date.now())
    .run()
    .catch(() => {});
}

async function revalidateAuthEntryFromGas(env, cleanUser, payload, bodyText) {
  if (!env?.DB || !cleanUser) return;
  const dedupeKey = `auth:${cleanUser}`;
  if (inFlightRevalidations.has(dedupeKey)) return;
  inFlightRevalidations.add(dedupeKey);
  try {
    const gasRes = await fetch(TARGET_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: bodyText,
      signal:
        typeof AbortSignal !== 'undefined' && AbortSignal.timeout
          ? AbortSignal.timeout(20000)
          : undefined,
    });
    const parsed = await gasRes.json();
    if (parsed && parsed.ok === true && parsed.data) {
      await cacheAuthProfileInD1(env.DB, payload, parsed.data);
    } else if (parsed && parsed.ok === false) {
      // Credentials were changed or revoked directly in Google Sheets -> purge stale Edge cache
      await env.DB.prepare(`DELETE FROM edge_auth_cache WHERE username = ?1`)
        .bind(cleanUser)
        .run()
        .catch(() => {});
    }
  } catch {
    // Non-fatal: keep cached entry on transient GAS outage
  } finally {
    inFlightRevalidations.delete(dedupeKey);
  }
}

async function handleInstantEdgeLogin(context, payload, bodyText) {
  const { env } = context;
  if (!env?.DB || !payload) return null;

  const cleanUser = String(payload.username || '').trim().toLowerCase();
  if (!cleanUser || (!payload.password && !payload.passwordHash)) {
    return null;
  }

  try {
    const cachedRow = await env.DB.prepare(
      `SELECT username, password_hash, user_json, updated_at FROM edge_auth_cache WHERE username = ?1 LIMIT 1`
    )
      .bind(cleanUser)
      .first()
      .catch(() => null);

    if (!cachedRow || !cachedRow.password_hash || !cachedRow.user_json) {
      return null;
    }

    const now = Date.now();
    const ageMs = now - Number(cachedRow.updated_at || 0);
    if (ageMs > EDGE_AUTH_CACHE_TTL_MS) {
      return null;
    }

    const incomingHash = await computeEdgeSaltedPasswordHash(payload.password, payload.passwordHash);
    if (!incomingHash || !timingSafeEqualStr(cachedRow.password_hash, incomingHash)) {
      // Never reject from stale cache: fall through to GAS in case password was updated directly in Sheet
      return null;
    }

    const userObj = JSON.parse(cachedRow.user_json);
    // Honor automatic reactivation if temporary suspension window expired
    if (userObj.employmentStatus === 'suspended' && userObj.statusUntil) {
      const untilMs = Date.parse(`${userObj.statusUntil}T23:59:59+07:00`);
      if (Number.isFinite(untilMs) && untilMs < now) {
        userObj.employmentStatus = 'active';
        userObj.statusUntil = '';
        userObj.statusReason = 'Tự động kích hoạt lại sau thời hạn đình chỉ';
      }
    }

    const loginRole = String(userObj.role || (cleanUser === 'admin' ? 'admin' : 'user'))
      .trim()
      .toLowerCase();
    const sessionToken = await signEdgeSessionToken(
      { u: cleanUser, r: loginRole, exp: now + 7 * 86400 * 1000 },
      getEdgeSecret(env)
    );

    if (ageMs > EDGE_AUTH_REVALIDATE_AFTER_MS) {
      context.waitUntil(revalidateAuthEntryFromGas(env, cleanUser, payload, bodyText));
    }

    return jsonResponse(
      {
        ok: true,
        data: {
          ...userObj,
          sessionToken,
        },
      },
      200,
      {
        'X-Edge-Auth': 'D1-INSTANT',
        'X-Edge-DB': 'D1-AUTH-HIT',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    );
  } catch {
    return null;
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

  // Fast D1 employment eligibility precheck (<5ms)
  if (env?.DB && cleanUser) {
    const profRow = await env.DB.prepare(
      `SELECT employment_status FROM edge_face_profiles WHERE username = ?1 LIMIT 1`
    )
      .bind(cleanUser)
      .first()
      .catch(() => null);
    const empSt = String(profRow?.employment_status || 'active').trim().toLowerCase();
    if (empSt === 'resigned' || empSt === 'suspended') {
      return jsonResponse(
        { ok: false, message: 'Trạng thái nhân sự hiện tại không được đăng ký ca' },
        200,
        { 'X-Edge-DB': 'D1-INACTIVE-BLOCKED' }
      );
    }
  }

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

  // Only fall back to KV schedule persistence when D1 is unavailable (prevents redundant KV daily write quota burn)
  if (!d1Persisted && env?.KG_EDGE_DB) {
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

  // Step 2: Invalidate stale read caches in D1/KV (targeted only to schedule/data reads)
  context.waitUntil(invalidateEdgeReadCaches(env, ['GET_DATA', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES']));

  // Clean bodyText for GAS (strip instantEdge flag)
  const gasPayloadObj = { ...payload };
  delete gasPayloadObj.instantEdge;
  const gasBodyText = JSON.stringify({ ...gasPayloadObj, action: 'REGISTER_SHIFT' });

  // Step 2.5: Instant Edge Write-Ahead (<50ms) when client requests instantEdge=true & D1 committed safely
  if (payload.instantEdge === true && d1Persisted && env?.DB) {
    const dedupeKey = `REGISTER_SHIFT:${scheduleId}`;
    await env.DB.prepare(
      `INSERT INTO edge_sync_queue (dedupe_key, action, payload_json, attempts, status, created_at, updated_at)
       VALUES (?1, 'REGISTER_SHIFT', ?2, 0, 'processing', ?3, ?3)
       ON CONFLICT(dedupe_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         status = 'processing',
         updated_at = excluded.updated_at`
    )
      .bind(dedupeKey, JSON.stringify(gasPayloadObj), now)
      .run()
      .catch(() => {});

    context.waitUntil(
      syncScheduleToGasWithRetry(env, scheduleId, gasPayloadObj, gasBodyText).then(async (syncOutcome) => {
        if (syncOutcome && syncOutcome.ok === false && syncOutcome.gasResult && syncOutcome.gasResult.ok === false) {
          // Business rule rejection (e.g., employee suspended/resigned) -> rollback D1 schedule & queue entry
          await env.DB.prepare(`DELETE FROM edge_schedules WHERE id = ?1`).bind(scheduleId).run().catch(() => {});
          await env.DB.prepare(`DELETE FROM edge_sync_queue WHERE dedupe_key = ?1`).bind(dedupeKey).run().catch(() => {});
          await invalidateEdgeReadCaches(env, ['GET_DATA', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES']);
        }
      })
    );

    return jsonResponse(
      {
        ok: true,
        message: 'Đã ghi nhận lịch làm việc tức thì! Đang tự động đồng bộ vào Google Sheets...',
        data: {
          instantEdgeCommitted: true,
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
      {
        'X-Edge-DB': 'D1-INSTANT-SCHEDULE-COMMITTED',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    );
  }

  // Step 3: Legacy synchronous write-through to Google Apps Script (up to 24.5s matching GAS LockService 25s)
  const gasSyncPromise = syncScheduleToGasWithRetry(env, scheduleId, gasPayloadObj, gasBodyText);
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
        `SELECT id, username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, sheet_synced, created_at
         FROM edge_checkin_logs
         WHERE created_at >= ?1
         ORDER BY created_at DESC
         LIMIT 250`
      )
        .bind(cutoff)
        .all();

      if (recentLogsRes?.results?.length > 0 && Array.isArray(data.logs)) {
        const makeLogDedupKey = (u, fn, t, tp) => {
          const cleanU = String(u || '').trim().toLowerCase();
          const cleanFn = String(fn || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
          return `${cleanU || cleanFn}|${String(t || '').replace(/^'/, '').trim()}|${String(tp || '').trim().toLowerCase()}`;
        };
        const existingByKey = new Map();
        const existingByCheckinId = new Map();
        const existingLooseNameByKey = new Map();
        for (const l of data.logs) {
          existingByKey.set(makeLogDedupKey(l.username, l.fullname, l.time, l.type), l);
          if (l.checkinId) {
            existingByCheckinId.set(String(l.checkinId).trim(), l);
          }
          if (!String(l.username || '').trim()) {
            const lk = `${String(l.fullname || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()}|${String(l.time || '').replace(/^'/, '').trim()}|${String(l.type || '').trim().toLowerCase()}`;
            existingLooseNameByKey.set(lk, l);
          }
        }
        const missingLogs = [];
        for (const r of recentLogsRes.results) {
          // Non-admin staff must ONLY see their own check-in GPS & selfie logs (strict username isolation)
          if (!isStrictlyAdmin) {
            if (!matchesEdgeEmployeeIdentity(username, fullname, r.username, r.fullname)) {
              continue;
            }
          }
          const cleanTime = String(r.time_str || '').replace(/^'/, '').trim();
          const cleanType = String(r.check_type || '').trim().toLowerCase();
          const key = makeLogDedupKey(r.username, r.fullname, cleanTime, cleanType);
          const looseNameKey = `${String(r.fullname || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()}|${cleanTime}|${cleanType}`;
          const isSheetSynced = r.sheet_synced === undefined ? true : Number(r.sheet_synced) !== 0;
          const d1DriveUrl = typeof r.image_url === 'string' && r.image_url.startsWith('http') ? r.image_url : '';
          const matchedExisting =
            existingByCheckinId.get(String(r.id || '').trim()) ||
            existingByKey.get(key) ||
            existingLooseNameByKey.get(looseNameKey);

          if (matchedExisting) {
            // Patch confirmed Google Drive photo link from D1 immediately onto cached GAS rows still showing PENDING/empty
            if (
              d1DriveUrl &&
              (!matchedExisting.image ||
                matchedExisting.image === 'PENDING' ||
                !String(matchedExisting.image).startsWith('http'))
            ) {
              matchedExisting.image = d1DriveUrl;
            }
            continue;
          }

          const newOverlayLog = {
            checkinId: r.id,
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
            sheetSynced: isSheetSynced,
            edgeBuffered: !isSheetSynced,
            timestamp: parseEdgeVietnamTimestampMs(r.time_str) || Number(r.created_at || Date.now()),
          };
          existingByKey.set(key, newOverlayLog);
          if (r.id) existingByCheckinId.set(String(r.id).trim(), newOverlayLog);
          missingLogs.push(newOverlayLog);
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
      const callerName = String(payload.fullname || '').trim();
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
      const targetFullname = isStrictlyAdmin
        ? reqName && reqName !== 'ALL'
          ? reqName
          : ''
        : callerName;

      const cutoff7d = Date.now() - 7 * 86400 * 1000;
      const d1LogsRes = await env.DB.prepare(
        `SELECT id, username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, sheet_synced, created_at
         FROM edge_checkin_logs
         WHERE created_at >= ?1
         ORDER BY created_at DESC
         LIMIT 500`
      )
        .bind(cutoff7d)
        .all();

      if (d1LogsRes?.results?.length > 0) {
        const makeLogDedupKey = (u, fn, t, tp) => {
          const cleanU = String(u || '').trim().toLowerCase();
          const cleanFn = String(fn || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
          return `${cleanU || cleanFn}|${String(t || '').replace(/^'/, '').trim()}|${String(tp || '').trim().toLowerCase()}`;
        };
        const existingByKey = new Map();
        const existingByCheckinId = new Map();
        const existingLooseNameByKey = new Map();
        for (const l of baseLogs) {
          existingByKey.set(makeLogDedupKey(l.username, l.fullname, l.time, l.type), l);
          if (l.checkinId) {
            existingByCheckinId.set(String(l.checkinId).trim(), l);
          }
          if (!String(l.username || '').trim()) {
            const lk = `${String(l.fullname || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()}|${String(l.time || '').replace(/^'/, '').trim()}|${String(l.type || '').trim().toLowerCase()}`;
            existingLooseNameByKey.set(lk, l);
          }
        }
        const monthsSet = new Set(Array.isArray(data.availableMonths) ? data.availableMonths : []);
        const missingLogs = [];

        for (const r of d1LogsRes.results) {
          if (!filterAllUsers) {
            if (!matchesEdgeEmployeeIdentity(targetUser, targetFullname, r.username, r.fullname)) {
              continue;
            }
          }

          const cleanTime = String(r.time_str || '').replace(/^'/, '').trim();
          const ym = extractYmFromVietnamTime(cleanTime);
          if (ym) monthsSet.add(ym);
          if (requestedMonth && requestedMonth !== 'ALL' && ym && ym !== requestedMonth) {
            continue;
          }

          const cleanType = String(r.check_type || '').trim().toLowerCase();
          const key = makeLogDedupKey(r.username, r.fullname, cleanTime, cleanType);
          const looseNameKey = `${String(r.fullname || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()}|${cleanTime}|${cleanType}`;
          const isSheetSynced = r.sheet_synced === undefined ? true : Number(r.sheet_synced) !== 0;
          const d1DriveUrl = typeof r.image_url === 'string' && r.image_url.startsWith('http') ? r.image_url : '';
          const matchedExisting =
            existingByCheckinId.get(String(r.id || '').trim()) ||
            existingByKey.get(key) ||
            existingLooseNameByKey.get(looseNameKey);

          if (matchedExisting) {
            if (
              d1DriveUrl &&
              (!matchedExisting.image ||
                matchedExisting.image === 'PENDING' ||
                !String(matchedExisting.image).startsWith('http'))
            ) {
              matchedExisting.image = d1DriveUrl;
            }
            continue;
          }

          const newOverlayLog = {
            checkinId: r.id,
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
            sheetSynced: isSheetSynced,
            edgeBuffered: !isSheetSynced,
            timestamp: parseEdgeVietnamTimestampMs(r.time_str) || Number(r.created_at || Date.now()),
          };
          existingByKey.set(key, newOverlayLog);
          if (r.id) existingByCheckinId.set(String(r.id).trim(), newOverlayLog);
          missingLogs.push(newOverlayLog);
        }

        const merged = [...missingLogs, ...baseLogs];
        merged.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
        data.logs = merged;
        data.totalCount = merged.length;
        data.availableMonths = Array.from(monthsSet).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
      } else {
        data.logs = baseLogs;
      }

      // Always recompute stats with unified Vào 1..Ra 2 classifiers (ignoring 'Kiểm tra')
      const allLogsForStats = Array.isArray(data.logs) ? data.logs : baseLogs;
      let totalCheckIn = 0;
      let totalCheckOut = 0;
      let validCount = 0;
      for (const item of allLogsForStats) {
        if (isEdgeCheckInLabel(item.type)) totalCheckIn++;
        else if (isEdgeCheckOutLabel(item.type)) totalCheckOut++;
        const sUpper = String(item.status || '').toUpperCase();
        if (sUpper.includes('HỢP LỆ') && !sUpper.includes('KHÔNG')) validCount++;
      }
      data.stats = {
        totalPunches: allLogsForStats.length,
        totalCheckIn,
        totalCheckOut,
        validCount,
      };

      cloned.data = data;
      return cloned;
    }

    if (action === 'GET_FACE_PROFILES') {
      return await overlayFaceProfilesFromD1(resultObj, env);
    }

    if (action === 'GET_KIOSK_ATTENDANCE_STATE') {
      return await overlayKioskAttendanceStateFromD1(resultObj, env, payload, isStrictlyAdmin);
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
      const logId = String(
        payload.checkinId ||
          gasResult?.data?.checkinId ||
          `${payload.username || payload.fullname}_${now}`
      );
      const timeStr =
        gasResult?.data?.time ||
        payload.time ||
        payload.clientTime ||
        new Date(now + 7 * 3600 * 1000).toLocaleString('vi-VN');
      const rawImg = String(gasResult?.data?.imageUrl || payload.image || '');
      const cleanImgUrl = rawImg.startsWith('data:image') ? 'PENDING' : rawImg;
      const rawPunchType = String(gasResult?.data?.type || payload.type || 'Vào ca').trim();
      const unifiedPunchType = rawPunchType
        .replace(/^(?:vào(?:\s+ca)?(?:\s*[1-9])?|in(?:\s*[1-9])?)(?=\s*$|\s*\(|\s+-)/i, 'Vào ca')
        .replace(/^(?:ra(?:\s+ca)?(?:\s*[1-9])?|out(?:\s*[1-9])?)(?=\s*$|\s*\(|\s+-)/i, 'Ra ca');
      const isOfflineRetryWrite =
        payload.isOfflineRetry === true || payload.isOfflineRetry === 'true';
      const parsedPunchMs = parseEdgeVietnamTimestampMs(timeStr);
      const effectiveCreatedAt =
        isOfflineRetryWrite && parsedPunchMs > 0 && parsedPunchMs <= now + 180000
          ? Math.min(parsedPunchMs, now)
          : now;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO edge_checkin_logs
         (id, username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, sheet_synced, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13)`
      )
        .bind(
          logId,
          String(payload.username || '').trim().toLowerCase(),
          String(gasResult?.data?.fullname || payload.fullname || '').trim(),
          unifiedPunchType,
          String(payload.shift || ''),
          String(timeStr),
          String(gasResult?.data?.status || payload.status || 'Hợp lệ'),
          Number(payload.distance || 0),
          payload.lat ?? null,
          payload.lng ?? null,
          String(payload.note || ''),
          cleanImgUrl,
          effectiveCreatedAt
        )
        .run();

      // Prune logs older than 7 days in D1 to keep DB ultra-compact
      await env.DB.prepare(`DELETE FROM edge_checkin_logs WHERE created_at < ?1`)
        .bind(now - 7 * 86400 * 1000)
        .run();
    }

    if (action === 'UPLOAD_CHECKIN_IMAGE') {
      const uploadedUrl = String(gasResult?.data?.url || gasResult?.data?.imageUrl || '').trim();
      const targetId = String(payload.checkinId || '').trim();
      const targetUser = String(payload.username || '').trim().toLowerCase();
      const targetTimeStr = String(payload.time || '').trim();
      if (uploadedUrl && (targetId || targetUser)) {
        await updateEdgeCheckinLogImageUrl(env.DB, uploadedUrl, targetId, targetUser, targetTimeStr);
      }
    }

    if (action === 'SUBMIT_MISSED_CHECKIN') {
      const claimId = String(gasResult?.data?.id || `MC_${now}`).trim();
      const rawSuppType = String(gasResult?.data?.canonicalType || payload.type || 'Vào ca')
        .replace(/^\s*(?:chờ\s*duyệt|từ\s*chối)\s*:\s*/i, '')
        .trim();
      const canonicalType = /^(?:ra(?:\s+ca)?(?:\s*[1-9])?|out)\b/i.test(rawSuppType)
        ? 'Ra ca'
        : 'Vào ca';
      const pendingType = `Chờ duyệt: ${canonicalType}`;
      const effectiveTime = String(
        gasResult?.data?.effectiveTime ||
          `${payload.date || ''} ${String(payload.time || '').length === 5 ? `${payload.time}:00` : payload.time || '00:00:00'}`
      ).trim();
      const rawImg = String(payload.image || '');
      const cleanImg = rawImg.startsWith('data:image') ? '' : rawImg;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO edge_checkin_logs
         (id, username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, sheet_synced, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13)`
      )
        .bind(
          claimId,
          String(payload.username || '').trim().toLowerCase(),
          String(payload.fullname || payload.username || '').trim(),
          pendingType,
          String(payload.shift || ''),
          effectiveTime,
          'Chờ Admin duyệt',
          0,
          null,
          null,
          String(payload.reason || 'Bổ sung chấm công'),
          cleanImg,
          now
        )
        .run();
    }

    if (action === 'APPROVE_MISSED_CHECKIN') {
      const claimId = String(gasResult?.data?.id || payload.id || '').trim();
      const rawApproved = String(gasResult?.data?.type || 'Vào ca').trim();
      const approvedType = /^(?:ra(?:\s+ca)?(?:\s*[1-9])?|out)\b/i.test(rawApproved)
        ? 'Ra ca'
        : 'Vào ca';
      const approvedStatus = String(gasResult?.data?.status || 'Hợp lệ').trim();
      if (claimId) {
        await env.DB.prepare(
          `UPDATE edge_checkin_logs SET check_type = ?1, status = ?2 WHERE id = ?3`
        )
          .bind(approvedType, approvedStatus, claimId)
          .run();
        if (gasResult?.data?.username && gasResult?.data?.time) {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO edge_checkin_logs
             (id, username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, sheet_synced, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13)`
          )
            .bind(
              claimId,
              String(gasResult.data.username || '').trim().toLowerCase(),
              String(gasResult.data.fullname || gasResult.data.username || '').trim(),
              approvedType,
              '',
              String(gasResult.data.time || ''),
              approvedStatus,
              0,
              null,
              null,
              'Giải trình bổ sung (Đã duyệt)',
              '',
              now
            )
            .run();
        }
      }
    }

    if (action === 'REJECT_MISSED_CHECKIN') {
      const claimId = String(gasResult?.data?.id || payload.id || '').trim();
      const rawRejected = String(gasResult?.data?.type || 'Từ chối: Vào ca')
        .replace(/^\s*từ\s*chối\s*:\s*/i, '')
        .trim();
      const rejectedType = `Từ chối: ${/^(?:ra(?:\s+ca)?(?:\s*[1-9])?|out)\b/i.test(rawRejected) ? 'Ra ca' : 'Vào ca'}`;
      if (claimId) {
        await env.DB.prepare(
          `UPDATE edge_checkin_logs SET check_type = ?1, status = ?2 WHERE id = ?3`
        )
          .bind(rejectedType, 'Không hợp lệ (Từ chối)', claimId)
          .run();
      }
    }

    if (action === 'UPDATE_CHECKIN_TYPE') {
      const targetTime = String(payload.time || '').replace(/^'/, '').trim();
      const nextType = String(payload.newType || '').trim();
      const targetUser = String(payload.targetUsername || '').trim().toLowerCase();
      if (targetTime && nextType) {
        if (targetUser) {
          await env.DB.prepare(
            `UPDATE edge_checkin_logs SET check_type = ?1 WHERE time_str = ?2 AND username = ?3`
          )
            .bind(nextType, targetTime, targetUser)
            .run();
        } else {
          await env.DB.prepare(
            `UPDATE edge_checkin_logs SET check_type = ?1 WHERE time_str = ?2`
          )
            .bind(nextType, targetTime)
            .run();
        }
      }
    }

    if (action === 'ENROLL_FACE_PROFILE') {
      await upsertFaceProfileInD1(env.DB, payload, now);
    }

    if (action === 'RESET_FACE_PROFILE') {
      const resetUser = String(payload.targetUsername || payload.usernameToReset || '')
        .trim()
        .toLowerCase();
      if (resetUser) {
        await env.DB.prepare(`DELETE FROM edge_face_profiles WHERE username = ?1`)
          .bind(resetUser)
          .run();
      }
    }

    if (action === 'UPDATE_GPS_CONFIG') {
      const latNum = Number(payload.lat);
      const lngNum = Number(payload.lng);
      const radNum = Number(payload.radius) || 25;
      if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
        const nextGps = { lat: latNum, lng: lngNum, radius: radNum };
        lastSavedGpsConfigJson = JSON.stringify(nextGps);
        lastSavedGpsConfigAtMs = now;
        await writeEdgeCache(
          env,
          'sys:gps_config',
          'GPS_CONFIG',
          nextGps,
          7 * 86400 * 1000
        );
      }
    }

    if (action === 'UPDATE_EMPLOYMENT_STATUS') {
      const targetUser = String(payload.targetUsername || payload.username || '')
        .trim()
        .toLowerCase();
      const nextStatus = String(payload.employmentStatus || payload.status || '')
        .trim()
        .toLowerCase();
      if (targetUser && nextStatus) {
        await env.DB.prepare(
          `UPDATE edge_face_profiles SET employment_status = ?1, updated_at = ?2 WHERE username = ?3`
        )
          .bind(nextStatus, now, targetUser)
          .run();
        await env.DB.prepare(`DELETE FROM edge_auth_cache WHERE username = ?1`)
          .bind(targetUser)
          .run()
          .catch(() => {});
      }
    }

    if (
      action === 'FORCE_RESET_PASSWORD' ||
      action === 'UPDATE_USER_ROLE' ||
      action === 'UPDATE_USER_POSITION' ||
      action === 'UPLOAD_AVATAR'
    ) {
      const targetUser = String(
        payload.targetUsername || payload.usernameToReset || payload.username || ''
      )
        .trim()
        .toLowerCase();
      if (targetUser) {
        await env.DB.prepare(`DELETE FROM edge_auth_cache WHERE username = ?1`)
          .bind(targetUser)
          .run()
          .catch(() => {});
      }
    }

    if (action === 'RESET_PASSWORD') {
      const resetEmail = String(payload.email || '').trim().toLowerCase();
      if (resetEmail) {
        await env.DB.prepare(`DELETE FROM edge_auth_cache WHERE lower(email) = ?1`)
          .bind(resetEmail)
          .run()
          .catch(() => {});
      } else {
        await env.DB.prepare(`DELETE FROM edge_auth_cache`).run().catch(() => {});
      }
    }

    if (action === 'REGISTER' && payload.username && (payload.password || payload.passwordHash)) {
      const regUser = String(payload.username).trim();
      await cacheAuthProfileInD1(env.DB, payload, {
        username: regUser,
        fullname: String(payload.fullname || regUser).trim(),
        email: String(payload.email || '').trim(),
        role: 'user',
        position: 'Phục vụ',
        avatarUrl: '',
        employmentStatus: 'active',
        statusUntil: '',
        statusReason: '',
        statusUpdatedAt: '',
      });
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

    // Targeted cache invalidation: only purge read actions affected by this mutation (prevents global cache stampede)
    const targetCacheActions = getEdgeInvalidationActionsForMutation(action);
    if (targetCacheActions === null) {
      await invalidateEdgeReadCaches(env);
    } else if (targetCacheActions.length > 0) {
      await invalidateEdgeReadCaches(env, targetCacheActions);
    }
  } catch (e) {
    console.warn('[D1 Mutation Hook] error:', e);
  }
}

async function updateEdgeCheckinLogImageUrl(db, uploadedUrl, checkinId, targetUser, targetTimeStr = '') {
  if (!db || !uploadedUrl) return;
  try {
    if (checkinId) {
      const exactRes = await db
        .prepare(`UPDATE edge_checkin_logs SET image_url = ?1 WHERE id = ?2`)
        .bind(uploadedUrl, checkinId)
        .run()
        .catch(() => null);
      if (exactRes?.meta && Number(exactRes.meta.changes || 0) > 0) {
        return;
      }
    }
    if (targetUser && targetTimeStr) {
      const timeRes = await db
        .prepare(
          `UPDATE edge_checkin_logs SET image_url = ?1 WHERE username = ?2 AND time_str = ?3 AND (image_url = '' OR image_url = 'PENDING')`
        )
        .bind(uploadedUrl, targetUser, targetTimeStr)
        .run()
        .catch(() => null);
      if (timeRes?.meta && Number(timeRes.meta.changes || 0) > 0) {
        return;
      }
    }
    if (targetUser) {
      // Fallback: update ONLY the single newest PENDING row for this user (never clobber multiple punches)
      const latestPending = await db
        .prepare(
          `SELECT id FROM edge_checkin_logs WHERE username = ?1 AND (image_url = '' OR image_url = 'PENDING') ORDER BY created_at DESC LIMIT 1`
        )
        .bind(targetUser)
        .first()
        .catch(() => null);
      if (latestPending?.id) {
        await db
          .prepare(`UPDATE edge_checkin_logs SET image_url = ?1 WHERE id = ?2`)
          .bind(uploadedUrl, latestPending.id)
          .run()
          .catch(() => {});
      }
    }
  } catch {}
}

// ============================================================================
// 4. L2 Edge Cache Helpers (Cloudflare D1 Primary; KV Strictly as Unbound Fallback)
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
      // When D1 is bound, never fall through to KV on cache misses (protects KV read quota)
      return null;
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

async function writeEdgeCache(env, cacheKey, action, dataObj, ttlMs, options = {}) {
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
      // When D1 is bound, D1 `edge_kv_cache` serves both SWR & 24h GAS outage failover (0 KV writes!)
      return;
    }
    if (env?.KG_EDGE_DB && options?.allowKvFallback !== false) {
      await env.KG_EDGE_DB.put(
        cacheKey,
        JSON.stringify({ data: dataObj, updatedAt: now, expiresAt }),
        { expirationTtl: 86400 } // Keep 24h in KV only when D1 is unbound
      );
    }
  } catch {}
}

async function pruneStaleEdgeCacheInD1(db) {
  try {
    const cutoff = Date.now() - EDGE_CACHE_MAX_RETENTION_MS;
    await db
      .prepare(`DELETE FROM edge_kv_cache WHERE cache_key LIKE 'cache:%' AND updated_at < ?1`)
      .bind(cutoff)
      .run();
  } catch {}
}

async function invalidateEdgeReadCaches(env, actions = null) {
  try {
    lastBioFailoverSnapshotMap.clear();
    if (env?.DB) {
      if (Array.isArray(actions) && actions.length > 0) {
        for (const act of actions) {
          await env.DB.prepare(`DELETE FROM edge_kv_cache WHERE action = ?1`).bind(act).run();
        }
      } else {
        await env.DB.prepare(`DELETE FROM edge_kv_cache WHERE cache_key LIKE 'cache:%'`).run();
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

async function revalidateLiveBiometricFromGas(context, action, payload, bodyText, edgeCacheKey) {
  const { env } = context;
  if (!env?.DB) return;
  const fetchFn = fetch;
  try {
    const gasRes = await fetchFn(TARGET_GAS_URL, {
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
      if (action === 'GET_FACE_PROFILES' && Array.isArray(parsed?.data?.profiles)) {
        const validGasUsers = new Set();
        for (const p of parsed.data.profiles) {
          if (p?.username && p?.vectorsB64) {
            const decodedGasVecs = decodeInt8VectorsEdge(String(p.vectorsB64), EDGE_FACE_DIM);
            if (decodedGasVecs.length === 0) continue;
            const uname = String(p.username).trim().toLowerCase();
            validGasUsers.add(uname);
            const existing = await env.DB.prepare(
              `SELECT username FROM edge_face_profiles WHERE username = ?1 LIMIT 1`
            )
              .bind(uname)
              .first()
              .catch(() => null);
            if (!existing) {
              await upsertFaceProfileInD1(env.DB, p, Date.now()).catch(() => {});
            }
          }
        }

        // Background Self-Healing: Push any intact D1 profile whose GAS row became #ERROR! or went missing
        const d1RowsRes = await env.DB.prepare(
          `SELECT username, fullname, role, position, avatar_url, employment_status, model_version, angle_count, vectors_b64, quality_score, enrolled_by
           FROM edge_face_profiles`
        )
          .all()
          .catch(() => null);
        const nowMs = Date.now();
        for (const d1Row of d1RowsRes?.results || []) {
          const uname = String(d1Row?.username || '').trim().toLowerCase();
          const st = String(d1Row?.employment_status || 'active').toLowerCase();
          if (!uname || st === 'resigned' || st === 'suspended') continue;
          if (!validGasUsers.has(uname)) {
            const lastHealedAt = Number(lastFaceHealMap.get(uname) || 0);
            if (nowMs - lastHealedAt >= FACE_HEAL_COOLDOWN_MS) {
              lastFaceHealMap.set(uname, nowMs);
              await healFaceProfileToGas(env, d1Row, fetchFn).catch(() => {});
            }
          }
        }
      }
      const overlaid = await applyD1Overlays(action, payload, parsed, env);
      if (shouldPersistFailoverSnapshot(edgeCacheKey, overlaid)) {
        await writeEdgeCache(env, edgeCacheKey, action, overlaid, 120000, {
          allowKvFallback: false,
        });
      }
    }
  } catch {}
}

// ============================================================================
// 5. Background Sync Queue Drain (`edge_sync_queue` -> Google Sheets & Drive)
// ============================================================================
function getEdgeSyncPriority(action) {
  if (action === 'REGISTER_SHIFT') return 0;
  if (action === 'CHECK_IN_OUT' || action === 'CHECK_IN') return 1;
  if (action === 'ENROLL_FACE_PROFILE') return 2;
  if (action === 'UPLOAD_CHECKIN_IMAGE') return 3;
  return 4;
}

async function drainEdgeSyncQueue(env, targetGasUrl) {
  if (!env?.DB) return;
  if (drainInFlightPromise) {
    return drainInFlightPromise;
  }
  drainInFlightPromise = runDrainEdgeSyncQueue_(env, targetGasUrl).finally(() => {
    drainInFlightPromise = null;
  });
  return drainInFlightPromise;
}

async function runDrainEdgeSyncQueue_(env, targetGasUrl) {
  if (!env?.DB) return;
  try {
    // Reclaim any stalled 'processing' leases older than 45s from terminated isolates
    await env.DB.prepare(
      `UPDATE edge_sync_queue SET status = 'pending', updated_at = ?1 WHERE status = 'processing' AND updated_at < ?2`
    )
      .bind(Date.now(), Date.now() - 45000)
      .run()
      .catch(() => {});

    const pending = await env.DB.prepare(
      `SELECT id, dedupe_key, action, payload_json, attempts
       FROM edge_sync_queue
       WHERE status = 'pending' AND attempts < 30
       ORDER BY CASE
         WHEN action = 'REGISTER_SHIFT' THEN 0
         WHEN action = 'CHECK_IN_OUT' OR action = 'CHECK_IN' THEN 1
         WHEN action = 'ENROLL_FACE_PROFILE' THEN 2
         WHEN action = 'UPLOAD_CHECKIN_IMAGE' THEN 3
         ELSE 4
       END, updated_at ASC
       LIMIT 8`
    ).all();

    if (!pending?.results?.length) return;

    const sortedItems = [...pending.results].sort(
      (a, b) => getEdgeSyncPriority(a.action) - getEdgeSyncPriority(b.action)
    );

    const syncedCheckinIdsForImages = [];

    for (const item of sortedItems) {
      try {
        const payloadObj = JSON.parse(item.payload_json);

        // Strict ordering invariant: NEVER push UPLOAD_CHECKIN_IMAGE to GAS before its CHECK_IN_OUT row is synced to Google Sheets!
        if (item.action === 'UPLOAD_CHECKIN_IMAGE') {
          const targetCheckinId = String(
            payloadObj?.checkinId ||
              String(item.dedupe_key || '').replace(/^UPLOAD_CHECKIN_IMAGE:/, '')
          ).trim();
          if (targetCheckinId) {
            const logState = await env.DB.prepare(
              `SELECT sheet_synced, fullname FROM edge_checkin_logs WHERE id = ?1 LIMIT 1`
            )
              .bind(targetCheckinId)
              .first()
              .catch(() => null);
            if (logState && Number(logState.sheet_synced) === 0) {
              continue;
            }
            if (logState?.fullname) {
              payloadObj.fullname = String(logState.fullname).trim();
            }
          }
        }

        const claimRes = await env.DB.prepare(
          `UPDATE edge_sync_queue SET status = 'processing', updated_at = ?1 WHERE id = ?2 AND status = 'pending'`
        )
          .bind(Date.now(), item.id)
          .run()
          .catch(() => null);
        if (claimRes?.meta && typeof claimRes.meta.changes === 'number' && claimRes.meta.changes === 0) {
          continue;
        }

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
        let parsed = await res.json();

        if (
          (!parsed || parsed.ok !== true) &&
          (item.action === 'CHECK_IN_OUT' || item.action === 'CHECK_IN') &&
          String(parsed?.code || parsed?.data?.code || '').trim() === 'SCHEDULE_REQUIRED'
        ) {
          const healed = await trySelfHealScheduleForCheckIn(env, payloadObj, parsed);
          if (healed) {
            const retryRes = await fetch(targetGasUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: bodyStr,
              signal:
                typeof AbortSignal !== 'undefined' && AbortSignal.timeout
                  ? AbortSignal.timeout(25000)
                  : undefined,
            });
            parsed = await retryRes.json();
          }
        }

        const isIdempotentSaved =
          (item.action === 'CHECK_IN_OUT' || item.action === 'CHECK_IN') &&
          String(parsed?.code || parsed?.data?.code || '').trim() === 'ALREADY_CHECKED_IN';

        if ((parsed && parsed.ok === true) || isIdempotentSaved) {
          await env.DB.prepare(`DELETE FROM edge_sync_queue WHERE id = ?1`).bind(item.id).run();
          if (item.action === 'REGISTER_SHIFT' && String(item.dedupe_key || '').startsWith('REGISTER_SHIFT:')) {
            const schedId = item.dedupe_key.replace(/^REGISTER_SHIFT:/, '');
            await env.DB.prepare(
              `UPDATE edge_schedules SET sheet_synced = 1, updated_at = ?1 WHERE id = ?2`
            )
              .bind(Date.now(), schedId)
              .run();
            await invalidateEdgeReadCaches(env, ['GET_DATA', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES']);
          } else if (item.action === 'CHECK_IN_OUT' || item.action === 'CHECK_IN') {
            const checkinId = String(
              payloadObj?.checkinId || String(item.dedupe_key || '').replace(/^CHECK_IN_OUT:/, '')
            ).trim();
            if (checkinId) {
              await env.DB.prepare(`UPDATE edge_checkin_logs SET sheet_synced = 1 WHERE id = ?1`)
                .bind(checkinId)
                .run();
              const canonicalFullname = String(
                parsed?.data?.fullname || parsed?.data?.hoVaTen || ''
              ).trim();
              if (canonicalFullname) {
                await env.DB.prepare(`UPDATE edge_checkin_logs SET fullname = ?1 WHERE id = ?2`)
                  .bind(canonicalFullname, checkinId)
                  .run()
                  .catch(() => {});
              }
              syncedCheckinIdsForImages.push(checkinId);
            }
            await invalidateEdgeReadCaches(env, [
              'GET_DATA',
              'GET_CHECKIN_LOGS',
              'GET_KIOSK_ATTENDANCE_STATE',
            ]);
          } else if (item.action === 'UPLOAD_CHECKIN_IMAGE') {
            const uploadedUrl = String(parsed?.data?.url || parsed?.data?.imageUrl || '').trim();
            const targetId = String(
              payloadObj?.checkinId ||
                String(item.dedupe_key || '').replace(/^UPLOAD_CHECKIN_IMAGE:/, '')
            ).trim();
            const targetUser = String(payloadObj?.username || '').trim().toLowerCase();
            const targetTimeStr = String(payloadObj?.time || '').trim();
            if (uploadedUrl && (targetId || targetUser)) {
              await updateEdgeCheckinLogImageUrl(env.DB, uploadedUrl, targetId, targetUser, targetTimeStr);
            }
            await invalidateEdgeReadCaches(env, ['GET_DATA', 'GET_CHECKIN_LOGS']);
          } else {
            const invActions = getEdgeInvalidationActionsForMutation(item.action);
            if (Array.isArray(invActions) && invActions.length > 0) {
              await invalidateEdgeReadCaches(env, invActions);
            }
          }
        } else {
          await env.DB.prepare(
            `UPDATE edge_sync_queue SET attempts = attempts + 1, status = 'pending', last_error = ?1, updated_at = ?2 WHERE id = ?3`
          )
            .bind(String(parsed?.message || 'GAS returned ok=false'), Date.now(), item.id)
            .run();
        }
      } catch (err) {
        await env.DB.prepare(
          `UPDATE edge_sync_queue SET attempts = attempts + 1, status = 'pending', last_error = ?1, updated_at = ?2 WHERE id = ?3`
        )
          .bind(String(err?.message || 'Fetch error'), Date.now(), item.id)
          .run();
      }
    }

    // Immediately chain any staged proof photos waiting on check-ins that just landed in Google Sheets
    for (const cid of syncedCheckinIdsForImages) {
      await flushPendingImageForCheckin(env, cid, targetGasUrl).catch(() => {});
    }
  } catch {}
}

export function computeEdgeVietnamUpcomingWeekAndWindow(nowMs = Date.now()) {
  const vnShifted = new Date(Number(nowMs) + 7 * 3600 * 1000);
  const year = vnShifted.getUTCFullYear();
  const month = vnShifted.getUTCMonth();
  const day = vnShifted.getUTCDate();
  const dayOfWeek = vnShifted.getUTCDay(); // 0=Sun, 4=Thu, 5=Fri, 6=Sat
  const hour = vnShifted.getUTCHours();

  const isMandatoryWindow = dayOfWeek === 4 || dayOfWeek === 5 || (dayOfWeek === 6 && hour < 17);
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;

  const nextMonUtc = new Date(Date.UTC(year, month, day + daysUntilMonday, 5, 0, 0));
  const nextSunUtc = new Date(nextMonUtc.getTime() + 6 * 86400 * 1000);

  const monShifted = new Date(nextMonUtc.getTime() + 7 * 3600 * 1000);
  const sunShifted = new Date(nextSunUtc.getTime() + 7 * 3600 * 1000);

  const startDay = String(monShifted.getUTCDate()).padStart(2, '0');
  const startMonth = String(monShifted.getUTCMonth() + 1).padStart(2, '0');
  const startYear = monShifted.getUTCFullYear();
  const endDay = String(sunShifted.getUTCDate()).padStart(2, '0');
  const endMonth = String(sunShifted.getUTCMonth() + 1).padStart(2, '0');

  const weekDisplay = `${startDay}/${startMonth} - ${endDay}/${endMonth}`;
  return {
    isMandatoryWindow,
    dayOfWeek,
    hour,
    weekDisplay,
    weekLabel: `📅 TUẦN ${weekDisplay}`,
    monthSheet: `Tháng ${startMonth}/${startYear}`,
  };
}

function computeEdgeVietnamWorkdayStartMs(nowMs = Date.now()) {
  const vnShiftMs = 7 * 3600 * 1000;
  const vnRef = new Date(Number(nowMs) + vnShiftMs);
  const cycleDayOffset = vnRef.getUTCHours() < 6 ? -1 : 0;
  return (
    Date.UTC(
      vnRef.getUTCFullYear(),
      vnRef.getUTCMonth(),
      vnRef.getUTCDate() + cycleDayOffset,
      6,
      0,
      0,
      0
    ) - vnShiftMs
  );
}

async function handleInstantCheckInEdge(context, payload, _bodyText, verifiedSession = null) {
  const { env } = context;
  if (!env?.DB || !payload) return null;

  const rawPunchType = String(payload.type || 'Vào ca').trim();
  const isAttendancePunch =
    isEdgeCheckInLabel(rawPunchType) || isEdgeCheckOutLabel(rawPunchType);
  if (!isAttendancePunch) return null;

  const cleanUser = String(payload.username || '').trim().toLowerCase();
  let fullname = String(payload.fullname || cleanUser).trim();
  if (!cleanUser && !fullname) return null;

  let empRole = verifiedSession?.r
    ? String(verifiedSession.r).trim().toLowerCase()
    : String(payload.role || 'user').trim().toLowerCase();

  // Resolve canonical employee profile from D1 if enrolled/cached
  if (cleanUser) {
    const profRow = await env.DB.prepare(
      `SELECT fullname, role, employment_status FROM edge_face_profiles WHERE username = ?1 LIMIT 1`
    )
      .bind(cleanUser)
      .first()
      .catch(() => null);
    if (profRow) {
      const st = String(profRow.employment_status || 'active').toLowerCase();
      if (st === 'resigned' || st === 'suspended') {
        return jsonResponse(
          {
            ok: false,
            code: 'ACCOUNT_INACTIVE',
            data: { code: 'ACCOUNT_INACTIVE' },
            message: 'Tài khoản không trong trạng thái làm việc hoạt động.',
          },
          200,
          { 'X-Edge-CheckIn': 'INACTIVE' }
        );
      }
      if (profRow.fullname) {
        fullname = String(profRow.fullname).trim();
      }
      if (profRow.role && empRole !== 'admin') {
        empRole = String(profRow.role).trim().toLowerCase();
      }
    }
  }

  const now = Date.now();
  const isAuthorizedTest =
    cleanUser === 'admin' || cleanUser === 'testapp' || cleanUser === 'tester';
  const isOfflineRetry = payload.isOfflineRetry === true || payload.isOfflineRetry === 'true';
  const isFaceMode = String(payload.checkinMode || '').trim() === 'v2_face';

  // 1. Deterministic Geofence, Clock Desync & Photo Expiration Guards
  if (!isAuthorizedTest) {
    const gpsErr = await verifyEdgeKioskGpsGate(env, payload);
    if (gpsErr) {
      return jsonResponse(gpsErr, 200, { 'X-Edge-GPS': 'REJECTED' });
    }

    const clientMs = Number(payload.clientNowMs) || 0;
    if (!isOfflineRetry && clientMs > 0) {
      const driftMs = Math.abs(now - clientMs);
      if (driftMs > 180000) {
        return jsonResponse(
          {
            ok: false,
            code: 'CLOCK_DESYNC',
            data: { code: 'CLOCK_DESYNC' },
            message: `Từ chối chấm công: Đồng hồ thiết bị của bạn bị lệch ${Math.round(driftMs / 1000)} giây so với máy chủ chuẩn. Vui lòng bật chế độ "Tự động đặt giờ theo mạng" trên điện thoại.`,
          },
          200,
          { 'X-Edge-CheckIn': 'CLOCK-DESYNC' }
        );
      }
    }

    if (!isOfflineRetry && payload.photoCapturedMs) {
      const photoMs = Number(payload.photoCapturedMs);
      const refNowMs =
        clientMs > 0 && Math.abs(now - clientMs) <= 180000 ? clientMs : now;
      if (Number.isFinite(photoMs) && photoMs > 0) {
        const photoAgeSecs = Math.round((refNowMs - photoMs) / 1000);
        if (photoAgeSecs > 90) {
          return jsonResponse(
            {
              ok: false,
              code: 'PHOTO_EXPIRED',
              data: { code: 'PHOTO_EXPIRED', photoAgeSecs },
              message: `Từ chối chấm công: Ảnh chụp minh chứng đã hết hạn (${photoAgeSecs} giây trước, quy định tối đa 60 giây). Vui lòng chụp lại ảnh mới tại nhà hàng.`,
            },
            200,
            { 'X-Edge-CheckIn': 'PHOTO-EXPIRED' }
          );
        }
      }
    }
  }

  const logId = String(payload.checkinId || `CHK_EDGE_${cleanUser || 'staff'}_${now}`).trim();

  // 2. Workday 4-Punch Cap (06:00 -> 05:59 VN) — evaluated strictly against actual Vietnam punch timestamp (never historical supplement approval time)
  if (cleanUser && !isAuthorizedTest) {
    const workdayStartMs = computeEdgeVietnamWorkdayStartMs(now);
    const workdayEndMs = workdayStartMs + 24 * 3600 * 1000;
    const todayRowsRes = await env.DB.prepare(
      `SELECT id, check_type, time_str, status, note, created_at FROM edge_checkin_logs WHERE username = ?1 AND created_at >= ?2 LIMIT 30`
    )
      .bind(cleanUser, workdayStartMs - 24 * 3600 * 1000)
      .all()
      .catch(() => null);
    let validPunchCount = 0;
    for (const r of todayRowsRes?.results || []) {
      if (String(r.id || '').trim() === logId) continue;
      const punchTs = resolveEdgePunchTimestampMs(r);
      if (punchTs < workdayStartMs || punchTs >= workdayEndMs) continue;
      if (isEdgeCheckInLabel(r.check_type) || isEdgeCheckOutLabel(r.check_type)) {
        validPunchCount += 1;
      }
    }
    if (validPunchCount >= 4) {
      return jsonResponse(
        {
          ok: false,
          code: 'MAX_4_PUNCHES',
          data: { code: 'MAX_4_PUNCHES' },
          message:
            'Đã đủ tối đa 4 lượt chấm công (2 cặp Vào ca – Ra ca) trong chu kỳ làm việc 06:00 – 05:59 hôm nay.',
        },
        200,
        { 'X-Edge-CheckIn': 'MAX-4-PUNCHES' }
      );
    }
  }

  // 3. Mandatory Upcoming-Week Schedule Gate (Thu 00:00 -> Sat 16:59:59 VN)
  let scheduleWarning = false;
  const winInfo = computeEdgeVietnamUpcomingWeekAndWindow(now);
  if (!isAuthorizedTest && empRole !== 'admin' && winInfo.isMandatoryWindow) {
    const d1SchedRow = await env.DB.prepare(
      `SELECT shifts_json FROM edge_schedules
       WHERE month_sheet = ?1 AND week_label = ?2
         AND (username = ?3 OR lower(fullname) = ?4)
       LIMIT 1`
    )
      .bind(winInfo.monthSheet, winInfo.weekLabel, cleanUser, fullname.toLowerCase())
      .first()
      .catch(() => null);

    let hasValidD1Schedule = false;
    if (d1SchedRow?.shifts_json) {
      try {
        const parsedShifts = JSON.parse(d1SchedRow.shifts_json);
        hasValidD1Schedule =
          Array.isArray(parsedShifts) &&
          parsedShifts.length === 7 &&
          parsedShifts.every((s) => String(s || '').trim() !== '');
      } catch {}
    }

    if (!hasValidD1Schedule) {
      if (isFaceMode) {
        scheduleWarning = true;
      } else {
        // Fall through to synchronous GAS check so Sheet-direct registrations pass and unregistered staff get SCHEDULE_REQUIRED
        return null;
      }
    }
  }

  // 4. Instant D1 Write-Ahead Commit (<15ms) + Ordered Background Google Sheets Sync
  const timeStr = String(
    payload.actualTime || payload.time || payload.clientTime || formatVietnamTimestampFromMs(now)
  ).trim();
  const unifiedPunchType = rawPunchType
    .replace(/^(?:vào(?:\s+ca)?(?:\s*[1-9])?|in(?:\s*[1-9])?)(?=\s*$|\s*\(|\s+-)/i, 'Vào ca')
    .replace(/^(?:ra(?:\s+ca)?(?:\s*[1-9])?|out(?:\s*[1-9])?)(?=\s*$|\s*\(|\s+-)/i, 'Ra ca');
  const rawImg = String(payload.image || '');
  const cleanImgUrl = rawImg.startsWith('data:image') || !rawImg ? 'PENDING' : rawImg;
  const parsedPunchMs = parseEdgeVietnamTimestampMs(timeStr);
  const effectiveCreatedAt =
    isOfflineRetry && parsedPunchMs > 0 && parsedPunchMs <= now + 180000
      ? Math.min(parsedPunchMs, now)
      : now;

  await env.DB.prepare(
    `INSERT OR REPLACE INTO edge_checkin_logs
     (id, username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, sheet_synced, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, ?13)`
  )
    .bind(
      logId,
      cleanUser,
      fullname,
      unifiedPunchType,
      String(payload.shift || ''),
      timeStr,
      'Hợp lệ',
      Number(payload.distance || 0),
      payload.lat ?? null,
      payload.lng ?? null,
      String(payload.note || ''),
      cleanImgUrl,
      effectiveCreatedAt
    )
    .run();

  const queuePayload = {
    ...payload,
    checkinId: logId,
    username: cleanUser || payload.username,
    fullname,
    type: unifiedPunchType,
    time: timeStr,
    actualTime: timeStr,
    image: 'PENDING',
    isOfflineRetry: true,
    fastSync: true,
    sendEmailInline: false,
  };
  delete queuePayload.action;
  delete queuePayload.instantEdge;

  const dedupeKey = `CHECK_IN_OUT:${logId}`;
  await env.DB.prepare(
    `INSERT INTO edge_sync_queue (dedupe_key, action, payload_json, attempts, status, created_at, updated_at)
     VALUES (?1, 'CHECK_IN_OUT', ?2, 0, 'processing', ?3, ?3)
     ON CONFLICT(dedupe_key) DO UPDATE SET
       payload_json = excluded.payload_json,
       status = 'processing',
       updated_at = excluded.updated_at`
  )
    .bind(dedupeKey, JSON.stringify(queuePayload), now)
    .run();

  await invalidateEdgeReadCaches(env, [
    'GET_DATA',
    'GET_CHECKIN_LOGS',
    'GET_KIOSK_ATTENDANCE_STATE',
  ]);

  context.waitUntil(syncInstantCheckInToGas(context, logId, queuePayload));

  return jsonResponse(
    {
      ok: true,
      message: 'Đã ghi nhận chấm công tức thì! Đang tự động đồng bộ vào Bảng chấm công Google Sheets & ảnh Google Drive...',
      data: {
        instantEdgeCommitted: true,
        edgeBuffered: true,
        sheetSaved: false,
        queuedForSheet: true,
        checkinId: logId,
        type: unifiedPunchType,
        loaiChamCong: unifiedPunchType,
        fullname,
        time: timeStr,
        thoiGian: timeStr,
        timeISO: new Date(now).toISOString(),
        status: 'Hợp lệ',
        isValid: true,
        scheduleWarning,
        scheduleWeekDisplay: scheduleWarning ? winInfo.weekDisplay : '',
      },
    },
    200,
    {
      'X-Edge-DB': 'D1-INSTANT-COMMITTED',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  );
}

async function syncInstantCheckInToGas(context, logId, queuePayload) {
  const { env } = context;
  if (!env?.DB || !logId) return;
  const dedupeKey = `CHECK_IN_OUT:${logId}`;
  const bodyStr = JSON.stringify({ action: 'CHECK_IN_OUT', ...queuePayload });

  try {
    const res = await fetch(TARGET_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: bodyStr,
      signal:
        typeof AbortSignal !== 'undefined' && AbortSignal.timeout
          ? AbortSignal.timeout(26000)
          : undefined,
    });
    let parsed = await res.json();

    // Self-heal v2_face profile on GAS if CONFIG_FACE_ID was missing/corrupted
    const firstErrCode = String(parsed?.code || parsed?.data?.code || '').trim();
    if (
      (!parsed || parsed.ok !== true) &&
      String(queuePayload.checkinMode || '').trim() === 'v2_face' &&
      (firstErrCode === 'FACE_VERIFICATION_FAILED' || firstErrCode === 'FACE_PROFILE_NOT_FOUND')
    ) {
      const targetUser = String(queuePayload.username || '').trim().toLowerCase();
      const d1FaceRow = targetUser
        ? await env.DB.prepare(
            `SELECT username, fullname, role, position, avatar_url, employment_status, model_version, angle_count, vectors_b64, centroid_b64, quality_score, enrolled_by
             FROM edge_face_profiles WHERE username = ?1 LIMIT 1`
          )
            .bind(targetUser)
            .first()
            .catch(() => null)
        : null;
      if (d1FaceRow?.vectors_b64) {
        const healedFace = await healFaceProfileToGas(env, d1FaceRow);
        if (healedFace) {
          const retryFaceRes = await fetch(TARGET_GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: bodyStr,
            signal:
              typeof AbortSignal !== 'undefined' && AbortSignal.timeout
                ? AbortSignal.timeout(26000)
                : undefined,
          });
          parsed = await retryFaceRes.json();
        }
      }
    }

    // Self-heal unsynced D1 schedule on GAS if SCHEDULE_REQUIRED returned
    const secondErrCode = String(parsed?.code || parsed?.data?.code || '').trim();
    if ((!parsed || parsed.ok !== true) && secondErrCode === 'SCHEDULE_REQUIRED') {
      const healedSched = await trySelfHealScheduleForCheckIn(env, queuePayload, parsed);
      if (healedSched) {
        const retrySchedRes = await fetch(TARGET_GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: bodyStr,
          signal:
            typeof AbortSignal !== 'undefined' && AbortSignal.timeout
              ? AbortSignal.timeout(26000)
              : undefined,
        });
        parsed = await retrySchedRes.json();
      }
    }

    const finalCode = String(parsed?.code || parsed?.data?.code || '').trim();
    const isSuccessOrIdempotent =
      Boolean(parsed && parsed.ok === true) || finalCode === 'ALREADY_CHECKED_IN';

    if (isSuccessOrIdempotent) {
      const canonicalName = String(
        parsed?.data?.fullname || parsed?.data?.hoVaTen || queuePayload.fullname || ''
      ).trim();
      const canonicalType = String(parsed?.data?.type || queuePayload.type || '').trim();

      await env.DB.prepare(
        `UPDATE edge_checkin_logs
         SET sheet_synced = 1,
             fullname = CASE WHEN ?2 != '' THEN ?2 ELSE fullname END,
             check_type = CASE WHEN ?3 != '' THEN ?3 ELSE check_type END
         WHERE id = ?1`
      )
        .bind(logId, canonicalName, canonicalType)
        .run();

      await env.DB.prepare(`DELETE FROM edge_sync_queue WHERE dedupe_key = ?1`)
        .bind(dedupeKey)
        .run();

      await invalidateEdgeReadCaches(env, [
        'GET_DATA',
        'GET_CHECKIN_LOGS',
        'GET_KIOSK_ATTENDANCE_STATE',
      ]);

      // Immediately flush any staged check-in photo waiting on this row!
      await flushPendingImageForCheckin(env, logId, TARGET_GAS_URL);
      return;
    }

    const isPermanentRejection =
      finalCode === 'OUT_OF_RADIUS' ||
      finalCode === 'PHOTO_EXPIRED' ||
      finalCode === 'ACCOUNT_INACTIVE' ||
      finalCode === 'MAX_4_PUNCHES';

    if (isPermanentRejection) {
      await env.DB.prepare(`DELETE FROM edge_checkin_logs WHERE id = ?1`).bind(logId).run().catch(() => {});
      await env.DB.prepare(`DELETE FROM edge_sync_queue WHERE dedupe_key = ?1`).bind(dedupeKey).run().catch(() => {});
      await env.DB.prepare(`DELETE FROM edge_sync_queue WHERE dedupe_key = ?1`)
        .bind(`UPLOAD_CHECKIN_IMAGE:${logId}`)
        .run()
        .catch(() => {});
      await invalidateEdgeReadCaches(env, ['GET_DATA', 'GET_CHECKIN_LOGS', 'GET_KIOSK_ATTENDANCE_STATE']);
      return;
    }

    // Transient GAS contention (LOCK_TIMEOUT / SAVE_ERROR / 5xx): return to 'pending' for automatic retry
    await env.DB.prepare(
      `UPDATE edge_sync_queue SET status = 'pending', attempts = attempts + 1, last_error = ?1, updated_at = ?2 WHERE dedupe_key = ?3`
    )
      .bind(String(parsed?.message || finalCode || 'GAS sync retry'), Date.now(), dedupeKey)
      .run();
  } catch (err) {
    await env.DB.prepare(
      `UPDATE edge_sync_queue SET status = 'pending', attempts = attempts + 1, last_error = ?1, updated_at = ?2 WHERE dedupe_key = ?3`
    )
      .bind(String(err?.message || 'GAS fetch error'), Date.now(), dedupeKey)
      .run()
      .catch(() => {});
  }
}

async function handleInstantUploadImageEdge(context, payload) {
  const { env } = context;
  if (!env?.DB || !payload || typeof payload.image !== 'string' || payload.image.length < 50) {
    return null;
  }

  const cleanPayload = { ...payload };
  delete cleanPayload.action;
  delete cleanPayload.instantEdge;

  const serialized = JSON.stringify(cleanPayload);
  // Safeguard against D1 1MB row limit: oversized images fall through to direct GAS upload
  if (serialized.length > 900000) {
    return null;
  }

  const now = Date.now();
  const checkinId = String(
    payload.checkinId || `IMG_${String(payload.username || 'staff').replace(/\W+/g, '')}_${now}`
  ).trim();
  cleanPayload.checkinId = checkinId;

  const dedupeKey = `UPLOAD_CHECKIN_IMAGE:${checkinId}`;
  await env.DB.prepare(
    `INSERT INTO edge_sync_queue (dedupe_key, action, payload_json, attempts, status, created_at, updated_at)
     VALUES (?1, 'UPLOAD_CHECKIN_IMAGE', ?2, 0, 'pending', ?3, ?3)
     ON CONFLICT(dedupe_key) DO UPDATE SET
       payload_json = excluded.payload_json,
       status = 'pending',
       updated_at = excluded.updated_at`
  )
    .bind(dedupeKey, JSON.stringify(cleanPayload), now)
    .run();

  context.waitUntil(flushPendingImageForCheckin(env, checkinId, TARGET_GAS_URL));

  return jsonResponse(
    {
      ok: true,
      message: 'Đã tiếp nhận ảnh minh chứng tại Edge và đang gắn link Google Drive vào Bảng chấm công...',
      data: {
        queuedForDrive: true,
        edgeImageQueued: true,
        checkinId,
      },
    },
    200,
    {
      'X-Edge-DB': 'D1-IMAGE-QUEUED',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  );
}

async function flushPendingImageForCheckin(env, checkinId, targetGasUrl) {
  if (!env?.DB || !checkinId) return;
  const dedupeKey = `UPLOAD_CHECKIN_IMAGE:${checkinId}`;

  try {
    let logRow = await env.DB.prepare(
      `SELECT sheet_synced, fullname FROM edge_checkin_logs WHERE id = ?1 LIMIT 1`
    )
      .bind(checkinId)
      .first()
      .catch(() => null);

    // Wait until CHECK_IN_OUT row is confirmed in Google Sheets!
    if (logRow && Number(logRow.sheet_synced) === 0) {
      const punchQueueRow = await env.DB.prepare(
        `SELECT status FROM edge_sync_queue WHERE dedupe_key = ?1 LIMIT 1`
      )
        .bind(`CHECK_IN_OUT:${checkinId}`)
        .first()
        .catch(() => null);
      if (punchQueueRow?.status === 'pending') {
        await drainEdgeSyncQueue(env, targetGasUrl);
        return;
      }
      // Close sub-second race window when CHECK_IN_OUT is actively 'processing' in parallel
      if (punchQueueRow?.status === 'processing') {
        for (let waitStep = 0; waitStep < 3; waitStep++) {
          await new Promise((r) => setTimeout(r, 250));
          logRow = await env.DB.prepare(
            `SELECT sheet_synced, fullname FROM edge_checkin_logs WHERE id = ?1 LIMIT 1`
          )
            .bind(checkinId)
            .first()
            .catch(() => null);
          if (!logRow || Number(logRow.sheet_synced) === 1) break;
        }
      }
      if (logRow && Number(logRow.sheet_synced) === 0) {
        return;
      }
    }

    const claimRes = await env.DB.prepare(
      `UPDATE edge_sync_queue SET status = 'processing', updated_at = ?1 WHERE dedupe_key = ?2 AND status = 'pending'`
    )
      .bind(Date.now(), dedupeKey)
      .run()
      .catch(() => null);
    if (claimRes?.meta && typeof claimRes.meta.changes === 'number' && claimRes.meta.changes === 0) {
      return;
    }

    const qRow = await env.DB.prepare(
      `SELECT id, payload_json FROM edge_sync_queue WHERE dedupe_key = ?1 LIMIT 1`
    )
      .bind(dedupeKey)
      .first()
      .catch(() => null);
    if (!qRow?.payload_json) return;

    const imgPayload = JSON.parse(qRow.payload_json);
    if (logRow?.fullname) {
      imgPayload.fullname = String(logRow.fullname).trim();
    }

    const uploadBodyStr = JSON.stringify({ action: 'UPLOAD_CHECKIN_IMAGE', ...imgPayload });
    let parsed = null;
    let lastUploadErr = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(targetGasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: uploadBodyStr,
          signal:
            typeof AbortSignal !== 'undefined' && AbortSignal.timeout
              ? AbortSignal.timeout(30000)
              : undefined,
        });
        parsed = await res.json();
        if (parsed && parsed.ok === true) break;
        lastUploadErr = parsed?.message || 'Drive upload retry';
      } catch (e) {
        lastUploadErr = e?.message || 'Drive upload fetch error';
      }
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 450));
      }
    }

    if (parsed && parsed.ok === true) {
      const uploadedUrl = String(parsed?.data?.url || parsed?.data?.imageUrl || '').trim();
      const targetUser = String(imgPayload.username || '').trim().toLowerCase();
      const targetTimeStr = String(imgPayload.time || '').trim();
      if (uploadedUrl) {
        await updateEdgeCheckinLogImageUrl(env.DB, uploadedUrl, checkinId, targetUser, targetTimeStr);
      }
      await env.DB.prepare(`DELETE FROM edge_sync_queue WHERE dedupe_key = ?1`)
        .bind(dedupeKey)
        .run();
      await invalidateEdgeReadCaches(env, ['GET_DATA', 'GET_CHECKIN_LOGS']);
    } else {
      await env.DB.prepare(
        `UPDATE edge_sync_queue SET status = 'pending', attempts = attempts + 1, last_error = ?1, updated_at = ?2 WHERE dedupe_key = ?3`
      )
        .bind(String(lastUploadErr || 'Drive upload retry'), Date.now(), dedupeKey)
        .run();
    }
  } catch (err) {
    await env.DB.prepare(
      `UPDATE edge_sync_queue SET status = 'pending', attempts = attempts + 1, last_error = ?1, updated_at = ?2 WHERE dedupe_key = ?3`
    )
      .bind(String(err?.message || 'Drive upload fetch error'), Date.now(), dedupeKey)
      .run()
      .catch(() => {});
  }
}

async function handleInstantOperationalMutationEdge(context, action, payload, verifiedSession = null) {
  const { env } = context;
  if (!env?.DB || !payload) return null;

  const now = Date.now();
  const vnTime = formatVietnamTimestampFromMs(now);
  const cleanPayload = { ...payload };
  delete cleanPayload.action;
  delete cleanPayload.instantEdge;

  // 1. Checklist (Coalesced atomic merge in D1 edge_ops_checklist + single coalesced GAS sync)
  if (action === 'PATCH_OPS_CHECKLIST_ITEM' || action === 'SAVE_OPS_CHECKLIST_STATE') {
    const dateStr = String(payload.dateStr || '').trim();
    const area = String(payload.area || 'A').trim();
    if (!dateStr || !area) return null;

    const mergedState = await preMergeChecklistInD1(env.DB, action, payload);
    if (!mergedState) return null;

    const dedupeKey = `OPS_CHECKLIST:${dateStr}|${area}`;
    const syncPayload = {
      dateStr,
      area,
      username: payload.username || payload.actorUsername || '',
      fullname: payload.fullname || '',
      role: payload.role || verifiedSession?.r || 'user',
      actorUsername: payload.actorUsername || payload.username || '',
      participants: mergedState.participants,
      removedParticipantKeys: Array.isArray(payload.removedParticipantKeys)
        ? payload.removedParticipantKeys
        : [],
      items: mergedState.items,
      supply: mergedState.supply,
      signatures: mergedState.signatures,
    };

    await env.DB.prepare(
      `INSERT INTO edge_sync_queue (dedupe_key, action, payload_json, attempts, status, created_at, updated_at)
       VALUES (?1, 'SAVE_OPS_CHECKLIST_STATE', ?2, 0, 'processing', ?3, ?3)
       ON CONFLICT(dedupe_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         status = 'processing',
         updated_at = excluded.updated_at`
    )
      .bind(dedupeKey, JSON.stringify(syncPayload), now)
      .run();

    const invActions = getEdgeInvalidationActionsForMutation(action) || ['GET_OPS_CHECKLIST_INIT', 'GET_DATA'];
    await invalidateEdgeReadCaches(env, invActions);
    context.waitUntil(
      syncQueuedMutationToGas(env, dedupeKey, 'SAVE_OPS_CHECKLIST_STATE', syncPayload, invActions)
    );

    return jsonResponse(
      {
        ok: true,
        message: 'Đã lưu tiến độ Checklist tức thì!',
        data: {
          instantEdgeCommitted: true,
          queuedForSheet: true,
          date: dateStr,
          area,
          state: mergedState,
        },
      },
      200,
      {
        'X-Edge-DB': 'D1-INSTANT-CHECKLIST',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    );
  }

  // 2. Handover 2-Way Cash Reconciliation
  if (
    action === 'SUBMIT_HANDOVER' ||
    action === 'ACKNOWLEDGE_HANDOVER' ||
    action === 'REVIEW_HANDOVER'
  ) {
    if ((action === 'ACKNOWLEDGE_HANDOVER' || action === 'REVIEW_HANDOVER') && !String(payload.handoverId || '').trim()) {
      return jsonResponse({ ok: false, message: 'Thiếu mã bàn giao két (handoverId).' }, 200);
    }

    let responseData = {};
    let recordId = String(payload.handoverId || payload.id || `HO_EDGE_${now}`).trim();
    if (action === 'SUBMIT_HANDOVER') {
      const rich = buildHandoverRecordFromPayload({ ...payload, id: recordId }, {}, now);
      recordId = rich.id;
      cleanPayload.id = recordId;
      await persistHandoverMutationInD1(env.DB, action, cleanPayload, { data: rich }, now);
      responseData = rich;
    } else {
      await persistHandoverMutationInD1(env.DB, action, cleanPayload, null, now);
      responseData = {
        id: recordId,
        handoverId: recordId,
        ackAt: vnTime,
        managerAt: vnTime,
        reconcileStatus:
          action === 'REVIEW_HANDOVER'
            ? String(payload.decision || 'CONFIRM').toUpperCase() === 'DISPUTE'
              ? 'Disputed'
              : 'ManagerConfirmed'
            : payload.ackStatus === 'Disputed'
              ? 'Disputed'
              : 'Matched',
      };
    }

    if (ADMIN_ONLY_ACTIONS.has(action)) {
      await appendEdgeAuditLogInD1(env.DB, action, payload, now).catch(() => {});
    }

    const dedupeKey = `${action}:${recordId}`;
    await env.DB.prepare(
      `INSERT INTO edge_sync_queue (dedupe_key, action, payload_json, attempts, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, 0, 'processing', ?4, ?4)
       ON CONFLICT(dedupe_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         status = 'processing',
         updated_at = excluded.updated_at`
    )
      .bind(dedupeKey, action, JSON.stringify(cleanPayload), now)
      .run();

    const invActions = getEdgeInvalidationActionsForMutation(action) || ['GET_HANDOVERS', 'GET_DATA'];
    await invalidateEdgeReadCaches(env, invActions);
    context.waitUntil(syncQueuedMutationToGas(env, dedupeKey, action, cleanPayload, invActions));

    return jsonResponse(
      {
        ok: true,
        message:
          action === 'SUBMIT_HANDOVER'
            ? 'Đã ghi nhận bàn giao ca tức thì!'
            : action === 'ACKNOWLEDGE_HANDOVER'
              ? 'Đã lưu xác nhận két ca sau tức thì!'
              : 'Đã duyệt đối soát két sắt tức thì!',
        data: {
          instantEdgeCommitted: true,
          queuedForSheet: true,
          ...responseData,
        },
      },
      200,
      {
        'X-Edge-DB': 'D1-INSTANT-HANDOVER',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    );
  }

  // 3. Incidents (4-State Operations Incident Center)
  if (action === 'SUBMIT_INCIDENT' || action === 'UPDATE_INCIDENT') {
    if (action === 'UPDATE_INCIDENT' && !String(payload.incidentId || '').trim()) {
      return jsonResponse({ ok: false, message: 'Thiếu mã sự cố (incidentId).' }, 200);
    }
    const incId = String(payload.incidentId || payload.id || `INC_EDGE_${now}`).trim();
    if (action === 'SUBMIT_INCIDENT') {
      cleanPayload.id = incId;
    }
    await persistIncidentMutationInD1(env.DB, action, cleanPayload, { data: { id: incId } }, now);
    if (ADMIN_ONLY_ACTIONS.has(action)) {
      await appendEdgeAuditLogInD1(env.DB, action, payload, now).catch(() => {});
    }

    const dedupeKey = `${action}:${incId}`;
    await env.DB.prepare(
      `INSERT INTO edge_sync_queue (dedupe_key, action, payload_json, attempts, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, 0, 'processing', ?4, ?4)
       ON CONFLICT(dedupe_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         status = 'processing',
         updated_at = excluded.updated_at`
    )
      .bind(dedupeKey, action, JSON.stringify(cleanPayload), now)
      .run();

    const invActions = getEdgeInvalidationActionsForMutation(action) || ['GET_INCIDENTS', 'GET_DATA'];
    await invalidateEdgeReadCaches(env, invActions);
    context.waitUntil(syncQueuedMutationToGas(env, dedupeKey, action, cleanPayload, invActions));

    return jsonResponse(
      {
        ok: true,
        message: action === 'SUBMIT_INCIDENT' ? 'Đã ghi nhận báo cáo sự cố tức thì!' : 'Đã cập nhật tiến độ sự cố tức thì!',
        data: {
          instantEdgeCommitted: true,
          queuedForSheet: true,
          id: incId,
          date: vnTime.slice(0, 10),
          status: action === 'SUBMIT_INCIDENT' ? 'Open' : String(payload.status || 'Investigating'),
          updatedAt: vnTime,
        },
      },
      200,
      {
        'X-Edge-DB': 'D1-INSTANT-INCIDENT',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    );
  }

  // 4. Payroll 4-Step Workflow Status & Confirmation
  if (action === 'SET_PAYROLL_WORKFLOW_STATUS' || action === 'CONFIRM_PAYROLL_SLIP') {
    const updatedWf = await persistPayrollWorkflowMutationInD1(env.DB, action, cleanPayload, null, now);
    if (ADMIN_ONLY_ACTIONS.has(action)) {
      await appendEdgeAuditLogInD1(env.DB, action, payload, now).catch(() => {});
    }
    const wfMonth = normalizeEdgeMonthYm(payload.month, payload.year);
    const dedupeKey = `${action}:${wfMonth}:${String(payload.username || 'admin').trim().toLowerCase()}`;
    await env.DB.prepare(
      `INSERT INTO edge_sync_queue (dedupe_key, action, payload_json, attempts, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, 0, 'processing', ?4, ?4)
       ON CONFLICT(dedupe_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         status = 'processing',
         updated_at = excluded.updated_at`
    )
      .bind(dedupeKey, action, JSON.stringify(cleanPayload), now)
      .run();

    const invActions = getEdgeInvalidationActionsForMutation(action) || ['GET_PAYROLL'];
    await invalidateEdgeReadCaches(env, invActions);
    context.waitUntil(syncQueuedMutationToGas(env, dedupeKey, action, cleanPayload, invActions));

    return jsonResponse(
      {
        ok: true,
        message: 'Đã cập nhật trạng thái phiếu lương tức thì!',
        data: {
          instantEdgeCommitted: true,
          queuedForSheet: true,
          workflow: updatedWf,
        },
      },
      200,
      {
        'X-Edge-DB': 'D1-INSTANT-PAYROLL-WF',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    );
  }

  // 5. General Fast Fire-and-Guarantee Operational Mutations (SoldOut, Posts, Feedback, Notifications, Tasks, Single Shift, Survey, ChatLog)
  const dedupeSeed =
    String(
      payload.id ||
        payload.postId ||
        payload.notificationId ||
        (payload.assignmentId && payload.taskId ? `${payload.assignmentId}_${payload.taskId}_${payload.username || ''}` : '') ||
        (payload.weekLabel && payload.fullname ? `${payload.monthSheet || ''}_${payload.weekLabel}_${payload.fullname}_${payload.dayIndex ?? ''}` : '') ||
        `${String(payload.username || payload.author || payload.reportedBy || 'op').trim().toLowerCase()}_${now}_${Math.random().toString(36).slice(2, 6)}`
    ).trim();
  const dedupeKey = `${action}:${dedupeSeed}`;

  await env.DB.prepare(
    `INSERT INTO edge_sync_queue (dedupe_key, action, payload_json, attempts, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, 0, 'processing', ?4, ?4)
     ON CONFLICT(dedupe_key) DO UPDATE SET
       payload_json = excluded.payload_json,
       status = 'processing',
       updated_at = excluded.updated_at`
  )
    .bind(dedupeKey, action, JSON.stringify(cleanPayload), now)
    .run();

  const invActions = getEdgeInvalidationActionsForMutation(action);
  if (Array.isArray(invActions) && invActions.length > 0) {
    await invalidateEdgeReadCaches(env, invActions);
  }
  context.waitUntil(syncQueuedMutationToGas(env, dedupeKey, action, cleanPayload, invActions || []));

  return jsonResponse(
    {
      ok: true,
      message: 'Đã ghi nhận thao tác tức thì và đang đồng bộ nền lên Google Sheets!',
      data: {
        instantEdgeCommitted: true,
        queuedForSheet: true,
        id: cleanPayload.id || dedupeSeed,
        completedAt: vnTime,
        timestamp: vnTime,
      },
    },
    200,
    {
      'X-Edge-DB': 'D1-INSTANT-MUTATION',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  );
}

async function syncQueuedMutationToGas(env, dedupeKey, action, cleanPayload, invActions = []) {
  if (!env?.DB || !dedupeKey || !action) return;
  const bodyStr = JSON.stringify({ action, ...cleanPayload });
  let lastErr = 'GAS sync retry';

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(TARGET_GAS_URL, {
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
        await env.DB.prepare(`DELETE FROM edge_sync_queue WHERE dedupe_key = ?1`)
          .bind(dedupeKey)
          .run()
          .catch(() => {});
        if (Array.isArray(invActions) && invActions.length > 0) {
          await invalidateEdgeReadCaches(env, invActions);
        }
        return;
      }
      lastErr = String(parsed?.message || 'GAS returned ok=false');
    } catch (err) {
      lastErr = String(err?.message || 'GAS fetch error');
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 + Math.floor(Math.random() * 400)));
    }
  }

  await env.DB.prepare(
    `UPDATE edge_sync_queue SET status = 'pending', attempts = attempts + 1, last_error = ?1, updated_at = ?2 WHERE dedupe_key = ?3`
  )
    .bind(lastErr, Date.now(), dedupeKey)
    .run()
    .catch(() => {});
}

async function trySelfHealScheduleForCheckIn(env, payload, gasResult, fetchImpl = fetch) {
  if (!env?.DB) return false;
  const targetUser = String(payload?.username || '').trim().toLowerCase();
  if (!targetUser) return false;
  const reqMonthSheet = String(gasResult?.data?.monthSheet || '').trim();
  const reqWeekLabel = String(gasResult?.data?.weekLabel || '').trim();

  try {
    const d1SchedRow = await env.DB.prepare(
      `SELECT id, username, fullname, month_sheet, week_label, shifts_json, off_reason, status, sheet_synced
       FROM edge_schedules
       WHERE username = ?1 AND (?2 = '' OR month_sheet = ?2) AND (?3 = '' OR week_label = ?3)
       ORDER BY updated_at DESC
       LIMIT 1`
    )
      .bind(targetUser, reqMonthSheet, reqWeekLabel)
      .first()
      .catch(() => null);

    if (!d1SchedRow || !d1SchedRow.shifts_json) return false;

    let shifts = [];
    try {
      shifts = JSON.parse(d1SchedRow.shifts_json);
    } catch {
      return false;
    }
    if (
      !Array.isArray(shifts) ||
      shifts.length !== 7 ||
      !shifts.every((s) => String(s || '').trim() !== '')
    ) {
      return false;
    }

    const healSchedPayload = {
      action: 'REGISTER_SHIFT',
      username: String(d1SchedRow.username || targetUser).trim(),
      fullname: String(d1SchedRow.fullname || payload?.fullname || targetUser).trim(),
      monthSheet: String(d1SchedRow.month_sheet || reqMonthSheet).trim(),
      weekLabel: String(d1SchedRow.week_label || reqWeekLabel).trim(),
      shifts,
      offReason: String(d1SchedRow.off_reason || '').trim(),
    };

    const res = await fetchImpl(TARGET_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(healSchedPayload),
      signal:
        typeof AbortSignal !== 'undefined' && AbortSignal.timeout
          ? AbortSignal.timeout(20000)
          : undefined,
    });
    const parsed = await res.json();
    if (parsed && parsed.ok === true) {
      await env.DB.prepare(
        `UPDATE edge_schedules SET sheet_synced = 1, updated_at = ?1 WHERE id = ?2`
      )
        .bind(Date.now(), d1SchedRow.id)
        .run()
        .catch(() => {});
      await env.DB.prepare(`DELETE FROM edge_sync_queue WHERE dedupe_key = ?1`)
        .bind(`REGISTER_SHIFT:${d1SchedRow.id}`)
        .run()
        .catch(() => {});
      await invalidateEdgeReadCaches(env, ['GET_DATA', 'GET_ALL_SCHEDULES']);
      return true;
    }
  } catch (e) {
    console.warn('[Edge Schedule Self-Heal] warning:', e);
  }
  return false;
}

async function bufferCheckInToD1WriteAhead(env, payload) {
  if (!env?.DB || !payload) return null;
  const rawPunchType = String(payload.type || 'Vào ca').trim();
  const isAttendancePunch =
    isEdgeCheckInLabel(rawPunchType) || isEdgeCheckOutLabel(rawPunchType);
  if (!isAttendancePunch) return null;

  const cleanUser = String(payload.username || '').trim().toLowerCase();
  const fullname = String(payload.fullname || cleanUser).trim();
  if (!cleanUser && !fullname) return null;

  const isAuthorizedTest =
    cleanUser === 'admin' || cleanUser === 'testapp' || cleanUser === 'tester';
  const isOfflineRetry = payload.isOfflineRetry === true || payload.isOfflineRetry === 'true';

  // Strictly enforce restaurant GPS geofence & photo freshness BEFORE accepting into D1 Write-Ahead Ledger!
  if (!isAuthorizedTest) {
    const gpsErr = await verifyEdgeKioskGpsGate(env, payload);
    if (gpsErr) {
      return jsonResponse(gpsErr, 200, { 'X-Edge-GPS': 'REJECTED' });
    }
    if (!isOfflineRetry && payload.photoCapturedMs) {
      const photoMs = Number(payload.photoCapturedMs);
      const refNowMs = Number(payload.clientNowMs) > 0 ? Number(payload.clientNowMs) : Date.now();
      if (Number.isFinite(photoMs) && photoMs > 0) {
        const photoAgeSecs = Math.round((refNowMs - photoMs) / 1000);
        if (photoAgeSecs > 90) {
          return jsonResponse(
            {
              ok: false,
              code: 'PHOTO_EXPIRED',
              data: { code: 'PHOTO_EXPIRED', photoAgeSecs },
              message: `Từ chối chấm công: Ảnh chụp minh chứng đã hết hạn (${photoAgeSecs} giây trước, quy định tối đa 60 giây). Vui lòng chụp lại ảnh mới tại nhà hàng.`,
            },
            200,
            { 'X-Edge-CheckIn': 'PHOTO-EXPIRED' }
          );
        }
      }
    }
  }

  const now = Date.now();
  const logId = String(payload.checkinId || `CHK_EDGE_${cleanUser || 'staff'}_${now}`).trim();
  const timeStr = String(
    payload.actualTime || payload.time || payload.clientTime || formatVietnamTimestampFromMs(now)
  ).trim();
  const unifiedPunchType = rawPunchType
    .replace(/^(?:vào(?:\s+ca)?(?:\s*[1-9])?|in(?:\s*[1-9])?)(?=\s*$|\s*\(|\s+-)/i, 'Vào ca')
    .replace(/^(?:ra(?:\s+ca)?(?:\s*[1-9])?|out(?:\s*[1-9])?)(?=\s*$|\s*\(|\s+-)/i, 'Ra ca');
  const rawImg = String(payload.image || '');
  const cleanImgUrl = rawImg.startsWith('data:image') ? 'PENDING' : rawImg;

  await env.DB.prepare(
    `INSERT OR REPLACE INTO edge_checkin_logs
     (id, username, fullname, check_type, shift_name, time_str, status, distance, lat, lng, note, image_url, sheet_synced, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, ?13)`
  )
    .bind(
      logId,
      cleanUser,
      fullname,
      unifiedPunchType,
      String(payload.shift || ''),
      timeStr,
      'Hợp lệ',
      Number(payload.distance || 0),
      payload.lat ?? null,
      payload.lng ?? null,
      String(payload.note || ''),
      cleanImgUrl,
      now
    )
    .run();

  const queuePayload = {
    ...payload,
    checkinId: logId,
    type: unifiedPunchType,
    time: timeStr,
    actualTime: timeStr,
    image: cleanImgUrl || 'PENDING',
    isOfflineRetry: true,
    fastSync: true,
    sendEmailInline: false,
  };
  delete queuePayload.action;

  const dedupeKey = `CHECK_IN_OUT:${logId}`;
  await env.DB.prepare(
    `INSERT INTO edge_sync_queue (dedupe_key, action, payload_json, attempts, status, created_at, updated_at)
     VALUES (?1, 'CHECK_IN_OUT', ?2, 0, 'pending', ?3, ?3)
     ON CONFLICT(dedupe_key) DO UPDATE SET
       payload_json = excluded.payload_json,
       status = 'pending',
       updated_at = excluded.updated_at`
  )
    .bind(dedupeKey, JSON.stringify(queuePayload), now)
    .run();

  await invalidateEdgeReadCaches(env, [
    'GET_DATA',
    'GET_CHECKIN_LOGS',
    'GET_KIOSK_ATTENDANCE_STATE',
  ]);

  return jsonResponse(
    {
      ok: true,
      message:
        'Đã lưu bảo lãnh trên đám mây Cloudflare D1 và đang tự động đồng bộ vào Google Sheets...',
      data: {
        sheetSaved: false,
        edgeBuffered: true,
        queuedForSheet: true,
        checkinId: logId,
        type: unifiedPunchType,
        fullname,
        time: timeStr,
        thoiGian: timeStr,
        status: 'Hợp lệ',
        isValid: true,
      },
    },
    200,
    {
      'X-Edge-DB': 'D1-WRITE-AHEAD-BUFFERED',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    }
  );
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
      db.prepare(
        `CREATE TABLE IF NOT EXISTS edge_face_profiles (
          username TEXT PRIMARY KEY,
          fullname TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          position TEXT DEFAULT '',
          avatar_url TEXT DEFAULT '',
          employment_status TEXT DEFAULT 'active',
          model_version TEXT NOT NULL DEFAULT 'w600k_mbf_int8_v2',
          angle_count INTEGER NOT NULL DEFAULT 5,
          vectors_b64 TEXT NOT NULL,
          centroid_b64 TEXT NOT NULL,
          quality_score REAL DEFAULT 0,
          is_locked INTEGER NOT NULL DEFAULT 1,
          enrolled_at TEXT NOT NULL,
          enrolled_by TEXT NOT NULL,
          unlocked_by TEXT DEFAULT '',
          updated_at INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS edge_auth_cache (
          username TEXT PRIMARY KEY,
          password_hash TEXT NOT NULL,
          email TEXT DEFAULT '',
          user_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )`
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_edge_auth_cache_email ON edge_auth_cache (email)`
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_edge_schedules_month_week ON edge_schedules (month_sheet, week_label)`
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_edge_checkin_logs_user_created ON edge_checkin_logs (username, created_at DESC)`
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_edge_checkin_logs_created ON edge_checkin_logs (created_at DESC)`
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_edge_kv_cache_action ON edge_kv_cache (action)`
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_edge_kv_cache_updated ON edge_kv_cache (updated_at)`
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_edge_sync_queue_status_updated ON edge_sync_queue (status, updated_at)`
      ),
      db.prepare(
        `CREATE INDEX IF NOT EXISTS idx_edge_audit_logs_created ON edge_audit_logs (created_at DESC)`
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
        faceCount,
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
        env.DB.prepare(`SELECT COUNT(*) as c FROM edge_face_profiles`).first(),
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
        edge_face_profiles: faceCount?.c ?? 0,
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
  const dateStr = String(payload.dateStr || '').trim();
  const area = String(payload.area || 'A').trim();
  if (!dateStr || !area) return null;

  const id = `${dateStr}|${area}`;
  const prevLock = checklistMergeLocks.get(id) || Promise.resolve();
  let releaseLock;
  const nextLock = new Promise((resolve) => {
    releaseLock = resolve;
  });
  const chained = prevLock.then(() => nextLock);
  checklistMergeLocks.set(id, chained);

  await prevLock;
  try {
    const existingRow = await db
      .prepare(`SELECT state_json FROM edge_ops_checklist WHERE id = ?1 LIMIT 1`)
      .bind(id)
      .first();
    const existingState = existingRow?.state_json ? JSON.parse(existingRow.state_json) : null;

    let patch = payload;
    if (action === 'PATCH_OPS_CHECKLIST_ITEM' && payload.itemId) {
      const ip = payload.itemPatch && typeof payload.itemPatch === 'object' ? payload.itemPatch : payload;
      patch = {
        participants: payload.participants,
        deltaItems: {
          [String(payload.itemId)]: {
            checked: ip.checked,
            note: ip.note,
            subchecks: ip.subchecks,
            by: ip.by || payload.fullname || payload.username || '',
            at: ip.at || new Date().toISOString(),
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
  } finally {
    releaseLock();
    if (checklistMergeLocks.get(id) === chained) {
      checklistMergeLocks.delete(id);
    }
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
              totalCheckIn: filtered.filter((l) => isEdgeCheckInLabel(l.type)).length,
              totalCheckOut: filtered.filter((l) => isEdgeCheckOutLabel(l.type)).length,
              validCount: filtered.filter(
                (l) =>
                  String(l.status || '').toUpperCase().includes('HỢP LỆ') &&
                  !String(l.status || '').toUpperCase().includes('KHÔNG')
              ).length,
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

  if (action === 'ENROLL_FACE_PROFILE') {
    const uname = String(payload.username || '').trim();
    if (!uname || !payload.vectorsB64) {
      return { ok: false, message: 'Thiếu thông tin tài khoản hoặc dữ liệu 5 góc khuôn mặt.' };
    }
    const vectors = decodeInt8VectorsEdge(String(payload.vectorsB64), 512);
    if (vectors.length === 0) {
      return { ok: false, message: 'Dữ liệu sinh trắc học khuôn mặt không hợp lệ.' };
    }
    if (env?.DB) {
      await upsertFaceProfileInD1(env.DB, payload, now);
      await enqueueFaceProfileSyncToGas(env, payload);
    }
    return {
      ok: true,
      data: {
        message: 'Đã đăng ký và khóa bảo vệ Face ID thành công!',
        username: uname,
        fullname: String(payload.fullname || uname),
        anglesCount: Number(payload.anglesCount) || vectors.length,
        enrolledAt: vnTime,
        isLocked: true,
      },
    };
  }

  if (action === 'GET_FACE_PROFILES') {
    return { ok: true, data: { profiles: [], totalActiveUsers: 0 } };
  }

  if (action === 'GET_KIOSK_ATTENDANCE_STATE') {
    return { ok: true, data: { logs: [] } };
  }

  if (action === 'RESET_FACE_PROFILE') {
    const targetUser = String(payload.targetUsername || payload.usernameToReset || '')
      .trim()
      .toLowerCase();
    if (!targetUser) {
      return { ok: false, message: 'Thiếu mã nhân viên cần mở khóa/đặt lại Face ID.' };
    }
    if (env?.DB) {
      await env.DB.prepare(`DELETE FROM edge_face_profiles WHERE username = ?1`)
        .bind(targetUser)
        .run();
    }
    return {
      ok: true,
      data: {
        message: `Đã xóa & mở khóa Face ID cho @${targetUser}. Nhân viên có thể đăng ký lại 5 góc khuôn mặt mới.`,
        targetUsername: targetUser,
        unlocked: true,
        removed: true,
      },
    };
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
    if (/key|pin|pass|token|secret|auth|otp|image|photo|vector/i.test(k)) {
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

// ============================================================================
// 9. Fast Face ID v2 Edge Biometrics, Kiosk GPS Gate & 15m Per-User Cooldown
// ============================================================================
const EDGE_FACE_DIM = 512;
const EDGE_FACE_DUPLICATE_THRESHOLD = 0.68;
const EDGE_FACE_SERVER_VERIFY_MIN = 0.30;
const EDGE_COOLDOWN_15M_MS = 15 * 60 * 1000;
const DEFAULT_RESTAURANT_LAT = 10.9760327;
const DEFAULT_RESTAURANT_LNG = 106.6645922;
const DEFAULT_KIOSK_RADIUS_M = 25;
const inFlightEdgeCheckIns = new Map();
const EDGE_LOCK_TOKEN_SYM = Symbol('edgeLockToken');

function releaseInFlightEdgeCheckIn(payload) {
  const targetUser = String(payload?.username || '').trim().toLowerCase();
  if (!targetUser) return;
  const lockToken = payload ? payload[EDGE_LOCK_TOKEN_SYM] : null;
  const cur = inFlightEdgeCheckIns.get(targetUser);
  if (cur && (!lockToken || cur.token === lockToken)) {
    inFlightEdgeCheckIns.delete(targetUser);
  }
}

function isEdgeCheckInLabel(val) {
  if (!val) return false;
  const s = String(val).normalize('NFC').trim().toLowerCase();
  return /^(vào(\s+ca)?(\s*[1-9])?|in)\b/.test(s);
}

function isEdgeCheckOutLabel(val) {
  if (!val) return false;
  const s = String(val).normalize('NFC').trim().toLowerCase();
  return /^(ra(\s+ca)?(\s*[1-9])?|out)\b/.test(s);
}

const FACE_B64_SAFE_PREFIX_EDGE = 'v2:';

function normalizeSafeFaceB64Edge(b64) {
  if (!b64) return '';
  let clean = String(b64).trim().replace(/^'+/, '');
  if (!clean || clean.startsWith('#')) return '';
  if (clean.slice(0, 3).toLowerCase() === 'v2:') {
    clean = clean.slice(3).trim();
  }
  if (!clean || clean.startsWith('#') || !/^[A-Za-z0-9+/=_-]+$/.test(clean)) return '';
  const urlSafe = clean.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return urlSafe ? FACE_B64_SAFE_PREFIX_EDGE + urlSafe : '';
}

function toStandardFaceB64Edge(b64) {
  if (!b64) return '';
  let clean = String(b64).trim().replace(/^'+/, '');
  if (!clean || clean.startsWith('#')) return '';
  if (clean.slice(0, 3).toLowerCase() === 'v2:') {
    clean = clean.slice(3).trim();
  }
  if (!clean || clean.startsWith('#') || !/^[A-Za-z0-9+/=_-]+$/.test(clean)) return '';
  const std = clean.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  return std ? std.padEnd(Math.ceil(std.length / 4) * 4, '=') : '';
}

function decodeInt8VectorsEdge(b64, dim = EDGE_FACE_DIM) {
  if (!b64) return [];
  try {
    let raw = String(b64).trim().replace(/^'+/, '');
    if (!raw || raw.startsWith('#')) return [];
    if (raw.slice(0, 3).toLowerCase() === 'v2:') {
      raw = raw.slice(3).trim();
    }
    if (!raw || raw.startsWith('#') || !/^[A-Za-z0-9+/=_-]+$/.test(raw)) return [];
    const clean = raw.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    const padded = clean.padEnd(Math.ceil(clean.length / 4) * 4, '=');
    const bin = atob(padded);
    if (bin.length < dim) return [];
    const count = Math.floor(bin.length / dim);
    const out = [];
    for (let k = 0; k < count; k++) {
      const vec = new Float32Array(dim);
      let normSq = 0;
      const offset = k * dim;
      for (let i = 0; i < dim; i++) {
        let v = bin.charCodeAt(offset + i);
        if (v > 127) v -= 256;
        vec[i] = v;
        normSq += v * v;
      }
      const inv = normSq > 0 ? 1 / Math.sqrt(normSq) : 0;
      if (inv > 0) {
        for (let i = 0; i < dim; i++) vec[i] *= inv;
      }
      out.push(vec);
    }
    return out;
  } catch {
    return [];
  }
}

function computeCentroidEdge(vectors, dim = EDGE_FACE_DIM) {
  const sum = new Float32Array(dim);
  if (!vectors || vectors.length === 0) return sum;
  for (let k = 0; k < vectors.length; k++) {
    const v = vectors[k];
    for (let i = 0; i < dim; i++) sum[i] += v[i];
  }
  let normSq = 0;
  for (let i = 0; i < dim; i++) normSq += sum[i] * sum[i];
  const inv = normSq > 0 ? 1 / Math.sqrt(normSq) : 0;
  if (inv > 0) {
    for (let i = 0; i < dim; i++) sum[i] *= inv;
  }
  return sum;
}

function encodeFloatVectorToInt8B64Edge(vec) {
  let maxAbs = 0;
  for (let i = 0; i < vec.length; i++) {
    const a = Math.abs(vec[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const scale = maxAbs > 0 ? 127 / maxAbs : 127;
  let bin = '';
  for (let i = 0; i < vec.length; i++) {
    const q = Math.max(-127, Math.min(127, Math.round(vec[i] * scale)));
    const byteVal = q < 0 ? q + 256 : q;
    bin += String.fromCharCode(byteVal);
  }
  return normalizeSafeFaceB64Edge(btoa(bin));
}

function cosineEdge(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function computeFaceProfileScoreEdge(liveVec, storedVecs, storedCentroid = null) {
  if (!liveVec || !storedVecs || storedVecs.length === 0) return -1;
  let maxCos = -1;
  let secondCos = -1;
  for (let k = 0; k < storedVecs.length; k++) {
    const c = cosineEdge(liveVec, storedVecs[k]);
    if (c > maxCos) {
      secondCos = maxCos;
      maxCos = c;
    } else if (c > secondCos) {
      secondCos = c;
    }
  }
  const centroid = storedCentroid || computeCentroidEdge(storedVecs);
  const centCos = cosineEdge(liveVec, centroid);
  const supportCos = secondCos > -1 ? Math.max(secondCos, centCos) : centCos;
  return 0.85 * maxCos + 0.15 * supportCos;
}

async function verifyEdgeKioskGpsGate(env, payload) {
  const latNum = Number(payload?.lat);
  const lngNum = Number(payload?.lng);
  if (
    payload?.lat === undefined ||
    payload?.lng === undefined ||
    payload?.lat === null ||
    payload?.lng === null ||
    !Number.isFinite(latNum) ||
    !Number.isFinite(lngNum)
  ) {
    return {
      ok: false,
      code: 'GPS_REQUIRED',
      data: { code: 'GPS_REQUIRED' },
      message: 'Trạm Face ID yêu cầu định vị GPS tại nhà hàng (<= 25m).',
    };
  }

  let refLat = DEFAULT_RESTAURANT_LAT;
  let refLng = DEFAULT_RESTAURANT_LNG;
  let allowedRadius = DEFAULT_KIOSK_RADIUS_M;
  if (env?.DB) {
    try {
      const gpsEntry = await readEdgeCache(env, 'sys:gps_config', true);
      if (gpsEntry?.data) {
        const cLat = Number(gpsEntry.data.lat);
        const cLng = Number(gpsEntry.data.lng);
        const cRad = Number(gpsEntry.data.radius);
        if (Number.isFinite(cLat) && Number.isFinite(cLng) && cLat !== 0 && cLng !== 0) {
          refLat = cLat;
          refLng = cLng;
        }
        if (Number.isFinite(cRad) && cRad > 0) {
          allowedRadius = cRad === 20 ? 25 : cRad;
        }
      }
    } catch {
      // Fallback to calibrated restaurant coordinates
    }
  }

  const R = 6371000;
  const dLat = ((refLat - latNum) * Math.PI) / 180;
  const dLon = ((refLng - lngNum) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((latNum * Math.PI) / 180) *
      Math.cos((refLat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const distMeters = Math.round(R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))));
  const gpsAcc = Number(payload?.gpsAccuracy) || 0;
  const indoorAllowance = Math.min(Math.max(0, gpsAcc) * 0.45, 15);
  const effectiveDist = Math.max(0, distMeters - indoorAllowance);

  if (effectiveDist > allowedRadius) {
    return {
      ok: false,
      code: 'OUT_OF_RADIUS',
      data: {
        code: 'OUT_OF_RADIUS',
        distMeters,
        allowedRadius,
      },
      message: `Thiết bị đang cách nhà hàng ${distMeters}m (vượt quá bán kính Trạm Face ID <= ${allowedRadius}m).`,
    };
  }
  return null;
}

async function preCheckEnrollFaceProfileEdge(env, payload, verifiedSession = null) {
  const targetUser = String(payload?.username || '').trim().toLowerCase();
  if (!targetUser || !payload?.vectorsB64) {
    return {
      ok: false,
      message: 'Thiếu thông tin tài khoản hoặc dữ liệu 5 góc khuôn mặt.',
    };
  }
  const incomingVectors = decodeInt8VectorsEdge(String(payload.vectorsB64), EDGE_FACE_DIM);
  if (incomingVectors.length === 0) {
    return {
      ok: false,
      message: 'Dữ liệu sinh trắc học khuôn mặt không hợp lệ.',
    };
  }
  if (!env?.DB) return null;

  try {
    const incomingCentroid = computeCentroidEdge(incomingVectors, EDGE_FACE_DIM);
    const effectiveRole = verifiedSession?.r
      ? String(verifiedSession.r).trim().toLowerCase()
      : String(payload?.actorRole || payload?.role || '').trim().toLowerCase();
    const isAdminOverride = effectiveRole === 'admin';

    const rowsRes = await env.DB.prepare(
      `SELECT username, fullname, vectors_b64, centroid_b64, is_locked FROM edge_face_profiles`
    ).all();

    for (const r of rowsRes?.results || []) {
      const rUser = String(r.username || '').trim().toLowerCase();
      if (!rUser) continue;
      if (rUser === targetUser) {
        if (Number(r.is_locked) === 1 && r.vectors_b64 && !isAdminOverride) {
          return {
            ok: false,
            code: 'FACE_PROFILE_LOCKED',
            data: { code: 'FACE_PROFILE_LOCKED' },
            message:
              'Khuôn mặt đã được khóa bảo vệ sau lần đăng ký đầu tiên. Vui lòng liên hệ Quản lý để mở khóa nếu cần đăng ký lại.',
          };
        }
      } else if (r.vectors_b64) {
        const otherVecs = decodeInt8VectorsEdge(String(r.vectors_b64), EDGE_FACE_DIM);
        const otherCent = r.centroid_b64
          ? decodeInt8VectorsEdge(String(r.centroid_b64), EDGE_FACE_DIM)[0] || null
          : null;
        const dupScore = computeFaceProfileScoreEdge(incomingCentroid, otherVecs, otherCent);
        if (dupScore >= EDGE_FACE_DUPLICATE_THRESHOLD) {
          const otherName = String(r.fullname || rUser);
          return {
            ok: false,
            code: 'DUPLICATE_FACE_IDENTITY',
            data: {
              code: 'DUPLICATE_FACE_IDENTITY',
              matchedUsername: rUser,
              similarity: Math.round(dupScore * 1000) / 1000,
            },
            message: `Từ chối đăng ký: Khuôn mặt này trùng khớp với hồ sơ của nhân sự "${otherName}". Mỗi nhân viên chỉ được gắn 1 khuôn mặt duy nhất!`,
          };
        }
      }
    }
  } catch (e) {
    console.warn('[Edge Face Enroll Precheck] warning:', e);
  }
  return null;
}

async function preCheckCheckInEdge(env, payload) {
  const targetUser = String(payload?.username || '').trim().toLowerCase();
  const isFaceMode = String(payload?.checkinMode || '').trim() === 'v2_face';
  const checkType = String(payload?.type || 'Vào ca');
  const isAttendancePunch = isEdgeCheckInLabel(checkType) || isEdgeCheckOutLabel(checkType);
  const now = Date.now();
  const incomingId = String(payload?.checkinId || '').trim();
  let acquiredLock = false;

  // Step 1 (SYNCHRONOUS — zero await before reservation): Atomic Earliest-Scan-Wins In-Flight Lock
  if (targetUser && isAttendancePunch && !payload?.isOfflineRetry) {
    const activeLock = inFlightEdgeCheckIns.get(targetUser);
    if (
      activeLock &&
      now - activeLock.startedAt < 30000 &&
      (!incomingId || activeLock.checkinId !== incomingId)
    ) {
      return {
        ok: false,
        code: 'COOLDOWN_15M',
        isSpamCooldown: true,
        data: {
          code: 'COOLDOWN_15M',
          remainingSeconds: 15 * 60,
        },
        message:
          'Hệ thống đang ghi nhận lượt quét sớm nhất của bạn — vui lòng không quét lặp trong 15 phút.',
      };
    }

    const lockToken = Symbol('checkinLock');
    if (payload && typeof payload === 'object') {
      payload[EDGE_LOCK_TOKEN_SYM] = lockToken;
    }
    inFlightEdgeCheckIns.set(targetUser, {
      token: lockToken,
      checkinId: incomingId || `${targetUser}_${now}`,
      startedAt: now,
    });
    acquiredLock = true;
  }

  try {
    if (isFaceMode) {
      const liveVecs = decodeInt8VectorsEdge(String(payload?.liveVectorB64 || ''), EDGE_FACE_DIM);
      if (!targetUser || liveVecs.length === 0) {
        if (acquiredLock) releaseInFlightEdgeCheckIn(payload);
        return {
          ok: false,
          code: 'FACE_VERIFICATION_FAILED',
          data: { code: 'FACE_VERIFICATION_FAILED' },
          message: 'Thiếu dữ liệu vector xác thực khuôn mặt trực tiếp.',
        };
      }

      if (env?.DB) {
        try {
          const profRow = await env.DB.prepare(
            `SELECT vectors_b64, centroid_b64, employment_status FROM edge_face_profiles WHERE username = ?1 LIMIT 1`
          )
            .bind(targetUser)
            .first();
          if (profRow && profRow.vectors_b64) {
            const st = String(profRow.employment_status || 'active').toLowerCase();
            if (st === 'resigned' || st === 'suspended') {
              if (acquiredLock) releaseInFlightEdgeCheckIn(payload);
              return {
                ok: false,
                code: 'ACCOUNT_INACTIVE',
                data: { code: 'ACCOUNT_INACTIVE' },
                message: 'Tài khoản không trong trạng thái làm việc hoạt động.',
              };
            }
            const storedVecs = decodeInt8VectorsEdge(String(profRow.vectors_b64), EDGE_FACE_DIM);
            const storedCent = profRow.centroid_b64
              ? decodeInt8VectorsEdge(String(profRow.centroid_b64), EDGE_FACE_DIM)[0] || null
              : null;
            const score = computeFaceProfileScoreEdge(liveVecs[0], storedVecs, storedCent);
            if (score < EDGE_FACE_SERVER_VERIFY_MIN) {
              if (acquiredLock) releaseInFlightEdgeCheckIn(payload);
              return {
                ok: false,
                code: 'FACE_VERIFICATION_FAILED',
                data: {
                  code: 'FACE_VERIFICATION_FAILED',
                  score: Math.round(score * 1000) / 1000,
                },
                message: 'Xác thực khuôn mặt không khớp với hồ sơ gốc trên hệ thống.',
              };
            }
          }
        } catch (e) {
          console.warn('[Edge Face Verify] warning:', e);
        }
      }
    }

    // Step 2: 15-Minute Per-Employee Cooldown Guard on D1 (evaluated strictly on real live punch time; ignores historical missed-checkin claims & delayed offline syncs)
    if (env?.DB && targetUser && isAttendancePunch && !payload?.isOfflineRetry) {
      try {
        const cutoff = now - EDGE_COOLDOWN_15M_MS;
        const recentRes = await env.DB.prepare(
          `SELECT id, check_type, time_str, status, note, created_at FROM edge_checkin_logs WHERE username = ?1 AND created_at >= ?2 ORDER BY created_at DESC LIMIT 15`
        )
          .bind(targetUser, cutoff)
          .all();

        for (const r of recentRes?.results || []) {
          if (incomingId && String(r.id || '').trim() === incomingId) {
            continue;
          }
          if (isEdgeSupplementClaimRow(r)) {
            continue;
          }
          if (!isEdgeCheckInLabel(r.check_type) && !isEdgeCheckOutLabel(r.check_type)) {
            continue;
          }
          const punchTs = resolveEdgePunchTimestampMs(r);
          const elapsed = now - punchTs;
          if (punchTs > 0 && elapsed >= 0 && elapsed < EDGE_COOLDOWN_15M_MS) {
            const remainingSeconds = Math.ceil((EDGE_COOLDOWN_15M_MS - elapsed) / 1000);
            const remainingMins = Math.ceil(remainingSeconds / 60);
            if (acquiredLock) releaseInFlightEdgeCheckIn(payload);
            return {
              ok: false,
              code: 'COOLDOWN_15M',
              isSpamCooldown: true,
              data: {
                code: 'COOLDOWN_15M',
                remainingSeconds,
                lastType: r.check_type,
                lastTime: r.time_str,
              },
              message: `Lượt chấm "${r.check_type}" của bạn đã được ghi nhận lúc ${r.time_str || 'gần đây'}. Vui lòng đợi thêm ${remainingMins} phút nữa (quy định giãn cách 15 phút/nhân sự).`,
            };
          }
        }
      } catch (e) {
        console.warn('[Edge 15m Cooldown] warning:', e);
      }
    }

    return null;
  } catch (err) {
    if (acquiredLock) releaseInFlightEdgeCheckIn(payload);
    throw err;
  }
}

async function enqueueFaceProfileSyncToGas(env, payload) {
  if (!env?.DB) return;
  const uname = String(payload?.username || '').trim().toLowerCase();
  const safeVectorsB64 = normalizeSafeFaceB64Edge(payload?.vectorsB64 || payload?.vectors_b64);
  if (!uname || !safeVectorsB64) return;
  const now = Date.now();
  const dedupeKey = `ENROLL_FACE_PROFILE:${uname}`;
  const syncPayload = {
    username: uname,
    fullname: String(payload?.fullname || uname).trim(),
    position: String(payload?.position || 'Nhân sự').trim(),
    avatarUrl: String(payload?.avatarUrl || payload?.avatar_url || '').trim(),
    employmentStatus: String(
      payload?.employmentStatus || payload?.employment_status || 'active'
    ).trim(),
    modelVersion: String(
      payload?.modelVersion || payload?.model_version || 'w600k_mbf_int8_v2_canon'
    ).trim(),
    anglesCount: Number(payload?.anglesCount || payload?.angle_count) || 5,
    qualityScore: Number(payload?.qualityScore || payload?.quality_score) || 0,
    vectorsB64: safeVectorsB64,
    targetRole: String(payload?.targetRole || payload?.role || 'user').trim().toLowerCase(),
    role: 'admin',
    actorRole: 'admin',
    adminUsername: 'ADMIN',
    actorUsername: String(payload?.actorUsername || payload?.enrolled_by || 'ADMIN').trim(),
    enrolledByAdmin: true,
  };
  await env.DB.prepare(
    `INSERT INTO edge_sync_queue (dedupe_key, action, payload_json, attempts, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, 1, 'pending', ?4, ?4)
     ON CONFLICT(dedupe_key) DO UPDATE SET
       payload_json = excluded.payload_json,
       status = 'pending',
       updated_at = excluded.updated_at`
  )
    .bind(dedupeKey, 'ENROLL_FACE_PROFILE', JSON.stringify(syncPayload), now)
    .run()
    .catch(() => {});
}

async function healFaceProfileToGas(env, d1Row, fetchImpl = fetch) {
  if (!d1Row?.username || !d1Row?.vectors_b64) return false;
  const uname = String(d1Row.username).trim().toLowerCase();
  const safeVectorsB64 = normalizeSafeFaceB64Edge(d1Row.vectors_b64);
  if (!uname || !safeVectorsB64) return false;

  if (env?.DB && String(d1Row.vectors_b64) !== safeVectorsB64) {
    await env.DB.prepare(
      `UPDATE edge_face_profiles SET vectors_b64 = ?1, updated_at = ?2 WHERE username = ?3`
    )
      .bind(safeVectorsB64, Date.now(), uname)
      .run()
      .catch(() => {});
  }

  const healPayload = {
    action: 'ENROLL_FACE_PROFILE',
    username: uname,
    fullname: String(d1Row.fullname || uname).trim(),
    position: String(d1Row.position || 'Nhân sự').trim(),
    avatarUrl: String(d1Row.avatar_url || '').trim(),
    employmentStatus: String(d1Row.employment_status || 'active').trim(),
    modelVersion: String(d1Row.model_version || 'w600k_mbf_int8_v2_canon').trim(),
    anglesCount: Number(d1Row.angle_count) || 5,
    qualityScore: Number(d1Row.quality_score) || 0,
    vectorsB64: safeVectorsB64,
    targetRole: String(d1Row.role || 'user').trim().toLowerCase(),
    role: 'admin',
    actorRole: 'admin',
    adminUsername: 'ADMIN',
    actorUsername: String(d1Row.enrolled_by || 'ADMIN').trim(),
    enrolledByAdmin: true,
  };

  try {
    const res = await fetchImpl(TARGET_GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(healPayload),
      signal:
        typeof AbortSignal !== 'undefined' && AbortSignal.timeout
          ? AbortSignal.timeout(15000)
          : undefined,
    });
    const parsed = await res.json();
    if (parsed && parsed.ok === true) {
      if (env?.DB) {
        await env.DB.prepare(`DELETE FROM edge_sync_queue WHERE dedupe_key = ?1`)
          .bind(`ENROLL_FACE_PROFILE:${uname}`)
          .run()
          .catch(() => {});
      }
      return true;
    }
  } catch {
    // Fall through to persistent sync queue
  }

  await enqueueFaceProfileSyncToGas(env, d1Row);
  return false;
}

async function upsertFaceProfileInD1(db, payload, now) {
  const uname = String(payload?.username || '').trim().toLowerCase();
  const rawVectorsB64 = String(payload?.vectorsB64 || '').trim();
  if (!uname || !rawVectorsB64) return;
  const vecs = decodeInt8VectorsEdge(rawVectorsB64, EDGE_FACE_DIM);
  if (vecs.length === 0) return;
  const vectorsB64 = normalizeSafeFaceB64Edge(rawVectorsB64) || rawVectorsB64;
  const centroid = computeCentroidEdge(vecs, EDGE_FACE_DIM);
  const centroidB64 = encodeFloatVectorToInt8B64Edge(centroid);
  const vnTime = formatVietnamTimestampFromMs(now);
  const fullname = String(payload?.fullname || uname).trim();
  const role = String(
    payload?.targetRole || (payload?.enrolledByAdmin ? 'user' : payload?.role) || 'user'
  )
    .trim()
    .toLowerCase();
  const position = String(payload?.position || 'Nhân sự').trim();
  const avatarUrl = String(payload?.avatarUrl || '').trim();
  const empStatus = String(payload?.employmentStatus || 'active').trim().toLowerCase();
  const modelVersion = String(payload?.modelVersion || 'w600k_mbf_int8_v2').trim();
  const angleCount = Number(payload?.anglesCount) || vecs.length;
  const qualityScore = Number(payload?.qualityScore) || 0;
  const actor = String(payload?.actorUsername || payload?.adminUsername || uname).trim();

  await db
    .prepare(
      `INSERT OR REPLACE INTO edge_face_profiles
       (username, fullname, role, position, avatar_url, employment_status, model_version, angle_count, vectors_b64, centroid_b64, quality_score, is_locked, enrolled_at, enrolled_by, unlocked_by, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`
    )
    .bind(
      uname,
      fullname,
      role,
      position,
      avatarUrl,
      empStatus,
      modelVersion,
      angleCount,
      vectorsB64,
      centroidB64,
      qualityScore,
      1,
      vnTime,
      actor,
      '',
      now
    )
    .run();
}

async function overlayFaceProfilesFromD1(resultObj, env) {
  const cloned = JSON.parse(JSON.stringify(resultObj));
  if (!cloned.data || typeof cloned.data !== 'object') {
    cloned.data = { profiles: [], totalActiveUsers: 0 };
  }
  const gasProfiles = Array.isArray(cloned.data.profiles) ? cloned.data.profiles : [];
  const byUser = new Map();

  for (const p of gasProfiles) {
    const u = String(p?.username || '').trim().toLowerCase();
    const wireGasVec = toStandardFaceB64Edge(p?.vectorsB64);
    if (!u || !wireGasVec) continue;
    byUser.set(u, {
      username: String(p.username).trim(),
      fullname: String(p.fullname || p.username).trim(),
      position: String(p.position || 'Nhân sự'),
      avatarUrl: String(p.avatarUrl || ''),
      employmentStatus: String(p.employmentStatus || 'active'),
      vectorsB64: wireGasVec,
      anglesCount: Number(p.anglesCount) || 5,
      modelVersion: String(p.modelVersion || 'w600k_mbf_int8_v2'),
      enrolledAt: String(p.enrolledAt || ''),
      isLocked: Boolean(p.isLocked),
    });
  }

  if (env?.DB) {
    const d1Res = await env.DB.prepare(
      `SELECT username, fullname, position, avatar_url, employment_status, model_version, angle_count, vectors_b64, is_locked, enrolled_at
       FROM edge_face_profiles`
    ).all();
    for (const r of d1Res?.results || []) {
      const u = String(r.username || '').trim().toLowerCase();
      const wireD1Vec = toStandardFaceB64Edge(r.vectors_b64);
      if (!u || !wireD1Vec) continue;
      const st = String(r.employment_status || 'active').toLowerCase();
      if (st === 'resigned' || st === 'suspended') {
        byUser.delete(u);
        continue;
      }
      const existing = byUser.get(u);
      byUser.set(u, {
        username: existing?.username || u,
        fullname: String(r.fullname || existing?.fullname || u),
        position: String(r.position || existing?.position || 'Nhân sự'),
        avatarUrl: String(r.avatar_url || existing?.avatarUrl || ''),
        employmentStatus: st,
        vectorsB64: wireD1Vec,
        anglesCount: Number(r.angle_count) || 5,
        modelVersion: String(r.model_version || 'w600k_mbf_int8_v2'),
        enrolledAt: String(r.enrolled_at || existing?.enrolledAt || ''),
        isLocked: Number(r.is_locked) === 1,
      });
    }
  }

  cloned.data.profiles = Array.from(byUser.values());
  if (Array.isArray(cloned.data.activeEmployees)) {
    cloned.data.activeEmployees = cloned.data.activeEmployees.map((emp) => {
      const u = String(emp?.username || '').trim().toLowerCase();
      return {
        ...emp,
        hasFaceProfile: byUser.has(u),
      };
    });
  }
  if (!cloned.data.totalActiveUsers) {
    cloned.data.totalActiveUsers = cloned.data.profiles.length;
  }
  return cloned;
}

function parseEdgeVietnamTimestampMs(rawTime) {
  const clean = String(rawTime || '').replace(/^['"\s]+|['"\s]+$/g, '');
  const m = clean.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (!m) return 0;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10) - 1;
  const yyyy = parseInt(m[3], 10);
  const hh = m[4] ? parseInt(m[4], 10) : 0;
  const min = m[5] ? parseInt(m[5], 10) : 0;
  const ss = m[6] ? parseInt(m[6], 10) : 0;
  return Date.UTC(yyyy, mm, dd, hh, min, ss) - 7 * 3600 * 1000;
}

function resolveEdgePunchTimestampMs(rowOrTime, fallbackCreatedAt = 0) {
  if (rowOrTime && typeof rowOrTime === 'object') {
    if (isEdgeSupplementClaimRow(rowOrTime)) {
      const claimedMs = parseEdgeVietnamTimestampMs(rowOrTime.time_str || rowOrTime.time);
      if (claimedMs > 0) return claimedMs;
    }
    const createdAtNum = Number(rowOrTime.created_at || 0);
    if (Number.isFinite(createdAtNum) && createdAtNum > 0) {
      return createdAtNum;
    }
    const parsedRowMs = parseEdgeVietnamTimestampMs(rowOrTime.time_str || rowOrTime.time);
    return parsedRowMs > 0 ? parsedRowMs : 0;
  }
  const fb = Number(fallbackCreatedAt || 0);
  if (Number.isFinite(fb) && fb > 0) return fb;
  const parsed = parseEdgeVietnamTimestampMs(rowOrTime);
  return parsed > 0 ? parsed : 0;
}

function isEdgeSupplementClaimRow(row) {
  if (!row || typeof row !== 'object') return false;
  const id = String(row.id || '').trim();
  const type = String(row.check_type || row.type || '').normalize('NFC').trim();
  const status = String(row.status || '').normalize('NFC').trim();
  const note = String(row.note || '').normalize('NFC').trim();
  return (
    id.startsWith('MC_') ||
    /^\s*(?:chờ\s*duyệt|từ\s*chối)\s*:/i.test(type) ||
    /bổ\s*sung|giải\s*trình/i.test(status) ||
    /giải\s*trình\s*bổ\s*sung/i.test(note)
  );
}

function normalizeEdgeNfcIdentity(val) {
  return String(val || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchesEdgeEmployeeIdentity(targetUsername, targetFullname, rowUsername, rowFullname) {
  const tUser = normalizeEdgeNfcIdentity(targetUsername);
  const rUser = normalizeEdgeNfcIdentity(rowUsername);
  if (tUser && rUser) {
    return tUser === rUser;
  }
  const tFull = normalizeEdgeNfcIdentity(targetFullname);
  const rFull = normalizeEdgeNfcIdentity(rowFullname);
  if (tFull && rFull && tFull === rFull) return true;
  if (tUser && rFull && tUser === rFull) return true;
  if (rUser && tFull && rUser === tFull) return true;
  if (tFull && rFull) {
    const tFold = foldEdgePersonName(tFull);
    const rFold = foldEdgePersonName(rFull);
    if ((tFull === tFold || rFull === rFold) && tFold && tFold === rFold) {
      return true;
    }
  }
  return false;
}

function isEdgePendingSupplementLabel(type) {
  return /^\s*chờ\s*duyệt\s*:/i.test(String(type || '').normalize('NFC').trim());
}

async function overlayKioskAttendanceStateFromD1(
  resultObj,
  env,
  payload = {},
  isStrictlyAdmin = false
) {
  const cloned = JSON.parse(JSON.stringify(resultObj));
  if (!cloned.data || typeof cloned.data !== 'object') {
    cloned.data = { logs: [] };
  }
  const baseLogs = Array.isArray(cloned.data.logs) ? cloned.data.logs : [];
  const cleanLogs = [];
  const seenKeys = new Set();
  const seenLooseNameKeys = new Set();

  const isPersonalScoped = payload?.isKiosk === false && !isStrictlyAdmin;
  const callerUser = String(payload?.username || '').trim().toLowerCase();
  const callerFullname = String(payload?.fullname || '').trim();

  const matchesScopedCaller = (rowUsername, rowFullname) => {
    if (!isPersonalScoped) return true;
    return matchesEdgeEmployeeIdentity(callerUser, callerFullname, rowUsername, rowFullname);
  };

  for (const l of baseLogs) {
    if (
      !isEdgeCheckInLabel(l?.type) &&
      !isEdgeCheckOutLabel(l?.type) &&
      !isEdgePendingSupplementLabel(l?.type)
    ) {
      continue;
    }
    if (!matchesScopedCaller(l?.username, l?.fullname)) continue;
    const cleanTime = String(l.time || '').replace(/^'/, '').trim();
    const cleanType = String(l.type || '').trim();
    const cleanUser = normalizeEdgeNfcIdentity(l.username);
    const cleanFn = normalizeEdgeNfcIdentity(l.fullname);
    const key = `${cleanUser || cleanFn}|${cleanTime}|${cleanType.toLowerCase()}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    if (!cleanUser && cleanFn) {
      seenLooseNameKeys.add(`${cleanFn}|${cleanTime}|${cleanType.toLowerCase()}`);
    }
    cleanLogs.push({
      username: String(l.username || '').trim(),
      fullname: String(l.fullname || '').trim(),
      type: cleanType,
      time: cleanTime,
      timestamp: parseEdgeVietnamTimestampMs(cleanTime) || Number(l.timestamp || 0),
    });
  }

  if (env?.DB) {
    const cutoff30h = Date.now() - 30 * 3600 * 1000;
    const d1Res = await env.DB.prepare(
      `SELECT id, username, fullname, check_type, time_str, status, note, created_at
       FROM edge_checkin_logs
       WHERE created_at >= ?1
       ORDER BY created_at DESC
       LIMIT 250`
    )
      .bind(cutoff30h)
      .all();

    for (const r of d1Res?.results || []) {
      if (
        !isEdgeCheckInLabel(r.check_type) &&
        !isEdgeCheckOutLabel(r.check_type) &&
        !isEdgePendingSupplementLabel(r.check_type)
      ) {
        continue;
      }
      if (!matchesScopedCaller(r.username, r.fullname)) continue;
      const cleanTime = String(r.time_str || '').replace(/^'/, '').trim();
      const punchTs = resolveEdgePunchTimestampMs(r);
      if (punchTs > 0 && punchTs < cutoff30h) continue;
      const cleanType = String(r.check_type || '').trim();
      const cleanUser = normalizeEdgeNfcIdentity(r.username);
      const cleanFn = normalizeEdgeNfcIdentity(r.fullname);
      const key = `${cleanUser || cleanFn}|${cleanTime}|${cleanType.toLowerCase()}`;
      const looseNameKey = `${cleanFn}|${cleanTime}|${cleanType.toLowerCase()}`;
      if (seenKeys.has(key) || seenLooseNameKeys.has(looseNameKey)) continue;
      seenKeys.add(key);
      cleanLogs.push({
        username: String(r.username || '').trim(),
        fullname: String(r.fullname || '').trim(),
        type: cleanType,
        time: cleanTime,
        timestamp: parseEdgeVietnamTimestampMs(cleanTime) || punchTs,
      });
    }
  }

  cleanLogs.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  cloned.data.logs = cleanLogs;
  return cloned;
}
