/* AstroVault SUPPORT (support.js): customer help desk + the chat window staff also use + the notification bell.
   Plugs into app.js through window.AV (V = views, act = click actions, form = form handlers).
   Database side: tickets, ticket_messages, notifications and create_ticket / claim_ticket / ticket_reply /
   set_ticket_status / mark_notifications_read in supabase/schema_v2.sql. */
(function(){
"use strict";
const A=window.AV;if(!A||!A.sb)return;          // app not configured yet: do nothing
const {S,sb,$,esc,when,pop,sheet,closeSheet,rpc,emsg,paint,V,act,form}=A;
const TS={open:["Open","wait"],pending:["Agent replied","ok"],resolved:["Resolved","ok"],closed:["Closed","no"]};
const tpill=s=>`<span class="pill ${(TS[s]||["",""])[1]}">${(TS[s]||[s])[0]}</span>`;
const X='<button type="button" class="x" data-a="closesheet" aria-label="Close">×</button>';

// ---------- customer: ticket list ----------
V.support=async t=>{
 if(!S.user)return paint(t,A.login());
 const{data,error}=await sb.from("tickets").select("*").eq("user_id",S.user.id).order("last_message_at",{ascending:false}).limit(50);
 if(error)return paint(t,'<div class="box ctr"><p>Couldn’t load your tickets.</p></div>');
 paint(t,`<div class="box hero">${astroPose("guide",80)}<div><b>Need help?</b><p>Open a ticket and chat with our team. Typical reply: within a few hours.</p></div></div>
 <button class="btn p" data-a="newticket">+ New ticket</button>
 <h3>My tickets</h3>${data.length?data.map(k=>`<button class="item" data-a="openticket" data-id="${k.id}"><span><b>#${k.number} ${esc(k.subject)}</b><br><small class="lk">${k.assigned_name?esc(k.assigned_name)+" · ":""}${when(k.last_message_at)}</small></span>${tpill(k.status)}</button>`).join(""):'<p class="en">No tickets yet.</p>'}`);
};
act.openticket=el=>openTicket(el.dataset.id);
act.newticket=()=>newTicket();
act.help=el=>newTicket(el.dataset.id);        // "Need help with this order?" button in the order sheet

// ---------- customer: new ticket form ----------
async function newTicket(orderId){
 const{data}=await sb.from("orders").select("id,number,product_name").eq("user_id",S.user.id).order("created_at",{ascending:false}).limit(20);
 sheet(`${X}<h2>New ticket</h2><form data-f="newticket">
 <label for="tc">Topic</label><select id="tc"><option value="order">An order</option><option value="payment">A payment / top-up</option><option value="account">My account</option><option value="other">Something else</option></select>
 <label for="to">Related order (optional)</label><select id="to"><option value="">None</option>${(data||[]).map(o=>`<option value="${o.id}" ${o.id===orderId?"selected":""}>#AV-${o.number} · ${esc(o.product_name)}</option>`).join("")}</select>
 <label for="ts">Subject</label><input id="ts" maxlength="120" required><label for="tb">Message</label><textarea id="tb" rows="4" maxlength="2000" required></textarea>
 <div style="height:12px"></div><button class="btn p">Send</button></form><p id="tkm" class="au-m" style="color:#dc2626"></p>`);
 if(orderId)$("tc").value="order";
}
form.newticket=async()=>{
 try{const id=await rpc("create_ticket",{p_subject:$("ts").value,p_category:$("tc").value,p_body:$("tb").value,p_order_id:$("to").value||null});
  closeSheet();pop("Ticket sent");openTicket(id);if(location.hash==="#/support")A.route()}
 catch(e){$("tkm").textContent=emsg(e)}
};

// ---------- chat window (customer AND staff) ----------
let CH=null;      // current chat: {id, channel, timer}
function stopChat(){if(!CH)return;clearInterval(CH.timer);if(CH.channel)sb.removeChannel(CH.channel);CH=null}
async function load(id){
 const[tr,mr]=await Promise.all([sb.from("tickets").select("*").eq("id",id).maybeSingle(),sb.from("ticket_messages").select("*").eq("ticket_id",id).order("id").limit(300)]);
 return{t:tr.data,m:mr.data||[]};
}
function head(t){
 const staffView=A.rank()>=1&&t.user_id!==S.user.id,closed=t.status==="closed";
 let acts="";
 if(staffView){
  if(!t.assigned_to&&!closed)acts+=`<button class="btn p" data-a="tclaim" data-id="${t.id}">Claim this ticket</button> `;
  if(t.status!=="resolved"&&!closed)acts+=`<button class="btn" data-a="tstatus" data-id="${t.id}" data-s="resolved">Resolve</button> `;
  if(!closed)acts+=`<button class="btn" data-a="tstatus" data-id="${t.id}" data-s="closed">Close</button>`;
  if(closed||t.status==="resolved")acts+=` <button class="btn" data-a="tstatus" data-id="${t.id}" data-s="open">Reopen</button>`;
 }else if(!closed)acts=`<button class="btn" data-a="tstatus" data-id="${t.id}" data-s="closed">Close ticket</button>`;
 return `<b class="wt-w">#${t.number} ${esc(t.subject)}</b><p class="lk">${esc(t.customer_name)} · ${esc(t.category)}${t.order_label?" · "+esc(t.order_label):""}</p>
  <p>${tpill(t.status)} <span class="lk">${t.assigned_name?"Agent: "+esc(t.assigned_name):"Waiting for an agent"}</span></p>${acts?`<div class="row">${acts}</div>`:""}`;
}
function log(m){return m.map(x=>x.kind==="system"?`<div class="msg sys">${esc(x.body)}</div>`:`<div class="msg${x.sender_id===S.user.id?" me":""}"><small>${esc(x.sender_name||"")} · ${when(x.created_at)}</small>${esc(x.body)}</div>`).join("")}
async function refresh(){
 if(!CH||!$("chatbox"))return stopChat();
 const{t,m}=await load(CH.id);if(!t)return;const box=$("chatbox"),atEnd=box.scrollHeight-box.scrollTop-box.clientHeight<60;
 $("chathead").innerHTML=head(t);box.innerHTML=log(m);if(atEnd)box.scrollTop=box.scrollHeight;
 const f=$("chatform");if(f)f.style.display=t.status==="closed"?"none":"";
}
async function openTicket(id){
 stopChat();const{t,m}=await load(id);if(!t)return pop("Ticket not found");
 sheet(`${X}<div id="chathead">${head(t)}</div><div class="chat" id="chatbox">${log(m)}</div>
  <form data-f="tmsg" id="chatform" data-id="${id}" ${t.status==="closed"?'style="display:none"':""}><textarea id="tm" rows="2" maxlength="2000" placeholder="Write a message…  (Enter to send)"></textarea><div style="height:8px"></div><button class="btn p">Send</button></form>`);
 const box=$("chatbox");box.scrollTop=box.scrollHeight;
 CH={id,timer:setInterval(refresh,12000),     // poll as a safety net; Realtime below makes it feel live
     channel:sb.channel("tk-"+id)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"ticket_messages",filter:"ticket_id=eq."+id},refresh)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"tickets",filter:"id=eq."+id},refresh).subscribe()};
}
A.openTicket=openTicket;
form.tmsg=async f=>{const b=$("tm"),v=b.value.trim();if(!v)return;b.value="";
 try{await rpc("ticket_reply",{p_ticket:f.dataset.id,p_body:v});await refresh()}catch(e){b.value=v;pop(emsg(e))}};
document.addEventListener("keydown",e=>{if(e.target.id==="tm"&&e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("chatform").requestSubmit()}});
act.tclaim=async el=>{try{await rpc("claim_ticket",{p_ticket:el.dataset.id});await refresh();if(location.hash==="#/staff")A.route()}catch(e){pop(emsg(e));refresh()}};
act.tstatus=async el=>{try{await rpc("set_ticket_status",{p_ticket:el.dataset.id,p_status:el.dataset.s});await refresh()}catch(e){pop(emsg(e))}};

// ---------- notification bell ----------
let NCH=null,NT=null;
const setBell=n=>{$("bell").textContent="🔔"+(n?" "+n:"")};
async function refreshBell(){if(!S.user)return;const{count}=await sb.from("notifications").select("id",{count:"exact",head:true}).is("read_at",null);setBell(count||0)}
A.onAuth=u=>{                                   // called by app.js whenever the logged-in user changes
 clearInterval(NT);if(NCH){sb.removeChannel(NCH);NCH=null}stopChat();setBell(0);if(!u)return;
 refreshBell();NT=setInterval(refreshBell,45000);
 NCH=sb.channel("n-"+u.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:"user_id=eq."+u.id},p=>{refreshBell();A.loadProfile().then(()=>A.chrome());if(location.hash==="#/orders")A.route();pop("🔔 "+((p.new&&p.new.title)||"New notification"))}).subscribe();
};
act.bell=async()=>{
 const{data}=await sb.from("notifications").select("*").order("created_at",{ascending:false}).limit(25);
 sheet(`${X}<h2>Notifications</h2>${(data||[]).map(n=>`<button class="nt${n.read_at?"":" un"}" data-a="nlink" data-l="${esc(n.link||"")}"><b>${esc(n.title)}</b><br><small class="lk">${esc(n.body)} · ${when(n.created_at)}</small></button>`).join("")||'<p class="en">Nothing yet.</p>'}`);
 rpc("mark_notifications_read").then(()=>setBell(0)).catch(()=>{});
};
// link formats: ticket:<id> | staff:<tab> | orders | wallet | account
act.nlink=el=>{const l=el.dataset.l||"";closeSheet();
 if(l.startsWith("ticket:"))return openTicket(l.slice(7));
 if(l.startsWith("staff:")){A.staffTab=l.slice(6);location.hash="#/staff";return}
 if(l)location.hash="#/"+l};
})();
