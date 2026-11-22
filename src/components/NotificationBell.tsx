import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, Info, AlertTriangle, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { callApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { KgBottomSheet } from './KgDesignSystem';
import type { TabId } from '../types/navigation';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'success' | 'action';
  link: string;
  isRead: boolean;
  createdAt: string;
}

function formatNotificationTime(timeStr?: string): string {
  if (!timeStr) return '';
  try {
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) {
      return timeStr;
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24 && now.getDate() === date.getDate()) {
      const hours = String(date.getHours()).padStart(2, '0');
      const mins = String(date.getMinutes()).padStart(2, '0');
      return `Hôm nay ${hours}:${mins}`;
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month} ${hours}:${mins}`;
  } catch {
    return timeStr;
  }
}

// Shared singleton state so remounting across responsive breakpoints never duplicates polling
let sharedNotifications: Notification[] = [];
let sharedUnreadCount: number = parseInt(localStorage.getItem('kg_notif_unread') || '0', 10) || 0;
let sharedHasFetched = false;
let lastPollAtMs = 0;
let activeFetchPromise: Promise<void> | null = null;
const bellSubscribers = new Set<() => void>();

function notifyBellSubscribers() {
  bellSubscribers.forEach((listener) => listener());
}

export default function NotificationBell() {
  const currentUser = useAppStore((s) => s.currentUser);
  const setCurrentTab = useAppStore((s) => s.setCurrentTab);
  const [notifications, setNotifications] = useState<Notification[]>(sharedNotifications);
  const [unreadCount, setUnreadCount] = useState<number>(sharedUnreadCount);
  const [isOpen, setIsOpen] = useState(false);
  const [hasFetched, setHasFetched] = useState(sharedHasFetched);

  useEffect(() => {
    const syncFromShared = () => {
      setNotifications(sharedNotifications);
      setUnreadCount(sharedUnreadCount);
      setHasFetched(sharedHasFetched);
    };
    bellSubscribers.add(syncFromShared);
    syncFromShared();
    return () => {
      bellSubscribers.delete(syncFromShared);
    };
  }, []);

  const fetchNotifications = useCallback(async (force = false) => {
    if (!currentUser || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
    const now = Date.now();
    if (!force && now - lastPollAtMs < 110000) return;
    if (activeFetchPromise) return activeFetchPromise;

    lastPollAtMs = now;
    activeFetchPromise = (async () => {
      try {
        const res = await callApi('GET_NOTIFICATIONS', { username: currentUser.username }, { background: true });
        if (res?.ok) {
          sharedNotifications = res.data.notifications || [];
          sharedUnreadCount = res.data.unreadCount || 0;
          sharedHasFetched = true;
          try {
            localStorage.setItem('kg_notif_unread', String(sharedUnreadCount));
          } catch { /* ignore */ }
          notifyBellSubscribers();
        }
      } finally {
        activeFetchPromise = null;
      }
    })();

    return activeFetchPromise;
  }, [currentUser]);

  // Poll every 2 minutes (deduplicated) and lazy-fetch on open
  useEffect(() => {
    const interval = setInterval(() => {
      fetchNotifications(false);
    }, 120000);
    return () => clearInterval(interval);
  }, [currentUser?.username, fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    await callApi('MARK_NOTIFICATION_READ', { notificationId: id, username: currentUser?.username }, { background: true });
    sharedNotifications = sharedNotifications.map(n => n.id === id ? { ...n, isRead: true } : n);
    sharedUnreadCount = Math.max(0, sharedUnreadCount - 1);
    try {
      localStorage.setItem('kg_notif_unread', String(sharedUnreadCount));
    } catch { /* ignore */ }
    notifyBellSubscribers();
  };

  const handleMarkAllRead = async () => {
    await callApi('MARK_NOTIFICATION_READ', { markAll: true, username: currentUser?.username }, { background: true });
    sharedNotifications = sharedNotifications.map(n => ({ ...n, isRead: true }));
    sharedUnreadCount = 0;
    try {
      localStorage.setItem('kg_notif_unread', '0');
    } catch { /* ignore */ }
    notifyBellSubscribers();
  };

  const typeConfig: Record<string, { icon: typeof Info; color: string; bg: string; border: string }> = {
    info: { icon: Info, color: 'text-[var(--kg-info)]', bg: 'bg-[var(--kg-info-soft)]', border: 'border-[var(--kg-info)]/25' },
    warning: { icon: AlertTriangle, color: 'text-[var(--kg-warning)]', bg: 'bg-[var(--kg-warning-soft)]', border: 'border-[var(--kg-warning)]/25' },
    success: { icon: CheckCircle2, color: 'text-[var(--kg-success)]', bg: 'bg-[var(--kg-success-soft)]', border: 'border-[var(--kg-success)]/25' },
    action: { icon: ArrowRight, color: 'text-[var(--kg-primary-ink)]', bg: 'bg-[var(--kg-primary-soft)]', border: 'border-[var(--kg-border)]' },
  };

  return (
    <div className="relative inline-flex">
      {/* Bell Trigger Button (44px mobile/tablet, 36px desktop masthead) */}
      <button
        type="button"
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          if (nextOpen && !hasFetched) {
            fetchNotifications(true);
          }
        }}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="relative w-11 h-11 min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 lg:w-10 lg:h-10 rounded-[11px] border border-[var(--kg-border)] bg-[var(--kg-surface)] flex items-center justify-center text-[var(--kg-text)] hover:bg-[var(--kg-surface-soft)] hover:border-[var(--kg-border-strong)] active:scale-95 transition-colors shadow-xs touch-manipulation"
        aria-label="Thông báo"
        title="Thông báo hệ thống"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] flex items-center justify-center bg-[var(--kg-danger)] text-white dark:text-[#23170F] text-[10px] font-black font-mono tabular-nums rounded-full px-1 shadow-md border-2 border-[var(--kg-surface)] animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Sheet hosted on KgBottomSheet (z-[10050] + full useDialogA11y) */}
      <KgBottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Thông báo hệ thống"
        subtitle={
          unreadCount > 0
            ? `Bạn có ${unreadCount} thông báo chưa đọc`
            : 'Cập nhật mới nhất từ ca trực và quản lý'
        }
        footer={
          <div className="flex items-center justify-between gap-2">
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-[var(--kg-primary-ink)] font-bold hover:underline flex items-center gap-1.5 px-3 py-2 min-h-[44px] sm:min-h-[36px] rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] active:scale-95 transition-colors whitespace-nowrap"
              >
                <CheckCheck size={14} /> Đọc hết ({unreadCount})
              </button>
            ) : (
              <span className="text-xs text-[var(--kg-text-soft)] font-medium">
                Đã đọc tất cả thông báo
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 min-h-[44px] sm:min-h-[36px] rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-text)] active:scale-95 transition-all whitespace-nowrap"
            >
              Đóng
            </button>
          </div>
        }
      >
        {notifications.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[var(--kg-surface-soft)] border border-[var(--kg-border)] flex items-center justify-center mx-auto text-[var(--kg-text-muted)]">
              <Sparkles size={22} />
            </div>
            <p className="text-sm font-bold text-[var(--kg-text)]">Chưa có thông báo nào</p>
            <p className="text-xs text-[var(--kg-text-muted)]">
              Bạn đã cập nhật mọi thông tin mới nhất của ca trực.
            </p>
          </div>
        ) : (
          <div className="-mx-4 sm:-mx-5 -my-4 divide-y divide-[var(--kg-border)]">
            {notifications.map((n) => {
              const config = typeConfig[n.type] || typeConfig.info;
              const IconComp = config.icon;
              return (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => {
                    if (!n.isRead) handleMarkRead(n.id);
                    if (n.link) {
                      const rawLink = n.link.trim();
                      let targetTab = rawLink;
                      let targetSub = '';
                      if (rawLink.includes('?') || rawLink.includes('=')) {
                        const queryStr = rawLink.includes('?')
                          ? rawLink.slice(rawLink.indexOf('?') + 1)
                          : rawLink;
                        const params = new URLSearchParams(queryStr);
                        targetTab = params.get('tab') || '';
                        targetSub = params.get('sub') || '';
                      }
                      if (targetTab) {
                        if (targetSub) {
                          try {
                            sessionStorage.setItem(`kg_hub_subtab_${targetTab}`, targetSub);
                          } catch { /* ignore */ }
                        }
                        setCurrentTab(targetTab as TabId);
                        if (targetSub) {
                          window.setTimeout(() => {
                            window.dispatchEvent(
                              new CustomEvent('kg:subtab-select', {
                                detail: { hub: targetTab, subTab: targetSub },
                              })
                            );
                          }, 30);
                        }
                        setIsOpen(false);
                      }
                    }
                  }}
                  className={`w-full text-left flex items-start gap-3 px-4 sm:px-5 py-3.5 min-h-[44px] cursor-pointer transition-colors ${
                    n.isRead
                      ? 'opacity-75 hover:opacity-100 hover:bg-[var(--kg-surface-soft)]'
                      : 'bg-[var(--kg-primary-soft)]/70 hover:bg-[var(--kg-surface-soft)]'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border ${config.bg} ${config.border}`}>
                    <IconComp size={15} className={config.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-extrabold truncate ${n.isRead ? 'text-[var(--kg-text-muted)]' : 'text-[var(--kg-text)]'}`}>
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-[var(--kg-primary-ink)] flex-shrink-0 animate-pulse" />
                      )}
                    </div>
                    <p className="text-[11.5px] text-[var(--kg-text-muted)] line-clamp-2 mt-0.5 leading-relaxed font-medium">
                      {n.body}
                    </p>
                    <p className="text-[10.5px] font-semibold font-mono tabular-nums text-[var(--kg-text-soft)] mt-1">
                      {formatNotificationTime(n.createdAt)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </KgBottomSheet>
    </div>
  );
}
