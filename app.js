/* AstroVault CORE (app.js): helpers, auth modal, shop + checkout, wallet top-up, orders, account, router.
   Other files plug in through window.AV: support.js (tickets, chat, bell) and staff.js (staff console).
   All money/permission logic lives in the database (supabase/*.sql); this file only calls RPCs and renders. Plain JS, no build step. All money logic lives in the database (supabase/schema.sql);
   this file only calls RPC functions and renders. Always esc() anything that came from the database. */
(function(){
"use strict";
const C=window.AV_CONFIG,$=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>C.CUR+(Number(n)||0).toFixed(2);
const when=d=>{try{return new Date(d).toLocaleString([],{dateStyle:"medium",timeStyle:"short"})}catch(e){return""}};
const uuid=()=>crypto.randomUUID?crypto.randomUUID():"10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
function pop(t){const p=$("pop");p.textContent=t;p.className="";void p.offsetWidth;p.className="go"}
async function copy(t){try{await navigator.clipboard.writeText(t);pop("Copied")}catch(e){pop("Copy failed")}}
const ERR={has_history:"This product has orders, so it can’t be deleted. Use Hide instead.",coming_soon:"This product is not live yet.",duplicate_reference:"That transaction ID was already used.",proof_required:"Please attach a screenshot of your payment.",ticket_closed:"This ticket is closed.",already_assigned:"Someone else already picked this up.",too_many_tickets:"You have 5 open tickets. Please wait for replies.",invalid_message:"Please write a subject and a message.",not_assigned:"This ticket belongs to another agent.",invalid_status:"Invalid status.",invalid_role:"Invalid role.",not_found:"Not found.",not_authenticated:"Please log in first.",insufficient_funds:"Your balance is too low. Top up first.",out_of_stock:"Sorry, this just sold out.",product_unavailable:"This product is no longer available.",input_required:"Please fill in the required detail.",price_changed:"The price just changed. Please review it.",too_many_pending:"You already have 3 pending top-ups. Wait for approval.",invalid_amount:"Invalid amount.",invalid_reference:"Please enter the payment reference.",forbidden:"Not allowed.",already_decided:"Already handled.",not_pending:"Order is not pending.",order_cancelled:"Order was cancelled."};
const emsg=e=>ERR[e&&e.message]||(/fetch|network/i.test(e&&e.message||"")?"Network problem. Try again.":"Something went wrong. Please try again.");

// theme
const theme=localStorage.getItem("av_theme");if(theme==="light"||theme==="dark")document.documentElement.dataset.theme=theme;
$("brand").textContent=C.BRAND;document.title=C.BRAND;$("contact").textContent=C.CONTACT.label;$("contact").href=C.CONTACT.url;

const ready=window.supabase&&/^https:\/\//.test(C.SUPABASE_URL)&&!/YOUR-/.test(C.SUPABASE_URL+C.SUPABASE_KEY);
const sb=ready?window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY):null;
const S={user:null,profile:null,catalog:[],cat:"all",q:"",pend:null,buy:null};
const RANK={customer:0,agent:1,admin:2,coowner:3,owner:4};   // mirrors _rank() in SQL; UI only, the database enforces it
const rank=()=>RANK[(S.profile&&S.profile.role)||"customer"]||0;
let tok=0;
const app=$("app");
const paint=(t,h)=>{if(t===tok)app.innerHTML=h};
const login=()=>`<div class="box ctr">${astroPose("wave",90)}<h2>Log in to continue</h2><p class="en">You need an account to use your wallet and orders.</p><button class="btn p" data-a="login">Log in / Sign up</button></div>`;
async function rpc(fn,args){const{data,error}=await sb.rpc(fn,args||{});if(error)throw error;return data}

// ---------- sheet / modal ----------
function sheet(h){let o=$("sheet");if(!o){o=document.createElement("div");o.id="sheet";o.innerHTML='<div class="sh-bd" data-sh="x"></div><div class="sh-box"></div>';document.body.appendChild(o)}o.querySelector(".sh-box").innerHTML=h;o.classList.add("on")}
function closeSheet(){const o=$("sheet");if(o){o.classList.remove("on");o.querySelector(".sh-box").innerHTML=""}}
function modal(h){$("mb").innerHTML='<button type="button" class="x" data-a="closem" aria-label="Close">×</button>'+h;$("md").classList.remove("hide")}
const closeModal=()=>$("md").classList.add("hide");

// ---------- auth ----------
let PEND=null;
function authUI(m){
 const f=(id,l,t,ac,x)=>`<label for="${id}">${l}</label><input id="${id}" type="${t}" autocomplete="${ac}" required ${x||""}>`;
 const go=t=>`<div style="height:14px"></div><button class="btn p">${t}</button>`;
 const tabs=`<div class="au-t"><button type="button" data-a="auth" data-m="login" class="${m=="login"?"on":""}">Log in</button><button type="button" data-a="auth" data-m="signup" class="${m=="signup"?"on":""}">Sign up</button></div>`;
 const H=`<div class="au-h">${astroAv(44)}<b>${esc(C.BRAND)}</b></div>`;
 const T={
  login:`${tabs}<form data-f="login" class="au-f">${f("ae","Email","email","email")}${f("ap","Password","password","current-password")}${go("Log in")}</form><p class="au-sub"><a href="#" data-a="auth" data-m="otp">Email me a code</a><a href="#" data-a="auth" data-m="reset">Forgot password?</a></p>`,
  signup:`${tabs}<form data-f="signup" class="au-f">${f("un","Username (3–20 letters/numbers)","text","username",'maxlength="20"')}${f("ae","Email","email","email")}${f("ap","Password (min 8)","password","new-password",'minlength="8"')}${f("ap2","Confirm password","password","new-password",'minlength="8"')}<label class="chk"><input type="checkbox" id="tos" required> <span>I agree to the Terms and Refund policy (links in the page footer).</span></label>${go("Send me a code")}</form>`,
  otp:`<h2>Log in with a code</h2><form data-f="otp" class="au-f">${f("ae","Email","email","email")}${go("Send code")}</form><p class="au-sub"><a href="#" data-a="auth" data-m="login">Back</a></p>`,
  code:`<h2>Enter your code</h2><p class="en" style="font-size:14px">We sent a code to <b>${esc(PEND&&PEND.email)}</b>.</p><form data-f="code" class="au-f">${f("cd","Code","text","one-time-code",'inputmode="numeric" maxlength="10"')}${go("Confirm")}</form>`,
  reset:`<h2>Reset password</h2><form data-f="reset" class="au-f">${f("ae","Email","email","email")}${go("Send reset link")}</form><p class="au-sub"><a href="#" data-a="auth" data-m="login">Back</a></p>`,
  newpass:`<h2>New password</h2><form data-f="newpass" class="au-f">${f("ap","New password","password","new-password",'minlength="8"')}${go("Save")}</form>`};
 modal(H+T[m]+'<p id="mm" class="au-m" role="status"></p>');const i=$("ae")||$("ap")||$("un")||$("cd");if(i)i.focus();
}
const msg=(t,bad)=>{const m=$("mm");if(m){m.textContent=t;m.style.color=bad?"#dc2626":"var(--mut)"}};
async function authSubmit(mode){
 const em=$("ae")?$("ae").value.trim():"",pw=$("ap")?$("ap").value:"",back=location.origin+location.pathname;msg("Working…");
 try{let r;
  if(mode=="login")r=await sb.auth.signInWithPassword({email:em,password:pw});
  else if(mode=="signup"){const un=$("un").value.trim();
   if(!/^[A-Za-z0-9_.-]{3,20}$/.test(un))return msg("Username: 3–20 letters, numbers, . _ -",true);
   if(pw!==$("ap2").value)return msg("Passwords don’t match.",true);
   r=await sb.auth.signUp({email:em,password:pw,options:{data:{username:un,terms_accepted_at:new Date().toISOString()},emailRedirectTo:back}});
   if(!r.error&&!r.data.session){PEND={email:em,type:"signup"};return authUI("code")}}
  else if(mode=="otp"){r=await sb.auth.signInWithOtp({email:em,options:{shouldCreateUser:false}});if(!r.error){PEND={email:em,type:"email"};return authUI("code")}}
  else if(mode=="code")r=await sb.auth.verifyOtp({email:PEND.email,token:$("cd").value.trim(),type:PEND.type});
  else if(mode=="reset"){r=await sb.auth.resetPasswordForEmail(em,{redirectTo:back});if(!r.error)return msg("Reset link sent. Check your email.")}
  else{r=await sb.auth.updateUser({password:pw});if(!r.error){msg("Password updated.");return setTimeout(closeModal,900)}}
  if(r.error)return msg(r.error.message,true);closeModal();
 }catch(e){msg("Network problem. Please try again.",true)}
}
async function loadProfile(){const{data}=await sb.from("profiles").select("id,username,email,balance,role,notify_email").eq("id",S.user.id).maybeSingle();S.profile=data}
async function setUser(u){if(u&&S.user&&S.user.id===u.id)return;S.user=u;S.profile=null;if(u)await loadProfile();if(window.AV&&AV.onAuth)AV.onAuth(u);chrome();route()}
// Header chips + bottom bar. Staff tab appears for agent and above (rank>=1).
function chrome(){
 const p=S.profile,bc=$("balchip"),ac=$("acct");bc.classList.toggle("hide",!S.user);bc.textContent="💳 "+money(p&&p.balance);
 $("bell").classList.toggle("hide",!S.user);ac.classList.toggle("hide",!!S.user);
 const tabs=[["shop","🛍️","Shop"],["wallet","👛","Wallet"],["orders","📦","Orders"],["support","💬","Help"],["account","👤","Account"]];
 if(rank()>=1)tabs.push(["staff","🛠️","Staff"]);
 $("bbar").innerHTML=tabs.map(t=>`<button data-go="${t[0]}"><i>${t[1]}</i>${t[2]}</button>`).join("");mark();
}
const cur=()=>{const m=/^#\/([a-z]+)/.exec(location.hash);return m&&V[m[1]]?m[1]:"shop"};
const mark=()=>document.querySelectorAll("#bbar button").forEach(b=>b.classList.toggle("on",b.dataset.go===cur()));

// ---------- shop ----------
const catLabel=id=>(C.CATEGORIES.find(c=>c.id===id)||{label:"Other"}).label;
function card(p){const inst=p.fulfillment==="instant",out=inst&&!p.stock_left&&!p.coming_soon,sv=p.retail_price>p.price?Math.round((1-p.price/p.retail_price)*100):0;
 return `<button class="pcard${out?" out":""}" data-a="product" data-id="${esc(p.id)}"><div class="pi">${esc(p.icon)}</div><div class="pn">${esc(p.name)}</div><div class="pd">${esc(p.duration_label)}</div><div class="pprice"><b>${money(p.price)}</b>${sv?`<s>${money(p.retail_price)}</s>`:""}</div><div class="pbd">${sv?`<span class="pill ok">−${sv}%</span>`:""}<span class="pill">${inst?"⚡ Instant":"🕒 On request"}</span>${p.coming_soon?'<span class="pill wait">Coming soon</span>':out?'<span class="pill no">Sold out</span>':inst&&p.stock_left<=3?`<span class="pill wait">${p.stock_left} left</span>`:""}</div></button>`}
function shopGrid(){const l=S.catalog.filter(p=>(S.cat==="all"||p.category===S.cat)&&(!S.q||(p.name+" "+p.description).toLowerCase().includes(S.q)));return l.length?l.map(card).join(""):'<p class="en">Nothing here yet.</p>'}
async function shop(t){
 const cats=[{id:"all",label:"All"}].concat(C.CATEGORIES);
 const html=()=>`<div class="box hero">${astroPose("hello",84)}<div><b>${esc(C.BRAND)}</b><p>Premium subscriptions at friendlier prices. Pay from your wallet, get it instantly or on request.</p></div></div><div class="trust"><span>🔒 Verified payments</span><span>↩️ Refund if we can’t deliver</span><span>💬 Human support</span></div><input id="sq" class="search" type="search" placeholder="Search products" value="${esc(S.q)}" autocomplete="off"><div class="cats" id="cats">${cats.map(c=>`<button class="chip${S.cat===c.id?" on":""}" data-a="cat" data-id="${c.id}">${esc(c.label)}</button>`).join("")}</div><div class="pgrid" id="pgrid">${shopGrid()}</div>`;
 if(S.catalog.length)paint(t,html());else paint(t,'<div class="box ctr">Loading…</div>');
 try{S.catalog=await rpc("get_catalog");paint(t,html())}catch(e){paint(t,`<div class="box ctr">${astroPose("fail",80)}<p>Couldn’t load the shop. ${esc(emsg(e))}</p></div>`)}
}
function openProduct(id,note){
 const p=S.catalog.find(x=>x.id===id);if(!p)return;const inst=p.fulfillment==="instant",out=inst&&!p.stock_left&&!p.coming_soon,bal=S.profile?Number(S.profile.balance):0,need=p.price-bal;
 S.buy={id,rid:uuid()};
 let btn;if(!S.user)btn='<button class="btn p" data-a="login">Log in to buy</button>';
 else if(out)btn='<button class="btn" disabled>Sold out</button>';
 else if(p.coming_soon)btn=`<button class="btn p" data-a="buy1">Buy for ${money(p.price)}</button>`;   // coming-soon: flow runs, then doBuy() explains
 else if(need>0)btn=`<button class="btn p" data-a="topup" data-need="${Math.ceil(need)}">Top up ${money(need)} to buy</button>`;
 else btn=`<button class="btn p" data-a="buy1">Buy for ${money(p.price)}</button>`;
 sheet(`<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button><div class="sh-h"><div class="pi">${esc(p.icon)}</div><div><b class="wt-w">${esc(p.name)}</b><div class="pd">${esc(p.duration_label)} · ${esc(catLabel(p.category))}</div></div></div>
 <div class="pprice mt"><b style="font-size:26px">${money(p.price)}</b>${p.retail_price>p.price?`<s>${money(p.retail_price)}</s>`:""}</div>
 <p>${esc(p.description)}</p><p class="en" style="font-size:14px">${inst?"⚡ Delivered instantly after payment.":"🕒 Processed by hand, "+(C.ETA_MANUAL||"usually within a few hours")+". Shows as Pending in Orders until done."}</p>
 ${p.input_label?`<label for="buyin">${esc(p.input_label)}</label><input id="buyin" maxlength="200" autocomplete="off">`:""}
 ${p.terms?`<details class="mt"><summary>Terms &amp; warranty</summary><p class="en" style="font-size:14px">${esc(p.terms)}</p></details>`:""}
 ${S.user?`<p class="meta mt"><span>Your balance</span><span>${money(bal)}${need<=0?" → "+money(bal-p.price):""}</span></p>`:""}
 <p id="buymsg" class="au-m" role="status" style="color:#dc2626">${esc(note||"")}</p><div id="buyarea">${btn}</div>`);
}
async function doBuy(){
 const p=S.catalog.find(x=>x.id===S.buy.id),inp=$("buyin");
 if(p.coming_soon){S.buy=null;return sheet(`<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button><div class="ctr">${astroPose("wait",100)}<h2>Coming soon</h2><p class="en">${esc(p.name)} isn’t live yet, and you have not been charged. We’ll open it very soon.</p><button class="btn p" data-a="closesheet">Back to shop</button></div>`)}$("buyarea").innerHTML='<button class="btn p" disabled>Processing…</button>';
 try{const r=await rpc("purchase",{p_product_id:p.id,p_expected_price:p.price,p_input:inp?inp.value:null,p_request_id:S.buy.rid});
  S.profile.balance=r.balance;chrome();S.buy=null;S.catalog=[];
  sheet(`<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button><div class="ctr">${astroPose("win",110)}<h2>${r.status==="completed"?"Purchased! 🎉":"Order received"}</h2></div>
  ${r.status==="completed"&&r.delivery?`<p class="en">Your details (also saved in Orders):</p><div class="cred" id="dl">${esc(r.delivery)}</div><button class="btn" data-a="copyel" data-id="dl">Copy</button>`:`<p class="en">Status: <b>Pending</b>. We’ll process it soon. Follow it in Orders or contact ${esc(C.CONTACT.label)}.</p>`}
  <div class="row mt"><button class="btn" data-a="closesheet">Keep shopping</button><button class="btn p" data-go="orders">My orders</button></div>`);
 }catch(e){const c=e&&e.message;await loadProfile();chrome();
  if(["out_of_stock","price_changed","product_unavailable","insufficient_funds"].includes(c)){try{S.catalog=await rpc("get_catalog")}catch(x){}return openProduct(p.id,emsg(e))}
  $("buymsg").textContent=emsg(e);$("buyarea").innerHTML=`<button class="btn p" data-a="buy1">Try again</button>`}
}

// ---------- wallet ----------
// Top-up = pay outside the site, then submit PROOF (amount, sender name, transaction ID, screenshot). Staff verify -> wallet credited.
// Payment methods come from the database (owner edits them in Staff > Payments), not from config.js.
let PM=[];
const usable=m=>m.coming_soon||m.kind==="manual"||!!m.details;
async function wallet(t){
 if(!S.user)return paint(t,login());
 await loadProfile();chrome();
 const[tx,tp,pm]=await Promise.all([sb.from("wallet_transactions").select("*").eq("user_id",S.user.id).order("created_at",{ascending:false}).limit(30),sb.from("topup_requests").select("*").eq("user_id",S.user.id).order("created_at",{ascending:false}).limit(10),rpc("get_payment_methods").catch(()=>[])]);
 PM=(pm||[]).filter(usable);const T=C.TOPUP,pre=S.pend||T.presets[1]||10;S.pend=null;
 if(!PM.find(m=>m.id===S.meth&&!m.coming_soon))S.meth=(PM.find(m=>!m.coming_soon)||{}).id;
 paint(t,`<div class="box wal"><span class="en">Wallet balance</span><b>${money(S.profile&&S.profile.balance)}</b><span class="en" style="font-size:13px">$1 = 1.00 site balance</span></div>
 <div class="box mt"><h2>Add funds</h2><div>${T.presets.map(a=>`<button type="button" class="chip" data-a="amt" data-v="${a}">${money(a)}</button>`).join("")}</div>
 <form data-f="topup"><label for="tamt">Amount you paid (${money(T.min)}–${money(T.max)})</label><input id="tamt" type="number" min="${T.min}" max="${T.max}" step="0.01" value="${pre}" required>
 <label>1. Choose a payment method</label><div id="tmeths">${PM.map(m=>`<button type="button" class="chip${S.meth===m.id?" on":""}" data-a="meth" data-id="${esc(m.id)}" ${m.coming_soon?"disabled":""}>${esc(m.label)}${m.coming_soon?" · soon":""}</button>`).join("")||'<span class="en">No payment method is set up yet.</span>'}</div><div id="tinfo" class="note"></div>
 <label>2. Send the payment, then give us proof</label>
 <label for="tname">Name on the payment (sender name)</label><input id="tname" maxlength="100" required autocomplete="off">
 <label for="tref">Transaction ID / reference number</label><input id="tref" maxlength="200" required autocomplete="off">
 <label for="tfile">Screenshot of the payment (PNG/JPG, max 5 MB)</label><input id="tfile" type="file" accept="image/png,image/jpeg,image/webp" required>
 <div style="height:12px"></div><button class="btn p">Submit for verification</button></form>
 <p id="tmsg" class="au-m" role="status"></p><p class="lk">We verify every payment by hand and credit your wallet, ${esc(T.eta)}. Fake or reused proofs are rejected.</p></div>
 <h3>Top-up requests</h3>${tp.data&&tp.data.length?tp.data.map(r=>`<div class="tx"><span>${money(r.amount)} · ${esc(r.method)}<small>${when(r.created_at)}${r.admin_note?" · "+esc(r.admin_note):""}</small></span><span class="pill ${r.status==="approved"?"ok":r.status==="pending"?"wait":"no"}">${r.status==="approved"?"verified":r.status}</span></div>`).join(""):'<p class="en">None yet.</p>'}
 <h3>Activity</h3>${tx.data&&tx.data.length?tx.data.map(r=>`<div class="tx"><span>${esc(r.note||r.kind)}<small>${when(r.created_at)}</small></span><span class="${r.amount>0?"pos":"neg"}">${r.amount>0?"+":""}${money(r.amount)}</span></div>`).join(""):'<p class="en">No activity yet.</p>'}`);
 methInfo();
}
function methInfo(){const m=PM.find(x=>x.id===S.meth),i=$("tinfo");if(!i)return;if(!m){i.textContent="";return}
 i.innerHTML=(m.instructions?`<p>${esc(m.instructions)}</p>`:"")+(m.kind==="address"?`<div class="cred" id="addr">${esc(m.details)}</div><button type="button" class="btn" data-a="copyel" data-id="addr">Copy address</button>`:m.kind==="link"&&/^https:\/\//.test(m.details)?`<a class="btn p" style="display:block;text-decoration:none" href="${esc(m.details)}" target="_blank" rel="noopener">Open payment page</a>`:m.details?`<div class="cred">${esc(m.details)}</div>`:"")}
// Upload screenshot to the private "proofs" bucket (folder = user id), then call submit_topup which re-checks everything server-side.
async function topupSubmit(){
 const m=PM.find(x=>x.id===S.meth),el=$("tmsg"),file=$("tfile").files[0],btn=document.querySelector('[data-f="topup"] .btn.p');
 const fail=t=>{el.textContent=t;el.style.color="#dc2626"};
 if(!m||m.coming_soon)return fail("Choose an available payment method.");
 if(!file)return fail("Please attach a screenshot of your payment.");
 if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>5242880)return fail("Screenshot must be PNG, JPG or WebP under 5 MB.");
 btn.disabled=true;el.style.color="var(--mut)";el.textContent="Uploading proof…";
 try{const ext=file.type.split("/")[1].replace("jpeg","jpg"),path=S.user.id+"/"+uuid()+"."+ext;
  const up=await sb.storage.from("proofs").upload(path,file,{contentType:file.type});if(up.error)throw up.error;
  await rpc("submit_topup",{p_amount:parseFloat($("tamt").value),p_method:m.label,p_reference:$("tref").value,p_sender:$("tname").value,p_proof:path});
  pop("Submitted. We’ll verify it soon.");route();
 }catch(x){fail(emsg(x));btn.disabled=false}
}

// ---------- orders ----------
// Status ladder shown to customers: Pending -> Processing -> Completed (or Cancelled = refunded). Order number = #AV-<number>.
const SL={pending:["Pending","wait"],processing:["Processing","wait"],completed:["Completed","ok"],cancelled:["Cancelled","no"]};
const pillS=s=>`<span class="pill ${(SL[s]||["",""])[1]}">${(SL[s]||[s])[0]}</span>`;
let ORD=[];
async function orders(t){
 if(!S.user)return paint(t,login());
 const{data,error}=await sb.from("orders").select("*").eq("user_id",S.user.id).order("created_at",{ascending:false}).limit(100);
 if(error)return paint(t,`<div class="box ctr">${astroPose("fail",80)}<p>Couldn’t load orders.</p></div>`);ORD=data;
 paint(t,ORD.length?`<h2>My orders</h2>`+ORD.map(o=>`<button class="item" data-a="order" data-id="${o.id}"><span><b>${esc(o.product_name)}</b><br><small class="lk">#AV-${o.number} · ${when(o.created_at)} · ${money(o.price)}</small></span>${pillS(o.status)}</button>`).join(""):`<div class="box ctr">${astroPose("empty",90)}<h2>No orders yet</h2><p class="en">Your purchases will show up here.</p><button class="btn p" data-go="shop">Browse the shop</button></div>`);
}
function openOrder(id){const o=ORD.find(x=>x.id===id);if(!o)return;
 sheet(`<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button><b class="wt-w">${esc(o.product_name)}</b><p class="lk">Order #AV-${o.number}</p><p>${pillS(o.status)} <span class="lk">${money(o.price)} · ${when(o.created_at)}</span></p>
 ${o.buyer_input?`<p class="en" style="font-size:14px">You sent: ${esc(o.buyer_input)}</p>`:""}
 ${o.delivery?`<div class="cred" id="dl">${esc(o.delivery)}</div><button class="btn" data-a="copyel" data-id="dl">Copy details</button>`:""}
 ${o.status==="pending"||o.status==="processing"?`<p class="en">We’re working on it and you’ll get a notification when it’s ready.</p>`:""}
 ${o.status==="cancelled"?`<p class="en">Cancelled. Any payment was refunded to your wallet.${o.admin_note?" Note: "+esc(o.admin_note):""}</p>`:o.admin_note?`<p class="en">Note: ${esc(o.admin_note)}</p>`:""}
 <div style="height:10px"></div><button class="btn" data-a="help" data-id="${o.id}">Need help with this order?</button>`)}

// ---------- account ----------
function account(t){
 if(!S.user)return paint(t,login());const p=S.profile||{};
 paint(t,`<div class="box"><div class="au-h">${astroAv(52)}<div><b>${esc(p.username)}</b><div class="lk">${esc(p.email)} · ${esc(p.role)}</div></div></div><p>Balance: <b>${money(p.balance)}</b></p>
 <label for="th">Theme</label><select id="th"><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select>
 <label><input type="checkbox" id="nt" ${p.notify_email!==false?"checked":""}> Email me order and support updates</label>
 <div style="height:14px"></div><button class="btn" data-a="pw">Change password</button><div style="height:8px"></div><button class="btn" data-a="logout">Log out</button></div>`);
 $("th").value=localStorage.getItem("av_theme")||"auto";
}

// ---------- router ----------
const V={shop,wallet,orders,account};   // support.js adds V.support, staff.js adds V.staff
async function route(){const r=cur(),t=++tok;mark();try{await V[r](t)}catch(e){console.error(e);paint(t,`<div class="box ctr">${astroPose("fail",80)}<p>Something went wrong.</p></div>`)}}
addEventListener("hashchange",()=>{closeSheet();route()});

// ---------- events ----------
document.addEventListener("click",async e=>{
 const g=e.target.closest("[data-go]");if(g){e.preventDefault();closeSheet();const to=g.dataset.go;if(cur()===to&&location.hash==="#/"+to)route();else location.hash="#/"+to;return}
 if(e.target.closest("[data-sh]")){closeSheet();return}
 if(e.target.id==="md"){closeModal();return}
 const a=e.target.closest("[data-a]");if(!a)return;const k=a.dataset.a,id=a.dataset.id;
 if(k!=="copyel"&&a.tagName==="A")e.preventDefault();
 if(k==="login"){closeSheet();authUI("login")}else if(k==="auth")authUI(a.dataset.m);else if(k==="closem")closeModal();else if(k==="closesheet")closeSheet();
 else if(k==="cat"){S.cat=id;$("pgrid").innerHTML=shopGrid();document.querySelectorAll("#cats .chip").forEach(c=>c.classList.toggle("on",c.dataset.id===id))}
 else if(k==="product")openProduct(id);
 else if(k==="topup"){S.pend=a.dataset.need;closeSheet();location.hash="#/wallet"}
 else if(k==="buy1"){const p=S.catalog.find(x=>x.id===S.buy.id),inp=$("buyin");if(inp&&!inp.value.trim()){$("buymsg").textContent="Please fill in the field above.";return}
  $("buymsg").textContent="";$("buyarea").innerHTML=`<p><b>Confirm purchase of ${esc(p.name)} for ${money(p.price)}?</b></p><div class="row"><button class="btn" data-a="buyno">Cancel</button><button class="btn p" data-a="buy2">Confirm</button></div>`}
 else if(k==="buyno")openProduct(S.buy.id);else if(k==="buy2")doBuy();
 else if(k==="copyel"){const el=$(id);if(el)copy(el.textContent)}
 else if(k==="amt")$("tamt").value=a.dataset.v;
 else if(k==="meth"){S.meth=id;document.querySelectorAll("#tmeths .chip").forEach(c=>c.classList.toggle("on",c.dataset.id===id));methInfo()}
 else if(k==="order")openOrder(id);
 else if(k==="logout"){await sb.auth.signOut({scope:"local"});setUser(null);location.hash="#/shop"}
 else if(k==="pw")authUI("newpass");
 else if(AV.act[k])AV.act[k](a,e);   // actions registered by support.js / staff.js
});
document.addEventListener("change",async e=>{if(e.target.id==="nt"){try{await rpc("set_my_notify",{p_on:e.target.checked});S.profile.notify_email=e.target.checked;pop("Saved")}catch(x){pop(emsg(x))}return}
 if(e.target.id==="th"){const v=e.target.value;localStorage.setItem("av_theme",v);if(v==="auto")delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=v}});
document.addEventListener("input",e=>{if(e.target.id==="sq"){S.q=e.target.value.trim().toLowerCase();$("pgrid").innerHTML=shopGrid()}});   // live product search
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeSheet();closeModal()}});
document.addEventListener("submit",async e=>{
 const f=e.target.closest("[data-f]");if(!f)return;e.preventDefault();const k=f.dataset.f;
 if(["login","signup","otp","code","reset","newpass"].includes(k))return authSubmit(k);
 if(k==="topup")return topupSubmit();
 if(AV.form[k])return AV.form[k](f,e);   // forms registered by support.js / staff.js
});

// ---------- plug-in API for support.js and staff.js ----------
window.AV={C,S,sb,$,esc,money,when,pop,copy,sheet,closeSheet,modal,closeModal,rpc,emsg,paint,route,V,rank,loadProfile,chrome,uuid,pillS,login,act:{},form:{}};

// ---------- boot ----------
if(!ready){app.innerHTML=`<div class="box cfg ctr">${astroPose("guide",100)}<h2>Almost there</h2><p class="en">Open <b>config.js</b> and paste your Supabase URL and publishable key. Then run <b>supabase/schema.sql</b> in the Supabase SQL Editor. See NEXT_STEPS.md.</p></div>`;$("acct").classList.add("hide")}
else{chrome();route();
 sb.auth.onAuthStateChange((ev,s)=>setTimeout(()=>{if(ev==="PASSWORD_RECOVERY")authUI("newpass");setUser(s&&s.user||null)},0));}
if("serviceWorker" in navigator&&/^https?:/.test(location.protocol))addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();
