import { useEffect, useState } from 'react';
import {
  Martini,
  Wine,
  Beer,
  Coffee,
  GlassWater,
  CupSoda,
  Flame,
  Sparkles,
  Star,
  Plus,
  X,
  AlertCircle,
  Info,
} from 'lucide-react';
import type { MenuItem } from '../../../shared/types';
import { formatMoney } from '../../../shared/money';
import { Badge, Modal, Skeleton } from '../ui';

/* Pick a fitting icon for items without a photo, based on category / name. */
export function itemIcon(item: Pick<MenuItem, 'category_name' | 'name'>) {
  const key = `${item.category_name} ${item.name}`.toLowerCase();
  if (/shisha|coal|hookah/.test(key)) return Flame;
  if (/beer|stout|heineken|lager|budweiser|trophy|goldberg|desperado|legend|castle/.test(key)) return Beer;
  if (/champagne|wine|rose|rosé|brut|belaire|moet|martini|jp chenet|carlo|four cousin/.test(key)) return Wine;
  if (/milkshake|shake|smoothie|baileys|cream/.test(key)) return Coffee;
  if (/water/.test(key)) return GlassWater;
  if (/juice|beverage|soda|energy|red bull|power horse|coke|teem|tonic/.test(key)) return CupSoda;
  if (/whisk|scotch|cognac|brandy|tequila|vodka|gin|rum|liqueur|cocktail|mojito|shot/.test(key)) return Martini;
  return Sparkles;
}

export function ItemThumb({ item, className = '', size = 64 }: { item: MenuItem; className?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const Icon = itemIcon(item);

  if (item.image_url && !failed) {
    return (
      <img
        src={item.image_url}
        alt={item.name}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-xl object-cover ring-1 ring-white/10 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`placeholder-tile flex shrink-0 items-center justify-center rounded-xl ring-1 ring-white/[0.07] ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.4)} className="text-gold-300/70" strokeWidth={1.4} />
    </div>
  );
}

function PriceBlock({ item, align = 'right' }: { item: MenuItem; align?: 'right' | 'left' }) {
  const discounted = item.effective_price < item.price;
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      {discounted && (
        <div className="text-[11px] text-smoke/60 line-through tabular-nums">{formatMoney(item.price)}</div>
      )}
      <div className={`font-medium tabular-nums ${discounted ? 'text-gold-200' : 'text-gold-100'}`}>
        {formatMoney(item.effective_price)}
      </div>
      {item.active_promotion && (
        <div className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-gold-400/80">{item.active_promotion}</div>
      )}
    </div>
  );
}

export function ItemFlags({ item }: { item: MenuItem }) {
  return (
    <>
      {item.is_signature && (
        <span className="chip border-gold-400/40 bg-gold-400/10 text-gold-200">
          <Sparkles size={9} /> Signature
        </span>
      )}
      {item.is_popular && !item.is_signature && (
        <span className="chip border-white/15 bg-white/[0.05] text-cream/80">
          <Star size={9} /> Popular
        </span>
      )}
      {item.is_new && <span className="chip border-sky-400/30 bg-sky-400/10 text-sky-200">New</span>}
      {item.availability_status === 'sold_out' && <Badge tone="red">Sold out</Badge>}
      {item.availability_status === 'unavailable' && <Badge tone="muted">Unavailable</Badge>}
    </>
  );
}

/** Compact list row used on mobile and in search results. */
export function MenuItemRow({
  item,
  onSelect,
  onAdd,
}: {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
  onAdd?: (item: MenuItem) => void;
}) {
  const unavailable = item.availability_status !== 'available';
  return (
    <div
      className={`flex items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-ink-700/40 p-3
        transition-colors hover:border-gold-400/25 hover:bg-ink-600/50 ${unavailable ? 'opacity-60' : ''}`}
    >
      <button
        onClick={() => onSelect(item)}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
        aria-label={`View ${item.name}`}
      >
        <ItemThumb item={item} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display text-[15px] leading-snug text-cream">{item.name}</h3>
            <div className="shrink-0 text-[13px]">
              <PriceBlock item={item} />
            </div>
          </div>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-smoke/85">{item.description}</p>
          )}
          {(item.is_signature || item.is_popular || item.is_new || unavailable) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <ItemFlags item={item} />
            </div>
          )}
        </div>
      </button>
      {onAdd && !unavailable && (
        <button
          onClick={() => onAdd(item)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-300
            text-ink-900 shadow-md transition hover:bg-gold-200 active:scale-95"
          aria-label={`Add ${item.name} to order`}
        >
          <Plus size={15} />
        </button>
      )}
    </div>
  );
}

/** Richer card used on desktop / tablets. */
export function MenuItemCard({
  item,
  onSelect,
  onAdd,
}: {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
  onAdd?: (item: MenuItem) => void;
}) {
  const unavailable = item.availability_status !== 'available';
  const [failed, setFailed] = useState(false);
  const Icon = itemIcon(item);

  return (
    <article
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-700/50
        transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-400/30 hover:shadow-card ${
          unavailable ? 'opacity-65' : ''
        }`}
    >
      <button onClick={() => onSelect(item)} className="relative block aspect-[16/10] w-full overflow-hidden" aria-label={`View ${item.name}`}>
        {item.image_url && !failed ? (
          <img
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="placeholder-tile flex h-full w-full items-center justify-center">
            <Icon size={44} className="text-gold-300/45" strokeWidth={1.1} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-ink-900/90 to-transparent" />
        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
          <ItemFlags item={item} />
        </div>
      </button>

      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <button onClick={() => onSelect(item)} className="min-w-0 text-left">
            <h3 className="truncate font-display text-base text-cream group-hover:text-gold-100">{item.name}</h3>
          </button>
          <div className="shrink-0 text-sm">
            <PriceBlock item={item} />
          </div>
        </div>
        {item.description && (
          <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-smoke/85">{item.description}</p>
        )}
        {item.ingredients && (
          <p className="mt-1.5 line-clamp-1 text-[11px] italic text-smoke/60">{item.ingredients}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3">
          <button onClick={() => onSelect(item)} className="text-[11px] uppercase tracking-[0.14em] text-gold-400/80 hover:text-gold-200">
            Details
          </button>
          {onAdd && !unavailable && (
            <button onClick={() => onAdd(item)} className="btn-gold !px-3 !py-1.5 text-[12px]">
              <Plus size={13} /> Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Full product detail panel. */
export function ItemDetail({
  item,
  onClose,
  onAdd,
  orderingEnabled,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onAdd?: (item: MenuItem) => void;
  orderingEnabled?: boolean;
}) {
  const [quantity, setQuantity] = useState(1);
  useEffect(() => setQuantity(1), [item?.id]);
  if (!item) return null;
  const Icon = itemIcon(item);
  const unavailable = item.availability_status !== 'available';
  const discounted = item.effective_price < item.price;

  return (
    <Modal open={!!item} onClose={onClose} size="lg">
      <div className="-mx-5 -mt-4">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink-800">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <div className="placeholder-tile flex h-full w-full items-center justify-center">
              <Icon size={68} className="text-gold-300/40" strokeWidth={1} />
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-cream backdrop-blur hover:bg-black/80"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">{item.category_name}</span>
            <ItemFlags item={item} />
          </div>
          <h2 className="mt-1.5 font-display text-2xl text-cream">{item.name}</h2>

          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="font-display text-2xl text-gold-200 tabular-nums">{formatMoney(item.effective_price)}</span>
            {discounted && (
              <span className="text-sm text-smoke/60 line-through tabular-nums">{formatMoney(item.price)}</span>
            )}
            {item.active_promotion && (
              <span className="chip border-gold-400/40 bg-gold-400/10 text-gold-200">{item.active_promotion}</span>
            )}
            {item.size_label && <span className="text-xs text-smoke">{item.size_label}</span>}
          </div>

          {item.description && <p className="mt-3 text-sm leading-relaxed text-cream/85">{item.description}</p>}

          {item.ingredients && (
            <section className="mt-4">
              <h3 className="eyebrow mb-1">Ingredients</h3>
              <p className="text-sm leading-relaxed text-smoke">{item.ingredients}</p>
            </section>
          )}

          {item.allergens && (
            <section className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
              <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                <AlertCircle size={12} /> Allergen information
              </h3>
              <p className="text-[13px] leading-relaxed text-amber-100/90">{item.allergens}</p>
            </section>
          )}

          {unavailable && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[13px] text-smoke">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                {item.availability_status === 'sold_out'
                  ? 'This item is sold out for tonight. Ask your host about alternatives.'
                  : 'This item is not available right now.'}
              </span>
            </div>
          )}

          {orderingEnabled && !unavailable && onAdd && (
            <div className="mt-5 flex items-center gap-3">
              <div className="flex items-center rounded-full border border-white/[0.12] bg-ink-800">
                <button
                  className="h-10 w-10 text-lg text-cream/80 hover:text-cream disabled:opacity-40"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                  {quantity}
                </span>
                <button
                  className="h-10 w-10 text-lg text-cream/80 hover:text-cream"
                  onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <button
                className="btn-gold flex-1"
                onClick={() => {
                  onAdd({ ...item, __qty: quantity } as MenuItem & { __qty: number });
                  onClose();
                }}
              >
                Add to order · {formatMoney(item.effective_price * quantity)}
              </button>
            </div>
          )}

          {!orderingEnabled && (
            <p className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-center text-[12.5px] text-smoke">
              To order, simply call a member of staff — they will take it from here.
            </p>
          )}
          <div className="h-2" />
        </div>
      </div>
    </Modal>
  );
}

export function ItemRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-ink-700/30 p-3">
      <Skeleton className="h-16 w-16 !rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-14" />
    </div>
  );
}

export { PriceBlock };
