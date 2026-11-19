import { create } from 'zustand';

export type FeedbackTone = 'success' | 'error' | 'warning' | 'info';

export interface KgConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
}

export interface FeedbackToastItem {
  id: string;
  message: string;
  tone: FeedbackTone;
  title?: string;
  durationMs: number;
}

export interface FeedbackDialogRequest {
  id: string;
  kind: 'confirm' | 'alert';
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone: 'danger' | 'warning' | 'primary' | FeedbackTone;
  resolve: (confirmed: boolean) => void;
}

interface FeedbackStoreState {
  toasts: FeedbackToastItem[];
  activeDialog: FeedbackDialogRequest | null;
  dialogQueue: FeedbackDialogRequest[];
  loadingMessage: string | null;
  pushToast: (message: string, tone?: FeedbackTone, title?: string, durationMs?: number) => string;
  dismissToast: (id: string) => void;
  enqueueDialog: (dialog: FeedbackDialogRequest) => void;
  resolveActiveDialog: (confirmed: boolean) => void;
  setLoadingMessage: (message: string | null) => void;
}

let feedbackSeq = 0;
const nextFeedbackId = (prefix: string) => `${prefix}_${Date.now()}_${++feedbackSeq}`;

export const useFeedbackStore = create<FeedbackStoreState>((set, get) => ({
  toasts: [],
  activeDialog: null,
  dialogQueue: [],
  loadingMessage: null,

  pushToast: (message, tone = 'info', title, durationMs = 3200) => {
    const id = nextFeedbackId('toast');
    const item: FeedbackToastItem = {
      id,
      message,
      tone,
      title,
      durationMs,
    };
    set((state) => ({
      toasts: [...state.toasts.slice(-3), item],
    }));
    return id;
  },

  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  enqueueDialog: (dialog) => {
    const current = get().activeDialog;
    if (!current) {
      set({ activeDialog: dialog });
    } else {
      set((state) => ({
        dialogQueue: [...state.dialogQueue, dialog],
      }));
    }
  },

  resolveActiveDialog: (confirmed) => {
    const current = get().activeDialog;
    if (!current) return;
    const queue = get().dialogQueue;
    const [nextDialog, ...rest] = queue;
    set({
      activeDialog: nextDialog ?? null,
      dialogQueue: rest,
    });
    current.resolve(confirmed);
  },

  setLoadingMessage: (message) => {
    set({ loadingMessage: message && message.trim() ? message : null });
  },
}));

export function kgToast(
  message: string,
  tone: FeedbackTone = 'info',
  title?: string,
  durationMs = 3200,
): string {
  return useFeedbackStore.getState().pushToast(message, tone, title, durationMs);
}

export function kgConfirm(options: KgConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    useFeedbackStore.getState().enqueueDialog({
      id: nextFeedbackId('confirm'),
      kind: 'confirm',
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel ?? 'Đồng ý',
      cancelLabel: options.cancelLabel ?? 'Hủy',
      tone: options.tone ?? 'primary',
      resolve,
    });
  });
}

export function kgAlert(
  title: string,
  message?: string,
  tone: FeedbackTone = 'info',
): Promise<void> {
  return new Promise<void>((resolve) => {
    useFeedbackStore.getState().enqueueDialog({
      id: nextFeedbackId('alert'),
      kind: 'alert',
      title,
      message,
      confirmLabel: 'Đã hiểu',
      tone,
      resolve: () => resolve(),
    });
  });
}

export function kgLoading(message?: string | null): void {
  useFeedbackStore.getState().setLoadingMessage(message ?? null);
}
