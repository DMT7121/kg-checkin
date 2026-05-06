import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { callApi } from '../services/api';
import KalmanFilter from '../utils/kalman';
import { getDist, speak, getCurrentTimeString, computeWeekInfo, KG_LAT, KG_LNG, KG_RADIUS_METERS } from '../utils/helpers';
import Swal from 'sweetalert2';
import { MapPin, RefreshCw, CameraOff, Camera, RotateCcw, LogIn, LogOut, UserCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import * as faceapi from 'face-api.js';

export default function CheckIn() {
  const store = useAppStore();
  const { currentUser, gps, capturedImage, currentTime, approvedShifts, serverGpsConfig } = store;

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
  const [isFaceModelLoaded, setIsFaceModelLoaded] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);

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
            // Update address without overwriting other GPS properties
            const currentGps = useAppStore.getState().gps;
            store.setGps({ ...currentGps, address: res.data.address });
          }
        });
      }
    }
  }, [gps.lat, gps.lng, gps.isValid]);

  // === GPS LOGIC (100% from original) ===
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

    // Use server config if available, otherwise fallback to hardcoded
    const targetLat = serverGpsConfig?.lat ?? KG_LAT;
    const targetLng = serverGpsConfig?.lng ?? KG_LNG;
    
    const dist = getDist(lat, lng, targetLat, targetLng) * 1000;
    const isTestApp = useAppStore.getState().currentUser?.username === 'testapp';

    const targetRadius = serverGpsConfig?.radius ?? KG_RADIUS_METERS;
    
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

  const startGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null) return;
    store.setGps({ status: 'Đang bắt vệ tinh (Nhanh)...', message: 'Vui lòng đợi...' });
    if (!navigator.geolocation) { store.setGps({ status: 'Không hỗ trợ GPS' }); return; }

    navigator.geolocation.getCurrentPosition(
      (pos) => handleGpsSuccess(pos, true),
      () => {}, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => handleGpsSuccess(pos, false),
      (err) => {
        if (err.code === 1) store.setGps({ status: 'Bị chặn quyền GPS', message: 'Cấp quyền định vị trong Cài đặt.' });
        else store.setGps({ status: 'Sóng yếu, di chuyển...' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    gpsTimeoutRef.current = setTimeout(() => {
      const g = useAppStore.getState().gps;
      if (!g.isValid && g.status !== 'Bị chặn quyền GPS') {
        store.setGps({ status: 'GPS chậm, đang thử lại...' });
        navigator.geolocation.getCurrentPosition((p) => handleGpsSuccess(p, true), () => {}, { enableHighAccuracy: false });
      }
    }, 5000);
  }, [handleGpsSuccess]);

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

  // === CAMERA LOGIC (100% from original) ===
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
    
    try {
      if (!window.isSecureContext && location.hostname !== 'localhost') { setCameraError(true); return; }

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
          return; // success
        } catch { /* try next constraint */ }
      }
      setCameraError(true);
      speak('Không thể mở máy ảnh. Vui lòng kiểm tra quyền truy cập.');
    } finally {
      isStartingCameraRef.current = false;
    }
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Tối ưu cho iOS: Độ phân giải 480x640, chuẩn JPEG (iOS cũ không hỗ trợ WebP)
    const targetWidth = 480, targetHeight = 640;
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
    
    // Draw background gradient for text readability
    const gradient = ctx.createLinearGradient(0, targetHeight - 120, 0, targetHeight);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, targetHeight - 120, targetWidth, 120);

    // Draw Time
    ctx.font = 'bold 36px Arial'; 
    ctx.fillStyle = '#FFD700'; ctx.shadowColor = 'black'; ctx.shadowBlur = 6;
    ctx.fillText(exactTime, 30, targetHeight - 65); 
    
    // Draw Location
    const addr = useAppStore.getState().gps.address || useAppStore.getState().gps.status || 'Chưa rõ vị trí';
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#FFFFFF'; ctx.shadowBlur = 4;
    // Truncate if too long
    const displayAddr = addr.length > 60 ? addr.substring(0, 60) + '...' : addr;
    ctx.fillText(displayAddr, 30, targetHeight - 25);
    
    ctx.shadowBlur = 0;
    // Bắt buộc dùng image/jpeg để tương thích 100% iOS và giảm dung lượng payload
    store.setCapturedImage(canvas.toDataURL('image/jpeg', 0.6));
    store.setCapturedTime(exactTime);
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
        // Tối ưu cho iOS
        const targetWidth = 480, targetHeight = 640;
        canvas.width = targetWidth; canvas.height = targetHeight;
        const vw = img.width, vh = img.height;
        const canvasRatio = targetWidth / targetHeight, imgRatio = vw / vh;
        let sx: number, sy: number, sWidth: number, sHeight: number;
        if (imgRatio > canvasRatio) { sHeight = vh; sWidth = vh * canvasRatio; sx = (vw - sWidth) / 2; sy = 0; }
        else { sWidth = vw; sHeight = vw / canvasRatio; sx = 0; sy = (vh - sHeight) / 2; }
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
        
        const exactTime = currentTime + ':' + String(new Date().getSeconds()).padStart(2, '0');
        
        // Draw background gradient
        const gradient = ctx.createLinearGradient(0, targetHeight - 120, 0, targetHeight);
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, targetHeight - 120, targetWidth, 120);

        // Draw Time
        ctx.font = 'bold 36px Arial'; 
        ctx.fillStyle = '#FFD700'; ctx.shadowColor = 'black'; ctx.shadowBlur = 6;
        ctx.fillText(exactTime, 30, targetHeight - 65); 
        
        // Draw Location
        const addr = useAppStore.getState().gps.address || useAppStore.getState().gps.status || 'Chưa rõ vị trí';
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = '#FFFFFF'; ctx.shadowBlur = 4;
        const displayAddr = addr.length > 60 ? addr.substring(0, 60) + '...' : addr;
        ctx.fillText(displayAddr, 30, targetHeight - 25);
        
        ctx.shadowBlur = 0;
        store.setCapturedImage(canvas.toDataURL('image/jpeg', 0.6));
        store.setCapturedTime(exactTime);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // === SUBMIT CHECK (100% from original) ===
  const submitCheck = async (type: string) => {
    if (!capturedImage || !gps.isValid || !gps.lat) return;

    // Anti-spam 1min check (Giảm từ 30p xuống 1p để test)
    const now = Date.now();
    const lastTime = useAppStore.getState().lastCheckInTime;
    if (now - lastTime < 1 * 60 * 1000) {
      const remainingSecs = Math.ceil((1 * 60 * 1000 - (now - lastTime)) / 1000);
      speak(`Vui lòng đợi thêm ${remainingSecs} giây để chấm công lại.`);
      Swal.fire({ title: 'Cảnh báo Spam', text: `Bạn vừa mới chấm công. Vui lòng đợi thêm ${remainingSecs} giây.`, icon: 'warning', confirmButtonColor: '#0ea5e9' });
      return;
    }

    // Late check-in warning
    let isLate = false;
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
            isLate = true;
            lateMinsInfo = currentTotal - shiftTotal;
            speak(`Cảnh báo, bạn đang vào ca trễ ${lateMinsInfo} phút.`);
            const { isConfirmed } = await Swal.fire({
              title: 'Cảnh báo: Vào ca trễ!',
              html: `Theo lịch đã duyệt, ca của bạn bắt đầu lúc <b>${todayShift}</b>.<br>Bạn đang vào ca trễ <b>${lateMinsInfo} phút</b>.`,
              icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#6b7280',
              confirmButtonText: 'Đồng ý & Chấm công', cancelButtonText: 'Hủy',
            });
            if (!isConfirmed) return;
          }
        }
      }
      if (!shiftString) shiftString = todayShift || 'Không có ca';
    }

    // Optimistic update
    const actualTime = store.capturedTime || currentTime;
    const tempLog = { fullname: currentUser!.fullname, type, time: actualTime, status: 'Đang đồng bộ...', image: capturedImage };
    store.prependLog(tempLog);
    if (type === 'Vào ca') store.setStats({ ...store.stats, totalCheckIn: store.stats.totalCheckIn + 1 });
    
    // ĐÓNG MODAL/THÔNG BÁO VÀ CHẠY HIỆU ỨNG NGAY LẬP TỨC
    Swal.fire({ title: 'Đã ghi nhận!', text: 'Dữ liệu đang được đồng bộ ngầm...', icon: 'success', timer: 1500, showConfirmButton: false });
    
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

    // Đẩy lên Server (Background)
    callApi('CHECK_IN_OUT', payload, { background: true }).then(async (res) => {
      if (res?.ok) {
        // --- CHẠY NGẦM GỬI EMAIL BÁO CÁO (Tránh block UI) ---
        if (res.data) {
          callApi('SEND_EMAIL_NOTIFICATION', {
            ...payload,
            imageUrl: res.data.imageUrl,
            distMeters: res.data.distMeters,
            isValid: res.data.isValid,
            viTri: res.data.viTri,
            timeISO: res.data.timeISO
          }, { background: true }).then((emailRes) => {
            if (emailRes?.ok) {
              console.log('[Email] Gửi email thông báo thành công');
            } else {
              console.error('[Email] Gửi email thất bại:', emailRes?.message || 'Unknown error');
            }
          });
          
          // --- CHẠY NGẦM UPLOAD ẢNH NẾU CÓ ---
          if (payloadImage) {
            callApi('UPLOAD_CHECKIN_IMAGE', {
              fullname: currentUser!.fullname,
              timeISO: res.data.timeISO,
              image: payloadImage
            }, { background: true });
          }
        }

        // --- BẮT ĐẦU: KHẢO SÁT NỘI BỘ (PULSE SURVEY) ---
        if (type === 'Vào ca' && Math.random() < 0.4) {
          setTimeout(async () => {
            const { value: emotion } = await Swal.fire({
              title: 'Khảo sát nhanh!', text: 'Hôm nay bạn cảm thấy thế nào trước khi vào ca?', icon: 'question',
              input: 'radio', inputOptions: { '5': '😍 Tuyệt vời, đầy năng lượng!', '4': '🙂 Vui vẻ, sẵn sàng làm việc', '3': '😐 Bình thường', '2': '🙁 Hơi mệt mỏi/Buồn', '1': '😠 Căng thẳng/Bực bội' },
              inputValidator: (value) => { if (!value) return 'Vui lòng chọn cảm xúc của bạn!'; },
              confirmButtonText: 'Tiếp tục', confirmButtonColor: '#0ea5e9', allowOutsideClick: false, backdrop: `rgba(0,0,0,0.8)`
            });

            if (emotion) {
              const { value: note } = await Swal.fire({
                title: 'Chia sẻ thêm (không bắt buộc)', input: 'textarea', inputLabel: 'Có điều gì bạn cần Quản lý hỗ trợ trong ca hôm nay không?', inputPlaceholder: 'Nhập ý kiến của bạn...',
                showCancelButton: true, confirmButtonText: 'Gửi', cancelButtonText: 'Bỏ qua', confirmButtonColor: '#0ea5e9'
              });
              
              callApi('SUBMIT_SURVEY', { username: currentUser!.username, fullname: currentUser!.fullname, emotion: parseInt(emotion), note: note || '' }, { background: true });
              Swal.fire({ title: 'Cảm ơn bạn!', text: "King's Grill luôn trân trọng mọi đóng góp của bạn ❤️", icon: 'success', timer: 2000, showConfirmButton: false });
            }
          }, 1000);
        }

        // Refresh data ngầm
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
        // Rollback nếu thất bại
        store.removeFirstLog();
        if (type === 'Vào ca') store.setStats({ ...store.stats, totalCheckIn: store.stats.totalCheckIn - 1 });
        speak('Lỗi đồng bộ dữ liệu, vui lòng kiểm tra mạng');
        Swal.fire('Lỗi đồng bộ', res?.message || 'Không thể kết nối máy chủ.', 'error');
      }
    });
  };

  // Init camera & GPS on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        setIsFaceModelLoaded(true);
      } catch (e) {
        console.error('Face API model load error:', e);
      }
    };
    loadModels();

    // eslint-disable-next-line react-hooks/set-state-in-effect
    startCamera();
    startGpsWatch();
    return () => {
      stopCamera();
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (gpsTimeoutRef.current) clearTimeout(gpsTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let interval: any;
    if (cameraActive && isFaceModelLoaded && videoRef.current && overlayCanvasRef.current) {
      const video = videoRef.current;
      const canvas = overlayCanvasRef.current;

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
                ctx.strokeStyle = '#22c55e'; // Green box
                ctx.lineWidth = 4;
                const box = resizedDetections[0].box;
                ctx.strokeRect(box.x, box.y, box.width, box.height);
              } else {
                setIsFaceDetected(false);
                if (resizedDetections.length > 1) {
                  ctx.strokeStyle = '#ef4444'; // Red box
                  ctx.lineWidth = 4;
                  resizedDetections.forEach((det: any) => {
                    const box = det.box;
                    ctx.strokeRect(box.x, box.y, box.width, box.height);
                  });
                }
              }
              ctx.restore();
            }
          }
        } catch (e) {
          // ignore detection errors
        }
      }, 300);
    }
    return () => clearInterval(interval);
  }, [cameraActive, isFaceModelLoaded]);

  const canSubmit = !!(capturedImage && gps.isValid && gps.lat);

  return (
    <div className="p-4 space-y-4 animate-fade-in pb-10">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-500 via-green-600 to-teal-700 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden flex items-center justify-between mb-4">
        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm shadow-inner flex-shrink-0">
              <Camera size={20} className="text-white" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Chấm công GPS</h2>
          </div>
          <p className="text-green-100 font-medium opacity-90 text-sm md:text-base max-w-lg">
            Chụp ảnh minh chứng tại nhà hàng.
          </p>
        </div>
        <div className="hidden md:block relative z-10 opacity-80">
          <UserCheck size={80} strokeWidth={1} />
        </div>
        {/* Background Decorations */}
        <div className="absolute right-[-10%] top-[-20%] w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-overlay"></div>
        <div className="absolute left-[-5%] bottom-[-50%] w-48 h-48 bg-green-400/30 rounded-full blur-2xl mix-blend-overlay"></div>
      </div>

      {/* GPS Status Card */}
      <div className="bg-gradient-to-r from-ocean-600 to-ocean-500 rounded-3xl p-5 text-white shadow-lg shadow-ocean-500/20 relative overflow-hidden">
        <div className="absolute -right-4 -top-4 opacity-10 text-8xl transform rotate-12"><MapPin size={100} /></div>
        <div className="flex items-start space-x-4 relative z-10">
          <div className="bg-white/20 backdrop-blur-sm p-3 rounded-2xl relative">
            <MapPin className="relative z-10" size={24} />
            {gps.status.includes('Đang') && <div className="gps-ping absolute inset-0" />}
          </div>
          <div>
            <p className="text-xs font-bold text-ocean-100 uppercase tracking-wide">Vị trí hiện tại</p>
            <h3 className="font-bold text-base mt-0.5 line-clamp-2 leading-tight">
              {gps.address ? gps.address : gps.status}
            </h3>
            <div className={`mt-2 inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-black/20 backdrop-blur-md ${gps.isValid ? 'text-green-300' : 'text-red-300'}`}>
              <span>{gps.message}</span>
            </div>
          </div>
        </div>
        <button onClick={restartGps} className="absolute top-4 right-4 text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-full transition backdrop-blur-md font-medium flex items-center min-h-[44px] touch-manipulation">
          <RefreshCw size={14} className={`mr-1.5 ${gps.status.includes('Đang') ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      {/* Camera Container */}
      <div className={`relative bg-gray-900 rounded-3xl overflow-hidden shadow-xl aspect-[3/4] group border-[6px] max-h-[60vh] ${gps.isValid ? 'border-green-500' : 'border-gray-200 dark:border-gray-700'}`}>
        <video ref={videoRef} autoPlay muted playsInline className={`w-full h-full object-cover mirror-cam ${(cameraError || capturedImage) ? 'hidden' : ''}`} />
        <canvas ref={overlayCanvasRef} className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${(cameraError || capturedImage) ? 'hidden' : ''}`} />
        <canvas ref={canvasRef} className="hidden" />

        {/* Camera Error Fallback */}
        {cameraError && !capturedImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white p-6 text-center z-50">
            <CameraOff size={48} className="mb-4 text-gray-400" />
            <p className="mb-2 text-[1rem] font-medium max-w-[80%]">Camera đang bị chặn bởi ứng dụng.</p>
            <p className="mb-6 text-xs text-gray-500">Vui lòng dùng máy ảnh hệ thống để tiếp tục.</p>
            <input type="file" ref={fileInputRef} accept="image/*" capture="user" className="hidden" onChange={handleFileUpload} />
            <button onClick={() => fileInputRef.current?.click()} className="bg-gradient-to-r from-ocean-600 to-ocean-500 text-white px-8 py-4 rounded-full shadow-lg font-bold flex items-center mb-6 min-h-[44px] touch-manipulation text-[1rem]">
              <Camera className="mr-2" size={20} /> MỞ MÁY ẢNH
            </button>
            <button onClick={() => startCamera()} className="text-sm text-gray-400 hover:text-white underline flex items-center min-h-[44px] p-2">
              <RotateCcw className="mr-2" size={14} /> Tải lại WebRTC Camera
            </button>
          </div>
        )}

        {/* Time overlay + recording dot */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-20">
          <div className="bg-black/50 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-md font-mono border border-white/10 shadow-md flex items-center">
            <span className="font-bold">{currentTime}</span>
          </div>
          <div className="bg-red-500 w-3 h-3 rounded-full animate-pulse shadow-[0_0_10px_red]" />
        </div>

        {/* Face Detection Hints */}
        {!cameraError && !capturedImage && cameraActive && (
          <>
            {!isFaceModelLoaded && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/60 text-white px-4 py-2 rounded-xl backdrop-blur-sm z-30 font-semibold text-sm flex items-center shadow-lg whitespace-nowrap">
                <RefreshCw size={16} className="animate-spin mr-2"/> Đang tải mô hình AI...
              </div>
            )}
            {isFaceModelLoaded && !isFaceDetected && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-500/80 text-white px-5 py-3 rounded-xl backdrop-blur-sm z-30 font-bold text-sm shadow-xl text-center whitespace-nowrap animate-pulse">
                Vui lòng đưa 1 khuôn mặt<br/>vào giữa khung hình
              </div>
            )}
          </>
        )}

        {/* Shutter button */}
        {!capturedImage && !cameraError && (
          <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center space-x-6 z-20">
            <button onClick={() => { stopCamera(); setTimeout(startCamera, 300); }} className="w-12 h-12 bg-black/40 rounded-full flex items-center justify-center text-white backdrop-blur-md shadow-lg border border-white/20 active:scale-90 transition" title="Khởi động lại máy ảnh">
              <RotateCcw size={20} />
            </button>
            {cameraActive ? (
              <button onClick={takePhoto} disabled={!isFaceDetected} className={`group relative touch-manipulation transition-all duration-300 ${!isFaceDetected ? 'opacity-30 scale-90 grayscale' : 'scale-100'}`}>
                <div className="absolute inset-0 bg-white rounded-full opacity-30 group-hover:opacity-50 transition-opacity duration-300 scale-110" />
                <div className="w-16 h-16 bg-transparent border-4 border-white rounded-full flex items-center justify-center shadow-lg">
                  <div className={`w-12 h-12 rounded-full transition-colors ${!isFaceDetected ? 'bg-gray-400' : 'bg-green-500'}`} />
                </div>
              </button>
            ) : (
              <button onClick={() => startCamera()} className="bg-white/20 backdrop-blur text-white p-4 rounded-full hover:bg-white/30 min-h-[44px] touch-manipulation">
                <RotateCcw size={20} />
              </button>
            )}
          </div>
        )}

        {/* Captured image preview */}
        {capturedImage && (
          <div className="absolute inset-0 bg-black z-30 flex flex-col items-center justify-center">
            <img src={capturedImage} className="w-full h-full object-cover" alt="Captured" />
            <div className="absolute bottom-8 flex space-x-4">
              <button onClick={() => store.setCapturedImage(null)} className="bg-white/20 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-lg hover:bg-white/30 font-bold border border-white/20 transition transform hover:scale-105 min-h-[44px] touch-manipulation flex items-center">
                <RotateCcw size={16} className="mr-2" /> Chụp lại
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Check-in Buttons */}
      <div className="grid grid-cols-2 gap-4 pt-2">
        <button onClick={() => submitCheck('Vào ca')} disabled={!canSubmit}
          className={`group relative overflow-hidden py-4 rounded-2xl shadow-lg font-bold text-lg flex flex-col items-center justify-center transition-all transform active:scale-95 disabled:opacity-50 disabled:grayscale min-h-[80px] touch-manipulation ${canSubmit ? 'bg-gradient-to-br from-green-500 to-green-600 text-white hover:shadow-green-500/40' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <LogIn size={24} className="mb-1 relative z-10" /><span className="relative z-10">VÀO CA</span>
        </button>
        <button onClick={() => submitCheck('Ra ca')} disabled={!canSubmit}
          className={`group relative overflow-hidden py-4 rounded-2xl shadow-lg font-bold text-lg flex flex-col items-center justify-center transition-all transform active:scale-95 disabled:opacity-50 disabled:grayscale min-h-[80px] touch-manipulation ${canSubmit ? 'bg-gradient-to-br from-red-500 to-red-600 text-white hover:shadow-red-500/40' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <LogOut size={24} className="mb-1 relative z-10" /><span className="relative z-10">RA CA</span>
        </button>
      </div>
    </div>
  );
}
