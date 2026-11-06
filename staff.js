/* AstroVault STAFF CONSOLE (staff.js): everything the team uses, shown by role.
   agent: Queue | admin: + Orders, Top-ups, Products, Users | coowner: + Team (roles, audit log) | owner: + Payments.
   The UI only HIDES tabs. Real permission checks are in the database (RLS + is_admin()/my_rank() inside each RPC),
   so a customer who edits this file in devtools still cannot do anything. Plugs in via window.AV like support.js. */
(function(){
"use strict";
const A=window.AV;if(!A||!A.sb)return;
const {S,sb,$,esc,money,when,pop,sheet,closeSheet,rpc,emsg,paint,V,act,form}=A;
const X='<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button>';
const RK={customer:0,agent:1,admin:2,coowner:3,owner:4};
const TABS=[["overview","Overview",2],["queue","Queue",1],["orders","Orders",2],["topups","Top-ups",2],["products","Products",2],["users","Users",2],["team","Team",3],["pay","Payments",4]];
const pillT=s=>`<span class="pill ${s==="approved"?"ok":s==="pending"?"wait":"no"}">${s==="approved"?"verified":s}</span>`;

// ---------- shell: tab bar with live "needs attention" counts ----------
V.staff=async t=>{
 if(A.rank()<1)return paint(t,`<div class="box ctr">${astroPose("fail",80)}<p>Staff only.</p></div>`);
 const tabs=TABS.filter(x=>A.rank()>=x[2]);if(!tabs.find(x=>x[0]===A.staffTab))A.staffTab=A.rank()>=2?"overview":"queue";
 const head=n=>`<div class="seg">${tabs.map(x=>`<button data-a="stab" data-id="${x[0]}" class="${A.staffTab===x[0]?"on":""}">${x[1]}${n[x[0]]?` (${n[x[0]]})`:""}</button>`).join("")}</div>`;
 const cnt=q=>q.then(r=>r.count||0,()=>0);
 const n={queue:await cnt(sb.from("tickets").select("id",{count:"exact",head:true}).is("assigned_to",null).in("status",["open","pending"]))};
 if(A.rank()>=2){n.orders=await cnt(sb.from("orders").select("id",{count:"exact",head:true}).in("status",["pending","processing"]));
  n.topups=await cnt(sb.from("topup_requests").select("id",{count:"exact",head:true}).eq("status","pending"))}
 let body;try{body=await TAB[A.staffTab]()}catch(e){body=`<p class="neg">Error: ${esc(e.message)}</p>`}
 paint(t,head(n)+body);
};
act.stab=el=>{A.staffTab=el.dataset.id;A.route()};
const run=async(fn,args,ok)=>{try{await rpc(fn,args);pop(ok||"Done");closeSheet();A.route()}catch(e){pop(emsg(e))}};
const TAB={};

// ---------- OVERVIEW (admin+): money snapshot, overdue work, launch checklist ----------
// Numbers are computed in the browser from the last 30 days: fine for a family-size store; move to SQL views if it grows.
TAB.overview=async()=>{
 const now=Date.now(),H=h=>now-h*36e5,mid=new Date();mid.setHours(0,0,0,0);
 const[ord,top,tk,bal,cat,pm]=await Promise.all([
  sb.from("orders").select("price,status,created_at").neq("status","cancelled").gte("created_at",new Date(now-30*864e5).toISOString()).limit(2000),
  sb.from("topup_requests").select("amount,created_at").eq("status","pending"),
  sb.from("tickets").select("created_at").is("assigned_to",null).in("status",["open","pending"]),
  sb.from("profiles").select("balance").limit(5000),rpc("get_catalog"),rpc("get_payment_methods").catch(()=>[])]);
 const sum=a=>(a||[]).reduce((t,x)=>t+Number(x.price||x.amount||x.balance||0),0),o=ord.data||[];
 const today=o.filter(x=>new Date(x.created_at)>=mid),late=(a,h)=>(a||[]).filter(x=>new Date(x.created_at).getTime()<H(h)).length;
 const lateO=o.filter(x=>(x.status==="pending"||x.status==="processing")&&new Date(x.created_at).getTime()<H(24)).length,lateT=late(top.data,12),lateK=late(tk.data,1);
 const live=(cat||[]).filter(p=>!p.coming_soon),noStock=live.filter(p=>p.fulfillment==="instant"&&!p.stock_left).map(p=>p.name);
 const chk=(ok,t)=>`<p class="meta"><span>${ok?"✅":"⚠️"} ${t}</span></p>`;
 return `<div class="box mt"><h2>Sales</h2><p class="meta"><span>Today</span><b>${money(sum(today))} · ${today.length} orders</b></p><p class="meta"><span>Last 30 days</span><b>${money(sum(o))} · ${o.length} orders</b></p>
  <p class="meta"><span>Customers' wallet balances (money you owe in service)</span><b>${money(sum(bal.data))}</b></p><p class="meta"><span>Top-ups waiting for verification</span><b>${money(sum(top.data))}</b></p></div>
  <div class="box mt"><h2>Needs attention</h2>${chk(!lateO,lateO?lateO+" order(s) open for more than 24h":"No overdue orders")}${chk(!lateT,lateT?lateT+" top-up(s) waiting more than 12h":"No overdue top-ups")}${chk(!lateK,lateK?lateK+" ticket(s) unclaimed for more than 1h":"No unclaimed tickets")}</div>
  <div class="box mt"><h2>Launch checklist</h2>${chk((pm||[]).some(m=>!m.coming_soon&&m.details),"A payment method has real details (Payments tab, owner)")}${chk(live.length>0,live.length?live.length+" product(s) live":"No product is live yet (Products > Go live)")}${chk(!noStock.length,noStock.length?"Live but out of stock: "+esc(noStock.join(", ")):"Every live instant product has stock")}</div>`;
};

// ---------- QUEUE: support tickets (agent+) ----------
TAB.queue=async()=>{
 const{data,error}=await sb.from("tickets").select("*").in("status",["open","pending"]).order("last_message_at");if(error)throw error;
 const me=S.user.id,row=k=>`<div class="item"><span><b>#${k.number} ${esc(k.subject)}</b><br><small class="lk">${esc(k.customer_name)} · ${esc(k.category)} · ${when(k.last_message_at)}${k.assigned_name?" · "+esc(k.assigned_name):""}</small></span>
  <span>${k.assigned_to?"":`<button class="btn p" data-a="qclaim" data-id="${k.id}">Claim</button> `}<button class="btn" data-a="openticket" data-id="${k.id}">Open</button></span></div>`;
 const un=data.filter(k=>!k.assigned_to),mine=data.filter(k=>k.assigned_to===me),oth=data.filter(k=>k.assigned_to&&k.assigned_to!==me);
 return `<h3>Unassigned (${un.length})</h3>${un.map(row).join("")||'<p class="en">Queue is empty. 🎉</p>'}<h3>Mine (${mine.length})</h3>${mine.map(row).join("")||'<p class="en">None.</p>'}<h3>With others (${oth.length})</h3>${oth.map(row).join("")||'<p class="en">None.</p>'}`;
};
act.qclaim=async el=>{try{await rpc("claim_ticket",{p_ticket:el.dataset.id});A.openTicket(el.dataset.id)}catch(e){pop(emsg(e));A.route()}};

// ---------- ORDERS (admin+): pending -> processing -> completed, or cancel + refund ----------
TAB.orders=async()=>{
 const{data,error}=await sb.from("orders").select("*,profiles(username,email)").order("created_at",{ascending:false}).limit(100);if(error)throw error;
 const card=o=>`<div class="box mt"><b>#AV-${o.number} ${esc(o.product_name)}</b> ${A.pillS(o.status)} ${money(o.price)}
  <div class="lk">@${esc(o.profiles&&o.profiles.username)} · ${esc(o.profiles&&o.profiles.email)} · ${when(o.created_at)}</div>
  ${o.buyer_input?`<div class="cred">${esc(o.buyer_input)}</div>`:""}${o.admin_note?`<div class="lk">Note: ${esc(o.admin_note)}</div>`:""}
  ${o.status!=="cancelled"?`<textarea rows="2" id="d-${o.id}" placeholder="Delivery details shown to the buyer (optional)">${esc(o.delivery||"")}</textarea><div class="row mt">
  ${o.status==="pending"?`<button class="btn" data-a="oset" data-id="${o.id}" data-s="processing">Start processing</button>`:""}
  <button class="btn p" data-a="oset" data-id="${o.id}" data-s="completed">${o.status==="completed"?"Save delivery":"Mark completed"}</button>
  ${o.status==="completed"?"":`<button class="btn" data-a="ocancel" data-id="${o.id}">Cancel &amp; refund</button>`}</div>`:""}</div>`;
 const todo=data.filter(o=>o.status==="pending"||o.status==="processing"),rest=data.filter(o=>!todo.includes(o)).slice(0,20);
 return `<h3>Needs action (${todo.length})</h3>${todo.map(card).join("")||'<p class="en">Nothing waiting.</p>'}<h3>Recent</h3>${rest.map(card).join("")}`;
};
act.oset=el=>run("admin_set_order",{p_order_id:el.dataset.id,p_status:el.dataset.s,p_delivery:($("d-"+el.dataset.id)||{}).value||null},"Order updated");
act.ocancel=el=>{if(confirm("Cancel this order and refund the buyer?"))run("admin_cancel_order",{p_order_id:el.dataset.id},"Cancelled and refunded")};

// ---------- TOP-UPS (admin+): verify name + transaction ID + screenshot, then credit ----------
TAB.topups=async()=>{
 const{data,error}=await sb.from("topup_requests").select("*,profiles(username,email)").order("created_at",{ascending:false}).limit(60);if(error)throw error;
 const dup=r=>data.some(x=>x.id!==r.id&&x.reference.toLowerCase()===r.reference.toLowerCase());
 const card=r=>`<div class="box mt"><b>@${esc(r.profiles&&r.profiles.username)}</b> claims ${money(r.amount)} via ${esc(r.method)} ${pillT(r.status)}
  <div class="lk">${esc(r.profiles&&r.profiles.email)} · ${when(r.created_at)}</div>
  <p class="meta"><span>Sender name</span><span>${esc(r.sender_name||"—")}</span></p><p class="meta"><span>Transaction ID</span><span>${esc(r.reference)}</span></p>
  ${dup(r)?'<p class="neg">⚠ This transaction ID appears more than once.</p>':""}
  <button class="btn" data-a="proof" data-p="${esc(r.proof_path||"")}">View screenshot</button>
  ${r.status==="pending"?`<label for="a-${r.id}">Amount that actually arrived</label><input id="a-${r.id}" type="number" step="0.01" value="${r.amount}">
   <div class="row mt"><button class="btn p" data-a="tapprove" data-id="${r.id}">Verify &amp; credit</button><button class="btn" data-a="treject" data-id="${r.id}">Reject</button></div>`
   :`<div class="lk">${r.credited_amount?"Credited "+money(r.credited_amount):""} ${esc(r.admin_note||"")}</div>`}</div>`;
 const pend=data.filter(r=>r.status==="pending");
 return `<h3>To verify (${pend.length})</h3>${pend.map(card).join("")||'<p class="en">Nothing to verify.</p>'}<h3>History</h3>${data.filter(r=>r.status!=="pending").slice(0,20).map(card).join("")}`;
};
act.proof=async el=>{const p=el.dataset.p;if(!p)return pop("No screenshot");
 const{data,error}=await sb.storage.from("proofs").createSignedUrl(p,120);       // private bucket: short-lived link
 if(error)return pop("Can’t open screenshot");sheet(`${X}<img src="${esc(data.signedUrl)}" alt="Payment proof" style="max-width:100%;border-radius:10px">`)};
act.tapprove=el=>run("admin_approve_topup",{p_id:el.dataset.id,p_amount:parseFloat($("a-"+el.dataset.id).value)},"Verified and credited");
act.treject=el=>{const n=prompt("Reason shown to the customer (optional)");if(n!==null)run("admin_reject_topup",{p_id:el.dataset.id,p_note:n},"Rejected")};

// ---------- PRODUCTS (admin+): go live, hide, price, stock, create ----------
let PRODS=[];
TAB.products=async()=>{
 const{data,error}=await sb.from("products").select("*").order("sort_order");if(error)throw error;PRODS=data;
 return `<button class="btn p" data-a="newprod">+ New product</button>`+data.map(p=>`<div class="box mt"><b>${esc(p.icon)} ${esc(p.name)}</b> <span class="pill">${p.fulfillment}</span> ${p.coming_soon?'<span class="pill wait">coming soon</span>':'<span class="pill ok">live</span>'} ${p.is_active?"":'<span class="pill no">hidden</span>'}
  <div class="lk">${money(p.price)} (retail ${money(p.retail_price)})</div><div class="row mt">
  <button class="btn" data-a="plive" data-id="${p.id}" data-v="${p.coming_soon?1:0}">${p.coming_soon?"Go live":"Set coming soon"}</button>
  <button class="btn" data-a="pedit" data-id="${p.id}">Edit</button><button class="btn" data-a="pprice" data-id="${p.id}">Price</button>
  <button class="btn" data-a="pvis" data-id="${p.id}" data-v="${p.is_active?1:0}">${p.is_active?"Hide":"Show"}</button>
  ${p.fulfillment==="instant"?`<button class="btn" data-a="pstock" data-id="${p.id}">Stock</button>`:""}<button class="btn" data-a="pdel" data-id="${p.id}">Delete</button></div></div>`).join("");
};
const upd=async(id,patch)=>{const{error}=await sb.from("products").update(patch).eq("id",id);pop(error?"Failed: "+error.message:"Saved");A.route()};
act.plive=el=>upd(el.dataset.id,{coming_soon:el.dataset.v!=="1"});
act.pvis=el=>upd(el.dataset.id,{is_active:el.dataset.v!=="1"});
act.pprice=el=>{const v=parseFloat(prompt("New price (USD)"));if(v>=0)upd(el.dataset.id,{price:v})};
// One form for BOTH new and edit (data-id empty = new). Slug is generated once and never changes on edit.
const pform=p=>{p=p||{icon:"📦",category:A.C.CATEGORIES[0].id,fulfillment:"instant",coming_soon:true};
 const cats=A.C.CATEGORIES.concat(A.C.CATEGORIES.find(c=>c.id===p.category)?[]:[{id:p.category,label:p.category}]);
 sheet(`${X}<h2>${p.id?"Edit":"New"} product</h2><form data-f="prod" data-id="${p.id||""}"><label>Name</label><input id="pn" required maxlength="120" value="${esc(p.name||"")}">
 <label>Icon (emoji)</label><input id="pi" value="${esc(p.icon||"📦")}" maxlength="4"><label>Category</label><select id="pc">${cats.map(c=>`<option value="${esc(c.id)}" ${c.id===p.category?"selected":""}>${esc(c.label)}</option>`).join("")}</select>
 <label>Duration (e.g. 1 month)</label><input id="pdur" value="${esc(p.duration_label||"")}"><label>Description</label><textarea id="pds" rows="2">${esc(p.description||"")}</textarea>
 <label>Price (USD)</label><input id="ppr" type="number" step="0.01" min="0" required value="${p.price==null?"":p.price}"><label>Retail price (shown crossed out)</label><input id="prp" type="number" step="0.01" min="0" value="${p.retail_price==null?"":p.retail_price}">
 <label>Delivery</label><select id="pf"><option value="instant" ${p.fulfillment==="instant"?"selected":""}>Instant (from stock)</option><option value="manual" ${p.fulfillment==="manual"?"selected":""}>Manual (you fulfil)</option></select>
 <label>Ask buyer for (blank = nothing)</label><input id="pil" placeholder="Your Spotify email" value="${esc(p.input_label||"")}"><label>Terms / warranty</label><textarea id="ptm" rows="2">${esc(p.terms||"")}</textarea>
 <label>Sort order (small = first)</label><input id="pso" type="number" value="${p.sort_order==null?100:p.sort_order}">
 <label><input type="checkbox" id="pcs" ${p.coming_soon?"checked":""}> Coming soon (not purchasable yet)</label><label><input type="checkbox" id="pac" ${p.is_active===false?"":"checked"}> Visible in shop</label>
 <div style="height:12px"></div><button class="btn p">${p.id?"Save changes":"Create"}</button></form><p id="pmsg" class="au-m" style="color:#dc2626"></p>`)};
act.newprod=()=>pform();
act.pedit=el=>pform(PRODS.find(p=>p.id===el.dataset.id));
form.prod=async f=>{const v=id=>$(id).value.trim(),id=f.dataset.id;
 const row={name:v("pn"),icon:v("pi")||"📦",category:$("pc").value,duration_label:v("pdur"),description:v("pds"),price:parseFloat($("ppr").value),retail_price:$("prp").value?parseFloat($("prp").value):null,fulfillment:$("pf").value,input_label:v("pil")||null,terms:v("ptm"),sort_order:parseInt($("pso").value)||100,coming_soon:$("pcs").checked,is_active:$("pac").checked};
 if(!id)row.slug=(row.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"item")+"-"+Math.random().toString(36).slice(2,6);
 const{error}=id?await sb.from("products").update(row).eq("id",id):await sb.from("products").insert(row);
 if(error)$("pmsg").textContent=error.message;else{closeSheet();pop(id?"Saved":"Created");A.route()}};
// Delete is refused by the database if the product has orders or sold stock (history must stay): hide it instead.
act.pdel=async el=>{const p=PRODS.find(x=>x.id===el.dataset.id);if(!confirm('Delete "'+p.name+'" and its unsold stock? This cannot be undone.'))return;
 try{await rpc("admin_delete_product",{p_id:p.id});pop("Deleted");A.route()}catch(e){pop(emsg(e))}};
// Stock: see unsold items (credentials visible to admins only), add in bulk, delete single items.
act.pstock=async el=>{const id=el.dataset.id,{data}=await sb.from("inventory_stock").select("id,payload").eq("product_id",id).eq("status","available").order("created_at").limit(100);
 sheet(`${X}<h2>Stock</h2><p class="en" style="font-size:14px">Available now: <b>${(data||[]).length}</b>. Add items below: one per line, or separate multi-line items with a line containing only <code>---</code>.</p>
 <form data-f="stock" data-id="${id}"><textarea id="sk" rows="5" required></textarea><div style="height:10px"></div><button class="btn p">Add to stock</button></form><p id="skm" class="au-m"></p>
 <h3>Unsold items</h3>${(data||[]).map(x=>`<div class="tx"><span class="cred" style="margin:0;flex:1;max-height:80px;overflow:auto">${esc(x.payload)}</span><button class="btn" data-a="sdel" data-id="${x.id}" data-p="${id}">Delete</button></div>`).join("")||'<p class="en">None.</p>'}`)};
act.sdel=async el=>{const{error}=await sb.from("inventory_stock").delete().eq("id",el.dataset.id).eq("status","available");pop(error?"Failed":"Removed");act.pstock({dataset:{id:el.dataset.p}})};
form.stock=async f=>{const raw=$("sk").value,items=/^---\s*$/m.test(raw)?raw.split(/^---\s*$/m):raw.split("\n");
 try{const n=await rpc("admin_add_stock",{p_product_id:f.dataset.id,p_items:items.map(s=>s.trim()).filter(Boolean)});pop("Added "+n+" item(s)");act.pstock({dataset:{id:f.dataset.id}})}catch(e){$("skm").textContent=emsg(e)}};

// ---------- USERS (admin+): find, adjust wallet, place an order for them, change role (coowner+) ----------
let UR=[];
TAB.users=async()=>`<form data-f="usearch"><label for="uq">Search username or email</label><input id="uq" required><div style="height:10px"></div><button class="btn p">Search</button></form><div id="ures"></div>`;
const ucard=u=>`<div class="box mt"><b>@${esc(u.username)}</b> <span class="pill">${esc(u.role)}</span><div class="lk">${esc(u.email)}</div>Balance: <b>${money(u.balance)}</b>
 <div class="row mt"><button class="btn" data-a="uadj" data-id="${u.id}">Add / remove money</button><button class="btn" data-a="uorder" data-id="${u.id}">Place order</button>
 ${A.rank()>=3&&RK[u.role]<A.rank()?`<button class="btn" data-a="urole" data-id="${u.id}">Change role</button>`:""}</div></div>`;
form.usearch=async()=>{const q=$("uq").value.replace(/[^\w@.+\- ]/g,"").trim();
 const{data,error}=await sb.from("profiles").select("id,username,email,balance,role").or(`username.ilike.%${q}%,email.ilike.%${q}%`).limit(10);UR=data||[];
 $("ures").innerHTML=error?"<p class=neg>Error</p>":UR.map(ucard).join("")||"<p class=en>No match.</p>"};
const U=id=>UR.find(u=>u.id===id)||(UR.find(u=>u.id===id));
act.uadj=el=>{const u=U(el.dataset.id);sheet(`${X}<h2>Wallet: @${esc(u.username)}</h2><p>Balance now ${money(u.balance)}. Use a minus sign to remove money.</p><form data-f="uadj" data-id="${u.id}"><label for="am">Amount (USD)</label><input id="am" type="number" step="0.01" required><label for="an">Note (shown to the customer)</label><input id="an" maxlength="200" value="Top-up"><div style="height:12px"></div><button class="btn p">Apply</button></form>`)};
form.uadj=f=>run("admin_adjust_balance",{p_user_id:f.dataset.id,p_amount:parseFloat($("am").value),p_note:$("an").value},"Balance updated");
act.uorder=async el=>{const u=U(el.dataset.id),cat=await rpc("get_catalog");
 sheet(`${X}<h2>Place order for @${esc(u.username)}</h2><form data-f="uorder" data-id="${u.id}"><label for="op">Product</label><select id="op">${cat.map(p=>`<option value="${p.id}">${esc(p.name)} · ${money(p.price)}</option>`).join("")}</select>
 <label for="oi">Customer detail (email / player ID if the product asks)</label><input id="oi" maxlength="200"><label for="oc">Payment</label><select id="oc"><option value="1">Charge their wallet</option><option value="0">They paid me directly (no charge)</option></select><div style="height:12px"></div><button class="btn p">Place order</button></form>`)};
form.uorder=f=>run("admin_place_order",{p_user_id:f.dataset.id,p_product_id:$("op").value,p_input:$("oi").value||null,p_charge:$("oc").value==="1"},"Order placed");
act.urole=el=>{const u=U(el.dataset.id)||TEAM.find(x=>x.id===el.dataset.id);const opts=["customer","agent","admin","coowner"].filter(r=>RK[r]<A.rank());
 sheet(`${X}<h2>Role: @${esc(u.username)}</h2><form data-f="urole" data-id="${u.id}"><select id="rl">${opts.map(r=>`<option ${r===u.role?"selected":""}>${r}</option>`).join("")}</select>
 <p class="en" style="font-size:13px">agent = support only · admin = orders, top-ups, products, users · coowner = admin + manage staff</p><div style="height:12px"></div><button class="btn p">Save</button></form>`)};
form.urole=f=>run("set_user_role",{p_user_id:f.dataset.id,p_role:$("rl").value},"Role updated");

// ---------- TEAM (coowner+): staff list + audit log ----------
let TEAM=[];
TAB.team=async()=>{
 const[st,au]=await Promise.all([sb.from("profiles").select("id,username,email,role,notify_email").neq("role","customer").order("role"),sb.from("audit_log").select("*").order("created_at",{ascending:false}).limit(40)]);
 TEAM=st.data||[];
 return `<p class="en" style="font-size:14px">To add someone: Users tab → search their email (they must sign up first) → Change role.</p><h3>Team</h3>${TEAM.map(u=>`<div class="item"><span><b>@${esc(u.username)}</b> <span class="pill">${esc(u.role)}</span><br><small class="lk">${esc(u.email)}</small></span>${RK[u.role]<A.rank()?`<button class="btn" data-a="urole" data-id="${u.id}">Change</button>`:""}</div>`).join("")}
 <h3>Audit log</h3>${(au.data||[]).map(a=>`<div class="tx"><span>${esc(a.actor_name||"?")}: ${esc(a.action)}<small>${esc(a.target||"")} ${esc(JSON.stringify(a.details||{}))}</small></span><small>${when(a.created_at)}</small></div>`).join("")||'<p class="en">Empty.</p>'}`;
};

// ---------- PAYMENTS (owner only): where customers send money ----------
let PMS=[];
TAB.pay=async()=>{const{data,error}=await sb.from("payment_methods").select("*").order("sort_order");if(error)throw error;PMS=data;
 return `<p class="en" style="font-size:14px">Only the owner can change these. Customers see them on the Wallet page.</p><button class="btn p" data-a="pmedit">+ New method</button>`+PMS.map(m=>`<div class="item"><span><b>${esc(m.label)}</b> ${m.coming_soon?'<span class="pill wait">soon</span>':""}${m.is_active?"":'<span class="pill no">hidden</span>'}<br><small class="lk">${esc(m.kind)} · ${esc(m.details||"(empty)")}</small></span><button class="btn" data-a="pmedit" data-id="${esc(m.id)}">Edit</button></div>`).join("")};
act.pmedit=el=>{const m=PMS.find(x=>x.id===el.dataset.id)||{id:"",label:"",kind:"manual",details:"",instructions:"",coming_soon:false,is_active:true,sort_order:100};
 sheet(`${X}<h2>${m.id?"Edit":"New"} payment method</h2><form data-f="pmedit"><label>ID (letters, numbers, - _)</label><input id="mi" value="${esc(m.id)}" ${m.id?"readonly":""} required pattern="[a-z0-9_-]{2,30}">
 <label>Name shown</label><input id="ml" value="${esc(m.label)}" required><label>Type</label><select id="mk">${["address","link","manual"].map(k=>`<option ${k===m.kind?"selected":""}>${k}</option>`).join("")}</select>
 <label>Wallet address or https link</label><input id="md" value="${esc(m.details)}"><label>Instructions for the customer</label><textarea id="mn" rows="3">${esc(m.instructions)}</textarea>
 <label>Sort</label><input id="ms" type="number" value="${m.sort_order}"><label><input type="checkbox" id="mc" ${m.coming_soon?"checked":""}> Coming soon</label><label><input type="checkbox" id="ma" ${m.is_active?"checked":""}> Visible</label>
 <div style="height:12px"></div><button class="btn p">Save</button></form><p id="pmm" class="au-m"></p>`)};
form.pmedit=async()=>{const row={id:$("mi").value.trim(),label:$("ml").value.trim(),kind:$("mk").value,details:$("md").value.trim(),instructions:$("mn").value.trim(),sort_order:parseInt($("ms").value)||100,coming_soon:$("mc").checked,is_active:$("ma").checked};
 const{error}=await sb.from("payment_methods").upsert(row);if(error)$("pmm").textContent=error.message;else{closeSheet();pop("Saved");A.route()}};
})();
