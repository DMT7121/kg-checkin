import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  KgBottomSheet,
  KgButton,
  KgEmptyState,
  KgStatusBadge,
} from './KgDesignSystem';
import {
  discardFailedVaultPunch,
  getFailedVaultPunches,
  getPendingVaultPunches,
  getQueue,
  retryFailedVaultPunch,
  subscribePunchStatus,
  type QueuedTask,
  type VaultPunchEntry,
} from '../utils/offlineQueue';

const ACTION_LABELS: Record<string, string> = {
  CHECK_IN_OUT: 'Chấm công',
  UPLOAD_CHECKIN_IMAGE: 'Tải ảnh chấm công',
  SUBMIT_MISSED_CHECKIN: 'Đơn bổ sung công',
};

function formatVaultTime(ts?: number, fallback?: string): string {
  if (fallback && String(fallback).trim()) return String(fallback).trim();
  if (!ts || !Number.isFinite(ts)) return 'Không rõ thời gian';
  try {
    return new Date(ts).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return 'Không rõ thời gian';
  }
}

export default function SyncVaultDrawer({
  isOpen,
  onClose,
  isSyncing,
  lastSyncTime,
  onManualSync,
}: {
  isOpen: boolean;
  onClose: () => void;
  isSyncing: boolean;
  lastSyncTime?: number;
  onManualSync: () => void;
}) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [queueTasks, setQueueTasks] = useState<QueuedTask[]>(() => getQueue());
  const [pendingVault, setPendingVault] = useState<VaultPunchEntry[]>(() => getPendingVaultPunches());
  const [failedVault, setFailedVault] = useState<VaultPunchEntry[]>(() => getFailedVaultPunches());
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<string>('');
  const [prevOpen, setPrevOpen] = useState(isOpen);

  const reloadVaultSnapshot = useCallback(() => {
    setQueueTasks(getQueue());
    setPendingVault(getPendingVaultPunches());
    setFailedVault(getFailedVaultPunches());
  }, []);

  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setQueueTasks(getQueue());
      setPendingVault(getPendingVaultPunches());
      setFailedVault(getFailedVaultPunches());
    } else {
      setConfirmDiscardId(null);
      setStatusFeedback('');
    }
  }

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onQueueUpdate = () => reloadVaultSnapshot();
    window.addEventListener('kg:offline-queue-updated', onQueueUpdate);
    const unsubPunch = subscribePunchStatus(() => reloadVaultSnapshot());
    return () => {
      window.removeEventListener('kg:offline-queue-updated', onQueueUpdate);
      unsubPunch();
    };
  }, [isOpen, reloadVaultSnapshot]);

  const handleRetryFailed = (checkinId: string) => {
    const ok = retryFailedVaultPunch(checkinId);
    if (ok) {
      setStatusFeedback('Đã đưa bản ghi vào hàng đợi đồng bộ lại.');
      reloadVaultSnapshot();
    }
  };

  const handleDiscardFailed = (checkinId: string) => {
    if (confirmDiscardId !== checkinId) {
      setConfirmDiscardId(checkinId);
      return;
    }
    const ok = discardFailedVaultPunch(checkinId);
    setConfirmDiscardId(null);
    if (ok) {
      setStatusFeedback('Đã xóa bản ghi lỗi khỏi Vault cục bộ.');
      reloadVaultSnapshot();
    }
  };

  const queuedIds = new Set(queueTasks.map((t) => t.payload?.checkinId || t.id));
  const orphanPendingVault = pendingVault.filter((entry) => !queuedIds.has(entry.checkinId));
  const totalPending = queueTasks.length + orphanPendingVault.length;

  return (
    <KgBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Trạng thái Đồng bộ & Vault"
      subtitle="Theo dõi hàng đợi ngoại tuyến (kg_punch_vault_v1)"
      footer={
        <div className="flex items-center justify-between gap-2">
          <KgButton variant="secondary" size="sm" onClick={onClose} className="flex-1 sm:flex-initial">
            Đóng
          </KgButton>
          <KgButton
            variant="primary"
            size="sm"
            icon={RefreshCw}
            loading={isSyncing}
            disabled={!isOnline}
            className="flex-1 sm:flex-initial"
            onClick={() => {
              onManualSync();
              reloadVaultSnapshot();
            }}
          >
            {isOnline ? 'Đồng bộ ngay' : 'Đang ngoại tuyến'}
          </KgButton>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Connection & Sync Summary */}
        <div className="p-3.5 rounded-xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${
                !isOnline
                  ? 'bg-[var(--kg-danger-soft)] border-[var(--kg-danger)]/25 text-[var(--kg-danger)]'
                  : isSyncing
                    ? 'bg-[var(--kg-info-soft)] border-[var(--kg-info)]/25 text-[var(--kg-info)]'
                    : 'bg-[var(--kg-success-soft)] border-[var(--kg-success)]/25 text-[var(--kg-success)]'
              }`}
            >
              {!isOnline ? (
                <WifiOff size={18} />
              ) : isSyncing ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Wifi size={18} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-[var(--kg-text)] truncate">
                {!isOnline
                  ? 'Mất kết nối mạng (Ngoại tuyến)'
                  : isSyncing
                    ? 'Đang đồng bộ dữ liệu lên máy chủ...'
                    : 'Kết nối trực tuyến ổn định'}
              </p>
              <p className="text-[11px] text-[var(--kg-text-muted)] font-mono tabular-nums mt-0.5 truncate">
                {lastSyncTime
                  ? `Cập nhật lần cuối: ${new Date(lastSyncTime).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}`
                  : 'Chưa đồng bộ trong phiên này'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <KgStatusBadge variant={totalPending > 0 ? 'warning' : 'success'}>
              <span className="font-mono tabular-nums">{totalPending}</span> chờ
            </KgStatusBadge>
            {failedVault.length > 0 && (
              <KgStatusBadge variant="error">
                <span className="font-mono tabular-nums">{failedVault.length}</span> lỗi
              </KgStatusBadge>
            )}
          </div>
        </div>

        {statusFeedback && (
          <div className="px-3 py-2 rounded-xl bg-[var(--kg-info-soft)] border border-[var(--kg-info)]/25 text-xs font-semibold text-[var(--kg-info)]">
            {statusFeedback}
          </div>
        )}

        {/* Failed Vault Entries */}
        {failedVault.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--kg-danger)] flex items-center gap-1.5">
                <AlertTriangle size={14} />
                Bản ghi chấm công lỗi (<span className="font-mono tabular-nums">{failedVault.length}</span>)
              </h3>
            </div>
            <div className="space-y-2.5">
              {failedVault.map((entry) => {
                const isConfirmingDiscard = confirmDiscardId === entry.checkinId;
                return (
                  <div
                    key={entry.checkinId}
                    className="p-3.5 rounded-xl bg-[var(--kg-danger-soft)]/60 border border-[var(--kg-danger)]/25 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-[var(--kg-text)] truncate">
                          {entry.type || 'Chấm công'}{' '}
                          {entry.fullname ? `• ${entry.fullname}` : ''}
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] mt-0.5">
                          {formatVaultTime(entry.vaultSavedAt, entry.time)}
                        </p>
                      </div>
                      <KgStatusBadge variant="error">Thất bại</KgStatusBadge>
                    </div>

                    <p className="text-xs text-[var(--kg-text)] bg-[var(--kg-surface)] border border-[var(--kg-border)] rounded-lg px-2.5 py-2 leading-relaxed">
                      {entry.errorReason || 'Máy chủ từ chối hoặc quá số lần thử lại.'}
                    </p>

                    <div className="flex items-center justify-end gap-2">
                      <KgButton
                        size="sm"
                        variant={isConfirmingDiscard ? 'danger' : 'ghost'}
                        icon={Trash2}
                        onClick={() => handleDiscardFailed(entry.checkinId)}
                      >
                        {isConfirmingDiscard ? 'Xác nhận xóa' : 'Bỏ qua'}
                      </KgButton>
                      <KgButton
                        size="sm"
                        variant="primary"
                        icon={RotateCcw}
                        disabled={!isOnline}
                        onClick={() => handleRetryFailed(entry.checkinId)}
                      >
                        Thử lại
                      </KgButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Active Pending Queue & Vault */}
        {totalPending > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--kg-text-muted)] flex items-center gap-1.5">
              <Clock size={14} />
              Đang chờ đồng bộ (<span className="font-mono tabular-nums">{totalPending}</span>)
            </h3>
            <div className="space-y-2">
              {queueTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--kg-text)] truncate">
                      {ACTION_LABELS[task.action] || task.action}
                      {task.payload?.type ? ` • ${task.payload.type}` : ''}
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] mt-0.5 truncate">
                      {formatVaultTime(task.createdAt, task.payload?.time)} • Lần thử {task.attempts}/{task.maxAttempts}
                    </p>
                  </div>
                  <KgStatusBadge variant="warning">Đang chờ</KgStatusBadge>
                </div>
              ))}

              {orphanPendingVault.map((entry) => (
                <div
                  key={entry.checkinId}
                  className="p-3 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--kg-text)] truncate">
                      {entry.type || 'Chấm công Vault'}
                      {entry.fullname ? ` • ${entry.fullname}` : ''}
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-[var(--kg-text-muted)] mt-0.5 truncate">
                      {formatVaultTime(entry.vaultSavedAt, entry.time)}
                    </p>
                  </div>
                  <KgStatusBadge variant="info">Trong Vault</KgStatusBadge>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Clean Empty State */}
        {totalPending === 0 && failedVault.length === 0 && (
          <KgEmptyState
            icon={CheckCircle2}
            title="Tất cả dữ liệu đã đồng bộ"
            description="Hàng đợi ngoại tuyến và Vault chấm công hiện đang trống, không có bản ghi lỗi."
          />
        )}
      </div>
    </KgBottomSheet>
  );
}
