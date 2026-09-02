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
  MissingCheckInAlert
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
  Check
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  KgButton,
  KgBottomSheet,
  KgConfirmSheet,
  KgTextarea,
  KgModuleHero
} from '../components/KgDesignSystem';
import { isWorkEligible } from '../utils/employment';
import EmploymentStatusNotice from '../components/EmploymentStatusNotice';
import { enqueueTask } from '../utils/offlineQueue';
import MissedCheckInModal from '../components/MissedCheckInModal';

export default function CheckIn() {
  const store = useAppStore();
  const { currentUser, gps, capturedImage, currentTime, approvedShifts } = store;

  // Smart check-in recommendation & state machine
  const recommendation = getRecommendedCheckInType(store.logs, currentUser);
  const missingAlerts = auditMissingCheckIns(store.logs, currentUser);
  const [selectedMissingAlert, setSelectedMissingAlert] = useState<MissingCheckInAlert | null>(null);

  // Post-capture confirmation modal & dynamic type selection state
  const [confirmCheckInModalOpen, setConfirmCheckInModalOpen] = useState(false);
  const [modalChosenType, setModalChosenType] = useState<'Vào ca' | 'Ra ca'>(recommendation.recommendedType);
  const [hasAcknowledgedMissingIn, setHasAcknowledgedMissingIn] = useState(false);
  const [confirmInvertedTypeOpen, setConfirmInvertedTypeOpen] = useState(false);
  const [pendingTypeToSubmit, setPendingTypeToSubmit] = useState<'Vào ca' | 'Ra ca'>('Vào ca');

  // Auto-sync modal type with recommendation whenever recommendation changes (if modal is closed)
  useEffect(() => {
    if (!confirmCheckInModalOpen) {
      setModalChosenType(recommendation.recommendedType);
      setHasAcknowledgedMissingIn(false);
    }
  }, [recommendation.recommendedType, confirmCheckInModalOpen]);

  const [missedModalOpen, setMissedModalOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const kalmanLatRef = useRef(new KalmanFilter(20));
  const kalmanLngRef = useRef(new KalmanFilter(20));
  const watchIdRef = useRef<number | null>(null);
  const gpsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGpsValidRef = useRef<boolean | null>(null);

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
    const rawLat = pos.coords.latitude;
    const rawLng = pos.coords.longitude;
    const acc = pos.coords.accuracy;

    // Filter coordinates with adaptive accuracy weight
    const filteredLat = kalmanLatRef.current.filter(rawLat, 0, acc);
    const filteredLng = kalmanLngRef.current.filter(rawLng, 0, acc);

    // If hardware accuracy is under 15m, instantly adopt raw/filtered coordinates
    const lat = (acc <= 15 || isFastStart) ? rawLat : filteredLat;
    const lng = (acc <= 15 || isFastStart) ? rawLng : filteredLng;

    const latestGpsConfig = useAppStore.getState().serverGpsConfig;
    const targetLat = latestGpsConfig?.lat ?? KG_LAT;
    const targetLng = latestGpsConfig?.lng ?? KG_LNG;
    
    const dist = getDist(lat, lng, targetLat, targetLng) * 1000;
    const isTestApp = useAppStore.getState().currentUser?.username === 'testapp';
    const targetRadius = latestGpsConfig?.radius ?? KG_RADIUS_METERS;
    
    if (dist <= targetRadius || isTestApp) {
      store.setGps({
        lat,
        lng,
        isValid: true,
        status: isTestApp ? 'Vị trí Test (Bypass)' : 'Vị trí Chính xác',
        message: `Khoảng cách: ${Math.round(dist)}m / ${targetRadius}m (≤20m Hợp lệ)`
      });
      if (prevGpsValidRef.current !== true) {
        speak('Vị trí đã hợp lệ, sẵn sàng chấm công');
        prevGpsValidRef.current = true;
      }
    } else {
      store.setGps({
        lat,
        lng,
        isValid: false,
        status: 'Vị trí quá xa',
        message: `Khoảng cách: ${Math.round(dist)}m / ${targetRadius}m (Quá bán kính ≤20m)`
      });
      if (prevGpsValidRef.current !== false && prevGpsValidRef.current !== null) {
        speak('Vị trí không hợp lệ, vui lòng di chuyển lại gần');
        prevGpsValidRef.current = false;
      } else if (prevGpsValidRef.current === null) {
        prevGpsValidRef.current = false;
      }
    }
    if (!isFastStart && acc < 20) {
      store.setGps({ status: 'GPS Khóa Vệ Tinh (Độ chính xác cao)' });
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

    // Tier 1: Instant Seed (<300ms) with network/cached GPS
    navigator.geolocation.getCurrentPosition(
      (pos) => handleGpsSuccess(pos, true),
      () => {},
      { enableHighAccuracy: false, timeout: 2000, maximumAge: 30000 }
    );

    // Tier 2: Real-time high-precision hardware GPS lock
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
          { enableHighAccuracy: true, timeout: 6000, maximumAge: 5000 }
        );
      }
    }, 5000);
  }, [handleGpsError, handleGpsSuccess, store]);

  const restartGps = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    watchIdRef.current = null;
    store.setGps({ lat: null, lng: null, isValid: false, status: 'Chưa định vị', message: '', address: undefined });
    kalmanLatRef.current.reset();
    kalmanLngRef.current.reset();
    prevGpsValidRef.current = null;
    startGpsWatch();
  };

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
    typeToStamp: 'Vào ca' | 'Ra ca' = modalChosenType || recommendation.recommendedType
  ) => {
    const cardX = 24;
    const cardHeight = 310;
    const cardY = canvas.height - cardHeight - 24;
    const cardWidth = canvas.width - (cardX * 2);
    const radius = 24;

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw Glassmorphic Card Background (Deep Slate/Navy with 94% opacity)
    ctx.fillStyle = 'rgba(11, 20, 36, 0.94)';
    
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
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
      }
    };

    ctx.beginPath();
    drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, radius);
    ctx.fill();

    // Subtle White/Blue Border Outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, radius);
    ctx.stroke();

    // Content Padding
    const padX = 24;
    const contentX = cardX + padX;

    // Hash Token Signature for Anti-Fraud Verification
    const currentGpsState = useAppStore.getState().gps;
    const userObj = useAppStore.getState().currentUser;
    const strForHash = `${userObj?.username || 'user'}_${exactTime}_${currentGpsState.lat?.toFixed(5)}_${currentGpsState.lng?.toFixed(5)}_KG20`;
    let hashVal = 0;
    for (let i = 0; i < strForHash.length; i++) {
      hashVal = ((hashVal << 5) - hashVal) + strForHash.charCodeAt(i);
      hashVal |= 0;
    }
    const securityHash = `KG#${Math.abs(hashVal).toString(36).toUpperCase().padStart(6, '0')}`;
    
    // Header Bar: Restaurant Brand & Official Seal Badge
    const headerY = cardY + 36;
    ctx.font = 'bold 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#93C5FD'; // Soft Blue
    ctx.fillText("👑 KING'S GRILL  •  CHỨNG NHẬN CHẤM CÔNG", contentX, headerY);

    const isCheckInType = typeToStamp === 'Vào ca';
    const isValidGps = Boolean(currentGpsState.isValid);
    const badgeText = isCheckInType
      ? (isValidGps ? '🟢 VÀO CA - HỢP LỆ' : '⚠️ VÀO CA - NGOÀI BÁN KÍNH')
      : (isValidGps ? '🔴 RA CA - HỢP LỆ' : '⚠️ RA CA - NGOÀI BÁN KÍNH');
    ctx.font = 'bold 20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const badgeWidth = ctx.measureText(badgeText).width + 24;
    const badgeX = cardX + cardWidth - padX - badgeWidth;
    
    ctx.fillStyle = isCheckInType ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)';
    drawRoundRect(ctx, badgeX, headerY - 24, badgeWidth, 32, 10);
    ctx.fill();
    ctx.strokeStyle = isCheckInType ? '#10B981' : '#F43F5E';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    drawRoundRect(ctx, badgeX, headerY - 24, badgeWidth, 32, 10);
    ctx.stroke();

    ctx.fillStyle = isCheckInType ? '#34D399' : '#FB7185';
    ctx.fillText(badgeText, badgeX + 12, headerY - 2);

    // Divider Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(contentX, headerY + 14);
    ctx.lineTo(cardX + cardWidth - padX, headerY + 14);
    ctx.stroke();

    // Row 1: Time & Security Signature
    const row1Y = headerY + 46;
    ctx.font = 'bold 25px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#FDE047'; // Vivid Gold
    ctx.fillText('🕒 THỜI GIAN: ' + exactTime, contentX, row1Y);

    ctx.font = 'bold 21px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#38BDF8'; // Sky Blue
    ctx.fillText('🛡️ ' + securityHash + ' (Bảo mật KG-OS)', contentX + 440, row1Y);

    // Row 2: Employee info
    const row2Y = row1Y + 36;
    ctx.font = 'bold 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    const roleTitle = userObj?.role === 'admin' ? 'Quản lý' : (userObj?.position || 'Nhân sự');
    const personText = `👤 NHÂN SỰ: ${userObj?.fullname || 'Nhân sự'} (${userObj?.username || ''})  •  💼 ${roleTitle}`;
    ctx.fillText(personText, contentX, row2Y);

    // Row 3: Address (Word wrapped cleanly)
    ctx.font = '500 19px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#CBD5E1'; // Slate 300
    
    const displayAddr = '📍 ĐỊA ĐIỂM: ' + addr;
    const maxTextWidth = cardWidth - (padX * 2);
    
    const wrapText = (context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
      const words = text.split(' ');
      let line = '';
      let currentY = y;
      
      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = context.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          context.fillText(line, x, currentY);
          line = words[n] + ' ';
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      }
      context.fillText(line, x, currentY);
    };

    wrapText(ctx, displayAddr, contentX, row2Y + 32, maxTextWidth, 26);

    // Row 4: GPS Coordinates & Radius Check
    const row4Y = cardY + cardHeight - 20;
    ctx.font = 'bold 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = isValidGps ? '#34D399' : '#F87171';
    const gpsLine = `🛰️ TỌA ĐỘ: ${currentGpsState.lat?.toFixed(6) || '---'}, ${currentGpsState.lng?.toFixed(6) || '---'}  •  ${currentGpsState.message || 'Bán kính ≤20m'}`;
    ctx.fillText(gpsLine, contentX, row4Y);
    
    // Save image with high quality JPEG 0.88 (sharp & universally compatible)
    let dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    
    store.setCapturedImage(dataUrl);
    store.setCapturedTime(exactTime);
  };

  const takePhoto = () => {
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

    ctx.save(); ctx.translate(targetWidth, 0); ctx.scale(-1, 1);
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
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

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
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleTypeChangeInModal = (newType: 'Vào ca' | 'Ra ca') => {
    setModalChosenType(newType);
    setHasAcknowledgedMissingIn(false);
    
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
    if (!capturedImage || !gps.isValid || gps.lat === null || gps.lng === null) return;

    // Safety guard: If user manually chose 'Ra ca' but has no active open shift or Vào ca record
    if (type === 'Ra ca' && !recommendation.isOpenShift && !recommendation.hasInToday) {
      setPendingTypeToSubmit('Ra ca');
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

    if (!gps.isValid || gps.lat === null || gps.lng === null) {
      speak('Vị trí chưa hợp lệ. Yêu cầu trong bán kính 20m.');
      setFeedbackTitle('Vị trí chưa hợp lệ');
      setFeedbackMessage('Bạn đang ở ngoài bán kính 20m nhà hàng hoặc GPS chưa định vị xong. Vui lòng thử lại hoặc gửi báo bổ sung công.');
      setFeedbackType('warning');
      setFeedbackSheetOpen(true);
      return;
    }

    // Anti-spam 1min check
    const now = Date.now();
    const lastTime = useAppStore.getState().lastCheckInTime;
    if (now - lastTime < 1 * 60 * 1000) {
      const remainingSecs = Math.ceil((1 * 60 * 1000 - (now - lastTime)) / 1000);
      speak(`Vui lòng đợi thêm ${remainingSecs} giây để chấm công lại.`);
      setSpamWarningText(`Bạn vừa mới chấm công. Vui lòng đợi thêm ${remainingSecs} giây.`);
      setSpamWarningOpen(true);
      return;
    }

    // Late check-in warning
    let lateMinsInfo = 0;
    let shiftString = '';
    if (type === 'Vào ca' && approvedShifts) {
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
    store.setLastCheckInTime(Date.now());
    if (type === 'Vào ca') store.setStats({ ...store.stats, totalCheckIn: store.stats.totalCheckIn + 1 });
    
    // Success feedback via local custom sheets
    setFeedbackTitle('Đã ghi nhận!');
    setFeedbackMessage('Dữ liệu đang được đồng bộ ngầm lên hệ thống...');
    setFeedbackType('success');
    setFeedbackSheetOpen(true);

    if (type === 'Vào ca') {
      if (!isLate) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#0ea5e9', '#22c55e', '#facc15', '#ef4444'] });
        speak('Ting! Chúc bạn ca làm việc vui vẻ!');
      } else {
        document.body.classList.add('shake-warning');
        setTimeout(() => document.body.classList.remove('shake-warning'), 800);
      }
    } else {
      speak(type + ' thành công!');
    }

    const payloadImage = capturedImage;
    const payloadTime = store.capturedTime || currentTime;
    store.setCapturedImage(null);
    store.setCapturedTime(null);

    // Ensure reliable email delivery: resolve fallback to dmt.7121@gmail.com for admin / placeholder domains
    const effectiveEmail = (currentUser.email && !currentUser.email.includes('@kingsgrill.com'))
      ? currentUser.email
      : (currentUser.username.toLowerCase() === 'admin' ? 'dmt.7121@gmail.com' : (currentUser.email || 'dmt.7121@gmail.com'));

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
      lateMins: lateMinsInfo
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
        if (type === 'Vào ca' && Math.random() < 0.4) {
          setTimeout(() => {
            setSurveyEmotion(null);
            setSurveyNote('');
            setSurveyOpen(true);
          }, 1200);
        }

        const weekInfo = computeWeekInfo();
        const dataRes = await callApi('GET_DATA', { username: currentUser!.username, fullname: currentUser!.fullname, role: currentUser!.role, monthSheet: weekInfo.monthSheet, weekLabel: weekInfo.weekLabel }, { background: true });
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
        if (type === 'Vào ca') store.setStats({ ...store.stats, totalCheckIn: store.stats.totalCheckIn - 1 });
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

  const canSubmit = !!(capturedImage && gps.isValid && gps.lat !== null && gps.lng !== null);

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
      />

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

      {/* Current Shift Status Card (Clean & Non-intrusive) */}
      <div className="bg-[var(--kg-surface)] p-3 rounded-2xl border border-[var(--kg-border)] text-[var(--kg-text)] shadow-xs max-w-md mx-auto flex items-center justify-between gap-2.5">
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
              <span>Ca đêm</span>
            </>
          ) : recommendation.isOpenShift ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Đang trong ca ({recommendation.openShiftTime})</span>
            </>
          ) : recommendation.hasInToday ? (
            <span>✓ Đã vào ca</span>
          ) : (
            <span>Chưa vào ca</span>
          )}
        </span>
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
              <p className="text-[10px] font-black text-[var(--kg-text-muted)] uppercase tracking-wider">Định vị GPS (≤20m)</p>
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
            className="text-xs bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-3 py-2 rounded-xl transition font-black flex items-center min-h-[44px] touch-manipulation shadow-xs active:scale-95 flex-shrink-0"
          >
            <RefreshCw size={13} className={`mr-1.5 ${gps.status.includes('Đang') ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>

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
              className="w-full sm:w-auto px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-xs font-black shadow-md transition active:scale-95 min-h-[44px] touch-manipulation whitespace-nowrap flex-shrink-0"
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
      <div className={`relative bg-slate-950 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm ${capturedImage ? 'aspect-[3/4] max-h-[460px]' : 'aspect-[4/3] max-h-[300px] sm:max-h-[380px]'} group border-[4px] sm:border-[5px] max-w-sm mx-auto transition-all ${gps.isValid ? 'border-blue-600' : 'border-red-500'}`}>
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

        {/* AI Face Detection Overlays */}
        {!cameraError && !capturedImage && cameraActive && (
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
            <div className="absolute top-3 inset-x-3 z-40 flex items-center justify-between pointer-events-none">
              <span className="bg-emerald-600/95 text-white text-[11px] font-black px-2.5 py-1 rounded-full backdrop-blur-md shadow-md flex items-center gap-1">
                <CheckCircle2 size={13} />
                <span>Đã đóng dấu HD</span>
              </span>
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
                  onClick={() => store.setCapturedImage(null)}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full border border-white/20 backdrop-blur-md shadow-md active:scale-95 transition-all text-xs font-bold"
                >
                  <RotateCcw size={13} />
                  <span>Chụp lại</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Primary Action Button: Triggers Smart Confirmation Modal */}
      <div className="max-w-sm mx-auto space-y-2.5">
        <KgButton
          variant="primary"
          size="lg"
          disabled={!canSubmit}
          onClick={() => {
            if (!capturedImage) {
              takePhoto();
              return;
            }
            if (!gps.isValid) {
              speak('Bạn đang ở ngoài bán kính 20m nhà hàng.');
              return;
            }
            // Prepare modal state
            setModalChosenType(recommendation.recommendedType);
            setHasAcknowledgedMissingIn(false);
            setConfirmCheckInModalOpen(true);
          }}
          className={`w-full h-14 min-h-[52px] shadow-lg rounded-2xl text-[15px] font-black tracking-wider border-none active:scale-[0.97] transition-all touch-manipulation flex items-center justify-center gap-2.5 ${
            !canSubmit
              ? 'opacity-60 cursor-not-allowed bg-slate-400 text-white'
              : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-600/30 ring-2 ring-blue-400/30'
          }`}
          icon={Send}
        >
          {capturedImage ? '🚀 GỬI CHẤM CÔNG' : '📸 CHỤP ẢNH ĐỂ CHẤM CÔNG'}
        </KgButton>

        {!canSubmit && (
          <p className="text-[11px] text-center text-[var(--kg-text-muted)] font-medium">
            {!capturedImage && !gps.isValid
              ? '⚠️ Vui lòng đứng trong bán kính 20m và chụp ảnh để gửi chấm công.'
              : !gps.isValid
              ? '⚠️ Vị trí chưa hợp lệ (yêu cầu trong bán kính 20m nhà hàng).'
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

          {/* 2 Big Action Choices */}
          <div>
            <p className="text-[11px] font-black uppercase tracking-wider text-[var(--kg-text-muted)] mb-2 px-1">
              Chọn loại chấm công thực tế:
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* VÀO CA */}
              <button
                type="button"
                onClick={() => handleTypeChangeInModal('Vào ca')}
                className={`relative p-3.5 rounded-2xl border-2 flex flex-col items-center justify-center min-h-[58px] touch-manipulation transition-all duration-200 active:scale-95 gap-1 ${
                  modalChosenType === 'Vào ca'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-400 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400/40'
                    : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-black text-sm">
                  <LogIn size={18} className={modalChosenType === 'Vào ca' ? 'text-white' : 'text-emerald-500'} />
                  <span>VÀO CA</span>
                  {modalChosenType === 'Vào ca' && <Check size={16} className="text-white" />}
                </div>
                {recommendation.recommendedType === 'Vào ca' && (
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                    modalChosenType === 'Vào ca' ? 'bg-white/20 text-white' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  }`}>
                    ⭐ Đề xuất
                  </span>
                )}
              </button>

              {/* RA CA */}
              <button
                type="button"
                onClick={() => handleTypeChangeInModal('Ra ca')}
                className={`relative p-3.5 rounded-2xl border-2 flex flex-col items-center justify-center min-h-[58px] touch-manipulation transition-all duration-200 active:scale-95 gap-1 ${
                  modalChosenType === 'Ra ca'
                    ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white border-rose-400 shadow-md shadow-rose-600/30 ring-2 ring-rose-400/40'
                    : 'bg-[var(--kg-surface)] text-[var(--kg-text)] border-[var(--kg-border)] hover:bg-[var(--kg-surface-soft)]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-black text-sm">
                  <LogOut size={18} className={modalChosenType === 'Ra ca' ? 'text-white' : 'text-rose-500'} />
                  <span>RA CA</span>
                  {modalChosenType === 'Ra ca' && <Check size={16} className="text-white" />}
                </div>
                {recommendation.recommendedType === 'Ra ca' && (
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    modalChosenType === 'Ra ca' ? 'bg-white/20 text-white' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  }`}>
                    {recommendation.isOvernightShift ? <Moon size={10} /> : null}
                    <span>{recommendation.isOvernightShift ? '🌙 Ca đêm' : '⭐ Đề xuất'}</span>
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Safety Warning if Ra ca without prior Vào ca */}
          {modalChosenType === 'Ra ca' && !recommendation.isOpenShift && !recommendation.hasInToday && (
            <div className="p-3.5 bg-amber-500/10 dark:bg-amber-950/30 border-2 border-amber-500/30 rounded-2xl space-y-2 animate-fade-in">
              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs">
                <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                <span>Cảnh báo: Chưa có lượt Vào ca hôm nay!</span>
              </div>
              <p className="text-[11px] text-[var(--kg-text-muted)] leading-relaxed font-medium">
                Hệ thống chưa tìm thấy dữ liệu Vào ca của bạn. Bạn vẫn có thể tiếp tục chấm Ra ca nhưng lượt chấm này có thể sẽ cần Quản lý duyệt bổ sung.
              </p>
              <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasAcknowledgedMissingIn}
                  onChange={(e) => setHasAcknowledgedMissingIn(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-black text-amber-700 dark:text-amber-300">
                  Tôi hiểu và xác nhận vẫn muốn chấm RA CA
                </span>
              </label>
            </div>
          )}

          {/* Final Confirmation Action Buttons */}
          <div className="space-y-2 pt-2">
            <KgButton
              variant={modalChosenType === 'Vào ca' ? 'primary' : 'danger'}
              size="lg"
              disabled={modalChosenType === 'Ra ca' && !recommendation.isOpenShift && !recommendation.hasInToday && !hasAcknowledgedMissingIn}
              onClick={() => {
                setConfirmCheckInModalOpen(false);
                proceedSubmitCheck(modalChosenType);
              }}
              className={`w-full h-13 min-h-[52px] shadow-lg rounded-2xl text-[15px] font-black tracking-wider border-none active:scale-[0.97] transition-all touch-manipulation flex items-center justify-center gap-2 ${
                modalChosenType === 'Vào ca'
                  ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 hover:from-emerald-700 hover:to-teal-700 text-white shadow-emerald-600/30'
                  : 'bg-gradient-to-r from-rose-500 via-red-600 to-rose-700 hover:from-rose-600 hover:to-red-700 text-white shadow-rose-600/30'
              }`}
              icon={modalChosenType === 'Vào ca' ? LogIn : LogOut}
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
          defaultType={selectedMissingAlert ? selectedMissingAlert.missingType : modalChosenType}
          defaultDate={selectedMissingAlert ? selectedMissingAlert.dateStr : undefined}
          defaultTime={selectedMissingAlert ? selectedMissingAlert.timeStr : undefined}
          defaultReason="Quên bấm máy khi vào việc gấp"
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
          executeCheck('Vào ca', true, pendingLateMins, pendingShiftStr);
        }}
      />

      {/* General info feedback sheet */}
      <KgBottomSheet isOpen={feedbackSheetOpen} onClose={() => setFeedbackSheetOpen(false)} title="Thông báo">
        <div className="space-y-4 text-center py-2">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
            feedbackType === 'success' ? 'bg-green-50 text-green-500' :
            feedbackType === 'warning' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
          }`}>
            <UserCheck size={24} />
          </div>
          <h4 className="text-base font-extrabold text-slate-800 dark:text-white">{feedbackTitle}</h4>
          <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed">
            {feedbackMessage}
          </p>
          <KgButton variant="secondary" size="md" className="w-full" onClick={() => setFeedbackSheetOpen(false)}>
            Đóng
          </KgButton>
        </div>
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
