# CHANGES v14 (read after v12; the Telegram notification work from v13 is ON HOLD, files exist but are not wired in)
## Done
- @username first: log in with @username OR email; "Forgot password" works with @username (code goes to the account's email, answer never reveals if an account exists); staff search accepts @username; store "link" is now the store @username; Account shows @username big, ID small.
- Edge function Supabase/Functions/auth-helper (deploy with Verify JWT OFF): login by username, reset_start/reset_finish, and admin actions.
- Staff > Test accounts (🧪, needs users_view): create a login with no email/phone (placeholder email <username>@astrovault.test, auto-confirmed), generated readable password, copy-login-message button, list, new password, delete. It can only touch accounts flagged temp_account (never staff or real users).
- User side: Account > Username (change, once per 7 days; free for starter accounts), Email (add/change, confirm link sent to the new address; schema trigger drops the starter flag + syncs profiles.email), Password. Starter accounts see a banner.
- Declutter: Shop (hero only when logged out, no step boxes, search > categories > filters > grid), Account as compact list rows, calmer headings.
## Setup
1. Run Supabase/schema_v13.sql. 2. Create Edge Function auth-helper, paste index.ts, Verify JWT OFF, deploy. 3. Upload changed site files.
## Notes / not tested against the real project
- Username login goes through the function (so emails are never exposed). Supabase limits sign-ins per IP; the function uses one server IP, fine for a small shop.
- Phone number is still added through the existing identity check (D17-type payments). Starter accounts can pay with non-strict methods without it.
- Next: declutter Wallet and Staff tabs, Telegram notifications (v13 files), refund/dispute flow for vendors.
