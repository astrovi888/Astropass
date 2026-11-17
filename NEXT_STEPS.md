# NEXT_STEPS.md  (handoff: read first). Full tutorial: the "AstroVault Build Guide" Word/Doc.

AstroVault = digital-subscription shop built from AstroLingo (kept: Astro look, Supabase auth, sheets/tab bar/motion).
Static site, no build step, vanilla JS. All money + permission logic is in Postgres (supabase/*.sql).

## What exists (v2)
- Roles: customer < agent < admin < coowner < owner. Owner untouchable; you can only manage roles below yours.
- Shop with categories (AI, Entertainment, Productivity, Games), coming-soon products (checkout says "Coming soon", never charges).
- Wallet + proof-based top-ups (sender name, unique transaction ID, screenshot in private `proofs` bucket) verified by staff.
- Orders: pending -> processing -> completed | cancelled (refund). Order numbers #AV-1001. Staff can place orders for customers.
- Support: tickets + live chat (Realtime + 12s poll). Claim -> auto "Hello <customer>, my name is <agent>" message.
- Notifications: in-app bell + email outbox (`notifications.email`), sent by Edge Function supabase/functions/send-emails.
- Staff console (staff.js): Queue, Orders, Top-ups, Products, Users, Team(+audit log), Payments (owner only).
- Payment methods live in DB table payment_methods (owner edits in app; no redeploy).

## v4 additions (audit pass)
- legal.js: About/Terms/Refunds/Privacy/FAQ modals (DEFAULT TEXT, owner must review; not legal advice). Signup requires consent checkbox (stored as user metadata terms_accepted_at).
- staff.js Overview tab (admin+): sales today/30d, wallet liabilities, overdue orders/top-ups/tickets, launch checklist.
- Shop: live search, trust strip, manual-order ETA (config ETA_MANUAL). Balance chip refreshes when a notification arrives (support.js).
- Password-reset email keeps the default link template ({{ .ConfirmationURL }}); only Confirm signup + Magic Link use {{ .Token }}.

## v9 + v10 additions (security, D17 identity check, growth, languages)
- schema_v9.sql (after v8): strict payment methods (D17: identity, ONE pending top-up, caps, TND conversion, new-account limit), fraud_flags + auto-hold (phone reused, repeated rejected proofs, velocity),
  block/unblock, perm 'security', staff 2FA enforcement switch, warranty/duration + renewal reminders (pg_cron daily), low-stock + back-in-stock, referrals, promo/credit codes, store profile, store open/closed.
- schema_v10.sql (after v9): phone verified through Telegram bot (free), live selfie (private bucket), country at signup. Strict top-ups need both (switchable in Store settings).
- Edge Functions (deploy in Supabase dashboard, steps are at the top of each file): send-emails (Gmail SMTP, order/payment/refund/renewal emails), telegram-bot (phone verification, verify JWT OFF).
- Front end: staff_extra.js (Security, Growth, Store settings, Reports & backup, order search, low-stock), i18n.js (French/Arabic + RTL), contacts (Telegram default), About from Store settings, warranty badge, renewals, referral link, promo redeem, notify-me, two-step login.
- NOT built on purpose: automatic face recognition (needs paid server-side service; browser-only checks are bypassable), ID card number/photo (unverifiable + heavy legal duty). Selfie + verified phone + D17 receipt name check is the proportionate level.
- LEGAL: collecting selfies/phones in Tunisia may need declaration/authorisation (INPDP, personal-data law). Get a local lawyer/accountant to confirm before launch. Privacy/Terms text already mention these data.
- Untested on real Supabase: schema_v9.sql, schema_v10.sql, both Edge Functions. Run SQL in order and fix errors first.

## v8 additions (product pictures)
- schema_v8.sql (after v7): products.image_url, public bucket product-images (only 'products' permission may upload), get_catalog returns image_url.
- Staff product form: picture upload (resized to 900px JPEG in the browser). Cards/offer page show the picture; broken or missing image falls back to the emoji tile.
- vercel.json: security headers (nosniff, frame deny, referrer policy). Optional.
- NOTE: do not use official brand logos (Netflix, Spotify...) without permission; use your own artwork or neutral product images.

## v7 additions (marketplace offers)
- schema_v7.sql (run after v6): products get offer_no (OF-1001..), brand, subcategory, delivery_minutes, stock_qty (manual items, counts down in _purchase_core, restocked on cancel),
  sold_offset ("past sales", REAL numbers only), discount_percent/discount_until (eff_price() is what customers pay), featured, region_mode/region_list;
  profiles.user_no (public account ID from 100001); reviews (verified buyers, one per completed order, leave_review/get_reviews/store_stats);
  get_catalog rebuilt with sold, completed, avg delivery (last 30 completed orders, min 3), rating %, trending (top 3 by 7-day sales, min 3). _purchase_core + admin_cancel_order regenerated.
- UI: offer cards (red crossed price, trending, rating, sold, region warning), filters (country, brand, type, sort), offer page (info table, reviews, chat button), review form in completed orders,
  staff product form with all fields, Discount + Restock buttons, customer search by account ID.
- Region check is a guide only (customer picks their own country); not enforced server-side.
- TODO: hide/moderate reviews UI, live-chat widget (agents online) separate from tickets, user-posted products later.

## v6 additions (UX overhaul + RedotPay)
- schema_v6.sql (run after v5): new payment type pay_id + RedotPay row (ID 1546339006, assets/redotpay.png); ticket topics order/payment/topup/refund/account/password/product/other.
- Staff UI = home with tiles + customer search; each tile opens a section with "<- Staff home". CUSTOMER CARD (act.ucard in staff.js): balance, orders, ledger, tickets, quick top-up form. Reachable from search, Top-ups, Orders and ticket chat.
- Fixed red error "more than one relationship topup_requests/profiles": embed now names the FK (profiles!topup_requests_user_id_fkey).
- Customer UX (from checkout research: linear 2-3 steps, price/balance shown before paying, trust cues only where money moves, one obvious next button): 3-step strip on shop,
  header chip "+ Add money", wallet steps 1-2-3, help centre with topic tiles, account page with 3 quick tiles, "How it works" modal (legal.js, act.how) + first-visit hint.
- app.js now starts on window load so reloading #/staff or #/support never falls back to the shop.
- TODO ideas: internal staff notes in tickets, Google login, username login via Edge Function, order search, shop categories as tabs.

## v5 additions (permissions, payments, coins, auto-deposits)
- SQL: supabase/schema_v5.sql (run after v2, v3). Granular permissions (has_perm/my_perms/set_user_perms; role defaults + per-person grants/revokes),
  typed payment methods (binance_pay|crypto|bank|link|manual + QR + auto_verify), AstroCoins (earn via trigger on completed orders, redeem_coins,
  admin_grant_coins, settings table), deposit_invoices + create_deposit_invoice + credit_deposit (service role only), ticket oversight via 'tickets' perm.
  The 13 permission-checked functions were REGENERATED from earlier files by script (is_admin() -> _need('perm')).
- Edge Function supabase/functions/watch-deposits: TRON via TronGrid, BSC via JSON-RPC getLogs (cursor in chain_cursors), Binance Pay via read-only
  Pay-history API (EXPERIMENTAL, untested; Binance may geo-block servers). Cron every minute + WEBHOOK_SECRET. Auto-verify is OFF by default per method.
- seed_payments.sql: owner's Binance Pay ID, TRC20 + BEP20 addresses (verified: TRON checksum ok, QR images decode to the same addresses). assets/*.png = QR codes.
- UI: wallet shows typed method details + QR + network warning, "Pay automatically" invoice flow, proof form as fallback, coins card; staff tabs by permission,
  permission editor (Users/Team > Permissions), coin tools, payment form with only the needed fields, resolved/closed tickets visible for oversight.
- Known limits: staff notifications still go by rank, not permission; no internal staff-only chat/notes yet; per-user HD wallets deliberately NOT built (custody risk).
- UNTESTED: schema_v5.sql, watch-deposits, Binance polling. UI tested with mocked Supabase only.

## Run order (owner)  (then schema_v3.sql: product delete)
1. NEW Supabase project -> SQL Editor, in this order: schema.sql, schema_v2.sql, schema_v3.sql, schema_v5.sql, schema_v6.sql, schema_v7.sql, schema_v8.sql, schema_v9.sql, schema_v10.sql, seed.sql, seed_payments.sql.
2. config.js: Project URL + publishable key (never service_role).
3. Auth email template "Confirm signup" must contain {{ .Token }}. Add site URL in Auth > URL config.
4. Sign up on the site; SQL: `update public.profiles set role='owner' where email='you@example.com';`
5. Staff > Payments: set your wallet/bank details. Staff > Products: real prices + stock, "Go live".
6. Emails: Resend account + domain; `supabase functions deploy send-emails`; secrets RESEND_API_KEY, FROM_EMAIL, SITE_URL, WEBHOOK_SECRET;
   Database > Webhooks: notifications INSERT -> function with header x-webhook-secret.

## STATUS / VERIFIED
- JS: syntax-checked; browser-tested with a MOCKED Supabase as customer and owner (all screens, chat XSS escaping, coming-soon flow): no errors.
- SQL (schema.sql, schema_v2.sql): NEVER EXECUTED (no Postgres available). First task: run both on a real project, fix errors.
  Likely spots: storage.objects policies (need to run as project owner), `alter table orders add column ... generated always as identity`,
  realtime publication block, role grants DO-block.
- Edge Function: never deployed/tested.

## TODO (priority)
1. Execute SQL on real Supabase; test: two-tab last-stock race, top-up verify, refund, claim race, role rules, storage proof upload/view.
2. Real payment provider webhook -> `_wallet_apply(user, amt,'topup',note,null,null,provider_txn_id)` using service_role in an Edge Function.
3. (DONE v3: full product edit/delete, stock list+delete.) Still: search for orders/tickets, round-robin ticket assignment (assign_ticket RPC exists, no UI).
4. Ideas not built: store-closed/maintenance switch, coupons, Google login button, refund-request button, order search. Icons + mascot hoodie still say "20/80" (AstroLingo). Real Terms/Privacy/refund text (placeholders in app.js `terms`/`about`).
5. Hardening: vendor supabase-js or add SRI; rate limits; staff 2FA; cleanup of orphan proof uploads.
6. Providers' ToS often forbid resale/shared accounts: keep refund/replacement policy visible.

## Design decisions (don't undo casually)
- Browser has no write access to profiles/orders/ledger/tickets/notifications: only SECURITY DEFINER RPCs, each checks auth.uid()/rank.
- Agents see names on tickets (snapshotted), not customer emails/balances.
- Only owner can edit payment methods (a hacked admin can't redirect money). Every sensitive action -> audit_log.
- Login is email-only (old username->email lookup removed: it leaked emails).
- Code layout: app.js core + window.AV plug-in API; support.js / staff.js register views (V), clicks (act) and forms (form).
