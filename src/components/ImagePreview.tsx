import { useState, useEffect } from 'react';
import { X, ExternalLink, Download, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

/**
 * Extracts Google Drive file ID from standard drive URLs
 */
export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Converts a Google Drive URL to high-speed direct image endpoints
 */
export function getDirectDriveImageUrl(url: string): { direct: string; thumbnail: string; raw: string } {
  const fileId = extractDriveFileId(url);
  if (!fileId) {
    return { direct: url, thumbnail: url, raw: url };
  }
  return {
    direct: `https://lh3.googleusercontent.com/d/${fileId}`,
    thumbnail: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
    raw: `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`
  };
}

/** Image preview modal - Ultra-fast instant preview with direct image loading & zoom */
export default function ImagePreview() {
  const { isPreviewOpen, previewImageUrl, setPreviewOpen, setPreviewImageUrl } = useAppStore();
  const [zoom, setZoom] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [useFallback, setUseFallback] = useState(false);
  const [errorCount, setErrorCount] = useState(0);

  const isBase64 = previewImageUrl.startsWith('data:image');
  const fileId = !isBase64 ? extractDriveFileId(previewImageUrl) : null;
  const driveInfo = fileId ? getDirectDriveImageUrl(previewImageUrl) : null;

  // Reset state when preview closes or opens
  useEffect(() => {
    if (isPreviewOpen) {
      setZoom(1);
      setIsLoading(!isBase64);
      setUseFallback(false);
      setErrorCount(0);
    }
  }, [isPreviewOpen, previewImageUrl, isBase64]);

  if (!isPreviewOpen) return null;

  const close = () => {
    setPreviewOpen(false);
    setTimeout(() => {
      setPreviewImageUrl('');
      setZoom(1);
      setIsLoading(false);
    }, 250);
  };

  const toggleZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((prev) => (prev >= 1.8 ? 1 : prev + 0.4));
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = previewImageUrl;
    link.download = `KG_CheckIn_${Date.now()}.${isBase64 && previewImageUrl.includes('webp') ? 'webp' : 'jpg'}`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenExternal = (e: React.MouseEvent) => {
    e.stopPropagation();
    const openUrl = driveInfo?.raw || (fileId ? `https://drive.google.com/file/d/${fileId}/view` : previewImageUrl);
    window.open(openUrl, '_blank', 'noopener,noreferrer');
  };

  const handleImageError = () => {
    if (errorCount === 0 && driveInfo) {
      // Try thumbnail endpoint
      setErrorCount(1);
    } else {
      // Fallback to iframe
      setUseFallback(true);
      setIsLoading(false);
    }
  };

  // Determine current image src
  let currentSrc = previewImageUrl;
  if (!isBase64 && driveInfo) {
    if (errorCount === 0) {
      currentSrc = driveInfo.direct;
    } else {
      currentSrc = driveInfo.thumbnail;
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/92 backdrop-blur-md animate-fade-in touch-manipulation"
      onClick={close}
    >
      {/* Top action bar */}
      <div
        className="absolute top-4 sm:top-6 left-4 right-4 sm:left-6 sm:right-6 flex items-center justify-between z-50 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-white text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Ảnh Chấm Công HD</span>
        </div>

        <div className="flex items-center gap-2">
          {!useFallback && (
            <>
              <button
                type="button"
                onClick={toggleZoom}
                className="w-10 h-10 bg-white/15 hover:bg-white/25 active:scale-95 rounded-full flex items-center justify-center text-white transition text-sm shadow-md"
                title={zoom > 1 ? 'Thu nhỏ' : 'Phóng to'}
              >
                {zoom > 1 ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
              </button>

              <button
                type="button"
                onClick={handleDownload}
                className="w-10 h-10 bg-white/15 hover:bg-white/25 active:scale-95 rounded-full flex items-center justify-center text-white transition text-sm shadow-md"
                title="Tải ảnh về máy"
              >
                <Download size={18} />
              </button>
            </>
          )}

          {(!isBase64 || fileId) && (
            <button
              type="button"
              onClick={handleOpenExternal}
              className="w-10 h-10 bg-white/15 hover:bg-white/25 active:scale-95 rounded-full flex items-center justify-center text-white transition text-sm shadow-md"
              title="Mở trên Google Drive"
            >
              <ExternalLink size={18} />
            </button>
          )}

          <button
            type="button"
            onClick={close}
            className="w-10 h-10 bg-white/20 hover:bg-rose-600 active:scale-95 rounded-full flex items-center justify-center text-white transition text-lg shadow-md ml-1"
            title="Đóng (ESC)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Image Container */}
      <div
        className="w-full max-w-4xl p-2 sm:p-6 relative flex items-center justify-center overflow-auto max-h-screen"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading Spinner */}
        {isLoading && !useFallback && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-20 pointer-events-none">
            <Loader2 className="w-10 h-10 text-sky-400 animate-spin mb-3 drop-shadow" />
            <span className="text-xs font-medium text-slate-300 tracking-wide bg-slate-900/70 px-3 py-1 rounded-full border border-white/10">
              Đang tải ảnh preview sắc nét...
            </span>
          </div>
        )}

        {/* Direct Image Element (Fast & Sharp) */}
        {!useFallback ? (
          <div
            className="relative overflow-hidden rounded-2xl max-h-[85vh] flex items-center justify-center transition-transform duration-200"
            style={{ transform: `scale(${zoom})` }}
          >
            <img
              src={currentSrc}
              onLoad={() => setIsLoading(false)}
              onError={handleImageError}
              className={`max-w-full h-auto max-h-[85vh] object-contain rounded-2xl shadow-2xl shadow-black/80 transition-opacity duration-300 ${
                isLoading ? 'opacity-0' : 'opacity-100'
              }`}
              alt="Ảnh Chấm Công"
            />
          </div>
        ) : (
          /* Iframe fallback if Google Drive direct stream is blocked */
          <div className="w-full h-[80vh] relative rounded-2xl overflow-hidden shadow-2xl">
            <iframe
              src={fileId ? `https://drive.google.com/file/d/${fileId}/preview` : previewImageUrl}
              className="w-full h-full bg-gray-950 border-0"
              allow="autoplay"
              title="Preview Google Drive"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Open a Google Drive image or base64 in the preview modal */
export function openPreview(driveUrl: string) {
  const store = useAppStore.getState();
  if (!driveUrl || driveUrl === 'Đang tải ảnh...') return;

  store.setPreviewImageUrl(driveUrl);
  store.setPreviewOpen(true);
}
