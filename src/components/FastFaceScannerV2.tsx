import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ScanFace,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Camera,
  CameraOff,
  Loader2,
  Sparkles,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  CloudUpload,
  SwitchCamera,
  LogIn,
  LogOut,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import KalmanFilter from '../utils/kalman';
import {
  getDist,
  speak,
  playPosSuccess,
  playPosWarning,
  getVietnamDateParts,
  KG_LAT,
  KG_LNG,
  KG_STANDARD_ADDRESS,
  normalizeGpsRadius,
  setLocalLastPunch,
} from '../utils/helpers';
import {
  EMPLOYEE_COOLDOWN_MS,
  formatUnifiedPunchLabel,
  isCheckInLabel,
  matchesAttendanceUser,
  recordEmployeePunchCooldown,
  recordLocalMissedClaim,
  resolveNextAttendancePunch,
  resolveSmartAttendanceIntent,
  type AttendanceLogEntryLike,
  type CanonicalPunchType,
  type SmartAttendanceIntentResolution,
} from '../utils/attendanceSequence';
import {
  isAuthorizedTestUser,
  detectGpsSpoofing,
  generateLocationSecurityToken,
  recordGpsSample,
} from '../utils/antiFraud';
import { renderCheckInWatermarkCanvas } from '../utils/checkinWatermark';
import {
  clearCheckinInFlight,
  clearImageUploadInFlight,
  enqueueTask,
  markCheckinInFlight,
  markImageUploadInFlight,
  markPunchVaultEdgeBuffered,
  markPunchVaultImageQueuedOnEdge,
  markPunchVaultImageUploaded,
  markPunchVaultSynced,
  savePunchToVault,
} from '../utils/offlineQueue';
import {
  FACE_AUTO_PUNCH_MIN_MARGIN,
  FACE_AUTO_PUNCH_MIN_SCORE,
  FACE_AUTO_PUNCH_REQUIRED_STREAK,
  FACE_MODEL_VERSION_CANON,
  TemporalMatchVoter,
  analyzeVideoFrameBiometrics,
  computeFlippedArcFaceCandidate,
  evaluateAutoPunchFrameReadiness,
  fuseCanonicalMirrorEmbedding,
  getCachedFaceProfiles,
  getCachedHydratedFaceProfiles,
  initFaceBiometricEngine,
  matchEmployeeFaceWithCandidates,
  quantizeVectorsToInt8B64,
  runArcFaceFromChwTensor,
  setCachedFaceProfiles,
  subscribeCachedFaceProfiles,
  upsertCachedFaceProfile,
  type FaceCandidateVector,
  type HydratedFaceProfile,
  type RawFaceProfileDto,
} from '../services/faceRecognitionV2';
import type { StaffFacePickerCandidate } from './AdminStaffFacePickerModal';

const FaceEnrollmentModal = lazy(() => import('./FaceEnrollmentModal'));
const AdminStaffFacePickerModal = lazy(() => import('./AdminStaffFacePickerModal'));

export interface FastFaceScannerV2Props {
  isOpen: boolean;
  isKioskMode?: boolean;
  onClose: () => void;
  onSwitchToV1?: () => void;
}

interface ActiveTrayNotice {
  id: string;
  kind: 'SUBMITTING' | 'SUCCESS' | 'COOLDOWN' | 'MAX_PUNCHES' | 'SPOOF_OR_ERROR';
  username: string;
  fullname: string;
  punchType?: CanonicalPunchType | string;
  timeStr: string;
  dateStr?: string;
  subMessage: string;
  syncState?: 'SYNCING' | 'SHEET_SAVED' | 'EDGE_BUFFERED' | 'PHOTO_UPLOADED' | 'QUEUED_OFFLINE';
  scheduleWarningText?: string;
  scorePercent?: number;
  remainingText?: string;
  expiresAtMs: number;
}

interface PendingV2Disambiguation {
  profile: HydratedFaceProfile;
  liveVectorB64: string;
  matchScore: number;
  watermarkedRaCaBase64: string;
  watermarkedVaoCaBase64: string;
  stampLat: number;
  stampLng: number;
  stampAcc: number;
  stampDist: number;
  scanDate: Date;
  intent: SmartAttendanceIntentResolution;
  todayShift: string | null;
  expiresAtMs: number;
}

interface RecentStationPunch {
  id: string;
  fullname: string;
  punchType: string;
  timeShort: string;
  photoUploaded: boolean;
}

function formatExactVietnamDateTime(date: Date): {
  full: string;
  clock: string;
  dateStr: string;
  isBefore06: boolean;
} {
  const vn = getVietnamDateParts(date);
  const dd = String(vn.day).padStart(2, '0');
  const mm = String(vn.month).padStart(2, '0');
  const yyyy = vn.year;
  const hh = String(vn.hour).padStart(2, '0');
  const min = String(vn.minute).padStart(2, '0');
  const ss = String(vn.second).padStart(2, '0');
  return {
    full: `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`,
    clock: `${hh}:${min}:${ss}`,
    dateStr: `${dd}/${mm}/${yyyy}`,
    isBefore06: vn.hour < 6,
  };
}

function formatRemainingMmSs(totalSeconds: number): string {
  const safe = Math.max(1, Math.ceil(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function FastFaceScannerV2({
  isOpen,
  isKioskMode = false,
  onClose,
  onSwitchToV1,
}: FastFaceScannerV2Props) {
  const currentUser = useAppStore((s) => s.currentUser);
  const storeLogs = useAppStore((s) => s.logs);
  const storeGps = useAppStore((s) => s.gps);
  const serverGpsConfig = useAppStore((s) => s.serverGpsConfig);

  const [clockState, setClockState] = useState(() => formatExactVietnamDateTime(new Date()));
  const [mutedAudio, setMutedAudio] = useState(false);

  // Biometric Engine & Camera States
  const [engineReady, setEngineReady] = useState(false);
  const [bootText, setBootText] = useState('Đang khởi động mạng nơ-ron nhận diện...');
  const [bootPct, setBootPct] = useState(15);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const cameraFacingRef = useRef<'user' | 'environment'>('user');
  cameraFacingRef.current = cameraFacing;

  // Profiles & Attendance State (hydrated synchronously in 0ms from shared client cache)
  const [rawProfiles, setRawProfiles] = useState<RawFaceProfileDto[]>(() =>
    getCachedFaceProfiles()
  );
  const [hydratedProfiles, setHydratedProfiles] = useState<HydratedFaceProfile[]>(() =>
    getCachedHydratedFaceProfiles()
  );
  const [kioskLogs, setKioskLogs] = useState<AttendanceLogEntryLike[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const loadingProfilesRef = useRef(false);
  loadingProfilesRef.current = loadingProfiles;
  const [profilesLoadedOnce, setProfilesLoadedOnce] = useState(
    () => getCachedFaceProfiles().length > 0
  );

  // Self or Admin-Assisted Enrollment Modals
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [adminPickerOpen, setAdminPickerOpen] = useState(false);
  const [adminSelectedStaff, setAdminSelectedStaff] = useState<StaffFacePickerCandidate | null>(
    null
  );

  // Live Scan HUD Telemetry
  const [liveGuidance, setLiveGuidance] = useState('Đưa khuôn mặt vào khung quét tự động');
  const [voterStreak, setVoterStreak] = useState(0);
  const [hasFaceInView, setHasFaceInView] = useState(false);
  const [trayNotice, setTrayNotice] = useState<ActiveTrayNotice | null>(null);
  const [recentPunches, setRecentPunches] = useState<RecentStationPunch[]>([]);
  const [pendingDisambiguation, setPendingDisambiguation] =
    useState<PendingV2Disambiguation | null>(null);
  const pendingDisambiguationRef = useRef<PendingV2Disambiguation | null>(null);
  pendingDisambiguationRef.current = pendingDisambiguation;

  // Local GPS State (runs independently so Login Kiosk Mode works with zero prior session)
  const [localGps, setLocalGps] = useState<{
    lat: number | null;
    lng: number | null;
    acc: number | null;
    rawDist: number | null;
    effectiveDist: number | null;
    isValid: boolean;
    statusText: string;
  }>({
    lat: storeGps.lat,
    lng: storeGps.lng,
    acc: storeGps.accuracy ?? null,
    rawDist: storeGps.distance ?? null,
    effectiveDist: storeGps.distance ?? null,
    isValid: Boolean(storeGps.isValid),
    statusText: storeGps.isValid ? 'Trong bán kính ≤25m' : 'Đang khóa vệ tinh GPS...',
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const watermarkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const isAnalyzingRef = useRef(false);
  const mountedRef = useRef(false);
  const bootGenRef = useRef(0);

  const kalmanLatRef = useRef(new KalmanFilter(20));
  const kalmanLngRef = useRef(new KalmanFilter(20));
  // 3-frame consecutive consensus (~280ms) with strict reset on bystander / multi-face / cross-employee switch
  const voterRef = useRef(new TemporalMatchVoter(FACE_AUTO_PUNCH_REQUIRED_STREAK, 0));
  const turnTransitionUntilRef = useRef<number>(0);

  const inFlightUsersRef = useRef<Set<string>>(new Set());
  const justPunchedUntilRef = useRef<Map<string, number>>(new Map());
  const voiceThrottleRef = useRef<Map<string, number>>(new Map());
  const lastAutoProfileSyncMsRef = useRef<number>(0);
  const hydratedProfilesRef = useRef<HydratedFaceProfile[]>([]);
  const mergedLogsRef = useRef<AttendanceLogEntryLike[]>([]);
  const localGpsRef = useRef(localGps);
  const mutedAudioRef = useRef(mutedAudio);
  const trayNoticeRef = useRef<ActiveTrayNotice | null>(null);

  const isAdminAccount = !isKioskMode && currentUser?.role === 'admin';
  const anySubModalOpen = enrollModalOpen || adminPickerOpen;

  useEffect(() => {
    mutedAudioRef.current = mutedAudio;
  }, [mutedAudio]);

  useEffect(() => {
    localGpsRef.current = localGps;
  }, [localGps]);

  useEffect(() => {
    hydratedProfilesRef.current = hydratedProfiles;
  }, [hydratedProfiles]);

  // Subscribe to shared client profile store so prewarm or sibling modals update scanner in 0ms
  useEffect(() => {
    const syncFromMemory = () => {
      const latestRaw = getCachedFaceProfiles();
      const latestHydrated = getCachedHydratedFaceProfiles();
      setRawProfiles(latestRaw);
      setHydratedProfiles(latestHydrated);
      if (latestRaw.length > 0) {
        setProfilesLoadedOnce(true);
      }
    };
    syncFromMemory();
    return subscribeCachedFaceProfiles(() => {
      syncFromMemory();
    });
  }, [isOpen]);

  // Sync valid GPS fixes already acquired by parent CheckIn page so scanner unlocks in 0ms
  useEffect(() => {
    if (storeGps.lat === null || storeGps.lng === null) return;
    if (!storeGps.isValid && localGpsRef.current.isValid) return;
    const cfg = useAppStore.getState().serverGpsConfig;
    const refLat = cfg?.lat ?? KG_LAT;
    const refLng = cfg?.lng ?? KG_LNG;
    const refRad = normalizeGpsRadius(cfg?.radius);
    const acc = Math.round(storeGps.accuracy ?? 15);
    const rawDist = Math.round(
      storeGps.distance ?? getDist(storeGps.lat, storeGps.lng, refLat, refLng) * 1000
    );
    const indoorAllowance = Math.min(Math.max(0, acc) * 0.45, 15);
    const effectiveDist = Math.max(0, Math.round(rawDist - indoorAllowance));
    const within = Boolean(storeGps.isValid) || effectiveDist <= refRad;
    setLocalGps({
      lat: storeGps.lat,
      lng: storeGps.lng,
      acc,
      rawDist,
      effectiveDist,
      isValid: within,
      statusText: within
        ? `GPS ${rawDist}m / ${refRad}m`
        : `Cách quán ${rawDist}m (Cần ≤${refRad}m)`,
    });
  }, [storeGps.accuracy, storeGps.distance, storeGps.isValid, storeGps.lat, storeGps.lng]);

  useEffect(() => {
    trayNoticeRef.current = trayNotice;
  }, [trayNotice]);

  // Preload King's Grill emblem for silent watermarked proof stamps
  useEffect(() => {
    if (!isOpen) return;
    const img = new Image();
    img.src = '/android-chrome-192x192.png?v=4';
    img.onload = () => {
      logoImgRef.current = img;
    };
    img.onerror = () => {
      const fallback = new Image();
      fallback.src = '/logo_email.png';
      fallback.onload = () => {
        logoImgRef.current = fallback;
      };
    };
  }, [isOpen]);

  const targetLat = serverGpsConfig?.lat ?? KG_LAT;
  const targetLng = serverGpsConfig?.lng ?? KG_LNG;
  const targetRadius = normalizeGpsRadius(serverGpsConfig?.radius);
  const canBypassGps = !isKioskMode && isAuthorizedTestUser(currentUser);
  const isGpsReady = canBypassGps || localGps.isValid;

  // Combine global store logs + multi-employee 30h kiosk logs
  const mergedAllLogs = useMemo(() => {
    const combined: AttendanceLogEntryLike[] = [...kioskLogs, ...storeLogs];
    return combined;
  }, [kioskLogs, storeLogs]);

  useEffect(() => {
    mergedLogsRef.current = mergedAllLogs;
  }, [mergedAllLogs]);

  const isCurrentUserEnrolled = useMemo(() => {
    if (!currentUser?.username) return true;
    const target = currentUser.username.trim().toLowerCase();
    return hydratedProfiles.some((p) => p.username.trim().toLowerCase() === target);
  }, [currentUser?.username, hydratedProfiles]);

  const speakStation = useCallback((msg: string, throttleKey?: string, throttleMs = 15000) => {
    if (mutedAudioRef.current) return;
    if (throttleKey) {
      const lastMs = voiceThrottleRef.current.get(throttleKey) || 0;
      if (Date.now() - lastMs < throttleMs) return;
      voiceThrottleRef.current.set(throttleKey, Date.now());
    }
    speak(msg);
  }, []);

  // 1s Live Clock & Tray Auto-Expiry
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => {
      const nowMs = Date.now();
      setClockState(formatExactVietnamDateTime(new Date(nowMs)));
      setTrayNotice((prev) =>
        prev && prev.kind !== 'SUBMITTING' && nowMs >= prev.expiresAtMs ? null : prev
      );
      setPendingDisambiguation((prev) => (prev && nowMs >= prev.expiresAtMs ? null : prev));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  const stopCameraAndGps = useCallback(() => {
    bootGenRef.current += 1;
    if (scanTimerRef.current !== null) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    isAnalyzingRef.current = false;
    voterRef.current.reset();
    setPendingDisambiguation(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setCameraReady(false);
  }, []);

  // Start 2-phase indoor-resilient Kalman-filtered GPS watch (fast coarse Wi-Fi/Cell seed + high-accuracy watch)
  const startStationGpsWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setLocalGps((prev) => ({
        ...prev,
        isValid: canBypassGps,
        statusText: canBypassGps ? 'Chế độ kiểm thử (Bypass GPS)' : 'Thiết bị không hỗ trợ định vị GPS',
      }));
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    const applyGeoPosition = (pos: GeolocationPosition) => {
      if (!mountedRef.current) return;
      recordGpsSample(pos);
      const cfg = useAppStore.getState().serverGpsConfig;
      const refLat = cfg?.lat ?? targetLat;
      const refLng = cfg?.lng ?? targetLng;
      const refRad = normalizeGpsRadius(cfg?.radius ?? targetRadius);

      const acc = Math.round(pos.coords.accuracy || 15);
      const smoothLat = kalmanLatRef.current.filter(pos.coords.latitude, acc);
      const smoothLng = kalmanLngRef.current.filter(pos.coords.longitude, acc);
      const rawDist = Math.round(getDist(smoothLat, smoothLng, refLat, refLng) * 1000);
      const indoorAllowance = Math.min(Math.max(0, acc) * 0.45, 15);
      const effectiveDist = Math.max(0, Math.round(rawDist - indoorAllowance));
      const within = effectiveDist <= refRad;

      setLocalGps({
        lat: smoothLat,
        lng: smoothLng,
        acc,
        rawDist,
        effectiveDist,
        isValid: within,
        statusText: within
          ? `GPS ${rawDist}m / ${refRad}m`
          : `Cách quán ${rawDist}m (Cần ≤${refRad}m)`,
      });
    };

    // Phase 1: Instant coarse Wi-Fi / Cell fix (<1s indoors on brand-new phones)
    try {
      navigator.geolocation.getCurrentPosition(
        applyGeoPosition,
        () => {
          // Ignore coarse seed failure; Phase 2 watchPosition handles status
        },
        {
          enableHighAccuracy: false,
          maximumAge: 30000,
          timeout: 5000,
        }
      );
    } catch {
      // Ignore WebView sync geolocation quirks
    }

    // Phase 2: Continuous high-accuracy satellite + Wi-Fi watch
    watchIdRef.current = navigator.geolocation.watchPosition(
      applyGeoPosition,
      (err) => {
        if (!mountedRef.current) return;
        const isPermissionDenied = err.code === 1 || err.code === err.PERMISSION_DENIED;
        if (!isPermissionDenied) {
          // Indoor GPS timeout (code 3) or unavailable (code 2): request fresh coarse fix immediately
          try {
            navigator.geolocation.getCurrentPosition(applyGeoPosition, () => {}, {
              enableHighAccuracy: false,
              maximumAge: 15000,
              timeout: 6000,
            });
          } catch {
            // Ignore
          }
        }
        setLocalGps((prev) => ({
          ...prev,
          isValid: prev.isValid || canBypassGps,
          statusText: prev.isValid
            ? prev.statusText
            : canBypassGps
            ? 'Chế độ kiểm thử (Bypass GPS)'
            : isPermissionDenied
            ? 'Chưa cấp quyền vị trí GPS'
            : 'Đang lấy vị trí trong nhà... (Nhấn thử lại)',
        }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );
  }, [canBypassGps, targetLat, targetLng, targetRadius]);

  // Fetch Face Profiles + Multi-Employee 30h Attendance Logs directly from Cloudflare Edge D1 (<25ms)
  const syncProfilesAndAttendanceState = useCallback(
    async (forceGasRefresh = false) => {
      const gpsSnap = localGpsRef.current;
      const gpsReadyNow = !isKioskMode || canBypassGps || gpsSnap.isValid;
      const latToSend = gpsSnap.lat ?? targetLat;
      const lngToSend = gpsSnap.lng ?? targetLng;
      const accToSend = gpsSnap.acc ?? 8;

      setLoadingProfiles(true);
      lastAutoProfileSyncMsRef.current = Date.now();

      const applyProfilesResponse = (profRes: any): number => {
        if (!mountedRef.current || !profRes?.ok) return -1;
        if (profRes.data?.gpsConfig) {
          const gLat = Number(profRes.data.gpsConfig.lat);
          const gLng = Number(profRes.data.gpsConfig.lng);
          const gRad = normalizeGpsRadius(profRes.data.gpsConfig.radius);
          if (Number.isFinite(gLat) && Number.isFinite(gLng) && gLat !== 0 && gLng !== 0) {
            useAppStore.getState().setServerGpsConfig({ lat: gLat, lng: gLng, radius: gRad });
          }
        }
        if (Array.isArray(profRes.data?.profiles)) {
          const list: RawFaceProfileDto[] = profRes.data.profiles;
          setCachedFaceProfiles(list);
          setRawProfiles(list);
          setHydratedProfiles(getCachedHydratedFaceProfiles());
          setProfilesLoadedOnce(true);
          return list.length;
        }
        return 0;
      };

      try {
        // Always ensure 0-latency Edge D1 vectors arrive first on a cold device (even for Admin or pre-GPS Kiosk)
        if (!gpsReadyNow || hydratedProfilesRef.current.length === 0) {
          let count = 0;
          if (!forceGasRefresh) {
            const preloadRes = await callApi(
              'GET_FACE_PROFILES',
              {
                isKiosk: true,
                preloadOnly: true,
                fastEdge: true,
              },
              { background: true, cacheTtlMs: 0, timeoutMs: 8000 }
            );
            count = applyProfilesResponse(preloadRes);
          }
          if (count <= 0 || forceGasRefresh) {
            const fallbackRes = await callApi(
              'GET_FACE_PROFILES',
              {
                isKiosk: true,
                preloadOnly: true,
                fastEdge: false,
                forceRefresh: Boolean(forceGasRefresh),
              },
              { background: true, cacheTtlMs: 0, timeoutMs: 14000 }
            );
            applyProfilesResponse(fallbackRes);
          }
          if (!gpsReadyNow) {
            return;
          }
        }

        // Dispatch full D1 profile & attendance state queries independently once GPS is locked
        const profPromise = callApi(
          'GET_FACE_PROFILES',
          {
            isKiosk: Boolean(isKioskMode),
            username: currentUser?.username || '',
            role: currentUser?.role || (isKioskMode ? 'kiosk' : 'user'),
            actorRole: currentUser?.role || (isKioskMode ? 'kiosk' : 'user'),
            lat: latToSend,
            lng: lngToSend,
            gpsAccuracy: accToSend,
            fastEdge: !forceGasRefresh,
            forceRefresh: Boolean(forceGasRefresh),
          },
          { background: true, cacheTtlMs: 0, timeoutMs: forceGasRefresh ? 16000 : 8000 }
        ).then((profRes) => {
          applyProfilesResponse(profRes);
        });

        const statePromise = callApi(
          'GET_KIOSK_ATTENDANCE_STATE',
          {
            isKiosk: Boolean(gpsReadyNow),
            username: currentUser?.username || '',
            fullname: currentUser?.fullname || '',
            lat: latToSend,
            lng: lngToSend,
            gpsAccuracy: accToSend,
            fastEdge: !forceGasRefresh,
            forceRefresh: Boolean(forceGasRefresh),
          },
          { background: true, cacheTtlMs: 0, timeoutMs: forceGasRefresh ? 16000 : 8000 }
        ).then((stateRes) => {
          if (!mountedRef.current) return;
          if (stateRes?.ok && Array.isArray(stateRes.data?.logs)) {
            setKioskLogs((prev) => {
              const recentLocal = prev.filter(
                (p) => typeof p.timestamp === 'number' && Date.now() - p.timestamp < 3 * 60 * 1000
              );
              return [...recentLocal, ...stateRes.data.logs];
            });
          }
        });

        await Promise.allSettled([profPromise, statePromise]);
      } catch {
        // Keep previously cached profiles in memory if transient network hiccup occurs
      } finally {
        if (mountedRef.current) setLoadingProfiles(false);
      }
    },
    [canBypassGps, currentUser?.fullname, currentUser?.role, currentUser?.username, isKioskMode, targetLat, targetLng]
  );

  // Trigger instant Edge D1 hydration immediately upon open (even while GPS locks) & again once GPS locks
  useEffect(() => {
    if (!isOpen || anySubModalOpen) return;
    void syncProfilesAndAttendanceState(false);
  }, [anySubModalOpen, isGpsReady, isOpen, syncProfilesAndAttendanceState]);

  // Periodic 20s background Edge D1 sync (<20ms) so cross-phone enrollments & punches propagate automatically
  useEffect(() => {
    if (!isOpen || anySubModalOpen) return;
    const id = window.setInterval(() => {
      void syncProfilesAndAttendanceState(false);
    }, 20000);
    return () => window.clearInterval(id);
  }, [anySubModalOpen, isOpen, syncProfilesAndAttendanceState]);

  const captureSilentWatermarkedProof = useCallback(
    (
      video: HTMLVideoElement,
      employee: HydratedFaceProfile,
      punchType: CanonicalPunchType,
      exactTime: string,
      stampLat: number,
      stampLng: number,
      stampDist: number
    ): string => {
      try {
        if (!watermarkCanvasRef.current) {
          watermarkCanvasRef.current = document.createElement('canvas');
        }
        const canvas = watermarkCanvasRef.current;
        const targetW = 720;
        const targetH = 1280;
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        const canvasRatio = targetW / targetH;
        const videoRatio = vw / vh;

        let sx = 0;
        let sy = 0;
        let sw = vw;
        let sh = vh;
        if (videoRatio > canvasRatio) {
          sh = vh;
          sw = vh * canvasRatio;
          sx = (vw - sw) * 0.5;
        } else {
          sw = vw;
          sh = vw / canvasRatio;
          sy = (vh - sh) * 0.5;
        }

        ctx.save();
        ctx.filter = 'none';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (cameraFacingRef.current === 'user') {
          ctx.translate(targetW, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
        ctx.restore();

        return renderCheckInWatermarkCanvas({
          canvas,
          ctx,
          exactTime,
          addr: KG_STANDARD_ADDRESS,
          typeToStamp: punchType,
          stampLat,
          stampLng,
          stampDist,
          stampMsg: `Khoảng cách: ${stampDist}m / ${targetRadius}m (Face ID v2 Hợp lệ)`,
          targetRadius,
          user: {
            username: employee.username,
            fullname: employee.fullname,
            position: employee.position || 'Nhân sự',
          },
          logoImg: logoImgRef.current,
        });
      } catch {
        return '';
      }
    },
    [targetRadius]
  );

  const executeAutoFacePunch = useCallback(
    async (
      video: HTMLVideoElement | null,
      profile: HydratedFaceProfile,
      liveVectorB64: string,
      matchScore: number,
      resolutionOverride?: {
        forcedPunchType: CanonicalPunchType;
        alsoSupplementIn?: boolean;
        todayShift?: string | null;
        intent?: SmartAttendanceIntentResolution;
        preCaptured?: {
          watermarkedBase64: string;
          scanDate: Date;
          stampLat: number;
          stampLng: number;
          stampAcc: number;
          stampDist: number;
        };
      }
    ) => {
      const unameKey = profile.username.trim().toLowerCase();

      // SYNCHRONOUS MILLISECOND LOCK: guarantees ONLY the earliest scan is processed even at 10 FPS continuous scanning!
      if (inFlightUsersRef.current.has(unameKey)) return;
      const justPunchedUntil = justPunchedUntilRef.current.get(unameKey) || 0;
      if (Date.now() < justPunchedUntil) return;
      inFlightUsersRef.current.add(unameKey);

      try {
        // Clear confirmation banner of a PREVIOUS different employee immediately when Employee B steps up
        if (
          trayNoticeRef.current &&
          trayNoticeRef.current.username.trim().toLowerCase() !== unameKey
        ) {
          setTrayNotice(null);
        }

        const gpsSnap = localGpsRef.current;
        const isTestProfile = isAuthorizedTestUser(profile);
        if (!canBypassGps && !isTestProfile && !resolutionOverride?.preCaptured) {
          const spoofCheck = detectGpsSpoofing();
          if (spoofCheck.isSuspicious) {
            justPunchedUntilRef.current.set(unameKey, Date.now() + 3500);
            playPosWarning();
            setTrayNotice({
              id: `spoof_${Date.now()}`,
              kind: 'SPOOF_OR_ERROR',
              username: profile.username,
              fullname: profile.fullname,
              timeStr: formatExactVietnamDateTime(new Date()).clock,
              subMessage:
                'Phát hiện tín hiệu GPS bất thường (nghi vấn giả lập vị trí). Đã từ chối ghi nhận.',
              expiresAtMs: Date.now() + 4500,
            });
            return;
          }
        }

        let logsForSeq: AttendanceLogEntryLike[] = mergedLogsRef.current;
        if (!resolutionOverride && isKioskMode && !gpsSnap.isValid && isTestProfile) {
          try {
            const personalStateRes = await callApi(
              'GET_KIOSK_ATTENDANCE_STATE',
              {
                isKiosk: false,
                username: profile.username,
                fullname: profile.fullname,
                fastEdge: true,
              },
              { background: true, cacheTtlMs: 0, timeoutMs: 3500 }
            );
            if (personalStateRes?.ok && Array.isArray(personalStateRes.data?.logs)) {
              const fetchedLogs = personalStateRes.data.logs as AttendanceLogEntryLike[];
              logsForSeq = [...mergedLogsRef.current, ...fetchedLogs];
              setKioskLogs((prev) => {
                const recentLocal = prev.filter(
                  (p) => typeof p.timestamp === 'number' && Date.now() - p.timestamp < 3 * 60 * 1000
                );
                return [...recentLocal, ...fetchedLogs];
              });
            }
          } catch {
            // Proceed with local logs; server D1 cooldown & GAS sequence remain authoritative
          }
        }

        // Capture timestamp of the EARLIEST valid scan
        const earliestScanDate = resolutionOverride?.preCaptured?.scanDate ?? new Date();
        const seq = resolveNextAttendancePunch({
          user: { username: profile.username, fullname: profile.fullname },
          logs: logsForSeq,
          now: earliestScanDate,
        });

        const vnTime = formatExactVietnamDateTime(earliestScanDate);

        if (!seq.canPunch || !seq.nextType) {
          justPunchedUntilRef.current.set(unameKey, Date.now() + 2500);
          if (seq.blockedReason === 'COOLDOWN_15M' || seq.blockedReason === 'COOLDOWN_30M') {
            setTrayNotice({
              id: `cd_${unameKey}_${Date.now()}`,
              kind: 'COOLDOWN',
              username: profile.username,
              fullname: profile.fullname,
              punchType: formatUnifiedPunchLabel(seq.lastPunchType || 'Đã ghi nhận'),
              timeStr: seq.lastPunchTimeStr || vnTime.clock,
              remainingText: seq.remainingFormatted,
              subMessage: `Lượt chấm của bạn đã được ghi nhận — Không cần quét lại! (Giãn cách 15 phút • Còn ${seq.remainingFormatted})`,
              expiresAtMs: Date.now() + 4500,
            });
            speakStation(
              `Lượt chấm của ${profile.fullname} đã được ghi nhận. Bạn không cần quét lại trong 15 phút.`,
              `cd_${unameKey}`,
              18000
            );
          } else {
            setTrayNotice({
              id: `max_${unameKey}_${Date.now()}`,
              kind: 'MAX_PUNCHES',
              username: profile.username,
              fullname: profile.fullname,
              punchType: 'Đủ 4 lượt',
              timeStr: vnTime.clock,
              subMessage:
                'Đã hoàn thành đủ 4 lượt chấm công (2 cặp Vào ca – Ra ca) trong ca ngày.',
              expiresAtMs: Date.now() + 4500,
            });
            speakStation(
              `${profile.fullname} đã hoàn tất đủ bốn lượt chấm công hôm nay.`,
              `max_${unameKey}`,
              18000
            );
          }
          return;
        }

        let resolvedTodayShift: string | null = resolutionOverride?.todayShift ?? null;
        if (!resolutionOverride) {
          const appState = useAppStore.getState();
          if (
            appState.currentUser &&
            matchesAttendanceUser(
              { username: profile.username, fullname: profile.fullname },
              appState.currentUser
            )
          ) {
            const activeShifts = appState.currentWeekApprovedShifts ?? appState.approvedShifts;
            if (Array.isArray(activeShifts)) {
              const vnParts = getVietnamDateParts(earliestScanDate);
              const dayIdx = vnParts.dayOfWeek === 0 ? 6 : vnParts.dayOfWeek - 1;
              resolvedTodayShift = activeShifts[dayIdx] ?? null;
            }
          }
        }

        const smartIntent =
          resolutionOverride?.intent ??
          resolveSmartAttendanceIntent({
            user: { username: profile.username, fullname: profile.fullname },
            logs: logsForSeq,
            todayShift: resolvedTodayShift,
            now: earliestScanDate,
          });

        const stampLat = resolutionOverride?.preCaptured?.stampLat ?? gpsSnap.lat ?? targetLat;
        const stampLng = resolutionOverride?.preCaptured?.stampLng ?? gpsSnap.lng ?? targetLng;
        const stampAcc = resolutionOverride?.preCaptured?.stampAcc ?? gpsSnap.acc ?? 8;
        const stampDist = resolutionOverride?.preCaptured?.stampDist ?? gpsSnap.rawDist ?? 0;
        const exactTime = vnTime.full;

        // Smart Intent Disambiguation Gate: pause auto-punch on ambiguous missing-in / unclosed-overnight / stale-open cases
        if (!resolutionOverride && smartIntent.requiresDisambiguation && video) {
          const watermarkedRaCaBase64 = captureSilentWatermarkedProof(
            video,
            profile,
            'Ra ca',
            exactTime,
            stampLat,
            stampLng,
            stampDist
          );
          const watermarkedVaoCaBase64 = captureSilentWatermarkedProof(
            video,
            profile,
            'Vào ca',
            exactTime,
            stampLat,
            stampLng,
            stampDist
          );
          playPosWarning();
          speakStation(
            `Xin chào ${profile.fullname}. Vui lòng chạm chọn Ra ca hoặc Vào ca trên màn hình để xác nhận.`,
            `amb_${unameKey}`,
            12000
          );
          setPendingDisambiguation({
            profile,
            liveVectorB64,
            matchScore,
            watermarkedRaCaBase64,
            watermarkedVaoCaBase64,
            stampLat,
            stampLng,
            stampAcc,
            stampDist,
            scanDate: earliestScanDate,
            intent: smartIntent,
            todayShift: resolvedTodayShift,
            expiresAtMs: Date.now() + 22000,
          });
          return;
        }

        const nextPunchType: CanonicalPunchType =
          resolutionOverride?.forcedPunchType || smartIntent.smartSuggestedAction || seq.nextType;
        const timeISO = earliestScanDate.toISOString();
        const checkinId = `FV2_${profile.username.replace(/[^a-zA-Z0-9]/g, '')}_${earliestScanDate.getTime()}`;

        const watermarkedBase64 = resolutionOverride?.preCaptured
          ? resolutionOverride.preCaptured.watermarkedBase64
          : video
          ? captureSilentWatermarkedProof(
              video,
              profile,
              nextPunchType,
              exactTime,
              stampLat,
              stampLng,
              stampDist
            )
          : '';

        // Show honest in-flight state while writing 8-col row into Google Sheet ✔️CHẤM CÔNG
        const trayId = checkinId;
        setTrayNotice({
          id: trayId,
          kind: 'SUBMITTING',
          username: profile.username,
          fullname: profile.fullname,
          punchType: nextPunchType,
          timeStr: vnTime.clock,
          dateStr: vnTime.dateStr,
          subMessage: 'Đang xác thực & ghi dòng chấm công vào Google Sheet ✔️CHẤM CÔNG...',
          syncState: 'SYNCING',
          scorePercent: Math.round(matchScore * 100),
          expiresAtMs: Date.now() + 30000,
        });

        const securityToken = generateLocationSecurityToken(
          profile.username,
          stampLat,
          stampLng,
          exactTime
        );

        const fullVaultPayload = {
          checkinId,
          checkinMode: 'v2_face',
          liveVectorB64,
          username: profile.username,
          fullname: profile.fullname,
          type: nextPunchType,
          lat: stampLat,
          lng: stampLng,
          gpsAccuracy: stampAcc,
          distance: stampDist,
          distMeters: `${stampDist}m`,
          image: watermarkedBase64 || 'PENDING',
          time: exactTime,
          actualTime: exactTime,
          timeISO,
          location: KG_STANDARD_ADDRESS,
          photoCapturedMs: earliestScanDate.getTime() - 80,
          clientNowMs: Date.now(),
          sendEmailAfterUpload: true,
          securityToken,
        };

        const fastCheckInPayload = {
          ...fullVaultPayload,
          image: 'PENDING',
          fastSync: true,
          instantEdge: true,
        };

        const commitVerifiedPunchLocally = (
          serverData: any,
          syncState: 'SHEET_SAVED' | 'EDGE_BUFFERED' | 'PHOTO_UPLOADED' | 'QUEUED_OFFLINE'
        ) => {
          const canonicalFullname = String(
            serverData?.fullname || serverData?.hoVaTen || profile.fullname
          ).trim();
          const savedTime = String(serverData?.thoiGian || serverData?.time || exactTime).replace(
            /^'/,
            ''
          );
          const schedWarn =
            serverData?.scheduleWarning === true
              ? `Nhắc lịch: Chưa đăng ký ca tuần ${serverData?.scheduleWeekDisplay || 'tới'} (Hạn 17:00 T7)`
              : undefined;

          // Lock 15-minute cooldown ONLY AFTER confirmed server write or genuine offline Vault commit!
          recordEmployeePunchCooldown(
            { username: profile.username, fullname: canonicalFullname },
            nextPunchType,
            savedTime,
            earliestScanDate.getTime()
          );
          justPunchedUntilRef.current.set(unameKey, Date.now() + 6500);
          turnTransitionUntilRef.current = Date.now() + 1200;

          const confirmedEntry: AttendanceLogEntryLike = {
            username: profile.username,
            fullname: canonicalFullname,
            type: nextPunchType,
            time: savedTime,
            timestamp: earliestScanDate.getTime(),
          };
          setKioskLogs((prev) => [confirmedEntry, ...prev]);

          const activeCurrent = useAppStore.getState().currentUser;
          if (
            activeCurrent &&
            (activeCurrent.role === 'admin' ||
              matchesAttendanceUser({ username: profile.username, fullname: canonicalFullname }, activeCurrent))
          ) {
            useAppStore.getState().prependLog({
              checkinId,
              username: profile.username,
              fullname: canonicalFullname,
              type: String(serverData?.loaiChamCong || nextPunchType),
              time: savedTime,
              status:
                syncState === 'QUEUED_OFFLINE'
                  ? 'Lưu tạm trên máy • Chờ mạng'
                  : syncState === 'EDGE_BUFFERED'
                  ? 'Đám mây bảo lãnh • Đang ghi Sheet'
                  : String(serverData?.xacMinh || serverData?.status || 'Hợp lệ'),
              location: String(serverData?.viTri || KG_STANDARD_ADDRESS),
              distance: `${stampDist}m`,
              image: watermarkedBase64 || 'PENDING',
              timestamp: earliestScanDate.getTime(),
              sheetSynced: syncState !== 'EDGE_BUFFERED' && syncState !== 'QUEUED_OFFLINE',
              edgeBuffered: syncState === 'EDGE_BUFFERED',
              localQueued: syncState === 'QUEUED_OFFLINE',
            });
            if (
              activeCurrent &&
              matchesAttendanceUser(
                { username: profile.username, fullname: canonicalFullname },
                activeCurrent
              )
            ) {
              setLocalLastPunch(activeCurrent, nextPunchType, savedTime);
            }
          }

          playPosSuccess();
          const isClockIn = isCheckInLabel(nextPunchType);
          speakStation(
            isClockIn
              ? `Ting! Xin chào ${canonicalFullname}. Đã ghi nhận ${nextPunchType} thành công. Bạn không cần quét lại.`
              : `Ting! Cảm ơn ${canonicalFullname}. Đã ghi nhận ${nextPunchType} thành công. Bạn không cần quét lại.`
          );

          if (schedWarn) {
            speakStation(
              `Lưu ý ${canonicalFullname}: Bạn chưa đăng ký lịch làm tuần tới trước 17 giờ Thứ Bảy.`,
              `sched_${unameKey}`,
              30000
            );
          }

          const verifiedSubMessage =
            syncState === 'EDGE_BUFFERED'
              ? `Đã bảo lãnh đám mây D1 • Đang ghi vào Sheet ✔️CHẤM CÔNG • ${stampDist}m`
              : syncState === 'QUEUED_OFFLINE'
              ? `Đang ngoại tuyến • Đã lưu an toàn trên máy • ${stampDist}m`
              : resolutionOverride?.alsoSupplementIn
              ? `Đã ghi Ra ca & gửi bổ sung Vào ca chờ duyệt • ${stampDist}m`
              : seq.isOvernightBefore06
              ? `Ca đêm trước 06:00 → Thuộc ngày công ${seq.workdayDateKey} • Khoảng cách ${stampDist}m`
              : nextPunchType === 'Ra ca' && smartIntent.openShiftDurationFormatted
              ? `Đã làm việc ${smartIntent.openShiftDurationFormatted} • Đã ghi Sheet ✔️CHẤM CÔNG`
              : `Đã ghi vào Sheet ✔️CHẤM CÔNG • Khoảng cách ${stampDist}m`;

          setTrayNotice({
            id: trayId,
            kind: 'SUCCESS',
            username: profile.username,
            fullname: canonicalFullname,
            punchType: nextPunchType,
            timeStr: vnTime.clock,
            dateStr: vnTime.dateStr,
            subMessage: verifiedSubMessage,
            syncState,
            scheduleWarningText: schedWarn,
            scorePercent: Math.round(matchScore * 100),
            expiresAtMs: Date.now() + 6500,
          });

          setRecentPunches((prev) => [
            {
              id: checkinId,
              fullname: canonicalFullname,
              punchType: nextPunchType,
              timeShort: vnTime.clock.slice(0, 5),
              photoUploaded: syncState === 'PHOTO_UPLOADED',
            },
            ...prev.filter((p) => p.id !== checkinId).slice(0, 2),
          ]);
        };

        markCheckinInFlight(checkinId);
        try {
          const res = await callApi('CHECK_IN_OUT', fastCheckInPayload, {
            background: true,
            timeoutMs: 25000,
            maxAttempts: 2,
          });

          if (!res) {
            // Network timeout / dropped connection (`callApi` returned null) -> enqueue idempotently so retry never triggers false COOLDOWN_15M
            savePunchToVault(fullVaultPayload);
            enqueueTask('CHECK_IN_OUT', fullVaultPayload, { priority: 'high', maxAttempts: 20 });
            commitVerifiedPunchLocally(null, 'QUEUED_OFFLINE');
          } else {
          const errCode = String(res?.code || res?.data?.code || '');
          const isServerCooldown =
            errCode === 'COOLDOWN_15M' ||
            errCode === 'COOLDOWN_30M' ||
            errCode === 'ALREADY_CHECKED_IN' ||
            Boolean(res?.isSpamCooldown);

          const isTransientLockTimeout =
            errCode === 'LOCK_TIMEOUT' || errCode === 'CONCURRENCY_QUEUED';

          if (res?.ok) {
            const isEdgeBuffered = Boolean(
              res.data?.edgeBuffered && res.data?.sheetSaved === false
            );
            savePunchToVault(fullVaultPayload);
            if (!isEdgeBuffered) {
              markPunchVaultSynced(checkinId, res.data);
            } else {
              markPunchVaultEdgeBuffered(checkinId, res.data);
            }
            commitVerifiedPunchLocally(
              res.data,
              isEdgeBuffered
                ? 'EDGE_BUFFERED'
                : watermarkedBase64
                ? 'SHEET_SAVED'
                : 'PHOTO_UPLOADED'
            );

            // Step 2: Stage silent watermarked proof photo on Edge (<100ms) -> Google Drive (Col G =HYPERLINK) + idempotent email
            if (watermarkedBase64) {
              const uploadPayload = {
                checkinId,
                username: profile.username,
                fullname: String(res.data?.fullname || profile.fullname),
                type: nextPunchType,
                location: KG_STANDARD_ADDRESS,
                distMeters: `${stampDist}m`,
                timeISO: res.data?.timeISO || timeISO,
                time: res.data?.thoiGian || exactTime,
                image: watermarkedBase64,
                sendEmailAfterUpload: true,
                instantEdge: true,
              };

              markImageUploadInFlight(checkinId);
              callApi('UPLOAD_CHECKIN_IMAGE', uploadPayload, {
                background: true,
                timeoutMs: 30000,
                maxAttempts: 2,
              })
                .then((imgRes) => {
                  const driveUrl = imgRes?.data?.url || imgRes?.data?.imageUrl;
                  if (imgRes?.ok && driveUrl) {
                    markPunchVaultImageUploaded(checkinId, driveUrl);
                    useAppStore.getState().updateLogImage(uploadPayload.time, driveUrl);
                    useAppStore.getState().updateLogImage(uploadPayload.timeISO, driveUrl);
                    setRecentPunches((prev) =>
                      prev.map((item) =>
                        item.id === checkinId ? { ...item, photoUploaded: true } : item
                      )
                    );
                    setTrayNotice((prev) =>
                      prev && prev.id === trayId && !isEdgeBuffered
                        ? { ...prev, syncState: 'PHOTO_UPLOADED' }
                        : prev
                    );
                  } else if (
                    imgRes?.ok &&
                    (imgRes.data?.edgeImageQueued || imgRes.data?.queuedForDrive)
                  ) {
                    markPunchVaultImageQueuedOnEdge(checkinId);
                    setRecentPunches((prev) =>
                      prev.map((item) =>
                        item.id === checkinId ? { ...item, photoUploaded: true } : item
                      )
                    );
                  } else {
                    enqueueTask('UPLOAD_CHECKIN_IMAGE', uploadPayload, {
                      priority: 'high',
                      maxAttempts: 12,
                    });
                  }
                })
                .catch(() => {
                  enqueueTask('UPLOAD_CHECKIN_IMAGE', uploadPayload, {
                    priority: 'high',
                    maxAttempts: 12,
                  });
                })
                .finally(() => {
                  clearImageUploadInFlight(checkinId);
                });
            }

            // Step 3: If user tapped 1-tap "Ra ca + Báo quên Vào ca", dispatch missed check-in sequentially (zero GAS Lock contention)
            if (resolutionOverride?.alsoSupplementIn) {
              const suppDate = smartIntent.suggestedSupplementDate || vnTime.dateStr;
              const suppTime = (smartIntent.suggestedSupplementTime || '15:00').slice(0, 5);
              const shiftStr = resolvedTodayShift || 'Không có ca';
              const suppReason = 'Quên bấm đầu ca (Bổ sung nhanh từ Trạm Face ID)';
              const canonicalFullname = String(res.data?.fullname || profile.fullname).trim();

              recordLocalMissedClaim({
                username: profile.username,
                fullname: canonicalFullname,
                date: suppDate,
                time: suppTime,
                type: 'Vào ca',
                shift: shiftStr,
                reason: suppReason,
              });

              const missedPayload = {
                username: profile.username,
                fullname: canonicalFullname,
                date: suppDate,
                time: suppTime,
                type: 'Vào ca',
                shift: shiftStr,
                reason: suppReason,
              };

              callApi('SUBMIT_MISSED_CHECKIN', missedPayload, {
                background: true,
                timeoutMs: 25000,
                maxAttempts: 2,
              })
                .then((mRes) => {
                  if (!mRes?.ok) {
                    enqueueTask('SUBMIT_MISSED_CHECKIN', missedPayload, {
                      priority: 'high',
                      maxAttempts: 12,
                    });
                  }
                })
                .catch(() => {
                  enqueueTask('SUBMIT_MISSED_CHECKIN', missedPayload, {
                    priority: 'high',
                    maxAttempts: 12,
                  });
                });
            }
          } else if (isServerCooldown) {
            // Another phone already recorded an earlier punch < 15m ago; sync local cooldown so we don't re-hit server!
            const srvRemSec = Number(
              res?.remainingSeconds ?? res?.data?.remainingSeconds ?? 15 * 60
            );
            const approxOriginalMs =
              Date.now() -
              Math.max(0, EMPLOYEE_COOLDOWN_MS - Math.min(EMPLOYEE_COOLDOWN_MS, srvRemSec * 1000));
            const srvLastType = String(
              res?.lastType || res?.data?.lastType || 'Đã ghi nhận'
            );
            const srvLastTime = String(
              res?.lastTime || res?.data?.lastTime || vnTime.clock
            );
            recordEmployeePunchCooldown(
              { username: profile.username, fullname: profile.fullname },
              srvLastType,
              srvLastTime,
              approxOriginalMs
            );
            justPunchedUntilRef.current.set(unameKey, Date.now() + 3500);

            setTrayNotice({
              id: `srv_cd_${Date.now()}`,
              kind: 'COOLDOWN',
              username: profile.username,
              fullname: profile.fullname,
              punchType: srvLastType,
              timeStr: srvLastTime,
              remainingText: formatRemainingMmSs(srvRemSec),
              subMessage:
                res?.message ||
                `Lượt chấm sớm nhất đã được ghi nhận — Không cần quét lại! (Giãn cách 15 phút • Còn ${formatRemainingMmSs(srvRemSec)})`,
              expiresAtMs: Date.now() + 5000,
            });
          } else if (isTransientLockTimeout) {
            // Genuine GAS lock contention -> persist to Offline Vault for guaranteed retry
            savePunchToVault(fullVaultPayload);
            enqueueTask('CHECK_IN_OUT', fullVaultPayload, { priority: 'high', maxAttempts: 20 });
            commitVerifiedPunchLocally(null, 'QUEUED_OFFLINE');
          } else {
            // Validation / business rejection: NEVER record cooldown, NEVER show false success, NEVER enqueue offline!
            justPunchedUntilRef.current.set(unameKey, Date.now() + 3200);
            playPosWarning();
            if (errCode === 'FACE_PROFILE_NOT_FOUND' || errCode === 'FACE_VERIFICATION_FAILED') {
              void syncProfilesAndAttendanceState(false);
            }
            setTrayNotice({
              id: `rej_${Date.now()}`,
              kind: errCode === 'MAX_4_PUNCHES' ? 'MAX_PUNCHES' : 'SPOOF_OR_ERROR',
              username: profile.username,
              fullname: profile.fullname,
              timeStr: vnTime.clock,
              subMessage:
                res?.message || 'Máy chủ chưa xác nhận được lượt chấm này. Vui lòng nhìn thẳng rõ nét để thử lại.',
              expiresAtMs: Date.now() + 4800,
            });
          }
          }
        } catch {
          // True network disconnection / fetch timeout -> Offline Vault guarantees zero lost punch
          savePunchToVault(fullVaultPayload);
          enqueueTask('CHECK_IN_OUT', fullVaultPayload, { priority: 'high', maxAttempts: 20 });
          commitVerifiedPunchLocally(null, 'QUEUED_OFFLINE');
        } finally {
          clearCheckinInFlight(checkinId);
        }
      } finally {
        inFlightUsersRef.current.delete(unameKey);
      }
    },
    [
      canBypassGps,
      captureSilentWatermarkedProof,
      isKioskMode,
      speakStation,
      syncProfilesAndAttendanceState,
      targetLat,
      targetLng,
    ]
  );

  const handleResolvePendingDisambiguation = useCallback(
    (forcedPunchType: CanonicalPunchType, alsoSupplementIn = false) => {
      const pending = pendingDisambiguationRef.current;
      if (!pending) return;
      setPendingDisambiguation(null);
      const chosenWatermark =
        forcedPunchType === 'Ra ca'
          ? pending.watermarkedRaCaBase64
          : pending.watermarkedVaoCaBase64;
      void executeAutoFacePunch(
        videoRef.current,
        pending.profile,
        pending.liveVectorB64,
        pending.matchScore,
        {
          forcedPunchType,
          alsoSupplementIn,
          todayShift: pending.todayShift,
          intent: pending.intent,
          preCaptured: {
            watermarkedBase64: chosenWatermark,
            scanDate: pending.scanDate,
            stampLat: pending.stampLat,
            stampLng: pending.stampLng,
            stampAcc: pending.stampAcc,
            stampDist: pending.stampDist,
          },
        }
      );
    },
    [executeAutoFacePunch]
  );

  const canBypassGpsRef = useRef(canBypassGps);
  canBypassGpsRef.current = canBypassGps;
  const targetRadiusRef = useRef(targetRadius);
  targetRadiusRef.current = targetRadius;
  const anySubModalOpenRef = useRef(anySubModalOpen);
  anySubModalOpenRef.current = anySubModalOpen;
  const syncProfilesRef = useRef(syncProfilesAndAttendanceState);
  syncProfilesRef.current = syncProfilesAndAttendanceState;

  // Continuous Real-Time Multi-Employee Scanning Loop (~10 FPS non-overlapping)
  const startContinuousScanLoop = useCallback(
    (activeGen: number) => {
      if (scanTimerRef.current !== null) {
        window.clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }

      const tick = async () => {
        if (!mountedRef.current || bootGenRef.current !== activeGen || anySubModalOpenRef.current) {
          return;
        }

        const activeNotice = trayNoticeRef.current;
        const isTurnSeparated =
          Boolean(pendingDisambiguationRef.current) ||
          activeNotice?.kind === 'SUBMITTING' ||
          (activeNotice?.kind === 'SUCCESS' && activeNotice.expiresAtMs > Date.now()) ||
          Date.now() < turnTransitionUntilRef.current;

        if (isTurnSeparated) {
          voterRef.current.reset();
          setVoterStreak(0);
          scanTimerRef.current = window.setTimeout(tick, 140);
          return;
        }

        const video = videoRef.current;
        if (!video || video.ended) {
          scanTimerRef.current = window.setTimeout(tick, 130);
          return;
        }
        if (video.paused && streamRef.current) {
          video.play().catch(() => {});
        }
        if (video.readyState < 2 || video.videoWidth < 64) {
          scanTimerRef.current = window.setTimeout(tick, 120);
          return;
        }

        const gpsOk = canBypassGpsRef.current || localGpsRef.current.isValid;

        if (hydratedProfilesRef.current.length === 0) {
          voterRef.current.reset();
          setVoterStreak(0);
          setHasFaceInView(false);
          setLiveGuidance(
            loadingProfilesRef.current
              ? 'Đang kết nối dữ liệu khuôn mặt từ máy chủ...'
              : 'Chưa có hồ sơ khuôn mặt — nhấn ĐK khuôn mặt bên dưới để tạo mới'
          );
          if (Date.now() - lastAutoProfileSyncMsRef.current > 4500) {
            void syncProfilesRef.current(false);
          }
          scanTimerRef.current = window.setTimeout(tick, 320);
          return;
        }

        if (isAnalyzingRef.current) {
          scanTimerRef.current = window.setTimeout(tick, 90);
          return;
        }

        isAnalyzingRef.current = true;
        try {
          const frame = await analyzeVideoFrameBiometrics(video, { poseMode: 'FRONTAL' });
          if (!mountedRef.current || bootGenRef.current !== activeGen) return;

          setHasFaceInView(frame.hasFace);

          const readiness = evaluateAutoPunchFrameReadiness(frame);

          if (!frame.hasFace) {
            voterRef.current.reset();
            setVoterStreak(0);
            setLiveGuidance(
              gpsOk
                ? frame.guidanceMessage
                : `Đưa khuôn mặt vào khung (Chờ khóa GPS ≤${targetRadiusRef.current}m để ghi công)`
            );
          } else if (!readiness.ready) {
            voterRef.current.reset();
            setVoterStreak(0);
            setLiveGuidance(readiness.guidanceMessage);
          } else if (!frame.embedding || !frame.embeddingInt8B64) {
            voterRef.current.reset();
            setVoterStreak(0);
            setLiveGuidance(frame.guidanceMessage);
          } else {
            const candidates: FaceCandidateVector[] = [
              { embedding: frame.embedding, int8B64: frame.embeddingInt8B64 },
            ];

            if (frame.chwRgb) {
              const flippedCand = await computeFlippedArcFaceCandidate(frame.chwRgb);
              const canonicalEmb = fuseCanonicalMirrorEmbedding(
                frame.embedding,
                flippedCand.embedding
              );
              candidates.push(
                { embedding: flippedCand.embedding, int8B64: flippedCand.int8B64 },
                { embedding: canonicalEmb, int8B64: quantizeVectorsToInt8B64([canonicalEmb]) }
              );
            }

            const appendChwCandidates = async (chw: Float32Array) => {
              const rawEmb = await runArcFaceFromChwTensor(chw);
              const flipCand = await computeFlippedArcFaceCandidate(chw);
              const canonicalEmb = fuseCanonicalMirrorEmbedding(rawEmb, flipCand.embedding);
              candidates.push(
                { embedding: rawEmb, int8B64: quantizeVectorsToInt8B64([rawEmb]) },
                { embedding: flipCand.embedding, int8B64: flipCand.int8B64 },
                { embedding: canonicalEmb, int8B64: quantizeVectorsToInt8B64([canonicalEmb]) }
              );
            };

            let match = matchEmployeeFaceWithCandidates(
              candidates,
              hydratedProfilesRef.current,
              FACE_AUTO_PUNCH_MIN_SCORE,
              FACE_AUTO_PUNCH_MIN_MARGIN
            );

            // Multi-scale 0.92x perspective fallback for cross-device lens FOV differences (ultra-wide phone vs normal/webcam)
            if ((!match.matched || match.score < 0.48) && frame.wideChwRgb) {
              await appendChwCandidates(frame.wideChwRgb);
              match = matchEmployeeFaceWithCandidates(
                candidates,
                hydratedProfilesRef.current,
                FACE_AUTO_PUNCH_MIN_SCORE,
                FACE_AUTO_PUNCH_MIN_MARGIN
              );
            }

            // Adaptive gamma fallback for extreme dim (<88) or backlit (>180) cross-device lighting without mutating linear primary
            if ((!match.matched || match.score < 0.48) && frame.gammaChwRgb) {
              await appendChwCandidates(frame.gammaChwRgb);
              match = matchEmployeeFaceWithCandidates(
                candidates,
                hydratedProfilesRef.current,
                FACE_AUTO_PUNCH_MIN_SCORE,
                FACE_AUTO_PUNCH_MIN_MARGIN
              );
            }

            // Legacy dual-keypoint 100% iris crop fallback for profiles enrolled before 70/30 socket stabilization
            const hasLegacyProfiles = hydratedProfilesRef.current.some(
              (p) => p.modelVersion !== FACE_MODEL_VERSION_CANON
            );
            if (hasLegacyProfiles && (!match.matched || match.score < 0.50) && frame.irisChwRgb) {
              await appendChwCandidates(frame.irisChwRgb);
              match = matchEmployeeFaceWithCandidates(
                candidates,
                hydratedProfilesRef.current,
                FACE_AUTO_PUNCH_MIN_SCORE,
                FACE_AUTO_PUNCH_MIN_MARGIN
              );
            }

            // Authorized test accounts (testapp / admin) can verify Kiosk recognition anywhere; all staff strictly require <= 25m GPS!
            const isMatchedTestAccount =
              match.matched && match.profile !== null && isAuthorizedTestUser(match.profile);
            const effectiveGpsOk = gpsOk || isMatchedTestAccount;

            // Preview recognized employee even while indoor GPS is still locking (never punches for staff until gpsOk === true!)
            if (!effectiveGpsOk) {
              voterRef.current.reset();
              setVoterStreak(match.matched && match.profile ? 1 : 0);
              if (match.matched && match.profile) {
                setLiveGuidance(
                  `Nhận diện: ${match.profile.fullname} • Chờ GPS ≤${targetRadiusRef.current}m để ghi công`
                );
              } else {
                setLiveGuidance(
                  `Đang khóa vị trí GPS ≤${targetRadiusRef.current}m tại nhà hàng...`
                );
              }
            } else {
              // Mandatory 3-frame consecutive frontal consensus (never auto-fires on a 1-frame transient pass!)
              const confirmed = voterRef.current.pushFrame(match);
              const nextStreak = confirmed ? FACE_AUTO_PUNCH_REQUIRED_STREAK : voterRef.current.getStreak();
              setVoterStreak(nextStreak);

              if (confirmed?.profile) {
                setLiveGuidance(`Đã nhận diện: ${confirmed.profile.fullname}`);
                await executeAutoFacePunch(
                  video,
                  confirmed.profile,
                  match.matchedEmbeddingInt8B64 || frame.embeddingInt8B64,
                  confirmed.score
                );
              } else if (match.matched && match.profile) {
                setLiveGuidance(
                  `Giữ thẳng mặt: ${match.profile.fullname} (${nextStreak}/${FACE_AUTO_PUNCH_REQUIRED_STREAK})`
                );
              } else if (match.reason === 'AMBIGUOUS_MARGIN') {
                setLiveGuidance('Đang phân tách nét mặt — vui lòng nhìn thẳng rõ hơn');
              } else {
                // Auto-sync Edge D1 profiles if another phone just enrolled this employee seconds ago!
                if (Date.now() - lastAutoProfileSyncMsRef.current > 6000) {
                  void syncProfilesRef.current(false);
                }
                if (match.score >= 0.24) {
                  setLiveGuidance(
                    `Đang lấy nét (${Math.round(match.score * 100)}%) — giữ thẳng mặt nơi đủ sáng`
                  );
                } else {
                  setLiveGuidance(
                    'Chưa khớp Face ID — nhìn thẳng rõ sáng hoặc đăng ký 5 góc'
                  );
                }
              }
            }
          }
        } catch {
          // Ignore transient video frame decode errors
        } finally {
          isAnalyzingRef.current = false;
        }

        if (mountedRef.current && bootGenRef.current === activeGen && !anySubModalOpenRef.current) {
          scanTimerRef.current = window.setTimeout(tick, 90);
        }
      };

      scanTimerRef.current = window.setTimeout(tick, 85);
    },
    [executeAutoFacePunch]
  );

  const bootScannerHardware = useCallback(async () => {
    stopCameraAndGps();
    const myGen = bootGenRef.current;
    setCameraError('');
    startStationGpsWatch();

    try {
      await initFaceBiometricEngine((stage, pct) => {
        if (!mountedRef.current || bootGenRef.current !== myGen) return;
        setBootText(stage);
        setBootPct(pct);
      });
      if (!mountedRef.current || bootGenRef.current !== myGen) return;
      setEngineReady(true);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Trình duyệt không hỗ trợ Camera trực tiếp. Hãy mở bằng Safari (iOS) hoặc Chrome (Android).'
        );
        return;
      }

      const activeFacing = cameraFacingRef.current;
      const constraintsList: MediaStreamConstraints[] =
        activeFacing === 'environment'
          ? [
              {
                video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
              },
              {
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
              },
              { video: { facingMode: 'environment' }, audio: false },
              { video: true, audio: false },
            ]
          : [
              {
                video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
              },
              { video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 } }, audio: false },
              { video: true, audio: false },
            ];

      let stream: MediaStream | null = null;
      for (let attempt = 0; attempt < 2 && !stream; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => window.setTimeout(r, 220));
          if (!mountedRef.current || bootGenRef.current !== myGen) return;
        }
        for (const c of constraintsList) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(c);
            break;
          } catch (err: any) {
            if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
              setCameraError(
                'Chưa cấp quyền Camera. Vui lòng cho phép trình duyệt dùng máy ảnh để quét khuôn mặt.'
              );
              return;
            }
          }
        }
      }

      if (!stream || !mountedRef.current || bootGenRef.current !== myGen) {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        if (mountedRef.current && bootGenRef.current === myGen) {
          setCameraError('Không tìm thấy camera khả dụng trên thiết bị.');
        }
        return;
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.srcObject = stream;
        await video.play().catch(() => {});
      }

      if (!mountedRef.current || bootGenRef.current !== myGen) return;
      setCameraReady(true);
      startContinuousScanLoop(myGen);
    } catch (err: any) {
      if (!mountedRef.current || bootGenRef.current !== myGen) return;
      setCameraError(err?.message || 'Lỗi khởi tạo bộ quét khuôn mặt.');
    }
  }, [startContinuousScanLoop, startStationGpsWatch, stopCameraAndGps]);

  const bootScannerRef = useRef(bootScannerHardware);
  bootScannerRef.current = bootScannerHardware;

  const handleToggleCameraFacing = useCallback(() => {
    const nextFacing: 'user' | 'environment' =
      cameraFacingRef.current === 'user' ? 'environment' : 'user';
    cameraFacingRef.current = nextFacing;
    setCameraFacing(nextFacing);
    voterRef.current.reset();
    setVoterStreak(0);
    void bootScannerRef.current();
  }, []);

  // Strictly depend ONLY on [anySubModalOpen, isOpen, stopCameraAndGps] so store hydration NEVER reboots camera!
  useEffect(() => {
    mountedRef.current = isOpen;
    if (isOpen && !anySubModalOpen) {
      void bootScannerRef.current();
    } else {
      stopCameraAndGps();
    }
    return () => {
      mountedRef.current = false;
      stopCameraAndGps();
    };
  }, [anySubModalOpen, isOpen, stopCameraAndGps]);

  // Auto-resume Kiosk camera/GPS after tablet screen wake
  useEffect(() => {
    if (!isOpen || anySubModalOpen) return;
    const handleWake = () => {
      if (document.visibilityState !== 'visible') return;
      const hasLiveTrack = streamRef.current
        ?.getVideoTracks()
        .some((t) => t.readyState === 'live');
      if (!hasLiveTrack) {
        void bootScannerRef.current();
      } else if (videoRef.current) {
        videoRef.current.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('pageshow', handleWake);
    return () => {
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('pageshow', handleWake);
    };
  }, [anySubModalOpen, isOpen]);

  const handleCloseEnrollModal = useCallback(() => {
    setEnrollModalOpen(false);
    setAdminSelectedStaff(null);
    void syncProfilesAndAttendanceState(false);
  }, [syncProfilesAndAttendanceState]);

  const handleEnrollSuccess = useCallback((newDto: RawFaceProfileDto) => {
    upsertCachedFaceProfile(newDto);
    setRawProfiles(getCachedFaceProfiles());
    setHydratedProfiles(getCachedHydratedFaceProfiles());
    setProfilesLoadedOnce(true);
  }, []);

  if (!isOpen || typeof document === 'undefined') return null;

  const enrollTargetUser = adminSelectedStaff || currentUser;
  const isEnrollingOnBehalfOfStaff = Boolean(adminSelectedStaff && isAdminAccount);

  const reticleBorderColor = trayNotice?.kind === 'SUCCESS'
    ? 'border-[#34D399]'
    : trayNotice?.kind === 'COOLDOWN'
    ? 'border-[#FBBF24]'
    : !isGpsReady
    ? hasFaceInView
      ? 'border-[#FBBF24]'
      : 'border-[#DC2626]'
    : hasFaceInView
    ? 'border-[#34D399]'
    : 'border-[#C8432B]';

  const showSelfEnrollPrompt =
    !isKioskMode && Boolean(currentUser) && profilesLoadedOnce && !isCurrentUserEnrolled;

  return createPortal(
    <>
      <div
        role="dialog"
        aria-modal="true"
        data-testid="fast-face-scanner-v2"
        aria-label="Trạm quét khuôn mặt tự động King's Grill"
        className="fixed inset-0 m-0 z-[10070] h-[100dvh] w-screen bg-[#0D1015] text-[#F7F4EE] flex flex-col overflow-hidden select-none font-sans"
      >
        {/* SINGLE COMPACT TOP HEADER (56px, zero glassmorphism, high-contrast legibility) */}
        <header className="relative z-30 w-full bg-[#0D1015] border-b border-[#242B38] px-3 sm:px-5 py-2 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#0B253C] border border-[#242B38] flex items-center justify-center text-[#34D399] shrink-0">
              <ScanFace size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-extrabold tracking-tight text-[#F7F4EE] truncate">
                  {isKioskMode ? 'Trạm Face ID' : 'Face ID Siêu Tốc'}
                </span>
                <span
                  role="status"
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono tabular-nums font-bold shrink-0 ${
                    hydratedProfiles.length > 0
                      ? 'bg-[#0F291E] border-[#34D399]/60 text-[#34D399]'
                      : loadingProfiles
                      ? 'bg-[#0B253C] border-[#60A5FA]/60 text-[#93C5FD]'
                      : 'bg-[#291F0F] border-[#FBBF24]/60 text-[#FBBF24]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      hydratedProfiles.length > 0
                        ? 'bg-[#34D399]'
                        : loadingProfiles
                        ? 'bg-[#60A5FA]'
                        : 'bg-[#FBBF24]'
                    }`}
                  />
                  <span>
                    {hydratedProfiles.length > 0
                      ? `${hydratedProfiles.length} hồ sơ`
                      : loadingProfiles
                      ? 'Đang kết nối...'
                      : '0 hồ sơ'}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs sm:text-sm font-mono tabular-nums font-extrabold text-[#F7F4EE]">
                  {clockState.clock}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-[#9CA3AF]">
                  • {clockState.dateStr}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setMutedAudio((m) => !m)}
              title={mutedAudio ? 'Bật âm thanh đọc tên' : 'Tắt âm thanh'}
              aria-label={mutedAudio ? 'Bật âm thanh' : 'Tắt âm thanh'}
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-[#161A22] hover:bg-[#1F2530] border border-[#2B3240] text-[#F7F4EE] inline-flex items-center justify-center transition-colors motion-reduce:transition-none"
            >
              {mutedAudio ? (
                <VolumeX size={16} className="text-[#F87171]" />
              ) : (
                <Volume2 size={16} className="text-[#34D399]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void syncProfilesAndAttendanceState(true)}
              disabled={loadingProfiles}
              title="Đồng bộ danh sách khuôn mặt mới nhất"
              aria-label="Đồng bộ hồ sơ khuôn mặt"
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-[#161A22] hover:bg-[#1F2530] border border-[#2B3240] text-[#F7F4EE] inline-flex items-center justify-center disabled:opacity-50 transition-colors motion-reduce:transition-none"
            >
              <RefreshCw
                size={16}
                className={loadingProfiles ? 'animate-spin motion-reduce:animate-none' : ''}
              />
            </button>

            <button
              type="button"
              onClick={() => {
                stopCameraAndGps();
                onClose();
              }}
              aria-label="Đóng màn hình quét khuôn mặt"
              className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-[#C8432B] hover:bg-[#B83821] text-white inline-flex items-center justify-center transition-colors motion-reduce:transition-none"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {/* MAIN BODY: Mobile Full-Screen Viewport | Desktop/Tablet Command View (lg:grid-cols-[1fr_360px]) */}
        <div className="relative flex-1 min-h-0 w-full flex flex-col lg:grid lg:grid-cols-[1fr_360px] overflow-hidden bg-[#0D1015]">
        {/* LIVE CAMERA VIEWPORT (Left col on lg:, Fullscreen on mobile) */}
        <div className="relative flex-1 min-h-0 w-full bg-[#0D1015] overflow-hidden flex flex-col justify-between">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`absolute inset-0 w-full h-full object-cover ${
              cameraFacing === 'user' ? 'mirror-cam' : ''
            } ${cameraReady && !cameraError ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* FLOATING COMPACT GPS & OVERNIGHT TELEMETRY CAPSULE */}
          <div className="relative z-20 pt-2.5 px-3 flex items-center justify-center gap-2 flex-wrap pointer-events-none">
            <button
              type="button"
              onClick={startStationGpsWatch}
              title="Chạm để làm mới định vị GPS"
              className={`pointer-events-auto min-h-[44px] sm:min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold border shadow-md transition-colors cursor-pointer touch-manipulation ${
                isGpsReady
                  ? 'bg-[#0D1015] border-[#34D399]/80 text-[#34D399]'
                  : 'bg-[#0D1015] border-[#F87171]/80 text-[#FCA5A5]'
              }`}
            >
              <MapPin size={12} className="shrink-0" />
              <span className="font-mono tabular-nums truncate max-w-[250px] sm:max-w-none">
                {localGps.statusText}
              </span>
            </button>

            {clockState.isBefore06 && (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#0B253C] border border-[#60A5FA] text-[11px] font-bold text-[#93C5FD]">
                Ca đêm &lt;06:00
              </span>
            )}
          </div>

          {/* Booting / Camera Permission Loading Overlay */}
          {(!engineReady || !cameraReady) && !cameraError && (
            <div className="relative z-20 my-auto mx-auto max-w-sm w-[90%] bg-[#161A22] border border-[#2B3240] rounded-2xl p-5 text-center space-y-3.5 shadow-xl">
              <div className="w-11 h-11 rounded-2xl bg-[#0B253C] border border-[#2B3240] flex items-center justify-center mx-auto text-[#34D399]">
                <Loader2 size={22} className="animate-spin motion-reduce:animate-none" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-[#F7F4EE]">
                  {engineReady ? 'Đang kết nối ống kính Camera' : 'Đang nạp bộ nhận diện khuôn mặt'}
                </h3>
                <p className="text-xs text-[#B5AFA6] leading-relaxed">
                  {engineReady
                    ? 'Nhấn "Cho phép" quyền máy ảnh & vị trí trên trình duyệt để bắt đầu.'
                    : bootText}
                </p>
              </div>
              <div className="space-y-1">
                <div className="w-full bg-[#0D1015] border border-[#2B3240] rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#C8432B] h-full transition-all duration-150"
                    style={{ width: `${engineReady ? 94 : Math.max(15, bootPct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#9CA3AF]">
                  <span>{hydratedProfiles.length > 0 ? `Đã đồng bộ ${hydratedProfiles.length} hồ sơ` : 'Đang kết nối D1...'}</span>
                  <span>{engineReady ? '94%' : `${Math.max(15, bootPct)}%`}</span>
                </div>
              </div>
            </div>
          )}

          {/* Camera Error State */}
          {cameraError && (
            <div className="relative z-20 my-auto mx-auto max-w-sm w-[90%] bg-[#161A22] border border-[#DC2626] rounded-2xl p-5 text-center space-y-3.5 shadow-xl">
              <div className="w-11 h-11 rounded-2xl bg-[#2A1416] border border-[#DC2626] flex items-center justify-center mx-auto text-[#F87171]">
                <CameraOff size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-[#F7F4EE]">Chưa mở được máy ảnh</h3>
                <p className="text-xs text-[#B5AFA6] leading-relaxed">{cameraError}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={bootScannerHardware}
                  className="flex-1 min-h-[46px] py-2.5 px-4 rounded-xl bg-[#C8432B] hover:bg-[#B83821] text-white font-extrabold text-xs inline-flex items-center justify-center gap-1.5"
                >
                  <RefreshCw size={14} />
                  <span>Thử mở lại Camera</span>
                </button>
                {onSwitchToV1 && (
                  <button
                    type="button"
                    onClick={() => {
                      stopCameraAndGps();
                      onSwitchToV1();
                    }}
                    className="flex-1 min-h-[46px] py-2.5 px-4 rounded-xl bg-[#0D1015] border border-[#2B3240] text-[#F7F4EE] font-bold text-xs"
                  >
                    Dùng bản Chụp (v1)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* CLEAN UNOBSTRUCTED CENTER RETICLE OR VERIFIED PUNCH CARD */}
          {engineReady && cameraReady && !cameraError && (
            <div className="relative z-20 flex-1 min-h-0 flex flex-col items-center justify-center px-4 py-2 pointer-events-none">
              {trayNotice?.kind === 'SUCCESS' ? (
                <div
                  data-testid="v2-punch-confirmed-card"
                  role="status"
                  aria-live="assertive"
                  className="pointer-events-auto w-full max-w-sm max-h-[70dvh] overflow-y-auto bg-[#0D1015] border-2 border-[#34D399] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3 text-center"
                >
                  <div className="flex items-center justify-center gap-2.5">
                    <div className="w-11 h-11 rounded-2xl bg-[#15803D] border border-[#34D399] text-white flex items-center justify-center shrink-0">
                      <CheckCircle2 size={24} />
                    </div>
                    <div className="text-left min-w-0">
                      <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider text-[#34D399]">
                        ĐÃ GHI NHẬN LƯỢT SỚM NHẤT
                      </span>
                      <h3 className="text-base sm:text-lg font-extrabold text-[#F7F4EE] leading-tight truncate">
                        {trayNotice.fullname}
                      </h3>
                      <p className="text-[11px] font-mono text-[#9CA3AF]">@{trayNotice.username}</p>
                    </div>
                  </div>

                  <div className="bg-[#161A22] border border-[#2B3240] rounded-xl p-3 flex items-center justify-between gap-2 text-left">
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-[#9CA3AF]">
                        Lượt chấm
                      </span>
                      <span
                        className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-lg text-white text-sm font-extrabold ${
                          isCheckInLabel(trayNotice.punchType) ? 'bg-[#15803D]' : 'bg-[#2563EB]'
                        }`}
                      >
                        {trayNotice.punchType}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] font-bold uppercase text-[#9CA3AF]">
                        Giờ ghi Sheet
                      </span>
                      <span className="block mt-0.5 text-sm font-mono tabular-nums font-extrabold text-[#F7F4EE]">
                        {trayNotice.timeStr}
                      </span>
                      {trayNotice.syncState && (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                            trayNotice.syncState === 'EDGE_BUFFERED'
                              ? 'text-[#60A5FA]'
                              : trayNotice.syncState === 'QUEUED_OFFLINE'
                              ? 'text-[#FBBF24]'
                              : 'text-[#34D399]'
                          }`}
                        >
                          <CloudUpload size={11} />
                          {trayNotice.syncState === 'PHOTO_UPLOADED'
                            ? 'Đã lưu Sheet & Ảnh'
                            : trayNotice.syncState === 'EDGE_BUFFERED'
                            ? 'Đã bảo lãnh D1 • Ghi Sheet...'
                            : trayNotice.syncState === 'QUEUED_OFFLINE'
                            ? 'Đã lưu Offline Vault'
                            : 'Đã ghi Sheet • Tải ảnh...'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="bg-[#0B253C] border border-[#60A5FA]/40 rounded-xl px-3 py-2 text-left flex items-start gap-2">
                    <ShieldCheck size={15} className="text-[#34D399] shrink-0 mt-0.5" />
                    <p className="text-[11px] font-bold text-[#F7F4EE] leading-snug">
                      <span className="text-[#34D399]">Bạn không cần quét lại!</span> Hệ thống tự khóa chấm lặp trong{' '}
                      <span className="text-[#FBBF24]">15 phút</span>.
                    </p>
                  </div>

                  {trayNotice.scheduleWarningText && (
                    <div className="rounded-xl bg-[#291F0F] border border-[#FBBF24]/50 px-3 py-2 flex items-center gap-2 text-[11px] font-bold text-[#FBBF24] text-left">
                      <Sparkles size={13} className="shrink-0" />
                      <span>{trayNotice.scheduleWarningText}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      turnTransitionUntilRef.current = Date.now() + 600;
                      voterRef.current.reset();
                      setVoterStreak(0);
                      setTrayNotice(null);
                    }}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#161A22] hover:bg-[#1F2530] border border-[#2B3240] text-xs font-extrabold text-[#F7F4EE] transition-colors"
                  >
                    Đã rõ • Quét người tiếp theo
                  </button>
                </div>
              ) : trayNotice?.kind === 'SUBMITTING' ? (
                <div className="pointer-events-auto w-full max-w-sm bg-[#0D1015] border-2 border-[#60A5FA] rounded-2xl p-5 text-center space-y-3 shadow-2xl">
                  <div className="w-11 h-11 rounded-2xl bg-[#0B253C] border border-[#60A5FA] text-[#60A5FA] flex items-center justify-center mx-auto">
                    <Loader2 size={22} className="animate-spin motion-reduce:animate-none" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm sm:text-base font-extrabold text-[#F7F4EE]">
                      Đang ghi {trayNotice.punchType} • {trayNotice.fullname}
                    </h3>
                    <p className="text-xs text-[#B5AFA6]">
                      Đồng bộ trực tiếp vào Google Sheet ✔️CHẤM CÔNG...
                    </p>
                  </div>
                </div>
              ) : pendingDisambiguation ? (
                <div
                  data-testid="v2-smart-disambiguation-card"
                  role="alertdialog"
                  aria-labelledby="v2-disambiguation-title"
                  className="pointer-events-auto w-full max-w-sm max-h-[70dvh] overflow-y-auto bg-[#0D1015] border-2 border-[#FBBF24] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-3 text-left"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#291F0F] border border-[#FBBF24] text-[#FBBF24] flex items-center justify-center shrink-0">
                      <AlertTriangle size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider text-[#FBBF24]">
                        CẦN XÁC NHẬN LOẠI CHẤM CÔNG
                      </span>
                      <h3
                        id="v2-disambiguation-title"
                        className="text-sm sm:text-base font-extrabold text-[#F7F4EE] leading-snug"
                      >
                        {pendingDisambiguation.profile.fullname}
                      </h3>
                      <p className="text-[11px] font-semibold text-[#FDE68A] mt-0.5 leading-snug">
                        {pendingDisambiguation.intent.guidanceTitle}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-[#D1D5DB] leading-relaxed bg-[#161A22] border border-[#2B3240] rounded-xl p-2.5">
                    {pendingDisambiguation.intent.guidanceDetail}
                  </p>

                  {pendingDisambiguation.intent.ambiguityReason === 'LATE_SHIFT_MISSING_IN' ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        data-testid="v2-combo-out-and-supplement-btn"
                        onClick={() => handleResolvePendingDisambiguation('Ra ca', true)}
                        className="w-full min-h-[48px] py-2.5 px-3.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
                      >
                        <LogOut size={16} className="shrink-0" />
                        <span>Chấm RA CA ngay + Báo quên Vào ca</span>
                      </button>
                      <button
                        type="button"
                        data-testid="v2-confirm-late-in-btn"
                        onClick={() => handleResolvePendingDisambiguation('Vào ca', false)}
                        className="w-full min-h-[48px] py-2.5 px-3.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
                      >
                        <LogIn size={16} className="shrink-0" />
                        <span>Tôi mới bắt đầu VÀO CA lúc này</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        data-testid="v2-confirm-out-btn"
                        onClick={() => handleResolvePendingDisambiguation('Ra ca', false)}
                        className="w-full min-h-[48px] py-2.5 px-3.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
                      >
                        <LogOut size={16} className="shrink-0" />
                        <span>Tôi đang RA CA (Kết thúc ca trước)</span>
                      </button>
                      <button
                        type="button"
                        data-testid="v2-confirm-in-btn"
                        onClick={() => handleResolvePendingDisambiguation('Vào ca', false)}
                        className="w-full min-h-[48px] py-2.5 px-3.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
                      >
                        <LogIn size={16} className="shrink-0" />
                        <span>Tôi đang VÀO CA mới</span>
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setPendingDisambiguation(null)}
                    className="w-full min-h-[44px] py-2 px-3 rounded-xl bg-[#161A22] hover:bg-[#1F2530] border border-[#2B3240] text-xs font-bold text-[#9CA3AF] transition-colors"
                  >
                    Hủy / Quét lại khuôn mặt
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className={`relative w-[min(220px,56vw)] h-[min(268px,36dvh)] sm:w-[256px] sm:h-[312px] rounded-[44px] sm:rounded-[48px] border-[3px] transition-colors duration-150 motion-reduce:transition-none ${reticleBorderColor}`}
                  >
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#0D1015] border border-[#2B3240] rounded-full px-3 py-0.5 flex items-center gap-1.5 whitespace-nowrap">
                      {[1, 2, 3].map((step) => (
                        <span
                          key={step}
                          className={`w-2 h-2 rounded-full ${
                            voterStreak >= step ? 'bg-[#34D399]' : 'bg-[#2B3240]'
                          }`}
                        />
                      ))}
                      <span className="text-[10px] font-mono tabular-nums font-bold text-[#F7F4EE] ml-0.5">
                        {!isGpsReady
                          ? hasFaceInView
                            ? 'CHỜ GPS ≤25M'
                            : 'ĐỊNH VỊ GPS'
                          : hasFaceInView
                          ? 'ĐANG KHÓA NÉT'
                          : 'TỰ ĐỘNG QUÉT'}
                      </span>
                    </div>
                  </div>

                  {/* Single Clean Solid Guidance Capsule */}
                  <div className="mt-3.5 bg-[#0D1015] border border-[#2B3240] rounded-xl px-3.5 py-2 max-w-[340px] sm:max-w-md text-center shadow-lg">
                    <p className="text-xs sm:text-sm font-bold text-[#F7F4EE] leading-snug">
                      {liveGuidance}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ERGONOMIC ONE-HANDED BOTTOM THUMB DOCK (Mobile & Tablet < lg) */}
          <footer className="relative z-30 w-full bg-[#0D1015] border-t border-[#242B38] px-3 sm:px-5 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0 lg:hidden">
            <div className="max-w-xl mx-auto space-y-2">
              {/* Contextual Status Banner (Cooldown / Max Punches / Error) OR Recent Chips */}
              {trayNotice &&
              trayNotice.kind !== 'SUCCESS' &&
              trayNotice.kind !== 'SUBMITTING' ? (
                <div
                  className={`rounded-xl border px-3 py-2.5 bg-[#161A22] flex items-center justify-between gap-2.5 ${
                    trayNotice.kind === 'COOLDOWN' ? 'border-[#FBBF24]' : 'border-[#F87171]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0 ${
                        trayNotice.kind === 'COOLDOWN' ? 'bg-[#B45309]' : 'bg-[#DC2626]'
                      }`}
                    >
                      {trayNotice.kind === 'COOLDOWN' ? (
                        <Clock size={18} />
                      ) : (
                        <AlertTriangle size={18} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs sm:text-sm font-extrabold text-[#F7F4EE] truncate">
                          {trayNotice.fullname}
                        </span>
                        {trayNotice.punchType && (
                          <span className="px-1.5 py-0.5 rounded bg-[#0D1015] border border-[#2B3240] text-[10px] font-bold text-[#FBBF24]">
                            {trayNotice.punchType}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#D1CEC7] leading-snug mt-0.5">
                        {trayNotice.subMessage}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTrayNotice(null)}
                    className="min-h-[44px] sm:min-h-[36px] px-3 rounded-lg bg-[#0D1015] border border-[#2B3240] text-[11px] font-bold text-[#B5AFA6] shrink-0 touch-manipulation"
                  >
                    Đóng
                  </button>
                </div>
              ) : recentPunches.length > 0 ? (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] shrink-0 mr-1">
                    Vừa chấm:
                  </span>
                  {recentPunches.slice(0, 3).map((rp) => (
                    <span
                      key={rp.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#161A22] border border-[#2B3240] text-[11px] font-mono tabular-nums text-[#F7F4EE] shrink-0"
                    >
                      <CheckCircle2 size={11} className="text-[#34D399]" />
                      <span>
                        {rp.fullname.split(' ').slice(-2).join(' ')} • {formatUnifiedPunchLabel(rp.punchType)} ({rp.timeShort})
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#9CA3AF] text-center px-1">
                  <ShieldCheck size={13} className="text-[#34D399] shrink-0" />
                  <span className="truncate">
                    Tự động luân phiên Vào ca ⇄ Ra ca • Giãn cách 15 phút/NV
                  </span>
                </div>
              )}

              {/* One-Handed Thumb Action Row (>=44px touch targets) */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  data-testid="toggle-camera-facing-btn"
                  onClick={handleToggleCameraFacing}
                  title="Chuyển đổi Camera Trước / Camera Sau"
                  aria-label="Đổi camera trước hoặc sau"
                  className="flex-1 min-w-0 min-h-[46px] px-2 sm:px-3 py-2 rounded-xl bg-[#161A22] hover:bg-[#1F2530] border border-[#2B3240] text-[11px] sm:text-xs font-extrabold text-[#F7F4EE] inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-colors motion-reduce:transition-none touch-manipulation"
                >
                  <SwitchCamera size={15} className="text-[#34D399] shrink-0" />
                  <span className="truncate">{cameraFacing === 'user' ? 'Cam sau' : 'Cam trước'}</span>
                </button>

                {isAdminAccount && (
                  <button
                    type="button"
                    data-testid="v2-admin-enroll-staff-btn"
                    onClick={() => {
                      stopCameraAndGps();
                      setAdminPickerOpen(true);
                    }}
                    title="Chọn nhân viên để đăng ký khuôn mặt 5 góc"
                    className="flex-1 min-w-0 min-h-[46px] px-2 sm:px-3 py-2 rounded-xl bg-[#0B253C] hover:bg-[#163654] border border-[#34D399]/60 text-[11px] sm:text-xs font-extrabold text-[#34D399] inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-colors motion-reduce:transition-none touch-manipulation"
                  >
                    <Users size={15} className="shrink-0" />
                    <span className="sm:hidden truncate">ĐK NV</span>
                    <span className="hidden sm:inline truncate">ĐK khuôn mặt NV</span>
                  </button>
                )}

                {!isAdminAccount && showSelfEnrollPrompt && (
                  <button
                    type="button"
                    onClick={() => {
                      stopCameraAndGps();
                      setAdminSelectedStaff(null);
                      setEnrollModalOpen(true);
                    }}
                    className="flex-1 min-w-0 min-h-[46px] px-2 sm:px-3 py-2 rounded-xl bg-[#C8432B] hover:bg-[#B83821] text-white text-[11px] sm:text-xs font-extrabold inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-colors motion-reduce:transition-none touch-manipulation"
                  >
                    <UserPlus size={15} className="shrink-0" />
                    <span className="truncate">Đăng ký 5 góc</span>
                  </button>
                )}

                {onSwitchToV1 && (
                  <button
                    type="button"
                    onClick={() => {
                      stopCameraAndGps();
                      onSwitchToV1();
                    }}
                    className="flex-1 min-w-0 min-h-[46px] px-2 sm:px-3 py-2 rounded-xl bg-[#161A22] hover:bg-[#1F2530] border border-[#2B3240] text-[11px] sm:text-xs font-extrabold text-[#FBBF24] inline-flex items-center justify-center gap-1 sm:gap-1.5 transition-colors motion-reduce:transition-none touch-manipulation"
                  >
                    <Camera size={14} className="shrink-0" />
                    <span className="sm:hidden truncate">Bản v1</span>
                    <span className="hidden sm:inline truncate">Chụp ảnh (v1)</span>
                  </button>
                )}
              </div>
            </div>
          </footer>
        </div>

        {/* DESKTOP / TABLET COMMAND RAIL (lg:grid-cols-[1fr_360px] Right Column) */}
        <aside className="hidden lg:flex flex-col w-[360px] bg-[#0D1015] border-l border-[#242B38] p-4 gap-3.5 overflow-y-auto shrink-0">
          {/* Station Telemetry & GPS Status */}
          <div className="rounded-2xl bg-[#161A22] border border-[#2B3240] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#9CA3AF]">
                Trạng thái trạm Kiosk
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-bold border ${
                  isGpsReady
                    ? 'bg-[#0F291E] border-[#34D399]/60 text-[#34D399]'
                    : 'bg-[#2A1416] border-[#F87171]/60 text-[#FCA5A5]'
                }`}
              >
                <MapPin size={10} />
                {isGpsReady ? 'GPS Hợp lệ' : 'Chờ GPS'}
              </span>
            </div>
            <p className="text-xs font-mono tabular-nums font-bold text-[#F7F4EE]">
              {localGps.statusText}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={startStationGpsWatch}
                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#0D1015] hover:bg-[#1F2530] border border-[#2B3240] text-[11px] font-bold text-[#F7F4EE] inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <MapPin size={13} className="text-[#34D399]" />
                <span>Làm mới GPS</span>
              </button>
              <button
                type="button"
                onClick={() => void syncProfilesAndAttendanceState(true)}
                disabled={loadingProfiles}
                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[#0D1015] hover:bg-[#1F2530] border border-[#2B3240] text-[11px] font-bold text-[#F7F4EE] inline-flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={13} className={loadingProfiles ? 'animate-spin' : 'text-[#60A5FA]'} />
                <span>Đồng bộ ({hydratedProfiles.length})</span>
              </button>
            </div>
          </div>

          {/* Contextual Alert (Cooldown / Max Punches / Error) */}
          {trayNotice && trayNotice.kind !== 'SUCCESS' && trayNotice.kind !== 'SUBMITTING' && (
            <div
              className={`rounded-2xl border p-3 bg-[#161A22] space-y-2 ${
                trayNotice.kind === 'COOLDOWN' ? 'border-[#FBBF24]' : 'border-[#F87171]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 ${
                      trayNotice.kind === 'COOLDOWN' ? 'bg-[#B45309]' : 'bg-[#DC2626]'
                    }`}
                  >
                    {trayNotice.kind === 'COOLDOWN' ? <Clock size={16} /> : <AlertTriangle size={16} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-[#F7F4EE] truncate">{trayNotice.fullname}</p>
                    {trayNotice.punchType && (
                      <span className="text-[10px] font-bold text-[#FBBF24]">{trayNotice.punchType}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTrayNotice(null)}
                  className="px-2.5 py-1 rounded-lg bg-[#0D1015] border border-[#2B3240] text-[10px] font-bold text-[#B5AFA6] hover:text-[#F7F4EE]"
                >
                  Đóng
                </button>
              </div>
              <p className="text-[11px] text-[#D1CEC7] leading-snug">{trayNotice.subMessage}</p>
            </div>
          )}

          {/* Live Station Log Rail */}
          <div className="flex-1 min-h-[160px] rounded-2xl bg-[#161A22] border border-[#2B3240] p-3.5 flex flex-col gap-2.5 overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-[#242B38] pb-2">
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[#9CA3AF]">
                Nhật ký trạm trực tiếp
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#0D1015] border border-[#2B3240] text-[10px] font-mono tabular-nums font-bold text-[#34D399]">
                {recentPunches.length} lượt
              </span>
            </div>

            {recentPunches.length > 0 ? (
              <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                {recentPunches.map((rp) => (
                  <div
                    key={rp.id}
                    className="rounded-xl bg-[#0D1015] border border-[#2B3240] px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[#F7F4EE] truncate">{rp.fullname}</p>
                      <p className="text-[10.5px] font-mono tabular-nums text-[#9CA3AF] mt-0.5">
                        {formatUnifiedPunchLabel(rp.punchType)} • {rp.timeShort}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#0F291E] border border-[#34D399]/50 text-[10px] font-bold text-[#34D399] shrink-0">
                      <CheckCircle2 size={11} />
                      {rp.photoUploaded ? 'Đã lưu' : 'Ghi Sheet'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-3 py-6 text-[#9CA3AF] space-y-1.5">
                <ShieldCheck size={22} className="text-[#34D399]" />
                <p className="text-xs font-bold text-[#F7F4EE]">Sẵn sàng quét tự động</p>
                <p className="text-[11px] leading-snug">
                  Tự động luân phiên Vào ca ⇄ Ra ca • Giãn cách 15 phút/NV
                </p>
              </div>
            )}
          </div>

          {/* Desktop Quick Controls: Camera Facing, Admin Enroll, Self Enroll, Switch V1 */}
          <div className="space-y-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleCameraFacing}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#161A22] hover:bg-[#1F2530] border border-[#2B3240] text-xs font-extrabold text-[#F7F4EE] inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <SwitchCamera size={15} className="text-[#34D399] shrink-0" />
              <span>Chuyển sang {cameraFacing === 'user' ? 'Camera sau' : 'Camera trước'}</span>
            </button>

            {isAdminAccount && (
              <button
                type="button"
                onClick={() => {
                  stopCameraAndGps();
                  setAdminPickerOpen(true);
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#0B253C] hover:bg-[#163654] border border-[#34D399]/60 text-xs font-extrabold text-[#34D399] inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Users size={15} className="shrink-0" />
                <span>Đăng ký khuôn mặt nhân viên</span>
              </button>
            )}

            {!isAdminAccount && showSelfEnrollPrompt && (
              <button
                type="button"
                onClick={() => {
                  stopCameraAndGps();
                  setAdminSelectedStaff(null);
                  setEnrollModalOpen(true);
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#C8432B] hover:bg-[#B83821] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <UserPlus size={15} className="shrink-0" />
                <span>Đăng ký khuôn mặt 5 góc</span>
              </button>
            )}

            {onSwitchToV1 && (
              <button
                type="button"
                onClick={() => {
                  stopCameraAndGps();
                  onSwitchToV1();
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#161A22] hover:bg-[#1F2530] border border-[#2B3240] text-xs font-extrabold text-[#FBBF24] inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Camera size={14} className="shrink-0" />
                <span>Chuyển sang Chụp ảnh (v1)</span>
              </button>
            )}
          </div>
        </aside>
        </div>
      </div>

      {/* Admin Staff Picker Modal inside Scanner */}
      {isAdminAccount && adminPickerOpen && (
        <Suspense fallback={null}>
          <AdminStaffFacePickerModal
            isOpen={adminPickerOpen}
            adminUsername={currentUser?.username || 'ADMIN'}
            initialProfiles={rawProfiles}
            onClose={() => {
              setAdminPickerOpen(false);
              void syncProfilesAndAttendanceState(true);
            }}
            onSelectEmployee={(emp, latestProfiles) => {
              if (latestProfiles.length > 0) {
                setCachedFaceProfiles(latestProfiles);
              }
              setAdminSelectedStaff(emp);
              setAdminPickerOpen(false);
              setEnrollModalOpen(true);
            }}
          />
        </Suspense>
      )}

      {/* Inline 5-Angle Enrollment Modal (Self or Admin-Assisted Staff Enrollment) */}
      {!isKioskMode && enrollTargetUser && enrollModalOpen && (
        <Suspense fallback={null}>
          <FaceEnrollmentModal
            isOpen={enrollModalOpen}
            onClose={handleCloseEnrollModal}
            user={enrollTargetUser}
            existingProfiles={rawProfiles}
            enrolledByAdmin={isEnrollingOnBehalfOfStaff}
            adminActorUsername={currentUser?.username}
            onEnrolledSuccess={handleEnrollSuccess}
            onStartScanningNow={handleCloseEnrollModal}
            onPickAnotherStaff={
              isAdminAccount
                ? () => {
                    setEnrollModalOpen(false);
                    setAdminSelectedStaff(null);
                    setAdminPickerOpen(true);
                  }
                : undefined
            }
          />
        </Suspense>
      )}
    </>,
    document.body
  );
}
