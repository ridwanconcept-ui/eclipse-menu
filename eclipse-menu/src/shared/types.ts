/**
 * Shared domain types used by both the API server and the React client.
 * Money is ALWAYS stored and transported as integer minor units (kobo).
 * 1 NGN = 100 kobo. Never use floating point for money.
 */

export type AvailabilityStatus = 'available' | 'unavailable' | 'sold_out';
export type AdminRole = 'owner' | 'manager' | 'staff';
export type PromotionKind = 'happy_hour' | 'special' | 'featured' | 'bundle';
export type OrderStatus = 'pending' | 'preparing' | 'served' | 'completed' | 'cancelled';
export type VenueArea = 'main_bar' | 'vip_lounge' | 'restaurant' | 'poolside' | 'private_event' | 'general';

export interface Business {
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
  opening_hours: OpeningHour[];
  social_links: SocialLinks;
  ordering_enabled: boolean;
  menu_visible: boolean;
  default_qr_path: string;
  public_base_url: string | null;
}

export interface OpeningHour {
  day: string;
  open: string | null;
  close: string | null;
  closed: boolean;
}

export interface SocialLinks {
  instagram?: string;
  whatsapp?: string;
  x?: string;
  facebook?: string;
  tiktok?: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  item_count?: number;
}

export interface Promotion {
  id: number;
  name: string;
  description: string | null;
  kind: PromotionKind;
  discount_percent: number | null;
  start_at: string | null;
  end_at: string | null;
  /** 0 = Sunday ... 6 = Saturday. Empty array = every day. */
  days_of_week: number[];
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
  display_order: number;
  item_ids: number[];
}

export interface MenuItem {
  id: number;
  category_id: number;
  category_name: string;
  category_slug: string;
  name: string;
  slug: string;
  description: string | null;
  ingredients: string | null;
  price: number; // kobo
  promotional_price: number | null; // kobo, permanent "menu" sale price
  /** Server-computed live selling price for the current moment (kobo). */
  effective_price: number;
  /** Server-computed label of the live promotion, when one applies. */
  active_promotion: string | null;
  image_url: string | null;
  size_label: string | null;
  allergens: string | null;
  availability_status: AvailabilityStatus;
  is_signature: boolean;
  is_popular: boolean;
  is_new: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface MenuPayload {
  business: Business;
  categories: Category[];
  items: MenuItem[];
  promotions: Promotion[];
  promotions_active: Promotion[];
  server_time: string;
  ordering_enabled: boolean;
}

export interface QrCode {
  id: number;
  business_id: number;
  label: string;
  table_identifier: string | null;
  area: VenueArea;
  destination_path: string;
  token: string;
  is_active: boolean;
  created_at: string;
  /** Absolute URL encoded inside the QR image. */
  url: string;
  scan_count?: number;
}

export interface OrderItem {
  id: number;
  menu_item_id: number | null;
  item_name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  line_total: number;
  selected_variant: string | null;
  special_instructions: string | null;
}

export interface Order {
  id: number;
  order_reference: string;
  table_identifier: string | null;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  special_instructions: string | null;
  customer_name: string | null;
  payment_status: 'unpaid' | 'paid';
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

export interface AdminUser {
  id: number;
  business_id: number;
  email: string;
  name: string;
  role: AdminRole;
}

export interface DashboardStats {
  total_items: number;
  available_items: number;
  unavailable_items: number;
  total_categories: number;
  active_promotions: number;
  qr_codes: number;
  active_qr_codes: number;
  total_scans: number;
  orders?: {
    total: number;
    pending: number;
    completed: number;
    revenue: number;
    recent: Order[];
  };
}

export const VENUE_AREA_LABELS: Record<VenueArea, string> = {
  general: 'General / Anywhere',
  main_bar: 'Main Bar',
  vip_lounge: 'VIP Lounge',
  restaurant: 'Restaurant',
  poolside: 'Poolside',
  private_event: 'Private Event Area',
};

export const PROMOTION_KIND_LABELS: Record<PromotionKind, string> = {
  happy_hour: 'Happy Hour',
  special: 'Daily Special',
  featured: 'Featured Cocktail',
  bundle: 'Bundle Deal',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  preparing: 'Preparing',
  served: 'Served',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
