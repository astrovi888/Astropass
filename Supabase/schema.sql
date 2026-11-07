-- =====================================================================================
--  AstroVault database schema
--  Run once in a NEW Supabase project:  SQL Editor -> New query -> paste -> Run.
--  Safe to re-run (everything is "if not exists" / "create or replace").
--
--  SECURITY MODEL (read this before changing anything)
--   * The browser only ever holds the publishable/anon key. It can READ its own rows (RLS) and call RPC functions.
--   * Browsers have NO write access to profiles, orders, wallet_transactions or topup_requests. Balances and orders
--     change only inside the SECURITY DEFINER functions below, which check auth.uid() themselves.
--   * Money rule: profiles.balance is a cache of the ledger. Every change to it writes a wallet_transactions row
--     in the same transaction (see _wallet_apply). balance can never go below 0 (CHECK constraint backstop).
--   * Admin = profiles.is_admin = true. Nobody can set that from the browser (no UPDATE policy exists).
-- =====================================================================================

-- ---------- 1. TABLES -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null,
  email       text not null default '',
  balance     numeric(12,2) not null default 0 check (balance >= 0),   -- site balance, 1 USD = 1.00
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));

create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null check (length(name) between 1 and 120),
  description     text not null default '',
  category        text not null default 'other',            -- free text; the labels live in config.js (CATEGORIES)
  icon            text not null default '📦',               -- one emoji
  duration_label  text not null default '',                 -- e.g. "1 month"
  price           numeric(10,2) not null check (price >= 0),          -- what the customer pays
  retail_price    numeric(10,2) check (retail_price is null or retail_price >= 0),  -- original price (for the strike-through)
  fulfillment     text not null check (fulfillment in ('instant','manual')),
  input_label     text,                                     -- if set, the buyer must type something (e.g. "Your Spotify email")
  terms           text not null default '',                 -- warranty / replacement policy shown on the product
  sort_order      int  not null default 100,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.inventory_stock (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete restrict,
  payload     text not null check (length(payload) between 1 and 4000),  -- credentials / code / invite link
  status      text not null default 'available' check (status in ('available','sold')),
  order_id    uuid,
  created_at  timestamptz not null default now(),
  sold_at     timestamptz
);
create index if not exists inventory_available_idx on public.inventory_stock (product_id, created_at) where status = 'available';

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  product_name  text not null,                              -- snapshots: later product edits never rewrite history
  price         numeric(10,2) not null,
  fulfillment   text not null,
  status        text not null check (status in ('pending','completed','cancelled')),
  buyer_input   text,                                       -- what the buyer typed (e.g. their Spotify email)
  delivery      text,                                       -- credentials / code / note shown to the buyer
  admin_note    text,
  request_id    uuid,                                       -- idempotency key from the browser (see purchase())
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create unique index if not exists orders_request_key on public.orders (user_id, request_id) where request_id is not null;
create index if not exists orders_user_idx   on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at);

create table if not exists public.wallet_transactions (    -- append-only ledger
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  amount         numeric(12,2) not null check (amount <> 0),            -- signed: + credit, - debit
  kind           text not null check (kind in ('topup','purchase','refund','adjustment')),
  note           text,
  order_id       uuid,
  topup_id       uuid,
  external_ref   text unique,                                           -- payment-provider transaction id (webhook idempotency)
  balance_after  numeric(12,2) not null,
  created_at     timestamptz not null default now()
);
create index if not exists wallet_tx_user_idx on public.wallet_transactions (user_id, created_at desc);

create table if not exists public.topup_requests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  amount           numeric(10,2) not null check (amount > 0),           -- what the user says they sent
  method           text not null,
  reference        text not null,                                       -- tx id / sender name / receipt number
  status           text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note       text,
  credited_amount  numeric(10,2),                                       -- what the admin actually credited
  created_at       timestamptz not null default now(),
  decided_at       timestamptz
);
create index if not exists topups_status_idx on public.topup_requests (status, created_at);

-- ---------- 2. NEW-USER TRIGGER (creates the profile row) ----------------------------------------------
-- The old AstroLingo version used "on conflict do nothing", which silently skipped the profile when a username
-- was already taken. Here a taken username gets a short random suffix, so a profile ALWAYS exists.

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; cand text; i int := 0;
begin
  base := lower(regexp_replace(
            coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(coalesce(new.email,''), '@', 1)),
            '[^a-zA-Z0-9_.-]', '', 'g'));
  if length(base) < 3 then base := 'user' || substr(md5(random()::text), 1, 6); end if;
  base := left(base, 20);
  cand := base;
  loop
    begin
      insert into public.profiles(id, username, email) values (new.id, cand, coalesce(new.email,''))
      on conflict (id) do nothing;
      exit;
    exception when unique_violation then          -- username taken
      i := i + 1;
      if i > 8 then raise; end if;
      cand := left(base, 15) || substr(md5(random()::text), 1, 4);
    end;
  end loop;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 3. ROW LEVEL SECURITY ------------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

alter table public.profiles            enable row level security;
alter table public.products            enable row level security;
alter table public.inventory_stock     enable row level security;
alter table public.orders              enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.topup_requests      enable row level security;

-- Read-only for owners (and admins). No insert/update/delete policies on these four = browsers cannot write them.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists wallet_tx_select on public.wallet_transactions;
create policy wallet_tx_select on public.wallet_transactions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists topups_select on public.topup_requests;
create policy topups_select on public.topup_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Catalog management: admins only. Customers never read these tables directly; they use get_catalog() below,
-- which exposes products and a stock COUNT but never the stock payloads (the credentials).
drop policy if exists products_admin on public.products;
create policy products_admin on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists stock_select on public.inventory_stock;
create policy stock_select on public.inventory_stock for select to authenticated using (public.is_admin());
drop policy if exists stock_insert on public.inventory_stock;
create policy stock_insert on public.inventory_stock for insert to authenticated with check (public.is_admin());
drop policy if exists stock_update on public.inventory_stock;
create policy stock_update on public.inventory_stock for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists stock_delete on public.inventory_stock;       -- sold rows are history: only unsold stock can be removed
create policy stock_delete on public.inventory_stock for delete to authenticated
  using (public.is_admin() and status = 'available');

-- Belt and braces: even if someone adds a permissive policy later by mistake, these roles lack the privilege.
revoke all on public.profiles, public.orders, public.wallet_transactions, public.topup_requests from anon, authenticated;
grant select on public.profiles, public.orders, public.wallet_transactions, public.topup_requests to authenticated;
revoke all on public.products, public.inventory_stock from anon, authenticated;
grant select, insert, update, delete on public.products, public.inventory_stock to authenticated;

-- ---------- 4. PUBLIC CATALOG ----------------------------------------------------------------------------

create or replace function public.get_catalog()
returns table (
  id uuid, slug text, name text, description text, category text, icon text, duration_label text,
  price numeric, retail_price numeric, fulfillment text, input_label text, terms text, sort_order int,
  stock_left int                                                    -- null for manual products
)
language sql stable security definer set search_path = public as $$
  select p.id, p.slug, p.name, p.description, p.category, p.icon, p.duration_label,
         p.price, p.retail_price, p.fulfillment, p.input_label, p.terms, p.sort_order,
         case when p.fulfillment = 'instant'
              then (select least(count(*), 99)::int from public.inventory_stock s
                    where s.product_id = p.id and s.status = 'available') end
  from public.products p
  where p.is_active
  order by p.sort_order, p.created_at
$$;

-- ---------- 5. WALLET CORE (internal, not callable from the browser) -----------------------------------

create or replace function public._wallet_apply(
  p_user uuid, p_amount numeric, p_kind text, p_note text,
  p_order uuid default null, p_topup uuid default null, p_ref text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v_bal numeric;
begin
  begin
    update public.profiles set balance = balance + p_amount where id = p_user returning balance into v_bal;
  exception when check_violation then
    raise exception 'insufficient_funds';
  end;
  if not found then raise exception 'no_profile'; end if;
  insert into public.wallet_transactions(user_id, amount, kind, note, order_id, topup_id, external_ref, balance_after)
  values (p_user, p_amount, p_kind, p_note, p_order, p_topup, p_ref, v_bal);
  return v_bal;
end $$;

-- ---------- 6. CHECKOUT ----------------------------------------------------------------------------------
-- One atomic transaction: lock wallet -> pick stock -> create order -> deduct -> ledger.
--  * "for update" on the profile row serialises one user's purchases (no double-spend with two tabs).
--  * "for update skip locked" on stock means two buyers of the last unit never get the same credentials.
--  * p_request_id makes retries safe: if the network drops after we charged, retrying with the same id returns
--    the original order instead of charging twice.
--  * p_expected_price stops "price changed while the sheet was open" surprises.

create or replace function public.purchase(
  p_product_id uuid, p_expected_price numeric default null, p_input text default null, p_request_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_bal   numeric;
  v_prod  public.products%rowtype;
  v_stock public.inventory_stock%rowtype;
  v_old   public.orders%rowtype;
  v_order uuid := gen_random_uuid();
  v_status text;
  v_delivery text;
  v_input text := nullif(left(trim(coalesce(p_input, '')), 200), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select balance into v_bal from public.profiles where id = v_uid for update;
  if not found then raise exception 'no_profile'; end if;

  if p_request_id is not null then
    select * into v_old from public.orders where user_id = v_uid and request_id = p_request_id;
    if found then
      return jsonb_build_object('order_id', v_old.id, 'status', v_old.status, 'delivery', v_old.delivery,
                                'balance', v_bal, 'duplicate', true);
    end if;
  end if;

  select * into v_prod from public.products where id = p_product_id and is_active;
  if not found then raise exception 'product_unavailable'; end if;
  if p_expected_price is not null and p_expected_price <> v_prod.price then raise exception 'price_changed'; end if;
  if coalesce(trim(v_prod.input_label), '') <> '' and v_input is null then raise exception 'input_required'; end if;
  if v_bal < v_prod.price then raise exception 'insufficient_funds'; end if;

  if v_prod.fulfillment = 'instant' then
    select * into v_stock from public.inventory_stock
     where product_id = v_prod.id and status = 'available'
     order by created_at, id limit 1
     for update skip locked;
    if not found then raise exception 'out_of_stock'; end if;
    v_status := 'completed';
    v_delivery := v_stock.payload;
  else
    v_status := 'pending';
    v_delivery := null;
  end if;

  insert into public.orders(id, user_id, product_id, product_name, price, fulfillment, status,
                            buyer_input, delivery, request_id, completed_at)
  values (v_order, v_uid, v_prod.id, v_prod.name, v_prod.price, v_prod.fulfillment, v_status,
          v_input, v_delivery, p_request_id, case when v_status = 'completed' then now() end);

  if v_prod.fulfillment = 'instant' then
    update public.inventory_stock set status = 'sold', order_id = v_order, sold_at = now() where id = v_stock.id;
  end if;

  if v_prod.price > 0 then
    v_bal := public._wallet_apply(v_uid, -v_prod.price, 'purchase', v_prod.name, v_order);
  end if;

  return jsonb_build_object('order_id', v_order, 'status', v_status, 'delivery', v_delivery,
                            'balance', v_bal, 'duplicate', false);
end $$;

-- ---------- 7. TOP-UPS -----------------------------------------------------------------------------------
-- Users REQUEST a top-up after paying you by whatever method you offer; an admin approves it and the wallet is
-- credited. (Later, a payment-provider webhook can call _wallet_apply directly with the service_role key; see README.)

create or replace function public.create_topup_request(p_amount numeric, p_method text, p_reference text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_n int;
  v_amt numeric := round(p_amount, 2);
  v_method text := left(trim(coalesce(p_method, '')), 40);
  v_ref text := left(trim(coalesce(p_reference, '')), 200);
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_amt is null or v_amt < 1 or v_amt > 1000 then raise exception 'invalid_amount'; end if;
  if v_method = '' or length(v_ref) < 3 then raise exception 'invalid_reference'; end if;

  perform 1 from public.profiles where id = v_uid for update;           -- serialise this user's requests
  select count(*) into v_n from public.topup_requests where user_id = v_uid and status = 'pending';
  if v_n >= 3 then raise exception 'too_many_pending'; end if;

  insert into public.topup_requests(user_id, amount, method, reference)
  values (v_uid, v_amt, v_method, v_ref) returning id into v_id;
  return v_id;
end $$;

-- ---------- 8. ADMIN ACTIONS (each one checks is_admin() itself) ----------------------------------------

create or replace function public.admin_approve_topup(p_id uuid, p_amount numeric default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v_t public.topup_requests%rowtype; v_amt numeric; v_bal numeric;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_t from public.topup_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_t.status <> 'pending' then raise exception 'already_decided'; end if;
  v_amt := round(coalesce(p_amount, v_t.amount), 2);                    -- admin may credit what actually arrived
  if v_amt <= 0 or v_amt > 10000 then raise exception 'invalid_amount'; end if;
  v_bal := public._wallet_apply(v_t.user_id, v_amt, 'topup', 'Top-up via ' || v_t.method, null, v_t.id);
  update public.topup_requests set status = 'approved', credited_amount = v_amt, decided_at = now() where id = p_id;
  return v_bal;
end $$;

create or replace function public.admin_reject_topup(p_id uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.topup_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_t from public.topup_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_t.status <> 'pending' then raise exception 'already_decided'; end if;
  update public.topup_requests
     set status = 'rejected', admin_note = left(nullif(trim(coalesce(p_note, '')), ''), 300), decided_at = now()
   where id = p_id;
end $$;

-- Complete a pending manual order, or edit the delivery text of a completed one (e.g. a replacement account).
create or replace function public.admin_fulfill_order(p_order_id uuid, p_delivery text default null, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_o.status = 'cancelled' then raise exception 'order_cancelled'; end if;
  update public.orders
     set status = 'completed',
         delivery = coalesce(left(nullif(trim(coalesce(p_delivery, '')), ''), 4000), delivery),
         admin_note = coalesce(left(nullif(trim(coalesce(p_note, '')), ''), 300), admin_note),
         completed_at = coalesce(completed_at, now()),
         updated_at = now()
   where id = p_order_id;
end $$;

-- Cancel a PENDING order and refund the buyer in full.
create or replace function public.admin_cancel_order(p_order_id uuid, p_note text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype; v_bal numeric := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_o.status <> 'pending' then raise exception 'not_pending'; end if;
  if v_o.price > 0 then
    v_bal := public._wallet_apply(v_o.user_id, v_o.price, 'refund', 'Refund: ' || v_o.product_name, v_o.id);
  end if;
  update public.orders
     set status = 'cancelled', admin_note = left(nullif(trim(coalesce(p_note, '')), ''), 300), updated_at = now()
   where id = p_order_id;
  return v_bal;
end $$;

-- Add stock in bulk. The browser splits the textarea into items; each item can be multi-line.
create or replace function public.admin_add_stock(p_product_id uuid, p_items text[])
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  perform 1 from public.products where id = p_product_id;
  if not found then raise exception 'not_found'; end if;
  insert into public.inventory_stock(product_id, payload)
  select p_product_id, trim(x) from unnest(p_items) as x where length(trim(x)) > 0;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Manual credit / debit (support goodwill, corrections, testing). Never lets a balance go negative.
create or replace function public.admin_adjust_balance(p_user_id uuid, p_amount numeric, p_note text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v_amt numeric := round(p_amount, 2);
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v_amt is null or v_amt = 0 or abs(v_amt) > 10000 then raise exception 'invalid_amount'; end if;
  return public._wallet_apply(p_user_id, v_amt, 'adjustment',
                              coalesce(left(nullif(trim(coalesce(p_note, '')), ''), 200), 'Manual adjustment'));
end $$;

-- ---------- 9. FUNCTION PERMISSIONS ----------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default and Supabase also grants it to anon/authenticated, so we revoke
-- explicitly and then grant only what each function needs.

revoke all on function public._wallet_apply(uuid, numeric, text, text, uuid, uuid, text) from public, anon, authenticated;

revoke all on function public.get_catalog()                                      from public, anon, authenticated;
grant  execute on function public.get_catalog()                                  to anon, authenticated;

revoke all on function public.is_admin()                                         from public, anon, authenticated;
grant  execute on function public.is_admin()                                     to authenticated;

revoke all on function public.purchase(uuid, numeric, text, uuid)                from public, anon, authenticated;
grant  execute on function public.purchase(uuid, numeric, text, uuid)            to authenticated;

revoke all on function public.create_topup_request(numeric, text, text)          from public, anon, authenticated;
grant  execute on function public.create_topup_request(numeric, text, text)      to authenticated;

revoke all on function public.admin_approve_topup(uuid, numeric)                 from public, anon, authenticated;
grant  execute on function public.admin_approve_topup(uuid, numeric)             to authenticated;
revoke all on function public.admin_reject_topup(uuid, text)                     from public, anon, authenticated;
grant  execute on function public.admin_reject_topup(uuid, text)                 to authenticated;
revoke all on function public.admin_fulfill_order(uuid, text, text)              from public, anon, authenticated;
grant  execute on function public.admin_fulfill_order(uuid, text, text)          to authenticated;
revoke all on function public.admin_cancel_order(uuid, text)                     from public, anon, authenticated;
grant  execute on function public.admin_cancel_order(uuid, text)                 to authenticated;
revoke all on function public.admin_add_stock(uuid, text[])                      from public, anon, authenticated;
grant  execute on function public.admin_add_stock(uuid, text[])                  to authenticated;
revoke all on function public.admin_adjust_balance(uuid, numeric, text)          from public, anon, authenticated;
grant  execute on function public.admin_adjust_balance(uuid, numeric, text)      to authenticated;

-- (handle_new_user is a trigger function: it cannot be called through the API, so it needs no revoke.)

-- ---------- 10. MAKE YOURSELF ADMIN (after you have signed up on the site) ---------------------------------
--   update public.profiles set is_admin = true where email = 'you@example.com';
-- (Run it in the SQL Editor. It runs with owner rights, so RLS does not block it.)
