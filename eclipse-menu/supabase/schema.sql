-- =====================================================================
-- Eclipse Digital Menu — PostgreSQL / Supabase schema
-- =====================================================================
-- This file mirrors the SQLite schema used by the shipped API 1:1, so the
-- application can be moved to Supabase without changing business logic.
-- Money columns are BIGINT kobo (NGN minor units) — never floats.
--
-- Run in the Supabase SQL editor (or `supabase db push`) as the project owner.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- helpers
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------- businesses
create table if not exists businesses (
  id               bigint generated always as identity primary key,
  name             text not null,
  slug             text not null unique,
  logo_url         text,
  tagline          text,
  description      text,
  contact_number   text,
  address          text,
  city             text,
  currency         text not null default 'NGN',
  timezone         text not null default 'Africa/Lagos',
  hero_image_url   text,
  hero_title       text,
  hero_message     text,
  promo_banner     text,
  opening_hours    jsonb not null default '[]'::jsonb,
  social_links     jsonb not null default '{}'::jsonb,
  ordering_enabled boolean not null default false,
  menu_visible     boolean not null default true,
  default_qr_path  text not null default '/',
  public_base_url  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- admin users
-- Mirrors auth.users (Supabase Auth). The profile row carries the business
-- link and role used for authorization inside RLS policies.
create table if not exists admin_users (
  id          uuid primary key references auth.users (id) on delete cascade,
  business_id bigint not null references businesses (id) on delete cascade,
  email       text not null unique,
  name        text not null default 'Administrator',
  role        text not null default 'owner' check (role in ('owner','manager','staff')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function current_admin() returns admin_users as $$
  select * from admin_users where id = auth.uid() and is_active limit 1;
$$ language sql stable security definer;

create or replace function current_business_id() returns bigint as $$
  select business_id from admin_users where id = auth.uid() and is_active limit 1;
$$ language sql stable security definer;

create or replace function is_admin() returns boolean as $$
  select exists (select 1 from admin_users where id = auth.uid() and is_active);
$$ language sql stable security definer;

-- ---------------------------------------------------------------- categories
create table if not exists categories (
  id            bigint generated always as identity primary key,
  business_id   bigint not null references businesses (id) on delete cascade,
  name          text not null,
  slug          text not null,
  description   text,
  image_url     text,
  display_order int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id, slug)
);

create index if not exists idx_categories_business on categories (business_id, display_order);

-- ---------------------------------------------------------------- menu items
create table if not exists menu_items (
  id                  bigint generated always as identity primary key,
  business_id         bigint not null references businesses (id) on delete cascade,
  category_id         bigint not null references categories (id) on delete restrict,
  name                text not null,
  slug                text not null,
  description         text,
  ingredients         text,
  allergens           text,
  price               bigint not null check (price >= 0),                 -- kobo
  promotional_price   bigint check (promotional_price is null or promotional_price >= 0),
  image_url           text,
  size_label          text,
  availability_status text not null default 'available'
                        check (availability_status in ('available','unavailable','sold_out')),
  is_signature        boolean not null default false,
  is_popular          boolean not null default false,
  is_new              boolean not null default false,
  display_order       int not null default 0,
  is_deleted          boolean not null default false,
  is_deleted_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (business_id, slug),
  constraint promo_lt_price check (promotional_price is null or promotional_price < price)
);

create index if not exists idx_items_category on menu_items (category_id);
create index if not exists idx_items_business on menu_items (business_id, is_deleted);

-- ---------------------------------------------------------------- promotions
create table if not exists promotions (
  id               bigint generated always as identity primary key,
  business_id      bigint not null references businesses (id) on delete cascade,
  name             text not null,
  description      text,
  kind             text not null default 'happy_hour'
                     check (kind in ('happy_hour','special','featured','bundle')),
  discount_percent int check (discount_percent is null or discount_percent between 0 and 100),
  start_at         date,
  end_at           date,
  days_of_week     int[] not null default '{}',   -- 0=Sun … 6=Sat, empty = every day
  start_time       time,
  end_time         time,
  is_active        boolean not null default true,
  display_order    int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists promotion_items (
  promotion_id bigint not null references promotions (id) on delete cascade,
  menu_item_id bigint not null references menu_items (id) on delete cascade,
  primary key (promotion_id, menu_item_id)
);

-- ---------------------------------------------------------------- QR codes
create table if not exists qr_codes (
  id               bigint generated always as identity primary key,
  business_id      bigint not null references businesses (id) on delete cascade,
  label            text not null,
  table_identifier text,
  area             text not null default 'general'
                     check (area in ('general','main_bar','vip_lounge','restaurant','poolside','private_event')),
  destination_path text not null default '/',
  token            text not null unique default encode(gen_random_bytes(7), 'hex'),
  is_active        boolean not null default true,
  scan_count       bigint not null default 0,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- orders
create table if not exists orders (
  id                   bigint generated always as identity primary key,
  business_id          bigint not null references businesses (id) on delete cascade,
  order_reference      text not null unique,
  table_identifier     text,
  status               text not null default 'pending'
                         check (status in ('pending','preparing','served','completed','cancelled')),
  subtotal             bigint not null default 0,
  discount             bigint not null default 0,
  total                bigint not null default 0,
  special_instructions text,
  customer_name        text,
  payment_status       text not null default 'unpaid' check (payment_status in ('unpaid','paid')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_orders_business on orders (business_id, created_at desc);

create table if not exists order_items (
  id                   bigint generated always as identity primary key,
  order_id             bigint not null references orders (id) on delete cascade,
  menu_item_id         bigint references menu_items (id) on delete set null,
  item_name_snapshot   text not null,
  unit_price_snapshot  bigint not null,
  quantity             int not null check (quantity > 0),
  line_total           bigint not null,
  selected_variant     text,
  special_instructions text
);

create index if not exists idx_order_items_order on order_items (order_id);

-- ---------------------------------------------------------------- audit
create table if not exists audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid references admin_users (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  detail     jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- triggers
do $$
declare t text;
begin
  foreach t in array array['businesses','categories','menu_items','promotions','orders'] loop
    execute format('drop trigger if exists trg_%1$s_updated on %1$s;', t);
    execute format('create trigger trg_%1$s_updated before update on %1$s
                    for each row execute function set_updated_at();', t);
  end loop;
end $$;

-- =====================================================================
-- ROW LEVEL SECURITY
--   * Anonymous guests: read published menu data only.
--   * Authenticated admins: full CRUD scoped to their own business_id.
--   * Orders: guests may create an order (insert) but never read others';
--     staff read/update orders for their business.
-- =====================================================================
alter table businesses      enable row level security;
alter table admin_users     enable row level security;
alter table categories      enable row level security;
alter table menu_items      enable row level security;
alter table promotions      enable row level security;
alter table promotion_items enable row level security;
alter table qr_codes        enable row level security;
alter table orders          enable row level security;
alter table order_items     enable row level security;
alter table audit_log       enable row level security;

-- Public read of the venue profile (needed for the header/hero).
drop policy if exists "public read business" on businesses;
create policy "public read business" on businesses for select to anon, authenticated using (menu_visible);

drop policy if exists "admin manage business" on businesses;
create policy "admin manage business" on businesses for all to authenticated
  using (id = current_business_id()) with check (id = current_business_id());

-- Menu data: anyone may read active categories / non-deleted items.
drop policy if exists "public read categories" on categories;
create policy "public read categories" on categories for select to anon, authenticated using (is_active);

drop policy if exists "admin write categories" on categories;
create policy "admin write categories" on categories for all to authenticated
  using (business_id = current_business_id()) with check (business_id = current_business_id());

drop policy if exists "public read items" on menu_items;
create policy "public read items" on menu_items for select to anon, authenticated
  using (not is_deleted and exists (
    select 1 from categories c where c.id = category_id and c.is_active
  ));

drop policy if exists "admin write items" on menu_items;
create policy "admin write items" on menu_items for all to authenticated
  using (business_id = current_business_id()) with check (business_id = current_business_id());

drop policy if exists "public read promotions" on promotions;
create policy "public read promotions" on promotions for select to anon, authenticated using (is_active);

drop policy if exists "admin write promotions" on promotions;
create policy "admin write promotions" on promotions for all to authenticated
  using (business_id = current_business_id()) with check (business_id = current_business_id());

drop policy if exists "public read promotion items" on promotion_items;
create policy "public read promotion items" on promotion_items for select to anon, authenticated using (true);

drop policy if exists "admin write promotion items" on promotion_items;
create policy "admin write promotion items" on promotion_items for all to authenticated
  using (exists (select 1 from promotions p where p.id = promotion_id and p.business_id = current_business_id()))
  with check (exists (select 1 from promotions p where p.id = promotion_id and p.business_id = current_business_id()));

-- QR tokens are resolved server-side; admins manage their own.
drop policy if exists "admin manage qr" on qr_codes;
create policy "admin manage qr" on qr_codes for all to authenticated
  using (business_id = current_business_id()) with check (business_id = current_business_id());

-- Orders: guests may insert, staff read/update. Never public read.
drop policy if exists "guest create order" on orders;
create policy "guest create order" on orders for insert to anon, authenticated
  with check (payment_status = 'unpaid' and status = 'pending');

drop policy if exists "admin read orders" on orders;
create policy "admin read orders" on orders for select to authenticated using (business_id = current_business_id());

drop policy if exists "admin update orders" on orders;
create policy "admin update orders" on orders for update to authenticated
  using (business_id = current_business_id()) with check (business_id = current_business_id());

drop policy if exists "guest create order items" on order_items;
create policy "guest create order items" on order_items for insert to anon, authenticated with check (true);

drop policy if exists "admin read order items" on order_items;
create policy "admin read order items" on order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id and o.business_id = current_business_id()));

-- Admin profiles and audit log: self-scoped reads, owner-only audit access.
drop policy if exists "admin read self" on admin_users;
create policy "admin read self" on admin_users for select to authenticated using (id = auth.uid());

drop policy if exists "admin read audit" on audit_log;
create policy "admin read audit" on audit_log for select to authenticated
  using (exists (select 1 from admin_users a where a.id = auth.uid() and a.role = 'owner' and a.business_id = current_business_id()));

drop policy if exists "admin write audit" on audit_log;
create policy "admin write audit" on audit_log for insert to authenticated with check (is_admin());

-- =====================================================================
-- Storage bucket for product images
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

drop policy if exists "public read menu images" on storage.objects;
create policy "public read menu images" on storage.objects for select to anon, authenticated
  using (bucket_id = 'menu-images');

drop policy if exists "admin upload menu images" on storage.objects;
create policy "admin upload menu images" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-images' and is_admin());

drop policy if exists "admin update menu images" on storage.objects;
create policy "admin update menu images" on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and is_admin());

drop policy if exists "admin delete menu images" on storage.objects;
create policy "admin delete menu images" on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and is_admin());

-- =====================================================================
-- Create the first administrator
--   1. Create the user in Supabase Auth (dashboard or `supabase auth admin`).
--   2. Insert their profile: see scripts/create-admin.sql for the template.
-- =====================================================================
