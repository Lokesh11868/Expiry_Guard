import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { getProducts, deleteProduct, sendExpiryAlerts, batchDelete, batchStatusUpdate, getBriefing, searchNatural, updateActionStatus } from '../services/productService';
import { format, differenceInDays, parse } from 'date-fns';
import { Package, Trash2, Bell, Mail, AlertCircle, Search, Filter, CheckCircle, XCircle, Activity, FileText, Zap, ShieldAlert, FileSearch } from 'lucide-react';
import toast from 'react-hot-toast';

const CATEGORIES = ['All', 'Products', 'Groceries', 'Documents', 'Certificates', 'Licenses', 'Warranties', 'Subscriptions', 'Memberships', 'Insurance', 'Contracts', 'Return windows', 'Other'];
const ACTION_STATUSES = ['Active', 'Action Required', 'Renewal In Progress', 'Completed'];

const parseDate = d => d.includes('-') ? parse(d, 'yyyy-MM-dd', new Date()) : (d.includes('/') ? parse(d, 'dd/MM/yyyy', new Date()) : new Date(d));
const isValidDateObj = d => d instanceof Date && !isNaN(d);
const getStatusColor = s => s === 'expired' ? 'bg-red-100 text-red-800 border-red-200' : s === 'near' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : s === 'consumed' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-green-100 text-green-800 border-green-200';
const getStatusIcon = s => s === 'expired' ? <AlertCircle className="h-4 w-4" /> : s === 'near' ? <Bell className="h-4 w-4" /> : s === 'consumed' ? <CheckCircle className="h-4 w-4" /> : <Package className="h-4 w-4" />;
const getPriorityColor = p => p === 'Critical' ? 'bg-red-600 text-white' : p === 'High' ? 'bg-orange-500 text-white' : p === 'Medium' ? 'bg-amber-400 text-slate-900' : 'bg-slate-200 text-slate-700';

const Dashboard = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedIds, setSelectedIds] = useState([]);
  
  // New features state
  const [briefing, setBriefing] = useState('Loading briefing...');
  const [isNaturalSearch, setIsNaturalSearch] = useState(false);
  const [naturalSearching, setNaturalSearching] = useState(false);
  const [naturalResults, setNaturalResults] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getProducts();
        setProducts(data.map(p => ({ ...p, status: p.status === 'consumed' ? 'consumed' : getProductStatus(p.expiry_date), daysUntilExpiry: differenceInDays(parseDate(p.expiry_date), new Date()) })));
        
        getBriefing().then(res => setBriefing(res.briefing)).catch(() => setBriefing("Briefing unavailable."));
      } catch { toast.error('Failed to fetch products'); }
      setLoading(false);
    })();
  }, []);

  const getProductStatus = d => { if (!d) return 'safe'; const days = differenceInDays(parseDate(d), new Date()); return days < 0 ? 'expired' : days <= 7 ? 'near' : 'safe'; };

  const handleDelete = async id => { if (window.confirm('Are you sure you want to delete this product?')) try { await deleteProduct(id); setProducts(products.filter(p => p._id !== id)); toast.success('Product deleted successfully'); } catch { toast.error('Failed to delete product'); } };

  const handleSendAlerts = async () => { setSendingAlerts(true); try { await sendExpiryAlerts(); toast.success(`Expiry alerts sent to ${user?.email}!`); } catch { toast.error('Failed to send alerts'); } setSendingAlerts(false); };

  const handleBatchDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${selectedIds.length} products?`)) {
      try {
        await batchDelete(selectedIds);
        setProducts(products.filter(p => !selectedIds.includes(p._id)));
        setSelectedIds([]);
        toast.success(`${selectedIds.length} products deleted`);
      } catch { toast.error('Failed to delete products'); }
    }
  };

  const handleBatchStatus = async (status) => {
    try {
      await batchStatusUpdate(selectedIds, status);
      setProducts(products.map(p => selectedIds.includes(p._id) ? { ...p, status } : p));
      setSelectedIds([]);
      toast.success(`${selectedIds.length} products marked as ${status}`);
    } catch { toast.error('Failed to update status'); }
  };

  const handleActionStatusChange = async (id, newStatus) => {
    try {
      const res = await updateActionStatus(id, newStatus);
      setProducts(products.map(p => p._id === id ? { ...p, action_status: newStatus, priority: res.new_priority } : p));
      toast.success('Action status updated');
    } catch { toast.error('Failed to update action status'); }
  };

  const toggleSelect = id => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const performNaturalSearch = async () => {
    if (!searchTerm.trim()) { setNaturalResults(null); return; }
    setNaturalSearching(true);
    try {
      const res = await searchNatural(searchTerm);
      setNaturalResults(res.results.map(p => ({ ...p, status: p.status === 'consumed' ? 'consumed' : getProductStatus(p.expiry_date), daysUntilExpiry: differenceInDays(parseDate(p.expiry_date), new Date()) })));
      toast.success('AI Search applied!');
    } catch {
      toast.error('AI Search failed. Falling back to normal search.');
      setIsNaturalSearch(false);
    }
    setNaturalSearching(false);
  };

  const filteredProducts = useMemo(() => {
    if (isNaturalSearch && naturalResults) return naturalResults;
    return products.filter(p => {
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch = !term ||
        p.product_name?.toLowerCase().includes(term) ||
        p.brand?.toLowerCase().includes(term) ||
        p.category?.toLowerCase().includes(term) ||
        p.notes?.toLowerCase().includes(term);
      const matchesCategory = selectedCategory === 'All' || 
        p.category?.toLowerCase() === selectedCategory.toLowerCase();
      return matchesSearch && matchesCategory;
    }).sort((a, b) => {
      const pMap = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
      return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
    });
  }, [products, searchTerm, selectedCategory, isNaturalSearch, naturalResults]);

  const stats = useMemo(() => {
    const total = products.length;
    const safeCount = products.filter(p => p.status === 'safe' && p.priority === 'Low').length;
    const health_score = total > 0 ? Math.round((safeCount / total) * 100) : 100;
    
    return {
      total,
      expiringSoon: products.filter(p => p.status === 'near').length,
      expired: products.filter(p => p.status === 'expired').length,
      highRisk: products.filter(p => p.priority === 'Critical' || p.priority === 'High').length,
      renewals: products.filter(p => p.action_status !== 'Active' || p.priority === 'Critical' || p.priority === 'High').length,
      documents: products.filter(p => p.document_type || ['Documents', 'Certificates', 'Licenses', 'Warranties', 'Insurance', 'Contracts', 'Memberships'].includes(p.category)).length,
      healthScore: health_score
    };
  }, [products]);

  const expiringProducts = products.filter(p => p.status === 'near' || p.status === 'expired');

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Overview</h1>
          <p className="text-slate-500 text-sm sm:text-base mt-1.5">Track, manage, and optimize your assets and subscriptions.</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSendAlerts}
            disabled={sendingAlerts}
            className="w-full sm:w-auto bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center space-x-2 transition-all shadow-lg shadow-slate-200 active:scale-95"
            title="Manually trigger a check and send alerts if any products are expiring"
          >
            <Mail className="h-4 w-4" />
            <span className="text-sm">{sendingAlerts ? 'Sending...' : 'Send Alerts'}</span>
          </button>
        </div>
      </div>

      {/* Dashboard Top Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl px-6 py-5 flex items-center gap-4 shadow-xl relative overflow-hidden">
          <div className="w-12 h-12 bg-white text-slate-900 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-slate-900/20">
            <Activity className="h-6 w-6" />
          </div>
          <div className="z-10 flex-1">
            <h2 className="font-bold text-white text-xs tracking-wider uppercase mb-0.5">Daily Summary</h2>
            <p className="text-slate-300 text-sm leading-snug">{briefing}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 flex flex-col justify-center items-center rounded-2xl shadow-sm">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Inventory Health</p>
          <div className="flex items-end gap-1">
            <h2 className="text-4xl font-extrabold text-slate-800">{stats.healthScore}</h2>
            <span className="text-sm font-semibold text-slate-400 mb-1.5">/100</span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-2">{stats.healthScore >= 80 ? 'Optimal Status' : stats.healthScore >= 50 ? 'Requires Review' : 'Critical Status'}</p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Total Items</p>
          <p className="text-slate-800 text-2xl font-bold">{stats.total}</p>
        </div>
        <Link to="/needs-attention" className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-amber-300 hover:shadow-md transition-all group">
          <p className="text-amber-600 text-[10px] font-bold uppercase tracking-wider mb-1 group-hover:text-amber-700 transition-colors">Expiring Soon</p>
          <p className="text-slate-800 text-2xl font-bold">{stats.expiringSoon}</p>
        </Link>
        <Link to="/needs-attention" className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-rose-300 hover:shadow-md transition-all group">
          <p className="text-rose-600 text-[10px] font-bold uppercase tracking-wider mb-1 group-hover:text-rose-700 transition-colors">Expired</p>
          <p className="text-slate-800 text-2xl font-bold">{stats.expired}</p>
        </Link>
        <Link to="/needs-attention" className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-red-300 hover:shadow-md transition-all group">
          <p className="text-red-600 text-[10px] font-bold uppercase tracking-wider mb-1 group-hover:text-red-700 transition-colors">Priority Tasks</p>
          <p className="text-slate-800 text-2xl font-bold">{stats.highRisk}</p>
        </Link>
        <Link to="/renewals" className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group">
          <p className="text-indigo-600 text-[10px] font-bold uppercase tracking-wider mb-1 group-hover:text-indigo-700 transition-colors">Renewals</p>
          <p className="text-slate-800 text-2xl font-bold">{stats.renewals}</p>
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full flex items-center">
            {isNaturalSearch ? <FileSearch className="absolute left-4 h-5 w-5 text-indigo-500" /> : <Search className="absolute left-4 h-5 w-5 text-slate-400" />}
            <input
              type="text"
              placeholder={isNaturalSearch ? "Smart Search: 'Show warranties expiring soon'..." : "Search by name, category, brand..."}
              className={`input-premium pl-12 pr-20 py-2.5 bg-slate-50 border border-slate-200 w-full rounded-lg text-sm transition-colors focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 ${isNaturalSearch ? 'border-indigo-200 bg-indigo-50/30' : ''}`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isNaturalSearch) {
                  performNaturalSearch();
                }
              }}
            />
            {searchTerm && !isNaturalSearch && (
              <button onClick={() => setSearchTerm('')} className="absolute right-14 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"><XCircle className="h-4 w-4" /></button>
            )}
            <button
              onClick={() => setIsNaturalSearch(!isNaturalSearch)}
              className={`absolute right-3 p-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors border ${isNaturalSearch ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              title="Toggle Smart Search"
            >
              Smart
            </button>
          </div>
          {isNaturalSearch && (
            <button 
              onClick={performNaturalSearch}
              disabled={naturalSearching}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md disabled:opacity-50"
            >
              {naturalSearching ? 'Searching...' : 'Search'}
            </button>
          )}
          <div className="text-xs font-bold text-slate-500 whitespace-nowrap self-end sm:self-center px-1">
            {filteredProducts.length} {filteredProducts.length === 1 ? 'item' : 'items'} found
          </div>
        </div>

        {/* Category Pills Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap pr-1 shrink-0">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span>Filter:</span>
          </div>
          {CATEGORIES.map(cat => {
            const count = cat === 'All'
              ? products.length
              : products.filter(p => p.category?.toLowerCase() === cat.toLowerCase()).length;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 border whitespace-nowrap flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span>{cat}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Batch Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="sticky top-4 z-10 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center space-x-4">
            <span className="font-bold text-sm uppercase tracking-widest">{selectedIds.length} SELECTED</span>
            <button onClick={() => setSelectedIds([])} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><XCircle className="h-5 w-5" /></button>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={() => handleBatchStatus('consumed')} className="bg-white text-slate-900 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all active:scale-95 flex items-center space-x-2">
              <CheckCircle className="h-4 w-4" />
              <span>Mark Consumed</span>
            </button>
            <button onClick={handleBatchDelete} className="bg-white text-slate-900 px-4 py-2 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all active:scale-95 flex items-center space-x-2 shadow-lg shadow-slate-900/10">
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* Deleted Attention Required Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProducts.map(product => (
          <div
            key={product._id}
            className={`bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md transition-all duration-300 flex flex-col h-full relative cursor-pointer ${selectedIds.includes(product._id) ? 'ring-2 ring-indigo-500 border-indigo-500' : ''}`}
            onClick={() => toggleSelect(product._id)}
          >
            <div className="absolute top-4 right-4" onClick={e => e.stopPropagation()}>
              <input
                type="checkbox"
                className="h-5 w-5 rounded-lg border-slate-200 text-slate-900 focus:ring-slate-900 cursor-pointer transition-colors"
                checked={selectedIds.includes(product._id)}
                onChange={() => toggleSelect(product._id)}
              />
            </div>

            <div className="flex justify-between items-start mb-5 pr-8">
              <h3 className="font-semibold text-[17px] text-slate-800 leading-tight break-words pr-2">{product.product_name}</h3>
            </div>

            <div className="flex-1 space-y-5" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Expiry Date</p>
                  {(() => { const parsed = parseDate(product.expiry_date); return isValidDateObj(parsed) ? <p className="font-bold text-slate-700">{format(parsed, 'MMM dd, yyyy')}</p> : <p className="font-bold text-rose-500">Invalid Date</p>; })()}
                </div>
                {product.category && (
                  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-slate-200">{product.category}</span>
                )}
              </div>

              {product.barcode && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 transition-colors hover:bg-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Barcode</p>
                  <p className="font-mono text-xs text-slate-600 break-all">{product.barcode}</p>
                </div>
              )}

              {/* Intelligence / Document Info */}
              {(product.document_type || product.provider || product.reference_number) && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-3 space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><FileText className="w-3.5 h-3.5"/> Document Details</p>
                  {product.document_type && <p className="text-xs text-slate-600 font-semibold"><span className="text-slate-400 mr-2">Type:</span> {product.document_type}</p>}
                  {product.provider && <p className="text-xs text-slate-600 font-semibold"><span className="text-slate-400 mr-2">Provider:</span> {product.provider}</p>}
                  {product.reference_number && <p className="text-xs text-slate-600 font-semibold"><span className="text-slate-400 mr-2">Ref:</span> {product.reference_number}</p>}
                </div>
              )}

              {/* Priority & Insight Section */}
              <div className={`p-3 rounded-xl border ${product.priority === 'Critical' ? 'bg-red-50 border-red-200' : product.priority === 'High' ? 'bg-orange-50 border-orange-200' : product.priority === 'Medium' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                 <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5"/> {product.priority || 'Low'} Priority
                    </p>
                 </div>
                 
                 {product.risk_reasons && product.risk_reasons.length > 0 && (
                   <ul className="text-xs font-medium text-slate-600 space-y-1 mb-3 pl-4 list-disc marker:text-slate-300">
                     {product.risk_reasons.map((r, i) => <li key={i}>{r}</li>)}
                   </ul>
                 )}
                 
                 {product.action_required && (
                   <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200/60 shadow-sm">
                     <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Recommendation</p>
                     <p className="text-xs font-bold text-slate-800 leading-snug">{product.action_required}</p>
                   </div>
                 )}
              </div>

              <div className="flex flex-col gap-2 mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Status</p>
                  <p className={`font-bold text-xs ${product.daysUntilExpiry < 0 ? 'text-rose-600' : product.daysUntilExpiry <= 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {product.daysUntilExpiry < 0 ? `EXPIRED (${Math.abs(product.daysUntilExpiry)}D AGO)` : `EXPIRES IN ${product.daysUntilExpiry}D`}
                  </p>
                </div>
                
                <div className="flex flex-col mt-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1.5">Action Status</p>
                  <select 
                    value={product.action_status || 'Active'}
                    onChange={(e) => handleActionStatusChange(product._id, e.target.value)}
                    className="text-xs font-bold bg-white border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {ACTION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border shadow-sm ${getStatusColor(product.status)}`}>
                  {getStatusIcon(product.status)}
                  <span>{product.status}</span>
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(product._id); }}
                  className="bg-rose-50 text-rose-500 p-2 rounded-xl border border-rose-100 hover:bg-rose-500 hover:text-white transition-all duration-200"
                  title="Delete Product"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <Package className="mx-auto h-16 w-16 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No products found</h3>
          <p className="mt-2 text-gray-500">Try adjusting your filters or search terms.</p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;