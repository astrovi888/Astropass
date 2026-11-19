# CHANGES v11 (handoff note, read with NEXT_STEPS.md)

## Done on the website
- Preset buttons (5/10/25/50): now highlighted (.chip.on) and update the "You will send" TND price live (markAmt + tndUpdate in app.js). Typing also syncs highlight.
- D17 QR: image check only allowed `assets/...` or https. Your `d17-qr.png` is in the site ROOT, so it was silently dropped. Regex now accepts root filenames; QR is bigger on white background; shows "QR unavailable" instead of a broken image. In Staff > Payments, set D17 image to `d17-qr.png` (or move file to assets/ and use assets/d17-qr.png).
- Selfie: titled "Identity selfie", oval guide, live prompts (move closer / center / one person), AUTO-captures when a face is held steady ~1s (FaceDetector API: Chrome/Android). Safari/iOS/Firefox have no FaceDetector -> 3s countdown + manual button (face NOT verified there).
- Speed: service worker now stale-while-revalidate (v2), scripts `defer`, preconnect to Supabase, css v2.

## Not done (needs bot code)
- Telegram bot (supabase/functions/telegram-bot) is NOT in the repo zip. Not touched.

## Next steps
1. Bot: /start welcome with buttons (Verify phone / My orders / Support), clear messages, confirmation message after verifying, error text for wrong contact.
2. Bot as notification channel: add profiles.telegram_chat_id (saved at verification); extend send-emails function or new `notify-telegram` function on notifications INSERT webhook -> sendMessage (order status, top-up approved, renewal reminder, ticket reply). Staff alerts group chat for new top-ups/orders/fraud flags.
3. Real face check for all browsers: MediaPipe/face-api (needs CSP + model hosting) or server-side check; optional.
4. More speed: self-host supabase-js (no CDN), skeleton loaders in shop, cache get_catalog in sessionStorage.
5. Never send passwords via Telegram/email; use reset links.
6. Run schema_v9/v10 + functions testing (still marked untested in NEXT_STEPS).
