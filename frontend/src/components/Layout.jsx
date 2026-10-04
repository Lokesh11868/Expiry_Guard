
import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Home, Plus, BarChart3, Menu, AlertTriangle, RotateCcw, FileText, Bell, Settings, User } from 'lucide-react';

// Helper: Navigation Links
const NavLinks = ({ navigation, location, onClick }) => (
  <>
    {navigation.map(({ name, href, icon: Icon }) => (
      <Link
        key={name}
        to={href}
        className={`flex items-center space-x-1.5 px-2.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-200 ${location.pathname === href
          ? 'bg-indigo-50 text-indigo-700'
          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
          }`}
        onClick={onClick}
      >
        <Icon className="h-4 w-4" />
        <span>{name}</span>
      </Link>
    ))}
  </>
);

// Removed redundant ProfileDetails component

const Layout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard',       href: '/dashboard',       icon: Home },
    { name: 'Add Product',     href: '/add-product',     icon: Plus },
    { name: 'Statistics',      href: '/statistics',      icon: BarChart3 },
    { name: 'Needs Attention', href: '/needs-attention', icon: AlertTriangle },
    { name: 'Renewals',        href: '/renewals',         icon: RotateCcw },
    { name: 'Documents',       href: '/documents',        icon: FileText },
    { name: 'Notifications',   href: '/notifications',    icon: Bell },
    { name: 'Settings',        href: '/settings',         icon: Settings },
  ];
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16 w-full gap-4">
            <div className="flex items-center shrink-0">
              <Link to="/dashboard" className="flex items-center space-x-2 group">
                <span className="text-xl font-extrabold tracking-tight text-slate-800 group-hover:text-indigo-600 transition-colors duration-300">
                  EXPIRY<span className="text-slate-400 font-light">GUARD</span>
                </span>
              </Link>
            </div>
            
            <div className="hidden xl:flex flex-1 items-center justify-center gap-1 mx-4">
              <NavLinks navigation={navigation} location={location} onClick={() => setMobileNavOpen(false)} />
            </div>

            <div className="flex items-center xl:hidden shrink-0">
              <button
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                className="p-2 rounded-md text-gray-700 hover:bg-gray-100 focus:outline-none"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>

            <div className="hidden xl:flex items-center shrink-0">
              <div className="flex items-center space-x-2 text-slate-600 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                <User className="h-4 w-4 text-indigo-500" />
                <span className="text-sm font-semibold tracking-wide">{user?.username}</span>
              </div>
            </div>
          </div>
        </div>
      </nav>
      {mobileNavOpen && (
        <div className="xl:hidden fixed inset-0 z-40 bg-black bg-opacity-30" onClick={() => setMobileNavOpen(false)}>
          <div
            className="fixed top-0 left-0 w-64 h-full bg-white shadow-lg z-50 flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b">
              <span className="text-lg font-bold text-gray-900">Menu</span>
              <button onClick={() => setMobileNavOpen(false)} className="text-gray-500 hover:text-gray-900">✕</button>
            </div>
            <div className="flex-1 flex flex-col space-y-2 p-4 overflow-y-auto">
              <NavLinks navigation={navigation} location={location} onClick={() => setMobileNavOpen(false)} />
            </div>
          </div>
        </div>
      )}
      <main className="max-w-7xl mx-auto py-6 px-2 sm:px-4">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;