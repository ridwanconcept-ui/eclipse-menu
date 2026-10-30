/**
 * Seeds the database with Eclipse's real menu (transcribed from the venue's
 * printed menu cards) and a first administrator account.
 *
 *   npm run seed                 # idempotent: only seeds an empty database
 *   npm run seed -- --force      # wipes and re-seeds (development only)
 *
 * Admin credentials come from ADMIN_EMAIL / ADMIN_PASSWORD, otherwise a random
 * password is generated and printed once to the console.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, nowIso, slugify, uniqueSlug } from './db.js';

const force = process.argv.includes('--force');

interface SeedItem {
  name: string;
  price: number; // naira
  description?: string;
  ingredients?: string;
  promo?: number; // promotional price in naira
  signature?: boolean;
  popular?: boolean;
  isNew?: boolean;
  size?: string;
  status?: 'available' | 'unavailable' | 'sold_out';
  image?: string;
}

interface SeedCategory {
  name: string;
  description: string;
  items: SeedItem[];
}

/**
 * Prices are exactly as printed on the Eclipse menu cards (in naira).
 * Spirit / champagne prices are the venue's bottle-service prices.
 * The administrator can edit every one of these in the dashboard.
 */
const MENU: SeedCategory[] = [
  {
    name: 'Cocktails',
    description: 'House cocktails, shaken to order at the Eclipse bar.',
    items: [
      {
        name: 'Long Island',
        price: 8000,
        image: '/items/cocktail.jpg',
        ingredients: 'Vodka, rum, gin, triple sec, tequila, lime juice, Coke',
        description: 'The full-length classic: five spirits, lime and a cola finish. Approach with respect.',
        popular: true,
      },
      {
        name: 'Cosmopolitan',
        price: 8000,
        ingredients: 'Triple sec, lime juice, cranberry juice',
        description: 'Crisp, tart and blushing pink — triple sec, lime and cranberry.',
      },
      {
        name: 'Boston-Blue',
        price: 8000,
        ingredients: 'Vodka, rum, gin, tequila, lime juice, curacao syrup',
        description: 'A deep curacao-blue pour with a bright citrus edge.',
        signature: true,
      },
      {
        name: 'Classic Mojito',
        price: 7000,
        image: '/items/cocktail.jpg',
        ingredients: 'Lime fruit, mint leaves, rum, soda',
        description: 'Fresh mint and lime muddled with rum and topped with soda.',
        popular: true,
      },
      {
        name: 'Tequila Sunrise',
        price: 7000,
        ingredients: 'Tequila, orange juice, grenadine syrup',
        description: 'Tequila and orange with a grenadine sunrise at the bottom of the glass.',
      },
      {
        name: 'Screw Driver',
        price: 7000,
        ingredients: 'Vodka, orange juice',
        description: 'Vodka and fresh orange juice. Simple, cold, effective.',
      },
      {
        name: 'Sex On The Beach',
        price: 7000,
        ingredients: 'Vodka, peach schnapps, orange juice, cranberry juice, orange wedge',
        description: 'Peach, orange and cranberry over ice, finished with an orange wedge.',
      },
      {
        name: 'Rainbow Paradise',
        price: 7000,
        ingredients: 'Vodka, orange juice, grenadine syrup, curacao syrup',
        description: 'A layered, sunset-coloured house pour with curacao and grenadine.',
      },
      {
        name: 'Screaming Orgasm',
        price: 7000,
        ingredients: 'Vodka, Baileys, milk, Kahlua, cherry to garnish',
        description: 'Creamy, coffee-laced and unapologetically indulgent, garnished with cherry.',
      },
    ],
  },
  {
    name: 'Milkshakes',
    description: 'Thick, blended and served ice-cold.',
    items: [
      { name: 'Banana Milkshake', price: 7000, description: 'Blended banana and milk.' },
      { name: 'Strawberry Milkshake', price: 7000, description: 'Sweet strawberry, blended thick.' },
      { name: 'Chocolate Milkshake', price: 7000, description: 'Rich chocolate, blended to order.' },
      { name: 'Vanilla Milkshake', price: 7000, description: 'Classic vanilla, smooth and cold.' },
    ],
  },
  {
    name: 'Mocktails',
    description: 'Alcohol-free, full-flavour.',
    items: [
      {
        name: 'Chapman',
        price: 6000,
        ingredients: 'Orange juice, Sprite, Fanta, Angostura bitters, grenadine syrup',
        description: 'The Nigerian classic — citrus, bitters and grenadine over plenty of ice.',
        popular: true,
      },
      {
        name: 'Virgin Mojito',
        price: 6000,
        ingredients: 'Lime fruit, mint leaves, sugar, soda / Sprite',
        description: 'All the mint and lime of the original, none of the rum.',
      },
      {
        name: 'Rainbow Heaven',
        price: 6000,
        ingredients: 'Orange juice, mango juice, grenadine syrup, blue curacao, soda',
        description: 'Mango and citrus layered with grenadine and blue curacao.',
      },
    ],
  },
  {
    name: 'Tots',
    description: 'Shot service at the bar.',
    items: [
      { name: 'Olmeca Tequila Shot', price: 3000, description: 'A single shot of Olmeca tequila.' },
      { name: 'Sierra Tequila Shot', price: 2500, description: 'A single shot of Sierra tequila.' },
    ],
  },
  {
    name: 'Shisha',
    description: 'Hookah service — extra coal available on request.',
    items: [
      {
        name: 'Shisha',
        price: 9000,
        image: '/items/shisha.jpg',
        description: 'Full shisha service. Ask your host for available flavours.',
        popular: true,
      },
      { name: 'Extra Coal', price: 500, description: 'Additional coal for your shisha.' },
    ],
  },
  {
    name: 'Beer',
    description: 'Chilled bottles and stouts.',
    items: [
      { name: 'Big Heineken', price: 5000 },
      { name: 'Big Stout', price: 5000 },
      { name: 'Desperado', price: 4500 },
      { name: 'Legend', price: 4500 },
      { name: 'Budweiser', price: 4500 },
      { name: 'Small Heineken', price: 4500 },
      { name: 'Castle Lite', price: 3500 },
      { name: 'Goldberg', price: 3500 },
      { name: 'Small Stout', price: 3500 },
      { name: 'Trophy', price: 3500 },
    ],
  },
  {
    name: 'Single Malt Scotch Whisky',
    description: 'Bottle service.',
    items: [
      { name: 'Glenfiddich 21 Years', price: 700000, signature: true },
      { name: 'Glenfiddich 12 Years', price: 130000 },
    ],
  },
  {
    name: 'Whisky',
    description: 'Bottle service.',
    items: [
      { name: 'Jack Daniel Single Barrel', price: 100000, popular: true },
      { name: 'Gentleman Jack', price: 76000 },
      { name: 'Jameson Black Barrel', price: 80000 },
      { name: 'Johnnie Walker Black Label', price: 80000, popular: true },
      { name: 'Jack Daniel', price: 60000 },
      { name: 'Jameson Irish', price: 50000 },
    ],
  },
  {
    name: 'Cognac & Brandy',
    description: 'Bottle service.',
    items: [
      { name: 'Hennessy XO', price: 650000, signature: true },
      { name: 'Hennessy VSOP', price: 180000, popular: true },
      { name: 'Martell Blue Swift', price: 180000 },
      { name: 'Remy Martin VSOP', price: 170000 },
      { name: 'Hennessy VS', price: 100000, popular: true },
      { name: 'Martell VS', price: 100000 },
    ],
  },
  {
    name: 'Tequila',
    description: 'Bottle service.',
    items: [
      { name: 'Azul Reposado', price: 600000, signature: true },
      { name: 'Casamigos Reposado', price: 280000, popular: true },
      { name: 'Olmeca Blanco', price: 60000 },
      { name: 'Whitley Neil', price: 50000 },
      { name: 'Sierra Silver', price: 40000 },
      { name: 'Sierra Silver Tropical', price: 40000 },
    ],
  },
  {
    name: 'Champagne & Sparkling',
    description: 'Brut, rosé and sparkling — served with sparklers on request.',
    items: [
      { name: 'Moet & Chandon Nectar', price: 200000, image: '/items/champagne.jpg', signature: true, popular: true },
      { name: 'Belaire Rare Rosé (Non-Luminous)', price: 120000, image: '/items/champagne.jpg' },
      { name: 'Martini Rosé', price: 36000 },
      { name: 'JP Chenet Ice', price: 30000 },
      { name: 'Du Vernay Rosé', price: 30000 },
    ],
  },
  {
    name: 'Vodka',
    description: 'Bottle service.',
    items: [
      { name: 'Ciroc', price: 80000, popular: true },
      { name: 'Absolut Vodka', price: 50000 },
      { name: 'Sky Vodka', price: 50000 },
    ],
  },
  {
    name: 'Liqueurs',
    description: 'Bottle service.',
    items: [
      { name: 'Dead Man Finger', price: 50000 },
      { name: 'Campari 1L', price: 47000 },
      { name: 'Campari 70cl', price: 42000 },
    ],
  },
  {
    name: 'Wine & Cream',
    description: 'Bottle service.',
    items: [
      { name: 'Baileys', price: 50000, popular: true },
      { name: 'Carlo Rossi (Red)', price: 28000 },
      { name: 'Four Cousins Rosé', price: 28000 },
      { name: 'Degree Plus', price: 25000 },
    ],
  },
  {
    name: 'Energy Drinks',
    description: '',
    items: [
      { name: 'Red Bull', price: 3000 },
      { name: 'Power Horse', price: 3000 },
    ],
  },
  {
    name: 'Beverages',
    description: 'Mixers, soft drinks and water.',
    items: [
      { name: 'Cranberry Juice', price: 13000 },
      { name: 'Coke', price: 1000 },
      { name: 'Teem Soda', price: 1000 },
      { name: 'Teem Tonic (Can)', price: 1000 },
      { name: 'Teem Bitters Lemon', price: 1000 },
      { name: 'Water', price: 500 },
    ],
  },
];

const OPENING_HOURS = [
  { day: 'Monday', open: '18:00', close: '02:00', closed: false },
  { day: 'Tuesday', open: '18:00', close: '02:00', closed: false },
  { day: 'Wednesday', open: '18:00', close: '02:00', closed: false },
  { day: 'Thursday', open: '18:00', close: '03:00', closed: false },
  { day: 'Friday', open: '18:00', close: '04:00', closed: false },
  { day: 'Saturday', open: '18:00', close: '04:00', closed: false },
  { day: 'Sunday', open: '16:00', close: '01:00', closed: false },
];

function seed() {
  const existing = db.prepare('SELECT id FROM businesses LIMIT 1').get();
  if (existing && !force) {
    console.log('Database already seeded — skipping. Use `npm run seed -- --force` to reset.');
    return;
  }

  const tx = db.transaction(() => {
    if (force) {
      for (const t of [
        'order_items',
        'orders',
        'promotion_items',
        'promotions',
        'qr_codes',
        'sessions',
        'audit_log',
        'menu_items',
        'categories',
        'admin_users',
        'businesses',
      ]) {
        db.prepare(`DELETE FROM ${t}`).run();
      }
    }

    const businessInfo = db
      .prepare(
        `INSERT INTO businesses (name, slug, tagline, description, contact_number, address, city, currency, timezone,
          hero_image_url, hero_title, hero_message, promo_banner, opening_hours, social_links, ordering_enabled, menu_visible,
          default_qr_path, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        'Eclipse Night Club',
        'eclipse-night-club',
        'Your Evening, Elevated.',
        'Beach bar, lounge and night club — cocktails, bottle service and shisha until late.',
        null,
        null,
        'Lagos, Nigeria',
        'NGN',
        'Africa/Lagos',
        '/hero-eclipse.jpg',
        'Explore Our Menu',
        'Signature cocktails, premium bottle service and shisha — all prices in Nigerian Naira.',
        null,
        JSON.stringify(OPENING_HOURS),
        JSON.stringify({}),
        0,
        1,
        '/',
        nowIso(),
        nowIso(),
      );
    const businessId = Number(businessInfo.lastInsertRowid);

    // ---- First administrator -------------------------------------------------
    const email = (process.env.ADMIN_EMAIL ?? 'admin@eclipse.local').toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(9).toString('base64url');
    db.prepare(
      `INSERT INTO admin_users (business_id, email, name, password_hash, role, created_at)
       VALUES (?,?,?,?,?,?)`,
    ).run(businessId, email, 'Eclipse Owner', bcrypt.hashSync(password, 12), 'owner', nowIso());

    // ---- Categories & items -------------------------------------------------
    const insertCategory = db.prepare(
      `INSERT INTO categories (business_id, name, slug, description, display_order, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,1,?,?)`,
    );
    const insertItem = db.prepare(
      `INSERT INTO menu_items (business_id, category_id, name, slug, description, ingredients, price, promotional_price,
        image_url, size_label, availability_status, is_signature, is_popular, is_new, display_order, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );

    const cocktailItemIds: number[] = [];

    MENU.forEach((cat, catIndex) => {
      const catInfo = insertCategory.run(
        businessId,
        cat.name,
        slugify(cat.name),
        cat.description || null,
        catIndex + 1,
        nowIso(),
        nowIso(),
      );
      const categoryId = Number(catInfo.lastInsertRowid);

      cat.items.forEach((item, index) => {
        const info = insertItem.run(
          businessId,
          categoryId,
          item.name,
          uniqueSlug('menu_items', businessId, item.name),
          item.description ?? null,
          item.ingredients ?? null,
          item.price * 100,
          item.promo ? item.promo * 100 : null,
          item.image ?? null,
          item.size ?? null,
          item.status ?? 'available',
          item.signature ? 1 : 0,
          item.popular ? 1 : 0,
          item.isNew ? 1 : 0,
          index + 1,
          nowIso(),
          nowIso(),
        );
        if (cat.name === 'Cocktails') cocktailItemIds.push(Number(info.lastInsertRowid));
      });
    });

    // ---- Demo promotions (fully editable in the dashboard) -------------------
    const promoInfo = db
      .prepare(
        `INSERT INTO promotions (business_id, name, description, kind, discount_percent, start_at, end_at, days_of_week,
          start_time, end_time, is_active, display_order, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        businessId,
        'Golden Hour',
        '20% off every cocktail, every evening from 5pm to 11pm.',
        'happy_hour',
        20,
        null,
        null,
        '',
        '17:00',
        '23:00',
        1,
        1,
        nowIso(),
        nowIso(),
      );
    const promoId = Number(promoInfo.lastInsertRowid);
    const link = db.prepare('INSERT OR IGNORE INTO promotion_items (promotion_id, menu_item_id) VALUES (?,?)');
    for (const id of cocktailItemIds) link.run(promoId, id);

    db.prepare(
      `INSERT INTO promotions (business_id, name, description, kind, discount_percent, start_at, end_at, days_of_week,
        start_time, end_time, is_active, display_order, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      businessId,
      'Shisha Sundays',
      'Complimentary extra coal on every shisha order, all Sunday night.',
      'special',
      null,
      null,
      null,
      '0',
      null,
      null,
      1,
      2,
      nowIso(),
      nowIso(),
    );

    // ---- QR codes -----------------------------------------------------------
    const insertQr = db.prepare(
      `INSERT INTO qr_codes (business_id, label, table_identifier, area, destination_path, token, is_active, created_at)
       VALUES (?,?,?,?,?,?,1,?)`,
    );
    const qrSeeds: { label: string; table: string | null; area: string }[] = [
      { label: 'Main Entrance', table: null, area: 'general' },
      { label: 'Main Bar', table: null, area: 'main_bar' },
      { label: 'VIP 01', table: 'VIP 01', area: 'vip_lounge' },
      { label: 'VIP 02', table: 'VIP 02', area: 'vip_lounge' },
      { label: 'Table 01', table: 'Table 01', area: 'restaurant' },
      { label: 'Table 02', table: 'Table 02', area: 'restaurant' },
      { label: 'Table 03', table: 'Table 03', area: 'restaurant' },
      { label: 'Poolside 01', table: 'Poolside 01', area: 'poolside' },
    ];
    for (const q of qrSeeds) {
      const token = crypto.randomBytes(7).toString('base64url');
      insertQr.run(
        businessId,
        q.label,
        q.table,
        q.area,
        q.table ? `/?t=${token}` : '/',
        token,
        nowIso(),
      );
    }

    return { email, password, businessId };
  });

  const result = tx();
  if (!result) return;
  console.log('\n✅ Eclipse menu seeded');
  console.log(`   Menu items : ${db.prepare('SELECT COUNT(*) c FROM menu_items').get() && (db.prepare('SELECT COUNT(*) c FROM menu_items').get() as { c: number }).c}`);
  console.log(`   Categories : ${(db.prepare('SELECT COUNT(*) c FROM categories').get() as { c: number }).c}`);
  console.log(`   QR codes   : ${(db.prepare('SELECT COUNT(*) c FROM qr_codes').get() as { c: number }).c}`);
  console.log(`\n   Admin email    : ${result.email}`);
  console.log(`   Admin password : ${result.password}`);
  console.log('\n   ⚠️  Store that password now — it is not shown again. Change it after signing in.\n');
}

seed();
