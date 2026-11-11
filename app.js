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
const ERR={not_completed:"You can review an order after it is completed.",already_reviewed:"You already reviewed this order.",insufficient_coins:"Not enough AstroCoins.",method_unavailable:"That payment method isn’t available.",invalid_permission:"Unknown permission.",busy_try_again:"Busy, please try again.",invalid_setting:"Invalid setting.",has_history:"This product has orders, so it can’t be deleted. Use Hide instead.",coming_soon:"This product is not live yet.",duplicate_reference:"That transaction ID was already used.",proof_required:"Please attach a screenshot of your payment.",ticket_closed:"This ticket is closed.",already_assigned:"Someone else already picked this up.",too_many_tickets:"You have 5 open tickets. Please wait for replies.",invalid_message:"Please write a subject and a message.",not_assigned:"This ticket belongs to another agent.",invalid_status:"Invalid status.",invalid_role:"Invalid role.",not_found:"Not found.",not_authenticated:"Please log in first.",insufficient_funds:"Your balance is too low. Top up first.",out_of_stock:"Sorry, this just sold out.",product_unavailable:"This product is no longer available.",input_required:"Please fill in the required detail.",price_changed:"The price just changed. Please review it.",too_many_pending:"You already have 3 pending top-ups. Wait for approval.",invalid_amount:"Invalid amount.",invalid_reference:"Please enter the payment reference.",forbidden:"Not allowed.",already_decided:"Already handled.",not_pending:"Order is not pending.",order_cancelled:"Order was cancelled."};
const emsg=e=>ERR[e&&e.message]||(/fetch|network/i.test(e&&e.message||"")?"Network problem. Try again.":"Something went wrong. Please try again.");

// theme
const theme=localStorage.getItem("av_theme");if(theme==="light"||theme==="dark")document.documentElement.dataset.theme=theme;
$("brand").textContent=C.BRAND;document.title=C.BRAND;$("contact").textContent=C.CONTACT.label;$("contact").href=C.CONTACT.url;

const H0=location.hash;   // captured BEFORE supabase-js consumes the URL: email links return tokens or errors in the #hash
const ready=window.supabase&&/^https:\/\//.test(C.SUPABASE_URL)&&!/YOUR-/.test(C.SUPABASE_URL+C.SUPABASE_KEY);
const sb=ready?window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_KEY):null;
const S={user:null,profile:null,perms:[],catalog:[],cat:"all",q:"",pend:null,buy:null};
const RANK={customer:0,agent:1,admin:2,coowner:3,owner:4};   // mirrors _rank() in SQL; UI only, the database enforces it
const rank=()=>RANK[(S.profile&&S.profile.role)||"customer"]||0;
// Role default permissions (mirror of _role_perms() in SQL). Real permissions come from my_perms(); this is only a fallback + used by the permission editor.
const ROLEP={agent:["tickets"],admin:["tickets","assign_tickets","orders","place_orders","topups","products","users_view","wallet","coins"]};
ROLEP.coowner=ROLEP.admin.concat(["staff_manage","audit"]);ROLEP.owner=ROLEP.coowner.concat(["payments"]);
const can=p=>(S.perms||[]).includes(p);
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
  code:`<h2>Enter your code</h2><p class="en" style="font-size:14px">We sent a code to <b>${esc(PEND&&PEND.email)}</b>. Type it below, or tap the button inside the email.</p><form data-f="code" class="au-f">${f("cd","Code","text","one-time-code",'inputmode="numeric" maxlength="10"')}${go("Confirm")}</form><p class="au-sub"><a href="#" data-a="resend">Resend code</a></p>`,
  reset:`<h2>Reset password</h2><form data-f="reset" class="au-f">${f("ae","Email","email","email")}${go("Send reset link")}</form><p class="au-sub"><a href="#" data-a="auth" data-m="login">Back</a></p>`,
  newpass:`<h2>New password</h2><form data-f="newpass" class="au-f">${f("ap","New password","password","new-password",'minlength="8"')}${go("Save")}</form>`};
 modal(H+T[m]+'<p id="mm" class="au-m" role="status"></p>');const i=$("ae")||$("ap")||$("un")||$("cd");if(i)i.focus();
}
// Plain-language versions of Supabase auth errors.
const friendly=m=>/rate limit/i.test(m)?"Too many emails were sent recently. Please wait a few minutes and try again.":/invalid login/i.test(m)?"Wrong email or password. If you just signed up, confirm your email first.":/not confirmed/i.test(m)?"Please confirm your email first: enter the code we sent, or tap the button in the email.":(/token|otp/i.test(m)&&/expired|invalid/i.test(m))?"That code is wrong or expired. Tap “Resend code” for a new one.":m;
const msg=(t,bad)=>{const m=$("mm");if(m){m.textContent=t;m.style.color=bad?"#dc2626":"var(--mut)"}};
async function authSubmit(mode){
 const em=$("ae")?$("ae").value.trim():"",pw=$("ap")?$("ap").value:"",back=location.origin+location.pathname;
 if(mode==="login"&&em&&!em.includes("@"))return msg("Please log in with your email address (not your username).",true);
 msg("Working…");
 try{let r;
  if(mode=="login")r=await sb.auth.signInWithPassword({email:em,password:pw});
  else if(mode=="signup"){const un=$("un").value.trim();
   if(!/^[A-Za-z0-9_.-]{3,20}$/.test(un))return msg("Username: 3–20 letters, numbers, . _ -",true);
   if(pw!==$("ap2").value)return msg("Passwords don’t match.",true);
   r=await sb.auth.signUp({email:em,password:pw,options:{data:{username:un,terms_accepted_at:new Date().toISOString()},emailRedirectTo:back}});
   if(!r.error&&!r.data.session){PEND={email:em,type:"signup"};return authUI("code")}}
  else if(mode=="otp"){r=await sb.auth.signInWithOtp({email:em,options:{shouldCreateUser:false}});if(!r.error){PEND={email:em,type:"email"};return authUI("code")}}
  else if(mode=="code")r=await sb.auth.verifyOtp({email:PEND.email,token:$("cd").value.trim(),type:PEND.type});
  else if(mode=="reset"){r=await sb.auth.resetPasswordForEmail(em,{redirectTo:back});if(!r.error){PEND={email:em,type:"recovery"};return authUI("code")}}   // reset now uses a CODE too (needs {{ .Token }} in the Reset Password email template)
  else{r=await sb.auth.updateUser({password:pw});if(!r.error){msg("Password updated.");return setTimeout(closeModal,900)}}
  if(r.error)return msg(friendly(r.error.message),true);if(mode=="code"&&PEND&&PEND.type==="recovery"){PEND=null;return authUI("newpass")}   // code accepted -> choose a new password
  closeModal();
 }catch(e){msg("Network problem. Please try again.",true)}
}
// "Resend code": one email per minute, so people cannot burn the hourly email limit by tapping repeatedly.
let RSAT=0;
async function resendCode(){if(!PEND)return;if(Date.now()-RSAT<60000)return msg("Please wait a minute before asking for another code.",true);RSAT=Date.now();
 try{const r=PEND.type==="signup"?await sb.auth.resend({type:"signup",email:PEND.email}):PEND.type==="recovery"?await sb.auth.resetPasswordForEmail(PEND.email,{redirectTo:location.origin+location.pathname}):await sb.auth.signInWithOtp({email:PEND.email,options:{shouldCreateUser:false}});
  msg(r.error?friendly(r.error.message):"A new code is on its way.",!!r.error)}catch(e){msg("Network problem. Please try again.",true)}}
async function loadProfile(){
 let r=await sb.from("profiles").select("id,username,email,balance,role,notify_email,coins,user_no").eq("id",S.user.id).maybeSingle();
 if(r.error)r=await sb.from("profiles").select("id,username,email,balance,role,notify_email").eq("id",S.user.id).maybeSingle();   // older database without coins
 S.profile=r.data;
 try{S.perms=(await rpc("my_perms"))||[]}catch(e){S.perms=(S.profile&&ROLEP[S.profile.role])||[]}
}
async function setUser(u){if(u&&S.user&&S.user.id===u.id)return;S.user=u;S.profile=null;if(u)await loadProfile();if(window.AV&&AV.onAuth)AV.onAuth(u);chrome();route()}
// Header chips + bottom bar. Staff tab appears for agent and above (rank>=1).
function chrome(){
 const p=S.profile,bc=$("balchip"),ac=$("acct");bc.classList.toggle("hide",!S.user);bc.innerHTML=(p&&Number(p.balance)>0)?"<b>"+money(p.balance)+"</b> <span style=\"color:var(--ac)\">＋</span>":"＋ Add money";bc.title="Your wallet: tap to add money";
 $("bell").classList.toggle("hide",!S.user);ac.classList.toggle("hide",!!S.user);
 const tabs=[["shop","🛍️","Shop"],["wallet","👛","Wallet"],["orders","📦","Orders"],["support","💬","Help"],["account","👤","Account"]];
 if(S.perms.length)tabs.push(["staff","🛠️","Staff"]);
 $("bbar").innerHTML=tabs.map(t=>`<button data-go="${t[0]}"><i>${t[1]}</i>${t[2]}</button>`).join("");mark();
}
const cur=()=>{const m=/^#\/([a-z]+)/.exec(location.hash);return m&&V[m[1]]?m[1]:"shop"};
const mark=()=>document.querySelectorAll("#bbar button").forEach(b=>b.classList.toggle("on",b.dataset.go===cur()));

// ---------- shop ----------
const catLabel=id=>(C.CATEGORIES.find(c=>c.id===id)||{label:"Other"}).label;
// ---- helpers for offers: country availability, delivery speed text ----
const CC="AE AL AR AT AU AZ BA BD BE BG BH BR CA CH CL CN CO CY CZ DE DK DZ EE EG ES FI FR GB GE GR HK HR HU ID IE IL IN IQ IT JO JP KE KR KW LB LT LU LV LY MA MD MX MY NG NL NO NZ OM PE PH PK PL PT QA RO RS RU SA SD SE SG SI SK SN TH TN TR TW UA US UY VN YE ZA".split(" ");
const cname=c=>{try{return new Intl.DisplayNames(["en"],{type:"region"}).of(c)}catch(e){return c}};
const TZC={"Africa/Tunis":"TN","Africa/Algiers":"DZ","Africa/Casablanca":"MA","Africa/Cairo":"EG","Africa/Tripoli":"LY","Asia/Riyadh":"SA","Asia/Dubai":"AE","Asia/Qatar":"QA","Asia/Kuwait":"KW","Europe/Paris":"FR","Europe/London":"GB","Europe/Berlin":"DE","Europe/Madrid":"ES","Europe/Rome":"IT","Europe/Istanbul":"TR","America/New_York":"US","America/Chicago":"US","America/Los_Angeles":"US"};
S.country=localStorage.getItem("av_country")||TZC[(Intl.DateTimeFormat().resolvedOptions().timeZone)||""]||"";S.brand="";S.sub="";S.sort="";
const spd=m=>(m==null||m<=0)?"Instant":m<60?m+" min"+(m==1?"":"s"):m<1440?Math.round(m/60)+" hour"+(Math.round(m/60)==1?"":"s"):Math.round(m/1440)+" day(s)";
// Can this offer be used in the visitor's chosen country? (a guide, not enforcement: customers pick their own country)
function region(p){const L=p.region_list||[],c=S.country,m=p.region_mode||"global";
 if(m==="global")return{ok:true,short:"",text:"🌍 Worldwide"};
 const names=L.map(cname).join(", "),ok=!c||(m==="only"?L.includes(c):!L.includes(c));
 return{ok,short:ok?"":"⚠️ Not in "+cname(c),text:(m==="only"?"Only in: ":"Not available in: ")+names+(c?(ok?" · ✅ works in "+cname(c):" · ⚠️ not available in "+cname(c)):"")}}
let ST=null;
// Product picture (or a neat emoji tile if there is none / it fails to load). Only https and local assets are allowed as sources.
const safeImg=u=>/^(https:\/\/|assets\/)/.test(u||"")?u:"";
const pimg=(p,wide)=>safeImg(p.image_url)?`<div class="pimg${wide?" wide":""}"><img class="pimg-i" src="${esc(safeImg(p.image_url))}" data-e="${esc(p.icon||"📦")}" alt="${esc(p.name)}" loading="lazy"></div>`:`<div class="pimg ph${wide?" wide":""}"><span>${esc(p.icon||"📦")}</span></div>`;
document.addEventListener("error",e=>{const i=e.target;if(i&&i.tagName==="IMG"&&i.classList.contains("pimg-i")){const b=i.parentNode;b.classList.add("ph");b.innerHTML="<span>"+esc(i.dataset.e||"📦")+"</span>"}},true);   // broken image -> emoji tile
function card(p){const stock=p.stock_left,out=!p.coming_soon&&stock!=null&&stock<=0,d=(p.discount_percent||0)>0,rg=region(p),reg=p.regular_price!=null?p.regular_price:p.price;
 const was=d?reg:(p.retail_price>p.price?p.retail_price:null),sv=!d&&was?Math.round((1-p.price/was)*100):0;
 return `<button class="pcard${out||!rg.ok?" out":""}" data-a="product" data-id="${esc(p.id)}">${pimg(p)}<div class="pn">${esc(p.name)}</div><div class="pd">${esc(p.duration_label)}${p.brand?" · "+esc(p.brand):""}</div>
 <div class="pprice"><b>${money(p.price)}</b>${was?`<s class="red">${money(was)}</s>`:""}</div>
 <div class="pbd">${d?`<span class="pill hot">−${p.discount_percent}%</span>`:sv?`<span class="pill ok">−${sv}%</span>`:""}${p.trending?'<span class="pill hot">🔥 Trending</span>':""}${p.featured?'<span class="pill">⭐ Featured</span>':""}<span class="pill">${p.fulfillment==="instant"?"⚡ Instant":p.delivery_minutes>0?"🕒 "+spd(p.delivery_minutes):"🕒 On request"}</span>${p.coming_soon?'<span class="pill wait">Coming soon</span>':out?'<span class="pill no">Sold out</span>':stock!=null&&stock<=3?`<span class="pill wait">${stock} left</span>`:""}${!rg.ok?`<span class="pill no">${esc(rg.short)}</span>`:""}</div>
 <div class="pd">${p.review_count?`👍 ${Math.round(p.positive_pct)}% · `:""}${p.sold?p.sold+" sold":"New"}</div></button>`}
function shopGrid(){let l=S.catalog.filter(p=>(S.cat==="all"||p.category===S.cat)&&(!S.brand||p.brand===S.brand)&&(!S.sub||p.subcategory===S.sub)&&(!S.q||(p.name+" "+p.description+" "+(p.brand||"")).toLowerCase().includes(S.q)));
 if(S.sort==="low")l=l.slice().sort((a,b)=>a.price-b.price);else if(S.sort==="high")l=l.slice().sort((a,b)=>b.price-a.price);else if(S.sort==="best")l=l.slice().sort((a,b)=>(b.sold||0)-(a.sold||0));
 return l.length?l.map(card).join(""):'<p class="en">Nothing here yet.</p>'}
// Collapsed "Filters" box keeps the shop clean: my country, brand, type, sort.
function filterBar(){const brands=[...new Set(S.catalog.map(p=>p.brand).filter(Boolean))].sort(),subs=[...new Set(S.catalog.filter(p=>S.cat==="all"||p.category===S.cat).map(p=>p.subcategory).filter(Boolean))].sort();
 return `<details class="box filt"${S.brand||S.sub||S.sort?" open":""}><summary>Filters &amp; my country${S.country?" · "+esc(cname(S.country)):""}</summary>
 <label for="fc">My country (we show what works for you)</label><select id="fc"><option value="">Not set</option>${CC.map(c=>`<option value="${c}" ${c===S.country?"selected":""}>${esc(cname(c))}</option>`).join("")}</select>
 <label for="fb">Brand</label><select id="fb"><option value="">All brands</option>${brands.map(b=>`<option ${b===S.brand?"selected":""}>${esc(b)}</option>`).join("")}</select>
 <label for="ft">Type</label><select id="ft"><option value="">All types</option>${subs.map(b=>`<option ${b===S.sub?"selected":""}>${esc(b)}</option>`).join("")}</select>
 <label for="fs">Sort by</label><select id="fs">${[["","Recommended"],["best","Best selling"],["low","Price: low to high"],["high","Price: high to low"]].map(o=>`<option value="${o[0]}" ${o[0]===S.sort?"selected":""}>${o[1]}</option>`).join("")}</select></details>`}
document.addEventListener("change",e=>{const i=e.target.id,v=e.target.value;
 if(i==="fc"){S.country=v;try{localStorage.setItem("av_country",v)}catch(x){}}else if(i==="fb")S.brand=v;else if(i==="ft")S.sub=v;else if(i==="fs")S.sort=v;else return;
 if($("pgrid"))$("pgrid").innerHTML=shopGrid()});
async function shop(t){
 const cats=[{id:"all",label:"All"}].concat(C.CATEGORIES);
 const html=()=>`<div class="box hero">${astroPose("hello",84)}<div><b>${esc(C.BRAND)}</b><p>Subscriptions and game top-ups at friendlier prices.</p>${ST&&ST.completed>0?`<p class="lk">✅ ${ST.completed} orders completed${ST.reviews>0&&ST.positive_pct!=null?" · 👍 "+Math.round(ST.positive_pct)+"% positive":""}</p>`:""}</div></div>
 <div class="steps"><div><i>1</i><b>Add money</b><small>to your wallet</small></div><div><i>2</i><b>Pick a product</b><small>and tap Buy</small></div><div><i>3</i><b>Get it</b><small>instantly or in hours</small></div></div>${S.user||localStorage.getItem("av_seen")?"":`<div class="box" style="margin-bottom:10px"><b>New here?</b> <a href="#" data-a="how">See how it works (30 seconds)</a></div>`}
 <div class="trust"><span>🔒 Verified payments</span><span>↩️ Refund if we can’t deliver</span><span>💬 Human support</span></div><input id="sq" class="search" type="search" placeholder="Search products or brands" value="${esc(S.q)}" autocomplete="off">
 <div id="fbar">${filterBar()}</div><div class="cats" id="cats">${cats.map(c=>`<button class="chip${S.cat===c.id?" on":""}" data-a="cat" data-id="${c.id}">${esc(c.label)}</button>`).join("")}</div><div class="pgrid" id="pgrid">${shopGrid()}</div>`;
 if(S.catalog.length)paint(t,html());else paint(t,'<div class="box ctr">Loading…</div>');
 try{S.catalog=await rpc("get_catalog");try{ST=await rpc("store_stats")}catch(e){ST=null}paint(t,html())}catch(e){paint(t,`<div class="box ctr">${astroPose("fail",80)}<p>Couldn’t load the shop. ${esc(emsg(e))}</p></div>`)}
}
// OFFER PAGE (bottom sheet): price + discount, ratings, info table, details, chat + buy.
function openProduct(id,note){
 const p=S.catalog.find(x=>x.id===id);if(!p)return;const inst=p.fulfillment==="instant",stock=p.stock_left,out=!p.coming_soon&&stock!=null&&stock<=0,bal=S.profile?Number(S.profile.balance):0,need=p.price-bal,rg=region(p),d=(p.discount_percent||0)>0,reg=p.regular_price!=null?p.regular_price:p.price;
 S.buy={id,rid:uuid()};
 let btn;if(!S.user)btn='<button class="btn p" data-a="login">Log in to buy</button>';
 else if(!rg.ok)btn='<button class="btn" disabled>Not available in your country</button>';
 else if(out)btn='<button class="btn" disabled>Sold out</button>';
 else if(p.coming_soon)btn=`<button class="btn p" data-a="buy1">Buy for ${money(p.price)}</button>`;   // coming-soon: flow runs, then doBuy() explains
 else if(need>0)btn=`<button class="btn p" data-a="topup" data-need="${Math.ceil(need)}">Add ${money(need)} to buy</button>`;
 else btn=`<button class="btn p" data-a="buy1">Buy for ${money(p.price)}</button>`;
 const row=(k,v,cls)=>v?`<p class="meta"><span>${k}</span><b class="${cls||""}">${v}</b></p>`:"";
 sheet(`<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button>${safeImg(p.image_url)?pimg(p,true):""}<div class="sh-h">${safeImg(p.image_url)?"":`<div class="pi">${esc(p.icon)}</div>`}<div><b class="wt-w">${esc(p.name)}</b><div class="pd">${esc(p.duration_label)} · ${esc(catLabel(p.category))}${p.offer_no?" · Offer OF-"+p.offer_no:""}</div></div></div>
 <div class="pprice mt"><b style="font-size:28px">${money(p.price)}</b>${(d||p.retail_price>p.price)?`<s class="red">${money(d?reg:p.retail_price)}</s>`:""}${d?` <span class="pill hot">−${p.discount_percent}%${p.discount_until?" · ends "+new Date(p.discount_until).toLocaleDateString():""}</span>`:""}</div>
 <div class="pbd" style="margin:6px 0">${p.review_count?`<a href="#" class="pill ok" data-a="reviews" data-id="${p.id}">👍 ${Math.round(p.positive_pct)}% · ${p.review_count} reviews</a>`:'<span class="pill">No reviews yet</span>'}<span class="pill">${p.sold||0} sold</span>${p.trending?'<span class="pill hot">🔥 Trending</span>':""}${p.featured?'<span class="pill">⭐ Featured</span>':""}</div>
 <div class="box" style="padding:8px 12px">${row("Can be activated in",esc(rg.text),rg.ok?"":"neg")}${row("Delivery",inst?"⚡ Instant":p.delivery_minutes>0?"🕒 "+spd(p.delivery_minutes):"🕒 On request")}${p.avg_delivery_min!=null?row("Average delivery",spd(Math.round(p.avg_delivery_min))+" (recent orders)"):""}${row("Brand",esc(p.brand||""))}${row("Type",esc(p.subcategory||""))}${row("In stock",stock!=null?(stock<=0?"Sold out":stock+" available"):"Available")}${row("Orders completed",String(p.completed||0))}</div>
 <p>${esc(p.description)}</p>
 ${p.input_label?`<label for="buyin">${esc(p.input_label)}</label><input id="buyin" maxlength="200" autocomplete="off">`:""}
 ${p.terms?`<details class="mt"><summary>Terms &amp; warranty</summary><p class="en" style="font-size:14px">${esc(p.terms)}</p></details>`:""}
 ${S.user?`<p class="meta mt"><span>Your balance</span><span>${money(bal)}${need<=0?" → "+money(bal-p.price):""}</span></p>`:""}
 <p class="lk">🔒 Paid from your wallet · ↩️ Refunded if we can’t deliver · 💬 Chat with us anytime</p><p id="buymsg" class="au-m" role="status" style="color:#dc2626">${esc(note||"")}</p>
 <button class="btn" data-a="pchat" data-id="${p.id}" style="margin-bottom:8px">💬 Chat with us about this offer</button><div id="buyarea">${btn}</div>`);
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
// Two ways to add money, chosen per payment method (owner sets this in Staff > Payments):
//  AUTO  : "Pay automatically" -> exact-amount invoice (create_deposit_invoice) -> watch-deposits credits it on-chain, no screenshot.
//  PROOF : pay, then submit amount + sender name + transaction ID + screenshot; staff verify (submit_topup). Always available as fallback.
// Methods are typed (binance_pay | crypto | bank | link | manual); each type shows only the fields it needs.
let PM=[],INV=null,INVT=null,SET={};
const usable=m=>m.coming_soon||m.kind==="manual"||!!m.details;
const REFLAB={binance_pay:"Binance Pay order ID (from your receipt)",crypto:"Transaction hash (TXID)",address:"Transaction hash (TXID)",bank:"Transfer reference number",pay_id:"Payment / order ID from your receipt"};
async function wallet(t){
 if(!S.user)return paint(t,login());
 await loadProfile();chrome();clearInterval(INVT);INV=null;
 const[tx,tp,pm,st]=await Promise.all([sb.from("wallet_transactions").select("*").eq("user_id",S.user.id).order("created_at",{ascending:false}).limit(30),sb.from("topup_requests").select("*").eq("user_id",S.user.id).order("created_at",{ascending:false}).limit(10),rpc("get_payment_methods").catch(()=>[]),sb.from("settings").select("key,value")]);
 SET={};(st.data||[]).forEach(r=>SET[r.key]=r.value);
 PM=(pm||[]).filter(usable);const T=C.TOPUP,pre=S.pend||T.presets[1]||10;S.pend=null;
 if(!PM.find(m=>m.id===S.meth&&!m.coming_soon))S.meth=(PM.find(m=>!m.coming_soon)||{}).id;
 const rate=parseInt(SET.coin_redeem||"100"),coins=(S.profile&&S.profile.coins)||0,redeemable=Math.floor(coins/rate)*rate;
 paint(t,`<div class="box wal"><span class="en">Wallet balance</span><b>${money(S.profile&&S.profile.balance)}</b><span class="en" style="font-size:13px">$1 = 1.00 site balance</span></div>
 <div class="box mt coinbox"><div><b>🪙 ${coins} AstroCoins</b><div class="lk">Earn ${esc(SET.coin_earn||"2")} per $1 you spend · ${rate} coins = $1</div></div>${redeemable?`<button class="btn" data-a="redeem">Redeem ${redeemable} → ${money(redeemable/rate)}</button>`:""}</div>
 <div class="box mt"><h2>Add money</h2><p class="en" style="font-size:14px">Add money to your wallet, then spend it in the shop. Three quick steps.</p><label for="tamt">① How much? (${money(T.min)}–${money(T.max)})</label><div>${T.presets.map(a=>`<button type="button" class="chip" data-a="amt" data-v="${a}">${money(a)}</button>`).join("")}</div>
 <input id="tamt" type="number" min="${T.min}" max="${T.max}" step="0.01" value="${pre}">
 <label>② How do you want to pay?</label><div id="tmeths">${PM.map(m=>`<button type="button" class="chip${S.meth===m.id?" on":""}" data-a="meth" data-id="${esc(m.id)}" ${m.coming_soon?"disabled":""}>${esc(m.label)}${m.coming_soon?" · soon":""}</button>`).join("")||'<span class="en">No payment method is set up yet.</span>'}</div>
 <div id="tinfo" class="note"></div><div id="tauto"></div>
 <details id="tdet" class="mt"><summary id="tsum">③ I’ve paid: send proof</summary>
 <form data-f="topup"><label for="tname">Name on the payment (sender name)</label><input id="tname" maxlength="100" required autocomplete="off">
 <label for="tref" id="trlab">Reference</label><input id="tref" maxlength="200" required autocomplete="off">
 <label for="tfile">Screenshot of the payment (PNG/JPG, max 5 MB)</label><input id="tfile" type="file" accept="image/png,image/jpeg,image/webp" required>
 <div style="height:12px"></div><button class="btn p">Submit for verification</button></form></details>
 <p id="tmsg" class="au-m" role="status"></p><p class="lk">🔒 Every payment is verified before it is added. Manual proofs take ${esc(T.eta)}.</p></div>
 <h3>Top-up requests</h3>${tp.data&&tp.data.length?tp.data.map(r=>`<div class="tx"><span>${money(r.amount)} · ${esc(r.method)}<small>${when(r.created_at)}${r.admin_note?" · "+esc(r.admin_note):""}</small></span><span class="pill ${r.status==="approved"?"ok":r.status==="pending"?"wait":"no"}">${r.status==="approved"?"verified":r.status}</span></div>`).join(""):'<p class="en">None yet.</p>'}
 <h3>Activity</h3>${tx.data&&tx.data.length?tx.data.map(r=>`<div class="tx"><span>${esc(r.note||r.kind)}<small>${when(r.created_at)}</small></span><span class="${r.amount>0?"pos":"neg"}">${r.amount>0?"+":""}${money(r.amount)}</span></div>`).join(""):'<p class="en">No activity yet.</p>'}`);
 methInfo();
}
// Show the selected method: only the details its type needs (Pay ID / address+network / bank fields / link) + QR + warnings.
function methInfo(){const m=PM.find(x=>x.id===S.meth),i=$("tinfo");if(!i)return;if(!m){i.textContent="";$("tauto").innerHTML="";return}
 const meta=m.meta||{},cp=(id,txt)=>`<div class="cred" id="${id}">${esc(txt)}</div><button type="button" class="btn" data-a="copyel" data-id="${id}">Copy</button>`;let h="";
 if(m.kind==="binance_pay")h=`<p>Open Binance → <b>Pay</b> → <b>Send</b>, scan the QR or enter this Pay ID, and send in <b>USDT</b>.</p><p class="meta"><span>Binance Pay ID</span></p>${cp("c1",m.details)}${meta.name?`<p class="lk">Account name: ${esc(meta.name)}</p>`:""}`;
 else if(m.kind==="pay_id")h=`<p>Open the <b>${esc(meta.app||"payment")}</b> app, scan the QR or enter this ID, and send the amount.</p><p class="meta"><span>${esc(meta.app||"Payment")} ID</span></p>${cp("c1",m.details)}`;
 else if(m.kind==="crypto"||m.kind==="address")h=`<p class="warn">⚠️ Send only <b>${esc(meta.coin||"USDT")}</b> on the <b>${esc(meta.network||"correct")}</b> network. Anything sent on another network is lost.</p>${cp("c1",m.details)}`;
 else if(m.kind==="bank")h=`${meta.bank?`<p class="meta"><span>Bank</span><b>${esc(meta.bank)}</b></p>`:""}${meta.holder?`<p class="meta"><span>Account holder</span><b>${esc(meta.holder)}</b></p>`:""}${cp("c1",m.details)}`;
 else if(m.kind==="link"&&/^https:\/\//.test(m.details))h=`<a class="btn p" style="display:block;text-decoration:none" href="${esc(m.details)}" target="_blank" rel="noopener">Open payment page</a>`;
 if(m.image_url&&/^(assets\/|https:\/\/)/.test(m.image_url))h+=`<img class="qr" src="${esc(m.image_url)}" alt="QR code" width="190" height="190">`;
 if(m.instructions)h+=`<p class="lk">${esc(m.instructions)}</p>`;
 i.innerHTML=h;$("trlab").textContent=REFLAB[m.kind]||"Reference";
 $("tauto").innerHTML=m.auto_verify?`<button type="button" class="btn p" data-a="mkinv">Pay automatically</button><p class="lk">We give you an exact amount to send. Your wallet is credited automatically, usually within minutes. No screenshot needed.</p>`:"";
 $("tdet").open=!m.auto_verify;$("tsum").textContent=m.auto_verify?"Already paid but not credited? Send proof":"③ I’ve paid: send proof so we can add the money";
}
// Auto flow: reserve exact amount -> poll until credited / expired.
async function mkInvoice(){
 const amt=parseFloat($("tamt").value),T=C.TOPUP,el=$("tmsg");el.style.color="#dc2626";
 if(!(amt>=T.min&&amt<=T.max))return el.textContent="Amount must be between "+money(T.min)+" and "+money(T.max)+".";
 el.textContent="";clearInterval(INVT);
 try{INV=await rpc("create_deposit_invoice",{p_method:S.meth,p_amount:amt})}catch(e){return el.textContent=emsg(e)}
 $("tauto").innerHTML=`<div class="box" id="invbox" style="background:var(--soft2)"><p class="en">Send <b>exactly</b> this amount. The extra cents identify your payment:</p><div class="cred" id="invamt">${Number(INV.amount).toFixed(3)}</div><button type="button" class="btn" data-a="copyel" data-id="invamt">Copy amount</button><p id="invst" class="lk">⏳ Waiting for your payment… <span id="invt"></span></p></div>`;
 let tick=0;INVT=setInterval(async()=>{if(!INV||!$("invst"))return clearInterval(INVT);
  const left=Math.floor((new Date(INV.expires_at)-Date.now())/1000);$("invt").textContent=Math.max(0,Math.floor(left/60))+":"+String(Math.max(0,left%60)).padStart(2,"0");
  if(++tick%5&&left>0)return;
  const{data}=await sb.from("deposit_invoices").select("status").eq("id",INV.id).maybeSingle();
  if(data&&data.status==="paid"){clearInterval(INVT);INV=null;await loadProfile();chrome();pop("Deposit received! 🎉");route()}
  else if(left<=0||(data&&data.status==="expired")){clearInterval(INVT);$("invst").textContent="This invoice expired. If you already paid, send proof below."}},1000);
}
async function redeem(){const rate=parseInt(SET.coin_redeem||"100"),n=Math.floor(((S.profile&&S.profile.coins)||0)/rate)*rate;
 if(!n||!confirm("Redeem "+n+" AstroCoins for "+money(n/rate)+" wallet credit?"))return;
 try{await rpc("redeem_coins",{p_coins:n});pop("Redeemed!");await loadProfile();chrome();route()}catch(e){pop(emsg(e))}}
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
 paint(t,ORD.length?`<h2>My orders</h2><p class="lk">Pending = received · Processing = we’re working on it · Completed = delivered. Tap an order for details.</p>`+ORD.map(o=>`<button class="item" data-a="order" data-id="${o.id}"><span><b>${esc(o.product_name)}</b><br><small class="lk">#AV-${o.number} · ${when(o.created_at)} · ${money(o.price)}</small></span>${pillS(o.status)}</button>`).join(""):`<div class="box ctr">${astroPose("empty",90)}<h2>No orders yet</h2><p class="en">Your purchases will show up here.</p><button class="btn p" data-go="shop">Browse the shop</button></div>`);
}
async function openOrder(id){const o=ORD.find(x=>x.id===id);if(!o)return;
 sheet(`<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button><b class="wt-w">${esc(o.product_name)}</b><p class="lk">Order #AV-${o.number}</p><p>${pillS(o.status)} <span class="lk">${money(o.price)} · ${when(o.created_at)}</span></p>
 ${o.buyer_input?`<p class="en" style="font-size:14px">You sent: ${esc(o.buyer_input)}</p>`:""}
 ${o.delivery?`<div class="cred" id="dl">${esc(o.delivery)}</div><button class="btn" data-a="copyel" data-id="dl">Copy details</button>`:""}
 ${o.status==="pending"||o.status==="processing"?`<p class="en">We’re working on it and you’ll get a notification when it’s ready.</p>`:""}
 ${o.status==="cancelled"?`<p class="en">Cancelled. Any payment was refunded to your wallet.${o.admin_note?" Note: "+esc(o.admin_note):""}</p>`:o.admin_note?`<p class="en">Note: ${esc(o.admin_note)}</p>`:""}
 <div id="rvbox"></div><div style="height:10px"></div><button class="btn" data-a="help" data-id="${o.id}">Need help with this order?</button>`);
 if(o.status==="completed"){const{data:rv}=await sb.from("reviews").select("positive,comment").eq("order_id",o.id).maybeSingle();const bx=$("rvbox");if(!bx)return;
  bx.innerHTML=rv?`<p class="en">Your review: ${rv.positive?"👍":"👎"} ${esc(rv.comment||"")}</p>`:`<p class="en"><b>How was it?</b></p><div class="row"><button class="btn" data-a="rvpick" data-v="1">👍 Good</button><button class="btn" data-a="rvpick" data-v="0">👎 Not good</button></div><textarea id="rvc" rows="2" maxlength="500" placeholder="Optional comment"></textarea><button class="btn p" id="rvgo" data-a="rvsend" data-id="${o.id}" disabled>Send review</button>`}}

// ---------- account ----------
function account(t){
 if(!S.user)return paint(t,login());const p=S.profile||{};
 paint(t,`<div class="box"><div class="au-h">${astroAv(52)}<div><b>${esc(p.username)}</b><div class="lk">${esc(p.email)}${p.user_no?" · ID #"+p.user_no:""}</div></div></div>
 <div class="acc3"><button data-go="wallet"><b>${money(p.balance)}</b><small>Wallet · add money</small></button><button data-go="orders"><b>📦</b><small>My orders</small></button><button data-go="support"><b>💬</b><small>Get help</small></button></div></div>
 <h3>Settings</h3><div class="box"><label for="th">Appearance</label><select id="th"><option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option></select>
 <label class="chk"><input type="checkbox" id="nt" ${p.notify_email!==false?"checked":""}> <span>Email me order and support updates</span></label></div>
 <h3>Security</h3><div class="box"><p class="en" style="font-size:14px">We never ask for your password or codes. Staff will never message you first asking for them.</p><button class="btn" data-a="pw">Change password</button></div>
 <h3>Learn more</h3><div class="box row"><button class="btn" data-a="how">How it works</button><button class="btn" data-a="faq">FAQ</button><button class="btn" data-a="refunds">Refunds</button></div>
 <div style="height:10px"></div><button class="btn" data-a="logout">Log out</button>`);
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
 else if(k==="mkinv")mkInvoice();else if(k==="redeem")redeem();
 else if(k==="meth"){clearInterval(INVT);INV=null;S.meth=id;document.querySelectorAll("#tmeths .chip").forEach(c=>c.classList.toggle("on",c.dataset.id===id));methInfo()}
 else if(k==="order")openOrder(id);
 else if(k==="logout"){await sb.auth.signOut({scope:"local"});setUser(null);location.hash="#/shop"}
 else if(k==="pw")authUI("newpass");
 else if(k==="resend")resendCode();
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
window.AV={C,S,sb,$,esc,money,when,pop,copy,sheet,closeSheet,modal,closeModal,rpc,emsg,paint,route,V,rank,can,ROLEP,loadProfile,chrome,uuid,pillS,login,act:{},form:{}};
// ---------- reviews & product chat (customer actions) ----------
let RV=null;
AV.act.rvpick=el=>{RV=el.dataset.v;document.querySelectorAll("[data-a=rvpick]").forEach(b=>b.classList.toggle("p",b===el));$("rvgo").disabled=false};
AV.act.rvsend=async el=>{try{await rpc("leave_review",{p_order:el.dataset.id,p_positive:RV==="1",p_comment:($("rvc")||{}).value||null});pop("Thanks for your review!");S.catalog=[];openOrder(el.dataset.id)}catch(e){pop(emsg(e))}};
AV.act.reviews=async el=>{const p=S.catalog.find(x=>x.id===el.dataset.id);if(!p)return;let r=[];try{r=await rpc("get_reviews",{p_product:p.id,p_limit:30})||[]}catch(e){}
 sheet(`<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button><h2>Reviews</h2><p class="lk">${esc(p.name)} · ${p.review_count?Math.round(p.positive_pct)+"% positive ("+p.review_count+")":"No reviews yet"}. Only verified buyers can review.</p>${r.map(x=>`<div class="tx"><span>${x.positive?"👍":"👎"} ${esc(x.who)}<small>${esc(x.comment||"(no comment)")} · ${when(x.created_at)}</small></span></div>`).join("")||'<p class="en">No reviews yet.</p>'}<div style="height:10px"></div><button class="btn" data-a="product" data-id="${p.id}">← Back to offer</button>`)};
AV.act.pchat=el=>{const p=S.catalog.find(x=>x.id===el.dataset.id);if(!p)return;if(!S.user){closeSheet();return authUI("login")}AV.newTicket("product",null,"Question about "+p.name+(p.offer_no?" (Offer OF-"+p.offer_no+")":""))};

// ---------- boot ----------
// Start only after ALL scripts (support.js, staff.js, legal.js) have registered their screens; otherwise a page reload on #/staff or #/support
// could route before those screens exist and fall back to the shop.
function start(){
if(!ready){app.innerHTML=`<div class="box cfg ctr">${astroPose("guide",100)}<h2>Almost there</h2><p class="en">Open <b>config.js</b> and paste your Supabase URL and publishable key. Then run <b>supabase/schema.sql</b> in the Supabase SQL Editor. See NEXT_STEPS.md.</p></div>`;$("acct").classList.add("hide")}
else{chrome();route();
 // Email-link problems used to fail silently. Now: expired/used link -> clear message + fresh reset; valid recovery link -> password form.
 if(/error_description=|error_code=/.test(H0)){history.replaceState(null,"",location.pathname+"#/shop");
  setTimeout(()=>{authUI("reset");msg("That link expired or was already used (some email apps open links before you do). Enter your email to get a fresh code.",true)},500)}
 else if(/type=(signup|email|magiclink|invite)/.test(H0))setTimeout(()=>pop("✅ Email confirmed. You’re logged in."),1500);   // email link confirmed the account and logged in
 else if(/type=recovery/.test(H0))setTimeout(()=>{if($("md").classList.contains("hide"))authUI("newpass")},1500);
 sb.auth.onAuthStateChange((ev,s)=>setTimeout(()=>{if(ev==="PASSWORD_RECOVERY")authUI("newpass");setUser(s&&s.user||null)},0));}
}
if(document.readyState==="complete")start();else addEventListener("load",start);
if("serviceWorker" in navigator&&/^https?:/.test(location.protocol))addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();
