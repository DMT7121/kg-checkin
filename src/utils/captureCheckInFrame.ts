import { renderCheckInWatermarkCanvas } from './checkinWatermark';

export interface CaptureFrameOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  cleanCanvas?: HTMLCanvasElement | null;
  targetW?: number;
  targetH?: number;
  mirror?: boolean;
}

export interface CaptureFrameResult {
  ctx: CanvasRenderingContext2D;
  cleanCanvas: HTMLCanvasElement;
  exactTime: string;
}

/**
 * Crops a live <video> element into a crisp 720x1280 (9:16) portrait canvas,
 * preserving an unwatermarked clean copy for instant re-stamping when the punch type changes.
 */
export function captureCheckInFrame({
  video,
  canvas,
  cleanCanvas,
  targetW = 720,
  targetH = 1280,
  mirror = true,
}: CaptureFrameOptions): CaptureFrameResult | null {
  if (
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    !video.videoWidth ||
    !video.videoHeight
  ) {
    return null;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  canvas.width = targetW;
  canvas.height = targetH;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const canvasRatio = targetW / targetH;
  const videoRatio = vw / vh;

  let sx = 0;
  let sy = 0;
  let sWidth = vw;
  let sHeight = vh;

  if (videoRatio > canvasRatio) {
    sHeight = vh;
    sWidth = vh * canvasRatio;
    sx = (vw - sWidth) / 2;
  } else {
    sWidth = vw;
    sHeight = vw / canvasRatio;
    sy = (vh - sHeight) / 2;
  }

  // Do NOT apply CSS ctx.filter on iOS WebKit <video> drawImage to avoid black hardware buffers
  ctx.save();
  ctx.filter = 'none';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (mirror) {
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);
  ctx.restore();

  const outClean = cleanCanvas || document.createElement('canvas');
  outClean.width = targetW;
  outClean.height = targetH;
  const cleanCtx = outClean.getContext('2d');
  if (cleanCtx) {
    cleanCtx.drawImage(canvas, 0, 0);
  }

  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  return {
    ctx,
    cleanCanvas: outClean,
    exactTime: `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`,
  };
}

export interface CaptureWatermarkedFrameOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  exactTime: string;
  addr: string;
  typeToStamp: string;
  stampLat: number;
  stampLng: number;
  stampDist: number;
  stampMsg: string;
  targetRadius: number;
  user: { username?: string; fullname?: string; position?: string } | null | undefined;
  logoImg: HTMLImageElement | null;
  targetW?: number;
  targetH?: number;
  mirror?: boolean;
}

/**
 * One-shot 720x1280 9:16 portrait capture + watermark encoding helper (used by FastFaceScannerV2).
 */
export function captureWatermarkedCheckInFrame(opts: CaptureWatermarkedFrameOptions): string {
  const captured = captureCheckInFrame({
    video: opts.video,
    canvas: opts.canvas,
    targetW: opts.targetW ?? 720,
    targetH: opts.targetH ?? 1280,
    mirror: opts.mirror ?? true,
  });
  if (!captured) return '';

  return renderCheckInWatermarkCanvas({
    canvas: opts.canvas,
    ctx: captured.ctx,
    exactTime: opts.exactTime,
    addr: opts.addr,
    typeToStamp: opts.typeToStamp,
    stampLat: opts.stampLat,
    stampLng: opts.stampLng,
    stampDist: opts.stampDist,
    stampMsg: opts.stampMsg,
    targetRadius: opts.targetRadius,
    user: opts.user ?? null,
    logoImg: opts.logoImg,
  });
}
