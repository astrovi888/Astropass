/* AstroVault ACCOUNTS (accounts.js): admin "Test accounts" maker (Staff tab), and for every user: change @username, add / change email.
   Needs Supabase/schema_v13.sql and the auth-helper edge function. Admin actions are re-checked server side. */
(function(){
"use strict";
const A=window.AV;if(!A||!A.sb)return;
const {sb,$,esc,money,when,pop,sheet,closeSheet,emsg,S,V,act,form,AHF}=A;
const X='<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button>';
const ER={bad_username:"Username: 3 to 20 letters, numbers, . _ -",username_taken:"That @username is taken.",too_soon:"You can change your @username once every 7 days.",not_logged_in:"Please log in."};
const err=e=>ER[(e&&e.message)||""]||emsg(e);
const tok=async()=>{const{data}=await sb.auth.getSession();return data&&data.session?data.session.access_token:null};

// ---- starter-account flag for the Account page ----
const base=V.account;
V.account=async function(t){if(S.user&&S.profile&&S.profile.temp_account===undefined){try{const{data}=await sb.from("profiles").select("temp_account").eq("id",S.user.id).maybeSingle();if(data)S.profile.temp_account=!!data.temp_account}catch(e){}}return base.apply(this,arguments)};

// ---- change @username ----
act.uname=()=>sheet(`${X}<h2>Change @username</h2><p class="lk">3 to 20 letters, numbers, dot, dash or underscore. People find you by this name.</p><form data-f="uname"><label for="nun">New @username</label><input id="nun" required maxlength="21" autocapitalize="none" spellcheck="false" value="${esc((S.profile||{}).username||"")}"><div style="height:10px"></div><button class="btn p">Save</button></form>`);
form.uname=async()=>{try{const{error}=await sb.rpc("change_username",{p_new:$("nun").value});if(error)throw error;await A.loadProfile();A.chrome();closeSheet();pop("Username updated");A.route()}catch(e){pop(err(e))}};
// ---- add / change email (Supabase sends a confirmation link to the NEW address; nothing changes until they confirm) ----
act.email=()=>sheet(`${X}<h2>${(S.profile||{}).temp_account?"Add your email":"Change email"}</h2><p class="lk">We’ll send a confirmation link to the new address. Your login email changes only after you tap it. Use it, or your @username, to log in.</p><form data-f="email"><label for="nem">Email</label><input id="nem" type="email" required autocomplete="email"><div style="height:10px"></div><button class="btn p">Send confirmation</button></form>`);
form.email=async()=>{try{const{error}=await sb.auth.updateUser({email:$("nem").value.trim()},{emailRedirectTo:location.origin+location.pathname});if(error)throw error;closeSheet();pop("Check your inbox and tap the link")}catch(e){pop(emsg(e))}};

// ---- Staff tab: Test accounts ----
const msgFor=(u,p)=>`AstroVault login\nUsername: ${u}\nPassword: ${p}\nOpen: ${location.origin+location.pathname}\nAfter logging in: Account → change your password, add your email and pick your own @username.`;
const card=(u,p,k)=>`<div class="box mt" style="border-color:var(--das)"><b>✅ ${k||"Account ready"}</b><div class="cpy"><span><small>Username</small><code id="tu">${esc(u)}</code></span><button type="button" data-a="copyel" data-id="tu">Copy</button></div><div class="cpy"><span><small>Password</small><code id="tp">${esc(p)}</code></span><button type="button" data-a="copyel" data-id="tp">Copy</button></div><button class="btn" data-cp="${esc(msgFor(u,p))}">Copy full login message</button></div>`;
if(A.TAB&&A.TABS){A.TABS.push(["testacc","Test accounts","users_view","🧪","Make logins for testers and friends"]);
 A.TAB.testacc=async()=>{const r=await AHF("admin_list",{},await tok());const rows=(r.rows||[]).map(x=>`<div class="item"><span><b>@${esc(x.username)}</b><br><small class="lk">${money(x.balance)} · ${when(x.created_at)}</small></span><span class="row" style="gap:6px"><button class="btn" data-a="tareset" data-id="${esc(x.id)}">New password</button><button class="btn" data-a="tadel" data-id="${esc(x.id)}" data-n="${esc(x.username)}">Delete</button></span></div>`).join("");
  return `<div class="box"><b>Create a login</b><p class="lk">No email or phone needed. The person can later change the password, add their own email and rename themselves.</p><form data-f="tanew"><label for="tau">@username (blank = random)</label><input id="tau" maxlength="20" autocapitalize="none"><label for="tap">Password (blank = generated)</label><input id="tap" maxlength="40" autocapitalize="none"><div style="height:10px"></div><button class="btn p">Create account</button></form></div><div id="tares"></div><h3>Test accounts</h3>${rows||'<p class="lk">None yet.</p>'}<p class="lk">Add wallet money with the normal Staff wallet adjustment. Identity checks (phone, selfie) still apply on D17-type payment methods.</p>`};
 form.tanew=async()=>{const r=await AHF("admin_create",{username:$("tau").value,password:$("tap").value},await tok());if(!r.ok||!r.username)return pop(({username_taken:"That @username is taken",bad_input:"Check username (3-20 chars) and password (min 8)",forbidden:"Admins only"})[r.error]||"Could not create the account (is the auth-helper function deployed?)");
  $("tares").innerHTML=card(r.username,r.password,"Account created. Copy it now: the password is not shown again.");pop("Created")};
 act.tareset=async el=>{const r=await AHF("admin_reset",{user_id:el.dataset.id},await tok());if(!r.ok||!r.password)return pop("Could not reset");sheet(`${X}<h2>New password</h2><div class="cpy"><span><code id="np">${esc(r.password)}</code></span><button type="button" data-a="copyel" data-id="np">Copy</button></div>`)};
 act.tadel=async el=>{if(!confirm("Delete @"+el.dataset.n+" for good?"))return;const r=await AHF("admin_delete",{user_id:el.dataset.id},await tok());pop(r.ok?"Deleted":"Could not delete");A.route()}}
})();
