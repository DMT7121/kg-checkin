import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import KalmanFilter from '../utils/kalman';
import {
  getDist,
  speak,
  getCurrentTimeString,
  computeWeekInfo,
  KG_LAT,
  KG_LNG,
  KG_RADIUS_METERS,
  getRecommendedCheckInType,
  setLocalLastPunch,
  auditMissingCheckIns,
  MissingCheckInAlert,
  CheckInTypeString,
  getCheckInCooldown,
  auditCheckInAnomalies,
  encodeOptimalCanvas,
  getPreviewShiftClass
} from '../utils/helpers';
import {
  MapPin,
  RefreshCw,
  CameraOff,
  Camera,
  RotateCcw,
  LogIn,
  LogOut,
  UserCheck,
  AlertTriangle,
  Clock,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Info,
  Moon,
  Send,
  ChevronRight,
  HelpCircle,
  Check,
  PartyPopper,
  Users,
  Crosshair,
  Radio,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  KgButton,
  KgBottomSheet,
  KgConfirmSheet,
  KgTextarea,
  KgModuleHero,
  KgFeatureTip
} from '../components/KgDesignSystem';
import { isWorkEligible } from '../utils/employment';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import { enqueueTask } from '../utils/offlineQueue';
import MissedCheckInModal from '../components/MissedCheckInModal';
import EmployeeAttendanceMonitor from '../components/EmployeeAttendanceMonitor';
import {
  isAuthorizedTestUser,
  detectGpsSpoofing,
  generateLocationSecurityToken,
  recordGpsSample
} from '../utils/antiFraud';

export default function CheckIn() {
  const store = useAppStore();
  const { currentUser, gps, capturedImage, currentTime, approvedShifts } = store;

  // Anti-Fraud & Radius validation
  const latestGpsConfig = store.serverGpsConfig;
  const targetLat = latestGpsConfig?.lat ?? KG_LAT;
  const targetLng = latestGpsConfig?.lng ?? KG_LNG;
  const targetRadius = (latestGpsConfig?.radius && latestGpsConfig.radius > 0) ? latestGpsConfig.radius : KG_RADIUS_METERS; // 20m standard
  const currentDist = (gps.lat !== null && gps.lng !== null)
    ? Math.round(getDist(gps.lat, gps.lng, targetLat, targetLng) * 1000)
    : (gps.distance ?? null);
  const isAuthorizedTest = isAuthorizedTestUser(currentUser);
  const isWithinRadius = isAuthorizedTest || (Boolean(gps.isValid) && (currentDist === null || currentDist <= targetRadius));

  // Smart check-in recommendation & state machine
  const recommendation = getRecommendedCheckInType(store.logs, currentUser);
  const missingAlerts = auditMissingCheckIns(store.logs, currentUser);
  const [selectedMissingAlert, setSelectedMissingAlert] = useState<MissingCheckInAlert | null>(null);

  // Live second ticker for real-time 15-minute countdown
  const [cooldownTicker, setCooldownTicker] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCooldownTicker((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const cooldown = getCheckInCooldown(store.logs, currentUser, store.lastCheckInTime);
  const anomalies = auditCheckInAnomalies(store.logs, currentUser);

  // Post-capture confirmation modal & dynamic type selection state
  const [confirmCheckInModalOpen, setConfirmCheckInModalOpen] = useState(false);
  const [modalChosenType, setModalChosenType] = useState<CheckInTypeString>(recommendation.recommendedType);
  const [hasAcknowledgedMissingIn, setHasAcknowledgedMissingIn] = useState(false);
  const [hasAcknowledgedEarlyOut, setHasAcknowledgedEarlyOut] = useState(false);
  const [confirmInvertedTypeOpen, setConfirmInvertedTypeOpen] = useState(false);
  const [pendingTypeToSubmit, setPendingTypeToSubmit] = useState<CheckInTypeString>('Vào ca');
  const [employeeAttendanceModalOpen, setEmployeeAttendanceModalOpen] = useState(false);

  // Auto-sync modal type with recommendation whenever recommendation changes (if modal is closed)
  useEffect(() => {
    if (!confirmCheckInModalOpen) {
      setModalChosenType(recommendation.recommendedType);
      setHasAcknowledgedMissingIn(false);
      setHasAcknowledgedEarlyOut(false);
    }
  }, [recommendation.recommendedType, confirmCheckInModalOpen]);

  const [missedModalOpen, setMissedModalOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = '/android-chrome-192x192.png?v=4';
    img.onload = () => {
      logoImgRef.current = img;
    };
    img.onerror = () => {
      const fallback = new Image();
      fallback.src = '/LOGO.png';
      fallback.onload = () => {
        logoImgRef.current = fallback;
      };
    };
    if (img.complete && img.naturalWidth > 0) {
      logoImgRef.current = img;
    }
  }, []);

  const kalmanLatRef = useRef(new KalmanFilter(20));
  const kalmanLngRef = useRef(new KalmanFilter(20));
  const watchIdRef = useRef<number | null>(null);
  const gpsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGpsValidRef = useRef<boolean | null>(null);
  const consecutiveInvalidCountRef = useRef<number>(0);
  const precisionScanWatchIdRef = useRef<number | null>(null);
  const precisionScanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPrecisionScanning, setIsPrecisionScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; bestAcc: number | null; bestDist: number | null }>({
    current: 0,
    total: 4,
    bestAcc: null,
    bestDist: null
  });

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [cameraErrorMessage, setCameraErrorMessage] = useState('');
  const [isFaceModelLoaded, setIsFaceModelLoaded] = useState(false);
  const [faceModelUnavailable, setFaceModelUnavailable] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const faceApiRef = useRef<any>(null);

  // Bottom sheets / toast states to replace SweetAlert
  const [spamWarningOpen, setSpamWarningOpen] = useState(false);
  const [spamWarningText, setSpamWarningText] = useState('');
  
  const [confirmLateOpen, setConfirmLateOpen] = useState(false);
  const [pendingLateMins, setPendingLateMins] = useState(0);
  const [pendingShiftStr, setPendingShiftStr] = useState('');

  const [surveyOpen, setSurveyOpen] = useState(false);
  const [surveyEmotion, setSurveyEmotion] = useState<number | null>(null);
  const [surveyNote, setSurveyNote] = useState('');
  const [surveySubmitting, setSurveySubmitting] = useState(false);

  const [feedbackSheetOpen, setFeedbackSheetOpen] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackType, setFeedbackType] = useState<'success' | 'warning' | 'info'>('info');

  // Photo Expiry Timer (Strict 60-Second Window to eliminate pre-taking photos)
  const PHOTO_EXPIRATION_SECONDS = 60;
  const [photoCapturedAtMs, setPhotoCapturedAtMs] = useState<number | null>(null);
  const [photoTimeLeftSeconds, setPhotoTimeLeftSeconds] = useState<number>(PHOTO_EXPIRATION_SECONDS);

  const handlePhotoExpired = useCallback(() => {
    store.setCapturedImage(null);
    store.setCapturedTime(null);
    setPhotoCapturedAtMs(null);
    setPhotoTimeLeftSeconds(PHOTO_EXPIRATION_SECONDS);
    setConfirmCheckInModalOpen(false);
    setConfirmLateOpen(false);
    setConfirmInvertedTypeOpen(false);

    speak('Ảnh chụp đã hết hạn 60 giây. Vui lòng chụp lại ảnh mới tại nhà hàng.');
    setFeedbackTitle('Ảnh chụp đã hết hạn (Quá 60 giây)');
    setFeedbackMessage(
      'Quy chuẩn chống gian lận: Ảnh chụp minh chứng chỉ có hiệu lực trong vòng 60 giây.\n\nHệ thống đã tự động hủy ảnh cũ để bảo đảm thời gian chấm công phản ánh chính xác thời điểm thực tế bạn có mặt tại nhà hàng.\n\nVui lòng chụp lại ảnh mới để tiếp tục.'
    );
    setFeedbackType('warning');
    setFeedbackSheetOpen(true);
  }, [store]);

  useEffect(() => {
    if (!capturedImage || !photoCapturedAtMs) {
      setPhotoTimeLeftSeconds(PHOTO_EXPIRATION_SECONDS);
      return;
    }

    const interval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - photoCapturedAtMs) / 1000);
      const remaining = Math.max(0, PHOTO_EXPIRATION_SECONDS - elapsedSeconds);
      setPhotoTimeLeftSeconds(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        handlePhotoExpired();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [capturedImage, photoCapturedAtMs, handlePhotoExpired]);

  const [lastSubmittedPunch, setLastSubmittedPunch] = useState<{
    type: 'Vào ca' | 'Ra ca';
    fullname: string;
    time: string;
    location: string;
    distMeters: string;
    isValid: boolean;
    shift: string;
    email: string;
  } | null>(null);

  // Clock
  useEffect(() => {
    store.setCurrentTime(getCurrentTimeString());
    const timer = setInterval(() => store.setCurrentTime(getCurrentTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Reverse Geocoding
  const lastGeocodeRef = useRef<{lat: number, lng: number} | null>(null);
  useEffect(() => {
    if (gps.lat && gps.lng && gps.isValid) {
      const last = lastGeocodeRef.current;
      if (!last || getDist(gps.lat, gps.lng, last.lat, last.lng) * 1000 > 30) {
        lastGeocodeRef.current = { lat: gps.lat, lng: gps.lng };
        callApi('GEOCODE', { lat: gps.lat, lng: gps.lng }, { background: true }).then((res) => {
          if (res?.ok && res.data?.address) {
            const currentGps = useAppStore.getState().gps;
            store.setGps({ ...currentGps, address: res.data.address });
          }
        });
      }
    }
  }, [gps.lat, gps.lng, gps.isValid]);

  // GPS Logic - Adaptive Ultra-Fast & High-Precision Lock
  const handleGpsSuccess = useCallback((pos: GeolocationPosition, isFastStart: boolean) => {
    // Record raw sample into ring buffer for anti-spoofing heuristic analysis
    recordGpsSample(pos);

    const rawLat = pos.coords.latitude;
    const rawLng = pos.coords.longitude;
    const acc = pos.coords.accuracy;

    const latestGpsConfig = useAppStore.getState().serverGpsConfig;
    const targetLat = latestGpsConfig?.lat ?? KG_LAT;
    const targetLng = latestGpsConfig?.lng ?? KG_LNG;
    const targetRadius = (latestGpsConfig?.radius && latestGpsConfig.radius > 0) ? latestGpsConfig.radius : KG_RADIUS_METERS; // Chuẩn 20m
    const isAuthorizedTest = isAuthorizedTestUser(useAppStore.getState().currentUser);

    const rawDist = getDist(rawLat, rawLng, targetLat, targetLng) * 1000;

    // Phase 1: Fast Seed Check
    if (isFastStart) {
      if (rawDist <= targetRadius || isAuthorizedTest) {
        // Fast cached position is within restaurant: lock immediately!
        kalmanLatRef.current.filter(rawLat, 0, acc);
        kalmanLngRef.current.filter(rawLng, 0, acc);
        store.setGps({
          lat: rawLat,
          lng: rawLng,
          isValid: true,
          status: isAuthorizedTest ? 'Vị trí Test (Bypass)' : 'Vị trí Siêu tốc',
          message: `Khoảng cách: ${Math.round(rawDist)}m / ${targetRadius}m (Sai số ±${Math.round(acc)}m)`,
          accuracy: Math.round(acc),
          distance: Math.round(rawDist)
        });
        if (prevGpsValidRef.current !== true) {
          speak('Vị trí đã hợp lệ, sẵn sàng chấm công');
          prevGpsValidRef.current = true;
        }
      } else {
        // Cached position is outside. Do NOT prematurely fail or play negative audio!
        // Show optimistic satellite loading while Tier 2 high-precision hardware lock engages.
        store.setGps({
          lat: rawLat,
          lng: rawLng,
          isValid: false,
          status: 'Đang kết nối vệ tinh trực tiếp...',
          message: `Đang thu nhận tín hiệu GPS chính xác (Sai số tạm: ±${Math.round(acc)}m)...`,
          accuracy: Math.round(acc),
          distance: Math.round(rawDist)
        });
      }
      return;
    }

    // Phase 2: Live Hardware GPS Lock
    const filteredLat = kalmanLatRef.current.filter(rawLat, 0, acc);
    const filteredLng = kalmanLngRef.current.filter(rawLng, 0, acc);

    // If hardware accuracy is high (acc <= 15m), adopt raw coordinates directly
    const lat = (acc <= 15) ? rawLat : filteredLat;
    const lng = (acc <= 15) ? rawLng : filteredLng;

    const dist = getDist(lat, lng, targetLat, targetLng) * 1000;

    if (dist <= targetRadius || isAuthorizedTest) {
      consecutiveInvalidCountRef.current = 0;
      store.setGps({
        lat,
        lng,
        isValid: true,
        status: isAuthorizedTest ? 'Vị trí Test (Bypass)' : (acc <= 15 ? 'Vị trí Chính xác (GPS Vệ Tinh)' : 'Vị trí Hợp lệ'),
        message: `Khoảng cách: ${Math.round(dist)}m / ${targetRadius}m (Sai số ±${Math.round(acc)}m)`,
        accuracy: Math.round(acc),
        distance: Math.round(dist)
      });
      if (prevGpsValidRef.current !== true) {
        speak('Vị trí đã hợp lệ, sẵn sàng chấm công');
        prevGpsValidRef.current = true;
      }
    } else {
      // Jitter dampening: if previously valid and within small jitter tolerance (+4m) with coarse accuracy,
      // allow grace reading to prevent momentary indoor radio spikes
      if (prevGpsValidRef.current === true && dist <= targetRadius + 4 && acc >= 15 && consecutiveInvalidCountRef.current < 2) {
        consecutiveInvalidCountRef.current += 1;
      } else {
        consecutiveInvalidCountRef.current = 0;
        store.setGps({
          lat,
          lng,
          isValid: false,
          status: 'Vị trí quá xa',
          message: `Khoảng cách: ${Math.round(dist)}m / ${targetRadius}m (Sai số ±${Math.round(acc)}m)`,
          accuracy: Math.round(acc),
          distance: Math.round(dist)
        });
        if (prevGpsValidRef.current !== false && prevGpsValidRef.current !== null) {
          speak('Vị trí không hợp lệ, vui lòng di chuyển lại gần');
          prevGpsValidRef.current = false;
        } else if (prevGpsValidRef.current === null) {
          prevGpsValidRef.current = false;
        }
      }
    }
  }, [store]);

  const handleGpsError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      store.setGps({
        isValid: false,
        status: 'Chưa được cấp quyền vị trí',
        message: 'Bật quyền Vị trí cho trình duyệt rồi nhấn “Thử lại”.'
      });
      return;
    }
    if (err.code === err.TIMEOUT) {
      store.setGps({
        isValid: false,
        status: 'Chưa nhận được vị trí',
        message: 'Ra khu vực thoáng hơn rồi thử lại.'
      });
      return;
    }
    store.setGps({
      isValid: false,
      status: 'Không thể xác định vị trí',
      message: 'Kiểm tra GPS và kết nối mạng rồi thử lại.'
    });
  }, [store]);

  const startGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null) return;
    store.setGps({ isValid: false, status: 'Đang định vị siêu tốc...', message: 'Khóa vệ tinh trong giây lát.' });
    if (!navigator.geolocation) {
      store.setGps({ status: 'Thiết bị không hỗ trợ định vị', message: 'Hãy dùng điện thoại có GPS.' });
      return;
    }

    // Tier 1: Instant Seed (<300ms) with network/cached GPS (short 8s cache window)
    navigator.geolocation.getCurrentPosition(
      (pos) => handleGpsSuccess(pos, true),
      () => {},
      { enableHighAccuracy: false, timeout: 1500, maximumAge: 8000 }
    );

    // Tier 2: Real-time high-precision hardware GPS lock (zero cache)
    navigator.geolocation.getCurrentPosition(
      (pos) => handleGpsSuccess(pos, false),
      handleGpsError,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => handleGpsSuccess(pos, false),
      handleGpsError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    gpsTimeoutRef.current = setTimeout(() => {
      const g = useAppStore.getState().gps;
      if (!g.isValid && g.status !== 'Chưa được cấp quyền vị trí') {
        navigator.geolocation.getCurrentPosition(
          (p) => handleGpsSuccess(p, false),
          handleGpsError,
          { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
        );
      }
    }, 5000);
  }, [handleGpsError, handleGpsSuccess, store]);

  const handlePrecisionRescan = useCallback(() => {
    if (isPrecisionScanning) return;
    setIsPrecisionScanning(true);
    setScanProgress({ current: 0, total: 4, bestAcc: null, bestDist: null });

    // Cancel existing watch & timers
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (gpsTimeoutRef.current) {
      clearTimeout(gpsTimeoutRef.current);
      gpsTimeoutRef.current = null;
    }
    if (precisionScanWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(precisionScanWatchIdRef.current);
      precisionScanWatchIdRef.current = null;
    }
    if (precisionScanTimeoutRef.current) {
      clearTimeout(precisionScanTimeoutRef.current);
      precisionScanTimeoutRef.current = null;
    }

    // Hard reset kalman and state
    kalmanLatRef.current.hardReset();
    kalmanLngRef.current.hardReset();
    prevGpsValidRef.current = null;
    consecutiveInvalidCountRef.current = 0;

    store.setGps({
      lat: null,
      lng: null,
      isValid: false,
      status: 'Đang quét sóng vệ tinh...',
      message: 'Bỏ qua cache cũ, đang thu thập mẫu vệ tinh trực tiếp...',
      accuracy: null,
      distance: null
    });

    if (!navigator.geolocation) {
      setIsPrecisionScanning(false);
      store.setGps({ status: 'Thiết bị không hỗ trợ định vị', message: 'Hãy dùng điện thoại có GPS.' });
      return;
    }

    const latestGpsConfig = useAppStore.getState().serverGpsConfig;
    const targetLat = latestGpsConfig?.lat ?? KG_LAT;
    const targetLng = latestGpsConfig?.lng ?? KG_LNG;
    const targetRadius = (latestGpsConfig?.radius && latestGpsConfig.radius > 0) ? latestGpsConfig.radius : KG_RADIUS_METERS;
    const isAuthorizedTest = isAuthorizedTestUser(useAppStore.getState().currentUser);

    const samples: Array<{
      lat: number;
      lng: number;
      acc: number;
      dist: number;
    }> = [];

    const finishScan = () => {
      if (precisionScanWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(precisionScanWatchIdRef.current);
        precisionScanWatchIdRef.current = null;
      }
      if (precisionScanTimeoutRef.current) {
        clearTimeout(precisionScanTimeoutRef.current);
        precisionScanTimeoutRef.current = null;
      }

      if (samples.length === 0) {
        setIsPrecisionScanning(false);
        startGpsWatch();
        return;
      }

      // Pick best sample:
      // Priority 1: Samples that fall within targetRadius or authorized test
      const validSamples = samples.filter((s) => s.dist <= targetRadius || isAuthorizedTest);
      let chosen = samples[0];

      if (validSamples.length > 0) {
        validSamples.sort((a, b) => (a.acc - b.acc) || (a.dist - b.dist));
        chosen = validSamples[0];
      } else {
        const sortedByAcc = [...samples].sort((a, b) => a.acc - b.acc);
        chosen = sortedByAcc[0];
      }

      // Apply chosen to Kalman filter
      kalmanLatRef.current.filter(chosen.lat, 0, chosen.acc);
      kalmanLngRef.current.filter(chosen.lng, 0, chosen.acc);

      const isInside = chosen.dist <= targetRadius || isAuthorizedTest;
      store.setGps({
        lat: chosen.lat,
        lng: chosen.lng,
        isValid: isInside,
        status: isInside
          ? (isAuthorizedTest ? 'Vị trí Test (Bypass)' : 'Vị trí Chính xác (GPS Vệ Tinh)')
          : 'Vị trí quá xa',
        message: isInside
          ? `Khoảng cách: ${Math.round(chosen.dist)}m / ${targetRadius}m (Sai số ±${Math.round(chosen.acc)}m)`
          : `Khoảng cách: ${Math.round(chosen.dist)}m / ${targetRadius}m (Sai số ±${Math.round(chosen.acc)}m)`,
        accuracy: Math.round(chosen.acc),
        distance: Math.round(chosen.dist)
      });

      if (isInside) {
        speak('Vị trí đã hợp lệ, sẵn sàng chấm công');
        prevGpsValidRef.current = true;
        confetti({ particleCount: 35, spread: 60, origin: { y: 0.7 } });
      } else {
        speak(`Đã lấy vị trí vệ tinh, khoảng cách ${Math.round(chosen.dist)} mét`);
        prevGpsValidRef.current = false;
      }

      setIsPrecisionScanning(false);

      // Re-engage standard continuous watch
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => handleGpsSuccess(pos, false),
        handleGpsError,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    };

    const handleIncomingSample = (pos: GeolocationPosition) => {
      recordGpsSample(pos);
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      const dist = getDist(lat, lng, targetLat, targetLng) * 1000;

      samples.push({ lat, lng, acc, dist });

      const bestAcc = Math.min(...samples.map((s) => Math.round(s.acc)));
      const bestDist = Math.min(...samples.map((s) => Math.round(s.dist)));

      setScanProgress({
        current: samples.length,
        total: 4,
        bestAcc,
        bestDist
      });

      // If we find an accurate sample within targetRadius, we can finish early!
      if ((dist <= targetRadius || isAuthorizedTest) && acc <= 20 && samples.length >= 2) {
        finishScan();
        return;
      }

      if (samples.length >= 4) {
        finishScan();
      }
    };

    // Burst 1: getCurrentPosition zero cache
    navigator.geolocation.getCurrentPosition(
      handleIncomingSample,
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    // Burst 2: watchPosition stream
    precisionScanWatchIdRef.current = navigator.geolocation.watchPosition(
      handleIncomingSample,
      handleGpsError,
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    );

    // Safety timeout after 3.2 seconds
    precisionScanTimeoutRef.current = setTimeout(() => {
      finishScan();
    }, 3200);
  }, [handleGpsError, handleGpsSuccess, isPrecisionScanning, startGpsWatch, store]);

  const restartGps = useCallback(() => {
    handlePrecisionRescan();
  }, [handlePrecisionRescan]);

  // Camera Logic
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const isStartingCameraRef = useRef(false);

  const startCamera = async () => {
    if (isStartingCameraRef.current) return;
    isStartingCameraRef.current = true;
    setCameraError(false);
    setCameraErrorMessage('');
    
    try {
      if (!window.isSecureContext && location.hostname !== 'localhost') {
        setCameraErrorMessage('Camera chỉ hoạt động trên kết nối HTTPS an toàn.');
        setCameraError(true);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraErrorMessage('Trình duyệt này không hỗ trợ mở camera trực tiếp.');
        setCameraError(true);
        return;
      }

      const constraintsList = [{ video: { facingMode: 'user' as const } }, { video: { facingMode: 'environment' as const } }, { video: true }];

      for (const constraint of constraintsList) {
        try {
          if (streamRef.current) stopCamera();
          const stream = await navigator.mediaDevices.getUserMedia(constraint);
          streamRef.current = stream;
          const video = videoRef.current;
          if (!video) continue;
          video.srcObject = stream;

          await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => {
              video.play().then(() => {
                setTimeout(() => {
                  if (video.videoWidth > 0 && !video.paused) {
                    setCameraActive(true);
                    resolve();
                  } else reject('Video stream empty');
                }, 500);
              }).catch(reject);
            };
            video.onerror = () => reject('Video error');
          });
          
          isStartingCameraRef.current = false;
          return;
        } catch (error) {
          const cameraException = error as DOMException;
          if (cameraException?.name === 'NotAllowedError' || cameraException?.name === 'SecurityError') {
            setCameraErrorMessage('Quyền camera đang bị tắt. Hãy cấp quyền rồi thử lại.');
            break;
          }
          if (cameraException?.name === 'NotFoundError') {
            setCameraErrorMessage('Không tìm thấy camera trên thiết bị.');
            break;
          }
        }
      }
      setCameraError(true);
      setCameraErrorMessage((message) => message || 'Không thể mở camera. Bạn vẫn có thể dùng máy ảnh hệ thống.');
      speak('Không thể mở máy ảnh. Vui lòng kiểm tra quyền truy cập.');
    } finally {
      isStartingCameraRef.current = false;
    }
  };

  const cleanCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const drawWatermarkAndSave = (
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    exactTime: string,
    addr: string,
    typeToStamp: CheckInTypeString = modalChosenType || recommendation.recommendedType
  ) => {
    if (!isWithinRadius) {
      speak('Bạn đang ở ngoài bán kính 20m. Không thể tạo ảnh đóng dấu.');
      return;
    }

    const cardX = 24;
    const cardHeight = 300;
    const cardY = canvas.height - cardHeight - 24;
    const cardWidth = canvas.width - (cardX * 2);
    const radius = 22;

    // Reset shadow & filter for ultra-crisp stamp graphics
    ctx.filter = 'none';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const drawRoundRect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      if (typeof c.roundRect === 'function') {
        c.roundRect(x, y, w, h, r);
      } else {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y + w, y, r);
        c.closePath();
      }
    };

    // 1. Draw Card Background with sleek dark glassmorphism
    ctx.save();
    ctx.fillStyle = 'rgba(10, 18, 34, 0.95)';
    ctx.beginPath();
    drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, radius);
    ctx.fill();

    // Subtle premium border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Top subtle gradient bar to add sleek accent
    const currentGpsState = useAppStore.getState().gps;
    const userObj = useAppStore.getState().currentUser;
    const isCheckInType = typeToStamp.includes('Vào') || typeToStamp.includes('IN') || typeToStamp.toLowerCase().includes('vào');

    const gradBar = ctx.createLinearGradient(cardX, cardY, cardX + cardWidth, cardY);
    if (isCheckInType) {
      gradBar.addColorStop(0, '#059669');
      gradBar.addColorStop(1, '#06B6D4');
    } else {
      gradBar.addColorStop(0, '#2563EB');
      gradBar.addColorStop(1, '#8B5CF6');
    }
    ctx.beginPath();
    drawRoundRect(ctx, cardX, cardY, cardWidth, 4, 2);
    ctx.fillStyle = gradBar;
    ctx.fill();
    ctx.restore();

    // Padding
    const padX = 20;
    const contentX = cardX + padX;
    const contentWidth = cardWidth - (padX * 2);

    // Cryptographic Security Token
    const securityToken = generateLocationSecurityToken(
      userObj?.username || 'user',
      currentGpsState.lat ?? 0,
      currentGpsState.lng ?? 0,
      exactTime
    );

    // --- HEADER SECTION (y = cardY + 16 to cardY + 62) ---
    const headerTop = cardY + 16;
    const logoSize = 44;
    const logoX = contentX;
    const logoY = headerTop;

    // Logo backdrop rounded container - Luminous White Badge that POPS out from the dark card
    ctx.save();
    // Vibrant radiant outer glow
    ctx.shadowColor = 'rgba(56, 189, 248, 0.75)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Crisp white badge background with subtle bevel
    const badgeGrad = ctx.createLinearGradient(logoX, logoY, logoX, logoY + logoSize);
    badgeGrad.addColorStop(0, '#FFFFFF');
    badgeGrad.addColorStop(1, '#F1F5F9');
    ctx.fillStyle = badgeGrad;
    ctx.beginPath();
    drawRoundRect(ctx, logoX, logoY, logoSize, logoSize, 12);
    ctx.fill();

    // High-visibility border ring
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Reset shadow for crisp image rendering inside
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Draw webapp logo image
    if (logoImgRef.current && logoImgRef.current.complete && logoImgRef.current.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      drawRoundRect(ctx, logoX + 2, logoY + 2, logoSize - 4, logoSize - 4, 10);
      ctx.clip();
      ctx.drawImage(logoImgRef.current, logoX + 2, logoY + 2, logoSize - 4, logoSize - 4);
      ctx.restore();
    } else {
      // Vector fallback with sharp King's Grill emblem
      ctx.fillStyle = '#0369A1';
      ctx.font = '900 18px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('KG', logoX + logoSize / 2, logoY + logoSize / 2);
    }
    ctx.restore();

    // Brand Title beside Logo
    const brandTextX = logoX + logoSize + 12;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '900 19px "Plus Jakarta Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText("KING'S GRILL", brandTextX, headerTop + 3);

    ctx.font = '700 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#94A3B8'; // Slate 400
    ctx.fillText("HỆ THỐNG CHỨNG THỰC CHẤM CÔNG GPS • KG-OS", brandTextX, headerTop + 26);

    // Right Header: Status Badge Pill (Strictly HỢP LỆ)
    const upperType = typeToStamp.toUpperCase();
    const statusText = `${upperType} • HỢP LỆ`;
    ctx.font = 'bold 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const statusWidth = ctx.measureText(statusText).width + 36;
    const statusHeight = 32;
    const statusX = cardX + cardWidth - padX - statusWidth;
    const statusY = headerTop + 5;

    ctx.save();
    ctx.beginPath();
    drawRoundRect(ctx, statusX, statusY, statusWidth, statusHeight, 16);
    ctx.fillStyle = isCheckInType ? 'rgba(16, 185, 129, 0.22)' : 'rgba(59, 130, 246, 0.22)';
    ctx.fill();
    ctx.strokeStyle = isCheckInType ? '#10B981' : '#3B82F6';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Dot indicator
    ctx.beginPath();
    ctx.arc(statusX + 16, statusY + statusHeight / 2, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = isCheckInType ? '#34D399' : '#60A5FA';
    ctx.fill();

    // Status text
    ctx.fillStyle = isCheckInType ? '#6EE7B7' : '#93C5FD';
    ctx.textBaseline = 'middle';
    ctx.fillText(statusText, statusX + 27, statusY + statusHeight / 2);
    ctx.restore();

    // Divider Line below Header
    const divY = headerTop + logoSize + 10;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(contentX, divY);
    ctx.lineTo(contentX + contentWidth, divY);
    ctx.stroke();

    // --- 2x2 MODULAR INFORMATION TILES (y = divY + 10) ---
    const tileGap = 14;
    const tileW = (contentWidth - tileGap) / 2;
    const tileH = 70;
    const tileR = 12;
    const col1X = contentX;
    const col2X = contentX + tileW + tileGap;
    const row1Y = divY + 10;
    const row2Y = row1Y + tileH + 10;

    const drawInfoTile = (
      x: number,
      y: number,
      w: number,
      h: number,
      iconLabel: string,
      mainValue: string,
      subValue: string = '',
      mainColor: string = '#FFFFFF',
      iconColor: string = '#94A3B8'
    ) => {
      // Tile background
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.beginPath();
      drawRoundRect(ctx, x, y, w, h, tileR);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Top label
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = iconColor;
      ctx.textBaseline = 'top';
      ctx.fillText(iconLabel, x + 14, y + 10);

      // Main value
      ctx.font = 'bold 15px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = mainColor;
      ctx.fillText(mainValue, x + 14, y + 27);

      // Sub value if exists
      if (subValue) {
        ctx.font = '500 12px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#CBD5E1';
        ctx.fillText(subValue, x + 14, y + 47);
      }
      ctx.restore();
    };

    // Tile 1: Thời gian ghi nhận
    drawInfoTile(
      col1X,
      row1Y,
      tileW,
      tileH,
      '🕒 THỜI GIAN GHI NHẬN',
      exactTime,
      `Chữ ký an ninh: ${securityToken}`,
      '#FDE047', // Vivid Gold
      '#FACC15'
    );

    // Tile 2: Nhân sự chấm công
    const roleTitle = userObj?.role === 'admin' ? 'Quản lý' : (userObj?.position || 'Nhân sự');
    const personName = `${userObj?.fullname || 'Nhân sự'} (${userObj?.username || ''})`;
    drawInfoTile(
      col2X,
      row1Y,
      tileW,
      tileH,
      '👤 NHÂN SỰ CHẤM CÔNG',
      personName,
      `Vị trí công tác: ${roleTitle}`,
      '#FFFFFF',
      '#93C5FD'
    );

    // Tile 3: Địa điểm & Trạng thái vệ tinh
    drawInfoTile(
      col1X,
      row2Y,
      tileW,
      tileH,
      '📍 ĐỊA ĐIỂM & ĐỊNH VỊ',
      addr.length > 38 ? addr.slice(0, 36) + '...' : addr,
      'Khóa vệ tinh GPS chính xác cao',
      '#E2E8F0',
      '#38BDF8'
    );

    // Tile 4: Tiêu chuẩn Bán kính GPS (Chuẩn ≤20m)
    const distText = currentGpsState.message && currentGpsState.message.includes('Khoảng cách:')
      ? currentGpsState.message
      : `Khoảng cách: ${currentDist ?? 0}m / ${targetRadius}m (≤${targetRadius}m Hợp lệ)`;
    drawInfoTile(
      col2X,
      row2Y,
      tileW,
      tileH,
      `🛰️ TIÊU CHUẨN BÁN KÍNH GPS (≤${targetRadius}M)`,
      distText,
      '✓ Đạt chuẩn vị trí nhà hàng (≤20m)',
      '#34D399',
      '#10B981'
    );

    // --- FOOTER BAR (y = row2Y + tileH + 10) ---
    const footerY = row2Y + tileH + 10;
    ctx.save();
    ctx.font = '500 12px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#64748B'; // Slate 500
    ctx.textBaseline = 'top';

    const coordsText = `🛰️ TỌA ĐỘ: ${currentGpsState.lat?.toFixed(6) || '10.976083'}, ${currentGpsState.lng?.toFixed(6) || '106.664654'}`;
    ctx.fillText(coordsText, contentX, footerY);

    const rightFooterText = `BÁN KÍNH TIÊU CHUẨN: ≤ 20M  •  KING'S GRILL CHÍNH THỨC`;
    const rightFooterWidth = ctx.measureText(rightFooterText).width;
    ctx.fillText(rightFooterText, contentX + contentWidth - rightFooterWidth, footerY);
    ctx.restore();

    // Save image with high-efficiency WebP encoding (crisp watermark text, natural skin tone, 35-50% smaller size)
    const dataUrl = encodeOptimalCanvas(canvas, 0.83);
    
    store.setCapturedImage(dataUrl);
    store.setCapturedTime(exactTime);
  };

  const takePhoto = () => {
    if (!isWithinRadius) {
      speak(`Bạn đang ở ngoài bán kính chấm công. Khoảng cách ${currentDist ?? 'không xác định'} mét.`);
      setFeedbackTitle('Ngoài bán kính chấm công (≤20m)');
      setFeedbackMessage(
        `Vị trí của bạn đang cách nhà hàng ${currentDist ?? 'quá'}m (quy định ≤ ${targetRadius}m).\n\nĐể đảm bảo tính minh bạch và chống gian lận, camera chụp ảnh đã được khóa. Vui lòng di chuyển vào khu vực nhà hàng để chấm công.`
      );
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return;
    }

    const spoofResult = detectGpsSpoofing();
    if (spoofResult.isSuspicious && !isAuthorizedTest) {
      speak('Cảnh báo! Phát hiện nghi vấn giả lập vị trí GPS.');
      setFeedbackTitle('Cảnh báo Gian Lận Vị Trí (Fake GPS)');
      setFeedbackMessage(
        `Hệ thống an ninh KG-OS phát hiện tín hiệu vị trí bất thường:\n- ${spoofResult.reasons.join('\n- ')}\n\nVui lòng tắt tất cả ứng dụng giả lập GPS hoặc VPN/Proxy và quét lại vị trí thực tế.`
      );
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setCameraErrorMessage('Camera chưa sẵn sàng. Vui lòng chờ một chút rồi thử lại.');
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Upgraded resolution for HD sharpness: 960x1280 (3:4 ratio)
    const targetWidth = 960, targetHeight = 1280;
    canvas.width = targetWidth; canvas.height = targetHeight;
    const vw = video.videoWidth, vh = video.videoHeight;
    const canvasRatio = targetWidth / targetHeight, videoRatio = vw / vh;
    let sx: number, sy: number, sWidth: number, sHeight: number;

    if (videoRatio > canvasRatio) { sHeight = vh; sWidth = vh * canvasRatio; sx = (vw - sWidth) / 2; sy = 0; }
    else { sWidth = vw; sHeight = vw / canvasRatio; sx = 0; sy = (vh - sHeight) / 2; }

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = 'contrast(1.04) saturate(1.03) brightness(1.01)';
    ctx.translate(targetWidth, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
    ctx.restore();

    // Preserve clean unwatermarked frame for real-time re-stamping in modal
    if (!cleanCanvasRef.current) {
      cleanCanvasRef.current = document.createElement('canvas');
    }
    cleanCanvasRef.current.width = targetWidth;
    cleanCanvasRef.current.height = targetHeight;
    const cleanCtx = cleanCanvasRef.current.getContext('2d');
    if (cleanCtx) {
      cleanCtx.drawImage(canvas, 0, 0);
    }

    // Exact capture timestamp down to seconds
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const exactTime = `${d}/${m}/${y} ${h}:${min}:${s}`;
    
    const addr = useAppStore.getState().gps.address || useAppStore.getState().gps.status || 'Chưa rõ vị trí';
    
    drawWatermarkAndSave(canvas, ctx, exactTime, addr, modalChosenType || recommendation.recommendedType);
    const captureTimestampMs = Date.now();
    setPhotoCapturedAtMs(captureTimestampMs);
    setPhotoTimeLeftSeconds(PHOTO_EXPIRATION_SECONDS);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isWithinRadius) {
      speak('Bạn đang ở ngoài bán kính 20m. Không thể tải ảnh minh chứng.');
      setFeedbackTitle('Ngoài bán kính chấm công (≤20m)');
      setFeedbackMessage(
        `Vị trí của bạn đang cách nhà hàng ${currentDist ?? 'quá'}m (quy định ≤ ${targetRadius}m).\n\nVui lòng di chuyển vào khu vực nhà hàng để chấm công.`
      );
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      e.target.value = '';
      return;
    }

    const spoofResult = detectGpsSpoofing();
    if (spoofResult.isSuspicious && !isAuthorizedTest) {
      speak('Cảnh báo! Phát hiện nghi vấn giả lập vị trí GPS.');
      setFeedbackTitle('Cảnh báo Gian Lận Vị Trí (Fake GPS)');
      setFeedbackMessage(
        `Hệ thống an ninh KG-OS phát hiện tín hiệu vị trí bất thường:\n- ${spoofResult.reasons.join('\n- ')}\n\nVui lòng tắt ứng dụng giả lập vị trí và quét lại GPS.`
      );
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      e.target.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Upgraded resolution for HD sharpness: 960x1280 (3:4 ratio)
        const targetWidth = 960, targetHeight = 1280;
        canvas.width = targetWidth; canvas.height = targetHeight;
        const vw = img.width, vh = img.height;
        const canvasRatio = targetWidth / targetHeight, imgRatio = vw / vh;
        let sx: number, sy: number, sWidth: number, sHeight: number;
        if (imgRatio > canvasRatio) { sHeight = vh; sWidth = vh * canvasRatio; sx = (vw - sWidth) / 2; sy = 0; }
        else { sWidth = vw; sHeight = vw / canvasRatio; sx = 0; sy = (vh - sHeight) / 2; }
        
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.filter = 'contrast(1.04) saturate(1.03) brightness(1.01)';
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
        ctx.restore();

        // Preserve clean unwatermarked frame for real-time re-stamping in modal
        if (!cleanCanvasRef.current) {
          cleanCanvasRef.current = document.createElement('canvas');
        }
        cleanCanvasRef.current.width = targetWidth;
        cleanCanvasRef.current.height = targetHeight;
        const cleanCtx = cleanCanvasRef.current.getContext('2d');
        if (cleanCtx) {
          cleanCtx.drawImage(canvas, 0, 0);
        }
        
        // Exact capture timestamp down to seconds
        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear();
        const h = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        const exactTime = `${d}/${m}/${y} ${h}:${min}:${s}`;
        
        const addr = useAppStore.getState().gps.address || useAppStore.getState().gps.status || 'Chưa rõ vị trí';
        
        drawWatermarkAndSave(canvas, ctx, exactTime, addr, modalChosenType || recommendation.recommendedType);
        const captureTimestampMs = Date.now();
        setPhotoCapturedAtMs(captureTimestampMs);
        setPhotoTimeLeftSeconds(PHOTO_EXPIRATION_SECONDS);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleTypeChangeInModal = (newType: CheckInTypeString) => {
    setModalChosenType(newType);
    setHasAcknowledgedMissingIn(false);
    setHasAcknowledgedEarlyOut(false);
    
    // Re-render watermark in real-time onto canvas
    const canvas = canvasRef.current;
    const cleanCanvas = cleanCanvasRef.current;
    if (canvas && cleanCanvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(cleanCanvas, 0, 0);
        const exactTime = store.capturedTime || `${String(new Date().getDate()).padStart(2, '0')}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()} ${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}:${String(new Date().getSeconds()).padStart(2, '0')}`;
        const addr = useAppStore.getState().gps.address || useAppStore.getState().gps.status || 'Chưa rõ vị trí';
        drawWatermarkAndSave(canvas, ctx, exactTime, addr, newType);
      }
    }
  };

  // Submit flow triggers
  const submitCheck = async (type: string) => {
    if (!capturedImage || !isWithinRadius || gps.lat === null || gps.lng === null) return;

    if (!photoCapturedAtMs || Date.now() - photoCapturedAtMs > PHOTO_EXPIRATION_SECONDS * 1000) {
      handlePhotoExpired();
      return;
    }

    const isOutAction = type.includes('Ra ca') || type.includes('OUT') || type.toLowerCase().includes('ra');
    // Safety guard: If user manually chose 'Ra ca' but has no active open shift or Vào ca record
    if (isOutAction && !recommendation.isOpenShift && !recommendation.hasInToday) {
      setPendingTypeToSubmit(type);
      setConfirmInvertedTypeOpen(true);
      return;
    }

    proceedSubmitCheck(type);
  };

  const proceedSubmitCheck = async (type: string) => {
    if (!capturedImage) {
      speak('Chưa có ảnh chụp. Vui lòng chụp ảnh minh chứng trước khi gửi.');
      setFeedbackTitle('Chưa có ảnh chụp');
      setFeedbackMessage('Vui lòng căn khuôn mặt giữa khung hình và chụp ảnh trước khi gửi chấm công.');
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return;
    }

    // Strict 60-second photo expiration check
    if (!photoCapturedAtMs || Date.now() - photoCapturedAtMs > PHOTO_EXPIRATION_SECONDS * 1000) {
      handlePhotoExpired();
      return;
    }

    if (!isWithinRadius || gps.lat === null || gps.lng === null) {
      speak('Vị trí chưa hợp lệ. Yêu cầu trong bán kính 20m.');
      setFeedbackTitle('Vị trí ngoài bán kính quy định (≤20m)');
      setFeedbackMessage(`Khoảng cách hiện tại: ${currentDist ?? 'quá'}m (quy định ≤ ${targetRadius}m). Hệ thống từ chối ghi nhận lượt chấm công ngoài khu vực nhà hàng.`);
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return;
    }

    const spoofResult = detectGpsSpoofing();
    if (spoofResult.isSuspicious && !isAuthorizedTest) {
      speak('Cảnh báo! Hệ thống phát hiện nghi vấn giả lập vị trí GPS.');
      setFeedbackTitle('Cảnh báo Gian Lận Vị Trí (Fake GPS)');
      setFeedbackMessage(
        `Hệ thống an ninh KG-OS phát hiện tín hiệu vị trí bất thường:\n- ${spoofResult.reasons.join('\n- ')}\n\nVui lòng tắt tất cả ứng dụng giả lập GPS hoặc VPN/Proxy và quét lại vị trí thực tế.`
      );
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return;
    }

    // Anti-spam 15-minute cooldown check
    const cooldownInfo = getCheckInCooldown(store.logs, currentUser, useAppStore.getState().lastCheckInTime);
    const isAdminUser = currentUser?.role === 'admin' || currentUser?.role === 'tester';
    if (cooldownInfo.isBlocked && !isAdminUser) {
      speak(`Vui lòng đợi thêm ${cooldownInfo.remainingMinutesFormatted} để chấm công lại.`);
      setSpamWarningText(`Quy định chống spam: Bạn vừa chấm công lúc ${cooldownInfo.lastTimeStr || ''} (${cooldownInfo.minutesSinceLast || 0} phút trước). Hệ thống yêu cầu sau tối thiểu 15 phút mới được chấm tiếp để tránh trùng lặp. Thời gian còn lại: ${cooldownInfo.remainingMinutesFormatted}.`);
      setSpamWarningOpen(true);
      return;
    }

    // Late check-in warning
    let lateMinsInfo = 0;
    let shiftString = '';
    const isInAction = type.includes('Vào ca') || type.includes('IN') || type.toLowerCase().includes('vào');
    if (isInAction && approvedShifts) {
      const todayDate = new Date();
      let dayIdx = todayDate.getDay() - 1;
      if (dayIdx === -1) dayIdx = 6;
      const todayShift = approvedShifts[dayIdx];
      if (todayShift && todayShift !== 'OFF' && todayShift !== 'OFF#') {
        const parts = todayShift.split(':');
        if (parts.length === 2) {
          const shiftTotal = parseInt(parts[0]) * 60 + parseInt(parts[1]);
          const currentTotal = todayDate.getHours() * 60 + todayDate.getMinutes();
          if (currentTotal > shiftTotal) {
            lateMinsInfo = currentTotal - shiftTotal;
            speak(`Cảnh báo, bạn đang vào ca trễ ${lateMinsInfo} phút.`);
            
            // Set late variables and open bottom confirmation sheet instead of SweetAlert
            setPendingLateMins(lateMinsInfo);
            setPendingShiftStr(todayShift);
            setConfirmLateOpen(true);
            return;
          }
        }
      }
      shiftString = todayShift || 'Không có ca';
    }

    // Directly execute check if not late
    executeCheck(type, false, lateMinsInfo, shiftString);
  };

  // Real execution call
  const executeCheck = async (type: string, isLate: boolean, lateMinsInfo: number, shiftString: string) => {
    if (!currentUser) {
      speak('Vui lòng đăng nhập lại để tiếp tục.');
      return;
    }

    if (!photoCapturedAtMs || Date.now() - photoCapturedAtMs > PHOTO_EXPIRATION_SECONDS * 1000) {
      handlePhotoExpired();
      return;
    }

    if (!isWithinRadius) {
      speak('Từ chối chấm công: Bạn đang ở ngoài bán kính 20m.');
      setFeedbackTitle('Từ chối chấm công');
      setFeedbackMessage(`Khoảng cách hiện tại là ${currentDist ?? 'quá'}m (quy định ≤ ${targetRadius}m). Hệ thống không ghi nhận lượt chấm công này.`);
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return;
    }

    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const fallbackExactTime = `${d}/${m}/${y} ${h}:${min}:${s}`;

    // Exactly use the photo's captured time, guaranteeing 100% match with the watermark
    const actualTime = store.capturedTime || fallbackExactTime;
    const tempLog = {
      fullname: currentUser.fullname,
      type,
      time: actualTime,
      status: 'Đang đồng bộ...',
      image: capturedImage || undefined
    };
    
    // Save to store and local persistent punch cache immediately
    store.prependLog(tempLog);
    setLocalLastPunch(currentUser, type, actualTime);
    const punchNowMs = Date.now();
    store.setLastCheckInTime(punchNowMs);
    try {
      localStorage.setItem('kg_last_checkin', String(punchNowMs));
    } catch {}
    const isClockInType = type.includes('Vào ca') || type.includes('IN') || type.toLowerCase().includes('vào');
    if (isClockInType) store.setStats({ ...store.stats, totalCheckIn: store.stats.totalCheckIn + 1 });
    
    const payloadImage = capturedImage;
    const payloadTime = store.capturedTime || currentTime;
    const capturedTimestamp = photoCapturedAtMs;
    store.setCapturedImage(null);
    store.setCapturedTime(null);
    setPhotoCapturedAtMs(null);
    setPhotoTimeLeftSeconds(PHOTO_EXPIRATION_SECONDS);

    // Ensure reliable email delivery: resolve fallback to dmt.7121@gmail.com for admin / placeholder domains
    const effectiveEmail = (currentUser.email && !currentUser.email.includes('@kingsgrill.com'))
      ? currentUser.email
      : (currentUser.username.toLowerCase() === 'admin' ? 'dmt.7121@gmail.com' : (currentUser.email || 'dmt.7121@gmail.com'));

    // Save details for synchronized rich feedback modal
    setLastSubmittedPunch({
      type,
      fullname: currentUser.fullname,
      time: payloadTime,
      location: gps.address || (gps.status === 'Đang lấy vị trí...' ? 'Nhà hàng King\'s Grill' : gps.status),
      distMeters: typeof currentDist === 'number' ? `${Math.round(currentDist)}m` : '<= 20m',
      isValid: true,
      shift: shiftString,
      email: effectiveEmail
    });

    // Synchronized celebratory confetti for BOTH Vào ca and Ra ca!
    confetti({
      particleCount: 160,
      spread: 80,
      origin: { y: 0.6 },
      colors: type === 'Vào ca'
        ? ['#10b981', '#06b6d4', '#facc15', '#3b82f6', '#ec4899']
        : ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981']
    });

    // Synchronized voice greetings
    if (type === 'Vào ca') {
      speak('Ting! Chúc bạn ca làm việc vui vẻ!');
    } else {
      speak('Ting! Chúc mừng bạn đã hoàn thành ca làm việc!');
    }

    setFeedbackTitle(type === 'Vào ca' ? 'Điểm Danh Vào Ca Thành Công! 🎉' : 'Điểm Danh Ra Ca Thành Công! 🎊');
    setFeedbackType('success');
    setFeedbackSheetOpen(true);

    const payload = {
      username: currentUser.username,
      fullname: currentUser.fullname,
      email: effectiveEmail,
      type,
      lat: gps.lat,
      lng: gps.lng,
      image: payloadImage ? 'PENDING' : null,
      time: payloadTime,
      location: gps.address || gps.status,
      shift: shiftString,
      lateMins: lateMinsInfo,
      photoCapturedMs: capturedTimestamp,
      clientNowMs: Date.now(),
      securityToken: generateLocationSecurityToken(currentUser.username, gps.lat ?? 0, gps.lng ?? 0, payloadTime)
    };

    callApi('CHECK_IN_OUT', payload, { background: true, timeoutMs: 60000, maxAttempts: 3 }).then(async (res) => {
      if (res?.ok) {
        // Late penalty notifications using custom bottom sheets
        if (res.data?.lateMins > 5 && type === 'Vào ca') {
          const penaltyAmount = Math.max(10000, Math.floor(res.data.lateMins / 15) * 10000);
          setTimeout(() => {
            setFeedbackTitle(`Đi trễ ${res.data.lateMins} phút`);
            setFeedbackMessage(`Hệ thống tự động khấu trừ lương ca của bạn:\n-${penaltyAmount.toLocaleString()}đ`);
            setFeedbackType('warning');
            setFeedbackSheetOpen(true);
          }, 2000);
        }
        
        if (res.data?.checklistPending && type === 'Vào ca') {
          setTimeout(() => {
            setFeedbackTitle('Nhắc nhở Checklist');
            setFeedbackMessage('Bạn chưa hoàn thành checklist vận hành. Vui lòng nộp ngay!');
            setFeedbackType('info');
            setFeedbackSheetOpen(true);
          }, res.data?.lateMins > 5 ? 6500 : 2000);
        }

        // Background email notification trigger with generous 60s timeout
        if (res.data) {
          callApi('SEND_EMAIL_NOTIFICATION', {
            ...payload,
            email: effectiveEmail,
            imageUrl: res.data.imageUrl,
            distMeters: res.data.distMeters,
            isValid: res.data.isValid,
            viTri: res.data.viTri,
            timeISO: res.data.timeISO || new Date().toISOString()
          }, { background: true, timeoutMs: 60000, maxAttempts: 2 }).catch(err => {
            console.warn('[CheckIn] Send email notification error:', err);
          });
          
          if (payloadImage) {
            enqueueTask('UPLOAD_CHECKIN_IMAGE', {
              fullname: currentUser!.fullname,
              timeISO: res.data.timeISO,
              image: payloadImage
            }, { priority: 'high', maxAttempts: 5 });
          }
        }

        // Pulse survey trigger (40% probability)
        if (isClockInType && Math.random() < 0.4) {
          setTimeout(() => {
            setSurveyEmotion(null);
            setSurveyNote('');
            setSurveyOpen(true);
          }, 1200);
        }

        const weekInfo = computeWeekInfo();
        const dataRes = await callApi('GET_DATA', {
          username: currentUser!.username,
          fullname: currentUser!.fullname,
          role: currentUser!.role,
          monthSheet: weekInfo.monthSheet,
          weekLabel: weekInfo.weekLabel,
          forceRefresh: true,
          cacheBuster: Date.now()
        }, { background: true, cacheTtlMs: 0 });
        if (dataRes?.ok) {
          store.setLogs(dataRes.data.logs || []);
          store.setStats(dataRes.data.stats || store.stats);
          localStorage.setItem('kg_logs', JSON.stringify(dataRes.data.logs || []));
          localStorage.setItem('kg_stats', JSON.stringify(dataRes.data.stats));
        }
        store.setLastCheckInTime(Date.now());
        localStorage.setItem('kg_last_checkin', Date.now().toString());
      } else {
        // Rollback on fail
        store.removeFirstLog();
        if (isClockInType) store.setStats({ ...store.stats, totalCheckIn: store.stats.totalCheckIn - 1 });
        speak('Lỗi đồng bộ dữ liệu, vui lòng kiểm tra mạng');
        setFeedbackTitle('Lỗi đồng bộ');
        setFeedbackMessage(res?.message || 'Không thể kết nối với máy chủ. Vui lòng kiểm tra sóng điện thoại.');
        setFeedbackType('warning');
        setFeedbackSheetOpen(true);
      }
    });
  };

  // Submit survey action
  const handleSurveySubmit = async () => {
    if (surveyEmotion === null) return;
    setSurveySubmitting(true);
    await callApi('SUBMIT_SURVEY', {
      username: currentUser!.username,
      fullname: currentUser!.fullname,
      emotion: surveyEmotion,
      note: surveyNote
    }, { background: true });
    
    setSurveySubmitting(false);
    setSurveyOpen(false);
    
    setFeedbackTitle('Cảm ơn bạn!');
    setFeedbackMessage("King's Grill trân trọng ý kiến và luôn bên cạnh đồng hành cùng bạn ❤️");
    setFeedbackType('success');
    setFeedbackSheetOpen(true);
  };

  // Init camera & face models
  useEffect(() => {
    const loadModels = async () => {
      try {
        const faceapi = await import('face-api.js');
        faceApiRef.current = faceapi;
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        setIsFaceModelLoaded(true);
      } catch (e) {
        console.error('Face API model load error:', e);
        setFaceModelUnavailable(true);
      }
    };
    loadModels();

    startCamera();
    startGpsWatch();
    return () => {
      stopCamera();
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
      if (precisionScanWatchIdRef.current !== null) navigator.geolocation.clearWatch(precisionScanWatchIdRef.current);
      if (precisionScanTimeoutRef.current) clearTimeout(precisionScanTimeoutRef.current);
    };
  }, []);

  // AI bounding box detection loop
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (cameraActive && isFaceModelLoaded && videoRef.current && overlayCanvasRef.current) {
      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;
      const faceapi = faceApiRef.current;
      if (!faceapi) return;

      interval = setInterval(async () => {
        if (video.paused || video.ended || !cameraActive) return;
        
        try {
          const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160 }));
          
          const displaySize = { width: video.videoWidth, height: video.videoHeight };
          if (displaySize.width > 0 && displaySize.height > 0) {
            faceapi.matchDimensions(canvas, displaySize);
            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.save();
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
              
              if (resizedDetections.length === 1) {
                setIsFaceDetected(true);
                ctx.strokeStyle = '#14b8a6';
                ctx.lineWidth = 4;
                const box = resizedDetections[0].box;
                ctx.strokeRect(box.x, box.y, box.width, box.height);
              } else {
                setIsFaceDetected(false);
                if (resizedDetections.length > 1) {
                  ctx.strokeStyle = '#ef4444';
                  ctx.lineWidth = 4;
                  resizedDetections.forEach((det: { box: { x: number; y: number; width: number; height: number } }) => {
                    const box = det.box;
                    ctx.strokeRect(box.x, box.y, box.width, box.height);
                  });
                }
              }
              ctx.restore();
            }
          }
        } catch {
          // Keep the camera usable even if a detection frame fails.
        }
      }, 300);
    }
    return () => clearInterval(interval);
  }, [cameraActive, isFaceModelLoaded]);

  const handleAdminCalibrateGps = async () => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.username !== 'ADMIN')) return;
    if (!gps.lat || !gps.lng) {
      setFeedbackTitle('Chưa có tọa độ');
      setFeedbackMessage('Vui lòng đợi GPS lấy vị trí thiết bị rồi thử lại.');
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return;
    }
    store.setLoading(true, 'Đang lưu vị trí gốc nhà hàng (20m)...');
    try {
      const res = await callApi('UPDATE_GPS_CONFIG', {
        role: currentUser.role || 'admin',
        lat: gps.lat,
        lng: gps.lng,
        radius: 20
      });
      store.setLoading(false);
      if (res?.ok) {
        store.setServerGpsConfig({
          lat: gps.lat,
          lng: gps.lng,
          radius: 20
        });
        store.setGps({
          ...gps,
          isValid: true,
          status: 'Vị trí Chính xác',
          message: 'Khoảng cách: 0m / 20m - Hợp lệ'
        });
        speak('Đã lưu vị trí gốc nhà hàng. Vị trí hợp lệ.');
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
        setFeedbackTitle('Cập nhật thành công!');
        setFeedbackMessage('Đã đặt vị trí hiện tại làm tọa độ chuẩn của Nhà Hàng (Bán kính 20m). Toàn bộ nhân sự tại quán sẽ chấm công chuẩn xác 100%!');
        setFeedbackType('success');
        setFeedbackSheetOpen(true);
      } else {
        setFeedbackTitle('Lỗi cập nhật');
        setFeedbackMessage(res?.message || 'Không thể lưu tọa độ lên máy chủ.');
        setFeedbackType('warning');
        setFeedbackSheetOpen(true);
      }
    } catch (err: any) {
      store.setLoading(false);
      setFeedbackTitle('Lỗi hệ thống');
      setFeedbackMessage(err.message || 'Có lỗi xảy ra khi lưu GPS.');
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
    }
  };

  const canSubmit = !!(capturedImage && isWithinRadius && gps.lat !== null && gps.lng !== null && photoTimeLeftSeconds > 0);

  if (currentUser && !isWorkEligible(currentUser)) {
    return <EmploymentStatusNotice user={currentUser} actionLabel="chấm công tại nhà hàng" />;
  }

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      
      {/* Header Banner */}
      <KgModuleHero
        moduleId="checkin"
        title="Chấm công GPS"
        description="Chụp ảnh minh chứng tại nhà hàng trong bán kính 20m để hoàn tất chấm công."
        features={['Xác thực GPS ≤20m', 'Nhận diện Live AI', 'Chống chọn nhầm ca']}
        tipTitle="Quy chuẩn Chấm công Hợp lệ"
        tips={[
          "Đứng trong bán kính 20m tại khuôn viên nhà hàng King's Grill.",
          "Bật định vị độ chính xác cao trên điện thoại và cho phép quyền truy cập vị trí.",
          "Chụp ảnh khuôn mặt rõ nét, đủ ánh sáng, không dùng ảnh chụp lại từ màn hình khác.",
          "Sau khi chấm Vào ca, hệ thống giãn cách 15 phút chống spam trước khi có thể chấm Ra ca."
        ]}
      />

      {/* 15-Minute Anti-Spam Cooldown Banner */}
      {cooldown.isBlocked && currentUser?.role !== 'admin' && (
        <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/30 rounded-2xl p-4 text-[var(--kg-text)] shadow-xs max-w-md mx-auto animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5">
              <Clock size={18} className="animate-spin" style={{ animationDuration: '8s' }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  ⏳ Chống Spam: Giãn cách 15 phút
                </span>
                <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/30">
                  {cooldown.remainingMinutesFormatted}
                </span>
              </div>
              <p className="text-xs font-bold text-[var(--kg-text)] mt-1">
                Bạn vừa chấm {cooldown.lastType || 'công'} lúc {cooldown.lastTimeStr || ''} ({cooldown.minutesSinceLast || 0} phút trước).
              </p>
              <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 leading-relaxed">
                Quy định hệ thống yêu cầu sau tối thiểu 15 phút mới được chấm tiếp để tránh ghi nhận trùng lặp.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Check-In Anomaly Alert Banner */}
      {anomalies.length > 0 && (
        <div className="bg-gradient-to-r from-rose-500/15 via-red-500/10 to-rose-500/15 border border-rose-500/30 rounded-2xl p-3.5 text-[var(--kg-text)] shadow-xs max-w-md mx-auto animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs">
                <AlertTriangle size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                  ⚠️ Phát hiện sai loại: {anomalies[0].title}
                </p>
                <p className="text-xs font-bold text-[var(--kg-text)] mt-0.5 leading-snug">
                  {anomalies[0].message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => store.setCurrentTab('history')}
              className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-xs whitespace-nowrap active:scale-95 transition-all flex-shrink-0"
            >
              Sửa loại →
            </button>
          </div>
        </div>
      )}

      {/* Missing Check-in Alerts Banner */}
      {missingAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/30 rounded-2xl p-3.5 sm:p-4 text-[var(--kg-text)] shadow-xs max-w-md mx-auto animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5">
                <AlertTriangle size={17} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  ⚠️ Phát hiện {missingAlerts.length} ca chưa hoàn tất
                </p>
                <p className="text-xs font-bold text-[var(--kg-text)] mt-0.5 leading-snug">
                  {missingAlerts[0].message}
                </p>
                <p className="text-[10px] text-[var(--kg-text-muted)] mt-0.5">
                  Bổ sung ngay để đảm bảo chuẩn công và tính lương đầy đủ.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedMissingAlert(missingAlerts[0]);
                setMissedModalOpen(true);
              }}
              className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-xs whitespace-nowrap active:scale-95 transition-all flex-shrink-0"
            >
              Báo ngay →
            </button>
          </div>
        </div>
      )}

      {/* Current Shift Status Card (Clean, Informative & Multi-shift Ready) */}
      <div className="bg-[var(--kg-surface)] p-3 rounded-2xl border border-[var(--kg-border)] text-[var(--kg-text)] shadow-xs max-w-md mx-auto space-y-2.5">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 font-bold">
              <Clock size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black text-[var(--kg-text-muted)] uppercase tracking-wider">Hôm nay</p>
              <h4 className="text-xs font-black text-[var(--kg-text)] truncate">
                {currentUser?.fullname || 'Nhân viên'}
              </h4>
            </div>
          </div>

          <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-xl flex-shrink-0 border ${
            recommendation.isOpenShift
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
              : recommendation.isOvernightShift
              ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25'
              : recommendation.hasInToday
              ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25'
              : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
          }`}>
            {recommendation.isOvernightShift ? (
              <>
                <Moon size={11} />
                <span>Ca đêm ({recommendation.openShiftTime})</span>
              </>
            ) : recommendation.isOpenShift ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Đang trong Ca {recommendation.shiftIndex} ({recommendation.openShiftTime})</span>
              </>
            ) : recommendation.shiftIndex > 1 ? (
              <span>✓ Xong Ca {recommendation.shiftIndex - 1} • Chờ Ca {recommendation.shiftIndex}</span>
            ) : recommendation.hasInToday ? (
              <span>✓ Đã vào ca</span>
            ) : (
              <span>Chưa vào ca</span>
            )}
          </span>
        </div>

        {/* Quick Shift Pulse / Team Attendance Banner */}
        <div className="pt-2 border-t border-[var(--kg-border)]/60 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--kg-text-muted)] min-w-0 flex-1">
            <Sparkles size={12} className="text-blue-500 flex-shrink-0" />
            <span className="truncate font-medium">{recommendation.reason}</span>
          </div>

          <button
            type="button"
            onClick={() => setEmployeeAttendanceModalOpen(true)}
            className="px-2 py-1 sm:px-2.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-[10px] flex items-center gap-1 whitespace-nowrap transition active:scale-95 flex-shrink-0"
            title="Xem danh sách ca toàn đội hôm nay"
          >
            <Users size={12} />
            <span>Toàn đội →</span>
          </button>
        </div>
      </div>

      {/* GPS Status Card */}
      <div className="bg-[var(--kg-surface)] p-3.5 sm:p-5 rounded-2xl md:rounded-3xl relative overflow-hidden border border-[var(--kg-border)] text-[var(--kg-text)] shadow-xs max-w-md mx-auto">
        <div className="absolute -right-4 -top-4 opacity-5 text-8xl transform rotate-12 text-blue-600/10 pointer-events-none"><MapPin size={100} /></div>
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-start space-x-3 min-w-0">
            <div className={`p-2.5 sm:p-3 rounded-2xl relative flex-shrink-0 ${gps.isValid ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
              <MapPin className="relative z-10" size={20} />
              {gps.status.includes('Đang') && <div className="gps-ping absolute inset-0 rounded-2xl" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[10px] font-black text-[var(--kg-text-muted)] uppercase tracking-wider">Định vị GPS (≤20m)</p>
                {gps.accuracy && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    ±{gps.accuracy}m
                  </span>
                )}
                <KgFeatureTip
                  title="Mẹo Định vị GPS chính xác"
                  tips={[
                    "Vị trí chuẩn: Khuôn viên nhà hàng King's Grill (bán kính ≤20m).",
                    "Cần bật Quyền truy cập vị trí và Vị trí chính xác (Precise Location) trên Safari/Chrome.",
                    "Nếu sóng yếu hoặc báo Chưa nhận được vị trí, hãy bấm 'Làm mới' hoặc 'Quét lại vị trí (GPS Vệ Tinh)'."
                  ]}
                  size="sm"
                  variant="subtle"
                />
              </div>
              <h3 className="font-black text-xs sm:text-sm mt-0.5 leading-tight break-words text-[var(--kg-text)] pr-2">
                {gps.address ? gps.address : gps.status}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <div className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-black border ${gps.isValid ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'}`}>
                  <span className="truncate">{gps.message}</span>
                </div>
                {gps.isValid && (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    ✓ Đủ điều kiện
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={restartGps}
            disabled={isPrecisionScanning}
            className="text-xs bg-[var(--kg-primary)] hover:opacity-90 text-white px-3 py-2 rounded-xl transition font-black flex items-center min-h-[44px] touch-manipulation shadow-xs active:scale-95 flex-shrink-0 disabled:opacity-60"
          >
            <RefreshCw size={13} className={`mr-1.5 ${isPrecisionScanning || gps.status.includes('Đang') ? 'animate-spin' : ''}`} />
            {isPrecisionScanning ? 'Đang quét...' : 'Làm mới'}
          </button>
        </div>

        {/* Live Multi-Sample Precision Radar Scan Feedback */}
        {isPrecisionScanning && (
          <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/25 rounded-2xl animate-fade-in text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Radio size={16} className="text-blue-600 dark:text-blue-400 animate-pulse flex-shrink-0" />
                <span className="font-black text-blue-700 dark:text-blue-300 truncate">
                  Đang dò sóng vệ tinh ({scanProgress.current}/{scanProgress.total} mẫu)...
                </span>
              </div>
              {scanProgress.bestAcc !== null && (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-700 dark:text-blue-300 flex-shrink-0">
                  Sai số: ±{scanProgress.bestAcc}m
                </span>
              )}
            </div>
            <div className="w-full bg-blue-200/50 dark:bg-blue-950/60 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(15, (scanProgress.current / scanProgress.total) * 100))}%` }}
              />
            </div>
            <p className="text-[10px] text-[var(--kg-text-muted)] mt-1.5 font-medium">
              Đang loại bỏ vị trí cache cũ, tự động chọn mẫu vệ tinh có sai số nhỏ nhất.
            </p>
          </div>
        )}

        {/* Dedicated In-Store Satellite Rescan for Staff */}
        {!gps.isValid && gps.lat !== null && !isPrecisionScanning && (
          <div className="mt-3 pt-2.5 border-t border-[var(--kg-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-gradient-to-r from-blue-500/15 via-blue-500/10 to-indigo-500/10 p-3 rounded-2xl border border-blue-500/30 animate-fade-in shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-600/15 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                <Crosshair size={18} className="animate-spin" style={{ animationDuration: '6s' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-blue-700 dark:text-blue-300 leading-tight">
                  Đang ở quán nhưng chưa nhận diện?
                </p>
                <p className="text-[10px] text-[var(--kg-text-muted)] mt-0.5">
                  Lấy mẫu vệ tinh mới nhất (bỏ qua cache) để khóa vị trí chính xác
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePrecisionRescan}
              className="w-full sm:w-auto px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl min-h-[40px] touch-manipulation flex items-center justify-center gap-1.5 flex-shrink-0 active:scale-95 transition shadow-xs whitespace-nowrap"
            >
              <Radio size={14} />
              Quét lại vị trí (GPS Vệ Tinh)
            </button>
          </div>
        )}

        {/* Admin Quick Fix Calibrate Banner */}
        {((currentUser?.role === 'admin' || currentUser?.username === 'ADMIN') && !gps.isValid && gps.lat !== null) && (
          <div className="mt-3 pt-2.5 border-t border-[var(--kg-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/20">
            <div className="text-xs">
              <p className="font-black text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <span>🎯</span> <b>Quản lý:</b> Đang ở nhà hàng?
              </p>
              <p className="text-[10px] text-[var(--kg-text-muted)] mt-0.5 font-medium">
                Đặt tọa độ hiện tại làm vị trí gốc chuẩn (Bán kính 20m).
              </p>
            </div>
            <button
              type="button"
              onClick={handleAdminCalibrateGps}
              className="w-full sm:w-auto px-3.5 py-2 bg-[var(--kg-primary)] text-white hover:opacity-90 rounded-xl text-xs font-black shadow-xs transition active:scale-95 min-h-[44px] touch-manipulation whitespace-nowrap flex-shrink-0"
            >
              Đặt vị trí gốc (20m)
            </button>
          </div>
        )}

        {/* Quick GPS out-of-range helper banner for staff */}
        {!gps.isValid && gps.lat !== null && (
          <div className="mt-3 pt-2.5 border-t border-[var(--kg-border)] flex items-center justify-between gap-2.5 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/25 animate-fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-black text-[var(--kg-text)] leading-tight">Chưa vào bán kính 20m?</p>
                <p className="text-[10px] text-[var(--kg-text-muted)] mt-0.5">Gửi giải trình bổ sung công cho quản lý duyệt</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMissedModalOpen(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl min-h-[40px] touch-manipulation flex-shrink-0 active:scale-95 transition shadow-xs whitespace-nowrap"
            >
              Báo công →
            </button>
          </div>
        )}
      </div>

      {/* Camera Viewport: Responsive 4:3 camera & 3:4 HD uncropped preview */}
      <div className={`relative bg-slate-950 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm ${capturedImage ? 'aspect-[3/4] max-h-[460px]' : 'aspect-[4/3] max-h-[300px] sm:max-h-[380px]'} group border-[4px] sm:border-[5px] max-w-sm mx-auto transition-all ${isWithinRadius ? 'border-blue-600' : 'border-red-500'}`}>
        <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-cover mirror-cam ${(cameraError || capturedImage) ? 'hidden' : ''}`} />
        <canvas ref={overlayCanvasRef} className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${(cameraError || capturedImage) ? 'hidden' : ''}`} />
        <canvas ref={canvasRef} className="hidden" />

        {/* Camera Error / No Video */}
        {cameraError && !capturedImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center z-50">
            <CameraOff size={44} className="mb-4 text-slate-500" />
            <p className="mb-2 text-sm font-black">Chưa thể mở camera</p>
            <p className="mb-6 text-xs text-slate-300 leading-normal max-w-[240px]">{cameraErrorMessage || 'Hãy dùng máy ảnh hệ thống điện thoại để chụp ảnh chấm công.'}</p>
            <input type="file" ref={fileInputRef} accept="image/*" capture="user" className="hidden" onChange={handleFileUpload} />
            <KgButton onClick={() => fileInputRef.current?.click()} variant="primary" size="md" icon={Camera} className="w-full max-w-[200px]">
              Chụp ảnh minh chứng
            </KgButton>
            <button onClick={() => startCamera()} className="text-xs text-slate-400 hover:text-white underline flex items-center mt-6 min-h-[44px] p-2">
              <RotateCcw className="mr-1.5" size={13} /> Thử lại Camera WebRTC
            </button>
          </div>
        )}

        {/* Floating timer */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-20">
          <div className="bg-black/60 text-white text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-md font-mono border border-white/10 shadow-md">
            <span>{currentTime}</span>
          </div>
          <div className="bg-red-500 w-2.5 h-2.5 rounded-full animate-pulse shadow-[0_0_8px_red]" />
        </div>

        {/* Floating Locked Notice if Out of Radius */}
        {!isWithinRadius && !capturedImage && (
          <div className="absolute inset-x-4 top-14 z-30 pointer-events-none flex justify-center">
            <span className="bg-rose-600/95 text-white text-xs px-3.5 py-1.5 rounded-full backdrop-blur-sm flex items-center shadow-lg font-bold gap-1.5 border border-rose-400/40 animate-pulse">
              <Lock size={13} className="text-white" />
              Ngoài bán kính {targetRadius}m {currentDist !== null ? `(${currentDist}m)` : ''} • Đã khóa camera
            </span>
          </div>
        )}

        {/* AI Face Detection Overlays (Only when within radius) */}
        {isWithinRadius && !cameraError && !capturedImage && cameraActive && (
          <div className="absolute inset-x-4 top-14 z-30 pointer-events-none flex justify-center">
            {!isFaceModelLoaded && !faceModelUnavailable ? (
              <span className="bg-black/70 text-white text-xs px-3.5 py-1.5 rounded-full backdrop-blur-sm flex items-center shadow-md font-semibold gap-1.5">
                <RefreshCw size={13} className="animate-spin" /> Đang tải AI...
              </span>
            ) : faceModelUnavailable ? (
              <span className="bg-amber-600/90 text-white text-xs px-3.5 py-1.5 rounded-full backdrop-blur-sm flex items-center shadow-md font-bold gap-1.5">
                Camera sẵn sàng • nhận diện khuôn mặt ngoại tuyến
              </span>
            ) : !isFaceDetected ? (
              <span className="bg-amber-600/90 text-white text-xs px-3.5 py-1.5 rounded-full backdrop-blur-sm flex items-center shadow-md font-bold gap-1.5">
                Căn 1 khuôn mặt giữa khung hình
              </span>
            ) : (
              <span className="bg-green-600/90 text-white text-xs px-3.5 py-1.5 rounded-full backdrop-blur-sm flex items-center shadow-md font-bold gap-1.5">
                ✓ Sẵn sàng chụp ảnh
              </span>
            )}
          </div>
        )}

        {/* Controls inside camera viewport */}
        {!capturedImage && !cameraError && (
          <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center space-x-6 z-20">
            <button
              onClick={() => { stopCamera(); setTimeout(startCamera, 300); }}
              className="w-12 h-12 bg-black/50 hover:bg-black/60 text-white rounded-full flex items-center justify-center backdrop-blur-md shadow-lg border border-white/10 active:scale-90 transition-all"
              title="Khởi động lại camera"
            >
              <RotateCcw size={18} />
            </button>
            
            {cameraActive ? (
              !isWithinRadius ? (
                <button
                  type="button"
                  onClick={() => {
                    speak(`Bạn đang ở ngoài bán kính chấm công. Khoảng cách hiện tại ${currentDist ?? 'không xác định'} mét.`);
                    setFeedbackTitle('Ngoài bán kính chấm công (≤20m)');
                    setFeedbackMessage(
                      `Vị trí của bạn đang cách nhà hàng ${currentDist ?? 'quá'}m (quy định ≤ ${targetRadius}m).\n\nĐể đảm bảo tính minh bạch và chống gian lận, camera chụp ảnh chấm công đã được khóa. Vui lòng di chuyển vào khu vực nhà hàng và nhấn "Quét lại" để tiếp tục.`
                    );
                    setFeedbackType('warning');
                    setFeedbackSheetOpen(true);
                  }}
                  aria-label="Camera bị khóa do ngoài bán kính"
                  className="group relative touch-manipulation transition-all duration-300 scale-100 active:scale-95"
                  title="Ngoài bán kính quy định - Đã khóa camera"
                >
                  <div className="absolute inset-0 bg-rose-600 rounded-full opacity-30 scale-110 animate-ping" />
                  <div className="w-16 h-16 bg-rose-950/80 border-4 border-rose-500 rounded-full flex items-center justify-center shadow-lg backdrop-blur-md">
                    <Lock size={22} className="text-rose-400" />
                  </div>
                </button>
              ) : (
                <button
                  onClick={takePhoto}
                  aria-label="Chụp ảnh chấm công"
                  className="group relative touch-manipulation transition-all duration-300 scale-100 active:scale-95"
                >
                  <div className="absolute inset-0 bg-white rounded-full opacity-35 scale-110" />
                  <div className="w-16 h-16 bg-transparent border-4 border-white rounded-full flex items-center justify-center shadow-lg">
                    <div className={`w-11 h-11 rounded-full transition-all ${isFaceDetected ? 'bg-green-500' : 'bg-white'} group-hover:scale-105`} />
                  </div>
                </button>
              )
            ) : (
              <button onClick={() => startCamera()} className="bg-white/20 backdrop-blur text-white p-4 rounded-full min-h-[44px]">
                <RotateCcw size={20} />
              </button>
            )}
          </div>
        )}

        {/* Captured image display with 100% uncropped full watermark */}
        {capturedImage && (
          <div className="absolute inset-0 bg-slate-950 z-30 flex flex-col items-center justify-center animate-fade-in">
            <img src={capturedImage} className="w-full h-full object-contain" alt="Captured with Watermark" />
            
            {/* Top Bar with Status & Actions */}
            <div className="absolute top-3 inset-x-3 z-40 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-1.5 pointer-events-none">
                <span className="bg-emerald-600/95 text-white text-[11px] font-black px-2.5 py-1 rounded-full backdrop-blur-md shadow-md flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  <span>Đã đóng dấu HD</span>
                </span>
                
                {/* 60s Expiration Countdown Pill */}
                <span
                  className={`text-[11px] font-black px-2.5 py-1 rounded-full backdrop-blur-md shadow-md flex items-center gap-1 transition-all ${
                    photoTimeLeftSeconds <= 15
                      ? 'bg-rose-600/95 text-white animate-pulse'
                      : photoTimeLeftSeconds <= 30
                      ? 'bg-amber-600/95 text-white'
                      : 'bg-black/75 text-emerald-400 border border-emerald-500/40'
                  }`}
                  title="Thời hạn ảnh chụp có hiệu lực"
                >
                  <Clock size={12} className={photoTimeLeftSeconds <= 15 ? 'animate-bounce' : 'animate-spin'} />
                  <span>Hiệu lực: {photoTimeLeftSeconds}s</span>
                </span>
              </div>

              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => {
                    store.setPreviewImageUrl(capturedImage);
                    store.setPreviewOpen(true);
                  }}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-black/75 hover:bg-black text-white rounded-full border border-white/20 backdrop-blur-md shadow-md active:scale-95 transition-all text-xs font-bold"
                  title="Xem toàn màn hình"
                >
                  <span>🔍 Xem to</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    store.setCapturedImage(null);
                    setPhotoCapturedAtMs(null);
                    setPhotoTimeLeftSeconds(PHOTO_EXPIRATION_SECONDS);
                  }}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full border border-white/20 backdrop-blur-md shadow-md active:scale-95 transition-all text-xs font-bold"
                >
                  <RotateCcw size={13} />
                  <span>Chụp lại</span>
                </button>
              </div>
            </div>

            {/* Bottom Progress Bar: 60s Visual Depletion */}
            <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/40 overflow-hidden z-40 pointer-events-none">
              <div
                className={`h-full transition-all duration-500 ${
                  photoTimeLeftSeconds <= 15
                    ? 'bg-rose-500'
                    : photoTimeLeftSeconds <= 30
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${(photoTimeLeftSeconds / PHOTO_EXPIRATION_SECONDS) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Primary Action Button: Triggers Smart Confirmation Modal */}
      <div className="max-w-sm mx-auto space-y-2.5">
        <KgButton
          variant="primary"
          size="lg"
          disabled={!canSubmit || (cooldown.isBlocked && currentUser?.role !== 'admin' && currentUser?.role !== 'tester')}
          onClick={() => {
            if (cooldown.isBlocked && currentUser?.role !== 'admin' && currentUser?.role !== 'tester') {
              speak(`Vui lòng đợi thêm ${cooldown.remainingMinutesFormatted} để chấm công lại.`);
              setSpamWarningText(`Quy định chống spam: Bạn vừa chấm công lúc ${cooldown.lastTimeStr || ''}. Vui lòng đợi thêm ${cooldown.remainingMinutesFormatted} trước khi chấm công lần tiếp theo.`);
              setSpamWarningOpen(true);
              return;
            }
            if (!capturedImage) {
              takePhoto();
              return;
            }
            if (!isWithinRadius) {
              speak('Bạn đang ở ngoài bán kính 20m nhà hàng.');
              setFeedbackTitle('Ngoài bán kính chấm công');
              setFeedbackMessage(`Khoảng cách hiện tại: ${currentDist ?? 'quá'}m (quy định ≤ ${targetRadius}m). Vui lòng di chuyển vào nhà hàng để chấm công.`);
              setFeedbackType('warning');
              setFeedbackSheetOpen(true);
              return;
            }
            // Prepare modal state
            setModalChosenType(recommendation.recommendedType);
            setHasAcknowledgedMissingIn(false);
            setConfirmCheckInModalOpen(true);
          }}
          className={`w-full h-14 min-h-[52px] shadow-lg rounded-2xl text-[15px] font-black tracking-wider border-none active:scale-[0.97] transition-all touch-manipulation flex items-center justify-center gap-2.5 ${
            cooldown.isBlocked && currentUser?.role !== 'admin' && currentUser?.role !== 'tester'
              ? 'bg-amber-600 text-white opacity-90'
              : !canSubmit
              ? 'opacity-60 cursor-not-allowed bg-slate-400 text-white'
              : 'bg-[var(--kg-primary)] hover:opacity-90 text-white shadow-md'
          }`}
          icon={Send}
        >
          {cooldown.isBlocked && currentUser?.role !== 'admin' && currentUser?.role !== 'tester'
            ? `⏳ GIÃN CÁCH (${cooldown.remainingMinutesFormatted})`
            : capturedImage ? `🚀 GỬI CHẤM CÔNG (${photoTimeLeftSeconds}s)` : '📸 CHỤP ẢNH ĐỂ CHẤM CÔNG'}
        </KgButton>

        {!canSubmit && (
          <p className="text-[11px] text-center text-[var(--kg-text-muted)] font-medium">
            {cooldown.isBlocked && currentUser?.role !== 'admin' && currentUser?.role !== 'tester'
              ? `⏳ Cần chờ thêm ${cooldown.remainingMinutesFormatted} theo quy định giãn cách 15 phút.`
              : !capturedImage && !isWithinRadius
              ? `⚠️ Ngoài bán kính ${targetRadius}m (${currentDist ?? 'quá'}m). Vui lòng di chuyển vào nhà hàng.`
              : !isWithinRadius
              ? `⚠️ Ngoài bán kính ${targetRadius}m (${currentDist ?? 'quá'}m). Không thể gửi chấm công.`
              : photoTimeLeftSeconds <= 0
              ? '⚠️ Ảnh chụp đã hết hạn 60 giây. Vui lòng chụp lại ảnh mới.'
              : '⚠️ Vui lòng nhấn nút chụp ảnh phía trên để gửi chấm công.'}
          </p>
        )}
      </div>

      {/* Missed Checkin Helper Card - iPhone Ergonomic & High Visibility */}
      <div className="max-w-sm mx-auto pt-2 pb-8">
        <button
          type="button"
          onClick={() => setMissedModalOpen(true)}
          className="w-full p-3.5 min-h-[54px] rounded-2xl bg-gradient-to-r from-amber-500/10 via-[var(--kg-surface)] to-amber-500/5 hover:from-amber-500/15 hover:to-amber-500/10 text-[var(--kg-text)] border border-amber-500/30 text-left shadow-xs transition active:scale-98 touch-manipulation flex items-center justify-between gap-3 group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition">
              <Clock size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-[var(--kg-text)] leading-tight flex items-center gap-1.5">
                <span>Gặp sự cố không chấm được?</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">Trợ giúp</span>
              </p>
              <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 truncate font-medium">
                Gửi giải trình bổ sung công cho quản lý duyệt →
              </p>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center flex-shrink-0 text-[var(--kg-text-muted)] group-hover:text-amber-500 group-hover:border-amber-500/30 transition">
            <ChevronRight size={16} />
          </div>
        </button>
      </div>

      {/* Smart Check-In Type Confirmation Bottom Sheet */}
      <KgBottomSheet
        isOpen={confirmCheckInModalOpen}
        onClose={() => setConfirmCheckInModalOpen(false)}
        title="Xác Nhận Loại Chấm Công"
      >
        <div className="space-y-4 py-1">
          {/* Summary Proof Pill Card */}
          <div className="p-3 bg-[var(--kg-surface-soft)] rounded-2xl border border-[var(--kg-border)] flex items-center gap-3">
            {capturedImage && (
              <div className="w-14 h-16 rounded-xl overflow-hidden bg-slate-900 border border-white/20 flex-shrink-0">
                <img src={capturedImage} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-blue-600 dark:text-blue-400">👑 KING'S GRILL</span>
                <span className="text-[10px] font-mono font-bold text-[var(--kg-text-muted)]">
                  {store.capturedTime || currentTime}
                </span>
              </div>
              <p className="text-xs font-black text-[var(--kg-text)] truncate">
                {currentUser?.fullname} ({currentUser?.username})
              </p>
              <p className="text-[10px] text-[var(--kg-text-muted)] truncate flex items-center gap-1">
                <MapPin size={11} className="text-emerald-500 flex-shrink-0" />
                <span className="truncate">{gps.address || 'Đúng bán kính nhà hàng'}</span>
              </p>
            </div>
          </div>

          {/* Smart Recommendation Banner */}
          <div className="px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2">
            <Sparkles size={15} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-black text-blue-600 dark:text-blue-400">
                Gợi ý: {recommendation.recommendedType.toUpperCase()}
              </p>
              <p className="text-[11px] text-[var(--kg-text-muted)] font-medium leading-tight mt-0.5">
                {recommendation.reason}
              </p>
            </div>
          </div>

          {/* Dynamic Shift Action Choices */}
          {(() => {
            const shiftIdx = recommendation.shiftIndex || 1;
            const inType: CheckInTypeString = shiftIdx === 1 ? 'Vào ca' : `Vào ca ${shiftIdx}`;
            const inLabel = shiftIdx === 1 ? 'VÀO CA' : `VÀO CA ${shiftIdx}`;
            const outType: CheckInTypeString = shiftIdx === 1 ? 'Ra ca' : `Ra ca ${shiftIdx}`;
            const outLabel = shiftIdx === 1 ? 'RA CA' : `RA CA ${shiftIdx}`;

            const isChosenIn = modalChosenType.includes('Vào') || modalChosenType === inType;
            const isChosenOut = modalChosenType.includes('Ra') || modalChosenType === outType;

            const isRecommendedIn = recommendation.recommendedType.includes('Vào');
            const isRecommendedOut = recommendation.recommendedType.includes('Ra');

            return (
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-[var(--kg-text-muted)] mb-2 px-1">
                  Chọn loại chấm công thực tế ({shiftIdx > 1 ? `Lượt ca ${shiftIdx}` : 'Ca chính'}):
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {/* VÀO CA */}
                  <button
                    type="button"
                    onClick={() => handleTypeChangeInModal(inType)}
                    className={`relative p-3.5 rounded-2xl border-2 flex flex-col items-center justify-center min-h-[58px] touch-manipulation transition-all duration-200 active:scale-95 gap-1 ${
                      isChosenIn
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400/40'
                        : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-black text-sm">
                      <LogIn size={18} className={isChosenIn ? 'text-white' : 'text-emerald-500'} />
                      <span>{inLabel}</span>
                      {isChosenIn && <Check size={16} className="text-white" />}
                    </div>
                    {isRecommendedIn && (
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                        isChosenIn ? 'bg-white/20 text-white' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        ⭐ Đề xuất
                      </span>
                    )}
                  </button>

                  {/* RA CA */}
                  <button
                    type="button"
                    onClick={() => handleTypeChangeInModal(outType)}
                    className={`relative p-3.5 rounded-2xl border-2 flex flex-col items-center justify-center min-h-[58px] touch-manipulation transition-all duration-200 active:scale-95 gap-1 ${
                      isChosenOut
                        ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white border-rose-400 shadow-md shadow-rose-600/30 ring-2 ring-rose-400/40'
                        : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-black text-sm">
                      <LogOut size={18} className={isChosenOut ? 'text-white' : 'text-rose-500'} />
                      <span>{outLabel}</span>
                      {isChosenOut && <Check size={16} className="text-white" />}
                    </div>
                    {isRecommendedOut && (
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        isChosenOut ? 'bg-white/20 text-white' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      }`}>
                        {recommendation.isOvernightShift ? <Moon size={10} /> : null}
                        <span>{recommendation.isOvernightShift ? '🌙 Ca đêm' : '⭐ Đề xuất'}</span>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Safety Warning 1: if Ra ca without prior Vào ca */}
          {modalChosenType.includes('Ra') && !recommendation.isOpenShift && !recommendation.hasInToday && (
            <div className="p-3.5 bg-amber-500/10 dark:bg-amber-950/30 border-2 border-amber-500/30 rounded-2xl space-y-2.5 animate-fade-in">
              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs">
                <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                <span>Cảnh báo: Chưa có lượt Vào ca hôm nay!</span>
              </div>
              <p className="text-[11px] text-[var(--kg-text-muted)] leading-relaxed font-medium">
                Hệ thống chưa tìm thấy dữ liệu Vào ca của bạn. Nếu bạn quên chấm Vào ca trước đó, vui lòng báo với Quản lý hoặc gửi giải trình bổ sung công tại app để được duyệt.
              </p>
              <button
                type="button"
                onClick={() => {
                  setConfirmCheckInModalOpen(false);
                  setMissedModalOpen(true);
                }}
                className="w-full py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition active:scale-98"
              >
                <Clock size={15} />
                <span>🚨 Báo sự cố không chấm công được tại app →</span>
              </button>
              <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasAcknowledgedMissingIn}
                  onChange={(e) => setHasAcknowledgedMissingIn(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-black text-amber-700 dark:text-amber-300">
                  Tôi hiểu và xác nhận vẫn muốn chấm {modalChosenType.toUpperCase()}
                </span>
              </label>
            </div>
          )}

          {/* Safety Warning 2: if Ra ca earlier than 15 minutes after Vào ca */}
          {modalChosenType.includes('Ra') && recommendation.isOpenShift && !recommendation.canCheckOutNow && (
            <div className="p-3.5 bg-amber-500/10 dark:bg-amber-950/30 border-2 border-amber-500/30 rounded-2xl space-y-2.5 animate-fade-in">
              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs">
                <Clock size={18} className="flex-shrink-0 mt-0.5" />
                <span>Cảnh báo: Quy định làm việc tối thiểu hơn 15 phút!</span>
              </div>
              <p className="text-[11px] text-[var(--kg-text-muted)] leading-relaxed font-medium">
                Bạn vừa Vào ca lúc <b>{recommendation.openShiftTime}</b> (mới được <b>{recommendation.elapsedMinutes} phút</b>). Theo quy định, sau khi Vào ca cần tối thiểu hơn 15 phút mới được Ra ca (còn thiếu <b>{recommendation.minWaitMinutesRemaining} phút</b>).
              </p>
              <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasAcknowledgedEarlyOut}
                  onChange={(e) => setHasAcknowledgedEarlyOut(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-black text-amber-700 dark:text-amber-300">
                  Tôi xác nhận có việc đột xuất và vẫn muốn RA CA sớm
                </span>
              </label>
            </div>
          )}

          {/* Final Confirmation Action Buttons */}
          {(() => {
            const isOutSelection = modalChosenType.includes('Ra');
            const isMissingInGuard = isOutSelection && !recommendation.isOpenShift && !recommendation.hasInToday && !hasAcknowledgedMissingIn;
            const isEarlyOutGuard = isOutSelection && recommendation.isOpenShift && !recommendation.canCheckOutNow && !hasAcknowledgedEarlyOut;
            const isSubmitDisabled = isMissingInGuard || isEarlyOutGuard || !isWithinRadius || photoTimeLeftSeconds <= 0;

            return (
              <div className="space-y-2 pt-2">
                {/* 60s Expiry Indicator in Modal */}
                <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold transition-all ${
                  photoTimeLeftSeconds <= 15
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 animate-pulse'
                    : photoTimeLeftSeconds <= 30
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                }`}>
                  <div className="flex items-center gap-1.5">
                    <Clock size={15} />
                    <span>Thời hạn hiệu lực ảnh:</span>
                  </div>
                  <span className="font-mono font-black text-sm">
                    {photoTimeLeftSeconds}s
                  </span>
                </div>

                {!isWithinRadius && (
                  <div className="p-3 bg-rose-500/10 border-2 border-rose-500/30 rounded-2xl flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-xs">
                    <Lock size={16} className="flex-shrink-0" />
                    <span>Bạn đang cách nhà hàng {currentDist ?? 'quá'}m (quy định ≤ {targetRadius}m). Đã khóa gửi chấm công.</span>
                  </div>
                )}

                <KgButton
                  variant={modalChosenType.includes('Vào') ? 'primary' : 'danger'}
                  size="lg"
                  disabled={isSubmitDisabled}
                  onClick={() => {
                    setConfirmCheckInModalOpen(false);
                    proceedSubmitCheck(modalChosenType);
                  }}
                  className={`w-full h-13 min-h-[52px] shadow-lg rounded-2xl text-[15px] font-black tracking-wider border-none active:scale-[0.97] transition-all touch-manipulation flex items-center justify-center gap-2 ${
                    modalChosenType.includes('Vào')
                      ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/30'
                      : 'bg-gradient-to-r from-rose-500 via-red-600 to-rose-700 hover:from-rose-600 hover:to-red-700 text-white shadow-rose-600/30'
                  }`}
                  icon={modalChosenType.includes('Vào') ? LogIn : LogOut}
                >
                  XÁC NHẬN CHẤM {modalChosenType.toUpperCase()}
                </KgButton>

                <button
                  type="button"
                  onClick={() => setConfirmCheckInModalOpen(false)}
                  className="w-full py-2.5 text-center text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition min-h-[44px] touch-manipulation"
                >
                  Đóng / Xem lại ảnh
                </button>
              </div>
            );
          })()}
        </div>
      </KgBottomSheet>

      {/* Missed Check-in Claim Modal */}
      {missedModalOpen && (
        <MissedCheckInModal
          isOpen={missedModalOpen}
          onClose={() => {
            setMissedModalOpen(false);
            setSelectedMissingAlert(null);
          }}
          defaultType={selectedMissingAlert ? selectedMissingAlert.missingType : (modalChosenType.includes('Ra') ? 'Ra ca' : 'Vào ca')}
          defaultDate={selectedMissingAlert ? selectedMissingAlert.dateStr : undefined}
          defaultTime={selectedMissingAlert ? selectedMissingAlert.timeStr : undefined}
          defaultReason="Quên bấm máy khi vào việc gấp"
        />
      )}

      {/* Employee Attendance Monitor Modal */}
      {employeeAttendanceModalOpen && (
        <EmployeeAttendanceMonitor
          isModal
          isOpen={employeeAttendanceModalOpen}
          onClose={() => setEmployeeAttendanceModalOpen(false)}
        />
      )}

      {/* Safety Confirmation for Inverted Type Choice */}
      <KgConfirmSheet
        isOpen={confirmInvertedTypeOpen}
        onClose={() => setConfirmInvertedTypeOpen(false)}
        title="⚠️ Chưa ghi nhận Vào ca!"
        message="Hôm nay hệ thống chưa ghi nhận lượt Vào ca của bạn. Bạn có chắc chắn muốn tiếp tục chấm RA CA không?"
        confirmLabel="Tiếp tục chấm RA CA"
        cancelLabel="Kiểm tra lại"
        variant="warning"
        onConfirm={() => {
          setConfirmInvertedTypeOpen(false);
          proceedSubmitCheck(pendingTypeToSubmit);
        }}
      />

      {/* Spam Warning bottom sheet */}
      <KgBottomSheet isOpen={spamWarningOpen} onClose={() => setSpamWarningOpen(false)} title="Cảnh báo Spam">
        <div className="space-y-4 text-center py-2">
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/40 rounded-full flex items-center justify-center text-amber-500 mx-auto">
            <AlertTriangle size={24} />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {spamWarningText}
          </p>
          <KgButton variant="secondary" size="md" className="w-full" onClick={() => setSpamWarningOpen(false)}>
            Đồng ý
          </KgButton>
        </div>
      </KgBottomSheet>

      {/* Late check-in confirmation bottom sheet */}
      <KgConfirmSheet
        isOpen={confirmLateOpen}
        onClose={() => setConfirmLateOpen(false)}
        title="⚠️ Cảnh báo: Vào ca trễ!"
        message={`Theo lịch đã duyệt, ca làm của bạn bắt đầu vào lúc ${pendingShiftStr}. Bạn đang đi trễ ${pendingLateMins} phút. Bạn có đồng ý tiếp tục chấm công không?`}
        confirmLabel="Đồng ý & Chấm công"
        cancelLabel="Hủy"
        variant="danger"
        onConfirm={() => {
          setConfirmLateOpen(false);
          if (!isWithinRadius) {
            speak('Từ chối chấm công: Bạn đang ở ngoài bán kính 20m.');
            return;
          }
          executeCheck('Vào ca', true, pendingLateMins, pendingShiftStr);
        }}
      />

      {/* General info feedback sheet */}
      <KgBottomSheet isOpen={feedbackSheetOpen} onClose={() => setFeedbackSheetOpen(false)} title={feedbackType === 'success' ? (lastSubmittedPunch?.type === 'Vào ca' ? '🎉 Bắt đầu ca làm việc' : '🎊 Hoàn thành ca làm việc') : 'Thông báo'}>
        {feedbackType === 'success' && lastSubmittedPunch ? (
          <div className="space-y-4 py-2">
            {/* Celebratory Hero Header */}
            <div className="text-center">
              <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-3 shadow-xs ${
                lastSubmittedPunch.type === 'Vào ca'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[var(--kg-primary)] text-white'
              }`}>
                {lastSubmittedPunch.type === 'Vào ca' ? (
                  <Sparkles size={32} className="animate-pulse" />
                ) : (
                  <PartyPopper size={32} className="animate-bounce" />
                )}
              </div>

              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                lastSubmittedPunch.type === 'Vào ca'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
              }`}>
                {lastSubmittedPunch.type === 'Vào ca' ? '🟢 VÀO CA THÀNH CÔNG' : '🔵 RA CA THÀNH CÔNG'}
              </span>

              <h3 className="mt-2 text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {lastSubmittedPunch.type === 'Vào ca' ? 'Điểm Danh Vào Ca Thành Công!' : 'Điểm Danh Ra Ca Thành Công!'}
              </h3>
              
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                {lastSubmittedPunch.type === 'Vào ca'
                  ? 'Chúc bạn một ca làm việc tràn đầy năng lượng, niềm vui và phục vụ khách hàng chu đáo!'
                  : 'Cảm ơn bạn đã cống hiến hết mình cho nhà hàng hôm nay. Hãy nghỉ ngơi và hồi phục thật tốt nhé!'}
              </p>
            </div>

            {/* Synchronized Detail Metrics Card */}
            <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">👤 Nhân sự</span>
                <span className="font-extrabold text-slate-900 dark:text-white text-sm">{lastSubmittedPunch.fullname}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">🕒 Thời gian</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{lastSubmittedPunch.time}</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">💼 Ca làm việc</span>
                <span className={`inline-block px-2.5 py-0.5 rounded-lg font-black text-xs shadow-2xs ${getPreviewShiftClass(lastSubmittedPunch.shift)}`}>
                  {lastSubmittedPunch.shift}
                </span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">📍 Định vị GPS</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={13} /> {lastSubmittedPunch.distMeters} • Hợp lệ
                </span>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">📧 Email gửi về</span>
                <span className="font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[200px]" title={lastSubmittedPunch.email}>
                  {lastSubmittedPunch.email}
                </span>
              </div>
            </div>

            {/* Action button */}
            <button
              type="button"
              onClick={() => setFeedbackSheetOpen(false)}
              className={`w-full py-3.5 rounded-xl font-black text-sm text-white shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${
                lastSubmittedPunch.type === 'Vào ca'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-[var(--kg-primary)] hover:opacity-90'
              }`}
            >
              <CheckCircle2 size={18} />
              Tuyệt vời, hoàn tất
            </button>
          </div>
        ) : (
          <div className="space-y-4 text-center py-2">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
              feedbackType === 'warning' ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'
            }`}>
              {feedbackType === 'warning' ? <AlertTriangle size={24} /> : <UserCheck size={24} />}
            </div>
            <h4 className="text-base font-extrabold text-slate-800 dark:text-white">{feedbackTitle}</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed">
              {feedbackMessage}
            </p>
            <KgButton variant="secondary" size="md" className="w-full" onClick={() => setFeedbackSheetOpen(false)}>
              Đóng
            </KgButton>
          </div>
        )}
      </KgBottomSheet>

      {/* Pulse survey bottom sheet */}
      <KgBottomSheet isOpen={surveyOpen} onClose={() => setSurveyOpen(false)} title="Khảo sát sức khỏe đầu ca">
        <div className="space-y-4 py-2 text-left">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
            Hôm nay bạn cảm thấy thế nào trước khi bắt đầu ca?
          </p>
          
          <div className="grid grid-cols-5 gap-2">
            {[
              { val: 5, emoji: '😍', label: 'Tuyệt vời' },
              { val: 4, emoji: '🙂', label: 'Vui vẻ' },
              { val: 3, emoji: '😐', label: 'Ổn định' },
              { val: 2, emoji: '🙁', label: 'Mệt mỏi' },
              { val: 1, emoji: '😠', label: 'Căng thẳng' },
            ].map((item) => (
              <button
                key={item.val}
                onClick={() => setSurveyEmotion(item.val)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border active:scale-95 transition-all gap-1.5 ${
                  surveyEmotion === item.val
                    ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/30 text-teal-650'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                <span className="text-2xl leading-none">{item.emoji}</span>
                <span className="text-[9px] font-bold text-center leading-none">{item.label}</span>
              </button>
            ))}
          </div>

          {surveyEmotion !== null && (
            <div className="space-y-4 pt-2">
              <KgTextarea
                label="Chia sẻ thêm (không bắt buộc)"
                placeholder="Có vấn đề gì cần quản lý hỗ trợ hay chia sẻ thêm không..."
                value={surveyNote}
                onChange={(e) => setSurveyNote(e.target.value)}
              />
              <div className="flex gap-3">
                <KgButton
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setSurveyOpen(false)}
                  disabled={surveySubmitting}
                >
                  Bỏ qua
                </KgButton>
                <KgButton
                  variant="primary"
                  size="md"
                  className="flex-1"
                  loading={surveySubmitting}
                  onClick={handleSurveySubmit}
                >
                  Gửi khảo sát
                </KgButton>
              </div>
            </div>
          )}
        </div>
      </KgBottomSheet>

    </div>
  );
}
