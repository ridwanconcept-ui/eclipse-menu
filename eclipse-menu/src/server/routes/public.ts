import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { db, nowIso } from '../db.js';
import { rateLimit } from '../auth.js';
import { orderSchema, fieldErrors } from '../validation.js';
import {
  buildContext,
  listCategories,
  listMenuItems,
  serializeQr,
  getBusinessRow,
  serializeOrder,
} from '../repo.js';
import type { MenuPayload } from '../../shared/types.js';

export const publicRouter = Router();

/** Full menu payload used by the customer app. Public — no authentication. */
publicRouter.get('/menu', (req: Request, res: Response) => {
  const ctx = buildContext();
  if (!ctx.business.menu_visible) {
    res.json({
      business: ctx.business,
      categories: [],
      items: [],
      promotions: [],
      promotions_active: [],
      server_time: new Date().toISOString(),
      ordering_enabled: false,
      menu_visible: false,
    } satisfies MenuPayload & { menu_visible: boolean });
    return;
  }

  const items = listMenuItems(ctx);
  const categories = listCategories(ctx.business.id).filter((c) => items.some((i) => i.category_id === c.id));

  const payload: MenuPayload = {
    business: ctx.business,
    categories,
    items,
    promotions: ctx.promotions,
    promotions_active: ctx.activePromotions.filter((p) => p.kind !== 'bundle' || p.item_ids.length > 0),
    server_time: new Date().toISOString(),
    ordering_enabled: ctx.business.ordering_enabled,
  };
  res.set('Cache-Control', 'no-store');
  res.json(payload);
});

/** Resolve a table QR token -> table context. Also records a scan (privacy-friendly counter only). */
publicRouter.get('/qr/:token', (req: Request, res: Response) => {
  const token = String(req.params.token);
  const row = db.prepare('SELECT * FROM qr_codes WHERE token = ? AND is_active = 1').get(token) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'This QR code is not active. Please ask a member of staff.' });
    return;
  }
  db.prepare('UPDATE qr_codes SET scan_count = scan_count + 1 WHERE id = ?').run(row.id as number);
  const base = `${req.protocol}://${req.get('host')}`;
  res.json(serializeQr(row, base));
});

/** Customer self-service ordering. Only available when the venue enables it. */
publicRouter.post('/orders', rateLimit('order', 10, 60_000), (req: Request, res: Response) => {
  const businessRow = getBusinessRow();
  if (businessRow.ordering_enabled !== 1) {
    res.status(403).json({ error: 'Digital ordering is not enabled for this venue. Please order with a member of staff.' });
    return;
  }

  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please check your order', fields: fieldErrors(parsed.error) });
    return;
  }
  const input = parsed.data;

  // Validate every line against the live menu and compute totals server-side.
  let subtotal = 0;
  const lines: {
    menu_item_id: number;
    name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
    selected_variant: string | null;
    special_instructions: string | null;
  }[] = [];

  const ctx = buildContext();
  const menu = listMenuItems(ctx);

  for (const line of input.items) {
    const item = menu.find((i) => i.id === line.menu_item_id);
    if (!item) {
      res.status(400).json({ error: 'An item in your order is no longer on the menu. Please refresh and try again.' });
      return;
    }
    if (item.availability_status !== 'available') {
      res.status(400).json({ error: `${item.name} is currently unavailable.` });
      return;
    }
    const unit = item.effective_price;
    const total = unit * line.quantity;
    subtotal += total;
    lines.push({
      menu_item_id: item.id,
      name: item.name,
      unit_price: unit,
      quantity: line.quantity,
      line_total: total,
      selected_variant: line.selected_variant ?? item.size_label ?? null,
      special_instructions: line.special_instructions ?? null,
    });
  }

  let tableIdentifier = input.table_identifier ?? null;
  if (input.qr_token) {
    const qr = db.prepare('SELECT table_identifier FROM qr_codes WHERE token = ? AND is_active = 1').get(input.qr_token) as
      | { table_identifier: string | null }
      | undefined;
    if (qr?.table_identifier) tableIdentifier = qr.table_identifier;
  }

  const reference = `ECL-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto
    .randomBytes(2)
    .toString('hex')
    .toUpperCase()}`;

  const insertOrder = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO orders (business_id, order_reference, table_identifier, status, subtotal, discount, total,
                             special_instructions, customer_name, payment_status, created_at, updated_at)
         VALUES (?,?,?,'pending',?,0,?,?,?, 'unpaid', ?, ?)`,
      )
      .run(
        businessRow.id,
        reference,
        tableIdentifier,
        subtotal,
        subtotal,
        input.special_instructions ?? null,
        input.customer_name ?? null,
        nowIso(),
        nowIso(),
      );
    const orderId = Number(info.lastInsertRowid);
    const insertLine = db.prepare(
      `INSERT INTO order_items (order_id, menu_item_id, item_name_snapshot, unit_price_snapshot, quantity,
                                line_total, selected_variant, special_instructions)
       VALUES (?,?,?,?,?,?,?,?)`,
    );
    for (const l of lines) {
      insertLine.run(
        orderId,
        l.menu_item_id,
        l.name,
        l.unit_price,
        l.quantity,
        l.line_total,
        l.selected_variant,
        l.special_instructions,
      );
    }
    return orderId;
  });

  const orderId = insertOrder();
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, unknown>;
  res.status(201).json({ order: serializeOrder(row) });
});

/** Public order status lookup by reference (no PII beyond what the guest already has). */
publicRouter.get('/orders/:reference', rateLimit('order-lookup', 30, 60_000), (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM orders WHERE order_reference = ?').get(String(req.params.reference)) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json({ order: serializeOrder(row) });
});
