-- =====================================================================================
--  AstroVault sample catalog. OPTIONAL: run after schema.sql.
--  Prices and descriptions are PLACEHOLDERS. Edit them in the Admin > Products screen (or here) before launch.
--  The DEMO stock lines are fake. Delete them in Admin > Products > Stock before you sell anything.
--  Safe to re-run: products are matched by slug and never overwritten; demo stock is only added to empty products.
-- =====================================================================================

insert into public.products
  (slug, name, description, category, icon, duration_label, price, retail_price, fulfillment, input_label, terms, sort_order)
values
  ('gemini-advanced-1m', 'Gemini Advanced',
   'Google''s most capable Gemini model, upgraded on your own Google account.',
   'ai', '✨', '1 month', 9.99, 19.99, 'manual', 'Your Gmail address',
   'We upgrade the Google account you give us. Keep the account active for the whole month. If we cannot upgrade it you are refunded in full.', 10),

  ('spotify-premium-1m', 'Spotify Premium',
   'Premium slot: no ads, offline listening, unlimited skips. You receive an invite to join.',
   'entertainment', '🎧', '1 month', 3.99, 11.99, 'manual', 'Your Spotify email',
   'You are invited to a plan and must accept it. Do not change the plan address. If the invite fails you are refunded in full.', 20),

  ('netflix-premium-profile-1m', 'Netflix Premium Profile',
   'Your own profile on a Premium (4K) account. Credentials are delivered instantly.',
   'entertainment', '🎬', '1 month', 4.99, 17.99, 'instant', null,
   'Use only your own profile and do not change the email or password. If the account stops working within the month we replace it.', 30),

  ('canva-pro-invite-1m', 'Canva Pro',
   'Canva Pro team invite: premium templates, Brand Kit and Magic tools. Instant invite link.',
   'productivity', '🎨', '1 month', 2.99, 14.99, 'instant', null,
   'Open the invite link while logged in to Canva. Invite links are single-use.', 40)
on conflict (slug) do nothing;

-- Demo stock for the two instant products (fake values so you can test checkout end to end).
insert into public.inventory_stock (product_id, payload)
select p.id,
       case p.slug
         when 'netflix-premium-profile-1m' then E'DEMO ONLY\nEmail: demo' || g || E'@example.com\nPassword: not-a-real-password\nProfile: Guest ' || g
         else 'DEMO ONLY https://example.com/invite/demo-' || g
       end
from public.products p
cross join generate_series(1, 3) as g
where p.slug in ('netflix-premium-profile-1m', 'canva-pro-invite-1m')
  and not exists (select 1 from public.inventory_stock s where s.product_id = p.id);
