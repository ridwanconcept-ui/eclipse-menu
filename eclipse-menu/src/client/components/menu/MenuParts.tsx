import { useEffect, useMemo, useState } from 'react';
import {
  Search,
  X,
  ShoppingBag,
  Clock,
  MapPin,
  Phone,
  Instagram,
  MessageCircle,
  ChevronRight,
  Sparkles,
  SlidersHorizontal,
  ArrowUpRight,
} from 'lucide-react';
import type { Business, Category, Promotion } from '../../../shared/types';
import { DAY_NAMES } from '../../../shared/types';
import { describeSchedule, prettyTime, timeToMinutes } from '../../../shared/promo';
import { BrandLogo, Badge } from '../ui';

/* ------------------------------------------------------------------ *
 * Header
 * ------------------------------------------------------------------ */
export function MenuHeader({
  business,
  onOpenSearch,
  cartCount,
  onOpenCart,
  tableLabel,
}: {
  business: Business;
  onOpenSearch: () => void;
  cartCount: number;
  onOpenCart: () => void;
  tableLabel?: string | null;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-900/85 backdrop-blur-xl">
      <div className="container-page flex h-14 items-center justify-between gap-3 sm:h-16">
        <a href="#top" className="flex min-w-0 items-center gap-2.5">
          <BrandLogo logoUrl={business.logo_url} size={34} />
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] leading-tight tracking-wide text-cream sm:text-lg">
              {business.name}
            </div>
            {business.tagline && (
              <div className="hidden truncate text-[10px] uppercase tracking-[0.22em] text-gold-400/80 sm:block">
                {business.tagline}
              </div>
            )}
          </div>
        </a>

        <div className="flex items-center gap-1.5">
          {tableLabel && (
            <span className="hidden items-center gap-1 rounded-full border border-gold-400/30 bg-gold-400/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-gold-200 sm:inline-flex">
              <MapPin size={10} /> {tableLabel}
            </span>
          )}
          <button
            onClick={onOpenSearch}
            className="flex h-9 w-9 items-center justify-center rounded-full text-cream/80 transition hover:bg-white/[0.06] hover:text-cream"
            aria-label="Search the menu"
          >
            <Search size={18} />
          </button>
          {business.ordering_enabled && (
            <button
              onClick={onOpenCart}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-cream/80 transition hover:bg-white/[0.06] hover:text-cream"
              aria-label={`View order (${cartCount} items)`}
            >
              <ShoppingBag size={18} />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-300 px-1 text-[10px] font-bold text-ink-900">
                  {cartCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * Hero
 * ------------------------------------------------------------------ */
export function MenuHero({ business, activePromo }: { business: Business; activePromo?: Promotion | null }) {
  return (
    <section id="top" className="relative overflow-hidden border-b border-white/[0.06]">
      <div className="absolute inset-0">
        {business.hero_image_url ? (
          <img
            src={business.hero_image_url}
            alt=""
            className="h-full w-full object-cover opacity-55"
            fetchPriority="high"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              backgroundImage:
                'radial-gradient(120% 100% at 15% 0%, rgba(208,172,107,0.22), transparent 55%), radial-gradient(90% 90% at 90% 100%, rgba(208,172,107,0.12), transparent 60%), linear-gradient(160deg,#14141a,#08080a)',
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/70 to-ink-900/20" />
      </div>

      <div className="container-page relative py-10 sm:py-14">
        <div className="max-w-2xl animate-fade-up">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="gold">Menu · {business.currency} (₦)</Badge>
            {activePromo && (
              <span className="chip border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live: {activePromo.name}
              </span>
            )}
          </div>
          <h1 className="text-balance font-display text-[32px] leading-[1.1] text-cream sm:text-5xl">
            {business.hero_title || 'Explore Our Menu'}
          </h1>
          <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-cream/70 sm:text-[15px]">
            {business.hero_message || business.description}
          </p>
          {business.promo_banner && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold-400/30 bg-gold-400/[0.08] px-3.5 py-1.5 text-[12px] text-gold-100">
              <Sparkles size={13} /> {business.promo_banner}
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-smoke">
            {business.city && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={12} className="text-gold-400/70" /> {business.city}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock size={12} className="text-gold-400/70" /> {openingSummary(business)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function openingSummary(business: Business): string {
  const hours = business.opening_hours ?? [];
  if (!hours.length) return 'Open tonight';
  const today = DAY_NAMES[new Date().getDay()];
  const todayHours = hours.find((h) => h.day === today);
  if (!todayHours) return 'Open tonight';
  if (todayHours.closed) return 'Closed today';
  if (todayHours.open && todayHours.close) return `${prettyTime(todayHours.open)} – ${prettyTime(todayHours.close)}`;
  return 'Open tonight';
}

/* ------------------------------------------------------------------ *
 * Live promotion strip
 * ------------------------------------------------------------------ */
export function PromoStrip({ promotions, timezone }: { promotions: Promotion[]; timezone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const visible = promotions.filter((p) => p.is_active);
  if (!visible.length) return null;

  return (
    <section aria-label="Current promotions" className="border-b border-white/[0.06] bg-ink-800/40">
      <div className="container-page py-4">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="eyebrow flex items-center gap-1.5">
            <Sparkles size={12} /> Happening now
          </h2>
          <span className="text-[10.5px] text-smoke/60">Venue time {venueTime(timezone, now)}</span>
        </div>
        <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {visible.map((promo) => (
            <li
              key={promo.id}
              className="min-w-[260px] max-w-[320px] snap-start rounded-2xl border border-gold-400/20 bg-gradient-to-br
                from-gold-400/[0.10] to-transparent p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-[15px] leading-snug text-gold-100">{promo.name}</h3>
                {promo.discount_percent ? (
                  <span className="shrink-0 font-display text-lg text-gold-200">{promo.discount_percent}%</span>
                ) : null}
              </div>
              {promo.description && (
                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-cream/70">{promo.description}</p>
              )}
              <p className="mt-2 flex items-center gap-1 text-[10.5px] uppercase tracking-[0.1em] text-gold-300/80">
                <Clock size={10} /> {describeSchedule(promo, DAY_NAMES)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function venueTime(timezone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

/* ------------------------------------------------------------------ *
 * Category navigation + search + filters
 * ------------------------------------------------------------------ */
export interface MenuFilters {
  query: string;
  onlyPromotions: boolean;
  onlySignature: boolean;
  onlyPopular: boolean;
  maxPrice: number | null;
}

export const emptyFilters: MenuFilters = {
  query: '',
  onlyPromotions: false,
  onlySignature: false,
  onlyPopular: false,
  maxPrice: null,
};

export function CategoryNav({
  categories,
  active,
  onSelect,
}: {
  categories: Category[];
  active: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <nav
      aria-label="Menu categories"
      className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 py-2.5 sm:mx-0 sm:px-0"
    >
      <button
        onClick={() => onSelect('all')}
        className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition ${
          active === 'all'
            ? 'border-gold-400/60 bg-gold-400/15 text-gold-100'
            : 'border-white/10 text-smoke hover:border-white/20 hover:text-cream'
        }`}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.slug)}
          className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition ${
            active === c.slug
              ? 'border-gold-400/60 bg-gold-400/15 text-gold-100'
              : 'border-white/10 text-smoke hover:border-white/20 hover:text-cream'
          }`}
        >
          {c.name}
          {typeof c.item_count === 'number' && c.item_count > 0 && (
            <span className="ml-1.5 text-[10px] text-smoke/60">{c.item_count}</span>
          )}
        </button>
      ))}
    </nav>
  );
}

export function SearchBar({
  filters,
  onChange,
  resultCount,
  autoFocus,
}: {
  filters: MenuFilters;
  onChange: (next: MenuFilters) => void;
  resultCount: number;
  autoFocus?: boolean;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = useMemo(
    () =>
      [filters.onlyPromotions, filters.onlySignature, filters.onlyPopular, filters.maxPrice !== null].filter(Boolean).length,
    [filters],
  );

  return (
    <div className="z-10 -mx-4 border-b border-white/[0.06] px-4 pb-2 pt-3 sm:mx-0 sm:px-0">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-smoke/60" />
          <input
            type="search"
            inputMode="search"
            autoFocus={autoFocus}
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
            placeholder="Search cocktails, whisky, shisha…"
            aria-label="Search the menu"
            className="input !rounded-full !py-2 !pl-9 !pr-9 text-[13px]"
          />
          {filters.query && (
            <button
              onClick={() => onChange({ ...filters, query: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-smoke hover:text-cream"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
            activeFilterCount
              ? 'border-gold-400/50 bg-gold-400/15 text-gold-100'
              : 'border-white/10 text-smoke hover:text-cream'
          }`}
          aria-label="Filters"
          aria-expanded={showFilters}
        >
          <SlidersHorizontal size={15} />
          {activeFilterCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gold-300 text-[9px] font-bold text-ink-900">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="mt-2 animate-fade-in space-y-2.5 rounded-xl border border-white/[0.07] bg-ink-800/70 p-3">
          <div className="flex flex-wrap gap-1.5">
            <FilterPill
              active={filters.onlyPromotions}
              onClick={() => onChange({ ...filters, onlyPromotions: !filters.onlyPromotions })}
            >
              On promotion
            </FilterPill>
            <FilterPill
              active={filters.onlySignature}
              onClick={() => onChange({ ...filters, onlySignature: !filters.onlySignature })}
            >
              Signature
            </FilterPill>
            <FilterPill active={filters.onlyPopular} onClick={() => onChange({ ...filters, onlyPopular: !filters.onlyPopular })}>
              Popular
            </FilterPill>
          </div>
          <div>
            <label htmlFor="price-range" className="mb-1 block text-[10.5px] uppercase tracking-[0.12em] text-smoke">
              Max price: {filters.maxPrice === null ? 'Any' : `₦${filters.maxPrice.toLocaleString()}`}
            </label>
            <input
              id="price-range"
              type="range"
              min={500}
              max={700000}
              step={500}
              value={filters.maxPrice ?? 700000}
              onChange={(e) =>
                onChange({ ...filters, maxPrice: Number(e.target.value) >= 700000 ? null : Number(e.target.value) })
              }
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-gold-400"
            />
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => onChange({ ...emptyFilters, query: filters.query })}
              className="text-[11px] uppercase tracking-[0.12em] text-gold-300 hover:text-gold-100"
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {filters.query.trim() && (
        <p className="mt-1.5 px-1 text-[11px] text-smoke/70" aria-live="polite">
          {resultCount} {resultCount === 1 ? 'result' : 'results'} for “{filters.query.trim()}”
        </p>
      )}
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-[11.5px] transition ${
        active ? 'border-gold-400/60 bg-gold-400/15 text-gold-100' : 'border-white/10 text-smoke hover:text-cream'
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Footer
 * ------------------------------------------------------------------ */
export function MenuFooter({ business }: { business: Business }) {
  const social = business.social_links ?? {};
  const instagram = social.instagram?.startsWith('http') ? social.instagram : null;
  const whatsappRaw = social.whatsapp?.replace(/[^\d]/g, '');
  const whatsapp = whatsappRaw ? `https://wa.me/${whatsappRaw}` : null;

  return (
    <footer className="mt-14 border-t border-white/[0.06] bg-ink-800/40">
      <div className="container-page py-10">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandLogo logoUrl={business.logo_url} size={30} />
              <span className="font-display text-base text-cream">{business.name}</span>
            </div>
            {business.tagline && <p className="mt-2 text-[12.5px] text-gold-400/80">{business.tagline}</p>}
            {business.description && <p className="mt-2 text-[12px] leading-relaxed text-smoke/80">{business.description}</p>}
          </div>

          <div className="text-[12.5px] text-smoke">
            <h2 className="eyebrow mb-2">Find us</h2>
            {business.address && <p>{business.address}</p>}
            {business.city && <p>{business.city}</p>}
            {business.contact_number && (
              <a href={`tel:${business.contact_number}`} className="mt-1 inline-flex items-center gap-1.5 text-gold-200 hover:text-gold-100">
                <Phone size={12} /> {business.contact_number}
              </a>
            )}
          </div>

          <div className="text-[12.5px] text-smoke">
            <h2 className="eyebrow mb-2">Opening hours</h2>
            <ul className="space-y-0.5">
              {(business.opening_hours ?? []).slice(0, 7).map((h) => (
                <li key={h.day} className="flex justify-between gap-3">
                  <span>{h.day}</span>
                  <span className="tabular-nums text-cream/70">
                    {h.closed || !h.open || !h.close ? 'Closed' : `${h.open} – ${h.close}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] pt-5 text-[11px] text-smoke/60 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {business.name}. All prices in Nigerian Naira (₦) and subject to change.
          </p>
          <div className="flex items-center gap-3">
            {instagram && (
              <a href={instagram} target="_blank" rel="noreferrer noopener" className="hover:text-gold-200" aria-label="Instagram">
                <Instagram size={15} />
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer noopener" className="hover:text-gold-200" aria-label="WhatsApp">
                <MessageCircle size={15} />
              </a>
            )}
            <a href="/admin" className="inline-flex items-center gap-0.5 hover:text-gold-200">
              Staff <ArrowUpRight size={11} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
