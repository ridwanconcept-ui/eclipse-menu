import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { db, nowIso, slugify, uniqueSlug, audit, uploadsDir } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import {
  categorySchema,
  menuItemSchema,
  promotionSchema,
  qrSchema,
  settingsSchema,
  orderStatusSchema,
  fieldErrors,
} from '../validation.js';
import {
  buildContext,
  getBusinessRow,
  listCategories,
  listMenuItems,
  listPromotions,
  listQrCodes,
  resolveBaseUrl,
  serializeBusiness,
  serializeOrder,
  serializePromotion,
  serializeQr,
} from '../repo.js';
import { isPromotionActive } from '../../shared/promo.js';
import type { DashboardStats, MenuItem, Order } from '../../shared/types.js';

/** Drops undefined social keys so a partial patch never nulls stored links. */
function cleanSocial(links: Record<string, string | null | undefined>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(links)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export const adminRouter = Router();
adminRouter.use(requireAuth);

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */
adminRouter.get('/dashboard', (req: Request, res: Response) => {
  const business = getBusinessRow();
  const ctx = buildContext();
  const items = listMenuItems(ctx, { includeUnavailable: true });
  const categories = listCategories(business.id, { includeInactive: true });
  const qrs = listQrCodes(business.id, resolveBaseUrl(req));
  const activePromos = listPromotions(business.id).filter((p) =>
    isPromotionActive(p, ctx.clock, new Date(), business.timezone),
  );

  const stats: DashboardStats = {
    total_items: items.length,
    available_items: items.filter((i) => i.availability_status === 'available').length,
    unavailable_items: items.filter((i) => i.availability_status !== 'available').length,
    total_categories: categories.length,
    active_promotions: activePromos.length,
    qr_codes: qrs.length,
    active_qr_codes: qrs.filter((q) => q.is_active).length,
    total_scans: qrs.reduce((sum, q) => sum + (q.scan_count ?? 0), 0),
  };

  if (business.ordering_enabled === 1) {
    const rows = db
      .prepare('SELECT * FROM orders WHERE business_id = ? ORDER BY id DESC')
      .all(business.id) as Record<string, unknown>[];
    const orders = rows.map(serializeOrder) as Order[];
    stats.orders = {
      total: orders.length,
      pending: orders.filter((o) => o.status === 'pending' || o.status === 'preparing').length,
      completed: orders.filter((o) => o.status === 'completed').length,
      revenue: orders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + o.total, 0),
      recent: orders.slice(0, 8),
    };
  }

  res.json({ stats, recent_items: items.slice(0, 6) });
});

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */
adminRouter.get('/categories', (req: Request, res: Response) => {
  const business = getBusinessRow();
  res.json({ categories: listCategories(business.id, { includeInactive: true }) });
});

adminRouter.post('/categories', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the form', fields: fieldErrors(parsed.error) });
    return;
  }
  const business = getBusinessRow();
  const input = parsed.data;
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(display_order), 0) AS m FROM categories WHERE business_id = ?').get(business.id) as {
      m: number;
    }
  ).m;
  const info = db
    .prepare(
      `INSERT INTO categories (business_id, name, slug, description, image_url, display_order, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      business.id,
      input.name,
      uniqueSlug('categories', business.id, input.name),
      input.description,
      input.image_url,
      input.display_order ?? maxOrder + 1,
      input.is_active === false ? 0 : 1,
      nowIso(),
      nowIso(),
    );
  audit(req.admin!.id, 'create', 'category', Number(info.lastInsertRowid), input);
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid) as Record<string, unknown>;
  res.status(201).json({ category: row });
});

adminRouter.put('/categories/:id', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const business = getBusinessRow();
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND business_id = ?').get(id, business.id) as
    | { id: number; name: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the form', fields: fieldErrors(parsed.error) });
    return;
  }
  const input = parsed.data;
  db.prepare(
    `UPDATE categories SET name = ?, slug = ?, description = ?, image_url = ?, display_order = COALESCE(?, display_order),
       is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ?`,
  ).run(
    input.name,
    uniqueSlug('categories', business.id, input.name, id),
    input.description,
    input.image_url,
    input.display_order ?? null,
    input.is_active === undefined ? null : input.is_active ? 1 : 0,
    nowIso(),
    id,
  );
  audit(req.admin!.id, 'update', 'category', id, input);
  res.json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(id) });
});

adminRouter.delete('/categories/:id', requireRole(['owner']), (req: Request, res: Response) => {
  const business = getBusinessRow();
  const id = Number(req.params.id);
  const count = (
    db.prepare('SELECT COUNT(*) AS c FROM menu_items WHERE category_id = ? AND is_deleted = 0').get(id) as { c: number }
  ).c;
  if (count > 0) {
    res.status(409).json({
      error: `This category still has ${count} menu item${count === 1 ? '' : 's'}. Move or delete them first, or hide the category instead.`,
    });
    return;
  }
  db.prepare('DELETE FROM categories WHERE id = ? AND business_id = ?').run(id, business.id);
  audit(req.admin!.id, 'delete', 'category', id);
  res.json({ ok: true });
});

adminRouter.post('/categories/reorder', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const order = Array.isArray(req.body?.order) ? (req.body.order as number[]) : null;
  if (!order) {
    res.status(400).json({ error: 'Expected { order: number[] }' });
    return;
  }
  const stmt = db.prepare('UPDATE categories SET display_order = ?, updated_at = ? WHERE id = ?');
  const tx = db.transaction(() => order.forEach((id, index) => stmt.run(index + 1, nowIso(), Number(id))));
  tx();
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Menu items
 * ------------------------------------------------------------------ */
adminRouter.get('/items', (req: Request, res: Response) => {
  const ctx = buildContext();
  res.json({ items: listMenuItems(ctx, { includeUnavailable: true }), categories: listCategories(ctx.business.id, { includeInactive: true }) });
});

adminRouter.get('/items/:id', (req: Request, res: Response) => {
  const ctx = buildContext();
  const item = listMenuItems(ctx, { includeUnavailable: true }).find((i) => i.id === Number(req.params.id));
  if (!item) {
    res.status(404).json({ error: 'Menu item not found' });
    return;
  }
  res.json({ item });
});

function validateCategoryBelongs(businessId: number, categoryId: number): boolean {
  return !!db.prepare('SELECT id FROM categories WHERE id = ? AND business_id = ?').get(categoryId, businessId);
}

adminRouter.post('/items', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const business = getBusinessRow();
  const parsed = menuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the form', fields: fieldErrors(parsed.error) });
    return;
  }
  const input = parsed.data;
  if (!validateCategoryBelongs(business.id, input.category_id)) {
    res.status(400).json({ error: 'Choose a valid category', fields: { category_id: 'Invalid category' } });
    return;
  }
  const maxOrder = (
    db
      .prepare('SELECT COALESCE(MAX(display_order), 0) AS m FROM menu_items WHERE business_id = ? AND category_id = ?')
      .get(business.id, input.category_id) as { m: number }
  ).m;
  const info = db
    .prepare(
      `INSERT INTO menu_items (business_id, category_id, name, slug, description, ingredients, allergens, price,
        promotional_price, image_url, size_label, availability_status, is_signature, is_popular, is_new,
        display_order, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      business.id,
      input.category_id,
      input.name,
      uniqueSlug('menu_items', business.id, input.name),
      input.description,
      input.ingredients,
      input.allergens,
      input.price,
      input.promotional_price,
      input.image_url,
      input.size_label,
      input.availability_status ?? 'available',
      input.is_signature ? 1 : 0,
      input.is_popular ? 1 : 0,
      input.is_new ? 1 : 0,
      input.display_order ?? maxOrder + 1,
      nowIso(),
      nowIso(),
    );
  audit(req.admin!.id, 'create', 'menu_item', Number(info.lastInsertRowid), input);
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ item });
});

adminRouter.put('/items/:id', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const business = getBusinessRow();
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM menu_items WHERE id = ? AND business_id = ? AND is_deleted = 0').get(
    id,
    business.id,
  );
  if (!existing) {
    res.status(404).json({ error: 'Menu item not found' });
    return;
  }
  const parsed = menuItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the form', fields: fieldErrors(parsed.error) });
    return;
  }
  const input = parsed.data;
  if (!validateCategoryBelongs(business.id, input.category_id)) {
    res.status(400).json({ error: 'Choose a valid category', fields: { category_id: 'Invalid category' } });
    return;
  }
  db.prepare(
    `UPDATE menu_items SET
       category_id = ?, name = ?, slug = ?, description = ?, ingredients = ?, allergens = ?,
       price = ?, promotional_price = ?, image_url = ?, size_label = ?,
       availability_status = COALESCE(?, availability_status),
       is_signature = COALESCE(?, is_signature), is_popular = COALESCE(?, is_popular), is_new = COALESCE(?, is_new),
       display_order = COALESCE(?, display_order), updated_at = ?
     WHERE id = ?`,
  ).run(
    input.category_id,
    input.name,
    uniqueSlug('menu_items', business.id, input.name, id),
    input.description,
    input.ingredients,
    input.allergens,
    input.price,
    input.promotional_price,
    input.image_url,
    input.size_label,
    input.availability_status ?? null,
    input.is_signature === undefined ? null : input.is_signature ? 1 : 0,
    input.is_popular === undefined ? null : input.is_popular ? 1 : 0,
    input.is_new === undefined ? null : input.is_new ? 1 : 0,
    input.display_order ?? null,
    nowIso(),
    id,
  );
  audit(req.admin!.id, 'update', 'menu_item', id, { price: input.price, name: input.name });
  res.json({ item: db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id) });
});

/** Quick inline status/price toggles used from the item list. */
adminRouter.patch('/items/:id/status', requireRole(['owner', 'manager', 'staff']), (req: Request, res: Response) => {
  const business = getBusinessRow();
  const id = Number(req.params.id);
  const status = req.body?.availability_status;
  if (!['available', 'unavailable', 'sold_out'].includes(status)) {
    res.status(400).json({ error: 'Invalid availability status' });
    return;
  }
  const info = db
    .prepare('UPDATE menu_items SET availability_status = ?, updated_at = ? WHERE id = ? AND business_id = ? AND is_deleted = 0')
    .run(status, nowIso(), id, business.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Menu item not found' });
    return;
  }
  audit(req.admin!.id, 'status', 'menu_item', id, { status });
  res.json({ ok: true });
});

adminRouter.post('/items/:id/duplicate', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const business = getBusinessRow();
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM menu_items WHERE id = ? AND business_id = ? AND is_deleted = 0').get(id, business.id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Menu item not found' });
    return;
  }
  const name = `${row.name as string} (copy)`;
  const info = db
    .prepare(
      `INSERT INTO menu_items (business_id, category_id, name, slug, description, ingredients, allergens, price,
        promotional_price, image_url, size_label, availability_status, is_signature, is_popular, is_new, display_order,
        created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      business.id,
      row.category_id as number,
      name,
      uniqueSlug('menu_items', business.id, name),
      row.description as string | null,
      row.ingredients as string | null,
      row.allergens as string | null,
      row.price as number,
      row.promotional_price as number | null,
      row.image_url as string | null,
      row.size_label as string | null,
      row.availability_status as string,
      row.is_signature as number,
      row.is_popular as number,
      row.is_new as number,
      (row.display_order as number) + 1,
      nowIso(),
      nowIso(),
    );
  audit(req.admin!.id, 'duplicate', 'menu_item', id);
  res.status(201).json({ item: db.prepare('SELECT * FROM menu_items WHERE id = ?').get(info.lastInsertRowid) });
});

/** Soft delete keeps historical order references intact. */
adminRouter.delete('/items/:id', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const business = getBusinessRow();
  const id = Number(req.params.id);
  const info = db
    .prepare('UPDATE menu_items SET is_deleted = 1, is_deleted_at = ? WHERE id = ? AND business_id = ?')
    .run(nowIso(), id, business.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Menu item not found' });
    return;
  }
  audit(req.admin!.id, 'delete', 'menu_item', id);
  res.json({ ok: true });
});

adminRouter.post('/items/reorder', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const order = Array.isArray(req.body?.order) ? (req.body.order as number[]) : null;
  if (!order) {
    res.status(400).json({ error: 'Expected { order: number[] }' });
    return;
  }
  const stmt = db.prepare('UPDATE menu_items SET display_order = ?, updated_at = ? WHERE id = ?');
  const tx = db.transaction(() => order.forEach((id, index) => stmt.run(index + 1, nowIso(), Number(id))));
  tx();
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * CSV import / export
 * ------------------------------------------------------------------ */
adminRouter.get('/items-export.csv', (req: Request, res: Response) => {
  const ctx = buildContext();
  const items = listMenuItems(ctx, { includeUnavailable: true });
  const header = [
    'name',
    'category',
    'description',
    'ingredients',
    'allergens',
    'price_naira',
    'promotional_price_naira',
    'size_label',
    'availability_status',
    'is_signature',
    'is_popular',
    'is_new',
    'display_order',
  ].join(',');
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = items.map((i) =>
    [
      i.name,
      i.category_name,
      i.description,
      i.ingredients,
      i.allergens,
      (i.price / 100).toFixed(2),
      i.promotional_price === null ? '' : (i.promotional_price / 100).toFixed(2),
      i.size_label,
      i.availability_status,
      i.is_signature ? 'true' : 'false',
      i.is_popular ? 'true' : 'false',
      i.is_new ? 'true' : 'false',
      i.display_order,
    ]
      .map(esc)
      .join(','),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="eclipse-menu-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send([header, ...lines].join('\n'));
});

/** Minimal RFC4180-ish CSV parser (handles quotes, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

adminRouter.post('/items-import', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const csv = typeof req.body?.csv === 'string' ? req.body.csv : '';
  if (!csv.trim()) {
    res.status(400).json({ error: 'Paste CSV content or upload a .csv file' });
    return;
  }
  const business = getBusinessRow();
  const rows = parseCsv(csv);
  if (rows.length < 2) {
    res.status(400).json({ error: 'CSV must include a header row and at least one item' });
    return;
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const required = ['name', 'category', 'price_naira'];
  const missing = required.filter((r) => idx(r) === -1);
  if (missing.length) {
    res.status(400).json({ error: `Missing required column(s): ${missing.join(', ')}` });
    return;
  }

  const created: string[] = [];
  const errors: string[] = [];
  const insert = db.prepare(
    `INSERT INTO menu_items (business_id, category_id, name, slug, description, ingredients, allergens, price,
      promotional_price, image_url, size_label, availability_status, is_signature, is_popular, is_new, display_order,
      created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );

  const tx = db.transaction(() => {
    for (let r = 1; r < rows.length; r++) {
      const line = rows[r];
      const cell = (name: string) => (idx(name) >= 0 ? (line[idx(name)] ?? '').trim() : '');
      const name = cell('name');
      const categoryName = cell('category');
      const priceNaira = Number(cell('price_naira').replace(/[₦,\s]/g, ''));
      if (!name) {
        errors.push(`Row ${r + 1}: missing name`);
        continue;
      }
      if (!categoryName) {
        errors.push(`Row ${r + 1}: missing category`);
        continue;
      }
      if (!Number.isFinite(priceNaira) || priceNaira < 0) {
        errors.push(`Row ${r + 1}: invalid price "${cell('price_naira')}"`);
        continue;
      }
      let cat = db.prepare('SELECT id FROM categories WHERE business_id = ? AND lower(name) = lower(?)').get(business.id, categoryName) as
        | { id: number }
        | undefined;
      if (!cat) {
        const maxOrder = (
          db.prepare('SELECT COALESCE(MAX(display_order), 0) AS m FROM categories WHERE business_id = ?').get(business.id) as { m: number }
        ).m;
        const info = db
          .prepare(
            `INSERT INTO categories (business_id, name, slug, display_order, is_active, created_at, updated_at)
             VALUES (?,?,?,?,1,?,?)`,
          )
          .run(business.id, categoryName, uniqueSlug('categories', business.id, categoryName), maxOrder + 1, nowIso(), nowIso());
        cat = { id: Number(info.lastInsertRowid) };
      }
      const promoRaw = cell('promotional_price_naira').replace(/[₦,\s]/g, '');
      const promoNaira = promoRaw ? Number(promoRaw) : null;
      const bool = (v: string) => ['true', '1', 'yes', 'y'].includes(v.toLowerCase());
      const status = ['available', 'unavailable', 'sold_out'].includes(cell('availability_status'))
        ? cell('availability_status')
        : 'available';
      insert.run(
        business.id,
        cat.id,
        name,
        uniqueSlug('menu_items', business.id, name),
        cell('description') || null,
        cell('ingredients') || null,
        cell('allergens') || null,
        Math.round(priceNaira * 100),
        promoNaira !== null && Number.isFinite(promoNaira) && promoNaira < priceNaira ? Math.round(promoNaira * 100) : null,
        null,
        cell('size_label') || null,
        status,
        bool(cell('is_signature')) ? 1 : 0,
        bool(cell('is_popular')) ? 1 : 0,
        bool(cell('is_new')) ? 1 : 0,
        Number(cell('display_order')) || r,
        nowIso(),
        nowIso(),
      );
      created.push(name);
    }
  });
  tx();
  audit(req.admin!.id, 'import', 'menu_item', null, { created: created.length, errors });
  res.json({ created: created.length, errors, names: created.slice(0, 20) });
});

/* ------------------------------------------------------------------ *
 * Promotions
 * ------------------------------------------------------------------ */
adminRouter.get('/promotions', (req: Request, res: Response) => {
  const business = getBusinessRow();
  const ctx = buildContext();
  const promos = listPromotions(business.id).map((p) => ({
    ...p,
    is_currently_active: isPromotionActive(p, ctx.clock, new Date(), business.timezone),
  }));
  res.json({ promotions: promos, clock: ctx.clock });
});

adminRouter.post('/promotions', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const parsed = promotionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the form', fields: fieldErrors(parsed.error) });
    return;
  }
  const business = getBusinessRow();
  const input = parsed.data;
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(display_order), 0) AS m FROM promotions WHERE business_id = ?').get(business.id) as { m: number }
  ).m;
  const insert = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO promotions (business_id, name, description, kind, discount_percent, start_at, end_at,
          days_of_week, start_time, end_time, is_active, display_order, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        business.id,
        input.name,
        input.description,
        input.kind,
        input.discount_percent,
        input.start_at,
        input.end_at,
        input.days_of_week.join(','),
        input.start_time,
        input.end_time,
        input.is_active === false ? 0 : 1,
        input.display_order ?? maxOrder + 1,
        nowIso(),
        nowIso(),
      );
    const promoId = Number(info.lastInsertRowid);
    const link = db.prepare('INSERT OR IGNORE INTO promotion_items (promotion_id, menu_item_id) VALUES (?,?)');
    for (const itemId of input.item_ids) link.run(promoId, itemId);
    return promoId;
  });
  const promoId = insert();
  audit(req.admin!.id, 'create', 'promotion', promoId, input);
  const row = db.prepare('SELECT * FROM promotions WHERE id = ?').get(promoId) as Record<string, unknown>;
  res.status(201).json({ promotion: serializePromotion(row as never) });
});

adminRouter.put('/promotions/:id', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const business = getBusinessRow();
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM promotions WHERE id = ? AND business_id = ?').get(id, business.id);
  if (!exists) {
    res.status(404).json({ error: 'Promotion not found' });
    return;
  }
  const parsed = promotionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the form', fields: fieldErrors(parsed.error) });
    return;
  }
  const input = parsed.data;
  const update = db.transaction(() => {
    db.prepare(
      `UPDATE promotions SET name=?, description=?, kind=?, discount_percent=?, start_at=?, end_at=?, days_of_week=?,
        start_time=?, end_time=?, is_active=COALESCE(?, is_active), display_order=COALESCE(?, display_order), updated_at=?
       WHERE id = ?`,
    ).run(
      input.name,
      input.description,
      input.kind,
      input.discount_percent,
      input.start_at,
      input.end_at,
      input.days_of_week.join(','),
      input.start_time,
      input.end_time,
      input.is_active === undefined ? null : input.is_active ? 1 : 0,
      input.display_order ?? null,
      nowIso(),
      id,
    );
    db.prepare('DELETE FROM promotion_items WHERE promotion_id = ?').run(id);
    const link = db.prepare('INSERT OR IGNORE INTO promotion_items (promotion_id, menu_item_id) VALUES (?,?)');
    for (const itemId of input.item_ids) link.run(id, itemId);
  });
  update();
  audit(req.admin!.id, 'update', 'promotion', id, input);
  res.json({ promotion: serializePromotion(db.prepare('SELECT * FROM promotions WHERE id = ?').get(id) as never) });
});

adminRouter.delete('/promotions/:id', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const business = getBusinessRow();
  const info = db.prepare('DELETE FROM promotions WHERE id = ? AND business_id = ?').run(Number(req.params.id), business.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Promotion not found' });
    return;
  }
  audit(req.admin!.id, 'delete', 'promotion', req.params.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * QR codes
 * ------------------------------------------------------------------ */
adminRouter.get('/qr', (req: Request, res: Response) => {
  const business = getBusinessRow();
  res.json({ qr_codes: listQrCodes(business.id, resolveBaseUrl(req)), base_url: resolveBaseUrl(req) });
});

adminRouter.post('/qr', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const parsed = qrSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the form', fields: fieldErrors(parsed.error) });
    return;
  }
  const business = getBusinessRow();
  const input = parsed.data;
  const token = crypto.randomBytes(7).toString('base64url');
  const destinationPath = input.table_identifier
    ? `/?t=${token}`
    : input.destination_path || business.default_qr_path || '/';
  const info = db
    .prepare(
      `INSERT INTO qr_codes (business_id, label, table_identifier, area, destination_path, token, is_active, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      business.id,
      input.label,
      input.table_identifier,
      input.area ?? 'general',
      destinationPath,
      token,
      input.is_active === false ? 0 : 1,
      nowIso(),
    );
  audit(req.admin!.id, 'create', 'qr_code', Number(info.lastInsertRowid), input);
  const row = db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(info.lastInsertRowid) as Record<string, unknown>;
  res.status(201).json({ qr: serializeQr(row, resolveBaseUrl(req)) });
});

adminRouter.patch('/qr/:id', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const business = getBusinessRow();
  const id = Number(req.params.id);
  const { is_active, label, table_identifier, area, destination_path } = req.body ?? {};
  const info = db
    .prepare(
      `UPDATE qr_codes SET
         is_active = COALESCE(?, is_active),
         label = COALESCE(?, label),
         table_identifier = COALESCE(?, table_identifier),
         area = COALESCE(?, area),
         destination_path = COALESCE(?, destination_path)
       WHERE id = ? AND business_id = ?`,
    )
    .run(
      typeof is_active === 'boolean' ? (is_active ? 1 : 0) : null,
      typeof label === 'string' && label.trim() ? label.trim() : null,
      typeof table_identifier === 'string' ? table_identifier.trim() || null : null,
      typeof area === 'string' ? area : null,
      typeof destination_path === 'string' && destination_path.trim() ? destination_path.trim() : null,
      id,
      business.id,
    );
  if (info.changes === 0) {
    res.status(404).json({ error: 'QR code not found' });
    return;
  }
  audit(req.admin!.id, 'update', 'qr_code', id, req.body);
  const row = db.prepare('SELECT * FROM qr_codes WHERE id = ?').get(id) as Record<string, unknown>;
  res.json({ qr: serializeQr(row, resolveBaseUrl(req)) });
});

adminRouter.delete('/qr/:id', requireRole(['owner']), (req: Request, res: Response) => {
  const business = getBusinessRow();
  const info = db.prepare('DELETE FROM qr_codes WHERE id = ? AND business_id = ?').run(Number(req.params.id), business.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'QR code not found' });
    return;
  }
  audit(req.admin!.id, 'delete', 'qr_code', req.params.id);
  res.json({ ok: true });
});

/**
 * QR image generation. The QR payload is ONLY the menu URL (never menu data),
 * so prices and items can change freely without reprinting.
 */
adminRouter.get('/qr/:id/image.png', async (req: Request, res: Response) => {
  const business = getBusinessRow();
  const row = db.prepare('SELECT * FROM qr_codes WHERE id = ? AND business_id = ?').get(Number(req.params.id), business.id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'QR code not found' });
    return;
  }
  const baseOverride = typeof req.query.base === 'string' ? req.query.base : undefined;
  const qr = serializeQr(row, baseOverride || resolveBaseUrl(req));
  const size = Math.min(Math.max(Number(req.query.size) || 900, 200), 2000);
  const buffer = await QRCode.toBuffer(qr.url, {
    type: 'png',
    width: size,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#111111', light: '#FFFFFF' },
  });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
});

adminRouter.get('/qr/:id/image.svg', async (req: Request, res: Response) => {
  const business = getBusinessRow();
  const row = db.prepare('SELECT * FROM qr_codes WHERE id = ? AND business_id = ?').get(Number(req.params.id), business.id) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'QR code not found' });
    return;
  }
  const baseOverride = typeof req.query.base === 'string' ? req.query.base : undefined;
  const qr = serializeQr(row, baseOverride || resolveBaseUrl(req));
  const svg = await QRCode.toString(qr.url, {
    type: 'svg',
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#111111', light: '#FFFFFF' },
  });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-store');
  res.send(svg);
});

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */
adminRouter.get('/settings', (req: Request, res: Response) => {
  res.json({ business: serializeBusiness(getBusinessRow()) });
});

adminRouter.put('/settings', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Check the form', fields: fieldErrors(parsed.error) });
    return;
  }
  const business = getBusinessRow();
  const i = parsed.data;
  db.prepare(
    `UPDATE businesses SET
      name = COALESCE(?, name), slug = COALESCE(?, slug), logo_url = ?, tagline = ?, description = ?,
      contact_number = ?, address = ?, city = ?, currency = COALESCE(?, currency), timezone = COALESCE(?, timezone),
      hero_image_url = ?, hero_title = ?, hero_message = ?, promo_banner = ?,
      opening_hours = COALESCE(?, opening_hours), social_links = COALESCE(?, social_links),
      ordering_enabled = COALESCE(?, ordering_enabled), menu_visible = COALESCE(?, menu_visible),
      default_qr_path = COALESCE(?, default_qr_path), public_base_url = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    i.name ?? null,
    i.name ? slugify(i.name) : null,
    i.logo_url === undefined ? business.logo_url : i.logo_url,
    i.tagline === undefined ? business.tagline : i.tagline,
    i.description === undefined ? business.description : i.description,
    i.contact_number === undefined ? business.contact_number : i.contact_number,
    i.address === undefined ? business.address : i.address,
    i.city === undefined ? business.city : i.city,
    i.currency ?? null,
    i.timezone ?? null,
    i.hero_image_url === undefined ? business.hero_image_url : i.hero_image_url,
    i.hero_title === undefined ? business.hero_title : i.hero_title,
    i.hero_message === undefined ? business.hero_message : i.hero_message,
    i.promo_banner === undefined ? business.promo_banner : i.promo_banner,
    i.opening_hours ? JSON.stringify(i.opening_hours) : null,
    i.social_links ? JSON.stringify(cleanSocial(i.social_links)) : null,
    i.ordering_enabled === undefined ? null : i.ordering_enabled ? 1 : 0,
    i.menu_visible === undefined ? null : i.menu_visible ? 1 : 0,
    i.default_qr_path ?? null,
    i.public_base_url === undefined ? business.public_base_url : i.public_base_url,
    nowIso(),
    business.id,
  );
  audit(req.admin!.id, 'update', 'business', business.id, i);
  res.json({ business: serializeBusiness(getBusinessRow()) });
});

/* ------------------------------------------------------------------ *
 * Image uploads (restricted types + size)
 * ------------------------------------------------------------------ */
const ALLOWED_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = ALLOWED_MIME[file.mimetype] ?? '.bin';
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      cb(new Error('Only PNG, JPEG or WebP images are allowed'));
      return;
    }
    cb(null, true);
  },
});

adminRouter.post('/uploads', requireRole(['owner', 'manager']), (req: Request, res: Response) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No file received' });
      return;
    }
    res.status(201).json({ url: `/uploads/${path.basename(req.file.filename)}` });
  });
});

/* ------------------------------------------------------------------ *
 * Orders (admin)
 * ------------------------------------------------------------------ */
adminRouter.get('/orders', (req: Request, res: Response) => {
  const business = getBusinessRow();
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const rows = db
    .prepare(
      `SELECT * FROM orders WHERE business_id = ? ${status ? 'AND status = ?' : ''} ORDER BY id DESC LIMIT 200`,
    )
    .all(...(status ? [business.id, status] : [business.id])) as Record<string, unknown>[];
  res.json({ orders: rows.map(serializeOrder) });
});

adminRouter.patch('/orders/:id/status', requireRole(['owner', 'manager', 'staff']), (req: Request, res: Response) => {
  const parsed = orderStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  const business = getBusinessRow();
  const info = db
    .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND business_id = ?')
    .run(parsed.data.status, nowIso(), Number(req.params.id), business.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  audit(req.admin!.id, 'order-status', 'order', req.params.id, parsed.data);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Audit log
 * ------------------------------------------------------------------ */
adminRouter.get('/audit', requireRole(['owner']), (req: Request, res: Response) => {
  const rows = db
    .prepare(
      `SELECT a.*, u.email AS user_email FROM audit_log a
       LEFT JOIN admin_users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 100`,
    )
    .all();
  res.json({ entries: rows });
});
