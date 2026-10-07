// ============================================
// offlineQueue.ts - Local Punch Vault & Resilient Sync
// ============================================
import { callApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';

export interface QueuedTask {
  id: string;
  action: string;
  payload: Record<string, any>;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
  priority?: 'high' | 'normal' | 'low';
}

export type PunchSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface PunchStatusUpdate {
  checkinId: string;
  status: PunchSyncStatus;
  message?: string;
  data?: any;
}

const STORAGE_KEY = 'kg_offline_queue_v1';
const PUNCH_VAULT_KEY = 'kg_punch_vault_v1';
let isProcessing = false;
let retryTimeoutId: any = null;

// Listeners for punch sync state
const punchStatusListeners = new Set<(update: PunchStatusUpdate) => void>();

export function subscribePunchStatus(listener: (update: PunchStatusUpdate) => void): () => void {
  punchStatusListeners.add(listener);
  return () => punchStatusListeners.delete(listener);
}

function notifyPunchStatus(update: PunchStatusUpdate) {
  punchStatusListeners.forEach((fn) => {
    try {
      fn(update);
    } catch (e) {
      console.warn('[OfflineQueue] Listener error:', e);
    }
  });
}

/**
 * Get all queued tasks from localStorage
 */
export function getQueue(): QueuedTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[OfflineQueue] Error reading queue:', e);
    return [];
  }
}

/**
 * Save tasks back to localStorage
 */
function saveQueue(queue: QueuedTask[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[OfflineQueue] Error saving queue:', e);
  }
}

/**
 * Save a punch record to permanent local vault (Zero-Loss Guarantee)
 */
export function savePunchToVault(payload: Record<string, any>): void {
  try {
    const raw = localStorage.getItem(PUNCH_VAULT_KEY);
    const vault = raw ? JSON.parse(raw) : [];
    // Keep last 50 punches locally for history audit
    const updated = [
      {
        ...payload,
        vaultSavedAt: Date.now(),
        syncStatus: 'pending'
      },
      ...vault.filter((item: any) => item.checkinId !== payload.checkinId)
    ].slice(0, 50);
    localStorage.setItem(PUNCH_VAULT_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[OfflineQueue] Error saving to punch vault:', e);
  }
}

/**
 * Mark a punch in vault as synced
 */
export function markPunchVaultSynced(checkinId: string, serverData?: any): void {
  try {
    const raw = localStorage.getItem(PUNCH_VAULT_KEY);
    if (!raw) return;
    const vault = JSON.parse(raw);
    const updated = vault.map((item: any) => {
      if (item.checkinId === checkinId) {
        return { ...item, syncStatus: 'synced', serverData, syncedAt: Date.now() };
      }
      return item;
    });
    localStorage.setItem(PUNCH_VAULT_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[OfflineQueue] Error updating punch vault:', e);
  }
}

/**
 * Add a task to the offline queue
 */
export function enqueueTask(
  action: string,
  payload: Record<string, any>,
  options?: { maxAttempts?: number; priority?: 'high' | 'normal' | 'low' }
): string {
  const taskId = payload.checkinId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const task: QueuedTask = {
    id: taskId,
    action,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    maxAttempts: options?.maxAttempts || (action === 'CHECK_IN_OUT' ? 20 : 10),
    priority: options?.priority || (action === 'CHECK_IN_OUT' ? 'high' : 'normal'),
  };

  if (action === 'CHECK_IN_OUT') {
    savePunchToVault(payload);
    notifyPunchStatus({ checkinId: taskId, status: 'pending', message: 'Đã lưu trữ an toàn trong Vault' });
  }

  const queue = getQueue();
  // Filter out any identical pending task
  const filtered = queue.filter(
    (t) => !(t.action === action && (
      (payload?.checkinId && t.payload?.checkinId === payload.checkinId) ||
      (t.payload?.timeISO && t.payload?.timeISO === payload?.timeISO)
    ))
  );
  filtered.push(task);
  saveQueue(filtered);

  // Trigger rapid background sync if online
  if (navigator.onLine) {
    scheduleNextQueueProcessing(150);
  }

  return taskId;
}

function scheduleNextQueueProcessing(delayMs: number = 2000) {
  if (retryTimeoutId) clearTimeout(retryTimeoutId);
  retryTimeoutId = setTimeout(() => {
    if (navigator.onLine) {
      processQueue();
    }
  }, delayMs);
}

/**
 * Process all pending items in the offline queue
 */
export async function processQueue(): Promise<void> {
  if (isProcessing) return;
  if (!navigator.onLine) return;

  const queue = getQueue();
  if (queue.length === 0) return;

  isProcessing = true;

  try {
    const remaining: QueuedTask[] = [];

    // Sort by priority (high -> normal -> low) then by createdAt
    const sorted = [...queue].sort((a, b) => {
      const pMap = { high: 0, normal: 1, low: 2 };
      const diff = (pMap[a.priority || 'normal'] || 1) - (pMap[b.priority || 'normal'] || 1);
      return diff !== 0 ? diff : a.createdAt - b.createdAt;
    });

    let hasTemporaryErrors = false;

    for (const task of sorted) {
      if (!navigator.onLine) {
        remaining.push(task);
        continue;
      }

      task.attempts += 1;
      const checkinId = task.payload?.checkinId || task.id;

      if (task.action === 'CHECK_IN_OUT') {
        notifyPunchStatus({ checkinId, status: 'syncing', message: 'Đang kết nối máy chủ đồng bộ...' });
      }

      try {
        let effectivePayload = task.payload;
        if (task.action === 'CHECK_IN_OUT' && task.payload?.image && task.payload.image.length > 100) {
          effectivePayload = {
            ...task.payload,
            image: 'PENDING',
            fastSync: true
          };
        }

        const res = await callApi(task.action, effectivePayload, {
          background: true,
          timeoutMs: task.action === 'CHECK_IN_OUT' ? 30000 : 35000,
          maxAttempts: 1,
        });

        if (res && res.ok !== false) {
          // Success!
          console.log(`[OfflineQueue] Successfully processed task: ${task.action} (${task.id})`);

          if (task.action === 'CHECK_IN_OUT') {
            markPunchVaultSynced(checkinId, res.data);
            notifyPunchStatus({
              checkinId,
              status: 'synced',
              message: 'Đã ghi nhận thành công 100% vào Bảng chấm công (Google Sheets)',
              data: res.data
            });

            // If image upload is pending, enqueue upload task
            const returnedImgUrl = res.data?.imageUrl;
            if (returnedImgUrl && returnedImgUrl.includes('drive.google.com')) {
              const effectiveTime = res.data?.timeISO || task.payload?.timeISO;
              if (effectiveTime) {
                useAppStore.getState().updateLogImage(effectiveTime, returnedImgUrl);
              }
            } else if (task.payload?.image && task.payload.image !== 'PENDING' && task.payload.image.length > 100) {
              enqueueTask('UPLOAD_CHECKIN_IMAGE', {
                checkinId,
                username: task.payload.username,
                fullname: task.payload.fullname,
                timeISO: res.data?.timeISO || task.payload.timeISO,
                time: res.data?.thoiGian || task.payload.time,
                image: task.payload.image
              }, { priority: 'high', maxAttempts: 10 });
            }

            // Trigger background email notification if needed
            if (task.payload?.email && (!res.data?.emailSentDirectly)) {
              callApi('SEND_EMAIL_NOTIFICATION', {
                ...task.payload,
                imageUrl: returnedImgUrl || task.payload.image,
                distMeters: res.data?.distMeters || task.payload.distMeters,
                isValid: res.data?.isValid ?? true,
                viTri: res.data?.viTri || task.payload.location,
                timeISO: res.data?.timeISO || task.payload.timeISO
              }, { background: true, timeoutMs: 35000, maxAttempts: 2 }).catch((err) => {
                console.warn('[OfflineQueue] Email notification background error:', err);
              });
            }
          } else if (task.action === 'UPLOAD_CHECKIN_IMAGE') {
            const driveUrl = res.data?.url || res.data?.imageUrl;
            if (driveUrl) {
              if (task.payload.time) {
                useAppStore.getState().updateLogImage(task.payload.time, driveUrl);
              }
              if (task.payload.timeISO) {
                useAppStore.getState().updateLogImage(task.payload.timeISO, driveUrl);
              }
            }
          }
        } else {
          // Check if server already has this check-in recorded (anti-spam cooldown triggered because row was already inserted!)
          const isAlreadyRecorded = res?.code === 'ALREADY_CHECKED_IN' || res?.isSpamCooldown ||
            (typeof res?.message === 'string' && (res.message.includes('chống spam') || res.message.includes('vừa chấm công') || res.message.includes('15 phút')));

          if (isAlreadyRecorded && task.action === 'CHECK_IN_OUT') {
            console.log(`[OfflineQueue] Row was already recorded on Google Sheets (${task.id}). Advancing to image upload.`);
            markPunchVaultSynced(checkinId, res?.data);
            notifyPunchStatus({
              checkinId,
              status: 'synced',
              message: 'Đã ghi nhận trên Bảng chấm công (Google Sheets)',
              data: res?.data
            });

            // Enqueue image upload to guarantee Column G is populated!
            if (task.payload?.image && task.payload.image !== 'PENDING' && task.payload.image.length > 100) {
              enqueueTask('UPLOAD_CHECKIN_IMAGE', {
                checkinId,
                username: task.payload.username,
                fullname: task.payload.fullname,
                timeISO: task.payload.timeISO,
                time: task.payload.time,
                image: task.payload.image
              }, { priority: 'high', maxAttempts: 15 });
            }
            continue;
          }

          // Server returned false or rate limit / lock busy
          const isConcurrencyOrLock = res?.code === 'LOCK_TIMEOUT' || res?.code === 'CONCURRENCY_QUEUED' || res?.message?.includes('Lock') || res?.message?.includes('bận');
          if (isConcurrencyOrLock) {
            hasTemporaryErrors = true;
          }

          if (task.attempts < task.maxAttempts) {
            remaining.push(task);
            if (task.action === 'CHECK_IN_OUT') {
              notifyPunchStatus({
                checkinId,
                status: 'pending',
                message: `Máy chủ bận, sẽ tự động thử lại (Lần ${task.attempts}/${task.maxAttempts})...`
              });
            }
          } else {
            console.warn(`[OfflineQueue] Dropping task after ${task.attempts} attempts: ${task.action}`);
            if (task.action === 'CHECK_IN_OUT') {
              notifyPunchStatus({
                checkinId,
                status: 'failed',
                message: res?.message || 'Không thể đồng bộ sau nhiều lần thử.'
              });
            }
          }
        }
      } catch (err: any) {
        console.warn(`[OfflineQueue] Task ${task.action} failed on attempt ${task.attempts}:`, err);
        hasTemporaryErrors = true;
        if (task.attempts < task.maxAttempts) {
          remaining.push(task);
          if (task.action === 'CHECK_IN_OUT') {
            notifyPunchStatus({
              checkinId,
              status: 'pending',
              message: `Mất kết nối, sẽ tự động thử lại khi có mạng (Lần ${task.attempts}/${task.maxAttempts})...`
            });
          }
        }
      }
    }

    saveQueue(remaining);

    // If there are remaining tasks, schedule a fast retry (2.5s for lock/concurrency, 8s for network error)
    if (remaining.length > 0) {
      const retryDelay = hasTemporaryErrors ? 2500 : 8000;
      scheduleNextQueueProcessing(retryDelay);
    }
  } finally {
    isProcessing = false;
  }
}

/**
 * Auto-initialize online event listener and periodic check
 */
export function initOfflineQueueSync(): () => void {
  const onOnline = () => {
    console.log('[OfflineQueue] Connection restored, flushing queue...');
    processQueue();
  };

  window.addEventListener('online', onOnline);

  // Periodic flush every 30 seconds if online
  const intervalId = setInterval(() => {
    if (navigator.onLine && getQueue().length > 0) {
      processQueue();
    }
  }, 30000);

  // Initial trigger on mount
  if (navigator.onLine) {
    processQueue();
  }

  return () => {
    window.removeEventListener('online', onOnline);
    clearInterval(intervalId);
    if (retryTimeoutId) clearTimeout(retryTimeoutId);
  };
}
