import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ScanFace,
  CheckCircle2,
  AlertTriangle,
  Lock,
  RotateCcw,
  ShieldCheck,
  SunMedium,
  Sparkles,
  Loader2,
  CameraOff,
  ArrowRight,
  Users,
  SwitchCamera,
} from 'lucide-react';
import { callApi } from '../services/api';
import { playPosSuccess, playPosWarning, speak } from '../utils/helpers';
import {
  ENROLLMENT_ANGLE_SEQUENCE,
  FACE_DUPLICATE_ENROLL_THRESHOLD,
  FACE_ENROLL_SELF_CONSISTENCY_MIN_COS,
  FACE_LIVENESS_MIN_SCORE,
  FACE_MODEL_VERSION_CANON,
  analyzeVideoFrameBiometrics,
  classifyEnrollmentAngle,
  computeCentroid,
  computeFlippedArcFaceCandidate,
  computeProfileScore,
  cosineSimilarity,
  evaluateEnrollmentPoseTarget,
  fuseCanonicalMirrorEmbedding,
  hydrateFaceProfile,
  initFaceBiometricEngine,
  quantizeVectorsToInt8B64,
  setCachedFaceProfiles,
  upsertCachedFaceProfile,
  type EnrollmentAngleKey,
  type EnrollmentPoseBaseline,
  type HydratedFaceProfile,
  type RawFaceProfileDto,
} from '../services/faceRecognitionV2';

export interface FaceEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    username: string;
    fullname: string;
    role?: string;
    position?: string;
    avatarUrl?: string;
  };
  existingProfiles?: RawFaceProfileDto[];
  enrolledByAdmin?: boolean;
  adminActorUsername?: string;
  onEnrolledSuccess: (newProfile: RawFaceProfileDto) => void;
  onStartScanningNow?: () => void;
  onPickAnotherStaff?: () => void;
}

type EnrollmentPhase =
  | 'BOOTING'
  | 'SCANNING'
  | 'SUBMITTING'
  | 'COMPLETED'
  | 'ALREADY_LOCKED'
  | 'ERROR';

const STABLE_FRAMES_PER_ANGLE = 2;

export default function FaceEnrollmentModal({
  isOpen,
  onClose,
  user,
  existingProfiles,
  enrolledByAdmin = false,
  adminActorUsername,
  onEnrolledSuccess,
  onStartScanningNow,
  onPickAnotherStaff,
}: FaceEnrollmentModalProps) {
  const [phase, setPhase] = useState<EnrollmentPhase>('BOOTING');
  const [bootMessage, setBootMessage] = useState('Đang khởi tạo mô hình sinh trắc học...');
  const [bootPercent, setBootPercent] = useState(12);
  const [errorMessage, setErrorMessage] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const cameraFacingRef = useRef<'user' | 'environment'>('user');
  cameraFacingRef.current = cameraFacing;

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [holdStreak, setHoldStreak] = useState(0);
  const [angleProgressPct, setAngleProgressPct] = useState(0);
  const [guidanceText, setGuidanceText] = useState('Đưa khuôn mặt chính diện vào khung tròn');
  const [telemetry, setTelemetry] = useState<{
    brightness: number;
    sharpness: number;
    yawDeg: number;
    pitchDeg: number;
    liveScore: number;
    detectedAngle: EnrollmentAngleKey | null;
  }>({
    brightness: 0,
    sharpness: 0,
    yawDeg: 0,
    pitchDeg: 0,
    liveScore: 0,
    detectedAngle: null,
  });

  const [enrolledProfileDto, setEnrolledProfileDto] = useState<RawFaceProfileDto | null>(null);

  // Latest-prop refs isolate hardware lifecycle from 1s clock ticks & GPS re-renders in parents
  const userRef = useRef(user);
  userRef.current = user;
  const existingProfilesRef = useRef(existingProfiles);
  existingProfilesRef.current = existingProfiles;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onEnrolledSuccessRef = useRef(onEnrolledSuccess);
  onEnrolledSuccessRef.current = onEnrolledSuccess;
  const enrolledByAdminRef = useRef(enrolledByAdmin);
  enrolledByAdminRef.current = enrolledByAdmin;
  const adminActorUsernameRef = useRef(adminActorUsername);
  adminActorUsernameRef.current = adminActorUsername;
  const onStartScanningNowRef = useRef(onStartScanningNow);
  onStartScanningNowRef.current = onStartScanningNow;
  const onPickAnotherStaffRef = useRef(onPickAnotherStaff);
  onPickAnotherStaffRef.current = onPickAnotherStaff;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const isAnalyzingRef = useRef(false);
  const mountedRef = useRef(false);
  const bootGenRef = useRef(0);

  const capturedVectorsRef = useRef<Float32Array[]>([]);
  const centerPoseSamplesRef = useRef<Array<{ yawDeg: number; pitchDeg: number }>>([]);
  const baselinePoseRef = useRef<EnrollmentPoseBaseline | null>(null);
  const sampleImageRef = useRef<string>('');
  const holdStreakRef = useRef(0);
  const stepIdxRef = useRef(0);
  const otherProfilesRef = useRef<HydratedFaceProfile[]>([]);

  const stopHardwareAndLoop = useCallback(() => {
    bootGenRef.current += 1;
    if (loopTimerRef.current !== null) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    isAnalyzingRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const captureSampleThumbnail = useCallback((video: HTMLVideoElement): string => {
    try {
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      const size = 480;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';

      const side = Math.min(vw, vh);
      const sx = (vw - side) * 0.5;
      const sy = (vh - side) * 0.5;

      ctx.save();
      if (cameraFacingRef.current === 'user') {
        ctx.translate(size, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
      ctx.restore();

      return canvas.toDataURL('image/jpeg', 0.82);
    } catch {
      return '';
    }
  }, []);

  const submitCapturedVectors = useCallback(async () => {
    const vectors = capturedVectorsRef.current;
    if (vectors.length < ENROLLMENT_ANGLE_SEQUENCE.length) return;

    const activeUser = userRef.current;
    stopHardwareAndLoop();
    setPhase('SUBMITTING');
    setGuidanceText('Đang kiểm tra trùng lặp & mã hóa khóa sinh trắc 512-D...');

    // 1. Client-side anti-duplicate check against all other active staff profiles
    const candidateCentroid = computeCentroid(vectors);
    for (const other of otherProfilesRef.current) {
      if (other.username.trim().toLowerCase() === activeUser.username.trim().toLowerCase()) continue;
      const dupScore = computeProfileScore(candidateCentroid, other);
      let maxPairCos = dupScore;
      for (const v of vectors) {
        const s = computeProfileScore(v, other);
        if (s > maxPairCos) maxPairCos = s;
      }
      if (maxPairCos >= FACE_DUPLICATE_ENROLL_THRESHOLD) {
        playPosWarning();
        setErrorMessage(
          `Khuôn mặt này trùng khớp với hồ sơ đã đăng ký của nhân sự "${other.fullname}" (@${other.username}). Mỗi nhân viên chỉ được đăng ký duy nhất 1 khuôn mặt chính chủ.`
        );
        setPhase('ERROR');
        return;
      }
    }

    const vectorsB64 = quantizeVectorsToInt8B64(vectors);
    const isAssistedAdmin = Boolean(enrolledByAdminRef.current);
    const actorAdminUser = adminActorUsernameRef.current || 'ADMIN';

    try {
      const res = await callApi(
        'ENROLL_FACE_PROFILE',
        {
          username: activeUser.username,
          fullname: activeUser.fullname,
          role: activeUser.role || 'user',
          targetRole: activeUser.role || 'user',
          actorRole: isAssistedAdmin ? 'admin' : activeUser.role || 'user',
          enrolledByAdmin: isAssistedAdmin || undefined,
          adminUsername: isAssistedAdmin ? actorAdminUser : undefined,
          actorUsername: isAssistedAdmin ? actorAdminUser : activeUser.username,
          position: activeUser.position || '',
          avatarUrl: activeUser.avatarUrl || '',
          vectorsB64,
          anglesCount: ENROLLMENT_ANGLE_SEQUENCE.length,
          modelVersion: FACE_MODEL_VERSION_CANON,
          sampleImage: sampleImageRef.current || undefined,
        },
        { background: true, timeoutMs: 30000, maxAttempts: 1 }
      );

      if (!mountedRef.current) return;

      if (res?.ok) {
        const savedDto: RawFaceProfileDto = {
          username: activeUser.username,
          fullname: activeUser.fullname,
          position: activeUser.position,
          avatarUrl: activeUser.avatarUrl,
          employmentStatus: 'active',
          vectorsB64,
          anglesCount: ENROLLMENT_ANGLE_SEQUENCE.length,
          modelVersion: FACE_MODEL_VERSION_CANON,
          enrolledAt: res.data?.enrolledAt || new Date().toISOString(),
          isLocked: true,
        };
        upsertCachedFaceProfile(savedDto);
        setEnrolledProfileDto(savedDto);
        setPhase('COMPLETED');
        speak('Đăng ký khuôn mặt năm góc thành công. Hồ sơ đã được khóa bảo vệ.');
        onEnrolledSuccessRef.current(savedDto);
      } else if (res?.code === 'FACE_PROFILE_LOCKED') {
        setPhase('ALREADY_LOCKED');
      } else {
        playPosWarning();
        setErrorMessage(
          res?.message ||
            'Máy chủ từ chối lưu hồ sơ khuôn mặt. Vui lòng kiểm tra kết nối mạng hoặc liên hệ Quản lý.'
        );
        setPhase('ERROR');
      }
    } catch {
      if (!mountedRef.current) return;
      playPosWarning();
      setErrorMessage('Mất kết nối máy chủ khi lưu hồ sơ khuôn mặt. Vui lòng thử lại.');
      setPhase('ERROR');
    }
  }, [stopHardwareAndLoop]);

  const startScanningLoop = useCallback(
    (activeGen: number) => {
      if (loopTimerRef.current !== null) {
        window.clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }

      const tick = async () => {
        if (!mountedRef.current || bootGenRef.current !== activeGen) return;
        const video = videoRef.current;
        if (!video || video.ended) {
          loopTimerRef.current = window.setTimeout(tick, 130);
          return;
        }
        if (video.paused && streamRef.current) {
          video.play().catch(() => {});
        }
        if (video.readyState < 2 || video.videoWidth < 64) {
          loopTimerRef.current = window.setTimeout(tick, 120);
          return;
        }

        if (isAnalyzingRef.current) {
          loopTimerRef.current = window.setTimeout(tick, 95);
          return;
        }

        isAnalyzingRef.current = true;
        try {
          const targetIdx = stepIdxRef.current;
          const targetStep = ENROLLMENT_ANGLE_SEQUENCE[targetIdx];
          if (!targetStep) return;

          const frame = await analyzeVideoFrameBiometrics(video, {
            poseMode: targetIdx === 0 ? 'FRONTAL' : 'ENROLL_ANGLED',
            minWidthRatio: 0.10,
          });
          if (!mountedRef.current || bootGenRef.current !== activeGen) return;

          const baseline = baselinePoseRef.current;
          const classifiedAngle = frame.quality
            ? classifyEnrollmentAngle(frame.quality.yawDeg, frame.quality.pitchDeg, baseline)
            : null;
          const poseEval = frame.quality
            ? evaluateEnrollmentPoseTarget(
                targetStep.key,
                frame.quality.yawDeg,
                frame.quality.pitchDeg,
                baseline
              )
            : null;

          const displayYaw = frame.quality
            ? Math.round(baseline && targetIdx > 0 ? frame.quality.yawDeg - baseline.yawDeg : frame.quality.yawDeg)
            : 0;
          const displayPitch = frame.quality
            ? Math.round(
                baseline && targetIdx > 0 ? frame.quality.pitchDeg - baseline.pitchDeg : frame.quality.pitchDeg
              )
            : 0;

          setTelemetry({
            brightness: frame.quality ? Math.round(frame.quality.brightness) : 0,
            sharpness: frame.quality ? Math.round(frame.quality.sharpness * 10) / 10 : 0,
            yawDeg: displayYaw,
            pitchDeg: displayPitch,
            liveScore: frame.liveness ? Math.round(frame.liveness.liveScore * 100) : 100,
            detectedAngle: classifiedAngle,
          });

          if (!frame.hasFace) {
            holdStreakRef.current = 0;
            setHoldStreak(0);
            setAngleProgressPct(0);
            setGuidanceText(`Bước ${targetIdx + 1}/5 (${targetStep.label}): ${targetStep.shortHint}`);
          } else if (frame.multipleFaces) {
            holdStreakRef.current = 0;
            setHoldStreak(0);
            setAngleProgressPct(0);
            setGuidanceText('Phát hiện nhiều khuôn mặt — vui lòng chỉ để 1 người trong khung quét');
          } else if (!frame.embedding || !frame.quality || !poseEval) {
            holdStreakRef.current = 0;
            setHoldStreak(0);
            if (poseEval) setAngleProgressPct(Math.round(poseEval.progress * 100));
            setGuidanceText(frame.guidanceMessage);
          } else if (!poseEval.matched) {
            const nextStreak = poseEval.progress >= 0.82 ? Math.max(0, holdStreakRef.current - 1) : 0;
            holdStreakRef.current = nextStreak;
            setHoldStreak(nextStreak);
            setAngleProgressPct(Math.round(poseEval.progress * 100));
            setGuidanceText(poseEval.hint);
          } else {
            // Verify internal identity consistency against CENTER pose so another person cannot step in
            const centerRaw = capturedVectorsRef.current[0];
            const centerFlip = capturedVectorsRef.current[1];
            if (targetIdx > 0 && centerRaw) {
              const selfSim = Math.max(
                cosineSimilarity(frame.embedding, centerRaw),
                centerFlip ? cosineSimilarity(frame.embedding, centerFlip) : -1
              );
              if (selfSim < FACE_ENROLL_SELF_CONSISTENCY_MIN_COS) {
                holdStreakRef.current = 0;
                setHoldStreak(0);
                setAngleProgressPct(0);
                setGuidanceText('Khuôn mặt không khớp với góc nhìn thẳng ban đầu — vui lòng giữ đúng 1 người');
                return;
              }
            }

            if (targetStep.key === 'CENTER') {
              centerPoseSamplesRef.current.push({
                yawDeg: frame.quality.yawDeg,
                pitchDeg: frame.quality.pitchDeg,
              });
            }

            const nextStreak = holdStreakRef.current + 1;
            holdStreakRef.current = nextStreak;
            setHoldStreak(nextStreak);
            setAngleProgressPct(100);

            if (nextStreak < STABLE_FRAMES_PER_ANGLE) {
              setGuidanceText(
                `Đúng góc "${targetStep.label}"! Giữ yên trong tích tắc... (${nextStreak}/${STABLE_FRAMES_PER_ANGLE})`
              );
            } else {
              // Fuse raw + horizontally flipped 112x112 embeddings into ONE canonical mirror-invariant vector per angle
              // (5 angles = 2560 bytes, sharp undistorted centroid, 100% invariant across Front/Rear iOS & Android cameras)
              let canonicalAngleEmb = frame.embedding;
              if (frame.chwRgb) {
                try {
                  const mirrorCand = await computeFlippedArcFaceCandidate(frame.chwRgb);
                  canonicalAngleEmb = fuseCanonicalMirrorEmbedding(
                    frame.embedding,
                    mirrorCand.embedding
                  );
                } catch {
                  // Keep primary embedding if mirror pass unavailable
                }
              }
              capturedVectorsRef.current.push(canonicalAngleEmb);
              if (targetStep.key === 'CENTER') {
                if (!sampleImageRef.current) {
                  sampleImageRef.current = captureSampleThumbnail(video);
                }
                const samples = centerPoseSamplesRef.current;
                if (samples.length > 0) {
                  const sumY = samples.reduce((acc, s) => acc + s.yawDeg, 0);
                  const sumP = samples.reduce((acc, s) => acc + s.pitchDeg, 0);
                  baselinePoseRef.current = {
                    yawDeg: sumY / samples.length,
                    pitchDeg: sumP / samples.length,
                  };
                } else {
                  baselinePoseRef.current = {
                    yawDeg: frame.quality.yawDeg,
                    pitchDeg: frame.quality.pitchDeg,
                  };
                }
              }

              playPosSuccess();
              holdStreakRef.current = 0;
              setHoldStreak(0);
              setAngleProgressPct(0);

              const nextIdx = targetIdx + 1;
              if (nextIdx >= ENROLLMENT_ANGLE_SEQUENCE.length) {
                setCurrentStepIdx(ENROLLMENT_ANGLE_SEQUENCE.length);
                isAnalyzingRef.current = false;
                await submitCapturedVectors();
                return;
              }

              stepIdxRef.current = nextIdx;
              setCurrentStepIdx(nextIdx);
              const nextMeta = ENROLLMENT_ANGLE_SEQUENCE[nextIdx];
              setGuidanceText(`Đã ghi góc ${targetIdx + 1}/5! Tiếp theo: ${nextMeta.label} — ${nextMeta.shortHint}`);
            }
          }
        } catch {
          // Ignore transient video frame read glitches
        } finally {
          isAnalyzingRef.current = false;
        }

        if (mountedRef.current && bootGenRef.current === activeGen) {
          loopTimerRef.current = window.setTimeout(tick, 95);
        }
      };

      loopTimerRef.current = window.setTimeout(tick, 80);
    },
    [captureSampleThumbnail, submitCapturedVectors]
  );

  const resetCaptureProgressOnly = useCallback(() => {
    capturedVectorsRef.current = [];
    centerPoseSamplesRef.current = [];
    baselinePoseRef.current = null;
    sampleImageRef.current = '';
    holdStreakRef.current = 0;
    stepIdxRef.current = 0;
    setCurrentStepIdx(0);
    setHoldStreak(0);
    setAngleProgressPct(0);
    setGuidanceText(
      `Bước 1/5: ${ENROLLMENT_ANGLE_SEQUENCE[0].label} — ${ENROLLMENT_ANGLE_SEQUENCE[0].shortHint}`
    );
  }, []);

  const bootEnrollmentSession = useCallback(async () => {
    stopHardwareAndLoop();
    const myGen = bootGenRef.current;

    capturedVectorsRef.current = [];
    centerPoseSamplesRef.current = [];
    baselinePoseRef.current = null;
    sampleImageRef.current = '';
    holdStreakRef.current = 0;
    stepIdxRef.current = 0;
    setCurrentStepIdx(0);
    setHoldStreak(0);
    setAngleProgressPct(0);
    setErrorMessage('');
    setCameraError('');
    setPhase('BOOTING');
    setBootMessage('Đang kiểm tra trạng thái hồ sơ khuôn mặt...');
    setBootPercent(10);

    const activeUser = userRef.current;

    try {
      // 1. Load latest face profiles to verify lock status & anti-duplicate pool
      let rawList: RawFaceProfileDto[] = Array.isArray(existingProfilesRef.current)
        ? existingProfilesRef.current
        : [];
      const profRes = await callApi(
        'GET_FACE_PROFILES',
        {
          username: activeUser.username,
          role: enrolledByAdminRef.current ? 'admin' : activeUser.role || 'user',
          actorRole: enrolledByAdminRef.current ? 'admin' : activeUser.role || 'user',
          preloadOnly: true,
          fastEdge: true,
        },
        { background: true, cacheTtlMs: 0, timeoutMs: 8000 }
      );
      if (profRes?.ok && Array.isArray(profRes.data?.profiles)) {
        rawList = profRes.data.profiles;
        setCachedFaceProfiles(rawList);
      }

      if (!mountedRef.current || bootGenRef.current !== myGen) return;

      const isAdminBypass =
        Boolean(enrolledByAdminRef.current) ||
        String(activeUser.role || '').trim().toLowerCase() === 'admin';
      const selfExisting = rawList.find(
        (p) =>
          p.username?.trim().toLowerCase() === activeUser.username.trim().toLowerCase() &&
          p.vectorsB64 &&
          p.isLocked !== false
      );
      if (selfExisting && !isAdminBypass) {
        setEnrolledProfileDto(selfExisting);
        setPhase('ALREADY_LOCKED');
        return;
      }

      otherProfilesRef.current = rawList
        .filter(
          (p) => p.vectorsB64 && p.username?.trim().toLowerCase() !== activeUser.username.trim().toLowerCase()
        )
        .map((p) => hydrateFaceProfile(p));

      // 2. Initialize ONNX WASM SIMD + MediaPipe 3D Landmarker
      await initFaceBiometricEngine((msg, pct) => {
        if (!mountedRef.current || bootGenRef.current !== myGen) return;
        setBootMessage(msg);
        setBootPercent(pct);
      });

      if (!mountedRef.current || bootGenRef.current !== myGen) return;

      // 3. Open Camera (Front or Rear — with short retry if previous camera track is still releasing on mobile)
      const activeFacing = cameraFacingRef.current;
      setBootMessage(
        activeFacing === 'environment'
          ? 'Đang mở camera sau độ nét cao...'
          : 'Đang mở camera trước độ nét cao...'
      );
      setBootPercent(92);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Trình duyệt hiện tại không hỗ trợ truy cập Camera WebRTC. Vui lòng mở bằng Safari hoặc Chrome.'
        );
        setPhase('ERROR');
        return;
      }

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
              { video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
              { video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 540 } }, audio: false },
              { video: true, audio: false },
            ];

      let acquiredStream: MediaStream | null = null;
      for (let attempt = 0; attempt < 2 && !acquiredStream; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => window.setTimeout(r, 220));
          if (!mountedRef.current || bootGenRef.current !== myGen) return;
        }
        for (const c of constraintsList) {
          try {
            acquiredStream = await navigator.mediaDevices.getUserMedia(c);
            break;
          } catch (err: any) {
            if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
              setCameraError(
                'Quyền truy cập Camera đang bị chặn. Vui lòng cấp quyền Camera trên trình duyệt rồi thử lại.'
              );
              setPhase('ERROR');
              return;
            }
          }
        }
      }

      if (!acquiredStream || !mountedRef.current || bootGenRef.current !== myGen) {
        if (acquiredStream) acquiredStream.getTracks().forEach((t) => t.stop());
        if (mountedRef.current && bootGenRef.current === myGen) {
          setCameraError('Không tìm thấy thiết bị camera khả dụng.');
          setPhase('ERROR');
        }
        return;
      }

      streamRef.current = acquiredStream;

      // Attach stream immediately to the persistently mounted <video> and wait until frames flow
      const video = videoRef.current;
      if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.srcObject = acquiredStream;

        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            video.removeEventListener('loadeddata', finish);
            video.removeEventListener('canplay', finish);
            resolve();
          };
          if (video.readyState >= 2 && video.videoWidth > 0) {
            finish();
            return;
          }
          video.addEventListener('loadeddata', finish, { once: true });
          video.addEventListener('canplay', finish, { once: true });
          video.play().catch(() => {});
          window.setTimeout(finish, 1800);
        });
        await video.play().catch(() => {});
      }

      if (!mountedRef.current || bootGenRef.current !== myGen) return;

      setBootPercent(100);
      setPhase('SCANNING');
      setGuidanceText(
        `Bước 1/5: ${ENROLLMENT_ANGLE_SEQUENCE[0].label} — ${ENROLLMENT_ANGLE_SEQUENCE[0].shortHint}`
      );
      startScanningLoop(myGen);
    } catch (err: any) {
      if (!mountedRef.current || bootGenRef.current !== myGen) return;
      setErrorMessage(err?.message || 'Không thể khởi tạo bộ nhận diện khuôn mặt.');
      setPhase('ERROR');
    }
  }, [startScanningLoop, stopHardwareAndLoop]);

  const bootSessionRef = useRef(bootEnrollmentSession);
  bootSessionRef.current = bootEnrollmentSession;

  const handleToggleCameraFacing = useCallback(() => {
    const nextFacing: 'user' | 'environment' =
      cameraFacingRef.current === 'user' ? 'environment' : 'user';
    cameraFacingRef.current = nextFacing;
    setCameraFacing(nextFacing);
    resetCaptureProgressOnly();
    void bootSessionRef.current();
  }, [resetCaptureProgressOnly]);

  // Strictly depend ONLY on [isOpen, user.username, stopHardwareAndLoop] so 1s clock ticks or GPS updates NEVER reboot hardware!
  useEffect(() => {
    mountedRef.current = isOpen;
    if (isOpen) {
      void bootSessionRef.current();
    } else {
      stopHardwareAndLoop();
    }
    return () => {
      mountedRef.current = false;
      stopHardwareAndLoop();
    };
  }, [isOpen, user.username, stopHardwareAndLoop]);

  // Resume camera stream cleanly after mobile screen wake or notification shade without losing captured angles
  useEffect(() => {
    if (!isOpen) return;
    const handleVisibilityResume = () => {
      if (document.visibilityState === 'visible' && videoRef.current && streamRef.current) {
        videoRef.current.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityResume);
    window.addEventListener('pageshow', handleVisibilityResume);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityResume);
      window.removeEventListener('pageshow', handleVisibilityResume);
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const activeAngle = ENROLLMENT_ANGLE_SEQUENCE[Math.min(currentStepIdx, ENROLLMENT_ANGLE_SEQUENCE.length - 1)];
  const minLivePct = Math.round(FACE_LIVENESS_MIN_SCORE * 100);
  const pillLabelMap: Record<EnrollmentAngleKey, { short: string; full: string }> = {
    CENTER: { short: 'Thẳng', full: 'Nhìn thẳng' },
    LEFT: { short: 'Trái', full: 'Quay trái' },
    RIGHT: { short: 'Phải', full: 'Quay phải' },
    UP: { short: 'Ngẩng', full: 'Ngẩng lên' },
    DOWN: { short: 'Cúi', full: 'Cúi xuống' },
  };
  const isLightingLow = telemetry.brightness > 0 && telemetry.brightness < 45;
  const isFrameReady = telemetry.brightness >= 45 && telemetry.liveScore >= minLivePct;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      data-testid="face-enrollment-modal"
      aria-label="Đăng ký khuôn mặt 5 góc King's Grill"
      className="fixed inset-0 m-0 z-[10080] h-[100dvh] w-screen bg-[#0D1015] text-[#F7F4EE] flex flex-col overflow-y-auto select-none font-sans"
    >
      {/* Top Architectural Solid Header */}
      <header className="w-full max-w-2xl mx-auto px-3.5 py-2 flex items-center justify-between gap-2.5 border-b border-[#242B38] bg-[#0D1015] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#0B253C] border border-[#242B38] flex items-center justify-center text-[#34D399] shrink-0">
            <ScanFace size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#9FA8B8]">
                {enrolledByAdmin ? 'ĐĂNG KÝ CHO NHÂN VIÊN' : 'ĐĂNG KÝ FACE ID 5 GÓC'}
              </span>
            </div>
            <h2 className="text-xs sm:text-sm font-extrabold text-[#F7F4EE] truncate">
              {user.fullname} <span className="text-[11px] font-mono text-[#9FA8B8]">(@{user.username})</span>
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="toggle-camera-facing-btn"
            onClick={handleToggleCameraFacing}
            disabled={phase === 'SUBMITTING'}
            title="Chuyển đổi Camera Trước / Camera Sau"
            aria-label="Đổi camera trước hoặc sau"
            className="min-h-[44px] px-2.5 sm:px-3 rounded-xl bg-[#161A22] hover:bg-[#1F2530] border border-[#2B3240] text-xs font-extrabold text-[#F7F4EE] inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors motion-reduce:transition-none"
          >
            <SwitchCamera size={15} className="text-[#34D399] shrink-0" />
            <span>{cameraFacing === 'user' ? 'Cam sau' : 'Cam trước'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              stopHardwareAndLoop();
              onCloseRef.current();
            }}
            aria-label="Đóng cửa sổ đăng ký khuôn mặt"
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl bg-[#C8432B] hover:bg-[#B83821] text-white inline-flex items-center justify-center transition-colors motion-reduce:transition-none shrink-0"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 w-full max-w-lg mx-auto px-3.5 py-2.5 sm:py-4 flex flex-col justify-between gap-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Persistent Biometric Viewfinder Wrapper: keeps <video ref={videoRef}> mounted across BOOTING -> SCANNING */}
        <div
          className={
            phase === 'SCANNING'
              ? 'contents'
              : 'fixed -left-[9999px] top-0 w-px h-px overflow-hidden opacity-0 pointer-events-none'
          }
          aria-hidden={phase !== 'SCANNING'}
        >
          {/* 5-Angle Step Pills */}
          <div className="grid grid-cols-5 gap-1.5" data-testid="enroll-angle-pills">
            {ENROLLMENT_ANGLE_SEQUENCE.map((step, idx) => {
              const isDone = idx < currentStepIdx;
              const isActive = idx === currentStepIdx;
              return (
                <div
                  key={step.key}
                  className={`rounded-xl px-1 py-1.5 border text-center transition-colors duration-150 motion-reduce:transition-none ${
                    isDone
                      ? 'bg-[#15803D] border-[#34D399] text-white'
                      : isActive
                      ? 'bg-[#C8432B] border-[#F7F4EE] text-white'
                      : 'bg-[#161A22] border-[#2B3240] text-[#9FA8B8]'
                  }`}
                >
                  <div className="text-[10px] font-mono tabular-nums font-extrabold">
                    {isDone ? '✓' : `${idx + 1}/5`}
                  </div>
                  <div className="text-[10px] font-bold truncate">
                    <span className="sm:hidden">{pillLabelMap[step.key].short}</span>
                    <span className="hidden sm:inline">{pillLabelMap[step.key].full}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Circular Biometric Camera Viewfinder */}
          <div className="relative mx-auto w-[224px] h-[224px] sm:w-[276px] sm:h-[276px] flex items-center justify-center my-auto">
            {/* 5-Segment SVG Ring */}
            <svg
              viewBox="0 0 120 120"
              className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none z-20"
              aria-hidden="true"
            >
              {ENROLLMENT_ANGLE_SEQUENCE.map((step, idx) => {
                const radius = 56;
                const circumference = 2 * Math.PI * radius;
                const segLen = circumference / 5 - 5;
                const dashOffset = -(idx * (circumference / 5));
                const isDone = idx < currentStepIdx;
                const isActive = idx === currentStepIdx;
                const strokeColor = isDone
                  ? '#34D399'
                  : isActive
                  ? angleProgressPct >= 95
                    ? '#34D399'
                    : '#C8432B'
                  : '#2B3240';
                return (
                  <circle
                    key={step.key}
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isActive ? '5.5' : '4'}
                    strokeLinecap="round"
                    strokeDasharray={`${segLen} ${circumference - segLen}`}
                    strokeDashoffset={dashOffset}
                  />
                );
              })}
            </svg>

            <div className="w-[198px] h-[198px] sm:w-[244px] sm:h-[244px] rounded-full overflow-hidden bg-[#161A22] border-2 border-[#2B3240] relative z-10">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                data-testid="enroll-video-feed"
                className={`w-full h-full object-cover ${cameraFacing === 'user' ? 'mirror-cam' : ''}`}
              />
            </div>
          </div>
        </div>

        {phase === 'BOOTING' && (
          <div
            data-testid="enroll-booting-card"
            className="my-auto bg-[#161A22] border border-[#2B3240] rounded-2xl p-6 text-center space-y-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#0B253C] border border-[#2B3240] flex items-center justify-center mx-auto text-[#34D399]">
              <Loader2 size={24} className="animate-spin motion-reduce:animate-none" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-[#F7F4EE]">Khởi tạo Trạm Sinh Trắc Học</h3>
              <p className="text-xs text-[#9FA8B8]">{bootMessage}</p>
            </div>
            <div className="w-full bg-[#0D1015] border border-[#2B3240] rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-[#C8432B] h-full transition-all duration-150 motion-reduce:transition-none"
                style={{ width: `${Math.max(10, Math.min(100, bootPercent))}%` }}
              />
            </div>
            <p className="text-[11px] font-mono tabular-nums text-[#9FA8B8]">{bootPercent}%</p>
          </div>
        )}

        {phase === 'SCANNING' && (
          <div className="bg-[#161A22] border border-[#2B3240] rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0B253C] border border-[#2B3240] text-[11px] font-extrabold text-[#F7F4EE]">
                <Sparkles size={13} className="text-[#FBBF24]" />
                <span>
                  Góc {Math.min(currentStepIdx + 1, 5)}/5: {activeAngle.label}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono tabular-nums font-bold text-[#34D399]">
                  Giữ nét: {holdStreak}/{STABLE_FRAMES_PER_ANGLE}
                </span>
                {currentStepIdx > 0 && (
                  <button
                    type="button"
                    onClick={resetCaptureProgressOnly}
                    className="min-h-[44px] sm:min-h-[34px] px-3 py-1.5 rounded-lg bg-[#0D1015] hover:bg-[#1F2530] border border-[#2B3240] text-[11px] font-bold text-[#9FA8B8] hover:text-[#F7F4EE] inline-flex items-center gap-1 transition-colors touch-manipulation"
                    title="Quét lại từ góc 1/5"
                  >
                    <RotateCcw size={11} />
                    <span>Từ đầu</span>
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs sm:text-sm font-bold text-[#F7F4EE] leading-snug">{guidanceText}</p>

            {/* Real-Time Angle Alignment Bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#9FA8B8]">
                <span>Độ khớp góc {activeAngle.label.toLowerCase()}</span>
                <span className={angleProgressPct >= 95 ? 'text-[#34D399] font-bold' : 'text-[#F7F4EE]'}>
                  {angleProgressPct}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#0D1015] border border-[#2B3240] overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 motion-reduce:transition-none ${
                    angleProgressPct >= 95 ? 'bg-[#34D399]' : 'bg-[#C8432B]'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, angleProgressPct))}%` }}
                />
              </div>
            </div>

            {/* Single-line User-Friendly Readiness Badge */}
            <div className="pt-1 border-t border-[#2B3240]">
              <div
                className={`rounded-xl px-3 py-1.5 border text-[11px] font-bold flex items-center justify-between gap-2 ${
                  isLightingLow
                    ? 'bg-[#291F0F] border-[#FBBF24]/50 text-[#FBBF24]'
                    : isFrameReady
                    ? 'bg-[#0F291E] border-[#34D399]/50 text-[#34D399]'
                    : 'bg-[#0D1015] border-[#2B3240] text-[#9FA8B8]'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                  {isLightingLow ? (
                    <SunMedium size={13} className="shrink-0 text-[#FBBF24]" />
                  ) : (
                    <ShieldCheck size={13} className={`shrink-0 ${isFrameReady ? 'text-[#34D399]' : 'text-[#9FA8B8]'}`} />
                  )}
                  <span className="truncate">
                    {isLightingLow
                      ? 'Thiếu sáng — hướng mặt về phía nguồn sáng'
                      : isFrameReady
                      ? 'Ánh sáng & Khuôn mặt đạt chuẩn'
                      : 'Đang căn chỉnh ánh sáng & khuôn mặt 3D...'}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-[10px] shrink-0">
                  {isFrameReady ? 'Sẵn sàng' : 'Đang đo'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-[#9FA8B8] pt-0.5">
              <Lock size={11} className="text-[#FBBF24] shrink-0" />
              <span className="truncate">
                Đủ 5 góc sẽ tự khóa &amp; đồng bộ lên mọi điện thoại.
              </span>
            </div>
          </div>
        )}

        {phase === 'SUBMITTING' && (
          <div className="my-auto bg-[#161A22] border border-[#2B3240] rounded-2xl p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#15803D] text-white flex items-center justify-center mx-auto">
              <Loader2 size={26} className="animate-spin motion-reduce:animate-none" />
            </div>
            <h3 className="text-base font-extrabold text-[#F7F4EE]">Đang lưu &amp; khóa hồ sơ Face ID</h3>
            <p className="text-xs text-[#9FA8B8]">{guidanceText}</p>
          </div>
        )}

        {phase === 'COMPLETED' && (
          <div className="my-auto bg-[#161A22] border border-[#34D399] rounded-2xl p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-[#15803D] text-white flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} />
            </div>
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0D1015] border border-[#34D399] text-[11px] font-extrabold text-[#34D399]">
                <ShieldCheck size={13} /> ĐÃ KHÓA BẢO VỆ HỒ SƠ 5 GÓC
              </span>
              <h3 className="text-lg font-extrabold text-[#F7F4EE]">Đăng ký khuôn mặt hoàn tất!</h3>
              <p className="text-xs text-[#9FA8B8] leading-relaxed">
                Hồ sơ sinh trắc của <b className="text-[#F7F4EE]">{user.fullname}</b> đã đồng bộ đám mây — từ bây giờ nhân sự có thể{' '}
                <b className="text-[#34D399]">chấm công trên bất kỳ điện thoại nào</b> tại quán (tự động ghi nhận{' '}
                <b className="text-[#F7F4EE]">Vào ca / Ra ca</b> trong dưới 1 giây).
              </p>
            </div>
            {enrolledProfileDto && (
              <div className="bg-[#0D1015] border border-[#2B3240] rounded-xl p-3 text-left text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#9FA8B8]">Nhân sự:</span>
                  <span className="font-bold text-[#F7F4EE]">{user.fullname} (@{user.username})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9FA8B8]">Số góc chuẩn:</span>
                  <span className="font-mono tabular-nums font-bold text-[#34D399]">5/5 góc (ArcFace 512-D)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9FA8B8]">Phạm vi sử dụng:</span>
                  <span className="font-bold text-[#34D399]">Mọi điện thoại tại quán</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              {enrolledByAdmin && onPickAnotherStaff && (
                <button
                  type="button"
                  onClick={() => {
                    stopHardwareAndLoop();
                    onPickAnotherStaffRef.current?.();
                  }}
                  className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-[#C8432B] hover:bg-[#B83821] text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors motion-reduce:transition-none"
                >
                  <Users size={16} />
                  <span>Đăng ký tiếp cho nhân viên khác</span>
                </button>
              )}
              <button
                type="button"
                data-testid="enroll-start-scanning-btn"
                onClick={() => {
                  stopHardwareAndLoop();
                  if (onStartScanningNowRef.current) {
                    onStartScanningNowRef.current();
                  } else {
                    onCloseRef.current();
                  }
                }}
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors motion-reduce:transition-none"
              >
                <span>Bắt đầu quét chấm công ngay</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {phase === 'ALREADY_LOCKED' && (
          <div className="my-auto bg-[#161A22] border border-[#2B3240] rounded-2xl p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#0B253C] border border-[#2B3240] text-[#FBBF24] flex items-center justify-center mx-auto">
              <Lock size={26} />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-extrabold text-[#F7F4EE]">Hồ sơ Face ID đang được khóa bảo vệ</h3>
              <p className="text-xs text-[#9FA8B8] leading-relaxed">
                Tài khoản <b className="text-[#F7F4EE]">@{user.username}</b> đã đăng ký khuôn mặt trước đó. Để chống người khác tự ý ghi đè khuôn mặt, chỉ Quản lý (Admin) mới có quyền mở khóa / đặt lại trong mục{' '}
                <b className="text-[#F7F4EE]">Hồ Sơ Nhân Sự</b>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-[#C8432B] hover:bg-[#B83821] text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              <span>Đã hiểu • Quay lại màn hình quét</span>
            </button>
          </div>
        )}

        {phase === 'ERROR' && (
          <div className="my-auto bg-[#161A22] border border-[#DC2626] rounded-2xl p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#DC2626]/20 border border-[#DC2626] text-[#F87171] flex items-center justify-center mx-auto">
              {cameraError ? <CameraOff size={26} /> : <AlertTriangle size={26} />}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-extrabold text-[#F7F4EE]">
                {cameraError ? 'Không thể truy cập Camera' : 'Chưa thể hoàn tất đăng ký'}
              </h3>
              <p className="text-xs text-[#9FA8B8] leading-relaxed">{cameraError || errorMessage}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onCloseRef.current()}
                className="min-h-[46px] py-2.5 px-3 rounded-xl bg-[#0D1015] border border-[#2B3240] text-[#F7F4EE] font-bold text-xs"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => void bootEnrollmentSession()}
                className="min-h-[46px] py-2.5 px-3 rounded-xl bg-[#C8432B] hover:bg-[#B83821] text-white font-extrabold text-xs inline-flex items-center justify-center gap-1.5"
              >
                <RotateCcw size={14} />
                <span>Quét lại 5 góc</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
