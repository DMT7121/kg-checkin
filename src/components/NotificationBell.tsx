import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, Info, AlertTriangle, CheckCircle2, ArrowRight, X, Sparkles } from 'lucide-react';
import { callApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';

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

// Shared singleton state across mobile & desktop NotificationBell instances to prevent duplicate polling
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
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Only poll every 2 minutes (deduplicated across instances), and lazy-fetch on open
  useEffect(() => {
    const interval = setInterval(() => {
      fetchNotifications(false);
    }, 120000);
    return () => clearInterval(interval);
  }, [currentUser?.username, fetchNotifications]);

  // Close dropdown on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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

  const typeConfig: Record<string, { icon: any; color: string; bg: string; border: string }> = {
    info: { icon: Info, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-200 dark:border-blue-900/30' },
    warning: { icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-900/30' },
    success: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-900/30' },
    action: { icon: ArrowRight, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-200 dark:border-indigo-900/30' },
  };

  return (
    <div ref={dropdownRef} className="relative inline-flex">
      {/* Bell Button */}
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
        className="relative w-10 h-10 rounded-xl border border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] active:scale-95 transition-all shadow-sm"
        aria-label="Thông báo"
        title="Thông báo hệ thống"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] flex items-center justify-center bg-red-500 text-white text-[10px] font-black rounded-full px-1 shadow-md border-2 border-[var(--kg-surface)] animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Centered Viewport Modal via Portal so it is never clipped by sidebar or mobile containers */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10070] flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div
            className="fixed inset-0 bg-black/55 backdrop-blur-xs"
            onClick={() => setIsOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Thông báo hệ thống"
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-md max-h-[82dvh] sm:max-h-[78vh] mx-auto bg-[var(--kg-surface)] rounded-2xl sm:rounded-3xl shadow-2xl border border-[var(--kg-border)] flex flex-col overflow-hidden text-[var(--kg-text)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <Bell size={16} />
                </div>
                <h3 className="font-extrabold text-sm tracking-tight text-[var(--kg-text)] flex items-center gap-1.5">
                  Thông báo hệ thống
                  {unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
                      {unreadCount}
                    </span>
                  )}
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button 
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-xs text-blue-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] active:scale-95 transition-all"
                  >
                    <CheckCheck size={14} /> Đọc hết
                  </button>
                )}
                <button 
                  type="button"
                  onClick={() => setIsOpen(false)} 
                  className="w-9 h-9 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] flex items-center justify-center text-[var(--kg-text-muted)] hover:text-[var(--kg-text)] active:scale-95 transition-all"
                  aria-label="Đóng"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Notification List */}
            <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-[var(--kg-border)]">
              {notifications.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--kg-surface-soft)] flex items-center justify-center mx-auto text-[var(--kg-text-muted)]">
                    <Sparkles size={24} />
                  </div>
                  <p className="text-sm font-bold text-[var(--kg-text)]">Chưa có thông báo nào</p>
                  <p className="text-xs text-[var(--kg-text-muted)]">Bạn đã cập nhật mọi thông tin mới nhất của ca trực.</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const config = typeConfig[n.type] || typeConfig.info;
                  const IconComp = config.icon;
                  return (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (!n.isRead) handleMarkRead(n.id);
                        if (n.link) {
                          const cleanLink = n.link.replace(/^\?tab=/, '').trim();
                          if (cleanLink) {
                            setCurrentTab(cleanLink as any);
                            setIsOpen(false);
                          }
                        }
                      }}
                      className={`flex items-start gap-3 p-3.5 cursor-pointer transition-all ${
                        n.isRead 
                          ? 'opacity-65 hover:opacity-100 hover:bg-[var(--kg-surface-soft)]' 
                          : 'bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-100/40 dark:hover:bg-blue-900/30'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border ${config.bg} ${config.border}`}>
                        <IconComp size={15} className={config.color} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-xs font-black truncate ${n.isRead ? 'text-[var(--kg-text-muted)]' : 'text-[var(--kg-text)]'}`}>
                            {n.title}
                          </p>
                          {!n.isRead && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 animate-pulse" />
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--kg-text-muted)] line-clamp-2 mt-0.5 leading-relaxed font-medium">
                          {n.body}
                        </p>
                        <p className="text-[10px] font-semibold text-[var(--kg-text-muted)]/80 mt-1">
                          {formatNotificationTime(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Close Button for Easy Mobile Thumb Access */}
            <div className="px-4 py-2.5 border-t border-[var(--kg-border)] bg-[var(--kg-surface-soft)] flex justify-end flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-xl bg-[var(--kg-surface)] border border-[var(--kg-border)] text-xs font-bold text-[var(--kg-text)] active:scale-95 transition-all"
              >
                Đóng thông báo
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
