import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type React from 'react';

export type StartupModalId =
  | 'zalo'
  | 'mandatory_schedule'
  | 'version_release'
  | 'newbie_guide';

export const MODAL_PRIORITY: Record<StartupModalId, number> = {
  zalo: 4,
  mandatory_schedule: 3,
  version_release: 2,
  newbie_guide: 1,
};

export const MODAL_Z_INDEX: Record<StartupModalId, number> = {
  zalo: 10300,
  mandatory_schedule: 10080,
  version_release: 10070,
  newbie_guide: 10060,
};

let nextInstanceId = 1;
const activeRegistrations = new Map<number, StartupModalId>();
const listeners = new Set<() => void>();
let cachedTopModal: StartupModalId | null = null;

function computeTopModal(): StartupModalId | null {
  let best: StartupModalId | null = null;
  let bestPriority = -1;
  for (const modalId of activeRegistrations.values()) {
    const prio = MODAL_PRIORITY[modalId];
    if (prio > bestPriority) {
      bestPriority = prio;
      best = modalId;
    }
  }
  return best;
}

function notifyListeners() {
  cachedTopModal = computeTopModal();
  for (const listener of listeners) {
    listener();
  }
}

export function registerModalInstance(instanceId: number, modalId: StartupModalId) {
  if (activeRegistrations.get(instanceId) === modalId) return;
  activeRegistrations.set(instanceId, modalId);
  notifyListeners();
}

export function unregisterModalInstance(instanceId: number) {
  if (!activeRegistrations.has(instanceId)) return;
  activeRegistrations.delete(instanceId);
  notifyListeners();
}

export function getActiveModalId(): StartupModalId | null {
  return cachedTopModal;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): StartupModalId | null {
  return cachedTopModal;
}

function getServerSnapshot(): StartupModalId | null {
  return null;
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Coordinates startup/system modals by priority:
 * zalo > mandatory_schedule > version_release > newbie_guide.
 * Returns true only when `wantOpen` is true and this modal holds the highest priority.
 */
export function useModalQueue(modalId: StartupModalId, wantOpen: boolean): boolean {
  const [instanceId] = useState(() => nextInstanceId++);

  const activeModalId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useIsomorphicLayoutEffect(() => {
    if (wantOpen) {
      registerModalInstance(instanceId, modalId);
    } else {
      unregisterModalInstance(instanceId);
    }
    return () => {
      unregisterModalInstance(instanceId);
    };
  }, [instanceId, modalId, wantOpen]);

  return wantOpen && activeModalId === modalId;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
}

/**
 * Reusable dialog accessibility helper:
 * - Saves and restores previously focused element on open/close
 * - Moves initial focus inside the dialog
 * - Traps Tab / Shift+Tab inside the dialog
 * - Optionally invokes onClose on Escape
 */
export function useDialogA11y({
  isOpen,
  containerRef,
  onClose,
  closeOnEscape = true,
}: {
  isOpen: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  onClose?: () => void;
  closeOnEscape?: boolean;
}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusInitial = window.requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      if (document.activeElement && container.contains(document.activeElement)) return;
      const focusables = getFocusableElements(container);
      if (focusables.length > 0) {
        focusables[0].focus({ preventScroll: true });
      } else {
        container.focus({ preventScroll: true });
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape && onCloseRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (!active || active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusInitial);
      window.removeEventListener('keydown', handleKeyDown, true);
      if (previouslyFocused && previouslyFocused.isConnected) {
        window.requestAnimationFrame(() => {
          if (previouslyFocused.isConnected) {
            previouslyFocused.focus({ preventScroll: true });
          }
        });
      }
    };
  }, [isOpen, containerRef, closeOnEscape]);
}
