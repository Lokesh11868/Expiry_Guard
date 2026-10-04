import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { updateUserProfile } from '../services/productService';
import { setNotificationsOn, setSchedulerTime } from '../services/notificationService';
import { User, Bell, Settings, LogOut, Save, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

const Section = ({ icon: Icon, title, children }) => (
  <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
      <div className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center">
        <Icon className="h-4 w-4 text-slate-600" />
      </div>
      <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide">{title}</h2>
    </div>
    <div className="p-6 space-y-5">{children}</div>
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
    {children}
  </div>
);

export default function SettingsPage() {
  const { user, setUser, logout } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [notifOn, setNotifOn] = useState(() => {
    const stored = localStorage.getItem('expiryNotifier_notificationsOn');
    return stored === null ? true : stored === 'true';
  });
  const [hour, setHour] = useState(user?.notification_time?.hour ?? 6);
  const [minute, setMinute] = useState(user?.notification_time?.minute ?? 0);
  const [warningDays, setWarningDays] = useState(user?.default_warning_days ?? 7);
  const [saving, setSaving] = useState({ profile: false, notif: false, time: false });

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      if (user.notification_time) {
        setHour(user.notification_time.hour);
        setMinute(user.notification_time.minute);
      }
      if (user.default_warning_days) setWarningDays(user.default_warning_days);
    }
  }, [user]);

  const save = (key) => async (fn) => {
    setSaving(s => ({ ...s, [key]: true }));
    try {
      await fn();
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  };

  const handleSaveProfile = async () => {
    await save('profile')(async () => {
      await updateUserProfile({ username });
      setUser({ ...user, username });
      toast.success('Profile updated');
    });
  };

  const handleToggleNotif = async () => {
    const next = !notifOn;
    setNotifOn(next);
    localStorage.setItem('expiryNotifier_notificationsOn', next);
    await setNotificationsOn(next).catch(() => {});
    toast.success(next ? 'Notifications enabled' : 'Notifications disabled');
  };

  const handleSaveTime = async () => {
    if (isNaN(Number(hour)) || isNaN(Number(minute))) return toast.error('Invalid time');
    await save('time')(async () => {
      await setSchedulerTime(Number(hour), Number(minute));
      setUser({ ...user, notification_time: { hour: Number(hour), minute: Number(minute) } });
      toast.success('Notification time saved!');
    });
  };

  const handleSaveWarning = async () => {
    await save('notif')(async () => {
      await updateUserProfile({ default_warning_days: Number(warningDays) });
      setUser({ ...user, default_warning_days: Number(warningDays) });
      toast.success('Default warning period saved');
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-slate-500 text-sm sm:text-base mt-1.5">Manage your profile and application preferences.</p>
      </div>

      {/* Profile */}
      <Section icon={User} title="Profile">
        <Field label="Username">
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none shadow-sm"
          />
        </Field>
        <Field label="Email Address">
          <p className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600 font-medium">{user?.email}</p>
          <p className="text-[11px] text-slate-400 mt-1">Email address cannot be changed.</p>
        </Field>
        <button onClick={handleSaveProfile} disabled={saving.profile}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm">
          <Save className="h-4 w-4" />
          {saving.profile ? 'Saving...' : 'Save Profile'}
        </button>
      </Section>

      {/* Notifications */}
      <Section icon={Bell} title="Notification Settings">
        <Field label="Email Notifications">
          <div className="flex items-center gap-4">
            <button onClick={handleToggleNotif}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${notifOn ? 'bg-indigo-600' : 'bg-slate-200'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${notifOn ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm font-medium text-slate-700">{notifOn ? 'Enabled' : 'Disabled'}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Receive expiry reminders via email using your configured Brevo integration.</p>
        </Field>

        <Field label="Daily Email Time">
          <div className="flex items-center gap-2">
            <input type="number" min="0" max="23" value={hour}
              onChange={e => setHour(Math.max(0, Math.min(23, Number(e.target.value))))}
              className="w-16 text-center border border-slate-300 rounded-lg py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none shadow-sm" />
            <span className="text-slate-500 font-bold text-lg">:</span>
            <input type="number" min="0" max="59" value={minute}
              onChange={e => setMinute(Math.max(0, Math.min(59, Number(e.target.value))))}
              className="w-16 text-center border border-slate-300 rounded-lg py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none shadow-sm" />
            <span className="text-xs text-slate-400 ml-1">(24-hour format)</span>
          </div>
          <button onClick={handleSaveTime} disabled={saving.time}
            className="mt-3 flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm">
            <Save className="h-4 w-4" />
            {saving.time ? 'Saving...' : 'Save Time'}
          </button>
        </Field>
      </Section>

      {/* Expiry Settings */}
      <Section icon={Settings} title="Expiry Settings">
        <Field label="Default Warning Period (days)">
          <div className="flex items-center gap-3">
            <input type="number" min="1" max="365" value={warningDays}
              onChange={e => setWarningDays(Math.max(1, Math.min(365, Number(e.target.value))))}
              className="w-24 text-center border border-slate-300 rounded-lg py-2 text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none shadow-sm" />
            <span className="text-sm text-slate-500">days before expiry</span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">Items expiring within this period will be flagged in Needs Attention.</p>
          <button onClick={handleSaveWarning} disabled={saving.notif}
            className="mt-3 flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-sm">
            <Save className="h-4 w-4" />
            {saving.notif ? 'Saving...' : 'Save Setting'}
          </button>
        </Field>
      </Section>

      {/* Account */}
      <Section icon={Shield} title="Account">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-700">{user?.username}</p>
            <p className="text-xs text-slate-500">{user?.email}</p>
          </div>
          <button onClick={logout}
            className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 text-rose-600 border border-rose-200 text-sm font-semibold rounded-lg hover:bg-rose-100 transition-colors">
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </Section>
    </div>
  );
}
