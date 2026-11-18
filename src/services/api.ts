// ============================================
// api.ts - GAS & Cloudflare Edge D1 API Service
// ============================================
const inFlightReadCalls = new Map<string, Promise<any>>();
const responseCache = new Map<string, { expiresAt: number; value: any }>();

const MUTATION_INVALIDATION_PREFIXES: Record<string, string[]> = {
  LIKE_POST: ['GET_POSTS', 'GET_NOTIFICATIONS'],
  COMMENT_POST: ['GET_POSTS', 'GET_NOTIFICATIONS'],
  CREATE_POST: ['GET_POSTS', 'GET_NOTIFICATIONS', 'GET_DATA'],
  DELETE_POST: ['GET_POSTS'],
  MARK_POST_READ: ['GET_POSTS'],
  MARK_NOTIFICATION_READ: ['GET_NOTIFICATIONS'],
  READ_NOTIFICATION: ['GET_NOTIFICATIONS'],
  ADD_SOLDOUT: ['GET_SOLDOUT', 'GET_DATA'],
  REMOVE_SOLDOUT: ['GET_SOLDOUT', 'GET_DATA'],
  SUBMIT_FEEDBACK: ['GET_FEEDBACK', 'GET_NOTIFICATIONS', 'GET_DATA'],
  REPLY_FEEDBACK: ['GET_FEEDBACK', 'GET_NOTIFICATIONS', 'GET_DATA'],
  UPDATE_FEEDBACK: ['GET_FEEDBACK', 'GET_NOTIFICATIONS', 'GET_DATA'],
  SAVE_CHAT_LOG: [],
  AI_CHAT: [],
  SUBMIT_TRAINING_QUIZ: ['GET_TRAINING_', 'GET_LEADERBOARD', 'GET_KING_COINS'],
  SEND_EMAIL_NOTIFICATION: [],
  UPLOAD_IMAGE: [],
  UPLOAD_CHECKIN_IMAGE: [],
  SAVE_OPS_CHECKLIST: ['GET_OPS_CHECKLIST', 'GET_CHECKLIST', 'GET_DATA'],
  SUBMIT_OPS_CHECKLIST: ['GET_OPS_CHECKLIST', 'GET_CHECKLIST', 'GET_DATA'],
  SUBMIT_CHECKLIST: ['GET_OPS_CHECKLIST', 'GET_CHECKLIST', 'GET_DATA'],
  SAVE_OPS_CHECKLIST_CONFIG: ['GET_OPS_CHECKLIST', 'GET_CHECKLIST'],
  SUBMIT_HANDOVER: ['GET_HANDOVER', 'GET_INCIDENTS', 'GET_DATA'],
  SAVE_HANDOVER: ['GET_HANDOVER', 'GET_INCIDENTS', 'GET_DATA'],
  REVIEW_HANDOVER: ['GET_HANDOVER', 'GET_DATA'],
  AUDIT_HANDOVER: ['GET_HANDOVER', 'GET_DATA'],
  UPDATE_INCIDENT: ['GET_INCIDENTS', 'GET_HANDOVER'],
  REGISTER_SHIFT: ['GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES', 'GET_DATA'],
  APPROVE_SCHEDULES: ['GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES', 'GET_DATA'],
  UPDATE_SINGLE_SHIFT: ['GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES', 'GET_DATA'],
  SYNC_ROSTER_SCHEDULES: ['GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES', 'GET_DATA'],
  SUBMIT_SWAP: ['GET_SWAP_REQUESTS', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES', 'GET_DATA', 'GET_NOTIFICATIONS'],
  ACCEPT_SWAP: ['GET_SWAP_REQUESTS', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES', 'GET_DATA', 'GET_NOTIFICATIONS'],
  APPROVE_SWAP: ['GET_SWAP_REQUESTS', 'GET_ALL_SCHEDULES', 'GET_MONTH_SCHEDULES', 'GET_DATA', 'GET_NOTIFICATIONS'],
  DELETE_SWAP: ['GET_SWAP_REQUESTS', 'GET_DATA'],
  SUBMIT_ADVANCE: ['GET_ADVANCES', 'GET_PAYROLL', 'GET_DATA', 'GET_NOTIFICATIONS'],
  APPROVE_ADVANCE: ['GET_ADVANCES', 'GET_PAYROLL', 'GET_DATA', 'GET_NOTIFICATIONS'],
  SUBMIT_DISCIPLINE: ['GET_DISCIPLINE', 'GET_BONUS_PENALTIES', 'GET_PAYROLL', 'GET_KING_COINS', 'GET_DATA'],
  UPDATE_PAYROLL_CONFIG: ['GET_PAYROLL', 'GET_DATA'],
  UPDATE_MONTHLY_SALARY_CONFIG: ['GET_MONTHLY_SALARY', 'GET_PAYROLL', 'GET_DATA'],
  COPY_MONTHLY_SALARY_CONFIG: ['GET_MONTHLY_SALARY', 'GET_PAYROLL'],
  SUBMIT_SALARY_ADJUSTMENT: ['GET_SALARY_ADJUSTMENTS', 'GET_PAYROLL', 'GET_NOTIFICATIONS'],
  REVIEW_SALARY_ADJUSTMENT: ['GET_SALARY_ADJUSTMENTS', 'GET_MONTHLY_SALARY', 'GET_PAYROLL', 'GET_NOTIFICATIONS'],
  CONFIRM_PAYROLL_SLIP: ['GET_PAYROLL', 'GET_PAYROLL_WORKFLOW'],
  UPDATE_PAYROLL_WORKFLOW: ['GET_PAYROLL', 'GET_PAYROLL_WORKFLOW'],
  CHECK_IN_OUT: ['GET_DATA', 'GET_MISSED_CHECKINS', 'GET_TIMESHEET', 'GET_KIOSK_ATTENDANCE_STATE', 'GET_PAYROLL', 'GET_ANALYTICS'],
  SUBMIT_MISSED_CHECKIN: ['GET_MISSED_CHECKINS', 'GET_DATA', 'GET_TIMESHEET', 'GET_NOTIFICATIONS'],
  APPROVE_MISSED_CHECKIN: ['GET_MISSED_CHECKINS', 'GET_DATA', 'GET_TIMESHEET', 'GET_PAYROLL', 'GET_ANALYTICS', 'GET_NOTIFICATIONS'],
  REJECT_MISSED_CHECKIN: ['GET_MISSED_CHECKINS', 'GET_DATA', 'GET_NOTIFICATIONS'],
  ENROLL_FACE_PROFILE: ['GET_FACE_PROFILES'],
  DELETE_FACE_PROFILE: ['GET_FACE_PROFILES'],
  RESET_FACE_PROFILE: ['GET_FACE_PROFILES'],
};

function extractActionFromCacheKey(requestKey: string): string {
  const match = requestKey.match(/"action":"([^"]+)"\s*\}$/);
  return match ? match[1] : '';
}

export function invalidateApiCacheByActionPrefixes(prefixes: ReadonlyArray<string>): void {
  if (!prefixes || prefixes.length === 0) return;
  for (const key of Array.from(responseCache.keys())) {
    const cachedAction = extractActionFromCacheKey(key);
    if (!cachedAction || prefixes.some((prefix) => cachedAction.startsWith(prefix))) {
      responseCache.delete(key);
    }
  }
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const storageKey = sessionStorage.key(i);
      if (!storageKey || !storageKey.startsWith('api_cache:')) continue;
      const cachedAction = extractActionFromCacheKey(storageKey);
      if (!cachedAction || prefixes.some((prefix) => cachedAction.startsWith(prefix))) {
        keysToRemove.push(storageKey);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {
    console.warn('[API Cache] invalidate error:', e);
  }
}

function invalidateCacheForMutation(action: string): void {
  if (Object.prototype.hasOwnProperty.call(MUTATION_INVALIDATION_PREFIXES, action)) {
    const prefixes = MUTATION_INVALIDATION_PREFIXES[action];
    invalidateApiCacheByActionPrefixes(prefixes);
    return;
  }
  clearApiCache();
}

export const PRIMARY_EDGE_API_URL = 'https://kg-checkin.pages.dev/api';

// Get GAS / Edge Gateway URL dynamically so we can update it without rebuilds
export const getGasUrl = () => {
  const stored = localStorage.getItem('kg_gas_url');
  const isProd = Boolean((import.meta as any).env?.PROD);
  const envGasUrl = (import.meta as any).env?.VITE_GAS_URL;
  const fallbackUrl = isProd
    ? '/api'
    : (envGasUrl || 'https://script.google.com/macros/s/AKfycbyQ4Y5cQ0BCHBlmzftWq0dPVP2qNgc-PaYMklh44raSX4hDOCIyFi0bV-G6QdUbb-3D/exec');

  const trimmed = stored?.trim();
  if (isProd) {
    // On production Pages hosts, always route through Cloudflare Edge Gateway (/api or PRIMARY_EDGE_API_URL)
    // so stale legacy direct GAS URLs in localStorage never bypass D1 edge_face_profiles sync.
    if (trimmed && trimmed !== '/api' && trimmed !== PRIMARY_EDGE_API_URL) {
      localStorage.removeItem('kg_gas_url');
      return fallbackUrl;
    }
    return trimmed || fallbackUrl;
  }
  if (
    trimmed &&
    trimmed !== '/api' &&
    trimmed !== PRIMARY_EDGE_API_URL &&
    !/^https:\/\/script\.google\.com\/macros\//.test(trimmed)
  ) {
    localStorage.removeItem('kg_gas_url');
    return fallbackUrl;
  }
  return trimmed || fallbackUrl;
};

export const setGasUrl = (url: string) => {
  if (url) {
    localStorage.setItem('kg_gas_url', url.trim());
  } else {
    localStorage.removeItem('kg_gas_url');
  }
};

/**
 * Call Google Apps Script API
 * - foreground calls show loading spinner + error toast
 * - background calls are silent
 */
export async function callApi(
  action: string,
  payload: Record<string, any> = {},
  options?: {
    background?: boolean;
    onLoadingStart?: () => void;
    onLoadingEnd?: () => void;
    timeoutMs?: number;
    maxAttempts?: number;
    cacheTtlMs?: number;
  }
): Promise<any> {
  const bg = options?.background ?? false;
  const isReadAction = action.startsWith('GET_') || action === 'GEOCODE';

  // Prevent payload.action (e.g. 'LIKE', 'COMMENT', 'APPROVE', 'REJECT') from overwriting top-level RPC action
  const { action: innerAction, ...restPayload } = payload || {};
  const normalizedPayload: Record<string, any> = { ...restPayload };
  if (innerAction !== undefined && innerAction !== action) {
    if (normalizedPayload.subAction === undefined) {
      normalizedPayload.subAction = innerAction;
    }
    if (action.startsWith('APPROVE_') && normalizedPayload.decision === undefined) {
      normalizedPayload.decision = innerAction;
    }
  }

  // Attach non-breaking session auth context when available
  try {
    const sessionToken = localStorage.getItem('kg_session_token');
    if (sessionToken && normalizedPayload._authToken === undefined) {
      normalizedPayload._authToken = sessionToken;
    }
    if (!isReadAction && action !== 'LOGIN' && action !== 'REGISTER') {
      const savedUserRaw = localStorage.getItem('kg_user');
      if (savedUserRaw) {
        const savedUser = JSON.parse(savedUserRaw);
        if (savedUser?.username && normalizedPayload.actorUsername === undefined) {
          normalizedPayload.actorUsername = savedUser.username;
        }
        if (savedUser?.role === 'admin' && normalizedPayload.adminUsername === undefined) {
          normalizedPayload.adminUsername = savedUser.username;
        }
      }
    }
  } catch { /* ignore storage access errors */ }

  const bodyStr = JSON.stringify({ ...normalizedPayload, action });
  const requestKey = `${getGasUrl()}|${bodyStr}`;
  const canUseCache = isReadAction && normalizedPayload.forceRefresh !== true && options?.cacheTtlMs !== 0;

  if (canUseCache) {
    let cached = responseCache.get(requestKey);
    if (!cached) {
      try {
        const storedStr = sessionStorage.getItem(`api_cache:${requestKey}`);
        if (storedStr) {
          const parsed = JSON.parse(storedStr);
          if (parsed && parsed.expiresAt > Date.now()) {
            responseCache.set(requestKey, parsed);
            cached = parsed;
          } else {
            sessionStorage.removeItem(`api_cache:${requestKey}`);
          }
        }
      } catch (e) {
        console.warn('[API Cache] read error:', e);
      }
    }
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) {
      responseCache.delete(requestKey);
      try {
        sessionStorage.removeItem(`api_cache:${requestKey}`);
      } catch {}
    }
  }

  if (isReadAction && inFlightReadCalls.has(requestKey)) {
    return inFlightReadCalls.get(requestKey);
  }

  if (!bg) {
    options?.onLoadingStart?.();
  }

  const requestPromise = (async () => {
    const maxAttempts = options?.maxAttempts !== undefined ? options.maxAttempts : (bg ? 0 : 1);
    const baseTargetUrl = getGasUrl();
    const currentOrigin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    const candidateUrls =
      baseTargetUrl === '/api' && currentOrigin !== 'https://kg-checkin.pages.dev'
        ? ['/api', PRIMARY_EDGE_API_URL]
        : [baseTargetUrl];

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      let lastEndpointError: unknown = null;
      for (let epIdx = 0; epIdx < candidateUrls.length; epIdx++) {
        const targetUrl = candidateUrls[epIdx];
        const hasFallbackEndpoint = epIdx < candidateUrls.length - 1;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
          const controller = new AbortController();
          const timeoutMs = options?.timeoutMs !== undefined ? options.timeoutMs : (bg ? 15000 : 35000);
          timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          const useKeepalive = !isReadAction && bodyStr.length < 55000 && attempt === 0 && epIdx === 0;
          const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            redirect: 'follow',
            body: bodyStr,
            signal: controller.signal,
            ...(useKeepalive ? { keepalive: true } : {}),
          });
          clearTimeout(timeoutId);
          timeoutId = null;

          const text = await response.text();

          // GAS or static Pages host without Functions sometimes returns HTML error page instead of JSON
          let result;
          try {
            result = JSON.parse(text);
          } catch {
            if (hasFallbackEndpoint) {
              console.warn(`[API] ${action} (${targetUrl}): non-JSON response, failing over...`);
            } else {
              console.error(`[API] ${action} (${targetUrl}): non-JSON response`, text.substring(0, 200));
            }
            throw new Error('Server returned invalid response');
          }

          // Normalize GAS jsonResponse(false, { message, code }) where fields are nested inside result.data
          if (result && typeof result === 'object' && !result.ok && result.data && typeof result.data === 'object') {
            if (!result.message && typeof result.data.message === 'string') {
              result.message = result.data.message;
            }
            if (!result.code && typeof result.data.code === 'string') {
              result.code = result.data.code;
            }
            if (result.isSpamCooldown === undefined && result.data.isSpamCooldown !== undefined) {
              result.isSpamCooldown = result.data.isSpamCooldown;
            }
          }

          // If a secondary/stale Edge deployment rejects a newer RPC action, fail over to PRIMARY_EDGE_API_URL
          if (
            hasFallbackEndpoint &&
            result &&
            result.ok === false &&
            /Action không hợp lệ/i.test(String(result.message || ''))
          ) {
            console.warn(`[API] ${action} unsupported on ${targetUrl}, failing over to primary Edge gateway...`);
            continue;
          }

          if (!bg) {
            options?.onLoadingEnd?.();
          }

          // Persist server-issued session token on successful LOGIN
          if (action === 'LOGIN' && result?.ok && result?.data?.sessionToken) {
            try {
              localStorage.setItem('kg_session_token', String(result.data.sessionToken));
            } catch { /* ignore */ }
          }

          // Log failed API calls for debugging
          if (!result.ok) {
            console.warn(`[API] ${action} failed:`, result.message || result.code || result.data);
          } else if (canUseCache) {
            const defaultTtl = action === 'GET_DATA'
              ? 5 * 60_000
              : (action === 'GET_NOTIFICATIONS' || action === 'GET_POSTS' ? 30_000 : 2 * 60_000);
            const ttl = options?.cacheTtlMs ?? defaultTtl;
            const cacheEntry = { expiresAt: Date.now() + ttl, value: result };
            responseCache.set(requestKey, cacheEntry);
            try {
              sessionStorage.setItem(`api_cache:${requestKey}`, JSON.stringify(cacheEntry));
            } catch (e) {
              console.warn('[API Cache] write error:', e);
            }
          } else if (!isReadAction) {
            invalidateCacheForMutation(action);
          }

          return result;
        } catch (endpointErr) {
          if (timeoutId) clearTimeout(timeoutId);
          lastEndpointError = endpointErr;
          if (hasFallbackEndpoint) {
            console.warn(`[API] ${action} failed on ${targetUrl}, failing over to primary Edge gateway...`, endpointErr);
            continue;
          }
        }
      }

      if (attempt < maxAttempts) {
        // Wait briefly before retry
        await new Promise(r => setTimeout(r, 600));
        continue;
      }
      if (!bg) {
        options?.onLoadingEnd?.();
        console.error('[API] Error:', lastEndpointError);
        const { default: Swal } = await import('sweetalert2');
        Swal.fire('Lỗi mạng', 'Mất kết nối server. Vui lòng thử lại.', 'error');
      }
      return null;
    }
  })();

  if (isReadAction) {
    inFlightReadCalls.set(requestKey, requestPromise);
    requestPromise.finally(() => inFlightReadCalls.delete(requestKey));
  }

  return requestPromise;
}

export function clearApiCache(): void {
  responseCache.clear();
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('api_cache:')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
  } catch (e) {
    console.warn('[API Cache] clear error:', e);
  }
}
