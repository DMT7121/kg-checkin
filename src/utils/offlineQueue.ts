// ============================================
// offlineQueue.ts - Offline Queue & Resilient Sync
// ============================================
import { callApi } from '../services/api';

export interface QueuedTask {
  id: string;
  action: string;
  payload: Record<string, any>;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
  priority?: 'high' | 'normal' | 'low';
}

const STORAGE_KEY = 'kg_offline_queue_v1';
let isProcessing = false;

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
 * Add a task to the offline queue
 */
export function enqueueTask(
  action: string,
  payload: Record<string, any>,
  options?: { maxAttempts?: number; priority?: 'high' | 'normal' | 'low' }
): string {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const task: QueuedTask = {
    id: taskId,
    action,
    payload,
    createdAt: Date.now(),
    attempts: 0,
    maxAttempts: options?.maxAttempts || 5,
    priority: options?.priority || 'normal',
  };

  const queue = getQueue();
  // Filter out any identical pending task (e.g. duplicate checkin image upload)
  const filtered = queue.filter(
    (t) => !(t.action === action && t.payload?.timeISO && t.payload?.timeISO === payload?.timeISO)
  );
  filtered.push(task);
  saveQueue(filtered);

  // If online, attempt to process immediately in background
  if (navigator.onLine) {
    processQueue();
  }

  return taskId;
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

    for (const task of sorted) {
      if (!navigator.onLine) {
        remaining.push(task);
        continue;
      }

      task.attempts += 1;
      try {
        const res = await callApi(task.action, task.payload, {
          background: true,
          timeoutMs: 45000,
          maxAttempts: 1,
        });

        if (res && res.ok !== false) {
          // Success, do not keep in queue
          console.log(`[OfflineQueue] Successfully processed task: ${task.action} (${task.id})`);
        } else {
          // If server explicitly returned an error or task reached limit
          if (task.attempts < task.maxAttempts) {
            remaining.push(task);
          } else {
            console.warn(`[OfflineQueue] Dropping task after ${task.attempts} attempts: ${task.action}`);
          }
        }
      } catch (err) {
        console.warn(`[OfflineQueue] Task ${task.action} failed on attempt ${task.attempts}:`, err);
        if (task.attempts < task.maxAttempts) {
          remaining.push(task);
        }
      }
    }

    saveQueue(remaining);
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

  // Periodic flush every 60 seconds if online
  const intervalId = setInterval(() => {
    if (navigator.onLine) {
      processQueue();
    }
  }, 60000);

  // Initial trigger on mount
  if (navigator.onLine) {
    processQueue();
  }

  return () => {
    window.removeEventListener('online', onOnline);
    clearInterval(intervalId);
  };
}
