/* AstroVault app. Plain JS, no build step. All money logic lives in the database (supabase/schema.sql);
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
const ERR={not_authenticated:"Please log in first.",insufficient_funds:"Your balance is too low. Top up first.",out_of_stock:"Sorry, this just sold out.",product_unavailable:"This product is no longer available.",input_required:"Please fill in the required detail.",price_changed:"The price just changed. Please review it.",too_many_pending:"You already have 3 pending top-ups. Wait for approval.",invalid_amount:"Invalid amount.",invalid_reference:"Please enter the payment reference.",forbidden:"Not allowed.",already_decided:"Already handled.",not_pending:"Order is not pending.",order_cancelled:"Order was cancelled."};
const emsg=e=>ERR[e&&e.message]||(/fetch|network/i.test(e&&e.message||"")?"Network problem. Try again.":"Something went wrong. Please try again.");

// theme
const theme=localStorage.getItem("av_theme");if(theme==="light"||theme==="dark")document.documentElement.dataset.theme=theme;
$("brand").textContent=C.BRAND;document.title=C.BRAND;$("contact").textContent=C.CONTACT.label;$("contact").href=C.CONTACT.url;

const ready=window.supabase&&/^https:\/\//.test(C.SUPABASE_URL)&&!/YOUR-/.test(C.SUPABASE_URL+C.SUPABASE_KEY);
const sb=ready?window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY):null;
const S={user:null,profile:null,catalog:[],cat:"all",pend:null,buy:null};
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
  signup:`${tabs}<form data-f="signup" class="au-f">${f("un","Username (3–20 letters/numbers)","text","username",'maxlength="20"')}${f("ae","Email","email","email")}${f("ap","Password (min 8)","password","new-password",'minlength="8"')}${f("ap2","Confirm password","password","new-password",'minlength="8"')}${go("Send me a code")}</form>`,
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
   r=await sb.auth.signUp({email:em,password:pw,options:{data:{username:un},emailRedirectTo:back}});
   if(!r.error&&!r.data.session){PEND={email:em,type:"signup"};return authUI("code")}}
  else if(mode=="otp"){r=await sb.auth.signInWithOtp({email:em,options:{shouldCreateUser:false}});if(!r.error){PEND={email:em,type:"email"};return authUI("code")}}
  else if(mode=="code")r=await sb.auth.verifyOtp({email:PEND.email,token:$("cd").value.trim(),type:PEND.type});
  else if(mode=="reset"){r=await sb.auth.resetPasswordForEmail(em,{redirectTo:back});if(!r.error)return msg("Reset link sent. Check your email.")}
  else{r=await sb.auth.updateUser({password:pw});if(!r.error){msg("Password updated.");return setTimeout(closeModal,900)}}
  if(r.error)return msg(r.error.message,true);closeModal();
 }catch(e){msg("Network problem. Please try again.",true)}
}
async function loadProfile(){const{data}=await sb.from("profiles").select("username,email,balance,is_admin").eq("id",S.user.id).maybeSingle();S.profile=data}
async function setUser(u){if(u&&S.user&&S.user.id===u.id)return;S.user=u;S.profile=null;if(u)await loadProfile();chrome();route()}
function chrome(){
 const p=S.profile,bc=$("balchip"),ac=$("acct");bc.classList.toggle("hide",!S.user);bc.textContent="💳 "+money(p&&p.balance);
 ac.classList.toggle("hide",!!S.user);
 const tabs=[["shop","🛍️","Shop"],["wallet","👛","Wallet"],["orders","📦","Orders"],["account","👤","Account"]];
 if(p&&p.is_admin)tabs.push(["admin","🛠️","Admin"]);
 $("bbar").innerHTML=tabs.map(t=>`<button data-go="${t[0]}"><i>${t[1]}</i>${t[2]}</button>`).join("");mark();
}
const cur=()=>{const m=/^#\/([a-z]+)/.exec(location.hash);return m&&V[m[1]]?m[1]:"shop"};
const mark=()=>document.querySelectorAll("#bbar button").forEach(b=>b.classList.toggle("on",b.dataset.go===cur()));

// ---------- shop ----------
const catLabel=id=>(C.CATEGORIES.find(c=>c.id===id)||{label:"Other"}).label;
function card(p){const inst=p.fulfillment==="instant",out=inst&&!p.stock_left,sv=p.retail_price>p.price?Math.round((1-p.price/p.retail_price)*100):0;
 return `<button class="pcard${out?" out":""}" data-a="product" data-id="${esc(p.id)}"><div class="pi">${esc(p.icon)}</div><div class="pn">${esc(p.name)}</div><div class="pd">${esc(p.duration_label)}</div><div class="pprice"><b>${money(p.price)}</b>${sv?`<s>${money(p.retail_price)}</s>`:""}</div><div class="pbd">${sv?`<span class="pill ok">−${sv}%</span>`:""}<span class="pill">${inst?"⚡ Instant":"🕒 On request"}</span>${out?'<span class="pill no">Sold out</span>':inst&&p.stock_left<=3?`<span class="pill wait">${p.stock_left} left</span>`:""}</div></button>`}
function shopGrid(){const l=S.catalog.filter(p=>S.cat==="all"||p.category===S.cat);return l.length?l.map(card).join(""):'<p class="en">Nothing here yet.</p>'}
async function shop(t){
 const cats=[{id:"all",label:"All"}].concat(C.CATEGORIES);
 const html=()=>`<div class="box hero">${astroPose("hello",84)}<div><b>${esc(C.BRAND)}</b><p>Premium subscriptions at friendlier prices. Pay from your wallet, get it instantly or on request.</p></div></div><div class="cats" id="cats">${cats.map(c=>`<button class="chip${S.cat===c.id?" on":""}" data-a="cat" data-id="${c.id}">${esc(c.label)}</button>`).join("")}</div><div class="pgrid" id="pgrid">${shopGrid()}</div>`;
 if(S.catalog.length)paint(t,html());else paint(t,'<div class="box ctr">Loading…</div>');
 try{S.catalog=await rpc("get_catalog");paint(t,html())}catch(e){paint(t,`<div class="box ctr">${astroPose("fail",80)}<p>Couldn’t load the shop. ${esc(emsg(e))}</p></div>`)}
}
function openProduct(id,note){
 const p=S.catalog.find(x=>x.id===id);if(!p)return;const inst=p.fulfillment==="instant",out=inst&&!p.stock_left,bal=S.profile?Number(S.profile.balance):0,need=p.price-bal;
 S.buy={id,rid:uuid()};
 let btn;if(!S.user)btn='<button class="btn p" data-a="login">Log in to buy</button>';
 else if(out)btn='<button class="btn" disabled>Sold out</button>';
 else if(need>0)btn=`<button class="btn p" data-a="topup" data-need="${Math.ceil(need)}">Top up ${money(need)} to buy</button>`;
 else btn=`<button class="btn p" data-a="buy1">Buy for ${money(p.price)}</button>`;
 sheet(`<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button><div class="sh-h"><div class="pi">${esc(p.icon)}</div><div><b class="wt-w">${esc(p.name)}</b><div class="pd">${esc(p.duration_label)} · ${esc(catLabel(p.category))}</div></div></div>
 <div class="pprice mt"><b style="font-size:26px">${money(p.price)}</b>${p.retail_price>p.price?`<s>${money(p.retail_price)}</s>`:""}</div>
 <p>${esc(p.description)}</p><p class="en" style="font-size:14px">${inst?"⚡ Delivered instantly after payment.":"🕒 Processed by hand. Shows as Pending in Orders until done."}</p>
 ${p.input_label?`<label for="buyin">${esc(p.input_label)}</label><input id="buyin" maxlength="200" autocomplete="off">`:""}
 ${p.terms?`<details class="mt"><summary>Terms &amp; warranty</summary><p class="en" style="font-size:14px">${esc(p.terms)}</p></details>`:""}
 ${S.user?`<p class="meta mt"><span>Your balance</span><span>${money(bal)}${need<=0?" → "+money(bal-p.price):""}</span></p>`:""}
 <p id="buymsg" class="au-m" role="status" style="color:#dc2626">${esc(note||"")}</p><div id="buyarea">${btn}</div>`);
}
async function doBuy(){
 const p=S.catalog.find(x=>x.id===S.buy.id),inp=$("buyin");$("buyarea").innerHTML='<button class="btn p" disabled>Processing…</button>';
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
const meths=()=>C.TOPUP.methods.filter(m=>m.kind==="address"?m.address:m.kind==="link"?m.url:true);
async function wallet(t){
 if(!S.user)return paint(t,login());
 await loadProfile();chrome();
 const[tx,tp]=await Promise.all([sb.from("wallet_transactions").select("*").eq("user_id",S.user.id).order("created_at",{ascending:false}).limit(30),sb.from("topup_requests").select("*").eq("user_id",S.user.id).order("created_at",{ascending:false}).limit(10)]);
 const T=C.TOPUP,pre=S.pend||T.presets[1]||10;S.pend=null;const ms=meths();if(!S.meth||!ms.find(m=>m.id===S.meth))S.meth=ms[0]&&ms[0].id;
 paint(t,`<div class="box wal"><span class="en">Wallet balance</span><b>${money(S.profile&&S.profile.balance)}</b><span class="en" style="font-size:13px">$1 = 1.00 site balance</span></div>
 <div class="box mt"><h2>Add funds</h2><div>${T.presets.map(a=>`<button type="button" class="chip" data-a="amt" data-v="${a}">${money(a)}</button>`).join("")}</div>
 <form data-f="topup"><label for="tamt">Amount (${money(T.min)}–${money(T.max)})</label><input id="tamt" type="number" min="${T.min}" max="${T.max}" step="0.01" value="${pre}" required>
 <label>Payment method</label><div id="tmeths">${ms.map(m=>`<button type="button" class="chip${S.meth===m.id?" on":""}" data-a="meth" data-id="${m.id}">${esc(m.label)}</button>`).join("")}</div><div id="tinfo" class="note"></div>
 <label for="tref" id="treflabel">Reference</label><input id="tref" maxlength="200" required autocomplete="off"><div style="height:12px"></div><button class="btn p">I’ve paid. Submit for approval</button></form>
 <p id="tmsg" class="au-m" role="status"></p><p class="lk">We credit your wallet after confirming your payment, ${esc(T.eta)}.</p></div>
 <h3>Top-up requests</h3>${tp.data&&tp.data.length?tp.data.map(r=>`<div class="tx"><span>${money(r.amount)} · ${esc(r.method)}<small>${when(r.created_at)}${r.admin_note?" · "+esc(r.admin_note):""}</small></span><span class="pill ${r.status==="approved"?"ok":r.status==="pending"?"wait":"no"}">${r.status}</span></div>`).join(""):'<p class="en">None yet.</p>'}
 <h3>Activity</h3>${tx.data&&tx.data.length?tx.data.map(r=>`<div class="tx"><span>${esc(r.note||r.kind)}<small>${when(r.created_at)}</small></span><span class="${r.amount>0?"pos":"neg"}">${r.amount>0?"+":""}${money(r.amount)}</span></div>`).join(""):'<p class="en">No activity yet.</p>'}`);
 methInfo();
}
function methInfo(){const m=meths().find(x=>x.id===S.meth),i=$("tinfo");if(!i)return;if(!m){i.textContent="No payment method is set up yet.";return}
 $("treflabel").textContent=m.refLabel||"Reference";
 i.innerHTML=m.kind==="address"?`Send to: <div class="cred" id="addr">${esc(m.address)}</div><button type="button" class="btn" data-a="copyel" data-id="addr">Copy address</button>`:m.kind==="link"?`<a class="btn p" style="display:block;text-decoration:none" href="${esc(m.url)}" target="_blank" rel="noopener">Open payment page</a>`:`Message <a href="${esc(C.CONTACT.url)}" target="_blank" rel="noopener">${esc(C.CONTACT.label)}</a> to arrange payment, then enter the name you paid with.`}

// ---------- orders ----------
const pillS=s=>`<span class="pill ${s==="completed"?"ok":s==="pending"?"wait":"no"}">${s==="completed"?"Completed":s==="pending"?"Pending":"Cancelled"}</span>`;
let ORD=[];
async function orders(t){
 if(!S.user)return paint(t,login());
 const{data,error}=await sb.from("orders").select("*").eq("user_id",S.user.id).order("created_at",{ascending:false}).limit(100);
 if(error)return paint(t,`<div class="box ctr">${astroPose("fail",80)}<p>Couldn’t load orders.</p></div>`);ORD=data;
 paint(t,ORD.length?`<h2>My orders</h2>`+ORD.map(o=>`<button class="item" data-a="order" data-id="${o.id}"><span><b>${esc(o.product_name)}</b><br><small class="lk">${when(o.created_at)} · ${money(o.price)}</small></span>${pillS(o.status)}</button>`).join(""):`<div class="box ctr">${astroPose("empty",90)}<h2>No orders yet</h2><p class="en">Your purchases will show up here.</p><button class="btn p" data-go="shop">Browse the shop</button></div>`);
}
function openOrder(id){const o=ORD.find(x=>x.id===id);if(!o)return;
 sheet(`<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button><b class="wt-w">${esc(o.product_name)}</b><p>${pillS(o.status)} <span class="lk">${money(o.price)} · ${when(o.created_at)}</span></p>
 ${o.buyer_input?`<p class="en" style="font-size:14px">You sent: ${esc(o.buyer_input)}</p>`:""}
 ${o.delivery?`<div class="cred" id="dl">${esc(o.delivery)}</div><button class="btn" data-a="copyel" data-id="dl">Copy details</button>`:""}
 ${o.status==="pending"?`<p class="en">We’re working on it. Questions? <a href="${esc(C.CONTACT.url)}" target="_blank" rel="noopener">${esc(C.CONTACT.label)}</a></p>`:""}
 ${o.status==="cancelled"?`<p class="en">Cancelled and refunded to your wallet.${o.admin_note?" Note: "+esc(o.admin_note):""}</p>`:o.admin_note?`<p class="en">Note: ${esc(o.admin_note)}</p>`:""}`)}

// ---------- account ----------
function account(t){
 if(!S.user)return paint(t,login());const p=S.profile||{};
 paint(t,`<div class="box"><div class="au-h">${astroAv(52)}<div><b>${esc(p.username)}</b><div class="lk">${esc(p.email)}</div></div></div><p>Balance: <b>${money(p.balance)}</b></p>
 <label for="th">Theme</label><select id="th"><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select>
 <div style="height:14px"></div><button class="btn" data-a="pw">Change password</button><div style="height:8px"></div><button class="btn" data-a="logout">Log out</button></div>`);
 $("th").value=localStorage.getItem("av_theme")||"auto";
}

// ---------- admin (UI only; the database enforces permissions) ----------
let AT="orders";
async function admin(t){
 if(!S.profile||!S.profile.is_admin)return paint(t,`<div class="box ctr">${astroPose("fail",80)}<p>Admins only.</p></div>`);
 const tabs=[["orders","Orders"],["topups","Top-ups"],["products","Products"],["users","Users"]];
 const head=`<div class="seg">${tabs.map(x=>`<button data-a="atab" data-id="${x[0]}" class="${AT===x[0]?"on":""}">${x[1]}</button>`).join("")}</div>`;
 let body="";
 try{
 if(AT==="orders"){const{data,error}=await sb.from("orders").select("*,profiles(username,email)").order("created_at",{ascending:false}).limit(100);if(error)throw error;
  const pend=data.filter(o=>o.status==="pending"),rest=data.filter(o=>o.status!=="pending").slice(0,15);
  const c=(o)=>`<div class="box mt"><b>${esc(o.product_name)}</b> ${pillS(o.status)} ${money(o.price)}<div class="lk">@${esc(o.profiles&&o.profiles.username)} · ${esc(o.profiles&&o.profiles.email)} · ${when(o.created_at)}</div>${o.buyer_input?`<div class="cred">${esc(o.buyer_input)}</div>`:""}
   ${o.status!=="cancelled"?`<textarea rows="2" id="d-${o.id}" placeholder="Delivery details shown to buyer">${esc(o.delivery||"")}</textarea><div class="row mt"><button class="btn p" data-a="fulfil" data-id="${o.id}">${o.status==="pending"?"Mark completed":"Save delivery"}</button>${o.status==="pending"?`<button class="btn" data-a="cancel" data-id="${o.id}">Cancel &amp; refund</button>`:""}</div>`:""}</div>`;
  body=`<h3>Pending (${pend.length})</h3>${pend.map(c).join("")||'<p class="en">Nothing pending.</p>'}<h3>Recent</h3>${rest.map(c).join("")}`}
 else if(AT==="topups"){const{data,error}=await sb.from("topup_requests").select("*,profiles(username)").order("created_at",{ascending:false}).limit(60);if(error)throw error;
  const dup=r=>data.filter(x=>x.id!==r.id&&x.reference.toLowerCase()===r.reference.toLowerCase()).length;
  body=data.map(r=>`<div class="box mt"><b>@${esc(r.profiles&&r.profiles.username)}</b> ${money(r.amount)} · ${esc(r.method)} <span class="pill ${r.status==="approved"?"ok":r.status==="pending"?"wait":"no"}">${r.status}</span><div class="lk">${when(r.created_at)}</div><div class="cred">${esc(r.reference)}</div>${dup(r)?'<p class="neg">⚠ This reference was used before.</p>':""}
   ${r.status==="pending"?`<label for="a-${r.id}">Amount to credit</label><input id="a-${r.id}" type="number" step="0.01" value="${r.amount}"><div class="row mt"><button class="btn p" data-a="approve" data-id="${r.id}">Approve</button><button class="btn" data-a="reject" data-id="${r.id}">Reject</button></div>`:r.credited_amount?`<div class="lk">Credited ${money(r.credited_amount)}</div>`:""}</div>`).join("")||'<p class="en">No top-ups.</p>'}
 else if(AT==="products"){const{data,error}=await sb.from("products").select("*").order("sort_order");if(error)throw error;
  body=`<button class="btn p" data-a="newprod">+ New product</button>`+data.map(p=>`<div class="box mt"><b>${esc(p.icon)} ${esc(p.name)}</b> <span class="pill">${p.fulfillment}</span> ${p.is_active?"":'<span class="pill no">hidden</span>'}<div class="lk">${money(p.price)} (retail ${money(p.retail_price)})</div>
   <div class="row mt"><button class="btn" data-a="toggle" data-id="${p.id}" data-on="${p.is_active?1:0}">${p.is_active?"Hide":"Show"}</button>${p.fulfillment==="instant"?`<button class="btn" data-a="stock" data-id="${p.id}">Stock</button>`:""}</div></div>`).join("")}
 else{body=`<form data-f="usearch"><label for="uq">Search username or email</label><input id="uq" required><div style="height:10px"></div><button class="btn p">Search</button></form><div id="ures"></div>`}
 }catch(e){body=`<p class="neg">Error: ${esc(e.message)}</p>`}
 paint(t,head+body);
}
async function aRun(fn,args,ok){try{await rpc(fn,args);pop(ok||"Done");route()}catch(e){pop(emsg(e))}}
function prodForm(){sheet(`<button type="button" class="x" data-a="closesheet">×</button><h2>New product</h2><form data-f="newprod">
 <label>Name</label><input id="pn" required maxlength="120"><label>Icon (emoji)</label><input id="pi" value="📦" maxlength="4">
 <label>Category</label><select id="pc">${C.CATEGORIES.map(c=>`<option value="${c.id}">${esc(c.label)}</option>`).join("")}</select>
 <label>Duration (e.g. 1 month)</label><input id="pdur"><label>Description</label><textarea id="pds" rows="2"></textarea>
 <label>Price</label><input id="ppr" type="number" step="0.01" min="0" required><label>Retail price</label><input id="prp" type="number" step="0.01" min="0">
 <label>Delivery</label><select id="pf"><option value="instant">Instant (from stock)</option><option value="manual">Manual (you fulfil)</option></select>
 <label>Ask buyer for (blank = nothing)</label><input id="pil" placeholder="Your Spotify email"><label>Terms / warranty</label><textarea id="ptm" rows="2"></textarea>
 <div style="height:12px"></div><button class="btn p">Create</button></form><p id="pmsg" class="au-m"></p>`)}
function stockUI(id){sheet(`<button type="button" class="x" data-a="closesheet">×</button><h2>Add stock</h2><p class="en" style="font-size:14px">One item per line. For multi-line items, separate items with a line containing only <code>---</code>.</p><form data-f="stock" data-id="${id}"><textarea id="sk" rows="7" required></textarea><div style="height:10px"></div><button class="btn p">Add</button></form><p id="skm" class="au-m"></p>`)}

// ---------- router ----------
const V={shop,wallet,orders,account,admin};
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
 else if(k==="about")modal(`<h2>About ${esc(C.BRAND)}</h2><p>${esc(C.BRAND)} sells digital subscriptions and upgrades. Top up your wallet, pick a product, and receive it instantly or on request.</p><p class="lk">Edit this text in app.js.</p>`);
 else if(k==="terms")modal(`<h2>Terms</h2><ul class="info-l"><li>Top-ups are credited after we confirm your payment.</li><li>Instant items are delivered once; keep your details safe.</li><li>Manual orders show as Pending until we complete them. Orders we cannot fulfil are refunded to your wallet.</li><li>Accounts and plans come from third-party services and can be changed by them; see each product’s warranty.</li></ul><p class="lk">Placeholder terms: replace with your own.</p>`);
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
 else if(k==="atab"){AT=id;route()}
 else if(k==="fulfil")aRun("admin_fulfill_order",{p_order_id:id,p_delivery:$("d-"+id).value},"Saved");
 else if(k==="cancel"){if(confirm("Cancel this order and refund the buyer?"))aRun("admin_cancel_order",{p_order_id:id},"Refunded")}
 else if(k==="approve")aRun("admin_approve_topup",{p_id:id,p_amount:parseFloat($("a-"+id).value)},"Credited");
 else if(k==="reject"){const n=prompt("Reason (optional)");if(n!==null)aRun("admin_reject_topup",{p_id:id,p_note:n},"Rejected")}
 else if(k==="toggle"){const{error}=await sb.from("products").update({is_active:a.dataset.on!=="1"}).eq("id",id);pop(error?"Failed":"Updated");route()}
 else if(k==="newprod")prodForm();else if(k==="stock")stockUI(id);
 else if(k==="adj"){const amt=parseFloat($("adjamt").value);if(!amt)return;aRun("admin_adjust_balance",{p_user_id:id,p_amount:amt,p_note:$("adjnote").value},"Balance updated")}
});
document.addEventListener("change",e=>{if(e.target.id==="th"){const v=e.target.value;localStorage.setItem("av_theme",v);if(v==="auto")delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=v}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeSheet();closeModal()}});
document.addEventListener("submit",async e=>{
 const f=e.target.closest("[data-f]");if(!f)return;e.preventDefault();const k=f.dataset.f;
 if(["login","signup","otp","code","reset","newpass"].includes(k))return authSubmit(k);
 if(k==="topup"){const m=meths().find(x=>x.id===S.meth),el=$("tmsg");if(!m){el.textContent="No payment method available.";return}
  try{await rpc("create_topup_request",{p_amount:parseFloat($("tamt").value),p_method:m.label,p_reference:$("tref").value});pop("Submitted. We’ll review it soon.");route()}catch(x){el.textContent=emsg(x);el.style.color="#dc2626"}}
 else if(k==="newprod"){const v=id=>$(id).value.trim(),slug=v("pn").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Math.random().toString(36).slice(2,6);
  const{error}=await sb.from("products").insert({slug,name:v("pn"),icon:v("pi")||"📦",category:$("pc").value,duration_label:v("pdur"),description:v("pds"),price:parseFloat($("ppr").value),retail_price:$("prp").value?parseFloat($("prp").value):null,fulfillment:$("pf").value,input_label:v("pil")||null,terms:v("ptm")});
  if(error)$("pmsg").textContent=error.message;else{closeSheet();pop("Created");route()}}
 else if(k==="stock"){const raw=$("sk").value,items=/^---\s*$/m.test(raw)?raw.split(/^---\s*$/m):raw.split("\n");
  try{const n=await rpc("admin_add_stock",{p_product_id:f.dataset.id,p_items:items.map(s=>s.trim()).filter(Boolean)});$("skm").textContent="Added "+n+" item(s).";$("sk").value=""}catch(x){$("skm").textContent=emsg(x)}}
 else if(k==="usearch"){const q=$("uq").value.replace(/[^\w@.+\- ]/g,"").trim();
  const{data,error}=await sb.from("profiles").select("id,username,email,balance").or(`username.ilike.%${q}%,email.ilike.%${q}%`).limit(10);
  $("ures").innerHTML=error?"<p class=neg>Error</p>":(data||[]).map(u=>`<div class="box mt"><b>@${esc(u.username)}</b> ${esc(u.email)}<br>Balance: <b>${money(u.balance)}</b><label for="adjamt">Adjust (+ or −)</label><input id="adjamt" type="number" step="0.01"><label for="adjnote">Note</label><input id="adjnote" maxlength="200"><div style="height:10px"></div><button class="btn p" data-a="adj" data-id="${u.id}">Apply</button></div>`).join("")||"<p class=en>No match.</p>"}
});

// ---------- boot ----------
if(!ready){app.innerHTML=`<div class="box cfg ctr">${astroPose("guide",100)}<h2>Almost there</h2><p class="en">Open <b>config.js</b> and paste your Supabase URL and publishable key. Then run <b>supabase/schema.sql</b> in the Supabase SQL Editor. See NEXT_STEPS.md.</p></div>`;$("acct").classList.add("hide")}
else{chrome();route();
 sb.auth.onAuthStateChange((ev,s)=>setTimeout(()=>{if(ev==="PASSWORD_RECOVERY")authUI("newpass");setUser(s&&s.user||null)},0));}
if("serviceWorker" in navigator&&/^https?:/.test(location.protocol))addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();
