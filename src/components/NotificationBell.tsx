import { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, Info, AlertTriangle, CheckCircle2, ArrowRight, X } from 'lucide-react';
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

export default function NotificationBell() {
  const store = useAppStore();
  const { currentUser } = store;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    if (!currentUser) return;
    const res = await callApi('GET_NOTIFICATIONS', { username: currentUser.username }, { background: true });
    if (res?.ok) {
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, [currentUser?.username]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleMarkRead = async (id: string) => {
    await callApi('MARK_NOTIFICATION_READ', { notificationId: id, username: currentUser?.username }, { background: true });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    await callApi('MARK_NOTIFICATION_READ', { markAll: true, username: currentUser?.username }, { background: true });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const typeConfig: Record<string, { icon: any; color: string; bg: string }> = {
    info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    success: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
    action: { icon: ArrowRight, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Bell size={22} className="text-gray-600 dark:text-gray-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-black rounded-full px-1 animate-pulse shadow-md">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
            <h3 className="font-bold text-sm text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <Bell size={14} /> Thông báo
              {unreadCount > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button 
                  onClick={handleMarkAllRead}
                  className="text-[10px] text-ocean-600 dark:text-ocean-400 font-bold hover:underline flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-ocean-50 dark:hover:bg-ocean-900/20"
                >
                  <CheckCheck size={12} /> Đọc hết
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
                <X size={14} className="text-gray-400" />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="overflow-y-auto max-h-[55vh]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-400">Chưa có thông báo</p>
              </div>
            ) : (
              notifications.map((n) => {
                const config = typeConfig[n.type] || typeConfig.info;
                const IconComp = config.icon;
                return (
                  <div
                    key={n.id}
                    onClick={() => { if (!n.isRead) handleMarkRead(n.id); }}
                    className={`flex items-start gap-3 p-3 border-b border-gray-50 dark:border-gray-700/50 last:border-0 cursor-pointer transition-colors ${
                      n.isRead 
                        ? 'bg-white dark:bg-gray-800 opacity-60' 
                        : 'bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bg}`}>
                      <IconComp size={14} className={config.color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-bold truncate ${n.isRead ? 'text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                        {n.title}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5 leading-relaxed">{n.body}</p>
                      <p className="text-[9px] text-gray-400 mt-1">{n.createdAt}</p>
                    </div>
                    {!n.isRead && (
                      <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
