-- =====================================================================================
--  AstroVault admin SQL helpers.  Run these in Supabase -> SQL Editor.
--  The website has a built-in Admin screen for daily use; these are for setup, bulk work and reporting.
--  The SQL Editor runs as the database owner, so these bypass RLS on purpose. Edit the <placeholders>.
-- =====================================================================================

-- 1) Make yourself admin (sign up on the site first, then run this once). Shows an Admin tab on the site.
update public.profiles set is_admin = true where email = 'you@example.com';
-- Remove admin rights:
-- update public.profiles set is_admin = false where email = 'someone@example.com';

-- 2) Orders waiting for you (oldest first)
select o.created_at, p.username, p.email, o.product_name, o.price, o.buyer_input, o.id as order_id
from public.orders o join public.profiles p on p.id = o.user_id
where o.status = 'pending'
order by o.created_at;

-- 3) Top-ups waiting for you
select t.created_at, p.username, t.amount, t.method, t.reference, t.id as topup_id
from public.topup_requests t join public.profiles p on p.id = t.user_id
where t.status = 'pending'
order by t.created_at;

-- 4) Add stock for a product. One row per account / code / link. Use E'line1\nline2' for multi-line items.
insert into public.inventory_stock (product_id, payload)
select id, unnest(array[
  'email1@example.com:password1',
  'email2@example.com:password2'
]) from public.products where slug = 'netflix-premium-profile-1m';

-- 5) Stock left per instant product
select p.name, count(*) filter (where s.status = 'available') as available, count(*) filter (where s.status = 'sold') as sold
from public.products p left join public.inventory_stock s on s.product_id = p.id
where p.fulfillment = 'instant'
group by p.name order by available;

-- 6) Credit or debit a wallet by hand (goes through the ledger like everything else; use the Admin screen if you can)
-- NOTE: admin_adjust_balance() checks auth.uid(), which is empty in the SQL Editor, so it refuses to run here.
-- From the SQL Editor use the internal owner-only function instead (uncomment and run):
-- select public._wallet_apply('<user-uuid>'::uuid, 5.00, 'adjustment', 'Goodwill credit');

-- 7) Money check: does every balance equal the sum of its ledger?  (Should return zero rows.)
select p.username, p.balance, coalesce(sum(t.amount), 0) as ledger_sum
from public.profiles p left join public.wallet_transactions t on t.user_id = p.id
group by p.id, p.username, p.balance
having p.balance <> coalesce(sum(t.amount), 0);

-- 8) Revenue by product (completed + pending orders)
select product_name, count(*) as orders, sum(price) as revenue
from public.orders where status <> 'cancelled'
group by product_name order by revenue desc;

-- 9) Lookup a customer
select p.username, p.email, p.balance, p.created_at,
       (select count(*) from public.orders o where o.user_id = p.id) as orders
from public.profiles p where p.email ilike '%<part-of-email>%' or p.username ilike '%<part-of-username>%';
