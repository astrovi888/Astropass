# NEXT_STEPS.md  (handoff note: read this first)

Project: **AstroVault**, a digital-subscription shop built from the AstroLingo codebase (kept: Astro look, Supabase auth,
sheets/modals/tab bar, motion; removed: all language learning, audio, quizzes, AI chat, ~1.3 MB of data files).
Static site, no build step, vanilla JS. Host on GitHub Pages / Vercel / Netlify. All money logic is in Postgres.

## Status
DONE and smoke-tested in a browser with a mocked Supabase (UI flow only):
- index.html, style.css, config.js, mascot.js, app.js (auth, shop, product sheet, 2-step checkout, wallet + top-up request,
  orders + credentials copy, account/theme, admin: orders / top-ups / products + stock / user balance), sw.js, manifest.
- supabase/schema.sql (tables, RLS, atomic `purchase()`, top-ups, admin RPCs), seed.sql, admin-helpers.sql.

NOT verified: **schema.sql has never been executed** (no Postgres was available). Run it on a fresh Supabase project first
and fix any error before anything else. Then test with two browsers: buy the last stock unit at the same time.

## Setup (owner)
1. New Supabase project (do NOT reuse the AstroLingo one). SQL Editor: run schema.sql, then optionally seed.sql.
2. config.js: paste Project URL + publishable/anon key (never service_role). Set CONTACT and TOPUP methods (usdt address / link url).
3. Auth > Email template "Confirm signup": include `{{ .Token }}` (the site uses the 6-digit code flow). Add the site URL to Auth > URL config.
4. Sign up on the site, then run in SQL Editor: `update profiles set is_admin=true where email='you@example.com';`
5. Edit placeholder prices/stock (Admin > Products), delete the DEMO stock lines, replace About/Terms text in app.js.

## TODO for the next session (priority order)
1. Run schema.sql against real Supabase; fix errors; test purchase / refund / top-up approve / double-click / two-tab race.
2. Real payment hook: Supabase Edge Function webhook that calls `_wallet_apply(user, amount,'topup',note,null,null,provider_txn_id)`
   with the service_role key (`external_ref` is unique, so replays are harmless). Needs a function grant for service_role.
3. Admin: edit existing product (only create/hide exists), void single stock rows, order search, user ledger view.
4. Branding: icons and mascot hoodie still say "20/80" (AstroLingo). Replace icon-192/512 + apple-touch-icon; drop `logo` pose already removed.
5. Hardening: vendor supabase-js locally or add an SRI hash (CDN script is unpinned by integrity); rate limits; email on order status change.
6. Real Terms / Privacy text (placeholders now). Providers' ToS often forbid resale/shared accounts: keep refund/replacement policy clear.

## Design decisions (do not undo without thinking)
- Browser has NO write access to profiles/orders/ledger. Only SECURITY DEFINER RPCs change money; each checks auth.uid()/is_admin().
- `purchase()` locks the wallet row, uses `FOR UPDATE SKIP LOCKED` on stock, takes a `p_request_id` idempotency key, and a
  `p_expected_price`. Client sends a fresh uuid per confirm screen and reuses it on retry.
- Removed AstroLingo's `email_for_username` RPC (it let anyone look up an account's email by username). Login is email-only.
- Credentials are stored as plain text in `inventory_stock.payload` / `orders.delivery` (RLS-protected). Consider Vault/pgsodium later.
- User deletion cascades to orders/ledger (privacy-friendly, but loses accounting rows).
