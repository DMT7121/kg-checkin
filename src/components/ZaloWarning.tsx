import { useRef, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useDialogA11y, useModalQueue } from '../utils/modalQueue';

/** Warns users opening in Zalo/Facebook in-app browsers and provides 1-tap escape actions */
export default function ZaloWarning() {
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const isActive = useModalQueue('zalo', true);

  useDialogA11y({
    isOpen: isActive,
    containerRef: dialogRef,
    closeOnEscape: false,
  });

  if (!isActive) return null;

  const currentUrl =
    typeof window !== 'undefined' && window.location?.href
      ? window.location.href
      : 'https://kg-checkin.pages.dev';

  const isAndroid =
    typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '');

  const androidChromeIntentUrl = (() => {
    try {
      const u = new URL(currentUrl);
      const scheme = u.protocol.replace(':', '') || 'https';
      return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=${scheme};package=com.android.chrome;end`;
    } catch {
      return 'intent://kg-checkin.pages.dev/#Intent;scheme=https;package=com.android.chrome;end';
    }
  })();

  const handleCopyUrl = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = currentUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2600);
    } catch {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2600);
    }
  };

  return (
    <div
      data-testid="zalo-inapp-warning"
      className="fixed inset-0 z-[10300] bg-[var(--kg-bg)] text-[var(--kg-text)] flex flex-col items-center justify-center p-5"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="zalo-warning-title"
        className="w-full max-w-[380px] max-h-[92dvh] overflow-y-auto rounded-2xl bg-[var(--kg-surface)] border border-[var(--kg-border)] p-6 shadow-2xl flex flex-col items-center text-center focus:outline-none"
      >
        <div className="w-14 h-14 rounded-2xl bg-[var(--kg-accent-soft)] border border-[var(--kg-accent)]/35 flex items-center justify-center mb-4">
          <ExternalLink className="text-[var(--kg-accent-ink)]" size={26} strokeWidth={2} />
        </div>

        <h2
          id="zalo-warning-title"
          className="text-xl font-extrabold mb-2 tracking-tight text-[var(--kg-text)]"
        >
          Mở Bằng Trình Duyệt Hệ Thống
        </h2>
        <p className="text-[13px] leading-relaxed text-[var(--kg-text-muted)] mb-5">
          Trình duyệt nhúng của Zalo/Messenger chặn Camera sinh trắc học và định vị GPS chính xác.
          Vui lòng mở bằng <b className="text-[var(--kg-text)]">Safari</b> hoặc <b className="text-[var(--kg-text)]">Chrome</b>:
        </p>

        <div className="w-full rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] p-3.5 mb-4 text-left space-y-2 text-[12px] text-[var(--kg-text)]">
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[11px] font-bold font-mono tabular-nums shrink-0">
              1
            </span>
            <span>
              Nhấn nút <b className="px-1.5 py-0.5 rounded bg-[var(--kg-surface)] border border-[var(--kg-border)] font-mono">•••</b> ở góc trên bên phải
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-5 rounded-full bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[11px] font-bold font-mono tabular-nums shrink-0">
              2
            </span>
            <span>
              Chọn <b className="text-[var(--kg-success)]">Mở bằng trình duyệt</b> (Safari / Chrome)
            </span>
          </div>
        </div>

        <div className="w-full flex flex-col gap-2.5">
          {isAndroid && (
            <a
              href={androidChromeIntentUrl}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[var(--kg-accent)] hover:brightness-95 text-white dark:text-[#0D1015] font-bold text-[13px] inline-flex items-center justify-center gap-2 transition-colors duration-150"
            >
              <ExternalLink size={16} strokeWidth={2.2} />
              Mở ngay bằng Chrome
            </a>
          )}

          <button
            type="button"
            data-testid="zalo-copy-link-btn"
            onClick={() => void handleCopyUrl()}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[var(--kg-surface-soft)] hover:border-[var(--kg-border-strong)] border border-[var(--kg-border)] text-[var(--kg-text)] font-bold text-[13px] inline-flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer"
          >
            {copied ? (
              <>
                <Check size={16} className="text-[var(--kg-success)]" strokeWidth={2.4} />
                <span className="text-[var(--kg-success)]">Đã sao chép! Dán vào Safari / Chrome</span>
              </>
            ) : (
              <>
                <Copy size={16} strokeWidth={2} />
                <span>Sao chép đường dẫn chấm công</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
