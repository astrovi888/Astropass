# AstroVault
Digital subscriptions shop (wallet + instant/manual delivery) on Supabase. Static site, no build step.
Local test: `python3 -m http.server`, open http://localhost:8000. Setup steps and open tasks: see **NEXT_STEPS.md**.

| File | Purpose |
|---|---|
| index.html, style.css | page + Astro theme (light/dark, iOS-style motion) |
| config.js | **edit me**: Supabase keys, brand, categories, top-up methods |
| app.js | all screens: shop, wallet, orders, account, admin |
| mascot.js | Astro poses (embedded images) |
| supabase/schema.sql | tables, security rules, checkout + admin functions |
| supabase/seed.sql, admin-helpers.sql | sample products; SQL for setup and reporting |
