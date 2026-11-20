/* AstroVault MARKETPLACE (vendor.js): Verified blue check, "Apply for verification", Become a seller, Vendor Studio (#/studio),
   public storefronts (#/store/<slug>), and an Admin "Marketplace" staff tab. Needs Supabase/schema_v11.sql.
   All rules (fees, who may do what) live in the database; this file only draws screens and calls RPCs. */
(function(){
"use strict";
const A=window.AV;if(!A||!A.sb)return;
const {$,esc,money,when,pop,sheet,closeSheet,rpc,emsg,paint,S,V}=A,act=A.act,form=A.form;
const X='<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button>';
const CHK='<svg class="vchk" viewBox="0 0 24 24" role="img" aria-label="Verified"><path d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3-2.6-1.9 1-3-1-3 2.6-1.9 1-3 3.2.1z"/><path class="tick" d="M7.8 12.4l3 3 5.6-6"/></svg>';
A.vcheck=CHK;
const run=async(fn,args,ok,after)=>{try{const r=await rpc(fn,args);pop(ok||"Done");closeSheet();if(after)after(r);else A.route();return r}catch(e){pop(emsg(e))}};
const ER={slug_taken:"That store link is taken. Try another.",already_applied:"You already applied.",already_pending:"You already have a request waiting.",out_of_stock:"Sold out.",own_listing:"You can’t buy your own listing.",insufficient_funds:"Not enough wallet balance. Add money first.",not_vendor:"Your store is not approved yet.",stock_required:"Add at least one item of stock."};
const err=e=>ER[(e&&e.message)||""]||emsg(e);
const go=(h)=>{location.hash=h};

// ---- blue check next to the username on the Account page ----
let MK=null;const loadMk=async()=>{if(!S.user){MK=null;return}try{MK=await rpc("my_market")}catch(e){MK=null}};
const baseAcc=V.account;
V.account=async function(t){await baseAcc.apply(this,arguments);if(!S.user||!/^#\/account/.test(location.hash))return;await loadMk();if(!MK)return;
 const app=$("app"),nm=app&&app.querySelector(".au-h b");if(nm&&MK.verified&&!nm.querySelector(".vchk"))nm.insertAdjacentHTML("beforeend",CHK);
 const v=MK.vendor,vs=MK.vstatus;
 const vbtn=MK.verified?`<p class="vbadge">✔ Your account is verified</p>`:vs==="pending"?`<p class="lk">⏳ Verification request under review.</p>`:`<button class="btn" data-a="vreq">${CHK} Apply for verification</button>`;
 const sbtn=!v?`<button class="btn" data-a="vapply">🏪 Become a seller</button>`:v.status==="approved"?`<div class="row"><button class="btn p" data-go="studio">Vendor Studio</button><button class="btn" data-go="store/${esc(v.slug)}">My store</button></div>`:`<p class="lk">🏪 Seller application: <b>${esc(v.status)}</b></p>`;
 app.insertAdjacentHTML("beforeend",`<h3>Marketplace</h3><div class="box">${vbtn}<div style="height:8px"></div>${sbtn}</div>`)};

act.vreq=()=>sheet(`${X}<h2>Apply for the blue check</h2><p class="en" style="font-size:14px">Tell us who you are. Our team reviews every request by hand.</p>
 <form data-f="vreq"><label>Your public handle or name</label><input id="vh" required minlength="2" maxlength="80"><label>Telegram or contact</label><input id="vc" required minlength="2" maxlength="120" placeholder="@username"><label>Proof (link to your profile, past sales, ID of a store…)</label><textarea id="vp" rows="3" required minlength="5" maxlength="1000"></textarea><div style="height:10px"></div><button class="btn p">Send request</button></form>`);
form.vreq=f=>run("request_verification",{p_handle:$("vh").value,p_contact:$("vc").value,p_proof:$("vp").value},"Request sent. We’ll review it soon.");
act.vapply=()=>sheet(`${X}<h2>Become a seller</h2><p class="en" style="font-size:14px">Sell digital products on AstroVault. We approve stores by hand and keep a small platform fee on each sale.</p>
 <form data-f="vapply"><label>Store name</label><input id="sn" required minlength="2" maxlength="60"><label>Store link (letters, numbers, dashes)</label><input id="ss" required pattern="[a-z0-9][a-z0-9\\-]{2,29}" maxlength="30" placeholder="my-store"><label>About your store</label><textarea id="sb" rows="2" maxlength="400"></textarea><label>Contact (Telegram)</label><input id="sc" maxlength="120"><div style="height:10px"></div><button class="btn p">Apply</button></form>`);
form.vapply=f=>run("apply_vendor",{p_slug:$("ss").value.toLowerCase(),p_name:$("sn").value,p_bio:$("sb").value,p_contact:$("sc").value},"Application sent. We’ll review it soon.");

// ---- public storefront  #/store/<slug> ----
const lcard=l=>`<div class="item" style="align-items:flex-start"><span><b>${esc(l.title)}</b><br><small class="lk">${esc(l.description||"")}</small><br><small class="lk">${l.stock>0?l.stock+" in stock":"Sold out"}</small></span><span style="text-align:end"><b class="num">${money(l.price)}</b><br><button class="btn p" style="margin-top:6px" data-a="vbuy" data-id="${esc(l.id)}" data-t="${esc(l.title)}" data-p="${l.price}" ${l.stock>0?"":"disabled"}>Buy</button></span></div>`;
V.store=async function(t){const slug=(location.hash.split("/")[2]||"").toLowerCase().replace(/[^a-z0-9-]/g,"");let s=null;
 try{s=await rpc("get_store",{p_slug:slug})}catch(e){}
 if(!s)return paint(t,`<div class="box ctr"><h2>Store not found</h2><p class="en">This store doesn’t exist or isn’t approved yet.</p><button class="btn p" data-go="shop">Back to shop</button></div>`);
 paint(t,`<button class="btn back" data-go="shop">← Shop</button><div class="box vstore"><h2>${esc(s.name)}${s.verified?CHK:""}</h2><p class="en" style="font-size:14px">${esc(s.bio||"")}</p>
  <div class="vtag"><span class="pill ok">✅ ${s.orders} completed orders</span><span class="pill">⚡ Instant delivery</span><span class="pill">Since ${new Date(s.since).toLocaleDateString()}</span>${s.verified?'<span class="pill ok">Verified seller</span>':""}</div></div>
  <h3>Listings</h3><div class="vgrid">${(s.listings||[]).map(lcard).join("")||'<p class="en">No listings yet.</p>'}</div>`)};
act.vbuy=el=>{if(!S.user){pop("Please log in first");location.hash="#/account";return}
 sheet(`${X}<h2>Confirm purchase</h2><p class="en">${esc(el.dataset.t)} for <b>${money(el.dataset.p)}</b> from your wallet?</p><div class="row"><button class="btn" data-a="closesheet">Cancel</button><button class="btn p" data-a="vbuy2" data-id="${esc(el.dataset.id)}">Pay ${money(el.dataset.p)}</button></div>`)};
act.vbuy2=async el=>{try{const r=await rpc("buy_vendor_listing",{p_listing:el.dataset.id});await A.loadProfile();A.chrome();
  sheet(`${X}<h2>✅ Delivered</h2><p class="lk">Order #MK-${r.number} · ${esc(r.title)}</p><div class="cred" id="vdl">${esc(r.delivery)}</div><button class="btn" data-a="copyel" data-id="vdl">Copy details</button><div style="height:8px"></div><button class="btn p" data-a="closesheet">Done</button>`);A.route()}catch(e){pop(err(e));closeSheet()}};

// ---- Vendor Studio  #/studio ----
V.studio=async function(t){if(!S.user)return paint(t,A.login());let m=null;try{m=await rpc("vendor_my")}catch(e){}
 if(!m)return paint(t,`<div class="box ctr"><h2>Vendor Studio</h2><p class="en">You don’t have a store yet.</p><button class="btn p" data-a="vapply">Become a seller</button></div>`);
 if(m.status!=="approved")return paint(t,`<div class="box ctr"><h2>Vendor Studio</h2><p class="en">Your store is <b>${esc(m.status)}</b>. We’ll notify you when it is approved.</p></div>`);
 paint(t,`<h2>Vendor Studio${m.verified?CHK:""}</h2><div class="grid"><div class="stat"><b class="num">${money(m.earnings)}</b><span>Net earnings (after ${Math.round(m.fee*100)}% fee)</span></div><div class="stat"><b class="num">${(m.orders||[]).length}</b><span>Recent sales</span></div></div>
  <div class="row"><button class="btn p" data-a="vnew">＋ New listing</button><button class="btn" data-go="store/${esc(m.slug)}">View store</button></div>
  <h3>Listings</h3>${(m.listings||[]).map(l=>`<div class="item"><span><b>${esc(l.title)}</b><br><small class="lk">${money(l.price)} · ${l.stock} in stock · ${l.active?"Live":"Paused"}</small></span><span class="row" style="gap:6px"><button class="btn" data-a="vstock" data-id="${esc(l.id)}">＋ Stock</button><button class="btn" data-a="vtog" data-id="${esc(l.id)}">${l.active?"Pause":"Resume"}</button></span></div>`).join("")||'<p class="en">No listings yet.</p>'}
  <h3>Recent sales</h3>${(m.orders||[]).map(o=>`<div class="item"><span><b>${esc(o.title)}</b><br><small class="lk">#MK-${o.number} · ${when(o.at)}</small></span><span style="text-align:end" class="num">${money(o.net)}<br><small class="lk">fee ${money(o.fee)}</small></span></div>`).join("")||'<p class="en">No sales yet.</p>'}
  <p class="lk">Payouts: message us on Telegram to withdraw your net earnings.</p>`)};
act.vnew=()=>sheet(`${X}<h2>New listing</h2><form data-f="vnew"><label>Title</label><input id="lt" required minlength="2" maxlength="80"><label>Description</label><textarea id="ld" rows="2" maxlength="600"></textarea><label>Category</label><select id="lc"><option value="ai">AI tools</option><option value="streaming">Streaming</option><option value="gaming">Gaming keys</option><option value="other">Other</option></select><label>Price (USD)</label><input id="lp" type="number" step="0.01" min="0.5" max="5000" required><label>Stock: one item per line (key, login…). Delivered to the buyer after payment.</label><textarea id="ls" class="sec" rows="4" required></textarea><div style="height:10px"></div><button class="btn p">Publish</button></form>`);
form.vnew=f=>run("vendor_add_listing",{p_title:$("lt").value,p_desc:$("ld").value,p_cat:$("lc").value,p_price:parseFloat($("lp").value),p_secrets:$("ls").value.split("\n").map(x=>x.trim()).filter(Boolean)},"Listing published");
act.vstock=el=>sheet(`${X}<h2>Add stock</h2><form data-f="vstock" data-id="${esc(el.dataset.id)}"><label>One item per line</label><textarea id="ls2" class="sec" rows="4" required></textarea><div style="height:10px"></div><button class="btn p">Add</button></form>`);
form.vstock=f=>run("vendor_add_stock",{p_listing:f.dataset.id,p_secrets:$("ls2").value.split("\n").map(x=>x.trim()).filter(Boolean)},"Stock added");
act.vtog=el=>run("vendor_toggle_listing",{p_listing:el.dataset.id},"Updated");

// ---- Admin: staff tab "Marketplace" (approve blue checks + stores, commission, payouts) ----
if(A.TAB&&A.TABS){A.TABS.push(["market","Marketplace","users_view","🏪","Blue checks, stores, commission"]);
 A.TAB.market=async()=>{const q=await rpc("admin_market_queue"),fee=Math.round(Number(q.fee||0.25)*100);
  const vr=(q.verifications||[]).map(r=>`<div class="item" style="align-items:flex-start"><span><b>@${esc(r.username)}</b> <span class="pill">${esc(r.status)}</span><br><small class="lk">${esc(r.handle)} · ${esc(r.contact)}<br>${esc(r.proof)}</small></span>${r.status==="pending"?`<span class="row" style="gap:6px"><button class="btn p" data-a="mvr" data-id="${r.id}" data-ok="1">Approve</button><button class="btn" data-a="mvr" data-id="${r.id}" data-ok="0">Reject</button></span>`:""}</div>`).join("")||'<p class="en">No requests.</p>';
  const vs=(q.vendors||[]).map(v=>`<div class="item" style="align-items:flex-start"><span><b>${esc(v.name)}</b>${v.verified?CHK:""} <span class="pill">${esc(v.status)}</span><br><small class="lk">@${esc(v.username)} · /store/${esc(v.slug)} · earned ${money(v.earnings)}<br>${esc(v.bio||"")}</small></span><span style="display:grid;gap:6px"><button class="btn${v.status==="approved"?"":" p"}" data-a="mvs" data-id="${v.id}" data-s="${v.status==="approved"?"suspended":"approved"}">${v.status==="approved"?"Suspend":"Approve"}</button><button class="btn" data-a="mvv" data-id="${v.user_id}" data-on="${v.verified?0:1}">${v.verified?"Revoke ✔":"Give ✔"}</button>${v.earnings>0?`<button class="btn" data-a="mpay" data-id="${v.id}" data-e="${v.earnings}">Mark paid</button>`:""}</span></div>`).join("")||'<p class="en">No stores yet.</p>';
  return `<div class="box mt"><b>Platform commission</b><form data-f="mfee"><label>Percent kept by AstroVault (0 to 60)</label><input id="mf" type="number" min="0" max="60" step="1" value="${fee}" required><div style="height:10px"></div><button class="btn p">Save</button></form></div><h3>Blue check requests</h3>${vr}<h3>Stores</h3>${vs}`};
 act.mvr=el=>run("admin_review_verification",{p_id:el.dataset.id,p_approve:el.dataset.ok==="1"},"Done");
 act.mvs=el=>run("admin_set_vendor",{p_vendor:el.dataset.id,p_status:el.dataset.s},"Store updated");
 act.mvv=el=>run("admin_set_verified",{p_user:el.dataset.id,p_on:el.dataset.on==="1"},"Blue check updated");
 act.mpay=el=>{const a=prompt("Amount you paid out (max "+el.dataset.e+")",el.dataset.e);if(a)run("admin_pay_vendor",{p_vendor:el.dataset.id,p_amount:parseFloat(a)},"Payout recorded")};
 form.mfee=f=>run("admin_set_fee",{p_rate:Math.max(0,Math.min(60,parseFloat($("mf").value)))/100},"Commission saved")}
})();
