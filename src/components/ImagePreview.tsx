import { X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

/** Image preview modal - supports base64 images and Google Drive previews */
export default function ImagePreview() {
  const { isPreviewOpen, previewImageUrl, setPreviewOpen, setPreviewImageUrl } = useAppStore();
  if (!isPreviewOpen) return null;

  const close = () => {
    setPreviewOpen(false);
    setTimeout(() => setPreviewImageUrl(''), 300);
  };

  const isBase64 = previewImageUrl.startsWith('data:image');

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in"
      onClick={close}
    >
      <button
        onClick={close}
        className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition text-2xl z-50"
      >
        <X size={24} />
      </button>
      <div
        className="w-full max-w-2xl p-4 relative flex justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isBase64 ? (
          <img
            src={previewImageUrl}
            className="max-w-full h-auto max-h-[85vh] object-contain rounded-2xl shadow-2xl shadow-black/50"
            alt="Preview Chấm Công"
          />
        ) : previewImageUrl !== '' ? (
          <iframe
            src={previewImageUrl}
            className="w-full h-[80vh] rounded-2xl shadow-2xl shadow-black/50 bg-gray-900 border-0"
            allow="autoplay"
            title="Preview"
          />
        ) : null}
      </div>
    </div>
  );
}

/** Open a Google Drive image or base64 in the preview modal */
export function openPreview(driveUrl: string) {
  const store = useAppStore.getState();
  if (!driveUrl) return;

  if (driveUrl.startsWith('data:image')) {
    store.setPreviewImageUrl(driveUrl);
  } else {
    const match =
      driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
      driveUrl.match(/id=([a-zA-Z0-9_-]+)/);
    if (match?.[1]) {
      store.setPreviewImageUrl(`https://drive.google.com/file/d/${match[1]}/preview`);
    } else {
      store.setPreviewImageUrl(driveUrl);
    }
  }
  store.setPreviewOpen(true);
}
