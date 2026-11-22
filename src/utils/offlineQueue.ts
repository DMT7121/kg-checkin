// ============================================
// offlineQueue.ts - Local Punch Vault & Resilient Sync
// ============================================
import { callApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { clearEmployeePunchCooldown, matchesAttendanceUser } from './attendanceSequence';
import { markScheduleRegisteredLocally } from './helpers';

export interface QueuedTask {
  id: string;
  action: string;
  payload: Record<string, any>;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
  priority?: 'high' | 'normal' | 'low';
}

export type PunchSyncStatus = 'pending' | 'syncing' | 'edge_buffered' | 'synced' | 'failed';

export interface PunchStatusUpdate {
  checkinId: string;
  status: PunchSyncStatus;
  message?: string;
  data?: any;
}

export interface VaultPunchEntry {
  checkinId: string;
  username?: string;
  fullname?: string;
  type?: string;
  time?: string;
  timeISO?: string;
  location?: string;
  syncStatus: PunchSyncStatus;
  errorReason?: string;
  vaultSavedAt?: number;
  failedAt?: number;
  syncedAt?: number;
  imageUploaded?: boolean;
  imageEdgeQueued?: boolean;
  [key: string]: any;
}

const STORAGE_KEY = 'kg_offline_queue_v1';
const PUNCH_VAULT_KEY = 'kg_punch_vault_v1';
const ORPHAN_RECOVERY_MIN_AGE_MS = 45_000; // Must exceed primary 30s request timeout so in-flight punches never duplicate
const inFlightCheckinIds = new Set<string>();
const inFlightImageUploadIds = new Set<string>();
let isProcessing = false;
let retryTimeoutId: any = null;

// Listeners for punch sync state & queue processing state
const punchStatusListeners = new Set<(update: PunchStatusUpdate) => void>();
const queueSyncingListeners = new Set<(syncing: boolean) => void>();

export function isQueueSyncing(): boolean {
  return isProcessing;
}

export function subscribeQueueSyncing(listener: (syncing: boolean) => void): () => void {
  queueSyncingListeners.add(listener);
  return () => queueSyncingListeners.delete(listener);
}

function setQueueProcessing(next: boolean): void {
  if (isProcessing === next) return;
  isProcessing = next;
  queueSyncingListeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      /* ignore listener errors */
    }
  });
}

function emitQueueUpdated(count = getQueue().length): void {
  try {
    window.dispatchEvent(new CustomEvent('kg:offline-queue-updated', { detail: { count } }));
  } catch {
    /* ignore */
  }
}

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

export function markCheckinInFlight(checkinId: string): void {
  if (checkinId) inFlightCheckinIds.add(checkinId);
}

export function clearCheckinInFlight(checkinId: string): void {
  if (checkinId) inFlightCheckinIds.delete(checkinId);
}

export function markImageUploadInFlight(checkinId: string): void {
  if (checkinId) inFlightImageUploadIds.add(checkinId);
}

export function clearImageUploadInFlight(checkinId: string): void {
  if (checkinId) inFlightImageUploadIds.delete(checkinId);
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

export function getQueueLength(): number {
  return getQueue().length;
}

/**
 * Save tasks back to localStorage
 */
function saveQueue(queue: QueuedTask[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[OfflineQueue] Quota warning saving queue, compacting older images:', e);
    try {
      let pendingImagesKept = 0;
      const compacted = queue.map((t) => {
        const hasHeavyImg = typeof t.payload?.image === 'string' && t.payload.image.startsWith('data:image/');
        if (hasHeavyImg) {
          pendingImagesKept++;
          if (pendingImagesKept > 3) {
            return { ...t, payload: { ...t.payload, image: 'PENDING' } };
          }
        }
        return t;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(compacted));
    } catch { /* ignore */ }
  }
  try {
    window.dispatchEvent(new CustomEvent('kg:offline-queue-updated', { detail: { count: queue.length } }));
  } catch { /* ignore */ }
}

function compactVaultEntries(entries: any[]): any[] {
  let base64KeptCount = 0;
  return entries.slice(0, 50).map((item: any) => {
    const isBase64 = typeof item?.image === 'string' && item.image.startsWith('data:image/');
    if (!isBase64) return item;
    if (
      ((item.syncStatus === 'synced' || item.syncStatus === 'edge_buffered') &&
        (item.imageUploaded || item.imageEdgeQueued)) ||
      item.syncStatus === 'failed'
    ) {
      return { ...item, image: item.imageUrl || '[COMPACTED]' };
    }
    base64KeptCount++;
    // Only retain raw base64 on at most the 3 newest unsynced punches so localStorage (5MB) never overflows
    if (base64KeptCount > 3) {
      return { ...item, image: '[COMPACTED_FOR_QUOTA]' };
    }
    return item;
  });
}

/**
 * Save a punch record to permanent local vault (Zero-Loss Guarantee)
 */
export function savePunchToVault(payload: Record<string, any>): void {
  try {
    const raw = localStorage.getItem(PUNCH_VAULT_KEY);
    const vault = raw ? JSON.parse(raw) : [];
    const updated = compactVaultEntries([
      {
        ...payload,
        vaultSavedAt: Date.now(),
        syncStatus: 'pending'
      },
      ...vault.filter((item: any) => item.checkinId !== payload.checkinId)
    ]);
    localStorage.setItem(PUNCH_VAULT_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[OfflineQueue] Error saving to punch vault, stripping base64 fallback:', e);
    try {
      const raw = localStorage.getItem(PUNCH_VAULT_KEY);
      const vault = raw ? JSON.parse(raw) : [];
      const stripped = [
        { ...payload, image: '[COMPACTED_FOR_QUOTA]', vaultSavedAt: Date.now(), syncStatus: 'pending' },
        ...vault
          .filter((item: any) => item.checkinId !== payload.checkinId)
          .map((item: any) => (typeof item?.image === 'string' && item.image.startsWith('data:image/') ? { ...item, image: '[COMPACTED_FOR_QUOTA]' } : item))
      ].slice(0, 30);
      localStorage.setItem(PUNCH_VAULT_KEY, JSON.stringify(stripped));
    } catch { /* ignore */ }
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
    const updated = compactVaultEntries(vault.map((item: any) => {
      if (item.checkinId === checkinId) {
        const driveUrl = serverData?.imageUrl || serverData?.url;
        const hasDriveUrl = typeof driveUrl === 'string' && driveUrl.startsWith('http');
        return {
          ...item,
          syncStatus: 'synced',
          serverData,
          syncedAt: Date.now(),
          ...(hasDriveUrl ? { image: driveUrl, imageUrl: driveUrl, imageUploaded: true } : {})
        };
      }
      return item;
    }));
    localStorage.setItem(PUNCH_VAULT_KEY, JSON.stringify(updated));
    emitQueueUpdated();
  } catch (e) {
    console.warn('[OfflineQueue] Error updating punch vault:', e);
  }
}

/**
 * Mark a permanently rejected punch in vault as failed so recoverOrphanedVaultPunches never resurrects it
 */
export function markPunchVaultFailed(checkinId: string, errorReason?: string): void {
  if (!checkinId) return;
  try {
    const raw = localStorage.getItem(PUNCH_VAULT_KEY);
    if (!raw) return;
    const vault = JSON.parse(raw);
    if (!Array.isArray(vault)) return;
    const updated = compactVaultEntries(
      vault.map((item: any) => {
        if (item && item.checkinId === checkinId) {
          return {
            ...item,
            syncStatus: 'failed',
            failedAt: Date.now(),
            errorReason: errorReason || '',
          };
        }
        return item;
      })
    );
    localStorage.setItem(PUNCH_VAULT_KEY, JSON.stringify(updated));
    emitQueueUpdated();
  } catch (e) {
    console.warn('[OfflineQueue] Error marking punch vault failed:', e);
  }
}

/**
 * Read all punch records persisted in kg_punch_vault_v1
 */
export function getPunchVaultEntries(): VaultPunchEntry[] {
  try {
    const raw = localStorage.getItem(PUNCH_VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.checkinId === 'string') : [];
  } catch (e) {
    console.warn('[OfflineQueue] Error reading punch vault:', e);
    return [];
  }
}

export function getFailedVaultPunches(): VaultPunchEntry[] {
  return getPunchVaultEntries().filter((entry) => entry.syncStatus === 'failed');
}

export function getPendingVaultPunches(): VaultPunchEntry[] {
  return getPunchVaultEntries().filter(
    (entry) => entry.syncStatus === 'pending' || entry.syncStatus === 'syncing'
  );
}

/**
 * Re-queue a failed vault punch for manual retry (never alters automatic permanent-rejection rules)
 */
export function retryFailedVaultPunch(checkinId: string): boolean {
  if (!checkinId) return false;
  try {
    const vault = getPunchVaultEntries();
    const target = vault.find((item) => item.checkinId === checkinId && item.syncStatus === 'failed');
    if (!target) return false;

    const restPayload: Record<string, any> = { ...target };
    delete restPayload.failedAt;
    delete restPayload.errorReason;
    restPayload.syncStatus = 'pending';
    restPayload.vaultSavedAt = Date.now();

    const updatedVault = compactVaultEntries(
      vault.map((item) => (item.checkinId === checkinId ? (restPayload as VaultPunchEntry) : item))
    );
    localStorage.setItem(PUNCH_VAULT_KEY, JSON.stringify(updatedVault));

    const queue = getQueue().filter(
      (t) => !(t.action === 'CHECK_IN_OUT' && (t.id === checkinId || t.payload?.checkinId === checkinId))
    );
    queue.push({
      id: checkinId,
      action: 'CHECK_IN_OUT',
      payload: restPayload,
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: 5,
      priority: 'high',
    });
    saveQueue(queue);
    notifyPunchStatus({ checkinId, status: 'pending', message: 'Đang thử đồng bộ lại từ Vault...' });
    if (navigator.onLine) {
      scheduleNextQueueProcessing(50);
    }
    return true;
  } catch (e) {
    console.warn('[OfflineQueue] Error retrying failed vault punch:', e);
    return false;
  }
}

/**
 * Permanently discard a failed punch entry from kg_punch_vault_v1 & queue
 */
export function discardFailedVaultPunch(checkinId: string): boolean {
  if (!checkinId) return false;
  try {
    const vault = getPunchVaultEntries();
    const nextVault = vault.filter((item) => item.checkinId !== checkinId);
    if (nextVault.length !== vault.length) {
      localStorage.setItem(PUNCH_VAULT_KEY, JSON.stringify(compactVaultEntries(nextVault)));
    }
    const queue = getQueue();
    const nextQueue = queue.filter(
      (t) => t.id !== checkinId && t.payload?.checkinId !== checkinId
    );
    if (nextQueue.length !== queue.length) {
      saveQueue(nextQueue);
    } else {
      emitQueueUpdated(nextQueue.length);
    }
    return nextVault.length !== vault.length || nextQueue.length !== queue.length;
  } catch (e) {
    console.warn('[OfflineQueue] Error discarding failed vault punch:', e);
    return false;
  }
}

/**
 * Globally purges a server-rejected punch from Vault, OfflineQueue, Zustand store (`kg_logs`),
 * `kg_last_punch_record`, and `kg_user_cooldown_v2` — even when `CheckIn.tsx` is unmounted!
 */
export function rollbackRejectedPunchGlobally(params: {
  checkinId?: string;
  username?: string;
  fullname?: string;
  time?: string;
  reason?: string;
}): void {
  const targetId = String(params.checkinId || '').trim();
  const targetTime = String(params.time || '').trim();
  const userIdentity =
    params.username || params.fullname
      ? { username: params.username, fullname: params.fullname || params.username || '' }
      : null;

  if (targetId) {
    clearCheckinInFlight(targetId);
    markPunchVaultFailed(targetId, params.reason);
    const currentQueue = getQueue();
    const cleanedQueue = currentQueue.filter(
      (t) => t.id !== targetId && t.payload?.checkinId !== targetId
    );
    if (cleanedQueue.length !== currentQueue.length) {
      saveQueue(cleanedQueue);
    }
  }

  try {
    const state = useAppStore.getState();
    if (Array.isArray(state.logs) && state.logs.length > 0) {
      const nextLogs = state.logs.filter((l) => {
        if (targetId && l.checkinId && String(l.checkinId).trim() === targetId) {
          return false;
        }
        if (targetTime && String(l.time || '').trim() === targetTime) {
          if (!userIdentity || matchesAttendanceUser(l, userIdentity)) {
            return false;
          }
        }
        return true;
      });
      if (nextLogs.length !== state.logs.length) {
        state.setLogs(nextLogs);
      }
    }
    if (typeof state.setLastCheckInTime === 'function') {
      state.setLastCheckInTime(0);
    }
  } catch (e) {
    console.warn('[OfflineQueue] Store rollback warning:', e);
  }

  if (userIdentity) {
    try {
      const rawLast = localStorage.getItem('kg_last_punch_record');
      if (rawLast) {
        const parsedLast = JSON.parse(rawLast);
        if (parsedLast && matchesAttendanceUser(parsedLast, userIdentity)) {
          const savedTime = String(parsedLast.time || '').trim();
          if (
            !targetTime ||
            savedTime === targetTime ||
            savedTime.includes(targetTime) ||
            targetTime.includes(savedTime)
          ) {
            localStorage.removeItem('kg_last_punch_record');
          }
        }
      }
    } catch {
      // ignore
    }
    clearEmployeePunchCooldown(userIdentity, targetTime || undefined);
  }
}

/**
 * Mark a punch in vault as safely buffered on Cloudflare Edge D1 (`instantEdge: true`),
 * preventing duplicate `CHECK_IN_OUT` retries while still guarding any unsent proof photo!
 */
export function markPunchVaultEdgeBuffered(checkinId: string, serverData?: any): void {
  if (!checkinId) return;
  try {
    const raw = localStorage.getItem(PUNCH_VAULT_KEY);
    if (!raw) return;
    const vault = JSON.parse(raw);
    if (!Array.isArray(vault)) return;
    const updated = compactVaultEntries(
      vault.map((item: any) => {
        if (item && item.checkinId === checkinId) {
          return {
            ...item,
            syncStatus: 'edge_buffered',
            serverData,
            syncedAt: Date.now(),
          };
        }
        return item;
      })
    );
    localStorage.setItem(PUNCH_VAULT_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('[OfflineQueue] Error marking punch vault edge_buffered:', e);
  }
}

/**
 * Mark proof photo as safely queued inside Cloudflare Edge D1 `edge_sync_queue`,
 * releasing heavy base64 memory on iPhone Safari/PWA immediately!
 */
export function markPunchVaultImageQueuedOnEdge(checkinId: string): void {
  if (!checkinId) return;
  try {
    const raw = localStorage.getItem(PUNCH_VAULT_KEY);
    if (!raw) return;
    const vault = JSON.parse(raw);
    if (!Array.isArray(vault)) return;
    const updated = compactVaultEntries(
      vault.map((item: any) => {
        if (item && item.checkinId === checkinId) {
          return {
            ...item,
            imageEdgeQueued: true,
            image: item.imageUrl || '[EDGE_QUEUED]',
          };
        }
        return item;
      })
    );
    localStorage.setItem(PUNCH_VAULT_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

/**
 * Release heavy base64 image in vault once Google Drive URL is confirmed
 */
export function markPunchVaultImageUploaded(checkinId: string, imageUrl: string): void {
  if (!checkinId || !imageUrl) return;
  try {
    const raw = localStorage.getItem(PUNCH_VAULT_KEY);
    if (!raw) return;
    const vault = JSON.parse(raw);
    const updated = compactVaultEntries(vault.map((item: any) => {
      if (item.checkinId === checkinId) {
        return { ...item, image: imageUrl, imageUrl, imageUploaded: true };
      }
      return item;
    }));
    localStorage.setItem(PUNCH_VAULT_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
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
 * Recover any punches saved in the permanent vault that were interrupted
 * (e.g., iOS Safari screen lock / app switch / tab kill mid-flight) before
 * reaching the synced state or completing their Drive image upload.
 */
export function recoverOrphanedVaultPunches(): number {
  let recoveredCount = 0;
  try {
    const raw = localStorage.getItem(PUNCH_VAULT_KEY);
    if (!raw) return 0;
    const vault = JSON.parse(raw);
    if (!Array.isArray(vault) || vault.length === 0) return 0;

    const queue = getQueue();
    const now = Date.now();
    let queueModified = false;

    for (const item of vault) {
      if (!item || !item.checkinId) continue;
      const cid = String(item.checkinId);
      if (inFlightCheckinIds.has(cid)) continue;
      const ageMs = now - (item.vaultSavedAt || 0);

      // 1. Recover unsynced CHECK_IN_OUT punches older than 45s (strictly after primary 30s request window)
      if (item.syncStatus === 'pending' && ageMs > ORPHAN_RECOVERY_MIN_AGE_MS && ageMs < 24 * 3600 * 1000) {
        const alreadyQueued = queue.some(
          (t) =>
            t.action === 'CHECK_IN_OUT' &&
            (t.payload?.checkinId === item.checkinId || (item.timeISO && t.payload?.timeISO === item.timeISO))
        );
        if (!alreadyQueued) {
          queue.push({
            id: item.checkinId,
            action: 'CHECK_IN_OUT',
            payload: item,
            createdAt: item.vaultSavedAt || now,
            attempts: 0,
            maxAttempts: 20,
            priority: 'high',
          });
          queueModified = true;
          recoveredCount += 1;
        }
      }

      // 2. Recover synced / edge_buffered punches whose Drive image upload was interrupted on iOS (e.g. instant screen lock)
      const syncAgeMs = now - (item.syncedAt || item.vaultSavedAt || 0);
      const rawImgCandidate = item.image || item.imageBase64 || item.uploadPayload?.image || '';
      const hasRawBase64 =
        typeof rawImgCandidate === 'string' &&
        rawImgCandidate.startsWith('data:image/') &&
        rawImgCandidate.length > 100;
      const isImageReadyToRecover =
        !inFlightImageUploadIds.has(cid) &&
        (item.syncStatus === 'edge_buffered'
          ? syncAgeMs >= 0 && syncAgeMs < 24 * 3600 * 1000
          : item.syncStatus === 'synced' && syncAgeMs > 15000 && syncAgeMs < 24 * 3600 * 1000);

      if (
        isImageReadyToRecover &&
        !item.imageUploaded &&
        !item.imageEdgeQueued &&
        hasRawBase64
      ) {
        const uploadAlreadyQueued = queue.some(
          (t) =>
            t.action === 'UPLOAD_CHECKIN_IMAGE' &&
            (t.payload?.checkinId === item.checkinId || (item.timeISO && t.payload?.timeISO === item.timeISO))
        );
        if (!uploadAlreadyQueued) {
          queue.push({
            id: `img_${item.checkinId}`,
            action: 'UPLOAD_CHECKIN_IMAGE',
            payload: {
              ...(item.uploadPayload || {}),
              instantEdge: true,
              checkinId: item.checkinId,
              username: item.username,
              fullname: item.fullname,
              timeISO: item.serverData?.timeISO || item.timeISO,
              time: item.serverData?.thoiGian || item.time,
              image: rawImgCandidate,
              sendEmailAfterUpload: item.sendEmailAfterUpload !== false,
            },
            createdAt: now,
            attempts: 0,
            maxAttempts: 15,
            priority: 'high',
          });
          queueModified = true;
          recoveredCount += 1;
        }
      }
    }

    if (queueModified) {
      saveQueue(queue);
    }
  } catch (e) {
    console.warn('[OfflineQueue] Error recovering orphaned vault punches:', e);
  }
  return recoveredCount;
}

/**
 * Process all pending items in the offline queue
 */
export async function processQueue(): Promise<void> {
  if (isProcessing) return;
  if (!navigator.onLine) return;

  recoverOrphanedVaultPunches();

  const queue = getQueue();
  if (queue.length === 0) return;

  setQueueProcessing(true);

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
        if (task.action === 'CHECK_IN_OUT') {
          const nowMs = Date.now();
          const origClientMs = Number(task.payload?.clientNowMs) || nowMs;
          const origPhotoMs = Number(task.payload?.photoCapturedMs) || origClientMs;
          const captureDeltaMs = Math.min(45000, Math.max(500, origClientMs - origPhotoMs));
          effectivePayload = {
            ...task.payload,
            image: task.payload?.image && task.payload.image.length > 100 ? 'PENDING' : task.payload?.image,
            fastSync: true,
            sendEmailInline: false,
            isOfflineRetry: true,
            clientNowMs: nowMs,
            photoCapturedMs: nowMs - captureDeltaMs,
          };
        }

        const res = await callApi(task.action, effectivePayload, {
          background: true,
          timeoutMs: task.action === 'CHECK_IN_OUT' ? 30000 : 35000,
          maxAttempts: 1,
        });

        if (res && res.ok !== false) {
          console.log(`[OfflineQueue] Successfully processed task: ${task.action} (${task.id})`);

          if (task.action === 'CHECK_IN_OUT') {
            markPunchVaultSynced(checkinId, res.data);
            notifyPunchStatus({
              checkinId,
              status: 'synced',
              message:
                res.data?.edgeBuffered === true
                  ? 'Đã lưu bảo lãnh trên đám mây Cloudflare D1 • Đang ghi Google Sheets'
                  : 'Đã ghi nhận thành công 100% vào Bảng chấm công (Google Sheets)',
              data: res.data,
            });

            // If image upload is pending, enqueue upload task (which also sends post-upload confirmation email!)
            const returnedImgUrl = res.data?.imageUrl;
            const hasRawImg = Boolean(
              task.payload?.image && task.payload.image !== 'PENDING' && task.payload.image.length > 100
            );
            if (returnedImgUrl && returnedImgUrl.includes('drive.google.com')) {
              const effectiveTime = res.data?.timeISO || task.payload?.timeISO;
              if (effectiveTime) {
                useAppStore.getState().updateLogImage(effectiveTime, returnedImgUrl);
              }
            } else if (hasRawImg) {
              enqueueTask(
                'UPLOAD_CHECKIN_IMAGE',
                {
                  checkinId,
                  username: task.payload.username,
                  fullname: task.payload.fullname,
                  email: task.payload.email,
                  type: res.data?.type || task.payload.type,
                  location: res.data?.viTri || task.payload.location,
                  distMeters: res.data?.distMeters ?? task.payload.distMeters,
                  timeISO: res.data?.timeISO || task.payload.timeISO,
                  time: res.data?.thoiGian || task.payload.time,
                  image: task.payload.image,
                  sendEmailAfterUpload: task.payload.sendEmailAfterUpload !== false,
                },
                { priority: 'high', maxAttempts: 10 }
              );
            } else if (
              task.payload?.email &&
              !task.payload?.emailNotificationSent &&
              !res.data?.emailSentDirectly &&
              task.payload?.checkinMode !== 'v2_face'
            ) {
              // Fallback email notification only when there is no raw image to upload
              const cleanEmailPayload: Record<string, any> = { ...task.payload };
              delete cleanEmailPayload.image;
              callApi(
                'SEND_EMAIL_NOTIFICATION',
                {
                  ...cleanEmailPayload,
                  imageUrl: returnedImgUrl || '',
                  distMeters: res.data?.distMeters ?? task.payload.distMeters,
                  isValid: res.data?.isValid ?? true,
                  viTri: res.data?.viTri || task.payload.location,
                  timeISO: res.data?.timeISO || task.payload.timeISO,
                },
                { background: true, timeoutMs: 25000, maxAttempts: 2 }
              ).catch((err) => {
                console.warn('[OfflineQueue] Email notification background error:', err);
              });
            }
          } else if (task.action === 'UPLOAD_CHECKIN_IMAGE') {
            const driveUrl = res.data?.url || res.data?.imageUrl;
            if (driveUrl) {
              markPunchVaultImageUploaded(checkinId, driveUrl);
              if (task.payload.time) {
                useAppStore.getState().updateLogImage(task.payload.time, driveUrl);
              }
              if (task.payload.timeISO) {
                useAppStore.getState().updateLogImage(task.payload.timeISO, driveUrl);
              }
            } else if (res.data?.edgeImageQueued === true || res.data?.queuedForDrive === true) {
              markPunchVaultImageQueuedOnEdge(checkinId);
            }
          } else if (task.action === 'REGISTER_SHIFT') {
            const weekKey =
              task.payload?.monthSheet && task.payload?.weekLabel
                ? `${task.payload.monthSheet}|${task.payload.weekLabel}`
                : '';
            if (weekKey && Array.isArray(task.payload?.shifts) && task.payload.shifts.length === 7) {
              const sheetSaved = res.data?.sheetSaved !== false;
              const syncedTs = res.data?.timestamp || '';
              markScheduleRegisteredLocally(task.payload?.username, weekKey, task.payload.shifts, {
                updatedAt: syncedTs,
                sheetSynced: sheetSaved,
                offReason: task.payload?.offReason || '',
              });
              useAppStore.getState().setScheduleRegistered(true, weekKey);
              useAppStore.getState().setRegisteredShifts(task.payload.shifts);
              useAppStore.getState().setScheduleMeta({
                registeredWeekKey: weekKey,
                scheduleUpdatedAt: syncedTs,
                scheduleSheetSynced: sheetSaved,
              });
            }
          }
        } else {
          // Check if server already has this check-in recorded
          const isAlreadyRecorded =
            !String(res?.code || '').startsWith('COOLDOWN_') &&
            (res?.code === 'ALREADY_CHECKED_IN' ||
              res?.isSpamCooldown ||
              (typeof res?.message === 'string' &&
                (res.message.includes('chống spam') ||
                  res.message.includes('vừa chấm công') ||
                  res.message.includes('15 phút') ||
                  res.message.includes('30 phút'))));

          if (isAlreadyRecorded && task.action === 'CHECK_IN_OUT') {
            console.log(`[OfflineQueue] Row was already recorded on Google Sheets (${task.id}). Advancing to image upload.`);
            markPunchVaultSynced(checkinId, res?.data);
            notifyPunchStatus({
              checkinId,
              status: 'synced',
              message: 'Đã ghi nhận trên Bảng chấm công (Google Sheets)',
              data: res?.data,
            });

            if (task.payload?.image && task.payload.image !== 'PENDING' && task.payload.image.length > 100) {
              enqueueTask(
                'UPLOAD_CHECKIN_IMAGE',
                {
                  checkinId,
                  username: task.payload.username,
                  fullname: task.payload.fullname,
                  timeISO: task.payload.timeISO,
                  time: task.payload.time,
                  image: task.payload.image,
                  sendEmailAfterUpload: task.payload.sendEmailAfterUpload !== false,
                },
                { priority: 'high', maxAttempts: 15 }
              );
            }
            continue;
          }

          // Allow SCHEDULE_REQUIRED up to 3 attempts in case D1 schedule registration is syncing
          const errCode = String(res?.code || res?.data?.code || '').trim();
          const isScheduleFinalRejection = errCode === 'SCHEDULE_REQUIRED' && task.attempts >= 3;

          const isPermanentRejection =
            errCode === 'OUT_OF_RADIUS' ||
            errCode === 'SPOOF_DETECTED' ||
            errCode === 'SECURITY_TOKEN_MISMATCH' ||
            errCode === 'FACE_VERIFICATION_FAILED' ||
            errCode === 'FACE_PROFILE_NOT_FOUND' ||
            errCode === 'MAX_4_PUNCHES' ||
            errCode === 'COOLDOWN_15M' ||
            errCode === 'COOLDOWN_30M' ||
            errCode === 'PHOTO_EXPIRED' ||
            errCode === 'CLOCK_DESYNC' ||
            errCode === 'ACCOUNT_INACTIVE' ||
            errCode === 'UNAUTHORIZED' ||
            isScheduleFinalRejection;

          if (isPermanentRejection) {
            console.warn(`[OfflineQueue] Task ${task.action} permanently rejected (${errCode}): ${res?.message}`);
            if (task.action === 'CHECK_IN_OUT') {
              rollbackRejectedPunchGlobally({
                checkinId,
                username: task.payload?.username,
                fullname: task.payload?.fullname,
                time: task.payload?.time,
                reason: res?.message,
              });
              notifyPunchStatus({
                checkinId,
                status: 'failed',
                message: res?.message || 'Dữ liệu chấm công không hợp lệ theo quy định máy chủ.',
              });
            }
            continue;
          }

          // Server returned temporary error / rate limit / lock busy
          const isConcurrencyOrLock =
            errCode === 'LOCK_TIMEOUT' ||
            errCode === 'CONCURRENCY_QUEUED' ||
            errCode === 'SCHEDULE_REQUIRED' ||
            res?.message?.includes('Lock') ||
            res?.message?.includes('bận');
          if (isConcurrencyOrLock) {
            hasTemporaryErrors = true;
          }

          if (task.attempts < task.maxAttempts) {
            remaining.push(task);
            if (task.action === 'CHECK_IN_OUT') {
              notifyPunchStatus({
                checkinId,
                status: 'pending',
                message: `Máy chủ bận, sẽ tự động thử lại (Lần ${task.attempts}/${task.maxAttempts})...`,
              });
            }
          } else {
            console.warn(`[OfflineQueue] Dropping task after ${task.attempts} attempts: ${task.action}`);
            if (task.action === 'CHECK_IN_OUT') {
              markPunchVaultFailed(checkinId, res?.message || 'Max attempts exceeded');
              notifyPunchStatus({
                checkinId,
                status: 'failed',
                message: res?.message || 'Không thể đồng bộ sau nhiều lần thử.',
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
              message: `Mất kết nối, sẽ tự động thử lại khi có mạng (Lần ${task.attempts}/${task.maxAttempts})...`,
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
    setQueueProcessing(false);
  }
}

/**
 * Auto-initialize online event listener, iOS visibility recovery, and periodic check
 */
export function initOfflineQueueSync(): () => void {
  const onOnline = () => {
    console.log('[OfflineQueue] Connection restored, flushing queue...');
    processQueue();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      recoverOrphanedVaultPunches();
      processQueue();
    }
  };

  const onPageShow = () => {
    if (navigator.onLine) {
      recoverOrphanedVaultPunches();
      processQueue();
    }
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', onPageShow);

  // Periodic flush every 20 seconds if online
  const intervalId = setInterval(() => {
    if (navigator.onLine) {
      recoverOrphanedVaultPunches();
      if (getQueue().length > 0) {
        processQueue();
      }
    }
  }, 20000);

  // Initial trigger on mount
  if (navigator.onLine) {
    processQueue();
  }

  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pageshow', onPageShow);
    clearInterval(intervalId);
    if (retryTimeoutId) clearTimeout(retryTimeoutId);
  };
}
