// ============================================
// api.ts - GAS API Service
// ============================================
import Swal from 'sweetalert2';

const GAS_URL = import.meta.env.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbzLsmPb89mVPxcAeQwEsHIojCcy20eYL7SmIinwLiU_IYPhHER7HdgRGTxoTqUInAEN/exec';

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

  const maxRetries = bg ? 1 : 2;
  const bodyStr = JSON.stringify({ action, ...payload });

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const response = await fetch(GAS_URL, {
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
      if (attempt < maxRetries) {
        // Wait briefly before retry
        await new Promise(r => setTimeout(r, 1000));
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
}
