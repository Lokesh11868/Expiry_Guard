import { useState, useEffect, useMemo } from 'react';
import { getRenewals, updateActionStatus } from '../services/productService';
import { format, parse, isValid } from 'date-fns';
import { RefreshCw, CheckCircle, Clock, AlertTriangle, RotateCcw, Filter, Package } from 'lucide-react';
import toast from 'react-hot-toast';

const ACTION_STATUSES = ['Active', 'Action Required', 'Renewal In Progress', 'Completed', 'Monitoring'];

const STATUS_CONFIG = {
  'Action Required':    { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', icon: AlertTriangle, iconColor: 'text-amber-500' },
  'Renewal In Progress':{ bg: 'bg-blue-50',  border: 'border-blue-200',  badge: 'bg-blue-100 text-blue-700',   icon: RotateCcw,    iconColor: 'text-blue-500' },
  'Completed':          { bg: 'bg-emerald-50',border: 'border-emerald-200',badge: 'bg-emerald-100 text-emerald-700',icon: CheckCircle,  iconColor: 'text-emerald-500' },
  'Monitoring':         { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600',  icon: Clock,        iconColor: 'text-slate-400' },
  'Active':             { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600',  icon: Clock,        iconColor: 'text-slate-400' },
  'Overdue':            { bg: 'bg-red-50',   border: 'border-red-200',   badge: 'bg-red-100 text-red-700',     icon: AlertTriangle, iconColor: 'text-red-500' },
};

const parseDate = (d) => {
  if (!d) return null;
  try {
    if (d.includes('-')) return parse(d, 'yyyy-MM-dd', new Date());
    return parse(d, 'dd/MM/yyyy', new Date());
  } catch { return null; }
};

export default function RenewalsActions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await getRenewals();
      setItems(data);
    } catch {
      toast.error('Failed to load renewals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, []);

  const handleStatusChange = async (id, status) => {
    try {
      await updateActionStatus(id, status);
      setItems(prev => prev.map(p => p._id === id ? { ...p, action_status: status } : p));
      toast.success(`Status updated to "${status}"`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const enrichedItems = useMemo(() => items.map(item => {
    const days = item.daysUntilExpiry;
    const actionStatus = item.action_status === 'Active' && days != null && days < 0 ? 'Overdue' : item.action_status || 'Active';
    return { ...item, computedStatus: actionStatus };
  }), [items]);

  const statusOptions = ['All', 'Action Required', 'Renewal In Progress', 'Completed', 'Overdue', 'Monitoring'];
  const filtered = useMemo(() =>
    statusFilter === 'All' ? enrichedItems : enrichedItems.filter(p => p.computedStatus === statusFilter),
    [enrichedItems, statusFilter]
  );

  const counts = useMemo(() => {
    const c = { 'Action Required': 0, 'Renewal In Progress': 0, 'Completed': 0, 'Overdue': 0 };
    enrichedItems.forEach(p => { if (c[p.computedStatus] !== undefined) c[p.computedStatus]++; });
    return c;
  }, [enrichedItems]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Renewals & Actions</h1>
          <p className="text-slate-500 text-sm sm:text-base mt-1.5">Track pending renewals and action workflows for your items.</p>
        </div>
        <button onClick={loadItems} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(counts).map(([key, count]) => {
          const cfg = STATUS_CONFIG[key] || STATUS_CONFIG['Active'];
          const SIcon = cfg.icon;
          return (
            <button key={key} onClick={() => setStatusFilter(statusFilter === key ? 'All' : key)}
              className={`text-left p-4 rounded-xl border transition-all shadow-sm ${statusFilter === key ? `${cfg.bg} ${cfg.border} ring-2 ring-offset-1` : 'bg-white border-slate-200 hover:border-slate-300'}`}>
              <div className="flex items-center gap-2 mb-1">
                <SIcon className={`h-3.5 w-3.5 ${cfg.iconColor}`} />
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 leading-none">{key}</p>
              </div>
              <p className="text-2xl font-bold text-slate-800">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-slate-400 shrink-0" />
        {statusOptions.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${statusFilter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <Package className="mx-auto h-14 w-14 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-700">No items found</h3>
          <p className="text-slate-500 text-sm mt-1">No renewals match the selected filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(item => {
            const cfg = STATUS_CONFIG[item.computedStatus] || STATUS_CONFIG['Active'];
            const SIcon = cfg.icon;
            const parsedDate = parseDate(item.expiry_date);
            const dateStr = parsedDate && isValid(parsedDate) ? format(parsedDate, 'MMM dd, yyyy') : item.expiry_date;
            const days = item.daysUntilExpiry;
            const daysText = days == null ? '—' : days < 0 ? `Overdue by ${Math.abs(days)}d` : days === 0 ? 'Expires today' : `${days}d remaining`;
            const daysColor = days == null ? 'text-slate-500' : days < 0 ? 'text-rose-600 font-bold' : days <= 7 ? 'text-amber-600 font-bold' : 'text-slate-600';

            return (
              <div key={item._id} className={`bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all ${cfg.border}`}>
                <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border}`}>
                    <SIcon className={`h-5 w-5 ${cfg.iconColor}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-800 text-base">{item.product_name}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{item.computedStatus}</span>
                      {item.priority && <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{item.priority} Priority</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <span className="text-slate-500">Expires: <span className="font-semibold text-slate-700">{dateStr}</span></span>
                      <span className={daysColor}>{daysText}</span>
                      {item.category && <span className="text-slate-400">{item.category}</span>}
                    </div>
                    {item.action_required && (
                      <p className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 inline-block">
                        <span className="font-bold text-slate-700">Next step: </span>{item.action_required}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <select
                      value={item.action_status || 'Active'}
                      onChange={e => handleStatusChange(item._id, e.target.value)}
                      className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-sm"
                    >
                      {ACTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {item.computedStatus !== 'Completed' && (
                      <button
                        onClick={() => handleStatusChange(item._id, 'Completed')}
                        className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors flex items-center gap-1.5"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Mark Complete
                      </button>
                    )}
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
