/* AstroVault LEGAL & TRUST PAGES (legal.js): About, Terms, Refunds, Privacy, FAQ shown in a modal from the footer.
   OWNER: these are sensible defaults, NOT legal advice. Edit the text below to match your real policies and local rules
   before launch (especially refund timing, wallet rules and which data you keep). Plain HTML strings, one per page. */
(function(){
"use strict";
const A=window.AV;if(!A)return;
const B=A.esc(A.C.BRAND),CT=A.esc(A.C.CONTACT.label),UPDATED="November 2026";
const P={
 about:["About "+B,`<p>${B} sells digital subscriptions and game top-ups at friendlier prices. You add money to a prepaid wallet, pay from it, and receive your item instantly or processed by hand by our team.</p>
  <p>Real people run support: open a ticket and chat with us any time from the Help tab.</p>
  <p class="lk">${B} is an independent reseller. We are not affiliated with, endorsed by or sponsored by Netflix, Spotify, Google, Canva, Roblox, Valve, Krafton, Garena or any other brand shown. All trademarks belong to their owners.</p>`],
 terms:["Terms of use",`<ul class="info-l">
  <li><b>Wallet.</b> Your wallet is a prepaid balance for buying in this store ($1 = 1.00). It is not a bank account and earns no interest.</li>
  <li><b>Top-ups.</b> We credit your wallet only after we verify your payment by hand. You must give the true sender name, the transaction ID and a screenshot. Fake, edited or reused proofs are rejected and may lead to account suspension.</li>
  <li><b>Orders.</b> Instant items are delivered as soon as you pay. Other items are processed by hand: Pending, then Processing, then Completed. If we cannot complete an order it is cancelled and refunded to your wallet.</li>
  <li><b>Third-party services.</b> Subscriptions and accounts come from other companies, who may change or end them. Follow each product's instructions and warranty. Do not change shared credentials or share them further.</li>
  <li><b>Prices.</b> The price you see at checkout is the price you pay. Prices can change for future orders.</li>
  <li><b>Misuse.</b> Fraud, abuse, chargebacks or attempts to break the site lead to suspension and loss of access to the balance.</li>
  <li><b>Changes.</b> We may update these terms. Continuing to use the store means you accept the current version.</li></ul><p class="lk">Last updated ${UPDATED}.</p>`],
 refunds:["Refund policy",`<ul class="info-l">
  <li><b>We cannot deliver:</b> full refund to your wallet, automatically.</li>
  <li><b>Item stops working during its warranty:</b> open a ticket from the order. We replace it or refund the order to your wallet.</li>
  <li><b>Delivered and working:</b> not refundable.</li>
  <li><b>Wrong details you entered</b> (player ID, email): we cannot reverse a top-up sent to the wrong account, so please double-check.</li>
  <li><b>Payment problems:</b> if you paid but were not credited, open a ticket with your transaction ID and we will investigate.</li></ul>
  <p class="en">Questions? Open a ticket or message ${CT}. We reply as fast as we can, usually within a few hours.</p><p class="lk">Last updated ${UPDATED}.</p>`],
 privacy:["Privacy",`<ul class="info-l">
  <li><b>What we store:</b> your email, username, orders, wallet history, support messages and the payment screenshots you upload.</li>
  <li><b>Who sees it:</b> payment screenshots are private and visible only to staff who verify payments. Support agents see your username and ticket, not your email or balance.</li>
  <li><b>Where:</b> data is kept with our database provider (Supabase). Notification emails are sent through an email provider.</li>
  <li><b>What we don't do:</b> no ads, no selling your data, no tracking cookies.</li>
  <li><b>Your rights:</b> ask us in a ticket to export or delete your account and we will do it.</li></ul><p class="lk">Last updated ${UPDATED}.</p>`],
 faq:["FAQ",`<details><summary>How do I add money?</summary><p class="en">Wallet tab: choose a method, send the payment, then upload the screenshot with the transaction ID and your name. We verify and credit it.</p></details>
  <details><summary>How long does verification take?</summary><p class="en">Usually within a few hours. You get a notification and an email as soon as it is done.</p></details>
  <details><summary>Instant vs "On request"?</summary><p class="en">Instant items appear in Orders the moment you pay. "On request" items are handled by our team and show their status in Orders.</p></details>
  <details><summary>My item stopped working.</summary><p class="en">Open the order and press "Need help with this order". We will replace or refund it within the warranty.</p></details>
  <details><summary>Why do you need a screenshot?</summary><p class="en">It protects you and us from fake payments, and it is only visible to the staff who verify it.</p></details>
  <details><summary>Is this official?</summary><p class="en">No. We are an independent reseller and not affiliated with the brands we sell.</p></details>`]};
Object.keys(P).forEach(k=>{A.act[k]=()=>A.modal(`<h2>${P[k][0]}</h2>`+P[k][1])});
})();
