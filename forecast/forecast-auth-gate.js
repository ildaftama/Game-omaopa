'use strict';
import {getApps,getApp,initializeApp} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,onSnapshot,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
const app=getApps().some(a=>a.name==='[DEFAULT]')?getApp():initializeApp({apiKey:'AIzaSyAJ8gae4YgP8FOk1VAA6EC2dFlwhzhV9wg',authDomain:'oma-opa-game.firebaseapp.com',projectId:'oma-opa-game',appId:'1:737187594894:web:07e8fdd4dbb2e5fa903fdf'});
const auth=getAuth(app),db=getFirestore(app),gate=document.getElementById('forecast-access-gate'),root=document.getElementById('forecast-app');
let loaded=false,loading=null,generation=0,roleStop=null,liveStop=null,officeStop=null,boostStop=null,bundleSha=null,bundleSrc=null,dataStop=null,pendingData=false,pendingCode=false,lastAct=Date.now(),refreshing=false;
// Layar pemuatan (owner 2026-11-23): progres mengikuti tahap yang benar-benar berjalan (akun, unduh
// data per bagian, buka data, modul per file, tampilan). Perkiraan waktu dari pemuatan sebelumnya
// di perangkat ini. Di dalam satu tahap bar tetap bergerak pelan, tapi tidak melewati batas tahapnya.
const FL_KEY='omaopa-load-ms-v1',FL_STEPS=['Memeriksa akun','Mengunduh data penjualan','Membuka data','Memuat modul','Menyiapkan tampilan'];let fl=null;
const nextPaint=()=>new Promise(r=>{let done=false;const go=()=>{if(!done){done=true;r();}};requestAnimationFrame(()=>setTimeout(go,0));setTimeout(go,120);}); // tab belakang: rAF berhenti, jadi ada batas waktu
function flExpected(){try{const a=JSON.parse(localStorage.getItem(FL_KEY)||'[]').filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null;}catch{return null;}}
function flDraw(){if(!fl)return;const q=id=>document.getElementById(id),el=performance.now()-fl.t0;fl.v=Math.min(fl.cap,fl.v+Math.max(.02,(fl.cap-fl.v)*.035));const p=Math.min(100,fl.v),n=Math.floor(p),fill=q('fl-fill'),bar=q('fl-bar');if(!fill)return;fill.style.transform=`scaleX(${p/100})`;q('fl-pct').textContent=n+'%';bar.setAttribute('aria-valuenow',String(n));
 let left=null;if(p>=25)left=el*(100-p)/p;else if(fl.exp)left=Math.max(2000,fl.exp-el);q('fl-eta').textContent=p>=100?'Selesai':left==null?'Menghitung perkiraan waktu…':left<=1500?(p>=85?'Hampir selesai…':'Sekitar 2 detik lagi'):`Sekitar ${Math.ceil(left/1000)} detik lagi`;q('fl-slow').hidden=!(p<100&&el>Math.max(30000,(fl.exp||0)*1.6));}
function startLoader(){stopLoader();gate.innerHTML=`<div class="forecast-login-card fl-card"><span class="forecast-login-brand">OMA OPA CAKERY</span><h1>Forecast</h1><div class="fl-head"><b id="fl-label">${FL_STEPS[0]}</b><strong id="fl-pct">0%</strong></div><div id="fl-bar" class="fl-bar" role="progressbar" aria-label="Memuat Forecast" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="fl-fill"></i></div><div class="fl-meta"><span id="fl-detail">Menghubungkan akun Anda</span><span id="fl-eta">Menghitung perkiraan waktu…</span></div><ol class="fl-steps">${FL_STEPS.map((t,i)=>`<li data-fl="${i}"><i></i><span>${t}</span></li>`).join('')}</ol><p id="fl-slow" class="fl-slow" hidden>Koneksi sedang lambat, data masih dimuat. Halaman ini tidak macet.</p></div>`;fl={t0:performance.now(),v:1,cap:3,exp:flExpected(),timer:setInterval(flDraw,160)};flStage(0,1,3,'Menghubungkan akun Anda');}
function flStage(i,v,cap,detail){if(!fl)return;fl.v=Math.max(fl.v,v);fl.cap=Math.max(fl.v,cap);const l=document.getElementById('fl-label'),d=document.getElementById('fl-detail');if(l)l.textContent=FL_STEPS[i];if(d)d.textContent=detail;gate.querySelectorAll('[data-fl]').forEach(x=>{const n=Number(x.dataset.fl);x.classList.toggle('done',n<i);x.classList.toggle('on',n===i);});flDraw();}
function stopLoader(){if(fl)clearInterval(fl.timer);fl=null;}
async function finishLoader(){if(!fl)return;const ms=performance.now()-fl.t0;fl.v=100;fl.cap=100;gate.querySelectorAll('[data-fl]').forEach(x=>{x.classList.remove('on');x.classList.add('done');});const d=document.getElementById('fl-detail');if(d)d.textContent='Forecast siap dibuka';flDraw();try{const a=JSON.parse(localStorage.getItem(FL_KEY)||'[]').filter(Number.isFinite);a.push(Math.round(ms));localStorage.setItem(FL_KEY,JSON.stringify(a.slice(-5)));}catch{}await new Promise(r=>setTimeout(r,240));stopLoader();}
const privateRef=key=>doc(db,'forecastPlans',key);
const briefRef=key=>doc(db,'forecastBriefs',key);
const globals=['OUTLET_DATA','INSIGHT_DATA','POPULATION_DATA','TRAFFIC_BASELINE_DATA','RADAR_GOOGLE_MAPS_KEY','ANALYSIS_DATA','OUTLET_INTELLIGENCE','FORECAST_EVALUATION','FORECAST_REALIZED_PRICES','PERFORMANCE_SUMMARY','WASTE_ESB_SUMMARY','REVENUE_VALIDATION','REVENUE_TREND_2026','REVENUE_TREND_2025','DATA_SOURCES','ORDERS_SUMMARY','NETWORK_PRODUCTS','FORECAST_HISTORY','FORECAST_HISTORY_REVENUE','DAILY_RECAP_SUMMARY','CUSTOMER_DEMOGRAPHICS','FORECAST_MODEL_SPLIT','STOCK_DAILY','WASTE_LOST_ITEMS'];
async function unpack(p){
 if(p.schemaVersion!==2||!Array.isArray(p.chunks)||!p.chunks.length||p.chunks.length>10||p.chunks.some(s=>typeof s!=='string'||s.length>700000)||!/^\w{64}$/.test(p.sha256))throw Error('package');
 const bytes=Uint8Array.from(atob(p.chunks.join('')),c=>c.charCodeAt(0)),raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==p.sha256)throw Error('checksum');
 const bundle=JSON.parse(new TextDecoder().decode(raw));if(bundle.schemaVersion!==1||!bundle.globals||!bundle.files?.['pcs-sales.json']||!bundle.files?.['pcs-orders.json'])throw Error('bundle');return bundle;
}
// Forecaster-only accounts load a separate, non-financial manifest (forecastBriefs) instead
// of the full private bundle — same gzip/sha256 mechanism, a smaller set of globals/files.
// Omzet hari berjalan per jam: dokumen kecil terpisah, dibaca setelah web terbuka dan ikut berubah saat ada tarikan baru.
async function decodeLive(d,kind='intraday-live'){const bytes=Uint8Array.from(atob(d.payload),c=>c.charCodeAt(0)),raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==d.sha256)throw Error('checksum');const x=JSON.parse(new TextDecoder().decode(raw));if(x.kind!==kind||(kind==='intraday-live'&&!Array.isArray(x.rows)))throw Error('live');return x;}
function watchLive(){dataStop?.();dataStop=bundleSrc?onSnapshot(bundleSrc.ref(bundleSrc.key),s=>{const sha=s.exists()?s.data().sha256:null;if(sha&&sha!==bundleSha)pendingData=true;},()=>{}):null;liveStop?.();liveStop=onSnapshot(privateRef('reference_0000000000000000_0'),async s=>{if(!s.exists())return;try{window.ForecastLiveIntraday=await decodeLive(s.data());window.dispatchEvent(new Event('forecast-intraday'));}catch{}},()=>{});officeStop?.();officeStop=onSnapshot(privateRef('reference_0000000000000001_0'),async s=>{if(!s.exists())return;try{window.ForecastOfficeData=await decodeLive(s.data(),'office');window.dispatchEvent(new Event('forecast-office-data'));}catch{}},()=>{});boostStop?.();boostStop=onSnapshot(privateRef('reference_0000000000000002_0'),async s=>{if(!s.exists())return;try{window.ForecastStockBoost=await decodeLive(s.data(),'stock-boost');window.dispatchEvent(new Event('forecast-operations-changed'));}catch{}},()=>{});}
const officeClient=Math.random().toString(36).slice(2,12);
window.ForecastOfficeControl={listen(cb){return onSnapshot(collection(db,'officeState'),snap=>{snap.docChanges().forEach(c=>{if(c.type==='removed'||c.doc.metadata.hasPendingWrites)return;const d=c.doc.data();cb({id:c.doc.id,act:d.act,x:d.x,y:d.y,at:d.at?.toMillis?.()||0,own:d.cid===officeClient});});},()=>{});},send(id,act,x,y){if(!auth.currentUser)return;setDoc(doc(db,'officeState',id),{act,x,y,at:serverTimestamp(),by:auth.currentUser.uid,cid:officeClient}).catch(()=>{});}};
window.ForecastOfficeSaveLink=async sheetId=>{const cur=window.ForecastOfficeData,uid=auth.currentUser?.uid;if(!cur||!uid||!window.ForecastRolePolicy.manager(window.ForecastAuth?.role))throw Error('role');const raw=new TextEncoder().encode(JSON.stringify({...cur,sheetId,scheduleOk:null,updatedAt:new Date().toISOString()})),gz=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');let bin='';for(const b of gz)bin+=String.fromCharCode(b);const batch=writeBatch(db);batch.set(privateRef('reference_0000000000000001_0'),{schemaVersion:2,kind:'reference-chunk',payload:btoa(bin),sha256,updatedAt:serverTimestamp(),updatedBy:uid});await batch.commit();};
async function loadPrivate(role){
 const lean=window.ForecastRolePolicy.forecasterOnly(role),ref=lean?briefRef:privateRef,key=lean?'forecaster_current':'reference_current';
 flStage(1,5,7,'Mengambil daftar data');const manifest=await getDoc(ref(key));if(!manifest.exists())throw Error('missing-private-data');const m=manifest.data();bundleSha=m.sha256;bundleSrc={ref,key};
 let got=0;const total=m.chunks.length;flStage(1,7,7+11/Math.max(total,1),`Bagian 0 dari ${total}`);const chunks=await Promise.all(m.chunks.map(k=>getDoc(ref(k)).then(x=>{got++;flStage(1,7+11*got/total,7+11*Math.min(total,got+1)/total,`Bagian ${got} dari ${total}`);return x;})));if(chunks.some(s=>!s.exists()))throw Error('missing-chunk');flStage(2,18,22,'Memeriksa dan membuka data');await nextPaint();
 const bundle=await unpack({...m,chunks:chunks.map(s=>s.data().payload)});
 for(const name of globals)if(Object.hasOwn(bundle.globals,name))window[name]=bundle.globals[name];window.ForecastSecureData=bundle.files;window.ForecastStudy=bundle.study;
}
function importer(){const card=gate.querySelector('.forecast-login-card');if(!window.ForecastRolePolicy.manager(window.ForecastAuth?.role)||!card)return;card.insertAdjacentHTML('beforeend','<p>Data privat belum tersedia.</p><button type="button" data-private-import>Pilih paket data privat</button><input id="private-package" type="file" accept=".json" hidden><span id="private-import-status" role="status"></span>');}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function locked(message,login=false){stopLoader();root.hidden=true;gate.hidden=false;gate.innerHTML=`<div class="forecast-login-card"><span class="forecast-login-brand">OMA OPA CAKERY</span><h1>Forecast</h1><p>${esc(message)}</p>${login?'<form id="forecast-login"><label>Nomor HP<input name="phone" autocomplete="username" inputmode="tel" required></label><label>PIN<input name="pin" type="password" autocomplete="current-password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><button type="submit">Masuk</button><span id="forecast-login-status" role="status"></span></form>':'<button type="button" data-gate-retry>Coba lagi</button>'}${auth.currentUser?'<button class="forecast-login-secondary" type="button" data-gate-signout>Ganti akun</button>':''}<small>Khusus Admin, Admin Utama, Master, dan Forecaster.</small></div>`;}
// Unduh modul bersamaan dengan data setelah akses terverifikasi. Hanya mengunduh, belum dijalankan.
function preloadApp(){for(const tag of document.querySelectorAll('script[data-forecast-src]')){const l=document.createElement('link');l.rel='preload';l.as='script';l.href=tag.dataset.forecastSrc;document.head.appendChild(l);}}
async function loadApp(){if(loaded)return;if(loading)return loading;loading=(async()=>{const tags=[...document.querySelectorAll('script[data-forecast-src]')],N=tags.length,M=Math.max(N-1,1);let done=0;flStage(3,22,22+56/M,`Modul 0 dari ${N-1}`);await nextPaint();await Promise.all(tags.map(tag=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=tag.dataset.forecastSrc;s.async=false;s.onload=()=>{done++;if(done>=N-1)flStage(4,78,99,'Menyusun dashboard, mohon tunggu');else flStage(3,22+56*done/M,22+56*(done+1)/M,`Modul ${done} dari ${N-1}`);resolve();};s.onerror=()=>reject(Error('load'));document.head.appendChild(s);})));loaded=true;})();return loading;}
onAuthStateChanged(auth,async user=>{const run=++generation;
 // Firebase bisa memanggil callback ini lebih dari sekali saat baru login (mis. hasil
 // pemeriksaan sesi tersimpan yang telat selesai). Kalau kejadiannya user=null padahal
 // sebelumnya sempat ada user (bukan pemuatan halaman pertama kali), tunggu sebentar lalu cek
 // ulang auth.currentUser langsung -- kalau ternyata masih login, abaikan gema basi ini supaya
 // tidak menampilkan form login lagi padahal baru saja berhasil masuk.
 if(!user&&generation>1){await new Promise(r=>setTimeout(r,300));if(run!==generation)return;if(auth.currentUser)user=auth.currentUser;}
 roleStop?.();dataStop?.();dataStop=null;pendingData=false;liveStop?.();liveStop=null;officeStop?.();officeStop=null;boostStop?.();boostStop=null;delete window.ForecastStockBoost;delete window.ForecastLiveIntraday;delete window.ForecastOfficeData;root.hidden=true;gate.hidden=false;
 if(loaded){location.reload();return;}
 if(!user){locked('Masuk untuk membuka perencanaan dan data outlet.',true);return;}
 startLoader();
 try{flStage(0,2,5,'Memeriksa hak akses');const staff=await getDoc(doc(db,'staff',user.uid));if(run!==generation)return;const role=staff.exists()?staff.data():null;
  if(!window.ForecastRolePolicy.planner(role)){locked('Akun ini belum memiliki akses ke halaman Forecast.');return;}
  window.ForecastAuth={uid:user.uid,role};roleStop=onSnapshot(doc(db,'staff',user.uid),s=>{if(!window.ForecastRolePolicy.planner(s.exists()?s.data():null)){root.hidden=true;gate.hidden=false;locked('Akses akun ini sudah dinonaktifkan.');}},()=>{root.hidden=true;locked('Akses akun belum dapat diperiksa. Muat ulang halaman.');});
  preloadApp();await loadPrivate(role);await loadApp();if(run!==generation)return;await finishLoader();if(run!==generation)return;gate.hidden=true;root.hidden=false;watchLive();
 }catch(e){if(run===generation){locked(e.message==='missing-private-data'?'Akun terverifikasi. Data privat sedang disiapkan.':'Data belum dapat dibuka. Periksa koneksi dan coba lagi.');importer();}}
});
gate.addEventListener('submit',async e=>{if(e.target.id!=='forecast-login')return;e.preventDefault();const form=e.target,button=form.querySelector('button'),status=document.getElementById('forecast-login-status');let phone=form.elements.phone.value.replace(/\D/g,'');if(phone.startsWith('0'))phone='62'+phone.slice(1);else if(phone.startsWith('8'))phone='62'+phone;button.disabled=true;status.textContent='Memeriksa akun…';try{await signInWithEmailAndPassword(auth,phone+'@phone.omaopa.fun',form.elements.pin.value);}catch{status.textContent='Nomor HP atau PIN tidak cocok, atau koneksi sedang bermasalah.';button.disabled=false;}});
gate.addEventListener('click',e=>{if(e.target.closest('[data-gate-signout]'))signOut(auth);if(e.target.closest('[data-gate-retry]'))location.reload();if(e.target.closest('[data-private-import]'))document.getElementById('private-package').click();});
gate.addEventListener('change',async e=>{if(e.target.id!=='private-package'||!e.target.files[0])return;const status=document.getElementById('private-import-status');try{
 if(!window.ForecastRolePolicy.manager(window.ForecastAuth?.role)||!auth.currentUser)throw Error('role');status.textContent='Memeriksa paket…';const p=JSON.parse(await e.target.files[0].text());await unpack(p);
 const batch=writeBatch(db),keys=p.chunks.map((payload,i)=>{const key='reference_'+p.sha256.slice(0,16)+'_'+i;batch.set(privateRef(key),{schemaVersion:2,kind:'reference-chunk',payload,sha256:p.sha256,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});return key;});
 batch.set(privateRef('reference_current'),{schemaVersion:2,kind:'reference-manifest',chunks:keys,sha256:p.sha256,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});await batch.commit();status.textContent='Data privat tersimpan. Membuka Forecast…';location.reload();
 }catch{status.textContent='Paket belum tersimpan. Periksa format, izin, dan koneksi.';}});
document.addEventListener('click',e=>{if(e.target.closest('[data-forecast-signout]'))signOut(auth);});
// Penyegaran diam-diam (owner 2026-11-24). Data baru dipasang tanpa memuat ulang halaman setelah
// pengguna diam 1 menit. Versi web baru memuat ulang halaman hanya setelah lama diam, lalu tab dan
// posisi scroll dikembalikan. Draft Buat forecast tersimpan di browser, jadi tidak hilang.
const IDLE_DATA=60e3,IDLE_CODE=15*60e3,CHECK_CODE=10*60e3,NO_RELOAD=['settings','access','sources'];
for(const ev of ['pointerdown','keydown','wheel','touchstart','input','scroll'])window.addEventListener(ev,()=>{lastAct=Date.now();},{passive:true,capture:true});
function busy(){const a=document.activeElement;if(a?.matches?.('input,textarea,select,[contenteditable="true"]'))return true;if(document.querySelector('.wl-confirm,.fp-del-panel,.method-gate,dialog[open]'))return true;return [...document.querySelectorAll('[data-ft-save]')].some(b=>/Menyimpan/.test(b.textContent));}
async function silentData(){
 const src=bundleSrc,m=(await getDoc(src.ref(src.key))).data();if(!m||m.sha256===bundleSha){pendingData=false;return;}
 const parts=await Promise.all(m.chunks.map(k=>getDoc(src.ref(k))));if(parts.some(s=>!s.exists()))return;
 const bundle=await unpack({...m,chunks:parts.map(s=>s.data().payload)});if(busy()||Date.now()-lastAct<IDLE_DATA)return;
 for(const name of globals)if(Object.hasOwn(bundle.globals,name))window[name]=bundle.globals[name];window.ForecastSecureData=bundle.files;window.ForecastStudy=bundle.study;bundleSha=m.sha256;pendingData=false;
 const y=scrollY;window.dispatchEvent(new Event('forecast-data-refreshed'));setTimeout(()=>{if(Math.abs(scrollY-y)>2)scrollTo(0,y);},400);
}
const codeSet=()=>new Set([...document.querySelectorAll('[data-forecast-src],[src],[href]')].map(e=>e.getAttribute('data-forecast-src')||e.getAttribute('src')||e.getAttribute('href')||'').filter(v=>v.includes('?v=')));
async function checkCode(){try{const t=await(await fetch(location.pathname+'?vcheck='+Date.now(),{cache:'no-store'})).text(),have=codeSet(),want=[...t.matchAll(/(?:data-forecast-src|src|href)="([^"]+\?v=[^"]+)"/g)].map(x=>x[1]);if(want.length>5&&want.some(v=>!have.has(v)))pendingCode=true;}catch{}}
let codeAt=Date.now()-CHECK_CODE+60e3;
setInterval(async()=>{
 if(!loaded||refreshing||root.hidden)return;const idle=Date.now()-lastAct;
 if(!pendingCode&&Date.now()-codeAt>CHECK_CODE){codeAt=Date.now();await checkCode();}
 if(pendingCode&&idle>(document.hidden?2*60e3:IDLE_CODE)&&!busy()&&!NO_RELOAD.includes(window.ForecastFocus?.())){try{sessionStorage.setItem('forecast-restore',JSON.stringify({focus:window.ForecastFocus?.(),scroll:scrollY,at:Date.now()}));}catch{}location.reload();return;}
 if(pendingData&&bundleSrc&&idle>IDLE_DATA&&!busy()){refreshing=true;try{await silentData();}catch{}finally{refreshing=false;}}
},20e3);
