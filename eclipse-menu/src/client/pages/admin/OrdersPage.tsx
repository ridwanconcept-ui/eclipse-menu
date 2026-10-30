import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, RefreshCw } from 'lucide-react';
import type { Order, OrderStatus } from '../../../shared/types';
import { ORDER_STATUS_LABELS } from '../../../shared/types';
import { formatMoney } from '../../../shared/money';
import { api, ApiError } from '../../lib/api';
import { EmptyState, ErrorState, Spinner, useToast } from '../../components/ui';
import { PageHeader, Segmented, StatusPill } from '../../components/admin/parts';

const STATUSES: OrderStatus[] = ['pending', 'preparing', 'served', 'completed', 'cancelled'];

export default function OrdersPage() {
  const { push } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [updating, setUpdating] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    api
      .listOrders()
      .then((res) => {
        setOrders(res.orders);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load orders.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    document.title = 'Orders — Eclipse Admin';
    load();
  }, []);

  const filtered = useMemo(() => (filter === 'all' ? orders : orders.filter((o) => o.status === filter)), [orders, filter]);

  const setStatus = async (order: Order, status: OrderStatus) => {
    setUpdating(order.id);
    try {
      await api.setOrderStatus(order.id, status);
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
      push('success', `${order.order_reference} → ${ORDER_STATUS_LABELS[status]}`);
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not update the order');
    } finally {
      setUpdating(null);
    }
  };

  if (error) {
    return (
      <ErrorState
        message={`${error} — digital ordering may be disabled. Enable it in Settings to use this page.`}
        onRetry={load}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle="Live table orders. Totals are stored with a snapshot of each item's name and price, so history stays accurate when the menu changes."
        actions={
          <button className="btn-ghost" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as 'all' | OrderStatus)}
          options={[{ value: 'all', label: 'All' }, ...STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))]}
        />
        <span className="text-[11.5px] text-smoke/60">{filtered.length} orders</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Receipt size={26} />}
          title="No orders here yet"
          message="When guests submit an order from their table it will appear here in real time. Refresh to check for new orders."
          action={
            <Link to="/admin/settings" className="btn-ghost mt-2">
              Check ordering settings
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <article key={order.id} className="rounded-xl border border-white/[0.07] bg-ink-700/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-[15px] text-cream">{order.order_reference}</h2>
                    <StatusPill status={order.status} />
                    {order.table_identifier && (
                      <span className="chip border-white/[0.12] bg-white/[0.04] text-smoke">{order.table_identifier}</span>
                    )}
                  </div>
                  <p className="mt-1 text-[11.5px] text-smoke/70">
                    {new Date(order.created_at.replace(' ', 'T') + 'Z').toLocaleString('en-NG', {
                      timeZone: 'Africa/Lagos',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    {order.customer_name ? ` · ${order.customer_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg text-gold-100 tabular-nums">{formatMoney(order.total)}</span>
                  <select
                    className="rounded-lg border border-white/10 bg-ink-800 px-2 py-1.5 text-[12px] text-cream"
                    value={order.status}
                    onChange={(e) => setStatus(order, e.target.value as OrderStatus)}
                    disabled={updating === order.id}
                    aria-label={`Status for ${order.order_reference}`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {ORDER_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  {updating === order.id && <Spinner className="text-gold-300" />}
                </div>
              </div>

              <ul className="mt-3 grid gap-1 border-t border-white/[0.06] pt-2 text-[12.5px] sm:grid-cols-2">
                {order.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <span className="truncate text-cream/85">
                      {i.quantity} × {i.item_name_snapshot}
                      {i.selected_variant ? ` · ${i.selected_variant}` : ''}
                    </span>
                    <span className="shrink-0 text-smoke tabular-nums">{formatMoney(i.line_total)}</span>
                  </li>
                ))}
              </ul>
              {order.special_instructions && (
                <p className="mt-2 rounded bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] text-smoke">
                  Note: {order.special_instructions}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
