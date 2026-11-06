-- =====================================================================================
--  AstroVault template catalog (run after schema.sql + schema_v2.sql). Re-run safe (never overwrites your edits).
--  Every product is "coming soon": visible in the shop, but checkout shows a friendly "not live yet" message.
--  Go live per product: Staff > Products > "Go live" (set real price + add stock first). Prices are PLACEHOLDERS.
-- =====================================================================================
insert into public.products (slug,name,description,category,icon,duration_label,price,retail_price,fulfillment,input_label,terms,sort_order,coming_soon) values
 ('gemini-advanced-1m','Gemini Advanced','Google''s most capable Gemini model, upgraded on your own Google account.','ai','✨','1 month',9.99,19.99,'manual','Your Gmail address','Upgraded on the account you provide. Refunded in full if we cannot upgrade it.',10,true),
 ('spotify-premium-1m','Spotify Premium','Ad-free music, offline listening, unlimited skips. You receive an invite.','entertainment','🎧','1 month',3.99,11.99,'manual','Your Spotify email','Invite must be accepted. Refunded in full if the invite fails.',20,true),
 ('netflix-premium-1m','Netflix Premium Profile','Your own 4K profile. Details delivered instantly.','entertainment','🎬','1 month',4.99,17.99,'instant',null,'Use only your profile. Replaced if it stops working within the month.',30,true),
 ('canva-pro-1m','Canva Pro','Premium templates, Brand Kit and Magic tools.','productivity','🎨','1 month',2.99,14.99,'instant',null,'Single-use invite link.',40,true),
 ('pubg-uc-660','PUBG Mobile 660 UC','Top-up delivered to your player ID.','games','🎮','one-time',9.49,11.99,'manual','Your player ID','Double-check your ID: top-ups to a wrong ID cannot be reversed.',50,true),
 ('freefire-1080','Free Fire 1080 Diamonds','Top-up delivered to your player ID.','games','💎','one-time',9.99,12.99,'manual','Your player ID','Double-check your ID: top-ups to a wrong ID cannot be reversed.',60,true),
 ('roblox-800','Roblox 800 Robux','Robux gift card, instant code.','games','🧱','one-time',8.99,10.99,'instant',null,'Redeem at roblox.com/redeem.',70,true),
 ('steam-10','Steam Wallet $10','Steam wallet code.','games','🕹️','one-time',10.50,10.00,'instant',null,'Region-locked: check your Steam region first.',80,true)
on conflict (slug) do nothing;

-- Payment methods (owner edits these in Staff > Payments). Wallet address / link starts empty on purpose.
insert into public.payment_methods (id,label,kind,details,instructions,coming_soon,is_active,sort_order) values
 ('usdt-trc20','USDT (TRC20)','address','','Send the exact amount, then enter the transaction ID and upload a screenshot.',false,true,10),
 ('bank','Bank / mobile transfer','manual','','Transfer, then enter the reference number and upload your receipt.',false,true,20),
 ('card','Card payment','manual','','',true,true,30),
 ('paypal','PayPal','manual','','',true,true,40)
on conflict (id) do nothing;
