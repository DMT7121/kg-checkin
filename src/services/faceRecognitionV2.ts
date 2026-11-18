// ============================================================================
// faceRecognitionV2.ts — Ultra-Fast On-Device Multi-Employee Biometric Engine
// Stack:
//   1. @mediapipe/tasks-vision FaceLandmarker (478 3D landmarks + 4x4 pose matrix)
//   2. 5-point 112x112 closed-form Umeyama similarity alignment
//   3. onnxruntime-web/wasm SIMD:
//      - w600k_mbf.onnx (InsightFace MobileFaceNet ArcFace 512-D embedding)
//      - minifasnet_v2.onnx (Silent-Face-Anti-Spoofing 2.7_80x80 3-class BGR [0..255])
//   4. CacheStorage ('kg-face-models-v2') persistent model cache (<120ms warm boot)
// ============================================================================

import * as ort from 'onnxruntime-web/wasm';
import {
  FACE_EMBEDDING_DIM,
  FACE_PROFILES_LOCAL_CACHE_KEY,
  FACE_B64_SAFE_PREFIX,
  l2Normalize,
  cosineSimilarity,
  computeCentroid,
  quantizeVectorsToInt8B64,
  decodeInt8B64ToVectors,
  hydrateFaceProfile,
  getCachedFaceProfiles,
  getCachedHydratedFaceProfiles,
  subscribeCachedFaceProfiles,
  setCachedFaceProfiles,
  upsertCachedFaceProfile,
  removeCachedFaceProfile,
  syncLatestFaceProfilesFromEdge,
  type RawFaceProfileDto,
  type HydratedFaceProfile,
} from '../utils/faceProfileCache';

export {
  FACE_EMBEDDING_DIM,
  FACE_PROFILES_LOCAL_CACHE_KEY,
  FACE_B64_SAFE_PREFIX,
  l2Normalize,
  cosineSimilarity,
  computeCentroid,
  quantizeVectorsToInt8B64,
  decodeInt8B64ToVectors,
  hydrateFaceProfile,
  getCachedFaceProfiles,
  getCachedHydratedFaceProfiles,
  subscribeCachedFaceProfiles,
  setCachedFaceProfiles,
  upsertCachedFaceProfile,
  removeCachedFaceProfile,
  syncLatestFaceProfilesFromEdge,
};
export type { RawFaceProfileDto, HydratedFaceProfile };

export const FACE_MODEL_VERSION = 'w600k_mbf_int8_v2';
export const FACE_MATCH_MIN_SCORE = 0.34;
export const FACE_MATCH_MIN_MARGIN = 0.06;
export const FACE_DUPLICATE_ENROLL_THRESHOLD = 0.68;
export const FACE_LIVENESS_MIN_SCORE = 0.08;
export const FACE_MIN_BBOX_WIDTH_RATIO = 0.10;
export const FACE_ENROLL_SELF_CONSISTENCY_MIN_COS = 0.30;

// Touchless Auto-Punch Safety Constants (prevents bystanders, distant passersby, multi-face turns & 1-frame false matches)
export const FACE_AUTO_PUNCH_MIN_SCORE = 0.42;
export const FACE_AUTO_PUNCH_MIN_MARGIN = 0.08;
export const FACE_AUTO_PUNCH_MIN_BBOX_WIDTH_RATIO = 0.16;
export const FACE_AUTO_PUNCH_REQUIRED_STREAK = 3;
export const FACE_AUTO_PUNCH_CENTER_X_MIN = 0.20;
export const FACE_AUTO_PUNCH_CENTER_X_MAX = 0.80;
export const FACE_AUTO_PUNCH_CENTER_Y_MIN = 0.16;
export const FACE_AUTO_PUNCH_CENTER_Y_MAX = 0.84;
export const FACE_AUTO_PUNCH_MAX_YAW_DEG = 24;
export const FACE_AUTO_PUNCH_MIN_PITCH_DEG = -28;
export const FACE_AUTO_PUNCH_MAX_PITCH_DEG = 22;
export const FACE_CACHE_STORAGE_NAME = 'kg-face-models-v2';

export type EnrollmentAngleKey = 'CENTER' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';

export const ENROLLMENT_ANGLE_SEQUENCE: ReadonlyArray<{
  key: EnrollmentAngleKey;
  label: string;
  shortHint: string;
}> = [
  { key: 'CENTER', label: 'Nhìn thẳng', shortHint: 'Giữ mặt chính diện trong khung tròn' },
  { key: 'LEFT', label: 'Quay nhẹ sang trái', shortHint: 'Xoay đầu nhẹ sang trái khoảng 15°' },
  { key: 'RIGHT', label: 'Quay nhẹ sang phải', shortHint: 'Xoay đầu nhẹ sang phải khoảng 15°' },
  { key: 'UP', label: 'Ngẩng nhẹ lên', shortHint: 'Ngẩng cằm nhẹ lên khoảng 12°' },
  { key: 'DOWN', label: 'Cúi nhẹ xuống', shortHint: 'Hạ cằm nhẹ xuống khoảng 12°' },
];

export const ARCFACE_DST_5PTS: ReadonlyArray<[number, number]> = [
  [38.2946, 51.6963], // Image-left eye
  [73.5318, 51.5014], // Image-right eye
  [56.0252, 71.7366], // Nose tip
  [41.5493, 92.3655], // Image-left mouth corner
  [70.7299, 92.2041], // Image-right mouth corner
];

export function scaleArcFaceDst5Pts(
  scaleFactor: number,
  basePts: ReadonlyArray<[number, number]> = ARCFACE_DST_5PTS
): Array<[number, number]> {
  return basePts.map(([x, y]) => [56 + (x - 56) * scaleFactor, 56 + (y - 56) * scaleFactor]);
}

export interface FaceMatchResult {
  matched: boolean;
  profile: HydratedFaceProfile | null;
  score: number;
  secondBestScore: number;
  margin: number;
  reason?: 'NO_PROFILES' | 'LOW_SCORE' | 'AMBIGUOUS_MARGIN';
}

export interface LivenessScores {
  liveScore: number;
  printSpoofScore: number;
  replaySpoofScore: number;
  isLive: boolean;
}

export interface FrameQualityMetrics {
  brightness: number; // 0..255
  sharpness: number; // Laplacian-like gradient energy
  faceWidthRatio: number; // 0..1 relative to video frame width
  noseProtrusionZ: number; // 3D landmark depth prominence
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

export interface ScannedFaceFrame {
  hasFace: boolean;
  multipleFaces: boolean;
  faceCount: number;
  bbox: { x: number; y: number; width: number; height: number } | null;
  frameWidth?: number;
  frameHeight?: number;
  keypoints5: Array<[number, number]> | null;
  irisKeypoints5?: Array<[number, number]> | null;
  quality: FrameQualityMetrics | null;
  liveness: LivenessScores | null;
  chwRgb?: Float32Array | null;
  gammaChwRgb?: Float32Array | null;
  wideChwRgb?: Float32Array | null;
  irisChwRgb?: Float32Array | null;
  embedding: Float32Array | null;
  embeddingInt8B64: string | null;
  flippedEmbedding?: Float32Array | null;
  flippedEmbeddingInt8B64?: string | null;
  guidanceMessage: string;
}

// ----------------------------------------------------------------------------
// 1. Vector Math & Int8 Base64 Quantization (re-exported from faceProfileCache.ts)
// ----------------------------------------------------------------------------
export const FACE_MODEL_VERSION_CANON = 'w600k_mbf_int8_v2_canon';

export function fuseCanonicalMirrorEmbedding(
  rawEmb: Float32Array,
  flippedEmb: Float32Array
): Float32Array {
  const len = Math.min(rawEmb.length, flippedEmb.length);
  const sum = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    sum[i] = rawEmb[i] + flippedEmb[i];
  }
  return l2Normalize(sum);
}

// ----------------------------------------------------------------------------
// 2. Closed-Form 2D Similarity Umeyama Alignment (5-Point -> 112x112 ArcFace)
// Returns [a, b, tx, c, d, ty] such that x' = a*x + b*y + tx, y' = c*x + d*y + ty
// ----------------------------------------------------------------------------
export function computeUmeyamaTransform112(
  src5Pts: ReadonlyArray<[number, number]>,
  dst5Pts: ReadonlyArray<[number, number]> = ARCFACE_DST_5PTS
): [number, number, number, number, number, number] {
  const n = Math.min(src5Pts.length, dst5Pts.length);
  if (n < 3) return [1, 0, 0, 0, 1, 0];

  let srcMeanX = 0;
  let srcMeanY = 0;
  let dstMeanX = 0;
  let dstMeanY = 0;
  for (let i = 0; i < n; i++) {
    srcMeanX += src5Pts[i][0];
    srcMeanY += src5Pts[i][1];
    dstMeanX += dst5Pts[i][0];
    dstMeanY += dst5Pts[i][1];
  }
  srcMeanX /= n;
  srcMeanY /= n;
  dstMeanX /= n;
  dstMeanY /= n;

  let srcVarSum = 0;
  let numA = 0;
  let numB = 0;
  for (let i = 0; i < n; i++) {
    const sx = src5Pts[i][0] - srcMeanX;
    const sy = src5Pts[i][1] - srcMeanY;
    const dx = dst5Pts[i][0] - dstMeanX;
    const dy = dst5Pts[i][1] - dstMeanY;

    srcVarSum += sx * sx + sy * sy;
    numA += sx * dx + sy * dy;
    numB += sy * dx - sx * dy;
  }

  if (srcVarSum < 1e-8) {
    return [1, 0, dstMeanX - srcMeanX, 0, 1, dstMeanY - srcMeanY];
  }

  const a = numA / srcVarSum;
  const b = numB / srcVarSum;
  const tx = dstMeanX - (a * srcMeanX + b * srcMeanY);
  const ty = dstMeanY - (-b * srcMeanX + a * srcMeanY);

  return [a, b, tx, -b, a, ty];
}

// ----------------------------------------------------------------------------
// 3. Head Pose Classification & 1:N Employee Matcher + 3-Frame Consensus Voter
// ----------------------------------------------------------------------------
export interface EnrollmentPoseBaseline {
  yawDeg: number;
  pitchDeg: number;
}

export interface EnrollmentPoseEvaluation {
  matched: boolean;
  progress: number; // 0..1 toward target threshold
  deltaYaw: number;
  deltaPitch: number;
  hint: string;
}

function clamp01(val: number): number {
  if (val <= 0) return 0;
  if (val >= 1) return 1;
  return val;
}

export function evaluateEnrollmentPoseTarget(
  targetAngle: EnrollmentAngleKey,
  yawDeg: number,
  pitchDeg: number,
  baseline: EnrollmentPoseBaseline | null = null
): EnrollmentPoseEvaluation {
  if (targetAngle === 'CENTER') {
    const yawOk = Math.abs(yawDeg) <= 14;
    const pitchOk = pitchDeg >= -18 && pitchDeg <= 16;
    if (yawOk && pitchOk) {
      return {
        matched: true,
        progress: 1,
        deltaYaw: yawDeg,
        deltaPitch: pitchDeg,
        hint: 'Giữ mặt chính diện ổn định trong khung tròn...',
      };
    }
    let hint = 'Đưa khuôn mặt nhìn thẳng vào giữa khung tròn';
    if (yawDeg < -14) {
      hint = 'Bạn đang hơi nghiêng trái — hãy xoay mặt nhìn thẳng vào giữa khung tròn';
    } else if (yawDeg > 14) {
      hint = 'Bạn đang hơi nghiêng phải — hãy xoay mặt nhìn thẳng vào giữa khung tròn';
    } else if (pitchDeg < -18) {
      hint = 'Nâng nhẹ điện thoại lên ngang tầm mặt và nhìn thẳng vào camera';
    } else if (pitchDeg > 16) {
      hint = 'Hạ nhẹ cằm xuống và nhìn thẳng vào giữa khung tròn';
    }
    const yawProg = clamp01(1 - (Math.abs(yawDeg) - 14) / 20);
    const pitchProg = pitchDeg < -18 ? clamp01(1 - (-18 - pitchDeg) / 20) : clamp01(1 - (pitchDeg - 16) / 20);
    return {
      matched: false,
      progress: Math.min(yawProg, pitchProg),
      deltaYaw: yawDeg,
      deltaPitch: pitchDeg,
      hint,
    };
  }

  const baseYaw = baseline ? baseline.yawDeg : 0;
  const basePitch = baseline ? baseline.pitchDeg : 0;
  const deltaYaw = yawDeg - baseYaw;
  const deltaPitch = pitchDeg - basePitch;

  if (targetAngle === 'LEFT') {
    const matched = deltaYaw <= -9.5 && deltaYaw >= -42 && Math.abs(deltaPitch) <= 25;
    if (matched) {
      return {
        matched: true,
        progress: 1,
        deltaYaw,
        deltaPitch,
        hint: 'Đúng góc trái! Giữ yên trong tích tắc...',
      };
    }
    let hint = 'Xoay đầu nhẹ sang TRÁI màn hình thêm một chút (~15°)';
    if (deltaYaw > 6) {
      hint = 'Bạn đang quay sang phải — hãy xoay đầu nhẹ sang BÊN TRÁI màn hình';
    } else if (deltaYaw < -42) {
      hint = 'Bạn xoay sang trái hơi sâu — hãy quay mặt lại gần màn hình hơn một chút';
    } else if (Math.abs(deltaPitch) > 25) {
      hint = 'Giữ cằm ngang tầm mắt và xoay đầu nhẹ sang bên trái';
    }
    return {
      matched: false,
      progress: clamp01(-deltaYaw / 9.5),
      deltaYaw,
      deltaPitch,
      hint,
    };
  }

  if (targetAngle === 'RIGHT') {
    const matched = deltaYaw >= 9.5 && deltaYaw <= 42 && Math.abs(deltaPitch) <= 25;
    if (matched) {
      return {
        matched: true,
        progress: 1,
        deltaYaw,
        deltaPitch,
        hint: 'Đúng góc phải! Giữ yên trong tích tắc...',
      };
    }
    let hint = 'Xoay đầu nhẹ sang PHẢI màn hình thêm một chút (~15°)';
    if (deltaYaw < -6) {
      hint = 'Bạn đang quay sang trái — hãy xoay đầu nhẹ sang BÊN PHẢI màn hình';
    } else if (deltaYaw > 42) {
      hint = 'Bạn xoay sang phải hơi sâu — hãy quay mặt lại gần màn hình hơn một chút';
    } else if (Math.abs(deltaPitch) > 25) {
      hint = 'Giữ cằm ngang tầm mắt và xoay đầu nhẹ sang bên phải';
    }
    return {
      matched: false,
      progress: clamp01(deltaYaw / 9.5),
      deltaYaw,
      deltaPitch,
      hint,
    };
  }

  if (targetAngle === 'UP') {
    const matched = deltaPitch >= 8.0 && deltaPitch <= 38 && Math.abs(deltaYaw) <= 25;
    if (matched) {
      return {
        matched: true,
        progress: 1,
        deltaYaw,
        deltaPitch,
        hint: 'Đúng góc ngẩng lên! Giữ yên trong tích tắc...',
      };
    }
    let hint = 'Ngẩng nhẹ cằm LÊN trên thêm một chút (~12°)';
    if (deltaPitch < -6) {
      hint = 'Bạn đang cúi xuống — hãy NGẨNG nhẹ cằm hướng lên trên';
    } else if (deltaPitch > 38) {
      hint = 'Bạn ngẩng hơi cao — hãy hạ nhẹ cằm xuống một chút';
    } else if (Math.abs(deltaYaw) > 25) {
      hint = 'Giữ mặt hướng thẳng và ngẩng nhẹ cằm lên trên';
    }
    return {
      matched: false,
      progress: clamp01(deltaPitch / 8.0),
      deltaYaw,
      deltaPitch,
      hint,
    };
  }

  // DOWN
  const matched = deltaPitch <= -8.0 && deltaPitch >= -38 && Math.abs(deltaYaw) <= 25;
  if (matched) {
    return {
      matched: true,
      progress: 1,
      deltaYaw,
      deltaPitch,
      hint: 'Đúng góc cúi xuống! Giữ yên trong tích tắc...',
    };
  }
  let hint = 'Hạ nhẹ cằm CÚI XUỐNG thêm một chút (~12°)';
  if (deltaPitch > 6) {
    hint = 'Bạn đang ngẩng lên — hãy HẠ nhẹ cằm cúi xuống một chút';
  } else if (deltaPitch < -38) {
    hint = 'Bạn cúi hơi sâu — hãy nâng nhẹ cằm lên một chút';
  } else if (Math.abs(deltaYaw) > 25) {
    hint = 'Giữ mặt hướng thẳng và hạ nhẹ cằm cúi xuống';
  }
  return {
    matched: false,
    progress: clamp01(-deltaPitch / 8.0),
    deltaYaw,
    deltaPitch,
    hint,
  };
}

export function classifyEnrollmentAngle(
  yawDeg: number,
  pitchDeg: number,
  baseline: EnrollmentPoseBaseline | null = null
): EnrollmentAngleKey | null {
  const dy = baseline ? yawDeg - baseline.yawDeg : yawDeg;
  const dp = baseline ? pitchDeg - baseline.pitchDeg : pitchDeg;
  if (Math.abs(dy) <= 10 && Math.abs(dp) <= 9) {
    return 'CENTER';
  }
  if (dy <= -10 && Math.abs(dp) <= 24) {
    return 'LEFT';
  }
  if (dy >= 10 && Math.abs(dp) <= 24) {
    return 'RIGHT';
  }
  if (dp >= 8.5 && Math.abs(dy) <= 24) {
    return 'UP';
  }
  if (dp <= -8.5 && Math.abs(dy) <= 24) {
    return 'DOWN';
  }
  return null;
}

// ----------------------------------------------------------------------------
// 3b. Background Prewarmer (cache & Edge DTO sync live in faceProfileCache.ts)
// ----------------------------------------------------------------------------
let prewarmInFlightPromise: Promise<void> | null = null;

export function prewarmFaceRecognitionSystem(
  callApiFn?: (
    action: string,
    payload?: Record<string, unknown>,
    options?: { background?: boolean; cacheTtlMs?: number; timeoutMs?: number }
  ) => Promise<any>
): Promise<void> {
  if (prewarmInFlightPromise) {
    if (callApiFn) {
      void syncLatestFaceProfilesFromEdge(callApiFn);
    }
    return prewarmInFlightPromise;
  }
  prewarmInFlightPromise = (async () => {
    try {
      // 1. Hydrate local cached profiles immediately into RAM (0ms)
      getCachedHydratedFaceProfiles();
      // 2. Warm ONNX + MediaPipe neural models AND pull latest Edge D1 face vectors in parallel
      const tasks: Promise<unknown>[] = [initFaceBiometricEngine().catch(() => {})];
      if (callApiFn) {
        tasks.push(syncLatestFaceProfilesFromEdge(callApiFn));
      }
      await Promise.allSettled(tasks);
    } finally {
      prewarmInFlightPromise = null;
    }
  })();
  return prewarmInFlightPromise;
}

export function flipChwHorizontal112(chwRgb: Float32Array): Float32Array {
  const side = 112;
  const plane = side * side;
  const out = new Float32Array(chwRgb.length);
  const channels = Math.floor(chwRgb.length / plane);
  for (let c = 0; c < channels; c++) {
    const base = c * plane;
    for (let y = 0; y < side; y++) {
      const rowOffset = base + y * side;
      for (let x = 0; x < side; x++) {
        out[rowOffset + x] = chwRgb[rowOffset + (side - 1 - x)];
      }
    }
  }
  return out;
}

export function computeProfileScore(liveEmbedding: Float32Array, profile: HydratedFaceProfile): number {
  if (!profile.vectors.length) return -1;
  let maxCos = -1;
  let secondBestCos = -1;
  for (const v of profile.vectors) {
    const c = cosineSimilarity(liveEmbedding, v);
    if (c > maxCos) {
      secondBestCos = maxCos;
      maxCos = c;
    } else if (c > secondBestCos) {
      secondBestCos = c;
    }
  }
  const centCos = cosineSimilarity(liveEmbedding, profile.centroid);
  const supportCos = secondBestCos > -1 ? Math.max(secondBestCos, centCos) : centCos;
  return 0.85 * maxCos + 0.15 * supportCos;
}

export interface FaceCandidateVector {
  embedding: Float32Array;
  int8B64?: string;
}

export interface FaceCandidateMatchResult extends FaceMatchResult {
  matchedEmbedding: Float32Array | null;
  matchedEmbeddingInt8B64: string | null;
}

export function matchEmployeeFaceWithCandidates(
  candidates: ReadonlyArray<FaceCandidateVector>,
  profiles: ReadonlyArray<HydratedFaceProfile>,
  minScore = FACE_MATCH_MIN_SCORE,
  minMargin = FACE_MATCH_MIN_MARGIN
): FaceCandidateMatchResult {
  if (!candidates.length) {
    return {
      matched: false,
      profile: null,
      score: 0,
      secondBestScore: 0,
      margin: 0,
      reason: 'LOW_SCORE',
      matchedEmbedding: null,
      matchedEmbeddingInt8B64: null,
    };
  }

  let bestMatched: { res: FaceMatchResult; cand: FaceCandidateVector } | null = null;
  let bestUnmatched: { res: FaceMatchResult; cand: FaceCandidateVector } | null = null;

  for (const cand of candidates) {
    const res = matchEmployeeFace(cand.embedding, profiles, minScore, minMargin);
    if (res.matched) {
      if (!bestMatched || res.score > bestMatched.res.score) {
        bestMatched = { res, cand };
      }
    } else if (!bestUnmatched || res.score > bestUnmatched.res.score) {
      bestUnmatched = { res, cand };
    }
  }

  const chosen = bestMatched ?? bestUnmatched!;
  const chosenB64 = chosen.cand.int8B64 ?? quantizeVectorsToInt8B64([chosen.cand.embedding]);

  return {
    ...chosen.res,
    matchedEmbedding: chosen.cand.embedding,
    matchedEmbeddingInt8B64: chosenB64,
  };
}

export type AutoPunchReadinessReason =
  | 'READY'
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'TOO_FAR'
  | 'OFF_CENTER'
  | 'NOT_FRONTAL'
  | 'SPOOF';

export interface AutoPunchReadinessResult {
  ready: boolean;
  reason: AutoPunchReadinessReason;
  guidanceMessage: string;
}

/**
 * Evaluates whether a scanned video frame is safe for touchless automatic attendance punching.
 * Enforces:
 *   1. Single-person turn separation (`!multipleFaces` & `faceCount === 1`)
 *   2. Close foreground presence (`faceWidthRatio >= 0.16`) so passersby behind never trigger
 *   3. Centered position inside reticle (`centerX in [0.20, 0.80]`, `centerY in [0.16, 0.84]`)
 *   4. Frontal gaze (`|yawDeg| <= 24°`, `pitchDeg in [-28°, +22°]`)
 */
export function evaluateAutoPunchFrameReadiness(
  frame: Partial<ScannedFaceFrame> | null | undefined,
  options?: {
    minWidthRatio?: number;
    maxAbsYawDeg?: number;
    minPitchDeg?: number;
    maxPitchDeg?: number;
  }
): AutoPunchReadinessResult {
  if (!frame || !frame.hasFace) {
    return {
      ready: false,
      reason: 'NO_FACE',
      guidanceMessage: frame?.guidanceMessage || 'Đưa khuôn mặt vào khung quét',
    };
  }

  if (frame.multipleFaces || (typeof frame.faceCount === 'number' && frame.faceCount > 1)) {
    return {
      ready: false,
      reason: 'MULTIPLE_FACES',
      guidanceMessage: 'Chỉ 1 nhân viên đứng trong khung quét mỗi lượt',
    };
  }

  const minWidthRatio = options?.minWidthRatio ?? FACE_AUTO_PUNCH_MIN_BBOX_WIDTH_RATIO;
  if (frame.quality && frame.quality.faceWidthRatio < minWidthRatio) {
    return {
      ready: false,
      reason: 'TOO_FAR',
      guidanceMessage: 'Vui lòng đứng gần chính diện camera hơn để chấm công',
    };
  }

  if (frame.bbox) {
    const isNormalizedCoords = frame.bbox.width <= 1 && frame.bbox.x <= 1 && frame.bbox.y <= 1;
    const fw =
      frame.frameWidth && frame.frameWidth > 1
        ? frame.frameWidth
        : isNormalizedCoords
        ? 1
        : 640;
    const fh =
      frame.frameHeight && frame.frameHeight > 1
        ? frame.frameHeight
        : isNormalizedCoords
        ? 1
        : 480;
    const cx = (frame.bbox.x + frame.bbox.width * 0.5) / fw;
    const cy = (frame.bbox.y + frame.bbox.height * 0.5) / fh;
    if (
      cx < FACE_AUTO_PUNCH_CENTER_X_MIN ||
      cx > FACE_AUTO_PUNCH_CENTER_X_MAX ||
      cy < FACE_AUTO_PUNCH_CENTER_Y_MIN ||
      cy > FACE_AUTO_PUNCH_CENTER_Y_MAX
    ) {
      return {
        ready: false,
        reason: 'OFF_CENTER',
        guidanceMessage: 'Đặt khuôn mặt vào chính giữa khung quét',
      };
    }
  }

  if (frame.quality) {
    const maxYaw = options?.maxAbsYawDeg ?? FACE_AUTO_PUNCH_MAX_YAW_DEG;
    const minPitch = options?.minPitchDeg ?? FACE_AUTO_PUNCH_MIN_PITCH_DEG;
    const maxPitch = options?.maxPitchDeg ?? FACE_AUTO_PUNCH_MAX_PITCH_DEG;
    if (
      Math.abs(frame.quality.yawDeg) > maxYaw ||
      frame.quality.pitchDeg < minPitch ||
      frame.quality.pitchDeg > maxPitch
    ) {
      return {
        ready: false,
        reason: 'NOT_FRONTAL',
        guidanceMessage: 'Nhìn thẳng chính diện vào camera để ghi công',
      };
    }
  }

  if (frame.liveness && frame.liveness.isLive === false) {
    return {
      ready: false,
      reason: 'SPOOF',
      guidanceMessage:
        frame.guidanceMessage || 'Không nhận diện qua màn hình/ảnh tĩnh — vui lòng nhìn trực tiếp',
    };
  }

  return {
    ready: true,
    reason: 'READY',
    guidanceMessage: frame.guidanceMessage || 'Đang xác thực khuôn mặt...',
  };
}

export function matchEmployeeFace(
  liveEmbedding: Float32Array,
  profiles: ReadonlyArray<HydratedFaceProfile>,
  minScore = FACE_MATCH_MIN_SCORE,
  minMargin = FACE_MATCH_MIN_MARGIN
): FaceMatchResult {
  const activeProfiles = profiles.filter((p) => {
    const st = String(p.employmentStatus || 'active').toLowerCase();
    return st !== 'resigned' && st !== 'suspended' && p.vectors.length > 0;
  });

  if (activeProfiles.length === 0) {
    return {
      matched: false,
      profile: null,
      score: 0,
      secondBestScore: 0,
      margin: 0,
      reason: 'NO_PROFILES',
    };
  }

  let bestProfile: HydratedFaceProfile | null = null;
  let bestScore = -1;
  let secondBestScore = -1;

  for (const p of activeProfiles) {
    const s = computeProfileScore(liveEmbedding, p);
    if (s > bestScore) {
      secondBestScore = bestScore;
      bestScore = s;
      bestProfile = p;
    } else if (s > secondBestScore) {
      secondBestScore = s;
    }
  }

  const effectiveSecond = secondBestScore < 0 ? 0 : secondBestScore;
  const margin = activeProfiles.length === 1 ? bestScore : bestScore - effectiveSecond;

  if (bestScore < minScore) {
    return {
      matched: false,
      profile: null,
      score: bestScore,
      secondBestScore: effectiveSecond,
      margin,
      reason: 'LOW_SCORE',
    };
  }

  if (activeProfiles.length > 1 && margin < minMargin) {
    return {
      matched: false,
      profile: null,
      score: bestScore,
      secondBestScore: effectiveSecond,
      margin,
      reason: 'AMBIGUOUS_MARGIN',
    };
  }

  return {
    matched: true,
    profile: bestProfile,
    score: bestScore,
    secondBestScore: effectiveSecond,
    margin,
  };
}

export class TemporalMatchVoter {
  private readonly requiredStreak: number;
  private readonly maxGraceMisses: number;
  private currentUsername: string | null = null;
  private streak = 0;
  private missCount = 0;

  constructor(requiredStreak = 3, maxGraceMisses = 0) {
    this.requiredStreak = Math.max(1, requiredStreak);
    this.maxGraceMisses = Math.max(0, maxGraceMisses);
  }

  reset(): void {
    this.currentUsername = null;
    this.streak = 0;
    this.missCount = 0;
  }

  getStreak(): number {
    return this.streak;
  }

  pushFrame(
    result: Pick<FaceMatchResult, 'matched' | 'profile'> & Partial<FaceMatchResult> & { noFace?: boolean }
  ): FaceMatchResult | null {
    if (!result.matched || !result.profile?.username) {
      if (
        this.currentUsername !== null &&
        this.streak > 0 &&
        this.missCount < this.maxGraceMisses &&
        !result.noFace
      ) {
        this.missCount += 1;
        return null;
      }
      this.reset();
      return null;
    }
    const uname = result.profile.username.toLowerCase();
    this.missCount = 0;
    if (this.currentUsername === uname) {
      this.streak += 1;
    } else {
      this.currentUsername = uname;
      this.streak = 1;
    }

    if (this.streak >= this.requiredStreak) {
      this.reset();
      return {
        matched: true,
        profile: result.profile,
        score: result.score ?? 1,
        secondBestScore: result.secondBestScore ?? 0,
        margin: result.margin ?? 1,
      };
    }
    return null;
  }
}

// ----------------------------------------------------------------------------
// 4. Persistent CacheStorage Model Loader & ONNX + MediaPipe Sessions
// ----------------------------------------------------------------------------
let arcFaceSession: ort.InferenceSession | null = null;
let miniFasSession: ort.InferenceSession | null = null;
let faceLandmarkerInstance: any = null;
let engineInitPromise: Promise<void> | null = null;
const engineProgressListeners = new Set<(stageText: string, percent: number) => void>();
let lastEngineProgress = {
  stageText: 'Đang khởi tạo bộ nhận diện 3D Landmark...',
  percent: 15,
};

function emitEngineProgress(stageText: string, percent: number): void {
  lastEngineProgress = { stageText, percent };
  for (const listener of engineProgressListeners) {
    try {
      listener(stageText, percent);
    } catch {
      // Ignore subscriber errors
    }
  }
}

let frameSnapCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
let canvasGpuDetectProven = false;
let alignCanvas112: HTMLCanvasElement | OffscreenCanvas | null = null;
let cropCanvas80: HTMLCanvasElement | OffscreenCanvas | null = null;

function createWorkCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

async function fetchWithTimeoutRetry(url: string, init?: RequestInit, timeoutMs = 25000): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} khi tải mô hình ${url}`);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Không thể tải mô hình ${url}`);
}

async function fetchModelBytesCached(url: string): Promise<Uint8Array> {
  if (typeof caches !== 'undefined' && typeof window !== 'undefined') {
    try {
      const cache = await caches.open(FACE_CACHE_STORAGE_NAME);
      const cached = await cache.match(url);
      if (cached && cached.ok) {
        const bytes = new Uint8Array(await cached.arrayBuffer());
        if (bytes.byteLength > 1024) return bytes;
      }
      const fresh = await fetchWithTimeoutRetry(url, { cache: 'force-cache' });
      await cache.put(url, fresh.clone()).catch(() => {});
      return new Uint8Array(await fresh.arrayBuffer());
    } catch {
      // Fallback to direct fetch if CacheStorage unavailable (e.g. private WebView)
    }
  }
  const res = await fetchWithTimeoutRetry(url);
  return new Uint8Array(await res.arrayBuffer());
}

export async function initOnnxBiometricSessionsFromBytes(
  arcFaceBytes: Uint8Array,
  miniFasBytes: Uint8Array,
  wasmPathsPrefix = '/models/face-v2/wasm/'
): Promise<void> {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = wasmPathsPrefix;

  // Sequential creation keeps peak mobile WASM heap usage low on brand-new phones
  const arcSess = await ort.InferenceSession.create(arcFaceBytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  const fasSess = await ort.InferenceSession.create(miniFasBytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });

  arcFaceSession = arcSess;
  miniFasSession = fasSess;
}

export async function initFaceBiometricEngine(
  onProgress?: (stageText: string, percent: number) => void
): Promise<void> {
  if (arcFaceSession && miniFasSession && faceLandmarkerInstance) {
    onProgress?.('Hệ thống sinh trắc học đã sẵn sàng', 100);
    return;
  }

  if (onProgress) {
    engineProgressListeners.add(onProgress);
  }

  if (engineInitPromise) {
    if (onProgress) {
      try {
        onProgress(lastEngineProgress.stageText, lastEngineProgress.percent);
      } catch {
        // Ignore
      }
    }
    try {
      return await engineInitPromise;
    } finally {
      if (onProgress) engineProgressListeners.delete(onProgress);
    }
  }

  engineInitPromise = (async () => {
    try {
      emitEngineProgress('Đang khởi tạo bộ nhận diện 3D Landmark...', 15);
      const [mpVision, landmarkerBytes] = await Promise.all([
        import('@mediapipe/tasks-vision'),
        fetchModelBytesCached('/models/face-v2/face_landmarker.task'),
      ]);

      emitEngineProgress('Đang kích hoạt nhân đồ họa 3D...', 38);
      const fileset = await mpVision.FilesetResolver.forVisionTasks('/models/face-v2/wasm');
      try {
        faceLandmarkerInstance = await mpVision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetBuffer: landmarkerBytes.slice(0),
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 2,
          outputFacialTransformationMatrixes: true,
          outputFaceBlendshapes: false,
        });
      } catch {
        // Fallback to CPU delegate if WebGL2 delegate unavailable on older Android/iOS WebView
        faceLandmarkerInstance = await mpVision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetBuffer: landmarkerBytes.slice(0),
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 2,
          outputFacialTransformationMatrixes: true,
          outputFaceBlendshapes: false,
        });
      }

      emitEngineProgress('Đang nạp mạng nơ-ron ArcFace 512-D & Anti-Spoof...', 62);
      const [arcBytes, fasBytes] = await Promise.all([
        fetchModelBytesCached('/models/face-v2/w600k_mbf.onnx'),
        fetchModelBytesCached('/models/face-v2/minifasnet_v2.onnx'),
      ]);

      emitEngineProgress('Đang biên dịch nhân WASM SIMD...', 86);
      await initOnnxBiometricSessionsFromBytes(arcBytes, fasBytes, '/models/face-v2/wasm/');
      emitEngineProgress('Sẵn sàng quét khuôn mặt siêu tốc', 100);
    } catch (err) {
      engineInitPromise = null;
      throw err;
    }
  })();

  try {
    return await engineInitPromise;
  } finally {
    if (onProgress) engineProgressListeners.delete(onProgress);
  }
}

export async function runArcFaceFromChwTensor(chwRgbNormalized: Float32Array): Promise<Float32Array> {
  if (!arcFaceSession) {
    throw new Error('ArcFace session chưa được khởi tạo.');
  }
  const inputName = arcFaceSession.inputNames[0];
  const outputName = arcFaceSession.outputNames[0];
  const tensor = new ort.Tensor('float32', chwRgbNormalized, [1, 3, 112, 112]);
  const results = await arcFaceSession.run({ [inputName]: tensor });
  const raw = results[outputName].data as Float32Array;
  return l2Normalize(raw);
}

export async function computeFlippedArcFaceCandidate(
  chwRgbNormalized: Float32Array
): Promise<{ embedding: Float32Array; int8B64: string }> {
  const flippedChw = flipChwHorizontal112(chwRgbNormalized);
  const embedding = await runArcFaceFromChwTensor(flippedChw);
  const int8B64 = quantizeVectorsToInt8B64([embedding]);
  return { embedding, int8B64 };
}

export async function runMiniFasNetFromChwTensor(chwBgr0To255: Float32Array): Promise<LivenessScores> {
  if (!miniFasSession) {
    throw new Error('MiniFASNetV2 session chưa được khởi tạo.');
  }
  const inputName = miniFasSession.inputNames[0];
  const outputName = miniFasSession.outputNames[0];
  const tensor = new ort.Tensor('float32', chwBgr0To255, [1, 3, 80, 80]);
  const results = await miniFasSession.run({ [inputName]: tensor });
  const logits = results[outputName].data as Float32Array;

  // 3-class softmax from upstream Silent-Face-Anti-Spoofing 2.7_80x80_MiniFASNetV2:
  // index 0 = print/paper spoof, index 1 = REAL LIVE FACE, index 2 = digital replay spoof
  const maxLogit = Math.max(logits[0], logits[1], logits[2]);
  const e0 = Math.exp(logits[0] - maxLogit);
  const e1 = Math.exp(logits[1] - maxLogit);
  const e2 = Math.exp(logits[2] - maxLogit);
  const sum = e0 + e1 + e2;

  const printSpoofScore = e0 / sum;
  const liveScore = e1 / sum;
  const replaySpoofScore = e2 / sum;

  return {
    liveScore,
    printSpoofScore,
    replaySpoofScore,
    isLive: liveScore >= FACE_LIVENESS_MIN_SCORE,
  };
}

export function evaluateHybridLiveness(
  fasScores: { liveScore: number; printSpoofScore: number; replaySpoofScore: number },
  noseProtrusionZ: number,
  faceWidthRatio = 0.28
): LivenessScores {
  // MiniFASNetV2 (2.7_80x80) frequently reports high replaySpoofScore on wide-angle smartphone ISPs
  // and laptop webcams under warm indoor LEDs. MediaPipe Z depth scales linearly with faceWidthRatio,
  // so normalizing relativeNoseDepth prevents false spoof rejections at 45-65cm while blocking flat 2D spoofs.
  const passesCnn = fasScores.liveScore >= FACE_LIVENESS_MIN_SCORE && fasScores.printSpoofScore < 0.95;
  const safeWidthRatio = Math.max(
    0.1,
    Math.min(0.75, Number.isFinite(faceWidthRatio) && faceWidthRatio > 0 ? faceWidthRatio : 0.28)
  );
  const relativeNoseDepth = noseProtrusionZ / safeWidthRatio;
  const passes3dDepth =
    (noseProtrusionZ > 0.0018 || relativeNoseDepth > 0.012) &&
    noseProtrusionZ > 0.001 &&
    fasScores.printSpoofScore < 0.96;
  return {
    liveScore: fasScores.liveScore,
    printSpoofScore: fasScores.printSpoofScore,
    replaySpoofScore: fasScores.replaySpoofScore,
    isLive: passesCnn || passes3dDepth,
  };
}

// ----------------------------------------------------------------------------
// 5. Real-Time Video Frame Analysis Pipeline (Landmarks -> Quality -> Liveness -> 512-D)
// ----------------------------------------------------------------------------
export function extractLandmarksAndPose(
  landmarks: Array<{ x: number; y: number; z: number }>,
  matrixData: Float32Array | number[] | undefined,
  frameW: number,
  frameH: number,
  mirrorYawForFrontCamera = true
): {
  bbox: { x: number; y: number; width: number; height: number };
  keypoints5: Array<[number, number]>;
  irisKeypoints5: Array<[number, number]>;
  noseProtrusionZ: number;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < landmarks.length; i++) {
    const px = landmarks[i].x * frameW;
    const py = landmarks[i].y * frameH;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }

  const avgPt = (indices: number[]): [number, number] => {
    let sx = 0;
    let sy = 0;
    for (const idx of indices) {
      sx += landmarks[idx].x * frameW;
      sy += landmarks[idx].y * frameH;
    }
    return [sx / indices.length, sy / indices.length];
  };

  // Blend 70% anatomical eye corners/lids + 30% iris center when 478-landmark mesh is present
  // so looking down at UI instructions vs up at camera lens never shifts 112x112 ArcFace alignment!
  const cornerA = avgPt([33, 133, 159, 145]);
  const cornerB = avgPt([362, 263, 386, 374]);
  const hasAnatomicalCornersA =
    landmarks.length > 159 &&
    Math.hypot(landmarks[133].x - landmarks[33].x, landmarks[133].y - landmarks[33].y) > 0.004;
  const hasAnatomicalCornersB =
    landmarks.length > 386 &&
    Math.hypot(landmarks[263].x - landmarks[362].x, landmarks[263].y - landmarks[362].y) > 0.004;

  const eyeA: [number, number] =
    landmarks.length >= 478
      ? hasAnatomicalCornersA
        ? [
            0.7 * cornerA[0] + 0.3 * (landmarks[468].x * frameW),
            0.7 * cornerA[1] + 0.3 * (landmarks[468].y * frameH),
          ]
        : [landmarks[468].x * frameW, landmarks[468].y * frameH]
      : cornerA;
  const eyeB: [number, number] =
    landmarks.length >= 478
      ? hasAnatomicalCornersB
        ? [
            0.7 * cornerB[0] + 0.3 * (landmarks[473].x * frameW),
            0.7 * cornerB[1] + 0.3 * (landmarks[473].y * frameH),
          ]
        : [landmarks[473].x * frameW, landmarks[473].y * frameH]
      : cornerB;

  const [imgLeftEye, imgRightEye] = eyeA[0] <= eyeB[0] ? [eyeA, eyeB] : [eyeB, eyeA];
  const rawIrisA: [number, number] =
    landmarks.length >= 478 ? [landmarks[468].x * frameW, landmarks[468].y * frameH] : eyeA;
  const rawIrisB: [number, number] =
    landmarks.length >= 478 ? [landmarks[473].x * frameW, landmarks[473].y * frameH] : eyeB;
  const [irisLeftEye, irisRightEye] =
    rawIrisA[0] <= rawIrisB[0] ? [rawIrisA, rawIrisB] : [rawIrisB, rawIrisA];
  const noseTip: [number, number] = [landmarks[1].x * frameW, landmarks[1].y * frameH];

  const mouthA: [number, number] = [landmarks[61].x * frameW, landmarks[61].y * frameH];
  const mouthB: [number, number] = [landmarks[291].x * frameW, landmarks[291].y * frameH];
  const [imgLeftMouth, imgRightMouth] = mouthA[0] <= mouthB[0] ? [mouthA, mouthB] : [mouthB, mouthA];

  // 3D depth protrusion: real 3D nose tip has more negative Z than left/right cheek tragus (234, 454)
  const cheekAvgZ = ((landmarks[234]?.z ?? 0) + (landmarks[454]?.z ?? 0)) * 0.5;
  const noseProtrusionZ = cheekAvgZ - (landmarks[1]?.z ?? 0);

  // Geometric 2D/3D landmark pose estimate (consistent sign with OpenGL forward normal)
  const cheekL = landmarks[234] ? landmarks[234].x * frameW : imgLeftEye[0];
  const cheekR = landmarks[454] ? landmarks[454].x * frameW : imgRightEye[0];
  const dLeftCheek = Math.max(1, noseTip[0] - Math.min(cheekL, cheekR));
  const dRightCheek = Math.max(1, Math.max(cheekL, cheekR) - noseTip[0]);
  const geomYawDeg = ((dLeftCheek - dRightCheek) / (dLeftCheek + dRightCheek)) * 58;

  const midEyeY = (imgLeftEye[1] + imgRightEye[1]) * 0.5;
  const chinY = landmarks[152]
    ? landmarks[152].y * frameH
    : (imgLeftMouth[1] + imgRightMouth[1]) * 0.5 + Math.max(8, (imgRightEye[0] - imgLeftEye[0]) * 0.45);
  const eyeToChin = Math.max(1, chinY - midEyeY);
  const noseRatio = (noseTip[1] - midEyeY) / eyeToChin;
  const geomPitchDeg = (0.32 - noseRatio) * 140;

  let yawDeg = geomYawDeg;
  let pitchDeg = geomPitchDeg;
  let rollDeg =
    (Math.atan2(imgRightEye[1] - imgLeftEye[1], imgRightEye[0] - imgLeftEye[0]) * 180) / Math.PI;

  if (matrixData && matrixData.length >= 16) {
    // Column-major right-handed OpenGL 4x4 matrix from MediaPipe FaceGeometry:
    // +X = image right, +Y = image UP, +Z = toward camera.
    // Column 2 (indices 8, 9, 10) is the face's unit forward normal [fx, fy, fz]:
    // - fy > 0 => chin tilted UP (+pitchDeg); fy < 0 => chin tilted DOWN (-pitchDeg)
    // - fx > 0 => nose turned toward raw image right (user's physical LEFT)
    const fx = matrixData[8];
    const fy = matrixData[9];
    const fz = matrixData[10];
    const matYawDeg = (Math.atan2(fx, Math.max(1e-4, Math.abs(fz))) * 180) / Math.PI;
    const matPitchDeg = (Math.atan2(fy, Math.max(1e-4, Math.hypot(fx, fz))) * 180) / Math.PI;
    yawDeg = 0.78 * matYawDeg + 0.22 * geomYawDeg;
    pitchDeg = 0.78 * matPitchDeg + 0.22 * geomPitchDeg;
    rollDeg = (Math.atan2(matrixData[1], matrixData[0]) * 180) / Math.PI;
  }

  if (mirrorYawForFrontCamera) {
    yawDeg = -yawDeg;
  }

  return {
    bbox: {
      x: Math.max(0, minX),
      y: Math.max(0, minY),
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    },
    keypoints5: [imgLeftEye, imgRightEye, noseTip, imgLeftMouth, imgRightMouth],
    irisKeypoints5: [irisLeftEye, irisRightEye, noseTip, imgLeftMouth, imgRightMouth],
    noseProtrusionZ,
    yawDeg,
    pitchDeg,
    rollDeg,
  };
}

function buildAligned112TensorAndQuality(
  sourceCanvas: CanvasImageSource,
  sourceW: number,
  sourceH: number,
  keypoints5: Array<[number, number]>,
  dst5Pts: ReadonlyArray<[number, number]> = ARCFACE_DST_5PTS,
  includeGammaCandidate = false
): { chwRgb: Float32Array; gammaChwRgb: Float32Array | null; brightness: number; sharpness: number } {
  if (!alignCanvas112) alignCanvas112 = createWorkCanvas(112, 112);
  const ctx = alignCanvas112.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  const M = computeUmeyamaTransform112(keypoints5, dst5Pts);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 112, 112);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(M[0], M[3], M[1], M[4], M[2], M[5]);
  ctx.drawImage(sourceCanvas, 0, 0, sourceW, sourceH);
  ctx.restore();

  const rgba = ctx.getImageData(0, 0, 112, 112).data;
  const planeSize = 112 * 112;
  const chw = new Float32Array(3 * planeSize);
  const lum = new Float32Array(planeSize);

  let sumLum = 0;
  for (let i = 0; i < planeSize; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = y;
    sumLum += y;
    // Primary tensor stays 100% pure InsightFace linear (c - 127.5) / 127.5 for zero regression
    chw[i] = (r - 127.5) / 127.5;
    chw[planeSize + i] = (g - 127.5) / 127.5;
    chw[2 * planeSize + i] = (b - 127.5) / 127.5;
  }
  const rawBrightness = sumLum / planeSize;

  let gammaChwRgb: Float32Array | null = null;
  if (includeGammaCandidate && (rawBrightness < 88 || rawBrightness > 180)) {
    const gamma = Math.max(
      0.72,
      Math.min(1.38, Math.log(128 / 255) / Math.log(Math.max(32, Math.min(228, rawBrightness)) / 255))
    );
    const gammaLut = new Float32Array(256);
    for (let c = 0; c < 256; c++) {
      gammaLut[c] = (255 * Math.pow(c / 255, gamma) - 127.5) / 127.5;
    }
    gammaChwRgb = new Float32Array(3 * planeSize);
    for (let i = 0; i < planeSize; i++) {
      gammaChwRgb[i] = gammaLut[rgba[i * 4]];
      gammaChwRgb[planeSize + i] = gammaLut[rgba[i * 4 + 1]];
      gammaChwRgb[2 * planeSize + i] = gammaLut[rgba[i * 4 + 2]];
    }
  }

  // Compute fast center-region gradient energy for blur rejection
  let gradSum = 0;
  let gradCount = 0;
  for (let y = 16; y < 96; y += 2) {
    for (let x = 16; x < 96; x += 2) {
      const idx = y * 112 + x;
      const gx = lum[idx + 1] - lum[idx - 1];
      const gy = lum[idx + 112] - lum[idx - 112];
      gradSum += Math.abs(gx) + Math.abs(gy);
      gradCount++;
    }
  }

  return {
    chwRgb: chw,
    gammaChwRgb,
    brightness: rawBrightness,
    sharpness: gradCount > 0 ? gradSum / gradCount : 0,
  };
}

function buildAntiSpoof80BgrTensor(
  sourceCanvas: CanvasImageSource,
  bbox: { x: number; y: number; width: number; height: number },
  frameW: number,
  frameH: number
): Float32Array {
  if (!cropCanvas80) cropCanvas80 = createWorkCanvas(80, 80);
  const ctx = cropCanvas80.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;

  // Upstream 2.7_80x80_MiniFASNetV2 square 2.7x context crop clamped inside frame bounds
  const scale = Math.min(2.7, (frameW - 1) / bbox.width, (frameH - 1) / bbox.height);
  const side = Math.max(16, Math.max(bbox.width, bbox.height) * scale);
  const cx = bbox.x + bbox.width * 0.5;
  const cy = bbox.y + bbox.height * 0.5;
  const sx = Math.max(0, Math.min(frameW - side, cx - side * 0.5));
  const sy = Math.max(0, Math.min(frameH - side, cy - side * 0.5));
  const sw = Math.min(side, frameW - sx);
  const sh = Math.min(side, frameH - sy);

  ctx.clearRect(0, 0, 80, 80);
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, 80, 80);

  const rgba = ctx.getImageData(0, 0, 80, 80).data;
  const planeSize = 80 * 80;
  // Raw [0..255] float32 BGR NCHW per Silent-Face-Anti-Spoofing functional.py to_tensor()
  const bgrChw = new Float32Array(3 * planeSize);
  for (let i = 0; i < planeSize; i++) {
    bgrChw[i] = rgba[i * 4 + 2]; // B
    bgrChw[planeSize + i] = rgba[i * 4 + 1]; // G
    bgrChw[2 * planeSize + i] = rgba[i * 4]; // R
  }
  return bgrChw;
}

const WIDE_ARCFACE_DST_5PTS = scaleArcFaceDst5Pts(0.92);
let lastVideoTimestampMs = 0;

export async function analyzeVideoFrameBiometrics(
  video: HTMLVideoElement,
  options?: {
    skipLiveness?: boolean;
    poseMode?: 'FRONTAL' | 'ENROLL_ANGLED';
    minWidthRatio?: number;
    mirrorYaw?: boolean;
    includeFlippedEmbedding?: boolean;
  }
): Promise<ScannedFaceFrame> {
  if (!faceLandmarkerInstance || !arcFaceSession || !miniFasSession) {
    throw new Error('Bộ nhận diện khuôn mặt chưa sẵn sàng.');
  }

  const rawW = video.videoWidth || 0;
  const rawH = video.videoHeight || 0;
  if (video.readyState < 2 || rawW < 64 || rawH < 64) {
    return {
      hasFace: false,
      multipleFaces: false,
      faceCount: 0,
      bbox: null,
      keypoints5: null,
      quality: null,
      liveness: null,
      chwRgb: null,
      gammaChwRgb: null,
      wideChwRgb: null,
      embedding: null,
      embeddingInt8B64: null,
      flippedEmbedding: null,
      flippedEmbeddingInt8B64: null,
      guidanceMessage: 'Đang khởi động luồng camera...',
    };
  }

  // Snapshot <video> ONCE onto an upright 2D RGBA canvas (<=640px max axis) so MediaPipe landmarks,
  // 112x112 Umeyama ArcFace warp, and 80x80 Anti-Spoof crop ALWAYS share the EXACT SAME pixel buffer
  // with zero WebGL texture / EXIF rotation / temporal frame desync across iOS Safari, Android & Desktop!
  const maxSide = 640;
  const downScale = Math.min(1, maxSide / Math.max(rawW, rawH));
  const frameW = Math.max(64, Math.round(rawW * downScale));
  const frameH = Math.max(64, Math.round(rawH * downScale));
  if (!frameSnapCanvas) {
    frameSnapCanvas = createWorkCanvas(frameW, frameH);
  } else if (frameSnapCanvas.width !== frameW || frameSnapCanvas.height !== frameH) {
    frameSnapCanvas.width = frameW;
    frameSnapCanvas.height = frameH;
  }
  const snapCtx = frameSnapCanvas.getContext('2d') as CanvasRenderingContext2D;
  snapCtx.setTransform(1, 0, 0, 1, 0, 0);
  snapCtx.drawImage(video, 0, 0, frameW, frameH);

  let ts = Math.floor(performance.now());
  if (ts <= lastVideoTimestampMs) ts = lastVideoTimestampMs + 1;
  lastVideoTimestampMs = ts;

  // Keep frameSnapCanvas GPU-backed for zero-copy WebGL2 detectForVideo(frameSnapCanvas);
  // if a mobile GPU returns blank canvas textures before first lock, fall back to CPU RGBA ImageData
  // read from frameSnapCanvas itself (NEVER raw <video>, guaranteeing 100% pixel-buffer alignment!).
  let mpRes: any = null;
  try {
    mpRes = faceLandmarkerInstance.detectForVideo(frameSnapCanvas, ts);
    if (mpRes?.faceLandmarks?.length > 0) {
      canvasGpuDetectProven = true;
    }
  } catch {
    mpRes = null;
  }

  if ((!mpRes?.faceLandmarks || mpRes.faceLandmarks.length === 0) && !canvasGpuDetectProven) {
    let tsImg = ts + 1;
    if (tsImg <= lastVideoTimestampMs) tsImg = lastVideoTimestampMs + 1;
    lastVideoTimestampMs = tsImg;
    try {
      const snapImageData = snapCtx.getImageData(0, 0, frameW, frameH);
      mpRes = faceLandmarkerInstance.detectForVideo(snapImageData, tsImg);
    } catch {
      if (!mpRes) {
        return {
          hasFace: false,
          multipleFaces: false,
          faceCount: 0,
          bbox: null,
          keypoints5: null,
          irisKeypoints5: null,
          quality: null,
          liveness: null,
          chwRgb: null,
          gammaChwRgb: null,
          wideChwRgb: null,
          irisChwRgb: null,
          embedding: null,
          embeddingInt8B64: null,
          flippedEmbedding: null,
          flippedEmbeddingInt8B64: null,
          guidanceMessage: 'Đang đồng bộ khung hình camera...',
        };
      }
    }
  }
  const faces = mpRes?.faceLandmarks || [];

  if (faces.length === 0) {
    return {
      hasFace: false,
      multipleFaces: false,
      faceCount: 0,
      bbox: null,
      keypoints5: null,
      quality: null,
      liveness: null,
      chwRgb: null,
      embedding: null,
      embeddingInt8B64: null,
      flippedEmbedding: null,
      flippedEmbeddingInt8B64: null,
      guidanceMessage: 'Đưa khuôn mặt vào khung quét',
    };
  }

  // Pick the largest foreground face if a bystander walks behind in the kitchen/hallway
  let primaryIdx = 0;
  if (faces.length > 1) {
    let bestSpan = -1;
    for (let idx = 0; idx < faces.length; idx++) {
      let minX = 1;
      let maxX = 0;
      for (const pt of faces[idx]) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
      }
      if (maxX - minX > bestSpan) {
        bestSpan = maxX - minX;
        primaryIdx = idx;
      }
    }
  }

  const matrixObj = mpRes?.facialTransformationMatrixes?.[primaryIdx];
  const matrixData: Float32Array | number[] | undefined = matrixObj?.data ?? matrixObj;
  const geom = extractLandmarksAndPose(
    faces[primaryIdx],
    matrixData,
    frameW,
    frameH,
    options?.mirrorYaw ?? true
  );
  // Normalize face width against the shorter frame axis so portrait (720x1280) and landscape (1280x720) sensors behave identically
  const minFrameAxis = Math.max(1, Math.min(frameW, frameH));
  const faceWidthRatio = geom.bbox.width / minFrameAxis;
  const isAngledEnroll = options?.poseMode === 'ENROLL_ANGLED';
  const minWidthRatio = options?.minWidthRatio ?? (isAngledEnroll ? 0.12 : FACE_MIN_BBOX_WIDTH_RATIO);

  const snapSource = frameSnapCanvas as CanvasImageSource;
  const { chwRgb, gammaChwRgb, brightness, sharpness } = buildAligned112TensorAndQuality(
    snapSource,
    frameW,
    frameH,
    geom.keypoints5,
    ARCFACE_DST_5PTS,
    !isAngledEnroll
  );
  const quality: FrameQualityMetrics = {
    brightness,
    sharpness,
    faceWidthRatio,
    noseProtrusionZ: geom.noseProtrusionZ,
    yawDeg: geom.yawDeg,
    pitchDeg: geom.pitchDeg,
    rollDeg: geom.rollDeg,
  };

  if (faceWidthRatio < minWidthRatio) {
    return {
      hasFace: true,
      multipleFaces: faces.length > 1,
      faceCount: faces.length,
      bbox: geom.bbox,
      keypoints5: geom.keypoints5,
      quality,
      liveness: null,
      chwRgb: null,
      embedding: null,
      embeddingInt8B64: null,
      flippedEmbedding: null,
      flippedEmbeddingInt8B64: null,
      guidanceMessage: 'Vui lòng tiến lại gần camera hơn một chút',
    };
  }

  if (brightness < 14) {
    return {
      hasFace: true,
      multipleFaces: faces.length > 1,
      faceCount: faces.length,
      bbox: geom.bbox,
      keypoints5: geom.keypoints5,
      irisKeypoints5: geom.irisKeypoints5,
      quality,
      liveness: null,
      chwRgb: null,
      irisChwRgb: null,
      embedding: null,
      embeddingInt8B64: null,
      flippedEmbedding: null,
      flippedEmbeddingInt8B64: null,
      guidanceMessage: 'Môi trường hơi tối — vui lòng hướng mặt ra vùng sáng',
    };
  }

  const minSharpness = isAngledEnroll ? 0.9 : 0.95;
  if (sharpness < minSharpness) {
    return {
      hasFace: true,
      multipleFaces: faces.length > 1,
      faceCount: faces.length,
      bbox: geom.bbox,
      keypoints5: geom.keypoints5,
      irisKeypoints5: geom.irisKeypoints5,
      quality,
      liveness: null,
      chwRgb: null,
      irisChwRgb: null,
      embedding: null,
      embeddingInt8B64: null,
      flippedEmbedding: null,
      flippedEmbeddingInt8B64: null,
      guidanceMessage: 'Giữ đầu ổn định trong giây lát để lấy nét',
    };
  }

  let liveness: LivenessScores = {
    liveScore: 1,
    printSpoofScore: 0,
    replaySpoofScore: 0,
    isLive: true,
  };

  // Enforce 3D depth + MiniFASNetV2 CNN anti-spoof fusion on FRONTAL frames:
  // Blocks flat 2D print/screen spoofs while staying resilient under warm restaurant evening lighting & mobile ISP smoothing.
  if (!options?.skipLiveness && !isAngledEnroll) {
    const bgr80 = buildAntiSpoof80BgrTensor(snapSource, geom.bbox, frameW, frameH);
    const fasScores = await runMiniFasNetFromChwTensor(bgr80);
    liveness = evaluateHybridLiveness(fasScores, geom.noseProtrusionZ, faceWidthRatio);

    if (!liveness.isLive) {
      return {
        hasFace: true,
        multipleFaces: faces.length > 1,
        faceCount: faces.length,
        bbox: geom.bbox,
        keypoints5: geom.keypoints5,
        irisKeypoints5: geom.irisKeypoints5,
        quality,
        liveness,
        chwRgb: null,
        gammaChwRgb: null,
        wideChwRgb: null,
        irisChwRgb: null,
        embedding: null,
        embeddingInt8B64: null,
        flippedEmbedding: null,
        flippedEmbeddingInt8B64: null,
        guidanceMessage: 'Không nhận diện qua màn hình/ảnh tĩnh — vui lòng nhìn trực tiếp',
      };
    }
  }

  let wideChwRgb: Float32Array | null = null;
  let irisChwRgb: Float32Array | null = null;
  if (!isAngledEnroll) {
    wideChwRgb = buildAligned112TensorAndQuality(
      snapSource,
      frameW,
      frameH,
      geom.keypoints5,
      WIDE_ARCFACE_DST_5PTS,
      false
    ).chwRgb;

    if (geom.irisKeypoints5) {
      const eyeDelta = Math.max(
        Math.hypot(
          geom.irisKeypoints5[0][0] - geom.keypoints5[0][0],
          geom.irisKeypoints5[0][1] - geom.keypoints5[0][1]
        ),
        Math.hypot(
          geom.irisKeypoints5[1][0] - geom.keypoints5[1][0],
          geom.irisKeypoints5[1][1] - geom.keypoints5[1][1]
        )
      );
      if (eyeDelta >= 0.5) {
        irisChwRgb = buildAligned112TensorAndQuality(
          snapSource,
          frameW,
          frameH,
          geom.irisKeypoints5
        ).chwRgb;
      }
    }
  }

  const embedding = await runArcFaceFromChwTensor(chwRgb);
  const embeddingInt8B64 = quantizeVectorsToInt8B64([embedding]);

  let flippedEmbedding: Float32Array | null = null;
  let flippedEmbeddingInt8B64: string | null = null;
  if (options?.includeFlippedEmbedding) {
    const flippedCand = await computeFlippedArcFaceCandidate(chwRgb);
    flippedEmbedding = flippedCand.embedding;
    flippedEmbeddingInt8B64 = flippedCand.int8B64;
  }

  return {
    hasFace: true,
    multipleFaces: faces.length > 1,
    faceCount: faces.length,
    bbox: geom.bbox,
    frameWidth: frameW,
    frameHeight: frameH,
    keypoints5: geom.keypoints5,
    irisKeypoints5: geom.irisKeypoints5,
    quality,
    liveness,
    chwRgb,
    gammaChwRgb,
    wideChwRgb,
    irisChwRgb,
    embedding,
    embeddingInt8B64,
    flippedEmbedding,
    flippedEmbeddingInt8B64,
    guidanceMessage: 'Đang xác thực khuôn mặt...',
  };
}
