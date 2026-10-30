import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShoppingBag, Trash2, Minus, Plus, CheckCircle2, MapPin } from 'lucide-react';
import type { MenuItem, Order } from '../../../shared/types';
import { formatMoney } from '../../../shared/money';
import { ORDER_STATUS_LABELS } from '../../../shared/types';
import { api, ApiError } from '../../lib/api';
import { Badge, EmptyState, Field, Modal, Spinner, useToast } from '../ui';

export interface CartLine {
  menu_item_id: number;
  name: string;
  unit_price: number;
  quantity: number;
  image_url: string | null;
  category_name: string;
  variant: string | null;
  instructions: string | null;
}

const STORAGE_KEY = 'eclipse.cart.v1';

export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* storage may be unavailable (private mode) — cart still works in memory */
    }
  }, [lines]);

  const add = useCallback((item: MenuItem, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.menu_item_id === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menu_item_id === item.id ? { ...l, quantity: Math.min(50, l.quantity + quantity) } : l,
        );
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          name: item.name,
          unit_price: item.effective_price,
          quantity,
          image_url: item.image_url,
          category_name: item.category_name,
          variant: item.size_label,
          instructions: null,
        },
      ];
    });
  }, []);

  const setQuantity = useCallback((id: number, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.menu_item_id !== id)
        : prev.map((l) => (l.menu_item_id === id ? { ...l, quantity: Math.min(50, quantity) } : l)),
    );
  }, []);

  const remove = useCallback((id: number) => setLines((prev) => prev.filter((l) => l.menu_item_id !== id)), []);
  const clear = useCallback(() => setLines([]), []);

  const count = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);
  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0), [lines]);

  return { lines, add, setQuantity, remove, clear, count, subtotal };
}

export function CartDrawer({
  open,
  onClose,
  cart,
  tableIdentifier,
  qrToken,
  onOrderPlaced,
}: {
  open: boolean;
  onClose: () => void;
  cart: ReturnType<typeof useCart>;
  tableIdentifier: string | null;
  qrToken: string | null;
  onOrderPlaced: (order: Order) => void;
}) {
  const { push } = useToast();
  const [table, setTable] = useState(tableIdentifier ?? '');
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (tableIdentifier) setTable(tableIdentifier);
  }, [tableIdentifier]);

  const submit = async () => {
    if (!cart.lines.length) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const { order } = await api.placeOrder({
        table_identifier: table.trim() || null,
        customer_name: name.trim() || null,
        special_instructions: instructions.trim() || null,
        qr_token: qrToken,
        items: cart.lines.map((l) => ({
          menu_item_id: l.menu_item_id,
          quantity: l.quantity,
          selected_variant: l.variant,
          special_instructions: l.instructions,
        })),
      });
      // Only clear the cart once the server has confirmed the order was saved.
      cart.clear();
      setInstructions('');
      push('success', `Order ${order.order_reference} sent to the bar.`);
      onOrderPlaced(order);
      onClose();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not send your order. Please try again.';
      setError(message);
      if (e instanceof ApiError && e.fields) setFieldErrors(e.fields);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <ShoppingBag size={17} className="text-gold-300" /> Your order
        </span>
      }
      size="md"
      footer={
        cart.lines.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-smoke">Subtotal</span>
              <span className="font-display text-lg text-gold-100 tabular-nums">{formatMoney(cart.subtotal)}</span>
            </div>
            <p className="text-[11px] leading-snug text-smoke/60">
              Payment is settled with your server at the table. Your order is sent to the bar for preparation.
            </p>
            {error && <p className="rounded-lg bg-red-950/50 px-3 py-2 text-[12px] text-red-200">{error}</p>}
            <button className="btn-gold w-full !py-3" onClick={submit} disabled={submitting}>
              {submitting ? <Spinner /> : null}
              {submitting ? 'Sending to the bar…' : `Place order · ${formatMoney(cart.subtotal)}`}
            </button>
          </div>
        ) : undefined
      }
    >
      {cart.lines.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={26} />}
          title="Your order is empty"
          message="Add drinks from the menu and they will appear here."
        />
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-white/[0.06]">
            {cart.lines.map((line) => (
              <li key={line.menu_item_id} className="flex items-start gap-3 py-3">
                <div className="placeholder-tile flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ring-1 ring-white/10">
                  {line.image_url ? (
                    <img src={line.image_url} alt="" className="h-full w-full rounded-lg object-cover" />
                  ) : (
                    <span className="font-display text-sm text-gold-300/60">{line.name.slice(0, 1)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-cream">{line.name}</p>
                  <p className="text-[11px] text-smoke/70">
                    {formatMoney(line.unit_price)} · {line.category_name}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="flex items-center rounded-full border border-white/[0.12]">
                    <button
                      className="h-7 w-7 text-cream/70 hover:text-cream"
                      onClick={() => cart.setQuantity(line.menu_item_id, line.quantity - 1)}
                      aria-label={`Reduce ${line.name}`}
                    >
                      <Minus size={12} className="mx-auto" />
                    </button>
                    <span className="w-6 text-center text-[12.5px] tabular-nums">{line.quantity}</span>
                    <button
                      className="h-7 w-7 text-cream/70 hover:text-cream"
                      onClick={() => cart.setQuantity(line.menu_item_id, line.quantity + 1)}
                      aria-label={`Add another ${line.name}`}
                    >
                      <Plus size={12} className="mx-auto" />
                    </button>
                  </div>
                  <button
                    className="p-1 text-smoke/60 hover:text-red-300"
                    onClick={() => cart.remove(line.menu_item_id)}
                    aria-label={`Remove ${line.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Table / seat" htmlFor="table" error={fieldErrors.table_identifier} hint="From the QR code if you scanned one">
              <input
                id="table"
                className="input"
                value={table}
                onChange={(e) => setTable(e.target.value)}
                placeholder="e.g. VIP 02"
                maxLength={40}
              />
            </Field>
            <Field label="Name (optional)" htmlFor="customer-name">
              <input
                id="customer-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="So staff can find you"
                maxLength={80}
              />
            </Field>
          </div>
          <Field label="Special instructions (optional)" htmlFor="instructions">
            <textarea
              id="instructions"
              className="input min-h-[70px] resize-y"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="No ice, extra lime, serve with the food…"
              maxLength={600}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

export function OrderConfirmation({
  order,
  onClose,
}: {
  order: Order | null;
  onClose: () => void;
}) {
  if (!order) return null;
  return (
    <Modal open={!!order} onClose={onClose} size="sm" title="Order confirmed">
      <div className="flex flex-col items-center py-2 text-center">
        <CheckCircle2 size={40} className="text-emerald-300" />
        <p className="mt-3 text-[13px] text-smoke">Your order has been received by the bar.</p>
        <p className="mt-2 font-display text-2xl tracking-wide text-gold-100">{order.order_reference}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Badge tone="gold">{ORDER_STATUS_LABELS[order.status]}</Badge>
          {order.table_identifier && (
            <span className="chip border-white/[0.12] bg-white/[0.04] text-smoke">
              <MapPin size={9} /> {order.table_identifier}
            </span>
          )}
        </div>
        <ul className="mt-4 w-full space-y-1.5 border-t border-white/[0.07] pt-3 text-left text-[12.5px]">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3">
              <span className="text-cream/85">
                {i.quantity} × {i.item_name_snapshot}
              </span>
              <span className="tabular-nums text-smoke">{formatMoney(i.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex w-full justify-between border-t border-white/[0.07] pt-2 text-sm">
          <span className="text-smoke">Total</span>
          <span className="font-display text-gold-100 tabular-nums">{formatMoney(order.total)}</span>
        </div>
        <p className="mt-4 text-[11px] leading-snug text-smoke/60">
          Payment is collected by staff. This order is not paid — no payment has been taken online.
        </p>
        <a
          href={`/order/${order.order_reference}`}
          className="btn-ghost mt-4 w-full"
        >
          Track order status
        </a>
      </div>
    </Modal>
  );
}

export function CartButtonBar({
  count,
  subtotal,
  onOpen,
}: {
  count: number;
  subtotal: number;
  onOpen: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 safe-bottom sm:hidden">
      <button
        onClick={onOpen}
        className="flex w-full items-center justify-between rounded-full bg-gold-300 px-5 py-3 text-ink-900 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingBag size={16} /> View order ({count})
        </span>
        <span className="text-sm font-semibold tabular-nums">{formatMoney(subtotal)}</span>
      </button>
    </div>
  );
}
