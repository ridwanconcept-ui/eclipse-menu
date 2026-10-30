import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SQLite (better-sqlite3) is used for this deployment because it is a real,
 * durable, transactional SQL database that runs inside the same process as the
 * API with zero external infrastructure. The schema below is 1:1 with the
 * PostgreSQL schema in /supabase/schema.sql, so the project can be moved to
 * Supabase/Postgres (see README) without changing application logic.
 */

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
const DB_FILE = process.env.DATABASE_FILE ?? path.join(DATA_DIR, 'eclipse.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const uploadsDir = path.join(DATA_DIR, 'uploads');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS businesses (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  slug               TEXT    NOT NULL UNIQUE,
  logo_url           TEXT,
  tagline            TEXT,
  description        TEXT,
  contact_number     TEXT,
  address            TEXT,
  city               TEXT,
  currency           TEXT    NOT NULL DEFAULT 'NGN',
  timezone           TEXT    NOT NULL DEFAULT 'Africa/Lagos',
  hero_image_url     TEXT,
  hero_title         TEXT,
  hero_message       TEXT,
  promo_banner       TEXT,
  opening_hours      TEXT    NOT NULL DEFAULT '[]',
  social_links       TEXT    NOT NULL DEFAULT '{}',
  ordering_enabled   INTEGER NOT NULL DEFAULT 0 CHECK (ordering_enabled IN (0,1)),
  menu_visible       INTEGER NOT NULL DEFAULT 1 CHECK (menu_visible IN (0,1)),
  default_qr_path    TEXT    NOT NULL DEFAULT '/',
  public_base_url    TEXT,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id   INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  email         TEXT    NOT NULL UNIQUE,
  name           TEXT    NOT NULL DEFAULT 'Administrator',
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','manager','staff')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS categories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id   INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  slug          TEXT    NOT NULL,
  description   TEXT,
  image_url     TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, slug)
);

CREATE TABLE IF NOT EXISTS menu_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id         INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id         INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name                TEXT    NOT NULL,
  slug                TEXT    NOT NULL,
  description         TEXT,
  ingredients         TEXT,
  allergens           TEXT,
  price               INTEGER NOT NULL CHECK (price >= 0),          -- kobo
  promotional_price   INTEGER CHECK (promotional_price IS NULL OR promotional_price >= 0),
  image_url           TEXT,
  size_label          TEXT,
  availability_status TEXT NOT NULL DEFAULT 'available'
                        CHECK (availability_status IN ('available','unavailable','sold_out')),
  is_signature        INTEGER NOT NULL DEFAULT 0 CHECK (is_signature IN (0,1)),
  is_popular          INTEGER NOT NULL DEFAULT 0 CHECK (is_popular IN (0,1)),
  is_new              INTEGER NOT NULL DEFAULT 0 CHECK (is_new IN (0,1)),
  display_order       INTEGER NOT NULL DEFAULT 0,
  is_deleted          INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),
  is_deleted_at       TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (business_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_business ON menu_items(business_id, is_deleted);

CREATE TABLE IF NOT EXISTS promotions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id      INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name             TEXT    NOT NULL,
  description      TEXT,
  kind             TEXT    NOT NULL DEFAULT 'happy_hour'
                     CHECK (kind IN ('happy_hour','special','featured','bundle')),
  discount_percent INTEGER CHECK (discount_percent IS NULL OR (discount_percent BETWEEN 0 AND 100)),
  start_at         TEXT,
  end_at           TEXT,
  days_of_week     TEXT    NOT NULL DEFAULT '',   -- csv of 0..6, empty = every day
  start_time       TEXT,
  end_time         TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  display_order    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promotion_items (
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  PRIMARY KEY (promotion_id, menu_item_id)
);

CREATE TABLE IF NOT EXISTS qr_codes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id      INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  label            TEXT    NOT NULL,
  table_identifier TEXT,
  area             TEXT    NOT NULL DEFAULT 'general',
  destination_path TEXT    NOT NULL DEFAULT '/',
  token            TEXT    NOT NULL UNIQUE,
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  scan_count       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_qr_business ON qr_codes(business_id);

CREATE TABLE IF NOT EXISTS orders (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id          INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  order_reference      TEXT    NOT NULL UNIQUE,
  table_identifier     TEXT,
  status               TEXT    NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','preparing','served','completed','cancelled')),
  subtotal             INTEGER NOT NULL DEFAULT 0,
  discount             INTEGER NOT NULL DEFAULT 0,
  total                INTEGER NOT NULL DEFAULT 0,
  special_instructions TEXT,
  customer_name        TEXT,
  payment_status       TEXT    NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid')),
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_business ON orders(business_id, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id        INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
  item_name_snapshot  TEXT    NOT NULL,
  unit_price_snapshot INTEGER NOT NULL,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  line_total          INTEGER NOT NULL,
  selected_variant    TEXT,
  special_instructions TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

db.exec(SCHEMA);

export function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `item-${Date.now().toString(36)}`;
}

export function uniqueSlug(table: 'menu_items' | 'categories', businessId: number, desired: string, ignoreId?: number): string {
  const base = slugify(desired);
  let candidate = base;
  let n = 2;
  const stmt = db.prepare(`SELECT id FROM ${table} WHERE business_id = ? AND slug = ?`);
  for (;;) {
    const row = stmt.get(businessId, candidate) as { id: number } | undefined;
    if (!row || row.id === ignoreId) return candidate;
    candidate = `${base}-${n++}`;
  }
}

export function audit(userId: number | null, action: string, entity: string, entityId: string | number | null, detail?: unknown) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?,?,?,?,?)').run(
      userId,
      action,
      entity,
      entityId === null ? null : String(entityId),
      detail === undefined ? null : JSON.stringify(detail).slice(0, 4000),
    );
  } catch {
    /* auditing must never break a request */
  }
}

export { DB_FILE };
