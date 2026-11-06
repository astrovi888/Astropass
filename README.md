# AstroVault
Premium digital-subscription shop (wallet, instant/manual delivery, tickets + live chat, staff console) on Supabase. No build step.
Local test: `python3 -m http.server` then open http://localhost:8000. Setup + open tasks: **NEXT_STEPS.md**. Tutorial: the Build Guide doc.

| File | Purpose |
|---|---|
| index.html, style.css, mascot.js | page shell, Astro theme, mascot art |
| config.js | **edit me**: Supabase URL + publishable key, brand, categories |
| app.js | core: auth, shop, checkout, wallet, orders, account, router, `window.AV` plug-in API |
| support.js | customer tickets, chat window, notification bell |
| legal.js | About / Terms / Refunds / Privacy / FAQ text (edit before launch) |
| staff.js | staff console (queue, orders, top-ups, products, users, team, payments) |
| supabase/schema.sql -> schema_v2.sql -> schema_v3.sql -> seed.sql | run in this order |
| supabase/functions/send-emails | Edge Function that sends emails (Resend) |
| supabase/admin-helpers.sql | setup/reporting SQL |
