import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UtensilsCrossed,
  FolderTree,
  Megaphone,
  QrCode,
  CheckCircle2,
  EyeOff,
  Receipt,
  Plus,
  ArrowRight,
} from 'lucide-react';
import type { DashboardStats, MenuItem } from '../../../shared/types';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ErrorState, Skeleton } from '../../components/ui';
import { PageHeader, StatCard, StatusPill, Money, TableShell } from '../../components/admin/parts';
import { formatMoney } from '../../../shared/money';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<MenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .dashboard()
      .then((res) => {
        setStats(res.stats);
        setRecent(res.recent_items);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the dashboard.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    document.title = 'Dashboard — Eclipse Admin';
    load();
  }, []);

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <PageHeader
        title={`Good to see you, ${user?.name?.split(' ')[0] ?? 'Admin'}`}
        subtitle="Live figures straight from your menu database — no estimates, no placeholder analytics."
        actions={
          <>
            <Link to="/admin/items/new" className="btn-gold">
              <Plus size={15} /> New menu item
            </Link>
            <Link to="/admin/qr" className="btn-ghost">
              <QrCode size={15} /> QR codes
            </Link>
          </>
        }
      />

      {loading || !stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] !rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Menu items"
              value={stats.total_items}
              icon={<UtensilsCrossed size={15} />}
              hint={`${stats.total_categories} categories`}
              tone="gold"
            />
            <StatCard
              label="Available now"
              value={stats.available_items}
              icon={<CheckCircle2 size={15} />}
              hint="Visible to guests on the menu"
              tone="good"
            />
            <StatCard
              label="Unavailable"
              value={stats.unavailable_items}
              icon={<EyeOff size={15} />}
              hint="Sold out or hidden items"
              tone={stats.unavailable_items > 0 ? 'warn' : 'default'}
            />
            <StatCard
              label="Active promotions"
              value={stats.active_promotions}
              icon={<Megaphone size={15} />}
              hint="Live right now by schedule"
            />
            <StatCard
              label="QR codes"
              value={stats.qr_codes}
              icon={<QrCode size={15} />}
              hint={`${stats.active_qr_codes} active · ${stats.total_scans} scans recorded`}
            />
            <StatCard label="Categories" value={stats.total_categories} icon={<FolderTree size={15} />} />
            {stats.orders ? (
              <>
                <StatCard
                  label="Live orders"
                  value={stats.orders.pending}
                  icon={<Receipt size={15} />}
                  hint={`${stats.orders.total} total orders`}
                  tone={stats.orders.pending > 0 ? 'warn' : 'default'}
                />
                <StatCard
                  label="Order value"
                  value={formatMoney(stats.orders.revenue)}
                  hint={`${stats.orders.completed} completed`}
                />
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 p-4">
                <p className="text-[10.5px] uppercase tracking-[0.14em] text-smoke">Digital ordering</p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-smoke/80">
                  Browse-only mode is active. Enable ordering in{' '}
                  <Link to="/admin/settings" className="text-gold-200 hover:text-gold-100">
                    settings
                  </Link>{' '}
                  to accept table orders.
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="font-display text-lg text-cream">Recently added</h2>
                <Link to="/admin/items" className="inline-flex items-center gap-1 text-[11.5px] uppercase tracking-[0.12em] text-gold-300 hover:text-gold-100">
                  Manage menu <ArrowRight size={11} />
                </Link>
              </div>
              <TableShell>
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-white/[0.03] text-[10.5px] uppercase tracking-[0.12em] text-smoke">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Item</th>
                      <th className="px-4 py-2.5 font-medium">Category</th>
                      <th className="px-4 py-2.5 text-right font-medium">Price</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {recent.map((item) => (
                      <tr key={item.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5">
                          <Link to={`/admin/items/${item.id}`} className="text-cream hover:text-gold-100">
                            {item.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-smoke">{item.category_name}</td>
                        <td className="px-4 py-2.5 text-right text-gold-100">
                          <Money kobo={item.effective_price} />
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusPill status={item.availability_status} />
                        </td>
                      </tr>
                    ))}
                    {recent.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-smoke">
                          No items yet — create your first menu item.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </TableShell>
            </div>

            <div className="space-y-3">
              <h2 className="font-display text-lg text-cream">Shortcuts</h2>
              <div className="grid gap-2">
                {[
                  { to: '/admin/items/new', label: 'Add a menu item', icon: Plus },
                  { to: '/admin/promotions', label: 'Set up a happy hour', icon: Megaphone },
                  { to: '/admin/qr', label: 'Print table QR codes', icon: QrCode },
                  { to: '/admin/settings', label: 'Update venue details', icon: FolderTree },
                ].map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-ink-700/40 px-4 py-3 text-[13px] text-cream/90 transition hover:border-gold-400/30 hover:text-cream"
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon size={15} className="text-gold-400/80" /> {label}
                    </span>
                    <ArrowRight size={13} className="text-smoke/60" />
                  </Link>
                ))}
              </div>

              {stats.orders && stats.orders.recent.length > 0 && (
                <div className="rounded-xl border border-white/[0.07] bg-ink-700/40 p-4">
                  <h2 className="mb-2 font-display text-base text-cream">Recent orders</h2>
                  <ul className="space-y-2 text-[12.5px]">
                    {stats.orders.recent.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-cream/85">{o.order_reference}</span>
                        <span className="tabular-nums text-gold-100">{formatMoney(o.total)}</span>
                        <StatusPill status={o.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
