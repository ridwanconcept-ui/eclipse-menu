import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  UtensilsCrossed,
  FolderTree,
  Megaphone,
  QrCode,
  Settings,
  LogOut,
  Menu as MenuIcon,
  X,
  ExternalLink,
  Receipt,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { BrandMark } from '../../components/ui';
import { api } from '../../lib/api';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/items', label: 'Menu items', icon: UtensilsCrossed },
  { to: '/admin/categories', label: 'Categories', icon: FolderTree },
  { to: '/admin/promotions', label: 'Promotions', icon: Megaphone },
  { to: '/admin/orders', label: 'Orders', icon: Receipt },
  { to: '/admin/qr', label: 'QR codes', icon: QrCode },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orderingEnabled, setOrderingEnabled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    api
      .getSettings()
      .then(({ business }) => setOrderingEnabled(business.ordering_enabled))
      .catch(() => setOrderingEnabled(false));
  }, []);

  const nav = NAV.filter((item) => (item.to === '/admin/orders' ? orderingEnabled : true));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <BrandMark size={32} />
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] text-cream">Eclipse</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-gold-400/80">Menu Admin</p>
        </div>
      </div>
      <div className="gold-rule mx-4" />
      <nav className="mt-3 flex-1 space-y-0.5 px-2.5">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] transition ${
                isActive ? 'bg-gold-400/12 text-gold-100' : 'text-smoke hover:bg-white/[0.04] hover:text-cream'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/[0.07] p-3">
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="mb-1 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-smoke hover:bg-white/[0.04] hover:text-cream"
        >
          <ExternalLink size={15} /> View live menu
        </a>
        <button
          onClick={async () => {
            await signOut();
            navigate('/admin/login', { replace: true });
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-smoke hover:bg-white/[0.04] hover:text-cream"
        >
          <LogOut size={15} /> Sign out
        </button>
        <div className="mt-2 truncate rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] text-smoke/70">
          {user?.email}
          <span className="ml-1 rounded bg-gold-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-gold-200">
            {user?.role}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-white/[0.07] bg-ink-800/60 lg:block">
        {sidebar}
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-white/[0.07] bg-ink-900/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2">
          <BrandMark size={26} />
          <span className="font-display text-[15px] text-cream">Eclipse Admin</span>
        </div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-cream"
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={17} /> : <MenuIcon size={17} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 top-[57px] z-30 bg-ink-900/98 backdrop-blur lg:hidden">{sidebar}</div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
