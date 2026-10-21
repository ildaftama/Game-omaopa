'use strict';
import {getApps,getApp,initializeApp} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js';
import {getFirestore,doc,getDoc,onSnapshot,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js';
const app=getApps().some(a=>a.name==='[DEFAULT]')?getApp():initializeApp({apiKey:'AIzaSyAJ8gae4YgP8FOk1VAA6EC2dFlwhzhV9wg',authDomain:'oma-opa-game.firebaseapp.com',projectId:'oma-opa-game',appId:'1:737187594894:web:07e8fdd4dbb2e5fa903fdf'});
const auth=getAuth(app),db=getFirestore(app),gate=document.getElementById('forecast-access-gate'),root=document.getElementById('forecast-app');
let loaded=false,loading=null,generation=0,roleStop=null;
const privateRef=key=>doc(db,'forecastPlans',key);
const globals=['OUTLET_DATA','INSIGHT_DATA','POPULATION_DATA','TRAFFIC_BASELINE_DATA','RADAR_GOOGLE_MAPS_KEY','ANALYSIS_DATA','OUTLET_INTELLIGENCE','FORECAST_EVALUATION','FORECAST_REALIZED_PRICES','PERFORMANCE_SUMMARY','WASTE_ESB_SUMMARY','REVENUE_VALIDATION','REVENUE_TREND_2026','REVENUE_TREND_2025','DATA_SOURCES','ORDERS_SUMMARY','NETWORK_PRODUCTS','FORECAST_HISTORY','FORECAST_HISTORY_REVENUE'];
async function unpack(p){
 if(p.schemaVersion!==2||!Array.isArray(p.chunks)||!p.chunks.length||p.chunks.length>10||p.chunks.some(s=>typeof s!=='string'||s.length>700000)||!/^\w{64}$/.test(p.sha256))throw Error('package');
 const bytes=Uint8Array.from(atob(p.chunks.join('')),c=>c.charCodeAt(0)),raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==p.sha256)throw Error('checksum');
 const bundle=JSON.parse(new TextDecoder().decode(raw));if(bundle.schemaVersion!==1||!bundle.globals||!bundle.files?.['pcs-sales.json']||!bundle.files?.['pcs-orders.json'])throw Error('bundle');return bundle;
}
async function loadPrivate(){
 const manifest=await getDoc(privateRef('reference_current'));if(!manifest.exists())throw Error('missing-private-data');const m=manifest.data();
 const chunks=await Promise.all(m.chunks.map(key=>getDoc(privateRef(key))));if(chunks.some(s=>!s.exists()))throw Error('missing-chunk');
 const bundle=await unpack({...m,chunks:chunks.map(s=>s.data().payload)});
 for(const name of globals)if(Object.hasOwn(bundle.globals,name))window[name]=bundle.globals[name];window.ForecastSecureData=bundle.files;window.ForecastStudy=bundle.study;
}
function importer(){const card=gate.querySelector('.forecast-login-card');if(!window.ForecastRolePolicy.manager(window.ForecastAuth?.role)||!card)return;card.insertAdjacentHTML('beforeend','<p>Data privat belum tersedia.</p><button type="button" data-private-import>Pilih paket data privat</button><input id="private-package" type="file" accept=".json" hidden><span id="private-import-status" role="status"></span>');}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function locked(message,login=false){root.hidden=true;gate.hidden=false;gate.innerHTML=`<div class="forecast-login-card"><span class="forecast-login-brand">OMA OPA CAKERY</span><h1>Forecast</h1><p>${esc(message)}</p>${login?'<form id="forecast-login"><label>Nomor HP<input name="phone" autocomplete="username" inputmode="tel" required></label><label>PIN<input name="pin" type="password" autocomplete="current-password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><button type="submit">Masuk</button><span id="forecast-login-status" role="status"></span></form>':'<button type="button" data-gate-retry>Coba lagi</button>'}${auth.currentUser?'<button class="forecast-login-secondary" type="button" data-gate-signout>Ganti akun</button>':''}<small>Khusus Admin, Admin Utama, dan Master.</small></div>`;}
async function loadApp(){if(loaded)return;if(loading)return loading;loading=(async()=>{for(const tag of document.querySelectorAll('script[data-forecast-src]'))await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=tag.dataset.forecastSrc;s.onload=resolve;s.onerror=()=>reject(Error('load'));document.head.appendChild(s);});loaded=true;})();return loading;}
onAuthStateChanged(auth,async user=>{const run=++generation;roleStop?.();root.hidden=true;gate.hidden=false;
 if(loaded){location.reload();return;}
 if(!user){locked('Masuk untuk membuka perencanaan dan data outlet.',true);return;}
 locked('Memeriksa akses akun…');
 try{const staff=await getDoc(doc(db,'staff',user.uid));if(run!==generation)return;const role=staff.exists()?staff.data():null;
  if(!window.ForecastRolePolicy.allowed(role)){locked('Akun ini belum memiliki akses ke halaman Forecast.');return;}
  window.ForecastAuth={uid:user.uid,role};roleStop=onSnapshot(doc(db,'staff',user.uid),s=>{if(!window.ForecastRolePolicy.allowed(s.exists()?s.data():null)){root.hidden=true;gate.hidden=false;locked('Akses akun ini sudah dinonaktifkan.');}},()=>{root.hidden=true;locked('Akses akun belum dapat diperiksa. Muat ulang halaman.');});
  await loadPrivate();await loadApp();if(run!==generation)return;gate.hidden=true;root.hidden=false;
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
