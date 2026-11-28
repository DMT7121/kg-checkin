import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type LogEntry } from '../store/useAppStore';
import { callApi } from '../services/api';
import KalmanFilter from '../utils/kalman';
import {
  getDist,
  speak,
  getCurrentTimeString,
  getVietnamDateParts,
  computeWeekInfo,
  KG_LAT,
  KG_LNG,
  normalizeGpsRadius,
  KG_STANDARD_ADDRESS,
  getRecommendedCheckInType,
  resolveSmartAttendanceIntent,
  recordLocalMissedClaim,
  setLocalLastPunch,
  auditMissingCheckIns,
  type MissingCheckInAlert,
  type CheckInTypeString,
  getCheckInCooldown,
  auditCheckInAnomalies,
  evaluateCheckInGeofence,
  getScheduleRegistrationWindow,
  isNextWeekScheduleRegistered,
  isScheduleRegistrationRequired
} from '../utils/helpers';
import { useCameraStream } from '../hooks/useCameraStream';
import { captureCheckInFrame } from '../utils/captureCheckInFrame';
import CheckInReceiptSheet, { type SubmittedPunchReceipt } from '../components/checkin/CheckInReceiptSheet';
import {
  formatUnifiedPunchLabel,
  isCheckInLabel,
  isCheckOutLabel,
  isPrimaryFirstCheckInLabel,
} from '../utils/attendanceSequence';
import {
  getCachedFaceProfiles,
  setCachedFaceProfiles,
  subscribeCachedFaceProfiles,
  upsertCachedFaceProfile,
  type RawFaceProfileDto,
} from '../utils/faceProfileCache';
import { refreshAppData } from '../utils/refreshData';
import { renderCheckInWatermarkCanvas } from '../utils/checkinWatermark';
import {
  MapPin,
  RefreshCw,
  CameraOff,
  Camera,
  RotateCcw,
  LogIn,
  LogOut,
  AlertTriangle,
  Clock,
  CalendarClock,
  ShieldCheck,
  CheckCircle2,
  Moon,
  ChevronRight,
  ChevronDown,
  Users,
  Crosshair,
  Radio,
  Lock,
  Maximize2,
  Smile,
  Meh,
  Frown,
  Sun,
  Zap,
  ScanFace,
  UserPlus,
  Loader2,
  Send,
  Wifi
} from 'lucide-react';
import { kgToast } from '../store/useFeedbackStore';
import {
  KgButton,
  KgBottomSheet,
  KgConfirmSheet,
  KgTextarea,
  KgFeatureTip
} from '../components/KgDesignSystem';
import { isWorkEligible } from '../utils/employment';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import {
  enqueueTask,
  savePunchToVault,
  markPunchVaultSynced,
  markPunchVaultEdgeBuffered,
  markPunchVaultImageUploaded,
  markPunchVaultImageQueuedOnEdge,
  subscribePunchStatus,
  markCheckinInFlight,
  clearCheckinInFlight,
  markImageUploadInFlight,
  clearImageUploadInFlight,
  rollbackRejectedPunchGlobally
} from '../utils/offlineQueue';
import MissedCheckInModal from '../components/MissedCheckInModal';
import EmployeeAttendanceMonitor from '../components/EmployeeAttendanceMonitor';
import {
  isAuthorizedTestUser,
  detectGpsSpoofing,
  generateLocationSecurityToken,
  recordGpsSample,
  clearGpsSamples
} from '../utils/antiFraud';

import type { StaffFacePickerCandidate } from '../components/AdminStaffFacePickerModal';

const FastFaceScannerV2 = lazy(() => import('../components/FastFaceScannerV2'));
const FaceEnrollmentModal = lazy(() => import('../components/FaceEnrollmentModal'));
const AdminStaffFacePickerModal = lazy(() => import('../components/AdminStaffFacePickerModal'));

export default function CheckIn() {
  const store = useAppStore(
    useShallow((s) => ({
      currentUser: s.currentUser,
      gps: s.gps,
      capturedImage: s.capturedImage,
      capturedTime: s.capturedTime,
      currentTime: s.currentTime,
      approvedShifts: s.approvedShifts,
      currentWeekApprovedShifts: s.currentWeekApprovedShifts,
      isScheduleRegistered: s.isScheduleRegistered,
      registeredShifts: s.registeredShifts,
      registeredWeekKey: s.registeredWeekKey,
      isScheduleHydrated: s.isScheduleHydrated,
      setScheduleRegistered: s.setScheduleRegistered,
      serverGpsConfig: s.serverGpsConfig,
      logs: s.logs,
      lastCheckInTime: s.lastCheckInTime,
      stats: s.stats,
      setCapturedImage: s.setCapturedImage,
      setCapturedTime: s.setCapturedTime,
      setCurrentTime: s.setCurrentTime,
      setLogs: s.setLogs,
      setStats: s.setStats,
      setGps: s.setGps,
      prependLog: s.prependLog,
      setLastCheckInTime: s.setLastCheckInTime,
      setLoading: s.setLoading,
      setServerGpsConfig: s.setServerGpsConfig,
      setCurrentTab: s.setCurrentTab,
      setPreviewImageUrl: s.setPreviewImageUrl,
      setPreviewOpen: s.setPreviewOpen,
    }))
  );
  const { currentUser, gps, capturedImage, currentTime, approvedShifts } = store;

  // Snapshot of GPS coordinates at the exact moment the photo is taken (prevents indoor GPS drift during modal confirmation)
  const [capturedGps, setCapturedGps] = useState<{
    lat: number;
    lng: number;
    acc: number;
    dist: number;
    address: string;
    message: string;
  } | null>(null);

  // Dual Presence: Restaurant Wi-Fi IP verification from Cloudflare Edge (CF-Connecting-IP)
  const [isRestaurantWifi, setIsRestaurantWifi] = useState(false);
  useEffect(() => {
    let cancelled = false;
    callApi('GET_CLIENT_NETWORK_INFO', {}, { background: true, cacheTtlMs: 30000 })
      .then((res) => {
        if (!cancelled && res?.ok && res.data) {
          setIsRestaurantWifi(Boolean(res.data.isRestaurantWifi));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Anti-Fraud & Radius validation (synchronized with indoor GPS multipath allowance + Restaurant Wi-Fi indoor rescue)
  const latestGpsConfig = store.serverGpsConfig;
  const targetLat = latestGpsConfig?.lat ?? KG_LAT;
  const targetLng = latestGpsConfig?.lng ?? KG_LNG;
  const targetRadius = normalizeGpsRadius(latestGpsConfig?.radius); // Chuẩn 25m
  const currentDist = (gps.lat !== null && gps.lng !== null)
    ? Math.round(getDist(gps.lat, gps.lng, targetLat, targetLng) * 1000)
    : (gps.distance ?? null);
  const liveIndoorAllowance = Math.min((gps.accuracy || 0) * 0.45, 15);
  const effectiveCurrentDist = currentDist !== null ? Math.max(0, currentDist - liveIndoorAllowance) : null;
  const wifiIndoorRescue =
    isRestaurantWifi &&
    (currentDist === null || currentDist <= Math.max(targetRadius * 10, 350));
  const isAuthorizedTest = isAuthorizedTestUser(currentUser);
  const isWithinRadius = evaluateCheckInGeofence({
    isAuthorizedTest,
    hasCapturedPhoto: Boolean(capturedImage),
    capturedGps,
    liveIsValid: Boolean(gps.isValid) || wifiIndoorRescue,
    liveEffectiveDist: wifiIndoorRescue ? 0 : effectiveCurrentDist,
    targetRadius,
  });

  // Ultra-fast Edge D1 attendance punch hydration (<180ms) across devices so Vào/Ra state is always fresh
  const [fastEdgeLogs, setFastEdgeLogs] = useState<LogEntry[]>([]);

  const refreshFastAttendanceState = useCallback(async () => {
    if (!currentUser?.username && !currentUser?.fullname) return;
    try {
      const res = await callApi(
        'GET_KIOSK_ATTENDANCE_STATE',
        {
          isKiosk: false,
          fastEdge: true,
          username: currentUser.username,
          fullname: currentUser.fullname,
          role: currentUser.role || 'user',
        },
        { background: true, cacheTtlMs: 0, timeoutMs: 4500 }
      );
      if (res?.ok && Array.isArray(res.data?.logs)) {
        const mapped: LogEntry[] = res.data.logs.map((r: any) => ({
          username: String(r.username || ''),
          fullname: String(r.fullname || ''),
          type: String(r.type || 'Vào ca'),
          time: String(r.time || '').replace(/^'/, '').trim(),
          status: String(r.type || '').toLowerCase().startsWith('chờ duyệt')
            ? 'Chờ Admin duyệt'
            : 'Hợp lệ',
          timestamp: Number(r.timestamp || 0),
        }));
        setFastEdgeLogs(mapped);
      }
    } catch {
      // keep existing store logs on offline/transient error
    }
  }, [currentUser?.username, currentUser?.fullname, currentUser?.role]);

  useEffect(() => {
    void refreshFastAttendanceState();
    const onFocusOrVis = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void refreshFastAttendanceState();
      }
    };
    window.addEventListener('focus', onFocusOrVis);
    document.addEventListener('visibilitychange', onFocusOrVis);
    return () => {
      window.removeEventListener('focus', onFocusOrVis);
      document.removeEventListener('visibilitychange', onFocusOrVis);
    };
  }, [refreshFastAttendanceState]);

  const mergedAttendanceLogs = useMemo(() => {
    if (fastEdgeLogs.length === 0) return store.logs;
    const seen = new Set(
      store.logs.map(
        (l) =>
          `${String(l.fullname || '').trim().toLowerCase()}|${String(l.time || '').replace(/^'/, '').trim()}|${String(l.type || '').trim().toLowerCase()}`
      )
    );
    const extras: LogEntry[] = [];
    for (const fl of fastEdgeLogs) {
      const k = `${String(fl.fullname || '').trim().toLowerCase()}|${String(fl.time || '').replace(/^'/, '').trim()}|${String(fl.type || '').trim().toLowerCase()}`;
      if (!seen.has(k)) {
        seen.add(k);
        extras.push(fl);
      }
    }
    return extras.length > 0 ? [...extras, ...store.logs] : store.logs;
  }, [fastEdgeLogs, store.logs]);

  // Smart check-in recommendation & 4-signal context-aware intent engine (06:00 -> 05:59 alternating Vào/Ra)
  const recommendation = getRecommendedCheckInType(mergedAttendanceLogs, currentUser);
  const todayScheduledShift = useMemo(() => {
    const activeTodayShifts = store.currentWeekApprovedShifts ?? approvedShifts;
    if (!Array.isArray(activeTodayShifts)) return null;
    const vnParts = getVietnamDateParts();
    const dayIdx = vnParts.dayOfWeek === 0 ? 6 : vnParts.dayOfWeek - 1;
    return activeTodayShifts[dayIdx] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.currentWeekApprovedShifts, approvedShifts, currentTime]);

  const smartIntent = useMemo(
    () =>
      resolveSmartAttendanceIntent({
        user: currentUser,
        logs: mergedAttendanceLogs,
        todayShift: todayScheduledShift,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, mergedAttendanceLogs, todayScheduledShift, currentTime]
  );

  const missingAlerts = auditMissingCheckIns(mergedAttendanceLogs, currentUser);
  const [selectedMissingAlert, setSelectedMissingAlert] = useState<MissingCheckInAlert | null>(null);

  // Mandatory weekly schedule pre-check-in gate (Thu 00:00 -> Sat 17:00 VN)
  const upcomingWeekInfo = useMemo(() => computeWeekInfo(), [currentTime]);
  const scheduleRegWindow = useMemo(() => getScheduleRegistrationWindow(), [currentTime]);
  const isNextWeekRegistered = isNextWeekScheduleRegistered(
    store.isScheduleRegistered,
    currentUser?.username,
    upcomingWeekInfo,
    store.registeredShifts,
    store.registeredWeekKey
  );
  const isScheduleGateBlocked =
    isScheduleRegistrationRequired(currentUser) &&
    scheduleRegWindow.isMandatoryWindow &&
    !isNextWeekRegistered;

  const goToMandatorySchedule = useCallback(() => {
    try {
      sessionStorage.setItem('kg_hub_subtab_workforce', 'schedule');
      sessionStorage.setItem('kg_schedule_return_tab', 'checkin');
    } catch { /* ignore */ }
    store.setCurrentTab('schedule');
  }, [store]);

  // Live second ticker for real-time 15-minute countdown (only active when user is actually within cooldown lockout)
  const [cooldownTicker, setCooldownTicker] = useState(0);
  const initialCooldown = useMemo(
    () => getCheckInCooldown(mergedAttendanceLogs, currentUser, store.lastCheckInTime),
    [mergedAttendanceLogs, currentUser, store.lastCheckInTime]
  );

  useEffect(() => {
    if (!initialCooldown.isBlocked) return;
    const timer = setInterval(() => setCooldownTicker((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [initialCooldown.isBlocked]);

  const cooldown = useMemo(
    () => getCheckInCooldown(mergedAttendanceLogs, currentUser, store.lastCheckInTime),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mergedAttendanceLogs, currentUser, store.lastCheckInTime, cooldownTicker]
  );
  const anomalies = auditCheckInAnomalies(mergedAttendanceLogs, currentUser);

  // Post-capture confirmation modal, smart disambiguation & verified commit state
  const [confirmCheckInModalOpen, setConfirmCheckInModalOpen] = useState(false);
  const [modalChosenType, setModalChosenType] = useState<CheckInTypeString>(smartIntent.smartSuggestedAction);
  const [userResolvedDisambiguation, setUserResolvedDisambiguation] = useState<CheckInTypeString | null>(null);
  const [comboSupplementTime, setComboSupplementTime] = useState<string>(
    smartIntent.suggestedSupplementTime || '15:00'
  );
  const [comboSupplementReason, setComboSupplementReason] = useState<string>('Quên bấm đầu ca');
  const [quickSupplementSheetOpen, setQuickSupplementSheetOpen] = useState(false);
  const [quickSupplementType, setQuickSupplementType] = useState<'Vào ca' | 'Ra ca'>('Vào ca');
  const [quickSupplementCustomReason, setQuickSupplementCustomReason] = useState<string>('');
  const [isSubmittingQuickSupplement, setIsSubmittingQuickSupplement] = useState(false);
  const [earlyOutPromptOpenInModal, setEarlyOutPromptOpenInModal] = useState(false);
  const [isSubmittingPunch, setIsSubmittingPunch] = useState(false);
  const isSubmittingPunchRef = useRef(false);
  const [hasAcknowledgedEarlyOut, setHasAcknowledgedEarlyOut] = useState(false);
  const [confirmInvertedTypeOpen, setConfirmInvertedTypeOpen] = useState(false);
  const [pendingTypeToSubmit, setPendingTypeToSubmit] = useState<CheckInTypeString>('Vào ca');
  const [employeeAttendanceModalOpen, setEmployeeAttendanceModalOpen] = useState(false);

  useEffect(() => {
    if (smartIntent.suggestedSupplementTime) {
      setComboSupplementTime(smartIntent.suggestedSupplementTime);
    }
  }, [smartIntent.suggestedSupplementTime]);

  // Always keep modalChosenType & watermark synchronized with smart intent when user hasn't manually overridden
  useEffect(() => {
    const targetType = userResolvedDisambiguation || smartIntent.smartSuggestedAction;
    if (modalChosenType !== targetType) {
      handleTypeChangeInModal(targetType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartIntent.smartSuggestedAction, userResolvedDisambiguation]);

  const [missedModalOpen, setMissedModalOpen] = useState(false);

  // Parallel Mode Switcher (v1 Photo Confirmation <-> v2 Ultra-Fast Face ID) & 5-Angle Face Profile state
  const [checkinMode, setCheckinMode] = useState<'v1' | 'v2'>(() => {
    try {
      return localStorage.getItem('kg_checkin_mode_v2') === 'v2' ? 'v2' : 'v1';
    } catch {
      return 'v1';
    }
  });
  const [faceEnrollModalOpen, setFaceEnrollModalOpen] = useState(false);
  const [adminPickerOpen, setAdminPickerOpen] = useState(false);
  const [adminSelectedEnrollTarget, setAdminSelectedEnrollTarget] =
    useState<StaffFacePickerCandidate | null>(null);
  const [allFaceProfiles, setAllFaceProfiles] = useState<RawFaceProfileDto[]>(() =>
    getCachedFaceProfiles()
  );
  const [faceProfilesSynced, setFaceProfilesSynced] = useState(
    () => getCachedFaceProfiles().length > 0
  );
  const [unenrolledV2PromptOpen, setUnenrolledV2PromptOpen] = useState(false);
  const [statusStripExpanded, setStatusStripExpanded] = useState(false);
  const [isShutterFlashing, setIsShutterFlashing] = useState(false);
  const shutterFlashTimerRef = useRef<number | null>(null);

  const triggerShutterFlash = useCallback(() => {
    if (shutterFlashTimerRef.current !== null) {
      window.clearTimeout(shutterFlashTimerRef.current);
    }
    setIsShutterFlashing(true);
    shutterFlashTimerRef.current = window.setTimeout(() => {
      setIsShutterFlashing(false);
      shutterFlashTimerRef.current = null;
    }, 220);
  }, []);

  useEffect(() => {
    return () => {
      if (shutterFlashTimerRef.current !== null) {
        window.clearTimeout(shutterFlashTimerRef.current);
      }
    };
  }, []);
  const v1CameraSuspendedRef = useRef(checkinMode === 'v2');
  v1CameraSuspendedRef.current = checkinMode === 'v2' || faceEnrollModalOpen || adminPickerOpen;
  const stopCameraRef = useRef<() => void>(() => {});

  const switchCheckinMode = useCallback((nextMode: 'v1' | 'v2') => {
    v1CameraSuspendedRef.current = nextMode === 'v2' || faceEnrollModalOpen || adminPickerOpen;
    if (nextMode === 'v2') {
      stopCameraRef.current();
    }
    setCheckinMode(nextMode);
    try {
      localStorage.setItem('kg_checkin_mode_v2', nextMode);
    } catch {
      // ignore storage quota errors
    }
  }, [adminPickerOpen, faceEnrollModalOpen]);

  const openFaceEnrollmentModal = useCallback(() => {
    v1CameraSuspendedRef.current = true;
    stopCameraRef.current();
    setAdminSelectedEnrollTarget(null);
    setFaceEnrollModalOpen(true);
  }, []);

  const openAdminStaffFacePicker = useCallback(() => {
    v1CameraSuspendedRef.current = true;
    stopCameraRef.current();
    setAdminPickerOpen(true);
  }, []);

  const handleCloseFaceEnroll = useCallback(() => {
    setFaceEnrollModalOpen(false);
    setAdminSelectedEnrollTarget(null);
  }, []);

  const handleFaceEnrolledSuccess = useCallback((newDto: RawFaceProfileDto) => {
    upsertCachedFaceProfile(newDto);
    setAllFaceProfiles(getCachedFaceProfiles());
  }, []);

  const refreshFaceProfiles = useCallback(async () => {
    if (!currentUser?.username) return;
    try {
      const res = await callApi(
        'GET_FACE_PROFILES',
        {
          isKiosk: true,
          preloadOnly: true,
          username: currentUser.username,
          role: currentUser.role || 'user',
          fastEdge: true,
        },
        { background: true, cacheTtlMs: 0, timeoutMs: 8000 }
      );
      if (res?.ok && Array.isArray(res.data?.profiles)) {
        setCachedFaceProfiles(res.data.profiles);
        setAllFaceProfiles(res.data.profiles);
      }
    } catch {
      // keep existing profile list on transient offline error
    } finally {
      setFaceProfilesSynced(true);
    }
  }, [currentUser?.username, currentUser?.role]);

  useEffect(() => {
    setAllFaceProfiles(getCachedFaceProfiles());
    const unsub = subscribeCachedFaceProfiles((list) => {
      setAllFaceProfiles(list);
    });
    void refreshFaceProfiles();
    return unsub;
  }, [refreshFaceProfiles]);

  const selfFaceProfile = useMemo(() => {
    if (!currentUser?.username) return null;
    const uname = currentUser.username.trim().toUpperCase();
    return (
      allFaceProfiles.find((p) => String(p.username || '').trim().toUpperCase() === uname) || null
    );
  }, [allFaceProfiles, currentUser?.username]);

  const handleSelectV2Mode = useCallback(() => {
    const cachedProfiles = allFaceProfiles.length > 0 ? allFaceProfiles : getCachedFaceProfiles();
    const isKnownUnenrolled =
      currentUser?.role !== 'admin' &&
      !selfFaceProfile &&
      (faceProfilesSynced || cachedProfiles.length > 0);
    if (isKnownUnenrolled) {
      setUnenrolledV2PromptOpen(true);
      return;
    }
    switchCheckinMode('v2');
  }, [allFaceProfiles, currentUser?.role, faceProfilesSynced, selfFaceProfile, switchCheckinMode]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  const {
    streamRef,
    isStartingRef: isStartingCameraRef,
    cameraActive,
    cameraError,
    setCameraError,
    cameraErrorMessage,
    setCameraErrorMessage,
    startCamera,
    stopCamera,
  } = useCameraStream({
    videoRef,
    suspendedRef: v1CameraSuspendedRef,
    onFallbackToast: speak,
  });
  stopCameraRef.current = stopCamera;

  useEffect(() => {
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
    const s = useAppStore.getState();
    s.setCapturedImage(null);
    s.setCapturedTime(null);
    setCapturedGps(null);
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
  }, []);

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

  const [lastSubmittedPunch, setLastSubmittedPunch] = useState<SubmittedPunchReceipt | null>(null);
  const [pendingSurveyAfterPunch, setPendingSurveyAfterPunch] = useState(false);

  // Clock initialization
  useEffect(() => {
    const cur = getCurrentTimeString();
    const s = useAppStore.getState();
    if (s.currentTime !== cur) {
      s.setCurrentTime(cur);
    }
  }, []);

  // Listen to background Punch Vault sync updates
  useEffect(() => {
    const unsubscribe = subscribePunchStatus((update) => {
      if (update.status === 'synced') {
        setLastSubmittedPunch((prev) =>
          prev ? { ...prev, sheetSaved: true, edgeBuffered: false } : prev
        );
        const curState = useAppStore.getState();
        if (update.checkinId) {
          curState.setLogs(
            curState.logs.map((l) =>
              l.checkinId === update.checkinId
                ? {
                    ...l,
                    status: 'Hợp lệ',
                    sheetSynced: true,
                    edgeBuffered: false,
                    localQueued: false,
                  }
                : l
            )
          );
        }
        const weekInfo = computeWeekInfo();
        const user = curState.currentUser;
        if (user) {
          callApi('GET_DATA', {
            username: user.username,
            fullname: user.fullname,
            role: user.role,
            monthSheet: weekInfo.monthSheet,
            weekLabel: weekInfo.weekLabel,
            forceRefresh: true,
            cacheBuster: Date.now()
          }, { background: true, cacheTtlMs: 0 }).then((dataRes) => {
            if (dataRes?.ok) {
              const s = useAppStore.getState();
              s.setLogs(dataRes.data.logs || []);
              s.setStats(dataRes.data.stats || s.stats);
            }
          });
        }
      } else if (update.status === 'failed') {
        setLastSubmittedPunch(null);
        setFeedbackTitle('Chấm công bị từ chối hoặc chưa thể ghi Sheet');
        setFeedbackMessage(update.message || 'Máy chủ không thể ghi nhận lượt chấm công này vào Google Sheets. Vui lòng kiểm tra kết nối và chấm lại.');
        setFeedbackType('warning');
        setFeedbackSheetOpen(true);
      }
    });
    return unsubscribe;
  }, []);

  // Reverse Geocoding - Zero network overhead for restaurant vicinity
  const lastGeocodeRef = useRef<{lat: number, lng: number} | null>(null);
  useEffect(() => {
    if (gps.lat && gps.lng && gps.isValid) {
      // Fast static resolve: If within 60m of restaurant coordinates, immediately bind standardized address without API fetch
      const distToKg = getDist(gps.lat, gps.lng, KG_LAT, KG_LNG) * 1000;
      if (distToKg <= 60) {
        if (gps.address !== KG_STANDARD_ADDRESS) {
          const s = useAppStore.getState();
          s.setGps({ ...s.gps, address: KG_STANDARD_ADDRESS });
        }
        return;
      }

      const last = lastGeocodeRef.current;
      if (!last || getDist(gps.lat, gps.lng, last.lat, last.lng) * 1000 > 30) {
        lastGeocodeRef.current = { lat: gps.lat, lng: gps.lng };
        callApi('GEOCODE', { lat: gps.lat, lng: gps.lng }, { background: true }).then((res) => {
          if (res?.ok && res.data?.address) {
            const s = useAppStore.getState();
            s.setGps({ ...s.gps, address: res.data.address });
          }
        });
      }
    }
  }, [gps.lat, gps.lng, gps.isValid, gps.address]);

  // GPS Logic - Adaptive Ultra-Fast & High-Precision Lock
  const handleGpsSuccess = useCallback((pos: GeolocationPosition, isFastStart: boolean) => {
    // Record raw sample into ring buffer for anti-spoofing heuristic analysis
    recordGpsSample(pos, isFastStart);

    // If a slow coarse fast-start callback arrives AFTER live watchPosition has already locked a valid GPS fix, ignore it!
    if (isFastStart && prevGpsValidRef.current === true) {
      return;
    }

    const rawLat = pos.coords.latitude;
    const rawLng = pos.coords.longitude;
    const acc = pos.coords.accuracy;

    const s = useAppStore.getState();
    const latestGpsConfig = s.serverGpsConfig;
    const targetLat = latestGpsConfig?.lat ?? KG_LAT;
    const targetLng = latestGpsConfig?.lng ?? KG_LNG;
    const targetRadius = normalizeGpsRadius(latestGpsConfig?.radius); // Chuẩn 25m
    const isAuthorizedTest = isAuthorizedTestUser(s.currentUser);

    const rawDist = getDist(rawLat, rawLng, targetLat, targetLng) * 1000;
    // Indoor tolerance: Compensate for structural signal attenuation (max 15m deduction synchronized with GAS & v2)
    const indoorAllowance = Math.min(acc * 0.45, 15);
    const rawEffectiveDist = Math.max(0, rawDist - indoorAllowance);

    // Phase 1: Fast Seed Check
    if (isFastStart) {
      if (rawDist <= targetRadius || rawEffectiveDist <= targetRadius || isAuthorizedTest) {
        // Fast cached position is within restaurant: lock immediately!
        kalmanLatRef.current.filter(rawLat, 0, acc);
        kalmanLngRef.current.filter(rawLng, 0, acc);
        s.setGps({
          lat: rawLat,
          lng: rawLng,
          isValid: true,
          status: isAuthorizedTest ? 'Vị trí Test (Bypass)' : 'Vị trí Siêu tốc',
          message: `Khoảng cách: ${Math.round(rawDist)}m / ${targetRadius}m (Sai số ±${Math.round(acc)}m)`,
          accuracy: Math.round(acc),
          distance: Math.round(rawDist),
          address: rawDist <= 60 ? KG_STANDARD_ADDRESS : undefined
        });
        if (prevGpsValidRef.current !== true) {
          speak('Vị trí đã hợp lệ, sẵn sàng chấm công');
          prevGpsValidRef.current = true;
        }
      } else {
        // Cached position is outside. Do NOT prematurely fail or play negative audio!
        // Show optimistic satellite loading while continuous high-precision hardware lock engages.
        s.setGps({
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
    const liveEffectiveDist = Math.max(0, dist - indoorAllowance);
    const isLiveValid = (dist <= targetRadius || liveEffectiveDist <= targetRadius || isAuthorizedTest);

    if (isLiveValid) {
      consecutiveInvalidCountRef.current = 0;
      s.setGps({
        lat,
        lng,
        isValid: true,
        status: isAuthorizedTest ? 'Vị trí Test (Bypass)' : (acc <= 15 ? 'Vị trí Chính xác (GPS Vệ Tinh)' : 'Vị trí Hợp lệ'),
        message: `Khoảng cách: ${Math.round(dist)}m / ${targetRadius}m (Sai số ±${Math.round(acc)}m)`,
        accuracy: Math.round(acc),
        distance: Math.round(dist),
        address: dist <= 60 ? KG_STANDARD_ADDRESS : undefined
      });
      if (prevGpsValidRef.current !== true) {
        speak('Vị trí đã hợp lệ, sẵn sàng chấm công');
        prevGpsValidRef.current = true;
      }
    } else {
      // Jitter dampening: if previously valid and within small jitter tolerance (+5m), allow grace reading
      if (prevGpsValidRef.current === true && dist <= targetRadius + 5 && acc >= 15 && consecutiveInvalidCountRef.current < 2) {
        consecutiveInvalidCountRef.current += 1;
      } else {
        consecutiveInvalidCountRef.current = 0;
        s.setGps({
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
  }, []);

  const handleGpsError = useCallback((err: GeolocationPositionError) => {
    const s = useAppStore.getState();
    // Reset watchIdRef so subsequent manual click on "Làm mới" will re-arm watchPosition
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (err.code === err.PERMISSION_DENIED) {
      s.setGps({
        isValid: false,
        status: 'Chưa được cấp quyền vị trí',
        message: 'Bật quyền Vị trí cho trình duyệt rồi nhấn “Làm mới”.'
      });
      return;
    }
    if (err.code === err.TIMEOUT) {
      s.setGps({
        isValid: false,
        status: 'Chưa nhận được vị trí',
        message: 'Ra khu vực thoáng hơn rồi nhấn “Làm mới”.'
      });
      return;
    }
    s.setGps({
      isValid: false,
      status: 'Không thể xác định vị trí',
      message: 'Kiểm tra GPS và kết nối mạng rồi nhấn “Làm mới”.'
    });
  }, []);

  const startGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null) return;
    const s = useAppStore.getState();
    s.setGps({ isValid: false, status: 'Đang định vị siêu tốc...', message: 'Khóa vệ tinh trong giây lát.' });
    if (!navigator.geolocation) {
      s.setGps({ status: 'Thiết bị không hỗ trợ định vị', message: 'Hãy dùng điện thoại có GPS.' });
      return;
    }

    // Tier 1: Instant seed from cached location (short 20s window) - non-blocking
    navigator.geolocation.getCurrentPosition(
      (pos) => handleGpsSuccess(pos, true),
      () => {},
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 20000 }
    );

    // Tier 2: Single persistent high-precision hardware GPS stream (clean single thread, zero conflict)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => handleGpsSuccess(pos, false),
      handleGpsError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
    );
  }, [handleGpsError, handleGpsSuccess]);

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

    // Hard reset kalman, anti-fraud sample buffer, and state
    clearGpsSamples();
    kalmanLatRef.current.hardReset();
    kalmanLngRef.current.hardReset();
    prevGpsValidRef.current = null;
    consecutiveInvalidCountRef.current = 0;

    const s = useAppStore.getState();
    s.setGps({
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
      s.setGps({ status: 'Thiết bị không hỗ trợ định vị', message: 'Hãy dùng điện thoại có GPS.' });
      return;
    }

    const latestGpsConfig = s.serverGpsConfig;
    const targetLat = latestGpsConfig?.lat ?? KG_LAT;
    const targetLng = latestGpsConfig?.lng ?? KG_LNG;
    const targetRadius = normalizeGpsRadius(latestGpsConfig?.radius); // Chuẩn 25m
    const isAuthorizedTest = isAuthorizedTestUser(s.currentUser);

    const samples: Array<{
      lat: number;
      lng: number;
      acc: number;
      dist: number;
      effectiveDist: number;
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
      // Priority 1: Samples that fall within targetRadius (or effectiveDist) or authorized test
      const validSamples = samples.filter((samp) => samp.dist <= targetRadius || samp.effectiveDist <= targetRadius || isAuthorizedTest);
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

      const isInside = (chosen.dist <= targetRadius || chosen.effectiveDist <= targetRadius || isAuthorizedTest);
      useAppStore.getState().setGps({
        lat: chosen.lat,
        lng: chosen.lng,
        isValid: isInside,
        status: isInside
          ? (isAuthorizedTest ? 'Vị trí Test (Bypass)' : 'Vị trí Chính xác (GPS Vệ Tinh)')
          : 'Vị trí quá xa',
        message: `Khoảng cách: ${Math.round(chosen.dist)}m / ${targetRadius}m (Sai số ±${Math.round(chosen.acc)}m)`,
        accuracy: Math.round(chosen.acc),
        distance: Math.round(chosen.dist),
        address: chosen.dist <= 60 ? KG_STANDARD_ADDRESS : undefined
      });

      if (isInside) {
        speak('Vị trí đã hợp lệ, sẵn sàng chấm công');
        prevGpsValidRef.current = true;
      } else {
        speak(`Đã lấy vị trí vệ tinh, khoảng cách ${Math.round(chosen.dist)} mét`);
        prevGpsValidRef.current = false;
      }

      setIsPrecisionScanning(false);

      // Re-engage standard continuous single-stream watch
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => handleGpsSuccess(pos, false),
        handleGpsError,
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    };

    const handleIncomingSample = (pos: GeolocationPosition) => {
      recordGpsSample(pos);
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = pos.coords.accuracy;
      const dist = getDist(lat, lng, targetLat, targetLng) * 1000;
      const indoorAllowance = Math.min(acc * 0.45, 15);
      const effectiveDist = Math.max(0, dist - indoorAllowance);

      samples.push({ lat, lng, acc, dist, effectiveDist });

      const bestAcc = Math.min(...samples.map((samp) => Math.round(samp.acc)));
      const bestDist = Math.min(...samples.map((samp) => Math.round(samp.dist)));

      setScanProgress({
        current: samples.length,
        total: 4,
        bestAcc,
        bestDist
      });

      // Early Exit: If an accurate sample is found within radius, finish immediately without waiting!
      if ((dist <= targetRadius || effectiveDist <= targetRadius || isAuthorizedTest) && acc <= 18 && samples.length >= 2) {
        finishScan();
        return;
      }

      if (samples.length >= 4) {
        finishScan();
      }
    };

    // Burst: watchPosition stream for rapid sample collection
    precisionScanWatchIdRef.current = navigator.geolocation.watchPosition(
      handleIncomingSample,
      handleGpsError,
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    );

    // Generous safety timeout: 5.5s to allow cold GPS GNSS lock
    precisionScanTimeoutRef.current = setTimeout(() => {
      finishScan();
    }, 5500);
  }, [handleGpsError, handleGpsSuccess, isPrecisionScanning, startGpsWatch]);

  const restartGps = useCallback(() => {
    handlePrecisionRescan();
  }, [handlePrecisionRescan]);

  const cleanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Preserves the verified in-radius GPS snapshot right when native camera (<input capture>) opens on mobile
  const preNativeCaptureGpsRef = useRef<{
    lat: number;
    lng: number;
    acc: number;
    dist: number;
    address: string;
    message: string;
    timestampMs: number;
  } | null>(null);

  const drawWatermarkAndSave = (
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    exactTime: string,
    addr: string,
    typeToStamp: CheckInTypeString = modalChosenType || smartIntent.smartSuggestedAction,
    gpsOverride?: { lat: number; lng: number; acc: number; dist: number; address: string; message: string } | null
  ): string | null => {
    if (!isWithinRadius && !gpsOverride) {
      speak(`Bạn đang ở ngoài bán kính ${targetRadius}m. Không thể tạo ảnh đóng dấu.`);
      return null;
    }

    const currentGpsState = useAppStore.getState().gps;
    const activeGpsSnap = gpsOverride || capturedGps;
    const stampLat = activeGpsSnap?.lat ?? currentGpsState.lat ?? 0;
    const stampLng = activeGpsSnap?.lng ?? currentGpsState.lng ?? 0;
    const stampDist = activeGpsSnap?.dist ?? currentDist ?? 0;
    const stampMsg = activeGpsSnap?.message || currentGpsState.message || '';
    const userObj = useAppStore.getState().currentUser;

    const dataUrl = renderCheckInWatermarkCanvas({
      canvas,
      ctx,
      exactTime,
      addr,
      typeToStamp,
      stampLat,
      stampLng,
      stampDist,
      stampMsg,
      targetRadius,
      user: userObj,
      logoImg: logoImgRef.current
    });

    store.setCapturedImage(dataUrl);
    store.setCapturedTime(exactTime);
    return dataUrl;
  };

  const takePhoto = () => {
    if (isScheduleGateBlocked) {
      speak('Bắt buộc đăng ký lịch làm tuần tới trước khi chấm công.');
      setFeedbackTitle(`Chưa đăng ký lịch tuần ${upcomingWeekInfo.weekDisplay}`);
      setFeedbackMessage(
        `Theo quy định từ Thứ 5 đến trước 17:00 Thứ Bảy, 100% nhân sự bắt buộc hoàn thành đăng ký ca làm tuần tới (${upcomingWeekInfo.weekDisplay}) trước khi chấm công Vào/Ra ca.`
      );
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      goToMandatorySchedule();
      return;
    }

    if (!isWithinRadius) {
      speak(`Bạn đang ở ngoài bán kính chấm công. Khoảng cách ${currentDist ?? 'không xác định'} mét.`);
      setFeedbackTitle('Ngoài bán kính chấm công (≤25m)');
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
    // Optimized HD portrait 720x1280 (9:16): crisp watermark legibility + 60% lighter payload & WebKit canvas RAM on iPhone
    const targetW = 720, targetH = 1280;
    const captured =
      video && canvas
        ? captureCheckInFrame({
            video,
            canvas,
            cleanCanvas: cleanCanvasRef.current,
            targetW,
            targetH,
            mirror: true,
          })
        : null;
    if (!canvas || !captured) {
      setCameraErrorMessage('Camera chưa sẵn sàng. Vui lòng chờ một chút rồi thử lại.');
      return;
    }
    cleanCanvasRef.current = captured.cleanCanvas;
    const { ctx, exactTime } = captured;
    
    const currentGps = useAppStore.getState().gps;
    const addr = currentGps.address || KG_STANDARD_ADDRESS;
    const snapGps = {
      lat: currentGps.lat ?? targetLat,
      lng: currentGps.lng ?? targetLng,
      acc: currentGps.accuracy ?? 10,
      dist: currentDist ?? 0,
      address: addr,
      message: currentGps.message || ''
    };
    setCapturedGps(snapGps);

    const activeType = smartIntent.smartSuggestedAction;
    setUserResolvedDisambiguation(null);
    setModalChosenType(activeType);
    setHasAcknowledgedEarlyOut(false);

    drawWatermarkAndSave(canvas, ctx, exactTime, addr, activeType, snapGps);
    triggerShutterFlash();
    const captureTimestampMs = Date.now();
    setPhotoCapturedAtMs(captureTimestampMs);
    setPhotoTimeLeftSeconds(PHOTO_EXPIRATION_SECONDS);

    // Immediately open confirmation bottom sheet for seamless 2-tap iPhone check-in flow
    const isAdminOrTester = currentUser?.role === 'admin' || currentUser?.role === 'tester';
    if (!cooldown.isBlocked || isAdminOrTester) {
      setConfirmCheckInModalOpen(true);
    }
  };

  // Synchronous user-gesture handler for BOTH the camera viewport shutter and the primary "CHỤP ẢNH VÀO CA / RA CA" button.
  // Keeping this 100% synchronous guarantees iOS Safari & Android WebView never drop userActivation before fileInputRef.current.click().
  const handleCaptureTrigger = () => {
    const isCooldownActive = Boolean(cooldown.isBlocked && currentUser?.role !== 'admin');
    if (isCooldownActive) {
      speak(`Vui lòng đợi thêm ${cooldown.remainingMinutesFormatted} để chấm công lại.`);
      setSpamWarningText(
        `Quy định chống trùng lặp: Bạn vừa chấm ${formatUnifiedPunchLabel(cooldown.lastType || 'công')} lúc ${cooldown.lastTimeStr || ''}. Vui lòng đợi thêm ${cooldown.remainingMinutesFormatted} trước lượt chấm tiếp theo.`
      );
      setSpamWarningOpen(true);
      return;
    }

    if (recommendation.isMaxPunchesReached) {
      speak('Bạn đã hoàn thành đủ 4 lượt chấm công trong chu kỳ ngày hôm nay.');
      setFeedbackTitle('Đã đủ 4 lượt chấm công trong ngày');
      setFeedbackMessage(
        'Hệ thống đã ghi nhận đủ 2 cặp Vào ca – Ra ca (4 lượt) trong chu kỳ 06:00 – 05:59 hiện tại. Bạn có thể kiểm tra chi tiết tại tab Lịch sử.'
      );
      setFeedbackType('info');
      setFeedbackSheetOpen(true);
      return;
    }

    if (isScheduleGateBlocked) {
      speak('Bắt buộc đăng ký lịch làm tuần tới trước khi chấm công.');
      setFeedbackTitle(`Chưa đăng ký lịch tuần ${upcomingWeekInfo.weekDisplay}`);
      setFeedbackMessage(
        `Theo quy định từ Thứ 5 đến trước 17:00 Thứ Bảy, 100% nhân sự bắt buộc hoàn thành đăng ký ca làm tuần tới (${upcomingWeekInfo.weekDisplay}) trước khi chấm công Vào ca / Ra ca.`
      );
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      goToMandatorySchedule();
      return;
    }

    if (!isWithinRadius || (!isAuthorizedTest && (gps.lat === null || gps.lng === null))) {
      if (!isPrecisionScanning) {
        if (gps.lat === null || gps.lng === null) {
          startGpsWatch();
        } else {
          handlePrecisionRescan();
        }
      }
      if (gps.lat === null || gps.lng === null) {
        speak('Hệ thống đang lấy vị trí GPS. Vui lòng bật định vị và chờ vài giây.');
        setFeedbackTitle('Đang xác thực vị trí GPS');
        setFeedbackMessage(
          `${gps.status || 'Đang thu nhận tín hiệu GPS...'}\n\nVui lòng đảm bảo đã bật Định vị (GPS) trên điện thoại và cấp quyền Vị trí cho trình duyệt, sau đó bấm chụp lại sau 2–3 giây.`
        );
      } else {
        speak(`Bạn đang ở ngoài bán kính chấm công. Khoảng cách ${currentDist ?? 'không xác định'} mét.`);
        setFeedbackTitle(`Ngoài bán kính chấm công (≤${targetRadius}m)`);
        setFeedbackMessage(
          `Vị trí hiện tại cách nhà hàng ${currentDist ?? 'quá'}m (quy định ≤ ${targetRadius}m).\n\nHệ thống vừa tự động quét lại sóng vệ tinh mới nhất cho bạn. Nếu đang đứng trong nhà hàng, vui lòng chờ 2–3 giây rồi bấm chụp lại.`
        );
      }
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
    const hasLiveVideoFrame = Boolean(
      !cameraError &&
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
    );

    if (hasLiveVideoFrame) {
      takePhoto();
      return;
    }

    // Snapshot valid in-radius GPS before native camera backgrounding
    const currentGps = useAppStore.getState().gps;
    preNativeCaptureGpsRef.current = {
      lat: currentGps.lat ?? targetLat,
      lng: currentGps.lng ?? targetLng,
      acc: currentGps.accuracy ?? 10,
      dist: currentDist ?? 0,
      address: currentGps.address || KG_STANDARD_ADDRESS,
      message: currentGps.message || '',
      timestampMs: Date.now(),
    };

    if (!cameraActive && !isStartingCameraRef.current) {
      void startCamera();
    } else if (video && video.paused) {
      void video.play().catch(() => undefined);
    }

    if (fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      setCameraError(true);
      setCameraErrorMessage('Vui lòng chọn Chụp ảnh minh chứng bằng máy ảnh điện thoại.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isScheduleGateBlocked) {
      speak('Bắt buộc đăng ký lịch làm tuần tới trước khi chấm công.');
      setFeedbackTitle(`Chưa đăng ký lịch tuần ${upcomingWeekInfo.weekDisplay}`);
      setFeedbackMessage(
        `Vui lòng hoàn thành đăng ký ca làm tuần tới (${upcomingWeekInfo.weekDisplay}) trước 17:00 Thứ Bảy rồi thực hiện chấm công.`
      );
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      e.target.value = '';
      goToMandatorySchedule();
      return;
    }

    const recentPreSnap =
      preNativeCaptureGpsRef.current &&
      Date.now() - preNativeCaptureGpsRef.current.timestampMs <= 90_000
        ? preNativeCaptureGpsRef.current
        : null;

    if (!isWithinRadius && !recentPreSnap) {
      speak('Bạn đang ở ngoài bán kính 25m. Không thể tải ảnh minh chứng.');
      setFeedbackTitle('Ngoài bán kính chấm công (≤25m)');
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
        
        // Optimized HD portrait 720x1280 (9:16): crisp watermark legibility + 60% lighter payload & WebKit canvas RAM on iPhone
        const targetW = 720, targetH = 1280;
        const targetWidth = targetW, targetHeight = targetH;
        canvas.width = targetWidth; canvas.height = targetHeight;
        const vw = img.width, vh = img.height;
        const canvasRatio = targetWidth / targetHeight, imgRatio = vw / vh;
        let sx: number, sy: number, sWidth: number, sHeight: number;
        if (imgRatio > canvasRatio) { sHeight = vh; sWidth = vh * canvasRatio; sx = (vw - sWidth) / 2; sy = 0; }
        else { sWidth = vw; sHeight = vw / canvasRatio; sx = 0; sy = (vh - sHeight) / 2; }
        
        ctx.save();
        ctx.filter = 'none';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
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
        
        const currentGps = useAppStore.getState().gps;
        const addr = currentGps.address || recentPreSnap?.address || KG_STANDARD_ADDRESS;
        const snapGps = {
          lat: isWithinRadius ? (currentGps.lat ?? targetLat) : (recentPreSnap?.lat ?? currentGps.lat ?? targetLat),
          lng: isWithinRadius ? (currentGps.lng ?? targetLng) : (recentPreSnap?.lng ?? currentGps.lng ?? targetLng),
          acc: isWithinRadius ? (currentGps.accuracy ?? 10) : (recentPreSnap?.acc ?? currentGps.accuracy ?? 10),
          dist: isWithinRadius ? (currentDist ?? 0) : (recentPreSnap?.dist ?? currentDist ?? 0),
          address: addr,
          message: (isWithinRadius ? currentGps.message : recentPreSnap?.message) || ''
        };
        setCapturedGps(snapGps);
        preNativeCaptureGpsRef.current = null;

        const activeType = smartIntent.smartSuggestedAction;
        setUserResolvedDisambiguation(null);
        setModalChosenType(activeType);
        setHasAcknowledgedEarlyOut(false);

        drawWatermarkAndSave(canvas, ctx, exactTime, addr, activeType, snapGps);
        triggerShutterFlash();
        const captureTimestampMs = Date.now();
        setPhotoCapturedAtMs(captureTimestampMs);
        setPhotoTimeLeftSeconds(PHOTO_EXPIRATION_SECONDS);

        const isAdminOrTester = currentUser?.role === 'admin' || currentUser?.role === 'tester';
        if (!cooldown.isBlocked || isAdminOrTester) {
          setConfirmCheckInModalOpen(true);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleTypeChangeInModal = (newType: CheckInTypeString): string | null => {
    setModalChosenType(newType);
    setHasAcknowledgedEarlyOut(false);
    
    // Re-render watermark in real-time onto canvas using locked capturedGps snapshot
    const canvas = canvasRef.current;
    const cleanCanvas = cleanCanvasRef.current;
    if (canvas && cleanCanvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(cleanCanvas, 0, 0);
        const exactTime = store.capturedTime || `${String(new Date().getDate()).padStart(2, '0')}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()} ${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}:${String(new Date().getSeconds()).padStart(2, '0')}`;
        const addr = capturedGps?.address || useAppStore.getState().gps.address || KG_STANDARD_ADDRESS;
        return drawWatermarkAndSave(canvas, ctx, exactTime, addr, newType, capturedGps);
      }
    }
    return useAppStore.getState().capturedImage;
  };

  // Submit flow triggers
  const submitCheck = async (type: string, skipInvertedGuard = false) => {
    if (isSubmittingPunchRef.current) return;
    const activeLat = capturedGps?.lat ?? gps.lat;
    const activeLng = capturedGps?.lng ?? gps.lng;
    if (!capturedImage || !isWithinRadius || activeLat === null || activeLng === null) return;

    if (!photoCapturedAtMs || Date.now() - photoCapturedAtMs > PHOTO_EXPIRATION_SECONDS * 1000) {
      handlePhotoExpired();
      return;
    }

    const isOutAction = isCheckOutLabel(type);
    // Safety guard: If user manually chose 'Ra ca' without resolving disambiguation and has no active open shift
    if (
      !skipInvertedGuard &&
      isOutAction &&
      !recommendation.isOpenShift &&
      !recommendation.hasInToday &&
      userResolvedDisambiguation !== 'Ra ca'
    ) {
      setConfirmCheckInModalOpen(false);
      setPendingTypeToSubmit(type as CheckInTypeString);
      setConfirmInvertedTypeOpen(true);
      return;
    }

    await proceedSubmitCheck(type);
  };

  const proceedSubmitCheck = async (type: string) => {
    if (isSubmittingPunchRef.current) return;
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

    const activeLat = capturedGps?.lat ?? gps.lat;
    const activeLng = capturedGps?.lng ?? gps.lng;
    if (!isWithinRadius || activeLat === null || activeLng === null) {
      speak('Vị trí chưa hợp lệ. Yêu cầu trong bán kính 25m.');
      setFeedbackTitle('Vị trí ngoài bán kính quy định (≤25m)');
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

    // Anti-spam 15-minute per-employee cooldown check (cross-device via mergedAttendanceLogs)
    const cooldownInfo = getCheckInCooldown(mergedAttendanceLogs, currentUser, useAppStore.getState().lastCheckInTime);
    const isAdminUser = currentUser?.role === 'admin';
    if (cooldownInfo.isBlocked && !isAdminUser) {
      setConfirmCheckInModalOpen(false);
      speak(`Vui lòng đợi thêm ${cooldownInfo.remainingMinutesFormatted} để chấm công lại.`);
      setSpamWarningText(`Quy định chống trùng lặp: Bạn vừa chấm công lúc ${cooldownInfo.lastTimeStr || ''} (${cooldownInfo.minutesSinceLast || 0} phút trước). Hệ thống yêu cầu sau tối thiểu 15 phút mới được chấm tiếp. Thời gian còn lại: ${cooldownInfo.remainingMinutesFormatted}.`);
      setSpamWarningOpen(true);
      return;
    }

    // Late check-in warning (only evaluate on primary 1st Vào ca of workday cycle, never fine 2nd Vào ca, and skip >120m anomaly)
    let lateMinsInfo = 0;
    let shiftString = '';
    const isPrimaryFirstIn = isPrimaryFirstCheckInLabel(type) && recommendation.shiftIndex === 1;
    const activeTodayShifts = store.currentWeekApprovedShifts ?? approvedShifts;
    if (activeTodayShifts) {
      const vnParts = getVietnamDateParts();
      const dayIdx = vnParts.dayOfWeek === 0 ? 6 : vnParts.dayOfWeek - 1;
      const todayShift = activeTodayShifts[dayIdx];
      if (isPrimaryFirstIn && todayShift && todayShift !== 'OFF' && todayShift !== 'OFF#') {
        const parts = todayShift.split(':');
        if (parts.length === 2) {
          const shiftTotal = parseInt(parts[0]) * 60 + parseInt(parts[1]);
          const currentTotal = vnParts.hour * 60 + vnParts.minute;
          if (currentTotal > shiftTotal) {
            lateMinsInfo = currentTotal - shiftTotal;
            if (lateMinsInfo > 5 && lateMinsInfo <= 120) {
              setConfirmCheckInModalOpen(false);
              speak(`Cảnh báo, bạn đang vào ca trễ ${lateMinsInfo} phút.`);

              // Set late variables and open bottom confirmation sheet instead of SweetAlert
              setPendingTypeToSubmit(type as CheckInTypeString);
              setPendingLateMins(lateMinsInfo);
              setPendingShiftStr(todayShift);
              setConfirmLateOpen(true);
              return;
            }
          }
        }
      }
      shiftString = todayShift || 'Không có ca';
    }

    // Directly execute verified check if not late
    await executeCheck(type, false, lateMinsInfo, shiftString);
  };

  // Real execution call — Verified Server / Edge D1 Commit BEFORE mutating local logs/cooldown or announcing success
  const executeCheck = async (
    type: string,
    _isLate: boolean,
    lateMinsInfo: number,
    shiftString: string,
    options?: { imageOverride?: string; supplementSubmittedText?: string }
  ): Promise<boolean> => {
    if (isSubmittingPunchRef.current) return false;
    if (!currentUser) {
      speak('Vui lòng đăng nhập lại để tiếp tục.');
      return false;
    }

    // Hard client + cold-boot server verification gate during T5 00:00 -> T7 17:00 VN
    if (isScheduleRegistrationRequired(currentUser) && getScheduleRegistrationWindow().isMandatoryWindow) {
      if (!useAppStore.getState().isScheduleHydrated && navigator.onLine) {
        await refreshAppData(true);
      }
      const latestState = useAppStore.getState();
      const targetUpcoming = computeWeekInfo();
      const verifiedRegistered = isNextWeekScheduleRegistered(
        latestState.isScheduleRegistered,
        currentUser.username,
        targetUpcoming,
        latestState.registeredShifts,
        latestState.registeredWeekKey
      );
      if (!verifiedRegistered) {
        setConfirmCheckInModalOpen(false);
        speak('Vui lòng đăng ký lịch làm tuần tới trước khi chấm công.');
        setFeedbackTitle(`Bắt buộc đăng ký lịch tuần ${targetUpcoming.weekDisplay}`);
        setFeedbackMessage(
          `Hệ thống chưa ghi nhận lịch đăng ký ca tuần tới (${targetUpcoming.weekDisplay}) của bạn. Vui lòng gửi lịch đủ 7 ngày trước 17:00 Thứ Bảy rồi chấm công lại.`
        );
        setFeedbackType('warning');
        setFeedbackSheetOpen(true);
        goToMandatorySchedule();
        return false;
      }
    }

    const effectiveCapturedImage =
      options?.imageOverride || useAppStore.getState().capturedImage || capturedImage;

    if (!effectiveCapturedImage) {
      speak('Vui lòng chụp ảnh selfie trước khi điểm danh.');
      setFeedbackTitle('Chưa có ảnh minh chứng');
      setFeedbackMessage('Vui lòng chụp ảnh selfie rõ nét trước khi thực hiện điểm danh.');
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return false;
    }

    if (!photoCapturedAtMs || Date.now() - photoCapturedAtMs > PHOTO_EXPIRATION_SECONDS * 1000) {
      handlePhotoExpired();
      return false;
    }

    const activeLat = capturedGps?.lat ?? gps.lat;
    const activeLng = capturedGps?.lng ?? gps.lng;
    const activeAcc = capturedGps?.acc ?? gps.accuracy ?? 10;
    const activeDist = capturedGps?.dist ?? currentDist ?? 0;
    const activeLocation = capturedGps?.address || gps.address || gps.status || KG_STANDARD_ADDRESS;

    if (!isWithinRadius || activeLat === null || activeLng === null) {
      setConfirmCheckInModalOpen(false);
      speak(`Từ chối chấm công: Bạn đang ở ngoài bán kính ${targetRadius}m.`);
      setFeedbackTitle('Từ chối chấm công');
      setFeedbackMessage(`Khoảng cách hiện tại là ${activeDist ?? 'quá'}m (quy định ≤ ${targetRadius}m). Hệ thống không ghi nhận lượt chấm công này.`);
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return false;
    }

    const vnNow = getVietnamDateParts();
    const fallbackExactTime = `${String(vnNow.day).padStart(2, '0')}/${String(vnNow.month).padStart(2, '0')}/${vnNow.year} ${String(vnNow.hour).padStart(2, '0')}:${String(vnNow.minute).padStart(2, '0')}:${String(vnNow.second).padStart(2, '0')}`;

    // Exactly use the photo's captured time, guaranteeing 100% match with the watermark
    const actualTime = store.capturedTime || fallbackExactTime;
    const payloadImage = effectiveCapturedImage;
    const payloadTime = actualTime;
    const capturedTimestamp = photoCapturedAtMs;
    const isClockInType = isCheckInLabel(type);

    const releaseCapturedPreview = () => {
      store.setCapturedImage(null);
      store.setCapturedTime(null);
      setCapturedGps(null);
      setPhotoCapturedAtMs(null);
      setPhotoTimeLeftSeconds(PHOTO_EXPIRATION_SECONDS);
      setUserResolvedDisambiguation(null);
      setConfirmCheckInModalOpen(false);
      if (cleanCanvasRef.current) {
        cleanCanvasRef.current.width = 0;
        cleanCanvasRef.current.height = 0;
        cleanCanvasRef.current = null;
      }
    };

    const effectiveEmail = (currentUser.email && !currentUser.email.includes('@kingsgrill.com'))
      ? currentUser.email
      : (currentUser.username.toLowerCase() === 'admin' ? 'dmt.7121@gmail.com' : (currentUser.email || 'dmt.7121@gmail.com'));

    const isLate = Boolean(lateMinsInfo && lateMinsInfo > 5 && lateMinsInfo <= 120 && isPrimaryFirstCheckInLabel(type));
    const penaltyAmount = isLate ? Math.max(10000, Math.floor(lateMinsInfo / 15) * 10000) : 0;

    const clientCheckinId =
      'CHK_' +
      (currentUser.username ? currentUser.username.replace(/[^a-zA-Z0-9]/g, '') : 'user') +
      '_' +
      Date.now() +
      '_' +
      Math.random().toString(36).substring(2, 7).toUpperCase();
    const timeISO = new Date().toISOString();

    const payload = {
      checkinId: clientCheckinId,
      username: currentUser.username,
      fullname: currentUser.fullname,
      email: effectiveEmail,
      type,
      lat: activeLat,
      lng: activeLng,
      gpsAccuracy: activeAcc,
      distance: activeDist,
      image: payloadImage || null,
      time: payloadTime,
      actualTime: actualTime,
      location: activeLocation,
      shift: shiftString,
      lateMins: lateMinsInfo,
      photoCapturedMs: capturedTimestamp,
      clientNowMs: Date.now(),
      sendEmailAfterUpload: true,
      securityToken: generateLocationSecurityToken(
        currentUser.username,
        activeLat ?? 0,
        activeLng ?? 0,
        payloadTime
      ),
    };

    // INSTANT EDGE SYNC: <100ms Cloudflare D1 write-ahead commit + server-ordered Google Sheets & Drive photo sync
    const fastSyncPayload = {
      ...payload,
      image: 'PENDING',
      fastSync: true,
      instantEdge: true,
    };

    isSubmittingPunchRef.current = true;
    setIsSubmittingPunch(true);
    savePunchToVault(payload);
    markCheckinInFlight(clientCheckinId);

    try {
      let res: any = null;
      let networkErrorOccurred = false;
      try {
        res = await callApi('CHECK_IN_OUT', fastSyncPayload, {
          background: true,
          timeoutMs: 25000,
          maxAttempts: 2,
        });
        if (!res) {
          networkErrorOccurred = true;
        }
      } catch {
        networkErrorOccurred = true;
      }

      const errCode = String(res?.code || res?.data?.code || '');
      const isAlreadyCheckedIn =
        !networkErrorOccurred &&
        (errCode === 'ALREADY_CHECKED_IN' ||
          Boolean(res?.isSpamCooldown && errCode !== 'COOLDOWN_15M' && errCode !== 'COOLDOWN_30M'));

      if (!networkErrorOccurred && (res?.ok || isAlreadyCheckedIn)) {
        const isInstantEdge = Boolean(res?.data?.instantEdgeCommitted);
        const isEdgeBuffered = Boolean(res?.data?.edgeBuffered && res?.data?.sheetSaved === false);
        const isSheetSaved = !isEdgeBuffered;
        const confirmedTime = String(res?.data?.thoiGian || actualTime).replace(/^'/, '');
        const canonicalFullname = String(
          res?.data?.fullname || res?.data?.hoVaTen || currentUser.fullname
        ).trim();

        if (isSheetSaved) {
          markPunchVaultSynced(clientCheckinId, res?.data);
        } else {
          markPunchVaultEdgeBuffered(clientCheckinId, res?.data);
        }
        releaseCapturedPreview();

        // Commit verified state ONLY AFTER Google Sheets or Cloudflare Edge D1 confirmed persistence
        store.prependLog({
          checkinId: clientCheckinId,
          username: currentUser.username,
          fullname: canonicalFullname,
          type: String(res?.data?.loaiChamCong || type),
          time: confirmedTime,
          status: isInstantEdge
            ? 'Đã ghi nhận tức thì • Tự động đồng bộ Sheet & Ảnh'
            : isEdgeBuffered
            ? 'Đám mây bảo lãnh • Đang ghi Sheet'
            : 'Hợp lệ',
          location: String(res?.data?.viTri || activeLocation),
          distance: typeof activeDist === 'number' ? `${Math.round(activeDist)}m` : undefined,
          sheetSynced: isSheetSaved,
          edgeBuffered: isEdgeBuffered,
          localQueued: false,
          image: payloadImage || undefined,
          timestamp: Date.now(),
        });
        setLocalLastPunch(currentUser, type, confirmedTime);
        store.setLastCheckInTime(Date.now());
        if (isClockInType) {
          store.setStats({ ...store.stats, totalCheckIn: store.stats.totalCheckIn + 1 });
        }

        setLastSubmittedPunch({
          type,
          fullname: canonicalFullname,
          time: confirmedTime,
          location: activeLocation,
          distMeters: typeof activeDist === 'number' ? `${Math.round(activeDist)}m` : `<= ${targetRadius}m`,
          isValid: true,
          shift: res?.data?.shift || shiftString,
          email: effectiveEmail,
          sheetSaved: isSheetSaved,
          edgeBuffered: isEdgeBuffered,
          supplementSubmittedText: options?.supplementSubmittedText,
          lateMins: res?.data?.lateMins ?? (isLate ? lateMinsInfo : 0),
          penaltyAmount,
          checklistPending: Boolean(res?.data?.checklistPending),
        });

        if (isClockInType) {
          speak(`Ting! Đã ghi nhận thành công điểm danh ${type}. Chúc bạn ca làm việc vui vẻ!`);
        } else {
          speak(`Ting! Đã ghi nhận thành công điểm danh ${type}. Chúc mừng bạn đã hoàn thành ca làm việc!`);
        }

        setFeedbackTitle(`Điểm Danh ${formatUnifiedPunchLabel(type)} Thành Công!`);
        setFeedbackMessage(
          isSheetSaved
            ? 'Đã ghi nhận trực tiếp vào Bảng chấm công Google Sheets!'
            : 'Đã ghi nhận tức thì! Hệ thống đang tự động ghi vào Bảng chấm công Google Sheets và gắn link ảnh minh chứng Google Drive.'
        );
        setFeedbackType('success');
        setFeedbackSheetOpen(true);

        if (isClockInType && Math.random() < 0.4) {
          setPendingSurveyAfterPunch(true);
        }

        // PIPELINE 2: Stage selfie immediately on Edge (<100ms) so Google Drive link attaches to exact Sheet row even if iPhone screen locks
        if (payloadImage) {
          const uploadPayload = {
            checkinId: clientCheckinId,
            username: currentUser.username,
            fullname: canonicalFullname,
            email: effectiveEmail,
            type,
            location: activeLocation,
            distMeters: activeDist,
            timeISO: res?.data?.timeISO || timeISO,
            time: confirmedTime,
            image: payloadImage,
            sendEmailAfterUpload: true,
            instantEdge: true,
          };

          markImageUploadInFlight(clientCheckinId);
          callApi('UPLOAD_CHECKIN_IMAGE', uploadPayload, {
            background: true,
            timeoutMs: 30000,
            maxAttempts: 2,
          })
            .then((imgRes) => {
              if (imgRes?.ok) {
                const driveUrl = imgRes.data?.url || imgRes.data?.imageUrl;
                if (driveUrl) {
                  markPunchVaultImageUploaded(clientCheckinId, driveUrl);
                  useAppStore.getState().updateLogImage(uploadPayload.time, driveUrl);
                  useAppStore.getState().updateLogImage(uploadPayload.timeISO, driveUrl);
                } else if (imgRes.data?.edgeImageQueued || imgRes.data?.queuedForDrive) {
                  markPunchVaultImageQueuedOnEdge(clientCheckinId);
                }
              } else {
                enqueueTask('UPLOAD_CHECKIN_IMAGE', uploadPayload, {
                  priority: 'high',
                  maxAttempts: 15,
                });
              }
            })
            .catch((imgErr) => {
              console.warn('[CheckIn] Upload checkin image error, enqueued to offline queue:', imgErr);
              enqueueTask('UPLOAD_CHECKIN_IMAGE', uploadPayload, {
                priority: 'high',
                maxAttempts: 15,
              });
            })
            .finally(() => {
              clearImageUploadInFlight(clientCheckinId);
            });
        } else if (effectiveEmail && !res?.data?.emailSentDirectly) {
          const cleanEmailPayload: Record<string, any> = { ...payload };
          delete cleanEmailPayload.image;
          callApi(
            'SEND_EMAIL_NOTIFICATION',
            {
              ...cleanEmailPayload,
              email: effectiveEmail,
              imageUrl: res?.data?.imageUrl || '',
              distMeters: res?.data?.distMeters ?? activeDist,
              isValid: true,
              viTri: res?.data?.viTri || activeLocation,
              timeISO: res?.data?.timeISO || timeISO,
            },
            { background: true, timeoutMs: 25000, maxAttempts: 2 }
          ).catch(() => {});
        }

        // Background sync of logs and stats after 2,500ms
        setTimeout(() => {
          const weekInfo = computeWeekInfo();
          callApi(
            'GET_DATA',
            {
              username: currentUser.username,
              fullname: currentUser.fullname,
              role: currentUser.role,
              monthSheet: weekInfo.monthSheet,
              weekLabel: weekInfo.weekLabel,
              forceRefresh: true,
              cacheBuster: Date.now(),
            },
            { background: true, cacheTtlMs: 0 }
          )
            .then((dataRes) => {
              if (dataRes?.ok) {
                const latestStore = useAppStore.getState();
                latestStore.setLogs(dataRes.data.logs || []);
                latestStore.setStats(dataRes.data.stats || latestStore.stats);
                try {
                  localStorage.setItem('kg_stats', JSON.stringify(dataRes.data.stats));
                } catch {
                  /* ignore quota error */
                }
              }
            })
            .catch(() => {});
        }, 2500);

        return true;
      }

      const isTemporaryServerContention =
        errCode === 'LOCK_TIMEOUT' ||
        errCode === 'SAVE_ERROR' ||
        errCode === 'CONCURRENCY_QUEUED';

      if (networkErrorOccurred || isTemporaryServerContention) {
        releaseCapturedPreview();
        enqueueTask('CHECK_IN_OUT', payload, { priority: 'high', maxAttempts: 20 });
        store.prependLog({
          checkinId: clientCheckinId,
          username: currentUser.username,
          fullname: currentUser.fullname,
          type,
          time: actualTime,
          status: 'Lưu tạm trên máy • Chờ mạng',
          location: activeLocation,
          distance: typeof activeDist === 'number' ? `${Math.round(activeDist)}m` : undefined,
          localQueued: true,
          sheetSynced: false,
          image: payloadImage || undefined,
          timestamp: Date.now(),
        });
        setLocalLastPunch(currentUser, type, actualTime);
        store.setLastCheckInTime(Date.now());
        setLastSubmittedPunch(null);

        speak(
          'Mạng hiện đang gián đoạn. Lượt chấm công đã được lưu bảo mật trên điện thoại và sẽ tự động gửi lên Google Sheets ngay khi có mạng.'
        );
        setFeedbackTitle('Đang ngoại tuyến • Đã lưu tạm trên máy');
        setFeedbackMessage(
          `Hệ thống chưa kết nối được máy chủ Google Sheets lúc ${actualTime}.\n\n• Lượt ${formatUnifiedPunchLabel(type)} và ảnh chụp đã được khóa an toàn trong bộ nhớ chống mất dữ liệu của máy.\n• Ngay khi có Wi-Fi/4G ổn định, ứng dụng sẽ tự động đồng bộ lên Bảng chấm công.`
        );
        setFeedbackType('warning');
        setFeedbackSheetOpen(true);
        return true;
      }

      // Server rejected the punch (validation / cooldown / schedule / max punches): NEVER pollute local logs!
      rollbackRejectedPunchGlobally({
        checkinId: clientCheckinId,
        username: currentUser.username,
        fullname: currentUser.fullname,
        time: actualTime,
        reason: res?.message,
      });

      if (errCode === 'COOLDOWN_15M' || errCode === 'COOLDOWN_30M') {
        releaseCapturedPreview();
        void refreshFastAttendanceState();
        speak('Bạn vừa chấm công trên thiết bị khác. Vui lòng đợi đủ 15 phút giãn cách.');
        setSpamWarningText(
          res?.message ||
            'Hệ thống phát hiện bạn vừa chấm công trong vòng 15 phút gần đây. Không cần chấm lặp lại!'
        );
        setSpamWarningOpen(true);
        return false;
      }

      if (errCode === 'SCHEDULE_REQUIRED') {
        const currentState = useAppStore.getState();
        currentState.setScheduleRegistered(false);
        try {
          localStorage.removeItem(`kg_registered_week_${currentUser.username.trim().toLowerCase()}`);
          localStorage.removeItem(`kg_schedule_reg_v2_${currentUser.username.trim().toLowerCase()}`);
        } catch {
          /* ignore storage error */
        }
        setConfirmCheckInModalOpen(false);
        speak('Bắt buộc đăng ký ca làm tuần tới trước khi chấm công.');
        setLastSubmittedPunch(null);
        setFeedbackTitle('Chưa đăng ký lịch làm tuần tới');
        setFeedbackMessage(
          res?.message ||
            `Bắt buộc đăng ký ca làm tuần tới (${upcomingWeekInfo.weekDisplay}) trước khi chấm công! Vui lòng hoàn tất đăng ký ca rồi chấm công lại.`
        );
        setFeedbackType('warning');
        setFeedbackSheetOpen(true);
        goToMandatorySchedule();
        return false;
      }

      if (errCode === 'PHOTO_EXPIRED' || errCode === 'OUT_OF_RADIUS') {
        releaseCapturedPreview();
      } else {
        setConfirmCheckInModalOpen(false);
      }

      speak('Chấm công bị từ chối bởi máy chủ. Vui lòng kiểm tra thông báo.');
      setLastSubmittedPunch(null);
      setFeedbackTitle('Từ chối chấm công từ máy chủ');
      setFeedbackMessage(
        res?.message || 'Máy chủ từ chối ghi nhận lượt chấm công này. Vui lòng chụp lại ảnh mới và thử lại.'
      );
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return false;
    } finally {
      clearCheckinInFlight(clientCheckinId);
      isSubmittingPunchRef.current = false;
      setIsSubmittingPunch(false);
    }
  };

  const handleSelectCheckInTypeInModal = (choice: 'Vào ca' | 'Ra ca') => {
    if (isSubmittingPunchRef.current || !isWithinRadius || photoTimeLeftSeconds <= 0 || recommendation.isMaxPunchesReached) {
      return;
    }

    if (
      choice === 'Ra ca' &&
      recommendation.isOpenShift &&
      !recommendation.canCheckOutNow &&
      !hasAcknowledgedEarlyOut
    ) {
      setUserResolvedDisambiguation('Ra ca');
      handleTypeChangeInModal('Ra ca');
      setEarlyOutPromptOpenInModal(true);
      return;
    }

    setEarlyOutPromptOpenInModal(false);
    setUserResolvedDisambiguation(choice);
    handleTypeChangeInModal(choice);
    void submitCheck(choice, true);
  };

  const openQuickSupplementSheet = () => {
    const inferredType: 'Vào ca' | 'Ra ca' =
      smartIntent.ambiguityReason === 'LATE_SHIFT_MISSING_IN' || !recommendation.hasInToday
        ? 'Vào ca'
        : smartIntent.unclosedYesterdayDateStr || recommendation.isOpenShift
        ? 'Ra ca'
        : 'Vào ca';
    setQuickSupplementType(inferredType);
    if (smartIntent.suggestedSupplementTime) {
      setComboSupplementTime(smartIntent.suggestedSupplementTime);
    }
    setComboSupplementReason(inferredType === 'Ra ca' ? 'Quên bấm cuối ca' : 'Quên bấm đầu ca');
    setQuickSupplementCustomReason('');
    setQuickSupplementSheetOpen(true);
  };

  const handleSubmitQuickSupplementOnly = async () => {
    if (!currentUser || isSubmittingQuickSupplement) return;
    setIsSubmittingQuickSupplement(true);
    try {
      const vn = getVietnamDateParts();
      const fallbackTodayStr = `${String(vn.day).padStart(2, '0')}/${String(vn.month).padStart(2, '0')}/${vn.year}`;
      const suppDate =
        (quickSupplementType === 'Ra ca' ? smartIntent.unclosedYesterdayDateStr : undefined) ||
        smartIntent.suggestedSupplementDate ||
        fallbackTodayStr;
      const suppTime = (comboSupplementTime || smartIntent.suggestedSupplementTime || '15:00').slice(0, 5);
      const suppReason =
        quickSupplementCustomReason.trim() ||
        comboSupplementReason.trim() ||
        (quickSupplementType === 'Ra ca' ? 'Quên bấm cuối ca' : 'Quên bấm đầu ca');
      const shiftStr = todayScheduledShift || 'Không có ca';

      recordLocalMissedClaim({
        username: currentUser.username,
        fullname: currentUser.fullname,
        date: suppDate,
        time: suppTime,
        type: quickSupplementType,
        shift: shiftStr,
        reason: suppReason,
      });

      const missedPayload = {
        username: currentUser.username,
        fullname: currentUser.fullname,
        date: suppDate,
        time: suppTime,
        type: quickSupplementType,
        shift: shiftStr,
        reason: suppReason,
      };

      const mRes = await callApi('SUBMIT_MISSED_CHECKIN', missedPayload, {
        background: true,
        timeoutMs: 25000,
        maxAttempts: 2,
      }).catch(() => null);

      if (!mRes?.ok) {
        enqueueTask('SUBMIT_MISSED_CHECKIN', missedPayload, { priority: 'high', maxAttempts: 12 });
        kgToast('Đã lưu đơn bổ sung công ngoại tuyến — sẽ tự đồng bộ khi có mạng.', 'info');
      } else {
        kgToast(`Đã gửi đơn bổ sung ${quickSupplementType} (${suppTime}) • Chờ Admin duyệt`, 'success');
      }

      setQuickSupplementSheetOpen(false);
      setConfirmCheckInModalOpen(false);
      void refreshFastAttendanceState();
    } finally {
      setIsSubmittingQuickSupplement(false);
    }
  };

  // 1-Tap Smart Combo: Submit verified "Ra ca" now + submit "Bổ sung Vào ca" for forgotten shift start sequentially
  const handleComboOutAndSupplementIn = async () => {
    if (!currentUser || isSubmittingPunchRef.current) return;
    const vn = getVietnamDateParts();
    const fallbackTodayStr = `${String(vn.day).padStart(2, '0')}/${String(vn.month).padStart(2, '0')}/${vn.year}`;
    const suppDate = smartIntent.suggestedSupplementDate || fallbackTodayStr;
    const suppTime = (comboSupplementTime || smartIntent.suggestedSupplementTime || '15:00').slice(0, 5);
    const suppReason = quickSupplementCustomReason.trim() || comboSupplementReason.trim() || 'Quên bấm đầu ca';
    const shiftStr = todayScheduledShift || 'Không có ca';

    setQuickSupplementSheetOpen(false);
    const restampedRaCaImage = handleTypeChangeInModal('Ra ca') || undefined;
    setUserResolvedDisambiguation('Ra ca');

    const ok = await executeCheck('Ra ca', false, 0, shiftStr, {
      imageOverride: restampedRaCaImage,
      supplementSubmittedText: `Đã gửi bổ sung Vào ca lúc ${suppTime} (${suppDate}) • Chờ Admin duyệt`,
    });
    if (!ok) return;

    recordLocalMissedClaim({
      username: currentUser.username,
      fullname: currentUser.fullname,
      date: suppDate,
      time: suppTime,
      type: 'Vào ca',
      shift: shiftStr,
      reason: suppReason,
    });

    const missedPayload = {
      username: currentUser.username,
      fullname: currentUser.fullname,
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
          enqueueTask('SUBMIT_MISSED_CHECKIN', missedPayload, { priority: 'high', maxAttempts: 12 });
        }
      })
      .catch(() => {
        enqueueTask('SUBMIT_MISSED_CHECKIN', missedPayload, { priority: 'high', maxAttempts: 12 });
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
      note: surveyNote,
      instantEdge: true,
    }, { background: true });
    
    setSurveySubmitting(false);
    setSurveyOpen(false);
    
    setFeedbackTitle('Cảm ơn bạn!');
    setFeedbackMessage("King's Grill trân trọng ý kiến và luôn bên cạnh đồng hành cùng bạn.");
    setFeedbackType('success');
    setFeedbackSheetOpen(true);
  };

  // Init camera & GPS immediately on mount (non-blocking for 4G)
  useEffect(() => {
    if (!v1CameraSuspendedRef.current) {
      startCamera();
    }
    startGpsWatch();
    return () => {
      stopCamera();
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
      if (precisionScanWatchIdRef.current !== null) navigator.geolocation.clearWatch(precisionScanWatchIdRef.current);
      if (precisionScanTimeoutRef.current) clearTimeout(precisionScanTimeoutRef.current);
    };
  }, []);

  // Coordinate camera hardware exclusively between v1 viewfinder and v2 Full-Screen Scanner / Enrollment HUD
  useEffect(() => {
    if (checkinMode === 'v2' || faceEnrollModalOpen) {
      v1CameraSuspendedRef.current = true;
      stopCamera();
      return;
    }
    v1CameraSuspendedRef.current = false;
    if (!capturedImage) {
      startCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkinMode, faceEnrollModalOpen]);

  // iOS Safari / Mobile Lifecycle: auto-resume camera and GPS when returning from background, phone lock, or app switch
  useEffect(() => {
    const handleVisibilityResume = () => {
      if (document.visibilityState === 'visible') {
        const video = videoRef.current;
        const stream = streamRef.current;
        const isStreamDead = !stream || stream.getTracks().some(t => t.readyState === 'ended' || t.muted);
        const isVideoPaused = video && (video.paused || video.ended);

        // Revive camera if inactive or frozen (only when v1 viewfinder owns camera)
        if (!v1CameraSuspendedRef.current && !capturedImage && (isStreamDead || isVideoPaused || !cameraActive)) {
          startCamera();
        }

        // Restart GPS watch if it was suspended or cleared
        if (watchIdRef.current === null && !isPrecisionScanning) {
          startGpsWatch();
        }
      }
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted || document.visibilityState === 'visible') {
        handleVisibilityResume();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityResume);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleVisibilityResume);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityResume);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleVisibilityResume);
    };
  }, [cameraActive, capturedImage, isPrecisionScanning, startCamera, startGpsWatch]);

  const handleAdminCalibrateGps = async () => {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.username !== 'ADMIN')) return;
    if (!gps.lat || !gps.lng) {
      setFeedbackTitle('Chưa có tọa độ');
      setFeedbackMessage('Vui lòng đợi GPS lấy vị trí thiết bị rồi thử lại.');
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return;
    }
    store.setLoading(true, 'Đang lưu vị trí gốc nhà hàng (25m)...');
    try {
      const res = await callApi('UPDATE_GPS_CONFIG', {
        role: currentUser.role || 'admin',
        lat: gps.lat,
        lng: gps.lng,
        radius: 25
      });
      store.setLoading(false);
      if (res?.ok) {
        store.setServerGpsConfig({
          lat: gps.lat,
          lng: gps.lng,
          radius: 25
        });
        store.setGps({
          ...gps,
          isValid: true,
          status: 'Vị trí Chính xác',
          message: 'Khoảng cách: 0m / 25m - Hợp lệ'
        });
        speak('Đã lưu vị trí gốc nhà hàng. Vị trí hợp lệ.');
        setFeedbackTitle('Cập nhật thành công!');
        setFeedbackMessage('Đã đặt vị trí hiện tại làm tọa độ chuẩn của Nhà Hàng (Bán kính 25m). Toàn bộ nhân sự tại quán sẽ chấm công chuẩn xác 100%!');
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

  const activeLat = capturedGps?.lat ?? gps.lat;
  const activeLng = capturedGps?.lng ?? gps.lng;
  const canSubmit = Boolean(capturedImage && isWithinRadius && activeLat !== null && activeLng !== null && photoTimeLeftSeconds > 0);
  const isCooldownBlocked = Boolean(cooldown.isBlocked && currentUser?.role !== 'admin');

  if (currentUser && !isWorkEligible(currentUser)) {
    return <EmploymentStatusNotice user={currentUser} actionLabel="chấm công tại nhà hàng" />;
  }

  return (
    <div className="space-y-2 sm:space-y-2.5 kg-animate-fade-up pb-24 md:pb-4 -mt-1 md:-mt-2">
      {/* Compact Command Bar (Mode Switcher + Desktop Title/Tips/Quick Action) + Unified Status Strip */}
      <div className="w-full max-w-none sm:max-w-[600px] lg:max-w-[1180px] mx-auto space-y-2 sm:space-y-2.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          {/* Desktop/Tablet Compact Inline Header (replaces bulky vertical hero so Camera + CTA fit inside 100dvh) */}
          <div className="hidden md:flex items-center gap-2 min-w-0">
            <h1 className="text-lg xl:text-xl font-extrabold tracking-tight text-[var(--kg-text)] whitespace-nowrap">
              Chấm công GPS
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[10.5px] font-bold font-mono tabular-nums text-[var(--kg-text-muted)] shrink-0">
              ≤{targetRadius}m
            </span>
            <KgFeatureTip
              title="Quy chuẩn Chấm công Hợp lệ"
              tips={[
                "Đứng trong bán kính 25m tại khuôn viên nhà hàng King's Grill.",
                "Bật định vị độ chính xác cao trên điện thoại và cho phép quyền truy cập vị trí.",
                "Đăng ký khuôn mặt đủ 5 góc để quét tự động siêu nhanh không cần bấm xác nhận.",
                "Mỗi nhân viên sau khi chấm công thành công sẽ giãn cách 15 phút trước lượt tiếp theo (tối đa 4 lượt/ngày theo 2 cặp Vào ca – Ra ca)."
              ]}
              size="sm"
              variant="subtle"
              iconType="help"
            />
          </div>

          <div className="w-full md:w-auto md:min-w-[300px] lg:min-w-[320px]">
            <div
              data-testid="checkin-mode-toggle"
              role="tablist"
              aria-label="Chuyển đổi phiên bản chấm công"
              className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] shadow-xs"
            >
              <button
                type="button"
                role="tab"
                aria-selected={checkinMode === 'v1'}
                data-testid="mode-v1-btn"
                onClick={() => switchCheckinMode('v1')}
                className={`kg-pressable min-h-[44px] md:min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-extrabold tracking-tight flex items-center justify-center gap-1.5 transition-colors touch-manipulation ${
                  checkinMode === 'v1'
                    ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] shadow-xs'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <Camera size={15} className="shrink-0" />
                <span>Chụp ảnh (v1)</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={checkinMode === 'v2'}
                data-testid="mode-v2-btn"
                onClick={handleSelectV2Mode}
                className={`kg-pressable min-h-[44px] md:min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-extrabold tracking-tight flex items-center justify-center gap-1.5 transition-colors touch-manipulation ${
                  checkinMode === 'v2'
                    ? 'bg-[var(--kg-primary)] text-[var(--kg-primary-fg)] shadow-xs'
                    : 'text-[var(--kg-text-muted)] hover:text-[var(--kg-text)]'
                }`}
              >
                <ScanFace size={15} className="shrink-0" />
                <span>Face ID Nhanh</span>
                <span
                  className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded font-mono tabular-nums ${
                    checkinMode === 'v2'
                      ? 'bg-black/15 text-[var(--kg-primary-fg)]'
                      : 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)]'
                  }`}
                >
                  V2
                </span>
              </button>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 shrink-0">
            <KgButton
              variant="secondary"
              size="sm"
              icon={Clock}
              className="kg-pressable"
              onClick={() => {
                setSelectedMissingAlert(null);
                setMissedModalOpen(true);
              }}
            >
              Bổ sung công
            </KgButton>
          </div>
        </div>

        {/* Blocking State 1: 15-Minute Anti-Spam Per-Employee Cooldown Banner */}
        {cooldown.isBlocked && currentUser?.role !== 'admin' && (
          <div className="bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/35 rounded-2xl p-3 text-[var(--kg-text)] shadow-xs kg-animate-fade-up">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--kg-warning)] text-white dark:text-[#23170F] flex items-center justify-center flex-shrink-0 shadow-xs mt-0.5">
                <Clock size={18} className="animate-spin" style={{ animationDuration: '8s' }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-[var(--kg-warning)] uppercase tracking-wider">
                    Chống trùng lặp: Giãn cách 15 phút
                  </span>
                  <span className="font-mono tabular-nums text-xs font-black text-[var(--kg-warning)] bg-[var(--kg-surface)] px-2 py-0.5 rounded-lg border border-[var(--kg-warning)]/30">
                    {cooldown.remainingMinutesFormatted}
                  </span>
                </div>
                <p className="text-xs font-bold text-[var(--kg-text)] mt-1">
                  Bạn vừa chấm {formatUnifiedPunchLabel(cooldown.lastType || 'công')} lúc {cooldown.lastTimeStr || ''} ({cooldown.minutesSinceLast || 0} phút trước).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Blocking State 2: Mandatory Schedule Pre-Check-In Gate Card (Thu 00:00 -> Sat 17:00 VN) */}
        {isScheduleGateBlocked && (
          <div className="bg-[var(--kg-warning-soft)] border-2 border-[var(--kg-warning)]/45 rounded-2xl p-3 text-[var(--kg-text)] shadow-sm kg-animate-fade-up space-y-2">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--kg-surface)] text-[var(--kg-warning)] flex items-center justify-center flex-shrink-0 border border-[var(--kg-warning)]/30">
                <CalendarClock size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border border-[var(--kg-danger)]/20 mb-1">
                  Khóa chấm công tạm thời
                </span>
                <h4 className="text-xs sm:text-sm font-black text-[var(--kg-text)] leading-snug">
                  Bắt buộc đăng ký lịch làm tuần {upcomingWeekInfo.weekDisplay} trước khi chấm công
                </h4>
              </div>
            </div>
            <button
              type="button"
              onClick={goToMandatorySchedule}
              className="kg-pressable w-full py-2.5 px-4 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] font-black text-xs sm:text-sm tracking-wide shadow-xs transition-all touch-manipulation flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              <span>ĐĂNG KÝ LỊCH LÀM TUẦN {upcomingWeekInfo.weekDisplay} NGAY</span>
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Unified 3-Item Station Status Strip (Ca / GPS / Geofence <=25m) */}
        <div
          data-testid="checkin-status-strip"
          className="bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-2xl p-1.5 sm:p-2 shadow-xs space-y-1.5"
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2">
            {/* Item 1: Shift Status */}
            <button
              type="button"
              onClick={() => setStatusStripExpanded((v) => !v)}
              aria-expanded={statusStripExpanded}
              className="kg-pressable min-h-[44px] sm:min-h-[40px] rounded-xl bg-[var(--kg-surface-2)] hover:border-[var(--kg-border-strong)] border border-[var(--kg-border)] px-2.5 py-1 text-left transition-colors touch-manipulation flex flex-col justify-center min-w-0 overflow-hidden"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--kg-text-muted)] leading-none truncate">
                Trạng thái ca
              </span>
              <span
                className={`mt-1 inline-flex items-center gap-1 text-[11px] sm:text-xs font-extrabold leading-tight truncate max-w-full ${
                  recommendation.isOpenShift
                    ? 'text-[var(--kg-success)]'
                    : recommendation.isOvernightShift
                    ? 'text-[var(--kg-info)]'
                    : recommendation.hasInToday
                    ? 'text-[var(--kg-primary-ink)]'
                    : 'text-[var(--kg-text)]'
                }`}
              >
                {recommendation.isOpenShift && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-success)] animate-pulse shrink-0" />
                )}
                <span className="truncate">
                  {recommendation.isOvernightShift
                    ? `Đêm ${recommendation.openShiftTime}`
                    : recommendation.isOpenShift
                    ? `Trong ca${smartIntent.openShiftDurationFormatted ? ` • ${smartIntent.openShiftDurationFormatted}` : ''}`
                    : recommendation.hasInToday
                    ? 'Đã vào ca'
                    : 'Chưa vào ca'}
                </span>
              </span>
            </button>

            {/* Item 2: GPS Signal + Refresh */}
            <div className="min-h-[44px] sm:min-h-[40px] rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] pl-2.5 pr-1 py-1 flex items-center justify-between gap-1 min-w-0 overflow-hidden">
              <div className="min-w-0 flex-1 overflow-hidden">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--kg-text-muted)] leading-none truncate">
                  Tín hiệu GPS
                </span>
                <span
                  className={`mt-1 block text-[11px] sm:text-xs font-extrabold font-mono tabular-nums leading-tight truncate ${
                    gps.isValid ? 'text-[var(--kg-success)]' : 'text-[var(--kg-warning)]'
                  }`}
                >
                  {gps.isValid
                    ? gps.accuracy
                      ? `Tốt ±${gps.accuracy}m`
                      : 'Tín hiệu tốt'
                    : gps.lat === null
                    ? 'Đang dò...'
                    : `Cách ${currentDist ?? '?'}m`}
                </span>
              </div>
              <button
                type="button"
                onClick={restartGps}
                disabled={isPrecisionScanning}
                aria-label="Làm mới định vị GPS"
                title="Làm mới định vị GPS"
                className="kg-pressable w-11 h-11 sm:w-8 sm:h-8 min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] -my-1 rounded-lg bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-primary-ink)] flex items-center justify-center transition-colors disabled:opacity-60 shrink-0 touch-manipulation"
              >
                <RefreshCw
                  size={14}
                  className={isPrecisionScanning || gps.status.includes('Đang') ? 'animate-spin' : ''}
                />
              </button>
            </div>

            {/* Item 3: Geofence <= 25m + Dual-Presence Wi-Fi Badge + Mobile Details Toggle */}
            <div className="col-span-2 sm:col-span-1 min-h-[44px] sm:min-h-[40px] rounded-xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] pl-2.5 pr-1 py-1 flex items-center justify-between gap-1.5 min-w-0 overflow-hidden">
              <div className="min-w-0 flex-1 overflow-hidden flex items-center justify-between gap-2 sm:block">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--kg-text-muted)] leading-none truncate">
                  {wifiIndoorRescue && !gps.isValid ? 'Wi-Fi Quán' : 'Geofence'}
                </span>
                <span
                  className={`sm:mt-1 inline-flex items-center gap-1 text-[11px] sm:text-xs font-extrabold font-mono tabular-nums leading-tight truncate max-w-full ${
                    gps.isValid || wifiIndoorRescue
                      ? 'text-[var(--kg-success)]'
                      : 'text-[var(--kg-danger)]'
                  }`}
                >
                  {wifiIndoorRescue ? (
                    <Wifi size={11} className="shrink-0" />
                  ) : (
                    <MapPin size={11} className="shrink-0" />
                  )}
                  <span className="truncate">
                    {gps.isValid && isRestaurantWifi
                      ? `GPS + Wi-Fi ✓`
                      : wifiIndoorRescue
                      ? `Wi-Fi quán ✓`
                      : gps.isValid
                      ? `≤${targetRadius}m ✓`
                      : currentDist !== null
                      ? `${currentDist}/${targetRadius}m`
                      : `≤${targetRadius}m`}
                  </span>
                </span>
              </div>
              {(anomalies.length > 0 || missingAlerts.length > 0) ? (
                <button
                  type="button"
                  onClick={() => setStatusStripExpanded((v) => !v)}
                  aria-expanded={statusStripExpanded}
                  aria-label="Mở cảnh báo ca"
                  className="kg-pressable lg:hidden min-w-[44px] min-h-[44px] -my-1 px-1.5 rounded-lg bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/35 text-[var(--kg-warning)] flex items-center justify-center gap-0.5 text-[11px] font-black font-mono tabular-nums shrink-0 touch-manipulation"
                >
                  <AlertTriangle size={12} />
                  <span>{anomalies.length + missingAlerts.length}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStatusStripExpanded((v) => !v)}
                  aria-expanded={statusStripExpanded}
                  aria-label={statusStripExpanded ? 'Thu gọn chi tiết trạng thái' : 'Mở rộng chi tiết trạng thái'}
                  title={statusStripExpanded ? 'Thu gọn' : 'Chi tiết ca & GPS'}
                  className="kg-pressable lg:hidden w-11 h-11 min-w-[44px] min-h-[44px] -my-1 rounded-lg bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-text-muted)] flex items-center justify-center transition-colors shrink-0 touch-manipulation"
                >
                  <ChevronDown
                    size={15}
                    className={`transition-transform duration-150 ${statusStripExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              )}
            </div>
          </div>

          {isPrecisionScanning && (
            <div className="px-1 pb-0.5 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-bold text-[var(--kg-info)]">
                <span className="inline-flex items-center gap-1">
                  <Radio size={11} className="animate-pulse" />
                  Đang dò vệ tinh ({scanProgress.current}/{scanProgress.total})...
                </span>
                {scanProgress.bestAcc !== null && (
                  <span className="font-mono tabular-nums">±{scanProgress.bestAcc}m</span>
                )}
              </div>
              <div className="w-full bg-[var(--kg-info-soft)] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[var(--kg-info)] h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(15, (scanProgress.current / scanProgress.total) * 100))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* RESPONSIVE WORKSPACE GRID: Camera first on mobile unless details expanded; Desktop 7/5 -> 8/4 spacious camera split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 items-start">
          {/* LEFT 7-8 COLS (Desktop): Expanded Deep Forest Emerald Camera Viewport + Primary Capture CTA */}
          <div className={`${statusStripExpanded ? 'order-2' : 'order-1'} lg:order-1 lg:col-span-7 xl:col-span-8 space-y-2 sm:space-y-2.5`}>
            {/* Camera Viewport: Expanded viewport-fitted Toast Touch station (100dvh safe across Mobile/Tablet/Laptop/Desktop) */}
            <div
              data-testid="v1-camera-viewport"
              style={{
                background: 'radial-gradient(circle at 50% 37%, #3B5547 0%, #1D3126 46%, #111E18 100%)',
              }}
              className={`relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-md w-full max-w-none sm:max-w-[580px] lg:max-w-[680px] xl:max-w-[780px] h-[clamp(360px,54dvh,500px)] sm:h-[clamp(460px,62dvh,640px)] lg:h-[clamp(500px,65dvh,670px)] xl:h-[clamp(540px,67dvh,740px)] group border-[4px] sm:border-[5px] mx-auto transition-all ${
                isWithinRadius ? 'border-[#769E82]' : 'border-[var(--kg-danger)]'
              }`}
            >
              <video ref={videoRef} autoPlay muted playsInline {...{ 'webkit-playsinline': 'true' }} className={`w-full h-full object-cover mirror-cam ${(cameraError || capturedImage) ? 'hidden' : ''}`} />
              <canvas ref={canvasRef} className="hidden" />
              <input
                type="file"
                ref={fileInputRef}
                data-testid="native-camera-file-input"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* Crisp GPU Shutter Capture Flash Overlay */}
              {isShutterFlashing && (
                <div
                  aria-hidden="true"
                  className="kg-shutter-flash z-50"
                />
              )}

              {/* Camera Error / No Video */}
              {cameraError && !capturedImage && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111E18] text-[#F4F6F0] p-6 text-center z-50 kg-animate-fade-up">
                  <CameraOff size={44} className="mb-4 text-[#8DA396]" />
                  <p className="mb-2 text-sm font-black">Chưa thể mở camera trực tiếp</p>
                  <p className="mb-6 text-xs text-[#C4D1C8] leading-normal max-w-[260px]">
                    {cameraErrorMessage || 'Hãy dùng máy ảnh hệ thống điện thoại để chụp ảnh chấm công.'}
                  </p>
                  <KgButton onClick={handleCaptureTrigger} variant="primary" size="md" icon={Camera} className="kg-pressable w-full max-w-[240px]">
                    {recommendation.baseAction === 'Ra ca' ? 'Chụp ảnh Ra ca' : 'Chụp ảnh Vào ca'}
                  </KgButton>
                  <button type="button" onClick={() => void startCamera()} className="kg-pressable text-xs text-[#C4D1C8] hover:text-white underline flex items-center mt-4 min-h-[44px] p-2">
                    <RotateCcw className="mr-1.5" size={13} /> Thử lại Camera trực tiếp
                  </button>
                </div>
              )}

              {/* Crisp Uncluttered Top HUD */}
              <div className="absolute top-3 left-3 right-3 sm:top-3.5 sm:left-3.5 sm:right-3.5 flex justify-between items-center gap-2 pointer-events-none z-20">
                <div className="bg-[#101B15]/92 text-[#F4F6F0] text-[11px] font-bold px-3 py-1.5 rounded-full font-mono tabular-nums border border-white/15 shadow-sm inline-flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isWithinRadius ? 'bg-[#34D399]' : 'bg-[#F87171] animate-pulse'
                    }`}
                  />
                  <span>{currentTime}</span>
                </div>

                {!capturedImage && !cameraError && (
                  <span
                    className={`text-[11px] px-3 py-1 rounded-full inline-flex items-center gap-1 font-bold shadow-sm border ${
                      !isWithinRadius
                        ? 'bg-[#B93F36] text-white border-white/20'
                        : cameraActive
                        ? 'bg-[#1E7550] text-white border-[#7EDBA8]/35'
                        : 'bg-[#101B15]/90 text-[#F4F6F0] border-white/15'
                    }`}
                  >
                    {!isWithinRadius ? (
                      <>
                        <Lock size={11} />
                        <span>
                          Ngoài {targetRadius}m{currentDist !== null ? ` (${currentDist}m)` : ''}
                        </span>
                      </>
                    ) : cameraActive ? (
                      <span>✓ Căn khung • Sẵn sàng</span>
                    ) : (
                      <span>Đang mở camera...</span>
                    )}
                  </span>
                )}
              </div>

              {/* Proportional Face-Framing Oval + Corner-Bracket Guides + Subtle Scan Beam */}
              {isWithinRadius && !cameraError && !capturedImage && cameraActive && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10 pb-14 sm:pb-16">
                  <div
                    aria-hidden="true"
                    className="relative w-[66%] sm:w-[60%] max-w-[280px] sm:max-w-[310px] max-h-[72%] aspect-[3/4]"
                  >
                    {/* Sleek Corner-Bracket Lock Guides */}
                    <span className="absolute -top-2 -left-2 w-6 h-6 border-t-[3px] border-l-[3px] border-[#7EDBA8] rounded-tl-xl" />
                    <span className="absolute -top-2 -right-2 w-6 h-6 border-t-[3px] border-r-[3px] border-[#7EDBA8] rounded-tr-xl" />
                    <span className="absolute -bottom-2 -left-2 w-6 h-6 border-b-[3px] border-l-[3px] border-[#7EDBA8] rounded-bl-xl" />
                    <span className="absolute -bottom-2 -right-2 w-6 h-6 border-b-[3px] border-r-[3px] border-[#7EDBA8] rounded-br-xl" />

                    {/* Warm-Cream Oval Cutout + GPU Scan Beam */}
                    <div className="w-full h-full rounded-[9999px] border-2 border-dashed border-[#FFE1BA]/85 shadow-[0_0_0_9999px_rgba(12,22,17,0.26)] relative overflow-hidden">
                      <div
                        aria-hidden="true"
                        className="kg-scan-beam"
                        style={{ '--kg-scan-travel': 'min(270px, 36dvh)' } as React.CSSProperties}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Controls inside camera viewport — always interactive so shutter is NEVER dead */}
              {!capturedImage && !cameraError && (
                <div className="absolute bottom-4 sm:bottom-5 left-0 right-0 flex justify-center items-center space-x-6 z-20">
                  <button
                    type="button"
                    onClick={() => { stopCamera(); setTimeout(() => void startCamera(), 250); }}
                    className="kg-pressable w-12 h-12 min-w-[48px] min-h-[48px] bg-[#101B15]/90 hover:bg-[#1B2821] text-[#F4F6F0] rounded-full flex items-center justify-center shadow-lg border border-white/20 transition-colors touch-manipulation"
                    title="Khởi động lại camera"
                    aria-label="Khởi động lại camera"
                  >
                    <RotateCcw size={18} />
                  </button>

                  <div className="relative flex items-center justify-center">
                    {!isWithinRadius ? (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[#B93F36] rounded-full opacity-30 scale-110 animate-ping"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[#FFE1BA] rounded-full opacity-35 scale-110"
                      />
                    )}
                    <button
                      type="button"
                      data-testid="viewport-shutter-btn"
                      onClick={handleCaptureTrigger}
                      aria-label="Chụp ảnh chấm công"
                      title={
                        !isWithinRadius
                          ? 'Kiểm tra vị trí GPS & chụp ảnh chấm công'
                          : recommendation.baseAction === 'Ra ca'
                          ? 'Chụp ảnh Ra ca'
                          : 'Chụp ảnh Vào ca'
                      }
                      className="kg-pressable group relative w-16 h-16 min-w-[64px] min-h-[64px] rounded-full overflow-hidden flex items-center justify-center touch-manipulation transition-transform duration-150"
                    >
                      {!isWithinRadius ? (
                        <div className="w-16 h-16 bg-[#3A1412]/90 border-4 border-[#F87171] rounded-full flex items-center justify-center shadow-lg">
                          <Lock size={22} className="text-[#FECACA]" />
                        </div>
                      ) : (
                        <div className="w-16 h-16 bg-transparent border-4 border-[#F4F6F0] rounded-full flex items-center justify-center shadow-lg">
                          <div
                            className={`w-11 h-11 rounded-full transition-transform duration-150 flex items-center justify-center ${
                              cameraActive ? 'bg-[#34D399]' : 'bg-[#F4F6F0]'
                            } group-hover:scale-105`}
                          >
                            {!cameraActive && <Camera size={18} className="text-[#111E18]" />}
                          </div>
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Captured image display with crisp solid action dock */}
              {capturedImage && (
                <div className="absolute inset-0 bg-[#111E18] z-30 flex flex-col items-center justify-center kg-animate-scale-in">
                  <img
                    src={capturedImage}
                    className="w-full h-full object-cover rounded-2xl"
                    alt="Ảnh chấm công có đóng dấu"
                  />

                  <div className="absolute top-2 inset-x-2 z-40 pointer-events-auto">
                    <div className="bg-[#101B15]/95 border border-white/20 rounded-xl px-2 py-1 flex flex-wrap items-center justify-between gap-1.5 shadow-2xl shadow-black/70">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#163626] border border-[#7EDBA8]/40 text-[#A7F3D0] text-[10.5px] font-bold shadow-sm whitespace-nowrap shrink-0">
                        <CheckCircle2 size={11} className="text-[#34D399] shrink-0" />
                        <span>Đã đóng dấu</span>
                        <span className="text-[#7EDBA8]/50 font-normal">•</span>
                        <span
                          className={`font-mono tabular-nums ${
                            photoTimeLeftSeconds <= 15
                              ? 'text-[#FCA5A5] animate-pulse font-black'
                              : photoTimeLeftSeconds <= 30
                              ? 'text-[#FDE68A]'
                              : 'text-[#F4F6F0]'
                          }`}
                          title="Thời hạn ảnh chụp có hiệu lực"
                        >
                          {photoTimeLeftSeconds}s
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            store.setPreviewImageUrl(capturedImage);
                            store.setPreviewOpen(true);
                          }}
                          className="kg-pressable inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] sm:min-h-[34px] bg-[#24322A] hover:bg-[#334539] text-[#F4F6F0] rounded-lg border border-white/20 transition-all text-[11px] font-semibold whitespace-nowrap shrink-0 touch-manipulation"
                          title="Xem toàn màn hình"
                        >
                          <Maximize2 size={12} className="shrink-0" />
                          <span>Xem to</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            store.setCapturedImage(null);
                            store.setCapturedTime(null);
                            setCapturedGps(null);
                            setPhotoCapturedAtMs(null);
                            setPhotoTimeLeftSeconds(PHOTO_EXPIRATION_SECONDS);
                            setUserResolvedDisambiguation(null);
                          }}
                          className="kg-pressable inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] sm:min-h-[34px] bg-[#B93F36] hover:bg-[#992F27] text-white rounded-lg border border-white/20 shadow-md transition-all text-[11px] font-bold whitespace-nowrap shrink-0 touch-manipulation"
                          title="Chụp lại ảnh"
                        >
                          <RotateCcw size={12} className="shrink-0" />
                          <span>Chụp lại</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Progress Bar: 60s Visual Depletion */}
                  <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/50 overflow-hidden z-40 pointer-events-none">
                    <div
                      className={`h-full transition-all duration-500 ${
                        photoTimeLeftSeconds <= 15
                          ? 'bg-[#EF4444]'
                          : photoTimeLeftSeconds <= 30
                          ? 'bg-[#F59E0B]'
                          : 'bg-[#34D399]'
                      }`}
                      style={{ width: `${(photoTimeLeftSeconds / PHOTO_EXPIRATION_SECONDS) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Primary Action Button: Always interactive when !capturedImage so staff NEVER hit a dead button */}
            <div className="w-full max-w-none sm:max-w-[580px] lg:max-w-[680px] xl:max-w-[780px] mx-auto space-y-1.5">
              <KgButton
                data-testid="primary-capture-action-btn"
                variant={(userResolvedDisambiguation || smartIntent.smartSuggestedAction) === 'Ra ca' && capturedImage ? 'danger' : 'primary'}
                size="lg"
                disabled={capturedImage ? !canSubmit || isSubmittingPunch : false}
                onClick={() => {
                  if (!capturedImage) {
                    handleCaptureTrigger();
                    return;
                  }
                  if (isCooldownBlocked) {
                    speak(`Vui lòng đợi thêm ${cooldown.remainingMinutesFormatted} để chấm công lại.`);
                    setSpamWarningText(`Quy định chống trùng lặp: Bạn vừa chấm ${formatUnifiedPunchLabel(cooldown.lastType || 'công')} lúc ${cooldown.lastTimeStr || ''}. Vui lòng đợi thêm ${cooldown.remainingMinutesFormatted} trước lượt chấm tiếp theo.`);
                    setSpamWarningOpen(true);
                    return;
                  }
                  if (recommendation.isMaxPunchesReached) {
                    setFeedbackTitle('Đã đủ 4 lượt chấm công trong ngày');
                    setFeedbackMessage('Hệ thống đã ghi nhận đủ 2 cặp Vào ca – Ra ca trong chu kỳ 06:00 – 05:59 hiện tại.');
                    setFeedbackType('info');
                    setFeedbackSheetOpen(true);
                    return;
                  }
                  if (!isWithinRadius) {
                    speak('Bạn đang ở ngoài bán kính 25m nhà hàng.');
                    setFeedbackTitle('Ngoài bán kính chấm công');
                    setFeedbackMessage(`Khoảng cách hiện tại: ${currentDist ?? 'quá'}m (quy định ≤ ${targetRadius}m). Vui lòng di chuyển vào nhà hàng để chấm công.`);
                    setFeedbackType('warning');
                    setFeedbackSheetOpen(true);
                    return;
                  }
                  setModalChosenType(userResolvedDisambiguation || smartIntent.smartSuggestedAction);
                  setHasAcknowledgedEarlyOut(false);
                  setConfirmCheckInModalOpen(true);
                }}
                className={`kg-pressable w-full h-[52px] sm:h-14 min-h-[52px] shadow-md rounded-2xl text-[15px] font-black tracking-wide border-none transition-all touch-manipulation flex items-center justify-center gap-2.5 ${
                  isCooldownBlocked
                    ? 'bg-[#B45309] hover:bg-[#92400E] text-white'
                    : recommendation.isMaxPunchesReached
                    ? 'bg-[var(--kg-surface-2)] hover:opacity-90 text-[var(--kg-text-muted)] border border-[var(--kg-border)]'
                    : capturedImage
                    ? !canSubmit || isSubmittingPunch
                      ? 'opacity-60 cursor-not-allowed bg-[var(--kg-surface-2)] text-[var(--kg-text-muted)]'
                      : (userResolvedDisambiguation || smartIntent.smartSuggestedAction) === 'Ra ca'
                      ? 'bg-[#B93F36] hover:bg-[#992F27] text-white shadow-md'
                      : 'bg-[#1E7550] hover:bg-[#175B3E] text-white shadow-md'
                    : smartIntent.requiresDisambiguation
                    ? 'bg-[#B45309] hover:bg-[#92400E] text-white shadow-md'
                    : smartIntent.smartSuggestedAction === 'Ra ca'
                    ? 'bg-[#B93F36] hover:bg-[#992F27] text-white shadow-md'
                    : 'bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] shadow-md'
                }`}
                icon={
                  isSubmittingPunch
                    ? Loader2
                    : capturedImage
                    ? (userResolvedDisambiguation || smartIntent.smartSuggestedAction) === 'Ra ca'
                      ? LogOut
                      : LogIn
                    : Camera
                }
              >
                {isSubmittingPunch
                  ? 'ĐANG XÁC NHẬN TỨC THÌ...'
                  : isCooldownBlocked
                  ? `GIÃN CÁCH (${cooldown.remainingMinutesFormatted})`
                  : recommendation.isMaxPunchesReached
                  ? 'ĐÃ ĐỦ 4 LƯỢT TRONG NGÀY'
                  : capturedImage
                  ? `${(userResolvedDisambiguation || smartIntent.smartSuggestedAction) === 'Ra ca' ? 'Xác nhận Ra ca' : 'Xác nhận Vào ca'} (${photoTimeLeftSeconds}s)`
                  : smartIntent.requiresDisambiguation
                  ? 'CHỤP ẢNH XÁC NHẬN CA'
                  : smartIntent.smartSuggestedAction === 'Ra ca'
                  ? 'CHỤP ẢNH RA CA'
                  : 'CHỤP ẢNH VÀO CA'}
              </KgButton>

              {!canSubmit && (
                <p className="text-[11px] text-center text-[var(--kg-text-muted)] font-medium leading-snug">
                  {isCooldownBlocked
                    ? `Cần chờ thêm ${cooldown.remainingMinutesFormatted} theo quy định giãn cách 15 phút.`
                    : recommendation.isMaxPunchesReached
                    ? 'Bạn đã hoàn tất đủ 2 cặp Vào ca – Ra ca trong chu kỳ ngày công hiện tại.'
                    : !capturedImage && !isWithinRadius
                    ? gps.lat === null
                      ? 'Đang lấy vị trí GPS... Nhấn nút chụp ảnh để tự động quét vị trí.'
                      : `Ngoài bán kính ${targetRadius}m (${currentDist ?? 'quá'}m). Nhấn nút chụp ảnh để quét lại GPS vệ tinh.`
                    : !isWithinRadius
                    ? `Ngoài bán kính ${targetRadius}m (${currentDist ?? 'quá'}m). Không thể gửi chấm công.`
                    : photoTimeLeftSeconds <= 0
                    ? 'Ảnh chụp đã hết hạn 60 giây. Vui lòng chụp lại ảnh mới.'
                    : `Nhấn nút chụp ảnh để thực hiện ${recommendation.baseAction.toLowerCase()}.`}
                </p>
              )}
            </div>
          </div>

          {/* RIGHT 4-5 COLS (Desktop always open & compact; Mobile expands details on demand + Face Enroll / Missed Check-In helper) */}
          <div className={`${statusStripExpanded ? 'order-1' : 'order-2'} lg:order-2 lg:col-span-5 xl:col-span-4 space-y-2.5`}>
            {!selfFaceProfile && (
              <div className="kg-card-interactive rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-primary)]/30 p-3 shadow-xs flex items-center justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold text-[var(--kg-text)] truncate">
                    Chưa có hồ sơ Face ID 5 góc
                  </p>
                  <p className="text-[11px] font-medium text-[var(--kg-text-muted)] truncate mt-0.5">
                    Đăng ký 1 lần để quét V2 siêu tốc
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="open-face-enroll-btn"
                  onClick={openFaceEnrollmentModal}
                  className="kg-pressable min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-[11px] font-extrabold whitespace-nowrap inline-flex items-center gap-1 transition-colors shrink-0 touch-manipulation"
                  title="Đăng ký Face ID 5 góc"
                >
                  <UserPlus size={13} />
                  <span>ĐK Face 5 góc</span>
                </button>
              </div>
            )}

            <div className={`${statusStripExpanded ? 'block' : 'hidden lg:block'} space-y-2.5 kg-animate-fade-up`}>
              {/* Live Shift Details + Team Attendance */}
              <div className="rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3.5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-bold border ${
                          recommendation.isOpenShift
                            ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/25'
                            : recommendation.isOvernightShift
                            ? 'bg-[var(--kg-info-soft)] text-[var(--kg-info)] border-[var(--kg-info)]/25'
                            : recommendation.hasInToday
                            ? 'bg-[var(--kg-primary-soft)] text-[var(--kg-primary-ink)] border-[var(--kg-primary)]/20'
                            : 'bg-[var(--kg-surface-2)] text-[var(--kg-text-muted)] border-[var(--kg-border)]'
                        }`}
                      >
                        {recommendation.isOpenShift && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--kg-success)] animate-pulse shrink-0" />
                        )}
                        <span>
                          {recommendation.isOvernightShift
                            ? `Ca đêm ${recommendation.openShiftTime}`
                            : recommendation.isOpenShift
                            ? `Trong ca${smartIntent.openShiftDurationFormatted ? ` • ${smartIntent.openShiftDurationFormatted}` : ''}`
                            : recommendation.hasInToday
                            ? 'Đã vào ca'
                            : 'Chưa vào ca'}
                        </span>
                      </span>
                    </div>
                    <p className="text-xs font-black text-[var(--kg-text)] truncate mt-1.5">
                      {currentUser?.fullname || 'Nhân viên'}
                    </p>
                    <p className="text-[11px] text-[var(--kg-text-muted)] leading-snug font-medium mt-0.5">
                      {recommendation.reason}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmployeeAttendanceModalOpen(true)}
                    className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--kg-info-soft)] hover:opacity-90 border border-[var(--kg-info)]/25 text-[var(--kg-info)] font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition active:scale-95 flex-shrink-0 touch-manipulation"
                    title="Xem danh sách ca toàn đội hôm nay"
                  >
                    <Users size={13} />
                    <span>Toàn đội →</span>
                  </button>
                </div>

                {smartIntent.requiresDisambiguation && (
                  <div className="p-2.5 rounded-xl bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/35 flex items-start gap-2 text-[11px]">
                    <AlertTriangle size={14} className="text-[var(--kg-warning)] shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-black text-[var(--kg-warning)] leading-snug">
                        {smartIntent.guidanceTitle}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* GPS Details & Precision Rescan */}
              <div className="rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3.5 shadow-xs space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-black text-[var(--kg-text-muted)] uppercase tracking-wider">
                        Định vị GPS (≤{targetRadius}m)
                      </span>
                      {gps.accuracy && (
                        <span className="text-[10px] font-extrabold font-mono tabular-nums px-1.5 py-0.5 rounded bg-[var(--kg-info-soft)] text-[var(--kg-info)] border border-[var(--kg-info)]/20">
                          ±{gps.accuracy}m
                        </span>
                      )}
                      <KgFeatureTip
                        title="Mẹo Định vị GPS chính xác"
                        tips={[
                          "Vị trí chuẩn: Khuôn viên nhà hàng King's Grill (bán kính ≤25m).",
                          "Cần bật Quyền truy cập vị trí và Vị trí chính xác (Precise Location) trên Safari/Chrome.",
                          "Nếu sóng yếu hoặc báo Chưa nhận được vị trí, hãy bấm 'Làm mới' hoặc 'Quét lại vị trí (GPS Vệ Tinh)'."
                        ]}
                        size="sm"
                        variant="subtle"
                      />
                    </div>
                    <p className="font-bold text-xs mt-1 leading-snug break-words text-[var(--kg-text)]">
                      {gps.address ? gps.address : gps.status}
                    </p>
                    <span
                      className={`mt-1.5 inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold border ${
                        gps.isValid
                          ? 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/25'
                          : 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border-[var(--kg-danger)]/25'
                      }`}
                    >
                      {gps.message}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={restartGps}
                    disabled={isPrecisionScanning}
                    aria-label="Quét lại định vị GPS"
                    title="Làm mới định vị GPS"
                    className="hidden lg:inline-flex w-10 h-10 rounded-xl bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] text-[var(--kg-primary-ink)] items-center justify-center transition-colors disabled:opacity-60 shrink-0"
                  >
                    <RefreshCw
                      size={15}
                      className={isPrecisionScanning || gps.status.includes('Đang') ? 'animate-spin' : ''}
                    />
                  </button>
                </div>

                {isPrecisionScanning && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-[var(--kg-info)]">
                      <span className="inline-flex items-center gap-1">
                        <Radio size={11} className="animate-pulse" />
                        Đang dò vệ tinh ({scanProgress.current}/{scanProgress.total})...
                      </span>
                      {scanProgress.bestAcc !== null && (
                        <span className="font-mono tabular-nums">±{scanProgress.bestAcc}m</span>
                      )}
                    </div>
                    <div className="w-full bg-[var(--kg-info-soft)] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-[var(--kg-info)] h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(15, (scanProgress.current / scanProgress.total) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}

                {!gps.isValid && gps.lat !== null && !isPrecisionScanning && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handlePrecisionRescan}
                      className="flex-1 px-3 py-2 bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] font-bold text-xs rounded-xl min-h-[44px] touch-manipulation flex items-center justify-center gap-1.5 active:scale-95 transition whitespace-nowrap"
                    >
                      <Radio size={14} />
                      Quét lại vị trí (GPS Vệ Tinh)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMissedModalOpen(true)}
                      className="px-3 py-2 bg-[var(--kg-warning-soft)] hover:bg-[var(--kg-warning)]/20 border border-[var(--kg-warning)]/35 text-[var(--kg-warning)] font-black text-xs rounded-xl min-h-[44px] touch-manipulation flex-shrink-0 active:scale-95 transition whitespace-nowrap"
                    >
                      Báo công →
                    </button>
                  </div>
                )}

                {((currentUser?.role === 'admin' || currentUser?.username === 'ADMIN') && !gps.isValid && gps.lat !== null) && (
                  <button
                    type="button"
                    onClick={handleAdminCalibrateGps}
                    className="w-full px-3.5 py-2 bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] rounded-xl text-xs font-black shadow-xs transition active:scale-95 min-h-[44px] touch-manipulation flex items-center justify-center gap-1.5"
                  >
                    <Crosshair size={13} />
                    <span>Đặt vị trí hiện tại làm gốc (25m)</span>
                  </button>
                )}
              </div>

              {/* Face ID Status & Quick Actions */}
              <div className="rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)] p-3.5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        selfFaceProfile
                          ? 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/25 text-[var(--kg-success)]'
                          : 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/25 text-[var(--kg-warning)]'
                      }`}
                    >
                      <ScanFace size={17} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-[var(--kg-text)] truncate">
                          {selfFaceProfile ? 'Face ID 5 góc: Sẵn sàng' : 'Chưa đăng ký Face ID'}
                        </span>
                        {selfFaceProfile && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--kg-success-soft)] text-[var(--kg-success)] border border-[var(--kg-success)]/25">
                            <Lock size={9} /> Khóa bảo mật
                          </span>
                        )}
                        {allFaceProfiles.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold bg-[var(--kg-surface-2)] border border-[var(--kg-border)] text-[var(--kg-text-muted)]">
                            {allFaceProfiles.length} hồ sơ
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--kg-text-muted)] leading-snug truncate mt-0.5">
                        {selfFaceProfile
                          ? 'Nhận diện tức thì trên mọi điện thoại tại quán'
                          : 'Đăng ký 5 góc 1 lần để chấm công siêu tốc'}
                      </p>
                    </div>
                  </div>

                  {currentUser?.role !== 'admin' && selfFaceProfile && (
                    <button
                      type="button"
                      onClick={() => switchCheckinMode('v2')}
                      className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-xs font-extrabold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors shrink-0 touch-manipulation"
                    >
                      <ScanFace size={14} />
                      <span>Mở Quét v2</span>
                    </button>
                  )}
                </div>

                {currentUser?.role === 'admin' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                    {selfFaceProfile ? (
                      <button
                        type="button"
                        onClick={() => switchCheckinMode('v2')}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors touch-manipulation"
                      >
                        <ScanFace size={14} />
                        <span>Mở Trạm Quét v2</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={openFaceEnrollmentModal}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-[var(--kg-warning-soft)] hover:bg-[var(--kg-warning)]/20 border border-[var(--kg-warning)]/35 text-[var(--kg-warning)] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors touch-manipulation"
                      >
                        <UserPlus size={14} />
                        <span>ĐK cho tôi</span>
                      </button>
                    )}

                    <button
                      type="button"
                      data-testid="admin-enroll-staff-btn"
                      onClick={openAdminStaffFacePicker}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-[#202C27] dark:bg-[#24322A] hover:opacity-90 text-[#F4F6F0] border border-[#334539] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors touch-manipulation"
                    >
                      <Users size={14} />
                      <span>ĐK cho nhân viên</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Check-In Anomaly Alert Banner */}
              {anomalies.length > 0 && (
                <div className="bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/30 rounded-2xl p-3 text-[var(--kg-text)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-black text-[var(--kg-danger)] uppercase tracking-wider bg-[var(--kg-surface)] px-1.5 py-0.5 rounded border border-[var(--kg-danger)]/25">
                          Cần kiểm tra
                        </span>
                        <span className="text-xs font-bold font-mono tabular-nums">{anomalies[0].logTime}</span>
                      </div>
                      <p className="text-[11px] font-semibold mt-1">
                        Đề xuất: <b>&quot;{formatUnifiedPunchLabel(anomalies[0].suggestedType)}&quot;</b> (hiện tại: &quot;{formatUnifiedPunchLabel(anomalies[0].type)}&quot;)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => store.setCurrentTab('history')}
                      className="min-h-[44px] sm:min-h-[36px] px-3 py-2 bg-[#B93F36] hover:bg-[#992F27] text-white rounded-xl text-xs font-black whitespace-nowrap active:scale-95 transition-all flex-shrink-0 touch-manipulation"
                    >
                      Sửa loại →
                    </button>
                  </div>
                </div>
              )}

              {/* Missing Check-in Alerts Banner */}
              {missingAlerts.length > 0 && (
                <div className="bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/30 rounded-2xl p-3 text-[var(--kg-text)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-black text-[var(--kg-warning)] uppercase tracking-wider bg-[var(--kg-surface)] px-1.5 py-0.5 rounded border border-[var(--kg-warning)]/25">
                          Thiếu lượt &quot;{missingAlerts[0].missingType}&quot;
                        </span>
                        <span className="text-xs font-bold font-mono tabular-nums">
                          {missingAlerts[0].dateStr}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMissingAlert(missingAlerts[0]);
                        setMissedModalOpen(true);
                      }}
                      className="min-h-[44px] sm:min-h-[36px] px-3 py-2 bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] font-black rounded-xl text-xs whitespace-nowrap active:scale-95 transition-all flex-shrink-0 touch-manipulation"
                    >
                      Báo ngay →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Single Right-Rail Missed-Punch Action Card (deduplicated across mobile & desktop) */}
            <button
              type="button"
              data-testid="open-missed-checkin-helper-btn"
              onClick={() => {
                setSelectedMissingAlert(null);
                setMissedModalOpen(true);
              }}
              className="kg-card-interactive kg-pressable w-full p-3.5 min-h-[54px] rounded-2xl bg-[var(--kg-surface)] hover:bg-[var(--kg-surface-2)] text-[var(--kg-text)] border border-[var(--kg-border)] hover:border-[var(--kg-warning)]/45 text-left shadow-xs transition touch-manipulation flex items-center justify-between gap-3 group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition">
                  <Clock size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-[var(--kg-text)] leading-tight flex items-center gap-1.5 flex-wrap">
                    <span>Bổ sung chấm công</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/25">
                      Chờ Admin duyệt
                    </span>
                  </p>
                  <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 leading-snug font-medium">
                    {recommendation.baseAction === 'Vào ca'
                      ? 'Quên bấm Vào ca đầu giờ? Bổ sung ngay →'
                      : 'Quên bấm lượt trước hoặc lỗi mạng? Bổ sung →'}
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-[var(--kg-surface-2)] border border-[var(--kg-border)] flex items-center justify-center flex-shrink-0 text-[var(--kg-text-muted)] group-hover:text-[var(--kg-warning)] group-hover:border-[var(--kg-warning)]/35 transition">
                <ChevronRight size={16} />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Redesigned Compact Mobile-First Check-In Type Selection Modal (Opposing Vào ca vs Ra ca + Quick Supplement) */}
      <KgBottomSheet
        isOpen={confirmCheckInModalOpen}
        onClose={() => {
          if (!isSubmittingPunch) {
            setEarlyOutPromptOpenInModal(false);
            setConfirmCheckInModalOpen(false);
          }
        }}
        title="Chọn Loại Chấm Công"
      >
        {(() => {
          const suggestedAction: CheckInTypeString =
            userResolvedDisambiguation || smartIntent.smartSuggestedAction;
          const isActionsDisabled =
            isSubmittingPunch ||
            !isWithinRadius ||
            photoTimeLeftSeconds <= 0 ||
            Boolean(recommendation.isMaxPunchesReached);
          const expiryToneClass =
            photoTimeLeftSeconds <= 15
              ? 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/40 text-[var(--kg-danger)] animate-pulse'
              : photoTimeLeftSeconds <= 30
              ? 'bg-[var(--kg-warning-soft)] border-[var(--kg-warning)]/40 text-[var(--kg-warning)]'
              : 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/30 text-[var(--kg-success)]';

          return (
            <div className="space-y-3 py-0.5 kg-animate-fade-up">
              {/* Compact Proof Header Bar with inline 60s expiry badge */}
              <div className="p-2.5 bg-[var(--kg-surface-2)] rounded-2xl border border-[var(--kg-border)] flex items-center gap-2.5 kg-animate-scale-in">
                {capturedImage && (
                  <div className="w-12 h-14 rounded-xl overflow-hidden bg-[#111E18] border border-[var(--kg-border)] flex-shrink-0">
                    <img src={capturedImage} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs sm:text-sm font-black text-[var(--kg-text)] truncate">
                      {currentUser?.fullname}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-mono tabular-nums font-black shrink-0 ${expiryToneClass}`}
                    >
                      <Clock size={11} />
                      <span>{photoTimeLeftSeconds}s</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--kg-text-muted)]">
                    <span className="font-mono tabular-nums font-semibold shrink-0">
                      {(store.capturedTime || currentTime).split(' ').pop() || currentTime}
                    </span>
                    <span aria-hidden="true">•</span>
                    <span className="truncate inline-flex items-center gap-1">
                      <MapPin size={11} className="text-[var(--kg-success)] flex-shrink-0" />
                      <span className="truncate">{gps.address || 'Đúng bán kính nhà hàng'}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Concise 1-Line Context Notice Pill */}
              {smartIntent.requiresDisambiguation ? (
                <div
                  data-testid="smart-disambiguation-card"
                  className="px-3 py-2 rounded-xl border border-[var(--kg-warning)]/35 bg-[var(--kg-warning-soft)] flex items-center gap-2 text-[var(--kg-text)]"
                >
                  <AlertTriangle size={15} className="text-[var(--kg-warning)] shrink-0" />
                  <p className="text-[11px] sm:text-xs font-bold leading-snug text-[var(--kg-text)] min-w-0">
                    <span className="text-[var(--kg-warning)] font-black">{smartIntent.guidanceTitle}</span>{' '}
                    <span className="text-[var(--kg-text-muted)] font-medium">
                      Chọn đúng lượt bên dưới hoặc gửi bổ sung công.
                    </span>
                  </p>
                </div>
              ) : recommendation.isOpenShift && smartIntent.openShiftDurationFormatted ? (
                <div className="px-3 py-2 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-2)] flex items-center justify-between gap-2 text-[11px] font-bold">
                  <span className="text-[var(--kg-text-muted)] inline-flex items-center gap-1.5 truncate">
                    {recommendation.isOvernightShift ? (
                      <Moon size={13} className="text-[var(--kg-primary-ink)] shrink-0" />
                    ) : (
                      <ShieldCheck size={13} className="text-[var(--kg-success)] shrink-0" />
                    )}
                    <span className="truncate">Đang trong ca từ {smartIntent.openShiftStartTime}</span>
                  </span>
                  <span className="font-mono tabular-nums font-black text-[var(--kg-text)] shrink-0">
                    {smartIntent.openShiftDurationFormatted}
                  </span>
                </div>
              ) : null}

              {/* GPS Lock Banner (only if outside geofence) */}
              {!isWithinRadius && (
                <div className="px-3 py-2 bg-[var(--kg-danger-soft)] border border-[var(--kg-danger)]/35 rounded-xl flex items-center gap-2 text-[var(--kg-danger)] font-bold text-[11px]">
                  <Lock size={14} className="flex-shrink-0" />
                  <span>
                    Ngoài bán kính ≤ {targetRadius}m ({currentDist ?? 'quá'}m). Không thể gửi chấm công.
                  </span>
                </div>
              )}

              {/* HERO DUAL OPPOSING ACTION BUTTONS: VÀO CA (Emerald ->) vs RA CA (<- Crimson) */}
              <div className="grid grid-cols-2 gap-3 pt-0.5">
                <button
                  type="button"
                  data-testid="smart-confirm-late-in-btn"
                  disabled={isActionsDisabled}
                  onClick={() => handleSelectCheckInTypeInModal('Vào ca')}
                  className={`kg-punch-tile kg-punch-tile--in min-h-[126px] sm:min-h-[132px] p-3.5 flex flex-col items-center justify-center gap-2.5 text-center disabled:opacity-50 disabled:pointer-events-none ${
                    suggestedAction === 'Vào ca'
                      ? 'ring-2 ring-[#1F8E60]/60 ring-offset-2 ring-offset-[var(--kg-surface)]'
                      : ''
                  }`}
                >
                  {suggestedAction === 'Vào ca' && (
                    <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-white text-[#146342] text-[9px] font-black uppercase tracking-wider shadow-xs">
                      Gợi ý
                    </span>
                  )}
                  <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shadow-xs">
                    {isSubmittingPunch && modalChosenType === 'Vào ca' ? (
                      <Loader2 size={24} className="animate-spin text-white" />
                    ) : (
                      <LogIn size={24} className="kg-punch-icon-in text-white" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <span className="block text-base sm:text-lg font-black tracking-wide leading-none text-white">
                      VÀO CA
                    </span>
                    <span className="block text-[11px] font-semibold text-white/85 leading-tight">
                      Bắt đầu ca làm
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="smart-choose-out-btn"
                  disabled={isActionsDisabled}
                  onClick={() => handleSelectCheckInTypeInModal('Ra ca')}
                  className={`kg-punch-tile kg-punch-tile--out min-h-[126px] sm:min-h-[132px] p-3.5 flex flex-col items-center justify-center gap-2.5 text-center disabled:opacity-50 disabled:pointer-events-none ${
                    suggestedAction === 'Ra ca'
                      ? 'ring-2 ring-[#D34B3C]/60 ring-offset-2 ring-offset-[var(--kg-surface)]'
                      : ''
                  }`}
                >
                  {suggestedAction === 'Ra ca' && (
                    <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-white text-[#A72E24] text-[9px] font-black uppercase tracking-wider shadow-xs">
                      Gợi ý
                    </span>
                  )}
                  <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center shadow-xs">
                    {isSubmittingPunch && modalChosenType === 'Ra ca' ? (
                      <Loader2 size={24} className="animate-spin text-white" />
                    ) : (
                      <LogOut size={24} className="kg-punch-icon-out text-white" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <span className="block text-base sm:text-lg font-black tracking-wide leading-none text-white">
                      RA CA
                    </span>
                    <span className="block text-[11px] font-semibold text-white/85 leading-tight">
                      Kết thúc ca làm
                    </span>
                  </div>
                </button>
              </div>

              {/* Safety Guard: Inline 15-minute Early-Out Confirmation (only expands if tapping Ra ca <15m after Vào ca) */}
              {earlyOutPromptOpenInModal &&
                recommendation.isOpenShift &&
                !recommendation.canCheckOutNow && (
                  <div className="p-3 bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/40 rounded-2xl space-y-2.5 kg-animate-fade-up">
                    <div className="flex items-start gap-2 text-[var(--kg-warning)] font-extrabold text-xs">
                      <Clock size={16} className="flex-shrink-0 mt-0.5" />
                      <span>
                        Bạn vừa Vào ca lúc{' '}
                        <span className="font-mono tabular-nums">{recommendation.openShiftTime}</span> (mới{' '}
                        <span className="font-mono tabular-nums">{recommendation.elapsedMinutes}</span> phút, cần đủ 15 phút).
                      </span>
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none min-h-[40px]">
                      <input
                        type="checkbox"
                        checked={hasAcknowledgedEarlyOut}
                        onChange={(e) => setHasAcknowledgedEarlyOut(e.target.checked)}
                        className="w-4 h-4 rounded text-[var(--kg-primary)] focus:ring-[var(--kg-primary)] cursor-pointer shrink-0"
                      />
                      <span className="text-xs font-bold text-[var(--kg-text)]">
                        Tôi xác nhận có việc đột xuất và muốn Ra ca sớm
                      </span>
                    </label>
                    <button
                      type="button"
                      data-testid="smart-confirm-punch-btn"
                      disabled={isActionsDisabled || !hasAcknowledgedEarlyOut}
                      onClick={() => void submitCheck('Ra ca', true)}
                      className="kg-pressable w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#B93F36] hover:bg-[#992F27] text-white text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {isSubmittingPunch ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <LogOut size={16} />
                      )}
                      <span>Xác nhận Ra ca sớm</span>
                    </button>
                  </div>
                )}

              {/* Hidden/Passive contract anchor when early-out guard isn't expanded */}
              {!earlyOutPromptOpenInModal && (
                <button
                  type="button"
                  data-testid="smart-confirm-punch-btn"
                  disabled={isActionsDisabled}
                  onClick={() => handleSelectCheckInTypeInModal(suggestedAction)}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  Xác nhận nhanh {suggestedAction}
                </button>
              )}

              {/* Compact Secondary Action: "Bổ sung chấm công" -> opens Quick Reason/Approval Sheet */}
              <div className="pt-0.5 flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  data-testid="confirm-sheet-open-supplement-btn"
                  disabled={isSubmittingPunch}
                  onClick={openQuickSupplementSheet}
                  className="kg-pressable w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-warning-soft)] border border-[var(--kg-border)] hover:border-[var(--kg-warning)]/40 text-[var(--kg-text)] flex items-center justify-between gap-2 transition-colors disabled:opacity-50 touch-manipulation"
                >
                  <span className="inline-flex items-center gap-2 text-xs font-extrabold text-[var(--kg-text)]">
                    <span className="w-7 h-7 rounded-lg bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border border-[var(--kg-warning)]/25 flex items-center justify-center shrink-0">
                      <Clock size={14} />
                    </span>
                    <span>Bổ sung chấm công</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--kg-warning)] shrink-0">
                    <span>Chọn lí do xin duyệt</span>
                    <ChevronRight size={14} />
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isSubmittingPunch}
                  onClick={() => {
                    setEarlyOutPromptOpenInModal(false);
                    setConfirmCheckInModalOpen(false);
                  }}
                  className="w-full py-1.5 text-center text-xs font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] transition min-h-[40px] touch-manipulation disabled:opacity-50"
                >
                  Đóng / Chụp lại ảnh
                </button>
              </div>
            </div>
          );
        })()}
      </KgBottomSheet>

      {/* Dedicated Quick Supplement Modal ("Bổ sung chấm công" — Pick preset reason or type custom reason) */}
      <KgBottomSheet
        isOpen={quickSupplementSheetOpen}
        onClose={() => {
          if (!isSubmittingQuickSupplement && !isSubmittingPunch) {
            setQuickSupplementSheetOpen(false);
          }
        }}
        title="Xin Duyệt Bổ Sung Công"
      >
        {(() => {
          const vn = getVietnamDateParts();
          const fallbackTodayStr = `${String(vn.day).padStart(2, '0')}/${String(vn.month).padStart(2, '0')}/${vn.year}`;
          const targetSuppDate =
            (quickSupplementType === 'Ra ca' ? smartIntent.unclosedYesterdayDateStr : undefined) ||
            smartIntent.suggestedSupplementDate ||
            fallbackTodayStr;
          const canRunCombo =
            smartIntent.ambiguityReason === 'LATE_SHIFT_MISSING_IN' &&
            Boolean(capturedImage) &&
            isWithinRadius &&
            photoTimeLeftSeconds > 0;
          const quickReasons = [
            'Quên bấm đầu ca',
            'Bận phục vụ khách đầu ca',
            'Điện thoại hết pin / lỗi mạng',
            'Lỗi GPS tại quán',
            'Quên bấm cuối ca',
          ];

          return (
            <div className="space-y-3.5 py-0.5 kg-animate-fade-up">
              {/* Row 1: Type Switcher (Vào ca / Ra ca) + Time Picker */}
              <div className="p-3 rounded-2xl bg-[var(--kg-surface-2)] border border-[var(--kg-border)] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-[var(--kg-text-muted)] uppercase tracking-wider">
                    Loại bổ sung
                  </span>
                  <span className="text-[11px] font-mono tabular-nums font-bold text-[var(--kg-primary-ink)] bg-[var(--kg-primary-soft)] px-2 py-0.5 rounded-full">
                    {targetSuppDate}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickSupplementType('Vào ca')}
                    className={`kg-pressable min-h-[44px] px-3 py-2 rounded-xl text-xs font-black border flex items-center justify-center gap-1.5 transition-colors ${
                      quickSupplementType === 'Vào ca'
                        ? 'bg-[#1E7550] text-white border-[#1E7550] shadow-xs'
                        : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border-[var(--kg-border)]'
                    }`}
                  >
                    <LogIn size={14} />
                    <span>Bổ sung Vào ca</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickSupplementType('Ra ca')}
                    className={`kg-pressable min-h-[44px] px-3 py-2 rounded-xl text-xs font-black border flex items-center justify-center gap-1.5 transition-colors ${
                      quickSupplementType === 'Ra ca'
                        ? 'bg-[#B93F36] text-white border-[#B93F36] shadow-xs'
                        : 'bg-[var(--kg-surface)] text-[var(--kg-text-muted)] border-[var(--kg-border)]'
                    }`}
                  >
                    <LogOut size={14} />
                    <span>Bổ sung Ra ca</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <label
                    htmlFor="combo-supp-time-input"
                    className="text-xs font-bold text-[var(--kg-text)]"
                  >
                    Giờ {quickSupplementType.toLowerCase()} thực tế:
                  </label>
                  <input
                    id="combo-supp-time-input"
                    type="time"
                    value={comboSupplementTime}
                    onChange={(e) => setComboSupplementTime(e.target.value)}
                    className="px-3 py-1.5 min-h-[44px] sm:min-h-[38px] rounded-xl border border-[var(--kg-border-strong)] bg-[var(--kg-surface)] text-base sm:text-xs font-mono tabular-nums font-black text-[var(--kg-text)]"
                  />
                </div>
              </div>

              {/* Row 2: Quick Reason Pills */}
              <div className="space-y-2">
                <p className="text-xs font-black text-[var(--kg-text)]">
                  Chọn nhanh lí do hoặc nhập bên dưới
                </p>
                <div className="flex flex-wrap gap-2">
                  {quickReasons.map((rText) => {
                    const isSelected = !quickSupplementCustomReason.trim() && comboSupplementReason === rText;
                    return (
                      <button
                        key={rText}
                        type="button"
                        onClick={() => {
                          setComboSupplementReason(rText);
                          setQuickSupplementCustomReason('');
                        }}
                        className={`kg-pressable px-3 py-2 min-h-[44px] sm:min-h-[36px] rounded-xl text-xs font-bold border transition-colors touch-manipulation ${
                          isSelected
                            ? 'bg-[var(--kg-nav-active)] text-[var(--kg-nav-active-fg)] border-transparent font-extrabold shadow-xs'
                            : 'bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] border-[var(--kg-border)] hover:text-[var(--kg-text)]'
                        }`}
                      >
                        {rText}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 3: Custom Reason Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="quick-supp-custom-reason"
                  className="text-[11px] font-bold text-[var(--kg-text-muted)] block"
                >
                  Lí do chi tiết (tuỳ chọn)
                </label>
                <textarea
                  id="quick-supp-custom-reason"
                  rows={2}
                  value={quickSupplementCustomReason}
                  onChange={(e) => setQuickSupplementCustomReason(e.target.value)}
                  placeholder="Nhập lí do cụ thể nếu khác các mục trên..."
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--kg-border-strong)] bg-[var(--kg-surface)] text-base sm:text-xs text-[var(--kg-text)] placeholder:text-[var(--kg-text-soft)] resize-none focus:outline-none focus:border-[var(--kg-primary)]"
                />
              </div>

              {/* Row 4: Submit Actions */}
              <div className="space-y-2 pt-0.5">
                {canRunCombo ? (
                  <>
                    <button
                      type="button"
                      data-testid="smart-combo-out-and-supplement-btn"
                      disabled={isSubmittingPunch || isSubmittingQuickSupplement}
                      onClick={() => void handleComboOutAndSupplementIn()}
                      className="kg-pressable w-full min-h-[50px] px-4 py-2.5 rounded-2xl bg-[#B93F36] hover:bg-[#992F27] text-white text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2 disabled:opacity-55 disabled:pointer-events-none touch-manipulation"
                    >
                      {isSubmittingPunch ? (
                        <Loader2 size={17} className="animate-spin shrink-0" />
                      ) : (
                        <LogOut size={17} className="shrink-0" />
                      )}
                      <span>Chấm Ra ca + Xin duyệt bổ sung Vào ca</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSubmittingPunch || isSubmittingQuickSupplement}
                      onClick={() => void handleSubmitQuickSupplementOnly()}
                      className="kg-pressable w-full min-h-[44px] px-4 py-2 rounded-xl bg-[var(--kg-surface-soft)] hover:bg-[var(--kg-border)] border border-[var(--kg-border-strong)] text-[var(--kg-text)] text-xs font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-55 touch-manipulation"
                    >
                      {isSubmittingQuickSupplement ? (
                        <Loader2 size={15} className="animate-spin shrink-0" />
                      ) : (
                        <Send size={14} className="shrink-0" />
                      )}
                      <span>Chỉ gửi đơn xin duyệt bổ sung công</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    data-testid="smart-combo-out-and-supplement-btn"
                    disabled={isSubmittingQuickSupplement}
                    onClick={() => void handleSubmitQuickSupplementOnly()}
                    className="kg-pressable w-full min-h-[50px] px-4 py-2.5 rounded-2xl bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-[var(--kg-primary-fg)] text-xs sm:text-sm font-black shadow-md flex items-center justify-center gap-2 disabled:opacity-55 disabled:pointer-events-none touch-manipulation"
                  >
                    {isSubmittingQuickSupplement ? (
                      <Loader2 size={17} className="animate-spin shrink-0" />
                    ) : (
                      <Send size={16} className="shrink-0" />
                    )}
                    <span>Gửi đơn xin duyệt bổ sung công</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSubmittingQuickSupplement || isSubmittingPunch}
                  onClick={() => {
                    setQuickSupplementSheetOpen(false);
                    setConfirmCheckInModalOpen(false);
                    setSelectedMissingAlert(null);
                    setMissedModalOpen(true);
                  }}
                  className="w-full py-1.5 text-center text-[11px] font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-primary-ink)] transition min-h-[40px] touch-manipulation"
                >
                  Chọn ngày khác / Xem lịch sử đơn bổ sung →
                </button>
              </div>
            </div>
          );
        })()}
      </KgBottomSheet>

      {/* Missed Check-in Claim Modal ("Bổ sung chấm công") */}
      {missedModalOpen && (
        <MissedCheckInModal
          isOpen={missedModalOpen}
          onClose={() => {
            setMissedModalOpen(false);
            setSelectedMissingAlert(null);
            void refreshFastAttendanceState();
          }}
          existingLogs={mergedAttendanceLogs}
          onSubmitted={() => {
            void refreshFastAttendanceState();
          }}
          defaultType={selectedMissingAlert ? selectedMissingAlert.missingType : 'Vào ca'}
          defaultDate={selectedMissingAlert ? selectedMissingAlert.dateStr : undefined}
          defaultTime={selectedMissingAlert ? selectedMissingAlert.timeStr : undefined}
          defaultReason="Quên bấm đầu ca"
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

      {/* Unenrolled Employee Face ID v2 Pre-Boot Enrollment Prompt (avoids double camera boot/teardown) */}
      <KgConfirmSheet
        isOpen={unenrolledV2PromptOpen}
        onClose={() => setUnenrolledV2PromptOpen(false)}
        title="Chưa đăng ký Face ID 5 góc"
        message="Bạn chưa có hồ sơ khuôn mặt 5 góc trên hệ thống. Hãy đăng ký ngay (~15 giây) để mở khóa chấm công tự động không chạm."
        confirmLabel="Đăng ký 5 góc ngay"
        cancelLabel="Đóng"
        variant="primary"
        onConfirm={() => {
          setUnenrolledV2PromptOpen(false);
          openFaceEnrollmentModal();
        }}
      />

      {/* Safety Confirmation for Inverted Type Choice */}
      <KgConfirmSheet
        isOpen={confirmInvertedTypeOpen}
        onClose={() => setConfirmInvertedTypeOpen(false)}
        title="Chưa ghi nhận Vào ca"
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
          <div className="w-12 h-12 bg-[var(--kg-warning-soft)] border border-[var(--kg-warning)]/25 rounded-2xl flex items-center justify-center text-[var(--kg-warning)] mx-auto">
            <AlertTriangle size={24} />
          </div>
          <p className="text-sm font-semibold text-[var(--kg-text)] leading-relaxed">
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
        title="Cảnh báo: Vào ca trễ"
        message={`Theo lịch đã duyệt, ca làm của bạn bắt đầu vào lúc ${pendingShiftStr}. Bạn đang đi trễ ${pendingLateMins} phút. Bạn có đồng ý tiếp tục chấm công không?`}
        confirmLabel="Đồng ý & Chấm công"
        cancelLabel="Hủy"
        variant="danger"
        onConfirm={() => {
          setConfirmLateOpen(false);
          if (!isWithinRadius) {
            speak('Từ chối chấm công: Bạn đang ở ngoài bán kính 25m.');
            setFeedbackTitle('Ngoài bán kính chấm công');
            setFeedbackMessage(`Khoảng cách hiện tại: ${currentDist ?? 'quá'}m (quy định ≤ ${targetRadius}m). Vui lòng di chuyển vào nhà hàng để chấm công.`);
            setFeedbackType('warning');
            setFeedbackSheetOpen(true);
            return;
          }
          executeCheck(pendingTypeToSubmit || 'Vào ca', true, pendingLateMins, pendingShiftStr);
        }}
      />

      {/* General info / Operational Receipt Sheet */}
      <CheckInReceiptSheet
        isOpen={feedbackSheetOpen}
        onClose={() => setFeedbackSheetOpen(false)}
        feedbackType={feedbackType}
        feedbackTitle={feedbackTitle}
        feedbackMessage={feedbackMessage}
        lastSubmittedPunch={lastSubmittedPunch}
        isWithinRadius={isWithinRadius}
        onCompleteSuccess={() => {
          setFeedbackSheetOpen(false);
          if (pendingSurveyAfterPunch) {
            setPendingSurveyAfterPunch(false);
            setTimeout(() => {
              setSurveyEmotion(null);
              setSurveyNote('');
              setSurveyOpen(true);
            }, 350);
          }
        }}
        onPrecisionRescan={handlePrecisionRescan}
        onOpenMissedModal={() => {
          setSelectedMissingAlert(null);
          setMissedModalOpen(true);
        }}
      />

      {/* Pulse survey bottom sheet */}
      <KgBottomSheet isOpen={surveyOpen} onClose={() => setSurveyOpen(false)} title="Khảo sát sức khỏe đầu ca">
        <div className="space-y-4 py-2 text-left">
          <p className="text-xs font-semibold text-[var(--kg-text-muted)] uppercase tracking-wider pl-1">
            Hôm nay bạn cảm thấy thế nào trước khi bắt đầu ca?
          </p>

          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {[
              { val: 5, icon: Sun, tone: 'text-emerald-600 dark:text-emerald-400', label: 'Tuyệt vời' },
              { val: 4, icon: Smile, tone: 'text-sky-600 dark:text-sky-400', label: 'Vui vẻ' },
              { val: 3, icon: Meh, tone: 'text-slate-600 dark:text-slate-300', label: 'Ổn định' },
              { val: 2, icon: Frown, tone: 'text-amber-600 dark:text-amber-400', label: 'Mệt mỏi' },
              { val: 1, icon: Zap, tone: 'text-rose-600 dark:text-rose-400', label: 'Căng thẳng' },
            ].map((item) => {
              const IconComp = item.icon;
              const isSelected = surveyEmotion === item.val;
              return (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => setSurveyEmotion(item.val)}
                  className={`min-w-0 flex flex-col items-center justify-center px-1 py-2 sm:p-2.5 rounded-xl border active:scale-95 transition-colors gap-1.5 min-h-[68px] touch-manipulation ${
                    isSelected
                      ? 'border-[var(--kg-primary)] bg-[var(--kg-primary-soft)] text-[var(--kg-primary)] ring-2 ring-[var(--kg-primary)]/20'
                      : 'border-[var(--kg-border)] bg-[var(--kg-surface-soft)] text-[var(--kg-text-muted)] hover:bg-[var(--kg-surface)]'
                  }`}
                >
                  <IconComp size={22} className={isSelected ? 'text-[var(--kg-primary)]' : item.tone} />
                  <span className="text-[10px] font-semibold text-center leading-tight">{item.label}</span>
                </button>
              );
            })}
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

      {/* Parallel v2 Full-Screen Face Recognition Scanner & 5-Angle Enrollment HUD */}
      <Suspense fallback={null}>
        {checkinMode === 'v2' && (
          <FastFaceScannerV2
            isOpen={true}
            isKioskMode={false}
            onClose={() => {
              switchCheckinMode('v1');
              void refreshFaceProfiles();
              void refreshFastAttendanceState();
              void refreshAppData(true);
            }}
            onSwitchToV1={() => {
              switchCheckinMode('v1');
              void refreshFaceProfiles();
              void refreshFastAttendanceState();
              void refreshAppData(true);
            }}
          />
        )}
        {adminPickerOpen && currentUser?.role === 'admin' && (
          <AdminStaffFacePickerModal
            isOpen={adminPickerOpen}
            adminUsername={currentUser.username}
            initialProfiles={allFaceProfiles}
            onClose={() => {
              setAdminPickerOpen(false);
              void refreshFaceProfiles();
            }}
            onSelectEmployee={(emp, latestProfiles) => {
              if (latestProfiles.length > 0) {
                setAllFaceProfiles(latestProfiles);
              }
              setAdminSelectedEnrollTarget(emp);
              setAdminPickerOpen(false);
              setFaceEnrollModalOpen(true);
            }}
          />
        )}
        {faceEnrollModalOpen && currentUser && (
          <FaceEnrollmentModal
            isOpen={faceEnrollModalOpen}
            onClose={handleCloseFaceEnroll}
            user={adminSelectedEnrollTarget || currentUser}
            existingProfiles={allFaceProfiles}
            enrolledByAdmin={Boolean(adminSelectedEnrollTarget && currentUser.role === 'admin')}
            adminActorUsername={currentUser.username}
            onEnrolledSuccess={handleFaceEnrolledSuccess}
            onStartScanningNow={() => {
              setFaceEnrollModalOpen(false);
              setAdminSelectedEnrollTarget(null);
              switchCheckinMode('v2');
            }}
            onPickAnotherStaff={
              currentUser.role === 'admin'
                ? () => {
                    setFaceEnrollModalOpen(false);
                    setAdminSelectedEnrollTarget(null);
                    setAdminPickerOpen(true);
                  }
                : undefined
            }
          />
        )}
      </Suspense>

    </div>
  );
}
