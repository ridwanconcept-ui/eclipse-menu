import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, ChefHat, XCircle } from 'lucide-react';
import type { Order, OrderStatus } from '../../shared/types';
import { ORDER_STATUS_LABELS } from '../../shared/types';
import { formatMoney } from '../../shared/money';
import { api, ApiError } from '../lib/api';
import { ErrorState, Spinner } from '../components/ui';
import { BrandMark } from '../components/ui';

const STEPS: OrderStatus[] = ['pending', 'preparing', 'served', 'completed'];

export default function OrderStatusPage() {
  const { reference = '' } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.getOrder(reference);
      setOrder(res.order);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load this order.');
    } finally {
      setLoading(false);
    }
  }, [reference]);

  useEffect(() => {
    void load();
    const id = window.setInterval(load, 20_000);
    return () => window.clearInterval(id);
  }, [load]);

  const stepIndex = order ? STEPS.indexOf(order.status) : -1;

  return (
    <div className="min-h-dvh">
      <div className="container-page max-w-xl py-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[12px] uppercase tracking-[0.14em] text-smoke hover:text-gold-200">
          <ArrowLeft size={13} /> Back to menu
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <BrandMark size={38} />
          <div>
            <p className="eyebrow">Order status</p>
            <h1 className="font-display text-2xl text-cream">{reference}</h1>
          </div>
        </div>

        {loading && (
          <div className="mt-10 flex items-center gap-2 text-smoke">
            <Spinner className="text-gold-300" /> Fetching your order…
          </div>
        )}

        {error && !loading && <div className="mt-8"><ErrorState message={error} onRetry={load} /></div>}

        {order && (
          <>
            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-ink-700/50 p-5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-smoke">Current status</span>
                <span className="font-display text-lg text-gold-100">{ORDER_STATUS_LABELS[order.status]}</span>
              </div>

              {order.status === 'cancelled' ? (
                <p className="mt-3 flex items-center gap-2 rounded-lg bg-red-950/40 px-3 py-2 text-[12.5px] text-red-200">
                  <XCircle size={14} /> This order was cancelled. Please speak with a member of staff.
                </p>
              ) : (
                <ol className="mt-5 space-y-3">
                  {STEPS.map((s, i) => {
                    const done = i <= stepIndex;
                    return (
                      <li key={s} className="flex items-center gap-3">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] ${
                            done
                              ? 'border-gold-400/50 bg-gold-400/15 text-gold-200'
                              : 'border-white/10 text-smoke/50'
                          }`}
                        >
                          {done ? <CheckCircle2 size={14} /> : i + 1}
                        </span>
                        <span className={`text-[13.5px] ${done ? 'text-cream' : 'text-smoke/60'}`}>
                          {ORDER_STATUS_LABELS[s]}
                        </span>
                        {i === stepIndex && order.status !== 'completed' && (
                          <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.12em] text-gold-300">
                            {s === 'preparing' ? <ChefHat size={11} /> : <Clock size={11} />} now
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}

              {order.table_identifier && (
                <p className="mt-4 text-[12px] text-smoke">Serving to {order.table_identifier}</p>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-white/[0.07] bg-ink-700/50 p-5">
              <h2 className="eyebrow mb-3">Items</h2>
              <ul className="space-y-2">
                {order.items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 text-[13px]">
                    <span className="text-cream/85">
                      {i.quantity} × {i.item_name_snapshot}
                    </span>
                    <span className="tabular-nums text-smoke">{formatMoney(i.line_total)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-between border-t border-white/[0.07] pt-3 text-sm">
                <span className="text-smoke">Total</span>
                <span className="font-display text-gold-100 tabular-nums">{formatMoney(order.total)}</span>
              </div>
              {order.special_instructions && (
                <p className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[12px] text-smoke">
                  Note: {order.special_instructions}
                </p>
              )}
              <p className="mt-3 text-[11px] text-smoke/60">
                Payment status: pending at the table. No online payment has been taken for this order.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
