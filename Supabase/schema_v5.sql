-- =====================================================================================
--  AstroVault schema v5  (RUN AFTER schema.sql, schema_v2.sql, schema_v3.sql. Safe to re-run.)
--  Adds:
--   1. GRANULAR PERMISSIONS: each role has default permissions; owner/co-owner can grant or revoke single ones per person.
--   2. PAYMENT METHOD TYPES: binance_pay | crypto | bank | link | manual (+ QR image, auto-verify flag).
--   3. ASTROCOINS: cashback loyalty coins earned on completed orders, redeemable into wallet balance.
--   4. AUTOMATIC DEPOSITS: unique-amount invoices matched on-chain by the watch-deposits Edge Function (no keys on server).
--   5. Ticket oversight: anyone with the 'tickets' permission can open every ticket and read every chat (owner has all).
--
--  PERMISSIONS (owner always has all):
--    tickets (read/answer all tickets) | assign_tickets | orders (process/cancel) | place_orders (order for a customer)
--    topups (verify payments) | products (add/edit/delete + stock) | users_view | wallet (add/remove money)
--    coins (grant coins, set rates) | payments (edit payment methods) | staff_manage (roles + permissions) | audit (audit log)
-- =====================================================================================

-- ---------- 1. PERMISSIONS ------------------------------------------------------------------------
alter table public.profiles add column if not exists perm_grants  text[] not null default '{}';   -- extra permissions given to this person
alter table public.profiles add column if not exists perm_revokes text[] not null default '{}';   -- role defaults taken away from this person

create or replace function public._all_perms() returns text[] language sql immutable as $$
  select array['tickets','assign_tickets','orders','place_orders','topups','products','users_view','wallet','coins','payments','staff_manage','audit'] $$;
create or replace function public._role_perms(p_role text) returns text[] language sql immutable as $$
  select case p_role
    when 'agent'   then array['tickets']
    when 'admin'   then array['tickets','assign_tickets','orders','place_orders','topups','products','users_view','wallet','coins']
    when 'coowner' then array['tickets','assign_tickets','orders','place_orders','topups','products','users_view','wallet','coins','staff_manage','audit']
    when 'owner'   then public._all_perms()
    else array[]::text[] end $$;
-- Effective permission = (role default OR granted) AND NOT revoked. Owner is always true.
create or replace function public.has_perm(p text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case when pr.role = 'owner' then true
                  else ((p = any (public._role_perms(pr.role)) or p = any (pr.perm_grants)) and not (p = any (pr.perm_revokes))) end
                   from public.profiles pr where pr.id = auth.uid()), false) $$;
create or replace function public.my_perms() returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array(select x from unnest(public._all_perms()) x where public.has_perm(x)), array[]::text[]) $$;
create or replace function public._need(p text) returns void language plpgsql stable security definer set search_path = public as $$
begin if not public.has_perm(p) then raise exception 'forbidden'; end if; end $$;

-- Owner/co-owner edit one person's permissions. Limits: staff below you only; you can only hand out permissions you hold.
create or replace function public.set_user_perms(p_user_id uuid, p_grants text[], p_revokes text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_my int := public.my_rank(); v_cur text; v_ok boolean;
begin
  perform public._need('staff_manage');
  if p_user_id = auth.uid() then raise exception 'forbidden'; end if;
  select role into v_cur from public.profiles where id = p_user_id for update;
  if not found then raise exception 'not_found'; end if;
  if public._rank(v_cur) >= v_my or public._rank(v_cur) < 1 then raise exception 'forbidden'; end if;
  if exists (select 1 from unnest(coalesce(p_grants, '{}') || coalesce(p_revokes, '{}')) x where not (x = any (public._all_perms()))) then
    raise exception 'invalid_permission'; end if;
  select coalesce(bool_and(public.has_perm(g)), true) into v_ok from unnest(coalesce(p_grants, '{}')) g   -- only NEWLY added grants are checked
   where g <> all (coalesce((select perm_grants from public.profiles where id = p_user_id), '{}'));
  if not v_ok then raise exception 'forbidden'; end if;
  update public.profiles set perm_grants = coalesce(p_grants, '{}'), perm_revokes = coalesce(p_revokes, '{}') where id = p_user_id;
  perform public._notify(p_user_id, 'Your permissions were updated', 'Refresh the app to see your new tools.', 'account', true);
  perform public._audit('perms.set', p_user_id::text, jsonb_build_object('grants', p_grants, 'revokes', p_revokes));
end $$;

-- ---------- 2. POLICIES NOW USE PERMISSIONS (instead of fixed ranks) ------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()) or public.has_perm('users_view'));
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders for select to authenticated using (user_id = (select auth.uid()) or public.has_perm('orders'));
drop policy if exists wallet_tx_select on public.wallet_transactions;
create policy wallet_tx_select on public.wallet_transactions for select to authenticated using (user_id = (select auth.uid()) or public.has_perm('users_view'));
drop policy if exists topups_select on public.topup_requests;
create policy topups_select on public.topup_requests for select to authenticated using (user_id = (select auth.uid()) or public.has_perm('topups'));
drop policy if exists products_admin on public.products;
create policy products_admin on public.products for all to authenticated using (public.has_perm('products')) with check (public.has_perm('products'));
drop policy if exists stock_select on public.inventory_stock;
create policy stock_select on public.inventory_stock for select to authenticated using (public.has_perm('products'));
drop policy if exists stock_insert on public.inventory_stock;
create policy stock_insert on public.inventory_stock for insert to authenticated with check (public.has_perm('products'));
drop policy if exists stock_update on public.inventory_stock;
create policy stock_update on public.inventory_stock for update to authenticated using (public.has_perm('products')) with check (public.has_perm('products'));
drop policy if exists stock_delete on public.inventory_stock;
create policy stock_delete on public.inventory_stock for delete to authenticated using (public.has_perm('products') and status = 'available');
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated using (user_id = (select auth.uid()) or public.has_perm('tickets'));
drop policy if exists tmsg_select on public.ticket_messages;
create policy tmsg_select on public.ticket_messages for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id and (t.user_id = (select auth.uid()) or public.has_perm('tickets'))));
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated using (public.has_perm('audit'));
drop policy if exists proofs_select on storage.objects;
create policy proofs_select on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.has_perm('topups')));

-- ---------- 3. PAYMENT METHODS: simple types ---------------------------------------------------------------
--   binance_pay: details = Pay ID,  meta.name = account name
--   crypto:      details = address, meta.network = TRC20 | BEP20, meta.coin = USDT
--   bank:        details = IBAN/RIB/account no., meta.bank, meta.holder
--   link:        details = https link         manual: instructions only
alter table public.payment_methods drop constraint if exists payment_methods_kind_check;
alter table public.payment_methods add constraint payment_methods_kind_check check (kind in ('address','link','manual','binance_pay','crypto','bank'));
alter table public.payment_methods add column if not exists meta jsonb not null default '{}';
alter table public.payment_methods add column if not exists image_url text;            -- QR picture (assets/xxx.png or https link)
alter table public.payment_methods add column if not exists auto_verify boolean not null default false;   -- paid invoices are credited automatically
drop policy if exists pm_owner on public.payment_methods;
drop policy if exists pm_perm on public.payment_methods;
create policy pm_perm on public.payment_methods for all to authenticated using (public.has_perm('payments')) with check (public.has_perm('payments'));
create or replace function public.get_payment_methods() returns setof public.payment_methods
language sql stable security definer set search_path = public as $$
  select * from public.payment_methods where is_active order by sort_order, id $$;

-- ---------- 4. ASTROCOINS (cashback loyalty) ---------------------------------------------------------------
alter table public.profiles add column if not exists coins int not null default 0 check (coins >= 0);
create table if not exists public.coin_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null check (amount <> 0), kind text not null check (kind in ('earn','redeem','grant')),
  note text, order_id uuid, balance_after int not null, created_at timestamptz not null default now());
create index if not exists coin_tx_user_idx on public.coin_transactions (user_id, created_at desc);
alter table public.coin_transactions enable row level security;
drop policy if exists coin_tx_select on public.coin_transactions;
create policy coin_tx_select on public.coin_transactions for select to authenticated using (user_id = (select auth.uid()) or public.has_perm('users_view'));
revoke all on public.coin_transactions from anon, authenticated; grant select on public.coin_transactions to authenticated;

create table if not exists public.settings (key text primary key, value text not null);   -- coin_earn = coins per $1 spent, coin_redeem = coins per $1 of credit
alter table public.settings enable row level security;
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (true);
revoke all on public.settings from anon, authenticated; grant select on public.settings to authenticated;
insert into public.settings(key, value) values ('coin_earn', '2'), ('coin_redeem', '100') on conflict (key) do nothing;

create or replace function public.admin_set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need('coins');
  if p_key not in ('coin_earn','coin_redeem') then raise exception 'invalid_setting'; end if;
  if p_value !~ '^[0-9]{1,5}$' or p_value::int < 1 then raise exception 'invalid_amount'; end if;
  insert into public.settings(key, value) values (p_key, p_value) on conflict (key) do update set value = excluded.value;
  perform public._audit('setting.set', p_key, jsonb_build_object('value', p_value));
end $$;

-- Earn coins ONCE when an order becomes completed (instant orders at purchase, manual orders when staff completes them).
-- Orders placed by staff as "paid directly" earn nothing. Cancelled orders never completed, so nothing to claw back.
create or replace function public._orders_coins() returns trigger language plpgsql security definer set search_path = public as $$
declare v_rate int; v_c int; v_left int;
begin
  if tg_op = 'UPDATE' then                                   -- (never touch OLD on INSERT: it is unassigned there)
    if old.status = 'completed' then return new; end if;     -- already earned before
  end if;
  if new.status = 'completed' and coalesce(new.admin_note, '') <> 'Paid directly (placed by staff)' then
    select coalesce((select value::int from public.settings where key = 'coin_earn'), 2) into v_rate;
    v_c := floor(new.price * v_rate);
    if v_c > 0 then
      update public.profiles set coins = coins + v_c where id = new.user_id returning coins into v_left;
      insert into public.coin_transactions(user_id, amount, kind, note, order_id, balance_after)
      values (new.user_id, v_c, 'earn', 'Order #AV-' || new.number, new.id, v_left);
      perform public._notify(new.user_id, 'You earned ' || v_c || ' AstroCoins', 'Order #AV-' || new.number, 'wallet', false);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_coins on public.orders;
create trigger orders_coins after insert or update of status on public.orders for each row execute function public._orders_coins();

create or replace function public.redeem_coins(p_coins int) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_rate int; v_have int; v_left int; v_bal numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select coalesce((select value::int from public.settings where key = 'coin_redeem'), 100) into v_rate;
  if p_coins is null or p_coins < v_rate or p_coins % v_rate <> 0 then raise exception 'invalid_amount'; end if;
  select coins into v_have from public.profiles where id = v_uid for update;
  if not found then raise exception 'no_profile'; end if;
  if v_have < p_coins then raise exception 'insufficient_coins'; end if;
  update public.profiles set coins = coins - p_coins where id = v_uid returning coins into v_left;
  insert into public.coin_transactions(user_id, amount, kind, note, balance_after) values (v_uid, -p_coins, 'redeem', 'Redeemed to wallet', v_left);
  v_bal := public._wallet_apply(v_uid, p_coins::numeric / v_rate, 'adjustment', 'Redeemed ' || p_coins || ' AstroCoins');
  return v_bal;
end $$;

create or replace function public.admin_grant_coins(p_user_id uuid, p_coins int, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_left int;
begin
  perform public._need('coins');
  if p_coins is null or p_coins = 0 or abs(p_coins) > 100000 then raise exception 'invalid_amount'; end if;
  begin
    update public.profiles set coins = coins + p_coins where id = p_user_id returning coins into v_left;
  exception when check_violation then raise exception 'insufficient_coins'; end;
  if not found then raise exception 'not_found'; end if;
  insert into public.coin_transactions(user_id, amount, kind, note, balance_after)
  values (p_user_id, p_coins, 'grant', coalesce(left(nullif(trim(coalesce(p_note, '')), ''), 200), 'Staff adjustment'), v_left);
  perform public._notify(p_user_id, 'AstroCoins ' || case when p_coins > 0 then '+' else '' end || p_coins, coalesce(p_note, ''), 'wallet', false);
  perform public._audit('coins.grant', p_user_id::text, jsonb_build_object('coins', p_coins));
  return v_left;
end $$;

-- ---------- 5. AUTOMATIC DEPOSITS (unique-amount invoices) ---------------------------------------------------
-- Customer asks to deposit $10 -> we reserve an exact amount like 10.037 USDT for 30 minutes. The watch-deposits Edge Function
-- sees an incoming transfer of exactly that amount on-chain and credits the wallet. No private keys are ever on the server.
create table if not exists public.deposit_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  method_id text not null, network text not null, address text not null,          -- network: TRC20 | BEP20 | binance_pay
  amount numeric(12,3) not null check (amount > 0),                                  -- exact amount to send (also what gets credited)
  status text not null default 'pending' check (status in ('pending','paid','expired')),
  tx_hash text, created_at timestamptz not null default now(), expires_at timestamptz not null, paid_at timestamptz);
create unique index if not exists deposit_tx_key on public.deposit_invoices (tx_hash) where tx_hash is not null;
create unique index if not exists deposit_open_amount on public.deposit_invoices (network, amount) where status = 'pending';  -- no two open invoices share an amount
create index if not exists deposit_user_idx on public.deposit_invoices (user_id, created_at desc);
alter table public.deposit_invoices enable row level security;
drop policy if exists deposit_select on public.deposit_invoices;
create policy deposit_select on public.deposit_invoices for select to authenticated using (user_id = (select auth.uid()) or public.has_perm('topups'));
revoke all on public.deposit_invoices from anon, authenticated; grant select on public.deposit_invoices to authenticated;

create table if not exists public.chain_cursors (network text primary key, last_block bigint not null);   -- BSC scan position (service role only)
alter table public.chain_cursors enable row level security;
revoke all on public.chain_cursors from anon, authenticated;

create or replace function public.create_deposit_invoice(p_method text, p_amount numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); m public.payment_methods%rowtype; v_base numeric := round(p_amount, 2); v_amt numeric;
  v_id uuid; v_net text; v_try int := 0; v_n int; v_exp timestamptz := now() + interval '30 minutes';
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_base is null or v_base < 5 or v_base > 1000 then raise exception 'invalid_amount'; end if;
  select * into m from public.payment_methods where id = p_method and is_active and auto_verify and not coming_soon;
  if not found then raise exception 'method_unavailable'; end if;
  v_net := coalesce(nullif(m.meta->>'network', ''), m.kind);
  update public.deposit_invoices set status = 'expired' where status = 'pending' and expires_at < now();
  perform 1 from public.profiles where id = v_uid for update;
  select count(*) into v_n from public.deposit_invoices where user_id = v_uid and status = 'pending';
  if v_n >= 3 then raise exception 'too_many_pending'; end if;
  loop
    v_try := v_try + 1;
    v_amt := v_base + (1 + floor(random() * 99))::int / 1000.0;                    -- 0.001 .. 0.099 tag makes the amount unique
    begin
      insert into public.deposit_invoices(user_id, method_id, network, address, amount, expires_at)
      values (v_uid, m.id, v_net, m.details, v_amt, v_exp) returning id into v_id;
      exit;
    exception when unique_violation then
      if v_try >= 25 then raise exception 'busy_try_again'; end if;
    end;
  end loop;
  return jsonb_build_object('id', v_id, 'amount', v_amt, 'address', m.details, 'network', v_net, 'expires_at', v_exp);
end $$;

-- Called ONLY by the Edge Function (service role). Idempotent: the same tx can never credit twice.
create or replace function public.credit_deposit(p_invoice uuid, p_tx text, p_amount numeric) returns boolean
language plpgsql security definer set search_path = public as $$
declare v public.deposit_invoices%rowtype; v_bal numeric;
begin
  select * into v from public.deposit_invoices where id = p_invoice for update;
  if not found or v.status <> 'pending' or v.amount <> p_amount then return false; end if;
  begin
    v_bal := public._wallet_apply(v.user_id, v.amount, 'topup', 'USDT deposit (' || v.network || ')', null, null, 'dep:' || p_tx);
  exception when unique_violation then return false; end;
  update public.deposit_invoices set status = 'paid', tx_hash = p_tx, paid_at = now() where id = p_invoice;
  perform public._notify(v.user_id, 'Deposit confirmed: $' || v.amount, 'Your wallet balance is now $' || v_bal || '.', 'wallet', true);
  return true;
end $$;
create or replace function public.expire_deposits() returns void language sql security definer set search_path = public as $$
  update public.deposit_invoices set status = 'expired' where status = 'pending' and expires_at < now() $$;

-- ---------- 6. FUNCTIONS THAT NEEDED PERMISSION CHECKS (regenerated from earlier files, permission-based) ----
create or replace function public.admin_approve_topup(p_id uuid, p_amount numeric default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_t public.topup_requests%rowtype; v_amt numeric; v_bal numeric;
begin
  perform public._need('topups');
  select * into v_t from public.topup_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_t.status <> 'pending' then raise exception 'already_decided'; end if;
  v_amt := round(coalesce(p_amount, v_t.amount), 2);                       -- credit what actually arrived
  if v_amt <= 0 or v_amt > 10000 then raise exception 'invalid_amount'; end if;
  v_bal := public._wallet_apply(v_t.user_id, v_amt, 'topup', 'Top-up via ' || v_t.method, null, v_t.id);
  update public.topup_requests set status = 'approved', credited_amount = v_amt, decided_at = now(), reviewed_by = auth.uid() where id = p_id;
  perform public._notify(v_t.user_id, 'Payment verified: $' || v_amt || ' added', 'Your wallet balance is now $' || v_bal || '.', 'wallet', true);
  perform public._audit('topup.approve', p_id::text, jsonb_build_object('user', v_t.user_id, 'amount', v_amt));
  return v_bal;
end $$;

create or replace function public.admin_reject_topup(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_t public.topup_requests%rowtype; v_note text := left(nullif(trim(coalesce(p_note,'')), ''), 300);
begin
  perform public._need('topups');
  select * into v_t from public.topup_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_t.status <> 'pending' then raise exception 'already_decided'; end if;
  update public.topup_requests set status = 'rejected', admin_note = v_note, decided_at = now(), reviewed_by = auth.uid() where id = p_id;
  perform public._notify(v_t.user_id, 'Top-up could not be verified', coalesce(v_note, 'Please open a support ticket if you think this is a mistake.'), 'wallet', true);
  perform public._audit('topup.reject', p_id::text, jsonb_build_object('user', v_t.user_id, 'note', v_note));
end $$;

create or replace function public.admin_set_order(p_order_id uuid, p_status text, p_delivery text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; v_note text := left(nullif(trim(coalesce(p_note,'')), ''), 300);
begin
  perform public._need('orders');
  if p_status not in ('processing','completed') then raise exception 'invalid_status'; end if;
  select * into o from public.orders where id = p_order_id for update; if not found then raise exception 'not_found'; end if;
  if o.status = 'cancelled' then raise exception 'order_cancelled'; end if;
  update public.orders set status = p_status,
     delivery = coalesce(left(nullif(trim(coalesce(p_delivery,'')), ''), 4000), delivery), admin_note = coalesce(v_note, admin_note),
     completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else completed_at end, updated_at = now()
   where id = p_order_id;
  if o.status is distinct from p_status then
    perform public._notify(o.user_id, 'Order #AV-' || o.number || case p_status when 'completed' then ' is ready' else ' is being processed' end,
                           o.product_name, 'orders', true); end if;
  perform public._audit('order.' || p_status, o.number::text, '{}');
end $$;

create or replace function public.admin_cancel_order(p_order_id uuid, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; v_bal numeric := 0; v_note text := left(nullif(trim(coalesce(p_note,'')), ''), 300);
begin
  perform public._need('orders');
  select * into o from public.orders where id = p_order_id for update; if not found then raise exception 'not_found'; end if;
  if o.status not in ('pending','processing') then raise exception 'not_pending'; end if;
  if o.price > 0 and coalesce(o.admin_note, '') <> 'Paid directly (placed by staff)' then
    v_bal := public._wallet_apply(o.user_id, o.price, 'refund', 'Refund: ' || o.product_name, o.id); end if;
  update public.orders set status = 'cancelled', admin_note = coalesce(v_note, admin_note), updated_at = now() where id = p_order_id;
  perform public._notify(o.user_id, 'Order #AV-' || o.number || ' cancelled', 'Refunded to your wallet where applicable.', 'orders', true);
  perform public._audit('order.cancel', o.number::text, jsonb_build_object('refund', o.price));
  return v_bal;
end $$;

create or replace function public.admin_place_order(p_user_id uuid, p_product_id uuid, p_input text default null, p_charge boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform public._need('place_orders');
  r := public._purchase_core(p_user_id, p_product_id, null, p_input, null, p_charge, true);
  perform public._audit('order.place', r->>'number', jsonb_build_object('user', p_user_id, 'charged', p_charge));
  return r;
end $$;

create or replace function public.admin_adjust_balance(p_user_id uuid, p_amount numeric, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_amt numeric := round(p_amount, 2); v_bal numeric; v_note text := coalesce(left(nullif(trim(coalesce(p_note,'')), ''), 200), 'Manual adjustment');
begin
  perform public._need('wallet');
  if v_amt is null or v_amt = 0 or abs(v_amt) > 10000 then raise exception 'invalid_amount'; end if;
  v_bal := public._wallet_apply(p_user_id, v_amt, 'adjustment', v_note);
  perform public._notify(p_user_id, 'Wallet updated: ' || case when v_amt > 0 then '+' else '' end || '$' || v_amt, v_note, 'wallet', true);
  perform public._audit('balance.adjust', p_user_id::text, jsonb_build_object('amount', v_amt, 'note', v_note));
  return v_bal;
end $$;

create or replace function public.admin_add_stock(p_product_id uuid, p_items text[])
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform public._need('products');
  perform 1 from public.products where id = p_product_id;
  if not found then raise exception 'not_found'; end if;
  insert into public.inventory_stock(product_id, payload)
  select p_product_id, trim(x) from unnest(p_items) as x where length(trim(x)) > 0;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.admin_delete_product(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  perform public._need('products');
  select name into v_name from public.products where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from public.orders where product_id = p_id)
     or exists (select 1 from public.inventory_stock where product_id = p_id and status = 'sold') then
    raise exception 'has_history';
  end if;
  delete from public.inventory_stock where product_id = p_id;
  delete from public.products where id = p_id;
  perform public._audit('product.delete', p_id::text, jsonb_build_object('name', v_name));
end $$;

create or replace function public.assign_ticket(p_ticket uuid, p_agent uuid) returns void   -- admins hand a ticket to someone
language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype; v_name text;
begin
  perform public._need('assign_tickets');
  select * into t from public.tickets where id = p_ticket for update; if not found then raise exception 'not_found'; end if;
  select username into v_name from public.profiles where id = p_agent and public._rank(role) >= 1; if v_name is null then raise exception 'not_found'; end if;
  update public.tickets set assigned_to = p_agent, assigned_name = v_name, updated_at = now() where id = p_ticket;
  insert into public.ticket_messages(ticket_id, kind, sender_name, body) values (p_ticket, 'system', 'AstroVault', 'Ticket assigned to ' || v_name || '.');
  perform public._notify(p_agent, 'Ticket #' || t.number || ' assigned to you', t.subject, 'ticket:' || p_ticket, true);
  perform public._audit('ticket.assign', t.number::text, jsonb_build_object('agent', v_name));
end $$;

create or replace function public.set_user_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare v_my int := public.my_rank(); v_cur text;
begin
  perform public._need('staff_manage');
  if p_role not in ('customer','agent','admin','coowner') then raise exception 'invalid_role'; end if;
  if p_user_id = auth.uid() then raise exception 'forbidden'; end if;
  select role into v_cur from public.profiles where id = p_user_id for update; if not found then raise exception 'not_found'; end if;
  if public._rank(v_cur) >= v_my or public._rank(p_role) >= v_my then raise exception 'forbidden'; end if;
  update public.profiles set role = p_role where id = p_user_id;
  perform public._notify(p_user_id, 'Your role changed to ' || p_role, '', 'account', true);
  perform public._audit('role.set', p_user_id::text, jsonb_build_object('from', v_cur, 'to', p_role));
end $$;

create or replace function public.claim_ticket(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t public.tickets%rowtype; v_agent text;
begin
  perform public._need('tickets');
  select * into t from public.tickets where id = p_ticket for update;
  if not found then raise exception 'not_found'; end if;
  if t.status = 'closed' then raise exception 'ticket_closed'; end if;
  if t.assigned_to = v_uid then return; end if;
  if t.assigned_to is not null then raise exception 'already_assigned'; end if;
  select username into v_agent from public.profiles where id = v_uid;
  update public.tickets set assigned_to = v_uid, assigned_name = v_agent, status = 'open', updated_at = now(), last_message_at = now() where id = p_ticket;
  insert into public.ticket_messages(ticket_id, sender_id, sender_name, kind, body)       -- automatic hello that names the agent
  values (p_ticket, v_uid, v_agent, 'staff', 'Hello ' || t.customer_name || ', my name is ' || v_agent || ' and I''ll be helping you today. Let me look into this for you.');
  perform public._notify(t.user_id, v_agent || ' is helping you (ticket #' || t.number || ')', 'Open your ticket to chat.', 'ticket:' || p_ticket, true);
end $$;

create or replace function public.ticket_reply(p_ticket uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t public.tickets%rowtype; v_name text; v_body text := left(trim(coalesce(p_body,'')), 2000);
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_body = '' then raise exception 'invalid_message'; end if;
  select * into t from public.tickets where id = p_ticket for update; if not found then raise exception 'not_found'; end if;
  if t.status = 'closed' then raise exception 'ticket_closed'; end if;
  select username into v_name from public.profiles where id = v_uid;
  if t.user_id = v_uid then                                              -- customer writes
    insert into public.ticket_messages(ticket_id, sender_id, sender_name, kind, body) values (p_ticket, v_uid, v_name, 'user', v_body);
    update public.tickets set status = 'open', last_message_at = now(), updated_at = now() where id = p_ticket;
    if t.assigned_to is not null then perform public._notify(t.assigned_to, 'Reply on ticket #' || t.number, left(v_body, 120), 'ticket:' || p_ticket, true);
    else perform public._notify_staff(1, 'Reply on unassigned ticket #' || t.number, left(v_body, 120), 'ticket:' || p_ticket); end if;
  elsif public.has_perm('tickets') then                                           -- staff writes
    if t.assigned_to is null then perform public.claim_ticket(p_ticket);
    elsif t.assigned_to <> v_uid and not public.has_perm('assign_tickets') then raise exception 'not_assigned'; end if;
    insert into public.ticket_messages(ticket_id, sender_id, sender_name, kind, body) values (p_ticket, v_uid, v_name, 'staff', v_body);
    update public.tickets set status = 'pending', last_message_at = now(), updated_at = now() where id = p_ticket;
    perform public._notify(t.user_id, 'New reply on ticket #' || t.number, left(v_body, 120), 'ticket:' || p_ticket, true);
  else raise exception 'forbidden'; end if;
end $$;

create or replace function public.set_ticket_status(p_ticket uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t public.tickets%rowtype; v_name text;
begin
  if p_status not in ('open','resolved','closed') then raise exception 'invalid_status'; end if;
  select * into t from public.tickets where id = p_ticket for update; if not found then raise exception 'not_found'; end if;
  select username into v_name from public.profiles where id = v_uid;
  if t.user_id = v_uid and not public.has_perm('tickets') then
    if p_status <> 'closed' then raise exception 'forbidden'; end if;     -- customers may only close their own ticket
  elsif not public.has_perm('tickets') then raise exception 'forbidden'; end if;
  update public.tickets set status = p_status, updated_at = now(), last_message_at = now() where id = p_ticket;
  insert into public.ticket_messages(ticket_id, kind, sender_name, body)
  values (p_ticket, 'system', 'AstroVault', 'Ticket marked ' || p_status || ' by ' || v_name || '.');
  if p_status = 'resolved' and t.user_id <> v_uid then
    perform public._notify(t.user_id, 'Ticket #' || t.number || ' resolved', 'Reply in the ticket if you still need help.', 'ticket:' || p_ticket, true);
  end if;
end $$;

-- ---------- 7. FUNCTION PERMISSIONS ------------------------------------------------------------------------
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array[
    'has_perm','my_perms','set_user_perms','admin_set_setting','redeem_coins','admin_grant_coins','create_deposit_invoice',
    'admin_approve_topup','admin_reject_topup','admin_set_order','admin_cancel_order','admin_place_order','admin_adjust_balance',
    'admin_add_stock','admin_delete_product','assign_ticket','set_user_role','claim_ticket','ticket_reply','set_ticket_status'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname = any (array['_need','_orders_coins','credit_deposit','expire_deposits'])
  loop execute format('revoke all on function %s from public, anon, authenticated', r.sig); end loop;
end $$;
grant execute on function public.credit_deposit(uuid, text, numeric) to service_role;     -- only the Edge Function may credit deposits
grant execute on function public.expire_deposits() to service_role;
revoke all on function public.admin_fulfill_order(uuid, text, text) from public, anon, authenticated;   -- old v1 function, replaced by admin_set_order
