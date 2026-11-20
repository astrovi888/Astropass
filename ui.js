/* AstroVault UI LAYER (ui.js): theme switch, sliding pills, skeleton loaders, 1-tap copy, payment guide, support pill.
   Pure add-on: it only watches the page and decorates it, so checkout / auth / wallet logic in app.js is untouched. */
(function(){
"use strict";
const A=window.AV;if(!A)return;
const $=id=>document.getElementById(id),root=document.documentElement;
const reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;

// 1) THEME: Auto / Light / Dark segmented switch with a sliding thumb (uses the same av_theme key as the Account page)
const modes=["auto","light","dark"],icons={auto:"🖥️",light:"☀️",dark:"🌙"};
const cur=()=>localStorage.getItem("av_theme")||"auto";
function setTheme(v){try{localStorage.setItem("av_theme",v)}catch(e){}if(v==="auto")delete root.dataset.theme;else root.dataset.theme=v;paintSw();const s=$("th");if(s)s.value=v;
 const m=document.querySelector('meta[name=theme-color]');if(m)m.content=getComputedStyle(root).getPropertyValue("--bg").trim()||"#09090b"}
function paintSw(){const sw=$("thsw");if(!sw)return;sw.querySelector("i").style.transform="translateX("+(modes.indexOf(cur())*30)+"px)"}
const hr=document.querySelector(".hr");
if(hr&&!$("thsw")){const d=document.createElement("div");d.className="thsw";d.id="thsw";d.setAttribute("role","group");d.setAttribute("aria-label","Theme");
 d.innerHTML="<i></i>"+modes.map(m=>`<button type="button" data-th="${m}" aria-label="${m}">${icons[m]}</button>`).join("");hr.prepend(d);paintSw();
 d.addEventListener("click",e=>{const b=e.target.closest("[data-th]");if(b)setTheme(b.dataset.th)})}
document.addEventListener("change",e=>{if(e.target.id==="th")paintSw()});

// 2) PAGE ENTER animation only on navigation (not on every live refresh)
const app=$("app");
function enter(){if(!app||reduce)return;app.classList.remove("enter");void app.offsetWidth;app.classList.add("enter");setTimeout(()=>app.classList.remove("enter"),700)}
addEventListener("hashchange",enter);

// 3) SKELETONS: show layout-matched placeholders instantly while a page loads (replaced by the real paint)
const SK={shop:'<div class="sk l"></div><div class="skgrid"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>',
 orders:'<div class="sk l"></div><div class="sk l"></div><div class="sk l"></div>',wallet:'<div class="sk l" style="height:110px"></div><div class="sk l"></div><div class="sk l"></div>'};
["shop","orders","wallet"].forEach(k=>{const f=A.V[k];if(!f)return;A.V[k]=async function(t){if(app&&!app.querySelector(".pcard,.item,.sk"))app.innerHTML=SK[k];return f.apply(this,arguments)}});

// 4) SLIDING PILL under the category chips (follows the .on chip, springs between them)
function pill(){const c=$("cats");if(!c)return;let p=c.querySelector(".cpill");if(!p){p=document.createElement("span");p.className="cpill";c.prepend(p);c.classList.add("has-pill")}
 const on=c.querySelector(".chip.on");if(!on)return;p.style.width=on.offsetWidth+"px";p.style.transform="translateX("+on.offsetLeft+"px)";if(!p.dataset.i){p.dataset.i=1;p.style.transition="none";requestAnimationFrame(()=>p.style.transition="")}}
new MutationObserver(()=>pill()).observe(document.body,{subtree:true,attributes:true,attributeFilter:["class"],childList:true});
addEventListener("resize",pill);

// 5) 1-TAP COPY: instant optimistic "✓ Copied" on any copy button (the original handler still copies and shows the toast)
document.addEventListener("click",e=>{const b=e.target.closest('[data-a="copyel"],[data-cp]');if(!b||b.classList.contains("done"))return;
 const o=b.textContent;b.classList.add("done");b.textContent="✓ Copied";if(navigator.vibrate)try{navigator.vibrate(12)}catch(x){}
 if(b.dataset.cp){navigator.clipboard&&navigator.clipboard.writeText(b.dataset.cp).catch(()=>{})}
 setTimeout(()=>{b.classList.remove("done");b.textContent=o},1500)},true);

// 6) PAYMENT SHEET upgrade: copy pill for the exact amount + a 3-step guide, added whenever the payment details change
const GUIDE={binance_pay:["Open Binance → Pay → Send","Enter the Pay ID (tap Copy) and send USDT","Come back and tap “I’ve paid” with a screenshot"],
 pay_id:["Open the payment app","Scan the QR or paste the ID, send the exact amount","Come back and send your proof"],
 crypto:["Copy the address below","Send ONLY the coin shown, on the network shown","Come back and send your proof (hash or screenshot)"],
 address:["Copy the address below","Send ONLY the coin shown, on the network shown","Come back and send your proof (hash or screenshot)"],
 bank:["Copy the account details","Send the exact amount from your bank or D17 app","Come back and send your receipt"],
 def:["Follow the payment details above","Send the exact amount","Come back and send your proof"]};
let busy=0;
function decoratePay(){const i=$("tinfo");if(!i||busy||i.querySelector(".guide")||!i.textContent.trim())return;
 if(i.querySelector("#kov,.steps")&&!i.querySelector(".cred,.qr"))return;     // identity check still showing: no guide yet
 busy=1;try{const m=(A.S&&A.S.meth)||"",kind=(i.querySelector(".cred")?(/Binance/i.test(i.textContent)?"binance_pay":/network/i.test(i.textContent)?"crypto":/Bank|holder/i.test(i.textContent)?"bank":"pay_id"):"def"),g=GUIDE[kind]||GUIDE.def;
  const tn=$("tndv");if(tn&&tn.textContent.trim()&&!tn.dataset.pill){tn.dataset.pill=1;const v=tn.textContent.replace(/[^0-9.,]/g,"");if(v){tn.insertAdjacentHTML("afterend",`<button type="button" class="chip" data-cp="${v}" aria-label="Copy amount">Copy amount</button>`)}}
  i.insertAdjacentHTML("beforeend",`<div class="guide">${g.map(x=>"<div>"+x+"</div>").join("")}</div><span class="vbadge">🔒 Every payment is verified before it is added</span>`)}finally{busy=0}}
new MutationObserver(()=>{if($("tinfo"))decoratePay()}).observe(document.body,{subtree:true,childList:true});

// 7) FLOATING live-support pill (Telegram), hidden on the Help page
function sup(){let a=$("supill");const h=/^#\/support/.test(location.hash);
 if(!a){a=document.createElement("a");a.id="supill";a.className="sup";a.target="_blank";a.rel="noopener";a.innerHTML="💬 <span>Live support</span>";document.body.appendChild(a)}
 const s=A.store||{},tg=(s.contact_telegram||(A.C&&A.C.CONTACT&&A.C.CONTACT.telegram)||"@AXTROVIII").replace(/^@/,"");a.href="https://t.me/"+encodeURIComponent(tg);a.style.display=h?"none":""}
sup();addEventListener("hashchange",sup);setInterval(sup,4000);

enter();
})();
