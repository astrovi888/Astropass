/* AstroVault STAFF EXTRAS (staff_extra.js): extra staff tabs + upgrades, loaded after staff.js and plugged in through A.TAB / A.TABS.
   Security  (perm "security")  : fraud alerts, block / unblock accounts, identity shown on the customer card
   Growth    (perm "coins")     : promo codes, referral rewards
   Store settings (perm "payments"): About page, contact buttons, response time, TND rate, D17 limits, store open/closed, two-step enforcement
   Reports & backup (perm "audit") : CSV exports (the only backup you control on the free plan)
   Also: order SEARCH on the Orders tab, LOW-STOCK list on Overview, security info on the customer card.
   All real permission checks live in the database; this file only draws screens and calls RPCs. */
(function(){
"use strict";
const A=window.AV;if(!A||!A.sb||!A.TAB)return;
const {sb,$,esc,money,when,pop,sheet,closeSheet,rpc,emsg,act,form}=A,TAB=A.TAB,TABS=A.TABS;
const X='<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button>';
const run=async(fn,args,ok)=>{try{await rpc(fn,args);pop(ok||"Done");closeSheet();A.route()}catch(e){pop(emsg(e))}};
TABS.push(["security","Security","security","🚨","Alerts and blocked accounts"],["growth","Growth","coins","🎁","Promo codes, referrals"],["store","Store settings","payments","⚙️","About, contacts, limits, rates"],["backup","Reports & backup","audit","💾","Export CSV files"]);
A.extraCounts=async n=>{if(A.can("security")){const r=await sb.from("fraud_flags").select("id",{count:"exact",head:true}).eq("status","open");n.security=r.count||0}};

// ---------- SECURITY: alerts raised by the database (phone reused, repeated rejected proofs, many orders...) ----------
TAB.security=async()=>{
 const[fl,bl]=await Promise.all([sb.from("fraud_flags").select("*,profiles(username,email)").eq("status","open").order("created_at",{ascending:false}).limit(50),
  sb.from("profiles").select("id,username,email,blocked_reason,blocked_at").eq("blocked",true).order("blocked_at",{ascending:false}).limit(50)]);
 const F=fl.data||[],B=bl.data||[],sev={high:"no",medium:"wait",low:""};
 return `<p class="en" style="font-size:14px">The system watches for suspicious patterns and tells you here and by notification. High-risk cases (like one phone number used on two accounts) freeze the new account automatically. You decide what happens next.</p>
 <h3>Open alerts (${F.length})</h3>${F.map(f=>`<div class="box mt"><b>@${esc(f.profiles&&f.profiles.username)}</b> <span class="pill ${sev[f.severity]||""}">${esc(f.severity)}</span> <span class="lk">${esc(f.kind)}</span>
  <p class="en" style="font-size:14px">${esc(f.detail)}</p><small class="lk">${when(f.created_at)}</small><div class="row mt"><button class="btn" data-a="ucard" data-id="${f.user_id}">Open customer</button><button class="btn" data-a="fblock" data-id="${f.user_id}">Block</button><button class="btn" data-a="fdismiss" data-id="${f.id}">Dismiss</button></div></div>`).join("")||'<p class="en">✅ No open alerts.</p>'}
 <h3>Blocked accounts (${B.length})</h3>${B.map(u=>`<div class="item"><span><b>@${esc(u.username)}</b><br><small class="lk">${esc(u.email)} · ${esc(u.blocked_reason||"")}</small></span><button class="btn" data-a="funblock" data-id="${u.id}">Unblock</button></div>`).join("")||'<p class="en">None.</p>'}`;
};
act.fblock=el=>{const r=prompt("Reason (optional)");if(r!==null)run("admin_set_block",{p_user_id:el.dataset.id,p_blocked:true,p_reason:r},"Account blocked")};
act.funblock=el=>{if(confirm("Unblock this account?"))run("admin_set_block",{p_user_id:el.dataset.id,p_blocked:false},"Account unblocked")};
act.fdismiss=el=>run("admin_resolve_flag",{p_flag:parseInt(el.dataset.id),p_status:"dismissed"},"Dismissed");
// Customer card: add identity (full name, phone) + block button for people with the "security" permission
const oldU=act.ucard;
act.ucard=async el=>{await oldU(el);if(!A.can("security"))return;const id=el.dataset.id;
 const[ix,pf]=await Promise.all([sb.from("customer_identity").select("full_name,phone_display,phone_verified,selfie_path").eq("user_id",id).maybeSingle(),sb.from("profiles").select("blocked,blocked_reason,role").eq("id",id).maybeSingle()]);
 const box=document.querySelector("#sheet .sh-box");if(!box||!pf.data)return;
 box.insertAdjacentHTML("beforeend",`<h3>Security</h3><div class="box">${ix.data?`<p class="meta"><span>Full name</span><b>${esc(ix.data.full_name)}</b></p><p class="meta"><span>Phone</span><b>${esc(ix.data.phone_display)} ${ix.data.phone_verified?"✅ verified":"❌ not verified"}</b></p>${ix.data.phone_verified?"":`<button class="btn" data-a="markphone" data-id="${id}">Mark phone as verified</button>`}${ix.data.selfie_path?`<button class="btn" data-a="viewselfie" data-p="${esc(ix.data.selfie_path)}">📷 View selfie</button>`:'<p class="en">No selfie yet.</p>'}`:'<p class="en">No identity on file.</p>'}${pf.data.blocked?`<p class="neg">🚫 Blocked: ${esc(pf.data.blocked_reason||"")}</p><button class="btn" data-a="funblock" data-id="${id}">Unblock</button>`:(pf.data.role==="customer"?`<button class="btn" data-a="fblock" data-id="${id}">🚫 Block this account</button>`:"")}</div>`)};

// Selfies live in a PRIVATE bucket; a signed link works for 90 seconds only
act.viewselfie=async el=>{const{data,error}=await sb.storage.from("selfies").createSignedUrl(el.dataset.p,90);if(error)return pop("Can’t open the selfie");
 sheet(`${X}<img src="${esc(data.signedUrl)}" alt="Selfie" style="max-width:100%;border-radius:12px"><p class="lk">Private. Do not share or save this image.</p>`)};
act.markphone=el=>run("admin_mark_phone",{p_user_id:el.dataset.id,p_verified:true},"Phone marked as verified");
// ---------- GROWTH: promo codes + referral rewards ----------
TAB.growth=async()=>{
 const[pc,st]=await Promise.all([sb.from("promo_codes").select("*").order("created_at",{ascending:false}).limit(50),sb.from("settings").select("key,value").in("key",["ref_coins","ref_bonus"])]);
 const SE={};(st.data||[]).forEach(r=>SE[r.key]=r.value);
 return `<div class="box mt"><b>🎟️ New promo code</b><form data-f="newpromo"><label>Code (letters and numbers, e.g. WELCOME5)</label><input id="pcd" required maxlength="24"><label>Gives</label><select id="pck"><option value="credit">Wallet credit ($)</option><option value="coins">AstroCoins</option></select>
  <label>Value</label><input id="pcv" type="number" step="0.01" min="0.01" required><label>Max uses in total (blank = unlimited)</label><input id="pcm" type="number" min="1"><label>Valid for how many days (blank = no end)</label><input id="pcdays" type="number" min="1"><div style="height:10px"></div><button class="btn p">Create code</button></form><p class="lk">Each customer can use a code once.</p></div>
 <h3>Codes</h3>${(pc.data||[]).map(c=>`<div class="item"><span><b>${esc(c.code)}</b> · ${c.kind==="credit"?money(c.value):c.value+" coins"}<br><small class="lk">used ${c.used}${c.max_uses?"/"+c.max_uses:""} · ${c.expires_at?"until "+when(c.expires_at):"no end"}${c.active?"":" · OFF"}</small></span><button class="btn" data-a="ptoggle" data-id="${esc(c.code)}" data-on="${c.active?1:0}">${c.active?"Turn off":"Turn on"}</button></div>`).join("")||'<p class="en">No codes yet.</p>'}
 <div class="box mt"><b>👥 Referral rewards</b><form data-f="refset"><label>Coins for the person who invites</label><input id="rc" type="number" min="0" value="${esc(SE.ref_coins||"100")}"><label>Welcome coins for the invited friend</label><input id="rb" type="number" min="0" value="${esc(SE.ref_bonus||"50")}"><p class="lk">Paid once, after the friend’s first completed order of $2 or more.</p><button class="btn p">Save</button></form></div>`;
};
form.newpromo=async()=>{const n=x=>$(x).value?parseInt($(x).value):null;try{await rpc("admin_create_promo",{p_code:$("pcd").value,p_kind:$("pck").value,p_value:parseFloat($("pcv").value),p_max:n("pcm"),p_days:n("pcdays")});pop("Code created");A.route()}catch(e){pop(emsg(e))}};
act.ptoggle=el=>run("admin_toggle_promo",{p_code:el.dataset.id,p_active:el.dataset.on!=="1"},"Updated");
form.refset=async()=>{try{await rpc("admin_set_setting",{p_key:"ref_coins",p_value:$("rc").value});await rpc("admin_set_setting",{p_key:"ref_bonus",p_value:$("rb").value});pop("Saved")}catch(e){pop(emsg(e))}};

// ---------- STORE SETTINGS: one form, saves only what changed ----------
let ORIG={};
TAB.store=async()=>{
 const{data}=await sb.from("settings").select("key,value");ORIG={};(data||[]).forEach(r=>ORIG[r.key]=r.value);
 const v=k=>esc(ORIG[k]||""),t=(k,label,ph,type)=>`<label>${label}</label><input data-s="${k}" ${type?`type="${type}"`:""} value="${v(k)}" placeholder="${ph||""}">`;
 return `<form data-f="storeset">
 <div class="box mt"><b>🏪 Store</b><label class="chk"><input type="checkbox" data-s="store_open" data-bool="1" ${ORIG.store_open==="0"?"":"checked"}> <span>Store open (untick to pause all purchases)</span></label></div>
 <div class="box mt"><b>🙋 About page</b>${t("about_name","Your name or team name","")}<label>Your story (a few sentences)</label><textarea data-s="about_story" rows="4" maxlength="900">${v("about_story")}</textarea>${t("business_name","Business name (shown in About)","")}
  <label>Photo (shows round in About)</label>${ORIG.about_photo?`<img src="${v("about_photo")}" alt="" style="width:72px;height:72px;border-radius:50%;object-fit:cover;display:block;margin-bottom:6px">`:""}<input id="abf" type="file" accept="image/jpeg,image/png,image/webp"></div>
 <div class="box mt"><b>💬 Contact buttons</b>${t("contact_telegram","Telegram username","@AXTROVIII")}${t("contact_whatsapp","WhatsApp number with country code","21612345678")}${t("contact_discord","Discord invite link (https://…)","")}${t("contact_instagram","Instagram username","")}${t("response_time","Usual reply time shown to customers","within a few hours")}</div>
 <div class="box mt"><b>💱 D17 and strict payments</b>${t("telegram_bot","Telegram verification bot username (without @)","AstroVaultVerifyBot")}<label class="chk"><input type="checkbox" data-s="strict_need_phone" data-bool="1" ${ORIG.strict_need_phone==="0"?"":"checked"}> <span>Require a verified phone</span></label><label class="chk"><input type="checkbox" data-s="strict_need_selfie" data-bool="1" ${ORIG.strict_need_selfie==="0"?"":"checked"}> <span>Require a live selfie</span></label>${t("tnd_rate","TND per $1 (update to your real rate!)","3.1","number")}${t("strict_new_max","Max $ per payment for accounts under 3 days old","15","number")}${t("strict_open_orders","Open orders allowed at once (D17-funded accounts)","1","number")}${t("strict_daily_orders","Orders per 24h (D17-funded accounts)","3","number")}</div>
 <div class="box mt"><b>📦 Alerts</b>${t("low_stock","Warn me when stock falls to","3","number")}</div>
 <div class="box mt"><b>🔐 Staff security</b><label class="chk"><input type="checkbox" data-s="staff_mfa_required" data-bool="1" ${ORIG.staff_mfa_required==="1"?"checked":""}> <span>Require two-step login for all staff powers</span></label><p class="lk">Turn this on ONLY after you and your staff enabled two-step login (Account → Two-step login). Otherwise they lose access until they do.</p></div>
 <div style="height:12px"></div><button class="btn p">Save settings</button></form><p id="stm" class="au-m"></p>`;
};
form.storeset=async f=>{const el=$("stm");el.style.color="var(--mut)";el.textContent="Saving…";const changes=[];
 try{const pf=$("abf").files[0];if(pf){const url=await A.uploadImg(pf);changes.push(["about_photo",url])}}catch(e){el.style.color="#dc2626";return el.textContent="Photo upload failed: "+(e.message||e)}
 f.querySelectorAll("[data-s]").forEach(i=>{const k=i.dataset.s,val=i.dataset.bool?(i.checked?"1":"0"):i.value.trim();if((ORIG[k]||"")!==val&&!(k==="store_open"&&val==="1"&&ORIG[k]==null)&&!(k==="staff_mfa_required"&&val==="0"&&ORIG[k]==null)&&!((k==="strict_need_phone"||k==="strict_need_selfie")&&val==="1"&&ORIG[k]==null))changes.push([k,val])});
 try{for(const[k,val]of changes)await rpc("admin_set_setting",{p_key:k,p_value:val});el.textContent=changes.length?"✅ Saved "+changes.length+" change(s).":"Nothing changed.";if(changes.length)A.route()}catch(e){el.style.color="#dc2626";el.textContent=emsg(e)}};

// ---------- REPORTS & BACKUP: CSV files you can keep (the free plan has no downloadable backups) ----------
const csv=(rows,cols,name)=>{const q=v=>{let s=String(v==null?"":v);if(/^[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};   // leading ' stops spreadsheet formula tricks
 const t=[cols.join(",")].concat(rows.map(r=>cols.map(c=>q(r[c])).join(","))).join("\r\n"),b=new Blob(["\ufeff"+t],{type:"text/csv"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)};
const EXP={orders:["orders","number,product_name,price,status,user_id,buyer_input,created_at,completed_at,expires_at,admin_note"],topups:["topup_requests","amount,currency,amount_local,method,reference,sender_name,status,user_id,created_at,decided_at,credited_amount,admin_note"],
 ledger:["wallet_transactions","id,user_id,amount,kind,note,balance_after,created_at"],customers:["profiles","user_no,username,email,balance,coins,role,blocked,created_at"],audit:["audit_log","id,actor_name,action,target,details,created_at"],identities:["customer_identity","user_id,full_name,phone_display,created_at"]};
TAB.backup=async()=>`<p class="en" style="font-size:14px">Download your data as spreadsheet files. Do this <b>every week</b> and keep the files somewhere safe (Files app, Google Drive). It is your backup and your accounting record.</p>
 ${Object.keys(EXP).filter(k=>k!=="identities"||A.can("security")).map(k=>`<button class="btn mt" data-a="exp" data-k="${k}">⬇️ ${({orders:"Orders",topups:"Top-ups (payments)",ledger:"Wallet ledger",customers:"Customers & balances",audit:"Audit log",identities:"Customer identities (private)"})[k]}</button>`).join("")}
 <p class="lk mt">Automatic daily database backups are a feature of Supabase’s paid plan. Consider upgrading once the shop earns regularly.</p>`;
act.exp=async el=>{const k=el.dataset.k,[tb,cols]=EXP[k];pop("Preparing…");const{data,error}=await sb.from(tb).select(cols).order(cols.split(",").includes("created_at")?"created_at":cols.split(",")[0],{ascending:false}).range(0,4999);
 if(error)return pop("Export failed: "+error.message);csv(data||[],cols.split(","),"astrovault-"+k+"-"+new Date().toISOString().slice(0,10)+".csv");pop("✅ Downloaded "+(data||[]).length+" rows")};

// ---------- ORDERS with SEARCH (replaces the plain list) ----------
const oc=o=>`<div class="box mt"><b>#AV-${o.number} ${esc(o.product_name)}</b> ${A.pillS(o.status)} ${money(o.price)}<div class="lk">@${esc(o.profiles&&o.profiles.username)} · ${esc(o.profiles&&o.profiles.email)} · ${when(o.created_at)}</div>
 <button class="btn" data-a="ucard" data-id="${o.user_id}" style="margin:6px 0">Customer</button>${o.buyer_input?`<div class="cred">${esc(o.buyer_input)}</div>`:""}${o.admin_note?`<div class="lk">Note: ${esc(o.admin_note)}</div>`:""}
 ${o.status!=="cancelled"?`<textarea rows="2" id="d-${o.id}" placeholder="Delivery details shown to the buyer (optional)">${esc(o.delivery||"")}</textarea><div class="row mt">${o.status==="pending"?`<button class="btn" data-a="oset" data-id="${o.id}" data-s="processing">Start processing</button>`:""}<button class="btn p" data-a="oset" data-id="${o.id}" data-s="completed">${o.status==="completed"?"Save delivery":"Mark completed"}</button>${o.status==="completed"?"":`<button class="btn" data-a="ocancel" data-id="${o.id}">Cancel &amp; refund</button>`}</div>`:""}</div>`;
let OQ="";
TAB.orders=async()=>{
 let qy=sb.from("orders").select("*,profiles(username,email)").order("created_at",{ascending:false}).limit(100);const q=OQ.replace(/[^\w@.\- #]/g,"").trim();
 if(q){const num=q.replace(/^#?(AV-)?/i,""),pr=await sb.from("profiles").select("id").or(`username.ilike.%${q}%,email.ilike.%${q}%`).limit(20),ids=(pr.data||[]).map(x=>x.id),parts=[`product_name.ilike.%${q}%`];
  if(/^\d{3,}$/.test(num))parts.push(`number.eq.${num}`);if(ids.length)parts.push(`user_id.in.(${ids.join(",")})`);qy=qy.or(parts.join(","))}
 const{data,error}=await qy;if(error)throw error;
 const search=`<form data-f="osearch" class="sfind"><input id="oq" placeholder="🔎 Order number, customer or product" value="${esc(OQ)}"><button class="btn p">Search</button></form>`;
 if(q)return search+`<p class="en">${data.length} result(s) for “${esc(q)}”. <a href="#" data-a="oclear">Clear</a></p>`+data.map(oc).join("");
 const todo=data.filter(o=>o.status==="pending"||o.status==="processing"),rest=data.filter(o=>!todo.includes(o)).slice(0,20);
 return search+`<h3>Needs action (${todo.length})</h3>${todo.map(oc).join("")||'<p class="en">Nothing waiting.</p>'}<h3>Recent</h3>${rest.map(oc).join("")}`;
};
form.osearch=()=>{OQ=$("oq").value;A.route()};act.oclear=()=>{OQ="";A.route()};

// ---------- OVERVIEW: add low-stock list ----------
const oldO=TAB.overview;
if(oldO)TAB.overview=async()=>{const h=await oldO();let cat=[];try{cat=await rpc("get_catalog")}catch(e){}
 const low=(cat||[]).filter(p=>!p.coming_soon&&p.stock_left!=null&&p.stock_left<=3);
 return h+(low.length?`<div class="box mt"><h2>📉 Low stock</h2>${low.map(p=>`<p class="meta"><span>${esc(p.name)}</span><b>${p.stock_left} left</b></p>`).join("")}</div>`:"")};
})();
