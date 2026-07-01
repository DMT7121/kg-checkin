import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import KalmanFilter from '../utils/kalman';
import { getDist, speak, getCurrentTimeString, computeWeekInfo, KG_LAT, KG_LNG, KG_RADIUS_METERS } from '../utils/helpers';
import { MapPin, RefreshCw, CameraOff, Camera, RotateCcw, LogIn, LogOut, UserCheck, AlertTriangle } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  KgButton,
  KgBottomSheet,
  KgConfirmSheet,
  KgTextarea,
  KgModuleHero
} from '../components/KgDesignSystem';

export default function CheckIn() {
  const store = useAppStore();
  const { currentUser, gps, capturedImage, currentTime, approvedShifts } = store;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const kalmanLatRef = useRef(new KalmanFilter(25));
  const kalmanLngRef = useRef(new KalmanFilter(25));
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

  // GPS Logic
  const handleGpsSuccess = useCallback((pos: GeolocationPosition, isFastStart: boolean) => {
    const rawLat = pos.coords.latitude;
    const rawLng = pos.coords.longitude;
    const acc = pos.coords.accuracy;

    kalmanLatRef.current.setR(acc * acc);
    kalmanLngRef.current.setR(acc * acc);
    const filteredLat = kalmanLatRef.current.filter(rawLat);
    const filteredLng = kalmanLngRef.current.filter(rawLng);

    const lat = (isFastStart || acc < 30) ? rawLat : filteredLat;
    const lng = (isFastStart || acc < 30) ? rawLng : filteredLng;

    const latestGpsConfig = useAppStore.getState().serverGpsConfig;
    const targetLat = latestGpsConfig?.lat ?? KG_LAT;
    const targetLng = latestGpsConfig?.lng ?? KG_LNG;
    
    const dist = getDist(lat, lng, targetLat, targetLng) * 1000;
    const isTestApp = useAppStore.getState().currentUser?.username === 'testapp';

    const targetRadius = latestGpsConfig?.radius ?? KG_RADIUS_METERS;
    
    if (dist <= targetRadius || isTestApp) {
      store.setGps({ lat, lng, isValid: true, status: isTestApp ? 'Vị trí Test (Bypass)' : 'Vị trí Chính xác', message: `Khoảng cách: ${Math.round(dist)}m (±${Math.round(acc)}m)` });
      if (prevGpsValidRef.current !== true) { speak('Vị trí đã hợp lệ, sẵn sàng chấm công'); prevGpsValidRef.current = true; }
    } else {
      store.setGps({ lat, lng, isValid: false, status: 'Vị trí quá xa', message: `Cách: ${Math.round(dist)}m (Cho phép ${targetRadius}m)` });
      if (prevGpsValidRef.current !== false && prevGpsValidRef.current !== null) { speak('Vị trí không hợp lệ, vui lòng di chuyển lại gần'); prevGpsValidRef.current = false; }
      else if (prevGpsValidRef.current === null) { prevGpsValidRef.current = false; }
    }
    if (!isFastStart && acc < 20) { store.setGps({ status: 'GPS Ổn định (High Acc)' }); }
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
    store.setGps({ isValid: false, status: 'Đang xác định vị trí...', message: 'Vui lòng đợi trong giây lát.' });
    if (!navigator.geolocation) {
      store.setGps({ status: 'Thiết bị không hỗ trợ định vị', message: 'Hãy dùng điện thoại có GPS.' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => handleGpsSuccess(pos, true),
      handleGpsError,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => handleGpsSuccess(pos, false),
      handleGpsError,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 }
    );

    if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    gpsTimeoutRef.current = setTimeout(() => {
      const g = useAppStore.getState().gps;
      if (!g.isValid && g.status !== 'Chưa được cấp quyền vị trí') {
        store.setGps({ status: 'Đang thử lại vị trí...', message: 'Có thể mất thêm vài giây.' });
        navigator.geolocation.getCurrentPosition(
          (p) => handleGpsSuccess(p, true),
          handleGpsError,
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
        );
      }
    }, 13000);
  }, [handleGpsError, handleGpsSuccess, store]);

  const restartGps = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    watchIdRef.current = null;
    store.setGps({ lat: null, lng: null, isValid: false, status: 'Chưa định vị', message: '', address: undefined });
    kalmanLatRef.current = new KalmanFilter(25);
    kalmanLngRef.current = new KalmanFilter(25);
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

  const drawWatermarkAndSave = (
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    exactTime: string,
    addr: string
  ) => {
    const cardX = 24;
    const cardHeight = 150;
    const cardY = canvas.height - cardHeight - 24;
    const cardWidth = canvas.width - (cardX * 2);
    const radius = 20;

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw Glassmorphic Card Background (Deep Slate with semi-transparency)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    
    const drawRoundRect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      if (typeof c.roundRect === 'function') {
        c.roundRect(x, y, w, h, r);
      } else {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        c.beginPath();
        c.moveTo(x+r, y);
        c.arcTo(x+w, y,   x+w, y+h, r);
        c.arcTo(x+w, y+h, x,   y+h, r);
        c.arcTo(x,   y+h, x,   y,   r);
        c.arcTo(x,   y,   x+w, y,   r);
        c.closePath();
      }
    };

    ctx.beginPath();
    drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, radius);
    ctx.fill();

    // Subtle White/Border Outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    drawRoundRect(ctx, cardX, cardY, cardWidth, cardHeight, radius);
    ctx.stroke();

    // Content Padding
    const padX = 24;
    const contentX = cardX + padX;
    
    // Time & Date (Row 1)
    const timeY = cardY + 46;
    ctx.font = 'bold 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#FCD34D'; // Yellow/Gold
    ctx.fillText('🕒  ' + exactTime, contentX, timeY);

    // Location Address (Row 2 & 3 if wrapped)
    ctx.font = '500 20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillStyle = '#E2E8F0'; // Slate-200
    
    const displayAddr = '📍 ' + addr;
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

    wrapText(ctx, displayAddr, contentX, cardY + 90, maxTextWidth, 28);
    
    // Save image with WebP (highly compressed but very sharp), fallback to JPEG
    let dataUrl = canvas.toDataURL('image/webp', 0.8);
    if (dataUrl.startsWith('data:image/png')) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    }
    
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

    // Upgraded resolution for sharpness: 720x960 (3:4 ratio)
    const targetWidth = 720, targetHeight = 960;
    canvas.width = targetWidth; canvas.height = targetHeight;
    const vw = video.videoWidth, vh = video.videoHeight;
    const canvasRatio = targetWidth / targetHeight, videoRatio = vw / vh;
    let sx: number, sy: number, sWidth: number, sHeight: number;

    if (videoRatio > canvasRatio) { sHeight = vh; sWidth = vh * canvasRatio; sx = (vw - sWidth) / 2; sy = 0; }
    else { sWidth = vw; sHeight = vw / canvasRatio; sx = 0; sy = (vh - sHeight) / 2; }

    ctx.save(); ctx.translate(targetWidth, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
    ctx.restore();

    const exactTime = currentTime + ':' + String(new Date().getSeconds()).padStart(2, '0');
    const addr = useAppStore.getState().gps.address || useAppStore.getState().gps.status || 'Chưa rõ vị trí';
    
    drawWatermarkAndSave(canvas, ctx, exactTime, addr);
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
        
        // Upgraded resolution for sharpness: 720x960 (3:4 ratio)
        const targetWidth = 720, targetHeight = 960;
        canvas.width = targetWidth; canvas.height = targetHeight;
        const vw = img.width, vh = img.height;
        const canvasRatio = targetWidth / targetHeight, imgRatio = vw / vh;
        let sx: number, sy: number, sWidth: number, sHeight: number;
        if (imgRatio > canvasRatio) { sHeight = vh; sWidth = vh * canvasRatio; sx = (vw - sWidth) / 2; sy = 0; }
        else { sWidth = vw; sHeight = vw / canvasRatio; sx = 0; sy = (vh - sHeight) / 2; }
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
        
        const exactTime = currentTime + ':' + String(new Date().getSeconds()).padStart(2, '0');
        const addr = useAppStore.getState().gps.address || useAppStore.getState().gps.status || 'Chưa rõ vị trí';
        
        drawWatermarkAndSave(canvas, ctx, exactTime, addr);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Submit flow triggers
  const submitCheck = async (type: string) => {
    if (!capturedImage || !gps.isValid || gps.lat === null || gps.lng === null) return;

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
    const actualTime = store.capturedTime || currentTime;
    const tempLog = {
      fullname: currentUser!.fullname,
      type,
      time: actualTime,
      status: 'Đang đồng bộ...',
      image: capturedImage || undefined
    };
    
    store.prependLog(tempLog);
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

    const payload = {
      username: currentUser!.username, fullname: currentUser!.fullname,
      email: currentUser!.email, type, lat: gps.lat, lng: gps.lng, image: payloadImage ? 'PENDING' : null,
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

        // Background triggers
        if (res.data) {
          callApi('SEND_EMAIL_NOTIFICATION', {
            ...payload,
            imageUrl: res.data.imageUrl,
            distMeters: res.data.distMeters,
            isValid: res.data.isValid,
            viTri: res.data.viTri,
            timeISO: res.data.timeISO
          }, { background: true });
          
          if (payloadImage) {
            callApi('UPLOAD_CHECKIN_IMAGE', {
              fullname: currentUser!.fullname,
              timeISO: res.data.timeISO,
              image: payloadImage
            }, { background: true });
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

  const canSubmit = !!(capturedImage && gps.isValid && gps.lat !== null && gps.lng !== null);

  return (
    <div className="space-y-4 animate-fade-in pb-10">
      
      {/* Header Banner */}
      <KgModuleHero
        moduleId="checkin"
        title="Chấm công GPS"
        description="Chụp ảnh minh chứng tại nhà hàng để hoàn thành chấm công."
        features={['Xác thực vị trí', 'Ảnh có thời gian']}
      />

      {/* GPS Status Card */}
      <div className="bg-[var(--kg-surface)] p-5 rounded-3xl relative overflow-hidden border border-[var(--kg-border)] text-[var(--kg-text)] shadow-sm">
        <div className="absolute -right-4 -top-4 opacity-5 text-8xl transform rotate-12 text-blue-600/10"><MapPin size={100} /></div>
        <div className="flex items-start space-x-4 relative z-10">
          <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-2xl relative flex-shrink-0 text-blue-600 dark:text-indigo-400">
            <MapPin className="relative z-10" size={24} />
            {gps.status.includes('Đang') && <div className="gps-ping absolute inset-0" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-[var(--kg-text-muted)] uppercase tracking-wider">Vị trí hiện tại</p>
            <h3 className="font-extrabold text-sm md:text-base mt-0.5 leading-tight break-words text-[var(--kg-text)] pr-20">
              {gps.address ? gps.address : gps.status}
            </h3>
            <div className={`mt-2 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${gps.isValid ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' : 'bg-red-50 text-red-650 dark:bg-red-950/20 dark:text-red-400'}`}>
              <span className="truncate">{gps.message}</span>
            </div>
          </div>
        </div>
        <button
          onClick={restartGps}
            className="absolute top-4 right-4 text-xs bg-[var(--kg-primary)] hover:bg-[var(--kg-primary-hover)] text-white px-3 py-1.5 rounded-full transition font-bold flex items-center min-h-[44px] touch-manipulation shadow-sm"
        >
          <RefreshCw size={14} className={`mr-1.5 ${gps.status.includes('Đang') ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* Camera Viewport */}
      <div className={`relative bg-slate-950 rounded-3xl overflow-hidden shadow-sm aspect-[3/4] group border-[5px] max-w-sm mx-auto ${gps.isValid ? 'border-blue-600' : 'border-red-500'}`}>
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

        {/* Captured image display */}
        {capturedImage && (
          <div className="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center animate-fade-in">
            <img src={capturedImage} className="w-full h-full object-cover" alt="Captured" />
            <div className="absolute top-4 right-4 z-40">
              <button
                type="button"
                onClick={() => store.setCapturedImage(null)}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-black/60 hover:bg-black/80 text-white rounded-full border border-white/20 backdrop-blur-md shadow-md active:scale-95 transition-all text-xs font-bold pointer-events-auto"
              >
                <RotateCcw size={13} />
                <span>Chụp lại</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Checkin Action Buttons */}
      <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
        <KgButton
          variant="primary"
          size="lg"
          disabled={!canSubmit}
          onClick={() => submitCheck('Vào ca')}
          className="h-14 shadow-lg rounded-2xl text-[15px] font-extrabold tracking-wider bg-gradient-to-r from-blue-600 to-indigo-650 hover:from-blue-700 hover:to-indigo-700 border-none active:scale-[0.97] transition-all"
          icon={LogIn}
        >
          VÀO CA
        </KgButton>
        <KgButton
          variant="danger"
          size="lg"
          disabled={!canSubmit}
          onClick={() => submitCheck('Ra ca')}
          className="h-14 shadow-lg rounded-2xl text-[15px] font-extrabold tracking-wider bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 border-none active:scale-[0.97] transition-all"
          icon={LogOut}
        >
          RA CA
        </KgButton>
      </div>

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
