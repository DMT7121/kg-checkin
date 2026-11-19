import { useCallback, useRef, useState, type RefObject } from 'react';

export type CameraFacingMode = 'user' | 'environment';

export interface UseCameraStreamOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  initialFacing?: CameraFacingMode;
  suspendedRef?: RefObject<boolean>;
  onFallbackToast?: (message: string) => void;
}

export function buildCameraConstraints(facing: CameraFacingMode): MediaStreamConstraints[] {
  if (facing === 'environment') {
    return [
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
    ];
  }
  return [
    {
      video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    },
    { video: { facingMode: { ideal: 'user' } }, audio: false },
    { video: true, audio: false },
  ];
}

export function useCameraStream({
  videoRef,
  initialFacing = 'user',
  suspendedRef,
  onFallbackToast,
}: UseCameraStreamOptions) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [cameraErrorMessage, setCameraErrorMessage] = useState('');
  const [facing, setFacing] = useState<CameraFacingMode>(initialFacing);

  const facingRef = useRef<CameraFacingMode>(initialFacing);
  facingRef.current = facing;
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef(0);
  const isStartingRef = useRef(false);
  const onFallbackToastRef = useRef(onFallbackToast);
  onFallbackToastRef.current = onFallbackToast;

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, [videoRef]);

  const startCamera = useCallback(
    async (overrideFacing?: CameraFacingMode) => {
      if (isStartingRef.current || suspendedRef?.current) return;
      isStartingRef.current = true;
      const sessionId = ++sessionRef.current;
      const activeFacing = overrideFacing || facingRef.current;
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

        const constraintsList = buildCameraConstraints(activeFacing);

        for (const constraint of constraintsList) {
          try {
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((t) => t.stop());
              streamRef.current = null;
            }
            const stream = await navigator.mediaDevices.getUserMedia(constraint);
            if (sessionRef.current !== sessionId) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            streamRef.current = stream;
            const video = videoRef.current;
            if (!video) {
              stream.getTracks().forEach((t) => t.stop());
              streamRef.current = null;
              continue;
            }

            // Critical iOS Safari / WebKit properties: must set before srcObject & play
            video.setAttribute('playsinline', 'true');
            video.setAttribute('webkit-playsinline', 'true');
            video.muted = true;
            video.playsInline = true;
            video.srcObject = stream;

            // Auto-recover if iOS Safari / WKWebView terminates MediaStreamTrack after call/lock
            const primaryTrack = stream.getVideoTracks?.()[0];
            if (primaryTrack) {
              primaryTrack.onended = () => {
                if (
                  sessionRef.current === sessionId &&
                  !suspendedRef?.current &&
                  document.visibilityState === 'visible'
                ) {
                  setCameraActive(false);
                  void startCamera();
                }
              };
            }

            await new Promise<void>((resolve, reject) => {
              let settled = false;
              const timeoutId = setTimeout(() => {
                if (!settled) {
                  settled = true;
                  reject(new Error('Camera initialization timeout'));
                }
              }, 2200);

              const tryPlay = () => {
                if (settled) return;
                video
                  .play()
                  .then(() => {
                    const pollStart = Date.now();
                    const pollInterval = setInterval(() => {
                      if (settled || sessionRef.current !== sessionId) {
                        clearInterval(pollInterval);
                        return;
                      }
                      if (video.videoWidth > 0 && !video.paused) {
                        settled = true;
                        clearInterval(pollInterval);
                        clearTimeout(timeoutId);
                        setCameraActive(true);
                        resolve();
                      } else if (Date.now() - pollStart > 1200) {
                        settled = true;
                        clearInterval(pollInterval);
                        clearTimeout(timeoutId);
                        reject(new Error('Video stream empty'));
                      }
                    }, 80);
                  })
                  .catch((playErr) => {
                    if (!settled) {
                      settled = true;
                      clearTimeout(timeoutId);
                      reject(playErr);
                    }
                  });
              };

              if (video.readyState >= 1) {
                tryPlay();
              } else {
                video.onloadedmetadata = () => tryPlay();
              }

              video.onerror = () => {
                if (!settled) {
                  settled = true;
                  clearTimeout(timeoutId);
                  reject(new Error('Video element error'));
                }
              };
            });

            isStartingRef.current = false;
            return;
          } catch (error) {
            const cameraException = error as DOMException;
            if (cameraException?.name === 'NotAllowedError' || cameraException?.name === 'SecurityError') {
              setCameraErrorMessage(
                'Quyền camera đang bị tắt. Nhấn nút chụp ảnh để dùng máy ảnh điện thoại hoặc cấp quyền lại.'
              );
              break;
            }
            if (cameraException?.name === 'NotFoundError') {
              setCameraErrorMessage(
                'Không tìm thấy camera trực tiếp. Nhấn nút chụp ảnh để mở máy ảnh điện thoại.'
              );
              break;
            }
          }
        }

        setCameraError(true);
        const fallbackMsg =
          'Nhấn nút chụp ảnh bên dưới để chụp trực tiếp bằng máy ảnh hệ thống điện thoại.';
        setCameraErrorMessage((message) => message || fallbackMsg);
        onFallbackToastRef.current?.('Đang chuyển sang chế độ chụp bằng máy ảnh điện thoại.');
      } finally {
        isStartingRef.current = false;
      }
    },
    [suspendedRef, videoRef]
  );

  const switchCamera = useCallback(() => {
    const next: CameraFacingMode = facingRef.current === 'user' ? 'environment' : 'user';
    facingRef.current = next;
    setFacing(next);
    stopCamera();
    window.setTimeout(() => {
      void startCamera(next);
    }, 150);
  }, [startCamera, stopCamera]);

  return {
    streamRef,
    isStartingRef,
    cameraActive,
    cameraError,
    setCameraError,
    cameraErrorMessage,
    setCameraErrorMessage,
    facing,
    startCamera,
    stopCamera,
    switchCamera,
  };
}
