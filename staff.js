/* AstroVault STAFF CONSOLE (staff.js): everything the team uses, shown by role.
   Tabs are shown by PERMISSION (A.can), not by role: each role has defaults, and the owner/co-owner can grant or revoke single permissions per person (Team tab).
   The UI only HIDES tabs. Real permission checks are in the database (RLS + is_admin()/my_rank() inside each RPC),
   so a customer who edits this file in devtools still cannot do anything. Plugs in via window.AV like support.js. */
(function(){
"use strict";
const A=window.AV;if(!A||!A.sb)return;
const {S,sb,$,esc,money,when,pop,sheet,closeSheet,rpc,emsg,paint,V,act,form}=A;
const X='<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button>';
const RK={customer:0,agent:1,admin:2,coowner:3,owner:4};
const TABS=[["overview","Overview","orders","📊","Sales and what needs attention"],["queue","Tickets","tickets","💬","Customer support chats"],["orders","Orders","orders","📦","Fulfil and track orders"],["topups","Top-ups","topups","💳","Verify payments, add money"],["products","Products","products","🏷️","Prices, stock, new items"],["users","Customers","users_view","👥","Find anyone, add money, place orders"],["team","Team","staff_manage","🛡️","Roles, permissions, audit log"],["pay","Payment methods","payments","🏦","Where customers send money"]];   // [id, label, permission needed, icon, description]
const CI={order:"📦",payment:"💳",topup:"💳",refund:"↩️",account:"👤",password:"🔑",product:"🎁",other:"💬"};   // ticket topic icons
const pillT=s=>`<span class="pill ${s==="approved"?"ok":s==="pending"?"wait":"no"}">${s==="approved"?"verified":s}</span>`;

// ---------- shell: tab bar with live "needs attention" counts ----------
// STAFF HOME = big tiles (one per job) + a customer search box. Tapping a tile opens that section with a "← Staff home" button.
V.staff=async t=>{
 if(!A.S.perms.length)return paint(t,`<div class="box ctr">${astroPose("fail",80)}<p>Staff only.</p></div>`);
 const tabs=TABS.filter(x=>A.can(x[2])),cur=tabs.find(x=>x[0]===A.staffTab);
 if(cur){let body;try{body=await TAB[cur[0]]()}catch(e){body=`<p class="neg">Error: ${esc(e.message)}</p>`}
  return paint(t,`<button class="btn back" data-a="stab" data-id="home">← Staff home</button><h2>${cur[3]} ${cur[1]}</h2>`+body)}
 const cnt=q=>q.then(r=>r.count||0,()=>0),n={};
 if(A.can("tickets"))n.queue=await cnt(sb.from("tickets").select("id",{count:"exact",head:true}).is("assigned_to",null).in("status",["open","pending"]));
 if(A.can("orders"))n.orders=await cnt(sb.from("orders").select("id",{count:"exact",head:true}).in("status",["pending","processing"]));
 if(A.can("topups"))n.topups=await cnt(sb.from("topup_requests").select("id",{count:"exact",head:true}).eq("status","pending"));
 const todo=[n.topups&&n.topups+" payment(s) to verify",n.orders&&n.orders+" order(s) to fulfil",n.queue&&n.queue+" ticket(s) waiting"].filter(Boolean);
 paint(t,`<h2>Staff</h2><form data-f="usearch" class="sfind"><input id="uq" placeholder="🔎 Find a customer: username, email or ID" required autocomplete="off"><button class="btn p">Find</button></form><div id="ures"></div>
  <p class="en">${todo.length?"Needs you now: "+todo.join(" · "):"✅ Nothing is waiting for you."}</p>
  <div class="tiles">${tabs.map(x=>`<button class="tile2" data-a="stab" data-id="${x[0]}">${n[x[0]]?`<i class="bdg">${n[x[0]]}</i>`:""}<span class="ti">${x[3]}</span><b>${x[1]}</b><small>${x[4]}</small></button>`).join("")}</div>`);
};
act.stab=el=>{A.staffTab=el.dataset.id==="home"?null:el.dataset.id;A.route()};
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
 const me=S.user.id,row=k=>`<div class="item"><span><b>${CI[k.category]||"💬"} #${k.number} ${esc(k.subject)}</b><br><small class="lk">${esc(k.customer_name)} · ${esc(k.category)} · ${when(k.last_message_at)}${k.assigned_name?" · "+esc(k.assigned_name):""}</small></span>
  <span>${k.assigned_to?"":`<button class="btn p" data-a="qclaim" data-id="${k.id}">Claim</button> `}<button class="btn" data-a="openticket" data-id="${k.id}">Open</button></span></div>`;
 const un=data.filter(k=>!k.assigned_to),mine=data.filter(k=>k.assigned_to===me),oth=data.filter(k=>k.assigned_to&&k.assigned_to!==me);
 const{data:done}=await sb.from("tickets").select("*").in("status",["resolved","closed"]).order("last_message_at",{ascending:false}).limit(30);   // oversight: read any past chat
 return `<h3>Unassigned (${un.length})</h3>${un.map(row).join("")||'<p class="en">Queue is empty. 🎉</p>'}<h3>Mine (${mine.length})</h3>${mine.map(row).join("")||'<p class="en">None.</p>'}<h3>With others (${oth.length})</h3>${oth.map(row).join("")||'<p class="en">None.</p>'}<h3>Resolved &amp; closed (last 30)</h3>${(done||[]).map(row).join("")||'<p class="en">None.</p>'}`;
};
act.qclaim=async el=>{try{await rpc("claim_ticket",{p_ticket:el.dataset.id});A.openTicket(el.dataset.id)}catch(e){pop(emsg(e));A.route()}};

// ---------- ORDERS (admin+): pending -> processing -> completed, or cancel + refund ----------
TAB.orders=async()=>{
 const{data,error}=await sb.from("orders").select("*,profiles(username,email)").order("created_at",{ascending:false}).limit(100);if(error)throw error;
 const card=o=>`<div class="box mt"><b>#AV-${o.number} ${esc(o.product_name)}</b> ${A.pillS(o.status)} ${money(o.price)}
  <div class="lk">@${esc(o.profiles&&o.profiles.username)} · ${esc(o.profiles&&o.profiles.email)} · ${when(o.created_at)}</div>
  <button class="btn" data-a="ucard" data-id="${o.user_id}" style="margin:6px 0">Customer</button>${o.buyer_input?`<div class="cred">${esc(o.buyer_input)}</div>`:""}${o.admin_note?`<div class="lk">Note: ${esc(o.admin_note)}</div>`:""}
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
 const{data,error}=await sb.from("topup_requests").select("*,profiles!topup_requests_user_id_fkey(username,email)").order("created_at",{ascending:false}).limit(60);if(error)throw error;
 const dup=r=>data.some(x=>x.id!==r.id&&x.reference.toLowerCase()===r.reference.toLowerCase());
 const card=r=>`<div class="box mt"><b>@${esc(r.profiles&&r.profiles.username)}</b> claims ${money(r.amount)} via ${esc(r.method)} ${pillT(r.status)}
  <div class="lk">${esc(r.profiles&&r.profiles.email)} · ${when(r.created_at)}</div>
  <p class="meta"><span>Sender name</span><span>${esc(r.sender_name||"—")}</span></p><p class="meta"><span>Transaction ID</span><span>${esc(r.reference)}</span></p>
  ${dup(r)?'<p class="neg">⚠ This transaction ID appears more than once.</p>':""}
  <button class="btn" data-a="proof" data-p="${esc(r.proof_path||"")}">View screenshot</button> <button class="btn" data-a="ucard" data-id="${r.user_id}">Customer</button>
  ${r.status==="pending"?`<label for="a-${r.id}">Amount that actually arrived</label><input id="a-${r.id}" type="number" step="0.01" value="${r.amount}">
   <div class="row mt"><button class="btn p" data-a="tapprove" data-id="${r.id}">✓ Verify &amp; add money</button><button class="btn" data-a="treject" data-id="${r.id}">Reject</button></div>`
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
 return `<button class="btn p" data-a="newprod">+ New product</button>`+data.map(p=>`<div class="box mt"><b>${esc(p.icon)} ${esc(p.name)}</b> <span class="lk">OF-${p.offer_no||"?"}</span><br><span class="pill">${p.fulfillment}</span> ${p.coming_soon?'<span class="pill wait">coming soon</span>':'<span class="pill ok">live</span>'} ${p.is_active?"":'<span class="pill no">hidden</span>'} ${p.discount_percent>0?`<span class="pill hot">−${p.discount_percent}%</span>`:""}${p.featured?' <span class="pill">⭐</span>':""}
  <div class="lk">${money(p.price)}${p.retail_price?" (retail "+money(p.retail_price)+")":""} · ${p.fulfillment==="manual"?(p.stock_qty==null?"unlimited stock":p.stock_qty+" in stock"):"stock = items list"} · past sales ${p.sold_offset||0}</div>
  <div class="row mt"><button class="btn" data-a="plive" data-id="${p.id}" data-v="${p.coming_soon?1:0}">${p.coming_soon?"Go live":"Set coming soon"}</button><button class="btn" data-a="pedit" data-id="${p.id}">Edit</button><button class="btn" data-a="pdisc" data-id="${p.id}">🏷️ Discount</button>
  <button class="btn" data-a="pvis" data-id="${p.id}" data-v="${p.is_active?1:0}">${p.is_active?"Hide":"Show"}</button>${p.fulfillment==="instant"?`<button class="btn" data-a="pstock" data-id="${p.id}">Stock</button>`:`<button class="btn" data-a="pqty" data-id="${p.id}">Restock</button>`}<button class="btn" data-a="pdel" data-id="${p.id}">Delete</button></div></div>`).join("");
};
const upd=async(id,patch)=>{const{error}=await sb.from("products").update(patch).eq("id",id);pop(error?"Failed: "+error.message:"Saved");A.route()};
act.plive=el=>upd(el.dataset.id,{coming_soon:el.dataset.v!=="1"});
act.pvis=el=>upd(el.dataset.id,{is_active:el.dataset.v!=="1"});
act.pprice=el=>{const v=parseFloat(prompt("New price (USD)"));if(v>=0)upd(el.dataset.id,{price:v})};
// One form for BOTH new and edit (data-id empty = new). Slug is generated once and never changes on edit.
// Pictures: shrink the phone photo to max 900px JPEG in the browser (fast + cheap), upload to the public product-images bucket, store its link.
async function resizeImg(file,max){const bmp=await createImageBitmap(file),sc=Math.min(1,(max||900)/Math.max(bmp.width,bmp.height)),c=document.createElement("canvas");c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);return new Promise(r=>c.toBlob(r,"image/jpeg",0.85))}
async function uploadImg(file){const blob=await resizeImg(file),path=A.uuid()+".jpg",up=await sb.storage.from("product-images").upload(path,blob,{contentType:"image/jpeg"});if(up.error)throw up.error;return sb.storage.from("product-images").getPublicUrl(path).data.publicUrl}
const pform=p=>{p=p||{icon:"📦",category:A.C.CATEGORIES[0].id,fulfillment:"instant",coming_soon:true,region_mode:"global",region_list:[],delivery_minutes:0};
 const cats=A.C.CATEGORIES.concat(A.C.CATEGORIES.find(c=>c.id===p.category)?[]:[{id:p.category,label:p.category}]);
 const left=p.discount_until?Math.max(1,Math.ceil((new Date(p.discount_until)-Date.now())/864e5)):"",v=x=>esc(x==null?"":x);
 sheet(`${X}<h2>${p.id?"Edit":"New"} product${p.offer_no?" · OF-"+p.offer_no:""}</h2><form data-f="prod" data-id="${p.id||""}"><label>Name</label><input id="pn" required maxlength="120" value="${v(p.name)}">
 <label>Picture (square or wide, any photo)</label>${p.image_url?`<img src="${esc(p.image_url)}" alt="" style="max-width:100%;max-height:120px;border-radius:10px;display:block;margin-bottom:6px"><label class="chk"><input type="checkbox" id="prmimg"> <span>Remove current picture</span></label>`:""}<input id="pimgf" type="file" accept="image/jpeg,image/png,image/webp">
 <label>Icon (emoji)</label><input id="pi" value="${v(p.icon||"📦")}" maxlength="4"><label>Category</label><select id="pc">${cats.map(c=>`<option value="${esc(c.id)}" ${c.id===p.category?"selected":""}>${esc(c.label)}</option>`).join("")}</select>
 <label>Brand (e.g. Google, Netflix, CapCut)</label><input id="pbr" value="${v(p.brand)}"><label>Price (USD)</label><input id="ppr" type="number" step="0.01" min="0" required value="${v(p.price)}">
 <label>Retail price (crossed out, optional)</label><input id="prp" type="number" step="0.01" min="0" value="${v(p.retail_price)}">
 <label>Delivery</label><select id="pf"><option value="instant" ${p.fulfillment==="instant"?"selected":""}>Instant (from stock list)</option><option value="manual" ${p.fulfillment==="manual"?"selected":""}>Manual (you deliver)</option></select>
 <label>Delivery time in minutes (0 = instant, 60 = 1 hour)</label><input id="pdm" type="number" min="0" value="${v(p.delivery_minutes||0)}">
 <label>Stock quantity (manual items; blank = unlimited. Counts down automatically)</label><input id="psq" type="number" min="0" value="${v(p.stock_qty)}">
 <label>Description</label><textarea id="pds" rows="2">${v(p.description)}</textarea>
 <details class="mt"><summary>More options</summary><label>Type (e.g. Premium, Gift card, Top-up)</label><input id="psc" value="${v(p.subcategory)}"><label>Duration (e.g. 1 month)</label><input id="pdur" value="${v(p.duration_label)}">
 <label>Discount %</label><input id="pdp" type="number" min="0" max="90" value="${v(p.discount_percent||0)}"><label>Discount lasts how many days? (blank = until removed)</label><input id="pdd" type="number" min="1" value="${left}">
 <label>Where can it be activated?</label><select id="prm"><option value="global" ${p.region_mode==="global"?"selected":""}>Worldwide</option><option value="only" ${p.region_mode==="only"?"selected":""}>Only these countries</option><option value="except" ${p.region_mode==="except"?"selected":""}>Everywhere EXCEPT these</option></select>
 <label>Country codes (e.g. TN, DZ, MA)</label><input id="prl" value="${v((p.region_list||[]).join(", "))}">
 <label>Ask buyer for (blank = nothing)</label><input id="pil" placeholder="Your Spotify email" value="${v(p.input_label)}"><label>Terms / warranty</label><textarea id="ptm" rows="2">${v(p.terms)}</textarea>
 <label>Past sales: real sales you made before / outside this site</label><input id="pso2" type="number" min="0" value="${v(p.sold_offset||0)}"><label>Sort order (small = first)</label><input id="pso" type="number" value="${v(p.sort_order==null?100:p.sort_order)}">
 <label class="chk"><input type="checkbox" id="pft" ${p.featured?"checked":""}> <span>⭐ Featured</span></label><label class="chk"><input type="checkbox" id="pcs" ${p.coming_soon?"checked":""}> <span>Coming soon (not purchasable yet)</span></label><label class="chk"><input type="checkbox" id="pac" ${p.is_active===false?"":"checked"}> <span>Visible in shop</span></label></details>
 <div style="height:12px"></div><button class="btn p">${p.id?"Save changes":"Create"}</button></form><p id="pmsg" class="au-m" style="color:#dc2626"></p>`)};
act.pdisc=el=>{const p=PRODS.find(x=>x.id===el.dataset.id);sheet(`${X}<h2>Discount: ${esc(p.name)}</h2><p class="en" style="font-size:14px">Regular price ${money(p.price)}. Customers see it crossed out in red next to the new price.</p><form data-f="pdisc" data-id="${p.id}"><label>Discount %</label><div>${[5,10,20,30].map(a=>`<button type="button" class="chip" data-a="dpct" data-v="${a}">${a}%</button>`).join("")}</div><input id="dp" type="number" min="1" max="90" value="${p.discount_percent||10}"><label>For how many days? (blank = until you remove it)</label><input id="dd" type="number" min="1" placeholder="e.g. 3"><div style="height:10px"></div><button class="btn p">Apply discount</button><div style="height:8px"></div><button type="button" class="btn" data-a="drem" data-id="${p.id}">Remove discount</button></form>`)};
act.dpct=el=>{$("dp").value=el.dataset.v};
form.pdisc=async f=>{const d=parseInt($("dd").value);await upd(f.dataset.id,{discount_percent:Math.min(90,Math.max(1,parseInt($("dp").value)||1)),discount_until:d>0?new Date(Date.now()+d*864e5).toISOString():null});closeSheet()};
act.drem=async el=>{await upd(el.dataset.id,{discount_percent:0,discount_until:null});closeSheet()};
act.pqty=el=>{const p=PRODS.find(x=>x.id===el.dataset.id),v=prompt("Stock quantity for "+p.name+" (blank = unlimited)",p.stock_qty==null?"":p.stock_qty);if(v===null)return;upd(p.id,{stock_qty:v.trim()===""?null:Math.max(0,parseInt(v)||0)})};
act.newprod=()=>pform();
act.pedit=el=>pform(PRODS.find(p=>p.id===el.dataset.id));
form.prod=async f=>{const v=id=>$(id).value.trim(),id=f.dataset.id,num=(i,d)=>{const x=parseInt($(i).value);return isNaN(x)?d:x},days=num("pdd",0);
 const row={name:v("pn"),icon:v("pi")||"📦",category:$("pc").value,brand:v("pbr")||null,subcategory:v("psc")||null,duration_label:v("pdur"),description:v("pds"),price:parseFloat($("ppr").value),retail_price:$("prp").value?parseFloat($("prp").value):null,fulfillment:$("pf").value,
  delivery_minutes:Math.max(0,num("pdm",0)),stock_qty:($("pf").value==="manual"&&$("psq").value!=="")?Math.max(0,num("psq",0)):null,input_label:v("pil")||null,terms:v("ptm"),sort_order:num("pso",100),sold_offset:Math.max(0,num("pso2",0)),
  discount_percent:Math.min(90,Math.max(0,num("pdp",0))),discount_until:days>0?new Date(Date.now()+days*864e5).toISOString():null,featured:$("pft").checked,coming_soon:$("pcs").checked,is_active:$("pac").checked,
  region_mode:$("prm").value,region_list:$("prm").value==="global"?[]:$("prl").value.toUpperCase().split(/[^A-Z]+/).filter(c=>c.length===2)};
 const pf=$("pimgf").files[0];
 if(pf){$("pmsg").style.color="var(--mut)";$("pmsg").textContent="Uploading picture…";try{row.image_url=await uploadImg(pf)}catch(e){$("pmsg").style.color="#dc2626";return $("pmsg").textContent="Picture upload failed: "+(e.message||e)}}else if($("prmimg")&&$("prmimg").checked)row.image_url=null;
 if(row.region_mode!=="global"&&!row.region_list.length)return $("pmsg").textContent="Add at least one country code, or choose Worldwide.";
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

// ---------- USERS: find a customer, then (by permission) add money, grant coins, place an order, change role / permissions ----------
let UR=[],TEAM=[],PMS=[];
const PL={tickets:"Read & answer all tickets",assign_tickets:"Assign tickets to others",orders:"Process / cancel orders",place_orders:"Place orders for customers",topups:"Verify payments (top-ups)",products:"Add / edit / delete products & stock",users_view:"See customers",wallet:"Add / remove wallet money",coins:"Grant AstroCoins & set rates",payments:"Edit payment methods",staff_manage:"Manage roles & permissions",audit:"See the audit log"};
TAB.users=async()=>`<form data-f="usearch"><label for="uq">Search username or email</label><input id="uq" required><div style="height:10px"></div><button class="btn p">Search</button></form><div id="ures"></div>`;
// Search result = compact row. Tapping opens the CUSTOMER CARD: balance, recent orders/ledger/tickets, and a ready-made "add money" form.
const ucard=u=>`<button class="item" data-a="ucard" data-id="${u.id}"><span><b>@${esc(u.username)}</b> <span class="pill">${esc(u.role)}</span><br><small class="lk">#${u.user_no||"?"} · ${esc(u.email)} · ${money(u.balance)}</small></span><span>›</span></button>`;
act.ucard=async el=>{const id=el.dataset.id;
 const[p,o,w,k]=await Promise.all([sb.from("profiles").select("id,username,email,balance,role,coins,created_at,perm_grants,perm_revokes,user_no").eq("id",id).maybeSingle(),
  sb.from("orders").select("number,product_name,price,status,created_at").eq("user_id",id).order("created_at",{ascending:false}).limit(5),
  sb.from("wallet_transactions").select("amount,note,created_at").eq("user_id",id).order("created_at",{ascending:false}).limit(5),
  sb.from("tickets").select("id,number,subject,status").eq("user_id",id).order("last_message_at",{ascending:false}).limit(3)]);
 const u=p.data;if(!u)return pop("Customer not found");if(!UR.find(x=>x.id===u.id))UR.push(u);
 const lower=RK[u.role]<A.rank(),b=[];
 if(A.can("place_orders"))b.push(`<button class="btn" data-a="uorder" data-id="${u.id}">🛒 Place order</button>`);
 if(A.can("coins"))b.push(`<button class="btn" data-a="ucoin" data-id="${u.id}">🪙 Coins</button>`);
 if(A.can("staff_manage")&&lower)b.push(`<button class="btn" data-a="urole" data-id="${u.id}">Role</button>`);
 if(A.can("staff_manage")&&lower&&RK[u.role]>=1)b.push(`<button class="btn" data-a="uperms" data-id="${u.id}">Permissions</button>`);
 sheet(`${X}<h2>@${esc(u.username)} <span class="pill">${esc(u.role)}</span></h2><p class="lk">ID #${u.user_no||"?"} · ${esc(u.email)} · joined ${when(u.created_at)}</p>
 <div class="box wal" style="padding:12px"><span class="en">Wallet balance</span><b style="font-size:30px">${money(u.balance)}</b><span class="lk">🪙 ${u.coins||0} AstroCoins</span></div>
 ${A.can("wallet")?`<form data-f="cadj" data-id="${u.id}"><label>Add money (use − to remove)</label><div>${[5,10,25,50].map(a=>`<button type="button" class="chip" data-a="qamt" data-v="${a}">+${a}</button>`).join("")}</div><input id="ca" type="number" step="0.01" required placeholder="Amount in USD"><label for="cn2">Reason (the customer sees this)</label><select id="cn2"><option>Top-up (payment received)</option><option>Refund</option><option>Goodwill credit</option><option>Correction</option></select><div style="height:10px"></div><button class="btn p">Apply to wallet</button></form>`:""}
 <div class="row mt">${b.join("")}</div>
 <h3>Recent orders</h3>${(o.data||[]).map(x=>`<div class="tx"><span>#AV-${x.number} ${esc(x.product_name)}<small>${when(x.created_at)}</small></span>${A.pillS(x.status)}</div>`).join("")||'<p class="en">None.</p>'}
 <h3>Wallet activity</h3>${(w.data||[]).map(x=>`<div class="tx"><span>${esc(x.note||"")}<small>${when(x.created_at)}</small></span><span class="${x.amount>0?"pos":"neg"}">${x.amount>0?"+":""}${money(x.amount)}</span></div>`).join("")||'<p class="en">None.</p>'}
 <h3>Tickets</h3>${(k.data||[]).map(x=>`<button class="item" data-a="openticket" data-id="${x.id}"><span>#${x.number} ${esc(x.subject)}</span><span class="pill">${esc(x.status)}</span></button>`).join("")||'<p class="en">None.</p>'}`)};
act.qamt=el=>{$("ca").value=el.dataset.v};
form.cadj=async f=>{const a=parseFloat($("ca").value);if(!a)return;if(!confirm((a>0?"Add ":"Remove ")+money(Math.abs(a))+" to this wallet?"))return;
 try{await rpc("admin_adjust_balance",{p_user_id:f.dataset.id,p_amount:a,p_note:$("cn2").value});pop("Wallet updated");act.ucard({dataset:{id:f.dataset.id}})}catch(e){pop(emsg(e))}};
form.usearch=async()=>{const q=$("uq").value.replace(/[^\w@.+\- ]/g,"").trim();
 const{data,error}=await sb.from("profiles").select("id,username,email,balance,role,coins,perm_grants,perm_revokes,user_no").or(`username.ilike.%${q}%,email.ilike.%${q}%${/^\d{4,}$/.test(q)?`,user_no.eq.${q}`:""}`).limit(10);UR=data||[];
 $("ures").innerHTML=error?"<p class=neg>Error</p>":UR.map(ucard).join("")||"<p class=en>No match.</p>"};
const U=id=>UR.find(u=>u.id===id)||TEAM.find(u=>u.id===id);
act.uadj=el=>{const u=U(el.dataset.id);sheet(`${X}<h2>Wallet: @${esc(u.username)}</h2><p>Balance now ${money(u.balance)}. Use a minus sign to remove money.</p><form data-f="uadj" data-id="${u.id}"><label for="am">Amount (USD)</label><input id="am" type="number" step="0.01" required><label for="an">Note (shown to the customer)</label><input id="an" maxlength="200" value="Top-up"><div style="height:12px"></div><button class="btn p">Apply</button></form>`)};
form.uadj=f=>run("admin_adjust_balance",{p_user_id:f.dataset.id,p_amount:parseFloat($("am").value),p_note:$("an").value},"Balance updated");
act.ucoin=el=>{const u=U(el.dataset.id);sheet(`${X}<h2>AstroCoins: @${esc(u.username)}</h2><p>They have 🪙 ${u.coins||0}. Use a minus sign to remove.</p><form data-f="ucoin" data-id="${u.id}"><label for="cn">Coins</label><input id="cn" type="number" step="1" required><label for="cnn">Note</label><input id="cnn" maxlength="200" value="Bonus"><div style="height:12px"></div><button class="btn p">Apply</button></form>`)};
form.ucoin=f=>run("admin_grant_coins",{p_user_id:f.dataset.id,p_coins:parseInt($("cn").value),p_note:$("cnn").value},"Coins updated");
act.uorder=async el=>{const u=U(el.dataset.id),cat=await rpc("get_catalog");
 sheet(`${X}<h2>Place order for @${esc(u.username)}</h2><form data-f="uorder" data-id="${u.id}"><label for="op">Product</label><select id="op">${cat.map(p=>`<option value="${p.id}">${esc(p.name)} · ${money(p.price)}</option>`).join("")}</select>
 <label for="oi">Customer detail (email / player ID if the product asks)</label><input id="oi" maxlength="200"><label for="oc">Payment</label><select id="oc"><option value="1">Charge their wallet</option><option value="0">They paid me directly (no charge)</option></select><div style="height:12px"></div><button class="btn p">Place order</button></form>`)};
form.uorder=f=>run("admin_place_order",{p_user_id:f.dataset.id,p_product_id:$("op").value,p_input:$("oi").value||null,p_charge:$("oc").value==="1"},"Order placed");
act.urole=el=>{const u=U(el.dataset.id);const opts=["customer","agent","admin","coowner"].filter(r=>RK[r]<A.rank());
 sheet(`${X}<h2>Role: @${esc(u.username)}</h2><form data-f="urole" data-id="${u.id}"><select id="rl">${opts.map(r=>`<option ${r===u.role?"selected":""}>${r}</option>`).join("")}</select>
 <p class="en" style="font-size:13px">agent = support only · admin = orders, top-ups, products, users · coowner = admin + manage staff. Fine-tune with Permissions.</p><div style="height:12px"></div><button class="btn p">Save</button></form>`)};
form.urole=f=>run("set_user_role",{p_user_id:f.dataset.id,p_role:$("rl").value},"Role updated");
// Permission editor: tick = allowed. Saved as grants (ticked but not a role default) and revokes (unticked but a role default).
act.uperms=el=>{const u=U(el.dataset.id),def=A.ROLEP[u.role]||[],g=u.perm_grants||[],r=u.perm_revokes||[];
 sheet(`${X}<h2>Permissions: @${esc(u.username)}</h2><p class="en" style="font-size:13px">Role: ${esc(u.role)}. Tick what this person may do. You can only hand out permissions you have yourself (greyed = you don’t have it).</p><form data-f="uperms" data-id="${u.id}">${Object.keys(PL).map(p=>`<label class="chk"><input type="checkbox" data-p="${p}" ${((def.includes(p)||g.includes(p))&&!r.includes(p))?"checked":""} ${A.can(p)?"":"disabled"}> <span>${PL[p]}</span></label>`).join("")}<div style="height:12px"></div><button class="btn p">Save permissions</button></form>`)};
form.uperms=f=>{const u=U(f.dataset.id),def=A.ROLEP[u.role]||[],grants=[],revokes=[];
 f.querySelectorAll("input[data-p]").forEach(c=>{const p=c.dataset.p,d=def.includes(p);
  if(c.disabled){if((u.perm_grants||[]).includes(p))grants.push(p);if((u.perm_revokes||[]).includes(p))revokes.push(p);return}   // not editable by me: keep as is
  if(c.checked&&!d)grants.push(p);if(!c.checked&&d)revokes.push(p)});
 return run("set_user_perms",{p_user_id:u.id,p_grants:grants,p_revokes:revokes},"Permissions saved")};

// ---------- TEAM: staff list, coin rates, audit log ----------
TAB.team=async()=>{
 const none=Promise.resolve({data:[]});
 const[st,au,se]=await Promise.all([sb.from("profiles").select("id,username,email,role,coins,balance,perm_grants,perm_revokes").neq("role","customer").order("role"),A.can("audit")?sb.from("audit_log").select("*").order("created_at",{ascending:false}).limit(40):none,A.can("coins")?sb.from("settings").select("key,value"):none]);
 TEAM=st.data||[];const SE={};(se.data||[]).forEach(r=>SE[r.key]=r.value);
 return `<p class="en" style="font-size:14px">To add someone: Users tab → search their email (they must sign up first) → Role. Then fine-tune with Permissions.</p>
 ${A.can("coins")?`<div class="box mt"><b>🪙 AstroCoins rates</b><form data-f="coinrates"><label for="ce">Coins earned per $1 spent</label><input id="ce" type="number" min="1" value="${esc(SE.coin_earn||"2")}"><label for="cr">Coins needed for $1 of wallet credit</label><input id="cr" type="number" min="1" value="${esc(SE.coin_redeem||"100")}"><div style="height:10px"></div><button class="btn p">Save rates</button></form></div>`:""}
 <h3>Team</h3>${TEAM.map(u=>`<div class="item"><span><b>@${esc(u.username)}</b> <span class="pill">${esc(u.role)}</span><br><small class="lk">${esc(u.email)}${(u.perm_grants||[]).length||(u.perm_revokes||[]).length?" · custom permissions":""}</small></span>${RK[u.role]<A.rank()&&RK[u.role]>=1?`<button class="btn" data-a="uperms" data-id="${u.id}">Permissions</button>`:""}</div>`).join("")}
 ${A.can("audit")?`<h3>Audit log</h3>${(au.data||[]).map(a=>`<div class="tx"><span>${esc(a.actor_name||"?")}: ${esc(a.action)}<small>${esc(a.target||"")} ${esc(JSON.stringify(a.details||{}))}</small></span><small>${when(a.created_at)}</small></div>`).join("")||'<p class="en">Empty.</p>'}`:""}`;
};
form.coinrates=async()=>{try{await rpc("admin_set_setting",{p_key:"coin_earn",p_value:$("ce").value});await rpc("admin_set_setting",{p_key:"coin_redeem",p_value:$("cr").value});pop("Rates saved");A.route()}catch(e){pop(emsg(e))}};

// ---------- PAYMENTS (permission "payments", owner by default): simple typed forms, only the fields each type needs ----------
//  binance_pay: Pay ID (+name) | crypto: network + address | bank: bank, holder, IBAN | link: url | manual: text only
const PT={
 binance_pay:{label:"Binance Pay",fields:[["details","Binance Pay ID","e.g. 216818778"],["name","Account name (optional)","e.g. ItsAstro"]],qr:true,auto:true},
 pay_id:{label:"Payment app ID (RedotPay, etc.)",fields:[["details","Account ID","e.g. 1546339006"],["app","App name","e.g. RedotPay"]],qr:true},
 crypto:{label:"Crypto wallet (USDT)",fields:[["network","Network","TRC20 or BEP20"],["details","Wallet address",""]],qr:true,auto:true},
 bank:{label:"Bank / mobile transfer",fields:[["bank","Bank or service name",""],["holder","Account holder",""],["details","IBAN / RIB / account number",""]]},
 link:{label:"Payment link",fields:[["details","Link (https://…)",""]]},
 manual:{label:"Other (text instructions only)",fields:[]}};
const pkind=m=>m.kind==="address"?"crypto":m.kind;
TAB.pay=async()=>{const{data,error}=await sb.from("payment_methods").select("*").order("sort_order");if(error)throw error;PMS=data;
 return `<p class="en" style="font-size:14px">Customers see these on the Wallet page. Only people with the “payments” permission can change them.</p><button class="btn p" data-a="pmnew">+ Add payment method</button>`+PMS.map(m=>`<div class="item"><span><b>${esc(m.label)}</b> ${m.auto_verify?'<span class="pill ok">auto</span>':""}${m.coming_soon?'<span class="pill wait">soon</span>':""}${m.is_active?"":'<span class="pill no">hidden</span>'}<br><small class="lk">${esc((PT[pkind(m)]||{}).label||m.kind)} · ${esc((m.details||"(empty)").slice(0,28))}</small></span><button class="btn" data-a="pmedit" data-id="${esc(m.id)}">Edit</button></div>`).join("")};
act.pmnew=()=>sheet(`${X}<h2>Add payment method</h2><p class="en">What kind of payment is it?</p>${Object.keys(PT).map(k=>`<button class="btn" style="margin-bottom:8px;width:100%" data-a="pmtype" data-t="${k}">${PT[k].label}</button>`).join("")}`);
act.pmtype=el=>pmForm(null,el.dataset.t);
act.pmedit=el=>{const m=PMS.find(x=>x.id===el.dataset.id);pmForm(m,pkind(m))};
function pmForm(m,t){const T=PT[t],meta=(m&&m.meta)||{};m=m||{label:"",details:"",instructions:"",coming_soon:false,is_active:true,sort_order:100,auto_verify:false,image_url:""};
 const val=k=>k==="details"?m.details:(meta[k]||"");
 sheet(`${X}<h2>${m.id?"Edit":"New"}: ${T.label}</h2><form data-f="pmedit" data-id="${esc(m.id||"")}" data-t="${t}">
 <label>Name shown to customers</label><input id="ml" value="${esc(m.label)}" required placeholder="e.g. ${esc(T.label)}">
 ${T.fields.map(f=>`<label>${f[1]}</label><input data-k="${f[0]}" value="${esc(val(f[0]))}" placeholder="${esc(f[2]||"")}" ${f[0]==="details"?"required":""}>`).join("")}
 ${T.qr?`<label>QR image (optional, e.g. assets/my-qr.png)</label><input id="mq" value="${esc(m.image_url||"")}">`:""}
 ${T.auto?`<label class="chk"><input type="checkbox" id="mauto" ${m.auto_verify?"checked":""}> <span>Credit paid invoices automatically (turn on only after the watch-deposits function is deployed)</span></label>`:""}
 <label class="chk"><input type="checkbox" id="mc" ${m.coming_soon?"checked":""}> <span>Coming soon (shown, not usable)</span></label><label class="chk"><input type="checkbox" id="ma" ${m.is_active!==false?"checked":""}> <span>Visible to customers</span></label>
 <details class="mt"><summary>More options</summary><label>Extra instructions for customers (optional)</label><textarea id="mn" rows="3">${esc(m.instructions||"")}</textarea><label>Sort (small = first)</label><input id="ms" type="number" value="${m.sort_order||100}"></details>
 <div style="height:12px"></div><button class="btn p">Save</button></form><p id="pmm" class="au-m" style="color:#dc2626"></p>`)}
form.pmedit=async f=>{const t=f.dataset.t,T=PT[t],meta={};let details="";
 f.querySelectorAll("[data-k]").forEach(i=>{const v=i.value.trim();if(i.dataset.k==="details")details=v;else if(v)meta[i.dataset.k]=v});
 if(t==="crypto"){meta.network=(meta.network||"").toUpperCase();if(!meta.coin)meta.coin="USDT"}
 const label=$("ml").value.trim(),auto=!!($("mauto")&&$("mauto").checked);
 if(auto&&t==="crypto"&&!["TRC20","BEP20"].includes(meta.network))return $("pmm").textContent="Auto-verify needs the network to be TRC20 or BEP20.";
 const id=f.dataset.id||((label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,24)||"method")+"-"+Math.random().toString(36).slice(2,5));
 const row={id,label,kind:t,details,meta,image_url:T.qr&&$("mq")?($("mq").value.trim()||null):null,auto_verify:auto,instructions:$("mn").value.trim(),sort_order:parseInt($("ms").value)||100,coming_soon:$("mc").checked,is_active:$("ma").checked};
 const{error}=await sb.from("payment_methods").upsert(row);if(error)$("pmm").textContent=error.message;else{closeSheet();pop("Saved");A.route()}};
})();
