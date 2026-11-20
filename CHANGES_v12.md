# CHANGES v12 (read after CHANGES_v11.md)
Stack decision: kept the existing plain HTML/JS + Supabase site (no Next.js rewrite). No payment, auth or wallet logic was changed.

## Files changed / new
- NEW ui.js: theme switch (Auto/Light/Dark with sliding thumb), skeleton loaders, sliding category pill, 1-tap copy "✓ Copied" + haptic, payment 3-step guide + "Copy amount" pill (decorates #tinfo only), floating Live support pill (Telegram from store settings), page-enter animation.
- NEW vendor.js: Verified blue check (animated SVG), "Apply for verification", "Become a seller", Vendor Studio (#/studio), public storefront (#/store/<slug>), buy flow (wallet), Admin staff tab "Marketplace" (needs perm users_view).
- NEW Supabase/schema_v11.sql: profiles.is_verified, verification_requests, vendors, vendor_listings, vendor_stock (secrets, never client-readable), vendor_orders, settings.platform_fee_rate (default 0.25), RPCs. RUN IT ONCE in the SQL editor. Vendor = vendors.status 'approved' (profiles.role untouched on purpose).
- style.css: Obsidian Dark (#09090B) + Apple Light (#F5F5F7) tokens, spring easing, glass sheet (bottom sheet on mobile, centered modal on desktop), logical CSS props for RTL.
- app.js: orders show expiry bar + "Verified (Instant) Delivery" badge; Tunisian option in Account language list.
- i18n.js: 4th language Tounsi (tn, RTL, html lang ar-TN) + FR/AR strings for new UI.
- index.html (new scripts, css v3), sw.js (cache v3).

## Honest notes
- No automatic renewal exists in the backend: UI shows days left + one-tap Renew.
- "Instant" badge = completed order whose product is fulfillment=instant.
- Store URLs are hash routes (#/store/slug), because the site is static (no server routing).
- Vendor payouts are manual: admin taps "Mark paid" after paying outside the site. Buyer pays from wallet; vendor earnings = price minus fee.
- Fonts: system stack (SF Pro/Inter if installed, JetBrains Mono falls back to system mono); no external fonts, CSP unchanged.
- Smoke-tested in headless Chromium with a mocked Supabase (shop, theme, pill, store page, 404, tn RTL). NOT tested against your real database: run schema_v11 and test apply -> approve -> list -> buy with two accounts.

## Next steps
1. Run schema_v11.sql, then test the vendor flow end to end.
2. Telegram bot upgrade + notifications (needs bot code).
3. Vendor payouts/refunds UI, vendor order disputes, listing images.
