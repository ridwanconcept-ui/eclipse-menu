import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchX, WifiOff, Martini } from 'lucide-react';
import type { MenuItem, MenuPayload } from '../../shared/types';
import { api, ApiError } from '../lib/api';
import { EmptyState, ErrorState, useToast } from '../components/ui';
import {
  MenuHeader,
  MenuHero,
  PromoStrip,
  CategoryNav,
  SearchBar,
  MenuFooter,
  emptyFilters,
  type MenuFilters,
} from '../components/menu/MenuParts';
import { ItemDetail, MenuItemCard, MenuItemRow, ItemRowSkeleton } from '../components/menu/ItemViews';
import { CartButtonBar, CartDrawer, OrderConfirmation, useCart } from '../components/menu/Cart';
import type { Order } from '../../shared/types';

export default function MenuPage() {
  const [params, setParams] = useSearchParams();
  const { push } = useToast();
  const [data, setData] = useState<MenuPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [filters, setFilters] = useState<MenuFilters>(emptyFilters);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [tableLabel, setTableLabel] = useState<string | null>(null);

  const qrToken = params.get('t');
  const cart = useCart();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await api.getMenu();
      setData(payload);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We could not load the menu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Resolve a table QR token so the guest sees where they are and ordering is pre-filled. */
  useEffect(() => {
    if (!qrToken) return;
    let cancelled = false;
    api
      .resolveQr(qrToken)
      .then((qr) => {
        if (cancelled) return;
        const label = qr.table_identifier || qr.label;
        setTableLabel(label);
        push('info', `Welcome — you're browsing from ${label}.`);
      })
      .catch((e) => {
        if (cancelled) return;
        push('error', e instanceof ApiError ? e.message : 'That QR code could not be read.');
      });
    return () => {
      cancelled = true;
    };
  }, [qrToken, push]);

  /* Keep the document title in sync with the venue name. */
  useEffect(() => {
    if (data) document.title = `${data.business.name} — Menu`;
  }, [data]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    const q = filters.query.trim().toLowerCase();
    return data.items.filter((item) => {
      if (filters.onlyPromotions && !item.active_promotion && item.promotional_price === null) return false;
      if (filters.onlySignature && !item.is_signature) return false;
      if (filters.onlyPopular && !item.is_popular) return false;
      if (filters.maxPrice !== null && item.effective_price > filters.maxPrice * 100) return false;
      if (!q) return true;
      const haystack = [item.name, item.category_name, item.description, item.ingredients]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, filters]);

  const isFiltering =
    filters.query.trim().length > 0 ||
    filters.onlyPromotions ||
    filters.onlySignature ||
    filters.onlyPopular ||
    filters.maxPrice !== null;

  const sections = useMemo(() => {
    if (!data) return [];
    const cats = activeCategory === 'all' ? data.categories : data.categories.filter((c) => c.slug === activeCategory);
    return cats
      .map((category) => ({
        category,
        items: filteredItems.filter((i) => i.category_id === category.id),
      }))
      .filter((s) => s.items.length > 0);
  }, [data, activeCategory, filteredItems]);

  const handleAdd = (item: MenuItem & { __qty?: number }) => {
    cart.add(item, item.__qty ?? 1);
    push('success', `${item.name} added to your order`);
  };

  const clearQrToken = () => {
    const next = new URLSearchParams(params);
    next.delete('t');
    setParams(next, { replace: true });
    setTableLabel(null);
  };

  /* ---------------- Render ---------------- */
  if (loading) return <MenuSkeleton />;

  if (error) {
    return (
      <div className="container-page flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <WifiOff size={28} className="text-gold-400/70" />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  if (!data) return null;

  if (data.business.menu_visible === false) {
    return (
      <div className="container-page flex min-h-[65vh] flex-col items-center justify-center">
        <EmptyState
          icon={<Martini size={30} />}
          title="Our menu is being refreshed"
          message="The digital menu is temporarily unavailable. Please ask a member of staff for tonight's menu."
          action={<a className="btn-ghost mt-2" href="/">Try again</a>}
        />
      </div>
    );
  }

  const promotionsNow = data.promotions_active ?? [];
  const orderingEnabled = data.ordering_enabled && data.business.ordering_enabled;

  return (
    <div className="min-h-dvh pb-24 sm:pb-0">
      <MenuHeader
        business={data.business}
        onOpenSearch={() => {
          const el = document.querySelector<HTMLInputElement>('input[type="search"]');
          el?.focus();
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }}
        cartCount={cart.count}
        onOpenCart={() => setCartOpen(true)}
        tableLabel={tableLabel}
      />

      <MenuHero
        business={data.business}
        activePromo={promotionsNow.find((p) => p.kind === 'happy_hour') ?? promotionsNow[0] ?? null}
      />

      <PromoStrip promotions={promotionsNow} timezone={data.business.timezone} />

      <div className="sticky top-14 z-30 -mb-2 border-b border-white/[0.06] bg-ink-900/92 backdrop-blur-xl sm:top-16">
        <div className="container-page">
          <CategoryNav categories={data.categories} active={activeCategory} onSelect={setActiveCategory} />
        </div>
      </div>

      <main className="container-page">
        <div className="pt-2">
          <SearchBar
            filters={filters}
            onChange={setFilters}
            resultCount={filteredItems.length}
            autoFocus={params.get('search') === '1'}
          />
        </div>

        {tableLabel && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gold-400/20 bg-gold-400/[0.06] px-3 py-2 text-[12px] text-gold-100">
            <span>You're ordering from <strong>{tableLabel}</strong>.</span>
            <button onClick={clearQrToken} className="text-[11px] uppercase tracking-[0.1em] text-gold-300 hover:text-gold-100">
              Change
            </button>
          </div>
        )}

        {sections.length === 0 ? (
          <div className="py-10">
            <EmptyState
              icon={<SearchX size={28} />}
              title="Nothing matches that search"
              message={
                isFiltering
                  ? 'Try a different keyword, or clear your filters to see the full menu.'
                  : 'This category has no items available right now.'
              }
              action={
                isFiltering ? (
                  <button className="btn-ghost mt-2" onClick={() => setFilters(emptyFilters)}>
                    Clear search & filters
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          sections.map(({ category, items }) => (
            <section key={category.id} id={category.slug} className="scroll-mt-32 pt-6 sm:pt-8" aria-labelledby={`h-${category.slug}`}>
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <h2 id={`h-${category.slug}`} className="font-display text-xl text-cream sm:text-2xl">
                    {category.name}
                  </h2>
                  {category.description && (
                    <p className="mt-0.5 max-w-xl text-[12px] leading-relaxed text-smoke/80">{category.description}</p>
                  )}
                </div>
                <span className="shrink-0 text-[10.5px] uppercase tracking-[0.14em] text-smoke/50">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              <div className="gold-rule mb-3" />

              {/* Mobile: compact rows */}
              <div className="space-y-2 sm:hidden">
                {items.map((item) => (
                  <MenuItemRow
                    key={item.id}
                    item={item}
                    onSelect={setSelected}
                    onAdd={orderingEnabled ? handleAdd : undefined}
                  />
                ))}
              </div>

              {/* Tablet & desktop: image cards */}
              <div className="hidden gap-3.5 sm:grid sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    onSelect={setSelected}
                    onAdd={orderingEnabled ? handleAdd : undefined}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        {orderingEnabled && (
          <p className="mt-10 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-center text-[12px] text-smoke">
            Ordering is enabled — add items and send your order to the bar. Prices shown are before any staff discount.
          </p>
        )}
      </main>

      <MenuFooter business={data.business} />

      <ItemDetail
        item={selected}
        onClose={() => setSelected(null)}
        onAdd={orderingEnabled ? handleAdd : undefined}
        orderingEnabled={orderingEnabled}
      />

      {orderingEnabled && (
        <>
          <CartDrawer
            open={cartOpen}
            onClose={() => setCartOpen(false)}
            cart={cart}
            tableIdentifier={tableLabel}
            qrToken={qrToken}
            onOrderPlaced={setPlacedOrder}
          />
          <OrderConfirmation order={placedOrder} onClose={() => setPlacedOrder(null)} />
          <CartButtonBar count={cart.count} subtotal={cart.subtotal} onOpen={() => setCartOpen(true)} />
        </>
      )}
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="min-h-dvh">
      <div className="container-page flex h-14 items-center gap-3 sm:h-16">
        <div className="skeleton h-9 w-9 rounded-full" />
        <div className="skeleton h-3.5 w-40 rounded" />
      </div>
      <div className="container-page py-10">
        <div className="skeleton mb-3 h-4 w-24 rounded" />
        <div className="skeleton h-9 w-3/4 max-w-md rounded-lg" />
        <div className="skeleton mt-4 h-3 w-full max-w-lg rounded" />
        <div className="skeleton mt-2 h-3 w-2/3 max-w-md rounded" />
      </div>
      <div className="container-page space-y-2 pt-4">
        <div className="mb-4 flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-7 w-24 rounded-full" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <ItemRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
