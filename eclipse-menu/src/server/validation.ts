import { z } from 'zod';

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === '' ? null : (v ?? null)));

/**
 * For PATCH-style updates (business settings): an omitted key must stay
 * untouched, while an explicit empty string clears the column.
 */
const patchText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === '' ? null : v));

/** Prices arrive from the client as integer kobo. */
const kobo = z.number().int('Price must be a whole number of kobo').min(0, 'Price cannot be negative');
const optionalKobo = z
  .union([z.number().int().min(0), z.null()])
  .optional()
  .transform((v) => (v === undefined ? null : v));

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const categorySchema = z.object({
  name: trimmed(80).min(2, 'Name is required'),
  description: optionalText(500),
  image_url: optionalText(500),
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const menuItemSchema = z
  .object({
    name: trimmed(120).min(2, 'Name is required'),
    category_id: z.number().int().positive('Choose a category'),
    description: optionalText(1000),
    ingredients: optionalText(1000),
    allergens: optionalText(500),
    price: kobo,
    promotional_price: optionalKobo,
    image_url: optionalText(1000),
    size_label: optionalText(80),
    availability_status: z.enum(['available', 'unavailable', 'sold_out']).optional(),
    is_signature: z.boolean().optional(),
    is_popular: z.boolean().optional(),
    is_new: z.boolean().optional(),
    display_order: z.number().int().min(0).optional(),
  })
  .refine((v) => v.promotional_price === null || v.promotional_price < v.price, {
    message: 'Promotional price must be lower than the regular price',
    path: ['promotional_price'],
  });

const timeString = z
  .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'), z.null()])
  .optional()
  .transform((v) => (v === '' ? null : (v ?? null)));

const dateString = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'), z.null()])
  .optional()
  .transform((v) => (v === '' ? null : (v ?? null)));

export const promotionSchema = z
  .object({
    name: trimmed(120).min(2, 'Name is required'),
    description: optionalText(500),
    kind: z.enum(['happy_hour', 'special', 'featured', 'bundle']),
    discount_percent: z.union([z.number().int().min(0).max(100), z.null()]).optional().transform((v) => v ?? null),
    start_at: dateString,
    end_at: dateString,
    days_of_week: z.array(z.number().int().min(0).max(6)).default([]),
    start_time: timeString,
    end_time: timeString,
    is_active: z.boolean().optional(),
    display_order: z.number().int().min(0).optional(),
    item_ids: z.array(z.number().int().positive()).default([]),
  })
  .refine((v) => !v.start_at || !v.end_at || v.start_at <= v.end_at, {
    message: 'End date must be on or after the start date',
    path: ['end_at'],
  })
  .refine((v) => (v.start_time === null) === (v.end_time === null), {
    message: 'Provide both a start and end time, or leave both empty for an all-day promotion',
    path: ['end_time'],
  });

export const qrSchema = z.object({
  label: trimmed(80).min(2, 'Label is required'),
  table_identifier: optionalText(40),
  area: z.enum(['general', 'main_bar', 'vip_lounge', 'restaurant', 'poolside', 'private_event']).default('general'),
  destination_path: trimmed(200).optional(),
  is_active: z.boolean().optional(),
});

const openingHour = z.object({
  day: trimmed(12),
  open: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.null()]),
  close: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.null()]),
  closed: z.boolean(),
});

export const settingsSchema = z.object({
  name: trimmed(120).min(2, 'Business name is required').optional(),
  logo_url: patchText(1000),
  tagline: patchText(160),
  description: patchText(2000),
  contact_number: patchText(40),
  address: patchText(300),
  city: patchText(120),
  currency: z.string().trim().length(3).optional(),
  timezone: trimmed(64).optional(),
  hero_image_url: patchText(1000),
  hero_title: patchText(120),
  hero_message: patchText(400),
  promo_banner: patchText(240),
  opening_hours: z.array(openingHour).optional(),
  social_links: z
    .object({
      instagram: patchText(200),
      whatsapp: patchText(40),
      x: patchText(200),
      facebook: patchText(200),
      tiktok: patchText(200),
    })
    .partial()
    .optional(),
  ordering_enabled: z.boolean().optional(),
  menu_visible: z.boolean().optional(),
  default_qr_path: trimmed(200).optional(),
  public_base_url: patchText(300),
});

export const orderSchema = z.object({
  table_identifier: optionalText(40),
  customer_name: optionalText(80),
  special_instructions: optionalText(600),
  qr_token: optionalText(80),
  items: z
    .array(
      z.object({
        menu_item_id: z.number().int().positive(),
        quantity: z.number().int().min(1).max(50),
        selected_variant: optionalText(80),
        special_instructions: optionalText(300),
      }),
    )
    .min(1, 'Your cart is empty'),
});

export const orderStatusSchema = z.object({
  status: z.enum(['pending', 'preparing', 'served', 'completed', 'cancelled']),
});

export const passwordChangeSchema = z.object({
  current_password: z.string().min(1, 'Enter your current password'),
  new_password: z.string().min(10, 'Use at least 10 characters'),
});

export type MenuItemInput = z.infer<typeof menuItemSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type PromotionInput = z.infer<typeof promotionSchema>;

/** Format zod issues into a { field: message } map the UI can render inline. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
