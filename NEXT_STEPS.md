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
1. NEW Supabase project -> SQL Editor, in this order: schema.sql, schema_v2.sql, schema_v3.sql, schema_v5.sql, seed.sql, seed_payments.sql.
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
