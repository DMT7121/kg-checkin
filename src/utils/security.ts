// ============================================
// security.ts - Security utilities
// ============================================

/**
 * SHA-256 hash for PIN comparison
 * PINs are stored as hashes so they don't appear as plaintext in the JS bundle
 */
export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Pre-computed SHA-256 hashes of PINs (never store plaintext in code)
// sha256('712121') = '...'
// sha256('DMTAPIKEY') = '...'
// These are computed once at build time for comparison
export const ADMIN_PIN_HASH = '9fc7d2573162923a909a04340bdcd59b435b93ddaf6318117ec3a3013e20d142';
export const MASTER_PIN_HASH = '9ca8cf2cdf177498cdcb49d96416243362f33b2b3976758fc09fc119a653138a';

/**
 * Escape HTML to prevent XSS
 * Used before injecting AI responses into Swal.fire({ html: ... })
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize input - strip script tags and event handlers
 * More permissive than escapeHtml, allows basic formatting
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim();
}

/**
 * Rate limiter for brute-force protection on PIN entry
 */
const failedAttempts: { count: number; lastAttempt: number } = { count: 0, lastAttempt: 0 };

export function checkRateLimit(): { allowed: boolean; waitSeconds: number } {
  const now = Date.now();
  const cooldownMs = failedAttempts.count >= 5 ? 300000 : // 5 min after 5 fails
                     failedAttempts.count >= 3 ? 60000 :   // 1 min after 3 fails
                     0;
  
  if (cooldownMs > 0 && (now - failedAttempts.lastAttempt) < cooldownMs) {
    const waitSeconds = Math.ceil((cooldownMs - (now - failedAttempts.lastAttempt)) / 1000);
    return { allowed: false, waitSeconds };
  }
  return { allowed: true, waitSeconds: 0 };
}

export function recordFailedAttempt() {
  failedAttempts.count++;
  failedAttempts.lastAttempt = Date.now();
}

export function resetFailedAttempts() {
  failedAttempts.count = 0;
  failedAttempts.lastAttempt = 0;
}
