// ============================================================================
// faceProfileCache.ts — Zero-WASM Face Profile DTO, Vector Quantization & Cache
// Extracted from faceRecognitionV2.ts so boot/Login/Admin bundles never pull
// onnxruntime-web or @mediapipe/tasks-vision when only reading/syncing profiles.
// ============================================================================

export const FACE_EMBEDDING_DIM = 512;
export const FACE_PROFILES_LOCAL_CACHE_KEY = 'kg_face_profiles_cache_v2';
export const FACE_B64_SAFE_PREFIX = 'v2:';

export interface RawFaceProfileDto {
  username: string;
  fullname: string;
  position?: string;
  avatarUrl?: string;
  employmentStatus?: string;
  vectorsB64: string;
  anglesCount?: number;
  modelVersion?: string;
  enrolledAt?: string;
  isLocked?: boolean;
}

export interface HydratedFaceProfile extends RawFaceProfileDto {
  vectors: Float32Array[];
  centroid: Float32Array;
}

export function l2Normalize(vec: Float32Array): Float32Array {
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) {
    normSq += vec[i] * vec[i];
  }
  const out = new Float32Array(vec.length);
  const inv = normSq > 0 ? 1 / Math.sqrt(normSq) : 0;
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] * inv;
  }
  return out;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export function computeCentroid(vectors: Float32Array[], dim = FACE_EMBEDDING_DIM): Float32Array {
  const sum = new Float32Array(dim);
  if (!vectors.length) return sum;
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      sum[i] += v[i];
    }
  }
  return l2Normalize(sum);
}

interface NodeBufferLike {
  from(
    arrayBuffer: ArrayBufferLike,
    byteOffset?: number,
    length?: number
  ): { toString(encoding: 'base64'): string };
  from(input: string, encoding: 'base64'): Uint8Array;
}

function getNodeBuffer(): NodeBufferLike | undefined {
  return (globalThis as { Buffer?: NodeBufferLike }).Buffer;
}

function uint8ToBase64UrlSafe(bytes: Uint8Array): string {
  let b64 = '';
  const nodeBuffer = getNodeBuffer();
  if (nodeBuffer) {
    b64 = nodeBuffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  } else {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    b64 = btoa(bin);
  }
  return FACE_B64_SAFE_PREFIX + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64ToUint8(b64: string): Uint8Array {
  const raw = String(b64 || '').trim().replace(/^'+/, '').trim();
  if (!raw || raw.startsWith('#')) return new Uint8Array(0);
  const stripped = raw.replace(/^v2:/i, '').trim();
  if (!stripped || !/^[A-Za-z0-9+/=_-]+$/.test(stripped)) return new Uint8Array(0);
  const clean = stripped.replace(/-/g, '+').replace(/_/g, '/');
  const padded = clean.padEnd(Math.ceil(clean.length / 4) * 4, '=');
  try {
    const nodeBuffer = getNodeBuffer();
    if (nodeBuffer) {
      const buf = nodeBuffer.from(padded, 'base64');
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

export function quantizeVectorsToInt8B64(vectors: Float32Array[], dim = FACE_EMBEDDING_DIM): string {
  const total = new Uint8Array(vectors.length * dim);
  for (let k = 0; k < vectors.length; k++) {
    const v = l2Normalize(vectors[k]);
    let maxAbs = 0;
    for (let i = 0; i < dim; i++) {
      const abs = Math.abs(v[i]);
      if (abs > maxAbs) maxAbs = abs;
    }
    const scale = maxAbs > 0 ? 127 / maxAbs : 127;
    const offset = k * dim;
    for (let i = 0; i < dim; i++) {
      const q = Math.max(-127, Math.min(127, Math.round(v[i] * scale)));
      total[offset + i] = q < 0 ? q + 256 : q;
    }
  }
  return uint8ToBase64UrlSafe(total);
}

export function decodeInt8B64ToVectors(b64: string, dim = FACE_EMBEDDING_DIM): Float32Array[] {
  const bytes = base64ToUint8(b64);
  if (bytes.length < dim) return [];
  const count = Math.floor(bytes.length / dim);
  const out: Float32Array[] = [];
  for (let k = 0; k < count; k++) {
    const vec = new Float32Array(dim);
    const offset = k * dim;
    for (let i = 0; i < dim; i++) {
      let val = bytes[offset + i];
      if (val > 127) val -= 256;
      vec[i] = val;
    }
    out.push(l2Normalize(vec));
  }
  return out;
}

export function hydrateFaceProfile(dto: RawFaceProfileDto): HydratedFaceProfile {
  const vectors = decodeInt8B64ToVectors(dto.vectorsB64, FACE_EMBEDDING_DIM);
  const centroid = computeCentroid(vectors, FACE_EMBEDDING_DIM);
  return {
    ...dto,
    vectors,
    centroid,
  };
}

let cachedRawProfilesMemory: RawFaceProfileDto[] | null = null;
let cachedHydratedProfilesMemory: HydratedFaceProfile[] | null = null;

function isValidFaceProfileDto(p: unknown): p is RawFaceProfileDto {
  if (!p || typeof p !== 'object') return false;
  const cand = p as RawFaceProfileDto;
  if (typeof cand.username !== 'string' || cand.username.trim().length === 0) return false;
  if (typeof cand.vectorsB64 !== 'string') return false;
  const trimmedVec = cand.vectorsB64.trim();
  if (trimmedVec.length < 64 || trimmedVec.startsWith('#')) return false;
  return decodeInt8B64ToVectors(trimmedVec, FACE_EMBEDDING_DIM).length > 0;
}

function readProfilesFromLocalStorage(): RawFaceProfileDto[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(FACE_PROFILES_LOCAL_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidFaceProfileDto);
  } catch {
    return [];
  }
}

export function getCachedFaceProfiles(): RawFaceProfileDto[] {
  if (cachedRawProfilesMemory !== null) {
    return cachedRawProfilesMemory;
  }
  const fromDisk = readProfilesFromLocalStorage();
  cachedRawProfilesMemory = fromDisk;
  return fromDisk;
}

export function getCachedHydratedFaceProfiles(): HydratedFaceProfile[] {
  if (cachedHydratedProfilesMemory !== null) {
    return cachedHydratedProfilesMemory;
  }
  const rawList = getCachedFaceProfiles();
  cachedHydratedProfilesMemory = rawList
    .filter((p) => Boolean(p?.vectorsB64))
    .map((p) => hydrateFaceProfile(p))
    .filter((h) => h.vectors.length > 0);
  return cachedHydratedProfilesMemory;
}

const cachedProfileListeners = new Set<(profiles: RawFaceProfileDto[]) => void>();

export function subscribeCachedFaceProfiles(
  listener: (profiles: RawFaceProfileDto[]) => void
): () => void {
  cachedProfileListeners.add(listener);
  return () => {
    cachedProfileListeners.delete(listener);
  };
}

export function setCachedFaceProfiles(profiles: ReadonlyArray<RawFaceProfileDto>): void {
  const clean = (Array.isArray(profiles) ? profiles : []).filter(isValidFaceProfileDto);
  cachedRawProfilesMemory = [...clean];
  cachedHydratedProfilesMemory = clean
    .map((p) => hydrateFaceProfile(p))
    .filter((h) => h.vectors.length > 0);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FACE_PROFILES_LOCAL_CACHE_KEY, JSON.stringify(clean));
    }
  } catch {
    // Ignore storage quota errors in private mode
  }
  const snapshot = [...clean];
  for (const listener of cachedProfileListeners) {
    try {
      listener(snapshot);
    } catch {
      // Isolate listener errors
    }
  }
}

export function upsertCachedFaceProfile(dto: RawFaceProfileDto): void {
  if (!isValidFaceProfileDto(dto)) return;
  const target = dto.username.trim().toLowerCase();
  const prev = getCachedFaceProfiles().filter((p) => p.username.trim().toLowerCase() !== target);
  setCachedFaceProfiles([dto, ...prev]);
}

export function removeCachedFaceProfile(username: string): void {
  if (!username) return;
  const target = username.trim().toLowerCase();
  const next = getCachedFaceProfiles().filter((p) => p.username.trim().toLowerCase() !== target);
  setCachedFaceProfiles(next);
}

export async function syncLatestFaceProfilesFromEdge(
  callApiFn: (
    action: string,
    payload?: Record<string, unknown>,
    options?: { background?: boolean; cacheTtlMs?: number; timeoutMs?: number }
  ) => Promise<any>
): Promise<RawFaceProfileDto[]> {
  try {
    const res = await callApiFn(
      'GET_FACE_PROFILES',
      {
        isKiosk: true,
        preloadOnly: true,
        fastEdge: true,
      },
      { background: true, cacheTtlMs: 0, timeoutMs: 8000 }
    ).catch(() => null);

    if (res?.ok && Array.isArray(res.data?.profiles) && res.data.profiles.length > 0) {
      setCachedFaceProfiles(res.data.profiles);
      return getCachedFaceProfiles();
    }

    const retryRes = await callApiFn(
      'GET_FACE_PROFILES',
      {
        isKiosk: true,
        preloadOnly: true,
        fastEdge: false,
      },
      { background: true, cacheTtlMs: 0, timeoutMs: 12000 }
    ).catch(() => null);

    if (retryRes?.ok && Array.isArray(retryRes.data?.profiles)) {
      setCachedFaceProfiles(retryRes.data.profiles);
    }
  } catch {
    // Keep existing cached profiles on transient offline hiccup
  }
  return getCachedFaceProfiles();
}
