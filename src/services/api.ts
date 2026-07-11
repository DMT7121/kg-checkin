// ============================================
// api.ts - GAS API Service
// ============================================
const inFlightReadCalls = new Map<string, Promise<any>>();
const responseCache = new Map<string, { expiresAt: number; value: any }>();

// Get GAS URL dynamically so we can update it without rebuilds
export const getGasUrl = () => {
  const stored = localStorage.getItem('kg_gas_url');
  const fallbackUrl = import.meta.env.PROD
    ? '/api'
    : 'https://script.google.com/macros/s/AKfycbyQ4Y5cQ0BCHBlmzftWq0dPVP2qNgc-PaYMklh44raSX4hDOCIyFi0bV-G6QdUbb-3D/exec';
  
  if (stored && stored.trim() !== fallbackUrl && stored.trim() !== 'https://script.google.com/macros/s/AKfycbyQ4Y5cQ0BCHBlmzftWq0dPVP2qNgc-PaYMklh44raSX4hDOCIyFi0bV-G6QdUbb-3D/exec') {
    localStorage.removeItem('kg_gas_url');
    return fallbackUrl;
  }
  return stored || import.meta.env.VITE_GAS_URL || fallbackUrl;
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
  const bodyStr = JSON.stringify({ action, ...payload });
  const requestKey = `${getGasUrl()}|${bodyStr}`;
  const canUseCache = isReadAction && payload.forceRefresh !== true && options?.cacheTtlMs !== 0;

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

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutMs = options?.timeoutMs !== undefined ? options.timeoutMs : (bg ? 15000 : 35000);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(getGasUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
        body: bodyStr,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const text = await response.text();
      
      // GAS sometimes returns HTML error page instead of JSON
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        console.error(`[API] ${action}: non-JSON response`, text.substring(0, 200));
        throw new Error('Server returned invalid response');
      }

      if (!bg) {
        options?.onLoadingEnd?.();
      }

      // Log failed API calls for debugging
      if (!result.ok) {
        console.warn(`[API] ${action} failed:`, result.message);
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
        // A successful mutation can invalidate any cached read model.
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
      
      return result;
    } catch (error) {
      if (attempt < maxAttempts) {
        // Wait briefly before retry
        await new Promise(r => setTimeout(r, 600));
        continue;
      }
      if (!bg) {
        options?.onLoadingEnd?.();
        console.error('[API] Error:', error);
        const { default: Swal } = await import('sweetalert2');
        Swal.fire('Lỗi mạng', 'Mất kết nối server. Vui lòng thử lại.', 'error');
      }
      return null;
    }
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
