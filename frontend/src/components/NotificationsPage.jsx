import { useState, useEffect, useMemo } from 'react';
import { getNotificationHistory, markNotificationRead, markAllNotificationsRead } from '../services/productService';
import { setNotificationsOn, setSchedulerTime } from '../services/notificationService';
import { useAuth } from '../contexts/AuthContext';
import { Bell, BellOff, CheckCheck, AlertTriangle, Clock, XCircle, RefreshCw, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const TYPE_CONFIG = {
  expired:  { badge: 'bg-red-100 text-red-700 border-red-200',    icon: XCircle,       iconColor: 'text-red-500',    label: 'Expired' },
  critical: { badge: 'bg-orange-100 text-orange-700 border-orange-200', icon: AlertTriangle, iconColor: 'text-orange-500', label: 'Critical' },
  urgent:   { badge: 'bg-amber-100 text-amber-700 border-amber-200',    icon: AlertTriangle, iconColor: 'text-amber-500',  label: 'Urgent' },
  reminder: { badge: 'bg-blue-100 text-blue-700 border-blue-200',   icon: Clock,         iconColor: 'text-blue-500',   label: 'Reminder' },
};

export default function NotificationsPage() {
  const { user, setUser } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifOn, setNotifOn] = useState(() => {
    const stored = localStorage.getItem('expiryNotifier_notificationsOn');
    return stored === null ? true : stored === 'true';
  });
  const [hour, setHour] = useState(user?.notification_time?.hour ?? 6);
  const [minute, setMinute] = useState(user?.notification_time?.minute ?? 0);
  const [savingTime, setSavingTime] = useState(false);

  const loadNotifs = async () => {
    setLoading(true);
    try {
      const data = await getNotificationHistory();
      setNotifications(data);
    } catch {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifs();
    if (user?.notification_time) {
      setHour(user.notification_time.hour);
      setMinute(user.notification_time.minute);
    }
  }, [user]);

  const handleToggleNotif = async () => {
    const next = !notifOn;
    setNotifOn(next);
    localStorage.setItem('expiryNotifier_notificationsOn', next);
    await setNotificationsOn(next).catch(() => {});
    toast.success(next ? 'Notifications enabled' : 'Notifications disabled');
  };

  const handleSaveTime = async () => {
    if (hour === '' || minute === '' || isNaN(Number(hour)) || isNaN(Number(minute))) {
      toast.error('Please enter a valid time');
      return;
    }
    setSavingTime(true);
    try {
      await setSchedulerTime(hour, minute);
      setUser({ ...user, notification_time: { hour: Number(hour), minute: Number(minute) } });
      toast.success('Notification time saved!');
    } catch {
      toast.error('Failed to save time');
    } finally {
      setSavingTime(false);
    }
  };

  const handleMarkRead = async (id) => {
    await markNotificationRead(id).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead().catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success('All notifications marked as read');
  };

  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Notifications</h1>
          <p className="text-slate-500 text-sm sm:text-base mt-1.5">Expiry alerts and reminder history for your items.</p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors">
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          )}
          <button onClick={loadNotifs} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Preferences Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Notification Preferences</h2>
        </div>
        <div className="p-6 flex flex-col sm:flex-row gap-6 items-start sm:items-center">
          {/* Toggle */}
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${notifOn ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200'}`}>
              {notifOn ? <Bell className="h-5 w-5 text-indigo-600" /> : <BellOff className="h-5 w-5 text-slate-400" />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Email Notifications</p>
              <p className="text-xs text-slate-500">Receive expiry alerts via email</p>
            </div>
            <button
              onClick={handleToggleNotif}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${notifOn ? 'bg-indigo-600' : 'bg-slate-200'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${notifOn ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Time picker */}
          <div className="flex items-center gap-3 sm:ml-auto">
            <div>
              <p className="text-xs font-bold text-slate-700 mb-1.5">Email time</p>
              <div className="flex items-center gap-2">
                <input type="number" min="0" max="23" value={hour}
                  onChange={e => setHour(Math.max(0, Math.min(23, Number(e.target.value))))}
                  className="w-14 text-center border border-slate-300 rounded-lg py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none" />
                <span className="text-slate-400 font-bold">:</span>
                <input type="number" min="0" max="59" value={minute}
                  onChange={e => setMinute(Math.max(0, Math.min(59, Number(e.target.value))))}
                  className="w-14 text-center border border-slate-300 rounded-lg py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none" />
                <button onClick={handleSaveTime} disabled={savingTime}
                  className="px-3 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm">
                  {savingTime ? '...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800">
            {unreadCount > 0 ? <span className="text-indigo-600">{unreadCount} unread</span> : 'All notifications'}
          </h2>
          <span className="text-xs text-slate-500">{notifications.length} total alerts</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div>
        ) : notifications.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
            <Bell className="mx-auto h-14 w-14 text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-700">All clear!</h3>
            <p className="text-slate-500 text-sm mt-1">No notifications — all your items are safe.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map(notif => {
              const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.reminder;
              const NIcon = cfg.icon;
              return (
                <div key={notif.id}
                  className={`bg-white border rounded-2xl px-5 py-4 shadow-sm flex items-start gap-4 transition-all ${notif.is_read ? 'opacity-70 border-slate-200' : 'border-indigo-200 ring-1 ring-indigo-100'}`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${notif.is_read ? 'bg-slate-50 border-slate-200' : 'bg-indigo-50 border-indigo-200'}`}>
                    <NIcon className={`h-4 w-4 ${notif.is_read ? 'text-slate-400' : cfg.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${cfg.badge}`}>{cfg.label}</span>
                      {!notif.is_read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />}
                    </div>
                    <p className="text-sm font-medium text-slate-700">{notif.message}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{notif.category} · {notif.expiry_date}</p>
                  </div>
                  {!notif.is_read && (
                    <button onClick={() => handleMarkRead(notif.id)}
                      className="shrink-0 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Mark as read">
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
