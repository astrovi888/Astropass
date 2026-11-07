-- =====================================================================================
--  AstroVault payment methods. Run AFTER schema_v5.sql. Re-run safe (updates these rows).
--  Values below are YOUR details. Change them any time in the app: Staff > Payments (owner).
--  auto_verify is OFF on purpose: turn it on per method once the watch-deposits function is deployed.
-- =====================================================================================
insert into public.payment_methods (id, label, kind, details, meta, image_url, instructions, auto_verify, coming_soon, is_active, sort_order) values
 ('binance-pay', 'Binance Pay',                    'binance_pay', '216818778',
    '{"name":"ItsAstro"}', 'assets/binance-pay.png', '', false, false, true, 10),
 ('usdt-trc20',  'USDT · TRON (TRC20)',            'crypto', 'TCjAZcy2YXMjBLSY4iRvGbXKt3xraQELED',
    '{"network":"TRC20","coin":"USDT"}', 'assets/usdt-trc20.png', '', false, false, true, 20),
 ('usdt-bep20',  'USDT · BNB Smart Chain (BEP20)', 'crypto', '0x3adb1d6f998b03647fdcc5521cc8eb3064f6ff3b',
    '{"network":"BEP20","coin":"USDT"}', 'assets/usdt-bep20.png', '', false, false, true, 30),
 ('redotpay',    'RedotPay',                       'manual', '', '{}', null, 'Coming soon.', false, true, true, 50),
 ('card',        'Card payment',                   'manual', '', '{}', null, 'Coming soon.', false, true, true, 60),
 ('paypal',      'PayPal',                         'manual', '', '{}', null, 'Coming soon.', false, true, true, 70)
on conflict (id) do update set label = excluded.label, kind = excluded.kind, details = excluded.details, meta = excluded.meta,
  image_url = excluded.image_url, instructions = excluded.instructions, coming_soon = excluded.coming_soon, sort_order = excluded.sort_order;
-- Old placeholder rows from earlier seeds (safe to remove):
delete from public.payment_methods where id in ('bank');
