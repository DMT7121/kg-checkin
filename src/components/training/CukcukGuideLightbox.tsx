import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronDown, ChevronRight, X } from 'lucide-react';
import type { CukcukStep } from '../../pages/cukcukData';

export interface CukcukGuideLightboxProps {
  steps: CukcukStep[];
  activeIndex: number;
  onSelectIndex: (index: number | null) => void;
}

export default function CukcukGuideLightbox({
  steps,
  activeIndex,
  onSelectIndex,
}: CukcukGuideLightboxProps) {
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomPos, setZoomPos] = useState({ x: 0, y: 0 });
  const [isDraggingZoom, setIsDraggingZoom] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [touchStartDist, setTouchStartDist] = useState<number | null>(null);
  const [touchStartScale, setTouchStartScale] = useState<number>(1);
  const [lastTouchTime, setLastTouchTime] = useState<number>(0);
  const [swipeStartX, setSwipeStartX] = useState<number | null>(null);
  const [swipeStartY, setSwipeStartY] = useState<number | null>(null);
  const [showDescription, setShowDescription] = useState(false);
  const activeScrubberBtnRef = useRef<HTMLButtonElement | null>(null);

  const selectStep = useCallback(
    (nextIndex: number | null) => {
      setZoomScale(1);
      setZoomPos({ x: 0, y: 0 });
      if (nextIndex === null) {
        setShowDescription(false);
      }
      onSelectIndex(nextIndex);
    },
    [onSelectIndex],
  );

  useEffect(() => {
    activeScrubberBtnRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeIndex]);

  const resetZoom = () => {
    setZoomScale(1);
    setZoomPos({ x: 0, y: 0 });
  };

  const zoomIn = () => setZoomScale((prev) => Math.min(prev + 0.25, 4));
  const zoomOut = () => setZoomScale((prev) => Math.max(prev - 0.25, 0.75));

  const handleDoubleClick = () => {
    if (zoomScale > 1) {
      resetZoom();
    } else {
      setZoomScale(2);
      setZoomPos({ x: 0, y: 0 });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1) return;
    setIsDraggingZoom(true);
    setDragStart({ x: e.clientX - zoomPos.x, y: e.clientY - zoomPos.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingZoom || zoomScale <= 1) return;
    setZoomPos({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDraggingZoom(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomIntensity = 0.15;
    const delta = e.deltaY < 0 ? 1 : -1;
    setZoomScale((prev) => Math.max(0.75, Math.min(prev + delta * zoomIntensity, 4)));
  };

  const getTouchDistance = (e: React.TouchEvent) => {
    if (e.touches.length < 2) return 0;
    const t1 = e.touches[0];
    const t2 = e.touches[1];
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const now = e.timeStamp;
    if (e.touches.length === 1) {
      if (now - lastTouchTime < 300) {
        e.preventDefault();
        handleDoubleClick();
        setLastTouchTime(0);
        return;
      }
      setLastTouchTime(now);

      const touch = e.touches[0];
      if (zoomScale > 1) {
        setIsDraggingZoom(true);
        setDragStart({ x: touch.clientX - zoomPos.x, y: touch.clientY - zoomPos.y });
      } else {
        setSwipeStartX(touch.clientX);
        setSwipeStartY(touch.clientY);
      }
    } else if (e.touches.length === 2) {
      const dist = getTouchDistance(e);
      setTouchStartDist(dist);
      setTouchStartScale(zoomScale);
      setIsDraggingZoom(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDist !== null) {
      e.preventDefault();
      const currentDist = getTouchDistance(e);
      if (currentDist > 0) {
        const scaleRatio = currentDist / touchStartDist;
        setZoomScale(Math.max(0.75, Math.min(touchStartScale * scaleRatio, 4)));
      }
    } else if (e.touches.length === 1) {
      if (isDraggingZoom && zoomScale > 1) {
        e.preventDefault();
        const touch = e.touches[0];
        setZoomPos({
          x: touch.clientX - dragStart.x,
          y: touch.clientY - dragStart.y,
        });
      } else if (zoomScale === 1 && swipeStartX !== null && swipeStartY !== null) {
        const touch = e.touches[0];
        const diffX = touch.clientX - swipeStartX;
        const diffY = touch.clientY - swipeStartY;
        if (Math.abs(diffX) > Math.abs(diffY) && e.cancelable) {
          e.preventDefault();
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsDraggingZoom(false);
    setTouchStartDist(null);

    if (zoomScale === 1 && swipeStartX !== null && swipeStartY !== null && e.changedTouches.length > 0) {
      const touch = e.changedTouches[0];
      const diffX = touch.clientX - swipeStartX;
      const diffY = touch.clientY - swipeStartY;

      if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY)) {
        if (diffX < 0 && activeIndex < steps.length - 1) {
          selectStep(activeIndex + 1);
        } else if (diffX > 0 && activeIndex > 0) {
          selectStep(activeIndex - 1);
        }
      }
    }
    setSwipeStartX(null);
    setSwipeStartY(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selectStep(null);
      } else if (e.key === 'ArrowLeft' && activeIndex > 0) {
        selectStep(activeIndex - 1);
      } else if (e.key === 'ArrowRight' && activeIndex < steps.length - 1) {
        selectStep(activeIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, steps.length, selectStep]);

  const currentStep = steps[activeIndex];
  if (!currentStep || typeof document === 'undefined') return null;

  return createPortal(
    <div
      id="cukcuk-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`Hướng dẫn CUKCUK: ${currentStep.title}`}
      className="fixed inset-0 h-dvh w-screen z-[10055] flex flex-col justify-between bg-[#0B110E]/95 select-none overflow-hidden"
    >
      {/* Header Controls */}
      <div className="shrink-0 w-full px-3.5 py-3 sm:px-5 sm:py-4 flex items-center justify-between gap-3 bg-[#101A15] border-b border-white/10 text-white z-10">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] uppercase tracking-wider text-white/70 font-bold font-mono tabular-nums truncate">
            Hướng dẫn sử dụng CUKCUK • Bước {activeIndex + 1}/{steps.length}
          </span>
          <h3 className="text-xs sm:text-sm font-black text-white truncate">{currentStep.title}</h3>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-black font-mono tabular-nums bg-white/15 px-2.5 py-1.5 rounded-lg text-white/90">
            {Math.round(zoomScale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => selectStep(null)}
            aria-label="Đóng hướng dẫn CUKCUK"
            className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center bg-white/15 hover:bg-white/25 active:scale-95 rounded-xl transition-all text-white touch-manipulation focus-visible:ring-2 focus-visible:ring-white"
            title="Đóng (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Image Container with Pan/Zoom/Swipe — flex-1 ensures zero overlap with top/bottom controls */}
      <div
        className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing px-3 py-2 sm:p-4 select-none touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <div
          className="transition-transform duration-75 ease-out select-none flex items-center justify-center max-h-full max-w-full"
          style={{
            transform: `translate(${zoomPos.x}px, ${zoomPos.y}px) scale(${zoomScale})`,
          }}
          onDoubleClick={handleDoubleClick}
        >
          <img
            src={currentStep.image}
            alt={currentStep.title}
            className="max-h-[calc(100dvh-16.5rem)] max-w-[94vw] md:max-w-[86vw] object-contain pointer-events-none rounded shadow-2xl border border-white/10"
          />
        </div>
      </div>

      {/* Bottom Action Bar — always visible with safe-area padding */}
      <div className="shrink-0 w-full flex flex-col items-center gap-2 px-3 sm:px-6 pt-2 pb-[max(0.875rem,env(safe-area-inset-bottom))] bg-[#0D1410] border-t border-white/10 z-10">
        <div className="w-full max-w-2xl flex flex-col items-center gap-2">
        {!showDescription ? (
          <button
            type="button"
            onClick={() => setShowDescription(true)}
            className="min-h-[44px] sm:min-h-[38px] bg-[#16221C] hover:bg-[#1E2E26] text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md border border-white/15 flex items-center gap-2 transition-all active:scale-95 animate-fade-in touch-manipulation focus-visible:ring-2 focus-visible:ring-white"
          >
            <BookOpen size={14} className="text-[#F29055]" />
            Đọc hướng dẫn, mô tả
          </button>
        ) : (
          <div className="bg-[#16221C] text-white text-xs font-semibold p-3.5 sm:p-4 rounded-2xl shadow-xl border border-white/15 w-full leading-relaxed relative flex flex-col items-center animate-slide-up">
            <div className="max-h-[110px] overflow-y-auto w-full text-center mb-1">
              {currentStep.description}
            </div>
            <button
              type="button"
              onClick={() => setShowDescription(false)}
              className="min-h-[44px] sm:min-h-[36px] px-3 text-[11px] text-white/75 hover:text-white font-bold flex items-center gap-1 mt-1 hover:underline touch-manipulation"
            >
              <ChevronDown size={12} /> Thu gọn
            </button>
          </div>
        )}

        {/* Compact Step Scrubber Strip (1..N) for instant jumping between steps */}
        {steps.length > 1 && (
          <div
            role="navigation"
            aria-label="Chọn nhanh bước hướng dẫn CUKCUK"
            className="w-full flex items-center gap-1 overflow-x-auto hide-scrollbar bg-[#141F19] border border-white/10 rounded-xl p-1"
          >
            {steps.map((step, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={step.step}
                  ref={isActive ? activeScrubberBtnRef : undefined}
                  type="button"
                  onClick={() => selectStep(idx)}
                  aria-label={`Bước ${idx + 1}: ${step.title}`}
                  aria-current={isActive ? 'step' : undefined}
                  className={`min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] px-2 rounded-lg font-mono tabular-nums text-xs font-extrabold transition-colors shrink-0 touch-manipulation ${
                    isActive
                      ? 'bg-[#F29055] text-[#241C17]'
                      : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between gap-1.5 sm:gap-2 w-full bg-[#16221C] px-2 sm:px-4 py-2 rounded-2xl border border-white/15 shadow-2xl">
          <button
            type="button"
            disabled={activeIndex === 0}
            onClick={() => activeIndex > 0 && selectStep(activeIndex - 1)}
            aria-label="Bước trước"
            className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center bg-white/15 hover:bg-white/25 disabled:opacity-40 disabled:pointer-events-none active:scale-95 rounded-xl transition-all text-white flex-shrink-0 touch-manipulation focus-visible:ring-2 focus-visible:ring-white"
            title="Bước trước"
          >
            <ChevronRight size={18} className="rotate-180" />
          </button>

          <div className="flex items-center justify-center gap-1.5 sm:gap-2 min-w-0">
            <button
              type="button"
              onClick={zoomOut}
              aria-label="Thu nhỏ"
              className="min-w-[44px] min-h-[44px] sm:min-h-[36px] px-2.5 sm:px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 active:scale-95 transition-all whitespace-nowrap touch-manipulation focus-visible:ring-2 focus-visible:ring-white"
              title="Thu nhỏ"
            >
              <span className="text-sm font-black">−</span>
              <span className="hidden sm:inline">Thu nhỏ</span>
            </button>
            <button
              type="button"
              onClick={resetZoom}
              aria-label="Đặt lại zoom"
              className="min-w-[48px] min-h-[44px] sm:min-h-[36px] px-2.5 sm:px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white font-bold font-mono tabular-nums rounded-xl text-xs flex items-center justify-center active:scale-95 transition-all whitespace-nowrap touch-manipulation focus-visible:ring-2 focus-visible:ring-white"
              title="Đặt lại zoom"
            >
              <span className="sm:hidden">{Math.round(zoomScale * 100)}%</span>
              <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              type="button"
              onClick={zoomIn}
              aria-label="Phóng to"
              className="min-w-[44px] min-h-[44px] sm:min-h-[36px] px-2.5 sm:px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 active:scale-95 transition-all whitespace-nowrap touch-manipulation focus-visible:ring-2 focus-visible:ring-white"
              title="Phóng to"
            >
              <span className="text-sm font-black">+</span>
              <span className="hidden sm:inline">Phóng to</span>
            </button>
          </div>

          <button
            type="button"
            disabled={activeIndex === steps.length - 1}
            onClick={() => activeIndex < steps.length - 1 && selectStep(activeIndex + 1)}
            aria-label="Bước sau"
            className="min-w-[44px] min-h-[44px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center bg-white/15 hover:bg-white/25 disabled:opacity-40 disabled:pointer-events-none active:scale-95 rounded-xl transition-all text-white flex-shrink-0 touch-manipulation focus-visible:ring-2 focus-visible:ring-white"
            title="Bước sau"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
