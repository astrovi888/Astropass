-- =====================================================================================
--  AstroVault schema v2  (RUN AFTER schema.sql. Safe to re-run.)
--  Adds: staff roles, support tickets + live chat, notifications (in-app + email outbox), verified top-ups
--  (name + transaction ID + screenshot), owner-editable payment methods, "coming soon" products,
--  staff order tools, audit log.
--
--  ROLE LADDER (higher can manage lower; nobody can change an owner):
--    customer 0 | agent 1 (support only) | admin 2 (orders, top-ups, products, users, balances)
--    coowner 3 (admin + manage staff up to admin, audit log) | owner 4 (everything + payment methods)
--  Make yourself owner once:   update public.profiles set role='owner' where email='you@example.com';
-- =====================================================================================

-- ---------- 1. ROLES ------------------------------------------------------------------------------
alter table public.profiles add column if not exists role text not null default 'customer';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('customer','agent','admin','coowner','owner'));
alter table public.profiles add column if not exists notify_email boolean not null default true;  -- staff/customer email opt-out
update public.profiles set role = 'admin' where is_admin and role = 'customer';                  -- carry over v1 admins

create or replace function public._rank(p_role text) returns int language sql immutable as $$
  select case p_role when 'agent' then 1 when 'admin' then 2 when 'coowner' then 3 when 'owner' then 4 else 0 end $$;
create or replace function public.my_rank() returns int language sql stable security definer set search_path = public as $$
  select coalesce((select public._rank(role) from public.profiles where id = auth.uid()), 0) $$;
create or replace function public.is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select public.my_rank() >= 1 $$;
-- v1 policies/RPCs call is_admin(): it now means "admin or higher", so co-owners and the owner pass automatically.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select public.my_rank() >= 2 $$;
create or replace function public.is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select public.my_rank() = 4 $$;

-- ---------- 2. PRODUCTS: "coming soon" + catalog ---------------------------------------------------
alter table public.products add column if not exists coming_soon boolean not null default false;
drop function if exists public.get_catalog();
create function public.get_catalog()
returns table (id uuid, slug text, name text, description text, category text, icon text, duration_label text,
  price numeric, retail_price numeric, fulfillment text, input_label text, terms text, sort_order int,
  coming_soon boolean, stock_left int)
language sql stable security definer set search_path = public as $$
  select p.id, p.slug, p.name, p.description, p.category, p.icon, p.duration_label, p.price, p.retail_price,
         p.fulfillment, p.input_label, p.terms, p.sort_order, p.coming_soon,
         case when p.fulfillment = 'instant'
              then (select least(count(*), 99)::int from public.inventory_stock s where s.product_id = p.id and s.status = 'available') end
  from public.products p where p.is_active order by p.sort_order, p.created_at $$;

-- ---------- 3. PAYMENT METHODS (owner-editable, so changing a wallet address needs no redeploy) ---------
create table if not exists public.payment_methods (
  id text primary key check (id ~ '^[a-z0-9_-]{2,30}$'),
  label text not null,
  kind text not null default 'manual' check (kind in ('address','link','manual')),  -- address: show+copy; link: open url; manual: text only
  details text not null default '',          -- the wallet address or URL
  instructions text not null default '',     -- what the customer should do
  coming_soon boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 100
);
alter table public.payment_methods enable row level security;
drop policy if exists pm_owner on public.payment_methods;   -- ONLY the owner edits where money goes (a hacked admin cannot redirect payments)
create policy pm_owner on public.payment_methods for all to authenticated using (public.is_owner()) with check (public.is_owner());
revoke all on public.payment_methods from anon, authenticated;
grant select, insert, update, delete on public.payment_methods to authenticated;
create or replace function public.get_payment_methods() returns setof public.payment_methods
language sql stable security definer set search_path = public as $$
  select * from public.payment_methods where is_active order by sort_order, id $$;

-- ---------- 4. NOTIFICATIONS (in-app bell + email outbox) -------------------------------------------
-- Every notification is a row. email=true rows are picked up by the Edge Function (supabase/functions/send-emails).
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, body text not null default '', link text,        -- link: 'orders' | 'wallet' | 'ticket:<id>' | 'staff:<tab>'
  email boolean not null default false, emailed_at timestamptz, read_at timestamptz,
  created_at timestamptz not null default now());
create index if not exists notif_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notif_outbox_idx on public.notifications (created_at) where email and emailed_at is null;
alter table public.notifications enable row level security;
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.notifications from anon, authenticated; grant select on public.notifications to authenticated;

create or replace function public._notify(p_user uuid, p_title text, p_body text, p_link text, p_email boolean default false)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(user_id, title, body, link, email)
  select p_user, p_title, p_body, p_link, (p_email and notify_email) from public.profiles where id = p_user $$;
-- Notify every staff member at or above p_min rank (e.g. 1 = all support, 2 = admins+). Email only if they opted in.
create or replace function public._notify_staff(p_min int, p_title text, p_body text, p_link text, p_exclude uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(user_id, title, body, link, email)
  select id, p_title, p_body, p_link, notify_email from public.profiles
  where public._rank(role) >= p_min and id is distinct from p_exclude $$;
create or replace function public.mark_notifications_read() returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null $$;
create or replace function public.set_my_notify(p_on boolean) returns void language sql security definer set search_path = public as $$
  update public.profiles set notify_email = p_on where id = auth.uid() $$;

-- ---------- 5. AUDIT LOG ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null, actor_name text,
  action text not null, target text, details jsonb not null default '{}', created_at timestamptz not null default now());
alter table public.audit_log enable row level security;
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated using (public.my_rank() >= 3);
revoke all on public.audit_log from anon, authenticated; grant select on public.audit_log to authenticated;
create or replace function public._audit(p_action text, p_target text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log(actor_id, actor_name, action, target, details)
  values (auth.uid(), (select username from public.profiles where id = auth.uid()), p_action, p_target, p_details) $$;

-- ---------- 6. SUPPORT TICKETS + LIVE CHAT ----------------------------------------------------------
-- Names are snapshotted onto rows so agents never need read access to customer profiles (privacy).
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001),
  user_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null, subject text not null, category text not null default 'other',
  order_id uuid references public.orders(id) on delete set null, order_label text,
  status text not null default 'open' check (status in ('open','pending','resolved','closed')),  -- pending = waiting for customer
  assigned_to uuid references public.profiles(id) on delete set null, assigned_name text,
  created_at timestamptz not null default now(), last_message_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists tickets_user_idx on public.tickets (user_id, last_message_at desc);
create index if not exists tickets_queue_idx on public.tickets (status, assigned_to);
create table if not exists public.ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null, sender_name text,
  kind text not null check (kind in ('user','staff','system')),
  body text not null check (length(body) between 1 and 2000), created_at timestamptz not null default now());
create index if not exists tmsg_ticket_idx on public.ticket_messages (ticket_id, id);
alter table public.tickets enable row level security; alter table public.ticket_messages enable row level security;
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated using (user_id = (select auth.uid()) or public.is_staff());
drop policy if exists tmsg_select on public.ticket_messages;
create policy tmsg_select on public.ticket_messages for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id and (t.user_id = (select auth.uid()) or public.is_staff())));
revoke all on public.tickets, public.ticket_messages from anon, authenticated;
grant select on public.tickets, public.ticket_messages to authenticated;
do $$ begin   -- live updates (Realtime respects the RLS above)
  begin alter publication supabase_realtime add table public.ticket_messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.tickets; exception when others then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when others then null; end;
end $$;

create or replace function public.create_ticket(p_subject text, p_category text, p_body text, p_order_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_name text; v_id uuid := gen_random_uuid(); v_num bigint; v_label text; v_n int;
  v_subj text := left(trim(coalesce(p_subject,'')), 120); v_body text := left(trim(coalesce(p_body,'')), 2000);
  v_cat text := case when p_category in ('order','payment','account','other') then p_category else 'other' end;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(v_subj) < 3 or length(v_body) < 1 then raise exception 'invalid_message'; end if;
  select username into v_name from public.profiles where id = v_uid for update;           -- also serialises this user
  if not found then raise exception 'no_profile'; end if;
  select count(*) into v_n from public.tickets where user_id = v_uid and status in ('open','pending');
  if v_n >= 5 then raise exception 'too_many_tickets'; end if;                            -- anti-spam
  if p_order_id is not null then
    select '#AV-' || number || ' · ' || product_name into v_label from public.orders where id = p_order_id and user_id = v_uid;
  end if;
  insert into public.tickets(id, user_id, customer_name, subject, category, order_id, order_label)
  values (v_id, v_uid, v_name, v_subj, v_cat, case when v_label is null then null else p_order_id end, v_label)
  returning number into v_num;
  insert into public.ticket_messages(ticket_id, sender_id, sender_name, kind, body) values (v_id, v_uid, v_name, 'user', v_body);
  insert into public.ticket_messages(ticket_id, kind, sender_name, body)                   -- automatic reply
  values (v_id, 'system', 'AstroVault', 'Thanks ' || v_name || ', we received your request (ticket #' || v_num || '). An agent will join this chat shortly.');
  perform public._notify(v_uid, 'We received your ticket #' || v_num, v_subj, 'ticket:' || v_id, true);
  perform public._notify_staff(1, 'New ticket #' || v_num, v_name || ': ' || v_subj, 'ticket:' || v_id);
  return v_id;
end $$;

-- An agent picks up a ticket. "for update" makes this race-safe: two agents clicking at once -> one wins, one gets already_assigned.
create or replace function public.claim_ticket(p_ticket uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); t public.tickets%rowtype; v_agent text;
begin
  if not public.is_staff() then raise exception 'forbidden'; end if;
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

create or replace function public.assign_ticket(p_ticket uuid, p_agent uuid) returns void   -- admins hand a ticket to someone
language plpgsql security definer set search_path = public as $$
declare t public.tickets%rowtype; v_name text;
begin
  if public.my_rank() < 2 then raise exception 'forbidden'; end if;
  select * into t from public.tickets where id = p_ticket for update; if not found then raise exception 'not_found'; end if;
  select username into v_name from public.profiles where id = p_agent and public._rank(role) >= 1; if v_name is null then raise exception 'not_found'; end if;
  update public.tickets set assigned_to = p_agent, assigned_name = v_name, updated_at = now() where id = p_ticket;
  insert into public.ticket_messages(ticket_id, kind, sender_name, body) values (p_ticket, 'system', 'AstroVault', 'Ticket assigned to ' || v_name || '.');
  perform public._notify(p_agent, 'Ticket #' || t.number || ' assigned to you', t.subject, 'ticket:' || p_ticket, true);
  perform public._audit('ticket.assign', t.number::text, jsonb_build_object('agent', v_name));
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
  elsif public.is_staff() then                                           -- staff writes
    if t.assigned_to is null then perform public.claim_ticket(p_ticket);
    elsif t.assigned_to <> v_uid and public.my_rank() < 2 then raise exception 'not_assigned'; end if;
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
  if t.user_id = v_uid and not public.is_staff() then
    if p_status <> 'closed' then raise exception 'forbidden'; end if;     -- customers may only close their own ticket
  elsif not public.is_staff() then raise exception 'forbidden'; end if;
  update public.tickets set status = p_status, updated_at = now(), last_message_at = now() where id = p_ticket;
  insert into public.ticket_messages(ticket_id, kind, sender_name, body)
  values (p_ticket, 'system', 'AstroVault', 'Ticket marked ' || p_status || ' by ' || v_name || '.');
  if p_status = 'resolved' and t.user_id <> v_uid then
    perform public._notify(t.user_id, 'Ticket #' || t.number || ' resolved', 'Reply in the ticket if you still need help.', 'ticket:' || p_ticket, true);
  end if;
end $$;

-- ---------- 7. VERIFIED TOP-UPS (name + transaction ID + screenshot) ---------------------------------
alter table public.topup_requests add column if not exists sender_name text;
alter table public.topup_requests add column if not exists proof_path text;
alter table public.topup_requests add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;
-- The same transaction ID can never back two live requests (stops re-using one payment for several credits).
create unique index if not exists topup_reference_key on public.topup_requests (lower(reference)) where status in ('pending','approved');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
drop policy if exists proofs_insert on storage.objects;   -- users upload only into their own folder  proofs/<uid>/file
create policy proofs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists proofs_select on storage.objects;   -- owner of the file or an admin+ can view it
create policy proofs_select on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

create or replace function public.submit_topup(p_amount numeric, p_method text, p_reference text, p_sender text, p_proof text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_n int; v_name text;
  v_amt numeric := round(p_amount, 2); v_ref text := left(trim(coalesce(p_reference,'')), 200);
  v_sender text := left(trim(coalesce(p_sender,'')), 100); v_method text := left(trim(coalesce(p_method,'')), 40);
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_amt is null or v_amt < 1 or v_amt > 1000 then raise exception 'invalid_amount'; end if;
  if v_method = '' or length(v_ref) < 4 or length(v_sender) < 2 then raise exception 'invalid_reference'; end if;
  if p_proof is null or p_proof not like v_uid::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'proofs' and name = p_proof) then raise exception 'proof_required'; end if;
  select username into v_name from public.profiles where id = v_uid for update;
  select count(*) into v_n from public.topup_requests where user_id = v_uid and status = 'pending';
  if v_n >= 3 then raise exception 'too_many_pending'; end if;
  begin
    insert into public.topup_requests(user_id, amount, method, reference, sender_name, proof_path)
    values (v_uid, v_amt, v_method, v_ref, v_sender, p_proof) returning id into v_id;
  exception when unique_violation then raise exception 'duplicate_reference'; end;
  perform public._notify(v_uid, 'Top-up received', 'We are verifying your payment of $' || v_amt || '.', 'wallet', true);
  perform public._notify_staff(2, 'Top-up to verify: $' || v_amt, v_name || ' via ' || v_method, 'staff:topups');
  return v_id;
end $$;

create or replace function public.admin_approve_topup(p_id uuid, p_amount numeric default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_t public.topup_requests%rowtype; v_amt numeric; v_bal numeric;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
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
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into v_t from public.topup_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_t.status <> 'pending' then raise exception 'already_decided'; end if;
  update public.topup_requests set status = 'rejected', admin_note = v_note, decided_at = now(), reviewed_by = auth.uid() where id = p_id;
  perform public._notify(v_t.user_id, 'Top-up could not be verified', coalesce(v_note, 'Please open a support ticket if you think this is a mistake.'), 'wallet', true);
  perform public._audit('topup.reject', p_id::text, jsonb_build_object('user', v_t.user_id, 'note', v_note));
end $$;

-- ---------- 8. CHECKOUT CORE (shared by customers and by staff placing orders for customers) ------------
create or replace function public._purchase_core(p_uid uuid, p_product uuid, p_expected numeric, p_input text,
  p_request uuid, p_charge boolean, p_staff boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_bal numeric; v_prod public.products%rowtype; v_stock public.inventory_stock%rowtype; v_old public.orders%rowtype;
  v_order uuid := gen_random_uuid(); v_status text; v_delivery text; v_num bigint; v_uname text;
  v_input text := nullif(left(trim(coalesce(p_input,'')), 200), '');
begin
  select balance, username into v_bal, v_uname from public.profiles where id = p_uid for update;   -- lock wallet
  if not found then raise exception 'no_profile'; end if;
  if p_request is not null then                                                                    -- idempotent retry
    select * into v_old from public.orders where user_id = p_uid and request_id = p_request;
    if found then return jsonb_build_object('order_id', v_old.id, 'number', v_old.number, 'status', v_old.status,
                                            'delivery', v_old.delivery, 'balance', v_bal, 'duplicate', true); end if;
  end if;
  select * into v_prod from public.products where id = p_product and is_active;
  if not found then raise exception 'product_unavailable'; end if;
  if v_prod.coming_soon and not p_staff then raise exception 'coming_soon'; end if;
  if p_expected is not null and p_expected <> v_prod.price then raise exception 'price_changed'; end if;
  if coalesce(trim(v_prod.input_label), '') <> '' and v_input is null then raise exception 'input_required'; end if;
  if p_charge and v_bal < v_prod.price then raise exception 'insufficient_funds'; end if;
  if v_prod.fulfillment = 'instant' then
    select * into v_stock from public.inventory_stock where product_id = v_prod.id and status = 'available'
     order by created_at, id limit 1 for update skip locked;
    if not found then raise exception 'out_of_stock'; end if;
    v_status := 'completed'; v_delivery := v_stock.payload;
  else v_status := 'pending'; end if;
  insert into public.orders(id, user_id, product_id, product_name, price, fulfillment, status, buyer_input, delivery, request_id,
                            admin_note, completed_at)
  values (v_order, p_uid, v_prod.id, v_prod.name, v_prod.price, v_prod.fulfillment, v_status, v_input, v_delivery, p_request,
          case when p_charge then null else 'Paid directly (placed by staff)' end, case when v_status = 'completed' then now() end)
  returning number into v_num;
  if v_prod.fulfillment = 'instant' then
    update public.inventory_stock set status = 'sold', order_id = v_order, sold_at = now() where id = v_stock.id; end if;
  if p_charge and v_prod.price > 0 then v_bal := public._wallet_apply(p_uid, -v_prod.price, 'purchase', v_prod.name, v_order); end if;
  perform public._notify(p_uid, case when v_status = 'completed' then 'Order #AV-' || v_num || ' delivered' else 'Order #AV-' || v_num || ' received' end,
                         v_prod.name, 'orders', true);
  if v_status = 'pending' then
    perform public._notify_staff(2, 'New order to fulfil #AV-' || v_num, v_prod.name || ' · ' || v_uname, 'staff:orders'); end if;
  return jsonb_build_object('order_id', v_order, 'number', v_num, 'status', v_status, 'delivery', v_delivery, 'balance', v_bal, 'duplicate', false);
end $$;

create or replace function public.purchase(p_product_id uuid, p_expected_price numeric default null, p_input text default null, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return public._purchase_core(auth.uid(), p_product_id, p_expected_price, p_input, p_request_id, true, false);
end $$;

-- Staff places an order FOR a customer. p_charge=true takes it from their wallet; false = they paid you directly.
create or replace function public.admin_place_order(p_user_id uuid, p_product_id uuid, p_input text default null, p_charge boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  r := public._purchase_core(p_user_id, p_product_id, null, p_input, null, p_charge, true);
  perform public._audit('order.place', r->>'number', jsonb_build_object('user', p_user_id, 'charged', p_charge));
  return r;
end $$;

-- ---------- 9. ORDER WORKFLOW: pending -> processing -> completed | cancelled(refund) ----------------------
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending','processing','completed','cancelled'));
alter table public.orders add column if not exists number bigint generated always as identity (start with 1001);   -- shown as #AV-1001

create or replace function public.admin_set_order(p_order_id uuid, p_status text, p_delivery text default null, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; v_note text := left(nullif(trim(coalesce(p_note,'')), ''), 300);
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
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
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into o from public.orders where id = p_order_id for update; if not found then raise exception 'not_found'; end if;
  if o.status not in ('pending','processing') then raise exception 'not_pending'; end if;
  if o.price > 0 and coalesce(o.admin_note, '') <> 'Paid directly (placed by staff)' then
    v_bal := public._wallet_apply(o.user_id, o.price, 'refund', 'Refund: ' || o.product_name, o.id); end if;
  update public.orders set status = 'cancelled', admin_note = coalesce(v_note, admin_note), updated_at = now() where id = p_order_id;
  perform public._notify(o.user_id, 'Order #AV-' || o.number || ' cancelled', 'Refunded to your wallet where applicable.', 'orders', true);
  perform public._audit('order.cancel', o.number::text, jsonb_build_object('refund', o.price));
  return v_bal;
end $$;

create or replace function public.admin_adjust_balance(p_user_id uuid, p_amount numeric, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare v_amt numeric := round(p_amount, 2); v_bal numeric; v_note text := coalesce(left(nullif(trim(coalesce(p_note,'')), ''), 200), 'Manual adjustment');
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if v_amt is null or v_amt = 0 or abs(v_amt) > 10000 then raise exception 'invalid_amount'; end if;
  v_bal := public._wallet_apply(p_user_id, v_amt, 'adjustment', v_note);
  perform public._notify(p_user_id, 'Wallet updated: ' || case when v_amt > 0 then '+' else '' end || '$' || v_amt, v_note, 'wallet', true);
  perform public._audit('balance.adjust', p_user_id::text, jsonb_build_object('amount', v_amt, 'note', v_note));
  return v_bal;
end $$;

-- ---------- 10. STAFF MANAGEMENT (co-owner and owner only) --------------------------------------------
-- Rule: you can only change people BELOW your rank, and only to roles BELOW your rank. 'owner' cannot be granted or changed.
create or replace function public.set_user_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare v_my int := public.my_rank(); v_cur text;
begin
  if v_my < 3 then raise exception 'forbidden'; end if;
  if p_role not in ('customer','agent','admin','coowner') then raise exception 'invalid_role'; end if;
  if p_user_id = auth.uid() then raise exception 'forbidden'; end if;
  select role into v_cur from public.profiles where id = p_user_id for update; if not found then raise exception 'not_found'; end if;
  if public._rank(v_cur) >= v_my or public._rank(p_role) >= v_my then raise exception 'forbidden'; end if;
  update public.profiles set role = p_role where id = p_user_id;
  perform public._notify(p_user_id, 'Your role changed to ' || p_role, '', 'account', true);
  perform public._audit('role.set', p_user_id::text, jsonb_build_object('from', v_cur, 'to', p_role));
end $$;

-- ---------- 11. FUNCTION PERMISSIONS -----------------------------------------------------------------
-- Public API: callable by logged-in users (each function checks its own permissions inside).
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array[
    'purchase','submit_topup','create_ticket','claim_ticket','assign_ticket','ticket_reply','set_ticket_status','mark_notifications_read',
    'set_my_notify','get_payment_methods','admin_approve_topup','admin_reject_topup','admin_place_order','admin_set_order',
    'admin_cancel_order','admin_adjust_balance','set_user_role','my_rank','is_staff','is_owner','is_admin'])
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
  -- Internal helpers: nobody but other database functions may call these.
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
           and p.proname = any (array['_notify','_notify_staff','_audit','_purchase_core'])
  loop execute format('revoke all on function %s from public, anon, authenticated', r.sig); end loop;
end $$;
revoke all on function public.get_catalog() from public, anon, authenticated;
grant execute on function public.get_catalog() to anon, authenticated;
-- The old v1 top-up function skipped proof checks; remove it from the browser's reach.
revoke all on function public.create_topup_request(numeric, text, text) from public, anon, authenticated;
