import { useState, useEffect } from 'react';
import { getDocuments, updateActionStatus } from '../services/productService';
import { format, parse, isValid } from 'date-fns';
import { FileText, ShieldCheck, AlertCircle, RefreshCw, Filter, Search, Package } from 'lucide-react';
import toast from 'react-hot-toast';

const VERIFICATION_CONFIG = {
  'Verified':            { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: ShieldCheck, iconColor: 'text-emerald-500' },
  'Needs Verification':  { badge: 'bg-amber-100 text-amber-700 border-amber-200',       icon: AlertCircle,  iconColor: 'text-amber-500' },
  'Conflict Detected':   { badge: 'bg-red-100 text-red-700 border-red-200',             icon: AlertCircle,  iconColor: 'text-red-500' },
};

const DOC_CATEGORIES = ['All', 'Warranties', 'Insurance', 'Certificates', 'Licenses', 'Documents', 'Contracts', 'Memberships'];

const parseDate = (d) => {
  if (!d) return null;
  try {
    if (d.includes('-')) return parse(d, 'yyyy-MM-dd', new Date());
    return parse(d, 'dd/MM/yyyy', new Date());
  } catch { return null; }
};

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [verFilter, setVerFilter] = useState('All');

  const loadDocs = async () => {
    setLoading(true);
    try {
      const data = await getDocuments();
      setDocs(data);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDocs(); }, []);

  const filtered = docs.filter(d => {
    const term = search.toLowerCase();
    const matchSearch = !term || d.product_name?.toLowerCase().includes(term) || d.provider?.toLowerCase().includes(term) || d.reference_number?.toLowerCase().includes(term) || d.document_type?.toLowerCase().includes(term);
    const matchCat = categoryFilter === 'All' || d.category === categoryFilter;
    const matchVer = verFilter === 'All' || d.verification_status === verFilter;
    return matchSearch && matchCat && matchVer;
  });

  const needsVerCount = docs.filter(d => d.verification_status === 'Needs Verification').length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Documents</h1>
          <p className="text-slate-500 text-sm sm:text-base mt-1.5">Centralized view of all documents, warranties, certificates and contracts.</p>
        </div>
        <button onClick={loadDocs} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Total Documents</p>
          <p className="text-2xl font-bold text-slate-800">{docs.length}</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">Needs Verification</p>
          <p className="text-2xl font-bold text-slate-800">{needsVerCount}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Verified</p>
          <p className="text-2xl font-bold text-slate-800">{docs.filter(d => d.verification_status === 'Verified').length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, provider, reference number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none bg-white shadow-sm"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            {DOC_CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${categoryFilter === c ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {['All', 'Verified', 'Needs Verification'].map(v => (
              <button key={v} onClick={() => setVerFilter(v)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${verFilter === v ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Document cards */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <Package className="mx-auto h-14 w-14 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-700">No documents found</h3>
          <p className="text-slate-500 text-sm mt-1">Add documents via the Add Product page using OCR or manual entry.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(doc => {
            const verCfg = VERIFICATION_CONFIG[doc.verification_status] || VERIFICATION_CONFIG['Verified'];
            const VIcon = verCfg.icon;
            const parsedExp = parseDate(doc.expiry_date);
            const parsedPur = parseDate(doc.purchase_date);
            const expStr = parsedExp && isValid(parsedExp) ? format(parsedExp, 'MMM dd, yyyy') : doc.expiry_date;
            const purStr = parsedPur && isValid(parsedPur) ? format(parsedPur, 'MMM dd, yyyy') : doc.purchase_date;
            const days = doc.daysUntilExpiry;
            const daysColor = days == null ? '' : days < 0 ? 'text-rose-600' : days <= 14 ? 'text-amber-600' : 'text-slate-500';

            return (
              <div key={doc._id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 truncate">{doc.product_name}</h3>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{doc.category || 'Document'}</span>
                  </div>
                  {/* Verification badge */}
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border flex items-center gap-1 shrink-0 ${verCfg.badge}`}>
                    <VIcon className={`h-3 w-3 ${verCfg.iconColor}`} />
                    {doc.verification_status}
                  </span>
                </div>

                {/* Details grid */}
                <div className="space-y-2 text-xs">
                  {doc.document_type && (
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-medium">Type</span>
                      <span className="font-semibold text-slate-700">{doc.document_type}</span>
                    </div>
                  )}
                  {doc.provider && (
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-medium">Provider</span>
                      <span className="font-semibold text-slate-700">{doc.provider}</span>
                    </div>
                  )}
                  {doc.reference_number && (
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-medium">Reference</span>
                      <span className="font-mono font-semibold text-slate-700">{doc.reference_number}</span>
                    </div>
                  )}
                  {purStr && (
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-medium">Issued</span>
                      <span className="font-semibold text-slate-700">{purStr}</span>
                    </div>
                  )}
                  {expStr && (
                    <div className="flex justify-between border-t border-slate-100 pt-2 mt-2">
                      <span className="text-slate-400 font-medium">Expires</span>
                      <div className="text-right">
                        <span className="font-semibold text-slate-700 block">{expStr}</span>
                        {days != null && <span className={`text-[10px] font-bold ${daysColor}`}>{days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d remaining`}</span>}
                      </div>
                    </div>
                  )}
                  {doc.confidence != null && (
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-medium">Confidence</span>
                      <span className={`font-semibold ${doc.confidence < 0.6 ? 'text-amber-600' : 'text-emerald-600'}`}>{Math.round(doc.confidence * 100)}%</span>
                    </div>
                  )}
                </div>

                {/* Source badge */}
                {doc.source && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Source: {doc.source.toUpperCase()}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
