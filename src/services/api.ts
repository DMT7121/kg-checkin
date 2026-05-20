// ============================================
// api.ts - GAS API Service
// ============================================
import Swal from 'sweetalert2';

const inFlightBackgroundCalls = new Map<string, Promise<any>>();

// Get GAS URL dynamically so we can update it without rebuilds
export const getGasUrl = () => {
  const stored = localStorage.getItem('kg_gas_url');
  const oldUrls = [
    'https://script.google.com/macros/s/AKfycbxLIwrO0zd2jEoFJftmO-pgMoXinN1EEoUriJEZmmEVSl49jct50jy-oe3OCarw-phm/exec',
    'https://script.google.com/macros/s/AKfycbzLsmPb89mVPxcAeQwEsHIojCcy20eYL7SmIinwLiU_IYPhHER7HdgRGTxoTqUInAEN/exec',
    'https://script.google.com/macros/s/AKfycbxqPRgIrusXho5OhV8YUv9o1Qf3DwvK7_q9lthQMGq5ADLRW198OiKDD4-SlS5c2Y-W/exec'
  ];
  const newUrl = 'https://script.google.com/macros/s/AKfycbyQ4Y5cQ0BCHBlmzftWq0dPVP2qNgc-PaYMklh44raSX4hDOCIyFi0bV-G6QdUbb-3D/exec';
  
  if (stored && oldUrls.includes(stored)) {
    localStorage.removeItem('kg_gas_url');
    return newUrl;
  }
  return stored || import.meta.env.VITE_GAS_URL || newUrl;
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
  }
): Promise<any> {
  const bg = options?.background ?? false;

  if (!bg) {
    options?.onLoadingStart?.();
  }

  const bodyStr = JSON.stringify({ action, ...payload });
  const requestKey = `${getGasUrl()}|${bodyStr}`;

  if (bg && inFlightBackgroundCalls.has(requestKey)) {
    return inFlightBackgroundCalls.get(requestKey);
  }

  const requestPromise = (async () => {
    const maxAttempts = bg ? 0 : 1;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), bg ? 15000 : 35000);

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
        Swal.fire('Lỗi mạng', 'Mất kết nối server. Vui lòng thử lại.', 'error');
      }
      return null;
    }
  }
  })();

  if (bg) {
    inFlightBackgroundCalls.set(requestKey, requestPromise);
    requestPromise.finally(() => inFlightBackgroundCalls.delete(requestKey));
  }

  return requestPromise;
}
