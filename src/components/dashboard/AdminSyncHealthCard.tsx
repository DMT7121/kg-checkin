import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cloud,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { callApi } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { kgToast } from '../../store/useFeedbackStore';
import { KgCard } from '../KgDesignSystem';

export interface SyncHealthData {
  d1Bound: boolean;
  r2Bound: boolean;
  unsyncedCheckins: number;
  pendingQueueTotal: number;
  pendingCheckins: number;
  pendingImages: number;
  pendingOther: number;
  oldestPendingAgeSec: number;
  isStaleAlert: boolean;
  lastError: string;
  recentUnsynced: Array<{
    id: string;
    username: string;
    fullname: string;
    type: string;
    time: string;
    createdAt: number;
  }>;
  timestamp: string;
}

function formatAgeVi(sec: number): string {
  if (!sec || sec <= 0) return '0s';
  if (sec < 60) return `${sec} giây`;
  const mins = Math.floor(sec / 60);
  if (mins < 60) return `${mins} phút`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}g ${remMins}p` : `${hrs} giờ`;
}

export default function AdminSyncHealthCard() {
  const currentUser = useAppStore((s) => s.currentUser);
  const [health, setHealth] = useState<SyncHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [draining, setDraining] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [settingTriggers, setSettingTriggers] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);

  const fetchHealth = useCallback(async (silent = false) => {
    if (!currentUser) return;
    if (!silent) setLoading(true);
    try {
      const res = await callApi(
        'GET_SYNC_HEALTH',
        { role: currentUser.role, username: currentUser.username },
        { background: true, cacheTtlMs: 0 }
      );
      if (res?.ok && res.data) {
        setHealth(res.data);
      }
    } catch {
      // Non-critical diagnostic fetch
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void fetchHealth(false);
    const timer = window.setInterval(() => {
      void fetchHealth(true);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [fetchHealth]);

  const handleForceDrain = async () => {
    if (!currentUser || draining) return;
    setDraining(true);
    try {
      const res = await callApi(
        'FORCE_DRAIN_SYNC_QUEUE',
        { role: currentUser.role, username: currentUser.username },
        { background: true, cacheTtlMs: 0, timeoutMs: 30000 }
      );
      if (res?.ok) {
        if (res.data?.health) setHealth(res.data.health);
        else void fetchHealth(true);
        kgToast(res.message || 'Đã đồng bộ hàng đợi lên Google Sheet.', 'success', 'Đồng bộ hoàn tất');
      } else {
        kgToast(res?.message || 'Không thể xả hàng đợi ngay lúc này.', 'error', 'Lỗi đồng bộ');
      }
    } finally {
      setDraining(false);
    }
  };

  const handleReconcile48h = async () => {
    if (!currentUser || reconciling) return;
    setReconciling(true);
    try {
      const res = await callApi(
        'RUN_D1_SHEET_RECONCILIATION',
        { role: currentUser.role, username: currentUser.username, actorUsername: currentUser.username, hours: 48 },
        { background: true, cacheTtlMs: 0, timeoutMs: 35000 }
      );
      if (res?.ok) {
        void fetchHealth(true);
        kgToast(res.message || 'Đối soát D1 ↔ Google Sheet 48h hoàn tất.', 'success', 'Đối soát 48h');
      } else {
        kgToast(res?.message || 'Lỗi đối soát D1 ↔ Sheet.', 'error', 'Lỗi đối soát');
      }
    } finally {
      setReconciling(false);
    }
  };

  const handleArchiveOldRows = async () => {
    if (!currentUser || archiving) return;
    setArchiving(true);
    try {
      const res = await callApi(
        'ARCHIVE_OLD_CHECKIN_SHEETS',
        { role: currentUser.role, username: currentUser.username, keepDays: 45 },
        { background: true, cacheTtlMs: 0, timeoutMs: 35000 }
      );
      if (res?.ok) {
        kgToast(res.message || 'Đã lưu trữ cuốn chiếu Sheet ✔️CHẤM CÔNG (>45 ngày).', 'success', 'Lưu trữ Sheet');
      } else {
        kgToast(res?.message || 'Không thể lưu trữ Sheet lúc này.', 'error', 'Lỗi lưu trữ');
      }
    } finally {
      setArchiving(false);
    }
  };

  const handleSetupTriggers = async () => {
    if (!currentUser || settingTriggers) return;
    setSettingTriggers(true);
    try {
      const res = await callApi(
        'SETUP_ATTENDANCE_TRIGGERS',
        { role: currentUser.role, username: currentUser.username },
        { background: true, cacheTtlMs: 0, timeoutMs: 25000 }
      );
      if (res?.ok) {
        kgToast(
          'Đã bật tự động: Quét đồng bộ 5 phút, Đối soát 05:00 sáng & Lưu trữ tháng ngày mùng 5.',
          'success',
          'Trigger Tự Động Hóa'
        );
      } else {
        kgToast(res?.message || 'Không thể thiết lập Trigger GAS.', 'error', 'Lỗi Trigger');
      }
    } finally {
      setSettingTriggers(false);
    }
  };

  const unsyncedCount = health?.unsyncedCheckins ?? 0;
  const pendingImages = health?.pendingImages ?? 0;
  const totalPending = health?.pendingQueueTotal ?? 0;
  const isStale = Boolean(health?.isStaleAlert);
  const isAllClean = health !== null && unsyncedCount === 0 && totalPending === 0;

  return (
    <KgCard
      className={`kg-animate-fade-up p-4 sm:p-5 transition-colors ${
        isStale
          ? 'border-[var(--kg-danger)]/45 bg-[var(--kg-danger-soft)]/25'
          : unsyncedCount > 0 || totalPending > 0
          ? 'border-[var(--kg-warning)]/40 bg-[var(--kg-warning-soft)]/20'
          : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isStale
                ? 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)]'
                : unsyncedCount > 0 || totalPending > 0
                ? 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)]'
                : 'bg-[var(--kg-success-soft)] text-[var(--kg-success)]'
            }`}
          >
            {isStale ? (
              <AlertTriangle size={18} />
            ) : isAllClean ? (
              <CheckCircle2 size={18} />
            ) : (
              <Database size={18} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-extrabold text-[var(--kg-text)] tracking-tight">
                Sức Khỏe Đồng Bộ Sheet &amp; R2
              </h3>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                  isStale
                    ? 'bg-[var(--kg-danger-soft)] text-[var(--kg-danger)] border-[var(--kg-danger)]/30'
                    : unsyncedCount > 0 || totalPending > 0
                    ? 'bg-[var(--kg-warning-soft)] text-[var(--kg-warning)] border-[var(--kg-warning)]/30'
                    : 'bg-[var(--kg-success-soft)] text-[var(--kg-success)] border-[var(--kg-success)]/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isStale
                      ? 'bg-[var(--kg-danger)] animate-ping'
                      : unsyncedCount > 0 || totalPending > 0
                      ? 'bg-[var(--kg-warning)] animate-pulse'
                      : 'bg-[var(--kg-success)]'
                  }`}
                />
                {health === null
                  ? 'Đang kiểm tra...'
                  : isStale
                  ? `Cảnh báo kẹt ${formatAgeVi(health.oldestPendingAgeSec)}`
                  : isAllClean
                  ? '100% Đã lên Sheet'
                  : `${unsyncedCount} lượt • ${pendingImages} ảnh đang chờ`}
              </span>
              {health?.r2Bound && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--kg-info-soft)] text-[var(--kg-info)] border border-[var(--kg-info)]/25">
                  <HardDrive size={10} />
                  Ảnh Cloudflare R2
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--kg-text-muted)] mt-0.5 leading-snug">
              {isAllClean
                ? 'Toàn bộ lượt chấm công trong D1 đã ghi an toàn vào Google Sheet ✔️CHẤM CÔNG.'
                : health?.lastError
                ? `Lỗi gần nhất: ${health.lastError}`
                : 'Tự động gom lô BATCH_CHECK_IN_OUT & quét xả định kỳ không bỏ sót lượt.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleForceDrain}
            disabled={draining}
            className="kg-pressable min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--kg-primary)] hover:brightness-95 text-[var(--kg-primary-foreground,#fff)] font-extrabold text-xs inline-flex items-center gap-1.5 disabled:opacity-60 touch-manipulation whitespace-nowrap"
          >
            {draining ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            <span>Đồng bộ ngay</span>
          </button>
          <button
            type="button"
            onClick={handleReconcile48h}
            disabled={reconciling}
            className="kg-pressable min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text)] font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-60 touch-manipulation whitespace-nowrap"
          >
            {reconciling ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            <span>Đối soát 48h</span>
          </button>
          <button
            type="button"
            onClick={() => void fetchHealth(false)}
            disabled={loading}
            aria-label="Làm mới trạng thái đồng bộ"
            className="kg-pressable min-h-[38px] w-[38px] rounded-xl bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text-muted)] flex items-center justify-center touch-manipulation"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Pending list if any check-ins are buffered in D1 */}
      {health && health.recentUnsynced.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--kg-border)] space-y-1.5">
          <p className="text-[11px] font-bold text-[var(--kg-text-muted)]">
            Lượt đang chờ ghi lên Sheet ({health.recentUnsynced.length}):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {health.recentUnsynced.slice(0, 6).map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[11px] font-semibold text-[var(--kg-text)]"
              >
                <Cloud size={11} className="text-[var(--kg-warning)]" />
                <span>{item.fullname}</span>
                <span className="text-[var(--kg-text-muted)] font-mono tabular-nums">
                  {item.type} · {String(item.time || '').split(' ').pop()?.slice(0, 5)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Maintenance Strip: Monthly Rolling Archive & GAS Triggers */}
      <div className="mt-3 pt-2.5 border-t border-[var(--kg-border)] flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowMaintenance((v) => !v)}
          className="text-[11px] font-bold text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] inline-flex items-center gap-1.5 touch-manipulation"
        >
          <Sparkles size={12} className="text-[var(--kg-primary-ink)]" />
          <span>{showMaintenance ? 'Ẩn công cụ bảo trì tự động ▲' : 'Bảo trì Sheet & Trigger tự động ▼'}</span>
        </button>

        {showMaintenance && (
          <div className="w-full flex flex-wrap items-center gap-2 pt-1.5">
            <button
              type="button"
              onClick={handleArchiveOldRows}
              disabled={archiving}
              className="kg-pressable min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text)] font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-60 touch-manipulation"
            >
              {archiving ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
              <span>Lưu trữ Sheet cũ (&gt;45 ngày)</span>
            </button>
            <button
              type="button"
              onClick={handleSetupTriggers}
              disabled={settingTriggers}
              className="kg-pressable min-h-[36px] px-3 py-1.5 rounded-xl bg-[var(--kg-surface-2)] hover:bg-[var(--kg-surface)] border border-[var(--kg-border)] text-[var(--kg-text)] font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-60 touch-manipulation"
            >
              {settingTriggers ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              <span>Bật Trigger GAS (5p / 05:00 / Tháng)</span>
            </button>
          </div>
        )}
      </div>
    </KgCard>
  );
}
