/**
 * End-to-end acceptance tests against a running API.
 *   npm run test
 *
 * Verifies the criteria from the brief: public access, CRUD persistence,
 * promotion scheduling, QR generation/stability, ordering, CSV and security.
 * Every record created here is cleaned up at the end.
 */
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4000';
const EMAIL = process.env.ADMIN_EMAIL ?? 'admin@eclipse.local';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'EclipseMenu2026!';

let cookie = '';
let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

async function call<T = any>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<{ status: number; body: T; headers: Headers }> {
  const headers: Record<string, string> = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (init.auth !== false && cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE}/api${path}`, { ...init, headers, redirect: 'manual' });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];

  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('json') ? await res.json() : ((await res.text()) as unknown);
  return { status: res.status, body: body as T, headers: res.headers };
}

async function main() {
  console.log(`Testing ${BASE}\n`);

  /* ---------------------------------------------------------------- */
  section('1. Public menu access');
  const menu = await call('/public/menu');
  ok('menu loads without authentication', menu.status === 200);
  ok('business details present', !!menu.body.business?.name, menu.body.business?.name);
  ok('categories returned', menu.body.categories?.length > 0, menu.body.categories?.length);
  ok('items returned', menu.body.items?.length > 0, menu.body.items?.length);
  ok(
    'prices are integer kobo',
    menu.body.items.every((i: any) => Number.isInteger(i.price) && i.price > 0),
  );
  ok('ordering disabled by default', menu.body.ordering_enabled === false);

  section('2. Catalogue integrity');
  const firstItem = menu.body.items[0];
  ok('item has category name', !!firstItem.category_name);
  ok('item effective price <= list price', firstItem.effective_price <= firstItem.price);
  const promoCocktails = menu.body.items.filter((i: any) => i.active_promotion === 'Golden Hour');
  ok('active happy hour discounts selected cocktails only', promoCocktails.length > 0 && promoCocktails.length < menu.body.items.length, promoCocktails.length);
  ok(
    'discounted price equals 80% of list price',
    promoCocktails.every((i: any) => i.effective_price === Math.round(i.price * 0.8)),
  );

  section('3. Authentication & authorization');
  const badLogin = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: 'wrong-password-123' }),
  });
  ok('bad password rejected (401)', badLogin.status === 401, badLogin.status);

  const unauth = await call('/admin/items', { auth: false });
  ok('admin API blocked without a session (401)', unauth.status === 401, unauth.status);

  const login = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  ok('valid credentials accepted', login.status === 200 && !!login.body.user, login.body);
  ok('session cookie issued', cookie.startsWith('eclipse_session='), cookie.slice(0, 30));

  const me = await call('/auth/me');
  ok('session resolves the admin user', me.status === 200 && me.body.user?.email === EMAIL);
  ok('role-based data present', ['owner', 'manager', 'staff'].includes(me.body.user?.role));

  const publicCannotWrite = await call('/admin/items', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ name: 'Hack', category_id: 1, price: 100 }),
  });
  ok('anonymous write rejected', publicCannotWrite.status === 401, publicCannotWrite.status);

  section('4. Validation');
  const invalid = await call('/admin/items', {
    method: 'POST',
    body: JSON.stringify({ name: '', category_id: 0, price: -5, promotional_price: 100 }),
  });
  ok('invalid item rejected (400)', invalid.status === 400, invalid.status);
  ok('field errors returned', !!invalid.body.fields && Object.keys(invalid.body.fields).length > 0, invalid.body.fields);

  /* ---------------------------------------------------------------- */
  section('5. Admin CRUD + live propagation');
  const categories = await call('/admin/categories');
  const catId = categories.body.categories[0].id;

  const created = await call('/admin/items', {
    method: 'POST',
    body: JSON.stringify({
      name: 'QA Test Cocktail',
      category_id: catId,
      description: 'Created by the automated acceptance test.',
      ingredients: 'Test gin, test lime',
      price: 1234500, // ₦12,345.00
      availability_status: 'available',
      is_signature: true,
    }),
  });
  ok('admin can create an item (201)', created.status === 201, created.status);
  const itemId = created.body.item?.id;
  ok('created item persisted with kobo price', created.body.item?.price === 1234500);

  const edited = await call(`/admin/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'QA Test Cocktail',
      category_id: catId,
      price: 990000,
      promotional_price: 800000,
      availability_status: 'available',
      is_signature: true,
    }),
  });
  ok('admin can edit the price', edited.status === 200 && edited.body.item?.price === 990000, edited.body.item?.price);

  const menuAfterEdit = await call('/public/menu');
  const liveItem = menuAfterEdit.body.items.find((i: any) => i.id === itemId);
  ok('public menu reflects the new item', !!liveItem, liveItem?.name);
  ok('public menu reflects the edited price', liveItem?.effective_price === 800000, liveItem?.effective_price);
  ok('promotional price wins over list price', liveItem?.promotional_price === 800000);

  const hidden = await call(`/admin/items/${itemId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ availability_status: 'unavailable' }),
  });
  ok('availability can be toggled', hidden.status === 200);
  const menuAfterHide = await call('/public/menu');
  const hiddenItem = menuAfterHide.body.items.find((i: any) => i.id === itemId);
  ok('unavailable item is flagged to guests', hiddenItem?.availability_status === 'unavailable', hiddenItem?.availability_status);

  const dup = await call(`/admin/items/${itemId}/duplicate`, { method: 'POST' });
  ok('item can be duplicated', dup.status === 201 && dup.body.item?.id !== itemId);
  const dupId = dup.body.item?.id;
  // The duplicate inherits the source status; make it sellable for the order tests.
  await call(`/admin/items/${dupId}/status`, { method: 'PATCH', body: JSON.stringify({ availability_status: 'available' }) });
  await call(`/admin/items/${itemId}/status`, { method: 'PATCH', body: JSON.stringify({ availability_status: 'available' }) });

  /* ---------------------------------------------------------------- */
  section('6. Promotion scheduling');
  const promos = await call('/admin/promotions');
  ok('promotions list loads', promos.status === 200 && promos.body.promotions.length > 0);

  // An always-on 50% promo scoped to the test item
  const activePromo = await call('/admin/promotions', {
    method: 'POST',
    body: JSON.stringify({
      name: 'QA Always On',
      description: 'test',
      kind: 'special',
      discount_percent: 50,
      days_of_week: [],
      is_active: true,
      item_ids: [itemId],
    }),
  });
  ok('promotion created', activePromo.status === 201, activePromo.status);
  const activePromoId = activePromo.body.promotion?.id;

  const menuPromo = await call('/public/menu');
  const promoItem = menuPromo.body.items.find((i: any) => i.id === itemId);
  ok('active promotion applies the discount', promoItem?.effective_price === Math.round(990000 * 0.5), promoItem?.effective_price);
  ok('active promotion is labelled', promoItem?.active_promotion === 'QA Always On', promoItem?.active_promotion);

  // A promotion restricted to a weekday that is not today must not apply
  const todayWeekday = new Date().getDay();
  const otherDay = (todayWeekday + 3) % 7;
  const futurePromo = await call('/admin/promotions', {
    method: 'POST',
    body: JSON.stringify({
      name: 'QA Wrong Day',
      kind: 'happy_hour',
      discount_percent: 90,
      days_of_week: [otherDay],
      is_active: true,
      item_ids: [itemId],
    }),
  });
  const futurePromoId = futurePromo.body.promotion?.id;
  const menuWrongDay = await call('/public/menu');
  ok(
    'promotion outside its weekday does not apply',
    menuWrongDay.body.items.find((i: any) => i.id === itemId)?.effective_price === Math.round(990000 * 0.5),
  );

  // Expired promotion must never apply
  const expired = await call('/admin/promotions', {
    method: 'POST',
    body: JSON.stringify({
      name: 'QA Expired',
      kind: 'special',
      discount_percent: 95,
      start_at: '2020-01-01',
      end_at: '2020-01-02',
      days_of_week: [],
      is_active: true,
      item_ids: [itemId],
    }),
  });
  ok('expired promotion can be stored', expired.status === 201, expired.body);
  const menuExpired = await call('/public/menu');
  ok(
    'expired promotion does not remain active',
    menuExpired.body.items.find((i: any) => i.id === itemId)?.active_promotion === 'QA Always On',
    menuExpired.body.items.find((i: any) => i.id === itemId)?.active_promotion,
  );

  section('7. QR codes');
  const qrList = await call('/admin/qr');
  ok('QR codes listed', qrList.status === 200 && qrList.body.qr_codes.length > 0, qrList.body.qr_codes?.length);
  const seededTable = qrList.body.qr_codes.find((q: any) => q.table_identifier);
  ok('table QR carries a table identifier', !!seededTable?.table_identifier);

  const newQr = await call('/admin/qr', {
    method: 'POST',
    body: JSON.stringify({ label: 'QA Table 99', table_identifier: 'QA 99', area: 'restaurant' }),
  });
  ok('QR code created', newQr.status === 201, newQr.status);
  const qrId = newQr.body.qr?.id;
  ok('QR destination is the menu URL only', /^https?:\/\/[^/]+\/\?t=/.test(newQr.body.qr?.url ?? ''), newQr.body.qr?.url);
  ok('no menu data embedded in the QR payload', !newQr.body.qr?.url.includes('items'));

  const resolved = await call(`/public/qr/${newQr.body.qr.token}`, { auth: false });
  ok('QR token resolves publicly', resolved.status === 200 && resolved.body.table_identifier === 'QA 99', resolved.body);

  const png = await fetch(`${BASE}/api/admin/qr/${qrId}/image.png`, { headers: { Cookie: cookie } });
  const pngBuf = Buffer.from(await png.arrayBuffer());
  ok('PNG QR generated', png.status === 200 && png.headers.get('content-type') === 'image/png');
  ok('PNG has a real image signature', pngBuf.subarray(1, 4).toString() === 'PNG', pngBuf.subarray(0, 8).toString('hex'));

  const svg = await fetch(`${BASE}/api/admin/qr/${qrId}/image.svg`, { headers: { Cookie: cookie } });
  const svgText = await svg.text();
  ok('SVG QR generated', svg.status === 200 && svgText.includes('<svg'));

  // Menu edits must not invalidate existing codes
  await call(`/admin/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'QA Test Cocktail', category_id: catId, price: 1111100, availability_status: 'available' }),
  });
  const qrAfterEdits = await call('/admin/qr');
  const sameQr = qrAfterEdits.body.qr_codes.find((q: any) => q.id === qrId);
  ok('QR destination is stable after menu changes', sameQr?.url === newQr.body.qr.url, sameQr?.url);

  const deactivated = await call(`/admin/qr/${qrId}`, { method: 'PATCH', body: JSON.stringify({ is_active: false }) });
  ok('QR code can be deactivated', deactivated.status === 200 && deactivated.body.qr.is_active === false);
  const deadResolve = await call(`/public/qr/${newQr.body.qr.token}`, { auth: false });
  ok('deactivated QR no longer resolves', deadResolve.status === 404, deadResolve.status);

  section('8. CSV import / export');
  const csvExport = await call('/admin/items-export.csv');
  ok('CSV export returns text/csv', String(csvExport.headers.get('content-type')).includes('text/csv'));
  const csvText = String(csvExport.body);
  ok('CSV export contains a header row', csvText.split('\n')[0].includes('name,category,description'));
  ok('CSV export contains seeded items', csvText.includes('Long Island'));

  const imported = await call('/admin/items-import', {
    method: 'POST',
    body: JSON.stringify({
      csv: 'name,category,price_naira,description\nQA Imported Drink,QA Import Category,4500,"Imported, with a comma"\n',
    }),
  });
  ok('CSV import creates items', imported.status === 200 && imported.body.created === 1, imported.body);
  const menuAfterImport = await call('/public/menu');
  const importedItem = menuAfterImport.body.items.find((i: any) => i.name === 'QA Imported Drink');
  ok('imported item appears on the public menu', !!importedItem && importedItem.price === 450000, importedItem?.price);

  /* ---------------------------------------------------------------- */
  section('9. Ordering (mode 2)');
  const blockedOrder = await call('/public/orders', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ table_identifier: 'T1', items: [{ menu_item_id: itemId, quantity: 1 }] }),
  });
  ok('ordering blocked while disabled (403)', blockedOrder.status === 403, blockedOrder.status);

  const settingsBefore = await call('/admin/settings');
  await call('/admin/settings', { method: 'PUT', body: JSON.stringify({ ordering_enabled: true }) });
  const menuOrdering = await call('/public/menu');
  ok('ordering flag is exposed publicly once enabled', menuOrdering.body.ordering_enabled === true);

  const orderRes = await call('/public/orders', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({
      table_identifier: 'QA 99',
      special_instructions: 'Automated test order',
      items: [
        { menu_item_id: itemId, quantity: 2 },
        { menu_item_id: dupId, quantity: 1 },
      ],
    }),
  });
  ok('order submitted (201)', orderRes.status === 201, orderRes.body);
  const order = orderRes.body.order;
  ok('order has a unique reference', /^ECL-\d{6}-[A-F0-9]{4}$/.test(order?.order_reference ?? ''), order?.order_reference);
  // 50% QA promo applies to itemId, so its unit price is 555,550; the duplicate sells at its 800,000 promo price.
  const expectedTotal = 555550 * 2 + 800000;
  ok('order total computed server-side', order?.total === expectedTotal, { total: order?.total, expected: expectedTotal });
  ok('order items snapshot the item name', order?.items?.[0]?.item_name_snapshot === 'QA Test Cocktail');
  ok('order is not marked paid', order?.payment_status === 'unpaid');
  ok('table identifier preserved', order?.table_identifier === 'QA 99');

  const lookup = await call(`/public/orders/${order.order_reference}`, { auth: false });
  ok('guest can track the order', lookup.status === 200 && lookup.body.order.status === 'pending');

  const adminOrders = await call('/admin/orders');
  ok('admin sees the order', adminOrders.body.orders.some((o: any) => o.order_reference === order.order_reference));

  const statusChange = await call(`/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'preparing' }),
  });
  ok('order status can be updated', statusChange.status === 200);
  const lookup2 = await call(`/public/orders/${order.order_reference}`, { auth: false });
  ok('guest tracking reflects the new status', lookup2.body.order.status === 'preparing', lookup2.body.order.status);

  // Snapshot integrity: renaming the item must not alter the historical order
  await call(`/admin/items/${itemId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'QA Test Cocktail Renamed', category_id: catId, price: 500000, availability_status: 'available' }),
  });
  const lookup3 = await call(`/public/orders/${order.order_reference}`, { auth: false });
  ok(
    'historical order keeps its original name and price',
    lookup3.body.order.items[0].item_name_snapshot === 'QA Test Cocktail' &&
      lookup3.body.order.items[0].unit_price_snapshot === 555550,
    lookup3.body.order.items[0],
  );

  /* ---------------------------------------------------------------- */
  section('10. Safeguards');
  const deleteCat = await call(`/admin/categories/${catId}`, { method: 'DELETE' });
  ok('category with items cannot be deleted (409)', deleteCat.status === 409, deleteCat.status);

  const dash = await call('/admin/dashboard');
  ok('dashboard returns real counts', dash.status === 200 && dash.body.stats.total_items > 0, dash.body.stats?.total_items);
  ok('dashboard counts match the menu table', dash.body.stats.total_items === (await call('/admin/items')).body.items.length);

  /* ---------------------------------------------------------------- */
  section('Cleanup');
  await call(`/admin/items/${itemId}`, { method: 'DELETE' });
  await call(`/admin/items/${dupId}`, { method: 'DELETE' });
  if (importedItem) await call(`/admin/items/${importedItem.id}`, { method: 'DELETE' });
  // Deleting the category cascade-removes the QA import category's items
  const catsNow = await call('/admin/categories');
  const qaCat = catsNow.body.categories.find((c: any) => c.name === 'QA Import Category');
  if (qaCat) await call(`/admin/categories/${qaCat.id}`, { method: 'DELETE' });
  for (const pid of [activePromoId, futurePromoId, expired.body.promotion?.id]) {
    if (pid) await call(`/admin/promotions/${pid}`, { method: 'DELETE' });
  }
  await call(`/admin/qr/${qrId}`, { method: 'DELETE' });
  await call('/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ ordering_enabled: settingsBefore.body.business.ordering_enabled }),
  });
  const finalMenu = await call('/public/menu');
  ok('cleanup restored the original menu', !finalMenu.body.items.some((i: any) => String(i.name).startsWith('QA ')));

  /* ---------------------------------------------------------------- */
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`Result: ${passed} passed, ${failed} failed`);
  if (failed) {
    console.log('Failed checks:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exitCode = 1;
  } else {
    console.log('All acceptance checks passed ✅');
  }
}

main().catch((e) => {
  console.error('\nTest run crashed:', e);
  process.exitCode = 1;
});
