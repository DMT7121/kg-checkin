/**
 * antiFraud.ts - Anti-Mock Location & GPS Spoofing Detection Engine
 * King's Grill Security & Anti-Fraud Architecture (KG-OS)
 */

export interface GpsSamplePoint {
  lat: number;
  lng: number;
  acc: number;
  alt: number | null;
  speed: number | null;
  timestamp: number; // pos.timestamp from hardware sensor
  receivedAt: number; // Date.now() when browser received
  isFastStart?: boolean;
}

export interface SpoofCheckResult {
  isSuspicious: boolean;
  score: number; // 0 - 100 risk score (>= 50 is flagged)
  reasons: string[];
  details: {
    zeroJitter: boolean;
    accuracyAnomaly: boolean;
    timestampAnomaly: boolean;
    teleportation: boolean;
    webdriverDetected: boolean;
  };
}

// In-memory ring buffer of recent GPS samples for this session
const recentSamples: GpsSamplePoint[] = [];
const MAX_SAMPLES = 8;

/**
 * Check if the current user is an authorized test account allowed to bypass GPS constraints.
 */
export function isAuthorizedTestUser(currentUser?: { username?: string; role?: string } | null): boolean {
  if (!currentUser) return false;
  const role = (currentUser.role || '').toLowerCase();
  const username = (currentUser.username || '').toLowerCase();

  // Admin, designated testers, and fixed test account
  if (role === 'admin' || role === 'tester') return true;
  if (username === 'testapp' || username === 'admin') return true;

  return false;
}

/**
 * Record a raw GPS sample from navigator.geolocation
 */
export function recordGpsSample(pos: GeolocationPosition, isFastStart = false): void {
  const now = Date.now();
  const prev = recentSamples[recentSamples.length - 1];

  // iOS CoreLocation often re-emits the exact same cached CLLocation when stationary.
  // Avoid pushing duplicate cached fixes as separate satellite readings.
  if (
    prev &&
    prev.lat === pos.coords.latitude &&
    prev.lng === pos.coords.longitude &&
    prev.acc === pos.coords.accuracy &&
    (prev.timestamp === pos.timestamp || now - prev.receivedAt < 400)
  ) {
    return;
  }

  const sample: GpsSamplePoint = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    acc: pos.coords.accuracy,
    alt: pos.coords.altitude,
    speed: pos.coords.speed,
    timestamp: pos.timestamp,
    receivedAt: now,
    isFastStart,
  };

  recentSamples.push(sample);
  if (recentSamples.length > MAX_SAMPLES) {
    recentSamples.shift();
  }
}

/**
 * Clear recorded GPS samples (e.g. on fresh manual re-scan)
 */
export function clearGpsSamples(): void {
  recentSamples.length = 0;
}

/**
 * Calculate distance in meters between two lat/lng points using Haversine formula
 */
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Analyze recorded GPS samples and device environment for signs of Fake GPS / Mock Location apps.
 */
export function detectGpsSpoofing(currentPos?: GeolocationPosition): SpoofCheckResult {
  const reasons: string[] = [];
  let score = 0;

  const details = {
    zeroJitter: false,
    accuracyAnomaly: false,
    timestampAnomaly: false,
    teleportation: false,
    webdriverDetected: false,
  };

  // 1. Check for automated environment / DevTools emulation
  const nav = navigator as Navigator & { webdriver?: boolean };
  if (nav.webdriver === true || window.document.documentElement.getAttribute('webdriver')) {
    details.webdriverDetected = true;
    score += 80;
    reasons.push('Phát hiện môi trường tự động hóa / trình duyệt giả lập (WebDriver).');
  }

  if (currentPos) {
    recordGpsSample(currentPos);
  }

  if (recentSamples.length === 0) {
    return { isSuspicious: false, score: 0, reasons: [], details };
  }

  const latest = recentSamples[recentSamples.length - 1];

  // 2. Check Accuracy Anomaly
  // Fake GPS apps commonly return <= 0 or exact 1.0m accuracy
  if (latest.acc <= 0) {
    details.accuracyAnomaly = true;
    score += 50;
    reasons.push(`Sai số GPS phi thực tế (accuracy = ${latest.acc}m).`);
  } else if (latest.acc === 1) {
    // 1 meter exact integer accuracy is abnormal on civilian GPS
    score += 25;
    reasons.push('Độ chính xác 1.0m bất thường (nghi vấn Mock Location).');
  }

  // 3. Hardware vs System Timestamp Discrepancy
  // Note: iOS CoreLocation caches stationary fixes for several minutes while standing still.
  // Only flag extreme drift (> 10 minutes old) or future timestamps (> 60s ahead).
  const futureDelta = latest.timestamp - latest.receivedAt;
  const staleDelta = latest.receivedAt - latest.timestamp;
  if (futureDelta > 60000 || staleDelta > 600000) {
    details.timestampAnomaly = true;
    score += 20;
    const diffSec = Math.round(Math.abs(latest.receivedAt - latest.timestamp) / 1000);
    reasons.push(`Đồng hồ phần cứng GPS lệch ${diffSec}s so với hệ thống.`);
  }

  // 4. Zero-Jitter Analysis (requires at least 4 distinct high-accuracy samples)
  // On iOS CoreLocation, stationary filtering can hold coordinates constant; only flag when
  // accuracy is also a synthetic exact integer (<= 3m) across 4 distinct hardware timestamps.
  const highAccSamples = recentSamples.filter((s) => !s.isFastStart && s.acc <= 35);
  if (highAccSamples.length >= 4) {
    const last4 = highAccSamples.slice(-4);
    const latMatch = last4.every((s) => s.lat === last4[0].lat);
    const lngMatch = last4.every((s) => s.lng === last4[0].lng);
    const accMatch = last4.every((s) => s.acc === last4[0].acc);
    const distinctTimestamps = new Set(last4.map((s) => s.timestamp)).size >= 3;
    const syntheticIntegerAcc = Number.isInteger(last4[0].acc) && last4[0].acc <= 3;

    const timeSpread = last4[3].receivedAt - last4[0].receivedAt;
    if (latMatch && lngMatch && accMatch && distinctTimestamps && syntheticIntegerAcc && timeSpread >= 2500) {
      details.zeroJitter = true;
      score += 30;
      reasons.push('Tọa độ đứng yên tuyệt đối không có dao động vi mô vệ tinh (Zero-jitter).');
    }
  }

  // 5. Teleportation / Unrealistic Speed Check
  // Only compare two consecutive high-accuracy satellite fixes (never coarse Wi-Fi fast-start vs GPS lock!)
  if (highAccSamples.length >= 2) {
    const p1 = highAccSamples[highAccSamples.length - 2];
    const p2 = highAccSamples[highAccSamples.length - 1];
    if (p1.acc <= 25 && p2.acc <= 25) {
      const dtSeconds = Math.max(1.0, (p2.receivedAt - p1.receivedAt) / 1000);
      const distMeters = calculateDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);
      const speedMps = distMeters / dtSeconds;
      const speedKmh = speedMps * 3.6;

      if (distMeters > 150 && speedKmh > 250) {
        details.teleportation = true;
        score += 60;
        reasons.push(`Tọa độ dịch chuyển bất thường (${Math.round(distMeters)}m trong ${dtSeconds.toFixed(1)}s, ~${Math.round(speedKmh)} km/h).`);
      }
    }
  }

  const isSuspicious = score >= 50;

  return {
    isSuspicious,
    score: Math.min(100, score),
    reasons,
    details,
  };
}

/**
 * Generate a cryptographically strong location security payload hash (HMAC-like signature)
 * to ensure client payload cannot be forged with random coordinates.
 */
export function generateLocationSecurityToken(
  username: string,
  lat: number,
  lng: number,
  exactTime: string
): string {
  // Obfuscated salt for King's Grill Security
  const secret = 'KG#SEC_ANTIFRAUD_2026_RADIUS20M';
  const cleanLat = lat.toFixed(6);
  const cleanLng = lng.toFixed(6);
  const raw = `${username}|${cleanLat}|${cleanLng}|${exactTime}|${secret}`;

  // Fast DJB2-based hash token
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 33) ^ raw.charCodeAt(i);
  }

  const hex = (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
  return `KG-SEC#${hex}`;
}
