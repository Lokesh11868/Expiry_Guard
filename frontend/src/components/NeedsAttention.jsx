import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getNeedsAttention, updateActionStatus } from '../services/productService';
import { format, parse, isValid } from 'date-fns';
import { AlertTriangle, ShieldAlert, Clock, XCircle, CheckCircle, RefreshCw, Filter, Package } from 'lucide-react';
import toast from 'react-hot-toast';

const ACTION_STATUSES = ['Active', 'Action Required', 'Renewal In Progress', 'Completed', 'Monitoring'];

const PRIORITY_CONFIG = {
  Critical: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', icon: XCircle, iconColor: 'text-red-500' },
  High:     { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', icon: AlertTriangle, iconColor: 'text-orange-500' },
  Medium:   { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-400', icon: Clock, iconColor: 'text-amber-500' },
  Low:      { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400', icon: ShieldAlert, iconColor: 'text-slate-400' },
};

const parseDate = (d) => {
  if (!d) return null;
  try {
    if (d.includes('-')) return parse(d, 'yyyy-MM-dd', new Date());
    return parse(d, 'dd/MM/yyyy', new Date());
  } catch { return null; }
};

export default function NeedsAttention() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await getNeedsAttention();
      setItems(data);
    } catch {
      toast.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, []);

  const handleStatusChange = async (id, status) => {
    try {
      await updateActionStatus(id, status);
      setItems(prev => prev.map(p => p._id === id ? { ...p, action_status: status } : p));
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const filters = ['All', 'Critical', 'High', 'Expired', 'Action Required'];
  const filtered = useMemo(() => {
    if (filter === 'All') return items;
    if (filter === 'Expired') return items.filter(p => p.status === 'expired' || p.daysUntilExpiry < 0);
    if (filter === 'Action Required') return items.filter(p => p.action_status === 'Action Required');
    return items.filter(p => p.priority === filter);
  }, [items, filter]);

  const counts = useMemo(() => ({
    Critical: items.filter(p => p.priority === 'Critical').length,
    High: items.filter(p => p.priority === 'High').length,
    Expired: items.filter(p => p.daysUntilExpiry < 0).length,
    'Action Required': items.filter(p => p.action_status === 'Action Required').length,
  }), [items]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Needs Attention</h1>
          <p className="text-slate-500 text-sm sm:text-base mt-1.5">Items requiring immediate or upcoming action, sorted by priority.</p>
        </div>
        <button onClick={loadItems} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(counts).map(([key, count]) => {
          const cfg = PRIORITY_CONFIG[key] || PRIORITY_CONFIG.High;
          return (
            <button key={key} onClick={() => setFilter(filter === key ? 'All' : key)}
              className={`text-left p-4 rounded-xl border transition-all ${filter === key ? `${cfg.bg} ${cfg.border} ring-2 ring-offset-1 ring-current` : 'bg-white border-slate-200 hover:border-slate-300'} shadow-sm`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{key}</p>
              <p className="text-2xl font-bold text-slate-800">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-slate-400 shrink-0" />
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Items List */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <CheckCircle className="mx-auto h-14 w-14 text-emerald-400 mb-4" />
          <h3 className="text-lg font-bold text-slate-700">All clear!</h3>
          <p className="text-slate-500 text-sm mt-1">No items requiring attention{filter !== 'All' ? ` in "${filter}"` : ''}.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(item => {
            const cfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.Low;
            const PIcon = cfg.icon;
            const parsedDate = parseDate(item.expiry_date);
            const dateStr = parsedDate && isValid(parsedDate) ? format(parsedDate, 'MMM dd, yyyy') : item.expiry_date;
            const days = item.daysUntilExpiry;
            const daysText = days == null ? '—' : days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? 'Expires today' : `${days}d remaining`;
            const daysColor = days == null ? 'text-slate-500' : days < 0 ? 'text-rose-600 font-bold' : days <= 7 ? 'text-amber-600 font-bold' : 'text-slate-600';

            return (
              <div key={item._id} className={`bg-white border rounded-2xl p-5 shadow-sm transition-all hover:shadow-md ${cfg.border}`}>
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Priority indicator */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border}`}>
                    <PIcon className={`h-5 w-5 ${cfg.iconColor}`} />
                  </div>

                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-800 text-base truncate">{item.product_name}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${cfg.badge}`}>{item.priority || 'Low'}</span>
                      {item.category && <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{item.category}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-1">
                      <span className="text-slate-500">Expires: <span className="font-semibold text-slate-700">{dateStr}</span></span>
                      <span className={daysColor}>{daysText}</span>
                      {item.risk_score != null && <span className="text-slate-500">Risk: <span className="font-semibold">{item.risk_score}/100</span></span>}
                    </div>
                    {item.action_required && (
                      <p className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 inline-block">
                        <span className="font-bold text-slate-700">Action: </span>{item.action_required}
                      </p>
                    )}
                    {item.risk_reasons?.length > 0 && (
                      <ul className="mt-2 text-xs text-slate-500 space-y-0.5 pl-4 list-disc marker:text-slate-300">
                        {item.risk_reasons.slice(0, 2).map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    )}
                  </div>

                  {/* Action Status */}
                  <div className="flex flex-col gap-2 shrink-0 sm:items-end">
                    <select
                      value={item.action_status || 'Active'}
                      onChange={e => handleStatusChange(item._id, e.target.value)}
                      className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm"
                    >
                      {ACTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
