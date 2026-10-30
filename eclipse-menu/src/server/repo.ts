import { db } from './db.js';
import { getVenueClock, resolvePricing, isPromotionActive } from '../shared/promo.js';
import type { Business, Category, MenuItem, Promotion, QrCode, Order, OrderItem } from '../shared/types.js';

export interface BusinessRow {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  tagline: string | null;
  description: string | null;
  contact_number: string | null;
  address: string | null;
  city: string | null;
  currency: string;
  timezone: string;
  hero_image_url: string | null;
  hero_title: string | null;
  hero_message: string | null;
  promo_banner: string | null;
  opening_hours: string;
  social_links: string;
  ordering_enabled: number;
  menu_visible: number;
  default_qr_path: string;
  public_base_url: string | null;
}

export function getBusinessRow(): BusinessRow {
  const row = db.prepare('SELECT * FROM businesses ORDER BY id LIMIT 1').get() as BusinessRow | undefined;
  if (!row) throw new Error('No business configured. Run `npm run seed`.');
  return row;
}

export function serializeBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo_url: row.logo_url,
    tagline: row.tagline,
    description: row.description,
    contact_number: row.contact_number,
    address: row.address,
    city: row.city,
    currency: row.currency,
    timezone: row.timezone,
    hero_image_url: row.hero_image_url,
    hero_title: row.hero_title,
    hero_message: row.hero_message,
    promo_banner: row.promo_banner,
    opening_hours: JSON.parse(row.opening_hours || '[]'),
    social_links: JSON.parse(row.social_links || '{}'),
    ordering_enabled: row.ordering_enabled === 1,
    menu_visible: row.menu_visible === 1,
    default_qr_path: row.default_qr_path,
    public_base_url: row.public_base_url,
  };
}

export function getBusiness(): Business {
  return serializeBusiness(getBusinessRow());
}

interface PromoRow {
  id: number;
  name: string;
  description: string | null;
  kind: Promotion['kind'];
  discount_percent: number | null;
  start_at: string | null;
  end_at: string | null;
  days_of_week: string;
  start_time: string | null;
  end_time: string | null;
  is_active: number;
  display_order: number;
}

function itemIdsForPromotion(promotionId: number): number[] {
  return (
    db.prepare('SELECT menu_item_id FROM promotion_items WHERE promotion_id = ?').all(promotionId) as {
      menu_item_id: number;
    }[]
  ).map((r) => r.menu_item_id);
}

export function serializePromotion(row: PromoRow): Promotion {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    discount_percent: row.discount_percent,
    start_at: row.start_at,
    end_at: row.end_at,
    days_of_week: row.days_of_week
      ? row.days_of_week.split(',').map((d) => Number(d)).filter((d) => !Number.isNaN(d))
      : [],
    start_time: row.start_time,
    end_time: row.end_time,
    is_active: row.is_active === 1,
    display_order: row.display_order,
    item_ids: itemIdsForPromotion(row.id),
  };
}

export function listPromotions(businessId: number): Promotion[] {
  const rows = db
    .prepare('SELECT * FROM promotions WHERE business_id = ? ORDER BY display_order, id')
    .all(businessId) as PromoRow[];
  return rows.map(serializePromotion);
}

export function listCategories(businessId: number, opts: { includeInactive?: boolean } = {}): Category[] {
  const rows = db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM menu_items m
                WHERE m.category_id = c.id AND m.is_deleted = 0 AND m.availability_status = 'available') AS item_count
       FROM categories c
       WHERE c.business_id = ? ${opts.includeInactive ? '' : 'AND c.is_active = 1'}
       ORDER BY c.display_order, c.id`,
    )
    .all(businessId) as (Omit<Category, 'is_active'> & { is_active: number; item_count: number })[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    image_url: r.image_url,
    display_order: r.display_order,
    is_active: r.is_active === 1,
    item_count: r.item_count,
  }));
}

interface ItemRow {
  id: number;
  category_id: number;
  category_name: string;
  category_slug: string;
  category_active: number;
  name: string;
  slug: string;
  description: string | null;
  ingredients: string | null;
  allergens: string | null;
  price: number;
  promotional_price: number | null;
  image_url: string | null;
  size_label: string | null;
  availability_status: MenuItem['availability_status'];
  is_signature: number;
  is_popular: number;
  is_new: number;
  display_order: number;
  created_at: string;
  updated_at: string;
}

const ITEM_SELECT = `
  SELECT m.*, c.name AS category_name, c.slug AS category_slug, c.is_active AS category_active
  FROM menu_items m
  JOIN categories c ON c.id = m.category_id
  WHERE m.business_id = ? AND m.is_deleted = 0
`;

export interface ResolvedContext {
  business: Business;
  promotions: Promotion[];
  activePromotions: Promotion[];
  clock: ReturnType<typeof getVenueClock>;
}

export function buildContext(): ResolvedContext {
  const business = getBusiness();
  const promotions = listPromotions(business.id);
  const clock = getVenueClock(business.timezone);
  const activePromotions = promotions.filter((p) => isPromotionActive(p, clock, new Date(), business.timezone));
  return { business, promotions, activePromotions, clock };
}

export function listMenuItems(ctx: ResolvedContext, opts: { includeUnavailable?: boolean } = {}): MenuItem[] {
  const rows = db
    .prepare(`${ITEM_SELECT} ORDER BY c.display_order, c.id, m.display_order, m.id`)
    .all(ctx.business.id) as ItemRow[];

  return rows
    .filter((r) => (opts.includeUnavailable ? true : Number(r.category_active) === 1))
    .map((r) => {
      // Promotions may be item-scoped; only apply a promotion to an item when it
      // has no item list (applies to the whole menu) or the item is included.
      const applicable = ctx.activePromotions.filter((p) => p.item_ids.length === 0 || p.item_ids.includes(r.id));
      const pricing = resolvePricing(r, applicable, ctx.clock, new Date(), ctx.business.timezone);
      return {
        id: r.id,
        category_id: r.category_id,
        category_name: r.category_name,
        category_slug: r.category_slug,
        name: r.name,
        slug: r.slug,
        description: r.description,
        ingredients: r.ingredients,
        price: r.price,
        promotional_price: r.promotional_price,
        effective_price: pricing.effective_price,
        active_promotion: pricing.active_promotion,
        image_url: r.image_url,
        size_label: r.size_label,
        allergens: r.allergens,
        availability_status: r.availability_status,
        is_signature: r.is_signature === 1,
        is_popular: r.is_popular === 1,
        is_new: r.is_new === 1,
        display_order: r.display_order,
        created_at: r.created_at,
        updated_at: r.updated_at,
      } satisfies MenuItem;
    });
}

export function serializeQr(row: Record<string, unknown>, baseUrl: string): QrCode {
  const r = row as unknown as {
    id: number;
    business_id: number;
    label: string;
    table_identifier: string | null;
    area: QrCode['area'];
    destination_path: string;
    token: string;
    is_active: number;
    scan_count: number;
    created_at: string;
  };
  return {
    id: r.id,
    business_id: r.business_id,
    label: r.label,
    table_identifier: r.table_identifier,
    area: r.area,
    destination_path: r.destination_path,
    token: r.token,
    is_active: r.is_active === 1,
    created_at: r.created_at,
    scan_count: r.scan_count,
    url: `${baseUrl.replace(/\/$/, '')}${r.destination_path}`,
  };
}

export function listQrCodes(businessId: number, baseUrl: string): QrCode[] {
  const rows = db.prepare('SELECT * FROM qr_codes WHERE business_id = ? ORDER BY id').all(businessId) as Record<
    string,
    unknown
  >[];
  return rows.map((r) => serializeQr(r, baseUrl));
}

export function serializeOrder(row: Record<string, unknown>): Order {
  const r = row as unknown as Order & { status: Order['status'] };
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(r.id) as OrderItem[];
  return { ...r, items };
}

/**
 * Absolute URL that QR codes should encode.
 * Priority: PUBLIC_BASE_URL env > business.public_base_url setting > request host.
 * Any non-localhost host is forced to https so printed codes always resolve
 * (QR readers will not open a plain-http LAN address on a phone).
 */
export function resolveBaseUrl(req: { headers: Record<string, unknown>; protocol: string }): string {
  const business = getBusinessRow();
  const configured = process.env.PUBLIC_BASE_URL || business.public_base_url;
  if (configured) return configured.replace(/\/$/, '');

  const host =
    ((req.headers['x-forwarded-host'] as string) || '').split(',')[0]?.trim() ||
    (req.headers.host as string) ||
    'localhost:5173';
  const forwardedProto = ((req.headers['x-forwarded-proto'] as string) || '').split(',')[0]?.trim();
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(host);
  const proto = forwardedProto || (isLocal ? req.protocol || 'http' : 'https');
  return `${proto}://${host}`;
}
